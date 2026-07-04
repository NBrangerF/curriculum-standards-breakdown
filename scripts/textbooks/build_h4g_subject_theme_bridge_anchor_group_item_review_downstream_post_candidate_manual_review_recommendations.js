#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_recommendations_anchor_domain_rejected_english_pe.md'

const DECISION_PENDING = 'pending'
const SOURCE_ROW_CONFIRM = 'confirm_source_row_for_later_action_gate'
const ITEM_LEVEL_CONFIRM = 'confirm_item_level_source_scope_for_later_action_gate'
const KNOWN_ACTION_BATCHES = new Set(['source_row_confirmation', 'item_level_source_review', 'source_anchor_evidence'])

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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_recommendations.js \\
  --strict --require-items

Builds recommendation-only reviewer outcomes for post-candidate manual review
decisions. It does not edit the decisions template, approve bridges, write
public/data, change official standard text, or enable matcher/publication use.`)
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

function validateTopLevel(decisions, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template') {
    errors.push('decisions data_scope mismatch')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('decisions editable_manual_review_template must be true')
  if (!Array.isArray(decisions.post_candidate_manual_review_decisions)) {
    errors.push('decisions post_candidate_manual_review_decisions must be an array')
  }
  if (args.requireItems && !(decisions.post_candidate_manual_review_decisions || []).length) {
    errors.push('requireItems is set but decisions has no rows')
  }
  validatePolicy('decisions', decisions, errors)
}

function recommendedDecision(row) {
  const batch = row.source_downstream_action_batch || ''
  if (batch === 'source_row_confirmation') return SOURCE_ROW_CONFIRM
  if (batch === 'item_level_source_review') return ITEM_LEVEL_CONFIRM
  if (batch === 'source_anchor_evidence') return DECISION_PENDING
  return DECISION_PENDING
}

function recommendationRoute(row) {
  const batch = row.source_downstream_action_batch || ''
  if (batch === 'source_row_confirmation') return 'bounded_single_source_row_ready_for_later_action_confirmation'
  if (batch === 'item_level_source_review') return 'bounded_item_level_source_scope_ready_for_later_action_confirmation'
  if (batch === 'source_anchor_evidence') return 'source_anchor_exact_evidence_stays_pending_manual_text_review'
  return 'manual_review_required'
}

function recommendationConfidence(row) {
  const batch = row.source_downstream_action_batch || ''
  if (batch === 'source_row_confirmation') return 'medium'
  if (batch === 'item_level_source_review') return 'medium'
  if (batch === 'source_anchor_evidence') return 'low'
  return 'low'
}

function reviewerNote(row) {
  const batch = row.source_downstream_action_batch || ''
  if (batch === 'source_row_confirmation') {
    return 'Recommendation only: this bounded single source row can be manually confirmed for a later action gate, but it is not bridge approval.'
  }
  if (batch === 'item_level_source_review') {
    return 'Recommendation only: this bounded item-level source scope can be manually confirmed for a later action gate, but it is not matcher or publication approval.'
  }
  if (batch === 'source_anchor_evidence') {
    return 'Keep pending until a reviewer records exact same-grade anchor evidence from the page text; current row still carries broad-topic or fan-out risk.'
  }
  return 'Manual post-candidate review required before any later action gate.'
}

function recommendationReasons(row) {
  return uniqueStrings([
    `source_action_batch:${row.source_downstream_action_batch || 'missing'}`,
    `evidence_packet_source:${row.evidence_packet_source || 'missing'}`,
    `evidence_lane:${row.evidence_lane || 'missing'}`,
    `page_status:${row.page_status || 'missing'}`,
    `source_reviewer_decision:${row.source_reviewer_decision || 'missing'}`,
    row.recommended_next_gate_after_candidate_filter ? `next_gate:${row.recommended_next_gate_after_candidate_filter}` : '',
    row.recommended_reviewer_decision ? `source_recommendation:${row.recommended_reviewer_decision}` : '',
    ...(row.risk_signals || []).slice(0, 6)
  ])
}

function recommendationId(row) {
  return `h4g_anchor_group_post_candidate_manual_review_recommendation_${hashText(row.decision_id || row.manual_review_packet_item_id)}`
}

function recommendationFromDecision(row, errors) {
  const recommendation = recommendedDecision(row)
  if (!KNOWN_ACTION_BATCHES.has(row.source_downstream_action_batch || '')) {
    errors.push(`${row.decision_id} has unexpected source_downstream_action_batch: ${row.source_downstream_action_batch || 'missing'}`)
  }
  if (!(row.allowed_decisions || []).includes(recommendation)) {
    errors.push(`${row.decision_id} recommendation ${recommendation} must be allowed by the manual review decision`)
  }
  if (row.reviewer_decision !== DECISION_PENDING) {
    errors.push(`${row.decision_id} must still be pending before recommendation-only routing`)
  }
  return {
    allowed_decisions: row.allowed_decisions || [],
    decision_id: row.decision_id || '',
    evidence_lane: row.evidence_lane || '',
    evidence_packet_item_id: row.evidence_packet_item_id || '',
    evidence_packet_source: row.evidence_packet_source || '',
    grade_band: row.grade_band || '',
    manual_confirmation_lane: row.manual_confirmation_lane || '',
    manual_review_packet_item_id: row.manual_review_packet_item_id || '',
    page_status: row.page_status || '',
    post_candidate_manual_review_recommendation_id: recommendationId(row),
    progression_group_id: row.progression_group_id || '',
    recommendation_confidence: recommendationConfidence(row),
    recommendation_is_official_decision: false,
    recommendation_only: true,
    recommendation_reasons: recommendationReasons(row),
    recommendation_requires_manual_confirmation: true,
    recommendation_route: recommendationRoute(row),
    recommended_next_gate_after_candidate_filter: row.recommended_next_gate_after_candidate_filter || '',
    recommended_reviewer_decision: recommendation,
    reviewer_note: reviewerNote(row),
    risk_signals: row.risk_signals || [],
    source_downstream_action_batch: row.source_downstream_action_batch || '',
    source_downstream_action_item_id: row.source_downstream_action_item_id || '',
    source_key: row.source_key || '',
    source_recommended_reviewer_decision: row.recommended_reviewer_decision || '',
    source_reviewer_decision: row.source_reviewer_decision || '',
    standard_code: row.standard_code || '',
    subject_slug: row.subject_slug || '',
    target_grade_band: row.target_grade_band || '',
    target_standard_code: row.target_standard_code || row.standard_code || '',
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || '',
    worklist_rank: row.worklist_rank || 0
  }
}

function buildRows(decisions, errors) {
  const seen = new Set()
  const rows = []
  for (const row of decisions.post_candidate_manual_review_decisions || []) {
    const id = row.decision_id || ''
    if (!id) errors.push('manual review decision row missing decision_id')
    if (seen.has(id)) errors.push(`duplicate manual review decision_id: ${id}`)
    seen.add(id)
    rows.push(recommendationFromDecision(row, errors))
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_evidence_lane: {},
    by_evidence_packet_source: {},
    by_grade_band: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_recommendation_route: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    confirmation_candidate_recommendations: 0,
    pending_exact_anchor_review_recommendations: 0,
    post_candidate_manual_review_recommendations: rows.length,
    unique_action_decisions: sorted(rows.map(row => row.decision_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    countInto(summary.by_evidence_lane, row.evidence_lane)
    countInto(summary.by_evidence_packet_source, row.evidence_packet_source)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_recommendation_route, row.recommendation_route)
    countInto(summary.by_source_downstream_action_batch, row.source_downstream_action_batch)
    countInto(summary.by_subject, row.subject_slug)
    if (row.recommended_reviewer_decision === DECISION_PENDING) summary.pending_exact_anchor_review_recommendations += 1
    else summary.confirmation_candidate_recommendations += 1
  }
  return summary
}

function previewRows(rows) {
  return rows.map(row => (
    `| ${row.worklist_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.source_downstream_action_batch)} | ${markdownCell(row.recommended_reviewer_decision)} | ${markdownCell(row.recommendation_confidence)} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Manual Review Recommendations

Generated at: ${payload.generated_at}

Source decisions: \`${payload.source_post_candidate_manual_review_decisions}\`

These are recommendation-only reviewer outcomes for post-candidate manual
review decisions. They do not update the editable decisions template, approve
bridges, write \`public/data\`, change official standard text, or enable
matcher/publication use.

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| recommendation only | ${payload.recommendation_only} |
| recommendations | ${payload.summary.post_candidate_manual_review_recommendations} |
| confirmation candidate recommendations | ${payload.summary.confirmation_candidate_recommendations} |
| pending exact-anchor review recommendations | ${payload.summary.pending_exact_anchor_review_recommendations} |
| unique standard codes | ${payload.summary.unique_standard_codes} |
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

| rank | subject | grade | standard | action batch | recommendation | confidence | unit |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.post_candidate_manual_review_recommendations)}

## Guardrails

- Recommendations are not official decisions.
- Copying a recommendation into the editable decision template still requires reviewer notes and confirmations.
- Matcher and publication gates remain separate later steps.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.decisions)) errors.push(`Missing decisions: ${args.decisions}`)
  const decisions = errors.length ? { post_candidate_manual_review_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(decisions, args, errors)
  const rows = buildRows(decisions, errors)
  if (args.requireItems && !rows.length) {
    errors.push('requireItems is set but no post-candidate manual review recommendations were generated')
  }
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    post_candidate_manual_review_recommendations: rows,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_recommendations',
    recommendation_only: true,
    source_post_candidate_manual_review_decisions: args.decisions,
    summary: summarize(rows),
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
  const payload = buildPayload(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
