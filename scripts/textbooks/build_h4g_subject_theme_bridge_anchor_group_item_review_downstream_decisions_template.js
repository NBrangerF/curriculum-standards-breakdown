#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_SOURCE_REVIEW_READY_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_review_ready_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_CHILD_SPLIT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_child_split_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_SPECIFICITY_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_anchor_specificity_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_MISSING_GRADE_UNIT_INDEXING_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_TARGET_STANDARD_GAP_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_standard_gap_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_COVERAGE_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_coverage_audit_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.md'

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
    missingGradeUnitIndexingBatch: DEFAULT_MISSING_GRADE_UNIT_INDEXING_BATCH,
    out: DEFAULT_OUT,
    requireItems: false,
    sourceAnchorSpecificityBatch: DEFAULT_SOURCE_ANCHOR_SPECIFICITY_BATCH,
    sourceReviewReadyBatch: DEFAULT_SOURCE_REVIEW_READY_BATCH,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    targetStandardGapBatch: DEFAULT_TARGET_STANDARD_GAP_BATCH
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--source-review-ready-batch') args.sourceReviewReadyBatch = argv[++i]
    else if (item === '--child-split-batch') args.childSplitBatch = argv[++i]
    else if (item === '--source-anchor-specificity-batch') args.sourceAnchorSpecificityBatch = argv[++i]
    else if (item === '--missing-grade-unit-indexing-batch') args.missingGradeUnitIndexingBatch = argv[++i]
    else if (item === '--target-standard-gap-batch') args.targetStandardGapBatch = argv[++i]
    else if (item === '--coverage-audit') args.coverageAudit = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template.js \\
  --strict --require-items

Builds an editable downstream decision template from the five item-review
downstream batches. Every row starts pending. This template records reviewer
outcomes only; it does not approve bridges, write public/data, change official
standard text, or enable matcher/publication use.`)
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
    downstream_item_review_decision_is_not_approval: true,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    source_decision_must_be_edited_separately: true,
    writes_public_data: false
  }
}

function validateBatch(payload, spec, args, errors) {
  if (payload.valid !== true) errors.push(`${spec.label} batch valid must be true`)
  if (payload.purpose !== spec.purpose) errors.push(`${spec.label} batch purpose must be ${spec.purpose}`)
  if (payload.source_anchor_group_item_review_action_worklist && payload.worklist_only !== true) {
    errors.push(`${spec.label} batch worklist_only must be true`)
  }
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
  if (payload.source_anchor_group_item_review_action_worklist && !payload.source_anchor_group_item_review_action_worklist.includes('item_review_action_worklist')) {
    errors.push(`${spec.label} batch source worklist lineage is invalid`)
  }
  if (args.requireItems && !(payload[spec.rowsKey] || []).length) errors.push(`${spec.label} batch has no rows`)
}

function validateCoverageAudit(coverageAudit, batchPaths, errors) {
  if (coverageAudit.valid !== true) errors.push('coverage audit valid must be true')
  if (coverageAudit.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_coverage_audit') {
    errors.push('coverage audit purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_coverage_audit')
  }
  if (coverageAudit.writes_public_data !== false) errors.push('coverage audit writes_public_data must be false')
  if (coverageAudit.direct_matcher_use !== false) errors.push('coverage audit direct_matcher_use must be false')
  if (coverageAudit.matcher_ready !== false) errors.push('coverage audit matcher_ready must be false')
  if (coverageAudit.publication_ready !== false) errors.push('coverage audit publication_ready must be false')
  for (const [label, path] of Object.entries(batchPaths)) {
    const actualPath = coverageAudit.summary?.by_batch?.[label]?.batch_path
    if (actualPath !== path) errors.push(`coverage audit ${label}.batch_path must match builder arg`)
  }
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

function compactSourceContext(row) {
  return {
    anchor_requirement: row.anchor_requirement || {},
    bridge_context: row.bridge_context || {},
    existing_grade_bands: row.existing_grade_bands || [],
    existing_unit_context_by_grade_band: row.existing_unit_context_by_grade_band || {},
    missing_grade_bands: row.missing_grade_bands || [],
    recommendation_source: row.recommendation_source || {},
    source_standard_context: row.source_standard_context || {},
    standard_context: row.standard_context || {},
    target_standard_context: row.target_standard_context || {},
    unit_context: row.unit_context || {}
  }
}

function decisionRow(spec, source) {
  const sourceItemId = source[spec.idKey] || ''
  const sourceAnchorIds = sourceAnchorReviewItemIds(source)
  return {
    allowed_decisions: allowedDecisions(source),
    anchor_type: source.anchor_type || '',
    decision_id: `h4g_anchor_group_downstream_decision_${hashText(`${spec.decisionType}|${sourceItemId}`)}`,
    decision_note: '',
    decision_status: 'pending_review',
    decision_type: spec.decisionType,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    grade_band: gradeBand(source),
    item_review_surface: source.item_review_surface || '',
    matcher_ready: false,
    parent_action_work_item_id: source.parent_action_work_item_id || '',
    parent_decision_id: source.parent_decision_id || '',
    parent_source_batch_item_id: source.parent_source_batch_item_id || '',
    priority_rank: source.priority_rank,
    priority_tier: source.priority_tier || '',
    progression_group_id: source.progression_group_id || '',
    publication_policy: { ...basePolicy(), ...(source.publication_policy || {}) },
    publication_ready: false,
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: source.review_decision_template?.required_confirmations || {},
    review_decision_template: source.review_decision_template || {},
    review_focus: source.review_focus || '',
    review_grain: source.review_grain || '',
    reviewed_at: '',
    reviewed_by: '',
    reviewer_decision: 'pending',
    source_anchor_review_item_ids: sourceAnchorIds,
    source_anchor_review_rows: sourceAnchorIds.length || sourceAnchorReviewItems(source).length,
    source_batch: spec.label,
    source_batch_item_id: sourceItemId,
    source_batch_item_type: spec.sourceType,
    source_context: compactSourceContext(source),
    source_decision_id: source.source_decision_id || '',
    source_standard_code: source.source_standard_code || source.standard_code || '',
    standard_code: standardCode(source),
    subject_slug: source.subject_slug || '',
    target_standard_code: source.target_standard_code || '',
    writes_public_data: false
  }
}

function buildRows(batches) {
  const rows = []
  for (const spec of BATCH_SPECS) {
    for (const row of batches[spec.label]?.[spec.rowsKey] || []) {
      rows.push(decisionRow(spec, row))
    }
  }
  return rows.sort((a, b) => Number(a.priority_rank || 0) - Number(b.priority_rank || 0) ||
    a.source_batch.localeCompare(b.source_batch) ||
    a.progression_group_id.localeCompare(b.progression_group_id) ||
    a.grade_band.localeCompare(b.grade_band) ||
    a.standard_code.localeCompare(b.standard_code) ||
    a.source_batch_item_id.localeCompare(b.source_batch_item_id))
}

function summarize(rows) {
  const summary = {
    by_decision_type: {},
    by_grade_band: {},
    by_item_review_surface: {},
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_source_batch: {},
    by_subject: {},
    completed_downstream_decisions: 0,
    downstream_decisions: rows.length,
    pending_downstream_decisions: 0,
    source_anchor_review_rows: 0
  }
  for (const row of rows) {
    if (row.reviewer_decision === 'pending') summary.pending_downstream_decisions += 1
    else summary.completed_downstream_decisions += 1
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    countInto(summary.by_decision_type, row.decision_type)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_item_review_surface, row.item_review_surface)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.source_batch)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.reviewer_decision)} | ${truncate(row.source_batch_item_id)} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Item Review Downstream Decisions Template

Generated at: ${payload.generated_at}

This editable template combines the five item-review downstream batches into
pending decisions. It records reviewer outcomes for downstream review rows only;
it does not approve bridges, write \`public/data\`, change official standard
text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| downstream decisions | ${payload.summary.downstream_decisions} |
| pending downstream decisions | ${payload.summary.pending_downstream_decisions} |
| completed downstream decisions | ${payload.summary.completed_downstream_decisions} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Source Batches

| source batch | decisions |
| --- | ---: |
${countRows(payload.summary.by_source_batch)}

## Grade Bands

| grade band | decisions |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Preview

| rank | tier | source batch | subject | grade | standard | decision | source item |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.downstream_decisions)}

## Guardrails

- All rows start as \`pending\`.
- Downstream item review decisions are not bridge approvals.
- Public data, official standard text, matcher readiness and publication readiness remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  const batchPaths = Object.fromEntries(BATCH_SPECS.map(spec => [spec.label, args[spec.argKey]]))
  for (const [label, path] of [...Object.entries(batchPaths), ['coverage_audit', args.coverageAudit]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const batches = {}
  for (const spec of BATCH_SPECS) {
    batches[spec.label] = errors.length ? { [spec.rowsKey]: [] } : readJson(args[spec.argKey])
    if (!errors.length) validateBatch(batches[spec.label], spec, args, errors)
  }
  const coverageAudit = errors.length ? {} : readJson(args.coverageAudit)
  if (!errors.length) validateCoverageAudit(coverageAudit, batchPaths, errors)

  const rows = buildRows(batches)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no downstream decisions were generated')
  return {
    changes_official_standard_text: false,
    data_scope: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template',
    direct_matcher_use: false,
    downstream_decisions: rows,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: basePolicy(),
    publication_candidate: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template',
    review_only: true,
    source_downstream_coverage_audit: args.coverageAudit,
    source_downstream_review_batches: batchPaths,
    summary: summarize(rows),
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
