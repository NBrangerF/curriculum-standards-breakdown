#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_review_ready_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SPLIT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_review_ready_batch_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_review_ready_batch_anchor_domain_rejected_english_pe_audit.md'

const WORK_QUEUE = 'item_level_source_review_ready_queue'
const RECOMMENDATION = 'accept_bounded_slice_for_item_level_source_review'
const REVIEW_GRAIN = 'standard_code+grade_band+anchor_review_item_id'

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    maxRank: Number.POSITIVE_INFINITY,
    minRank: 1,
    out: DEFAULT_OUT,
    requireItems: false,
    splitBatch: DEFAULT_SPLIT_BATCH,
    strict: false,
    subjects: null,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
    else if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--split-batch') args.splitBatch = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_source_review_ready_batch.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_review_ready_batch_anchor_domain_rejected_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json \\
  --split-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the H4G item-level source-review-ready batch against the item-review
action worklist and the upstream split review batch.`)
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

function selectedWorkItems(worklist, args) {
  const subjectSet = args.subjects ? new Set(args.subjects) : null
  return (worklist.item_review_action_work_items || [])
    .filter(item => item.work_queue === WORK_QUEUE)
    .filter(item => item.recommended_reviewer_decision === RECOMMENDATION)
    .filter(item => Number(item.priority_rank || 0) >= args.minRank)
    .filter(item => Number(item.priority_rank || 0) <= args.maxRank)
    .filter(item => !subjectSet || subjectSet.has(item.subject_slug || ''))
}

function sourceRowsBySplitItemId(splitBatch, errors) {
  const out = new Map()
  for (const splitItem of splitBatch.split_review_items || []) {
    if (!splitItem.split_review_item_id) {
      errors.push('split batch row missing split_review_item_id')
      continue
    }
    out.set(splitItem.split_review_item_id, splitItem.source_anchor_review_items || [])
  }
  return out
}

function expectedRows(worklist, splitRowsById, args, errors) {
  const rows = []
  for (const workItem of selectedWorkItems(worklist, args)) {
    const sourceRows = splitRowsById.get(workItem.source_batch_item_id) || []
    if (sourceRows.length !== 1) {
      errors.push(`${workItem.action_work_item_id} expected source split row count must be 1`)
      continue
    }
    rows.push({
      expected_id_key: `${workItem.action_work_item_id}|${sourceRows[0].anchor_review_item_id}`,
      sourceRow: sourceRows[0],
      workItem
    })
  }
  return rows
}

function validateTopLevel(batch, worklist, splitBatch, args, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_source_review_ready_batch') {
    errors.push('batch purpose must be h4g_subject_theme_bridge_anchor_group_item_review_source_review_ready_batch')
  }
  if (batch.worklist_only !== true) errors.push('batch worklist_only must be true')
  if (batch.source_anchor_group_item_review_action_worklist !== args.worklist) {
    errors.push('batch source_anchor_group_item_review_action_worklist must match audit arg')
  }
  if (batch.source_anchor_group_split_review_batch !== args.splitBatch) {
    errors.push('batch source_anchor_group_split_review_batch must match audit arg')
  }
  if (batch.writes_public_data !== false) errors.push('batch writes_public_data must be false')
  if (batch.changes_official_standard_text !== false) errors.push('batch changes_official_standard_text must be false')
  if (batch.direct_matcher_use !== false) errors.push('batch direct_matcher_use must be false')
  if (batch.matcher_ready !== false) errors.push('batch matcher_ready must be false')
  if (batch.publication_ready !== false) errors.push('batch publication_ready must be false')
  if (batch.selection?.min_rank !== args.minRank) errors.push('batch selection.min_rank must match audit arg')
  const expectedMax = args.maxRank === Number.POSITIVE_INFINITY ? 'all' : args.maxRank
  if (batch.selection?.max_rank !== expectedMax) errors.push('batch selection.max_rank must match audit arg')
  if (batch.selection?.work_queue !== WORK_QUEUE) errors.push(`batch selection.work_queue must be ${WORK_QUEUE}`)
  if (batch.selection?.parent_recommendation !== RECOMMENDATION) {
    errors.push(`batch selection.parent_recommendation must be ${RECOMMENDATION}`)
  }
  const expectedSubjects = args.subjects || ['all']
  const actualSubjects = batch.selection?.subjects || []
  if (actualSubjects.join(',') !== expectedSubjects.join(',')) errors.push('batch selection.subjects must match audit arg')

  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_action_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_anchor_group_item_review_action_worklist')
  }
  if (splitBatch.valid !== true) errors.push('split batch valid must be true')
  if (splitBatch.purpose !== 'h4g_subject_theme_bridge_anchor_group_split_review_batch') {
    errors.push('split batch purpose must be h4g_subject_theme_bridge_anchor_group_split_review_batch')
  }
}

function auditPolicy(item, prefix, errors) {
  if (item.worklist_only !== true) errors.push(`${prefix} worklist_only must be true`)
  if (item.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
  const policy = item.publication_policy || {}
  for (const key of [
    'item_level_decision_gate_required',
    'read_only_source_review_ready_batch',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'source_decision_must_be_edited_separately',
    'source_review_ready_batch_is_not_approval'
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

function auditDecisionTemplate(item, prefix, errors) {
  const template = item.review_decision_template || {}
  const allowed = template.allowed_review_outcomes || []
  for (const value of [
    'source_row_confirms_target_anchor_for_later_gate',
    'source_row_needs_additional_anchor_evidence',
    'source_row_rejected_as_topic_only',
    'source_row_scope_needs_manual_review'
  ]) {
    if (!allowed.includes(value)) errors.push(`${prefix} review_decision_template.allowed_review_outcomes missing ${value}`)
  }
  for (const forbidden of [
    'approve_standard_scoped_subject_theme_bridge',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (allowed.includes(forbidden)) errors.push(`${prefix} review_decision_template must not include ${forbidden}`)
  }
  const confirmations = template.required_confirmations || {}
  if (confirmations.later_matcher_gate_required !== true) errors.push(`${prefix} later_matcher_gate_required must be true`)
  if (confirmations.later_publication_gate_required !== true) errors.push(`${prefix} later_publication_gate_required must be true`)
  if (confirmations.no_public_write_requested !== true) errors.push(`${prefix} no_public_write_requested must be true`)
  if (confirmations.official_standard_text_preserved !== true) errors.push(`${prefix} official_standard_text_preserved must be true`)
  if (confirmations.same_grade_scope_checked !== false) errors.push(`${prefix} same_grade_scope_checked must start false`)
  if (confirmations.same_subject_scope_checked !== false) errors.push(`${prefix} same_subject_scope_checked must start false`)
  if (confirmations.source_anchor_matches_target_standard !== false) {
    errors.push(`${prefix} source_anchor_matches_target_standard must start false`)
  }
  if (confirmations.source_item_reviewed !== false) errors.push(`${prefix} source_item_reviewed must start false`)
  if (template.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (template.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (template.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
}

function auditItem(item, expected, errors, stats) {
  const prefix = item.source_review_ready_item_id || item.parent_action_work_item_id || '(missing source review ready item)'
  if (!item.source_review_ready_item_id) errors.push(`${prefix} missing source_review_ready_item_id`)
  auditPolicy(item, prefix, errors)
  auditDecisionTemplate(item, prefix, errors)
  if (!expected) {
    errors.push(`${prefix} source review ready item not found in expected worklist selection`)
    return
  }
  const workItem = expected.workItem
  const sourceRow = expected.sourceRow
  const checks = [
    ['parent_action_work_item_id', item.parent_action_work_item_id, workItem.action_work_item_id],
    ['parent_decision_id', item.parent_decision_id, workItem.decision_id],
    ['parent_source_batch_item_id', item.parent_source_batch_item_id, workItem.source_batch_item_id],
    ['source_anchor_review_item_id', item.source_anchor_review_item_id, sourceRow.anchor_review_item_id],
    ['standard_code', item.standard_code, workItem.standard_code],
    ['grade_band', item.grade_band, workItem.grade_band],
    ['priority_rank', item.priority_rank, workItem.priority_rank],
    ['priority_tier', item.priority_tier, workItem.priority_tier],
    ['progression_group_id', item.progression_group_id, workItem.progression_group_id],
    ['subject_slug', item.subject_slug, workItem.subject_slug],
    ['source_decision_id', item.source_decision_id, sourceRow.source_decision_id]
  ]
  for (const [field, actual, expectedValue] of checks) {
    if (String(actual ?? '') !== String(expectedValue ?? '')) errors.push(`${prefix} ${field} must match source`)
  }
  if (item.review_grain !== REVIEW_GRAIN) errors.push(`${prefix} review_grain must be ${REVIEW_GRAIN}`)
  if (item.decision_type !== 'anchor_group_item_level_source_review_ready') {
    errors.push(`${prefix} decision_type must be anchor_group_item_level_source_review_ready`)
  }
  if (item.item_review_surface !== 'anchor_group_item_level_source_review_ready') {
    errors.push(`${prefix} item_review_surface must be anchor_group_item_level_source_review_ready`)
  }
  if (sourceRow.bridge_context?.page_ready !== true) errors.push(`${prefix} source row must be page-ready`)
  if (!Array.isArray(item.source_review_risk_flags) || !item.source_review_risk_flags.length) {
    errors.push(`${prefix} source_review_risk_flags must be non-empty`)
  }
  if (sourceRow.unit_context?.unit_evidence_id !== item.unit_context?.unit_evidence_id) {
    errors.push(`${prefix} unit_evidence_id mismatch`)
  }

  stats.source_anchor_review_rows += 1
  countInto(stats.by_action_family, item.action_family)
  countInto(stats.by_anchor_type, item.anchor_type)
  countInto(stats.by_grade_band, item.grade_band)
  countInto(stats.by_page_range_status, item.bridge_context?.page_range_status)
  countInto(stats.by_priority_tier, item.priority_tier)
  countInto(stats.by_subject, item.subject_slug)
  for (const flag of item.source_review_risk_flags || []) countInto(stats.by_risk_flag, flag)
  stats.parent_work_item_ids.add(item.parent_action_work_item_id)
  stats.source_keys.add(item.source_key)
}

function sameObject(actual, expected) {
  return JSON.stringify(stable(actual || {})) === JSON.stringify(stable(expected || {}))
}

function auditSummaryMap(summary, stats, key, errors) {
  if (!sameObject(summary[key], stats[key])) errors.push(`summary.${key} mismatch`)
}

function auditSummary(batch, stats, errors) {
  const summary = batch.summary || {}
  if (summary.source_review_ready_items !== stats.source_review_ready_items) errors.push('summary.source_review_ready_items mismatch')
  if (summary.source_anchor_review_rows !== stats.source_anchor_review_rows) errors.push('summary.source_anchor_review_rows mismatch')
  if (summary.parent_work_items !== stats.parent_work_item_ids.size) errors.push('summary.parent_work_items mismatch')
  if (summary.unique_source_keys !== stats.source_keys.size) errors.push('summary.unique_source_keys mismatch')
  for (const key of ['by_action_family', 'by_anchor_type', 'by_grade_band', 'by_page_range_status', 'by_priority_tier', 'by_risk_flag', 'by_subject']) {
    auditSummaryMap(summary, stats, key, errors)
  }
}

function markdownSummary(payload) {
  return `# H4G Item-Level Source Review Ready Batch Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected ready items | ${payload.summary.expected_source_review_ready_items} |
| source review ready items | ${payload.summary.source_review_ready_items} |
| missing ready items | ${payload.summary.missing_source_review_ready_items} |
| extra ready items | ${payload.summary.extra_source_review_ready_items} |
| parent work items | ${payload.summary.parent_work_items} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |

## Grade Bands

| grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

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
    ['split batch', args.splitBatch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const batch = errors.length ? { source_review_ready_items: [] } : readJson(args.batch)
  const worklist = errors.length ? { item_review_action_work_items: [] } : readJson(args.worklist)
  const splitBatch = errors.length ? { split_review_items: [] } : readJson(args.splitBatch)
  if (!errors.length) validateTopLevel(batch, worklist, splitBatch, args, errors)

  const splitRowsById = sourceRowsBySplitItemId(splitBatch, errors)
  const expected = expectedRows(worklist, splitRowsById, args, errors)
  const expectedByKey = mapBy(expected, 'expected_id_key', errors, 'expected source review ready rows')
  const actualRows = batch.source_review_ready_items || []
  const actualByKey = mapBy(actualRows.map(row => ({
    ...row,
    expected_id_key: `${row.parent_action_work_item_id}|${row.source_anchor_review_item_id}`
  })), 'expected_id_key', errors, 'batch')
  const stats = {
    by_action_family: {},
    by_anchor_type: {},
    by_grade_band: {},
    by_page_range_status: {},
    by_priority_tier: {},
    by_risk_flag: {},
    by_subject: {},
    expected_source_review_ready_items: expected.length,
    extra_source_review_ready_items: 0,
    missing_source_review_ready_items: 0,
    parent_work_item_ids: new Set(),
    source_anchor_review_rows: 0,
    source_keys: new Set(),
    source_review_ready_items: actualRows.length
  }

  for (const item of actualRows) {
    auditItem(item, expectedByKey.get(`${item.parent_action_work_item_id}|${item.source_anchor_review_item_id}`), errors, stats)
  }
  for (const row of expected) {
    if (!actualByKey.has(row.expected_id_key)) {
      stats.missing_source_review_ready_items += 1
      errors.push(`${row.expected_id_key} missing source review ready item`)
    }
  }
  for (const item of actualRows) {
    if (!expectedByKey.has(`${item.parent_action_work_item_id}|${item.source_anchor_review_item_id}`)) {
      stats.extra_source_review_ready_items += 1
    }
  }
  if (args.requireItems && !expected.length) errors.push('requireItems is set but expected source review ready rows are empty')
  if (args.requireItems && !actualRows.length) errors.push('requireItems is set but batch has no source_review_ready_items')
  auditSummary(batch, stats, errors)

  return {
    batch: args.batch,
    errors,
    generated_at: new Date().toISOString(),
    require_items: args.requireItems,
    source_split_batch: args.splitBatch,
    summary: {
      by_action_family: stats.by_action_family,
      by_anchor_type: stats.by_anchor_type,
      by_grade_band: stats.by_grade_band,
      by_page_range_status: stats.by_page_range_status,
      by_priority_tier: stats.by_priority_tier,
      by_risk_flag: stats.by_risk_flag,
      by_subject: stats.by_subject,
      expected_source_review_ready_items: stats.expected_source_review_ready_items,
      extra_source_review_ready_items: stats.extra_source_review_ready_items,
      missing_source_review_ready_items: stats.missing_source_review_ready_items,
      parent_work_items: stats.parent_work_item_ids.size,
      source_anchor_review_rows: stats.source_anchor_review_rows,
      source_review_ready_items: stats.source_review_ready_items,
      unique_source_keys: stats.source_keys.size
    },
    valid: errors.length === 0,
    worklist: args.worklist
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
