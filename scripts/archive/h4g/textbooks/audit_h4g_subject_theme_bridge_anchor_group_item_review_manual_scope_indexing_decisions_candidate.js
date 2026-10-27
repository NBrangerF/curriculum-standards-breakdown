#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_PARENT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe_audit.md'

const CANDIDATE_DECISION = 'needs_textbook_unit_indexing'
const CANDIDATE_STATUS = 'manual_scope_indexing_item_candidate_reviewed'
const PARENT_CANDIDATE_DECISION = 'missing_grade_units_indexed_for_later_source_review'
const PARENT_CANDIDATE_STATUS = 'manual_scope_indexing_candidate_reviewed'
const ALLOWED_CHANGED_ROW_FIELDS = new Set([
  'decision_note',
  'decision_status',
  'manual_scope_indexing_item_review_candidate_policy',
  'manual_scope_indexing_item_review_decision_candidate',
  'manual_scope_indexing_item_review_evidence',
  'required_confirmations',
  'reviewed_at',
  'reviewed_by',
  'reviewer_decision',
  'source_downstream_parent_decision_ids',
  'source_downstream_parent_decisions_candidate'
])

function parseArgs(argv) {
  const args = {
    candidate: DEFAULT_CANDIDATE,
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    parentCandidate: DEFAULT_PARENT_CANDIDATE,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--parent-candidate') args.parentCandidate = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate.js \\
  --candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --parent-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the manual-scope item-review decisions candidate. It ensures only
item-review rows whose all missing target standards are covered by parent
manual-scope unit-indexing candidates changed, and no public/matcher/publication
capability was introduced.`)
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

function validateSourceDecisions(decisions, args, errors) {
  if (decisions.valid !== true) errors.push('source item decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_decisions_template') {
    errors.push('source item decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_decisions_template') {
    errors.push('source item decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_decisions_template')
  }
  validatePolicy('source item decisions', decisions, errors)
  if (!Array.isArray(decisions.item_review_decisions)) {
    errors.push('source item decisions item_review_decisions must be an array')
  }
  if (args.requireItems && !(decisions.item_review_decisions || []).length) {
    errors.push('requireItems is set but source item decisions has no rows')
  }
}

function validateParentCandidate(parentCandidate, args, errors) {
  if (parentCandidate.valid !== true) errors.push('parent candidate valid must be true')
  if (parentCandidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('parent candidate purpose should preserve downstream decisions template purpose')
  }
  if (parentCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate') {
    errors.push('parent candidate candidate_purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate')
  }
  if (parentCandidate.review_only !== true) errors.push('parent candidate review_only must be true')
  if (parentCandidate.publication_candidate !== false) errors.push('parent candidate publication_candidate must be false')
  validatePolicy('parent candidate', parentCandidate, errors)
  if (!Array.isArray(parentCandidate.downstream_decisions)) {
    errors.push('parent candidate downstream_decisions must be an array')
  }
}

function validateCandidateTopLevel(candidate, args, errors) {
  if (candidate.valid !== true) errors.push('candidate valid must be true')
  if ((candidate.errors || []).length) errors.push('candidate errors must be empty')
  if (candidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_decisions_template') {
    errors.push('candidate purpose should preserve item decisions template purpose')
  }
  if (candidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate') {
    errors.push('candidate candidate_purpose must be h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate')
  }
  if (candidate.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_decisions_template') {
    errors.push('candidate data_scope must preserve item decisions data_scope')
  }
  if (candidate.source_decisions_template !== args.decisions) errors.push('candidate source_decisions_template must match audit arg')
  if (candidate.source_downstream_parent_decisions_candidate !== args.parentCandidate) {
    errors.push('candidate source_downstream_parent_decisions_candidate must match audit arg')
  }
  if (candidate.review_only !== true) errors.push('candidate review_only must be true')
  if (candidate.publication_candidate !== false) errors.push('candidate publication_candidate must be false')
  validatePolicy('candidate', candidate, errors)
  const policy = candidate.manual_scope_indexing_item_review_candidate_policy || {}
  for (const key of [
    'item_review_decision_is_not_approval',
    'manual_scope_item_review_candidate_is_not_bridge_approval',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_later_source_anchor_review',
    'source_decision_must_be_edited_separately'
  ]) {
    if (policy[key] !== true) errors.push(`candidate manual_scope_indexing_item_review_candidate_policy.${key} must be true`)
  }
  validatePolicy('candidate manual_scope_indexing_item_review_candidate_policy', policy, errors)
  if (!Array.isArray(candidate.item_review_decisions)) {
    errors.push('candidate item_review_decisions must be an array')
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

function targetKey(gradeBand, code) {
  return `${gradeBand || ''}|${code || ''}`
}

function itemMissingTargets(row) {
  return (row.target_missing_grade_standards || []).map(target => ({
    code: target.code || target.standard_code || target.target_standard_code || '',
    grade_band: target.grade_band || target.target_grade_band || target.missing_grade_band || ''
  })).filter(target => target.code && target.grade_band)
}

function itemMissingTargetKeys(row) {
  return sorted(itemMissingTargets(row).map(target => targetKey(target.grade_band, target.code)))
}

function parentCandidatesByItemDecision(parentCandidate) {
  const out = new Map()
  for (const row of parentCandidate.downstream_decisions || []) {
    if (row.manual_scope_indexing_parent_decision_candidate !== true) continue
    if (row.reviewer_decision !== PARENT_CANDIDATE_DECISION) continue
    if (row.decision_status !== PARENT_CANDIDATE_STATUS) continue
    const id = row.parent_decision_id || ''
    if (!id) continue
    if (!out.has(id)) out.set(id, [])
    out.get(id).push(row)
  }
  for (const rows of out.values()) {
    rows.sort((a, b) => String(a.grade_band || '').localeCompare(String(b.grade_band || '')) ||
      String(a.target_standard_code || '').localeCompare(String(b.target_standard_code || '')) ||
      String(a.decision_id || '').localeCompare(String(b.decision_id || '')))
  }
  return out
}

function validateParentRowsForItem(base, parentRows, errors) {
  const prefix = base.decision_id || '(missing item decision)'
  const missingKeys = itemMissingTargetKeys(base)
  if (!missingKeys.length) errors.push(`${prefix} must have target_missing_grade_standards`)
  const parentKeys = sorted(parentRows.map(parent => targetKey(parent.grade_band, parent.target_standard_code)))
  if (missingKeys.join('|') !== parentKeys.join('|')) {
    errors.push(`${prefix} parent manual-scope candidates must cover all missing target standards`)
  }
  for (const parent of parentRows || []) {
    const parentPrefix = parent.decision_id || prefix
    const evidence = parent.manual_scope_indexing_evidence || {}
    if (parent.parent_decision_id !== base.decision_id) errors.push(`${parentPrefix} parent_decision_id must match item decision`)
    if (parent.manual_scope_indexing_parent_decision_candidate !== true) {
      errors.push(`${parentPrefix} manual_scope_indexing_parent_decision_candidate must be true`)
    }
    if (parent.reviewer_decision !== PARENT_CANDIDATE_DECISION) {
      errors.push(`${parentPrefix} reviewer_decision must be ${PARENT_CANDIDATE_DECISION}`)
    }
    if (parent.decision_status !== PARENT_CANDIDATE_STATUS) {
      errors.push(`${parentPrefix} decision_status must be ${PARENT_CANDIDATE_STATUS}`)
    }
    if (parent.source_batch !== 'missing_grade_unit_indexing') errors.push(`${parentPrefix} source_batch must be missing_grade_unit_indexing`)
    if (parent.source_standard_code !== base.source_standard_code) errors.push(`${parentPrefix} source_standard_code mismatch`)
    if (parent.progression_group_id !== base.progression_group_id) errors.push(`${parentPrefix} progression_group_id mismatch`)
    if (!missingKeys.includes(targetKey(parent.grade_band, parent.target_standard_code))) {
      errors.push(`${parentPrefix} target grade/code is not a missing target standard`)
    }
    if (evidence.target_standard_code !== parent.target_standard_code) errors.push(`${parentPrefix} evidence target_standard_code mismatch`)
    if (evidence.target_grade_band !== parent.grade_band) errors.push(`${parentPrefix} evidence target_grade_band mismatch`)
    if (evidence.target_standard_exists_in_public !== true) errors.push(`${parentPrefix} target standard must exist in public inventory`)
    if (!(Number(evidence.same_grade_unit_index_candidate_count || 0) > 0)) {
      errors.push(`${parentPrefix} same_grade_unit_index_candidate_count must be positive`)
    }
    if (!(Number(evidence.same_grade_page_ready_candidate_count || 0) > 0)) {
      errors.push(`${parentPrefix} same_grade_page_ready_candidate_count must be positive`)
    }
    if (!Array.isArray(evidence.unit_candidate_preview) || !evidence.unit_candidate_preview.length) {
      errors.push(`${parentPrefix} unit_candidate_preview must be populated`)
    }
  }
}

function expectedCandidateMap(decisions, parentCandidate, errors, stats) {
  const itemByDecisionId = mapBy(decisions.item_review_decisions || [], 'decision_id', errors, 'source item decisions')
  const parentByItem = parentCandidatesByItemDecision(parentCandidate)
  const out = new Map()
  for (const [decisionId, parentRows] of parentByItem.entries()) {
    const row = itemByDecisionId.get(decisionId)
    if (!row) {
      errors.push(`${decisionId} parent candidate has no matching item-review decision`)
      continue
    }
    validateParentRowsForItem(row, parentRows, errors)
    out.set(decisionId, parentRows)
    for (const parent of parentRows) countInto(stats.by_candidate_target_grade_band, parent.grade_band)
  }
  return out
}

function validateUnchangedExceptAllowed(base, candidate, errors) {
  const prefix = candidate.decision_id || base.decision_id || '(missing item decision)'
  const keys = sorted([...Object.keys(base || {}), ...Object.keys(candidate || {})])
  for (const key of keys) {
    if (ALLOWED_CHANGED_ROW_FIELDS.has(key)) continue
    if (!sameJson(base[key], candidate[key])) errors.push(`${prefix} field ${key} changed unexpectedly`)
  }
}

function expectedConfirmations(base) {
  return {
    ...(base.required_confirmations || {}),
    existing_source_items_reviewed: true,
    missing_grade_target_standard_checked: true,
    missing_grade_textbook_units_indexed: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    source_anchor_evidence_same_grade: false,
    source_anchor_evidence_specific_to_standard: false,
    source_anchor_specificity_still_required: true
  }
}

function validateRowPolicy(row, errors) {
  const prefix = row.decision_id || '(missing item decision)'
  for (const key of [
    'writes_public_data',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (row[key] !== false) errors.push(`${prefix} ${key} must be false`)
  }
  for (const key of [
    'requested_public_write',
    'requested_official_text_change',
    'requested_direct_matcher_use',
    'requested_eligible_for_h4g_differentiation'
  ]) {
    if (row[key] !== false) errors.push(`${prefix} ${key} must be false`)
  }
  const policy = row.manual_scope_indexing_item_review_candidate_policy || {}
  for (const key of [
    'item_review_decision_is_not_approval',
    'manual_scope_item_review_candidate_is_not_bridge_approval',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_later_source_anchor_review',
    'source_decision_must_be_edited_separately'
  ]) {
    if (policy[key] !== true) errors.push(`${prefix} manual_scope_indexing_item_review_candidate_policy.${key} must be true`)
  }
  validatePolicy(`${prefix} manual_scope_indexing_item_review_candidate_policy`, policy, errors)
}

function validateEvidence(base, row, parentRows, args, errors) {
  const prefix = row.decision_id || base.decision_id || '(missing item decision)'
  const evidence = row.manual_scope_indexing_item_review_evidence || {}
  const parentIds = sorted(parentRows.map(parent => parent.decision_id))
  const parentActionIds = sorted(parentRows.map(parent => parent.source_downstream_action_decision_id))
  const parentItemIds = sorted(parentRows.map(parent => parent.manual_scope_indexing_evidence?.manual_scope_indexing_item_id))
  const parentGrades = sorted(parentRows.map(parent => parent.grade_band))
  const parentCodes = sorted(parentRows.map(parent => parent.target_standard_code))
  const unitCount = parentRows.reduce((sum, parent) => sum + Number(parent.manual_scope_indexing_evidence?.same_grade_unit_index_candidate_count || 0), 0)
  const pageReadyCount = parentRows.reduce((sum, parent) => sum + Number(parent.manual_scope_indexing_evidence?.same_grade_page_ready_candidate_count || 0), 0)
  if (evidence.all_missing_target_standards_have_same_grade_unit_candidates !== true) {
    errors.push(`${prefix} evidence.all_missing_target_standards_have_same_grade_unit_candidates must be true`)
  }
  if (!sameJson(evidence.covered_missing_target_standard_keys, itemMissingTargetKeys(base))) {
    errors.push(`${prefix} evidence.covered_missing_target_standard_keys must match source missing target standards`)
  }
  if (!sameJson(evidence.parent_downstream_decision_ids, parentIds)) {
    errors.push(`${prefix} evidence.parent_downstream_decision_ids must match parent candidate ids`)
  }
  if (!sameJson(evidence.parent_downstream_action_decision_ids, parentActionIds)) {
    errors.push(`${prefix} evidence.parent_downstream_action_decision_ids must match parent action ids`)
  }
  if (!sameJson(evidence.manual_scope_indexing_item_ids, parentItemIds)) {
    errors.push(`${prefix} evidence.manual_scope_indexing_item_ids must match parent manual-scope item ids`)
  }
  if (!sameJson(evidence.target_grade_bands, parentGrades)) {
    errors.push(`${prefix} evidence.target_grade_bands must match parent candidate grades`)
  }
  if (!sameJson(evidence.target_standard_codes, parentCodes)) {
    errors.push(`${prefix} evidence.target_standard_codes must match parent target codes`)
  }
  if (Number(evidence.same_grade_unit_index_candidate_count || 0) !== unitCount) {
    errors.push(`${prefix} evidence.same_grade_unit_index_candidate_count must match parent evidence`)
  }
  if (Number(evidence.same_grade_page_ready_candidate_count || 0) !== pageReadyCount) {
    errors.push(`${prefix} evidence.same_grade_page_ready_candidate_count must match parent evidence`)
  }
  if (evidence.source_item_review_decision_id !== base.decision_id) {
    errors.push(`${prefix} evidence.source_item_review_decision_id must match item decision`)
  }
  if (evidence.source_parent_decisions_candidate !== args.parentCandidate) {
    errors.push(`${prefix} evidence.source_parent_decisions_candidate must match audit arg`)
  }
  if (!Array.isArray(evidence.unit_candidate_preview) || !evidence.unit_candidate_preview.length) {
    errors.push(`${prefix} evidence.unit_candidate_preview must be populated`)
  }
}

function validateItemCandidate(base, row, parentRows, args, errors, stats) {
  const prefix = row.decision_id || base.decision_id || '(missing item decision)'
  validateUnchangedExceptAllowed(base, row, errors)
  if (base.reviewer_decision !== 'pending') errors.push(`${prefix} source item row must start pending`)
  if (base.decision_status !== 'pending_review') errors.push(`${prefix} source item row must start pending_review`)
  if (!(base.allowed_decisions || []).includes(CANDIDATE_DECISION)) {
    errors.push(`${prefix} allowed_decisions must include ${CANDIDATE_DECISION}`)
  }
  if (row.reviewer_decision !== CANDIDATE_DECISION) errors.push(`${prefix} reviewer_decision must be ${CANDIDATE_DECISION}`)
  if (row.decision_status !== CANDIDATE_STATUS) errors.push(`${prefix} decision_status must be ${CANDIDATE_STATUS}`)
  if (!row.reviewed_at) errors.push(`${prefix} reviewed_at is required`)
  if (!row.reviewed_by) errors.push(`${prefix} reviewed_by is required`)
  if (!row.decision_note) errors.push(`${prefix} decision_note is required`)
  if (row.manual_scope_indexing_item_review_decision_candidate !== true) {
    errors.push(`${prefix} manual_scope_indexing_item_review_decision_candidate must be true`)
  }
  if (row.source_downstream_parent_decisions_candidate !== args.parentCandidate) {
    errors.push(`${prefix} source_downstream_parent_decisions_candidate must match audit arg`)
  }
  const parentIds = sorted(parentRows.map(parent => parent.decision_id))
  if (!sameJson(row.source_downstream_parent_decision_ids, parentIds)) {
    errors.push(`${prefix} source_downstream_parent_decision_ids must match parent candidate ids`)
  }
  if (!sameJson(row.required_confirmations || {}, expectedConfirmations(base))) {
    errors.push(`${prefix} required_confirmations must only close manual-scope indexing confirmations`)
  }
  validateEvidence(base, row, parentRows, args, errors)
  validateRowPolicy(row, errors)
  stats.audited_item_review_candidate_decisions += 1
}

function summarize(candidateRows) {
  const stats = {
    audited_item_review_candidate_decisions: 0,
    by_candidate_target_grade_band: {},
    by_decision_type: {},
    by_reviewer_decision: {},
    by_subject: {},
    completed_item_review_decisions: 0,
    expected_item_review_candidate_decisions: 0,
    extra_candidate_rows: 0,
    item_review_decisions: candidateRows.length,
    manual_scope_indexing_item_review_candidate_decisions: 0,
    missing_candidate_rows: 0,
    pending_item_review_decisions: 0,
    target_missing_grade_standards: 0,
    target_standard_gap_decisions: 0
  }
  for (const row of candidateRows) {
    if (row.reviewer_decision === 'pending') stats.pending_item_review_decisions += 1
    else stats.completed_item_review_decisions += 1
    if (row.manual_scope_indexing_item_review_decision_candidate) {
      stats.manual_scope_indexing_item_review_candidate_decisions += 1
    }
    stats.target_missing_grade_standards += (row.target_missing_grade_standards || []).length
    if ((row.missing_target_standard_grade_bands || []).length) stats.target_standard_gap_decisions += 1
    countInto(stats.by_decision_type, row.decision_type)
    countInto(stats.by_reviewer_decision, row.reviewer_decision)
    countInto(stats.by_subject, row.subject_slug)
  }
  return stats
}

function validateSummary(candidate, stats, errors) {
  const summary = candidate.summary || {}
  const checks = [
    ['item_review_decisions', stats.item_review_decisions],
    ['manual_scope_indexing_item_review_candidate_decisions', stats.manual_scope_indexing_item_review_candidate_decisions],
    ['completed_item_review_decisions', stats.completed_item_review_decisions],
    ['pending_item_review_decisions', stats.pending_item_review_decisions],
    ['target_missing_grade_standards', stats.target_missing_grade_standards],
    ['target_standard_gap_decisions', stats.target_standard_gap_decisions]
  ]
  for (const [field, expected] of checks) {
    if (Number(summary[field] || 0) !== Number(expected || 0)) {
      errors.push(`candidate summary.${field} must be ${expected}`)
    }
  }
}

function markdownSummary(payload) {
  return `# H4G Manual Scope Indexing Item Review Decisions Candidate Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected item-review candidates | ${payload.summary.expected_item_review_candidate_decisions} |
| audited item-review candidates | ${payload.summary.audited_item_review_candidate_decisions} |
| candidate markers | ${payload.summary.manual_scope_indexing_item_review_candidate_decisions} |
| missing candidate rows | ${payload.summary.missing_candidate_rows} |
| extra candidate rows | ${payload.summary.extra_candidate_rows} |
| completed item review decisions | ${payload.summary.completed_item_review_decisions} |
| pending item review decisions | ${payload.summary.pending_item_review_decisions} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Reviewer Decisions

| reviewer decision | decisions |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Candidate Target Grades

| target grade | decisions |
| --- | ---: |
${countRows(payload.summary.by_candidate_target_grade_band)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['candidate', args.candidate],
    ['item decisions', args.decisions],
    ['parent candidate', args.parentCandidate]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const candidate = existsSync(args.candidate) ? readJson(args.candidate) : { item_review_decisions: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { item_review_decisions: [] }
  const parentCandidate = existsSync(args.parentCandidate) ? readJson(args.parentCandidate) : { downstream_decisions: [] }
  if (!errors.length) {
    validateSourceDecisions(decisions, args, errors)
    validateParentCandidate(parentCandidate, args, errors)
    validateCandidateTopLevel(candidate, args, errors)
  }

  const sourceByDecisionId = mapBy(decisions.item_review_decisions || [], 'decision_id', errors, 'source item decisions')
  const candidateByDecisionId = mapBy(candidate.item_review_decisions || [], 'decision_id', errors, 'candidate item decisions')
  const stats = summarize(candidate.item_review_decisions || [])
  const expectedByDecisionId = expectedCandidateMap(decisions, parentCandidate, errors, stats)
  stats.expected_item_review_candidate_decisions = expectedByDecisionId.size

  if ((candidate.item_review_decisions || []).length !== (decisions.item_review_decisions || []).length) {
    errors.push(`candidate rows ${(candidate.item_review_decisions || []).length} must match source rows ${(decisions.item_review_decisions || []).length}`)
  }

  for (const [decisionId, sourceRow] of sourceByDecisionId.entries()) {
    const candidateRow = candidateByDecisionId.get(decisionId)
    if (!candidateRow) {
      errors.push(`${decisionId} missing candidate row`)
      continue
    }
    const parentRows = expectedByDecisionId.get(decisionId)
    if (!parentRows) {
      if (candidateRow.manual_scope_indexing_item_review_decision_candidate === true) {
        stats.extra_candidate_rows += 1
        errors.push(`${decisionId} has manual-scope item-review candidate marker without complete parent candidate coverage`)
      } else if (!sameJson(sourceRow, candidateRow)) {
        stats.extra_candidate_rows += 1
        errors.push(`${decisionId} changed but is not backed by complete parent manual-scope candidates`)
      }
      continue
    }
    validateItemCandidate(sourceRow, candidateRow, parentRows, args, errors, stats)
  }

  for (const decisionId of candidateByDecisionId.keys()) {
    if (!sourceByDecisionId.has(decisionId)) {
      stats.extra_candidate_rows += 1
      errors.push(`${decisionId} unexpected candidate row`)
    }
  }
  for (const decisionId of expectedByDecisionId.keys()) {
    const row = candidateByDecisionId.get(decisionId)
    if (!row || row.manual_scope_indexing_item_review_decision_candidate !== true) {
      stats.missing_candidate_rows += 1
      errors.push(`${decisionId} missing item-review manual-scope indexing candidate marker`)
    }
  }
  if (args.requireItems && !stats.audited_item_review_candidate_decisions) {
    errors.push('requireItems is set but no item-review manual-scope candidates were audited')
  }
  if (stats.audited_item_review_candidate_decisions !== stats.expected_item_review_candidate_decisions) {
    errors.push(`audited item-review candidates ${stats.audited_item_review_candidate_decisions} must match expected ${stats.expected_item_review_candidate_decisions}`)
  }
  if (stats.manual_scope_indexing_item_review_candidate_decisions !== stats.expected_item_review_candidate_decisions) {
    errors.push(`candidate markers ${stats.manual_scope_indexing_item_review_candidate_decisions} must match expected ${stats.expected_item_review_candidate_decisions}`)
  }
  validateSummary(candidate, stats, errors)

  return {
    candidate: args.candidate,
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    parent_candidate: args.parentCandidate,
    publication_ready: false,
    require_items: args.requireItems,
    summary: stats,
    valid: errors.length === 0,
    writes_public_data: false
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
