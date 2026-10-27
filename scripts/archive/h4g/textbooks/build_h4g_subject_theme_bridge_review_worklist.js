#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_template.json'
const DEFAULT_TAXONOMY = 'scripts/textbooks/h4g_subject_theme_taxonomy.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_worklist.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_worklist.md'
const STRUCTURAL_DENY_TERMS = new Set(['unit', 'module'])

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    taxonomy: DEFAULT_TAXONOMY,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireItems: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--taxonomy') args.taxonomy = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_review_worklist.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \\
  --strict --require-items

Builds a read-only source-review worklist from H4G subject theme bridge review
decisions. The worklist prioritizes page-ready and lower-risk items, exposes
fan-out risks, and never approves bridges, writes public/data, or enables
matcher use.`)
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

function taxonomyMaps(taxonomy) {
  const tagLabels = {}
  const denyTerms = {}
  for (const [subject, config] of Object.entries(taxonomy.subjects || {})) {
    denyTerms[subject] = config.deny_standalone_terms || []
    tagLabels[subject] = {}
    for (const tag of config.topic_tags || []) {
      if (tag.tag) tagLabels[subject][tag.tag] = tag.label || tag.tag
    }
  }
  return { tagLabels, denyTerms }
}

function emptyStats() {
  return {
    decisions: 0,
    standards: new Set(),
    progression_groups: new Set(),
    units: new Set()
  }
}

function buildStats(decisions) {
  const byStandard = new Map()
  const byUnit = new Map()
  const byTopicTag = new Map()
  const byProgressionGroup = new Map()

  for (const row of decisions) {
    if (row.standard_code) {
      if (!byStandard.has(row.standard_code)) byStandard.set(row.standard_code, emptyStats())
      addStats(byStandard.get(row.standard_code), row)
    }
    if (row.unit_evidence_id) {
      if (!byUnit.has(row.unit_evidence_id)) byUnit.set(row.unit_evidence_id, emptyStats())
      addStats(byUnit.get(row.unit_evidence_id), row)
    }
    if (row.progression_group_id) {
      if (!byProgressionGroup.has(row.progression_group_id)) byProgressionGroup.set(row.progression_group_id, emptyStats())
      addStats(byProgressionGroup.get(row.progression_group_id), row)
    }
    for (const tag of row.shared_topic_tags || []) {
      if (!byTopicTag.has(tag)) byTopicTag.set(tag, emptyStats())
      addStats(byTopicTag.get(tag), row)
    }
  }

  return {
    byStandard,
    byUnit,
    byTopicTag,
    byProgressionGroup
  }
}

function addStats(stats, row) {
  stats.decisions += 1
  if (row.standard_code) stats.standards.add(row.standard_code)
  if (row.progression_group_id) stats.progression_groups.add(row.progression_group_id)
  if (row.unit_evidence_id) stats.units.add(row.unit_evidence_id)
}

function compactStats(stats) {
  return {
    decisions: stats?.decisions || 0,
    standards: stats?.standards?.size || 0,
    progression_groups: stats?.progression_groups?.size || 0,
    units: stats?.units?.size || 0
  }
}

function includesDenyTerm(row, denyTerms) {
  const text = `${row.unit_title || ''}\n${(row.shared_topic_tags || []).join('\n')}`.toLowerCase()
  return (denyTerms[row.subject_slug] || [])
    .filter(term => !STRUCTURAL_DENY_TERMS.has(String(term).toLowerCase()))
    .filter(term => text.includes(String(term).toLowerCase()))
}

function broadTopicTags(row, stats) {
  return (row.shared_topic_tags || []).filter(tag => {
    const tagStats = stats.byTopicTag.get(tag)
    return (tagStats?.decisions || 0) >= 40 || (tagStats?.standards?.size || 0) >= 20
  })
}

function riskFlags(row, stats, maps) {
  const flags = []
  const unitStats = stats.byUnit.get(row.unit_evidence_id)
  const standardStats = stats.byStandard.get(row.standard_code)
  const groupStats = stats.byProgressionGroup.get(row.progression_group_id)
  const broadTags = broadTopicTags(row, stats)
  const denyTerms = includesDenyTerm(row, maps.denyTerms)

  if (!row.page_ready) flags.push('page_missing')
  if ((row.bridge_score || 0) <= 11) flags.push('low_bridge_score')
  if ((row.shared_topic_tags || []).length === 1) flags.push('single_shared_topic_tag')
  if (broadTags.length) flags.push(...broadTags.map(tag => `broad_topic_tag:${tag}`))
  if (denyTerms.length) flags.push(...denyTerms.map(term => `deny_term_in_unit_title:${term}`))
  if ((unitStats?.standards?.size || 0) >= 10) flags.push('unit_overmatches_many_standards')
  if ((standardStats?.decisions || 0) >= 4) flags.push('standard_has_many_bridge_candidates')
  if ((groupStats?.standards?.size || 0) >= 8) flags.push('progression_group_has_large_review_surface')
  if (/学业质量|综合表现|质量|表现/.test(`${row.domain || ''} ${row.subdomain || ''}`) || /-QUAL-/.test(row.standard_code || '')) {
    flags.push('quality_or_performance_standard_needs_curriculum_review')
  }
  return sorted(flags)
}

function priorityScore(row, flags) {
  let score = Number(row.bridge_score || 0)
  if (row.page_ready) score += 50
  else score += 10
  if ((row.shared_topic_tags || []).length > 1) score += 8
  if (flags.some(flag => flag.startsWith('broad_topic_tag:'))) score -= 18
  if (flags.includes('unit_overmatches_many_standards')) score -= 14
  if (flags.includes('quality_or_performance_standard_needs_curriculum_review')) score -= 10
  if (flags.includes('low_bridge_score')) score -= 8
  if (flags.some(flag => flag.startsWith('deny_term_in_unit_title:'))) score -= 10
  if (flags.includes('standard_has_many_bridge_candidates')) score -= 4
  return score
}

function priorityTier(score, row) {
  if (row.page_ready && score >= 45) return 1
  if (row.page_ready) return 2
  if (score >= 20) return 3
  return 4
}

function reviewPath(row) {
  return row.page_ready ? 'source_review_ready' : 'page_recovery_then_source_review'
}

function recommendedScope(row, flags) {
  if (flags.some(flag => flag.startsWith('broad_topic_tag:')) ||
      flags.includes('unit_overmatches_many_standards') ||
      flags.includes('quality_or_performance_standard_needs_curriculum_review')) {
    return 'standard_code_scope_first'
  }
  if ((row.shared_topic_tags || []).length > 1 && row.progression_group_id) {
    return 'progression_group_scope_possible_after_curriculum_review'
  }
  return 'standard_code_scope_first'
}

function requiredNextStep(row, flags) {
  if (!row.page_ready) return 'recover_or_confirm_page_start_before_publication_gate'
  if (flags.some(flag => flag.startsWith('broad_topic_tag:')) || flags.includes('unit_overmatches_many_standards')) {
    return 'source_review_exact_standard_to_unit_relationship_before_any_approval'
  }
  return 'source_review_candidate_bridge_scope'
}

function tagLabels(row, maps) {
  const labels = maps.tagLabels[row.subject_slug] || {}
  return Object.fromEntries((row.shared_topic_tags || []).map(tag => [tag, labels[tag] || tag]))
}

function buildWorkItem(row, stats, maps) {
  const flags = riskFlags(row, stats, maps)
  const score = priorityScore(row, flags)
  const unitStats = stats.byUnit.get(row.unit_evidence_id)
  const standardStats = stats.byStandard.get(row.standard_code)
  const groupStats = stats.byProgressionGroup.get(row.progression_group_id)
  const topicStats = Object.fromEntries((row.shared_topic_tags || []).map(tag => [tag, compactStats(stats.byTopicTag.get(tag))]))

  return {
    work_item_id: `h4g_theme_bridge_review_work_${hashText(row.decision_id || row.source_review_id)}`,
    source_decision_id: row.decision_id || '',
    source_review_id: row.source_review_id || '',
    reviewer_decision: row.reviewer_decision || '',
    decision_status: row.decision_status || '',
    review_path: reviewPath(row),
    priority_tier: priorityTier(score, row),
    priority_score: score,
    required_next_step: requiredNextStep(row, flags),
    recommended_approval_scope: recommendedScope(row, flags),
    risk_flags: flags,
    subject_slug: row.subject_slug || '',
    grade_band: row.grade_band || '',
    standard_code: row.standard_code || '',
    progression_group_id: row.progression_group_id || '',
    domain: row.domain || '',
    subdomain: row.subdomain || '',
    unit_evidence_id: row.unit_evidence_id || '',
    textbook_evidence_id: row.textbook_evidence_id || '',
    unit_title: row.unit_title || '',
    unit_level: row.unit_level || '',
    edition: row.edition || '',
    volume: row.volume || '',
    page_ready: row.page_ready === true,
    page_start: row.page_start ?? null,
    page_end: row.page_end ?? null,
    page_range: row.page_range || '',
    page_range_status: row.page_range_status || '',
    bridge_score: row.bridge_score || 0,
    shared_topic_tags: row.shared_topic_tags || [],
    shared_topic_labels: tagLabels(row, maps),
    fanout: {
      standard_candidate_count: standardStats?.decisions || 0,
      unit_linked_standard_count: unitStats?.standards?.size || 0,
      unit_linked_progression_group_count: unitStats?.progression_groups?.size || 0,
      progression_group_candidate_count: groupStats?.decisions || 0,
      topic_tag_stats: topicStats
    },
    publication_policy: {
      writes_public_data: false,
      changes_official_standard_text: false,
      eligible_for_h4g_differentiation: false,
      direct_matcher_use: false,
      requires_later_matcher_gate: true,
      requires_later_publication_gate: true
    }
  }
}

function topFanoutUnits(workItems) {
  const byUnit = new Map()
  for (const item of workItems) {
    if (!byUnit.has(item.unit_evidence_id)) {
      byUnit.set(item.unit_evidence_id, {
        unit_evidence_id: item.unit_evidence_id,
        unit_title: item.unit_title,
        subject_slug: item.subject_slug,
        grade_band: item.grade_band,
        edition: item.edition,
        volume: item.volume,
        linked_standards: new Set(),
        linked_progression_groups: new Set(),
        work_items: 0,
        page_ready: item.page_ready
      })
    }
    const unit = byUnit.get(item.unit_evidence_id)
    unit.work_items += 1
    unit.linked_standards.add(item.standard_code)
    unit.linked_progression_groups.add(item.progression_group_id)
  }
  return [...byUnit.values()]
    .map(unit => ({
      ...unit,
      linked_standards: unit.linked_standards.size,
      linked_progression_groups: unit.linked_progression_groups.size
    }))
    .sort((a, b) => b.linked_standards - a.linked_standards || a.unit_title.localeCompare(b.unit_title))
    .slice(0, 30)
}

function summarize(workItems) {
  const summary = {
    work_items: workItems.length,
    source_review_ready_items: workItems.filter(item => item.review_path === 'source_review_ready').length,
    page_recovery_items: workItems.filter(item => item.review_path === 'page_recovery_then_source_review').length,
    priority_1_items: workItems.filter(item => item.priority_tier === 1).length,
    priority_2_items: workItems.filter(item => item.priority_tier === 2).length,
    priority_3_items: workItems.filter(item => item.priority_tier === 3).length,
    priority_4_items: workItems.filter(item => item.priority_tier === 4).length,
    by_subject: {},
    by_grade_band: {},
    by_review_path: {},
    by_priority_tier: {},
    by_required_next_step: {},
    by_risk_flag: {},
    by_shared_topic_tag: {}
  }
  for (const item of workItems) {
    countInto(summary.by_subject, item.subject_slug)
    countInto(summary.by_grade_band, item.grade_band)
    countInto(summary.by_review_path, item.review_path)
    countInto(summary.by_priority_tier, `P${item.priority_tier}`)
    countInto(summary.by_required_next_step, item.required_next_step)
    for (const flag of item.risk_flags || []) countInto(summary.by_risk_flag, flag)
    for (const tag of item.shared_topic_tags || []) countInto(summary.by_shared_topic_tag, tag)
  }
  return stable(summary)
}

function validateInputs(decisions, taxonomy, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_review_decisions_template')
  }
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.changes_official_standard_text !== false) errors.push('decisions changes_official_standard_text must be false')
  if (decisions.direct_matcher_use !== false) errors.push('decisions direct_matcher_use must be false')
  if (taxonomy.writes_public_data !== false) errors.push('taxonomy writes_public_data must be false')
  if (args.requireItems && !(decisions.bridge_review_decisions || []).length) {
    errors.push('requireItems is set but decisions file has no bridge_review_decisions')
  }
}

function subjectRows(summary) {
  return Object.entries(summary.by_subject || {})
    .map(([subject, count]) => `| ${markdownCell(subject)} | ${count} |`)
    .join('\n') || '| - | 0 |'
}

function workItemRows(items) {
  return items.slice(0, 80)
    .map(item => `| P${item.priority_tier} | ${markdownCell(item.review_path)} | ${markdownCell(item.subject_slug)} | ${markdownCell(item.grade_band)} | ${markdownCell(item.standard_code)} | ${markdownCell(item.unit_title)} | ${markdownCell(item.shared_topic_tags.join(', '))} | ${markdownCell(item.risk_flags.slice(0, 3).join(', '))} |`)
    .join('\n') || '| - | - | - | - | - | - | - | - |'
}

function fanoutRows(units) {
  return units.slice(0, 20)
    .map(unit => `| ${markdownCell(unit.subject_slug)} | ${markdownCell(unit.grade_band)} | ${markdownCell(unit.unit_title)} | ${unit.linked_standards} | ${unit.linked_progression_groups} | ${markdownCell(unit.page_ready)} |`)
    .join('\n') || '| - | - | - | 0 | 0 | - |'
}

function markdownSummary(payload) {
  return `# H4G Subject Theme Bridge Review Worklist

Generated at: ${payload.generated_at}

This is a read-only source-review worklist. It prioritizes bridge decisions for
review, but does not approve bridges, write \`public/data\`, change official
standard text, or enable matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| work items | ${payload.summary.work_items} |
| source-review ready items | ${payload.summary.source_review_ready_items} |
| page-recovery items | ${payload.summary.page_recovery_items} |
| P1 items | ${payload.summary.priority_1_items} |
| P2 items | ${payload.summary.priority_2_items} |
| P3 items | ${payload.summary.priority_3_items} |
| P4 items | ${payload.summary.priority_4_items} |

## Subjects

| Subject | Work Items |
| --- | ---: |
${subjectRows(payload.summary)}

## Review Path

| Path | Count |
| --- | ---: |
${countRows(payload.summary.by_review_path)}

## Risk Flags

| Risk Flag | Count |
| --- | ---: |
${countRows(payload.summary.by_risk_flag)}

## High-Fanout Units

| Subject | Grade | Unit Title | Linked Standards | Linked Groups | Page Ready |
| --- | --- | --- | ---: | ---: | --- |
${fanoutRows(payload.high_fanout_units)}

## Work Item Preview

| Priority | Path | Subject | Grade | Standard | Unit Title | Shared Tags | Key Risks |
| --- | --- | --- | --- | --- | --- | --- | --- |
${workItemRows(payload.work_items)}

## Use

- Start with P1 \`source_review_ready\` items.
- Treat high-fanout units and broad topic tags as curriculum review risks.
- Page-missing items can be reviewed conceptually, but cannot enter publication gates until page evidence is recovered.
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
    ['taxonomy', args.taxonomy]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors }, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const decisions = readJson(args.decisions)
  const taxonomy = readJson(args.taxonomy)
  validateInputs(decisions, taxonomy, args, errors)
  const rows = decisions.bridge_review_decisions || []
  const stats = buildStats(rows)
  const maps = taxonomyMaps(taxonomy)
  const workItems = rows
    .map(row => buildWorkItem(row, stats, maps))
    .sort((a, b) => a.priority_tier - b.priority_tier ||
      b.priority_score - a.priority_score ||
      a.subject_slug.localeCompare(b.subject_slug) ||
      a.grade_band.localeCompare(b.grade_band) ||
      a.standard_code.localeCompare(b.standard_code) ||
      a.unit_title.localeCompare(b.unit_title))

  const payload = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    schema_version: 1,
    purpose: 'h4g_subject_theme_bridge_source_review_worklist',
    source_decisions: args.decisions,
    taxonomy: args.taxonomy,
    publication_candidate: false,
    matcher_ready: false,
    source_review_complete: decisions.source_review_complete === true,
    writes_public_data: false,
    changes_official_standard_text: false,
    eligible_for_h4g_differentiation: false,
    direct_matcher_use: false,
    policy: {
      read_only_worklist: true,
      writes_public_data: false,
      changes_official_standard_text: false,
      eligible_for_h4g_differentiation: false,
      direct_matcher_use: false,
      requires_later_matcher_gate: true,
      requires_later_publication_gate: true
    },
    summary: summarize(workItems),
    high_fanout_units: topFanoutUnits(workItems),
    work_items: workItems,
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
