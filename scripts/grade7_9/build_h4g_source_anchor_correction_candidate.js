#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  TARGET_GRADE_BANDS,
  countInto,
  countRows,
  markdownCell,
  normalizeText,
  readJson,
  recordsByGroup,
  shortHash,
  subjectFiles,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'
import { SUBJECTS } from './config.js'

const CONTRACT_VERSION = 'H4G_SOURCE_ANCHOR_CORRECTION_CONTRACT_v1'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_ANCHOR_SOURCE = 'generated/grade7_9_chinese_curated/mapped/chinese.json'
const DEFAULT_OUT_DIR = 'generated/h4g_source_anchor_correction'

const CHINESE_CANONICAL_DOMAINS = new Set(['表达与交流', '梳理与探究', '识字与写字', '阅读与鉴赏'])

const CHINESE_DOMAIN_TO_CANONICAL = {
  '识字与写字': '识字与写字',
  '语言文字积累与梳理': '识字与写字',
  '阅读与鉴赏': '阅读与鉴赏',
  '文学阅读与创意表达': '阅读与鉴赏',
  '实用性阅读与交流': '阅读与鉴赏',
  '思辨性阅读与表达': '阅读与鉴赏',
  '整本书阅读': '阅读与鉴赏',
  '表达与交流': '表达与交流',
  '梳理与探究': '梳理与探究',
  '跨学科学习': '梳理与探究',
  '学业质量': '梳理与探究'
}

const CHINESE_QUALITY_SUBDOMAIN_TO_CATEGORY = {
  '识字写字与语言积累表现': '识字与写字',
  '讨论、信息阅读与证据判断': '表达与交流',
  '议论阅读与写作表达表现': '表达与交流',
  '热点问题与活动设计表现': '梳理与探究',
  '文学作品阅读与审美表现': '阅读与鉴赏',
  '文化作品推荐与探究表现': '阅读与鉴赏',
  '跨学科学习与研究成果表现': '梳理与探究'
}

const GRADE_LABEL = {
  H4G7: '七年级',
  H4G8: '八年级',
  H4G9: '九年级'
}

function parseArgs(argv) {
  const args = {
    anchorSource: DEFAULT_ANCHOR_SOURCE,
    dataRoot: DEFAULT_DATA_ROOT,
    outDir: DEFAULT_OUT_DIR,
    strict: false,
    subject: 'chinese'
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--anchor-source') args.anchorSource = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out-dir') args.outDir = argv[++i]
    else if (item === '--subject') args.subject = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:h4g-source-anchor-correction-candidate -- --subject chinese --strict

Builds a dry-run source-anchor correction candidate. The first supported pilot
is Chinese. The script writes only under generated/ and never modifies
public/data.`)
}

function isH4G(record) {
  return TARGET_GRADE_BANDS.includes(record.grade_band)
}

function readSubjectPayloads(dataRoot) {
  const payloads = new Map()
  for (const file of subjectFiles(dataRoot)) {
    payloads.set(basename(file, '.json'), readJson(file))
  }
  return payloads
}

function ensureScaffold(sourceRoot, targetRoot) {
  mkdirSync(targetRoot, { recursive: true })
  for (const file of readdirSync(sourceRoot).filter(item => item.endsWith('.json'))) {
    copyFileSync(join(sourceRoot, file), join(targetRoot, file))
  }
  const indexesDir = join(sourceRoot, 'indexes')
  if (existsSync(indexesDir)) {
    mkdirSync(join(targetRoot, 'indexes'), { recursive: true })
    for (const file of readdirSync(indexesDir).filter(item => item.endsWith('.json'))) {
      copyFileSync(join(indexesDir, file), join(targetRoot, 'indexes', file))
    }
  }
}

function uniqueBy(items, keyFn) {
  const out = []
  const seen = new Set()
  for (const item of items) {
    const key = keyFn(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function chineseQualityAnchors(anchorSource) {
  const payload = readJson(anchorSource)
  const rows = Array.isArray(payload) ? payload : payload.standards || []
  const qualityRows = rows.filter(record => (
    record.subject_slug === 'chinese' &&
    record.domain === '学业质量' &&
    normalizeText(record.context).includes('第四学段学业质量描述') &&
    normalizeText(record.standard)
  ))

  return uniqueBy(qualityRows, record => normalizeText(record.standard)).map(record => {
    const category = CHINESE_QUALITY_SUBDOMAIN_TO_CATEGORY[record.subdomain] || '梳理与探究'
    const anchorId = `cn-h4-quality-${shortHash(`${record.subdomain}\n${record.standard}`, 10)}`
    return {
      anchor_id: anchorId,
      allowed_use: 'primary_source_anchor',
      category,
      source_grade_range: '7-9',
      source_record_codes: qualityRows
        .filter(row => normalizeText(row.standard) === normalizeText(record.standard))
        .map(row => row.code)
        .sort((a, b) => String(a).localeCompare(String(b))),
      source_section_type: '学业质量描述',
      source_standard_original: record.standard,
      subcategory: record.subdomain,
      subject: '语文',
      subject_slug: 'chinese'
    }
  }).sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory))
}

function canonicalChineseDomain(record) {
  return CHINESE_DOMAIN_TO_CANONICAL[record.domain] || (
    normalizeText(record.domain).includes('表达') ? '表达与交流' :
      normalizeText(record.domain).includes('写字') ? '识字与写字' :
        normalizeText(record.domain).includes('阅读') ? '阅读与鉴赏' :
          '梳理与探究'
  )
}

function textForScoring(record) {
  return [
    record.domain,
    record.subdomain,
    record.standard,
    record.source_standard_original,
    record.grade_specific_focus,
    record.practice,
    record.context
  ].map(normalizeText).filter(Boolean).join('。')
}

function grams(text) {
  const cleaned = normalizeText(text).replace(/[^\p{Script=Han}A-Za-z0-9]+/gu, '')
  const values = new Set()
  for (let i = 0; i < cleaned.length - 1; i += 1) {
    const gram = cleaned.slice(i, i + 2)
    if (gram.length === 2) values.add(gram)
  }
  return values
}

function overlapScore(record, anchor) {
  const recordGrams = grams(textForScoring(record))
  const anchorGrams = grams(`${anchor.category} ${anchor.subcategory} ${anchor.source_standard_original}`)
  if (!recordGrams.size || !anchorGrams.size) return 0
  let hits = 0
  for (const gram of recordGrams) {
    if (anchorGrams.has(gram)) hits += 1
  }
  const smaller = Math.min(recordGrams.size, anchorGrams.size)
  return Number((hits / smaller).toFixed(4))
}

function selectAnchor(record, anchors) {
  const canonical = canonicalChineseDomain(record)
  const preferred = anchors.filter(anchor => anchor.category === canonical)
  const candidates = preferred.length ? preferred : anchors
  const ranked = candidates
    .map(anchor => ({ anchor, score: overlapScore(record, anchor) }))
    .sort((a, b) => b.score - a.score || a.anchor.anchor_id.localeCompare(b.anchor.anchor_id))
  const best = ranked[0]
  const second = ranked[1]
  const margin = best && second ? best.score - second.score : best?.score || 0
  const confidence = Number(Math.max(0.42, Math.min(0.91, 0.56 + (best?.score || 0) * 0.42 + Math.max(0, margin) * 0.12)).toFixed(2))
  return {
    anchor: best?.anchor,
    canonical_category: canonical,
    confidence,
    score: best?.score || 0,
    second_score: second?.score || 0
  }
}

function gradeSpecificFocus(record, anchor) {
  const gradeLabel = GRADE_LABEL[record.grade_band] || record.grade || record.grade_band
  return `候选：${gradeLabel}保留当前“${record.subdomain || record.domain}”的年级化表现；source anchor v2 将共同原文校准为“${anchor.subcategory}”（${anchor.category}，学业质量描述），旧内容要求仅作为 supporting evidence。`
}

function correctedRecord(record, selection) {
  const anchor = selection.anchor
  const changedDomain = record.domain !== selection.canonical_category
  const previousSource = record.source_standard_original
  return {
    ...record,
    domain: selection.canonical_category,
    grade_specific_focus: gradeSpecificFocus(record, anchor),
    previous_domain: changedDomain ? record.domain : record.previous_domain,
    previous_source_standard_original: previousSource,
    previous_source_standard_scope: record.source_standard_scope,
    previous_subdomain: record.previous_subdomain,
    source_anchor_category: anchor.category,
    source_anchor_correction_confidence: selection.confidence,
    source_anchor_correction_contract_version: CONTRACT_VERSION,
    source_anchor_correction_method: 'chinese_academic_quality_anchor_bigrams_with_domain_constraint',
    source_anchor_correction_rationale: `Primary source anchor corrected from previous source scope ${record.source_standard_scope || 'unknown'} to Chinese fourth-stage academic quality description. The current grade-level standard is preserved for review because prior G7/G8/G9 differentiation is acceptable.`,
    source_anchor_correction_status: 'source_anchor_corrected_dry_run_needs_review',
    source_anchor_id: anchor.anchor_id,
    source_anchor_match_score: selection.score,
    source_anchor_second_match_score: selection.second_score,
    source_anchor_subcategory: anchor.subcategory,
    source_section_type: anchor.source_section_type,
    source_standard_original: anchor.source_standard_original,
    source_standard_scope: 'official_2022_chinese_h4_academic_quality',
    standard_source_alignment_status: selection.confidence < 0.68 ? 'needs_human_review_after_anchor_swap' : 'candidate_aligned_after_anchor_swap',
    supporting_source_section_type: 'previous_publication_source_anchor_or_content_requirement',
    supporting_source_standard_original: previousSource
  }
}

function buildReviewMarkdown(result) {
  const low = result.candidates.filter(item => item.source_anchor_correction_confidence < 0.68)
  const samples = []
  for (const category of Object.keys(result.summary.by_category).sort((a, b) => a.localeCompare(b))) {
    const item = result.candidates.find(candidate => candidate.source_anchor_category === category)
    if (item) samples.push(item)
  }

  return `# H4G Source Anchor Correction Review - Chinese Pilot

Generated at: ${result.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${result.valid} |
| subject | ${result.subject_slug} |
| H4G records | ${result.summary.h4g_records} |
| corrected records | ${result.summary.corrected_records} |
| source anchors | ${result.summary.source_anchors} |
| progression groups | ${result.summary.progression_groups} |
| low confidence records | ${result.summary.low_confidence_records} |
| public writes | ${result.writes_public_data} |
| errors | ${result.errors.length} |
| warnings | ${result.warnings.length} |

## Category Coverage

| Category | Records |
| --- | ---: |
${countRows(result.summary.by_category)}

## Anchor Coverage

| Anchor | Category | Records |
| --- | --- | ---: |
${result.anchor_coverage.map(row => `| ${markdownCell(row.source_anchor_subcategory)} | ${markdownCell(row.source_anchor_category)} | ${row.records} |`).join('\n')}

## Low Confidence Review

${low.length ? low.slice(0, 40).map(item => `- ${item.code}: ${markdownCell(item.previous_domain)} -> ${markdownCell(item.source_anchor_category)} / ${markdownCell(item.source_anchor_subcategory)} (${item.source_anchor_correction_confidence})`).join('\n') : '- none'}

## Category Samples

${samples.map(item => `### ${item.source_anchor_category}

- code: ${item.code}
- previous domain: ${markdownCell(item.previous_domain || item.source_anchor_category)}
- subdomain: ${markdownCell(item.subdomain)}
- corrected anchor: ${markdownCell(item.source_anchor_subcategory)}
- previous source: ${markdownCell(item.previous_source_standard_original)}
- corrected source: ${markdownCell(item.source_standard_original)}
- standard: ${markdownCell(item.standard)}
`).join('\n')}

## Errors

${result.errors.length ? result.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${result.warnings.length ? result.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  const warnings = []

  if (args.subject !== 'chinese') {
    errors.push('Only --subject chinese is supported in v1 pilot')
  }
  if (!existsSync(args.dataRoot)) errors.push(`Missing data root: ${args.dataRoot}`)
  if (!existsSync(args.anchorSource)) errors.push(`Missing anchor source: ${args.anchorSource}`)

  const payloads = errors.length ? new Map() : readSubjectPayloads(args.dataRoot)
  const subjectPayload = payloads.get(args.subject)
  if (!subjectPayload) errors.push(`Missing subject payload: ${args.subject}`)

  const anchors = errors.length ? [] : chineseQualityAnchors(args.anchorSource)
  if (args.subject === 'chinese') {
    const categories = new Set(anchors.map(anchor => anchor.category))
    for (const category of CHINESE_CANONICAL_DOMAINS) {
      if (!categories.has(category)) errors.push(`Missing Chinese quality anchor category: ${category}`)
    }
  }

  const h4gRows = subjectPayload ? (subjectPayload.standards || []).filter(isH4G) : []
  const corrected = []
  const byCategory = {}
  const byAnchor = {}
  let lowConfidence = 0

  for (const record of h4gRows) {
    const selection = selectAnchor(record, anchors)
    if (!selection.anchor) {
      errors.push(`${record.code} could not select source anchor`)
      continue
    }
    const next = correctedRecord(record, selection)
    corrected.push(next)
    countInto(byCategory, next.source_anchor_category)
    countInto(byAnchor, next.source_anchor_id)
    if (next.source_anchor_correction_confidence < 0.68) lowConfidence += 1
  }

  if (h4gRows.length !== 156) errors.push(`Chinese H4G pilot expected 156 records, found ${h4gRows.length}`)
  if (corrected.length !== h4gRows.length) errors.push(`Corrected record count mismatch: ${corrected.length}/${h4gRows.length}`)
  for (const record of corrected) {
    if (!record.previous_source_standard_original) errors.push(`${record.code} missing previous_source_standard_original`)
    if (record.source_section_type !== '学业质量描述') errors.push(`${record.code} source_section_type must be 学业质量描述`)
    if (!CHINESE_CANONICAL_DOMAINS.has(record.source_anchor_category)) errors.push(`${record.code} invalid source_anchor_category: ${record.source_anchor_category}`)
    if (!record.source_anchor_id) errors.push(`${record.code} missing source_anchor_id`)
  }

  const groups = recordsByGroup(corrected)
  for (const [groupId, rows] of groups) {
    const bands = new Set(rows.map(row => row.grade_band))
    if (rows.length !== 3 || TARGET_GRADE_BANDS.some(band => !bands.has(band))) {
      errors.push(`${groupId} is not a complete H4G triplet after correction`)
    }
  }

  const candidatePayload = subjectPayload ? {
    ...subjectPayload,
    data_scope: 'h4g_source_anchor_correction_chinese_dry_run',
    h4g_source_anchor_correction_contract_version: CONTRACT_VERSION,
    h4g_source_anchor_correction_status: 'dry_run_needs_review',
    h4g_source_anchor_correction_generated_at: new Date().toISOString(),
    publication_candidate: false,
    writes_public_data: false,
    standards: (subjectPayload.standards || []).map(record => {
      if (!isH4G(record)) return record
      return corrected.find(item => item.code === record.code) || record
    })
  } : null

  const anchorCoverage = anchors.map(anchor => ({
    records: byAnchor[anchor.anchor_id] || 0,
    source_anchor_category: anchor.category,
    source_anchor_id: anchor.anchor_id,
    source_anchor_subcategory: anchor.subcategory
  }))

  const result = {
    anchor_coverage: anchorCoverage,
    candidates: corrected,
    contract_version: CONTRACT_VERSION,
    errors,
    generated_at: new Date().toISOString(),
    source_anchor_registry: anchors,
    subject_slug: args.subject,
    summary: {
      by_category: byCategory,
      corrected_records: corrected.length,
      h4g_records: h4gRows.length,
      low_confidence_records: lowConfidence,
      progression_groups: groups.size,
      source_anchors: anchors.length
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }

  mkdirSync(args.outDir, { recursive: true })
  const dataCandidateRoot = join(args.outDir, 'data_candidate')
  if (existsSync(args.dataRoot) && candidatePayload) {
    ensureScaffold(args.dataRoot, dataCandidateRoot)
    mkdirSync(join(dataCandidateRoot, 'by_subject'), { recursive: true })
    writeJson(join(dataCandidateRoot, 'by_subject', `${args.subject}.json`), candidatePayload)
  }

  writeJson(join(args.outDir, 'source_anchor_registry_v2.json'), {
    contract_version: CONTRACT_VERSION,
    generated_at: result.generated_at,
    source_anchor_registry: anchors,
    subject_slug: args.subject,
    writes_public_data: false
  })
  writeJson(join(args.outDir, 'source_anchor_correction_candidates.json'), result)
  writeJson(join(args.outDir, 'source_anchor_correction_audit.json'), {
    contract_version: CONTRACT_VERSION,
    errors,
    generated_at: result.generated_at,
    summary: result.summary,
    valid: result.valid,
    warnings,
    writes_public_data: false
  })
  writeText(join(args.outDir, 'source_anchor_correction_review.md'), buildReviewMarkdown(result))

  return result
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const result = build(args)
console.log(JSON.stringify({
  corrected_records: result.summary.corrected_records,
  h4g_records: result.summary.h4g_records,
  low_confidence_records: result.summary.low_confidence_records,
  progression_groups: result.summary.progression_groups,
  source_anchors: result.summary.source_anchors,
  valid: result.valid,
  warnings: result.warnings.length,
  writes_public_data: result.writes_public_data
}, null, 2))

if (!result.valid && args.strict) {
  process.exitCode = 1
}

