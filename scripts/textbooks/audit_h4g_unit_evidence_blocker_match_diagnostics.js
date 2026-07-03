#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DIAGNOSTICS = 'generated/textbook_evidence/h4g_unit_evidence_blocker_match_diagnostics.json'
const DEFAULT_COVERAGE = 'generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_audit.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_blocker_match_diagnostics_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_blocker_match_diagnostics_audit.md'
const DEFAULT_STATUSES = [
  'missing_candidate_unit_evidence',
  'candidate_single_edition_review_needed'
]

function parseArgs(argv) {
  const args = {
    coverage: DEFAULT_COVERAGE,
    diagnostics: DEFAULT_DIAGNOSTICS,
    out: DEFAULT_OUT,
    requireRows: false,
    statuses: DEFAULT_STATUSES,
    strict: false,
    subjects: [],
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--diagnostics') args.diagnostics = argv[++i]
    else if (item === '--coverage') args.coverage = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = splitArg(argv[++i])
    else if (item === '--statuses') args.statuses = splitArg(argv[++i])
    else if (item === '--strict') args.strict = true
    else if (item === '--require-rows') args.requireRows = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_unit_evidence_blocker_match_diagnostics.js \\
  --subjects math,science \\
  --strict --require-rows

Audits the read-only H4G unit-evidence blocker match diagnostics against the
source coverage audit. It verifies that blocker rows are complete, policy flags
remain non-publication, and diagnostic routes match the match-count evidence.`)
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

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
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

function validateDiagnosticsPolicy(label, policy, errors) {
  validatePolicy(label, policy, errors)
  for (const key of [
    'requires_later_manual_review',
    'requires_later_candidate_coverage_recheck',
    'requires_later_consistency_gate',
    'worklist_only'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
}

function expectedRoute(row) {
  if (row.coverage_status === 'candidate_single_edition_review_needed') {
    return 'find_second_clean_edition_or_review_single_edition'
  }
  const counts = row.match_counts || {}
  if (!Number(counts.total || 0)) return 'source_coverage_or_unit_index_gap'
  if (Number(counts.eligible || 0) > 0) return 'eligible_match_but_candidate_quality_gap'
  if (Number(counts.medium || 0) > 0 || Number(counts.high || 0) > 0) {
    return 'review_noneligible_medium_high_match_for_anchor_or_policy'
  }
  return 'review_low_confidence_match_or_add_alias'
}

function expectedCoverageRows(coverage, args) {
  const selectedSubjects = new Set(args.subjects)
  const selectedStatuses = new Set(args.statuses)
  return (coverage.standard_coverage || [])
    .filter(row => !selectedSubjects.size || selectedSubjects.has(row.subject_slug))
    .filter(row => !selectedStatuses.size || selectedStatuses.has(row.coverage_status))
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

function summarize(rows, matchStats) {
  const summary = {
    blocker_rows: rows.length,
    by_coverage_status: {},
    by_diagnostic_route: {},
    by_subject: {},
    match_files_read: matchStats.match_files_read,
    match_rows_read: matchStats.match_rows_read
  }
  for (const row of rows) {
    countInto(summary.by_coverage_status, row.coverage_status)
    countInto(summary.by_diagnostic_route, row.diagnostic_route)
    summary.by_subject[row.subject_slug] ||= {
      blocker_rows: 0,
      by_coverage_status: {},
      by_diagnostic_route: {},
      no_match_rows: 0,
      noneligible_match_rows: 0,
      rows_with_any_match: 0
    }
    const subject = summary.by_subject[row.subject_slug]
    subject.blocker_rows += 1
    countInto(subject.by_coverage_status, row.coverage_status)
    countInto(subject.by_diagnostic_route, row.diagnostic_route)
    if ((row.match_counts?.total || 0) > 0) subject.rows_with_any_match += 1
    else subject.no_match_rows += 1
    if ((row.match_counts?.total || 0) > 0 && (row.match_counts?.eligible || 0) === 0) {
      subject.noneligible_match_rows += 1
    }
  }
  return summary
}

function validateTopLevel(diagnostics, coverage, args, errors) {
  if (diagnostics.valid !== true) errors.push('diagnostics valid must be true')
  if (diagnostics.purpose !== 'h4g_unit_evidence_blocker_match_diagnostics') errors.push('diagnostics purpose mismatch')
  if (diagnostics.coverage_audit !== args.coverage) errors.push('diagnostics coverage_audit must match audit arg')
  if (diagnostics.worklist_only !== true) errors.push('diagnostics worklist_only must be true')
  if (!Array.isArray(diagnostics.blocker_match_diagnostics)) {
    errors.push('diagnostics blocker_match_diagnostics must be an array')
  }
  validatePolicy('diagnostics', diagnostics, errors)
  validateDiagnosticsPolicy('diagnostics policy', diagnostics.policy || {}, errors)

  if (coverage.valid !== true) errors.push('coverage audit must be valid=true')
  if (coverage.purpose !== 'h4g_unit_evidence_candidate_coverage_audit') errors.push('coverage audit purpose mismatch')
  validatePolicy('coverage audit', coverage, errors)
}

function validateRow(row, source, errors, stats) {
  const prefix = row.code || '(diagnostic row)'
  validatePolicy(prefix, row, errors)
  validateDiagnosticsPolicy(`${prefix} policy`, row.policy || {}, errors)
  if (row.worklist_only !== true) errors.push(`${prefix} worklist_only must be true`)
  if (row.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
  if (row.diagnostic_route !== expectedRoute(row)) errors.push(`${prefix} diagnostic_route mismatch`)
  if (!row.proposed_next_action) errors.push(`${prefix} missing proposed_next_action`)
  if (!row.match_counts || typeof row.match_counts !== 'object') errors.push(`${prefix} missing match_counts`)
  if (!Array.isArray(row.top_matches)) errors.push(`${prefix} top_matches must be an array`)
  const expectedStatic = {
    clean_edition_count: source.clean_edition_count || 0,
    clean_editions: source.clean_editions || [],
    code: source.code || '',
    coverage_status: source.coverage_status || '',
    grade_band: source.grade_band || '',
    progression_group_id: source.progression_group_id || '',
    public_has_unit_evidence: source.public_has_unit_evidence === true,
    subject_slug: source.subject_slug || ''
  }
  for (const [key, expected] of Object.entries(expectedStatic)) {
    if (!sameJson(row[key], expected)) errors.push(`${prefix} ${key} mismatch`)
  }
  stats.audited_rows += 1
}

function audit(args) {
  const errors = []
  const warnings = []
  for (const [label, path] of [
    ['diagnostics', args.diagnostics],
    ['coverage', args.coverage]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const diagnostics = existsSync(args.diagnostics) ? readJson(args.diagnostics) : { blocker_match_diagnostics: [], summary: {} }
  const coverage = existsSync(args.coverage) ? readJson(args.coverage) : { standard_coverage: [] }
  if (!errors.length) validateTopLevel(diagnostics, coverage, args, errors)

  const rows = diagnostics.blocker_match_diagnostics || []
  const expectedRows = expectedCoverageRows(coverage, args)
  const expectedByCode = mapBy(expectedRows, 'code', errors, 'coverage')
  const rowsByCode = mapBy(rows, 'code', errors, 'diagnostics')
  const stats = {
    audited_rows: 0,
    expected_rows: expectedByCode.size,
    extra_rows: 0,
    missing_rows: 0,
    ...summarize(rows, {
      match_files_read: diagnostics.summary?.match_files_read || 0,
      match_rows_read: diagnostics.summary?.match_rows_read || 0
    })
  }

  const expectedSummary = summarize(rows, {
    match_files_read: diagnostics.summary?.match_files_read || 0,
    match_rows_read: diagnostics.summary?.match_rows_read || 0
  })
  if (!sameJson(diagnostics.summary || {}, expectedSummary)) errors.push('diagnostics summary does not match rows')

  if (!sameJson(sorted(diagnostics.subjects || []), sorted(args.subjects || []))) {
    errors.push('diagnostics subjects must match audit args')
  }
  if (!sameJson(sorted(diagnostics.selected_statuses || []), sorted(args.statuses || []))) {
    errors.push('diagnostics selected_statuses must match audit args')
  }

  for (const [code, source] of expectedByCode.entries()) {
    const row = rowsByCode.get(code)
    if (!row) {
      stats.missing_rows += 1
      errors.push(`${code} missing diagnostic row`)
      continue
    }
    validateRow(row, source, errors, stats)
  }
  for (const code of rowsByCode.keys()) {
    if (!expectedByCode.has(code)) {
      stats.extra_rows += 1
      errors.push(`${code} unexpected diagnostic row`)
    }
  }

  const routeOrder = rows.map(row => `${row.subject_slug}\u0000${row.diagnostic_route}\u0000${row.progression_group_id}\u0000${row.grade_band}\u0000${row.code}`)
  for (let i = 1; i < routeOrder.length; i += 1) {
    if (routeOrder[i].localeCompare(routeOrder[i - 1]) < 0) errors.push('diagnostic rows must be sorted by subject, route, progression group, grade, code')
  }
  if (args.requireRows && !rows.length) errors.push('requireRows is set but no diagnostic rows were audited')
  if (diagnostics.errors?.length) warnings.push(`diagnostics payload already contains ${diagnostics.errors.length} error(s)`)

  return {
    changes_official_standard_text: false,
    coverage: args.coverage,
    diagnostics: args.diagnostics,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    require_rows: args.requireRows,
    summary: stats,
    valid: errors.length === 0,
    warnings,
    worklist_only: true,
    writes_public_data: false
  }
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Blocker Match Diagnostics Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected rows | ${payload.summary.expected_rows} |
| audited rows | ${payload.summary.audited_rows} |
| missing rows | ${payload.summary.missing_rows} |
| extra rows | ${payload.summary.extra_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Diagnostic Routes

| route | rows |
| --- | ---: |
${countRows(payload.summary.by_diagnostic_route)}

## Coverage Status

| status | rows |
| --- | ---: |
${countRows(payload.summary.by_coverage_status)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${payload.warnings.length ? payload.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
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
