#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_UNIT_INDEXES = [
  'generated/textbook_evidence/h4g_theme_bridge_r1_page_override_unit_index.json',
  'generated/textbook_evidence/h4g_theme_bridge_remaining_page_override_unit_index.json',
  'generated/textbook_evidence/h4g_after_p2_page_recovery_unit_index.json'
]
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe_audit.md'

function parseArgs(argv) {
  const args = {
    actionDecisions: DEFAULT_ACTION_DECISIONS,
    batch: DEFAULT_BATCH,
    inventory: DEFAULT_INVENTORY,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    unitIndexes: DEFAULT_UNIT_INDEXES
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--inventory') args.inventory = argv[++i]
    else if (item === '--batch') args.batch = argv[++i]
    else if (item === '--action-decisions') args.actionDecisions = argv[++i]
    else if (item === '--unit-indexes') args.unitIndexes = parseList(argv[++i])
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory.js \\
  --inventory generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe.json \\
  --action-decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the read-only downstream manual scope/indexing inventory against the
manual scope/indexing batch, downstream action decisions, and current H4G unit
indexes.`)
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
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

function validateInventoryPolicy(label, policy, errors) {
  for (const key of [
    'downstream_action_decision_must_be_edited_separately',
    'inventory_is_not_reviewer_decision',
    'manual_scope_indexing_inventory_only',
    'requires_manual_scope_review',
    'requires_later_source_anchor_review',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'eligible_for_h4g_differentiation',
    'direct_matcher_use',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (policy[key] !== false) errors.push(`${label}.${key} must be false`)
  }
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

function validateInputs(inventory, batch, actionDecisions, args, errors) {
  if (inventory.valid !== true) errors.push('inventory valid must be true')
  if ((inventory.errors || []).length) errors.push('inventory errors must be empty')
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory') {
    errors.push('inventory purpose mismatch')
  }
  if (inventory.evidence_inventory_only !== true) errors.push('inventory evidence_inventory_only must be true')
  if (inventory.source_downstream_manual_scope_indexing_batch !== args.batch) {
    errors.push('inventory source_downstream_manual_scope_indexing_batch must match audit arg')
  }
  if (inventory.source_downstream_action_decisions !== args.actionDecisions) {
    errors.push('inventory source_downstream_action_decisions must match audit arg')
  }
  if (!sameJson(inventory.source_unit_indexes || [], args.unitIndexes)) {
    errors.push('inventory source_unit_indexes must match audit arg')
  }
  validatePolicy('inventory', inventory, errors)
  validateInventoryPolicy('inventory inventory_policy', inventory.inventory_policy || {}, errors)
  if (!Array.isArray(inventory.inventory_items)) errors.push('inventory inventory_items must be an array')

  if (batch.valid !== true) errors.push('manual scope/indexing batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch') {
    errors.push('manual scope/indexing batch purpose mismatch')
  }
  if (batch.worklist_only !== true) errors.push('manual scope/indexing batch worklist_only must be true')
  validatePolicy('manual scope/indexing batch', batch, errors)
  if (!Array.isArray(batch.manual_scope_indexing_items)) {
    errors.push('manual scope/indexing batch manual_scope_indexing_items must be an array')
  }

  if (actionDecisions.valid !== true) errors.push('action decisions valid must be true')
  if (actionDecisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('action decisions purpose mismatch')
  }
  validatePolicy('action decisions', actionDecisions, errors)
  if (!Array.isArray(actionDecisions.downstream_action_decisions)) {
    errors.push('action decisions downstream_action_decisions must be an array')
  }
}

function gradeLevelForBand(gradeBand, context) {
  const fromContext = Number(context?.grade_level || 0)
  if (fromContext) return fromContext
  if (gradeBand === 'H4G7') return 7
  if (gradeBand === 'H4G8') return 8
  if (gradeBand === 'H4G9') return 9
  return 0
}

function hasPageReadyUnit(unit) {
  return Boolean(unit.page_range || unit.page_start || unit.toc_page_start) && unit.page_range_status !== 'missing'
}

function compactUnit(unit, sourceFile) {
  return {
    edition: unit.edition || '',
    evidence_url: unit.evidence_url || '',
    file_name: unit.file_name || '',
    grade: Number(unit.grade || 0),
    page_range: unit.page_range || '',
    page_range_status: unit.page_range_status || 'missing',
    page_ready: hasPageReadyUnit(unit),
    repository_path: unit.repository_path || '',
    source_unit_index: sourceFile,
    subject_slug: unit.subject_slug || '',
    textbook_evidence_id: unit.textbook_evidence_id || '',
    unit_evidence_id: unit.unit_evidence_id || '',
    unit_level: unit.unit_level || '',
    unit_title: unit.unit_title || ''
  }
}

function loadUnitIndexCoverage(paths, errors, warnings) {
  const units = []
  const files = []
  const bySubjectGrade = {}
  const seenUnits = new Set()
  for (const path of paths) {
    if (!existsSync(path)) {
      warnings.push(`Missing unit index ignored: ${path}`)
      continue
    }
    const payload = readJson(path)
    const rows = Array.isArray(payload.unit_candidates) ? payload.unit_candidates : []
    if (!Array.isArray(payload.unit_candidates)) errors.push(`${path} unit_candidates must be an array`)
    const summary = {
      raw_unit_candidates: rows.length,
      path,
      unit_candidates: 0,
      by_subject_grade: {}
    }
    for (const unit of rows) {
      const compact = compactUnit(unit, path)
      const unitKey = compact.unit_evidence_id || [
        compact.subject_slug,
        compact.grade,
        compact.file_name,
        compact.unit_title
      ].join('|')
      if (seenUnits.has(unitKey)) continue
      seenUnits.add(unitKey)
      units.push(compact)
      summary.unit_candidates += 1
      const key = `${compact.subject_slug}|${compact.grade || 'missing'}`
      countInto(summary.by_subject_grade, key)
      countInto(bySubjectGrade, key)
    }
    files.push(summary)
  }
  return {
    by_subject_grade: bySubjectGrade,
    files,
    unit_candidates: units.length,
    units
  }
}

function matchingSameGradeUnits(item, coverage) {
  const target = item.target_standard_context || item.source_context?.target_standard_context || {}
  const targetGrade = gradeLevelForBand(item.target_grade_band || item.grade_band, target)
  const subject = item.subject_slug || target.subject_slug || ''
  return coverage.units
    .filter(unit => unit.subject_slug === subject)
    .filter(unit => Number(unit.grade || 0) === targetGrade)
    .sort((a, b) => {
      const ready = Number(b.page_ready) - Number(a.page_ready)
      if (ready) return ready
      const title = a.unit_title.localeCompare(b.unit_title)
      if (title) return title
      return a.unit_evidence_id.localeCompare(b.unit_evidence_id)
    })
}

function manualFieldsOpen(item, action) {
  const confirmations = action?.required_confirmations || item.review_decision_template?.required_confirmations || {}
  return Object.entries(confirmations)
    .filter(([, value]) => value === false)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b))
}

function expectedProfile(item, action, coverage) {
  const target = item.target_standard_context || item.source_context?.target_standard_context || {}
  const units = matchingSameGradeUnits(item, coverage)
  const pageReady = units.filter(hasPageReadyUnit)
  const existingGradeBands = sorted(item.existing_grade_bands || item.unit_indexing_request?.existing_grade_bands || [])
  const existingUnitTitles = uniqueStrings(Object.values(item.existing_unit_context_by_grade_band || {}).flat())
  const targetGradeBand = item.target_grade_band || item.grade_band || ''
  return {
    existing_grade_bands: existingGradeBands,
    existing_unit_title_count: existingUnitTitles.length,
    has_cross_grade_existing_evidence: existingGradeBands.some(grade => grade !== targetGradeBand),
    has_page_ready_same_grade_unit_candidates: pageReady.length > 0,
    has_same_grade_unit_index_candidates: units.length > 0,
    manual_confirmation_fields_open: manualFieldsOpen(item, action),
    same_grade_page_missing_candidate_count: units.length - pageReady.length,
    same_grade_page_ready_candidate_count: pageReady.length,
    same_grade_unit_index_candidate_count: units.length,
    target_grade_level: gradeLevelForBand(targetGradeBand, target),
    target_review_status: target.review_status || '',
    target_source_scope: target.source_standard_scope || '',
    target_standard_exists_in_public: Boolean(target.code),
    target_standard_progression_role: target.progression_role || ''
  }
}

function expectedBucket(profile) {
  if (!profile.has_same_grade_unit_index_candidates) return 'manual_scope_indexing_needs_unit_index_materialization'
  if (!profile.has_page_ready_same_grade_unit_candidates) return 'manual_scope_indexing_has_same_grade_candidates_needs_page_recovery'
  if (profile.manual_confirmation_fields_open.length) return 'manual_scope_indexing_has_page_ready_candidates_needs_reviewer_confirmation'
  return 'manual_scope_indexing_candidate_ready_for_source_anchor_review'
}

function expectedDisposition(profile) {
  if (!profile.has_same_grade_unit_index_candidates) return 'materialize_or_index_same_grade_textbook_units_before_decision_candidate'
  if (!profile.has_page_ready_same_grade_unit_candidates) return 'recover_page_ranges_before_source_anchor_review'
  if (profile.manual_confirmation_fields_open.length) return 'manual_scope_confirmation_required_before_decision_candidate'
  return 'ready_for_later_source_anchor_review_after_reviewer_note'
}

function expectedInventoryId(item) {
  return `h4g_anchor_group_downstream_manual_scope_indexing_inventory_${hashText(item.manual_scope_indexing_item_id)}`
}

function validateRow(item, row, action, coverage, errors, stats) {
  const prefix = row.inventory_item_id || item.manual_scope_indexing_item_id || '(missing inventory item)'
  const profile = expectedProfile(item, action, coverage)
  const units = matchingSameGradeUnits(item, coverage)
  if (row.inventory_item_id !== expectedInventoryId(item)) errors.push(`${prefix} inventory_item_id mismatch`)
  if (row.manual_scope_indexing_item_id !== item.manual_scope_indexing_item_id) {
    errors.push(`${prefix} manual_scope_indexing_item_id mismatch`)
  }
  if (row.downstream_action_decision_id !== action?.decision_id) errors.push(`${prefix} downstream_action_decision_id mismatch`)
  if (row.downstream_action_decision_status !== 'pending_review') {
    errors.push(`${prefix} downstream_action_decision_status must remain pending_review`)
  }
  if (row.downstream_action_reviewer_decision !== 'pending') {
    errors.push(`${prefix} downstream_action_reviewer_decision must remain pending`)
  }
  for (const key of [
    'subject_slug',
    'grade_band',
    'target_grade_band',
    'target_standard_code',
    'standard_code',
    'source_standard_code',
    'anchor_type',
    'source_batch',
    'source_batch_item_id',
    'source_key',
    'progression_group_id',
    'priority_tier',
    'item_review_surface',
    'review_grain'
  ]) {
    if (row[key] !== item[key]) errors.push(`${prefix} ${key} mismatch`)
  }
  if (row.parent_downstream_action_work_item_id !== item.parent_downstream_action_work_item_id) {
    errors.push(`${prefix} parent_downstream_action_work_item_id mismatch`)
  }
  if (row.recommended_reviewer_decision !== item.recommended_reviewer_decision) {
    errors.push(`${prefix} recommended_reviewer_decision mismatch`)
  }
  if (!sameJson(row.manual_scope_indexing_profile || {}, profile)) errors.push(`${prefix} manual_scope_indexing_profile mismatch`)
  if (row.manual_scope_indexing_bucket !== expectedBucket(profile)) errors.push(`${prefix} manual_scope_indexing_bucket mismatch`)
  if (row.recommended_disposition !== expectedDisposition(profile)) errors.push(`${prefix} recommended_disposition mismatch`)
  if (row.same_grade_unit_index_candidate_count !== units.length) errors.push(`${prefix} same_grade_unit_index_candidate_count mismatch`)
  if (row.same_grade_unit_index_page_ready_count !== units.filter(hasPageReadyUnit).length) {
    errors.push(`${prefix} same_grade_unit_index_page_ready_count mismatch`)
  }
  if (!sameJson(row.same_grade_unit_index_candidates || [], units.slice(0, 12))) {
    errors.push(`${prefix} same_grade_unit_index_candidates mismatch`)
  }
  if (!sameJson(row.risk_signals || [], item.risk_signals || [])) errors.push(`${prefix} risk_signals mismatch`)
  validateInventoryPolicy(`${prefix} inventory_policy`, row.inventory_policy || {}, errors)

  stats.audited_inventory_items += 1
  if (profile.has_cross_grade_existing_evidence) stats.cross_grade_existing_evidence_rows += 1
  if (profile.manual_confirmation_fields_open.length) stats.manual_confirmation_required_rows += 1
  if (profile.has_same_grade_unit_index_candidates) stats.same_grade_unit_index_candidate_rows += 1
  else stats.no_same_grade_unit_index_candidate_rows += 1
  if (profile.has_page_ready_same_grade_unit_candidates) stats.page_ready_same_grade_unit_candidate_rows += 1
  if (profile.has_same_grade_unit_index_candidates && !profile.has_page_ready_same_grade_unit_candidates) {
    stats.same_grade_unit_index_page_missing_only_rows += 1
  }
  stats.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
  countInto(stats.by_manual_scope_indexing_bucket, row.manual_scope_indexing_bucket)
  countInto(stats.by_priority_tier, row.priority_tier)
  countInto(stats.by_recommended_disposition, row.recommended_disposition)
  countInto(stats.by_subject, row.subject_slug)
  countInto(stats.by_target_grade_band, row.target_grade_band)
  countInto(stats.by_target_standard_code, row.target_standard_code)
}

function summarize(rows, coverage) {
  return {
    audited_inventory_items: 0,
    by_manual_scope_indexing_bucket: {},
    by_priority_tier: {},
    by_recommended_disposition: {},
    by_subject: {},
    by_target_grade_band: {},
    by_target_standard_code: {},
    cross_grade_existing_evidence_rows: 0,
    expected_inventory_items: 0,
    extra_inventory_items: 0,
    inventory_items: rows.length,
    manual_confirmation_required_rows: 0,
    manual_scope_indexing_items: rows.length,
    missing_inventory_items: 0,
    no_same_grade_unit_index_candidate_rows: 0,
    page_ready_same_grade_unit_candidate_rows: 0,
    same_grade_unit_index_candidate_rows: 0,
    same_grade_unit_index_page_missing_only_rows: 0,
    source_anchor_review_rows: 0,
    unit_index_candidate_rows: coverage.unit_candidates,
    unit_index_files_available: coverage.files.length
  }
}

function validateSummary(inventory, stats, errors) {
  const summary = inventory.summary || {}
  for (const key of [
    'inventory_items',
    'manual_scope_indexing_items',
    'cross_grade_existing_evidence_rows',
    'manual_confirmation_required_rows',
    'no_same_grade_unit_index_candidate_rows',
    'page_ready_same_grade_unit_candidate_rows',
    'same_grade_unit_index_candidate_rows',
    'same_grade_unit_index_page_missing_only_rows',
    'source_anchor_review_rows',
    'unit_index_candidate_rows',
    'unit_index_files_available'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`summary.${key} mismatch: expected ${stats[key]}, got ${summary[key]}`)
  }
  for (const key of [
    'by_manual_scope_indexing_bucket',
    'by_priority_tier',
    'by_recommended_disposition',
    'by_subject',
    'by_target_grade_band',
    'by_target_standard_code'
  ]) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`summary.${key} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Downstream Manual Scope/Indexing Inventory Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected inventory items | ${payload.summary.expected_inventory_items} |
| audited inventory items | ${payload.summary.audited_inventory_items} |
| missing inventory items | ${payload.summary.missing_inventory_items} |
| extra inventory items | ${payload.summary.extra_inventory_items} |
| same-grade unit-index candidate rows | ${payload.summary.same_grade_unit_index_candidate_rows} |
| no same-grade unit-index candidate rows | ${payload.summary.no_same_grade_unit_index_candidate_rows} |
| page-ready same-grade candidate rows | ${payload.summary.page_ready_same_grade_unit_candidate_rows} |
| page-missing-only candidate rows | ${payload.summary.same_grade_unit_index_page_missing_only_rows} |
| cross-grade existing evidence rows | ${payload.summary.cross_grade_existing_evidence_rows} |
| manual confirmation required rows | ${payload.summary.manual_confirmation_required_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Review Buckets

| bucket | rows |
| --- | ---: |
${countRows(payload.summary.by_manual_scope_indexing_bucket)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  const warnings = []
  for (const [label, path] of [
    ['inventory', args.inventory],
    ['manual scope/indexing batch', args.batch],
    ['action decisions', args.actionDecisions]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const inventory = existsSync(args.inventory) ? readJson(args.inventory) : { inventory_items: [] }
  const batch = existsSync(args.batch) ? readJson(args.batch) : { manual_scope_indexing_items: [] }
  const actionDecisions = existsSync(args.actionDecisions) ? readJson(args.actionDecisions) : { downstream_action_decisions: [] }
  if (!errors.length) validateInputs(inventory, batch, actionDecisions, args, errors)
  const coverage = loadUnitIndexCoverage(args.unitIndexes, errors, warnings)

  if (!sameJson(inventory.unit_index_coverage || {}, {
    by_subject_grade: coverage.by_subject_grade,
    files: coverage.files,
    unit_candidates: coverage.unit_candidates
  })) {
    errors.push('inventory unit_index_coverage mismatch')
  }

  const inventoryBySourceItem = mapBy(inventory.inventory_items || [], 'manual_scope_indexing_item_id', errors, 'inventory')
  const batchBySourceItem = mapBy(batch.manual_scope_indexing_items || [], 'manual_scope_indexing_item_id', errors, 'batch')
  const actionBySourceItem = mapBy(actionDecisions.downstream_action_decisions || [], 'source_downstream_action_item_id', errors, 'action decisions')
  const stats = summarize(inventory.inventory_items || [], coverage)
  stats.expected_inventory_items = (batch.manual_scope_indexing_items || []).length

  if ((inventory.inventory_items || []).length !== (batch.manual_scope_indexing_items || []).length) {
    errors.push(`inventory rows ${(inventory.inventory_items || []).length} must match manual scope/indexing rows ${(batch.manual_scope_indexing_items || []).length}`)
  }

  for (const [sourceItemId, item] of batchBySourceItem.entries()) {
    const row = inventoryBySourceItem.get(sourceItemId)
    const action = actionBySourceItem.get(sourceItemId)
    if (!row) {
      stats.missing_inventory_items += 1
      errors.push(`${sourceItemId} missing inventory item`)
      continue
    }
    if (!action) {
      errors.push(`${sourceItemId} missing action decision`)
      continue
    }
    validateRow(item, row, action, coverage, errors, stats)
  }

  for (const sourceItemId of inventoryBySourceItem.keys()) {
    if (!batchBySourceItem.has(sourceItemId)) {
      stats.extra_inventory_items += 1
      errors.push(`${sourceItemId} unexpected inventory item`)
    }
  }

  if (args.requireItems && !stats.audited_inventory_items) {
    errors.push('requireItems is set but no inventory rows were audited')
  }
  if (stats.audited_inventory_items !== stats.expected_inventory_items) {
    errors.push(`audited inventory items ${stats.audited_inventory_items} must match expected ${stats.expected_inventory_items}`)
  }
  validateSummary(inventory, stats, errors)

  return {
    action_decisions: args.actionDecisions,
    batch: args.batch,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    inventory: args.inventory,
    matcher_ready: false,
    publication_ready: false,
    require_items: args.requireItems,
    source_unit_indexes: args.unitIndexes,
    summary: stats,
    unit_index_coverage: {
      by_subject_grade: coverage.by_subject_grade,
      files: coverage.files,
      unit_candidates: coverage.unit_candidates
    },
    valid: errors.length === 0,
    warnings,
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
