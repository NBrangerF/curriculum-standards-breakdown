#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SPLIT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_EVIDENCE_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe_audit.md'

const QUEUE_BY_RECOMMENDATION = {
  accept_bounded_slice_for_item_level_source_review: 'item_level_source_review_ready_queue',
  needs_source_anchor_evidence: 'source_anchor_specificity_queue',
  needs_textbook_unit_indexing: 'missing_grade_textbook_unit_indexing_queue',
  source_anchor_evidence_found_for_missing_grade: 'missing_grade_source_anchor_verification_queue',
  split_slice_further: 'unit_or_source_row_split_queue',
  target_missing_grade_standard_absent: 'target_standard_gap_queue'
}

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    recommendations: DEFAULT_RECOMMENDATIONS,
    requireItems: false,
    sourceEvidenceBatch: DEFAULT_SOURCE_EVIDENCE_BATCH,
    splitBatch: DEFAULT_SPLIT_BATCH,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--recommendations') args.recommendations = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--split-batch') args.splitBatch = argv[++i]
    else if (item === '--source-evidence-batch') args.sourceEvidenceBatch = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_action_worklist.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json \\
  --recommendations generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_recommendations_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --split-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json \\
  --source-evidence-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the H4G anchor-group item-review action worklist against the
recommendation layer, editable decision template, and source batches.`)
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

function validateTopLevel(worklist, recommendations, decisions, splitBatch, sourceEvidenceBatch, args, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_action_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_anchor_group_item_review_action_worklist')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  if (worklist.source_anchor_group_item_review_recommendations !== args.recommendations) {
    errors.push('worklist source_anchor_group_item_review_recommendations must match --recommendations')
  }
  if (worklist.source_anchor_group_item_review_decisions !== args.decisions) {
    errors.push('worklist source_anchor_group_item_review_decisions must match --decisions')
  }
  if (worklist.source_anchor_group_split_review_batch !== args.splitBatch) {
    errors.push('worklist source_anchor_group_split_review_batch must match --split-batch')
  }
  if (worklist.source_anchor_group_source_evidence_batch !== args.sourceEvidenceBatch) {
    errors.push('worklist source_anchor_group_source_evidence_batch must match --source-evidence-batch')
  }
  if (worklist.writes_public_data !== false) errors.push('worklist writes_public_data must be false')
  if (worklist.changes_official_standard_text !== false) errors.push('worklist changes_official_standard_text must be false')
  if (worklist.direct_matcher_use !== false) errors.push('worklist direct_matcher_use must be false')
  if (worklist.matcher_ready !== false) errors.push('worklist matcher_ready must be false')
  if (worklist.publication_ready !== false) errors.push('worklist publication_ready must be false')

  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_recommendations') {
    errors.push('recommendations purpose must be h4g_subject_theme_bridge_anchor_group_item_review_recommendations')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_decisions_template')
  }
  if (splitBatch.valid !== true) errors.push('split batch valid must be true')
  if (splitBatch.purpose !== 'h4g_subject_theme_bridge_anchor_group_split_review_batch') {
    errors.push('split batch purpose must be h4g_subject_theme_bridge_anchor_group_split_review_batch')
  }
  if (sourceEvidenceBatch.valid !== true) errors.push('source evidence batch valid must be true')
  if (sourceEvidenceBatch.purpose !== 'h4g_subject_theme_bridge_anchor_group_source_evidence_batch') {
    errors.push('source evidence batch purpose must be h4g_subject_theme_bridge_anchor_group_source_evidence_batch')
  }
}

function sourceRowsFor(decision, row, splitById, sourceEvidenceById, errors) {
  if (decision?.source_batch_item_type === 'split_review_item' || row.decision_type === 'anchor_group_split_item_review_decision') {
    const sourceItem = splitById.get(row.source_batch_item_id)
    if (!sourceItem) errors.push(`${row.decision_id} source split batch item not found`)
    return sourceItem?.source_anchor_review_items || []
  }
  if (decision?.source_batch_item_type === 'source_evidence_request_item' || row.decision_type === 'anchor_group_source_evidence_item_review_decision') {
    const sourceItem = sourceEvidenceById.get(row.source_batch_item_id)
    if (!sourceItem) errors.push(`${row.decision_id} source evidence batch item not found`)
    return sourceItem?.source_anchor_review_items || []
  }
  errors.push(`${row.decision_id} unknown source batch item type`)
  return []
}

function auditWorkItem(row, recommendation, decision, sourceRows, errors, stats) {
  const prefix = row.decision_id || row.action_work_item_id || '(missing work item)'
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
    ['decision_type', row.decision_type, recommendation.decision_type],
    ['item_review_surface', row.item_review_surface, recommendation.item_review_surface],
    ['subject_slug', row.subject_slug, recommendation.subject_slug],
    ['progression_group_id', row.progression_group_id, recommendation.progression_group_id],
    ['source_batch_item_id', row.source_batch_item_id, recommendation.source_batch_item_id],
    ['standard_code', row.standard_code, recommendation.standard_code],
    ['grade_band', row.grade_band, recommendation.grade_band],
    ['priority_rank', row.priority_rank, recommendation.priority_rank],
    ['priority_tier', row.priority_tier, recommendation.priority_tier],
    ['source_anchor_review_rows', row.source_anchor_review_rows, recommendation.source_anchor_review_rows]
  ]
  for (const [field, actual, expected] of checks) {
    if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} ${field} must match recommendation`)
  }
  if (!(decision.allowed_decisions || []).includes(row.recommended_reviewer_decision)) {
    errors.push(`${prefix} recommended_reviewer_decision must be allowed by decisions template`)
  }
  const expectedQueue = QUEUE_BY_RECOMMENDATION[row.recommended_reviewer_decision]
  if (row.work_queue !== expectedQueue) errors.push(`${prefix} work_queue must be ${expectedQueue}`)
  if (!row.required_output) errors.push(`${prefix} missing required_output`)
  if (!row.reviewer_gate) errors.push(`${prefix} missing reviewer_gate`)
  if (!Array.isArray(row.source_anchor_review_items)) errors.push(`${prefix} source_anchor_review_items must be an array`)
  if ((row.source_anchor_review_items || []).length !== sourceRows.length) {
    errors.push(`${prefix} source_anchor_review_items length must match source batch rows`)
  }
  if (Number(row.source_anchor_review_rows || 0) !== sourceRows.length) {
    errors.push(`${prefix} source_anchor_review_rows must match source batch rows`)
  }
  if (row.recommended_reviewer_decision === 'split_slice_further' && !(row.suggested_child_slices || []).length) {
    errors.push(`${prefix} split_slice_further rows must include suggested_child_slices`)
  }

  stats.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
  stats.suggested_child_slices += (row.suggested_child_slices || []).length
  stats.target_missing_grade_standards += (row.target_missing_grade_standards || []).length
  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_priority_tier, row.priority_tier)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision)
  countInto(stats.by_recommendation_confidence, row.recommendation_confidence)
  countInto(stats.by_subject, row.subject_slug)
  countInto(stats.by_work_queue, row.work_queue)
}

function auditSummary(worklist, stats, errors) {
  const summary = worklist.summary || {}
  for (const key of [
    'item_review_action_work_items',
    'source_anchor_review_rows',
    'suggested_child_slices',
    'target_missing_grade_standards'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`summary.${key} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Item Review Action Worklist Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected recommendations | ${payload.summary.expected_recommendations} |
| item review action work items | ${payload.summary.item_review_action_work_items} |
| missing work items | ${payload.summary.missing_work_items} |
| extra work items | ${payload.summary.extra_work_items} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| suggested child slices | ${payload.summary.suggested_child_slices} |

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
    ['decisions', args.decisions],
    ['split batch', args.splitBatch],
    ['source evidence batch', args.sourceEvidenceBatch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const worklist = errors.length ? { item_review_action_work_items: [] } : readJson(args.worklist)
  const recommendations = errors.length ? { item_review_recommendations: [] } : readJson(args.recommendations)
  const decisions = errors.length ? { item_review_decisions: [] } : readJson(args.decisions)
  const splitBatch = errors.length ? { split_review_items: [] } : readJson(args.splitBatch)
  const sourceEvidenceBatch = errors.length ? { source_evidence_request_items: [] } : readJson(args.sourceEvidenceBatch)
  if (!errors.length) validateTopLevel(worklist, recommendations, decisions, splitBatch, sourceEvidenceBatch, args, errors)

  const recByDecisionId = mapBy(recommendations.item_review_recommendations || [], 'decision_id', errors, 'recommendations')
  const decisionById = mapBy(decisions.item_review_decisions || [], 'decision_id', errors, 'decisions')
  const workItemByDecisionId = mapBy(worklist.item_review_action_work_items || [], 'decision_id', errors, 'worklist')
  const splitById = mapBy(splitBatch.split_review_items || [], 'split_review_item_id', errors, 'split batch')
  const sourceEvidenceById = mapBy(sourceEvidenceBatch.source_evidence_request_items || [], 'source_evidence_request_item_id', errors, 'source evidence batch')
  const stats = {
    by_grade_band: {},
    by_priority_tier: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_subject: {},
    by_work_queue: {},
    expected_recommendations: (recommendations.item_review_recommendations || []).length,
    extra_work_items: 0,
    item_review_action_work_items: (worklist.item_review_action_work_items || []).length,
    missing_work_items: 0,
    source_anchor_review_rows: 0,
    suggested_child_slices: 0,
    target_missing_grade_standards: 0
  }

  for (const row of worklist.item_review_action_work_items || []) {
    const decision = decisionById.get(row.decision_id)
    const sourceRows = sourceRowsFor(decision, row, splitById, sourceEvidenceById, errors)
    auditWorkItem(row, recByDecisionId.get(row.decision_id), decision, sourceRows, errors, stats)
  }
  for (const recommendation of recommendations.item_review_recommendations || []) {
    if (!workItemByDecisionId.has(recommendation.decision_id)) {
      stats.missing_work_items += 1
      errors.push(`${recommendation.decision_id} missing action work item`)
    }
  }
  for (const row of worklist.item_review_action_work_items || []) {
    if (!recByDecisionId.has(row.decision_id)) stats.extra_work_items += 1
  }
  if (args.requireItems && !(recommendations.item_review_recommendations || []).length) {
    errors.push('requireItems is set but recommendations has no item_review_recommendations')
  }
  if (args.requireItems && !(worklist.item_review_action_work_items || []).length) {
    errors.push('requireItems is set but worklist has no item_review_action_work_items')
  }
  auditSummary(worklist, stats, errors)

  return {
    decisions: args.decisions,
    errors,
    generated_at: new Date().toISOString(),
    recommendations: args.recommendations,
    require_items: args.requireItems,
    source_evidence_batch: args.sourceEvidenceBatch,
    split_batch: args.splitBatch,
    summary: stats,
    valid: errors.length === 0,
    worklist: args.worklist
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
