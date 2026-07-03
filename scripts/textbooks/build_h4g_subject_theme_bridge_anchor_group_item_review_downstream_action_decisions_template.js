#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_COVERAGE_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_coverage_audit_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_EVIDENCE_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_MANUAL_SCOPE_INDEXING_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_ITEM_LEVEL_SOURCE_REVIEW_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ROW_CONFIRMATION_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_TARGET_STANDARD_GAP_RESOLUTION_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.md'

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
    if (item === '--coverage-audit') args.coverageAudit = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template.js \\
  --strict --require-items

Builds an editable downstream action-review decision template from the five
downstream action batches. Every row starts pending. This template records
reviewer outcomes only; it does not approve bridges, write public/data, change
official standard text, or enable matcher/publication use.`)
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

function truncate(value, max = 90) {
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

function basePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_review_decision_is_not_approval: true,
    downstream_decision_must_be_edited_separately: true,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function validateCoverageAudit(coverageAudit, batchPaths, errors) {
  if (coverageAudit.valid !== true) errors.push('coverage audit valid must be true')
  if (coverageAudit.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_coverage_audit') {
    errors.push('coverage audit purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_coverage_audit')
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
    if (actualPath !== path) errors.push(`coverage audit ${label}.batch_path must match builder arg`)
  }
}

function validateBatch(payload, spec, args, errors) {
  if (payload.valid !== true) errors.push(`${spec.label} batch valid must be true`)
  if (payload.purpose !== spec.purpose) errors.push(`${spec.label} batch purpose must be ${spec.purpose}`)
  if (payload.worklist_only !== true) errors.push(`${spec.label} batch worklist_only must be true`)
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (payload[key] !== false) errors.push(`${spec.label} batch ${key} must be false`)
  }
  if (!Array.isArray(payload[spec.rowsKey])) errors.push(`${spec.label} batch ${spec.rowsKey} must be an array`)
  if (args.requireItems && !(payload[spec.rowsKey] || []).length) errors.push(`${spec.label} batch has no rows`)
}

function decisionTemplate(row) {
  return row.review_decision_template || row.confirmation_decision_template || {}
}

function allowedOutcomes(row) {
  const template = decisionTemplate(row)
  return template.allowed_review_outcomes || template.allowed_confirmation_outcomes || []
}

function decisionId(spec, row) {
  return `h4g_anchor_group_downstream_action_decision_${hashText(`${spec.label}|${row[spec.idKey] || ''}`)}`
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

function templateForDecision(row) {
  const template = decisionTemplate(row)
  return {
    allowed_decisions: uniqueStrings(['pending', ...allowedOutcomes(row)]),
    required_confirmations: template.required_confirmations || {},
    review_questions: uniqueStrings(template.review_questions || row.review_questions || []),
    reviewer_note_template: template.reviewer_note_template || ''
  }
}

function decisionFromRow(spec, row) {
  const template = templateForDecision(row)
  return {
    allowed_decisions: template.allowed_decisions,
    anchor_type: row.anchor_type || row.anchor_requirement?.anchor_type || '',
    changes_official_standard_text: false,
    decision_id: decisionId(spec, row),
    decision_note: '',
    decision_status: 'pending_review',
    decision_type: spec.decisionType,
    direct_matcher_use: false,
    downstream_action_review_policy: basePolicy(),
    downstream_decision_id: row.downstream_decision_id || '',
    eligible_for_h4g_differentiation: false,
    grade_band: row.grade_band || '',
    item_review_surface: row.item_review_surface || '',
    matcher_ready: false,
    parent_action_work_item_id: row.parent_action_work_item_id || '',
    parent_decision_id: row.parent_decision_id || '',
    parent_downstream_action_work_item_id: row.parent_downstream_action_work_item_id || '',
    parent_source_batch_item_id: row.parent_source_batch_item_id || '',
    priority_rank: row.priority_rank,
    priority_tier: row.priority_tier || '',
    progression_group_id: row.progression_group_id || '',
    publication_ready: false,
    recommended_next_gate: row.recommended_next_gate || '',
    recommended_reviewer_decision: row.recommended_reviewer_decision || '',
    required_confirmations: template.required_confirmations,
    required_confirmations_to_close: row.required_confirmations_to_close || [],
    required_output: row.required_output || '',
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    review_grain: row.review_grain || '',
    review_questions: template.review_questions,
    reviewed_at: '',
    reviewed_by: '',
    reviewer_decision: 'pending',
    reviewer_gate: row.reviewer_gate || '',
    reviewer_note_template: template.reviewer_note_template,
    risk_signals: row.risk_signals || [],
    source_anchor_review_item_ids: row.source_anchor_review_item_ids || [],
    source_anchor_review_rows: row.source_anchor_review_rows || 0,
    source_batch: row.source_batch || '',
    source_batch_item_id: row.source_batch_item_id || '',
    source_batch_item_type: row.source_batch_item_type || '',
    source_context: row.source_context || {},
    source_downstream_action_batch: spec.label,
    source_downstream_action_item_id: row[spec.idKey] || '',
    source_downstream_action_item_type: spec.sourceType,
    source_key: row.source_key || '',
    source_standard_code: sourceStandardCode(row),
    standard_code: row.standard_code || '',
    subject_slug: row.subject_slug || '',
    target_grade_band: targetGradeBand(row),
    target_standard_code: row.target_standard_code || '',
    unit_evidence_id: unitEvidenceId(row),
    unit_title: row.unit_title || row.unit_context?.unit_title || row.source_context?.unit_context?.unit_title || '',
    writes_public_data: false
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
    validateBatch(payload, spec, args, errors)
    batches[spec.label] = payload
  }
  return { batches, batchPaths }
}

function summarize(rows) {
  const summary = {
    by_decision_type: {},
    by_grade_band: {},
    by_reviewer_decision: {},
    by_source_batch: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    downstream_action_decisions: rows.length,
    pending_decisions: 0,
    unique_parent_downstream_action_work_items: sorted(rows.map(row => row.parent_downstream_action_work_item_id)).length,
    unique_source_action_items: sorted(rows.map(row => row.source_downstream_action_item_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length
  }
  for (const row of rows) {
    if (row.reviewer_decision === 'pending') summary.pending_decisions += 1
    countInto(summary.by_decision_type, row.decision_type)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_source_downstream_action_batch, row.source_downstream_action_batch)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${markdownCell(row.source_downstream_action_batch)} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code || row.source_standard_code || row.target_standard_code)} | ${markdownCell(row.reviewer_decision)} | ${truncate(row.unit_title || row.required_output)} |`
  )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Action Decisions Template

Generated at: ${payload.generated_at}

This editable template combines the five downstream action batches into one
pending decision surface. It records reviewer outcomes only. It does not approve
bridges, write \`public/data\`, change official standard text, or enable
matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| downstream action decisions | ${payload.summary.downstream_action_decisions} |
| pending decisions | ${payload.summary.pending_decisions} |
| unique parent downstream work items | ${payload.summary.unique_parent_downstream_action_work_items} |
| unique source action items | ${payload.summary.unique_source_action_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Source Action Batches

| source action batch | decisions |
| --- | ---: |
${countRows(payload.summary.by_source_downstream_action_batch)}

## Reviewer Decisions

| reviewer decision | decisions |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Preview

| source batch | tier | subject | grade | standard | reviewer decision | context |
| --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.downstream_action_decisions)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.coverageAudit)) errors.push(`Missing coverage audit: ${args.coverageAudit}`)
  const coverageAudit = errors.length ? {} : readJson(args.coverageAudit)
  const { batches, batchPaths } = collectBatches(args, errors)
  if (!errors.length) validateCoverageAudit(coverageAudit, batchPaths, errors)

  const decisions = []
  const seen = new Set()
  for (const spec of BATCH_SPECS) {
    for (const row of batches[spec.label]?.[spec.rowsKey] || []) {
      const id = row[spec.idKey]
      if (!id) errors.push(`${spec.label} row missing ${spec.idKey}`)
      const key = `${spec.decisionType}|${id || ''}`
      if (seen.has(key)) errors.push(`duplicate downstream action decision source key: ${key}`)
      seen.add(key)
      decisions.push(decisionFromRow(spec, row))
    }
  }
  if (args.requireItems && !decisions.length) errors.push('requireItems is set but no downstream action decisions were generated')
  return {
    changes_official_standard_text: false,
    data_scope: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template',
    direct_matcher_use: false,
    downstream_action_decisions: decisions,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: basePolicy(),
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template',
    source_downstream_action_batches: batchPaths,
    source_downstream_action_coverage_audit: args.coverageAudit,
    summary: summarize(decisions),
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
  const payload = buildPayload(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
