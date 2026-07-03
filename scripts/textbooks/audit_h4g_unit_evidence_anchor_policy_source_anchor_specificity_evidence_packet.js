#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_evidence_packet.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions_template.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_evidence_packet_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_evidence_packet_audit.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
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
node scripts/textbooks/audit_h4g_unit_evidence_anchor_policy_source_anchor_specificity_evidence_packet.js \\
  --strict --require-items

Audits the read-only H4G unit source-anchor specificity evidence packet against
the editable source-anchor specificity decisions template.`)
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

function sameJson(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right))
}

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
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

function policy() {
  return {
    changes_official_standard_text: false,
    decision_template_only: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    evidence_packet_only: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_anchor_policy_decision_edit: true,
    requires_later_candidate_coverage_recheck: true,
    requires_later_consistency_gate: true,
    requires_later_manual_review: true,
    requires_later_publication_gate: true,
    review_batch_only: true,
    source_anchor_specificity_batch_only: true,
    source_anchor_specificity_evidence_packet_only: true,
    writes_public_data: false
  }
}

function validatePolicy(label, payload, errors) {
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (payload[key] !== false) errors.push(`${label} ${key} must be false`)
  }
}

function validateEvidencePacketPolicy(label, payload, errors) {
  validatePolicy(label, payload, errors)
  for (const key of [
    'evidence_packet_only',
    'requires_later_anchor_policy_decision_edit',
    'requires_later_candidate_coverage_recheck',
    'requires_later_consistency_gate',
    'requires_later_manual_review',
    'requires_later_publication_gate',
    'review_batch_only',
    'source_anchor_specificity_batch_only',
    'source_anchor_specificity_evidence_packet_only'
  ]) {
    if (payload[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  if (payload.decision_template_only !== false) errors.push(`${label}.decision_template_only must be false`)
}

function validateTopLevel(packet, decisions, args, errors) {
  if (packet.valid !== true) errors.push('packet valid must be true')
  if ((packet.errors || []).length) errors.push('packet errors must be empty')
  if (packet.purpose !== 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_evidence_packet') {
    errors.push('packet purpose mismatch')
  }
  if (packet.source_anchor_policy_source_anchor_specificity_decisions !== args.decisions) {
    errors.push('packet source decisions must match audit arg')
  }
  if (!Array.isArray(packet.source_anchor_specificity_evidence_items)) {
    errors.push('packet source_anchor_specificity_evidence_items must be an array')
  }
  validateEvidencePacketPolicy('packet', packet, errors)
  validateEvidencePacketPolicy('packet policy', packet.policy || {}, errors)

  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (!Array.isArray(decisions.source_anchor_specificity_decisions)) {
    errors.push('decisions source_anchor_specificity_decisions must be an array')
  }
  validatePolicy('decisions', decisions, errors)
}

function mapBy(rows, key, errors, label) {
  const out = new Map()
  for (const row of rows || []) {
    const id = row[key] || ''
    if (!id) {
      errors.push(`${label} row missing ${key}`)
      continue
    }
    if (out.has(id)) errors.push(`${label} duplicate ${key}: ${id}`)
    out.set(id, row)
  }
  return out
}

function groupRows(rows) {
  const groups = new Map()
  for (const row of rows || []) {
    const key = row.progression_group_id || 'missing_progression_group'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return groups
}

function evidencePacketItemId(progressionGroupId) {
  return `h4g_unit_source_anchor_specificity_evidence_${hashText(progressionGroupId)}`
}

function summarize(items) {
  const summary = {
    by_group_progression_completeness: {},
    by_subject: {},
    decision_rows_in_packet: 0,
    evidence_packet_items: items.length,
    groups_with_all_h4g_standard_context: 0,
    groups_with_all_target_anchor_grades: 0,
    source_files: sorted(items.flatMap(item => item.source_anchor_decision_rows.map(row => row.source_file))).length,
    standard_context_rows: 0,
    unique_candidate_matches: sorted(items.flatMap(item => item.source_anchor_decision_rows.map(row => row.candidate_match_id))).length
  }
  for (const item of items) {
    countInto(summary.by_group_progression_completeness, item.group_progression_completeness)
    countInto(summary.by_subject, item.subject_slug)
    summary.decision_rows_in_packet += item.source_anchor_decision_rows.length
    summary.standard_context_rows += item.standard_context_by_grade.length
    if (TARGET_GRADE_BANDS.every(grade => item.grade_bands_in_standard_group.includes(grade))) {
      summary.groups_with_all_h4g_standard_context += 1
    }
    if (TARGET_GRADE_BANDS.every(grade => item.grade_bands_in_anchor_rows.includes(grade))) {
      summary.groups_with_all_target_anchor_grades += 1
    }
  }
  return summary
}

function expectedStatic(row) {
  return {
    candidate_match: row.candidate_match || {},
    candidate_match_id: row.candidate_match_id || '',
    decision_id: row.decision_id || '',
    decision_status: row.decision_status || '',
    parent_anchor_policy_decision_id: row.parent_anchor_policy_decision_id || '',
    parent_work_queue: row.parent_work_queue || '',
    priority_rank: row.priority_rank || 0,
    reviewer_outcome: row.reviewer_outcome || '',
    source_anchor_specificity_review_item_id: row.source_anchor_specificity_review_item_id || '',
    source_file: row.source_file || row.candidate_match?.source_file || '',
    standard_code: row.standard_code || '',
    target_grade_band: row.grade_band || ''
  }
}

function validateDecisionSummary(expected, actual, prefix, errors) {
  for (const [key, value] of Object.entries(expectedStatic(expected))) {
    if (!sameJson(actual[key], value)) errors.push(`${prefix} ${key} mismatch`)
  }
  if (actual.grade_alignment?.target_grade_band !== expected.grade_band) {
    errors.push(`${prefix} grade_alignment.target_grade_band mismatch`)
  }
  if (actual.grade_alignment?.same_grade_candidate !== true) {
    errors.push(`${prefix} same_grade_candidate must be true for same-grade source-anchor packet`)
  }
}

function validateItem(item, expectedRows, errors, stats) {
  const prefix = item.evidence_packet_item_id || item.progression_group_id || '(evidence packet item)'
  if (item.evidence_packet_item_id !== evidencePacketItemId(item.progression_group_id)) {
    errors.push(`${prefix} evidence_packet_item_id mismatch`)
  }
  validateEvidencePacketPolicy(prefix, item, errors)
  validateEvidencePacketPolicy(`${prefix} evidence_packet_policy`, item.evidence_packet_policy || {}, errors)
  const expectedCodes = sorted(expectedRows.flatMap(row => row.group_standard_codes || []).concat(expectedRows.map(row => row.standard_code)))
  if (!sameJson(item.group_standard_codes || [], expectedCodes)) errors.push(`${prefix} group_standard_codes mismatch`)
  if (!sameJson(sorted((item.standard_context_by_grade || []).map(row => row.code)), expectedCodes)) {
    errors.push(`${prefix} standard_context_by_grade codes mismatch`)
  }
  if ((item.standard_context_by_grade || []).some(row => row.found_in_public_data !== true)) {
    errors.push(`${prefix} all standard_context_by_grade rows must be found in public data`)
  }
  if (!sameJson(item.anchor_summary || {}, summarizeAnchors(item.source_anchor_decision_rows || []))) {
    errors.push(`${prefix} anchor_summary mismatch`)
  }
  const byReviewId = mapBy(item.source_anchor_decision_rows || [], 'source_anchor_specificity_review_item_id', errors, `${prefix} decision summaries`)
  for (const expected of expectedRows) {
    const actual = byReviewId.get(expected.source_anchor_specificity_review_item_id)
    if (!actual) {
      errors.push(`${prefix} missing decision summary: ${expected.source_anchor_specificity_review_item_id}`)
      continue
    }
    validateDecisionSummary(expected, actual, `${prefix} ${expected.source_anchor_specificity_review_item_id}`, errors)
  }
  stats.audited_evidence_packet_items += 1
}

function summarizeAnchors(rows) {
  const summary = {
    by_candidate_grade_band: {},
    by_edition: {},
    by_page_range_status: {},
    by_parent_work_queue: {},
    by_reviewer_outcome: {},
    by_standard_code: {},
    candidate_anchor_decisions: rows.length,
    source_files: sorted(rows.map(row => row.source_file)).length,
    unique_candidate_matches: sorted(rows.map(row => row.candidate_match_id)).length
  }
  for (const row of rows) {
    countInto(summary.by_candidate_grade_band, row.grade_alignment?.candidate_grade_band)
    countInto(summary.by_edition, row.candidate_match?.edition)
    countInto(summary.by_page_range_status, row.candidate_match?.page_range ? 'page_range_ready' : 'missing_page_range')
    countInto(summary.by_parent_work_queue, row.parent_work_queue)
    countInto(summary.by_reviewer_outcome, row.reviewer_outcome)
    countInto(summary.by_standard_code, row.standard_code)
  }
  return summary
}

function markdownSummary(payload) {
  return `# H4G Unit Source-Anchor Specificity Evidence Packet Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected evidence packet items | ${payload.summary.expected_evidence_packet_items} |
| audited evidence packet items | ${payload.summary.audited_evidence_packet_items} |
| missing evidence packet items | ${payload.summary.missing_evidence_packet_items} |
| extra evidence packet items | ${payload.summary.extra_evidence_packet_items} |
| decision rows in packet | ${payload.summary.decision_rows_in_packet} |
| standard context rows | ${payload.summary.standard_context_rows} |

## Subjects

| subject | groups |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['packet', args.packet],
    ['decisions', args.decisions]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const packet = existsSync(args.packet) ? readJson(args.packet) : { source_anchor_specificity_evidence_items: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { source_anchor_specificity_decisions: [] }
  if (!errors.length) validateTopLevel(packet, decisions, args, errors)
  const expectedGroups = groupRows(decisions.source_anchor_specificity_decisions || [])
  const actualByGroup = mapBy(packet.source_anchor_specificity_evidence_items || [], 'progression_group_id', errors, 'packet')
  const stats = {
    audited_evidence_packet_items: 0,
    expected_evidence_packet_items: expectedGroups.size,
    extra_evidence_packet_items: 0,
    missing_evidence_packet_items: 0,
    ...summarize(packet.source_anchor_specificity_evidence_items || [])
  }
  if (!sameJson(packet.summary || {}, summarize(packet.source_anchor_specificity_evidence_items || []))) {
    errors.push('packet summary does not match rows')
  }
  for (const [progressionGroupId, expectedRows] of expectedGroups.entries()) {
    const item = actualByGroup.get(progressionGroupId)
    if (!item) {
      stats.missing_evidence_packet_items += 1
      errors.push(`${progressionGroupId} missing evidence packet item`)
      continue
    }
    validateItem(item, expectedRows, errors, stats)
  }
  for (const progressionGroupId of actualByGroup.keys()) {
    if (!expectedGroups.has(progressionGroupId)) {
      stats.extra_evidence_packet_items += 1
      errors.push(`${progressionGroupId} unexpected evidence packet item`)
    }
  }
  if (args.requireItems && !(packet.source_anchor_specificity_evidence_items || []).length) {
    errors.push('requireItems is set but packet has no evidence items')
  }
  return {
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    packet: args.packet,
    publication_ready: false,
    require_items: args.requireItems,
    summary: stats,
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
  const payload = audit(args)
  if (args.out) writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({
    errors: payload.errors,
    generated_at: payload.generated_at,
    out: args.out,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid,
    writes_public_data: payload.writes_public_data
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
