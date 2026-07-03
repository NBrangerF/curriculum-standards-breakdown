#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_COVERAGE_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_coverage_audit_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_EVIDENCE_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_MANUAL_SCOPE_INDEXING_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_ITEM_LEVEL_SOURCE_REVIEW_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ROW_CONFIRMATION_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_TARGET_STANDARD_GAP_RESOLUTION_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe_audit.md'

const BATCH_SPECS = [
  {
    argKey: 'sourceAnchorEvidenceBatch',
    decisionType: 'anchor_group_downstream_source_anchor_evidence_decision',
    idKey: 'source_anchor_evidence_item_id',
    label: 'source_anchor_evidence',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch',
    rowsKey: 'source_anchor_evidence_items',
    sourceType: 'source_anchor_evidence_item'
  },
  {
    argKey: 'manualScopeIndexingBatch',
    decisionType: 'anchor_group_downstream_manual_scope_indexing_decision',
    idKey: 'manual_scope_indexing_item_id',
    label: 'manual_scope_indexing',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch',
    rowsKey: 'manual_scope_indexing_items',
    sourceType: 'manual_scope_indexing_item'
  },
  {
    argKey: 'itemLevelSourceReviewBatch',
    decisionType: 'anchor_group_downstream_item_level_source_review_decision',
    idKey: 'item_level_source_review_item_id',
    label: 'item_level_source_review',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_batch',
    rowsKey: 'item_level_source_review_items',
    sourceType: 'item_level_source_review_item'
  },
  {
    argKey: 'sourceRowConfirmationBatch',
    decisionType: 'anchor_group_downstream_source_row_confirmation_decision',
    idKey: 'source_row_confirmation_item_id',
    label: 'source_row_confirmation',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_batch',
    rowsKey: 'source_row_confirmation_items',
    sourceType: 'source_row_confirmation_item'
  },
  {
    argKey: 'targetStandardGapResolutionBatch',
    decisionType: 'anchor_group_downstream_target_standard_gap_resolution_decision',
    idKey: 'target_standard_gap_resolution_item_id',
    label: 'target_standard_gap_resolution',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch',
    rowsKey: 'target_standard_gap_resolution_items',
    sourceType: 'target_standard_gap_resolution_item'
  }
]

function parseArgs(argv) {
  const args = {
    coverageAudit: DEFAULT_COVERAGE_AUDIT,
    decisions: DEFAULT_DECISIONS,
    itemLevelSourceReviewBatch: DEFAULT_ITEM_LEVEL_SOURCE_REVIEW_BATCH,
    manualScopeIndexingBatch: DEFAULT_MANUAL_SCOPE_INDEXING_BATCH,
    out: DEFAULT_OUT,
    requireItems: false,
    sourceAnchorEvidenceBatch: DEFAULT_SOURCE_ANCHOR_EVIDENCE_BATCH,
    sourceRowConfirmationBatch: DEFAULT_SOURCE_ROW_CONFIRMATION_BATCH,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    targetStandardGapResolutionBatch: DEFAULT_TARGET_STANDARD_GAP_RESOLUTION_BATCH
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--coverage-audit') args.coverageAudit = argv[++i]
    else if (item === '--source-anchor-evidence-batch') args.sourceAnchorEvidenceBatch = argv[++i]
    else if (item === '--manual-scope-indexing-batch') args.manualScopeIndexingBatch = argv[++i]
    else if (item === '--item-level-source-review-batch') args.itemLevelSourceReviewBatch = argv[++i]
    else if (item === '--source-row-confirmation-batch') args.sourceRowConfirmationBatch = argv[++i]
    else if (item === '--target-standard-gap-resolution-batch') args.targetStandardGapResolutionBatch = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits editable downstream action-review decisions against the five action
batches and downstream action coverage audit. Pending decisions are valid by
default; this audit does not approve publication.`)
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
  return sorted(actual || []).join('|') === sorted(expected || []).join('|')
}

function mapsMatch(actual, expected) {
  return JSON.stringify(stable(actual || {})) === JSON.stringify(stable(expected || {}))
}

function decisionTemplate(row) {
  return row.review_decision_template || row.confirmation_decision_template || {}
}

function allowedOutcomes(row) {
  const template = decisionTemplate(row)
  return template.allowed_review_outcomes || template.allowed_confirmation_outcomes || []
}

function expectedAllowedDecisions(row) {
  return sorted(['pending', ...allowedOutcomes(row)])
}

function sourceStandardCode(row) {
  return row.source_standard_code || row.source_context?.source_standard_context?.code || ''
}

function targetGradeBand(row) {
  return row.target_grade_band || row.missing_grade_band || row.grade_band || ''
}

function unitEvidenceId(row) {
  return row.unit_evidence_id || row.unit_context?.unit_evidence_id || row.source_context?.unit_context?.unit_evidence_id || ''
}

function actualKey(row) {
  return `${row.decision_type}|${row.source_downstream_action_item_id}`
}

function expectedKey(spec, row) {
  return `${spec.decisionType}|${row[spec.idKey]}`
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

function validateCoverageAudit(coverageAudit, batchPaths, errors) {
  if (coverageAudit.valid !== true) errors.push('coverage audit valid must be true')
  if (coverageAudit.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_coverage_audit') {
    errors.push('coverage audit purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_coverage_audit')
  }
  validatePolicy('coverage audit', coverageAudit, errors)
  for (const [label, path] of Object.entries(batchPaths)) {
    const actualPath = coverageAudit.summary?.by_batch?.[label]?.batch_path
    if (actualPath !== path) errors.push(`coverage audit ${label}.batch_path must match audit arg`)
  }
}

function validateBatch(payload, spec, errors) {
  if (payload.valid !== true) errors.push(`${spec.label} batch valid must be true`)
  if (payload.purpose !== spec.purpose) errors.push(`${spec.label} batch purpose must be ${spec.purpose}`)
  if (payload.worklist_only !== true) errors.push(`${spec.label} batch worklist_only must be true`)
  validatePolicy(`${spec.label} batch`, payload, errors)
  if (!Array.isArray(payload[spec.rowsKey])) errors.push(`${spec.label} batch ${spec.rowsKey} must be an array`)
}

function validateTopLevel(decisions, args, batchPaths, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template')
  }
  if (decisions.source_downstream_action_coverage_audit !== args.coverageAudit) {
    errors.push('decisions source_downstream_action_coverage_audit must match audit arg')
  }
  for (const [label, path] of Object.entries(batchPaths)) {
    if (decisions.source_downstream_action_batches?.[label] !== path) {
      errors.push(`decisions source_downstream_action_batches.${label} must match audit arg`)
    }
  }
  validatePolicy('decisions', decisions, errors)
  if (decisions.eligible_for_h4g_differentiation !== false) errors.push('decisions eligible_for_h4g_differentiation must be false')
  const policy = decisions.policy || {}
  for (const key of [
    'downstream_action_review_decision_is_not_approval',
    'downstream_decision_must_be_edited_separately',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`policy.${key} must be true`)
  }
}

function collectBatches(args, errors) {
  const batchPaths = Object.fromEntries(BATCH_SPECS.map(spec => [spec.label, args[spec.argKey]]))
  const batches = {}
  for (const spec of BATCH_SPECS) {
    const path = args[spec.argKey]
    if (!existsSync(path)) {
      errors.push(`Missing ${spec.label} batch: ${path}`)
      batches[spec.label] = { [spec.rowsKey]: [] }
      continue
    }
    const payload = readJson(path)
    validateBatch(payload, spec, errors)
    batches[spec.label] = payload
  }
  return { batches, batchPaths }
}

function expectedRows(batches) {
  const rows = []
  for (const spec of BATCH_SPECS) {
    for (const sourceItem of batches[spec.label]?.[spec.rowsKey] || []) rows.push({ sourceItem, spec })
  }
  return rows
}

function auditDecision(decision, sourceItem, spec, errors, stats) {
  const prefix = decision.decision_id || decision.source_downstream_action_item_id || '(missing downstream action decision)'
  if (!decision.decision_id) errors.push(`${prefix} decision_id is required`)
  const fieldChecks = [
    ['decision_type', decision.decision_type, spec.decisionType],
    ['source_downstream_action_batch', decision.source_downstream_action_batch, spec.label],
    ['source_downstream_action_item_id', decision.source_downstream_action_item_id, sourceItem[spec.idKey]],
    ['source_downstream_action_item_type', decision.source_downstream_action_item_type, spec.sourceType],
    ['parent_downstream_action_work_item_id', decision.parent_downstream_action_work_item_id, sourceItem.parent_downstream_action_work_item_id],
    ['downstream_decision_id', decision.downstream_decision_id, sourceItem.downstream_decision_id],
    ['parent_action_work_item_id', decision.parent_action_work_item_id, sourceItem.parent_action_work_item_id],
    ['parent_decision_id', decision.parent_decision_id, sourceItem.parent_decision_id],
    ['parent_source_batch_item_id', decision.parent_source_batch_item_id, sourceItem.parent_source_batch_item_id],
    ['source_batch', decision.source_batch, sourceItem.source_batch],
    ['source_batch_item_id', decision.source_batch_item_id, sourceItem.source_batch_item_id],
    ['source_batch_item_type', decision.source_batch_item_type, sourceItem.source_batch_item_type],
    ['standard_code', decision.standard_code, sourceItem.standard_code],
    ['target_standard_code', decision.target_standard_code, sourceItem.target_standard_code],
    ['grade_band', decision.grade_band, sourceItem.grade_band],
    ['target_grade_band', decision.target_grade_band, targetGradeBand(sourceItem)],
    ['subject_slug', decision.subject_slug, sourceItem.subject_slug],
    ['progression_group_id', decision.progression_group_id, sourceItem.progression_group_id],
    ['priority_rank', decision.priority_rank, sourceItem.priority_rank],
    ['priority_tier', decision.priority_tier, sourceItem.priority_tier],
    ['review_grain', decision.review_grain, sourceItem.review_grain],
    ['source_key', decision.source_key, sourceItem.source_key],
    ['source_standard_code', decision.source_standard_code, sourceStandardCode(sourceItem)],
    ['unit_evidence_id', decision.unit_evidence_id, unitEvidenceId(sourceItem)],
    ['recommended_reviewer_decision', decision.recommended_reviewer_decision, sourceItem.recommended_reviewer_decision]
  ]
  for (const [field, actual, expectedValue] of fieldChecks) {
    if (String(actual ?? '') !== String(expectedValue ?? '')) errors.push(`${prefix} ${field} must match source action item`)
  }
  if (!arraysMatch(decision.allowed_decisions, expectedAllowedDecisions(sourceItem))) {
    errors.push(`${prefix} allowed_decisions must match source action template`)
  }
  if (!mapsMatch(decision.required_confirmations, decisionTemplate(sourceItem).required_confirmations || {})) {
    errors.push(`${prefix} required_confirmations must match source action template`)
  }
  if (!arraysMatch(decision.required_confirmations_to_close, sourceItem.required_confirmations_to_close || [])) {
    errors.push(`${prefix} required_confirmations_to_close must match source action item`)
  }
  if (decision.reviewer_decision !== 'pending') errors.push(`${prefix} reviewer_decision must start pending`)
  if (decision.decision_status !== 'pending_review') errors.push(`${prefix} decision_status must be pending_review`)
  if (decision.reviewed_at || decision.reviewed_by || decision.decision_note) {
    errors.push(`${prefix} reviewed_at/reviewed_by/decision_note must start empty`)
  }
  if (decision.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (decision.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (decision.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
  if (decision.requested_eligible_for_h4g_differentiation !== false) {
    errors.push(`${prefix} requested_eligible_for_h4g_differentiation must be false`)
  }
  validatePolicy(prefix, decision, errors)
  const policy = decision.downstream_action_review_policy || {}
  for (const key of [
    'downstream_action_review_decision_is_not_approval',
    'downstream_decision_must_be_edited_separately',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${prefix} downstream_action_review_policy.${key} must be true`)
  }
  for (const forbidden of ['matcher_ready', 'publication_ready', 'approve_standard_scoped_subject_theme_bridge']) {
    if ((decision.allowed_decisions || []).includes(forbidden)) errors.push(`${prefix} allowed_decisions must not include ${forbidden}`)
  }

  countInto(stats.by_decision_type, decision.decision_type)
  countInto(stats.by_grade_band, decision.grade_band)
  countInto(stats.by_reviewer_decision, decision.reviewer_decision)
  countInto(stats.by_source_batch, decision.source_batch)
  countInto(stats.by_source_downstream_action_batch, decision.source_downstream_action_batch)
  countInto(stats.by_subject, decision.subject_slug)
}

function markdownSummary(payload) {
  return `# H4G Downstream Action Decisions Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected decisions | ${payload.summary.expected_downstream_action_decisions} |
| actual decisions | ${payload.summary.downstream_action_decisions} |
| missing decisions | ${payload.summary.missing_decisions} |
| extra decisions | ${payload.summary.extra_decisions} |
| pending decisions | ${payload.summary.pending_decisions} |

## Source Action Batches

| source action batch | decisions |
| --- | ---: |
${countRows(payload.summary.by_source_downstream_action_batch)}

## Reviewer Decisions

| reviewer decision | decisions |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['decisions', args.decisions],
    ['coverage audit', args.coverageAudit]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { downstream_action_decisions: [] }
  const coverageAudit = existsSync(args.coverageAudit) ? readJson(args.coverageAudit) : {}
  const { batches, batchPaths } = collectBatches(args, errors)
  if (!errors.length) {
    validateCoverageAudit(coverageAudit, batchPaths, errors)
    validateTopLevel(decisions, args, batchPaths, errors)
  }

  const expected = expectedRows(batches)
  const actualRows = decisions.downstream_action_decisions || []
  if (!Array.isArray(decisions.downstream_action_decisions)) errors.push('decisions downstream_action_decisions must be an array')
  const actualByKey = new Map()
  for (const row of actualRows) {
    const key = actualKey(row)
    if (actualByKey.has(key)) errors.push(`duplicate downstream action decision key: ${key}`)
    actualByKey.set(key, row)
  }
  const expectedByKey = new Map(expected.map(row => [expectedKey(row.spec, row.sourceItem), row]))
  const stats = {
    by_decision_type: {},
    by_grade_band: {},
    by_reviewer_decision: {},
    by_source_batch: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    downstream_action_decisions: actualRows.length,
    expected_downstream_action_decisions: expected.length,
    extra_decisions: 0,
    missing_decisions: 0,
    pending_decisions: actualRows.filter(row => row.reviewer_decision === 'pending').length
  }

  for (const { sourceItem, spec } of expected) {
    const key = expectedKey(spec, sourceItem)
    const decision = actualByKey.get(key)
    if (!decision) {
      stats.missing_decisions += 1
      errors.push(`${key} missing downstream action decision`)
      continue
    }
    auditDecision(decision, sourceItem, spec, errors, stats)
  }
  for (const row of actualRows) {
    if (!expectedByKey.has(actualKey(row))) {
      stats.extra_decisions += 1
      errors.push(`${actualKey(row)} unexpected downstream action decision`)
    }
  }
  if (args.requireItems && !expected.length) errors.push('requireItems is set but expected action rows are empty')
  if (args.requireItems && !actualRows.length) errors.push('requireItems is set but decisions has no downstream_action_decisions')
  if (stats.downstream_action_decisions !== stats.expected_downstream_action_decisions) {
    errors.push(`downstream_action_decisions ${stats.downstream_action_decisions} must match expected ${stats.expected_downstream_action_decisions}`)
  }

  return {
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    require_items: args.requireItems,
    source_downstream_action_coverage_audit: args.coverageAudit,
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
