#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions_template.json'
const DEFAULT_DATA_ROOT = 'public/data/by_subject'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_evidence_packet.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_evidence_packet.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
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
node scripts/textbooks/build_h4g_unit_evidence_anchor_policy_source_anchor_specificity_evidence_packet.js \\
  --strict --require-items

Builds a read-only progression-group evidence packet for H4G unit source-anchor
specificity review. The packet gathers sibling H4G7/H4G8/H4G9 standard context
and candidate unit anchors for reviewers. It does not edit decisions, write
public/data, change official standard text, or enable matcher/publication use.`)
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

function truncate(value, max = 96) {
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

function policy() {
  return {
    changes_official_standard_text: false,
    decision_template_only: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    evidence_packet_only: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_anchor_policy_decision_edit: true,
    requires_later_candidate_coverage_recheck: true,
    requires_later_consistency_gate: true,
    requires_later_manual_review: true,
    requires_later_publication_gate: true,
    review_batch_only: true,
    source_anchor_specificity_batch_only: true,
    source_anchor_specificity_evidence_packet_only: true,
    writes_public_data: false
  }
}

function validateDecisions(decisions, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('decisions editable_manual_review_template must be true')
  if (!Array.isArray(decisions.source_anchor_specificity_decisions)) {
    errors.push('decisions source_anchor_specificity_decisions must be an array')
  }
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (decisions[key] !== false) errors.push(`decisions ${key} must be false`)
  }
}

function isPlaceholderFocus(value) {
  const text = String(value || '').trim()
  return !text || text.startsWith('待基于') || text.includes('待基于') || text.includes('补充本年级专属学习重点')
}

function subjectRows(subjectSlug, dataRoot, cache, errors) {
  if (cache.has(subjectSlug)) return cache.get(subjectSlug)
  const path = join(dataRoot, `${subjectSlug}.json`)
  if (!existsSync(path)) {
    errors.push(`Missing subject data: ${path}`)
    const empty = []
    cache.set(subjectSlug, empty)
    return empty
  }
  const payload = readJson(path)
  const rows = payload.standards || payload.items || []
  cache.set(subjectSlug, rows)
  return rows
}

function standardByCode(subjectSlug, code, dataRoot, cache, errors) {
  return subjectRows(subjectSlug, dataRoot, cache, errors).find(row => row.code === code || row.id === code) || null
}

function standardSnapshot(record, code) {
  if (!record) {
    return {
      code,
      found_in_public_data: false
    }
  }
  return {
    code: record.code || code,
    context: record.context || '',
    domain: record.domain || '',
    evidence_granularity: record.evidence_granularity || '',
    found_in_public_data: true,
    grade: record.grade || '',
    grade_band: record.grade_band || '',
    grade_specific_focus: record.grade_specific_focus || '',
    grade_specific_focus_is_placeholder: isPlaceholderFocus(record.grade_specific_focus),
    practice: record.practice || '',
    progression_delta: record.progression_delta || '',
    progression_distinctiveness: record.progression_distinctiveness || '',
    progression_role: record.progression_role || '',
    review_status: record.review_status || '',
    source_standard_scope: record.source_standard_scope || '',
    standard: record.standard || '',
    standard_text_role: record.standard_text_role || '',
    standard_variant_type: record.standard_variant_type || '',
    subdomain: record.subdomain || '',
    teaching_tip: record.teaching_tip || '',
    textbook_evidence_ids: record.textbook_evidence_ids || [],
    textbook_unit_evidence_ids: record.textbook_unit_evidence_ids || []
  }
}

function sourceMatches(path, cache, warnings) {
  if (!path) return []
  if (cache.has(path)) return cache.get(path)
  if (!existsSync(path)) {
    warnings.push(`Optional source match file not found: ${path}`)
    const empty = []
    cache.set(path, empty)
    return empty
  }
  const payload = readJson(path)
  const rows = payload.matches || payload.standard_matches || payload.textbook_unit_standard_matches || []
  cache.set(path, rows)
  return rows
}

function sourceMatchFor(row, cache, warnings) {
  return sourceMatches(row.source_file || row.candidate_match?.source_file, cache, warnings)
    .find(match => match.match_id === row.candidate_match_id) || null
}

function compactSourceMatch(match) {
  if (!match) return null
  return {
    eligible_alignment: match.eligible_alignment || '',
    evidence_url: match.evidence_url || '',
    field_alignment: match.field_alignment || {},
    grade_band: match.grade_band || '',
    matched_keywords: match.matched_keywords || [],
    page_end: match.page_end ?? '',
    page_range_status: match.page_range_status || '',
    pdf_page_hint: match.pdf_page_hint ?? '',
    rationale: match.rationale || '',
    repository_path: match.repository_path || '',
    score: match.score ?? null,
    toc_raw_line: match.toc_raw_line || '',
    unit_evidence_id: match.unit_evidence_id || '',
    volume: match.volume || ''
  }
}

function decisionSummary(row, sourceMatch) {
  const candidateGrade = sourceMatch?.grade_band || row.candidate_match?.grade_band || row.grade_band || ''
  return {
    candidate_match: row.candidate_match || {},
    candidate_match_id: row.candidate_match_id || '',
    candidate_source_match: compactSourceMatch(sourceMatch),
    decision_id: row.decision_id || '',
    decision_status: row.decision_status || '',
    grade_alignment: {
      candidate_grade_band: candidateGrade,
      same_grade_candidate: candidateGrade === row.grade_band,
      target_grade_band: row.grade_band || ''
    },
    parent_anchor_policy_decision_id: row.parent_anchor_policy_decision_id || '',
    parent_work_queue: row.parent_work_queue || '',
    priority_rank: row.priority_rank || 0,
    reviewer_outcome: row.reviewer_outcome || '',
    source_anchor_specificity_review_item_id: row.source_anchor_specificity_review_item_id || '',
    source_file: row.source_file || row.candidate_match?.source_file || '',
    standard_code: row.standard_code || '',
    target_grade_band: row.grade_band || ''
  }
}

function summarizeAnchors(rows) {
  const summary = {
    by_candidate_grade_band: {},
    by_edition: {},
    by_page_range_status: {},
    by_parent_work_queue: {},
    by_reviewer_outcome: {},
    by_standard_code: {},
    candidate_anchor_decisions: rows.length,
    source_files: sorted(rows.map(row => row.source_file)).length,
    unique_candidate_matches: sorted(rows.map(row => row.candidate_match_id)).length
  }
  for (const row of rows) {
    countInto(summary.by_candidate_grade_band, row.grade_alignment?.candidate_grade_band)
    countInto(summary.by_edition, row.candidate_match?.edition)
    countInto(summary.by_page_range_status, row.candidate_match?.page_range ? 'page_range_ready' : 'missing_page_range')
    countInto(summary.by_parent_work_queue, row.parent_work_queue)
    countInto(summary.by_reviewer_outcome, row.reviewer_outcome)
    countInto(summary.by_standard_code, row.standard_code)
  }
  return summary
}

function evidencePacketItemId(progressionGroupId) {
  return `h4g_unit_source_anchor_specificity_evidence_${hashText(progressionGroupId)}`
}

function groupRows(rows) {
  const groups = new Map()
  for (const row of rows || []) {
    const key = row.progression_group_id || 'missing_progression_group'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return groups
}

function buildItem(progressionGroupId, rows, args, standardCache, sourceMatchCache, warnings, errors) {
  const first = rows[0] || {}
  const subjectSlug = first.subject_slug || ''
  const groupStandardCodes = sorted(rows.flatMap(row => row.group_standard_codes || []).concat(rows.map(row => row.standard_code)))
  const standards = groupStandardCodes.map(code => standardSnapshot(standardByCode(subjectSlug, code, args.dataRoot, standardCache, errors), code))
  const anchorRows = rows
    .map(row => decisionSummary(row, sourceMatchFor(row, sourceMatchCache, warnings)))
    .sort((a, b) => Number(a.priority_rank || 0) - Number(b.priority_rank || 0) ||
      a.standard_code.localeCompare(b.standard_code) ||
      a.candidate_match_id.localeCompare(b.candidate_match_id))
  const gradeBandsInStandards = sorted(standards.map(row => row.grade_band))
  const gradeBandsInAnchors = sorted(anchorRows.map(row => row.target_grade_band))
  return {
    anchor_summary: summarizeAnchors(anchorRows),
    changes_official_standard_text: false,
    decision_template_only: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    evidence_packet_item_id: evidencePacketItemId(progressionGroupId),
    evidence_packet_policy: policy(),
    evidence_packet_review_questions: [
      'Which candidate unit anchors are specific enough to support grade-level focus drafting?',
      'Do the candidate anchors separate H4G7, H4G8, and H4G9, or do they still reflect the shared 7-9 source standard?',
      'Are any candidate unit titles broad topic headings rather than standard-specific anchors?',
      'Which grade bands still need source coverage or page-level evidence before an anchor-policy decision can be edited?'
    ],
    evidence_packet_only: true,
    grade_bands_in_anchor_rows: gradeBandsInAnchors,
    grade_bands_in_standard_group: gradeBandsInStandards,
    group_progression_completeness: first.group_progression_completeness || '',
    group_standard_codes: groupStandardCodes,
    matcher_ready: false,
    missing_target_grade_bands_in_anchors: TARGET_GRADE_BANDS.filter(grade => !gradeBandsInAnchors.includes(grade)),
    publication_ready: false,
    progression_group_id: progressionGroupId,
    requires_later_anchor_policy_decision_edit: true,
    requires_later_candidate_coverage_recheck: true,
    requires_later_consistency_gate: true,
    requires_later_manual_review: true,
    requires_later_publication_gate: true,
    review_batch_only: true,
    source_anchor_decision_rows: anchorRows,
    source_anchor_specificity_batch_only: true,
    source_anchor_specificity_evidence_packet_only: true,
    standard_context_by_grade: standards,
    subject_slug: subjectSlug,
    writes_public_data: false
  }
}

function summarize(items) {
  const summary = {
    by_group_progression_completeness: {},
    by_subject: {},
    decision_rows_in_packet: 0,
    evidence_packet_items: items.length,
    groups_with_all_h4g_standard_context: 0,
    groups_with_all_target_anchor_grades: 0,
    source_files: sorted(items.flatMap(item => item.source_anchor_decision_rows.map(row => row.source_file))).length,
    standard_context_rows: 0,
    unique_candidate_matches: sorted(items.flatMap(item => item.source_anchor_decision_rows.map(row => row.candidate_match_id))).length
  }
  for (const item of items) {
    countInto(summary.by_group_progression_completeness, item.group_progression_completeness)
    countInto(summary.by_subject, item.subject_slug)
    summary.decision_rows_in_packet += item.source_anchor_decision_rows.length
    summary.standard_context_rows += item.standard_context_by_grade.length
    if (TARGET_GRADE_BANDS.every(grade => item.grade_bands_in_standard_group.includes(grade))) {
      summary.groups_with_all_h4g_standard_context += 1
    }
    if (TARGET_GRADE_BANDS.every(grade => item.grade_bands_in_anchor_rows.includes(grade))) {
      summary.groups_with_all_target_anchor_grades += 1
    }
  }
  return summary
}

function previewRows(items, limit = 80) {
  return items.slice(0, limit).map(item => (
    `| ${markdownCell(item.progression_group_id)} | ${markdownCell(item.subject_slug)} | ${item.standard_context_by_grade.length} | ${item.source_anchor_decision_rows.length} | ${markdownCell(item.grade_bands_in_anchor_rows.join(', '))} | ${markdownCell(item.missing_target_grade_bands_in_anchors.join(', ') || 'none')} |`
  )).join('\n') || '| - | - | 0 | 0 | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Unit Source-Anchor Specificity Evidence Packet

Generated at: ${payload.generated_at}

This read-only packet groups pending source-anchor specificity decisions by
progression group and adds sibling H4G7/H4G8/H4G9 standard context. It is
review evidence only and does not edit decisions, write \`public/data\`, change
official standard text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| evidence packet items | ${payload.summary.evidence_packet_items} |
| decision rows in packet | ${payload.summary.decision_rows_in_packet} |
| standard context rows | ${payload.summary.standard_context_rows} |
| groups with all H4G standard context | ${payload.summary.groups_with_all_h4g_standard_context} |
| groups with all target anchor grades | ${payload.summary.groups_with_all_target_anchor_grades} |
| unique candidate matches | ${payload.summary.unique_candidate_matches} |
| source files | ${payload.summary.source_files} |

## Subjects

| subject | groups |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Groups

| progression group | subject | standards | anchor rows | anchor grades | missing anchor grades |
| --- | --- | ---: | ---: | --- | --- |
${previewRows(payload.source_anchor_specificity_evidence_items)}

## Warnings

${payload.warnings.length ? payload.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  const warnings = []
  if (!existsSync(args.decisions)) errors.push(`Missing decisions: ${args.decisions}`)
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { source_anchor_specificity_decisions: [] }
  if (!errors.length) validateDecisions(decisions, errors)
  const standardCache = new Map()
  const sourceMatchCache = new Map()
  const groups = groupRows(decisions.source_anchor_specificity_decisions || [])
  const items = [...groups.entries()]
    .map(([progressionGroupId, rows]) => buildItem(progressionGroupId, rows, args, standardCache, sourceMatchCache, warnings, errors))
    .sort((a, b) => a.subject_slug.localeCompare(b.subject_slug) || a.progression_group_id.localeCompare(b.progression_group_id))
  if (args.requireItems && !items.length) errors.push('requireItems is set but no evidence packet items were generated')
  return {
    changes_official_standard_text: false,
    decision_template_only: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    evidence_packet_only: true,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: policy(),
    publication_ready: false,
    purpose: 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_evidence_packet',
    requires_later_anchor_policy_decision_edit: true,
    requires_later_candidate_coverage_recheck: true,
    requires_later_consistency_gate: true,
    requires_later_manual_review: true,
    requires_later_publication_gate: true,
    review_batch_only: true,
    source_anchor_policy_source_anchor_specificity_decisions: args.decisions,
    source_anchor_specificity_batch_only: true,
    source_anchor_specificity_evidence_items: items,
    source_anchor_specificity_evidence_packet_only: true,
    source_public_data_root: args.dataRoot,
    summary: summarize(items),
    valid: errors.length === 0,
    warnings,
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
  if (args.out) writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({
    errors: payload.errors,
    generated_at: payload.generated_at,
    out: args.out,
    purpose: payload.purpose,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid,
    warnings: payload.warnings,
    writes_public_data: payload.writes_public_data
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
