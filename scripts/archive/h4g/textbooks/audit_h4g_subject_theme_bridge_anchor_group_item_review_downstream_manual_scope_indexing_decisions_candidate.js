#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe_audit.md'

const CANDIDATE_DECISION = 'missing_grade_units_indexed_for_later_source_review'
const CANDIDATE_STATUS = 'inventory_candidate_reviewed'
const ALLOWED_CHANGED_ROW_FIELDS = new Set([
  'decision_note',
  'decision_status',
  'manual_scope_indexing_candidate_policy',
  'manual_scope_indexing_decision_candidate',
  'manual_scope_indexing_evidence',
  'required_confirmations',
  'reviewed_at',
  'reviewed_by',
  'reviewer_decision'
])

function parseArgs(argv) {
  const args = {
    candidate: DEFAULT_CANDIDATE,
    decisions: DEFAULT_DECISIONS,
    inventory: DEFAULT_INVENTORY,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--inventory') args.inventory = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate.js \\
  --candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json \\
  --inventory generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the manual-scope/indexing downstream action decisions candidate. The
audit ensures only inventory-supported manual-scope rows changed, all other
rows remain identical to the source template, and no public/matcher/publication
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
  if (decisions.valid !== true) errors.push('source decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('source decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('source decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template')
  }
  validatePolicy('source decisions', decisions, errors)
  if (!Array.isArray(decisions.downstream_action_decisions)) {
    errors.push('source decisions downstream_action_decisions must be an array')
  }
  if (args.requireItems && !(decisions.downstream_action_decisions || []).length) {
    errors.push('requireItems is set but source decisions has no rows')
  }
}

function validateInventory(inventory, args, errors) {
  if (inventory.valid !== true) errors.push('inventory valid must be true')
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory') {
    errors.push('inventory purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory')
  }
  validatePolicy('inventory', inventory, errors)
  if (!Array.isArray(inventory.inventory_items)) errors.push('inventory inventory_items must be an array')
  if (args.requireItems && !(inventory.inventory_items || []).length) {
    errors.push('requireItems is set but inventory has no rows')
  }
}

function validateCandidateTopLevel(candidate, args, errors) {
  if (candidate.valid !== true) errors.push('candidate valid must be true')
  if (candidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('candidate purpose should preserve source action decisions template purpose')
  }
  if (candidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate') {
    errors.push('candidate candidate_purpose mismatch')
  }
  if (candidate.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('candidate data_scope must preserve source action decisions data_scope')
  }
  if (candidate.source_decisions_template !== args.decisions) errors.push('candidate source_decisions_template must match audit arg')
  if (candidate.source_manual_scope_indexing_inventory !== args.inventory) {
    errors.push('candidate source_manual_scope_indexing_inventory must match audit arg')
  }
  if (candidate.review_only !== true) errors.push('candidate review_only must be true')
  if (candidate.publication_candidate !== false) errors.push('candidate publication_candidate must be false')
  validatePolicy('candidate', candidate, errors)
  const policy = candidate.manual_scope_indexing_candidate_policy || {}
  for (const key of [
    'downstream_action_review_decision_is_not_approval',
    'inventory_candidate_is_not_publication_approval',
    'item_level_review_still_required',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_later_source_anchor_review'
  ]) {
    if (policy[key] !== true) errors.push(`candidate policy ${key} must be true`)
  }
  validatePolicy('candidate policy', policy, errors)
  if (!Array.isArray(candidate.downstream_action_decisions)) {
    errors.push('candidate downstream_action_decisions must be an array')
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

function isCandidateInventoryItem(item) {
  const profile = item.manual_scope_indexing_profile || {}
  return item.manual_scope_indexing_bucket === 'manual_scope_indexing_has_page_ready_candidates_needs_reviewer_confirmation' &&
    item.recommended_disposition === 'manual_scope_confirmation_required_before_decision_candidate' &&
    item.downstream_action_reviewer_decision === 'pending' &&
    item.target_standard_code &&
    item.target_standard_context?.code === item.target_standard_code &&
    profile.target_standard_exists_in_public === true &&
    profile.has_same_grade_unit_index_candidates === true &&
    profile.has_page_ready_same_grade_unit_candidates === true &&
    Number(profile.same_grade_unit_index_candidate_count || 0) > 0 &&
    Number(profile.same_grade_page_ready_candidate_count || 0) > 0
}

function expectedConfirmations(base) {
  return {
    ...(base.required_confirmations || {}),
    item_level_decision_still_required: true,
    missing_grade_textbook_units_indexed: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    same_grade_scope_checked: true,
    source_anchor_specificity_still_required: true,
    target_missing_grade_standard_checked: true
  }
}

function expectedEvidence(base, item, inventoryPath) {
  const profile = item.manual_scope_indexing_profile || {}
  return {
    existing_grade_bands: item.existing_grade_bands || [],
    inventory: inventoryPath,
    inventory_item_id: item.inventory_item_id || '',
    manual_scope_indexing_item_id: item.manual_scope_indexing_item_id || '',
    same_grade_page_ready_candidate_count: profile.same_grade_page_ready_candidate_count || 0,
    same_grade_unit_index_candidate_count: profile.same_grade_unit_index_candidate_count || 0,
    source_decision_id: base.decision_id || '',
    target_grade_band: item.target_grade_band || '',
    target_progression_role: item.target_standard_context?.progression_role || '',
    target_standard_code: item.target_standard_code || '',
    target_standard_exists_in_public: profile.target_standard_exists_in_public === true
  }
}

function validateUnchangedExceptAllowed(base, candidate, errors) {
  const prefix = candidate.decision_id || base.decision_id || '(missing decision id)'
  const keys = sorted([...Object.keys(base || {}), ...Object.keys(candidate || {})])
  for (const key of keys) {
    if (ALLOWED_CHANGED_ROW_FIELDS.has(key)) continue
    if (!sameJson(base[key], candidate[key])) errors.push(`${prefix} changed forbidden field ${key}`)
  }
}

function validateCandidateRow(base, candidate, item, args, errors, stats) {
  const prefix = candidate.decision_id || base.decision_id || '(missing decision id)'
  validateUnchangedExceptAllowed(base, candidate, errors)
  if (base.source_downstream_action_batch !== 'manual_scope_indexing') {
    errors.push(`${prefix} source_downstream_action_batch must be manual_scope_indexing`)
  }
  if (!(base.allowed_decisions || []).includes(CANDIDATE_DECISION)) {
    errors.push(`${prefix} base allowed_decisions must include ${CANDIDATE_DECISION}`)
  }
  if (candidate.reviewer_decision !== CANDIDATE_DECISION) errors.push(`${prefix} reviewer_decision mismatch`)
  if (candidate.decision_status !== CANDIDATE_STATUS) errors.push(`${prefix} decision_status mismatch`)
  if (!candidate.reviewed_at) errors.push(`${prefix} reviewed_at is required`)
  if (!candidate.reviewed_by) errors.push(`${prefix} reviewed_by is required`)
  if (candidate.manual_scope_indexing_decision_candidate !== true) {
    errors.push(`${prefix} manual_scope_indexing_decision_candidate must be true`)
  }
  if (!sameJson(candidate.required_confirmations, expectedConfirmations(base))) {
    errors.push(`${prefix} required_confirmations mismatch`)
  }
  const evidence = candidate.manual_scope_indexing_evidence || {}
  const expected = expectedEvidence(base, item, args.inventory)
  for (const [key, value] of Object.entries(expected)) {
    if (!sameJson(evidence[key], value)) errors.push(`${prefix} manual_scope_indexing_evidence.${key} mismatch`)
  }
  if (!Array.isArray(evidence.unit_candidate_preview) || !evidence.unit_candidate_preview.length) {
    errors.push(`${prefix} manual_scope_indexing_evidence.unit_candidate_preview must be populated`)
  }
  const rowPolicy = candidate.manual_scope_indexing_candidate_policy || {}
  for (const key of [
    'downstream_action_review_decision_is_not_approval',
    'inventory_candidate_is_not_publication_approval',
    'item_level_review_still_required',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_later_source_anchor_review'
  ]) {
    if (rowPolicy[key] !== true) errors.push(`${prefix} manual_scope_indexing_candidate_policy.${key} must be true`)
  }
  validatePolicy(`${prefix} manual_scope_indexing_candidate_policy`, rowPolicy, errors)

  stats.candidate_decisions += 1
  countInto(stats.by_subject, candidate.subject_slug)
  countInto(stats.by_target_grade_band, candidate.target_grade_band)
  countInto(stats.by_target_standard_code, candidate.target_standard_code)
}

function validateUnchangedRow(base, candidate, errors) {
  const prefix = candidate?.decision_id || base?.decision_id || '(missing decision id)'
  if (!sameJson(base, candidate)) errors.push(`${prefix} non-candidate row must remain unchanged`)
}

function markdownSummary(payload) {
  return `# H4G Downstream Manual Scope Indexing Decisions Candidate Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| downstream action decisions | ${payload.summary.downstream_action_decisions} |
| expected candidate decisions | ${payload.summary.expected_candidate_decisions} |
| audited candidate decisions | ${payload.summary.candidate_decisions} |
| pending action decisions | ${payload.summary.pending_action_decisions} |
| changed non-candidate decisions | ${payload.summary.changed_non_candidate_decisions} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Target Grades

| target grade | rows |
| --- | ---: |
${countRows(payload.summary.by_target_grade_band)}

## Subjects

| subject | rows |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['candidate', args.candidate],
    ['decisions', args.decisions],
    ['manual scope indexing inventory', args.inventory]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const candidate = existsSync(args.candidate) ? readJson(args.candidate) : { downstream_action_decisions: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { downstream_action_decisions: [] }
  const inventory = existsSync(args.inventory) ? readJson(args.inventory) : { inventory_items: [] }
  if (!errors.length) {
    validateSourceDecisions(decisions, args, errors)
    validateInventory(inventory, args, errors)
    validateCandidateTopLevel(candidate, args, errors)
  }

  const sourceById = mapBy(decisions.downstream_action_decisions || [], 'decision_id', errors, 'source decisions')
  const candidateById = mapBy(candidate.downstream_action_decisions || [], 'decision_id', errors, 'candidate decisions')
  const decisionBySourceActionItem = mapBy(decisions.downstream_action_decisions || [], 'source_downstream_action_item_id', errors, 'source decisions')
  const expectedCandidateItems = []
  const expectedCandidateByDecisionId = new Map()
  for (const item of inventory.inventory_items || []) {
    if (!isCandidateInventoryItem(item)) continue
    const base = decisionBySourceActionItem.get(item.manual_scope_indexing_item_id)
    if (!base) {
      errors.push(`${item.manual_scope_indexing_item_id || item.inventory_item_id} missing source decision`)
      continue
    }
    expectedCandidateItems.push(item)
    expectedCandidateByDecisionId.set(base.decision_id, item)
  }

  const stats = {
    by_subject: {},
    by_target_grade_band: {},
    by_target_standard_code: {},
    candidate_decisions: 0,
    changed_non_candidate_decisions: 0,
    downstream_action_decisions: (candidate.downstream_action_decisions || []).length,
    expected_candidate_decisions: expectedCandidateItems.length,
    pending_action_decisions: (candidate.downstream_action_decisions || []).filter(row => row.reviewer_decision === 'pending').length
  }

  for (const [decisionId, base] of sourceById.entries()) {
    const row = candidateById.get(decisionId)
    if (!row) {
      errors.push(`${decisionId} missing candidate row`)
      continue
    }
    const expectedItem = expectedCandidateByDecisionId.get(decisionId)
    if (expectedItem) validateCandidateRow(base, row, expectedItem, args, errors, stats)
    else {
      if (!sameJson(base, row)) stats.changed_non_candidate_decisions += 1
      validateUnchangedRow(base, row, errors)
    }
  }
  for (const decisionId of candidateById.keys()) {
    if (!sourceById.has(decisionId)) errors.push(`${decisionId} unexpected candidate row`)
  }
  if (args.requireItems && !stats.candidate_decisions) errors.push('requireItems is set but no candidate decisions were audited')
  if (stats.candidate_decisions !== stats.expected_candidate_decisions) {
    errors.push(`candidate decisions ${stats.candidate_decisions} must match expected ${stats.expected_candidate_decisions}`)
  }
  if (stats.downstream_action_decisions !== (decisions.downstream_action_decisions || []).length) {
    errors.push('candidate downstream_action_decisions count must match source decisions')
  }

  const summary = candidate.summary || {}
  for (const key of [
    'candidate_decisions',
    'downstream_action_decisions',
    'pending_action_decisions'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`candidate summary.${key} mismatch`)
  }
  for (const key of ['by_subject', 'by_target_grade_band', 'by_target_standard_code']) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`candidate summary.${key} mismatch`)
  }

  return {
    candidate: args.candidate,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    inventory: args.inventory,
    matcher_ready: false,
    publication_ready: false,
    require_items: args.requireItems,
    source_decisions: args.decisions,
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
  console.log(JSON.stringify({
    out: args.out,
    summary: payload.summary,
    valid: payload.valid
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
