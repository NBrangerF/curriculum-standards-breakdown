#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_batch.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_unit_evidence_blocker_action_worklist.json'
const DEFAULT_DIAGNOSTICS = 'generated/textbook_evidence/h4g_unit_evidence_blocker_match_diagnostics.json'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_batch_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_batch_audit.md'
const TARGET_ROUTE = 'review_noneligible_medium_high_match_for_anchor_or_policy'
const TARGET_ACTION_TYPE = 'review_anchor_policy_for_noneligible_medium_high_matches'
const TARGET_CONFIDENCE_BANDS = new Set(['high', 'medium'])

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    dataRoot: DEFAULT_DATA_ROOT,
    diagnostics: DEFAULT_DIAGNOSTICS,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    subjects: [],
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
    else if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--diagnostics') args.diagnostics = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = splitArg(argv[++i])
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_unit_evidence_anchor_policy_review_batch.js \\
  --subjects math,science \\
  --strict --require-items

Audits the read-only H4G unit-evidence anchor-policy review batch against the
blocker action worklist, blocker diagnostics, and public standard records.`)
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

function hashText(value, length = 14) {
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

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadStandardsByCode(dataRoot, selectedSubjects, errors) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) {
    errors.push(`Missing by_subject data root: ${dir}`)
    return new Map()
  }
  const selected = new Set(selectedSubjects)
  const byCode = new Map()
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    if (selected.size && !selected.has(subjectSlug)) continue
    const payload = readJson(file)
    for (const standard of payload.standards || []) {
      if (!standard.code) continue
      byCode.set(standard.code, {
        code: standard.code,
        domain: standard.domain || '',
        grade: standard.grade || '',
        grade_band: standard.grade_band || '',
        grade_level: standard.grade_level ?? null,
        grade_range: standard.grade_range || '',
        learning_area: standard.learning_area || '',
        progression_group_id: standard.progression_group_id || '',
        progression_role: standard.progression_role || '',
        review_status: standard.review_status || '',
        source_grade_range: standard.source_grade_range || '',
        source_standard_scope: standard.source_standard_scope || '',
        standard: standard.standard || '',
        standard_variant_type: standard.standard_variant_type || '',
        subject: standard.subject || payload.subject || subjectSlug,
        subject_slug: standard.subject_slug || subjectSlug
      })
    }
  }
  return byCode
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

function validateBatchPolicy(label, policy, errors) {
  validatePolicy(label, policy, errors)
  for (const key of [
    'requires_later_manual_review',
    'requires_later_candidate_coverage_recheck',
    'requires_later_consistency_gate',
    'requires_later_publication_gate',
    'review_batch_only',
    'worklist_only'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
}

function validateTopLevel(batch, worklist, diagnostics, args, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_unit_evidence_anchor_policy_review_batch') errors.push('batch purpose mismatch')
  if (batch.source_worklist !== args.worklist) errors.push('batch source_worklist must match audit arg')
  if (batch.source_diagnostics !== args.diagnostics) errors.push('batch source_diagnostics must match audit arg')
  if (batch.data_root !== args.dataRoot) errors.push('batch data_root must match audit arg')
  if (batch.target_action_type !== TARGET_ACTION_TYPE) errors.push('batch target_action_type mismatch')
  if (batch.target_diagnostic_route !== TARGET_ROUTE) errors.push('batch target_diagnostic_route mismatch')
  if (batch.review_batch_only !== true) errors.push('batch review_batch_only must be true')
  if (!Array.isArray(batch.anchor_policy_review_items)) errors.push('batch anchor_policy_review_items must be an array')
  validatePolicy('batch', batch, errors)
  validateBatchPolicy('batch policy', batch.policy || {}, errors)

  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_unit_evidence_blocker_action_worklist') errors.push('worklist purpose mismatch')
  validatePolicy('worklist', worklist, errors)

  if (diagnostics.valid !== true) errors.push('diagnostics valid must be true')
  if (diagnostics.purpose !== 'h4g_unit_evidence_blocker_match_diagnostics') errors.push('diagnostics purpose mismatch')
  validatePolicy('diagnostics', diagnostics, errors)

  if (!sameJson(sorted(batch.selected_subjects || []), sorted(args.subjects || []))) {
    errors.push('batch selected_subjects must match audit args')
  }
}

function diagnosticsByCode(diagnostics) {
  const out = new Map()
  for (const row of diagnostics.blocker_match_diagnostics || []) {
    if (row.code) out.set(row.code, row)
  }
  return out
}

function candidateMatches(row) {
  return (row?.top_matches || [])
    .filter(match => match.eligible_for_h4g_differentiation !== true)
    .filter(match => TARGET_CONFIDENCE_BANDS.has(match.confidence_band))
    .map(match => ({
      confidence_band: match.confidence_band || '',
      edition: match.edition || '',
      eligible_alignment: match.eligible_alignment || '',
      eligible_for_h4g_differentiation: false,
      evidence_id: match.evidence_id || '',
      keyword_score: match.keyword_score ?? null,
      match_id: match.match_id || '',
      page_range: match.page_range || '',
      page_start: match.page_start || '',
      source_file: match.source_file || '',
      unit_title: match.unit_title || ''
    }))
}

function expectedItems(worklist, diagnostics, standardsByCode, args) {
  const selectedSubjects = new Set(args.subjects)
  const byCode = diagnosticsByCode(diagnostics)
  const out = []
  for (const workItem of worklist.action_work_items || []) {
    if (workItem.primary_diagnostic_route !== TARGET_ROUTE) continue
    if (workItem.action_type !== TARGET_ACTION_TYPE) continue
    if (selectedSubjects.size && !selectedSubjects.has(workItem.subject_slug)) continue
    for (const standard of workItem.standards || []) {
      if (standard.diagnostic_route !== TARGET_ROUTE) continue
      const diagnostic = byCode.get(standard.code)
      const matches = candidateMatches(diagnostic)
      if (!matches.length) continue
      out.push({
        anchor_policy_review_item_id: `h4g_unit_anchor_policy_review_${hashText(`${workItem.work_item_id}:${standard.code}`)}`,
        candidate_matches_count: matches.length,
        grade_band: standard.grade_band || '',
        group_grade_bands: workItem.grade_bands || [],
        group_progression_completeness: workItem.progression_completeness || '',
        group_standard_codes: workItem.standard_codes || [],
        parent_action_work_item_id: workItem.work_item_id || '',
        priority_score: Number(workItem.priority_score || 0),
        progression_group_id: workItem.progression_group_id || '',
        standard_code: standard.code || '',
        standard_context: standardsByCode.get(standard.code) || null,
        subject_slug: workItem.subject_slug || ''
      })
    }
  }
  return out.sort((a, b) => b.priority_score - a.priority_score ||
    a.subject_slug.localeCompare(b.subject_slug) ||
    a.progression_group_id.localeCompare(b.progression_group_id) ||
    a.grade_band.localeCompare(b.grade_band) ||
    a.standard_code.localeCompare(b.standard_code))
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

function summarize(items) {
  const summary = {
    anchor_policy_review_items: items.length,
    by_confidence_band: {},
    by_grade_band: {},
    by_progression_completeness: {},
    by_subject: {},
    candidate_matches: 0,
    parent_action_work_items: sorted(items.map(item => item.parent_action_work_item_id)).length,
    top_priority_score: items[0]?.priority_score || 0
  }
  for (const item of items) {
    countInto(summary.by_grade_band, item.grade_band)
    countInto(summary.by_progression_completeness, item.group_progression_completeness)
    summary.candidate_matches += item.candidate_matches_count || 0
    summary.by_subject[item.subject_slug] ||= {
      anchor_policy_review_items: 0,
      candidate_matches: 0,
      parent_action_work_items: new Set()
    }
    const subject = summary.by_subject[item.subject_slug]
    subject.anchor_policy_review_items += 1
    subject.candidate_matches += item.candidate_matches_count || 0
    subject.parent_action_work_items.add(item.parent_action_work_item_id)
    for (const match of item.candidate_matches || []) countInto(summary.by_confidence_band, match.confidence_band)
  }
  for (const [subject, stats] of Object.entries(summary.by_subject)) {
    summary.by_subject[subject] = {
      anchor_policy_review_items: stats.anchor_policy_review_items,
      candidate_matches: stats.candidate_matches,
      parent_action_work_items: stats.parent_action_work_items.size
    }
  }
  return summary
}

function validateItem(item, expected, errors, stats) {
  const prefix = item.anchor_policy_review_item_id || item.standard_code || '(review item)'
  validatePolicy(prefix, item, errors)
  validateBatchPolicy(`${prefix} policy`, item.policy || {}, errors)
  for (const [key, expectedValue] of Object.entries({
    action_type: TARGET_ACTION_TYPE,
    candidate_matches_count: expected.candidate_matches_count,
    decision_type: 'h4g_unit_anchor_policy_review',
    grade_band: expected.grade_band,
    group_grade_bands: expected.group_grade_bands,
    group_progression_completeness: expected.group_progression_completeness,
    group_standard_codes: expected.group_standard_codes,
    parent_action_work_item_id: expected.parent_action_work_item_id,
    primary_diagnostic_route: TARGET_ROUTE,
    priority_score: expected.priority_score,
    progression_group_id: expected.progression_group_id,
    reviewer_decision: 'pending',
    standard_code: expected.standard_code,
    subject_slug: expected.subject_slug,
    worklist_only: true
  })) {
    if (!sameJson(item[key], expectedValue)) errors.push(`${prefix} ${key} mismatch`)
  }
  if (!item.candidate_matches?.length) errors.push(`${prefix} missing candidate_matches`)
  for (const match of item.candidate_matches || []) {
    if (match.eligible_for_h4g_differentiation !== false) errors.push(`${prefix} candidate match must remain non-eligible`)
    if (!TARGET_CONFIDENCE_BANDS.has(match.confidence_band)) errors.push(`${prefix} candidate match confidence must be medium/high`)
  }
  for (const [key, value] of Object.entries(item.required_confirmations || {})) {
    if (value !== false) errors.push(`${prefix} required_confirmations.${key} must start false`)
  }
  if (!Object.keys(item.required_confirmations || {}).length) errors.push(`${prefix} missing required_confirmations`)
  if (expected.standard_context && !sameJson(item.standard_context, expected.standard_context)) {
    errors.push(`${prefix} standard_context mismatch`)
  }
  stats.audited_items += 1
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['batch', args.batch],
    ['worklist', args.worklist],
    ['diagnostics', args.diagnostics],
    ['data root', args.dataRoot]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const batch = existsSync(args.batch) ? readJson(args.batch) : { anchor_policy_review_items: [] }
  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { action_work_items: [] }
  const diagnostics = existsSync(args.diagnostics) ? readJson(args.diagnostics) : { blocker_match_diagnostics: [] }
  if (!errors.length) validateTopLevel(batch, worklist, diagnostics, args, errors)
  const standardsByCode = errors.length ? new Map() : loadStandardsByCode(args.dataRoot, args.subjects, errors)

  const expected = expectedItems(worklist, diagnostics, standardsByCode, args)
  const expectedById = new Map(expected.map(row => [row.anchor_policy_review_item_id, row]))
  const items = batch.anchor_policy_review_items || []
  const byId = mapBy(items, 'anchor_policy_review_item_id', errors, 'batch')
  const stats = {
    audited_items: 0,
    expected_items: expected.length,
    extra_items: 0,
    missing_items: 0,
    ...summarize(items)
  }

  if (!sameJson(batch.summary || {}, summarize(items))) errors.push('batch summary does not match rows')
  for (const expectedItem of expected) {
    const item = byId.get(expectedItem.anchor_policy_review_item_id)
    if (!item) {
      stats.missing_items += 1
      errors.push(`${expectedItem.anchor_policy_review_item_id} missing review item`)
      continue
    }
    validateItem(item, expectedItem, errors, stats)
  }
  for (const id of byId.keys()) {
    if (!expectedById.has(id)) {
      stats.extra_items += 1
      errors.push(`${id} unexpected review item`)
    }
  }
  for (let i = 1; i < items.length; i += 1) {
    if (Number(items[i].priority_score || 0) > Number(items[i - 1].priority_score || 0)) {
      errors.push('batch rows must be sorted by descending priority_score')
      break
    }
  }
  if (args.requireItems && !items.length) errors.push('requireItems is set but no review items were audited')

  return {
    batch: args.batch,
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
  return `# H4G Unit Evidence Anchor Policy Review Batch Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected items | ${payload.summary.expected_items} |
| audited items | ${payload.summary.audited_items} |
| missing items | ${payload.summary.missing_items} |
| extra items | ${payload.summary.extra_items} |
| candidate matches | ${payload.summary.candidate_matches} |

## Subjects

| subject | review items | candidate matches | parent work items |
| --- | ---: | ---: | ---: |
${Object.entries(payload.summary.by_subject || {}).sort(([a], [b]) => a.localeCompare(b)).map(([subject, stats]) => `| ${markdownCell(subject)} | ${stats.anchor_policy_review_items} | ${stats.candidate_matches} | ${stats.parent_action_work_items} |`).join('\n') || '| - | 0 | 0 | 0 |'}

## Confidence Bands

| confidence | matches |
| --- | ---: |
${countRows(payload.summary.by_confidence_band)}

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
