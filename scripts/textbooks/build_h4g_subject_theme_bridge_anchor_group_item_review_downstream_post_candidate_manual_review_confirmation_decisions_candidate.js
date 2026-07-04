#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_CONFIRMATION_EVIDENCE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_decisions_candidate_anchor_domain_rejected_english_pe.md'

const SOURCE_ROW_CONFIRM = 'confirm_source_row_for_later_action_gate'
const ITEM_LEVEL_CONFIRM = 'confirm_item_level_source_scope_for_later_action_gate'
const CANDIDATE_PURPOSE = 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_decisions_candidate'

function parseArgs(argv) {
  const args = {
    confirmationEvidence: DEFAULT_CONFIRMATION_EVIDENCE,
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireItems: false,
    reviewedAt: new Date().toISOString().slice(0, 10),
    reviewedBy: 'Codex post-candidate confirmation decision candidate',
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--confirmation-evidence') args.confirmationEvidence = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_decisions_candidate.js \\
  --strict --require-items

Builds a non-public post-candidate manual review decisions candidate from the
body-text-ready confirmation evidence packet. It only marks the 15 bounded
source/source-row confirmation rows as reviewed candidates for a later action
gate. It does not write public/data, change official standard text, approve
bridges, or enable matcher/publication use.`)
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

function candidatePolicy() {
  return {
    changes_official_standard_text: false,
    confirmation_candidate_is_not_bridge_approval: true,
    confirmation_candidate_requires_later_action_gate: true,
    confirmation_evidence_body_text_required: true,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    source_decision_template_not_mutated: true,
    writes_public_data: false
  }
}

function validateDecisions(decisions, args, errors) {
  if (decisions.valid !== true) errors.push('source decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('source decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template') {
    errors.push('source decisions purpose mismatch')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template') {
    errors.push('source decisions data_scope mismatch')
  }
  if (decisions.decision_template_only !== true) errors.push('source decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('source decisions editable_manual_review_template must be true')
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

function pageReference(item) {
  const pages = [...new Set((item.page_text_excerpts || [])
    .filter(row => row && row.status === 'text_extracted' && row.is_toc_like !== true)
    .map(row => Number(row.pdf_page))
    .filter(page => Number.isFinite(page)))]
    .sort((a, b) => a - b)
  const pageText = pages.length ? `PDF page(s) ${pages.join(', ')}` : `PDF page(s) ${(item.pdf_pages || []).join(', ')}`
  return `${pageText}; page_hint_source=${item.page_hint_source || 'missing'}; selected_page_quality=${item.selected_page_quality || 'missing'}`
}

function expectedDecision(item) {
  if (item.source_downstream_action_batch === 'source_row_confirmation') return SOURCE_ROW_CONFIRM
  if (item.source_downstream_action_batch === 'item_level_source_review') return ITEM_LEVEL_CONFIRM
  return item.recommended_reviewer_decision_to_consider || ''
}

function validateEvidenceItem(item, decision, errors) {
  const prefix = item.confirmation_evidence_packet_item_id || item.manual_review_packet_item_id || '(missing confirmation evidence item)'
  if (!decision) {
    errors.push(`${prefix} missing matching manual review decision`)
    return
  }
  const reviewerDecision = expectedDecision(item)
  if (!reviewerDecision) errors.push(`${prefix} cannot derive expected reviewer decision`)
  if (!(decision.allowed_decisions || []).includes(reviewerDecision)) {
    errors.push(`${prefix} source decision does not allow ${reviewerDecision}`)
  }
  if (decision.reviewer_decision !== 'pending') errors.push(`${prefix} source decision must still be pending`)
  if (decision.decision_status !== 'pending') errors.push(`${prefix} source decision_status must still be pending`)
  if (decision.evidence_packet_source !== 'bounded_source_evidence_packet') {
    errors.push(`${prefix} source decision must come from bounded_source_evidence_packet`)
  }
  for (const [field, expected] of [
    ['manual_review_packet_item_id', item.manual_review_packet_item_id],
    ['standard_code', item.standard_code],
    ['target_standard_code', item.target_standard_code || item.standard_code],
    ['grade_band', item.grade_band],
    ['subject_slug', item.subject_slug],
    ['unit_evidence_id', item.unit_evidence_id],
    ['source_downstream_action_batch', item.source_downstream_action_batch]
  ]) {
    if (String(decision[field] || '') !== String(expected || '')) {
      errors.push(`${prefix} source decision ${field} mismatch`)
    }
  }
  if (item.body_text_ready !== true) errors.push(`${prefix} body_text_ready must be true`)
  if (item.ready_for_manual_review !== true) errors.push(`${prefix} ready_for_manual_review must be true`)
  if (item.page_evidence_status !== 'text_extracted') errors.push(`${prefix} page_evidence_status must be text_extracted`)
  if (item.selected_page_quality !== 'body_text_ready') errors.push(`${prefix} selected_page_quality must be body_text_ready`)
  if (Number(item.nonempty_body_text_page_count || 0) <= 0) errors.push(`${prefix} nonempty_body_text_page_count must be positive`)
  if (Number(item.toc_like_page_count || 0) > 0 && Number(item.nonempty_body_text_page_count || 0) <= 0) {
    errors.push(`${prefix} cannot be toc-only`)
  }
  if (!bodyExcerpt(item)) errors.push(`${prefix} must include a non-TOC body text excerpt`)
}

function decisionNote(row, item) {
  return [
    `Confirmation decision candidate for ${row.standard_code} (${row.grade_band}) using ${item.unit_title || row.unit_title || 'unit evidence'}.`,
    `${pageReference(item)}.`,
    'This confirms the bounded source/manual review row for a later action gate only; it is not bridge approval, matcher readiness, publication readiness, or a public data change.'
  ].join(' ')
}

function reviewerNote(row, item) {
  const excerpt = bodyExcerpt(item)
  return [
    `Body-text-ready evidence packet item ${item.confirmation_evidence_packet_item_id || ''} supports manual confirmation for ${row.source_downstream_action_batch}.`,
    `Evidence excerpt: ${truncate(excerpt, 260)}`
  ].join(' ')
}

function applyCandidateDecision(row, item, args) {
  const reviewerDecision = expectedDecision(item)
  const excerpt = bodyExcerpt(item)
  return {
    ...row,
    confirmation_decision_candidate_policy: candidatePolicy(),
    confirmation_evidence_packet: args.confirmationEvidence,
    confirmation_evidence_packet_item_id: item.confirmation_evidence_packet_item_id || '',
    confirmation_evidence_summary: {
      body_text_ready: item.body_text_ready === true,
      first_body_text_excerpt: truncate(excerpt, 360),
      nonempty_body_text_page_count: Number(item.nonempty_body_text_page_count || 0),
      page_evidence_status: item.page_evidence_status || '',
      page_hint_source: item.page_hint_source || '',
      pdf_pages: item.pdf_pages || [],
      ready_for_manual_review: item.ready_for_manual_review === true,
      selected_page_quality: item.selected_page_quality || '',
      toc_like_page_count: Number(item.toc_like_page_count || 0),
      unit_title: item.unit_title || row.unit_title || ''
    },
    decision_note: decisionNote(row, item),
    decision_status: 'reviewed',
    evidence_quality: 'body_text_ready_confirmation_evidence',
    exact_activity_or_task: item.unit_title || row.unit_title || '',
    exact_evidence_note: `Body text evidence is available for ${item.unit_title || row.unit_title || row.unit_evidence_id}.`,
    exact_evidence_quote: truncate(excerpt, 260),
    exact_page_reference: pageReference(item),
    grade_specific_difference_note: 'H4G7 confirmation candidate only; sibling grade distinctiveness still requires later action/matcher/publication gates.',
    h4g_distinctiveness_note: 'Checked as a manual-review candidate boundary, not as final product-ready grade differentiation.',
    post_candidate_manual_review_confirmation_decision_candidate: true,
    required_confirmations: {
      ...(row.required_confirmations || {}),
      direct_matcher_use_rejected: true,
      evidence_packet_source_confirmed: true,
      h4g_grade_distinctiveness_checked: true,
      later_action_decision_gate_required: true,
      later_matcher_gate_required: true,
      later_publication_gate_required: true,
      manual_review_packet_not_treated_as_approval: true,
      no_public_write_requested: true,
      official_standard_text_preserved: true,
      page_evidence_checked: true,
      reviewer_note_records_exact_basis: true,
      same_grade_scope_checked: true,
      same_subject_scope_checked: true,
      source_item_or_anchor_reviewed: true,
      target_standard_specificity_checked: true
    },
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewedBy,
    reviewer_decision: reviewerDecision,
    reviewer_note: reviewerNote(row, item)
  }
}

function summarize(rows) {
  const summary = {
    by_candidate_grade_band: {},
    by_candidate_reviewer_decision: {},
    by_candidate_source_downstream_action_batch: {},
    by_candidate_subject: {},
    by_decision_status: {},
    by_evidence_packet_source: {},
    by_reviewer_decision: {},
    candidate_decisions: 0,
    completed_decisions: 0,
    decision_template_rows: rows.length,
    pending_decisions: 0,
    post_candidate_manual_review_confirmation_decision_candidates: 0,
    source_anchor_exact_decisions_left_pending: 0,
    unique_candidate_action_decisions: 0,
    unique_candidate_progression_groups: 0,
    unique_candidate_standard_codes: 0,
    unique_candidate_unit_evidence_ids: 0
  }
  const candidates = []
  for (const row of rows) {
    countInto(summary.by_decision_status, row.decision_status)
    countInto(summary.by_evidence_packet_source, row.evidence_packet_source)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    if (row.reviewer_decision === 'pending') summary.pending_decisions += 1
    else summary.completed_decisions += 1
    if (row.evidence_packet_source === 'source_anchor_exact_evidence_packet' && row.reviewer_decision === 'pending') {
      summary.source_anchor_exact_decisions_left_pending += 1
    }
    if (row.post_candidate_manual_review_confirmation_decision_candidate === true) {
      candidates.push(row)
      summary.candidate_decisions += 1
      summary.post_candidate_manual_review_confirmation_decision_candidates += 1
      countInto(summary.by_candidate_grade_band, row.grade_band)
      countInto(summary.by_candidate_reviewer_decision, row.reviewer_decision)
      countInto(summary.by_candidate_source_downstream_action_batch, row.source_downstream_action_batch)
      countInto(summary.by_candidate_subject, row.subject_slug)
    }
  }
  summary.unique_candidate_action_decisions = sorted(candidates.map(row => row.downstream_action_decision_id)).length
  summary.unique_candidate_progression_groups = sorted(candidates.map(row => row.progression_group_id)).length
  summary.unique_candidate_standard_codes = sorted(candidates.map(row => row.standard_code)).length
  summary.unique_candidate_unit_evidence_ids = sorted(candidates.map(row => row.unit_evidence_id)).length
  return summary
}

function markdownSummary(payload) {
  const candidateRows = (payload.post_candidate_manual_review_decisions || [])
    .filter(row => row.post_candidate_manual_review_confirmation_decision_candidate === true)
    .map(row => `| ${markdownCell(row.worklist_rank)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.source_downstream_action_batch)} | ${markdownCell(row.reviewer_decision)} | ${truncate(row.unit_title)} |`)
    .join('\n') || '| - | - | - | - | - | - | - |'

  return `# H4G Post-Candidate Manual Review Confirmation Decisions Candidate

Generated at: ${payload.generated_at}

Source decisions: \`${payload.source_decisions_template}\`

Confirmation evidence: \`${payload.source_confirmation_evidence_packet}\`

This is a non-public decisions candidate. It marks only body-text-ready bounded
source/source-row confirmation rows as reviewed for a later action gate. It is
not bridge approval, matcher readiness, publication readiness, or a public data
write.

## Summary

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| decision rows | ${payload.summary.decision_template_rows} |
| candidate decisions | ${payload.summary.candidate_decisions} |
| completed decisions | ${payload.summary.completed_decisions} |
| pending decisions | ${payload.summary.pending_decisions} |
| source-anchor exact decisions left pending | ${payload.summary.source_anchor_exact_decisions_left_pending} |
| unique candidate standard codes | ${payload.summary.unique_candidate_standard_codes} |

## Candidate Reviewer Decisions

| reviewer decision | rows |
| --- | ---: |
${countRows(payload.summary.by_candidate_reviewer_decision)}

## Candidate Rows

| rank | subject | grade | standard | source batch | decision | unit |
| ---: | --- | --- | --- | --- | --- | --- |
${candidateRows}

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
  const decisions = readJson(args.decisions)
  const confirmationEvidence = readJson(args.confirmationEvidence)
  validateDecisions(decisions, args, errors)
  validateConfirmationEvidence(confirmationEvidence, args, errors)

  const sourceRows = decisions.post_candidate_manual_review_decisions || []
  const evidenceRows = confirmationEvidence.confirmation_evidence_items || []
  const sourceByManualReviewItem = mapBy(sourceRows, 'manual_review_packet_item_id', errors, 'source decisions')
  const evidenceByManualReviewItem = mapBy(evidenceRows, 'manual_review_packet_item_id', errors, 'confirmation evidence')
  for (const item of evidenceRows) {
    validateEvidenceItem(item, sourceByManualReviewItem.get(item.manual_review_packet_item_id), errors)
  }

  const candidateRows = sourceRows.map(row => {
    const item = evidenceByManualReviewItem.get(row.manual_review_packet_item_id)
    return item ? applyCandidateDecision(row, item, args) : row
  })
  const summary = summarize(candidateRows)

  if (args.requireItems && summary.candidate_decisions === 0) {
    errors.push('requireItems is set but no confirmation decision candidates were generated')
  }
  if (summary.candidate_decisions !== Number(confirmationEvidence.summary?.confirmation_evidence_items || evidenceRows.length || 0)) {
    errors.push(`candidate decisions must match confirmation evidence items: ${summary.candidate_decisions} vs ${confirmationEvidence.summary?.confirmation_evidence_items ?? evidenceRows.length}`)
  }
  if (summary.pending_decisions + summary.completed_decisions !== summary.decision_template_rows) {
    errors.push('pending plus completed decisions must equal decision rows')
  }

  const payload = {
    ...decisions,
    candidate_policy: candidatePolicy(),
    candidate_purpose: CANDIDATE_PURPOSE,
    errors,
    generated_at: new Date().toISOString(),
    post_candidate_manual_review_decisions: candidateRows,
    publication_candidate: false,
    review_only: true,
    source_confirmation_evidence_packet: args.confirmationEvidence,
    source_decisions_template: args.decisions,
    summary,
    valid: errors.length === 0
  }

  writeJson(args.out, payload)
  writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(payload, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
