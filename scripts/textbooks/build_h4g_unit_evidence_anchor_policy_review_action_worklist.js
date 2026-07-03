#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_recommendations.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_decisions_template.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_action_worklist.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_action_worklist.md'

const ROUTES = {
  manual_candidate_rebuild_required: {
    action_type: 'rebuild_candidate_unit_evidence_before_anchor_policy_decision',
    queue: 'unit_candidate_rebuild_queue',
    required_output: 'same-grade unit evidence candidates with page_start across at least two editions, or a documented no-match explanation',
    reviewer_gate: 'Do not edit the anchor-policy decision template until rebuilt candidates pass coverage and consistency gates.'
  },
  source_anchor_specificity_review_required: {
    action_type: 'review_source_anchor_specificity_for_noneligible_matches',
    queue: 'unit_source_anchor_specificity_review_queue',
    required_output: 'source-anchor specificity note for each reference match, then keep blocked or edit the decision template manually',
    reviewer_gate: 'Confirm same-grade scope and standard-specific anchor evidence before any selected_candidate_match_ids are added.'
  },
  source_anchor_specificity_review_with_page_gaps: {
    action_type: 'review_source_anchor_specificity_and_page_gaps_for_noneligible_matches',
    queue: 'unit_source_anchor_specificity_page_gap_queue',
    required_output: 'source-anchor specificity note plus page_start repair or discard decision for incomplete reference matches',
    reviewer_gate: 'Repair or discard missing-page references before any later source-anchor decision is recorded.'
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
node scripts/textbooks/build_h4g_unit_evidence_anchor_policy_review_action_worklist.js \\
  --strict --require-items

Builds a read-only execution worklist from H4G unit-evidence anchor-policy
recommendations. It does not edit reviewer decisions, approve candidates, write
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

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function sameJson(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right))
}

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function truncate(value, max = 100) {
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

function policy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    publication_ready: false,
    recommendation_only: true,
    requires_later_candidate_coverage_recheck: true,
    requires_later_consistency_gate: true,
    requires_later_manual_review: true,
    requires_later_publication_gate: true,
    review_batch_only: true,
    worklist_only: true,
    writes_public_data: false
  }
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
  if (recommendations.purpose !== 'h4g_unit_evidence_anchor_policy_review_recommendations') {
    errors.push('recommendations purpose mismatch')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (recommendations.source_anchor_policy_review_decisions !== args.decisions) {
    errors.push('recommendations source decisions must match --decisions')
  }
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_unit_evidence_anchor_policy_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  validatePolicy('recommendations', recommendations, errors)
  validatePolicy('decisions', decisions, errors)
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

function requiredConfirmationsToClose(decision) {
  return Object.entries(decision?.required_confirmations || {})
    .filter(([, value]) => value === false)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b))
}

function uniqueReferenceMatches(recommendation) {
  const allowedIds = sorted(recommendation.reference_candidate_match_ids || [])
  const allowed = new Set(allowedIds)
  const byId = new Map()
  for (const match of recommendation.reference_candidate_matches || []) {
    const id = match.match_id || ''
    if (!id || !allowed.has(id) || byId.has(id)) continue
    byId.set(id, {
      confidence_band: match.confidence_band || '',
      edition: match.edition || '',
      evidence_id: match.evidence_id || '',
      keyword_score: match.keyword_score ?? null,
      match_id: id,
      page_range: match.page_range || '',
      page_start: match.page_start || '',
      unit_title: match.unit_title || ''
    })
  }
  return allowedIds.map(id => byId.get(id)).filter(Boolean)
}

function buildRows(recommendations, decisions, errors) {
  const decisionByItem = mapBy(decisions.anchor_policy_review_decisions || [], 'anchor_policy_review_item_id', errors, 'decisions')
  const rows = []
  for (const recommendation of recommendations.anchor_policy_review_recommendations || []) {
    const decision = decisionByItem.get(recommendation.anchor_policy_review_item_id)
    if (!decision) errors.push(`${recommendation.recommendation_id} decision row not found`)
    const route = ROUTES[recommendation.recommended_route]
    if (!route) errors.push(`${recommendation.recommendation_id} unsupported recommended_route: ${recommendation.recommended_route}`)
    if (decision && !(decision.allowed_decisions || []).includes(recommendation.suggested_reviewer_decision)) {
      errors.push(`${recommendation.recommendation_id} suggested decision is not allowed by decision template`)
    }
    const referenceMatches = uniqueReferenceMatches(recommendation)
    rows.push({
      action_type: route?.action_type || 'manual_anchor_policy_review',
      allowed_reviewer_decisions: recommendation.allowed_reviewer_decisions || decision?.allowed_decisions || [],
      anchor_policy_action_work_item_id: `h4g_unit_anchor_policy_action_${hashText(`${recommendation.recommendation_id}|${recommendation.recommended_route}`)}`,
      anchor_policy_review_item_id: recommendation.anchor_policy_review_item_id || '',
      changes_official_standard_text: false,
      current_decision_status: recommendation.current_decision_status || decision?.decision_status || '',
      current_reviewer_decision: recommendation.current_reviewer_decision || decision?.reviewer_decision || '',
      decision_id: recommendation.decision_id || decision?.decision_id || '',
      direct_matcher_use: false,
      eligible_for_h4g_differentiation: false,
      evidence_summary: recommendation.evidence_summary || {},
      grade_band: recommendation.grade_band || decision?.grade_band || '',
      group_grade_bands: recommendation.group_grade_bands || [],
      group_progression_completeness: recommendation.group_progression_completeness || '',
      group_standard_codes: recommendation.group_standard_codes || [],
      matcher_ready: false,
      parent_action_work_item_id: recommendation.parent_action_work_item_id || decision?.parent_action_work_item_id || '',
      policy: policy(),
      priority_score: recommendation.priority_score || 0,
      progression_group_id: recommendation.progression_group_id || decision?.progression_group_id || '',
      publication_ready: false,
      recommendation_confidence: recommendation.recommendation_confidence || '',
      recommendation_id: recommendation.recommendation_id || '',
      recommendation_is_official_decision: false,
      recommendation_only: true,
      recommended_next_gate: recommendation.recommended_next_gate || '',
      recommended_route: recommendation.recommended_route || '',
      reference_candidate_match_ids: referenceMatches.map(match => match.match_id),
      reference_candidate_matches: referenceMatches,
      required_confirmations_to_close: requiredConfirmationsToClose(decision),
      required_manual_checks: recommendation.required_manual_checks || [],
      required_output: route?.required_output || '',
      reviewer_gate: route?.reviewer_gate || '',
      risk_flags: recommendation.risk_flags || [],
      selected_candidate_match_ids: [],
      standard_code: recommendation.standard_code || decision?.standard_code || '',
      subject_slug: recommendation.subject_slug || decision?.subject_slug || '',
      suggested_reviewer_decision: recommendation.suggested_reviewer_decision || '',
      triage_reason: recommendation.triage_reason || '',
      work_queue: route?.queue || 'unit_anchor_policy_manual_review_queue',
      worklist_only: true,
      writes_public_data: false
    })
  }
  return rows
    .sort((a, b) => {
      const priority = Number(b.priority_score || 0) - Number(a.priority_score || 0)
      if (priority) return priority
      return a.subject_slug.localeCompare(b.subject_slug) ||
        a.progression_group_id.localeCompare(b.progression_group_id) ||
        a.grade_band.localeCompare(b.grade_band) ||
        a.standard_code.localeCompare(b.standard_code)
    })
    .map((row, index) => ({ ...row, priority_rank: index + 1 }))
}

function summarize(rows) {
  const summary = {
    action_work_items: rows.length,
    by_action_type: {},
    by_grade_band: {},
    by_recommended_route: {},
    by_risk_flag: {},
    by_subject: {},
    by_suggested_reviewer_decision: {},
    by_work_queue: {},
    manual_candidate_rebuild_work_items: 0,
    page_gap_work_items: 0,
    reference_candidate_match_ids: 0,
    source_anchor_specificity_work_items: 0
  }
  for (const row of rows) {
    countInto(summary.by_action_type, row.action_type)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_recommended_route, row.recommended_route)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_suggested_reviewer_decision, row.suggested_reviewer_decision)
    countInto(summary.by_work_queue, row.work_queue)
    for (const flag of row.risk_flags || []) countInto(summary.by_risk_flag, flag)
    summary.reference_candidate_match_ids += row.reference_candidate_match_ids?.length || 0
    if (row.work_queue === 'unit_candidate_rebuild_queue') summary.manual_candidate_rebuild_work_items += 1
    if (row.work_queue === 'unit_source_anchor_specificity_review_queue') summary.source_anchor_specificity_work_items += 1
    if (row.work_queue === 'unit_source_anchor_specificity_page_gap_queue') {
      summary.source_anchor_specificity_work_items += 1
      summary.page_gap_work_items += 1
    }
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.work_queue)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.suggested_reviewer_decision)} | ${row.reference_candidate_match_ids.length} | ${truncate(row.triage_reason, 90)} |`
  )).join('\n') || '| - | - | - | - | - | - | 0 | - |'
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Anchor Policy Review Action Worklist

Generated at: ${payload.generated_at}

This worklist converts anchor-policy recommendation-only rows into concrete
execution queues. It does not edit the reviewer decisions template, approve
candidate matches, write \`public/data\`, change official standard text, or
enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| worklist only | ${payload.worklist_only} |
| action work items | ${payload.summary.action_work_items} |
| manual candidate rebuild work items | ${payload.summary.manual_candidate_rebuild_work_items} |
| source anchor specificity work items | ${payload.summary.source_anchor_specificity_work_items} |
| page gap work items | ${payload.summary.page_gap_work_items} |
| reference candidate match IDs | ${payload.summary.reference_candidate_match_ids} |

## Queues

| queue | rows |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Suggested Reviewer Decisions

| decision | rows |
| --- | ---: |
${countRows(payload.summary.by_suggested_reviewer_decision)}

## Risk Flags

| risk flag | rows |
| --- | ---: |
${countRows(payload.summary.by_risk_flag)}

## Preview

| rank | queue | subject | grade | standard | suggested decision | reference matches | reason |
| ---: | --- | --- | --- | --- | --- | ---: | --- |
${previewRows(payload.anchor_policy_action_work_items)}

## Guardrails

- Work items are not official reviewer decisions.
- Reviewer decisions still belong in the editable anchor-policy decisions template.
- Candidate match IDs here are references only and must not be copied blindly into selected_candidate_match_ids.
- Matcher and publication gates remain separate later steps.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['recommendations', args.recommendations],
    ['decisions', args.decisions]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const recommendations = errors.length ? { anchor_policy_review_recommendations: [] } : readJson(args.recommendations)
  const decisions = errors.length ? { anchor_policy_review_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(recommendations, decisions, args, errors)
  const rows = buildRows(recommendations, decisions, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no anchor-policy action work items were generated')
  const summary = summarize(rows)
  return {
    anchor_policy_action_work_items: rows,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: policy(),
    publication_ready: false,
    purpose: 'h4g_unit_evidence_anchor_policy_review_action_worklist',
    recommendation_only: true,
    review_batch_only: true,
    source_anchor_policy_review_decisions: args.decisions,
    source_anchor_policy_review_recommendations: args.recommendations,
    summary,
    valid: errors.length === 0,
    worklist_only: true,
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
  console.log(JSON.stringify({
    errors: payload.errors,
    generated_at: payload.generated_at,
    out: args.out,
    purpose: payload.purpose,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid,
    writes_public_data: payload.writes_public_data
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
