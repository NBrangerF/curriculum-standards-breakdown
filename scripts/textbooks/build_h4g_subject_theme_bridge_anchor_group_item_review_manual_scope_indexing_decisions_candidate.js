#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_PARENT_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.md'

const CANDIDATE_DECISION = 'needs_textbook_unit_indexing'
const CANDIDATE_STATUS = 'manual_scope_indexing_item_candidate_reviewed'
const PARENT_CANDIDATE_DECISION = 'missing_grade_units_indexed_for_later_source_review'
const PARENT_CANDIDATE_STATUS = 'manual_scope_indexing_candidate_reviewed'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    parentCandidate: DEFAULT_PARENT_CANDIDATE,
    requireItems: false,
    reviewedAt: new Date().toISOString().slice(0, 10),
    reviewedBy: 'Codex manual scope item review candidate',
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --parent-candidate generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a non-public item-review decisions candidate from manual-scope parent
downstream decisions. It only marks source-evidence item-review rows whose all
missing target standards have same-grade unit-index candidates for later
source-anchor review. It does not edit the source template, approve bridges,
write public/data, or enable matcher/publication use.`)
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

function validateParentCandidate(parentCandidate, errors) {
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

function validateCoverageForItem(row, parentRows, errors) {
  const prefix = row.decision_id || row.source_batch_item_id || '(missing item decision)'
  if (row.reviewer_decision !== 'pending') errors.push(`${prefix} source item decision must still be pending`)
  if (row.decision_status !== 'pending_review') errors.push(`${prefix} source item decision must still be pending_review`)
  if (!(row.allowed_decisions || []).includes(CANDIDATE_DECISION)) {
    errors.push(`${prefix} allowed_decisions must include ${CANDIDATE_DECISION}`)
  }
  const missingKeys = itemMissingTargetKeys(row)
  if (!missingKeys.length) errors.push(`${prefix} must have target_missing_grade_standards`)
  const parentKeys = sorted((parentRows || []).map(parent => targetKey(parent.grade_band, parent.target_standard_code)))
  if (missingKeys.join('|') !== parentKeys.join('|')) {
    errors.push(`${prefix} manual-scope parent candidates must cover all missing target standards`)
  }
  for (const parent of parentRows || []) {
    const parentPrefix = parent.decision_id || prefix
    const evidence = parent.manual_scope_indexing_evidence || {}
    if (parent.parent_decision_id !== row.decision_id) errors.push(`${parentPrefix} parent_decision_id mismatch`)
    if (parent.source_batch !== 'missing_grade_unit_indexing') errors.push(`${parentPrefix} source_batch must be missing_grade_unit_indexing`)
    if (parent.source_standard_code !== row.source_standard_code) errors.push(`${parentPrefix} source_standard_code mismatch`)
    if (parent.progression_group_id !== row.progression_group_id) errors.push(`${parentPrefix} progression_group_id mismatch`)
    if (parent.manual_scope_indexing_parent_decision_candidate !== true) {
      errors.push(`${parentPrefix} manual_scope_indexing_parent_decision_candidate must be true`)
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

function itemCandidatePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    item_review_decision_is_not_approval: true,
    manual_scope_item_review_candidate_is_not_bridge_approval: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    requires_later_source_anchor_review: true,
    source_decision_must_be_edited_separately: true,
    writes_public_data: false
  }
}

function itemDecisionNote(row, parentRows) {
  const grades = sorted(parentRows.map(parent => parent.grade_band)).join(', ')
  const targetCodes = sorted(parentRows.map(parent => parent.target_standard_code)).join(', ')
  const unitCount = parentRows.reduce((sum, parent) => sum + Number(parent.manual_scope_indexing_evidence?.same_grade_unit_index_candidate_count || 0), 0)
  const pageReadyCount = parentRows.reduce((sum, parent) => sum + Number(parent.manual_scope_indexing_evidence?.same_grade_page_ready_candidate_count || 0), 0)
  return [
    'Item-review candidate: downstream manual-scope review found same-grade textbook unit candidates for all missing target standards, so this item can stay on the textbook-unit-indexing route for later source-anchor review.',
    `Missing target grades: ${grades || 'none'}. Target standards: ${targetCodes || 'none'}. Unit candidates: ${unitCount}; page-ready candidates: ${pageReadyCount}.`,
    'This records indexing coverage only; it is not source-anchor evidence, bridge approval, matcher readiness, publication readiness, or a public data change.'
  ].join(' ')
}

function manualScopeEvidence(row, parentRows, args) {
  const unitPreview = []
  for (const parent of parentRows) {
    const evidence = parent.manual_scope_indexing_evidence || {}
    for (const candidate of (evidence.unit_candidate_preview || []).slice(0, 6)) {
      unitPreview.push({
        edition: candidate.edition || '',
        page_range: candidate.page_range || '',
        page_ready: candidate.page_ready === true,
        repository_path: candidate.repository_path || '',
        target_grade_band: parent.grade_band || '',
        target_standard_code: parent.target_standard_code || '',
        unit_evidence_id: candidate.unit_evidence_id || '',
        unit_title: candidate.unit_title || ''
      })
    }
  }
  return {
    all_missing_target_standards_have_same_grade_unit_candidates: true,
    covered_missing_target_standard_keys: itemMissingTargetKeys(row),
    manual_scope_indexing_item_ids: sorted(parentRows.map(parent => parent.manual_scope_indexing_evidence?.manual_scope_indexing_item_id)),
    parent_downstream_action_decision_ids: sorted(parentRows.map(parent => parent.source_downstream_action_decision_id)),
    parent_downstream_decision_ids: sorted(parentRows.map(parent => parent.decision_id)),
    same_grade_page_ready_candidate_count: parentRows.reduce((sum, parent) => sum + Number(parent.manual_scope_indexing_evidence?.same_grade_page_ready_candidate_count || 0), 0),
    same_grade_unit_index_candidate_count: parentRows.reduce((sum, parent) => sum + Number(parent.manual_scope_indexing_evidence?.same_grade_unit_index_candidate_count || 0), 0),
    source_item_review_decision_id: row.decision_id || '',
    source_parent_decisions_candidate: args.parentCandidate,
    target_grade_bands: sorted(parentRows.map(parent => parent.grade_band)),
    target_standard_codes: sorted(parentRows.map(parent => parent.target_standard_code)),
    unit_candidate_preview: unitPreview.slice(0, 18)
  }
}

function applyItemCandidate(row, parentRows, args) {
  return {
    ...row,
    decision_note: itemDecisionNote(row, parentRows),
    decision_status: CANDIDATE_STATUS,
    manual_scope_indexing_item_review_candidate_policy: itemCandidatePolicy(),
    manual_scope_indexing_item_review_decision_candidate: true,
    manual_scope_indexing_item_review_evidence: manualScopeEvidence(row, parentRows, args),
    required_confirmations: {
      ...(row.required_confirmations || {}),
      existing_source_items_reviewed: true,
      missing_grade_target_standard_checked: true,
      missing_grade_textbook_units_indexed: true,
      no_public_write_requested: true,
      official_standard_text_preserved: true,
      source_anchor_evidence_same_grade: false,
      source_anchor_evidence_specific_to_standard: false,
      source_anchor_specificity_still_required: true
    },
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewedBy,
    reviewer_decision: CANDIDATE_DECISION,
    source_downstream_parent_decision_ids: sorted(parentRows.map(parent => parent.decision_id)),
    source_downstream_parent_decisions_candidate: args.parentCandidate
  }
}

function buildRowsWithArgs(decisions, parentCandidate, args, errors) {
  const itemByDecisionId = new Map((decisions.item_review_decisions || []).map(row => [row.decision_id, row]))
  const parentByItemDecision = parentCandidatesByItemDecision(parentCandidate)
  const candidateItemIds = new Set()
  for (const [decisionId, parentRows] of parentByItemDecision.entries()) {
    const row = itemByDecisionId.get(decisionId)
    if (!row) {
      errors.push(`${decisionId} parent candidate has no matching item-review decision`)
      continue
    }
    validateCoverageForItem(row, parentRows, errors)
    const missingKeys = itemMissingTargetKeys(row)
    const parentKeys = sorted(parentRows.map(parent => targetKey(parent.grade_band, parent.target_standard_code)))
    if (missingKeys.length && missingKeys.join('|') === parentKeys.join('|')) candidateItemIds.add(decisionId)
  }
  return (decisions.item_review_decisions || []).map(row => {
    if (!candidateItemIds.has(row.decision_id)) return row
    return applyItemCandidate(row, parentByItemDecision.get(row.decision_id) || [], args)
  })
}

function summarize(rows) {
  const summary = {
    by_candidate_target_grade_band: {},
    by_decision_type: {},
    by_grade_band: {},
    by_item_review_surface: {},
    by_missing_grade_band: {},
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_subject: {},
    completed_item_review_decisions: 0,
    item_review_decisions: rows.length,
    manual_scope_indexing_item_review_candidate_decisions: 0,
    pending_item_review_decisions: 0,
    source_anchor_review_rows: 0,
    source_evidence_item_review_decisions: 0,
    split_item_review_decisions: 0,
    target_missing_grade_standards: 0,
    target_standard_gap_decisions: 0
  }
  for (const row of rows) {
    if (row.reviewer_decision === 'pending') summary.pending_item_review_decisions += 1
    else summary.completed_item_review_decisions += 1
    if (row.manual_scope_indexing_item_review_decision_candidate) {
      summary.manual_scope_indexing_item_review_candidate_decisions += 1
      for (const gradeBand of row.manual_scope_indexing_item_review_evidence?.target_grade_bands || []) {
        countInto(summary.by_candidate_target_grade_band, gradeBand)
      }
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
    .filter(row => row.manual_scope_indexing_item_review_decision_candidate)
    .slice(0, 80)
    .map(row => (
      `| ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.standard_code)} | ${markdownCell((row.manual_scope_indexing_item_review_evidence?.target_grade_bands || []).join(','))} | ${markdownCell((row.manual_scope_indexing_item_review_evidence?.target_standard_codes || []).join(','))} | ${markdownCell(row.reviewer_decision)} | ${truncate(row.decision_note)} |`
    )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Manual Scope Indexing Item Review Decisions Candidate

Generated at: ${payload.generated_at}

This candidate copies the editable item-review decisions template and only fills
source-evidence rows whose all missing target-grade standards have same-grade
unit-index candidates from downstream manual-scope review. It does not edit the
source template, approve bridges, write \`public/data\`, change official
standard text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| item review decisions | ${payload.summary.item_review_decisions} |
| manual-scope item-review candidates | ${payload.summary.manual_scope_indexing_item_review_candidate_decisions} |
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

## Candidate Rows

| rank | subject | source standard | target grades | target standards | decision | note |
| ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.item_review_decisions)}

## Guardrails

- Item-review candidate decisions are not bridge approval.
- Public data, official standard text, matcher, and publication gates remain disabled.
- These rows record same-grade unit-indexing coverage only; source-anchor specificity still requires a later gate.

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
    validateParentCandidate(parentCandidate, errors)
  }
  const rows = buildRowsWithArgs(decisions, parentCandidate, args, errors)
  const summary = summarize(rows)
  const expectedCandidates = parentCandidatesByItemDecision(parentCandidate).size
  if (args.requireItems && !summary.manual_scope_indexing_item_review_candidate_decisions) {
    errors.push('requireItems is set but no manual-scope item-review candidate decisions were generated')
  }
  if (summary.manual_scope_indexing_item_review_candidate_decisions !== expectedCandidates) {
    errors.push(`manual-scope item-review candidates ${summary.manual_scope_indexing_item_review_candidate_decisions} must match fully covered parent item decisions ${expectedCandidates}`)
  }
  return {
    ...decisions,
    candidate_purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_indexing_decisions_candidate',
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    item_review_decisions: rows,
    manual_scope_indexing_item_review_candidate_policy: itemCandidatePolicy(),
    manual_scope_indexing_item_review_decisions_complete: summary.manual_scope_indexing_item_review_candidate_decisions > 0 &&
      summary.manual_scope_indexing_item_review_candidate_decisions === expectedCandidates &&
      errors.length === 0,
    matcher_ready: false,
    publication_candidate: false,
    publication_ready: false,
    review_only: true,
    source_decisions_template: args.decisions,
    source_downstream_parent_decisions_candidate: args.parentCandidate,
    summary,
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
