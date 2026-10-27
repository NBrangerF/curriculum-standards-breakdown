#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/grade7_9_distinctiveness_audit.json'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']
const TARGET_GRADE_SET = new Set(TARGET_GRADE_BANDS)
const CORE_TEXT_FIELDS = ['domain', 'subdomain', 'standard', 'context', 'practice', 'teaching_tip', 'assessment_evidence_type']
const STANDARD_SOURCE_FIELDS = ['domain', 'subdomain', 'standard']
const INSTRUCTIONAL_FIELDS = ['context', 'practice', 'teaching_tip', 'assessment_evidence_type']

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    strict: false,
    maxSamples: 5
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--max-samples') args.maxSamples = Number(argv[++i]) || args.maxSamples
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_h4g_distinctiveness.js \\
  --data-root public/data \\
  --out generated/grade7_9_distinctiveness_audit.json

Audits whether H4G7/H4G8/H4G9 records are genuinely differentiated or are
shared 7-9 source requirements. Strict mode fails only when identical triplets
are not honestly labeled as shared requirements / needing differentiation.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function subjectFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function pct(numerator, denominator) {
  if (!denominator) return 0
  return Number((numerator / denominator).toFixed(4))
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function signature(record, fields) {
  return fields.map(field => normalizeText(record[field])).join('\n---\n')
}

function groupKey(record) {
  return record.progression_group_id || [
    record.subject_slug,
    normalizeText(record.domain),
    normalizeText(record.subdomain),
    normalizeText(record.standard)
  ].join('|')
}

function isJuniorTarget(record) {
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

function evidenceGranularity(record) {
  if (hasUnitLevelEvidence(record)) return 'textbook_unit_level'
  if (!Array.isArray(record.textbook_evidence_ids) || record.textbook_evidence_ids.length === 0) return 'none'
  return 'textbook_file_grade_level'
}

function isSharedLabeled(record) {
  return record.standard_variant_type === 'same_source_shared' ||
    record.grade_assignment_type === 'shared_requirement' ||
    String(record.grade_assignment_type || '').startsWith('shared_requirement_') ||
    String(record.review_status || '').includes('needs_grade_differentiation')
}

function summarizeGroup(records) {
  const byBand = Object.fromEntries(TARGET_GRADE_BANDS.map(band => [band, records.filter(row => row.grade_band === band)]))
  const presentGradeBands = TARGET_GRADE_BANDS.filter(band => byBand[band].length)
  const missingGradeBands = TARGET_GRADE_BANDS.filter(band => !byBand[band].length)
  const coreSignatures = new Set(records.map(record => signature(record, CORE_TEXT_FIELDS)))
  const sourceSignatures = new Set(records.map(record => signature(record, STANDARD_SOURCE_FIELDS)))
  const instructionalSignatures = new Set(records.map(record => signature(record, INSTRUCTIONAL_FIELDS)))
  const completeTriplet = missingGradeBands.length === 0
  const exactIdenticalTriplet = completeTriplet && coreSignatures.size === 1
  const sourceIdenticalTriplet = completeTriplet && sourceSignatures.size === 1
  const instructionalIdenticalTriplet = completeTriplet && instructionalSignatures.size === 1
  const unitLevelRecords = records.filter(hasUnitLevelEvidence).length
  const fileLevelRecords = records.filter(record => evidenceGranularity(record) === 'textbook_file_grade_level').length
  const sharedLabeledRecords = records.filter(isSharedLabeled).length
  const allSharedLabeled = sharedLabeledRecords === records.length
  const assignmentTypes = {}
  const reviewStatuses = {}
  const variantTypes = {}
  const evidenceGranularities = {}

  for (const record of records) {
    countInto(assignmentTypes, record.grade_assignment_type)
    countInto(reviewStatuses, record.review_status)
    countInto(variantTypes, record.standard_variant_type)
    countInto(evidenceGranularities, evidenceGranularity(record))
  }

  return {
    records,
    presentGradeBands,
    missingGradeBands,
    completeTriplet,
    exactIdenticalTriplet,
    sourceIdenticalTriplet,
    instructionalIdenticalTriplet,
    unitLevelRecords,
    fileLevelRecords,
    sharedLabeledRecords,
    allSharedLabeled,
    assignmentTypes,
    reviewStatuses,
    variantTypes,
    evidenceGranularities
  }
}

function sampleGroup(groupId, group) {
  const first = group.records[0] || {}
  return {
    progression_group_id: groupId,
    subject_slug: first.subject_slug,
    domain: first.domain,
    subdomain: first.subdomain,
    grade_bands: group.presentGradeBands,
    codes: group.records.map(record => record.code),
    standard_excerpt: normalizeText(first.standard).slice(0, 180),
    grade_assignment_types: group.assignmentTypes,
    review_statuses: group.reviewStatuses,
    standard_variant_types: group.variantTypes,
    evidence_granularities: group.evidenceGranularities,
    reason: group.exactIdenticalTriplet
      ? 'H4G7/H4G8/H4G9 share identical core text fields.'
      : 'H4G records differ in at least one core text field.'
  }
}

function auditSubject(file, maxSamples, blockers, warnings) {
  const subjectSlug = basename(file, '.json')
  const payload = readJson(file)
  const records = (payload.standards || []).filter(isJuniorTarget)
  const groups = new Map()
  const gradeBands = {}
  for (const record of records) {
    countInto(gradeBands, record.grade_band)
    const key = groupKey(record)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }

  const stats = {
    subject: payload.subject || subjectSlug,
    subject_slug: subjectSlug,
    junior_records: records.length,
    grade_bands: gradeBands,
    progression_groups: groups.size,
    complete_triplets: 0,
    exact_identical_triplets: 0,
    source_identical_triplets: 0,
    instructional_identical_triplets: 0,
    differentiated_triplets: 0,
    incomplete_groups: 0,
    unlabeled_identical_triplets: 0,
    file_level_evidence_records: 0,
    unit_level_evidence_records: 0,
    shared_labeled_records: 0,
    grade_assignment_types: {},
    review_statuses: {},
    standard_variant_types: {},
    evidence_granularities: {},
    samples: {
      identical_triplets: [],
      differentiated_triplets: [],
      unlabeled_identical_triplets: []
    }
  }

  for (const [groupId, rows] of groups.entries()) {
    const group = summarizeGroup(rows)
    if (group.completeTriplet) stats.complete_triplets += 1
    else stats.incomplete_groups += 1
    if (group.exactIdenticalTriplet) stats.exact_identical_triplets += 1
    if (group.sourceIdenticalTriplet) stats.source_identical_triplets += 1
    if (group.instructionalIdenticalTriplet) stats.instructional_identical_triplets += 1
    if (group.completeTriplet && !group.exactIdenticalTriplet) stats.differentiated_triplets += 1
    if (group.exactIdenticalTriplet && !group.allSharedLabeled) {
      stats.unlabeled_identical_triplets += 1
      blockers.push(`${subjectSlug}: ${groupId} has identical H4G7/H4G8/H4G9 core text but is not labeled as a shared requirement needing differentiation`)
      if (stats.samples.unlabeled_identical_triplets.length < maxSamples) {
        stats.samples.unlabeled_identical_triplets.push(sampleGroup(groupId, group))
      }
    }
    stats.file_level_evidence_records += group.fileLevelRecords
    stats.unit_level_evidence_records += group.unitLevelRecords
    stats.shared_labeled_records += group.sharedLabeledRecords
    for (const [key, count] of Object.entries(group.assignmentTypes)) countInto(stats.grade_assignment_types, key, count)
    for (const [key, count] of Object.entries(group.reviewStatuses)) countInto(stats.review_statuses, key, count)
    for (const [key, count] of Object.entries(group.variantTypes)) countInto(stats.standard_variant_types, key, count)
    for (const [key, count] of Object.entries(group.evidenceGranularities)) countInto(stats.evidence_granularities, key, count)

    if (group.exactIdenticalTriplet && stats.samples.identical_triplets.length < maxSamples) {
      stats.samples.identical_triplets.push(sampleGroup(groupId, group))
    }
    if (group.completeTriplet && !group.exactIdenticalTriplet && stats.samples.differentiated_triplets.length < maxSamples) {
      stats.samples.differentiated_triplets.push(sampleGroup(groupId, group))
    }
  }

  if (stats.exact_identical_triplets) {
    warnings.push(`${subjectSlug}: ${stats.exact_identical_triplets}/${stats.complete_triplets} complete H4G triplets have identical core text`)
  }
  stats.rates = {
    exact_identical_triplet_rate: pct(stats.exact_identical_triplets, stats.complete_triplets),
    differentiated_triplet_rate: pct(stats.differentiated_triplets, stats.complete_triplets),
    shared_labeled_record_rate: pct(stats.shared_labeled_records, stats.junior_records),
    unit_level_evidence_record_rate: pct(stats.unit_level_evidence_records, stats.junior_records)
  }
  return stats
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const bySubjectDir = join(args.dataRoot, 'by_subject')
  const blockers = []
  const warnings = []
  const subjects = {}
  const totals = {
    subjects: 0,
    junior_records: 0,
    progression_groups: 0,
    complete_triplets: 0,
    exact_identical_triplets: 0,
    source_identical_triplets: 0,
    instructional_identical_triplets: 0,
    differentiated_triplets: 0,
    incomplete_groups: 0,
    unlabeled_identical_triplets: 0,
    file_level_evidence_records: 0,
    unit_level_evidence_records: 0,
    shared_labeled_records: 0
  }

  if (!existsSync(bySubjectDir)) {
    blockers.push(`Missing by_subject dir: ${bySubjectDir}`)
  } else {
    for (const file of subjectFiles(bySubjectDir)) {
      const stats = auditSubject(file, args.maxSamples, blockers, warnings)
      subjects[stats.subject_slug] = stats
      totals.subjects += 1
      for (const key of Object.keys(totals)) {
        if (key !== 'subjects') totals[key] += stats[key] || 0
      }
    }
  }

  const result = {
    valid: blockers.length === 0,
    distinctiveness_ready: blockers.length === 0,
    data_root: args.dataRoot,
    target_grade_bands: TARGET_GRADE_BANDS,
    core_text_fields: CORE_TEXT_FIELDS,
    totals: {
      ...totals,
      rates: {
        exact_identical_triplet_rate: pct(totals.exact_identical_triplets, totals.complete_triplets),
        differentiated_triplet_rate: pct(totals.differentiated_triplets, totals.complete_triplets),
        shared_labeled_record_rate: pct(totals.shared_labeled_records, totals.junior_records),
        unit_level_evidence_record_rate: pct(totals.unit_level_evidence_records, totals.junior_records)
      }
    },
    subjects,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    next_actions: [
      'Keep source standard text unchanged; do not invent grade-specific official standards.',
      'Label identical H4G triplets as same_source_shared / needs_grade_differentiation.',
      'Add textbook unit/chapter evidence before marking a record as genuinely grade-differentiated.',
      'Use this audit after rebuilding or applying H4G data.'
    ]
  }

  if (args.out) writeJson(args.out, result)
  console.log(JSON.stringify(result, null, 2))
  if (args.strict && blockers.length) process.exit(1)
}

main()
