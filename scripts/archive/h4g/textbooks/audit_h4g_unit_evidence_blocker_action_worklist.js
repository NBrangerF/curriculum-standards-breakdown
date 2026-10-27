#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_unit_evidence_blocker_action_worklist.json'
const DEFAULT_DIAGNOSTICS = 'generated/textbook_evidence/h4g_unit_evidence_blocker_match_diagnostics.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_blocker_action_worklist_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_blocker_action_worklist_audit.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']

const ROUTES = {
  review_noneligible_medium_high_match_for_anchor_or_policy: {
    action_type: 'review_anchor_policy_for_noneligible_medium_high_matches',
    queue: 'anchor_policy_review_queue',
    route_priority: 40
  },
  find_second_clean_edition_or_review_single_edition: {
    action_type: 'find_second_clean_edition_or_review_single_edition',
    queue: 'single_edition_cross_version_queue',
    route_priority: 30
  },
  source_coverage_or_unit_index_gap: {
    action_type: 'repair_source_coverage_or_unit_index_gap',
    queue: 'source_coverage_or_indexing_queue',
    route_priority: 20
  },
  review_low_confidence_match_or_add_alias: {
    action_type: 'review_low_confidence_match_or_add_scoped_alias',
    queue: 'low_confidence_alias_review_queue',
    route_priority: 10
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
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--diagnostics') args.diagnostics = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = splitArg(argv[++i])
    else if (item === '--routes') args.routes = splitArg(argv[++i])
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_unit_evidence_blocker_action_worklist.js \\
  --subjects math,science \\
  --strict --require-items

Audits the H4G unit-evidence blocker action worklist against the source blocker
diagnostics. The audit verifies progression-group coverage, priority sorting,
route classification, and read-only policy flags.`)
}

function splitArg(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
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

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function routeConfig(route) {
  return ROUTES[route] || {
    action_type: 'review_unknown_blocker_route',
    queue: 'unknown_blocker_route_queue',
    route_priority: 0
  }
}

function gradeRank(value) {
  const index = TARGET_GRADE_BANDS.indexOf(value)
  return index === -1 ? TARGET_GRADE_BANDS.length : index
}

function selectedRows(diagnostics, args) {
  const selectedSubjects = new Set(args.subjects)
  const selectedRoutes = new Set(args.routes)
  return (diagnostics.blocker_match_diagnostics || [])
    .filter(row => !selectedSubjects.size || selectedSubjects.has(row.subject_slug))
    .filter(row => !selectedRoutes.size || selectedRoutes.has(row.diagnostic_route))
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

function routeCounts(rows) {
  const counts = {}
  for (const row of rows) countInto(counts, row.diagnostic_route)
  return counts
}

function matchCountsTotal(rows) {
  return {
    eligible: rows.reduce((sum, row) => sum + Number(row.match_counts?.eligible || 0), 0),
    high: rows.reduce((sum, row) => sum + Number(row.match_counts?.high || 0), 0),
    low: rows.reduce((sum, row) => sum + Number(row.match_counts?.low || 0), 0),
    medium: rows.reduce((sum, row) => sum + Number(row.match_counts?.medium || 0), 0),
    total: rows.reduce((sum, row) => sum + Number(row.match_counts?.total || 0), 0)
  }
}

function scoreGroup(rows, route) {
  const gradeBands = sorted(rows.map(row => row.grade_band))
  const counts = matchCountsTotal(rows)
  const matchScore = (counts.high * 4) + (counts.medium * 2) + counts.low
  const completeBonus = progressionCompleteness(gradeBands) === 'complete_h4g_triplet' ? 15 : 0
  const singleEditionPenalty = rows.filter(row => row.coverage_status === 'candidate_single_edition_review_needed').length
  return routeConfig(route).route_priority + (rows.length * 10) + (gradeBands.length * 5) + completeBonus + matchScore - singleEditionPenalty
}

function expectedByGroup(diagnostics, args) {
  const out = new Map()
  for (const group of groupRows(selectedRows(diagnostics, args))) {
    const route = primaryRoute(group.rows)
    const gradeBands = sorted(group.rows.map(row => row.grade_band))
    out.set(group.progression_group_id, {
      action_type: routeConfig(route).action_type,
      grade_bands: gradeBands,
      match_counts_total: matchCountsTotal(group.rows),
      primary_diagnostic_route: route,
      priority_score: scoreGroup(group.rows, route),
      progression_completeness: progressionCompleteness(gradeBands),
      progression_group_id: group.progression_group_id,
      queue: routeConfig(route).queue,
      route_counts: routeCounts(group.rows),
      source_diagnostic_rows: group.rows.length,
      standard_codes: group.rows.map(row => row.code || '').filter(Boolean),
      subject_slug: group.subject_slug,
      work_item_id: `h4g_unit_blocker_action_${hashText(`${group.progression_group_id}:${route}`)}`
    })
  }
  return out
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

function validateWorklistPolicy(label, policy, errors) {
  validatePolicy(label, policy, errors)
  for (const key of [
    'requires_later_manual_review',
    'requires_later_candidate_coverage_recheck',
    'requires_later_consistency_gate',
    'requires_later_publication_gate',
    'worklist_only'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
}

function validateTopLevel(worklist, diagnostics, args, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_unit_evidence_blocker_action_worklist') errors.push('worklist purpose mismatch')
  if (worklist.source_diagnostics !== args.diagnostics) errors.push('worklist source_diagnostics must match audit arg')
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  if (!Array.isArray(worklist.action_work_items)) errors.push('worklist action_work_items must be an array')
  validatePolicy('worklist', worklist, errors)
  validateWorklistPolicy('worklist policy', worklist.policy || {}, errors)

  if (diagnostics.valid !== true) errors.push('diagnostics valid must be true')
  if (diagnostics.purpose !== 'h4g_unit_evidence_blocker_match_diagnostics') errors.push('diagnostics purpose mismatch')
  validatePolicy('diagnostics', diagnostics, errors)
  if (!sameJson(sorted(worklist.selected_subjects || []), sorted(args.subjects || []))) {
    errors.push('worklist selected_subjects must match audit args')
  }
  if (!sameJson(sorted(worklist.selected_routes || []), sorted(args.routes || []))) {
    errors.push('worklist selected_routes must match audit args')
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

function validateItem(item, expected, errors, stats) {
  const prefix = item.work_item_id || item.progression_group_id || '(work item)'
  validatePolicy(prefix, item, errors)
  validateWorklistPolicy(`${prefix} policy`, item.policy || {}, errors)
  if (item.worklist_only !== true) errors.push(`${prefix} worklist_only must be true`)
  for (const key of [
    'action_type',
    'grade_bands',
    'match_counts_total',
    'primary_diagnostic_route',
    'priority_score',
    'progression_completeness',
    'progression_group_id',
    'queue',
    'route_counts',
    'source_diagnostic_rows',
    'standard_codes',
    'subject_slug',
    'work_item_id'
  ]) {
    if (!sameJson(item[key], expected[key])) errors.push(`${prefix} ${key} mismatch`)
  }
  const standardCodes = (item.standards || []).map(row => row.code).filter(Boolean)
  if (!sameJson(standardCodes, expected.standard_codes)) errors.push(`${prefix} standards code order mismatch`)
  if (!Array.isArray(item.recommended_sequence) || !item.recommended_sequence.length) {
    errors.push(`${prefix} missing recommended_sequence`)
  }
  stats.audited_items += 1
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['worklist', args.worklist],
    ['diagnostics', args.diagnostics]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { action_work_items: [] }
  const diagnostics = existsSync(args.diagnostics) ? readJson(args.diagnostics) : { blocker_match_diagnostics: [] }
  if (!errors.length) validateTopLevel(worklist, diagnostics, args, errors)

  const items = worklist.action_work_items || []
  const expected = expectedByGroup(diagnostics, args)
  const byGroup = mapBy(items, 'progression_group_id', errors, 'worklist')
  const stats = {
    audited_items: 0,
    expected_items: expected.size,
    extra_items: 0,
    missing_items: 0,
    ...summarize(items)
  }

  if (!sameJson(worklist.summary || {}, summarize(items))) errors.push('worklist summary does not match rows')

  for (const [groupId, expectedItem] of expected.entries()) {
    const item = byGroup.get(groupId)
    if (!item) {
      stats.missing_items += 1
      errors.push(`${groupId} missing action work item`)
      continue
    }
    validateItem(item, expectedItem, errors, stats)
  }
  for (const groupId of byGroup.keys()) {
    if (!expected.has(groupId)) {
      stats.extra_items += 1
      errors.push(`${groupId} unexpected action work item`)
    }
  }

  for (let i = 1; i < items.length; i += 1) {
    if (Number(items[i].priority_score || 0) > Number(items[i - 1].priority_score || 0)) {
      errors.push('worklist rows must be sorted by descending priority_score')
      break
    }
  }
  if (args.requireItems && !items.length) errors.push('requireItems is set but no action work items were audited')

  return {
    changes_official_standard_text: false,
    diagnostics: args.diagnostics,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    require_items: args.requireItems,
    summary: stats,
    valid: errors.length === 0,
    worklist: args.worklist,
    worklist_only: true,
    writes_public_data: false
  }
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Blocker Action Worklist Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected items | ${payload.summary.expected_items} |
| audited items | ${payload.summary.audited_items} |
| missing items | ${payload.summary.missing_items} |
| extra items | ${payload.summary.extra_items} |
| blocker rows covered | ${payload.summary.blocker_rows_covered} |

## Primary Routes

| route | work items |
| --- | ---: |
${countRows(payload.summary.by_primary_diagnostic_route)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
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
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
