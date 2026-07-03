#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SPLIT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_EVIDENCE_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_recommendations_anchor_domain_rejected_english_pe.md'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireItems: false,
    sourceEvidenceBatch: DEFAULT_SOURCE_EVIDENCE_BATCH,
    splitBatch: DEFAULT_SPLIT_BATCH,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--split-batch') args.splitBatch = argv[++i]
    else if (item === '--source-evidence-batch') args.sourceEvidenceBatch = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_recommendations.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --split-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json \\
  --source-evidence-batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds recommendation-only routing for pending anchor group item-review
decisions. It does not modify the editable decisions template, approve bridges,
write public/data, change official standard text, or enable matcher/publication use.`)
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

function validateTopLevel(decisions, splitBatch, sourceEvidenceBatch, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_decisions_template')
  }
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.changes_official_standard_text !== false) errors.push('decisions changes_official_standard_text must be false')
  if (decisions.direct_matcher_use !== false) errors.push('decisions direct_matcher_use must be false')
  if (decisions.matcher_ready !== false) errors.push('decisions matcher_ready must be false')
  if (decisions.publication_ready !== false) errors.push('decisions publication_ready must be false')
  if (decisions.source_anchor_group_split_review_batch !== args.splitBatch) {
    errors.push('decisions source_anchor_group_split_review_batch must match --split-batch')
  }
  if (decisions.source_anchor_group_source_evidence_batch !== args.sourceEvidenceBatch) {
    errors.push('decisions source_anchor_group_source_evidence_batch must match --source-evidence-batch')
  }
  if (splitBatch.valid !== true) errors.push('split batch valid must be true')
  if (splitBatch.purpose !== 'h4g_subject_theme_bridge_anchor_group_split_review_batch') {
    errors.push('split batch purpose must be h4g_subject_theme_bridge_anchor_group_split_review_batch')
  }
  if (sourceEvidenceBatch.valid !== true) errors.push('source evidence batch valid must be true')
  if (sourceEvidenceBatch.purpose !== 'h4g_subject_theme_bridge_anchor_group_source_evidence_batch') {
    errors.push('source evidence batch purpose must be h4g_subject_theme_bridge_anchor_group_source_evidence_batch')
  }
  if (args.requireItems && !(decisions.item_review_decisions || []).length) {
    errors.push('requireItems is set but decisions has no item_review_decisions')
  }
}

function mapBy(rows, key, errors, label) {
  const out = new Map()
  for (const row of rows || []) {
    const id = row[key]
    if (!id) {
      errors.push(`${label} row missing ${key}`)
      continue
    }
    if (out.has(id)) errors.push(`${label} duplicate ${key}: ${id}`)
    out.set(id, row)
  }
  return out
}

function riskFlags(sourceItem) {
  return sorted((sourceItem.source_anchor_review_items || []).flatMap(row => row.evidence_profile?.risk_flags || []))
}

function unitCount(sourceItem) {
  return sorted((sourceItem.source_anchor_review_items || []).map(row => row.unit_context?.unit_evidence_id)).length
}

function hasBroadRisk(flags) {
  return (flags || []).some(flag => flag.startsWith('broad_topic_tag:')) ||
    (flags || []).includes('unit_overmatches_many_standards') ||
    (flags || []).includes('standard_has_many_bridge_candidates')
}

function splitRecommendation(row, sourceItem) {
  const flags = riskFlags(sourceItem)
  const units = unitCount(sourceItem)
  const sourceRows = Number(row.source_anchor_review_rows || 0)
  if (sourceRows > 1 || units > 1) {
    return {
      confidence: sourceRows > 2 || units > 2 ? 'high' : 'medium',
      reasons: [
        'multiple source rows remain inside one bounded slice',
        units > 1 ? 'multiple unit evidence ids require unit-scoped review' : 'multiple source rows require unit-scoped review'
      ],
      recommended_reviewer_decision: 'split_slice_further',
      reviewer_note: 'Split this bounded slice by unit/source row before deciding whether any single source item can enter item-level source review.'
    }
  }
  if (hasBroadRisk(flags)) {
    return {
      confidence: 'medium',
      reasons: ['single source row still carries broad topic or fan-out risk', ...flags.slice(0, 4)],
      recommended_reviewer_decision: 'needs_source_anchor_evidence',
      reviewer_note: 'Keep this slice out of item-level approval flow until the source row demonstrates the exact anchor, not only a broad topic.'
    }
  }
  return {
    confidence: 'medium',
    reasons: ['single source row', 'same standard+grade+anchor slice', 'no broad/fan-out risk flags in current batch'],
    recommended_reviewer_decision: 'accept_bounded_slice_for_item_level_source_review',
    reviewer_note: 'This slice is narrow enough to enter later item-level source review; this recommendation is not bridge approval.'
  }
}

function sourceEvidenceRecommendation(row, sourceItem) {
  if ((row.missing_target_standard_grade_bands || []).length) {
    return {
      confidence: 'high',
      reasons: ['missing grade band has no target public standard in the same progression group'],
      recommended_reviewer_decision: 'target_missing_grade_standard_absent',
      reviewer_note: 'Resolve the target-standard gap before searching for same-grade source-anchor evidence.'
    }
  }
  const sourceGrades = new Set((sourceItem.source_anchor_review_items || []).map(item => item.grade_band))
  const missingGradesWithEvidence = (row.missing_grade_bands || []).filter(gradeBand => sourceGrades.has(gradeBand))
  if (missingGradesWithEvidence.length) {
    return {
      confidence: 'medium',
      reasons: ['source rows already include at least one requested missing grade band'],
      recommended_reviewer_decision: 'source_anchor_evidence_found_for_missing_grade',
      reviewer_note: 'Confirm the same-grade source-anchor evidence is specific to the target standard before any later bridge decision.'
    }
  }
  return {
    confidence: 'high',
    reasons: ['target missing-grade standard exists', 'current source rows only cover existing grade bands'],
    recommended_reviewer_decision: 'needs_textbook_unit_indexing',
    reviewer_note: 'Index or recover same-grade unit evidence for the missing grade target standard before item-level source review.'
  }
}

function recommendationFor(row, indexes) {
  if (row.decision_type === 'anchor_group_split_item_review_decision') {
    return splitRecommendation(row, indexes.splitById.get(row.source_batch_item_id) || {})
  }
  if (row.decision_type === 'anchor_group_source_evidence_item_review_decision') {
    return sourceEvidenceRecommendation(row, indexes.sourceEvidenceById.get(row.source_batch_item_id) || {})
  }
  return {
    confidence: 'low',
    reasons: ['unknown decision type'],
    recommended_reviewer_decision: 'pending',
    reviewer_note: 'Manual review required because the decision type is not recognized.'
  }
}

function buildRows(decisions, indexes, errors) {
  const rows = []
  for (const row of decisions.item_review_decisions || []) {
    const recommendation = recommendationFor(row, indexes)
    const allowed = new Set(row.allowed_decisions || [])
    if (!allowed.has(recommendation.recommended_reviewer_decision)) {
      errors.push(`${row.decision_id} recommendation ${recommendation.recommended_reviewer_decision} is not allowed for this decision`)
    }
    rows.push({
      allowed_decisions: row.allowed_decisions || [],
      decision_id: row.decision_id || '',
      decision_type: row.decision_type || '',
      grade_band: row.grade_band || '',
      item_review_surface: row.item_review_surface || '',
      missing_grade_bands: row.missing_grade_bands || [],
      priority_rank: row.priority_rank,
      priority_tier: row.priority_tier || '',
      progression_group_id: row.progression_group_id || '',
      recommendation_confidence: recommendation.confidence,
      recommendation_is_official_decision: false,
      recommendation_only: true,
      recommendation_reasons: recommendation.reasons,
      recommended_reviewer_decision: recommendation.recommended_reviewer_decision,
      reviewer_note: recommendation.reviewer_note,
      source_anchor_review_rows: row.source_anchor_review_rows || 0,
      source_batch_item_id: row.source_batch_item_id || '',
      standard_code: row.standard_code || '',
      subject_slug: row.subject_slug || '',
      target_missing_grade_standards: row.target_missing_grade_standards || []
    })
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_decision_type: {},
    by_item_review_surface: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_subject: {},
    item_review_recommendations: rows.length,
    source_anchor_review_rows: 0
  }
  for (const row of rows) {
    summary.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    countInto(summary.by_decision_type, row.decision_type)
    countInto(summary.by_item_review_surface, row.item_review_surface)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.item_review_surface)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.standard_code)} | ${row.source_anchor_review_rows} | ${markdownCell(row.recommended_reviewer_decision)} | ${markdownCell(row.recommendation_confidence)} | ${truncate((row.recommendation_reasons || []).join('；'))} |`
  )).join('\n') || '| - | - | - | - | - | 0 | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Item Review Recommendations

Generated at: ${payload.generated_at}

These are recommendation-only routes for pending item-review decisions. They do
not update the editable decisions template, approve bridges, write
\`public/data\`, change official standard text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| recommendation only | ${payload.recommendation_only} |
| item review recommendations | ${payload.summary.item_review_recommendations} |
| source anchor review rows | ${payload.summary.source_anchor_review_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Confidence

| confidence | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation_confidence)}

## Preview

| rank | tier | surface | subject | standard | source rows | recommendation | confidence | reasons |
| ---: | --- | --- | --- | --- | ---: | --- | --- | --- |
${previewRows(payload.item_review_recommendations)}

## Guardrails

- Recommendations are not official decisions.
- Copying a recommendation into the editable decision template still requires reviewer notes and required confirmations.
- Matcher and publication gates remain separate later steps.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['decisions', args.decisions],
    ['split batch', args.splitBatch],
    ['source evidence batch', args.sourceEvidenceBatch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = errors.length ? { item_review_decisions: [] } : readJson(args.decisions)
  const splitBatch = errors.length ? { split_review_items: [] } : readJson(args.splitBatch)
  const sourceEvidenceBatch = errors.length ? { source_evidence_request_items: [] } : readJson(args.sourceEvidenceBatch)
  if (!errors.length) validateTopLevel(decisions, splitBatch, sourceEvidenceBatch, args, errors)
  const indexes = {
    sourceEvidenceById: mapBy(sourceEvidenceBatch.source_evidence_request_items || [], 'source_evidence_request_item_id', errors, 'source evidence batch'),
    splitById: mapBy(splitBatch.split_review_items || [], 'split_review_item_id', errors, 'split batch')
  }
  const rows = buildRows(decisions, indexes, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no item review recommendations were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    item_review_recommendations: rows,
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_recommendations',
    recommendation_only: true,
    source_anchor_group_item_review_decisions: args.decisions,
    source_anchor_group_source_evidence_batch: args.sourceEvidenceBatch,
    source_anchor_group_split_review_batch: args.splitBatch,
    summary: summarize(rows),
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
