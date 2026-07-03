#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe_audit.md'

const QUEUE_BY_RECOMMENDATION = {
  accept_bounded_slice_for_item_level_source_review: 'downstream_item_level_source_review_queue',
  needs_source_anchor_evidence: 'downstream_source_anchor_evidence_queue',
  source_row_confirms_target_anchor_for_later_gate: 'downstream_source_row_confirmation_queue',
  target_standard_gap_confirmed: 'downstream_target_standard_gap_resolution_queue',
  target_standard_requires_manual_scope_review: 'downstream_manual_scope_indexing_queue'
}

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    recommendations: DEFAULT_RECOMMENDATIONS,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--recommendations') args.recommendations = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_worklist.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json \\
  --recommendations generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_recommendations_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the downstream H4G item-review action worklist against recommendation-only
rows and the editable downstream decisions template.`)
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

function arraysMatch(actual, expected) {
  const a = [...new Set((actual || []).filter(Boolean).map(String))].sort((x, y) => x.localeCompare(y))
  const b = [...new Set((expected || []).filter(Boolean).map(String))].sort((x, y) => x.localeCompare(y))
  return a.join('|') === b.join('|')
}

function validateTopLevel(worklist, recommendations, decisions, args, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_worklist')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  if (worklist.source_downstream_recommendations !== args.recommendations) {
    errors.push('worklist source_downstream_recommendations must match audit arg')
  }
  if (worklist.source_downstream_decisions !== args.decisions) {
    errors.push('worklist source_downstream_decisions must match audit arg')
  }
  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_recommendations') {
    errors.push('recommendations purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_recommendations')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template')
  }
  for (const [label, payload] of [['worklist', worklist], ['recommendations', recommendations], ['decisions', decisions]]) {
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

function auditWorkItem(row, recommendation, decision, errors, stats) {
  const prefix = row.decision_id || row.downstream_action_work_item_id || '(missing downstream work item)'
  if (row.worklist_only !== true) errors.push(`${prefix} worklist_only must be true`)
  if (row.recommendation_only !== true) errors.push(`${prefix} recommendation_only must be true`)
  if (row.recommendation_is_official_decision !== false) errors.push(`${prefix} recommendation_is_official_decision must be false`)
  if (row.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
  if (!recommendation) {
    errors.push(`${prefix} work item decision_id not found in recommendations`)
    return
  }
  if (!decision) {
    errors.push(`${prefix} work item decision_id not found in decisions`)
    return
  }

  const checks = [
    ['recommended_reviewer_decision', row.recommended_reviewer_decision, recommendation.recommended_reviewer_decision],
    ['recommendation_confidence', row.recommendation_confidence, recommendation.recommendation_confidence],
    ['recommended_next_gate', row.recommended_next_gate, recommendation.recommended_next_gate],
    ['decision_type', row.decision_type, recommendation.decision_type],
    ['item_review_surface', row.item_review_surface, recommendation.item_review_surface],
    ['subject_slug', row.subject_slug, recommendation.subject_slug],
    ['progression_group_id', row.progression_group_id, recommendation.progression_group_id],
    ['source_batch', row.source_batch, recommendation.source_batch],
    ['source_batch_item_id', row.source_batch_item_id, recommendation.source_batch_item_id],
    ['standard_code', row.standard_code, recommendation.standard_code],
    ['target_standard_code', row.target_standard_code, recommendation.target_standard_code],
    ['grade_band', row.grade_band, recommendation.grade_band],
    ['priority_rank', row.priority_rank, recommendation.priority_rank],
    ['priority_tier', row.priority_tier, recommendation.priority_tier],
    ['source_anchor_review_rows', row.source_anchor_review_rows, recommendation.source_anchor_review_rows]
  ]
  for (const [field, actual, expected] of checks) {
    if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} ${field} must match recommendation`)
  }
  if (!(decision.allowed_decisions || []).includes(row.recommended_reviewer_decision)) {
    errors.push(`${prefix} recommended_reviewer_decision must be allowed by downstream decisions template`)
  }
  const expectedQueue = QUEUE_BY_RECOMMENDATION[row.recommended_reviewer_decision]
  if (row.work_queue !== expectedQueue) errors.push(`${prefix} work_queue must be ${expectedQueue}`)
  if (!row.required_output) errors.push(`${prefix} missing required_output`)
  if (!row.reviewer_gate) errors.push(`${prefix} missing reviewer_gate`)
  if (!arraysMatch(row.source_anchor_review_item_ids, decision.source_anchor_review_item_ids)) {
    errors.push(`${prefix} source_anchor_review_item_ids must match downstream decision`)
  }
  if (Number(row.source_anchor_review_rows || 0) !== Number(decision.source_anchor_review_rows || 0)) {
    errors.push(`${prefix} source_anchor_review_rows must match downstream decision`)
  }
  if (!Array.isArray(row.required_confirmations_to_close)) errors.push(`${prefix} required_confirmations_to_close must be an array`)

  stats.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
  countInto(stats.by_decision_type, row.decision_type)
  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_priority_tier, row.priority_tier)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision)
  countInto(stats.by_recommendation_confidence, row.recommendation_confidence)
  countInto(stats.by_source_batch, row.source_batch)
  countInto(stats.by_subject, row.subject_slug)
  countInto(stats.by_work_queue, row.work_queue)
}

function auditSummary(worklist, stats, errors) {
  const summary = worklist.summary || {}
  for (const key of ['downstream_action_work_items', 'source_anchor_review_rows']) {
    if (summary[key] !== stats[key]) errors.push(`summary.${key} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Item Review Downstream Action Worklist Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected recommendations | ${payload.summary.expected_downstream_recommendations} |
| downstream action work items | ${payload.summary.downstream_action_work_items} |
| missing work items | ${payload.summary.missing_work_items} |
| extra work items | ${payload.summary.extra_work_items} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |

## Queues

| queue | rows |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['worklist', args.worklist],
    ['recommendations', args.recommendations],
    ['decisions', args.decisions]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const worklist = errors.length ? { downstream_action_work_items: [] } : readJson(args.worklist)
  const recommendations = errors.length ? { downstream_recommendations: [] } : readJson(args.recommendations)
  const decisions = errors.length ? { downstream_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(worklist, recommendations, decisions, args, errors)

  const recByDecisionId = mapBy(recommendations.downstream_recommendations || [], 'decision_id', errors, 'recommendations')
  const decisionById = mapBy(decisions.downstream_decisions || [], 'decision_id', errors, 'decisions')
  const workItemByDecisionId = mapBy(worklist.downstream_action_work_items || [], 'decision_id', errors, 'worklist')
  const stats = {
    by_decision_type: {},
    by_grade_band: {},
    by_priority_tier: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_source_batch: {},
    by_subject: {},
    by_work_queue: {},
    downstream_action_work_items: (worklist.downstream_action_work_items || []).length,
    expected_downstream_recommendations: (recommendations.downstream_recommendations || []).length,
    extra_work_items: 0,
    missing_work_items: 0,
    source_anchor_review_rows: 0
  }

  for (const row of worklist.downstream_action_work_items || []) {
    auditWorkItem(row, recByDecisionId.get(row.decision_id), decisionById.get(row.decision_id), errors, stats)
  }
  for (const recommendation of recommendations.downstream_recommendations || []) {
    if (!workItemByDecisionId.has(recommendation.decision_id)) {
      stats.missing_work_items += 1
      errors.push(`${recommendation.decision_id} missing downstream action work item`)
    }
  }
  for (const row of worklist.downstream_action_work_items || []) {
    if (!recByDecisionId.has(row.decision_id)) stats.extra_work_items += 1
  }
  if (args.requireItems && !(recommendations.downstream_recommendations || []).length) {
    errors.push('requireItems is set but recommendations has no downstream_recommendations')
  }
  if (args.requireItems && !(worklist.downstream_action_work_items || []).length) {
    errors.push('requireItems is set but worklist has no downstream_action_work_items')
  }
  auditSummary(worklist, stats, errors)

  return {
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    recommendations: args.recommendations,
    require_items: args.requireItems,
    summary: stats,
    valid: errors.length === 0,
    worklist: args.worklist,
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
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
