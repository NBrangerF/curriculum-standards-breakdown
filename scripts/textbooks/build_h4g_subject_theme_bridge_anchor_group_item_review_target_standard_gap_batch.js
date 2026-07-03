#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_EVIDENCE_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_standard_gap_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_standard_gap_batch_anchor_domain_rejected_english_pe.md'

const WORK_QUEUE = 'target_standard_gap_queue'
const RECOMMENDATION = 'target_missing_grade_standard_absent'
const REVIEW_GRAIN = 'progression_group+missing_grade_band+source_standard_code'

function parseArgs(argv) {
  const args = {
    maxRank: Number.POSITIVE_INFINITY,
    minRank: 1,
    out: DEFAULT_OUT,
    requireItems: false,
    sourceEvidenceBatch: DEFAULT_SOURCE_EVIDENCE_BATCH,
    strict: false,
    subjects: null,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--source-evidence-batch') args.sourceEvidenceBatch = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_target_standard_gap_batch.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json \\
  --source-evidence-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only target-standard gap review batch for item-review work items
routed to target_missing_grade_standard_absent. Each output row is one missing
grade band with no target public standard in the same progression group. It does
not update public standards, approve bridges, write public/data, or enable
matcher use.`)
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
    read_only_target_standard_gap_batch: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    source_decision_must_be_edited_separately: true,
    target_standard_gap_review_is_not_approval: true,
    writes_public_data: false
  }
}

function reviewDecisionTemplate(workItem, sourceItem, missingGradeBand) {
  return {
    allowed_review_outcomes: [
      'target_standard_gap_confirmed',
      'target_standard_exists_elsewhere',
      'progression_group_scope_needs_revision',
      'missing_grade_not_applicable'
    ],
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: {
      item_level_decision_still_required: true,
      no_public_write_requested: true,
      official_standard_text_preserved: true,
      progression_group_scope_checked: false,
      source_anchor_evidence_search_deferred: true,
      target_missing_grade_standard_absent_checked: false
    },
    review_questions: [
      `Does ${missingGradeBand} have a public target standard for this progression group under another code or grouping?`,
      'If not, should the progression group be split/re-scoped before source evidence search?',
      'If the missing grade is not applicable, what curriculum rationale supports that status?',
      ...(sourceItem.review_decision_template?.review_questions || []),
      ...(workItem.review_questions || [])
    ].filter(Boolean),
    reviewer_note_template: 'Record whether the target-standard gap is confirmed, found elsewhere, out of scope, or requires progression-group revision. Do not edit public standards here.'
  }
}

function validateArgs(args, errors) {
  if (!Number.isInteger(args.minRank) || args.minRank < 1) errors.push('--min-rank must be an integer >= 1')
  if (args.maxRank !== Number.POSITIVE_INFINITY && (!Number.isInteger(args.maxRank) || args.maxRank < 1)) {
    errors.push('--max-rank must be an integer >= 1')
  }
  if (args.minRank > args.maxRank) errors.push('--min-rank must be <= --max-rank')
}

function validateTopLevel(worklist, sourceEvidenceBatch, args, errors) {
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

  if (sourceEvidenceBatch.valid !== true) errors.push('source evidence batch valid must be true')
  if (sourceEvidenceBatch.purpose !== 'h4g_subject_theme_bridge_anchor_group_source_evidence_batch') {
    errors.push('source evidence batch purpose must be h4g_subject_theme_bridge_anchor_group_source_evidence_batch')
  }
  if (sourceEvidenceBatch.writes_public_data !== false) errors.push('source evidence batch writes_public_data must be false')
  if (sourceEvidenceBatch.changes_official_standard_text !== false) errors.push('source evidence batch changes_official_standard_text must be false')
  if (sourceEvidenceBatch.direct_matcher_use !== false) errors.push('source evidence batch direct_matcher_use must be false')
  if (sourceEvidenceBatch.matcher_ready !== false) errors.push('source evidence batch matcher_ready must be false')
  if (sourceEvidenceBatch.publication_ready !== false) errors.push('source evidence batch publication_ready must be false')
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

function buildRows(worklist, sourceEvidenceBatch, args, errors) {
  const sourceEvidenceById = mapBy(sourceEvidenceBatch.source_evidence_request_items || [], 'source_evidence_request_item_id', errors, 'source evidence batch')
  const rows = []
  const seen = new Set()
  for (const workItem of selectedWorkItems(worklist, args)) {
    const sourceItem = sourceEvidenceById.get(workItem.source_batch_item_id)
    if (!sourceItem) {
      errors.push(`${workItem.action_work_item_id} source evidence request item not found: ${workItem.source_batch_item_id}`)
      continue
    }
    const missingTargetGrades = sourceItem.missing_target_standard_grade_bands || workItem.missing_grade_bands || []
    if (!missingTargetGrades.length) errors.push(`${workItem.action_work_item_id} missing target standard gap grade bands`)
    for (const missingGradeBand of missingTargetGrades) {
      const id = `h4g_anchor_group_target_standard_gap_${hashText(`${workItem.decision_id}|${missingGradeBand}`)}`
      if (seen.has(id)) errors.push(`duplicate target_standard_gap_item_id: ${id}`)
      seen.add(id)
      rows.push({
        anchor_type: sourceItem.anchor_type || '',
        existing_grade_bands: sourceItem.existing_grade_bands || workItem.source_existing_grade_bands || [],
        existing_source_anchor_review_items: sourceItem.source_anchor_review_items || [],
        existing_unit_context_by_grade_band: sourceItem.unit_context_by_grade_band || workItem.unit_context_by_grade_band || {},
        item_review_surface: 'anchor_group_target_standard_gap_review',
        missing_grade_band: missingGradeBand,
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
        review_decision_template: reviewDecisionTemplate(workItem, sourceItem, missingGradeBand),
        review_grain: REVIEW_GRAIN,
        reviewer_gate: 'Resolve the target public standard gap before same-grade source-anchor evidence search.',
        source_anchor_evidence_request_item_id: sourceItem.source_evidence_request_item_id || '',
        source_standard_code: workItem.standard_code || sourceItem.standard_code || '',
        source_standard_context: sourceItem.source_standard_context || workItem.standard_context || {},
        subject_slug: workItem.subject_slug || sourceItem.subject_slug || '',
        target_standard_gap_item_id: id,
        worklist_only: true,
        writes_public_data: false
      })
    }
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_anchor_type: {},
    by_existing_grade_band: {},
    by_missing_grade_band: {},
    by_priority_tier: {},
    by_subject: {},
    existing_source_anchor_review_rows: 0,
    parent_work_items: sorted(rows.map(row => row.parent_action_work_item_id)).length,
    target_standard_gap_items: rows.length
  }
  for (const row of rows) {
    summary.existing_source_anchor_review_rows += (row.existing_source_anchor_review_items || []).length
    countInto(summary.by_anchor_type, row.anchor_type)
    countInto(summary.by_missing_grade_band, row.missing_grade_band)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_subject, row.subject_slug)
    for (const gradeBand of row.existing_grade_bands || []) countInto(summary.by_existing_grade_band, gradeBand)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.progression_group_id)} | ${markdownCell(row.source_standard_code)} | ${markdownCell(row.missing_grade_band)} | ${markdownCell(row.anchor_type)} | ${truncate(Object.values(row.existing_unit_context_by_grade_band || {}).flat().join('; '))} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Target-Standard Gap Review Batch

Generated at: ${payload.generated_at}

This is a read-only review batch for item-review rows recommended as
\`target_missing_grade_standard_absent\`. Each row targets one missing grade band
where no public target standard was found in the same progression group. It does
not edit public standards, approve bridges, write \`public/data\`, or enable
matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| worklist only | ${payload.worklist_only} |
| target-standard gap items | ${payload.summary.target_standard_gap_items} |
| parent work items | ${payload.summary.parent_work_items} |
| existing source anchor rows | ${payload.summary.existing_source_anchor_review_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Missing Grade Bands

| grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_missing_grade_band)}

## Preview

| rank | tier | subject | progression group | source standard | missing grade | anchor | existing units |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.target_standard_gap_items)}

## Guardrails

- Gap rows are not official decisions.
- Public standard edits require a separate reviewed data change.
- Source-anchor evidence search is deferred until the target-standard gap is resolved.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  validateArgs(args, errors)
  for (const [label, path] of [
    ['worklist', args.worklist],
    ['source evidence batch', args.sourceEvidenceBatch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const worklist = errors.length ? { item_review_action_work_items: [] } : readJson(args.worklist)
  const sourceEvidenceBatch = errors.length ? { source_evidence_request_items: [] } : readJson(args.sourceEvidenceBatch)
  if (!errors.length) validateTopLevel(worklist, sourceEvidenceBatch, args, errors)
  const rows = buildRows(worklist, sourceEvidenceBatch, args, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no target-standard gap items were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_target_standard_gap_batch',
    selection: {
      max_rank: args.maxRank === Number.POSITIVE_INFINITY ? 'all' : args.maxRank,
      min_rank: args.minRank,
      parent_recommendation: RECOMMENDATION,
      subjects: args.subjects || ['all'],
      work_queue: WORK_QUEUE
    },
    source_anchor_group_item_review_action_worklist: args.worklist,
    source_anchor_group_source_evidence_batch: args.sourceEvidenceBatch,
    summary: summarize(rows),
    target_standard_gap_items: rows,
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
