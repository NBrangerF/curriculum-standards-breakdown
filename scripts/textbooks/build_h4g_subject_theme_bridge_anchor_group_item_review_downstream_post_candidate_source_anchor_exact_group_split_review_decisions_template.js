#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_SURFACE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_surface_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template_anchor_domain_rejected_english_pe.md'

const DECISION_PENDING = 'pending'
const DECISION_ACCEPT_CANDIDATE = 'accept_standard_exact_anchor_for_later_decision_candidate'
const DECISION_REJECT_GENERIC = 'reject_standard_anchor_as_overbroad_or_generic'
const DECISION_NEEDS_MORE_EVIDENCE = 'needs_more_specific_source_evidence'
const DECISION_SPLIT_ACTIVITY = 'split_to_activity_or_task_level_review'

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    surface: DEFAULT_SURFACE
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--surface') args.surface = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template.js \\
  --strict --require-items

Builds an editable standard-level decisions template from the exact group split
review surface. Every row starts pending. A completed "accept" only creates a
later decision candidate; it does not approve standards, write public/data,
change official standard text, or enable matcher/publication use.`)
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

function validateSurface(surface, args, errors) {
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
    errors.push('split review surface exact_anchor_group_split_review_items must be an array')
  }
  if (args.requireItems && !(surface.exact_anchor_group_split_review_items || []).length) {
    errors.push('requireItems is set but split review surface has no rows')
  }
  validatePolicy('split review surface', surface, errors)
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

function decisionFromSplitReviewItem(item) {
  return {
    allowed_decisions: allowedDecisions(item),
    anchor_requirement_summary: item.anchor_requirement_summary || '',
    changes_official_standard_text: false,
    decision_id: decisionId(item),
    decision_note: '',
    decision_policy: decisionPolicy(),
    decision_status: 'pending',
    decision_type: 'h4g_anchor_group_post_candidate_source_anchor_exact_group_split_review_decision',
    direct_matcher_use: false,
    downstream_action_decision_id: item.downstream_action_decision_id || '',
    eligible_for_h4g_differentiation: false,
    evidence_quality: '',
    exact_activity_or_task: '',
    exact_anchor_evidence_packet_id: item.exact_anchor_evidence_packet_id || '',
    exact_anchor_group_review_item_id: item.exact_anchor_group_review_item_id || '',
    exact_anchor_group_review_recommendation_id: item.exact_anchor_group_review_recommendation_id || '',
    exact_evidence_note: '',
    exact_evidence_quote: '',
    exact_page_reference: '',
    grade_band: item.grade_band || '',
    grade_specific_difference_note: '',
    group_key: item.group_key || '',
    group_review_route: item.group_review_route || '',
    h4g_distinctiveness_note: '',
    item_review_surface: item.item_review_surface || '',
    matcher_ready: false,
    more_evidence_needed: '',
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
    publication_ready: false,
    rejection_reason: '',
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: requiredConfirmations(),
    review_grain: item.review_grain || '',
    review_prompts: reviewPrompts(item),
    reviewer_decision: DECISION_PENDING,
    reviewer_note: '',
    reviewed_at: '',
    reviewed_by: '',
    risk_profile: item.risk_profile || {},
    risk_signals: item.risk_signals || [],
    source_anchor_review_recommendation_id: item.source_anchor_review_recommendation_id || '',
    source_key: item.source_key || '',
    source_split_review_item_id: item.split_review_item_id || '',
    source_standard_context: item.source_standard_context || {},
    split_instruction: '',
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
    worklist_rank: Number(item.worklist_rank || 0),
    writes_public_data: false
  }
}

function summarize(decisions) {
  const summary = {
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
    decision_template_rows: decisions.length,
    decisions_requiring_manual_confirmation: decisions.length,
    evidence_ready_decisions: 0,
    more_evidence_decisions: 0,
    pending_decisions: 0,
    reject_generic_decisions: 0,
    source_anchor_exact_evidence_items: decisions.length,
    split_activity_decisions: 0,
    unique_exact_anchor_evidence_items: sorted(decisions.map(row => row.exact_anchor_evidence_packet_id)).length,
    unique_parent_action_work_items: sorted(decisions.map(row => row.parent_action_work_item_id)).length,
    unique_progression_groups: sorted(decisions.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(decisions.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(decisions.map(row => row.unit_evidence_id)).length
  }
  for (const row of decisions) {
    countInto(summary.by_decision_status, row.decision_status)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_group_review_route, row.group_review_route)
    countInto(summary.by_item_review_surface, row.item_review_surface)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_work_queue, row.work_queue)
    if (row.reviewer_decision === DECISION_PENDING) summary.pending_decisions += 1
    else summary.completed_decisions += 1
    if (row.reviewer_decision === DECISION_ACCEPT_CANDIDATE) summary.accept_candidate_decisions += 1
    if (row.reviewer_decision === DECISION_REJECT_GENERIC) summary.reject_generic_decisions += 1
    if (row.reviewer_decision === DECISION_NEEDS_MORE_EVIDENCE) summary.more_evidence_decisions += 1
    if (row.reviewer_decision === DECISION_SPLIT_ACTIVITY) summary.split_activity_decisions += 1
    if (row.page_evidence_context?.ready_for_manual_review === true) summary.evidence_ready_decisions += 1
  }
  return summary
}

function markdownSummary(payload) {
  return `# H4G Source-Anchor Exact Group Split Review Decisions Template

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| decision template rows | ${payload.summary.decision_template_rows} |
| pending decisions | ${payload.summary.pending_decisions} |
| completed decisions | ${payload.summary.completed_decisions} |
| accept candidate decisions | ${payload.summary.accept_candidate_decisions} |
| reject generic decisions | ${payload.summary.reject_generic_decisions} |
| more evidence decisions | ${payload.summary.more_evidence_decisions} |
| split activity decisions | ${payload.summary.split_activity_decisions} |
| auto approval decisions | ${payload.summary.auto_approval_decisions} |
| source-anchor exact evidence rows | ${payload.summary.source_anchor_exact_evidence_items} |
| unique standards | ${payload.summary.unique_standard_codes} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Grade Bands

| grade band | decisions |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Work Queues

| work queue | decisions |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Preview

| rank | grade | standard | unit | reviewer decision |
| ---: | --- | --- | --- | --- |
${payload.split_review_decisions.slice(0, 20).map(row => `| ${row.worklist_rank} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${truncate(row.unit_title)} | ${markdownCell(row.reviewer_decision)} |`).join('\n') || '| - | - | - | - | - |'}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  if (!existsSync(args.surface)) errors.push(`Missing split review surface: ${args.surface}`)
  const surface = existsSync(args.surface) ? readJson(args.surface) : { exact_anchor_group_split_review_items: [] }
  if (!errors.length) validateSurface(surface, args, errors)

  const decisions = (surface.exact_anchor_group_split_review_items || [])
    .slice()
    .sort((a, b) => Number(a.worklist_rank || 0) - Number(b.worklist_rank || 0) ||
      String(a.standard_code || '').localeCompare(String(b.standard_code || '')) ||
      String(a.exact_anchor_evidence_packet_id || '').localeCompare(String(b.exact_anchor_evidence_packet_id || '')))
    .map(decisionFromSplitReviewItem)
  const summary = summarize(decisions)
  if (summary.auto_approval_decisions) errors.push(`split review decisions must not auto-approve: ${summary.auto_approval_decisions}`)

  return {
    changes_official_standard_text: false,
    data_scope: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template',
    decision_template_only: true,
    direct_matcher_use: false,
    editable_manual_review_template: true,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: decisionPolicy(),
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template',
    review_only: true,
    source_exact_group_split_review_surface: args.surface,
    split_review_decisions: decisions,
    split_standard_decision_template_only: true,
    standard_level_exact_anchor_decision_candidate_only: true,
    summary,
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
  const payload = build(args)
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
