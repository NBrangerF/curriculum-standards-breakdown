#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_MATCHES = 'generated/textbook_evidence/textbook_unit_standard_matches.json'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_candidate.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_candidate_summary.md'
const DEFAULT_MAX_UNITS = 6
const OFFICIAL_STANDARD_FIELDS = [
  'domain',
  'subdomain',
  'standard',
  'context',
  'practice',
  'teaching_tip',
  'assessment_evidence_type'
]

function parseArgs(argv) {
  const args = {
    matches: DEFAULT_MATCHES,
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    maxUnits: DEFAULT_MAX_UNITS,
    strict: false,
    requireCandidates: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--matches') args.matches = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--max-units') args.maxUnits = Number(argv[++i]) || args.maxUnits
    else if (item === '--strict') args.strict = true
    else if (item === '--require-candidates') args.requireCandidates = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_unit_evidence_candidate.js \\
  --matches generated/textbook_evidence/textbook_unit_standard_matches.json

Builds a reviewable H4G unit-evidence candidate pack from eligible textbook unit
matches. This script never writes to public/data; it prepares proposed record
updates for review or a future apply step.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function pct(numerator, denominator) {
  if (!denominator) return 0
  return Number((numerator / denominator).toFixed(4))
}

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadStandardsByCode(dataRoot) {
  const byCode = new Map()
  for (const file of subjectFiles(dataRoot)) {
    const payload = readJson(file)
    for (const record of payload.standards || []) {
      if (record.code) byCode.set(record.code, record)
    }
  }
  return byCode
}

function compactMatchedFields(fields) {
  const seen = new Set()
  const out = []
  for (const field of fields || []) {
    const key = `${field.field}|${field.keyword}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      field: field.field,
      keyword: field.keyword,
      field_excerpt: field.field_excerpt
    })
  }
  return out
}

function unitEvidenceFromMatch(match) {
  return {
    unit_evidence_id: match.unit_evidence_id,
    textbook_evidence_id: match.textbook_evidence_id,
    unit_title: match.unit_title,
    unit_candidate_type: match.candidate_type,
    evidence_granularity: match.evidence_granularity,
    edition: match.edition,
    volume: match.volume,
    textbook_subject: match.textbook_subject,
    repository_path: match.repository_path,
    evidence_url: match.evidence_url,
    page_start: match.page_start ?? null,
    page_end: match.page_end ?? null,
    page_range: match.page_range || '',
    page_range_status: match.page_range_status || '',
    toc_page_source: match.toc_page_source || '',
    toc_raw_line: match.toc_raw_line || '',
    toc_source_order: match.toc_source_order ?? null,
    pdf_page_hint: match.pdf_page_hint ?? null,
    match_id: match.match_id,
    match_type: match.match_type,
    score: match.score,
    confidence_band: match.confidence_band,
    matched_keywords: match.matched_keywords || [],
    matched_fields: compactMatchedFields(match.matched_fields),
    subdomain_alignment: match.subdomain_alignment,
    field_alignment: match.field_alignment,
    eligible_alignment: match.eligible_alignment,
    rationale: match.rationale
  }
}

function officialStandardFields(record) {
  return Object.fromEntries(OFFICIAL_STANDARD_FIELDS.map(field => [field, record[field] ?? '']))
}

function cleanInline(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function markdownCell(value) {
  return cleanInline(value).replace(/\|/g, '\\|')
}

function shortText(value, length = 140) {
  const text = cleanInline(value)
  return text.length > length ? `${text.slice(0, length)}...` : text
}

function shortMarkdownCell(value, length = 140) {
  return markdownCell(shortText(value, length))
}

function unitAlignments(units) {
  return [...new Set((units || []).map(unit => unit.eligible_alignment || 'missing'))]
}

function unitKeywords(units) {
  const keywords = []
  for (const unit of units || []) {
    keywords.push(...(unit.matched_keywords || []))
    keywords.push(...(unit.field_alignment?.matched_keywords || []))
  }
  return [...new Set(keywords.filter(Boolean))]
}

function proposedFocus(record, units) {
  const titles = units.map(unit => unit.unit_title).slice(0, 3)
  const label = titles.map(title => `《${title}》`).join('、')
  return `候选：基于${record.grade || record.grade_band}教材单元${label}补充本年级学习重点；课标原文保持不变。`
}

function proposedProgressionDelta(units) {
  const titles = units.map(unit => unit.unit_title).slice(0, 4).join('；')
  return `unit_evidence_candidate:${titles}`
}

function buildCandidate(record, matches, args) {
  const units = matches
    .slice()
    .sort((a, b) => {
      const score = b.score - a.score
      if (score !== 0) return score
      return String(a.unit_title || '').localeCompare(String(b.unit_title || ''))
    })
    .slice(0, args.maxUnits)
    .map(unitEvidenceFromMatch)
  const maxScore = Math.max(...units.map(unit => unit.score || 0))
  const unitIds = units.map(unit => unit.unit_evidence_id)

  return {
    candidate_id: `h4g_unit_${hashText(`${record.code}|${unitIds.join('|')}`)}`,
    standard_code: record.code,
    subject_slug: record.subject_slug,
    grade_band: record.grade_band,
    grade_level: record.grade_level,
    grade: record.grade,
    domain: record.domain,
    subdomain: record.subdomain,
    official_standard_fields: officialStandardFields(record),
    standard_text_role: record.standard_text_role || 'source_standard_original',
    source_standard_scope: record.source_standard_scope || '',
    current_record_status: {
      grade_assignment_type: record.grade_assignment_type || '',
      progression_basis: record.progression_basis || '',
      review_status: record.review_status || '',
      standard_variant_type: record.standard_variant_type || '',
      evidence_granularity: record.evidence_granularity || '',
      requires_unit_level_evidence: record.requires_unit_level_evidence ?? null,
      textbook_unit_evidence_ids: record.textbook_unit_evidence_ids || [],
      progression_delta: record.progression_delta || ''
    },
    proposed_update: {
      textbook_unit_evidence_ids: unitIds,
      evidence_granularity: 'textbook_unit_level',
      grade_assignment_type: 'shared_requirement_textbook_unit_supported',
      progression_basis: 'shared_standard_textbook_unit_sequence',
      progression_confidence: Number(Math.min(0.72, Math.max(0.5, maxScore * 0.72)).toFixed(3)),
      requires_unit_level_evidence: false,
      review_status: 'unit_evidence_candidate_needs_review',
      grade_specific_focus: proposedFocus(record, units),
      progression_delta: proposedProgressionDelta(units)
    },
    unit_evidence: units,
    safety: {
      writes_public_data: false,
      official_standard_text_changed: false,
      requires_manual_review: true,
      eligible_gate: 'toc_unit_or_chapter + eligible score + subdomain anchor or strong field alignment'
    }
  }
}

function groupEligible(matches) {
  const groups = new Map()
  for (const match of matches || []) {
    if (!match.eligible_for_h4g_differentiation) continue
    if (!match.subdomain_alignment?.matched && !match.field_alignment?.matched) continue
    if (match.candidate_type !== 'toc_unit_or_chapter') continue
    const key = match.standard_code
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(match)
  }
  return groups
}

function markdownSummary(payload) {
  const gradeRows = Object.entries(payload.summary.by_grade_band)
    .map(([grade, count]) => `| ${grade} | ${count} |`)
    .join('\n') || '| - | 0 |'
  const subjectRows = Object.entries(payload.summary.by_subject)
    .map(([subject, count]) => `| ${subject} | ${count} |`)
    .join('\n') || '| - | 0 |'
  const alignmentRows = Object.entries(payload.summary.by_eligible_alignment)
    .map(([alignment, count]) => `| ${alignment} | ${count} |`)
    .join('\n') || '| - | 0 |'
  const pageStatusRows = Object.entries(payload.summary.by_page_range_status || {})
    .map(([status, count]) => `| ${status} | ${count} |`)
    .join('\n') || '| - | 0 |'
  const candidateRows = payload.candidates
    .map(candidate => {
      const units = candidate.unit_evidence.map(unit => {
        const page = unit.page_range ? ` p.${unit.page_range}` : ''
        return `${unit.unit_title}${page}`
      }).join('；')
      const alignments = unitAlignments(candidate.unit_evidence).join('；')
      return `| ${candidate.standard_code} | ${candidate.grade_band} | ${markdownCell(alignments)} | ${markdownCell(candidate.subdomain)} | ${candidate.unit_evidence.length} | ${markdownCell(units)} |`
    })
    .join('\n') || '| - | - | - | - | 0 | - |'
  const candidateDetails = payload.candidates
    .map(candidate => {
      const unitRows = candidate.unit_evidence
        .map(unit => {
          const matchedFields = [...new Set((unit.matched_fields || []).map(field => field.field))].join('、') || '-'
          const keywords = unitKeywords([unit]).slice(0, 10).join('、') || '-'
          return `| ${markdownCell(unit.unit_title)} | ${markdownCell(unit.page_range || '-')} | ${markdownCell(unit.page_range_status || '-')} | ${markdownCell(unit.eligible_alignment || '-')} | ${unit.score} | ${markdownCell(unit.confidence_band)} | ${markdownCell(matchedFields)} | ${markdownCell(keywords)} |`
        })
        .join('\n') || '| - | - | - | - | - | - | - | - |'
      return `### ${candidate.standard_code} ${candidate.grade_band}

| 项 | 内容 |
| --- | --- |
| domain | ${markdownCell(candidate.official_standard_fields?.domain)} |
| subdomain | ${markdownCell(candidate.official_standard_fields?.subdomain)} |
| official standard | ${shortMarkdownCell(candidate.official_standard_fields?.standard, 220)} |
| practice | ${shortMarkdownCell(candidate.official_standard_fields?.practice, 180)} |
| assessment | ${shortMarkdownCell(candidate.official_standard_fields?.assessment_evidence_type, 160)} |
| current status | ${markdownCell(`${candidate.current_record_status.review_status || ''} / ${candidate.current_record_status.evidence_granularity || ''}`)} |
| proposed status | ${markdownCell(`${candidate.proposed_update.review_status || ''} / ${candidate.proposed_update.evidence_granularity || ''}`)} |
| safety | official text unchanged; requires manual review |

| unit | page_range | page status | alignment | score | confidence | matched fields | matched keywords |
| --- | --- | --- | --- | ---: | --- | --- | --- |
${unitRows}
`
    })
    .join('\n')

  return `# H4G Unit Evidence Candidate Summary

生成时间：${payload.generated_at}

matches：\`${payload.matches_file}\`

数据根目录：\`${payload.data_root}\`

## 摘要

| 指标 | 数量 |
| --- | ---: |
| eligible matches | ${payload.summary.eligible_matches} |
| candidate standards | ${payload.summary.candidate_standards} |
| public records missing | ${payload.summary.missing_public_records} |
| standards already unit-level | ${payload.summary.already_unit_level_records} |
| unit evidence with page_start | ${payload.summary.page_start_records || 0} |
| unit evidence with page_range | ${payload.summary.page_range_records || 0} |

## Alignment 分布

| alignment | eligible unit matches |
| --- | ---: |
${alignmentRows}

## 页码状态分布

| page_range_status | unit evidence |
| --- | ---: |
${pageStatusRows}

## 年级分布

| grade_band | candidate standards |
| --- | ---: |
${gradeRows}

## 学科分布

| subject_slug | candidate standards |
| --- | ---: |
${subjectRows}

## 候选清单

| standard_code | grade_band | alignment | subdomain | unit matches | units |
| --- | --- | --- | --- | ---: | --- |
${candidateRows}

## 复核明细

${candidateDetails}

## 复核边界

- 该文件只是写回前候选包，不修改 \`public/data\`。
- \`official standard\` 等字段来自现有数据源，候选更新不会改写课标原文。
- \`grade_specific_focus\` 和 \`progression_delta\` 是候选说明，不是官方课标文本。
- 进入正式数据前仍需人工或更强规则复核，尤其是跨版本一致性和页码范围。
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  if (!existsSync(args.matches)) errors.push(`Missing matches file: ${args.matches}`)
  if (!existsSync(args.dataRoot)) errors.push(`Missing data root: ${args.dataRoot}`)
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors }, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const matchPayload = readJson(args.matches)
  const standardsByCode = loadStandardsByCode(args.dataRoot)
  const eligibleGroups = groupEligible(matchPayload.matches || [])
  const warnings = []
  const candidates = []
  const summary = {
    eligible_matches: [...eligibleGroups.values()].reduce((sum, rows) => sum + rows.length, 0),
    candidate_standards: 0,
    missing_public_records: 0,
    already_unit_level_records: 0,
    by_grade_band: {},
    by_subject: {},
    by_current_review_status: {},
    by_current_evidence_granularity: {},
    by_eligible_alignment: {},
    by_page_range_status: {},
    page_start_records: 0,
    page_range_records: 0
  }

  for (const [code, matches] of [...eligibleGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const record = standardsByCode.get(code)
    if (!record) {
      summary.missing_public_records += 1
      warnings.push(`${code} has eligible matches but no public record`)
      continue
    }
    const candidate = buildCandidate(record, matches, args)
    candidates.push(candidate)
    countInto(summary.by_grade_band, record.grade_band)
    countInto(summary.by_subject, record.subject_slug)
    countInto(summary.by_current_review_status, record.review_status)
    countInto(summary.by_current_evidence_granularity, record.evidence_granularity)
    for (const match of matches) countInto(summary.by_eligible_alignment, match.eligible_alignment || 'missing')
    for (const unit of candidate.unit_evidence) {
      if (unit.page_start) summary.page_start_records += 1
      if (unit.page_range) summary.page_range_records += 1
      countInto(summary.by_page_range_status, unit.page_range_status || 'missing')
    }
    if (record.evidence_granularity === 'textbook_unit_level') summary.already_unit_level_records += 1
  }
  summary.candidate_standards = candidates.length
  summary.candidate_rate_from_eligible_standards = pct(candidates.length, eligibleGroups.size)

  if (args.requireCandidates && !candidates.length) errors.push('requireCandidates is set but no candidates were produced')
  if (summary.missing_public_records) errors.push(`${summary.missing_public_records} eligible standard(s) are missing from public data`)

  const payload = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    matches_file: args.matches,
    data_root: args.dataRoot,
    match_source_commit: matchPayload.source_commit || null,
    policy: {
      writes_public_data: false,
      only_eligible_matches: true,
      official_standard_text_changed: false,
      max_units_per_standard: args.maxUnits
    },
    summary,
    candidates,
    warnings,
    errors
  }

  writeJson(args.out, payload)
  if (args.summaryOut) {
    mkdirSync(dirname(args.summaryOut), { recursive: true })
    writeFileSync(args.summaryOut, markdownSummary(payload))
  }
  console.log(JSON.stringify({
    valid: payload.valid,
    wrote: args.out,
    summary_out: args.summaryOut || null,
    ...summary,
    warnings: warnings.length,
    errors: errors.length
  }, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
