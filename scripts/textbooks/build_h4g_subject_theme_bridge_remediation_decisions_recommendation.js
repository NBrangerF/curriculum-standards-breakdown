#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_review_decisions_full_page_recovered_codex_reviewed_english_pe.json'
const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_remediation_packet_full_page_recovered_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_review_decisions_language_use_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_review_decisions_language_use_rejected_english_pe.md'
const DEFAULT_REJECT_FAMILIES = ['english_language_use_requires_function_anchor']

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    packet: DEFAULT_PACKET,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    rejectActionFamilies: DEFAULT_REJECT_FAMILIES,
    reviewer: 'Codex remediation source review',
    reviewedAt: new Date().toISOString().slice(0, 10),
    strict: false,
    requireItems: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--packet') args.packet = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--reject-action-families') args.rejectActionFamilies = parseList(argv[++i])
    else if (item === '--reviewer') args.reviewer = argv[++i]
    else if (item === '--reviewed-at') args.reviewedAt = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_remediation_decisions_recommendation.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_full_page_recovered_codex_reviewed_english_pe.json \\
  --packet generated/textbook_evidence/h4g_theme_bridge_remediation_packet_full_page_recovered_english_pe.json \\
  --strict --require-items

Builds a generated source-review decision candidate from a remediation packet.
By default it rejects title-only English Language in use bridge candidates. It
never approves new bridges, writes public/data, changes official standard text,
or enables direct matcher use.`)
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
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

function remediationByDecisionId(packet) {
  return new Map((packet.remediation_items || []).map(item => [item.source_decision_id, item]))
}

function validateInputs(decisions, packet, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_review_decisions_template')
  }
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.changes_official_standard_text !== false) errors.push('decisions changes_official_standard_text must be false')
  if (decisions.direct_matcher_use !== false) errors.push('decisions direct_matcher_use must be false')
  if (packet.valid !== true) errors.push('remediation packet valid must be true')
  if (packet.purpose !== 'h4g_subject_theme_bridge_remediation_packet') {
    errors.push('remediation packet purpose must be h4g_subject_theme_bridge_remediation_packet')
  }
  if (packet.writes_public_data !== false) errors.push('remediation packet writes_public_data must be false')
  if (packet.changes_official_standard_text !== false) errors.push('remediation packet changes_official_standard_text must be false')
  if (!args.rejectActionFamilies.length) errors.push('--reject-action-families must not be empty')
}

function isTarget(row, remediation, rejectFamilies) {
  if (!remediation) return false
  if (row.reviewer_decision !== 'needs_revision') return false
  return rejectFamilies.includes(remediation.action?.action_family)
}

function targetIsSafeToReject(row, remediation) {
  const family = remediation.action?.action_family || ''
  if (family === 'english_language_use_requires_function_anchor') {
    const riskFlags = remediation.evidence_profile?.risk_flags || []
    return row.subject_slug === 'english' &&
      /language in use/i.test(row.unit_title || '') &&
      riskFlags.includes('deny_term_in_unit_title:language in use') &&
      row.page_ready === true
  }
  return false
}

function rejectionNote(row, remediation) {
  const family = remediation.action?.action_family || ''
  if (family === 'english_language_use_requires_function_anchor') {
    return '拒绝 title-only Language in use 主题桥接：该单元标题只能说明语言运用/复习板块，不能证明具体 standard-to-unit 关系；后续若有明确语言功能、任务或活动锚点，应重新进入更窄 source review。'
  }
  return `拒绝 ${family} remediation item：当前证据不足以证明精确 subject-theme bridge。`
}

function applyRecommendation(row, remediation, args, stats, errors) {
  if (!isTarget(row, remediation, args.rejectActionFamilies)) return row
  const prefix = row.decision_id || '(missing decision)'
  if (!targetIsSafeToReject(row, remediation)) {
    errors.push(`${prefix} matches reject family ${remediation.action?.action_family} but failed safety checks`)
    return row
  }
  countInto(stats.by_rejected_action_family, remediation.action.action_family)
  countInto(stats.by_rejected_grade_band, row.grade_band)
  countInto(stats.by_rejected_subject, row.subject_slug)
  stats.remediation_rejected_decisions += 1
  return {
    ...row,
    decision_note: rejectionNote(row, remediation),
    decision_status: 'reviewed',
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewer,
    reviewer_decision: 'reject_subject_theme_bridge'
  }
}

function summarize(rows, stats) {
  const summary = {
    approved_bridge_decisions: 0,
    by_grade_band: {},
    by_page_status: {},
    by_reviewer_decision: {},
    by_subject: {},
    completed_source_review_decisions: 0,
    page_missing_decisions: 0,
    page_ready_decisions: 0,
    pending_source_review_decisions: 0,
    remediation_rejected_decisions: stats.remediation_rejected_decisions,
    required_source_review_decisions: rows.length,
    by_rejected_action_family: stats.by_rejected_action_family,
    by_rejected_grade_band: stats.by_rejected_grade_band,
    by_rejected_subject: stats.by_rejected_subject
  }
  for (const row of rows) {
    if (row.reviewer_decision === 'approve_standard_scoped_subject_theme_bridge' ||
      row.reviewer_decision === 'approve_progression_group_subject_theme_bridge') {
      summary.approved_bridge_decisions += 1
    }
    if (row.reviewer_decision === 'pending') summary.pending_source_review_decisions += 1
    else summary.completed_source_review_decisions += 1
    if (row.page_ready) summary.page_ready_decisions += 1
    else summary.page_missing_decisions += 1
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_status, row.page_range_status || (row.page_ready ? 'ready' : 'missing'))
  }
  return stable(summary)
}

function validateOutput(beforeRows, afterRows, args, stats, errors) {
  if (beforeRows.length !== afterRows.length) errors.push('output decision count changed')
  const beforeById = new Map(beforeRows.map(row => [row.decision_id, row]))
  let changed = 0
  for (const row of afterRows) {
    const before = beforeById.get(row.decision_id)
    if (!before) errors.push(`${row.decision_id || '(missing decision)'} not found in source decisions`)
    if (!before) continue
    if (before.reviewer_decision !== row.reviewer_decision) {
      changed += 1
      if (before.reviewer_decision !== 'needs_revision') {
        errors.push(`${row.decision_id} changed from non-needs_revision decision ${before.reviewer_decision}`)
      }
      if (row.reviewer_decision !== 'reject_subject_theme_bridge') {
        errors.push(`${row.decision_id} changed to unsupported decision ${row.reviewer_decision}`)
      }
    }
    if (row.requested_public_write !== false) errors.push(`${row.decision_id} requested_public_write must remain false`)
    if (row.requested_official_text_change !== false) errors.push(`${row.decision_id} requested_official_text_change must remain false`)
    if (row.requested_direct_matcher_use !== false) errors.push(`${row.decision_id} requested_direct_matcher_use must remain false`)
    if (row.requested_eligible_for_h4g_differentiation !== false) {
      errors.push(`${row.decision_id} requested_eligible_for_h4g_differentiation must remain false`)
    }
  }
  if (changed !== stats.remediation_rejected_decisions) {
    errors.push(`changed decision count ${changed} did not match remediation_rejected_decisions ${stats.remediation_rejected_decisions}`)
  }
  if (args.requireItems && stats.remediation_rejected_decisions === 0) {
    errors.push('requireItems is set but no decisions were rejected')
  }
}

function changedRows(rows) {
  return rows.filter(row => row.reviewed_by === 'Codex remediation source review').slice(0, 120)
    .map(row => `| ${markdownCell(row.reviewer_decision)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.unit_title)} | ${markdownCell(row.decision_note)} |`)
    .join('\n') || '| - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Subject Theme Bridge Remediation Decision Recommendations

Generated at: ${payload.generated_at}

This generated decision candidate rejects selected remediation families whose
current evidence is known to be unsafe for direct subject-theme bridging. It
does not approve new bridges, write \`public/data\`, change official standard
text, or enable direct matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| source review complete | ${payload.source_review_complete} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |
| remediation rejected decisions | ${payload.summary.remediation_rejected_decisions} |
| approved bridge decisions | ${payload.summary.approved_bridge_decisions} |
| needs revision decisions | ${payload.summary.by_reviewer_decision.needs_revision || 0} |
| rejected decisions | ${payload.summary.by_reviewer_decision.reject_subject_theme_bridge || 0} |

## Rejected Action Families

| action family | decisions |
| --- | ---: |
${countRows(payload.summary.by_rejected_action_family)}

## Decisions By Status

| decision | count |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Changed Rows

| Decision | Subject | Grade | Standard | Unit | Note |
| --- | --- | --- | --- | --- | --- |
${changedRows(payload.bridge_review_decisions)}

## Boundary

- This pass only rejects selected \`needs_revision\` remediation items.
- Existing approvals are preserved but not expanded.
- Later registry, matcher, consistency, and publication gates are still required.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const errors = []
  if (!existsSync(args.decisions)) errors.push(`Missing decisions file: ${args.decisions}`)
  if (!existsSync(args.packet)) errors.push(`Missing remediation packet: ${args.packet}`)
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors }, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const decisions = readJson(args.decisions)
  const packet = readJson(args.packet)
  validateInputs(decisions, packet, args, errors)
  const remediationMap = remediationByDecisionId(packet)
  const stats = {
    by_rejected_action_family: {},
    by_rejected_grade_band: {},
    by_rejected_subject: {},
    remediation_rejected_decisions: 0
  }
  const beforeRows = decisions.bridge_review_decisions || []
  const afterRows = beforeRows.map(row => applyRecommendation(row, remediationMap.get(row.decision_id), args, stats, errors))
  validateOutput(beforeRows, afterRows, args, stats, errors)
  const summary = summarize(afterRows, stats)
  const payload = {
    ...decisions,
    bridge_review_decisions: afterRows,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    remediation_decision_recommendation: {
      policy: 'reject_selected_needs_revision_remediation_families_only',
      rejected_action_families: args.rejectActionFamilies,
      reviewed_at: args.reviewedAt,
      reviewed_by: args.reviewer,
      source_decisions: args.decisions,
      source_remediation_packet: args.packet
    },
    source_review_complete: summary.pending_source_review_decisions === 0,
    summary,
    valid: errors.length === 0,
    writes_public_data: false
  }

  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable({
    errors,
    out: args.out,
    source_review_complete: payload.source_review_complete,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid
  }), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
