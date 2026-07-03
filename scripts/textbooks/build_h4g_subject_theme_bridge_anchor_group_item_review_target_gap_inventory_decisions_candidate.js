#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_PARENT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.md'

const CANDIDATE_DECISION = 'target_missing_grade_standard_absent'
const CANDIDATE_STATUS = 'target_gap_inventory_candidate_reviewed'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    parentCandidate: DEFAULT_PARENT_CANDIDATE,
    requireItems: false,
    reviewedAt: new Date().toISOString().slice(0, 10),
    reviewedBy: 'Codex target gap item review candidate',
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--parent-candidate') args.parentCandidate = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_target_gap_inventory_decisions_candidate.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --parent-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a non-public item-review decisions candidate from target-gap parent
downstream decisions. It only marks item-review target-gap decisions whose all
missing target grades are confirmed absent; it does not edit the source template,
approve bridges, write public/data, or enable matcher/publication use.`)
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

function validateItemDecisions(decisions, args, errors) {
  if (decisions.valid !== true) errors.push('item decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_decisions_template') {
    errors.push('item decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_decisions_template') {
    errors.push('item decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_decisions_template')
  }
  validatePolicy('item decisions', decisions, errors)
  if (!Array.isArray(decisions.item_review_decisions)) errors.push('item decisions item_review_decisions must be an array')
  if (args.requireItems && !(decisions.item_review_decisions || []).length) {
    errors.push('requireItems is set but item decisions has no item_review_decisions')
  }
}

function validateParentCandidate(parentCandidate, args, errors) {
  if (parentCandidate.valid !== true) errors.push('parent candidate valid must be true')
  if (parentCandidate.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate') {
    errors.push('parent candidate candidate_purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate')
  }
  if (parentCandidate.review_only !== true) errors.push('parent candidate review_only must be true')
  validatePolicy('parent candidate', parentCandidate, errors)
  if (!Array.isArray(parentCandidate.downstream_decisions)) {
    errors.push('parent candidate downstream_decisions must be an array')
  }
}

function targetGapItemRows(decisions) {
  return (decisions.item_review_decisions || []).filter(row => (row.missing_target_standard_grade_bands || []).length)
}

function parentCandidatesByItemDecision(parentCandidate) {
  const out = new Map()
  for (const row of parentCandidate.downstream_decisions || []) {
    if (row.target_gap_inventory_parent_decision_candidate !== true) continue
    if (row.reviewer_decision !== 'target_standard_gap_confirmed') continue
    const id = row.parent_decision_id || ''
    if (!id) continue
    if (!out.has(id)) out.set(id, [])
    out.get(id).push(row)
  }
  for (const rows of out.values()) {
    rows.sort((a, b) => String(a.grade_band || '').localeCompare(String(b.grade_band || '')) ||
      String(a.decision_id || '').localeCompare(String(b.decision_id || '')))
  }
  return out
}

function itemCandidatePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    item_review_decision_is_not_approval: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    source_decision_must_be_edited_separately: true,
    target_gap_item_review_candidate_is_not_bridge_approval: true,
    writes_public_data: false
  }
}

function validateCoverageForItem(row, parentRows, errors) {
  const prefix = row.decision_id || row.source_batch_item_id || '(missing item decision)'
  if (row.reviewer_decision !== 'pending') errors.push(`${prefix} source item decision must still be pending`)
  if (row.decision_status !== 'pending_review') errors.push(`${prefix} source item decision must still be pending_review`)
  if (!(row.allowed_decisions || []).includes(CANDIDATE_DECISION)) {
    errors.push(`${prefix} allowed_decisions must include ${CANDIDATE_DECISION}`)
  }
  const missingGrades = sorted(row.missing_target_standard_grade_bands || [])
  const parentGrades = sorted((parentRows || []).map(parent => parent.grade_band))
  if (missingGrades.join('|') !== parentGrades.join('|')) {
    errors.push(`${prefix} parent target-gap candidates must cover all missing target grades`)
  }
  for (const parent of parentRows || []) {
    if (parent.parent_decision_id !== row.decision_id) errors.push(`${prefix} parent candidate parent_decision_id mismatch`)
    if (parent.source_batch !== 'target_standard_gap') errors.push(`${prefix} parent candidate source_batch must be target_standard_gap`)
    if (parent.source_standard_code !== row.source_standard_code) errors.push(`${prefix} parent candidate source_standard_code mismatch`)
    if (parent.progression_group_id !== row.progression_group_id) errors.push(`${prefix} parent candidate progression_group_id mismatch`)
    if (parent.reviewer_decision !== 'target_standard_gap_confirmed') errors.push(`${prefix} parent candidate must confirm target standard gap`)
  }
}

function itemDecisionNote(row, parentRows) {
  const grades = sorted((parentRows || []).map(parent => parent.grade_band)).join(', ')
  const targetCodes = sorted((parentRows || []).map(parent => parent.target_gap_inventory_evidence?.exact_target_code)).join(', ')
  return [
    'Item-review candidate: all missing target-grade standards for this source-evidence request were confirmed absent by downstream target-gap inventory review.',
    `Missing target grades: ${grades || 'none'}. Expected target codes absent: ${targetCodes || 'none'}.`,
    'This records target-standard absence only; it is not source-anchor evidence, bridge approval, matcher readiness, publication readiness, or a public data change.'
  ].join(' ')
}

function targetGapEvidence(row, parentRows, args) {
  return {
    all_missing_target_grade_bands_confirmed_absent: true,
    confirmed_missing_target_grade_bands: sorted((parentRows || []).map(parent => parent.grade_band)),
    expected_target_codes_absent: sorted((parentRows || []).map(parent => parent.target_gap_inventory_evidence?.exact_target_code)),
    parent_downstream_decision_ids: sorted((parentRows || []).map(parent => parent.decision_id)),
    source_item_review_decision_id: row.decision_id || '',
    source_parent_decisions_candidate: args.parentCandidate
  }
}

function applyItemCandidate(row, parentRows, args) {
  return {
    ...row,
    decision_note: itemDecisionNote(row, parentRows),
    decision_status: CANDIDATE_STATUS,
    required_confirmations: {
      ...(row.required_confirmations || {}),
      existing_source_items_reviewed: true,
      missing_grade_target_standard_checked: true,
      no_public_write_requested: true,
      official_standard_text_preserved: true,
      source_anchor_evidence_same_grade: false,
      source_anchor_evidence_specific_to_standard: false
    },
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewedBy,
    reviewer_decision: CANDIDATE_DECISION,
    source_downstream_parent_decision_ids: sorted((parentRows || []).map(parent => parent.decision_id)),
    source_downstream_parent_decisions_candidate: args.parentCandidate,
    target_gap_inventory_evidence: targetGapEvidence(row, parentRows, args),
    target_gap_inventory_item_review_decision_candidate: true,
    target_gap_item_review_candidate_policy: itemCandidatePolicy()
  }
}

function buildRows(decisions, parentCandidate, args, errors) {
  const parentByItemDecision = parentCandidatesByItemDecision(parentCandidate)
  const candidateItemIds = new Set()
  for (const row of targetGapItemRows(decisions)) {
    const parentRows = parentByItemDecision.get(row.decision_id) || []
    validateCoverageForItem(row, parentRows, errors)
    const missingGrades = sorted(row.missing_target_standard_grade_bands || [])
    const parentGrades = sorted(parentRows.map(parent => parent.grade_band))
    if (missingGrades.length && missingGrades.join('|') === parentGrades.join('|')) candidateItemIds.add(row.decision_id)
  }
  return (decisions.item_review_decisions || []).map(row => {
    if (!candidateItemIds.has(row.decision_id)) return row
    return applyItemCandidate(row, parentByItemDecision.get(row.decision_id) || [], args)
  })
}

function summarize(rows) {
  const summary = {
    by_decision_type: {},
    by_grade_band: {},
    by_item_review_surface: {},
    by_missing_grade_band: {},
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_subject: {},
    completed_item_review_decisions: 0,
    item_review_decisions: rows.length,
    pending_item_review_decisions: 0,
    source_anchor_review_rows: 0,
    source_evidence_item_review_decisions: 0,
    split_item_review_decisions: 0,
    target_gap_inventory_item_review_candidate_decisions: 0,
    target_missing_grade_standards: 0,
    target_standard_gap_decisions: 0
  }
  for (const row of rows) {
    if (row.reviewer_decision === 'pending') summary.pending_item_review_decisions += 1
    else summary.completed_item_review_decisions += 1
    if (row.target_gap_inventory_item_review_decision_candidate) {
      summary.target_gap_inventory_item_review_candidate_decisions += 1
    }
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    if (row.decision_type === 'anchor_group_split_item_review_decision') summary.split_item_review_decisions += 1
    if (row.decision_type === 'anchor_group_source_evidence_item_review_decision') summary.source_evidence_item_review_decisions += 1
    summary.target_missing_grade_standards += (row.target_missing_grade_standards || []).length
    if ((row.missing_target_standard_grade_bands || []).length) summary.target_standard_gap_decisions += 1
    countInto(summary.by_decision_type, row.decision_type)
    countInto(summary.by_item_review_surface, row.item_review_surface)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_subject, row.subject_slug)
    if (row.grade_band) countInto(summary.by_grade_band, row.grade_band)
    for (const gradeBand of row.missing_grade_bands || []) countInto(summary.by_missing_grade_band, gradeBand)
  }
  return summary
}

function previewRows(rows) {
  return rows
    .filter(row => row.target_gap_inventory_item_review_decision_candidate)
    .slice(0, 80)
    .map(row => (
      `| ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.standard_code)} | ${markdownCell((row.missing_target_standard_grade_bands || []).join(','))} | ${markdownCell(row.reviewer_decision)} | ${truncate(row.decision_note)} |`
    )).join('\n') || '| - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Target Gap Inventory Item Review Decisions Candidate

Generated at: ${payload.generated_at}

This candidate copies the editable item-review decisions template and only fills
source-evidence rows whose all missing target-grade standards were confirmed
absent by downstream target-gap inventory review. It does not edit the source
template, approve bridges, write \`public/data\`, change official standard text,
or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| item review decisions | ${payload.summary.item_review_decisions} |
| target-gap item-review candidates | ${payload.summary.target_gap_inventory_item_review_candidate_decisions} |
| completed item review decisions | ${payload.summary.completed_item_review_decisions} |
| pending item review decisions | ${payload.summary.pending_item_review_decisions} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Reviewer Decisions

| reviewer decision | decisions |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Candidate Rows

| rank | subject | source standard | missing target grades | decision | note |
| ---: | --- | --- | --- | --- | --- |
${previewRows(payload.item_review_decisions)}

## Guardrails

- Item-review candidate decisions are not bridge approval.
- Public data, official standard text, matcher, and publication gates remain disabled.
- These rows only record target-standard absence for the missing grades.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildCandidate(args) {
  const errors = []
  for (const [label, path] of [
    ['item decisions', args.decisions],
    ['parent candidate', args.parentCandidate]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = errors.length ? { item_review_decisions: [] } : readJson(args.decisions)
  const parentCandidate = errors.length ? { downstream_decisions: [] } : readJson(args.parentCandidate)
  if (!errors.length) {
    validateItemDecisions(decisions, args, errors)
    validateParentCandidate(parentCandidate, args, errors)
  }
  const rows = buildRows(decisions, parentCandidate, args, errors)
  const summary = summarize(rows)
  const expectedCandidates = targetGapItemRows(decisions).length
  if (args.requireItems && !summary.target_gap_inventory_item_review_candidate_decisions) {
    errors.push('requireItems is set but no target gap item-review candidate decisions were generated')
  }
  if (summary.target_gap_inventory_item_review_candidate_decisions !== expectedCandidates) {
    errors.push(`target gap item-review candidates ${summary.target_gap_inventory_item_review_candidate_decisions} must match target gap item decisions ${expectedCandidates}`)
  }
  return {
    ...decisions,
    candidate_purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_target_gap_inventory_decisions_candidate',
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    item_review_decisions: rows,
    matcher_ready: false,
    publication_candidate: false,
    publication_ready: false,
    review_only: true,
    source_decisions_template: args.decisions,
    source_downstream_parent_decisions_candidate: args.parentCandidate,
    summary,
    target_gap_inventory_item_review_decisions_complete: summary.target_gap_inventory_item_review_candidate_decisions > 0 &&
      summary.target_gap_inventory_item_review_candidate_decisions === expectedCandidates &&
      errors.length === 0,
    target_gap_item_review_candidate_policy: itemCandidatePolicy(),
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
