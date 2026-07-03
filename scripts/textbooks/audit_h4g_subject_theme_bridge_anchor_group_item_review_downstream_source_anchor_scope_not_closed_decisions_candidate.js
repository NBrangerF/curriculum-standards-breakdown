#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate_anchor_domain_rejected_english_pe_audit.md'

const CANDIDATE_DECISION = 'source_anchor_scope_not_closed_requires_split'
const CANDIDATE_STATUS = 'recommendation_candidate_reviewed'
const ALLOWED_CHANGED_ROW_FIELDS = new Set([
  'decision_note',
  'decision_status',
  'required_confirmations',
  'reviewed_at',
  'reviewed_by',
  'reviewer_decision',
  'source_anchor_scope_not_closed_candidate_policy',
  'source_anchor_scope_not_closed_decision_candidate',
  'source_anchor_scope_not_closed_recommendation_evidence'
])

function parseArgs(argv) {
  const args = {
    candidate: DEFAULT_CANDIDATE,
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    recommendations: DEFAULT_RECOMMENDATIONS,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate.js \\
  --candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --recommendations generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the source-anchor scope-not-closed decisions candidate. The audit
ensures only recommendation-supported scope-not-closed rows changed, all other
rows remain identical to the source template, and no public/matcher/publication
capability was introduced.`)
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

function validateSourceDecisions(decisions, args, errors) {
  if (decisions.valid !== true) errors.push('source decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template') {
    errors.push('source decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template') {
    errors.push('source decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template')
  }
  if (decisions.decision_template_only !== true) errors.push('source decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('source decisions editable_manual_review_template must be true')
  validatePolicy('source decisions', decisions, errors)
  if (!Array.isArray(decisions.downstream_source_anchor_review_decisions)) {
    errors.push('source decisions downstream_source_anchor_review_decisions must be an array')
  }
  if (args.requireItems && !(decisions.downstream_source_anchor_review_decisions || []).length) {
    errors.push('requireItems is set but source decisions has no rows')
  }
}

function validateRecommendations(recommendations, args, errors) {
  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations') {
    errors.push('recommendations purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (recommendations.source_downstream_source_anchor_review_decisions !== args.decisions) {
    errors.push('recommendations source_downstream_source_anchor_review_decisions must match audit arg')
  }
  validatePolicy('recommendations', recommendations, errors)
  if (!Array.isArray(recommendations.downstream_source_anchor_review_recommendations)) {
    errors.push('recommendations downstream_source_anchor_review_recommendations must be an array')
  }
  if (args.requireItems && !(recommendations.downstream_source_anchor_review_recommendations || []).length) {
    errors.push('requireItems is set but recommendations has no rows')
  }
}

function validateCandidateTopLevel(candidate, args, errors) {
  if (candidate.valid !== true) errors.push('candidate valid must be true')
  if (candidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template') {
    errors.push('candidate purpose should preserve source source-anchor review decisions template purpose')
  }
  if (candidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate') {
    errors.push('candidate candidate_purpose mismatch')
  }
  if (candidate.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template') {
    errors.push('candidate data_scope must preserve source decisions data_scope')
  }
  if (candidate.source_decisions_template !== args.decisions) errors.push('candidate source_decisions_template must match audit arg')
  if (candidate.source_review_recommendations !== args.recommendations) {
    errors.push('candidate source_review_recommendations must match audit arg')
  }
  if (candidate.review_only !== true) errors.push('candidate review_only must be true')
  if (candidate.publication_candidate !== false) errors.push('candidate publication_candidate must be false')
  validatePolicy('candidate', candidate, errors)
  const policy = candidate.source_anchor_scope_not_closed_candidate_policy || {}
  for (const key of [
    'downstream_action_decision_must_be_edited_separately',
    'downstream_source_anchor_review_candidate_is_not_approval',
    'exact_anchor_evidence_not_approved',
    'item_level_decision_must_be_edited_separately',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_rebuild_after_scope_split',
    'scope_not_closed_candidate_only'
  ]) {
    if (policy[key] !== true) errors.push(`candidate policy ${key} must be true`)
  }
  validatePolicy('candidate policy', policy, errors)
  if (!Array.isArray(candidate.downstream_source_anchor_review_decisions)) {
    errors.push('candidate downstream_source_anchor_review_decisions must be an array')
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

function expectedEvidence(base, recommendation, recommendationsPath) {
  return {
    decision_id: base.decision_id || '',
    downstream_action_decision_id: base.downstream_action_decision_id || '',
    exact_anchor_auto_approval: false,
    inventory_item_id: base.inventory_item_id || recommendation.inventory_item_id || '',
    page_evidence_packet_item_id: base.page_evidence_packet_item_id || recommendation.page_evidence_packet_item_id || '',
    page_evidence_status: recommendation.page_evidence_status || '',
    page_hint_source: recommendation.page_hint_source || '',
    primary_review_bucket: recommendation.primary_review_bucket || '',
    recommendation_confidence: recommendation.recommendation_confidence || '',
    recommendation_id: recommendation.source_anchor_review_recommendation_id || '',
    recommendations: recommendationsPath,
    recommended_disposition: recommendation.recommended_disposition || '',
    recommended_next_gate: recommendation.recommended_next_gate || '',
    recommended_reviewer_decision: recommendation.recommended_reviewer_decision || '',
    review_lane: recommendation.review_lane || '',
    sibling_h4g_grade_count: recommendation.sibling_h4g_grade_count || 0,
    source_downstream_source_anchor_review_work_item_id: recommendation.source_downstream_source_anchor_review_work_item_id || '',
    source_key: recommendation.source_key || '',
    target_standard_code: recommendation.target_standard_code || base.target_standard_code || '',
    unit_evidence_id: recommendation.unit_evidence_id || base.unit_evidence_id || '',
    unit_title: recommendation.unit_title || base.unit_title || ''
  }
}

function validateUnchangedExceptAllowed(base, candidate, errors) {
  const prefix = candidate.decision_id || base.decision_id || '(missing decision id)'
  const keys = sorted([...Object.keys(base || {}), ...Object.keys(candidate || {})])
  for (const key of keys) {
    if (ALLOWED_CHANGED_ROW_FIELDS.has(key)) continue
    if (!sameJson(base[key], candidate[key])) errors.push(`${prefix} changed forbidden field ${key}`)
  }
}

function validateCandidateRow(base, candidate, recommendation, args, errors, stats) {
  const prefix = candidate.decision_id || base.decision_id || '(missing decision id)'
  validateUnchangedExceptAllowed(base, candidate, errors)
  if (base.reviewer_decision !== 'pending') errors.push(`${prefix} source decision reviewer_decision must still be pending`)
  if (base.decision_status !== 'pending') errors.push(`${prefix} source decision decision_status must still be pending`)
  if (!(base.allowed_decisions || []).includes(CANDIDATE_DECISION)) {
    errors.push(`${prefix} base allowed_decisions must include ${CANDIDATE_DECISION}`)
  }
  if (!isScopeNotClosedRecommendation(recommendation)) errors.push(`${prefix} recommendation must be scope-not-closed`)
  if (candidate.reviewer_decision !== CANDIDATE_DECISION) errors.push(`${prefix} reviewer_decision mismatch`)
  if (candidate.decision_status !== CANDIDATE_STATUS) errors.push(`${prefix} decision_status mismatch`)
  if (!candidate.reviewed_at) errors.push(`${prefix} reviewed_at is required`)
  if (!candidate.reviewed_by) errors.push(`${prefix} reviewed_by is required`)
  if (candidate.source_anchor_scope_not_closed_decision_candidate !== true) {
    errors.push(`${prefix} source_anchor_scope_not_closed_decision_candidate must be true`)
  }
  if (!sameJson(candidate.required_confirmations, expectedConfirmations(base))) {
    errors.push(`${prefix} required_confirmations mismatch`)
  }
  const evidence = candidate.source_anchor_scope_not_closed_recommendation_evidence || {}
  const expected = expectedEvidence(base, recommendation, args.recommendations)
  for (const [key, value] of Object.entries(expected)) {
    if (!sameJson(evidence[key], value)) errors.push(`${prefix} source_anchor_scope_not_closed_recommendation_evidence.${key} mismatch`)
  }
  if (!Array.isArray(evidence.recommendation_reasons) || !evidence.recommendation_reasons.length) {
    errors.push(`${prefix} recommendation_reasons must be populated`)
  }
  if (!Array.isArray(evidence.risk_signals) || !evidence.risk_signals.length) {
    errors.push(`${prefix} risk_signals must be populated`)
  }
  const rowPolicy = candidate.source_anchor_scope_not_closed_candidate_policy || {}
  for (const key of [
    'downstream_action_decision_must_be_edited_separately',
    'downstream_source_anchor_review_candidate_is_not_approval',
    'exact_anchor_evidence_not_approved',
    'item_level_decision_must_be_edited_separately',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_rebuild_after_scope_split',
    'scope_not_closed_candidate_only'
  ]) {
    if (rowPolicy[key] !== true) errors.push(`${prefix} source_anchor_scope_not_closed_candidate_policy.${key} must be true`)
  }
  validatePolicy(`${prefix} source_anchor_scope_not_closed_candidate_policy`, rowPolicy, errors)

  stats.candidate_decisions += 1
  countInto(stats.by_grade_band, candidate.grade_band)
  countInto(stats.by_page_evidence_status, candidate.page_evidence_status)
  countInto(stats.by_page_hint_source, candidate.page_hint_source)
  countInto(stats.by_subject, candidate.subject_slug)
  countInto(stats.by_target_standard_code, candidate.target_standard_code)
}

function validateUnchangedRow(base, candidate, errors) {
  const prefix = candidate?.decision_id || base?.decision_id || '(missing decision id)'
  if (!sameJson(base, candidate)) errors.push(`${prefix} non-candidate row must remain unchanged`)
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Scope-Not-Closed Decisions Candidate Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| review decisions | ${payload.summary.review_decisions} |
| expected candidate decisions | ${payload.summary.expected_candidate_decisions} |
| audited candidate decisions | ${payload.summary.candidate_decisions} |
| pending review decisions | ${payload.summary.pending_review_decisions} |
| changed non-candidate decisions | ${payload.summary.changed_non_candidate_decisions} |
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

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['candidate', args.candidate],
    ['decisions', args.decisions],
    ['recommendations', args.recommendations]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const candidate = existsSync(args.candidate) ? readJson(args.candidate) : { downstream_source_anchor_review_decisions: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { downstream_source_anchor_review_decisions: [] }
  const recommendations = existsSync(args.recommendations) ? readJson(args.recommendations) : { downstream_source_anchor_review_recommendations: [] }
  if (!errors.length) {
    validateSourceDecisions(decisions, args, errors)
    validateRecommendations(recommendations, args, errors)
    validateCandidateTopLevel(candidate, args, errors)
  }

  const sourceById = mapBy(decisions.downstream_source_anchor_review_decisions || [], 'decision_id', errors, 'source decisions')
  const candidateById = mapBy(candidate.downstream_source_anchor_review_decisions || [], 'decision_id', errors, 'candidate decisions')
  const recommendationByDecisionId = mapBy(recommendations.downstream_source_anchor_review_recommendations || [], 'decision_id', errors, 'recommendations')
  const expectedCandidateByDecisionId = new Map()
  for (const recommendation of recommendations.downstream_source_anchor_review_recommendations || []) {
    if (!isScopeNotClosedRecommendation(recommendation)) continue
    expectedCandidateByDecisionId.set(recommendation.decision_id, recommendation)
  }

  const stats = {
    by_grade_band: {},
    by_page_evidence_status: {},
    by_page_hint_source: {},
    by_subject: {},
    by_target_standard_code: {},
    candidate_decisions: 0,
    changed_non_candidate_decisions: 0,
    exact_anchor_auto_approval_candidates: 0,
    expected_candidate_decisions: expectedCandidateByDecisionId.size,
    pending_review_decisions: (candidate.downstream_source_anchor_review_decisions || []).filter(row => row.reviewer_decision === 'pending').length,
    recommendation_rows: (recommendations.downstream_source_anchor_review_recommendations || []).length,
    review_decisions: (candidate.downstream_source_anchor_review_decisions || []).length,
    scope_not_closed_recommendations: expectedCandidateByDecisionId.size
  }

  for (const [decisionId, base] of sourceById.entries()) {
    const row = candidateById.get(decisionId)
    if (!row) {
      errors.push(`${decisionId} missing candidate row`)
      continue
    }
    const recommendation = expectedCandidateByDecisionId.get(decisionId)
    if (recommendation) validateCandidateRow(base, row, recommendation, args, errors, stats)
    else {
      if (!sameJson(base, row)) stats.changed_non_candidate_decisions += 1
      validateUnchangedRow(base, row, errors)
    }
  }
  for (const decisionId of candidateById.keys()) {
    if (!sourceById.has(decisionId)) errors.push(`${decisionId} unexpected candidate row`)
  }
  for (const decisionId of expectedCandidateByDecisionId.keys()) {
    if (!sourceById.has(decisionId)) errors.push(`${decisionId} expected recommendation lacks source decision row`)
    if (!recommendationByDecisionId.has(decisionId)) errors.push(`${decisionId} missing recommendation row`)
  }
  if (args.requireItems && !stats.candidate_decisions) errors.push('requireItems is set but no candidate decisions were audited')
  if (stats.candidate_decisions !== stats.expected_candidate_decisions) {
    errors.push(`candidate decisions ${stats.candidate_decisions} must match expected ${stats.expected_candidate_decisions}`)
  }
  if (stats.review_decisions !== (decisions.downstream_source_anchor_review_decisions || []).length) {
    errors.push('candidate review decisions count must match source decisions')
  }
  if (stats.exact_anchor_auto_approval_candidates) errors.push('exact-anchor auto approval candidates must be 0')

  const summary = candidate.summary || {}
  for (const key of [
    'candidate_decisions',
    'pending_review_decisions',
    'recommendation_rows',
    'review_decisions',
    'scope_not_closed_recommendations'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`candidate summary.${key} mismatch`)
  }
  for (const key of ['by_grade_band', 'by_page_evidence_status', 'by_page_hint_source', 'by_subject', 'by_target_standard_code']) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`candidate summary.${key} mismatch`)
  }

  return {
    candidate: args.candidate,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    recommendations: args.recommendations,
    require_items: args.requireItems,
    source_decisions: args.decisions,
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
