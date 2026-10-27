#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_template.json'
const DEFAULT_DECISIONS_AUDIT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_audit.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_registry.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_registry.md'
const APPROVED_DECISIONS = new Set([
  'approve_standard_scoped_subject_theme_bridge',
  'approve_progression_group_subject_theme_bridge'
])

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    decisionsAudit: DEFAULT_DECISIONS_AUDIT,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireApproved: false,
    requirePageReady: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--decisions-audit') args.decisionsAudit = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-approved') args.requireApproved = true
    else if (item === '--require-page-ready') args.requirePageReady = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_registry.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \\
  --decisions-audit generated/textbook_evidence/h4g_theme_bridge_review_decisions_audit_english_pe.json \\
  --strict

Builds a reviewed subject-theme bridge registry for matcher use. Only approved
source-review decisions are exported. The registry is still a generated
pre-publication artifact: it never writes public/data and never changes official
standard text.`)
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

function validateInputs(decisions, audit, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_review_decisions_template')
  }
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.changes_official_standard_text !== false) errors.push('decisions changes_official_standard_text must be false')
  if (decisions.direct_matcher_use !== false) errors.push('decisions direct_matcher_use must be false')
  if (audit.valid !== true) errors.push('decisions audit valid must be true')
  if (audit.publication_ready !== false) errors.push('decisions audit publication_ready must be false')
  if (audit.matcher_ready !== false) errors.push('decisions audit matcher_ready must be false')
}

function normalizedBridgeScore(row) {
  const score = Number(row.bridge_score || 0)
  if (!score) return 0.56
  return Number(Math.max(0.56, Math.min(0.76, 0.5 + score / 100)).toFixed(4))
}

function approvedBridge(row, args, errors) {
  const scopeType = row.reviewer_decision === 'approve_progression_group_subject_theme_bridge'
    ? 'progression_group'
    : 'standard_code'
  if (args.requirePageReady && row.page_ready !== true) {
    errors.push(`${row.decision_id} approved bridge is not page-ready while requirePageReady is set`)
  }
  return {
    bridge_id: `h4g_subject_theme_bridge_registry_${hashText(row.decision_id || row.source_review_id)}`,
    source_decision_id: row.decision_id || '',
    source_review_id: row.source_review_id || '',
    reviewer_decision: row.reviewer_decision || '',
    reviewed_at: row.reviewed_at || '',
    reviewed_by: row.reviewed_by || '',
    decision_note: row.decision_note || '',
    scope_type: scopeType,
    subject_slug: row.subject_slug || '',
    grade_band: row.grade_band || '',
    unit_grade_band: row.unit_grade_band || '',
    standard_code: row.standard_code || '',
    progression_group_id: row.progression_group_id || '',
    unit_evidence_id: row.unit_evidence_id || '',
    textbook_evidence_id: row.textbook_evidence_id || '',
    unit_title: row.unit_title || '',
    edition: row.edition || '',
    volume: row.volume || '',
    page_ready: row.page_ready === true,
    page_start: row.page_start ?? null,
    page_end: row.page_end ?? null,
    page_range: row.page_range || '',
    page_range_status: row.page_range_status || '',
    bridge_score: row.bridge_score || 0,
    matcher_score: normalizedBridgeScore(row),
    shared_topic_tags: row.shared_topic_tags || [],
    standard_topic_tags: row.standard_topic_tags || [],
    unit_topic_tags: row.unit_topic_tags || [],
    eligible_alignment: 'reviewed_subject_theme_bridge',
    source_review_policy: {
      source_text_reviewed: row.required_confirmations?.source_text_reviewed === true,
      same_subject_confirmed: row.required_confirmations?.same_subject_confirmed === true,
      same_grade_confirmed: row.required_confirmations?.same_grade_confirmed === true,
      topic_not_generic: row.required_confirmations?.topic_not_generic === true,
      exact_standard_to_unit_relationship_confirmed: row.required_confirmations?.exact_standard_to_unit_relationship_confirmed === true,
      curriculum_progression_scope_reviewed: row.required_confirmations?.curriculum_progression_scope_reviewed === true,
      page_evidence_checked: row.required_confirmations?.page_evidence_checked === true,
      official_standard_text_preserved: row.required_confirmations?.official_standard_text_preserved === true,
      no_public_write_requested: row.required_confirmations?.no_public_write_requested === true
    },
    publication_policy: {
      writes_public_data: false,
      changes_official_standard_text: false,
      eligible_for_h4g_differentiation: false,
      requires_later_matcher_gate: true,
      requires_later_publication_gate: true,
      page_missing_requires_recovery_before_publication: row.page_ready !== true
    }
  }
}

function summarize(bridges) {
  const summary = {
    approved_bridges: bridges.length,
    page_ready_bridges: bridges.filter(row => row.page_ready).length,
    page_missing_bridges: bridges.filter(row => !row.page_ready).length,
    by_subject: {},
    by_grade_band: {},
    by_scope_type: {},
    by_reviewer_decision: {}
  }
  for (const bridge of bridges) {
    countInto(summary.by_subject, bridge.subject_slug)
    countInto(summary.by_grade_band, bridge.grade_band)
    countInto(summary.by_scope_type, bridge.scope_type)
    countInto(summary.by_reviewer_decision, bridge.reviewer_decision)
  }
  return stable(summary)
}

function bridgeRows(bridges) {
  return bridges.slice(0, 80)
    .map(row => `| ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.scope_type)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.unit_title)} | ${markdownCell(row.shared_topic_tags.join(', '))} | ${markdownCell(row.page_ready)} |`)
    .join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Subject Theme Bridge Registry

Generated at: ${payload.generated_at}

This generated registry contains only approved subject-theme bridge decisions
for later matcher use. It does not write \`public/data\`, does not change
official standard text, and does not bypass later publication gates.

## Summary

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |
| approved bridges | ${payload.summary.approved_bridges} |
| page-ready bridges | ${payload.summary.page_ready_bridges} |
| page-missing bridges | ${payload.summary.page_missing_bridges} |

## Scope

| Scope | Count |
| --- | ---: |
${countRows(payload.summary.by_scope_type)}

## Subject

| Subject | Count |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Bridge Preview

| Subject | Grade | Scope | Standard | Unit Title | Shared Tags | Page Ready |
| --- | --- | --- | --- | --- | --- | --- |
${bridgeRows(payload.bridges)}
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
    ['decisions', args.decisions],
    ['decisions audit', args.decisionsAudit]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors }, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const decisions = readJson(args.decisions)
  const audit = readJson(args.decisionsAudit)
  validateInputs(decisions, audit, errors)
  const approvedRows = (decisions.bridge_review_decisions || [])
    .filter(row => APPROVED_DECISIONS.has(row.reviewer_decision))
  if (args.requireApproved && !approvedRows.length) errors.push('requireApproved is set but no approved bridge decisions exist')
  const bridges = approvedRows.map(row => approvedBridge(row, args, errors))
  const payload = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    schema_version: 1,
    purpose: 'h4g_reviewed_subject_theme_bridge_registry',
    source_decisions: args.decisions,
    source_decisions_audit: args.decisionsAudit,
    matcher_ready: errors.length === 0,
    publication_ready: false,
    writes_public_data: false,
    changes_official_standard_text: false,
    eligible_alignment: 'reviewed_subject_theme_bridge',
    policy: {
      approved_bridge_registry_only: true,
      writes_public_data: false,
      changes_official_standard_text: false,
      requires_later_matcher_gate: true,
      requires_later_publication_gate: true,
      page_missing_requires_recovery_before_publication: true
    },
    summary: summarize(bridges),
    bridges,
    errors
  }

  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable({
    valid: payload.valid,
    wrote: args.out,
    summary_out: args.summaryOut || null,
    summary: payload.summary,
    errors
  }), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
