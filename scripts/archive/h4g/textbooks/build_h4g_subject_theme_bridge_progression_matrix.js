#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_remediation_packet_full_page_recovered_english_pe.json'
const DEFAULT_REGISTRY = 'generated/textbook_evidence/h4g_theme_bridge_registry_full_page_recovered_codex_reviewed_english_pe.json'
const DEFAULT_STANDARDS_ROOT = 'public/data/by_subject'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_progression_matrix_full_page_recovered_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_progression_matrix_full_page_recovered_english_pe.md'

const TARGET_GRADES = ['H4G7', 'H4G8', 'H4G9']

function parseArgs(argv) {
  const args = {
    packet: DEFAULT_PACKET,
    registry: DEFAULT_REGISTRY,
    standardsRoot: DEFAULT_STANDARDS_ROOT,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireGroups: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
    else if (item === '--registry') args.registry = argv[++i]
    else if (item === '--standards-root') args.standardsRoot = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_progression_matrix.js \\
  --packet generated/textbook_evidence/h4g_theme_bridge_remediation_packet_full_page_recovered_english_pe.json \\
  --registry generated/textbook_evidence/h4g_theme_bridge_registry_full_page_recovered_codex_reviewed_english_pe.json \\
  --strict --require-groups

Builds a read-only progression-group matrix for H4G subject-theme bridge
remediation. It groups needs-revision bridge items and approved bridge registry
rows by progression_group_id, then classifies why each group is not publication
ready. It does not approve bridges, write public/data, change official standard
text, or enable direct matcher use.`)
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

function compactList(values, limit = 6) {
  const items = sorted(values)
  if (items.length <= limit) return items.join('；')
  return `${items.slice(0, limit).join('；')}；...(+${items.length - limit})`
}

function loadSubjectStandards(root, subjectSlug, errors) {
  const path = join(root, `${subjectSlug}.json`)
  if (!existsSync(path)) {
    errors.push(`Missing standards file for subject ${subjectSlug}: ${path}`)
    return []
  }
  const payload = readJson(path)
  if (!Array.isArray(payload.standards)) {
    errors.push(`Standards file ${path} must contain standards array`)
    return []
  }
  return payload.standards
}

function standardCode(row) {
  return row?.code || row?.id || row?.standard_code || ''
}

function standardsByGroup(root, subjectSlugs, errors) {
  const byGroup = new Map()
  for (const subject of sorted(subjectSlugs)) {
    for (const standard of loadSubjectStandards(root, subject, errors)) {
      if (!TARGET_GRADES.includes(standard.grade_band)) continue
      const groupId = standard.progression_group_id || standardCode(standard)
      if (!groupId) continue
      if (!byGroup.has(groupId)) byGroup.set(groupId, [])
      byGroup.get(groupId).push(standard)
    }
  }
  return byGroup
}

function validateInputs(packet, registry, args, errors) {
  if (packet.valid !== true) errors.push('remediation packet valid must be true')
  if (packet.purpose !== 'h4g_subject_theme_bridge_remediation_packet') {
    errors.push('remediation packet purpose must be h4g_subject_theme_bridge_remediation_packet')
  }
  if (packet.writes_public_data !== false) errors.push('remediation packet writes_public_data must be false')
  if (packet.changes_official_standard_text !== false) errors.push('remediation packet changes_official_standard_text must be false')
  if (packet.direct_matcher_use !== false) errors.push('remediation packet direct_matcher_use must be false')
  if (registry.valid !== true) errors.push('registry valid must be true')
  if (registry.purpose !== 'h4g_reviewed_subject_theme_bridge_registry') {
    errors.push('registry purpose must be h4g_reviewed_subject_theme_bridge_registry')
  }
  if (!Array.isArray(registry.bridges)) errors.push('registry.bridges must be an array')
  if (registry.writes_public_data !== false) errors.push('registry writes_public_data must be false')
  if (registry.changes_official_standard_text !== false) errors.push('registry changes_official_standard_text must be false')
  if (registry.publication_ready !== false) errors.push('registry publication_ready must be false')
  if (args.requireGroups && !(packet.remediation_items || []).length && !(registry.bridges || []).length) {
    errors.push('requireGroups is set but packet and registry contain no rows')
  }
}

function emptyGroup(groupId) {
  return {
    approved: [],
    groupId,
    remediation: []
  }
}

function groupRows(remediationItems, bridges) {
  const groups = new Map()
  for (const item of remediationItems || []) {
    const groupId = item.progression_group_id || ''
    if (!groupId) continue
    if (!groups.has(groupId)) groups.set(groupId, emptyGroup(groupId))
    groups.get(groupId).remediation.push(item)
  }
  for (const bridge of bridges || []) {
    const groupId = bridge.progression_group_id || ''
    if (!groupId) continue
    if (!groups.has(groupId)) groups.set(groupId, emptyGroup(groupId))
    groups.get(groupId).approved.push(bridge)
  }
  return groups
}

function gradeCoverage(publicGradeBands, approvedGradeBands, remediationGradeBands) {
  return {
    approved_grade_bands: approvedGradeBands,
    no_bridge_surface_grade_bands: publicGradeBands.filter(grade => !approvedGradeBands.includes(grade) && !remediationGradeBands.includes(grade)),
    public_grade_bands: publicGradeBands,
    remediation_grade_bands: remediationGradeBands,
    unresolved_grade_bands: publicGradeBands.filter(grade => !approvedGradeBands.includes(grade))
  }
}

function familyCounts(items) {
  const out = {}
  for (const item of items) countInto(out, item.action?.action_family)
  return stable(out)
}

function resolutionTrack(group, publicRows) {
  const remediation = group.remediation || []
  const approved = group.approved || []
  const families = sorted(remediation.map(item => item.action?.action_family))
  const approvedGrades = sorted(approved.map(row => row.grade_band))
  const publicGrades = sorted(publicRows.map(row => row.grade_band))
  const unresolvedGrades = publicGrades.filter(grade => !approvedGrades.includes(grade))
  const isFullH4GTriplet = TARGET_GRADES.every(grade => publicGrades.includes(grade))

  if (publicGrades.length && unresolvedGrades.length === 0) {
    if (isFullH4GTriplet) {
      return {
        decision_owner: 'subject_theme_bridge_source_review',
        recommended_next_step: 'Group has approved bridge coverage for H4G7/H4G8/H4G9; run matcher, candidate consistency, and publication gates before any public write.',
        track: 'complete_h4g_triplet_approved_bridge_group_needs_publication_gates'
      }
    }
    return {
      decision_owner: 'subject_theme_bridge_source_review',
      recommended_next_step: 'Group has approved bridge coverage for every public grade in this single/partial-grade group; this is not proof of a full H4G7/H4G8/H4G9 progression.',
      track: 'complete_single_or_partial_grade_bridge_group_needs_publication_gates'
    }
  }
  if (approved.length) {
    return {
      decision_owner: 'subject_theme_bridge_source_review',
      recommended_next_step: 'Keep approved bridges diagnostic and resolve the missing grade-band bridges before claiming grade progression for the group.',
      track: 'partial_approved_bridge_needs_grade_completion'
    }
  }
  if (families.includes('pe_quality_or_performance_requires_curriculum_progression_review')) {
    return {
      decision_owner: 'pe_curriculum_progression_review',
      recommended_next_step: 'Route to curriculum progression review; quality/performance standards need rubric or progression evidence, not a direct unit-title bridge.',
      track: 'curriculum_progression_review_required'
    }
  }
  if (families.includes('english_language_use_requires_function_anchor')) {
    return {
      decision_owner: 'english_curriculum_source_review',
      recommended_next_step: 'Reject title-only Language in use bridges unless a concrete language function, task, or activity anchor is reviewed.',
      track: 'generic_language_use_title_bridge_blocked'
    }
  }
  if (families.includes('english_communication_topic_requires_speech_function_anchor') ||
    families.includes('english_learning_strategy_requires_standard_anchor') ||
    families.includes('english_culture_theme_requires_cultural_objective_review')) {
    return {
      decision_owner: 'english_curriculum_source_review',
      recommended_next_step: 'Build a narrower English source-anchor model: speech function, discourse type, strategy objective, or cultural objective must be explicit before approval.',
      track: 'english_source_anchor_model_required'
    }
  }
  if (families.includes('pe_activity_skill_requires_movement_standard_anchor') ||
    families.includes('pe_health_theory_requires_health_behavior_review')) {
    return {
      decision_owner: 'pe_curriculum_source_review',
      recommended_next_step: 'Build a narrower PE source-anchor model: movement skill, health behavior, load management, or sportsmanship anchor must be explicit before approval.',
      track: 'pe_source_anchor_model_required'
    }
  }
  return {
    decision_owner: 'subject_theme_bridge_source_review',
    recommended_next_step: 'Keep blocked until a subject-specific source-anchor rule is defined and audited.',
    track: 'subject_source_anchor_rule_required'
  }
}

function compactStandard(row) {
  return {
    code: standardCode(row),
    domain: row.domain || '',
    grade_band: row.grade_band || '',
    grade_specific_focus: row.grade_specific_focus || '',
    standard_variant_type: row.standard_variant_type || '',
    subdomain: row.subdomain || ''
  }
}

function compactBridge(row) {
  return {
    bridge_id: row.bridge_id || '',
    bridge_score: row.bridge_score ?? null,
    grade_band: row.grade_band || '',
    page_range: row.page_range || '',
    scope_type: row.scope_type || '',
    shared_topic_tags: row.shared_topic_tags || [],
    source_decision_id: row.source_decision_id || '',
    standard_code: row.standard_code || '',
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || ''
  }
}

function compactRemediation(row) {
  return {
    action_family: row.action?.action_family || '',
    action_priority: row.action?.action_priority || '',
    decision_owner: row.action?.decision_owner || '',
    grade_band: row.grade_band || '',
    remediation_item_id: row.remediation_item_id || '',
    shared_topic_tags: row.bridge_context?.shared_topic_tags || [],
    source_decision_id: row.source_decision_id || '',
    standard_code: row.standard_context?.standard_code || '',
    unit_evidence_id: row.unit_context?.unit_evidence_id || '',
    unit_title: row.unit_context?.unit_title || ''
  }
}

function matrixItem(group, publicRows) {
  const publicGradeBands = sorted(publicRows.map(row => row.grade_band))
  const approvedGradeBands = sorted(group.approved.map(row => row.grade_band))
  const remediationGradeBands = sorted(group.remediation.map(row => row.grade_band))
  const resolution = resolutionTrack(group, publicRows)
  const actionFamilies = familyCounts(group.remediation)
  return {
    action_families: actionFamilies,
    approved_bridges: group.approved.map(compactBridge),
    coverage: {
      ...gradeCoverage(publicGradeBands, approvedGradeBands, remediationGradeBands),
      complete_public_grade_coverage: publicGradeBands.length > 0 && publicGradeBands.every(grade => approvedGradeBands.includes(grade)),
      public_h4g_grade_count: publicGradeBands.length
    },
    matrix_item_id: `h4g_subject_theme_bridge_progression_${hashText(group.groupId)}`,
    progression_group_id: group.groupId,
    public_standards: publicRows.map(compactStandard),
    publication_policy: {
      changes_official_standard_text: false,
      direct_matcher_use: false,
      eligible_for_h4g_differentiation: false,
      progression_group_matrix_only: true,
      requires_later_candidate_consistency_gate: true,
      requires_later_matcher_gate: true,
      requires_later_publication_gate: true,
      writes_public_data: false
    },
    remediation_items: group.remediation.map(compactRemediation),
    resolution: {
      ...resolution,
      publication_ready: false,
      writes_public_data: false
    },
    subject_slug: publicRows[0]?.subject_slug || group.remediation[0]?.standard_context?.subject_slug || group.approved[0]?.subject_slug || '',
    summary: {
      approved_bridge_count: group.approved.length,
      high_priority_remediation_count: group.remediation.filter(item => item.action?.action_priority === 'high').length,
      remediation_item_count: group.remediation.length,
      remediation_standard_count: sorted(group.remediation.map(item => item.standard_context?.standard_code)).length,
      unit_count: sorted([
        ...group.remediation.map(item => item.unit_context?.unit_evidence_id),
        ...group.approved.map(item => item.unit_evidence_id)
      ]).length
    }
  }
}

function buildSummary(items) {
  const summary = {
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
    progression_groups: items.length,
    remediation_items: 0
  }
  for (const item of items) {
    summary.approved_bridges += item.summary.approved_bridge_count
    summary.remediation_items += item.summary.remediation_item_count
    if (item.summary.approved_bridge_count) summary.groups_with_approved_bridges += 1
    if (item.summary.remediation_item_count) summary.groups_with_needs_revision += 1
    if (item.summary.high_priority_remediation_count) summary.groups_with_high_priority_remediation += 1
    if (item.coverage.complete_public_grade_coverage) summary.complete_approved_bridge_groups += 1
    if (item.resolution.track === 'complete_h4g_triplet_approved_bridge_group_needs_publication_gates') {
      summary.complete_h4g_triplet_approved_groups += 1
    }
    if (item.resolution.track === 'complete_single_or_partial_grade_bridge_group_needs_publication_gates') {
      summary.complete_single_or_partial_grade_bridge_groups += 1
    }
    countInto(summary.by_resolution_track, item.resolution.track)
    countInto(summary.by_subject, item.subject_slug)
    countInto(summary.by_public_grade_coverage, item.coverage.public_grade_bands.join('+') || 'missing')
  }
  return stable(summary)
}

function validatePayload(payload, sourceGroups, errors) {
  const seen = new Set()
  for (const item of payload.progression_groups || []) {
    const prefix = item.matrix_item_id || item.progression_group_id || '(missing matrix item)'
    if (!item.matrix_item_id) errors.push(`${prefix} missing matrix_item_id`)
    if (!item.progression_group_id) errors.push(`${prefix} missing progression_group_id`)
    if (seen.has(item.progression_group_id)) errors.push(`${prefix} duplicate progression_group_id`)
    seen.add(item.progression_group_id)
    if (!item.public_standards?.length) errors.push(`${prefix} has no public standards for progression group`)
    if (item.publication_policy?.writes_public_data !== false) errors.push(`${prefix} must not write public data`)
    if (item.publication_policy?.changes_official_standard_text !== false) errors.push(`${prefix} must not change official standard text`)
    if (item.publication_policy?.direct_matcher_use !== false) errors.push(`${prefix} must not request direct matcher use`)
    if (item.resolution?.publication_ready !== false) errors.push(`${prefix} resolution must not be publication ready`)
  }
  for (const groupId of sourceGroups.keys()) {
    if (!seen.has(groupId)) errors.push(`${groupId} source group missing from progression matrix`)
  }
}

function matrixRows(items) {
  return items.slice(0, 90).map(item => {
    return `| ${markdownCell(item.resolution.track)} | ${markdownCell(item.subject_slug)} | ${markdownCell(item.progression_group_id)} | ${markdownCell(item.coverage.public_grade_bands.join('+'))} | ${markdownCell(item.coverage.approved_grade_bands.join('+') || '-')} | ${markdownCell(item.coverage.remediation_grade_bands.join('+') || '-')} | ${item.summary.approved_bridge_count} | ${item.summary.remediation_item_count} | ${item.summary.high_priority_remediation_count} | ${markdownCell(compactList(Object.keys(item.action_families)))} |`
  }).join('\n') || '| - | - | - | - | - | - | 0 | 0 | 0 | - |'
}

function markdownSummary(payload) {
  return `# H4G Subject Theme Bridge Progression Matrix

Generated at: ${payload.generated_at}

This is a read-only progression-group matrix. It groups approved bridges and
needs-revision remediation items by \`progression_group_id\` so H4G7/H4G8/H4G9
relationships can be reviewed at group level. It does not approve new bridges,
write \`public/data\`, change official standard text, or enable direct matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| progression groups | ${payload.summary.progression_groups} |
| remediation items | ${payload.summary.remediation_items} |
| approved bridges | ${payload.summary.approved_bridges} |
| groups with approved bridges | ${payload.summary.groups_with_approved_bridges} |
| complete approved bridge groups | ${payload.summary.complete_approved_bridge_groups} |
| complete H4G triplet approved groups | ${payload.summary.complete_h4g_triplet_approved_groups} |
| complete single/partial-grade approved groups | ${payload.summary.complete_single_or_partial_grade_bridge_groups} |
| publication ready | ${payload.publication_ready} |

## Resolution Tracks

| track | groups |
| --- | ---: |
${countRows(payload.summary.by_resolution_track)}

## Subjects

| subject | groups |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Progression Groups

| Track | Subject | Progression group | Public grades | Approved grades | Remediation grades | Approved | Remediation | High | Action families |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
${matrixRows(payload.progression_groups)}

## Boundary

- This matrix is not a publication candidate.
- A group is publication-ready only after source review, matcher, candidate consistency, and public-data gates.
- Title-only or broad-topic bridge evidence remains blocked until a narrower source anchor is reviewed.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const errors = []
  for (const [label, path] of [['packet', args.packet], ['registry', args.registry]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors }, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const packet = readJson(args.packet)
  const registry = readJson(args.registry)
  validateInputs(packet, registry, args, errors)
  const subjectSlugs = sorted([
    ...(packet.remediation_items || []).map(item => item.standard_context?.subject_slug),
    ...(registry.bridges || []).map(item => item.subject_slug)
  ])
  const publicByGroup = standardsByGroup(args.standardsRoot, subjectSlugs, errors)
  const sourceGroups = groupRows(packet.remediation_items || [], registry.bridges || [])
  const items = [...sourceGroups.values()]
    .map(group => matrixItem(group, publicByGroup.get(group.groupId) || []))
    .sort((a, b) => {
      const track = a.resolution.track.localeCompare(b.resolution.track)
      if (track) return track
      const high = b.summary.high_priority_remediation_count - a.summary.high_priority_remediation_count
      if (high) return high
      return a.progression_group_id.localeCompare(b.progression_group_id)
    })
  const payload = {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: {
      changes_official_standard_text: false,
      direct_matcher_use: false,
      progression_group_matrix_only: true,
      read_only: true,
      writes_public_data: false
    },
    progression_groups: items,
    publication_candidate: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_progression_matrix',
    source_registry: args.registry,
    source_remediation_packet: args.packet,
    summary: buildSummary(items),
    valid: errors.length === 0,
    writes_public_data: false
  }
  validatePayload(payload, sourceGroups, errors)
  payload.valid = errors.length === 0
  payload.errors = errors
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable({
    errors,
    out: args.out,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid
  }), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
