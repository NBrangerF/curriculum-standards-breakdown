#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_after_post_confirmation_anchor_domain_rejected_english_pe.json'
const DEFAULT_CLOSURE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.json'
const DEFAULT_COMBINED_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined_anchor_domain_rejected_english_pe.json'
const DEFAULT_CONFIRMATION_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_after_post_confirmation_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_after_post_confirmation_anchor_domain_rejected_english_pe_audit.md'

const CANDIDATE_PURPOSE = 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_after_post_confirmation'
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

const CONFIRMATION_SPECS = {
  item_level_source_review: {
    candidateType: 'post_candidate_item_level_source_review',
    lane: 'bounded_item_level_source_review_lane',
    reviewerDecision: 'confirm_item_level_source_scope_for_later_action_gate'
  },
  source_row_confirmation: {
    candidateType: 'post_candidate_source_row_confirmation',
    lane: 'single_source_row_confirmation_lane',
    reviewerDecision: 'confirm_source_row_for_later_action_gate'
  }
}

function parseArgs(argv) {
  const args = {
    candidate: DEFAULT_CANDIDATE,
    closure: DEFAULT_CLOSURE,
    combinedCandidate: DEFAULT_COMBINED_CANDIDATE,
    confirmationCandidate: DEFAULT_CONFIRMATION_CANDIDATE,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--closure') args.closure = argv[++i]
    else if (item === '--combined-candidate') args.combinedCandidate = argv[++i]
    else if (item === '--confirmation-candidate') args.confirmationCandidate = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_after_post_confirmation.js \\
  --strict --require-items

Audits the after-post-confirmation closure candidate. It verifies that the
candidate inherits the existing combined closure candidate, adds only reviewed
post-candidate confirmation rows, leaves all other rows unchanged, and does not
enable close/publication/matcher flags.`)
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
  if (closure.close_ready !== false) errors.push('source closure readiness close_ready must be false')
  if (!Array.isArray(closure.closure_readiness_items)) errors.push('source closure readiness items must be an array')
  validatePolicy('source closure readiness', closure, errors)
  if (args.requireItems && !(closure.closure_readiness_items || []).length) {
    errors.push('requireItems is set but source closure readiness has no rows')
  }
}

function validateCombinedCandidate(combined, args, errors) {
  if (combined.valid !== true) errors.push('base combined closure candidate valid must be true')
  if (combined.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness') {
    errors.push('base combined closure candidate purpose mismatch')
  }
  if (combined.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined') {
    errors.push('base combined closure candidate candidate_purpose mismatch')
  }
  if (combined.source_action_closure_readiness !== args.closure) {
    errors.push('base combined closure candidate source_action_closure_readiness mismatch')
  }
  if (combined.review_only !== true) errors.push('base combined closure candidate review_only must be true')
  if (combined.publication_candidate !== false) errors.push('base combined closure candidate publication_candidate must be false')
  if (!Array.isArray(combined.closure_readiness_items)) errors.push('base combined closure candidate items must be an array')
  validatePolicy('base combined closure candidate', combined, errors)
}

function validateConfirmationCandidate(confirmation, args, errors) {
  if (confirmation.valid !== true) errors.push('post-confirmation decisions candidate valid must be true')
  if (confirmation.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template') {
    errors.push('post-confirmation decisions candidate purpose mismatch')
  }
  if (confirmation.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_decisions_candidate') {
    errors.push('post-confirmation decisions candidate candidate_purpose mismatch')
  }
  if (confirmation.review_only !== true) errors.push('post-confirmation decisions candidate review_only must be true')
  if (confirmation.publication_candidate !== false) errors.push('post-confirmation decisions candidate publication_candidate must be false')
  if (!Array.isArray(confirmation.post_candidate_manual_review_decisions)) {
    errors.push('post-confirmation decisions candidate decisions must be an array')
  }
  validatePolicy('post-confirmation decisions candidate', confirmation, errors)
}

function validateCandidateTopLevel(candidate, args, errors) {
  if (candidate.valid !== true) errors.push('candidate valid must be true')
  if (candidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness') {
    errors.push('candidate purpose should preserve closure readiness purpose')
  }
  if (candidate.candidate_purpose !== CANDIDATE_PURPOSE) errors.push('candidate candidate_purpose mismatch')
  if (candidate.source_action_closure_readiness !== args.closure) errors.push('candidate source_action_closure_readiness mismatch')
  if (candidate.source_combined_closure_candidate !== args.combinedCandidate) errors.push('candidate source_combined_closure_candidate mismatch')
  if (candidate.source_post_candidate_manual_review_confirmation_decisions_candidate !== args.confirmationCandidate) {
    errors.push('candidate source_post_candidate_manual_review_confirmation_decisions_candidate mismatch')
  }
  if (candidate.source_action_decision_candidates?.post_candidate_manual_review_confirmation !== args.confirmationCandidate) {
    errors.push('candidate source_action_decision_candidates.post_candidate_manual_review_confirmation mismatch')
  }
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

function confirmationSpec(row) {
  return CONFIRMATION_SPECS[row.source_downstream_action_batch]
}

function isConfirmationCandidate(row) {
  const spec = confirmationSpec(row)
  return Boolean(spec) &&
    row.post_candidate_manual_review_confirmation_decision_candidate === true &&
    row.decision_status === 'reviewed' &&
    row.reviewer_decision === spec.reviewerDecision
}

function confirmationRows(payload, errors) {
  const rows = []
  for (const row of payload.post_candidate_manual_review_decisions || []) {
    if (row.post_candidate_manual_review_confirmation_decision_candidate !== true) continue
    const prefix = row.decision_id || '(missing post-confirmation decision)'
    const evidence = row.confirmation_evidence_summary || {}
    if (!isConfirmationCandidate(row)) errors.push(`${prefix} does not match expected post-confirmation candidate state`)
    if (!row.downstream_action_decision_id) errors.push(`${prefix} missing downstream_action_decision_id`)
    if (row.evidence_quality !== 'body_text_ready_confirmation_evidence') {
      errors.push(`${prefix} evidence_quality must be body_text_ready_confirmation_evidence`)
    }
    if (evidence.body_text_ready !== true) errors.push(`${prefix} confirmation evidence body_text_ready must be true`)
    if (evidence.ready_for_manual_review !== true) errors.push(`${prefix} confirmation evidence ready_for_manual_review must be true`)
    if (evidence.page_evidence_status !== 'text_extracted') errors.push(`${prefix} confirmation evidence page_evidence_status must be text_extracted`)
    if (evidence.selected_page_quality !== 'body_text_ready') errors.push(`${prefix} confirmation evidence selected_page_quality must be body_text_ready`)
    if (isConfirmationCandidate(row)) rows.push(row)
  }
  return rows
}

function expectedEvidence(baseRow, confirmationRow, path) {
  const spec = confirmationSpec(confirmationRow)
  const summary = confirmationRow.confirmation_evidence_summary || {}
  return {
    action_candidate: path,
    action_decision_id: baseRow.decision_id || confirmationRow.downstream_action_decision_id || '',
    action_decision_status: confirmationRow.decision_status || '',
    action_reviewer_decision: confirmationRow.reviewer_decision || '',
    action_source_batch: confirmationRow.source_downstream_action_batch || '',
    candidate_type: spec?.candidateType || '',
    confirmation_evidence_packet: confirmationRow.confirmation_evidence_packet || '',
    confirmation_evidence_packet_item_id: confirmationRow.confirmation_evidence_packet_item_id || '',
    evidence_quality: confirmationRow.evidence_quality || '',
    manual_review_decision_id: confirmationRow.decision_id || '',
    page_evidence_status: summary.page_evidence_status || '',
    pdf_pages: summary.pdf_pages || [],
    selected_page_quality: summary.selected_page_quality || '',
    source_key: baseRow.source_key || confirmationRow.source_key || '',
    target_grade_band: confirmationRow.target_grade_band || baseRow.target_grade_band || baseRow.grade_band || '',
    target_standard_code: confirmationRow.target_standard_code || baseRow.target_standard_code || baseRow.standard_code || '',
    unit_evidence_id: confirmationRow.unit_evidence_id || baseRow.unit_evidence_id || '',
    unit_title: confirmationRow.unit_title || baseRow.unit_title || summary.unit_title || ''
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
    'confirmation_candidate_required_before_closure',
    'inherited_combined_closure_candidate_preserved',
    'manual_adoption_required',
    'official_close_ready_not_set',
    'post_confirmation_candidate_is_not_bridge_approval',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${prefix} downstream_action_closure_candidate_policy.${key} must be true`)
  }
  validatePolicy(`${prefix} downstream_action_closure_candidate_policy`, policy, errors)
}

function validatePostConfirmationRow(base, row, confirmationRow, path, errors, stats) {
  const prefix = row.decision_id || base.decision_id || '(missing decision id)'
  const spec = confirmationSpec(confirmationRow)
  validateUnchangedExceptAllowed(base, row, errors)
  if (base.downstream_action_closure_candidate === true) {
    errors.push(`${prefix} base combined row must not already be a closure candidate`)
  }
  if (base.auto_close_allowed !== false || row.auto_close_allowed !== false) errors.push(`${prefix} auto_close_allowed must remain false`)
  if (base.close_ready !== false || row.close_ready !== false) errors.push(`${prefix} close_ready must remain false`)
  if (row.manual_confirmation_required !== true) errors.push(`${prefix} manual_confirmation_required must remain true`)
  if (row.downstream_action_closure_candidate !== true) errors.push(`${prefix} downstream_action_closure_candidate must be true`)
  if (row.candidate_close_ready_after_manual_adoption !== true) {
    errors.push(`${prefix} candidate_close_ready_after_manual_adoption must be true`)
  }
  if (row.candidate_closure_status !== CANDIDATE_STATUS) errors.push(`${prefix} candidate_closure_status mismatch`)
  if (row.candidate_closure_type !== spec.candidateType) errors.push(`${prefix} candidate_closure_type mismatch`)
  if (row.candidate_closure_lane !== spec.lane) errors.push(`${prefix} candidate_closure_lane mismatch`)
  const expected = expectedEvidence(base, confirmationRow, path)
  const evidence = row.downstream_action_closure_candidate_evidence || {}
  for (const [key, value] of Object.entries(expected)) {
    if (!sameJson(evidence[key], value)) errors.push(`${prefix} downstream_action_closure_candidate_evidence.${key} mismatch`)
  }
  validateRowPolicy(prefix, row.downstream_action_closure_candidate_policy || {}, errors)
  stats.post_confirmation_candidate_closure_items += 1
  stats.unique_post_confirmation_action_decision_ids.add(row.decision_id)
  countInto(stats.by_post_confirmation_candidate_lane, row.candidate_closure_lane)
  countInto(stats.by_post_confirmation_candidate_type, row.candidate_closure_type)
}

function updateAllCandidateStats(row, stats) {
  if (row.downstream_action_closure_candidate !== true) return
  stats.candidate_closure_items += 1
  if (row.candidate_close_ready_after_manual_adoption === true) {
    stats.candidate_close_ready_after_manual_adoption_items += 1
  }
  stats.unique_action_decision_ids.add(row.decision_id)
  stats.unique_target_standard_code_values.add(row.downstream_action_closure_candidate_evidence?.target_standard_code || row.target_standard_code || row.standard_code || '')
  stats.unique_unit_evidence_id_values.add(row.downstream_action_closure_candidate_evidence?.unit_evidence_id || row.unit_evidence_id || '')
  countInto(stats.by_candidate_lane, row.candidate_closure_lane)
  countInto(stats.by_candidate_type, row.candidate_closure_type)
  countInto(stats.by_grade_band, row.grade_band || row.target_grade_band)
  countInto(stats.by_source_downstream_action_batch, row.source_downstream_action_batch)
  countInto(stats.by_subject, row.subject_slug)
  countInto(stats.by_target_standard_code, row.downstream_action_closure_candidate_evidence?.target_standard_code || row.target_standard_code || row.standard_code)
}

function markdownSummary(payload) {
  return `# H4G Downstream Action Closure Candidates After Post-Confirmation Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| closure readiness items | ${payload.summary.closure_readiness_items} |
| inherited combined candidate items | ${payload.summary.inherited_combined_candidate_closure_items} |
| expected post-confirmation candidate items | ${payload.summary.expected_post_confirmation_candidate_closure_items} |
| audited post-confirmation candidate items | ${payload.summary.post_confirmation_candidate_closure_items} |
| candidate closure items | ${payload.summary.candidate_closure_items} |
| pending manual confirmation items | ${payload.summary.pending_manual_confirmation_items} |
| changed non-post-confirmation rows | ${payload.summary.changed_non_post_confirmation_rows} |
| auto-close allowed items | ${payload.summary.auto_close_allowed_items} |
| official close-ready items | ${payload.summary.close_ready_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Candidate Types

| type | rows |
| --- | ---: |
${countRows(payload.summary.by_candidate_type)}

## Post-Confirmation Candidate Types

| type | rows |
| --- | ---: |
${countRows(payload.summary.by_post_confirmation_candidate_type)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  const files = {
    candidate: args.candidate,
    closure: args.closure,
    combinedCandidate: args.combinedCandidate,
    confirmationCandidate: args.confirmationCandidate
  }
  for (const [label, path] of Object.entries(files)) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const candidate = existsSync(args.candidate) ? readJson(args.candidate) : { closure_readiness_items: [] }
  const closure = existsSync(args.closure) ? readJson(args.closure) : { closure_readiness_items: [] }
  const combined = existsSync(args.combinedCandidate) ? readJson(args.combinedCandidate) : { closure_readiness_items: [] }
  const confirmation = existsSync(args.confirmationCandidate) ? readJson(args.confirmationCandidate) : { post_candidate_manual_review_decisions: [] }
  if (!errors.length) {
    validateClosure(closure, args, errors)
    validateCombinedCandidate(combined, args, errors)
    validateConfirmationCandidate(confirmation, args, errors)
    validateCandidateTopLevel(candidate, args, errors)
  }

  const sourceById = mapBy(closure.closure_readiness_items || [], 'decision_id', errors, 'source closure readiness')
  const baseById = mapBy(combined.closure_readiness_items || [], 'decision_id', errors, 'base combined closure candidate')
  const candidateById = mapBy(candidate.closure_readiness_items || [], 'decision_id', errors, 'after post-confirmation candidate')
  const confirmationByActionId = new Map()
  for (const row of confirmationRows(confirmation, errors)) {
    if (confirmationByActionId.has(row.downstream_action_decision_id)) {
      errors.push(`${row.downstream_action_decision_id} has duplicate post-confirmation candidates`)
      continue
    }
    confirmationByActionId.set(row.downstream_action_decision_id, row)
  }

  const stats = {
    auto_close_allowed_items: (candidate.closure_readiness_items || []).filter(row => row.auto_close_allowed === true).length,
    by_candidate_lane: {},
    by_candidate_type: {},
    by_grade_band: {},
    by_post_confirmation_candidate_lane: {},
    by_post_confirmation_candidate_type: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    by_target_standard_code: {},
    candidate_close_ready_after_manual_adoption_items: 0,
    candidate_closure_items: 0,
    changed_non_post_confirmation_rows: 0,
    close_ready_items: (candidate.closure_readiness_items || []).filter(row => row.close_ready === true).length,
    closure_readiness_items: (candidate.closure_readiness_items || []).length,
    expected_candidate_closure_items: Number(combined.summary?.candidate_closure_items || 0) + confirmationByActionId.size,
    expected_post_confirmation_candidate_closure_items: confirmationByActionId.size,
    inherited_combined_candidate_closure_items: Number(combined.summary?.candidate_closure_items || 0),
    manual_confirmation_required_items: (candidate.closure_readiness_items || []).filter(row => row.manual_confirmation_required === true).length,
    pending_manual_confirmation_items: 0,
    post_confirmation_candidate_closure_items: 0,
    unique_action_decision_ids: new Set(),
    unique_post_confirmation_action_decision_ids: new Set(),
    unique_target_standard_code_values: new Set(),
    unique_unit_evidence_id_values: new Set()
  }

  for (const [decisionId, base] of baseById.entries()) {
    if (!sourceById.has(decisionId)) errors.push(`${decisionId} base combined row missing source closure readiness`)
    const row = candidateById.get(decisionId)
    if (!row) {
      errors.push(`${decisionId} missing after post-confirmation candidate row`)
      continue
    }
    const confirmationRow = confirmationByActionId.get(decisionId)
    if (confirmationRow) validatePostConfirmationRow(base, row, confirmationRow, args.confirmationCandidate, errors, stats)
    else {
      if (!sameJson(base, row)) stats.changed_non_post_confirmation_rows += 1
      if (!sameJson(base, row)) errors.push(`${decisionId} non-post-confirmation row must remain unchanged from base combined candidate`)
    }
    updateAllCandidateStats(row, stats)
  }
  for (const decisionId of candidateById.keys()) {
    if (!baseById.has(decisionId)) errors.push(`${decisionId} unexpected after post-confirmation candidate row`)
  }
  for (const decisionId of confirmationByActionId.keys()) {
    if (!baseById.has(decisionId)) errors.push(`${decisionId} post-confirmation action missing base combined row`)
  }
  if (args.requireItems && !stats.post_confirmation_candidate_closure_items) {
    errors.push('requireItems is set but no post-confirmation closure candidates were audited')
  }
  stats.pending_manual_confirmation_items = stats.closure_readiness_items - stats.candidate_closure_items
  if (stats.candidate_closure_items !== stats.expected_candidate_closure_items) {
    errors.push(`candidate closure items ${stats.candidate_closure_items} must match expected ${stats.expected_candidate_closure_items}`)
  }
  if (stats.post_confirmation_candidate_closure_items !== stats.expected_post_confirmation_candidate_closure_items) {
    errors.push(`post-confirmation candidate closure items ${stats.post_confirmation_candidate_closure_items} must match expected ${stats.expected_post_confirmation_candidate_closure_items}`)
  }
  if (stats.closure_readiness_items !== (closure.closure_readiness_items || []).length) {
    errors.push('candidate closure_readiness_items count must match source closure readiness')
  }
  if (stats.auto_close_allowed_items) errors.push(`candidate must not allow auto-close: ${stats.auto_close_allowed_items}`)
  if (stats.close_ready_items) errors.push(`candidate must not set official close-ready: ${stats.close_ready_items}`)
  if (stats.changed_non_post_confirmation_rows) {
    errors.push(`candidate changed non-post-confirmation rows: ${stats.changed_non_post_confirmation_rows}`)
  }

  const summaryStats = {
    ...stats,
    unique_action_decisions: stats.unique_action_decision_ids.size,
    unique_post_confirmation_action_decisions: stats.unique_post_confirmation_action_decision_ids.size,
    unique_target_standard_codes: sorted([...stats.unique_target_standard_code_values]).filter(Boolean).length,
    unique_unit_evidence_ids: sorted([...stats.unique_unit_evidence_id_values]).filter(Boolean).length
  }
  delete summaryStats.unique_action_decision_ids
  delete summaryStats.unique_post_confirmation_action_decision_ids
  delete summaryStats.unique_target_standard_code_values
  delete summaryStats.unique_unit_evidence_id_values

  const summary = candidate.summary || {}
  for (const key of [
    'auto_close_allowed_items',
    'candidate_close_ready_after_manual_adoption_items',
    'candidate_closure_items',
    'close_ready_items',
    'closure_readiness_items',
    'expected_candidate_closure_items',
    'expected_post_confirmation_candidate_closure_items',
    'inherited_combined_candidate_closure_items',
    'manual_confirmation_required_items',
    'pending_manual_confirmation_items',
    'post_confirmation_candidate_closure_items',
    'unique_action_decisions',
    'unique_post_confirmation_action_decisions',
    'unique_target_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (summary[key] !== summaryStats[key]) errors.push(`candidate summary.${key} mismatch`)
  }
  for (const key of ['by_candidate_lane', 'by_candidate_type', 'by_grade_band', 'by_post_confirmation_candidate_lane', 'by_post_confirmation_candidate_type', 'by_source_downstream_action_batch', 'by_subject', 'by_target_standard_code']) {
    if (!sameJson(summary[key] || {}, summaryStats[key] || {})) errors.push(`candidate summary.${key} mismatch`)
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
    source_action_closure_readiness: args.closure,
    source_combined_closure_candidate: args.combinedCandidate,
    source_post_candidate_manual_review_confirmation_decisions_candidate: args.confirmationCandidate,
    summary: summaryStats,
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
