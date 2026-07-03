#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_TRIAGE_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_STANDARDS_ROOT = 'public/data/by_subject'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe_audit.md'

const EVIDENCE_REVIEW_DECISION = 'needs_source_anchor_evidence'
const EVIDENCE_WORK_PATH = 'source_anchor_evidence_gap_review'

function parseArgs(argv) {
  const args = {
    anchorBatch: DEFAULT_ANCHOR_BATCH,
    batch: DEFAULT_BATCH,
    maxRank: Number.POSITIVE_INFINITY,
    minRank: 1,
    out: DEFAULT_OUT,
    requireRequests: false,
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
    else if (item === '--require-requests') args.requireRequests = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_source_evidence_batch.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json \\
  --triage-decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json \\
  --anchor-batch generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-requests

Audits the read-only source-anchor evidence request batch. It verifies exact
selection from the action worklist, source item lineage, public target standard
lookup for missing grade bands, and the no-public-write/no-matcher/no-publication
policy boundary.`)
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

function buildStandardIndexes(root, subjectSlugs, errors) {
  const byCode = new Map()
  const byGroup = new Map()
  for (const subjectSlug of sorted(subjectSlugs)) {
    for (const standard of loadStandardsForSubject(root, subjectSlug, errors)) {
      const code = standard.code || standard.id
      if (code) byCode.set(code, standard)
      if (standard.progression_group_id) {
        if (!byGroup.has(standard.progression_group_id)) byGroup.set(standard.progression_group_id, [])
        byGroup.get(standard.progression_group_id).push(standard)
      }
    }
  }
  return { byCode, byGroup }
}

function selectedWorkItems(worklist, args) {
  const subjectSet = args.subjects ? new Set(args.subjects) : null
  return (worklist.action_work_items || [])
    .filter(item => item.work_path === EVIDENCE_WORK_PATH)
    .filter(item => item.recommended_reviewer_decision === EVIDENCE_REVIEW_DECISION)
    .filter(item => Number(item.priority_rank || 0) >= args.minRank)
    .filter(item => Number(item.priority_rank || 0) <= args.maxRank)
    .filter(item => !subjectSet || subjectSet.has(item.subject_slug || ''))
}

function expectedRequestRows(worklist, args) {
  const rows = []
  for (const workItem of selectedWorkItems(worklist, args)) {
    for (const request of workItem.source_anchor_evidence_requests || []) rows.push({ request, workItem })
  }
  return rows
}

function standardCodesForGrades(standards, gradeBands) {
  const gradeSet = new Set(gradeBands || [])
  return sorted((standards || [])
    .filter(standard => gradeSet.has(standard.grade_band || ''))
    .map(standard => standard.code || standard.id))
}

function missingTargetGrades(request, standards) {
  const targetGradeSet = new Set((standards || []).map(standard => standard.grade_band || ''))
  return sorted((request.missing_grade_bands || []).filter(gradeBand => !targetGradeSet.has(gradeBand)))
}

function validateTopLevel(batch, worklist, triage, anchorBatch, args, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_group_source_evidence_batch') {
    errors.push('batch purpose must be h4g_subject_theme_bridge_anchor_group_source_evidence_batch')
  }
  if (batch.review_only !== true) errors.push('batch review_only must be true')
  if (batch.writes_public_data !== false) errors.push('batch writes_public_data must be false')
  if (batch.changes_official_standard_text !== false) errors.push('batch changes_official_standard_text must be false')
  if (batch.direct_matcher_use !== false) errors.push('batch direct_matcher_use must be false')
  if (batch.matcher_ready !== false) errors.push('batch matcher_ready must be false')
  if (batch.publication_ready !== false) errors.push('batch publication_ready must be false')
  const policy = batch.policy || {}
  for (const key of [
    'read_only_source_evidence_batch',
    'source_decision_must_be_edited_separately',
    'evidence_request_is_not_approval',
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
  if (batch.selection?.work_path !== EVIDENCE_WORK_PATH) errors.push(`batch selection.work_path must be ${EVIDENCE_WORK_PATH}`)
  if (batch.selection?.reviewer_decision !== EVIDENCE_REVIEW_DECISION) {
    errors.push(`batch selection.reviewer_decision must be ${EVIDENCE_REVIEW_DECISION}`)
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
    'read_only_source_evidence_batch',
    'source_decision_must_be_edited_separately',
    'evidence_request_is_not_approval',
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
    'source_anchor_evidence_found_for_missing_grade',
    'source_anchor_evidence_not_found',
    'target_missing_grade_standard_absent',
    'needs_textbook_unit_indexing'
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
  if (confirmations.no_public_write_requested !== true) errors.push(`${prefix} no_public_write_requested must be true`)
  if (confirmations.official_standard_text_preserved !== true) errors.push(`${prefix} official_standard_text_preserved must be true`)
  if (!Array.isArray(template.required_evidence) || !template.required_evidence.length) {
    errors.push(`${prefix} review_decision_template.required_evidence must be non-empty`)
  }
  if (!Array.isArray(template.review_questions) || !template.review_questions.length) {
    errors.push(`${prefix} review_decision_template.review_questions must be non-empty`)
  }
}

function auditSourceItems(item, expected, indexes, prefix, errors) {
  const expectedIds = (expected.request.source_items || []).map(row => row.anchor_review_item_id)
  const sourceItems = item.source_anchor_review_items || []
  if (!sameSet(sourceItems.map(row => row.anchor_review_item_id), expectedIds)) {
    errors.push(`${prefix} source_anchor_review_items must match request source_items`)
  }
  if (sourceItems.length !== expectedIds.length) errors.push(`${prefix} source_anchor_review_items length mismatch`)
  for (const sourceItem of sourceItems) {
    const source = indexes.anchorItemById.get(sourceItem.anchor_review_item_id)
    if (!source) {
      errors.push(`${prefix} source item not found in anchor batch: ${sourceItem.anchor_review_item_id}`)
      continue
    }
    if (source.progression_group_id !== item.progression_group_id) errors.push(`${prefix} source item group mismatch: ${sourceItem.anchor_review_item_id}`)
    if (source.standard_context?.standard_code !== item.standard_code) errors.push(`${prefix} source item standard mismatch: ${sourceItem.anchor_review_item_id}`)
    if (!item.existing_grade_bands.includes(source.grade_band)) errors.push(`${prefix} source item grade must be existing grade: ${sourceItem.anchor_review_item_id}`)
    if (source.anchor_requirement?.anchor_type !== item.anchor_type) errors.push(`${prefix} source item anchor type mismatch: ${sourceItem.anchor_review_item_id}`)
    if (!sourceItem.unit_context?.unit_evidence_id || !sourceItem.unit_context?.unit_title) {
      errors.push(`${prefix} source item must include unit_context unit_evidence_id and unit_title: ${sourceItem.anchor_review_item_id}`)
    }
    if (sourceItem.bridge_context?.page_ready !== true) {
      errors.push(`${prefix} source item must be page-ready: ${sourceItem.anchor_review_item_id}`)
    }
  }
}

function auditItem(item, expectedByRequest, indexes, errors, stats) {
  const prefix = item.source_evidence_request_item_id || item.source_anchor_evidence_request_id || '(missing source evidence item)'
  if (!item.source_evidence_request_item_id) errors.push(`${prefix} missing source_evidence_request_item_id`)
  if (!item.source_anchor_evidence_request_id) errors.push(`${prefix} missing source_anchor_evidence_request_id`)
  const expected = expectedByRequest.get(item.source_anchor_evidence_request_id)
  if (!expected) {
    errors.push(`${prefix} source_anchor_evidence_request_id not selected from worklist`)
    return
  }
  expected.seen = true
  const { request, workItem } = expected
  const triage = indexes.triageByGroup.get(workItem.progression_group_id)
  const groupStandards = indexes.standards.byGroup.get(workItem.progression_group_id) || []
  const sourceStandard = indexes.standards.byCode.get(request.standard_code)
  const expectedExistingCodes = standardCodesForGrades(groupStandards, request.existing_grade_bands)
  const expectedTargetCodes = standardCodesForGrades(groupStandards, request.missing_grade_bands)
  const expectedMissingTargetGrades = missingTargetGrades(request, groupStandards)

  if (item.anchor_action_work_id !== workItem.anchor_action_work_id) errors.push(`${prefix} anchor_action_work_id mismatch`)
  if (item.progression_group_id !== workItem.progression_group_id) errors.push(`${prefix} progression_group_id mismatch`)
  if (item.subject_slug !== workItem.subject_slug) errors.push(`${prefix} subject_slug mismatch`)
  if (item.priority_rank !== workItem.priority_rank) errors.push(`${prefix} priority_rank mismatch`)
  if (item.priority_tier !== workItem.priority_tier) errors.push(`${prefix} priority_tier mismatch`)
  if (item.work_path !== EVIDENCE_WORK_PATH) errors.push(`${prefix} work_path must be ${EVIDENCE_WORK_PATH}`)
  if (item.standard_code !== request.standard_code) errors.push(`${prefix} standard_code mismatch`)
  if (item.anchor_type !== request.anchor_type) errors.push(`${prefix} anchor_type mismatch`)
  if (!sameSet(item.existing_grade_bands, request.existing_grade_bands)) errors.push(`${prefix} existing_grade_bands mismatch`)
  if (!sameSet(item.missing_grade_bands, request.missing_grade_bands)) errors.push(`${prefix} missing_grade_bands mismatch`)
  if (!sameSet(item.missing_target_standard_grade_bands, expectedMissingTargetGrades)) {
    errors.push(`${prefix} missing_target_standard_grade_bands mismatch`)
  }
  if (!sameSet((item.existing_grade_standards || []).map(row => row.code), expectedExistingCodes)) {
    errors.push(`${prefix} existing_grade_standards codes mismatch`)
  }
  if (!sameSet((item.target_missing_grade_standards || []).map(row => row.code), expectedTargetCodes)) {
    errors.push(`${prefix} target_missing_grade_standards codes mismatch`)
  }
  if (!triage) errors.push(`${prefix} missing triage decision`)
  else {
    if (triage.reviewer_decision !== EVIDENCE_REVIEW_DECISION) errors.push(`${prefix} triage reviewer_decision must be ${EVIDENCE_REVIEW_DECISION}`)
    if (item.source_triage_decision_id !== triage.decision_id) errors.push(`${prefix} source_triage_decision_id mismatch`)
  }
  if (!sourceStandard) errors.push(`${prefix} standard_code not found in public data: ${request.standard_code}`)
  else {
    if (item.source_standard_context?.code !== request.standard_code) errors.push(`${prefix} source_standard_context.code mismatch`)
    if (!item.source_standard_context?.standard) errors.push(`${prefix} source_standard_context.standard must be present`)
    if (item.source_standard_context?.subject_slug !== workItem.subject_slug) errors.push(`${prefix} source_standard_context.subject_slug mismatch`)
  }
  if (item.review_grain !== 'progression_group+anchor_type+missing_grade_band') {
    errors.push(`${prefix} review_grain must be progression_group+anchor_type+missing_grade_band`)
  }
  auditSourceItems(item, expected, indexes, prefix, errors)
  auditDecisionTemplate(item, prefix, errors)
  auditItemPolicy(item, prefix, errors)

  stats.existing_source_rows += (item.source_anchor_review_items || []).length
  stats.target_missing_grade_standards += (item.target_missing_grade_standards || []).length
  if ((item.missing_target_standard_grade_bands || []).length) stats.requests_with_missing_target_standard_gap += 1
  countInto(stats.by_anchor_type, item.anchor_type)
  countInto(stats.by_priority_tier, item.priority_tier)
  countInto(stats.by_subject, item.subject_slug)
  for (const gradeBand of item.existing_grade_bands || []) countInto(stats.by_existing_grade_band, gradeBand)
  for (const gradeBand of item.missing_grade_bands || []) countInto(stats.by_missing_grade_band, gradeBand)
}

function auditSummary(batch, stats, errors) {
  const summary = batch.summary || {}
  if (summary.source_evidence_requests !== stats.source_evidence_requests) errors.push('summary.source_evidence_requests mismatch')
  if (summary.progression_groups !== stats.progression_groups) errors.push('summary.progression_groups mismatch')
  if (summary.existing_source_rows !== stats.existing_source_rows) errors.push('summary.existing_source_rows mismatch')
  if (summary.target_missing_grade_standards !== stats.target_missing_grade_standards) {
    errors.push('summary.target_missing_grade_standards mismatch')
  }
  if (summary.requests_with_missing_target_standard_gap !== stats.requests_with_missing_target_standard_gap) {
    errors.push('summary.requests_with_missing_target_standard_gap mismatch')
  }
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Source Evidence Batch Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected requests | ${payload.summary.expected_source_evidence_requests} |
| batch requests | ${payload.summary.source_evidence_requests} |
| progression groups | ${payload.summary.progression_groups} |
| existing source rows | ${payload.summary.existing_source_rows} |
| target missing-grade standards | ${payload.summary.target_missing_grade_standards} |
| requests with missing target-standard gap | ${payload.summary.requests_with_missing_target_standard_gap} |
| missing requests | ${payload.summary.missing_requests} |
| extra requests | ${payload.summary.extra_requests} |

## Missing Grade Bands

| grade band | requests |
| --- | ---: |
${countRows(payload.summary.by_missing_grade_band)}

## Subjects

| subject | requests |
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
  const batch = errors.length ? { source_evidence_request_items: [] } : readJson(args.batch)
  const worklist = errors.length ? { action_work_items: [] } : readJson(args.worklist)
  const triage = errors.length ? { group_review_decisions: [] } : readJson(args.triageDecisions)
  const anchorBatch = errors.length ? { anchor_review_items: [] } : readJson(args.anchorBatch)
  if (!errors.length) validateTopLevel(batch, worklist, triage, anchorBatch, args, errors)

  const expectedRows = expectedRequestRows(worklist, args)
  const expectedByRequest = new Map()
  for (const row of expectedRows) {
    if (!row.request.evidence_request_id) errors.push(`${row.workItem.progression_group_id} request missing evidence_request_id`)
    else if (expectedByRequest.has(row.request.evidence_request_id)) errors.push(`duplicate evidence request id: ${row.request.evidence_request_id}`)
    else expectedByRequest.set(row.request.evidence_request_id, { ...row, seen: false })
  }
  const subjectSlugs = sorted(expectedRows.map(row => row.workItem.subject_slug))
  const indexes = {
    anchorItemById: mapBy(anchorBatch.anchor_review_items || [], 'anchor_review_item_id', errors, 'anchor batch'),
    standards: buildStandardIndexes(args.standardsRoot, subjectSlugs, errors),
    triageByGroup: mapBy(triage.group_review_decisions || [], 'progression_group_id', errors, 'triage decisions')
  }

  const items = batch.source_evidence_request_items || []
  const stats = {
    by_anchor_type: {},
    by_existing_grade_band: {},
    by_missing_grade_band: {},
    by_priority_tier: {},
    by_subject: {},
    existing_source_rows: 0,
    expected_source_evidence_requests: expectedRows.length,
    extra_requests: 0,
    missing_requests: 0,
    progression_groups: sorted(items.map(item => item.progression_group_id)).length,
    requests_with_missing_target_standard_gap: 0,
    source_evidence_requests: items.length,
    target_missing_grade_standards: 0
  }

  const seenItemIds = new Set()
  for (const item of items) {
    if (seenItemIds.has(item.source_evidence_request_item_id)) {
      errors.push(`duplicate source_evidence_request_item_id: ${item.source_evidence_request_item_id}`)
    }
    seenItemIds.add(item.source_evidence_request_item_id)
    auditItem(item, expectedByRequest, indexes, errors, stats)
  }
  for (const [requestId, row] of expectedByRequest.entries()) {
    if (!row.seen) {
      stats.missing_requests += 1
      errors.push(`${requestId} missing from source evidence batch`)
    }
  }
  for (const item of items) {
    if (!expectedByRequest.has(item.source_anchor_evidence_request_id)) stats.extra_requests += 1
  }
  if (args.requireRequests && !expectedRows.length) errors.push('requireRequests is set but no expected source evidence requests were selected')
  if (args.requireRequests && !items.length) errors.push('requireRequests is set but batch has no source_evidence_request_items')
  auditSummary(batch, stats, errors)

  return {
    batch: args.batch,
    errors,
    generated_at: new Date().toISOString(),
    require_requests: args.requireRequests,
    selection: {
      max_rank: args.maxRank === Number.POSITIVE_INFINITY ? 'all' : args.maxRank,
      min_rank: args.minRank,
      reviewer_decision: EVIDENCE_REVIEW_DECISION,
      subjects: args.subjects || ['all'],
      work_path: EVIDENCE_WORK_PATH
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
