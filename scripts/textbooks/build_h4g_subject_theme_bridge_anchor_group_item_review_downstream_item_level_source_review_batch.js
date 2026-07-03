#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_batch_anchor_domain_rejected_english_pe.md'

const WORK_QUEUE = 'downstream_item_level_source_review_queue'
const RECOMMENDATION = 'accept_bounded_slice_for_item_level_source_review'
const REVIEW_GRAIN = 'standard_code+grade_band+unit_evidence_id+anchor_review_item_id'

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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_batch.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only downstream item-level source review batch from downstream
worklist rows routed to accept_bounded_slice_for_item_level_source_review. It
does not edit downstream decisions, approve bridges, write public/data, change
official standard text, or enable matcher/publication use.`)
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

function itemLevelReviewPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_decision_must_be_edited_separately: true,
    eligible_for_h4g_differentiation: false,
    item_level_source_review_batch_is_not_approval: true,
    item_level_source_review_is_later_gate_input: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function reviewDecisionTemplate(workItem, decision) {
  const confirmations = decision?.required_confirmations || {}
  return {
    allowed_review_outcomes: [
      'accept_bounded_slice_for_item_level_source_review',
      'needs_source_anchor_evidence',
      'reject_slice_as_overbroad'
    ],
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: {
      anchor_type_matches_target_domain: confirmations.anchor_type_matches_target_domain ?? false,
      child_slice_scope_is_single_source_row: confirmations.child_slice_scope_is_single_source_row ?? true,
      item_level_decision_still_required: confirmations.item_level_decision_still_required ?? true,
      no_public_write_requested: confirmations.no_public_write_requested ?? true,
      official_standard_text_preserved: confirmations.official_standard_text_preserved ?? true,
      same_grade_scope_checked: confirmations.same_grade_scope_checked ?? false,
      same_subject_scope_checked: confirmations.same_subject_scope_checked ?? false,
      source_item_reviewed: confirmations.source_item_reviewed ?? false
    },
    review_questions: uniqueStrings([
      workItem.review_focus || '',
      ...(workItem.review_questions || []),
      'What exact source-row evidence supports the target standard code?',
      'Does this single source row stay inside the same grade, same subject, and same unit grain?',
      'Should the downstream decision remain accepted for item-level source review, require more source-anchor evidence, or be rejected as overbroad?'
    ]),
    reviewer_note_template: 'Record whether this single source row is ready for the later item-level source review gate. Do not mark bridge, matcher, or publication approval here.'
  }
}

function sourceKey(workItem) {
  return [
    workItem.standard_code || workItem.target_standard_code || '',
    workItem.grade_band || '',
    workItem.source_context?.unit_context?.unit_evidence_id || '',
    ...(workItem.source_anchor_review_item_ids || [])
  ].join('|')
}

function buildRows(worklist, decisions, args, errors) {
  const decisionById = mapBy(decisions.downstream_decisions || [], 'decision_id', errors, 'decisions')
  const rows = []
  const seen = new Set()
  for (const workItem of selectedWorkItems(worklist, args)) {
    const decision = decisionById.get(workItem.decision_id)
    if (!decision) errors.push(`${workItem.downstream_action_work_item_id} decision_id not found in downstream decisions`)
    if (Number(workItem.source_anchor_review_rows || 0) !== 1) {
      errors.push(`${workItem.downstream_action_work_item_id} item-level source review row must have exactly one source_anchor_review_row`)
    }
    if (workItem.source_batch !== 'child_split') errors.push(`${workItem.downstream_action_work_item_id} source_batch must be child_split`)
    if (workItem.source_batch_item_type !== 'child_split_review_item') {
      errors.push(`${workItem.downstream_action_work_item_id} source_batch_item_type must be child_split_review_item`)
    }
    if (!(workItem.allowed_decisions || []).includes(RECOMMENDATION)) {
      errors.push(`${workItem.downstream_action_work_item_id} allowed_decisions must include ${RECOMMENDATION}`)
    }
    if (decision && !(decision.allowed_decisions || []).includes(RECOMMENDATION)) {
      errors.push(`${workItem.downstream_action_work_item_id} downstream decision allowed_decisions must include ${RECOMMENDATION}`)
    }
    const id = `h4g_anchor_group_downstream_item_level_source_review_${hashText(`${workItem.downstream_action_work_item_id}|${workItem.source_batch_item_id}`)}`
    if (seen.has(id)) errors.push(`duplicate item_level_source_review_item_id: ${id}`)
    seen.add(id)
    rows.push({
      anchor_requirement: workItem.source_context?.anchor_requirement || {},
      anchor_type: workItem.source_context?.anchor_requirement?.anchor_type || '',
      bridge_context: workItem.source_context?.bridge_context || {},
      decision_type: 'anchor_group_downstream_item_level_source_review',
      downstream_decision_id: workItem.decision_id || '',
      grade_band: workItem.grade_band || '',
      item_level_review_policy: itemLevelReviewPolicy(),
      item_level_source_review_item_id: id,
      item_review_surface: workItem.item_review_surface || '',
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
      source_anchor_review_item_ids: workItem.source_anchor_review_item_ids || [],
      source_anchor_review_rows: workItem.source_anchor_review_rows || 0,
      source_batch: workItem.source_batch || '',
      source_batch_item_id: workItem.source_batch_item_id || '',
      source_batch_item_type: workItem.source_batch_item_type || '',
      source_context: workItem.source_context || {},
      source_key: sourceKey(workItem),
      standard_code: workItem.standard_code || workItem.target_standard_code || '',
      standard_context: workItem.source_context?.standard_context || {},
      subject_slug: workItem.subject_slug || '',
      target_standard_code: workItem.target_standard_code || '',
      unit_context: workItem.source_context?.unit_context || {},
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
    by_page_range_status: {},
    by_priority_tier: {},
    by_risk_signal: {},
    by_source_batch: {},
    by_subject: {},
    item_level_source_review_items: rows.length,
    parent_downstream_work_items: sorted(rows.map(row => row.parent_downstream_action_work_item_id)).length,
    source_anchor_review_rows: 0,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_context?.unit_evidence_id)).length
  }
  for (const row of rows) {
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    countInto(summary.by_anchor_type, row.anchor_type)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_range_status, row.bridge_context?.page_range_status)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_subject, row.subject_slug)
    for (const flag of row.risk_signals || []) countInto(summary.by_risk_signal, flag)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.anchor_type)} | ${truncate(row.unit_context?.unit_title || '')} | ${truncate((row.risk_signals || []).join('; '))} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Item-Level Source Review Batch

Generated at: ${payload.generated_at}

This read-only batch expands downstream worklist rows routed to
\`${RECOMMENDATION}\`. Each row reviews one child-split source row at
\`${REVIEW_GRAIN}\` grain. It does not update downstream decisions, approve
bridges, write \`public/data\`, change official standard text, or enable
matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| worklist only | ${payload.worklist_only} |
| item-level source review items | ${payload.summary.item_level_source_review_items} |
| parent downstream work items | ${payload.summary.parent_downstream_work_items} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| unique source keys | ${payload.summary.unique_source_keys} |
| unique standard codes | ${payload.summary.unique_standard_codes} |
| unique unit evidence ids | ${payload.summary.unique_unit_evidence_ids} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Grade Bands

| grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Subjects

| subject | rows |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Anchor Types

| anchor type | rows |
| --- | ---: |
${countRows(payload.summary.by_anchor_type)}

## Preview

| rank | tier | subject | grade | standard | anchor | unit title | risk signals |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.item_level_source_review_items)}

## Guardrails

- Item-level source review rows are not official decisions.
- Reviewer outcomes still require the editable downstream decisions surface.
- Matcher and publication gates remain separate later steps.

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
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no item-level source review items were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_batch',
    selection: {
      max_rank: args.maxRank === Number.POSITIVE_INFINITY ? 'all' : args.maxRank,
      min_rank: args.minRank,
      recommendation: RECOMMENDATION,
      subjects: args.subjects || ['all'],
      work_queue: WORK_QUEUE
    },
    source_downstream_action_worklist: args.worklist,
    source_downstream_decisions: args.decisions,
    item_level_source_review_items: rows,
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
