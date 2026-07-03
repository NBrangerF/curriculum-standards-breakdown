#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions_template.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions_template.md'

const REVIEW_OUTCOMES = [
  'pending',
  'source_anchor_specific_for_later_decision_review',
  'source_anchor_overbroad_keep_blocked',
  'source_anchor_requires_page_start_repair',
  'source_anchor_wrong_grade_or_not_relevant'
]

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
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
node scripts/textbooks/build_h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions_template.js \\
  --strict --require-items

Builds an editable decisions template for H4G unit-evidence source-anchor
specificity review rows. Every row starts pending. This template records manual
specificity outcomes only; it does not approve candidates, edit parent
anchor-policy decisions, write public/data, change official standard text, or
enable matcher/publication use.`)
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

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
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

function policy() {
  return {
    changes_official_standard_text: false,
    decision_template_only: true,
    direct_matcher_use: false,
    editable_manual_review_template: true,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    publication_ready: false,
    requires_later_anchor_policy_decision_edit: true,
    requires_later_candidate_coverage_recheck: true,
    requires_later_consistency_gate: true,
    requires_later_manual_review: true,
    requires_later_publication_gate: true,
    review_batch_only: true,
    source_anchor_specificity_batch_only: true,
    writes_public_data: false
  }
}

function validateBatch(batch, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch') {
    errors.push('batch purpose mismatch')
  }
  if (batch.worklist_only !== true) errors.push('batch worklist_only must be true')
  if (batch.review_batch_only !== true) errors.push('batch review_batch_only must be true')
  if (batch.source_anchor_specificity_batch_only !== true) {
    errors.push('batch source_anchor_specificity_batch_only must be true')
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (batch[key] !== false) errors.push(`batch ${key} must be false`)
  }
}

function initialConfirmations(item) {
  const source = item.review_decision_template?.required_confirmations || {}
  return Object.fromEntries(Object.keys(source)
    .sort((a, b) => a.localeCompare(b))
    .map(key => [key, source[key]]))
}

function compactMatch(match) {
  return {
    confidence_band: match.confidence_band || '',
    edition: match.edition || '',
    evidence_id: match.evidence_id || '',
    keyword_score: match.keyword_score ?? null,
    match_id: match.match_id || '',
    page_range: match.page_range || '',
    page_start: match.page_start || '',
    source_file: match.source_file || '',
    unit_title: match.unit_title || ''
  }
}

function decisionId(item) {
  return `h4g_unit_source_anchor_specificity_decision_${hashText(item.source_anchor_specificity_review_item_id)}`
}

function buildDecision(item) {
  return {
    allowed_review_outcomes: REVIEW_OUTCOMES,
    anchor_policy_action_work_item_id: item.anchor_policy_action_work_item_id || '',
    anchor_policy_review_item_id: item.anchor_policy_review_item_id || '',
    candidate_match: compactMatch(item.candidate_match || {}),
    candidate_match_id: item.candidate_match_id || '',
    changes_official_standard_text: false,
    decision_id: decisionId(item),
    decision_note: '',
    decision_status: 'pending_review',
    decision_surface: 'h4g_unit_anchor_policy_source_anchor_specificity_review',
    decision_template_policy: policy(),
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    exact_evidence_note: '',
    grade_band: item.grade_band || '',
    group_grade_bands: item.group_grade_bands || [],
    group_progression_completeness: item.group_progression_completeness || '',
    group_standard_codes: item.group_standard_codes || [],
    matcher_ready: false,
    page_range_status: item.page_range_status || '',
    parent_anchor_policy_decision_id: item.decision_id || '',
    parent_work_queue: item.parent_work_queue || '',
    priority_rank: item.priority_rank || 0,
    priority_score: item.priority_score || 0,
    progression_group_id: item.progression_group_id || '',
    publication_ready: false,
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: initialConfirmations(item),
    review_grain: item.review_grain || '',
    review_questions: item.review_decision_template?.review_questions || [],
    reviewed_at: '',
    reviewed_by: '',
    reviewer_note: '',
    reviewer_outcome: 'pending',
    risk_flags: item.risk_flags || [],
    source_anchor_specificity_review_item_id: item.source_anchor_specificity_review_item_id || '',
    source_file: item.source_file || item.candidate_match?.source_file || '',
    standard_code: item.standard_code || '',
    subject_slug: item.subject_slug || '',
    suggested_reviewer_decision: item.suggested_reviewer_decision || '',
    triage_reason: item.triage_reason || '',
    unit_title_scope_note: '',
    writes_public_data: false
  }
}

function summarize(rows) {
  const summary = {
    by_decision_status: {},
    by_grade_band: {},
    by_page_range_status: {},
    by_parent_work_queue: {},
    by_reviewer_outcome: {},
    by_subject: {},
    completed_decisions: 0,
    pending_decisions: 0,
    source_anchor_specificity_decisions: rows.length,
    unique_candidate_matches: sorted(rows.map(row => row.candidate_match_id)).length,
    unique_parent_anchor_policy_decisions: sorted(rows.map(row => row.parent_anchor_policy_decision_id)).length,
    unique_source_files: sorted(rows.map(row => row.source_file)).length
  }
  for (const row of rows) {
    countInto(summary.by_decision_status, row.decision_status)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_range_status, row.page_range_status)
    countInto(summary.by_parent_work_queue, row.parent_work_queue)
    countInto(summary.by_reviewer_outcome, row.reviewer_outcome)
    countInto(summary.by_subject, row.subject_slug)
    if (row.reviewer_outcome === 'pending') summary.pending_decisions += 1
    else summary.completed_decisions += 1
  }
  return summary
}

function tableRows(rows, limit = 80) {
  return rows.slice(0, limit).map(row => (
    `| ${markdownCell(row.decision_id)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.candidate_match.edition)} | ${truncate(row.candidate_match.unit_title)} | ${markdownCell(row.reviewer_outcome)} |`
  )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Source-Anchor Specificity Decisions Template

Generated at: ${payload.generated_at}

This editable template records manual outcomes for source-anchor specificity
review rows. It does not approve candidates, edit parent anchor-policy
decisions, write \`public/data\`, change official standard text, or enable
matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| decisions | ${payload.summary.source_anchor_specificity_decisions} |
| pending decisions | ${payload.summary.pending_decisions} |
| completed decisions | ${payload.summary.completed_decisions} |
| unique candidate matches | ${payload.summary.unique_candidate_matches} |
| unique source files | ${payload.summary.unique_source_files} |

## Reviewer Outcomes

| outcome | rows |
| --- | ---: |
${countRows(payload.summary.by_reviewer_outcome)}

## First Decisions

| decision | subject | grade | standard | edition | unit title | outcome |
| --- | --- | --- | --- | --- | --- | --- |
${tableRows(payload.source_anchor_specificity_decisions)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.batch)) errors.push(`Missing batch: ${args.batch}`)
  const batch = existsSync(args.batch) ? readJson(args.batch) : { source_anchor_specificity_review_items: [] }
  if (!errors.length) validateBatch(batch, errors)
  const rows = errors.length ? [] : (batch.source_anchor_specificity_review_items || []).map(buildDecision)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no decisions were generated')
  return {
    allowed_review_outcomes: REVIEW_OUTCOMES,
    changes_official_standard_text: false,
    decision_template_only: true,
    direct_matcher_use: false,
    editable_manual_review_template: true,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: policy(),
    publication_ready: false,
    purpose: 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions_template',
    review_batch_only: true,
    source_anchor_policy_source_anchor_specificity_batch: args.batch,
    source_anchor_specificity_batch_only: true,
    source_anchor_specificity_decisions: rows,
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
  if (args.out) writeJson(args.out, payload)
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
