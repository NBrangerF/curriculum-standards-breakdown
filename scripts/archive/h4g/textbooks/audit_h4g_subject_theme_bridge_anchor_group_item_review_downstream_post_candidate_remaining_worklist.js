#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_REMAINING_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_MANUAL_CONFIRMATION_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_COMBINED_CLOSURE_CANDIDATES = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist_anchor_domain_rejected_english_pe_audit.md'

const ALLOWED_ADDED_FIELDS = new Set([
  'combined_candidate_filter_source',
  'combined_closure_candidate_present',
  'post_candidate_remaining_reason',
  'recommended_next_gate_after_candidate_filter',
  'remaining_worklist_rank'
])

function parseArgs(argv) {
  const args = {
    combinedClosureCandidates: DEFAULT_COMBINED_CLOSURE_CANDIDATES,
    manualConfirmationWorklist: DEFAULT_MANUAL_CONFIRMATION_WORKLIST,
    out: DEFAULT_OUT,
    remainingWorklist: DEFAULT_REMAINING_WORKLIST,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--remaining-worklist') args.remainingWorklist = argv[++i]
    else if (item === '--manual-confirmation-worklist') args.manualConfirmationWorklist = argv[++i]
    else if (item === '--combined-closure-candidates') args.combinedClosureCandidates = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist.js \\
  --strict --require-items

Audits that the post-candidate remaining worklist contains exactly the manual
confirmation rows not covered by combined closure candidates, and that it keeps
all no-public-write/no-matcher guardrails.`)
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

function validateInputs(remainingWorklist, manualWorklist, combinedCandidate, args, errors) {
  if (remainingWorklist.valid !== true) errors.push('remaining worklist valid must be true')
  if ((remainingWorklist.errors || []).length) errors.push('remaining worklist errors must be empty')
  if (remainingWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist') {
    errors.push('remaining worklist purpose mismatch')
  }
  if (remainingWorklist.worklist_only !== true) errors.push('remaining worklist worklist_only must be true')
  if (remainingWorklist.remaining_worklist_only !== true) errors.push('remaining worklist remaining_worklist_only must be true')
  if (remainingWorklist.review_only !== true) errors.push('remaining worklist review_only must be true')
  if (remainingWorklist.source_manual_confirmation_worklist !== args.manualConfirmationWorklist) {
    errors.push('remaining worklist source_manual_confirmation_worklist must match audit arg')
  }
  if (remainingWorklist.source_combined_closure_candidates !== args.combinedClosureCandidates) {
    errors.push('remaining worklist source_combined_closure_candidates must match audit arg')
  }
  if (!Array.isArray(remainingWorklist.post_candidate_remaining_work_items)) {
    errors.push('remaining worklist post_candidate_remaining_work_items must be an array')
  }
  validatePolicy('remaining worklist', remainingWorklist, errors)

  if (manualWorklist.valid !== true) errors.push('manual confirmation worklist valid must be true')
  if (manualWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist') {
    errors.push('manual confirmation worklist purpose mismatch')
  }
  if (manualWorklist.worklist_only !== true) errors.push('manual confirmation worklist worklist_only must be true')
  if (!Array.isArray(manualWorklist.manual_confirmation_work_items)) {
    errors.push('manual confirmation work items must be an array')
  }
  validatePolicy('manual confirmation worklist', manualWorklist, errors)

  if (combinedCandidate.valid !== true) errors.push('combined closure candidate valid must be true')
  if (combinedCandidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness') {
    errors.push('combined closure candidate purpose mismatch')
  }
  if (combinedCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined') {
    errors.push('combined closure candidate candidate_purpose mismatch')
  }
  if (combinedCandidate.review_only !== true) errors.push('combined closure candidate review_only must be true')
  if (combinedCandidate.publication_candidate !== false) errors.push('combined closure candidate publication_candidate must be false')
  if (!Array.isArray(combinedCandidate.closure_readiness_items)) {
    errors.push('combined closure readiness items must be an array')
  }
  validatePolicy('combined closure candidate', combinedCandidate, errors)
}

function remainingReason(row) {
  const lane = row.manual_confirmation_lane || ''
  if (lane === 'source_anchor_generic_or_deny_term_review_lane') {
    return 'source_anchor_exact_text_needed_generic_or_deny_term_anchor'
  }
  if (lane === 'source_anchor_fanout_review_lane') {
    return 'source_anchor_exact_text_needed_unit_or_standard_fanout'
  }
  if (lane === 'single_source_row_confirmation_lane') return 'single_source_row_scope_confirmation_still_needed'
  if (lane === 'bounded_item_level_source_review_lane') return 'item_level_source_scope_confirmation_still_needed'
  return 'manual_confirmation_not_covered_by_combined_candidate_lane'
}

function nextGate(row) {
  const lane = row.manual_confirmation_lane || ''
  if (lane === 'source_anchor_generic_or_deny_term_review_lane') return 'manual_exact_anchor_text_review_required'
  if (lane === 'source_anchor_fanout_review_lane') return 'manual_fanout_exact_anchor_review_required'
  if (lane === 'single_source_row_confirmation_lane') return 'manual_single_source_row_confirmation_required'
  if (lane === 'bounded_item_level_source_review_lane') return 'manual_item_level_source_review_required'
  return 'manual_confirmation_required'
}

function validateUnchangedExceptAdded(expected, actual, errors) {
  const prefix = actual?.action_decision_id || expected?.action_decision_id || '(missing action decision id)'
  const keys = sorted([...Object.keys(expected || {}), ...Object.keys(actual || {})])
  for (const key of keys) {
    if (ALLOWED_ADDED_FIELDS.has(key)) continue
    if (!sameJson(expected[key], actual[key])) errors.push(`${prefix} changed forbidden field ${key}`)
  }
}

function expectedRemainingRows(manualWorklist, combinedByDecision, errors) {
  const rows = []
  for (const row of manualWorklist.manual_confirmation_work_items || []) {
    const combined = combinedByDecision.get(row.action_decision_id)
    if (!combined) {
      errors.push(`${row.action_decision_id || '(missing action decision id)'} missing combined closure candidate row`)
      continue
    }
    if (combined.downstream_action_closure_candidate === true) continue
    rows.push(row)
  }
  return rows
}

function summarize(rows, manualWorklist, combinedCandidate) {
  const combinedRows = combinedCandidate.closure_readiness_items || []
  const combinedCandidateRows = combinedRows.filter(row => row.downstream_action_closure_candidate === true)
  const summary = {
    audited_remaining_work_items: 0,
    auto_close_allowed_items: 0,
    by_grade_band: {},
    by_inventory_bucket: {},
    by_manual_confirmation_lane: {},
    by_next_gate_after_candidate_filter: {},
    by_post_candidate_remaining_reason: {},
    by_recommendation: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    close_ready_items: 0,
    combined_candidate_closure_items: combinedCandidateRows.length,
    combined_closure_readiness_items: combinedRows.length,
    excluded_combined_candidate_items: combinedCandidateRows.length,
    expected_remaining_work_items: rows.length,
    extra_remaining_work_items: 0,
    item_level_source_review_items: 0,
    manual_confirmation_items_total: (manualWorklist.manual_confirmation_work_items || []).length,
    manual_confirmation_required_items: 0,
    missing_remaining_work_items: 0,
    remaining_worklist_items: 0,
    source_anchor_exact_review_items: 0,
    source_row_confirmation_items: 0,
    unique_action_decisions: sorted(rows.map(row => row.action_decision_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length
  }
  return summary
}

function addAuditedRow(row, stats) {
  stats.audited_remaining_work_items += 1
  stats.remaining_worklist_items += 1
  if (row.auto_close_allowed) stats.auto_close_allowed_items += 1
  if (row.close_ready) stats.close_ready_items += 1
  if (row.manual_confirmation_required) stats.manual_confirmation_required_items += 1
  if (row.source_downstream_action_batch === 'source_row_confirmation') stats.source_row_confirmation_items += 1
  if (row.source_downstream_action_batch === 'item_level_source_review') stats.item_level_source_review_items += 1
  if (row.source_downstream_action_batch === 'source_anchor_evidence') stats.source_anchor_exact_review_items += 1
  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_inventory_bucket, row.inventory_bucket)
  countInto(stats.by_manual_confirmation_lane, row.manual_confirmation_lane)
  countInto(stats.by_next_gate_after_candidate_filter, row.recommended_next_gate_after_candidate_filter)
  countInto(stats.by_post_candidate_remaining_reason, row.post_candidate_remaining_reason)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision)
  countInto(stats.by_source_downstream_action_batch, row.source_downstream_action_batch)
  countInto(stats.by_subject, row.subject_slug)
}

function validateRow(row, expected, combined, args, errors, stats, index) {
  const prefix = row.action_decision_id || expected.action_decision_id || '(missing action decision id)'
  validateUnchangedExceptAdded(expected, row, errors)
  if (combined.downstream_action_closure_candidate === true) {
    errors.push(`${prefix} must not be present because combined closure candidate is true`)
  }
  if (row.remaining_worklist_rank !== index + 1) errors.push(`${prefix} remaining_worklist_rank mismatch`)
  if (row.combined_candidate_filter_source !== args.combinedClosureCandidates) {
    errors.push(`${prefix} combined_candidate_filter_source mismatch`)
  }
  if (row.combined_closure_candidate_present !== false) {
    errors.push(`${prefix} combined_closure_candidate_present must be false`)
  }
  if (row.post_candidate_remaining_reason !== remainingReason(expected)) {
    errors.push(`${prefix} post_candidate_remaining_reason mismatch`)
  }
  if (row.recommended_next_gate_after_candidate_filter !== nextGate(expected)) {
    errors.push(`${prefix} recommended_next_gate_after_candidate_filter mismatch`)
  }
  if (row.auto_close_allowed !== false) errors.push(`${prefix} auto_close_allowed must remain false`)
  if (row.close_ready !== false) errors.push(`${prefix} close_ready must remain false`)
  if (row.manual_confirmation_required !== true) errors.push(`${prefix} manual_confirmation_required must remain true`)
  addAuditedRow(row, stats)
}

function validateSummary(remainingWorklist, stats, errors) {
  const summary = remainingWorklist.summary || {}
  const aliases = {
    audited_remaining_work_items: 'post_candidate_remaining_work_items',
    remaining_worklist_items: 'post_candidate_remaining_work_items'
  }
  for (const key of [
    'auto_close_allowed_items',
    'close_ready_items',
    'combined_candidate_closure_items',
    'combined_closure_readiness_items',
    'excluded_combined_candidate_items',
    'item_level_source_review_items',
    'manual_confirmation_items_total',
    'manual_confirmation_required_items',
    'source_anchor_exact_review_items',
    'source_row_confirmation_items',
    'unique_action_decisions',
    'unique_progression_groups',
    'unique_source_keys',
    'unique_standard_codes'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`summary.${key} mismatch: expected ${stats[key]}, got ${summary[key]}`)
  }
  for (const [statsKey, summaryKey] of Object.entries(aliases)) {
    if (summary[summaryKey] !== stats[statsKey]) {
      errors.push(`summary.${summaryKey} mismatch: expected ${stats[statsKey]}, got ${summary[summaryKey]}`)
    }
  }
  if (summary.remaining_manual_confirmation_items !== stats.remaining_worklist_items) {
    errors.push(`summary.remaining_manual_confirmation_items mismatch: expected ${stats.remaining_worklist_items}, got ${summary.remaining_manual_confirmation_items}`)
  }
  for (const key of [
    'by_grade_band',
    'by_inventory_bucket',
    'by_manual_confirmation_lane',
    'by_next_gate_after_candidate_filter',
    'by_post_candidate_remaining_reason',
    'by_recommendation',
    'by_source_downstream_action_batch',
    'by_subject'
  ]) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`summary.${key} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Downstream Post-Candidate Remaining Worklist Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected remaining work items | ${payload.summary.expected_remaining_work_items} |
| audited remaining work items | ${payload.summary.audited_remaining_work_items} |
| missing remaining work items | ${payload.summary.missing_remaining_work_items} |
| extra remaining work items | ${payload.summary.extra_remaining_work_items} |
| excluded combined candidate items | ${payload.summary.excluded_combined_candidate_items} |
| auto-close allowed items | ${payload.summary.auto_close_allowed_items} |
| close-ready items | ${payload.summary.close_ready_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Remaining Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_manual_confirmation_lane)}

## Remaining Reasons

| reason | rows |
| --- | ---: |
${countRows(payload.summary.by_post_candidate_remaining_reason)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    combinedClosureCandidates: args.combinedClosureCandidates,
    manualConfirmationWorklist: args.manualConfirmationWorklist,
    remainingWorklist: args.remainingWorklist
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const remainingWorklist = existsSync(args.remainingWorklist)
    ? readJson(args.remainingWorklist)
    : { post_candidate_remaining_work_items: [] }
  const manualWorklist = existsSync(args.manualConfirmationWorklist)
    ? readJson(args.manualConfirmationWorklist)
    : { manual_confirmation_work_items: [] }
  const combinedCandidate = existsSync(args.combinedClosureCandidates)
    ? readJson(args.combinedClosureCandidates)
    : { closure_readiness_items: [] }
  if (!errors.length) validateInputs(remainingWorklist, manualWorklist, combinedCandidate, args, errors)

  const combinedByDecision = mapBy(combinedCandidate.closure_readiness_items || [], 'decision_id', errors, 'combined closure candidate')
  const expectedRows = expectedRemainingRows(manualWorklist, combinedByDecision, errors)
  const expectedByDecision = mapBy(expectedRows, 'action_decision_id', errors, 'expected remaining worklist')
  const rows = remainingWorklist.post_candidate_remaining_work_items || []
  const rowByDecision = mapBy(rows, 'action_decision_id', errors, 'remaining worklist')
  const stats = summarize(expectedRows, manualWorklist, combinedCandidate)

  if (rows.length !== expectedRows.length) {
    errors.push(`remaining worklist rows ${rows.length} must match expected rows ${expectedRows.length}`)
  }
  for (const [decisionId, expected] of expectedByDecision.entries()) {
    const row = rowByDecision.get(decisionId)
    const combined = combinedByDecision.get(decisionId)
    if (!row) {
      stats.missing_remaining_work_items += 1
      errors.push(`${decisionId} missing remaining worklist row`)
      continue
    }
    validateRow(row, expected, combined, args, errors, stats, rows.indexOf(row))
  }
  for (const decisionId of rowByDecision.keys()) {
    if (!expectedByDecision.has(decisionId)) {
      stats.extra_remaining_work_items += 1
      errors.push(`${decisionId} unexpected remaining worklist row`)
    }
  }
  if (args.requireItems && !stats.audited_remaining_work_items) {
    errors.push('requireItems is set but no remaining work items were audited')
  }
  if (stats.audited_remaining_work_items !== stats.expected_remaining_work_items) {
    errors.push(`audited remaining work items ${stats.audited_remaining_work_items} must match expected ${stats.expected_remaining_work_items}`)
  }
  if (stats.excluded_combined_candidate_items + stats.expected_remaining_work_items !== stats.manual_confirmation_items_total) {
    errors.push(`excluded candidate items plus expected remaining items must equal manual confirmation total: ${stats.excluded_combined_candidate_items} + ${stats.expected_remaining_work_items} vs ${stats.manual_confirmation_items_total}`)
  }
  validateSummary(remainingWorklist, stats, errors)

  return {
    changes_official_standard_text: false,
    combined_closure_candidates: args.combinedClosureCandidates,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    manual_confirmation_worklist: args.manualConfirmationWorklist,
    matcher_ready: false,
    publication_ready: false,
    remaining_worklist: args.remainingWorklist,
    require_items: args.requireItems,
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
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
