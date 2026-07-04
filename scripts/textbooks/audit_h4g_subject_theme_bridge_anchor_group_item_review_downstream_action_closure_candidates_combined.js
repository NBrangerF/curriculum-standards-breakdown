#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined_anchor_domain_rejected_english_pe.json'
const DEFAULT_CLOSURE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.json'
const DEFAULT_TARGET_GAP_ACTION_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_MANUAL_SCOPE_ACTION_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_ACTION_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined_anchor_domain_rejected_english_pe_audit.md'

const CANDIDATE_STATUS = 'downstream_action_closure_candidate_ready_after_manual_adoption'
const ALLOWED_CHANGED_ROW_FIELDS = new Set([
  'candidate_close_ready_after_manual_adoption',
  'candidate_closure_lane',
  'candidate_closure_status',
  'candidate_closure_type',
  'candidate_next_gate',
  'downstream_action_closure_candidate',
  'downstream_action_closure_candidate_evidence',
  'downstream_action_closure_candidate_policy'
])

const CANDIDATE_SPECS = {
  manual_scope_indexing: {
    candidateFlag: 'manual_scope_indexing_decision_candidate',
    decisionStatus: 'inventory_candidate_reviewed',
    evidenceKey: 'manual_scope_indexing_evidence',
    lane: 'same_grade_unit_scope_confirmation_lane',
    reviewerDecision: 'missing_grade_units_indexed_for_later_source_review'
  },
  source_anchor_scope_not_closed: {
    candidateFlag: 'source_anchor_scope_not_closed_action_decision_candidate',
    decisionStatus: 'source_anchor_scope_not_closed_candidate_reviewed',
    evidenceKey: 'source_anchor_scope_not_closed_source_review_evidence',
    lane: 'source_anchor_unit_or_source_scope_review_lane',
    reviewerDecision: 'reject_slice_as_overbroad'
  },
  target_gap: {
    candidateFlag: 'target_gap_inventory_decision_candidate',
    decisionStatus: 'inventory_candidate_reviewed',
    evidenceKey: 'target_gap_inventory_evidence',
    lane: 'priority_target_gap_confirmation_lane',
    reviewerDecision: 'target_standard_gap_confirmed'
  }
}

function parseArgs(argv) {
  const args = {
    candidate: DEFAULT_CANDIDATE,
    closure: DEFAULT_CLOSURE,
    manualScopeActionCandidate: DEFAULT_MANUAL_SCOPE_ACTION_CANDIDATE,
    out: DEFAULT_OUT,
    requireItems: false,
    sourceAnchorActionCandidate: DEFAULT_SOURCE_ANCHOR_ACTION_CANDIDATE,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    targetGapActionCandidate: DEFAULT_TARGET_GAP_ACTION_CANDIDATE
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--closure') args.closure = argv[++i]
    else if (item === '--target-gap-action-candidate') args.targetGapActionCandidate = argv[++i]
    else if (item === '--manual-scope-action-candidate') args.manualScopeActionCandidate = argv[++i]
    else if (item === '--source-anchor-action-candidate') args.sourceAnchorActionCandidate = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined.js \\
  --strict --require-items

Audits the combined downstream action closure candidate. It confirms only
reviewed target-gap, manual-scope, and source-anchor scope-not-closed action
candidate rows received closure candidate metadata, non-candidate closure rows
remain identical to source closure readiness, and no close/publication flag was
enabled.`)
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

function validateActionCandidate(label, payload, candidatePurpose, errors) {
  if (payload.valid !== true) errors.push(`${label} valid must be true`)
  if (payload.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push(`${label} purpose must preserve downstream action decisions template`)
  }
  if (payload.candidate_purpose !== candidatePurpose) errors.push(`${label} candidate_purpose mismatch`)
  if (payload.review_only !== true) errors.push(`${label} review_only must be true`)
  validatePolicy(label, payload, errors)
  if (!Array.isArray(payload.downstream_action_decisions)) {
    errors.push(`${label} downstream_action_decisions must be an array`)
  }
}

function validateCandidateTopLevel(candidate, args, errors) {
  if (candidate.valid !== true) errors.push('candidate valid must be true')
  if (candidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness') {
    errors.push('candidate purpose should preserve closure readiness purpose')
  }
  if (candidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined') {
    errors.push('candidate candidate_purpose mismatch')
  }
  if (candidate.source_action_closure_readiness !== args.closure) {
    errors.push('candidate source_action_closure_readiness must match audit arg')
  }
  const sources = candidate.source_action_decision_candidates || {}
  if (sources.target_gap !== args.targetGapActionCandidate) errors.push('candidate target_gap source must match audit arg')
  if (sources.manual_scope_indexing !== args.manualScopeActionCandidate) errors.push('candidate manual_scope_indexing source must match audit arg')
  if (sources.source_anchor_scope_not_closed !== args.sourceAnchorActionCandidate) errors.push('candidate source_anchor_scope_not_closed source must match audit arg')
  if (candidate.review_only !== true) errors.push('candidate review_only must be true')
  if (candidate.publication_candidate !== false) errors.push('candidate publication_candidate must be false')
  if (!Array.isArray(candidate.closure_readiness_items)) errors.push('candidate closure_readiness_items must be an array')
  validatePolicy('candidate', candidate, errors)
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

function isCandidateAction(row, spec) {
  return row?.[spec.candidateFlag] === true &&
    row.reviewer_decision === spec.reviewerDecision &&
    row.decision_status === spec.decisionStatus
}

function candidateRows(payload, spec) {
  return (payload.downstream_action_decisions || []).filter(row => isCandidateAction(row, spec))
}

function expectedEvidence(base, actionRow, type, path) {
  const spec = CANDIDATE_SPECS[type]
  const sourceEvidence = actionRow[spec.evidenceKey] || {}
  return {
    action_candidate: path,
    action_decision_id: actionRow.decision_id || '',
    action_decision_status: actionRow.decision_status || '',
    action_reviewer_decision: actionRow.reviewer_decision || '',
    action_source_batch: actionRow.source_downstream_action_batch || '',
    candidate_type: type,
    source_key: base.source_key || actionRow.source_key || '',
    target_grade_band: sourceEvidence.target_grade_band || sourceEvidence.missing_grade_band || base.target_grade_band || base.grade_band || '',
    target_standard_code: sourceEvidence.target_standard_code || sourceEvidence.exact_target_code || base.target_standard_code || base.standard_code || '',
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
    'closure_candidate_is_not_publication_approval',
    'downstream_action_candidate_required_before_closure',
    'manual_adoption_required',
    'official_close_ready_not_set',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${prefix} downstream_action_closure_candidate_policy.${key} must be true`)
  }
  validatePolicy(`${prefix} downstream_action_closure_candidate_policy`, policy, errors)
}

function validateCandidateRow(base, candidate, actionRow, type, path, errors, stats) {
  const prefix = candidate.decision_id || base.decision_id || '(missing decision id)'
  const spec = CANDIDATE_SPECS[type]
  validateUnchangedExceptAllowed(base, candidate, errors)
  if (!isCandidateAction(actionRow, spec)) errors.push(`${prefix} linked action row must be ${type} candidate`)
  if (base.auto_close_allowed !== false || candidate.auto_close_allowed !== false) {
    errors.push(`${prefix} auto_close_allowed must remain false`)
  }
  if (base.close_ready !== false || candidate.close_ready !== false) {
    errors.push(`${prefix} close_ready must remain false`)
  }
  if (candidate.manual_confirmation_required !== true) {
    errors.push(`${prefix} manual_confirmation_required must remain true`)
  }
  if (candidate.downstream_action_closure_candidate !== true) {
    errors.push(`${prefix} downstream_action_closure_candidate must be true`)
  }
  if (candidate.candidate_close_ready_after_manual_adoption !== true) {
    errors.push(`${prefix} candidate_close_ready_after_manual_adoption must be true`)
  }
  if (candidate.candidate_closure_status !== CANDIDATE_STATUS) {
    errors.push(`${prefix} candidate_closure_status mismatch`)
  }
  if (candidate.candidate_closure_type !== type) errors.push(`${prefix} candidate_closure_type mismatch`)
  if (candidate.candidate_closure_lane !== spec.lane) errors.push(`${prefix} candidate_closure_lane mismatch`)
  const expected = expectedEvidence(base, actionRow, type, path)
  const evidence = candidate.downstream_action_closure_candidate_evidence || {}
  for (const [key, value] of Object.entries(expected)) {
    if (!sameJson(evidence[key], value)) errors.push(`${prefix} downstream_action_closure_candidate_evidence.${key} mismatch`)
  }
  validateRowPolicy(prefix, candidate.downstream_action_closure_candidate_policy || {}, errors)

  stats.candidate_close_ready_after_manual_adoption_items += 1
  stats.candidate_closure_items += 1
  countInto(stats.by_candidate_lane, candidate.candidate_closure_lane)
  countInto(stats.by_candidate_type, candidate.candidate_closure_type)
  countInto(stats.by_grade_band, candidate.grade_band || candidate.target_grade_band)
  countInto(stats.by_source_downstream_action_batch, candidate.source_downstream_action_batch)
  countInto(stats.by_subject, candidate.subject_slug)
  countInto(stats.by_target_standard_code, evidence.target_standard_code || candidate.target_standard_code || candidate.standard_code)
}

function validateUnchangedRow(base, candidate, errors) {
  const prefix = candidate?.decision_id || base?.decision_id || '(missing decision id)'
  if (!sameJson(base, candidate)) errors.push(`${prefix} non-candidate closure row must remain unchanged`)
}

function markdownSummary(payload) {
  return `# H4G Downstream Action Closure Candidates Combined Audit

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

## Candidate Types

| type | rows |
| --- | ---: |
${countRows(payload.summary.by_candidate_type)}

## Candidate Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_candidate_lane)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  const files = {
    candidate: args.candidate,
    closure: args.closure,
    manualScopeActionCandidate: args.manualScopeActionCandidate,
    sourceAnchorActionCandidate: args.sourceAnchorActionCandidate,
    targetGapActionCandidate: args.targetGapActionCandidate
  }
  for (const [label, path] of Object.entries(files)) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const candidate = existsSync(args.candidate) ? readJson(args.candidate) : { closure_readiness_items: [] }
  const closure = existsSync(args.closure) ? readJson(args.closure) : { closure_readiness_items: [] }
  const targetGap = existsSync(args.targetGapActionCandidate) ? readJson(args.targetGapActionCandidate) : { downstream_action_decisions: [] }
  const manualScope = existsSync(args.manualScopeActionCandidate) ? readJson(args.manualScopeActionCandidate) : { downstream_action_decisions: [] }
  const sourceAnchor = existsSync(args.sourceAnchorActionCandidate) ? readJson(args.sourceAnchorActionCandidate) : { downstream_action_decisions: [] }
  if (!errors.length) {
    validateClosure(closure, args, errors)
    validateActionCandidate('target-gap action candidate', targetGap, 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate', errors)
    validateActionCandidate('manual-scope action candidate', manualScope, 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate', errors)
    validateActionCandidate('source-anchor action candidate', sourceAnchor, 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate', errors)
    validateCandidateTopLevel(candidate, args, errors)
  }

  const expectedByDecisionId = new Map()
  for (const [type, payload, path] of [
    ['target_gap', targetGap, args.targetGapActionCandidate],
    ['manual_scope_indexing', manualScope, args.manualScopeActionCandidate],
    ['source_anchor_scope_not_closed', sourceAnchor, args.sourceAnchorActionCandidate]
  ]) {
    const spec = CANDIDATE_SPECS[type]
    for (const row of candidateRows(payload, spec)) {
      if (!row.decision_id) {
        errors.push(`${type} action candidate row missing decision_id`)
        continue
      }
      if (expectedByDecisionId.has(row.decision_id)) {
        errors.push(`${row.decision_id} appears in multiple action candidate lanes`)
        continue
      }
      expectedByDecisionId.set(row.decision_id, { path, row, type })
    }
  }

  const sourceById = mapBy(closure.closure_readiness_items || [], 'decision_id', errors, 'source closure readiness')
  const candidateById = mapBy(candidate.closure_readiness_items || [], 'decision_id', errors, 'candidate closure readiness')
  const stats = {
    auto_close_allowed_items: (candidate.closure_readiness_items || []).filter(row => row.auto_close_allowed === true).length,
    by_candidate_lane: {},
    by_candidate_type: {},
    by_grade_band: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    by_target_standard_code: {},
    candidate_close_ready_after_manual_adoption_items: 0,
    candidate_closure_items: 0,
    changed_non_candidate_closure_items: 0,
    close_ready_items: (candidate.closure_readiness_items || []).filter(row => row.close_ready === true).length,
    closure_readiness_items: (candidate.closure_readiness_items || []).length,
    expected_candidate_closure_items: expectedByDecisionId.size,
    manual_confirmation_required_items: (candidate.closure_readiness_items || []).filter(row => row.manual_confirmation_required === true).length,
    pending_manual_confirmation_items: (candidate.closure_readiness_items || []).length - expectedByDecisionId.size
  }

  for (const [decisionId, base] of sourceById.entries()) {
    const row = candidateById.get(decisionId)
    if (!row) {
      errors.push(`${decisionId} missing candidate closure row`)
      continue
    }
    const expected = expectedByDecisionId.get(decisionId)
    if (expected) validateCandidateRow(base, row, expected.row, expected.type, expected.path, errors, stats)
    else {
      if (!sameJson(base, row)) stats.changed_non_candidate_closure_items += 1
      validateUnchangedRow(base, row, errors)
    }
  }
  for (const decisionId of candidateById.keys()) {
    if (!sourceById.has(decisionId)) errors.push(`${decisionId} unexpected candidate closure row`)
  }
  for (const decisionId of expectedByDecisionId.keys()) {
    if (!sourceById.has(decisionId)) errors.push(`${decisionId} action candidate missing source closure row`)
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
  if (stats.close_ready_items) errors.push(`candidate must not set official close-ready: ${stats.close_ready_items}`)

  const summary = candidate.summary || {}
  for (const key of [
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
  for (const key of ['by_candidate_lane', 'by_candidate_type', 'by_grade_band', 'by_source_downstream_action_batch', 'by_subject', 'by_target_standard_code']) {
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
    source_action_candidates: {
      manual_scope_indexing: args.manualScopeActionCandidate,
      source_anchor_scope_not_closed: args.sourceAnchorActionCandidate,
      target_gap: args.targetGapActionCandidate
    },
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
