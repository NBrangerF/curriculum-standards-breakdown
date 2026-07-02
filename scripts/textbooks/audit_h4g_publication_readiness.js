#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const BASE_DIR = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean'
const DEFAULT_REVIEW_PACKET = `${BASE_DIR}/h4g_publication_review_packet.json`
const DEFAULT_CONTRACT = `${BASE_DIR}/h4g_publication_contract_candidate.json`
const DEFAULT_APPLY_SUMMARY = `${BASE_DIR}/data_candidate_publication_contract/h4g_publication_contract_apply_summary.json`
const DEFAULT_NOTES = `${BASE_DIR}/data_candidate_publication_contract/h4g_progression_notes.json`
const DEFAULT_CANDIDATE_DATA_ROOT = `${BASE_DIR}/data_candidate_publication_contract`
const DEFAULT_PUBLIC_DATA_ROOT = 'public/data'
const DEFAULT_OUT = `${BASE_DIR}/h4g_publication_readiness_audit.json`
const DEFAULT_SUMMARY_OUT = `${BASE_DIR}/h4g_publication_readiness_audit.md`

const OFFICIAL_STANDARD_FIELDS = [
  'domain',
  'subdomain',
  'standard',
  'context',
  'practice',
  'teaching_tip',
  'assessment_evidence_type'
]

const REQUIRED_SURFACES = [
  'standard_same_grade_unit_evidence',
  'progression_group_edition_placement_note',
  'blocked_review_registry'
]

function parseArgs(argv) {
  const args = {
    reviewPacket: DEFAULT_REVIEW_PACKET,
    contract: DEFAULT_CONTRACT,
    applySummary: DEFAULT_APPLY_SUMMARY,
    notes: DEFAULT_NOTES,
    candidateDataRoot: DEFAULT_CANDIDATE_DATA_ROOT,
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--review-packet') args.reviewPacket = argv[++i]
    else if (item === '--contract') args.contract = argv[++i]
    else if (item === '--apply-summary') args.applySummary = argv[++i]
    else if (item === '--notes') args.notes = argv[++i]
    else if (item === '--candidate-data-root') args.candidateDataRoot = argv[++i]
    else if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_publication_readiness.js \\
  --strict

Audits the H4G publication review packet, contract candidate, dry-run candidate
data root, progression notes, and blocked registry boundaries. A valid audit
means the artifacts are safe for manual/curriculum review; it does not mark the
data as ready for public publication.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function sameJson(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
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

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadRecords(dataRoot) {
  const byCode = new Map()
  const bySubject = {}
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(file)
    const standards = payload.standards || []
    bySubject[subjectSlug] = standards.length
    for (const record of standards) {
      if (record.code) byCode.set(record.code, record)
    }
  }
  return { byCode, bySubject }
}

function artifactExists(args, errors) {
  for (const [label, path] of [
    ['review packet', args.reviewPacket],
    ['contract candidate', args.contract],
    ['apply summary', args.applySummary],
    ['progression notes', args.notes],
    ['candidate data root', args.candidateDataRoot],
    ['public data root', args.publicDataRoot]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
}

function policyFalse(payload, path, field, errors) {
  const value = field.split('.').reduce((cursor, key) => cursor?.[key], payload)
  if (value !== false) errors.push(`${path} must be false`)
}

function auditPolicies(reviewPacket, contract, applySummary, notes, errors) {
  if (reviewPacket.valid !== true) errors.push('review packet valid must be true')
  if (contract.valid !== true) errors.push('contract candidate valid must be true')
  if (applySummary.valid !== true) errors.push('apply summary valid must be true')

  for (const [label, payload] of [
    ['review packet', reviewPacket],
    ['contract candidate', contract]
  ]) {
    policyFalse(payload, `${label} policy.writes_public_data`, 'policy.writes_public_data', errors)
    policyFalse(payload, `${label} policy.writes_standard_records`, 'policy.writes_standard_records', errors)
    policyFalse(payload, `${label} policy.writes_textbook_unit_evidence_ids`, 'policy.writes_textbook_unit_evidence_ids', errors)
    policyFalse(payload, `${label} policy.official_standard_text_changed`, 'policy.official_standard_text_changed', errors)
  }

  if (applySummary.writes_public_data !== false) errors.push('apply summary writes_public_data must be false')
  if (applySummary.official_standard_text_changed !== false) {
    errors.push('apply summary official_standard_text_changed must be false')
  }
  if (notes.data_scope !== 'h4g_progression_notes_candidate') errors.push('notes data_scope must be h4g_progression_notes_candidate')
  if (notes.publication_candidate !== false) errors.push('notes publication_candidate must be false')
  if (notes.writes_public_data !== false) errors.push('notes writes_public_data must be false')
  if (notes.official_standard_text_changed !== false) errors.push('notes official_standard_text_changed must be false')
}

function auditCountConsistency(reviewPacket, contract, applySummary, notes, errors, warnings) {
  const reviewSummary = reviewPacket.summary || {}
  const contractSummary = contract.summary || {}
  const applyTotals = applySummary.totals || {}
  const checks = [
    ['same-grade standard reviews', reviewSummary.ready_same_grade_standard_reviews, contractSummary.standard_unit_evidence_contracts],
    ['same-grade applied records', contractSummary.standard_unit_evidence_contracts, applyTotals.applied_standard_records],
    ['unit evidence objects', reviewSummary.ready_unit_evidence_objects, contractSummary.candidate_unit_evidence_objects],
    ['unit evidence applied objects', contractSummary.candidate_unit_evidence_objects, applyTotals.unit_evidence_objects_added],
    ['edition-placement notes', reviewSummary.edition_placement_note_reviews, contractSummary.edition_placement_note_contracts],
    ['notes applied', contractSummary.edition_placement_note_contracts, applyTotals.notes],
    ['notes collection records', applyTotals.notes, (notes.notes || []).length],
    ['blocked registry contracts', reviewSummary.blocked_reviews, contractSummary.blocked_registry_contracts],
    ['blocked apply summary contracts', contractSummary.blocked_registry_contracts, applyTotals.blocked_registry_contracts]
  ]
  for (const [label, left, right] of checks) {
    if (left !== right) errors.push(`${label} mismatch: ${left} != ${right}`)
  }
  if ((applyTotals.missing_standard_records || 0) !== 0) errors.push('apply summary missing_standard_records must be 0')
  if ((reviewSummary.not_in_current_unit_candidate_scope || 0) > 0) {
    warnings.push(`${reviewSummary.not_in_current_unit_candidate_scope} standards remain outside current unit candidate scope`)
  }
}

function auditContractSurfaces(contract, errors) {
  const surfaces = contract.contract?.surfaces || []
  const byId = new Map(surfaces.map(surface => [surface.surface_id, surface]))
  for (const id of REQUIRED_SURFACES) {
    if (!byId.has(id)) errors.push(`contract missing surface ${id}`)
  }
  const standardSurface = byId.get('standard_same_grade_unit_evidence') || {}
  const allowed = new Set(standardSurface.allowed_fields || [])
  for (const field of [
    'textbook_evidence_ids',
    'textbook_unit_evidence_ids',
    'textbook_unit_evidence',
    'evidence_granularity',
    'review_status',
    'h4g_unit_candidate_requires_manual_review'
  ]) {
    if (!allowed.has(field)) errors.push(`standard surface allowed_fields missing ${field}`)
  }
  for (const field of OFFICIAL_STANDARD_FIELDS) {
    if (allowed.has(field)) errors.push(`standard surface must not allow official field ${field}`)
  }
  const noteSurface = byId.get('progression_group_edition_placement_note') || {}
  if (noteSurface.target !== 'future additive progression-group note collection') {
    errors.push('progression-group note surface must target a future additive collection')
  }
  const blockedSurface = byId.get('blocked_review_registry') || {}
  if (blockedSurface.target !== 'generated/textbook_evidence only') {
    errors.push('blocked registry must remain generated/textbook_evidence only')
  }
}

function officialMutationErrors(publicRecord, candidateRecord, code) {
  const errors = []
  for (const field of OFFICIAL_STANDARD_FIELDS) {
    if (normalizeText(publicRecord?.[field]) !== normalizeText(candidateRecord?.[field])) {
      errors.push(`${code} mutated official field ${field}`)
    }
  }
  return errors
}

function recordChangedFields(publicRecord, candidateRecord) {
  const keys = sorted([...Object.keys(publicRecord || {}), ...Object.keys(candidateRecord || {})])
  return keys.filter(key => !sameJson(publicRecord?.[key], candidateRecord?.[key]))
}

function auditCandidateDataRoot(publicRecords, candidateRecords, contract, errors, warnings, stats) {
  const standardDrafts = contract.contract_drafts?.standard_unit_evidence || []
  const appliedCodes = new Set(standardDrafts.map(draft => draft.standard_code))
  const allowed = new Set((contract.contract?.surfaces || [])
    .find(surface => surface.surface_id === 'standard_same_grade_unit_evidence')?.allowed_fields || [])
  const publicCodes = new Set(publicRecords.byCode.keys())
  const candidateCodes = new Set(candidateRecords.byCode.keys())
  for (const code of publicCodes) {
    if (!candidateCodes.has(code)) errors.push(`candidate data root missing public standard ${code}`)
  }
  for (const code of candidateCodes) {
    if (!publicCodes.has(code)) errors.push(`candidate data root has unexpected standard ${code}`)
  }

  for (const [code, publicRecord] of publicRecords.byCode.entries()) {
    const candidateRecord = candidateRecords.byCode.get(code)
    if (!candidateRecord) continue
    const officialErrors = officialMutationErrors(publicRecord, candidateRecord, code)
    if (officialErrors.length) errors.push(...officialErrors)
    const changed = recordChangedFields(publicRecord, candidateRecord)
    if (!appliedCodes.has(code)) {
      if (changed.length) errors.push(`${code} changed outside contract standard surface: ${changed.join(', ')}`)
      continue
    }

    for (const field of changed) {
      if (!allowed.has(field)) errors.push(`${code} changed non-contract field ${field}`)
    }
    if (candidateRecord.standard_variant_type === 'grade_specific_variant') {
      errors.push(`${code} must not auto-change to grade_specific_variant`)
    }
    if (candidateRecord.h4g_unit_candidate_requires_manual_review !== true) {
      errors.push(`${code} h4g_unit_candidate_requires_manual_review must be true`)
    }
    if (candidateRecord.review_status !== 'unit_evidence_candidate_needs_review') {
      errors.push(`${code} review_status must remain unit_evidence_candidate_needs_review`)
    }
    if (!Array.isArray(candidateRecord.textbook_unit_evidence_ids) || !candidateRecord.textbook_unit_evidence_ids.length) {
      errors.push(`${code} missing textbook_unit_evidence_ids in candidate data root`)
    }
    if (!Array.isArray(candidateRecord.textbook_unit_evidence) || !candidateRecord.textbook_unit_evidence.length) {
      errors.push(`${code} missing textbook_unit_evidence in candidate data root`)
    }
    if (candidateRecord.evidence_granularity !== 'textbook_unit_level') {
      errors.push(`${code} evidence_granularity must be textbook_unit_level in candidate data root`)
    }
    if (candidateRecord.requires_unit_level_evidence !== false) {
      errors.push(`${code} requires_unit_level_evidence must be false in candidate data root`)
    }
    if (!changed.length) warnings.push(`${code} is in contract standard surface but no fields changed`)
    stats.changed_standard_records += 1
    stats.changed_fields_by_code[code] = changed
    countInto(stats.by_grade_band, candidateRecord.grade_band)
    countInto(stats.by_review_status, candidateRecord.review_status)
  }
}

function auditNotes(notes, contract, errors, stats) {
  const noteDrafts = contract.contract_drafts?.progression_group_edition_placement_notes || []
  const draftIds = new Set(noteDrafts.map(note => note.note_id))
  const noteIds = new Set()
  for (const note of notes.notes || []) {
    const prefix = note.note_id || '(missing note_id)'
    if (!note.note_id) errors.push('progression note missing note_id')
    if (noteIds.has(note.note_id)) errors.push(`${prefix} duplicate note_id`)
    else noteIds.add(note.note_id)
    if (!draftIds.has(note.note_id)) errors.push(`${prefix} not present in contract note drafts`)
    if (note.publication_surface !== 'progression_group_edition_placement_note') {
      errors.push(`${prefix} publication_surface must be progression_group_edition_placement_note`)
    }
    if (note.review_status !== 'candidate_note_needs_curriculum_progression_review') {
      errors.push(`${prefix} review_status must require curriculum progression review`)
    }
    if (note.safety?.cross_grade_evidence_is_diagnostic_only !== true) {
      errors.push(`${prefix} safety.cross_grade_evidence_is_diagnostic_only must be true`)
    }
    if (note.safety?.writes_textbook_unit_evidence_ids !== false) {
      errors.push(`${prefix} safety.writes_textbook_unit_evidence_ids must be false`)
    }
    if (note.safety?.official_standard_text_changed !== false) {
      errors.push(`${prefix} safety.official_standard_text_changed must be false`)
    }
    for (const field of ['textbook_unit_evidence_ids', ...OFFICIAL_STANDARD_FIELDS]) {
      if (Object.prototype.hasOwnProperty.call(note, field)) errors.push(`${prefix} must not contain ${field}`)
    }
    countInto(stats.note_statuses, note.review_status)
    countInto(stats.note_surfaces, note.publication_surface)
  }
}

function auditBlocked(contract, errors, stats) {
  const standardCodes = new Set((contract.contract_drafts?.standard_unit_evidence || []).map(row => row.standard_code))
  const noteCodes = new Set((contract.contract_drafts?.progression_group_edition_placement_notes || [])
    .flatMap(row => row.affected_standard_codes || []))
  for (const blocked of contract.contract_drafts?.blocked_review_registry || []) {
    const prefix = blocked.review_id || blocked.progression_group_id || '(missing blocked review)'
    if (blocked.publication_surface !== 'none_until_remediated') {
      errors.push(`${prefix} blocked publication_surface must be none_until_remediated`)
    }
    if (blocked.future_publication_condition !== 'none_until_remediated') {
      errors.push(`${prefix} future_publication_condition must be none_until_remediated`)
    }
    if (blocked.safety?.writes_public_data !== false) errors.push(`${prefix} safety.writes_public_data must be false`)
    if (blocked.safety?.writes_textbook_unit_evidence_ids_now !== false) {
      errors.push(`${prefix} safety.writes_textbook_unit_evidence_ids_now must be false`)
    }
    for (const code of blocked.affected_standard_codes || []) {
      if (standardCodes.has(code)) errors.push(`${code} appears in blocked registry and standard unit surface`)
      if (noteCodes.has(code)) errors.push(`${code} appears in blocked registry and edition-placement note surface`)
    }
    countInto(stats.blocked_review_types, blocked.review_type)
  }
}

function buildReadiness(reviewPacket, contract, applySummary, errors, warnings) {
  const summary = reviewPacket.summary || {}
  const blockingReasons = [
    'manual same-grade unit evidence review not recorded',
    'curriculum progression review for edition-placement notes not recorded',
    'frontend/schema consumption for progression-group note collection not implemented',
    'public migration gate intentionally absent'
  ]
  if ((summary.not_in_current_unit_candidate_scope || 0) > 0) {
    blockingReasons.push(`${summary.not_in_current_unit_candidate_scope} math H4G standards remain outside current unit candidate scope`)
  }
  if ((summary.blocked_reviews || 0) > 0) {
    blockingReasons.push(`${summary.blocked_reviews} blocked reviews have no public surface`)
  }
  return {
    safety_audit_ready: errors.length === 0,
    manual_review_ready: errors.length === 0 && (applySummary.totals?.applied_standard_records || 0) > 0,
    public_migration_ready: false,
    publication_ready: false,
    readiness_level: errors.length ? 'blocked_by_audit_errors' : 'ready_for_manual_review_not_publication',
    blocking_reasons: errors.length ? ['audit errors must be fixed before review'] : blockingReasons,
    warnings
  }
}

function markdownSummary(result) {
  return `# H4G Publication Readiness Audit

Generated at: ${result.generated_at}

## Decision

| Field | Value |
| --- | --- |
| valid | ${result.valid} |
| readiness level | ${result.readiness.readiness_level} |
| manual review ready | ${result.readiness.manual_review_ready} |
| publication ready | ${result.readiness.publication_ready} |
| public migration ready | ${result.readiness.public_migration_ready} |

## Counts

| Metric | Count |
| --- | ---: |
| standard contracts | ${result.summary.standard_contracts} |
| applied standard records | ${result.summary.applied_standard_records} |
| unit evidence objects | ${result.summary.unit_evidence_objects} |
| progression note candidates | ${result.summary.progression_note_candidates} |
| blocked registry contracts | ${result.summary.blocked_registry_contracts} |
| not in current unit candidate scope | ${result.summary.not_in_current_unit_candidate_scope} |

## Applied Records By Grade

| Grade band | Records |
| --- | ---: |
${countRows(result.summary.by_grade_band)}

## Remaining Publication Blockers

${result.readiness.blocking_reasons.map(reason => `- ${reason}`).join('\n')}

## Errors

${result.errors.length ? result.errors.map(error => `- ${error}`).join('\n') : '- none'}

## Warnings

${result.warnings.length ? result.warnings.map(warning => `- ${warning}`).join('\n') : '- none'}

## Interpretation

This audit proves only that the current H4G publication artifacts are internally
consistent and safe to hand to manual/curriculum review. It intentionally keeps
\`publication_ready=false\`: no official standard text is changed, blocked items
stay out of public surfaces, and progression-group notes still need schema/UI
approval before any public migration.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const warnings = []
  artifactExists(args, errors)
  if (resolve(args.candidateDataRoot) === resolve(args.publicDataRoot)) {
    errors.push('candidate data root must differ from public data root')
  }
  if (errors.length) {
    const result = { valid: false, errors, warnings }
    console.log(JSON.stringify(result, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const reviewPacket = readJson(args.reviewPacket)
  const contract = readJson(args.contract)
  const applySummary = readJson(args.applySummary)
  const notes = readJson(args.notes)
  const publicRecords = loadRecords(args.publicDataRoot)
  const candidateRecords = loadRecords(args.candidateDataRoot)
  const stats = {
    blocked_review_types: {},
    by_grade_band: {},
    by_review_status: {},
    changed_fields_by_code: {},
    changed_standard_records: 0,
    note_statuses: {},
    note_surfaces: {}
  }

  auditPolicies(reviewPacket, contract, applySummary, notes, errors)
  auditCountConsistency(reviewPacket, contract, applySummary, notes, errors, warnings)
  auditContractSurfaces(contract, errors)
  auditCandidateDataRoot(publicRecords, candidateRecords, contract, errors, warnings, stats)
  auditNotes(notes, contract, errors, stats)
  auditBlocked(contract, errors, stats)

  const readiness = buildReadiness(reviewPacket, contract, applySummary, errors, warnings)
  const result = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    review_packet: args.reviewPacket,
    contract_candidate: args.contract,
    apply_summary: args.applySummary,
    progression_notes: args.notes,
    public_data_root: args.publicDataRoot,
    candidate_data_root: args.candidateDataRoot,
    summary: {
      applied_standard_records: applySummary.totals?.applied_standard_records || 0,
      blocked_registry_contracts: contract.summary?.blocked_registry_contracts || 0,
      by_grade_band: stats.by_grade_band,
      by_review_status: stats.by_review_status,
      changed_standard_records: stats.changed_standard_records,
      note_statuses: stats.note_statuses,
      note_surfaces: stats.note_surfaces,
      not_in_current_unit_candidate_scope: reviewPacket.summary?.not_in_current_unit_candidate_scope || 0,
      progression_note_candidates: (notes.notes || []).length,
      standard_contracts: contract.summary?.standard_unit_evidence_contracts || 0,
      unit_evidence_objects: applySummary.totals?.unit_evidence_objects_added || 0
    },
    readiness,
    errors,
    warnings
  }

  writeJson(args.out, result)
  writeText(args.summaryOut, markdownSummary(result))
  console.log(JSON.stringify(stable(result), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
