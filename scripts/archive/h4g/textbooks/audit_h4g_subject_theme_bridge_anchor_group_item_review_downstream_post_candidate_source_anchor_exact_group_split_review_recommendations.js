#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_recommendations_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_recommendations_anchor_domain_rejected_english_pe_audit.md'

const DECISION_PENDING = 'pending'
const DECISION_ACCEPT_CANDIDATE = 'accept_standard_exact_anchor_for_later_decision_candidate'
const DECISION_REJECT_GENERIC = 'reject_standard_anchor_as_overbroad_or_generic'
const DECISION_NEEDS_MORE_EVIDENCE = 'needs_more_specific_source_evidence'
const DECISION_SPLIT_ACTIVITY = 'split_to_activity_or_task_level_review'
const KNOWN_DECISIONS = new Set([
  DECISION_PENDING,
  DECISION_ACCEPT_CANDIDATE,
  DECISION_REJECT_GENERIC,
  DECISION_NEEDS_MORE_EVIDENCE,
  DECISION_SPLIT_ACTIVITY
])

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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_recommendations.js \\
  --strict --require-items

Audits recommendation-only routing from standard-level split review decisions.
The audit recomputes every recommendation from the editable decisions template.`)
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

function uniqueStrings(values) {
  const seen = new Set()
  const out = []
  for (const value of values || []) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
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

function validateTopLevel(recommendations, decisions, args, errors) {
  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if ((recommendations.errors || []).length) errors.push('recommendations errors must be empty')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_recommendations') {
    errors.push('recommendations purpose mismatch')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (recommendations.review_only !== true) errors.push('recommendations review_only must be true')
  if (recommendations.source_split_review_decisions !== args.decisions) {
    errors.push('recommendations source_split_review_decisions must match audit arg')
  }
  if (!Array.isArray(recommendations.split_review_recommendations)) {
    errors.push('recommendations split_review_recommendations must be an array')
  }
  validatePolicy('recommendations', recommendations, errors)

  if (decisions.valid !== true) errors.push('split review decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('split review decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template') {
    errors.push('split review decisions purpose mismatch')
  }
  if (!Array.isArray(decisions.split_review_decisions)) errors.push('split review decisions rows must be an array')
  validatePolicy('split review decisions', decisions, errors)
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

function recommendedReviewerDecision(row) {
  if (KNOWN_DECISIONS.has(row.reviewer_decision)) return row.reviewer_decision
  return DECISION_PENDING
}

function recommendationRoute(recommendation) {
  if (recommendation === DECISION_ACCEPT_CANDIDATE) return 'standard_exact_anchor_candidate_for_later_action_gate'
  if (recommendation === DECISION_REJECT_GENERIC) return 'reject_overbroad_or_generic_standard_anchor'
  if (recommendation === DECISION_NEEDS_MORE_EVIDENCE) return 'collect_more_specific_same_grade_source_evidence'
  if (recommendation === DECISION_SPLIT_ACTIVITY) return 'split_standard_anchor_to_activity_or_task_level_review'
  return 'standard_split_review_still_pending'
}

function recommendationConfidence(row, recommendation) {
  if (recommendation === DECISION_PENDING) return 'low'
  if (recommendation === DECISION_ACCEPT_CANDIDATE && row.decision_status === 'reviewed') return 'medium'
  if (recommendation === DECISION_REJECT_GENERIC && row.decision_status === 'reviewed') return 'medium'
  if (recommendation === DECISION_NEEDS_MORE_EVIDENCE && row.decision_status === 'reviewed') return 'medium'
  if (recommendation === DECISION_SPLIT_ACTIVITY && row.decision_status === 'reviewed') return 'medium'
  return 'low'
}

function recommendedNextGate(recommendation) {
  if (recommendation === DECISION_ACCEPT_CANDIDATE) return 'later_standard_exact_anchor_action_candidate_gate_after_manual_confirmation'
  if (recommendation === DECISION_REJECT_GENERIC) return 'standard_anchor_rejection_candidate_audit'
  if (recommendation === DECISION_NEEDS_MORE_EVIDENCE) return 'collect_specific_same_grade_page_or_activity_evidence'
  if (recommendation === DECISION_SPLIT_ACTIVITY) return 'activity_or_task_level_source_anchor_review_surface'
  return 'complete_split_review_decision_before_routing'
}

function reviewerNote(row, recommendation) {
  if (recommendation === DECISION_ACCEPT_CANDIDATE) {
    return 'Recommendation only: reviewer accepted this standard exact anchor as a later action-gate candidate; this is not matcher or publication approval.'
  }
  if (recommendation === DECISION_REJECT_GENERIC) {
    return 'Recommendation only: reviewer rejected this standard anchor as overbroad or generic; route to rejection candidate audit before any data edit.'
  }
  if (recommendation === DECISION_NEEDS_MORE_EVIDENCE) {
    return 'Recommendation only: reviewer requested more specific same-grade source evidence before any standard-level exact-anchor decision can advance.'
  }
  if (recommendation === DECISION_SPLIT_ACTIVITY) {
    return 'Recommendation only: reviewer found the current unit-level surface still too broad; split to activity or task-level evidence review.'
  }
  return 'Keep pending until a reviewer records standard-specific evidence and chooses an allowed split review decision.'
}

function recommendationReasons(row, recommendation) {
  return uniqueStrings([
    `recommended_decision:${recommendation}`,
    `source_reviewer_decision:${row.reviewer_decision || 'missing'}`,
    `decision_status:${row.decision_status || 'missing'}`,
    `grade_band:${row.grade_band || 'missing'}`,
    `group_review_route:${row.group_review_route || 'missing'}`,
    `review_grain:${row.review_grain || 'missing'}`,
    `page_evidence_status:${row.page_evidence_status || 'missing'}`,
    `page_hint_source:${row.page_hint_source || 'missing'}`,
    `work_queue:${row.work_queue || 'missing'}`,
    ...(row.risk_signals || []).slice(0, 8)
  ])
}

function recommendationId(row) {
  return `h4g_anchor_group_post_candidate_source_anchor_exact_group_split_review_recommendation_${hashText(row.decision_id || row.split_review_item_id)}`
}

function expectedRecommendation(row) {
  const recommendation = recommendedReviewerDecision(row)
  return {
    allowed_decisions: row.allowed_decisions || [],
    decision_id: row.decision_id || '',
    downstream_action_decision_id: row.downstream_action_decision_id || '',
    exact_anchor_evidence_packet_id: row.exact_anchor_evidence_packet_id || '',
    exact_anchor_group_review_item_id: row.exact_anchor_group_review_item_id || '',
    grade_band: row.grade_band || '',
    group_key: row.group_key || '',
    group_review_route: row.group_review_route || '',
    item_review_surface: row.item_review_surface || '',
    page_evidence_packet_item_id: row.page_evidence_packet_item_id || '',
    page_evidence_status: row.page_evidence_status || '',
    page_hint_source: row.page_hint_source || '',
    parent_action_work_item_id: row.parent_action_work_item_id || '',
    parent_decision_id: row.parent_decision_id || '',
    priority_tier: row.priority_tier || '',
    progression_group_id: row.progression_group_id || '',
    recommendation_confidence: recommendationConfidence(row, recommendation),
    recommendation_is_official_decision: false,
    recommendation_only: true,
    recommendation_reasons: recommendationReasons(row, recommendation),
    recommendation_requires_manual_confirmation: true,
    recommendation_route: recommendationRoute(recommendation),
    recommended_next_gate: recommendedNextGate(recommendation),
    recommended_reviewer_decision: recommendation,
    reviewer_note: reviewerNote(row, recommendation),
    risk_signals: row.risk_signals || [],
    source_decision_status: row.decision_status || '',
    source_reviewer_decision: row.reviewer_decision || '',
    source_split_review_decision_id: row.decision_id || '',
    source_split_review_item_id: row.source_split_review_item_id || row.split_review_item_id || '',
    source_standard_context: row.source_standard_context || {},
    split_review_item_id: row.split_review_item_id || '',
    split_review_recommendation_id: recommendationId(row),
    standard_code: row.standard_code || '',
    subject_slug: row.subject_slug || '',
    target_standard_code: row.target_standard_code || row.standard_code || '',
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || '',
    work_queue: row.work_queue || '',
    worklist_rank: Number(row.worklist_rank || 0)
  }
}

function emptyStats(decisions) {
  const decisionRows = decisions.split_review_decisions || []
  return {
    accept_candidate_recommendations: 0,
    auto_approval_recommendations: 0,
    by_grade_band: {},
    by_group_review_route: {},
    by_item_review_surface: {},
    by_priority_tier: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_recommendation_route: {},
    by_subject: {},
    by_work_queue: {},
    expected_split_review_decisions: decisionRows.length,
    extra_recommendations: 0,
    missing_recommendations: 0,
    more_evidence_recommendations: 0,
    pending_recommendations: 0,
    reject_generic_recommendations: 0,
    split_activity_recommendations: 0,
    split_review_recommendations: 0,
    unique_exact_anchor_evidence_items: new Set(decisionRows.map(row => row.exact_anchor_evidence_packet_id).filter(Boolean)).size,
    unique_parent_action_work_items: new Set(decisionRows.map(row => row.parent_action_work_item_id).filter(Boolean)).size,
    unique_progression_groups: new Set(decisionRows.map(row => row.progression_group_id).filter(Boolean)).size,
    unique_standard_codes: new Set(decisionRows.map(row => row.standard_code).filter(Boolean)).size,
    unique_unit_evidence_ids: new Set(decisionRows.map(row => row.unit_evidence_id).filter(Boolean)).size
  }
}

function auditRecommendation(row, decision, errors, stats) {
  const prefix = row.split_review_recommendation_id || row.decision_id || '(missing split review recommendation)'
  if (!decision) {
    errors.push(`${prefix} source decision not found`)
    return
  }
  const expected = expectedRecommendation(decision)
  if (!sameJson(row, expected)) errors.push(`${prefix} does not match recomputed recommendation`)
  if (row.recommendation_only !== true) errors.push(`${prefix} recommendation_only must be true`)
  if (row.recommendation_is_official_decision !== false) errors.push(`${prefix} recommendation_is_official_decision must be false`)
  if (row.recommendation_requires_manual_confirmation !== true) {
    errors.push(`${prefix} recommendation_requires_manual_confirmation must be true`)
  }
  if (!Array.isArray(row.allowed_decisions) || !row.allowed_decisions.includes(row.recommended_reviewer_decision)) {
    errors.push(`${prefix} recommended_reviewer_decision must be allowed by source split review decision`)
  }
  if (!KNOWN_DECISIONS.has(row.recommended_reviewer_decision || '')) {
    errors.push(`${prefix} recommended_reviewer_decision is unknown`)
  }
  if (row.recommended_reviewer_decision !== DECISION_PENDING && decision.decision_status !== 'reviewed') {
    errors.push(`${prefix} non-pending recommendation requires reviewed source decision`)
  }
  if (!Array.isArray(row.recommendation_reasons) || !row.recommendation_reasons.length) {
    errors.push(`${prefix} recommendation_reasons must be non-empty`)
  }
  stats.split_review_recommendations += 1
  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_group_review_route, row.group_review_route)
  countInto(stats.by_item_review_surface, row.item_review_surface)
  countInto(stats.by_priority_tier, row.priority_tier)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision)
  countInto(stats.by_recommendation_confidence, row.recommendation_confidence)
  countInto(stats.by_recommendation_route, row.recommendation_route)
  countInto(stats.by_subject, row.subject_slug)
  countInto(stats.by_work_queue, row.work_queue)
  if (row.recommended_reviewer_decision === DECISION_PENDING) stats.pending_recommendations += 1
  if (row.recommended_reviewer_decision === DECISION_ACCEPT_CANDIDATE) stats.accept_candidate_recommendations += 1
  if (row.recommended_reviewer_decision === DECISION_REJECT_GENERIC) stats.reject_generic_recommendations += 1
  if (row.recommended_reviewer_decision === DECISION_NEEDS_MORE_EVIDENCE) stats.more_evidence_recommendations += 1
  if (row.recommended_reviewer_decision === DECISION_SPLIT_ACTIVITY) stats.split_activity_recommendations += 1
}

function validateSummary(recommendations, stats, errors) {
  const summary = recommendations.summary || {}
  for (const key of [
    'accept_candidate_recommendations',
    'auto_approval_recommendations',
    'more_evidence_recommendations',
    'pending_recommendations',
    'reject_generic_recommendations',
    'split_activity_recommendations',
    'split_review_recommendations',
    'unique_exact_anchor_evidence_items',
    'unique_parent_action_work_items',
    'unique_progression_groups',
    'unique_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (Number(summary[key] || 0) !== Number(stats[key] || 0)) errors.push(`summary.${key} mismatch`)
  }
  for (const key of ['by_grade_band', 'by_group_review_route', 'by_item_review_surface', 'by_priority_tier', 'by_recommendation', 'by_recommendation_confidence', 'by_recommendation_route', 'by_subject', 'by_work_queue']) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`summary.${key} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Source-Anchor Exact Group Split Review Recommendations Audit

Generated at: ${payload.generated_at}

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| expected split review decisions | ${payload.summary.expected_split_review_decisions} |
| recommendations | ${payload.summary.split_review_recommendations} |
| missing recommendations | ${payload.summary.missing_recommendations} |
| extra recommendations | ${payload.summary.extra_recommendations} |
| pending recommendations | ${payload.summary.pending_recommendations} |
| accept candidate recommendations | ${payload.summary.accept_candidate_recommendations} |
| reject generic recommendations | ${payload.summary.reject_generic_recommendations} |
| more evidence recommendations | ${payload.summary.more_evidence_recommendations} |
| split activity recommendations | ${payload.summary.split_activity_recommendations} |
| auto approval recommendations | ${payload.summary.auto_approval_recommendations} |

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Routes

| route | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation_route)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of Object.entries({ recommendations: args.recommendations, decisions: args.decisions })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const recommendations = existsSync(args.recommendations) ? readJson(args.recommendations) : { split_review_recommendations: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { split_review_decisions: [] }
  if (!errors.length) validateTopLevel(recommendations, decisions, args, errors)

  const decisionById = mapBy(decisions.split_review_decisions || [], 'decision_id', errors, 'split review decision')
  const recommendationByDecisionId = mapBy(recommendations.split_review_recommendations || [], 'decision_id', errors, 'split review recommendation')
  const stats = emptyStats(decisions)
  for (const row of recommendations.split_review_recommendations || []) {
    auditRecommendation(row, decisionById.get(row.decision_id), errors, stats)
  }
  for (const decision of decisions.split_review_decisions || []) {
    if (!recommendationByDecisionId.has(decision.decision_id)) {
      stats.missing_recommendations += 1
      errors.push(`${decision.decision_id} missing split review recommendation`)
    }
  }
  for (const row of recommendations.split_review_recommendations || []) {
    if (!decisionById.has(row.decision_id)) stats.extra_recommendations += 1
  }
  if (args.requireItems && !(decisions.split_review_decisions || []).length) {
    errors.push('requireItems is set but decisions has no rows')
  }
  if (args.requireItems && !(recommendations.split_review_recommendations || []).length) {
    errors.push('requireItems is set but recommendations has no rows')
  }
  validateSummary(recommendations, stats, errors)
  if (stats.auto_approval_recommendations) {
    errors.push(`split review recommendations must not auto-approve: ${stats.auto_approval_recommendations}`)
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
