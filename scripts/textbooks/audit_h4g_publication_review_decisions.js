#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const BASE_DIR = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean'
const DEFAULT_DECISIONS = `${BASE_DIR}/h4g_publication_review_decisions_template.json`
const DEFAULT_REVIEW_PACKET = `${BASE_DIR}/h4g_publication_review_packet.json`
const DEFAULT_CONTRACT = `${BASE_DIR}/h4g_publication_contract_candidate.json`
const DEFAULT_OUT = `${BASE_DIR}/h4g_publication_review_decisions_audit.json`
const DEFAULT_SUMMARY_OUT = `${BASE_DIR}/h4g_publication_review_decisions_audit.md`

const SAME_GRADE_DECISIONS = new Set([
  'pending',
  'approve_same_grade_unit_evidence',
  'reject_same_grade_unit_evidence',
  'needs_revision'
])
const NOTE_DECISIONS = new Set([
  'pending',
  'approve_progression_group_note',
  'reject_progression_group_note',
  'needs_revision'
])
const BLOCKED_DECISIONS = new Set([
  'pending',
  'keep_blocked',
  'needs_targeted_remediation'
])

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    reviewPacket: DEFAULT_REVIEW_PACKET,
    contract: DEFAULT_CONTRACT,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireComplete: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--review-packet') args.reviewPacket = argv[++i]
    else if (item === '--contract') args.contract = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-complete') args.requireComplete = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_publication_review_decisions.js \\
  --strict

Audits the editable H4G publication review decisions file. Pending decisions
are valid by default; use --require-complete when a filled review file is
expected. This audit never marks public publication ready.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
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

function reviewPacketMaps(reviewPacket) {
  return {
    sameGradeByCode: new Map((reviewPacket.same_grade_unit_reviews || []).map(row => [row.standard_code, row])),
    noteByGroup: new Map((reviewPacket.edition_placement_note_reviews || []).map(row => [row.progression_group_id, row])),
    blockedByReview: new Map((reviewPacket.blocked_reviews || []).map(row => [row.review_id, row]))
  }
}

function contractMaps(contract) {
  return {
    standardDrafts: new Map((contract.contract_drafts?.standard_unit_evidence || []).map(row => [row.standard_code, row])),
    noteDrafts: new Map((contract.contract_drafts?.progression_group_edition_placement_notes || []).map(row => [row.progression_group_id, row])),
    blockedDrafts: new Map((contract.contract_drafts?.blocked_review_registry || []).map(row => [row.grain_key, row]))
  }
}

function requireFilledDecision(row, prefix, errors) {
  if (!hasValue(row.reviewed_by)) errors.push(`${prefix} reviewed_by is required after a non-pending decision`)
  if (!validReviewDate(row.reviewed_at)) errors.push(`${prefix} reviewed_at must start with YYYY-MM-DD after a non-pending decision`)
  if (!hasValue(row.decision_note)) errors.push(`${prefix} decision_note is required after a non-pending decision`)
}

function requireConfirmations(row, prefix, required, errors) {
  const confirmations = row.required_confirmations || {}
  for (const field of required) {
    if (confirmations[field] !== true) errors.push(`${prefix} required_confirmations.${field} must be true`)
  }
}

function auditCommon(row, expectedSurface, allowedDecisions, prefix, errors) {
  if (!row.decision_id) errors.push(`${prefix} missing decision_id`)
  if (row.surface_id !== expectedSurface) errors.push(`${prefix} surface_id must be ${expectedSurface}`)
  if (!allowedDecisions.has(row.reviewer_decision)) {
    errors.push(`${prefix} invalid reviewer_decision ${row.reviewer_decision || 'missing'}`)
  }
  if (row.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (row.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
}

function auditSameGrade(rows, packetMaps, contractMaps, errors, stats) {
  const seen = new Set()
  for (const row of rows || []) {
    const prefix = row.standard_code || row.decision_id || '(missing standard decision)'
    auditCommon(row, 'standard_same_grade_unit_evidence', SAME_GRADE_DECISIONS, prefix, errors)
    if (!row.standard_code) errors.push(`${prefix} missing standard_code`)
    if (seen.has(row.standard_code)) errors.push(`${prefix} duplicate same-grade decision`)
    else if (row.standard_code) seen.add(row.standard_code)
    if (!packetMaps.sameGradeByCode.has(row.standard_code)) errors.push(`${prefix} not found in publication review packet`)
    if (!contractMaps.standardDrafts.has(row.standard_code)) errors.push(`${prefix} not found in contract standard drafts`)
    if (row.requested_standard_variant_type_change !== 'none') {
      errors.push(`${prefix} must not request standard_variant_type changes`)
    }
    if (row.requested_standard_evidence_write === true) {
      errors.push(`${prefix} must use requested_public_write=false; evidence writes need later migration gate`)
    }
    if (row.reviewer_decision !== 'pending') requireFilledDecision(row, prefix, errors)
    if (row.reviewer_decision === 'approve_same_grade_unit_evidence') {
      requireConfirmations(row, prefix, [
        'no_public_write_requested',
        'official_standard_text_preserved',
        'page_evidence_checked',
        'same_grade_unit_evidence_confirmed'
      ], errors)
    }
    countInto(stats.by_reviewer_decision, row.reviewer_decision)
    countInto(stats.by_surface, row.surface_id)
    countInto(stats.by_review_owner, row.review_owner)
    if (row.reviewer_decision === 'pending') stats.pending_required_decisions += 1
    else stats.completed_required_decisions += 1
  }
  const expectedCodes = new Set(packetMaps.sameGradeByCode.keys())
  for (const code of expectedCodes) {
    if (!seen.has(code)) errors.push(`${code} missing same-grade decision`)
  }
}

function auditNotes(rows, packetMaps, contractMaps, errors, stats) {
  const seen = new Set()
  for (const row of rows || []) {
    const prefix = row.progression_group_id || row.decision_id || '(missing note decision)'
    auditCommon(row, 'progression_group_edition_placement_note', NOTE_DECISIONS, prefix, errors)
    if (!row.progression_group_id) errors.push(`${prefix} missing progression_group_id`)
    if (seen.has(row.progression_group_id)) errors.push(`${prefix} duplicate progression note decision`)
    else if (row.progression_group_id) seen.add(row.progression_group_id)
    if (!packetMaps.noteByGroup.has(row.progression_group_id)) errors.push(`${prefix} not found in publication review packet`)
    if (!contractMaps.noteDrafts.has(row.progression_group_id)) errors.push(`${prefix} not found in contract note drafts`)
    if (row.requested_standard_evidence_write !== false) errors.push(`${prefix} requested_standard_evidence_write must be false`)
    if (row.reviewer_decision !== 'pending') requireFilledDecision(row, prefix, errors)
    if (row.reviewer_decision === 'approve_progression_group_note') {
      requireConfirmations(row, prefix, [
        'cross_grade_evidence_remains_diagnostic',
        'curriculum_progression_rationale_confirmed',
        'no_same_grade_standard_evidence_write',
        'no_standard_text_change_requested'
      ], errors)
    }
    countInto(stats.by_reviewer_decision, row.reviewer_decision)
    countInto(stats.by_surface, row.surface_id)
    countInto(stats.by_review_owner, row.review_owner)
    if (row.reviewer_decision === 'pending') stats.pending_required_decisions += 1
    else stats.completed_required_decisions += 1
  }
  const expectedGroups = new Set(packetMaps.noteByGroup.keys())
  for (const group of expectedGroups) {
    if (!seen.has(group)) errors.push(`${group} missing progression note decision`)
  }
}

function auditBlocked(rows, packetMaps, contractMaps, errors, stats) {
  const seen = new Set()
  for (const row of rows || []) {
    const prefix = row.source_review_id || row.decision_id || '(missing blocked decision)'
    auditCommon(row, 'blocked_review_registry', BLOCKED_DECISIONS, prefix, errors)
    if (!row.source_review_id) errors.push(`${prefix} missing source_review_id`)
    if (seen.has(row.source_review_id)) errors.push(`${prefix} duplicate blocked decision`)
    else if (row.source_review_id) seen.add(row.source_review_id)
    if (!packetMaps.blockedByReview.has(row.source_review_id)) errors.push(`${prefix} not found in publication review packet`)
    if (!contractMaps.blockedDrafts.has(row.source_review_id)) errors.push(`${prefix} not found in contract blocked drafts`)
    if (row.publication_surface !== 'none_until_remediated') {
      errors.push(`${prefix} publication_surface must be none_until_remediated`)
    }
    if (row.requested_standard_evidence_write !== false) errors.push(`${prefix} requested_standard_evidence_write must be false`)
    if (row.reviewer_decision !== 'pending') requireFilledDecision(row, prefix, errors)
    countInto(stats.by_reviewer_decision, row.reviewer_decision)
    countInto(stats.by_surface, row.surface_id)
    countInto(stats.by_review_owner, row.review_owner)
    if (row.reviewer_decision === 'pending') stats.pending_blocked_decisions += 1
    else stats.completed_blocked_decisions += 1
  }
  const expectedReviews = new Set(packetMaps.blockedByReview.keys())
  for (const reviewId of expectedReviews) {
    if (!seen.has(reviewId)) errors.push(`${reviewId} missing blocked decision`)
  }
}

function auditPolicies(decisions, errors) {
  if (decisions.data_scope !== 'h4g_publication_review_decisions_template') {
    errors.push('data_scope must be h4g_publication_review_decisions_template')
  }
  if (decisions.publication_candidate !== false) errors.push('publication_candidate must be false')
  if (decisions.publication_ready !== false) errors.push('publication_ready must be false')
  if (decisions.writes_public_data !== false) errors.push('writes_public_data must be false')
  if (decisions.official_standard_text_changed !== false) errors.push('official_standard_text_changed must be false')
}

function markdownSummary(result) {
  return `# H4G Publication Review Decisions Audit

Generated at: ${result.generated_at}

## Decision

| Field | Value |
| --- | --- |
| valid | ${result.valid} |
| manual review complete | ${result.manual_review_complete} |
| publication ready | ${result.publication_ready} |
| require complete | ${result.require_complete} |
| pending required decisions | ${result.summary.pending_required_decisions} |

## Counts

| Metric | Count |
| --- | ---: |
| required manual decisions | ${result.summary.required_manual_decisions} |
| completed required decisions | ${result.summary.completed_required_decisions} |
| pending required decisions | ${result.summary.pending_required_decisions} |
| completed blocked decisions | ${result.summary.completed_blocked_decisions} |
| pending blocked decisions | ${result.summary.pending_blocked_decisions} |

## Decisions By Owner

| Owner | Decisions |
| --- | ---: |
${countRows(result.summary.by_review_owner)}

## Decisions By Status

| Decision | Count |
| --- | ---: |
${countRows(result.summary.by_reviewer_decision)}

## Errors

${result.errors.length ? result.errors.map(error => `- ${error}`).join('\n') : '- none'}

## Warnings

${result.warnings.length ? result.warnings.map(warning => `- ${warning}`).join('\n') : '- none'}

## Interpretation

This audit validates the review decision file as a bounded manual/curriculum
review input. It intentionally keeps \`publication_ready=false\`; any approved
decisions still need a separate public migration gate.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const warnings = []
  for (const [label, path] of [
    ['decisions file', args.decisions],
    ['review packet', args.reviewPacket],
    ['contract candidate', args.contract]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (errors.length) {
    const result = { valid: false, errors, warnings }
    console.log(JSON.stringify(result, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const decisions = readJson(args.decisions)
  const reviewPacket = readJson(args.reviewPacket)
  const contract = readJson(args.contract)
  const packetMaps = reviewPacketMaps(reviewPacket)
  const draftMaps = contractMaps(contract)
  const stats = {
    by_reviewer_decision: {},
    by_review_owner: {},
    by_surface: {},
    completed_blocked_decisions: 0,
    completed_required_decisions: 0,
    pending_blocked_decisions: 0,
    pending_required_decisions: 0
  }

  if (reviewPacket.valid !== true) errors.push('review packet valid must be true')
  if (contract.valid !== true) errors.push('contract candidate valid must be true')
  auditPolicies(decisions, errors)
  auditSameGrade(decisions.same_grade_unit_evidence_decisions || [], packetMaps, draftMaps, errors, stats)
  auditNotes(decisions.progression_group_note_decisions || [], packetMaps, draftMaps, errors, stats)
  auditBlocked(decisions.blocked_review_decisions || [], packetMaps, draftMaps, errors, stats)

  const requiredManualDecisions = (decisions.same_grade_unit_evidence_decisions || []).length +
    (decisions.progression_group_note_decisions || []).length
  if (stats.pending_required_decisions > 0) {
    warnings.push(`${stats.pending_required_decisions} required manual/curriculum decisions are still pending`)
  }
  if (args.requireComplete && stats.pending_required_decisions > 0) {
    errors.push(`requireComplete is set but ${stats.pending_required_decisions} required decisions are pending`)
  }

  const result = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    decisions: args.decisions,
    review_packet: args.reviewPacket,
    contract_candidate: args.contract,
    require_complete: args.requireComplete,
    manual_review_complete: stats.pending_required_decisions === 0 && errors.length === 0,
    publication_ready: false,
    summary: {
      ...stats,
      required_manual_decisions: requiredManualDecisions
    },
    errors,
    warnings
  }

  writeJson(args.out, result)
  writeText(args.summaryOut, markdownSummary(result))
  console.log(JSON.stringify(stable(result), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
