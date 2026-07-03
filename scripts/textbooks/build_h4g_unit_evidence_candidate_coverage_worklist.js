#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_COVERAGE = 'generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_audit.json'
const DEFAULT_UNIT_WORKLIST = 'generated/textbook_evidence/h4g_unit_evidence_worklist.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_worklist.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_worklist.md'
const READY_STATUSES = new Set([
  'already_public_unit_level',
  'candidate_ready_multi_edition_review'
])

function parseArgs(argv) {
  const args = {
    coverage: DEFAULT_COVERAGE,
    maxBlockerSamplesPerSubject: 20,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    unitWorklist: DEFAULT_UNIT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--coverage') args.coverage = argv[++i]
    else if (item === '--unit-worklist') args.unitWorklist = argv[++i]
    else if (item === '--max-blocker-samples-per-subject') args.maxBlockerSamplesPerSubject = Number(argv[++i]) || args.maxBlockerSamplesPerSubject
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
node scripts/textbooks/build_h4g_unit_evidence_candidate_coverage_worklist.js \\
  --coverage generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_audit.json \\
  --unit-worklist generated/textbook_evidence/h4g_unit_evidence_worklist.json \\
  --strict --require-items

Builds a read-only remediation worklist by joining the Math/Science candidate
coverage audit to executable unit-evidence work items. It does not write
public/data, approve candidates, or enable matcher/publication use.`)
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

function hashText(value, length = 12) {
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
    requires_later_candidate_coverage_recheck: true,
    requires_later_consistency_gate: true,
    requires_later_publication_gate: true,
    worklist_only: true,
    writes_public_data: false
  }
}

function validateInputs(coverage, unitWorklist, errors) {
  if (coverage.valid !== true) errors.push('coverage audit must be valid=true')
  if (coverage.purpose !== 'h4g_unit_evidence_candidate_coverage_audit') errors.push('coverage audit purpose mismatch')
  if (coverage.writes_public_data !== false) errors.push('coverage audit writes_public_data must be false')
  if (coverage.changes_official_standard_text !== false) errors.push('coverage audit changes_official_standard_text must be false')
  if (coverage.direct_matcher_use !== false) errors.push('coverage audit direct_matcher_use must be false')
  if (coverage.publication_ready !== false) errors.push('coverage audit publication_ready must be false')
  if (unitWorklist.valid !== true) errors.push('unit worklist must be valid=true')
  if (!Array.isArray(unitWorklist.recommended_work_items)) errors.push('unit worklist recommended_work_items must be an array')
}

function subjectProfiles(coverage, args) {
  const profiles = {}
  for (const row of coverage.standard_coverage || []) {
    if (READY_STATUSES.has(row.coverage_status)) continue
    const subject = row.subject_slug || 'missing'
    profiles[subject] ||= {
      blocker_grade_bands: {},
      blocker_samples: [],
      by_status: {},
      missing_candidate_unit_evidence: 0,
      non_public_blocker_standards: 0,
      single_edition_review_needed: 0,
      subject_slug: subject
    }
    const profile = profiles[subject]
    profile.non_public_blocker_standards += 1
    countInto(profile.by_status, row.coverage_status)
    countInto(profile.blocker_grade_bands, row.grade_band)
    if (row.coverage_status === 'missing_candidate_unit_evidence') profile.missing_candidate_unit_evidence += 1
    if (row.coverage_status === 'candidate_single_edition_review_needed') profile.single_edition_review_needed += 1
    if (profile.blocker_samples.length < args.maxBlockerSamplesPerSubject) {
      profile.blocker_samples.push({
        clean_editions: row.clean_editions || [],
        code: row.code || '',
        coverage_status: row.coverage_status || '',
        grade_band: row.grade_band || '',
        progression_group_id: row.progression_group_id || ''
      })
    }
  }
  return profiles
}

function scoreWorkItem(item, profile) {
  if (!profile) return 0
  const targetGap = Math.max(0, Number(item.target_groups_needing_unit_evidence || 0) - Number(item.current_candidate_progression_groups || 0))
  return (profile.missing_candidate_unit_evidence * 10) +
    (profile.single_edition_review_needed * 4) +
    (targetGap * 3) +
    (Number(item.evidence_ids?.length || 0))
}

function routeFor(profile) {
  if (!profile) return 'no_current_non_public_blocker_context'
  if (profile.missing_candidate_unit_evidence > 0 && profile.single_edition_review_needed > 0) {
    return 'materialize_missing_units_and_expand_cross_version_candidates'
  }
  if (profile.missing_candidate_unit_evidence > 0) return 'materialize_missing_candidate_units'
  if (profile.single_edition_review_needed > 0) return 'expand_single_edition_candidates'
  return 'coverage_recheck_only'
}

function buildRows(coverage, unitWorklist, args) {
  const profiles = subjectProfiles(coverage, args)
  return (unitWorklist.recommended_work_items || []).map(item => {
    const profile = profiles[item.subject] || null
    const score = scoreWorkItem(item, profile)
    const workItemId = `h4g_unit_candidate_coverage_remediation_${hashText(item.work_item_id)}`
    return {
      changes_official_standard_text: false,
      coverage_remediation_work_item_id: workItemId,
      coverage_role: item.coverage_role || '',
      current_candidate_progression_groups: item.current_candidate_progression_groups || 0,
      direct_matcher_use: false,
      edition: item.edition || '',
      eligible_for_h4g_differentiation: false,
      evidence_ids: item.evidence_ids || [],
      evidence_ids_by_grade_band: item.evidence_ids_by_grade_band || {},
      execution_command: `npm run textbooks:run-h4g-unit-work-item -- --work-item ${item.work_item_id}`,
      grade_bands: item.grade_bands || {},
      matcher_ready: false,
      policy: policy(),
      priority_score: score,
      publication_ready: false,
      recheck_commands: [
        'npm run textbooks:plan-h4g-unit-worklist -- --subjects math,science --discover-candidates --strict --require-work-items',
        'npm run textbooks:audit-h4g-unit-candidate-coverage -- --subjects math,science --strict --require-candidates',
        'npm run grade7_9:h4g-differentiation-issue-matrix'
      ],
      remediation_route: routeFor(profile),
      source_unit_work_item_id: item.work_item_id || '',
      subject_blocker_context: profile || {
        blocker_grade_bands: {},
        blocker_samples: [],
        by_status: {},
        missing_candidate_unit_evidence: 0,
        non_public_blocker_standards: 0,
        single_edition_review_needed: 0,
        subject_slug: item.subject || ''
      },
      subject_label: item.subject_label || item.subject || '',
      subject_slug: item.subject || '',
      target_groups_needing_unit_evidence: item.target_groups_needing_unit_evidence || 0,
      textbook_subjects: item.textbook_subjects || {},
      volumes: item.volumes || {},
      worklist_only: true,
      writes_public_data: false
    }
  }).sort((a, b) => b.priority_score - a.priority_score ||
    String(a.subject_slug).localeCompare(String(b.subject_slug)) ||
    String(a.edition).localeCompare(String(b.edition)))
}

function summarize(rows, coverage) {
  const summary = {
    by_remediation_route: {},
    by_subject: {},
    candidate_coverage_blocker_status: coverage.summary?.by_standard_status || {},
    coverage_remediation_work_items: rows.length,
    top_priority_score: rows[0]?.priority_score || 0
  }
  for (const row of rows) {
    countInto(summary.by_remediation_route, row.remediation_route)
    summary.by_subject[row.subject_slug] ||= {
      blocker_standards: row.subject_blocker_context.non_public_blocker_standards || 0,
      missing_candidate_unit_evidence: row.subject_blocker_context.missing_candidate_unit_evidence || 0,
      recommended_work_items: 0,
      single_edition_review_needed: row.subject_blocker_context.single_edition_review_needed || 0
    }
    summary.by_subject[row.subject_slug].recommended_work_items += 1
  }
  return summary
}

function markdownRows(rows) {
  return rows.map(row => (
    `| ${markdownCell(row.source_unit_work_item_id)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.edition)} | ${row.priority_score} | ${markdownCell(row.remediation_route)} | ${row.subject_blocker_context.missing_candidate_unit_evidence} | ${row.subject_blocker_context.single_edition_review_needed} | ${row.evidence_ids.length} |`
  )).join('\n') || '| - | - | - | 0 | - | 0 | 0 | 0 |'
}

function blockerRows(rows) {
  const samples = []
  for (const row of rows) {
    for (const sample of row.subject_blocker_context.blocker_samples || []) {
      samples.push({
        ...sample,
        subject_slug: row.subject_slug
      })
    }
  }
  const unique = new Map()
  for (const sample of samples) {
    const key = `${sample.subject_slug}|${sample.code}`
    if (!unique.has(key)) unique.set(key, sample)
  }
  return [...unique.values()].slice(0, 80).map(sample => (
    `| ${markdownCell(sample.subject_slug)} | ${markdownCell(sample.grade_band)} | ${markdownCell(sample.code)} | ${markdownCell(sample.coverage_status)} | ${truncate((sample.clean_editions || []).join('；') || '-')} |`
  )).join('\n') || '| - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Candidate Coverage Remediation Worklist

Generated at: ${payload.generated_at}

This read-only worklist joins candidate coverage blockers to executable unit
evidence work items. Running a work item creates review artifacts only; it does
not write \`public/data\`, approve unit evidence, or enable publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| worklist items | ${payload.summary.coverage_remediation_work_items} |
| top priority score | ${payload.summary.top_priority_score} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Routes

| route | items |
| --- | ---: |
${countRows(payload.summary.by_remediation_route)}

## Work Items

| source work item | subject | edition | score | route | missing candidates | single-edition | files |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: |
${markdownRows(payload.coverage_remediation_work_items)}

## First Blocker Samples

| subject | grade | standard | status | current clean editions |
| --- | --- | --- | --- | --- |
${blockerRows(payload.coverage_remediation_work_items)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.coverage)) errors.push(`Missing coverage audit: ${args.coverage}`)
  if (!existsSync(args.unitWorklist)) errors.push(`Missing unit worklist: ${args.unitWorklist}`)
  const coverage = errors.length ? { standard_coverage: [], summary: {} } : readJson(args.coverage)
  const unitWorklist = errors.length ? { recommended_work_items: [] } : readJson(args.unitWorklist)
  if (!errors.length) validateInputs(coverage, unitWorklist, errors)
  const rows = buildRows(coverage, unitWorklist, args)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no remediation work items were generated')
  return {
    changes_official_standard_text: false,
    coverage_remediation_work_items: rows,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: policy(),
    publication_ready: false,
    purpose: 'h4g_unit_evidence_candidate_coverage_worklist',
    source_candidate_coverage_audit: args.coverage,
    source_unit_evidence_worklist: args.unitWorklist,
    summary: summarize(rows, coverage),
    valid: errors.length === 0,
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
  console.log(JSON.stringify(stable({
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
    worklist_only: payload.worklist_only,
    writes_public_data: payload.writes_public_data
  }), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
