#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_action_worklist_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_action_worklist_anchor_domain_rejected_english_pe_audit.md'

const DECISION_SPLIT_GROUP = 'split_group_before_standard_level_review'
const DECISION_REJECT_GROUP = 'reject_group_as_overbroad_unit_or_generic_theme'
const DECISION_NEEDS_EVIDENCE = 'needs_additional_unit_or_page_evidence'
const DECISION_READY_FOR_STANDARD_LEVEL = 'group_evidence_ready_for_standard_level_exact_anchor_review'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    recommendations: DEFAULT_RECOMMENDATIONS,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--recommendations') args.recommendations = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_action_worklist.js \\
  --strict --require-items

Audits the source-anchor exact group review action worklist against exact group
review recommendations and decisions.`)
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

function validateTopLevel(worklist, recommendations, decisions, args, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if ((worklist.errors || []).length) errors.push('worklist errors must be empty')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_action_worklist') {
    errors.push('worklist purpose mismatch')
  }
  if (worklist.action_worklist_only !== true) errors.push('worklist action_worklist_only must be true')
  if (worklist.review_only !== true) errors.push('worklist review_only must be true')
  if (worklist.source_exact_group_review_recommendations !== args.recommendations) {
    errors.push('worklist source_exact_group_review_recommendations must match audit arg')
  }
  if (worklist.source_exact_group_review_decisions !== args.decisions) {
    errors.push('worklist source_exact_group_review_decisions must match audit arg')
  }
  if (!Array.isArray(worklist.exact_anchor_group_review_action_work_items)) {
    errors.push('worklist exact_anchor_group_review_action_work_items must be an array')
  }
  validatePolicy('worklist', worklist, errors)

  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if ((recommendations.errors || []).length) errors.push('recommendations errors must be empty')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations') {
    errors.push('recommendations purpose mismatch')
  }
  if (!Array.isArray(recommendations.exact_anchor_group_review_recommendations)) {
    errors.push('recommendations exact_anchor_group_review_recommendations must be an array')
  }
  validatePolicy('recommendations', recommendations, errors)

  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (!Array.isArray(decisions.exact_anchor_group_review_decisions)) {
    errors.push('decisions exact_anchor_group_review_decisions must be an array')
  }
  validatePolicy('decisions', decisions, errors)
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

function workQueueForRecommendation(row) {
  const recommendation = row.recommended_reviewer_decision || ''
  if (recommendation === DECISION_SPLIT_GROUP) return 'split_overbroad_group_before_standard_level_review_queue'
  if (recommendation === DECISION_REJECT_GROUP) return 'reject_overbroad_or_generic_group_queue'
  if (recommendation === DECISION_NEEDS_EVIDENCE) return 'collect_specific_unit_or_page_evidence_queue'
  if (recommendation === DECISION_READY_FOR_STANDARD_LEVEL) return 'standard_level_exact_anchor_review_queue'
  return 'manual_group_review_queue'
}

function reviewerActionForQueue(queue) {
  if (queue === 'split_overbroad_group_before_standard_level_review_queue') return 'create_subgroup_or_standard_level_exact_anchor_review_surface'
  if (queue === 'reject_overbroad_or_generic_group_queue') return 'prepare_overbroad_group_rejection_candidate_for_audit'
  if (queue === 'collect_specific_unit_or_page_evidence_queue') return 'collect_more_specific_same_grade_unit_or_page_evidence'
  if (queue === 'standard_level_exact_anchor_review_queue') return 'prepare_standard_level_exact_anchor_review_surface'
  return 'perform_manual_exact_group_review'
}

function auditWorkItem(row, recommendation, decision, errors, stats) {
  const prefix = row.action_work_item_id || row.decision_id || '(missing action work item)'
  if (row.action_work_item_is_not_decision !== true) errors.push(`${prefix} action_work_item_is_not_decision must be true`)
  if (row.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
  if (!recommendation) {
    errors.push(`${prefix} decision_id not found in recommendations`)
    return
  }
  if (!decision) {
    errors.push(`${prefix} decision_id not found in decisions`)
    return
  }
  const expectedQueue = workQueueForRecommendation(recommendation)
  if (row.work_queue !== expectedQueue) errors.push(`${prefix} work_queue must be ${expectedQueue}`)
  const expectedAction = reviewerActionForQueue(expectedQueue)
  if (row.reviewer_action !== expectedAction) errors.push(`${prefix} reviewer_action must be ${expectedAction}`)
  const checks = [
    ['exact_anchor_group_review_item_id', row.exact_anchor_group_review_item_id, recommendation.exact_anchor_group_review_item_id],
    ['exact_anchor_group_review_recommendation_id', row.exact_anchor_group_review_recommendation_id, recommendation.exact_anchor_group_review_recommendation_id],
    ['grade_band', row.grade_band, recommendation.grade_band],
    ['group_key', row.group_key, recommendation.group_key],
    ['group_review_route', row.group_review_route, recommendation.group_review_route],
    ['priority_tier', row.priority_tier, recommendation.priority_tier],
    ['recommendation_confidence', row.recommendation_confidence, recommendation.recommendation_confidence],
    ['recommendation_route', row.recommendation_route, recommendation.recommendation_route],
    ['recommended_reviewer_decision_to_consider', row.recommended_reviewer_decision_to_consider, recommendation.recommended_reviewer_decision],
    ['source_anchor_exact_evidence_items', row.source_anchor_exact_evidence_items, recommendation.source_anchor_exact_evidence_items],
    ['source_decision_status', row.source_decision_status, recommendation.source_decision_status],
    ['source_reviewer_decision', row.source_reviewer_decision, recommendation.source_reviewer_decision],
    ['subject_slug', row.subject_slug, recommendation.subject_slug],
    ['unique_standard_codes', row.unique_standard_codes, recommendation.unique_standard_codes],
    ['unit_evidence_id', row.unit_evidence_id, recommendation.unit_evidence_id],
    ['unit_title', row.unit_title, recommendation.unit_title]
  ]
  for (const [field, actual, expected] of checks) {
    if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} ${field} must match recommendation`)
  }
  if (!sameJson(row.standard_codes || [], recommendation.standard_codes || [])) {
    errors.push(`${prefix} standard_codes must match recommendation`)
  }
  if (!sameJson(row.risk_stats || {}, recommendation.risk_stats || {})) {
    errors.push(`${prefix} risk_stats must match recommendation`)
  }
  if (!sameJson(row.page_evidence_summary || {}, recommendation.page_evidence_summary || {})) {
    errors.push(`${prefix} page_evidence_summary must match recommendation`)
  }
  if (!sameJson(row.standard_preview || [], recommendation.standard_preview || [])) {
    errors.push(`${prefix} standard_preview must match recommendation`)
  }
  if (!Array.isArray(row.review_questions) || row.review_questions.length < (decision.group_review_prompts || []).length) {
    errors.push(`${prefix} review_questions must include source group review prompts`)
  }
  if (row.recommended_reviewer_decision_to_consider === DECISION_READY_FOR_STANDARD_LEVEL) {
    errors.push(`${prefix} must not route to standard-level ready before completed group decision`)
  }
  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_group_review_route, row.group_review_route)
  countInto(stats.by_priority_tier, row.priority_tier)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision_to_consider)
  countInto(stats.by_recommendation_confidence, row.recommendation_confidence)
  countInto(stats.by_recommendation_route, row.recommendation_route)
  countInto(stats.by_subject, row.subject_slug)
  countInto(stats.by_work_queue, row.work_queue)
  stats.max_rows_per_group = Math.max(stats.max_rows_per_group, Number(row.source_anchor_exact_evidence_items || 0))
  stats.source_anchor_exact_evidence_items += Number(row.source_anchor_exact_evidence_items || 0)
  if (Number(row.unique_standard_codes || 0) > 1) stats.groups_with_multiple_standards += 1
  for (const standard of row.standard_codes || []) stats.unique_standard_codes.add(standard)
  if (row.unit_evidence_id) stats.unique_unit_evidence_ids.add(row.unit_evidence_id)
  if (row.work_queue === 'split_overbroad_group_before_standard_level_review_queue') stats.split_group_work_items += 1
  if (row.work_queue === 'reject_overbroad_or_generic_group_queue') stats.reject_group_work_items += 1
  if (row.work_queue === 'collect_specific_unit_or_page_evidence_queue') stats.collect_specific_evidence_work_items += 1
  if (row.work_queue === 'standard_level_exact_anchor_review_queue') stats.standard_level_ready_work_items += 1
}

function auditSummary(worklist, stats, errors) {
  const summary = worklist.summary || {}
  const finalized = {
    ...stats,
    unique_standard_codes: stats.unique_standard_codes.size,
    unique_unit_evidence_ids: stats.unique_unit_evidence_ids.size
  }
  for (const field of [
    'action_work_items',
    'auto_approval_work_items',
    'collect_specific_evidence_work_items',
    'groups_with_multiple_standards',
    'max_rows_per_group',
    'reject_group_work_items',
    'source_anchor_exact_evidence_items',
    'split_group_work_items',
    'standard_level_ready_work_items',
    'unique_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (Number(summary[field] || 0) !== Number(finalized[field] || 0)) errors.push(`summary.${field} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Source-Anchor Exact Group Review Action Worklist Audit

Generated at: ${payload.generated_at}

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| expected recommendations | ${payload.summary.expected_recommendations} |
| action work items | ${payload.summary.action_work_items} |
| missing work items | ${payload.summary.missing_work_items} |
| extra work items | ${payload.summary.extra_work_items} |
| split work items | ${payload.summary.split_group_work_items} |
| reject work items | ${payload.summary.reject_group_work_items} |
| collect evidence work items | ${payload.summary.collect_specific_evidence_work_items} |
| standard-level ready work items | ${payload.summary.standard_level_ready_work_items} |
| auto approval work items | ${payload.summary.auto_approval_work_items} |

## Work Queues

| work queue | items |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [['worklist', args.worklist], ['recommendations', args.recommendations], ['decisions', args.decisions]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { exact_anchor_group_review_action_work_items: [] }
  const recommendations = existsSync(args.recommendations) ? readJson(args.recommendations) : { exact_anchor_group_review_recommendations: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { exact_anchor_group_review_decisions: [] }
  if (!errors.length) validateTopLevel(worklist, recommendations, decisions, args, errors)

  const recommendationRows = recommendations.exact_anchor_group_review_recommendations || []
  const workRows = worklist.exact_anchor_group_review_action_work_items || []
  const recommendationByDecisionId = mapBy(recommendationRows, 'decision_id', errors, 'recommendations')
  const decisionById = mapBy(decisions.exact_anchor_group_review_decisions || [], 'decision_id', errors, 'decisions')
  const workByDecisionId = mapBy(workRows, 'decision_id', errors, 'worklist')
  const stats = {
    action_work_items: workRows.length,
    auto_approval_work_items: 0,
    by_grade_band: {},
    by_group_review_route: {},
    by_priority_tier: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_recommendation_route: {},
    by_subject: {},
    by_work_queue: {},
    collect_specific_evidence_work_items: 0,
    expected_recommendations: recommendationRows.length,
    extra_work_items: 0,
    groups_with_multiple_standards: 0,
    max_rows_per_group: 0,
    missing_work_items: 0,
    reject_group_work_items: 0,
    source_anchor_exact_evidence_items: 0,
    split_group_work_items: 0,
    standard_level_ready_work_items: 0,
    unique_standard_codes: new Set(),
    unique_unit_evidence_ids: new Set()
  }
  for (const row of workRows) {
    auditWorkItem(row, recommendationByDecisionId.get(row.decision_id), decisionById.get(row.decision_id), errors, stats)
  }
  for (const recommendation of recommendationRows) {
    if (!workByDecisionId.has(recommendation.decision_id)) {
      stats.missing_work_items += 1
      errors.push(`${recommendation.decision_id} missing exact group action work item`)
    }
  }
  for (const row of workRows) {
    if (!recommendationByDecisionId.has(row.decision_id)) stats.extra_work_items += 1
  }
  if (args.requireItems && !workRows.length) errors.push('requireItems is set but worklist has no rows')
  if (stats.standard_level_ready_work_items) {
    errors.push(`action worklist must not route groups to standard-level ready yet: ${stats.standard_level_ready_work_items}`)
  }
  if (stats.auto_approval_work_items) errors.push(`action worklist must not auto-approve: ${stats.auto_approval_work_items}`)
  auditSummary(worklist, stats, errors)

  const summary = {
    ...stats,
    unique_standard_codes: stats.unique_standard_codes.size,
    unique_unit_evidence_ids: stats.unique_unit_evidence_ids.size
  }
  const payload = {
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    recommendations: args.recommendations,
    summary,
    valid: errors.length === 0,
    worklist: args.worklist,
    writes_public_data: false
  }
  writeJson(args.out, payload)
  writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({ out: args.out, summary: payload.summary, valid: payload.valid }, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
if (args.help) usage()
else audit(args)
