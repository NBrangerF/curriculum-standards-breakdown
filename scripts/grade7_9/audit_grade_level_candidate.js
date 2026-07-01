#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const DEFAULT_CANDIDATE_ROOT = 'generated/grade7_9_grade_level_candidate'
const DEFAULT_OUT = 'generated/grade7_9_grade_level_candidate/audit_grade_level_candidate.json'

const GRADE_POLICY = {
  H4G7: { grade: '七年级', grade_level: 7, grade_range: '7' },
  H4G8: { grade: '八年级', grade_level: 8, grade_range: '8' },
  H4G9: { grade: '九年级', grade_level: 9, grade_range: '9' }
}

const REQUIRED_EVIDENCE_FIELDS = [
  'stage_band',
  'legacy_code',
  'source_grade_band',
  'source_grade_range',
  'grade_assignment_type',
  'grade_assignment_confidence',
  'grade_assignment_rationale',
  'textbook_evidence_ids',
  'progression_group_id',
  'progression_role',
  'progression_basis',
  'progression_confidence',
  'review_status'
]

function parseArgs(argv) {
  const args = { candidateRoot: DEFAULT_CANDIDATE_ROOT, out: DEFAULT_OUT, strict: false }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate-root') args.candidateRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_grade_level_candidate.js \\
  --candidate-root generated/grade7_9_grade_level_candidate

Checks that a generated candidate has split junior records into H4G7/H4G8/H4G9
and that each junior record carries grade-assignment and progression evidence.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function subjectFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(file => file.endsWith('.json')).sort((a, b) => a.localeCompare(b)).map(file => join(dir, file))
}

function countInto(target, key) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + 1
}

function isJuniorRecord(record) {
  return record.stage_band === 'H4' || Object.hasOwn(GRADE_POLICY, record.grade_band) || record.source_grade_band === 'H4'
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function hasField(record, field) {
  return Object.hasOwn(record, field) && record[field] !== undefined && record[field] !== null
}

function auditRecord(record, subjectSlug, errors, warnings, stats) {
  if (!isJuniorRecord(record)) return
  stats.junior_records += 1
  countInto(stats.grade_bands, record.grade_band)
  countInto(stats.grade_assignment_types, record.grade_assignment_type)
  countInto(stats.progression_basis, record.progression_basis)

  if (record.grade_band === 'H4' || record.grade_range === '7-9') {
    errors.push(`${record.code || subjectSlug} still uses unsplit H4/7-9`)
  }
  const expected = GRADE_POLICY[record.grade_band]
  if (!expected) {
    errors.push(`${record.code || subjectSlug} invalid junior grade_band: ${record.grade_band}`)
    return
  }
  if (record.stage_band !== 'H4') errors.push(`${record.code} stage_band must be H4`)
  if (record.grade !== expected.grade) errors.push(`${record.code} grade mismatch: ${record.grade} != ${expected.grade}`)
  if (record.grade_level !== expected.grade_level) errors.push(`${record.code} grade_level mismatch: ${record.grade_level} != ${expected.grade_level}`)
  if (record.grade_range !== expected.grade_range) errors.push(`${record.code} grade_range mismatch: ${record.grade_range} != ${expected.grade_range}`)
  if (!String(record.code || '').includes(`-${record.grade_band}-`)) {
    warnings.push(`${record.code || '(missing code)'} code does not include grade band ${record.grade_band}`)
  }

  for (const field of REQUIRED_EVIDENCE_FIELDS) {
    if (field === 'textbook_evidence_ids') {
      if (!hasField(record, field) || !Array.isArray(record[field])) errors.push(`${record.code} missing evidence field: ${field}`)
    } else if (!hasValue(record[field])) {
      errors.push(`${record.code} missing evidence field: ${field}`)
    }
  }
  if (typeof record.grade_assignment_confidence !== 'number' || record.grade_assignment_confidence < 0 || record.grade_assignment_confidence > 1) {
    errors.push(`${record.code} grade_assignment_confidence must be a number between 0 and 1`)
  }
  if (typeof record.progression_confidence !== 'number' || record.progression_confidence < 0 || record.progression_confidence > 1) {
    errors.push(`${record.code} progression_confidence must be a number between 0 and 1`)
  }
  if (record.grade_assignment_type === 'textbook_supported' && !record.textbook_evidence_ids?.length) {
    errors.push(`${record.code} textbook_supported record must have textbook_evidence_ids`)
  }
  if (record.grade_assignment_type === 'auto_judged_low_confidence') {
    stats.auto_judged_low_confidence_records += 1
    if (record.grade_assignment_confidence > 0.5) {
      warnings.push(`${record.code} auto_judged_low_confidence has confidence > 0.5`)
    }
  }
  if (record.textbook_evidence_ids?.length) stats.records_with_textbook_evidence += 1
}

function auditIndexes(candidateRoot, errors) {
  const required = [
    'manifest.json',
    'indexes/code_to_subject.json',
    'indexes/skill_to_subjects.json',
    'indexes/subject_stats.json',
    'grade_level_candidate_summary.json'
  ]
  for (const file of required) {
    if (!existsSync(join(candidateRoot, file))) errors.push(`missing candidate file: ${file}`)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const bySubjectDir = join(args.candidateRoot, 'by_subject')
  const errors = []
  const warnings = []
  const subjects = {}
  const totals = {
    subjects: 0,
    records: 0,
    junior_records: 0,
    auto_judged_low_confidence_records: 0,
    records_with_textbook_evidence: 0
  }
  const seenCodes = new Set()
  const duplicateCodes = []

  if (!existsSync(bySubjectDir)) errors.push(`candidate by_subject dir missing: ${bySubjectDir}`)
  else {
    for (const file of subjectFiles(bySubjectDir)) {
      const subjectSlug = basename(file, '.json')
      const payload = readJson(file)
      const stats = {
        subject: payload.subject || subjectSlug,
        subject_slug: subjectSlug,
        records: 0,
        junior_records: 0,
        auto_judged_low_confidence_records: 0,
        records_with_textbook_evidence: 0,
        grade_bands: {},
        grade_assignment_types: {},
        progression_basis: {}
      }
      for (const record of payload.standards || []) {
        stats.records += 1
        totals.records += 1
        if (seenCodes.has(record.code)) duplicateCodes.push(record.code)
        else seenCodes.add(record.code)
        auditRecord(record, subjectSlug, errors, warnings, stats)
      }
      totals.subjects += 1
      totals.junior_records += stats.junior_records
      totals.auto_judged_low_confidence_records += stats.auto_judged_low_confidence_records
      totals.records_with_textbook_evidence += stats.records_with_textbook_evidence
      subjects[subjectSlug] = stats
    }
  }
  if (duplicateCodes.length) errors.push(`duplicate codes: ${[...new Set(duplicateCodes)].join(', ')}`)
  auditIndexes(args.candidateRoot, errors)

  const result = {
    valid: errors.length === 0,
    ready_for_review: errors.length === 0,
    candidate_root: args.candidateRoot,
    target_policy: GRADE_POLICY,
    totals,
    subjects,
    errors,
    warnings
  }
  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true })
    writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`)
  }
  console.log(JSON.stringify(result, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
