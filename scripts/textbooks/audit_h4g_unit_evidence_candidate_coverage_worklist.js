#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_worklist.json'
const DEFAULT_COVERAGE = 'generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_audit.json'
const DEFAULT_UNIT_WORKLIST = 'generated/textbook_evidence/h4g_unit_evidence_worklist.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_worklist_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_worklist_audit.md'

function parseArgs(argv) {
  const args = {
    coverage: DEFAULT_COVERAGE,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    unitWorklist: DEFAULT_UNIT_WORKLIST,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--coverage') args.coverage = argv[++i]
    else if (item === '--unit-worklist') args.unitWorklist = argv[++i]
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
node scripts/textbooks/audit_h4g_unit_evidence_candidate_coverage_worklist.js \\
  --worklist generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_worklist.json \\
  --strict --require-items

Audits the read-only H4G unit-evidence candidate coverage remediation worklist
against the source coverage audit and unit worklist.`)
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

function hashText(value, length = 12) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
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

function validateWorklistPolicy(label, policy, errors) {
  validatePolicy(label, policy, errors)
  for (const key of [
    'requires_later_candidate_coverage_recheck',
    'requires_later_consistency_gate',
    'requires_later_publication_gate',
    'worklist_only'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
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

function scoreFromRow(row) {
  const profile = row.subject_blocker_context || {}
  const targetGap = Math.max(0, Number(row.target_groups_needing_unit_evidence || 0) - Number(row.current_candidate_progression_groups || 0))
  return (Number(profile.missing_candidate_unit_evidence || 0) * 10) +
    (Number(profile.single_edition_review_needed || 0) * 4) +
    (targetGap * 3) +
    (Number(row.evidence_ids?.length || 0))
}

function expectedItemId(sourceWorkItemId) {
  return `h4g_unit_candidate_coverage_remediation_${hashText(sourceWorkItemId)}`
}

function validateTopLevel(worklist, coverage, unitWorklist, args, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_unit_evidence_candidate_coverage_worklist') errors.push('worklist purpose mismatch')
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  if (worklist.source_candidate_coverage_audit !== args.coverage) errors.push('worklist source_candidate_coverage_audit must match audit arg')
  if (worklist.source_unit_evidence_worklist !== args.unitWorklist) errors.push('worklist source_unit_evidence_worklist must match audit arg')
  validatePolicy('worklist', worklist, errors)
  validateWorklistPolicy('worklist policy', worklist.policy || {}, errors)

  if (coverage.valid !== true) errors.push('coverage audit must be valid=true')
  if (coverage.purpose !== 'h4g_unit_evidence_candidate_coverage_audit') errors.push('coverage audit purpose mismatch')
  validatePolicy('coverage audit', coverage, errors)

  if (unitWorklist.valid !== true) errors.push('unit worklist valid must be true')
  if (!Array.isArray(unitWorklist.recommended_work_items)) errors.push('unit worklist recommended_work_items must be an array')
  if (!Array.isArray(worklist.coverage_remediation_work_items)) errors.push('worklist coverage_remediation_work_items must be an array')
}

function summarize(rows) {
  const summary = {
    by_remediation_route: {},
    by_subject: {},
    coverage_remediation_work_items: rows.length,
    top_priority_score: rows[0]?.priority_score || 0
  }
  for (const row of rows) {
    countInto(summary.by_remediation_route, row.remediation_route)
    summary.by_subject[row.subject_slug] ||= {
      blocker_standards: row.subject_blocker_context?.non_public_blocker_standards || 0,
      missing_candidate_unit_evidence: row.subject_blocker_context?.missing_candidate_unit_evidence || 0,
      recommended_work_items: 0,
      single_edition_review_needed: row.subject_blocker_context?.single_edition_review_needed || 0
    }
    summary.by_subject[row.subject_slug].recommended_work_items += 1
  }
  return summary
}

function validateItem(row, sourceItem, errors, stats) {
  const prefix = row.coverage_remediation_work_item_id || row.source_unit_work_item_id || '(work item)'
  if (row.coverage_remediation_work_item_id !== expectedItemId(sourceItem.work_item_id)) errors.push(`${prefix} coverage_remediation_work_item_id mismatch`)
  validatePolicy(prefix, row, errors)
  validateWorklistPolicy(`${prefix} policy`, row.policy || {}, errors)
  if (row.worklist_only !== true) errors.push(`${prefix} worklist_only must be true`)
  const expectedStatic = {
    coverage_role: sourceItem.coverage_role || '',
    current_candidate_progression_groups: sourceItem.current_candidate_progression_groups || 0,
    edition: sourceItem.edition || '',
    evidence_ids: sourceItem.evidence_ids || [],
    evidence_ids_by_grade_band: sourceItem.evidence_ids_by_grade_band || {},
    grade_bands: sourceItem.grade_bands || {},
    source_unit_work_item_id: sourceItem.work_item_id || '',
    subject_label: sourceItem.subject_label || sourceItem.subject || '',
    subject_slug: sourceItem.subject || '',
    target_groups_needing_unit_evidence: sourceItem.target_groups_needing_unit_evidence || 0,
    textbook_subjects: sourceItem.textbook_subjects || {},
    volumes: sourceItem.volumes || {}
  }
  for (const [key, expected] of Object.entries(expectedStatic)) {
    if (!sameJson(row[key], expected)) errors.push(`${prefix} ${key} mismatch`)
  }
  if (row.priority_score !== scoreFromRow(row)) errors.push(`${prefix} priority_score mismatch`)
  if (!String(row.execution_command || '').includes(sourceItem.work_item_id)) errors.push(`${prefix} execution_command must include source work item id`)
  if (!Array.isArray(row.recheck_commands) || row.recheck_commands.length < 2) errors.push(`${prefix} recheck_commands must contain follow-up gates`)
  if (!row.subject_blocker_context || typeof row.subject_blocker_context !== 'object') errors.push(`${prefix} missing subject_blocker_context`)
  stats.audited_items += 1
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['worklist', args.worklist],
    ['coverage', args.coverage],
    ['unit worklist', args.unitWorklist]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { coverage_remediation_work_items: [] }
  const coverage = existsSync(args.coverage) ? readJson(args.coverage) : {}
  const unitWorklist = existsSync(args.unitWorklist) ? readJson(args.unitWorklist) : { recommended_work_items: [] }
  if (!errors.length) validateTopLevel(worklist, coverage, unitWorklist, args, errors)

  const rows = worklist.coverage_remediation_work_items || []
  const sourceById = mapBy(unitWorklist.recommended_work_items || [], 'work_item_id', errors, 'unit worklist')
  const rowsBySource = mapBy(rows, 'source_unit_work_item_id', errors, 'coverage worklist')
  const stats = {
    audited_items: 0,
    expected_items: sourceById.size,
    extra_items: 0,
    missing_items: 0,
    ...summarize(rows)
  }

  if (!sameJson(worklist.summary || {}, {
    ...summarize(rows),
    candidate_coverage_blocker_status: coverage.summary?.by_standard_status || {}
  })) {
    errors.push('worklist summary does not match work item rows')
  }

  for (const [sourceId, sourceItem] of sourceById.entries()) {
    const row = rowsBySource.get(sourceId)
    if (!row) {
      stats.missing_items += 1
      errors.push(`${sourceId} missing coverage remediation work item`)
      continue
    }
    validateItem(row, sourceItem, errors, stats)
  }
  for (const sourceId of rowsBySource.keys()) {
    if (!sourceById.has(sourceId)) {
      stats.extra_items += 1
      errors.push(`${sourceId} unexpected coverage remediation work item`)
    }
  }
  const priorities = rows.map(row => Number(row.priority_score || 0))
  for (let i = 1; i < priorities.length; i += 1) {
    if (priorities[i] > priorities[i - 1]) errors.push('worklist rows must be sorted by descending priority_score')
  }
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no remediation work items were audited')

  return {
    changes_official_standard_text: false,
    coverage: args.coverage,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    require_items: args.requireItems,
    summary: stats,
    unit_worklist: args.unitWorklist,
    valid: errors.length === 0,
    worklist: args.worklist,
    writes_public_data: false
  }
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Candidate Coverage Worklist Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected items | ${payload.summary.expected_items} |
| audited items | ${payload.summary.audited_items} |
| missing items | ${payload.summary.missing_items} |
| extra items | ${payload.summary.extra_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Routes

| route | items |
| --- | ---: |
${countRows(payload.summary.by_remediation_route)}

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
