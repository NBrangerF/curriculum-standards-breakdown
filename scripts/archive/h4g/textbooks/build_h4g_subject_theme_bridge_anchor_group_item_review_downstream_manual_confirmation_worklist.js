#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_ACTION_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_CLOSURE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ROW_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_ITEM_LEVEL_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_MANUAL_SCOPE_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_TARGET_GAP_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist_anchor_domain_rejected_english_pe.md'

const ACTION_BATCH_SPECS = {
  item_level_source_review: {
    idKey: 'item_level_source_review_item_id',
    inventoryKey: 'itemLevelInventory',
    inventoryRowsKey: 'inventory_items',
    lane: 'bounded_item_level_source_review_lane',
    laneOrder: 40,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_inventory'
  },
  manual_scope_indexing: {
    idKey: 'manual_scope_indexing_item_id',
    inventoryKey: 'manualScopeInventory',
    inventoryRowsKey: 'inventory_items',
    lane: 'same_grade_unit_scope_confirmation_lane',
    laneOrder: 20,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory'
  },
  source_anchor_evidence: {
    idKey: 'source_anchor_evidence_item_id',
    inventoryKey: 'sourceAnchorInventory',
    inventoryRowsKey: 'inventory_items',
    lane: 'source_anchor_exactness_review_lane',
    laneOrder: 50,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory'
  },
  source_row_confirmation: {
    idKey: 'source_row_confirmation_item_id',
    inventoryKey: 'sourceRowInventory',
    inventoryRowsKey: 'inventory_items',
    lane: 'single_source_row_confirmation_lane',
    laneOrder: 30,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_inventory'
  },
  target_standard_gap_resolution: {
    idKey: 'batch_item_id',
    inventoryKey: 'targetGapInventory',
    inventoryRowsKey: 'inventory_items',
    lane: 'priority_target_gap_confirmation_lane',
    laneOrder: 10,
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
    targetGapInventory: DEFAULT_TARGET_GAP_INVENTORY
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--action-decisions') args.actionDecisions = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist.js \\
  --strict --require-items

Builds a read-only manual confirmation worklist by joining downstream action
closure readiness with every downstream inventory. It does not edit decisions,
approve bridges, write public/data, or enable matcher/publication use.`)
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

function truncate(value, max = 90) {
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

function validateInputs(actionDecisions, closure, inventories, args, errors) {
  if (actionDecisions.valid !== true) errors.push('action decisions valid must be true')
  if (actionDecisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('action decisions purpose mismatch')
  }
  if (!Array.isArray(actionDecisions.downstream_action_decisions)) {
    errors.push('action decisions downstream_action_decisions must be an array')
  }
  validatePolicy('action decisions', actionDecisions, errors)

  if (closure.valid !== true) errors.push('closure readiness valid must be true')
  if (closure.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness') {
    errors.push('closure readiness purpose mismatch')
  }
  if (!Array.isArray(closure.closure_readiness_items)) errors.push('closure readiness items must be an array')
  if (closure.close_ready !== false) errors.push('closure readiness close_ready must be false')
  validatePolicy('closure readiness', closure, errors)

  for (const [batch, spec] of Object.entries(ACTION_BATCH_SPECS)) {
    const inventory = inventories[spec.inventoryKey] || {}
    if (inventory.valid !== true) errors.push(`${batch} inventory valid must be true`)
    if (inventory.purpose !== spec.purpose) errors.push(`${batch} inventory purpose mismatch`)
    if (!Array.isArray(inventory[spec.inventoryRowsKey])) errors.push(`${batch} inventory rows must be an array`)
    validatePolicy(`${batch} inventory`, inventory, errors)
  }
  if (args.requireItems && !(closure.closure_readiness_items || []).length) {
    errors.push('requireItems is set but closure readiness has no items')
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
  return ACTION_BATCH_SPECS[closure.source_downstream_action_batch]?.lane || 'manual_confirmation_lane'
}

function laneOrderFor(lane, batch) {
  const specific = {
    priority_target_gap_confirmation_lane: 10,
    same_grade_unit_scope_confirmation_lane: 20,
    single_source_row_confirmation_lane: 30,
    bounded_item_level_source_review_lane: 40,
    source_anchor_generic_or_deny_term_review_lane: 50,
    source_anchor_unit_or_source_scope_review_lane: 60,
    source_anchor_fanout_review_lane: 70,
    source_anchor_exactness_review_lane: 80
  }
  return specific[lane] || ACTION_BATCH_SPECS[batch]?.laneOrder || 99
}

function inventoryIdFor(closure, inventories) {
  const spec = ACTION_BATCH_SPECS[closure.source_downstream_action_batch]
  if (!spec) return { inventory: null, lookup_key: '' }
  const inventory = inventories.maps[closure.source_downstream_action_batch]?.get(closure.source_downstream_action_batch === 'target_standard_gap_resolution'
    ? closure.source_downstream_action_item_id
    : closure.decision_id)
  const lookupKey = closure.source_downstream_action_batch === 'target_standard_gap_resolution'
    ? closure.source_downstream_action_item_id
    : closure.decision_id
  return { inventory, lookup_key: lookupKey }
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

function profileHighlights(batch, inventory) {
  if (!inventory) return []
  if (batch === 'source_anchor_evidence') {
    const profile = inventory.risk_profile || {}
    return [
      profile.has_low_bridge_score ? 'low_bridge_score' : '',
      profile.has_multiple_source_rows ? 'multiple_source_rows' : '',
      profile.has_multiple_unit_evidence_ids ? 'multiple_unit_evidence_ids' : '',
      profile.has_generic_title_deny_term ? 'generic_title_deny_term' : '',
      profile.has_unit_fanout_risk ? 'unit_fanout_risk' : '',
      profile.has_standard_fanout_risk ? 'standard_fanout_risk' : ''
    ].filter(Boolean)
  }
  if (batch === 'source_row_confirmation') {
    const profile = inventory.confirmation_profile || {}
    return [
      profile.page_ready ? 'page_ready' : '',
      profile.has_low_bridge_score ? 'low_bridge_score' : '',
      profile.has_shared_topic_risk ? 'shared_topic_risk' : ''
    ].filter(Boolean)
  }
  if (batch === 'item_level_source_review') {
    const profile = inventory.item_level_profile || {}
    return [
      inventory.page_ready ? 'page_ready' : '',
      profile.has_multi_source_scope_risk ? 'multi_source_scope_risk' : '',
      profile.has_multi_unit_scope_risk ? 'multi_unit_scope_risk' : '',
      profile.has_shared_topic_risk ? 'shared_topic_risk' : ''
    ].filter(Boolean)
  }
  if (batch === 'manual_scope_indexing') {
    const profile = inventory.manual_scope_indexing_profile || {}
    return [
      profile.has_same_grade_unit_index_candidates ? 'same_grade_unit_candidates' : '',
      profile.has_page_ready_same_grade_unit_candidates ? 'page_ready_same_grade_candidates' : '',
      profile.has_cross_grade_existing_evidence ? 'cross_grade_existing_evidence' : ''
    ].filter(Boolean)
  }
  if (batch === 'target_standard_gap_resolution') {
    return [
      inventory.inventory_status || '',
      inventory.manual_confirmation_required ? 'manual_confirmation_required' : ''
    ].filter(Boolean)
  }
  return []
}

function buildRows(actionDecisions, closure, inventories, errors) {
  const decisionsById = mapBy(actionDecisions.downstream_action_decisions || [], 'decision_id', errors, 'action decisions')
  const closureRows = closure.closure_readiness_items || []
  const rows = []
  for (const item of closureRows) {
    const decision = decisionsById.get(item.decision_id)
    if (!decision) errors.push(`${item.decision_id} missing action decision`)
    const { inventory, lookup_key: inventoryLookupKey } = inventoryIdFor(item, inventories)
    if (!inventory) errors.push(`${item.decision_id} missing inventory for ${item.source_downstream_action_batch}`)
    const lane = laneFor(item, inventory)
    const batch = item.source_downstream_action_batch || ''
    rows.push({
      action_decision_id: item.decision_id || '',
      action_decision_status: decision?.decision_status || '',
      action_reviewer_decision: decision?.reviewer_decision || '',
      auto_close_allowed: item.auto_close_allowed === true,
      auto_close_blockers: item.auto_close_blockers || [],
      close_ready: item.close_ready === true,
      closure_readiness: item.closure_readiness || '',
      closure_route: item.closure_route || '',
      grade_band: item.grade_band || '',
      inventory_bucket: inventoryBucket(batch, inventory),
      inventory_disposition: inventory?.recommended_disposition || inventory?.recommended_reviewer_decision || '',
      inventory_item_id: inventory?.inventory_item_id || inventory?.batch_item_id || '',
      inventory_lookup_key: inventoryLookupKey,
      lane_order: laneOrderFor(lane, batch),
      manual_confirmation_lane: lane,
      manual_confirmation_required: item.manual_confirmation_required === true,
      next_manual_gate: item.next_manual_gate || '',
      priority_rank: item.priority_rank,
      priority_tier: item.priority_tier || '',
      profile_highlights: profileHighlights(batch, inventory),
      progression_group_id: item.progression_group_id || '',
      recommended_reviewer_decision: item.recommended_reviewer_decision || '',
      required_confirmations_to_close: item.required_confirmations_to_close || [],
      required_false_confirmations: item.required_false_confirmations || [],
      risk_signals: item.risk_signals || [],
      source_batch: item.source_batch || '',
      source_batch_item_id: item.source_batch_item_id || '',
      source_downstream_action_batch: batch,
      source_downstream_action_item_id: item.source_downstream_action_item_id || '',
      source_key: item.source_key || '',
      standard_code: item.standard_code || '',
      subject_slug: item.subject_slug || '',
      target_grade_band: item.target_grade_band || item.grade_band || '',
      target_standard_code: item.target_standard_code || '',
      unit_evidence_id: item.unit_evidence_id || inventory?.unit_evidence_id || '',
      unit_title: item.unit_title || inventory?.unit_title || ''
    })
  }
  return rows
    .sort((a, b) => {
      const lane = Number(a.lane_order || 0) - Number(b.lane_order || 0)
      if (lane) return lane
      const tier = String(a.priority_tier || '').localeCompare(String(b.priority_tier || ''))
      if (tier) return tier
      const rank = Number(a.priority_rank || 999999) - Number(b.priority_rank || 999999)
      if (rank) return rank
      return String(a.action_decision_id).localeCompare(String(b.action_decision_id))
    })
    .map((row, index) => ({ ...row, worklist_rank: index + 1 }))
}

function summarize(rows) {
  const summary = {
    auto_close_allowed_items: 0,
    by_closure_readiness: {},
    by_grade_band: {},
    by_inventory_bucket: {},
    by_manual_confirmation_lane: {},
    by_recommendation: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    close_ready_items: 0,
    manual_confirmation_items: rows.length,
    manual_confirmation_required_items: 0,
    unique_action_decisions: sorted(rows.map(row => row.action_decision_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length
  }
  for (const row of rows) {
    if (row.auto_close_allowed) summary.auto_close_allowed_items += 1
    if (row.close_ready) summary.close_ready_items += 1
    if (row.manual_confirmation_required) summary.manual_confirmation_required_items += 1
    countInto(summary.by_closure_readiness, row.closure_readiness)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_inventory_bucket, row.inventory_bucket)
    countInto(summary.by_manual_confirmation_lane, row.manual_confirmation_lane)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_source_downstream_action_batch, row.source_downstream_action_batch)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 40).map(row => (
    `| ${row.worklist_rank} | ${markdownCell(row.manual_confirmation_lane)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.recommended_reviewer_decision)} | ${markdownCell(row.inventory_bucket)} | ${markdownCell(row.standard_code || row.target_standard_code)} | ${truncate(row.unit_title || '-')} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Manual Confirmation Worklist

Generated at: ${payload.generated_at}

This read-only worklist joins downstream action closure readiness with all
available downstream inventories. It gives reviewers a single ordered queue for
manual confirmation. It does not edit action decisions, approve bridges, write
\`public/data\`, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| worklist items | ${payload.summary.manual_confirmation_items} |
| manual confirmation required items | ${payload.summary.manual_confirmation_required_items} |
| auto-close allowed items | ${payload.summary.auto_close_allowed_items} |
| close-ready items | ${payload.summary.close_ready_items} |
| unique action decisions | ${payload.summary.unique_action_decisions} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Manual Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_manual_confirmation_lane)}

## Action Batches

| source action batch | rows |
| --- | ---: |
${countRows(payload.summary.by_source_downstream_action_batch)}

## Preview

| rank | lane | subject | grade | recommendation | inventory bucket | standard | unit |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.manual_confirmation_work_items)}

## Guardrails

- Worklist rows are not reviewer decisions.
- Every row still requires editing the downstream action decisions surface.
- Matcher and publication gates remain separate later steps.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  const fileArgs = {
    actionDecisions: args.actionDecisions,
    closure: args.closure,
    itemLevelInventory: args.itemLevelInventory,
    manualScopeInventory: args.manualScopeInventory,
    sourceAnchorInventory: args.sourceAnchorInventory,
    sourceRowInventory: args.sourceRowInventory,
    targetGapInventory: args.targetGapInventory
  }
  for (const [label, path] of Object.entries(fileArgs)) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const actionDecisions = existsSync(args.actionDecisions) ? readJson(args.actionDecisions) : { downstream_action_decisions: [] }
  const closure = existsSync(args.closure) ? readJson(args.closure) : { closure_readiness_items: [] }
  const inventories = {
    itemLevelInventory: existsSync(args.itemLevelInventory) ? readJson(args.itemLevelInventory) : { inventory_items: [] },
    manualScopeInventory: existsSync(args.manualScopeInventory) ? readJson(args.manualScopeInventory) : { inventory_items: [] },
    sourceAnchorInventory: existsSync(args.sourceAnchorInventory) ? readJson(args.sourceAnchorInventory) : { inventory_items: [] },
    sourceRowInventory: existsSync(args.sourceRowInventory) ? readJson(args.sourceRowInventory) : { inventory_items: [] },
    targetGapInventory: existsSync(args.targetGapInventory) ? readJson(args.targetGapInventory) : { inventory_items: [] }
  }
  if (!errors.length) validateInputs(actionDecisions, closure, inventories, args, errors)
  inventories.maps = {
    item_level_source_review: mapBy(inventories.itemLevelInventory.inventory_items || [], 'downstream_action_decision_id', errors, 'item-level inventory'),
    manual_scope_indexing: mapBy(inventories.manualScopeInventory.inventory_items || [], 'downstream_action_decision_id', errors, 'manual scope inventory'),
    source_anchor_evidence: mapBy(inventories.sourceAnchorInventory.inventory_items || [], 'downstream_action_decision_id', errors, 'source-anchor inventory'),
    source_row_confirmation: mapBy(inventories.sourceRowInventory.inventory_items || [], 'downstream_action_decision_id', errors, 'source-row inventory'),
    target_standard_gap_resolution: mapBy(inventories.targetGapInventory.inventory_items || [], 'batch_item_id', errors, 'target-gap inventory')
  }
  const rows = buildRows(actionDecisions, closure, inventories, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no worklist rows were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    manual_confirmation_work_items: rows,
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist',
    source_downstream_action_closure_readiness: args.closure,
    source_downstream_action_decisions: args.actionDecisions,
    source_inventories: {
      item_level_source_review: args.itemLevelInventory,
      manual_scope_indexing: args.manualScopeInventory,
      source_anchor_evidence: args.sourceAnchorInventory,
      source_row_confirmation: args.sourceRowInventory,
      target_standard_gap_resolution: args.targetGapInventory
    },
    summary: summarize(rows),
    valid: errors.length === 0,
    worklist_only: true,
    writes_public_data: false
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const payload = buildPayload(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
