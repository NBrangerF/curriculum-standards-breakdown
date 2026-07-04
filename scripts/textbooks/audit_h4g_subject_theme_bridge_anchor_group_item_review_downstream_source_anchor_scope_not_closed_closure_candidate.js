#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_closure_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_CLOSURE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_closure_candidate_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_closure_candidate_anchor_domain_rejected_english_pe_audit.md'

const CANDIDATE_DECISION = 'reject_slice_as_overbroad'
const CANDIDATE_STATUS = 'source_anchor_scope_not_closed_candidate_reviewed'
const CLOSURE_STATUS = 'source_anchor_scope_not_closed_closure_candidate_ready'
const ALLOWED_CHANGED_ROW_FIELDS = new Set([
  'candidate_close_ready_after_manual_adoption',
  'candidate_closure_status',
  'candidate_next_gate',
  'source_anchor_scope_not_closed_action_decision_evidence',
  'source_anchor_scope_not_closed_closure_candidate',
  'source_anchor_scope_not_closed_closure_policy'
])

function parseArgs(argv) {
  const args = {
    actionCandidate: DEFAULT_ACTION_CANDIDATE,
    candidate: DEFAULT_CANDIDATE,
    closure: DEFAULT_CLOSURE,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--closure') args.closure = argv[++i]
    else if (item === '--action-candidate') args.actionCandidate = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_closure_candidate.js \\
  --candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_closure_candidate_anchor_domain_rejected_english_pe.json \\
  --closure generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.json \\
  --action-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the source-anchor scope-not-closed closure candidate. The audit ensures
only linked source-anchor overbroad action candidate rows received closure
candidate metadata, non-candidate closure rows are unchanged, and no
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

function validateClosure(closure, args, errors) {
  if (closure.valid !== true) errors.push('source closure readiness valid must be true')
  if (closure.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness') {
    errors.push('source closure readiness purpose mismatch')
  }
  if (!Array.isArray(closure.closure_readiness_items)) errors.push('source closure readiness items must be an array')
  if (closure.close_ready !== false) errors.push('source closure readiness close_ready must be false')
  validatePolicy('source closure readiness', closure, errors)
  if (args.requireItems && !(closure.closure_readiness_items || []).length) {
    errors.push('requireItems is set but source closure readiness has no rows')
  }
}

function validateActionCandidate(actionCandidate, args, errors) {
  if (actionCandidate.valid !== true) errors.push('action candidate valid must be true')
  if (actionCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate') {
    errors.push('action candidate candidate_purpose mismatch')
  }
  if (actionCandidate.review_only !== true) errors.push('action candidate review_only must be true')
  validatePolicy('action candidate', actionCandidate, errors)
  if (!Array.isArray(actionCandidate.downstream_action_decisions)) {
    errors.push('action candidate downstream_action_decisions must be an array')
  }
}

function validateCandidateTopLevel(candidate, args, errors) {
  if (candidate.valid !== true) errors.push('candidate valid must be true')
  if (candidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness') {
    errors.push('candidate purpose should preserve closure readiness purpose')
  }
  if (candidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_closure_candidate') {
    errors.push('candidate candidate_purpose mismatch')
  }
  if (candidate.source_action_closure_readiness !== args.closure) {
    errors.push('candidate source_action_closure_readiness must match audit arg')
  }
  if (candidate.source_anchor_scope_not_closed_action_decisions_candidate !== args.actionCandidate) {
    errors.push('candidate source_anchor_scope_not_closed_action_decisions_candidate must match audit arg')
  }
  if (candidate.review_only !== true) errors.push('candidate review_only must be true')
  if (candidate.publication_candidate !== false) errors.push('candidate publication_candidate must be false')
  if (!Array.isArray(candidate.closure_readiness_items)) errors.push('candidate closure_readiness_items must be an array')
  validatePolicy('candidate', candidate, errors)
  const policy = candidate.source_anchor_scope_not_closed_closure_candidate_policy || {}
  for (const key of [
    'action_decision_candidate_required_before_closure',
    'closure_candidate_is_not_publication_approval',
    'current_bounded_slice_rejected_as_overbroad',
    'exact_anchor_evidence_not_approved',
    'manual_adoption_required',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_rebuild_after_scope_split'
  ]) {
    if (policy[key] !== true) errors.push(`candidate policy ${key} must be true`)
  }
  validatePolicy('candidate policy', policy, errors)
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

function isScopeNotClosedActionCandidate(row) {
  return row.source_anchor_scope_not_closed_action_decision_candidate === true &&
    row.reviewer_decision === CANDIDATE_DECISION &&
    row.decision_status === CANDIDATE_STATUS &&
    row.source_anchor_scope_not_closed_source_review_evidence?.exact_anchor_auto_approval === false
}

function expectedEvidence(base, actionRow, actionCandidatePath) {
  const sourceEvidence = actionRow.source_anchor_scope_not_closed_source_review_evidence || {}
  return {
    action_candidate: actionCandidatePath,
    action_decision_id: actionRow.decision_id || '',
    action_decision_status: actionRow.decision_status || '',
    action_reviewer_decision: actionRow.reviewer_decision || '',
    current_bounded_slice_rejected_as_overbroad: true,
    exact_anchor_auto_approval: false,
    linked_source_anchor_review_decision_id: sourceEvidence.linked_source_anchor_review_decision_id || '',
    source_anchor_review_work_item_id: sourceEvidence.source_anchor_review_work_item_id || '',
    source_key: base.source_key || actionRow.source_key || '',
    target_standard_code: sourceEvidence.target_standard_code || base.target_standard_code || base.standard_code || '',
    unit_evidence_id: sourceEvidence.unit_evidence_id || base.unit_evidence_id || '',
    unit_title: sourceEvidence.unit_title || base.unit_title || ''
  }
}

function validateUnchangedExceptAllowed(base, candidate, errors) {
  const prefix = candidate?.decision_id || base?.decision_id || '(missing decision id)'
  const keys = sorted([...Object.keys(base || {}), ...Object.keys(candidate || {})])
  for (const key of keys) {
    if (ALLOWED_CHANGED_ROW_FIELDS.has(key)) continue
    if (!sameJson(base[key], candidate[key])) errors.push(`${prefix} changed forbidden field ${key}`)
  }
}

function validateRowPolicy(prefix, policy, errors) {
  for (const key of [
    'action_decision_candidate_required_before_closure',
    'closure_candidate_is_not_publication_approval',
    'current_bounded_slice_rejected_as_overbroad',
    'exact_anchor_evidence_not_approved',
    'manual_adoption_required',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_rebuild_after_scope_split'
  ]) {
    if (policy[key] !== true) errors.push(`${prefix} source_anchor_scope_not_closed_closure_policy.${key} must be true`)
  }
  validatePolicy(`${prefix} source_anchor_scope_not_closed_closure_policy`, policy, errors)
}

function validateCandidateRow(base, candidate, actionRow, args, errors, stats) {
  const prefix = candidate.decision_id || base.decision_id || '(missing decision id)'
  validateUnchangedExceptAllowed(base, candidate, errors)
  if (!isScopeNotClosedActionCandidate(actionRow)) errors.push(`${prefix} linked action row must be scope-not-closed action candidate`)
  if (base.source_downstream_action_batch !== 'source_anchor_evidence') {
    errors.push(`${prefix} source closure batch must be source_anchor_evidence`)
  }
  if (base.recommended_reviewer_decision !== 'needs_source_anchor_evidence') {
    errors.push(`${prefix} source closure recommendation must be needs_source_anchor_evidence`)
  }
  if (base.auto_close_allowed !== false || candidate.auto_close_allowed !== false) {
    errors.push(`${prefix} auto_close_allowed must remain false`)
  }
  if (base.close_ready !== false || candidate.close_ready !== false) {
    errors.push(`${prefix} close_ready must remain false`)
  }
  if (candidate.manual_confirmation_required !== true) {
    errors.push(`${prefix} manual_confirmation_required must remain true`)
  }
  if (candidate.source_anchor_scope_not_closed_closure_candidate !== true) {
    errors.push(`${prefix} source_anchor_scope_not_closed_closure_candidate must be true`)
  }
  if (candidate.candidate_close_ready_after_manual_adoption !== true) {
    errors.push(`${prefix} candidate_close_ready_after_manual_adoption must be true`)
  }
  if (candidate.candidate_closure_status !== CLOSURE_STATUS) {
    errors.push(`${prefix} candidate_closure_status mismatch`)
  }
  const expected = expectedEvidence(base, actionRow, args.actionCandidate)
  const evidence = candidate.source_anchor_scope_not_closed_action_decision_evidence || {}
  for (const [key, value] of Object.entries(expected)) {
    if (!sameJson(evidence[key], value)) errors.push(`${prefix} source_anchor_scope_not_closed_action_decision_evidence.${key} mismatch`)
  }
  validateRowPolicy(prefix, candidate.source_anchor_scope_not_closed_closure_policy || {}, errors)

  stats.candidate_closure_items += 1
  stats.candidate_close_ready_after_manual_adoption_items += 1
  countInto(stats.by_grade_band, candidate.grade_band || candidate.target_grade_band)
  countInto(stats.by_source_batch, candidate.source_batch)
  countInto(stats.by_subject, candidate.subject_slug)
  countInto(stats.by_target_standard_code, evidence.target_standard_code || candidate.target_standard_code || candidate.standard_code)
}

function validateUnchangedRow(base, candidate, errors) {
  const prefix = candidate?.decision_id || base?.decision_id || '(missing decision id)'
  if (!sameJson(base, candidate)) errors.push(`${prefix} non-candidate closure row must remain unchanged`)
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Scope-Not-Closed Closure Candidate Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| closure readiness items | ${payload.summary.closure_readiness_items} |
| expected candidate closure items | ${payload.summary.expected_candidate_closure_items} |
| audited candidate closure items | ${payload.summary.candidate_closure_items} |
| pending manual confirmation items | ${payload.summary.pending_manual_confirmation_items} |
| changed non-candidate closure items | ${payload.summary.changed_non_candidate_closure_items} |
| auto-close allowed items | ${payload.summary.auto_close_allowed_items} |
| official close-ready items | ${payload.summary.close_ready_items} |
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
    ['closure readiness', args.closure],
    ['action candidate', args.actionCandidate]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const candidate = existsSync(args.candidate) ? readJson(args.candidate) : { closure_readiness_items: [] }
  const closure = existsSync(args.closure) ? readJson(args.closure) : { closure_readiness_items: [] }
  const actionCandidate = existsSync(args.actionCandidate) ? readJson(args.actionCandidate) : { downstream_action_decisions: [] }
  if (!errors.length) {
    validateClosure(closure, args, errors)
    validateActionCandidate(actionCandidate, args, errors)
    validateCandidateTopLevel(candidate, args, errors)
  }

  const closureById = mapBy(closure.closure_readiness_items || [], 'decision_id', errors, 'source closure readiness')
  const candidateById = mapBy(candidate.closure_readiness_items || [], 'decision_id', errors, 'candidate closure readiness')
  const expectedCandidateByDecisionId = new Map()
  for (const row of actionCandidate.downstream_action_decisions || []) {
    if (!isScopeNotClosedActionCandidate(row)) continue
    if (!row.decision_id) {
      errors.push('(missing action candidate) missing decision_id')
      continue
    }
    if (expectedCandidateByDecisionId.has(row.decision_id)) {
      errors.push(`duplicate expected action candidate decision id: ${row.decision_id}`)
    }
    expectedCandidateByDecisionId.set(row.decision_id, row)
  }

  const stats = {
    action_candidate_decisions: expectedCandidateByDecisionId.size,
    auto_close_allowed_items: (candidate.closure_readiness_items || []).filter(row => row.auto_close_allowed === true).length,
    by_grade_band: {},
    by_source_batch: {},
    by_subject: {},
    by_target_standard_code: {},
    candidate_close_ready_after_manual_adoption_items: 0,
    candidate_closure_items: 0,
    changed_non_candidate_closure_items: 0,
    close_ready_items: (candidate.closure_readiness_items || []).filter(row => row.close_ready === true).length,
    closure_readiness_items: (candidate.closure_readiness_items || []).length,
    expected_candidate_closure_items: expectedCandidateByDecisionId.size,
    manual_confirmation_required_items: (candidate.closure_readiness_items || []).filter(row => row.manual_confirmation_required === true).length,
    pending_manual_confirmation_items: (candidate.closure_readiness_items || []).length - expectedCandidateByDecisionId.size
  }

  for (const [decisionId, base] of closureById.entries()) {
    const row = candidateById.get(decisionId)
    if (!row) {
      errors.push(`${decisionId} missing candidate closure row`)
      continue
    }
    const expectedAction = expectedCandidateByDecisionId.get(decisionId)
    if (expectedAction) validateCandidateRow(base, row, expectedAction, args, errors, stats)
    else {
      if (!sameJson(base, row)) stats.changed_non_candidate_closure_items += 1
      validateUnchangedRow(base, row, errors)
    }
  }
  for (const decisionId of candidateById.keys()) {
    if (!closureById.has(decisionId)) errors.push(`${decisionId} unexpected candidate closure row`)
  }
  if (args.requireItems && !stats.candidate_closure_items) {
    errors.push('requireItems is set but no candidate closure items were audited')
  }
  if (stats.candidate_closure_items !== stats.expected_candidate_closure_items) {
    errors.push(`candidate closure items ${stats.candidate_closure_items} must match expected ${stats.expected_candidate_closure_items}`)
  }
  if (stats.closure_readiness_items !== (closure.closure_readiness_items || []).length) {
    errors.push('candidate closure_readiness_items count must match source closure readiness')
  }
  if (stats.auto_close_allowed_items) errors.push(`candidate must not allow auto-close: ${stats.auto_close_allowed_items}`)
  if (stats.close_ready_items) errors.push(`candidate must not set official close_ready: ${stats.close_ready_items}`)

  const summary = candidate.summary || {}
  for (const key of [
    'action_candidate_decisions',
    'auto_close_allowed_items',
    'candidate_close_ready_after_manual_adoption_items',
    'candidate_closure_items',
    'close_ready_items',
    'closure_readiness_items',
    'manual_confirmation_required_items',
    'pending_manual_confirmation_items'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`candidate summary.${key} mismatch`)
  }
  for (const key of ['by_grade_band', 'by_source_batch', 'by_subject', 'by_target_standard_code']) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`candidate summary.${key} mismatch`)
  }

  return {
    candidate: args.candidate,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    require_items: args.requireItems,
    source_action_candidate: args.actionCandidate,
    source_closure_readiness: args.closure,
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
