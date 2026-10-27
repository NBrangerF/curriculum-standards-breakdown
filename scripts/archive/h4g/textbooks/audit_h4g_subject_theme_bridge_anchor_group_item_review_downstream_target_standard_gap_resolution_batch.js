#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch_anchor_domain_rejected_english_pe_audit.md'

const WORK_QUEUE = 'downstream_target_standard_gap_resolution_queue'
const RECOMMENDATION = 'target_standard_gap_confirmed'
const REVIEW_GRAIN = 'progression_group+missing_grade_band+source_standard_code'

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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch_anchor_domain_rejected_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the downstream target-standard gap resolution batch against the
downstream action worklist and editable downstream decisions template.`)
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
    workItem.standard_code || '',
    workItem.source_batch_item_id || ''
  ].join('|')
}

function validateTopLevel(batch, worklist, decisions, args, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch') {
    errors.push('batch purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch')
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

function auditResolutionPolicy(item, prefix, errors) {
  if (item.worklist_only !== true) errors.push(`${prefix} worklist_only must be true`)
  if (item.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
  const policy = item.resolution_policy || {}
  for (const key of [
    'downstream_decision_must_be_edited_separately',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'target_standard_gap_resolution_batch_is_not_approval',
    'target_standard_gap_resolution_is_later_gate_input'
  ]) {
    if (policy[key] !== true) errors.push(`${prefix} resolution_policy.${key} must be true`)
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'eligible_for_h4g_differentiation',
    'direct_matcher_use',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (policy[key] !== false) errors.push(`${prefix} resolution_policy.${key} must be false`)
  }
}

function auditDecisionTemplate(item, prefix, errors) {
  const template = item.review_decision_template || {}
  const allowed = template.allowed_review_outcomes || []
  for (const value of [
    'target_standard_gap_confirmed',
    'target_standard_exists_elsewhere',
    'progression_group_scope_needs_revision',
    'missing_grade_not_applicable'
  ]) {
    if (!allowed.includes(value)) errors.push(`${prefix} allowed_review_outcomes missing ${value}`)
  }
  for (const forbidden of ['matcher_ready', 'publication_ready', 'approve_standard_scoped_subject_theme_bridge']) {
    if (allowed.includes(forbidden)) errors.push(`${prefix} review template must not include ${forbidden}`)
  }
  const confirmations = template.required_confirmations || {}
  if (confirmations.item_level_decision_still_required !== true) errors.push(`${prefix} item_level_decision_still_required must be true`)
  if (confirmations.no_public_write_requested !== true) errors.push(`${prefix} no_public_write_requested must be true`)
  if (confirmations.official_standard_text_preserved !== true) errors.push(`${prefix} official_standard_text_preserved must be true`)
  if (confirmations.source_anchor_evidence_search_deferred !== true) {
    errors.push(`${prefix} source_anchor_evidence_search_deferred must be true`)
  }
  if (confirmations.progression_group_scope_checked !== false) errors.push(`${prefix} progression_group_scope_checked must start false`)
  if (confirmations.target_missing_grade_standard_absent_checked !== false) {
    errors.push(`${prefix} target_missing_grade_standard_absent_checked must start false`)
  }
  if (template.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (template.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (template.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
}

function auditItem(item, workItem, decision, errors, stats) {
  const prefix = item.target_standard_gap_resolution_item_id || item.parent_downstream_action_work_item_id || '(missing target gap resolution item)'
  if (!item.target_standard_gap_resolution_item_id) errors.push(`${prefix} missing target_standard_gap_resolution_item_id`)
  auditResolutionPolicy(item, prefix, errors)
  auditDecisionTemplate(item, prefix, errors)
  if (!workItem) {
    errors.push(`${prefix} target-standard gap resolution item not found in expected worklist selection`)
    return
  }
  if (!decision) {
    errors.push(`${prefix} downstream decision not found`)
    return
  }
  const checks = [
    ['parent_downstream_action_work_item_id', item.parent_downstream_action_work_item_id, workItem.downstream_action_work_item_id],
    ['downstream_decision_id', item.downstream_decision_id, workItem.decision_id],
    ['parent_action_work_item_id', item.parent_action_work_item_id, workItem.parent_action_work_item_id],
    ['parent_decision_id', item.parent_decision_id, workItem.parent_decision_id],
    ['parent_source_batch_item_id', item.parent_source_batch_item_id, workItem.parent_source_batch_item_id],
    ['source_batch_item_id', item.source_batch_item_id, workItem.source_batch_item_id],
    ['source_batch_item_type', item.source_batch_item_type, workItem.source_batch_item_type],
    ['source_batch', item.source_batch, workItem.source_batch],
    ['source_standard_code', item.source_standard_code, workItem.standard_code],
    ['standard_code', item.standard_code, workItem.standard_code],
    ['target_standard_code', item.target_standard_code, workItem.target_standard_code],
    ['grade_band', item.grade_band, workItem.grade_band],
    ['missing_grade_band', item.missing_grade_band, workItem.grade_band],
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
  if (item.review_grain !== REVIEW_GRAIN) errors.push(`${prefix} review_grain must be ${REVIEW_GRAIN}`)
  if (item.decision_type !== 'anchor_group_downstream_target_standard_gap_resolution') {
    errors.push(`${prefix} decision_type must be anchor_group_downstream_target_standard_gap_resolution`)
  }
  if (item.source_batch !== 'target_standard_gap') errors.push(`${prefix} source_batch must be target_standard_gap`)
  if (item.source_batch_item_type !== 'target_standard_gap_item') {
    errors.push(`${prefix} source_batch_item_type must be target_standard_gap_item`)
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
  if (item.source_standard_context?.code !== item.source_standard_code) {
    errors.push(`${prefix} source_standard_context.code must match source_standard_code`)
  }
  if (item.target_standard_code) errors.push(`${prefix} target_standard_code must be empty for a target-standard gap`)

  stats.source_anchor_review_rows += Number(item.source_anchor_review_rows || 0)
  countInto(stats.by_missing_grade_band, item.missing_grade_band)
  countInto(stats.by_priority_tier, item.priority_tier)
  countInto(stats.by_source_batch, item.source_batch)
  countInto(stats.by_source_standard_code, item.source_standard_code)
  countInto(stats.by_subject, item.subject_slug)
  for (const gradeBand of item.existing_grade_bands || []) countInto(stats.by_existing_grade_band, gradeBand)
}

function auditSummary(batch, stats, errors) {
  const summary = batch.summary || {}
  for (const key of [
    'parent_downstream_work_items',
    'source_anchor_review_rows',
    'target_standard_gap_resolution_items',
    'unique_progression_groups',
    'unique_source_keys',
    'unique_source_standard_codes'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`summary.${key} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Downstream Target Standard Gap Resolution Batch Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected target-standard gap resolution items | ${payload.summary.expected_target_standard_gap_resolution_items} |
| target-standard gap resolution items | ${payload.summary.target_standard_gap_resolution_items} |
| missing resolution items | ${payload.summary.missing_resolution_items} |
| extra resolution items | ${payload.summary.extra_resolution_items} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| unique source keys | ${payload.summary.unique_source_keys} |

## Missing Grade Bands

| missing grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_missing_grade_band)}

## Source Standards

| source standard code | rows |
| --- | ---: |
${countRows(payload.summary.by_source_standard_code)}

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
  const batch = errors.length ? { target_standard_gap_resolution_items: [] } : readJson(args.batch)
  const worklist = errors.length ? { downstream_action_work_items: [] } : readJson(args.worklist)
  const decisions = errors.length ? { downstream_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(batch, worklist, decisions, args, errors)

  const selected = selectedWorkItems(worklist, args)
  const workItemById = mapBy(selected, 'downstream_action_work_item_id', errors, 'expected worklist selection')
  const decisionById = mapBy(decisions.downstream_decisions || [], 'decision_id', errors, 'decisions')
  const itemByWorkItemId = mapBy(batch.target_standard_gap_resolution_items || [], 'parent_downstream_action_work_item_id', errors, 'batch')
  const stats = {
    by_existing_grade_band: {},
    by_missing_grade_band: {},
    by_priority_tier: {},
    by_source_batch: {},
    by_source_standard_code: {},
    by_subject: {},
    expected_target_standard_gap_resolution_items: selected.length,
    extra_resolution_items: 0,
    missing_resolution_items: 0,
    parent_downstream_work_items: sorted((batch.target_standard_gap_resolution_items || []).map(item => item.parent_downstream_action_work_item_id)).length,
    source_anchor_review_rows: 0,
    target_standard_gap_resolution_items: (batch.target_standard_gap_resolution_items || []).length,
    unique_progression_groups: sorted((batch.target_standard_gap_resolution_items || []).map(item => item.progression_group_id)).length,
    unique_source_keys: sorted((batch.target_standard_gap_resolution_items || []).map(item => item.source_key)).length,
    unique_source_standard_codes: sorted((batch.target_standard_gap_resolution_items || []).map(item => item.source_standard_code)).length
  }

  for (const item of batch.target_standard_gap_resolution_items || []) {
    const workItem = workItemById.get(item.parent_downstream_action_work_item_id)
    const decision = decisionById.get(item.downstream_decision_id)
    auditItem(item, workItem, decision, errors, stats)
  }
  for (const workItem of selected) {
    if (!itemByWorkItemId.has(workItem.downstream_action_work_item_id)) {
      stats.missing_resolution_items += 1
      errors.push(`${workItem.downstream_action_work_item_id} missing target-standard gap resolution item`)
    }
  }
  for (const item of batch.target_standard_gap_resolution_items || []) {
    if (!workItemById.has(item.parent_downstream_action_work_item_id)) stats.extra_resolution_items += 1
  }
  if (args.requireItems && !selected.length) {
    errors.push('requireItems is set but expected worklist selection is empty')
  }
  if (args.requireItems && !(batch.target_standard_gap_resolution_items || []).length) {
    errors.push('requireItems is set but batch has no target_standard_gap_resolution_items')
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
