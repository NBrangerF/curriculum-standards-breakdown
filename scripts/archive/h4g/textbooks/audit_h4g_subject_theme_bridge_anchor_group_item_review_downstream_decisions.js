#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_REVIEW_READY_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_review_ready_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_CHILD_SPLIT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_child_split_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_SPECIFICITY_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_anchor_specificity_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_MISSING_GRADE_UNIT_INDEXING_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_TARGET_STANDARD_GAP_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_standard_gap_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_COVERAGE_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_coverage_audit_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe_audit.md'

const BATCH_SPECS = [
  {
    argKey: 'sourceReviewReadyBatch',
    decisionType: 'anchor_group_item_level_source_review_ready_decision',
    idKey: 'source_review_ready_item_id',
    label: 'source_review_ready',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_source_review_ready_batch',
    rowsKey: 'source_review_ready_items',
    sourceType: 'source_review_ready_item'
  },
  {
    argKey: 'childSplitBatch',
    decisionType: 'anchor_group_child_split_item_review_decision',
    idKey: 'child_split_review_item_id',
    label: 'child_split',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_child_split_batch',
    rowsKey: 'child_split_review_items',
    sourceType: 'child_split_review_item'
  },
  {
    argKey: 'sourceAnchorSpecificityBatch',
    decisionType: 'anchor_group_source_anchor_specificity_review_decision',
    idKey: 'source_anchor_specificity_review_item_id',
    label: 'source_anchor_specificity',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_source_anchor_specificity_batch',
    rowsKey: 'source_anchor_specificity_review_items',
    sourceType: 'source_anchor_specificity_review_item'
  },
  {
    argKey: 'missingGradeUnitIndexingBatch',
    decisionType: 'anchor_group_missing_grade_unit_indexing_decision',
    idKey: 'missing_grade_unit_indexing_item_id',
    label: 'missing_grade_unit_indexing',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch',
    rowsKey: 'missing_grade_unit_indexing_items',
    sourceType: 'missing_grade_unit_indexing_item'
  },
  {
    argKey: 'targetStandardGapBatch',
    decisionType: 'anchor_group_target_standard_gap_decision',
    idKey: 'target_standard_gap_item_id',
    label: 'target_standard_gap',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_target_standard_gap_batch',
    rowsKey: 'target_standard_gap_items',
    sourceType: 'target_standard_gap_item'
  }
]

function parseArgs(argv) {
  const args = {
    childSplitBatch: DEFAULT_CHILD_SPLIT_BATCH,
    coverageAudit: DEFAULT_COVERAGE_AUDIT,
    decisions: DEFAULT_DECISIONS,
    missingGradeUnitIndexingBatch: DEFAULT_MISSING_GRADE_UNIT_INDEXING_BATCH,
    out: DEFAULT_OUT,
    requireComplete: false,
    requireItems: false,
    sourceAnchorSpecificityBatch: DEFAULT_SOURCE_ANCHOR_SPECIFICITY_BATCH,
    sourceReviewReadyBatch: DEFAULT_SOURCE_REVIEW_READY_BATCH,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    targetStandardGapBatch: DEFAULT_TARGET_STANDARD_GAP_BATCH
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--source-review-ready-batch') args.sourceReviewReadyBatch = argv[++i]
    else if (item === '--child-split-batch') args.childSplitBatch = argv[++i]
    else if (item === '--source-anchor-specificity-batch') args.sourceAnchorSpecificityBatch = argv[++i]
    else if (item === '--missing-grade-unit-indexing-batch') args.missingGradeUnitIndexingBatch = argv[++i]
    else if (item === '--target-standard-gap-batch') args.targetStandardGapBatch = argv[++i]
    else if (item === '--coverage-audit') args.coverageAudit = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--require-complete') args.requireComplete = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits editable downstream H4G anchor-group item-review decisions. Pending
decisions are valid by default. Use --require-complete after source review.`)
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

function arraysMatch(actual, expected) {
  return sorted(actual).join('|') === sorted(expected).join('|')
}

function mapsMatch(actual, expected) {
  return JSON.stringify(stable(actual || {})) === JSON.stringify(stable(expected || {}))
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function validReviewDate(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value || ''))
}

function gradeBand(row) {
  return row.grade_band || row.grade_band_to_index || row.missing_grade_band || ''
}

function standardCode(row) {
  return row.standard_code || row.target_standard_code || row.source_standard_code || ''
}

function sourceAnchorReviewItems(row) {
  if (row.source_anchor_review_item) return [row.source_anchor_review_item]
  if (Array.isArray(row.existing_source_anchor_review_items)) return row.existing_source_anchor_review_items
  return []
}

function sourceAnchorReviewItemIds(row) {
  const ids = []
  if (row.source_anchor_review_item_id) ids.push(row.source_anchor_review_item_id)
  for (const item of sourceAnchorReviewItems(row)) {
    if (item.anchor_review_item_id) ids.push(item.anchor_review_item_id)
  }
  return sorted(ids)
}

function allowedDecisions(row) {
  return ['pending', ...(row.review_decision_template?.allowed_review_outcomes || [])]
}

function actualKey(row) {
  return `${row.decision_type}|${row.source_batch_item_id}`
}

function expectedKey(row) {
  return `${row.spec.decisionType}|${row.sourceItem[row.spec.idKey]}`
}

function validateBatch(payload, spec, errors) {
  if (payload.valid !== true) errors.push(`${spec.label} batch valid must be true`)
  if (payload.purpose !== spec.purpose) errors.push(`${spec.label} batch purpose must be ${spec.purpose}`)
  if (!Array.isArray(payload[spec.rowsKey])) errors.push(`${spec.label} batch ${spec.rowsKey} must be an array`)
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (payload[key] !== false) errors.push(`${spec.label} batch ${key} must be false`)
  }
}

function validateCoverageAudit(coverageAudit, batchPaths, errors) {
  if (coverageAudit.valid !== true) errors.push('coverage audit valid must be true')
  if (coverageAudit.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_coverage_audit') {
    errors.push('coverage audit purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_coverage_audit')
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (coverageAudit[key] !== false) errors.push(`coverage audit ${key} must be false`)
  }
  for (const [label, path] of Object.entries(batchPaths)) {
    const actualPath = coverageAudit.summary?.by_batch?.[label]?.batch_path
    if (actualPath !== path) errors.push(`coverage audit ${label}.batch_path must match audit arg`)
  }
}

function validateTopLevel(decisions, args, batchPaths, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template')
  }
  if (decisions.source_downstream_coverage_audit !== args.coverageAudit) {
    errors.push('decisions source_downstream_coverage_audit must match audit arg')
  }
  for (const [label, path] of Object.entries(batchPaths)) {
    if (decisions.source_downstream_review_batches?.[label] !== path) {
      errors.push(`decisions source_downstream_review_batches.${label} must match audit arg`)
    }
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (decisions[key] !== false) errors.push(`decisions ${key} must be false`)
  }
  const policy = decisions.policy || {}
  for (const key of [
    'downstream_item_review_decision_is_not_approval',
    'source_decision_must_be_edited_separately',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`policy.${key} must be true`)
  }
}

function expectedRows(batches) {
  const rows = []
  for (const spec of BATCH_SPECS) {
    for (const sourceItem of batches[spec.label]?.[spec.rowsKey] || []) rows.push({ sourceItem, spec })
  }
  return rows
}

function auditPolicy(row, prefix, errors) {
  for (const key of [
    'requested_public_write',
    'requested_official_text_change',
    'requested_direct_matcher_use',
    'requested_eligible_for_h4g_differentiation',
    'writes_public_data',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (row[key] !== false) errors.push(`${prefix} ${key} must be false`)
  }
  const policy = row.publication_policy || {}
  for (const key of [
    'downstream_item_review_decision_is_not_approval',
    'source_decision_must_be_edited_separately',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${prefix} publication_policy.${key} must be true`)
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'eligible_for_h4g_differentiation',
    'direct_matcher_use',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (policy[key] !== false) errors.push(`${prefix} publication_policy.${key} must be false`)
  }
}

function auditReviewState(row, prefix, args, errors, stats) {
  if (!Array.isArray(row.allowed_decisions) || !row.allowed_decisions.includes('pending')) {
    errors.push(`${prefix} allowed_decisions must include pending`)
  }
  if (!row.allowed_decisions?.includes(row.reviewer_decision)) {
    errors.push(`${prefix} reviewer_decision is not in allowed_decisions`)
  }
  if (row.reviewer_decision === 'pending') {
    stats.pending_downstream_decisions += 1
    if (args.requireComplete) errors.push(`${prefix} cannot remain pending with --require-complete`)
    return
  }
  stats.completed_downstream_decisions += 1
  if (!hasValue(row.reviewed_by)) errors.push(`${prefix} reviewed_by is required for non-pending decision`)
  if (!validReviewDate(row.reviewed_at)) errors.push(`${prefix} reviewed_at must start with YYYY-MM-DD for non-pending decision`)
  if (!hasValue(row.decision_note)) errors.push(`${prefix} decision_note is required for non-pending decision`)
  const confirmations = row.required_confirmations || {}
  if (confirmations.no_public_write_requested !== true) errors.push(`${prefix} required_confirmations.no_public_write_requested must be true`)
  if (confirmations.official_standard_text_preserved !== true) errors.push(`${prefix} required_confirmations.official_standard_text_preserved must be true`)
}

function auditCommonFields(row, expected, prefix, errors) {
  const { sourceItem, spec } = expected
  if (row.source_batch !== spec.label) errors.push(`${prefix} source_batch mismatch`)
  if (row.source_batch_item_type !== spec.sourceType) errors.push(`${prefix} source_batch_item_type mismatch`)
  if (row.source_batch_item_id !== sourceItem[spec.idKey]) errors.push(`${prefix} source_batch_item_id mismatch`)
  if (row.decision_type !== spec.decisionType) errors.push(`${prefix} decision_type mismatch`)
  if (row.item_review_surface !== (sourceItem.item_review_surface || '')) errors.push(`${prefix} item_review_surface mismatch`)
  if (row.parent_action_work_item_id !== (sourceItem.parent_action_work_item_id || '')) errors.push(`${prefix} parent_action_work_item_id mismatch`)
  if (row.parent_decision_id !== (sourceItem.parent_decision_id || '')) errors.push(`${prefix} parent_decision_id mismatch`)
  if (row.parent_source_batch_item_id !== (sourceItem.parent_source_batch_item_id || '')) errors.push(`${prefix} parent_source_batch_item_id mismatch`)
  if (row.progression_group_id !== (sourceItem.progression_group_id || '')) errors.push(`${prefix} progression_group_id mismatch`)
  if (row.subject_slug !== (sourceItem.subject_slug || '')) errors.push(`${prefix} subject_slug mismatch`)
  if (row.priority_rank !== sourceItem.priority_rank) errors.push(`${prefix} priority_rank mismatch`)
  if (row.priority_tier !== (sourceItem.priority_tier || '')) errors.push(`${prefix} priority_tier mismatch`)
  if (row.review_grain !== (sourceItem.review_grain || '')) errors.push(`${prefix} review_grain mismatch`)
  if (row.grade_band !== gradeBand(sourceItem)) errors.push(`${prefix} grade_band mismatch`)
  if (row.standard_code !== standardCode(sourceItem)) errors.push(`${prefix} standard_code mismatch`)
  if (row.source_standard_code !== (sourceItem.source_standard_code || sourceItem.standard_code || '')) {
    errors.push(`${prefix} source_standard_code mismatch`)
  }
  if (row.target_standard_code !== (sourceItem.target_standard_code || '')) errors.push(`${prefix} target_standard_code mismatch`)
  if (!arraysMatch(row.allowed_decisions, allowedDecisions(sourceItem))) errors.push(`${prefix} allowed_decisions mismatch`)
  const expectedAnchorIds = sourceAnchorReviewItemIds(sourceItem)
  if (!arraysMatch(row.source_anchor_review_item_ids, expectedAnchorIds)) errors.push(`${prefix} source_anchor_review_item_ids mismatch`)
  const expectedAnchorRows = expectedAnchorIds.length || sourceAnchorReviewItems(sourceItem).length
  if (row.source_anchor_review_rows !== expectedAnchorRows) errors.push(`${prefix} source_anchor_review_rows mismatch`)
}

function summarizeRows(rows) {
  const stats = {
    by_decision_type: {},
    by_grade_band: {},
    by_item_review_surface: {},
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_source_batch: {},
    by_subject: {},
    completed_downstream_decisions: 0,
    downstream_decisions: rows.length,
    expected_downstream_decisions: 0,
    extra_decisions: 0,
    missing_decisions: 0,
    pending_downstream_decisions: 0,
    source_anchor_review_rows: 0
  }
  for (const row of rows) {
    stats.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    countInto(stats.by_decision_type, row.decision_type)
    countInto(stats.by_grade_band, row.grade_band)
    countInto(stats.by_item_review_surface, row.item_review_surface)
    countInto(stats.by_priority_tier, row.priority_tier)
    countInto(stats.by_reviewer_decision, row.reviewer_decision)
    countInto(stats.by_source_batch, row.source_batch)
    countInto(stats.by_subject, row.subject_slug)
  }
  return stats
}

function auditSummary(decisions, stats, errors) {
  const summary = decisions.summary || {}
  for (const field of [
    'downstream_decisions',
    'pending_downstream_decisions',
    'completed_downstream_decisions',
    'source_anchor_review_rows'
  ]) {
    if (summary[field] !== stats[field]) errors.push(`summary.${field} mismatch`)
  }
  for (const field of [
    'by_decision_type',
    'by_grade_band',
    'by_item_review_surface',
    'by_priority_tier',
    'by_reviewer_decision',
    'by_source_batch',
    'by_subject'
  ]) {
    if (!mapsMatch(summary[field], stats[field])) errors.push(`summary.${field} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Item Review Downstream Decisions Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected downstream decisions | ${payload.summary.expected_downstream_decisions} |
| downstream decisions | ${payload.summary.downstream_decisions} |
| pending downstream decisions | ${payload.summary.pending_downstream_decisions} |
| missing decisions | ${payload.summary.missing_decisions} |
| extra decisions | ${payload.summary.extra_decisions} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |

## Source Batches

| source batch | decisions |
| --- | ---: |
${countRows(payload.summary.by_source_batch)}

## Reviewer Decisions

| reviewer decision | rows |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  const batchPaths = Object.fromEntries(BATCH_SPECS.map(spec => [spec.label, args[spec.argKey]]))
  for (const [label, path] of [
    ['decisions', args.decisions],
    ['coverage_audit', args.coverageAudit],
    ...Object.entries(batchPaths)
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const decisions = errors.length ? { downstream_decisions: [] } : readJson(args.decisions)
  const coverageAudit = errors.length ? {} : readJson(args.coverageAudit)
  const batches = {}
  for (const spec of BATCH_SPECS) {
    batches[spec.label] = errors.length ? { [spec.rowsKey]: [] } : readJson(args[spec.argKey])
    if (!errors.length) validateBatch(batches[spec.label], spec, errors)
  }
  if (!errors.length) {
    validateTopLevel(decisions, args, batchPaths, errors)
    validateCoverageAudit(coverageAudit, batchPaths, errors)
  }

  const expected = new Map()
  for (const row of expectedRows(batches)) {
    const key = expectedKey(row)
    if (expected.has(key)) errors.push(`duplicate expected downstream source item ${key}`)
    expected.set(key, { ...row, seen: false })
  }

  const rows = decisions.downstream_decisions || []
  const stats = summarizeRows(rows)
  stats.expected_downstream_decisions = expected.size
  const seenDecisionIds = new Set()
  const seenActualKeys = new Set()
  for (const row of rows) {
    const prefix = row.decision_id || actualKey(row)
    if (!row.decision_id) errors.push(`${prefix} missing decision_id`)
    if (seenDecisionIds.has(row.decision_id)) errors.push(`${prefix} duplicate decision_id`)
    seenDecisionIds.add(row.decision_id)
    const key = actualKey(row)
    if (seenActualKeys.has(key)) errors.push(`${prefix} duplicate source decision row`)
    seenActualKeys.add(key)
    const expectedRow = expected.get(key)
    if (!expectedRow) {
      stats.extra_decisions += 1
      errors.push(`${prefix} does not match any expected downstream source item`)
      continue
    }
    expectedRow.seen = true
    auditCommonFields(row, expectedRow, prefix, errors)
    auditPolicy(row, prefix, errors)
    auditReviewState(row, prefix, args, errors, stats)
  }

  for (const [key, row] of expected.entries()) {
    if (!row.seen) {
      stats.missing_decisions += 1
      errors.push(`${key} missing from downstream decisions`)
    }
  }
  if (args.requireItems && !expected.size) errors.push('requireItems is set but no expected downstream rows were found')
  if (args.requireItems && !rows.length) errors.push('requireItems is set but decisions have no downstream_decisions')
  auditSummary(decisions, stats, errors)

  return {
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    require_complete: args.requireComplete,
    require_items: args.requireItems,
    source_downstream_coverage_audit: args.coverageAudit,
    source_downstream_review_batches: batchPaths,
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
