#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_ANCHOR_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/grade7_9_h4g_progression_decision_model.json'
const DEFAULT_SUMMARY_OUT = 'generated/grade7_9_h4g_progression_decision_model.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']
const TARGET_GRADE_SET = new Set(TARGET_GRADE_BANDS)
const CORE_TEXT_FIELDS = ['domain', 'subdomain', 'standard', 'context', 'practice', 'teaching_tip', 'assessment_evidence_type']
const SOURCE_TEXT_FIELDS = ['domain', 'subdomain', 'standard']
const APPROVED_REVIEW_STATUSES = new Set([
  'grade_differentiation_approved',
  'manual_grade_differentiation_approved',
  'manual_review_approved',
  'unit_evidence_approved',
  'unit_evidence_reviewed',
  'publication_approved'
])

const ROUTE_PRIORITY = {
  anchor_group_split_before_item_review: 10,
  anchor_group_source_evidence_gap_review: 11,
  anchor_group_decision_review: 12,
  unit_evidence_focus_completion: 20,
  unit_evidence_review_completion: 25,
  partial_grade_scope_assignment_review: 30,
  shared_source_unit_evidence_required: 40,
  grade_specific_source_variant_needs_evidence_gate: 45,
  source_coverage_or_low_confidence_gap: 50,
  reviewed_grade_focus_verified: 80,
  manual_review_required: 90
}

function parseArgs(argv) {
  const args = {
    anchorWorklist: DEFAULT_ANCHOR_WORKLIST,
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--anchor-worklist') args.anchorWorklist = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/build_h4g_progression_decision_model.js \\
  --data-root public/data \\
  --anchor-worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json \\
  --strict

Builds a read-only group-level decision model for all public H4G7/H4G8/H4G9
progression groups. The model classifies each group into the next safe review
route before any grade-specific focus, matcher use, or public-data write.`)
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

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function signature(record, fields) {
  return fields.map(field => normalizeText(record[field])).join('\n---\n')
}

function groupKey(record) {
  return record.progression_group_id || [
    record.subject_slug,
    normalizeText(record.domain),
    normalizeText(record.subdomain),
    normalizeText(record.standard)
  ].join('|')
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function pct(numerator, denominator) {
  if (!denominator) return 0
  return Number((numerator / denominator).toFixed(4))
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

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
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

function evidenceGranularity(record) {
  if (hasUnitLevelEvidence(record)) return 'textbook_unit_level'
  if (!Array.isArray(record.textbook_evidence_ids) || record.textbook_evidence_ids.length === 0) return 'none'
  return 'textbook_file_grade_level'
}

function isPlaceholderFocus(value) {
  const text = normalizeText(value)
  return !text ||
    text.startsWith('待基于') ||
    text.includes('待基于') ||
    text.includes('补充本年级专属学习重点') && !text.startsWith('候选：')
}

function hasUsableGradeFocus(record) {
  return !isPlaceholderFocus(record.grade_specific_focus)
}

function isReviewApproved(record) {
  return APPROVED_REVIEW_STATUSES.has(String(record.review_status || ''))
}

function isFinalDifferentiated(record) {
  return hasUsableGradeFocus(record) && hasUnitLevelEvidence(record) && isReviewApproved(record)
}

function loadH4GRecords(dataRoot, errors) {
  const bySubjectDir = join(dataRoot, 'by_subject')
  if (!existsSync(bySubjectDir)) {
    errors.push(`Missing public data by_subject directory: ${bySubjectDir}`)
    return []
  }

  const records = []
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(file)
    for (const record of payload.standards || []) {
      if (!TARGET_GRADE_SET.has(record.grade_band)) continue
      records.push({
        ...record,
        subject_slug: record.subject_slug || subjectSlug,
        subject: record.subject || payload.subject || subjectSlug
      })
    }
  }
  records.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
  return records
}

function validateAnchorWorklist(worklist, errors) {
  if (!worklist) return
  if (worklist.valid !== true) errors.push('anchor worklist must be valid=true')
  if (worklist.review_only !== true) errors.push('anchor worklist must be review_only=true')
  if (worklist.writes_public_data !== false) errors.push('anchor worklist writes_public_data must be false')
  if (worklist.changes_official_standard_text !== false) errors.push('anchor worklist changes_official_standard_text must be false')
  if (worklist.direct_matcher_use !== false) errors.push('anchor worklist direct_matcher_use must be false')
  if (worklist.matcher_ready !== false) errors.push('anchor worklist matcher_ready must be false')
  if (worklist.publication_ready !== false) errors.push('anchor worklist publication_ready must be false')
}

function loadAnchorWorklist(path, warnings, errors) {
  if (!path || !existsSync(path)) {
    warnings.push(`Anchor worklist not found; English/PE group routes will rely on public data only: ${path}`)
    return { byGroup: new Map(), payload: null }
  }
  const payload = readJson(path)
  validateAnchorWorklist(payload, errors)
  const byGroup = new Map()
  for (const item of payload.action_work_items || []) {
    if (!item.progression_group_id) continue
    byGroup.set(item.progression_group_id, item)
  }
  return { byGroup, payload }
}

function recordsByGroup(records) {
  const groups = new Map()
  for (const record of records) {
    const key = groupKey(record)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }
  return groups
}

function routeForGroup(facts, anchorItem) {
  if (anchorItem) {
    if (anchorItem.recommended_reviewer_decision === 'split_or_refine_group_scope') {
      return 'anchor_group_split_before_item_review'
    }
    if (anchorItem.recommended_reviewer_decision === 'needs_source_anchor_evidence') {
      return 'anchor_group_source_evidence_gap_review'
    }
    return 'anchor_group_decision_review'
  }
  if (!facts.complete_triplet) return 'partial_grade_scope_assignment_review'
  if (facts.final_ready_records === facts.record_count && facts.record_count > 0) return 'reviewed_grade_focus_verified'
  if (facts.exact_core_identical && facts.final_ready_records > 0) return 'unit_evidence_focus_completion'
  if (facts.exact_core_identical && facts.unit_level_evidence_records > 0) return 'unit_evidence_review_completion'
  if (facts.no_evidence_records > 0 || facts.low_confidence_records > 0) return 'source_coverage_or_low_confidence_gap'
  if (facts.exact_core_identical) return 'shared_source_unit_evidence_required'
  if (!facts.source_identical) return 'grade_specific_source_variant_needs_evidence_gate'
  return 'manual_review_required'
}

function layerForGroup(facts) {
  if (!facts.complete_triplet) return 'partial_grade_scope'
  if (facts.final_ready_records === facts.record_count && facts.record_count > 0) return 'reviewed_grade_focus_layer'
  if (facts.exact_core_identical) return 'shared_7_9_source_standard'
  if (!facts.source_identical) return 'grade_specific_source_text'
  return 'mixed_or_unclear_source_layer'
}

function safeNextGate(route) {
  const gates = {
    anchor_group_split_before_item_review: 'Split broad anchor group into bounded standard/grade/anchor slices, then run anchor group decision audit.',
    anchor_group_source_evidence_gap_review: 'Collect source anchor evidence for missing or weak grade slots before item-level source review.',
    anchor_group_decision_review: 'Complete anchor group review before matcher or publication use.',
    unit_evidence_focus_completion: 'Continue unit evidence pipeline for missing records in the group; keep shared source standard text unchanged.',
    unit_evidence_review_completion: 'Review unit-level evidence and grade focus before any publication decision.',
    partial_grade_scope_assignment_review: 'Repair or confirm partial grade scope; do not invent missing grade records.',
    shared_source_unit_evidence_required: 'Build same-grade unit/chapter evidence before writing grade_specific_focus.',
    grade_specific_source_variant_needs_evidence_gate: 'Verify source grade specificity and unit evidence before treating as grade-differentiated.',
    source_coverage_or_low_confidence_gap: 'Fix source coverage or keep low-confidence status; no grade-specific publication.',
    reviewed_grade_focus_verified: 'Already reviewed at record level; keep under publication gate and continue group coverage checks.',
    manual_review_required: 'Manual data owner review required.'
  }
  return gates[route] || gates.manual_review_required
}

function groupFacts(groupId, rows, anchorItem) {
  const gradeBands = sorted(rows.map(row => row.grade_band))
  const missingGradeBands = TARGET_GRADE_BANDS.filter(band => !gradeBands.includes(band))
  const duplicateGradeBands = TARGET_GRADE_BANDS.filter(band => rows.filter(row => row.grade_band === band).length > 1)
  const completeTriplet = missingGradeBands.length === 0
  const coreSignatures = new Set(rows.map(row => signature(row, CORE_TEXT_FIELDS)))
  const sourceSignatures = new Set(rows.map(row => signature(row, SOURCE_TEXT_FIELDS)))
  const exactCoreIdentical = completeTriplet && coreSignatures.size === 1
  const sourceIdentical = completeTriplet && sourceSignatures.size === 1
  const byEvidenceGranularity = {}
  const byReviewStatus = {}
  const byVariantType = {}
  const byAssignmentType = {}
  let unitLevelEvidenceRecords = 0
  let usableGradeFocusRecords = 0
  let finalReadyRecords = 0
  let noEvidenceRecords = 0
  let lowConfidenceRecords = 0

  for (const record of rows) {
    const granularity = evidenceGranularity(record)
    countInto(byEvidenceGranularity, granularity)
    countInto(byReviewStatus, record.review_status)
    countInto(byVariantType, record.standard_variant_type)
    countInto(byAssignmentType, record.grade_assignment_type)
    if (granularity === 'textbook_unit_level') unitLevelEvidenceRecords += 1
    if (hasUsableGradeFocus(record)) usableGradeFocusRecords += 1
    if (isFinalDifferentiated(record)) finalReadyRecords += 1
    if (granularity === 'none') noEvidenceRecords += 1
    if (String(record.review_status || '').includes('low_confidence') || String(record.grade_assignment_type || '').includes('low_confidence')) {
      lowConfidenceRecords += 1
    }
  }

  const base = {
    anchor_recommendation: anchorItem?.recommended_reviewer_decision || '',
    anchor_work_path: anchorItem?.work_path || '',
    complete_triplet: completeTriplet,
    duplicate_grade_bands: duplicateGradeBands,
    exact_core_identical: exactCoreIdentical,
    final_ready_records: finalReadyRecords,
    grade_bands: gradeBands,
    low_confidence_records: lowConfidenceRecords,
    missing_grade_bands: missingGradeBands,
    no_evidence_records: noEvidenceRecords,
    record_count: rows.length,
    source_identical: sourceIdentical,
    subject: rows[0]?.subject || rows[0]?.subject_slug || '',
    subject_slug: rows[0]?.subject_slug || '',
    unit_level_evidence_records: unitLevelEvidenceRecords,
    usable_grade_focus_records: usableGradeFocusRecords
  }
  const route = routeForGroup(base, anchorItem)
  const layer = layerForGroup(base)
  return {
    ...base,
    by_evidence_granularity: byEvidenceGranularity,
    by_grade_assignment_type: byAssignmentType,
    by_review_status: byReviewStatus,
    by_standard_variant_type: byVariantType,
    decision_layer: layer,
    decision_route: route,
    decision_route_priority: ROUTE_PRIORITY[route] || 90,
    next_gate: safeNextGate(route),
    progression_group_id: groupId,
    sample_standard_excerpt: normalizeText(rows[0]?.standard).slice(0, 180),
    standard_codes: sorted(rows.map(row => row.code)),
    standard_domains: sorted(rows.map(row => row.domain)),
    standard_subdomains: sorted(rows.map(row => row.subdomain))
  }
}

function summarizeGroups(groups) {
  const summary = {
    by_decision_layer: {},
    by_decision_route: {},
    by_subject: {},
    by_subject_route: {},
    complete_triplets: 0,
    exact_core_identical_triplets: 0,
    final_ready_groups: 0,
    final_ready_records: 0,
    h4g_records: 0,
    incomplete_groups: 0,
    low_confidence_records: 0,
    progression_groups: groups.length,
    records_missing_grade_focus: 0,
    records_missing_unit_evidence: 0,
    unit_level_evidence_records: 0,
    usable_grade_focus_records: 0
  }

  for (const group of groups) {
    countInto(summary.by_decision_layer, group.decision_layer)
    countInto(summary.by_decision_route, group.decision_route)
    countInto(summary.by_subject, group.subject_slug)
    summary.by_subject_route[group.subject_slug] ||= {}
    countInto(summary.by_subject_route[group.subject_slug], group.decision_route)
    summary.h4g_records += group.record_count
    summary.final_ready_records += group.final_ready_records
    summary.unit_level_evidence_records += group.unit_level_evidence_records
    summary.usable_grade_focus_records += group.usable_grade_focus_records
    summary.low_confidence_records += group.low_confidence_records
    summary.records_missing_grade_focus += Math.max(0, group.record_count - group.usable_grade_focus_records)
    summary.records_missing_unit_evidence += Math.max(0, group.record_count - group.unit_level_evidence_records)
    if (group.complete_triplet) summary.complete_triplets += 1
    else summary.incomplete_groups += 1
    if (group.exact_core_identical) summary.exact_core_identical_triplets += 1
    if (group.final_ready_records === group.record_count && group.record_count > 0) summary.final_ready_groups += 1
  }
  summary.rates = {
    exact_core_identical_triplet_rate: pct(summary.exact_core_identical_triplets, summary.complete_triplets),
    final_ready_group_rate: pct(summary.final_ready_groups, summary.progression_groups),
    final_ready_record_rate: pct(summary.final_ready_records, summary.h4g_records),
    unit_level_evidence_record_rate: pct(summary.unit_level_evidence_records, summary.h4g_records),
    usable_grade_focus_record_rate: pct(summary.usable_grade_focus_records, summary.h4g_records)
  }
  return summary
}

function validateModel(groups, anchorByGroup, errors, warnings) {
  if (!groups.length) errors.push('No H4G progression groups found')
  const groupIds = new Set(groups.map(group => group.progression_group_id))
  for (const group of groups) {
    if (!group.subject_slug) errors.push(`${group.progression_group_id} missing subject_slug`)
    if (!group.standard_codes.length) errors.push(`${group.progression_group_id} missing standard_codes`)
    if (group.duplicate_grade_bands.length) {
      errors.push(`${group.progression_group_id} has duplicate grade bands: ${group.duplicate_grade_bands.join(', ')}`)
    }
    if (group.decision_route === 'reviewed_grade_focus_verified' && group.exact_core_identical && group.unit_level_evidence_records !== group.record_count) {
      errors.push(`${group.progression_group_id} marked reviewed but lacks unit-level evidence for every record`)
    }
  }
  for (const groupId of anchorByGroup.keys()) {
    if (!groupIds.has(groupId)) warnings.push(`Anchor worklist group not found in public H4G data: ${groupId}`)
  }
}

function groupRows(groups) {
  return groups.map(group => (
    `| ${markdownCell(group.subject_slug)} | ${markdownCell(group.progression_group_id)} | ${group.record_count} | ${markdownCell(group.grade_bands.join(', '))} | ${markdownCell(group.decision_layer)} | ${markdownCell(group.decision_route)} | ${group.unit_level_evidence_records} | ${group.usable_grade_focus_records} |`
  )).join('\n') || '| - | - | 0 | - | - | - | 0 | 0 |'
}

function subjectRouteRows(bySubjectRoute) {
  const rows = []
  for (const subjectSlug of Object.keys(bySubjectRoute || {}).sort((a, b) => a.localeCompare(b))) {
    for (const [route, count] of Object.entries(bySubjectRoute[subjectSlug]).sort(([a], [b]) => a.localeCompare(b))) {
      rows.push(`| ${markdownCell(subjectSlug)} | ${markdownCell(route)} | ${count} |`)
    }
  }
  return rows.join('\n') || '| - | - | 0 |'
}

function markdownSummary(payload) {
  const topGroups = payload.progression_groups.slice(0, 40)
  return `# H4G Progression Decision Model

Generated at: ${payload.generated_at}

This read-only model classifies every public H4G7/H4G8/H4G9 progression group
into the next safe review route. It does not write \`public/data\`, change
official standard text, approve matcher use, or mark publication readiness.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| H4G records | ${payload.summary.h4g_records} |
| progression groups | ${payload.summary.progression_groups} |
| complete triplets | ${payload.summary.complete_triplets} |
| exact core-identical triplets | ${payload.summary.exact_core_identical_triplets} |
| unit-level evidence records | ${payload.summary.unit_level_evidence_records} |
| usable grade-focus records | ${payload.summary.usable_grade_focus_records} |
| final-ready records | ${payload.summary.final_ready_records} |
| records missing unit evidence | ${payload.summary.records_missing_unit_evidence} |
| records missing grade focus | ${payload.summary.records_missing_grade_focus} |

## Decision Routes

| route | groups |
| --- | ---: |
${countRows(payload.summary.by_decision_route)}

## Decision Layers

| layer | groups |
| --- | ---: |
${countRows(payload.summary.by_decision_layer)}

## Subject Routes

| subject | route | groups |
| --- | --- | ---: |
${subjectRouteRows(payload.summary.by_subject_route)}

## Top Priority Groups

| subject | group | records | grade bands | layer | route | unit evidence | usable focus |
| --- | --- | ---: | --- | --- | --- | ---: | ---: |
${groupRows(topGroups)}

## Guardrails

- Keep official source-standard fields immutable.
- Treat complete, core-identical triplets as shared 7-9 source standards until reviewed same-grade unit evidence supports a grade focus.
- Use English/PE anchor group routes before item-level matcher or publication review.
- Keep low-confidence/no-source groups out of grade-specific publication until source coverage improves.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${payload.warnings.length ? payload.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
`
}

function buildModel(args) {
  const errors = []
  const warnings = []
  const records = loadH4GRecords(args.dataRoot, errors)
  const { byGroup: anchorByGroup, payload: anchorWorklist } = loadAnchorWorklist(args.anchorWorklist, warnings, errors)
  const groupsById = recordsByGroup(records)
  const groups = [...groupsById.entries()]
    .map(([groupId, rows]) => groupFacts(groupId, rows, anchorByGroup.get(groupId)))
    .sort((a, b) => {
      const route = a.decision_route_priority - b.decision_route_priority
      if (route) return route
      const subject = a.subject_slug.localeCompare(b.subject_slug)
      if (subject) return subject
      return a.progression_group_id.localeCompare(b.progression_group_id)
    })
  validateModel(groups, anchorByGroup, errors, warnings)

  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors: [...new Set(errors)],
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: {
      group_level_model_only: true,
      requires_reviewed_unit_evidence_for_grade_focus: true,
      writes_public_data: false,
      writes_textbook_unit_evidence_ids: false
    },
    progression_groups: groups,
    publication_ready: false,
    purpose: 'h4g_progression_decision_model',
    source_inputs: {
      anchor_worklist: args.anchorWorklist,
      anchor_worklist_summary: anchorWorklist?.summary || {},
      data_root: args.dataRoot
    },
    summary: summarizeGroups(groups),
    target_grade_bands: TARGET_GRADE_BANDS,
    valid: errors.length === 0,
    warnings: [...new Set(warnings)],
    writes_public_data: false
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const payload = buildModel(args)
  writeJson(args.out, payload)
  writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(payload, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
