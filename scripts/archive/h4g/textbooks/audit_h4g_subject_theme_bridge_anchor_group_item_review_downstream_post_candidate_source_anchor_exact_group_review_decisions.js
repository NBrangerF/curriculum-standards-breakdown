#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template_anchor_domain_rejected_english_pe_audit.md'

const DECISION_PENDING = 'pending'
const DECISION_READY_FOR_STANDARD_LEVEL = 'group_evidence_ready_for_standard_level_exact_anchor_review'
const DECISION_SPLIT_GROUP = 'split_group_before_standard_level_review'
const DECISION_REJECT_GROUP = 'reject_group_as_overbroad_unit_or_generic_theme'
const DECISION_NEEDS_MORE_EVIDENCE = 'needs_additional_unit_or_page_evidence'
const DECISION_SUPERSEDED = 'out_of_scope_duplicate_or_superseded'
const COMPLETED_DECISIONS = new Set([
  DECISION_READY_FOR_STANDARD_LEVEL,
  DECISION_SPLIT_GROUP,
  DECISION_REJECT_GROUP,
  DECISION_NEEDS_MORE_EVIDENCE,
  DECISION_SUPERSEDED
])

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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions.js \\
  --strict --require-items

Audits editable group-level source-anchor exact review decisions against the
group review packet. Pending decisions are valid by default. Completed group
decisions remain non-public and only route later standard-level exact-anchor
review, splitting, rejection, or evidence work.`)
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
    exact_group_decision_is_not_standard_approval: true,
    group_decision_requires_standard_level_exact_anchor_gate: true,
    group_decision_template_only: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_action_gate: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function validateDecisionPolicy(label, policy, errors) {
  for (const key of [
    'decision_template_only',
    'editable_manual_review_template',
    'exact_group_decision_is_not_standard_approval',
    'group_decision_requires_standard_level_exact_anchor_gate',
    'group_decision_template_only',
    'requires_later_action_gate',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function allowedDecisions() {
  return [
    DECISION_PENDING,
    DECISION_READY_FOR_STANDARD_LEVEL,
    DECISION_SPLIT_GROUP,
    DECISION_REJECT_GROUP,
    DECISION_NEEDS_MORE_EVIDENCE,
    DECISION_SUPERSEDED
  ]
}

function requiredConfirmations() {
  return {
    direct_matcher_use_rejected: true,
    exact_group_not_treated_as_standard_approval: true,
    group_page_evidence_reviewed: false,
    later_action_gate_required: true,
    later_matcher_gate_required: true,
    later_publication_gate_required: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    reviewer_note_records_group_basis: false,
    same_grade_scope_checked: false,
    same_subject_scope_checked: false,
    standard_level_exact_anchor_review_still_required: true,
    unit_scope_or_fanout_risk_checked: false
  }
}

function decisionId(group) {
  return `h4g_anchor_group_post_candidate_source_anchor_exact_group_review_decision_${hashText(group.exact_anchor_group_review_item_id)}`
}

function uniqueStandardCodes(group) {
  const fromCodes = sorted(group.standard_codes || [])
  if (fromCodes.length) return fromCodes
  return sorted((group.standard_review_rows || []).map(row => row.standard_code))
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
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template') {
    errors.push('decisions data_scope mismatch')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('decisions editable_manual_review_template must be true')
  if (decisions.source_exact_group_review_packet !== args.packet) {
    errors.push('decisions source_exact_group_review_packet must match audit arg')
  }
  if (!Array.isArray(decisions.exact_anchor_group_review_decisions)) {
    errors.push('decisions exact_anchor_group_review_decisions must be an array')
  }
  validatePolicy('decisions', decisions, errors)
  validateDecisionPolicy('decisions policy', decisions.policy || {}, errors)

  if (packet.valid !== true) errors.push('group review packet valid must be true')
  if ((packet.errors || []).length) errors.push('group review packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet') {
    errors.push('group review packet purpose mismatch')
  }
  if (packet.exact_anchor_group_review_packet_only !== true) {
    errors.push('group review packet exact_anchor_group_review_packet_only must be true')
  }
  if (packet.review_only !== true) errors.push('group review packet review_only must be true')
  if (!Array.isArray(packet.exact_anchor_group_review_items)) {
    errors.push('group review packet exact_anchor_group_review_items must be an array')
  }
  validatePolicy('group review packet', packet, errors)
}

function expectedStaticFields(group) {
  const standards = uniqueStandardCodes(group)
  return {
    exact_anchor_group_review_item_id: group.exact_anchor_group_review_item_id || '',
    exact_evidence_item_ids_requiring_standard_level_review: group.source_anchor_exact_evidence_item_ids || [],
    grade_band: group.grade_band || '',
    group_key: group.group_key || '',
    group_review_route: group.group_review_route || '',
    inventory_buckets: group.inventory_buckets || [],
    max_group_risk_score: Number(group.risk_summary?.max_risk_score || 0),
    page_evidence_summary: group.page_evidence_summary || {},
    priority_tier: group.priority_tier || '',
    progression_group_ids: group.progression_group_ids || [],
    risk_summary: group.risk_summary || {},
    source_anchor_exact_evidence_items: Number(group.source_anchor_exact_evidence_items || 0),
    source_group_review_packet_item: group.exact_anchor_group_review_item_id || '',
    standard_codes: standards,
    standard_level_exact_anchor_gate_required: true,
    standard_review_rows: group.standard_review_rows || [],
    subject_slug: group.subject_slug || '',
    unit_evidence_id: group.unit_evidence_id || '',
    unit_title: group.unit_title || '',
    unique_standard_codes: standards.length
  }
}

function actualStaticFields(row) {
  return {
    exact_anchor_group_review_item_id: row.exact_anchor_group_review_item_id || '',
    exact_evidence_item_ids_requiring_standard_level_review: row.exact_evidence_item_ids_requiring_standard_level_review || [],
    grade_band: row.grade_band || '',
    group_key: row.group_key || '',
    group_review_route: row.group_review_route || '',
    inventory_buckets: row.inventory_buckets || [],
    max_group_risk_score: Number(row.max_group_risk_score || 0),
    page_evidence_summary: row.page_evidence_summary || {},
    priority_tier: row.priority_tier || '',
    progression_group_ids: row.progression_group_ids || [],
    risk_summary: row.risk_summary || {},
    source_anchor_exact_evidence_items: Number(row.source_anchor_exact_evidence_items || 0),
    source_group_review_packet_item: row.source_group_review_packet_item || '',
    standard_codes: row.standard_codes || [],
    standard_level_exact_anchor_gate_required: row.standard_level_exact_anchor_gate_required === true,
    standard_review_rows: row.standard_review_rows || [],
    subject_slug: row.subject_slug || '',
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || '',
    unique_standard_codes: Number(row.unique_standard_codes || 0)
  }
}

function validateEditableFields(row, errors, stats) {
  const prefix = row.decision_id || row.exact_anchor_group_review_item_id || '(missing decision)'
  if (!allowedDecisions().includes(row.reviewer_decision)) {
    errors.push(`${prefix} reviewer_decision is not allowed: ${row.reviewer_decision}`)
  }
  if (!sameJson(row.allowed_decisions || [], allowedDecisions())) errors.push(`${prefix} allowed_decisions mismatch`)
  if (!sameJson(row.decision_policy || {}, decisionPolicy())) errors.push(`${prefix} decision_policy mismatch`)
  if (!sameJson(row.required_confirmations || {}, requiredConfirmations())) {
    errors.push(`${prefix} required_confirmations mismatch`)
  }
  validatePolicy(prefix, row, errors)
  if (row.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (row.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (row.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
  if (row.requested_eligible_for_h4g_differentiation !== false) {
    errors.push(`${prefix} requested_eligible_for_h4g_differentiation must be false`)
  }
  if (row.reviewer_decision === DECISION_PENDING) {
    if (row.decision_status !== 'pending') errors.push(`${prefix} pending decision_status mismatch`)
    stats.pending_decisions += 1
    return
  }
  stats.completed_decisions += 1
  if (!COMPLETED_DECISIONS.has(row.reviewer_decision)) errors.push(`${prefix} completed reviewer_decision invalid`)
  if (row.decision_status !== 'reviewed') errors.push(`${prefix} completed decision_status must be reviewed`)
  if (!hasText(row.reviewed_by)) errors.push(`${prefix} reviewed_by required for completed decision`)
  if (!validReviewDate(row.reviewed_at)) errors.push(`${prefix} reviewed_at must start with YYYY-MM-DD`)
  if (!hasText(row.reviewer_note) && !hasText(row.decision_note)) {
    errors.push(`${prefix} completed decision requires reviewer_note or decision_note`)
  }
  if (row.reviewer_decision === DECISION_READY_FOR_STANDARD_LEVEL &&
      !Array.isArray(row.ready_standard_level_exact_anchor_review_item_ids)) {
    errors.push(`${prefix} ready_standard_level_exact_anchor_review_item_ids must be an array`)
  }
  if (row.reviewer_decision === DECISION_SPLIT_GROUP && !hasText(row.split_or_refine_instruction)) {
    errors.push(`${prefix} split decision requires split_or_refine_instruction`)
  }
  if (row.reviewer_decision === DECISION_REJECT_GROUP && !hasText(row.unit_level_evidence_note)) {
    errors.push(`${prefix} reject decision requires unit_level_evidence_note`)
  }
}

function emptyStats(packet) {
  return {
    by_decision_status: {},
    by_grade_band: {},
    by_group_review_route: {},
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_subject: {},
    completed_decisions: 0,
    exact_group_review_auto_approval_decisions: 0,
    exact_group_review_decisions: 0,
    expected_group_review_decisions: (packet.exact_anchor_group_review_items || []).length,
    extra_decisions: 0,
    groups_with_multiple_standards: 0,
    max_rows_per_group: 0,
    missing_decisions: 0,
    pending_decisions: 0,
    source_anchor_exact_evidence_items: 0,
    unique_unit_evidence_ids: sorted((packet.exact_anchor_group_review_items || []).map(row => row.unit_evidence_id)).length
  }
}

function validateDecision(row, source, errors, stats) {
  const prefix = row.decision_id || row.exact_anchor_group_review_item_id || '(missing decision)'
  if (row.decision_id !== decisionId(source)) errors.push(`${prefix} decision_id mismatch`)
  if (row.decision_type !== 'h4g_anchor_group_post_candidate_source_anchor_exact_group_review_decision') {
    errors.push(`${prefix} decision_type mismatch`)
  }
  if (!sameJson(actualStaticFields(row), expectedStaticFields(source))) {
    errors.push(`${prefix} static fields do not match source group`)
  }
  validateEditableFields(row, errors, stats)

  stats.exact_group_review_decisions += 1
  stats.source_anchor_exact_evidence_items += Number(row.source_anchor_exact_evidence_items || 0)
  stats.max_rows_per_group = Math.max(stats.max_rows_per_group, Number(row.source_anchor_exact_evidence_items || 0))
  if (Number(row.unique_standard_codes || 0) > 1) stats.groups_with_multiple_standards += 1
  countInto(stats.by_decision_status, row.decision_status)
  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_group_review_route, row.group_review_route)
  countInto(stats.by_priority_tier, row.priority_tier)
  countInto(stats.by_reviewer_decision, row.reviewer_decision)
  countInto(stats.by_subject, row.subject_slug)
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Source-Anchor Exact Group Review Decisions Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected decisions | ${payload.summary.expected_group_review_decisions} |
| audited decisions | ${payload.summary.exact_group_review_decisions} |
| missing decisions | ${payload.summary.missing_decisions} |
| extra decisions | ${payload.summary.extra_decisions} |
| pending decisions | ${payload.summary.pending_decisions} |
| completed decisions | ${payload.summary.completed_decisions} |
| source-anchor exact evidence rows | ${payload.summary.source_anchor_exact_evidence_items} |
| max rows per group | ${payload.summary.max_rows_per_group} |
| auto approval decisions | ${payload.summary.exact_group_review_auto_approval_decisions} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Group Routes

| route | decisions |
| --- | ---: |
${countRows(payload.summary.by_group_review_route)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of Object.entries({ decisions: args.decisions, packet: args.packet })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { exact_anchor_group_review_decisions: [] }
  const packet = existsSync(args.packet) ? readJson(args.packet) : { exact_anchor_group_review_items: [] }
  if (!errors.length) validateTopLevel(decisions, packet, args, errors)

  const groupsById = mapBy(packet.exact_anchor_group_review_items || [], 'exact_anchor_group_review_item_id', errors, 'source group')
  const decisionsByGroupId = mapBy(decisions.exact_anchor_group_review_decisions || [], 'exact_anchor_group_review_item_id', errors, 'decision')
  const stats = emptyStats(packet)
  for (const [groupId, source] of groupsById.entries()) {
    const row = decisionsByGroupId.get(groupId)
    if (!row) {
      stats.missing_decisions += 1
      errors.push(`${groupId} missing group decision`)
      continue
    }
    validateDecision(row, source, errors, stats)
  }
  for (const groupId of decisionsByGroupId.keys()) {
    if (!groupsById.has(groupId)) {
      stats.extra_decisions += 1
      errors.push(`${groupId} unexpected group decision`)
    }
  }
  if (args.requireItems && !stats.exact_group_review_decisions) {
    errors.push('requireItems is set but no group decisions were audited')
  }
  if (args.requireComplete && stats.pending_decisions) {
    errors.push(`requireComplete is set but pending decisions remain: ${stats.pending_decisions}`)
  }
  const summary = decisions.summary || {}
  for (const key of [
    'completed_decisions',
    'exact_group_review_auto_approval_decisions',
    'exact_group_review_decisions',
    'groups_with_multiple_standards',
    'max_rows_per_group',
    'pending_decisions',
    'source_anchor_exact_evidence_items',
    'unique_unit_evidence_ids'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`decisions summary.${key} mismatch`)
  }
  for (const key of ['by_decision_status', 'by_grade_band', 'by_group_review_route', 'by_priority_tier', 'by_reviewer_decision', 'by_subject']) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`decisions summary.${key} mismatch`)
  }
  if (stats.exact_group_review_auto_approval_decisions) {
    errors.push(`group review decisions must not auto-approve: ${stats.exact_group_review_auto_approval_decisions}`)
  }

  return {
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    packet: args.packet,
    publication_ready: false,
    require_complete: args.requireComplete,
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
  console.log(JSON.stringify({
    out: args.out,
    summary: payload.summary,
    valid: payload.valid
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
