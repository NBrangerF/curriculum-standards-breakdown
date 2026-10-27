#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.md'

const CANDIDATE_DECISION = 'missing_grade_units_indexed_for_later_source_review'
const CANDIDATE_STATUS = 'inventory_candidate_reviewed'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    inventory: DEFAULT_INVENTORY,
    out: DEFAULT_OUT,
    requireItems: false,
    reviewedAt: new Date().toISOString().slice(0, 10),
    reviewedBy: 'Codex manual scope indexing inventory',
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json \\
  --inventory generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a non-public downstream action decisions candidate from manual
scope/indexing inventory evidence. It only marks rows where same-grade,
page-ready unit index candidates exist for a public target standard. It does
not edit the source template, write public/data, change official standard text,
or enable matcher/publication use.`)
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

function validateInventory(inventory, args, errors) {
  if (inventory.valid !== true) errors.push('inventory valid must be true')
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory') {
    errors.push('inventory purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_inventory')
  }
  validatePolicy('inventory', inventory, errors)
  if (!Array.isArray(inventory.inventory_items)) errors.push('inventory inventory_items must be an array')
  if (args.requireItems && !(inventory.inventory_items || []).length) {
    errors.push('requireItems is set but inventory has no inventory_items')
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
    requires_later_source_anchor_review: true,
    writes_public_data: false
  }
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

function unitCandidatePreview(item) {
  return (item.same_grade_unit_index_candidates || [])
    .filter(candidate => candidate?.page_ready === true)
    .slice(0, 12)
    .map(candidate => ({
      edition: candidate.edition || '',
      grade: candidate.grade,
      page_range: candidate.page_range || '',
      page_range_status: candidate.page_range_status || '',
      page_ready: candidate.page_ready === true,
      repository_path: candidate.repository_path || '',
      source_unit_index: candidate.source_unit_index || '',
      unit_evidence_id: candidate.unit_evidence_id || '',
      unit_title: candidate.unit_title || ''
    }))
}

function buildDecisionNote(row, item) {
  const profile = item.manual_scope_indexing_profile || {}
  return [
    'Inventory-candidate non-public decision: same-grade unit index candidates exist for the missing-grade target standard.',
    `Target ${item.target_standard_code} exists in public data for ${item.target_grade_band}.`,
    `The inventory found ${profile.same_grade_unit_index_candidate_count || 0} same-grade unit candidate(s), including ${profile.same_grade_page_ready_candidate_count || 0} page-ready candidate(s).`,
    'This only confirms that missing-grade units are indexed for later source-anchor review; it is not bridge approval, matcher approval, or publication approval.'
  ].join(' ')
}

function manualScopeEvidence(row, item, args) {
  const profile = item.manual_scope_indexing_profile || {}
  return {
    existing_grade_bands: item.existing_grade_bands || [],
    inventory: args.inventory,
    inventory_item_id: item.inventory_item_id || '',
    manual_scope_indexing_item_id: item.manual_scope_indexing_item_id || '',
    same_grade_page_ready_candidate_count: profile.same_grade_page_ready_candidate_count || 0,
    same_grade_unit_index_candidate_count: profile.same_grade_unit_index_candidate_count || 0,
    source_decision_id: row.decision_id || '',
    subject_slug: item.subject_slug || '',
    target_grade_band: item.target_grade_band || '',
    target_progression_role: item.target_standard_context?.progression_role || '',
    target_standard_code: item.target_standard_code || '',
    target_standard_exists_in_public: profile.target_standard_exists_in_public === true,
    unit_candidate_preview: unitCandidatePreview(item)
  }
}

function applyInventoryCandidate(row, item, args) {
  return {
    ...row,
    decision_note: buildDecisionNote(row, item),
    decision_status: CANDIDATE_STATUS,
    manual_scope_indexing_candidate_policy: candidatePolicy(),
    manual_scope_indexing_decision_candidate: true,
    manual_scope_indexing_evidence: manualScopeEvidence(row, item, args),
    required_confirmations: expectedConfirmations(row),
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewedBy,
    reviewer_decision: CANDIDATE_DECISION
  }
}

function summarize(rows, candidateRows, candidateItems, inventory) {
  const summary = {
    by_subject: {},
    by_target_grade_band: {},
    by_target_standard_code: {},
    candidate_decisions: candidateRows.length,
    downstream_action_decisions: rows.length,
    manual_scope_indexing_inventory_items: (inventory.inventory_items || []).length,
    pending_action_decisions: rows.length - candidateRows.length,
    same_grade_page_ready_candidate_rows: 0,
    unique_progression_groups: sorted(candidateItems.map(item => item.progression_group_id)).length,
    unique_target_standard_codes: sorted(candidateItems.map(item => item.target_standard_code)).length,
    unit_index_candidate_rows: inventory.summary?.unit_index_candidate_rows || 0
  }
  for (const item of candidateItems) {
    const profile = item.manual_scope_indexing_profile || {}
    countInto(summary.by_subject, item.subject_slug)
    countInto(summary.by_target_grade_band, item.target_grade_band)
    countInto(summary.by_target_standard_code, item.target_standard_code)
    if (profile.has_page_ready_same_grade_unit_candidates) summary.same_grade_page_ready_candidate_rows += 1
  }
  return summary
}

function previewRows(candidateItems) {
  return candidateItems.slice(0, 30).map(item => {
    const profile = item.manual_scope_indexing_profile || {}
    const firstUnit = (item.same_grade_unit_index_candidates || []).find(candidate => candidate.page_ready) || {}
    return `| ${markdownCell(item.subject_slug)} | ${markdownCell(item.target_grade_band)} | ${markdownCell(item.target_standard_code)} | ${profile.same_grade_page_ready_candidate_count || 0} | ${truncate(firstUnit.unit_title || '-')} |`
  }).join('\n') || '| - | - | - | 0 | - |'
}

function markdownSummary(payload, candidateItems) {
  return `# H4G Downstream Manual Scope Indexing Decisions Candidate

Generated at: ${payload.generated_at}

This candidate copies the editable downstream action decisions template and only
marks manual-scope/indexing rows where the current inventory has same-grade,
page-ready unit candidates for an existing target standard. It remains
review-only and non-public.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| downstream action decisions | ${payload.summary.downstream_action_decisions} |
| candidate decisions | ${payload.summary.candidate_decisions} |
| pending action decisions | ${payload.summary.pending_action_decisions} |
| inventory items | ${payload.summary.manual_scope_indexing_inventory_items} |
| same-grade page-ready candidate rows | ${payload.summary.same_grade_page_ready_candidate_rows} |
| unit index candidate rows | ${payload.summary.unit_index_candidate_rows} |
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

## Preview

| subject | target grade | target standard | page-ready units | first page-ready unit |
| --- | --- | --- | ---: | --- |
${previewRows(candidateItems)}

## Guardrails

- Candidate rows are not bridge approvals.
- Candidate rows still require later source-anchor review and item-level decisions.
- The editable source action decisions template is not modified.
- Public data, matcher, and publication gates remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['decisions', args.decisions],
    ['manual scope indexing inventory', args.inventory]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { downstream_action_decisions: [] }
  const inventory = existsSync(args.inventory) ? readJson(args.inventory) : { inventory_items: [] }
  if (!errors.length) {
    validateDecisions(decisions, args, errors)
    validateInventory(inventory, args, errors)
  }

  const bySourceActionItem = decisionBySourceActionItem(decisions, errors)
  const candidateItems = []
  const candidateByDecisionId = new Map()
  for (const item of inventory.inventory_items || []) {
    if (!isCandidateInventoryItem(item)) continue
    const decision = bySourceActionItem.get(item.manual_scope_indexing_item_id)
    if (!decision) {
      errors.push(`${item.manual_scope_indexing_item_id || item.inventory_item_id} missing source action decision`)
      continue
    }
    if (decision.source_downstream_action_batch !== 'manual_scope_indexing') {
      errors.push(`${decision.decision_id} must be a manual_scope_indexing action decision`)
      continue
    }
    if (!(decision.allowed_decisions || []).includes(CANDIDATE_DECISION)) {
      errors.push(`${decision.decision_id} does not allow ${CANDIDATE_DECISION}`)
      continue
    }
    candidateItems.push(item)
    candidateByDecisionId.set(decision.decision_id, item)
  }
  if (args.requireItems && !candidateItems.length) errors.push('requireItems is set but no manual scope candidate rows were found')

  const rows = (decisions.downstream_action_decisions || []).map(row => {
    const item = candidateByDecisionId.get(row.decision_id)
    return item ? applyInventoryCandidate(row, item, args) : row
  })
  const candidateRows = rows.filter(row => row.manual_scope_indexing_decision_candidate === true)

  return {
    ...decisions,
    candidate_purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate',
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_decisions: rows,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    manual_scope_indexing_candidate_policy: candidatePolicy(),
    matcher_ready: false,
    publication_candidate: false,
    publication_ready: false,
    review_only: true,
    source_decisions_template: args.decisions,
    source_manual_scope_indexing_inventory: args.inventory,
    summary: summarize(rows, candidateRows, candidateItems, inventory),
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
  const candidateItems = (payload.downstream_action_decisions || [])
    .filter(row => row.manual_scope_indexing_decision_candidate === true)
    .map(row => row.manual_scope_indexing_evidence)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload, candidateItems.map(evidence => ({
    manual_scope_indexing_profile: {
      same_grade_page_ready_candidate_count: evidence.same_grade_page_ready_candidate_count
    },
    same_grade_unit_index_candidates: evidence.unit_candidate_preview || [],
    subject_slug: evidence.subject_slug || '',
    target_grade_band: evidence.target_grade_band,
    target_standard_code: evidence.target_standard_code
  }))))
  console.log(JSON.stringify({
    out: args.out,
    summary: payload.summary,
    valid: payload.valid
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
