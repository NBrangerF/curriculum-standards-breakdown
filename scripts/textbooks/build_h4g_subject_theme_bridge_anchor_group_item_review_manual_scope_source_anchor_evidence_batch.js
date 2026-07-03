#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_ITEM_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_PARENT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.md'

const ITEM_CANDIDATE_DECISION = 'needs_textbook_unit_indexing'
const ITEM_CANDIDATE_STATUS = 'manual_scope_indexing_item_candidate_reviewed'
const PARENT_CANDIDATE_DECISION = 'missing_grade_units_indexed_for_later_source_review'
const PARENT_CANDIDATE_STATUS = 'manual_scope_indexing_candidate_reviewed'
const REVIEW_GRAIN = 'item_review_decision+target_standard_code+unit_evidence_id'

function parseArgs(argv) {
  const args = {
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
    if (item === '--item-candidate') args.itemCandidate = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch.js \\
  --item-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --parent-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --inventory generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only source-anchor evidence review batch from manual-scope unit
indexing candidates. By default it expands only page-ready same-grade textbook
unit candidates. It does not edit item decisions, approve bridges, write
public/data, or enable matcher/publication use.`)
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

function truncate(value, max = 96) {
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

function validateInputs(itemCandidate, parentCandidate, inventory, args, errors) {
  if (itemCandidate.valid !== true) errors.push('item candidate valid must be true')
  if (itemCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate') {
    errors.push('item candidate candidate_purpose mismatch')
  }
  if (itemCandidate.review_only !== true) errors.push('item candidate review_only must be true')
  if (itemCandidate.source_downstream_parent_decisions_candidate !== args.parentCandidate) {
    errors.push('item candidate source_downstream_parent_decisions_candidate must match --parent-candidate')
  }
  validatePolicy('item candidate', itemCandidate, errors)
  if (!Array.isArray(itemCandidate.item_review_decisions)) errors.push('item candidate item_review_decisions must be an array')

  if (parentCandidate.valid !== true) errors.push('parent candidate valid must be true')
  if (parentCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate') {
    errors.push('parent candidate candidate_purpose mismatch')
  }
  if (parentCandidate.review_only !== true) errors.push('parent candidate review_only must be true')
  if (parentCandidate.source_manual_scope_indexing_inventory !== args.inventory) {
    errors.push('parent candidate source_manual_scope_indexing_inventory must match --inventory')
  }
  validatePolicy('parent candidate', parentCandidate, errors)
  if (!Array.isArray(parentCandidate.downstream_decisions)) errors.push('parent candidate downstream_decisions must be an array')

  if (inventory.valid !== true) errors.push('manual-scope inventory valid must be true')
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory') {
    errors.push('manual-scope inventory purpose mismatch')
  }
  validatePolicy('manual-scope inventory', inventory, errors)
  if (!Array.isArray(inventory.inventory_items)) errors.push('manual-scope inventory inventory_items must be an array')
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

function evidencePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    item_decision_must_be_edited_separately: true,
    manual_scope_source_anchor_batch_is_not_approval: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_item_level_source_review: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    requires_manual_source_anchor_review: true,
    writes_public_data: false
  }
}

function reviewDecisionTemplate(item, parent, inventoryItem, unit) {
  const sourceTemplate = item.review_decision_template || {}
  return {
    allowed_review_outcomes: uniqueStrings([
      'source_anchor_evidence_found_for_missing_grade',
      'source_anchor_evidence_not_found',
      'needs_textbook_unit_indexing'
    ].filter(value => (item.allowed_decisions || []).includes(value))),
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: {
      existing_source_items_reviewed: false,
      missing_grade_target_standard_checked: true,
      no_public_write_requested: true,
      official_standard_text_preserved: true,
      same_grade_scope_checked: false,
      source_anchor_evidence_same_grade: false,
      source_anchor_evidence_specific_to_standard: false
    },
    review_questions: uniqueStrings([
      `Does ${unit.unit_title || 'this unit'} show exact source-anchor evidence for ${parent.target_standard_code || ''}?`,
      'Is the evidence same-grade, same-subject, and page-ready?',
      'Does the unit evidence match the target standard code rather than only a broad topic or shared progression group?',
      ...(sourceTemplate.review_questions || []),
      ...(inventoryItem.review_questions || []),
      ...(parent.review_decision_template?.review_questions || [])
    ]),
    reviewer_note_template: 'Record whether this same-grade unit shows exact source-anchor evidence for the missing target standard. Do not mark bridge approval here.'
  }
}

function unitContext(unit) {
  return {
    edition: unit.edition || '',
    evidence_url: unit.evidence_url || '',
    file_name: unit.file_name || '',
    grade: unit.grade,
    page_range: unit.page_range || '',
    page_range_status: unit.page_range_status || '',
    page_ready: unit.page_ready === true,
    repository_path: unit.repository_path || '',
    source_unit_index: unit.source_unit_index || '',
    subject_slug: unit.subject_slug || '',
    textbook_evidence_id: unit.textbook_evidence_id || '',
    unit_evidence_id: unit.unit_evidence_id || '',
    unit_level: unit.unit_level || '',
    unit_title: unit.unit_title || ''
  }
}

function validateParentCoverage(item, parent, inventoryItem, errors) {
  const prefix = parent.decision_id || item.decision_id || '(manual-scope source-anchor)'
  if (parent.parent_decision_id !== item.decision_id) errors.push(`${prefix} parent_decision_id must match item decision`)
  if (!itemTargetKeys(item).includes(targetKey(parent.grade_band, parent.target_standard_code))) {
    errors.push(`${prefix} parent target grade/code must be in item missing target standards`)
  }
  if (!inventoryItem) {
    errors.push(`${prefix} missing inventory item ${parent.manual_scope_indexing_evidence?.manual_scope_indexing_item_id || ''}`)
    return
  }
  if (inventoryItem.manual_scope_indexing_item_id !== parent.manual_scope_indexing_evidence?.manual_scope_indexing_item_id) {
    errors.push(`${prefix} inventory manual_scope_indexing_item_id mismatch`)
  }
  if (inventoryItem.target_standard_code !== parent.target_standard_code) errors.push(`${prefix} inventory target_standard_code mismatch`)
  if (inventoryItem.target_grade_band !== parent.grade_band) errors.push(`${prefix} inventory target_grade_band mismatch`)
  if (inventoryItem.parent_decision_id !== item.decision_id) errors.push(`${prefix} inventory parent_decision_id mismatch`)
  if (inventoryItem.downstream_decision_id !== parent.decision_id) errors.push(`${prefix} inventory downstream_decision_id mismatch`)
  if (!(Number(inventoryItem.same_grade_unit_index_page_ready_count || 0) > 0)) {
    errors.push(`${prefix} inventory must have page-ready unit candidates`)
  }
}

function selectedUnits(inventoryItem, args) {
  return (inventoryItem?.same_grade_unit_index_candidates || [])
    .filter(unit => args.includeNonPageReady || unit.page_ready === true)
}

function buildRows(itemCandidate, parentCandidate, inventory, args, errors) {
  const itemById = new Map(itemCandidateRows(itemCandidate).map(item => [item.decision_id, item]))
  const inventoryByManualScopeItemId = new Map((inventory.inventory_items || []).map(item => [item.manual_scope_indexing_item_id, item]))
  const rows = []
  const seen = new Set()
  for (const parent of parentCandidateRows(parentCandidate)) {
    const item = itemById.get(parent.parent_decision_id)
    const inventoryItem = inventoryByManualScopeItemId.get(parent.manual_scope_indexing_evidence?.manual_scope_indexing_item_id || '')
    if (!item) {
      errors.push(`${parent.decision_id || '(parent)'} missing item-review manual-scope candidate`)
      continue
    }
    validateParentCoverage(item, parent, inventoryItem, errors)
    const units = selectedUnits(inventoryItem, args)
    if (!units.length) errors.push(`${parent.decision_id || '(parent)'} has no selected same-grade unit candidates`)
    for (const unit of units) {
      if (!unit.unit_evidence_id) errors.push(`${parent.decision_id || '(parent)'} selected unit missing unit_evidence_id`)
      const id = batchItemId(item, parent, unit)
      if (seen.has(id)) errors.push(`duplicate manual_scope_source_anchor_evidence_item_id: ${id}`)
      seen.add(id)
      rows.push({
        anchor_type: parent.anchor_type || item.anchor_type || '',
        decision_type: 'anchor_group_manual_scope_source_anchor_evidence_item',
        grade_band: parent.grade_band || '',
        item_review_decision_id: item.decision_id || '',
        item_review_surface: item.item_review_surface || '',
        manual_scope_indexing_item_id: inventoryItem?.manual_scope_indexing_item_id || '',
        manual_scope_source_anchor_evidence_item_id: id,
        page_range: unit.page_range || '',
        page_range_status: unit.page_range_status || '',
        page_ready: unit.page_ready === true,
        parent_downstream_action_decision_id: parent.source_downstream_action_decision_id || '',
        parent_downstream_decision_id: parent.decision_id || '',
        parent_source_batch_item_id: parent.source_batch_item_id || '',
        priority_rank: item.priority_rank,
        priority_tier: item.priority_tier || '',
        progression_group_id: item.progression_group_id || '',
        review_decision_template: reviewDecisionTemplate(item, parent, inventoryItem || {}, unit),
        review_grain: REVIEW_GRAIN,
        review_questions: reviewDecisionTemplate(item, parent, inventoryItem || {}, unit).review_questions,
        source_anchor_review_item_ids: sorted([
          ...(item.source_anchor_review_item_ids || []),
          ...(parent.source_anchor_review_item_ids || []),
          ...(inventoryItem?.source_anchor_review_item_ids || [])
        ]),
        source_anchor_review_rows: Math.max(
          Number(item.source_anchor_review_rows || 0),
          Number(parent.source_anchor_review_rows || 0),
          Number(inventoryItem?.source_anchor_review_rows || 0)
        ),
        source_item_standard_code: item.source_standard_code || '',
        source_key: sourceKey(item, parent, unit),
        source_manual_scope_inventory_item_id: inventoryItem?.inventory_item_id || '',
        source_standard_context: item.source_standard_context || {},
        source_unit_candidate_page_ready_only: !args.includeNonPageReady,
        standard_code: parent.target_standard_code || '',
        subject_slug: item.subject_slug || parent.subject_slug || '',
        target_grade_band: parent.grade_band || '',
        target_standard_code: parent.target_standard_code || '',
        target_standard_context: inventoryItem?.target_standard_context || parent.source_context?.target_standard_context || {},
        unit_context: unitContext(unit),
        unit_evidence_id: unit.unit_evidence_id || '',
        unit_title: unit.unit_title || '',
        worklist_only: true,
        writes_public_data: false,
        source_anchor_evidence_policy: evidencePolicy()
      })
    }
  }
  return rows
}

function summarize(rows, itemCandidate, parentCandidate, inventory, args) {
  const allInventoryUnitRows = []
  for (const item of inventory.inventory_items || []) {
    for (const unit of item.same_grade_unit_index_candidates || []) allInventoryUnitRows.push({ inventory: item, unit })
  }
  const summary = {
    all_inventory_unit_candidate_rows: allInventoryUnitRows.length,
    by_grade_band: {},
    by_page_range_status: {},
    by_priority_tier: {},
    by_subject: {},
    by_target_standard_code: {},
    by_unit_level: {},
    item_review_candidate_decisions: itemCandidateRows(itemCandidate).length,
    manual_scope_parent_candidate_decisions: parentCandidateRows(parentCandidate).length,
    manual_scope_source_anchor_evidence_items: rows.length,
    page_ready_inventory_unit_candidate_rows: allInventoryUnitRows.filter(row => row.unit.page_ready === true).length,
    page_ready_only: !args.includeNonPageReady,
    source_anchor_review_rows: 0,
    unique_item_review_decisions: sorted(rows.map(row => row.item_review_decision_id)).length,
    unique_parent_downstream_decisions: sorted(rows.map(row => row.parent_downstream_decision_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_target_standard_codes: sorted(rows.map(row => row.target_standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    countInto(summary.by_grade_band, row.target_grade_band || row.grade_band)
    countInto(summary.by_page_range_status, row.page_range_status)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.target_standard_code)
    countInto(summary.by_unit_level, row.unit_context?.unit_level)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.target_grade_band)} | ${markdownCell(row.target_standard_code)} | ${markdownCell(row.unit_evidence_id)} | ${truncate(row.unit_title)} | ${markdownCell(row.page_range)} |`
  )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Manual Scope Source-Anchor Evidence Batch

Generated at: ${payload.generated_at}

This read-only batch expands manual-scope same-grade unit-indexing candidates
into source-anchor evidence review rows at \`${REVIEW_GRAIN}\` grain. By
default it includes only page-ready unit candidates. It does not edit item
decisions, approve bridges, write \`public/data\`, change official standard
text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| worklist only | ${payload.worklist_only} |
| page ready only | ${payload.summary.page_ready_only} |
| source-anchor evidence items | ${payload.summary.manual_scope_source_anchor_evidence_items} |
| item-review candidate decisions | ${payload.summary.item_review_candidate_decisions} |
| parent candidate decisions | ${payload.summary.manual_scope_parent_candidate_decisions} |
| page-ready inventory unit rows | ${payload.summary.page_ready_inventory_unit_candidate_rows} |
| unique item-review decisions | ${payload.summary.unique_item_review_decisions} |
| unique parent downstream decisions | ${payload.summary.unique_parent_downstream_decisions} |
| unique target standards | ${payload.summary.unique_target_standard_codes} |
| unique unit evidence ids | ${payload.summary.unique_unit_evidence_ids} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Grade Bands

| grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Target Standards

| target standard | rows |
| --- | ---: |
${countRows(payload.summary.by_target_standard_code)}

## Unit Levels

| unit level | rows |
| --- | ---: |
${countRows(payload.summary.by_unit_level)}

## Preview

| rank | subject | grade | target standard | unit evidence | unit title | pages |
| ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.manual_scope_source_anchor_evidence_items)}

## Guardrails

- Source-anchor evidence rows are not item-review decisions or bridge approval.
- Every row still requires manual source-anchor review before matcher/publication gates.
- Public data, official standard text, matcher, and publication remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['item candidate', args.itemCandidate],
    ['parent candidate', args.parentCandidate],
    ['manual-scope inventory', args.inventory]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const itemCandidate = errors.length ? { item_review_decisions: [] } : readJson(args.itemCandidate)
  const parentCandidate = errors.length ? { downstream_decisions: [] } : readJson(args.parentCandidate)
  const inventory = errors.length ? { inventory_items: [] } : readJson(args.inventory)
  if (!errors.length) validateInputs(itemCandidate, parentCandidate, inventory, args, errors)
  const rows = buildRows(itemCandidate, parentCandidate, inventory, args, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no manual-scope source-anchor evidence items were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    manual_scope_source_anchor_evidence_items: rows,
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch',
    selection: {
      include_non_page_ready: args.includeNonPageReady,
      page_ready_only: !args.includeNonPageReady
    },
    source_item_review_manual_scope_indexing_decisions_candidate: args.itemCandidate,
    source_manual_scope_indexing_inventory: args.inventory,
    source_parent_downstream_manual_scope_indexing_decisions_candidate: args.parentCandidate,
    summary: summarize(rows, itemCandidate, parentCandidate, inventory, args),
    valid: errors.length === 0,
    worklist_only: true,
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
