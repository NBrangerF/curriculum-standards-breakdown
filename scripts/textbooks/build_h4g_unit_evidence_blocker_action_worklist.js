#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DIAGNOSTICS = 'generated/textbook_evidence/h4g_unit_evidence_blocker_match_diagnostics.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_blocker_action_worklist.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_blocker_action_worklist.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']

const ROUTES = {
  review_noneligible_medium_high_match_for_anchor_or_policy: {
    action_type: 'review_anchor_policy_for_noneligible_medium_high_matches',
    queue: 'anchor_policy_review_queue',
    route_priority: 40,
    required_output: 'manual anchor/policy decision for each medium/high non-eligible unit match',
    reviewer_gate: 'Do not mark a match eligible until same-grade scope and standard-specific anchor evidence are confirmed.'
  },
  find_second_clean_edition_or_review_single_edition: {
    action_type: 'find_second_clean_edition_or_review_single_edition',
    queue: 'single_edition_cross_version_queue',
    route_priority: 30,
    required_output: 'second clean edition evidence or an explicit single-edition review note',
    reviewer_gate: 'A single clean edition is not enough for automatic publication; require review before promotion.'
  },
  source_coverage_or_unit_index_gap: {
    action_type: 'repair_source_coverage_or_unit_index_gap',
    queue: 'source_coverage_or_indexing_queue',
    route_priority: 20,
    required_output: 'missing unit index coverage, source coverage note, or confirmed no-match explanation',
    reviewer_gate: 'Repair source/unit indexing before adding aliases or judging the standard unmatched.'
  },
  review_low_confidence_match_or_add_alias: {
    action_type: 'review_low_confidence_match_or_add_scoped_alias',
    queue: 'low_confidence_alias_review_queue',
    route_priority: 10,
    required_output: 'manual low-confidence review with scoped alias only when the unit-standard alignment is confirmed',
    reviewer_gate: 'Do not add broad aliases from low-confidence matches; require narrow same-grade evidence.'
  }
}

function parseArgs(argv) {
  const args = {
    diagnostics: DEFAULT_DIAGNOSTICS,
    out: DEFAULT_OUT,
    requireItems: false,
    routes: [],
    strict: false,
    subjects: [],
    summaryOut: DEFAULT_SUMMARY_OUT,
    topMatchesPerStandard: 3
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--diagnostics') args.diagnostics = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = splitArg(argv[++i])
    else if (item === '--routes') args.routes = splitArg(argv[++i])
    else if (item === '--top-matches-per-standard') args.topMatchesPerStandard = positiveInteger(argv[++i], args.topMatchesPerStandard)
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_unit_evidence_blocker_action_worklist.js \\
  --subjects math,science \\
  --strict --require-items

Builds a read-only H4G unit-evidence blocker action worklist at progression
group grain. It keeps H4G7/H4G8/H4G9 standards together so remediation can
respect grade progression instead of treating each standard as an isolated row.`)
}

function splitArg(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
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

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function truncate(value, max = 120) {
  const text = markdownCell(value)
  if (text.length <= max) return text
  return `${text.slice(0, max - 3)}...`
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
    matcher_ready: false,
    publication_ready: false,
    requires_later_manual_review: true,
    requires_later_candidate_coverage_recheck: true,
    requires_later_consistency_gate: true,
    requires_later_publication_gate: true,
    worklist_only: true,
    writes_public_data: false
  }
}

function gradeRank(value) {
  const index = TARGET_GRADE_BANDS.indexOf(value)
  return index === -1 ? TARGET_GRADE_BANDS.length : index
}

function routeConfig(route) {
  return ROUTES[route] || {
    action_type: 'review_unknown_blocker_route',
    queue: 'unknown_blocker_route_queue',
    route_priority: 0,
    required_output: 'manual route classification',
    reviewer_gate: 'Classify this route before taking action.'
  }
}

function selectedRows(diagnostics, args) {
  const selectedSubjects = new Set(args.subjects)
  const selectedRoutes = new Set(args.routes)
  return (diagnostics.blocker_match_diagnostics || [])
    .filter(row => !selectedSubjects.size || selectedSubjects.has(row.subject_slug))
    .filter(row => !selectedRoutes.size || selectedRoutes.has(row.diagnostic_route))
}

function compactMatch(match) {
  return {
    confidence_band: match.confidence_band || '',
    edition: match.edition || '',
    eligible_alignment: match.eligible_alignment || '',
    eligible_for_h4g_differentiation: match.eligible_for_h4g_differentiation === true,
    evidence_id: match.evidence_id || '',
    keyword_score: match.keyword_score ?? null,
    match_id: match.match_id || '',
    page_range: match.page_range || '',
    page_start: match.page_start || '',
    unit_title: match.unit_title || ''
  }
}

function compactStandard(row, args) {
  return {
    clean_edition_count: row.clean_edition_count || 0,
    clean_editions: row.clean_editions || [],
    code: row.code || '',
    coverage_status: row.coverage_status || '',
    diagnostic_route: row.diagnostic_route || '',
    grade_band: row.grade_band || '',
    match_counts: row.match_counts || {},
    proposed_next_action: row.proposed_next_action || '',
    public_has_unit_evidence: row.public_has_unit_evidence === true,
    top_matches: (row.top_matches || []).slice(0, args.topMatchesPerStandard).map(compactMatch)
  }
}

function groupRows(rows) {
  const groups = new Map()
  for (const row of rows) {
    const id = row.progression_group_id || row.code
    if (!groups.has(id)) {
      groups.set(id, {
        progression_group_id: id,
        rows: [],
        subject_slug: row.subject_slug || ''
      })
    }
    groups.get(id).rows.push(row)
  }
  for (const group of groups.values()) {
    group.rows.sort((a, b) => gradeRank(a.grade_band) - gradeRank(b.grade_band) ||
      String(a.code).localeCompare(String(b.code)))
  }
  return [...groups.values()]
}

function primaryRoute(rows) {
  return sorted(rows.map(row => row.diagnostic_route))
    .sort((a, b) => routeConfig(b).route_priority - routeConfig(a).route_priority ||
      a.localeCompare(b))[0] || 'missing'
}

function progressionCompleteness(gradeBands) {
  const grades = new Set(gradeBands)
  if (TARGET_GRADE_BANDS.every(grade => grades.has(grade))) return 'complete_h4g_triplet'
  return 'partial_h4g_group'
}

function scoreGroup(rows, route) {
  const gradeBands = sorted(rows.map(row => row.grade_band))
  const matchScore = rows.reduce((sum, row) => {
    const counts = row.match_counts || {}
    return sum + (Number(counts.high || 0) * 4) + (Number(counts.medium || 0) * 2) + Number(counts.low || 0)
  }, 0)
  const completeBonus = progressionCompleteness(gradeBands) === 'complete_h4g_triplet' ? 15 : 0
  const singleEditionPenalty = rows.filter(row => row.coverage_status === 'candidate_single_edition_review_needed').length
  return routeConfig(route).route_priority + (rows.length * 10) + (gradeBands.length * 5) + completeBonus + matchScore - singleEditionPenalty
}

function routeCounts(rows) {
  const counts = {}
  for (const row of rows) countInto(counts, row.diagnostic_route)
  return counts
}

function recommendedSequence(rows) {
  return Object.entries(routeCounts(rows))
    .sort(([a], [b]) => routeConfig(b).route_priority - routeConfig(a).route_priority || a.localeCompare(b))
    .map(([route, count]) => ({
      action_type: routeConfig(route).action_type,
      blocker_rows: count,
      diagnostic_route: route,
      queue: routeConfig(route).queue,
      required_output: routeConfig(route).required_output,
      reviewer_gate: routeConfig(route).reviewer_gate
    }))
}

function buildItems(diagnostics, args) {
  return groupRows(selectedRows(diagnostics, args)).map(group => {
    const route = primaryRoute(group.rows)
    const config = routeConfig(route)
    const gradeBands = sorted(group.rows.map(row => row.grade_band))
    const standardCodes = group.rows.map(row => row.code || '').filter(Boolean)
    const priorityScore = scoreGroup(group.rows, route)
    return {
      action_type: config.action_type,
      changes_official_standard_text: false,
      direct_matcher_use: false,
      eligible_for_h4g_differentiation: false,
      grade_bands: gradeBands,
      match_counts_total: {
        eligible: group.rows.reduce((sum, row) => sum + Number(row.match_counts?.eligible || 0), 0),
        high: group.rows.reduce((sum, row) => sum + Number(row.match_counts?.high || 0), 0),
        low: group.rows.reduce((sum, row) => sum + Number(row.match_counts?.low || 0), 0),
        medium: group.rows.reduce((sum, row) => sum + Number(row.match_counts?.medium || 0), 0),
        total: group.rows.reduce((sum, row) => sum + Number(row.match_counts?.total || 0), 0)
      },
      matcher_ready: false,
      policy: policy(),
      primary_diagnostic_route: route,
      priority_score: priorityScore,
      progression_completeness: progressionCompleteness(gradeBands),
      progression_group_id: group.progression_group_id,
      publication_ready: false,
      queue: config.queue,
      recommended_sequence: recommendedSequence(group.rows),
      reviewer_gate: config.reviewer_gate,
      route_counts: routeCounts(group.rows),
      source_diagnostic_rows: group.rows.length,
      standard_codes: standardCodes,
      standards: group.rows.map(row => compactStandard(row, args)),
      subject_slug: group.subject_slug,
      work_item_id: `h4g_unit_blocker_action_${hashText(`${group.progression_group_id}:${route}`)}`,
      worklist_only: true,
      writes_public_data: false
    }
  }).sort((a, b) => b.priority_score - a.priority_score ||
    a.subject_slug.localeCompare(b.subject_slug) ||
    a.progression_group_id.localeCompare(b.progression_group_id))
}

function summarize(items) {
  const summary = {
    action_work_items: items.length,
    blocker_rows_covered: 0,
    by_action_type: {},
    by_primary_diagnostic_route: {},
    by_progression_completeness: {},
    by_subject: {},
    top_priority_score: items[0]?.priority_score || 0
  }
  for (const item of items) {
    summary.blocker_rows_covered += item.source_diagnostic_rows || 0
    countInto(summary.by_action_type, item.action_type)
    countInto(summary.by_primary_diagnostic_route, item.primary_diagnostic_route)
    countInto(summary.by_progression_completeness, item.progression_completeness)
    summary.by_subject[item.subject_slug] ||= {
      action_work_items: 0,
      blocker_rows_covered: 0,
      by_primary_diagnostic_route: {}
    }
    const subject = summary.by_subject[item.subject_slug]
    subject.action_work_items += 1
    subject.blocker_rows_covered += item.source_diagnostic_rows || 0
    countInto(subject.by_primary_diagnostic_route, item.primary_diagnostic_route)
  }
  return summary
}

function itemRows(items, limit = 40) {
  return items.slice(0, limit).map(item => (
    `| ${markdownCell(item.work_item_id)} | ${markdownCell(item.subject_slug)} | ${markdownCell(item.progression_group_id)} | ${item.priority_score} | ${markdownCell(item.progression_completeness)} | ${markdownCell(item.primary_diagnostic_route)} | ${item.source_diagnostic_rows} | ${markdownCell(item.grade_bands.join(', '))} | ${truncate(item.standard_codes.join(', '), 80)} |`
  )).join('\n') || '| - | - | - | 0 | - | - | 0 | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Blocker Action Worklist

Generated at: ${payload.generated_at}

This read-only worklist groups blocker diagnostics by progression group so
H4G7/H4G8/H4G9 remediation can preserve grade progression relationships. It
does not write public/data, approve evidence, change official standard text, or
enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| action work items | ${payload.summary.action_work_items} |
| blocker rows covered | ${payload.summary.blocker_rows_covered} |
| top priority score | ${payload.summary.top_priority_score} |

## Primary Routes

| route | work items |
| --- | ---: |
${countRows(payload.summary.by_primary_diagnostic_route)}

## Progression Completeness

| completeness | work items |
| --- | ---: |
${countRows(payload.summary.by_progression_completeness)}

## First Work Items

| work item | subject | progression group | priority | completeness | primary route | rows | grades | standards |
| --- | --- | --- | ---: | --- | --- | ---: | --- | --- |
${itemRows(payload.action_work_items)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${payload.warnings.length ? payload.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
`
}

function validateInputs(diagnostics, errors) {
  if (diagnostics.valid !== true) errors.push('diagnostics must be valid=true')
  if (diagnostics.purpose !== 'h4g_unit_evidence_blocker_match_diagnostics') {
    errors.push('diagnostics purpose mismatch')
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (diagnostics[key] !== false) errors.push(`diagnostics ${key} must be false`)
  }
}

function buildPayload(args) {
  const errors = []
  const warnings = []
  if (!existsSync(args.diagnostics)) errors.push(`Missing diagnostics: ${args.diagnostics}`)
  const diagnostics = errors.length ? { blocker_match_diagnostics: [] } : readJson(args.diagnostics)
  if (!errors.length) validateInputs(diagnostics, errors)
  const items = errors.length ? [] : buildItems(diagnostics, args)
  if (args.requireItems && !items.length) errors.push('requireItems is set but no action work items were generated')
  return {
    action_work_items: items,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: policy(),
    publication_ready: false,
    purpose: 'h4g_unit_evidence_blocker_action_worklist',
    selected_routes: args.routes,
    selected_subjects: args.subjects,
    source_diagnostics: args.diagnostics,
    summary: summarize(items),
    valid: errors.length === 0,
    warnings,
    worklist_only: true,
    writes_public_data: false
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const payload = buildPayload(args)
  if (args.out) writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({
    errors: payload.errors,
    generated_at: payload.generated_at,
    out: args.out,
    purpose: payload.purpose,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid,
    warnings: payload.warnings,
    worklist_only: payload.worklist_only,
    writes_public_data: payload.writes_public_data
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
