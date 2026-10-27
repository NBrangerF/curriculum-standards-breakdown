#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_action_worklist.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_decisions_template.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch.md'
const SOURCE_ANCHOR_QUEUES = new Set([
  'unit_source_anchor_specificity_review_queue',
  'unit_source_anchor_specificity_page_gap_queue'
])
const REVIEW_GRAIN = 'standard_code+grade_band+candidate_match_id'

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
node scripts/textbooks/build_h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch.js \\
  --strict --require-items

Builds a read-only source-anchor specificity review batch for Math/Science H4G
unit-evidence anchor-policy action work items. Each output row reviews one
reference candidate match. It does not edit reviewer decisions, approve
candidates, write public/data, change official standard text, or enable
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

function sameJson(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right))
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

function policy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    publication_ready: false,
    requires_later_anchor_policy_decision_edit: true,
    requires_later_candidate_coverage_recheck: true,
    requires_later_consistency_gate: true,
    requires_later_manual_review: true,
    requires_later_publication_gate: true,
    review_batch_only: true,
    source_anchor_specificity_batch_only: true,
    worklist_only: true,
    writes_public_data: false
  }
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
  if (worklist.purpose !== 'h4g_unit_evidence_anchor_policy_review_action_worklist') {
    errors.push('worklist purpose mismatch')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  if (worklist.source_anchor_policy_review_decisions !== args.decisions) {
    errors.push('worklist source decisions must match --decisions')
  }
  validatePolicy('worklist', worklist, errors)

  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_unit_evidence_anchor_policy_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  validatePolicy('decisions', decisions, errors)
}

function mapBy(rows, key, errors, label) {
  const out = new Map()
  for (const row of rows || []) {
    const id = row[key] || ''
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
  return (worklist.anchor_policy_action_work_items || [])
    .filter(item => SOURCE_ANCHOR_QUEUES.has(item.work_queue))
    .filter(item => item.suggested_reviewer_decision === 'needs_source_anchor_specificity_review')
    .filter(item => Number(item.priority_rank || 0) >= args.minRank)
    .filter(item => Number(item.priority_rank || 0) <= args.maxRank)
    .filter(item => !subjectSet || subjectSet.has(item.subject_slug || ''))
}

function matchMap(workItem) {
  return mapBy(workItem.reference_candidate_matches || [], 'match_id', [], 'reference matches')
}

function pageRangeStatus(match) {
  if (match.page_start === '' || match.page_start === null || match.page_start === undefined) return 'missing_page_start'
  if (!match.page_range) return 'page_start_only'
  return 'page_range_ready'
}

function reviewDecisionTemplate(workItem, match) {
  return {
    allowed_review_outcomes: [
      'source_anchor_specific_for_later_decision_review',
      'source_anchor_overbroad_keep_blocked',
      'source_anchor_requires_page_start_repair',
      'source_anchor_wrong_grade_or_not_relevant'
    ],
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: {
      anchor_policy_decision_still_required: true,
      candidate_not_directly_eligible: true,
      cross_version_consistency_checked: false,
      no_public_write_requested: true,
      noneligible_reason_understood: false,
      official_standard_text_preserved: true,
      page_start_present: match.page_start !== '' && match.page_start !== null && match.page_start !== undefined,
      policy_exception_or_alias_is_justified: false,
      same_grade_scope_confirmed: false,
      source_anchor_specific_to_standard: false,
      unit_title_scope_not_overbroad: false
    },
    review_questions: [
      `Does "${match.unit_title || ''}" provide a specific unit anchor for ${workItem.standard_code}?`,
      `Is the evidence same-grade for ${workItem.grade_band}, not merely from the shared 7-9 source standard?`,
      'Is the unit title/page range specific enough to avoid a broad domain or topic-only match?',
      'Should this reference remain blocked, move to scoped alias review, or require page/source repair?',
      ...(workItem.required_manual_checks || [])
    ].filter(Boolean),
    reviewer_note_template: 'Record whether this reference candidate is a specific same-grade source anchor. Do not approve matcher or publication use here.'
  }
}

function buildRows(worklist, decisions, args, errors) {
  const decisionsByItem = mapBy(decisions.anchor_policy_review_decisions || [], 'anchor_policy_review_item_id', errors, 'decisions')
  const rows = []
  const seen = new Set()
  for (const workItem of selectedWorkItems(worklist, args)) {
    const decision = decisionsByItem.get(workItem.anchor_policy_review_item_id)
    if (!decision) errors.push(`${workItem.anchor_policy_action_work_item_id} decision row not found`)
    const references = matchMap(workItem)
    for (const matchId of workItem.reference_candidate_match_ids || []) {
      const match = references.get(matchId)
      if (!match) {
        errors.push(`${workItem.anchor_policy_action_work_item_id} missing reference match: ${matchId}`)
        continue
      }
      const id = `h4g_unit_source_anchor_specificity_${hashText(`${workItem.anchor_policy_action_work_item_id}|${matchId}`)}`
      if (seen.has(id)) errors.push(`duplicate source_anchor_specificity_review_item_id: ${id}`)
      seen.add(id)
      rows.push({
        anchor_policy_action_work_item_id: workItem.anchor_policy_action_work_item_id || '',
        anchor_policy_review_item_id: workItem.anchor_policy_review_item_id || '',
        candidate_match: match,
        candidate_match_id: matchId,
        changes_official_standard_text: false,
        decision_id: workItem.decision_id || decision?.decision_id || '',
        direct_matcher_use: false,
        eligible_for_h4g_differentiation: false,
        grade_band: workItem.grade_band || '',
        group_grade_bands: workItem.group_grade_bands || [],
        group_progression_completeness: workItem.group_progression_completeness || '',
        group_standard_codes: workItem.group_standard_codes || [],
        matcher_ready: false,
        page_range_status: pageRangeStatus(match),
        parent_work_queue: workItem.work_queue || '',
        policy: policy(),
        priority_rank: workItem.priority_rank || 0,
        priority_score: workItem.priority_score || 0,
        progression_group_id: workItem.progression_group_id || '',
        publication_ready: false,
        required_manual_checks: workItem.required_manual_checks || [],
        review_decision_template: reviewDecisionTemplate(workItem, match),
        review_grain: REVIEW_GRAIN,
        risk_flags: workItem.risk_flags || [],
        source_anchor_specificity_review_item_id: id,
        source_file: match.source_file || '',
        standard_code: workItem.standard_code || '',
        subject_slug: workItem.subject_slug || '',
        suggested_reviewer_decision: workItem.suggested_reviewer_decision || '',
        triage_reason: workItem.triage_reason || '',
        worklist_only: true,
        writes_public_data: false
      })
    }
  }
  return rows.sort((a, b) => Number(a.priority_rank || 0) - Number(b.priority_rank || 0) ||
    a.standard_code.localeCompare(b.standard_code) ||
    a.candidate_match_id.localeCompare(b.candidate_match_id))
}

function summarize(rows) {
  const summary = {
    by_grade_band: {},
    by_page_range_status: {},
    by_parent_work_queue: {},
    by_risk_flag: {},
    by_subject: {},
    parent_work_items: sorted(rows.map(row => row.anchor_policy_action_work_item_id)).length,
    source_anchor_specificity_review_items: rows.length,
    source_files: sorted(rows.map(row => row.source_file)).length,
    unique_candidate_matches: sorted(rows.map(row => row.candidate_match_id)).length
  }
  for (const row of rows) {
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_range_status, row.page_range_status)
    countInto(summary.by_parent_work_queue, row.parent_work_queue)
    countInto(summary.by_subject, row.subject_slug)
    for (const flag of row.risk_flags || []) countInto(summary.by_risk_flag, flag)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.candidate_match.edition)} | ${truncate(row.candidate_match.unit_title)} | ${markdownCell(row.candidate_match.page_range)} | ${markdownCell(row.page_range_status)} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Anchor Policy Source-Anchor Specificity Batch

Generated at: ${payload.generated_at}

This read-only batch turns source-anchor action work items into one review row
per reference candidate match at \`${REVIEW_GRAIN}\` grain. It does not edit
reviewer decisions, approve candidate matches, write \`public/data\`, change
official standard text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| worklist only | ${payload.worklist_only} |
| specificity review items | ${payload.summary.source_anchor_specificity_review_items} |
| parent work items | ${payload.summary.parent_work_items} |
| unique candidate matches | ${payload.summary.unique_candidate_matches} |
| source files | ${payload.summary.source_files} |

## Parent Queues

| queue | rows |
| --- | ---: |
${countRows(payload.summary.by_parent_work_queue)}

## Page Range Status

| status | rows |
| --- | ---: |
${countRows(payload.summary.by_page_range_status)}

## Preview

| rank | subject | grade | standard | edition | unit title | page range | page status |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.source_anchor_specificity_review_items)}

## Guardrails

- Specificity rows are not official reviewer decisions.
- Any decision template edit must happen separately after manual review.
- Candidate match IDs here are references only and must not be copied blindly into selected_candidate_match_ids.
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
  const worklist = errors.length ? { anchor_policy_action_work_items: [] } : readJson(args.worklist)
  const decisions = errors.length ? { anchor_policy_review_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(worklist, decisions, args, errors)
  const rows = buildRows(worklist, decisions, args, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no source-anchor specificity rows were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: policy(),
    publication_ready: false,
    purpose: 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch',
    review_batch_only: true,
    selection: {
      max_rank: args.maxRank === Number.POSITIVE_INFINITY ? 'all' : args.maxRank,
      min_rank: args.minRank,
      subjects: args.subjects || ['all'],
      work_queues: [...SOURCE_ANCHOR_QUEUES].sort()
    },
    source_anchor_policy_review_action_worklist: args.worklist,
    source_anchor_policy_review_decisions: args.decisions,
    source_anchor_specificity_batch_only: true,
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
  if (args.out) writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({
    errors: payload.errors,
    generated_at: payload.generated_at,
    out: args.out,
    purpose: payload.purpose,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid,
    writes_public_data: payload.writes_public_data
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
