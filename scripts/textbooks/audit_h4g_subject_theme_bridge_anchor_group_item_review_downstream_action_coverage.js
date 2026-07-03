#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_EVIDENCE_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_MANUAL_SCOPE_INDEXING_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_ITEM_LEVEL_SOURCE_REVIEW_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ROW_CONFIRMATION_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_TARGET_STANDARD_GAP_RESOLUTION_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_coverage_audit_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_coverage_audit_anchor_domain_rejected_english_pe.md'

const BATCH_SPECS = [
  {
    argKey: 'sourceAnchorEvidenceBatch',
    label: 'source_anchor_evidence',
    pathLabel: 'source-anchor evidence batch',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch',
    recommendation: 'needs_source_anchor_evidence',
    rowsKey: 'source_anchor_evidence_items',
    workQueue: 'downstream_source_anchor_evidence_queue'
  },
  {
    argKey: 'manualScopeIndexingBatch',
    label: 'manual_scope_indexing',
    pathLabel: 'manual scope/indexing batch',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch',
    recommendation: 'target_standard_requires_manual_scope_review',
    rowsKey: 'manual_scope_indexing_items',
    workQueue: 'downstream_manual_scope_indexing_queue'
  },
  {
    argKey: 'itemLevelSourceReviewBatch',
    label: 'item_level_source_review',
    pathLabel: 'item-level source review batch',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_batch',
    recommendation: 'accept_bounded_slice_for_item_level_source_review',
    rowsKey: 'item_level_source_review_items',
    workQueue: 'downstream_item_level_source_review_queue'
  },
  {
    argKey: 'sourceRowConfirmationBatch',
    label: 'source_row_confirmation',
    pathLabel: 'source-row confirmation batch',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_batch',
    recommendation: 'source_row_confirms_target_anchor_for_later_gate',
    rowsKey: 'source_row_confirmation_items',
    workQueue: 'downstream_source_row_confirmation_queue'
  },
  {
    argKey: 'targetStandardGapResolutionBatch',
    label: 'target_standard_gap_resolution',
    pathLabel: 'target-standard gap resolution batch',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch',
    recommendation: 'target_standard_gap_confirmed',
    rowsKey: 'target_standard_gap_resolution_items',
    workQueue: 'downstream_target_standard_gap_resolution_queue'
  }
]

function parseArgs(argv) {
  const args = {
    itemLevelSourceReviewBatch: DEFAULT_ITEM_LEVEL_SOURCE_REVIEW_BATCH,
    manualScopeIndexingBatch: DEFAULT_MANUAL_SCOPE_INDEXING_BATCH,
    out: DEFAULT_OUT,
    requireComplete: false,
    sourceAnchorEvidenceBatch: DEFAULT_SOURCE_ANCHOR_EVIDENCE_BATCH,
    sourceRowConfirmationBatch: DEFAULT_SOURCE_ROW_CONFIRMATION_BATCH,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    targetStandardGapResolutionBatch: DEFAULT_TARGET_STANDARD_GAP_RESOLUTION_BATCH,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--source-anchor-evidence-batch') args.sourceAnchorEvidenceBatch = argv[++i]
    else if (item === '--manual-scope-indexing-batch') args.manualScopeIndexingBatch = argv[++i]
    else if (item === '--item-level-source-review-batch') args.itemLevelSourceReviewBatch = argv[++i]
    else if (item === '--source-row-confirmation-batch') args.sourceRowConfirmationBatch = argv[++i]
    else if (item === '--target-standard-gap-resolution-batch') args.targetStandardGapResolutionBatch = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-complete') args.requireComplete = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_coverage.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json \\
  --strict --require-complete

Audits that the five downstream action batches exactly cover every work item in
the downstream action worklist. This is a read-only meta-audit; it does not edit
decisions, approve bridges, write public/data, or enable matcher/publication use.`)
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
    'matcher_ready',
    'publication_ready'
  ]) {
    if (payload[key] !== false) errors.push(`${label} ${key} must be false`)
  }
}

function validateWorklist(worklist, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_worklist')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  validatePolicy('worklist', worklist, errors)
  if (!Array.isArray(worklist.downstream_action_work_items)) {
    errors.push('worklist downstream_action_work_items must be an array')
  }
}

function validateBatchTopLevel(payload, spec, args, errors) {
  if (payload.valid !== true) errors.push(`${spec.label} valid must be true`)
  if (payload.purpose !== spec.purpose) errors.push(`${spec.label} purpose must be ${spec.purpose}`)
  if (payload.worklist_only !== true) errors.push(`${spec.label} worklist_only must be true`)
  validatePolicy(spec.label, payload, errors)
  if (payload.source_downstream_action_worklist !== args.worklist) {
    errors.push(`${spec.label} source_downstream_action_worklist must match audit arg`)
  }
  if (payload.selection?.work_queue !== spec.workQueue) {
    errors.push(`${spec.label} selection.work_queue must be ${spec.workQueue}`)
  }
  if (payload.selection?.recommendation !== spec.recommendation) {
    errors.push(`${spec.label} selection.recommendation must be ${spec.recommendation}`)
  }
}

function expectedWorkItems(worklist, spec) {
  return (worklist.downstream_action_work_items || [])
    .filter(item => item.work_queue === spec.workQueue)
    .filter(item => item.recommended_reviewer_decision === spec.recommendation)
}

function countByParent(rows) {
  const out = new Map()
  for (const row of rows || []) {
    const id = row.parent_downstream_action_work_item_id || ''
    out.set(id, (out.get(id) || 0) + 1)
  }
  return out
}

function rowId(row) {
  return row.source_anchor_evidence_item_id ||
    row.manual_scope_indexing_item_id ||
    row.item_level_source_review_item_id ||
    row.source_row_confirmation_item_id ||
    row.target_standard_gap_resolution_item_id ||
    row.parent_downstream_action_work_item_id ||
    '(missing row id)'
}

function auditBatch(spec, args, worklist, errors, parentToBatch) {
  const path = args[spec.argKey]
  if (!existsSync(path)) {
    errors.push(`Missing ${spec.pathLabel}: ${path}`)
    return {
      actual_parent_work_items: 0,
      actual_review_rows: 0,
      batch_path: path,
      expected_parent_work_items: 0,
      expected_review_rows: 0,
      extra_parent_items: 0,
      label: spec.label,
      missing_parent_items: 0,
      valid: false,
      work_queue: spec.workQueue
    }
  }
  const payload = readJson(path)
  validateBatchTopLevel(payload, spec, args, errors)
  const expected = expectedWorkItems(worklist, spec)
  const expectedById = new Map(expected.map(item => [item.downstream_action_work_item_id, item]))
  const rawRows = payload[spec.rowsKey]
  const rows = Array.isArray(rawRows) ? rawRows : []
  const actualByParent = countByParent(rows)
  const missingParents = []
  const extraParents = []

  if (!Array.isArray(rawRows)) errors.push(`${spec.label} ${spec.rowsKey} must be an array`)
  for (const item of expected) {
    const actualRowCount = actualByParent.get(item.downstream_action_work_item_id) || 0
    if (actualRowCount === 0) missingParents.push(item.downstream_action_work_item_id)
    if (actualRowCount !== 1) {
      errors.push(`${spec.label} ${item.downstream_action_work_item_id} row count ${actualRowCount} must match expected 1`)
    }
  }
  for (const [parentId, count] of actualByParent.entries()) {
    if (!expectedById.has(parentId)) {
      extraParents.push(parentId || '(missing parent_downstream_action_work_item_id)')
      errors.push(`${spec.label} unexpected parent_downstream_action_work_item_id ${parentId || '(missing)'}`)
      continue
    }
    const prior = parentToBatch.get(parentId)
    if (prior && prior !== spec.label) errors.push(`${parentId} appears in multiple downstream action batches: ${prior}, ${spec.label}`)
    parentToBatch.set(parentId, spec.label)
    if (!parentId) errors.push(`${spec.label} has ${count} rows without parent_downstream_action_work_item_id`)
  }
  for (const row of rows) {
    const prefix = rowId(row)
    if (row.worklist_only !== true) errors.push(`${prefix} worklist_only must be true`)
    if (row.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
    if (!row.parent_downstream_action_work_item_id) errors.push(`${prefix} parent_downstream_action_work_item_id is required`)
  }

  const actualParentIds = [...actualByParent.keys()].filter(id => expectedById.has(id))
  const result = {
    actual_parent_work_items: new Set(actualParentIds).size,
    actual_review_rows: rows.length,
    batch_path: path,
    expected_parent_work_items: expected.length,
    expected_review_rows: expected.length,
    extra_parent_items: extraParents.length,
    label: spec.label,
    missing_parent_items: missingParents.length,
    purpose: payload.purpose,
    recommendation: spec.recommendation,
    rows_key: spec.rowsKey,
    valid: missingParents.length === 0 && extraParents.length === 0 && rows.length === expected.length,
    work_queue: spec.workQueue
  }
  if (rows.length !== expected.length) {
    errors.push(`${spec.label} actual_review_rows ${rows.length} must match expected_review_rows ${expected.length}`)
  }
  if (result.actual_parent_work_items !== result.expected_parent_work_items) {
    errors.push(`${spec.label} actual_parent_work_items ${result.actual_parent_work_items} must match expected_parent_work_items ${result.expected_parent_work_items}`)
  }
  return result
}

function markdownSummary(payload) {
  const batchRows = Object.values(payload.summary.by_batch || {}).map(row => (
    `| ${markdownCell(row.label)} | ${markdownCell(row.work_queue)} | ${markdownCell(row.recommendation)} | ${row.expected_parent_work_items} | ${row.actual_parent_work_items} | ${row.expected_review_rows} | ${row.actual_review_rows} | ${row.missing_parent_items} | ${row.extra_parent_items} |`
  )).join('\n') || '| - | - | - | 0 | 0 | 0 | 0 | 0 | 0 |'
  return `# H4G Downstream Action Coverage Audit

Generated at: ${payload.generated_at}

This read-only meta-audit checks that the five downstream action batches
exactly cover the downstream action worklist. It does not edit decisions,
approve bridges, write \`public/data\`, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| downstream action batches | ${payload.summary.downstream_action_batches} |
| expected parent work items | ${payload.summary.expected_parent_work_items} |
| covered parent work items | ${payload.summary.covered_parent_work_items} |
| missing parent work items | ${payload.summary.missing_parent_work_items} |
| duplicate parent assignments | ${payload.summary.duplicate_parent_assignments} |
| expected review rows | ${payload.summary.expected_review_rows} |
| actual review rows | ${payload.summary.actual_review_rows} |

## Batch Coverage

| batch | work queue | recommendation | expected parents | actual parents | expected rows | actual rows | missing parents | extra parents |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${batchRows}

## Work Queues

| work queue | parent items |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Recommendations

| recommendation | parent items |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  if (!existsSync(args.worklist)) errors.push(`Missing worklist: ${args.worklist}`)
  const worklist = errors.length ? { downstream_action_work_items: [] } : readJson(args.worklist)
  validateWorklist(worklist, errors)

  const parentToBatch = new Map()
  const byBatch = {}
  for (const spec of BATCH_SPECS) byBatch[spec.label] = auditBatch(spec, args, worklist, errors, parentToBatch)

  const expectedParents = BATCH_SPECS.flatMap(spec => expectedWorkItems(worklist, spec))
  const expectedParentIds = new Set(expectedParents.map(item => item.downstream_action_work_item_id))
  const coveredParentIds = new Set(parentToBatch.keys())
  const missingParentIds = [...expectedParentIds].filter(id => !coveredParentIds.has(id))
  const extraParentIds = [...coveredParentIds].filter(id => !expectedParentIds.has(id))
  for (const id of missingParentIds) errors.push(`${id} missing from all downstream action batches`)
  for (const id of extraParentIds) errors.push(`${id} is covered by downstream action batch but not expected from worklist`)

  const byWorkQueue = {}
  const byRecommendation = {}
  for (const item of expectedParents) {
    countInto(byWorkQueue, item.work_queue)
    countInto(byRecommendation, item.recommended_reviewer_decision)
  }
  const expectedReviewRows = Object.values(byBatch).reduce((sum, row) => sum + row.expected_review_rows, 0)
  const actualReviewRows = Object.values(byBatch).reduce((sum, row) => sum + row.actual_review_rows, 0)
  const duplicateParentAssignments = errors.filter(error => error.includes('appears in multiple downstream action batches')).length
  if (args.requireComplete && missingParentIds.length) {
    errors.push(`requireComplete is set but ${missingParentIds.length} parent work items are missing downstream action coverage`)
  }
  if (args.requireComplete && duplicateParentAssignments) {
    errors.push(`requireComplete is set but ${duplicateParentAssignments} parent work items have duplicate downstream action coverage`)
  }
  if (args.requireComplete && actualReviewRows !== expectedReviewRows) {
    errors.push(`requireComplete is set but actual review rows ${actualReviewRows} do not match expected ${expectedReviewRows}`)
  }

  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_coverage_audit',
    require_complete: args.requireComplete,
    source_downstream_action_worklist: args.worklist,
    summary: {
      actual_review_rows: actualReviewRows,
      by_batch: byBatch,
      by_recommendation: byRecommendation,
      by_work_queue: byWorkQueue,
      covered_parent_work_items: coveredParentIds.size,
      downstream_action_batches: BATCH_SPECS.length,
      duplicate_parent_assignments: duplicateParentAssignments,
      expected_parent_work_items: expectedParentIds.size,
      expected_review_rows: expectedReviewRows,
      extra_parent_work_items: extraParentIds.length,
      missing_parent_work_items: missingParentIds.length
    },
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
  const payload = audit(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
