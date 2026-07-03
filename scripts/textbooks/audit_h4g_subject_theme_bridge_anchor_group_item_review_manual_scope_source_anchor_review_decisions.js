#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe_audit.md'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--worklist') args.worklist = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits editable manual-scope source-anchor review decisions against the
read-only review worklist. Pending decisions are valid by default; completed
decisions must still keep public/data, matcher, and publication disabled.`)
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

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function uniqueStrings(values) {
  const seen = new Set()
  const out = []
  for (const value of values || []) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
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

function decisionPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    item_review_decision_must_be_edited_separately: true,
    manual_scope_source_anchor_review_decision_is_not_approval: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_item_review_update: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function validateDecisionPolicy(label, policy, errors) {
  for (const key of [
    'item_review_decision_must_be_edited_separately',
    'manual_scope_source_anchor_review_decision_is_not_approval',
    'requires_later_item_review_update',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function validateTopLevel(decisions, worklist, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template') {
    errors.push('decisions data_scope mismatch')
  }
  if (decisions.source_manual_scope_source_anchor_review_worklist !== args.worklist) {
    errors.push('decisions source_manual_scope_source_anchor_review_worklist must match audit arg')
  }
  validatePolicy('decisions', decisions, errors)
  validateDecisionPolicy('decisions policy', decisions.policy || {}, errors)
  if (!Array.isArray(decisions.manual_scope_source_anchor_review_decisions)) {
    errors.push('decisions manual_scope_source_anchor_review_decisions must be an array')
  }

  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist') {
    errors.push('worklist purpose mismatch')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  validatePolicy('worklist', worklist, errors)
  if (!Array.isArray(worklist.manual_scope_source_anchor_review_work_items)) {
    errors.push('worklist manual_scope_source_anchor_review_work_items must be an array')
  }
}

function requiredConfirmations() {
  return {
    exact_activity_or_page_bounded_evidence_recorded: false,
    exact_page_reference_recorded: false,
    item_review_decision_still_required: true,
    later_matcher_gate_required: true,
    later_publication_gate_required: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    same_grade_scope_checked: false,
    same_subject_scope_checked: false,
    target_standard_specificity_checked: false,
    unit_title_only_rejected_or_supplemented: false
  }
}

function decisionId(workItem) {
  return `h4g_anchor_group_manual_scope_source_anchor_review_decision_${hashText(workItem.work_item_id)}`
}

function allowedDecisions(workItem) {
  return uniqueStrings(['pending', ...(workItem.allowed_reviewer_outcomes || [])])
}

function staticFields(workItem) {
  return {
    anchor_type: workItem.anchor_type || '',
    evidence_url: workItem.evidence_url || '',
    grade_band: workItem.grade_band || '',
    inventory_item_id: workItem.inventory_item_id || '',
    item_review_decision_id: workItem.item_review_decision_id || '',
    lane_order: workItem.lane_order,
    manual_review_required: true,
    manual_scope_source_anchor_evidence_item_id: workItem.manual_scope_source_anchor_evidence_item_id || '',
    page_range: workItem.page_range || '',
    page_range_status: workItem.page_range_status || '',
    parent_downstream_decision_id: workItem.parent_downstream_decision_id || '',
    priority_rank: workItem.priority_rank,
    priority_tier: workItem.priority_tier || '',
    recommended_disposition: workItem.recommended_disposition || '',
    repository_path: workItem.repository_path || '',
    review_checklist: workItem.review_checklist || [],
    review_lane: workItem.review_lane || '',
    review_questions: workItem.review_questions || [],
    risk_profile: workItem.risk_profile || {},
    risk_signals: workItem.risk_signals || [],
    source_item_standard_code: workItem.source_item_standard_code || '',
    source_key: workItem.source_key || '',
    source_manual_scope_source_anchor_review_work_item_id: workItem.work_item_id || '',
    source_standard_summary: workItem.source_standard_summary || {},
    subject_slug: workItem.subject_slug || '',
    target_grade_band: workItem.target_grade_band || workItem.grade_band || '',
    target_standard_code: workItem.target_standard_code || '',
    target_standard_summary: workItem.target_standard_summary || {},
    unit_context: workItem.unit_context || {},
    unit_evidence_id: workItem.unit_evidence_id || '',
    unit_title: workItem.unit_title || ''
  }
}

function hasText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().length > 0
}

function validateReviewerOutcome(row, expectedAllowed, prefix, errors) {
  if (!expectedAllowed.includes(row.reviewer_decision || '')) {
    errors.push(`${prefix} reviewer_decision must be one of ${expectedAllowed.join(', ')}`)
  }
  if (row.reviewer_decision === 'pending') {
    if (row.decision_status !== 'pending') errors.push(`${prefix} pending decision_status must be pending`)
    return
  }
  if (row.decision_status !== 'manual_scope_source_anchor_reviewed') {
    errors.push(`${prefix} completed decision_status must be manual_scope_source_anchor_reviewed`)
  }
  if (!hasText(row.reviewer_note) && !hasText(row.decision_note)) {
    errors.push(`${prefix} completed decision must include reviewer_note or decision_note`)
  }

  const confirmations = row.required_confirmations || {}
  if (confirmations.no_public_write_requested !== true) errors.push(`${prefix} no_public_write_requested must be true`)
  if (confirmations.official_standard_text_preserved !== true) errors.push(`${prefix} official_standard_text_preserved must be true`)
  if (confirmations.item_review_decision_still_required !== true) errors.push(`${prefix} item_review_decision_still_required must be true`)
  if (confirmations.later_matcher_gate_required !== true) errors.push(`${prefix} later_matcher_gate_required must be true`)
  if (confirmations.later_publication_gate_required !== true) errors.push(`${prefix} later_publication_gate_required must be true`)

  if (row.reviewer_decision === 'source_anchor_evidence_found_for_missing_grade') {
    for (const key of [
      'exact_activity_or_page_bounded_evidence_recorded',
      'exact_page_reference_recorded',
      'same_grade_scope_checked',
      'same_subject_scope_checked',
      'target_standard_specificity_checked',
      'unit_title_only_rejected_or_supplemented'
    ]) {
      if (confirmations[key] !== true) errors.push(`${prefix} ${key} must be true when evidence is found`)
    }
    for (const key of ['exact_activity_or_task', 'exact_evidence_note', 'exact_page_reference']) {
      if (!hasText(row[key])) errors.push(`${prefix} ${key} must be populated when evidence is found`)
    }
  }
}

function validateDecision(workItem, row, errors, stats) {
  const prefix = row.decision_id || workItem.work_item_id || '(manual-scope source-anchor decision)'
  if (row.decision_id !== decisionId(workItem)) errors.push(`${prefix} decision_id mismatch`)
  if (row.decision_type !== 'anchor_group_manual_scope_source_anchor_review_decision') {
    errors.push(`${prefix} decision_type mismatch`)
  }
  if (!sameJson(row.allowed_decisions || [], allowedDecisions(workItem))) {
    errors.push(`${prefix} allowed_decisions mismatch`)
  }
  validatePolicy(prefix, row, errors)
  validateDecisionPolicy(`${prefix} decision_policy`, row.decision_policy || {}, errors)
  for (const [key, expected] of Object.entries(staticFields(workItem))) {
    if (!sameJson(row[key], expected)) errors.push(`${prefix} ${key} mismatch`)
  }
  if (row.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (row.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (row.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
  if (row.requested_eligible_for_h4g_differentiation !== false) {
    errors.push(`${prefix} requested_eligible_for_h4g_differentiation must be false`)
  }
  const confirmations = row.required_confirmations || {}
  if (row.reviewer_decision === 'pending' && !sameJson(confirmations, requiredConfirmations())) {
    errors.push(`${prefix} pending required_confirmations mismatch`)
  }
  validateReviewerOutcome(row, allowedDecisions(workItem), prefix, errors)

  stats.audited_review_decisions += 1
  if (row.reviewer_decision === 'pending') stats.pending_review_decisions += 1
  else stats.completed_review_decisions += 1
  if (row.manual_review_required) stats.manual_review_required_rows += 1
  if (Number(row.risk_profile?.risk_score || 0) >= 4) stats.high_risk_rows += 1
}

function summarizeRows(rows) {
  const summary = {
    by_decision_status: {},
    by_grade_band: {},
    by_priority_tier: {},
    by_recommended_disposition: {},
    by_review_lane: {},
    by_reviewer_decision: {},
    by_subject: {},
    by_target_standard_code: {},
    completed_review_decisions: 0,
    high_risk_rows: 0,
    manual_review_required_rows: 0,
    manual_scope_source_anchor_review_decisions: rows.length,
    pending_review_decisions: 0,
    unique_inventory_items: sorted(rows.map(row => row.inventory_item_id)).length,
    unique_source_review_work_items: sorted(rows.map(row => row.source_manual_scope_source_anchor_review_work_item_id)).length,
    unique_target_standard_codes: sorted(rows.map(row => row.target_standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    if (row.manual_review_required) summary.manual_review_required_rows += 1
    if (row.reviewer_decision === 'pending') summary.pending_review_decisions += 1
    else summary.completed_review_decisions += 1
    if (Number(row.risk_profile?.risk_score || 0) >= 4) summary.high_risk_rows += 1
    countInto(summary.by_decision_status, row.decision_status)
    countInto(summary.by_grade_band, row.target_grade_band || row.grade_band)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommended_disposition, row.recommended_disposition)
    countInto(summary.by_review_lane, row.review_lane)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.target_standard_code)
  }
  return summary
}

function markdownSummary(payload) {
  return `# H4G Manual Scope Source-Anchor Review Decisions Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected review decisions | ${payload.summary.expected_review_decisions} |
| audited review decisions | ${payload.summary.audited_review_decisions} |
| missing review decisions | ${payload.summary.missing_review_decisions} |
| extra review decisions | ${payload.summary.extra_review_decisions} |
| pending decisions | ${payload.summary.pending_review_decisions} |
| completed decisions | ${payload.summary.completed_review_decisions} |
| high risk rows | ${payload.summary.high_risk_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Reviewer Decisions

| reviewer decision | rows |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Review Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_review_lane)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['decisions', args.decisions],
    ['worklist', args.worklist]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { manual_scope_source_anchor_review_decisions: [] }
  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { manual_scope_source_anchor_review_work_items: [] }
  if (!errors.length) validateTopLevel(decisions, worklist, args, errors)

  const decisionRows = decisions.manual_scope_source_anchor_review_decisions || []
  const workItems = worklist.manual_scope_source_anchor_review_work_items || []
  const decisionsByWorkItem = mapBy(decisionRows, 'source_manual_scope_source_anchor_review_work_item_id', errors, 'decisions')
  const workItemsById = mapBy(workItems, 'work_item_id', errors, 'worklist')
  const rowSummary = summarizeRows(decisionRows)
  if (!sameJson(decisions.summary || {}, rowSummary)) errors.push('decisions summary does not match decision rows')

  const stats = {
    ...rowSummary,
    audited_review_decisions: 0,
    expected_review_decisions: workItems.length,
    extra_review_decisions: 0,
    missing_review_decisions: 0
  }
  stats.completed_review_decisions = 0
  stats.high_risk_rows = 0
  stats.manual_review_required_rows = 0
  stats.pending_review_decisions = 0

  if (decisionRows.length !== workItems.length) {
    errors.push(`decision rows ${decisionRows.length} must match worklist rows ${workItems.length}`)
  }
  for (const [workItemId, workItem] of workItemsById.entries()) {
    const decision = decisionsByWorkItem.get(workItemId)
    if (!decision) {
      stats.missing_review_decisions += 1
      errors.push(`${workItemId} missing review decision`)
      continue
    }
    validateDecision(workItem, decision, errors, stats)
  }
  for (const workItemId of decisionsByWorkItem.keys()) {
    if (!workItemsById.has(workItemId)) {
      stats.extra_review_decisions += 1
      errors.push(`${workItemId} unexpected review decision`)
    }
  }
  if (args.requireItems && !stats.audited_review_decisions) {
    errors.push('requireItems is set but no review decisions were audited')
  }
  if (stats.audited_review_decisions !== stats.expected_review_decisions) {
    errors.push(`audited review decisions ${stats.audited_review_decisions} must match expected ${stats.expected_review_decisions}`)
  }

  return {
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    require_items: args.requireItems,
    summary: stats,
    valid: errors.length === 0,
    worklist: args.worklist,
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
