#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_MANUAL_CONFIRMATION_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_COMBINED_CLOSURE_CANDIDATES = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist_anchor_domain_rejected_english_pe.md'

function parseArgs(argv) {
  const args = {
    combinedClosureCandidates: DEFAULT_COMBINED_CLOSURE_CANDIDATES,
    manualConfirmationWorklist: DEFAULT_MANUAL_CONFIRMATION_WORKLIST,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--manual-confirmation-worklist') args.manualConfirmationWorklist = argv[++i]
    else if (item === '--combined-closure-candidates') args.combinedClosureCandidates = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist.js \\
  --strict --require-items

Builds a read-only worklist containing only the downstream manual confirmation
items not covered by the combined closure candidate lanes. It does not edit
decisions, approve bridges, write public/data, or enable matcher/publication.`)
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

function validateInputs(manualWorklist, combinedCandidate, args, errors) {
  if (manualWorklist.valid !== true) errors.push('manual confirmation worklist valid must be true')
  if (manualWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist') {
    errors.push('manual confirmation worklist purpose mismatch')
  }
  if (manualWorklist.worklist_only !== true) errors.push('manual confirmation worklist worklist_only must be true')
  if (!Array.isArray(manualWorklist.manual_confirmation_work_items)) {
    errors.push('manual confirmation work items must be an array')
  }
  validatePolicy('manual confirmation worklist', manualWorklist, errors)

  if (combinedCandidate.valid !== true) errors.push('combined closure candidate valid must be true')
  if (combinedCandidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness') {
    errors.push('combined closure candidate purpose mismatch')
  }
  if (combinedCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined') {
    errors.push('combined closure candidate candidate_purpose mismatch')
  }
  if (combinedCandidate.review_only !== true) errors.push('combined closure candidate review_only must be true')
  if (combinedCandidate.publication_candidate !== false) errors.push('combined closure candidate publication_candidate must be false')
  if (!Array.isArray(combinedCandidate.closure_readiness_items)) {
    errors.push('combined closure readiness items must be an array')
  }
  validatePolicy('combined closure candidate', combinedCandidate, errors)

  if (args.requireItems && !(manualWorklist.manual_confirmation_work_items || []).length) {
    errors.push('requireItems is set but manual confirmation worklist has no items')
  }
}

function remainingReason(row) {
  const lane = row.manual_confirmation_lane || ''
  if (lane === 'source_anchor_generic_or_deny_term_review_lane') {
    return 'source_anchor_exact_text_needed_generic_or_deny_term_anchor'
  }
  if (lane === 'source_anchor_fanout_review_lane') {
    return 'source_anchor_exact_text_needed_unit_or_standard_fanout'
  }
  if (lane === 'single_source_row_confirmation_lane') return 'single_source_row_scope_confirmation_still_needed'
  if (lane === 'bounded_item_level_source_review_lane') return 'item_level_source_scope_confirmation_still_needed'
  return 'manual_confirmation_not_covered_by_combined_candidate_lane'
}

function nextGate(row) {
  const lane = row.manual_confirmation_lane || ''
  if (lane === 'source_anchor_generic_or_deny_term_review_lane') return 'manual_exact_anchor_text_review_required'
  if (lane === 'source_anchor_fanout_review_lane') return 'manual_fanout_exact_anchor_review_required'
  if (lane === 'single_source_row_confirmation_lane') return 'manual_single_source_row_confirmation_required'
  if (lane === 'bounded_item_level_source_review_lane') return 'manual_item_level_source_review_required'
  return 'manual_confirmation_required'
}

function buildRows(manualWorklist, combinedCandidate, args, errors) {
  const combinedByDecision = mapBy(combinedCandidate.closure_readiness_items || [], 'decision_id', errors, 'combined closure candidate')
  const rows = []
  for (const row of manualWorklist.manual_confirmation_work_items || []) {
    const combined = combinedByDecision.get(row.action_decision_id)
    if (!combined) {
      errors.push(`${row.action_decision_id || '(missing action decision id)'} missing combined closure candidate row`)
      continue
    }
    if (combined.downstream_action_closure_candidate === true) continue
    rows.push({
      ...row,
      combined_candidate_filter_source: args.combinedClosureCandidates,
      combined_closure_candidate_present: false,
      post_candidate_remaining_reason: remainingReason(row),
      recommended_next_gate_after_candidate_filter: nextGate(row)
    })
  }
  return rows.map((row, index) => ({ ...row, remaining_worklist_rank: index + 1 }))
}

function summarize(rows, manualWorklist, combinedCandidate) {
  const combinedRows = combinedCandidate.closure_readiness_items || []
  const combinedCandidateRows = combinedRows.filter(row => row.downstream_action_closure_candidate === true)
  const summary = {
    auto_close_allowed_items: 0,
    by_grade_band: {},
    by_inventory_bucket: {},
    by_manual_confirmation_lane: {},
    by_next_gate_after_candidate_filter: {},
    by_post_candidate_remaining_reason: {},
    by_recommendation: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    close_ready_items: 0,
    combined_candidate_closure_items: combinedCandidateRows.length,
    combined_closure_readiness_items: combinedRows.length,
    excluded_combined_candidate_items: combinedCandidateRows.length,
    item_level_source_review_items: 0,
    manual_confirmation_items_total: (manualWorklist.manual_confirmation_work_items || []).length,
    manual_confirmation_required_items: 0,
    post_candidate_remaining_work_items: rows.length,
    remaining_manual_confirmation_items: rows.length,
    source_anchor_exact_review_items: 0,
    source_row_confirmation_items: 0,
    unique_action_decisions: sorted(rows.map(row => row.action_decision_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length
  }
  for (const row of rows) {
    if (row.auto_close_allowed) summary.auto_close_allowed_items += 1
    if (row.close_ready) summary.close_ready_items += 1
    if (row.manual_confirmation_required) summary.manual_confirmation_required_items += 1
    if (row.source_downstream_action_batch === 'source_row_confirmation') summary.source_row_confirmation_items += 1
    if (row.source_downstream_action_batch === 'item_level_source_review') summary.item_level_source_review_items += 1
    if (row.source_downstream_action_batch === 'source_anchor_evidence') summary.source_anchor_exact_review_items += 1
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_inventory_bucket, row.inventory_bucket)
    countInto(summary.by_manual_confirmation_lane, row.manual_confirmation_lane)
    countInto(summary.by_next_gate_after_candidate_filter, row.recommended_next_gate_after_candidate_filter)
    countInto(summary.by_post_candidate_remaining_reason, row.post_candidate_remaining_reason)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_source_downstream_action_batch, row.source_downstream_action_batch)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 40).map(row => (
    `| ${row.remaining_worklist_rank} | ${markdownCell(row.manual_confirmation_lane)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.post_candidate_remaining_reason)} | ${markdownCell(row.inventory_bucket)} | ${markdownCell(row.standard_code || row.target_standard_code)} | ${truncate(row.unit_title || '-')} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Post-Candidate Remaining Worklist

Generated at: ${payload.generated_at}

This read-only worklist contains the manual-confirmation rows that remain after
the combined closure candidate lanes are filtered out. It does not edit action
decisions, approve bridges, write \`public/data\`, or enable matcher/publication
use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| manual confirmation items total | ${payload.summary.manual_confirmation_items_total} |
| combined candidate closure items | ${payload.summary.combined_candidate_closure_items} |
| excluded combined candidate items | ${payload.summary.excluded_combined_candidate_items} |
| post-candidate remaining work items | ${payload.summary.post_candidate_remaining_work_items} |
| auto-close allowed items | ${payload.summary.auto_close_allowed_items} |
| close-ready items | ${payload.summary.close_ready_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Remaining Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_manual_confirmation_lane)}

## Remaining Reasons

| reason | rows |
| --- | ---: |
${countRows(payload.summary.by_post_candidate_remaining_reason)}

## Grades

| grade | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Preview

| rank | lane | subject | grade | remaining reason | inventory bucket | standard | unit |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.post_candidate_remaining_work_items)}

## Guardrails

- Rows are filtered from manual confirmation worklist only.
- Rows covered by combined closure candidates are excluded, not approved.
- Every remaining row still requires a later manual decision gate.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    combinedClosureCandidates: args.combinedClosureCandidates,
    manualConfirmationWorklist: args.manualConfirmationWorklist
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const manualWorklist = existsSync(args.manualConfirmationWorklist)
    ? readJson(args.manualConfirmationWorklist)
    : { manual_confirmation_work_items: [] }
  const combinedCandidate = existsSync(args.combinedClosureCandidates)
    ? readJson(args.combinedClosureCandidates)
    : { closure_readiness_items: [] }
  if (!errors.length) validateInputs(manualWorklist, combinedCandidate, args, errors)
  const rows = buildRows(manualWorklist, combinedCandidate, args, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no post-candidate remaining rows were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    post_candidate_remaining_work_items: rows,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist',
    remaining_worklist_only: true,
    review_only: true,
    source_combined_closure_candidates: args.combinedClosureCandidates,
    source_manual_confirmation_worklist: args.manualConfirmationWorklist,
    summary: summarize(rows, manualWorklist, combinedCandidate),
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
