#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist_anchor_domain_rejected_english_pe_audit.md'

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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json \\
  --inventory generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the read-only downstream source-anchor reviewer worklist against the
downstream source-anchor evidence inventory. This audit confirms one review
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
    'downstream_action_decision_must_be_edited_separately',
    'item_level_decision_must_be_edited_separately',
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
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist') {
    errors.push('worklist purpose mismatch')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  if (worklist.source_downstream_source_anchor_evidence_inventory !== args.inventory) {
    errors.push('worklist source_downstream_source_anchor_evidence_inventory must match audit arg')
  }
  validatePolicy('worklist', worklist, errors)
  validateWorklistPolicy('worklist worklist_policy', worklist.worklist_policy || {}, errors)
  if (!Array.isArray(worklist.downstream_source_anchor_review_work_items)) {
    errors.push('worklist downstream_source_anchor_review_work_items must be an array')
  }

  if (inventory.valid !== true) errors.push('inventory valid must be true')
  if ((inventory.errors || []).length) errors.push('inventory errors must be empty')
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory') {
    errors.push('inventory purpose mismatch')
  }
  if (inventory.evidence_inventory_only !== true) errors.push('inventory evidence_inventory_only must be true')
  validatePolicy('inventory', inventory, errors)
  if (!Array.isArray(inventory.inventory_items)) errors.push('inventory inventory_items must be an array')
}

function laneFor(row) {
  if (row.primary_review_bucket === 'multi_source_or_multi_unit_scope_review') {
    return 'source_anchor_unit_or_source_scope_review_lane'
  }
  if (row.primary_review_bucket === 'generic_or_deny_term_anchor_review') {
    return 'source_anchor_generic_or_deny_term_review_lane'
  }
  if (row.primary_review_bucket === 'unit_or_standard_fanout_review') return 'source_anchor_fanout_review_lane'
  if (row.primary_review_bucket === 'low_score_exact_anchor_review') return 'source_anchor_low_score_exact_review_lane'
  if (row.primary_review_bucket === 'single_topic_exact_anchor_review') return 'source_anchor_single_topic_exact_review_lane'
  return 'source_anchor_manual_exact_review_lane'
}

function laneOrder(lane) {
  return {
    source_anchor_fanout_review_lane: 30,
    source_anchor_generic_or_deny_term_review_lane: 20,
    source_anchor_low_score_exact_review_lane: 40,
    source_anchor_manual_exact_review_lane: 60,
    source_anchor_single_topic_exact_review_lane: 50,
    source_anchor_unit_or_source_scope_review_lane: 10
  }[lane] || 90
}

function allowedReviewerOutcomes() {
  return [
    'source_anchor_evidence_found_for_missing_grade',
    'source_anchor_evidence_not_found',
    'source_anchor_scope_not_closed_requires_split',
    'needs_textbook_unit_indexing'
  ]
}

function worklistPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_decision_must_be_edited_separately: true,
    eligible_for_h4g_differentiation: false,
    item_level_decision_must_be_edited_separately: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_item_level_source_review: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    reviewer_worklist_is_not_decision: true,
    writes_public_data: false
  }
}

function reviewChecklist(row) {
  const profile = row.risk_profile || {}
  return uniqueStrings([
    'Review one inventory row at the stated standard+grade+source-batch grain.',
    'Record the exact unit, activity, task, behavior, or page-bounded evidence visible in the source.',
    'Confirm the evidence is same-grade and same-subject before any item-level decision.',
    'Confirm the evidence matches the target anchor type and standard code, not only a shared topic or broad unit title.',
    'Defer or split the item if one review row still mixes multiple source rows, unit evidence ids, or standards.',
    profile.has_multiple_source_rows ? 'Because multiple source rows remain, identify which single source row carries the evidence.' : '',
    profile.has_multiple_unit_evidence_ids ? 'Because multiple unit evidence ids remain, identify which unit evidence id carries the evidence.' : '',
    profile.has_generic_title_deny_term ? 'Because the title contains generic/deny terms, cite exact activity evidence rather than the title.' : '',
    profile.broad_topic_tag_count > 0 ? 'Because broad topic tags are present, reject topic-only support unless exact anchor evidence is visible.' : '',
    profile.has_unit_fanout_risk ? 'Because the unit fans out across standards, explain why this evidence is specific to this standard.' : '',
    profile.has_standard_fanout_risk ? 'Because the standard fans out across units, identify why this unit is the right anchor.' : '',
    profile.has_low_bridge_score ? 'Because bridge score is low, require explicit evidence before any downstream decision.' : ''
  ])
}

function reviewQuestions(row) {
  return uniqueStrings([
    ...(row.review_questions || []),
    `Does ${row.unit_title || 'this unit'} show exact source-anchor evidence for ${row.target_standard_code || row.standard_code || ''}?`,
    'Which exact page-bounded evidence supports or rejects this standard+grade source anchor?',
    'Is this evidence specific enough to distinguish H4G7/H4G8/H4G9, or does it remain shared H4G source text?',
    'Should this item be marked evidence found, evidence not found, scope-not-closed, or still needing unit indexing?'
  ])
}

function workItemId(row) {
  return `h4g_anchor_group_downstream_source_anchor_review_${hashText(row.inventory_item_id)}`
}

function expectedWorkItem(row) {
  const lane = laneFor(row)
  return {
    allowed_reviewer_outcomes: allowedReviewerOutcomes(),
    anchor_requirement_summary: row.anchor_requirement_summary || '',
    anchor_type: row.anchor_type || '',
    downstream_action_decision_id: row.downstream_action_decision_id || '',
    grade_band: row.grade_band || '',
    inventory_item_id: row.inventory_item_id || '',
    item_review_surface: row.item_review_surface || '',
    lane_order: laneOrder(lane),
    manual_review_required: true,
    page_range: row.page_range || '',
    page_range_status: row.page_range_status || '',
    parent_decision_id: row.parent_decision_id || '',
    parent_downstream_decision_id: row.parent_downstream_decision_id || '',
    primary_review_bucket: row.primary_review_bucket || '',
    priority_rank: row.priority_rank,
    priority_tier: row.priority_tier || '',
    progression_group_id: row.progression_group_id || '',
    recommended_disposition: row.recommended_disposition || '',
    required_confirmations_to_close: row.required_confirmations_to_close || [],
    review_checklist: reviewChecklist(row),
    review_grain: row.review_grain || '',
    review_lane: lane,
    review_questions: reviewQuestions(row),
    risk_profile: row.risk_profile || {},
    risk_signals: row.risk_signals || [],
    source_anchor_evidence_item_id: row.source_anchor_evidence_item_id || '',
    source_anchor_review_item_ids: row.source_anchor_review_item_ids || [],
    source_batch: row.source_batch || '',
    source_batch_item_id: row.source_batch_item_id || '',
    source_key: row.source_key || '',
    source_standard_context: row.source_standard_context || {},
    standard_code: row.standard_code || '',
    subject_slug: row.subject_slug || '',
    target_standard_code: row.target_standard_code || row.standard_code || '',
    topic_tags: row.topic_tags || [],
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
  if (workItem.review_lane === 'source_anchor_unit_or_source_scope_review_lane') stats.unit_or_source_scope_review_rows += 1
  if (workItem.review_lane === 'source_anchor_generic_or_deny_term_review_lane') stats.generic_or_deny_term_review_rows += 1
  if (workItem.review_lane === 'source_anchor_fanout_review_lane') stats.fanout_review_rows += 1
  if (workItem.manual_review_required === true) stats.high_risk_rows += 1
}

function summarizeRows(rows) {
  const summary = {
    by_anchor_type: {},
    by_grade_band: {},
    by_primary_review_bucket: {},
    by_priority_tier: {},
    by_recommended_disposition: {},
    by_review_lane: {},
    by_source_batch: {},
    by_subject: {},
    by_target_standard_code: {},
    fanout_review_rows: 0,
    generic_or_deny_term_review_rows: 0,
    high_risk_rows: 0,
    manual_review_required_rows: 0,
    source_anchor_review_work_items: rows.length,
    unit_or_source_scope_review_rows: 0,
    unique_downstream_action_decisions: sorted(rows.map(row => row.downstream_action_decision_id)).length,
    unique_inventory_items: sorted(rows.map(row => row.inventory_item_id)).length,
    unique_parent_downstream_decisions: sorted(rows.map(row => row.parent_downstream_decision_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    if (row.manual_review_required) summary.manual_review_required_rows += 1
    if (row.review_lane === 'source_anchor_unit_or_source_scope_review_lane') summary.unit_or_source_scope_review_rows += 1
    if (row.review_lane === 'source_anchor_generic_or_deny_term_review_lane') summary.generic_or_deny_term_review_rows += 1
    if (row.review_lane === 'source_anchor_fanout_review_lane') summary.fanout_review_rows += 1
    if (row.manual_review_required) summary.high_risk_rows += 1
    countInto(summary.by_anchor_type, row.anchor_type)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_primary_review_bucket, row.primary_review_bucket)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommended_disposition, row.recommended_disposition)
    countInto(summary.by_review_lane, row.review_lane)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.target_standard_code || row.standard_code)
  }
  return summary
}

function validateSummary(worklist, errors) {
  const actual = summarizeRows(worklist.downstream_source_anchor_review_work_items || [])
  if (!sameJson(worklist.summary || {}, actual)) {
    errors.push('worklist summary does not match work item rows')
  }
  return actual
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Review Worklist Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected review work items | ${payload.summary.expected_review_work_items} |
| audited review work items | ${payload.summary.audited_review_work_items} |
| missing review work items | ${payload.summary.missing_review_work_items} |
| extra review work items | ${payload.summary.extra_review_work_items} |
| unit/source scope review rows | ${payload.summary.unit_or_source_scope_review_rows} |
| generic or deny-term review rows | ${payload.summary.generic_or_deny_term_review_rows} |
| fanout review rows | ${payload.summary.fanout_review_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Review Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_review_lane)}

## Review Buckets

| bucket | rows |
| --- | ---: |
${countRows(payload.summary.by_primary_review_bucket)}

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

  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { downstream_source_anchor_review_work_items: [] }
  const inventory = existsSync(args.inventory) ? readJson(args.inventory) : { inventory_items: [] }
  if (!errors.length) validateInputs(worklist, inventory, args, errors)

  const workItems = worklist.downstream_source_anchor_review_work_items || []
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
  stats.unit_or_source_scope_review_rows = 0
  stats.generic_or_deny_term_review_rows = 0
  stats.fanout_review_rows = 0
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
