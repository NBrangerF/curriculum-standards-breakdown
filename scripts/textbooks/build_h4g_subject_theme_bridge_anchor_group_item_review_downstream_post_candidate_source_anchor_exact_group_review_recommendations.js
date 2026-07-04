#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations_anchor_domain_rejected_english_pe.md'

const DECISION_PENDING = 'pending'
const DECISION_READY_FOR_STANDARD_LEVEL = 'group_evidence_ready_for_standard_level_exact_anchor_review'
const DECISION_SPLIT_GROUP = 'split_group_before_standard_level_review'
const DECISION_REJECT_GROUP = 'reject_group_as_overbroad_unit_or_generic_theme'
const DECISION_NEEDS_EVIDENCE = 'needs_additional_unit_or_page_evidence'
const DECISION_OUT_OF_SCOPE = 'out_of_scope_duplicate_or_superseded'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations.js \\
  --strict --require-items

Builds conservative recommendation-only routing for source-anchor exact group
review decisions. It does not edit the decisions template, approve standards,
write public/data, change official standard text, or enable matcher/publication
use.`)
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

function validateTopLevel(decisions, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template') {
    errors.push('decisions data_scope mismatch')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('decisions editable_manual_review_template must be true')
  if (!Array.isArray(decisions.exact_anchor_group_review_decisions)) {
    errors.push('decisions exact_anchor_group_review_decisions must be an array')
  }
  if (args.requireItems && !(decisions.exact_anchor_group_review_decisions || []).length) {
    errors.push('requireItems is set but decisions has no exact_anchor_group_review_decisions')
  }
  validatePolicy('decisions', decisions, errors)
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

function recommendedReviewerDecision(row) {
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

function recommendationRoute(recommendation) {
  if (recommendation === DECISION_SPLIT_GROUP) return 'split_overbroad_unit_before_standard_level_exact_anchor_review'
  if (recommendation === DECISION_REJECT_GROUP) return 'reject_generic_or_deny_term_unit_as_standard_anchor'
  if (recommendation === DECISION_NEEDS_EVIDENCE) return 'collect_more_specific_page_or_unit_evidence_before_standard_review'
  if (recommendation === DECISION_READY_FOR_STANDARD_LEVEL) return 'standard_level_exact_anchor_review_candidate'
  if (recommendation === DECISION_OUT_OF_SCOPE) return 'out_of_scope_or_duplicate'
  return 'manual_group_review_required'
}

function recommendationConfidence(row, recommendation) {
  if (recommendation === DECISION_SPLIT_GROUP && Number(row.source_anchor_exact_evidence_items || 0) >= 8) return 'high'
  if (recommendation === DECISION_REJECT_GROUP) return 'high'
  if (recommendation === DECISION_SPLIT_GROUP) return 'medium'
  if (recommendation === DECISION_NEEDS_EVIDENCE) return 'medium'
  return 'low'
}

function recommendedNextGate(recommendation) {
  if (recommendation === DECISION_SPLIT_GROUP) return 'edit_group_decision_then_create_standard_or_subgroup_exact_anchor_review_surface'
  if (recommendation === DECISION_REJECT_GROUP) return 'edit_group_decision_then_route_overbroad_exact_anchor_rows_to_rejection_candidate_audit'
  if (recommendation === DECISION_NEEDS_EVIDENCE) return 'collect_more_specific_same_grade_page_or_unit_evidence_before_standard_review'
  return 'manual_exact_group_review_decision_required'
}

function reviewerNote(row, recommendation) {
  if (recommendation === DECISION_SPLIT_GROUP) {
    return 'Recommendation only: the same unit-level evidence fans out across too many standards or a fan-out lane, so split the group before any standard-level exact-anchor review.'
  }
  if (recommendation === DECISION_REJECT_GROUP) {
    return 'Recommendation only: every row in this group carries deny-term and low-bridge risk, so the unit appears too generic to support these standards without new evidence.'
  }
  if (recommendation === DECISION_NEEDS_EVIDENCE) {
    return 'Recommendation only: the group remains broad or low-specificity; collect more specific page or unit evidence before attempting a standard-level exact-anchor decision.'
  }
  return 'Manual exact group review remains required before any standard-level exact-anchor gate.'
}

function recommendationReasons(row, stats, recommendation) {
  return uniqueStrings([
    `recommended_decision:${recommendation}`,
    `group_review_route:${row.group_review_route || 'missing'}`,
    `source_anchor_exact_evidence_items:${row.source_anchor_exact_evidence_items || 0}`,
    `unique_standard_codes:${row.unique_standard_codes || uniqueStandardCodes(row).length || 0}`,
    `rows_with_unit_fanout:${stats.rows_with_unit_fanout}`,
    `rows_with_standard_fanout:${stats.rows_with_standard_fanout}`,
    `rows_with_broad_topic:${stats.rows_with_broad_topic}`,
    `rows_with_deny_terms:${stats.rows_with_deny_terms}`,
    `rows_with_low_bridge_score:${stats.rows_with_low_bridge_score}`,
    ...(stats.shared_topics || []).slice(0, 5),
    ...(stats.deny_terms || []).slice(0, 5),
    ...(stats.dominant_risk_signals || []).slice(0, 6).map(item => `${item.risk_signal}:${item.rows}`)
  ])
}

function recommendationId(row) {
  return `h4g_anchor_group_post_candidate_source_anchor_exact_group_review_recommendation_${hashText(row.decision_id || row.exact_anchor_group_review_item_id)}`
}

function standardPreview(row) {
  return (row.standard_review_rows || []).slice(0, 6).map(reviewRow => ({
    anchor_requirement_summary: reviewRow.anchor_requirement_summary || '',
    domain: reviewRow.source_standard_context?.domain || '',
    progression_group_id: reviewRow.progression_group_id || '',
    standard_code: reviewRow.standard_code || reviewRow.target_standard_code || '',
    subdomain: reviewRow.source_standard_context?.subdomain || '',
    target_standard_code: reviewRow.target_standard_code || reviewRow.standard_code || ''
  }))
}

function recommendationFromDecision(row, errors) {
  const stats = riskStats(row)
  const recommendation = recommendedReviewerDecision(row)
  const id = row.decision_id || ''
  if (!(row.allowed_decisions || []).includes(recommendation)) {
    errors.push(`${id} recommended_reviewer_decision ${recommendation} must be allowed by source group decision`)
  }
  if (row.reviewer_decision !== DECISION_PENDING || row.decision_status !== DECISION_PENDING) {
    errors.push(`${id} must still be pending before recommendation-only routing`)
  }
  return {
    allowed_decisions: row.allowed_decisions || [],
    decision_id: id,
    exact_anchor_group_review_item_id: row.exact_anchor_group_review_item_id || '',
    exact_anchor_group_review_recommendation_id: recommendationId(row),
    exact_anchor_group_review_recommendation_type: 'h4g_anchor_group_post_candidate_source_anchor_exact_group_review_recommendation',
    grade_band: row.grade_band || '',
    group_key: row.group_key || '',
    group_review_route: row.group_review_route || '',
    page_evidence_summary: row.page_evidence_summary || {},
    priority_tier: row.priority_tier || '',
    recommendation_confidence: recommendationConfidence(row, recommendation),
    recommendation_is_official_decision: false,
    recommendation_only: true,
    recommendation_reasons: recommendationReasons(row, stats, recommendation),
    recommendation_requires_manual_confirmation: true,
    recommendation_route: recommendationRoute(recommendation),
    recommended_next_gate: recommendedNextGate(recommendation),
    recommended_reviewer_decision: recommendation,
    reviewer_note: reviewerNote(row, recommendation),
    risk_stats: stats,
    source_anchor_exact_evidence_items: Number(row.source_anchor_exact_evidence_items || 0),
    source_decision_status: row.decision_status || '',
    source_reviewer_decision: row.reviewer_decision || '',
    standard_codes: uniqueStandardCodes(row),
    standard_preview: standardPreview(row),
    subject_slug: row.subject_slug || '',
    unique_standard_codes: Number(row.unique_standard_codes || uniqueStandardCodes(row).length || 0),
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || ''
  }
}

function buildRows(decisions, errors) {
  const rows = []
  const seen = new Set()
  for (const row of decisions.exact_anchor_group_review_decisions || []) {
    const id = row.decision_id || ''
    if (!id) errors.push('exact group review decision row missing decision_id')
    if (seen.has(id)) errors.push(`duplicate exact group review decision_id: ${id}`)
    seen.add(id)
    rows.push(recommendationFromDecision(row, errors))
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_grade_band: {},
    by_group_review_route: {},
    by_priority_tier: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_recommendation_route: {},
    by_subject: {},
    exact_group_review_auto_approval_recommendations: 0,
    exact_group_review_recommendations: rows.length,
    groups_with_multiple_standards: rows.filter(row => Number(row.unique_standard_codes || 0) > 1).length,
    max_rows_per_group: 0,
    recommended_needs_evidence_groups: 0,
    recommended_pending_groups: 0,
    recommended_reject_groups: 0,
    recommended_split_groups: 0,
    recommended_standard_level_ready_groups: 0,
    source_anchor_exact_evidence_items: 0,
    unique_standard_codes: new Set(),
    unique_unit_evidence_ids: new Set()
  }
  for (const row of rows) {
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_group_review_route, row.group_review_route)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_recommendation_route, row.recommendation_route)
    countInto(summary.by_subject, row.subject_slug)
    summary.max_rows_per_group = Math.max(summary.max_rows_per_group, Number(row.source_anchor_exact_evidence_items || 0))
    summary.source_anchor_exact_evidence_items += Number(row.source_anchor_exact_evidence_items || 0)
    for (const standard of row.standard_codes || []) summary.unique_standard_codes.add(standard)
    if (row.unit_evidence_id) summary.unique_unit_evidence_ids.add(row.unit_evidence_id)
    if (row.recommended_reviewer_decision === DECISION_SPLIT_GROUP) summary.recommended_split_groups += 1
    else if (row.recommended_reviewer_decision === DECISION_REJECT_GROUP) summary.recommended_reject_groups += 1
    else if (row.recommended_reviewer_decision === DECISION_NEEDS_EVIDENCE) summary.recommended_needs_evidence_groups += 1
    else if (row.recommended_reviewer_decision === DECISION_READY_FOR_STANDARD_LEVEL) summary.recommended_standard_level_ready_groups += 1
    else if (row.recommended_reviewer_decision === DECISION_PENDING) summary.recommended_pending_groups += 1
  }
  summary.unique_standard_codes = summary.unique_standard_codes.size
  summary.unique_unit_evidence_ids = summary.unique_unit_evidence_ids.size
  return summary
}

function markdownSummary(payload) {
  const rows = payload.exact_anchor_group_review_recommendations || []
  return `# H4G Source-Anchor Exact Group Review Recommendations

Generated at: ${payload.generated_at}

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| recommendations | ${payload.summary.exact_group_review_recommendations} |
| source-anchor exact evidence rows | ${payload.summary.source_anchor_exact_evidence_items} |
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

## Group Preview

| recommendation | grade | subject | rows | standards | unit |
| --- | --- | --- | ---: | ---: | --- |
${rows.map(row => `| ${markdownCell(row.recommended_reviewer_decision)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.subject_slug)} | ${row.source_anchor_exact_evidence_items} | ${row.unique_standard_codes} | ${truncate(row.unit_title, 80)} |`).join('\n') || '| - | - | - | 0 | 0 | - |'}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  if (!existsSync(args.decisions)) errors.push(`Missing decisions: ${args.decisions}`)
  const decisions = errors.length ? { exact_anchor_group_review_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(decisions, args, errors)
  const rows = buildRows(decisions, errors)
  const payload = {
    changes_official_standard_text: false,
    data_scope: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations',
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    exact_anchor_group_review_recommendations: rows,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_recommendations',
    recommendation_only: true,
    source_exact_group_review_decisions: args.decisions,
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
