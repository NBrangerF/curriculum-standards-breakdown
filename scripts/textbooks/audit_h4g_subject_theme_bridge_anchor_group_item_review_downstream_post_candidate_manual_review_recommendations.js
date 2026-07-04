#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_recommendations_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_recommendations_anchor_domain_rejected_english_pe_audit.md'

const DECISION_PENDING = 'pending'
const SOURCE_ROW_CONFIRM = 'confirm_source_row_for_later_action_gate'
const ITEM_LEVEL_CONFIRM = 'confirm_item_level_source_scope_for_later_action_gate'
const KNOWN_ACTION_BATCHES = new Set(['source_row_confirmation', 'item_level_source_review', 'source_anchor_evidence'])

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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_recommendations.js \\
  --strict --require-items

Audits recommendation-only post-candidate manual review routing against the
editable post-candidate manual review decisions template.`)
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
  if ((recommendations.errors || []).length) errors.push('recommendations errors must be empty')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_recommendations') {
    errors.push('recommendations purpose mismatch')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (recommendations.source_post_candidate_manual_review_decisions !== args.decisions) {
    errors.push('recommendations source_post_candidate_manual_review_decisions must match audit arg')
  }
  if (!Array.isArray(recommendations.post_candidate_manual_review_recommendations)) {
    errors.push('recommendations post_candidate_manual_review_recommendations must be an array')
  }
  validatePolicy('recommendations', recommendations, errors)

  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (!Array.isArray(decisions.post_candidate_manual_review_decisions)) {
    errors.push('decisions post_candidate_manual_review_decisions must be an array')
  }
  validatePolicy('decisions', decisions, errors)
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

function expectedRecommendation(row) {
  const batch = row.source_downstream_action_batch || ''
  if (batch === 'source_row_confirmation') return SOURCE_ROW_CONFIRM
  if (batch === 'item_level_source_review') return ITEM_LEVEL_CONFIRM
  if (batch === 'source_anchor_evidence') return DECISION_PENDING
  return DECISION_PENDING
}

function expectedRoute(row) {
  const batch = row.source_downstream_action_batch || ''
  if (batch === 'source_row_confirmation') return 'bounded_single_source_row_ready_for_later_action_confirmation'
  if (batch === 'item_level_source_review') return 'bounded_item_level_source_scope_ready_for_later_action_confirmation'
  if (batch === 'source_anchor_evidence') return 'source_anchor_exact_evidence_stays_pending_manual_text_review'
  return 'manual_review_required'
}

function sameStringSet(a, b) {
  const left = (a || []).map(String).sort((x, y) => x.localeCompare(y))
  const right = (b || []).map(String).sort((x, y) => x.localeCompare(y))
  return JSON.stringify(left) === JSON.stringify(right)
}

function auditRecommendation(row, decision, errors, stats) {
  const prefix = row.decision_id || row.manual_review_packet_item_id || '(missing post-candidate recommendation)'
  if (row.recommendation_only !== true) errors.push(`${prefix} recommendation_only must be true`)
  if (row.recommendation_is_official_decision !== false) {
    errors.push(`${prefix} recommendation_is_official_decision must be false`)
  }
  if (row.recommendation_requires_manual_confirmation !== true) {
    errors.push(`${prefix} recommendation_requires_manual_confirmation must be true`)
  }
  if (!decision) {
    errors.push(`${prefix} recommendation decision_id not found in manual review decisions`)
    return
  }
  const checks = [
    ['manual_review_packet_item_id', row.manual_review_packet_item_id, decision.manual_review_packet_item_id],
    ['evidence_lane', row.evidence_lane, decision.evidence_lane],
    ['evidence_packet_item_id', row.evidence_packet_item_id, decision.evidence_packet_item_id],
    ['evidence_packet_source', row.evidence_packet_source, decision.evidence_packet_source],
    ['manual_confirmation_lane', row.manual_confirmation_lane, decision.manual_confirmation_lane],
    ['page_status', row.page_status, decision.page_status],
    ['progression_group_id', row.progression_group_id, decision.progression_group_id],
    ['source_downstream_action_batch', row.source_downstream_action_batch, decision.source_downstream_action_batch],
    ['source_downstream_action_item_id', row.source_downstream_action_item_id, decision.source_downstream_action_item_id],
    ['source_key', row.source_key, decision.source_key],
    ['source_reviewer_decision', row.source_reviewer_decision, decision.source_reviewer_decision],
    ['standard_code', row.standard_code, decision.standard_code],
    ['subject_slug', row.subject_slug, decision.subject_slug],
    ['target_grade_band', row.target_grade_band, decision.target_grade_band],
    ['target_standard_code', row.target_standard_code, decision.target_standard_code],
    ['unit_evidence_id', row.unit_evidence_id, decision.unit_evidence_id],
    ['unit_title', row.unit_title, decision.unit_title],
    ['worklist_rank', row.worklist_rank, decision.worklist_rank]
  ]
  for (const [field, actual, expected] of checks) {
    if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} ${field} must match manual review decisions template`)
  }
  if (!Array.isArray(row.allowed_decisions) || !row.allowed_decisions.includes(row.recommended_reviewer_decision)) {
    errors.push(`${prefix} recommended_reviewer_decision must be allowed by source manual review decision`)
  }
  if (!sameStringSet(row.allowed_decisions, decision.allowed_decisions)) {
    errors.push(`${prefix} allowed_decisions must match manual review decisions template`)
  }
  if (!KNOWN_ACTION_BATCHES.has(decision.source_downstream_action_batch || '')) {
    errors.push(`${prefix} has unexpected source_downstream_action_batch: ${decision.source_downstream_action_batch || 'missing'}`)
  }
  const expected = expectedRecommendation(decision)
  if (row.recommended_reviewer_decision !== expected) {
    errors.push(`${prefix} recommended_reviewer_decision must be ${expected}`)
  }
  const route = expectedRoute(decision)
  if (row.recommendation_route !== route) {
    errors.push(`${prefix} recommendation_route must be ${route}`)
  }
  if (decision.source_downstream_action_batch === 'source_anchor_evidence' && row.recommended_reviewer_decision !== DECISION_PENDING) {
    errors.push(`${prefix} source-anchor exact rows must remain pending until manual text review`)
  }
  if (!Array.isArray(row.recommendation_reasons) || !row.recommendation_reasons.length) {
    errors.push(`${prefix} recommendation_reasons must be non-empty`)
  }
  if (!row.recommendation_confidence) errors.push(`${prefix} missing recommendation_confidence`)
  countInto(stats.by_evidence_lane, row.evidence_lane)
  countInto(stats.by_evidence_packet_source, row.evidence_packet_source)
  countInto(stats.by_grade_band, row.grade_band)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision)
  countInto(stats.by_recommendation_confidence, row.recommendation_confidence)
  countInto(stats.by_recommendation_route, row.recommendation_route)
  countInto(stats.by_source_downstream_action_batch, row.source_downstream_action_batch)
  countInto(stats.by_subject, row.subject_slug)
  if (row.recommended_reviewer_decision === DECISION_PENDING) stats.pending_exact_anchor_review_recommendations += 1
  else stats.confirmation_candidate_recommendations += 1
}

function auditSummary(recommendations, stats, errors) {
  const summary = recommendations.summary || {}
  for (const field of [
    'post_candidate_manual_review_recommendations',
    'confirmation_candidate_recommendations',
    'pending_exact_anchor_review_recommendations',
    'unique_action_decisions',
    'unique_progression_groups',
    'unique_source_keys',
    'unique_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (Number(summary[field] || 0) !== Number(stats[field] || 0)) errors.push(`summary.${field} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Manual Review Recommendations Audit

Generated at: ${payload.generated_at}

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| expected decisions | ${payload.summary.expected_manual_review_decisions} |
| recommendations | ${payload.summary.post_candidate_manual_review_recommendations} |
| missing recommendations | ${payload.summary.missing_recommendations} |
| extra recommendations | ${payload.summary.extra_recommendations} |
| confirmation candidate recommendations | ${payload.summary.confirmation_candidate_recommendations} |
| pending exact-anchor review recommendations | ${payload.summary.pending_exact_anchor_review_recommendations} |

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Recommendation Routes

| route | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation_route)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [['recommendations', args.recommendations], ['decisions', args.decisions]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const recommendations = errors.length ? { post_candidate_manual_review_recommendations: [] } : readJson(args.recommendations)
  const decisions = errors.length ? { post_candidate_manual_review_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(recommendations, decisions, args, errors)

  const decisionRows = decisions.post_candidate_manual_review_decisions || []
  const recommendationRows = recommendations.post_candidate_manual_review_recommendations || []
  const decisionById = mapBy(decisionRows, 'decision_id', errors, 'decisions')
  const recByDecisionId = mapBy(recommendationRows, 'decision_id', errors, 'recommendations')
  const stats = {
    by_evidence_lane: {},
    by_evidence_packet_source: {},
    by_grade_band: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_recommendation_route: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    confirmation_candidate_recommendations: 0,
    expected_manual_review_decisions: decisionRows.length,
    extra_recommendations: 0,
    missing_recommendations: 0,
    pending_exact_anchor_review_recommendations: 0,
    post_candidate_manual_review_recommendations: recommendationRows.length,
    unique_action_decisions: new Set(recommendationRows.map(row => row.decision_id).filter(Boolean)).size,
    unique_progression_groups: new Set(recommendationRows.map(row => row.progression_group_id).filter(Boolean)).size,
    unique_source_keys: new Set(recommendationRows.map(row => row.source_key).filter(Boolean)).size,
    unique_standard_codes: new Set(recommendationRows.map(row => row.standard_code).filter(Boolean)).size,
    unique_unit_evidence_ids: new Set(recommendationRows.map(row => row.unit_evidence_id).filter(Boolean)).size
  }
  for (const row of recommendationRows) {
    auditRecommendation(row, decisionById.get(row.decision_id), errors, stats)
  }
  for (const decision of decisionRows) {
    if (!recByDecisionId.has(decision.decision_id)) {
      stats.missing_recommendations += 1
      errors.push(`${decision.decision_id} missing post-candidate manual review recommendation`)
    }
  }
  for (const row of recommendationRows) {
    if (!decisionById.has(row.decision_id)) stats.extra_recommendations += 1
  }
  if (args.requireItems && !decisionRows.length) errors.push('requireItems is set but decisions has no rows')
  if (args.requireItems && !recommendationRows.length) errors.push('requireItems is set but recommendations has no rows')
  auditSummary(recommendations, stats, errors)

  return {
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
