#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_worklist_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_worklist_anchor_domain_rejected_english_pe_audit.md'

const DECISION_PENDING = 'pending'
const SOURCE_ROW_CONFIRM = 'confirm_source_row_for_later_action_gate'
const ITEM_LEVEL_CONFIRM = 'confirm_item_level_source_scope_for_later_action_gate'
const CONFIRM_DECISIONS = new Set([SOURCE_ROW_CONFIRM, ITEM_LEVEL_CONFIRM])

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
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--recommendations') args.recommendations = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_worklist.js \\
  --strict --require-items

Audits the focused, non-public post-candidate manual review confirmation
worklist. It confirms the worklist only contains bounded-source confirmation
recommendations and excludes source-anchor exact rows.`)
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

function validateTopLevel(worklist, decisions, recommendations, args, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if ((worklist.errors || []).length) errors.push('worklist errors must be empty')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_worklist') {
    errors.push('worklist purpose mismatch')
  }
  if (worklist.confirmation_worklist_only !== true) errors.push('worklist confirmation_worklist_only must be true')
  if (worklist.review_only !== true) errors.push('worklist review_only must be true')
  if (worklist.source_post_candidate_manual_review_decisions !== args.decisions) {
    errors.push('worklist source_post_candidate_manual_review_decisions must match audit arg')
  }
  if (worklist.source_post_candidate_manual_review_recommendations !== args.recommendations) {
    errors.push('worklist source_post_candidate_manual_review_recommendations must match audit arg')
  }
  if (!Array.isArray(worklist.confirmation_work_items)) {
    errors.push('worklist confirmation_work_items must be an array')
  }
  validatePolicy('worklist', worklist, errors)

  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (!Array.isArray(decisions.post_candidate_manual_review_decisions)) {
    errors.push('decisions post_candidate_manual_review_decisions must be an array')
  }
  validatePolicy('decisions', decisions, errors)

  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if ((recommendations.errors || []).length) errors.push('recommendations errors must be empty')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_recommendations') {
    errors.push('recommendations purpose mismatch')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (!Array.isArray(recommendations.post_candidate_manual_review_recommendations)) {
    errors.push('recommendations post_candidate_manual_review_recommendations must be an array')
  }
  validatePolicy('recommendations', recommendations, errors)
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

function isConfirmationRecommendation(row) {
  return CONFIRM_DECISIONS.has(row.recommended_reviewer_decision) &&
    row.recommendation_only === true &&
    row.recommendation_requires_manual_confirmation === true &&
    row.evidence_packet_source === 'bounded_source_evidence_packet' &&
    row.source_downstream_action_batch !== 'source_anchor_evidence'
}

function missingConfirmations(decision) {
  return Object.entries(decision.required_confirmations || {})
    .filter(([, value]) => value !== true)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b))
}

function validateWorkItem(row, decision, recommendation, errors, stats) {
  const prefix = row.confirmation_work_item_id || row.decision_id || '(missing confirmation work item)'
  if (row.review_work_item_is_not_decision !== true) errors.push(`${prefix} review_work_item_is_not_decision must be true`)
  if (row.reviewer_action !== 'review_bounded_source_and_update_editable_manual_review_decision_if_confirmed') {
    errors.push(`${prefix} reviewer_action mismatch`)
  }
  if (!decision) {
    errors.push(`${prefix} decision_id not found in decisions`)
    return
  }
  if (!recommendation) {
    errors.push(`${prefix} decision_id not found in recommendations`)
    return
  }
  if (!isConfirmationRecommendation(recommendation)) errors.push(`${prefix} source recommendation is not a confirmation recommendation`)
  const checks = [
    ['manual_review_packet_item_id', row.manual_review_packet_item_id, decision.manual_review_packet_item_id],
    ['evidence_lane', row.evidence_lane, decision.evidence_lane],
    ['evidence_packet_item_id', row.evidence_packet_item_id, decision.evidence_packet_item_id],
    ['evidence_packet_source', row.evidence_packet_source, decision.evidence_packet_source],
    ['grade_band', row.grade_band, decision.grade_band],
    ['inventory_bucket', row.inventory_bucket, decision.inventory_bucket],
    ['manual_confirmation_lane', row.manual_confirmation_lane, decision.manual_confirmation_lane],
    ['page_status', row.page_status, decision.page_status],
    ['progression_group_id', row.progression_group_id, decision.progression_group_id],
    ['source_downstream_action_batch', row.source_downstream_action_batch, decision.source_downstream_action_batch],
    ['source_downstream_action_item_id', row.source_downstream_action_item_id, decision.source_downstream_action_item_id],
    ['source_key', row.source_key, decision.source_key],
    ['source_reviewer_decision', row.source_reviewer_decision, decision.source_reviewer_decision],
    ['standard_code', row.standard_code, decision.standard_code],
    ['subject_slug', row.subject_slug, decision.subject_slug],
    ['target_grade_band', row.target_grade_band, decision.target_grade_band],
    ['target_standard_code', row.target_standard_code, decision.target_standard_code],
    ['unit_evidence_id', row.unit_evidence_id, decision.unit_evidence_id],
    ['unit_title', row.unit_title, decision.unit_title],
    ['worklist_rank', row.worklist_rank, decision.worklist_rank]
  ]
  for (const [field, actual, expected] of checks) {
    if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} ${field} must match source decision`)
  }
  if (!sameJson(row.allowed_decisions || [], decision.allowed_decisions || [])) {
    errors.push(`${prefix} allowed_decisions must match source decision`)
  }
  if (!sameJson(row.missing_required_confirmations || [], missingConfirmations(decision))) {
    errors.push(`${prefix} missing_required_confirmations mismatch`)
  }
  if (row.post_candidate_manual_review_recommendation_id !== recommendation.post_candidate_manual_review_recommendation_id) {
    errors.push(`${prefix} post_candidate_manual_review_recommendation_id mismatch`)
  }
  if (row.recommended_reviewer_decision_to_consider !== recommendation.recommended_reviewer_decision) {
    errors.push(`${prefix} recommended_reviewer_decision_to_consider mismatch`)
  }
  if (!CONFIRM_DECISIONS.has(row.recommended_reviewer_decision_to_consider)) {
    errors.push(`${prefix} recommended_reviewer_decision_to_consider must be a bounded confirmation decision`)
  }
  if (row.source_downstream_action_batch === 'source_anchor_evidence') {
    errors.push(`${prefix} source-anchor exact rows must not be in confirmation worklist`)
  }
  if (decision.reviewer_decision !== DECISION_PENDING || decision.decision_status !== 'pending') {
    errors.push(`${prefix} source decision must remain pending`)
  }
  if (!Array.isArray(row.review_questions) || row.review_questions.length < (decision.review_prompts || []).length) {
    errors.push(`${prefix} review_questions must include source review prompts`)
  }
  countInto(stats.by_evidence_lane, row.evidence_lane)
  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_manual_confirmation_lane, row.manual_confirmation_lane)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision_to_consider)
  countInto(stats.by_recommendation_route, row.recommendation_route)
  countInto(stats.by_source_downstream_action_batch, row.source_downstream_action_batch)
  countInto(stats.by_subject, row.subject_slug)
  if (row.source_downstream_action_batch === 'source_row_confirmation') stats.source_row_confirmation_work_items += 1
  if (row.source_downstream_action_batch === 'item_level_source_review') stats.item_level_confirmation_work_items += 1
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Manual Review Confirmation Worklist Audit

Generated at: ${payload.generated_at}

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| expected confirmation work items | ${payload.summary.expected_confirmation_work_items} |
| audited confirmation work items | ${payload.summary.confirmation_work_items} |
| missing work items | ${payload.summary.missing_work_items} |
| extra work items | ${payload.summary.extra_work_items} |
| source-row confirmation work items | ${payload.summary.source_row_confirmation_work_items} |
| item-level confirmation work items | ${payload.summary.item_level_confirmation_work_items} |
| exact-anchor recommendations excluded | ${payload.summary.exact_anchor_recommendations_excluded} |

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Subjects

| subject | rows |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [['worklist', args.worklist], ['decisions', args.decisions], ['recommendations', args.recommendations]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { confirmation_work_items: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { post_candidate_manual_review_decisions: [] }
  const recommendations = existsSync(args.recommendations) ? readJson(args.recommendations) : { post_candidate_manual_review_recommendations: [] }
  if (!errors.length) validateTopLevel(worklist, decisions, recommendations, args, errors)

  const decisionById = mapBy(decisions.post_candidate_manual_review_decisions || [], 'decision_id', errors, 'decisions')
  const recommendationById = mapBy(recommendations.post_candidate_manual_review_recommendations || [], 'decision_id', errors, 'recommendations')
  const workItemByDecisionId = mapBy(worklist.confirmation_work_items || [], 'decision_id', errors, 'worklist')
  const expectedRecommendations = (recommendations.post_candidate_manual_review_recommendations || []).filter(isConfirmationRecommendation)
  const expectedDecisionIds = new Set(expectedRecommendations.map(row => row.decision_id))
  const exactAnchorExcluded = (recommendations.post_candidate_manual_review_recommendations || [])
    .filter(row => row.source_downstream_action_batch === 'source_anchor_evidence' && row.recommended_reviewer_decision === DECISION_PENDING)
    .length

  const stats = {
    by_evidence_lane: {},
    by_grade_band: {},
    by_manual_confirmation_lane: {},
    by_recommendation: {},
    by_recommendation_route: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    confirmation_work_items: (worklist.confirmation_work_items || []).length,
    exact_anchor_recommendations_excluded: exactAnchorExcluded,
    expected_confirmation_work_items: expectedRecommendations.length,
    extra_work_items: 0,
    item_level_confirmation_work_items: 0,
    missing_work_items: 0,
    source_row_confirmation_work_items: 0,
    unique_action_decisions: new Set((worklist.confirmation_work_items || []).map(row => row.downstream_action_decision_id).filter(Boolean)).size,
    unique_progression_groups: new Set((worklist.confirmation_work_items || []).map(row => row.progression_group_id).filter(Boolean)).size,
    unique_source_keys: new Set((worklist.confirmation_work_items || []).map(row => row.source_key).filter(Boolean)).size,
    unique_standard_codes: new Set((worklist.confirmation_work_items || []).map(row => row.standard_code).filter(Boolean)).size,
    unique_unit_evidence_ids: new Set((worklist.confirmation_work_items || []).map(row => row.unit_evidence_id).filter(Boolean)).size
  }

  for (const row of worklist.confirmation_work_items || []) {
    validateWorkItem(row, decisionById.get(row.decision_id), recommendationById.get(row.decision_id), errors, stats)
    if (!expectedDecisionIds.has(row.decision_id)) stats.extra_work_items += 1
  }
  for (const recommendation of expectedRecommendations) {
    if (!workItemByDecisionId.has(recommendation.decision_id)) {
      stats.missing_work_items += 1
      errors.push(`${recommendation.decision_id} missing confirmation work item`)
    }
  }
  if (args.requireItems && !stats.confirmation_work_items) errors.push('requireItems is set but no confirmation work items were audited')
  if (stats.extra_work_items) errors.push(`confirmation worklist has extra work items: ${stats.extra_work_items}`)
  if (stats.missing_work_items) errors.push(`confirmation worklist has missing work items: ${stats.missing_work_items}`)
  if (stats.confirmation_work_items !== stats.expected_confirmation_work_items) {
    errors.push(`confirmation work items ${stats.confirmation_work_items} must equal expected ${stats.expected_confirmation_work_items}`)
  }

  const summary = worklist.summary || {}
  for (const key of [
    'confirmation_work_items',
    'exact_anchor_recommendations_excluded',
    'item_level_confirmation_work_items',
    'source_row_confirmation_work_items',
    'unique_action_decisions',
    'unique_progression_groups',
    'unique_source_keys',
    'unique_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (Number(summary[key] || 0) !== Number(stats[key] || 0)) errors.push(`worklist summary.${key} mismatch`)
  }
  for (const key of [
    'by_evidence_lane',
    'by_grade_band',
    'by_manual_confirmation_lane',
    'by_recommendation',
    'by_recommendation_route',
    'by_source_downstream_action_batch',
    'by_subject'
  ]) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`worklist summary.${key} mismatch`)
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
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
