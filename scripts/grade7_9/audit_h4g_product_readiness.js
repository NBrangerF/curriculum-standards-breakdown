#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/grade7_9_h4g_product_readiness.json'
const DEFAULT_SUMMARY_OUT = 'generated/grade7_9_h4g_product_readiness.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']
const TARGET_GRADE_SET = new Set(TARGET_GRADE_BANDS)
const CORE_TEXT_FIELDS = ['domain', 'subdomain', 'standard', 'context', 'practice', 'teaching_tip', 'assessment_evidence_type']
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
    maxSamples: 10,
    out: DEFAULT_OUT,
    requireProductReady: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--max-samples') args.maxSamples = Number(argv[++i]) || args.maxSamples
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--require-product-ready') args.requireProductReady = true
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_h4g_product_readiness.js \\
  --data-root public/data \\
  --strict

Builds a read-only product-readiness gate for H4G7/H4G8/H4G9. The gate keeps
official standard text as the shared source layer and requires the product
display layer to be grade-specific, unit-evidence-backed, approved, and
distinct across H4G7/H4G8/H4G9 sibling records. Use --require-product-ready
only when enforcing a future publication gate.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
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

function coreSignature(record) {
  return CORE_TEXT_FIELDS.map(field => normalizeText(record[field])).join('\n---\n')
}

function focusDistinctSignature(value) {
  return normalizeText(value)
    .replace(/^候选[:：]\s*/, '')
    .replace(/七年级|八年级|九年级|7年级|8年级|9年级|H4G7|H4G8|H4G9/gi, '{grade}')
    .replace(/\s+/g, '')
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function pct(numerator, denominator) {
  if (!denominator) return 0
  return Number((numerator / denominator).toFixed(4))
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

function groupKey(record) {
  return record.progression_group_id || [
    record.subject_slug,
    normalizeText(record.domain),
    normalizeText(record.subdomain),
    normalizeText(record.standard)
  ].join('|')
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

function isProductReadyRecord(record) {
  return hasUsableGradeFocus(record) && hasUnitLevelEvidence(record) && isReviewApproved(record)
}

function recordBlockers(record) {
  const blockers = []
  if (!hasUsableGradeFocus(record)) blockers.push('missing_or_placeholder_grade_specific_focus')
  if (!hasUnitLevelEvidence(record)) blockers.push('missing_unit_level_evidence')
  if (!isReviewApproved(record)) blockers.push('review_not_approved')
  return blockers
}

function compactRecord(record, blockers = []) {
  return {
    blockers,
    code: record.code || record.id || '',
    evidence_granularity: record.evidence_granularity || '',
    grade_band: record.grade_band || '',
    grade_specific_focus_excerpt: normalizeText(record.grade_specific_focus).slice(0, 180),
    progression_group_id: record.progression_group_id || '',
    review_status: record.review_status || '',
    standard_excerpt: normalizeText(record.standard).slice(0, 180),
    standard_text_role: record.standard_text_role || '',
    standard_variant_type: record.standard_variant_type || '',
    subject_slug: record.subject_slug || ''
  }
}

function groupSummary(groupId, records) {
  const byGrade = Object.fromEntries(TARGET_GRADE_BANDS.map(grade => [grade, records.filter(record => record.grade_band === grade)]))
  const presentGradeBands = TARGET_GRADE_BANDS.filter(grade => byGrade[grade].length > 0)
  const missingGradeBands = TARGET_GRADE_BANDS.filter(grade => byGrade[grade].length === 0)
  const duplicateGradeBands = TARGET_GRADE_BANDS.filter(grade => byGrade[grade].length > 1)
  const completeTriplet = missingGradeBands.length === 0 && duplicateGradeBands.length === 0
  const focusSignatures = records
    .filter(record => TARGET_GRADE_SET.has(record.grade_band) && hasUsableGradeFocus(record))
    .map(record => focusDistinctSignature(record.grade_specific_focus))
  const focusDistinct = completeTriplet &&
    focusSignatures.length === TARGET_GRADE_BANDS.length &&
    new Set(focusSignatures).size === TARGET_GRADE_BANDS.length
  const readyRecords = records.filter(isProductReadyRecord).length
  const blockers = []
  if (!completeTriplet) blockers.push('incomplete_or_duplicate_h4g_grade_assignment')
  if (records.some(record => !hasUsableGradeFocus(record))) blockers.push('missing_or_placeholder_grade_specific_focus')
  if (records.some(record => !hasUnitLevelEvidence(record))) blockers.push('missing_unit_level_evidence')
  if (records.some(record => !isReviewApproved(record))) blockers.push('review_not_approved')
  if (completeTriplet && !focusDistinct) blockers.push('grade_specific_focus_not_distinct_across_h4g_siblings')
  return {
    blockers,
    complete_triplet: completeTriplet,
    duplicate_grade_bands: duplicateGradeBands,
    exact_core_identical: completeTriplet && new Set(records.map(coreSignature)).size === 1,
    focus_distinct_across_grades: focusDistinct,
    missing_grade_bands: missingGradeBands,
    present_grade_bands: presentGradeBands,
    product_ready_group: completeTriplet && readyRecords === records.length && focusDistinct,
    product_ready_records: readyRecords,
    records: records.length
  }
}

function emptySubject(subjectSlug, subjectName) {
  return {
    by_blocker: {},
    by_group_blocker: {},
    by_grade_band: {},
    by_record_status: {},
    by_record_blocker: {},
    by_review_status: {},
    complete_triplets: 0,
    duplicate_grade_band_groups: 0,
    exact_core_identical_triplets: 0,
    focus_distinct_groups: 0,
    h4g_records: 0,
    incomplete_groups: 0,
    missing_or_placeholder_focus_records: 0,
    missing_unit_level_evidence_records: 0,
    non_distinct_focus_groups: 0,
    product_ready_groups: 0,
    product_ready_records: 0,
    progression_groups: 0,
    review_not_approved_records: 0,
    samples: {
      group_blockers: [],
      record_blockers: []
    },
    subject: subjectName || subjectSlug,
    subject_slug: subjectSlug
  }
}

function recordStatus(record) {
  if (isProductReadyRecord(record)) return 'product_ready_record'
  const blockers = recordBlockers(record)
  if (blockers.includes('missing_or_placeholder_grade_specific_focus')) return 'missing_or_placeholder_focus'
  if (blockers.includes('missing_unit_level_evidence')) return 'missing_unit_level_evidence'
  if (blockers.includes('review_not_approved')) return 'review_not_approved'
  return 'not_product_ready'
}

function auditSubject(file, args) {
  const subjectSlug = basename(file, '.json')
  const payload = readJson(file)
  const subject = emptySubject(subjectSlug, payload.subject)
  const groups = new Map()
  const records = (payload.standards || [])
    .filter(record => TARGET_GRADE_SET.has(record.grade_band))
    .map(record => ({
      ...record,
      subject: record.subject || payload.subject || subjectSlug,
      subject_slug: record.subject_slug || subjectSlug
    }))

  for (const record of records) {
    const blockers = recordBlockers(record)
    subject.h4g_records += 1
    countInto(subject.by_grade_band, record.grade_band)
    countInto(subject.by_record_status, recordStatus(record))
    countInto(subject.by_review_status, record.review_status)
    for (const blocker of blockers) {
      countInto(subject.by_blocker, blocker)
      countInto(subject.by_record_blocker, blocker)
    }
    if (!hasUsableGradeFocus(record)) subject.missing_or_placeholder_focus_records += 1
    if (!hasUnitLevelEvidence(record)) subject.missing_unit_level_evidence_records += 1
    if (!isReviewApproved(record)) subject.review_not_approved_records += 1
    if (isProductReadyRecord(record)) subject.product_ready_records += 1
    if (blockers.length && subject.samples.record_blockers.length < args.maxSamples) {
      subject.samples.record_blockers.push(compactRecord(record, blockers))
    }
    const key = groupKey(record)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }

  subject.progression_groups = groups.size
  for (const [groupId, rows] of groups.entries()) {
    const group = groupSummary(groupId, rows)
    for (const blocker of group.blockers) {
      countInto(subject.by_blocker, blocker)
      countInto(subject.by_group_blocker, blocker)
    }
    if (group.complete_triplet) subject.complete_triplets += 1
    else subject.incomplete_groups += 1
    if (group.duplicate_grade_bands.length) subject.duplicate_grade_band_groups += 1
    if (group.exact_core_identical) subject.exact_core_identical_triplets += 1
    if (group.focus_distinct_across_grades) subject.focus_distinct_groups += 1
    else if (group.complete_triplet) subject.non_distinct_focus_groups += 1
    if (group.product_ready_group) subject.product_ready_groups += 1
    if (group.blockers.length && subject.samples.group_blockers.length < args.maxSamples) {
      subject.samples.group_blockers.push({
        blockers: group.blockers,
        codes: rows.map(record => record.code || record.id || ''),
        grade_bands: group.present_grade_bands,
        missing_grade_bands: group.missing_grade_bands,
        product_ready_records: group.product_ready_records,
        progression_group_id: groupId,
        standard_excerpt: normalizeText(rows[0]?.standard).slice(0, 180),
        subject_slug: subjectSlug
      })
    }
  }

  subject.rates = {
    complete_triplet_rate: pct(subject.complete_triplets, subject.progression_groups),
    focus_distinct_group_rate: pct(subject.focus_distinct_groups, subject.complete_triplets),
    product_ready_group_rate: pct(subject.product_ready_groups, subject.progression_groups),
    product_ready_record_rate: pct(subject.product_ready_records, subject.h4g_records)
  }
  return subject
}

function accumulate(subjects) {
  const totals = emptySubject('all', 'all')
  delete totals.samples
  for (const subject of subjects) {
    for (const [key, value] of Object.entries(subject)) {
      if (typeof value === 'number') totals[key] += value
    }
    for (const source of ['by_blocker', 'by_group_blocker', 'by_grade_band', 'by_record_blocker', 'by_record_status', 'by_review_status']) {
      for (const [key, count] of Object.entries(subject[source] || {})) countInto(totals[source], key, count)
    }
  }
  totals.subjects = subjects.length
  totals.rates = {
    complete_triplet_rate: pct(totals.complete_triplets, totals.progression_groups),
    focus_distinct_group_rate: pct(totals.focus_distinct_groups, totals.complete_triplets),
    product_ready_group_rate: pct(totals.product_ready_groups, totals.progression_groups),
    product_ready_record_rate: pct(totals.product_ready_records, totals.h4g_records)
  }
  return totals
}

function subjectRows(subjects) {
  return subjects
    .map(subject => `| ${markdownCell(subject.subject_slug)} | ${subject.h4g_records} | ${subject.progression_groups} | ${subject.complete_triplets} | ${subject.focus_distinct_groups} | ${subject.product_ready_records} | ${subject.product_ready_groups} |`)
    .join('\n') || '| - | 0 | 0 | 0 | 0 | 0 | 0 |'
}

function buildMarkdown(result) {
  return `# H4G Product Readiness Audit

Generated at: ${result.generated_at}

This is a read-only product gate for H4G7/H4G8/H4G9. The official source text
stays in \`standard\`; product differentiation must be proven through
\`grade_specific_focus\`, unit-level evidence, review approval, and distinct
H4G7/H4G8/H4G9 sibling focus.

## Status

| Field | Value |
| --- | ---: |
| valid | ${result.valid} |
| product_ready | ${result.product_ready} |
| h4g records | ${result.summary.h4g_records} |
| progression groups | ${result.summary.progression_groups} |
| complete triplets | ${result.summary.complete_triplets} |
| product-ready records | ${result.summary.product_ready_records} |
| product-ready groups | ${result.summary.product_ready_groups} |
| focus-distinct groups | ${result.summary.focus_distinct_groups} |
| non-distinct complete groups | ${result.summary.non_distinct_focus_groups} |
| missing/placeholder focus records | ${result.summary.missing_or_placeholder_focus_records} |
| missing unit-level evidence records | ${result.summary.missing_unit_level_evidence_records} |
| review-not-approved records | ${result.summary.review_not_approved_records} |

## Record Blockers

| blocker | count |
| --- | ---: |
${countRows(result.summary.by_record_blocker)}

## Group Blockers

| blocker | count |
| --- | ---: |
${countRows(result.summary.by_group_blocker)}

## Subjects

| subject | H4G records | groups | complete triplets | focus-distinct groups | product-ready records | product-ready groups |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${subjectRows(result.subjects)}

## Product Contract

- \`standard\` remains the official/shared source-text layer.
- \`grade_specific_focus\` is the grade-specific display layer.
- A product-ready record needs non-placeholder focus, unit-level textbook evidence, and approved review status.
- A product-ready group needs one H4G7, one H4G8, one H4G9 record, all records ready, and mutually distinct grade-specific focus.

## Errors

${result.errors.length ? result.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
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
  const subjects = files.map(file => auditSubject(file, args))
    .sort((a, b) => a.product_ready_group_rate - b.product_ready_group_rate || b.h4g_records - a.h4g_records || a.subject_slug.localeCompare(b.subject_slug))
  const summary = accumulate(subjects)
  const productReady = summary.h4g_records > 0 &&
    summary.product_ready_records === summary.h4g_records &&
    summary.product_ready_groups === summary.progression_groups
  if (args.requireProductReady && !productReady) {
    errors.push(`Only ${summary.product_ready_records}/${summary.h4g_records} H4G records and ${summary.product_ready_groups}/${summary.progression_groups} groups are product-ready`)
  }

  const result = {
    changes_official_standard_text: false,
    data_root: args.dataRoot,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: productReady,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    product_readiness_contract: {
      grade_specific_display_field: 'grade_specific_focus',
      official_source_standard_field: 'standard',
      product_ready_group_requires: [
        'one_record_for_each_of_H4G7_H4G8_H4G9',
        'all_sibling_records_product_ready',
        'grade_specific_focus_distinct_after_grade_label_normalization'
      ],
      product_ready_record_requires: [
        'grade_specific_focus_non_placeholder',
        'textbook_unit_level_evidence',
        'approved_review_status'
      ]
    },
    product_ready: productReady,
    publication_ready: productReady,
    purpose: 'h4g_product_readiness_audit',
    summary,
    subjects,
    target_grade_bands: TARGET_GRADE_BANDS,
    valid: errors.length === 0,
    writes_public_data: false
  }

  writeJson(args.out, result)
  if (args.summaryOut) writeText(args.summaryOut, buildMarkdown(result))
  console.log(JSON.stringify(result, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
