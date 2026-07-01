#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_CANDIDATE_ROOT = 'generated/grade7_9_grade_level_candidate'
const DEFAULT_PUBLIC_DATA_ROOT = 'public/data'
const EXPECTED_SCOPE = 'grade7_9_grade_level_candidate_h4g7_h4g8_h4g9'
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])
const REQUIRED_JUNIOR_FIELDS = [
  'stage_band',
  'legacy_code',
  'source_grade_band',
  'source_grade_range',
  'grade_level',
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
  const args = {
    candidateRoot: DEFAULT_CANDIDATE_ROOT,
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    write: false,
    confirmH4gPolicy: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate-root') args.candidateRoot = argv[++i]
    else if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--write') args.write = true
    else if (item === '--confirm-h4g-policy') args.confirmH4gPolicy = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/apply_grade_level_candidate.js [--candidate-root generated/grade7_9_grade_level_candidate] [--public-data-root public/data]
node scripts/grade7_9/apply_grade_level_candidate.js --write --confirm-h4g-policy

Dry-runs or applies the H4G7/H4G8/H4G9 grade-level candidate into public/data.
Write mode requires both --write and --confirm-h4g-policy.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function subjectFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
}

function copyFileEnsuringDir(from, to) {
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function isJuniorRecord(record) {
  return record.stage_band === 'H4' || TARGET_GRADE_BANDS.has(record.grade_band) || record.source_grade_band === 'H4'
}

function inspectCandidateSubject(file, errors, warnings) {
  const subjectSlug = basename(file, '.json')
  const payload = readJson(file)
  const stats = {
    subject: payload.subject || subjectSlug,
    subject_slug: subjectSlug,
    records: 0,
    junior_records: 0,
    grade_bands: {},
    grade_assignment_types: {}
  }

  for (const record of payload.standards || []) {
    stats.records += 1
    const band = record.grade_band || 'missing'
    stats.grade_bands[band] = (stats.grade_bands[band] || 0) + 1

    if (!isJuniorRecord(record)) continue
    stats.junior_records += 1
    const type = record.grade_assignment_type || 'missing'
    stats.grade_assignment_types[type] = (stats.grade_assignment_types[type] || 0) + 1

    if (record.grade_band === 'H4' || record.grade_range === '7-9') {
      errors.push(`${record.code || subjectSlug} still uses unsplit H4/7-9`)
      continue
    }
    if (!TARGET_GRADE_BANDS.has(record.grade_band)) {
      errors.push(`${record.code || subjectSlug} has invalid junior grade_band: ${record.grade_band}`)
      continue
    }
    for (const field of REQUIRED_JUNIOR_FIELDS) {
      if (field === 'textbook_evidence_ids') {
        if (!Array.isArray(record[field])) errors.push(`${record.code} ${field} must be an array`)
      } else if (!hasValue(record[field])) {
        errors.push(`${record.code} missing required H4G field: ${field}`)
      }
    }
    if (record.grade_assignment_type === 'auto_judged_low_confidence' && record.textbook_evidence_ids?.length) {
      warnings.push(`${record.code} is low-confidence but still has textbook evidence ids; verify assignment type`)
    }
  }

  return stats
}

function collectPlan(args) {
  const errors = []
  const warnings = []
  const candidateManifest = join(args.candidateRoot, 'manifest.json')
  const candidateSummary = join(args.candidateRoot, 'grade_level_candidate_summary.json')
  const candidateBySubject = join(args.candidateRoot, 'by_subject')
  const candidateIndexes = join(args.candidateRoot, 'indexes')
  const required = [
    candidateManifest,
    candidateSummary,
    join(candidateIndexes, 'code_to_subject.json'),
    join(candidateIndexes, 'skill_to_subjects.json'),
    join(candidateIndexes, 'subject_stats.json')
  ]

  for (const file of required) {
    if (!existsSync(file)) errors.push(`Missing candidate file: ${file}`)
  }
  if (!existsSync(candidateBySubject)) errors.push(`Missing candidate by_subject dir: ${candidateBySubject}`)
  if (!existsSync(args.publicDataRoot)) errors.push(`Missing public data root: ${args.publicDataRoot}`)
  if (errors.length) return { valid: false, errors, warnings }

  const manifest = readJson(candidateManifest)
  const summary = readJson(candidateSummary)
  if (manifest.data_scope !== EXPECTED_SCOPE) {
    errors.push(`Candidate manifest data_scope must be ${EXPECTED_SCOPE}; got ${manifest.data_scope || 'missing'}`)
  }
  if (summary.data_scope !== EXPECTED_SCOPE) {
    errors.push(`Candidate summary data_scope must be ${EXPECTED_SCOPE}; got ${summary.data_scope || 'missing'}`)
  }
  if (!summary.totals?.transformed_junior_records) {
    errors.push('Candidate summary has no transformed_junior_records')
  }

  const subjectSummaries = {}
  for (const file of subjectFiles(candidateBySubject).map(name => join(candidateBySubject, name))) {
    const subjectSummary = inspectCandidateSubject(file, errors, warnings)
    subjectSummaries[subjectSummary.subject_slug] = subjectSummary
  }

  const bySubjectCopies = subjectFiles(candidateBySubject).map(file => ({
    from: join(candidateBySubject, file),
    to: join(args.publicDataRoot, 'by_subject', file),
    kind: 'by_subject'
  }))
  const indexCopies = subjectFiles(candidateIndexes).map(file => ({
    from: join(candidateIndexes, file),
    to: join(args.publicDataRoot, 'indexes', file),
    kind: 'index'
  }))
  const metaCopies = ['subjects_meta.json', 'skills_meta.json', 'glossary.json']
    .filter(file => existsSync(join(args.candidateRoot, file)))
    .map(file => ({
      from: join(args.candidateRoot, file),
      to: join(args.publicDataRoot, file),
      kind: 'meta'
    }))
  const copyPlan = [
    { from: candidateManifest, to: join(args.publicDataRoot, 'manifest.json'), kind: 'manifest' },
    { from: candidateSummary, to: join(args.publicDataRoot, 'junior_grade_level_summary.json'), kind: 'summary' },
    ...bySubjectCopies,
    ...indexCopies,
    ...metaCopies
  ]

  if (args.write && !args.confirmH4gPolicy) {
    errors.push('Write mode requires --confirm-h4g-policy.')
  }

  if (summary.totals?.auto_judged_low_confidence_records) {
    warnings.push(`${summary.totals.auto_judged_low_confidence_records} junior records are auto_judged_low_confidence and require visible review status.`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    mode: args.write ? 'write' : 'dry_run_no_writes',
    candidate_root: args.candidateRoot,
    public_data_root: args.publicDataRoot,
    data_scope: manifest.data_scope,
    totals: summary.totals || {},
    textbook_source_commit: summary.textbook_source_commit || null,
    subject_summaries: subjectSummaries,
    copy_plan: copyPlan,
    would_write_files: copyPlan.map(item => item.to)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const plan = collectPlan(args)
  if (!plan.valid) {
    console.log(JSON.stringify(plan, null, 2))
    process.exit(1)
  }

  if (args.write) {
    for (const item of plan.copy_plan) copyFileEnsuringDir(item.from, item.to)
    plan.applied = true
  } else {
    plan.applied = false
  }

  console.log(JSON.stringify(plan, null, 2))
}

main()
