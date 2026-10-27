#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_INVENTORY_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe_audit.md'

const CANDIDATE_DECISION = 'target_standard_gap_confirmed'
const CANDIDATE_STATUS = 'target_gap_inventory_candidate_reviewed'
const ALLOWED_CHANGED_ROW_FIELDS = new Set([
  'decision_note',
  'decision_status',
  'required_confirmations',
  'reviewed_at',
  'reviewed_by',
  'reviewer_decision',
  'source_downstream_action_decision_id',
  'source_downstream_action_decisions_candidate',
  'target_gap_inventory_evidence',
  'target_gap_inventory_parent_decision_candidate',
  'target_gap_parent_decision_candidate_policy'
])

function parseArgs(argv) {
  const args = {
    actionCandidate: DEFAULT_ACTION_CANDIDATE,
    candidate: DEFAULT_CANDIDATE,
    decisions: DEFAULT_DECISIONS,
    inventoryAudit: DEFAULT_INVENTORY_AUDIT,
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
    else if (item === '--inventory-audit') args.inventoryAudit = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate.js \\
  --candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json \\
  --action-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --inventory-audit generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits a target-gap parent downstream decisions candidate. It ensures only
parent target-standard gap rows backed by action decision candidates changed,
and no public/matcher/publication capability was introduced.`)
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
  if (actionCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate') {
    errors.push('action candidate candidate_purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate')
  }
  if (actionCandidate.source_target_standard_gap_inventory_audit !== args.inventoryAudit) {
    errors.push('action candidate inventory audit path must match audit arg')
  }
  if (actionCandidate.review_only !== true) errors.push('action candidate review_only must be true')
  validatePolicy('action candidate', actionCandidate, errors)
  if (!Array.isArray(actionCandidate.downstream_action_decisions)) {
    errors.push('action candidate downstream_action_decisions must be an array')
  }
}

function validateInventoryAudit(inventory, args, errors) {
  if (inventory.valid !== true) errors.push('inventory audit valid must be true')
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_audit') {
    errors.push('inventory audit purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_audit')
  }
  if (inventory.inventory_evidence_only !== true) errors.push('inventory audit inventory_evidence_only must be true')
  validatePolicy('inventory audit', inventory, errors)
  if (!Array.isArray(inventory.inventory_items)) errors.push('inventory audit inventory_items must be an array')
}

function validateCandidateTopLevel(candidate, args, errors) {
  if (candidate.valid !== true) errors.push('candidate valid must be true')
  if (candidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('candidate purpose should preserve parent decisions template purpose')
  }
  if (candidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate') {
    errors.push('candidate candidate_purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate')
  }
  if (candidate.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('candidate data_scope must preserve parent decisions data_scope')
  }
  if (candidate.source_decisions_template !== args.decisions) errors.push('candidate source_decisions_template must match audit arg')
  if (candidate.source_downstream_action_decisions_candidate !== args.actionCandidate) {
    errors.push('candidate source_downstream_action_decisions_candidate must match audit arg')
  }
  if (candidate.source_target_standard_gap_inventory_audit !== args.inventoryAudit) {
    errors.push('candidate source_target_standard_gap_inventory_audit must match audit arg')
  }
  if (candidate.review_only !== true) errors.push('candidate review_only must be true')
  if (candidate.publication_candidate !== false) errors.push('candidate publication_candidate must be false')
  validatePolicy('candidate', candidate, errors)
  const policy = candidate.parent_candidate_policy || {}
  for (const key of [
    'downstream_item_review_decision_is_not_approval',
    'item_level_decision_gate_required',
    'parent_candidate_is_not_publication_approval',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'source_decision_must_be_edited_separately',
    'target_gap_parent_decision_candidate_is_later_gate_input'
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
  return row.target_gap_inventory_decision_candidate === true &&
    row.reviewer_decision === CANDIDATE_DECISION &&
    row.decision_status === 'inventory_candidate_reviewed'
}

function expectedConfirmations(base) {
  return {
    ...(base.required_confirmations || {}),
    item_level_decision_still_required: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    progression_group_scope_checked: true,
    source_anchor_evidence_search_deferred: true,
    target_missing_grade_standard_absent_checked: true
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

function validateRowPolicy(row, errors) {
  const prefix = row.decision_id || '(missing parent decision)'
  for (const key of [
    'requested_public_write',
    'requested_official_text_change',
    'requested_direct_matcher_use',
    'requested_eligible_for_h4g_differentiation',
    'writes_public_data',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (row[key] !== false) errors.push(`${prefix} ${key} must be false`)
  }
  const policy = row.target_gap_parent_decision_candidate_policy || {}
  for (const key of [
    'downstream_item_review_decision_is_not_approval',
    'item_level_decision_gate_required',
    'parent_candidate_is_not_publication_approval',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'source_decision_must_be_edited_separately',
    'target_gap_parent_decision_candidate_is_later_gate_input'
  ]) {
    if (policy[key] !== true) errors.push(`${prefix} target_gap_parent_decision_candidate_policy.${key} must be true`)
  }
  validatePolicy(`${prefix} target_gap_parent_decision_candidate_policy`, policy, errors)
}

function validateParentCandidate(base, row, action, inventoryItem, args, errors, stats) {
  const prefix = row.decision_id || action.decision_id || '(missing parent decision)'
  validateUnchangedExceptAllowed(base, row, errors)
  if (base.reviewer_decision !== 'pending') errors.push(`${prefix} source parent row must start pending`)
  if (base.decision_status !== 'pending_review') errors.push(`${prefix} source parent row must start pending_review`)
  if (base.source_batch !== 'target_standard_gap') errors.push(`${prefix} source parent row must be target_standard_gap`)
  if (row.reviewer_decision !== CANDIDATE_DECISION) errors.push(`${prefix} reviewer_decision must be ${CANDIDATE_DECISION}`)
  if (row.decision_status !== CANDIDATE_STATUS) errors.push(`${prefix} decision_status must be ${CANDIDATE_STATUS}`)
  if (!row.reviewed_at) errors.push(`${prefix} reviewed_at is required`)
  if (!row.reviewed_by) errors.push(`${prefix} reviewed_by is required`)
  if (!row.decision_note) errors.push(`${prefix} decision_note is required`)
  if (row.target_gap_inventory_parent_decision_candidate !== true) errors.push(`${prefix} target_gap_inventory_parent_decision_candidate must be true`)
  if (row.source_downstream_action_decision_id !== action.decision_id) errors.push(`${prefix} source_downstream_action_decision_id must match action candidate`)
  if (row.source_downstream_action_decisions_candidate !== args.actionCandidate) {
    errors.push(`${prefix} source_downstream_action_decisions_candidate must match audit arg`)
  }
  if (!sameJson(row.required_confirmations || {}, expectedConfirmations(base))) {
    errors.push(`${prefix} required_confirmations must only close target gap inventory confirmations`)
  }
  if (base.decision_id !== action.downstream_decision_id) errors.push(`${prefix} parent decision id must match action downstream_decision_id`)
  if (base.source_batch_item_id !== action.source_batch_item_id) errors.push(`${prefix} source_batch_item_id must match action source_batch_item_id`)
  if (base.grade_band !== action.target_grade_band) errors.push(`${prefix} grade_band must match action target_grade_band`)
  if (base.source_standard_code !== action.source_standard_code) errors.push(`${prefix} source_standard_code must match action source_standard_code`)
  if (base.progression_group_id !== action.progression_group_id) errors.push(`${prefix} progression_group_id must match action progression_group_id`)
  if (!inventoryItem) errors.push(`${prefix} missing inventory item for action`)
  else if (inventoryItem.inventory_status !== 'confirmed_absent_in_public_inventory') {
    errors.push(`${prefix} inventory item must be confirmed_absent_in_public_inventory`)
  }
  const evidence = row.target_gap_inventory_evidence || {}
  if (evidence.source_parent_decision_id !== base.decision_id) errors.push(`${prefix} evidence.source_parent_decision_id must match parent decision`)
  if (evidence.batch_item_id !== action.source_downstream_action_item_id) errors.push(`${prefix} evidence.batch_item_id must match action source item`)
  if (evidence.exact_target_code !== action.target_gap_inventory_evidence?.exact_target_code) {
    errors.push(`${prefix} evidence.exact_target_code must match action evidence`)
  }
  validateRowPolicy(row, errors)
  stats.parent_candidate_decisions += 1
  countInto(stats.by_candidate_target_grade_band, row.grade_band)
}

function summarize(candidateRows) {
  const stats = {
    by_candidate_target_grade_band: {},
    by_reviewer_decision: {},
    by_source_batch: {},
    by_subject: {},
    changed_candidate_rows: 0,
    downstream_decisions: candidateRows.length,
    expected_parent_candidate_decisions: 0,
    extra_candidate_rows: 0,
    parent_candidate_decisions: 0,
    pending_downstream_decisions: 0,
    missing_candidate_rows: 0
  }
  for (const row of candidateRows) {
    if (row.reviewer_decision === 'pending') stats.pending_downstream_decisions += 1
    if (row.target_gap_inventory_parent_decision_candidate) stats.changed_candidate_rows += 1
    countInto(stats.by_reviewer_decision, row.reviewer_decision)
    countInto(stats.by_source_batch, row.source_batch)
    countInto(stats.by_subject, row.subject_slug)
  }
  return stats
}

function validateSummary(candidate, stats, errors) {
  const summary = candidate.summary || {}
  const checks = [
    ['downstream_decisions', stats.downstream_decisions],
    ['parent_candidate_decisions', stats.parent_candidate_decisions],
    ['pending_downstream_decisions', stats.pending_downstream_decisions]
  ]
  for (const [field, expected] of checks) {
    if (Number(summary[field] || 0) !== Number(expected || 0)) {
      errors.push(`candidate summary.${field} must be ${expected}`)
    }
  }
}

function markdownSummary(payload) {
  return `# H4G Target Gap Inventory Parent Decisions Candidate Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected parent candidate decisions | ${payload.summary.expected_parent_candidate_decisions} |
| parent candidate decisions | ${payload.summary.parent_candidate_decisions} |
| missing candidate rows | ${payload.summary.missing_candidate_rows} |
| extra candidate rows | ${payload.summary.extra_candidate_rows} |
| pending downstream decisions | ${payload.summary.pending_downstream_decisions} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Reviewer Decisions

| reviewer decision | decisions |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Source Batches

| source batch | decisions |
| --- | ---: |
${countRows(payload.summary.by_source_batch)}

## Candidate Target Grades

| target grade | decisions |
| --- | ---: |
${countRows(payload.summary.by_candidate_target_grade_band)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['candidate', args.candidate],
    ['parent decisions', args.decisions],
    ['action candidate', args.actionCandidate],
    ['inventory audit', args.inventoryAudit]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const candidate = existsSync(args.candidate) ? readJson(args.candidate) : { downstream_decisions: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { downstream_decisions: [] }
  const actionCandidate = existsSync(args.actionCandidate) ? readJson(args.actionCandidate) : { downstream_action_decisions: [] }
  const inventory = existsSync(args.inventoryAudit) ? readJson(args.inventoryAudit) : { inventory_items: [] }
  if (!errors.length) {
    validateParentDecisions(decisions, args, errors)
    validateActionCandidate(actionCandidate, args, errors)
    validateInventoryAudit(inventory, args, errors)
    validateCandidateTopLevel(candidate, args, errors)
  }

  const sourceByDecisionId = mapBy(decisions.downstream_decisions || [], 'decision_id', errors, 'source parent decisions')
  const candidateByDecisionId = mapBy(candidate.downstream_decisions || [], 'decision_id', errors, 'candidate parent decisions')
  const inventoryByBatchItem = mapBy(inventory.inventory_items || [], 'batch_item_id', errors, 'inventory')
  const actionCandidates = (actionCandidate.downstream_action_decisions || []).filter(isActionCandidate)
  const actionByParentId = new Map()
  for (const action of actionCandidates) {
    if (!action.downstream_decision_id) errors.push(`${action.decision_id || '(missing action decision)'} missing downstream_decision_id`)
    if (actionByParentId.has(action.downstream_decision_id)) {
      errors.push(`${action.downstream_decision_id} has duplicate action candidates`)
    }
    actionByParentId.set(action.downstream_decision_id, action)
  }

  const stats = summarize(candidate.downstream_decisions || [])
  stats.expected_parent_candidate_decisions = actionByParentId.size

  if ((candidate.downstream_decisions || []).length !== (decisions.downstream_decisions || []).length) {
    errors.push(`candidate rows ${(candidate.downstream_decisions || []).length} must match source rows ${(decisions.downstream_decisions || []).length}`)
  }

  for (const [decisionId, sourceRow] of sourceByDecisionId.entries()) {
    const candidateRow = candidateByDecisionId.get(decisionId)
    if (!candidateRow) {
      errors.push(`${decisionId} missing candidate row`)
      continue
    }
    const action = actionByParentId.get(decisionId)
    if (!action) {
      if (!sameJson(sourceRow, candidateRow)) {
        stats.extra_candidate_rows += 1
        errors.push(`${decisionId} changed but is not backed by a target gap action candidate`)
      }
      continue
    }
    const inventoryItem = inventoryByBatchItem.get(action.source_downstream_action_item_id)
    validateParentCandidate(sourceRow, candidateRow, action, inventoryItem, args, errors, stats)
  }

  for (const decisionId of candidateByDecisionId.keys()) {
    if (!sourceByDecisionId.has(decisionId)) {
      stats.extra_candidate_rows += 1
      errors.push(`${decisionId} unexpected candidate row`)
    }
  }
  for (const decisionId of actionByParentId.keys()) {
    const row = candidateByDecisionId.get(decisionId)
    if (!row || row.target_gap_inventory_parent_decision_candidate !== true) {
      stats.missing_candidate_rows += 1
      errors.push(`${decisionId} missing parent target gap inventory candidate marker`)
    }
  }
  if (args.requireItems && !stats.parent_candidate_decisions) {
    errors.push('requireItems is set but no parent candidate decisions were audited')
  }
  if (stats.parent_candidate_decisions !== stats.expected_parent_candidate_decisions) {
    errors.push(`parent candidate decisions ${stats.parent_candidate_decisions} must match expected ${stats.expected_parent_candidate_decisions}`)
  }
  validateSummary(candidate, stats, errors)

  return {
    action_candidate: args.actionCandidate,
    candidate: args.candidate,
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    inventory_audit: args.inventoryAudit,
    matcher_ready: false,
    publication_ready: false,
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
