#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SURFACE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_surface_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template_anchor_domain_rejected_english_pe_audit.md'

const DECISION_PENDING = 'pending'
const DECISION_ACCEPT_CANDIDATE = 'accept_standard_exact_anchor_for_later_decision_candidate'
const DECISION_REJECT_GENERIC = 'reject_standard_anchor_as_overbroad_or_generic'
const DECISION_NEEDS_MORE_EVIDENCE = 'needs_more_specific_source_evidence'
const DECISION_SPLIT_ACTIVITY = 'split_to_activity_or_task_level_review'
const COMPLETED_DECISIONS = new Set([
  DECISION_ACCEPT_CANDIDATE,
  DECISION_REJECT_GENERIC,
  DECISION_NEEDS_MORE_EVIDENCE,
  DECISION_SPLIT_ACTIVITY
])

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireComplete: false,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    surface: DEFAULT_SURFACE
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--surface') args.surface = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions.js \\
  --strict --require-items

Audits editable standard-level split review decisions against the split review
surface. Pending decisions are valid by default. Completed decisions must keep
the no-public-write, no-official-text-change, no-matcher, and no-publication
boundaries.`)
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

function hasText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().length > 0
}

function validReviewDate(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value || ''))
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
    matcher_ready: false,
    publication_ready: false,
    requires_later_action_gate: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    split_standard_decision_is_not_publication_approval: true,
    split_standard_decision_requires_later_action_gate: true,
    split_standard_decision_template_only: true,
    writes_public_data: false
  }
}

function validateDecisionPolicy(label, policy, errors) {
  for (const key of [
    'decision_template_only',
    'editable_manual_review_template',
    'requires_later_action_gate',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'split_standard_decision_is_not_publication_approval',
    'split_standard_decision_requires_later_action_gate',
    'split_standard_decision_template_only'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function requiredConfirmations() {
  return {
    body_text_evidence_checked: false,
    direct_matcher_use_rejected: true,
    grade_distinctiveness_checked: false,
    later_action_gate_required: true,
    later_matcher_gate_required: true,
    later_publication_gate_required: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    page_evidence_checked: false,
    reviewer_note_records_exact_basis: false,
    same_grade_scope_checked: false,
    same_subject_scope_checked: false,
    source_standard_specificity_checked: false,
    split_decision_not_treated_as_approval: true,
    target_standard_specificity_checked: false
  }
}

function allowedDecisions(item) {
  return [DECISION_PENDING, ...[...new Set(item.allowed_reviewer_decisions || [])]]
}

function decisionId(item) {
  return `h4g_anchor_group_post_candidate_source_anchor_exact_group_split_review_decision_${hashText(item.split_review_item_id)}`
}

function reviewPrompts(item) {
  const prompts = [
    ...(item.review_questions || []),
    'Before accepting, write the exact body-text evidence and why it proves this standard, this grade, and this unit.',
    'If the evidence only proves a broad unit topic, choose reject or needs more specific source evidence.',
    'If the evidence points to a smaller activity/task rather than the whole unit, choose split to activity/task-level review.'
  ]
  return sorted(prompts)
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

function validateTopLevel(decisions, surface, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template') {
    errors.push('decisions data_scope mismatch')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('decisions editable_manual_review_template must be true')
  if (decisions.split_standard_decision_template_only !== true) errors.push('decisions split_standard_decision_template_only must be true')
  if (decisions.standard_level_exact_anchor_decision_candidate_only !== true) {
    errors.push('decisions standard_level_exact_anchor_decision_candidate_only must be true')
  }
  if (decisions.review_only !== true) errors.push('decisions review_only must be true')
  if (decisions.source_exact_group_split_review_surface !== args.surface) {
    errors.push('decisions source_exact_group_split_review_surface must match audit arg')
  }
  if (!Array.isArray(decisions.split_review_decisions)) {
    errors.push('decisions split_review_decisions must be an array')
  }
  validatePolicy('decisions', decisions, errors)
  validateDecisionPolicy('decisions policy', decisions.policy || {}, errors)

  if (surface.valid !== true) errors.push('split review surface valid must be true')
  if ((surface.errors || []).length) errors.push('split review surface errors must be empty')
  if (surface.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_surface') {
    errors.push('split review surface purpose mismatch')
  }
  if (surface.split_review_surface_only !== true) errors.push('split review surface split_review_surface_only must be true')
  if (surface.standard_level_exact_anchor_review_surface_only !== true) {
    errors.push('split review surface standard_level_exact_anchor_review_surface_only must be true')
  }
  if (surface.review_only !== true) errors.push('split review surface review_only must be true')
  if (!Array.isArray(surface.exact_anchor_group_split_review_items)) {
    errors.push('split review surface rows must be an array')
  }
  validatePolicy('split review surface', surface, errors)
}

function expectedStaticFields(item) {
  return {
    anchor_requirement_summary: item.anchor_requirement_summary || '',
    downstream_action_decision_id: item.downstream_action_decision_id || '',
    exact_anchor_evidence_packet_id: item.exact_anchor_evidence_packet_id || '',
    exact_anchor_group_review_item_id: item.exact_anchor_group_review_item_id || '',
    exact_anchor_group_review_recommendation_id: item.exact_anchor_group_review_recommendation_id || '',
    grade_band: item.grade_band || '',
    group_key: item.group_key || '',
    group_review_route: item.group_review_route || '',
    item_review_surface: item.item_review_surface || '',
    page_evidence_context: item.page_evidence_context || {},
    page_evidence_packet_item_id: item.page_evidence_packet_item_id || '',
    page_evidence_status: item.page_evidence_status || '',
    page_hint_source: item.page_hint_source || '',
    parent_action_work_item_id: item.parent_action_work_item_id || '',
    parent_action_worklist_rank: Number(item.parent_action_worklist_rank || 0),
    parent_decision_id: item.parent_decision_id || '',
    parent_source_anchor_exact_evidence_items: Number(item.parent_source_anchor_exact_evidence_items || 0),
    parent_standard_codes: item.parent_standard_codes || [],
    priority_tier: item.priority_tier || '',
    progression_group_id: item.progression_group_id || '',
    review_grain: item.review_grain || '',
    review_prompts: reviewPrompts(item),
    risk_profile: item.risk_profile || {},
    risk_signals: item.risk_signals || [],
    source_anchor_review_recommendation_id: item.source_anchor_review_recommendation_id || '',
    source_key: item.source_key || '',
    source_split_review_item_id: item.split_review_item_id || '',
    source_standard_context: item.source_standard_context || {},
    split_review_item_id: item.split_review_item_id || '',
    standard_code: item.standard_code || '',
    standard_level_exact_anchor_decision_candidate_only: true,
    standard_level_exact_anchor_review_required: item.standard_level_exact_anchor_review_required === true,
    subject_slug: item.subject_slug || '',
    target_standard_code: item.target_standard_code || item.standard_code || '',
    unit_context: item.unit_context || {},
    unit_evidence_id: item.unit_evidence_id || '',
    unit_title: item.unit_title || '',
    work_queue: item.work_queue || '',
    worklist_rank: Number(item.worklist_rank || 0)
  }
}

function actualStaticFields(row) {
  return {
    anchor_requirement_summary: row.anchor_requirement_summary || '',
    downstream_action_decision_id: row.downstream_action_decision_id || '',
    exact_anchor_evidence_packet_id: row.exact_anchor_evidence_packet_id || '',
    exact_anchor_group_review_item_id: row.exact_anchor_group_review_item_id || '',
    exact_anchor_group_review_recommendation_id: row.exact_anchor_group_review_recommendation_id || '',
    grade_band: row.grade_band || '',
    group_key: row.group_key || '',
    group_review_route: row.group_review_route || '',
    item_review_surface: row.item_review_surface || '',
    page_evidence_context: row.page_evidence_context || {},
    page_evidence_packet_item_id: row.page_evidence_packet_item_id || '',
    page_evidence_status: row.page_evidence_status || '',
    page_hint_source: row.page_hint_source || '',
    parent_action_work_item_id: row.parent_action_work_item_id || '',
    parent_action_worklist_rank: Number(row.parent_action_worklist_rank || 0),
    parent_decision_id: row.parent_decision_id || '',
    parent_source_anchor_exact_evidence_items: Number(row.parent_source_anchor_exact_evidence_items || 0),
    parent_standard_codes: row.parent_standard_codes || [],
    priority_tier: row.priority_tier || '',
    progression_group_id: row.progression_group_id || '',
    review_grain: row.review_grain || '',
    review_prompts: row.review_prompts || [],
    risk_profile: row.risk_profile || {},
    risk_signals: row.risk_signals || [],
    source_anchor_review_recommendation_id: row.source_anchor_review_recommendation_id || '',
    source_key: row.source_key || '',
    source_split_review_item_id: row.source_split_review_item_id || '',
    source_standard_context: row.source_standard_context || {},
    split_review_item_id: row.split_review_item_id || '',
    standard_code: row.standard_code || '',
    standard_level_exact_anchor_decision_candidate_only: row.standard_level_exact_anchor_decision_candidate_only === true,
    standard_level_exact_anchor_review_required: row.standard_level_exact_anchor_review_required === true,
    subject_slug: row.subject_slug || '',
    target_standard_code: row.target_standard_code || row.standard_code || '',
    unit_context: row.unit_context || {},
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || '',
    work_queue: row.work_queue || '',
    worklist_rank: Number(row.worklist_rank || 0)
  }
}

function validateEditableFields(row, source, errors, stats) {
  const prefix = row.decision_id || row.split_review_item_id || '(missing decision)'
  if (!allowedDecisions(source).includes(row.reviewer_decision)) {
    errors.push(`${prefix} reviewer_decision is not allowed: ${row.reviewer_decision}`)
  }
  if (!sameJson(row.allowed_decisions || [], allowedDecisions(source))) errors.push(`${prefix} allowed_decisions mismatch`)
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
  if (row.reviewer_decision === DECISION_ACCEPT_CANDIDATE) {
    if (!hasText(row.exact_page_reference)) errors.push(`${prefix} accept candidate requires exact_page_reference`)
    if (!hasText(row.exact_evidence_note) && !hasText(row.exact_activity_or_task) && !hasText(row.exact_evidence_quote)) {
      errors.push(`${prefix} accept candidate requires exact evidence note, activity/task, or quote`)
    }
    if (!hasText(row.grade_specific_difference_note) && !hasText(row.h4g_distinctiveness_note)) {
      errors.push(`${prefix} accept candidate requires grade-specific distinctiveness note`)
    }
  }
  if (row.reviewer_decision === DECISION_REJECT_GENERIC && !hasText(row.rejection_reason)) {
    errors.push(`${prefix} reject decision requires rejection_reason`)
  }
  if (row.reviewer_decision === DECISION_NEEDS_MORE_EVIDENCE && !hasText(row.more_evidence_needed)) {
    errors.push(`${prefix} needs-more-evidence decision requires more_evidence_needed`)
  }
  if (row.reviewer_decision === DECISION_SPLIT_ACTIVITY && !hasText(row.split_instruction)) {
    errors.push(`${prefix} split decision requires split_instruction`)
  }
}

function emptyStats(surface) {
  const sourceRows = surface.exact_anchor_group_split_review_items || []
  return {
    accept_candidate_decisions: 0,
    auto_approval_decisions: 0,
    by_decision_status: {},
    by_grade_band: {},
    by_group_review_route: {},
    by_item_review_surface: {},
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_subject: {},
    by_work_queue: {},
    completed_decisions: 0,
    decision_template_rows: 0,
    decisions_requiring_manual_confirmation: 0,
    evidence_ready_decisions: 0,
    expected_decision_template_rows: sourceRows.length,
    extra_decisions: 0,
    missing_decisions: 0,
    more_evidence_decisions: 0,
    pending_decisions: 0,
    reject_generic_decisions: 0,
    source_anchor_exact_evidence_items: 0,
    split_activity_decisions: 0,
    unique_exact_anchor_evidence_items: sorted(sourceRows.map(row => row.exact_anchor_evidence_packet_id)).length,
    unique_parent_action_work_items: sorted(sourceRows.map(row => row.parent_action_work_item_id)).length,
    unique_progression_groups: sorted(sourceRows.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(sourceRows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(sourceRows.map(row => row.unit_evidence_id)).length
  }
}

function validateDecision(row, source, errors, stats) {
  const prefix = row.decision_id || row.split_review_item_id || '(missing decision)'
  if (row.decision_id !== decisionId(source)) errors.push(`${prefix} decision_id mismatch`)
  if (row.decision_type !== 'h4g_anchor_group_post_candidate_source_anchor_exact_group_split_review_decision') {
    errors.push(`${prefix} decision_type mismatch`)
  }
  if (!sameJson(actualStaticFields(row), expectedStaticFields(source))) {
    errors.push(`${prefix} static fields do not match source split review item`)
  }
  validateEditableFields(row, source, errors, stats)

  stats.decision_template_rows += 1
  stats.decisions_requiring_manual_confirmation += 1
  stats.source_anchor_exact_evidence_items += 1
  if (row.page_evidence_context?.ready_for_manual_review === true) stats.evidence_ready_decisions += 1
  if (row.reviewer_decision === DECISION_ACCEPT_CANDIDATE) stats.accept_candidate_decisions += 1
  if (row.reviewer_decision === DECISION_REJECT_GENERIC) stats.reject_generic_decisions += 1
  if (row.reviewer_decision === DECISION_NEEDS_MORE_EVIDENCE) stats.more_evidence_decisions += 1
  if (row.reviewer_decision === DECISION_SPLIT_ACTIVITY) stats.split_activity_decisions += 1
  countInto(stats.by_decision_status, row.decision_status)
  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_group_review_route, row.group_review_route)
  countInto(stats.by_item_review_surface, row.item_review_surface)
  countInto(stats.by_priority_tier, row.priority_tier)
  countInto(stats.by_reviewer_decision, row.reviewer_decision)
  countInto(stats.by_subject, row.subject_slug)
  countInto(stats.by_work_queue, row.work_queue)
}

function markdownSummary(payload) {
  return `# H4G Source-Anchor Exact Group Split Review Decisions Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected decisions | ${payload.summary.expected_decision_template_rows} |
| audited decisions | ${payload.summary.decision_template_rows} |
| missing decisions | ${payload.summary.missing_decisions} |
| extra decisions | ${payload.summary.extra_decisions} |
| pending decisions | ${payload.summary.pending_decisions} |
| completed decisions | ${payload.summary.completed_decisions} |
| accept candidate decisions | ${payload.summary.accept_candidate_decisions} |
| reject generic decisions | ${payload.summary.reject_generic_decisions} |
| more evidence decisions | ${payload.summary.more_evidence_decisions} |
| split activity decisions | ${payload.summary.split_activity_decisions} |
| auto approval decisions | ${payload.summary.auto_approval_decisions} |
| source-anchor exact evidence rows | ${payload.summary.source_anchor_exact_evidence_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Reviewer Decisions

| reviewer decision | rows |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Grade Bands

| grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of Object.entries({ decisions: args.decisions, surface: args.surface })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { split_review_decisions: [] }
  const surface = existsSync(args.surface) ? readJson(args.surface) : { exact_anchor_group_split_review_items: [] }
  if (!errors.length) validateTopLevel(decisions, surface, args, errors)

  const sourceById = mapBy(surface.exact_anchor_group_split_review_items || [], 'split_review_item_id', errors, 'source split review item')
  const decisionBySourceId = mapBy(decisions.split_review_decisions || [], 'source_split_review_item_id', errors, 'decision')
  const stats = emptyStats(surface)
  for (const [sourceId, source] of sourceById.entries()) {
    const row = decisionBySourceId.get(sourceId)
    if (!row) {
      stats.missing_decisions += 1
      errors.push(`${sourceId} missing split review decision`)
      continue
    }
    validateDecision(row, source, errors, stats)
  }
  for (const sourceId of decisionBySourceId.keys()) {
    if (!sourceById.has(sourceId)) {
      stats.extra_decisions += 1
      errors.push(`${sourceId} unexpected split review decision`)
    }
  }
  if (args.requireItems && !stats.decision_template_rows) {
    errors.push('requireItems is set but no split review decisions were audited')
  }
  if (args.requireComplete && stats.pending_decisions) {
    errors.push(`requireComplete is set but pending decisions remain: ${stats.pending_decisions}`)
  }

  const summary = decisions.summary || {}
  for (const key of [
    'accept_candidate_decisions',
    'auto_approval_decisions',
    'completed_decisions',
    'decision_template_rows',
    'decisions_requiring_manual_confirmation',
    'evidence_ready_decisions',
    'more_evidence_decisions',
    'pending_decisions',
    'reject_generic_decisions',
    'source_anchor_exact_evidence_items',
    'split_activity_decisions',
    'unique_exact_anchor_evidence_items',
    'unique_parent_action_work_items',
    'unique_progression_groups',
    'unique_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`decisions summary.${key} mismatch`)
  }
  for (const key of ['by_decision_status', 'by_grade_band', 'by_group_review_route', 'by_item_review_surface', 'by_priority_tier', 'by_reviewer_decision', 'by_subject', 'by_work_queue']) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`decisions summary.${key} mismatch`)
  }
  if (stats.auto_approval_decisions) errors.push(`split review decisions must not auto-approve: ${stats.auto_approval_decisions}`)

  return {
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    require_complete: args.requireComplete,
    require_items: args.requireItems,
    summary: stats,
    surface: args.surface,
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
