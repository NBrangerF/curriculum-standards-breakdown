#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const BASE_DIR = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean'
const DEFAULT_REVIEW_PACKET = `${BASE_DIR}/h4g_publication_review_packet.json`
const DEFAULT_CONTRACT = `${BASE_DIR}/h4g_publication_contract_candidate.json`
const DEFAULT_READINESS_AUDIT = `${BASE_DIR}/h4g_publication_readiness_audit.json`
const DEFAULT_OUT = `${BASE_DIR}/h4g_publication_review_decisions_template.json`
const DEFAULT_SUMMARY_OUT = `${BASE_DIR}/h4g_publication_review_decisions_template.md`

const SAME_GRADE_DECISIONS = [
  'pending',
  'approve_same_grade_unit_evidence',
  'reject_same_grade_unit_evidence',
  'needs_revision'
]
const NOTE_DECISIONS = [
  'pending',
  'approve_progression_group_note',
  'reject_progression_group_note',
  'needs_revision'
]
const BLOCKED_DECISIONS = [
  'pending',
  'keep_blocked',
  'needs_targeted_remediation'
]

function parseArgs(argv) {
  const args = {
    reviewPacket: DEFAULT_REVIEW_PACKET,
    contract: DEFAULT_CONTRACT,
    readinessAudit: DEFAULT_READINESS_AUDIT,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--review-packet') args.reviewPacket = argv[++i]
    else if (item === '--contract') args.contract = argv[++i]
    else if (item === '--readiness-audit') args.readinessAudit = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_publication_review_decisions_template.js \\
  --strict

Builds an editable manual/curriculum review decision template from the H4G
publication review packet, contract candidate, and readiness audit. The output
does not approve publication; required review decisions start as pending.`)
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

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
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

function contractDraftByCode(contract) {
  return new Map((contract.contract_drafts?.standard_unit_evidence || [])
    .filter(row => row.standard_code)
    .map(row => [row.standard_code, row]))
}

function noteDraftByGroup(contract) {
  return new Map((contract.contract_drafts?.progression_group_edition_placement_notes || [])
    .filter(row => row.progression_group_id)
    .map(row => [row.progression_group_id, row]))
}

function blockedDraftByReview(contract) {
  return new Map((contract.contract_drafts?.blocked_review_registry || [])
    .filter(row => row.grain_key || row.blocked_id)
    .map(row => [row.grain_key || row.blocked_id, row]))
}

function baseDecisionFields(review, surfaceId, allowedDecisions, owner) {
  return {
    allowed_decisions: allowedDecisions,
    decision_note: '',
    decision_status: 'pending_review',
    reviewer_decision: 'pending',
    reviewed_at: '',
    reviewed_by: '',
    review_owner: owner,
    source_review_id: review.review_id || '',
    surface_id: surfaceId
  }
}

function sameGradeDecision(review, draftByCode) {
  const draft = draftByCode.get(review.standard_code) || {}
  return {
    ...baseDecisionFields(
      review,
      'standard_same_grade_unit_evidence',
      SAME_GRADE_DECISIONS,
      'manual_same_grade_unit_review'
    ),
    approval_scope: 'same_grade_standard_unit_evidence_only',
    candidate_unit_evidence_count: review.unit_evidence_count,
    decision_id: `h4g_manual_standard_decision_${hashText(review.review_id || review.standard_code)}`,
    grade_band: review.grade_band,
    progression_group_id: review.progression_group_id,
    required_confirmations: {
      no_public_write_requested: false,
      official_standard_text_preserved: false,
      page_evidence_checked: false,
      same_grade_unit_evidence_confirmed: false
    },
    requested_official_text_change: false,
    requested_public_write: false,
    requested_standard_variant_type_change: 'none',
    same_grade_edition_count: review.same_grade_edition_count,
    same_grade_editions: review.same_grade_editions || [],
    standard_code: review.standard_code,
    subject_slug: review.subject_slug,
    unit_page_range_statuses: review.page_range_statuses || [],
    unit_alignment_types: review.eligible_alignments || [],
    source_contract_draft_id: draft.draft_id || ''
  }
}

function noteDecision(review, draftByGroup) {
  const draft = draftByGroup.get(review.progression_group_id) || {}
  return {
    ...baseDecisionFields(
      review,
      'progression_group_edition_placement_note',
      NOTE_DECISIONS,
      'curriculum_progression_review'
    ),
    affected_standard_codes: review.affected_standard_codes || [],
    approval_scope: 'progression_group_edition_placement_note_only',
    cross_grade_diagnostic_relations: review.cross_grade_diagnostic_relations,
    decision_id: `h4g_curriculum_note_decision_${hashText(review.review_id || review.progression_group_id)}`,
    edition_count: review.edition_count,
    placement_grade_bands: review.placement_grade_bands || [],
    progression_group_id: review.progression_group_id,
    required_confirmations: {
      cross_grade_evidence_remains_diagnostic: false,
      curriculum_progression_rationale_confirmed: false,
      no_same_grade_standard_evidence_write: false,
      no_standard_text_change_requested: false
    },
    requested_official_text_change: false,
    requested_public_write: false,
    requested_standard_evidence_write: false,
    source_contract_note_id: draft.note_id || '',
    standard_codes: review.standard_codes || [],
    subject_slug: review.subject_slug,
    topic_subdomains: review.topic_subdomains || []
  }
}

function blockedDecision(review, draftByReview) {
  const draft = draftByReview.get(review.review_id) || {}
  return {
    ...baseDecisionFields(
      review,
      'blocked_review_registry',
      BLOCKED_DECISIONS,
      review.review_type === 'blocked_same_grade_gap_remediation'
        ? 'unit_evidence_remediation'
        : 'curriculum_progression_review'
    ),
    affected_standard_codes: review.affected_standard_codes || [],
    blocked_reason: review.blocked_reason,
    blocking_decision: review.blocking_decision,
    decision_id: `h4g_blocked_review_decision_${hashText(review.review_id || review.progression_group_id)}`,
    progression_group_id: review.progression_group_id,
    publication_surface: 'none_until_remediated',
    required_next_step: review.required_next_step,
    requested_official_text_change: false,
    requested_public_write: false,
    requested_standard_evidence_write: false,
    source_blocked_contract_id: draft.blocked_id || '',
    subject_slug: review.subject_slug,
    topic_subdomains: review.topic_subdomains || []
  }
}

function summarize(standardDecisions, noteDecisions, blockedDecisions, readinessAudit) {
  const byOwner = {}
  const bySurface = {}
  const byDecision = {}
  for (const row of [...standardDecisions, ...noteDecisions, ...blockedDecisions]) {
    countInto(byOwner, row.review_owner)
    countInto(bySurface, row.surface_id)
    countInto(byDecision, row.reviewer_decision)
  }
  return {
    required_manual_decisions: standardDecisions.length + noteDecisions.length,
    pending_required_decisions: standardDecisions.length + noteDecisions.length,
    standard_same_grade_decisions: standardDecisions.length,
    progression_note_decisions: noteDecisions.length,
    blocked_registry_decisions: blockedDecisions.length,
    by_review_owner: byOwner,
    by_surface: bySurface,
    by_reviewer_decision: byDecision,
    source_readiness_level: readinessAudit.readiness?.readiness_level || '',
    source_manual_review_ready: readinessAudit.readiness?.manual_review_ready === true,
    source_publication_ready: readinessAudit.readiness?.publication_ready === true
  }
}

function validateInputs(reviewPacket, contract, readinessAudit, errors) {
  if (reviewPacket.valid !== true) errors.push('review packet valid must be true')
  if (contract.valid !== true) errors.push('contract candidate valid must be true')
  if (readinessAudit.valid !== true) errors.push('readiness audit valid must be true')
  if (readinessAudit.readiness?.manual_review_ready !== true) {
    errors.push('readiness audit must have manual_review_ready=true before building decisions template')
  }
  if (readinessAudit.readiness?.publication_ready === true) {
    errors.push('readiness audit publication_ready must still be false')
  }
}

function markdownSummary(payload) {
  const standardRows = payload.same_grade_unit_evidence_decisions
    .map(row => `| ${markdownCell(row.standard_code)} | ${markdownCell(row.grade_band)} | ${row.same_grade_edition_count} | ${row.candidate_unit_evidence_count} | ${markdownCell(row.reviewer_decision)} |`)
    .join('\n') || '| - | - | 0 | 0 | - |'
  const noteRows = payload.progression_group_note_decisions
    .map(row => `| ${markdownCell(row.progression_group_id)} | ${markdownCell((row.topic_subdomains || []).join('、'))} | ${row.edition_count} | ${row.cross_grade_diagnostic_relations} | ${markdownCell(row.reviewer_decision)} |`)
    .join('\n') || '| - | - | 0 | 0 | - |'
  const blockedRows = payload.blocked_review_decisions
    .map(row => `| ${markdownCell(row.progression_group_id)} | ${markdownCell(row.review_owner)} | ${markdownCell(row.blocking_decision)} | ${markdownCell(row.reviewer_decision)} |`)
    .join('\n') || '| - | - | - | - |'
  return `# H4G Publication Review Decisions Template

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | --- |
| publication candidate | ${payload.publication_candidate} |
| publication ready | ${payload.publication_ready} |
| manual review complete | ${payload.manual_review_complete} |
| required manual decisions | ${payload.summary.required_manual_decisions} |
| pending required decisions | ${payload.summary.pending_required_decisions} |

## Review Owners

| Owner | Decisions |
| --- | ---: |
${countRows(payload.summary.by_review_owner)}

## Same-Grade Unit Evidence Decisions

| Standard | Grade | Editions | Unit evidence | Decision |
| --- | --- | ---: | ---: | --- |
${standardRows}

## Progression Note Decisions

| Progression group | Topic | Editions | Cross-grade relations | Decision |
| --- | --- | ---: | ---: | --- |
${noteRows}

## Blocked Registry Decisions

| Progression group | Owner | Current blocker | Decision |
| --- | --- | --- | --- |
${blockedRows}

## Editing Rules

- Keep \`requested_public_write=false\` in this template; public writes require a later migration gate.
- Do not request changes to official standard text.
- Approving same-grade unit evidence only approves standard-level evidence fields.
- Approving a progression note only approves a progression-group note candidate; it must not write same-grade standard evidence.
- Blocked items cannot be approved for public publication from this file.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  for (const [label, path] of [
    ['review packet', args.reviewPacket],
    ['contract candidate', args.contract],
    ['readiness audit', args.readinessAudit]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors }, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const reviewPacket = readJson(args.reviewPacket)
  const contract = readJson(args.contract)
  const readinessAudit = readJson(args.readinessAudit)
  validateInputs(reviewPacket, contract, readinessAudit, errors)

  const draftByCode = contractDraftByCode(contract)
  const draftByGroup = noteDraftByGroup(contract)
  const blockedByReview = blockedDraftByReview(contract)
  const standardDecisions = (reviewPacket.same_grade_unit_reviews || []).map(row => sameGradeDecision(row, draftByCode))
  const noteDecisions = (reviewPacket.edition_placement_note_reviews || []).map(row => noteDecision(row, draftByGroup))
  const blockedDecisions = (reviewPacket.blocked_reviews || []).map(row => blockedDecision(row, blockedByReview))
  const payload = {
    data_scope: 'h4g_publication_review_decisions_template',
    generated_at: new Date().toISOString(),
    source_review_packet: args.reviewPacket,
    source_contract_candidate: args.contract,
    source_readiness_audit: args.readinessAudit,
    publication_candidate: false,
    publication_ready: false,
    manual_review_complete: false,
    writes_public_data: false,
    official_standard_text_changed: false,
    decision_schema: {
      same_grade_unit_evidence_allowed_decisions: SAME_GRADE_DECISIONS,
      progression_group_note_allowed_decisions: NOTE_DECISIONS,
      blocked_registry_allowed_decisions: BLOCKED_DECISIONS
    },
    summary: summarize(standardDecisions, noteDecisions, blockedDecisions, readinessAudit),
    same_grade_unit_evidence_decisions: standardDecisions,
    progression_group_note_decisions: noteDecisions,
    blocked_review_decisions: blockedDecisions,
    errors
  }
  payload.valid = errors.length === 0
  writeJson(args.out, payload)
  writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({
    valid: payload.valid,
    wrote: args.out,
    summary_out: args.summaryOut,
    required_manual_decisions: payload.summary.required_manual_decisions,
    pending_required_decisions: payload.summary.pending_required_decisions,
    standard_same_grade_decisions: payload.summary.standard_same_grade_decisions,
    progression_note_decisions: payload.summary.progression_note_decisions,
    blocked_registry_decisions: payload.summary.blocked_registry_decisions,
    errors: errors.length
  }, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
