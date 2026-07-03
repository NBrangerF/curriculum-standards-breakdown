#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_SPLIT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_EVIDENCE_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.md'

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    requireItems: false,
    sourceEvidenceBatch: DEFAULT_SOURCE_EVIDENCE_BATCH,
    splitBatch: DEFAULT_SPLIT_BATCH,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--split-batch') args.splitBatch = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_decisions_template.js \\
  --split-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json \\
  --source-evidence-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds an editable item-level review decision template from the split review
batch and source-anchor evidence batch. Every row starts pending. The template
records reviewer outcomes only; it does not approve bridges, write public/data,
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

function truncate(value, max = 84) {
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

function basePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    item_review_decision_is_not_approval: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    source_decision_must_be_edited_separately: true,
    writes_public_data: false
  }
}

function validateBatchTopLevel(splitBatch, sourceEvidenceBatch, args, errors) {
  if (splitBatch.valid !== true) errors.push('split batch valid must be true')
  if (splitBatch.purpose !== 'h4g_subject_theme_bridge_anchor_group_split_review_batch') {
    errors.push('split batch purpose must be h4g_subject_theme_bridge_anchor_group_split_review_batch')
  }
  if (splitBatch.writes_public_data !== false) errors.push('split batch writes_public_data must be false')
  if (splitBatch.changes_official_standard_text !== false) errors.push('split batch changes_official_standard_text must be false')
  if (splitBatch.direct_matcher_use !== false) errors.push('split batch direct_matcher_use must be false')
  if (splitBatch.matcher_ready !== false) errors.push('split batch matcher_ready must be false')
  if (splitBatch.publication_ready !== false) errors.push('split batch publication_ready must be false')

  if (sourceEvidenceBatch.valid !== true) errors.push('source evidence batch valid must be true')
  if (sourceEvidenceBatch.purpose !== 'h4g_subject_theme_bridge_anchor_group_source_evidence_batch') {
    errors.push('source evidence batch purpose must be h4g_subject_theme_bridge_anchor_group_source_evidence_batch')
  }
  if (sourceEvidenceBatch.writes_public_data !== false) errors.push('source evidence batch writes_public_data must be false')
  if (sourceEvidenceBatch.changes_official_standard_text !== false) errors.push('source evidence batch changes_official_standard_text must be false')
  if (sourceEvidenceBatch.direct_matcher_use !== false) errors.push('source evidence batch direct_matcher_use must be false')
  if (sourceEvidenceBatch.matcher_ready !== false) errors.push('source evidence batch matcher_ready must be false')
  if (sourceEvidenceBatch.publication_ready !== false) errors.push('source evidence batch publication_ready must be false')

  if (args.requireItems && !(splitBatch.split_review_items || []).length && !(sourceEvidenceBatch.source_evidence_request_items || []).length) {
    errors.push('requireItems is set but no source review items are available')
  }
}

function allowedDecisions(template) {
  return ['pending', ...(template?.allowed_review_outcomes || [])]
}

function commonDecisionFields(sourceItem, sourceReviewItemId, decisionType) {
  return {
    decision_id: `h4g_anchor_group_item_review_decision_${hashText(`${decisionType}|${sourceReviewItemId}`)}`,
    decision_note: '',
    decision_status: 'pending_review',
    decision_type: decisionType,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    priority_rank: sourceItem.priority_rank,
    priority_tier: sourceItem.priority_tier || '',
    progression_group_id: sourceItem.progression_group_id || '',
    publication_policy: basePolicy(),
    publication_ready: false,
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    review_grain: sourceItem.review_grain || '',
    reviewed_at: '',
    reviewed_by: '',
    reviewer_decision: 'pending',
    source_anchor_review_item_ids: sorted((sourceItem.source_anchor_review_items || []).map(row => row.anchor_review_item_id)),
    source_anchor_review_rows: (sourceItem.source_anchor_review_items || []).length,
    subject_slug: sourceItem.subject_slug || '',
    writes_public_data: false
  }
}

function splitDecision(sourceItem) {
  return {
    ...commonDecisionFields(sourceItem, sourceItem.split_review_item_id, 'anchor_group_split_item_review_decision'),
    action_family: sourceItem.action_family || '',
    allowed_decisions: allowedDecisions(sourceItem.review_decision_template),
    anchor_type: sourceItem.anchor_type || '',
    grade_band: sourceItem.grade_band || '',
    item_review_surface: 'anchor_group_split_review',
    required_confirmations: sourceItem.review_decision_template?.required_confirmations || {},
    review_decision_template: sourceItem.review_decision_template || {},
    review_focus: sourceItem.review_focus || '',
    source_batch_item_id: sourceItem.split_review_item_id || '',
    source_batch_item_type: 'split_review_item',
    source_standard_code: sourceItem.standard_code || '',
    source_triage_decision_id: sourceItem.source_triage_decision_id || '',
    split_candidate_id: sourceItem.split_candidate_id || '',
    standard_code: sourceItem.standard_code || '',
    standard_context: sourceItem.standard_context || {},
    target_missing_grade_standards: []
  }
}

function sourceEvidenceDecision(sourceItem) {
  return {
    ...commonDecisionFields(sourceItem, sourceItem.source_evidence_request_item_id, 'anchor_group_source_evidence_item_review_decision'),
    allowed_decisions: allowedDecisions(sourceItem.review_decision_template),
    anchor_type: sourceItem.anchor_type || '',
    existing_grade_bands: sourceItem.existing_grade_bands || [],
    existing_grade_standards: sourceItem.existing_grade_standards || [],
    item_review_surface: 'anchor_group_source_evidence_review',
    missing_grade_bands: sourceItem.missing_grade_bands || [],
    missing_target_standard_grade_bands: sourceItem.missing_target_standard_grade_bands || [],
    required_confirmations: sourceItem.review_decision_template?.required_confirmations || {},
    review_decision_template: sourceItem.review_decision_template || {},
    source_anchor_evidence_request_id: sourceItem.source_anchor_evidence_request_id || '',
    source_batch_item_id: sourceItem.source_evidence_request_item_id || '',
    source_batch_item_type: 'source_evidence_request_item',
    source_standard_code: sourceItem.standard_code || '',
    source_standard_context: sourceItem.source_standard_context || {},
    source_triage_decision_id: sourceItem.source_triage_decision_id || '',
    standard_code: sourceItem.standard_code || '',
    target_missing_grade_standards: sourceItem.target_missing_grade_standards || [],
    unit_context_by_grade_band: sourceItem.unit_context_by_grade_band || {}
  }
}

function buildDecisions(splitBatch, sourceEvidenceBatch) {
  const splitRows = (splitBatch.split_review_items || []).map(splitDecision)
  const evidenceRows = (sourceEvidenceBatch.source_evidence_request_items || []).map(sourceEvidenceDecision)
  return [...splitRows, ...evidenceRows]
    .sort((a, b) => Number(a.priority_rank || 0) - Number(b.priority_rank || 0) ||
      a.decision_type.localeCompare(b.decision_type) ||
      a.progression_group_id.localeCompare(b.progression_group_id) ||
      a.standard_code.localeCompare(b.standard_code) ||
      a.source_batch_item_id.localeCompare(b.source_batch_item_id))
}

function summarize(rows) {
  const summary = {
    by_decision_type: {},
    by_grade_band: {},
    by_item_review_surface: {},
    by_missing_grade_band: {},
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_subject: {},
    completed_item_review_decisions: 0,
    item_review_decisions: rows.length,
    pending_item_review_decisions: 0,
    source_anchor_review_rows: 0,
    split_item_review_decisions: 0,
    source_evidence_item_review_decisions: 0,
    target_missing_grade_standards: 0,
    target_standard_gap_decisions: 0
  }
  for (const row of rows) {
    if (row.reviewer_decision === 'pending') summary.pending_item_review_decisions += 1
    else summary.completed_item_review_decisions += 1
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    if (row.decision_type === 'anchor_group_split_item_review_decision') summary.split_item_review_decisions += 1
    if (row.decision_type === 'anchor_group_source_evidence_item_review_decision') summary.source_evidence_item_review_decisions += 1
    summary.target_missing_grade_standards += (row.target_missing_grade_standards || []).length
    if ((row.missing_target_standard_grade_bands || []).length) summary.target_standard_gap_decisions += 1
    countInto(summary.by_decision_type, row.decision_type)
    countInto(summary.by_item_review_surface, row.item_review_surface)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_subject, row.subject_slug)
    if (row.grade_band) countInto(summary.by_grade_band, row.grade_band)
    for (const gradeBand of row.missing_grade_bands || []) countInto(summary.by_missing_grade_band, gradeBand)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => {
    const grade = row.grade_band || (row.missing_grade_bands || []).join(',')
    return `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.item_review_surface)} | ${markdownCell(row.subject_slug)} | ${markdownCell(grade)} | ${markdownCell(row.standard_code)} | ${row.source_anchor_review_rows} | ${markdownCell(row.reviewer_decision)} | ${truncate(row.source_batch_item_id)} |`
  }).join('\n') || '| - | - | - | - | - | - | 0 | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Item Review Decisions Template

Generated at: ${payload.generated_at}

This editable template combines the split review batch and source-anchor evidence
batch into pending item-level review decisions. It provides the place to record
reviewer outcomes for each H4G7/H4G8/H4G9 bounded slice or source-evidence
request. It does not approve bridges, write \`public/data\`, change official
standard text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| item review decisions | ${payload.summary.item_review_decisions} |
| pending item review decisions | ${payload.summary.pending_item_review_decisions} |
| split item review decisions | ${payload.summary.split_item_review_decisions} |
| source evidence item review decisions | ${payload.summary.source_evidence_item_review_decisions} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| target missing-grade standards | ${payload.summary.target_missing_grade_standards} |
| target-standard gap decisions | ${payload.summary.target_standard_gap_decisions} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Decision Types

| decision type | rows |
| --- | ---: |
${countRows(payload.summary.by_decision_type)}

## Subjects

| subject | rows |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Preview

| rank | tier | surface | subject | grade | standard | source rows | decision | source item |
| ---: | --- | --- | --- | --- | --- | ---: | --- | --- |
${previewRows(payload.item_review_decisions)}

## Guardrails

- All rows start as \`pending\`.
- Item review decisions are not bridge approvals.
- Public data, official standard text, matcher readiness and publication readiness remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['split batch', args.splitBatch],
    ['source evidence batch', args.sourceEvidenceBatch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const splitBatch = errors.length ? { split_review_items: [] } : readJson(args.splitBatch)
  const sourceEvidenceBatch = errors.length ? { source_evidence_request_items: [] } : readJson(args.sourceEvidenceBatch)
  if (!errors.length) validateBatchTopLevel(splitBatch, sourceEvidenceBatch, args, errors)
  const rows = buildDecisions(splitBatch, sourceEvidenceBatch)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no item review decisions were generated')
  return {
    changes_official_standard_text: false,
    data_scope: 'h4g_subject_theme_bridge_anchor_group_item_review_decisions_template',
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    item_review_decisions: rows,
    matcher_ready: false,
    policy: basePolicy(),
    publication_candidate: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_decisions_template',
    review_only: true,
    source_anchor_group_source_evidence_batch: args.sourceEvidenceBatch,
    source_anchor_group_split_review_batch: args.splitBatch,
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
