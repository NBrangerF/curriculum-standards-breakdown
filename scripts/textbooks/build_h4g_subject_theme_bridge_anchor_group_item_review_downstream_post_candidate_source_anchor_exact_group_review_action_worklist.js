#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_action_worklist_anchor_domain_rejected_english_pe.md'

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
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--recommendations') args.recommendations = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_action_worklist.js \\
  --strict --require-items

Builds a non-public action worklist from source-anchor exact group review
recommendations. It does not edit decisions, approve standards, write public
data, change official standard text, or enable matcher/publication use.`)
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

function validateInputs(recommendations, decisions, args, errors) {
  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if ((recommendations.errors || []).length) errors.push('recommendations errors must be empty')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations') {
    errors.push('recommendations purpose mismatch')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (recommendations.source_exact_group_review_decisions !== args.decisions) {
    errors.push('recommendations source_exact_group_review_decisions must match decisions arg')
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

function actionWorkItemId(row) {
  return `h4g_anchor_group_post_candidate_source_anchor_exact_group_action_${hashText(row.exact_anchor_group_review_recommendation_id || row.decision_id)}`
}

function reviewQuestions(decision, recommendation, queue) {
  return [
    ...(decision.group_review_prompts || []),
    `Recommended queue: ${queue}`,
    `Recommended reviewer decision to consider: ${recommendation.recommended_reviewer_decision || 'missing'}`,
    'If adopted, update the editable exact group decision template with reviewer metadata and notes.',
    'Do not treat this work item as standard approval, matcher approval, or publication approval.'
  ].filter(Boolean)
}

function buildWorkItem(recommendation, decision, index) {
  const queue = workQueueForRecommendation(recommendation)
  return {
    action_work_item_id: actionWorkItemId(recommendation),
    action_work_item_is_not_decision: true,
    decision_id: recommendation.decision_id || '',
    exact_anchor_group_review_item_id: recommendation.exact_anchor_group_review_item_id || '',
    exact_anchor_group_review_recommendation_id: recommendation.exact_anchor_group_review_recommendation_id || '',
    grade_band: recommendation.grade_band || '',
    group_key: recommendation.group_key || '',
    group_review_route: recommendation.group_review_route || '',
    next_gate_after_action: recommendation.recommended_next_gate || '',
    page_evidence_summary: recommendation.page_evidence_summary || {},
    priority_tier: recommendation.priority_tier || '',
    recommendation_confidence: recommendation.recommendation_confidence || '',
    recommendation_reasons: recommendation.recommendation_reasons || [],
    recommendation_route: recommendation.recommendation_route || '',
    recommended_reviewer_decision_to_consider: recommendation.recommended_reviewer_decision || '',
    review_questions: reviewQuestions(decision, recommendation, queue),
    reviewer_action: reviewerActionForQueue(queue),
    risk_stats: recommendation.risk_stats || {},
    source_anchor_exact_evidence_items: Number(recommendation.source_anchor_exact_evidence_items || 0),
    source_decision_status: recommendation.source_decision_status || '',
    source_reviewer_decision: recommendation.source_reviewer_decision || '',
    standard_codes: recommendation.standard_codes || [],
    standard_preview: recommendation.standard_preview || [],
    subject_slug: recommendation.subject_slug || '',
    unique_standard_codes: Number(recommendation.unique_standard_codes || 0),
    unit_evidence_id: recommendation.unit_evidence_id || '',
    unit_title: recommendation.unit_title || '',
    work_queue: queue,
    worklist_rank: index + 1,
    writes_public_data: false
  }
}

function summarize(rows) {
  const summary = {
    action_work_items: rows.length,
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
    groups_with_multiple_standards: rows.filter(row => Number(row.unique_standard_codes || 0) > 1).length,
    max_rows_per_group: 0,
    reject_group_work_items: 0,
    source_anchor_exact_evidence_items: 0,
    split_group_work_items: 0,
    standard_level_ready_work_items: 0,
    unique_standard_codes: new Set(),
    unique_unit_evidence_ids: new Set()
  }
  for (const row of rows) {
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_group_review_route, row.group_review_route)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision_to_consider)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_recommendation_route, row.recommendation_route)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_work_queue, row.work_queue)
    summary.max_rows_per_group = Math.max(summary.max_rows_per_group, Number(row.source_anchor_exact_evidence_items || 0))
    summary.source_anchor_exact_evidence_items += Number(row.source_anchor_exact_evidence_items || 0)
    if (row.work_queue === 'split_overbroad_group_before_standard_level_review_queue') summary.split_group_work_items += 1
    if (row.work_queue === 'reject_overbroad_or_generic_group_queue') summary.reject_group_work_items += 1
    if (row.work_queue === 'collect_specific_unit_or_page_evidence_queue') summary.collect_specific_evidence_work_items += 1
    if (row.work_queue === 'standard_level_exact_anchor_review_queue') summary.standard_level_ready_work_items += 1
    for (const standard of row.standard_codes || []) summary.unique_standard_codes.add(standard)
    if (row.unit_evidence_id) summary.unique_unit_evidence_ids.add(row.unit_evidence_id)
  }
  summary.unique_standard_codes = summary.unique_standard_codes.size
  summary.unique_unit_evidence_ids = summary.unique_unit_evidence_ids.size
  return summary
}

function previewRows(rows) {
  return rows.map(row => (
    `| ${row.worklist_rank} | ${markdownCell(row.work_queue)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.subject_slug)} | ${row.source_anchor_exact_evidence_items} | ${row.unique_standard_codes} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | 0 | 0 | - |'
}

function markdownSummary(payload) {
  return `# H4G Source-Anchor Exact Group Review Action Worklist

Generated at: ${payload.generated_at}

This is a non-public action worklist derived from exact group review
recommendations. It does not edit decisions, approve standards, write public
data, enable matcher use, or mark publication readiness.

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| action work items | ${payload.summary.action_work_items} |
| split work items | ${payload.summary.split_group_work_items} |
| reject work items | ${payload.summary.reject_group_work_items} |
| collect evidence work items | ${payload.summary.collect_specific_evidence_work_items} |
| standard-level ready work items | ${payload.summary.standard_level_ready_work_items} |
| auto approval work items | ${payload.summary.auto_approval_work_items} |
| source-anchor exact evidence rows | ${payload.summary.source_anchor_exact_evidence_items} |

## Work Queues

| work queue | items |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Preview

| rank | queue | grade | subject | rows | standards | unit |
| ---: | --- | --- | --- | ---: | ---: | --- |
${previewRows(payload.exact_anchor_group_review_action_work_items || [])}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  for (const [label, path] of [['recommendations', args.recommendations], ['decisions', args.decisions]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const recommendations = errors.length ? { exact_anchor_group_review_recommendations: [] } : readJson(args.recommendations)
  const decisions = errors.length ? { exact_anchor_group_review_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateInputs(recommendations, decisions, args, errors)
  const decisionById = mapBy(decisions.exact_anchor_group_review_decisions || [], 'decision_id', errors, 'decisions')
  const rows = (recommendations.exact_anchor_group_review_recommendations || []).map((recommendation, index) => {
    const decision = decisionById.get(recommendation.decision_id)
    if (!decision) errors.push(`${recommendation.decision_id || '(missing decision_id)'} recommendation decision_id not found in decisions`)
    return buildWorkItem(recommendation, decision || {}, index)
  })
  if (args.requireItems && !rows.length) errors.push('requireItems is set but action worklist has no rows')
  const payload = {
    action_worklist_only: true,
    changes_official_standard_text: false,
    data_scope: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_action_worklist',
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    exact_anchor_group_review_action_work_items: rows,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_action_worklist',
    review_only: true,
    source_exact_group_review_decisions: args.decisions,
    source_exact_group_review_recommendations: args.recommendations,
    summary: summarize(rows),
    valid: errors.length === 0,
    writes_public_data: false
  }
  writeJson(args.out, payload)
  writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({ out: args.out, summary: payload.summary, valid: payload.valid }, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
if (args.help) usage()
else build(args)
