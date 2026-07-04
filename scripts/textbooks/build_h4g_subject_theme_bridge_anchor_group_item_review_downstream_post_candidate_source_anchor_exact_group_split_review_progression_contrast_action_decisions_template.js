#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template_anchor_domain_rejected_english_pe.md'

const DECISION_PENDING = 'pending'

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template.js \\
  --strict --require-items

Builds an editable progression-action decisions template from the H4G7/H4G8/H4G9
progression contrast action worklist. Every row starts pending. It does not
approve standards, write public/data, change official standard text, or enable
matcher/publication use.`)
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

function validateWorklist(worklist, args, errors) {
  if (worklist.valid !== true) errors.push('progression contrast action worklist valid must be true')
  if ((worklist.errors || []).length) errors.push('progression contrast action worklist errors must be empty')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_worklist') {
    errors.push('progression contrast action worklist purpose mismatch')
  }
  if (worklist.action_worklist_only !== true) errors.push('progression contrast action worklist action_worklist_only must be true')
  if (worklist.review_only !== true) errors.push('progression contrast action worklist review_only must be true')
  if (!Array.isArray(worklist.progression_contrast_action_work_items)) {
    errors.push('progression contrast action worklist rows must be an array')
  }
  if (args.requireItems && !(worklist.progression_contrast_action_work_items || []).length) {
    errors.push('requireItems is set but progression contrast action worklist has no rows')
  }
  validatePolicy('progression contrast action worklist', worklist, errors)
}

function decisionPolicy() {
  return {
    action_decision_is_not_matcher_approval: true,
    action_decision_is_not_publication_approval: true,
    changes_official_standard_text: false,
    decision_template_only: true,
    direct_matcher_use: false,
    editable_manual_review_template: true,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    progression_action_decision_template_only: true,
    publication_ready: false,
    requires_grade_specific_source_evidence_before_split_review: true,
    requires_later_split_review_decision_gate: true,
    writes_public_data: false
  }
}

function requiredConfirmations() {
  return {
    direct_matcher_use_rejected: true,
    grade_specific_evidence_recorded: false,
    h4g7_h4g8_h4g9_progression_context_checked: false,
    later_split_review_decision_gate_required: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    progression_group_id_checked: false,
    reviewer_metadata_recorded: false,
    sibling_grade_evidence_compared: false,
    source_page_or_activity_evidence_recorded: false
  }
}

function allowedDecisions(item) {
  const queue = item.work_queue || ''
  if (queue === 'repair_missing_public_sibling_progression_context_queue') {
    return [
      DECISION_PENDING,
      'confirm_sibling_progression_context_repaired_for_later_evidence_review',
      'needs_public_sibling_progression_context_repair',
      'mark_progression_group_not_full_h4g_triplet'
    ]
  }
  if (queue === 'prove_current_grade_specific_source_evidence_queue') {
    return [
      DECISION_PENDING,
      'confirm_current_grade_specific_evidence_for_later_split_decision',
      'needs_more_grade_specific_source_evidence',
      'reject_current_grade_anchor_as_shared_or_generic'
    ]
  }
  if (queue === 'collect_sibling_grade_source_evidence_queue') {
    return [
      DECISION_PENDING,
      'confirm_sibling_grade_evidence_collected_for_later_split_decision',
      'needs_sibling_grade_source_evidence',
      'reject_progression_action_until_sibling_evidence_exists'
    ]
  }
  if (queue === 'compare_sibling_grade_specific_evidence_queue') {
    return [
      DECISION_PENDING,
      'confirm_sibling_grade_evidence_compared_for_later_split_decision',
      'needs_sibling_grade_evidence_comparison',
      'reject_current_grade_anchor_as_shared_or_generic'
    ]
  }
  return [
    DECISION_PENDING,
    'manual_progression_text_check_completed_for_later_split_decision',
    'needs_manual_progression_text_repair',
    'reject_progression_action_until_sibling_evidence_exists'
  ]
}

function decisionId(item) {
  return `h4g_anchor_group_post_candidate_source_anchor_exact_group_split_review_progression_action_decision_${hashText(item.action_work_item_id)}`
}

function reviewPrompts(item) {
  return sorted([
    ...(item.manual_review_questions || []),
    'Use progression_group_id as the primary relationship key.',
    'Record exact source evidence before any later split-review accept candidate.',
    'If H4G7/H4G8/H4G9 share official standard text, prove the grade difference with source evidence, not wording alone.',
    'Leave official standard text unchanged.'
  ])
}

function decisionFromWorkItem(item) {
  return {
    action_work_item_rank: Number(item.worklist_rank || 0),
    allowed_decisions: allowedDecisions(item),
    approval_prohibited: true,
    changes_official_standard_text: false,
    contrast_routes: item.contrast_routes || [],
    decision_id: decisionId(item),
    decision_note: '',
    decision_policy: decisionPolicy(),
    decision_status: DECISION_PENDING,
    decision_template_only: true,
    decision_type: 'h4g_anchor_group_post_candidate_source_anchor_exact_group_split_review_progression_action_decision',
    direct_matcher_use: false,
    editable_manual_review_template: true,
    eligible_for_h4g_differentiation: false,
    evidence_notes: '',
    grade_specific_evidence_summary: '',
    has_full_h4g_triplet_context: item.has_full_h4g_triplet_context === true,
    manual_confirmation_required: true,
    matcher_ready: false,
    missing_sibling_grade_bands: item.missing_sibling_grade_bands || [],
    official_standard_texts_identical_across_siblings: item.official_standard_texts_identical_across_siblings === true,
    priority_tier: item.priority_tier || '',
    progression_action_decision_template_only: true,
    progression_decision_is_not_publication_approval: true,
    progression_group_id: item.progression_group_id || '',
    publication_ready: false,
    recommended_next_gate: item.recommended_next_gate || '',
    rejection_reason: '',
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: requiredConfirmations(),
    requires_reviewer_metadata: true,
    review_prompts: reviewPrompts(item),
    reviewer_action: item.reviewer_action || '',
    reviewer_decision: DECISION_PENDING,
    reviewer_id: '',
    reviewer_notes: '',
    reviewed_at: '',
    reviewed_by: '',
    selected_contrast_route: item.selected_contrast_route || '',
    sibling_context_notes: '',
    sibling_grade_bands: item.sibling_grade_bands || [],
    sibling_grade_context: item.sibling_grade_context || '',
    sibling_progression_records: item.sibling_progression_records || [],
    sibling_public_evidence_by_grade: item.sibling_public_evidence_by_grade || {},
    source_progression_action_work_item_id: item.action_work_item_id || '',
    source_progression_contrast_item_ids: item.source_progression_contrast_item_ids || [],
    source_progression_contrast_items: (item.source_progression_contrast_item_ids || []).length,
    split_review_item_count: Number(item.split_review_item_count || 0),
    split_review_items: item.split_review_items || [],
    split_surface_evidence_by_grade: item.split_surface_evidence_by_grade || {},
    split_surface_grade_bands_for_progression: item.split_surface_grade_bands_for_progression || [],
    standard_codes: item.standard_codes || [],
    subject_slug: item.subject_slug || '',
    unit_evidence_ids: item.unit_evidence_ids || [],
    unit_titles: item.unit_titles || [],
    work_queue: item.work_queue || '',
    writes_public_data: false
  }
}

function summarize(decisions, sourceRows) {
  const summary = {
    action_decision_template_rows: decisions.length,
    auto_approval_decisions: 0,
    by_allowed_decision_count: {},
    by_decision_status: {},
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_selected_contrast_route: {},
    by_sibling_grade_context: {},
    by_subject: {},
    by_work_queue: {},
    completed_decisions: 0,
    decision_template_rows: decisions.length,
    expected_action_work_items: sourceRows.length,
    manual_confirmation_required_decisions: 0,
    pending_decisions: 0,
    progression_action_decision_template_rows: decisions.length,
    public_write_decisions: 0,
    source_progression_contrast_items: sorted(sourceRows.flatMap(row => row.source_progression_contrast_item_ids || [])).length,
    source_progression_contrast_items_covered: sorted(decisions.flatMap(row => row.source_progression_contrast_item_ids || [])).length,
    unique_progression_groups: sorted(decisions.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(decisions.flatMap(row => row.standard_codes || [])).length,
    unique_unit_evidence_ids: sorted(decisions.flatMap(row => row.unit_evidence_ids || [])).length
  }
  for (const row of decisions) {
    countInto(summary.by_allowed_decision_count, String((row.allowed_decisions || []).length))
    countInto(summary.by_decision_status, row.decision_status)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_selected_contrast_route, row.selected_contrast_route)
    countInto(summary.by_sibling_grade_context, row.sibling_grade_context)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_work_queue, row.work_queue)
    if (row.reviewer_decision === DECISION_PENDING) summary.pending_decisions += 1
    else summary.completed_decisions += 1
    if (row.manual_confirmation_required === true) summary.manual_confirmation_required_decisions += 1
    if (row.writes_public_data !== false) summary.public_write_decisions += 1
  }
  return summary
}

function markdownSummary(payload) {
  return `# H4G Split Review Progression Contrast Action Decisions Template

Generated at: ${payload.generated_at}

This editable template converts progression-level action work items into
manual decision rows. All rows start pending. It does not write public/data,
change official standard text, approve standards, or enable matcher use.

## Summary

| field | value |
| --- | ---: |
| action decision template rows | ${payload.summary.action_decision_template_rows} |
| expected action work items | ${payload.summary.expected_action_work_items} |
| pending decisions | ${payload.summary.pending_decisions} |
| completed decisions | ${payload.summary.completed_decisions} |
| manual confirmation required decisions | ${payload.summary.manual_confirmation_required_decisions} |
| source progression contrast items | ${payload.summary.source_progression_contrast_items} |
| source progression contrast items covered | ${payload.summary.source_progression_contrast_items_covered} |
| public write decisions | ${payload.summary.public_write_decisions} |
| auto approval decisions | ${payload.summary.auto_approval_decisions} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Work Queues

| work queue | decisions |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Selected Contrast Routes

| route | decisions |
| --- | ---: |
${countRows(payload.summary.by_selected_contrast_route)}

## Preview

| rank | queue | progression group | split grades | standards | reviewer decision |
| ---: | --- | --- | --- | --- | --- |
${payload.progression_action_decisions.slice(0, 20).map(row => `| ${row.action_work_item_rank} | ${markdownCell(row.work_queue)} | ${markdownCell(row.progression_group_id)} | ${markdownCell((row.split_surface_grade_bands_for_progression || []).join('+'))} | ${truncate((row.standard_codes || []).join(', '), 120)} | ${markdownCell(row.reviewer_decision)} |`).join('\n') || '| - | - | - | - | - | - |'}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  if (!existsSync(args.worklist)) errors.push(`Missing progression contrast action worklist: ${args.worklist}`)
  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { progression_contrast_action_work_items: [] }
  if (!errors.length) validateWorklist(worklist, args, errors)
  const sourceRows = worklist.progression_contrast_action_work_items || []
  const decisions = sourceRows
    .slice()
    .sort((a, b) => Number(a.worklist_rank || 0) - Number(b.worklist_rank || 0) ||
      String(a.progression_group_id || '').localeCompare(String(b.progression_group_id || '')))
    .map(decisionFromWorkItem)
  const summary = summarize(decisions, sourceRows)
  if (summary.public_write_decisions) errors.push(`progression action decisions have public write decisions: ${summary.public_write_decisions}`)
  if (summary.auto_approval_decisions) errors.push(`progression action decisions must not auto-approve: ${summary.auto_approval_decisions}`)

  return {
    action_decisions_template_only: true,
    changes_official_standard_text: false,
    data_scope: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template',
    decision_template_only: true,
    direct_matcher_use: false,
    editable_manual_review_template: true,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: decisionPolicy(),
    progression_action_decision_template_only: true,
    progression_action_decisions: decisions,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template',
    review_only: true,
    source_progression_contrast_action_worklist: args.worklist,
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
