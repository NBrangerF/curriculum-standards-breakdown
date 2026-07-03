#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_EVIDENCE_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch_anchor_domain_rejected_english_pe.md'

const WORK_QUEUE = 'missing_grade_textbook_unit_indexing_queue'
const RECOMMENDATION = 'needs_textbook_unit_indexing'
const REVIEW_GRAIN = 'progression_group+anchor_type+target_missing_grade_band+target_standard_code'

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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json \\
  --source-evidence-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only missing-grade textbook unit indexing batch for item-review
work items routed to needs_textbook_unit_indexing. Each output row is one target
missing-grade standard that needs same-grade textbook unit candidates. It does
not update editable decisions, approve bridges, write public/data, change
official standard text, or enable matcher use.`)
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
    missing_grade_unit_indexing_is_not_approval: true,
    publication_ready: false,
    read_only_missing_grade_unit_indexing_batch: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    source_decision_must_be_edited_separately: true,
    writes_public_data: false
  }
}

function reviewDecisionTemplate(workItem, sourceItem, targetStandard) {
  return {
    allowed_review_outcomes: [
      'missing_grade_units_indexed_for_later_source_review',
      'missing_grade_units_not_found',
      'target_standard_requires_manual_scope_review'
    ],
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: {
      item_level_decision_still_required: true,
      missing_grade_textbook_units_indexed: false,
      no_public_write_requested: true,
      official_standard_text_preserved: true,
      same_grade_scope_checked: false,
      source_anchor_specificity_still_required: true,
      target_missing_grade_standard_checked: true
    },
    required_evidence: sourceItem.review_decision_template?.required_evidence || [],
    review_questions: [
      `Find same-grade textbook unit candidates for ${targetStandard.code || targetStandard.id || ''}.`,
      'Do candidate units show the exact target anchor requirement, not only a related topic?',
      'Are candidate units same-grade, same-subject, and page-ready enough for later source-anchor review?',
      ...(sourceItem.review_decision_template?.review_questions || []),
      ...(workItem.review_questions || [])
    ].filter(Boolean),
    reviewer_note_template: 'Record missing-grade textbook unit candidates or explain why none were found. Do not mark bridge approval here.'
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

function standardSummary(standard) {
  return {
    code: standard.code || standard.id || '',
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
    const targetStandards = workItem.target_missing_grade_standards || []
    if (!targetStandards.length) errors.push(`${workItem.action_work_item_id} missing target_missing_grade_standards`)
    for (const targetStandard of targetStandards) {
      const targetGrade = targetStandard.grade_band || ''
      if (!(workItem.missing_grade_bands || []).includes(targetGrade)) {
        errors.push(`${workItem.action_work_item_id} target grade ${targetGrade} is not in missing_grade_bands`)
      }
      const id = `h4g_anchor_group_missing_grade_unit_indexing_${hashText(`${workItem.decision_id}|${targetStandard.code || targetStandard.id}`)}`
      if (seen.has(id)) errors.push(`duplicate missing_grade_unit_indexing_item_id: ${id}`)
      seen.add(id)
      rows.push({
        anchor_type: sourceItem.anchor_type || '',
        existing_grade_bands: sourceItem.existing_grade_bands || workItem.source_existing_grade_bands || [],
        existing_source_anchor_review_items: sourceItem.source_anchor_review_items || [],
        existing_unit_context_by_grade_band: sourceItem.unit_context_by_grade_band || workItem.unit_context_by_grade_band || {},
        grade_band_to_index: targetGrade,
        item_review_surface: 'anchor_group_missing_grade_textbook_unit_indexing',
        missing_grade_bands: workItem.missing_grade_bands || [],
        missing_grade_unit_indexing_item_id: id,
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
        review_decision_template: reviewDecisionTemplate(workItem, sourceItem, targetStandard),
        review_grain: REVIEW_GRAIN,
        reviewer_gate: 'Index same-grade textbook unit candidates before any later source-anchor or item-level review.',
        source_anchor_evidence_request_item_id: sourceItem.source_evidence_request_item_id || '',
        source_standard_code: workItem.standard_code || sourceItem.standard_code || '',
        subject_slug: workItem.subject_slug || sourceItem.subject_slug || '',
        target_standard_code: targetStandard.code || targetStandard.id || '',
        target_standard_context: standardSummary(targetStandard),
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
    by_grade_band_to_index: {},
    by_priority_tier: {},
    by_subject: {},
    existing_source_anchor_review_rows: 0,
    missing_grade_unit_indexing_items: rows.length,
    parent_work_items: sorted(rows.map(row => row.parent_action_work_item_id)).length,
    target_standards_to_index: sorted(rows.map(row => row.target_standard_code)).length
  }
  for (const row of rows) {
    summary.existing_source_anchor_review_rows += (row.existing_source_anchor_review_items || []).length
    countInto(summary.by_anchor_type, row.anchor_type)
    countInto(summary.by_grade_band_to_index, row.grade_band_to_index)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_subject, row.subject_slug)
    for (const gradeBand of row.existing_grade_bands || []) countInto(summary.by_existing_grade_band, gradeBand)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.progression_group_id)} | ${markdownCell(row.target_standard_code)} | ${markdownCell(row.grade_band_to_index)} | ${markdownCell(row.anchor_type)} | ${truncate(Object.values(row.existing_unit_context_by_grade_band || {}).flat().join('; '))} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Missing-Grade Textbook Unit Indexing Batch

Generated at: ${payload.generated_at}

This is a read-only indexing batch for item-review rows recommended as
\`needs_textbook_unit_indexing\`. Each row targets one missing-grade public
standard and asks for same-grade textbook unit candidates. It does not update
editable decisions, approve bridges, write \`public/data\`, change official
standard text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| worklist only | ${payload.worklist_only} |
| indexing items | ${payload.summary.missing_grade_unit_indexing_items} |
| parent work items | ${payload.summary.parent_work_items} |
| target standards to index | ${payload.summary.target_standards_to_index} |
| existing source anchor rows | ${payload.summary.existing_source_anchor_review_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Missing Grade Bands

| grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band_to_index)}

## Subjects

| subject | rows |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Preview

| rank | tier | subject | progression group | target standard | grade to index | anchor | existing units |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.missing_grade_unit_indexing_items)}

## Guardrails

- Indexing rows are not official decisions.
- Indexed units still require later source-anchor and item-level review.
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
    ['source evidence batch', args.sourceEvidenceBatch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const worklist = errors.length ? { item_review_action_work_items: [] } : readJson(args.worklist)
  const sourceEvidenceBatch = errors.length ? { source_evidence_request_items: [] } : readJson(args.sourceEvidenceBatch)
  if (!errors.length) validateTopLevel(worklist, sourceEvidenceBatch, args, errors)
  const rows = buildRows(worklist, sourceEvidenceBatch, args, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no missing-grade unit indexing items were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    missing_grade_unit_indexing_items: rows,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch',
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
