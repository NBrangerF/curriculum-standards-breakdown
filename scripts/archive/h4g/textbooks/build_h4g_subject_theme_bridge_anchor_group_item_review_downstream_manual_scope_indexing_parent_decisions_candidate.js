#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe.md'

const CANDIDATE_DECISION = 'missing_grade_units_indexed_for_later_source_review'
const CANDIDATE_STATUS = 'manual_scope_indexing_candidate_reviewed'

function parseArgs(argv) {
  const args = {
    actionCandidate: DEFAULT_ACTION_CANDIDATE,
    decisions: DEFAULT_DECISIONS,
    inventory: DEFAULT_INVENTORY,
    out: DEFAULT_OUT,
    requireItems: false,
    reviewedAt: new Date().toISOString().slice(0, 10),
    reviewedBy: 'Codex manual scope parent decision candidate',
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--action-candidate') args.actionCandidate = argv[++i]
    else if (item === '--inventory') args.inventory = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json \\
  --action-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --inventory generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a non-public parent downstream decisions candidate from manual-scope
action decision candidates. It only marks parent missing-grade unit-indexing
decisions whose action-review candidate is inventory-supported; it does not
edit the source template, write public/data, change official standard text, or
enable matcher/publication use.`)
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

function truncate(value, max = 110) {
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

function validateParentDecisions(decisions, args, errors) {
  if (decisions.valid !== true) errors.push('parent decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('parent decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template') {
    errors.push('parent decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template')
  }
  validatePolicy('parent decisions', decisions, errors)
  if (!Array.isArray(decisions.downstream_decisions)) errors.push('parent decisions downstream_decisions must be an array')
  if (args.requireItems && !(decisions.downstream_decisions || []).length) {
    errors.push('requireItems is set but parent decisions has no downstream_decisions')
  }
}

function validateActionCandidate(actionCandidate, args, errors) {
  if (actionCandidate.valid !== true) errors.push('action candidate valid must be true')
  if (actionCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate') {
    errors.push('action candidate candidate_purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate')
  }
  if (actionCandidate.review_only !== true) errors.push('action candidate review_only must be true')
  if (actionCandidate.source_manual_scope_indexing_inventory !== args.inventory) {
    errors.push('action candidate inventory path must match builder arg')
  }
  validatePolicy('action candidate', actionCandidate, errors)
  if (!Array.isArray(actionCandidate.downstream_action_decisions)) {
    errors.push('action candidate downstream_action_decisions must be an array')
  }
}

function validateInventory(inventory, args, errors) {
  if (inventory.valid !== true) errors.push('inventory valid must be true')
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory') {
    errors.push('inventory purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory')
  }
  validatePolicy('inventory', inventory, errors)
  if (!Array.isArray(inventory.inventory_items)) errors.push('inventory inventory_items must be an array')
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

function parentCandidatePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_item_review_decision_is_not_approval: true,
    eligible_for_h4g_differentiation: false,
    item_level_decision_gate_required: true,
    manual_scope_parent_decision_candidate_is_later_gate_input: true,
    matcher_ready: false,
    parent_candidate_is_not_publication_approval: true,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    requires_later_source_anchor_review: true,
    source_decision_must_be_edited_separately: true,
    writes_public_data: false
  }
}

function isActionCandidate(row) {
  return row.manual_scope_indexing_decision_candidate === true &&
    row.reviewer_decision === CANDIDATE_DECISION &&
    row.decision_status === 'inventory_candidate_reviewed'
}

function validateActionRow(action, parent, inventoryByItem, errors) {
  const prefix = action.decision_id || action.source_downstream_action_item_id || '(missing action candidate)'
  if (!isActionCandidate(action)) errors.push(`${prefix} must be a manual scope indexing action candidate`)
  if (action.source_downstream_action_batch !== 'manual_scope_indexing') errors.push(`${prefix} must come from manual_scope_indexing`)
  if (!action.downstream_decision_id) errors.push(`${prefix} missing downstream_decision_id`)
  if (!parent) {
    errors.push(`${prefix} missing parent downstream decision`)
    return
  }
  if (parent.reviewer_decision !== 'pending') errors.push(`${prefix} parent decision must still be pending`)
  if (parent.decision_status !== 'pending_review') errors.push(`${prefix} parent decision must still be pending_review`)
  if (parent.source_batch !== 'missing_grade_unit_indexing') errors.push(`${prefix} parent source_batch must be missing_grade_unit_indexing`)
  if (!(parent.allowed_decisions || []).includes(CANDIDATE_DECISION)) {
    errors.push(`${prefix} parent allowed_decisions must include ${CANDIDATE_DECISION}`)
  }
  if (parent.decision_id !== action.downstream_decision_id) errors.push(`${prefix} parent decision_id must match action downstream_decision_id`)
  if (parent.source_batch_item_id !== action.source_batch_item_id) errors.push(`${prefix} parent source_batch_item_id must match action source_batch_item_id`)
  if (parent.standard_code !== action.standard_code) errors.push(`${prefix} parent standard_code must match action standard_code`)
  if (parent.target_standard_code !== action.target_standard_code) errors.push(`${prefix} parent target_standard_code must match action target_standard_code`)
  if (parent.grade_band !== action.target_grade_band) errors.push(`${prefix} parent grade_band must match action target_grade_band`)
  if (parent.progression_group_id !== action.progression_group_id) errors.push(`${prefix} parent progression_group_id must match action progression_group_id`)
  const inventoryItem = inventoryByItem.get(action.source_downstream_action_item_id)
  if (!inventoryItem) errors.push(`${prefix} missing manual scope inventory item`)
  if (inventoryItem && inventoryItem.manual_scope_indexing_bucket !== 'manual_scope_indexing_has_page_ready_candidates_needs_reviewer_confirmation') {
    errors.push(`${prefix} inventory item must be manual_scope_indexing_has_page_ready_candidates_needs_reviewer_confirmation`)
  }
}

function parentDecisionNote(parent, action) {
  const evidence = action.manual_scope_indexing_evidence || {}
  return [
    'Parent downstream decision candidate: downstream action review confirmed same-grade unit indexing evidence for later source-anchor review.',
    `Action decision ${action.decision_id} found ${evidence.same_grade_unit_index_candidate_count || 0} same-grade unit candidate(s), including ${evidence.same_grade_page_ready_candidate_count || 0} page-ready candidate(s), for ${evidence.target_standard_code || parent.target_standard_code}.`,
    'This only moves the missing-grade unit-indexing lane to later source-anchor review; it is not bridge approval, matcher readiness, publication readiness, or a public data change.'
  ].join(' ')
}

function applyParentCandidate(parent, action, args) {
  return {
    ...parent,
    decision_note: parentDecisionNote(parent, action),
    decision_status: CANDIDATE_STATUS,
    manual_scope_indexing_evidence: {
      ...(action.manual_scope_indexing_evidence || {}),
      source_parent_decision_id: parent.decision_id || ''
    },
    manual_scope_indexing_parent_decision_candidate: true,
    manual_scope_parent_decision_candidate_policy: parentCandidatePolicy(),
    required_confirmations: {
      ...(parent.required_confirmations || {}),
      item_level_decision_still_required: true,
      missing_grade_textbook_units_indexed: true,
      no_public_write_requested: true,
      official_standard_text_preserved: true,
      same_grade_scope_checked: true,
      source_anchor_specificity_still_required: true,
      target_missing_grade_standard_checked: true
    },
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewedBy,
    reviewer_decision: CANDIDATE_DECISION,
    source_downstream_action_decision_id: action.decision_id || '',
    source_downstream_action_decisions_candidate: args.actionCandidate
  }
}

function summarize(rows, candidateRows) {
  const summary = {
    by_decision_type: {},
    by_grade_band: {},
    by_item_review_surface: {},
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_source_batch: {},
    by_candidate_subject: {},
    by_subject: {},
    by_target_grade_band: {},
    by_target_standard_code: {},
    candidate_decisions: candidateRows.length,
    completed_downstream_decisions: 0,
    downstream_decisions: rows.length,
    expected_downstream_decisions: rows.length,
    extra_decisions: 0,
    missing_decisions: 0,
    pending_downstream_decisions: rows.length - candidateRows.length,
    source_anchor_review_rows: 0,
    unique_progression_groups: sorted(candidateRows.map(row => row.progression_group_id)).length,
    unique_target_standard_codes: sorted(candidateRows.map(row => row.target_standard_code)).length
  }
  for (const row of rows) {
    if (row.reviewer_decision !== 'pending') summary.completed_downstream_decisions += 1
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    countInto(summary.by_decision_type, row.decision_type)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_item_review_surface, row.item_review_surface)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_subject, row.subject_slug)
  }
  for (const row of candidateRows) {
    countInto(summary.by_candidate_subject, row.subject_slug)
    countInto(summary.by_target_grade_band, row.grade_band)
    countInto(summary.by_target_standard_code, row.target_standard_code)
  }
  return summary
}

function previewRows(candidateRows) {
  return candidateRows.slice(0, 30).map(row => {
    const evidence = row.manual_scope_indexing_evidence || {}
    const firstUnit = (evidence.unit_candidate_preview || [])[0] || {}
    return `| ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.target_standard_code)} | ${evidence.same_grade_page_ready_candidate_count || 0} | ${truncate(firstUnit.unit_title || '-')} |`
  }).join('\n') || '| - | - | - | 0 | - |'
}

function markdownSummary(payload) {
  const candidateRows = (payload.downstream_decisions || []).filter(row => row.manual_scope_indexing_parent_decision_candidate === true)
  return `# H4G Downstream Manual Scope Indexing Parent Decisions Candidate

Generated at: ${payload.generated_at}

This candidate copies the parent downstream decisions template and only marks
manual-scope/indexing parent rows whose downstream action candidate has
inventory-supported same-grade unit candidates. It remains review-only and
non-public.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| downstream decisions | ${payload.summary.downstream_decisions} |
| candidate decisions | ${payload.summary.candidate_decisions} |
| pending downstream decisions | ${payload.summary.pending_downstream_decisions} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Target Grades

| target grade | rows |
| --- | ---: |
${countRows(payload.summary.by_target_grade_band)}

## Subjects

| subject | rows |
| --- | ---: |
${countRows(payload.summary.by_candidate_subject)}

## Preview

| subject | target grade | target standard | page-ready units | first page-ready unit |
| --- | --- | --- | ---: | --- |
${previewRows(candidateRows)}

## Guardrails

- Parent candidate rows are not bridge approvals.
- Source-anchor review, item-level decisions, matcher, and publication gates remain required.
- The editable source downstream decisions template is not modified.
- Public data remains untouched.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['parent downstream decisions', args.decisions],
    ['manual scope action candidate', args.actionCandidate],
    ['manual scope inventory', args.inventory]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { downstream_decisions: [] }
  const actionCandidate = existsSync(args.actionCandidate) ? readJson(args.actionCandidate) : { downstream_action_decisions: [] }
  const inventory = existsSync(args.inventory) ? readJson(args.inventory) : { inventory_items: [] }
  if (!errors.length) {
    validateParentDecisions(decisions, args, errors)
    validateActionCandidate(actionCandidate, args, errors)
    validateInventory(inventory, args, errors)
  }

  const parentById = mapBy(decisions.downstream_decisions || [], 'decision_id', errors, 'parent decisions')
  const inventoryByItem = mapBy(inventory.inventory_items || [], 'manual_scope_indexing_item_id', errors, 'manual scope inventory')
  const actionRows = (actionCandidate.downstream_action_decisions || []).filter(isActionCandidate)
  const actionByParentDecisionId = new Map()
  for (const action of actionRows) {
    const parent = parentById.get(action.downstream_decision_id)
    validateActionRow(action, parent, inventoryByItem, errors)
    if (!parent) continue
    if (actionByParentDecisionId.has(parent.decision_id)) errors.push(`${parent.decision_id} duplicate parent action candidate`)
    actionByParentDecisionId.set(parent.decision_id, action)
  }
  if (args.requireItems && !actionByParentDecisionId.size) errors.push('requireItems is set but no parent candidate rows were found')

  const rows = (decisions.downstream_decisions || []).map(row => {
    const action = actionByParentDecisionId.get(row.decision_id)
    return action ? applyParentCandidate(row, action, args) : row
  })
  const candidateRows = rows.filter(row => row.manual_scope_indexing_parent_decision_candidate === true)

  return {
    ...decisions,
    candidate_purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate',
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_decisions: rows,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    parent_candidate_policy: parentCandidatePolicy(),
    publication_candidate: false,
    publication_ready: false,
    review_only: true,
    source_decisions_template: args.decisions,
    source_downstream_action_decisions_candidate: args.actionCandidate,
    source_manual_scope_indexing_inventory: args.inventory,
    summary: summarize(rows, candidateRows),
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
  const payload = buildPayload(args)
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
