#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_PUBLIC_DATA_ROOT = 'public/data'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_reviewed_publication_summary.json'
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])
const APPROVED_REVIEW_STATUSES = new Set([
  'unit_evidence_approved',
  'unit_evidence_reviewed',
  'grade_differentiation_approved',
  'manual_grade_differentiation_approved',
  'manual_review_approved',
  'publication_approved'
])
const OFFICIAL_TEXT_FIELDS = [
  'domain',
  'subdomain',
  'standard',
  'context',
  'practice',
  'teaching_tip',
  'assessment_evidence_type'
]
const PUBLISH_FIELDS = [
  'textbook_evidence_ids',
  'textbook_unit_evidence_ids',
  'textbook_unit_evidence',
  'evidence_granularity',
  'grade_assignment_type',
  'grade_assignment_rationale',
  'progression_basis',
  'progression_confidence',
  'progression_delta',
  'progression_review_note',
  'requires_unit_level_evidence',
  'grade_specific_focus',
  'review_status',
  'h4g_unit_candidate_id',
  'h4g_unit_candidate_generated_at',
  'h4g_unit_candidate_requires_manual_review'
]

function parseArgs(argv) {
  const args = {
    candidateRoots: [],
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    write: false,
    confirm: false,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate-root') args.candidateRoots.push(argv[++i])
    else if (item === '--candidate-roots') args.candidateRoots.push(...String(argv[++i] || '').split(',').filter(Boolean))
    else if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--write') args.write = true
    else if (item === '--confirm-reviewed-h4g-publication') args.confirm = true
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/publish_h4g_reviewed_candidate.js \\
  --candidate-roots generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_codex_reviewed,generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/data_candidate_codex_reviewed \\
  --write --confirm-reviewed-h4g-publication --strict

Publishes only approved H4G same-grade unit evidence fields from reviewed
generated candidate roots into public/data. It refuses to change official
standard text and requires an explicit write confirmation.`)
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

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function gradeKey(record) {
  const grade = String(record.grade || '').trim()
  if (grade) return grade
  const gradeBand = String(record.grade_band || '').trim()
  const gradeRange = String(record.grade_range || '').trim()
  if (gradeBand && gradeRange) return `${gradeBand}:${gradeRange}`
  return gradeBand || gradeRange || 'missing'
}

function countBy(rows, getKey) {
  const out = {}
  for (const row of rows) countInto(out, getKey(row))
  return out
}

function refreshSubjectPayload(payload) {
  const rows = payload.standards || []
  payload.generated_at = new Date().toISOString()
  payload.record_count = rows.length
  payload.columns = [...new Set(rows.flatMap(row => Object.keys(row)))].sort((a, b) => a.localeCompare(b))
  payload.indexes = {
    ...(payload.indexes || {}),
    domains: countBy(rows, row => row.domain),
    evidence_granularities: countBy(rows, row => row.evidence_granularity),
    grade_assignment_types: countBy(rows, row => row.grade_assignment_type),
    grade_bands: countBy(rows, row => row.grade_band),
    grades: countBy(rows, gradeKey),
    progression_basis: countBy(rows, row => row.progression_basis),
    review_statuses: countBy(rows, row => row.review_status),
    standard_variant_types: countBy(rows, row => row.standard_variant_type),
    ts_primary: countBy(rows, row => (row.ts_primary || [])[0])
  }
}

function officialTextErrors(source, target, code) {
  const errors = []
  for (const field of OFFICIAL_TEXT_FIELDS) {
    if (normalizeText(source[field]) !== normalizeText(target[field])) {
      errors.push(`${code} official field mismatch: ${field}`)
    }
  }
  return errors
}

function hasApprovedUnitEvidence(record) {
  const hasUnitIds = Array.isArray(record.textbook_unit_evidence_ids) && record.textbook_unit_evidence_ids.length > 0
  const hasUnitObjects = Array.isArray(record.textbook_unit_evidence) && record.textbook_unit_evidence.length > 0
  return record.evidence_granularity === 'textbook_unit_level' &&
    hasUnitIds &&
    hasUnitObjects &&
    APPROVED_REVIEW_STATUSES.has(String(record.review_status || ''))
}

function hasPublishableFocus(record) {
  const focus = normalizeText(record.grade_specific_focus)
  return Boolean(focus) &&
    !focus.startsWith('待基于') &&
    !focus.includes('补充本年级专属学习重点') &&
    !focus.startsWith('候选：') &&
    !focus.startsWith('候选:')
}

function loadPublic(dataRoot) {
  const byCode = new Map()
  const bySubject = new Map()
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(file)
    bySubject.set(subjectSlug, { file, payload })
    for (const record of payload.standards || []) {
      if (record.code) byCode.set(record.code, { record, subjectSlug, payload, file })
    }
  }
  return { byCode, bySubject }
}

function candidateRecords(candidateRoots, errors) {
  const records = []
  for (const root of candidateRoots) {
    if (!existsSync(root)) {
      errors.push(`Missing candidate root: ${root}`)
      continue
    }
    const summaryPath = join(root, 'h4g_publication_review_decisions_apply_summary.json')
    if (existsSync(summaryPath)) {
      const summary = readJson(summaryPath)
      if (summary.valid !== true) errors.push(`${root} apply summary is not valid`)
      if (summary.official_standard_text_changed !== false) errors.push(`${root} summary reports official text changes`)
      if ((summary.totals?.pending_standard_decisions || 0) > 0) errors.push(`${root} has pending standard decisions`)
    }
    for (const file of subjectFiles(root)) {
      const payload = readJson(file)
      for (const record of payload.standards || []) {
        if (TARGET_GRADE_BANDS.has(record.grade_band) && hasApprovedUnitEvidence(record)) {
          records.push({ root, record })
        }
      }
    }
  }
  return records
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const warnings = []
  if (!args.candidateRoots.length) errors.push('At least one --candidate-root or --candidate-roots value is required')
  if (args.write && !args.confirm) errors.push('--write requires --confirm-reviewed-h4g-publication')
  if (!existsSync(args.publicDataRoot)) errors.push(`Missing public data root: ${args.publicDataRoot}`)

  const publicData = loadPublic(args.publicDataRoot)
  const candidates = candidateRecords(args.candidateRoots, errors)
  const seen = new Set()
  const changedSubjects = new Set()
  const applied = []
  const skipped = []

  for (const { root, record: candidate } of candidates) {
    const code = candidate.code
    if (!code) {
      warnings.push(`${root} contains approved candidate without code`)
      continue
    }
    if (seen.has(code)) {
      errors.push(`${code} appears in multiple candidate roots; resolve conflict before publishing`)
      continue
    }
    seen.add(code)
    const target = publicData.byCode.get(code)
    if (!target) {
      errors.push(`${code} not found in public data`)
      continue
    }
    errors.push(...officialTextErrors(candidate, target.record, code))
    if (!hasPublishableFocus(candidate)) {
      errors.push(`${code} has no publishable grade_specific_focus`)
      continue
    }
    const before = Object.fromEntries(OFFICIAL_TEXT_FIELDS.map(field => [field, target.record[field]]))
    for (const field of PUBLISH_FIELDS) {
      if (candidate[field] !== undefined) target.record[field] = candidate[field]
    }
    const afterErrors = officialTextErrors(before, target.record, code)
    errors.push(...afterErrors)
    changedSubjects.add(target.subjectSlug)
    applied.push({
      code,
      subject_slug: target.subjectSlug,
      grade_band: target.record.grade_band,
      review_status: target.record.review_status,
      unit_evidence_count: (target.record.textbook_unit_evidence || []).length,
      source_candidate_root: root
    })
  }

  for (const [subjectSlug, item] of publicData.bySubject.entries()) {
    if (!changedSubjects.has(subjectSlug)) continue
    refreshSubjectPayload(item.payload)
    if (args.write && errors.length === 0) writeJson(item.file, item.payload)
  }

  if (!args.write) {
    skipped.push('dry_run_only: pass --write --confirm-reviewed-h4g-publication to update public/data')
  }

  const summary = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    mode: args.write ? 'write_public_data' : 'dry_run',
    public_data_root: args.publicDataRoot,
    candidate_roots: args.candidateRoots,
    official_standard_text_changed: errors.some(error => error.includes('official field')),
    totals: {
      candidate_roots: args.candidateRoots.length,
      approved_candidate_records_seen: candidates.length,
      applied_records: applied.length,
      changed_subjects: changedSubjects.size,
      by_subject: {},
      by_grade_band: {},
      by_review_status: {}
    },
    applied,
    skipped,
    errors,
    warnings,
    next_actions: [
      `node scripts/build-indexes.js --data-root ${args.publicDataRoot}`,
      `node scripts/validate-data-indexes.js --data-root ${args.publicDataRoot}`,
      `npm run grade7_9:audit-h4g-grade-differentiation -- --data-root ${args.publicDataRoot}`,
      `npm run grade7_9:audit-h4g-distinctiveness -- --data-root ${args.publicDataRoot} --strict`
    ]
  }
  for (const row of applied) {
    countInto(summary.totals.by_subject, row.subject_slug)
    countInto(summary.totals.by_grade_band, row.grade_band)
    countInto(summary.totals.by_review_status, row.review_status)
  }

  writeJson(args.summaryOut, summary)
  console.log(JSON.stringify(stable(summary), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
