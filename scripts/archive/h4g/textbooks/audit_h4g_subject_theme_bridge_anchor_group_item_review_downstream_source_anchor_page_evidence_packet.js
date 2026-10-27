#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe_audit.md'
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
    else if (item === '--worklist') args.worklist = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet.js \\
  --packet generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the downstream source-anchor page evidence packet against the exact
review worklist. The packet is reviewer evidence only; it is not a source
anchor approval, downstream action decision, matcher gate, or publication gate.`)
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
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    page_evidence_packet_is_not_review_decision: true,
    publication_ready: false,
    requires_later_downstream_action_decision_edit: true,
    requires_later_item_level_source_review: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    requires_later_source_anchor_review_decision: true,
    writes_public_data: false
  }
}

function validatePacketPolicy(label, policy, errors) {
  for (const key of [
    'page_evidence_packet_is_not_review_decision',
    'requires_later_downstream_action_decision_edit',
    'requires_later_item_level_source_review',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_later_source_anchor_review_decision'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function validateTopLevel(packet, worklist, args, errors) {
  if (packet.valid !== true) errors.push('packet valid must be true')
  if ((packet.errors || []).length) errors.push('packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet') {
    errors.push('packet purpose mismatch')
  }
  if (packet.page_evidence_packet_only !== true) errors.push('packet page_evidence_packet_only must be true')
  if (packet.source_downstream_source_anchor_review_worklist !== args.worklist) {
    errors.push('packet source_downstream_source_anchor_review_worklist must match audit arg')
  }
  validatePolicy('packet', packet, errors)
  validatePacketPolicy('packet page_evidence_policy', packet.page_evidence_policy || {}, errors)
  if (!Array.isArray(packet.page_evidence_items)) errors.push('packet page_evidence_items must be an array')

  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if ((worklist.errors || []).length) errors.push('worklist errors must be empty')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist') {
    errors.push('worklist purpose mismatch')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  validatePolicy('worklist', worklist, errors)
  if (!Array.isArray(worklist.downstream_source_anchor_review_work_items)) {
    errors.push('worklist downstream_source_anchor_review_work_items must be an array')
  }
}

function packetItemId(row) {
  return `h4g_anchor_group_downstream_source_anchor_page_evidence_${hashText(row.work_item_id)}`
}

function compactSibling(row) {
  return {
    grade_band: row.grade_band || '',
    page_range: row.page_range || '',
    page_range_status: row.page_range_status || '',
    primary_review_bucket: row.primary_review_bucket || '',
    review_lane: row.review_lane || '',
    risk_signals: row.risk_signals || [],
    source_batch: row.source_batch || '',
    standard_code: row.standard_code || '',
    target_standard_code: row.target_standard_code || row.standard_code || '',
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || '',
    work_item_id: row.work_item_id || ''
  }
}

function rowsByProgression(workItems) {
  const out = new Map()
  for (const row of workItems || []) {
    if (!out.has(row.progression_group_id)) out.set(row.progression_group_id, [])
    out.get(row.progression_group_id).push(row)
  }
  return out
}

function siblingContext(row, byProgression) {
  const rows = byProgression.get(row.progression_group_id) || []
  const siblings = rows.map(compactSibling).sort((a, b) =>
    String(a.grade_band).localeCompare(String(b.grade_band)) ||
    String(a.target_standard_code).localeCompare(String(b.target_standard_code)) ||
    String(a.unit_evidence_id).localeCompare(String(b.unit_evidence_id)) ||
    String(a.work_item_id).localeCompare(String(b.work_item_id)))
  const gradeBands = sorted(siblings.map(item => item.grade_band).filter(grade => TARGET_GRADE_BANDS.has(grade)))
  return {
    has_full_h4g_triplet_context: ['H4G7', 'H4G8', 'H4G9'].every(grade => gradeBands.includes(grade)),
    same_progression_group_grade_bands: gradeBands,
    sibling_h4g_grade_count: gradeBands.length,
    sibling_work_items: siblings
  }
}

function staticFields(workItem, byProgression) {
  const sibling = siblingContext(workItem, byProgression)
  return {
    anchor_requirement_summary: workItem.anchor_requirement_summary || '',
    anchor_type: workItem.anchor_type || '',
    downstream_action_decision_id: workItem.downstream_action_decision_id || '',
    evidence_packet_item_id: packetItemId(workItem),
    evidence_packet_only: true,
    grade_band: workItem.grade_band || '',
    has_full_h4g_triplet_context: sibling.has_full_h4g_triplet_context,
    inventory_item_id: workItem.inventory_item_id || '',
    item_review_surface: workItem.item_review_surface || '',
    manual_review_required: true,
    page_range: workItem.page_range || '',
    page_range_status: workItem.page_range_status || '',
    primary_review_bucket: workItem.primary_review_bucket || '',
    progression_group_id: workItem.progression_group_id || '',
    recommended_disposition: workItem.recommended_disposition || '',
    review_grain: workItem.review_grain || '',
    review_lane: workItem.review_lane || '',
    risk_profile: workItem.risk_profile || {},
    risk_signals: workItem.risk_signals || [],
    same_progression_group_grade_bands: sibling.same_progression_group_grade_bands,
    sibling_h4g_grade_count: sibling.sibling_h4g_grade_count,
    sibling_work_items: sibling.sibling_work_items,
    source_anchor_evidence_item_id: workItem.source_anchor_evidence_item_id || '',
    source_anchor_review_item_ids: workItem.source_anchor_review_item_ids || [],
    source_batch: workItem.source_batch || '',
    source_batch_item_id: workItem.source_batch_item_id || '',
    source_downstream_source_anchor_review_work_item_id: workItem.work_item_id || '',
    source_key: workItem.source_key || '',
    source_standard_context: workItem.source_standard_context || {},
    standard_code: workItem.standard_code || '',
    subject_slug: workItem.subject_slug || '',
    target_standard_code: workItem.target_standard_code || workItem.standard_code || '',
    textbook_evidence_id: workItem.unit_context?.textbook_evidence_id || '',
    unit_context: workItem.unit_context || {},
    unit_evidence_id: workItem.unit_evidence_id || '',
    unit_title: workItem.unit_title || ''
  }
}

function validateItem(workItem, item, byProgression, errors, stats) {
  const prefix = item.evidence_packet_item_id || workItem.work_item_id || '(page evidence item)'
  validatePolicy(prefix, item, errors)
  validatePacketPolicy(`${prefix} page_evidence_policy`, item.page_evidence_policy || {}, errors)
  for (const [key, expected] of Object.entries(staticFields(workItem, byProgression))) {
    if (!sameJson(item[key], expected)) errors.push(`${prefix} ${key} mismatch`)
  }
  if (item.evidence_packet_only !== true) errors.push(`${prefix} evidence_packet_only must be true`)
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
    'pdf_toc_title_search_needs_body_page_review',
    'printed_page_range_as_pdf_page_unverified',
    'missing_unit_index'
  ]
  if (!allowedHintSources.includes(item.page_hint_source)) errors.push(`${prefix} page_hint_source invalid`)
  const allowedHintConfidence = ['unit_index_backed', 'title_search_backed', 'low_unverified', 'missing']
  if (!allowedHintConfidence.includes(item.page_hint_confidence)) errors.push(`${prefix} page_hint_confidence invalid`)
  if (item.page_evidence_status === 'text_extracted') {
    if (item.ready_for_manual_review !== true) errors.push(`${prefix} text_extracted must be ready_for_manual_review`)
    if (!(item.page_text_excerpts || []).some(page => page.status === 'text_extracted' && Number(page.text_chars || 0) > 0)) {
      errors.push(`${prefix} text_extracted must include a non-empty page excerpt`)
    }
  } else if (item.ready_for_manual_review !== false) {
    errors.push(`${prefix} non-text_extracted item must not be ready_for_manual_review`)
  }

  stats.audited_page_evidence_items += 1
  if (item.ready_for_manual_review) stats.ready_for_manual_review_rows += 1
  if (item.page_evidence_status === 'text_extracted') stats.text_extracted_rows += 1
}

function summarizeRows(rows) {
  const summary = {
    by_grade_band: {},
    by_page_evidence_status: {},
    by_page_hint_confidence: {},
    by_page_hint_source: {},
    by_page_range_status: {},
    by_primary_review_bucket: {},
    by_review_lane: {},
    by_subject: {},
    by_target_standard_code: {},
    by_textbook_evidence_id: {},
    full_h4g_triplet_context_rows: 0,
    page_evidence_items: rows.length,
    ready_for_manual_review_rows: 0,
    text_extracted_rows: 0,
    title_search_page_hint_rows: 0,
    unit_index_found_rows: 0,
    unverified_printed_page_hint_rows: 0,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_review_work_items: sorted(rows.map(row => row.source_downstream_source_anchor_review_work_item_id)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_textbook_evidence_ids: sorted(rows.map(row => row.textbook_evidence_id)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    if (row.ready_for_manual_review) summary.ready_for_manual_review_rows += 1
    if (row.page_evidence_status === 'text_extracted') summary.text_extracted_rows += 1
    if (row.unit_index_found) summary.unit_index_found_rows += 1
    if (row.page_hint_source === 'pdf_title_text_search') summary.title_search_page_hint_rows += 1
    if (row.page_hint_source === 'printed_page_range_as_pdf_page_unverified') summary.unverified_printed_page_hint_rows += 1
    if (row.has_full_h4g_triplet_context) summary.full_h4g_triplet_context_rows += 1
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_evidence_status, row.page_evidence_status)
    countInto(summary.by_page_hint_confidence, row.page_hint_confidence)
    countInto(summary.by_page_hint_source, row.page_hint_source)
    countInto(summary.by_page_range_status, row.page_range_status)
    countInto(summary.by_primary_review_bucket, row.primary_review_bucket)
    countInto(summary.by_review_lane, row.review_lane)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.target_standard_code)
    countInto(summary.by_textbook_evidence_id, row.textbook_evidence_id)
  }
  return summary
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Page Evidence Packet Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected page evidence items | ${payload.summary.expected_page_evidence_items} |
| audited page evidence items | ${payload.summary.audited_page_evidence_items} |
| missing page evidence items | ${payload.summary.missing_page_evidence_items} |
| extra page evidence items | ${payload.summary.extra_page_evidence_items} |
| text extracted rows | ${payload.summary.text_extracted_rows} |
| ready for manual review rows | ${payload.summary.ready_for_manual_review_rows} |
| title-search page hint rows | ${payload.summary.title_search_page_hint_rows} |
| unverified printed-page hint rows | ${payload.summary.unverified_printed_page_hint_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Evidence Status

| status | rows |
| --- | ---: |
${countRows(payload.summary.by_page_evidence_status)}

## Page Hint Sources

| source | rows |
| --- | ---: |
${countRows(payload.summary.by_page_hint_source)}

## Review Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_review_lane)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['packet', args.packet],
    ['worklist', args.worklist]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const packet = existsSync(args.packet) ? readJson(args.packet) : { page_evidence_items: [] }
  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { downstream_source_anchor_review_work_items: [] }
  if (!errors.length) validateTopLevel(packet, worklist, args, errors)

  const items = packet.page_evidence_items || []
  const workItems = worklist.downstream_source_anchor_review_work_items || []
  const itemsByWorkItem = mapBy(items, 'source_downstream_source_anchor_review_work_item_id', errors, 'packet')
  const workItemsById = mapBy(workItems, 'work_item_id', errors, 'worklist')
  const byProgression = rowsByProgression(workItems)
  const rowSummary = summarizeRows(items)
  if (!sameJson(packet.summary || {}, rowSummary)) errors.push('packet summary does not match page evidence items')

  const stats = {
    ...rowSummary,
    audited_page_evidence_items: 0,
    expected_page_evidence_items: workItems.length,
    extra_page_evidence_items: 0,
    missing_page_evidence_items: 0
  }
  stats.ready_for_manual_review_rows = 0
  stats.text_extracted_rows = 0

  if (items.length !== workItems.length) {
    errors.push(`packet rows ${items.length} must match worklist rows ${workItems.length}`)
  }
  for (const [workItemId, workItem] of workItemsById.entries()) {
    const item = itemsByWorkItem.get(workItemId)
    if (!item) {
      stats.missing_page_evidence_items += 1
      errors.push(`${workItemId} missing page evidence item`)
      continue
    }
    validateItem(workItem, item, byProgression, errors, stats)
  }
  for (const workItemId of itemsByWorkItem.keys()) {
    if (!workItemsById.has(workItemId)) {
      stats.extra_page_evidence_items += 1
      errors.push(`${workItemId} unexpected page evidence item`)
    }
  }
  if (args.requireItems && !stats.audited_page_evidence_items) {
    errors.push('requireItems is set but no page evidence items were audited')
  }
  if (stats.audited_page_evidence_items !== stats.expected_page_evidence_items) {
    errors.push(`audited page evidence items ${stats.audited_page_evidence_items} must match expected ${stats.expected_page_evidence_items}`)
  }

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
