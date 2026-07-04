#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CLOSURE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.json'
const DEFAULT_TARGET_GAP_ACTION_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_MANUAL_SCOPE_ACTION_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_ACTION_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined_anchor_domain_rejected_english_pe.md'

const CANDIDATE_STATUS = 'downstream_action_closure_candidate_ready_after_manual_adoption'

const CANDIDATE_SPECS = {
  manual_scope_indexing: {
    candidateFlag: 'manual_scope_indexing_decision_candidate',
    decisionStatus: 'inventory_candidate_reviewed',
    evidenceKey: 'manual_scope_indexing_evidence',
    lane: 'same_grade_unit_scope_confirmation_lane',
    reviewerDecision: 'missing_grade_units_indexed_for_later_source_review'
  },
  source_anchor_scope_not_closed: {
    candidateFlag: 'source_anchor_scope_not_closed_action_decision_candidate',
    decisionStatus: 'source_anchor_scope_not_closed_candidate_reviewed',
    evidenceKey: 'source_anchor_scope_not_closed_source_review_evidence',
    lane: 'source_anchor_unit_or_source_scope_review_lane',
    reviewerDecision: 'reject_slice_as_overbroad'
  },
  target_gap: {
    candidateFlag: 'target_gap_inventory_decision_candidate',
    decisionStatus: 'inventory_candidate_reviewed',
    evidenceKey: 'target_gap_inventory_evidence',
    lane: 'priority_target_gap_confirmation_lane',
    reviewerDecision: 'target_standard_gap_confirmed'
  }
}

function parseArgs(argv) {
  const args = {
    closure: DEFAULT_CLOSURE,
    manualScopeActionCandidate: DEFAULT_MANUAL_SCOPE_ACTION_CANDIDATE,
    out: DEFAULT_OUT,
    requireItems: false,
    sourceAnchorActionCandidate: DEFAULT_SOURCE_ANCHOR_ACTION_CANDIDATE,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    targetGapActionCandidate: DEFAULT_TARGET_GAP_ACTION_CANDIDATE
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--closure') args.closure = argv[++i]
    else if (item === '--target-gap-action-candidate') args.targetGapActionCandidate = argv[++i]
    else if (item === '--manual-scope-action-candidate') args.manualScopeActionCandidate = argv[++i]
    else if (item === '--source-anchor-action-candidate') args.sourceAnchorActionCandidate = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined.js \\
  --strict --require-items

Builds a read-only combined closure candidate by joining closure readiness with
the reviewed target-gap, manual-scope, and source-anchor scope-not-closed
action candidates. It never auto-closes decisions, writes public/data, changes
official standard text, or enables matcher/publication use.`)
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

function truncate(value, max = 100) {
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

function validateActionCandidate(label, payload, candidatePurpose, args, errors) {
  if (payload.valid !== true) errors.push(`${label} valid must be true`)
  if (payload.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push(`${label} purpose must preserve downstream action decisions template`)
  }
  if (payload.candidate_purpose !== candidatePurpose) errors.push(`${label} candidate_purpose mismatch`)
  if (payload.review_only !== true) errors.push(`${label} review_only must be true`)
  if (payload.publication_candidate !== false) errors.push(`${label} publication_candidate must be false`)
  validatePolicy(label, payload, errors)
  if (!Array.isArray(payload.downstream_action_decisions)) {
    errors.push(`${label} downstream_action_decisions must be an array`)
  }
}

function combinedPolicy() {
  return {
    changes_official_standard_text: false,
    closure_candidate_is_not_publication_approval: true,
    direct_matcher_use: false,
    downstream_action_candidate_required_before_closure: true,
    eligible_for_h4g_differentiation: false,
    manual_adoption_required: true,
    matcher_ready: false,
    official_close_ready_not_set: true,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
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

function isCandidateAction(row, spec) {
  return row?.[spec.candidateFlag] === true &&
    row.reviewer_decision === spec.reviewerDecision &&
    row.decision_status === spec.decisionStatus
}

function candidateRows(payload, spec, errors, label) {
  const rows = []
  for (const row of payload.downstream_action_decisions || []) {
    if (!isCandidateAction(row, spec)) continue
    if (row.auto_close_allowed === true || row.close_ready === true) {
      errors.push(`${row.decision_id || label} action candidate must not set close flags`)
    }
    rows.push(row)
  }
  return rows
}

function actionEvidence(row, actionRow, type, path) {
  const spec = CANDIDATE_SPECS[type]
  const sourceEvidence = actionRow[spec.evidenceKey] || {}
  return {
    action_candidate: path,
    action_decision_id: actionRow.decision_id || '',
    action_decision_status: actionRow.decision_status || '',
    action_reviewer_decision: actionRow.reviewer_decision || '',
    action_source_batch: actionRow.source_downstream_action_batch || '',
    candidate_type: type,
    source_key: row.source_key || actionRow.source_key || '',
    target_grade_band: sourceEvidence.target_grade_band || sourceEvidence.missing_grade_band || row.target_grade_band || row.grade_band || '',
    target_standard_code: sourceEvidence.target_standard_code || sourceEvidence.exact_target_code || row.target_standard_code || row.standard_code || '',
    unit_evidence_id: sourceEvidence.unit_evidence_id || row.unit_evidence_id || '',
    unit_title: sourceEvidence.unit_title || row.unit_title || ''
  }
}

function applyCandidate(row, actionRow, type, path) {
  const spec = CANDIDATE_SPECS[type]
  return {
    ...row,
    candidate_close_ready_after_manual_adoption: true,
    candidate_closure_lane: spec.lane,
    candidate_closure_status: CANDIDATE_STATUS,
    candidate_closure_type: type,
    candidate_next_gate: 'manual_adopt_action_candidate_then_continue_downstream_review',
    downstream_action_closure_candidate: true,
    downstream_action_closure_candidate_evidence: actionEvidence(row, actionRow, type, path),
    downstream_action_closure_candidate_policy: combinedPolicy()
  }
}

function summarize(rows, candidateRows) {
  const summary = {
    auto_close_allowed_items: 0,
    by_candidate_lane: {},
    by_candidate_type: {},
    by_grade_band: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    by_target_standard_code: {},
    candidate_close_ready_after_manual_adoption_items: 0,
    candidate_closure_items: candidateRows.length,
    close_ready_items: 0,
    closure_readiness_items: rows.length,
    manual_confirmation_required_items: 0,
    pending_manual_confirmation_items: rows.length - candidateRows.length,
    unique_action_decisions: sorted(candidateRows.map(row => row.decision_id)).length,
    unique_target_standard_codes: sorted(candidateRows.map(row => row.downstream_action_closure_candidate_evidence?.target_standard_code || row.target_standard_code || row.standard_code)).length,
    unique_unit_evidence_ids: sorted(candidateRows.map(row => row.downstream_action_closure_candidate_evidence?.unit_evidence_id || row.unit_evidence_id)).length
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
    countInto(summary.by_candidate_lane, row.candidate_closure_lane)
    countInto(summary.by_candidate_type, row.candidate_closure_type)
    countInto(summary.by_grade_band, row.grade_band || row.target_grade_band)
    countInto(summary.by_source_downstream_action_batch, row.source_downstream_action_batch)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.downstream_action_closure_candidate_evidence?.target_standard_code || row.target_standard_code || row.standard_code)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 50).map(row => (
    `| ${markdownCell(row.candidate_closure_type)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.downstream_action_closure_candidate_evidence?.target_standard_code || row.standard_code)} | ${truncate(row.unit_title || row.downstream_action_closure_candidate_evidence?.unit_title || '-')} |`
  )).join('\n') || '| - | - | - | - | - |'
}

function markdownSummary(payload) {
  const candidates = payload.closure_readiness_items.filter(row => row.downstream_action_closure_candidate === true)
  return `# H4G Downstream Action Closure Candidates Combined

Generated at: ${payload.generated_at}

This read-only combined candidate joins closure readiness with reviewed action
candidate lanes. It shows which action decisions can become closure candidates
after manual adoption. It does not auto-close any decision, write
\`public/data\`, enable matcher use, or approve publication.

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

## Candidate Types

| type | rows |
| --- | ---: |
${countRows(payload.summary.by_candidate_type)}

## Target Grades

| grade | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Preview

| type | grade | subject | target standard | unit |
| --- | --- | --- | --- | --- |
${previewRows(candidates)}

## Guardrails

- Candidate rows still require manual adoption in the downstream action decision surface.
- Candidate rows do not approve bridge matching or publication.
- Official close-ready and auto-close counts remain zero.
- Public data, matcher, and publication gates remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  const files = {
    closure: args.closure,
    manualScopeActionCandidate: args.manualScopeActionCandidate,
    sourceAnchorActionCandidate: args.sourceAnchorActionCandidate,
    targetGapActionCandidate: args.targetGapActionCandidate
  }
  for (const [label, path] of Object.entries(files)) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const closure = existsSync(args.closure) ? readJson(args.closure) : { closure_readiness_items: [] }
  const targetGap = existsSync(args.targetGapActionCandidate) ? readJson(args.targetGapActionCandidate) : { downstream_action_decisions: [] }
  const manualScope = existsSync(args.manualScopeActionCandidate) ? readJson(args.manualScopeActionCandidate) : { downstream_action_decisions: [] }
  const sourceAnchor = existsSync(args.sourceAnchorActionCandidate) ? readJson(args.sourceAnchorActionCandidate) : { downstream_action_decisions: [] }
  if (!errors.length) {
    validateClosure(closure, args, errors)
    validateActionCandidate('target-gap action candidate', targetGap, 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate', args, errors)
    validateActionCandidate('manual-scope action candidate', manualScope, 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate', args, errors)
    validateActionCandidate('source-anchor action candidate', sourceAnchor, 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate', args, errors)
  }

  const candidateById = new Map()
  for (const [type, payload, path] of [
    ['target_gap', targetGap, args.targetGapActionCandidate],
    ['manual_scope_indexing', manualScope, args.manualScopeActionCandidate],
    ['source_anchor_scope_not_closed', sourceAnchor, args.sourceAnchorActionCandidate]
  ]) {
    const spec = CANDIDATE_SPECS[type]
    for (const row of candidateRows(payload, spec, errors, type)) {
      if (candidateById.has(row.decision_id)) {
        errors.push(`${row.decision_id} appears in multiple action candidate lanes`)
        continue
      }
      candidateById.set(row.decision_id, { path, row, type })
    }
  }
  if (args.requireItems && !candidateById.size) {
    errors.push('requireItems is set but no action closure candidates were found')
  }

  const closureById = mapBy(closure.closure_readiness_items || [], 'decision_id', errors, 'closure readiness')
  for (const [decisionId] of candidateById) {
    if (!closureById.has(decisionId)) errors.push(`${decisionId} candidate action missing closure readiness item`)
  }

  const rows = (closure.closure_readiness_items || []).map(row => {
    const candidate = candidateById.get(row.decision_id)
    if (!candidate) return row
    if (row.auto_close_allowed !== false) errors.push(`${row.decision_id} auto_close_allowed must be false`)
    if (row.close_ready !== false) errors.push(`${row.decision_id} close_ready must be false`)
    if (row.manual_confirmation_required !== true) errors.push(`${row.decision_id} manual_confirmation_required must be true`)
    return applyCandidate(row, candidate.row, candidate.type, candidate.path)
  })
  const candidates = rows.filter(row => row.downstream_action_closure_candidate === true)

  return {
    ...closure,
    candidate_purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined',
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
    source_action_decision_candidates: {
      manual_scope_indexing: args.manualScopeActionCandidate,
      source_anchor_scope_not_closed: args.sourceAnchorActionCandidate,
      target_gap: args.targetGapActionCandidate
    },
    summary: summarize(rows, candidates),
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
