#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_ITEM_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_PARENT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch_anchor_domain_rejected_english_pe_audit.md'

const ITEM_CANDIDATE_DECISION = 'needs_textbook_unit_indexing'
const ITEM_CANDIDATE_STATUS = 'manual_scope_indexing_item_candidate_reviewed'
const PARENT_CANDIDATE_DECISION = 'missing_grade_units_indexed_for_later_source_review'
const PARENT_CANDIDATE_STATUS = 'manual_scope_indexing_candidate_reviewed'
const REVIEW_GRAIN = 'item_review_decision+target_standard_code+unit_evidence_id'

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    includeNonPageReady: false,
    inventory: DEFAULT_INVENTORY,
    itemCandidate: DEFAULT_ITEM_CANDIDATE,
    out: DEFAULT_OUT,
    parentCandidate: DEFAULT_PARENT_CANDIDATE,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
    else if (item === '--item-candidate') args.itemCandidate = argv[++i]
    else if (item === '--parent-candidate') args.parentCandidate = argv[++i]
    else if (item === '--inventory') args.inventory = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--include-non-page-ready') args.includeNonPageReady = true
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --item-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --parent-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --inventory generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the manual-scope source-anchor evidence batch against the item-review
manual-scope candidate, parent downstream manual-scope candidate, and full
manual-scope unit-indexing inventory.`)
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

function uniqueStrings(values) {
  const seen = new Set()
  const out = []
  for (const value of values || []) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
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

function validateInputs(batch, itemCandidate, parentCandidate, inventory, args, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch') {
    errors.push('batch purpose mismatch')
  }
  if (batch.worklist_only !== true) errors.push('batch worklist_only must be true')
  if (batch.source_item_review_manual_scope_indexing_decisions_candidate !== args.itemCandidate) {
    errors.push('batch source_item_review_manual_scope_indexing_decisions_candidate must match audit arg')
  }
  if (batch.source_parent_downstream_manual_scope_indexing_decisions_candidate !== args.parentCandidate) {
    errors.push('batch source_parent_downstream_manual_scope_indexing_decisions_candidate must match audit arg')
  }
  if (batch.source_manual_scope_indexing_inventory !== args.inventory) {
    errors.push('batch source_manual_scope_indexing_inventory must match audit arg')
  }
  if (batch.selection?.include_non_page_ready !== args.includeNonPageReady) {
    errors.push('batch selection.include_non_page_ready must match audit arg')
  }
  validatePolicy('batch', batch, errors)
  if (!Array.isArray(batch.manual_scope_source_anchor_evidence_items)) {
    errors.push('batch manual_scope_source_anchor_evidence_items must be an array')
  }

  if (itemCandidate.valid !== true) errors.push('item candidate valid must be true')
  if (itemCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate') {
    errors.push('item candidate candidate_purpose mismatch')
  }
  if (itemCandidate.source_downstream_parent_decisions_candidate !== args.parentCandidate) {
    errors.push('item candidate source_downstream_parent_decisions_candidate must match audit arg')
  }
  validatePolicy('item candidate', itemCandidate, errors)

  if (parentCandidate.valid !== true) errors.push('parent candidate valid must be true')
  if (parentCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate') {
    errors.push('parent candidate candidate_purpose mismatch')
  }
  if (parentCandidate.source_manual_scope_indexing_inventory !== args.inventory) {
    errors.push('parent candidate source_manual_scope_indexing_inventory must match audit arg')
  }
  validatePolicy('parent candidate', parentCandidate, errors)

  if (inventory.valid !== true) errors.push('manual-scope inventory valid must be true')
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory') {
    errors.push('manual-scope inventory purpose mismatch')
  }
  validatePolicy('manual-scope inventory', inventory, errors)
}

function itemCandidateRows(itemCandidate) {
  return (itemCandidate.item_review_decisions || []).filter(row =>
    row.manual_scope_indexing_item_review_decision_candidate === true &&
    row.reviewer_decision === ITEM_CANDIDATE_DECISION &&
    row.decision_status === ITEM_CANDIDATE_STATUS
  )
}

function parentCandidateRows(parentCandidate) {
  return (parentCandidate.downstream_decisions || []).filter(row =>
    row.manual_scope_indexing_parent_decision_candidate === true &&
    row.reviewer_decision === PARENT_CANDIDATE_DECISION &&
    row.decision_status === PARENT_CANDIDATE_STATUS
  )
}

function targetKey(gradeBand, code) {
  return `${gradeBand || ''}|${code || ''}`
}

function itemTargetKeys(row) {
  return sorted((row.target_missing_grade_standards || []).map(target => targetKey(
    target.grade_band || target.target_grade_band || '',
    target.code || target.standard_code || target.target_standard_code || ''
  )))
}

function sourceKey(item, parent, unit) {
  return [
    item.decision_id || '',
    parent.decision_id || '',
    parent.target_standard_code || '',
    unit.unit_evidence_id || ''
  ].join('|')
}

function batchItemId(item, parent, unit) {
  return `h4g_anchor_group_manual_scope_source_anchor_${hashText(sourceKey(item, parent, unit))}`
}

function selectedUnits(inventoryItem, args) {
  return (inventoryItem?.same_grade_unit_index_candidates || [])
    .filter(unit => args.includeNonPageReady || unit.page_ready === true)
}

function expectedRows(itemCandidate, parentCandidate, inventory, args, errors, stats) {
  const itemById = new Map(itemCandidateRows(itemCandidate).map(item => [item.decision_id, item]))
  const inventoryByManualScopeItemId = new Map((inventory.inventory_items || []).map(item => [item.manual_scope_indexing_item_id, item]))
  const rows = []
  for (const parent of parentCandidateRows(parentCandidate)) {
    const prefix = parent.decision_id || '(manual-scope parent candidate)'
    const item = itemById.get(parent.parent_decision_id)
    const inventoryItem = inventoryByManualScopeItemId.get(parent.manual_scope_indexing_evidence?.manual_scope_indexing_item_id || '')
    if (!item) {
      errors.push(`${prefix} missing item-review manual-scope candidate`)
      continue
    }
    if (!itemTargetKeys(item).includes(targetKey(parent.grade_band, parent.target_standard_code))) {
      errors.push(`${prefix} parent target grade/code must be in item missing target standards`)
    }
    if (!inventoryItem) {
      errors.push(`${prefix} missing inventory item`)
      continue
    }
    if (inventoryItem.parent_decision_id !== item.decision_id) errors.push(`${prefix} inventory parent_decision_id mismatch`)
    if (inventoryItem.downstream_decision_id !== parent.decision_id) errors.push(`${prefix} inventory downstream_decision_id mismatch`)
    if (inventoryItem.target_grade_band !== parent.grade_band) errors.push(`${prefix} inventory target_grade_band mismatch`)
    if (inventoryItem.target_standard_code !== parent.target_standard_code) errors.push(`${prefix} inventory target_standard_code mismatch`)
    const units = selectedUnits(inventoryItem, args)
    if (!units.length) errors.push(`${prefix} has no selected same-grade unit candidates`)
    stats.expected_parent_candidate_decisions += 1
    for (const unit of units) {
      if (!unit.unit_evidence_id) errors.push(`${prefix} selected unit missing unit_evidence_id`)
      rows.push({
        id: batchItemId(item, parent, unit),
        inventoryItem,
        item,
        parent,
        sourceKey: sourceKey(item, parent, unit),
        unit
      })
    }
  }
  return rows
}

function auditEvidencePolicy(row, prefix, errors) {
  if (row.worklist_only !== true) errors.push(`${prefix} worklist_only must be true`)
  if (row.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
  const policy = row.source_anchor_evidence_policy || {}
  for (const key of [
    'item_decision_must_be_edited_separately',
    'manual_scope_source_anchor_batch_is_not_approval',
    'requires_later_item_level_source_review',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_manual_source_anchor_review'
  ]) {
    if (policy[key] !== true) errors.push(`${prefix} source_anchor_evidence_policy.${key} must be true`)
  }
  validatePolicy(`${prefix} source_anchor_evidence_policy`, policy, errors)
}

function auditReviewTemplate(row, item, prefix, errors) {
  const template = row.review_decision_template || {}
  const allowed = template.allowed_review_outcomes || []
  for (const value of allowed) {
    if (!(item.allowed_decisions || []).includes(value)) {
      errors.push(`${prefix} review outcome must come from item allowed_decisions: ${value}`)
    }
  }
  for (const value of ['source_anchor_evidence_found_for_missing_grade', 'source_anchor_evidence_not_found']) {
    if (!allowed.includes(value)) errors.push(`${prefix} allowed_review_outcomes missing ${value}`)
  }
  for (const forbidden of ['matcher_ready', 'publication_ready', 'approve_standard_scoped_subject_theme_bridge']) {
    if (allowed.includes(forbidden)) errors.push(`${prefix} review template must not include ${forbidden}`)
  }
  const confirmations = template.required_confirmations || {}
  for (const [key, expected] of [
    ['existing_source_items_reviewed', false],
    ['missing_grade_target_standard_checked', true],
    ['no_public_write_requested', true],
    ['official_standard_text_preserved', true],
    ['same_grade_scope_checked', false],
    ['source_anchor_evidence_same_grade', false],
    ['source_anchor_evidence_specific_to_standard', false]
  ]) {
    if (confirmations[key] !== expected) errors.push(`${prefix} required_confirmations.${key} must be ${expected}`)
  }
  for (const key of [
    'requested_direct_matcher_use',
    'requested_eligible_for_h4g_differentiation',
    'requested_official_text_change',
    'requested_public_write'
  ]) {
    if (template[key] !== false) errors.push(`${prefix} review_decision_template.${key} must be false`)
  }
}

function auditRow(row, expected, args, errors, stats) {
  const prefix = row.manual_scope_source_anchor_evidence_item_id || expected.id
  const { item, parent, inventoryItem, unit } = expected
  auditEvidencePolicy(row, prefix, errors)
  auditReviewTemplate(row, item, prefix, errors)
  const checks = [
    ['anchor_type', row.anchor_type, parent.anchor_type || item.anchor_type || ''],
    ['decision_type', row.decision_type, 'anchor_group_manual_scope_source_anchor_evidence_item'],
    ['grade_band', row.grade_band, parent.grade_band || ''],
    ['item_review_decision_id', row.item_review_decision_id, item.decision_id || ''],
    ['item_review_surface', row.item_review_surface, item.item_review_surface || ''],
    ['manual_scope_indexing_item_id', row.manual_scope_indexing_item_id, inventoryItem.manual_scope_indexing_item_id || ''],
    ['page_range', row.page_range, unit.page_range || ''],
    ['page_range_status', row.page_range_status, unit.page_range_status || ''],
    ['page_ready', row.page_ready, unit.page_ready === true],
    ['parent_downstream_action_decision_id', row.parent_downstream_action_decision_id, parent.source_downstream_action_decision_id || ''],
    ['parent_downstream_decision_id', row.parent_downstream_decision_id, parent.decision_id || ''],
    ['parent_source_batch_item_id', row.parent_source_batch_item_id, parent.source_batch_item_id || ''],
    ['priority_rank', row.priority_rank, item.priority_rank],
    ['priority_tier', row.priority_tier, item.priority_tier || ''],
    ['progression_group_id', row.progression_group_id, item.progression_group_id || ''],
    ['review_grain', row.review_grain, REVIEW_GRAIN],
    ['source_item_standard_code', row.source_item_standard_code, item.source_standard_code || ''],
    ['source_key', row.source_key, expected.sourceKey],
    ['source_manual_scope_inventory_item_id', row.source_manual_scope_inventory_item_id, inventoryItem.inventory_item_id || ''],
    ['standard_code', row.standard_code, parent.target_standard_code || ''],
    ['subject_slug', row.subject_slug, item.subject_slug || parent.subject_slug || ''],
    ['target_grade_band', row.target_grade_band, parent.grade_band || ''],
    ['target_standard_code', row.target_standard_code, parent.target_standard_code || ''],
    ['unit_evidence_id', row.unit_evidence_id, unit.unit_evidence_id || ''],
    ['unit_title', row.unit_title, unit.unit_title || '']
  ]
  for (const [field, actual, expectedValue] of checks) {
    if (!sameJson(actual, expectedValue)) errors.push(`${prefix} ${field} mismatch`)
  }
  if (args.includeNonPageReady !== true && row.page_ready !== true) {
    errors.push(`${prefix} page_ready must be true when page-ready-only selection is used`)
  }
  if (!row.unit_context || row.unit_context.unit_evidence_id !== unit.unit_evidence_id) {
    errors.push(`${prefix} unit_context.unit_evidence_id mismatch`)
  }
  if (!row.target_standard_context?.standard) errors.push(`${prefix} target_standard_context.standard must be present`)
  if (!row.source_standard_context?.standard) errors.push(`${prefix} source_standard_context.standard must be present`)
  stats.audited_source_anchor_evidence_items += 1
}

function summarizeRows(rows) {
  const stats = {
    audited_source_anchor_evidence_items: 0,
    by_grade_band: {},
    by_page_range_status: {},
    by_priority_tier: {},
    by_subject: {},
    by_target_standard_code: {},
    by_unit_level: {},
    expected_manual_scope_source_anchor_evidence_items: 0,
    expected_parent_candidate_decisions: 0,
    extra_source_anchor_evidence_items: 0,
    manual_scope_source_anchor_evidence_items: rows.length,
    missing_source_anchor_evidence_items: 0,
    source_anchor_review_rows: 0,
    unique_item_review_decisions: sorted(rows.map(row => row.item_review_decision_id)).length,
    unique_parent_downstream_decisions: sorted(rows.map(row => row.parent_downstream_decision_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_target_standard_codes: sorted(rows.map(row => row.target_standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    stats.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    countInto(stats.by_grade_band, row.target_grade_band || row.grade_band)
    countInto(stats.by_page_range_status, row.page_range_status)
    countInto(stats.by_priority_tier, row.priority_tier)
    countInto(stats.by_subject, row.subject_slug)
    countInto(stats.by_target_standard_code, row.target_standard_code)
    countInto(stats.by_unit_level, row.unit_context?.unit_level)
  }
  return stats
}

function validateSummary(batch, stats, errors) {
  const summary = batch.summary || {}
  for (const key of [
    'manual_scope_source_anchor_evidence_items',
    'source_anchor_review_rows',
    'unique_item_review_decisions',
    'unique_parent_downstream_decisions',
    'unique_progression_groups',
    'unique_source_keys',
    'unique_target_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`batch summary.${key} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Manual Scope Source-Anchor Evidence Batch Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected source-anchor evidence items | ${payload.summary.expected_manual_scope_source_anchor_evidence_items} |
| audited source-anchor evidence items | ${payload.summary.audited_source_anchor_evidence_items} |
| actual source-anchor evidence items | ${payload.summary.manual_scope_source_anchor_evidence_items} |
| missing source-anchor evidence items | ${payload.summary.missing_source_anchor_evidence_items} |
| extra source-anchor evidence items | ${payload.summary.extra_source_anchor_evidence_items} |
| unique item-review decisions | ${payload.summary.unique_item_review_decisions} |
| unique parent downstream decisions | ${payload.summary.unique_parent_downstream_decisions} |
| unique target standards | ${payload.summary.unique_target_standard_codes} |
| unique unit evidence ids | ${payload.summary.unique_unit_evidence_ids} |

## Grade Bands

| grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Target Standards

| target standard | rows |
| --- | ---: |
${countRows(payload.summary.by_target_standard_code)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['batch', args.batch],
    ['item candidate', args.itemCandidate],
    ['parent candidate', args.parentCandidate],
    ['manual-scope inventory', args.inventory]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const batch = existsSync(args.batch) ? readJson(args.batch) : { manual_scope_source_anchor_evidence_items: [] }
  const itemCandidate = existsSync(args.itemCandidate) ? readJson(args.itemCandidate) : { item_review_decisions: [] }
  const parentCandidate = existsSync(args.parentCandidate) ? readJson(args.parentCandidate) : { downstream_decisions: [] }
  const inventory = existsSync(args.inventory) ? readJson(args.inventory) : { inventory_items: [] }
  if (!errors.length) validateInputs(batch, itemCandidate, parentCandidate, inventory, args, errors)

  const stats = summarizeRows(batch.manual_scope_source_anchor_evidence_items || [])
  const expected = expectedRows(itemCandidate, parentCandidate, inventory, args, errors, stats)
  stats.expected_manual_scope_source_anchor_evidence_items = expected.length
  const expectedById = new Map(expected.map(row => [row.id, row]))
  const actualById = mapBy(batch.manual_scope_source_anchor_evidence_items || [], 'manual_scope_source_anchor_evidence_item_id', errors, 'batch')

  for (const row of batch.manual_scope_source_anchor_evidence_items || []) {
    const expectedRow = expectedById.get(row.manual_scope_source_anchor_evidence_item_id)
    if (!expectedRow) {
      stats.extra_source_anchor_evidence_items += 1
      errors.push(`${row.manual_scope_source_anchor_evidence_item_id || '(missing id)'} unexpected source-anchor evidence row`)
      continue
    }
    auditRow(row, expectedRow, args, errors, stats)
  }
  for (const expectedRow of expected) {
    if (!actualById.has(expectedRow.id)) {
      stats.missing_source_anchor_evidence_items += 1
      errors.push(`${expectedRow.id} missing source-anchor evidence row`)
    }
  }
  if (args.requireItems && !expected.length) {
    errors.push('requireItems is set but expected source-anchor evidence selection is empty')
  }
  if (stats.audited_source_anchor_evidence_items !== stats.expected_manual_scope_source_anchor_evidence_items) {
    errors.push(`audited source-anchor rows ${stats.audited_source_anchor_evidence_items} must match expected ${stats.expected_manual_scope_source_anchor_evidence_items}`)
  }
  if (stats.manual_scope_source_anchor_evidence_items !== stats.expected_manual_scope_source_anchor_evidence_items) {
    errors.push(`actual source-anchor rows ${stats.manual_scope_source_anchor_evidence_items} must match expected ${stats.expected_manual_scope_source_anchor_evidence_items}`)
  }
  validateSummary(batch, stats, errors)

  return {
    batch: args.batch,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    inventory: args.inventory,
    item_candidate: args.itemCandidate,
    matcher_ready: false,
    parent_candidate: args.parentCandidate,
    publication_ready: false,
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
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
