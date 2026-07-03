#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_CLOSURE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ROW_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_ITEM_LEVEL_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_MANUAL_SCOPE_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_TARGET_GAP_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist_anchor_domain_rejected_english_pe_audit.md'

const ACTION_BATCH_SPECS = {
  item_level_source_review: {
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_inventory'
  },
  manual_scope_indexing: {
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory'
  },
  source_anchor_evidence: {
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory'
  },
  source_row_confirmation: {
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_inventory'
  },
  target_standard_gap_resolution: {
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_audit'
  }
}

function parseArgs(argv) {
  const args = {
    actionDecisions: DEFAULT_ACTION_DECISIONS,
    closure: DEFAULT_CLOSURE,
    itemLevelInventory: DEFAULT_ITEM_LEVEL_INVENTORY,
    manualScopeInventory: DEFAULT_MANUAL_SCOPE_INVENTORY,
    out: DEFAULT_OUT,
    requireItems: false,
    sourceAnchorInventory: DEFAULT_SOURCE_ANCHOR_INVENTORY,
    sourceRowInventory: DEFAULT_SOURCE_ROW_INVENTORY,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    targetGapInventory: DEFAULT_TARGET_GAP_INVENTORY,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--action-decisions') args.actionDecisions = argv[++i]
    else if (item === '--closure') args.closure = argv[++i]
    else if (item === '--source-anchor-inventory') args.sourceAnchorInventory = argv[++i]
    else if (item === '--source-row-inventory') args.sourceRowInventory = argv[++i]
    else if (item === '--item-level-inventory') args.itemLevelInventory = argv[++i]
    else if (item === '--manual-scope-inventory') args.manualScopeInventory = argv[++i]
    else if (item === '--target-gap-inventory') args.targetGapInventory = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the downstream manual confirmation worklist against action decisions,
closure readiness, and every downstream inventory.`)
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

function validateInputs(worklist, actionDecisions, closure, inventories, args, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if ((worklist.errors || []).length) errors.push('worklist errors must be empty')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist') {
    errors.push('worklist purpose mismatch')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  if (worklist.source_downstream_action_decisions !== args.actionDecisions) {
    errors.push('worklist source_downstream_action_decisions must match audit arg')
  }
  if (worklist.source_downstream_action_closure_readiness !== args.closure) {
    errors.push('worklist source_downstream_action_closure_readiness must match audit arg')
  }
  const expectedInventories = {
    item_level_source_review: args.itemLevelInventory,
    manual_scope_indexing: args.manualScopeInventory,
    source_anchor_evidence: args.sourceAnchorInventory,
    source_row_confirmation: args.sourceRowInventory,
    target_standard_gap_resolution: args.targetGapInventory
  }
  if (!sameJson(worklist.source_inventories || {}, expectedInventories)) {
    errors.push('worklist source_inventories must match audit args')
  }
  validatePolicy('worklist', worklist, errors)
  if (!Array.isArray(worklist.manual_confirmation_work_items)) errors.push('worklist manual_confirmation_work_items must be an array')

  if (actionDecisions.valid !== true) errors.push('action decisions valid must be true')
  if (!Array.isArray(actionDecisions.downstream_action_decisions)) {
    errors.push('action decisions downstream_action_decisions must be an array')
  }
  validatePolicy('action decisions', actionDecisions, errors)

  if (closure.valid !== true) errors.push('closure valid must be true')
  if (!Array.isArray(closure.closure_readiness_items)) errors.push('closure readiness items must be an array')
  if (closure.close_ready !== false) errors.push('closure close_ready must be false')
  validatePolicy('closure', closure, errors)

  for (const [batch, spec] of Object.entries(ACTION_BATCH_SPECS)) {
    const inventory = inventories[batch] || {}
    if (inventory.valid !== true) errors.push(`${batch} inventory valid must be true`)
    if (inventory.purpose !== spec.purpose) errors.push(`${batch} inventory purpose mismatch`)
    if (!Array.isArray(inventory.inventory_items)) errors.push(`${batch} inventory_items must be an array`)
    validatePolicy(`${batch} inventory`, inventory, errors)
  }
}

function sourceAnchorLane(inventory) {
  const bucket = inventory?.primary_review_bucket || ''
  if (bucket === 'generic_or_deny_term_anchor_review') return 'source_anchor_generic_or_deny_term_review_lane'
  if (bucket === 'multi_source_or_multi_unit_scope_review') return 'source_anchor_unit_or_source_scope_review_lane'
  if (bucket === 'unit_or_standard_fanout_review') return 'source_anchor_fanout_review_lane'
  return 'source_anchor_exactness_review_lane'
}

function laneFor(closure, inventory) {
  if (closure.source_downstream_action_batch === 'source_anchor_evidence') return sourceAnchorLane(inventory)
  const lanes = {
    item_level_source_review: 'bounded_item_level_source_review_lane',
    manual_scope_indexing: 'same_grade_unit_scope_confirmation_lane',
    source_row_confirmation: 'single_source_row_confirmation_lane',
    target_standard_gap_resolution: 'priority_target_gap_confirmation_lane'
  }
  return lanes[closure.source_downstream_action_batch] || 'manual_confirmation_lane'
}

function laneOrderFor(lane) {
  return {
    priority_target_gap_confirmation_lane: 10,
    same_grade_unit_scope_confirmation_lane: 20,
    single_source_row_confirmation_lane: 30,
    bounded_item_level_source_review_lane: 40,
    source_anchor_generic_or_deny_term_review_lane: 50,
    source_anchor_unit_or_source_scope_review_lane: 60,
    source_anchor_fanout_review_lane: 70,
    source_anchor_exactness_review_lane: 80
  }[lane] || 99
}

function inventoryBucket(batch, inventory) {
  if (!inventory) return ''
  if (batch === 'source_anchor_evidence') return inventory.primary_review_bucket || ''
  if (batch === 'source_row_confirmation') return inventory.confirmation_bucket || ''
  if (batch === 'item_level_source_review') return inventory.item_level_source_review_bucket || ''
  if (batch === 'manual_scope_indexing') return inventory.manual_scope_indexing_bucket || ''
  if (batch === 'target_standard_gap_resolution') return inventory.inventory_status || ''
  return ''
}

function inventoryMap(inventories, errors) {
  return {
    item_level_source_review: mapBy(inventories.item_level_source_review.inventory_items || [], 'downstream_action_decision_id', errors, 'item-level inventory'),
    manual_scope_indexing: mapBy(inventories.manual_scope_indexing.inventory_items || [], 'downstream_action_decision_id', errors, 'manual scope inventory'),
    source_anchor_evidence: mapBy(inventories.source_anchor_evidence.inventory_items || [], 'downstream_action_decision_id', errors, 'source-anchor inventory'),
    source_row_confirmation: mapBy(inventories.source_row_confirmation.inventory_items || [], 'downstream_action_decision_id', errors, 'source-row inventory'),
    target_standard_gap_resolution: mapBy(inventories.target_standard_gap_resolution.inventory_items || [], 'batch_item_id', errors, 'target-gap inventory')
  }
}

function inventoryForClosure(item, maps) {
  if (item.source_downstream_action_batch === 'target_standard_gap_resolution') {
    return maps.target_standard_gap_resolution.get(item.source_downstream_action_item_id)
  }
  return maps[item.source_downstream_action_batch]?.get(item.decision_id)
}

function expectedInventoryItemId(inventory) {
  return inventory?.inventory_item_id || inventory?.batch_item_id || ''
}

function validateRow(row, closureItem, action, inventory, errors, stats) {
  const prefix = row.action_decision_id || closureItem.decision_id || '(missing manual confirmation row)'
  const batch = closureItem.source_downstream_action_batch || ''
  const lane = laneFor(closureItem, inventory)
  if (row.action_decision_id !== closureItem.decision_id) errors.push(`${prefix} action_decision_id mismatch`)
  if (row.action_decision_status !== action?.decision_status) errors.push(`${prefix} action_decision_status mismatch`)
  if (row.action_reviewer_decision !== action?.reviewer_decision) errors.push(`${prefix} action_reviewer_decision mismatch`)
  if (row.action_reviewer_decision !== 'pending') errors.push(`${prefix} action_reviewer_decision must remain pending`)
  if (row.action_decision_status !== 'pending_review') errors.push(`${prefix} action_decision_status must remain pending_review`)
  for (const key of [
    'auto_close_allowed',
    'close_ready',
    'closure_readiness',
    'closure_route',
    'grade_band',
    'manual_confirmation_required',
    'next_manual_gate',
    'priority_tier',
    'progression_group_id',
    'recommended_reviewer_decision',
    'source_batch',
    'source_batch_item_id',
    'source_downstream_action_batch',
    'source_downstream_action_item_id',
    'source_key',
    'standard_code',
    'subject_slug',
    'target_grade_band',
    'target_standard_code',
    'unit_evidence_id',
    'unit_title'
  ]) {
    const expected = closureItem[key]
    const actual = row[key]
    if (actual !== expected) errors.push(`${prefix} ${key} mismatch`)
  }
  if (row.inventory_item_id !== expectedInventoryItemId(inventory)) errors.push(`${prefix} inventory_item_id mismatch`)
  if (row.inventory_bucket !== inventoryBucket(batch, inventory)) errors.push(`${prefix} inventory_bucket mismatch`)
  if (row.manual_confirmation_lane !== lane) errors.push(`${prefix} manual_confirmation_lane mismatch`)
  if (row.lane_order !== laneOrderFor(lane)) errors.push(`${prefix} lane_order mismatch`)
  if (!sameJson(row.auto_close_blockers || [], closureItem.auto_close_blockers || [])) errors.push(`${prefix} auto_close_blockers mismatch`)
  if (!sameJson(row.required_confirmations_to_close || [], closureItem.required_confirmations_to_close || [])) {
    errors.push(`${prefix} required_confirmations_to_close mismatch`)
  }
  if (!sameJson(row.required_false_confirmations || [], closureItem.required_false_confirmations || [])) {
    errors.push(`${prefix} required_false_confirmations mismatch`)
  }
  if (!sameJson(row.risk_signals || [], closureItem.risk_signals || [])) errors.push(`${prefix} risk_signals mismatch`)
  if (row.auto_close_allowed !== false) errors.push(`${prefix} auto_close_allowed must be false`)
  if (row.close_ready !== false) errors.push(`${prefix} close_ready must be false`)
  if (row.manual_confirmation_required !== true) errors.push(`${prefix} manual_confirmation_required must be true`)

  stats.audited_work_items += 1
  if (row.auto_close_allowed) stats.auto_close_allowed_items += 1
  if (row.close_ready) stats.close_ready_items += 1
  if (row.manual_confirmation_required) stats.manual_confirmation_required_items += 1
  countInto(stats.by_closure_readiness, row.closure_readiness)
  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_inventory_bucket, row.inventory_bucket)
  countInto(stats.by_manual_confirmation_lane, row.manual_confirmation_lane)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision)
  countInto(stats.by_source_downstream_action_batch, row.source_downstream_action_batch)
  countInto(stats.by_subject, row.subject_slug)
}

function summarize(rows) {
  return {
    audited_work_items: 0,
    auto_close_allowed_items: 0,
    by_closure_readiness: {},
    by_grade_band: {},
    by_inventory_bucket: {},
    by_manual_confirmation_lane: {},
    by_recommendation: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    close_ready_items: 0,
    expected_work_items: 0,
    extra_work_items: 0,
    manual_confirmation_required_items: 0,
    missing_work_items: 0,
    worklist_items: rows.length
  }
}

function validateSummary(worklist, stats, errors) {
  const summary = worklist.summary || {}
  const aliases = {
    worklist_items: 'manual_confirmation_items'
  }
  for (const key of [
    'auto_close_allowed_items',
    'close_ready_items',
    'manual_confirmation_required_items'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`summary.${key} mismatch: expected ${stats[key]}, got ${summary[key]}`)
  }
  if (summary[aliases.worklist_items] !== stats.worklist_items) {
    errors.push(`summary.manual_confirmation_items mismatch: expected ${stats.worklist_items}, got ${summary[aliases.worklist_items]}`)
  }
  for (const key of [
    'by_closure_readiness',
    'by_grade_band',
    'by_inventory_bucket',
    'by_manual_confirmation_lane',
    'by_recommendation',
    'by_source_downstream_action_batch',
    'by_subject'
  ]) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`summary.${key} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Downstream Manual Confirmation Worklist Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected work items | ${payload.summary.expected_work_items} |
| audited work items | ${payload.summary.audited_work_items} |
| missing work items | ${payload.summary.missing_work_items} |
| extra work items | ${payload.summary.extra_work_items} |
| manual confirmation required items | ${payload.summary.manual_confirmation_required_items} |
| auto-close allowed items | ${payload.summary.auto_close_allowed_items} |
| close-ready items | ${payload.summary.close_ready_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Manual Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_manual_confirmation_lane)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    worklist: args.worklist,
    actionDecisions: args.actionDecisions,
    closure: args.closure,
    itemLevelInventory: args.itemLevelInventory,
    manualScopeInventory: args.manualScopeInventory,
    sourceAnchorInventory: args.sourceAnchorInventory,
    sourceRowInventory: args.sourceRowInventory,
    targetGapInventory: args.targetGapInventory
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { manual_confirmation_work_items: [] }
  const actionDecisions = existsSync(args.actionDecisions) ? readJson(args.actionDecisions) : { downstream_action_decisions: [] }
  const closure = existsSync(args.closure) ? readJson(args.closure) : { closure_readiness_items: [] }
  const inventories = {
    item_level_source_review: existsSync(args.itemLevelInventory) ? readJson(args.itemLevelInventory) : { inventory_items: [] },
    manual_scope_indexing: existsSync(args.manualScopeInventory) ? readJson(args.manualScopeInventory) : { inventory_items: [] },
    source_anchor_evidence: existsSync(args.sourceAnchorInventory) ? readJson(args.sourceAnchorInventory) : { inventory_items: [] },
    source_row_confirmation: existsSync(args.sourceRowInventory) ? readJson(args.sourceRowInventory) : { inventory_items: [] },
    target_standard_gap_resolution: existsSync(args.targetGapInventory) ? readJson(args.targetGapInventory) : { inventory_items: [] }
  }
  if (!errors.length) validateInputs(worklist, actionDecisions, closure, inventories, args, errors)

  const rows = worklist.manual_confirmation_work_items || []
  const rowByDecision = mapBy(rows, 'action_decision_id', errors, 'worklist')
  const actionById = mapBy(actionDecisions.downstream_action_decisions || [], 'decision_id', errors, 'action decisions')
  const closureById = mapBy(closure.closure_readiness_items || [], 'decision_id', errors, 'closure')
  const maps = inventoryMap(inventories, errors)
  const stats = summarize(rows)
  stats.expected_work_items = (closure.closure_readiness_items || []).length

  if (rows.length !== stats.expected_work_items) {
    errors.push(`worklist rows ${rows.length} must match closure rows ${stats.expected_work_items}`)
  }

  for (const [decisionId, closureItem] of closureById.entries()) {
    const row = rowByDecision.get(decisionId)
    const action = actionById.get(decisionId)
    const inventory = inventoryForClosure(closureItem, maps)
    if (!row) {
      stats.missing_work_items += 1
      errors.push(`${decisionId} missing worklist row`)
      continue
    }
    if (!action) {
      errors.push(`${decisionId} missing action decision`)
      continue
    }
    if (!inventory) {
      errors.push(`${decisionId} missing inventory row`)
      continue
    }
    validateRow(row, closureItem, action, inventory, errors, stats)
  }

  for (const decisionId of rowByDecision.keys()) {
    if (!closureById.has(decisionId)) {
      stats.extra_work_items += 1
      errors.push(`${decisionId} unexpected worklist row`)
    }
  }
  if (args.requireItems && !stats.audited_work_items) errors.push('requireItems is set but no worklist rows were audited')
  if (stats.audited_work_items !== stats.expected_work_items) {
    errors.push(`audited work items ${stats.audited_work_items} must match expected ${stats.expected_work_items}`)
  }
  validateSummary(worklist, stats, errors)

  return {
    action_decisions: args.actionDecisions,
    changes_official_standard_text: false,
    closure_readiness: args.closure,
    direct_matcher_use: false,
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
