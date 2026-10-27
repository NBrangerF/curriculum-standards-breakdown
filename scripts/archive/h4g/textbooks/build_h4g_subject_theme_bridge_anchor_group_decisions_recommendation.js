#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_MATRIX = 'generated/textbook_evidence/h4g_theme_bridge_anchor_priority_matrix_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decision_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decision_recommendations_anchor_domain_rejected_english_pe.md'

const ALLOWED_RECOMMENDATIONS = new Set([
  'ready_for_item_level_source_review',
  'needs_source_anchor_evidence',
  'reject_group_anchor_path',
  'split_or_refine_group_scope'
])

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    matrix: DEFAULT_MATRIX,
    out: DEFAULT_OUT,
    requireGroups: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--matrix') args.matrix = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--require-groups') args.requireGroups = true
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_decisions_recommendation.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_template_anchor_domain_rejected_english_pe.json \\
  --matrix generated/textbook_evidence/h4g_theme_bridge_anchor_priority_matrix_anchor_domain_rejected_english_pe.json \\
  --strict --require-groups

Builds recommendation-only routing for pending H4G anchor group decisions. It
does not edit the decisions template, approve bridges, write public/data, change
official standard text, or enable matcher use.`)
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

function compactList(values, limit = 4) {
  const items = [...new Set((values || []).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b))
  if (items.length <= limit) return items.join('; ')
  return `${items.slice(0, limit).join('; ')}; ...(+${items.length - limit})`
}

function validateInputs(decisions, matrix, args, errors) {
  if (decisions.valid !== true) errors.push('group decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_decisions_template') {
    errors.push('group decisions purpose must be h4g_subject_theme_bridge_anchor_group_decisions_template')
  }
  if (decisions.writes_public_data !== false) errors.push('group decisions writes_public_data must be false')
  if (decisions.changes_official_standard_text !== false) errors.push('group decisions changes_official_standard_text must be false')
  if (decisions.direct_matcher_use !== false) errors.push('group decisions direct_matcher_use must be false')
  if (decisions.matcher_ready !== false) errors.push('group decisions matcher_ready must be false')
  if (decisions.publication_ready !== false) errors.push('group decisions publication_ready must be false')
  if (matrix.valid !== true) errors.push('priority matrix valid must be true')
  if (matrix.purpose !== 'h4g_subject_theme_bridge_anchor_priority_matrix') {
    errors.push('priority matrix purpose must be h4g_subject_theme_bridge_anchor_priority_matrix')
  }
  if (matrix.writes_public_data !== false) errors.push('priority matrix writes_public_data must be false')
  if (args.requireGroups && !(decisions.group_review_decisions || []).length) {
    errors.push('requireGroups is set but group decisions has no rows')
  }
  const matrixGroups = new Set((matrix.priority_groups || []).map(group => group.progression_group_id).filter(Boolean))
  const decisionGroups = new Set()
  for (const row of decisions.group_review_decisions || []) {
    if (!row.progression_group_id) errors.push(`${row.decision_id || '(missing decision id)'} missing progression_group_id`)
    if (decisionGroups.has(row.progression_group_id)) errors.push(`${row.progression_group_id} duplicate group decision row`)
    else decisionGroups.add(row.progression_group_id)
    if (row.progression_group_id && !matrixGroups.has(row.progression_group_id)) {
      errors.push(`${row.progression_group_id} not found in priority matrix`)
    }
  }
  for (const groupId of matrixGroups) {
    if (!decisionGroups.has(groupId)) errors.push(`${groupId} missing from group decisions`)
  }
}

function riskSet(row) {
  return new Set((row.risk_flags || []).map(String))
}

function hasAny(set, values) {
  return values.some(value => set.has(value))
}

function recommendationFor(row) {
  const risks = riskSet(row)
  const mixedAnchorTypes = (row.anchor_types || []).length > 1 || (row.action_families || []).length > 1
  const missingGrades = (row.missing_grade_bands || []).length > 0
  const fanoutRisk = hasAny(risks, ['unit_overmatches_many_standards', 'standard_has_many_bridge_candidates']) ||
    Number(row.total_items || 0) >= 4
  const lowEvidence = risks.has('low_bridge_score') || risks.has('single_shared_topic_tag')
  const denyTermRisk = [...risks].some(flag => flag.startsWith('deny_term_in_unit_title:'))

  if (mixedAnchorTypes && fanoutRisk) {
    return {
      confidence: 'high',
      reasons: ['mixed anchor/action families', 'fanout risk'],
      recommended_reviewer_decision: 'split_or_refine_group_scope',
      reviewer_note: 'Recommendation only: split this broad anchor group before item-level source review because multiple anchor/action families and fanout risk are present.'
    }
  }

  if (fanoutRisk && row.review_strategy === 'fanout_first_source_review') {
    return {
      confidence: 'high',
      reasons: ['fanout_first_source_review', 'fanout risk'],
      recommended_reviewer_decision: 'split_or_refine_group_scope',
      reviewer_note: 'Recommendation only: refine group scope first; current unit/standard fanout is too broad for a direct group-level route.'
    }
  }

  if (denyTermRisk || (lowEvidence && row.priority_tier === 'P2')) {
    return {
      confidence: 'medium',
      reasons: denyTermRisk ? ['deny term risk'] : ['low evidence signal'],
      recommended_reviewer_decision: 'needs_source_anchor_evidence',
      reviewer_note: 'Recommendation only: require source anchor evidence before item-level review because current title/topic evidence is weak or broad.'
    }
  }

  if (missingGrades) {
    return {
      confidence: 'medium',
      reasons: ['missing grade bands'],
      recommended_reviewer_decision: 'needs_source_anchor_evidence',
      reviewer_note: 'Recommendation only: complete or explain missing grade slots before this group can move toward item-level source review.'
    }
  }

  if (row.review_strategy === 'confirm_anchor_then_run_publication_gates' && !mixedAnchorTypes && !risks.has('unit_overmatches_many_standards')) {
    return {
      confidence: 'low',
      reasons: ['confirm anchor strategy', 'no mixed anchor type'],
      recommended_reviewer_decision: 'ready_for_item_level_source_review',
      reviewer_note: 'Recommendation only: this group may move to item-level source review after a reviewer confirms source scope and required confirmations.'
    }
  }

  if (!fanoutRisk && !mixedAnchorTypes && !missingGrades) {
    return {
      confidence: 'low',
      reasons: ['bounded-looking group'],
      recommended_reviewer_decision: 'ready_for_item_level_source_review',
      reviewer_note: 'Recommendation only: group appears bounded, but reviewer confirmations are still required before any decision template is changed.'
    }
  }

  return {
    confidence: 'medium',
    reasons: ['source anchor evidence required before routing'],
    recommended_reviewer_decision: 'needs_source_anchor_evidence',
    reviewer_note: 'Recommendation only: collect stronger source anchor evidence before deciding whether to split, reject, or move to item-level source review.'
  }
}

function buildRecommendation(row) {
  const recommendation = recommendationFor(row)
  return {
    action_families: row.action_families || [],
    anchor_types: row.anchor_types || [],
    decision_id: row.decision_id,
    grade_bands: row.grade_bands || [],
    matrix_item_ids: row.matrix_item_ids || [],
    missing_grade_bands: row.missing_grade_bands || [],
    priority_rank: row.priority_rank,
    priority_tier: row.priority_tier,
    progression_group_id: row.progression_group_id,
    recommendation_confidence: recommendation.confidence,
    recommendation_is_official_decision: false,
    recommendation_reasons: recommendation.reasons,
    recommended_reviewer_decision: recommendation.recommended_reviewer_decision,
    remediation_item_ids: row.remediation_item_ids || [],
    review_strategy: row.review_strategy,
    reviewer_note: recommendation.reviewer_note,
    risk_flags: row.risk_flags || [],
    source_reviewer_decision: row.reviewer_decision,
    standard_codes: row.standard_codes || [],
    subject_slug: row.subject_slug,
    total_items: row.total_items || 0,
    unit_evidence_ids: row.unit_evidence_ids || [],
    unit_titles: row.unit_titles || []
  }
}

function summarize(rows) {
  const summary = {
    by_priority_tier: {},
    by_recommendation_confidence: {},
    by_recommended_reviewer_decision: {},
    by_review_strategy: {},
    by_source_reviewer_decision: {},
    by_subject: {},
    group_recommendations: rows.length,
    official_decisions_changed: 0,
    pending_source_group_decisions: 0
  }
  for (const row of rows) {
    if (row.source_reviewer_decision === 'pending') summary.pending_source_group_decisions += 1
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_recommended_reviewer_decision, row.recommended_reviewer_decision)
    countInto(summary.by_review_strategy, row.review_strategy)
    countInto(summary.by_source_reviewer_decision, row.source_reviewer_decision)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 60).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.progression_group_id)} | ${row.total_items} | ${markdownCell(row.review_strategy)} | ${markdownCell(row.recommended_reviewer_decision)} | ${markdownCell(row.recommendation_confidence)} | ${markdownCell(compactList(row.recommendation_reasons, 3))} |`
  )).join('\n') || '| - | - | - | - | 0 | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Decision Recommendations

Generated at: ${payload.generated_at}

These are recommendation-only routes for pending anchor group decisions. They do
not update the decision template and do not approve bridges, write
\`public/data\`, change official standard text, or enable matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| recommendation only | ${payload.recommendation_only} |
| group recommendations | ${payload.summary.group_recommendations} |
| pending source group decisions | ${payload.summary.pending_source_group_decisions} |
| official decisions changed | ${payload.summary.official_decisions_changed} |
| publication ready | ${payload.publication_ready} |
| matcher ready | ${payload.matcher_ready} |

## Recommended Routes

| recommendation | groups |
| --- | ---: |
${countRows(payload.summary.by_recommended_reviewer_decision)}

## Confidence

| confidence | groups |
| --- | ---: |
${countRows(payload.summary.by_recommendation_confidence)}

## Subjects

| subject | groups |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Preview

| rank | tier | subject | group | items | strategy | recommendation | confidence | reasons |
| ---: | --- | --- | --- | ---: | --- | --- | --- | --- |
${previewRows(payload.group_recommendations)}

## Guardrails

- Copying a recommendation into the editable decision template still requires a human/source-reviewer note and required confirmations.
- \`ready_for_item_level_source_review\` is not publication approval; it only routes the group into item-level source review.
- \`split_or_refine_group_scope\` should be handled before any matcher or publication gate.

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

  const errors = []
  for (const [label, path] of [['decisions', args.decisions], ['matrix', args.matrix]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (errors.length) {
    const payload = { errors, valid: false }
    console.log(JSON.stringify(payload, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const decisions = readJson(args.decisions)
  const matrix = readJson(args.matrix)
  validateInputs(decisions, matrix, args, errors)
  const rows = (decisions.group_review_decisions || []).map(buildRecommendation)
  for (const row of rows) {
    if (!ALLOWED_RECOMMENDATIONS.has(row.recommended_reviewer_decision)) {
      errors.push(`${row.progression_group_id} invalid recommendation ${row.recommended_reviewer_decision}`)
    }
    if (row.recommendation_is_official_decision !== false) {
      errors.push(`${row.progression_group_id} recommendation_is_official_decision must be false`)
    }
  }

  const payload = {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    group_recommendations: rows,
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_decision_recommendations',
    recommendation_only: true,
    source_anchor_group_decisions: args.decisions,
    source_priority_matrix: args.matrix,
    summary: summarize(rows),
    valid: errors.length === 0,
    writes_public_data: false
  }

  writeJson(args.out, payload)
  writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(payload, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
