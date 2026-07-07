#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  TARGET_GRADE_BANDS,
  countInto,
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
import {
  SOURCE_ANCHOR_METHOD_VERSION,
  SOURCE_ANCHOR_REMAP_CONTRACT_VERSION,
  SUBJECT_CONTRACTS,
  SUBJECT_ORDER
} from './h4g_source_anchor_remap_contract.js'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_REVIEW_MATRIX = 'generated/h4g_subject_remap_differentiation/differentiation_review_matrix.json'
const DEFAULT_OUT_DIR = 'generated/h4g_source_anchor_remap_candidate'

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    outDir: DEFAULT_OUT_DIR,
    reviewMatrix: DEFAULT_REVIEW_MATRIX,
    strict: false,
    subject: 'all'
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out-dir') args.outDir = argv[++i]
    else if (item === '--review-matrix') args.reviewMatrix = argv[++i]
    else if (item === '--subject') args.subject = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:h4g-source-anchor-remap-candidate -- --strict

Builds an all-subject H4G source-anchor remap candidate from the dry-run review
matrix. It writes only under generated/ and never modifies public/data.`)
}

function selectedSubjects(subjectArg) {
  if (subjectArg === 'all') return SUBJECT_ORDER
  return subjectArg.split(',').map(item => item.trim()).filter(Boolean)
}

function isH4G(record) {
  return TARGET_GRADE_BANDS.includes(record.grade_band)
}

function copyJsonTree(sourceRoot, targetRoot) {
  mkdirSync(targetRoot, { recursive: true })
  for (const name of readdirSync(sourceRoot)) {
    const source = join(sourceRoot, name)
    const target = join(targetRoot, name)
    const stat = statSync(source)
    if (stat.isDirectory()) {
      copyJsonTree(source, target)
    } else if (name.endsWith('.json')) {
      copyFileSync(source, target)
    }
  }
}

function loadPayloads(dataRoot, errors) {
  const payloads = new Map()
  if (!existsSync(dataRoot)) {
    errors.push(`Missing data root: ${dataRoot}`)
    return payloads
  }
  for (const file of subjectFiles(dataRoot)) {
    payloads.set(basename(file, '.json'), readJson(file))
  }
  return payloads
}

function loadReviews(path, errors) {
  if (!existsSync(path)) {
    errors.push(`Missing review matrix: ${path}`)
    return new Map()
  }
  const payload = readJson(path)
  const rows = payload.group_reviews || []
  const reviews = new Map()
  for (const item of rows) {
    reviews.set(item.progression_group_id, item)
  }
  return reviews
}

function contractFor(subjectSlug) {
  return SUBJECT_CONTRACTS[subjectSlug] || { categories: [], required_tags: [], source_scope: `official_2022_${subjectSlug}` }
}

function sourceAlignmentStatus(review) {
  if (review.priority === 'P0') return 'blocked_after_source_anchor_remap'
  if (review.priority === 'P1') return 'needs_human_review_after_source_anchor_remap'
  if (review.priority === 'P2') return 'aligned_with_differentiation_followup'
  return 'candidate_aligned_after_source_anchor_remap'
}

function correctionRationale(record, review) {
  const anchor = review.anchor
  return [
    `Primary source anchor remapped to ${anchor.source_section_type}.`,
    `Product category set to ${review.source_anchor_category}.`,
    `G7/G8/G9 standard text and grade-specific focus were preserved from the published enrichment because differentiation review status is ${review.differentiation.status}.`,
    `Previous source text is retained as supporting evidence.`
  ].join(' ')
}

function remapRecord(record, review, subjectSlug) {
  const anchor = review.anchor
  const tags = anchor.tags || {}
  const contract = contractFor(subjectSlug)
  const previousDomain = record.domain
  const previousSubdomain = record.subdomain
  const previousSource = record.source_standard_original
  const next = {
    ...record,
    domain: review.source_anchor_category,
    previous_domain: previousDomain !== review.source_anchor_category ? previousDomain : record.previous_domain,
    previous_source_standard_original: previousSource,
    previous_source_standard_scope: record.source_standard_scope,
    previous_subdomain: previousSubdomain,
    source_anchor_category: review.source_anchor_category,
    source_anchor_correction_confidence: anchor.confidence,
    source_anchor_correction_contract_version: SOURCE_ANCHOR_REMAP_CONTRACT_VERSION,
    source_anchor_correction_method: 'all_subject_source_anchor_review_matrix_with_subject_constraints',
    source_anchor_correction_rationale: correctionRationale(record, review),
    source_anchor_correction_status: 'source_anchor_remap_candidate_needs_review',
    source_anchor_id: anchor.anchor_id,
    source_anchor_match_score: anchor.match_score,
    source_anchor_method_contract_version: SOURCE_ANCHOR_METHOD_VERSION,
    source_anchor_review_priority: review.priority,
    source_anchor_review_risk_reasons: review.differentiation.risk_reasons,
    source_anchor_second_match_score: anchor.second_match_score,
    source_anchor_subcategory: anchor.subcategory,
    source_anchor_tags: tags,
    source_section_type: anchor.source_section_type,
    source_standard_original: anchor.source_standard_original,
    source_standard_scope: contract.source_scope,
    standard_source_alignment_status: sourceAlignmentStatus(review),
    supporting_source_section_type: record.source_section_type || record.source_standard_scope || 'previous_public_source_anchor',
    supporting_source_standard_original: previousSource,
    source_anchor_remap_candidate_id: `sar-${shortHash(`${record.code}\n${anchor.anchor_id}\n${SOURCE_ANCHOR_METHOD_VERSION}`, 14)}`
  }
  for (const [tag, value] of Object.entries(tags)) {
    next[tag] = value
  }
  return next
}

function subjectMarkdown(subjectSlug, rows, summary) {
  const samples = rows.slice(0, 8)
  return `# H4G Source Anchor Remap Candidate - ${SUBJECTS[subjectSlug]?.subject || subjectSlug}

| Metric | Value |
| --- | ---: |
| H4G records | ${summary.h4g_records} |
| remapped records | ${summary.remapped_records} |
| progression groups | ${summary.progression_groups} |
| P0 | ${summary.by_priority.P0 || 0} |
| P1 | ${summary.by_priority.P1 || 0} |
| P2 | ${summary.by_priority.P2 || 0} |
| P3 | ${summary.by_priority.P3 || 0} |

## Category Coverage

| Category | Records |
| --- | ---: |
${Object.entries(summary.by_category).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `| ${markdownCell(key)} | ${value} |`).join('\n')}

## Samples

${samples.map(item => `### ${item.code}

- category: ${markdownCell(item.source_anchor_category)}
- anchor: ${markdownCell(item.source_anchor_subcategory)}
- confidence: ${item.source_anchor_correction_confidence}
- previous domain: ${markdownCell(item.previous_domain || item.domain)}
- previous source: ${markdownCell(item.previous_source_standard_original)}
- corrected source: ${markdownCell(item.source_standard_original)}
- standard: ${markdownCell(item.standard)}
`).join('\n')}
`
}

function overallMarkdown(result) {
  return `# H4G Source Anchor Remap Candidate

Generated at: ${result.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${result.valid} |
| subjects | ${result.summary.subjects} |
| H4G records | ${result.summary.h4g_records} |
| remapped records | ${result.summary.remapped_records} |
| progression groups | ${result.summary.progression_groups} |
| public writes | ${result.writes_public_data} |
| errors | ${result.errors.length} |
| warnings | ${result.warnings.length} |

## Subject Summary

| Subject | Records | Remapped | Groups | P0 | P1 | P2 | P3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${result.subjects.map(item => `| ${markdownCell(item.subject)} | ${item.summary.h4g_records} | ${item.summary.remapped_records} | ${item.summary.progression_groups} | ${item.summary.by_priority.P0 || 0} | ${item.summary.by_priority.P1 || 0} | ${item.summary.by_priority.P2 || 0} | ${item.summary.by_priority.P3 || 0} |`).join('\n')}

## Errors

${result.errors.length ? result.errors.map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}

## Warnings

${result.warnings.length ? result.warnings.map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  const warnings = []
  const subjects = selectedSubjects(args.subject)
  const payloads = loadPayloads(args.dataRoot, errors)
  const reviews = loadReviews(args.reviewMatrix, errors)
  const dataCandidateRoot = join(args.outDir, 'data_candidate')
  const allCandidates = []
  const subjectResults = []
  let h4gRecords = 0
  let remappedRecords = 0
  let progressionGroups = 0

  if (!errors.length) copyJsonTree(args.dataRoot, dataCandidateRoot)

  for (const subjectSlug of subjects) {
    const payload = payloads.get(subjectSlug)
    if (!payload) {
      errors.push(`Missing subject payload: ${subjectSlug}`)
      continue
    }
    const subjectErrors = []
    const byCategory = {}
    const byPriority = {}
    const rows = (payload.standards || []).filter(isH4G)
    const groups = recordsByGroup(rows)
    const candidates = []

    for (const [groupId, groupRows] of groups) {
      const review = reviews.get(groupId)
      if (!review) {
        subjectErrors.push(`${groupId} missing review matrix row`)
        continue
      }
      if (!review.anchor) {
        subjectErrors.push(`${groupId} missing source anchor`)
        continue
      }
      countInto(byPriority, review.priority)
      for (const record of groupRows) {
        const next = remapRecord(record, review, subjectSlug)
        candidates.push(next)
        countInto(byCategory, next.source_anchor_category)
      }
    }

    const candidateByCode = new Map(candidates.map(record => [record.code, record]))
    const nextPayload = {
      ...payload,
      h4g_source_anchor_method_contract_version: SOURCE_ANCHOR_METHOD_VERSION,
      h4g_source_anchor_remap_contract_version: SOURCE_ANCHOR_REMAP_CONTRACT_VERSION,
      h4g_source_anchor_remap_generated_at: new Date().toISOString(),
      h4g_source_anchor_remap_status: 'candidate_needs_audit',
      publication_candidate: true,
      writes_public_data: false,
      standards: (payload.standards || []).map(record => candidateByCode.get(record.code) || record)
    }
    writeJson(join(dataCandidateRoot, 'by_subject', `${subjectSlug}.json`), nextPayload)

    const summary = {
      by_category: byCategory,
      by_priority: byPriority,
      h4g_records: rows.length,
      progression_groups: groups.size,
      remapped_records: candidates.length
    }
    const subjectResult = {
      errors: subjectErrors,
      subject: SUBJECTS[subjectSlug]?.subject || subjectSlug,
      subject_slug: subjectSlug,
      summary,
      warnings: []
    }
    subjectResults.push(subjectResult)
    allCandidates.push(...candidates)
    h4gRecords += rows.length
    remappedRecords += candidates.length
    progressionGroups += groups.size
    errors.push(...subjectErrors)
    mkdirSync(join(args.outDir, 'by_subject'), { recursive: true })
    writeJson(join(args.outDir, 'by_subject', `${subjectSlug}.json`), {
      candidates,
      contract_version: SOURCE_ANCHOR_REMAP_CONTRACT_VERSION,
      generated_at: nextPayload.h4g_source_anchor_remap_generated_at,
      method_version: SOURCE_ANCHOR_METHOD_VERSION,
      summary,
      writes_public_data: false
    })
    writeText(join(args.outDir, 'by_subject', `${subjectSlug}_review.md`), subjectMarkdown(subjectSlug, candidates, summary))
  }

  const result = {
    candidates: allCandidates,
    contract_version: SOURCE_ANCHOR_REMAP_CONTRACT_VERSION,
    errors,
    generated_at: new Date().toISOString(),
    method_version: SOURCE_ANCHOR_METHOD_VERSION,
    subjects: subjectResults,
    summary: {
      h4g_records: h4gRecords,
      progression_groups: progressionGroups,
      remapped_records: remappedRecords,
      subjects: subjectResults.length
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }

  mkdirSync(args.outDir, { recursive: true })
  writeJson(join(args.outDir, 'source_anchor_remap_candidates.json'), result)
  writeJson(join(args.outDir, 'source_anchor_remap_candidate_audit.json'), {
    contract_version: result.contract_version,
    errors,
    generated_at: result.generated_at,
    method_version: result.method_version,
    summary: result.summary,
    valid: result.valid,
    warnings,
    writes_public_data: false
  })
  writeText(join(args.outDir, 'source_anchor_remap_candidate_review.md'), overallMarkdown(result))
  return result
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const result = build(args)
console.log(JSON.stringify({
  h4g_records: result.summary.h4g_records,
  progression_groups: result.summary.progression_groups,
  remapped_records: result.summary.remapped_records,
  subjects: result.summary.subjects,
  valid: result.valid,
  warnings: result.warnings.length,
  writes_public_data: result.writes_public_data
}, null, 2))

if (!result.valid && args.strict) process.exitCode = 1
