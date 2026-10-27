#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_packet.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_template.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_template.md'

const BRIDGE_DECISIONS = [
  'pending',
  'approve_standard_scoped_subject_theme_bridge',
  'approve_progression_group_subject_theme_bridge',
  'reject_subject_theme_bridge',
  'needs_revision'
]

function parseArgs(argv) {
  const args = {
    packet: DEFAULT_PACKET,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireDecisions: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-decisions') args.requireDecisions = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_review_decisions_template.js \\
  --packet generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe.json \\
  --strict --require-decisions

Builds an editable source-review decision template from an H4G subject theme
bridge review packet. All bridge decisions start as pending. The output never
writes public/data, never changes official standard text, and never approves
direct matcher use by itself.`)
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

function basePolicy() {
  return {
    writes_public_data: false,
    changes_official_standard_text: false,
    eligible_for_h4g_differentiation: false,
    direct_matcher_use: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true
  }
}

function bridgeDecision(candidate) {
  const decisionId = `h4g_subject_theme_bridge_decision_${hashText(candidate.review_id || `${candidate.standard_code}:${candidate.unit_evidence_id}`)}`
  return {
    decision_id: decisionId,
    decision_type: 'subject_theme_bridge_candidate_decision',
    surface_id: 'subject_theme_bridge_candidate',
    source_review_id: candidate.review_id || '',
    source_review_status: candidate.review_status || '',
    review_owner: 'subject_theme_bridge_source_review',
    allowed_decisions: BRIDGE_DECISIONS,
    reviewer_decision: 'pending',
    decision_status: 'pending_review',
    decision_note: '',
    reviewed_at: '',
    reviewed_by: '',
    approval_scope: {
      scope_type: 'undecided',
      standard_code: candidate.standard_code || '',
      progression_group_id: candidate.progression_group_id || '',
      grade_band: candidate.grade_band || '',
      unit_evidence_id: candidate.unit_evidence_id || ''
    },
    required_confirmations: {
      source_text_reviewed: false,
      same_subject_confirmed: false,
      same_grade_confirmed: false,
      topic_not_generic: false,
      exact_standard_to_unit_relationship_confirmed: false,
      curriculum_progression_scope_reviewed: false,
      page_evidence_checked: false,
      approved_scope_is_bounded: false,
      official_standard_text_preserved: false,
      no_public_write_requested: false
    },
    requested_public_write: false,
    requested_official_text_change: false,
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    publication_policy: basePolicy(),
    subject_slug: candidate.subject_slug || '',
    grade_band: candidate.grade_band || '',
    unit_grade_band: candidate.unit_grade_band || '',
    standard_code: candidate.standard_code || '',
    progression_group_id: candidate.progression_group_id || '',
    domain: candidate.domain || '',
    subdomain: candidate.subdomain || '',
    textbook_evidence_id: candidate.textbook_evidence_id || '',
    unit_evidence_id: candidate.unit_evidence_id || '',
    unit_title: candidate.unit_title || '',
    unit_level: candidate.unit_level || '',
    edition: candidate.edition || '',
    volume: candidate.volume || '',
    page_start: candidate.page_start ?? null,
    page_end: candidate.page_end ?? null,
    page_range: candidate.page_range || '',
    page_range_status: candidate.page_range_status || '',
    page_ready: candidate.page_ready === true,
    bridge_score: candidate.bridge_score || 0,
    standard_topic_tags: candidate.standard_topic_tags || [],
    unit_topic_tags: candidate.unit_topic_tags || [],
    shared_topic_tags: candidate.shared_topic_tags || [],
    review_questions: candidate.review_questions || []
  }
}

function summarize(decisions) {
  const summary = {
    required_source_review_decisions: decisions.length,
    pending_source_review_decisions: decisions.length,
    completed_source_review_decisions: 0,
    approved_bridge_decisions: 0,
    page_ready_decisions: decisions.filter(row => row.page_ready).length,
    page_missing_decisions: decisions.filter(row => !row.page_ready).length,
    by_subject: {},
    by_grade_band: {},
    by_reviewer_decision: {},
    by_page_status: {}
  }
  for (const row of decisions) {
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_page_status, row.page_range_status || (row.page_ready ? 'ready' : 'missing'))
  }
  summary.by_subject = Object.fromEntries(Object.entries(summary.by_subject).sort(([a], [b]) => a.localeCompare(b)))
  summary.by_grade_band = Object.fromEntries(Object.entries(summary.by_grade_band).sort(([a], [b]) => a.localeCompare(b)))
  summary.by_reviewer_decision = Object.fromEntries(Object.entries(summary.by_reviewer_decision).sort(([a], [b]) => a.localeCompare(b)))
  summary.by_page_status = Object.fromEntries(Object.entries(summary.by_page_status).sort(([a], [b]) => a.localeCompare(b)))
  return summary
}

function validatePacket(packet, args, errors) {
  if (packet.valid !== true) errors.push('source packet valid must be true')
  if (packet.purpose !== 'h4g_subject_theme_bridge_review_packet') {
    errors.push(`source packet purpose must be h4g_subject_theme_bridge_review_packet, got ${packet.purpose || 'missing'}`)
  }
  if (packet.review_policy?.writes_public_data !== false) errors.push('source packet writes_public_data policy must be false')
  if (packet.review_policy?.changes_official_standard_text !== false) errors.push('source packet changes_official_standard_text policy must be false')
  if (packet.review_policy?.generated_candidates_are_approved !== false) errors.push('source packet generated_candidates_are_approved must be false')
  if (args.requireDecisions && !(packet.bridge_review_candidates || []).length) {
    errors.push('requireDecisions is set but source packet has no bridge_review_candidates')
  }
}

function subjectRows(summary) {
  return Object.entries(summary.by_subject || {})
    .map(([subject, count]) => `| ${markdownCell(subject)} | ${count} |`)
    .join('\n') || '| - | 0 |'
}

function previewRows(decisions) {
  return decisions.slice(0, 80)
    .map(row => `| ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.unit_title)} | ${markdownCell((row.shared_topic_tags || []).join(', '))} | ${markdownCell(row.page_range_status)} | ${markdownCell(row.reviewer_decision)} |`)
    .join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Subject Theme Bridge Review Decisions Template

Generated at: ${payload.generated_at}

This is an editable source-review template. It does not write \`public/data\`,
does not change official standard text, and does not approve direct matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| source review complete | ${payload.source_review_complete} |
| publication ready | ${payload.publication_ready} |
| matcher ready | ${payload.matcher_ready} |
| required source review decisions | ${payload.summary.required_source_review_decisions} |
| pending source review decisions | ${payload.summary.pending_source_review_decisions} |
| page-ready decisions | ${payload.summary.page_ready_decisions} |
| page-missing decisions | ${payload.summary.page_missing_decisions} |

## Subjects

| Subject | Decisions |
| --- | ---: |
${subjectRows(payload.summary)}

## Decisions By Grade

| Grade | Decisions |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Candidate Preview

| Subject | Grade | Standard | Unit Title | Shared Topic Tags | Page Status | Decision |
| --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.bridge_review_decisions)}

## Editing Rules

- Keep \`requested_public_write=false\`, \`requested_official_text_change=false\`, and \`requested_direct_matcher_use=false\`.
- Use \`approve_standard_scoped_subject_theme_bridge\` only when the source text supports this exact standard-to-unit bridge.
- Use \`approve_progression_group_subject_theme_bridge\` only when the bridge should be bounded to the progression group and same grade.
- Page-missing approvals can be recorded only as source-review decisions; they still cannot enter a publication gate until page evidence is recovered.
- This file is a review input, not a public migration.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  if (!existsSync(args.packet)) errors.push(`Missing source packet: ${args.packet}`)
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors }, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const packet = readJson(args.packet)
  validatePacket(packet, args, errors)
  const decisions = (packet.bridge_review_candidates || []).map(bridgeDecision)
  const payload = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    schema_version: 1,
    data_scope: 'h4g_subject_theme_bridge_review_decisions_template',
    source_review_packet: args.packet,
    publication_ready: false,
    matcher_ready: false,
    source_review_complete: false,
    writes_public_data: false,
    changes_official_standard_text: false,
    eligible_for_h4g_differentiation: false,
    direct_matcher_use: false,
    decision_schema: {
      bridge_allowed_decisions: BRIDGE_DECISIONS,
      approval_scope_types: ['undecided', 'standard_code', 'progression_group']
    },
    publication_policy: basePolicy(),
    source_packet_summary: packet.summary || {},
    summary: summarize(decisions),
    bridge_review_decisions: decisions,
    errors
  }

  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable({
    valid: payload.valid,
    wrote: args.out,
    summary_out: args.summaryOut || null,
    required_source_review_decisions: payload.summary.required_source_review_decisions,
    pending_source_review_decisions: payload.summary.pending_source_review_decisions,
    page_ready_decisions: payload.summary.page_ready_decisions,
    page_missing_decisions: payload.summary.page_missing_decisions,
    errors
  }), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
