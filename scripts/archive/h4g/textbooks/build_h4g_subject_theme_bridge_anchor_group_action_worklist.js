#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decision_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.md'

const ROUTE_TO_WORK_PATH = {
  needs_source_anchor_evidence: 'source_anchor_evidence_gap_review',
  split_or_refine_group_scope: 'split_scope_before_item_review'
}

function parseArgs(argv) {
  const args = {
    anchorBatch: DEFAULT_BATCH,
    out: DEFAULT_OUT,
    recommendations: DEFAULT_RECOMMENDATIONS,
    requireGroups: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--recommendations') args.recommendations = argv[++i]
    else if (item === '--anchor-batch') args.anchorBatch = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--require-groups') args.requireGroups = true
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_action_worklist.js \\
  --recommendations generated/textbook_evidence/h4g_theme_bridge_anchor_group_decision_recommendations_anchor_domain_rejected_english_pe.json \\
  --anchor-batch generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-groups

Builds a review-only action worklist from H4G anchor group recommendations and
the full item-level anchor batch. It expands group recommendations into concrete
split/refinement rows or source-anchor evidence requests. It does not write
public/data, update the formal decision template, approve bridges, change
official standard text, or enable matcher use.`)
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

function hashText(value, length = 12) {
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

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function compactList(values, limit = 4) {
  const items = sorted(values)
  if (items.length <= limit) return items.join('; ')
  return `${items.slice(0, limit).join('; ')}; ...(+${items.length - limit})`
}

function validateInputs(recommendations, batch, args, errors) {
  if (recommendations.valid !== true) errors.push('recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_decision_recommendations') {
    errors.push('recommendations purpose must be h4g_subject_theme_bridge_anchor_group_decision_recommendations')
  }
  if (recommendations.recommendation_only !== true) errors.push('recommendations recommendation_only must be true')
  if (recommendations.writes_public_data !== false) errors.push('recommendations writes_public_data must be false')
  if (recommendations.changes_official_standard_text !== false) errors.push('recommendations changes_official_standard_text must be false')
  if (recommendations.direct_matcher_use !== false) errors.push('recommendations direct_matcher_use must be false')
  if (recommendations.matcher_ready !== false) errors.push('recommendations matcher_ready must be false')
  if (recommendations.publication_ready !== false) errors.push('recommendations publication_ready must be false')

  if (batch.valid !== true) errors.push('anchor batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_review_batch') {
    errors.push('anchor batch purpose must be h4g_subject_theme_bridge_anchor_review_batch')
  }
  if (batch.writes_public_data !== false) errors.push('anchor batch writes_public_data must be false')
  if (batch.changes_official_standard_text !== false) errors.push('anchor batch changes_official_standard_text must be false')
  if (batch.direct_matcher_use !== false) errors.push('anchor batch direct_matcher_use must be false')
  if (args.requireGroups && !(recommendations.group_recommendations || []).length) {
    errors.push('requireGroups is set but recommendations has no groups')
  }
}

function groupBatchItems(batch) {
  const groups = new Map()
  for (const item of batch.anchor_review_items || []) {
    const groupId = item.progression_group_id || 'missing'
    if (!groups.has(groupId)) groups.set(groupId, [])
    groups.get(groupId).push(item)
  }
  return groups
}

function unitLabel(item) {
  return item.unit_context?.unit_title || item.unit_context?.unit_evidence_id || 'missing unit'
}

function splitKey(item) {
  return [
    item.standard_context?.standard_code || 'missing-standard',
    item.grade_band || 'missing-grade',
    item.action_family || 'missing-action',
    item.anchor_requirement?.anchor_type || 'missing-anchor'
  ].join('|')
}

function sourceEvidenceKey(item) {
  return [
    item.standard_context?.standard_code || 'missing-standard',
    item.anchor_requirement?.anchor_type || 'missing-anchor'
  ].join('|')
}

function itemSummary(item) {
  return {
    action_family: item.action_family || '',
    anchor_review_item_id: item.anchor_review_item_id || '',
    anchor_type: item.anchor_requirement?.anchor_type || '',
    bridge_score: item.bridge_context?.bridge_score ?? null,
    grade_band: item.grade_band || '',
    page_range: item.bridge_context?.page_range || '',
    page_start: item.bridge_context?.page_start ?? null,
    remediation_item_id: item.remediation_item_id || '',
    risk_flags: item.evidence_profile?.risk_flags || [],
    shared_topic_tags: item.bridge_context?.shared_topic_tags || [],
    source_decision_id: item.source_decision_id || '',
    standard_code: item.standard_context?.standard_code || '',
    standard_domain: item.standard_context?.domain || '',
    standard_subdomain: item.standard_context?.subdomain || '',
    unit_evidence_id: item.unit_context?.unit_evidence_id || '',
    unit_title: item.unit_context?.unit_title || ''
  }
}

function aggregateItems(items) {
  const riskFlags = sorted(items.flatMap(item => item.evidence_profile?.risk_flags || []))
  const sharedTopicTags = sorted(items.flatMap(item => item.bridge_context?.shared_topic_tags || []))
  return {
    action_families: sorted(items.map(item => item.action_family)),
    anchor_review_item_ids: sorted(items.map(item => item.anchor_review_item_id)),
    anchor_types: sorted(items.map(item => item.anchor_requirement?.anchor_type)),
    bridge_score_range: {
      max: Math.max(...items.map(item => Number(item.bridge_context?.bridge_score || 0))),
      min: Math.min(...items.map(item => Number(item.bridge_context?.bridge_score || 0)))
    },
    grade_bands: sorted(items.map(item => item.grade_band)),
    item_count: items.length,
    page_ready_items: items.filter(item => item.bridge_context?.page_ready === true).length,
    remediation_item_ids: sorted(items.map(item => item.remediation_item_id)),
    risk_flags: riskFlags,
    shared_topic_tags: sharedTopicTags,
    source_decision_ids: sorted(items.map(item => item.source_decision_id)),
    standard_codes: sorted(items.map(item => item.standard_context?.standard_code)),
    standard_domains: sorted(items.map(item => item.standard_context?.domain)),
    unit_evidence_ids: sorted(items.map(item => item.unit_context?.unit_evidence_id)),
    unit_titles: sorted(items.map(unitLabel))
  }
}

function splitCandidates(items) {
  const groups = new Map()
  for (const item of items) {
    const key = splitKey(item)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return [...groups.entries()]
    .map(([key, rows], index) => {
      const [standardCode, gradeBand, actionFamily, anchorType] = key.split('|')
      return {
        action_family: actionFamily,
        anchor_type: anchorType,
        candidate_id: `h4g_anchor_group_split_${hashText(`${key}|${rows.map(row => row.anchor_review_item_id).join('|')}`)}`,
        candidate_index: index + 1,
        grade_band: gradeBand,
        item_summary: aggregateItems(rows),
        review_instruction: 'Review this bounded standard+grade+anchor slice separately before any item-level source review decision.',
        standard_code: standardCode
      }
    })
    .sort((a, b) => a.grade_band.localeCompare(b.grade_band) ||
      a.standard_code.localeCompare(b.standard_code) ||
      a.action_family.localeCompare(b.action_family))
}

function sourceEvidenceRequests(items, recommendation) {
  const groups = new Map()
  for (const item of items) {
    const key = sourceEvidenceKey(item)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return [...groups.entries()]
    .map(([key, rows], index) => {
      const [standardCode, anchorType] = key.split('|')
      const first = rows[0] || {}
      return {
        anchor_type: anchorType,
        existing_grade_bands: sorted(rows.map(item => item.grade_band)),
        evidence_request_id: `h4g_anchor_group_source_evidence_${hashText(`${key}|${recommendation.progression_group_id}`)}`,
        missing_grade_bands: recommendation.missing_grade_bands || [],
        request_index: index + 1,
        review_questions: first.anchor_requirement?.review_questions || [],
        standard_code: standardCode,
        standard_domain: first.standard_context?.domain || '',
        standard_subdomain: first.standard_context?.subdomain || '',
        unit_context_by_grade_band: Object.fromEntries(sorted(rows.map(item => item.grade_band)).map(gradeBand => [
          gradeBand,
          sorted(rows.filter(item => item.grade_band === gradeBand).map(unitLabel))
        ])),
        required_evidence: first.anchor_requirement?.acceptable_anchor_examples || [],
        source_items: rows.map(itemSummary)
      }
    })
    .sort((a, b) => a.standard_code.localeCompare(b.standard_code) || a.anchor_type.localeCompare(b.anchor_type))
}

function workPathFor(recommendation) {
  return ROUTE_TO_WORK_PATH[recommendation.recommended_reviewer_decision] || 'manual_group_route_review'
}

function actionRequired(recommendation) {
  if (recommendation.recommended_reviewer_decision === 'split_or_refine_group_scope') {
    return 'Split this broad progression group into bounded standard/grade/anchor slices before item-level source review.'
  }
  if (recommendation.recommended_reviewer_decision === 'needs_source_anchor_evidence') {
    return 'Collect or confirm source anchor evidence for missing grade slots or weak same-grade anchor support before item-level source review.'
  }
  return 'Manual group route review is required before item-level source review.'
}

function buildWorkItem(recommendation, items) {
  const workPath = workPathFor(recommendation)
  const aggregate = aggregateItems(items)
  const splitRows = recommendation.recommended_reviewer_decision === 'split_or_refine_group_scope'
    ? splitCandidates(items)
    : []
  const sourceRequests = recommendation.recommended_reviewer_decision === 'needs_source_anchor_evidence'
    ? sourceEvidenceRequests(items, recommendation)
    : []
  return {
    action_required: actionRequired(recommendation),
    anchor_action_work_id: `h4g_anchor_group_action_${hashText(`${recommendation.progression_group_id}|${recommendation.recommended_reviewer_decision}`)}`,
    group_item_summary: aggregate,
    missing_grade_bands: recommendation.missing_grade_bands || [],
    priority_rank: recommendation.priority_rank,
    priority_tier: recommendation.priority_tier,
    progression_group_id: recommendation.progression_group_id,
    recommendation_confidence: recommendation.recommendation_confidence,
    recommendation_reasons: recommendation.recommendation_reasons || [],
    recommended_reviewer_decision: recommendation.recommended_reviewer_decision,
    remediation_item_ids: recommendation.remediation_item_ids || [],
    review_strategy: recommendation.review_strategy || '',
    reviewer_note: recommendation.reviewer_note || '',
    source_group_decision_status: recommendation.source_reviewer_decision || '',
    split_candidate_count: splitRows.length,
    split_candidates: splitRows,
    source_anchor_evidence_request_count: sourceRequests.length,
    source_anchor_evidence_requests: sourceRequests,
    standard_codes: recommendation.standard_codes || [],
    subject_slug: recommendation.subject_slug || '',
    total_anchor_items: items.length,
    work_path: workPath,
    writes_public_data: false
  }
}

function buildWorklist(recommendations, batch, errors) {
  const itemsByGroup = groupBatchItems(batch)
  const workItems = []
  const seen = new Set()
  for (const recommendation of recommendations.group_recommendations || []) {
    if (!recommendation.progression_group_id) {
      errors.push(`${recommendation.decision_id || '(missing decision id)'} missing progression_group_id`)
      continue
    }
    if (seen.has(recommendation.progression_group_id)) {
      errors.push(`${recommendation.progression_group_id} duplicate recommendation group`)
      continue
    }
    seen.add(recommendation.progression_group_id)
    const items = itemsByGroup.get(recommendation.progression_group_id) || []
    if (!items.length) errors.push(`${recommendation.progression_group_id} has no item-level anchor review rows`)
    workItems.push(buildWorkItem(recommendation, items))
  }
  for (const groupId of itemsByGroup.keys()) {
    if (!seen.has(groupId)) errors.push(`${groupId} has batch items but no group recommendation`)
  }
  return workItems.sort((a, b) => Number(a.priority_rank || 0) - Number(b.priority_rank || 0) ||
    a.progression_group_id.localeCompare(b.progression_group_id))
}

function summarize(workItems) {
  const summary = {
    action_work_items: workItems.length,
    by_priority_tier: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_subject: {},
    by_work_path: {},
    item_level_anchor_review_rows: 0,
    source_anchor_evidence_requests: 0,
    split_candidate_rows: 0
  }
  for (const row of workItems) {
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_work_path, row.work_path)
    summary.item_level_anchor_review_rows += row.total_anchor_items
    summary.split_candidate_rows += row.split_candidate_count
    summary.source_anchor_evidence_requests += row.source_anchor_evidence_request_count
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.progression_group_id)} | ${row.total_anchor_items} | ${markdownCell(row.work_path)} | ${row.split_candidate_count} | ${row.source_anchor_evidence_request_count} | ${markdownCell(compactList(row.recommendation_reasons, 3))} |`
  )).join('\n') || '| - | - | - | - | 0 | - | 0 | 0 | - |'
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Action Worklist

Generated at: ${payload.generated_at}

This is a review-only action worklist. It expands the 52 English/PE anchor group
recommendations into concrete split/refinement rows or source-anchor evidence
requests. It does not update the formal group decision template, approve
bridges, write \`public/data\`, change official standard text, or enable matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| action work items | ${payload.summary.action_work_items} |
| item-level anchor review rows | ${payload.summary.item_level_anchor_review_rows} |
| split candidate rows | ${payload.summary.split_candidate_rows} |
| source anchor evidence requests | ${payload.summary.source_anchor_evidence_requests} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Work Paths

| work path | groups |
| --- | ---: |
${countRows(payload.summary.by_work_path)}

## Recommendations

| recommendation | groups |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Subjects

| subject | groups |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Preview

| rank | tier | subject | group | items | work path | split rows | source requests | reasons |
| ---: | --- | --- | --- | ---: | --- | ---: | ---: | --- |
${previewRows(payload.action_work_items)}

## Exit Criteria

- For \`split_scope_before_item_review\`, reviewer must decide the bounded split keys before item-level source review.
- For \`source_anchor_evidence_gap_review\`, reviewer must collect or reject missing/weak source anchor evidence before item-level source review.
- Formal group decisions remain pending until the editable decision template is updated and audited.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  for (const [label, path] of [['recommendations', args.recommendations], ['anchor batch', args.anchorBatch]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (errors.length) {
    const result = { errors, valid: false }
    console.log(JSON.stringify(result, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const recommendations = readJson(args.recommendations)
  const batch = readJson(args.anchorBatch)
  validateInputs(recommendations, batch, args, errors)
  const actionWorkItems = buildWorklist(recommendations, batch, errors)
  const payload = {
    action_work_items: actionWorkItems,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_action_worklist',
    review_only: true,
    source_anchor_batch: args.anchorBatch,
    source_recommendations: args.recommendations,
    summary: summarize(actionWorkItems),
    valid: errors.length === 0,
    writes_public_data: false
  }

  writeJson(args.out, payload)
  writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(payload, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
