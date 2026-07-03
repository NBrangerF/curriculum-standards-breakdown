#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate_anchor_domain_rejected_english_pe.md'

const CANDIDATE_DECISION = 'source_anchor_scope_not_closed_requires_split'
const CANDIDATE_STATUS = 'recommendation_candidate_reviewed'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    recommendations: DEFAULT_RECOMMENDATIONS,
    requireItems: false,
    reviewedAt: new Date().toISOString().slice(0, 10),
    reviewedBy: 'Codex source-anchor scope-not-closed recommendations',
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--recommendations') args.recommendations = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--reviewed-by') args.reviewedBy = argv[++i]
    else if (item === '--reviewed-at') args.reviewedAt = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --recommendations generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a non-public source-anchor review decisions candidate from conservative
scope-not-closed recommendations. It only marks rows where the recommendation
layer says the source/unit scope is not closed; it does not approve exact
anchors, edit the source template, write public/data, change official standard
text, or enable matcher/publication use.`)
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

function truncate(value, max = 110) {
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
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('decisions editable_manual_review_template must be true')
  validatePolicy('decisions', decisions, errors)
  if (!Array.isArray(decisions.downstream_source_anchor_review_decisions)) {
    errors.push('decisions downstream_source_anchor_review_decisions must be an array')
  }
  if (args.requireItems && !(decisions.downstream_source_anchor_review_decisions || []).length) {
    errors.push('requireItems is set but decisions has no downstream_source_anchor_review_decisions')
  }
}

function validateRecommendations(recommendations, args, errors) {
  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations') {
    errors.push('recommendations purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (recommendations.source_downstream_source_anchor_review_decisions !== args.decisions) {
    errors.push('recommendations source_downstream_source_anchor_review_decisions must match decisions arg')
  }
  validatePolicy('recommendations', recommendations, errors)
  if (!Array.isArray(recommendations.downstream_source_anchor_review_recommendations)) {
    errors.push('recommendations downstream_source_anchor_review_recommendations must be an array')
  }
  if (args.requireItems && !(recommendations.downstream_source_anchor_review_recommendations || []).length) {
    errors.push('requireItems is set but recommendations has no rows')
  }
}

function candidatePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_decision_must_be_edited_separately: true,
    downstream_source_anchor_review_candidate_is_not_approval: true,
    eligible_for_h4g_differentiation: false,
    exact_anchor_evidence_not_approved: true,
    item_level_decision_must_be_edited_separately: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    requires_rebuild_after_scope_split: true,
    scope_not_closed_candidate_only: true,
    writes_public_data: false
  }
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

function isScopeNotClosedRecommendation(row) {
  return row.recommendation_only === true &&
    row.recommendation_is_official_decision === false &&
    row.exact_anchor_auto_approval === false &&
    row.recommendation_confidence === 'high' &&
    row.recommended_reviewer_decision === CANDIDATE_DECISION &&
    row.review_lane === 'source_anchor_unit_or_source_scope_review_lane' &&
    row.recommended_disposition === 'scope_not_closed_requires_unit_or_source_row_confirmation'
}

function expectedConfirmations(base) {
  return {
    ...(base.required_confirmations || {}),
    exact_anchor_evidence_not_approved: true,
    later_downstream_action_decision_edit_required: true,
    later_item_level_source_review_required: true,
    later_matcher_gate_required: true,
    later_publication_gate_required: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    source_anchor_scope_not_closed_confirmed: true,
    unit_or_source_row_confirmation_required: true
  }
}

function buildDecisionNote(row, recommendation) {
  return [
    'Recommendation-candidate non-public decision: the source-anchor scope is not closed for this row.',
    `The recommendation layer found ${recommendation.review_lane} with disposition ${recommendation.recommended_disposition}.`,
    `Target ${row.target_standard_code || row.standard_code} remains unapproved for exact-anchor evidence.`,
    'This only routes the row back to split/source-scope work; it is not bridge approval, matcher approval, or publication approval.'
  ].join(' ')
}

function recommendationEvidence(row, recommendation, args) {
  return {
    decision_id: row.decision_id || '',
    downstream_action_decision_id: row.downstream_action_decision_id || '',
    exact_anchor_auto_approval: recommendation.exact_anchor_auto_approval === true,
    inventory_item_id: row.inventory_item_id || recommendation.inventory_item_id || '',
    page_evidence_packet_item_id: row.page_evidence_packet_item_id || recommendation.page_evidence_packet_item_id || '',
    page_evidence_status: recommendation.page_evidence_status || '',
    page_hint_source: recommendation.page_hint_source || '',
    primary_review_bucket: recommendation.primary_review_bucket || '',
    recommendation_confidence: recommendation.recommendation_confidence || '',
    recommendation_id: recommendation.source_anchor_review_recommendation_id || '',
    recommendation_reasons: recommendation.recommendation_reasons || [],
    recommendations: args.recommendations,
    recommended_disposition: recommendation.recommended_disposition || '',
    recommended_next_gate: recommendation.recommended_next_gate || '',
    recommended_reviewer_decision: recommendation.recommended_reviewer_decision || '',
    review_lane: recommendation.review_lane || '',
    risk_profile: recommendation.risk_profile || {},
    risk_signals: recommendation.risk_signals || [],
    sibling_h4g_grade_count: recommendation.sibling_h4g_grade_count || 0,
    source_downstream_source_anchor_review_work_item_id: recommendation.source_downstream_source_anchor_review_work_item_id || '',
    source_key: recommendation.source_key || '',
    target_standard_code: recommendation.target_standard_code || row.target_standard_code || '',
    unit_evidence_id: recommendation.unit_evidence_id || row.unit_evidence_id || '',
    unit_title: recommendation.unit_title || row.unit_title || ''
  }
}

function applyRecommendationCandidate(row, recommendation, args) {
  return {
    ...row,
    decision_note: buildDecisionNote(row, recommendation),
    decision_status: CANDIDATE_STATUS,
    required_confirmations: expectedConfirmations(row),
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewedBy,
    reviewer_decision: CANDIDATE_DECISION,
    source_anchor_scope_not_closed_candidate_policy: candidatePolicy(),
    source_anchor_scope_not_closed_decision_candidate: true,
    source_anchor_scope_not_closed_recommendation_evidence: recommendationEvidence(row, recommendation, args)
  }
}

function summarize(rows, candidateRows, candidateRecommendations, recommendations) {
  const summary = {
    by_grade_band: {},
    by_page_evidence_status: {},
    by_page_hint_source: {},
    by_subject: {},
    by_target_standard_code: {},
    candidate_decisions: candidateRows.length,
    exact_anchor_auto_approval_candidates: 0,
    pending_review_decisions: rows.length - candidateRows.length,
    recommendation_rows: (recommendations.downstream_source_anchor_review_recommendations || []).length,
    review_decisions: rows.length,
    scope_not_closed_recommendations: candidateRecommendations.length,
    unique_progression_groups: sorted(candidateRecommendations.map(row => row.progression_group_id)).length,
    unique_target_standard_codes: sorted(candidateRecommendations.map(row => row.target_standard_code || row.standard_code)).length,
    unique_unit_evidence_ids: sorted(candidateRecommendations.map(row => row.unit_evidence_id)).length
  }
  for (const row of candidateRecommendations) {
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_evidence_status, row.page_evidence_status)
    countInto(summary.by_page_hint_source, row.page_hint_source)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.target_standard_code || row.standard_code)
  }
  return summary
}

function previewRows(candidateRecommendations) {
  return candidateRecommendations.slice(0, 40).map(row => (
    `| ${markdownCell(row.grade_band)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.target_standard_code)} | ${markdownCell(row.page_hint_source)} | ${truncate(row.unit_title || '-')} |`
  )).join('\n') || '| - | - | - | - | - |'
}

function markdownSummary(payload, candidateRecommendations) {
  return `# H4G Downstream Source-Anchor Scope-Not-Closed Decisions Candidate

Generated at: ${payload.generated_at}

This candidate copies the editable source-anchor review decisions template and
only marks rows where the recommendation layer says the source or unit scope is
not closed. It remains review-only and non-public.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| review decisions | ${payload.summary.review_decisions} |
| candidate decisions | ${payload.summary.candidate_decisions} |
| pending review decisions | ${payload.summary.pending_review_decisions} |
| scope-not-closed recommendations | ${payload.summary.scope_not_closed_recommendations} |
| exact-anchor auto approval candidates | ${payload.summary.exact_anchor_auto_approval_candidates} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Target Grades

| grade | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Subjects

| subject | rows |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Preview

| grade | subject | target standard | page hint | unit |
| --- | --- | --- | --- | --- |
${previewRows(candidateRecommendations)}

## Guardrails

- Candidate rows are not exact-anchor approvals.
- Non-candidate rows remain unchanged from the source decisions template.
- The editable source decisions template is not modified.
- Public data, matcher, and publication gates remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['decisions', args.decisions],
    ['recommendations', args.recommendations]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { downstream_source_anchor_review_decisions: [] }
  const recommendations = existsSync(args.recommendations) ? readJson(args.recommendations) : { downstream_source_anchor_review_recommendations: [] }
  if (!errors.length) {
    validateDecisions(decisions, args, errors)
    validateRecommendations(recommendations, args, errors)
  }

  const recommendationByDecisionId = mapBy(recommendations.downstream_source_anchor_review_recommendations || [], 'decision_id', errors, 'recommendations')
  const candidateByDecisionId = new Map()
  const candidateRecommendations = []
  for (const recommendation of recommendations.downstream_source_anchor_review_recommendations || []) {
    if (!isScopeNotClosedRecommendation(recommendation)) continue
    if (!(recommendation.allowed_decisions || []).includes(CANDIDATE_DECISION)) {
      errors.push(`${recommendation.decision_id || '(missing decision id)'} does not allow ${CANDIDATE_DECISION}`)
      continue
    }
    candidateByDecisionId.set(recommendation.decision_id, recommendation)
    candidateRecommendations.push(recommendation)
  }
  if (args.requireItems && !candidateRecommendations.length) {
    errors.push('requireItems is set but no source-anchor scope-not-closed candidate rows were found')
  }

  const rows = (decisions.downstream_source_anchor_review_decisions || []).map(row => {
    const recommendation = candidateByDecisionId.get(row.decision_id)
    if (!recommendation) return row
    if (row.reviewer_decision !== 'pending') {
      errors.push(`${row.decision_id} source-anchor review decision must still be pending`)
    }
    if (row.decision_status !== 'pending') {
      errors.push(`${row.decision_id} source-anchor review decision status must still be pending`)
    }
    if (!recommendationByDecisionId.has(row.decision_id)) {
      errors.push(`${row.decision_id} missing source-anchor recommendation`)
    }
    return applyRecommendationCandidate(row, recommendation, args)
  })
  const candidateRows = rows.filter(row => row.source_anchor_scope_not_closed_decision_candidate === true)

  return {
    ...decisions,
    candidate_purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate',
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_source_anchor_review_decisions: rows,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_candidate: false,
    publication_ready: false,
    review_only: true,
    source_anchor_scope_not_closed_candidate_policy: candidatePolicy(),
    source_decisions_template: args.decisions,
    source_review_recommendations: args.recommendations,
    summary: summarize(rows, candidateRows, candidateRecommendations, recommendations),
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
  const candidateRecommendations = (payload.downstream_source_anchor_review_decisions || [])
    .filter(row => row.source_anchor_scope_not_closed_decision_candidate === true)
    .map(row => row.source_anchor_scope_not_closed_recommendation_evidence || {})
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload, candidateRecommendations.map(evidence => ({
    grade_band: (payload.downstream_source_anchor_review_decisions || []).find(row => row.decision_id === evidence.decision_id)?.grade_band || '',
    page_hint_source: evidence.page_hint_source || '',
    subject_slug: (payload.downstream_source_anchor_review_decisions || []).find(row => row.decision_id === evidence.decision_id)?.subject_slug || '',
    target_standard_code: evidence.target_standard_code || '',
    unit_title: evidence.unit_title || ''
  }))))
  console.log(JSON.stringify({
    out: args.out,
    summary: payload.summary,
    valid: payload.valid
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
