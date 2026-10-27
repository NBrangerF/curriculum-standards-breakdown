#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SPLIT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_anchor_specificity_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_anchor_specificity_batch_anchor_domain_rejected_english_pe.md'

const WORK_QUEUE = 'source_anchor_specificity_queue'
const RECOMMENDATION = 'needs_source_anchor_evidence'
const REVIEW_GRAIN = 'standard_code+grade_band+anchor_review_item_id'

function parseArgs(argv) {
  const args = {
    maxRank: Number.POSITIVE_INFINITY,
    minRank: 1,
    out: DEFAULT_OUT,
    requireItems: false,
    splitBatch: DEFAULT_SPLIT_BATCH,
    strict: false,
    subjects: null,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--split-batch') args.splitBatch = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_source_anchor_specificity_batch.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json \\
  --split-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only specificity review batch for item-review work items that were
routed to needs_source_anchor_evidence. Each output row checks whether one
source-anchor review row supports the target anchor specifically, not just a
broad shared topic. It does not update editable decisions, approve bridges,
write public/data, change official standard text, or enable matcher use.`)
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

function basePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    item_level_decision_gate_required: true,
    matcher_ready: false,
    publication_ready: false,
    read_only_source_anchor_specificity_batch: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    source_anchor_specificity_review_is_not_approval: true,
    source_decision_must_be_edited_separately: true,
    writes_public_data: false
  }
}

function reviewDecisionTemplate(workItem, sourceRow) {
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
      anchor_type_matches_target_domain: false,
      item_level_decision_still_required: true,
      no_public_write_requested: true,
      official_standard_text_preserved: true,
      same_grade_scope_checked: false,
      same_subject_scope_checked: false,
      source_anchor_is_specific_not_topic_only: false,
      source_item_reviewed: false
    },
    review_questions: [
      workItem.review_focus || '',
      'What exact source behavior, skill, speech function, cultural objective, movement skill, or health behavior is visible in this unit?',
      'Does that evidence match the target standard code and anchor type, not just a broad topic tag?',
      `Does the source unit "${sourceRow.unit_context?.unit_title || ''}" provide same-grade, page-ready evidence for this standard?`,
      ...(workItem.review_questions || [])
    ].filter(Boolean),
    reviewer_note_template: 'Record whether this source row shows the exact anchor required by the target standard. Do not mark bridge approval here.'
  }
}

function validateArgs(args, errors) {
  if (!Number.isInteger(args.minRank) || args.minRank < 1) errors.push('--min-rank must be an integer >= 1')
  if (args.maxRank !== Number.POSITIVE_INFINITY && (!Number.isInteger(args.maxRank) || args.maxRank < 1)) {
    errors.push('--max-rank must be an integer >= 1')
  }
  if (args.minRank > args.maxRank) errors.push('--min-rank must be <= --max-rank')
}

function validateTopLevel(worklist, splitBatch, args, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_action_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_anchor_group_item_review_action_worklist')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  if (worklist.writes_public_data !== false) errors.push('worklist writes_public_data must be false')
  if (worklist.changes_official_standard_text !== false) errors.push('worklist changes_official_standard_text must be false')
  if (worklist.direct_matcher_use !== false) errors.push('worklist direct_matcher_use must be false')
  if (worklist.matcher_ready !== false) errors.push('worklist matcher_ready must be false')
  if (worklist.publication_ready !== false) errors.push('worklist publication_ready must be false')

  if (splitBatch.valid !== true) errors.push('split batch valid must be true')
  if (splitBatch.purpose !== 'h4g_subject_theme_bridge_anchor_group_split_review_batch') {
    errors.push('split batch purpose must be h4g_subject_theme_bridge_anchor_group_split_review_batch')
  }
  if (splitBatch.writes_public_data !== false) errors.push('split batch writes_public_data must be false')
  if (splitBatch.changes_official_standard_text !== false) errors.push('split batch changes_official_standard_text must be false')
  if (splitBatch.direct_matcher_use !== false) errors.push('split batch direct_matcher_use must be false')
  if (splitBatch.matcher_ready !== false) errors.push('split batch matcher_ready must be false')
  if (splitBatch.publication_ready !== false) errors.push('split batch publication_ready must be false')
  if (args.requireItems && !(worklist.item_review_action_work_items || []).length) {
    errors.push('requireItems is set but worklist has no item_review_action_work_items')
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

function selectedWorkItems(worklist, args) {
  const subjectSet = args.subjects ? new Set(args.subjects) : null
  return (worklist.item_review_action_work_items || [])
    .filter(item => item.work_queue === WORK_QUEUE)
    .filter(item => item.recommended_reviewer_decision === RECOMMENDATION)
    .filter(item => Number(item.priority_rank || 0) >= args.minRank)
    .filter(item => Number(item.priority_rank || 0) <= args.maxRank)
    .filter(item => !subjectSet || subjectSet.has(item.subject_slug || ''))
}

function sourceKey(row) {
  return [
    row.standard_context?.standard_code || '',
    row.grade_band || '',
    row.anchor_review_item_id || ''
  ].join('|')
}

function buildRows(worklist, splitBatch, args, errors) {
  const splitItemById = mapBy(splitBatch.split_review_items || [], 'split_review_item_id', errors, 'split batch')
  const rows = []
  const seen = new Set()
  for (const workItem of selectedWorkItems(worklist, args)) {
    const sourceSplitItem = splitItemById.get(workItem.source_batch_item_id)
    if (!sourceSplitItem) {
      errors.push(`${workItem.action_work_item_id} source split review item not found: ${workItem.source_batch_item_id}`)
      continue
    }
    const sourceRows = sourceSplitItem.source_anchor_review_items || []
    if (sourceRows.length !== 1) {
      errors.push(`${workItem.action_work_item_id} source specificity item must have exactly one source row`)
      continue
    }
    const sourceRow = sourceRows[0]
    const id = `h4g_anchor_group_source_anchor_specificity_${hashText(`${workItem.decision_id}|${sourceRow.anchor_review_item_id}`)}`
    if (seen.has(id)) errors.push(`duplicate source_anchor_specificity_review_item_id: ${id}`)
    seen.add(id)
    rows.push({
      action_family: sourceRow.action_family || '',
      anchor_requirement: sourceRow.anchor_requirement || {},
      anchor_type: sourceRow.anchor_requirement?.anchor_type || sourceRow.anchor_type || '',
      bridge_context: sourceRow.bridge_context || {},
      decision_type: 'anchor_group_source_anchor_specificity_review',
      grade_band: workItem.grade_band || sourceRow.grade_band || '',
      item_review_surface: 'anchor_group_source_anchor_specificity_review',
      parent_action_work_item_id: workItem.action_work_item_id || '',
      parent_decision_id: workItem.decision_id || '',
      parent_source_batch_item_id: workItem.source_batch_item_id || '',
      priority_rank: workItem.priority_rank,
      priority_tier: workItem.priority_tier || '',
      progression_group_id: workItem.progression_group_id || '',
      publication_policy: basePolicy(),
      recommendation_source: {
        parent_recommendation: workItem.recommended_reviewer_decision || '',
        parent_recommendation_confidence: workItem.recommendation_confidence || '',
        parent_recommendation_reasons: workItem.recommendation_reasons || []
      },
      review_decision_template: reviewDecisionTemplate(workItem, sourceRow),
      review_focus: workItem.review_focus || sourceSplitItem.review_focus || '',
      review_grain: REVIEW_GRAIN,
      reviewer_gate: 'Confirm exact source-anchor specificity; do not approve bridge or write official data here.',
      source_anchor_review_item: sourceRow,
      source_anchor_review_item_id: sourceRow.anchor_review_item_id || '',
      source_anchor_specificity_review_item_id: id,
      source_decision_id: sourceRow.source_decision_id || '',
      source_key: sourceKey(sourceRow),
      source_review_risk_flags: workItem.source_review_risk_flags || sourceRow.evidence_profile?.risk_flags || [],
      source_split_review_item_id: sourceSplitItem.split_review_item_id || '',
      standard_code: workItem.standard_code || sourceRow.standard_context?.standard_code || '',
      standard_context: sourceSplitItem.standard_context || workItem.standard_context || {},
      subject_slug: workItem.subject_slug || sourceRow.subject_slug || '',
      unit_context: sourceRow.unit_context || {},
      worklist_only: true,
      writes_public_data: false
    })
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_action_family: {},
    by_anchor_type: {},
    by_grade_band: {},
    by_page_range_status: {},
    by_priority_tier: {},
    by_risk_flag: {},
    by_subject: {},
    parent_work_items: sorted(rows.map(row => row.parent_action_work_item_id)).length,
    source_anchor_review_rows: rows.length,
    source_anchor_specificity_review_items: rows.length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length
  }
  for (const row of rows) {
    countInto(summary.by_action_family, row.action_family)
    countInto(summary.by_anchor_type, row.anchor_type)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_range_status, row.bridge_context?.page_range_status)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_subject, row.subject_slug)
    for (const flag of row.source_review_risk_flags || []) countInto(summary.by_risk_flag, flag)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.anchor_type)} | ${truncate((row.source_review_risk_flags || []).join('; '))} | ${truncate(row.unit_context?.unit_title || '')} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Source-Anchor Specificity Batch

Generated at: ${payload.generated_at}

This is a read-only specificity review batch for item-review rows recommended as
\`needs_source_anchor_evidence\`. Each row checks one source-anchor review item
at \`${REVIEW_GRAIN}\` grain. It does not update editable decisions, approve
bridges, write \`public/data\`, change official standard text, or enable
matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| worklist only | ${payload.worklist_only} |
| specificity review items | ${payload.summary.source_anchor_specificity_review_items} |
| parent work items | ${payload.summary.parent_work_items} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| unique source keys | ${payload.summary.unique_source_keys} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Grade Bands

| grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Top Risk Flags

| risk flag | rows |
| --- | ---: |
${countRows(payload.summary.by_risk_flag)}

## Preview

| rank | tier | subject | standard | grade | anchor | risk flags | unit title |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.source_anchor_specificity_review_items)}

## Guardrails

- Specificity rows are not official decisions.
- Reviewer outcomes still require a later editable decision surface.
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
    ['split batch', args.splitBatch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const worklist = errors.length ? { item_review_action_work_items: [] } : readJson(args.worklist)
  const splitBatch = errors.length ? { split_review_items: [] } : readJson(args.splitBatch)
  if (!errors.length) validateTopLevel(worklist, splitBatch, args, errors)
  const rows = buildRows(worklist, splitBatch, args, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no source anchor specificity review items were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_source_anchor_specificity_batch',
    selection: {
      max_rank: args.maxRank === Number.POSITIVE_INFINITY ? 'all' : args.maxRank,
      min_rank: args.minRank,
      parent_recommendation: RECOMMENDATION,
      subjects: args.subjects || ['all'],
      work_queue: WORK_QUEUE
    },
    source_anchor_group_item_review_action_worklist: args.worklist,
    source_anchor_group_split_review_batch: args.splitBatch,
    source_anchor_specificity_review_items: rows,
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
