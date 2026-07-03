#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_MATRIX = 'generated/textbook_evidence/h4g_theme_bridge_anchor_priority_matrix_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_template_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_template_anchor_domain_rejected_english_pe_audit.md'

const GROUP_DECISIONS = new Set([
  'pending',
  'ready_for_item_level_source_review',
  'needs_source_anchor_evidence',
  'reject_group_anchor_path',
  'split_or_refine_group_scope'
])

const NON_PENDING_CONFIRMATIONS = [
  'source_items_reviewed',
  'same_subject_scope_checked',
  'same_grade_scope_checked',
  'fanout_risk_reviewed',
  'official_standard_text_preserved',
  'no_public_write_requested'
]

const READY_CONFIRMATIONS = [
  ...NON_PENDING_CONFIRMATIONS,
  'anchor_type_matches_target_domain',
  'group_scope_is_bounded',
  'item_level_review_still_required'
]

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    matrix: DEFAULT_MATRIX,
    out: DEFAULT_OUT,
    requireComplete: false,
    requireGroups: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--matrix') args.matrix = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-complete') args.requireComplete = true
    else if (item === '--require-groups') args.requireGroups = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_decisions.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_template_anchor_domain_rejected_english_pe.json \\
  --matrix generated/textbook_evidence/h4g_theme_bridge_anchor_priority_matrix_anchor_domain_rejected_english_pe.json \\
  --strict --require-groups

Audits editable group-level H4G anchor review decisions. Pending decisions are
valid by default. Use --require-complete after a curriculum/source review pass.`)
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

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function validReviewDate(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value || ''))
}

function matrixGroups(matrix) {
  return new Map((matrix.priority_groups || []).map(group => [group.progression_group_id, group]))
}

function arraysMatch(actual, expected) {
  return JSON.stringify([...(actual || [])].map(String).sort()) === JSON.stringify([...(expected || [])].map(String).sort())
}

function policyFields(row) {
  return row.publication_policy || {}
}

function auditTopLevel(decisions, matrix, errors) {
  if (matrix.valid !== true) errors.push('priority matrix valid must be true')
  if (matrix.purpose !== 'h4g_subject_theme_bridge_anchor_priority_matrix') {
    errors.push('priority matrix purpose must be h4g_subject_theme_bridge_anchor_priority_matrix')
  }
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_anchor_group_decisions_template')
  }
  if (decisions.publication_ready !== false) errors.push('decisions publication_ready must be false')
  if (decisions.publication_candidate !== false) errors.push('decisions publication_candidate must be false')
  if (decisions.matcher_ready !== false) errors.push('decisions matcher_ready must be false')
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.changes_official_standard_text !== false) errors.push('decisions changes_official_standard_text must be false')
  if (decisions.eligible_for_h4g_differentiation !== false) errors.push('decisions eligible_for_h4g_differentiation must be false')
  if (decisions.direct_matcher_use !== false) errors.push('decisions direct_matcher_use must be false')
}

function auditPolicy(row, prefix, errors) {
  if (row.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (row.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (row.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
  if (row.requested_eligible_for_h4g_differentiation !== false) errors.push(`${prefix} requested_eligible_for_h4g_differentiation must be false`)
  const policy = policyFields(row)
  if (policy.writes_public_data !== false) errors.push(`${prefix} publication_policy.writes_public_data must be false`)
  if (policy.changes_official_standard_text !== false) errors.push(`${prefix} publication_policy.changes_official_standard_text must be false`)
  if (policy.direct_matcher_use !== false) errors.push(`${prefix} publication_policy.direct_matcher_use must be false`)
  if (policy.eligible_for_h4g_differentiation !== false) errors.push(`${prefix} publication_policy.eligible_for_h4g_differentiation must be false`)
  if (policy.requires_later_item_decision_gate !== true) errors.push(`${prefix} publication_policy.requires_later_item_decision_gate must be true`)
  if (policy.requires_later_matcher_gate !== true) errors.push(`${prefix} publication_policy.requires_later_matcher_gate must be true`)
  if (policy.requires_later_publication_gate !== true) errors.push(`${prefix} publication_policy.requires_later_publication_gate must be true`)
}

function requireFilledDecision(row, prefix, errors) {
  if (!hasValue(row.reviewed_by)) errors.push(`${prefix} reviewed_by is required after a non-pending decision`)
  if (!validReviewDate(row.reviewed_at)) errors.push(`${prefix} reviewed_at must start with YYYY-MM-DD after a non-pending decision`)
  if (!hasValue(row.decision_note)) errors.push(`${prefix} decision_note is required after a non-pending decision`)
}

function requireConfirmations(row, prefix, fields, errors) {
  const confirmations = row.required_confirmations || {}
  for (const field of fields) {
    if (confirmations[field] !== true) errors.push(`${prefix} required_confirmations.${field} must be true`)
  }
}

function compareToMatrixGroup(row, group, prefix, errors) {
  const scalarChecks = [
    ['subject_slug', row.subject_slug, group.subject_slug],
    ['priority_rank', row.priority_rank, group.priority_rank],
    ['priority_tier', row.priority_tier, group.priority_tier],
    ['review_strategy', row.review_strategy, group.review_strategy],
    ['total_items', row.total_items, group.total_items]
  ]
  for (const [field, actual, expected] of scalarChecks) {
    if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} ${field} must match priority matrix`)
  }
  const arrayChecks = [
    ['action_families', row.action_families, group.action_families],
    ['anchor_types', row.anchor_types, group.anchor_types],
    ['grade_bands', row.grade_bands, group.grade_bands],
    ['missing_grade_bands', row.missing_grade_bands, group.missing_grade_bands],
    ['remediation_item_ids', row.remediation_item_ids, group.remediation_item_ids],
    ['standard_codes', row.standard_codes, group.standard_codes],
    ['unit_evidence_ids', row.unit_evidence_ids, group.unit_evidence_ids]
  ]
  for (const [field, actual, expected] of arrayChecks) {
    if (!arraysMatch(actual, expected)) errors.push(`${prefix} ${field} must match priority matrix`)
  }
}

function auditRows(rows, matrixMap, args, errors, stats) {
  const seenDecisionIds = new Set()
  const seenGroupIds = new Set()
  for (const row of rows || []) {
    const prefix = row.progression_group_id || row.decision_id || '(missing group decision)'
    if (!row.decision_id) errors.push(`${prefix} missing decision_id`)
    if (!row.progression_group_id) errors.push(`${prefix} missing progression_group_id`)
    if (row.decision_id && seenDecisionIds.has(row.decision_id)) errors.push(`${prefix} duplicate decision_id`)
    else if (row.decision_id) seenDecisionIds.add(row.decision_id)
    if (row.progression_group_id && seenGroupIds.has(row.progression_group_id)) errors.push(`${prefix} duplicate progression_group_id`)
    else if (row.progression_group_id) seenGroupIds.add(row.progression_group_id)
    if (row.surface_id !== 'subject_theme_anchor_priority_group') errors.push(`${prefix} surface_id must be subject_theme_anchor_priority_group`)
    if (row.decision_type !== 'subject_theme_anchor_priority_group_decision') errors.push(`${prefix} decision_type must be subject_theme_anchor_priority_group_decision`)
    if (!GROUP_DECISIONS.has(row.reviewer_decision)) errors.push(`${prefix} invalid reviewer_decision ${row.reviewer_decision || 'missing'}`)
    if (!Array.isArray(row.sample_items) || !row.sample_items.length) errors.push(`${prefix} sample_items must be non-empty`)
    if (!Array.isArray(row.standard_codes) || !row.standard_codes.length) errors.push(`${prefix} standard_codes must be non-empty`)
    if (!Array.isArray(row.unit_evidence_ids) || !row.unit_evidence_ids.length) errors.push(`${prefix} unit_evidence_ids must be non-empty`)
    auditPolicy(row, prefix, errors)

    const group = matrixMap.get(row.progression_group_id)
    if (!group) errors.push(`${prefix} not found in priority matrix`)
    else compareToMatrixGroup(row, group, prefix, errors)

    if (row.reviewer_decision !== 'pending') {
      requireFilledDecision(row, prefix, errors)
      requireConfirmations(row, prefix, NON_PENDING_CONFIRMATIONS, errors)
      stats.completed_group_decisions += 1
    } else {
      stats.pending_group_decisions += 1
    }
    if (row.reviewer_decision === 'ready_for_item_level_source_review') {
      requireConfirmations(row, prefix, READY_CONFIRMATIONS, errors)
    }
    if (row.reviewer_decision === 'reject_group_anchor_path' && !hasValue(row.decision_note)) {
      errors.push(`${prefix} decision_note must explain rejected group anchor path`)
    }
    if (row.reviewer_decision === 'split_or_refine_group_scope' && !hasValue(row.decision_note)) {
      errors.push(`${prefix} decision_note must explain split/refinement needed`)
    }
    countInto(stats.by_priority_tier, row.priority_tier)
    countInto(stats.by_reviewer_decision, row.reviewer_decision)
    countInto(stats.by_review_strategy, row.review_strategy)
    countInto(stats.by_subject, row.subject_slug)
  }
  for (const groupId of matrixMap.keys()) {
    if (!seenGroupIds.has(groupId)) errors.push(`${groupId} missing group decision`)
  }
}

function markdownSummary(result) {
  return `# H4G Subject Theme Bridge Anchor Group Decisions Audit

Generated at: ${result.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${result.valid} |
| group review complete | ${result.group_review_complete} |
| publication ready | ${result.publication_ready} |
| matcher ready | ${result.matcher_ready} |
| require complete | ${result.require_complete} |
| required group decisions | ${result.summary.required_group_decisions} |
| completed group decisions | ${result.summary.completed_group_decisions} |
| pending group decisions | ${result.summary.pending_group_decisions} |

## Decisions By Status

| decision | groups |
| --- | ---: |
${countRows(result.summary.by_reviewer_decision)}

## Subjects

| subject | groups |
| --- | ---: |
${countRows(result.summary.by_subject)}

## Review Strategies

| strategy | groups |
| --- | ---: |
${countRows(result.summary.by_review_strategy)}

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
  for (const [label, path] of [['decisions', args.decisions], ['matrix', args.matrix]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (errors.length) {
    const result = { errors, valid: false }
    console.log(JSON.stringify(result, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const decisions = readJson(args.decisions)
  const matrix = readJson(args.matrix)
  auditTopLevel(decisions, matrix, errors)
  const matrixMap = matrixGroups(matrix)
  const rows = decisions.group_review_decisions || []
  if (!Array.isArray(rows)) errors.push('group_review_decisions must be an array')
  if (args.requireGroups && !rows.length) errors.push('requireGroups is set but decisions has no group rows')
  const stats = {
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_review_strategy: {},
    by_subject: {},
    completed_group_decisions: 0,
    pending_group_decisions: 0,
    required_group_decisions: matrixMap.size
  }
  auditRows(rows, matrixMap, args, errors, stats)
  if (args.requireComplete && stats.pending_group_decisions > 0) {
    errors.push(`requireComplete is set but ${stats.pending_group_decisions} group decisions are pending`)
  }

  const result = {
    decisions: args.decisions,
    errors,
    generated_at: new Date().toISOString(),
    group_review_complete: stats.pending_group_decisions === 0 && errors.length === 0,
    matcher_ready: false,
    matrix: args.matrix,
    publication_ready: false,
    require_complete: args.requireComplete,
    summary: stats,
    valid: errors.length === 0
  }
  writeJson(args.out, result)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(result))
  console.log(JSON.stringify(stable(result), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
