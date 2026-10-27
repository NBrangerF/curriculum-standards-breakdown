#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations_anchor_domain_rejected_english_pe_audit.md'

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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations.js \\
  --recommendations generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits recommendation-only source-anchor review routing against the editable
source-anchor review decisions template.`)
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

function isScopeNotClosed(row) {
  return row.review_lane === 'source_anchor_unit_or_source_scope_review_lane' ||
    row.recommended_disposition === 'scope_not_closed_requires_unit_or_source_row_confirmation'
}

function expectedReviewerDecision(decision) {
  return isScopeNotClosed(decision)
    ? 'source_anchor_scope_not_closed_requires_split'
    : 'pending'
}

function expectedConfidence(decision) {
  return isScopeNotClosed(decision) ? 'high' : 'manual_review_required'
}

function validateTopLevel(recommendations, decisions, args, errors) {
  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations') {
    errors.push('recommendations purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations')
  }
  if (recommendations.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations') {
    errors.push('recommendations data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (recommendations.source_downstream_source_anchor_review_decisions !== args.decisions) {
    errors.push('recommendations source_downstream_source_anchor_review_decisions must match audit arg')
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (recommendations[key] !== false) errors.push(`recommendations ${key} must be false`)
  }
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('decisions editable_manual_review_template must be true')
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (decisions[key] !== false) errors.push(`decisions ${key} must be false`)
  }
}

function auditRecommendation(row, decision, errors, stats) {
  const prefix = row.decision_id || row.source_downstream_source_anchor_review_work_item_id || '(missing source-anchor recommendation)'
  if (row.recommendation_only !== true) errors.push(`${prefix} recommendation_only must be true`)
  if (row.recommendation_is_official_decision !== false) errors.push(`${prefix} recommendation_is_official_decision must be false`)
  if (row.recommendation_requires_manual_confirmation !== true) {
    errors.push(`${prefix} recommendation_requires_manual_confirmation must be true`)
  }
  if (row.exact_anchor_auto_approval !== false) errors.push(`${prefix} exact_anchor_auto_approval must be false`)
  if (!row.recommended_reviewer_decision) errors.push(`${prefix} missing recommended_reviewer_decision`)
  if (!Array.isArray(row.recommendation_reasons) || !row.recommendation_reasons.length) {
    errors.push(`${prefix} recommendation_reasons must be non-empty`)
  }
  if (!row.recommendation_confidence) errors.push(`${prefix} missing recommendation_confidence`)
  if (!decision) {
    errors.push(`${prefix} recommendation decision_id not found in source-anchor review decisions`)
    return
  }
  if (decision.reviewer_decision !== 'pending') {
    errors.push(`${prefix} source-anchor review decision must still have reviewer_decision=pending for recommendation-only routing`)
  }
  if (decision.decision_status !== 'pending') {
    errors.push(`${prefix} source-anchor review decision must still have decision_status=pending for recommendation-only routing`)
  }
  const checks = [
    ['decision_status', row.decision_status, decision.decision_status],
    ['decision_type', row.decision_type, decision.decision_type],
    ['downstream_action_decision_id', row.downstream_action_decision_id, decision.downstream_action_decision_id],
    ['grade_band', row.grade_band, decision.grade_band],
    ['inventory_item_id', row.inventory_item_id, decision.inventory_item_id],
    ['item_review_surface', row.item_review_surface, decision.item_review_surface],
    ['page_evidence_packet_item_id', row.page_evidence_packet_item_id, decision.page_evidence_packet_item_id],
    ['page_evidence_status', row.page_evidence_status, decision.page_evidence_status],
    ['page_hint_source', row.page_hint_source, decision.page_hint_source],
    ['primary_review_bucket', row.primary_review_bucket, decision.primary_review_bucket],
    ['progression_group_id', row.progression_group_id, decision.progression_group_id],
    ['recommended_disposition', row.recommended_disposition, decision.recommended_disposition],
    ['review_grain', row.review_grain, decision.review_grain],
    ['review_lane', row.review_lane, decision.review_lane],
    ['sibling_h4g_grade_count', row.sibling_h4g_grade_count, decision.sibling_h4g_grade_count],
    ['source_anchor_evidence_item_id', row.source_anchor_evidence_item_id, decision.source_anchor_evidence_item_id],
    ['source_batch', row.source_batch, decision.source_batch],
    ['source_batch_item_id', row.source_batch_item_id, decision.source_batch_item_id],
    ['source_downstream_source_anchor_review_work_item_id', row.source_downstream_source_anchor_review_work_item_id, decision.source_downstream_source_anchor_review_work_item_id],
    ['source_key', row.source_key, decision.source_key],
    ['standard_code', row.standard_code, decision.standard_code],
    ['subject_slug', row.subject_slug, decision.subject_slug],
    ['target_standard_code', row.target_standard_code, decision.target_standard_code],
    ['textbook_evidence_id', row.textbook_evidence_id, decision.textbook_evidence_id],
    ['unit_evidence_id', row.unit_evidence_id, decision.unit_evidence_id],
    ['unit_title', row.unit_title, decision.unit_title]
  ]
  for (const [field, actual, expected] of checks) {
    if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} ${field} must match source-anchor review decisions template`)
  }
  if (!Array.isArray(row.allowed_decisions) || !row.allowed_decisions.includes(row.recommended_reviewer_decision)) {
    errors.push(`${prefix} recommended_reviewer_decision must be allowed by the source-anchor review decision`)
  }
  const expectedDecision = expectedReviewerDecision(decision)
  if (row.recommended_reviewer_decision !== expectedDecision) {
    errors.push(`${prefix} recommended_reviewer_decision must follow conservative policy: ${expectedDecision}`)
  }
  const expectedConf = expectedConfidence(decision)
  if (row.recommendation_confidence !== expectedConf) {
    errors.push(`${prefix} recommendation_confidence must be ${expectedConf}`)
  }
  if (row.recommended_reviewer_decision !== 'pending' && row.recommended_reviewer_decision !== 'source_anchor_scope_not_closed_requires_split') {
    errors.push(`${prefix} recommendation may only be pending or source_anchor_scope_not_closed_requires_split`)
  }
  if (row.recommended_reviewer_decision === 'source_anchor_evidence_found_for_missing_grade') {
    errors.push(`${prefix} source-anchor evidence found cannot be auto-recommended by this layer`)
  }

  if (row.has_full_h4g_triplet_context) stats.full_h4g_triplet_context_rows += 1
  if (row.page_evidence_status === 'text_extracted') stats.text_extracted_rows += 1
  if (row.recommended_reviewer_decision === 'pending') stats.pending_recommendations += 1
  if (row.recommended_reviewer_decision === 'source_anchor_scope_not_closed_requires_split') {
    stats.scope_not_closed_recommendations += 1
  }
  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_page_evidence_status, row.page_evidence_status)
  countInto(stats.by_page_hint_source, row.page_hint_source)
  countInto(stats.by_primary_review_bucket, row.primary_review_bucket)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision)
  countInto(stats.by_recommendation_confidence, row.recommendation_confidence)
  countInto(stats.by_recommended_disposition, row.recommended_disposition)
  countInto(stats.by_review_lane, row.review_lane)
  countInto(stats.by_subject, row.subject_slug)
}

function auditSummary(recommendations, stats, errors) {
  const summary = recommendations.summary || {}
  if (summary.downstream_source_anchor_review_recommendations !== stats.downstream_source_anchor_review_recommendations) {
    errors.push('summary.downstream_source_anchor_review_recommendations mismatch')
  }
  if (summary.pending_recommendations !== stats.pending_recommendations) {
    errors.push('summary.pending_recommendations mismatch')
  }
  if (summary.scope_not_closed_recommendations !== stats.scope_not_closed_recommendations) {
    errors.push('summary.scope_not_closed_recommendations mismatch')
  }
  if (summary.exact_anchor_auto_approval_recommendations !== 0) {
    errors.push('summary.exact_anchor_auto_approval_recommendations must be 0')
  }
  if (summary.text_extracted_rows !== stats.text_extracted_rows) errors.push('summary.text_extracted_rows mismatch')
  if (summary.full_h4g_triplet_context_rows !== stats.full_h4g_triplet_context_rows) {
    errors.push('summary.full_h4g_triplet_context_rows mismatch')
  }
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Review Recommendations Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected source-anchor review decisions | ${payload.summary.expected_source_anchor_review_decisions} |
| source-anchor review recommendations | ${payload.summary.downstream_source_anchor_review_recommendations} |
| missing recommendations | ${payload.summary.missing_recommendations} |
| extra recommendations | ${payload.summary.extra_recommendations} |
| scope-not-closed recommendations | ${payload.summary.scope_not_closed_recommendations} |
| pending exact-anchor recommendations | ${payload.summary.pending_recommendations} |
| exact-anchor auto approvals | ${payload.summary.exact_anchor_auto_approval_recommendations} |

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Review Lanes

| review lane | rows |
| --- | ---: |
${countRows(payload.summary.by_review_lane)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [['recommendations', args.recommendations], ['decisions', args.decisions]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const recommendations = errors.length ? { downstream_source_anchor_review_recommendations: [] } : readJson(args.recommendations)
  const decisions = errors.length ? { downstream_source_anchor_review_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(recommendations, decisions, args, errors)
  const decisionById = mapBy(decisions.downstream_source_anchor_review_decisions || [], 'decision_id', errors, 'decisions')
  const recByDecisionId = mapBy(recommendations.downstream_source_anchor_review_recommendations || [], 'decision_id', errors, 'recommendations')
  const stats = {
    by_grade_band: {},
    by_page_evidence_status: {},
    by_page_hint_source: {},
    by_primary_review_bucket: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_recommended_disposition: {},
    by_review_lane: {},
    by_subject: {},
    downstream_source_anchor_review_recommendations: (recommendations.downstream_source_anchor_review_recommendations || []).length,
    exact_anchor_auto_approval_recommendations: 0,
    expected_source_anchor_review_decisions: (decisions.downstream_source_anchor_review_decisions || []).length,
    extra_recommendations: 0,
    full_h4g_triplet_context_rows: 0,
    missing_recommendations: 0,
    pending_recommendations: 0,
    scope_not_closed_recommendations: 0,
    text_extracted_rows: 0
  }
  for (const row of recommendations.downstream_source_anchor_review_recommendations || []) {
    auditRecommendation(row, decisionById.get(row.decision_id), errors, stats)
  }
  for (const decision of decisions.downstream_source_anchor_review_decisions || []) {
    if (!recByDecisionId.has(decision.decision_id)) {
      stats.missing_recommendations += 1
      errors.push(`${decision.decision_id} missing source-anchor review recommendation`)
    }
  }
  for (const row of recommendations.downstream_source_anchor_review_recommendations || []) {
    if (!decisionById.has(row.decision_id)) stats.extra_recommendations += 1
  }
  if (args.requireItems && !(decisions.downstream_source_anchor_review_decisions || []).length) {
    errors.push('requireItems is set but decisions has no downstream_source_anchor_review_decisions')
  }
  if (args.requireItems && !(recommendations.downstream_source_anchor_review_recommendations || []).length) {
    errors.push('requireItems is set but recommendations has no downstream_source_anchor_review_recommendations')
  }
  auditSummary(recommendations, stats, errors)
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
