#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { GRADE_RANGE, SUBJECTS } from './config.js'
import { GRADE_BANDS } from '../../src/data/dataLoader.js'

const DEFAULT_PUBLIC_DATA_ROOT = 'public/data'
const DEFAULT_STAGING_ROOT = 'generated/grade7_9_all_curated'

const TARGET_POLICY = {
  H1: '1-2',
  H2: '3-4',
  H3: GRADE_RANGE
}

function parseArgs(argv) {
  const args = {
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    stagingRoot: DEFAULT_STAGING_ROOT,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--staging-root') args.stagingRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_grade_band_policy.js [--public-data-root public/data] [--staging-root generated/grade7_9_all_curated] [--out generated/grade7_9_grade_band_policy.json] [--strict]

Audits whether public data, 7-9 staging, and frontend GRADE_BANDS match the target policy H1=1-2, H2=3-4, H3=7-9.
Without --strict, policy blockers are reported but do not fail the command.`)
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

function isExpectedRange(record) {
  return TARGET_POLICY[record.grade_band] === record.grade_range
}

function gradeRangeKey(record) {
  return `${record.grade_band || 'missing'}:${record.grade_range || 'missing'}`
}

function auditSubjectRows(payload, subjectSlug) {
  const records = payload.standards || []
  const grade_ranges = {}
  const conflicts = {}
  let incompatible_records = 0

  for (const record of records) {
    const key = gradeRangeKey(record)
    countInto(grade_ranges, key)
    if (!isExpectedRange(record)) {
      incompatible_records += 1
      countInto(conflicts, key)
    }
  }

  return {
    subject: payload.subject || subjectSlug,
    subject_slug: subjectSlug,
    records: records.length,
    grade_ranges,
    incompatible_records,
    incompatible_ranges: conflicts
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
    }
  }

  return {
    subjects,
    totals: {
      subjects: Object.keys(subjects).length,
      records: totalRecords,
      incompatible_records: totalIncompatible,
      incompatible_ranges: incompatibleRanges
    }
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
  const allowed = new Set(Object.entries(TARGET_POLICY).map(([band, range]) => `${band}:${range}`))
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
  const frontendAudit = auditFrontendGradeBands()
  const gapRanges = policyGapRanges(publicAudit)

  if (publicAudit.totals.incompatible_records) {
    blockers.push(`${publicAudit.totals.incompatible_records} public records do not match target grade-band policy H1=1-2, H2=3-4, H3=7-9.`)
  }
  if (Object.keys(gapRanges).length) {
    blockers.push(`Current public data contains grade ranges with no slot in the target policy: ${Object.keys(gapRanges).join(', ')}.`)
  }
  if (stagingAudit.totals.incompatible_records || stagingAudit.missing_subjects.length) {
    blockers.push('7-9 staging does not fully match target policy or is missing expected subjects.')
  }
  if (Object.keys(frontendAudit.mismatches).length) {
    blockers.push('Frontend GRADE_BANDS does not match target grade-band policy.')
  }

  const result = {
    valid: errors.length === 0,
    policy_ready: errors.length === 0 && blockers.length === 0,
    target_policy: TARGET_POLICY,
    public_data_root: args.publicDataRoot,
    staging_root: args.stagingRoot,
    public_data: publicAudit,
    staging: stagingAudit,
    frontend: frontendAudit,
    policy_gap_ranges: gapRanges,
    blockers,
    errors,
    warnings,
    next_actions: blockers.length
      ? [
          'Do not append 7-9 staging into public/data while these blockers remain.',
          'Decide how existing 5-6, 6-7, and 3-5 public records should be represented under the target policy.',
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
