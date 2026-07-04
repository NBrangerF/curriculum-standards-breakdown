#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_ACTION_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_REVIEW_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate_anchor_domain_rejected_english_pe.md'

const CANDIDATE_DECISION = 'reject_slice_as_overbroad'
const CANDIDATE_STATUS = 'source_anchor_scope_not_closed_candidate_reviewed'

function parseArgs(argv) {
  const args = {
    actionDecisions: DEFAULT_ACTION_DECISIONS,
    out: DEFAULT_OUT,
    requireItems: false,
    reviewedAt: new Date().toISOString().slice(0, 10),
    reviewedBy: 'Codex source-anchor scope-not-closed action candidate',
    sourceReviewCandidate: DEFAULT_SOURCE_REVIEW_CANDIDATE,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--action-decisions') args.actionDecisions = argv[++i]
    else if (item === '--source-review-candidate') args.sourceReviewCandidate = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--reviewed-by') args.reviewedBy = argv[++i]
    else if (item === '--reviewed-at') args.reviewedAt = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate.js \\
  --action-decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json \\
  --source-review-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a non-public downstream action decisions candidate from source-anchor
scope-not-closed review candidates. It only marks linked source-anchor evidence
action rows as reject_slice_as_overbroad; it does not edit the source template,
write public/data, change official standard text, or enable matcher/publication
use.`)
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

function validateActionDecisions(actionDecisions, args, errors) {
  if (actionDecisions.valid !== true) errors.push('action decisions valid must be true')
  if (actionDecisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('action decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template')
  }
  if (actionDecisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('action decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template')
  }
  validatePolicy('action decisions', actionDecisions, errors)
  if (!Array.isArray(actionDecisions.downstream_action_decisions)) {
    errors.push('action decisions downstream_action_decisions must be an array')
  }
  if (args.requireItems && !(actionDecisions.downstream_action_decisions || []).length) {
    errors.push('requireItems is set but action decisions has no downstream_action_decisions')
  }
}

function validateSourceReviewCandidate(sourceReviewCandidate, args, errors) {
  if (sourceReviewCandidate.valid !== true) errors.push('source review candidate valid must be true')
  if (sourceReviewCandidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template') {
    errors.push('source review candidate purpose must preserve source-anchor review decisions template')
  }
  if (sourceReviewCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_decisions_candidate') {
    errors.push('source review candidate candidate_purpose mismatch')
  }
  if (sourceReviewCandidate.review_only !== true) errors.push('source review candidate review_only must be true')
  if (sourceReviewCandidate.publication_candidate !== false) errors.push('source review candidate publication_candidate must be false')
  validatePolicy('source review candidate', sourceReviewCandidate, errors)
  if (!Array.isArray(sourceReviewCandidate.downstream_source_anchor_review_decisions)) {
    errors.push('source review candidate downstream_source_anchor_review_decisions must be an array')
  }
  if (args.requireItems && !(sourceReviewCandidate.downstream_source_anchor_review_decisions || []).length) {
    errors.push('requireItems is set but source review candidate has no rows')
  }
}

function candidatePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_candidate_is_not_publication_approval: true,
    downstream_source_anchor_scope_not_closed_confirmed: true,
    eligible_for_h4g_differentiation: false,
    exact_anchor_evidence_not_approved: true,
    item_level_review_blocked_until_scope_split: true,
    matcher_ready: false,
    publication_ready: false,
    rejects_current_bounded_slice_only: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    requires_rebuild_after_scope_split: true,
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

function isScopeNotClosedSourceReviewCandidate(row) {
  return row.source_anchor_scope_not_closed_decision_candidate === true &&
    row.reviewer_decision === 'source_anchor_scope_not_closed_requires_split' &&
    row.decision_status === 'recommendation_candidate_reviewed' &&
    row.source_anchor_scope_not_closed_recommendation_evidence?.exact_anchor_auto_approval === false
}

function expectedConfirmations(base) {
  return {
    ...(base.required_confirmations || {}),
    anchor_type_matches_target_domain: false,
    current_bounded_slice_rejected_as_overbroad: true,
    exact_anchor_evidence_not_approved: true,
    item_level_decision_still_required: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    same_grade_scope_checked: false,
    same_subject_scope_checked: false,
    source_anchor_scope_not_closed_confirmed: true,
    source_item_reviewed: true
  }
}

function buildDecisionNote(row, sourceReviewRow) {
  return [
    'Candidate non-public downstream action decision: linked source-anchor review confirms the current bounded slice is not scope-closed.',
    `The source-anchor review candidate ${sourceReviewRow.decision_id} requires a split/source-scope rebuild before item-level source review.`,
    `This rejects only the current bounded slice for ${row.target_standard_code || row.standard_code}; it is not exact-anchor evidence approval, matcher approval, or publication approval.`
  ].join(' ')
}

function evidence(row, sourceReviewRow, args) {
  const sourceEvidence = sourceReviewRow.source_anchor_scope_not_closed_recommendation_evidence || {}
  return {
    action_decision_id: row.decision_id || '',
    action_source_item_id: row.source_downstream_action_item_id || '',
    current_bounded_slice_rejected_as_overbroad: true,
    exact_anchor_auto_approval: false,
    linked_source_anchor_review_decision_id: sourceReviewRow.decision_id || '',
    page_evidence_packet_item_id: sourceReviewRow.page_evidence_packet_item_id || '',
    page_evidence_status: sourceReviewRow.page_evidence_status || '',
    page_hint_source: sourceReviewRow.page_hint_source || '',
    recommended_next_gate: sourceEvidence.recommended_next_gate || '',
    review_lane: sourceReviewRow.review_lane || sourceEvidence.review_lane || '',
    source_anchor_review_candidate: args.sourceReviewCandidate,
    source_anchor_review_work_item_id: sourceReviewRow.source_downstream_source_anchor_review_work_item_id || '',
    source_key: sourceReviewRow.source_key || '',
    target_standard_code: sourceReviewRow.target_standard_code || row.target_standard_code || '',
    unit_evidence_id: sourceReviewRow.unit_evidence_id || '',
    unit_title: sourceReviewRow.unit_title || ''
  }
}

function applyCandidate(row, sourceReviewRow, args) {
  return {
    ...row,
    decision_note: buildDecisionNote(row, sourceReviewRow),
    decision_status: CANDIDATE_STATUS,
    required_confirmations: expectedConfirmations(row),
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewedBy,
    reviewer_decision: CANDIDATE_DECISION,
    source_anchor_scope_not_closed_action_candidate_policy: candidatePolicy(),
    source_anchor_scope_not_closed_action_decision_candidate: true,
    source_anchor_scope_not_closed_source_review_evidence: evidence(row, sourceReviewRow, args)
  }
}

function summarize(rows, candidateRows, sourceReviewRows, sourceReviewCandidate) {
  const summary = {
    action_decisions: rows.length,
    by_grade_band: {},
    by_source_batch: {},
    by_subject: {},
    by_target_standard_code: {},
    candidate_decisions: candidateRows.length,
    exact_anchor_auto_approval_candidates: 0,
    pending_action_decisions: rows.length - candidateRows.length,
    source_anchor_review_candidate_rows: (sourceReviewCandidate.downstream_source_anchor_review_decisions || []).length,
    source_anchor_scope_not_closed_review_candidates: sourceReviewRows.length,
    unique_action_decisions: sorted(candidateRows.map(row => row.decision_id)).length,
    unique_source_review_decisions: sorted(sourceReviewRows.map(row => row.decision_id)).length,
    unique_target_standard_codes: sorted(sourceReviewRows.map(row => row.target_standard_code || row.standard_code)).length,
    unique_unit_evidence_ids: sorted(sourceReviewRows.map(row => row.unit_evidence_id)).length
  }
  for (const row of candidateRows) {
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_subject, row.subject_slug)
  }
  for (const row of sourceReviewRows) {
    countInto(summary.by_target_standard_code, row.target_standard_code || row.standard_code)
  }
  return summary
}

function previewRows(sourceReviewRows) {
  return sourceReviewRows.slice(0, 40).map(row => (
    `| ${markdownCell(row.grade_band)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.target_standard_code)} | ${markdownCell(row.page_hint_source)} | ${truncate(row.unit_title || '-')} |`
  )).join('\n') || '| - | - | - | - | - |'
}

function markdownSummary(payload, sourceReviewRows) {
  return `# H4G Downstream Source-Anchor Scope-Not-Closed Action Decisions Candidate

Generated at: ${payload.generated_at}

This candidate copies the editable downstream action decisions template and
only marks linked source-anchor evidence action rows as
\`${CANDIDATE_DECISION}\` when the source-anchor review candidate confirms the
current bounded slice is not scope-closed. It remains review-only and
non-public.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| action decisions | ${payload.summary.action_decisions} |
| candidate decisions | ${payload.summary.candidate_decisions} |
| pending action decisions | ${payload.summary.pending_action_decisions} |
| source-anchor scope-not-closed review candidates | ${payload.summary.source_anchor_scope_not_closed_review_candidates} |
| exact-anchor auto approval candidates | ${payload.summary.exact_anchor_auto_approval_candidates} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Target Grades

| grade | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Subjects

| subject | rows |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Preview

| grade | subject | target standard | page hint | unit |
| --- | --- | --- | --- | --- |
${previewRows(sourceReviewRows)}

## Guardrails

- Candidate rows reject only the current overbroad bounded slice.
- Candidate rows do not approve exact source-anchor evidence.
- Non-candidate action rows remain unchanged from the source template.
- Public data, matcher, and publication gates remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['action decisions', args.actionDecisions],
    ['source review candidate', args.sourceReviewCandidate]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const actionDecisions = existsSync(args.actionDecisions) ? readJson(args.actionDecisions) : { downstream_action_decisions: [] }
  const sourceReviewCandidate = existsSync(args.sourceReviewCandidate) ? readJson(args.sourceReviewCandidate) : { downstream_source_anchor_review_decisions: [] }
  if (!errors.length) {
    validateActionDecisions(actionDecisions, args, errors)
    validateSourceReviewCandidate(sourceReviewCandidate, args, errors)
  }

  const actionById = mapBy(actionDecisions.downstream_action_decisions || [], 'decision_id', errors, 'action decisions')
  const candidateByActionDecisionId = new Map()
  const sourceReviewRows = []
  for (const row of sourceReviewCandidate.downstream_source_anchor_review_decisions || []) {
    if (!isScopeNotClosedSourceReviewCandidate(row)) continue
    const actionDecision = actionById.get(row.downstream_action_decision_id)
    if (!actionDecision) {
      errors.push(`${row.decision_id || '(missing source review decision)'} missing linked action decision`)
      continue
    }
    if (actionDecision.source_downstream_action_batch !== 'source_anchor_evidence') {
      errors.push(`${actionDecision.decision_id} must be a source_anchor_evidence action decision`)
      continue
    }
    if (!(actionDecision.allowed_decisions || []).includes(CANDIDATE_DECISION)) {
      errors.push(`${actionDecision.decision_id} does not allow ${CANDIDATE_DECISION}`)
      continue
    }
    candidateByActionDecisionId.set(actionDecision.decision_id, row)
    sourceReviewRows.push(row)
  }
  if (args.requireItems && !sourceReviewRows.length) {
    errors.push('requireItems is set but no source-anchor scope-not-closed action candidate rows were found')
  }

  const rows = (actionDecisions.downstream_action_decisions || []).map(row => {
    const sourceReviewRow = candidateByActionDecisionId.get(row.decision_id)
    if (!sourceReviewRow) return row
    if (row.reviewer_decision !== 'pending') errors.push(`${row.decision_id} action decision must still be pending`)
    if (row.decision_status !== 'pending_review') errors.push(`${row.decision_id} action decision status must still be pending_review`)
    return applyCandidate(row, sourceReviewRow, args)
  })
  const candidateRows = rows.filter(row => row.source_anchor_scope_not_closed_action_decision_candidate === true)

  return {
    ...actionDecisions,
    candidate_purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_scope_not_closed_action_decisions_candidate',
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_decisions: rows,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_candidate: false,
    publication_ready: false,
    review_only: true,
    source_action_decisions_template: args.actionDecisions,
    source_anchor_scope_not_closed_action_candidate_policy: candidatePolicy(),
    source_anchor_scope_not_closed_review_candidate: args.sourceReviewCandidate,
    summary: summarize(rows, candidateRows, sourceReviewRows, sourceReviewCandidate),
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
  const sourceReviewRows = (payload.downstream_action_decisions || [])
    .filter(row => row.source_anchor_scope_not_closed_action_decision_candidate === true)
    .map(row => ({
      grade_band: row.grade_band || '',
      page_hint_source: row.source_anchor_scope_not_closed_source_review_evidence?.page_hint_source || '',
      subject_slug: row.subject_slug || '',
      target_standard_code: row.target_standard_code || '',
      unit_title: row.source_anchor_scope_not_closed_source_review_evidence?.unit_title || ''
    }))
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload, sourceReviewRows))
  console.log(JSON.stringify({
    out: args.out,
    summary: payload.summary,
    valid: payload.valid
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
