#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe_audit.md'

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    inventory: DEFAULT_INVENTORY,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--inventory') args.inventory = argv[++i]
    else if (item === '--batch') args.batch = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory.js \\
  --inventory generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the read-only manual-scope source-anchor evidence inventory against the
manual-scope source-anchor evidence batch.`)
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

function validateInventoryPolicy(label, policy, errors) {
  for (const key of [
    'inventory_is_not_reviewer_decision',
    'manual_scope_source_anchor_inventory_only',
    'requires_later_item_level_source_review',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_manual_source_anchor_review',
    'source_anchor_evidence_row_must_be_reviewed_separately'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function validateInputs(inventory, batch, args, errors) {
  if (inventory.valid !== true) errors.push('inventory valid must be true')
  if ((inventory.errors || []).length) errors.push('inventory errors must be empty')
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory') {
    errors.push('inventory purpose mismatch')
  }
  if (inventory.evidence_inventory_only !== true) errors.push('inventory evidence_inventory_only must be true')
  if (inventory.source_manual_scope_source_anchor_evidence_batch !== args.batch) {
    errors.push('inventory source_manual_scope_source_anchor_evidence_batch must match audit arg')
  }
  validatePolicy('inventory', inventory, errors)
  validateInventoryPolicy('inventory inventory_policy', inventory.inventory_policy || {}, errors)
  if (!Array.isArray(inventory.inventory_items)) errors.push('inventory inventory_items must be an array')

  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch') {
    errors.push('batch purpose mismatch')
  }
  if (batch.worklist_only !== true) errors.push('batch worklist_only must be true')
  if (batch.selection?.page_ready_only !== true) errors.push('batch selection.page_ready_only must be true')
  validatePolicy('batch', batch, errors)
  if (!Array.isArray(batch.manual_scope_source_anchor_evidence_items)) {
    errors.push('batch manual_scope_source_anchor_evidence_items must be an array')
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function titleRiskTerms(title) {
  const normalized = normalizeText(title)
  const terms = []
  if (!normalized) terms.push('missing_unit_title')
  if (/language in use/i.test(title || '')) terms.push('generic_language_in_use_title')
  if (/理论知识/.test(title || '')) terms.push('broad_theory_knowledge_title')
  if (/足球\s*$/.test(title || '')) terms.push('broad_sport_chapter_title')
  if (/^unit\s+\d+\s*$/i.test(normalized)) terms.push('unit_number_only_title')
  return sorted(terms)
}

function buildFanoutMaps(rows) {
  const unitRows = new Map()
  const titleRows = new Map()
  for (const row of rows) {
    const unitKey = row.unit_evidence_id || ''
    const titleKey = normalizeText(row.unit_title)
    if (unitKey) {
      if (!unitRows.has(unitKey)) unitRows.set(unitKey, [])
      unitRows.get(unitKey).push(row)
    }
    if (titleKey) {
      if (!titleRows.has(titleKey)) titleRows.set(titleKey, [])
      titleRows.get(titleKey).push(row)
    }
  }
  return { titleRows, unitRows }
}

function riskProfile(row, context) {
  const unitRows = context.unitRows.get(row.unit_evidence_id || '') || []
  const titleRows = context.titleRows.get(normalizeText(row.unit_title)) || []
  const sourceStandard = normalizeText(row.source_standard_context?.standard)
  const targetStandard = normalizeText(row.target_standard_context?.standard)
  const terms = titleRiskTerms(row.unit_title || '')
  const unitTargetCodes = sorted(unitRows.map(item => item.target_standard_code))
  const unitItemDecisionIds = sorted(unitRows.map(item => item.item_review_decision_id))
  const titleTargetCodes = sorted(titleRows.map(item => item.target_standard_code))
  const profile = {
    generic_title_terms: terms,
    has_generic_or_broad_title: terms.length > 0,
    has_non_unit_level_grain: !['unit'].includes(row.unit_context?.unit_level || ''),
    has_page_start_only_boundary: row.page_range_status === 'toc_page_start_only',
    has_reused_unit_across_item_decisions: unitItemDecisionIds.length > 1,
    has_reused_unit_across_target_standards: unitTargetCodes.length > 1,
    has_reused_title_across_target_standards: titleTargetCodes.length > 1,
    has_source_target_standard_text_identical: Boolean(sourceStandard && targetStandard && sourceStandard === targetStandard),
    source_target_progression_pair: `${row.source_standard_context?.progression_role || 'missing'}->${row.target_standard_context?.progression_role || 'missing'}`,
    target_source_scope: row.target_standard_context?.source_standard_scope || '',
    title_candidate_rows: titleRows.length,
    title_target_standard_count: titleTargetCodes.length,
    unit_candidate_rows: unitRows.length,
    unit_item_decision_count: unitItemDecisionIds.length,
    unit_level: row.unit_context?.unit_level || '',
    unit_target_standard_count: unitTargetCodes.length
  }
  profile.risk_score = [
    profile.has_generic_or_broad_title,
    profile.has_non_unit_level_grain,
    profile.has_page_start_only_boundary,
    profile.has_reused_unit_across_item_decisions,
    profile.has_reused_unit_across_target_standards,
    profile.has_reused_title_across_target_standards,
    profile.has_source_target_standard_text_identical,
    profile.target_source_scope === 'stage_shared_7_9'
  ].filter(Boolean).length + terms.length
  return profile
}

function riskSignals(profile) {
  const signals = []
  for (const term of profile.generic_title_terms || []) signals.push(`generic_title:${term}`)
  if (profile.has_non_unit_level_grain) signals.push(`non_unit_level:${profile.unit_level || 'missing'}`)
  if (profile.has_page_start_only_boundary) signals.push('page_boundary_start_only')
  if (profile.has_reused_unit_across_item_decisions) signals.push(`unit_reused_across_item_decisions:${profile.unit_item_decision_count}`)
  if (profile.has_reused_unit_across_target_standards) signals.push(`unit_reused_across_target_standards:${profile.unit_target_standard_count}`)
  if (profile.has_reused_title_across_target_standards) signals.push(`title_reused_across_target_standards:${profile.title_target_standard_count}`)
  if (profile.has_source_target_standard_text_identical) signals.push('source_target_standard_text_identical')
  if (profile.target_source_scope === 'stage_shared_7_9') signals.push('target_standard_scope_stage_shared_7_9')
  return sorted(signals)
}

function primaryReviewBucket(profile) {
  if (profile.has_generic_or_broad_title) return 'generic_or_broad_title_exact_anchor_review'
  if (profile.has_reused_unit_across_target_standards || profile.has_reused_title_across_target_standards) {
    return 'unit_or_title_fanout_exact_anchor_review'
  }
  if (profile.has_source_target_standard_text_identical) return 'source_target_identical_text_grade_specific_review'
  if (profile.has_non_unit_level_grain) return 'non_unit_level_grain_review'
  if (profile.has_page_start_only_boundary) return 'toc_start_only_page_boundary_review'
  return 'manual_exact_anchor_review_required'
}

function recommendedDisposition(profile) {
  if (profile.has_generic_or_broad_title) return 'title_too_generic_requires_exact_activity_evidence'
  if (profile.has_reused_unit_across_target_standards || profile.has_reused_title_across_target_standards) {
    return 'unit_fanout_requires_target_specific_evidence'
  }
  if (profile.has_source_target_standard_text_identical) return 'shared_standard_text_requires_grade_specific_anchor'
  if (profile.has_non_unit_level_grain) return 'non_unit_level_requires_source_grain_confirmation'
  if (profile.has_page_start_only_boundary) return 'page_boundary_requires_reviewer_confirmation'
  return 'exact_anchor_evidence_not_yet_verified'
}

function expectedInventoryId(item) {
  return `h4g_anchor_group_manual_scope_source_anchor_inventory_${hashText(item.manual_scope_source_anchor_evidence_item_id)}`
}

function validateRow(item, row, context, errors, stats) {
  const prefix = row.inventory_item_id || item.manual_scope_source_anchor_evidence_item_id || '(inventory item)'
  const profile = riskProfile(item, context)
  if (row.inventory_item_id !== expectedInventoryId(item)) errors.push(`${prefix} inventory_item_id mismatch`)
  if (row.manual_scope_source_anchor_evidence_item_id !== item.manual_scope_source_anchor_evidence_item_id) {
    errors.push(`${prefix} manual_scope_source_anchor_evidence_item_id mismatch`)
  }
  for (const key of [
    'anchor_type',
    'grade_band',
    'item_review_decision_id',
    'item_review_surface',
    'manual_scope_indexing_item_id',
    'page_range',
    'page_range_status',
    'parent_downstream_decision_id',
    'priority_rank',
    'priority_tier',
    'progression_group_id',
    'review_grain',
    'source_item_standard_code',
    'source_key',
    'standard_code',
    'subject_slug',
    'target_grade_band',
    'target_standard_code',
    'unit_evidence_id',
    'unit_title'
  ]) {
    if (!sameJson(row[key], item[key])) errors.push(`${prefix} ${key} mismatch`)
  }
  if (row.decision_type !== 'anchor_group_manual_scope_source_anchor_evidence_inventory_item') {
    errors.push(`${prefix} decision_type mismatch`)
  }
  if (row.page_ready !== (item.page_ready === true)) errors.push(`${prefix} page_ready mismatch`)
  if (row.unit_level !== (item.unit_context?.unit_level || '')) errors.push(`${prefix} unit_level mismatch`)
  if (!sameJson(row.unit_context || {}, item.unit_context || {})) errors.push(`${prefix} unit_context mismatch`)
  if (!sameJson(row.risk_profile || {}, profile)) errors.push(`${prefix} risk_profile mismatch`)
  if (!sameJson(row.risk_signals || [], riskSignals(profile))) errors.push(`${prefix} risk_signals mismatch`)
  if (row.primary_review_bucket !== primaryReviewBucket(profile)) errors.push(`${prefix} primary_review_bucket mismatch`)
  if (row.recommended_disposition !== recommendedDisposition(profile)) errors.push(`${prefix} recommended_disposition mismatch`)
  if (!row.source_standard_summary?.standard) errors.push(`${prefix} source_standard_summary.standard must be present`)
  if (!row.target_standard_summary?.standard) errors.push(`${prefix} target_standard_summary.standard must be present`)
  if (row.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
  validateInventoryPolicy(`${prefix} inventory_policy`, row.inventory_policy || {}, errors)

  stats.audited_inventory_items += 1
  if (profile.has_generic_or_broad_title) stats.generic_or_broad_title_rows += 1
  if (profile.has_non_unit_level_grain) stats.non_unit_level_rows += 1
  if (profile.has_page_start_only_boundary) stats.page_start_only_rows += 1
  if (profile.has_reused_unit_across_target_standards) stats.reused_unit_across_target_rows += 1
  if (profile.has_source_target_standard_text_identical) stats.source_target_identical_text_rows += 1
  if (Number(profile.risk_score || 0) >= 4) stats.high_risk_rows += 1
}

function summarize(rows) {
  const stats = {
    audited_inventory_items: 0,
    by_grade_band: {},
    by_page_range_status: {},
    by_primary_review_bucket: {},
    by_recommended_disposition: {},
    by_subject: {},
    by_target_standard_code: {},
    by_unit_level: {},
    expected_inventory_items: 0,
    extra_inventory_items: 0,
    generic_or_broad_title_rows: 0,
    high_risk_rows: 0,
    inventory_items: rows.length,
    missing_inventory_items: 0,
    non_unit_level_rows: 0,
    page_start_only_rows: 0,
    reused_unit_across_target_rows: 0,
    source_target_identical_text_rows: 0
  }
  for (const row of rows) {
    countInto(stats.by_grade_band, row.target_grade_band || row.grade_band)
    countInto(stats.by_page_range_status, row.page_range_status)
    countInto(stats.by_primary_review_bucket, row.primary_review_bucket)
    countInto(stats.by_recommended_disposition, row.recommended_disposition)
    countInto(stats.by_subject, row.subject_slug)
    countInto(stats.by_target_standard_code, row.target_standard_code)
    countInto(stats.by_unit_level, row.unit_level)
  }
  return stats
}

function validateSummary(inventory, stats, errors) {
  const summary = inventory.summary || {}
  for (const [field, expected] of [
    ['inventory_items', stats.inventory_items],
    ['source_anchor_evidence_items', stats.expected_inventory_items],
    ['manual_review_required_rows', stats.expected_inventory_items],
    ['generic_or_broad_title_rows', stats.generic_or_broad_title_rows],
    ['reused_unit_across_target_rows', stats.reused_unit_across_target_rows],
    ['source_target_identical_text_rows', stats.source_target_identical_text_rows],
    ['page_start_only_rows', stats.page_start_only_rows],
    ['high_risk_rows', stats.high_risk_rows]
  ]) {
    if (Number(summary[field] || 0) !== Number(expected || 0)) {
      errors.push(`inventory summary.${field} must be ${expected}`)
    }
  }
}

function markdownSummary(payload) {
  return `# H4G Manual Scope Source-Anchor Evidence Inventory Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected inventory items | ${payload.summary.expected_inventory_items} |
| audited inventory items | ${payload.summary.audited_inventory_items} |
| missing inventory items | ${payload.summary.missing_inventory_items} |
| extra inventory items | ${payload.summary.extra_inventory_items} |
| generic or broad title rows | ${payload.summary.generic_or_broad_title_rows} |
| reused unit across target rows | ${payload.summary.reused_unit_across_target_rows} |
| source-target identical text rows | ${payload.summary.source_target_identical_text_rows} |
| high risk rows | ${payload.summary.high_risk_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Review Buckets

| bucket | rows |
| --- | ---: |
${countRows(payload.summary.by_primary_review_bucket)}

## Dispositions

| disposition | rows |
| --- | ---: |
${countRows(payload.summary.by_recommended_disposition)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['inventory', args.inventory],
    ['batch', args.batch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const inventory = existsSync(args.inventory) ? readJson(args.inventory) : { inventory_items: [] }
  const batch = existsSync(args.batch) ? readJson(args.batch) : { manual_scope_source_anchor_evidence_items: [] }
  if (!errors.length) validateInputs(inventory, batch, args, errors)

  const batchRows = batch.manual_scope_source_anchor_evidence_items || []
  const inventoryBySourceItem = mapBy(inventory.inventory_items || [], 'manual_scope_source_anchor_evidence_item_id', errors, 'inventory')
  const batchBySourceItem = mapBy(batchRows, 'manual_scope_source_anchor_evidence_item_id', errors, 'batch')
  const context = buildFanoutMaps(batchRows)
  const stats = summarize(inventory.inventory_items || [])
  stats.expected_inventory_items = batchRows.length

  if ((inventory.inventory_items || []).length !== batchRows.length) {
    errors.push(`inventory rows ${(inventory.inventory_items || []).length} must match source batch rows ${batchRows.length}`)
  }
  for (const [sourceItemId, item] of batchBySourceItem.entries()) {
    const row = inventoryBySourceItem.get(sourceItemId)
    if (!row) {
      stats.missing_inventory_items += 1
      errors.push(`${sourceItemId} missing inventory item`)
      continue
    }
    validateRow(item, row, context, errors, stats)
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
    batch: args.batch,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    inventory: args.inventory,
    matcher_ready: false,
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
