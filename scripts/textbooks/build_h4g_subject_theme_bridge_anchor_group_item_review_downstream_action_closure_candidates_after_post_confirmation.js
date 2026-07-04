#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CLOSURE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.json'
const DEFAULT_COMBINED_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined_anchor_domain_rejected_english_pe.json'
const DEFAULT_CONFIRMATION_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_after_post_confirmation_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_after_post_confirmation_anchor_domain_rejected_english_pe.md'

const CANDIDATE_PURPOSE = 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_after_post_confirmation'
const CANDIDATE_STATUS = 'downstream_action_closure_candidate_ready_after_manual_adoption'

const CONFIRMATION_SPECS = {
  item_level_source_review: {
    candidateType: 'post_candidate_item_level_source_review',
    lane: 'bounded_item_level_source_review_lane',
    reviewerDecision: 'confirm_item_level_source_scope_for_later_action_gate'
  },
  source_row_confirmation: {
    candidateType: 'post_candidate_source_row_confirmation',
    lane: 'single_source_row_confirmation_lane',
    reviewerDecision: 'confirm_source_row_for_later_action_gate'
  }
}

function parseArgs(argv) {
  const args = {
    closure: DEFAULT_CLOSURE,
    combinedCandidate: DEFAULT_COMBINED_CANDIDATE,
    confirmationCandidate: DEFAULT_CONFIRMATION_CANDIDATE,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--closure') args.closure = argv[++i]
    else if (item === '--combined-candidate') args.combinedCandidate = argv[++i]
    else if (item === '--confirmation-candidate') args.confirmationCandidate = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_after_post_confirmation.js \\
  --strict --require-items

Builds a read-only closure candidate after the post-candidate manual-review
confirmation gate. It starts from the existing combined closure candidate and
adds only body-text-reviewed source-row/item-level confirmation candidates. It
does not mutate source templates, auto-close decisions, write public/data,
change official standard text, or enable matcher/publication use.`)
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

function validateCombinedCandidate(combined, args, errors) {
  if (combined.valid !== true) errors.push('combined closure candidate valid must be true')
  if (combined.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness') {
    errors.push('combined closure candidate purpose mismatch')
  }
  if (combined.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_combined') {
    errors.push('combined closure candidate candidate_purpose mismatch')
  }
  if (combined.source_action_closure_readiness !== args.closure) {
    errors.push('combined closure candidate source_action_closure_readiness mismatch')
  }
  if (combined.review_only !== true) errors.push('combined closure candidate review_only must be true')
  if (combined.publication_candidate !== false) errors.push('combined closure candidate publication_candidate must be false')
  if (!Array.isArray(combined.closure_readiness_items)) {
    errors.push('combined closure candidate closure_readiness_items must be an array')
  }
  validatePolicy('combined closure candidate', combined, errors)
}

function validateConfirmationCandidate(candidate, args, errors) {
  if (candidate.valid !== true) errors.push('post-confirmation decisions candidate valid must be true')
  if (candidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template') {
    errors.push('post-confirmation decisions candidate purpose mismatch')
  }
  if (candidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_decisions_candidate') {
    errors.push('post-confirmation decisions candidate candidate_purpose mismatch')
  }
  if (candidate.review_only !== true) errors.push('post-confirmation decisions candidate review_only must be true')
  if (candidate.publication_candidate !== false) errors.push('post-confirmation decisions candidate publication_candidate must be false')
  if (!Array.isArray(candidate.post_candidate_manual_review_decisions)) {
    errors.push('post-confirmation decisions candidate decisions must be an array')
  }
  validatePolicy('post-confirmation decisions candidate', candidate, errors)
  if (args.requireItems && !(candidate.post_candidate_manual_review_decisions || []).some(row => row.post_candidate_manual_review_confirmation_decision_candidate === true)) {
    errors.push('requireItems is set but no post-confirmation decision candidates were found')
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

function confirmationSpec(row) {
  return CONFIRMATION_SPECS[row.source_downstream_action_batch]
}

function isConfirmationCandidate(row) {
  const spec = confirmationSpec(row)
  return Boolean(spec) &&
    row.post_candidate_manual_review_confirmation_decision_candidate === true &&
    row.decision_status === 'reviewed' &&
    row.reviewer_decision === spec.reviewerDecision
}

function validateConfirmationRow(row, errors) {
  const prefix = row.decision_id || '(missing post-confirmation decision)'
  const spec = confirmationSpec(row)
  if (!spec) errors.push(`${prefix} source_downstream_action_batch is not a supported post-confirmation lane`)
  if (!row.downstream_action_decision_id) errors.push(`${prefix} missing downstream_action_decision_id`)
  if (row.evidence_quality !== 'body_text_ready_confirmation_evidence') {
    errors.push(`${prefix} evidence_quality must be body_text_ready_confirmation_evidence`)
  }
  const evidence = row.confirmation_evidence_summary || {}
  if (evidence.body_text_ready !== true) errors.push(`${prefix} confirmation evidence body_text_ready must be true`)
  if (evidence.ready_for_manual_review !== true) errors.push(`${prefix} confirmation evidence ready_for_manual_review must be true`)
  if (evidence.page_evidence_status !== 'text_extracted') errors.push(`${prefix} confirmation evidence page_evidence_status must be text_extracted`)
  if (evidence.selected_page_quality !== 'body_text_ready') errors.push(`${prefix} confirmation evidence selected_page_quality must be body_text_ready`)
  if (row.direct_matcher_use !== false) errors.push(`${prefix} direct_matcher_use must be false`)
  if (row.eligible_for_h4g_differentiation !== false) errors.push(`${prefix} eligible_for_h4g_differentiation must be false`)
  if (row.matcher_ready !== false) errors.push(`${prefix} matcher_ready must be false`)
  if (row.publication_ready !== false) errors.push(`${prefix} publication_ready must be false`)
}

function confirmationRows(payload, errors) {
  const rows = []
  for (const row of payload.post_candidate_manual_review_decisions || []) {
    if (row.post_candidate_manual_review_confirmation_decision_candidate !== true) continue
    validateConfirmationRow(row, errors)
    if (isConfirmationCandidate(row)) rows.push(row)
    else errors.push(`${row.decision_id || '(missing post-confirmation decision)'} does not match expected post-confirmation candidate state`)
  }
  return rows
}

function afterPostConfirmationPolicy() {
  return {
    changes_official_standard_text: false,
    closure_candidate_is_not_publication_approval: true,
    confirmation_candidate_required_before_closure: true,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    inherited_combined_closure_candidate_preserved: true,
    manual_adoption_required: true,
    matcher_ready: false,
    official_close_ready_not_set: true,
    post_confirmation_candidate_is_not_bridge_approval: true,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function candidateEvidence(baseRow, confirmationRow, path) {
  const spec = confirmationSpec(confirmationRow)
  const summary = confirmationRow.confirmation_evidence_summary || {}
  return {
    action_candidate: path,
    action_decision_id: baseRow.decision_id || confirmationRow.downstream_action_decision_id || '',
    action_decision_status: confirmationRow.decision_status || '',
    action_reviewer_decision: confirmationRow.reviewer_decision || '',
    action_source_batch: confirmationRow.source_downstream_action_batch || '',
    candidate_type: spec?.candidateType || '',
    confirmation_evidence_packet: confirmationRow.confirmation_evidence_packet || '',
    confirmation_evidence_packet_item_id: confirmationRow.confirmation_evidence_packet_item_id || '',
    evidence_quality: confirmationRow.evidence_quality || '',
    manual_review_decision_id: confirmationRow.decision_id || '',
    page_evidence_status: summary.page_evidence_status || '',
    pdf_pages: summary.pdf_pages || [],
    selected_page_quality: summary.selected_page_quality || '',
    source_key: baseRow.source_key || confirmationRow.source_key || '',
    target_grade_band: confirmationRow.target_grade_band || baseRow.target_grade_band || baseRow.grade_band || '',
    target_standard_code: confirmationRow.target_standard_code || baseRow.target_standard_code || baseRow.standard_code || '',
    unit_evidence_id: confirmationRow.unit_evidence_id || baseRow.unit_evidence_id || '',
    unit_title: confirmationRow.unit_title || baseRow.unit_title || summary.unit_title || ''
  }
}

function applyPostConfirmationCandidate(baseRow, confirmationRow, path) {
  const spec = confirmationSpec(confirmationRow)
  return {
    ...baseRow,
    candidate_close_ready_after_manual_adoption: true,
    candidate_closure_lane: spec.lane,
    candidate_closure_status: CANDIDATE_STATUS,
    candidate_closure_type: spec.candidateType,
    candidate_next_gate: 'manual_adopt_post_candidate_confirmation_then_continue_downstream_review',
    downstream_action_closure_candidate: true,
    downstream_action_closure_candidate_evidence: candidateEvidence(baseRow, confirmationRow, path),
    downstream_action_closure_candidate_policy: afterPostConfirmationPolicy()
  }
}

function summarize(rows, postConfirmationRows, inheritedCandidateRows) {
  const allCandidates = rows.filter(row => row.downstream_action_closure_candidate === true)
  const summary = {
    auto_close_allowed_items: rows.filter(row => row.auto_close_allowed === true).length,
    by_candidate_lane: {},
    by_candidate_type: {},
    by_grade_band: {},
    by_post_confirmation_candidate_lane: {},
    by_post_confirmation_candidate_type: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    by_target_standard_code: {},
    candidate_close_ready_after_manual_adoption_items: allCandidates.filter(row => row.candidate_close_ready_after_manual_adoption === true).length,
    candidate_closure_items: allCandidates.length,
    close_ready_items: rows.filter(row => row.close_ready === true).length,
    closure_readiness_items: rows.length,
    expected_candidate_closure_items: inheritedCandidateRows.length + postConfirmationRows.length,
    expected_post_confirmation_candidate_closure_items: postConfirmationRows.length,
    inherited_combined_candidate_closure_items: inheritedCandidateRows.length,
    manual_confirmation_required_items: rows.filter(row => row.manual_confirmation_required === true).length,
    pending_manual_confirmation_items: rows.length - allCandidates.length,
    post_confirmation_candidate_closure_items: postConfirmationRows.length,
    unique_action_decisions: sorted(allCandidates.map(row => row.decision_id)).length,
    unique_post_confirmation_action_decisions: sorted(postConfirmationRows.map(row => row.downstream_action_decision_id)).length,
    unique_target_standard_codes: sorted(allCandidates.map(row => row.downstream_action_closure_candidate_evidence?.target_standard_code || row.target_standard_code || row.standard_code)).length,
    unique_unit_evidence_ids: sorted(allCandidates.map(row => row.downstream_action_closure_candidate_evidence?.unit_evidence_id || row.unit_evidence_id)).length
  }
  const postIds = new Set(postConfirmationRows.map(row => row.downstream_action_decision_id))
  for (const row of allCandidates) {
    countInto(summary.by_candidate_lane, row.candidate_closure_lane)
    countInto(summary.by_candidate_type, row.candidate_closure_type)
    countInto(summary.by_grade_band, row.grade_band || row.target_grade_band)
    countInto(summary.by_source_downstream_action_batch, row.source_downstream_action_batch)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.downstream_action_closure_candidate_evidence?.target_standard_code || row.target_standard_code || row.standard_code)
    if (postIds.has(row.decision_id)) {
      countInto(summary.by_post_confirmation_candidate_lane, row.candidate_closure_lane)
      countInto(summary.by_post_confirmation_candidate_type, row.candidate_closure_type)
    }
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
  return `# H4G Downstream Action Closure Candidates After Post-Confirmation

Generated at: ${payload.generated_at}

This read-only candidate starts from the existing combined closure candidate and
adds only body-text-reviewed post-candidate confirmation decisions. It does not
auto-close decisions, write \`public/data\`, enable matcher use, or approve
publication.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| closure readiness items | ${payload.summary.closure_readiness_items} |
| inherited combined candidate items | ${payload.summary.inherited_combined_candidate_closure_items} |
| post-confirmation candidate items | ${payload.summary.post_confirmation_candidate_closure_items} |
| candidate closure items | ${payload.summary.candidate_closure_items} |
| pending manual confirmation items | ${payload.summary.pending_manual_confirmation_items} |
| auto-close allowed items | ${payload.summary.auto_close_allowed_items} |
| official close-ready items | ${payload.summary.close_ready_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Candidate Types

| type | rows |
| --- | ---: |
${countRows(payload.summary.by_candidate_type)}

## Post-Confirmation Candidate Types

| type | rows |
| --- | ---: |
${countRows(payload.summary.by_post_confirmation_candidate_type)}

## Preview

| type | grade | subject | target standard | unit |
| --- | --- | --- | --- | --- |
${previewRows(candidates)}

## Guardrails

- Existing combined candidate rows are inherited, not recalculated.
- New rows must come from body-text-ready post-candidate confirmation decisions.
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
    combinedCandidate: args.combinedCandidate,
    confirmationCandidate: args.confirmationCandidate
  }
  for (const [label, path] of Object.entries(files)) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const closure = existsSync(args.closure) ? readJson(args.closure) : { closure_readiness_items: [] }
  const combined = existsSync(args.combinedCandidate) ? readJson(args.combinedCandidate) : { closure_readiness_items: [] }
  const confirmation = existsSync(args.confirmationCandidate) ? readJson(args.confirmationCandidate) : { post_candidate_manual_review_decisions: [] }
  if (!errors.length) {
    validateClosure(closure, args, errors)
    validateCombinedCandidate(combined, args, errors)
    validateConfirmationCandidate(confirmation, args, errors)
  }

  const closureById = mapBy(closure.closure_readiness_items || [], 'decision_id', errors, 'closure readiness')
  const combinedById = mapBy(combined.closure_readiness_items || [], 'decision_id', errors, 'combined closure candidate')
  if ((closure.closure_readiness_items || []).length !== (combined.closure_readiness_items || []).length) {
    errors.push('combined closure candidate row count must match closure readiness')
  }
  for (const decisionId of closureById.keys()) {
    if (!combinedById.has(decisionId)) errors.push(`${decisionId} missing from combined closure candidate`)
  }

  const postConfirmationRows = confirmationRows(confirmation, errors)
  const postConfirmationByActionId = new Map()
  for (const row of postConfirmationRows) {
    if (postConfirmationByActionId.has(row.downstream_action_decision_id)) {
      errors.push(`${row.downstream_action_decision_id} has duplicate post-confirmation candidates`)
      continue
    }
    postConfirmationByActionId.set(row.downstream_action_decision_id, row)
  }
  if (args.requireItems && !postConfirmationByActionId.size) {
    errors.push('requireItems is set but no post-confirmation closure candidates were found')
  }

  const rows = (combined.closure_readiness_items || []).map(row => {
    const confirmationRow = postConfirmationByActionId.get(row.decision_id)
    if (!confirmationRow) return row
    if (!closureById.has(row.decision_id)) errors.push(`${row.decision_id} post-confirmation candidate missing closure readiness source`)
    if (row.downstream_action_closure_candidate === true) {
      errors.push(`${row.decision_id} post-confirmation candidate was already in base combined candidate`)
    }
    if (row.auto_close_allowed !== false) errors.push(`${row.decision_id} auto_close_allowed must be false`)
    if (row.close_ready !== false) errors.push(`${row.decision_id} close_ready must be false`)
    if (row.manual_confirmation_required !== true) errors.push(`${row.decision_id} manual_confirmation_required must be true`)
    if (String(row.source_downstream_action_batch || '') !== String(confirmationRow.source_downstream_action_batch || '')) {
      errors.push(`${row.decision_id} source_downstream_action_batch mismatch`)
    }
    return applyPostConfirmationCandidate(row, confirmationRow, args.confirmationCandidate)
  })
  for (const actionId of postConfirmationByActionId.keys()) {
    if (!combinedById.has(actionId)) errors.push(`${actionId} post-confirmation action missing combined closure row`)
  }

  const inheritedCandidates = (combined.closure_readiness_items || []).filter(row => row.downstream_action_closure_candidate === true)
  return {
    ...combined,
    candidate_purpose: CANDIDATE_PURPOSE,
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
      ...(combined.source_action_decision_candidates || {}),
      post_candidate_manual_review_confirmation: args.confirmationCandidate
    },
    source_combined_closure_candidate: args.combinedCandidate,
    source_post_candidate_manual_review_confirmation_decisions_candidate: args.confirmationCandidate,
    summary: summarize(rows, postConfirmationRows, inheritedCandidates),
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
