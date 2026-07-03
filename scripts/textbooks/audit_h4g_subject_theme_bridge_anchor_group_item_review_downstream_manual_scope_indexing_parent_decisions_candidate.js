#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe_audit.md'

const CANDIDATE_DECISION = 'missing_grade_units_indexed_for_later_source_review'
const CANDIDATE_STATUS = 'manual_scope_indexing_candidate_reviewed'
const ALLOWED_CHANGED_ROW_FIELDS = new Set([
  'decision_note',
  'decision_status',
  'manual_scope_indexing_evidence',
  'manual_scope_indexing_parent_decision_candidate',
  'manual_scope_parent_decision_candidate_policy',
  'required_confirmations',
  'reviewed_at',
  'reviewed_by',
  'reviewer_decision',
  'source_downstream_action_decision_id',
  'source_downstream_action_decisions_candidate'
])

function parseArgs(argv) {
  const args = {
    actionCandidate: DEFAULT_ACTION_CANDIDATE,
    candidate: DEFAULT_CANDIDATE,
    decisions: DEFAULT_DECISIONS,
    inventory: DEFAULT_INVENTORY,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--action-candidate') args.actionCandidate = argv[++i]
    else if (item === '--inventory') args.inventory = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate.js \\
  --candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json \\
  --action-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --inventory generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits a manual-scope/indexing parent downstream decisions candidate. It
ensures only parent missing-grade unit-indexing rows backed by action decision
candidates changed, all other rows are unchanged, and no public/matcher/
publication capability was introduced.`)
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

function validateParentDecisions(decisions, args, errors) {
  if (decisions.valid !== true) errors.push('source parent decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('source parent decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('source parent decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template')
  }
  validatePolicy('source parent decisions', decisions, errors)
  if (!Array.isArray(decisions.downstream_decisions)) errors.push('source parent decisions downstream_decisions must be an array')
  if (args.requireItems && !(decisions.downstream_decisions || []).length) {
    errors.push('requireItems is set but source parent decisions has no rows')
  }
}

function validateActionCandidate(actionCandidate, args, errors) {
  if (actionCandidate.valid !== true) errors.push('action candidate valid must be true')
  if (actionCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate') {
    errors.push('action candidate candidate_purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate')
  }
  if (actionCandidate.source_manual_scope_indexing_inventory !== args.inventory) {
    errors.push('action candidate inventory path must match audit arg')
  }
  if (actionCandidate.review_only !== true) errors.push('action candidate review_only must be true')
  validatePolicy('action candidate', actionCandidate, errors)
  if (!Array.isArray(actionCandidate.downstream_action_decisions)) {
    errors.push('action candidate downstream_action_decisions must be an array')
  }
}

function validateInventory(inventory, args, errors) {
  if (inventory.valid !== true) errors.push('inventory valid must be true')
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory') {
    errors.push('inventory purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory')
  }
  validatePolicy('inventory', inventory, errors)
  if (!Array.isArray(inventory.inventory_items)) errors.push('inventory inventory_items must be an array')
}

function validateCandidateTopLevel(candidate, args, errors) {
  if (candidate.valid !== true) errors.push('candidate valid must be true')
  if (candidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('candidate purpose should preserve parent decisions template purpose')
  }
  if (candidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate') {
    errors.push('candidate candidate_purpose mismatch')
  }
  if (candidate.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('candidate data_scope must preserve parent decisions data_scope')
  }
  if (candidate.source_decisions_template !== args.decisions) errors.push('candidate source_decisions_template must match audit arg')
  if (candidate.source_downstream_action_decisions_candidate !== args.actionCandidate) {
    errors.push('candidate source_downstream_action_decisions_candidate must match audit arg')
  }
  if (candidate.source_manual_scope_indexing_inventory !== args.inventory) {
    errors.push('candidate source_manual_scope_indexing_inventory must match audit arg')
  }
  if (candidate.review_only !== true) errors.push('candidate review_only must be true')
  if (candidate.publication_candidate !== false) errors.push('candidate publication_candidate must be false')
  validatePolicy('candidate', candidate, errors)
  const policy = candidate.parent_candidate_policy || {}
  for (const key of [
    'downstream_item_review_decision_is_not_approval',
    'item_level_decision_gate_required',
    'manual_scope_parent_decision_candidate_is_later_gate_input',
    'parent_candidate_is_not_publication_approval',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_later_source_anchor_review',
    'source_decision_must_be_edited_separately'
  ]) {
    if (policy[key] !== true) errors.push(`candidate parent_candidate_policy.${key} must be true`)
  }
  validatePolicy('candidate parent_candidate_policy', policy, errors)
  if (!Array.isArray(candidate.downstream_decisions)) errors.push('candidate downstream_decisions must be an array')
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

function isActionCandidate(row) {
  return row.manual_scope_indexing_decision_candidate === true &&
    row.reviewer_decision === CANDIDATE_DECISION &&
    row.decision_status === 'inventory_candidate_reviewed'
}

function expectedConfirmations(base) {
  return {
    ...(base.required_confirmations || {}),
    item_level_decision_still_required: true,
    missing_grade_textbook_units_indexed: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    same_grade_scope_checked: true,
    source_anchor_specificity_still_required: true,
    target_missing_grade_standard_checked: true
  }
}

function validateUnchangedExceptAllowed(base, candidate, errors) {
  const prefix = candidate.decision_id || base.decision_id || '(missing parent decision)'
  const keys = sorted([...Object.keys(base || {}), ...Object.keys(candidate || {})])
  for (const key of keys) {
    if (ALLOWED_CHANGED_ROW_FIELDS.has(key)) continue
    if (!sameJson(base[key], candidate[key])) errors.push(`${prefix} field ${key} changed unexpectedly`)
  }
}

function validateCandidateRow(base, candidate, action, args, errors, stats) {
  const prefix = candidate.decision_id || base.decision_id || '(missing parent decision)'
  validateUnchangedExceptAllowed(base, candidate, errors)
  if (base.source_batch !== 'missing_grade_unit_indexing') errors.push(`${prefix} source_batch must be missing_grade_unit_indexing`)
  if (!(base.allowed_decisions || []).includes(CANDIDATE_DECISION)) {
    errors.push(`${prefix} base allowed_decisions must include ${CANDIDATE_DECISION}`)
  }
  if (candidate.reviewer_decision !== CANDIDATE_DECISION) errors.push(`${prefix} reviewer_decision mismatch`)
  if (candidate.decision_status !== CANDIDATE_STATUS) errors.push(`${prefix} decision_status mismatch`)
  if (!candidate.reviewed_at) errors.push(`${prefix} reviewed_at is required`)
  if (!candidate.reviewed_by) errors.push(`${prefix} reviewed_by is required`)
  if (candidate.source_downstream_action_decision_id !== action.decision_id) {
    errors.push(`${prefix} source_downstream_action_decision_id mismatch`)
  }
  if (candidate.source_downstream_action_decisions_candidate !== args.actionCandidate) {
    errors.push(`${prefix} source_downstream_action_decisions_candidate mismatch`)
  }
  if (candidate.manual_scope_indexing_parent_decision_candidate !== true) {
    errors.push(`${prefix} manual_scope_indexing_parent_decision_candidate must be true`)
  }
  if (!sameJson(candidate.required_confirmations, expectedConfirmations(base))) {
    errors.push(`${prefix} required_confirmations mismatch`)
  }
  const evidence = candidate.manual_scope_indexing_evidence || {}
  const actionEvidence = action.manual_scope_indexing_evidence || {}
  for (const key of [
    'inventory',
    'inventory_item_id',
    'manual_scope_indexing_item_id',
    'same_grade_page_ready_candidate_count',
    'same_grade_unit_index_candidate_count',
    'subject_slug',
    'target_grade_band',
    'target_standard_code',
    'target_standard_exists_in_public'
  ]) {
    if (!sameJson(evidence[key], actionEvidence[key])) errors.push(`${prefix} manual_scope_indexing_evidence.${key} mismatch`)
  }
  if (evidence.source_parent_decision_id !== base.decision_id) {
    errors.push(`${prefix} manual_scope_indexing_evidence.source_parent_decision_id mismatch`)
  }
  if (!Array.isArray(evidence.unit_candidate_preview) || !evidence.unit_candidate_preview.length) {
    errors.push(`${prefix} manual_scope_indexing_evidence.unit_candidate_preview must be populated`)
  }
  const rowPolicy = candidate.manual_scope_parent_decision_candidate_policy || {}
  for (const key of [
    'downstream_item_review_decision_is_not_approval',
    'item_level_decision_gate_required',
    'manual_scope_parent_decision_candidate_is_later_gate_input',
    'parent_candidate_is_not_publication_approval',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_later_source_anchor_review',
    'source_decision_must_be_edited_separately'
  ]) {
    if (rowPolicy[key] !== true) errors.push(`${prefix} manual_scope_parent_decision_candidate_policy.${key} must be true`)
  }
  validatePolicy(`${prefix} manual_scope_parent_decision_candidate_policy`, rowPolicy, errors)

  stats.candidate_decisions += 1
  countInto(stats.by_candidate_subject, candidate.subject_slug)
  countInto(stats.by_target_grade_band, candidate.grade_band)
  countInto(stats.by_target_standard_code, candidate.target_standard_code)
}

function markdownSummary(payload) {
  return `# H4G Downstream Manual Scope Indexing Parent Decisions Candidate Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| downstream decisions | ${payload.summary.downstream_decisions} |
| expected candidate decisions | ${payload.summary.expected_candidate_decisions} |
| audited candidate decisions | ${payload.summary.candidate_decisions} |
| pending downstream decisions | ${payload.summary.pending_downstream_decisions} |
| changed non-candidate decisions | ${payload.summary.changed_non_candidate_decisions} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Target Grades

| target grade | rows |
| --- | ---: |
${countRows(payload.summary.by_target_grade_band)}

## Subjects

| subject | rows |
| --- | ---: |
${countRows(payload.summary.by_candidate_subject)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['candidate', args.candidate],
    ['parent decisions', args.decisions],
    ['manual scope action candidate', args.actionCandidate],
    ['manual scope inventory', args.inventory]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const candidate = existsSync(args.candidate) ? readJson(args.candidate) : { downstream_decisions: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { downstream_decisions: [] }
  const actionCandidate = existsSync(args.actionCandidate) ? readJson(args.actionCandidate) : { downstream_action_decisions: [] }
  const inventory = existsSync(args.inventory) ? readJson(args.inventory) : { inventory_items: [] }
  if (!errors.length) {
    validateParentDecisions(decisions, args, errors)
    validateActionCandidate(actionCandidate, args, errors)
    validateInventory(inventory, args, errors)
    validateCandidateTopLevel(candidate, args, errors)
  }

  const sourceById = mapBy(decisions.downstream_decisions || [], 'decision_id', errors, 'source parent decisions')
  const candidateById = mapBy(candidate.downstream_decisions || [], 'decision_id', errors, 'candidate parent decisions')
  const inventoryByItem = mapBy(inventory.inventory_items || [], 'manual_scope_indexing_item_id', errors, 'manual scope inventory')
  const actionRows = (actionCandidate.downstream_action_decisions || []).filter(isActionCandidate)
  const expectedActionByParentId = new Map()
  for (const action of actionRows) {
    const parentId = action.downstream_decision_id || ''
    const inventoryItem = inventoryByItem.get(action.source_downstream_action_item_id)
    if (!inventoryItem) errors.push(`${action.decision_id} missing manual scope inventory item`)
    if (!parentId) errors.push(`${action.decision_id} missing downstream_decision_id`)
    if (parentId && expectedActionByParentId.has(parentId)) errors.push(`${parentId} duplicate action candidate`)
    if (parentId) expectedActionByParentId.set(parentId, action)
  }

  const stats = {
    by_candidate_subject: {},
    by_target_grade_band: {},
    by_target_standard_code: {},
    candidate_decisions: 0,
    changed_non_candidate_decisions: 0,
    downstream_decisions: (candidate.downstream_decisions || []).length,
    expected_candidate_decisions: expectedActionByParentId.size,
    pending_downstream_decisions: (candidate.downstream_decisions || []).filter(row => row.reviewer_decision === 'pending').length
  }

  for (const [decisionId, base] of sourceById.entries()) {
    const row = candidateById.get(decisionId)
    if (!row) {
      errors.push(`${decisionId} missing candidate row`)
      continue
    }
    const action = expectedActionByParentId.get(decisionId)
    if (action) validateCandidateRow(base, row, action, args, errors, stats)
    else {
      if (!sameJson(base, row)) stats.changed_non_candidate_decisions += 1
      if (!sameJson(base, row)) errors.push(`${decisionId} non-candidate row must remain unchanged`)
    }
  }
  for (const decisionId of candidateById.keys()) {
    if (!sourceById.has(decisionId)) errors.push(`${decisionId} unexpected candidate row`)
  }
  if (args.requireItems && !stats.candidate_decisions) errors.push('requireItems is set but no candidate decisions were audited')
  if (stats.candidate_decisions !== stats.expected_candidate_decisions) {
    errors.push(`candidate decisions ${stats.candidate_decisions} must match expected ${stats.expected_candidate_decisions}`)
  }
  if (stats.downstream_decisions !== (decisions.downstream_decisions || []).length) {
    errors.push('candidate downstream_decisions count must match source parent decisions')
  }

  const summary = candidate.summary || {}
  for (const key of [
    'candidate_decisions',
    'downstream_decisions',
    'pending_downstream_decisions'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`candidate summary.${key} mismatch`)
  }
  for (const key of ['by_candidate_subject', 'by_target_grade_band', 'by_target_standard_code']) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`candidate summary.${key} mismatch`)
  }

  return {
    action_candidate: args.actionCandidate,
    candidate: args.candidate,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    inventory: args.inventory,
    matcher_ready: false,
    publication_ready: false,
    require_items: args.requireItems,
    source_decisions: args.decisions,
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
