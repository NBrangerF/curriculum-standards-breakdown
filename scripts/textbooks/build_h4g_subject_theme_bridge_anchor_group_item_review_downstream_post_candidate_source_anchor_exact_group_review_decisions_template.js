#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template_anchor_domain_rejected_english_pe.md'

const DECISION_PENDING = 'pending'
const DECISION_READY_FOR_STANDARD_LEVEL = 'group_evidence_ready_for_standard_level_exact_anchor_review'
const DECISION_SPLIT_GROUP = 'split_group_before_standard_level_review'
const DECISION_REJECT_GROUP = 'reject_group_as_overbroad_unit_or_generic_theme'
const DECISION_NEEDS_MORE_EVIDENCE = 'needs_additional_unit_or_page_evidence'
const DECISION_SUPERSEDED = 'out_of_scope_duplicate_or_superseded'

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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template.js \\
  --strict --require-items

Builds an editable group-level decisions template from the post-candidate
source-anchor exact group review packet. Every row starts pending. This gate
lets a reviewer decide whether a unit-level evidence surface is ready to return
to standard-level exact-anchor review, needs splitting, is overbroad, or needs
more evidence. It does not approve standards, write public/data, or enable
matcher/publication use.`)
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

function truncate(value, max = 120) {
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
  if (packet.valid !== true) errors.push('group review packet valid must be true')
  if ((packet.errors || []).length) errors.push('group review packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet') {
    errors.push('group review packet purpose mismatch')
  }
  if (packet.exact_anchor_group_review_packet_only !== true) {
    errors.push('group review packet exact_anchor_group_review_packet_only must be true')
  }
  if (packet.review_only !== true) errors.push('group review packet review_only must be true')
  if (!Array.isArray(packet.exact_anchor_group_review_items)) {
    errors.push('group review packet exact_anchor_group_review_items must be an array')
  }
  if (args.requireItems && !(packet.exact_anchor_group_review_items || []).length) {
    errors.push('requireItems is set but group review packet has no rows')
  }
  validatePolicy('group review packet', packet, errors)
}

function decisionPolicy() {
  return {
    changes_official_standard_text: false,
    decision_template_only: true,
    direct_matcher_use: false,
    editable_manual_review_template: true,
    eligible_for_h4g_differentiation: false,
    exact_group_decision_is_not_standard_approval: true,
    group_decision_requires_standard_level_exact_anchor_gate: true,
    group_decision_template_only: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_action_gate: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function allowedDecisions() {
  return [
    DECISION_PENDING,
    DECISION_READY_FOR_STANDARD_LEVEL,
    DECISION_SPLIT_GROUP,
    DECISION_REJECT_GROUP,
    DECISION_NEEDS_MORE_EVIDENCE,
    DECISION_SUPERSEDED
  ]
}

function requiredConfirmations() {
  return {
    direct_matcher_use_rejected: true,
    exact_group_not_treated_as_standard_approval: true,
    group_page_evidence_reviewed: false,
    later_action_gate_required: true,
    later_matcher_gate_required: true,
    later_publication_gate_required: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    reviewer_note_records_group_basis: false,
    same_grade_scope_checked: false,
    same_subject_scope_checked: false,
    standard_level_exact_anchor_review_still_required: true,
    unit_scope_or_fanout_risk_checked: false
  }
}

function decisionId(group) {
  return `h4g_anchor_group_post_candidate_source_anchor_exact_group_review_decision_${hashText(group.exact_anchor_group_review_item_id)}`
}

function reviewPrompt(group) {
  const route = group.group_review_route || ''
  const prompts = [
    'Does the unit-level page evidence prove a narrow source surface, or only a broad unit topic?',
    'Can the same unit evidence support these standards without fan-out across unrelated standard requirements?',
    'Which standards must be split or rejected before any standard-level exact-anchor decision is attempted?',
    'What exact activities, tasks, language behaviors, movement skills, health behaviors, or cultural objectives are visible in the page text?'
  ]
  if (route === 'single_unit_many_standard_generic_anchor_review') {
    prompts.push('This single unit maps to many standards; identify the standards that only match the generic title or theme.')
  } else if (route === 'unit_or_standard_fanout_exact_anchor_group_review') {
    prompts.push('Check whether the fan-out is caused by one source row being reused for several standards without distinct evidence.')
  } else {
    prompts.push('Check whether body text resolves the generic/deny-term risk, not just the unit heading.')
  }
  return prompts
}

function uniqueStandardCodes(group) {
  const fromCodes = sorted(group.standard_codes || [])
  if (fromCodes.length) return fromCodes
  return sorted((group.standard_review_rows || []).map(row => row.standard_code))
}

function groupDecision(group) {
  const standards = uniqueStandardCodes(group)
  return {
    allowed_decisions: allowedDecisions(),
    changes_official_standard_text: false,
    decision_id: decisionId(group),
    decision_note: '',
    decision_policy: decisionPolicy(),
    decision_status: 'pending',
    decision_type: 'h4g_anchor_group_post_candidate_source_anchor_exact_group_review_decision',
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    exact_anchor_group_review_item_id: group.exact_anchor_group_review_item_id || '',
    exact_evidence_item_ids_requiring_standard_level_review: group.source_anchor_exact_evidence_item_ids || [],
    grade_band: group.grade_band || '',
    group_key: group.group_key || '',
    group_review_prompts: reviewPrompt(group),
    group_review_route: group.group_review_route || '',
    group_specificity_note: '',
    inventory_buckets: group.inventory_buckets || [],
    matcher_ready: false,
    max_group_risk_score: Number(group.risk_summary?.max_risk_score || 0),
    page_evidence_summary: group.page_evidence_summary || {},
    priority_tier: group.priority_tier || '',
    progression_group_ids: group.progression_group_ids || [],
    publication_ready: false,
    ready_standard_level_exact_anchor_review_item_ids: [],
    reject_exact_anchor_evidence_item_ids: [],
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: requiredConfirmations(),
    reviewer_decision: DECISION_PENDING,
    reviewer_note: '',
    reviewed_at: '',
    reviewed_by: '',
    risk_summary: group.risk_summary || {},
    source_anchor_exact_evidence_items: Number(group.source_anchor_exact_evidence_items || 0),
    source_group_review_packet_item: group.exact_anchor_group_review_item_id || '',
    split_or_refine_instruction: '',
    split_required_standard_codes: [],
    standard_codes: standards,
    standard_level_exact_anchor_gate_required: true,
    standard_review_rows: group.standard_review_rows || [],
    subject_slug: group.subject_slug || '',
    unit_evidence_id: group.unit_evidence_id || '',
    unit_level_evidence_note: '',
    unit_title: group.unit_title || '',
    unique_standard_codes: standards.length,
    writes_public_data: false
  }
}

function summarize(decisions) {
  const summary = {
    by_decision_status: {},
    by_grade_band: {},
    by_group_review_route: {},
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_subject: {},
    completed_decisions: 0,
    exact_group_review_auto_approval_decisions: 0,
    exact_group_review_decisions: decisions.length,
    groups_with_multiple_standards: decisions.filter(row => Number(row.unique_standard_codes || 0) > 1).length,
    max_rows_per_group: Math.max(0, ...decisions.map(row => Number(row.source_anchor_exact_evidence_items || 0))),
    pending_decisions: 0,
    source_anchor_exact_evidence_items: decisions.reduce((sum, row) => sum + Number(row.source_anchor_exact_evidence_items || 0), 0),
    unique_unit_evidence_ids: sorted(decisions.map(row => row.unit_evidence_id)).length
  }
  for (const row of decisions) {
    if (row.reviewer_decision === DECISION_PENDING) summary.pending_decisions += 1
    else summary.completed_decisions += 1
    countInto(summary.by_decision_status, row.decision_status)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_group_review_route, row.group_review_route)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Source-Anchor Exact Group Review Decisions Template

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| group decisions | ${payload.summary.exact_group_review_decisions} |
| pending decisions | ${payload.summary.pending_decisions} |
| source-anchor exact evidence rows | ${payload.summary.source_anchor_exact_evidence_items} |
| groups with multiple standards | ${payload.summary.groups_with_multiple_standards} |
| max rows per group | ${payload.summary.max_rows_per_group} |
| auto approval decisions | ${payload.summary.exact_group_review_auto_approval_decisions} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Group Routes

| route | decisions |
| --- | ---: |
${countRows(payload.summary.by_group_review_route)}

## Decisions

| priority | route | subject | grade | rows | unit |
| --- | --- | --- | --- | ---: | --- |
${payload.exact_anchor_group_review_decisions.map(row => `| ${markdownCell(row.priority_tier)} | ${markdownCell(row.group_review_route)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${row.source_anchor_exact_evidence_items} | ${truncate(row.unit_title, 90)} |`).join('\n') || '| - | - | - | - | 0 | - |'}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  const packet = readJson(args.packet)
  validatePacket(packet, args, errors)
  const decisions = (packet.exact_anchor_group_review_items || [])
    .slice()
    .sort((a, b) => {
      const priority = String(a.priority_tier || '').localeCompare(String(b.priority_tier || ''))
      if (priority) return priority
      const rows = Number(b.source_anchor_exact_evidence_items || 0) - Number(a.source_anchor_exact_evidence_items || 0)
      if (rows) return rows
      return String(a.exact_anchor_group_review_item_id || '').localeCompare(String(b.exact_anchor_group_review_item_id || ''))
    })
    .map(groupDecision)
  if (args.requireItems && !decisions.length) errors.push('requireItems is set but no group decisions were generated')

  return {
    changes_official_standard_text: false,
    data_scope: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template',
    decision_template_only: true,
    direct_matcher_use: false,
    editable_manual_review_template: true,
    eligible_for_h4g_differentiation: false,
    errors,
    exact_anchor_group_review_decisions: decisions,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: decisionPolicy(),
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_decisions_template',
    source_exact_group_review_packet: args.packet,
    summary: summarize(decisions),
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
  const payload = build(args)
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
