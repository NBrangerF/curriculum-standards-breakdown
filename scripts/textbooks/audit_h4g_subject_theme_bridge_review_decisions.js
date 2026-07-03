#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_template.json'
const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_packet.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_audit.md'

const BRIDGE_DECISIONS = new Set([
  'pending',
  'approve_standard_scoped_subject_theme_bridge',
  'approve_progression_group_subject_theme_bridge',
  'reject_subject_theme_bridge',
  'needs_revision'
])

const APPROVAL_DECISIONS = new Set([
  'approve_standard_scoped_subject_theme_bridge',
  'approve_progression_group_subject_theme_bridge'
])

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    packet: DEFAULT_PACKET,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireComplete: false,
    requirePageReadyForApproval: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--packet') args.packet = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-complete') args.requireComplete = true
    else if (item === '--require-page-ready-for-approval') args.requirePageReadyForApproval = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_review_decisions.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \\
  --packet generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe.json \\
  --strict

Audits an editable H4G subject theme bridge source-review decisions file.
Pending decisions are valid by default. Use --require-complete after a human or
curriculum review pass, and --require-page-ready-for-approval when approvals
must also be publication-page eligible.`)
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

function bridgeByReviewId(packet) {
  return new Map((packet.bridge_review_candidates || []).map(row => [row.review_id, row]))
}

function policyFields(row) {
  return row.publication_policy || {}
}

function auditTopLevel(decisions, packet, errors) {
  if (packet.valid !== true) errors.push('source packet valid must be true')
  if (packet.purpose !== 'h4g_subject_theme_bridge_review_packet') errors.push('source packet purpose must be h4g_subject_theme_bridge_review_packet')
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_review_decisions_template')
  }
  if (decisions.publication_ready !== false) errors.push('decisions publication_ready must be false')
  if (decisions.matcher_ready !== false) errors.push('decisions matcher_ready must be false')
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.changes_official_standard_text !== false) errors.push('decisions changes_official_standard_text must be false')
  if (decisions.eligible_for_h4g_differentiation !== false) errors.push('decisions eligible_for_h4g_differentiation must be false')
  if (decisions.direct_matcher_use !== false) errors.push('decisions direct_matcher_use must be false')
  const policy = decisions.publication_policy || {}
  if (policy.writes_public_data !== false) errors.push('publication_policy.writes_public_data must be false')
  if (policy.changes_official_standard_text !== false) errors.push('publication_policy.changes_official_standard_text must be false')
  if (policy.eligible_for_h4g_differentiation !== false) errors.push('publication_policy.eligible_for_h4g_differentiation must be false')
  if (policy.direct_matcher_use !== false) errors.push('publication_policy.direct_matcher_use must be false')
  if (policy.requires_later_matcher_gate !== true) errors.push('publication_policy.requires_later_matcher_gate must be true')
  if (policy.requires_later_publication_gate !== true) errors.push('publication_policy.requires_later_publication_gate must be true')
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

function requiredApprovalConfirmations(row) {
  const base = [
    'source_text_reviewed',
    'same_subject_confirmed',
    'same_grade_confirmed',
    'topic_not_generic',
    'page_evidence_checked',
    'approved_scope_is_bounded',
    'official_standard_text_preserved',
    'no_public_write_requested'
  ]
  if (row.reviewer_decision === 'approve_standard_scoped_subject_theme_bridge') {
    base.push('exact_standard_to_unit_relationship_confirmed')
  }
  if (row.reviewer_decision === 'approve_progression_group_subject_theme_bridge') {
    base.push('curriculum_progression_scope_reviewed')
  }
  return base
}

function compareToCandidate(row, candidate, prefix, errors) {
  const checks = [
    ['subject_slug', row.subject_slug, candidate.subject_slug],
    ['grade_band', row.grade_band, candidate.grade_band],
    ['unit_grade_band', row.unit_grade_band, candidate.unit_grade_band],
    ['standard_code', row.standard_code, candidate.standard_code],
    ['progression_group_id', row.progression_group_id, candidate.progression_group_id],
    ['unit_evidence_id', row.unit_evidence_id, candidate.unit_evidence_id],
    ['textbook_evidence_id', row.textbook_evidence_id, candidate.textbook_evidence_id]
  ]
  for (const [field, actual, expected] of checks) {
    if (String(actual || '') !== String(expected || '')) {
      errors.push(`${prefix} ${field} must match source packet`)
    }
  }
  if (candidate.grade_band !== candidate.unit_grade_band) {
    errors.push(`${prefix} source candidate is cross-grade and cannot be approved`)
  }
  if (candidate.writes_public_data !== false) errors.push(`${prefix} source candidate writes_public_data must be false`)
  if (candidate.changes_official_standard_text !== false) errors.push(`${prefix} source candidate changes_official_standard_text must be false`)
  if (candidate.eligible_for_h4g_differentiation !== false) errors.push(`${prefix} source candidate eligible_for_h4g_differentiation must be false`)
  if (candidate.requires_source_review !== true) errors.push(`${prefix} source candidate requires_source_review must be true`)
}

function auditDecisionPolicy(row, prefix, errors) {
  if (row.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (row.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (row.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
  if (row.requested_eligible_for_h4g_differentiation !== false) errors.push(`${prefix} requested_eligible_for_h4g_differentiation must be false`)
  const policy = policyFields(row)
  if (policy.writes_public_data !== false) errors.push(`${prefix} publication_policy.writes_public_data must be false`)
  if (policy.changes_official_standard_text !== false) errors.push(`${prefix} publication_policy.changes_official_standard_text must be false`)
  if (policy.eligible_for_h4g_differentiation !== false) errors.push(`${prefix} publication_policy.eligible_for_h4g_differentiation must be false`)
  if (policy.direct_matcher_use !== false) errors.push(`${prefix} publication_policy.direct_matcher_use must be false`)
  if (policy.requires_later_matcher_gate !== true) errors.push(`${prefix} publication_policy.requires_later_matcher_gate must be true`)
  if (policy.requires_later_publication_gate !== true) errors.push(`${prefix} publication_policy.requires_later_publication_gate must be true`)
}

function auditApprovalScope(row, prefix, errors) {
  const scope = row.approval_scope || {}
  if (row.reviewer_decision === 'approve_standard_scoped_subject_theme_bridge') {
    if (scope.scope_type !== 'standard_code') errors.push(`${prefix} approval_scope.scope_type must be standard_code`)
    if (scope.standard_code !== row.standard_code) errors.push(`${prefix} approval_scope.standard_code must match standard_code`)
  }
  if (row.reviewer_decision === 'approve_progression_group_subject_theme_bridge') {
    if (scope.scope_type !== 'progression_group') errors.push(`${prefix} approval_scope.scope_type must be progression_group`)
    if (scope.progression_group_id !== row.progression_group_id) errors.push(`${prefix} approval_scope.progression_group_id must match progression_group_id`)
  }
  if (scope.grade_band !== row.grade_band) errors.push(`${prefix} approval_scope.grade_band must match grade_band`)
  if (scope.unit_evidence_id !== row.unit_evidence_id) errors.push(`${prefix} approval_scope.unit_evidence_id must match unit_evidence_id`)
}

function auditBridgeDecisions(rows, packetMap, args, errors, warnings, stats) {
  const seenReviewIds = new Set()
  const seenDecisionIds = new Set()
  for (const row of rows || []) {
    const prefix = row.source_review_id || row.decision_id || '(missing bridge decision)'
    if (!row.decision_id) errors.push(`${prefix} missing decision_id`)
    if (!row.source_review_id) errors.push(`${prefix} missing source_review_id`)
    if (row.decision_id && seenDecisionIds.has(row.decision_id)) errors.push(`${prefix} duplicate decision_id`)
    else if (row.decision_id) seenDecisionIds.add(row.decision_id)
    if (row.source_review_id && seenReviewIds.has(row.source_review_id)) errors.push(`${prefix} duplicate source_review_id`)
    else if (row.source_review_id) seenReviewIds.add(row.source_review_id)
    if (row.surface_id !== 'subject_theme_bridge_candidate') errors.push(`${prefix} surface_id must be subject_theme_bridge_candidate`)
    if (row.decision_type !== 'subject_theme_bridge_candidate_decision') errors.push(`${prefix} decision_type must be subject_theme_bridge_candidate_decision`)
    if (!BRIDGE_DECISIONS.has(row.reviewer_decision)) errors.push(`${prefix} invalid reviewer_decision ${row.reviewer_decision || 'missing'}`)
    if (!Array.isArray(row.shared_topic_tags) || !row.shared_topic_tags.length) errors.push(`${prefix} shared_topic_tags must be non-empty`)
    if (row.grade_band !== row.unit_grade_band) errors.push(`${prefix} grade_band must equal unit_grade_band`)
    auditDecisionPolicy(row, prefix, errors)

    const candidate = packetMap.get(row.source_review_id)
    if (!candidate) errors.push(`${prefix} not found in source bridge review packet`)
    else compareToCandidate(row, candidate, prefix, errors)

    if (row.reviewer_decision !== 'pending') requireFilledDecision(row, prefix, errors)
    if (APPROVAL_DECISIONS.has(row.reviewer_decision)) {
      requireConfirmations(row, prefix, requiredApprovalConfirmations(row), errors)
      auditApprovalScope(row, prefix, errors)
      if (row.page_ready !== true) {
        const message = `${prefix} approved bridge lacks page-ready evidence`
        if (args.requirePageReadyForApproval) errors.push(message)
        else warnings.push(`${message}; it cannot enter publication gate until page evidence is recovered`)
      }
      stats.approved_bridge_decisions += 1
      if (row.page_ready) stats.page_ready_approved_bridge_decisions += 1
      else stats.page_missing_approved_bridge_decisions += 1
    }
    if (row.reviewer_decision === 'pending') stats.pending_source_review_decisions += 1
    else stats.completed_source_review_decisions += 1
    if (row.page_ready) stats.page_ready_decisions += 1
    else stats.page_missing_decisions += 1
    countInto(stats.by_reviewer_decision, row.reviewer_decision)
    countInto(stats.by_subject, row.subject_slug)
    countInto(stats.by_grade_band, row.grade_band)
    countInto(stats.by_page_status, row.page_range_status || (row.page_ready ? 'ready' : 'missing'))
  }

  for (const reviewId of packetMap.keys()) {
    if (!seenReviewIds.has(reviewId)) errors.push(`${reviewId} missing bridge review decision`)
  }
}

function markdownSummary(result) {
  return `# H4G Subject Theme Bridge Review Decisions Audit

Generated at: ${result.generated_at}

## Decision

| Field | Value |
| --- | ---: |
| valid | ${result.valid} |
| source review complete | ${result.source_review_complete} |
| publication ready | ${result.publication_ready} |
| matcher ready | ${result.matcher_ready} |
| require complete | ${result.require_complete} |
| require page-ready for approval | ${result.require_page_ready_for_approval} |
| pending source review decisions | ${result.summary.pending_source_review_decisions} |

## Counts

| Metric | Count |
| --- | ---: |
| required source review decisions | ${result.summary.required_source_review_decisions} |
| completed source review decisions | ${result.summary.completed_source_review_decisions} |
| pending source review decisions | ${result.summary.pending_source_review_decisions} |
| approved bridge decisions | ${result.summary.approved_bridge_decisions} |
| page-ready approved bridge decisions | ${result.summary.page_ready_approved_bridge_decisions} |
| page-missing approved bridge decisions | ${result.summary.page_missing_approved_bridge_decisions} |

## Decisions By Status

| Decision | Count |
| --- | ---: |
${countRows(result.summary.by_reviewer_decision)}

## Decisions By Subject

| Subject | Count |
| --- | ---: |
${countRows(result.summary.by_subject)}

## Errors

${result.errors.length ? result.errors.map(error => `- ${error}`).join('\n') : '- none'}

## Warnings

${result.warnings.length ? result.warnings.map(warning => `- ${warning}`).join('\n') : '- none'}

## Interpretation

This audit validates source-review decisions for subject theme bridge candidates.
It intentionally keeps \`publication_ready=false\` and \`matcher_ready=false\`;
approved bridge decisions still require a later matcher gate and reviewed
publication gate before any runtime data can change.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const startupErrors = []
  for (const [label, path] of [
    ['decisions file', args.decisions],
    ['source packet', args.packet]
  ]) {
    if (!existsSync(path)) startupErrors.push(`Missing ${label}: ${path}`)
  }
  if (startupErrors.length) {
    const result = { valid: false, errors: startupErrors, warnings: [] }
    console.log(JSON.stringify(result, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const decisions = readJson(args.decisions)
  const packet = readJson(args.packet)
  const errors = []
  const warnings = []
  const stats = {
    approved_bridge_decisions: 0,
    by_grade_band: {},
    by_page_status: {},
    by_reviewer_decision: {},
    by_subject: {},
    completed_source_review_decisions: 0,
    page_missing_approved_bridge_decisions: 0,
    page_missing_decisions: 0,
    page_ready_approved_bridge_decisions: 0,
    page_ready_decisions: 0,
    pending_source_review_decisions: 0
  }

  auditTopLevel(decisions, packet, errors)
  const packetMap = bridgeByReviewId(packet)
  auditBridgeDecisions(decisions.bridge_review_decisions || [], packetMap, args, errors, warnings, stats)

  const requiredSourceReviewDecisions = packetMap.size
  if (stats.pending_source_review_decisions > 0) {
    warnings.push(`${stats.pending_source_review_decisions} source review decisions are still pending`)
  }
  if (args.requireComplete && stats.pending_source_review_decisions > 0) {
    errors.push(`requireComplete is set but ${stats.pending_source_review_decisions} source review decisions are pending`)
  }

  const result = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    decisions: args.decisions,
    source_review_packet: args.packet,
    require_complete: args.requireComplete,
    require_page_ready_for_approval: args.requirePageReadyForApproval,
    source_review_complete: stats.pending_source_review_decisions === 0 && errors.length === 0,
    publication_ready: false,
    matcher_ready: false,
    summary: {
      ...stats,
      required_source_review_decisions: requiredSourceReviewDecisions
    },
    errors,
    warnings
  }

  writeJson(args.out, result)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(result))
  console.log(JSON.stringify(stable(result), null, 2))
  if (args.strict && !result.valid) process.exit(1)
}

main()
