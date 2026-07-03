#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_TRIAGE_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_STANDARDS_ROOT = 'public/data/by_subject'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe_audit.md'

const SPLIT_REVIEW_DECISION = 'split_or_refine_group_scope'
const SPLIT_WORK_PATH = 'split_scope_before_item_review'

function parseArgs(argv) {
  const args = {
    anchorBatch: DEFAULT_ANCHOR_BATCH,
    batch: DEFAULT_BATCH,
    maxRank: Number.POSITIVE_INFINITY,
    minRank: 1,
    out: DEFAULT_OUT,
    requireCandidates: false,
    standardsRoot: DEFAULT_STANDARDS_ROOT,
    strict: false,
    subjects: null,
    summaryOut: DEFAULT_SUMMARY_OUT,
    triageDecisions: DEFAULT_TRIAGE_DECISIONS,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
    else if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--triage-decisions') args.triageDecisions = argv[++i]
    else if (item === '--anchor-batch') args.anchorBatch = argv[++i]
    else if (item === '--standards-root') args.standardsRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = parseList(argv[++i])
    else if (item === '--min-rank') args.minRank = Number(argv[++i])
    else if (item === '--max-rank') args.maxRank = Number(argv[++i])
    else if (item === '--strict') args.strict = true
    else if (item === '--require-candidates') args.requireCandidates = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_split_review_batch.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json \\
  --triage-decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json \\
  --anchor-batch generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-candidates

Audits the read-only anchor group split review batch. It verifies exact
selection from the action worklist, source item lineage, public standard
context, and the no-public-write/no-matcher/no-publication policy boundary.`)
}

function parseList(value) {
  const rows = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  if (!rows.length || rows.includes('all')) return null
  return rows
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

function validateArgs(args, errors) {
  if (!Number.isInteger(args.minRank) || args.minRank < 1) errors.push('--min-rank must be an integer >= 1')
  if (args.maxRank !== Number.POSITIVE_INFINITY && (!Number.isInteger(args.maxRank) || args.maxRank < 1)) {
    errors.push('--max-rank must be an integer >= 1')
  }
  if (args.minRank > args.maxRank) errors.push('--min-rank must be <= --max-rank')
}

function mapBy(rows, key, errors, label) {
  const out = new Map()
  for (const row of rows || []) {
    const id = row[key]
    if (!id) {
      errors.push(`${label} row missing ${key}`)
      continue
    }
    if (out.has(id)) errors.push(`${label} duplicate ${key}: ${id}`)
    out.set(id, row)
  }
  return out
}

function loadStandardsForSubject(root, subjectSlug, errors) {
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

function buildStandardIndex(root, subjectSlugs, errors) {
  const out = new Map()
  for (const subjectSlug of sorted(subjectSlugs)) {
    for (const standard of loadStandardsForSubject(root, subjectSlug, errors)) {
      const code = standard.code || standard.id
      if (code) out.set(code, standard)
    }
  }
  return out
}

function selectedWorkItems(worklist, args) {
  const subjectSet = args.subjects ? new Set(args.subjects) : null
  return (worklist.action_work_items || [])
    .filter(item => item.work_path === SPLIT_WORK_PATH)
    .filter(item => item.recommended_reviewer_decision === SPLIT_REVIEW_DECISION)
    .filter(item => Number(item.priority_rank || 0) >= args.minRank)
    .filter(item => Number(item.priority_rank || 0) <= args.maxRank)
    .filter(item => !subjectSet || subjectSet.has(item.subject_slug || ''))
}

function expectedCandidateRows(worklist, args) {
  const rows = []
  for (const workItem of selectedWorkItems(worklist, args)) {
    for (const candidate of workItem.split_candidates || []) {
      rows.push({ candidate, workItem })
    }
  }
  return rows
}

function validateTopLevel(batch, worklist, triage, anchorBatch, args, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_group_split_review_batch') {
    errors.push('batch purpose must be h4g_subject_theme_bridge_anchor_group_split_review_batch')
  }
  if (batch.review_only !== true) errors.push('batch review_only must be true')
  if (batch.writes_public_data !== false) errors.push('batch writes_public_data must be false')
  if (batch.changes_official_standard_text !== false) errors.push('batch changes_official_standard_text must be false')
  if (batch.direct_matcher_use !== false) errors.push('batch direct_matcher_use must be false')
  if (batch.matcher_ready !== false) errors.push('batch matcher_ready must be false')
  if (batch.publication_ready !== false) errors.push('batch publication_ready must be false')
  const policy = batch.policy || {}
  for (const key of [
    'read_only_split_review_batch',
    'source_decision_must_be_edited_separately',
    'split_review_is_not_approval',
    'item_level_decision_gate_required',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`policy.${key} must be true`)
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'eligible_for_h4g_differentiation',
    'direct_matcher_use',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (policy[key] !== false) errors.push(`policy.${key} must be false`)
  }

  if (batch.source_action_worklist !== args.worklist) errors.push('batch source_action_worklist must match audit arg')
  if (batch.source_triage_decisions !== args.triageDecisions) errors.push('batch source_triage_decisions must match audit arg')
  if (batch.source_anchor_batch !== args.anchorBatch) errors.push('batch source_anchor_batch must match audit arg')
  if (batch.selection?.min_rank !== args.minRank) errors.push('batch selection.min_rank must match audit arg')
  const expectedMax = args.maxRank === Number.POSITIVE_INFINITY ? 'all' : args.maxRank
  if (batch.selection?.max_rank !== expectedMax) errors.push('batch selection.max_rank must match audit arg')
  if (batch.selection?.work_path !== SPLIT_WORK_PATH) errors.push(`batch selection.work_path must be ${SPLIT_WORK_PATH}`)
  if (batch.selection?.reviewer_decision !== SPLIT_REVIEW_DECISION) {
    errors.push(`batch selection.reviewer_decision must be ${SPLIT_REVIEW_DECISION}`)
  }
  const expectedSubjects = args.subjects || ['all']
  const actualSubjects = batch.selection?.subjects || []
  if (actualSubjects.join(',') !== expectedSubjects.join(',')) errors.push('batch selection.subjects must match audit arg')

  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_action_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_anchor_group_action_worklist')
  }
  if (triage.valid !== true) errors.push('triage decisions valid must be true')
  if (triage.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_triage_decisions_candidate') {
    errors.push('triage decisions candidate_purpose must be h4g_subject_theme_bridge_anchor_group_triage_decisions_candidate')
  }
  if (triage.group_review_complete !== true) errors.push('triage decisions group_review_complete must be true')
  if (anchorBatch.valid !== true) errors.push('anchor batch valid must be true')
  if (anchorBatch.purpose !== 'h4g_subject_theme_bridge_anchor_review_batch') {
    errors.push('anchor batch purpose must be h4g_subject_theme_bridge_anchor_review_batch')
  }
}

function auditItemPolicy(item, prefix, errors) {
  const policy = item.publication_policy || {}
  for (const key of [
    'read_only_split_review_batch',
    'source_decision_must_be_edited_separately',
    'split_review_is_not_approval',
    'item_level_decision_gate_required',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${prefix} publication_policy.${key} must be true`)
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'eligible_for_h4g_differentiation',
    'direct_matcher_use',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (policy[key] !== false) errors.push(`${prefix} publication_policy.${key} must be false`)
  }
}

function sameSet(actual, expected) {
  return sorted(actual).join('|') === sorted(expected).join('|')
}

function auditDecisionTemplate(item, prefix, errors) {
  const template = item.review_decision_template || {}
  const allowed = template.allowed_review_outcomes || []
  for (const value of [
    'accept_bounded_slice_for_item_level_source_review',
    'split_slice_further',
    'needs_source_anchor_evidence',
    'reject_slice_as_overbroad'
  ]) {
    if (!allowed.includes(value)) errors.push(`${prefix} review_decision_template.allowed_review_outcomes missing ${value}`)
  }
  for (const forbidden of [
    'approve_standard_scoped_subject_theme_bridge',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (allowed.includes(forbidden)) errors.push(`${prefix} review_decision_template must not include ${forbidden}`)
  }
  if (template.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (template.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (template.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
  if (template.requested_eligible_for_h4g_differentiation !== false) {
    errors.push(`${prefix} requested_eligible_for_h4g_differentiation must be false`)
  }
  const confirmations = template.required_confirmations || {}
  if (confirmations.item_level_decision_still_required !== true) {
    errors.push(`${prefix} required_confirmations.item_level_decision_still_required must be true`)
  }
  if (confirmations.no_public_write_requested !== true) {
    errors.push(`${prefix} required_confirmations.no_public_write_requested must be true`)
  }
  if (confirmations.official_standard_text_preserved !== true) {
    errors.push(`${prefix} required_confirmations.official_standard_text_preserved must be true`)
  }
  if (!Array.isArray(template.review_questions) || !template.review_questions.length) {
    errors.push(`${prefix} review_decision_template.review_questions must be non-empty`)
  }
}

function auditSourceItems(item, expected, indexes, prefix, errors) {
  const expectedIds = expected.candidate.item_summary?.anchor_review_item_ids || []
  const sourceItems = item.source_anchor_review_items || []
  if (!sameSet(sourceItems.map(row => row.anchor_review_item_id), expectedIds)) {
    errors.push(`${prefix} source_anchor_review_items must match candidate anchor_review_item_ids`)
  }
  if (sourceItems.length !== Number(expected.candidate.item_summary?.item_count || 0)) {
    errors.push(`${prefix} source_anchor_review_items length must match candidate item_count`)
  }
  for (const sourceItem of sourceItems) {
    const source = indexes.anchorItemById.get(sourceItem.anchor_review_item_id)
    if (!source) {
      errors.push(`${prefix} source item not found in anchor batch: ${sourceItem.anchor_review_item_id}`)
      continue
    }
    if (source.progression_group_id !== item.progression_group_id) errors.push(`${prefix} source item group mismatch: ${sourceItem.anchor_review_item_id}`)
    if (source.standard_context?.standard_code !== item.standard_code) errors.push(`${prefix} source item standard mismatch: ${sourceItem.anchor_review_item_id}`)
    if (source.grade_band !== item.grade_band) errors.push(`${prefix} source item grade mismatch: ${sourceItem.anchor_review_item_id}`)
    if (source.action_family !== item.action_family) errors.push(`${prefix} source item action family mismatch: ${sourceItem.anchor_review_item_id}`)
    if (source.anchor_requirement?.anchor_type !== item.anchor_type) errors.push(`${prefix} source item anchor type mismatch: ${sourceItem.anchor_review_item_id}`)
    if (!sourceItem.unit_context?.unit_evidence_id || !sourceItem.unit_context?.unit_title) {
      errors.push(`${prefix} source item must include unit_context unit_evidence_id and unit_title: ${sourceItem.anchor_review_item_id}`)
    }
    if (sourceItem.bridge_context?.page_ready !== true) {
      errors.push(`${prefix} source item must be page-ready: ${sourceItem.anchor_review_item_id}`)
    }
  }
}

function auditItem(item, expectedByCandidate, indexes, errors, stats) {
  const prefix = item.split_review_item_id || item.split_candidate_id || '(missing split review item)'
  if (!item.split_review_item_id) errors.push(`${prefix} missing split_review_item_id`)
  if (!item.split_candidate_id) errors.push(`${prefix} missing split_candidate_id`)
  const expected = expectedByCandidate.get(item.split_candidate_id)
  if (!expected) {
    errors.push(`${prefix} split_candidate_id not selected from worklist`)
    return
  }
  expected.seen = true
  const { candidate, workItem } = expected
  const triage = indexes.triageByGroup.get(workItem.progression_group_id)
  const standard = indexes.standardsByCode.get(candidate.standard_code)

  if (item.anchor_action_work_id !== workItem.anchor_action_work_id) errors.push(`${prefix} anchor_action_work_id mismatch`)
  if (item.progression_group_id !== workItem.progression_group_id) errors.push(`${prefix} progression_group_id mismatch`)
  if (item.subject_slug !== workItem.subject_slug) errors.push(`${prefix} subject_slug mismatch`)
  if (item.priority_rank !== workItem.priority_rank) errors.push(`${prefix} priority_rank mismatch`)
  if (item.priority_tier !== workItem.priority_tier) errors.push(`${prefix} priority_tier mismatch`)
  if (item.work_path !== SPLIT_WORK_PATH) errors.push(`${prefix} work_path must be ${SPLIT_WORK_PATH}`)
  if (item.standard_code !== candidate.standard_code) errors.push(`${prefix} standard_code mismatch`)
  if (item.grade_band !== candidate.grade_band) errors.push(`${prefix} grade_band mismatch`)
  if (item.action_family !== candidate.action_family) errors.push(`${prefix} action_family mismatch`)
  if (item.anchor_type !== candidate.anchor_type) errors.push(`${prefix} anchor_type mismatch`)
  if (!triage) errors.push(`${prefix} missing triage decision`)
  else {
    if (triage.reviewer_decision !== SPLIT_REVIEW_DECISION) errors.push(`${prefix} triage reviewer_decision must be ${SPLIT_REVIEW_DECISION}`)
    if (item.source_triage_decision_id !== triage.decision_id) errors.push(`${prefix} source_triage_decision_id mismatch`)
  }
  if (!standard) errors.push(`${prefix} standard_code not found in public data: ${candidate.standard_code}`)
  else {
    if (item.standard_context?.code !== candidate.standard_code) errors.push(`${prefix} standard_context.code mismatch`)
    if (!item.standard_context?.standard) errors.push(`${prefix} standard_context.standard must be present`)
    if (item.standard_context?.grade_band !== candidate.grade_band) errors.push(`${prefix} standard_context.grade_band mismatch`)
    if (item.standard_context?.subject_slug !== workItem.subject_slug) errors.push(`${prefix} standard_context.subject_slug mismatch`)
  }
  if (item.review_grain !== 'standard_code+grade_band+action_family+anchor_type') {
    errors.push(`${prefix} review_grain must be standard_code+grade_band+action_family+anchor_type`)
  }
  auditSourceItems(item, expected, indexes, prefix, errors)
  auditDecisionTemplate(item, prefix, errors)
  auditItemPolicy(item, prefix, errors)

  stats.anchor_review_rows += (item.source_anchor_review_items || []).length
  countInto(stats.by_subject, item.subject_slug)
  countInto(stats.by_grade_band, item.grade_band)
  countInto(stats.by_action_family, item.action_family)
  countInto(stats.by_anchor_type, item.anchor_type)
  countInto(stats.by_priority_tier, item.priority_tier)
}

function auditSummary(batch, stats, errors) {
  const summary = batch.summary || {}
  if (summary.split_review_items !== stats.split_review_items) errors.push('summary.split_review_items mismatch')
  if (summary.progression_groups !== stats.progression_groups) errors.push('summary.progression_groups mismatch')
  if (summary.public_standards !== stats.public_standards) errors.push('summary.public_standards mismatch')
  if (summary.anchor_review_rows !== stats.anchor_review_rows) errors.push('summary.anchor_review_rows mismatch')
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Split Review Batch Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected split candidates | ${payload.summary.expected_split_candidates} |
| batch split review items | ${payload.summary.split_review_items} |
| progression groups | ${payload.summary.progression_groups} |
| public standards | ${payload.summary.public_standards} |
| anchor review rows | ${payload.summary.anchor_review_rows} |
| missing candidates | ${payload.summary.missing_candidates} |
| extra candidates | ${payload.summary.extra_candidates} |

## Grade Bands

| grade band | slices |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Subjects

| subject | slices |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  validateArgs(args, errors)
  for (const [label, path] of [
    ['batch', args.batch],
    ['worklist', args.worklist],
    ['triage decisions', args.triageDecisions],
    ['anchor batch', args.anchorBatch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const batch = errors.length ? { split_review_items: [] } : readJson(args.batch)
  const worklist = errors.length ? { action_work_items: [] } : readJson(args.worklist)
  const triage = errors.length ? { group_review_decisions: [] } : readJson(args.triageDecisions)
  const anchorBatch = errors.length ? { anchor_review_items: [] } : readJson(args.anchorBatch)
  if (!errors.length) validateTopLevel(batch, worklist, triage, anchorBatch, args, errors)

  const expectedRows = expectedCandidateRows(worklist, args)
  const expectedByCandidate = new Map()
  for (const row of expectedRows) {
    if (!row.candidate.candidate_id) errors.push(`${row.workItem.progression_group_id} candidate missing candidate_id`)
    else if (expectedByCandidate.has(row.candidate.candidate_id)) errors.push(`duplicate split candidate id: ${row.candidate.candidate_id}`)
    else expectedByCandidate.set(row.candidate.candidate_id, { ...row, seen: false })
  }
  const subjectSlugs = sorted(expectedRows.map(row => row.workItem.subject_slug))
  const indexes = {
    anchorItemById: mapBy(anchorBatch.anchor_review_items || [], 'anchor_review_item_id', errors, 'anchor batch'),
    standardsByCode: buildStandardIndex(args.standardsRoot, subjectSlugs, errors),
    triageByGroup: mapBy(triage.group_review_decisions || [], 'progression_group_id', errors, 'triage decisions')
  }

  const stats = {
    anchor_review_rows: 0,
    by_action_family: {},
    by_anchor_type: {},
    by_grade_band: {},
    by_priority_tier: {},
    by_subject: {},
    expected_split_candidates: expectedRows.length,
    extra_candidates: 0,
    missing_candidates: 0,
    progression_groups: sorted((batch.split_review_items || []).map(item => item.progression_group_id)).length,
    public_standards: sorted((batch.split_review_items || []).map(item => item.standard_code)).length,
    split_review_items: (batch.split_review_items || []).length
  }

  const seenItemIds = new Set()
  for (const item of batch.split_review_items || []) {
    if (seenItemIds.has(item.split_review_item_id)) errors.push(`duplicate split_review_item_id: ${item.split_review_item_id}`)
    seenItemIds.add(item.split_review_item_id)
    auditItem(item, expectedByCandidate, indexes, errors, stats)
  }
  for (const [candidateId, row] of expectedByCandidate.entries()) {
    if (!row.seen) {
      stats.missing_candidates += 1
      errors.push(`${candidateId} missing from split review batch`)
    }
  }
  for (const item of batch.split_review_items || []) {
    if (!expectedByCandidate.has(item.split_candidate_id)) stats.extra_candidates += 1
  }
  if (args.requireCandidates && !expectedRows.length) errors.push('requireCandidates is set but no expected split candidates were selected')
  if (args.requireCandidates && !(batch.split_review_items || []).length) {
    errors.push('requireCandidates is set but batch has no split_review_items')
  }
  auditSummary(batch, stats, errors)

  return {
    batch: args.batch,
    errors,
    generated_at: new Date().toISOString(),
    require_candidates: args.requireCandidates,
    selection: {
      max_rank: args.maxRank === Number.POSITIVE_INFINITY ? 'all' : args.maxRank,
      min_rank: args.minRank,
      reviewer_decision: SPLIT_REVIEW_DECISION,
      subjects: args.subjects || ['all'],
      work_path: SPLIT_WORK_PATH
    },
    summary: stats,
    valid: errors.length === 0,
    worklist: args.worklist
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const payload = audit(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
