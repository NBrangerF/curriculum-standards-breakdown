#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.md'

const ROUTES = {
  accept_bounded_slice_for_item_level_source_review: {
    action_type: 'prepare_downstream_item_level_source_review',
    queue: 'downstream_item_level_source_review_queue',
    required_output: 'item-level source review packet for a bounded downstream row',
    reviewer_gate: 'Move only to later item-level source review; do not approve bridge or matcher use here.'
  },
  needs_source_anchor_evidence: {
    action_type: 'collect_or_verify_downstream_source_anchor_evidence',
    queue: 'downstream_source_anchor_evidence_queue',
    required_output: 'source-anchor evidence note proving exact anchor or keeping row blocked',
    reviewer_gate: 'Confirm exact anchor evidence, not broad topic overlap, before later source-row confirmation.'
  },
  source_row_confirms_target_anchor_for_later_gate: {
    action_type: 'record_source_row_confirmation_for_later_gate',
    queue: 'downstream_source_row_confirmation_queue',
    required_output: 'source-row confirmation note for a later matcher/publication gate',
    reviewer_gate: 'Confirmation here is only input to a later gate; it is not publication-ready evidence.'
  },
  target_standard_gap_confirmed: {
    action_type: 'resolve_downstream_target_standard_gap',
    queue: 'downstream_target_standard_gap_resolution_queue',
    required_output: 'target-standard gap resolution or redirect to an existing target standard',
    reviewer_gate: 'Resolve inventory/scope gap before any source evidence search or public data change.'
  },
  target_standard_requires_manual_scope_review: {
    action_type: 'manual_scope_review_before_missing_grade_indexing',
    queue: 'downstream_manual_scope_indexing_queue',
    required_output: 'manual target-standard scope review plus same-grade unit indexing plan',
    reviewer_gate: 'Confirm target standard scope and same-grade unit indexing needs before source-anchor review.'
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_worklist.js \\
  --recommendations generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_recommendations_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a worklist-only execution queue from downstream recommendation-only rows.
It does not edit downstream decisions, approve bridges, write public/data,
change official standard text, or enable matcher/publication use.`)
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

function validateTopLevel(recommendations, decisions, args, errors) {
  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_recommendations') {
    errors.push('recommendations purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_recommendations')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (recommendations.source_downstream_decisions !== args.decisions) {
    errors.push('recommendations source_downstream_decisions must match --decisions')
  }
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template')
  }
  for (const [label, payload] of [['recommendations', recommendations], ['decisions', decisions]]) {
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
}

function requiredConfirmations(decision) {
  return Object.entries(decision.required_confirmations || {})
    .filter(([, value]) => value === false)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b))
}

function buildRows(recommendations, decisions, errors) {
  const decisionById = mapBy(decisions.downstream_decisions || [], 'decision_id', errors, 'decisions')
  const rows = []
  for (const recommendation of recommendations.downstream_recommendations || []) {
    const decision = decisionById.get(recommendation.decision_id)
    if (!decision) errors.push(`${recommendation.decision_id} recommendation decision_id not found in downstream decisions`)
    const route = ROUTES[recommendation.recommended_reviewer_decision]
    if (!route) errors.push(`${recommendation.decision_id} unsupported recommended_reviewer_decision: ${recommendation.recommended_reviewer_decision}`)
    if (decision && !(decision.allowed_decisions || []).includes(recommendation.recommended_reviewer_decision)) {
      errors.push(`${recommendation.decision_id} recommendation is not allowed by downstream decisions template`)
    }
    rows.push({
      action_type: route?.action_type || 'manual_downstream_review',
      allowed_decisions: recommendation.allowed_decisions || decision?.allowed_decisions || [],
      decision_id: recommendation.decision_id || '',
      decision_type: recommendation.decision_type || decision?.decision_type || '',
      downstream_action_work_item_id: `h4g_anchor_group_downstream_action_${hashText(`${recommendation.decision_id}|${recommendation.recommended_reviewer_decision}`)}`,
      grade_band: recommendation.grade_band || decision?.grade_band || '',
      item_review_surface: recommendation.item_review_surface || decision?.item_review_surface || '',
      parent_action_work_item_id: decision?.parent_action_work_item_id || '',
      parent_decision_id: decision?.parent_decision_id || '',
      parent_source_batch_item_id: decision?.parent_source_batch_item_id || '',
      priority_rank: recommendation.priority_rank,
      priority_tier: recommendation.priority_tier || '',
      progression_group_id: recommendation.progression_group_id || '',
      recommendation_confidence: recommendation.recommendation_confidence || '',
      recommendation_is_official_decision: false,
      recommendation_only: true,
      recommendation_reasons: recommendation.recommendation_reasons || [],
      recommended_next_gate: recommendation.recommended_next_gate || '',
      recommended_reviewer_decision: recommendation.recommended_reviewer_decision || '',
      required_confirmations_to_close: decision ? requiredConfirmations(decision) : [],
      required_output: route?.required_output || 'manual downstream review output',
      review_focus: decision?.review_focus || '',
      review_grain: decision?.review_grain || '',
      review_questions: decision?.review_decision_template?.review_questions || [],
      reviewer_gate: route?.reviewer_gate || '',
      reviewer_note: recommendation.reviewer_note || '',
      risk_signals: recommendation.risk_signals || [],
      source_anchor_review_item_ids: decision?.source_anchor_review_item_ids || [],
      source_anchor_review_rows: recommendation.source_anchor_review_rows || 0,
      source_batch: recommendation.source_batch || decision?.source_batch || '',
      source_batch_item_id: recommendation.source_batch_item_id || '',
      source_batch_item_type: decision?.source_batch_item_type || '',
      source_context: decision?.source_context || {},
      standard_code: recommendation.standard_code || decision?.standard_code || '',
      subject_slug: recommendation.subject_slug || '',
      target_standard_code: recommendation.target_standard_code || decision?.target_standard_code || '',
      work_queue: route?.queue || 'downstream_manual_review_queue',
      worklist_only: true,
      writes_public_data: false
    })
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_decision_type: {},
    by_grade_band: {},
    by_priority_tier: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_source_batch: {},
    by_subject: {},
    by_work_queue: {},
    downstream_action_work_items: rows.length,
    source_anchor_review_rows: 0
  }
  for (const row of rows) {
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    countInto(summary.by_decision_type, row.decision_type)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_work_queue, row.work_queue)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.work_queue)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code || row.target_standard_code)} | ${row.source_anchor_review_rows} | ${markdownCell(row.recommended_reviewer_decision)} | ${truncate((row.risk_signals || []).join('; '))} |`
  )).join('\n') || '| - | - | - | - | - | - | 0 | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Item Review Downstream Action Worklist

Generated at: ${payload.generated_at}

This worklist turns downstream recommendation-only rows into concrete execution
queues. It does not update the editable downstream decisions template, approve
bridges, write \`public/data\`, change official standard text, or enable matcher
or publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| worklist only | ${payload.worklist_only} |
| downstream action work items | ${payload.summary.downstream_action_work_items} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Queues

| queue | rows |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Preview

| rank | tier | queue | subject | grade | standard | source rows | recommendation | risk signals |
| ---: | --- | --- | --- | --- | --- | ---: | --- | --- |
${previewRows(payload.downstream_action_work_items)}

## Guardrails

- Work items are not official decisions.
- Reviewer decisions still belong in the editable downstream decisions template.
- Matcher and publication gates remain separate later steps.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [['recommendations', args.recommendations], ['decisions', args.decisions]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const recommendations = errors.length ? { downstream_recommendations: [] } : readJson(args.recommendations)
  const decisions = errors.length ? { downstream_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(recommendations, decisions, args, errors)
  const rows = buildRows(recommendations, decisions, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no downstream action work items were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_work_items: rows,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_worklist',
    source_downstream_decisions: args.decisions,
    source_downstream_recommendations: args.recommendations,
    summary: summarize(rows),
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
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
