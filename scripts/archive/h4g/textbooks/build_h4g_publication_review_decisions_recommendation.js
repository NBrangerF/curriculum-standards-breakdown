#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const BASE_DIR = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean'
const DEFAULT_DECISIONS = `${BASE_DIR}/h4g_publication_review_decisions_template.json`
const DEFAULT_REVIEW_PACKET = `${BASE_DIR}/h4g_publication_review_packet.json`
const DEFAULT_OUT = `${BASE_DIR}/h4g_publication_review_decisions_codex_reviewed.json`
const DEFAULT_SUMMARY_OUT = `${BASE_DIR}/h4g_publication_review_decisions_codex_reviewed.md`

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    reviewPacket: DEFAULT_REVIEW_PACKET,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    reviewer: 'Codex curriculum evidence review',
    reviewedAt: new Date().toISOString().slice(0, 10),
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--review-packet') args.reviewPacket = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--reviewer') args.reviewer = argv[++i]
    else if (item === '--reviewed-at') args.reviewedAt = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_publication_review_decisions_recommendation.js \\
  --strict

Builds a filled review-decision candidate from a publication review packet.
It only approves bounded, same-grade unit evidence and progression notes that
already satisfy the packet safety gates. It never writes public/data.`)
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

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
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

function packetMaps(reviewPacket) {
  return {
    sameGradeByCode: new Map((reviewPacket.same_grade_unit_reviews || []).map(row => [row.standard_code, row])),
    noteByGroup: new Map((reviewPacket.edition_placement_note_reviews || []).map(row => [row.progression_group_id, row])),
    blockedByReview: new Map((reviewPacket.blocked_reviews || []).map(row => [row.review_id, row]))
  }
}

function safeSameGradeReview(review) {
  const pageStatuses = review.page_range_statuses || []
  const alignments = review.eligible_alignments || []
  return Boolean(
    review &&
    review.same_grade_edition_count >= 2 &&
    review.unit_evidence_count > 0 &&
    pageStatuses.length > 0 &&
    !pageStatuses.includes('toc_page_nonmonotonic') &&
    alignments.some(value => ['subdomain_anchor', 'reviewed_alias_anchor', 'strong_field_alignment'].includes(value))
  )
}

function safeProgressionNoteReview(review) {
  return Boolean(
    review &&
    review.model_decision === 'candidate_for_edition_placement_note' &&
    review.confidence === 'high' &&
    review.edition_count >= 2 &&
    review.cross_grade_diagnostic_relations > 0
  )
}

function fillSameGradeDecision(row, review, args) {
  if (!safeSameGradeReview(review)) {
    return {
      ...row,
      decision_note: '证据未达到自动复核建议门槛，继续保留 pending。',
      reviewer_decision: 'pending'
    }
  }
  return {
    ...row,
    decision_note: `批准同年级单元/章节证据进入候选数据根；${review.same_grade_edition_count} 个版本、${review.unit_evidence_count} 条单元证据，alignment=${sorted(review.eligible_alignments).join(', ')}，page=${sorted(review.page_range_statuses).join(', ')}。官方课标正文不变，不请求 public/data 写入。`,
    decision_status: 'reviewed',
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewer,
    reviewer_decision: 'approve_same_grade_unit_evidence',
    required_confirmations: {
      ...row.required_confirmations,
      no_public_write_requested: true,
      official_standard_text_preserved: true,
      page_evidence_checked: true,
      same_grade_unit_evidence_confirmed: true
    }
  }
}

function fillNoteDecision(row, review, args) {
  if (!safeProgressionNoteReview(review)) {
    return {
      ...row,
      decision_note: '进阶关系证据未达到自动复核建议门槛，继续保留 pending。',
      reviewer_decision: 'pending'
    }
  }
  return {
    ...row,
    decision_note: `批准作为 progression-group 进阶说明候选；${review.edition_count} 个版本，${review.cross_grade_diagnostic_relations} 条跨年级诊断关系。该批准不写入同年级 standard evidence，不改变课标正文。`,
    decision_status: 'reviewed',
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewer,
    reviewer_decision: 'approve_progression_group_note',
    required_confirmations: {
      ...row.required_confirmations,
      cross_grade_evidence_remains_diagnostic: true,
      curriculum_progression_rationale_confirmed: true,
      no_same_grade_standard_evidence_write: true,
      no_standard_text_change_requested: true
    }
  }
}

function fillBlockedDecision(row, review, args) {
  const decision = review?.review_type === 'blocked_same_grade_gap_remediation'
    ? 'needs_targeted_remediation'
    : 'keep_blocked'
  return {
    ...row,
    decision_note: `保持 blocked registry 状态；当前阻塞为 ${review?.blocking_decision || row.blocking_decision || 'missing'}，不得进入 public publication surface。`,
    decision_status: 'reviewed',
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewer,
    reviewer_decision: decision
  }
}

function summarize(decisions) {
  const byOwner = {}
  const bySurface = {}
  const byDecision = {}
  const requiredRows = [
    ...(decisions.same_grade_unit_evidence_decisions || []),
    ...(decisions.progression_group_note_decisions || [])
  ]
  const blockedRows = decisions.blocked_review_decisions || []
  for (const row of [...requiredRows, ...blockedRows]) {
    countInto(byOwner, row.review_owner)
    countInto(bySurface, row.surface_id)
    countInto(byDecision, row.reviewer_decision)
  }
  return {
    required_manual_decisions: requiredRows.length,
    completed_required_decisions: requiredRows.filter(row => row.reviewer_decision !== 'pending').length,
    pending_required_decisions: requiredRows.filter(row => row.reviewer_decision === 'pending').length,
    completed_blocked_decisions: blockedRows.filter(row => row.reviewer_decision !== 'pending').length,
    pending_blocked_decisions: blockedRows.filter(row => row.reviewer_decision === 'pending').length,
    standard_same_grade_decisions: (decisions.same_grade_unit_evidence_decisions || []).length,
    progression_note_decisions: (decisions.progression_group_note_decisions || []).length,
    blocked_registry_decisions: blockedRows.length,
    by_review_owner: byOwner,
    by_surface: bySurface,
    by_reviewer_decision: byDecision
  }
}

function markdownSummary(payload) {
  const standardRows = payload.same_grade_unit_evidence_decisions
    .map(row => `| ${markdownCell(row.standard_code)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.reviewer_decision)} | ${markdownCell(row.decision_note)} |`)
    .join('\n') || '| - | - | - | - |'
  const noteRows = payload.progression_group_note_decisions
    .map(row => `| ${markdownCell(row.progression_group_id)} | ${markdownCell(row.reviewer_decision)} | ${markdownCell(row.decision_note)} |`)
    .join('\n') || '| - | - | - |'
  const blockedRows = payload.blocked_review_decisions
    .map(row => `| ${markdownCell(row.progression_group_id)} | ${markdownCell(row.reviewer_decision)} | ${markdownCell(row.decision_note)} |`)
    .join('\n') || '| - | - | - |'
  return `# H4G Publication Review Decisions Recommendation

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | --- |
| manual review complete | ${payload.manual_review_complete} |
| publication ready | ${payload.publication_ready} |
| writes public data | ${payload.writes_public_data} |
| official standard text changed | ${payload.official_standard_text_changed} |
| pending required decisions | ${payload.summary.pending_required_decisions} |

## Decisions By Status

| Decision | Count |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Same-Grade Unit Evidence Decisions

| Standard | Grade | Decision | Note |
| --- | --- | --- | --- |
${standardRows}

## Progression Note Decisions

| Progression group | Decision | Note |
| --- | --- | --- |
${noteRows}

## Blocked Registry Decisions

| Progression group | Decision | Note |
| --- | --- | --- |
${blockedRows}

## Boundaries

- This is still a generated review-decision candidate, not a public migration.
- Approved same-grade decisions only unlock candidate-root review status.
- Progression notes remain separate from standard-level unit evidence.
- Blocked reviews keep their no-publication surface until remediated.
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
  if (!existsSync(args.decisions)) errors.push(`Missing decisions template: ${args.decisions}`)
  if (!existsSync(args.reviewPacket)) errors.push(`Missing review packet: ${args.reviewPacket}`)
  if (errors.length) {
    const result = { valid: false, errors, warnings }
    console.log(JSON.stringify(result, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const decisions = readJson(args.decisions)
  const reviewPacket = readJson(args.reviewPacket)
  const maps = packetMaps(reviewPacket)
  if (decisions.valid !== true) errors.push('decisions template valid must be true')
  if (reviewPacket.valid !== true) errors.push('review packet valid must be true')
  if (decisions.writes_public_data !== false) errors.push('decisions template writes_public_data must be false')
  if (decisions.official_standard_text_changed !== false) errors.push('decisions template official_standard_text_changed must be false')

  const next = {
    ...decisions,
    generated_at: new Date().toISOString(),
    manual_review_complete: false,
    publication_ready: false,
    source_review_recommendation: {
      reviewer: args.reviewer,
      reviewed_at: args.reviewedAt,
      source_decisions: args.decisions,
      source_review_packet: args.reviewPacket,
      policy: 'approve_only_safe_same_grade_unit_evidence_and_high_confidence_progression_notes'
    },
    same_grade_unit_evidence_decisions: (decisions.same_grade_unit_evidence_decisions || [])
      .map(row => fillSameGradeDecision(row, maps.sameGradeByCode.get(row.standard_code), args)),
    progression_group_note_decisions: (decisions.progression_group_note_decisions || [])
      .map(row => fillNoteDecision(row, maps.noteByGroup.get(row.progression_group_id), args)),
    blocked_review_decisions: (decisions.blocked_review_decisions || [])
      .map(row => fillBlockedDecision(row, maps.blockedByReview.get(row.source_review_id), args))
  }
  next.summary = summarize(next)
  next.manual_review_complete = next.summary.pending_required_decisions === 0 && errors.length === 0
  next.valid = errors.length === 0
  next.errors = errors

  if (next.summary.pending_required_decisions > 0) {
    warnings.push(`${next.summary.pending_required_decisions} required decisions remain pending`)
  }
  next.warnings = warnings

  writeJson(args.out, next)
  writeText(args.summaryOut, markdownSummary(next))
  console.log(JSON.stringify(stable({
    valid: next.valid,
    out: args.out,
    summary_out: args.summaryOut,
    manual_review_complete: next.manual_review_complete,
    publication_ready: next.publication_ready,
    writes_public_data: next.writes_public_data,
    official_standard_text_changed: next.official_standard_text_changed,
    summary: next.summary,
    errors,
    warnings
  }), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
