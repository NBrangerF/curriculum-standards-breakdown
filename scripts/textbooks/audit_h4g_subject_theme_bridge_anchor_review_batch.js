#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_language_use_pe_quality_rejected_english_pe.json'
const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_remediation_packet_language_use_pe_quality_rejected_english_pe.json'
const DEFAULT_MATRIX = 'generated/textbook_evidence/h4g_theme_bridge_progression_matrix_language_use_pe_quality_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_language_use_pe_quality_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_language_use_pe_quality_rejected_english_pe_audit.md'

const ANCHOR_TYPES = new Set([
  'english_cultural_objective_anchor',
  'english_learning_strategy_or_language_knowledge_anchor',
  'english_speech_function_or_discourse_anchor',
  'pe_health_behavior_or_load_management_anchor',
  'pe_movement_skill_fitness_or_sportsmanship_anchor'
])

const ACTION_FAMILIES = new Set([
  'english_communication_topic_requires_speech_function_anchor',
  'english_culture_theme_requires_cultural_objective_review',
  'english_learning_strategy_requires_standard_anchor',
  'pe_activity_skill_requires_movement_standard_anchor',
  'pe_health_theory_requires_health_behavior_review'
])

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    matrix: DEFAULT_MATRIX,
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
    else if (item === '--packet') args.packet = argv[++i]
    else if (item === '--matrix') args.matrix = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_review_batch.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_language_use_pe_quality_rejected_english_pe.json \\
  --packet generated/textbook_evidence/h4g_theme_bridge_remediation_packet_language_use_pe_quality_rejected_english_pe.json \\
  --matrix generated/textbook_evidence/h4g_theme_bridge_progression_matrix_language_use_pe_quality_rejected_english_pe.json \\
  --strict --require-items

Audits the read-only H4G subject-theme bridge source-anchor review batch. It
checks full coverage of the remediation packet, matrix lineage, and publication
boundary flags.`)
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

function packetByRemediationId(packet) {
  return new Map((packet.remediation_items || []).map(item => [item.remediation_item_id, item]))
}

function matrixGroupIds(matrix) {
  return new Set((matrix.progression_groups || []).map(item => item.progression_group_id))
}

function auditTopLevel(batch, packet, matrix, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_review_batch') {
    errors.push('batch purpose must be h4g_subject_theme_bridge_anchor_review_batch')
  }
  if (batch.publication_candidate !== false) errors.push('batch publication_candidate must be false')
  if (batch.publication_ready !== false) errors.push('batch publication_ready must be false')
  if (batch.matcher_ready !== false) errors.push('batch matcher_ready must be false')
  if (batch.writes_public_data !== false) errors.push('batch writes_public_data must be false')
  if (batch.changes_official_standard_text !== false) errors.push('batch changes_official_standard_text must be false')
  if (batch.direct_matcher_use !== false) errors.push('batch direct_matcher_use must be false')
  if (batch.policy?.read_only !== true) errors.push('batch policy.read_only must be true')
  if (batch.policy?.anchor_review_batch_only !== true) errors.push('batch policy.anchor_review_batch_only must be true')
  if (!Array.isArray(batch.anchor_review_items)) errors.push('batch anchor_review_items must be an array')
  if (packet.valid !== true) errors.push('remediation packet valid must be true')
  if (packet.purpose !== 'h4g_subject_theme_bridge_remediation_packet') {
    errors.push('remediation packet purpose must be h4g_subject_theme_bridge_remediation_packet')
  }
  if (matrix.valid !== true) errors.push('progression matrix valid must be true')
  if (matrix.purpose !== 'h4g_subject_theme_bridge_progression_matrix') {
    errors.push('progression matrix purpose must be h4g_subject_theme_bridge_progression_matrix')
  }
}

function auditItem(item, sourceItem, matrixGroups, errors, stats) {
  const prefix = item.anchor_review_item_id || item.remediation_item_id || '(missing anchor item)'
  if (!item.anchor_review_item_id) errors.push(`${prefix} missing anchor_review_item_id`)
  if (!item.remediation_item_id) errors.push(`${prefix} missing remediation_item_id`)
  if (!sourceItem) errors.push(`${prefix} remediation_item_id not found in source packet`)
  if (!item.source_decision_id) errors.push(`${prefix} missing source_decision_id`)
  if (sourceItem && item.source_decision_id !== sourceItem.source_decision_id) {
    errors.push(`${prefix} source_decision_id does not match remediation packet`)
  }
  if (!item.progression_group_id) errors.push(`${prefix} missing progression_group_id`)
  if (item.progression_group_id && !matrixGroups.has(item.progression_group_id)) {
    errors.push(`${prefix} progression_group_id missing from matrix`)
  }
  if (!ACTION_FAMILIES.has(item.action_family)) errors.push(`${prefix} unknown action_family ${item.action_family}`)
  if (!ANCHOR_TYPES.has(item.anchor_requirement?.anchor_type)) {
    errors.push(`${prefix} unknown anchor_type ${item.anchor_requirement?.anchor_type || 'missing'}`)
  }
  if (!item.anchor_requirement?.review_questions?.length) errors.push(`${prefix} missing review questions`)
  if (!item.anchor_requirement?.approval_gate) errors.push(`${prefix} missing approval gate`)
  if (!item.anchor_requirement?.reject_if) errors.push(`${prefix} missing reject_if`)
  if (item.evidence_profile?.source_review_decision !== 'needs_revision') {
    errors.push(`${prefix} source_review_decision must remain needs_revision`)
  }
  if (item.decision_template?.writes_public_data !== false) errors.push(`${prefix} must not write public data`)
  if (item.decision_template?.changes_official_standard_text !== false) {
    errors.push(`${prefix} must not change official standard text`)
  }
  if (item.decision_template?.direct_matcher_use !== false) errors.push(`${prefix} must not request direct matcher use`)
  if (item.decision_template?.matcher_ready !== false) errors.push(`${prefix} must not be matcher ready`)
  if (item.decision_template?.publication_ready !== false) errors.push(`${prefix} must not be publication ready`)
  if (!item.standard_context?.standard_code) errors.push(`${prefix} missing standard code`)
  if (!item.standard_context?.subject_slug) errors.push(`${prefix} missing subject slug`)
  if (!item.unit_context?.unit_evidence_id) errors.push(`${prefix} missing unit evidence id`)
  countInto(stats.by_action_family, item.action_family)
  countInto(stats.by_anchor_type, item.anchor_requirement?.anchor_type)
  countInto(stats.by_decision_owner, item.decision_owner)
  countInto(stats.by_grade_band, item.grade_band)
  countInto(stats.by_resolution_track, item.matrix_context?.resolution_track)
  countInto(stats.by_subject, item.subject_slug || item.standard_context?.subject_slug)
  if (item.action_priority === 'high') stats.high_priority_items += 1
  if (item.bridge_context?.page_ready === true) stats.page_ready_items += 1
}

function markdownSummary(result) {
  return `# H4G Subject Theme Bridge Anchor Review Batch Audit

Generated at: ${result.generated_at}

| Field | Value |
| --- | ---: |
| valid | ${result.valid} |
| review items | ${result.summary.review_items} |
| expected remediation items | ${result.summary.expected_remediation_items} |
| missing remediation items | ${result.summary.missing_remediation_items} |
| extra anchor review items | ${result.summary.extra_anchor_review_items} |
| affected progression groups | ${result.summary.affected_progression_groups} |
| affected standards | ${result.summary.affected_standards} |
| high priority items | ${result.summary.high_priority_items} |
| page-ready items | ${result.summary.page_ready_items} |

## Action Families

| family | items |
| --- | ---: |
${countRows(result.summary.by_action_family)}

## Anchor Types

| anchor type | items |
| --- | ---: |
${countRows(result.summary.by_anchor_type)}

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
  for (const [label, path] of [['batch', args.batch], ['packet', args.packet], ['matrix', args.matrix]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (errors.length) {
    const result = { errors, valid: false }
    console.log(JSON.stringify(result, null, 2))
    if (args.strict) process.exit(1)
    return
  }
  const batch = readJson(args.batch)
  const packet = readJson(args.packet)
  const matrix = readJson(args.matrix)
  auditTopLevel(batch, packet, matrix, errors)
  const packetItems = packetByRemediationId(packet)
  const matrixGroups = matrixGroupIds(matrix)
  const expectedIds = sorted((packet.remediation_items || []).map(item => item.remediation_item_id))
  const actualIds = sorted((batch.anchor_review_items || []).map(item => item.remediation_item_id))
  const missing = expectedIds.filter(id => !actualIds.includes(id))
  const extra = actualIds.filter(id => !expectedIds.includes(id))
  if (missing.length) errors.push(`${missing.length} remediation items missing from anchor review batch`)
  if (extra.length) errors.push(`${extra.length} anchor review items not found in remediation packet`)
  if (args.requireItems && !actualIds.length) errors.push('requireItems is set but batch has no anchor_review_items')
  const seen = new Set()
  const stats = {
    by_action_family: {},
    by_anchor_type: {},
    by_decision_owner: {},
    by_grade_band: {},
    by_resolution_track: {},
    by_subject: {},
    high_priority_items: 0,
    page_ready_items: 0
  }
  for (const item of batch.anchor_review_items || []) {
    if (seen.has(item.remediation_item_id)) errors.push(`${item.remediation_item_id} appears more than once`)
    seen.add(item.remediation_item_id)
    auditItem(item, packetItems.get(item.remediation_item_id), matrixGroups, errors, stats)
  }
  const result = {
    batch: args.batch,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    summary: {
      ...stats,
      affected_progression_groups: sorted((batch.anchor_review_items || []).map(item => item.progression_group_id)).length,
      affected_standards: sorted((batch.anchor_review_items || []).map(item => item.standard_context?.standard_code)).length,
      expected_remediation_items: expectedIds.length,
      extra_anchor_review_items: extra.length,
      missing_remediation_items: missing.length,
      review_items: actualIds.length
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
