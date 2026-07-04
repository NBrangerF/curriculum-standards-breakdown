#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_REMAINING_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_EXACT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_BOUNDED_SOURCE_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_packet_anchor_domain_rejected_english_pe.md'

const SOURCE_ANCHOR_BATCH = 'source_anchor_evidence'
const BOUNDED_SOURCE_BATCHES = new Set(['source_row_confirmation', 'item_level_source_review'])

function parseArgs(argv) {
  const args = {
    boundedSourcePacket: DEFAULT_BOUNDED_SOURCE_PACKET,
    out: DEFAULT_OUT,
    remainingWorklist: DEFAULT_REMAINING_WORKLIST,
    requireItems: false,
    sourceAnchorExactPacket: DEFAULT_SOURCE_ANCHOR_EXACT_PACKET,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--remaining-worklist') args.remainingWorklist = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_packet.js \\
  --strict --require-items

Builds a read-only manual review packet that unifies all 67 post-candidate
remaining rows: 52 source-anchor exact evidence rows and 15 bounded-source
rows. It does not edit decisions, approve bridges, write public/data, or enable
matcher/publication.`)
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

function validateTopLevel(remainingWorklist, sourceAnchorExactPacket, boundedSourcePacket, args, errors) {
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

  if (sourceAnchorExactPacket.valid !== true) errors.push('source-anchor exact packet valid must be true')
  if (sourceAnchorExactPacket.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet') {
    errors.push('source-anchor exact packet purpose mismatch')
  }
  if (sourceAnchorExactPacket.exact_evidence_packet_only !== true) errors.push('source-anchor exact packet exact_evidence_packet_only must be true')
  if (sourceAnchorExactPacket.review_only !== true) errors.push('source-anchor exact packet review_only must be true')
  if (sourceAnchorExactPacket.source_post_candidate_remaining_worklist !== args.remainingWorklist) {
    errors.push('source-anchor exact packet source_post_candidate_remaining_worklist must match arg')
  }
  if (!Array.isArray(sourceAnchorExactPacket.source_anchor_exact_evidence_items)) {
    errors.push('source-anchor exact packet source_anchor_exact_evidence_items must be an array')
  }
  validatePolicy('source-anchor exact packet', sourceAnchorExactPacket, errors)

  if (boundedSourcePacket.valid !== true) errors.push('bounded-source packet valid must be true')
  if (boundedSourcePacket.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet') {
    errors.push('bounded-source packet purpose mismatch')
  }
  if (boundedSourcePacket.bounded_source_evidence_packet_only !== true) errors.push('bounded-source packet bounded_source_evidence_packet_only must be true')
  if (boundedSourcePacket.review_only !== true) errors.push('bounded-source packet review_only must be true')
  if (boundedSourcePacket.source_post_candidate_remaining_worklist !== args.remainingWorklist) {
    errors.push('bounded-source packet source_post_candidate_remaining_worklist must match arg')
  }
  if (!Array.isArray(boundedSourcePacket.bounded_source_evidence_items)) {
    errors.push('bounded-source packet bounded_source_evidence_items must be an array')
  }
  validatePolicy('bounded-source packet', boundedSourcePacket, errors)
}

function packetPolicy() {
  return {
    bounded_source_action_decision_must_be_edited_separately: true,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    manual_review_packet_is_not_reviewer_decision: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    requires_manual_confirmation_for_every_item: true,
    source_anchor_review_decision_must_be_edited_separately: true,
    writes_public_data: false
  }
}

function evidencePacketSource(batch) {
  if (batch === SOURCE_ANCHOR_BATCH) return 'source_anchor_exact_evidence_packet'
  if (BOUNDED_SOURCE_BATCHES.has(batch)) return 'bounded_source_evidence_packet'
  return 'unknown'
}

function evidenceLane(remaining, source) {
  if (source === 'source_anchor_exact_evidence_packet') return remaining.recommended_next_gate_after_candidate_filter || 'source_anchor_exact_review'
  if (remaining.source_downstream_action_batch === 'source_row_confirmation') return 'source_row_confirmation'
  if (remaining.source_downstream_action_batch === 'item_level_source_review') return 'item_level_source_review'
  return 'unknown'
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

function sourcePacketItemId(source, item) {
  return source === 'source_anchor_exact_evidence_packet'
    ? item.exact_anchor_evidence_packet_id || ''
    : item.bounded_source_evidence_packet_id || ''
}

function sourcePageStatus(source, item) {
  return source === 'source_anchor_exact_evidence_packet'
    ? item.page_evidence_status || ''
    : item.page_range_status || ''
}

function compactSourceContext(source, item) {
  if (source === 'source_anchor_exact_evidence_packet') {
    return {
      exact_activity_or_task: item.exact_activity_or_task || '',
      exact_evidence_note: item.exact_evidence_note || '',
      exact_evidence_quote: item.exact_evidence_quote || '',
      exact_page_reference: item.exact_page_reference || '',
      has_full_h4g_triplet_context: item.has_full_h4g_triplet_context === true,
      page_evidence_context: item.page_evidence_context || {},
      risk_profile: item.risk_profile || {},
      sibling_work_item_previews: item.sibling_work_item_previews || []
    }
  }
  return {
    evidence_profile: item.evidence_profile || {},
    page_range: item.page_range || '',
    page_range_status: item.page_range_status || '',
    required_confirmations_to_close: item.required_confirmations_to_close || [],
    review_questions: item.review_questions || [],
    topic_tags: item.topic_tags || {}
  }
}

function buildItem(remaining, packetItem, source, index) {
  return {
    anchor_requirement_summary: packetItem.anchor_requirement_summary || '',
    auto_approval: sourceAutoApproval(source, packetItem),
    downstream_action_decision_id: remaining.action_decision_id || '',
    evidence_lane: evidenceLane(remaining, source),
    evidence_packet_item_id: sourcePacketItemId(source, packetItem),
    evidence_packet_source: source,
    evidence_ready: sourceEvidenceReady(source, packetItem),
    grade_band: remaining.grade_band || '',
    inventory_bucket: remaining.inventory_bucket || '',
    inventory_item_id: remaining.inventory_item_id || '',
    manual_confirmation_lane: remaining.manual_confirmation_lane || '',
    manual_confirmation_required: true,
    manual_review_packet_item_id: `h4g_anchor_group_post_candidate_manual_review_${hashText(remaining.action_decision_id)}`,
    page_status: sourcePageStatus(source, packetItem),
    post_candidate_remaining_reason: remaining.post_candidate_remaining_reason || '',
    progression_group_id: remaining.progression_group_id || '',
    recommended_next_gate_after_candidate_filter: remaining.recommended_next_gate_after_candidate_filter || '',
    recommended_reviewer_decision: packetItem.recommended_reviewer_decision || remaining.recommended_reviewer_decision || '',
    recommendation_confidence: packetItem.recommendation_confidence || '',
    recommendation_requires_manual_confirmation: packetItem.recommendation_requires_manual_confirmation === true,
    remaining_worklist_rank: remaining.remaining_worklist_rank,
    review_bucket: packetItem.review_bucket || remaining.inventory_bucket || '',
    review_grain: packetItem.review_grain || '',
    risk_signals: packetItem.risk_signals || remaining.risk_signals || [],
    source_batch: remaining.source_batch || packetItem.source_batch || '',
    source_batch_item_id: remaining.source_batch_item_id || packetItem.source_batch_item_id || '',
    source_context: compactSourceContext(source, packetItem),
    source_decision_status: sourceDecisionStatus(source, packetItem),
    source_downstream_action_batch: remaining.source_downstream_action_batch || '',
    source_downstream_action_item_id: remaining.source_downstream_action_item_id || '',
    source_key: remaining.source_key || '',
    source_reviewer_decision: sourceReviewerDecision(source, packetItem),
    source_standard_context: packetItem.source_standard_context || {},
    standard_code: remaining.standard_code || '',
    subject_slug: remaining.subject_slug || '',
    target_grade_band: remaining.target_grade_band || '',
    target_standard_code: remaining.target_standard_code || packetItem.target_standard_code || '',
    unit_context: packetItem.unit_context || {},
    unit_evidence_id: remaining.unit_evidence_id || packetItem.unit_evidence_id || '',
    unit_title: remaining.unit_title || packetItem.unit_title || '',
    worklist_rank: index + 1,
    writes_public_data: false
  }
}

function buildRows(remainingWorklist, sourceAnchorExactPacket, boundedSourcePacket, errors) {
  const sourceAnchorByAction = mapBy(sourceAnchorExactPacket.source_anchor_exact_evidence_items || [], 'downstream_action_decision_id', errors, 'source-anchor exact evidence packet')
  const boundedByAction = mapBy(boundedSourcePacket.bounded_source_evidence_items || [], 'downstream_action_decision_id', errors, 'bounded-source evidence packet')
  const rows = []
  for (const remaining of remainingWorklist.post_candidate_remaining_work_items || []) {
    const source = evidencePacketSource(remaining.source_downstream_action_batch)
    const packetItem = source === 'source_anchor_exact_evidence_packet'
      ? sourceAnchorByAction.get(remaining.action_decision_id)
      : boundedByAction.get(remaining.action_decision_id)
    if (source === 'unknown') errors.push(`${remaining.action_decision_id} has unsupported source_downstream_action_batch: ${remaining.source_downstream_action_batch}`)
    if (!packetItem) {
      errors.push(`${remaining.action_decision_id} missing ${source} item`)
      continue
    }
    rows.push(buildItem(remaining, packetItem, source, rows.length))
  }
  return rows
}

function summarize(rows, remainingWorklist, sourceAnchorExactPacket, boundedSourcePacket) {
  const summary = {
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
    expected_manual_review_items: remainingWorklist.summary?.post_candidate_remaining_work_items || (remainingWorklist.post_candidate_remaining_work_items || []).length,
    expected_source_anchor_exact_evidence_items: sourceAnchorExactPacket.summary?.source_anchor_exact_evidence_items || 0,
    item_level_source_review_items: 0,
    manual_confirmation_required_items: 0,
    manual_review_items: rows.length,
    pending_review_items: 0,
    source_anchor_exact_evidence_items: 0,
    source_row_confirmation_items: 0,
    text_extracted_items: 0,
    unique_action_decisions: sorted(rows.map(row => row.downstream_action_decision_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    if (row.evidence_packet_source === 'source_anchor_exact_evidence_packet') summary.source_anchor_exact_evidence_items += 1
    if (row.evidence_packet_source === 'bounded_source_evidence_packet') summary.bounded_source_evidence_items += 1
    if (row.source_downstream_action_batch === 'source_row_confirmation') summary.source_row_confirmation_items += 1
    if (row.source_downstream_action_batch === 'item_level_source_review') summary.item_level_source_review_items += 1
    if (row.manual_confirmation_required) summary.manual_confirmation_required_items += 1
    if (row.evidence_ready) summary.evidence_ready_items += 1
    if (row.page_status === 'text_extracted') summary.text_extracted_items += 1
    if (row.auto_approval) summary.auto_approval_items += 1
    if (
      (row.evidence_packet_source === 'source_anchor_exact_evidence_packet' && row.source_decision_status === 'pending' && row.source_reviewer_decision === 'pending') ||
      (row.evidence_packet_source === 'bounded_source_evidence_packet' && row.source_decision_status === 'pending_review' && row.source_reviewer_decision === 'pending')
    ) {
      summary.pending_review_items += 1
    }
    countInto(summary.by_decision_status, row.source_decision_status)
    countInto(summary.by_evidence_lane, row.evidence_lane)
    countInto(summary.by_evidence_packet_source, row.evidence_packet_source)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_manual_confirmation_lane, row.manual_confirmation_lane)
    countInto(summary.by_page_status, row.page_status)
    countInto(summary.by_post_candidate_remaining_reason, row.post_candidate_remaining_reason)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_review_bucket, row.review_bucket)
    countInto(summary.by_reviewer_decision, row.source_reviewer_decision)
    countInto(summary.by_source_downstream_action_batch, row.source_downstream_action_batch)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 40).map(row => (
    `| ${row.worklist_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.evidence_packet_source)} | ${markdownCell(row.evidence_lane)} | ${markdownCell(row.standard_code)} | ${truncate(row.unit_title, 70)} |`
  )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Manual Review Packet

Generated at: ${payload.generated_at}

This read-only packet unifies every post-candidate remaining English/PE row
into one manual review entry point. It does not edit reviewer decisions,
approve bridges, write public/data, or enable matcher/publication.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| manual review items | ${payload.summary.manual_review_items} |
| expected manual review items | ${payload.summary.expected_manual_review_items} |
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

## Grades

| grade | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Preview

| rank | subject | grade | packet source | lane | standard | unit |
| ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.manual_review_items)}

## Guardrails

- Packet rows are not reviewer decisions.
- Every row still requires manual confirmation.
- Exact-anchor and bounded-source decisions stay in their original editable templates.
- Matcher and publication gates remain separate.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    boundedSourcePacket: args.boundedSourcePacket,
    remainingWorklist: args.remainingWorklist,
    sourceAnchorExactPacket: args.sourceAnchorExactPacket
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const remainingWorklist = existsSync(args.remainingWorklist) ? readJson(args.remainingWorklist) : { post_candidate_remaining_work_items: [] }
  const sourceAnchorExactPacket = existsSync(args.sourceAnchorExactPacket) ? readJson(args.sourceAnchorExactPacket) : { source_anchor_exact_evidence_items: [] }
  const boundedSourcePacket = existsSync(args.boundedSourcePacket) ? readJson(args.boundedSourcePacket) : { bounded_source_evidence_items: [] }
  if (!errors.length) validateTopLevel(remainingWorklist, sourceAnchorExactPacket, boundedSourcePacket, args, errors)
  const rows = buildRows(remainingWorklist, sourceAnchorExactPacket, boundedSourcePacket, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no manual review rows were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    manual_review_items: rows,
    manual_review_packet_only: true,
    matcher_ready: false,
    packet_policy: packetPolicy(),
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_packet',
    review_only: true,
    source_bounded_source_evidence_packet: args.boundedSourcePacket,
    source_post_candidate_remaining_worklist: args.remainingWorklist,
    source_source_anchor_exact_evidence_packet: args.sourceAnchorExactPacket,
    summary: summarize(rows, remainingWorklist, sourceAnchorExactPacket, boundedSourcePacket),
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
