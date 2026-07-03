#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.md'

const ROUTES = {
  accept_bounded_slice_for_item_level_source_review: {
    closure_route: 'bounded_item_level_source_review_required',
    next_gate: 'item_level_source_review',
    readiness: 'manual_item_level_review_required',
    sort_rank: 30
  },
  needs_source_anchor_evidence: {
    closure_route: 'source_anchor_evidence_review_required',
    next_gate: 'source_anchor_specificity_review',
    readiness: 'manual_source_anchor_evidence_required',
    sort_rank: 40
  },
  source_row_confirms_target_anchor_for_later_gate: {
    closure_route: 'source_row_confirmation_for_later_gate_required',
    next_gate: 'later_matcher_or_publication_gate_input',
    readiness: 'manual_source_row_confirmation_required',
    sort_rank: 20
  },
  target_standard_gap_confirmed: {
    closure_route: 'target_standard_gap_manual_confirmation_candidate',
    next_gate: 'target_standard_gap_resolution',
    readiness: 'priority_manual_confirmation_candidate',
    sort_rank: 10
  },
  target_standard_requires_manual_scope_review: {
    closure_route: 'manual_scope_indexing_required',
    next_gate: 'manual_scope_and_same_grade_unit_indexing',
    readiness: 'manual_scope_review_required',
    sort_rank: 25
  }
}

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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness.js \\
  --recommendations generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_recommendations_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits whether recommendation-only downstream action decisions can be closed.
This gate is intentionally conservative: recommendations can prioritize manual
review, but they never auto-close decisions, approve bridges, write public/data,
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

function mapBy(rows, key, errors, label) {
  const out = new Map()
  for (const row of rows || []) {
    const id = row[key]
    if (!id) {
      errors.push(`${label} row missing ${key}`)
      continue
    }
    if (out.has(id)) errors.push(`${label} duplicate ${key}: ${id}`)
    out.set(id, row)
  }
  return out
}

function validateTopLevel(recommendations, decisions, args, errors) {
  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_recommendations') {
    errors.push('recommendations purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_recommendations')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (recommendations.source_downstream_action_decisions !== args.decisions) {
    errors.push('recommendations source_downstream_action_decisions must match audit arg')
  }
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template')
  }
  for (const [label, payload] of [['recommendations', recommendations], ['decisions', decisions]]) {
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
}

function requiredFalseConfirmations(decision) {
  return Object.entries(decision.required_confirmations || {})
    .filter(([, value]) => value === false)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b))
}

function closureBlockers(recommendation, decision) {
  const blockers = [
    'recommendation_only',
    'manual_confirmation_required'
  ]
  for (const field of requiredFalseConfirmations(decision)) blockers.push(`required_confirmation:${field}`)
  if (recommendation.recommendation_confidence !== 'high') {
    blockers.push(`recommendation_confidence:${recommendation.recommendation_confidence || 'missing'}`)
  }
  if (recommendation.recommended_reviewer_decision === 'needs_source_anchor_evidence') {
    blockers.push('exact_source_anchor_not_yet_confirmed')
  }
  if (recommendation.recommended_reviewer_decision === 'target_standard_requires_manual_scope_review') {
    blockers.push('target_scope_or_same_grade_unit_indexing_not_yet_confirmed')
  }
  if (recommendation.recommended_reviewer_decision === 'accept_bounded_slice_for_item_level_source_review') {
    blockers.push('item_level_source_review_not_yet_completed')
  }
  if (recommendation.recommended_reviewer_decision === 'source_row_confirms_target_anchor_for_later_gate') {
    blockers.push('later_gate_still_required_before_matcher_or_publication')
  }
  if (recommendation.recommended_reviewer_decision === 'target_standard_gap_confirmed') {
    blockers.push('inventory_gap_confirmation_still_manual')
  }
  return sorted(blockers)
}

function itemReadiness(recommendation) {
  const route = ROUTES[recommendation.recommended_reviewer_decision] || {
    closure_route: 'manual_review_required',
    next_gate: recommendation.recommended_next_gate || 'manual_review',
    readiness: 'manual_review_required',
    sort_rank: 80
  }
  if (
    recommendation.recommended_reviewer_decision === 'target_standard_gap_confirmed' &&
    recommendation.recommendation_confidence === 'high'
  ) {
    return route
  }
  if (recommendation.recommended_reviewer_decision === 'target_standard_gap_confirmed') {
    return {
      ...route,
      readiness: 'manual_inventory_gap_review_required',
      sort_rank: 18
    }
  }
  return route
}

function assertRecommendationMatchesDecision(recommendation, decision, errors) {
  const prefix = recommendation.decision_id || '(missing action recommendation)'
  if (!decision) {
    errors.push(`${prefix} recommendation decision_id not found in downstream action decisions`)
    return
  }
  const checks = [
    ['decision_type', recommendation.decision_type, decision.decision_type],
    ['item_review_surface', recommendation.item_review_surface, decision.item_review_surface],
    ['subject_slug', recommendation.subject_slug, decision.subject_slug],
    ['grade_band', recommendation.grade_band, decision.grade_band],
    ['target_grade_band', recommendation.target_grade_band, decision.target_grade_band],
    ['progression_group_id', recommendation.progression_group_id, decision.progression_group_id],
    ['priority_rank', recommendation.priority_rank, decision.priority_rank],
    ['priority_tier', recommendation.priority_tier, decision.priority_tier],
    ['source_batch', recommendation.source_batch, decision.source_batch],
    ['source_batch_item_id', recommendation.source_batch_item_id, decision.source_batch_item_id],
    ['source_downstream_action_batch', recommendation.source_downstream_action_batch, decision.source_downstream_action_batch],
    ['source_downstream_action_item_id', recommendation.source_downstream_action_item_id, decision.source_downstream_action_item_id],
    ['source_downstream_action_item_type', recommendation.source_downstream_action_item_type, decision.source_downstream_action_item_type],
    ['source_key', recommendation.source_key, decision.source_key],
    ['standard_code', recommendation.standard_code, decision.standard_code],
    ['source_standard_code', recommendation.source_standard_code, decision.source_standard_code],
    ['target_standard_code', recommendation.target_standard_code, decision.target_standard_code],
    ['unit_evidence_id', recommendation.unit_evidence_id, decision.unit_evidence_id],
    ['unit_title', recommendation.unit_title, decision.unit_title],
    ['source_anchor_review_rows', recommendation.source_anchor_review_rows, decision.source_anchor_review_rows]
  ]
  for (const [field, actual, expected] of checks) {
    if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} ${field} must match downstream action decision`)
  }
  if (recommendation.recommendation_only !== true) errors.push(`${prefix} recommendation_only must be true`)
  if (recommendation.action_recommendation_decision_id !== recommendation.decision_id) {
    errors.push(`${prefix} action_recommendation_decision_id must match decision_id`)
  }
  if (recommendation.recommendation_is_official_decision !== false) {
    errors.push(`${prefix} recommendation_is_official_decision must be false`)
  }
  if (recommendation.recommendation_requires_manual_confirmation !== true) {
    errors.push(`${prefix} recommendation_requires_manual_confirmation must be true`)
  }
  if (decision.reviewer_decision !== 'pending') errors.push(`${prefix} source decision reviewer_decision must still be pending`)
  if (decision.decision_status !== 'pending_review') errors.push(`${prefix} source decision decision_status must still be pending_review`)
  if (!Array.isArray(recommendation.allowed_decisions) || !recommendation.allowed_decisions.includes(recommendation.recommended_reviewer_decision)) {
    errors.push(`${prefix} recommended_reviewer_decision must be allowed by recommendation row`)
  }
  if (!Array.isArray(decision.allowed_decisions) || !decision.allowed_decisions.includes(recommendation.recommended_reviewer_decision)) {
    errors.push(`${prefix} recommended_reviewer_decision must be allowed by downstream action decision`)
  }
  if (recommendation.recommended_reviewer_decision !== decision.recommended_reviewer_decision) {
    errors.push(`${prefix} recommended_reviewer_decision must match downstream action decision recommendation`)
  }
}

function closureItem(recommendation, decision) {
  const readiness = itemReadiness(recommendation)
  const blockers = closureBlockers(recommendation, decision)
  return {
    action_recommendation_decision_id: recommendation.action_recommendation_decision_id || recommendation.decision_id || '',
    auto_close_allowed: false,
    auto_close_blockers: blockers,
    candidate_manual_confirmation: readiness.readiness === 'priority_manual_confirmation_candidate',
    close_ready: false,
    closure_readiness: readiness.readiness,
    closure_route: readiness.closure_route,
    decision_id: recommendation.decision_id || '',
    decision_type: recommendation.decision_type || '',
    grade_band: recommendation.grade_band || '',
    manual_confirmation_required: true,
    next_manual_gate: readiness.next_gate,
    priority_rank: recommendation.priority_rank,
    priority_tier: recommendation.priority_tier || '',
    progression_group_id: recommendation.progression_group_id || '',
    recommendation_confidence: recommendation.recommendation_confidence || '',
    recommended_reviewer_decision: recommendation.recommended_reviewer_decision || '',
    required_confirmations_to_close: decision?.required_confirmations_to_close || [],
    required_false_confirmations: requiredFalseConfirmations(decision || {}),
    risk_signals: recommendation.risk_signals || [],
    sort_rank: readiness.sort_rank,
    source_batch: recommendation.source_batch || '',
    source_batch_item_id: recommendation.source_batch_item_id || '',
    source_downstream_action_batch: recommendation.source_downstream_action_batch || '',
    source_downstream_action_item_id: recommendation.source_downstream_action_item_id || '',
    source_key: recommendation.source_key || '',
    source_standard_code: recommendation.source_standard_code || '',
    standard_code: recommendation.standard_code || '',
    subject_slug: recommendation.subject_slug || '',
    target_grade_band: recommendation.target_grade_band || '',
    target_standard_code: recommendation.target_standard_code || '',
    unit_evidence_id: recommendation.unit_evidence_id || '',
    unit_title: recommendation.unit_title || ''
  }
}

function buildItems(recommendations, decisions, args, errors) {
  const decisionById = mapBy(decisions.downstream_action_decisions || [], 'decision_id', errors, 'decisions')
  const recommendationById = mapBy(recommendations.downstream_action_recommendations || [], 'decision_id', errors, 'recommendations')
  const items = []
  for (const recommendation of recommendations.downstream_action_recommendations || []) {
    const decision = decisionById.get(recommendation.decision_id)
    assertRecommendationMatchesDecision(recommendation, decision, errors)
    items.push(closureItem(recommendation, decision))
  }
  for (const decision of decisions.downstream_action_decisions || []) {
    if (!recommendationById.has(decision.decision_id)) errors.push(`${decision.decision_id} missing downstream action recommendation`)
  }
  for (const recommendation of recommendations.downstream_action_recommendations || []) {
    if (!decisionById.has(recommendation.decision_id)) errors.push(`${recommendation.decision_id} extra downstream action recommendation`)
  }
  if (args.requireItems && !(decisions.downstream_action_decisions || []).length) {
    errors.push('requireItems is set but decisions has no downstream_action_decisions')
  }
  if (args.requireItems && !(recommendations.downstream_action_recommendations || []).length) {
    errors.push('requireItems is set but recommendations has no downstream_action_recommendations')
  }
  return items.sort((a, b) => {
    const rank = a.sort_rank - b.sort_rank
    if (rank) return rank
    const priority = Number(a.priority_rank || 9999) - Number(b.priority_rank || 9999)
    if (priority) return priority
    return `${a.subject_slug}|${a.grade_band}|${a.standard_code}|${a.decision_id}`
      .localeCompare(`${b.subject_slug}|${b.grade_band}|${b.standard_code}|${b.decision_id}`)
  })
}

function summarize(items, decisions) {
  const summary = {
    auto_close_allowed_items: 0,
    by_closure_readiness: {},
    by_closure_route: {},
    by_grade_band: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    close_ready_items: 0,
    closure_readiness_items: items.length,
    expected_downstream_action_decisions: (decisions.downstream_action_decisions || []).length,
    manual_confirmation_required_items: 0,
    priority_manual_confirmation_candidates: 0,
    remaining_manual_evidence_review_items: 0
  }
  for (const item of items) {
    if (item.auto_close_allowed) summary.auto_close_allowed_items += 1
    if (item.close_ready) summary.close_ready_items += 1
    if (item.manual_confirmation_required) summary.manual_confirmation_required_items += 1
    if (item.candidate_manual_confirmation) summary.priority_manual_confirmation_candidates += 1
    if (item.closure_readiness !== 'priority_manual_confirmation_candidate') summary.remaining_manual_evidence_review_items += 1
    countInto(summary.by_closure_readiness, item.closure_readiness)
    countInto(summary.by_closure_route, item.closure_route)
    countInto(summary.by_grade_band, item.grade_band)
    countInto(summary.by_recommendation, item.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, item.recommendation_confidence)
    countInto(summary.by_source_downstream_action_batch, item.source_downstream_action_batch)
    countInto(summary.by_subject, item.subject_slug)
  }
  return summary
}

function priorityRows(items) {
  const rows = items
    .filter(item => item.candidate_manual_confirmation)
    .slice(0, 40)
  return rows.map(item => (
    `| ${item.priority_rank} | ${markdownCell(item.subject_slug)} | ${markdownCell(item.grade_band || item.target_grade_band)} | ${markdownCell(item.target_standard_code || item.standard_code)} | ${markdownCell(item.recommended_reviewer_decision)} | ${markdownCell(item.next_manual_gate)} | ${truncate(item.auto_close_blockers.join('; '))} |`
  )).join('\n') || '| - | - | - | - | - | - | - |'
}

function previewRows(items) {
  return items.slice(0, 80).map(item => (
    `| ${item.sort_rank} | ${item.priority_rank} | ${markdownCell(item.priority_tier)} | ${markdownCell(item.closure_readiness)} | ${markdownCell(item.subject_slug)} | ${markdownCell(item.grade_band || item.target_grade_band)} | ${markdownCell(item.standard_code || item.target_standard_code)} | ${markdownCell(item.recommended_reviewer_decision)} | ${truncate(item.required_false_confirmations.join('; '))} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Action Closure Readiness

Generated at: ${payload.generated_at}

This audit checks whether recommendation-only downstream action decisions can be
closed. It is intentionally conservative: no recommendation can auto-close a
decision, write \`public/data\`, change official standard text, or enable matcher
or publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected action decisions | ${payload.summary.expected_downstream_action_decisions} |
| closure readiness items | ${payload.summary.closure_readiness_items} |
| auto-close allowed items | ${payload.summary.auto_close_allowed_items} |
| close-ready items | ${payload.summary.close_ready_items} |
| manual confirmation required items | ${payload.summary.manual_confirmation_required_items} |
| priority manual confirmation candidates | ${payload.summary.priority_manual_confirmation_candidates} |
| remaining manual evidence review items | ${payload.summary.remaining_manual_evidence_review_items} |

## Closure Readiness

| readiness | rows |
| --- | ---: |
${countRows(payload.summary.by_closure_readiness)}

## Closure Routes

| route | rows |
| --- | ---: |
${countRows(payload.summary.by_closure_route)}

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Priority Manual Confirmation Candidates

| rank | subject | grade | standard | recommendation | next gate | blockers |
| ---: | --- | --- | --- | --- | --- | --- |
${priorityRows(payload.closure_readiness_items)}

## Preview

| sort | rank | tier | readiness | subject | grade | standard | recommendation | missing confirmations |
| ---: | ---: | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.closure_readiness_items)}

## Guardrails

- Recommendations remain recommendation-only.
- Every item still requires manual confirmation before an editable action decision can be closed.
- Priority candidates are review-order hints, not official decisions.
- Matcher and publication gates remain separate later steps.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [['recommendations', args.recommendations], ['decisions', args.decisions]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const recommendations = errors.length ? { downstream_action_recommendations: [] } : readJson(args.recommendations)
  const decisions = errors.length ? { downstream_action_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(recommendations, decisions, args, errors)
  const items = buildItems(recommendations, decisions, args, errors)
  const summary = summarize(items, decisions)
  if (summary.closure_readiness_items !== summary.expected_downstream_action_decisions) {
    errors.push(`closure_readiness_items ${summary.closure_readiness_items} must match expected ${summary.expected_downstream_action_decisions}`)
  }
  return {
    changes_official_standard_text: false,
    close_ready: false,
    closure_readiness_items: items,
    decisions: args.decisions,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness',
    recommendations: args.recommendations,
    require_items: args.requireItems,
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
  const payload = audit(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
