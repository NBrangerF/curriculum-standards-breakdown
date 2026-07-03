#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_TRIAGE_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS_TEMPLATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe_audit.md'

const TRIAGE_DECISIONS = new Set([
  'needs_source_anchor_evidence',
  'split_or_refine_group_scope'
])

const FORBIDDEN_DECISIONS = new Set([
  'pending',
  'ready_for_item_level_source_review',
  'reject_group_anchor_path'
])

const REQUIRED_CONFIRMATIONS = [
  'fanout_risk_reviewed',
  'item_level_review_still_required',
  'no_public_write_requested',
  'official_standard_text_preserved',
  'same_grade_scope_checked',
  'same_subject_scope_checked',
  'source_items_reviewed'
]

const TEMPLATE_LINEAGE_FIELDS = [
  'action_families',
  'anchor_types',
  'approved_grade_bands_from_matrix',
  'decision_id',
  'decision_type',
  'grade_bands',
  'matrix_item_ids',
  'missing_grade_bands',
  'priority_rank',
  'priority_tier',
  'progression_group_id',
  'remediation_item_ids',
  'review_owner',
  'review_strategy',
  'risk_flags',
  'sample_items',
  'standard_codes',
  'subject_slug',
  'surface_id',
  'total_items',
  'unit_evidence_ids'
]

function parseArgs(argv) {
  const args = {
    decisionsTemplate: DEFAULT_DECISIONS_TEMPLATE,
    out: DEFAULT_OUT,
    requireComplete: false,
    requireGroups: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    triageDecisions: DEFAULT_TRIAGE_DECISIONS,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--triage-decisions') args.triageDecisions = argv[++i]
    else if (item === '--decisions-template') args.decisionsTemplate = argv[++i]
    else if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-groups') args.requireGroups = true
    else if (item === '--require-complete') args.requireComplete = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_triage_decisions_candidate.js \\
  --triage-decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json \\
  --decisions-template generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_template_anchor_domain_rejected_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json \\
  --strict --require-groups --require-complete

Audits the non-approval H4G anchor group triage candidate. It verifies exact
coverage from the action worklist, preserves decision-template lineage, and
keeps public data, matcher use, and publication gates disabled.`)
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

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function validReviewDate(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value || ''))
}

function sameJson(actual, expected) {
  return JSON.stringify(stable(actual ?? null)) === JSON.stringify(stable(expected ?? null))
}

function arraysMatch(actual, expected) {
  return JSON.stringify([...(actual || [])].map(String).sort()) === JSON.stringify([...(expected || [])].map(String).sort())
}

function mapByGroup(rows, label, errors) {
  const out = new Map()
  for (const row of rows || []) {
    const groupId = row.progression_group_id
    if (!groupId) {
      errors.push(`${label} row missing progression_group_id`)
      continue
    }
    if (out.has(groupId)) errors.push(`${label} duplicate progression_group_id: ${groupId}`)
    out.set(groupId, row)
  }
  return out
}

function worklistByGroup(worklist, errors) {
  const out = mapByGroup(worklist.action_work_items || [], 'worklist', errors)
  for (const item of worklist.action_work_items || []) {
    const prefix = item.progression_group_id || item.anchor_action_work_id || '(missing work item)'
    if (!TRIAGE_DECISIONS.has(item.recommended_reviewer_decision)) {
      errors.push(`${prefix} unsupported recommended_reviewer_decision ${item.recommended_reviewer_decision || 'missing'}`)
    }
    if (item.recommended_reviewer_decision === 'split_or_refine_group_scope' && item.work_path !== 'split_scope_before_item_review') {
      errors.push(`${prefix} split recommendation must use split_scope_before_item_review`)
    }
    if (item.recommended_reviewer_decision === 'needs_source_anchor_evidence' && item.work_path !== 'source_anchor_evidence_gap_review') {
      errors.push(`${prefix} evidence recommendation must use source_anchor_evidence_gap_review`)
    }
  }
  return out
}

function auditTopLevel(triage, template, worklist, args, errors) {
  if (triage.valid !== true) errors.push('triage decisions valid must be true')
  if (triage.purpose !== 'h4g_subject_theme_bridge_anchor_group_decisions_template') {
    errors.push('triage decisions purpose must remain h4g_subject_theme_bridge_anchor_group_decisions_template')
  }
  if (triage.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_triage_decisions_candidate') {
    errors.push('triage decisions candidate_purpose must be h4g_subject_theme_bridge_anchor_group_triage_decisions_candidate')
  }
  if (triage.review_only !== true) errors.push('triage decisions review_only must be true')
  if (triage.writes_public_data !== false) errors.push('triage decisions writes_public_data must be false')
  if (triage.changes_official_standard_text !== false) errors.push('triage decisions changes_official_standard_text must be false')
  if (triage.eligible_for_h4g_differentiation !== false) errors.push('triage decisions eligible_for_h4g_differentiation must be false')
  if (triage.direct_matcher_use !== false) errors.push('triage decisions direct_matcher_use must be false')
  if (triage.matcher_ready !== false) errors.push('triage decisions matcher_ready must be false')
  if (triage.publication_candidate !== false) errors.push('triage decisions publication_candidate must be false')
  if (triage.publication_ready !== false) errors.push('triage decisions publication_ready must be false')
  if (triage.source_action_worklist !== args.worklist) errors.push('triage source_action_worklist must match audit arg')
  if (triage.source_decisions_template !== args.decisionsTemplate) errors.push('triage source_decisions_template must match audit arg')

  const policy = triage.triage_decision_policy || {}
  if (policy.approval_prohibited !== true) errors.push('triage_decision_policy.approval_prohibited must be true')
  if (policy.item_level_review_still_required !== true) errors.push('triage_decision_policy.item_level_review_still_required must be true')
  if (policy.writes_public_data !== false) errors.push('triage_decision_policy.writes_public_data must be false')
  if (policy.direct_matcher_use !== false) errors.push('triage_decision_policy.direct_matcher_use must be false')
  if (policy.publication_ready !== false) errors.push('triage_decision_policy.publication_ready must be false')
  if (!arraysMatch(policy.allowed_reviewer_decisions || [], [...TRIAGE_DECISIONS])) {
    errors.push('triage_decision_policy.allowed_reviewer_decisions must contain only non-approval triage decisions')
  }

  if (template.valid !== true) errors.push('source decisions template valid must be true')
  if (template.purpose !== 'h4g_subject_theme_bridge_anchor_group_decisions_template') {
    errors.push('source decisions template purpose mismatch')
  }
  if (worklist.valid !== true) errors.push('action worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_action_worklist') {
    errors.push('action worklist purpose mismatch')
  }
  if (worklist.review_only !== true) errors.push('action worklist review_only must be true')
  if (worklist.writes_public_data !== false) errors.push('action worklist writes_public_data must be false')
  if (worklist.changes_official_standard_text !== false) errors.push('action worklist changes_official_standard_text must be false')
  if (worklist.direct_matcher_use !== false) errors.push('action worklist direct_matcher_use must be false')
  if (worklist.matcher_ready !== false) errors.push('action worklist matcher_ready must be false')
  if (worklist.publication_ready !== false) errors.push('action worklist publication_ready must be false')
}

function auditPolicy(row, prefix, errors) {
  if (row.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (row.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (row.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
  if (row.requested_eligible_for_h4g_differentiation !== false) errors.push(`${prefix} requested_eligible_for_h4g_differentiation must be false`)
  const policy = row.publication_policy || {}
  if (policy.writes_public_data !== false) errors.push(`${prefix} publication_policy.writes_public_data must be false`)
  if (policy.changes_official_standard_text !== false) errors.push(`${prefix} publication_policy.changes_official_standard_text must be false`)
  if (policy.direct_matcher_use !== false) errors.push(`${prefix} publication_policy.direct_matcher_use must be false`)
  if (policy.eligible_for_h4g_differentiation !== false) errors.push(`${prefix} publication_policy.eligible_for_h4g_differentiation must be false`)
  if (policy.requires_later_item_decision_gate !== true) errors.push(`${prefix} publication_policy.requires_later_item_decision_gate must be true`)
  if (policy.requires_later_matcher_gate !== true) errors.push(`${prefix} publication_policy.requires_later_matcher_gate must be true`)
  if (policy.requires_later_publication_gate !== true) errors.push(`${prefix} publication_policy.requires_later_publication_gate must be true`)

  const triagePolicy = row.triage_policy || {}
  if (triagePolicy.approval_prohibited !== true) errors.push(`${prefix} triage_policy.approval_prohibited must be true`)
  if (triagePolicy.non_approval_route !== true) errors.push(`${prefix} triage_policy.non_approval_route must be true`)
  if (triagePolicy.item_level_review_still_required !== true) errors.push(`${prefix} triage_policy.item_level_review_still_required must be true`)
  if (triagePolicy.writes_public_data !== false) errors.push(`${prefix} triage_policy.writes_public_data must be false`)
  if (triagePolicy.eligible_for_h4g_differentiation !== false) errors.push(`${prefix} triage_policy.eligible_for_h4g_differentiation must be false`)
  if (triagePolicy.direct_matcher_use !== false) errors.push(`${prefix} triage_policy.direct_matcher_use must be false`)
  if (triagePolicy.matcher_ready !== false) errors.push(`${prefix} triage_policy.matcher_ready must be false`)
  if (triagePolicy.publication_ready !== false) errors.push(`${prefix} triage_policy.publication_ready must be false`)
}

function auditTemplateLineage(row, templateRow, prefix, errors) {
  for (const field of TEMPLATE_LINEAGE_FIELDS) {
    if (!sameJson(row[field], templateRow[field])) errors.push(`${prefix} ${field} must match source decision template`)
  }
}

function auditDecisionAgainstWorkItem(row, item, prefix, errors) {
  if (row.reviewer_decision !== item.recommended_reviewer_decision) {
    errors.push(`${prefix} reviewer_decision must match worklist recommended_reviewer_decision`)
  }
  if (row.triage_source_action_work_id !== item.anchor_action_work_id) {
    errors.push(`${prefix} triage_source_action_work_id must match worklist anchor_action_work_id`)
  }
  if (row.triage_work_path !== item.work_path) errors.push(`${prefix} triage_work_path must match worklist work_path`)
  if (row.triage_recommendation_confidence !== item.recommendation_confidence) {
    errors.push(`${prefix} triage_recommendation_confidence must match worklist`)
  }
  if (!arraysMatch(row.triage_recommendation_reasons || [], item.recommendation_reasons || [])) {
    errors.push(`${prefix} triage_recommendation_reasons must match worklist`)
  }
  if (Number(row.triage_total_anchor_items || 0) !== Number(item.total_anchor_items || 0)) {
    errors.push(`${prefix} triage_total_anchor_items must match worklist`)
  }
  if (Number(row.triage_split_candidate_count || 0) !== Number(item.split_candidate_count || 0)) {
    errors.push(`${prefix} triage_split_candidate_count must match worklist`)
  }
  if (Number(row.triage_source_anchor_evidence_request_count || 0) !== Number(item.source_anchor_evidence_request_count || 0)) {
    errors.push(`${prefix} triage_source_anchor_evidence_request_count must match worklist`)
  }
  if (String(row.priority_rank || '') !== String(item.priority_rank || '')) errors.push(`${prefix} priority_rank must match worklist`)
  if (row.priority_tier !== item.priority_tier) errors.push(`${prefix} priority_tier must match worklist`)
  if (row.review_strategy !== item.review_strategy) errors.push(`${prefix} review_strategy must match worklist`)

  if (row.reviewer_decision === 'split_or_refine_group_scope') {
    if (row.triage_work_path !== 'split_scope_before_item_review') errors.push(`${prefix} split decision must use split_scope_before_item_review`)
    if (Number(row.triage_split_candidate_count || 0) < 1) errors.push(`${prefix} split decision requires at least one split candidate`)
  }
  if (row.reviewer_decision === 'needs_source_anchor_evidence') {
    if (row.triage_work_path !== 'source_anchor_evidence_gap_review') errors.push(`${prefix} evidence decision must use source_anchor_evidence_gap_review`)
    if (Number(row.triage_source_anchor_evidence_request_count || 0) < 1) {
      errors.push(`${prefix} evidence decision requires at least one source-anchor evidence request`)
    }
  }
}

function auditRows(rows, templateByGroup, worklistMap, args, errors, stats) {
  const seenGroups = new Set()
  const seenDecisionIds = new Set()
  for (const row of rows || []) {
    const prefix = row.progression_group_id || row.decision_id || '(missing triage decision)'
    if (!row.decision_id) errors.push(`${prefix} missing decision_id`)
    if (!row.progression_group_id) errors.push(`${prefix} missing progression_group_id`)
    if (row.decision_id && seenDecisionIds.has(row.decision_id)) errors.push(`${prefix} duplicate decision_id`)
    else if (row.decision_id) seenDecisionIds.add(row.decision_id)
    if (row.progression_group_id && seenGroups.has(row.progression_group_id)) errors.push(`${prefix} duplicate progression_group_id`)
    else if (row.progression_group_id) seenGroups.add(row.progression_group_id)

    if (FORBIDDEN_DECISIONS.has(row.reviewer_decision)) {
      errors.push(`${prefix} forbidden triage reviewer_decision ${row.reviewer_decision}`)
    }
    if (!TRIAGE_DECISIONS.has(row.reviewer_decision)) {
      errors.push(`${prefix} reviewer_decision must be a non-approval triage decision`)
    }
    if (row.triage_candidate !== true) errors.push(`${prefix} triage_candidate must be true`)
    if (row.decision_status !== 'triage_candidate_reviewed') errors.push(`${prefix} decision_status must be triage_candidate_reviewed`)
    if (!hasValue(row.reviewed_by)) errors.push(`${prefix} reviewed_by is required`)
    if (!validReviewDate(row.reviewed_at)) errors.push(`${prefix} reviewed_at must start with YYYY-MM-DD`)
    if (!hasValue(row.decision_note)) errors.push(`${prefix} decision_note is required`)
    if (!Array.isArray(row.standard_codes) || !row.standard_codes.length) errors.push(`${prefix} standard_codes must be non-empty`)
    if (!Array.isArray(row.unit_evidence_ids) || !row.unit_evidence_ids.length) errors.push(`${prefix} unit_evidence_ids must be non-empty`)
    if (!Array.isArray(row.sample_items) || !row.sample_items.length) errors.push(`${prefix} sample_items must be non-empty`)

    const confirmations = row.required_confirmations || {}
    for (const field of REQUIRED_CONFIRMATIONS) {
      if (confirmations[field] !== true) errors.push(`${prefix} required_confirmations.${field} must be true`)
    }
    auditPolicy(row, prefix, errors)

    const templateRow = templateByGroup.get(row.progression_group_id)
    const item = worklistMap.get(row.progression_group_id)
    if (!templateRow) errors.push(`${prefix} missing source decision template row`)
    else auditTemplateLineage(row, templateRow, prefix, errors)
    if (!item) errors.push(`${prefix} missing action worklist item`)
    else auditDecisionAgainstWorkItem(row, item, prefix, errors)

    if (row.reviewer_decision === 'needs_source_anchor_evidence') {
      stats.source_anchor_evidence_requests += Number(row.triage_source_anchor_evidence_request_count || 0)
    }
    if (row.reviewer_decision === 'split_or_refine_group_scope') {
      stats.split_candidate_rows += Number(row.triage_split_candidate_count || 0)
    }
    stats.total_anchor_items += Number(row.triage_total_anchor_items || 0)
    if (row.reviewer_decision === 'pending') stats.pending_group_decisions += 1
    else stats.completed_group_decisions += 1
    countInto(stats.by_priority_tier, row.priority_tier)
    countInto(stats.by_recommendation_confidence, row.triage_recommendation_confidence)
    countInto(stats.by_reviewer_decision, row.reviewer_decision)
    countInto(stats.by_review_strategy, row.review_strategy)
    countInto(stats.by_subject, row.subject_slug)
    countInto(stats.by_work_path, row.triage_work_path)
  }

  for (const groupId of templateByGroup.keys()) {
    if (!seenGroups.has(groupId)) errors.push(`${groupId} missing triage decision from candidate`)
  }
  for (const groupId of worklistMap.keys()) {
    if (!seenGroups.has(groupId)) errors.push(`${groupId} worklist item missing triage decision`)
  }
  if (args.requireGroups && !seenGroups.size) errors.push('requireGroups is set but no triage decision rows were found')
  if (args.requireComplete && stats.pending_group_decisions > 0) {
    errors.push(`requireComplete is set but ${stats.pending_group_decisions} triage decisions are pending`)
  }
}

function compareSummary(triage, stats, errors) {
  const summary = triage.summary || {}
  const scalarChecks = [
    ['group_decisions', stats.group_decisions],
    ['completed_group_decisions', stats.completed_group_decisions],
    ['pending_group_decisions', stats.pending_group_decisions],
    ['source_anchor_evidence_requests', stats.source_anchor_evidence_requests],
    ['split_candidate_rows', stats.split_candidate_rows],
    ['total_anchor_items', stats.total_anchor_items]
  ]
  for (const [field, expected] of scalarChecks) {
    if (Number(summary[field] || 0) !== Number(expected || 0)) errors.push(`summary.${field} must match audited rows`)
  }
  for (const [field, expected] of [
    ['by_priority_tier', stats.by_priority_tier],
    ['by_recommendation_confidence', stats.by_recommendation_confidence],
    ['by_reviewer_decision', stats.by_reviewer_decision],
    ['by_review_strategy', stats.by_review_strategy],
    ['by_subject', stats.by_subject],
    ['by_work_path', stats.by_work_path]
  ]) {
    if (!sameJson(summary[field] || {}, expected)) errors.push(`summary.${field} must match audited rows`)
  }
}

function previewRows(rows) {
  return rows.slice(0, 60).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.progression_group_id)} | ${markdownCell(row.reviewer_decision)} | ${markdownCell(row.triage_work_path)} | ${row.triage_split_candidate_count || 0} | ${row.triage_source_anchor_evidence_request_count || 0} |`
  )).join('\n') || '| - | - | - | - | - | 0 | 0 |'
}

function markdownSummary(result) {
  return `# H4G Anchor Group Triage Decisions Candidate Audit

Generated at: ${result.generated_at}

This audit verifies the non-approval triage candidate for English/PE H4G anchor
groups. Passing this audit means the candidate closed the pending group-level
triage queue into split/refine or source-anchor evidence routes only. It does
not make any group matcher-ready or publication-ready.

## Status

| Field | Value |
| --- | ---: |
| valid | ${result.valid} |
| group review complete | ${result.group_review_complete} |
| require complete | ${result.require_complete} |
| triage decisions | ${result.summary.group_decisions} |
| completed decisions | ${result.summary.completed_group_decisions} |
| pending decisions | ${result.summary.pending_group_decisions} |
| split candidate rows | ${result.summary.split_candidate_rows} |
| source-anchor evidence requests | ${result.summary.source_anchor_evidence_requests} |
| matcher ready | ${result.matcher_ready} |
| publication ready | ${result.publication_ready} |

## Decisions

| decision | groups |
| --- | ---: |
${countRows(result.summary.by_reviewer_decision)}

## Work Paths

| work path | groups |
| --- | ---: |
${countRows(result.summary.by_work_path)}

## Subjects

| subject | groups |
| --- | ---: |
${countRows(result.summary.by_subject)}

## Preview

| rank | subject | progression group | decision | work path | split candidates | evidence requests |
| ---: | --- | --- | --- | --- | ---: | ---: |
${previewRows(result.triage_decision_preview)}

## Guardrails

- ready_for_item_level_source_review is forbidden in this candidate.
- Every row must match the action worklist recommendation and preserve source decision-template lineage.
- Public data writes, official text changes, H4G eligibility, direct matcher use, matcher readiness, and publication readiness stay disabled.

## Errors

${result.errors.length ? result.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  for (const [label, path] of [
    ['triage decisions candidate', args.triageDecisions],
    ['source decisions template', args.decisionsTemplate],
    ['action worklist', args.worklist]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const triage = errors.length ? { group_review_decisions: [] } : readJson(args.triageDecisions)
  const template = errors.length ? { group_review_decisions: [] } : readJson(args.decisionsTemplate)
  const worklist = errors.length ? { action_work_items: [] } : readJson(args.worklist)
  if (!errors.length) auditTopLevel(triage, template, worklist, args, errors)

  const rows = triage.group_review_decisions || []
  const templateRows = template.group_review_decisions || []
  if (!Array.isArray(rows)) errors.push('triage group_review_decisions must be an array')
  if (!Array.isArray(templateRows)) errors.push('template group_review_decisions must be an array')
  if (!Array.isArray(worklist.action_work_items)) errors.push('worklist action_work_items must be an array')

  const templateByGroup = mapByGroup(templateRows, 'template', errors)
  const worklistMap = worklistByGroup(worklist, errors)
  const stats = {
    by_priority_tier: {},
    by_recommendation_confidence: {},
    by_reviewer_decision: {},
    by_review_strategy: {},
    by_subject: {},
    by_work_path: {},
    completed_group_decisions: 0,
    group_decisions: rows.length,
    pending_group_decisions: 0,
    source_anchor_evidence_requests: 0,
    split_candidate_rows: 0,
    total_anchor_items: 0
  }
  auditRows(rows, templateByGroup, worklistMap, args, errors, stats)
  compareSummary(triage, stats, errors)
  if (triage.group_review_complete !== true) errors.push('triage group_review_complete must be true')
  if (stats.pending_group_decisions > 0) errors.push('triage candidate must not contain pending decisions')

  const result = {
    changes_official_standard_text: false,
    decisions_template: args.decisionsTemplate,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    group_review_complete: stats.pending_group_decisions === 0 && errors.length === 0,
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_triage_decisions_candidate_audit',
    require_complete: args.requireComplete,
    summary: stats,
    triage_decision_preview: rows.slice(0, 60),
    triage_decisions: args.triageDecisions,
    valid: errors.length === 0,
    worklist: args.worklist,
    writes_public_data: false
  }
  writeJson(args.out, result)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(result))
  console.log(JSON.stringify(stable(result), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
