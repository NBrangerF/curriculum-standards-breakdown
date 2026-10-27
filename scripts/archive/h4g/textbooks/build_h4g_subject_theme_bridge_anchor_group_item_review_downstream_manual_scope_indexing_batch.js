#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe.md'

const WORK_QUEUE = 'downstream_manual_scope_indexing_queue'
const RECOMMENDATION = 'target_standard_requires_manual_scope_review'
const REVIEW_GRAIN = 'progression_group+target_grade_band+target_standard_code+source_batch_item_id'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    maxRank: Number.POSITIVE_INFINITY,
    minRank: 1,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    subjects: null,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = parseList(argv[++i])
    else if (item === '--min-rank') args.minRank = Number(argv[++i])
    else if (item === '--max-rank') args.maxRank = Number(argv[++i])
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only downstream manual scope/indexing batch. It does not edit
downstream decisions, write public/data, approve bridges, or enable
matcher/publication use.`)
}

function parseList(value) {
  const rows = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  if (!rows.length || rows.includes('all')) return null
  return rows
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

function validateArgs(args, errors) {
  if (!Number.isInteger(args.minRank) || args.minRank < 1) errors.push('--min-rank must be an integer >= 1')
  if (args.maxRank !== Number.POSITIVE_INFINITY && (!Number.isInteger(args.maxRank) || args.maxRank < 1)) {
    errors.push('--max-rank must be an integer >= 1')
  }
  if (args.minRank > args.maxRank) errors.push('--min-rank must be <= --max-rank')
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

function validateTopLevel(worklist, decisions, args, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_worklist')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  if (worklist.source_downstream_decisions !== args.decisions) {
    errors.push('worklist source_downstream_decisions must match --decisions')
  }
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template')
  }
  validatePolicy('worklist', worklist, errors)
  validatePolicy('decisions', decisions, errors)
}

function selectedWorkItems(worklist, args) {
  const subjectSet = args.subjects ? new Set(args.subjects) : null
  return (worklist.downstream_action_work_items || [])
    .filter(item => item.work_queue === WORK_QUEUE)
    .filter(item => item.recommended_reviewer_decision === RECOMMENDATION)
    .filter(item => Number(item.priority_rank || 0) >= args.minRank)
    .filter(item => Number(item.priority_rank || 0) <= args.maxRank)
    .filter(item => !subjectSet || subjectSet.has(item.subject_slug || ''))
}

function indexingPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_decision_must_be_edited_separately: true,
    eligible_for_h4g_differentiation: false,
    item_level_decision_gate_required: true,
    manual_scope_indexing_batch_is_not_approval: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    requires_later_source_anchor_review: true,
    writes_public_data: false
  }
}

function reviewDecisionTemplate(workItem, decision) {
  const sourceTemplate = decision?.review_decision_template || {}
  const confirmations = decision?.required_confirmations || sourceTemplate.required_confirmations || {}
  const targetStandardCode = workItem.target_standard_code || workItem.standard_code || ''
  return {
    allowed_review_outcomes: uniqueStrings([
      ...(sourceTemplate.allowed_review_outcomes || []),
      'missing_grade_units_indexed_for_later_source_review',
      'missing_grade_units_not_found',
      'target_standard_requires_manual_scope_review'
    ]),
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: {
      item_level_decision_still_required: confirmations.item_level_decision_still_required ?? true,
      missing_grade_textbook_units_indexed: confirmations.missing_grade_textbook_units_indexed ?? false,
      no_public_write_requested: confirmations.no_public_write_requested ?? true,
      official_standard_text_preserved: confirmations.official_standard_text_preserved ?? true,
      same_grade_scope_checked: confirmations.same_grade_scope_checked ?? false,
      source_anchor_specificity_still_required: confirmations.source_anchor_specificity_still_required ?? true,
      target_missing_grade_standard_checked: confirmations.target_missing_grade_standard_checked ?? true
    },
    required_evidence: uniqueStrings([
      ...(sourceTemplate.required_evidence || []),
      'same-grade textbook unit candidates tied to the target standard',
      'bounded unit/page evidence for later source-anchor review'
    ]),
    review_questions: uniqueStrings([
      `Find same-grade textbook unit candidates for ${targetStandardCode}.`,
      'Do candidate units show the exact target anchor requirement, not only a related topic?',
      'Are candidate units same-grade, same-subject, and page-ready enough for later source-anchor review?',
      ...(sourceTemplate.review_questions || []),
      ...(workItem.review_questions || [])
    ]),
    reviewer_note_template: sourceTemplate.reviewer_note_template || 'Record target-standard scope and same-grade textbook unit candidates. Do not mark bridge approval here.'
  }
}

function sourceKey(workItem) {
  return [
    workItem.progression_group_id || '',
    workItem.grade_band || '',
    workItem.target_standard_code || workItem.standard_code || '',
    workItem.source_batch_item_id || ''
  ].join('|')
}

function validateWorkItem(workItem, decision, errors) {
  const id = workItem.downstream_action_work_item_id || '(missing downstream_action_work_item_id)'
  const targetStandardCode = workItem.target_standard_code || workItem.standard_code || ''
  if (!decision) errors.push(`${id} decision_id not found in downstream decisions`)
  if (workItem.source_batch !== 'missing_grade_unit_indexing') errors.push(`${id} source_batch must be missing_grade_unit_indexing`)
  if (workItem.source_batch_item_type !== 'missing_grade_unit_indexing_item') {
    errors.push(`${id} source_batch_item_type must be missing_grade_unit_indexing_item`)
  }
  if (!(workItem.allowed_decisions || []).includes(RECOMMENDATION)) errors.push(`${id} allowed_decisions must include ${RECOMMENDATION}`)
  if (decision && !(decision.allowed_decisions || []).includes(RECOMMENDATION)) {
    errors.push(`${id} downstream decision allowed_decisions must include ${RECOMMENDATION}`)
  }
  if (!targetStandardCode) errors.push(`${id} target_standard_code must be present for manual scope/indexing`)
  if (targetStandardCode && workItem.standard_code && targetStandardCode !== workItem.standard_code) {
    errors.push(`${id} target_standard_code must match standard_code for manual scope/indexing`)
  }
  if (workItem.source_context?.target_standard_context?.code && workItem.source_context.target_standard_context.code !== targetStandardCode) {
    errors.push(`${id} source_context.target_standard_context.code must match target_standard_code`)
  }
  for (const confirmation of ['missing_grade_textbook_units_indexed', 'same_grade_scope_checked']) {
    if (!(workItem.required_confirmations_to_close || []).includes(confirmation)) {
      errors.push(`${id} required_confirmations_to_close must include ${confirmation}`)
    }
  }
}

function buildRows(worklist, decisions, args, errors) {
  const decisionById = mapBy(decisions.downstream_decisions || [], 'decision_id', errors, 'decisions')
  const rows = []
  const seen = new Set()
  for (const workItem of selectedWorkItems(worklist, args)) {
    const decision = decisionById.get(workItem.decision_id)
    validateWorkItem(workItem, decision, errors)
    const targetStandardCode = workItem.target_standard_code || workItem.standard_code || ''
    const id = `h4g_anchor_group_downstream_manual_scope_indexing_${hashText(`${workItem.downstream_action_work_item_id}|${workItem.grade_band}|${targetStandardCode}`)}`
    if (seen.has(id)) errors.push(`duplicate manual_scope_indexing_item_id: ${id}`)
    seen.add(id)
    rows.push({
      anchor_type: decision?.anchor_type || '',
      decision_type: 'anchor_group_downstream_manual_scope_indexing',
      downstream_decision_id: workItem.decision_id || '',
      existing_grade_bands: workItem.source_context?.existing_grade_bands || [],
      existing_unit_context_by_grade_band: workItem.source_context?.existing_unit_context_by_grade_band || {},
      grade_band: workItem.grade_band || '',
      item_review_surface: workItem.item_review_surface || decision?.item_review_surface || '',
      manual_scope_indexing_item_id: id,
      manual_scope_indexing_policy: indexingPolicy(),
      parent_action_work_item_id: workItem.parent_action_work_item_id || '',
      parent_decision_id: workItem.parent_decision_id || '',
      parent_downstream_action_work_item_id: workItem.downstream_action_work_item_id || '',
      parent_source_batch_item_id: workItem.parent_source_batch_item_id || '',
      priority_rank: workItem.priority_rank,
      priority_tier: workItem.priority_tier || '',
      progression_group_id: workItem.progression_group_id || '',
      recommendation_confidence: workItem.recommendation_confidence || '',
      recommendation_reasons: workItem.recommendation_reasons || [],
      recommended_next_gate: workItem.recommended_next_gate || '',
      recommended_reviewer_decision: workItem.recommended_reviewer_decision || '',
      required_confirmations_to_close: workItem.required_confirmations_to_close || [],
      required_output: workItem.required_output || '',
      review_decision_template: reviewDecisionTemplate(workItem, decision),
      review_focus: workItem.review_focus || '',
      review_grain: REVIEW_GRAIN,
      review_questions: uniqueStrings(workItem.review_questions || []),
      reviewer_gate: workItem.reviewer_gate || '',
      reviewer_note: workItem.reviewer_note || '',
      risk_signals: workItem.risk_signals || [],
      source_anchor_review_item_ids: decision?.source_anchor_review_item_ids || [],
      source_anchor_review_rows: workItem.source_anchor_review_rows || 0,
      source_batch: workItem.source_batch || '',
      source_batch_item_id: workItem.source_batch_item_id || '',
      source_batch_item_type: workItem.source_batch_item_type || '',
      source_context: workItem.source_context || {},
      source_key: sourceKey(workItem),
      source_standard_code: workItem.source_standard_code || decision?.source_standard_code || workItem.source_context?.source_standard_context?.code || '',
      standard_code: workItem.standard_code || '',
      subject_slug: workItem.subject_slug || '',
      target_grade_band: workItem.grade_band || '',
      target_standard_code: targetStandardCode,
      target_standard_context: workItem.source_context?.target_standard_context || {},
      unit_indexing_request: {
        existing_grade_bands: workItem.source_context?.existing_grade_bands || [],
        existing_unit_context_by_grade_band: workItem.source_context?.existing_unit_context_by_grade_band || {},
        required_confirmations_to_close: workItem.required_confirmations_to_close || [],
        required_output: workItem.required_output || '',
        target_grade_band: workItem.grade_band || '',
        target_standard_code: targetStandardCode
      },
      worklist_only: true,
      writes_public_data: false
    })
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_existing_grade_band: {},
    by_priority_tier: {},
    by_source_batch: {},
    by_source_standard_code: {},
    by_subject: {},
    by_target_grade_band: {},
    by_target_standard_code: {},
    manual_scope_indexing_items: rows.length,
    parent_downstream_work_items: sorted(rows.map(row => row.parent_downstream_action_work_item_id)).length,
    source_anchor_review_rows: 0,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_target_standard_codes: sorted(rows.map(row => row.target_standard_code)).length
  }
  for (const row of rows) {
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_source_standard_code, row.source_standard_code)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_grade_band, row.target_grade_band)
    countInto(summary.by_target_standard_code, row.target_standard_code)
    for (const gradeBand of row.existing_grade_bands || []) countInto(summary.by_existing_grade_band, gradeBand)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.target_grade_band)} | ${markdownCell(row.target_standard_code)} | ${markdownCell(row.progression_group_id)} | ${row.source_anchor_review_rows} | ${truncate((row.existing_grade_bands || []).join(', '))} |`
  )).join('\n') || '| - | - | - | - | - | - | 0 | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Manual Scope/Indexing Batch

Generated at: ${payload.generated_at}

This read-only batch expands downstream worklist rows routed to
\`${RECOMMENDATION}\`. Each row resolves target-standard scope and same-grade
textbook unit indexing at \`${REVIEW_GRAIN}\` grain. It does not update
downstream decisions, write \`public/data\`, approve bridges, or enable
matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| worklist only | ${payload.worklist_only} |
| manual scope/indexing items | ${payload.summary.manual_scope_indexing_items} |
| parent downstream work items | ${payload.summary.parent_downstream_work_items} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| unique progression groups | ${payload.summary.unique_progression_groups} |
| unique target standard codes | ${payload.summary.unique_target_standard_codes} |
| unique source keys | ${payload.summary.unique_source_keys} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Target Grade Bands

| target grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_target_grade_band)}

## Target Standards

| target standard code | rows |
| --- | ---: |
${countRows(payload.summary.by_target_standard_code)}

## Existing Grade Bands

| existing grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_existing_grade_band)}

## Preview

| rank | tier | subject | target grade | target standard | progression group | source rows | existing grades |
| ---: | --- | --- | --- | --- | --- | ---: | --- |
${previewRows(payload.manual_scope_indexing_items)}

## Guardrails

- Manual scope/indexing rows are not official decisions.
- Reviewer outcomes still require the editable downstream decisions surface.
- Source-anchor evidence, matcher, and publication gates remain separate later steps.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  validateArgs(args, errors)
  for (const [label, path] of [
    ['worklist', args.worklist],
    ['decisions', args.decisions]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const worklist = errors.length ? { downstream_action_work_items: [] } : readJson(args.worklist)
  const decisions = errors.length ? { downstream_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(worklist, decisions, args, errors)
  const rows = buildRows(worklist, decisions, args, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no manual scope/indexing items were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    manual_scope_indexing_items: rows,
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch',
    selection: {
      max_rank: args.maxRank === Number.POSITIVE_INFINITY ? 'all' : args.maxRank,
      min_rank: args.minRank,
      recommendation: RECOMMENDATION,
      subjects: args.subjects || ['all'],
      work_queue: WORK_QUEUE
    },
    source_downstream_action_worklist: args.worklist,
    source_downstream_decisions: args.decisions,
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
