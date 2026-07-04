#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template_anchor_domain_rejected_english_pe_audit.md'

const DECISION_PENDING = 'pending'
const DECISION_NEEDS_REVISION = 'needs_revision_or_more_evidence'
const DECISION_SUPERSEDED = 'out_of_scope_duplicate_or_superseded'
const SOURCE_ANCHOR_CONFIRM = 'confirm_source_anchor_exact_evidence_for_later_action_gate'
const SOURCE_ANCHOR_REJECT = 'reject_source_anchor_exact_evidence'
const SOURCE_ROW_CONFIRM = 'confirm_source_row_for_later_action_gate'
const SOURCE_ROW_REJECT = 'reject_source_row_confirmation'
const ITEM_LEVEL_CONFIRM = 'confirm_item_level_source_scope_for_later_action_gate'
const ITEM_LEVEL_REJECT = 'reject_item_level_source_scope'
const CONFIRM_DECISIONS = new Set([SOURCE_ANCHOR_CONFIRM, SOURCE_ROW_CONFIRM, ITEM_LEVEL_CONFIRM])

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    requireComplete: false,
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
    else if (item === '--require-complete') args.requireComplete = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions.js \\
  --strict --require-items

Audits editable post-candidate manual review decisions against the unified
manual review packet. Pending decisions are valid by default. Completed
decisions must preserve no-public-write, no-official-text-change, no-matcher,
and no-publication boundaries.`)
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

function decisionPolicy() {
  return {
    changes_official_standard_text: false,
    decision_template_only: true,
    direct_matcher_use: false,
    editable_manual_review_template: true,
    eligible_for_h4g_differentiation: false,
    manual_review_decision_is_not_bridge_approval: true,
    manual_review_decision_requires_later_action_gate: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function validateDecisionPolicy(label, policy, errors) {
  for (const key of [
    'decision_template_only',
    'editable_manual_review_template',
    'manual_review_decision_is_not_bridge_approval',
    'manual_review_decision_requires_later_action_gate',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function allowedDecisions(item) {
  const batch = item.source_downstream_action_batch || ''
  if (batch === 'source_anchor_evidence') {
    return [DECISION_PENDING, SOURCE_ANCHOR_CONFIRM, SOURCE_ANCHOR_REJECT, DECISION_NEEDS_REVISION, DECISION_SUPERSEDED]
  }
  if (batch === 'source_row_confirmation') {
    return [DECISION_PENDING, SOURCE_ROW_CONFIRM, SOURCE_ROW_REJECT, DECISION_NEEDS_REVISION, DECISION_SUPERSEDED]
  }
  if (batch === 'item_level_source_review') {
    return [DECISION_PENDING, ITEM_LEVEL_CONFIRM, ITEM_LEVEL_REJECT, DECISION_NEEDS_REVISION, DECISION_SUPERSEDED]
  }
  return [DECISION_PENDING, DECISION_NEEDS_REVISION, DECISION_SUPERSEDED]
}

function requiredConfirmations() {
  return {
    direct_matcher_use_rejected: true,
    evidence_packet_source_confirmed: false,
    h4g_grade_distinctiveness_checked: false,
    later_action_decision_gate_required: true,
    later_matcher_gate_required: true,
    later_publication_gate_required: true,
    manual_review_packet_not_treated_as_approval: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    page_evidence_checked: false,
    reviewer_note_records_exact_basis: false,
    same_grade_scope_checked: false,
    same_subject_scope_checked: false,
    source_item_or_anchor_reviewed: false,
    target_standard_specificity_checked: false
  }
}

function sourceReviewPrompt(item) {
  const source = item.evidence_packet_source || ''
  if (source === 'source_anchor_exact_evidence_packet') {
    return [
      'Does the page evidence explicitly prove the target standard, not only the broad topic?',
      'Is the evidence same-grade and same-subject for this H4G record?',
      'What exact activity, task, language function, movement skill, health behavior, or cultural objective is visible?',
      'Does the evidence distinguish this H4G grade from sibling H4G records?'
    ]
  }
  if (item.source_downstream_action_batch === 'source_row_confirmation') {
    return [
      'Does this single source row prove the target anchor for the same standard and grade?',
      'Is the source bounded enough to proceed to a later action gate?',
      'Which exact source behavior or skill supports the target standard?'
    ]
  }
  if (item.source_downstream_action_batch === 'item_level_source_review') {
    return [
      'Does this item-level source scope belong to the target grade and standard?',
      'Is the unit evidence specific enough to avoid fan-out across sibling standards?',
      'Which exact unit activity, source item, or page evidence supports the decision?'
    ]
  }
  return ['Review the evidence packet and record the exact basis for any non-pending decision.']
}

function decisionId(item) {
  return `h4g_anchor_group_post_candidate_manual_review_decision_${hashText(item.manual_review_packet_item_id)}`
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

function hasText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().length > 0
}

function validReviewDate(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value || ''))
}

function validateTopLevel(decisions, packet, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template') {
    errors.push('decisions data_scope mismatch')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('decisions editable_manual_review_template must be true')
  if (decisions.source_post_candidate_manual_review_packet !== args.packet) {
    errors.push('decisions source_post_candidate_manual_review_packet must match audit arg')
  }
  if (!Array.isArray(decisions.post_candidate_manual_review_decisions)) {
    errors.push('decisions post_candidate_manual_review_decisions must be an array')
  }
  validatePolicy('decisions', decisions, errors)
  validateDecisionPolicy('decisions policy', decisions.policy || {}, errors)

  if (packet.valid !== true) errors.push('packet valid must be true')
  if ((packet.errors || []).length) errors.push('packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_packet') {
    errors.push('packet purpose mismatch')
  }
  if (packet.manual_review_packet_only !== true) errors.push('packet manual_review_packet_only must be true')
  if (packet.review_only !== true) errors.push('packet review_only must be true')
  if (!Array.isArray(packet.manual_review_items)) errors.push('packet manual_review_items must be an array')
  validatePolicy('packet', packet, errors)
}

function staticFields(item) {
  return {
    anchor_requirement_summary: item.anchor_requirement_summary || '',
    downstream_action_decision_id: item.downstream_action_decision_id || '',
    evidence_lane: item.evidence_lane || '',
    evidence_packet_item_id: item.evidence_packet_item_id || '',
    evidence_packet_source: item.evidence_packet_source || '',
    evidence_ready: item.evidence_ready === true,
    grade_band: item.grade_band || '',
    inventory_bucket: item.inventory_bucket || '',
    inventory_item_id: item.inventory_item_id || '',
    manual_confirmation_lane: item.manual_confirmation_lane || '',
    manual_confirmation_required: item.manual_confirmation_required === true,
    manual_review_packet_item_id: item.manual_review_packet_item_id || '',
    page_status: item.page_status || '',
    post_candidate_remaining_reason: item.post_candidate_remaining_reason || '',
    progression_group_id: item.progression_group_id || '',
    recommended_next_gate_after_candidate_filter: item.recommended_next_gate_after_candidate_filter || '',
    recommended_reviewer_decision: item.recommended_reviewer_decision || '',
    review_bucket: item.review_bucket || '',
    review_grain: item.review_grain || '',
    risk_signals: item.risk_signals || [],
    source_context: item.source_context || {},
    source_decision_status: item.source_decision_status || '',
    source_downstream_action_batch: item.source_downstream_action_batch || '',
    source_downstream_action_item_id: item.source_downstream_action_item_id || '',
    source_key: item.source_key || '',
    source_reviewer_decision: item.source_reviewer_decision || '',
    source_standard_context: item.source_standard_context || {},
    standard_code: item.standard_code || '',
    subject_slug: item.subject_slug || '',
    target_grade_band: item.target_grade_band || '',
    target_standard_code: item.target_standard_code || item.standard_code || '',
    unit_context: item.unit_context || {},
    unit_evidence_id: item.unit_evidence_id || '',
    unit_title: item.unit_title || '',
    worklist_rank: item.worklist_rank || 0
  }
}

function decisionStaticFields(row) {
  return {
    anchor_requirement_summary: row.anchor_requirement_summary || '',
    downstream_action_decision_id: row.downstream_action_decision_id || '',
    evidence_lane: row.evidence_lane || '',
    evidence_packet_item_id: row.evidence_packet_item_id || '',
    evidence_packet_source: row.evidence_packet_source || '',
    evidence_ready: row.evidence_ready === true,
    grade_band: row.grade_band || '',
    inventory_bucket: row.inventory_bucket || '',
    inventory_item_id: row.inventory_item_id || '',
    manual_confirmation_lane: row.manual_confirmation_lane || '',
    manual_confirmation_required: row.manual_confirmation_required === true,
    manual_review_packet_item_id: row.manual_review_packet_item_id || '',
    page_status: row.page_status || '',
    post_candidate_remaining_reason: row.post_candidate_remaining_reason || '',
    progression_group_id: row.progression_group_id || '',
    recommended_next_gate_after_candidate_filter: row.recommended_next_gate_after_candidate_filter || '',
    recommended_reviewer_decision: row.recommended_reviewer_decision || '',
    review_bucket: row.review_bucket || '',
    review_grain: row.review_grain || '',
    risk_signals: row.risk_signals || [],
    source_context: row.source_context || {},
    source_decision_status: row.source_decision_status || '',
    source_downstream_action_batch: row.source_downstream_action_batch || '',
    source_downstream_action_item_id: row.source_downstream_action_item_id || '',
    source_key: row.source_key || '',
    source_reviewer_decision: row.source_reviewer_decision || '',
    source_standard_context: row.source_standard_context || {},
    standard_code: row.standard_code || '',
    subject_slug: row.subject_slug || '',
    target_grade_band: row.target_grade_band || '',
    target_standard_code: row.target_standard_code || row.standard_code || '',
    unit_context: row.unit_context || {},
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || '',
    worklist_rank: row.worklist_rank || 0
  }
}

function validateCommonDecision(row, item, errors, summary) {
  const prefix = row.decision_id || row.manual_review_packet_item_id || '(missing decision id)'
  if (row.decision_id !== decisionId(item)) errors.push(`${prefix} decision_id mismatch`)
  if (!sameJson(row.allowed_decisions || [], allowedDecisions(item))) errors.push(`${prefix} allowed_decisions mismatch`)
  if (!sameJson(row.review_prompts || [], sourceReviewPrompt(item))) errors.push(`${prefix} review_prompts mismatch`)
  if (!sameJson(row.decision_policy || {}, decisionPolicy())) errors.push(`${prefix} decision_policy mismatch`)
  if (!sameJson(decisionStaticFields(row), staticFields(item))) errors.push(`${prefix} static fields do not match packet item`)
  validatePolicy(prefix, row, errors)
  validateDecisionPolicy(`${prefix}.decision_policy`, row.decision_policy || {}, errors)
  for (const flag of [
    'requested_public_write',
    'requested_official_text_change',
    'requested_direct_matcher_use',
    'requested_eligible_for_h4g_differentiation'
  ]) {
    if (row[flag] !== false) errors.push(`${prefix} ${flag} must be false`)
  }
  const allowed = new Set(allowedDecisions(item))
  if (!allowed.has(row.reviewer_decision)) errors.push(`${prefix} reviewer_decision is not allowed: ${row.reviewer_decision}`)
  countInto(summary.by_reviewer_decision, row.reviewer_decision)
  countInto(summary.by_decision_status, row.decision_status)
  countInto(summary.by_evidence_packet_source, row.evidence_packet_source)
  countInto(summary.by_source_downstream_action_batch, row.source_downstream_action_batch)
  countInto(summary.by_grade_band, row.grade_band)
  countInto(summary.by_subject, row.subject_slug)
  if (row.evidence_ready === true) summary.evidence_ready_decisions += 1
  if (row.manual_confirmation_required === true) summary.decisions_requiring_manual_confirmation += 1
  if (row.reviewer_decision === DECISION_PENDING) {
    summary.pending_decisions += 1
    if (row.decision_status !== 'pending') errors.push(`${prefix} pending decision_status must be pending`)
  } else {
    summary.completed_decisions += 1
    validateCompletedDecision(row, prefix, errors)
  }
}

function requireTrue(confirmations, key, prefix, errors) {
  if (confirmations[key] !== true) errors.push(`${prefix} required_confirmations.${key} must be true`)
}

function validateCompletedDecision(row, prefix, errors) {
  if (row.decision_status !== 'reviewed') errors.push(`${prefix} completed decision_status must be reviewed`)
  if (!hasText(row.reviewed_by)) errors.push(`${prefix} reviewed_by is required for completed decisions`)
  if (!validReviewDate(row.reviewed_at)) errors.push(`${prefix} reviewed_at must start with YYYY-MM-DD`)
  if (!hasText(row.decision_note) && !hasText(row.reviewer_note)) {
    errors.push(`${prefix} completed decision requires decision_note or reviewer_note`)
  }
  const confirmations = row.required_confirmations || {}
  for (const key of [
    'direct_matcher_use_rejected',
    'later_action_decision_gate_required',
    'later_matcher_gate_required',
    'later_publication_gate_required',
    'manual_review_packet_not_treated_as_approval',
    'no_public_write_requested',
    'official_standard_text_preserved',
    'reviewer_note_records_exact_basis',
    'source_item_or_anchor_reviewed'
  ]) {
    requireTrue(confirmations, key, prefix, errors)
  }
  if (CONFIRM_DECISIONS.has(row.reviewer_decision)) {
    for (const key of [
      'evidence_packet_source_confirmed',
      'h4g_grade_distinctiveness_checked',
      'page_evidence_checked',
      'same_grade_scope_checked',
      'same_subject_scope_checked',
      'target_standard_specificity_checked'
    ]) {
      requireTrue(confirmations, key, prefix, errors)
    }
  }
}

function summarize(decisionRows, packetRows) {
  return {
    audited_decisions: 0,
    by_decision_status: {},
    by_evidence_packet_source: {},
    by_grade_band: {},
    by_reviewer_decision: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    completed_decisions: 0,
    decisions_requiring_manual_confirmation: 0,
    decision_template_rows: decisionRows.length,
    evidence_ready_decisions: 0,
    expected_decisions: packetRows.length,
    extra_decisions: 0,
    missing_decisions: 0,
    pending_decisions: 0,
    unique_action_decisions: sorted(packetRows.map(row => row.downstream_action_decision_id)).length,
    unique_progression_groups: sorted(packetRows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(packetRows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(packetRows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(packetRows.map(row => row.unit_evidence_id)).length
  }
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Manual Review Decisions Audit

Generated at: ${payload.generated_at}

Decisions: \`${payload.decisions}\`

Packet: \`${payload.packet}\`

## Summary

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| expected decisions | ${payload.summary.expected_decisions} |
| audited decisions | ${payload.summary.audited_decisions} |
| missing decisions | ${payload.summary.missing_decisions} |
| extra decisions | ${payload.summary.extra_decisions} |
| pending decisions | ${payload.summary.pending_decisions} |
| completed decisions | ${payload.summary.completed_decisions} |
| evidence-ready decisions | ${payload.summary.evidence_ready_decisions} |
| manual-confirmation required decisions | ${payload.summary.decisions_requiring_manual_confirmation} |
| unique standard codes | ${payload.summary.unique_standard_codes} |

## Reviewer Decisions

| decision | rows |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Evidence Packet Source

| source | rows |
| --- | ---: |
${countRows(payload.summary.by_evidence_packet_source)}

## Source Action Batch

| batch | rows |
| --- | ---: |
${countRows(payload.summary.by_source_downstream_action_batch)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const decisions = readJson(args.decisions)
  const packet = readJson(args.packet)
  validateTopLevel(decisions, packet, args, errors)

  const decisionRows = decisions.post_candidate_manual_review_decisions || []
  const packetRows = packet.manual_review_items || []
  const summary = summarize(decisionRows, packetRows)
  if (args.requireItems && packetRows.length === 0) errors.push('requireItems is set but packet has no items')
  if (args.requireItems && decisionRows.length === 0) errors.push('requireItems is set but decisions file has no rows')

  const packetById = mapBy(packetRows, 'manual_review_packet_item_id', errors, 'packet')
  const decisionsById = mapBy(decisionRows, 'manual_review_packet_item_id', errors, 'decisions')
  const missing = []
  const extra = []
  for (const id of packetById.keys()) {
    if (!decisionsById.has(id)) missing.push(id)
  }
  for (const id of decisionsById.keys()) {
    if (!packetById.has(id)) extra.push(id)
  }
  summary.missing_decisions = missing.length
  summary.extra_decisions = extra.length
  for (const id of missing) errors.push(`missing decision for packet item ${id}`)
  for (const id of extra) errors.push(`extra decision without packet item ${id}`)

  for (const [id, packetItem] of packetById.entries()) {
    const row = decisionsById.get(id)
    if (!row) continue
    summary.audited_decisions += 1
    validateCommonDecision(row, packetItem, errors, summary)
  }

  if (summary.decision_template_rows !== summary.expected_decisions) {
    errors.push(`decision row count must match packet item count: ${summary.decision_template_rows} vs ${summary.expected_decisions}`)
  }
  if (summary.evidence_ready_decisions !== summary.audited_decisions) {
    errors.push(`all audited decisions must be evidence-ready: ${summary.evidence_ready_decisions} vs ${summary.audited_decisions}`)
  }
  if (summary.decisions_requiring_manual_confirmation !== summary.audited_decisions) {
    errors.push(`all audited decisions must require manual confirmation: ${summary.decisions_requiring_manual_confirmation} vs ${summary.audited_decisions}`)
  }
  if (args.requireComplete && summary.pending_decisions > 0) {
    errors.push(`requireComplete is set but ${summary.pending_decisions} decisions are pending`)
  }

  const payload = {
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    packet: args.packet,
    publication_ready: false,
    require_complete: args.requireComplete,
    require_items: args.requireItems,
    summary,
    valid: errors.length === 0,
    writes_public_data: false
  }
  writeJson(args.out, payload)
  writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(payload, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
