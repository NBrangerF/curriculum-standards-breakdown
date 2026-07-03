#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_recommendations.json'
const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_batch.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_decisions_template.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_recommendations_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_recommendations_audit.md'

const ALLOWED_DECISIONS = new Set([
  'pending',
  'keep_noneligible_overbroad_match',
  'needs_source_anchor_specificity_review',
  'needs_scoped_alias_review',
  'needs_manual_candidate_rebuild',
  'reject_match_not_relevant'
])

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
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
    else if (item === '--batch') args.batch = argv[++i]
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
node scripts/textbooks/audit_h4g_unit_evidence_anchor_policy_review_recommendations.js \\
  --strict --require-items

Audits the read-only H4G anchor-policy review recommendations against the
review batch and decisions template. Recommendations are valid only as triage
guidance and must not approve candidates, write public/data, or enable matcher
or publication use.`)
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

function validateRecommendationPolicy(label, policy, errors) {
  validatePolicy(label, policy, errors)
  for (const key of [
    'recommendation_only',
    'requires_later_candidate_coverage_recheck',
    'requires_later_consistency_gate',
    'requires_later_manual_review',
    'requires_later_publication_gate',
    'review_batch_only'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
}

function validateTopLevel(recommendations, batch, decisions, args, errors) {
  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_unit_evidence_anchor_policy_review_recommendations') {
    errors.push('recommendations purpose mismatch')
  }
  if (recommendations.source_anchor_policy_review_batch !== args.batch) {
    errors.push('recommendations source batch must match audit arg')
  }
  if (recommendations.source_anchor_policy_review_decisions !== args.decisions) {
    errors.push('recommendations source decisions must match audit arg')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (recommendations.review_batch_only !== true) errors.push('recommendations review_batch_only must be true')
  if (!Array.isArray(recommendations.anchor_policy_review_recommendations)) {
    errors.push('recommendations anchor_policy_review_recommendations must be an array')
  }
  validatePolicy('recommendations', recommendations, errors)
  validateRecommendationPolicy('recommendations policy', recommendations.policy || {}, errors)

  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_unit_evidence_anchor_policy_review_batch') errors.push('batch purpose mismatch')
  validatePolicy('batch', batch, errors)

  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_unit_evidence_anchor_policy_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  validatePolicy('decisions', decisions, errors)
}

function summarize(rows) {
  const summary = {
    anchor_policy_review_recommendations: rows.length,
    by_grade_band: {},
    by_recommended_next_gate: {},
    by_recommended_route: {},
    by_risk_flag: {},
    by_subject: {},
    by_suggested_reviewer_decision: {},
    candidate_match_options: 0,
    high_confidence_candidate_matches: 0,
    manual_rebuild_recommendations: 0,
    medium_confidence_candidate_matches: 0,
    noneligible_alignment_only_recommendations: 0,
    reference_candidate_match_ids: 0,
    source_anchor_specificity_review_recommendations: 0
  }
  for (const row of rows) {
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_recommended_next_gate, row.recommended_next_gate)
    countInto(summary.by_recommended_route, row.recommended_route)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_suggested_reviewer_decision, row.suggested_reviewer_decision)
    for (const flag of row.risk_flags || []) countInto(summary.by_risk_flag, flag)
    summary.candidate_match_options += row.evidence_summary?.candidate_matches || 0
    summary.high_confidence_candidate_matches += row.evidence_summary?.high_confidence_matches || 0
    summary.medium_confidence_candidate_matches += row.evidence_summary?.medium_confidence_matches || 0
    summary.reference_candidate_match_ids += row.reference_candidate_match_ids?.length || 0
    if (row.suggested_reviewer_decision === 'needs_manual_candidate_rebuild') summary.manual_rebuild_recommendations += 1
    if (row.suggested_reviewer_decision === 'needs_source_anchor_specificity_review') {
      summary.source_anchor_specificity_review_recommendations += 1
    }
    if (row.risk_flags?.includes('noneligible_alignment_only')) summary.noneligible_alignment_only_recommendations += 1
  }
  return summary
}

function itemMatchIds(item) {
  return sorted((item?.candidate_matches || []).map(match => match.match_id))
}

function validateRecommendation(row, item, decision, errors, stats) {
  const prefix = row.recommendation_id || row.anchor_policy_review_item_id || '(recommendation)'
  validatePolicy(prefix, row, errors)
  validateRecommendationPolicy(`${prefix} policy`, row.policy || {}, errors)
  if (!row.recommendation_id) errors.push(`${prefix} missing recommendation_id`)
  if (!row.anchor_policy_review_item_id) errors.push(`${prefix} missing anchor_policy_review_item_id`)
  if (!ALLOWED_DECISIONS.has(row.suggested_reviewer_decision)) errors.push(`${prefix} invalid suggested_reviewer_decision`)
  if (row.suggested_reviewer_decision === 'pending') errors.push(`${prefix} suggested_reviewer_decision must not be pending`)
  if (row.selected_candidate_match_ids?.length) errors.push(`${prefix} selected_candidate_match_ids must remain empty`)
  if (row.do_not_copy_reference_matches_to_selected_candidate_match_ids !== true) {
    errors.push(`${prefix} must warn against copying reference matches into selected_candidate_match_ids`)
  }
  if (!row.required_manual_checks?.length) errors.push(`${prefix} required_manual_checks must not be empty`)
  if (!row.risk_flags?.length) errors.push(`${prefix} risk_flags must not be empty`)
  if (!row.recommended_route) errors.push(`${prefix} missing recommended_route`)
  if (!row.recommended_next_gate) errors.push(`${prefix} missing recommended_next_gate`)
  if (!item) {
    errors.push(`${prefix} missing source review batch item`)
    return
  }
  if (!decision) {
    errors.push(`${prefix} missing source decision row`)
    return
  }
  for (const [key, expected] of Object.entries({
    decision_id: decision.decision_id || '',
    grade_band: item.grade_band || '',
    group_progression_completeness: item.group_progression_completeness || '',
    parent_action_work_item_id: item.parent_action_work_item_id || '',
    progression_group_id: item.progression_group_id || '',
    standard_code: item.standard_code || '',
    subject_slug: item.subject_slug || ''
  })) {
    if (!sameJson(row[key], expected)) errors.push(`${prefix} ${key} mismatch`)
  }
  if (!sameJson(row.group_grade_bands || [], item.group_grade_bands || [])) errors.push(`${prefix} group_grade_bands mismatch`)
  if (!sameJson(row.group_standard_codes || [], item.group_standard_codes || [])) errors.push(`${prefix} group_standard_codes mismatch`)
  if (row.current_reviewer_decision !== decision.reviewer_decision) errors.push(`${prefix} current_reviewer_decision mismatch`)
  if (row.current_decision_status !== decision.decision_status) errors.push(`${prefix} current_decision_status mismatch`)
  const sourceMatchIds = itemMatchIds(item)
  for (const matchId of row.reference_candidate_match_ids || []) {
    if (!sourceMatchIds.includes(matchId)) errors.push(`${prefix} reference match is not in source item: ${matchId}`)
  }
  for (const match of row.reference_candidate_matches || []) {
    if (!sourceMatchIds.includes(match.match_id)) errors.push(`${prefix} reference match object is not in source item: ${match.match_id}`)
  }
  if ((row.evidence_summary?.candidate_matches || 0) !== (item.candidate_matches || []).length) {
    errors.push(`${prefix} evidence_summary.candidate_matches mismatch`)
  }
  stats.audited_recommendations += 1
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['recommendations', args.recommendations],
    ['batch', args.batch],
    ['decisions', args.decisions]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const recommendations = existsSync(args.recommendations)
    ? readJson(args.recommendations)
    : { anchor_policy_review_recommendations: [] }
  const batch = existsSync(args.batch) ? readJson(args.batch) : { anchor_policy_review_items: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { anchor_policy_review_decisions: [] }
  if (!errors.length) validateTopLevel(recommendations, batch, decisions, args, errors)

  const rows = recommendations.anchor_policy_review_recommendations || []
  const byItem = mapBy(batch.anchor_policy_review_items || [], 'anchor_policy_review_item_id', errors, 'batch')
  const decisionsByItem = mapBy(decisions.anchor_policy_review_decisions || [], 'anchor_policy_review_item_id', errors, 'decisions')
  const recommendationByItem = mapBy(rows, 'anchor_policy_review_item_id', errors, 'recommendations')
  const stats = {
    audited_recommendations: 0,
    expected_recommendations: byItem.size,
    extra_recommendations: 0,
    missing_recommendations: 0,
    ...summarize(rows)
  }

  if (!sameJson(recommendations.summary || {}, summarize(rows))) errors.push('recommendations summary does not match rows')
  for (const [id, item] of byItem.entries()) {
    const row = recommendationByItem.get(id)
    if (!row) {
      stats.missing_recommendations += 1
      errors.push(`${id} missing recommendation`)
      continue
    }
    validateRecommendation(row, item, decisionsByItem.get(id), errors, stats)
  }
  for (const id of recommendationByItem.keys()) {
    if (!byItem.has(id)) {
      stats.extra_recommendations += 1
      errors.push(`${id} unexpected recommendation`)
    }
  }
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no recommendations were audited')

  return {
    batch: args.batch,
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

function markdownSummary(payload) {
  return `# H4G Unit Evidence Anchor Policy Review Recommendations Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected recommendations | ${payload.summary.expected_recommendations} |
| audited recommendations | ${payload.summary.audited_recommendations} |
| missing recommendations | ${payload.summary.missing_recommendations} |
| extra recommendations | ${payload.summary.extra_recommendations} |
| manual rebuild recommendations | ${payload.summary.manual_rebuild_recommendations} |
| source anchor specificity review recommendations | ${payload.summary.source_anchor_specificity_review_recommendations} |

## Suggested Reviewer Decisions

| decision | rows |
| --- | ---: |
${countRows(payload.summary.by_suggested_reviewer_decision)}

## Recommended Routes

| route | rows |
| --- | ---: |
${countRows(payload.summary.by_recommended_route)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const payload = audit(args)
  if (args.out) writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({
    errors: payload.errors,
    generated_at: payload.generated_at,
    out: args.out,
    recommendations: args.recommendations,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid,
    writes_public_data: payload.writes_public_data
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
