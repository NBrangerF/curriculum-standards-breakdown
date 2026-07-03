#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_TRIAGE = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_group_triage.json'
const DEFAULT_EVIDENCE_PACKET = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_evidence_packet.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_group_triage_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_group_triage_audit.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']

const TRIAGE_ROUTES = {
  READY: 'ready_for_manual_source_anchor_specificity_decision_review',
  ANCHOR_GRADE_GAP: 'collect_missing_target_grade_anchors_before_decision_review',
  PARTIAL_CONTEXT_GAP: 'repair_partial_progression_group_or_standard_context_before_anchor_review'
}

function parseArgs(argv) {
  const args = {
    evidencePacket: DEFAULT_EVIDENCE_PACKET,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    triage: DEFAULT_TRIAGE
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--triage') args.triage = argv[++i]
    else if (item === '--evidence-packet') args.evidencePacket = argv[++i]
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
node scripts/textbooks/audit_h4g_unit_evidence_anchor_policy_source_anchor_specificity_group_triage.js \\
  --strict --require-items

Audits the read-only H4G unit source-anchor specificity group triage against
the source-anchor specificity evidence packet.`)
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
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    evidence_packet_only: false,
    matcher_ready: false,
    publication_ready: false,
    requires_later_anchor_policy_decision_edit: true,
    requires_later_candidate_coverage_recheck: true,
    requires_later_consistency_gate: true,
    requires_later_manual_review: true,
    requires_later_publication_gate: true,
    review_batch_only: true,
    source_anchor_specificity_batch_only: true,
    source_anchor_specificity_group_triage_only: true,
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

function validateTriagePolicy(label, payload, errors) {
  validatePolicy(label, payload, errors)
  for (const key of [
    'requires_later_anchor_policy_decision_edit',
    'requires_later_candidate_coverage_recheck',
    'requires_later_consistency_gate',
    'requires_later_manual_review',
    'requires_later_publication_gate',
    'review_batch_only',
    'source_anchor_specificity_batch_only',
    'source_anchor_specificity_group_triage_only'
  ]) {
    if (payload[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  if (payload.evidence_packet_only !== false) errors.push(`${label}.evidence_packet_only must be false`)
}

function validateTopLevel(triage, packet, args, errors) {
  if (triage.valid !== true) errors.push('triage valid must be true')
  if ((triage.errors || []).length) errors.push('triage errors must be empty')
  if (triage.purpose !== 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_group_triage') {
    errors.push('triage purpose mismatch')
  }
  if (triage.source_anchor_policy_source_anchor_specificity_evidence_packet !== args.evidencePacket) {
    errors.push('triage source evidence packet must match audit arg')
  }
  if (!Array.isArray(triage.source_anchor_specificity_group_triage_items)) {
    errors.push('triage source_anchor_specificity_group_triage_items must be an array')
  }
  validateTriagePolicy('triage', triage, errors)
  validateTriagePolicy('triage policy', triage.policy || {}, errors)

  if (packet.valid !== true) errors.push('evidence packet valid must be true')
  if (packet.purpose !== 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_evidence_packet') {
    errors.push('evidence packet purpose mismatch')
  }
  if (!Array.isArray(packet.source_anchor_specificity_evidence_items)) {
    errors.push('evidence packet source_anchor_specificity_evidence_items must be an array')
  }
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

function hasAllH4GStandardContext(item) {
  return TARGET_GRADE_BANDS.every(grade => (item.grade_bands_in_standard_group || []).includes(grade)) &&
    (item.standard_context_by_grade || []).filter(row => TARGET_GRADE_BANDS.includes(row.grade_band)).every(row => row.found_in_public_data === true)
}

function hasAllTargetAnchorGrades(item) {
  return TARGET_GRADE_BANDS.every(grade => (item.grade_bands_in_anchor_rows || []).includes(grade)) &&
    !(item.missing_target_grade_bands_in_anchors || []).length
}

function triageRoute(item) {
  if (hasAllH4GStandardContext(item) && hasAllTargetAnchorGrades(item)) return TRIAGE_ROUTES.READY
  if (hasAllH4GStandardContext(item)) return TRIAGE_ROUTES.ANCHOR_GRADE_GAP
  return TRIAGE_ROUTES.PARTIAL_CONTEXT_GAP
}

function routePriority(route) {
  if (route === TRIAGE_ROUTES.READY) return 10
  if (route === TRIAGE_ROUTES.ANCHOR_GRADE_GAP) return 20
  return 30
}

function nextGate(route) {
  if (route === TRIAGE_ROUTES.READY) {
    return 'manual_fill_source_anchor_specificity_decisions_for_ready_groups_then_audit_with_require_complete_scope'
  }
  if (route === TRIAGE_ROUTES.ANCHOR_GRADE_GAP) {
    return 'expand_candidate_matching_for_missing_target_grade_anchors_then_rebuild_source_anchor_evidence_packet'
  }
  return 'repair_partial_h4g_group_or_standard_context_before_source_anchor_review'
}

function requiredClosureChecks(route) {
  if (route === TRIAGE_ROUTES.READY) {
    return [
      'review_each_candidate_anchor_against_sibling_h4g_standard_context',
      'confirm_unit_title_is_specific_not_broad_topic_only',
      'record_completed_source_anchor_specificity_decisions',
      'rerun_source_anchor_specificity_decisions_audit'
    ]
  }
  if (route === TRIAGE_ROUTES.ANCHOR_GRADE_GAP) {
    return [
      'fill_missing_target_grade_anchor_candidates',
      'rerun_candidate_coverage_or_match_diagnostics_for_missing_grades',
      'rebuild_source_anchor_specificity_batch_decisions_and_evidence_packet'
    ]
  }
  return [
    'repair_or_confirm_progression_group_grade_membership',
    'restore_missing_h4g_standard_context',
    'rerun_h4g_grade_differentiation_and_issue_matrix'
  ]
}

function triageItemId(progressionGroupId) {
  return `h4g_unit_source_anchor_specificity_group_triage_${hashText(progressionGroupId)}`
}

function compactAnchorSummary(item) {
  return {
    anchor_rows: item.source_anchor_decision_rows?.length || 0,
    by_candidate_grade_band: item.anchor_summary?.by_candidate_grade_band || {},
    by_edition: item.anchor_summary?.by_edition || {},
    by_standard_code: item.anchor_summary?.by_standard_code || {},
    source_files: item.anchor_summary?.source_files || 0,
    unique_candidate_matches: item.anchor_summary?.unique_candidate_matches || 0
  }
}

function expectedItem(item) {
  const route = triageRoute(item)
  const anchorGradeBands = sorted(item.grade_bands_in_anchor_rows || [])
  return {
    anchor_grade_bands: anchorGradeBands,
    anchor_summary: compactAnchorSummary(item),
    evidence_packet_item_id: item.evidence_packet_item_id || '',
    group_progression_completeness: item.group_progression_completeness || '',
    group_standard_codes: item.group_standard_codes || [],
    has_all_h4g_standard_context: hasAllH4GStandardContext(item),
    has_all_target_anchor_grades: hasAllTargetAnchorGrades(item),
    missing_target_anchor_grade_bands: TARGET_GRADE_BANDS.filter(grade => !anchorGradeBands.includes(grade)),
    next_gate: nextGate(route),
    priority: routePriority(route),
    progression_group_id: item.progression_group_id || '',
    required_closure_checks: requiredClosureChecks(route),
    source_anchor_specificity_group_triage_item_id: triageItemId(item.progression_group_id || ''),
    standard_context_rows: item.standard_context_by_grade?.length || 0,
    standard_grade_bands: sorted(item.grade_bands_in_standard_group || []),
    subject_slug: item.subject_slug || '',
    target_grade_bands: TARGET_GRADE_BANDS,
    triage_route: route
  }
}

function summarize(rows) {
  const summary = {
    anchor_grade_gap_groups: 0,
    by_group_progression_completeness: {},
    by_subject: {},
    by_triage_route: {},
    group_triage_items: rows.length,
    partial_or_context_gap_groups: 0,
    ready_for_manual_review_groups: 0,
    triage_anchor_rows: 0,
    triage_standard_context_rows: 0
  }
  for (const row of rows) {
    countInto(summary.by_group_progression_completeness, row.group_progression_completeness)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_triage_route, row.triage_route)
    summary.triage_anchor_rows += row.anchor_summary?.anchor_rows || 0
    summary.triage_standard_context_rows += row.standard_context_rows || 0
    if (row.triage_route === TRIAGE_ROUTES.READY) summary.ready_for_manual_review_groups += 1
    if (row.triage_route === TRIAGE_ROUTES.ANCHOR_GRADE_GAP) summary.anchor_grade_gap_groups += 1
    if (row.triage_route === TRIAGE_ROUTES.PARTIAL_CONTEXT_GAP) summary.partial_or_context_gap_groups += 1
  }
  return summary
}

function validateItem(row, expected, errors, stats) {
  const prefix = row.source_anchor_specificity_group_triage_item_id || row.progression_group_id || '(triage item)'
  validatePolicy(prefix, row, errors)
  validateTriagePolicy(`${prefix} policy`, row.policy || {}, errors)
  for (const [key, value] of Object.entries(expected)) {
    if (!sameJson(row[key], value)) errors.push(`${prefix} ${key} mismatch`)
  }
  if (row.triage_scope_note !== 'Group-level routing only. It is not a source-anchor decision and must not be copied into public standards.') {
    errors.push(`${prefix} triage_scope_note mismatch`)
  }
  stats.audited_group_triage_items += 1
}

function markdownSummary(payload) {
  return `# H4G Unit Source-Anchor Specificity Group Triage Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected group triage items | ${payload.summary.expected_group_triage_items} |
| audited group triage items | ${payload.summary.audited_group_triage_items} |
| missing group triage items | ${payload.summary.missing_group_triage_items} |
| extra group triage items | ${payload.summary.extra_group_triage_items} |
| ready for manual review groups | ${payload.summary.ready_for_manual_review_groups} |
| anchor grade gap groups | ${payload.summary.anchor_grade_gap_groups} |
| partial/context gap groups | ${payload.summary.partial_or_context_gap_groups} |

## Routes

| route | groups |
| --- | ---: |
${countRows(payload.summary.by_triage_route)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['triage', args.triage],
    ['evidence packet', args.evidencePacket]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const triage = existsSync(args.triage) ? readJson(args.triage) : { source_anchor_specificity_group_triage_items: [] }
  const packet = existsSync(args.evidencePacket) ? readJson(args.evidencePacket) : { source_anchor_specificity_evidence_items: [] }
  if (!errors.length) validateTopLevel(triage, packet, args, errors)

  const expectedByGroup = new Map((packet.source_anchor_specificity_evidence_items || []).map(item => [item.progression_group_id, expectedItem(item)]))
  const actualRows = triage.source_anchor_specificity_group_triage_items || []
  const actualByGroup = mapBy(actualRows, 'progression_group_id', errors, 'triage')
  const stats = {
    audited_group_triage_items: 0,
    expected_group_triage_items: expectedByGroup.size,
    extra_group_triage_items: 0,
    missing_group_triage_items: 0,
    ...summarize(actualRows)
  }
  if (!sameJson(triage.summary || {}, summarize(actualRows))) errors.push('triage summary does not match rows')
  for (const [progressionGroupId, expected] of expectedByGroup.entries()) {
    const row = actualByGroup.get(progressionGroupId)
    if (!row) {
      stats.missing_group_triage_items += 1
      errors.push(`${progressionGroupId} missing group triage item`)
      continue
    }
    validateItem(row, expected, errors, stats)
  }
  for (const progressionGroupId of actualByGroup.keys()) {
    if (!expectedByGroup.has(progressionGroupId)) {
      stats.extra_group_triage_items += 1
      errors.push(`${progressionGroupId} unexpected group triage item`)
    }
  }
  if (args.requireItems && !actualRows.length) errors.push('requireItems is set but no group triage items were audited')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    evidence_packet: args.evidencePacket,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    require_items: args.requireItems,
    summary: stats,
    triage: args.triage,
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
