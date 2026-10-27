#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_batch.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_decisions_template.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_decisions_template.md'

const ALLOWED_DECISIONS = [
  'pending',
  'keep_noneligible_overbroad_match',
  'needs_source_anchor_specificity_review',
  'needs_scoped_alias_review',
  'needs_manual_candidate_rebuild',
  'reject_match_not_relevant'
]

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
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
node scripts/textbooks/build_h4g_unit_evidence_anchor_policy_review_decisions_template.js \\
  --strict --require-items

Builds an editable decisions template from the H4G unit evidence anchor-policy
review batch. All reviewer decisions start pending; the template does not
approve candidates, change official standard text, write public/data, or enable
matcher/publication use.`)
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

function truncate(value, max = 120) {
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
    decision_template_only: true,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    publication_ready: false,
    requires_later_candidate_coverage_recheck: true,
    requires_later_consistency_gate: true,
    requires_later_manual_review: true,
    requires_later_publication_gate: true,
    review_batch_only: true,
    writes_public_data: false
  }
}

function validateBatch(batch, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_unit_evidence_anchor_policy_review_batch') errors.push('batch purpose mismatch')
  if (batch.review_batch_only !== true) errors.push('batch review_batch_only must be true')
  if (batch.writes_public_data !== false) errors.push('batch writes_public_data must be false')
  if (batch.changes_official_standard_text !== false) errors.push('batch changes_official_standard_text must be false')
  if (batch.direct_matcher_use !== false) errors.push('batch direct_matcher_use must be false')
  if (batch.publication_ready !== false) errors.push('batch publication_ready must be false')
}

function confirmationTemplate(source) {
  return Object.fromEntries(Object.keys(source || {})
    .sort((a, b) => a.localeCompare(b))
    .map(key => [key, false]))
}

function matchOptions(item) {
  return (item.candidate_matches || []).map(match => ({
    confidence_band: match.confidence_band || '',
    edition: match.edition || '',
    evidence_id: match.evidence_id || '',
    match_id: match.match_id || '',
    page_range: match.page_range || '',
    page_start: match.page_start || '',
    unit_title: match.unit_title || ''
  }))
}

function buildDecision(item) {
  return {
    allowed_decisions: ALLOWED_DECISIONS,
    anchor_policy_review_item_id: item.anchor_policy_review_item_id || '',
    candidate_match_options: matchOptions(item),
    candidate_matches_count: item.candidate_matches_count || 0,
    changes_official_standard_text: false,
    decision_id: `h4g_unit_anchor_policy_decision_${hashText(item.anchor_policy_review_item_id)}`,
    decision_note: '',
    decision_status: 'pending_review',
    decision_surface: 'h4g_unit_anchor_policy_review',
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    grade_band: item.grade_band || '',
    matcher_ready: false,
    parent_action_work_item_id: item.parent_action_work_item_id || '',
    policy: policy(),
    priority_score: item.priority_score || 0,
    progression_group_id: item.progression_group_id || '',
    publication_ready: false,
    required_confirmations: confirmationTemplate(item.required_confirmations),
    reviewed_at: '',
    reviewed_by: '',
    reviewer_decision: 'pending',
    selected_candidate_match_ids: [],
    source_candidate_match_ids: sorted((item.candidate_matches || []).map(match => match.match_id)),
    source_review_batch_item_id: item.anchor_policy_review_item_id || '',
    standard_code: item.standard_code || '',
    subject_slug: item.subject_slug || '',
    suggested_next_gate: 'manual_anchor_policy_review_then_rebuild_or_keep_blocked',
    writes_public_data: false
  }
}

function summarize(decisions) {
  const summary = {
    anchor_policy_review_decisions: decisions.length,
    by_decision_status: {},
    by_grade_band: {},
    by_reviewer_decision: {},
    by_subject: {},
    candidate_match_options: 0,
    completed_decisions: 0,
    pending_decisions: 0
  }
  for (const row of decisions) {
    countInto(summary.by_decision_status, row.decision_status)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    summary.candidate_match_options += row.candidate_match_options?.length || 0
    if (row.reviewer_decision === 'pending') summary.pending_decisions += 1
    else summary.completed_decisions += 1
    summary.by_subject[row.subject_slug] ||= {
      candidate_match_options: 0,
      completed_decisions: 0,
      pending_decisions: 0,
      review_decisions: 0
    }
    const subject = summary.by_subject[row.subject_slug]
    subject.review_decisions += 1
    subject.candidate_match_options += row.candidate_match_options?.length || 0
    if (row.reviewer_decision === 'pending') subject.pending_decisions += 1
    else subject.completed_decisions += 1
  }
  return summary
}

function tableRows(decisions, limit = 50) {
  return decisions.slice(0, limit).map(row => {
    const first = row.candidate_match_options[0]
    const option = first ? `${first.edition} / ${first.unit_title} / ${first.confidence_band}` : '-'
    return `| ${markdownCell(row.decision_id)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${row.priority_score} | ${row.candidate_match_options.length} | ${markdownCell(row.reviewer_decision)} | ${truncate(option, 80)} |`
  }).join('\n') || '| - | - | - | - | 0 | 0 | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Anchor Policy Review Decisions Template

Generated at: ${payload.generated_at}

This editable template converts the anchor-policy review batch into one pending
decision per review item. It does not approve candidates, write public/data,
change official standard text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| decisions | ${payload.summary.anchor_policy_review_decisions} |
| pending decisions | ${payload.summary.pending_decisions} |
| completed decisions | ${payload.summary.completed_decisions} |
| candidate match options | ${payload.summary.candidate_match_options} |

## Reviewer Decisions

| decision | rows |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## First Decisions

| decision | subject | grade | standard | priority | match options | reviewer decision | first option |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
${tableRows(payload.anchor_policy_review_decisions)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.batch)) errors.push(`Missing batch: ${args.batch}`)
  const batch = existsSync(args.batch) ? readJson(args.batch) : { anchor_policy_review_items: [] }
  if (!errors.length) validateBatch(batch, errors)
  const decisions = errors.length ? [] : (batch.anchor_policy_review_items || []).map(buildDecision)
  if (args.requireItems && !decisions.length) errors.push('requireItems is set but no decisions were generated')
  return {
    allowed_decisions: ALLOWED_DECISIONS,
    anchor_policy_review_decisions: decisions,
    changes_official_standard_text: false,
    decision_template_only: true,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: policy(),
    publication_ready: false,
    purpose: 'h4g_unit_evidence_anchor_policy_review_decisions_template',
    review_batch_only: true,
    source_anchor_policy_review_batch: args.batch,
    summary: summarize(decisions),
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
    writes_public_data: payload.writes_public_data
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
