#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_CONFIRMATION_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_BOUNDED_SOURCE_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_MANUAL_CONFIRMATION_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_evidence_packet_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_evidence_packet_anchor_domain_rejected_english_pe_audit.md'
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])

function parseArgs(argv) {
  const args = {
    boundedSourcePacket: DEFAULT_BOUNDED_SOURCE_PACKET,
    confirmationWorklist: DEFAULT_CONFIRMATION_WORKLIST,
    manualConfirmationWorklist: DEFAULT_MANUAL_CONFIRMATION_WORKLIST,
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    requireBodyText: false,
    requireItems: false,
    requireText: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
    else if (item === '--confirmation-worklist') args.confirmationWorklist = argv[++i]
    else if (item === '--bounded-source-packet') args.boundedSourcePacket = argv[++i]
    else if (item === '--manual-confirmation-worklist') args.manualConfirmationWorklist = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-body-text') args.requireBodyText = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--require-text') args.requireText = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_evidence_packet.js \\
  --strict --require-items --require-text --require-body-text

Audits the focused manual confirmation evidence packet against the confirmation
worklist and bounded-source packet. The packet is reviewer evidence only; it is
not a decision, matcher gate, or publication gate.`)
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

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
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

function packetPolicy() {
  return {
    changes_official_standard_text: false,
    confirmation_evidence_packet_is_not_reviewer_decision: true,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    publication_ready: false,
    requires_bounded_source_confirmation: true,
    requires_later_h4g_grade_distinctiveness_check: true,
    requires_later_manual_decision_edit: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function validatePacketPolicy(label, policy, errors) {
  for (const key of [
    'confirmation_evidence_packet_is_not_reviewer_decision',
    'requires_bounded_source_confirmation',
    'requires_later_h4g_grade_distinctiveness_check',
    'requires_later_manual_decision_edit',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function validateTopLevel(packet, confirmationWorklist, boundedSourcePacket, manualConfirmationWorklist, args, errors) {
  if (packet.valid !== true) errors.push('packet valid must be true')
  if ((packet.errors || []).length) errors.push('packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_evidence_packet') {
    errors.push('packet purpose mismatch')
  }
  if (packet.confirmation_evidence_packet_only !== true) errors.push('packet confirmation_evidence_packet_only must be true')
  if (packet.review_only !== true) errors.push('packet review_only must be true')
  if (packet.source_confirmation_worklist !== args.confirmationWorklist) errors.push('packet source_confirmation_worklist must match audit arg')
  if (packet.source_bounded_source_packet !== args.boundedSourcePacket) errors.push('packet source_bounded_source_packet must match audit arg')
  if (packet.source_manual_confirmation_worklist !== args.manualConfirmationWorklist) {
    errors.push('packet source_manual_confirmation_worklist must match audit arg')
  }
  if (!Array.isArray(packet.confirmation_evidence_items)) errors.push('packet confirmation_evidence_items must be an array')
  validatePolicy('packet', packet, errors)
  validatePacketPolicy('packet policy', packet.packet_policy || {}, errors)

  if (confirmationWorklist.valid !== true) errors.push('confirmation worklist valid must be true')
  if ((confirmationWorklist.errors || []).length) errors.push('confirmation worklist errors must be empty')
  if (confirmationWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_worklist') {
    errors.push('confirmation worklist purpose mismatch')
  }
  if (!Array.isArray(confirmationWorklist.confirmation_work_items)) {
    errors.push('confirmation worklist confirmation_work_items must be an array')
  }
  validatePolicy('confirmation worklist', confirmationWorklist, errors)

  if (boundedSourcePacket.valid !== true) errors.push('bounded-source packet valid must be true')
  if ((boundedSourcePacket.errors || []).length) errors.push('bounded-source packet errors must be empty')
  if (boundedSourcePacket.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet') {
    errors.push('bounded-source packet purpose mismatch')
  }
  if (!Array.isArray(boundedSourcePacket.bounded_source_evidence_items)) {
    errors.push('bounded-source packet bounded_source_evidence_items must be an array')
  }
  validatePolicy('bounded-source packet', boundedSourcePacket, errors)

  if (manualConfirmationWorklist.valid !== true) errors.push('manual confirmation worklist valid must be true')
  if ((manualConfirmationWorklist.errors || []).length) errors.push('manual confirmation worklist errors must be empty')
  if (manualConfirmationWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist') {
    errors.push('manual confirmation worklist purpose mismatch')
  }
  if (!Array.isArray(manualConfirmationWorklist.manual_confirmation_work_items)) {
    errors.push('manual confirmation worklist manual_confirmation_work_items must be an array')
  }
  validatePolicy('manual confirmation worklist', manualConfirmationWorklist, errors)
}

function compactSibling(row) {
  return {
    grade_band: row.grade_band || '',
    inventory_bucket: row.inventory_bucket || '',
    manual_confirmation_lane: row.manual_confirmation_lane || '',
    recommended_reviewer_decision: row.recommended_reviewer_decision || '',
    source_downstream_action_batch: row.source_downstream_action_batch || '',
    source_key: row.source_key || '',
    standard_code: row.standard_code || '',
    target_grade_band: row.target_grade_band || row.grade_band || '',
    target_standard_code: row.target_standard_code || row.standard_code || '',
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || '',
    worklist_rank: row.worklist_rank || 0
  }
}

function rowsByProgression(rows) {
  const out = new Map()
  for (const row of rows || []) {
    if (!row.progression_group_id) continue
    if (!out.has(row.progression_group_id)) out.set(row.progression_group_id, [])
    out.get(row.progression_group_id).push(row)
  }
  return out
}

function siblingContext(row, byProgression) {
  const rows = byProgression.get(row.progression_group_id) || []
  const siblings = rows.map(compactSibling).sort((a, b) =>
    String(a.grade_band).localeCompare(String(b.grade_band)) ||
    String(a.standard_code).localeCompare(String(b.standard_code)) ||
    String(a.unit_evidence_id).localeCompare(String(b.unit_evidence_id)) ||
    Number(a.worklist_rank || 0) - Number(b.worklist_rank || 0))
  const gradeBands = sorted(siblings.map(item => item.grade_band).filter(grade => TARGET_GRADE_BANDS.has(grade)))
  return {
    has_full_h4g_triplet_context: ['H4G7', 'H4G8', 'H4G9'].every(grade => gradeBands.includes(grade)),
    same_progression_group_grade_bands: gradeBands,
    same_progression_group_standard_codes: sorted(siblings.map(item => item.standard_code)),
    sibling_h4g_grade_count: gradeBands.length,
    sibling_work_items: siblings
  }
}

function packetItemId(row) {
  return `h4g_anchor_group_post_candidate_manual_review_confirmation_evidence_${hashText(row.confirmation_work_item_id || row.decision_id)}`
}

function pageRangeFrom(workItem, boundedItem) {
  return workItem.source_context?.page_range || boundedItem.page_range || ''
}

function pageRangeStatusFrom(workItem, boundedItem) {
  return workItem.source_context?.page_range_status || boundedItem.page_range_status || workItem.page_status || ''
}

function staticFields(workItem, boundedItem, byProgression) {
  const sibling = siblingContext(workItem, byProgression)
  return {
    anchor_requirement_summary: boundedItem.anchor_requirement_summary || '',
    bounded_source_evidence_packet_id: boundedItem.bounded_source_evidence_packet_id || workItem.evidence_packet_item_id || '',
    bridge_score: Number(boundedItem.bridge_score || 0),
    confirmation_evidence_packet_item_id: packetItemId(workItem),
    confirmation_evidence_packet_only: true,
    confirmation_work_item_id: workItem.confirmation_work_item_id || '',
    decision_id: workItem.decision_id || '',
    downstream_action_decision_id: workItem.downstream_action_decision_id || '',
    evidence_lane: workItem.evidence_lane || boundedItem.evidence_lane || '',
    evidence_packet_source: workItem.evidence_packet_source || '',
    evidence_profile: boundedItem.evidence_profile || {},
    grade_band: workItem.grade_band || '',
    has_full_h4g_triplet_context: sibling.has_full_h4g_triplet_context,
    inventory_bucket: workItem.inventory_bucket || boundedItem.inventory_bucket || '',
    inventory_item_id: boundedItem.inventory_item_id || '',
    manual_confirmation_lane: workItem.manual_confirmation_lane || boundedItem.manual_confirmation_lane || '',
    manual_confirmation_required: true,
    manual_review_packet_item_id: workItem.manual_review_packet_item_id || '',
    missing_required_confirmations: workItem.missing_required_confirmations || [],
    page_range: pageRangeFrom(workItem, boundedItem),
    page_range_status: pageRangeStatusFrom(workItem, boundedItem),
    post_candidate_manual_review_recommendation_id: workItem.post_candidate_manual_review_recommendation_id || '',
    progression_group_id: workItem.progression_group_id || '',
    recommendation_confidence: workItem.recommendation_confidence || boundedItem.recommendation_confidence || '',
    recommendation_route: workItem.recommendation_route || '',
    recommended_reviewer_decision_to_consider: workItem.recommended_reviewer_decision_to_consider || '',
    required_confirmations_to_close: boundedItem.required_confirmations_to_close || [],
    review_only: true,
    review_questions: workItem.review_questions || boundedItem.review_questions || [],
    review_work_item_is_not_decision: workItem.review_work_item_is_not_decision === true,
    reviewer_action: workItem.reviewer_action || '',
    risk_signals: boundedItem.risk_signals || [],
    same_progression_group_grade_bands: sibling.same_progression_group_grade_bands,
    same_progression_group_standard_codes: sibling.same_progression_group_standard_codes,
    sibling_h4g_grade_count: sibling.sibling_h4g_grade_count,
    sibling_work_items: sibling.sibling_work_items,
    source_context: workItem.source_context || {},
    source_downstream_action_batch: workItem.source_downstream_action_batch || '',
    source_downstream_action_item_id: workItem.source_downstream_action_item_id || '',
    source_key: workItem.source_key || '',
    source_standard_context: workItem.source_standard_context || boundedItem.source_standard_context || {},
    standard_code: workItem.standard_code || '',
    subject_slug: workItem.subject_slug || '',
    target_grade_band: workItem.target_grade_band || workItem.grade_band || '',
    target_standard_code: workItem.target_standard_code || boundedItem.target_standard_code || workItem.standard_code || '',
    topic_tags: boundedItem.topic_tags || {},
    unit_context: workItem.unit_context || boundedItem.unit_context || {},
    unit_evidence_id: workItem.unit_evidence_id || boundedItem.unit_evidence_id || '',
    unit_title: workItem.unit_title || boundedItem.unit_title || '',
    worklist_rank: workItem.worklist_rank || 0
  }
}

function validateItem(item, workItem, boundedItem, byProgression, errors, stats) {
  const prefix = item.confirmation_evidence_packet_item_id || workItem.confirmation_work_item_id || '(confirmation evidence item)'
  validatePolicy(prefix, item, errors)
  validatePacketPolicy(`${prefix} page_evidence_policy`, item.page_evidence_policy || {}, errors)
  for (const [key, expected] of Object.entries(staticFields(workItem, boundedItem, byProgression))) {
    if (!sameJson(item[key], expected)) errors.push(`${prefix} ${key} mismatch`)
  }
  if (!Array.isArray(item.pdf_pages)) errors.push(`${prefix} pdf_pages must be an array`)
  if (!Array.isArray(item.page_text_excerpts)) errors.push(`${prefix} page_text_excerpts must be an array`)
  if ((item.pdf_pages || []).length !== (item.page_text_excerpts || []).length) {
    errors.push(`${prefix} pdf_pages length must match page_text_excerpts length`)
  }
  const allowedStatuses = ['text_extracted', 'empty_text', 'extract_failed', 'missing_pdf_cache', 'missing_pdf_page_hint']
  if (!allowedStatuses.includes(item.page_evidence_status)) errors.push(`${prefix} page_evidence_status invalid`)
  const allowedHintSources = [
    'unit_index_page_start_override_pdf_page',
    'unit_index_body_pdf_page',
    'unit_index_pdf_page_hint',
    'unit_index_without_pdf_page_hint',
    'pdf_title_text_search',
    'pdf_title_text_search_after_toc_hint',
    'pdf_toc_title_search_needs_body_page_review',
    'printed_page_range_as_pdf_page_unverified',
    'missing_unit_index'
  ]
  if (!allowedHintSources.includes(item.page_hint_source)) errors.push(`${prefix} page_hint_source invalid`)
  const allowedHintConfidence = ['unit_index_backed', 'title_search_backed', 'low_unverified', 'missing']
  if (!allowedHintConfidence.includes(item.page_hint_confidence)) errors.push(`${prefix} page_hint_confidence invalid`)
  const allowedPageQualities = ['body_text_ready', 'toc_only', 'empty_text', 'extract_failed', 'missing_pdf_cache', 'missing_pdf_page_hint', 'no_body_text']
  if (!allowedPageQualities.includes(item.selected_page_quality)) errors.push(`${prefix} selected_page_quality invalid`)
  if (typeof item.body_text_ready !== 'boolean') errors.push(`${prefix} body_text_ready must be boolean`)
  for (const field of ['empty_page_count', 'extracted_page_count', 'nonempty_body_text_page_count', 'toc_like_page_count']) {
    if (!Number.isInteger(Number(item[field])) || Number(item[field]) < 0) errors.push(`${prefix} ${field} must be a non-negative integer`)
  }
  for (const page of item.page_text_excerpts || []) {
    if (typeof page.is_toc_like !== 'boolean') errors.push(`${prefix} page ${page.pdf_page || '(missing page)'} is_toc_like must be boolean`)
  }
  const nonemptyBodyPages = (item.page_text_excerpts || []).filter(page =>
    page.status === 'text_extracted' &&
    Number(page.text_chars || 0) > 0 &&
    page.is_toc_like !== true
  )
  if (item.body_text_ready && item.selected_page_quality !== 'body_text_ready') {
    errors.push(`${prefix} body_text_ready must use selected_page_quality=body_text_ready`)
  }
  if (item.body_text_ready && !nonemptyBodyPages.length) {
    errors.push(`${prefix} body_text_ready must include a non-TOC non-empty page excerpt`)
  }
  if (item.page_evidence_status === 'text_extracted') {
    if (!(item.page_text_excerpts || []).some(page => page.status === 'text_extracted' && Number(page.text_chars || 0) > 0)) {
      errors.push(`${prefix} text_extracted must include a non-empty page excerpt`)
    }
    if (item.ready_for_manual_review !== item.body_text_ready) {
      errors.push(`${prefix} ready_for_manual_review must match body_text_ready when text is extracted`)
    }
  } else if (item.ready_for_manual_review !== false) {
    errors.push(`${prefix} non-text_extracted item must not be ready_for_manual_review`)
  }

  stats.audited_confirmation_evidence_items += 1
  if (item.ready_for_manual_review) stats.ready_for_manual_review_items += 1
  if (item.body_text_ready) stats.body_text_ready_items += 1
  if (item.page_evidence_status === 'text_extracted') stats.text_extracted_items += 1
}

function summarizeRows(rows, confirmationWorklist) {
  const summary = {
    by_evidence_lane: {},
    by_grade_band: {},
    by_manual_confirmation_lane: {},
    by_page_evidence_status: {},
    by_page_hint_confidence: {},
    by_page_hint_source: {},
    by_page_range_status: {},
    by_selected_page_quality: {},
    by_recommendation: {},
    by_sibling_grade_context: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    body_text_ready_items: 0,
    confirmation_evidence_items: rows.length,
    expected_confirmation_evidence_items: Number(confirmationWorklist.summary?.confirmation_work_items || 0),
    full_h4g_triplet_context_items: 0,
    item_level_confirmation_items: 0,
    partial_h4g_context_items: 0,
    ready_for_manual_review_items: 0,
    source_row_confirmation_items: 0,
    text_extracted_items: 0,
    title_search_page_hint_items: 0,
    toc_hint_fallback_items: 0,
    toc_only_items: 0,
    unit_index_found_items: 0,
    unique_action_decisions: sorted(rows.map(row => row.downstream_action_decision_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_textbook_evidence_ids: sorted(rows.map(row => row.textbook_evidence_id)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length,
    unverified_printed_page_hint_items: 0
  }
  for (const row of rows) {
    if (row.ready_for_manual_review) summary.ready_for_manual_review_items += 1
    if (row.body_text_ready) summary.body_text_ready_items += 1
    if (row.page_evidence_status === 'text_extracted') summary.text_extracted_items += 1
    if (['pdf_title_text_search', 'pdf_title_text_search_after_toc_hint'].includes(row.page_hint_source)) summary.title_search_page_hint_items += 1
    if (row.page_hint_source === 'pdf_title_text_search_after_toc_hint') summary.toc_hint_fallback_items += 1
    if (row.selected_page_quality === 'toc_only') summary.toc_only_items += 1
    if (row.page_hint_source === 'printed_page_range_as_pdf_page_unverified') summary.unverified_printed_page_hint_items += 1
    if (row.unit_index_found) summary.unit_index_found_items += 1
    if (row.has_full_h4g_triplet_context) summary.full_h4g_triplet_context_items += 1
    else summary.partial_h4g_context_items += 1
    if (row.source_downstream_action_batch === 'source_row_confirmation') summary.source_row_confirmation_items += 1
    if (row.source_downstream_action_batch === 'item_level_source_review') summary.item_level_confirmation_items += 1
    countInto(summary.by_evidence_lane, row.evidence_lane)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_manual_confirmation_lane, row.manual_confirmation_lane)
    countInto(summary.by_page_evidence_status, row.page_evidence_status)
    countInto(summary.by_page_hint_confidence, row.page_hint_confidence)
    countInto(summary.by_page_hint_source, row.page_hint_source)
    countInto(summary.by_page_range_status, row.page_range_status)
    countInto(summary.by_selected_page_quality, row.selected_page_quality)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision_to_consider)
    countInto(summary.by_sibling_grade_context, (row.same_progression_group_grade_bands || []).join('+') || 'missing')
    countInto(summary.by_source_downstream_action_batch, row.source_downstream_action_batch)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Manual Review Confirmation Evidence Packet Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected confirmation evidence items | ${payload.summary.expected_confirmation_evidence_items} |
| audited confirmation evidence items | ${payload.summary.audited_confirmation_evidence_items} |
| missing confirmation evidence items | ${payload.summary.missing_confirmation_evidence_items} |
| extra confirmation evidence items | ${payload.summary.extra_confirmation_evidence_items} |
| text extracted items | ${payload.summary.text_extracted_items} |
| body-text-ready items | ${payload.summary.body_text_ready_items} |
| ready for manual review items | ${payload.summary.ready_for_manual_review_items} |
| TOC-only items | ${payload.summary.toc_only_items} |
| TOC hint fallback items | ${payload.summary.toc_hint_fallback_items} |
| require text | ${payload.require_text} |
| require body text | ${payload.require_body_text} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Evidence Status

| status | rows |
| --- | ---: |
${countRows(payload.summary.by_page_evidence_status)}

## Selected Page Quality

| quality | rows |
| --- | ---: |
${countRows(payload.summary.by_selected_page_quality)}

## Sibling Grade Context

| context | rows |
| --- | ---: |
${countRows(payload.summary.by_sibling_grade_context)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    boundedSourcePacket: args.boundedSourcePacket,
    confirmationWorklist: args.confirmationWorklist,
    manualConfirmationWorklist: args.manualConfirmationWorklist,
    packet: args.packet
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const packet = existsSync(args.packet) ? readJson(args.packet) : { confirmation_evidence_items: [] }
  const confirmationWorklist = existsSync(args.confirmationWorklist) ? readJson(args.confirmationWorklist) : { confirmation_work_items: [] }
  const boundedSourcePacket = existsSync(args.boundedSourcePacket) ? readJson(args.boundedSourcePacket) : { bounded_source_evidence_items: [] }
  const manualConfirmationWorklist = existsSync(args.manualConfirmationWorklist) ? readJson(args.manualConfirmationWorklist) : { manual_confirmation_work_items: [] }
  if (!errors.length) validateTopLevel(packet, confirmationWorklist, boundedSourcePacket, manualConfirmationWorklist, args, errors)

  const items = packet.confirmation_evidence_items || []
  const workItems = confirmationWorklist.confirmation_work_items || []
  const boundedByAction = mapBy(boundedSourcePacket.bounded_source_evidence_items || [], 'downstream_action_decision_id', errors, 'bounded-source packet')
  const itemsByWorkItem = mapBy(items, 'confirmation_work_item_id', errors, 'packet')
  const workItemsById = mapBy(workItems, 'confirmation_work_item_id', errors, 'confirmation worklist')
  const byProgression = rowsByProgression(manualConfirmationWorklist.manual_confirmation_work_items || [])
  const packetRowSummary = summarizeRows(items, confirmationWorklist)
  if (!sameJson(packet.summary || {}, packetRowSummary)) errors.push('packet summary does not match confirmation evidence items')

  const stats = {
    ...packetRowSummary,
    audited_confirmation_evidence_items: 0,
    extra_confirmation_evidence_items: 0,
    missing_confirmation_evidence_items: 0
  }
  stats.ready_for_manual_review_items = 0
  stats.body_text_ready_items = 0
  stats.text_extracted_items = 0

  if (items.length !== workItems.length) errors.push(`packet rows ${items.length} must match worklist rows ${workItems.length}`)
  for (const [workItemId, workItem] of workItemsById.entries()) {
    const item = itemsByWorkItem.get(workItemId)
    const boundedItem = boundedByAction.get(workItem.downstream_action_decision_id)
    if (!boundedItem) {
      errors.push(`${workItem.downstream_action_decision_id} missing bounded-source packet item`)
      continue
    }
    if (!item) {
      stats.missing_confirmation_evidence_items += 1
      errors.push(`${workItemId} missing confirmation evidence item`)
      continue
    }
    validateItem(item, workItem, boundedItem, byProgression, errors, stats)
  }
  for (const workItemId of itemsByWorkItem.keys()) {
    if (!workItemsById.has(workItemId)) {
      stats.extra_confirmation_evidence_items += 1
      errors.push(`${workItemId} unexpected confirmation evidence item`)
    }
  }
  if (args.requireItems && !stats.audited_confirmation_evidence_items) {
    errors.push('requireItems is set but no confirmation evidence items were audited')
  }
  if (stats.audited_confirmation_evidence_items !== stats.expected_confirmation_evidence_items) {
    errors.push(`audited confirmation evidence items ${stats.audited_confirmation_evidence_items} must match expected ${stats.expected_confirmation_evidence_items}`)
  }
  if (args.requireText && stats.text_extracted_items !== stats.expected_confirmation_evidence_items) {
    errors.push(`requireText is set but text_extracted_items ${stats.text_extracted_items} does not match expected ${stats.expected_confirmation_evidence_items}`)
  }
  if (args.requireBodyText && stats.body_text_ready_items !== stats.expected_confirmation_evidence_items) {
    errors.push(`requireBodyText is set but body_text_ready_items ${stats.body_text_ready_items} does not match expected ${stats.expected_confirmation_evidence_items}`)
  }

  return {
    bounded_source_packet: args.boundedSourcePacket,
    changes_official_standard_text: false,
    confirmation_worklist: args.confirmationWorklist,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    manual_confirmation_worklist: args.manualConfirmationWorklist,
    matcher_ready: false,
    packet: args.packet,
    publication_ready: false,
    require_body_text: args.requireBodyText,
    require_items: args.requireItems,
    require_text: args.requireText,
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
