#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_recommendations_anchor_domain_rejected_english_pe.md'

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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_recommendations.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds recommendation-only routing for pending downstream H4G item-review
decisions. It does not modify the editable decisions template, approve bridges,
write public/data, change official standard text, or enable matcher/publication use.`)
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
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template')
  }
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.changes_official_standard_text !== false) errors.push('decisions changes_official_standard_text must be false')
  if (decisions.direct_matcher_use !== false) errors.push('decisions direct_matcher_use must be false')
  if (decisions.matcher_ready !== false) errors.push('decisions matcher_ready must be false')
  if (decisions.publication_ready !== false) errors.push('decisions publication_ready must be false')
  if (args.requireItems && !(decisions.downstream_decisions || []).length) {
    errors.push('requireItems is set but decisions has no downstream_decisions')
  }
}

function riskSignals(row) {
  const bridge = row.source_context?.bridge_context || {}
  const reasons = row.source_context?.recommendation_source?.parent_recommendation_reasons || []
  const signals = [
    ...reasons,
    ...((bridge.shared_topic_tags || []).map(tag => `shared_topic:${tag}`)),
    Number(bridge.bridge_score || 0) > 0 && Number(bridge.bridge_score || 0) < 15 ? 'low_bridge_score' : '',
    bridge.page_ready === false ? 'page_not_ready' : ''
  ].filter(Boolean)
  return [...new Set(signals)]
}

function hasBroadRisk(row) {
  const signals = riskSignals(row)
  return signals.some(signal => signal.startsWith('broad_topic_tag:')) ||
    signals.some(signal => signal.startsWith('deny_term_in_unit_title:')) ||
    signals.includes('low_bridge_score') ||
    signals.includes('single_shared_topic_tag') ||
    signals.includes('unit_overmatches_many_standards') ||
    signals.includes('standard_has_many_bridge_candidates') ||
    signals.includes('page_not_ready')
}

function sourceRowRecommendation(row) {
  return {
    confidence: 'medium',
    gate: 'later_item_level_source_review_confirmation',
    reasons: ['single source row previously routed as item-level source-review ready', ...riskSignals(row).slice(0, 3)],
    recommended_reviewer_decision: 'source_row_confirms_target_anchor_for_later_gate',
    reviewer_note: 'Confirm the source row only as input for a later gate. This is not bridge approval or publication readiness.'
  }
}

function boundedSliceRecommendation(row) {
  const signals = riskSignals(row)
  if (hasBroadRisk(row)) {
    return {
      confidence: signals.includes('low_bridge_score') || signals.some(signal => signal.startsWith('deny_term_in_unit_title:')) ? 'high' : 'medium',
      gate: 'source_anchor_specificity_review',
      reasons: ['single-source slice still carries broad topic or fan-out risk', ...signals.slice(0, 5)],
      recommended_reviewer_decision: 'needs_source_anchor_evidence',
      reviewer_note: 'Keep this row out of later source-row confirmation until the exact source anchor is proven, not only the topic.'
    }
  }
  return {
    confidence: 'medium',
    gate: 'item_level_source_review_ready',
    reasons: ['single source row', 'same standard+grade+anchor grain', 'no broad/fan-out risk signals in this downstream decision'],
    recommended_reviewer_decision: 'accept_bounded_slice_for_item_level_source_review',
    reviewer_note: 'This row is narrow enough for later item-level source review. This recommendation is not approval.'
  }
}

function missingGradeIndexingRecommendation(row) {
  return {
    confidence: 'medium',
    gate: 'manual_missing_grade_unit_indexing',
    reasons: [
      'target missing-grade standard exists',
      'same-grade textbook unit evidence still needs indexing before source-anchor review',
      row.target_standard_code ? `target_standard:${row.target_standard_code}` : ''
    ].filter(Boolean),
    recommended_reviewer_decision: 'target_standard_requires_manual_scope_review',
    reviewer_note: 'Confirm the target standard scope and index same-grade unit candidates before any source-anchor or matcher gate.'
  }
}

function targetStandardGapRecommendation(row) {
  return {
    confidence: 'high',
    gate: 'target_standard_gap_resolution',
    reasons: [
      'missing grade band has no target public standard in the same progression group',
      row.grade_band ? `missing_grade_band:${row.grade_band}` : '',
      row.source_standard_code ? `source_standard:${row.source_standard_code}` : ''
    ].filter(Boolean),
    recommended_reviewer_decision: 'target_standard_gap_confirmed',
    reviewer_note: 'Confirm the gap or redirect to a found target standard. Do not edit public standards from this recommendation.'
  }
}

function recommendationFor(row) {
  if (row.decision_type === 'anchor_group_item_level_source_review_ready_decision') return sourceRowRecommendation(row)
  if (row.decision_type === 'anchor_group_child_split_item_review_decision') return boundedSliceRecommendation(row)
  if (row.decision_type === 'anchor_group_source_anchor_specificity_review_decision') return boundedSliceRecommendation(row)
  if (row.decision_type === 'anchor_group_missing_grade_unit_indexing_decision') return missingGradeIndexingRecommendation(row)
  if (row.decision_type === 'anchor_group_target_standard_gap_decision') return targetStandardGapRecommendation(row)
  return {
    confidence: 'low',
    gate: 'manual_downstream_review',
    reasons: ['unknown downstream decision type'],
    recommended_reviewer_decision: 'pending',
    reviewer_note: 'Manual review required because the decision type is not recognized.'
  }
}

function buildRows(decisions, errors) {
  const rows = []
  for (const row of decisions.downstream_decisions || []) {
    const recommendation = recommendationFor(row)
    if (!(row.allowed_decisions || []).includes(recommendation.recommended_reviewer_decision)) {
      errors.push(`${row.decision_id} recommendation ${recommendation.recommended_reviewer_decision} is not allowed for this downstream decision`)
    }
    rows.push({
      allowed_decisions: row.allowed_decisions || [],
      decision_id: row.decision_id || '',
      decision_type: row.decision_type || '',
      grade_band: row.grade_band || '',
      item_review_surface: row.item_review_surface || '',
      priority_rank: row.priority_rank,
      priority_tier: row.priority_tier || '',
      progression_group_id: row.progression_group_id || '',
      recommendation_confidence: recommendation.confidence,
      recommendation_is_official_decision: false,
      recommendation_only: true,
      recommendation_reasons: recommendation.reasons,
      recommended_next_gate: recommendation.gate,
      recommended_reviewer_decision: recommendation.recommended_reviewer_decision,
      reviewer_note: recommendation.reviewer_note,
      risk_signals: riskSignals(row),
      source_anchor_review_rows: row.source_anchor_review_rows || 0,
      source_batch: row.source_batch || '',
      source_batch_item_id: row.source_batch_item_id || '',
      standard_code: row.standard_code || '',
      subject_slug: row.subject_slug || '',
      target_standard_code: row.target_standard_code || ''
    })
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_decision_type: {},
    by_grade_band: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_source_batch: {},
    by_subject: {},
    downstream_recommendations: rows.length,
    source_anchor_review_rows: 0
  }
  for (const row of rows) {
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    countInto(summary.by_decision_type, row.decision_type)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.source_batch)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code || row.target_standard_code)} | ${markdownCell(row.recommended_reviewer_decision)} | ${markdownCell(row.recommendation_confidence)} | ${truncate((row.recommendation_reasons || []).join('；'))} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Item Review Downstream Recommendations

Generated at: ${payload.generated_at}

These are recommendation-only routes for pending downstream item-review
decisions. They do not update the editable downstream decisions template,
approve bridges, write \`public/data\`, change official standard text, or
enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| recommendation only | ${payload.recommendation_only} |
| downstream recommendations | ${payload.summary.downstream_recommendations} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Source Batches

| source batch | rows |
| --- | ---: |
${countRows(payload.summary.by_source_batch)}

## Preview

| rank | tier | source batch | subject | grade | standard | recommendation | confidence | reasons |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.downstream_recommendations)}

## Guardrails

- Recommendations are not official decisions.
- Copying a recommendation into the editable downstream decision template still requires reviewer notes and confirmations.
- Matcher and publication gates remain separate later steps.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.decisions)) errors.push(`Missing decisions: ${args.decisions}`)
  const decisions = errors.length ? { downstream_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(decisions, args, errors)
  const rows = buildRows(decisions, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no downstream recommendations were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_recommendations: rows,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_recommendations',
    recommendation_only: true,
    source_downstream_decisions: args.decisions,
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
