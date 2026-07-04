#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_REMAINING_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet_anchor_domain_rejected_english_pe_audit.md'

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    remainingWorklist: DEFAULT_REMAINING_WORKLIST,
    requireItems: false,
    sourceAnchorDecisions: DEFAULT_SOURCE_ANCHOR_DECISIONS,
    sourceAnchorRecommendations: DEFAULT_SOURCE_ANCHOR_RECOMMENDATIONS,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
    else if (item === '--remaining-worklist') args.remainingWorklist = argv[++i]
    else if (item === '--source-anchor-decisions') args.sourceAnchorDecisions = argv[++i]
    else if (item === '--source-anchor-recommendations') args.sourceAnchorRecommendations = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet.js \\
  --strict --require-items

Audits the post-candidate source-anchor exact evidence packet against the
remaining worklist, source-anchor review decisions, and recommendation-only
routes.`)
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
    'downstream_action_decision_must_be_edited_separately',
    'exact_evidence_packet_is_not_reviewer_decision',
    'requires_exact_anchor_manual_review',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function validateTopLevel(packet, remainingWorklist, decisions, recommendations, args, errors) {
  if (packet.valid !== true) errors.push('packet valid must be true')
  if ((packet.errors || []).length) errors.push('packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet') {
    errors.push('packet purpose mismatch')
  }
  if (packet.exact_evidence_packet_only !== true) errors.push('packet exact_evidence_packet_only must be true')
  if (packet.review_only !== true) errors.push('packet review_only must be true')
  if (packet.source_post_candidate_remaining_worklist !== args.remainingWorklist) {
    errors.push('packet source_post_candidate_remaining_worklist must match audit arg')
  }
  if (packet.source_source_anchor_review_decisions !== args.sourceAnchorDecisions) {
    errors.push('packet source_source_anchor_review_decisions must match audit arg')
  }
  if (packet.source_source_anchor_review_recommendations !== args.sourceAnchorRecommendations) {
    errors.push('packet source_source_anchor_review_recommendations must match audit arg')
  }
  if (!Array.isArray(packet.source_anchor_exact_evidence_items)) {
    errors.push('packet source_anchor_exact_evidence_items must be an array')
  }
  validatePolicy('packet', packet, errors)
  validatePacketPolicy('packet policy', packet.packet_policy || {}, errors)

  if (remainingWorklist.valid !== true) errors.push('remaining worklist valid must be true')
  if (remainingWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist') {
    errors.push('remaining worklist purpose mismatch')
  }
  if (!Array.isArray(remainingWorklist.post_candidate_remaining_work_items)) {
    errors.push('remaining worklist rows must be an array')
  }
  validatePolicy('remaining worklist', remainingWorklist, errors)

  if (decisions.valid !== true) errors.push('source-anchor decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template') {
    errors.push('source-anchor decisions purpose mismatch')
  }
  if (!Array.isArray(decisions.downstream_source_anchor_review_decisions)) {
    errors.push('source-anchor decisions rows must be an array')
  }
  validatePolicy('source-anchor decisions', decisions, errors)

  if (recommendations.valid !== true) errors.push('source-anchor recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations') {
    errors.push('source-anchor recommendations purpose mismatch')
  }
  if (recommendations.recommendation_only !== true) errors.push('source-anchor recommendations recommendation_only must be true')
  if (!Array.isArray(recommendations.downstream_source_anchor_review_recommendations)) {
    errors.push('source-anchor recommendations rows must be an array')
  }
  validatePolicy('source-anchor recommendations', recommendations, errors)
}

function expectedRows(remainingWorklist) {
  return (remainingWorklist.post_candidate_remaining_work_items || [])
    .filter(row => row.source_downstream_action_batch === 'source_anchor_evidence')
}

function summarize(expected) {
  return {
    audited_source_anchor_exact_evidence_items: 0,
    by_grade_band: {},
    by_inventory_bucket: {},
    by_manual_confirmation_lane: {},
    by_page_evidence_status: {},
    by_page_hint_source: {},
    by_post_candidate_remaining_reason: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_review_lane: {},
    by_subject: {},
    exact_anchor_auto_approval_items: 0,
    expected_source_anchor_exact_evidence_items: expected.length,
    extra_source_anchor_exact_evidence_items: 0,
    full_h4g_triplet_context_items: 0,
    manual_confirmation_source_anchor_items: expected.length,
    missing_source_anchor_exact_evidence_items: 0,
    pending_review_decisions: 0,
    ready_for_manual_review_items: 0,
    source_anchor_exact_evidence_items: 0,
    text_extracted_items: 0,
    unique_action_decisions: sorted(expected.map(row => row.action_decision_id)).length,
    unique_progression_groups: sorted(expected.map(row => row.progression_group_id)).length,
    unique_review_decisions: 0,
    unique_standard_codes: sorted(expected.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(expected.map(row => row.unit_evidence_id)).length
  }
}

function validateRow(row, remaining, decision, recommendation, errors, stats, index) {
  const prefix = row.downstream_action_decision_id || remaining.action_decision_id || '(missing action decision id)'
  if (row.downstream_action_decision_id !== remaining.action_decision_id) errors.push(`${prefix} downstream_action_decision_id mismatch`)
  if (row.review_decision_id !== decision.decision_id) errors.push(`${prefix} review_decision_id mismatch`)
  if (row.source_anchor_review_recommendation_id !== recommendation.source_anchor_review_recommendation_id) {
    errors.push(`${prefix} source_anchor_review_recommendation_id mismatch`)
  }
  if (row.worklist_rank !== index + 1) errors.push(`${prefix} worklist_rank mismatch`)
  for (const key of [
    'grade_band',
    'inventory_item_id',
    'manual_confirmation_lane',
    'post_candidate_remaining_reason',
    'progression_group_id',
    'source_batch',
    'source_batch_item_id',
    'source_downstream_action_batch',
    'source_key',
    'standard_code',
    'subject_slug',
    'unit_evidence_id',
    'unit_title'
  ]) {
    if ((row[key] || '') !== (remaining[key] || '')) errors.push(`${prefix} ${key} mismatch`)
  }
  if ((row.target_standard_code || '') !== (remaining.target_standard_code || decision.target_standard_code || '')) {
    errors.push(`${prefix} target_standard_code mismatch`)
  }
  if (row.source_downstream_action_batch !== 'source_anchor_evidence') errors.push(`${prefix} must be source_anchor_evidence`)
  if (row.review_decision_status !== decision.decision_status) errors.push(`${prefix} review_decision_status mismatch`)
  if (row.review_decision_status !== 'pending') errors.push(`${prefix} review_decision_status must be pending`)
  if (row.reviewer_decision !== 'pending') errors.push(`${prefix} reviewer_decision must be pending`)
  if (row.recommended_reviewer_decision !== recommendation.recommended_reviewer_decision) {
    errors.push(`${prefix} recommended_reviewer_decision mismatch`)
  }
  if (row.recommended_reviewer_decision !== 'pending') errors.push(`${prefix} recommended_reviewer_decision must remain pending`)
  if (row.recommendation_requires_manual_confirmation !== true) {
    errors.push(`${prefix} recommendation_requires_manual_confirmation must be true`)
  }
  if (row.exact_anchor_auto_approval !== false) errors.push(`${prefix} exact_anchor_auto_approval must be false`)
  if (row.page_evidence_status !== decision.page_evidence_status) errors.push(`${prefix} page_evidence_status mismatch`)
  if (row.page_evidence_status !== 'text_extracted') errors.push(`${prefix} page_evidence_status must be text_extracted`)
  if (row.page_hint_source !== decision.page_hint_source) errors.push(`${prefix} page_hint_source mismatch`)
  if (row.page_evidence_context?.ready_for_manual_review !== true) {
    errors.push(`${prefix} page evidence must be ready for manual review`)
  }
  if (!row.page_evidence_context?.page_text_excerpt_previews?.length) {
    errors.push(`${prefix} must include page text excerpt previews`)
  }

  stats.audited_source_anchor_exact_evidence_items += 1
  stats.source_anchor_exact_evidence_items += 1
  if (row.exact_anchor_auto_approval) stats.exact_anchor_auto_approval_items += 1
  if (row.has_full_h4g_triplet_context) stats.full_h4g_triplet_context_items += 1
  if (row.review_decision_status === 'pending' && row.reviewer_decision === 'pending') stats.pending_review_decisions += 1
  if (row.page_evidence_context?.ready_for_manual_review) stats.ready_for_manual_review_items += 1
  if (row.page_evidence_status === 'text_extracted') stats.text_extracted_items += 1
  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_inventory_bucket, row.inventory_bucket)
  countInto(stats.by_manual_confirmation_lane, row.manual_confirmation_lane)
  countInto(stats.by_page_evidence_status, row.page_evidence_status)
  countInto(stats.by_page_hint_source, row.page_hint_source)
  countInto(stats.by_post_candidate_remaining_reason, row.post_candidate_remaining_reason)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision)
  countInto(stats.by_recommendation_confidence, row.recommendation_confidence)
  countInto(stats.by_review_lane, row.review_lane)
  countInto(stats.by_subject, row.subject_slug)
}

function validateSummary(packet, stats, errors) {
  const summary = packet.summary || {}
  const aliases = {
    audited_source_anchor_exact_evidence_items: 'source_anchor_exact_evidence_items',
    source_anchor_exact_evidence_items: 'source_anchor_exact_evidence_items'
  }
  for (const key of [
    'exact_anchor_auto_approval_items',
    'full_h4g_triplet_context_items',
    'manual_confirmation_source_anchor_items',
    'pending_review_decisions',
    'ready_for_manual_review_items',
    'text_extracted_items',
    'unique_action_decisions',
    'unique_progression_groups',
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
    'by_grade_band',
    'by_inventory_bucket',
    'by_manual_confirmation_lane',
    'by_page_evidence_status',
    'by_page_hint_source',
    'by_post_candidate_remaining_reason',
    'by_recommendation',
    'by_recommendation_confidence',
    'by_review_lane',
    'by_subject'
  ]) {
    if (JSON.stringify(stable(summary[key] || {})) !== JSON.stringify(stable(stats[key] || {}))) {
      errors.push(`summary.${key} mismatch`)
    }
  }
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Source-Anchor Exact Evidence Packet Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected source-anchor exact evidence items | ${payload.summary.expected_source_anchor_exact_evidence_items} |
| audited source-anchor exact evidence items | ${payload.summary.audited_source_anchor_exact_evidence_items} |
| missing source-anchor exact evidence items | ${payload.summary.missing_source_anchor_exact_evidence_items} |
| extra source-anchor exact evidence items | ${payload.summary.extra_source_anchor_exact_evidence_items} |
| pending review decisions | ${payload.summary.pending_review_decisions} |
| text-extracted items | ${payload.summary.text_extracted_items} |
| exact-anchor auto approvals | ${payload.summary.exact_anchor_auto_approval_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Remaining Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_manual_confirmation_lane)}

## Page Hint Sources

| page hint source | rows |
| --- | ---: |
${countRows(payload.summary.by_page_hint_source)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    packet: args.packet,
    remainingWorklist: args.remainingWorklist,
    sourceAnchorDecisions: args.sourceAnchorDecisions,
    sourceAnchorRecommendations: args.sourceAnchorRecommendations
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const packet = existsSync(args.packet) ? readJson(args.packet) : { source_anchor_exact_evidence_items: [] }
  const remainingWorklist = existsSync(args.remainingWorklist) ? readJson(args.remainingWorklist) : { post_candidate_remaining_work_items: [] }
  const decisions = existsSync(args.sourceAnchorDecisions) ? readJson(args.sourceAnchorDecisions) : { downstream_source_anchor_review_decisions: [] }
  const recommendations = existsSync(args.sourceAnchorRecommendations) ? readJson(args.sourceAnchorRecommendations) : { downstream_source_anchor_review_recommendations: [] }
  if (!errors.length) validateTopLevel(packet, remainingWorklist, decisions, recommendations, args, errors)

  const expected = expectedRows(remainingWorklist)
  const expectedByAction = mapBy(expected, 'action_decision_id', errors, 'expected source-anchor rows')
  const items = packet.source_anchor_exact_evidence_items || []
  const itemByAction = mapBy(items, 'downstream_action_decision_id', errors, 'packet rows')
  const decisionByAction = mapBy(decisions.downstream_source_anchor_review_decisions || [], 'downstream_action_decision_id', errors, 'source-anchor decisions')
  const recommendationByAction = mapBy(recommendations.downstream_source_anchor_review_recommendations || [], 'downstream_action_decision_id', errors, 'source-anchor recommendations')
  const stats = summarize(expected)
  const reviewDecisionIds = new Set()

  if (items.length !== expected.length) {
    errors.push(`packet rows ${items.length} must match expected source-anchor remaining rows ${expected.length}`)
  }

  for (const [actionId, remaining] of expectedByAction.entries()) {
    const item = itemByAction.get(actionId)
    const decision = decisionByAction.get(actionId)
    const recommendation = recommendationByAction.get(actionId)
    if (!item) {
      stats.missing_source_anchor_exact_evidence_items += 1
      errors.push(`${actionId} missing source-anchor exact evidence item`)
      continue
    }
    if (!decision) {
      errors.push(`${actionId} missing source-anchor review decision`)
      continue
    }
    if (!recommendation) {
      errors.push(`${actionId} missing source-anchor review recommendation`)
      continue
    }
    reviewDecisionIds.add(decision.decision_id)
    validateRow(item, remaining, decision, recommendation, errors, stats, items.indexOf(item))
  }

  for (const actionId of itemByAction.keys()) {
    if (!expectedByAction.has(actionId)) {
      stats.extra_source_anchor_exact_evidence_items += 1
      errors.push(`${actionId} unexpected source-anchor exact evidence item`)
    }
  }
  stats.unique_review_decisions = reviewDecisionIds.size
  if (args.requireItems && !stats.audited_source_anchor_exact_evidence_items) {
    errors.push('requireItems is set but no source-anchor exact evidence items were audited')
  }
  if (stats.audited_source_anchor_exact_evidence_items !== stats.expected_source_anchor_exact_evidence_items) {
    errors.push(`audited source-anchor exact evidence items ${stats.audited_source_anchor_exact_evidence_items} must match expected ${stats.expected_source_anchor_exact_evidence_items}`)
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
    source_post_candidate_remaining_worklist: args.remainingWorklist,
    source_source_anchor_review_decisions: args.sourceAnchorDecisions,
    source_source_anchor_review_recommendations: args.sourceAnchorRecommendations,
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
