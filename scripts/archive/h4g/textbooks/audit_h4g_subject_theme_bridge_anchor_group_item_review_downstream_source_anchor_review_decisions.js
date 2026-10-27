#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe_audit.md'

const REVIEW_OUTCOMES = [
  'pending',
  'source_anchor_evidence_found_for_missing_grade',
  'source_anchor_evidence_not_found',
  'source_anchor_scope_not_closed_requires_split',
  'needs_textbook_unit_indexing'
]

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--packet') args.packet = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --packet generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits editable downstream source-anchor review decisions against the read-only
page evidence packet. Pending decisions are valid by default; completed
decisions must still keep public/data, matcher, and publication disabled.`)
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

function validateDecisionPolicy(label, policy, errors) {
  for (const key of [
    'decision_template_only',
    'downstream_action_decision_must_be_edited_separately',
    'downstream_source_anchor_review_decision_is_not_approval',
    'editable_manual_review_template',
    'item_level_decision_must_be_edited_separately',
    'requires_later_downstream_action_decision_edit',
    'requires_later_item_level_source_review',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function validateTopLevel(decisions, packet, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template') {
    errors.push('decisions data_scope mismatch')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('decisions editable_manual_review_template must be true')
  if (decisions.source_downstream_source_anchor_page_evidence_packet !== args.packet) {
    errors.push('decisions source_downstream_source_anchor_page_evidence_packet must match audit arg')
  }
  validatePolicy('decisions', decisions, errors)
  validateDecisionPolicy('decisions policy', decisions.policy || {}, errors)
  if (!Array.isArray(decisions.downstream_source_anchor_review_decisions)) {
    errors.push('decisions downstream_source_anchor_review_decisions must be an array')
  }

  if (packet.valid !== true) errors.push('packet valid must be true')
  if ((packet.errors || []).length) errors.push('packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet') {
    errors.push('packet purpose mismatch')
  }
  if (packet.page_evidence_packet_only !== true) errors.push('packet page_evidence_packet_only must be true')
  validatePolicy('packet', packet, errors)
  validatePacketPolicy('packet page_evidence_policy', packet.page_evidence_policy || {}, errors)
  if (!Array.isArray(packet.page_evidence_items)) errors.push('packet page_evidence_items must be an array')
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

function staticFields(item) {
  return {
    allowed_decisions: REVIEW_OUTCOMES,
    anchor_requirement_summary: item.anchor_requirement_summary || '',
    anchor_type: item.anchor_type || '',
    decision_id: decisionId(item),
    decision_type: 'anchor_group_downstream_source_anchor_review_decision',
    downstream_action_decision_id: item.downstream_action_decision_id || '',
    grade_band: item.grade_band || '',
    has_full_h4g_triplet_context: item.has_full_h4g_triplet_context || false,
    inventory_item_id: item.inventory_item_id || '',
    item_review_surface: item.item_review_surface || '',
    manual_review_required: true,
    page_evidence_context: pageEvidenceContext(item),
    page_evidence_packet_item_id: item.evidence_packet_item_id || '',
    page_evidence_status: item.page_evidence_status || '',
    page_hint_source: item.page_hint_source || '',
    primary_review_bucket: item.primary_review_bucket || '',
    progression_group_id: item.progression_group_id || '',
    recommended_disposition: item.recommended_disposition || '',
    review_grain: item.review_grain || '',
    review_lane: item.review_lane || '',
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
    unit_title: item.unit_title || ''
  }
}

function hasText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().length > 0
}

function validateReviewerOutcome(row, prefix, errors) {
  if (!REVIEW_OUTCOMES.includes(row.reviewer_decision || '')) {
    errors.push(`${prefix} reviewer_decision must be one of ${REVIEW_OUTCOMES.join(', ')}`)
  }
  const confirmations = row.required_confirmations || {}
  for (const key of [
    'no_public_write_requested',
    'official_standard_text_preserved',
    'later_downstream_action_decision_edit_required',
    'later_item_level_source_review_required',
    'later_matcher_gate_required',
    'later_publication_gate_required'
  ]) {
    if (confirmations[key] !== true) errors.push(`${prefix} ${key} must be true`)
  }

  if (row.reviewer_decision === 'pending') {
    if (row.decision_status !== 'pending') errors.push(`${prefix} pending decision_status must be pending`)
    return
  }

  if (row.decision_status !== 'source_anchor_reviewed') {
    errors.push(`${prefix} completed decision_status must be source_anchor_reviewed`)
  }
  if (!hasText(row.reviewer_note) && !hasText(row.decision_note)) {
    errors.push(`${prefix} completed decision must include reviewer_note or decision_note`)
  }
  for (const key of [
    'same_grade_scope_checked',
    'same_subject_scope_checked',
    'sibling_h4g_context_reviewed',
    'target_standard_specificity_checked',
    'unit_title_only_rejected_or_supplemented'
  ]) {
    if (confirmations[key] !== true) errors.push(`${prefix} completed decision requires ${key}=true`)
  }

  if (row.reviewer_decision === 'source_anchor_evidence_found_for_missing_grade') {
    for (const key of [
      'exact_activity_or_page_bounded_evidence_recorded',
      'exact_page_reference_recorded',
      'source_anchor_distinguishes_target_grade'
    ]) {
      if (confirmations[key] !== true) errors.push(`${prefix} source-anchor found requires ${key}=true`)
    }
    if (!hasText(row.exact_evidence_note)) errors.push(`${prefix} exact_evidence_note is required when evidence is found`)
    if (!hasText(row.exact_page_reference)) errors.push(`${prefix} exact_page_reference is required when evidence is found`)
    if (!hasText(row.exact_activity_or_task) && !hasText(row.exact_evidence_quote)) {
      errors.push(`${prefix} exact_activity_or_task or exact_evidence_quote is required when evidence is found`)
    }
    if (!hasText(row.grade_specific_difference_note) && !hasText(row.h4g_distinctiveness_note)) {
      errors.push(`${prefix} grade-specific distinctiveness note is required when evidence is found`)
    }
  }

  if (row.reviewer_decision === 'source_anchor_evidence_not_found') {
    if (!hasText(row.exact_evidence_note) && !hasText(row.reviewer_note)) {
      errors.push(`${prefix} evidence-not-found decision must explain reviewed evidence`)
    }
  }

  if (row.reviewer_decision === 'source_anchor_scope_not_closed_requires_split') {
    if (!hasText(row.decision_note) && !hasText(row.reviewer_note)) {
      errors.push(`${prefix} scope-not-closed decision must explain required split`)
    }
  }

  if (row.reviewer_decision === 'needs_textbook_unit_indexing') {
    if (!hasText(row.decision_note) && !hasText(row.reviewer_note)) {
      errors.push(`${prefix} needs-indexing decision must explain missing or unreliable unit indexing`)
    }
  }
}

function validateDecision(item, row, errors, stats) {
  const prefix = row.decision_id || item.evidence_packet_item_id || '(source-anchor review decision)'
  validatePolicy(prefix, row, errors)
  validateDecisionPolicy(`${prefix} decision_policy`, row.decision_policy || {}, errors)
  for (const [key, expected] of Object.entries(staticFields(item))) {
    if (!sameJson(row[key], expected)) errors.push(`${prefix} ${key} mismatch`)
  }
  if (row.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
  if (row.requested_eligible_for_h4g_differentiation !== false) {
    errors.push(`${prefix} requested_eligible_for_h4g_differentiation must be false`)
  }
  if (row.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (row.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  validateReviewerOutcome(row, prefix, errors)

  stats.audited_review_decisions += 1
  if (row.reviewer_decision === 'pending') stats.pending_review_decisions += 1
  else stats.completed_review_decisions += 1
  if (row.page_evidence_status === 'text_extracted') stats.text_extracted_rows += 1
}

function summarizeRows(rows) {
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

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Review Decisions Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected review decisions | ${payload.summary.expected_review_decisions} |
| audited review decisions | ${payload.summary.audited_review_decisions} |
| missing review decisions | ${payload.summary.missing_review_decisions} |
| extra review decisions | ${payload.summary.extra_review_decisions} |
| pending decisions | ${payload.summary.pending_review_decisions} |
| completed decisions | ${payload.summary.completed_review_decisions} |
| text extracted rows | ${payload.summary.text_extracted_rows} |
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

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['decisions', args.decisions],
    ['packet', args.packet]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { downstream_source_anchor_review_decisions: [] }
  const packet = existsSync(args.packet) ? readJson(args.packet) : { page_evidence_items: [] }
  if (!errors.length) validateTopLevel(decisions, packet, args, errors)

  const decisionRows = decisions.downstream_source_anchor_review_decisions || []
  const packetRows = packet.page_evidence_items || []
  const decisionsByPacketItem = mapBy(decisionRows, 'page_evidence_packet_item_id', errors, 'decisions')
  const packetByItem = mapBy(packetRows, 'evidence_packet_item_id', errors, 'packet')
  const rowSummary = summarizeRows(decisionRows)
  if (!sameJson(decisions.summary || {}, rowSummary)) errors.push('decisions summary does not match decision rows')

  const stats = {
    ...rowSummary,
    audited_review_decisions: 0,
    expected_review_decisions: packetRows.length,
    extra_review_decisions: 0,
    missing_review_decisions: 0
  }
  stats.pending_review_decisions = 0
  stats.completed_review_decisions = 0
  stats.text_extracted_rows = 0

  if (decisionRows.length !== packetRows.length) {
    errors.push(`decision rows ${decisionRows.length} must match packet rows ${packetRows.length}`)
  }
  for (const [packetItemId, item] of packetByItem.entries()) {
    const row = decisionsByPacketItem.get(packetItemId)
    if (!row) {
      stats.missing_review_decisions += 1
      errors.push(`${packetItemId} missing review decision`)
      continue
    }
    validateDecision(item, row, errors, stats)
  }
  for (const packetItemId of decisionsByPacketItem.keys()) {
    if (!packetByItem.has(packetItemId)) {
      stats.extra_review_decisions += 1
      errors.push(`${packetItemId} unexpected review decision`)
    }
  }
  if (args.requireItems && !stats.audited_review_decisions) {
    errors.push('requireItems is set but no review decisions were audited')
  }
  if (stats.audited_review_decisions !== stats.expected_review_decisions) {
    errors.push(`audited review decisions ${stats.audited_review_decisions} must match expected ${stats.expected_review_decisions}`)
  }

  return {
    changes_official_standard_text: false,
    decisions: args.decisions,
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
