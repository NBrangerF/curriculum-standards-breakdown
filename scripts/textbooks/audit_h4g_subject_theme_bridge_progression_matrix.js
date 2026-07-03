#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_MATRIX = 'generated/textbook_evidence/h4g_theme_bridge_progression_matrix_full_page_recovered_english_pe.json'
const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_remediation_packet_full_page_recovered_english_pe.json'
const DEFAULT_REGISTRY = 'generated/textbook_evidence/h4g_theme_bridge_registry_full_page_recovered_codex_reviewed_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_progression_matrix_full_page_recovered_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_progression_matrix_full_page_recovered_english_pe_audit.md'

function parseArgs(argv) {
  const args = {
    matrix: DEFAULT_MATRIX,
    packet: DEFAULT_PACKET,
    registry: DEFAULT_REGISTRY,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireGroups: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--matrix') args.matrix = argv[++i]
    else if (item === '--packet') args.packet = argv[++i]
    else if (item === '--registry') args.registry = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-groups') args.requireGroups = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_progression_matrix.js \\
  --matrix generated/textbook_evidence/h4g_theme_bridge_progression_matrix_full_page_recovered_english_pe.json \\
  --packet generated/textbook_evidence/h4g_theme_bridge_remediation_packet_full_page_recovered_english_pe.json \\
  --registry generated/textbook_evidence/h4g_theme_bridge_registry_full_page_recovered_codex_reviewed_english_pe.json \\
  --strict --require-groups

Audits the read-only H4G subject-theme bridge progression matrix. It verifies
group coverage against remediation and registry sources, and blocks publication
claims, public writes, official text changes, and direct matcher use.`)
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

function sourceGroupIds(packet, registry) {
  return sorted([
    ...(packet.remediation_items || []).map(row => row.progression_group_id),
    ...(registry.bridges || []).map(row => row.progression_group_id)
  ])
}

function matrixGroupIds(matrix) {
  return sorted((matrix.progression_groups || []).map(row => row.progression_group_id))
}

function auditTopLevel(matrix, packet, registry, errors) {
  if (matrix.valid !== true) errors.push('matrix valid must be true')
  if (matrix.purpose !== 'h4g_subject_theme_bridge_progression_matrix') {
    errors.push('matrix purpose must be h4g_subject_theme_bridge_progression_matrix')
  }
  if (matrix.publication_candidate !== false) errors.push('matrix publication_candidate must be false')
  if (matrix.publication_ready !== false) errors.push('matrix publication_ready must be false')
  if (matrix.matcher_ready !== false) errors.push('matrix matcher_ready must be false')
  if (matrix.writes_public_data !== false) errors.push('matrix writes_public_data must be false')
  if (matrix.changes_official_standard_text !== false) errors.push('matrix changes_official_standard_text must be false')
  if (matrix.direct_matcher_use !== false) errors.push('matrix direct_matcher_use must be false')
  if (matrix.policy?.read_only !== true) errors.push('matrix policy.read_only must be true')
  if (matrix.policy?.progression_group_matrix_only !== true) errors.push('matrix policy.progression_group_matrix_only must be true')
  if (matrix.policy?.writes_public_data !== false) errors.push('matrix policy.writes_public_data must be false')
  if (packet.valid !== true) errors.push('remediation packet valid must be true')
  if (packet.purpose !== 'h4g_subject_theme_bridge_remediation_packet') {
    errors.push('remediation packet purpose must be h4g_subject_theme_bridge_remediation_packet')
  }
  if (registry.valid !== true) errors.push('registry valid must be true')
  if (registry.purpose !== 'h4g_reviewed_subject_theme_bridge_registry') {
    errors.push('registry purpose must be h4g_reviewed_subject_theme_bridge_registry')
  }
}

function auditItem(item, errors, stats) {
  const prefix = item.matrix_item_id || item.progression_group_id || '(missing matrix item)'
  if (!item.matrix_item_id) errors.push(`${prefix} missing matrix_item_id`)
  if (!item.progression_group_id) errors.push(`${prefix} missing progression_group_id`)
  if (!item.subject_slug) errors.push(`${prefix} missing subject_slug`)
  if (!Array.isArray(item.public_standards) || !item.public_standards.length) {
    errors.push(`${prefix} must include public_standards`)
  }
  if (!item.resolution?.track) errors.push(`${prefix} missing resolution.track`)
  if (!item.resolution?.decision_owner) errors.push(`${prefix} missing resolution.decision_owner`)
  if (!item.resolution?.recommended_next_step) errors.push(`${prefix} missing resolution.recommended_next_step`)
  if (item.resolution?.publication_ready !== false) errors.push(`${prefix} resolution.publication_ready must be false`)
  if (item.resolution?.writes_public_data !== false) errors.push(`${prefix} resolution.writes_public_data must be false`)
  if (item.publication_policy?.writes_public_data !== false) errors.push(`${prefix} must not write public data`)
  if (item.publication_policy?.changes_official_standard_text !== false) {
    errors.push(`${prefix} must not change official standard text`)
  }
  if (item.publication_policy?.direct_matcher_use !== false) errors.push(`${prefix} must not request direct matcher use`)
  const completeTracks = new Set([
    'complete_h4g_triplet_approved_bridge_group_needs_publication_gates',
    'complete_single_or_partial_grade_bridge_group_needs_publication_gates'
  ])
  if (item.coverage?.complete_public_grade_coverage === true && !completeTracks.has(item.resolution?.track)) {
    errors.push(`${prefix} complete coverage must use an approved complete-coverage track`)
  }
  countInto(stats.by_resolution_track, item.resolution?.track)
  countInto(stats.by_subject, item.subject_slug)
  countInto(stats.by_public_grade_coverage, (item.coverage?.public_grade_bands || []).join('+') || 'missing')
  stats.approved_bridges += item.summary?.approved_bridge_count || 0
  stats.remediation_items += item.summary?.remediation_item_count || 0
  if ((item.summary?.approved_bridge_count || 0) > 0) stats.groups_with_approved_bridges += 1
  if ((item.summary?.remediation_item_count || 0) > 0) stats.groups_with_needs_revision += 1
  if ((item.summary?.high_priority_remediation_count || 0) > 0) stats.groups_with_high_priority_remediation += 1
  if (item.coverage?.complete_public_grade_coverage === true) stats.complete_approved_bridge_groups += 1
  if (item.resolution?.track === 'complete_h4g_triplet_approved_bridge_group_needs_publication_gates') {
    stats.complete_h4g_triplet_approved_groups += 1
  }
  if (item.resolution?.track === 'complete_single_or_partial_grade_bridge_group_needs_publication_gates') {
    stats.complete_single_or_partial_grade_bridge_groups += 1
  }
}

function markdownSummary(result) {
  return `# H4G Subject Theme Bridge Progression Matrix Audit

Generated at: ${result.generated_at}

| Field | Value |
| --- | ---: |
| valid | ${result.valid} |
| progression groups | ${result.summary.progression_groups} |
| expected source groups | ${result.summary.expected_source_groups} |
| missing source groups | ${result.summary.missing_source_groups} |
| extra matrix groups | ${result.summary.extra_matrix_groups} |
| complete approved bridge groups | ${result.summary.complete_approved_bridge_groups} |
| complete H4G triplet approved groups | ${result.summary.complete_h4g_triplet_approved_groups} |
| complete single/partial-grade approved groups | ${result.summary.complete_single_or_partial_grade_bridge_groups} |

## Resolution Tracks

| track | groups |
| --- | ---: |
${countRows(result.summary.by_resolution_track)}

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
  for (const [label, path] of [['matrix', args.matrix], ['packet', args.packet], ['registry', args.registry]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (errors.length) {
    const result = { valid: false, errors }
    console.log(JSON.stringify(result, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const matrix = readJson(args.matrix)
  const packet = readJson(args.packet)
  const registry = readJson(args.registry)
  auditTopLevel(matrix, packet, registry, errors)
  const expectedGroups = sourceGroupIds(packet, registry)
  const actualGroups = matrixGroupIds(matrix)
  const missing = expectedGroups.filter(group => !actualGroups.includes(group))
  const extra = actualGroups.filter(group => !expectedGroups.includes(group))
  if (missing.length) errors.push(`${missing.length} source groups missing from matrix`)
  if (extra.length) errors.push(`${extra.length} matrix groups not found in remediation packet or registry`)
  if (args.requireGroups && !actualGroups.length) errors.push('requireGroups is set but matrix has no progression_groups')
  const seen = new Set()
  const stats = {
    approved_bridges: 0,
    by_public_grade_coverage: {},
    by_resolution_track: {},
    by_subject: {},
    complete_approved_bridge_groups: 0,
    complete_h4g_triplet_approved_groups: 0,
    complete_single_or_partial_grade_bridge_groups: 0,
    groups_with_approved_bridges: 0,
    groups_with_high_priority_remediation: 0,
    groups_with_needs_revision: 0,
    remediation_items: 0
  }
  for (const item of matrix.progression_groups || []) {
    if (seen.has(item.progression_group_id)) errors.push(`${item.progression_group_id} appears more than once`)
    seen.add(item.progression_group_id)
    auditItem(item, errors, stats)
  }
  const result = {
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    matrix: args.matrix,
    publication_ready: false,
    summary: {
      ...stats,
      expected_source_groups: expectedGroups.length,
      extra_matrix_groups: extra.length,
      missing_source_groups: missing.length,
      progression_groups: actualGroups.length
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
