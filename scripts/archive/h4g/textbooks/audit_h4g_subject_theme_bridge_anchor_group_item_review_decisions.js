#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SPLIT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_EVIDENCE_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe_audit.md'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireComplete: false,
    requireItems: false,
    sourceEvidenceBatch: DEFAULT_SOURCE_EVIDENCE_BATCH,
    splitBatch: DEFAULT_SPLIT_BATCH,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--split-batch') args.splitBatch = argv[++i]
    else if (item === '--source-evidence-batch') args.sourceEvidenceBatch = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_decisions.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --split-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json \\
  --source-evidence-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits editable item-level H4G anchor group decisions. Pending decisions are
valid by default. Use --require-complete after a human/source review pass.`)
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

function arraysMatch(actual, expected) {
  return sorted(actual).join('|') === sorted(expected).join('|')
}

function validReviewDate(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value || ''))
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function validateTopLevel(decisions, splitBatch, sourceEvidenceBatch, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_decisions_template')
  }
  if (decisions.source_anchor_group_split_review_batch !== args.splitBatch) {
    errors.push('decisions source_anchor_group_split_review_batch must match audit arg')
  }
  if (decisions.source_anchor_group_source_evidence_batch !== args.sourceEvidenceBatch) {
    errors.push('decisions source_anchor_group_source_evidence_batch must match audit arg')
  }
  for (const [label, payload] of [
    ['decisions', decisions],
    ['split batch', splitBatch],
    ['source evidence batch', sourceEvidenceBatch]
  ]) {
    if (payload.valid !== true) errors.push(`${label} valid must be true`)
    if (payload.writes_public_data !== false) errors.push(`${label} writes_public_data must be false`)
    if (payload.changes_official_standard_text !== false) errors.push(`${label} changes_official_standard_text must be false`)
    if (payload.direct_matcher_use !== false) errors.push(`${label} direct_matcher_use must be false`)
    if (payload.matcher_ready !== false) errors.push(`${label} matcher_ready must be false`)
    if (payload.publication_ready !== false) errors.push(`${label} publication_ready must be false`)
  }
  if (splitBatch.purpose !== 'h4g_subject_theme_bridge_anchor_group_split_review_batch') {
    errors.push('split batch purpose must be h4g_subject_theme_bridge_anchor_group_split_review_batch')
  }
  if (sourceEvidenceBatch.purpose !== 'h4g_subject_theme_bridge_anchor_group_source_evidence_batch') {
    errors.push('source evidence batch purpose must be h4g_subject_theme_bridge_anchor_group_source_evidence_batch')
  }
  const policy = decisions.policy || {}
  for (const key of [
    'item_review_decision_is_not_approval',
    'source_decision_must_be_edited_separately',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`policy.${key} must be true`)
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'eligible_for_h4g_differentiation',
    'direct_matcher_use',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (policy[key] !== false) errors.push(`policy.${key} must be false`)
  }
}

function expectedRows(splitBatch, sourceEvidenceBatch) {
  const rows = []
  for (const item of splitBatch.split_review_items || []) {
    rows.push({
      decisionType: 'anchor_group_split_item_review_decision',
      sourceItem: item,
      sourceItemId: item.split_review_item_id,
      sourceType: 'split_review_item',
      surface: 'anchor_group_split_review'
    })
  }
  for (const item of sourceEvidenceBatch.source_evidence_request_items || []) {
    rows.push({
      decisionType: 'anchor_group_source_evidence_item_review_decision',
      sourceItem: item,
      sourceItemId: item.source_evidence_request_item_id,
      sourceType: 'source_evidence_request_item',
      surface: 'anchor_group_source_evidence_review'
    })
  }
  return rows
}

function expectedKey(row) {
  return `${row.decisionType}|${row.sourceItemId}`
}

function actualKey(row) {
  return `${row.decision_type}|${row.source_batch_item_id}`
}

function auditPolicy(row, prefix, errors) {
  if (row.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (row.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (row.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
  if (row.requested_eligible_for_h4g_differentiation !== false) errors.push(`${prefix} requested_eligible_for_h4g_differentiation must be false`)
  if (row.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
  if (row.direct_matcher_use !== false) errors.push(`${prefix} direct_matcher_use must be false`)
  if (row.eligible_for_h4g_differentiation !== false) errors.push(`${prefix} eligible_for_h4g_differentiation must be false`)
  if (row.matcher_ready !== false) errors.push(`${prefix} matcher_ready must be false`)
  if (row.publication_ready !== false) errors.push(`${prefix} publication_ready must be false`)
  const policy = row.publication_policy || {}
  for (const key of [
    'item_review_decision_is_not_approval',
    'source_decision_must_be_edited_separately',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${prefix} publication_policy.${key} must be true`)
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'eligible_for_h4g_differentiation',
    'direct_matcher_use',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (policy[key] !== false) errors.push(`${prefix} publication_policy.${key} must be false`)
  }
}

function auditPendingOrCompleted(row, prefix, args, errors, stats) {
  if (!Array.isArray(row.allowed_decisions) || !row.allowed_decisions.includes('pending')) {
    errors.push(`${prefix} allowed_decisions must include pending`)
  }
  if (!row.allowed_decisions?.includes(row.reviewer_decision)) {
    errors.push(`${prefix} reviewer_decision is not in allowed_decisions`)
  }
  if (row.reviewer_decision === 'pending') {
    stats.pending_item_review_decisions += 1
    return
  }
  stats.completed_item_review_decisions += 1
  if (!hasValue(row.reviewed_by)) errors.push(`${prefix} reviewed_by is required for non-pending decision`)
  if (!validReviewDate(row.reviewed_at)) errors.push(`${prefix} reviewed_at must start with YYYY-MM-DD for non-pending decision`)
  if (!hasValue(row.decision_note)) errors.push(`${prefix} decision_note is required for non-pending decision`)
  const confirmations = row.required_confirmations || {}
  if (confirmations.no_public_write_requested !== true) errors.push(`${prefix} required_confirmations.no_public_write_requested must be true`)
  if (confirmations.official_standard_text_preserved !== true) errors.push(`${prefix} required_confirmations.official_standard_text_preserved must be true`)
  if (args.requireComplete && row.reviewer_decision === 'pending') errors.push(`${prefix} cannot remain pending with --require-complete`)
}

function auditCommonFields(row, expected, prefix, errors) {
  const source = expected.sourceItem
  if (row.source_batch_item_type !== expected.sourceType) errors.push(`${prefix} source_batch_item_type mismatch`)
  if (row.item_review_surface !== expected.surface) errors.push(`${prefix} item_review_surface mismatch`)
  if (row.decision_type !== expected.decisionType) errors.push(`${prefix} decision_type mismatch`)
  if (row.progression_group_id !== source.progression_group_id) errors.push(`${prefix} progression_group_id mismatch`)
  if (row.subject_slug !== source.subject_slug) errors.push(`${prefix} subject_slug mismatch`)
  if (row.priority_rank !== source.priority_rank) errors.push(`${prefix} priority_rank mismatch`)
  if (row.priority_tier !== source.priority_tier) errors.push(`${prefix} priority_tier mismatch`)
  if (row.review_grain !== source.review_grain) errors.push(`${prefix} review_grain mismatch`)
  if (row.standard_code !== source.standard_code) errors.push(`${prefix} standard_code mismatch`)
  if (row.source_standard_code !== source.standard_code) errors.push(`${prefix} source_standard_code mismatch`)
  if (row.source_triage_decision_id !== source.source_triage_decision_id) errors.push(`${prefix} source_triage_decision_id mismatch`)
  if (row.source_anchor_review_rows !== (source.source_anchor_review_items || []).length) {
    errors.push(`${prefix} source_anchor_review_rows mismatch`)
  }
  if (!arraysMatch(row.source_anchor_review_item_ids, (source.source_anchor_review_items || []).map(item => item.anchor_review_item_id))) {
    errors.push(`${prefix} source_anchor_review_item_ids mismatch`)
  }
}

function auditSplitRow(row, source, prefix, errors) {
  if (row.action_family !== source.action_family) errors.push(`${prefix} action_family mismatch`)
  if (row.anchor_type !== source.anchor_type) errors.push(`${prefix} anchor_type mismatch`)
  if (row.grade_band !== source.grade_band) errors.push(`${prefix} grade_band mismatch`)
  if (row.split_candidate_id !== source.split_candidate_id) errors.push(`${prefix} split_candidate_id mismatch`)
  if (row.allowed_decisions?.join('|') !== ['pending', ...(source.review_decision_template?.allowed_review_outcomes || [])].join('|')) {
    errors.push(`${prefix} allowed_decisions must match split review template`)
  }
  if (!row.standard_context?.standard) errors.push(`${prefix} standard_context.standard must be present`)
}

function auditEvidenceRow(row, source, prefix, errors) {
  if (row.anchor_type !== source.anchor_type) errors.push(`${prefix} anchor_type mismatch`)
  if (row.source_anchor_evidence_request_id !== source.source_anchor_evidence_request_id) {
    errors.push(`${prefix} source_anchor_evidence_request_id mismatch`)
  }
  if (!arraysMatch(row.existing_grade_bands, source.existing_grade_bands)) errors.push(`${prefix} existing_grade_bands mismatch`)
  if (!arraysMatch(row.missing_grade_bands, source.missing_grade_bands)) errors.push(`${prefix} missing_grade_bands mismatch`)
  if (!arraysMatch(row.missing_target_standard_grade_bands, source.missing_target_standard_grade_bands)) {
    errors.push(`${prefix} missing_target_standard_grade_bands mismatch`)
  }
  if (!arraysMatch((row.target_missing_grade_standards || []).map(item => item.code), (source.target_missing_grade_standards || []).map(item => item.code))) {
    errors.push(`${prefix} target_missing_grade_standards mismatch`)
  }
  if (row.allowed_decisions?.join('|') !== ['pending', ...(source.review_decision_template?.allowed_review_outcomes || [])].join('|')) {
    errors.push(`${prefix} allowed_decisions must match source evidence template`)
  }
  if (!row.source_standard_context?.standard) errors.push(`${prefix} source_standard_context.standard must be present`)
}

function summarizeRows(rows) {
  const stats = {
    by_decision_type: {},
    by_grade_band: {},
    by_item_review_surface: {},
    by_missing_grade_band: {},
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_subject: {},
    completed_item_review_decisions: 0,
    extra_decisions: 0,
    expected_item_review_decisions: 0,
    item_review_decisions: rows.length,
    missing_decisions: 0,
    pending_item_review_decisions: 0,
    source_anchor_review_rows: 0,
    source_evidence_item_review_decisions: 0,
    split_item_review_decisions: 0,
    target_missing_grade_standards: 0,
    target_standard_gap_decisions: 0
  }
  for (const row of rows) {
    stats.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    if (row.decision_type === 'anchor_group_split_item_review_decision') stats.split_item_review_decisions += 1
    if (row.decision_type === 'anchor_group_source_evidence_item_review_decision') stats.source_evidence_item_review_decisions += 1
    stats.target_missing_grade_standards += (row.target_missing_grade_standards || []).length
    if ((row.missing_target_standard_grade_bands || []).length) stats.target_standard_gap_decisions += 1
    countInto(stats.by_decision_type, row.decision_type)
    countInto(stats.by_item_review_surface, row.item_review_surface)
    countInto(stats.by_priority_tier, row.priority_tier)
    countInto(stats.by_reviewer_decision, row.reviewer_decision)
    countInto(stats.by_subject, row.subject_slug)
    if (row.grade_band) countInto(stats.by_grade_band, row.grade_band)
    for (const gradeBand of row.missing_grade_bands || []) countInto(stats.by_missing_grade_band, gradeBand)
  }
  return stats
}

function auditSummary(decisions, stats, errors) {
  const summary = decisions.summary || {}
  const checks = [
    'item_review_decisions',
    'pending_item_review_decisions',
    'completed_item_review_decisions',
    'split_item_review_decisions',
    'source_evidence_item_review_decisions',
    'source_anchor_review_rows',
    'target_missing_grade_standards',
    'target_standard_gap_decisions'
  ]
  for (const field of checks) {
    if (summary[field] !== stats[field]) errors.push(`summary.${field} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Item Review Decisions Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected item review decisions | ${payload.summary.expected_item_review_decisions} |
| item review decisions | ${payload.summary.item_review_decisions} |
| pending item review decisions | ${payload.summary.pending_item_review_decisions} |
| missing decisions | ${payload.summary.missing_decisions} |
| extra decisions | ${payload.summary.extra_decisions} |
| split item review decisions | ${payload.summary.split_item_review_decisions} |
| source evidence item review decisions | ${payload.summary.source_evidence_item_review_decisions} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |

## Decision Types

| decision type | rows |
| --- | ---: |
${countRows(payload.summary.by_decision_type)}

## Reviewer Decisions

| reviewer decision | rows |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['decisions', args.decisions],
    ['split batch', args.splitBatch],
    ['source evidence batch', args.sourceEvidenceBatch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = errors.length ? { item_review_decisions: [] } : readJson(args.decisions)
  const splitBatch = errors.length ? { split_review_items: [] } : readJson(args.splitBatch)
  const sourceEvidenceBatch = errors.length ? { source_evidence_request_items: [] } : readJson(args.sourceEvidenceBatch)
  if (!errors.length) validateTopLevel(decisions, splitBatch, sourceEvidenceBatch, args, errors)

  const expected = new Map()
  for (const row of expectedRows(splitBatch, sourceEvidenceBatch)) {
    const key = expectedKey(row)
    if (expected.has(key)) errors.push(`duplicate expected source item ${key}`)
    expected.set(key, { ...row, seen: false })
  }

  const rows = decisions.item_review_decisions || []
  const stats = summarizeRows(rows)
  stats.expected_item_review_decisions = expected.size
  const seenDecisionIds = new Set()
  const seenActualKeys = new Set()
  for (const row of rows) {
    const prefix = row.decision_id || actualKey(row)
    if (!row.decision_id) errors.push(`${prefix} missing decision_id`)
    if (seenDecisionIds.has(row.decision_id)) errors.push(`${prefix} duplicate decision_id`)
    seenDecisionIds.add(row.decision_id)
    const key = actualKey(row)
    if (seenActualKeys.has(key)) errors.push(`${prefix} duplicate source decision row`)
    seenActualKeys.add(key)
    const expectedRow = expected.get(key)
    if (!expectedRow) {
      stats.extra_decisions += 1
      errors.push(`${prefix} does not match any expected source item`)
      continue
    }
    expectedRow.seen = true
    auditCommonFields(row, expectedRow, prefix, errors)
    if (expectedRow.sourceType === 'split_review_item') auditSplitRow(row, expectedRow.sourceItem, prefix, errors)
    else auditEvidenceRow(row, expectedRow.sourceItem, prefix, errors)
    auditPolicy(row, prefix, errors)
    auditPendingOrCompleted(row, prefix, args, errors, stats)
  }

  for (const [key, row] of expected.entries()) {
    if (!row.seen) {
      stats.missing_decisions += 1
      errors.push(`${key} missing from item review decisions`)
    }
  }
  if (args.requireItems && !expected.size) errors.push('requireItems is set but no expected rows were found')
  if (args.requireItems && !rows.length) errors.push('requireItems is set but decisions have no item_review_decisions')
  if (args.requireComplete && stats.pending_item_review_decisions > 0) {
    errors.push(`requireComplete is set but ${stats.pending_item_review_decisions} decisions are still pending`)
  }
  auditSummary(decisions, stats, errors)

  return {
    decisions: args.decisions,
    errors,
    generated_at: new Date().toISOString(),
    require_complete: args.requireComplete,
    require_items: args.requireItems,
    source_evidence_batch: args.sourceEvidenceBatch,
    split_batch: args.splitBatch,
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
