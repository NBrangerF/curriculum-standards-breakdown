#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_unit_evidence_candidate.json'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_candidate_audit.json'
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])
const OFFICIAL_STANDARD_FIELDS = [
  'domain',
  'subdomain',
  'standard',
  'context',
  'practice',
  'teaching_tip',
  'assessment_evidence_type'
]
const CURRENT_STATUS_FIELDS = [
  'grade_assignment_type',
  'progression_basis',
  'review_status',
  'standard_variant_type',
  'evidence_granularity',
  'requires_unit_level_evidence',
  'progression_delta'
]
const ALLOWED_PROPOSED_UPDATE_FIELDS = new Set([
  'textbook_unit_evidence_ids',
  'evidence_granularity',
  'grade_assignment_type',
  'progression_basis',
  'progression_confidence',
  'requires_unit_level_evidence',
  'review_status',
  'grade_specific_focus',
  'progression_delta'
])
const ALLOWED_ELIGIBLE_ALIGNMENT = new Set([
  'subdomain_anchor',
  'reviewed_alias_anchor',
  'strong_field_alignment',
  'reviewed_subject_theme_bridge'
])

function parseArgs(argv) {
  const args = {
    candidate: DEFAULT_CANDIDATE,
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    strict: false,
    requireCandidates: false,
    requirePageStart: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-candidates') args.requireCandidates = true
    else if (item === '--require-page-start') args.requirePageStart = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_unit_evidence_candidate.js \\
  --candidate generated/textbook_evidence/h4g_unit_evidence_candidate.json \\
  --data-root public/data \\
  --strict --require-candidates --require-page-start

Audits an H4G unit-evidence candidate pack before it is applied to a candidate
data root. The audit verifies that candidates are reviewable pre-publication
artifacts and do not mutate official standard fields. Use --require-page-start
when the pack is meant to support grade-by-grade H4G differentiation with
textbook unit page evidence.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function sameStringArray(a, b) {
  const left = [...(a || [])].map(String).sort((x, y) => x.localeCompare(y))
  const right = [...(b || [])].map(String).sort((x, y) => x.localeCompare(y))
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadStandardsByCode(dataRoot) {
  const byCode = new Map()
  for (const file of subjectFiles(dataRoot)) {
    const payload = readJson(file)
    for (const record of payload.standards || []) {
      if (record.code) byCode.set(record.code, record)
    }
  }
  return byCode
}

function compareOfficialFields(candidate, record, errors) {
  const prefix = candidate.standard_code || candidate.candidate_id || '(missing candidate id)'
  if (!candidate.official_standard_fields || typeof candidate.official_standard_fields !== 'object') {
    errors.push(`${prefix} missing official_standard_fields`)
    return
  }
  for (const field of OFFICIAL_STANDARD_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(candidate.official_standard_fields, field)) {
      errors.push(`${prefix} official_standard_fields missing ${field}`)
      continue
    }
    if (normalizeText(candidate.official_standard_fields[field]) !== normalizeText(record[field])) {
      errors.push(`${prefix} official_standard_fields.${field} does not match public data`)
    }
  }
}

function compareCurrentStatus(candidate, record, warnings) {
  const prefix = candidate.standard_code || candidate.candidate_id || '(missing candidate id)'
  const status = candidate.current_record_status || {}
  for (const field of CURRENT_STATUS_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(status, field)) {
      warnings.push(`${prefix} current_record_status missing ${field}`)
      continue
    }
    if (field === 'requires_unit_level_evidence') {
      if ((status[field] ?? null) !== (record[field] ?? null)) {
        warnings.push(`${prefix} current_record_status.${field} differs from public data`)
      }
    } else if (normalizeText(status[field]) !== normalizeText(record[field])) {
      warnings.push(`${prefix} current_record_status.${field} differs from public data`)
    }
  }
  if (!sameStringArray(status.textbook_unit_evidence_ids || [], record.textbook_unit_evidence_ids || [])) {
    warnings.push(`${prefix} current_record_status.textbook_unit_evidence_ids differs from public data`)
  }
}

function auditUnitEvidence(candidate, errors, warnings, stats, args) {
  const prefix = candidate.standard_code || candidate.candidate_id || '(missing candidate id)'
  const units = Array.isArray(candidate.unit_evidence) ? candidate.unit_evidence : []
  if (!units.length) errors.push(`${prefix} has no unit_evidence`)
  const seenUnitIds = new Set()
  for (const unit of units) {
    const unitPrefix = `${prefix}/${unit.unit_evidence_id || '(missing unit_evidence_id)'}`
    const required = [
      'unit_evidence_id',
      'textbook_evidence_id',
      'unit_title',
      'unit_candidate_type',
      'evidence_granularity',
      'match_id',
      'score',
      'confidence_band',
      'matched_keywords',
      'matched_fields',
      'eligible_alignment',
      'rationale'
    ]
    for (const field of required) {
      if (!hasValue(unit[field])) errors.push(`${unitPrefix} missing ${field}`)
    }
    if (seenUnitIds.has(unit.unit_evidence_id)) errors.push(`${unitPrefix} duplicate unit_evidence_id in candidate`)
    else if (unit.unit_evidence_id) seenUnitIds.add(unit.unit_evidence_id)
    if (unit.unit_candidate_type !== 'toc_unit_or_chapter') {
      errors.push(`${unitPrefix} unit_candidate_type must be toc_unit_or_chapter`)
    }
    if (unit.evidence_granularity !== 'textbook_unit_or_chapter_candidate') {
      errors.push(`${unitPrefix} evidence_granularity must be textbook_unit_or_chapter_candidate`)
    }
    if (typeof unit.score !== 'number' || unit.score < 0 || unit.score > 1) {
      errors.push(`${unitPrefix} score must be 0..1`)
    }
    if (unit.confidence_band === 'low' || unit.confidence_band === 'below_threshold') {
      warnings.push(`${unitPrefix} has ${unit.confidence_band} confidence`)
    }
    if (!Array.isArray(unit.matched_keywords) || !unit.matched_keywords.length) {
      errors.push(`${unitPrefix} matched_keywords must be a non-empty array`)
    }
    if (!Array.isArray(unit.matched_fields) || !unit.matched_fields.length) {
      errors.push(`${unitPrefix} matched_fields must be a non-empty array`)
    }
    if (!ALLOWED_ELIGIBLE_ALIGNMENT.has(unit.eligible_alignment)) {
      errors.push(`${unitPrefix} invalid eligible_alignment: ${unit.eligible_alignment || 'missing'}`)
    }
    if (unit.eligible_alignment === 'subdomain_anchor' && !unit.subdomain_alignment?.matched) {
      errors.push(`${unitPrefix} subdomain_anchor alignment missing subdomain_alignment.matched`)
    }
    if (unit.eligible_alignment === 'reviewed_alias_anchor') {
      if (!unit.alias_alignment?.matched) errors.push(`${unitPrefix} reviewed_alias_anchor alignment missing alias_alignment.matched`)
      if (!Array.isArray(unit.alias_alignment?.matched_terms) || !unit.alias_alignment.matched_terms.length) {
        errors.push(`${unitPrefix} reviewed_alias_anchor requires matched_terms`)
      }
      if (!Array.isArray(unit.alias_alignment?.reviewed_aliases) || !unit.alias_alignment.reviewed_aliases.length) {
        errors.push(`${unitPrefix} reviewed_alias_anchor requires reviewed_aliases`)
      }
    }
    if (unit.eligible_alignment === 'strong_field_alignment') {
      if (!unit.field_alignment?.matched) errors.push(`${unitPrefix} strong_field_alignment missing field_alignment.matched`)
      if (!Array.isArray(unit.field_alignment?.evidence_fields) || unit.field_alignment.evidence_fields.length < 2) {
        errors.push(`${unitPrefix} strong_field_alignment requires at least two evidence_fields`)
      }
      if (!Array.isArray(unit.field_alignment?.matched_keywords) || !unit.field_alignment.matched_keywords.length) {
        errors.push(`${unitPrefix} strong_field_alignment requires matched_keywords`)
      }
    }
    if (unit.eligible_alignment === 'reviewed_subject_theme_bridge') {
      if (!unit.subject_theme_bridge_alignment?.matched) {
        errors.push(`${unitPrefix} reviewed_subject_theme_bridge missing subject_theme_bridge_alignment.matched`)
      }
      if (!Array.isArray(unit.subject_theme_bridge_alignment?.matched_topic_tags) || !unit.subject_theme_bridge_alignment.matched_topic_tags.length) {
        errors.push(`${unitPrefix} reviewed_subject_theme_bridge requires matched_topic_tags`)
      }
      if (!Array.isArray(unit.subject_theme_bridge_alignment?.reviewed_bridges) || !unit.subject_theme_bridge_alignment.reviewed_bridges.length) {
        errors.push(`${unitPrefix} reviewed_subject_theme_bridge requires reviewed_bridges`)
      }
    }
    if (hasValue(unit.page_start)) {
      stats.page_start_records += 1
      if (!Number.isInteger(Number(unit.page_start)) || Number(unit.page_start) < 1) {
        errors.push(`${unitPrefix} page_start must be a positive integer when present`)
      }
    } else {
      warnings.push(`${unitPrefix} missing page_start`)
      if (args.requirePageStart) errors.push(`${unitPrefix} missing page_start while requirePageStart is set`)
    }
    if (hasValue(unit.page_range)) stats.page_range_records += 1
    countInto(stats.by_page_range_status, unit.page_range_status || 'missing')
    countInto(stats.by_eligible_alignment, unit.eligible_alignment)
  }
}

function auditProposedUpdate(candidate, errors, warnings) {
  const prefix = candidate.standard_code || candidate.candidate_id || '(missing candidate id)'
  const proposed = candidate.proposed_update || {}
  if (!candidate.proposed_update || typeof candidate.proposed_update !== 'object') {
    errors.push(`${prefix} missing proposed_update`)
    return
  }
  for (const field of Object.keys(proposed)) {
    if (!ALLOWED_PROPOSED_UPDATE_FIELDS.has(field)) {
      warnings.push(`${prefix} proposed_update contains unrecognized field: ${field}`)
    }
    if (OFFICIAL_STANDARD_FIELDS.includes(field)) {
      errors.push(`${prefix} proposed_update must not contain official field ${field}`)
    }
  }
  const unitIds = (candidate.unit_evidence || []).map(unit => unit.unit_evidence_id).filter(Boolean)
  if (!sameStringArray(proposed.textbook_unit_evidence_ids || [], unitIds)) {
    errors.push(`${prefix} proposed_update.textbook_unit_evidence_ids must match unit_evidence ids`)
  }
  if (proposed.evidence_granularity !== 'textbook_unit_level') {
    errors.push(`${prefix} proposed_update.evidence_granularity must be textbook_unit_level`)
  }
  if (proposed.review_status !== 'unit_evidence_candidate_needs_review') {
    errors.push(`${prefix} proposed_update.review_status must remain unit_evidence_candidate_needs_review`)
  }
  if (proposed.requires_unit_level_evidence !== false) {
    errors.push(`${prefix} proposed_update.requires_unit_level_evidence must be false`)
  }
  if (typeof proposed.progression_confidence !== 'number' || proposed.progression_confidence < 0 || proposed.progression_confidence > 1) {
    errors.push(`${prefix} proposed_update.progression_confidence must be 0..1`)
  }
  if (!normalizeText(proposed.grade_specific_focus).includes('候选')) {
    warnings.push(`${prefix} proposed grade_specific_focus should clearly say it is a candidate`)
  }
  if (!normalizeText(proposed.grade_specific_focus).includes('课标原文')) {
    warnings.push(`${prefix} proposed grade_specific_focus should say official standard text is unchanged`)
  }
  if (!normalizeText(proposed.progression_delta).startsWith('unit_evidence_candidate:')) {
    warnings.push(`${prefix} proposed progression_delta should keep the unit_evidence_candidate marker`)
  }
}

function auditSafety(candidate, errors) {
  const prefix = candidate.standard_code || candidate.candidate_id || '(missing candidate id)'
  if (candidate.safety?.writes_public_data !== false) errors.push(`${prefix} safety.writes_public_data must be false`)
  if (candidate.safety?.official_standard_text_changed !== false) {
    errors.push(`${prefix} safety.official_standard_text_changed must be false`)
  }
  if (candidate.safety?.requires_manual_review !== true) errors.push(`${prefix} safety.requires_manual_review must be true`)
}

function auditCandidate(candidate, standardsByCode, errors, warnings, stats, args) {
  const prefix = candidate.standard_code || candidate.candidate_id || '(missing candidate id)'
  if (!candidate.candidate_id) errors.push(`${prefix} missing candidate_id`)
  if (!candidate.standard_code) errors.push(`${prefix} missing standard_code`)
  if (!candidate.subject_slug) errors.push(`${prefix} missing subject_slug`)
  if (!TARGET_GRADE_BANDS.has(candidate.grade_band)) {
    errors.push(`${prefix} has non-target grade_band: ${candidate.grade_band || 'missing'}`)
  }
  const record = standardsByCode.get(candidate.standard_code)
  if (!record) {
    errors.push(`${prefix} references missing public standard`)
    return
  }
  if (record.subject_slug !== candidate.subject_slug) {
    errors.push(`${prefix} subject_slug differs from public data`)
  }
  if (record.grade_band !== candidate.grade_band) {
    errors.push(`${prefix} grade_band differs from public data`)
  }
  compareOfficialFields(candidate, record, errors)
  compareCurrentStatus(candidate, record, warnings)
  auditUnitEvidence(candidate, errors, warnings, stats, args)
  auditProposedUpdate(candidate, errors, warnings)
  auditSafety(candidate, errors)
  countInto(stats.by_subject, candidate.subject_slug)
  countInto(stats.by_grade_band, candidate.grade_band)
  countInto(stats.by_current_review_status, candidate.current_record_status?.review_status)
  countInto(stats.by_proposed_review_status, candidate.proposed_update?.review_status)
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
    unit_evidence_objects: 0,
    by_subject: {},
    by_grade_band: {},
    by_current_review_status: {},
    by_proposed_review_status: {},
    by_eligible_alignment: {},
    by_page_range_status: {},
    page_start_records: 0,
    page_range_records: 0
  }

  if (!existsSync(args.candidate)) errors.push(`Missing candidate file: ${args.candidate}`)
  if (!existsSync(join(args.dataRoot, 'by_subject'))) errors.push(`Missing data root by_subject: ${args.dataRoot}`)
  const payload = errors.length ? { candidates: [] } : readJson(args.candidate)
  const standardsByCode = errors.length ? new Map() : loadStandardsByCode(args.dataRoot)

  if (payload.valid === false) errors.push('Candidate payload is marked valid=false')
  if (payload.policy?.writes_public_data !== false) errors.push('Candidate policy.writes_public_data must be false')
  if (payload.policy?.official_standard_text_changed !== false) {
    errors.push('Candidate policy.official_standard_text_changed must be false')
  }
  if (!Array.isArray(payload.candidates)) errors.push('Candidate payload missing candidates array')

  const seenCandidateIds = new Set()
  const seenStandardCodes = new Set()
  for (const candidate of payload.candidates || []) {
    if (candidate.candidate_id) {
      if (seenCandidateIds.has(candidate.candidate_id)) errors.push(`duplicate candidate_id: ${candidate.candidate_id}`)
      else seenCandidateIds.add(candidate.candidate_id)
    }
    if (candidate.standard_code) {
      if (seenStandardCodes.has(candidate.standard_code)) errors.push(`duplicate standard_code: ${candidate.standard_code}`)
      else seenStandardCodes.add(candidate.standard_code)
    }
    auditCandidate(candidate, standardsByCode, errors, warnings, stats, args)
  }

  stats.candidates = (payload.candidates || []).length
  stats.unit_evidence_objects = (payload.candidates || []).reduce((sum, candidate) => {
    return sum + (Array.isArray(candidate.unit_evidence) ? candidate.unit_evidence.length : 0)
  }, 0)
  if (!stats.candidates) {
    warnings.push('Candidate file contains no candidates')
    if (args.requireCandidates) errors.push('requireCandidates is set but candidate file contains no candidates')
  }

  const result = {
    valid: errors.length === 0,
    candidate: args.candidate,
    data_root: args.dataRoot,
    require_candidates: args.requireCandidates,
    require_page_start: args.requirePageStart,
    summary: stats,
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
