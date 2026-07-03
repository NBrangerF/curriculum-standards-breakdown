#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_remediation_packet_full_page_recovered_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_review_decisions_full_page_recovered_codex_reviewed_english_pe.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_review_worklist_full_page_recovered_codex_reviewed_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_remediation_packet_full_page_recovered_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_remediation_packet_full_page_recovered_english_pe_audit.md'

function parseArgs(argv) {
  const args = {
    packet: DEFAULT_PACKET,
    decisions: DEFAULT_DECISIONS,
    worklist: DEFAULT_WORKLIST,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireItems: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--worklist') args.worklist = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_remediation_packet.js \\
  --packet generated/textbook_evidence/h4g_theme_bridge_remediation_packet_full_page_recovered_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_full_page_recovered_codex_reviewed_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_full_page_recovered_codex_reviewed_english_pe.json \\
  --strict --require-items

Audits the read-only H4G subject-theme bridge remediation packet. It verifies
that every needs_revision decision is covered exactly once and that no item
requests publication, official text changes, or direct matcher use.`)
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

function mapBy(rows, key) {
  return new Map((rows || []).map(row => [row[key], row]))
}

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function auditTopLevel(packet, decisions, worklist, errors) {
  if (packet.valid !== true) errors.push('packet valid must be true')
  if (packet.purpose !== 'h4g_subject_theme_bridge_remediation_packet') {
    errors.push('packet purpose must be h4g_subject_theme_bridge_remediation_packet')
  }
  if (packet.publication_candidate !== false) errors.push('packet publication_candidate must be false')
  if (packet.publication_ready !== false) errors.push('packet publication_ready must be false')
  if (packet.matcher_ready !== false) errors.push('packet matcher_ready must be false')
  if (packet.writes_public_data !== false) errors.push('packet writes_public_data must be false')
  if (packet.changes_official_standard_text !== false) errors.push('packet changes_official_standard_text must be false')
  if (packet.direct_matcher_use !== false) errors.push('packet direct_matcher_use must be false')
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_review_decisions_template')
  }
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_source_review_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_source_review_worklist')
  }
  const policy = packet.policy || {}
  if (policy.read_only_remediation_packet !== true) errors.push('policy.read_only_remediation_packet must be true')
  if (policy.needs_revision_only !== true) errors.push('policy.needs_revision_only must be true')
  if (policy.approved_decisions_excluded !== true) errors.push('policy.approved_decisions_excluded must be true')
  if (policy.writes_public_data !== false) errors.push('policy.writes_public_data must be false')
}

function auditItem(item, indexes, errors, stats) {
  const prefix = item.remediation_item_id || item.source_decision_id || '(missing remediation item)'
  if (!item.remediation_item_id) errors.push(`${prefix} missing remediation_item_id`)
  if (!item.source_decision_id) errors.push(`${prefix} missing source_decision_id`)
  const decision = indexes.decisionById.get(item.source_decision_id)
  const workItem = indexes.workByDecisionId.get(item.source_decision_id)
  if (!decision) errors.push(`${prefix} source decision not found`)
  if (!workItem) errors.push(`${prefix} source work item not found`)
  if (decision && decision.reviewer_decision !== 'needs_revision') {
    errors.push(`${prefix} linked decision must be needs_revision`)
  }
  if (item.evidence_profile?.source_review_decision !== 'needs_revision') {
    errors.push(`${prefix} evidence_profile.source_review_decision must be needs_revision`)
  }
  if (item.bridge_context?.page_ready !== true) errors.push(`${prefix} bridge_context.page_ready must be true`)
  if (!item.action?.action_family) errors.push(`${prefix} action.action_family is required`)
  if (!item.action?.decision_owner) errors.push(`${prefix} action.decision_owner is required`)
  if (!item.action?.recommended_next_step) errors.push(`${prefix} action.recommended_next_step is required`)
  if (item.action?.writes_public_data !== false) errors.push(`${prefix} action.writes_public_data must be false`)
  if (item.action?.changes_official_standard_text !== false) errors.push(`${prefix} action.changes_official_standard_text must be false`)
  if (item.action?.direct_matcher_use !== false) errors.push(`${prefix} action.direct_matcher_use must be false`)
  if (item.action?.eligible_for_h4g_differentiation !== false) {
    errors.push(`${prefix} action.eligible_for_h4g_differentiation must be false`)
  }
  countInto(stats.by_action_family, item.action?.action_family)
  countInto(stats.by_action_priority, item.action?.action_priority)
  countInto(stats.by_subject, item.standard_context?.subject_slug)
  countInto(stats.by_grade_band, item.grade_band)
  for (const tag of item.bridge_context?.shared_topic_tags || []) countInto(stats.by_shared_topic_tag, tag)
}

function markdownSummary(result) {
  return `# H4G Subject Theme Bridge Remediation Packet Audit

Generated at: ${result.generated_at}

| Field | Value |
| --- | ---: |
| valid | ${result.valid} |
| remediation items | ${result.summary.remediation_items} |
| expected needs revision decisions | ${result.summary.expected_needs_revision_decisions} |
| missing decision coverage | ${result.summary.missing_decision_coverage} |
| extra decision coverage | ${result.summary.extra_decision_coverage} |

## Action Families

| action family | items |
| --- | ---: |
${countRows(result.summary.by_action_family)}

## Subjects

| subject | items |
| --- | ---: |
${countRows(result.summary.by_subject)}

## Errors

${(result.errors || []).map(error => `- ${markdownCell(error)}`).join('\n') || '- none'}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const errors = []
  for (const [label, path] of [['packet', args.packet], ['decisions', args.decisions], ['worklist', args.worklist]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (errors.length) {
    const result = { valid: false, errors }
    console.log(JSON.stringify(result, null, 2))
    if (args.strict) process.exit(1)
    return
  }
  const packet = readJson(args.packet)
  const decisions = readJson(args.decisions)
  const worklist = readJson(args.worklist)
  auditTopLevel(packet, decisions, worklist, errors)
  const needsRevision = (decisions.bridge_review_decisions || []).filter(row => row.reviewer_decision === 'needs_revision')
  const expectedIds = new Set(needsRevision.map(row => row.decision_id))
  const actualIds = new Set()
  const indexes = {
    decisionById: mapBy(decisions.bridge_review_decisions || [], 'decision_id'),
    workByDecisionId: mapBy(worklist.work_items || [], 'source_decision_id')
  }
  const stats = {
    by_action_family: {},
    by_action_priority: {},
    by_grade_band: {},
    by_shared_topic_tag: {},
    by_subject: {},
    remediation_items: (packet.remediation_items || []).length
  }
  for (const item of packet.remediation_items || []) {
    if (actualIds.has(item.source_decision_id)) errors.push(`${item.source_decision_id} appears more than once`)
    actualIds.add(item.source_decision_id)
    auditItem(item, indexes, errors, stats)
  }
  const missing = sorted([...expectedIds].filter(id => !actualIds.has(id)))
  const extra = sorted([...actualIds].filter(id => !expectedIds.has(id)))
  if (missing.length) errors.push(`${missing.length} needs_revision decisions missing from packet`)
  if (extra.length) errors.push(`${extra.length} non-needs_revision decisions included in packet`)
  if (args.requireItems && !(packet.remediation_items || []).length) errors.push('requireItems is set but packet has no remediation_items')
  const result = {
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    packet: args.packet,
    publication_ready: false,
    summary: {
      ...stats,
      expected_needs_revision_decisions: needsRevision.length,
      extra_decision_coverage: extra.length,
      missing_decision_coverage: missing.length
    },
    valid: errors.length === 0,
    warnings: []
  }
  writeJson(args.out, result)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(result))
  console.log(JSON.stringify(stable(result), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
