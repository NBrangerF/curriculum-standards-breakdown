#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe_audit.md'

const WORK_QUEUE = 'downstream_manual_scope_indexing_queue'
const RECOMMENDATION = 'target_standard_requires_manual_scope_review'
const REVIEW_GRAIN = 'progression_group+target_grade_band+target_standard_code+source_batch_item_id'

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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the downstream manual scope/indexing batch against the downstream
action worklist and editable downstream decisions template.`)
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

function arraysMatch(actual, expected) {
  const a = sorted(actual || [])
  const b = sorted(expected || [])
  return a.join('|') === b.join('|')
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

function selectedWorkItems(worklist, args) {
  const subjectSet = args.subjects ? new Set(args.subjects) : null
  return (worklist.downstream_action_work_items || [])
    .filter(item => item.work_queue === WORK_QUEUE)
    .filter(item => item.recommended_reviewer_decision === RECOMMENDATION)
    .filter(item => Number(item.priority_rank || 0) >= args.minRank)
    .filter(item => Number(item.priority_rank || 0) <= args.maxRank)
    .filter(item => !subjectSet || subjectSet.has(item.subject_slug || ''))
}

function sourceKey(workItem) {
  return [
    workItem.progression_group_id || '',
    workItem.grade_band || '',
    workItem.target_standard_code || workItem.standard_code || '',
    workItem.source_batch_item_id || ''
  ].join('|')
}

function validateTopLevel(batch, worklist, decisions, args, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch') {
    errors.push('batch purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch')
  }
  if (batch.worklist_only !== true) errors.push('batch worklist_only must be true')
  if (batch.source_downstream_action_worklist !== args.worklist) {
    errors.push('batch source_downstream_action_worklist must match audit arg')
  }
  if (batch.source_downstream_decisions !== args.decisions) {
    errors.push('batch source_downstream_decisions must match audit arg')
  }
  if (batch.selection?.work_queue !== WORK_QUEUE) errors.push(`batch selection.work_queue must be ${WORK_QUEUE}`)
  if (batch.selection?.recommendation !== RECOMMENDATION) errors.push(`batch selection.recommendation must be ${RECOMMENDATION}`)
  if (batch.selection?.min_rank !== args.minRank) errors.push('batch selection.min_rank must match audit arg')
  const expectedMax = args.maxRank === Number.POSITIVE_INFINITY ? 'all' : args.maxRank
  if (batch.selection?.max_rank !== expectedMax) errors.push('batch selection.max_rank must match audit arg')
  const expectedSubjects = args.subjects || ['all']
  const actualSubjects = batch.selection?.subjects || []
  if (actualSubjects.join(',') !== expectedSubjects.join(',')) errors.push('batch selection.subjects must match audit arg')

  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_worklist')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  if (worklist.source_downstream_decisions !== args.decisions) {
    errors.push('worklist source_downstream_decisions must match audit arg')
  }
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template')
  }
  validatePolicy('batch', batch, errors)
  validatePolicy('worklist', worklist, errors)
  validatePolicy('decisions', decisions, errors)
}

function auditIndexingPolicy(item, prefix, errors) {
  if (item.worklist_only !== true) errors.push(`${prefix} worklist_only must be true`)
  if (item.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
  const policy = item.manual_scope_indexing_policy || {}
  for (const key of [
    'downstream_decision_must_be_edited_separately',
    'item_level_decision_gate_required',
    'manual_scope_indexing_batch_is_not_approval',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_later_source_anchor_review'
  ]) {
    if (policy[key] !== true) errors.push(`${prefix} manual_scope_indexing_policy.${key} must be true`)
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'eligible_for_h4g_differentiation',
    'direct_matcher_use',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (policy[key] !== false) errors.push(`${prefix} manual_scope_indexing_policy.${key} must be false`)
  }
}

function auditDecisionTemplate(item, decision, prefix, errors) {
  const template = item.review_decision_template || {}
  const allowed = template.allowed_review_outcomes || []
  for (const value of [
    'missing_grade_units_indexed_for_later_source_review',
    'missing_grade_units_not_found',
    'target_standard_requires_manual_scope_review'
  ]) {
    if (!allowed.includes(value)) errors.push(`${prefix} allowed_review_outcomes missing ${value}`)
  }
  for (const value of allowed) {
    if (!(decision.allowed_decisions || []).includes(value)) {
      errors.push(`${prefix} allowed_review_outcomes must come from downstream decision allowed_decisions: ${value}`)
    }
  }
  for (const forbidden of ['matcher_ready', 'publication_ready', 'approve_standard_scoped_subject_theme_bridge']) {
    if (allowed.includes(forbidden)) errors.push(`${prefix} review template must not include ${forbidden}`)
  }
  const confirmations = template.required_confirmations || {}
  if (confirmations.item_level_decision_still_required !== true) errors.push(`${prefix} item_level_decision_still_required must be true`)
  if (confirmations.missing_grade_textbook_units_indexed !== false) errors.push(`${prefix} missing_grade_textbook_units_indexed must start false`)
  if (confirmations.no_public_write_requested !== true) errors.push(`${prefix} no_public_write_requested must be true`)
  if (confirmations.official_standard_text_preserved !== true) errors.push(`${prefix} official_standard_text_preserved must be true`)
  if (confirmations.same_grade_scope_checked !== false) errors.push(`${prefix} same_grade_scope_checked must start false`)
  if (confirmations.source_anchor_specificity_still_required !== true) {
    errors.push(`${prefix} source_anchor_specificity_still_required must be true`)
  }
  if (confirmations.target_missing_grade_standard_checked !== true) {
    errors.push(`${prefix} target_missing_grade_standard_checked must be true`)
  }
  if (template.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (template.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (template.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
}

function auditItem(item, workItem, decision, errors, stats) {
  const prefix = item.manual_scope_indexing_item_id || item.parent_downstream_action_work_item_id || '(missing manual scope/indexing item)'
  if (!item.manual_scope_indexing_item_id) errors.push(`${prefix} missing manual_scope_indexing_item_id`)
  auditIndexingPolicy(item, prefix, errors)
  if (!workItem) {
    errors.push(`${prefix} manual scope/indexing item not found in expected worklist selection`)
    return
  }
  if (!decision) {
    errors.push(`${prefix} downstream decision not found`)
    return
  }
  auditDecisionTemplate(item, decision, prefix, errors)
  const expectedTargetStandardCode = workItem.target_standard_code || workItem.standard_code || ''
  const checks = [
    ['parent_downstream_action_work_item_id', item.parent_downstream_action_work_item_id, workItem.downstream_action_work_item_id],
    ['downstream_decision_id', item.downstream_decision_id, workItem.decision_id],
    ['parent_action_work_item_id', item.parent_action_work_item_id, workItem.parent_action_work_item_id],
    ['parent_decision_id', item.parent_decision_id, workItem.parent_decision_id],
    ['parent_source_batch_item_id', item.parent_source_batch_item_id, workItem.parent_source_batch_item_id],
    ['source_batch_item_id', item.source_batch_item_id, workItem.source_batch_item_id],
    ['source_batch_item_type', item.source_batch_item_type, workItem.source_batch_item_type],
    ['source_batch', item.source_batch, workItem.source_batch],
    ['standard_code', item.standard_code, workItem.standard_code],
    ['target_standard_code', item.target_standard_code, expectedTargetStandardCode],
    ['grade_band', item.grade_band, workItem.grade_band],
    ['target_grade_band', item.target_grade_band, workItem.grade_band],
    ['priority_rank', item.priority_rank, workItem.priority_rank],
    ['priority_tier', item.priority_tier, workItem.priority_tier],
    ['progression_group_id', item.progression_group_id, workItem.progression_group_id],
    ['subject_slug', item.subject_slug, workItem.subject_slug],
    ['recommended_reviewer_decision', item.recommended_reviewer_decision, workItem.recommended_reviewer_decision],
    ['recommendation_confidence', item.recommendation_confidence, workItem.recommendation_confidence],
    ['source_anchor_review_rows', item.source_anchor_review_rows, workItem.source_anchor_review_rows]
  ]
  for (const [field, actual, expectedValue] of checks) {
    if (String(actual ?? '') !== String(expectedValue ?? '')) errors.push(`${prefix} ${field} must match source work item`)
  }
  const expectedSourceStandardCode = workItem.source_standard_code || decision.source_standard_code || workItem.source_context?.source_standard_context?.code || ''
  if (String(item.source_standard_code || '') !== String(expectedSourceStandardCode || '')) {
    errors.push(`${prefix} source_standard_code must match source work item or downstream decision`)
  }
  if (item.review_grain !== REVIEW_GRAIN) errors.push(`${prefix} review_grain must be ${REVIEW_GRAIN}`)
  if (item.decision_type !== 'anchor_group_downstream_manual_scope_indexing') {
    errors.push(`${prefix} decision_type must be anchor_group_downstream_manual_scope_indexing`)
  }
  if (item.source_batch !== 'missing_grade_unit_indexing') errors.push(`${prefix} source_batch must be missing_grade_unit_indexing`)
  if (item.source_batch_item_type !== 'missing_grade_unit_indexing_item') {
    errors.push(`${prefix} source_batch_item_type must be missing_grade_unit_indexing_item`)
  }
  if (!expectedTargetStandardCode) errors.push(`${prefix} target_standard_code must be present`)
  if (expectedTargetStandardCode && item.standard_code !== item.target_standard_code) {
    errors.push(`${prefix} standard_code must equal target_standard_code for manual scope/indexing`)
  }
  if (!arraysMatch(item.existing_grade_bands, workItem.source_context?.existing_grade_bands || [])) {
    errors.push(`${prefix} existing_grade_bands must match source work item`)
  }
  if (item.source_key !== sourceKey(workItem)) errors.push(`${prefix} source_key must match source work item`)
  if (!(workItem.allowed_decisions || []).includes(RECOMMENDATION)) {
    errors.push(`${prefix} source work item allowed_decisions must include ${RECOMMENDATION}`)
  }
  if (!(decision.allowed_decisions || []).includes(RECOMMENDATION)) {
    errors.push(`${prefix} downstream decision allowed_decisions must include ${RECOMMENDATION}`)
  }
  if (item.target_standard_context?.code && item.target_standard_context.code !== item.target_standard_code) {
    errors.push(`${prefix} target_standard_context.code must match target_standard_code`)
  }
  for (const confirmation of ['missing_grade_textbook_units_indexed', 'same_grade_scope_checked']) {
    if (!(item.required_confirmations_to_close || []).includes(confirmation)) {
      errors.push(`${prefix} required_confirmations_to_close must include ${confirmation}`)
    }
  }

  stats.source_anchor_review_rows += Number(item.source_anchor_review_rows || 0)
  countInto(stats.by_priority_tier, item.priority_tier)
  countInto(stats.by_source_batch, item.source_batch)
  countInto(stats.by_source_standard_code, item.source_standard_code)
  countInto(stats.by_subject, item.subject_slug)
  countInto(stats.by_target_grade_band, item.target_grade_band)
  countInto(stats.by_target_standard_code, item.target_standard_code)
  for (const gradeBand of item.existing_grade_bands || []) countInto(stats.by_existing_grade_band, gradeBand)
}

function auditSummary(batch, stats, errors) {
  const summary = batch.summary || {}
  for (const key of [
    'manual_scope_indexing_items',
    'parent_downstream_work_items',
    'source_anchor_review_rows',
    'unique_progression_groups',
    'unique_source_keys',
    'unique_target_standard_codes'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`summary.${key} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Downstream Manual Scope/Indexing Batch Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected manual scope/indexing items | ${payload.summary.expected_manual_scope_indexing_items} |
| manual scope/indexing items | ${payload.summary.manual_scope_indexing_items} |
| missing manual scope/indexing items | ${payload.summary.missing_manual_scope_indexing_items} |
| extra manual scope/indexing items | ${payload.summary.extra_manual_scope_indexing_items} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| unique source keys | ${payload.summary.unique_source_keys} |

## Target Grade Bands

| target grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_target_grade_band)}

## Target Standards

| target standard code | rows |
| --- | ---: |
${countRows(payload.summary.by_target_standard_code)}

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
  const batch = errors.length ? { manual_scope_indexing_items: [] } : readJson(args.batch)
  const worklist = errors.length ? { downstream_action_work_items: [] } : readJson(args.worklist)
  const decisions = errors.length ? { downstream_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(batch, worklist, decisions, args, errors)

  const selected = selectedWorkItems(worklist, args)
  const workItemById = mapBy(selected, 'downstream_action_work_item_id', errors, 'expected worklist selection')
  const decisionById = mapBy(decisions.downstream_decisions || [], 'decision_id', errors, 'decisions')
  const itemByWorkItemId = mapBy(batch.manual_scope_indexing_items || [], 'parent_downstream_action_work_item_id', errors, 'batch')
  const stats = {
    by_existing_grade_band: {},
    by_priority_tier: {},
    by_source_batch: {},
    by_source_standard_code: {},
    by_subject: {},
    by_target_grade_band: {},
    by_target_standard_code: {},
    expected_manual_scope_indexing_items: selected.length,
    extra_manual_scope_indexing_items: 0,
    manual_scope_indexing_items: (batch.manual_scope_indexing_items || []).length,
    missing_manual_scope_indexing_items: 0,
    parent_downstream_work_items: sorted((batch.manual_scope_indexing_items || []).map(item => item.parent_downstream_action_work_item_id)).length,
    source_anchor_review_rows: 0,
    unique_progression_groups: sorted((batch.manual_scope_indexing_items || []).map(item => item.progression_group_id)).length,
    unique_source_keys: sorted((batch.manual_scope_indexing_items || []).map(item => item.source_key)).length,
    unique_target_standard_codes: sorted((batch.manual_scope_indexing_items || []).map(item => item.target_standard_code)).length
  }

  for (const item of batch.manual_scope_indexing_items || []) {
    const workItem = workItemById.get(item.parent_downstream_action_work_item_id)
    const decision = decisionById.get(item.downstream_decision_id)
    auditItem(item, workItem, decision, errors, stats)
  }
  for (const workItem of selected) {
    if (!itemByWorkItemId.has(workItem.downstream_action_work_item_id)) {
      stats.missing_manual_scope_indexing_items += 1
      errors.push(`${workItem.downstream_action_work_item_id} missing manual scope/indexing item`)
    }
  }
  for (const item of batch.manual_scope_indexing_items || []) {
    if (!workItemById.has(item.parent_downstream_action_work_item_id)) stats.extra_manual_scope_indexing_items += 1
  }
  if (args.requireItems && !selected.length) {
    errors.push('requireItems is set but expected worklist selection is empty')
  }
  if (args.requireItems && !(batch.manual_scope_indexing_items || []).length) {
    errors.push('requireItems is set but batch has no manual_scope_indexing_items')
  }
  auditSummary(batch, stats, errors)

  return {
    batch: args.batch,
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
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
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
