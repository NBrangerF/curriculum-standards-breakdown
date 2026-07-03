#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe_audit.md'

const WORK_QUEUE = 'downstream_source_anchor_evidence_queue'
const RECOMMENDATION = 'needs_source_anchor_evidence'
const REVIEW_GRAIN = 'standard_code+grade_band+source_batch+source_batch_item_id'
const SOURCE_BATCH_TYPES = {
  child_split: 'child_split_review_item',
  source_anchor_specificity: 'source_anchor_specificity_review_item'
}

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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the downstream source-anchor evidence batch against the downstream
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
    workItem.standard_code || '',
    workItem.grade_band || '',
    workItem.source_batch || '',
    workItem.source_batch_item_id || ''
  ].join('|')
}

function validateTopLevel(batch, worklist, decisions, args, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch') {
    errors.push('batch purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch')
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

function auditEvidencePolicy(item, prefix, errors) {
  if (item.worklist_only !== true) errors.push(`${prefix} worklist_only must be true`)
  if (item.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
  const policy = item.source_anchor_evidence_policy || {}
  for (const key of [
    'downstream_decision_must_be_edited_separately',
    'item_level_decision_gate_required',
    'requires_later_item_level_source_review',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'source_anchor_evidence_batch_is_not_approval'
  ]) {
    if (policy[key] !== true) errors.push(`${prefix} source_anchor_evidence_policy.${key} must be true`)
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'eligible_for_h4g_differentiation',
    'direct_matcher_use',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (policy[key] !== false) errors.push(`${prefix} source_anchor_evidence_policy.${key} must be false`)
  }
}

function auditDecisionTemplate(item, decision, prefix, errors) {
  const template = item.review_decision_template || {}
  const allowed = template.allowed_review_outcomes || []
  for (const value of [
    'accept_bounded_slice_for_item_level_source_review',
    'needs_source_anchor_evidence',
    'reject_slice_as_overbroad'
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
  if (confirmations.anchor_type_matches_target_domain !== false) errors.push(`${prefix} anchor_type_matches_target_domain must start false`)
  if (confirmations.item_level_decision_still_required !== true) errors.push(`${prefix} item_level_decision_still_required must be true`)
  if (confirmations.no_public_write_requested !== true) errors.push(`${prefix} no_public_write_requested must be true`)
  if (confirmations.official_standard_text_preserved !== true) errors.push(`${prefix} official_standard_text_preserved must be true`)
  if (confirmations.same_grade_scope_checked !== false) errors.push(`${prefix} same_grade_scope_checked must start false`)
  if (confirmations.same_subject_scope_checked !== false) errors.push(`${prefix} same_subject_scope_checked must start false`)
  if (confirmations.source_item_reviewed !== false) errors.push(`${prefix} source_item_reviewed must start false`)
  if (item.source_batch === 'child_split' && confirmations.child_slice_scope_is_single_source_row !== true) {
    errors.push(`${prefix} child_slice_scope_is_single_source_row must be true for child_split`)
  }
  if (item.source_batch === 'source_anchor_specificity' && confirmations.source_anchor_is_specific_not_topic_only !== false) {
    errors.push(`${prefix} source_anchor_is_specific_not_topic_only must start false for source_anchor_specificity`)
  }
  if (template.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (template.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (template.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
}

function auditItem(item, workItem, decision, errors, stats) {
  const prefix = item.source_anchor_evidence_item_id || item.parent_downstream_action_work_item_id || '(missing source-anchor evidence item)'
  if (!item.source_anchor_evidence_item_id) errors.push(`${prefix} missing source_anchor_evidence_item_id`)
  auditEvidencePolicy(item, prefix, errors)
  if (!workItem) {
    errors.push(`${prefix} source-anchor evidence item not found in expected worklist selection`)
    return
  }
  if (!decision) {
    errors.push(`${prefix} downstream decision not found`)
    return
  }
  auditDecisionTemplate(item, decision, prefix, errors)
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
    ['target_standard_code', item.target_standard_code, workItem.target_standard_code],
    ['grade_band', item.grade_band, workItem.grade_band],
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
  if (item.decision_type !== 'anchor_group_downstream_source_anchor_evidence') {
    errors.push(`${prefix} decision_type must be anchor_group_downstream_source_anchor_evidence`)
  }
  const expectedType = SOURCE_BATCH_TYPES[workItem.source_batch]
  if (!expectedType) errors.push(`${prefix} source_batch must be one of ${Object.keys(SOURCE_BATCH_TYPES).join(', ')}`)
  if (expectedType && item.source_batch_item_type !== expectedType) {
    errors.push(`${prefix} source_batch_item_type must be ${expectedType}`)
  }
  if (Number(item.source_anchor_review_rows || 0) !== 1) errors.push(`${prefix} source_anchor_review_rows must be 1`)
  if (item.source_key !== sourceKey(workItem)) errors.push(`${prefix} source_key must match source work item`)
  if (!(workItem.allowed_decisions || []).includes(RECOMMENDATION)) {
    errors.push(`${prefix} source work item allowed_decisions must include ${RECOMMENDATION}`)
  }
  if (!(decision.allowed_decisions || []).includes(RECOMMENDATION)) {
    errors.push(`${prefix} downstream decision allowed_decisions must include ${RECOMMENDATION}`)
  }
  if (item.standard_context?.code && item.standard_context.code !== item.standard_code) {
    errors.push(`${prefix} standard_context.code must match standard_code`)
  }
  const unitContext = workItem.source_context?.unit_context || {}
  if (String(item.unit_evidence_id || '') !== String(unitContext.unit_evidence_id || '')) errors.push(`${prefix} unit_evidence_id must match source context`)
  if (String(item.textbook_evidence_id || '') !== String(unitContext.textbook_evidence_id || '')) {
    errors.push(`${prefix} textbook_evidence_id must match source context`)
  }
  for (const confirmation of ['anchor_type_matches_target_domain', 'same_grade_scope_checked', 'same_subject_scope_checked', 'source_item_reviewed']) {
    if (!(item.required_confirmations_to_close || []).includes(confirmation)) {
      errors.push(`${prefix} required_confirmations_to_close must include ${confirmation}`)
    }
  }
  if (item.source_batch === 'source_anchor_specificity' && !(item.required_confirmations_to_close || []).includes('source_anchor_is_specific_not_topic_only')) {
    errors.push(`${prefix} source_anchor_specificity rows must require source_anchor_is_specific_not_topic_only`)
  }

  stats.source_anchor_review_rows += Number(item.source_anchor_review_rows || 0)
  countInto(stats.by_anchor_type, item.anchor_type)
  countInto(stats.by_grade_band, item.grade_band)
  countInto(stats.by_priority_tier, item.priority_tier)
  countInto(stats.by_source_batch, item.source_batch)
  countInto(stats.by_source_batch_item_type, item.source_batch_item_type)
  countInto(stats.by_subject, item.subject_slug)
  countInto(stats.by_target_standard_present, item.target_standard_code ? 'present' : 'empty')
}

function auditSummary(batch, stats, errors) {
  const summary = batch.summary || {}
  for (const key of [
    'parent_downstream_work_items',
    'source_anchor_evidence_items',
    'source_anchor_review_rows',
    'unique_progression_groups',
    'unique_source_keys',
    'unique_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`summary.${key} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Evidence Batch Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected source-anchor evidence items | ${payload.summary.expected_source_anchor_evidence_items} |
| source-anchor evidence items | ${payload.summary.source_anchor_evidence_items} |
| missing source-anchor evidence items | ${payload.summary.missing_source_anchor_evidence_items} |
| extra source-anchor evidence items | ${payload.summary.extra_source_anchor_evidence_items} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| unique source keys | ${payload.summary.unique_source_keys} |

## Grade Bands

| grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Source Batches

| source batch | rows |
| --- | ---: |
${countRows(payload.summary.by_source_batch)}

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
  const batch = errors.length ? { source_anchor_evidence_items: [] } : readJson(args.batch)
  const worklist = errors.length ? { downstream_action_work_items: [] } : readJson(args.worklist)
  const decisions = errors.length ? { downstream_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(batch, worklist, decisions, args, errors)

  const selected = selectedWorkItems(worklist, args)
  const workItemById = mapBy(selected, 'downstream_action_work_item_id', errors, 'expected worklist selection')
  const decisionById = mapBy(decisions.downstream_decisions || [], 'decision_id', errors, 'decisions')
  const itemByWorkItemId = mapBy(batch.source_anchor_evidence_items || [], 'parent_downstream_action_work_item_id', errors, 'batch')
  const stats = {
    by_anchor_type: {},
    by_grade_band: {},
    by_priority_tier: {},
    by_source_batch: {},
    by_source_batch_item_type: {},
    by_subject: {},
    by_target_standard_present: {},
    expected_source_anchor_evidence_items: selected.length,
    extra_source_anchor_evidence_items: 0,
    missing_source_anchor_evidence_items: 0,
    parent_downstream_work_items: sorted((batch.source_anchor_evidence_items || []).map(item => item.parent_downstream_action_work_item_id)).length,
    source_anchor_evidence_items: (batch.source_anchor_evidence_items || []).length,
    source_anchor_review_rows: 0,
    unique_progression_groups: sorted((batch.source_anchor_evidence_items || []).map(item => item.progression_group_id)).length,
    unique_source_keys: sorted((batch.source_anchor_evidence_items || []).map(item => item.source_key)).length,
    unique_standard_codes: sorted((batch.source_anchor_evidence_items || []).map(item => item.standard_code)).length,
    unique_unit_evidence_ids: sorted((batch.source_anchor_evidence_items || []).map(item => item.unit_evidence_id)).length
  }

  for (const item of batch.source_anchor_evidence_items || []) {
    const workItem = workItemById.get(item.parent_downstream_action_work_item_id)
    const decision = decisionById.get(item.downstream_decision_id)
    auditItem(item, workItem, decision, errors, stats)
  }
  for (const workItem of selected) {
    if (!itemByWorkItemId.has(workItem.downstream_action_work_item_id)) {
      stats.missing_source_anchor_evidence_items += 1
      errors.push(`${workItem.downstream_action_work_item_id} missing source-anchor evidence item`)
    }
  }
  for (const item of batch.source_anchor_evidence_items || []) {
    if (!workItemById.has(item.parent_downstream_action_work_item_id)) stats.extra_source_anchor_evidence_items += 1
  }
  if (args.requireItems && !selected.length) {
    errors.push('requireItems is set but expected worklist selection is empty')
  }
  if (args.requireItems && !(batch.source_anchor_evidence_items || []).length) {
    errors.push('requireItems is set but batch has no source_anchor_evidence_items')
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
