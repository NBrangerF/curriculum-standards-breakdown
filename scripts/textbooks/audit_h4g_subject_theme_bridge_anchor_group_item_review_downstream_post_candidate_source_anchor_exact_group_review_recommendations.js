#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations_anchor_domain_rejected_english_pe_audit.md'

const DECISION_PENDING = 'pending'
const DECISION_READY_FOR_STANDARD_LEVEL = 'group_evidence_ready_for_standard_level_exact_anchor_review'
const DECISION_SPLIT_GROUP = 'split_group_before_standard_level_review'
const DECISION_REJECT_GROUP = 'reject_group_as_overbroad_unit_or_generic_theme'
const DECISION_NEEDS_EVIDENCE = 'needs_additional_unit_or_page_evidence'

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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations.js \\
  --strict --require-items

Audits source-anchor exact group review recommendation-only routing against the
editable exact group review decisions template.`)
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
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations') {
    errors.push('recommendations purpose mismatch')
  }
  if (recommendations.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations') {
    errors.push('recommendations data_scope mismatch')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (recommendations.source_exact_group_review_decisions !== args.decisions) {
    errors.push('recommendations source_exact_group_review_decisions must match audit arg')
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

function riskStats(row) {
  const reviewRows = row.standard_review_rows || []
  const riskSignalCounts = {}
  const sharedTopics = []
  const denyTerms = []
  let rowsWithBroadTopic = 0
  let rowsWithDenyTerms = 0
  let rowsWithLowBridge = 0
  let rowsWithSingleSharedTopic = 0
  let rowsWithStandardFanout = 0
  let rowsWithUnitFanout = 0
  for (const reviewRow of reviewRows) {
    const profile = reviewRow.risk_profile || {}
    if (profile.broad_topic_tag_count > 0) rowsWithBroadTopic += 1
    if (profile.deny_term_count > 0 || (profile.deny_terms || []).length) rowsWithDenyTerms += 1
    if (profile.has_low_bridge_score === true) rowsWithLowBridge += 1
    if (profile.has_single_shared_topic_tag === true) rowsWithSingleSharedTopic += 1
    if (profile.has_standard_fanout_risk === true) rowsWithStandardFanout += 1
    if (profile.has_unit_fanout_risk === true) rowsWithUnitFanout += 1
    for (const signal of reviewRow.risk_signals || []) countInto(riskSignalCounts, signal)
    for (const topic of profile.shared_topics || []) sharedTopics.push(topic)
    for (const term of profile.deny_terms || []) denyTerms.push(term)
  }
  return {
    deny_terms: sorted(denyTerms),
    dominant_risk_signals: Object.entries(riskSignalCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([risk_signal, rows]) => ({ risk_signal, rows })),
    rows_with_broad_topic: rowsWithBroadTopic,
    rows_with_deny_terms: rowsWithDenyTerms,
    rows_with_low_bridge_score: rowsWithLowBridge,
    rows_with_single_shared_topic: rowsWithSingleSharedTopic,
    rows_with_standard_fanout: rowsWithStandardFanout,
    rows_with_unit_fanout: rowsWithUnitFanout,
    source_anchor_exact_evidence_items: reviewRows.length,
    shared_topics: sorted(sharedTopics)
  }
}

function uniqueStandardCodes(row) {
  return sorted([
    ...(row.standard_codes || []),
    ...(row.standard_review_rows || []).map(reviewRow => reviewRow.standard_code || reviewRow.target_standard_code)
  ])
}

function expectedRecommendation(row) {
  const stats = riskStats(row)
  const evidenceItems = Number(row.source_anchor_exact_evidence_items || (row.standard_review_rows || []).length || 0)
  const standardCount = Number(row.unique_standard_codes || uniqueStandardCodes(row).length || 0)
  if (row.group_review_route === 'single_unit_many_standard_generic_anchor_review') return DECISION_SPLIT_GROUP
  if (row.group_review_route === 'unit_or_standard_fanout_exact_anchor_group_review') return DECISION_SPLIT_GROUP
  if (evidenceItems >= 8 || standardCount >= 8) return DECISION_SPLIT_GROUP
  if (stats.rows_with_deny_terms === evidenceItems && stats.rows_with_low_bridge_score === evidenceItems && evidenceItems > 0) {
    return DECISION_REJECT_GROUP
  }
  if (stats.rows_with_broad_topic === evidenceItems || stats.rows_with_low_bridge_score === evidenceItems || stats.rows_with_unit_fanout > 0) {
    return DECISION_NEEDS_EVIDENCE
  }
  return DECISION_PENDING
}

function expectedRoute(recommendation) {
  if (recommendation === DECISION_SPLIT_GROUP) return 'split_overbroad_unit_before_standard_level_exact_anchor_review'
  if (recommendation === DECISION_REJECT_GROUP) return 'reject_generic_or_deny_term_unit_as_standard_anchor'
  if (recommendation === DECISION_NEEDS_EVIDENCE) return 'collect_more_specific_page_or_unit_evidence_before_standard_review'
  if (recommendation === DECISION_READY_FOR_STANDARD_LEVEL) return 'standard_level_exact_anchor_review_candidate'
  return 'manual_group_review_required'
}

function expectedRecommendationId(row) {
  return `h4g_anchor_group_post_candidate_source_anchor_exact_group_review_recommendation_${hashText(row.decision_id || row.exact_anchor_group_review_item_id)}`
}

function sameStringSet(a, b) {
  const left = (a || []).map(String).sort((x, y) => x.localeCompare(y))
  const right = (b || []).map(String).sort((x, y) => x.localeCompare(y))
  return JSON.stringify(left) === JSON.stringify(right)
}

function auditRecommendation(row, decision, errors, stats) {
  const prefix = row.decision_id || row.exact_anchor_group_review_item_id || '(missing exact group recommendation)'
  if (row.recommendation_only !== true) errors.push(`${prefix} recommendation_only must be true`)
  if (row.recommendation_is_official_decision !== false) {
    errors.push(`${prefix} recommendation_is_official_decision must be false`)
  }
  if (row.recommendation_requires_manual_confirmation !== true) {
    errors.push(`${prefix} recommendation_requires_manual_confirmation must be true`)
  }
  if (!decision) {
    errors.push(`${prefix} recommendation decision_id not found in exact group decisions`)
    return
  }
  const checks = [
    ['exact_anchor_group_review_item_id', row.exact_anchor_group_review_item_id, decision.exact_anchor_group_review_item_id],
    ['grade_band', row.grade_band, decision.grade_band],
    ['group_key', row.group_key, decision.group_key],
    ['group_review_route', row.group_review_route, decision.group_review_route],
    ['priority_tier', row.priority_tier, decision.priority_tier],
    ['source_anchor_exact_evidence_items', row.source_anchor_exact_evidence_items, decision.source_anchor_exact_evidence_items],
    ['subject_slug', row.subject_slug, decision.subject_slug],
    ['unit_evidence_id', row.unit_evidence_id, decision.unit_evidence_id],
    ['unit_title', row.unit_title, decision.unit_title]
  ]
  for (const [field, actual, expected] of checks) {
    if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} ${field} must match exact group decisions template`)
  }
  if (row.exact_anchor_group_review_recommendation_id !== expectedRecommendationId(decision)) {
    errors.push(`${prefix} recommendation id mismatch`)
  }
  if (!sameStringSet(row.allowed_decisions, decision.allowed_decisions)) {
    errors.push(`${prefix} allowed_decisions must match exact group decisions template`)
  }
  if (!sameStringSet(row.standard_codes, uniqueStandardCodes(decision))) {
    errors.push(`${prefix} standard_codes must match exact group decisions template`)
  }
  const expected = expectedRecommendation(decision)
  if (row.recommended_reviewer_decision !== expected) {
    errors.push(`${prefix} recommended_reviewer_decision must be ${expected}`)
  }
  const route = expectedRoute(expected)
  if (row.recommendation_route !== route) {
    errors.push(`${prefix} recommendation_route must be ${route}`)
  }
  if (!Array.isArray(row.allowed_decisions) || !row.allowed_decisions.includes(row.recommended_reviewer_decision)) {
    errors.push(`${prefix} recommended_reviewer_decision must be allowed by source group decision`)
  }
  if (row.recommended_reviewer_decision === DECISION_READY_FOR_STANDARD_LEVEL) {
    errors.push(`${prefix} must not recommend standard-level ready without completed group review`)
  }
  if (!Array.isArray(row.recommendation_reasons) || !row.recommendation_reasons.length) {
    errors.push(`${prefix} recommendation_reasons must be non-empty`)
  }
  if (!row.recommendation_confidence) errors.push(`${prefix} missing recommendation_confidence`)
  const expectedRiskStats = riskStats(decision)
  if (JSON.stringify(stable(row.risk_stats || {})) !== JSON.stringify(stable(expectedRiskStats))) {
    errors.push(`${prefix} risk_stats must be recomputed from exact group decisions`)
  }

  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_group_review_route, row.group_review_route)
  countInto(stats.by_priority_tier, row.priority_tier)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision)
  countInto(stats.by_recommendation_confidence, row.recommendation_confidence)
  countInto(stats.by_recommendation_route, row.recommendation_route)
  countInto(stats.by_subject, row.subject_slug)
  stats.source_anchor_exact_evidence_items += Number(row.source_anchor_exact_evidence_items || 0)
  stats.max_rows_per_group = Math.max(stats.max_rows_per_group, Number(row.source_anchor_exact_evidence_items || 0))
  if (Number(row.unique_standard_codes || 0) > 1) stats.groups_with_multiple_standards += 1
  for (const standard of row.standard_codes || []) stats.unique_standard_codes.add(standard)
  if (row.unit_evidence_id) stats.unique_unit_evidence_ids.add(row.unit_evidence_id)
  if (row.recommended_reviewer_decision === DECISION_SPLIT_GROUP) stats.recommended_split_groups += 1
  else if (row.recommended_reviewer_decision === DECISION_REJECT_GROUP) stats.recommended_reject_groups += 1
  else if (row.recommended_reviewer_decision === DECISION_NEEDS_EVIDENCE) stats.recommended_needs_evidence_groups += 1
  else if (row.recommended_reviewer_decision === DECISION_READY_FOR_STANDARD_LEVEL) stats.recommended_standard_level_ready_groups += 1
  else if (row.recommended_reviewer_decision === DECISION_PENDING) stats.recommended_pending_groups += 1
}

function auditSummary(recommendations, stats, errors) {
  const summary = recommendations.summary || {}
  const finalized = {
    ...stats,
    unique_standard_codes: stats.unique_standard_codes.size,
    unique_unit_evidence_ids: stats.unique_unit_evidence_ids.size
  }
  for (const field of [
    'exact_group_review_auto_approval_recommendations',
    'exact_group_review_recommendations',
    'groups_with_multiple_standards',
    'max_rows_per_group',
    'recommended_needs_evidence_groups',
    'recommended_pending_groups',
    'recommended_reject_groups',
    'recommended_split_groups',
    'recommended_standard_level_ready_groups',
    'source_anchor_exact_evidence_items',
    'unique_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (Number(summary[field] || 0) !== Number(finalized[field] || 0)) errors.push(`summary.${field} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Source-Anchor Exact Group Review Recommendations Audit

Generated at: ${payload.generated_at}

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| expected decisions | ${payload.summary.expected_group_review_decisions} |
| recommendations | ${payload.summary.exact_group_review_recommendations} |
| missing recommendations | ${payload.summary.missing_recommendations} |
| extra recommendations | ${payload.summary.extra_recommendations} |
| split groups | ${payload.summary.recommended_split_groups} |
| reject groups | ${payload.summary.recommended_reject_groups} |
| needs evidence groups | ${payload.summary.recommended_needs_evidence_groups} |
| standard-level ready groups | ${payload.summary.recommended_standard_level_ready_groups} |
| auto approval recommendations | ${payload.summary.exact_group_review_auto_approval_recommendations} |

## Recommendations

| recommendation | groups |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Recommendation Routes

| route | groups |
| --- | ---: |
${countRows(payload.summary.by_recommendation_route)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [['recommendations', args.recommendations], ['decisions', args.decisions]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const recommendations = errors.length ? { exact_anchor_group_review_recommendations: [] } : readJson(args.recommendations)
  const decisions = errors.length ? { exact_anchor_group_review_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(recommendations, decisions, args, errors)

  const decisionRows = decisions.exact_anchor_group_review_decisions || []
  const recommendationRows = recommendations.exact_anchor_group_review_recommendations || []
  const decisionById = mapBy(decisionRows, 'decision_id', errors, 'decisions')
  const recByDecisionId = mapBy(recommendationRows, 'decision_id', errors, 'recommendations')
  const stats = {
    by_grade_band: {},
    by_group_review_route: {},
    by_priority_tier: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_recommendation_route: {},
    by_subject: {},
    exact_group_review_auto_approval_recommendations: 0,
    exact_group_review_recommendations: recommendationRows.length,
    extra_recommendations: 0,
    expected_group_review_decisions: decisionRows.length,
    groups_with_multiple_standards: 0,
    max_rows_per_group: 0,
    missing_recommendations: 0,
    recommended_needs_evidence_groups: 0,
    recommended_pending_groups: 0,
    recommended_reject_groups: 0,
    recommended_split_groups: 0,
    recommended_standard_level_ready_groups: 0,
    source_anchor_exact_evidence_items: 0,
    unique_standard_codes: new Set(),
    unique_unit_evidence_ids: new Set()
  }
  for (const row of recommendationRows) {
    auditRecommendation(row, decisionById.get(row.decision_id), errors, stats)
  }
  for (const decision of decisionRows) {
    if (!recByDecisionId.has(decision.decision_id)) {
      stats.missing_recommendations += 1
      errors.push(`${decision.decision_id} missing exact group review recommendation`)
    }
  }
  for (const row of recommendationRows) {
    if (!decisionById.has(row.decision_id)) stats.extra_recommendations += 1
  }
  if (args.requireItems && !recommendationRows.length) errors.push('requireItems is set but recommendations has no rows')
  auditSummary(recommendations, stats, errors)

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
