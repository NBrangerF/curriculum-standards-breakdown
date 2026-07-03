#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions_template.json'
const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions_audit.md'

const REVIEW_OUTCOMES = new Set([
  'pending',
  'source_anchor_specific_for_later_decision_review',
  'source_anchor_overbroad_keep_blocked',
  'source_anchor_requires_page_start_repair',
  'source_anchor_wrong_grade_or_not_relevant'
])
const COMPLETED_OUTCOMES = new Set([...REVIEW_OUTCOMES].filter(value => value !== 'pending'))

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireComplete: false,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--batch') args.batch = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--require-complete') args.requireComplete = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions.js \\
  --strict --require-items

Audits the editable H4G unit-evidence source-anchor specificity decisions file.
Pending decisions are valid by default. Use --require-complete when a filled
review file is expected.`)
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

function sameJson(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right))
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

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function validReviewDate(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value || ''))
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

function validateDecisionPolicy(label, policy, errors) {
  validatePolicy(label, policy, errors)
  for (const key of [
    'decision_template_only',
    'editable_manual_review_template',
    'requires_later_anchor_policy_decision_edit',
    'requires_later_candidate_coverage_recheck',
    'requires_later_consistency_gate',
    'requires_later_manual_review',
    'requires_later_publication_gate',
    'review_batch_only',
    'source_anchor_specificity_batch_only'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
}

function validateTopLevel(decisions, batch, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.source_anchor_policy_source_anchor_specificity_batch !== args.batch) {
    errors.push('decisions source batch must match audit arg')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('decisions editable_manual_review_template must be true')
  if (decisions.review_batch_only !== true) errors.push('decisions review_batch_only must be true')
  if (decisions.source_anchor_specificity_batch_only !== true) {
    errors.push('decisions source_anchor_specificity_batch_only must be true')
  }
  validatePolicy('decisions', decisions, errors)
  validateDecisionPolicy('decisions policy', decisions.policy || {}, errors)
  if (!sameJson(decisions.allowed_review_outcomes || [], [...REVIEW_OUTCOMES])) {
    errors.push('decisions allowed_review_outcomes mismatch')
  }
  if (!Array.isArray(decisions.source_anchor_specificity_decisions)) {
    errors.push('decisions source_anchor_specificity_decisions must be an array')
  }

  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch') {
    errors.push('batch purpose mismatch')
  }
  validatePolicy('batch', batch, errors)
}

function mapBy(rows, key, errors, label) {
  const out = new Map()
  for (const row of rows || []) {
    const id = row[key] || ''
    if (!id) {
      errors.push(`${label} row missing ${key}`)
      continue
    }
    if (out.has(id)) errors.push(`${label} duplicate ${key}: ${id}`)
    out.set(id, row)
  }
  return out
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

function initialConfirmations(item) {
  const source = item.review_decision_template?.required_confirmations || {}
  return Object.fromEntries(Object.keys(source)
    .sort((a, b) => a.localeCompare(b))
    .map(key => [key, source[key]]))
}

function expectedByItem(batch) {
  const out = new Map()
  for (const item of batch.source_anchor_specificity_review_items || []) {
    out.set(item.source_anchor_specificity_review_item_id, {
      anchor_policy_action_work_item_id: item.anchor_policy_action_work_item_id || '',
      anchor_policy_review_item_id: item.anchor_policy_review_item_id || '',
      candidate_match: compactMatch(item.candidate_match || {}),
      candidate_match_id: item.candidate_match_id || '',
      decision_id: `h4g_unit_source_anchor_specificity_decision_${hashText(item.source_anchor_specificity_review_item_id)}`,
      grade_band: item.grade_band || '',
      group_grade_bands: item.group_grade_bands || [],
      group_progression_completeness: item.group_progression_completeness || '',
      group_standard_codes: item.group_standard_codes || [],
      page_range_status: item.page_range_status || '',
      parent_anchor_policy_decision_id: item.decision_id || '',
      parent_work_queue: item.parent_work_queue || '',
      priority_rank: item.priority_rank || 0,
      priority_score: item.priority_score || 0,
      progression_group_id: item.progression_group_id || '',
      required_confirmations: initialConfirmations(item),
      review_grain: item.review_grain || '',
      review_questions: item.review_decision_template?.review_questions || [],
      risk_flags: item.risk_flags || [],
      source_anchor_specificity_review_item_id: item.source_anchor_specificity_review_item_id || '',
      source_file: item.source_file || item.candidate_match?.source_file || '',
      standard_code: item.standard_code || '',
      subject_slug: item.subject_slug || '',
      suggested_reviewer_decision: item.suggested_reviewer_decision || '',
      triage_reason: item.triage_reason || ''
    })
  }
  return out
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

function validatePending(row, expected, prefix, errors) {
  if (row.decision_status !== 'pending_review') errors.push(`${prefix} pending decision_status must be pending_review`)
  if (!sameJson(row.required_confirmations || {}, expected.required_confirmations || {})) {
    errors.push(`${prefix} pending required_confirmations must match source template`)
  }
  if (hasValue(row.reviewed_by)) errors.push(`${prefix} pending reviewed_by must remain empty`)
  if (hasValue(row.reviewed_at)) errors.push(`${prefix} pending reviewed_at must remain empty`)
}

function requireCompleted(row, prefix, errors) {
  if (row.decision_status !== 'source_anchor_specificity_reviewed') {
    errors.push(`${prefix} completed decision_status must be source_anchor_specificity_reviewed`)
  }
  if (!hasValue(row.reviewed_by)) errors.push(`${prefix} reviewed_by is required after a non-pending outcome`)
  if (!validReviewDate(row.reviewed_at)) errors.push(`${prefix} reviewed_at must start with YYYY-MM-DD after a non-pending outcome`)
  if (!hasValue(row.decision_note) && !hasValue(row.reviewer_note)) {
    errors.push(`${prefix} completed decision requires decision_note or reviewer_note`)
  }
}

function validateCompletedConfirmations(row, prefix, errors) {
  const confirmations = row.required_confirmations || {}
  for (const key of [
    'anchor_policy_decision_still_required',
    'candidate_not_directly_eligible',
    'no_public_write_requested',
    'official_standard_text_preserved',
    'page_start_present'
  ]) {
    if (confirmations[key] !== true) errors.push(`${prefix} ${key} must be true after completed review`)
  }
  if (row.reviewer_outcome === 'source_anchor_specific_for_later_decision_review') {
    for (const key of [
      'cross_version_consistency_checked',
      'noneligible_reason_understood',
      'policy_exception_or_alias_is_justified',
      'same_grade_scope_confirmed',
      'source_anchor_specific_to_standard',
      'unit_title_scope_not_overbroad'
    ]) {
      if (confirmations[key] !== true) errors.push(`${prefix} ${key} must be true for source-anchor specific outcome`)
    }
    if (!hasValue(row.exact_evidence_note)) errors.push(`${prefix} exact_evidence_note is required for source-anchor specific outcome`)
  }
}

function validateDecision(row, expected, args, errors, stats) {
  const prefix = row.decision_id || row.source_anchor_specificity_review_item_id || '(specificity decision)'
  validatePolicy(prefix, row, errors)
  validateDecisionPolicy(`${prefix} decision_template_policy`, row.decision_template_policy || {}, errors)
  if (!sameJson(row.allowed_review_outcomes || [], [...REVIEW_OUTCOMES])) errors.push(`${prefix} allowed_review_outcomes mismatch`)
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (!sameJson(row[key], expectedValue)) errors.push(`${prefix} ${key} mismatch`)
  }
  if (row.decision_surface !== 'h4g_unit_anchor_policy_source_anchor_specificity_review') {
    errors.push(`${prefix} decision_surface mismatch`)
  }
  if (!REVIEW_OUTCOMES.has(row.reviewer_outcome)) errors.push(`${prefix} invalid reviewer_outcome`)
  for (const key of [
    'requested_direct_matcher_use',
    'requested_eligible_for_h4g_differentiation',
    'requested_official_text_change',
    'requested_public_write'
  ]) {
    if (row[key] !== false) errors.push(`${prefix} ${key} must be false`)
  }
  if (row.reviewer_outcome === 'pending') validatePending(row, expected, prefix, errors)
  else {
    requireCompleted(row, prefix, errors)
    validateCompletedConfirmations(row, prefix, errors)
  }
  if (args.requireComplete && row.reviewer_outcome === 'pending') {
    errors.push(`${prefix} must not be pending when --require-complete is set`)
  }
  stats.audited_decisions += 1
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Source-Anchor Specificity Decisions Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected decisions | ${payload.summary.expected_decisions} |
| audited decisions | ${payload.summary.audited_decisions} |
| missing decisions | ${payload.summary.missing_decisions} |
| extra decisions | ${payload.summary.extra_decisions} |
| pending decisions | ${payload.summary.pending_decisions} |
| completed decisions | ${payload.summary.completed_decisions} |

## Reviewer Outcomes

| outcome | rows |
| --- | ---: |
${countRows(payload.summary.by_reviewer_outcome)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['decisions', args.decisions],
    ['batch', args.batch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { source_anchor_specificity_decisions: [] }
  const batch = existsSync(args.batch) ? readJson(args.batch) : { source_anchor_specificity_review_items: [] }
  if (!errors.length) validateTopLevel(decisions, batch, args, errors)
  const rows = decisions.source_anchor_specificity_decisions || []
  const byItem = mapBy(rows, 'source_anchor_specificity_review_item_id', errors, 'decisions')
  const expected = expectedByItem(batch)
  const stats = {
    audited_decisions: 0,
    expected_decisions: expected.size,
    extra_decisions: 0,
    missing_decisions: 0,
    ...summarize(rows)
  }
  if (!sameJson(decisions.summary || {}, summarize(rows))) errors.push('decisions summary does not match rows')
  for (const [id, expectedRow] of expected.entries()) {
    const row = byItem.get(id)
    if (!row) {
      stats.missing_decisions += 1
      errors.push(`${id} missing decision`)
      continue
    }
    validateDecision(row, expectedRow, args, errors, stats)
  }
  for (const id of byItem.keys()) {
    if (!expected.has(id)) {
      stats.extra_decisions += 1
      errors.push(`${id} unexpected decision`)
    }
  }
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no decisions were audited')
  return {
    batch: args.batch,
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    require_complete: args.requireComplete,
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
  if (args.out) writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({
    errors: payload.errors,
    generated_at: payload.generated_at,
    out: args.out,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid,
    writes_public_data: payload.writes_public_data
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
