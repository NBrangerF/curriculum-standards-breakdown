#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_worklist_anchor_domain_rejected_english_pe.md'

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
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_worklist.js \\
  --strict --require-items

Builds a focused, non-public confirmation worklist from post-candidate manual
review recommendations. It only includes bounded-source recommendations that a
reviewer may later adopt into the editable decisions template. It does not edit
decisions, approve bridges, write public/data, change official standard text, or
enable matcher/publication use.`)
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

function validateInputs(decisions, recommendations, args, errors) {
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
  if (recommendations.source_post_candidate_manual_review_decisions !== args.decisions) {
    errors.push('recommendations source_post_candidate_manual_review_decisions must match decisions arg')
  }
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

function worklistId(row) {
  return `h4g_anchor_group_post_candidate_manual_review_confirmation_${hashText(row.decision_id || row.manual_review_packet_item_id)}`
}

function missingConfirmations(decision) {
  return Object.entries(decision.required_confirmations || {})
    .filter(([, value]) => value !== true)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b))
}

function confirmationQuestions(decision, recommendation) {
  return [
    ...(decision.review_prompts || []),
    ...(decision.source_context?.review_questions || []),
    `If confirmed, copy reviewer_decision=${recommendation.recommended_reviewer_decision} into the editable decision template with reviewer notes.`,
    'Do not treat this work item as bridge approval, matcher approval, or publication approval.'
  ].filter(Boolean)
}

function buildWorkItem(decision, recommendation) {
  return {
    allowed_decisions: decision.allowed_decisions || [],
    confirmation_work_item_id: worklistId(decision),
    decision_id: decision.decision_id || '',
    downstream_action_decision_id: decision.downstream_action_decision_id || '',
    evidence_lane: decision.evidence_lane || '',
    evidence_packet_item_id: decision.evidence_packet_item_id || '',
    evidence_packet_source: decision.evidence_packet_source || '',
    grade_band: decision.grade_band || '',
    inventory_bucket: decision.inventory_bucket || '',
    manual_confirmation_lane: decision.manual_confirmation_lane || '',
    manual_review_packet_item_id: decision.manual_review_packet_item_id || '',
    missing_required_confirmations: missingConfirmations(decision),
    page_status: decision.page_status || '',
    post_candidate_manual_review_recommendation_id: recommendation.post_candidate_manual_review_recommendation_id || '',
    progression_group_id: decision.progression_group_id || '',
    recommendation_confidence: recommendation.recommendation_confidence || '',
    recommendation_route: recommendation.recommendation_route || '',
    recommended_next_gate_after_candidate_filter: recommendation.recommended_next_gate_after_candidate_filter || '',
    recommended_reviewer_decision_to_consider: recommendation.recommended_reviewer_decision || '',
    review_questions: confirmationQuestions(decision, recommendation),
    review_work_item_is_not_decision: true,
    reviewer_action: 'review_bounded_source_and_update_editable_manual_review_decision_if_confirmed',
    source_context: decision.source_context || {},
    source_downstream_action_batch: decision.source_downstream_action_batch || '',
    source_downstream_action_item_id: decision.source_downstream_action_item_id || '',
    source_key: decision.source_key || '',
    source_recommended_reviewer_decision: decision.recommended_reviewer_decision || '',
    source_reviewer_decision: decision.source_reviewer_decision || '',
    source_standard_context: decision.source_standard_context || {},
    standard_code: decision.standard_code || '',
    subject_slug: decision.subject_slug || '',
    target_grade_band: decision.target_grade_band || decision.grade_band || '',
    target_standard_code: decision.target_standard_code || decision.standard_code || '',
    unit_context: decision.unit_context || {},
    unit_evidence_id: decision.unit_evidence_id || '',
    unit_title: decision.unit_title || '',
    worklist_rank: decision.worklist_rank || 0,
    writes_public_data: false
  }
}

function summarize(rows, recommendations) {
  const exactAnchorPending = (recommendations.post_candidate_manual_review_recommendations || [])
    .filter(row => row.source_downstream_action_batch === 'source_anchor_evidence' && row.recommended_reviewer_decision === DECISION_PENDING)
    .length
  const summary = {
    by_evidence_lane: {},
    by_grade_band: {},
    by_manual_confirmation_lane: {},
    by_recommendation: {},
    by_recommendation_route: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    confirmation_work_items: rows.length,
    exact_anchor_recommendations_excluded: exactAnchorPending,
    item_level_confirmation_work_items: 0,
    source_row_confirmation_work_items: 0,
    unique_action_decisions: sorted(rows.map(row => row.downstream_action_decision_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    countInto(summary.by_evidence_lane, row.evidence_lane)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_manual_confirmation_lane, row.manual_confirmation_lane)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision_to_consider)
    countInto(summary.by_recommendation_route, row.recommendation_route)
    countInto(summary.by_source_downstream_action_batch, row.source_downstream_action_batch)
    countInto(summary.by_subject, row.subject_slug)
    if (row.source_downstream_action_batch === 'source_row_confirmation') summary.source_row_confirmation_work_items += 1
    if (row.source_downstream_action_batch === 'item_level_source_review') summary.item_level_confirmation_work_items += 1
  }
  return summary
}

function previewRows(rows) {
  return rows.map(row => (
    `| ${row.worklist_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.source_downstream_action_batch)} | ${markdownCell(row.recommended_reviewer_decision_to_consider)} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Manual Review Confirmation Worklist

Generated at: ${payload.generated_at}

This is a focused reviewer worklist for bounded-source post-candidate manual
review recommendations. It does not modify the editable decisions template and
does not approve bridges, matcher use, or publication.

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| confirmation work items | ${payload.summary.confirmation_work_items} |
| source-row confirmation items | ${payload.summary.source_row_confirmation_work_items} |
| item-level confirmation items | ${payload.summary.item_level_confirmation_work_items} |
| exact-anchor recommendations excluded | ${payload.summary.exact_anchor_recommendations_excluded} |
| unique standard codes | ${payload.summary.unique_standard_codes} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Subjects

| subject | rows |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Preview

| rank | subject | grade | standard | action batch | recommendation to consider | unit |
| ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.confirmation_work_items)}

## Guardrails

- Work items are not manual review decisions.
- A reviewer must update the editable decisions template before any later action gate can use these rows.
- Source-anchor exact evidence rows remain excluded and pending.
- Public data, matcher, and publication gates remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [['decisions', args.decisions], ['recommendations', args.recommendations]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { post_candidate_manual_review_decisions: [] }
  const recommendations = existsSync(args.recommendations) ? readJson(args.recommendations) : { post_candidate_manual_review_recommendations: [] }
  if (!errors.length) validateInputs(decisions, recommendations, args, errors)

  const decisionById = mapBy(decisions.post_candidate_manual_review_decisions || [], 'decision_id', errors, 'decisions')
  const rows = []
  for (const recommendation of recommendations.post_candidate_manual_review_recommendations || []) {
    if (!isConfirmationRecommendation(recommendation)) continue
    const decision = decisionById.get(recommendation.decision_id)
    if (!decision) {
      errors.push(`${recommendation.decision_id || recommendation.post_candidate_manual_review_recommendation_id} missing source manual review decision`)
      continue
    }
    if (decision.reviewer_decision !== DECISION_PENDING || decision.decision_status !== 'pending') {
      errors.push(`${decision.decision_id} must remain pending before confirmation worklist review`)
    }
    if (decision.evidence_packet_source !== 'bounded_source_evidence_packet') {
      errors.push(`${decision.decision_id} confirmation worklist item must come from bounded_source_evidence_packet`)
    }
    if (!(decision.allowed_decisions || []).includes(recommendation.recommended_reviewer_decision)) {
      errors.push(`${decision.decision_id} recommendation must be allowed by source manual review decision`)
    }
    rows.push(buildWorkItem(decision, recommendation))
  }
  rows.sort((a, b) => (a.worklist_rank || 0) - (b.worklist_rank || 0) || a.decision_id.localeCompare(b.decision_id))
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no confirmation work items were generated')

  return {
    changes_official_standard_text: false,
    confirmation_work_items: rows,
    confirmation_worklist_only: true,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_worklist',
    review_only: true,
    source_post_candidate_manual_review_decisions: args.decisions,
    source_post_candidate_manual_review_recommendations: args.recommendations,
    summary: summarize(rows, recommendations),
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
