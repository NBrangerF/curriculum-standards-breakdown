#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_EVIDENCE_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch_anchor_domain_rejected_english_pe_audit.md'

const WORK_QUEUE = 'missing_grade_textbook_unit_indexing_queue'
const RECOMMENDATION = 'needs_textbook_unit_indexing'
const REVIEW_GRAIN = 'progression_group+anchor_type+target_missing_grade_band+target_standard_code'

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    maxRank: Number.POSITIVE_INFINITY,
    minRank: 1,
    out: DEFAULT_OUT,
    requireItems: false,
    sourceEvidenceBatch: DEFAULT_SOURCE_EVIDENCE_BATCH,
    strict: false,
    subjects: null,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
    else if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--source-evidence-batch') args.sourceEvidenceBatch = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch_anchor_domain_rejected_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json \\
  --source-evidence-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the H4G missing-grade textbook unit indexing batch against the
item-review action worklist and upstream source evidence batch.`)
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

function expectedRows(worklist, args) {
  const rows = []
  for (const workItem of selectedWorkItems(worklist, args)) {
    for (const standard of workItem.target_missing_grade_standards || []) {
      rows.push({
        expected_key: `${workItem.action_work_item_id}|${standard.code || standard.id}`,
        targetStandard: standard,
        workItem
      })
    }
  }
  return rows
}

function validateTopLevel(batch, worklist, sourceEvidenceBatch, args, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch') {
    errors.push('batch purpose must be h4g_subject_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch')
  }
  if (batch.worklist_only !== true) errors.push('batch worklist_only must be true')
  if (batch.source_anchor_group_item_review_action_worklist !== args.worklist) {
    errors.push('batch source_anchor_group_item_review_action_worklist must match audit arg')
  }
  if (batch.source_anchor_group_source_evidence_batch !== args.sourceEvidenceBatch) {
    errors.push('batch source_anchor_group_source_evidence_batch must match audit arg')
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
  if (sourceEvidenceBatch.valid !== true) errors.push('source evidence batch valid must be true')
  if (sourceEvidenceBatch.purpose !== 'h4g_subject_theme_bridge_anchor_group_source_evidence_batch') {
    errors.push('source evidence batch purpose must be h4g_subject_theme_bridge_anchor_group_source_evidence_batch')
  }
}

function auditPolicy(item, prefix, errors) {
  if (item.worklist_only !== true) errors.push(`${prefix} worklist_only must be true`)
  if (item.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
  const policy = item.publication_policy || {}
  for (const key of [
    'item_level_decision_gate_required',
    'missing_grade_unit_indexing_is_not_approval',
    'read_only_missing_grade_unit_indexing_batch',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'source_decision_must_be_edited_separately'
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
    'missing_grade_units_indexed_for_later_source_review',
    'missing_grade_units_not_found',
    'target_standard_requires_manual_scope_review'
  ]) {
    if (!allowed.includes(value)) errors.push(`${prefix} review_decision_template.allowed_review_outcomes missing ${value}`)
  }
  for (const forbidden of ['approve_standard_scoped_subject_theme_bridge', 'matcher_ready', 'publication_ready']) {
    if (allowed.includes(forbidden)) errors.push(`${prefix} review_decision_template must not include ${forbidden}`)
  }
  const confirmations = template.required_confirmations || {}
  if (confirmations.item_level_decision_still_required !== true) errors.push(`${prefix} item_level_decision_still_required must be true`)
  if (confirmations.target_missing_grade_standard_checked !== true) errors.push(`${prefix} target_missing_grade_standard_checked must be true`)
  if (confirmations.missing_grade_textbook_units_indexed !== false) {
    errors.push(`${prefix} missing_grade_textbook_units_indexed must start false`)
  }
  if (confirmations.no_public_write_requested !== true) errors.push(`${prefix} no_public_write_requested must be true`)
  if (confirmations.official_standard_text_preserved !== true) errors.push(`${prefix} official_standard_text_preserved must be true`)
}

function auditItem(item, expected, sourceEvidenceById, errors, stats) {
  const prefix = item.missing_grade_unit_indexing_item_id || item.parent_action_work_item_id || '(missing indexing item)'
  if (!item.missing_grade_unit_indexing_item_id) errors.push(`${prefix} missing missing_grade_unit_indexing_item_id`)
  auditPolicy(item, prefix, errors)
  auditDecisionTemplate(item, prefix, errors)
  if (!expected) {
    errors.push(`${prefix} indexing item not found in expected worklist selection`)
    return
  }
  const workItem = expected.workItem
  const target = expected.targetStandard
  const sourceItem = sourceEvidenceById.get(workItem.source_batch_item_id)
  if (!sourceItem) errors.push(`${prefix} source evidence item not found: ${workItem.source_batch_item_id}`)
  const checks = [
    ['parent_action_work_item_id', item.parent_action_work_item_id, workItem.action_work_item_id],
    ['parent_decision_id', item.parent_decision_id, workItem.decision_id],
    ['parent_source_batch_item_id', item.parent_source_batch_item_id, workItem.source_batch_item_id],
    ['progression_group_id', item.progression_group_id, workItem.progression_group_id],
    ['subject_slug', item.subject_slug, workItem.subject_slug],
    ['priority_rank', item.priority_rank, workItem.priority_rank],
    ['priority_tier', item.priority_tier, workItem.priority_tier],
    ['source_standard_code', item.source_standard_code, workItem.standard_code],
    ['target_standard_code', item.target_standard_code, target.code || target.id],
    ['grade_band_to_index', item.grade_band_to_index, target.grade_band]
  ]
  for (const [field, actual, expectedValue] of checks) {
    if (String(actual ?? '') !== String(expectedValue ?? '')) errors.push(`${prefix} ${field} must match source`)
  }
  if (!(workItem.missing_grade_bands || []).includes(item.grade_band_to_index)) {
    errors.push(`${prefix} grade_band_to_index must be in source missing_grade_bands`)
  }
  if (item.review_grain !== REVIEW_GRAIN) errors.push(`${prefix} review_grain must be ${REVIEW_GRAIN}`)
  if (item.item_review_surface !== 'anchor_group_missing_grade_textbook_unit_indexing') {
    errors.push(`${prefix} item_review_surface must be anchor_group_missing_grade_textbook_unit_indexing`)
  }
  if (sourceItem && item.anchor_type !== sourceItem.anchor_type) errors.push(`${prefix} anchor_type must match source evidence batch`)
  if (!Array.isArray(item.existing_source_anchor_review_items) || !item.existing_source_anchor_review_items.length) {
    errors.push(`${prefix} existing_source_anchor_review_items must be non-empty`)
  }

  stats.existing_source_anchor_review_rows += (item.existing_source_anchor_review_items || []).length
  countInto(stats.by_anchor_type, item.anchor_type)
  countInto(stats.by_grade_band_to_index, item.grade_band_to_index)
  countInto(stats.by_priority_tier, item.priority_tier)
  countInto(stats.by_subject, item.subject_slug)
  for (const gradeBand of item.existing_grade_bands || []) countInto(stats.by_existing_grade_band, gradeBand)
  stats.parent_work_item_ids.add(item.parent_action_work_item_id)
  stats.target_standard_codes.add(item.target_standard_code)
}

function auditSummary(batch, stats, errors) {
  const summary = batch.summary || {}
  if (summary.missing_grade_unit_indexing_items !== stats.missing_grade_unit_indexing_items) {
    errors.push('summary.missing_grade_unit_indexing_items mismatch')
  }
  if (summary.parent_work_items !== stats.parent_work_item_ids.size) errors.push('summary.parent_work_items mismatch')
  if (summary.target_standards_to_index !== stats.target_standard_codes.size) errors.push('summary.target_standards_to_index mismatch')
  if (summary.existing_source_anchor_review_rows !== stats.existing_source_anchor_review_rows) {
    errors.push('summary.existing_source_anchor_review_rows mismatch')
  }
}

function markdownSummary(payload) {
  return `# H4G Missing-Grade Textbook Unit Indexing Batch Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected indexing items | ${payload.summary.expected_missing_grade_unit_indexing_items} |
| indexing items | ${payload.summary.missing_grade_unit_indexing_items} |
| missing indexing items | ${payload.summary.missing_indexing_items} |
| extra indexing items | ${payload.summary.extra_indexing_items} |
| parent work items | ${payload.summary.parent_work_items} |
| target standards to index | ${payload.summary.target_standards_to_index} |

## Missing Grade Bands

| grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band_to_index)}

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
    ['source evidence batch', args.sourceEvidenceBatch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const batch = errors.length ? { missing_grade_unit_indexing_items: [] } : readJson(args.batch)
  const worklist = errors.length ? { item_review_action_work_items: [] } : readJson(args.worklist)
  const sourceEvidenceBatch = errors.length ? { source_evidence_request_items: [] } : readJson(args.sourceEvidenceBatch)
  if (!errors.length) validateTopLevel(batch, worklist, sourceEvidenceBatch, args, errors)

  const expected = expectedRows(worklist, args)
  const expectedByKey = mapBy(expected, 'expected_key', errors, 'expected indexing rows')
  const actualRows = batch.missing_grade_unit_indexing_items || []
  const actualByKey = mapBy(actualRows.map(row => ({
    ...row,
    expected_key: `${row.parent_action_work_item_id}|${row.target_standard_code}`
  })), 'expected_key', errors, 'batch')
  const sourceEvidenceById = mapBy(sourceEvidenceBatch.source_evidence_request_items || [], 'source_evidence_request_item_id', errors, 'source evidence batch')
  const stats = {
    by_anchor_type: {},
    by_existing_grade_band: {},
    by_grade_band_to_index: {},
    by_priority_tier: {},
    by_subject: {},
    existing_source_anchor_review_rows: 0,
    expected_missing_grade_unit_indexing_items: expected.length,
    extra_indexing_items: 0,
    missing_grade_unit_indexing_items: actualRows.length,
    missing_indexing_items: 0,
    parent_work_item_ids: new Set(),
    target_standard_codes: new Set()
  }

  for (const item of actualRows) {
    auditItem(item, expectedByKey.get(`${item.parent_action_work_item_id}|${item.target_standard_code}`), sourceEvidenceById, errors, stats)
  }
  for (const row of expected) {
    if (!actualByKey.has(row.expected_key)) {
      stats.missing_indexing_items += 1
      errors.push(`${row.expected_key} missing indexing item`)
    }
  }
  for (const item of actualRows) {
    if (!expectedByKey.has(`${item.parent_action_work_item_id}|${item.target_standard_code}`)) stats.extra_indexing_items += 1
  }
  if (args.requireItems && !expected.length) errors.push('requireItems is set but expected indexing rows are empty')
  if (args.requireItems && !actualRows.length) errors.push('requireItems is set but batch has no missing_grade_unit_indexing_items')
  auditSummary(batch, stats, errors)

  return {
    batch: args.batch,
    errors,
    generated_at: new Date().toISOString(),
    require_items: args.requireItems,
    source_evidence_batch: args.sourceEvidenceBatch,
    summary: {
      by_anchor_type: stats.by_anchor_type,
      by_existing_grade_band: stats.by_existing_grade_band,
      by_grade_band_to_index: stats.by_grade_band_to_index,
      by_priority_tier: stats.by_priority_tier,
      by_subject: stats.by_subject,
      existing_source_anchor_review_rows: stats.existing_source_anchor_review_rows,
      expected_missing_grade_unit_indexing_items: stats.expected_missing_grade_unit_indexing_items,
      extra_indexing_items: stats.extra_indexing_items,
      missing_grade_unit_indexing_items: stats.missing_grade_unit_indexing_items,
      missing_indexing_items: stats.missing_indexing_items,
      parent_work_items: stats.parent_work_item_ids.size,
      target_standards_to_index: stats.target_standard_codes.size
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
