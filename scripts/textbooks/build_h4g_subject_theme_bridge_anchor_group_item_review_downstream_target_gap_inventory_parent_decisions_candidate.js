#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_INVENTORY_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe.md'

const CANDIDATE_DECISION = 'target_standard_gap_confirmed'
const CANDIDATE_STATUS = 'target_gap_inventory_candidate_reviewed'

function parseArgs(argv) {
  const args = {
    actionCandidate: DEFAULT_ACTION_CANDIDATE,
    decisions: DEFAULT_DECISIONS,
    inventoryAudit: DEFAULT_INVENTORY_AUDIT,
    out: DEFAULT_OUT,
    requireItems: false,
    reviewedAt: new Date().toISOString().slice(0, 10),
    reviewedBy: 'Codex target gap parent decision candidate',
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--action-candidate') args.actionCandidate = argv[++i]
    else if (item === '--inventory-audit') args.inventoryAudit = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--reviewed-by') args.reviewedBy = argv[++i]
    else if (item === '--reviewed-at') args.reviewedAt = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json \\
  --action-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --inventory-audit generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a non-public parent downstream decisions candidate from target-gap action
decision candidates. It only marks parent target-standard gap decisions whose
action-review candidate is confirmed; it does not edit the source template,
write public/data, change official standard text, or enable matcher/publication
use.`)
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

function truncate(value, max = 110) {
  const text = markdownCell(value)
  if (text.length <= max) return text
  return `${text.slice(0, max - 3)}...`
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
  if (decisions.valid !== true) errors.push('parent decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('parent decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('parent decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template')
  }
  validatePolicy('parent decisions', decisions, errors)
  if (!Array.isArray(decisions.downstream_decisions)) errors.push('parent decisions downstream_decisions must be an array')
  if (args.requireItems && !(decisions.downstream_decisions || []).length) {
    errors.push('requireItems is set but parent decisions has no downstream_decisions')
  }
}

function validateActionCandidate(actionCandidate, args, errors) {
  if (actionCandidate.valid !== true) errors.push('action candidate valid must be true')
  if (actionCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate') {
    errors.push('action candidate candidate_purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate')
  }
  if (actionCandidate.review_only !== true) errors.push('action candidate review_only must be true')
  if (actionCandidate.source_target_standard_gap_inventory_audit !== args.inventoryAudit) {
    errors.push('action candidate inventory audit path must match builder arg')
  }
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

function parentCandidatePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_item_review_decision_is_not_approval: true,
    eligible_for_h4g_differentiation: false,
    item_level_decision_gate_required: true,
    matcher_ready: false,
    parent_candidate_is_not_publication_approval: true,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    source_decision_must_be_edited_separately: true,
    target_gap_parent_decision_candidate_is_later_gate_input: true,
    writes_public_data: false
  }
}

function isActionCandidate(row) {
  return row.target_gap_inventory_decision_candidate === true &&
    row.reviewer_decision === CANDIDATE_DECISION &&
    row.decision_status === 'inventory_candidate_reviewed'
}

function validateActionRow(action, parent, inventoryByBatchItem, errors) {
  const prefix = action.decision_id || action.source_downstream_action_item_id || '(missing action candidate)'
  if (!isActionCandidate(action)) errors.push(`${prefix} must be a target gap inventory action candidate`)
  if (action.source_downstream_action_batch !== 'target_standard_gap_resolution') {
    errors.push(`${prefix} must come from target_standard_gap_resolution`)
  }
  if (!action.downstream_decision_id) errors.push(`${prefix} missing downstream_decision_id`)
  if (!parent) {
    errors.push(`${prefix} missing parent downstream decision`)
    return
  }
  if (parent.reviewer_decision !== 'pending') errors.push(`${prefix} parent decision must still be pending`)
  if (parent.decision_status !== 'pending_review') errors.push(`${prefix} parent decision must still be pending_review`)
  if (parent.source_batch !== 'target_standard_gap') errors.push(`${prefix} parent source_batch must be target_standard_gap`)
  if (!(parent.allowed_decisions || []).includes(CANDIDATE_DECISION)) {
    errors.push(`${prefix} parent allowed_decisions must include ${CANDIDATE_DECISION}`)
  }
  if (parent.source_batch_item_id !== action.source_batch_item_id) errors.push(`${prefix} parent source_batch_item_id must match action source_batch_item_id`)
  if (parent.standard_code !== action.standard_code) errors.push(`${prefix} parent standard_code must match action standard_code`)
  if (parent.source_standard_code !== action.source_standard_code) errors.push(`${prefix} parent source_standard_code must match action source_standard_code`)
  if (parent.grade_band !== action.target_grade_band) errors.push(`${prefix} parent grade_band must match action target_grade_band`)
  if (parent.progression_group_id !== action.progression_group_id) errors.push(`${prefix} parent progression_group_id must match action progression_group_id`)
  const inventoryItem = inventoryByBatchItem.get(action.source_downstream_action_item_id)
  if (!inventoryItem) errors.push(`${prefix} missing inventory item for action source item`)
  if (inventoryItem && inventoryItem.inventory_status !== 'confirmed_absent_in_public_inventory') {
    errors.push(`${prefix} inventory item must be confirmed_absent_in_public_inventory`)
  }
}

function parentDecisionNote(parent, action) {
  const evidence = action.target_gap_inventory_evidence || {}
  return [
    'Parent downstream decision candidate: downstream action review confirmed this target-standard gap against the public inventory.',
    `Action decision ${action.decision_id} confirms source ${evidence.source_standard_code || action.source_standard_code} has no target grade record for ${evidence.missing_grade_band || parent.grade_band}.`,
    `Expected target code ${evidence.exact_target_code || 'unknown'} is absent, with ${evidence.target_grade_same_legacy_code_records_count || 0} same-legacy and ${evidence.target_grade_same_progression_group_records_count || 0} same-group target alternatives.`,
    'This is still not bridge approval, matcher readiness, publication readiness, or a public data change.'
  ].join(' ')
}

function applyParentCandidate(parent, action, args) {
  return {
    ...parent,
    decision_note: parentDecisionNote(parent, action),
    decision_status: CANDIDATE_STATUS,
    required_confirmations: {
      ...(parent.required_confirmations || {}),
      item_level_decision_still_required: true,
      no_public_write_requested: true,
      official_standard_text_preserved: true,
      progression_group_scope_checked: true,
      source_anchor_evidence_search_deferred: true,
      target_missing_grade_standard_absent_checked: true
    },
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewedBy,
    reviewer_decision: CANDIDATE_DECISION,
    source_downstream_action_decision_id: action.decision_id || '',
    source_downstream_action_decisions_candidate: args.actionCandidate,
    target_gap_inventory_evidence: {
      ...(action.target_gap_inventory_evidence || {}),
      source_parent_decision_id: parent.decision_id || ''
    },
    target_gap_inventory_parent_decision_candidate: true,
    target_gap_parent_decision_candidate_policy: parentCandidatePolicy()
  }
}

function buildRows(decisions, actionCandidate, inventory, args, errors) {
  const parentById = mapBy(decisions.downstream_decisions || [], 'decision_id', errors, 'parent decisions')
  const inventoryByBatchItem = mapBy(inventory.inventory_items || [], 'batch_item_id', errors, 'inventory')
  const actionCandidates = (actionCandidate.downstream_action_decisions || []).filter(isActionCandidate)
  const actionByParentId = new Map()
  for (const action of actionCandidates) {
    const parent = parentById.get(action.downstream_decision_id)
    validateActionRow(action, parent, inventoryByBatchItem, errors)
    if (!action.downstream_decision_id) continue
    if (actionByParentId.has(action.downstream_decision_id)) {
      errors.push(`${action.downstream_decision_id} has duplicate target gap action candidates`)
    }
    actionByParentId.set(action.downstream_decision_id, action)
  }
  return (decisions.downstream_decisions || []).map(row => {
    const action = actionByParentId.get(row.decision_id)
    return action ? applyParentCandidate(row, action, args) : row
  })
}

function summarize(rows) {
  const summary = {
    by_decision_type: {},
    by_grade_band: {},
    by_item_review_surface: {},
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_source_batch: {},
    by_subject: {},
    completed_downstream_decisions: 0,
    downstream_decisions: rows.length,
    parent_candidate_decisions: 0,
    pending_downstream_decisions: 0,
    source_anchor_review_rows: 0
  }
  for (const row of rows) {
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    if (row.reviewer_decision === 'pending') summary.pending_downstream_decisions += 1
    else summary.completed_downstream_decisions += 1
    if (row.target_gap_inventory_parent_decision_candidate) summary.parent_candidate_decisions += 1
    countInto(summary.by_decision_type, row.decision_type)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_item_review_surface, row.item_review_surface)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows
    .filter(row => row.target_gap_inventory_parent_decision_candidate)
    .slice(0, 80)
    .map(row => (
      `| ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.source_standard_code || row.standard_code)} | ${markdownCell(row.target_gap_inventory_evidence?.exact_target_code)} | ${markdownCell(row.reviewer_decision)} | ${truncate(row.decision_note)} |`
    )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Target Gap Inventory Parent Decisions Candidate

Generated at: ${payload.generated_at}

This candidate copies the parent downstream decisions template and only fills
target-standard gap rows whose downstream action decision candidate already
confirmed absence in the public inventory. It does not edit the source template,
write \`public/data\`, change official standard text, or enable matcher/publication
use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| downstream decisions | ${payload.summary.downstream_decisions} |
| parent candidate decisions | ${payload.summary.parent_candidate_decisions} |
| completed downstream decisions | ${payload.summary.completed_downstream_decisions} |
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

## Candidate Rows

| rank | subject | target grade | source standard | expected target code | decision | note |
| ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.downstream_decisions)}

## Guardrails

- Parent candidate decisions are not bridge approval.
- The editable source downstream decisions template is not modified.
- Public data, official standard text, matcher, and publication gates remain disabled.
- Item-level source review remains a later gate.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildCandidate(args) {
  const errors = []
  for (const [label, path] of [
    ['parent decisions', args.decisions],
    ['action candidate', args.actionCandidate],
    ['inventory audit', args.inventoryAudit]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = errors.length ? { downstream_decisions: [] } : readJson(args.decisions)
  const actionCandidate = errors.length ? { downstream_action_decisions: [] } : readJson(args.actionCandidate)
  const inventory = errors.length ? { inventory_items: [] } : readJson(args.inventoryAudit)
  if (!errors.length) {
    validateParentDecisions(decisions, args, errors)
    validateActionCandidate(actionCandidate, args, errors)
    validateInventoryAudit(inventory, args, errors)
  }
  const rows = buildRows(decisions, actionCandidate, inventory, args, errors)
  const summary = summarize(rows)
  const expectedCandidates = (actionCandidate.downstream_action_decisions || []).filter(isActionCandidate).length
  if (args.requireItems && !summary.parent_candidate_decisions) {
    errors.push('requireItems is set but no parent target gap inventory candidate decisions were generated')
  }
  if (summary.parent_candidate_decisions !== expectedCandidates) {
    errors.push(`parent candidate decisions ${summary.parent_candidate_decisions} must match action candidates ${expectedCandidates}`)
  }
  return {
    ...decisions,
    candidate_purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate',
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_decisions: rows,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    parent_candidate_policy: parentCandidatePolicy(),
    publication_candidate: false,
    publication_ready: false,
    review_only: true,
    source_decisions_template: args.decisions,
    source_downstream_action_decisions_candidate: args.actionCandidate,
    source_target_standard_gap_inventory_audit: args.inventoryAudit,
    summary,
    target_gap_inventory_parent_decisions_complete: summary.parent_candidate_decisions > 0 && summary.parent_candidate_decisions === expectedCandidates && errors.length === 0,
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
  const payload = buildCandidate(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
