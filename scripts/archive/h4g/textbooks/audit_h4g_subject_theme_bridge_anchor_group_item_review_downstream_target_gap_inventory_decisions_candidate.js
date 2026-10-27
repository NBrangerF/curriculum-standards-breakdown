#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_INVENTORY_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe_audit.md'

const CANDIDATE_DECISION = 'target_standard_gap_confirmed'
const CANDIDATE_STATUS = 'inventory_candidate_reviewed'
const ALLOWED_CHANGED_ROW_FIELDS = new Set([
  'decision_note',
  'decision_status',
  'required_confirmations',
  'reviewed_at',
  'reviewed_by',
  'reviewer_decision',
  'target_gap_inventory_candidate_policy',
  'target_gap_inventory_decision_candidate',
  'target_gap_inventory_evidence'
])

function parseArgs(argv) {
  const args = {
    candidate: DEFAULT_CANDIDATE,
    decisions: DEFAULT_DECISIONS,
    inventoryAudit: DEFAULT_INVENTORY_AUDIT,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--inventory-audit') args.inventoryAudit = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate.js \\
  --candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json \\
  --inventory-audit generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the target-gap inventory downstream action decisions candidate. The audit
ensures only confirmed-absent target-gap rows changed, all other rows remain
identical to the source template, and no public/matcher/publication capability
was introduced.`)
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

function validateDecisions(decisions, args, errors) {
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

function validateInventoryAudit(inventory, args, errors) {
  if (inventory.valid !== true) errors.push('inventory audit valid must be true')
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_audit') {
    errors.push('inventory audit purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_audit')
  }
  if (inventory.inventory_evidence_only !== true) errors.push('inventory audit inventory_evidence_only must be true')
  validatePolicy('inventory audit', inventory, errors)
  if (!Array.isArray(inventory.inventory_items)) errors.push('inventory audit inventory_items must be an array')
  if (args.requireItems && !(inventory.inventory_items || []).length) {
    errors.push('requireItems is set but inventory audit has no items')
  }
}

function validateCandidateTopLevel(candidate, args, errors) {
  if (candidate.valid !== true) errors.push('candidate valid must be true')
  if (candidate.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('candidate purpose should preserve source action decisions template purpose')
  }
  if (candidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate') {
    errors.push('candidate candidate_purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate')
  }
  if (candidate.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('candidate data_scope must preserve source action decisions data_scope')
  }
  if (candidate.source_decisions_template !== args.decisions) errors.push('candidate source_decisions_template must match audit arg')
  if (candidate.source_target_standard_gap_inventory_audit !== args.inventoryAudit) {
    errors.push('candidate source_target_standard_gap_inventory_audit must match audit arg')
  }
  if (candidate.review_only !== true) errors.push('candidate review_only must be true')
  if (candidate.publication_candidate !== false) errors.push('candidate publication_candidate must be false')
  validatePolicy('candidate', candidate, errors)
  const policy = candidate.target_gap_inventory_candidate_policy || {}
  for (const key of [
    'downstream_action_review_decision_is_not_approval',
    'inventory_candidate_is_not_publication_approval',
    'item_level_review_still_required',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
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

function isConfirmedAbsent(item) {
  return item.inventory_status === 'confirmed_absent_in_public_inventory' &&
    item.recommended_reviewer_decision === CANDIDATE_DECISION &&
    item.exact_target_code_exists === false &&
    item.target_grade_same_legacy_code_records_count === 0 &&
    item.target_grade_same_progression_group_records_count === 0
}

function expectedConfirmations(base) {
  return {
    ...(base.required_confirmations || {}),
    item_level_decision_still_required: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    progression_group_scope_checked: true,
    source_anchor_evidence_search_deferred: true,
    target_missing_grade_standard_absent_checked: true
  }
}

function validateUnchangedExceptAllowed(base, candidate, errors) {
  const prefix = candidate.decision_id || base.decision_id || '(missing decision id)'
  const keys = sorted([...Object.keys(base || {}), ...Object.keys(candidate || {})])
  for (const key of keys) {
    if (ALLOWED_CHANGED_ROW_FIELDS.has(key)) continue
    if (!sameJson(base[key], candidate[key])) errors.push(`${prefix} field ${key} changed unexpectedly`)
  }
}

function validateRowPolicy(row, errors) {
  const prefix = row.decision_id || '(missing decision id)'
  validatePolicy(prefix, row, errors)
  for (const key of [
    'requested_public_write',
    'requested_official_text_change',
    'requested_direct_matcher_use',
    'requested_eligible_for_h4g_differentiation'
  ]) {
    if (row[key] !== false) errors.push(`${prefix} ${key} must be false`)
  }
  const policy = row.target_gap_inventory_candidate_policy || {}
  for (const key of [
    'downstream_action_review_decision_is_not_approval',
    'inventory_candidate_is_not_publication_approval',
    'item_level_review_still_required',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${prefix} target_gap_inventory_candidate_policy.${key} must be true`)
  }
  validatePolicy(`${prefix} target_gap_inventory_candidate_policy`, policy, errors)
}

function validateInventoryEvidence(base, row, item, args, errors) {
  const prefix = row.decision_id || item.batch_item_id || '(missing decision id)'
  const evidence = row.target_gap_inventory_evidence || {}
  const checks = [
    ['batch_item_id', evidence.batch_item_id, item.batch_item_id],
    ['exact_target_code', evidence.exact_target_code, item.exact_target_code],
    ['inventory_audit', evidence.inventory_audit, args.inventoryAudit],
    ['inventory_status', evidence.inventory_status, item.inventory_status],
    ['missing_grade_band', evidence.missing_grade_band, item.missing_grade_band],
    ['progression_group_id', evidence.progression_group_id, item.progression_group_id],
    ['source_decision_id', evidence.source_decision_id, base.decision_id],
    ['source_standard_code', evidence.source_standard_code, item.source_standard_code],
    ['target_grade_same_legacy_code_records_count', evidence.target_grade_same_legacy_code_records_count, item.target_grade_same_legacy_code_records_count],
    ['target_grade_same_progression_group_records_count', evidence.target_grade_same_progression_group_records_count, item.target_grade_same_progression_group_records_count]
  ]
  for (const [field, actual, expected] of checks) {
    if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} evidence.${field} must match inventory item`)
  }
  if (!sameJson(evidence.public_same_group_grade_bands || [], item.public_same_group_grade_bands || [])) {
    errors.push(`${prefix} evidence.public_same_group_grade_bands must match inventory item`)
  }
}

function validateCandidateDecision(base, row, item, args, errors, stats) {
  const prefix = row.decision_id || item.batch_item_id || '(missing decision id)'
  validateUnchangedExceptAllowed(base, row, errors)
  if (base.reviewer_decision !== 'pending') errors.push(`${prefix} source template row must start pending`)
  if (base.decision_status !== 'pending_review') errors.push(`${prefix} source template row must start pending_review`)
  if (base.source_downstream_action_batch !== 'target_standard_gap_resolution') {
    errors.push(`${prefix} source row must be target_standard_gap_resolution`)
  }
  if (base.source_downstream_action_item_id !== item.batch_item_id) {
    errors.push(`${prefix} source_downstream_action_item_id must match inventory batch_item_id`)
  }
  if (base.source_standard_code !== item.source_standard_code) errors.push(`${prefix} source_standard_code must match inventory item`)
  if (base.progression_group_id !== item.progression_group_id) errors.push(`${prefix} progression_group_id must match inventory item`)
  if (base.target_grade_band !== item.missing_grade_band) errors.push(`${prefix} target_grade_band must match inventory missing_grade_band`)
  if (!(base.allowed_decisions || []).includes(CANDIDATE_DECISION)) {
    errors.push(`${prefix} source allowed_decisions must include ${CANDIDATE_DECISION}`)
  }
  if (row.reviewer_decision !== CANDIDATE_DECISION) errors.push(`${prefix} reviewer_decision must be ${CANDIDATE_DECISION}`)
  if (row.decision_status !== CANDIDATE_STATUS) errors.push(`${prefix} decision_status must be ${CANDIDATE_STATUS}`)
  if (!row.reviewed_at) errors.push(`${prefix} reviewed_at is required`)
  if (!row.reviewed_by) errors.push(`${prefix} reviewed_by is required`)
  if (!row.decision_note) errors.push(`${prefix} decision_note is required`)
  if (row.target_gap_inventory_decision_candidate !== true) errors.push(`${prefix} target_gap_inventory_decision_candidate must be true`)
  if (!sameJson(row.required_confirmations || {}, expectedConfirmations(base))) {
    errors.push(`${prefix} required_confirmations must only close target gap inventory confirmations`)
  }
  validateInventoryEvidence(base, row, item, args, errors)
  validateRowPolicy(row, errors)
  stats.inventory_candidate_decisions += 1
  countInto(stats.by_candidate_target_grade_band, row.target_grade_band || row.grade_band)
}

function summarize(candidateRows) {
  const stats = {
    by_candidate_target_grade_band: {},
    by_reviewer_decision: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    changed_candidate_rows: 0,
    downstream_action_decisions: candidateRows.length,
    expected_inventory_candidate_decisions: 0,
    extra_candidate_rows: 0,
    inventory_candidate_decisions: 0,
    missing_candidate_rows: 0,
    pending_action_decisions: 0
  }
  for (const row of candidateRows) {
    if (row.reviewer_decision === 'pending') stats.pending_action_decisions += 1
    if (row.target_gap_inventory_decision_candidate) stats.changed_candidate_rows += 1
    countInto(stats.by_reviewer_decision, row.reviewer_decision)
    countInto(stats.by_source_downstream_action_batch, row.source_downstream_action_batch)
    countInto(stats.by_subject, row.subject_slug)
  }
  return stats
}

function validateSummary(candidate, stats, errors) {
  const summary = candidate.summary || {}
  const checks = [
    ['downstream_action_decisions', stats.downstream_action_decisions],
    ['inventory_candidate_decisions', stats.inventory_candidate_decisions],
    ['pending_action_decisions', stats.pending_action_decisions]
  ]
  for (const [field, expected] of checks) {
    if (Number(summary[field] || 0) !== Number(expected || 0)) {
      errors.push(`candidate summary.${field} must be ${expected}`)
    }
  }
}

function markdownSummary(payload) {
  return `# H4G Target Gap Inventory Decisions Candidate Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected inventory candidate decisions | ${payload.summary.expected_inventory_candidate_decisions} |
| inventory candidate decisions | ${payload.summary.inventory_candidate_decisions} |
| missing candidate rows | ${payload.summary.missing_candidate_rows} |
| extra candidate rows | ${payload.summary.extra_candidate_rows} |
| pending action decisions | ${payload.summary.pending_action_decisions} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Reviewer Decisions

| reviewer decision | decisions |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Source Action Batches

| source action batch | decisions |
| --- | ---: |
${countRows(payload.summary.by_source_downstream_action_batch)}

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
    ['decisions', args.decisions],
    ['inventory audit', args.inventoryAudit]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const candidate = existsSync(args.candidate) ? readJson(args.candidate) : { downstream_action_decisions: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { downstream_action_decisions: [] }
  const inventory = existsSync(args.inventoryAudit) ? readJson(args.inventoryAudit) : { inventory_items: [] }
  if (!errors.length) {
    validateDecisions(decisions, args, errors)
    validateInventoryAudit(inventory, args, errors)
    validateCandidateTopLevel(candidate, args, errors)
  }

  const sourceByDecisionId = mapBy(decisions.downstream_action_decisions || [], 'decision_id', errors, 'source decisions')
  const candidateByDecisionId = mapBy(candidate.downstream_action_decisions || [], 'decision_id', errors, 'candidate decisions')
  const inventoryByBatchItem = mapBy(inventory.inventory_items || [], 'batch_item_id', errors, 'inventory')
  const expectedCandidateDecisionIds = new Set()
  for (const item of inventory.inventory_items || []) {
    if (!isConfirmedAbsent(item)) errors.push(`${item.batch_item_id || item.source_standard_code || '(missing inventory item)'} inventory item must be confirmed absent`)
    const sourceRow = [...sourceByDecisionId.values()].find(row => row.source_downstream_action_item_id === item.batch_item_id)
    if (!sourceRow) {
      errors.push(`${item.batch_item_id} missing source action decision row`)
      continue
    }
    expectedCandidateDecisionIds.add(sourceRow.decision_id)
  }

  const stats = summarize(candidate.downstream_action_decisions || [])
  stats.expected_inventory_candidate_decisions = expectedCandidateDecisionIds.size

  if ((candidate.downstream_action_decisions || []).length !== (decisions.downstream_action_decisions || []).length) {
    errors.push(`candidate rows ${(candidate.downstream_action_decisions || []).length} must match source decision rows ${(decisions.downstream_action_decisions || []).length}`)
  }
  for (const [decisionId, sourceRow] of sourceByDecisionId.entries()) {
    const candidateRow = candidateByDecisionId.get(decisionId)
    if (!candidateRow) {
      errors.push(`${decisionId} missing candidate row`)
      continue
    }
    if (!expectedCandidateDecisionIds.has(decisionId)) {
      if (!sameJson(sourceRow, candidateRow)) {
        stats.extra_candidate_rows += 1
        errors.push(`${decisionId} changed but is not an inventory candidate row`)
      }
      continue
    }
    const item = inventoryByBatchItem.get(sourceRow.source_downstream_action_item_id)
    if (!item) {
      stats.missing_candidate_rows += 1
      errors.push(`${decisionId} missing inventory item`)
      continue
    }
    validateCandidateDecision(sourceRow, candidateRow, item, args, errors, stats)
  }
  for (const decisionId of candidateByDecisionId.keys()) {
    if (!sourceByDecisionId.has(decisionId)) {
      stats.extra_candidate_rows += 1
      errors.push(`${decisionId} unexpected candidate row`)
    }
  }
  for (const decisionId of expectedCandidateDecisionIds) {
    const row = candidateByDecisionId.get(decisionId)
    if (!row || row.target_gap_inventory_decision_candidate !== true) {
      stats.missing_candidate_rows += 1
      errors.push(`${decisionId} missing target gap inventory candidate marker`)
    }
  }
  if (args.requireItems && !stats.inventory_candidate_decisions) {
    errors.push('requireItems is set but no inventory candidate decisions were audited')
  }
  if (stats.inventory_candidate_decisions !== stats.expected_inventory_candidate_decisions) {
    errors.push(`inventory candidate decisions ${stats.inventory_candidate_decisions} must match expected ${stats.expected_inventory_candidate_decisions}`)
  }
  validateSummary(candidate, stats, errors)

  return {
    candidate: args.candidate,
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    inventory_audit: args.inventoryAudit,
    matcher_ready: false,
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
