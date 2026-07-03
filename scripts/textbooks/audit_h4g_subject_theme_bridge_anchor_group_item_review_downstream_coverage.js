#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_REVIEW_READY_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_review_ready_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_CHILD_SPLIT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_child_split_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_SPECIFICITY_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_anchor_specificity_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_MISSING_GRADE_UNIT_INDEXING_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_TARGET_STANDARD_GAP_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_standard_gap_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_coverage_audit_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_coverage_audit_anchor_domain_rejected_english_pe.md'

const BATCH_SPECS = [
  {
    argKey: 'sourceReviewReadyBatch',
    label: 'source_review_ready',
    parentRecommendation: 'accept_bounded_slice_for_item_level_source_review',
    pathLabel: 'source-review-ready batch',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_source_review_ready_batch',
    rowsKey: 'source_review_ready_items',
    selectionWorkQueue: 'item_level_source_review_ready_queue',
    expectedRows: workItem => 1
  },
  {
    argKey: 'childSplitBatch',
    label: 'child_split',
    parentRecommendation: 'split_slice_further',
    pathLabel: 'child split batch',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_child_split_batch',
    rowsKey: 'child_split_review_items',
    selectionWorkQueue: 'unit_or_source_row_split_queue',
    expectedRows: workItem => (workItem.suggested_child_slices || []).length
  },
  {
    argKey: 'sourceAnchorSpecificityBatch',
    label: 'source_anchor_specificity',
    parentRecommendation: 'needs_source_anchor_evidence',
    pathLabel: 'source-anchor specificity batch',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_source_anchor_specificity_batch',
    rowsKey: 'source_anchor_specificity_review_items',
    selectionWorkQueue: 'source_anchor_specificity_queue',
    expectedRows: workItem => 1
  },
  {
    argKey: 'missingGradeUnitIndexingBatch',
    label: 'missing_grade_unit_indexing',
    parentRecommendation: 'needs_textbook_unit_indexing',
    pathLabel: 'missing-grade unit indexing batch',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch',
    rowsKey: 'missing_grade_unit_indexing_items',
    selectionWorkQueue: 'missing_grade_textbook_unit_indexing_queue',
    expectedRows: workItem => (workItem.target_missing_grade_standards || []).length
  },
  {
    argKey: 'targetStandardGapBatch',
    label: 'target_standard_gap',
    parentRecommendation: 'target_missing_grade_standard_absent',
    pathLabel: 'target-standard gap batch',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_target_standard_gap_batch',
    rowsKey: 'target_standard_gap_items',
    selectionWorkQueue: 'target_standard_gap_queue',
    expectedRows: workItem => (workItem.missing_grade_bands || []).length
  }
]

function parseArgs(argv) {
  const args = {
    childSplitBatch: DEFAULT_CHILD_SPLIT_BATCH,
    missingGradeUnitIndexingBatch: DEFAULT_MISSING_GRADE_UNIT_INDEXING_BATCH,
    out: DEFAULT_OUT,
    requireComplete: false,
    sourceAnchorSpecificityBatch: DEFAULT_SOURCE_ANCHOR_SPECIFICITY_BATCH,
    sourceReviewReadyBatch: DEFAULT_SOURCE_REVIEW_READY_BATCH,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    targetStandardGapBatch: DEFAULT_TARGET_STANDARD_GAP_BATCH,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--source-review-ready-batch') args.sourceReviewReadyBatch = argv[++i]
    else if (item === '--child-split-batch') args.childSplitBatch = argv[++i]
    else if (item === '--source-anchor-specificity-batch') args.sourceAnchorSpecificityBatch = argv[++i]
    else if (item === '--missing-grade-unit-indexing-batch') args.missingGradeUnitIndexingBatch = argv[++i]
    else if (item === '--target-standard-gap-batch') args.targetStandardGapBatch = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_coverage.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json \\
  --strict --require-complete

Audits that the five item-review downstream batches exactly cover every work
item in the action worklist. This is a read-only meta-audit; it does not update
editable decisions, approve bridges, write public/data, or enable matcher use.`)
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

function validateTopLevel(payload, spec, args, errors) {
  if (payload.valid !== true) errors.push(`${spec.label} valid must be true`)
  if (payload.purpose !== spec.purpose) errors.push(`${spec.label} purpose must be ${spec.purpose}`)
  if (payload.worklist_only !== true) errors.push(`${spec.label} worklist_only must be true`)
  if (payload.writes_public_data !== false) errors.push(`${spec.label} writes_public_data must be false`)
  if (payload.changes_official_standard_text !== false) errors.push(`${spec.label} changes_official_standard_text must be false`)
  if (payload.direct_matcher_use !== false) errors.push(`${spec.label} direct_matcher_use must be false`)
  if (payload.matcher_ready !== false) errors.push(`${spec.label} matcher_ready must be false`)
  if (payload.publication_ready !== false) errors.push(`${spec.label} publication_ready must be false`)
  if (payload.source_anchor_group_item_review_action_worklist !== args.worklist) {
    errors.push(`${spec.label} source_anchor_group_item_review_action_worklist must match audit arg`)
  }
  if (payload.selection?.work_queue !== spec.selectionWorkQueue) {
    errors.push(`${spec.label} selection.work_queue must be ${spec.selectionWorkQueue}`)
  }
  if (payload.selection?.parent_recommendation !== spec.parentRecommendation) {
    errors.push(`${spec.label} selection.parent_recommendation must be ${spec.parentRecommendation}`)
  }
}

function expectedWorkItems(worklist, spec) {
  return (worklist.item_review_action_work_items || [])
    .filter(item => item.work_queue === spec.selectionWorkQueue)
    .filter(item => item.recommended_reviewer_decision === spec.parentRecommendation)
}

function countByParent(rows) {
  const out = new Map()
  for (const row of rows || []) {
    const id = row.parent_action_work_item_id || ''
    out.set(id, (out.get(id) || 0) + 1)
  }
  return out
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
      work_queue: spec.selectionWorkQueue
    }
  }
  const payload = readJson(path)
  validateTopLevel(payload, spec, args, errors)
  const expected = expectedWorkItems(worklist, spec)
  const expectedById = new Map(expected.map(item => [item.action_work_item_id, item]))
  const expectedRowsByParent = new Map(expected.map(item => [item.action_work_item_id, spec.expectedRows(item)]))
  const rawRows = payload[spec.rowsKey]
  const rows = Array.isArray(rawRows) ? rawRows : []
  const actualByParent = countByParent(rows)
  const missingParents = []
  const extraParents = []

  if (!Array.isArray(rawRows)) errors.push(`${spec.label} ${spec.rowsKey} must be an array`)
  for (const item of expected) {
    const expectedRowCount = expectedRowsByParent.get(item.action_work_item_id) || 0
    const actualRowCount = actualByParent.get(item.action_work_item_id) || 0
    if (actualRowCount === 0) missingParents.push(item.action_work_item_id)
    if (actualRowCount !== expectedRowCount) {
      errors.push(`${spec.label} ${item.action_work_item_id} row count ${actualRowCount} must match expected ${expectedRowCount}`)
    }
  }
  for (const [parentId, count] of actualByParent.entries()) {
    if (!expectedById.has(parentId)) {
      extraParents.push(parentId || '(missing parent_action_work_item_id)')
      errors.push(`${spec.label} unexpected parent_action_work_item_id ${parentId || '(missing)'}`)
      continue
    }
    const prior = parentToBatch.get(parentId)
    if (prior && prior !== spec.label) errors.push(`${parentId} appears in multiple downstream batches: ${prior}, ${spec.label}`)
    parentToBatch.set(parentId, spec.label)
    if (!parentId) errors.push(`${spec.label} has ${count} rows without parent_action_work_item_id`)
  }
  for (const row of rows) {
    const prefix = row.source_review_ready_item_id || row.child_split_review_item_id || row.source_anchor_specificity_review_item_id || row.missing_grade_unit_indexing_item_id || row.target_standard_gap_item_id || row.parent_action_work_item_id || spec.label
    if (row.worklist_only !== true) errors.push(`${prefix} worklist_only must be true`)
    if (row.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
    if (!row.parent_action_work_item_id) errors.push(`${prefix} parent_action_work_item_id is required`)
  }

  const expectedReviewRows = [...expectedRowsByParent.values()].reduce((sum, count) => sum + count, 0)
  const actualParentIds = [...actualByParent.keys()].filter(id => expectedById.has(id))
  const result = {
    actual_parent_work_items: new Set(actualParentIds).size,
    actual_review_rows: rows.length,
    batch_path: path,
    expected_parent_work_items: expected.length,
    expected_review_rows: expectedReviewRows,
    extra_parent_items: extraParents.length,
    label: spec.label,
    missing_parent_items: missingParents.length,
    purpose: payload.purpose,
    rows_key: spec.rowsKey,
    valid: missingParents.length === 0 && extraParents.length === 0 && rows.length === expectedReviewRows,
    work_queue: spec.selectionWorkQueue
  }
  if (rows.length !== expectedReviewRows) {
    errors.push(`${spec.label} actual_review_rows ${rows.length} must match expected_review_rows ${expectedReviewRows}`)
  }
  if (result.actual_parent_work_items !== result.expected_parent_work_items) {
    errors.push(`${spec.label} actual_parent_work_items ${result.actual_parent_work_items} must match expected_parent_work_items ${result.expected_parent_work_items}`)
  }
  return result
}

function markdownSummary(payload) {
  const batchRows = Object.values(payload.summary.by_batch || {}).map(row => (
    `| ${markdownCell(row.label)} | ${markdownCell(row.work_queue)} | ${row.expected_parent_work_items} | ${row.actual_parent_work_items} | ${row.expected_review_rows} | ${row.actual_review_rows} | ${row.missing_parent_items} | ${row.extra_parent_items} |`
  )).join('\n') || '| - | - | 0 | 0 | 0 | 0 | 0 | 0 |'
  return `# H4G Item Review Downstream Coverage Audit

Generated at: ${payload.generated_at}

This read-only meta-audit checks that the five downstream item-review batches
exactly cover the item-review action worklist. It does not edit decisions,
approve bridges, write \`public/data\`, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| downstream batches | ${payload.summary.downstream_batches} |
| expected parent work items | ${payload.summary.expected_parent_work_items} |
| covered parent work items | ${payload.summary.covered_parent_work_items} |
| missing parent work items | ${payload.summary.missing_parent_work_items} |
| duplicate parent assignments | ${payload.summary.duplicate_parent_assignments} |
| expected review rows | ${payload.summary.expected_review_rows} |
| actual review rows | ${payload.summary.actual_review_rows} |

## Batch Coverage

| batch | work queue | expected parents | actual parents | expected rows | actual rows | missing parents | extra parents |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${batchRows}

## Work Queues

| work queue | parent items |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  if (!existsSync(args.worklist)) errors.push(`Missing worklist: ${args.worklist}`)
  const worklist = errors.length ? { item_review_action_work_items: [] } : readJson(args.worklist)
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_action_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_anchor_group_item_review_action_worklist')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  if (worklist.writes_public_data !== false) errors.push('worklist writes_public_data must be false')

  const parentToBatch = new Map()
  const byBatch = {}
  for (const spec of BATCH_SPECS) byBatch[spec.label] = auditBatch(spec, args, worklist, errors, parentToBatch)

  const expectedParents = BATCH_SPECS.flatMap(spec => expectedWorkItems(worklist, spec))
  const expectedParentIds = new Set(expectedParents.map(item => item.action_work_item_id))
  const coveredParentIds = new Set(parentToBatch.keys())
  const missingParentIds = [...expectedParentIds].filter(id => !coveredParentIds.has(id))
  const extraParentIds = [...coveredParentIds].filter(id => !expectedParentIds.has(id))
  for (const id of missingParentIds) errors.push(`${id} missing from all downstream batches`)
  for (const id of extraParentIds) errors.push(`${id} is covered by downstream batch but not expected from worklist`)

  const byWorkQueue = {}
  for (const item of expectedParents) countInto(byWorkQueue, item.work_queue)
  const expectedReviewRows = Object.values(byBatch).reduce((sum, row) => sum + row.expected_review_rows, 0)
  const actualReviewRows = Object.values(byBatch).reduce((sum, row) => sum + row.actual_review_rows, 0)
  const duplicateParentAssignments = errors.filter(error => error.includes('appears in multiple downstream batches')).length
  if (args.requireComplete && missingParentIds.length) errors.push(`requireComplete is set but ${missingParentIds.length} parent work items are missing downstream coverage`)
  if (args.requireComplete && duplicateParentAssignments) {
    errors.push(`requireComplete is set but ${duplicateParentAssignments} parent work items have duplicate downstream coverage`)
  }

  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_coverage_audit',
    require_complete: args.requireComplete,
    source_anchor_group_item_review_action_worklist: args.worklist,
    summary: {
      actual_review_rows: actualReviewRows,
      by_batch: byBatch,
      by_work_queue: byWorkQueue,
      covered_parent_work_items: coveredParentIds.size,
      downstream_batches: BATCH_SPECS.length,
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
