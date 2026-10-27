#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.md'

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds an editable manual-scope source-anchor review decisions template from
the read-only review worklist. Every row starts pending. This template records
human exact-anchor review outcomes only; it does not approve bridges, write
public/data, change official standard text, or enable matcher/publication use.`)
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

function uniqueStrings(values) {
  const seen = new Set()
  const out = []
  for (const value of values || []) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
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

function validateWorklistPolicy(label, policy, errors) {
  for (const key of [
    'item_review_decision_must_be_edited_separately',
    'requires_later_item_level_source_review',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'reviewer_worklist_is_not_decision'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function validateWorklist(worklist, args, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if ((worklist.errors || []).length) errors.push('worklist errors must be empty')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist') {
    errors.push('worklist purpose mismatch')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  validatePolicy('worklist', worklist, errors)
  validateWorklistPolicy('worklist worklist_policy', worklist.worklist_policy || {}, errors)
  if (!Array.isArray(worklist.manual_scope_source_anchor_review_work_items)) {
    errors.push('worklist manual_scope_source_anchor_review_work_items must be an array')
  }
  if (args.requireItems && !(worklist.manual_scope_source_anchor_review_work_items || []).length) {
    errors.push('requireItems is set but worklist has no review work items')
  }
}

function decisionPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    item_review_decision_must_be_edited_separately: true,
    manual_scope_source_anchor_review_decision_is_not_approval: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_item_review_update: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function requiredConfirmations() {
  return {
    exact_activity_or_page_bounded_evidence_recorded: false,
    exact_page_reference_recorded: false,
    item_review_decision_still_required: true,
    later_matcher_gate_required: true,
    later_publication_gate_required: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    same_grade_scope_checked: false,
    same_subject_scope_checked: false,
    target_standard_specificity_checked: false,
    unit_title_only_rejected_or_supplemented: false
  }
}

function decisionId(workItem) {
  return `h4g_anchor_group_manual_scope_source_anchor_review_decision_${hashText(workItem.work_item_id)}`
}

function allowedDecisions(workItem) {
  return uniqueStrings(['pending', ...(workItem.allowed_reviewer_outcomes || [])])
}

function decisionFromWorkItem(workItem) {
  return {
    allowed_decisions: allowedDecisions(workItem),
    anchor_type: workItem.anchor_type || '',
    changes_official_standard_text: false,
    decision_id: decisionId(workItem),
    decision_note: '',
    decision_policy: decisionPolicy(),
    decision_status: 'pending',
    decision_type: 'anchor_group_manual_scope_source_anchor_review_decision',
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    evidence_quality: '',
    evidence_url: workItem.evidence_url || '',
    exact_activity_or_task: '',
    exact_evidence_note: '',
    exact_evidence_quote: '',
    exact_page_reference: '',
    grade_band: workItem.grade_band || '',
    inventory_item_id: workItem.inventory_item_id || '',
    item_review_decision_id: workItem.item_review_decision_id || '',
    lane_order: workItem.lane_order,
    manual_review_required: true,
    manual_scope_source_anchor_evidence_item_id: workItem.manual_scope_source_anchor_evidence_item_id || '',
    matcher_ready: false,
    page_range: workItem.page_range || '',
    page_range_status: workItem.page_range_status || '',
    parent_downstream_decision_id: workItem.parent_downstream_decision_id || '',
    priority_rank: workItem.priority_rank,
    priority_tier: workItem.priority_tier || '',
    publication_ready: false,
    recommended_disposition: workItem.recommended_disposition || '',
    repository_path: workItem.repository_path || '',
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: requiredConfirmations(),
    review_checklist: workItem.review_checklist || [],
    review_lane: workItem.review_lane || '',
    review_questions: workItem.review_questions || [],
    reviewer_decision: 'pending',
    reviewer_note: '',
    risk_profile: workItem.risk_profile || {},
    risk_signals: workItem.risk_signals || [],
    source_item_standard_code: workItem.source_item_standard_code || '',
    source_key: workItem.source_key || '',
    source_manual_scope_source_anchor_review_work_item_id: workItem.work_item_id || '',
    source_standard_summary: workItem.source_standard_summary || {},
    subject_slug: workItem.subject_slug || '',
    target_grade_band: workItem.target_grade_band || workItem.grade_band || '',
    target_standard_code: workItem.target_standard_code || '',
    target_standard_summary: workItem.target_standard_summary || {},
    unit_context: workItem.unit_context || {},
    unit_evidence_id: workItem.unit_evidence_id || '',
    unit_title: workItem.unit_title || '',
    writes_public_data: false
  }
}

function buildRows(worklist) {
  return (worklist.manual_scope_source_anchor_review_work_items || [])
    .map(decisionFromWorkItem)
    .sort((a, b) => Number(a.lane_order || 0) - Number(b.lane_order || 0) ||
      Number(a.priority_rank || 0) - Number(b.priority_rank || 0) ||
      String(a.subject_slug || '').localeCompare(String(b.subject_slug || '')) ||
      String(a.target_standard_code || '').localeCompare(String(b.target_standard_code || '')) ||
      String(a.unit_evidence_id || '').localeCompare(String(b.unit_evidence_id || '')))
}

function summarize(rows) {
  const summary = {
    by_decision_status: {},
    by_grade_band: {},
    by_priority_tier: {},
    by_recommended_disposition: {},
    by_review_lane: {},
    by_reviewer_decision: {},
    by_subject: {},
    by_target_standard_code: {},
    completed_review_decisions: 0,
    high_risk_rows: 0,
    manual_review_required_rows: 0,
    manual_scope_source_anchor_review_decisions: rows.length,
    pending_review_decisions: 0,
    unique_inventory_items: sorted(rows.map(row => row.inventory_item_id)).length,
    unique_source_review_work_items: sorted(rows.map(row => row.source_manual_scope_source_anchor_review_work_item_id)).length,
    unique_target_standard_codes: sorted(rows.map(row => row.target_standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    if (row.manual_review_required) summary.manual_review_required_rows += 1
    if (row.reviewer_decision === 'pending') summary.pending_review_decisions += 1
    else summary.completed_review_decisions += 1
    if (Number(row.risk_profile?.risk_score || 0) >= 4) summary.high_risk_rows += 1
    countInto(summary.by_decision_status, row.decision_status)
    countInto(summary.by_grade_band, row.target_grade_band || row.grade_band)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommended_disposition, row.recommended_disposition)
    countInto(summary.by_review_lane, row.review_lane)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.target_standard_code)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.lane_order} | ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.target_grade_band)} | ${markdownCell(row.target_standard_code)} | ${markdownCell(row.reviewer_decision)} | ${markdownCell(row.review_lane)} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Manual Scope Source-Anchor Review Decisions Template

Generated at: ${payload.generated_at}

This editable template records human exact-anchor review outcomes for the
manual-scope source-anchor worklist. It does not edit item decisions, approve
bridges, write \`public/data\`, change official standard text, or enable
matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| decisions | ${payload.summary.manual_scope_source_anchor_review_decisions} |
| pending decisions | ${payload.summary.pending_review_decisions} |
| completed decisions | ${payload.summary.completed_review_decisions} |
| manual review required rows | ${payload.summary.manual_review_required_rows} |
| high risk rows | ${payload.summary.high_risk_rows} |
| unique target standards | ${payload.summary.unique_target_standard_codes} |
| unique unit evidence ids | ${payload.summary.unique_unit_evidence_ids} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Reviewer Decisions

| reviewer decision | rows |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Review Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_review_lane)}

## Preview

| lane order | rank | subject | grade | target standard | decision | lane | unit title |
| ---: | ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.manual_scope_source_anchor_review_decisions)}

## Guardrails

- Pending rows are not source evidence approvals.
- Completed rows still require later item-review updates, matcher gates, and publication gates.
- Public data, official standard text, matcher, and publication remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.worklist)) errors.push(`Missing worklist: ${args.worklist}`)
  const worklist = errors.length ? { manual_scope_source_anchor_review_work_items: [] } : readJson(args.worklist)
  if (!errors.length) validateWorklist(worklist, args, errors)
  const rows = buildRows(worklist)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no review decisions were generated')
  return {
    changes_official_standard_text: false,
    data_scope: 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template',
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    manual_scope_source_anchor_review_decisions: rows,
    matcher_ready: false,
    policy: decisionPolicy(),
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template',
    source_manual_scope_source_anchor_review_worklist: args.worklist,
    summary: summarize(rows),
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
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
