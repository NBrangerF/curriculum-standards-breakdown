#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SPLIT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_EVIDENCE_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.md'

const ROUTES = {
  accept_bounded_slice_for_item_level_source_review: {
    action_type: 'prepare_item_level_source_review_packet',
    queue: 'item_level_source_review_ready_queue',
    required_output: 'item-level source review packet with same-grade, same-subject source row confirmations',
    reviewer_gate: 'Do not approve the bridge here; move only into the later item-level source review gate.'
  },
  needs_source_anchor_evidence: {
    action_type: 'verify_exact_source_anchor_before_item_review',
    queue: 'source_anchor_specificity_queue',
    required_output: 'source-anchor specificity note confirming the exact anchor or keeping the slice out of item-level review',
    reviewer_gate: 'Confirm the source shows the exact anchor requirement, not only a broad topic or shared theme.'
  },
  needs_textbook_unit_indexing: {
    action_type: 'index_missing_grade_textbook_units',
    queue: 'missing_grade_textbook_unit_indexing_queue',
    required_output: 'same-grade textbook unit candidates for the missing grade target standard',
    reviewer_gate: 'Recover or index missing-grade unit evidence before any source-anchor decision.'
  },
  source_anchor_evidence_found_for_missing_grade: {
    action_type: 'verify_found_missing_grade_source_anchor',
    queue: 'missing_grade_source_anchor_verification_queue',
    required_output: 'verified same-grade source-anchor evidence for the missing grade standard',
    reviewer_gate: 'Confirm same-grade evidence is specific to the target standard before any later bridge decision.'
  },
  split_slice_further: {
    action_type: 'split_bounded_slice_by_unit_or_source_row',
    queue: 'unit_or_source_row_split_queue',
    required_output: 'one child review row per unit/source row before item-level source review',
    reviewer_gate: 'Split this row by unit/source row; do not treat the current slice as a single source item.'
  },
  target_missing_grade_standard_absent: {
    action_type: 'resolve_target_grade_standard_gap',
    queue: 'target_standard_gap_queue',
    required_output: 'target-standard gap resolution for each absent grade band',
    reviewer_gate: 'Resolve the target standard inventory gap before searching source-anchor evidence.'
  }
}

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    recommendations: DEFAULT_RECOMMENDATIONS,
    requireItems: false,
    sourceEvidenceBatch: DEFAULT_SOURCE_EVIDENCE_BATCH,
    splitBatch: DEFAULT_SPLIT_BATCH,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--recommendations') args.recommendations = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--split-batch') args.splitBatch = argv[++i]
    else if (item === '--source-evidence-batch') args.sourceEvidenceBatch = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_action_worklist.js \\
  --recommendations generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_recommendations_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --split-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json \\
  --source-evidence-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a recommendation-derived action worklist for H4G anchor-group item review.
It does not edit the decisions template, approve bridges, write public/data,
change official standard text, or enable matcher/publication use.`)
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

function truncate(value, max = 96) {
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

function compactList(values, limit = 5) {
  const items = sorted(values)
  if (items.length <= limit) return items.join('; ')
  return `${items.slice(0, limit).join('; ')}; ...(+${items.length - limit})`
}

function validateTopLevel(recommendations, decisions, splitBatch, sourceEvidenceBatch, args, errors) {
  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_recommendations') {
    errors.push('recommendations purpose must be h4g_subject_theme_bridge_anchor_group_item_review_recommendations')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (recommendations.source_anchor_group_item_review_decisions !== args.decisions) {
    errors.push('recommendations source_anchor_group_item_review_decisions must match --decisions')
  }
  if (recommendations.source_anchor_group_split_review_batch !== args.splitBatch) {
    errors.push('recommendations source_anchor_group_split_review_batch must match --split-batch')
  }
  if (recommendations.source_anchor_group_source_evidence_batch !== args.sourceEvidenceBatch) {
    errors.push('recommendations source_anchor_group_source_evidence_batch must match --source-evidence-batch')
  }
  if (recommendations.writes_public_data !== false) errors.push('recommendations writes_public_data must be false')
  if (recommendations.changes_official_standard_text !== false) errors.push('recommendations changes_official_standard_text must be false')
  if (recommendations.direct_matcher_use !== false) errors.push('recommendations direct_matcher_use must be false')
  if (recommendations.matcher_ready !== false) errors.push('recommendations matcher_ready must be false')
  if (recommendations.publication_ready !== false) errors.push('recommendations publication_ready must be false')

  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_decisions_template')
  }
  if (decisions.source_anchor_group_split_review_batch !== args.splitBatch) {
    errors.push('decisions source_anchor_group_split_review_batch must match --split-batch')
  }
  if (decisions.source_anchor_group_source_evidence_batch !== args.sourceEvidenceBatch) {
    errors.push('decisions source_anchor_group_source_evidence_batch must match --source-evidence-batch')
  }
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.direct_matcher_use !== false) errors.push('decisions direct_matcher_use must be false')
  if (decisions.matcher_ready !== false) errors.push('decisions matcher_ready must be false')
  if (decisions.publication_ready !== false) errors.push('decisions publication_ready must be false')

  if (splitBatch.valid !== true) errors.push('split batch valid must be true')
  if (splitBatch.purpose !== 'h4g_subject_theme_bridge_anchor_group_split_review_batch') {
    errors.push('split batch purpose must be h4g_subject_theme_bridge_anchor_group_split_review_batch')
  }
  if (sourceEvidenceBatch.valid !== true) errors.push('source evidence batch valid must be true')
  if (sourceEvidenceBatch.purpose !== 'h4g_subject_theme_bridge_anchor_group_source_evidence_batch') {
    errors.push('source evidence batch purpose must be h4g_subject_theme_bridge_anchor_group_source_evidence_batch')
  }
}

function mapBy(rows, key, errors, label) {
  const out = new Map()
  for (const row of rows || []) {
    const id = row[key]
    if (!id) {
      errors.push(`${label} row missing ${key}`)
      continue
    }
    if (out.has(id)) errors.push(`${label} duplicate ${key}: ${id}`)
    out.set(id, row)
  }
  return out
}

function requiredConfirmations(decision) {
  return Object.entries(decision.required_confirmations || {})
    .filter(([, value]) => value === false)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b))
}

function standardSummary(standard) {
  if (!standard || typeof standard !== 'object') return {}
  return {
    code: standard.code || standard.id || standard.standard_code || '',
    domain: standard.domain || '',
    grade: standard.grade || '',
    grade_band: standard.grade_band || '',
    grade_level: standard.grade_level ?? null,
    legacy_code: standard.legacy_code || '',
    practice: standard.practice || '',
    progression_role: standard.progression_role || '',
    review_status: standard.review_status || '',
    source_grade_range: standard.source_grade_range || '',
    source_standard_scope: standard.source_standard_scope || '',
    standard: standard.standard || '',
    subdomain: standard.subdomain || '',
    subject_slug: standard.subject_slug || ''
  }
}

function sourceRowSummary(row) {
  return {
    action_family: row.action_family || '',
    anchor_review_item_id: row.anchor_review_item_id || '',
    anchor_type: row.anchor_type || row.anchor_requirement?.anchor_type || '',
    bridge_score: row.bridge_context?.bridge_score ?? null,
    grade_band: row.grade_band || '',
    page_range: row.bridge_context?.page_range || '',
    page_range_status: row.bridge_context?.page_range_status || '',
    page_start: row.bridge_context?.page_start ?? null,
    remediation_item_id: row.remediation_item_id || '',
    risk_flags: row.evidence_profile?.risk_flags || [],
    shared_topic_tags: row.bridge_context?.shared_topic_tags || [],
    source_decision_id: row.source_decision_id || '',
    source_review_id: row.source_review_id || '',
    source_review_decision: row.evidence_profile?.source_review_decision || '',
    source_work_item_id: row.source_work_item_id || '',
    standard_code: row.standard_context?.standard_code || '',
    textbook_evidence_id: row.unit_context?.textbook_evidence_id || '',
    unit_evidence_id: row.unit_context?.unit_evidence_id || '',
    unit_level: row.unit_context?.unit_level || '',
    unit_title: row.unit_context?.unit_title || '',
    volume: row.unit_context?.volume || ''
  }
}

function sourceRows(sourceItem) {
  return sourceItem?.source_anchor_review_items || []
}

function targetStandards(row, sourceItem) {
  const targets = row.target_missing_grade_standards?.length
    ? row.target_missing_grade_standards
    : sourceItem?.target_missing_grade_standards || []
  return targets.map(standardSummary)
}

function sourceBatchItem(row, decision, indexes, errors) {
  if (decision?.source_batch_item_type === 'split_review_item' || row.decision_type === 'anchor_group_split_item_review_decision') {
    const item = indexes.splitById.get(row.source_batch_item_id)
    if (!item) errors.push(`${row.decision_id} source split batch item not found: ${row.source_batch_item_id}`)
    return item || {}
  }
  if (decision?.source_batch_item_type === 'source_evidence_request_item' || row.decision_type === 'anchor_group_source_evidence_item_review_decision') {
    const item = indexes.sourceEvidenceById.get(row.source_batch_item_id)
    if (!item) errors.push(`${row.decision_id} source evidence batch item not found: ${row.source_batch_item_id}`)
    return item || {}
  }
  errors.push(`${row.decision_id} unknown source batch item type`)
  return {}
}

function suggestedChildSlices(row, sourceItem) {
  if (row.recommended_reviewer_decision !== 'split_slice_further') return []
  return sourceRows(sourceItem).map((sourceRow, index) => ({
    anchor_review_item_id: sourceRow.anchor_review_item_id || '',
    child_slice_id: `h4g_anchor_group_item_child_slice_${hashText(`${row.decision_id}|${sourceRow.anchor_review_item_id || index}`)}`,
    child_slice_index: index + 1,
    grade_band: sourceRow.grade_band || row.grade_band || '',
    review_grain: 'standard_code+grade_band+unit_evidence_id+anchor_review_item_id',
    source_decision_id: sourceRow.source_decision_id || '',
    standard_code: sourceRow.standard_context?.standard_code || row.standard_code || '',
    unit_evidence_id: sourceRow.unit_context?.unit_evidence_id || '',
    unit_title: sourceRow.unit_context?.unit_title || ''
  }))
}

function buildRows(recommendations, decisions, indexes, errors) {
  const decisionById = mapBy(decisions.item_review_decisions || [], 'decision_id', errors, 'decisions')
  const rows = []
  for (const recommendation of recommendations.item_review_recommendations || []) {
    const decision = decisionById.get(recommendation.decision_id)
    if (!decision) errors.push(`${recommendation.decision_id} recommendation decision_id not found in decisions`)
    const route = ROUTES[recommendation.recommended_reviewer_decision]
    if (!route) errors.push(`${recommendation.decision_id} unsupported recommended_reviewer_decision: ${recommendation.recommended_reviewer_decision}`)
    if (decision && !(decision.allowed_decisions || []).includes(recommendation.recommended_reviewer_decision)) {
      errors.push(`${recommendation.decision_id} recommendation is not allowed by decisions template`)
    }
    const sourceItem = sourceBatchItem(recommendation, decision || {}, indexes, errors)
    const sourceReviewRows = sourceRows(sourceItem)
    const simplifiedRows = sourceReviewRows.map(sourceRowSummary)
    const riskFlags = sorted(sourceReviewRows.flatMap(row => row.evidence_profile?.risk_flags || []))
    rows.push({
      action_type: route?.action_type || 'manual_review',
      action_work_item_id: `h4g_anchor_group_item_review_action_${hashText(`${recommendation.decision_id}|${recommendation.recommended_reviewer_decision}`)}`,
      allowed_decisions: recommendation.allowed_decisions || decision?.allowed_decisions || [],
      decision_id: recommendation.decision_id || '',
      decision_type: recommendation.decision_type || decision?.decision_type || '',
      grade_band: recommendation.grade_band || decision?.grade_band || '',
      item_review_surface: recommendation.item_review_surface || decision?.item_review_surface || '',
      missing_grade_bands: recommendation.missing_grade_bands || decision?.missing_grade_bands || [],
      priority_rank: recommendation.priority_rank,
      priority_tier: recommendation.priority_tier || '',
      progression_group_id: recommendation.progression_group_id || '',
      recommendation_confidence: recommendation.recommendation_confidence || '',
      recommendation_is_official_decision: false,
      recommendation_only: true,
      recommendation_reasons: recommendation.recommendation_reasons || [],
      recommended_reviewer_decision: recommendation.recommended_reviewer_decision || '',
      required_confirmations_to_close: decision ? requiredConfirmations(decision) : [],
      required_output: route?.required_output || 'manual review output',
      review_focus: decision?.review_focus || '',
      review_grain: decision?.review_grain || sourceItem.review_grain || '',
      review_questions: decision?.review_decision_template?.review_questions || sourceItem.review_decision_template?.review_questions || [],
      reviewer_gate: route?.reviewer_gate || '',
      reviewer_note: recommendation.reviewer_note || '',
      source_anchor_review_item_ids: decision?.source_anchor_review_item_ids || sorted(sourceReviewRows.map(row => row.anchor_review_item_id)),
      source_anchor_review_items: simplifiedRows,
      source_anchor_review_rows: recommendation.source_anchor_review_rows || 0,
      source_batch_item_id: recommendation.source_batch_item_id || '',
      source_batch_item_type: decision?.source_batch_item_type || '',
      source_existing_grade_bands: sourceItem.existing_grade_bands || [],
      source_review_risk_flags: riskFlags,
      standard_code: recommendation.standard_code || '',
      standard_context: standardSummary(decision?.standard_context || sourceItem.standard_context || sourceItem.source_standard_context),
      subject_slug: recommendation.subject_slug || '',
      suggested_child_slices: suggestedChildSlices(recommendation, sourceItem),
      target_missing_grade_standards: targetStandards(recommendation, sourceItem),
      unit_context_by_grade_band: sourceItem.unit_context_by_grade_band || {},
      unit_evidence_ids: sorted(simplifiedRows.map(row => row.unit_evidence_id)),
      unit_titles: sorted(simplifiedRows.map(row => row.unit_title)),
      work_queue: route?.queue || 'manual_review_queue',
      worklist_only: true,
      writes_public_data: false
    })
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_grade_band: {},
    by_priority_tier: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_subject: {},
    by_work_queue: {},
    item_review_action_work_items: rows.length,
    source_anchor_review_rows: 0,
    suggested_child_slices: 0,
    target_missing_grade_standards: 0
  }
  for (const row of rows) {
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    summary.suggested_child_slices += (row.suggested_child_slices || []).length
    summary.target_missing_grade_standards += (row.target_missing_grade_standards || []).length
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_work_queue, row.work_queue)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.work_queue)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.grade_band)} | ${row.source_anchor_review_rows} | ${markdownCell(row.recommended_reviewer_decision)} | ${truncate(compactList(row.unit_titles))} |`
  )).join('\n') || '| - | - | - | - | - | - | 0 | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Item Review Action Worklist

Generated at: ${payload.generated_at}

This worklist turns recommendation-only item-review rows into concrete review
queues. It does not update the editable decisions template, approve bridges,
write \`public/data\`, change official standard text, or enable matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| worklist only | ${payload.worklist_only} |
| item review action work items | ${payload.summary.item_review_action_work_items} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| suggested child slices | ${payload.summary.suggested_child_slices} |
| target missing grade standards | ${payload.summary.target_missing_grade_standards} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Queues

| queue | rows |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Preview

| rank | tier | queue | subject | standard | grade | source rows | recommendation | units |
| ---: | --- | --- | --- | --- | --- | ---: | --- | --- |
${previewRows(payload.item_review_action_work_items)}

## Guardrails

- Work items are not official decisions.
- Reviewer decisions still belong in the editable item review decisions template.
- Matcher and publication gates remain separate later steps.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['recommendations', args.recommendations],
    ['decisions', args.decisions],
    ['split batch', args.splitBatch],
    ['source evidence batch', args.sourceEvidenceBatch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const recommendations = errors.length ? { item_review_recommendations: [] } : readJson(args.recommendations)
  const decisions = errors.length ? { item_review_decisions: [] } : readJson(args.decisions)
  const splitBatch = errors.length ? { split_review_items: [] } : readJson(args.splitBatch)
  const sourceEvidenceBatch = errors.length ? { source_evidence_request_items: [] } : readJson(args.sourceEvidenceBatch)
  if (!errors.length) validateTopLevel(recommendations, decisions, splitBatch, sourceEvidenceBatch, args, errors)
  const indexes = {
    sourceEvidenceById: mapBy(sourceEvidenceBatch.source_evidence_request_items || [], 'source_evidence_request_item_id', errors, 'source evidence batch'),
    splitById: mapBy(splitBatch.split_review_items || [], 'split_review_item_id', errors, 'split batch')
  }
  const rows = buildRows(recommendations, decisions, indexes, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no item review action work items were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    item_review_action_work_items: rows,
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_action_worklist',
    source_anchor_group_item_review_decisions: args.decisions,
    source_anchor_group_item_review_recommendations: args.recommendations,
    source_anchor_group_source_evidence_batch: args.sourceEvidenceBatch,
    source_anchor_group_split_review_batch: args.splitBatch,
    summary: summarize(rows),
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
  const payload = buildPayload(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
