#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_action_worklist.json'
const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_recommendations.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_decisions_template.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_action_worklist_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_action_worklist_audit.md'

const ROUTE_TO_QUEUE = {
  manual_candidate_rebuild_required: 'unit_candidate_rebuild_queue',
  source_anchor_specificity_review_required: 'unit_source_anchor_specificity_review_queue',
  source_anchor_specificity_review_with_page_gaps: 'unit_source_anchor_specificity_page_gap_queue'
}

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
node scripts/textbooks/audit_h4g_unit_evidence_anchor_policy_review_action_worklist.js \\
  --strict --require-items

Audits the H4G unit-evidence anchor-policy action worklist against
recommendation-only rows and the editable anchor-policy decisions template.`)
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

function validateWorklistPolicy(label, policy, errors) {
  validatePolicy(label, policy, errors)
  for (const key of [
    'recommendation_only',
    'requires_later_candidate_coverage_recheck',
    'requires_later_consistency_gate',
    'requires_later_manual_review',
    'requires_later_publication_gate',
    'review_batch_only',
    'worklist_only'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
}

function validateTopLevel(worklist, recommendations, decisions, args, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_unit_evidence_anchor_policy_review_action_worklist') {
    errors.push('worklist purpose mismatch')
  }
  if (worklist.source_anchor_policy_review_recommendations !== args.recommendations) {
    errors.push('worklist source recommendations must match audit arg')
  }
  if (worklist.source_anchor_policy_review_decisions !== args.decisions) {
    errors.push('worklist source decisions must match audit arg')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  if (worklist.recommendation_only !== true) errors.push('worklist recommendation_only must be true')
  if (worklist.review_batch_only !== true) errors.push('worklist review_batch_only must be true')
  validatePolicy('worklist', worklist, errors)
  validateWorklistPolicy('worklist policy', worklist.policy || {}, errors)

  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_unit_evidence_anchor_policy_review_recommendations') {
    errors.push('recommendations purpose mismatch')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  validatePolicy('recommendations', recommendations, errors)

  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_unit_evidence_anchor_policy_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  validatePolicy('decisions', decisions, errors)
}

function requiredConfirmationsToClose(decision) {
  return Object.entries(decision?.required_confirmations || {})
    .filter(([, value]) => value === false)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b))
}

function duplicates(values) {
  const seen = new Set()
  const repeated = new Set()
  for (const value of values || []) {
    if (!value) continue
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  }
  return [...repeated].sort((a, b) => a.localeCompare(b))
}

function summarize(rows) {
  const summary = {
    action_work_items: rows.length,
    by_action_type: {},
    by_grade_band: {},
    by_recommended_route: {},
    by_risk_flag: {},
    by_subject: {},
    by_suggested_reviewer_decision: {},
    by_work_queue: {},
    manual_candidate_rebuild_work_items: 0,
    page_gap_work_items: 0,
    reference_candidate_match_ids: 0,
    source_anchor_specificity_work_items: 0
  }
  for (const row of rows) {
    countInto(summary.by_action_type, row.action_type)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_recommended_route, row.recommended_route)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_suggested_reviewer_decision, row.suggested_reviewer_decision)
    countInto(summary.by_work_queue, row.work_queue)
    for (const flag of row.risk_flags || []) countInto(summary.by_risk_flag, flag)
    summary.reference_candidate_match_ids += row.reference_candidate_match_ids?.length || 0
    if (row.work_queue === 'unit_candidate_rebuild_queue') summary.manual_candidate_rebuild_work_items += 1
    if (row.work_queue === 'unit_source_anchor_specificity_review_queue') summary.source_anchor_specificity_work_items += 1
    if (row.work_queue === 'unit_source_anchor_specificity_page_gap_queue') {
      summary.source_anchor_specificity_work_items += 1
      summary.page_gap_work_items += 1
    }
  }
  return summary
}

function auditWorkItem(row, recommendation, decision, errors, stats) {
  const prefix = row.anchor_policy_action_work_item_id || row.recommendation_id || '(action work item)'
  validatePolicy(prefix, row, errors)
  validateWorklistPolicy(`${prefix} policy`, row.policy || {}, errors)
  if (row.worklist_only !== true) errors.push(`${prefix} worklist_only must be true`)
  if (row.recommendation_only !== true) errors.push(`${prefix} recommendation_only must be true`)
  if (row.recommendation_is_official_decision !== false) {
    errors.push(`${prefix} recommendation_is_official_decision must be false`)
  }
  if (row.selected_candidate_match_ids?.length) errors.push(`${prefix} selected_candidate_match_ids must remain empty`)
  if (!row.required_output) errors.push(`${prefix} required_output is required`)
  if (!row.reviewer_gate) errors.push(`${prefix} reviewer_gate is required`)
  if (!row.required_manual_checks?.length) errors.push(`${prefix} required_manual_checks must not be empty`)
  if (!row.risk_flags?.length) errors.push(`${prefix} risk_flags must not be empty`)
  if (!recommendation) {
    errors.push(`${prefix} recommendation_id not found in recommendations`)
    return
  }
  if (!decision) {
    errors.push(`${prefix} anchor_policy_review_item_id not found in decisions`)
    return
  }
  const expectedQueue = ROUTE_TO_QUEUE[recommendation.recommended_route]
  if (row.work_queue !== expectedQueue) errors.push(`${prefix} work_queue must be ${expectedQueue}`)
  for (const [field, actual, expected] of [
    ['anchor_policy_review_item_id', row.anchor_policy_review_item_id, recommendation.anchor_policy_review_item_id],
    ['current_decision_status', row.current_decision_status, recommendation.current_decision_status],
    ['current_reviewer_decision', row.current_reviewer_decision, recommendation.current_reviewer_decision],
    ['decision_id', row.decision_id, recommendation.decision_id],
    ['grade_band', row.grade_band, recommendation.grade_band],
    ['group_progression_completeness', row.group_progression_completeness, recommendation.group_progression_completeness],
    ['parent_action_work_item_id', row.parent_action_work_item_id, recommendation.parent_action_work_item_id],
    ['priority_score', row.priority_score, recommendation.priority_score],
    ['progression_group_id', row.progression_group_id, recommendation.progression_group_id],
    ['recommendation_confidence', row.recommendation_confidence, recommendation.recommendation_confidence],
    ['recommended_next_gate', row.recommended_next_gate, recommendation.recommended_next_gate],
    ['recommended_route', row.recommended_route, recommendation.recommended_route],
    ['standard_code', row.standard_code, recommendation.standard_code],
    ['subject_slug', row.subject_slug, recommendation.subject_slug],
    ['suggested_reviewer_decision', row.suggested_reviewer_decision, recommendation.suggested_reviewer_decision]
  ]) {
    if (!sameJson(actual, expected)) errors.push(`${prefix} ${field} must match recommendation`)
  }
  if (!sameJson(row.group_grade_bands || [], recommendation.group_grade_bands || [])) {
    errors.push(`${prefix} group_grade_bands must match recommendation`)
  }
  if (!sameJson(row.group_standard_codes || [], recommendation.group_standard_codes || [])) {
    errors.push(`${prefix} group_standard_codes must match recommendation`)
  }
  if (!sameJson(row.required_confirmations_to_close || [], requiredConfirmationsToClose(decision))) {
    errors.push(`${prefix} required_confirmations_to_close must match pending decision confirmations`)
  }
  if (!(decision.allowed_decisions || []).includes(row.suggested_reviewer_decision)) {
    errors.push(`${prefix} suggested_reviewer_decision must be allowed by decision template`)
  }
  const expectedReferenceIds = sorted(recommendation.reference_candidate_match_ids || [])
  if (!sameJson(row.reference_candidate_match_ids || [], expectedReferenceIds)) {
    errors.push(`${prefix} reference_candidate_match_ids must match unique recommendation reference ids`)
  }
  const duplicateReferenceIds = duplicates(row.reference_candidate_match_ids || [])
  if (duplicateReferenceIds.length) {
    errors.push(`${prefix} reference_candidate_match_ids must be unique: ${duplicateReferenceIds.join(', ')}`)
  }
  const duplicateReferenceObjects = duplicates((row.reference_candidate_matches || []).map(match => match.match_id))
  if (duplicateReferenceObjects.length) {
    errors.push(`${prefix} reference_candidate_matches must have unique match_id values: ${duplicateReferenceObjects.join(', ')}`)
  }
  if (!sameJson((row.reference_candidate_matches || []).map(match => match.match_id), row.reference_candidate_match_ids || [])) {
    errors.push(`${prefix} reference_candidate_matches must align with reference_candidate_match_ids`)
  }
  for (const match of row.reference_candidate_matches || []) {
    if (!match.source_file) errors.push(`${prefix} reference match object missing source_file: ${match.match_id}`)
  }
  stats.audited_work_items += 1
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Anchor Policy Review Action Worklist Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected recommendations | ${payload.summary.expected_recommendations} |
| audited work items | ${payload.summary.audited_work_items} |
| missing work items | ${payload.summary.missing_work_items} |
| extra work items | ${payload.summary.extra_work_items} |
| manual candidate rebuild work items | ${payload.summary.manual_candidate_rebuild_work_items} |
| source anchor specificity work items | ${payload.summary.source_anchor_specificity_work_items} |

## Queues

| queue | rows |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['worklist', args.worklist],
    ['recommendations', args.recommendations],
    ['decisions', args.decisions]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { anchor_policy_action_work_items: [] }
  const recommendations = existsSync(args.recommendations) ? readJson(args.recommendations) : { anchor_policy_review_recommendations: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { anchor_policy_review_decisions: [] }
  if (!errors.length) validateTopLevel(worklist, recommendations, decisions, args, errors)

  const rows = worklist.anchor_policy_action_work_items || []
  const recById = mapBy(recommendations.anchor_policy_review_recommendations || [], 'recommendation_id', errors, 'recommendations')
  const decisionByItem = mapBy(decisions.anchor_policy_review_decisions || [], 'anchor_policy_review_item_id', errors, 'decisions')
  const workItemByRecommendation = mapBy(rows, 'recommendation_id', errors, 'worklist')
  const stats = {
    audited_work_items: 0,
    expected_recommendations: (recommendations.anchor_policy_review_recommendations || []).length,
    extra_work_items: 0,
    missing_work_items: 0,
    ...summarize(rows)
  }

  if (!sameJson(worklist.summary || {}, summarize(rows))) errors.push('worklist summary does not match rows')
  for (const row of rows) {
    auditWorkItem(row, recById.get(row.recommendation_id), decisionByItem.get(row.anchor_policy_review_item_id), errors, stats)
  }
  for (const recommendation of recommendations.anchor_policy_review_recommendations || []) {
    if (!workItemByRecommendation.has(recommendation.recommendation_id)) {
      stats.missing_work_items += 1
      errors.push(`${recommendation.recommendation_id} missing action work item`)
    }
  }
  for (const row of rows) {
    if (!recById.has(row.recommendation_id)) stats.extra_work_items += 1
  }
  if (args.requireItems && !(recommendations.anchor_policy_review_recommendations || []).length) {
    errors.push('requireItems is set but recommendations has no rows')
  }
  if (args.requireItems && !rows.length) {
    errors.push('requireItems is set but worklist has no rows')
  }

  return {
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    recommendations: args.recommendations,
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
  if (args.out) writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({
    errors: payload.errors,
    generated_at: payload.generated_at,
    out: args.out,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid,
    worklist: args.worklist,
    writes_public_data: payload.writes_public_data
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
