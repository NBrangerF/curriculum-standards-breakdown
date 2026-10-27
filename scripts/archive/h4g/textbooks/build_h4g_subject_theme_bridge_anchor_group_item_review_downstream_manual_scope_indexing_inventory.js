#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_UNIT_INDEXES = [
  'generated/textbook_evidence/h4g_theme_bridge_r1_page_override_unit_index.json',
  'generated/textbook_evidence/h4g_theme_bridge_remaining_page_override_unit_index.json',
  'generated/textbook_evidence/h4g_after_p2_page_recovery_unit_index.json'
]
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.md'

function parseArgs(argv) {
  const args = {
    actionDecisions: DEFAULT_ACTION_DECISIONS,
    batch: DEFAULT_BATCH,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    unitIndexes: DEFAULT_UNIT_INDEXES
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe.json \\
  --action-decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only manual scope/indexing inventory for H4G target-grade unit
indexing rows. It profiles same-grade unit-index coverage and review blockers
only; it does not edit decisions, approve bridges, write public/data, or enable
matcher/publication use.`)
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

function truncate(value, max = 92) {
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

function validateInputs(batch, actionDecisions, args, errors) {
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
  if (!args.unitIndexes.length) errors.push('--unit-indexes must contain at least one path')
  if (args.requireItems && !(batch.manual_scope_indexing_items || []).length) {
    errors.push('requireItems is set but manual scope/indexing batch has no items')
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

function scopeIndexingProfile(item, action, coverage) {
  const target = item.target_standard_context || item.source_context?.target_standard_context || {}
  const units = matchingSameGradeUnits(item, coverage)
  const pageReady = units.filter(hasPageReadyUnit)
  const existingGradeBands = sorted(item.existing_grade_bands || item.unit_indexing_request?.existing_grade_bands || [])
  const existingUnitTitles = uniqueStrings(Object.values(item.existing_unit_context_by_grade_band || {}).flat())
  const openFields = manualFieldsOpen(item, action)
  const targetGradeBand = item.target_grade_band || item.grade_band || ''
  return {
    existing_grade_bands: existingGradeBands,
    existing_unit_title_count: existingUnitTitles.length,
    has_cross_grade_existing_evidence: existingGradeBands.some(grade => grade !== targetGradeBand),
    has_page_ready_same_grade_unit_candidates: pageReady.length > 0,
    has_same_grade_unit_index_candidates: units.length > 0,
    manual_confirmation_fields_open: openFields,
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

function reviewBucket(profile) {
  if (!profile.has_same_grade_unit_index_candidates) return 'manual_scope_indexing_needs_unit_index_materialization'
  if (!profile.has_page_ready_same_grade_unit_candidates) return 'manual_scope_indexing_has_same_grade_candidates_needs_page_recovery'
  if (profile.manual_confirmation_fields_open.length) return 'manual_scope_indexing_has_page_ready_candidates_needs_reviewer_confirmation'
  return 'manual_scope_indexing_candidate_ready_for_source_anchor_review'
}

function recommendedDisposition(profile) {
  if (!profile.has_same_grade_unit_index_candidates) return 'materialize_or_index_same_grade_textbook_units_before_decision_candidate'
  if (!profile.has_page_ready_same_grade_unit_candidates) return 'recover_page_ranges_before_source_anchor_review'
  if (profile.manual_confirmation_fields_open.length) return 'manual_scope_confirmation_required_before_decision_candidate'
  return 'ready_for_later_source_anchor_review_after_reviewer_note'
}

function inventoryPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_decision_must_be_edited_separately: true,
    eligible_for_h4g_differentiation: false,
    inventory_is_not_reviewer_decision: true,
    manual_scope_indexing_inventory_only: true,
    matcher_ready: false,
    publication_ready: false,
    requires_manual_scope_review: true,
    requires_later_source_anchor_review: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function inventoryId(item) {
  return `h4g_anchor_group_downstream_manual_scope_indexing_inventory_${hashText(item.manual_scope_indexing_item_id)}`
}

function buildRows(batch, actionDecisions, coverage, errors) {
  const actionBySourceItem = mapBy(actionDecisions.downstream_action_decisions || [], 'source_downstream_action_item_id', errors, 'action decisions')
  const rows = []
  const seen = new Set()
  for (const item of batch.manual_scope_indexing_items || []) {
    const action = actionBySourceItem.get(item.manual_scope_indexing_item_id)
    const profile = scopeIndexingProfile(item, action, coverage)
    const units = matchingSameGradeUnits(item, coverage)
    const id = inventoryId(item)
    if (seen.has(id)) errors.push(`duplicate inventory_item_id: ${id}`)
    seen.add(id)
    if (!action) errors.push(`${item.manual_scope_indexing_item_id} missing action decision source item`)
    rows.push({
      anchor_type: item.anchor_type || '',
      decision_type: 'anchor_group_downstream_manual_scope_indexing_inventory_item',
      downstream_action_decision_id: action?.decision_id || '',
      downstream_action_decision_status: action?.decision_status || '',
      downstream_action_reviewer_decision: action?.reviewer_decision || '',
      downstream_decision_id: item.downstream_decision_id || '',
      existing_grade_bands: profile.existing_grade_bands,
      existing_unit_context_by_grade_band: item.existing_unit_context_by_grade_band || {},
      grade_band: item.grade_band || '',
      inventory_item_id: id,
      inventory_policy: inventoryPolicy(),
      item_review_surface: item.item_review_surface || '',
      manual_scope_indexing_bucket: reviewBucket(profile),
      manual_scope_indexing_item_id: item.manual_scope_indexing_item_id || '',
      manual_scope_indexing_profile: profile,
      parent_decision_id: item.parent_decision_id || '',
      parent_downstream_action_work_item_id: item.parent_downstream_action_work_item_id || '',
      priority_rank: item.priority_rank,
      priority_tier: item.priority_tier || '',
      progression_group_id: item.progression_group_id || '',
      recommended_disposition: recommendedDisposition(profile),
      recommended_reviewer_decision: item.recommended_reviewer_decision || '',
      required_confirmations_to_close: item.required_confirmations_to_close || [],
      review_grain: item.review_grain || '',
      review_questions: item.review_questions || [],
      risk_signals: item.risk_signals || [],
      same_grade_unit_index_candidates: units.slice(0, 12),
      same_grade_unit_index_candidate_count: units.length,
      same_grade_unit_index_page_ready_count: units.filter(hasPageReadyUnit).length,
      source_anchor_review_item_ids: item.source_anchor_review_item_ids || [],
      source_anchor_review_rows: item.source_anchor_review_rows || 0,
      source_batch: item.source_batch || '',
      source_batch_item_id: item.source_batch_item_id || '',
      source_key: item.source_key || '',
      source_standard_code: item.source_standard_code || '',
      standard_code: item.standard_code || '',
      subject_slug: item.subject_slug || '',
      target_grade_band: item.target_grade_band || item.grade_band || '',
      target_standard_code: item.target_standard_code || item.standard_code || '',
      target_standard_context: item.target_standard_context || item.source_context?.target_standard_context || {},
      unit_indexing_request: item.unit_indexing_request || {},
      writes_public_data: false
    })
  }
  return rows
}

function summarize(rows, coverage) {
  const summary = {
    by_manual_scope_indexing_bucket: {},
    by_priority_tier: {},
    by_recommended_disposition: {},
    by_subject: {},
    by_target_grade_band: {},
    by_target_standard_code: {},
    cross_grade_existing_evidence_rows: 0,
    inventory_items: rows.length,
    manual_confirmation_required_rows: 0,
    manual_scope_indexing_items: rows.length,
    no_same_grade_unit_index_candidate_rows: 0,
    page_ready_same_grade_unit_candidate_rows: 0,
    same_grade_unit_index_candidate_rows: 0,
    same_grade_unit_index_page_missing_only_rows: 0,
    source_anchor_review_rows: 0,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_target_standard_codes: sorted(rows.map(row => row.target_standard_code)).length,
    unit_index_candidate_rows: coverage.unit_candidates,
    unit_index_files_available: coverage.files.length
  }
  for (const row of rows) {
    const profile = row.manual_scope_indexing_profile || {}
    if (profile.has_cross_grade_existing_evidence) summary.cross_grade_existing_evidence_rows += 1
    if ((profile.manual_confirmation_fields_open || []).length) summary.manual_confirmation_required_rows += 1
    if (profile.has_same_grade_unit_index_candidates) summary.same_grade_unit_index_candidate_rows += 1
    else summary.no_same_grade_unit_index_candidate_rows += 1
    if (profile.has_page_ready_same_grade_unit_candidates) summary.page_ready_same_grade_unit_candidate_rows += 1
    if (profile.has_same_grade_unit_index_candidates && !profile.has_page_ready_same_grade_unit_candidates) {
      summary.same_grade_unit_index_page_missing_only_rows += 1
    }
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    countInto(summary.by_manual_scope_indexing_bucket, row.manual_scope_indexing_bucket)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommended_disposition, row.recommended_disposition)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_grade_band, row.target_grade_band)
    countInto(summary.by_target_standard_code, row.target_standard_code)
  }
  return summary
}

function previewRows(rows) {
  return rows.map(row => {
    const profile = row.manual_scope_indexing_profile || {}
    const titles = (row.same_grade_unit_index_candidates || []).slice(0, 3).map(unit => unit.unit_title).join('; ')
    return `| ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.target_grade_band)} | ${markdownCell(row.target_standard_code)} | ${profile.same_grade_unit_index_candidate_count || 0} | ${profile.same_grade_page_ready_candidate_count || 0} | ${markdownCell(row.manual_scope_indexing_bucket)} | ${truncate(titles || '-')} |`
  }).join('\n') || '| - | - | - | - | 0 | 0 | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Manual Scope/Indexing Inventory

Generated at: ${payload.generated_at}

This read-only inventory profiles target-grade unit-index coverage for the 12
manual scope/indexing rows. It identifies whether same-grade unit candidates
exist in current H4G unit indexes and which rows still need manual scope
confirmation before any source-anchor, matcher, publication, or public/data
gate.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| inventory items | ${payload.summary.inventory_items} |
| same-grade unit-index candidate rows | ${payload.summary.same_grade_unit_index_candidate_rows} |
| no same-grade unit-index candidate rows | ${payload.summary.no_same_grade_unit_index_candidate_rows} |
| page-ready same-grade candidate rows | ${payload.summary.page_ready_same_grade_unit_candidate_rows} |
| page-missing-only candidate rows | ${payload.summary.same_grade_unit_index_page_missing_only_rows} |
| cross-grade existing evidence rows | ${payload.summary.cross_grade_existing_evidence_rows} |
| manual confirmation required rows | ${payload.summary.manual_confirmation_required_rows} |
| unit index files available | ${payload.summary.unit_index_files_available} |
| unit index candidate rows | ${payload.summary.unit_index_candidate_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Review Buckets

| bucket | rows |
| --- | ---: |
${countRows(payload.summary.by_manual_scope_indexing_bucket)}

## Target Grade Bands

| target grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_target_grade_band)}

## Preview

| rank | subject | target grade | target standard | same-grade candidates | page-ready candidates | bucket | candidate titles |
| ---: | --- | --- | --- | ---: | ---: | --- | --- |
${previewRows(payload.inventory_items)}

## Guardrails

- Inventory rows are not reviewer decisions.
- Same-grade unit candidates still require manual scope confirmation.
- Source-anchor evidence, matcher, and publication gates remain separate later steps.

## Warnings

${payload.warnings.length ? payload.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  const warnings = []
  for (const [label, path] of [
    ['manual scope/indexing batch', args.batch],
    ['action decisions', args.actionDecisions]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const batch = errors.length ? { manual_scope_indexing_items: [] } : readJson(args.batch)
  const actionDecisions = errors.length ? { downstream_action_decisions: [] } : readJson(args.actionDecisions)
  if (!errors.length) validateInputs(batch, actionDecisions, args, errors)
  const coverage = loadUnitIndexCoverage(args.unitIndexes, errors, warnings)
  const rows = buildRows(batch, actionDecisions, coverage, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no inventory rows were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    evidence_inventory_only: true,
    generated_at: new Date().toISOString(),
    inventory_items: rows,
    inventory_policy: inventoryPolicy(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory',
    source_downstream_action_decisions: args.actionDecisions,
    source_downstream_manual_scope_indexing_batch: args.batch,
    source_unit_indexes: args.unitIndexes,
    summary: summarize(rows, coverage),
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
  const payload = buildPayload(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
