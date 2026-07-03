#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_action_worklist.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_decisions_template.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch_audit.md'
const SOURCE_ANCHOR_QUEUES = new Set([
  'unit_source_anchor_specificity_review_queue',
  'unit_source_anchor_specificity_page_gap_queue'
])
const REVIEW_GRAIN = 'standard_code+grade_band+candidate_match_id'

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    decisions: DEFAULT_DECISIONS,
    maxRank: Number.POSITIVE_INFINITY,
    minRank: 1,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    subjects: null,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
    else if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = parseList(argv[++i])
    else if (item === '--min-rank') args.minRank = Number(argv[++i])
    else if (item === '--max-rank') args.maxRank = Number(argv[++i])
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch.js \\
  --strict --require-items

Audits the H4G unit-evidence source-anchor specificity batch against the
anchor-policy action worklist and editable decisions template.`)
}

function parseList(value) {
  const rows = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  if (!rows.length || rows.includes('all')) return null
  return rows
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

function validateArgs(args, errors) {
  if (!Number.isInteger(args.minRank) || args.minRank < 1) errors.push('--min-rank must be an integer >= 1')
  if (args.maxRank !== Number.POSITIVE_INFINITY && (!Number.isInteger(args.maxRank) || args.maxRank < 1)) {
    errors.push('--max-rank must be an integer >= 1')
  }
  if (args.minRank > args.maxRank) errors.push('--min-rank must be <= --max-rank')
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

function validateSpecificityPolicy(label, policy, errors) {
  validatePolicy(label, policy, errors)
  for (const key of [
    'requires_later_anchor_policy_decision_edit',
    'requires_later_candidate_coverage_recheck',
    'requires_later_consistency_gate',
    'requires_later_manual_review',
    'requires_later_publication_gate',
    'review_batch_only',
    'source_anchor_specificity_batch_only',
    'worklist_only'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
}

function validateTopLevel(batch, worklist, decisions, args, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch') {
    errors.push('batch purpose mismatch')
  }
  if (batch.source_anchor_policy_review_action_worklist !== args.worklist) {
    errors.push('batch source action worklist must match audit arg')
  }
  if (batch.source_anchor_policy_review_decisions !== args.decisions) {
    errors.push('batch source decisions must match audit arg')
  }
  if (batch.worklist_only !== true) errors.push('batch worklist_only must be true')
  if (batch.review_batch_only !== true) errors.push('batch review_batch_only must be true')
  if (batch.source_anchor_specificity_batch_only !== true) {
    errors.push('batch source_anchor_specificity_batch_only must be true')
  }
  validatePolicy('batch', batch, errors)
  validateSpecificityPolicy('batch policy', batch.policy || {}, errors)
  if (batch.selection?.min_rank !== args.minRank) errors.push('batch selection.min_rank must match audit arg')
  const expectedMax = args.maxRank === Number.POSITIVE_INFINITY ? 'all' : args.maxRank
  if (batch.selection?.max_rank !== expectedMax) errors.push('batch selection.max_rank must match audit arg')
  const expectedSubjects = args.subjects || ['all']
  if (!sameJson(batch.selection?.subjects || [], expectedSubjects)) errors.push('batch selection.subjects must match audit arg')
  if (!sameJson(batch.selection?.work_queues || [], [...SOURCE_ANCHOR_QUEUES].sort())) {
    errors.push('batch selection.work_queues mismatch')
  }

  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_unit_evidence_anchor_policy_review_action_worklist') errors.push('worklist purpose mismatch')
  validatePolicy('worklist', worklist, errors)

  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_unit_evidence_anchor_policy_review_decisions_template') errors.push('decisions purpose mismatch')
  validatePolicy('decisions', decisions, errors)
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

function selectedWorkItems(worklist, args) {
  const subjectSet = args.subjects ? new Set(args.subjects) : null
  return (worklist.anchor_policy_action_work_items || [])
    .filter(item => SOURCE_ANCHOR_QUEUES.has(item.work_queue))
    .filter(item => item.suggested_reviewer_decision === 'needs_source_anchor_specificity_review')
    .filter(item => Number(item.priority_rank || 0) >= args.minRank)
    .filter(item => Number(item.priority_rank || 0) <= args.maxRank)
    .filter(item => !subjectSet || subjectSet.has(item.subject_slug || ''))
}

function expectedRows(worklist, args) {
  const rows = []
  for (const workItem of selectedWorkItems(worklist, args)) {
    const matches = mapBy(workItem.reference_candidate_matches || [], 'match_id', [], 'reference matches')
    for (const matchId of workItem.reference_candidate_match_ids || []) {
      rows.push({
        expected_key: `${workItem.anchor_policy_action_work_item_id}|${matchId}`,
        match: matches.get(matchId),
        workItem
      })
    }
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_grade_band: {},
    by_page_range_status: {},
    by_parent_work_queue: {},
    by_risk_flag: {},
    by_subject: {},
    parent_work_items: sorted(rows.map(row => row.anchor_policy_action_work_item_id)).length,
    source_anchor_specificity_review_items: rows.length,
    source_files: sorted(rows.map(row => row.source_file)).length,
    unique_candidate_matches: sorted(rows.map(row => row.candidate_match_id)).length
  }
  for (const row of rows) {
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_range_status, row.page_range_status)
    countInto(summary.by_parent_work_queue, row.parent_work_queue)
    countInto(summary.by_subject, row.subject_slug)
    for (const flag of row.risk_flags || []) countInto(summary.by_risk_flag, flag)
  }
  return summary
}

function auditTemplate(row, prefix, errors) {
  const template = row.review_decision_template || {}
  for (const outcome of [
    'source_anchor_specific_for_later_decision_review',
    'source_anchor_overbroad_keep_blocked',
    'source_anchor_requires_page_start_repair',
    'source_anchor_wrong_grade_or_not_relevant'
  ]) {
    if (!(template.allowed_review_outcomes || []).includes(outcome)) {
      errors.push(`${prefix} allowed_review_outcomes missing ${outcome}`)
    }
  }
  for (const forbidden of ['matcher_ready', 'publication_ready', 'unit_evidence_approved']) {
    if ((template.allowed_review_outcomes || []).includes(forbidden)) {
      errors.push(`${prefix} allowed_review_outcomes must not include ${forbidden}`)
    }
  }
  const confirmations = template.required_confirmations || {}
  for (const [key, expected] of Object.entries({
    anchor_policy_decision_still_required: true,
    candidate_not_directly_eligible: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true
  })) {
    if (confirmations[key] !== expected) errors.push(`${prefix} ${key} must be ${expected}`)
  }
  for (const key of [
    'cross_version_consistency_checked',
    'noneligible_reason_understood',
    'policy_exception_or_alias_is_justified',
    'same_grade_scope_confirmed',
    'source_anchor_specific_to_standard',
    'unit_title_scope_not_overbroad'
  ]) {
    if (confirmations[key] !== false) errors.push(`${prefix} ${key} must start false`)
  }
  for (const key of [
    'requested_direct_matcher_use',
    'requested_eligible_for_h4g_differentiation',
    'requested_official_text_change',
    'requested_public_write'
  ]) {
    if (template[key] !== false) errors.push(`${prefix} ${key} must be false`)
  }
}

function auditItem(row, expected, decision, errors, stats) {
  const prefix = row.source_anchor_specificity_review_item_id || row.candidate_match_id || '(specificity row)'
  validatePolicy(prefix, row, errors)
  validateSpecificityPolicy(`${prefix} policy`, row.policy || {}, errors)
  auditTemplate(row, prefix, errors)
  if (row.review_grain !== REVIEW_GRAIN) errors.push(`${prefix} review_grain mismatch`)
  if (row.worklist_only !== true) errors.push(`${prefix} worklist_only must be true`)
  if (!row.required_manual_checks?.length) errors.push(`${prefix} required_manual_checks must be non-empty`)
  if (!row.risk_flags?.length) errors.push(`${prefix} risk_flags must be non-empty`)
  if (!row.source_file) errors.push(`${prefix} source_file must not be empty`)
  if (!expected) {
    errors.push(`${prefix} unexpected specificity row`)
    return
  }
  if (!expected.match) {
    errors.push(`${prefix} expected source work item is missing reference match object`)
    return
  }
  const workItem = expected.workItem
  const match = expected.match
  for (const [field, actual, expectedValue] of [
    ['anchor_policy_action_work_item_id', row.anchor_policy_action_work_item_id, workItem.anchor_policy_action_work_item_id],
    ['anchor_policy_review_item_id', row.anchor_policy_review_item_id, workItem.anchor_policy_review_item_id],
    ['decision_id', row.decision_id, workItem.decision_id],
    ['grade_band', row.grade_band, workItem.grade_band],
    ['group_progression_completeness', row.group_progression_completeness, workItem.group_progression_completeness],
    ['parent_work_queue', row.parent_work_queue, workItem.work_queue],
    ['priority_rank', row.priority_rank, workItem.priority_rank],
    ['priority_score', row.priority_score, workItem.priority_score],
    ['progression_group_id', row.progression_group_id, workItem.progression_group_id],
    ['standard_code', row.standard_code, workItem.standard_code],
    ['subject_slug', row.subject_slug, workItem.subject_slug],
    ['suggested_reviewer_decision', row.suggested_reviewer_decision, workItem.suggested_reviewer_decision],
    ['source_file', row.source_file, match.source_file]
  ]) {
    if (!sameJson(actual, expectedValue)) errors.push(`${prefix} ${field} must match source`)
  }
  if (!sameJson(row.group_grade_bands || [], workItem.group_grade_bands || [])) {
    errors.push(`${prefix} group_grade_bands must match work item`)
  }
  if (!sameJson(row.group_standard_codes || [], workItem.group_standard_codes || [])) {
    errors.push(`${prefix} group_standard_codes must match work item`)
  }
  if (!sameJson(row.candidate_match || {}, match)) errors.push(`${prefix} candidate_match must match work item reference match`)
  if (!decision) errors.push(`${prefix} decision row not found`)
  else if (!(decision.allowed_decisions || []).includes(row.suggested_reviewer_decision)) {
    errors.push(`${prefix} suggested decision must be allowed by decision template`)
  }
  if (row.review_decision_template?.required_confirmations?.page_start_present !== (match.page_start !== '' && match.page_start !== null && match.page_start !== undefined)) {
    errors.push(`${prefix} page_start_present must reflect candidate match page_start`)
  }
  stats.audited_items += 1
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Anchor Policy Source-Anchor Specificity Batch Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected specificity rows | ${payload.summary.expected_source_anchor_specificity_review_items} |
| audited specificity rows | ${payload.summary.audited_items} |
| missing specificity rows | ${payload.summary.missing_source_anchor_specificity_review_items} |
| extra specificity rows | ${payload.summary.extra_source_anchor_specificity_review_items} |
| parent work items | ${payload.summary.parent_work_items} |
| unique candidate matches | ${payload.summary.unique_candidate_matches} |

## Parent Queues

| queue | rows |
| --- | ---: |
${countRows(payload.summary.by_parent_work_queue)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  validateArgs(args, errors)
  for (const [label, path] of [
    ['batch', args.batch],
    ['worklist', args.worklist],
    ['decisions', args.decisions]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const batch = existsSync(args.batch) ? readJson(args.batch) : { source_anchor_specificity_review_items: [] }
  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { anchor_policy_action_work_items: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { anchor_policy_review_decisions: [] }
  if (!errors.length) validateTopLevel(batch, worklist, decisions, args, errors)

  const expected = expectedRows(worklist, args)
  const expectedByKey = mapBy(expected, 'expected_key', errors, 'expected rows')
  const actualRows = batch.source_anchor_specificity_review_items || []
  const actualByKey = mapBy(actualRows.map(row => ({
    ...row,
    expected_key: `${row.anchor_policy_action_work_item_id}|${row.candidate_match_id}`
  })), 'expected_key', errors, 'batch')
  const decisionsByItem = mapBy(decisions.anchor_policy_review_decisions || [], 'anchor_policy_review_item_id', errors, 'decisions')
  const stats = {
    audited_items: 0,
    expected_source_anchor_specificity_review_items: expected.length,
    extra_source_anchor_specificity_review_items: 0,
    missing_source_anchor_specificity_review_items: 0,
    ...summarize(actualRows)
  }
  if (!sameJson(batch.summary || {}, summarize(actualRows))) errors.push('batch summary does not match rows')
  for (const row of actualRows) {
    auditItem(row, expectedByKey.get(`${row.anchor_policy_action_work_item_id}|${row.candidate_match_id}`), decisionsByItem.get(row.anchor_policy_review_item_id), errors, stats)
  }
  for (const row of expected) {
    if (!actualByKey.has(row.expected_key)) {
      stats.missing_source_anchor_specificity_review_items += 1
      errors.push(`${row.expected_key} missing specificity row`)
    }
  }
  for (const row of actualRows) {
    if (!expectedByKey.has(`${row.anchor_policy_action_work_item_id}|${row.candidate_match_id}`)) {
      stats.extra_source_anchor_specificity_review_items += 1
    }
  }
  if (args.requireItems && !expected.length) errors.push('requireItems is set but expected rows are empty')
  if (args.requireItems && !actualRows.length) errors.push('requireItems is set but batch rows are empty')
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
