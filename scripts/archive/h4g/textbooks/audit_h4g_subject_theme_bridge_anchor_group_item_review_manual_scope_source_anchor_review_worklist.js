#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist_anchor_domain_rejected_english_pe_audit.md'

function parseArgs(argv) {
  const args = {
    inventory: DEFAULT_INVENTORY,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--inventory') args.inventory = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json \\
  --inventory generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the read-only manual-scope source-anchor reviewer worklist against the
manual-scope source-anchor evidence inventory. This audit confirms one review
task per inventory row and keeps matcher/publication gates disabled.`)
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

function validateWorklistPolicy(label, policy, errors) {
  for (const key of [
    'item_review_decision_must_be_edited_separately',
    'requires_later_item_level_source_review',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'reviewer_worklist_is_not_decision'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function validateInputs(worklist, inventory, args, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if ((worklist.errors || []).length) errors.push('worklist errors must be empty')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist') {
    errors.push('worklist purpose mismatch')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  if (worklist.source_manual_scope_source_anchor_evidence_inventory !== args.inventory) {
    errors.push('worklist source_manual_scope_source_anchor_evidence_inventory must match audit arg')
  }
  validatePolicy('worklist', worklist, errors)
  validateWorklistPolicy('worklist worklist_policy', worklist.worklist_policy || {}, errors)
  if (!Array.isArray(worklist.manual_scope_source_anchor_review_work_items)) {
    errors.push('worklist manual_scope_source_anchor_review_work_items must be an array')
  }

  if (inventory.valid !== true) errors.push('inventory valid must be true')
  if ((inventory.errors || []).length) errors.push('inventory errors must be empty')
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory') {
    errors.push('inventory purpose mismatch')
  }
  if (inventory.evidence_inventory_only !== true) errors.push('inventory evidence_inventory_only must be true')
  validatePolicy('inventory', inventory, errors)
  if (!Array.isArray(inventory.inventory_items)) errors.push('inventory inventory_items must be an array')
}

function laneFor(row) {
  if (row.primary_review_bucket === 'generic_or_broad_title_exact_anchor_review') {
    return 'generic_title_exact_activity_review_lane'
  }
  if (row.primary_review_bucket === 'unit_or_title_fanout_exact_anchor_review') {
    return 'unit_fanout_target_specific_review_lane'
  }
  if (row.primary_review_bucket === 'source_target_identical_text_grade_specific_review') {
    return 'shared_standard_text_grade_specific_review_lane'
  }
  if (row.primary_review_bucket === 'non_unit_level_grain_review') return 'non_unit_grain_review_lane'
  if (row.primary_review_bucket === 'toc_start_only_page_boundary_review') return 'page_boundary_review_lane'
  return 'manual_exact_anchor_review_lane'
}

function laneOrder(lane) {
  return {
    generic_title_exact_activity_review_lane: 10,
    manual_exact_anchor_review_lane: 60,
    non_unit_grain_review_lane: 40,
    page_boundary_review_lane: 50,
    shared_standard_text_grade_specific_review_lane: 30,
    unit_fanout_target_specific_review_lane: 20
  }[lane] || 90
}

function reviewChecklist(row) {
  const profile = row.risk_profile || {}
  return uniqueStrings([
    'Record the exact learner activity, task, or page-bounded evidence visible in the unit.',
    'Confirm the evidence matches the target standard code and target grade, not only the shared H4G progression text.',
    'Confirm the evidence is same-grade and same-subject.',
    'Reject or defer if the unit title alone is the only evidence.',
    profile.has_generic_or_broad_title ? 'Because the unit title is broad or generic, cite the exact activity inside the unit rather than the title.' : '',
    profile.has_reused_unit_across_target_standards ? 'Because this unit fans out across target standards, explain why the evidence is specific to this target standard.' : '',
    profile.has_source_target_standard_text_identical ? 'Because source and target standard text are identical, identify the grade-specific anchor that distinguishes this H4G target.' : '',
    profile.has_non_unit_level_grain ? 'Because the source grain is not a normal unit, confirm the reviewed source section is bounded enough.' : '',
    profile.has_page_start_only_boundary ? 'Because the page range is start-only, confirm the page boundary before accepting evidence.' : ''
  ])
}

function allowedReviewerOutcomes() {
  return [
    'source_anchor_evidence_found_for_missing_grade',
    'source_anchor_evidence_not_found',
    'needs_textbook_unit_indexing'
  ]
}

function worklistPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    item_review_decision_must_be_edited_separately: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_item_level_source_review: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    reviewer_worklist_is_not_decision: true,
    writes_public_data: false
  }
}

function workItemId(row) {
  return `h4g_anchor_group_manual_scope_source_anchor_review_${hashText(row.inventory_item_id)}`
}

function reviewQuestions(row) {
  return uniqueStrings([
    `Does ${row.unit_title || 'this unit'} show exact source-anchor evidence for ${row.target_standard_code || ''}?`,
    'What exact activity, task, wording, or content proves the target standard?',
    'Why is this evidence specific to the target grade and target standard rather than only the shared H4G text?',
    'Should this item be marked evidence found, evidence not found, or still needing unit indexing?'
  ])
}

function expectedWorkItem(row) {
  const lane = laneFor(row)
  return {
    allowed_reviewer_outcomes: allowedReviewerOutcomes(),
    anchor_type: row.anchor_type || '',
    evidence_url: row.unit_context?.evidence_url || '',
    grade_band: row.grade_band || '',
    inventory_item_id: row.inventory_item_id || '',
    item_review_decision_id: row.item_review_decision_id || '',
    lane_order: laneOrder(lane),
    manual_review_required: true,
    manual_scope_source_anchor_evidence_item_id: row.manual_scope_source_anchor_evidence_item_id || '',
    page_range: row.page_range || '',
    page_range_status: row.page_range_status || '',
    parent_downstream_decision_id: row.parent_downstream_decision_id || '',
    priority_rank: row.priority_rank,
    priority_tier: row.priority_tier || '',
    recommended_disposition: row.recommended_disposition || '',
    repository_path: row.unit_context?.repository_path || '',
    review_checklist: reviewChecklist(row),
    review_lane: lane,
    review_questions: reviewQuestions(row),
    risk_profile: row.risk_profile || {},
    risk_signals: row.risk_signals || [],
    source_item_standard_code: row.source_item_standard_code || '',
    source_key: row.source_key || '',
    source_standard_summary: row.source_standard_summary || {},
    subject_slug: row.subject_slug || '',
    target_grade_band: row.target_grade_band || row.grade_band || '',
    target_standard_code: row.target_standard_code || '',
    target_standard_summary: row.target_standard_summary || {},
    unit_context: row.unit_context || {},
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || '',
    work_item_id: workItemId(row),
    worklist_policy: worklistPolicy(),
    worklist_only: true,
    writes_public_data: false
  }
}

function validateWorkItem(inventoryRow, workItem, errors, stats) {
  const prefix = workItem.work_item_id || inventoryRow.inventory_item_id || '(review work item)'
  const expected = expectedWorkItem(inventoryRow)
  if (!sameJson(Object.keys(workItem).sort(), Object.keys(expected).sort())) {
    errors.push(`${prefix} field set mismatch`)
  }
  for (const key of Object.keys(expected)) {
    if (!sameJson(workItem[key], expected[key])) errors.push(`${prefix} ${key} mismatch`)
  }
  validateWorklistPolicy(`${prefix} worklist_policy`, workItem.worklist_policy || {}, errors)

  stats.audited_review_work_items += 1
  if (workItem.manual_review_required === true) stats.manual_review_required_rows += 1
  if (workItem.review_lane === 'generic_title_exact_activity_review_lane') stats.generic_title_review_rows += 1
  if (workItem.review_lane === 'unit_fanout_target_specific_review_lane') stats.unit_fanout_review_rows += 1
  if (Number(workItem.risk_profile?.risk_score || 0) >= 4) stats.high_risk_rows += 1
}

function summarizeRows(rows) {
  const summary = {
    by_grade_band: {},
    by_priority_tier: {},
    by_recommended_disposition: {},
    by_review_lane: {},
    by_subject: {},
    by_target_standard_code: {},
    generic_title_review_rows: 0,
    high_risk_rows: 0,
    manual_review_required_rows: 0,
    source_anchor_review_work_items: rows.length,
    unique_item_review_decisions: sorted(rows.map(row => row.item_review_decision_id)).length,
    unique_inventory_items: sorted(rows.map(row => row.inventory_item_id)).length,
    unique_target_standard_codes: sorted(rows.map(row => row.target_standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length,
    unit_fanout_review_rows: 0
  }
  for (const row of rows) {
    if (row.manual_review_required) summary.manual_review_required_rows += 1
    if (row.review_lane === 'generic_title_exact_activity_review_lane') summary.generic_title_review_rows += 1
    if (row.review_lane === 'unit_fanout_target_specific_review_lane') summary.unit_fanout_review_rows += 1
    if (Number(row.risk_profile?.risk_score || 0) >= 4) summary.high_risk_rows += 1
    countInto(summary.by_grade_band, row.target_grade_band || row.grade_band)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommended_disposition, row.recommended_disposition)
    countInto(summary.by_review_lane, row.review_lane)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.target_standard_code)
  }
  return summary
}

function validateSummary(worklist, errors) {
  const actual = summarizeRows(worklist.manual_scope_source_anchor_review_work_items || [])
  if (!sameJson(worklist.summary || {}, actual)) {
    errors.push('worklist summary does not match work item rows')
  }
  return actual
}

function markdownSummary(payload) {
  return `# H4G Manual Scope Source-Anchor Review Worklist Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected review work items | ${payload.summary.expected_review_work_items} |
| audited review work items | ${payload.summary.audited_review_work_items} |
| missing review work items | ${payload.summary.missing_review_work_items} |
| extra review work items | ${payload.summary.extra_review_work_items} |
| manual review required rows | ${payload.summary.manual_review_required_rows} |
| generic title review rows | ${payload.summary.generic_title_review_rows} |
| unit fanout review rows | ${payload.summary.unit_fanout_review_rows} |
| high risk rows | ${payload.summary.high_risk_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Review Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_review_lane)}

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
    ['worklist', args.worklist],
    ['inventory', args.inventory]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { manual_scope_source_anchor_review_work_items: [] }
  const inventory = existsSync(args.inventory) ? readJson(args.inventory) : { inventory_items: [] }
  if (!errors.length) validateInputs(worklist, inventory, args, errors)

  const workItems = worklist.manual_scope_source_anchor_review_work_items || []
  const inventoryRows = inventory.inventory_items || []
  const workItemByInventoryItem = mapBy(workItems, 'inventory_item_id', errors, 'worklist')
  const inventoryByInventoryItem = mapBy(inventoryRows, 'inventory_item_id', errors, 'inventory')
  const rowSummary = validateSummary(worklist, errors)
  const stats = {
    ...rowSummary,
    audited_review_work_items: 0,
    expected_review_work_items: inventoryRows.length,
    extra_review_work_items: 0,
    missing_review_work_items: 0
  }
  stats.manual_review_required_rows = 0
  stats.generic_title_review_rows = 0
  stats.unit_fanout_review_rows = 0
  stats.high_risk_rows = 0

  if (workItems.length !== inventoryRows.length) {
    errors.push(`worklist rows ${workItems.length} must match inventory rows ${inventoryRows.length}`)
  }
  for (const [inventoryItemId, inventoryRow] of inventoryByInventoryItem.entries()) {
    const workItem = workItemByInventoryItem.get(inventoryItemId)
    if (!workItem) {
      stats.missing_review_work_items += 1
      errors.push(`${inventoryItemId} missing review work item`)
      continue
    }
    validateWorkItem(inventoryRow, workItem, errors, stats)
  }
  for (const inventoryItemId of workItemByInventoryItem.keys()) {
    if (!inventoryByInventoryItem.has(inventoryItemId)) {
      stats.extra_review_work_items += 1
      errors.push(`${inventoryItemId} unexpected review work item`)
    }
  }
  if (args.requireItems && !stats.audited_review_work_items) {
    errors.push('requireItems is set but no review work items were audited')
  }
  if (stats.audited_review_work_items !== stats.expected_review_work_items) {
    errors.push(`audited review work items ${stats.audited_review_work_items} must match expected ${stats.expected_review_work_items}`)
  }

  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    inventory: args.inventory,
    matcher_ready: false,
    publication_ready: false,
    require_items: args.requireItems,
    summary: stats,
    valid: errors.length === 0,
    worklist: args.worklist,
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
  const payload = audit(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
