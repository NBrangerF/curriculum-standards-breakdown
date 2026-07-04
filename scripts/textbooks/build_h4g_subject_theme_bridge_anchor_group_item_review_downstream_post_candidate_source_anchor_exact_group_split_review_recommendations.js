#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_recommendations_anchor_domain_rejected_english_pe.md'

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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_recommendations.js \\
  --strict --require-items

Builds recommendation-only routing from standard-level split review decisions.
It does not edit decisions, approve standards, write public/data, change
official standard text, or enable matcher/publication use.`)
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

function truncate(value, max = 112) {
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

function validateDecisions(decisions, args, errors) {
  if (decisions.valid !== true) errors.push('split review decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('split review decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template') {
    errors.push('split review decisions purpose mismatch')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template') {
    errors.push('split review decisions data_scope mismatch')
  }
  if (decisions.decision_template_only !== true) errors.push('split review decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('split review decisions editable_manual_review_template must be true')
  if (decisions.split_standard_decision_template_only !== true) errors.push('split review decisions split_standard_decision_template_only must be true')
  if (decisions.standard_level_exact_anchor_decision_candidate_only !== true) {
    errors.push('split review decisions standard_level_exact_anchor_decision_candidate_only must be true')
  }
  if (!Array.isArray(decisions.split_review_decisions)) errors.push('split review decisions rows must be an array')
  if (args.requireItems && !(decisions.split_review_decisions || []).length) {
    errors.push('requireItems is set but split review decisions has no rows')
  }
  validatePolicy('split review decisions', decisions, errors)
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

function recommendationFromDecision(row, errors) {
  const recommendation = recommendedReviewerDecision(row)
  const id = row.decision_id || ''
  if (!KNOWN_DECISIONS.has(row.reviewer_decision || '')) {
    errors.push(`${id} reviewer_decision is not recognized: ${row.reviewer_decision || 'missing'}`)
  }
  if (!(row.allowed_decisions || []).includes(recommendation)) {
    errors.push(`${id} recommended_reviewer_decision ${recommendation} must be allowed by source split review decision`)
  }
  if (recommendation !== DECISION_PENDING && row.decision_status !== 'reviewed') {
    errors.push(`${id} non-pending split recommendation requires reviewed source decision`)
  }
  return {
    allowed_decisions: row.allowed_decisions || [],
    decision_id: id,
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
    source_split_review_decision_id: id,
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

function buildRows(decisions, errors) {
  const seen = new Set()
  const rows = []
  for (const row of decisions.split_review_decisions || []) {
    const id = row.decision_id || ''
    if (!id) errors.push('split review decision row missing decision_id')
    if (seen.has(id)) errors.push(`duplicate split review decision_id: ${id}`)
    seen.add(id)
    rows.push(recommendationFromDecision(row, errors))
  }
  return rows
}

function summarize(rows) {
  const summary = {
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
    more_evidence_recommendations: 0,
    pending_recommendations: 0,
    reject_generic_recommendations: 0,
    split_activity_recommendations: 0,
    split_review_recommendations: rows.length,
    unique_exact_anchor_evidence_items: sorted(rows.map(row => row.exact_anchor_evidence_packet_id)).length,
    unique_parent_action_work_items: sorted(rows.map(row => row.parent_action_work_item_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_group_review_route, row.group_review_route)
    countInto(summary.by_item_review_surface, row.item_review_surface)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_recommendation_route, row.recommendation_route)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_work_queue, row.work_queue)
    if (row.recommended_reviewer_decision === DECISION_PENDING) summary.pending_recommendations += 1
    if (row.recommended_reviewer_decision === DECISION_ACCEPT_CANDIDATE) summary.accept_candidate_recommendations += 1
    if (row.recommended_reviewer_decision === DECISION_REJECT_GENERIC) summary.reject_generic_recommendations += 1
    if (row.recommended_reviewer_decision === DECISION_NEEDS_MORE_EVIDENCE) summary.more_evidence_recommendations += 1
    if (row.recommended_reviewer_decision === DECISION_SPLIT_ACTIVITY) summary.split_activity_recommendations += 1
  }
  return summary
}

function previewRows(rows) {
  return rows.map(row => (
    `| ${row.worklist_rank} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.recommended_reviewer_decision)} | ${markdownCell(row.recommendation_route)} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Source-Anchor Exact Group Split Review Recommendations

Generated at: ${payload.generated_at}

Source decisions: \`${payload.source_split_review_decisions}\`

These rows are recommendation-only routing derived from standard-level split
review decisions. They do not edit decisions, approve standards, write
\`public/data\`, change official standard text, or enable matcher/publication
use.

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| recommendation only | ${payload.recommendation_only} |
| recommendations | ${payload.summary.split_review_recommendations} |
| pending recommendations | ${payload.summary.pending_recommendations} |
| accept candidate recommendations | ${payload.summary.accept_candidate_recommendations} |
| reject generic recommendations | ${payload.summary.reject_generic_recommendations} |
| more evidence recommendations | ${payload.summary.more_evidence_recommendations} |
| split activity recommendations | ${payload.summary.split_activity_recommendations} |
| auto approval recommendations | ${payload.summary.auto_approval_recommendations} |
| unique standards | ${payload.summary.unique_standard_codes} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Recommendation Routes

| route | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation_route)}

## Preview

| rank | grade | standard | recommendation | route | unit |
| ---: | --- | --- | --- | --- | --- |
${previewRows(payload.split_review_recommendations.slice(0, 40))}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  if (!existsSync(args.decisions)) errors.push(`Missing split review decisions: ${args.decisions}`)
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { split_review_decisions: [] }
  if (!errors.length) validateDecisions(decisions, args, errors)
  const rows = buildRows(decisions, errors)
  const summary = summarize(rows)
  if (summary.auto_approval_recommendations) {
    errors.push(`split review recommendations must not auto-approve: ${summary.auto_approval_recommendations}`)
  }
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_recommendations',
    recommendation_only: true,
    review_only: true,
    source_split_review_decisions: args.decisions,
    split_review_recommendations: rows,
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
