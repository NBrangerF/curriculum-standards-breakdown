#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/grade7_9_h4g_grade_differentiation_readiness.json'
const DEFAULT_SUMMARY_OUT = 'generated/grade7_9_h4g_grade_differentiation_readiness.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']
const TARGET_GRADE_SET = new Set(TARGET_GRADE_BANDS)
const CORE_TEXT_FIELDS = ['domain', 'subdomain', 'standard', 'context', 'practice', 'teaching_tip', 'assessment_evidence_type']
const SOURCE_TEXT_FIELDS = ['domain', 'subdomain', 'standard']
const APPROVED_REVIEW_STATUSES = new Set([
  'grade_differentiation_approved',
  'manual_grade_differentiation_approved',
  'manual_review_approved',
  'unit_evidence_approved',
  'unit_evidence_reviewed',
  'publication_approved'
])

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireReady: false,
    maxSamples: 8
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--max-samples') args.maxSamples = Number(argv[++i]) || args.maxSamples
    else if (item === '--require-ready') args.requireReady = true
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_h4g_grade_differentiation_readiness.js \\
  --data-root public/data \\
  --out generated/grade7_9_h4g_grade_differentiation_readiness.json

Audits whether H4G7/H4G8/H4G9 records have moved beyond shared 7-9
source text into a real grade-specific display layer. This script does not
mutate data. Use --require-ready only for a future publication gate.`)
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
    text.includes('补充本年级专属学习重点') && !text.startsWith('候选：')
}

function hasUsableGradeFocus(record) {
  return !isPlaceholderFocus(record.grade_specific_focus)
}

function isCandidateFocus(record) {
  return hasUsableGradeFocus(record) && String(record.grade_specific_focus || '').startsWith('候选：')
}

function isReviewApproved(record) {
  return APPROVED_REVIEW_STATUSES.has(String(record.review_status || ''))
}

function isReviewRejectedOrRevision(record) {
  const status = String(record.review_status || '')
  return status.includes('rejected') || status.includes('needs_revision')
}

function isFinalDifferentiated(record) {
  return hasUsableGradeFocus(record) && hasUnitLevelEvidence(record) && isReviewApproved(record)
}

function recordStatus(record) {
  if (isFinalDifferentiated(record)) return 'ready_grade_specific'
  if (isReviewRejectedOrRevision(record)) return 'rejected_or_needs_revision'
  if (hasUsableGradeFocus(record) && hasUnitLevelEvidence(record)) return 'candidate_needs_review'
  if (hasUsableGradeFocus(record)) return 'focus_without_unit_evidence'
  if (isPlaceholderFocus(record.grade_specific_focus)) return 'placeholder_or_missing_focus'
  return 'not_differentiated'
}

function sampleRecord(record, reason) {
  return {
    code: record.code,
    grade_band: record.grade_band,
    subject_slug: record.subject_slug,
    domain: record.domain,
    subdomain: record.subdomain,
    standard_excerpt: normalizeText(record.standard).slice(0, 160),
    grade_specific_focus_excerpt: normalizeText(record.grade_specific_focus).slice(0, 180),
    evidence_granularity: record.evidence_granularity || '',
    review_status: record.review_status || '',
    standard_variant_type: record.standard_variant_type || '',
    reason
  }
}

function groupSummary(groupId, records) {
  const byBand = Object.fromEntries(TARGET_GRADE_BANDS.map(band => [band, records.filter(row => row.grade_band === band)]))
  const presentGradeBands = TARGET_GRADE_BANDS.filter(band => byBand[band].length)
  const completeTriplet = presentGradeBands.length === TARGET_GRADE_BANDS.length
  const coreIdentical = completeTriplet && new Set(records.map(record => signature(record, CORE_TEXT_FIELDS))).size === 1
  const sourceIdentical = completeTriplet && new Set(records.map(record => signature(record, SOURCE_TEXT_FIELDS))).size === 1
  const readyRecords = records.filter(isFinalDifferentiated)
  const candidateRecords = records.filter(record => hasUsableGradeFocus(record) && hasUnitLevelEvidence(record) && !isReviewApproved(record))
  const unitLevelRecords = records.filter(hasUnitLevelEvidence)
  const usableFocusRecords = records.filter(hasUsableGradeFocus)
  return {
    group_id: groupId,
    complete_triplet: completeTriplet,
    core_identical: coreIdentical,
    source_identical: sourceIdentical,
    present_grade_bands: presentGradeBands,
    ready_records: readyRecords.length,
    candidate_records: candidateRecords.length,
    unit_level_records: unitLevelRecords.length,
    usable_focus_records: usableFocusRecords.length,
    group_ready: completeTriplet && readyRecords.length === records.length,
    group_candidate_ready: completeTriplet && records.length > 0 && records.every(record => hasUsableGradeFocus(record) && hasUnitLevelEvidence(record))
  }
}

function emptySubjectStats(subjectSlug, subjectName) {
  return {
    subject: subjectName || subjectSlug,
    subject_slug: subjectSlug,
    h4g_records: 0,
    progression_groups: 0,
    complete_triplets: 0,
    exact_core_identical_triplets: 0,
    source_identical_triplets: 0,
    differentiated_core_triplets: 0,
    incomplete_groups: 0,
    unit_level_evidence_records: 0,
    usable_grade_focus_records: 0,
    candidate_grade_focus_records: 0,
    placeholder_or_missing_focus_records: 0,
    final_ready_records: 0,
    final_ready_groups: 0,
    candidate_ready_groups: 0,
    contradiction_records: 0,
    by_grade_band: {},
    by_record_status: {},
    by_review_status: {},
    by_evidence_granularity: {},
    by_standard_variant_type: {},
    samples: {
      shared_triplets_without_ready_focus: [],
      candidate_grade_focus: [],
      contradictions: []
    }
  }
}

function auditSubject(file, args, blockers, warnings) {
  const subjectSlug = basename(file, '.json')
  const payload = readJson(file)
  const records = (payload.standards || []).filter(isH4GRecord)
  const stats = emptySubjectStats(subjectSlug, payload.subject)
  const groups = new Map()

  for (const record of records) {
    stats.h4g_records += 1
    countInto(stats.by_grade_band, record.grade_band)
    countInto(stats.by_record_status, recordStatus(record))
    countInto(stats.by_review_status, record.review_status)
    countInto(stats.by_evidence_granularity, record.evidence_granularity)
    countInto(stats.by_standard_variant_type, record.standard_variant_type)
    if (hasUnitLevelEvidence(record)) stats.unit_level_evidence_records += 1
    if (hasUsableGradeFocus(record)) stats.usable_grade_focus_records += 1
    if (isCandidateFocus(record)) stats.candidate_grade_focus_records += 1
    if (!hasUsableGradeFocus(record)) stats.placeholder_or_missing_focus_records += 1
    if (isFinalDifferentiated(record)) stats.final_ready_records += 1

    const key = groupKey(record)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }

  stats.progression_groups = groups.size

  for (const [groupId, rows] of groups.entries()) {
    const group = groupSummary(groupId, rows)
    if (group.complete_triplet) stats.complete_triplets += 1
    else stats.incomplete_groups += 1
    if (group.core_identical) stats.exact_core_identical_triplets += 1
    if (group.source_identical) stats.source_identical_triplets += 1
    if (group.complete_triplet && !group.core_identical) stats.differentiated_core_triplets += 1
    if (group.group_ready) stats.final_ready_groups += 1
    if (group.group_candidate_ready) stats.candidate_ready_groups += 1

    const hasUnsafeVariant = rows.some(record => record.standard_variant_type === 'grade_specific_variant' && group.core_identical && !isFinalDifferentiated(record))
    if (hasUnsafeVariant) {
      stats.contradiction_records += rows.filter(record => record.standard_variant_type === 'grade_specific_variant').length
      blockers.push(`${subjectSlug}: ${groupId} marks grade_specific_variant while core text is identical and final grade differentiation is not approved`)
      if (stats.samples.contradictions.length < args.maxSamples) {
        stats.samples.contradictions.push(sampleRecord(rows[0], 'grade_specific_variant_without_final_differentiation'))
      }
    }

    if (group.core_identical && !group.group_ready && stats.samples.shared_triplets_without_ready_focus.length < args.maxSamples) {
      stats.samples.shared_triplets_without_ready_focus.push({
        progression_group_id: groupId,
        subject_slug: subjectSlug,
        grade_bands: group.present_grade_bands,
        codes: rows.map(record => record.code),
        standard_excerpt: normalizeText(rows[0]?.standard).slice(0, 180),
        ready_records: group.ready_records,
        candidate_records: group.candidate_records,
        unit_level_records: group.unit_level_records,
        usable_focus_records: group.usable_focus_records
      })
    }

    for (const record of rows) {
      if (hasUsableGradeFocus(record) && hasUnitLevelEvidence(record) && !isReviewApproved(record) && stats.samples.candidate_grade_focus.length < args.maxSamples) {
        stats.samples.candidate_grade_focus.push(sampleRecord(record, 'has_unit_evidence_and_grade_focus_but_review_not_approved'))
      }
    }
  }

  if (stats.exact_core_identical_triplets > 0) {
    warnings.push(`${subjectSlug}: ${stats.exact_core_identical_triplets}/${stats.complete_triplets} complete H4G triplets still share identical core text`)
  }
  if (stats.candidate_grade_focus_records > 0) {
    warnings.push(`${subjectSlug}: ${stats.candidate_grade_focus_records} records have candidate grade focus but still need manual/curriculum review`)
  }

  stats.rates = {
    exact_core_identical_triplet_rate: pct(stats.exact_core_identical_triplets, stats.complete_triplets),
    final_ready_record_rate: pct(stats.final_ready_records, stats.h4g_records),
    final_ready_group_rate: pct(stats.final_ready_groups, stats.progression_groups),
    unit_level_evidence_record_rate: pct(stats.unit_level_evidence_records, stats.h4g_records),
    usable_grade_focus_record_rate: pct(stats.usable_grade_focus_records, stats.h4g_records)
  }
  return stats
}

function tableRows(object) {
  return Object.entries(object || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function subjectRows(subjects) {
  return Object.values(subjects)
    .sort((a, b) => a.subject_slug.localeCompare(b.subject_slug))
    .map(subject => `| ${subject.subject_slug} | ${subject.h4g_records} | ${subject.complete_triplets} | ${subject.exact_core_identical_triplets} | ${subject.unit_level_evidence_records} | ${subject.usable_grade_focus_records} | ${subject.final_ready_records} |`)
    .join('\n')
}

function buildMarkdown(result) {
  return `# H4G Grade Differentiation Readiness Audit

Generated at: ${result.generated_at}

| Field | Value |
| --- | --- |
| valid | ${result.valid} |
| differentiation_ready | ${result.differentiation_ready} |
| data_root | ${result.data_root} |
| h4g_records | ${result.totals.h4g_records} |
| progression_groups | ${result.totals.progression_groups} |
| complete_triplets | ${result.totals.complete_triplets} |
| exact_core_identical_triplets | ${result.totals.exact_core_identical_triplets} |
| unit_level_evidence_records | ${result.totals.unit_level_evidence_records} |
| usable_grade_focus_records | ${result.totals.usable_grade_focus_records} |
| final_ready_records | ${result.totals.final_ready_records} |
| final_ready_groups | ${result.totals.final_ready_groups} |

## Record Status

| Status | Records |
| --- | ---: |
${tableRows(result.totals.by_record_status)}

## Subject Summary

| Subject | H4G Records | Complete Triplets | Identical Triplets | Unit Evidence | Usable Focus | Final Ready |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${subjectRows(result.subjects)}

## Blockers

${result.blockers.length ? result.blockers.map(item => `- ${item}`).join('\n') : '- None'}

## Warnings

${result.warnings.length ? result.warnings.map(item => `- ${item}`).join('\n') : '- None'}

## Interpretation

- standard remains the official/shared source-text layer.
- grade_specific_focus is only display-ready when it is not a placeholder.
- Final grade differentiation requires usable grade focus, unit-level evidence, and an approved manual/curriculum review status.
- Candidate grade focus is useful progress, but it is not final publication readiness.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const blockers = []
  const warnings = []
  const subjects = {}
  const totals = {
    h4g_records: 0,
    progression_groups: 0,
    complete_triplets: 0,
    exact_core_identical_triplets: 0,
    source_identical_triplets: 0,
    differentiated_core_triplets: 0,
    incomplete_groups: 0,
    unit_level_evidence_records: 0,
    usable_grade_focus_records: 0,
    candidate_grade_focus_records: 0,
    placeholder_or_missing_focus_records: 0,
    final_ready_records: 0,
    final_ready_groups: 0,
    candidate_ready_groups: 0,
    contradiction_records: 0,
    by_grade_band: {},
    by_record_status: {},
    by_review_status: {},
    by_evidence_granularity: {},
    by_standard_variant_type: {}
  }

  const files = subjectFiles(args.dataRoot)
  if (!files.length) blockers.push(`Missing by_subject JSON files under ${args.dataRoot}`)

  for (const file of files) {
    const subject = auditSubject(file, args, blockers, warnings)
    subjects[subject.subject_slug] = subject
    for (const key of [
      'h4g_records',
      'progression_groups',
      'complete_triplets',
      'exact_core_identical_triplets',
      'source_identical_triplets',
      'differentiated_core_triplets',
      'incomplete_groups',
      'unit_level_evidence_records',
      'usable_grade_focus_records',
      'candidate_grade_focus_records',
      'placeholder_or_missing_focus_records',
      'final_ready_records',
      'final_ready_groups',
      'candidate_ready_groups',
      'contradiction_records'
    ]) {
      totals[key] += subject[key] || 0
    }
    for (const [source, target] of [
      ['by_grade_band', totals.by_grade_band],
      ['by_record_status', totals.by_record_status],
      ['by_review_status', totals.by_review_status],
      ['by_evidence_granularity', totals.by_evidence_granularity],
      ['by_standard_variant_type', totals.by_standard_variant_type]
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

  if (args.requireReady && totals.final_ready_records !== totals.h4g_records) {
    blockers.push(`Only ${totals.final_ready_records}/${totals.h4g_records} H4G records are final grade-differentiation ready`)
  }
  if (args.requireReady && totals.final_ready_groups !== totals.progression_groups) {
    blockers.push(`Only ${totals.final_ready_groups}/${totals.progression_groups} H4G progression groups are final grade-differentiation ready`)
  }

  const result = {
    valid: blockers.length === 0,
    differentiation_ready: blockers.length === 0 && totals.h4g_records > 0 && totals.final_ready_records === totals.h4g_records,
    generated_at: new Date().toISOString(),
    data_root: args.dataRoot,
    target_grade_bands: TARGET_GRADE_BANDS,
    core_text_fields: CORE_TEXT_FIELDS,
    final_ready_definition: {
      usable_grade_specific_focus: 'grade_specific_focus is present and is not a placeholder such as 待基于...补充本年级专属学习重点',
      unit_level_evidence: 'record has textbook_unit_evidence or textbook_unit_evidence_ids with evidence_granularity=textbook_unit_level',
      approved_review_statuses: [...APPROVED_REVIEW_STATUSES].sort((a, b) => a.localeCompare(b))
    },
    totals,
    subjects,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    next_actions: [
      'Keep official standard text immutable.',
      'Use unit/chapter textbook evidence to write grade_specific_focus for each H4G record.',
      'Do not treat candidate grade focus as final until manual/curriculum review approves it.',
      'Update UI to lead with usable grade_specific_focus while labeling standard as shared 7-9 source text.'
    ]
  }

  writeJson(args.out, result)
  if (args.summaryOut) writeFileSync(args.summaryOut, buildMarkdown(result))
  console.log(JSON.stringify(result, null, 2))
  if ((args.strict || args.requireReady) && blockers.length) process.exit(1)
}

main()
