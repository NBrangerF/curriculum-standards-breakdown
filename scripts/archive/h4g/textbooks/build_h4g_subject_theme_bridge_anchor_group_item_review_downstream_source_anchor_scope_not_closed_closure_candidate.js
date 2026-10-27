#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CLOSURE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_closure_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_closure_candidate_anchor_domain_rejected_english_pe.md'

const CANDIDATE_DECISION = 'reject_slice_as_overbroad'
const CANDIDATE_STATUS = 'source_anchor_scope_not_closed_candidate_reviewed'
const CLOSURE_STATUS = 'source_anchor_scope_not_closed_closure_candidate_ready'

function parseArgs(argv) {
  const args = {
    actionCandidate: DEFAULT_ACTION_CANDIDATE,
    closure: DEFAULT_CLOSURE,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--closure') args.closure = argv[++i]
    else if (item === '--action-candidate') args.actionCandidate = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_closure_candidate.js \\
  --closure generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.json \\
  --action-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only closure candidate for source-anchor scope-not-closed action
decisions. Candidate rows remain non-public and still require manual adoption;
the artifact never auto-closes decisions, approves bridges, writes public/data,
changes official standard text, or enables matcher/publication use.`)
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

function truncate(value, max = 110) {
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

function closurePolicy() {
  return {
    action_decision_candidate_required_before_closure: true,
    changes_official_standard_text: false,
    closure_candidate_is_not_publication_approval: true,
    current_bounded_slice_rejected_as_overbroad: true,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    exact_anchor_evidence_not_approved: true,
    manual_adoption_required: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    requires_rebuild_after_scope_split: true,
    writes_public_data: false
  }
}

function validateClosure(closure, args, errors) {
  if (closure.valid !== true) errors.push('closure readiness valid must be true')
  if (closure.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness') {
    errors.push('closure readiness purpose mismatch')
  }
  if (!Array.isArray(closure.closure_readiness_items)) errors.push('closure readiness items must be an array')
  if (closure.close_ready !== false) errors.push('closure readiness close_ready must be false')
  validatePolicy('closure readiness', closure, errors)
  if (args.requireItems && !(closure.closure_readiness_items || []).length) {
    errors.push('requireItems is set but closure readiness has no rows')
  }
}

function validateActionCandidate(actionCandidate, args, errors) {
  if (actionCandidate.valid !== true) errors.push('action candidate valid must be true')
  if (actionCandidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('action candidate purpose must preserve downstream action decisions template')
  }
  if (actionCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate') {
    errors.push('action candidate candidate_purpose mismatch')
  }
  if (actionCandidate.review_only !== true) errors.push('action candidate review_only must be true')
  if (actionCandidate.publication_candidate !== false) errors.push('action candidate publication_candidate must be false')
  validatePolicy('action candidate', actionCandidate, errors)
  if (!Array.isArray(actionCandidate.downstream_action_decisions)) {
    errors.push('action candidate downstream_action_decisions must be an array')
  }
  if (args.requireItems && !(actionCandidate.downstream_action_decisions || []).length) {
    errors.push('requireItems is set but action candidate has no rows')
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

function isScopeNotClosedActionCandidate(row) {
  return row.source_anchor_scope_not_closed_action_decision_candidate === true &&
    row.reviewer_decision === CANDIDATE_DECISION &&
    row.decision_status === CANDIDATE_STATUS &&
    row.source_anchor_scope_not_closed_source_review_evidence?.exact_anchor_auto_approval === false
}

function actionEvidence(row, actionRow, args) {
  const sourceEvidence = actionRow.source_anchor_scope_not_closed_source_review_evidence || {}
  return {
    action_candidate: args.actionCandidate,
    action_decision_id: actionRow.decision_id || '',
    action_decision_status: actionRow.decision_status || '',
    action_reviewer_decision: actionRow.reviewer_decision || '',
    current_bounded_slice_rejected_as_overbroad: true,
    exact_anchor_auto_approval: false,
    linked_source_anchor_review_decision_id: sourceEvidence.linked_source_anchor_review_decision_id || '',
    source_anchor_review_work_item_id: sourceEvidence.source_anchor_review_work_item_id || '',
    source_key: row.source_key || actionRow.source_key || '',
    target_standard_code: sourceEvidence.target_standard_code || row.target_standard_code || row.standard_code || '',
    unit_evidence_id: sourceEvidence.unit_evidence_id || row.unit_evidence_id || '',
    unit_title: sourceEvidence.unit_title || row.unit_title || ''
  }
}

function applyClosureCandidate(row, actionRow, args) {
  return {
    ...row,
    candidate_close_ready_after_manual_adoption: true,
    candidate_closure_status: CLOSURE_STATUS,
    candidate_next_gate: 'manual_adopt_reject_slice_as_overbroad_then_rebuild_scope_split',
    source_anchor_scope_not_closed_action_decision_evidence: actionEvidence(row, actionRow, args),
    source_anchor_scope_not_closed_closure_candidate: true,
    source_anchor_scope_not_closed_closure_policy: closurePolicy()
  }
}

function summarize(rows, candidateRows, actionRows) {
  const summary = {
    action_candidate_decisions: actionRows.length,
    auto_close_allowed_items: 0,
    by_grade_band: {},
    by_source_batch: {},
    by_subject: {},
    by_target_standard_code: {},
    candidate_close_ready_after_manual_adoption_items: 0,
    candidate_closure_items: candidateRows.length,
    close_ready_items: 0,
    closure_readiness_items: rows.length,
    manual_confirmation_required_items: 0,
    pending_manual_confirmation_items: rows.length - candidateRows.length,
    unique_action_decisions: sorted(candidateRows.map(row => row.decision_id)).length,
    unique_source_review_decisions: sorted(candidateRows.map(row => row.source_anchor_scope_not_closed_action_decision_evidence?.linked_source_anchor_review_decision_id)).length,
    unique_target_standard_codes: sorted(candidateRows.map(row => row.source_anchor_scope_not_closed_action_decision_evidence?.target_standard_code || row.target_standard_code || row.standard_code)).length,
    unique_unit_evidence_ids: sorted(candidateRows.map(row => row.source_anchor_scope_not_closed_action_decision_evidence?.unit_evidence_id || row.unit_evidence_id)).length
  }
  for (const row of rows) {
    if (row.auto_close_allowed) summary.auto_close_allowed_items += 1
    if (row.close_ready) summary.close_ready_items += 1
    if (row.manual_confirmation_required) summary.manual_confirmation_required_items += 1
  }
  for (const row of candidateRows) {
    if (row.candidate_close_ready_after_manual_adoption) {
      summary.candidate_close_ready_after_manual_adoption_items += 1
    }
    countInto(summary.by_grade_band, row.grade_band || row.target_grade_band)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.source_anchor_scope_not_closed_action_decision_evidence?.target_standard_code || row.target_standard_code || row.standard_code)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 40).map(row => (
    `| ${markdownCell(row.grade_band)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.source_anchor_scope_not_closed_action_decision_evidence?.target_standard_code || row.standard_code)} | ${markdownCell(row.candidate_closure_status)} | ${truncate(row.unit_title || row.source_anchor_scope_not_closed_action_decision_evidence?.unit_title || '-')} |`
  )).join('\n') || '| - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Scope-Not-Closed Closure Candidate

Generated at: ${payload.generated_at}

This read-only candidate joins closure readiness with the source-anchor
scope-not-closed action candidate. It marks only the linked overbroad
source-anchor action rows as closure candidates after manual adoption. It does
not auto-close any decision, write \`public/data\`, enable matcher use, or
approve publication.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| closure readiness items | ${payload.summary.closure_readiness_items} |
| candidate closure items | ${payload.summary.candidate_closure_items} |
| pending manual confirmation items | ${payload.summary.pending_manual_confirmation_items} |
| candidate close-ready after manual adoption | ${payload.summary.candidate_close_ready_after_manual_adoption_items} |
| auto-close allowed items | ${payload.summary.auto_close_allowed_items} |
| official close-ready items | ${payload.summary.close_ready_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Target Grades

| grade | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Preview

| grade | subject | target standard | candidate status | unit |
| --- | --- | --- | --- | --- |
${previewRows(payload.closure_readiness_items.filter(row => row.source_anchor_scope_not_closed_closure_candidate === true))}

## Guardrails

- Candidate rows still require manual adoption in the downstream action decision surface.
- Candidate rows reject only the current overbroad bounded slice.
- Candidate rows do not approve exact source-anchor evidence.
- Official close-ready and auto-close counts remain zero.
- Public data, matcher, and publication gates remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['closure readiness', args.closure],
    ['action candidate', args.actionCandidate]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const closure = existsSync(args.closure) ? readJson(args.closure) : { closure_readiness_items: [] }
  const actionCandidate = existsSync(args.actionCandidate) ? readJson(args.actionCandidate) : { downstream_action_decisions: [] }
  if (!errors.length) {
    validateClosure(closure, args, errors)
    validateActionCandidate(actionCandidate, args, errors)
  }

  const closureById = mapBy(closure.closure_readiness_items || [], 'decision_id', errors, 'closure readiness')
  const actionCandidateRows = []
  const actionCandidateById = new Map()
  for (const row of actionCandidate.downstream_action_decisions || []) {
    if (!isScopeNotClosedActionCandidate(row)) continue
    if (row.source_downstream_action_batch !== 'source_anchor_evidence') {
      errors.push(`${row.decision_id || '(missing action decision)'} must be source_anchor_evidence`)
      continue
    }
    if (!closureById.has(row.decision_id)) {
      errors.push(`${row.decision_id || '(missing action decision)'} missing closure readiness item`)
      continue
    }
    actionCandidateById.set(row.decision_id, row)
    actionCandidateRows.push(row)
  }
  if (args.requireItems && !actionCandidateRows.length) {
    errors.push('requireItems is set but no source-anchor scope-not-closed action candidate rows were found')
  }

  const rows = (closure.closure_readiness_items || []).map(row => {
    const actionRow = actionCandidateById.get(row.decision_id)
    if (!actionRow) return row
    if (row.source_downstream_action_batch !== 'source_anchor_evidence') {
      errors.push(`${row.decision_id} closure item must be source_anchor_evidence`)
    }
    if (row.auto_close_allowed !== false) errors.push(`${row.decision_id} auto_close_allowed must be false`)
    if (row.close_ready !== false) errors.push(`${row.decision_id} close_ready must be false`)
    if (row.manual_confirmation_required !== true) errors.push(`${row.decision_id} manual_confirmation_required must be true`)
    return applyClosureCandidate(row, actionRow, args)
  })
  const candidateRows = rows.filter(row => row.source_anchor_scope_not_closed_closure_candidate === true)

  return {
    ...closure,
    candidate_purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_closure_candidate',
    changes_official_standard_text: false,
    closure_readiness_items: rows,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_candidate: false,
    publication_ready: false,
    review_only: true,
    source_action_closure_readiness: args.closure,
    source_anchor_scope_not_closed_action_decisions_candidate: args.actionCandidate,
    source_anchor_scope_not_closed_closure_candidate_policy: closurePolicy(),
    summary: summarize(rows, candidateRows, actionCandidateRows),
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
  console.log(JSON.stringify({
    out: args.out,
    summary: payload.summary,
    valid: payload.valid
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
