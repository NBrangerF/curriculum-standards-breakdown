#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template_anchor_domain_rejected_english_pe.md'

const DECISION_PENDING = 'pending'
const DECISION_NEEDS_REVISION = 'needs_revision_or_more_evidence'
const DECISION_SUPERSEDED = 'out_of_scope_duplicate_or_superseded'
const SOURCE_ANCHOR_CONFIRM = 'confirm_source_anchor_exact_evidence_for_later_action_gate'
const SOURCE_ANCHOR_REJECT = 'reject_source_anchor_exact_evidence'
const SOURCE_ROW_CONFIRM = 'confirm_source_row_for_later_action_gate'
const SOURCE_ROW_REJECT = 'reject_source_row_confirmation'
const ITEM_LEVEL_CONFIRM = 'confirm_item_level_source_scope_for_later_action_gate'
const ITEM_LEVEL_REJECT = 'reject_item_level_source_scope'

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template.js \\
  --strict --require-items

Builds an editable decisions template from the unified post-candidate manual
review packet. Every row starts pending. This template records manual review
outcomes only; it does not approve bridges, write public/data, change official
standard text, or enable matcher/publication use.`)
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

function truncate(value, max = 112) {
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

function validatePacket(packet, args, errors) {
  if (packet.valid !== true) errors.push('packet valid must be true')
  if ((packet.errors || []).length) errors.push('packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_packet') {
    errors.push('packet purpose mismatch')
  }
  if (packet.manual_review_packet_only !== true) errors.push('packet manual_review_packet_only must be true')
  if (packet.review_only !== true) errors.push('packet review_only must be true')
  if (!Array.isArray(packet.manual_review_items)) errors.push('packet manual_review_items must be an array')
  if (args.requireItems && !(packet.manual_review_items || []).length) {
    errors.push('requireItems is set but packet has no manual review items')
  }
  validatePolicy('packet', packet, errors)
}

function decisionPolicy() {
  return {
    changes_official_standard_text: false,
    decision_template_only: true,
    direct_matcher_use: false,
    editable_manual_review_template: true,
    eligible_for_h4g_differentiation: false,
    manual_review_decision_is_not_bridge_approval: true,
    manual_review_decision_requires_later_action_gate: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function allowedDecisions(item) {
  const batch = item.source_downstream_action_batch || ''
  if (batch === 'source_anchor_evidence') {
    return [DECISION_PENDING, SOURCE_ANCHOR_CONFIRM, SOURCE_ANCHOR_REJECT, DECISION_NEEDS_REVISION, DECISION_SUPERSEDED]
  }
  if (batch === 'source_row_confirmation') {
    return [DECISION_PENDING, SOURCE_ROW_CONFIRM, SOURCE_ROW_REJECT, DECISION_NEEDS_REVISION, DECISION_SUPERSEDED]
  }
  if (batch === 'item_level_source_review') {
    return [DECISION_PENDING, ITEM_LEVEL_CONFIRM, ITEM_LEVEL_REJECT, DECISION_NEEDS_REVISION, DECISION_SUPERSEDED]
  }
  return [DECISION_PENDING, DECISION_NEEDS_REVISION, DECISION_SUPERSEDED]
}

function requiredConfirmations() {
  return {
    direct_matcher_use_rejected: true,
    evidence_packet_source_confirmed: false,
    h4g_grade_distinctiveness_checked: false,
    later_action_decision_gate_required: true,
    later_matcher_gate_required: true,
    later_publication_gate_required: true,
    manual_review_packet_not_treated_as_approval: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    page_evidence_checked: false,
    reviewer_note_records_exact_basis: false,
    same_grade_scope_checked: false,
    same_subject_scope_checked: false,
    source_item_or_anchor_reviewed: false,
    target_standard_specificity_checked: false
  }
}

function decisionId(item) {
  return `h4g_anchor_group_post_candidate_manual_review_decision_${hashText(item.manual_review_packet_item_id)}`
}

function sourceReviewPrompt(item) {
  const source = item.evidence_packet_source || ''
  if (source === 'source_anchor_exact_evidence_packet') {
    return [
      'Does the page evidence explicitly prove the target standard, not only the broad topic?',
      'Is the evidence same-grade and same-subject for this H4G record?',
      'What exact activity, task, language function, movement skill, health behavior, or cultural objective is visible?',
      'Does the evidence distinguish this H4G grade from sibling H4G records?'
    ]
  }
  if (item.source_downstream_action_batch === 'source_row_confirmation') {
    return [
      'Does this single source row prove the target anchor for the same standard and grade?',
      'Is the source bounded enough to proceed to a later action gate?',
      'Which exact source behavior or skill supports the target standard?'
    ]
  }
  if (item.source_downstream_action_batch === 'item_level_source_review') {
    return [
      'Does this item-level source scope belong to the target grade and standard?',
      'Is the unit evidence specific enough to avoid fan-out across sibling standards?',
      'Which exact unit activity, source item, or page evidence supports the decision?'
    ]
  }
  return ['Review the evidence packet and record the exact basis for any non-pending decision.']
}

function decisionFromManualReviewItem(item) {
  return {
    allowed_decisions: allowedDecisions(item),
    anchor_requirement_summary: item.anchor_requirement_summary || '',
    changes_official_standard_text: false,
    decision_id: decisionId(item),
    decision_note: '',
    decision_policy: decisionPolicy(),
    decision_status: 'pending',
    decision_type: 'h4g_anchor_group_post_candidate_manual_review_decision',
    direct_matcher_use: false,
    downstream_action_decision_id: item.downstream_action_decision_id || '',
    evidence_lane: item.evidence_lane || '',
    evidence_packet_item_id: item.evidence_packet_item_id || '',
    evidence_packet_source: item.evidence_packet_source || '',
    evidence_ready: item.evidence_ready === true,
    eligible_for_h4g_differentiation: false,
    evidence_quality: '',
    exact_activity_or_task: '',
    exact_evidence_note: '',
    exact_evidence_quote: '',
    exact_page_reference: '',
    grade_band: item.grade_band || '',
    grade_specific_difference_note: '',
    h4g_distinctiveness_note: '',
    inventory_bucket: item.inventory_bucket || '',
    inventory_item_id: item.inventory_item_id || '',
    manual_confirmation_lane: item.manual_confirmation_lane || '',
    manual_confirmation_required: item.manual_confirmation_required === true,
    manual_review_packet_item_id: item.manual_review_packet_item_id || '',
    matcher_ready: false,
    page_status: item.page_status || '',
    post_candidate_remaining_reason: item.post_candidate_remaining_reason || '',
    progression_group_id: item.progression_group_id || '',
    publication_ready: false,
    recommended_next_gate_after_candidate_filter: item.recommended_next_gate_after_candidate_filter || '',
    recommended_reviewer_decision: item.recommended_reviewer_decision || '',
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: requiredConfirmations(),
    review_bucket: item.review_bucket || '',
    review_grain: item.review_grain || '',
    review_prompts: sourceReviewPrompt(item),
    reviewer_decision: DECISION_PENDING,
    reviewer_note: '',
    reviewed_at: '',
    reviewed_by: '',
    risk_signals: item.risk_signals || [],
    source_context: item.source_context || {},
    source_decision_status: item.source_decision_status || '',
    source_downstream_action_batch: item.source_downstream_action_batch || '',
    source_downstream_action_item_id: item.source_downstream_action_item_id || '',
    source_key: item.source_key || '',
    source_reviewer_decision: item.source_reviewer_decision || '',
    source_standard_context: item.source_standard_context || {},
    standard_code: item.standard_code || '',
    subject_slug: item.subject_slug || '',
    target_grade_band: item.target_grade_band || '',
    target_standard_code: item.target_standard_code || item.standard_code || '',
    unit_context: item.unit_context || {},
    unit_evidence_id: item.unit_evidence_id || '',
    unit_title: item.unit_title || '',
    worklist_rank: item.worklist_rank || 0,
    writes_public_data: false
  }
}

function summarize(decisions) {
  const summary = {
    by_decision_status: {},
    by_evidence_lane: {},
    by_evidence_packet_source: {},
    by_grade_band: {},
    by_manual_confirmation_lane: {},
    by_review_bucket: {},
    by_reviewer_decision: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    completed_decisions: 0,
    decision_template_rows: decisions.length,
    decisions_requiring_manual_confirmation: 0,
    evidence_ready_decisions: 0,
    pending_decisions: 0,
    source_anchor_exact_decisions: 0,
    bounded_source_decisions: 0,
    source_row_confirmation_decisions: 0,
    item_level_source_review_decisions: 0,
    unique_action_decisions: sorted(decisions.map(row => row.downstream_action_decision_id)).length,
    unique_progression_groups: sorted(decisions.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(decisions.map(row => row.source_key)).length,
    unique_standard_codes: sorted(decisions.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(decisions.map(row => row.unit_evidence_id)).length
  }
  for (const row of decisions) {
    countInto(summary.by_decision_status, row.decision_status)
    countInto(summary.by_evidence_lane, row.evidence_lane)
    countInto(summary.by_evidence_packet_source, row.evidence_packet_source)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_manual_confirmation_lane, row.manual_confirmation_lane)
    countInto(summary.by_review_bucket, row.review_bucket)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_source_downstream_action_batch, row.source_downstream_action_batch)
    countInto(summary.by_subject, row.subject_slug)
    if (row.reviewer_decision === DECISION_PENDING) summary.pending_decisions += 1
    else summary.completed_decisions += 1
    if (row.manual_confirmation_required) summary.decisions_requiring_manual_confirmation += 1
    if (row.evidence_ready) summary.evidence_ready_decisions += 1
    if (row.evidence_packet_source === 'source_anchor_exact_evidence_packet') summary.source_anchor_exact_decisions += 1
    if (row.evidence_packet_source === 'bounded_source_evidence_packet') summary.bounded_source_decisions += 1
    if (row.source_downstream_action_batch === 'source_row_confirmation') summary.source_row_confirmation_decisions += 1
    if (row.source_downstream_action_batch === 'item_level_source_review') summary.item_level_source_review_decisions += 1
  }
  return summary
}

function markdownSummary(payload) {
  const rows = payload.post_candidate_manual_review_decisions
    .map(row => `| ${markdownCell(row.worklist_rank)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.evidence_packet_source)} | ${markdownCell(row.source_downstream_action_batch)} | ${markdownCell(row.reviewer_decision)} | ${truncate(row.unit_title)} |`)
    .join('\n') || '| - | - | - | - | - | - | - | - |'
  return `# H4G Post-Candidate Manual Review Decisions Template

Generated at: ${payload.generated_at}

Source packet: \`${payload.source_post_candidate_manual_review_packet}\`

This is an editable manual review template. Pending rows are valid, but no row
is matcher-ready or publication-ready. Completed rows must still pass the
separate audit and later action/publication gates.

## Summary

| field | value |
| --- | ---: |
| decision template rows | ${payload.summary.decision_template_rows} |
| pending decisions | ${payload.summary.pending_decisions} |
| completed decisions | ${payload.summary.completed_decisions} |
| evidence-ready decisions | ${payload.summary.evidence_ready_decisions} |
| manual-confirmation required decisions | ${payload.summary.decisions_requiring_manual_confirmation} |
| source-anchor exact decisions | ${payload.summary.source_anchor_exact_decisions} |
| bounded-source decisions | ${payload.summary.bounded_source_decisions} |
| source-row confirmation decisions | ${payload.summary.source_row_confirmation_decisions} |
| item-level source review decisions | ${payload.summary.item_level_source_review_decisions} |
| unique standard codes | ${payload.summary.unique_standard_codes} |

## Evidence Packet Source

| source | decisions |
| --- | ---: |
${countRows(payload.summary.by_evidence_packet_source)}

## Source Action Batch

| batch | decisions |
| --- | ---: |
${countRows(payload.summary.by_source_downstream_action_batch)}

## Decisions

| rank | subject | grade | standard | packet source | action batch | decision | unit |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${rows}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const packet = readJson(args.packet)
  validatePacket(packet, args, errors)

  const decisions = (packet.manual_review_items || [])
    .map(decisionFromManualReviewItem)

  const summary = summarize(decisions)
  if (args.requireItems && summary.decision_template_rows === 0) {
    errors.push('requireItems is set but no decisions were generated')
  }
  if (summary.decision_template_rows !== Number(packet.summary?.manual_review_items || 0)) {
    errors.push(`decision rows must match packet summary: ${summary.decision_template_rows} vs ${packet.summary?.manual_review_items ?? 'missing'}`)
  }
  if (summary.pending_decisions !== summary.decision_template_rows) {
    errors.push('new decisions template must start with every row pending')
  }
  if (summary.evidence_ready_decisions !== summary.decision_template_rows) {
    errors.push('new decisions template expects evidence-ready source rows for every decision')
  }
  if (summary.decisions_requiring_manual_confirmation !== summary.decision_template_rows) {
    errors.push('new decisions template must require manual confirmation for every row')
  }

  const payload = {
    changes_official_standard_text: false,
    data_scope: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template',
    decision_template_only: true,
    direct_matcher_use: false,
    editable_manual_review_template: true,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: decisionPolicy(),
    post_candidate_manual_review_decisions: decisions,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_decisions_template',
    source_post_candidate_manual_review_packet: args.packet,
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
