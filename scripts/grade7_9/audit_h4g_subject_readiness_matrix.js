#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/grade7_9_h4g_subject_readiness_matrix.json'
const DEFAULT_SUMMARY_OUT = 'generated/grade7_9_h4g_subject_readiness_matrix.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']
const TARGET_GRADE_SET = new Set(TARGET_GRADE_BANDS)
const CORE_TEXT_FIELDS = ['domain', 'subdomain', 'standard', 'context', 'practice', 'teaching_tip', 'assessment_evidence_type']
const SOURCE_TEXT_FIELDS = ['domain', 'subdomain', 'standard']
const APPROVED_REVIEW_STATUSES = new Set([
  'grade_differentiation_approved',
  'manual_grade_differentiation_approved',
  'manual_review_approved',
  'publication_approved',
  'unit_evidence_approved',
  'unit_evidence_reviewed'
])

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_h4g_subject_readiness_matrix.js \\
  --data-root public/data

Builds a compact subject-level H4G readiness matrix. This is a read-only
planning and QA aid; it does not mutate public data.`)
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

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function signature(record, fields) {
  return fields.map(field => normalizeText(record[field])).join('\n---\n')
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function pct(numerator, denominator) {
  if (!denominator) return 0
  return Number((numerator / denominator).toFixed(4))
}

function groupKey(record) {
  return record.progression_group_id || [
    record.subject_slug,
    normalizeText(record.domain),
    normalizeText(record.subdomain),
    normalizeText(record.standard)
  ].join('|')
}

function isH4GRecord(record) {
  return TARGET_GRADE_SET.has(record.grade_band)
}

function hasUnitLevelEvidence(record) {
  const evidence = [
    ...(Array.isArray(record.textbook_unit_evidence) ? record.textbook_unit_evidence : []),
    ...(Array.isArray(record.textbook_evidence) ? record.textbook_evidence : [])
  ]
  const hasUnitEvidenceIds = Array.isArray(record.textbook_unit_evidence_ids) && record.textbook_unit_evidence_ids.length > 0
  return evidence.some(item => (
    item.unit_evidence_id ||
    item.unit_title ||
    item.chapter_title ||
    item.section_title ||
    item.page_range ||
    item.page_start ||
    item.matched_keywords?.length
  )) || (record.evidence_granularity === 'textbook_unit_level' && hasUnitEvidenceIds)
}

function isPlaceholderFocus(value) {
  const text = normalizeText(value)
  return !text ||
    text.startsWith('待基于') ||
    text.includes('待基于') ||
    (text.includes('补充本年级专属学习重点') && !text.startsWith('候选：'))
}

function hasUsableGradeFocus(record) {
  return !isPlaceholderFocus(record.grade_specific_focus)
}

function isReviewApproved(record) {
  return APPROVED_REVIEW_STATUSES.has(String(record.review_status || ''))
}

function isReviewRejectedOrRevision(record) {
  const status = String(record.review_status || '')
  return status.includes('rejected') || status.includes('needs_revision')
}

function isFinalReady(record) {
  return hasUsableGradeFocus(record) && hasUnitLevelEvidence(record) && isReviewApproved(record)
}

function recordStatus(record) {
  if (isFinalReady(record)) return 'ready_grade_specific'
  if (isReviewRejectedOrRevision(record)) return 'rejected_or_needs_revision'
  if (hasUsableGradeFocus(record) && hasUnitLevelEvidence(record)) return 'candidate_needs_review'
  if (hasUsableGradeFocus(record)) return 'focus_without_unit_evidence'
  return 'placeholder_or_missing_focus'
}

function groupSummary(records) {
  const presentGradeBands = TARGET_GRADE_BANDS.filter(band => records.some(row => row.grade_band === band))
  const completeTriplet = presentGradeBands.length === TARGET_GRADE_BANDS.length
  const coreIdentical = completeTriplet && new Set(records.map(record => signature(record, CORE_TEXT_FIELDS))).size === 1
  const sourceIdentical = completeTriplet && new Set(records.map(record => signature(record, SOURCE_TEXT_FIELDS))).size === 1
  return {
    completeTriplet,
    coreIdentical,
    sourceIdentical,
    presentGradeBands,
    readyRecords: records.filter(isFinalReady).length,
    unitLevelRecords: records.filter(hasUnitLevelEvidence).length,
    usableFocusRecords: records.filter(hasUsableGradeFocus).length
  }
}

function classifyNextAction(stats) {
  if (!stats.h4g_records) return 'no_h4g_records'
  if (stats.final_ready_records === stats.h4g_records) return 'ready_for_h4g_publication_gate'
  if (stats.candidate_needs_review_records > 0) return 'complete_review_decisions_for_existing_candidates'
  if (stats.unit_level_evidence_records > stats.final_ready_records) return 'review_or_repair_unit_level_candidates'
  if (stats.file_level_evidence_records > 0) return 'build_unit_chapter_evidence'
  if (stats.no_evidence_records > 0) return 'source_or_low_confidence_evidence_gap'
  return 'inspect_subject_gap'
}

function actionPriority(action) {
  return {
    complete_review_decisions_for_existing_candidates: 10,
    review_or_repair_unit_level_candidates: 20,
    build_unit_chapter_evidence: 30,
    source_or_low_confidence_evidence_gap: 40,
    inspect_subject_gap: 50,
    no_h4g_records: 90,
    ready_for_h4g_publication_gate: 100
  }[action] || 80
}

function auditSubject(file) {
  const subjectSlug = basename(file, '.json')
  const payload = readJson(file)
  const records = (payload.standards || []).filter(isH4GRecord)
  const groups = new Map()
  const stats = {
    subject: payload.subject || subjectSlug,
    subject_slug: subjectSlug,
    h4g_records: records.length,
    progression_groups: 0,
    complete_triplets: 0,
    exact_core_identical_triplets: 0,
    source_identical_triplets: 0,
    incomplete_groups: 0,
    file_level_evidence_records: 0,
    unit_level_evidence_records: 0,
    no_evidence_records: 0,
    usable_grade_focus_records: 0,
    candidate_needs_review_records: 0,
    final_ready_records: 0,
    final_ready_groups: 0,
    placeholder_or_missing_focus_records: 0,
    rejected_or_needs_revision_records: 0,
    same_source_shared_records: 0,
    single_or_partial_grade_variant_records: 0,
    by_grade_band: {},
    by_record_status: {},
    by_review_status: {},
    by_evidence_granularity: {}
  }

  for (const record of records) {
    countInto(stats.by_grade_band, record.grade_band)
    countInto(stats.by_record_status, recordStatus(record))
    countInto(stats.by_review_status, record.review_status)
    countInto(stats.by_evidence_granularity, record.evidence_granularity)
    if (hasUnitLevelEvidence(record)) stats.unit_level_evidence_records += 1
    else if (record.evidence_granularity === 'textbook_file_grade_level') stats.file_level_evidence_records += 1
    else stats.no_evidence_records += 1
    if (hasUsableGradeFocus(record)) stats.usable_grade_focus_records += 1
    else stats.placeholder_or_missing_focus_records += 1
    if (recordStatus(record) === 'candidate_needs_review') stats.candidate_needs_review_records += 1
    if (recordStatus(record) === 'rejected_or_needs_revision') stats.rejected_or_needs_revision_records += 1
    if (isFinalReady(record)) stats.final_ready_records += 1
    if (record.standard_variant_type === 'same_source_shared') stats.same_source_shared_records += 1
    if (record.standard_variant_type === 'single_or_partial_grade_variant') stats.single_or_partial_grade_variant_records += 1
    const key = groupKey(record)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }

  stats.progression_groups = groups.size
  for (const rows of groups.values()) {
    const group = groupSummary(rows)
    if (group.completeTriplet) stats.complete_triplets += 1
    else stats.incomplete_groups += 1
    if (group.coreIdentical) stats.exact_core_identical_triplets += 1
    if (group.sourceIdentical) stats.source_identical_triplets += 1
    if (group.completeTriplet && group.readyRecords === rows.length) stats.final_ready_groups += 1
  }

  stats.rates = {
    exact_core_identical_triplet_rate: pct(stats.exact_core_identical_triplets, stats.complete_triplets),
    final_ready_record_rate: pct(stats.final_ready_records, stats.h4g_records),
    final_ready_group_rate: pct(stats.final_ready_groups, stats.progression_groups),
    unit_level_evidence_record_rate: pct(stats.unit_level_evidence_records, stats.h4g_records),
    usable_grade_focus_record_rate: pct(stats.usable_grade_focus_records, stats.h4g_records)
  }
  stats.next_action = classifyNextAction(stats)
  stats.action_priority = actionPriority(stats.next_action)
  return stats
}

function accumulateTotals(subjects) {
  const totals = {
    h4g_records: 0,
    progression_groups: 0,
    complete_triplets: 0,
    exact_core_identical_triplets: 0,
    source_identical_triplets: 0,
    incomplete_groups: 0,
    file_level_evidence_records: 0,
    unit_level_evidence_records: 0,
    no_evidence_records: 0,
    usable_grade_focus_records: 0,
    candidate_needs_review_records: 0,
    final_ready_records: 0,
    final_ready_groups: 0,
    placeholder_or_missing_focus_records: 0,
    rejected_or_needs_revision_records: 0,
    same_source_shared_records: 0,
    single_or_partial_grade_variant_records: 0,
    by_next_action: {},
    by_grade_band: {},
    by_record_status: {},
    by_review_status: {},
    by_evidence_granularity: {}
  }
  for (const subject of subjects) {
    for (const key of Object.keys(totals)) {
      if (typeof totals[key] === 'number') totals[key] += subject[key] || 0
    }
    countInto(totals.by_next_action, subject.next_action)
    for (const [source, target] of [
      ['by_grade_band', totals.by_grade_band],
      ['by_record_status', totals.by_record_status],
      ['by_review_status', totals.by_review_status],
      ['by_evidence_granularity', totals.by_evidence_granularity]
    ]) {
      for (const [key, count] of Object.entries(subject[source] || {})) countInto(target, key, count)
    }
  }
  totals.rates = {
    exact_core_identical_triplet_rate: pct(totals.exact_core_identical_triplets, totals.complete_triplets),
    final_ready_record_rate: pct(totals.final_ready_records, totals.h4g_records),
    final_ready_group_rate: pct(totals.final_ready_groups, totals.progression_groups),
    unit_level_evidence_record_rate: pct(totals.unit_level_evidence_records, totals.h4g_records),
    usable_grade_focus_record_rate: pct(totals.usable_grade_focus_records, totals.h4g_records)
  }
  return totals
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function subjectRows(subjects) {
  return subjects
    .map(subject => `| ${markdownCell(subject.subject_slug)} | ${subject.h4g_records} | ${subject.complete_triplets} | ${subject.exact_core_identical_triplets} | ${subject.unit_level_evidence_records} | ${subject.candidate_needs_review_records} | ${subject.final_ready_records} | ${markdownCell(subject.next_action)} |`)
    .join('\n') || '| - | 0 | 0 | 0 | 0 | 0 | 0 | - |'
}

function buildMarkdown(result) {
  return `# H4G Subject Readiness Matrix

Generated at: ${result.generated_at}

| Field | Value |
| --- | --- |
| valid | ${result.valid} |
| data root | ${markdownCell(result.data_root)} |
| H4G records | ${result.totals.h4g_records} |
| progression groups | ${result.totals.progression_groups} |
| final-ready records | ${result.totals.final_ready_records} |
| unit-level evidence records | ${result.totals.unit_level_evidence_records} |
| candidate-needs-review records | ${result.totals.candidate_needs_review_records} |

## Subject Matrix

| Subject | H4G | Complete Triplets | Identical Triplets | Unit Evidence | Needs Review | Final Ready | Next Action |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${subjectRows(result.subjects)}

## Next Actions

| Action | Subjects |
| --- | ---: |
${countRows(result.totals.by_next_action)}

## Record Status

| Status | Records |
| --- | ---: |
${countRows(result.totals.by_record_status)}

## Interpretation

- \`build_unit_chapter_evidence\` means the subject has H4G records but still needs textbook unit/chapter evidence.
- \`complete_review_decisions_for_existing_candidates\` means candidate unit evidence exists but review approval is missing.
- \`ready_for_h4g_publication_gate\` is subject-level final readiness; it does not apply while other subjects remain incomplete.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const files = subjectFiles(args.dataRoot)
  if (!files.length) errors.push(`Missing by_subject JSON files under ${args.dataRoot}`)
  const subjects = files
    .map(auditSubject)
    .sort((a, b) => a.action_priority - b.action_priority || b.h4g_records - a.h4g_records || a.subject_slug.localeCompare(b.subject_slug))
  const result = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    data_root: args.dataRoot,
    target_grade_bands: TARGET_GRADE_BANDS,
    subjects,
    totals: accumulateTotals(subjects),
    errors
  }
  writeJson(args.out, result)
  writeText(args.summaryOut, buildMarkdown(result))
  console.log(JSON.stringify(stable(result), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
