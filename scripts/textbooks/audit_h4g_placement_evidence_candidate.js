#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_placement_evidence_candidate.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_placement_evidence_candidate_audit.json'
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])

function parseArgs(argv) {
  const args = {
    candidate: DEFAULT_CANDIDATE,
    out: DEFAULT_OUT,
    strict: false,
    requireCandidates: false,
    requireCrossGradeEvidence: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-candidates') args.requireCandidates = true
    else if (item === '--require-cross-grade-evidence') args.requireCrossGradeEvidence = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_placement_evidence_candidate.js \\
  --candidate generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_placement_evidence_candidate.json \\
  --strict --require-candidates --require-cross-grade-evidence

Audits an H4G edition-placement evidence candidate pack. The audit ensures the
pack remains read-only and that cross-grade textbook units are diagnostic only,
not same-grade standard evidence.`)
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
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function auditUnit(unit, candidate, expectedRelation, errors, stats) {
  const prefix = `${candidate.progression_group_id || candidate.candidate_id}/${unit.source_standard_code || 'missing-standard'}/${unit.unit_evidence_id || 'missing-unit'}`
  const required = [
    'source_standard_code',
    'source_standard_grade_band',
    'unit_evidence_id',
    'textbook_evidence_id',
    'unit_title',
    'edition',
    'unit_grade_band',
    'grade_relation',
    'matched_terms'
  ]
  for (const field of required) {
    if (!hasValue(unit[field])) errors.push(`${prefix} missing ${field}`)
  }
  if (!TARGET_GRADE_BANDS.has(unit.source_standard_grade_band)) {
    errors.push(`${prefix} invalid source_standard_grade_band: ${unit.source_standard_grade_band || 'missing'}`)
  }
  if (!TARGET_GRADE_BANDS.has(unit.unit_grade_band)) {
    errors.push(`${prefix} invalid unit_grade_band: ${unit.unit_grade_band || 'missing'}`)
  }
  if (unit.grade_relation !== expectedRelation) {
    errors.push(`${prefix} expected grade_relation ${expectedRelation}, got ${unit.grade_relation || 'missing'}`)
  }
  if (expectedRelation === 'cross_grade' && unit.source_standard_grade_band === unit.unit_grade_band) {
    errors.push(`${prefix} cross_grade unit has the same grade as its source standard`)
  }
  if (expectedRelation === 'same_grade' && unit.source_standard_grade_band !== unit.unit_grade_band) {
    errors.push(`${prefix} same_grade unit grade does not match source standard grade`)
  }
  if (!Array.isArray(unit.matched_terms) || !unit.matched_terms.length) {
    errors.push(`${prefix} matched_terms must be a non-empty array`)
  }
  countInto(stats.by_grade_relation, unit.grade_relation)
  countInto(stats.by_unit_grade_band, unit.unit_grade_band)
  countInto(stats.by_edition, unit.edition)
}

function auditCandidate(candidate, errors, warnings, stats, args) {
  const prefix = candidate.progression_group_id || candidate.candidate_id || '(missing candidate id)'
  const required = [
    'candidate_id',
    'progression_group_id',
    'subject_slug',
    'grade_bands',
    'standard_codes',
    'topic_subdomains',
    'candidate_type',
    'evidence_granularity',
    'review_status',
    'review_standards',
    'placement_evidence',
    'interpretation',
    'safety'
  ]
  for (const field of required) {
    if (!hasValue(candidate[field])) errors.push(`${prefix} missing ${field}`)
  }
  if (Object.prototype.hasOwnProperty.call(candidate, 'proposed_update')) {
    errors.push(`${prefix} must not contain proposed_update`)
  }
  if (candidate.candidate_type !== 'edition_topic_placement_candidate') {
    errors.push(`${prefix} invalid candidate_type: ${candidate.candidate_type || 'missing'}`)
  }
  if (candidate.evidence_granularity !== 'textbook_topic_placement_diagnostic') {
    errors.push(`${prefix} invalid evidence_granularity: ${candidate.evidence_granularity || 'missing'}`)
  }
  if (candidate.review_status !== 'placement_evidence_candidate_needs_review') {
    errors.push(`${prefix} review_status must remain placement_evidence_candidate_needs_review`)
  }
  if (candidate.safety?.writes_public_data !== false) errors.push(`${prefix} safety.writes_public_data must be false`)
  if (candidate.safety?.writes_textbook_unit_evidence_ids !== false) {
    errors.push(`${prefix} safety.writes_textbook_unit_evidence_ids must be false`)
  }
  if (candidate.safety?.official_standard_text_changed !== false) {
    errors.push(`${prefix} safety.official_standard_text_changed must be false`)
  }
  if (candidate.safety?.cross_grade_evidence_is_diagnostic_only !== true) {
    errors.push(`${prefix} safety.cross_grade_evidence_is_diagnostic_only must be true`)
  }
  if (candidate.interpretation?.cross_grade_units_are_same_grade_evidence !== false) {
    errors.push(`${prefix} interpretation.cross_grade_units_are_same_grade_evidence must be false`)
  }
  if (candidate.interpretation?.cross_grade_units_explain_edition_placement !== true) {
    errors.push(`${prefix} interpretation.cross_grade_units_explain_edition_placement must be true`)
  }

  const reviewStandards = Array.isArray(candidate.review_standards) ? candidate.review_standards : []
  if (!reviewStandards.length) errors.push(`${prefix} has no review_standards`)
  for (const row of reviewStandards) {
    const rowPrefix = `${prefix}/${row.standard_code || 'missing-standard'}`
    if (!row.standard_code) errors.push(`${rowPrefix} missing standard_code`)
    if (!TARGET_GRADE_BANDS.has(row.grade_band)) errors.push(`${rowPrefix} invalid grade_band: ${row.grade_band || 'missing'}`)
    if (!Array.isArray(row.missing_editions_with_cross_grade_topic) || !row.missing_editions_with_cross_grade_topic.length) {
      errors.push(`${rowPrefix} missing_editions_with_cross_grade_topic must be non-empty`)
    }
  }

  const same = candidate.placement_evidence?.same_grade_units || []
  const cross = candidate.placement_evidence?.cross_grade_units || []
  if (!Array.isArray(same)) errors.push(`${prefix} same_grade_units must be an array`)
  if (!Array.isArray(cross)) errors.push(`${prefix} cross_grade_units must be an array`)
  if (args.requireCrossGradeEvidence && !cross.length) errors.push(`${prefix} missing cross-grade placement evidence`)
  for (const unit of same) auditUnit(unit, candidate, 'same_grade', errors, stats)
  for (const unit of cross) auditUnit(unit, candidate, 'cross_grade', errors, stats)

  if (!cross.length) warnings.push(`${prefix} has no cross-grade units; it may not explain edition placement`)
  stats.candidates += 1
  stats.review_standards += reviewStandards.length
  stats.same_grade_units += same.length
  stats.cross_grade_units += cross.length
  for (const grade of candidate.grade_bands || []) countInto(stats.by_candidate_grade_band, grade)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const warnings = []
  const stats = {
    candidates: 0,
    review_standards: 0,
    same_grade_units: 0,
    cross_grade_units: 0,
    by_candidate_grade_band: {},
    by_grade_relation: {},
    by_unit_grade_band: {},
    by_edition: {}
  }

  if (!existsSync(args.candidate)) errors.push(`Missing placement candidate: ${args.candidate}`)
  const payload = errors.length ? { candidates: [] } : readJson(args.candidate)

  if (payload.policy?.writes_public_data !== false) errors.push('policy.writes_public_data must be false')
  if (payload.policy?.cross_grade_units_are_diagnostic_only !== true) {
    errors.push('policy.cross_grade_units_are_diagnostic_only must be true')
  }
  for (const candidate of payload.candidates || []) auditCandidate(candidate, errors, warnings, stats, args)
  if (args.requireCandidates && !stats.candidates) errors.push('requireCandidates is set but no candidates exist')
  if (args.requireCrossGradeEvidence && !stats.cross_grade_units) {
    errors.push('requireCrossGradeEvidence is set but no cross-grade units exist')
  }

  const result = {
    valid: errors.length === 0,
    candidate: args.candidate,
    require_candidates: args.requireCandidates,
    require_cross_grade_evidence: args.requireCrossGradeEvidence,
    summary: stats,
    errors,
    warnings
  }
  if (args.out) writeJson(args.out, result)
  console.log(JSON.stringify(result, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
