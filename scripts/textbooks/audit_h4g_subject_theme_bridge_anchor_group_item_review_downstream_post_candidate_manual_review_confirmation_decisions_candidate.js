#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_CONFIRMATION_EVIDENCE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_decisions_candidate_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_decisions_candidate_anchor_domain_rejected_english_pe_audit.md'

const SOURCE_ROW_CONFIRM = 'confirm_source_row_for_later_action_gate'
const ITEM_LEVEL_CONFIRM = 'confirm_item_level_source_scope_for_later_action_gate'
const CANDIDATE_PURPOSE = 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_decisions_candidate'
const ALLOWED_CHANGED_ROW_FIELDS = new Set([
  'confirmation_decision_candidate_policy',
  'confirmation_evidence_packet',
  'confirmation_evidence_packet_item_id',
  'confirmation_evidence_summary',
  'decision_note',
  'decision_status',
  'evidence_quality',
  'exact_activity_or_task',
  'exact_evidence_note',
  'exact_evidence_quote',
  'exact_page_reference',
  'grade_specific_difference_note',
  'h4g_distinctiveness_note',
  'post_candidate_manual_review_confirmation_decision_candidate',
  'required_confirmations',
  'reviewed_at',
  'reviewed_by',
  'reviewer_decision',
  'reviewer_note'
])

function parseArgs(argv) {
  const args = {
    candidate: DEFAULT_CANDIDATE,
    confirmationEvidence: DEFAULT_CONFIRMATION_EVIDENCE,
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireComplete: false,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--confirmation-evidence') args.confirmationEvidence = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--require-complete') args.requireComplete = true
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_decisions_candidate.js \\
  --strict --require-items

Audits a post-candidate manual review confirmation decisions candidate. It
ensures only body-text-ready confirmation evidence rows are marked reviewed,
all other post-candidate manual review decision rows remain unchanged, and no
public/matcher/publication capability is introduced.`)
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

function sameJson(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right))
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

function validateCandidatePolicy(label, policy, errors) {
  for (const key of [
    'confirmation_candidate_is_not_bridge_approval',
    'confirmation_candidate_requires_later_action_gate',
    'confirmation_evidence_body_text_required',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'source_decision_template_not_mutated'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function validateSourceDecisions(decisions, args, errors) {
  if (decisions.valid !== true) errors.push('source decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('source decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template') {
    errors.push('source decisions purpose mismatch')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template') {
    errors.push('source decisions data_scope mismatch')
  }
  validatePolicy('source decisions', decisions, errors)
  if (!Array.isArray(decisions.post_candidate_manual_review_decisions)) {
    errors.push('source decisions post_candidate_manual_review_decisions must be an array')
  }
  if (args.requireItems && !(decisions.post_candidate_manual_review_decisions || []).length) {
    errors.push('requireItems is set but source decisions has no rows')
  }
}

function validateConfirmationEvidence(packet, args, errors) {
  if (packet.valid !== true) errors.push('confirmation evidence packet valid must be true')
  if ((packet.errors || []).length) errors.push('confirmation evidence packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_evidence_packet') {
    errors.push('confirmation evidence packet purpose mismatch')
  }
  if (packet.confirmation_evidence_packet_only !== true) errors.push('confirmation evidence packet confirmation_evidence_packet_only must be true')
  if (packet.review_only !== true) errors.push('confirmation evidence packet review_only must be true')
  validatePolicy('confirmation evidence packet', packet, errors)
  if (!Array.isArray(packet.confirmation_evidence_items)) {
    errors.push('confirmation evidence packet confirmation_evidence_items must be an array')
  }
  if (args.requireItems && !(packet.confirmation_evidence_items || []).length) {
    errors.push('requireItems is set but confirmation evidence packet has no items')
  }
}

function validateCandidateTopLevel(candidate, args, errors) {
  if (candidate.valid !== true) errors.push('candidate valid must be true')
  if ((candidate.errors || []).length) errors.push('candidate errors must be empty')
  if (candidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template') {
    errors.push('candidate purpose should preserve manual review decisions template purpose')
  }
  if (candidate.candidate_purpose !== CANDIDATE_PURPOSE) errors.push('candidate candidate_purpose mismatch')
  if (candidate.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template') {
    errors.push('candidate data_scope mismatch')
  }
  if (candidate.source_decisions_template !== args.decisions) errors.push('candidate source_decisions_template must match audit arg')
  if (candidate.source_confirmation_evidence_packet !== args.confirmationEvidence) {
    errors.push('candidate source_confirmation_evidence_packet must match audit arg')
  }
  if (candidate.review_only !== true) errors.push('candidate review_only must be true')
  if (candidate.publication_candidate !== false) errors.push('candidate publication_candidate must be false')
  validatePolicy('candidate', candidate, errors)
  validateCandidatePolicy('candidate candidate_policy', candidate.candidate_policy || {}, errors)
  if (!Array.isArray(candidate.post_candidate_manual_review_decisions)) {
    errors.push('candidate post_candidate_manual_review_decisions must be an array')
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

function bodyExcerpt(item) {
  const excerpt = (item.page_text_excerpts || [])
    .find(row => row && row.status === 'text_extracted' && row.is_toc_like !== true && String(row.text_excerpt || '').trim())
  return String(excerpt?.text_excerpt || '').replace(/\s+/g, ' ').trim()
}

function expectedDecision(item) {
  if (item.source_downstream_action_batch === 'source_row_confirmation') return SOURCE_ROW_CONFIRM
  if (item.source_downstream_action_batch === 'item_level_source_review') return ITEM_LEVEL_CONFIRM
  return item.recommended_reviewer_decision_to_consider || ''
}

function validateUnchangedExceptAllowed(base, candidate, errors) {
  const prefix = candidate.manual_review_packet_item_id || base.manual_review_packet_item_id || '(missing manual review item)'
  const keys = sorted([...Object.keys(base || {}), ...Object.keys(candidate || {})])
  for (const key of keys) {
    if (ALLOWED_CHANGED_ROW_FIELDS.has(key)) continue
    if (!sameJson(base[key], candidate[key])) errors.push(`${prefix} field ${key} changed unexpectedly`)
  }
}

function requireTrue(confirmations, key, prefix, errors) {
  if (confirmations[key] !== true) errors.push(`${prefix} required_confirmations.${key} must be true`)
}

function validReviewDate(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value || ''))
}

function validateEvidenceItem(item, errors) {
  const prefix = item.confirmation_evidence_packet_item_id || item.manual_review_packet_item_id || '(missing confirmation evidence item)'
  if (item.body_text_ready !== true) errors.push(`${prefix} body_text_ready must be true`)
  if (item.ready_for_manual_review !== true) errors.push(`${prefix} ready_for_manual_review must be true`)
  if (item.page_evidence_status !== 'text_extracted') errors.push(`${prefix} page_evidence_status must be text_extracted`)
  if (item.selected_page_quality !== 'body_text_ready') errors.push(`${prefix} selected_page_quality must be body_text_ready`)
  if (Number(item.nonempty_body_text_page_count || 0) <= 0) errors.push(`${prefix} nonempty_body_text_page_count must be positive`)
  if (!bodyExcerpt(item)) errors.push(`${prefix} must include a non-TOC body text excerpt`)
}

function validateCandidateRow(base, row, item, args, errors, summary) {
  const prefix = row.manual_review_packet_item_id || '(missing manual review packet item)'
  validateUnchangedExceptAllowed(base, row, errors)
  validateEvidenceItem(item, errors)
  const reviewerDecision = expectedDecision(item)
  if (!reviewerDecision) errors.push(`${prefix} expected reviewer decision missing`)
  if (base.reviewer_decision !== 'pending') errors.push(`${prefix} source decision must be pending`)
  if (base.decision_status !== 'pending') errors.push(`${prefix} source decision_status must be pending`)
  if (base.evidence_packet_source !== 'bounded_source_evidence_packet') {
    errors.push(`${prefix} source decision must come from bounded_source_evidence_packet`)
  }
  if (row.reviewer_decision !== reviewerDecision) errors.push(`${prefix} reviewer_decision mismatch`)
  if (row.decision_status !== 'reviewed') errors.push(`${prefix} decision_status must be reviewed`)
  if (!validReviewDate(row.reviewed_at)) errors.push(`${prefix} reviewed_at must start with YYYY-MM-DD`)
  if (!row.reviewed_by) errors.push(`${prefix} reviewed_by is required`)
  if (!row.decision_note && !row.reviewer_note) errors.push(`${prefix} decision_note or reviewer_note is required`)
  if (row.confirmation_evidence_packet !== args.confirmationEvidence) errors.push(`${prefix} confirmation_evidence_packet mismatch`)
  if (row.confirmation_evidence_packet_item_id !== item.confirmation_evidence_packet_item_id) {
    errors.push(`${prefix} confirmation_evidence_packet_item_id mismatch`)
  }
  if (row.post_candidate_manual_review_confirmation_decision_candidate !== true) {
    errors.push(`${prefix} post_candidate_manual_review_confirmation_decision_candidate must be true`)
  }
  if (row.evidence_quality !== 'body_text_ready_confirmation_evidence') {
    errors.push(`${prefix} evidence_quality must be body_text_ready_confirmation_evidence`)
  }
  if (!String(row.exact_evidence_quote || '').trim()) errors.push(`${prefix} exact_evidence_quote is required`)
  if (!String(row.exact_page_reference || '').includes('body_text_ready')) {
    errors.push(`${prefix} exact_page_reference must mention body_text_ready`)
  }
  const evidenceSummary = row.confirmation_evidence_summary || {}
  if (evidenceSummary.body_text_ready !== true) errors.push(`${prefix} evidence summary body_text_ready must be true`)
  if (evidenceSummary.ready_for_manual_review !== true) errors.push(`${prefix} evidence summary ready_for_manual_review must be true`)
  if (evidenceSummary.selected_page_quality !== 'body_text_ready') {
    errors.push(`${prefix} evidence summary selected_page_quality must be body_text_ready`)
  }
  if (Number(evidenceSummary.nonempty_body_text_page_count || 0) <= 0) {
    errors.push(`${prefix} evidence summary nonempty_body_text_page_count must be positive`)
  }
  const policy = row.confirmation_decision_candidate_policy || {}
  validateCandidatePolicy(`${prefix}.confirmation_decision_candidate_policy`, policy, errors)
  const confirmations = row.required_confirmations || {}
  for (const key of [
    'direct_matcher_use_rejected',
    'evidence_packet_source_confirmed',
    'h4g_grade_distinctiveness_checked',
    'later_action_decision_gate_required',
    'later_matcher_gate_required',
    'later_publication_gate_required',
    'manual_review_packet_not_treated_as_approval',
    'no_public_write_requested',
    'official_standard_text_preserved',
    'page_evidence_checked',
    'reviewer_note_records_exact_basis',
    'same_grade_scope_checked',
    'same_subject_scope_checked',
    'source_item_or_anchor_reviewed',
    'target_standard_specificity_checked'
  ]) {
    requireTrue(confirmations, key, prefix, errors)
  }
  for (const field of [
    'manual_review_packet_item_id',
    'standard_code',
    'target_standard_code',
    'grade_band',
    'subject_slug',
    'unit_evidence_id',
    'source_downstream_action_batch'
  ]) {
    const expected = field === 'target_standard_code' ? item.target_standard_code || item.standard_code : item[field]
    if (String(row[field] || '') !== String(expected || '')) errors.push(`${prefix} ${field} mismatch with evidence item`)
  }
  summary.candidate_decisions += 1
  summary.completed_decisions += 1
  countInto(summary.by_candidate_grade_band, row.grade_band)
  countInto(summary.by_candidate_reviewer_decision, row.reviewer_decision)
  countInto(summary.by_candidate_source_downstream_action_batch, row.source_downstream_action_batch)
  countInto(summary.by_candidate_subject, row.subject_slug)
}

function validateUnchangedRow(base, row, errors, summary) {
  const prefix = row.manual_review_packet_item_id || base.manual_review_packet_item_id || '(missing manual review packet item)'
  if (!sameJson(base, row)) {
    summary.changed_non_candidate_decisions += 1
    errors.push(`${prefix} non-candidate row changed`)
  }
  if (row.reviewer_decision === 'pending') summary.pending_decisions += 1
  else summary.completed_decisions += 1
  if (row.evidence_packet_source === 'source_anchor_exact_evidence_packet' && row.reviewer_decision === 'pending') {
    summary.source_anchor_exact_decisions_left_pending += 1
  }
}

function summarize(sourceRows, candidateRows, evidenceRows) {
  return {
    audited_decisions: 0,
    by_candidate_grade_band: {},
    by_candidate_reviewer_decision: {},
    by_candidate_source_downstream_action_batch: {},
    by_candidate_subject: {},
    candidate_decisions: 0,
    changed_non_candidate_decisions: 0,
    completed_decisions: 0,
    confirmation_evidence_items: evidenceRows.length,
    decision_template_rows: candidateRows.length,
    expected_candidate_decisions: evidenceRows.length,
    extra_decisions: 0,
    missing_decisions: 0,
    pending_decisions: 0,
    source_anchor_exact_decisions_left_pending: 0,
    source_decision_rows: sourceRows.length,
    unique_candidate_action_decisions: 0,
    unique_candidate_progression_groups: 0,
    unique_candidate_standard_codes: 0,
    unique_candidate_unit_evidence_ids: 0
  }
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Manual Review Confirmation Decisions Candidate Audit

Generated at: ${payload.generated_at}

Candidate: \`${payload.candidate}\`

Source decisions: \`${payload.decisions}\`

Confirmation evidence: \`${payload.confirmation_evidence}\`

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| source decision rows | ${payload.summary.source_decision_rows} |
| candidate decision rows | ${payload.summary.decision_template_rows} |
| confirmation evidence items | ${payload.summary.confirmation_evidence_items} |
| expected candidate decisions | ${payload.summary.expected_candidate_decisions} |
| audited decisions | ${payload.summary.audited_decisions} |
| candidate decisions | ${payload.summary.candidate_decisions} |
| completed decisions | ${payload.summary.completed_decisions} |
| pending decisions | ${payload.summary.pending_decisions} |
| source-anchor exact decisions left pending | ${payload.summary.source_anchor_exact_decisions_left_pending} |
| changed non-candidate decisions | ${payload.summary.changed_non_candidate_decisions} |
| missing decisions | ${payload.summary.missing_decisions} |
| extra decisions | ${payload.summary.extra_decisions} |
| unique candidate standard codes | ${payload.summary.unique_candidate_standard_codes} |

## Candidate Reviewer Decisions

| reviewer decision | rows |
| --- | ---: |
${countRows(payload.summary.by_candidate_reviewer_decision)}

## Candidate Subjects

| subject | rows |
| --- | ---: |
${countRows(payload.summary.by_candidate_subject)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const source = readJson(args.decisions)
  const candidate = readJson(args.candidate)
  const confirmationEvidence = readJson(args.confirmationEvidence)
  validateSourceDecisions(source, args, errors)
  validateCandidateTopLevel(candidate, args, errors)
  validateConfirmationEvidence(confirmationEvidence, args, errors)

  const sourceRows = source.post_candidate_manual_review_decisions || []
  const candidateRows = candidate.post_candidate_manual_review_decisions || []
  const evidenceRows = confirmationEvidence.confirmation_evidence_items || []
  const summary = summarize(sourceRows, candidateRows, evidenceRows)
  const sourceById = mapBy(sourceRows, 'manual_review_packet_item_id', errors, 'source decisions')
  const candidateById = mapBy(candidateRows, 'manual_review_packet_item_id', errors, 'candidate')
  const evidenceById = mapBy(evidenceRows, 'manual_review_packet_item_id', errors, 'confirmation evidence')

  for (const id of sourceById.keys()) {
    if (!candidateById.has(id)) {
      summary.missing_decisions += 1
      errors.push(`missing candidate decision for ${id}`)
    }
  }
  for (const id of candidateById.keys()) {
    if (!sourceById.has(id)) {
      summary.extra_decisions += 1
      errors.push(`extra candidate decision without source row ${id}`)
    }
  }

  for (const [id, base] of sourceById.entries()) {
    const row = candidateById.get(id)
    if (!row) continue
    summary.audited_decisions += 1
    const evidenceItem = evidenceById.get(id)
    if (evidenceItem) validateCandidateRow(base, row, evidenceItem, args, errors, summary)
    else validateUnchangedRow(base, row, errors, summary)
  }

  const candidateOnlyRows = candidateRows.filter(row => row.post_candidate_manual_review_confirmation_decision_candidate === true)
  summary.unique_candidate_action_decisions = sorted(candidateOnlyRows.map(row => row.downstream_action_decision_id)).length
  summary.unique_candidate_progression_groups = sorted(candidateOnlyRows.map(row => row.progression_group_id)).length
  summary.unique_candidate_standard_codes = sorted(candidateOnlyRows.map(row => row.standard_code)).length
  summary.unique_candidate_unit_evidence_ids = sorted(candidateOnlyRows.map(row => row.unit_evidence_id)).length

  if (args.requireItems && summary.candidate_decisions === 0) {
    errors.push('requireItems is set but no candidate decisions were audited')
  }
  if (summary.decision_template_rows !== summary.source_decision_rows) {
    errors.push(`candidate row count must match source row count: ${summary.decision_template_rows} vs ${summary.source_decision_rows}`)
  }
  if (summary.candidate_decisions !== summary.expected_candidate_decisions) {
    errors.push(`candidate decisions must match evidence item count: ${summary.candidate_decisions} vs ${summary.expected_candidate_decisions}`)
  }
  if (summary.changed_non_candidate_decisions !== 0) {
    errors.push(`non-candidate rows changed: ${summary.changed_non_candidate_decisions}`)
  }
  if (args.requireComplete && summary.pending_decisions > 0) {
    errors.push(`requireComplete is set but ${summary.pending_decisions} decisions remain pending`)
  }

  const payload = {
    candidate: args.candidate,
    changes_official_standard_text: false,
    confirmation_evidence: args.confirmationEvidence,
    decisions: args.decisions,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    require_complete: args.requireComplete,
    require_items: args.requireItems,
    summary,
    valid: errors.length === 0,
    writes_public_data: false
  }
  writeJson(args.out, payload)
  writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(payload, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
