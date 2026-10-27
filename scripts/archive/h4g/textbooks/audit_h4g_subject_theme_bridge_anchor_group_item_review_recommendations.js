#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_recommendations_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_recommendations_anchor_domain_rejected_english_pe_audit.md'

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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_recommendations.js \\
  --recommendations generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_recommendations_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits recommendation-only item-review routing against the editable item review
decisions template.`)
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

function validateTopLevel(recommendations, decisions, args, errors) {
  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_recommendations') {
    errors.push('recommendations purpose must be h4g_subject_theme_bridge_anchor_group_item_review_recommendations')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (recommendations.source_anchor_group_item_review_decisions !== args.decisions) {
    errors.push('recommendations source_anchor_group_item_review_decisions must match audit arg')
  }
  if (recommendations.writes_public_data !== false) errors.push('recommendations writes_public_data must be false')
  if (recommendations.changes_official_standard_text !== false) errors.push('recommendations changes_official_standard_text must be false')
  if (recommendations.direct_matcher_use !== false) errors.push('recommendations direct_matcher_use must be false')
  if (recommendations.matcher_ready !== false) errors.push('recommendations matcher_ready must be false')
  if (recommendations.publication_ready !== false) errors.push('recommendations publication_ready must be false')
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_decisions_template')
  }
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.direct_matcher_use !== false) errors.push('decisions direct_matcher_use must be false')
  if (decisions.matcher_ready !== false) errors.push('decisions matcher_ready must be false')
  if (decisions.publication_ready !== false) errors.push('decisions publication_ready must be false')
}

function auditRecommendation(row, decision, errors, stats) {
  const prefix = row.decision_id || row.source_batch_item_id || '(missing recommendation)'
  if (row.recommendation_only !== true) errors.push(`${prefix} recommendation_only must be true`)
  if (row.recommendation_is_official_decision !== false) errors.push(`${prefix} recommendation_is_official_decision must be false`)
  if (!row.recommended_reviewer_decision) errors.push(`${prefix} missing recommended_reviewer_decision`)
  if (!Array.isArray(row.recommendation_reasons) || !row.recommendation_reasons.length) {
    errors.push(`${prefix} recommendation_reasons must be non-empty`)
  }
  if (!row.recommendation_confidence) errors.push(`${prefix} missing recommendation_confidence`)
  if (!decision) {
    errors.push(`${prefix} recommendation decision_id not found in decisions`)
    return
  }
  const checks = [
    ['decision_type', row.decision_type, decision.decision_type],
    ['item_review_surface', row.item_review_surface, decision.item_review_surface],
    ['subject_slug', row.subject_slug, decision.subject_slug],
    ['progression_group_id', row.progression_group_id, decision.progression_group_id],
    ['source_batch_item_id', row.source_batch_item_id, decision.source_batch_item_id],
    ['standard_code', row.standard_code, decision.standard_code],
    ['priority_rank', row.priority_rank, decision.priority_rank],
    ['priority_tier', row.priority_tier, decision.priority_tier],
    ['source_anchor_review_rows', row.source_anchor_review_rows, decision.source_anchor_review_rows]
  ]
  for (const [field, actual, expected] of checks) {
    if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} ${field} must match decisions template`)
  }
  if (!Array.isArray(row.allowed_decisions) || !row.allowed_decisions.includes(row.recommended_reviewer_decision)) {
    errors.push(`${prefix} recommended_reviewer_decision must be allowed by the source decision`)
  }
  stats.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
  countInto(stats.by_decision_type, row.decision_type)
  countInto(stats.by_item_review_surface, row.item_review_surface)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision)
  countInto(stats.by_recommendation_confidence, row.recommendation_confidence)
  countInto(stats.by_subject, row.subject_slug)
}

function auditSummary(recommendations, stats, errors) {
  const summary = recommendations.summary || {}
  if (summary.item_review_recommendations !== stats.item_review_recommendations) errors.push('summary.item_review_recommendations mismatch')
  if (summary.source_anchor_review_rows !== stats.source_anchor_review_rows) errors.push('summary.source_anchor_review_rows mismatch')
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Item Review Recommendations Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected recommendations | ${payload.summary.expected_item_review_decisions} |
| item review recommendations | ${payload.summary.item_review_recommendations} |
| missing recommendations | ${payload.summary.missing_recommendations} |
| extra recommendations | ${payload.summary.extra_recommendations} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [['recommendations', args.recommendations], ['decisions', args.decisions]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const recommendations = errors.length ? { item_review_recommendations: [] } : readJson(args.recommendations)
  const decisions = errors.length ? { item_review_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(recommendations, decisions, args, errors)
  const decisionById = mapBy(decisions.item_review_decisions || [], 'decision_id', errors, 'decisions')
  const recByDecisionId = mapBy(recommendations.item_review_recommendations || [], 'decision_id', errors, 'recommendations')
  const stats = {
    by_decision_type: {},
    by_item_review_surface: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_subject: {},
    expected_item_review_decisions: (decisions.item_review_decisions || []).length,
    extra_recommendations: 0,
    item_review_recommendations: (recommendations.item_review_recommendations || []).length,
    missing_recommendations: 0,
    source_anchor_review_rows: 0
  }
  for (const row of recommendations.item_review_recommendations || []) {
    auditRecommendation(row, decisionById.get(row.decision_id), errors, stats)
  }
  for (const decision of decisions.item_review_decisions || []) {
    if (!recByDecisionId.has(decision.decision_id)) {
      stats.missing_recommendations += 1
      errors.push(`${decision.decision_id} missing recommendation`)
    }
  }
  for (const row of recommendations.item_review_recommendations || []) {
    if (!decisionById.has(row.decision_id)) stats.extra_recommendations += 1
  }
  if (args.requireItems && !(decisions.item_review_decisions || []).length) {
    errors.push('requireItems is set but decisions has no item_review_decisions')
  }
  if (args.requireItems && !(recommendations.item_review_recommendations || []).length) {
    errors.push('requireItems is set but recommendations has no item_review_recommendations')
  }
  auditSummary(recommendations, stats, errors)
  return {
    decisions: args.decisions,
    errors,
    generated_at: new Date().toISOString(),
    recommendations: args.recommendations,
    require_items: args.requireItems,
    summary: stats,
    valid: errors.length === 0
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
