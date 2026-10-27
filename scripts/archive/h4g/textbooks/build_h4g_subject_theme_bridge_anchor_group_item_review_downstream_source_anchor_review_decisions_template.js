#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.md'

const REVIEW_OUTCOMES = [
  'pending',
  'source_anchor_evidence_found_for_missing_grade',
  'source_anchor_evidence_not_found',
  'source_anchor_scope_not_closed_requires_split',
  'needs_textbook_unit_indexing'
]

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template.js \\
  --packet generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds an editable decisions template from the downstream source-anchor page
evidence packet. Every row starts pending. This template records manual
exact-anchor review outcomes only; it does not approve bridges, write
public/data, change official standard text, or enable matcher/publication use.`)
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

function truncate(value, max = 96) {
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

function validatePacket(packet, args, errors) {
  if (packet.valid !== true) errors.push('packet valid must be true')
  if ((packet.errors || []).length) errors.push('packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet') {
    errors.push('packet purpose mismatch')
  }
  if (packet.page_evidence_packet_only !== true) errors.push('packet page_evidence_packet_only must be true')
  validatePolicy('packet', packet, errors)
  validatePacketPolicy('packet page_evidence_policy', packet.page_evidence_policy || {}, errors)
  if (!Array.isArray(packet.page_evidence_items)) errors.push('packet page_evidence_items must be an array')
  if (args.requireItems && !(packet.page_evidence_items || []).length) {
    errors.push('requireItems is set but packet has no page evidence items')
  }
}

function decisionPolicy() {
  return {
    changes_official_standard_text: false,
    decision_template_only: true,
    direct_matcher_use: false,
    downstream_action_decision_must_be_edited_separately: true,
    downstream_source_anchor_review_decision_is_not_approval: true,
    editable_manual_review_template: true,
    eligible_for_h4g_differentiation: false,
    item_level_decision_must_be_edited_separately: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_downstream_action_decision_edit: true,
    requires_later_item_level_source_review: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function requiredConfirmations() {
  return {
    exact_activity_or_page_bounded_evidence_recorded: false,
    exact_page_reference_recorded: false,
    later_downstream_action_decision_edit_required: true,
    later_item_level_source_review_required: true,
    later_matcher_gate_required: true,
    later_publication_gate_required: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    same_grade_scope_checked: false,
    same_subject_scope_checked: false,
    sibling_h4g_context_reviewed: false,
    source_anchor_distinguishes_target_grade: false,
    target_standard_specificity_checked: false,
    unit_title_only_rejected_or_supplemented: false
  }
}

function decisionId(item) {
  return `h4g_anchor_group_downstream_source_anchor_review_decision_${hashText(item.evidence_packet_item_id)}`
}

function pageEvidenceContext(item) {
  return {
    evidence_packet_item_id: item.evidence_packet_item_id || '',
    extraction_tool: item.extraction_tool || '',
    page_evidence_status: item.page_evidence_status || '',
    page_hint_confidence: item.page_hint_confidence || '',
    page_hint_requires_review: item.page_hint_requires_review ?? null,
    page_hint_source: item.page_hint_source || '',
    page_range: item.page_range || '',
    page_range_status: item.page_range_status || '',
    page_text_excerpts: item.page_text_excerpts || [],
    pdf_cache_path: item.pdf_cache_path || '',
    pdf_pages: item.pdf_pages || [],
    ready_for_manual_review: item.ready_for_manual_review || false,
    title_search: item.title_search || null,
    unit_index_found: item.unit_index_found || false,
    unit_index_page_start_override: item.unit_index_page_start_override || null
  }
}

function decisionFromPageEvidence(item) {
  return {
    allowed_decisions: REVIEW_OUTCOMES,
    anchor_requirement_summary: item.anchor_requirement_summary || '',
    anchor_type: item.anchor_type || '',
    changes_official_standard_text: false,
    decision_id: decisionId(item),
    decision_note: '',
    decision_policy: decisionPolicy(),
    decision_status: 'pending',
    decision_type: 'anchor_group_downstream_source_anchor_review_decision',
    direct_matcher_use: false,
    downstream_action_decision_id: item.downstream_action_decision_id || '',
    eligible_for_h4g_differentiation: false,
    evidence_quality: '',
    exact_activity_or_task: '',
    exact_evidence_note: '',
    exact_evidence_quote: '',
    exact_page_reference: '',
    grade_band: item.grade_band || '',
    grade_specific_difference_note: '',
    has_full_h4g_triplet_context: item.has_full_h4g_triplet_context || false,
    h4g_distinctiveness_note: '',
    inventory_item_id: item.inventory_item_id || '',
    item_review_surface: item.item_review_surface || '',
    manual_review_required: true,
    matcher_ready: false,
    page_evidence_context: pageEvidenceContext(item),
    page_evidence_packet_item_id: item.evidence_packet_item_id || '',
    page_evidence_status: item.page_evidence_status || '',
    page_hint_source: item.page_hint_source || '',
    primary_review_bucket: item.primary_review_bucket || '',
    progression_group_id: item.progression_group_id || '',
    publication_ready: false,
    recommended_disposition: item.recommended_disposition || '',
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: requiredConfirmations(),
    review_grain: item.review_grain || '',
    review_lane: item.review_lane || '',
    reviewer_decision: 'pending',
    reviewer_note: '',
    risk_profile: item.risk_profile || {},
    risk_signals: item.risk_signals || [],
    same_progression_group_grade_bands: item.same_progression_group_grade_bands || [],
    sibling_h4g_grade_count: item.sibling_h4g_grade_count || 0,
    sibling_work_items: item.sibling_work_items || [],
    source_anchor_evidence_item_id: item.source_anchor_evidence_item_id || '',
    source_anchor_review_item_ids: item.source_anchor_review_item_ids || [],
    source_batch: item.source_batch || '',
    source_batch_item_id: item.source_batch_item_id || '',
    source_downstream_source_anchor_review_work_item_id: item.source_downstream_source_anchor_review_work_item_id || '',
    source_key: item.source_key || '',
    source_standard_context: item.source_standard_context || {},
    standard_code: item.standard_code || '',
    subject_slug: item.subject_slug || '',
    target_standard_code: item.target_standard_code || item.standard_code || '',
    textbook_evidence_id: item.textbook_evidence_id || '',
    unit_context: item.unit_context || {},
    unit_evidence_id: item.unit_evidence_id || '',
    unit_title: item.unit_title || '',
    writes_public_data: false
  }
}

function buildRows(packet) {
  return (packet.page_evidence_items || [])
    .map(decisionFromPageEvidence)
    .sort((a, b) => String(a.review_lane || '').localeCompare(String(b.review_lane || '')) ||
      String(a.subject_slug || '').localeCompare(String(b.subject_slug || '')) ||
      String(a.grade_band || '').localeCompare(String(b.grade_band || '')) ||
      String(a.target_standard_code || '').localeCompare(String(b.target_standard_code || '')) ||
      String(a.unit_evidence_id || '').localeCompare(String(b.unit_evidence_id || '')) ||
      String(a.source_downstream_source_anchor_review_work_item_id || '').localeCompare(String(b.source_downstream_source_anchor_review_work_item_id || '')))
}

function summarize(rows) {
  const summary = {
    by_decision_status: {},
    by_grade_band: {},
    by_page_evidence_status: {},
    by_page_hint_source: {},
    by_primary_review_bucket: {},
    by_recommended_disposition: {},
    by_review_lane: {},
    by_reviewer_decision: {},
    by_subject: {},
    by_target_standard_code: {},
    completed_review_decisions: 0,
    downstream_source_anchor_review_decisions: rows.length,
    full_h4g_triplet_context_rows: 0,
    manual_review_required_rows: 0,
    pending_review_decisions: 0,
    text_extracted_rows: 0,
    unique_page_evidence_items: sorted(rows.map(row => row.page_evidence_packet_item_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_review_work_items: sorted(rows.map(row => row.source_downstream_source_anchor_review_work_item_id)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_textbook_evidence_ids: sorted(rows.map(row => row.textbook_evidence_id)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    if (row.manual_review_required) summary.manual_review_required_rows += 1
    if (row.reviewer_decision === 'pending') summary.pending_review_decisions += 1
    else summary.completed_review_decisions += 1
    if (row.page_evidence_status === 'text_extracted') summary.text_extracted_rows += 1
    if (row.has_full_h4g_triplet_context) summary.full_h4g_triplet_context_rows += 1
    countInto(summary.by_decision_status, row.decision_status)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_evidence_status, row.page_evidence_status)
    countInto(summary.by_page_hint_source, row.page_hint_source)
    countInto(summary.by_primary_review_bucket, row.primary_review_bucket)
    countInto(summary.by_recommended_disposition, row.recommended_disposition)
    countInto(summary.by_review_lane, row.review_lane)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.target_standard_code)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${markdownCell(row.review_lane)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.target_standard_code)} | ${markdownCell(row.reviewer_decision)} | ${markdownCell(row.page_evidence_status)} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Review Decisions Template

Generated at: ${payload.generated_at}

This editable template records human exact-anchor decisions for downstream
source-anchor page evidence. Every row starts pending. It does not approve
bridges, write \`public/data\`, change official standard text, or enable
matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| decisions | ${payload.summary.downstream_source_anchor_review_decisions} |
| pending decisions | ${payload.summary.pending_review_decisions} |
| completed decisions | ${payload.summary.completed_review_decisions} |
| text extracted rows | ${payload.summary.text_extracted_rows} |
| full H4G triplet context rows | ${payload.summary.full_h4g_triplet_context_rows} |
| unique work items | ${payload.summary.unique_review_work_items} |
| unique target standards | ${payload.summary.unique_standard_codes} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Reviewer Decisions

| reviewer decision | rows |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Review Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_review_lane)}

## Page Evidence Status

| status | rows |
| --- | ---: |
${countRows(payload.summary.by_page_evidence_status)}

## Preview

| lane | subject | grade | target standard | decision | page status | unit title |
| --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.downstream_source_anchor_review_decisions)}

## Guardrails

- Pending rows are not source-anchor approvals.
- Completed rows still require downstream action updates, item-level source review, matcher gates, and publication gates.
- Public data, official standard text, matcher, and publication remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.packet)) errors.push(`Missing packet: ${args.packet}`)
  const packet = errors.length ? { page_evidence_items: [] } : readJson(args.packet)
  if (!errors.length) validatePacket(packet, args, errors)
  const rows = buildRows(packet)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no review decisions were generated')
  return {
    changes_official_standard_text: false,
    data_scope: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template',
    decision_template_only: true,
    direct_matcher_use: false,
    editable_manual_review_template: true,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    downstream_source_anchor_review_decisions: rows,
    matcher_ready: false,
    policy: decisionPolicy(),
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template',
    source_downstream_source_anchor_page_evidence_packet: args.packet,
    summary: summarize(rows),
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
