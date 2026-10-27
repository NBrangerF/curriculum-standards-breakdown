#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_INVENTORY_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.md'

const CANDIDATE_DECISION = 'target_standard_gap_confirmed'
const CANDIDATE_STATUS = 'inventory_candidate_reviewed'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    inventoryAudit: DEFAULT_INVENTORY_AUDIT,
    out: DEFAULT_OUT,
    requireItems: false,
    reviewedAt: new Date().toISOString().slice(0, 10),
    reviewedBy: 'Codex target gap inventory audit',
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--inventory-audit') args.inventoryAudit = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--reviewed-by') args.reviewedBy = argv[++i]
    else if (item === '--reviewed-at') args.reviewedAt = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json \\
  --inventory-audit generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a non-public downstream action decisions candidate from target-standard
gap inventory evidence. It only marks confirmed-absent target-gap rows as a
review candidate; it does not edit the source template, write public/data,
change official standard text, or enable matcher/publication use.`)
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

function truncate(value, max = 110) {
  const text = markdownCell(value)
  if (text.length <= max) return text
  return `${text.slice(0, max - 3)}...`
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
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template')
  }
  validatePolicy('decisions', decisions, errors)
  if (!Array.isArray(decisions.downstream_action_decisions)) {
    errors.push('decisions downstream_action_decisions must be an array')
  }
  if (args.requireItems && !(decisions.downstream_action_decisions || []).length) {
    errors.push('requireItems is set but decisions has no downstream_action_decisions')
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
    errors.push('requireItems is set but inventory audit has no inventory_items')
  }
}

function candidatePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_review_decision_is_not_approval: true,
    eligible_for_h4g_differentiation: false,
    inventory_candidate_is_not_publication_approval: true,
    item_level_review_still_required: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function inventoryByBatchItem(inventory, errors) {
  const out = new Map()
  for (const item of inventory.inventory_items || []) {
    const id = item.batch_item_id || ''
    if (!id) {
      errors.push('inventory item missing batch_item_id')
      continue
    }
    if (out.has(id)) errors.push(`duplicate inventory batch_item_id: ${id}`)
    out.set(id, item)
  }
  return out
}

function decisionBySourceActionItem(decisions, errors) {
  const out = new Map()
  for (const row of decisions.downstream_action_decisions || []) {
    const id = row.source_downstream_action_item_id || ''
    if (!id) {
      errors.push(`${row.decision_id || '(missing decision id)'} missing source_downstream_action_item_id`)
      continue
    }
    if (out.has(id)) errors.push(`duplicate decision source_downstream_action_item_id: ${id}`)
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

function buildDecisionNote(row, item) {
  return [
    'Inventory-candidate non-public decision: the current public H4G inventory confirms the missing-grade target standard is absent.',
    `Source ${item.source_standard_code} exists in progression group ${item.progression_group_id}; expected target code ${item.exact_target_code} is not present.`,
    `The target grade has ${item.target_grade_same_legacy_code_records_count || 0} same-legacy alternative record(s) and ${item.target_grade_same_progression_group_records_count || 0} same-group alternative record(s).`,
    'This confirms the gap for reviewer follow-up only; official text, public data, matcher, and publication gates remain disabled.'
  ].join(' ')
}

function targetGapEvidence(row, item, args) {
  return {
    batch_item_id: item.batch_item_id || '',
    exact_target_code: item.exact_target_code || '',
    inventory_audit: args.inventoryAudit,
    inventory_status: item.inventory_status || '',
    missing_grade_band: item.missing_grade_band || '',
    progression_group_id: item.progression_group_id || '',
    public_same_group_grade_bands: item.public_same_group_grade_bands || [],
    source_decision_id: row.decision_id || '',
    source_standard_code: item.source_standard_code || '',
    target_grade_same_legacy_code_records_count: item.target_grade_same_legacy_code_records_count || 0,
    target_grade_same_progression_group_records_count: item.target_grade_same_progression_group_records_count || 0
  }
}

function applyInventoryCandidate(row, item, args) {
  return {
    ...row,
    decision_note: buildDecisionNote(row, item),
    decision_status: CANDIDATE_STATUS,
    required_confirmations: {
      ...(row.required_confirmations || {}),
      item_level_decision_still_required: true,
      no_public_write_requested: true,
      official_standard_text_preserved: true,
      progression_group_scope_checked: true,
      source_anchor_evidence_search_deferred: true,
      target_missing_grade_standard_absent_checked: true
    },
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewedBy,
    reviewer_decision: CANDIDATE_DECISION,
    target_gap_inventory_candidate_policy: candidatePolicy(),
    target_gap_inventory_decision_candidate: true,
    target_gap_inventory_evidence: targetGapEvidence(row, item, args)
  }
}

function validateCandidateSource(item, decision, errors) {
  const prefix = item.batch_item_id || item.source_standard_code || '(missing inventory item)'
  if (!isConfirmedAbsent(item)) errors.push(`${prefix} inventory item must be confirmed absent before candidate decision`)
  if (!decision) {
    errors.push(`${prefix} missing action decision row`)
    return
  }
  if (decision.source_downstream_action_batch !== 'target_standard_gap_resolution') {
    errors.push(`${prefix} action decision must come from target_standard_gap_resolution`)
  }
  if (decision.decision_type !== 'anchor_group_downstream_target_standard_gap_resolution_decision') {
    errors.push(`${prefix} action decision has unexpected decision_type`)
  }
  if (decision.reviewer_decision !== 'pending') errors.push(`${prefix} action decision must still be pending`)
  if (decision.decision_status !== 'pending_review') errors.push(`${prefix} action decision status must be pending_review`)
  if (!(decision.allowed_decisions || []).includes(CANDIDATE_DECISION)) {
    errors.push(`${prefix} action decision allowed_decisions must include ${CANDIDATE_DECISION}`)
  }
  if (decision.source_standard_code !== item.source_standard_code) errors.push(`${prefix} source_standard_code must match action decision`)
  if (decision.progression_group_id !== item.progression_group_id) errors.push(`${prefix} progression_group_id must match action decision`)
  if (decision.target_grade_band !== item.missing_grade_band) errors.push(`${prefix} missing grade must match action decision target_grade_band`)
  if (decision.target_standard_code) errors.push(`${prefix} action decision should not already have target_standard_code`)
}

function buildRows(decisions, inventory, args, errors) {
  const byActionItem = decisionBySourceActionItem(decisions, errors)
  const byInventoryItem = inventoryByBatchItem(inventory, errors)
  for (const item of byInventoryItem.values()) {
    validateCandidateSource(item, byActionItem.get(item.batch_item_id), errors)
  }
  const candidateItemIds = new Set(
    [...byInventoryItem.values()]
      .filter(isConfirmedAbsent)
      .map(item => item.batch_item_id)
  )
  return (decisions.downstream_action_decisions || []).map(row => {
    if (!candidateItemIds.has(row.source_downstream_action_item_id)) return row
    return applyInventoryCandidate(row, byInventoryItem.get(row.source_downstream_action_item_id), args)
  })
}

function summarize(rows, inventory) {
  const summary = {
    by_grade_band: {},
    by_inventory_status: {},
    by_reviewer_decision: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    completed_action_decisions: 0,
    downstream_action_decisions: rows.length,
    inventory_candidate_decisions: 0,
    pending_action_decisions: 0,
    target_gap_inventory_items: (inventory.inventory_items || []).length,
    target_gap_inventory_items_confirmed_absent: 0
  }
  for (const item of inventory.inventory_items || []) {
    if (item.inventory_status === 'confirmed_absent_in_public_inventory') summary.target_gap_inventory_items_confirmed_absent += 1
    countInto(summary.by_inventory_status, item.inventory_status)
  }
  for (const row of rows) {
    if (row.reviewer_decision === 'pending') summary.pending_action_decisions += 1
    else summary.completed_action_decisions += 1
    if (row.target_gap_inventory_decision_candidate) summary.inventory_candidate_decisions += 1
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_source_downstream_action_batch, row.source_downstream_action_batch)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows
    .filter(row => row.target_gap_inventory_decision_candidate)
    .slice(0, 80)
    .map(row => (
      `| ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.target_grade_band || row.grade_band)} | ${markdownCell(row.source_standard_code)} | ${markdownCell(row.target_gap_inventory_evidence?.exact_target_code)} | ${markdownCell(row.reviewer_decision)} | ${truncate(row.decision_note)} |`
    )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Target Gap Inventory Decisions Candidate

Generated at: ${payload.generated_at}

This candidate copies the editable downstream action decisions template and only
fills target-standard gap rows that the inventory audit confirms absent in the
current public H4G inventory. It does not edit the source template, write
\`public/data\`, change official standard text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| downstream action decisions | ${payload.summary.downstream_action_decisions} |
| inventory candidate decisions | ${payload.summary.inventory_candidate_decisions} |
| pending action decisions | ${payload.summary.pending_action_decisions} |
| target gap inventory items | ${payload.summary.target_gap_inventory_items} |
| confirmed absent inventory items | ${payload.summary.target_gap_inventory_items_confirmed_absent} |
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

## Inventory Status

| inventory status | items |
| --- | ---: |
${countRows(payload.summary.by_inventory_status)}

## Candidate Rows

| rank | subject | target grade | source standard | expected target code | decision | note |
| ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.downstream_action_decisions)}

## Guardrails

- Candidate decisions are not publication approval.
- The editable source action decisions template is not modified.
- Public data, official standard text, matcher, and publication gates remain disabled.
- Item-level source review remains a later gate.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildCandidate(args) {
  const errors = []
  for (const [label, path] of [
    ['decisions', args.decisions],
    ['inventory audit', args.inventoryAudit]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = errors.length ? { downstream_action_decisions: [] } : readJson(args.decisions)
  const inventory = errors.length ? { inventory_items: [] } : readJson(args.inventoryAudit)
  if (!errors.length) {
    validateDecisions(decisions, args, errors)
    validateInventoryAudit(inventory, args, errors)
  }
  const rows = buildRows(decisions, inventory, args, errors)
  const summary = summarize(rows, inventory)
  if (args.requireItems && !summary.inventory_candidate_decisions) {
    errors.push('requireItems is set but no target gap inventory candidate decisions were generated')
  }
  if (summary.inventory_candidate_decisions !== summary.target_gap_inventory_items_confirmed_absent) {
    errors.push(`inventory candidate decisions ${summary.inventory_candidate_decisions} must match confirmed absent inventory items ${summary.target_gap_inventory_items_confirmed_absent}`)
  }
  return {
    ...decisions,
    candidate_purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate',
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_decisions: rows,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_candidate: false,
    publication_ready: false,
    review_only: true,
    source_decisions_template: args.decisions,
    source_target_standard_gap_inventory_audit: args.inventoryAudit,
    summary,
    target_gap_inventory_candidate_policy: candidatePolicy(),
    target_gap_inventory_decisions_complete: summary.inventory_candidate_decisions > 0 && summary.inventory_candidate_decisions === summary.target_gap_inventory_items_confirmed_absent && errors.length === 0,
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
  const payload = buildCandidate(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
