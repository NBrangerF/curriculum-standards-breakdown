#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template_anchor_domain_rejected_english_pe_audit.md'

const DECISION_PENDING = 'pending'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireComplete: false,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--worklist') args.worklist = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions.js \\
  --strict --require-items

Audits editable progression-action decisions against the progression contrast
action worklist. Pending decisions are valid by default. Completed decisions
must keep no-public-write, no-official-text-change, no-matcher, and
no-publication boundaries, and must include reviewer metadata and evidence notes.`)
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

function validateDecisionPolicy(label, policy, errors) {
  for (const key of [
    'action_decision_is_not_matcher_approval',
    'action_decision_is_not_publication_approval',
    'decision_template_only',
    'editable_manual_review_template',
    'progression_action_decision_template_only',
    'requires_grade_specific_source_evidence_before_split_review',
    'requires_later_split_review_decision_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
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

function validateTopLevel(decisions, worklist, args, errors) {
  if (decisions.valid !== true) errors.push('progression action decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('progression action decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template') {
    errors.push('progression action decisions purpose mismatch')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template') {
    errors.push('progression action decisions data_scope mismatch')
  }
  for (const key of ['action_decisions_template_only', 'decision_template_only', 'editable_manual_review_template', 'progression_action_decision_template_only', 'review_only']) {
    if (decisions[key] !== true) errors.push(`progression action decisions ${key} must be true`)
  }
  if (decisions.source_progression_contrast_action_worklist !== args.worklist) {
    errors.push('progression action decisions source worklist must match audit arg')
  }
  if (!Array.isArray(decisions.progression_action_decisions)) {
    errors.push('progression action decisions rows must be an array')
  }
  validatePolicy('progression action decisions', decisions, errors)
  validateDecisionPolicy('progression action decisions policy', decisions.policy || {}, errors)

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
  validatePolicy('progression contrast action worklist', worklist, errors)
}

function expectedStaticFields(item) {
  return {
    action_work_item_rank: Number(item.worklist_rank || 0),
    contrast_routes: item.contrast_routes || [],
    has_full_h4g_triplet_context: item.has_full_h4g_triplet_context === true,
    missing_sibling_grade_bands: item.missing_sibling_grade_bands || [],
    official_standard_texts_identical_across_siblings: item.official_standard_texts_identical_across_siblings === true,
    priority_tier: item.priority_tier || '',
    progression_group_id: item.progression_group_id || '',
    recommended_next_gate: item.recommended_next_gate || '',
    review_prompts: reviewPrompts(item),
    reviewer_action: item.reviewer_action || '',
    selected_contrast_route: item.selected_contrast_route || '',
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
    work_queue: item.work_queue || ''
  }
}

function actualStaticFields(row) {
  return {
    action_work_item_rank: Number(row.action_work_item_rank || 0),
    contrast_routes: row.contrast_routes || [],
    has_full_h4g_triplet_context: row.has_full_h4g_triplet_context === true,
    missing_sibling_grade_bands: row.missing_sibling_grade_bands || [],
    official_standard_texts_identical_across_siblings: row.official_standard_texts_identical_across_siblings === true,
    priority_tier: row.priority_tier || '',
    progression_group_id: row.progression_group_id || '',
    recommended_next_gate: row.recommended_next_gate || '',
    review_prompts: row.review_prompts || [],
    reviewer_action: row.reviewer_action || '',
    selected_contrast_route: row.selected_contrast_route || '',
    sibling_grade_bands: row.sibling_grade_bands || [],
    sibling_grade_context: row.sibling_grade_context || '',
    sibling_progression_records: row.sibling_progression_records || [],
    sibling_public_evidence_by_grade: row.sibling_public_evidence_by_grade || {},
    source_progression_action_work_item_id: row.source_progression_action_work_item_id || '',
    source_progression_contrast_item_ids: row.source_progression_contrast_item_ids || [],
    source_progression_contrast_items: Number(row.source_progression_contrast_items || 0),
    split_review_item_count: Number(row.split_review_item_count || 0),
    split_review_items: row.split_review_items || [],
    split_surface_evidence_by_grade: row.split_surface_evidence_by_grade || {},
    split_surface_grade_bands_for_progression: row.split_surface_grade_bands_for_progression || [],
    standard_codes: row.standard_codes || [],
    subject_slug: row.subject_slug || '',
    unit_evidence_ids: row.unit_evidence_ids || [],
    unit_titles: row.unit_titles || [],
    work_queue: row.work_queue || ''
  }
}

function completedDecisionRequires(row) {
  const decision = row.reviewer_decision || ''
  if (decision === 'confirm_sibling_progression_context_repaired_for_later_evidence_review') return ['sibling_context_notes']
  if (decision === 'needs_public_sibling_progression_context_repair') return ['sibling_context_notes']
  if (decision === 'mark_progression_group_not_full_h4g_triplet') return ['sibling_context_notes']
  if (decision === 'confirm_current_grade_specific_evidence_for_later_split_decision') return ['grade_specific_evidence_summary', 'evidence_notes']
  if (decision === 'needs_more_grade_specific_source_evidence') return ['evidence_notes']
  if (decision === 'reject_current_grade_anchor_as_shared_or_generic') return ['rejection_reason']
  if (decision === 'confirm_sibling_grade_evidence_collected_for_later_split_decision') return ['sibling_context_notes', 'evidence_notes']
  if (decision === 'needs_sibling_grade_source_evidence') return ['sibling_context_notes']
  if (decision === 'reject_progression_action_until_sibling_evidence_exists') return ['rejection_reason']
  if (decision === 'confirm_sibling_grade_evidence_compared_for_later_split_decision') return ['sibling_context_notes', 'grade_specific_evidence_summary']
  if (decision === 'needs_sibling_grade_evidence_comparison') return ['sibling_context_notes']
  if (decision === 'manual_progression_text_check_completed_for_later_split_decision') return ['reviewer_notes']
  if (decision === 'needs_manual_progression_text_repair') return ['reviewer_notes']
  return ['reviewer_notes']
}

function validateEditableFields(row, source, errors, stats) {
  const prefix = row.decision_id || row.source_progression_action_work_item_id || '(missing decision)'
  if (!sameJson(row.allowed_decisions || [], allowedDecisions(source))) errors.push(`${prefix} allowed_decisions mismatch`)
  if (!allowedDecisions(source).includes(row.reviewer_decision)) {
    errors.push(`${prefix} reviewer_decision is not allowed: ${row.reviewer_decision}`)
  }
  if (!sameJson(row.decision_policy || {}, decisionPolicy())) errors.push(`${prefix} decision_policy mismatch`)
  if (!sameJson(row.required_confirmations || {}, requiredConfirmations())) {
    errors.push(`${prefix} required_confirmations mismatch`)
  }
  validatePolicy(prefix, row, errors)
  if (row.approval_prohibited !== true) errors.push(`${prefix} approval_prohibited must be true`)
  if (row.decision_template_only !== true) errors.push(`${prefix} decision_template_only must be true`)
  if (row.editable_manual_review_template !== true) errors.push(`${prefix} editable_manual_review_template must be true`)
  if (row.progression_action_decision_template_only !== true) {
    errors.push(`${prefix} progression_action_decision_template_only must be true`)
  }
  if (row.progression_decision_is_not_publication_approval !== true) {
    errors.push(`${prefix} progression_decision_is_not_publication_approval must be true`)
  }
  if (row.manual_confirmation_required !== true) errors.push(`${prefix} manual_confirmation_required must be true`)
  if (row.requires_reviewer_metadata !== true) errors.push(`${prefix} requires_reviewer_metadata must be true`)
  if (row.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (row.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (row.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
  if (row.requested_eligible_for_h4g_differentiation !== false) {
    errors.push(`${prefix} requested_eligible_for_h4g_differentiation must be false`)
  }
  if (row.reviewer_decision === DECISION_PENDING) {
    if (row.decision_status !== DECISION_PENDING) errors.push(`${prefix} pending decision_status mismatch`)
    stats.pending_decisions += 1
    return
  }

  stats.completed_decisions += 1
  if (row.decision_status !== 'reviewed') errors.push(`${prefix} completed decision_status must be reviewed`)
  if (!hasText(row.reviewed_by) && !hasText(row.reviewer_id)) errors.push(`${prefix} reviewed_by or reviewer_id required for completed decision`)
  if (!validReviewDate(row.reviewed_at)) errors.push(`${prefix} reviewed_at must start with YYYY-MM-DD`)
  if (!hasText(row.reviewer_notes) && !hasText(row.decision_note)) {
    errors.push(`${prefix} completed decision requires reviewer_notes or decision_note`)
  }
  for (const field of completedDecisionRequires(row)) {
    if (!hasText(row[field])) errors.push(`${prefix} completed decision requires ${field}`)
  }
}

function emptyStats(worklist) {
  const sourceRows = worklist.progression_contrast_action_work_items || []
  return {
    action_decision_template_rows: 0,
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
    decision_template_rows: 0,
    duplicate_decisions: 0,
    expected_action_work_items: sourceRows.length,
    extra_decisions: 0,
    manual_confirmation_required_decisions: 0,
    missing_decisions: 0,
    pending_decisions: 0,
    progression_action_decision_template_rows: 0,
    public_write_decisions: 0,
    row_mismatch_decisions: 0,
    source_progression_contrast_items: sorted(sourceRows.flatMap(row => row.source_progression_contrast_item_ids || [])).length,
    source_progression_contrast_items_covered: 0,
    unique_progression_groups: sorted(sourceRows.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(sourceRows.flatMap(row => row.standard_codes || [])).length,
    unique_unit_evidence_ids: sorted(sourceRows.flatMap(row => row.unit_evidence_ids || [])).length
  }
}

function validateDecision(row, source, errors, stats) {
  const prefix = row.decision_id || row.source_progression_action_work_item_id || '(missing decision)'
  if (row.decision_id !== decisionId(source)) {
    errors.push(`${prefix} decision_id mismatch`)
    stats.row_mismatch_decisions += 1
  }
  if (row.decision_type !== 'h4g_anchor_group_post_candidate_source_anchor_exact_group_split_review_progression_action_decision') {
    errors.push(`${prefix} decision_type mismatch`)
    stats.row_mismatch_decisions += 1
  }
  if (!sameJson(actualStaticFields(row), expectedStaticFields(source))) {
    errors.push(`${prefix} static fields do not match source action work item`)
    stats.row_mismatch_decisions += 1
  }
  validateEditableFields(row, source, errors, stats)

  stats.action_decision_template_rows += 1
  stats.decision_template_rows += 1
  stats.progression_action_decision_template_rows += 1
  if (row.manual_confirmation_required === true) stats.manual_confirmation_required_decisions += 1
  if (row.writes_public_data !== false) stats.public_write_decisions += 1
  countInto(stats.by_allowed_decision_count, String((row.allowed_decisions || []).length))
  countInto(stats.by_decision_status, row.decision_status)
  countInto(stats.by_priority_tier, row.priority_tier)
  countInto(stats.by_reviewer_decision, row.reviewer_decision)
  countInto(stats.by_selected_contrast_route, row.selected_contrast_route)
  countInto(stats.by_sibling_grade_context, row.sibling_grade_context)
  countInto(stats.by_subject, row.subject_slug)
  countInto(stats.by_work_queue, row.work_queue)
}

function markdownSummary(payload) {
  return `# H4G Split Review Progression Contrast Action Decisions Audit

Generated at: ${payload.generated_at}

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| expected action work items | ${payload.summary.expected_action_work_items} |
| audited decision rows | ${payload.summary.action_decision_template_rows} |
| missing decisions | ${payload.summary.missing_decisions} |
| extra decisions | ${payload.summary.extra_decisions} |
| duplicate decisions | ${payload.summary.duplicate_decisions} |
| row mismatch decisions | ${payload.summary.row_mismatch_decisions} |
| pending decisions | ${payload.summary.pending_decisions} |
| completed decisions | ${payload.summary.completed_decisions} |
| source progression contrast items | ${payload.summary.source_progression_contrast_items} |
| source progression contrast items covered | ${payload.summary.source_progression_contrast_items_covered} |
| public write decisions | ${payload.summary.public_write_decisions} |
| auto approval decisions | ${payload.summary.auto_approval_decisions} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Work Queues

| work queue | rows |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Reviewer Decisions

| reviewer decision | rows |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of Object.entries({ decisions: args.decisions, worklist: args.worklist })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { progression_action_decisions: [] }
  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { progression_contrast_action_work_items: [] }
  if (!errors.length) validateTopLevel(decisions, worklist, args, errors)

  const sourceById = mapBy(worklist.progression_contrast_action_work_items || [], 'action_work_item_id', errors, 'source action work item')
  const decisionBySourceId = mapBy(decisions.progression_action_decisions || [], 'source_progression_action_work_item_id', errors, 'progression action decision')
  const stats = emptyStats(worklist)
  const coveredSourceContrastIds = []

  for (const [sourceId, source] of sourceById.entries()) {
    const row = decisionBySourceId.get(sourceId)
    if (!row) {
      stats.missing_decisions += 1
      errors.push(`${sourceId} missing progression action decision`)
      continue
    }
    coveredSourceContrastIds.push(...(row.source_progression_contrast_item_ids || []))
    validateDecision(row, source, errors, stats)
  }
  for (const sourceId of decisionBySourceId.keys()) {
    if (!sourceById.has(sourceId)) {
      stats.extra_decisions += 1
      errors.push(`${sourceId} unexpected progression action decision`)
    }
  }
  stats.source_progression_contrast_items_covered = sorted(coveredSourceContrastIds).length

  if (args.requireItems && !stats.action_decision_template_rows) {
    errors.push('requireItems is set but no progression action decisions were audited')
  }
  if (args.requireComplete && stats.pending_decisions) {
    errors.push(`requireComplete is set but pending decisions remain: ${stats.pending_decisions}`)
  }

  const summary = decisions.summary || {}
  for (const key of [
    'action_decision_template_rows',
    'auto_approval_decisions',
    'completed_decisions',
    'decision_template_rows',
    'expected_action_work_items',
    'manual_confirmation_required_decisions',
    'pending_decisions',
    'progression_action_decision_template_rows',
    'public_write_decisions',
    'source_progression_contrast_items',
    'source_progression_contrast_items_covered',
    'unique_progression_groups',
    'unique_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`progression action decisions summary.${key} mismatch`)
  }
  for (const key of ['by_allowed_decision_count', 'by_decision_status', 'by_priority_tier', 'by_reviewer_decision', 'by_selected_contrast_route', 'by_sibling_grade_context', 'by_subject', 'by_work_queue']) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`progression action decisions summary.${key} mismatch`)
  }
  if (stats.public_write_decisions) errors.push(`progression action decisions must not write public data: ${stats.public_write_decisions}`)
  if (stats.auto_approval_decisions) errors.push(`progression action decisions must not auto-approve: ${stats.auto_approval_decisions}`)

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
  console.log(JSON.stringify({
    out: args.out,
    summary: payload.summary,
    valid: payload.valid
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
