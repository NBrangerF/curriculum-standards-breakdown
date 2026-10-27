#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_REMAINING_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_EXACT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_BOUNDED_SOURCE_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_packet_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_packet_anchor_domain_rejected_english_pe_audit.md'

const SOURCE_ANCHOR_BATCH = 'source_anchor_evidence'
const BOUNDED_SOURCE_BATCHES = new Set(['source_row_confirmation', 'item_level_source_review'])

function parseArgs(argv) {
  const args = {
    boundedSourcePacket: DEFAULT_BOUNDED_SOURCE_PACKET,
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    remainingWorklist: DEFAULT_REMAINING_WORKLIST,
    requireItems: false,
    sourceAnchorExactPacket: DEFAULT_SOURCE_ANCHOR_EXACT_PACKET,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
    else if (item === '--remaining-worklist') args.remainingWorklist = argv[++i]
    else if (item === '--source-anchor-exact-packet') args.sourceAnchorExactPacket = argv[++i]
    else if (item === '--bounded-source-packet') args.boundedSourcePacket = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_packet.js \\
  --strict --require-items

Audits the unified post-candidate manual review packet against the remaining
worklist, source-anchor exact evidence packet, and bounded-source evidence
packet.`)
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
    'bounded_source_action_decision_must_be_edited_separately',
    'manual_review_packet_is_not_reviewer_decision',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_manual_confirmation_for_every_item',
    'source_anchor_review_decision_must_be_edited_separately'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function validateTopLevel(packet, remainingWorklist, sourceAnchorExactPacket, boundedSourcePacket, args, errors) {
  if (packet.valid !== true) errors.push('packet valid must be true')
  if ((packet.errors || []).length) errors.push('packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_packet') {
    errors.push('packet purpose mismatch')
  }
  if (packet.manual_review_packet_only !== true) errors.push('packet manual_review_packet_only must be true')
  if (packet.review_only !== true) errors.push('packet review_only must be true')
  if (packet.source_post_candidate_remaining_worklist !== args.remainingWorklist) errors.push('packet source_post_candidate_remaining_worklist must match audit arg')
  if (packet.source_source_anchor_exact_evidence_packet !== args.sourceAnchorExactPacket) errors.push('packet source_source_anchor_exact_evidence_packet must match audit arg')
  if (packet.source_bounded_source_evidence_packet !== args.boundedSourcePacket) errors.push('packet source_bounded_source_evidence_packet must match audit arg')
  if (!Array.isArray(packet.manual_review_items)) errors.push('packet manual_review_items must be an array')
  validatePolicy('packet', packet, errors)
  validatePacketPolicy('packet policy', packet.packet_policy || {}, errors)

  if (remainingWorklist.valid !== true) errors.push('remaining worklist valid must be true')
  if (remainingWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist') {
    errors.push('remaining worklist purpose mismatch')
  }
  if (!Array.isArray(remainingWorklist.post_candidate_remaining_work_items)) errors.push('remaining worklist rows must be an array')
  validatePolicy('remaining worklist', remainingWorklist, errors)

  if (sourceAnchorExactPacket.valid !== true) errors.push('source-anchor exact packet valid must be true')
  if (sourceAnchorExactPacket.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet') {
    errors.push('source-anchor exact packet purpose mismatch')
  }
  if (sourceAnchorExactPacket.exact_evidence_packet_only !== true) errors.push('source-anchor exact packet exact_evidence_packet_only must be true')
  if (!Array.isArray(sourceAnchorExactPacket.source_anchor_exact_evidence_items)) {
    errors.push('source-anchor exact packet rows must be an array')
  }
  validatePolicy('source-anchor exact packet', sourceAnchorExactPacket, errors)

  if (boundedSourcePacket.valid !== true) errors.push('bounded-source packet valid must be true')
  if (boundedSourcePacket.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet') {
    errors.push('bounded-source packet purpose mismatch')
  }
  if (boundedSourcePacket.bounded_source_evidence_packet_only !== true) errors.push('bounded-source packet bounded_source_evidence_packet_only must be true')
  if (!Array.isArray(boundedSourcePacket.bounded_source_evidence_items)) errors.push('bounded-source packet rows must be an array')
  validatePolicy('bounded-source packet', boundedSourcePacket, errors)
}

function evidencePacketSource(batch) {
  if (batch === SOURCE_ANCHOR_BATCH) return 'source_anchor_exact_evidence_packet'
  if (BOUNDED_SOURCE_BATCHES.has(batch)) return 'bounded_source_evidence_packet'
  return 'unknown'
}

function sourcePacketItemId(source, item) {
  return source === 'source_anchor_exact_evidence_packet'
    ? item.exact_anchor_evidence_packet_id || ''
    : item.bounded_source_evidence_packet_id || ''
}

function sourceDecisionStatus(source, item) {
  return source === 'source_anchor_exact_evidence_packet'
    ? item.review_decision_status || ''
    : item.action_decision_status || ''
}

function sourceReviewerDecision(source, item) {
  return source === 'source_anchor_exact_evidence_packet'
    ? item.reviewer_decision || ''
    : item.action_reviewer_decision || ''
}

function sourceEvidenceReady(source, item) {
  return source === 'source_anchor_exact_evidence_packet'
    ? item.page_evidence_context?.ready_for_manual_review === true
    : item.page_ready === true
}

function sourceAutoApproval(source, item) {
  return source === 'source_anchor_exact_evidence_packet'
    ? item.exact_anchor_auto_approval === true
    : false
}

function sourcePageStatus(source, item) {
  return source === 'source_anchor_exact_evidence_packet'
    ? item.page_evidence_status || ''
    : item.page_range_status || ''
}

function expectedRows(remainingWorklist) {
  return remainingWorklist.post_candidate_remaining_work_items || []
}

function summarize(expectedRows, sourceAnchorExactPacket, boundedSourcePacket) {
  return {
    audited_manual_review_items: 0,
    auto_approval_items: 0,
    bounded_source_evidence_items: 0,
    by_decision_status: {},
    by_evidence_lane: {},
    by_evidence_packet_source: {},
    by_grade_band: {},
    by_manual_confirmation_lane: {},
    by_page_status: {},
    by_post_candidate_remaining_reason: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_review_bucket: {},
    by_reviewer_decision: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    evidence_ready_items: 0,
    expected_bounded_source_evidence_items: boundedSourcePacket.summary?.bounded_source_evidence_items || 0,
    expected_manual_review_items: expectedRows.length,
    expected_source_anchor_exact_evidence_items: sourceAnchorExactPacket.summary?.source_anchor_exact_evidence_items || 0,
    extra_manual_review_items: 0,
    item_level_source_review_items: 0,
    manual_confirmation_required_items: 0,
    manual_review_items: 0,
    missing_manual_review_items: 0,
    pending_review_items: 0,
    source_anchor_exact_evidence_items: 0,
    source_row_confirmation_items: 0,
    text_extracted_items: 0,
    unique_action_decisions: sorted(expectedRows.map(row => row.action_decision_id)).length,
    unique_progression_groups: sorted(expectedRows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(expectedRows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(expectedRows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(expectedRows.map(row => row.unit_evidence_id)).length
  }
}

function validateRow(row, remaining, sourceItem, source, errors, stats, index) {
  const prefix = row.downstream_action_decision_id || remaining.action_decision_id || '(missing action decision id)'
  if (row.downstream_action_decision_id !== remaining.action_decision_id) errors.push(`${prefix} downstream_action_decision_id mismatch`)
  if (row.worklist_rank !== index + 1) errors.push(`${prefix} worklist_rank mismatch`)
  for (const key of [
    'grade_band',
    'inventory_bucket',
    'inventory_item_id',
    'manual_confirmation_lane',
    'post_candidate_remaining_reason',
    'progression_group_id',
    'source_batch',
    'source_batch_item_id',
    'source_downstream_action_batch',
    'source_downstream_action_item_id',
    'source_key',
    'standard_code',
    'subject_slug',
    'target_grade_band',
    'unit_evidence_id',
    'unit_title'
  ]) {
    if ((row[key] || '') !== (remaining[key] || '')) errors.push(`${prefix} ${key} mismatch`)
  }
  if (row.evidence_packet_source !== source) errors.push(`${prefix} evidence_packet_source mismatch`)
  if (row.evidence_packet_item_id !== sourcePacketItemId(source, sourceItem)) errors.push(`${prefix} evidence_packet_item_id mismatch`)
  if (row.source_decision_status !== sourceDecisionStatus(source, sourceItem)) errors.push(`${prefix} source_decision_status mismatch`)
  if (row.source_reviewer_decision !== sourceReviewerDecision(source, sourceItem)) errors.push(`${prefix} source_reviewer_decision mismatch`)
  if (row.recommended_reviewer_decision !== sourceItem.recommended_reviewer_decision) errors.push(`${prefix} recommended_reviewer_decision mismatch`)
  if (row.recommendation_requires_manual_confirmation !== true) errors.push(`${prefix} recommendation_requires_manual_confirmation must be true`)
  if (row.manual_confirmation_required !== true) errors.push(`${prefix} manual_confirmation_required must be true`)
  if (row.evidence_ready !== true) errors.push(`${prefix} evidence_ready must be true`)
  if (row.evidence_ready !== sourceEvidenceReady(source, sourceItem)) errors.push(`${prefix} evidence_ready mismatch`)
  if (row.page_status !== sourcePageStatus(source, sourceItem)) errors.push(`${prefix} page_status mismatch`)
  if (row.auto_approval !== false) errors.push(`${prefix} auto_approval must be false`)
  if (row.auto_approval !== sourceAutoApproval(source, sourceItem)) errors.push(`${prefix} auto_approval mismatch`)
  if (row.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)

  if (source === 'source_anchor_exact_evidence_packet') {
    if (row.source_decision_status !== 'pending') errors.push(`${prefix} source-anchor decision status must be pending`)
    if (row.source_reviewer_decision !== 'pending') errors.push(`${prefix} source-anchor reviewer decision must be pending`)
    if (row.page_status !== 'text_extracted') errors.push(`${prefix} source-anchor page_status must be text_extracted`)
    if (remaining.source_downstream_action_batch !== SOURCE_ANCHOR_BATCH) errors.push(`${prefix} expected source_anchor_evidence batch`)
  } else {
    if (row.source_decision_status !== 'pending_review') errors.push(`${prefix} bounded-source decision status must be pending_review`)
    if (row.source_reviewer_decision !== 'pending') errors.push(`${prefix} bounded-source reviewer decision must be pending`)
    if (!BOUNDED_SOURCE_BATCHES.has(remaining.source_downstream_action_batch)) errors.push(`${prefix} expected bounded-source batch`)
  }

  stats.audited_manual_review_items += 1
  stats.manual_review_items += 1
  if (source === 'source_anchor_exact_evidence_packet') stats.source_anchor_exact_evidence_items += 1
  if (source === 'bounded_source_evidence_packet') stats.bounded_source_evidence_items += 1
  if (row.source_downstream_action_batch === 'source_row_confirmation') stats.source_row_confirmation_items += 1
  if (row.source_downstream_action_batch === 'item_level_source_review') stats.item_level_source_review_items += 1
  if (row.manual_confirmation_required) stats.manual_confirmation_required_items += 1
  if (row.evidence_ready) stats.evidence_ready_items += 1
  if (row.page_status === 'text_extracted') stats.text_extracted_items += 1
  if (row.auto_approval) stats.auto_approval_items += 1
  if (
    (source === 'source_anchor_exact_evidence_packet' && row.source_decision_status === 'pending' && row.source_reviewer_decision === 'pending') ||
    (source === 'bounded_source_evidence_packet' && row.source_decision_status === 'pending_review' && row.source_reviewer_decision === 'pending')
  ) {
    stats.pending_review_items += 1
  }
  countInto(stats.by_decision_status, row.source_decision_status)
  countInto(stats.by_evidence_lane, row.evidence_lane)
  countInto(stats.by_evidence_packet_source, row.evidence_packet_source)
  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_manual_confirmation_lane, row.manual_confirmation_lane)
  countInto(stats.by_page_status, row.page_status)
  countInto(stats.by_post_candidate_remaining_reason, row.post_candidate_remaining_reason)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision)
  countInto(stats.by_recommendation_confidence, row.recommendation_confidence)
  countInto(stats.by_review_bucket, row.review_bucket)
  countInto(stats.by_reviewer_decision, row.source_reviewer_decision)
  countInto(stats.by_source_downstream_action_batch, row.source_downstream_action_batch)
  countInto(stats.by_subject, row.subject_slug)
}

function validateSummary(packet, stats, errors) {
  const summary = packet.summary || {}
  const aliases = {
    audited_manual_review_items: 'manual_review_items',
    manual_review_items: 'manual_review_items'
  }
  for (const key of [
    'auto_approval_items',
    'bounded_source_evidence_items',
    'evidence_ready_items',
    'expected_bounded_source_evidence_items',
    'expected_manual_review_items',
    'expected_source_anchor_exact_evidence_items',
    'item_level_source_review_items',
    'manual_confirmation_required_items',
    'pending_review_items',
    'source_anchor_exact_evidence_items',
    'source_row_confirmation_items',
    'text_extracted_items',
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
    'by_decision_status',
    'by_evidence_lane',
    'by_evidence_packet_source',
    'by_grade_band',
    'by_manual_confirmation_lane',
    'by_page_status',
    'by_post_candidate_remaining_reason',
    'by_recommendation',
    'by_recommendation_confidence',
    'by_review_bucket',
    'by_reviewer_decision',
    'by_source_downstream_action_batch',
    'by_subject'
  ]) {
    if (JSON.stringify(stable(summary[key] || {})) !== JSON.stringify(stable(stats[key] || {}))) {
      errors.push(`summary.${key} mismatch`)
    }
  }
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Manual Review Packet Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected manual review items | ${payload.summary.expected_manual_review_items} |
| audited manual review items | ${payload.summary.audited_manual_review_items} |
| missing manual review items | ${payload.summary.missing_manual_review_items} |
| extra manual review items | ${payload.summary.extra_manual_review_items} |
| source-anchor exact evidence items | ${payload.summary.source_anchor_exact_evidence_items} |
| bounded-source evidence items | ${payload.summary.bounded_source_evidence_items} |
| source-row confirmation items | ${payload.summary.source_row_confirmation_items} |
| item-level source review items | ${payload.summary.item_level_source_review_items} |
| pending review items | ${payload.summary.pending_review_items} |
| evidence-ready items | ${payload.summary.evidence_ready_items} |
| manual confirmation required items | ${payload.summary.manual_confirmation_required_items} |
| auto approval items | ${payload.summary.auto_approval_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Evidence Packet Sources

| source | rows |
| --- | ---: |
${countRows(payload.summary.by_evidence_packet_source)}

## Source Action Batches

| batch | rows |
| --- | ---: |
${countRows(payload.summary.by_source_downstream_action_batch)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    boundedSourcePacket: args.boundedSourcePacket,
    packet: args.packet,
    remainingWorklist: args.remainingWorklist,
    sourceAnchorExactPacket: args.sourceAnchorExactPacket
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const packet = existsSync(args.packet) ? readJson(args.packet) : { manual_review_items: [] }
  const remainingWorklist = existsSync(args.remainingWorklist) ? readJson(args.remainingWorklist) : { post_candidate_remaining_work_items: [] }
  const sourceAnchorExactPacket = existsSync(args.sourceAnchorExactPacket) ? readJson(args.sourceAnchorExactPacket) : { source_anchor_exact_evidence_items: [] }
  const boundedSourcePacket = existsSync(args.boundedSourcePacket) ? readJson(args.boundedSourcePacket) : { bounded_source_evidence_items: [] }
  if (!errors.length) validateTopLevel(packet, remainingWorklist, sourceAnchorExactPacket, boundedSourcePacket, args, errors)

  const expected = expectedRows(remainingWorklist)
  const expectedByAction = mapBy(expected, 'action_decision_id', errors, 'expected manual review rows')
  const items = packet.manual_review_items || []
  const itemByAction = mapBy(items, 'downstream_action_decision_id', errors, 'manual review packet rows')
  const sourceAnchorByAction = mapBy(sourceAnchorExactPacket.source_anchor_exact_evidence_items || [], 'downstream_action_decision_id', errors, 'source-anchor exact evidence packet')
  const boundedByAction = mapBy(boundedSourcePacket.bounded_source_evidence_items || [], 'downstream_action_decision_id', errors, 'bounded-source evidence packet')
  const stats = summarize(expected, sourceAnchorExactPacket, boundedSourcePacket)

  if (items.length !== expected.length) {
    errors.push(`packet rows ${items.length} must match expected manual review rows ${expected.length}`)
  }

  for (const actionId of sourceAnchorByAction.keys()) {
    if (boundedByAction.has(actionId)) errors.push(`${actionId} appears in both source evidence packets`)
  }

  for (const [actionId, remaining] of expectedByAction.entries()) {
    const item = itemByAction.get(actionId)
    const source = evidencePacketSource(remaining.source_downstream_action_batch)
    const sourceItem = source === 'source_anchor_exact_evidence_packet'
      ? sourceAnchorByAction.get(actionId)
      : boundedByAction.get(actionId)
    if (!item) {
      stats.missing_manual_review_items += 1
      errors.push(`${actionId} missing manual review packet item`)
      continue
    }
    if (source === 'unknown') {
      errors.push(`${actionId} has unsupported source_downstream_action_batch: ${remaining.source_downstream_action_batch}`)
      continue
    }
    if (!sourceItem) {
      errors.push(`${actionId} missing ${source} source item`)
      continue
    }
    validateRow(item, remaining, sourceItem, source, errors, stats, items.indexOf(item))
  }

  for (const actionId of itemByAction.keys()) {
    if (!expectedByAction.has(actionId)) {
      stats.extra_manual_review_items += 1
      errors.push(`${actionId} unexpected manual review packet item`)
    }
  }

  for (const actionId of sourceAnchorByAction.keys()) {
    const remaining = expectedByAction.get(actionId)
    if (!remaining || remaining.source_downstream_action_batch !== SOURCE_ANCHOR_BATCH) {
      errors.push(`${actionId} source-anchor exact item is not covered by source-anchor remaining row`)
    }
  }
  for (const actionId of boundedByAction.keys()) {
    const remaining = expectedByAction.get(actionId)
    if (!remaining || !BOUNDED_SOURCE_BATCHES.has(remaining.source_downstream_action_batch)) {
      errors.push(`${actionId} bounded-source item is not covered by bounded-source remaining row`)
    }
  }

  if (args.requireItems && !stats.audited_manual_review_items) {
    errors.push('requireItems is set but no manual review items were audited')
  }
  if (stats.audited_manual_review_items !== stats.expected_manual_review_items) {
    errors.push(`audited manual review items ${stats.audited_manual_review_items} must match expected ${stats.expected_manual_review_items}`)
  }
  if (stats.source_anchor_exact_evidence_items !== stats.expected_source_anchor_exact_evidence_items) {
    errors.push(`source-anchor exact evidence items ${stats.source_anchor_exact_evidence_items} must match expected ${stats.expected_source_anchor_exact_evidence_items}`)
  }
  if (stats.bounded_source_evidence_items !== stats.expected_bounded_source_evidence_items) {
    errors.push(`bounded-source evidence items ${stats.bounded_source_evidence_items} must match expected ${stats.expected_bounded_source_evidence_items}`)
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
    source_bounded_source_evidence_packet: args.boundedSourcePacket,
    source_post_candidate_remaining_worklist: args.remainingWorklist,
    source_source_anchor_exact_evidence_packet: args.sourceAnchorExactPacket,
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
