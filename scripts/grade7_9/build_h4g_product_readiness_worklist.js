#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_PRODUCT_READINESS = 'generated/grade7_9_h4g_product_readiness.json'
const DEFAULT_ISSUE_MATRIX = 'generated/grade7_9_h4g_differentiation_issue_matrix.json'
const DEFAULT_ANCHOR_GROUP_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_GROUP_TRIAGE = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_group_triage.json'
const DEFAULT_GROUP_READY_CANDIDATE = 'generated/textbook_evidence/h4g_unit_evidence_group_ready_candidate.json'
const DEFAULT_OUT = 'generated/grade7_9_h4g_product_readiness_worklist.json'
const DEFAULT_SUMMARY_OUT = 'generated/grade7_9_h4g_product_readiness_worklist.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']
const TARGET_GRADE_SET = new Set(TARGET_GRADE_BANDS)
const CORE_TEXT_FIELDS = ['domain', 'subdomain', 'standard', 'context', 'practice', 'teaching_tip', 'assessment_evidence_type']
const APPROVED_REVIEW_STATUSES = new Set([
  'grade_differentiation_approved',
  'manual_grade_differentiation_approved',
  'manual_review_approved',
  'publication_approved',
  'unit_evidence_approved',
  'unit_evidence_reviewed'
])

const ROUTES = {
  ANCHOR_GROUP_DECISION: 'complete_anchor_group_decisions_before_item_review',
  ANCHOR_GROUP_SOURCE_EVIDENCE: 'collect_anchor_group_source_anchor_evidence_before_item_review',
  ANCHOR_GROUP_SPLIT: 'split_anchor_group_scope_before_item_review',
  BUILD_UNIT_EVIDENCE: 'build_unit_chapter_evidence_from_file_level_sources',
  LOW_CONFIDENCE_GAP: 'source_coverage_or_low_confidence_evidence_gap',
  PARTIAL_ASSIGNMENT: 'repair_or_confirm_single_partial_grade_assignment',
  PRODUCT_READY: 'product_ready_no_action',
  SOURCE_ANCHOR_ANCHOR_GAP: 'collect_missing_target_grade_anchors_before_decision_review',
  SOURCE_ANCHOR_READY: 'manual_source_anchor_specificity_decision_review',
  SOURCE_ANCHOR_REPAIR: 'repair_partial_progression_group_or_standard_context_before_anchor_review',
  UNIT_EVIDENCE_PIPELINE: 'expand_existing_unit_evidence_pipeline'
}

const ROUTE_PRIORITY = {
  [ROUTES.ANCHOR_GROUP_DECISION]: 10,
  [ROUTES.ANCHOR_GROUP_SPLIT]: 11,
  [ROUTES.ANCHOR_GROUP_SOURCE_EVIDENCE]: 12,
  [ROUTES.SOURCE_ANCHOR_READY]: 15,
  [ROUTES.SOURCE_ANCHOR_ANCHOR_GAP]: 16,
  [ROUTES.SOURCE_ANCHOR_REPAIR]: 17,
  [ROUTES.UNIT_EVIDENCE_PIPELINE]: 20,
  [ROUTES.PARTIAL_ASSIGNMENT]: 30,
  [ROUTES.BUILD_UNIT_EVIDENCE]: 40,
  [ROUTES.LOW_CONFIDENCE_GAP]: 50,
  [ROUTES.PRODUCT_READY]: 90
}

function parseArgs(argv) {
  const args = {
    anchorGroupDecisions: DEFAULT_ANCHOR_GROUP_DECISIONS,
    dataRoot: DEFAULT_DATA_ROOT,
    groupReadyCandidate: DEFAULT_GROUP_READY_CANDIDATE,
    issueMatrix: DEFAULT_ISSUE_MATRIX,
    out: DEFAULT_OUT,
    productReadiness: DEFAULT_PRODUCT_READINESS,
    requireItems: false,
    sourceAnchorGroupTriage: DEFAULT_SOURCE_ANCHOR_GROUP_TRIAGE,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--anchor-group-decisions') args.anchorGroupDecisions = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--group-ready-candidate') args.groupReadyCandidate = argv[++i]
    else if (item === '--issue-matrix') args.issueMatrix = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--product-readiness') args.productReadiness = argv[++i]
    else if (item === '--source-anchor-group-triage') args.sourceAnchorGroupTriage = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/build_h4g_product_readiness_worklist.js \\
  --strict --require-items

Builds a read-only group-level remediation worklist for the H4G product
readiness gate. It routes each H4G7/H4G8/H4G9 progression group to the next
safe batch without writing public/data or changing official standard text.`)
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

function optionalJson(path, warnings, label) {
  if (!path || !existsSync(path)) {
    warnings.push(`Optional ${label} not found: ${path}`)
    return null
  }
  return readJson(path)
}

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function markdownCell(value) {
  return normalizeText(value).replace(/\|/g, '\\|')
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function pct(numerator, denominator) {
  if (!denominator) return 0
  return Number((numerator / denominator).toFixed(4))
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function groupKey(record) {
  return record.progression_group_id || [
    record.subject_slug,
    normalizeText(record.domain),
    normalizeText(record.subdomain),
    normalizeText(record.standard)
  ].join('|')
}

function coreSignature(record) {
  return CORE_TEXT_FIELDS.map(field => normalizeText(record[field])).join('\n---\n')
}

function focusDistinctSignature(value) {
  return normalizeText(value)
    .replace(/^候选[:：]\s*/, '')
    .replace(/七年级|八年级|九年级|7年级|8年级|9年级|H4G7|H4G8|H4G9/gi, '{grade}')
    .replace(/\s+/g, '')
}

function hasUnitLevelEvidence(record) {
  const evidence = [
    ...(Array.isArray(record.textbook_unit_evidence) ? record.textbook_unit_evidence : []),
    ...(Array.isArray(record.textbook_evidence) ? record.textbook_evidence : [])
  ]
  const hasUnitEvidenceIds = Array.isArray(record.textbook_unit_evidence_ids) && record.textbook_unit_evidence_ids.length > 0
  return evidence.some(item => (
    item.unit_evidence_id ||
    item.unit_title ||
    item.chapter_title ||
    item.section_title ||
    item.page_range ||
    item.page_start ||
    item.matched_keywords?.length
  )) || (record.evidence_granularity === 'textbook_unit_level' && hasUnitEvidenceIds)
}

function isPlaceholderFocus(value) {
  const text = normalizeText(value)
  return !text ||
    text.startsWith('待基于') ||
    text.includes('待基于') ||
    (text.includes('补充本年级专属学习重点') && !text.startsWith('候选：'))
}

function hasUsableGradeFocus(record) {
  return !isPlaceholderFocus(record.grade_specific_focus)
}

function isReviewApproved(record) {
  return APPROVED_REVIEW_STATUSES.has(String(record.review_status || ''))
}

function isProductReadyRecord(record) {
  return hasUsableGradeFocus(record) && hasUnitLevelEvidence(record) && isReviewApproved(record)
}

function recordBlockers(record) {
  const blockers = []
  if (!hasUsableGradeFocus(record)) blockers.push('missing_or_placeholder_grade_specific_focus')
  if (!hasUnitLevelEvidence(record)) blockers.push('missing_unit_level_evidence')
  if (!isReviewApproved(record)) blockers.push('review_not_approved')
  return blockers
}

function loadGroups(dataRoot, errors) {
  const files = subjectFiles(dataRoot)
  if (!files.length) errors.push(`Missing by_subject JSON files under ${dataRoot}`)
  const groups = new Map()
  for (const file of files) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(file)
    for (const row of payload.standards || []) {
      if (!TARGET_GRADE_SET.has(row.grade_band)) continue
      const record = {
        ...row,
        subject: row.subject || payload.subject || subjectSlug,
        subject_slug: row.subject_slug || subjectSlug
      }
      const key = groupKey(record)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(record)
    }
  }
  return groups
}

function mapAnchorDecisions(payload) {
  const out = new Map()
  for (const row of payload?.group_review_decisions || []) {
    if (row.progression_group_id) out.set(row.progression_group_id, row)
  }
  return out
}

function mapSourceAnchorTriage(payload) {
  const out = new Map()
  for (const row of payload?.source_anchor_specificity_group_triage_items || []) {
    if (row.progression_group_id) out.set(row.progression_group_id, row)
  }
  return out
}

function mapGroupReadyCandidates(payload) {
  const out = new Map()
  for (const row of payload?.candidates || []) {
    const groupId = row.progression_group_id || ''
    if (!groupId) continue
    if (!out.has(groupId)) out.set(groupId, [])
    out.get(groupId).push(row)
  }
  return out
}

function groupFacts(groupId, records) {
  const presentGradeBands = TARGET_GRADE_BANDS.filter(grade => records.some(row => row.grade_band === grade))
  const missingGradeBands = TARGET_GRADE_BANDS.filter(grade => !records.some(row => row.grade_band === grade))
  const duplicateGradeBands = TARGET_GRADE_BANDS.filter(grade => records.filter(row => row.grade_band === grade).length > 1)
  const completeTriplet = missingGradeBands.length === 0 && duplicateGradeBands.length === 0
  const focusSignatures = records
    .filter(record => TARGET_GRADE_SET.has(record.grade_band) && hasUsableGradeFocus(record))
    .map(record => focusDistinctSignature(record.grade_specific_focus))
  const focusDistinct = completeTriplet &&
    focusSignatures.length === TARGET_GRADE_BANDS.length &&
    new Set(focusSignatures).size === TARGET_GRADE_BANDS.length
  const recordBlockerCounts = {}
  for (const record of records) {
    for (const blocker of recordBlockers(record)) countInto(recordBlockerCounts, blocker)
  }
  const groupBlockers = []
  if (!completeTriplet) groupBlockers.push('incomplete_or_duplicate_h4g_grade_assignment')
  if (records.some(record => !hasUsableGradeFocus(record))) groupBlockers.push('missing_or_placeholder_grade_specific_focus')
  if (records.some(record => !hasUnitLevelEvidence(record))) groupBlockers.push('missing_unit_level_evidence')
  if (records.some(record => !isReviewApproved(record))) groupBlockers.push('review_not_approved')
  if (completeTriplet && !focusDistinct) groupBlockers.push('grade_specific_focus_not_distinct_across_h4g_siblings')
  const productReadyRecords = records.filter(isProductReadyRecord).length
  return {
    complete_triplet: completeTriplet,
    duplicate_grade_bands: duplicateGradeBands,
    exact_core_identical: completeTriplet && new Set(records.map(coreSignature)).size === 1,
    focus_distinct_across_grades: focusDistinct,
    group_blockers: groupBlockers,
    low_confidence_records: records.filter(row => String(row.review_status || '').includes('low_confidence')).length,
    missing_grade_bands: missingGradeBands,
    present_grade_bands: presentGradeBands,
    product_ready_group: completeTriplet && productReadyRecords === records.length && focusDistinct,
    product_ready_records: productReadyRecords,
    record_blocker_counts: recordBlockerCounts,
    records: records.length,
    unit_level_records: records.filter(hasUnitLevelEvidence).length,
    usable_focus_records: records.filter(hasUsableGradeFocus).length
  }
}

function routeFor(facts, records, sourceArtifacts) {
  if (facts.product_ready_group) return ROUTES.PRODUCT_READY
  const anchorDecision = sourceArtifacts.anchor_group_decision?.reviewer_decision
  if (anchorDecision === 'pending') return ROUTES.ANCHOR_GROUP_DECISION
  if (anchorDecision === 'split_or_refine_group_scope') return ROUTES.ANCHOR_GROUP_SPLIT
  if (anchorDecision === 'needs_source_anchor_evidence') return ROUTES.ANCHOR_GROUP_SOURCE_EVIDENCE
  const sourceAnchorRoute = sourceArtifacts.source_anchor_group_triage?.triage_route
  if (sourceAnchorRoute === 'ready_for_manual_source_anchor_specificity_decision_review') return ROUTES.SOURCE_ANCHOR_READY
  if (sourceAnchorRoute === 'collect_missing_target_grade_anchors_before_decision_review') return ROUTES.SOURCE_ANCHOR_ANCHOR_GAP
  if (sourceAnchorRoute === 'repair_partial_progression_group_or_standard_context_before_anchor_review') return ROUTES.SOURCE_ANCHOR_REPAIR
  if (facts.unit_level_records > 0 || sourceArtifacts.group_ready_candidate_count > 0) return ROUTES.UNIT_EVIDENCE_PIPELINE
  if (!facts.complete_triplet) return ROUTES.PARTIAL_ASSIGNMENT
  if (facts.low_confidence_records > 0 || records.some(record => !record.evidence_granularity || record.evidence_granularity === 'none')) {
    return ROUTES.LOW_CONFIDENCE_GAP
  }
  return ROUTES.BUILD_UNIT_EVIDENCE
}

function nextGate(route) {
  return {
    [ROUTES.ANCHOR_GROUP_DECISION]: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-triage-decisions -- --strict --require-groups --require-complete',
    [ROUTES.ANCHOR_GROUP_SOURCE_EVIDENCE]: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-source-evidence-batch -- --strict --require-requests',
    [ROUTES.ANCHOR_GROUP_SPLIT]: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-split-review-batch -- --strict --require-candidates',
    [ROUTES.BUILD_UNIT_EVIDENCE]: 'npm run textbooks:audit-h4g-unit-candidates -- --strict --require-candidates',
    [ROUTES.LOW_CONFIDENCE_GAP]: 'npm run textbooks:h4g-unit-blocker-match-diagnostics -- --strict',
    [ROUTES.PARTIAL_ASSIGNMENT]: 'npm run grade7_9:audit-h4g-grade-differentiation -- --strict',
    [ROUTES.PRODUCT_READY]: 'npm run grade7_9:audit-h4g-product-readiness -- --strict --require-product-ready',
    [ROUTES.SOURCE_ANCHOR_ANCHOR_GAP]: 'npm run textbooks:audit-h4g-unit-anchor-policy-source-anchor-specificity-evidence-packet -- --strict --require-items',
    [ROUTES.SOURCE_ANCHOR_READY]: 'npm run textbooks:audit-h4g-unit-anchor-policy-source-anchor-specificity-decisions -- --strict --require-items',
    [ROUTES.SOURCE_ANCHOR_REPAIR]: 'npm run grade7_9:audit-h4g-grade-differentiation -- --strict',
    [ROUTES.UNIT_EVIDENCE_PIPELINE]: 'npm run textbooks:audit-h4g-unit-consistency -- --strict --require-candidates'
  }[route] || ''
}

function sourceArtifactSummary(groupId, maps) {
  const anchor = maps.anchorDecisions.get(groupId) || null
  const sourceAnchor = maps.sourceAnchorTriage.get(groupId) || null
  const groupReadyCandidates = maps.groupReadyCandidates.get(groupId) || []
  return {
    anchor_group_decision: anchor ? {
      decision_id: anchor.decision_id || '',
      priority_rank: anchor.priority_rank || null,
      priority_tier: anchor.priority_tier || '',
      reviewer_decision: anchor.reviewer_decision || '',
      review_strategy: anchor.review_strategy || ''
    } : null,
    group_ready_candidate_count: groupReadyCandidates.length,
    group_ready_candidate_standard_codes: groupReadyCandidates.map(row => row.standard_code || '').filter(Boolean),
    source_anchor_group_triage: sourceAnchor ? {
      anchor_grade_bands: sourceAnchor.anchor_grade_bands || [],
      missing_target_anchor_grade_bands: sourceAnchor.missing_target_anchor_grade_bands || [],
      next_gate: sourceAnchor.next_gate || '',
      triage_route: sourceAnchor.triage_route || ''
    } : null
  }
}

function buildItem(groupId, records, maps) {
  const facts = groupFacts(groupId, records)
  const artifacts = sourceArtifactSummary(groupId, maps)
  const route = routeFor(facts, records, artifacts)
  const first = records[0] || {}
  return {
    changes_official_standard_text: false,
    codes: records.map(record => record.code || record.id || '').filter(Boolean).sort((a, b) => a.localeCompare(b)),
    direct_matcher_use: false,
    group_blockers: facts.group_blockers,
    group_facts: facts,
    h4g_product_readiness_work_item_id: `h4g_product_readiness_work_${hashText(groupId)}`,
    next_gate: nextGate(route),
    priority: ROUTE_PRIORITY[route] || 80,
    product_ready_group: facts.product_ready_group,
    progression_group_id: groupId,
    records_by_grade_band: Object.fromEntries(TARGET_GRADE_BANDS.map(grade => {
      const row = records.find(record => record.grade_band === grade)
      return [grade, row ? {
        code: row.code || row.id || '',
        evidence_granularity: row.evidence_granularity || '',
        grade_specific_focus_excerpt: normalizeText(row.grade_specific_focus).slice(0, 180),
        product_ready_record: isProductReadyRecord(row),
        record_blockers: recordBlockers(row),
        review_status: row.review_status || ''
      } : null]
    })),
    recommended_route: route,
    source_artifacts: artifacts,
    standard_excerpt: normalizeText(first.standard).slice(0, 220),
    subject: first.subject || first.subject_slug || '',
    subject_slug: first.subject_slug || '',
    writes_public_data: false
  }
}

function summarize(items) {
  const summary = {
    by_group_blocker: {},
    by_recommended_route: {},
    by_subject: {},
    product_ready_groups: 0,
    total_work_items: items.length,
    work_items_requiring_action: 0
  }
  for (const item of items) {
    countInto(summary.by_recommended_route, item.recommended_route)
    countInto(summary.by_subject, item.subject_slug)
    for (const blocker of item.group_blockers || []) countInto(summary.by_group_blocker, blocker)
    if (item.product_ready_group) summary.product_ready_groups += 1
    else summary.work_items_requiring_action += 1
  }
  summary.action_required_rate = pct(summary.work_items_requiring_action, summary.total_work_items)
  return summary
}

function validateInputs(productReadiness, issueMatrix, anchorDecisions, sourceAnchorTriage, groupReadyCandidate, errors) {
  if (productReadiness?.valid !== true) errors.push('product readiness valid must be true')
  if (productReadiness?.purpose !== 'h4g_product_readiness_audit') errors.push('product readiness purpose mismatch')
  if (productReadiness?.writes_public_data !== false) errors.push('product readiness writes_public_data must be false')
  if (issueMatrix?.valid !== true) errors.push('issue matrix valid must be true')
  if (issueMatrix?.purpose !== 'h4g_differentiation_issue_matrix') errors.push('issue matrix purpose mismatch')
  if (anchorDecisions && anchorDecisions.valid !== true) errors.push('anchor group decisions valid must be true')
  if (sourceAnchorTriage && sourceAnchorTriage.valid !== true) errors.push('source anchor group triage valid must be true')
  if (groupReadyCandidate && groupReadyCandidate.valid !== true) errors.push('group ready candidate valid must be true')
}

function markdownSummary(payload) {
  const routeRows = countRows(payload.summary.by_recommended_route)
  const blockerRows = countRows(payload.summary.by_group_blocker)
  const subjectRows = countRows(payload.summary.by_subject)
  const itemRows = payload.work_items
    .slice(0, 40)
    .map(item => `| ${markdownCell(item.subject_slug)} | ${markdownCell(item.progression_group_id)} | ${markdownCell(item.recommended_route)} | ${item.priority} | ${item.group_facts.product_ready_records}/${item.group_facts.records} | ${markdownCell((item.group_blockers || []).join(', '))} |`)
    .join('\n') || '| - | - | - | 0 | 0/0 | - |'
  return `# H4G Product Readiness Worklist

Generated at: ${payload.generated_at}

This read-only worklist routes every H4G7/H4G8/H4G9 progression group to the
next safe remediation batch. It does not write public/data or change official
standard text.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| total work items | ${payload.summary.total_work_items} |
| work items requiring action | ${payload.summary.work_items_requiring_action} |
| product-ready groups | ${payload.summary.product_ready_groups} |
| action required rate | ${payload.summary.action_required_rate} |

## Routes

| route | groups |
| --- | ---: |
${routeRows}

## Group Blockers

| blocker | groups |
| --- | ---: |
${blockerRows}

## Subjects

| subject | groups |
| --- | ---: |
${subjectRows}

## Top Work Items

| subject | progression group | route | priority | ready records | blockers |
| --- | --- | --- | ---: | ---: | --- |
${itemRows}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${payload.warnings.length ? payload.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const warnings = []
  const productReadiness = optionalJson(args.productReadiness, warnings, 'product readiness')
  const issueMatrix = optionalJson(args.issueMatrix, warnings, 'issue matrix')
  const anchorDecisions = optionalJson(args.anchorGroupDecisions, warnings, 'anchor group decisions')
  const sourceAnchorTriage = optionalJson(args.sourceAnchorGroupTriage, warnings, 'source anchor group triage')
  const groupReadyCandidate = optionalJson(args.groupReadyCandidate, warnings, 'group ready candidate')
  validateInputs(productReadiness, issueMatrix, anchorDecisions, sourceAnchorTriage, groupReadyCandidate, errors)

  const groups = loadGroups(args.dataRoot, errors)
  const maps = {
    anchorDecisions: mapAnchorDecisions(anchorDecisions),
    groupReadyCandidates: mapGroupReadyCandidates(groupReadyCandidate),
    sourceAnchorTriage: mapSourceAnchorTriage(sourceAnchorTriage)
  }
  const workItems = [...groups.entries()]
    .map(([groupId, records]) => buildItem(groupId, records, maps))
    .sort((a, b) => a.priority - b.priority || a.subject_slug.localeCompare(b.subject_slug) || a.progression_group_id.localeCompare(b.progression_group_id))

  if (args.requireItems && !workItems.length) errors.push('requireItems is set but no work items were generated')
  const summary = summarize(workItems)
  if (productReadiness?.summary?.progression_groups !== undefined &&
      Number(productReadiness.summary.progression_groups) !== summary.total_work_items) {
    errors.push(`work item count ${summary.total_work_items} does not match product readiness progression_groups ${productReadiness.summary.progression_groups}`)
  }

  const payload = {
    changes_official_standard_text: false,
    data_root: args.dataRoot,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    product_readiness_worklist_only: true,
    publication_ready: false,
    purpose: 'h4g_product_readiness_worklist',
    source_inputs: {
      anchor_group_decisions: args.anchorGroupDecisions,
      group_ready_candidate: args.groupReadyCandidate,
      issue_matrix: args.issueMatrix,
      product_readiness: args.productReadiness,
      source_anchor_group_triage: args.sourceAnchorGroupTriage
    },
    summary,
    target_grade_bands: TARGET_GRADE_BANDS,
    valid: errors.length === 0,
    warnings,
    work_items: workItems,
    writes_public_data: false
  }

  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(payload, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
