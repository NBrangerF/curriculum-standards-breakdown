#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_REMAINING_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ROW_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_ITEM_LEVEL_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet_anchor_domain_rejected_english_pe_audit.md'

const BOUNDED_SOURCE_BATCHES = new Set(['source_row_confirmation', 'item_level_source_review'])

function parseArgs(argv) {
  const args = {
    actionDecisions: DEFAULT_ACTION_DECISIONS,
    actionRecommendations: DEFAULT_ACTION_RECOMMENDATIONS,
    itemLevelInventory: DEFAULT_ITEM_LEVEL_INVENTORY,
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    remainingWorklist: DEFAULT_REMAINING_WORKLIST,
    requireItems: false,
    sourceRowInventory: DEFAULT_SOURCE_ROW_INVENTORY,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
    else if (item === '--remaining-worklist') args.remainingWorklist = argv[++i]
    else if (item === '--source-row-inventory') args.sourceRowInventory = argv[++i]
    else if (item === '--item-level-inventory') args.itemLevelInventory = argv[++i]
    else if (item === '--action-decisions') args.actionDecisions = argv[++i]
    else if (item === '--action-recommendations') args.actionRecommendations = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet.js \\
  --strict --require-items

Audits the post-candidate bounded-source evidence packet against the remaining
worklist, source-row/item-level inventories, action decisions, and
recommendation-only routes.`)
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

function validatePacketPolicy(label, policy, errors) {
  for (const key of [
    'bounded_source_evidence_packet_is_not_reviewer_decision',
    'downstream_action_decision_must_be_edited_separately',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_manual_item_level_source_review',
    'requires_manual_source_row_confirmation'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function validateTopLevel(packet, remainingWorklist, sourceRowInventory, itemLevelInventory, actionDecisions, actionRecommendations, args, errors) {
  if (packet.valid !== true) errors.push('packet valid must be true')
  if ((packet.errors || []).length) errors.push('packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet') {
    errors.push('packet purpose mismatch')
  }
  if (packet.bounded_source_evidence_packet_only !== true) errors.push('packet bounded_source_evidence_packet_only must be true')
  if (packet.review_only !== true) errors.push('packet review_only must be true')
  if (packet.source_post_candidate_remaining_worklist !== args.remainingWorklist) errors.push('packet source_post_candidate_remaining_worklist must match audit arg')
  if (packet.source_source_row_inventory !== args.sourceRowInventory) errors.push('packet source_source_row_inventory must match audit arg')
  if (packet.source_item_level_inventory !== args.itemLevelInventory) errors.push('packet source_item_level_inventory must match audit arg')
  if (packet.source_action_decisions !== args.actionDecisions) errors.push('packet source_action_decisions must match audit arg')
  if (packet.source_action_recommendations !== args.actionRecommendations) errors.push('packet source_action_recommendations must match audit arg')
  if (!Array.isArray(packet.bounded_source_evidence_items)) errors.push('packet bounded_source_evidence_items must be an array')
  validatePolicy('packet', packet, errors)
  validatePacketPolicy('packet policy', packet.packet_policy || {}, errors)

  if (remainingWorklist.valid !== true) errors.push('remaining worklist valid must be true')
  if (remainingWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist') {
    errors.push('remaining worklist purpose mismatch')
  }
  if (!Array.isArray(remainingWorklist.post_candidate_remaining_work_items)) errors.push('remaining worklist rows must be an array')
  validatePolicy('remaining worklist', remainingWorklist, errors)

  if (sourceRowInventory.valid !== true) errors.push('source-row inventory valid must be true')
  if (sourceRowInventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_inventory') {
    errors.push('source-row inventory purpose mismatch')
  }
  if (sourceRowInventory.evidence_inventory_only !== true) errors.push('source-row inventory evidence_inventory_only must be true')
  if (!Array.isArray(sourceRowInventory.inventory_items)) errors.push('source-row inventory items must be an array')
  validatePolicy('source-row inventory', sourceRowInventory, errors)

  if (itemLevelInventory.valid !== true) errors.push('item-level inventory valid must be true')
  if (itemLevelInventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_inventory') {
    errors.push('item-level inventory purpose mismatch')
  }
  if (itemLevelInventory.evidence_inventory_only !== true) errors.push('item-level inventory evidence_inventory_only must be true')
  if (!Array.isArray(itemLevelInventory.inventory_items)) errors.push('item-level inventory items must be an array')
  validatePolicy('item-level inventory', itemLevelInventory, errors)

  if (actionDecisions.valid !== true) errors.push('action decisions valid must be true')
  if (actionDecisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('action decisions purpose mismatch')
  }
  if (!Array.isArray(actionDecisions.downstream_action_decisions)) errors.push('action decisions rows must be an array')
  validatePolicy('action decisions', actionDecisions, errors)

  if (actionRecommendations.valid !== true) errors.push('action recommendations valid must be true')
  if (actionRecommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_recommendations') {
    errors.push('action recommendations purpose mismatch')
  }
  if (actionRecommendations.recommendation_only !== true) errors.push('action recommendations recommendation_only must be true')
  if (!Array.isArray(actionRecommendations.downstream_action_recommendations)) errors.push('action recommendations rows must be an array')
  validatePolicy('action recommendations', actionRecommendations, errors)
}

function expectedRows(remainingWorklist) {
  return (remainingWorklist.post_candidate_remaining_work_items || [])
    .filter(row => BOUNDED_SOURCE_BATCHES.has(row.source_downstream_action_batch))
}

function evidenceLane(sourceDownstreamActionBatch) {
  if (sourceDownstreamActionBatch === 'source_row_confirmation') return 'source_row_confirmation'
  if (sourceDownstreamActionBatch === 'item_level_source_review') return 'item_level_source_review'
  return 'unknown'
}

function reviewBucket(inventory) {
  return inventory.confirmation_bucket || inventory.item_level_source_review_bucket || ''
}

function evidenceProfile(inventory) {
  return inventory.confirmation_profile || inventory.item_level_profile || {}
}

function profileHasLowBridgeScore(profile) {
  return profile.has_low_bridge_score === true
}

function profileHasManualOpen(profile) {
  return (profile.manual_confirmation_fields_open || []).length > 0
}

function summarize(expected) {
  return {
    audited_bounded_source_evidence_items: 0,
    bounded_source_auto_approval_items: 0,
    bounded_source_evidence_items: 0,
    by_evidence_lane: {},
    by_grade_band: {},
    by_inventory_bucket: {},
    by_manual_confirmation_lane: {},
    by_page_range_status: {},
    by_post_candidate_remaining_reason: {},
    by_priority_tier: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_review_bucket: {},
    by_subject: {},
    expected_bounded_source_evidence_items: expected.length,
    extra_bounded_source_evidence_items: 0,
    item_level_source_review_items: 0,
    low_bridge_score_items: 0,
    manual_confirmation_required_items: 0,
    manual_open_confirmation_items: 0,
    missing_bounded_source_evidence_items: 0,
    page_ready_items: 0,
    pending_action_decisions: 0,
    recommendation_manual_confirmation_items: 0,
    source_row_confirmation_items: 0,
    unique_action_decisions: sorted(expected.map(row => row.action_decision_id)).length,
    unique_progression_groups: sorted(expected.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(expected.map(row => row.source_key)).length,
    unique_standard_codes: sorted(expected.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(expected.map(row => row.unit_evidence_id)).length
  }
}

function validateRow(row, remaining, inventory, action, recommendation, errors, stats, index) {
  const prefix = row.downstream_action_decision_id || remaining.action_decision_id || '(missing action decision id)'
  if (row.downstream_action_decision_id !== remaining.action_decision_id) errors.push(`${prefix} downstream_action_decision_id mismatch`)
  if (row.inventory_item_id !== inventory.inventory_item_id) errors.push(`${prefix} inventory_item_id mismatch`)
  if (row.worklist_rank !== index + 1) errors.push(`${prefix} worklist_rank mismatch`)
  for (const key of [
    'grade_band',
    'inventory_bucket',
    'inventory_disposition',
    'manual_confirmation_lane',
    'post_candidate_remaining_reason',
    'priority_tier',
    'progression_group_id',
    'source_batch',
    'source_batch_item_id',
    'source_downstream_action_batch',
    'source_downstream_action_item_id',
    'source_key',
    'standard_code',
    'subject_slug',
    'unit_evidence_id',
    'unit_title'
  ]) {
    if ((row[key] || '') !== (remaining[key] || '')) errors.push(`${prefix} ${key} mismatch`)
  }
  if (row.evidence_lane !== evidenceLane(remaining.source_downstream_action_batch)) errors.push(`${prefix} evidence_lane mismatch`)
  if (row.action_decision_status !== action.decision_status) errors.push(`${prefix} action_decision_status mismatch`)
  if (row.action_decision_status !== 'pending_review') errors.push(`${prefix} action_decision_status must be pending_review`)
  if (row.action_reviewer_decision !== 'pending') errors.push(`${prefix} action_reviewer_decision must be pending`)
  if (row.recommended_reviewer_decision !== recommendation.recommended_reviewer_decision) errors.push(`${prefix} recommended_reviewer_decision mismatch`)
  if (row.recommendation_requires_manual_confirmation !== true) errors.push(`${prefix} recommendation_requires_manual_confirmation must be true`)
  if (recommendation.recommendation_only !== true) errors.push(`${prefix} source recommendation must be recommendation_only`)
  if (row.page_ready !== true) errors.push(`${prefix} page_ready must be true`)
  if (row.page_ready !== inventory.page_ready) errors.push(`${prefix} page_ready mismatch`)
  if (row.review_bucket !== reviewBucket(inventory)) errors.push(`${prefix} review_bucket mismatch`)
  if (row.inventory_disposition !== (remaining.inventory_disposition || inventory.recommended_disposition || '')) {
    errors.push(`${prefix} inventory_disposition mismatch`)
  }
  if (!row.required_confirmations_to_close?.length) errors.push(`${prefix} required_confirmations_to_close must be non-empty`)
  if (!row.required_false_confirmations?.length) errors.push(`${prefix} required_false_confirmations must be non-empty`)
  if (row.manual_confirmation_required !== true) errors.push(`${prefix} manual_confirmation_required must be true`)
  if (row.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)

  const profile = evidenceProfile(inventory)
  stats.audited_bounded_source_evidence_items += 1
  stats.bounded_source_evidence_items += 1
  if (row.evidence_lane === 'source_row_confirmation') stats.source_row_confirmation_items += 1
  if (row.evidence_lane === 'item_level_source_review') stats.item_level_source_review_items += 1
  if (row.action_decision_status === 'pending_review' && row.action_reviewer_decision === 'pending') stats.pending_action_decisions += 1
  if (row.manual_confirmation_required) stats.manual_confirmation_required_items += 1
  if (row.recommendation_requires_manual_confirmation) stats.recommendation_manual_confirmation_items += 1
  if (row.page_ready) stats.page_ready_items += 1
  if (profileHasLowBridgeScore(profile)) stats.low_bridge_score_items += 1
  if (profileHasManualOpen(profile)) stats.manual_open_confirmation_items += 1
  countInto(stats.by_evidence_lane, row.evidence_lane)
  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_inventory_bucket, row.inventory_bucket)
  countInto(stats.by_manual_confirmation_lane, row.manual_confirmation_lane)
  countInto(stats.by_page_range_status, row.page_range_status)
  countInto(stats.by_post_candidate_remaining_reason, row.post_candidate_remaining_reason)
  countInto(stats.by_priority_tier, row.priority_tier)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision)
  countInto(stats.by_recommendation_confidence, row.recommendation_confidence)
  countInto(stats.by_review_bucket, row.review_bucket)
  countInto(stats.by_subject, row.subject_slug)
}

function validateSummary(packet, stats, errors) {
  const summary = packet.summary || {}
  const aliases = {
    audited_bounded_source_evidence_items: 'bounded_source_evidence_items',
    bounded_source_evidence_items: 'bounded_source_evidence_items'
  }
  for (const key of [
    'bounded_source_auto_approval_items',
    'expected_bounded_source_evidence_items',
    'item_level_source_review_items',
    'low_bridge_score_items',
    'manual_confirmation_required_items',
    'manual_open_confirmation_items',
    'page_ready_items',
    'pending_action_decisions',
    'recommendation_manual_confirmation_items',
    'source_row_confirmation_items',
    'unique_action_decisions',
    'unique_progression_groups',
    'unique_source_keys',
    'unique_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`summary.${key} mismatch: expected ${stats[key]}, got ${summary[key]}`)
  }
  for (const [statsKey, summaryKey] of Object.entries(aliases)) {
    if (summary[summaryKey] !== stats[statsKey]) {
      errors.push(`summary.${summaryKey} mismatch: expected ${stats[statsKey]}, got ${summary[summaryKey]}`)
    }
  }
  for (const key of [
    'by_evidence_lane',
    'by_grade_band',
    'by_inventory_bucket',
    'by_manual_confirmation_lane',
    'by_page_range_status',
    'by_post_candidate_remaining_reason',
    'by_priority_tier',
    'by_recommendation',
    'by_recommendation_confidence',
    'by_review_bucket',
    'by_subject'
  ]) {
    if (JSON.stringify(stable(summary[key] || {})) !== JSON.stringify(stable(stats[key] || {}))) {
      errors.push(`summary.${key} mismatch`)
    }
  }
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Bounded Source Evidence Packet Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected bounded source evidence items | ${payload.summary.expected_bounded_source_evidence_items} |
| audited bounded source evidence items | ${payload.summary.audited_bounded_source_evidence_items} |
| missing bounded source evidence items | ${payload.summary.missing_bounded_source_evidence_items} |
| extra bounded source evidence items | ${payload.summary.extra_bounded_source_evidence_items} |
| source-row confirmation items | ${payload.summary.source_row_confirmation_items} |
| item-level source review items | ${payload.summary.item_level_source_review_items} |
| pending action decisions | ${payload.summary.pending_action_decisions} |
| page-ready items | ${payload.summary.page_ready_items} |
| manual confirmation required items | ${payload.summary.manual_confirmation_required_items} |
| bounded-source auto approvals | ${payload.summary.bounded_source_auto_approval_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Evidence Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_evidence_lane)}

## Review Buckets

| bucket | rows |
| --- | ---: |
${countRows(payload.summary.by_review_bucket)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    actionDecisions: args.actionDecisions,
    actionRecommendations: args.actionRecommendations,
    itemLevelInventory: args.itemLevelInventory,
    packet: args.packet,
    remainingWorklist: args.remainingWorklist,
    sourceRowInventory: args.sourceRowInventory
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const packet = existsSync(args.packet) ? readJson(args.packet) : { bounded_source_evidence_items: [] }
  const remainingWorklist = existsSync(args.remainingWorklist) ? readJson(args.remainingWorklist) : { post_candidate_remaining_work_items: [] }
  const sourceRowInventory = existsSync(args.sourceRowInventory) ? readJson(args.sourceRowInventory) : { inventory_items: [] }
  const itemLevelInventory = existsSync(args.itemLevelInventory) ? readJson(args.itemLevelInventory) : { inventory_items: [] }
  const actionDecisions = existsSync(args.actionDecisions) ? readJson(args.actionDecisions) : { downstream_action_decisions: [] }
  const actionRecommendations = existsSync(args.actionRecommendations) ? readJson(args.actionRecommendations) : { downstream_action_recommendations: [] }
  if (!errors.length) {
    validateTopLevel(packet, remainingWorklist, sourceRowInventory, itemLevelInventory, actionDecisions, actionRecommendations, args, errors)
  }

  const expected = expectedRows(remainingWorklist)
  const expectedByAction = mapBy(expected, 'action_decision_id', errors, 'expected bounded-source rows')
  const items = packet.bounded_source_evidence_items || []
  const itemByAction = mapBy(items, 'downstream_action_decision_id', errors, 'packet rows')
  const sourceRowByAction = mapBy(sourceRowInventory.inventory_items || [], 'downstream_action_decision_id', errors, 'source-row inventory')
  const itemLevelByAction = mapBy(itemLevelInventory.inventory_items || [], 'downstream_action_decision_id', errors, 'item-level inventory')
  const actionById = mapBy(actionDecisions.downstream_action_decisions || [], 'decision_id', errors, 'action decisions')
  const recommendationById = mapBy(actionRecommendations.downstream_action_recommendations || [], 'decision_id', errors, 'action recommendations')
  const stats = summarize(expected)

  if (items.length !== expected.length) {
    errors.push(`packet rows ${items.length} must match expected bounded-source remaining rows ${expected.length}`)
  }

  for (const [actionId, remaining] of expectedByAction.entries()) {
    const item = itemByAction.get(actionId)
    const inventory = remaining.source_downstream_action_batch === 'source_row_confirmation'
      ? sourceRowByAction.get(actionId)
      : itemLevelByAction.get(actionId)
    const action = actionById.get(actionId)
    const recommendation = recommendationById.get(actionId)
    if (!item) {
      stats.missing_bounded_source_evidence_items += 1
      errors.push(`${actionId} missing bounded-source evidence item`)
      continue
    }
    if (!inventory) {
      errors.push(`${actionId} missing bounded-source inventory row`)
      continue
    }
    if (!action) {
      errors.push(`${actionId} missing action decision`)
      continue
    }
    if (!recommendation) {
      errors.push(`${actionId} missing action recommendation`)
      continue
    }
    validateRow(item, remaining, inventory, action, recommendation, errors, stats, items.indexOf(item))
  }

  for (const actionId of itemByAction.keys()) {
    if (!expectedByAction.has(actionId)) {
      stats.extra_bounded_source_evidence_items += 1
      errors.push(`${actionId} unexpected bounded-source evidence item`)
    }
  }

  if (args.requireItems && !stats.audited_bounded_source_evidence_items) {
    errors.push('requireItems is set but no bounded-source evidence items were audited')
  }
  if (stats.audited_bounded_source_evidence_items !== stats.expected_bounded_source_evidence_items) {
    errors.push(`audited bounded-source evidence items ${stats.audited_bounded_source_evidence_items} must match expected ${stats.expected_bounded_source_evidence_items}`)
  }
  validateSummary(packet, stats, errors)

  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    packet: args.packet,
    publication_ready: false,
    require_items: args.requireItems,
    source_action_decisions: args.actionDecisions,
    source_action_recommendations: args.actionRecommendations,
    source_item_level_inventory: args.itemLevelInventory,
    source_post_candidate_remaining_worklist: args.remainingWorklist,
    source_source_row_inventory: args.sourceRowInventory,
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
