#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_priority_matrix_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_priority_matrix_anchor_domain_rejected_english_pe.md'

const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']
const TRACK_PRIORITY = {
  partial_approved_bridge_needs_grade_completion: 1,
  complete_single_or_partial_grade_bridge_group_needs_publication_gates: 2,
  english_source_anchor_model_required: 3,
  pe_source_anchor_model_required: 3
}

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    maxSamples: 5,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--max-samples') args.maxSamples = Number(argv[++i]) || args.maxSamples
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_priority_matrix.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only priority matrix from an H4G subject-theme bridge anchor
review batch. The matrix groups remaining English/PE items by progression
group so reviewers can decide grade progression anchors before any matcher or
publication gate is used.`)
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

function hashText(value, length = 12) {
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

function groupItems(items) {
  const groups = new Map()
  for (const item of items) {
    const key = item.progression_group_id || `missing-${hashText(item.anchor_review_item_id || item.remediation_item_id)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return groups
}

function trackRank(tracks) {
  return Math.min(...tracks.map(track => TRACK_PRIORITY[track] || 9))
}

function reviewStrategy(subjectSlug, tracks, actionFamilies, riskFlags, gradeBands) {
  if (tracks.includes('partial_approved_bridge_needs_grade_completion')) {
    return 'complete_missing_grade_slots_before_publication_review'
  }
  if (tracks.includes('complete_single_or_partial_grade_bridge_group_needs_publication_gates')) {
    return 'confirm_anchor_then_run_publication_gates'
  }
  if (riskFlags.some(flag => flag.includes('unit_overmatches_many_standards')) || riskFlags.some(flag => flag.includes('standard_has_many_bridge_candidates'))) {
    return 'fanout_first_source_review'
  }
  if (subjectSlug === 'english' && actionFamilies.some(family => family.includes('culture'))) {
    return 'english_cultural_objective_source_review'
  }
  if (subjectSlug === 'english') return 'english_speech_or_strategy_source_review'
  if (subjectSlug === 'pe') return 'pe_domain_anchor_source_review'
  return gradeBands.length < TARGET_GRADE_BANDS.length ? 'fill_partial_grade_group' : 'source_anchor_review'
}

function scoreGroup(rows) {
  const highPriority = rows.filter(item => item.action_priority === 'high').length
  const units = sorted(rows.map(item => item.unit_context?.unit_evidence_id)).length
  const standards = sorted(rows.map(item => item.standard_context?.standard_code)).length
  const tracks = sorted(rows.map(item => item.matrix_context?.resolution_track))
  const riskFlags = sorted(rows.flatMap(item => item.evidence_profile?.risk_flags || []))
  const riskScore = riskFlags.filter(flag => (
    flag.includes('unit_overmatches_many_standards') ||
    flag.includes('standard_has_many_bridge_candidates') ||
    flag.includes('single_shared_topic_tag')
  )).length
  const gradeCount = sorted(rows.map(item => item.grade_band)).length
  return {
    score: (trackRank(tracks) * -1000) + highPriority * 30 + rows.length * 6 + units * 3 + standards * 4 + riskScore + (TARGET_GRADE_BANDS.length - gradeCount) * 5,
    high_priority_items: highPriority,
    risk_score: riskScore,
    unit_count: units,
    standard_count: standards
  }
}

function priorityTier(rank, group) {
  if (group.high_priority_items > 0) return 'P1'
  if (group.resolution_tracks.includes('partial_approved_bridge_needs_grade_completion')) return 'P1'
  if (group.total_items >= 6 || group.risk_flags.includes('unit_overmatches_many_standards')) return 'P2'
  if (group.total_items >= 3) return 'P3'
  return 'P4'
}

function sampleItems(rows, maxSamples) {
  return rows
    .slice()
    .sort((a, b) => {
      const priority = (a.action_priority === 'high' ? 0 : 1) - (b.action_priority === 'high' ? 0 : 1)
      if (priority) return priority
      const grade = String(a.grade_band || '').localeCompare(String(b.grade_band || ''))
      if (grade) return grade
      return String(a.standard_context?.standard_code || '').localeCompare(String(b.standard_context?.standard_code || ''))
    })
    .slice(0, maxSamples)
    .map(item => ({
      action_family: item.action_family || '',
      anchor_type: item.anchor_requirement?.anchor_type || '',
      bridge_score: item.bridge_context?.bridge_score ?? null,
      grade_band: item.grade_band || '',
      page_range: item.bridge_context?.page_range || '',
      page_start: item.bridge_context?.page_start ?? null,
      shared_topic_tags: item.bridge_context?.shared_topic_tags || [],
      standard_code: item.standard_context?.standard_code || '',
      standard_domain: item.standard_context?.domain || '',
      unit_evidence_id: item.unit_context?.unit_evidence_id || '',
      unit_title: item.unit_context?.unit_title || ''
    }))
}

function buildPriorityGroup(groupId, rows, rank, maxSamples) {
  const first = rows[0] || {}
  const gradeBands = sorted(rows.map(item => item.grade_band))
  const missingGradeBands = TARGET_GRADE_BANDS.filter(band => !gradeBands.includes(band))
  const actionFamilies = sorted(rows.map(item => item.action_family))
  const anchorTypes = sorted(rows.map(item => item.anchor_requirement?.anchor_type))
  const riskFlags = sorted(rows.flatMap(item => item.evidence_profile?.risk_flags || []))
  const resolutionTracks = sorted(rows.map(item => item.matrix_context?.resolution_track))
  const score = scoreGroup(rows)
  const actionFamilyItemCounts = {}
  const gradeBandItemCounts = {}
  for (const item of rows) {
    countInto(actionFamilyItemCounts, item.action_family)
    countInto(gradeBandItemCounts, item.grade_band)
  }
  const group = {
    action_families: actionFamilies,
    action_family_item_counts: actionFamilyItemCounts,
    anchor_types: anchorTypes,
    approved_grade_bands: sorted(rows.flatMap(item => item.matrix_context?.approved_grade_bands || [])),
    decision_owner: compactList(rows.map(item => item.decision_owner), 4),
    domains: sorted(rows.map(item => item.standard_context?.domain)),
    grade_bands: gradeBands,
    grade_band_item_counts: gradeBandItemCounts,
    high_priority_items: score.high_priority_items,
    matrix_item_ids: sorted(rows.map(item => item.matrix_context?.matrix_item_id)),
    missing_grade_bands: missingGradeBands,
    priority_rank: rank,
    progression_group_id: groupId,
    remediation_item_ids: sorted(rows.map(item => item.remediation_item_id)),
    resolution_tracks: resolutionTracks,
    review_strategy: reviewStrategy(first.subject_slug, resolutionTracks, actionFamilies, riskFlags, gradeBands),
    risk_flags: riskFlags,
    sample_items: sampleItems(rows, maxSamples),
    standard_codes: sorted(rows.map(item => item.standard_context?.standard_code)),
    subject_slug: first.subject_slug || first.standard_context?.subject_slug || '',
    subdomains: sorted(rows.map(item => item.standard_context?.subdomain)),
    total_items: rows.length,
    unit_evidence_ids: sorted(rows.map(item => item.unit_context?.unit_evidence_id)),
    unit_titles: sorted(rows.map(item => item.unit_context?.unit_title))
  }
  group.priority_tier = priorityTier(rank, group)
  return group
}

function buildMatrix(batch, maxSamples) {
  const groups = [...groupItems(batch.anchor_review_items || []).entries()]
    .map(([groupId, rows]) => {
      const score = scoreGroup(rows)
      return { groupId, rows, score: score.score }
    })
    .sort((a, b) => {
      const score = b.score - a.score
      if (score) return score
      return a.groupId.localeCompare(b.groupId)
    })
  return groups.map((group, index) => buildPriorityGroup(group.groupId, group.rows, index + 1, maxSamples))
}

function buildSummary(groups, itemCount) {
  const summary = {
    anchor_review_items: itemCount,
    by_action_family_groups: {},
    by_action_family_items: {},
    by_grade_band_groups: {},
    by_grade_band_items: {},
    by_priority_tier_groups: {},
    by_resolution_track_groups: {},
    by_review_strategy_groups: {},
    by_subject_groups: {},
    by_subject_items: {},
    high_priority_groups: 0,
    priority_groups: groups.length,
    p1_groups: 0,
    total_sample_items: 0
  }
  for (const group of groups) {
    countInto(summary.by_priority_tier_groups, group.priority_tier)
    countInto(summary.by_review_strategy_groups, group.review_strategy)
    countInto(summary.by_subject_groups, group.subject_slug)
    countInto(summary.by_subject_items, group.subject_slug, group.total_items)
    for (const family of group.action_families) countInto(summary.by_action_family_groups, family)
    for (const [family, count] of Object.entries(group.action_family_item_counts)) countInto(summary.by_action_family_items, family, count)
    for (const band of group.grade_bands) countInto(summary.by_grade_band_groups, band)
    for (const [band, count] of Object.entries(group.grade_band_item_counts)) countInto(summary.by_grade_band_items, band, count)
    for (const track of group.resolution_tracks) countInto(summary.by_resolution_track_groups, track)
    if (group.high_priority_items > 0) summary.high_priority_groups += 1
    if (group.priority_tier === 'P1') summary.p1_groups += 1
    summary.total_sample_items += group.sample_items.length
  }
  return summary
}

function validateBatch(batch, errors) {
  if (batch.valid !== true) errors.push('anchor review batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_review_batch') {
    errors.push('anchor review batch purpose must be h4g_subject_theme_bridge_anchor_review_batch')
  }
  if (!Array.isArray(batch.anchor_review_items)) errors.push('anchor review batch anchor_review_items must be an array')
  if (batch.publication_ready !== false) errors.push('anchor review batch publication_ready must be false')
  if (batch.publication_candidate !== false) errors.push('anchor review batch publication_candidate must be false')
  if (batch.matcher_ready !== false) errors.push('anchor review batch matcher_ready must be false')
  if (batch.writes_public_data !== false) errors.push('anchor review batch writes_public_data must be false')
  if (batch.changes_official_standard_text !== false) errors.push('anchor review batch changes_official_standard_text must be false')
  if (batch.direct_matcher_use !== false) errors.push('anchor review batch direct_matcher_use must be false')
}

function validateMatrix(payload, expectedItemCount, requireItems, errors) {
  const actualItemCount = payload.priority_groups.reduce((sum, group) => sum + group.total_items, 0)
  if (actualItemCount !== expectedItemCount) {
    errors.push(`priority groups cover ${actualItemCount} items but batch has ${expectedItemCount}`)
  }
  if (requireItems && expectedItemCount === 0) errors.push('requireItems is set but batch has no items')
  if (requireItems && payload.priority_groups.length === 0) errors.push('requireItems is set but matrix has no groups')
  for (const group of payload.priority_groups) {
    const prefix = group.progression_group_id || '(missing group)'
    if (!group.subject_slug) errors.push(`${prefix} missing subject_slug`)
    if (!group.standard_codes.length) errors.push(`${prefix} missing standard codes`)
    if (!group.unit_evidence_ids.length) errors.push(`${prefix} missing unit evidence ids`)
    if (!group.review_strategy) errors.push(`${prefix} missing review strategy`)
    if (!group.priority_tier) errors.push(`${prefix} missing priority tier`)
  }
}

function groupRows(groups, limit = 40) {
  return groups.slice(0, limit).map(group => (
    `| ${group.priority_rank} | ${markdownCell(group.priority_tier)} | ${markdownCell(group.subject_slug)} | ${markdownCell(group.progression_group_id)} | ${group.total_items} | ${group.standard_codes.length} | ${group.unit_evidence_ids.length} | ${markdownCell(compactList(group.grade_bands, 3))} | ${markdownCell(group.review_strategy)} | ${markdownCell(compactList(group.action_families, 3))} |`
  )).join('\n') || '| - | - | - | - | 0 | 0 | 0 | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Subject Theme Bridge Anchor Priority Matrix

Generated at: ${payload.generated_at}

This is a read-only triage matrix for the remaining English/PE H4G source-anchor
review items. It groups review work by \`progression_group_id\` so reviewers can
decide grade progression anchors before any matcher, publication gate, or
\`public/data\` write.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| anchor review items | ${payload.summary.anchor_review_items} |
| priority groups | ${payload.summary.priority_groups} |
| P1 groups | ${payload.summary.p1_groups} |
| high priority groups | ${payload.summary.high_priority_groups} |
| writes public data | ${payload.writes_public_data} |
| publication ready | ${payload.publication_ready} |
| matcher ready | ${payload.matcher_ready} |

## Priority Tiers

| tier | groups |
| --- | ---: |
${countRows(payload.summary.by_priority_tier_groups)}

## Review Strategies

| strategy | groups |
| --- | ---: |
${countRows(payload.summary.by_review_strategy_groups)}

## Resolution Tracks

| track | groups |
| --- | ---: |
${countRows(payload.summary.by_resolution_track_groups)}

## Top Priority Groups

| rank | tier | subject | progression group | items | standards | units | grades | strategy | action families |
| ---: | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
${groupRows(payload.priority_groups)}

## Boundary

- The matrix is a review planner only; it does not approve bridges.
- Official standard text must stay unchanged.
- A group can move toward H4G differentiation only after standard-scoped,
  same-grade, page-ready source anchors pass later matcher and publication gates.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  if (!existsSync(args.batch)) errors.push(`Missing anchor review batch: ${args.batch}`)
  const batch = errors.length ? { anchor_review_items: [] } : readJson(args.batch)
  if (!errors.length) validateBatch(batch, errors)

  const priorityGroups = buildMatrix(batch, args.maxSamples)
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
      read_only: true,
      review_planner_only: true,
      requires_later_matcher_gate: true,
      requires_later_publication_gate: true,
      writes_public_data: false
    },
    priority_groups: priorityGroups,
    publication_candidate: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_priority_matrix',
    source_anchor_review_batch: args.batch,
    summary: buildSummary(priorityGroups, (batch.anchor_review_items || []).length),
    valid: false,
    writes_public_data: false
  }
  validateMatrix(payload, (batch.anchor_review_items || []).length, args.requireItems, errors)
  payload.valid = errors.length === 0

  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
