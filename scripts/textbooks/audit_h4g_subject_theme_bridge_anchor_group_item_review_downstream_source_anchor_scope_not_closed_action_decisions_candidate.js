#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_REVIEW_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate_anchor_domain_rejected_english_pe_audit.md'

const CANDIDATE_DECISION = 'reject_slice_as_overbroad'
const CANDIDATE_STATUS = 'source_anchor_scope_not_closed_candidate_reviewed'
const ALLOWED_CHANGED_ROW_FIELDS = new Set([
  'decision_note',
  'decision_status',
  'required_confirmations',
  'reviewed_at',
  'reviewed_by',
  'reviewer_decision',
  'source_anchor_scope_not_closed_action_candidate_policy',
  'source_anchor_scope_not_closed_action_decision_candidate',
  'source_anchor_scope_not_closed_source_review_evidence'
])

function parseArgs(argv) {
  const args = {
    actionDecisions: DEFAULT_ACTION_DECISIONS,
    candidate: DEFAULT_CANDIDATE,
    out: DEFAULT_OUT,
    requireItems: false,
    sourceReviewCandidate: DEFAULT_SOURCE_REVIEW_CANDIDATE,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--action-decisions') args.actionDecisions = argv[++i]
    else if (item === '--source-review-candidate') args.sourceReviewCandidate = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate.js \\
  --candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --action-decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json \\
  --source-review-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the source-anchor scope-not-closed downstream action decisions candidate.
The audit ensures only linked source-anchor evidence action rows changed, all
other action decision rows remain identical to the source template, and no
public/matcher/publication capability was introduced.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function sameJson(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right))
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

function validatePolicy(label, payload, errors) {
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (payload[key] !== false) errors.push(`${label} ${key} must be false`)
  }
}

function validateActionDecisions(actionDecisions, args, errors) {
  if (actionDecisions.valid !== true) errors.push('source action decisions valid must be true')
  if (actionDecisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('source action decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template')
  }
  if (actionDecisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('source action decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template')
  }
  validatePolicy('source action decisions', actionDecisions, errors)
  if (!Array.isArray(actionDecisions.downstream_action_decisions)) {
    errors.push('source action decisions downstream_action_decisions must be an array')
  }
  if (args.requireItems && !(actionDecisions.downstream_action_decisions || []).length) {
    errors.push('requireItems is set but source action decisions has no rows')
  }
}

function validateSourceReviewCandidate(sourceReviewCandidate, args, errors) {
  if (sourceReviewCandidate.valid !== true) errors.push('source review candidate valid must be true')
  if (sourceReviewCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate') {
    errors.push('source review candidate candidate_purpose mismatch')
  }
  if (sourceReviewCandidate.review_only !== true) errors.push('source review candidate review_only must be true')
  validatePolicy('source review candidate', sourceReviewCandidate, errors)
  if (!Array.isArray(sourceReviewCandidate.downstream_source_anchor_review_decisions)) {
    errors.push('source review candidate downstream_source_anchor_review_decisions must be an array')
  }
}

function validateCandidateTopLevel(candidate, args, errors) {
  if (candidate.valid !== true) errors.push('candidate valid must be true')
  if (candidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('candidate purpose should preserve source action decisions template purpose')
  }
  if (candidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate') {
    errors.push('candidate candidate_purpose mismatch')
  }
  if (candidate.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('candidate data_scope must preserve source action decisions data_scope')
  }
  if (candidate.source_action_decisions_template !== args.actionDecisions) {
    errors.push('candidate source_action_decisions_template must match audit arg')
  }
  if (candidate.source_anchor_scope_not_closed_review_candidate !== args.sourceReviewCandidate) {
    errors.push('candidate source_anchor_scope_not_closed_review_candidate must match audit arg')
  }
  if (candidate.review_only !== true) errors.push('candidate review_only must be true')
  if (candidate.publication_candidate !== false) errors.push('candidate publication_candidate must be false')
  validatePolicy('candidate', candidate, errors)
  const policy = candidate.source_anchor_scope_not_closed_action_candidate_policy || {}
  for (const key of [
    'downstream_action_candidate_is_not_publication_approval',
    'downstream_source_anchor_scope_not_closed_confirmed',
    'exact_anchor_evidence_not_approved',
    'item_level_review_blocked_until_scope_split',
    'rejects_current_bounded_slice_only',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_rebuild_after_scope_split'
  ]) {
    if (policy[key] !== true) errors.push(`candidate policy ${key} must be true`)
  }
  validatePolicy('candidate policy', policy, errors)
  if (!Array.isArray(candidate.downstream_action_decisions)) {
    errors.push('candidate downstream_action_decisions must be an array')
  }
}

function mapBy(rows, key, errors, label) {
  const out = new Map()
  for (const row of rows || []) {
    const id = row[key] || ''
    if (!id) {
      errors.push(`${label} row missing ${key}`)
      continue
    }
    if (out.has(id)) errors.push(`${label} duplicate ${key}: ${id}`)
    out.set(id, row)
  }
  return out
}

function isScopeNotClosedSourceReviewCandidate(row) {
  return row.source_anchor_scope_not_closed_decision_candidate === true &&
    row.reviewer_decision === 'source_anchor_scope_not_closed_requires_split' &&
    row.decision_status === 'recommendation_candidate_reviewed' &&
    row.source_anchor_scope_not_closed_recommendation_evidence?.exact_anchor_auto_approval === false
}

function expectedConfirmations(base) {
  return {
    ...(base.required_confirmations || {}),
    anchor_type_matches_target_domain: false,
    current_bounded_slice_rejected_as_overbroad: true,
    exact_anchor_evidence_not_approved: true,
    item_level_decision_still_required: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    same_grade_scope_checked: false,
    same_subject_scope_checked: false,
    source_anchor_scope_not_closed_confirmed: true,
    source_item_reviewed: true
  }
}

function expectedEvidence(base, sourceReviewRow, sourceReviewCandidatePath) {
  const sourceEvidence = sourceReviewRow.source_anchor_scope_not_closed_recommendation_evidence || {}
  return {
    action_decision_id: base.decision_id || '',
    action_source_item_id: base.source_downstream_action_item_id || '',
    current_bounded_slice_rejected_as_overbroad: true,
    exact_anchor_auto_approval: false,
    linked_source_anchor_review_decision_id: sourceReviewRow.decision_id || '',
    page_evidence_packet_item_id: sourceReviewRow.page_evidence_packet_item_id || '',
    page_evidence_status: sourceReviewRow.page_evidence_status || '',
    page_hint_source: sourceReviewRow.page_hint_source || '',
    recommended_next_gate: sourceEvidence.recommended_next_gate || '',
    review_lane: sourceReviewRow.review_lane || sourceEvidence.review_lane || '',
    source_anchor_review_candidate: sourceReviewCandidatePath,
    source_anchor_review_work_item_id: sourceReviewRow.source_downstream_source_anchor_review_work_item_id || '',
    source_key: sourceReviewRow.source_key || '',
    target_standard_code: sourceReviewRow.target_standard_code || base.target_standard_code || '',
    unit_evidence_id: sourceReviewRow.unit_evidence_id || '',
    unit_title: sourceReviewRow.unit_title || ''
  }
}

function validateUnchangedExceptAllowed(base, candidate, errors) {
  const prefix = candidate.decision_id || base.decision_id || '(missing decision id)'
  const keys = sorted([...Object.keys(base || {}), ...Object.keys(candidate || {})])
  for (const key of keys) {
    if (ALLOWED_CHANGED_ROW_FIELDS.has(key)) continue
    if (!sameJson(base[key], candidate[key])) errors.push(`${prefix} changed forbidden field ${key}`)
  }
}

function validateCandidateRow(base, candidate, sourceReviewRow, args, errors, stats) {
  const prefix = candidate.decision_id || base.decision_id || '(missing decision id)'
  validateUnchangedExceptAllowed(base, candidate, errors)
  if (base.source_downstream_action_batch !== 'source_anchor_evidence') {
    errors.push(`${prefix} source_downstream_action_batch must be source_anchor_evidence`)
  }
  if (base.reviewer_decision !== 'pending') errors.push(`${prefix} source action decision reviewer_decision must still be pending`)
  if (base.decision_status !== 'pending_review') errors.push(`${prefix} source action decision decision_status must still be pending_review`)
  if (!(base.allowed_decisions || []).includes(CANDIDATE_DECISION)) {
    errors.push(`${prefix} base allowed_decisions must include ${CANDIDATE_DECISION}`)
  }
  if (!isScopeNotClosedSourceReviewCandidate(sourceReviewRow)) errors.push(`${prefix} linked source review row must be scope-not-closed candidate`)
  if (candidate.reviewer_decision !== CANDIDATE_DECISION) errors.push(`${prefix} reviewer_decision mismatch`)
  if (candidate.decision_status !== CANDIDATE_STATUS) errors.push(`${prefix} decision_status mismatch`)
  if (!candidate.reviewed_at) errors.push(`${prefix} reviewed_at is required`)
  if (!candidate.reviewed_by) errors.push(`${prefix} reviewed_by is required`)
  if (candidate.source_anchor_scope_not_closed_action_decision_candidate !== true) {
    errors.push(`${prefix} source_anchor_scope_not_closed_action_decision_candidate must be true`)
  }
  if (!sameJson(candidate.required_confirmations, expectedConfirmations(base))) {
    errors.push(`${prefix} required_confirmations mismatch`)
  }
  const evidence = candidate.source_anchor_scope_not_closed_source_review_evidence || {}
  const expected = expectedEvidence(base, sourceReviewRow, args.sourceReviewCandidate)
  for (const [key, value] of Object.entries(expected)) {
    if (!sameJson(evidence[key], value)) errors.push(`${prefix} source_anchor_scope_not_closed_source_review_evidence.${key} mismatch`)
  }
  const rowPolicy = candidate.source_anchor_scope_not_closed_action_candidate_policy || {}
  for (const key of [
    'downstream_action_candidate_is_not_publication_approval',
    'downstream_source_anchor_scope_not_closed_confirmed',
    'exact_anchor_evidence_not_approved',
    'item_level_review_blocked_until_scope_split',
    'rejects_current_bounded_slice_only',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_rebuild_after_scope_split'
  ]) {
    if (rowPolicy[key] !== true) errors.push(`${prefix} source_anchor_scope_not_closed_action_candidate_policy.${key} must be true`)
  }
  validatePolicy(`${prefix} source_anchor_scope_not_closed_action_candidate_policy`, rowPolicy, errors)

  stats.candidate_decisions += 1
  countInto(stats.by_grade_band, candidate.grade_band)
  countInto(stats.by_source_batch, candidate.source_batch)
  countInto(stats.by_subject, candidate.subject_slug)
  countInto(stats.by_target_standard_code, sourceReviewRow.target_standard_code || sourceReviewRow.standard_code)
}

function validateUnchangedRow(base, candidate, errors) {
  const prefix = candidate?.decision_id || base?.decision_id || '(missing decision id)'
  if (!sameJson(base, candidate)) errors.push(`${prefix} non-candidate row must remain unchanged`)
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Scope-Not-Closed Action Decisions Candidate Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| action decisions | ${payload.summary.action_decisions} |
| expected candidate decisions | ${payload.summary.expected_candidate_decisions} |
| audited candidate decisions | ${payload.summary.candidate_decisions} |
| pending action decisions | ${payload.summary.pending_action_decisions} |
| changed non-candidate decisions | ${payload.summary.changed_non_candidate_decisions} |
| exact-anchor auto approval candidates | ${payload.summary.exact_anchor_auto_approval_candidates} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Target Grades

| grade | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Subjects

| subject | rows |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['candidate', args.candidate],
    ['action decisions', args.actionDecisions],
    ['source review candidate', args.sourceReviewCandidate]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const candidate = existsSync(args.candidate) ? readJson(args.candidate) : { downstream_action_decisions: [] }
  const actionDecisions = existsSync(args.actionDecisions) ? readJson(args.actionDecisions) : { downstream_action_decisions: [] }
  const sourceReviewCandidate = existsSync(args.sourceReviewCandidate) ? readJson(args.sourceReviewCandidate) : { downstream_source_anchor_review_decisions: [] }
  if (!errors.length) {
    validateActionDecisions(actionDecisions, args, errors)
    validateSourceReviewCandidate(sourceReviewCandidate, args, errors)
    validateCandidateTopLevel(candidate, args, errors)
  }

  const sourceById = mapBy(actionDecisions.downstream_action_decisions || [], 'decision_id', errors, 'source action decisions')
  const candidateById = mapBy(candidate.downstream_action_decisions || [], 'decision_id', errors, 'candidate action decisions')
  const expectedCandidateByActionDecisionId = new Map()
  for (const row of sourceReviewCandidate.downstream_source_anchor_review_decisions || []) {
    if (!isScopeNotClosedSourceReviewCandidate(row)) continue
    if (!row.downstream_action_decision_id) {
      errors.push(`${row.decision_id || '(missing source review decision)'} missing downstream_action_decision_id`)
      continue
    }
    if (expectedCandidateByActionDecisionId.has(row.downstream_action_decision_id)) {
      errors.push(`duplicate expected action decision id: ${row.downstream_action_decision_id}`)
    }
    expectedCandidateByActionDecisionId.set(row.downstream_action_decision_id, row)
  }

  const stats = {
    action_decisions: (candidate.downstream_action_decisions || []).length,
    by_grade_band: {},
    by_source_batch: {},
    by_subject: {},
    by_target_standard_code: {},
    candidate_decisions: 0,
    changed_non_candidate_decisions: 0,
    exact_anchor_auto_approval_candidates: 0,
    expected_candidate_decisions: expectedCandidateByActionDecisionId.size,
    pending_action_decisions: (candidate.downstream_action_decisions || []).filter(row => row.reviewer_decision === 'pending').length,
    source_anchor_review_candidate_rows: (sourceReviewCandidate.downstream_source_anchor_review_decisions || []).length,
    source_anchor_scope_not_closed_review_candidates: expectedCandidateByActionDecisionId.size
  }

  for (const [decisionId, base] of sourceById.entries()) {
    const row = candidateById.get(decisionId)
    if (!row) {
      errors.push(`${decisionId} missing candidate row`)
      continue
    }
    const expectedSourceReview = expectedCandidateByActionDecisionId.get(decisionId)
    if (expectedSourceReview) validateCandidateRow(base, row, expectedSourceReview, args, errors, stats)
    else {
      if (!sameJson(base, row)) stats.changed_non_candidate_decisions += 1
      validateUnchangedRow(base, row, errors)
    }
  }
  for (const decisionId of candidateById.keys()) {
    if (!sourceById.has(decisionId)) errors.push(`${decisionId} unexpected candidate row`)
  }
  if (args.requireItems && !stats.candidate_decisions) errors.push('requireItems is set but no candidate action decisions were audited')
  if (stats.candidate_decisions !== stats.expected_candidate_decisions) {
    errors.push(`candidate decisions ${stats.candidate_decisions} must match expected ${stats.expected_candidate_decisions}`)
  }
  if (stats.action_decisions !== (actionDecisions.downstream_action_decisions || []).length) {
    errors.push('candidate downstream_action_decisions count must match source action decisions')
  }

  const summary = candidate.summary || {}
  for (const key of [
    'action_decisions',
    'candidate_decisions',
    'pending_action_decisions',
    'source_anchor_review_candidate_rows',
    'source_anchor_scope_not_closed_review_candidates'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`candidate summary.${key} mismatch`)
  }
  for (const key of ['by_grade_band', 'by_source_batch', 'by_subject', 'by_target_standard_code']) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`candidate summary.${key} mismatch`)
  }
  if (summary.exact_anchor_auto_approval_candidates !== 0) errors.push('candidate summary.exact_anchor_auto_approval_candidates must be 0')

  return {
    candidate: args.candidate,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    require_items: args.requireItems,
    source_action_decisions: args.actionDecisions,
    source_review_candidate: args.sourceReviewCandidate,
    summary: stats,
    valid: errors.length === 0,
    writes_public_data: false
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const payload = audit(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({
    out: args.out,
    summary: payload.summary,
    valid: payload.valid
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
