#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.md'

const TRIAGE_DECISIONS = new Set([
  'needs_source_anchor_evidence',
  'split_or_refine_group_scope'
])

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireGroups: false,
    reviewedAt: new Date().toISOString().slice(0, 10),
    reviewedBy: 'Codex anchor group triage',
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--reviewed-by') args.reviewedBy = argv[++i]
    else if (item === '--reviewed-at') args.reviewedAt = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-groups') args.requireGroups = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_triage_decisions_candidate.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_template_anchor_domain_rejected_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json \\
  --strict --require-groups

Builds a non-approval group-level triage decision candidate from the editable
anchor group decision template and the anchor group action worklist. The output
only routes groups to split/refine or source-anchor evidence review; it does
not approve item-level source review, enable matcher use, or write public data.`)
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

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function compact(values, limit = 4) {
  const rows = [...new Set((values || []).filter(Boolean).map(String))]
  if (rows.length <= limit) return rows.join('；')
  return `${rows.slice(0, limit).join('；')}；...(+${rows.length - limit})`
}

function validateTopLevel(decisions, worklist, errors) {
  if (decisions.valid !== true) errors.push('decisions template valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_anchor_group_decisions_template')
  }
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.changes_official_standard_text !== false) errors.push('decisions changes_official_standard_text must be false')
  if (decisions.direct_matcher_use !== false) errors.push('decisions direct_matcher_use must be false')
  if (decisions.matcher_ready !== false) errors.push('decisions matcher_ready must be false')
  if (decisions.publication_ready !== false) errors.push('decisions publication_ready must be false')

  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_action_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_anchor_group_action_worklist')
  }
  if (worklist.review_only !== true) errors.push('worklist review_only must be true')
  if (worklist.writes_public_data !== false) errors.push('worklist writes_public_data must be false')
  if (worklist.changes_official_standard_text !== false) errors.push('worklist changes_official_standard_text must be false')
  if (worklist.direct_matcher_use !== false) errors.push('worklist direct_matcher_use must be false')
  if (worklist.matcher_ready !== false) errors.push('worklist matcher_ready must be false')
  if (worklist.publication_ready !== false) errors.push('worklist publication_ready must be false')
}

function itemByGroup(worklist, errors) {
  const out = new Map()
  for (const item of worklist.action_work_items || []) {
    if (!item.progression_group_id) {
      errors.push(`${item.anchor_action_work_id || '(missing work item)'} missing progression_group_id`)
      continue
    }
    if (out.has(item.progression_group_id)) errors.push(`${item.progression_group_id} duplicate worklist group`)
    out.set(item.progression_group_id, item)
    if (!TRIAGE_DECISIONS.has(item.recommended_reviewer_decision)) {
      errors.push(`${item.progression_group_id} unsupported triage reviewer decision: ${item.recommended_reviewer_decision || 'missing'}`)
    }
    if (item.recommended_reviewer_decision === 'split_or_refine_group_scope' && item.work_path !== 'split_scope_before_item_review') {
      errors.push(`${item.progression_group_id} split recommendation must use split_scope_before_item_review`)
    }
    if (item.recommended_reviewer_decision === 'needs_source_anchor_evidence' && item.work_path !== 'source_anchor_evidence_gap_review') {
      errors.push(`${item.progression_group_id} evidence recommendation must use source_anchor_evidence_gap_review`)
    }
  }
  return out
}

function buildDecisionNote(row, item) {
  if (item.recommended_reviewer_decision === 'split_or_refine_group_scope') {
    return [
      'Triage-only non-approval route: split/refine this broad anchor group before item-level source review.',
      `Worklist expands ${item.total_anchor_items || row.total_items || 0} anchor review item(s) into ${item.split_candidate_count || 0} bounded split candidate(s).`,
      `Reasons: ${compact(item.recommendation_reasons)}.`,
      'Official standard text is unchanged; matcher/publication gates remain disabled.'
    ].join(' ')
  }
  return [
    'Triage-only non-approval route: collect or confirm source-anchor evidence before item-level source review.',
    `Worklist lists ${item.source_anchor_evidence_request_count || 0} source-anchor evidence request(s) and missing grade bands: ${compact(item.missing_grade_bands) || 'none'}.`,
    `Reasons: ${compact(item.recommendation_reasons)}.`,
    'Official standard text is unchanged; matcher/publication gates remain disabled.'
  ].join(' ')
}

function triageConfirmations(row) {
  return {
    ...(row.required_confirmations || {}),
    fanout_risk_reviewed: true,
    item_level_review_still_required: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    same_grade_scope_checked: true,
    same_subject_scope_checked: true,
    source_items_reviewed: true
  }
}

function applyTriage(row, item, args) {
  return {
    ...row,
    decision_note: buildDecisionNote(row, item),
    decision_status: 'triage_candidate_reviewed',
    required_confirmations: triageConfirmations(row),
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewedBy,
    reviewer_decision: item.recommended_reviewer_decision,
    triage_candidate: true,
    triage_policy: {
      approval_prohibited: true,
      direct_matcher_use: false,
      eligible_for_h4g_differentiation: false,
      item_level_review_still_required: true,
      matcher_ready: false,
      non_approval_route: true,
      publication_ready: false,
      writes_public_data: false
    },
    triage_recommendation_confidence: item.recommendation_confidence || '',
    triage_recommendation_reasons: item.recommendation_reasons || [],
    triage_source_action_work_id: item.anchor_action_work_id || '',
    triage_source_anchor_evidence_request_count: item.source_anchor_evidence_request_count || 0,
    triage_split_candidate_count: item.split_candidate_count || 0,
    triage_total_anchor_items: item.total_anchor_items || 0,
    triage_work_path: item.work_path || ''
  }
}

function summarize(rows) {
  const summary = {
    by_priority_tier: {},
    by_recommendation_confidence: {},
    by_review_strategy: {},
    by_reviewer_decision: {},
    by_subject: {},
    by_work_path: {},
    completed_group_decisions: 0,
    group_decisions: rows.length,
    pending_group_decisions: 0,
    source_anchor_evidence_requests: 0,
    split_candidate_rows: 0,
    total_anchor_items: 0
  }
  for (const row of rows) {
    if (row.reviewer_decision === 'pending') summary.pending_group_decisions += 1
    else summary.completed_group_decisions += 1
    summary.source_anchor_evidence_requests += Number(row.triage_source_anchor_evidence_request_count || 0)
    summary.split_candidate_rows += Number(row.triage_split_candidate_count || 0)
    summary.total_anchor_items += Number(row.triage_total_anchor_items || 0)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommendation_confidence, row.triage_recommendation_confidence)
    countInto(summary.by_review_strategy, row.review_strategy)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_work_path, row.triage_work_path)
  }
  return summary
}

function validateCoverage(templateRows, worklistByGroup, args, errors) {
  const templateGroups = new Set()
  for (const row of templateRows || []) {
    if (!row.progression_group_id) {
      errors.push(`${row.decision_id || '(missing template row)'} missing progression_group_id`)
      continue
    }
    templateGroups.add(row.progression_group_id)
    if (!worklistByGroup.has(row.progression_group_id)) {
      errors.push(`${row.progression_group_id} missing action work item`)
    }
  }
  for (const groupId of worklistByGroup.keys()) {
    if (!templateGroups.has(groupId)) errors.push(`${groupId} worklist item missing template decision row`)
  }
  if (args.requireGroups && !templateGroups.size) errors.push('requireGroups is set but template has no group rows')
}

function previewRows(rows) {
  return rows.slice(0, 60).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.progression_group_id)} | ${row.total_items} | ${markdownCell(row.reviewer_decision)} | ${markdownCell(row.triage_work_path)} | ${row.triage_split_candidate_count} | ${row.triage_source_anchor_evidence_request_count} |`
  )).join('\n') || '| - | - | - | 0 | - | - | 0 | 0 |'
}

function markdownSummary(payload) {
  return `# H4G Subject Theme Bridge Anchor Group Triage Decisions Candidate

Generated at: ${payload.generated_at}

This candidate converts the anchor group action worklist into non-approval
group-level triage decisions. It only routes groups to split/refine or
source-anchor evidence review. It does not approve item-level source review,
write \`public/data\`, change official standard text, or enable matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| group review complete | ${payload.group_review_complete} |
| group decisions | ${payload.summary.group_decisions} |
| completed group decisions | ${payload.summary.completed_group_decisions} |
| pending group decisions | ${payload.summary.pending_group_decisions} |
| total anchor items | ${payload.summary.total_anchor_items} |
| split candidates | ${payload.summary.split_candidate_rows} |
| source-anchor evidence requests | ${payload.summary.source_anchor_evidence_requests} |
| publication ready | ${payload.publication_ready} |
| matcher ready | ${payload.matcher_ready} |

## Decisions

| decision | groups |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Work Paths

| work path | groups |
| --- | ---: |
${countRows(payload.summary.by_work_path)}

## Subjects

| subject | groups |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Preview

| rank | subject | progression group | items | decision | work path | split candidates | evidence requests |
| ---: | --- | --- | ---: | --- | --- | ---: | ---: |
${previewRows(payload.group_review_decisions)}

## Guardrails

- No row is marked \`ready_for_item_level_source_review\`.
- Every row keeps public write, official text change, H4G eligibility, matcher and publication fields disabled.
- Item-level source review, matcher registry, unit evidence candidate, and reviewed publication gates remain separate later steps.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildCandidate(args) {
  const errors = []
  for (const [label, path] of [['decisions template', args.decisions], ['action worklist', args.worklist]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = errors.length ? { group_review_decisions: [] } : readJson(args.decisions)
  const worklist = errors.length ? { action_work_items: [] } : readJson(args.worklist)
  if (!errors.length) validateTopLevel(decisions, worklist, errors)
  const worklistByGroup = itemByGroup(worklist, errors)
  const templateRows = decisions.group_review_decisions || []
  if (!Array.isArray(templateRows)) errors.push('decisions group_review_decisions must be an array')
  validateCoverage(templateRows, worklistByGroup, args, errors)

  const rows = templateRows.map(row => {
    const item = worklistByGroup.get(row.progression_group_id)
    return item ? applyTriage(row, item, args) : row
  })
  const summary = summarize(rows)
  return {
    ...decisions,
    candidate_purpose: 'h4g_subject_theme_bridge_anchor_group_triage_decisions_candidate',
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    group_review_complete: summary.pending_group_decisions === 0 && errors.length === 0,
    group_review_decisions: rows,
    matcher_ready: false,
    publication_candidate: false,
    publication_ready: false,
    review_only: true,
    source_action_worklist: args.worklist,
    source_decisions_template: args.decisions,
    summary,
    triage_decision_policy: {
      approval_prohibited: true,
      allowed_reviewer_decisions: [...TRIAGE_DECISIONS],
      direct_matcher_use: false,
      item_level_review_still_required: true,
      publication_ready: false,
      writes_public_data: false
    },
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

  const payload = buildCandidate(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
