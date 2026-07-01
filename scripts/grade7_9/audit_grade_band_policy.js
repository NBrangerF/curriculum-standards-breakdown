#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { ALLOWED_GRADE_RANGES, DISPLAY_GRADE_POLICY, GRADE_RANGE, SUBJECTS } from './config.js'
import { GRADE_BANDS } from '../../src/data/dataLoader.js'

const DEFAULT_PUBLIC_DATA_ROOT = 'public/data'
const DEFAULT_STAGING_ROOT = 'generated/grade7_9_all_curated'

const TARGET_POLICY = DISPLAY_GRADE_POLICY
const ALLOWED_POLICY = ALLOWED_GRADE_RANGES
const SAMPLE_LIMIT = 5

function parseArgs(argv) {
  const args = {
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    stagingRoot: DEFAULT_STAGING_ROOT,
    dataOnly: false,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--staging-root') args.stagingRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--data-only') args.dataOnly = true
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_grade_band_policy.js [--public-data-root public/data] [--staging-root generated/grade7_9_all_curated] [--out generated/grade7_9_grade_band_policy.json] [--data-only] [--strict]

Audits whether public data, 7-9 staging, and frontend GRADE_BANDS match H1=1-2, H2=3-4, H3=5-6, H4=7-9.
Without --strict, policy blockers are reported but do not fail the command.
Use --data-only for generated candidate data roots when frontend GRADE_BANDS is intentionally checked separately.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
}

function subjectFiles(bySubjectDir) {
  if (!existsSync(bySubjectDir)) return []
  return readdirSync(bySubjectDir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
}

function countInto(target, key, increment = 1) {
  if (!key) return
  target[key] = (target[key] || 0) + increment
}

function pushSample(target, key, record, subjectSlug) {
  target[key] ||= []
  if (target[key].length >= SAMPLE_LIMIT) return
  target[key].push({
    code: record.code || '',
    subject_slug: subjectSlug,
    grade_band: record.grade_band || '',
    grade_range: record.grade_range || '',
    grade: record.grade || '',
    domain: record.domain || '',
    standard_preview: String(record.standard || '').slice(0, 80)
  })
}

function isExpectedRange(record) {
  return (ALLOWED_POLICY[record.grade_band] || []).includes(record.grade_range)
}

function gradeRangeKey(record) {
  return `${record.grade_band || 'missing'}:${record.grade_range || 'missing'}`
}

function auditSubjectRows(payload, subjectSlug) {
  const records = payload.standards || []
  const grade_ranges = {}
  const conflicts = {}
  const incompatible_samples = {}
  let incompatible_records = 0

  for (const record of records) {
    const key = gradeRangeKey(record)
    countInto(grade_ranges, key)
    if (!isExpectedRange(record)) {
      incompatible_records += 1
      countInto(conflicts, key)
      pushSample(incompatible_samples, key, record, subjectSlug)
    }
  }

  return {
    subject: payload.subject || subjectSlug,
    subject_slug: subjectSlug,
    records: records.length,
    grade_ranges,
    incompatible_records,
    incompatible_ranges: conflicts,
    incompatible_samples
  }
}

function auditDataRoot(root, errors) {
  const bySubjectDir = join(root, 'by_subject')
  if (!existsSync(bySubjectDir)) {
    errors.push(`Missing by_subject dir: ${bySubjectDir}`)
    return { subjects: {}, totals: { subjects: 0, records: 0, incompatible_records: 0, incompatible_ranges: {} } }
  }

  const subjects = {}
  const incompatibleRanges = {}
  const incompatibleDetails = {}
  let totalRecords = 0
  let totalIncompatible = 0

  for (const file of subjectFiles(bySubjectDir)) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(join(bySubjectDir, file))
    const summary = auditSubjectRows(payload, subjectSlug)
    subjects[subjectSlug] = summary
    totalRecords += summary.records
    totalIncompatible += summary.incompatible_records
    for (const [range, count] of Object.entries(summary.incompatible_ranges)) {
      countInto(incompatibleRanges, range, count)
      incompatibleDetails[range] ||= { records: 0, subjects: {}, samples: [] }
      incompatibleDetails[range].records += count
      incompatibleDetails[range].subjects[subjectSlug] = count
      for (const sample of summary.incompatible_samples[range] || []) {
        if (incompatibleDetails[range].samples.length < SAMPLE_LIMIT) {
          incompatibleDetails[range].samples.push(sample)
        }
      }
    }
  }

  return {
    subjects,
    totals: {
      subjects: Object.keys(subjects).length,
      records: totalRecords,
      incompatible_records: totalIncompatible,
      incompatible_ranges: incompatibleRanges
    },
    incompatible_range_details: Object.fromEntries(
      Object.entries(incompatibleDetails).sort(([a], [b]) => a.localeCompare(b))
    )
  }
}

function buildPolicyDecisionMatrix(gapRanges) {
  const rows = [
    {
      option: 'preserve_current_public_data',
      description: 'Keep existing H1/H2/H3 public records unchanged and append 7-9 as H4.',
      satisfies_target_policy: true,
      preserves_existing_public_records: true,
      release_gate_effect: 'strict gates pass when H4 staging and frontend label are present'
    },
    {
      option: 'replace_h3_with_7_9',
      description: 'Move 7-9 into H3 and remove old 5-6 records.',
      satisfies_target_policy: false,
      preserves_existing_public_records: false,
      release_gate_effect: 'reject; loses original H3=5-6 meaning'
    },
    {
      option: 'split_primary_and_junior_datasets',
      description: 'Keep primary-stage and junior-stage runtime data separate.',
      satisfies_target_policy: 'depends_on_dataset_contract',
      preserves_existing_public_records: true,
      release_gate_effect: 'requires a new runtime data contract and dataset selector'
    },
    {
      option: 'invent_or_relabel_old_ranges',
      description: 'Force old 3-5 or 6-7 records into exact 3-4 or 5-6 ranges.',
      satisfies_target_policy: false,
      preserves_existing_public_records: true,
      release_gate_effect: 'reject; would misrepresent source grade ranges'
    }
  ]

  return {
    gap_ranges_requiring_decision: gapRanges,
    display_target_ranges: TARGET_POLICY,
    allowed_data_ranges: ALLOWED_POLICY,
    options: rows
  }
}

function publicPolicyFacts(publicAudit, gapRanges) {
  return {
    incompatible_records: publicAudit.totals.incompatible_records,
    incompatible_ranges: publicAudit.totals.incompatible_ranges,
    gap_ranges_requiring_policy_decision: gapRanges,
    incompatible_range_details: Object.fromEntries(
      Object.entries(publicAudit.incompatible_range_details || {})
        .filter(([range]) => Object.prototype.hasOwnProperty.call(gapRanges, range))
        .sort(([a], [b]) => a.localeCompare(b))
    )
  }
}

function auditStaging(root, errors) {
  const result = auditDataRoot(root, errors)
  const expectedSubjects = Object.keys(SUBJECTS).sort((a, b) => a.localeCompare(b))
  const actualSubjects = Object.keys(result.subjects).sort((a, b) => a.localeCompare(b))
  const missingSubjects = expectedSubjects.filter(subject => !actualSubjects.includes(subject))
  return {
    ...result,
    expected_subjects: expectedSubjects.length,
    missing_subjects: missingSubjects
  }
}

function auditFrontendGradeBands() {
  const frontend = {}
  const mismatches = {}
  for (const [band, expectedRange] of Object.entries(TARGET_POLICY)) {
    const actual = GRADE_BANDS[band] || {}
    const actualRange = String(actual.range || '')
    frontend[band] = {
      expected_range: expectedRange,
      frontend_range: actualRange,
      matches: actualRange.includes(expectedRange)
    }
    if (!actualRange.includes(expectedRange)) {
      mismatches[band] = {
        expected_range: expectedRange,
        frontend_range: actualRange
      }
    }
  }
  return { grade_bands: frontend, mismatches }
}

function policyGapRanges(publicAudit) {
  const allowed = new Set(Object.entries(ALLOWED_POLICY).flatMap(([band, ranges]) => ranges.map(range => `${band}:${range}`)))
  return Object.fromEntries(
    Object.entries(publicAudit.totals.incompatible_ranges)
      .filter(([range]) => !allowed.has(range))
      .sort(([a], [b]) => a.localeCompare(b))
  )
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const warnings = []
  const blockers = []
  const publicAudit = auditDataRoot(args.publicDataRoot, errors)
  const stagingAudit = auditStaging(args.stagingRoot, errors)
  const frontendAudit = args.dataOnly ? { skipped: true, reason: '--data-only' } : auditFrontendGradeBands()
  const gapRanges = policyGapRanges(publicAudit)

  if (publicAudit.totals.incompatible_records) {
    blockers.push(`${publicAudit.totals.incompatible_records} public records do not match grade-band policy H1=1-2, H2=3-4, H3=5-6, H4=7-9.`)
  }
  if (Object.keys(gapRanges).length) {
    blockers.push(`Current public data contains grade ranges with no slot in the target policy: ${Object.keys(gapRanges).join(', ')}.`)
  }
  if (stagingAudit.totals.incompatible_records || stagingAudit.missing_subjects.length) {
    blockers.push('7-9 staging does not fully match target policy or is missing expected subjects.')
  }
  if (!args.dataOnly && Object.keys(frontendAudit.mismatches).length) {
    blockers.push('Frontend GRADE_BANDS does not match target grade-band policy.')
  }

  const result = {
    valid: errors.length === 0,
    policy_ready: errors.length === 0 && blockers.length === 0,
    target_policy: TARGET_POLICY,
    audit_scope: args.dataOnly ? 'data_only' : 'data_and_frontend',
    public_data_root: args.publicDataRoot,
    staging_root: args.stagingRoot,
    public_data: publicAudit,
    public_policy_facts: publicPolicyFacts(publicAudit, gapRanges),
    staging: stagingAudit,
    frontend: frontendAudit,
    policy_gap_ranges: gapRanges,
    policy_decision_matrix: buildPolicyDecisionMatrix(gapRanges),
    blockers,
    errors,
    warnings,
    next_actions: blockers.length
      ? [
          'Do not append 7-9 staging into public/data while these blockers remain.',
          'Keep original H3=5-6 records in public/data and represent 7-9 as H4.',
          'After policy migration, update src/data/dataLoader.js GRADE_BANDS and rerun strict audits.'
        ]
      : [
          'Run grade7_9:audit-release -- --strict before public integration.',
          'Run build:indexes, validate:indexes, and build after writing public data.'
        ]
  }

  if (args.out) writeJson(args.out, result)
  console.log(JSON.stringify(stable(result), null, 2))
  if (errors.length || (args.strict && blockers.length)) process.exit(1)
}

main()
