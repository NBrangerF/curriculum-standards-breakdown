#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_REMAINING_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ROW_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_ITEM_LEVEL_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet_anchor_domain_rejected_english_pe.md'

const BOUNDED_SOURCE_BATCHES = new Set(['source_row_confirmation', 'item_level_source_review'])

function parseArgs(argv) {
  const args = {
    actionDecisions: DEFAULT_ACTION_DECISIONS,
    actionRecommendations: DEFAULT_ACTION_RECOMMENDATIONS,
    itemLevelInventory: DEFAULT_ITEM_LEVEL_INVENTORY,
    out: DEFAULT_OUT,
    remainingWorklist: DEFAULT_REMAINING_WORKLIST,
    requireItems: false,
    sourceRowInventory: DEFAULT_SOURCE_ROW_INVENTORY,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--remaining-worklist') args.remainingWorklist = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet.js \\
  --strict --require-items

Builds a read-only evidence packet for the post-candidate source-row
confirmation and item-level source review rows. It does not edit decisions,
approve bridges, write public/data, or enable matcher/publication.`)
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

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
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

function truncate(value, max = 120) {
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

function packetPolicy() {
  return {
    bounded_source_evidence_packet_is_not_reviewer_decision: true,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_decision_must_be_edited_separately: true,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    requires_manual_item_level_source_review: true,
    requires_manual_source_row_confirmation: true,
    writes_public_data: false
  }
}

function validateTopLevel(remainingWorklist, sourceRowInventory, itemLevelInventory, actionDecisions, actionRecommendations, errors) {
  if (remainingWorklist.valid !== true) errors.push('remaining worklist valid must be true')
  if (remainingWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist') {
    errors.push('remaining worklist purpose mismatch')
  }
  if (remainingWorklist.worklist_only !== true) errors.push('remaining worklist worklist_only must be true')
  if (remainingWorklist.remaining_worklist_only !== true) errors.push('remaining worklist remaining_worklist_only must be true')
  if (!Array.isArray(remainingWorklist.post_candidate_remaining_work_items)) {
    errors.push('remaining worklist post_candidate_remaining_work_items must be an array')
  }
  validatePolicy('remaining worklist', remainingWorklist, errors)

  if (sourceRowInventory.valid !== true) errors.push('source-row inventory valid must be true')
  if (sourceRowInventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_inventory') {
    errors.push('source-row inventory purpose mismatch')
  }
  if (sourceRowInventory.evidence_inventory_only !== true) errors.push('source-row inventory evidence_inventory_only must be true')
  if (!Array.isArray(sourceRowInventory.inventory_items)) errors.push('source-row inventory_items must be an array')
  validatePolicy('source-row inventory', sourceRowInventory, errors)

  if (itemLevelInventory.valid !== true) errors.push('item-level inventory valid must be true')
  if (itemLevelInventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_inventory') {
    errors.push('item-level inventory purpose mismatch')
  }
  if (itemLevelInventory.evidence_inventory_only !== true) errors.push('item-level inventory evidence_inventory_only must be true')
  if (!Array.isArray(itemLevelInventory.inventory_items)) errors.push('item-level inventory_items must be an array')
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
  if (!Array.isArray(actionRecommendations.downstream_action_recommendations)) {
    errors.push('action recommendations rows must be an array')
  }
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

function buildItem(remaining, inventory, action, recommendation, index) {
  const profile = evidenceProfile(inventory)
  return {
    action_decision_status: action.decision_status || '',
    action_reviewer_decision: action.reviewer_decision || '',
    anchor_requirement_summary: inventory.anchor_requirement_summary || '',
    anchor_type: inventory.anchor_type || action.anchor_type || '',
    bounded_source_evidence_packet_id: `h4g_anchor_group_post_candidate_bounded_source_evidence_${hashText(remaining.action_decision_id)}`,
    bridge_score: Number(inventory.bridge_score || 0),
    downstream_action_decision_id: remaining.action_decision_id || '',
    evidence_lane: evidenceLane(remaining.source_downstream_action_batch),
    evidence_profile: profile,
    grade_band: remaining.grade_band || '',
    inventory_bucket: remaining.inventory_bucket || '',
    inventory_disposition: remaining.inventory_disposition || inventory.recommended_disposition || '',
    inventory_item_id: inventory.inventory_item_id || remaining.inventory_item_id || '',
    manual_confirmation_lane: remaining.manual_confirmation_lane || '',
    manual_confirmation_required: true,
    page_range: inventory.page_range || '',
    page_range_status: inventory.page_range_status || '',
    page_ready: inventory.page_ready === true,
    post_candidate_remaining_reason: remaining.post_candidate_remaining_reason || '',
    priority_rank: remaining.priority_rank,
    priority_tier: remaining.priority_tier || '',
    progression_group_id: remaining.progression_group_id || '',
    recommended_next_gate_after_candidate_filter: remaining.recommended_next_gate_after_candidate_filter || '',
    recommended_reviewer_decision: recommendation.recommended_reviewer_decision || remaining.recommended_reviewer_decision || '',
    recommendation_confidence: recommendation.recommendation_confidence || '',
    recommendation_requires_manual_confirmation: recommendation.recommendation_requires_manual_confirmation === true,
    remaining_worklist_rank: remaining.remaining_worklist_rank,
    required_confirmations_to_close: inventory.required_confirmations_to_close || remaining.required_confirmations_to_close || [],
    required_false_confirmations: remaining.required_false_confirmations || profile.manual_confirmation_fields_open || [],
    review_bucket: reviewBucket(inventory),
    review_grain: inventory.review_grain || action.review_grain || '',
    review_questions: inventory.review_questions || action.review_questions || [],
    risk_signals: inventory.risk_signals || remaining.risk_signals || [],
    source_anchor_review_item_ids: inventory.source_anchor_review_item_ids || action.source_anchor_review_item_ids || [],
    source_batch: remaining.source_batch || '',
    source_batch_item_id: remaining.source_batch_item_id || '',
    source_downstream_action_batch: remaining.source_downstream_action_batch || '',
    source_downstream_action_item_id: remaining.source_downstream_action_item_id || '',
    source_key: remaining.source_key || '',
    source_standard_context: inventory.source_standard_context || action.source_context?.standard_context || {},
    standard_code: remaining.standard_code || '',
    subject_slug: remaining.subject_slug || '',
    target_grade_band: remaining.target_grade_band || '',
    target_standard_code: remaining.target_standard_code || inventory.target_standard_code || action.target_standard_code || '',
    topic_tags: inventory.topic_tags || {},
    unit_context: inventory.unit_context || action.source_context?.unit_context || {},
    unit_evidence_id: remaining.unit_evidence_id || inventory.unit_evidence_id || '',
    unit_title: remaining.unit_title || inventory.unit_title || '',
    worklist_rank: index + 1,
    writes_public_data: false
  }
}

function buildRows(remainingWorklist, sourceRowInventory, itemLevelInventory, actionDecisions, actionRecommendations, errors) {
  const sourceRowByAction = mapBy(sourceRowInventory.inventory_items || [], 'downstream_action_decision_id', errors, 'source-row inventory')
  const itemLevelByAction = mapBy(itemLevelInventory.inventory_items || [], 'downstream_action_decision_id', errors, 'item-level inventory')
  const actionById = mapBy(actionDecisions.downstream_action_decisions || [], 'decision_id', errors, 'action decisions')
  const recommendationById = mapBy(actionRecommendations.downstream_action_recommendations || [], 'decision_id', errors, 'action recommendations')
  const rows = []
  for (const remaining of expectedRows(remainingWorklist)) {
    const inventory = remaining.source_downstream_action_batch === 'source_row_confirmation'
      ? sourceRowByAction.get(remaining.action_decision_id)
      : itemLevelByAction.get(remaining.action_decision_id)
    const action = actionById.get(remaining.action_decision_id)
    const recommendation = recommendationById.get(remaining.action_decision_id)
    if (!inventory) errors.push(`${remaining.action_decision_id} missing bounded-source inventory row`)
    if (!action) errors.push(`${remaining.action_decision_id} missing action decision row`)
    if (!recommendation) errors.push(`${remaining.action_decision_id} missing action recommendation row`)
    if (!inventory || !action || !recommendation) continue
    rows.push(buildItem(remaining, inventory, action, recommendation, rows.length))
  }
  return rows
}

function summarize(rows, remainingWorklist) {
  const summary = {
    bounded_source_auto_approval_items: 0,
    bounded_source_evidence_items: rows.length,
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
    expected_bounded_source_evidence_items: Number(remainingWorklist.summary?.source_row_confirmation_items || 0) + Number(remainingWorklist.summary?.item_level_source_review_items || 0),
    item_level_source_review_items: 0,
    low_bridge_score_items: 0,
    manual_confirmation_required_items: 0,
    manual_open_confirmation_items: 0,
    page_ready_items: 0,
    pending_action_decisions: 0,
    recommendation_manual_confirmation_items: 0,
    source_row_confirmation_items: 0,
    unique_action_decisions: sorted(rows.map(row => row.downstream_action_decision_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    const profile = row.evidence_profile || {}
    if (row.action_decision_status === 'pending_review' && row.action_reviewer_decision === 'pending') summary.pending_action_decisions += 1
    if (row.evidence_lane === 'source_row_confirmation') summary.source_row_confirmation_items += 1
    if (row.evidence_lane === 'item_level_source_review') summary.item_level_source_review_items += 1
    if (row.manual_confirmation_required) summary.manual_confirmation_required_items += 1
    if (row.page_ready) summary.page_ready_items += 1
    if (row.recommendation_requires_manual_confirmation) summary.recommendation_manual_confirmation_items += 1
    if (profileHasLowBridgeScore(profile)) summary.low_bridge_score_items += 1
    if (profileHasManualOpen(profile)) summary.manual_open_confirmation_items += 1
    countInto(summary.by_evidence_lane, row.evidence_lane)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_inventory_bucket, row.inventory_bucket)
    countInto(summary.by_manual_confirmation_lane, row.manual_confirmation_lane)
    countInto(summary.by_page_range_status, row.page_range_status)
    countInto(summary.by_post_candidate_remaining_reason, row.post_candidate_remaining_reason)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_review_bucket, row.review_bucket)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.map(row => (
    `| ${row.worklist_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.evidence_lane)} | ${markdownCell(row.review_bucket)} | ${markdownCell(row.standard_code)} | ${truncate(row.unit_title, 70)} |`
  )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Bounded Source Evidence Packet

Generated at: ${payload.generated_at}

This read-only packet narrows the post-candidate remaining worklist to the
source-row confirmation and item-level source review rows. It is not a
reviewer decision, not a bridge approval, and not a publication gate.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| bounded source evidence items | ${payload.summary.bounded_source_evidence_items} |
| expected bounded source evidence items | ${payload.summary.expected_bounded_source_evidence_items} |
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

## Grades

| grade | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Preview

| rank | subject | grade | lane | review bucket | standard | unit |
| ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.bounded_source_evidence_items)}

## Guardrails

- Packet rows are not reviewer decisions.
- Every row still requires manual source-row or item-level source review.
- Downstream action, matcher, and publication gates remain separate.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    actionDecisions: args.actionDecisions,
    actionRecommendations: args.actionRecommendations,
    itemLevelInventory: args.itemLevelInventory,
    remainingWorklist: args.remainingWorklist,
    sourceRowInventory: args.sourceRowInventory
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const remainingWorklist = existsSync(args.remainingWorklist) ? readJson(args.remainingWorklist) : { post_candidate_remaining_work_items: [] }
  const sourceRowInventory = existsSync(args.sourceRowInventory) ? readJson(args.sourceRowInventory) : { inventory_items: [] }
  const itemLevelInventory = existsSync(args.itemLevelInventory) ? readJson(args.itemLevelInventory) : { inventory_items: [] }
  const actionDecisions = existsSync(args.actionDecisions) ? readJson(args.actionDecisions) : { downstream_action_decisions: [] }
  const actionRecommendations = existsSync(args.actionRecommendations) ? readJson(args.actionRecommendations) : { downstream_action_recommendations: [] }
  if (!errors.length) validateTopLevel(remainingWorklist, sourceRowInventory, itemLevelInventory, actionDecisions, actionRecommendations, errors)
  const rows = buildRows(remainingWorklist, sourceRowInventory, itemLevelInventory, actionDecisions, actionRecommendations, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no bounded-source evidence rows were generated')
  return {
    bounded_source_evidence_items: rows,
    bounded_source_evidence_packet_only: true,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    packet_policy: packetPolicy(),
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet',
    review_only: true,
    source_action_decisions: args.actionDecisions,
    source_action_recommendations: args.actionRecommendations,
    source_item_level_inventory: args.itemLevelInventory,
    source_post_candidate_remaining_worklist: args.remainingWorklist,
    source_source_row_inventory: args.sourceRowInventory,
    summary: summarize(rows, remainingWorklist),
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
  const payload = buildPayload(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
