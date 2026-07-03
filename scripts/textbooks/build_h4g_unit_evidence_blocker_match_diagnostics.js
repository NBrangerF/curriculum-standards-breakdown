#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_COVERAGE = 'generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_audit.json'
const DEFAULT_MATCH_ROOT = 'generated/textbook_evidence/h4g_runs'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_blocker_match_diagnostics.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_blocker_match_diagnostics.md'
const DEFAULT_STATUSES = [
  'missing_candidate_unit_evidence',
  'candidate_single_edition_review_needed'
]
const READY_STATUSES = new Set([
  'already_public_unit_level',
  'candidate_ready_multi_edition_review'
])

function parseArgs(argv) {
  const args = {
    coverage: DEFAULT_COVERAGE,
    matchRoot: DEFAULT_MATCH_ROOT,
    out: DEFAULT_OUT,
    requireRows: false,
    statuses: DEFAULT_STATUSES,
    strict: false,
    subjects: [],
    summaryOut: DEFAULT_SUMMARY_OUT,
    topMatches: 5
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--coverage') args.coverage = argv[++i]
    else if (item === '--match-root') args.matchRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = splitArg(argv[++i])
    else if (item === '--statuses') args.statuses = splitArg(argv[++i])
    else if (item === '--top-matches') args.topMatches = positiveInteger(argv[++i], args.topMatches)
    else if (item === '--strict') args.strict = true
    else if (item === '--require-rows') args.requireRows = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_unit_evidence_blocker_match_diagnostics.js \\
  --subjects math,science \\
  --strict --require-rows

Builds a read-only diagnostics packet for H4G unit-evidence blockers. It joins
the coverage audit with existing textbook_unit_standard_matches.json files to
show whether blockers are no-match gaps, low-confidence match gaps,
non-eligible anchor/policy gaps, or single-edition second-version gaps.`)
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

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function discoverMatchFiles(root) {
  const out = []
  function walk(dir) {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && entry.name === 'textbook_unit_standard_matches.json') out.push(path)
    }
  }
  walk(root)
  return sorted(out)
}

function confidenceRank(value) {
  if (value === 'high') return 3
  if (value === 'medium') return 2
  if (value === 'low') return 1
  return 0
}

function numericScore(match) {
  const score = Number(match.keyword_score)
  if (Number.isFinite(score)) return score
  return confidenceRank(match.confidence_band) / 10
}

function compactMatch(match, sourceFile) {
  return {
    confidence_band: match.confidence_band || '',
    edition: match.edition || '',
    eligible_alignment: match.eligible_alignment || 'none',
    eligible_for_h4g_differentiation: match.eligible_for_h4g_differentiation === true,
    evidence_id: match.textbook_evidence_id || '',
    grade_band: match.grade_band || '',
    keyword_score: Number.isFinite(Number(match.keyword_score)) ? Number(match.keyword_score) : null,
    match_id: match.match_id || '',
    page_range: match.page_range || '',
    page_start: match.page_start || '',
    source_file: sourceFile,
    unit_title: match.unit_title || ''
  }
}

function loadMatchesByCode(paths, errors, warnings) {
  const byCode = new Map()
  const stats = {
    match_files_read: 0,
    match_rows_read: 0
  }
  for (const path of paths) {
    if (!existsSync(path)) {
      warnings.push(`Missing match file: ${path}`)
      continue
    }
    const payload = readJson(path)
    stats.match_files_read += 1
    for (const match of payload.matches || []) {
      stats.match_rows_read += 1
      const code = match.standard_code || ''
      if (!code) {
        errors.push(`${path} match row missing standard_code`)
        continue
      }
      const row = compactMatch(match, path)
      const rows = byCode.get(code) || []
      rows.push(row)
      byCode.set(code, rows)
    }
  }
  for (const rows of byCode.values()) {
    rows.sort((a, b) => Number(b.eligible_for_h4g_differentiation) - Number(a.eligible_for_h4g_differentiation) ||
      confidenceRank(b.confidence_band) - confidenceRank(a.confidence_band) ||
      numericScore(b) - numericScore(a) ||
      a.edition.localeCompare(b.edition) ||
      a.unit_title.localeCompare(b.unit_title))
  }
  return { byCode, stats }
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
    worklist_only: true,
    writes_public_data: false
  }
}

function routeFor(row, matches) {
  if (row.coverage_status === 'candidate_single_edition_review_needed') {
    return 'find_second_clean_edition_or_review_single_edition'
  }
  if (!matches.length) return 'source_coverage_or_unit_index_gap'
  if (matches.some(match => match.eligible_for_h4g_differentiation)) {
    return 'eligible_match_but_candidate_quality_gap'
  }
  if (matches.some(match => ['medium', 'high'].includes(match.confidence_band))) {
    return 'review_noneligible_medium_high_match_for_anchor_or_policy'
  }
  return 'review_low_confidence_match_or_add_alias'
}

function suggestedAction(route) {
  if (route === 'find_second_clean_edition_or_review_single_edition') {
    return 'Find a second edition clean unit for the same standard or review whether the single-edition unit is sufficient for a manual packet.'
  }
  if (route === 'source_coverage_or_unit_index_gap') {
    return 'Inspect source coverage and unit indexing; no unit match reached the matcher threshold.'
  }
  if (route === 'eligible_match_but_candidate_quality_gap') {
    return 'Inspect candidate build filters, page starts, and unit quality flags for the eligible match.'
  }
  if (route === 'review_noneligible_medium_high_match_for_anchor_or_policy') {
    return 'Review top non-eligible matches and add scoped aliases or field anchors only if manually justified.'
  }
  return 'Review low-confidence matches; add scoped aliases only for confirmed textbook-standard alignment.'
}

function buildRows(coverage, matchesByCode, args) {
  const selectedSubjects = new Set(args.subjects)
  const selectedStatuses = new Set(args.statuses)
  const rows = []
  for (const row of coverage.standard_coverage || []) {
    if (selectedSubjects.size && !selectedSubjects.has(row.subject_slug)) continue
    if (selectedStatuses.size ? !selectedStatuses.has(row.coverage_status) : READY_STATUSES.has(row.coverage_status)) continue
    const matches = matchesByCode.get(row.code) || []
    const topMatches = matches.slice(0, args.topMatches)
    const route = routeFor(row, matches)
    rows.push({
      changes_official_standard_text: false,
      clean_edition_count: row.clean_edition_count || 0,
      clean_editions: row.clean_editions || [],
      code: row.code || '',
      coverage_status: row.coverage_status || '',
      diagnostic_route: route,
      direct_matcher_use: false,
      eligible_for_h4g_differentiation: false,
      grade_band: row.grade_band || '',
      match_counts: {
        eligible: matches.filter(match => match.eligible_for_h4g_differentiation).length,
        high: matches.filter(match => match.confidence_band === 'high').length,
        low: matches.filter(match => match.confidence_band === 'low').length,
        medium: matches.filter(match => match.confidence_band === 'medium').length,
        total: matches.length
      },
      matcher_ready: false,
      policy: policy(),
      progression_group_id: row.progression_group_id || '',
      proposed_next_action: suggestedAction(route),
      publication_ready: false,
      public_has_unit_evidence: row.public_has_unit_evidence === true,
      subject_slug: row.subject_slug || '',
      top_matches: topMatches,
      worklist_only: true,
      writes_public_data: false
    })
  }
  return rows.sort((a, b) => a.subject_slug.localeCompare(b.subject_slug) ||
    a.diagnostic_route.localeCompare(b.diagnostic_route) ||
    a.progression_group_id.localeCompare(b.progression_group_id) ||
    a.grade_band.localeCompare(b.grade_band) ||
    a.code.localeCompare(b.code))
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
    if (row.match_counts.total > 0) subject.rows_with_any_match += 1
    else subject.no_match_rows += 1
    if (row.match_counts.total > 0 && row.match_counts.eligible === 0) subject.noneligible_match_rows += 1
  }
  return summary
}

function tableRows(rows, limit = 60) {
  return rows.slice(0, limit).map(row => {
    const top = row.top_matches[0]
    const topText = top ? `${top.edition} / ${top.unit_title} / ${top.confidence_band}` : '-'
    return `| ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.code)} | ${markdownCell(row.coverage_status)} | ${markdownCell(row.diagnostic_route)} | ${row.match_counts.total} | ${markdownCell(topText)} |`
  }).join('\n') || '| - | - | - | - | - | 0 | - |'
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Blocker Match Diagnostics

Generated at: ${payload.generated_at}

This read-only diagnostics packet joins the unit-evidence coverage audit with
existing textbook unit match files. It does not write public/data, approve
candidates, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| blocker rows | ${payload.summary.blocker_rows} |
| match files read | ${payload.summary.match_files_read} |
| match rows read | ${payload.summary.match_rows_read} |

## Coverage Status

| status | rows |
| --- | ---: |
${countRows(payload.summary.by_coverage_status)}

## Diagnostic Route

| route | rows |
| --- | ---: |
${countRows(payload.summary.by_diagnostic_route)}

## First Rows

| subject | grade | code | status | route | matches | top match |
| --- | --- | --- | --- | --- | ---: | --- |
${tableRows(payload.blocker_match_diagnostics)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${payload.warnings.length ? payload.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  const warnings = []
  if (!existsSync(args.coverage)) errors.push(`Missing coverage audit: ${args.coverage}`)
  if (!existsSync(args.matchRoot)) errors.push(`Missing match root: ${args.matchRoot}`)
  const coverage = errors.length ? { standard_coverage: [] } : readJson(args.coverage)
  if (coverage.valid !== true) errors.push('coverage audit must be valid=true')
  if (coverage.purpose !== 'h4g_unit_evidence_candidate_coverage_audit') errors.push('coverage audit purpose mismatch')
  const paths = errors.length ? [] : discoverMatchFiles(args.matchRoot)
  const matchCoverage = loadMatchesByCode(paths, errors, warnings)
  const rows = buildRows(coverage, matchCoverage.byCode, args)
  if (args.requireRows && !rows.length) errors.push('requireRows is set but no blocker rows were generated')
  const summary = summarize(rows, matchCoverage.stats)
  return {
    changes_official_standard_text: false,
    coverage_audit: args.coverage,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    match_files: paths,
    match_root: args.matchRoot,
    matcher_ready: false,
    policy: policy(),
    publication_ready: false,
    purpose: 'h4g_unit_evidence_blocker_match_diagnostics',
    selected_statuses: args.statuses,
    subjects: args.subjects,
    summary,
    blocker_match_diagnostics: rows,
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
    changes_official_standard_text: payload.changes_official_standard_text,
    direct_matcher_use: payload.direct_matcher_use,
    eligible_for_h4g_differentiation: payload.eligible_for_h4g_differentiation,
    errors: payload.errors,
    generated_at: payload.generated_at,
    matcher_ready: payload.matcher_ready,
    out: args.out,
    publication_ready: payload.publication_ready,
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
