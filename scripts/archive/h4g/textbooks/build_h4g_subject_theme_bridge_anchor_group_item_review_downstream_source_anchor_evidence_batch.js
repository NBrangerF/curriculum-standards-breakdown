#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.md'

const WORK_QUEUE = 'downstream_source_anchor_evidence_queue'
const RECOMMENDATION = 'needs_source_anchor_evidence'
const REVIEW_GRAIN = 'standard_code+grade_band+source_batch+source_batch_item_id'
const SOURCE_BATCH_TYPES = {
  child_split: 'child_split_review_item',
  source_anchor_specificity: 'source_anchor_specificity_review_item'
}

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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only downstream source-anchor evidence batch. It does not edit
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

function evidencePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_decision_must_be_edited_separately: true,
    eligible_for_h4g_differentiation: false,
    item_level_decision_gate_required: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_item_level_source_review: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    source_anchor_evidence_batch_is_not_approval: true,
    writes_public_data: false
  }
}

function reviewDecisionTemplate(workItem, decision) {
  const sourceTemplate = decision?.review_decision_template || {}
  const confirmations = decision?.required_confirmations || sourceTemplate.required_confirmations || {}
  const unitTitle = workItem.source_context?.unit_context?.unit_title || 'this source unit'
  return {
    allowed_review_outcomes: uniqueStrings([
      ...(sourceTemplate.allowed_review_outcomes || []),
      'accept_bounded_slice_for_item_level_source_review',
      'needs_source_anchor_evidence',
      'reject_slice_as_overbroad'
    ]),
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: {
      anchor_type_matches_target_domain: confirmations.anchor_type_matches_target_domain ?? false,
      child_slice_scope_is_single_source_row: confirmations.child_slice_scope_is_single_source_row,
      item_level_decision_still_required: confirmations.item_level_decision_still_required ?? true,
      no_public_write_requested: confirmations.no_public_write_requested ?? true,
      official_standard_text_preserved: confirmations.official_standard_text_preserved ?? true,
      same_grade_scope_checked: confirmations.same_grade_scope_checked ?? false,
      same_subject_scope_checked: confirmations.same_subject_scope_checked ?? false,
      source_anchor_is_specific_not_topic_only: confirmations.source_anchor_is_specific_not_topic_only,
      source_item_reviewed: confirmations.source_item_reviewed ?? false
    },
    review_questions: uniqueStrings([
      `What exact anchor evidence is visible in ${unitTitle}?`,
      'Does the evidence match the target standard code and anchor type, not just a broad topic tag?',
      'Is this row bounded to one same-grade, same-subject, page-ready source item?',
      ...(sourceTemplate.review_questions || []),
      ...(workItem.review_questions || [])
    ]),
    reviewer_note_template: sourceTemplate.reviewer_note_template || 'Record whether this source row shows the exact anchor required by the target standard. Do not mark bridge approval here.'
  }
}

function cleanTemplate(template) {
  const confirmations = template.required_confirmations || {}
  const cleanedConfirmations = Object.fromEntries(Object.entries(confirmations).filter(([, value]) => value !== undefined))
  return {
    ...template,
    required_confirmations: cleanedConfirmations
  }
}

function sourceKey(workItem) {
  return [
    workItem.standard_code || '',
    workItem.grade_band || '',
    workItem.source_batch || '',
    workItem.source_batch_item_id || ''
  ].join('|')
}

function validateWorkItem(workItem, decision, errors) {
  const id = workItem.downstream_action_work_item_id || '(missing downstream_action_work_item_id)'
  if (!decision) errors.push(`${id} decision_id not found in downstream decisions`)
  const expectedType = SOURCE_BATCH_TYPES[workItem.source_batch]
  if (!expectedType) errors.push(`${id} source_batch must be one of ${Object.keys(SOURCE_BATCH_TYPES).join(', ')}`)
  if (expectedType && workItem.source_batch_item_type !== expectedType) {
    errors.push(`${id} source_batch_item_type must be ${expectedType}`)
  }
  if (!(workItem.allowed_decisions || []).includes(RECOMMENDATION)) errors.push(`${id} allowed_decisions must include ${RECOMMENDATION}`)
  if (decision && !(decision.allowed_decisions || []).includes(RECOMMENDATION)) {
    errors.push(`${id} downstream decision allowed_decisions must include ${RECOMMENDATION}`)
  }
  if (Number(workItem.source_anchor_review_rows || 0) !== 1) {
    errors.push(`${id} source_anchor_review_rows must be 1 for source-anchor evidence batch`)
  }
  for (const confirmation of ['anchor_type_matches_target_domain', 'same_grade_scope_checked', 'same_subject_scope_checked', 'source_item_reviewed']) {
    if (!(workItem.required_confirmations_to_close || []).includes(confirmation)) {
      errors.push(`${id} required_confirmations_to_close must include ${confirmation}`)
    }
  }
  if (workItem.source_batch === 'source_anchor_specificity' && !(workItem.required_confirmations_to_close || []).includes('source_anchor_is_specific_not_topic_only')) {
    errors.push(`${id} source_anchor_specificity rows must require source_anchor_is_specific_not_topic_only`)
  }
}

function buildRows(worklist, decisions, args, errors) {
  const decisionById = mapBy(decisions.downstream_decisions || [], 'decision_id', errors, 'decisions')
  const rows = []
  const seen = new Set()
  for (const workItem of selectedWorkItems(worklist, args)) {
    const decision = decisionById.get(workItem.decision_id)
    validateWorkItem(workItem, decision, errors)
    const sourceContext = workItem.source_context || {}
    const unitContext = sourceContext.unit_context || {}
    const bridgeContext = sourceContext.bridge_context || {}
    const anchorRequirement = sourceContext.anchor_requirement || {}
    const id = `h4g_anchor_group_downstream_source_anchor_evidence_${hashText(sourceKey(workItem))}`
    if (seen.has(id)) errors.push(`duplicate source_anchor_evidence_item_id: ${id}`)
    seen.add(id)
    rows.push({
      anchor_requirement: anchorRequirement,
      anchor_type: decision?.anchor_type || anchorRequirement.anchor_type || '',
      bridge_context: bridgeContext,
      decision_type: 'anchor_group_downstream_source_anchor_evidence',
      downstream_decision_id: workItem.decision_id || '',
      grade_band: workItem.grade_band || '',
      item_review_surface: workItem.item_review_surface || decision?.item_review_surface || '',
      page_range: bridgeContext.page_range || '',
      page_range_status: bridgeContext.page_range_status || '',
      page_ready: bridgeContext.page_ready ?? false,
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
      review_decision_template: cleanTemplate(reviewDecisionTemplate(workItem, decision)),
      review_focus: workItem.review_focus || '',
      review_grain: REVIEW_GRAIN,
      review_questions: uniqueStrings(workItem.review_questions || []),
      reviewer_gate: workItem.reviewer_gate || '',
      reviewer_note: workItem.reviewer_note || '',
      risk_signals: workItem.risk_signals || [],
      source_anchor_evidence_item_id: id,
      source_anchor_evidence_policy: evidencePolicy(),
      source_anchor_review_item_ids: decision?.source_anchor_review_item_ids || [],
      source_anchor_review_rows: workItem.source_anchor_review_rows || 0,
      source_batch: workItem.source_batch || '',
      source_batch_item_id: workItem.source_batch_item_id || '',
      source_batch_item_type: workItem.source_batch_item_type || '',
      source_context: sourceContext,
      source_key: sourceKey(workItem),
      standard_code: workItem.standard_code || '',
      standard_context: sourceContext.standard_context || {},
      subject_slug: workItem.subject_slug || '',
      target_standard_code: workItem.target_standard_code || '',
      textbook_evidence_id: unitContext.textbook_evidence_id || '',
      unit_context: unitContext,
      unit_evidence_id: unitContext.unit_evidence_id || '',
      unit_title: unitContext.unit_title || '',
      worklist_only: true,
      writes_public_data: false
    })
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_anchor_type: {},
    by_grade_band: {},
    by_priority_tier: {},
    by_source_batch: {},
    by_source_batch_item_type: {},
    by_subject: {},
    by_target_standard_present: {},
    parent_downstream_work_items: sorted(rows.map(row => row.parent_downstream_action_work_item_id)).length,
    source_anchor_evidence_items: rows.length,
    source_anchor_review_rows: 0,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    countInto(summary.by_anchor_type, row.anchor_type)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_source_batch_item_type, row.source_batch_item_type)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_present, row.target_standard_code ? 'present' : 'empty')
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.source_batch)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.unit_evidence_id)} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Evidence Batch

Generated at: ${payload.generated_at}

This read-only batch expands downstream worklist rows routed to
\`${RECOMMENDATION}\`. Each row reviews one bounded source item at
\`${REVIEW_GRAIN}\` grain. It does not update downstream decisions, write
\`public/data\`, approve bridges, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| worklist only | ${payload.worklist_only} |
| source-anchor evidence items | ${payload.summary.source_anchor_evidence_items} |
| parent downstream work items | ${payload.summary.parent_downstream_work_items} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| unique progression groups | ${payload.summary.unique_progression_groups} |
| unique standard codes | ${payload.summary.unique_standard_codes} |
| unique source keys | ${payload.summary.unique_source_keys} |
| unique unit evidence ids | ${payload.summary.unique_unit_evidence_ids} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Grade Bands

| grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Source Batches

| source batch | rows |
| --- | ---: |
${countRows(payload.summary.by_source_batch)}

## Subjects

| subject | rows |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Preview

| rank | tier | subject | grade | source batch | standard | unit evidence | unit title |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.source_anchor_evidence_items)}

## Guardrails

- Source-anchor evidence rows are not official decisions.
- Reviewer outcomes still require the editable downstream decisions surface.
- Item-level source review, matcher, and publication gates remain separate later steps.

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
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no source-anchor evidence items were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch',
    selection: {
      max_rank: args.maxRank === Number.POSITIVE_INFINITY ? 'all' : args.maxRank,
      min_rank: args.minRank,
      recommendation: RECOMMENDATION,
      subjects: args.subjects || ['all'],
      work_queue: WORK_QUEUE
    },
    source_anchor_evidence_items: rows,
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
