#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_TRIAGE_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_STANDARDS_ROOT = 'public/data/by_subject'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.md'

const EVIDENCE_REVIEW_DECISION = 'needs_source_anchor_evidence'
const EVIDENCE_WORK_PATH = 'source_anchor_evidence_gap_review'

function parseArgs(argv) {
  const args = {
    anchorBatch: DEFAULT_ANCHOR_BATCH,
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
    if (item === '--worklist') args.worklist = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_source_evidence_batch.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json \\
  --triage-decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json \\
  --anchor-batch generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-requests

Builds a read-only source-anchor evidence request batch for anchor groups routed
to needs_source_anchor_evidence. It lists existing same-grade evidence, missing
grade bands, public target standards for those grade bands when present, and the
required source-anchor checks. It does not approve bridges, write public/data,
change official standard text, or enable matcher/publication use.`)
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

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
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

function truncate(value, max = 84) {
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

function basePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    evidence_request_is_not_approval: true,
    item_level_decision_gate_required: true,
    matcher_ready: false,
    publication_ready: false,
    read_only_source_evidence_batch: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    source_decision_must_be_edited_separately: true,
    writes_public_data: false
  }
}

function validateArgs(args, errors) {
  if (!Number.isInteger(args.minRank) || args.minRank < 1) errors.push('--min-rank must be an integer >= 1')
  if (args.maxRank !== Number.POSITIVE_INFINITY && (!Number.isInteger(args.maxRank) || args.maxRank < 1)) {
    errors.push('--max-rank must be an integer >= 1')
  }
  if (args.minRank > args.maxRank) errors.push('--min-rank must be <= --max-rank')
}

function validateTopLevel(worklist, triage, anchorBatch, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_action_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_anchor_group_action_worklist')
  }
  if (worklist.review_only !== true) errors.push('worklist review_only must be true')
  if (worklist.writes_public_data !== false) errors.push('worklist writes_public_data must be false')
  if (worklist.changes_official_standard_text !== false) errors.push('worklist changes_official_standard_text must be false')
  if (worklist.direct_matcher_use !== false) errors.push('worklist direct_matcher_use must be false')
  if (worklist.matcher_ready !== false) errors.push('worklist matcher_ready must be false')
  if (worklist.publication_ready !== false) errors.push('worklist publication_ready must be false')

  if (triage.valid !== true) errors.push('triage decisions valid must be true')
  if (triage.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_triage_decisions_candidate') {
    errors.push('triage decisions candidate_purpose must be h4g_subject_theme_bridge_anchor_group_triage_decisions_candidate')
  }
  if (triage.group_review_complete !== true) errors.push('triage decisions group_review_complete must be true')
  if (triage.writes_public_data !== false) errors.push('triage decisions writes_public_data must be false')
  if (triage.changes_official_standard_text !== false) errors.push('triage decisions changes_official_standard_text must be false')
  if (triage.direct_matcher_use !== false) errors.push('triage decisions direct_matcher_use must be false')
  if (triage.matcher_ready !== false) errors.push('triage decisions matcher_ready must be false')
  if (triage.publication_ready !== false) errors.push('triage decisions publication_ready must be false')

  if (anchorBatch.valid !== true) errors.push('anchor batch valid must be true')
  if (anchorBatch.purpose !== 'h4g_subject_theme_bridge_anchor_review_batch') {
    errors.push('anchor batch purpose must be h4g_subject_theme_bridge_anchor_review_batch')
  }
  if (anchorBatch.writes_public_data !== false) errors.push('anchor batch writes_public_data must be false')
  if (anchorBatch.changes_official_standard_text !== false) errors.push('anchor batch changes_official_standard_text must be false')
  if (anchorBatch.direct_matcher_use !== false) errors.push('anchor batch direct_matcher_use must be false')
  if (anchorBatch.matcher_ready !== false) errors.push('anchor batch matcher_ready must be false')
  if (anchorBatch.publication_ready !== false) errors.push('anchor batch publication_ready must be false')
  if (anchorBatch.policy?.anchor_review_batch_only !== true) errors.push('anchor batch policy.anchor_review_batch_only must be true')
}

function mapBy(rows, key, errors, label) {
  const map = new Map()
  for (const row of rows || []) {
    const id = row[key]
    if (!id) {
      errors.push(`${label} row missing ${key}`)
      continue
    }
    if (map.has(id)) errors.push(`${label} duplicate ${key}: ${id}`)
    map.set(id, row)
  }
  return map
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

function standardContext(standard, fallback = {}) {
  return {
    assessment_evidence_type: standard?.assessment_evidence_type || '',
    code: standard?.code || fallback.standard_code || '',
    context: standard?.context || '',
    domain: standard?.domain || fallback.standard_domain || '',
    grade: standard?.grade || '',
    grade_band: standard?.grade_band || fallback.grade_band || '',
    grade_level: standard?.grade_level ?? null,
    id: standard?.id || standard?.code || fallback.standard_code || '',
    legacy_code: standard?.legacy_code || '',
    practice: standard?.practice || '',
    progression_delta: standard?.progression_delta || '',
    progression_group_id: standard?.progression_group_id || fallback.progression_group_id || '',
    progression_role: standard?.progression_role || '',
    review_status: standard?.review_status || '',
    source_grade_range: standard?.source_grade_range || '',
    source_standard_scope: standard?.source_standard_scope || '',
    stage_band: standard?.stage_band || '',
    standard: standard?.standard || '',
    subdomain: standard?.subdomain || fallback.standard_subdomain || '',
    subject: standard?.subject || '',
    subject_slug: standard?.subject_slug || fallback.subject_slug || '',
    teaching_tip: standard?.teaching_tip || ''
  }
}

function sourceItemSummary(item) {
  return {
    action_family: item.action_family || '',
    anchor_requirement: item.anchor_requirement || {},
    anchor_review_item_id: item.anchor_review_item_id || '',
    anchor_type: item.anchor_requirement?.anchor_type || '',
    bridge_context: item.bridge_context || {},
    decision_owner: item.decision_owner || '',
    evidence_profile: item.evidence_profile || {},
    grade_band: item.grade_band || '',
    progression_group_id: item.progression_group_id || '',
    remediation_item_id: item.remediation_item_id || '',
    source_decision_id: item.source_decision_id || '',
    source_review_id: item.source_review_id || '',
    source_work_item_id: item.source_work_item_id || '',
    standard_context: item.standard_context || {},
    subject_slug: item.subject_slug || '',
    unit_context: item.unit_context || {}
  }
}

function targetStandardsForRequest(workItem, request, standardsByGroup) {
  const standards = standardsByGroup.get(workItem.progression_group_id) || []
  const missingSet = new Set(request.missing_grade_bands || [])
  return standards
    .filter(standard => missingSet.has(standard.grade_band || ''))
    .map(standard => standardContext(standard, {
      progression_group_id: workItem.progression_group_id,
      subject_slug: workItem.subject_slug
    }))
    .sort((a, b) => a.grade_band.localeCompare(b.grade_band) || a.code.localeCompare(b.code))
}

function existingStandardsForRequest(workItem, request, standardsByGroup) {
  const standards = standardsByGroup.get(workItem.progression_group_id) || []
  const existingSet = new Set(request.existing_grade_bands || [])
  return standards
    .filter(standard => existingSet.has(standard.grade_band || ''))
    .map(standard => standardContext(standard, {
      progression_group_id: workItem.progression_group_id,
      subject_slug: workItem.subject_slug
    }))
    .sort((a, b) => a.grade_band.localeCompare(b.grade_band) || a.code.localeCompare(b.code))
}

function reviewDecisionTemplate(request) {
  return {
    allowed_review_outcomes: [
      'source_anchor_evidence_found_for_missing_grade',
      'source_anchor_evidence_not_found',
      'target_missing_grade_standard_absent',
      'needs_textbook_unit_indexing'
    ],
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: {
      existing_source_items_reviewed: false,
      missing_grade_target_standard_checked: false,
      no_public_write_requested: true,
      official_standard_text_preserved: true,
      source_anchor_evidence_same_grade: false,
      source_anchor_evidence_specific_to_standard: false
    },
    required_evidence: request.required_evidence || [],
    review_questions: request.review_questions || [],
    reviewer_note_template: 'Record whether same-grade source-anchor evidence exists for each missing grade band. Do not mark bridge approval here.'
  }
}

function validateRequest(workItem, request, sourceItems, errors) {
  const prefix = request.evidence_request_id || `${workItem.progression_group_id}:${request.standard_code}`
  const expectedIds = sorted((request.source_items || []).map(item => item.anchor_review_item_id))
  const actualIds = sorted(sourceItems.map(item => item.anchor_review_item_id))
  if (!request.evidence_request_id) errors.push(`${prefix} missing evidence_request_id`)
  if (!request.standard_code) errors.push(`${prefix} missing standard_code`)
  if (!request.anchor_type) errors.push(`${prefix} missing anchor_type`)
  if (!Array.isArray(request.existing_grade_bands) || !request.existing_grade_bands.length) {
    errors.push(`${prefix} existing_grade_bands must be non-empty`)
  }
  if (!Array.isArray(request.missing_grade_bands) || !request.missing_grade_bands.length) {
    errors.push(`${prefix} missing_grade_bands must be non-empty`)
  }
  if (!expectedIds.length) errors.push(`${prefix} has no source_items`)
  if (expectedIds.join('|') !== actualIds.join('|')) errors.push(`${prefix} source item ids do not match request source_items`)
  for (const item of sourceItems) {
    if (item.progression_group_id !== workItem.progression_group_id) errors.push(`${prefix} source item group mismatch: ${item.anchor_review_item_id}`)
    if (item.standard_context?.standard_code !== request.standard_code) errors.push(`${prefix} source item standard mismatch: ${item.anchor_review_item_id}`)
    if (!request.existing_grade_bands.includes(item.grade_band)) errors.push(`${prefix} source item grade not in existing_grade_bands: ${item.anchor_review_item_id}`)
    if (item.anchor_requirement?.anchor_type !== request.anchor_type) errors.push(`${prefix} source item anchor type mismatch: ${item.anchor_review_item_id}`)
  }
}

function buildRequestItem(workItem, request, indexes, errors) {
  const sourceItems = (request.source_items || [])
    .map(item => indexes.anchorItemById.get(item.anchor_review_item_id))
    .filter(Boolean)
  validateRequest(workItem, request, sourceItems, errors)
  const triageDecision = indexes.triageByGroup.get(workItem.progression_group_id)
  const sourceStandard = indexes.standards.byCode.get(request.standard_code)
  const targetStandards = targetStandardsForRequest(workItem, request, indexes.standards.byGroup)
  const existingStandards = existingStandardsForRequest(workItem, request, indexes.standards.byGroup)
  const prefix = request.evidence_request_id || `${workItem.progression_group_id}:${request.standard_code}`
  if (!triageDecision) errors.push(`${prefix} missing triage decision`)
  else if (triageDecision.reviewer_decision !== EVIDENCE_REVIEW_DECISION) {
    errors.push(`${prefix} triage decision must be ${EVIDENCE_REVIEW_DECISION}`)
  }
  if (!sourceStandard) errors.push(`${prefix} standard_code not found in public data: ${request.standard_code}`)
  const targetGradeSet = new Set(targetStandards.map(row => row.grade_band))
  const missingTargetStandardGradeBands = sorted((request.missing_grade_bands || []).filter(gradeBand => !targetGradeSet.has(gradeBand)))

  return {
    anchor_action_work_id: workItem.anchor_action_work_id || '',
    anchor_type: request.anchor_type || '',
    existing_grade_bands: request.existing_grade_bands || [],
    existing_grade_standards: existingStandards,
    missing_grade_bands: request.missing_grade_bands || [],
    missing_target_standard_grade_bands: missingTargetStandardGradeBands,
    priority_rank: workItem.priority_rank,
    priority_tier: workItem.priority_tier || '',
    progression_group_id: workItem.progression_group_id || '',
    publication_policy: basePolicy(),
    request_index: request.request_index || null,
    review_decision_template: reviewDecisionTemplate(request),
    review_grain: 'progression_group+anchor_type+missing_grade_band',
    source_anchor_evidence_request_id: request.evidence_request_id || '',
    source_anchor_review_items: sourceItems.map(sourceItemSummary),
    source_evidence_request_item_id: `h4g_anchor_group_source_evidence_review_${hashText(`${workItem.anchor_action_work_id}|${request.evidence_request_id}`)}`,
    source_standard_context: standardContext(sourceStandard, {
      progression_group_id: workItem.progression_group_id,
      standard_code: request.standard_code,
      standard_domain: request.standard_domain,
      standard_subdomain: request.standard_subdomain,
      subject_slug: workItem.subject_slug
    }),
    source_triage_decision_id: triageDecision?.decision_id || '',
    standard_code: request.standard_code || '',
    subject_slug: workItem.subject_slug || '',
    target_missing_grade_standards: targetStandards,
    unit_context_by_grade_band: request.unit_context_by_grade_band || {},
    work_path: workItem.work_path || ''
  }
}

function buildItems(worklist, args, indexes, errors) {
  const items = []
  for (const workItem of selectedWorkItems(worklist, args)) {
    if (!Array.isArray(workItem.source_anchor_evidence_requests) || !workItem.source_anchor_evidence_requests.length) {
      errors.push(`${workItem.progression_group_id} evidence work item has no source_anchor_evidence_requests`)
      continue
    }
    for (const request of workItem.source_anchor_evidence_requests) {
      items.push(buildRequestItem(workItem, request, indexes, errors))
    }
  }
  return items.sort((a, b) => Number(a.priority_rank || 0) - Number(b.priority_rank || 0) ||
    a.progression_group_id.localeCompare(b.progression_group_id) ||
    a.standard_code.localeCompare(b.standard_code) ||
    a.source_anchor_evidence_request_id.localeCompare(b.source_anchor_evidence_request_id))
}

function summarize(items) {
  const summary = {
    by_anchor_type: {},
    by_existing_grade_band: {},
    by_missing_grade_band: {},
    by_priority_tier: {},
    by_subject: {},
    existing_source_rows: 0,
    progression_groups: sorted(items.map(item => item.progression_group_id)).length,
    requests_with_missing_target_standard_gap: 0,
    source_evidence_requests: items.length,
    target_missing_grade_standards: 0
  }
  for (const item of items) {
    summary.existing_source_rows += item.source_anchor_review_items.length
    summary.target_missing_grade_standards += item.target_missing_grade_standards.length
    if (item.missing_target_standard_grade_bands.length) summary.requests_with_missing_target_standard_gap += 1
    countInto(summary.by_anchor_type, item.anchor_type)
    countInto(summary.by_priority_tier, item.priority_tier)
    countInto(summary.by_subject, item.subject_slug)
    for (const gradeBand of item.existing_grade_bands) countInto(summary.by_existing_grade_band, gradeBand)
    for (const gradeBand of item.missing_grade_bands) countInto(summary.by_missing_grade_band, gradeBand)
  }
  return summary
}

function previewRows(items) {
  return items.slice(0, 80).map(item => (
    `| ${item.priority_rank} | ${markdownCell(item.priority_tier)} | ${markdownCell(item.subject_slug)} | ${markdownCell(item.progression_group_id)} | ${markdownCell(item.standard_code)} | ${markdownCell(item.existing_grade_bands.join(','))} | ${markdownCell(item.missing_grade_bands.join(','))} | ${item.target_missing_grade_standards.length} | ${truncate(item.target_missing_grade_standards.map(row => row.code).join('；'))} |`
  )).join('\n') || '| - | - | - | - | - | - | - | 0 | - |'
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Source Evidence Batch

Generated at: ${payload.generated_at}

This is a read-only source-anchor evidence request batch for the 9 anchor groups
that were routed to \`needs_source_anchor_evidence\`. It lists the existing
same-grade source rows, missing grade bands, and the target public standards for
the missing grade bands when those standards exist. It does not approve bridges,
write \`public/data\`, change official standard text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| source evidence requests | ${payload.summary.source_evidence_requests} |
| progression groups | ${payload.summary.progression_groups} |
| existing source rows | ${payload.summary.existing_source_rows} |
| target missing-grade standards | ${payload.summary.target_missing_grade_standards} |
| requests with missing target-standard gap | ${payload.summary.requests_with_missing_target_standard_gap} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Missing Grade Bands

| grade band | requests |
| --- | ---: |
${countRows(payload.summary.by_missing_grade_band)}

## Existing Grade Bands

| grade band | requests |
| --- | ---: |
${countRows(payload.summary.by_existing_grade_band)}

## Subjects

| subject | requests |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Preview

| rank | tier | subject | group | source standard | existing grades | missing grades | target standards | target codes |
| ---: | --- | --- | --- | --- | --- | --- | ---: | --- |
${previewRows(payload.source_evidence_request_items)}

## Guardrails

- Evidence request review is not bridge approval.
- Missing-grade source evidence must be same-grade and specific to the target standard before any later item-level decision.
- Public data, official standard text, matcher readiness and publication readiness remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  validateArgs(args, errors)
  for (const [label, path] of [
    ['worklist', args.worklist],
    ['triage decisions', args.triageDecisions],
    ['anchor batch', args.anchorBatch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const worklist = errors.length ? { action_work_items: [] } : readJson(args.worklist)
  const triage = errors.length ? { group_review_decisions: [] } : readJson(args.triageDecisions)
  const anchorBatch = errors.length ? { anchor_review_items: [] } : readJson(args.anchorBatch)
  if (!errors.length) validateTopLevel(worklist, triage, anchorBatch, errors)

  const selected = selectedWorkItems(worklist, args)
  const subjectSlugs = sorted(selected.map(item => item.subject_slug))
  const indexes = {
    anchorItemById: mapBy(anchorBatch.anchor_review_items || [], 'anchor_review_item_id', errors, 'anchor batch'),
    standards: buildStandardIndexes(args.standardsRoot, subjectSlugs, errors),
    triageByGroup: mapBy(triage.group_review_decisions || [], 'progression_group_id', errors, 'triage decisions')
  }
  const items = buildItems(worklist, args, indexes, errors)
  if (args.requireRequests && !items.length) errors.push('requireRequests is set but no source evidence request items were generated')

  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: basePolicy(),
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_source_evidence_batch',
    review_only: true,
    selection: {
      max_rank: args.maxRank === Number.POSITIVE_INFINITY ? 'all' : args.maxRank,
      min_rank: args.minRank,
      reviewer_decision: EVIDENCE_REVIEW_DECISION,
      subjects: args.subjects || ['all'],
      work_path: EVIDENCE_WORK_PATH
    },
    source_action_worklist: args.worklist,
    source_anchor_batch: args.anchorBatch,
    source_evidence_request_items: items,
    source_triage_decisions: args.triageDecisions,
    summary: summarize(items),
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
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
