#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_recommendations_anchor_domain_rejected_english_pe.md'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_recommendations.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds recommendation-only reviewer outcomes for pending downstream action
decisions. It does not edit the decisions template, approve bridges, write
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

function uniqueStrings(values) {
  const seen = new Set()
  const out = []
  for (const value of values || []) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
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

function validateTopLevel(decisions, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template')
  }
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
  if (args.requireItems && !(decisions.downstream_action_decisions || []).length) {
    errors.push('requireItems is set but decisions has no downstream_action_decisions')
  }
}

function recommendationConfidence(row) {
  if (row.source_downstream_action_batch === 'target_standard_gap_resolution') return 'high'
  if (row.priority_tier === 'P1') return 'medium'
  return 'low'
}

function reviewerNote(row) {
  if (row.source_downstream_action_batch === 'source_anchor_evidence') {
    return 'Keep this as source-anchor evidence review unless a reviewer can prove the exact anchor for later item-level review.'
  }
  if (row.source_downstream_action_batch === 'manual_scope_indexing') {
    return 'Confirm target standard scope and same-grade unit indexing before any source-anchor review.'
  }
  if (row.source_downstream_action_batch === 'item_level_source_review') {
    return 'Accept only as a bounded slice for later item-level source review; this is not bridge approval.'
  }
  if (row.source_downstream_action_batch === 'source_row_confirmation') {
    return 'Confirm only as later-gate input; this is not matcher or publication approval.'
  }
  if (row.source_downstream_action_batch === 'target_standard_gap_resolution') {
    return 'Confirm the gap or redirect to an existing target standard; do not edit public standards here.'
  }
  return 'Manual downstream action review required.'
}

function recommendationReasons(row) {
  return uniqueStrings([
    `source_action_batch:${row.source_downstream_action_batch || 'missing'}`,
    row.priority_tier ? `priority:${row.priority_tier}` : '',
    row.reviewer_gate || '',
    row.required_output || '',
    row.anchor_type ? `anchor_type:${row.anchor_type}` : '',
    row.source_batch ? `source_batch:${row.source_batch}` : '',
    row.standard_code ? `standard:${row.standard_code}` : '',
    row.source_standard_code ? `source_standard:${row.source_standard_code}` : '',
    row.target_standard_code ? `target_standard:${row.target_standard_code}` : '',
    ...(row.risk_signals || []).slice(0, 5)
  ])
}

function actionRecommendation(row, errors) {
  const recommendation = row.recommended_reviewer_decision || 'pending'
  if (!(row.allowed_decisions || []).includes(recommendation)) {
    errors.push(`${row.decision_id} recommended_reviewer_decision ${recommendation} must be allowed by the action decision`)
  }
  return {
    action_recommendation_decision_id: row.decision_id || '',
    allowed_decisions: row.allowed_decisions || [],
    decision_id: row.decision_id || '',
    decision_type: row.decision_type || '',
    grade_band: row.grade_band || '',
    item_review_surface: row.item_review_surface || '',
    priority_rank: row.priority_rank,
    priority_tier: row.priority_tier || '',
    progression_group_id: row.progression_group_id || '',
    recommendation_confidence: recommendationConfidence(row),
    recommendation_is_official_decision: false,
    recommendation_only: true,
    recommendation_reasons: recommendationReasons(row),
    recommendation_requires_manual_confirmation: true,
    recommended_next_gate: row.recommended_next_gate || '',
    recommended_reviewer_decision: recommendation,
    reviewer_note: reviewerNote(row),
    risk_signals: row.risk_signals || [],
    source_anchor_review_rows: row.source_anchor_review_rows || 0,
    source_batch: row.source_batch || '',
    source_batch_item_id: row.source_batch_item_id || '',
    source_downstream_action_batch: row.source_downstream_action_batch || '',
    source_downstream_action_item_id: row.source_downstream_action_item_id || '',
    source_downstream_action_item_type: row.source_downstream_action_item_type || '',
    source_key: row.source_key || '',
    source_standard_code: row.source_standard_code || '',
    standard_code: row.standard_code || '',
    subject_slug: row.subject_slug || '',
    target_grade_band: row.target_grade_band || '',
    target_standard_code: row.target_standard_code || '',
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || ''
  }
}

function buildRows(decisions, errors) {
  const rows = []
  const seen = new Set()
  for (const row of decisions.downstream_action_decisions || []) {
    const id = row.decision_id || ''
    if (!id) errors.push('downstream action decision row missing decision_id')
    if (seen.has(id)) errors.push(`duplicate downstream action decision_id: ${id}`)
    seen.add(id)
    if (row.reviewer_decision !== 'pending') {
      errors.push(`${id} must still be pending before recommendation-only routing`)
    }
    rows.push(actionRecommendation(row, errors))
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_grade_band: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_source_batch: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    downstream_action_recommendations: rows.length,
    source_anchor_review_rows: 0,
    unique_action_decisions: sorted(rows.map(row => row.decision_id)).length,
    unique_source_action_items: sorted(rows.map(row => row.source_downstream_action_item_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length
  }
  for (const row of rows) {
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_source_downstream_action_batch, row.source_downstream_action_batch)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.source_downstream_action_batch)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code || row.source_standard_code || row.target_standard_code)} | ${markdownCell(row.recommended_reviewer_decision)} | ${markdownCell(row.recommendation_confidence)} | ${truncate((row.recommendation_reasons || []).join('；'))} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Action Recommendations

Generated at: ${payload.generated_at}

These are recommendation-only routes for pending downstream action-review
decisions. They do not update the editable action decisions template, approve
bridges, write \`public/data\`, change official standard text, or enable
matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| recommendation only | ${payload.recommendation_only} |
| downstream action recommendations | ${payload.summary.downstream_action_recommendations} |
| unique action decisions | ${payload.summary.unique_action_decisions} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Source Action Batches

| source action batch | rows |
| --- | ---: |
${countRows(payload.summary.by_source_downstream_action_batch)}

## Preview

| rank | tier | source action batch | subject | grade | standard | recommendation | confidence | reasons |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.downstream_action_recommendations)}

## Guardrails

- Recommendations are not official decisions.
- Copying a recommendation into the editable action decision template still requires reviewer notes and confirmations.
- Matcher and publication gates remain separate later steps.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.decisions)) errors.push(`Missing decisions: ${args.decisions}`)
  const decisions = errors.length ? { downstream_action_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(decisions, args, errors)
  const rows = buildRows(decisions, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no downstream action recommendations were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_recommendations: rows,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_recommendations',
    recommendation_only: true,
    source_downstream_action_decisions: args.decisions,
    summary: summarize(rows),
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
  const payload = buildPayload(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
