#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_decisions_template.json'
const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_batch.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_decisions_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_decisions_audit.md'

const ALLOWED_DECISIONS = new Set([
  'pending',
  'keep_noneligible_overbroad_match',
  'needs_source_anchor_specificity_review',
  'needs_scoped_alias_review',
  'needs_manual_candidate_rebuild',
  'reject_match_not_relevant'
])
const POSITIVE_DECISIONS = new Set([
  'needs_scoped_alias_review',
  'needs_manual_candidate_rebuild'
])

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireComplete: false,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--batch') args.batch = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--require-complete') args.requireComplete = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_unit_evidence_anchor_policy_review_decisions.js \\
  --strict --require-items

Audits the editable H4G unit-evidence anchor-policy review decisions file.
Pending decisions are valid by default. Use --require-complete when a filled
review file is expected.`)
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

function sameJson(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right))
}

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
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

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function validReviewDate(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value || ''))
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

function validateTemplatePolicy(label, policy, errors) {
  validatePolicy(label, policy, errors)
  for (const key of [
    'decision_template_only',
    'requires_later_candidate_coverage_recheck',
    'requires_later_consistency_gate',
    'requires_later_manual_review',
    'requires_later_publication_gate',
    'review_batch_only'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
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

function expectedByItem(batch) {
  const out = new Map()
  for (const item of batch.anchor_policy_review_items || []) {
    out.set(item.anchor_policy_review_item_id, {
      anchor_policy_review_item_id: item.anchor_policy_review_item_id || '',
      candidate_match_options: (item.candidate_matches || []).map(match => ({
        confidence_band: match.confidence_band || '',
        edition: match.edition || '',
        evidence_id: match.evidence_id || '',
        match_id: match.match_id || '',
        page_range: match.page_range || '',
        page_start: match.page_start || '',
        unit_title: match.unit_title || ''
      })),
      candidate_matches_count: item.candidate_matches_count || 0,
      decision_id: `h4g_unit_anchor_policy_decision_${hashText(item.anchor_policy_review_item_id)}`,
      grade_band: item.grade_band || '',
      parent_action_work_item_id: item.parent_action_work_item_id || '',
      priority_score: item.priority_score || 0,
      progression_group_id: item.progression_group_id || '',
      source_candidate_match_ids: sorted((item.candidate_matches || []).map(match => match.match_id)),
      standard_code: item.standard_code || '',
      subject_slug: item.subject_slug || ''
    })
  }
  return out
}

function mapBy(rows, key, errors, label) {
  const out = new Map()
  for (const row of rows || []) {
    const id = row[key] || ''
    if (!id) {
      errors.push(`${label} row missing ${key}`)
      continue
    }
    if (out.has(id)) errors.push(`${label} duplicate ${key}: ${id}`)
    out.set(id, row)
  }
  return out
}

function validateTopLevel(decisions, batch, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_unit_evidence_anchor_policy_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.source_anchor_policy_review_batch !== args.batch) errors.push('decisions source batch must match audit arg')
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  if (decisions.review_batch_only !== true) errors.push('decisions review_batch_only must be true')
  if (!Array.isArray(decisions.anchor_policy_review_decisions)) {
    errors.push('decisions anchor_policy_review_decisions must be an array')
  }
  validatePolicy('decisions', decisions, errors)
  validateTemplatePolicy('decisions policy', decisions.policy || {}, errors)
  if (!sameJson(decisions.allowed_decisions || [], [...ALLOWED_DECISIONS])) errors.push('decisions allowed_decisions mismatch')

  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_unit_evidence_anchor_policy_review_batch') errors.push('batch purpose mismatch')
  validatePolicy('batch', batch, errors)
}

function requireFilledDecision(row, prefix, errors) {
  if (!hasValue(row.reviewed_by)) errors.push(`${prefix} reviewed_by is required after a non-pending decision`)
  if (!validReviewDate(row.reviewed_at)) errors.push(`${prefix} reviewed_at must start with YYYY-MM-DD after a non-pending decision`)
  if (!hasValue(row.decision_note)) errors.push(`${prefix} decision_note is required after a non-pending decision`)
}

function validateDecision(row, expected, args, errors, stats) {
  const prefix = row.decision_id || row.anchor_policy_review_item_id || '(decision)'
  validatePolicy(prefix, row, errors)
  validateTemplatePolicy(`${prefix} policy`, row.policy || {}, errors)
  if (!sameJson(row.allowed_decisions || [], [...ALLOWED_DECISIONS])) errors.push(`${prefix} allowed_decisions mismatch`)
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (!sameJson(row[key], expectedValue)) errors.push(`${prefix} ${key} mismatch`)
  }
  if (row.decision_surface !== 'h4g_unit_anchor_policy_review') errors.push(`${prefix} decision_surface mismatch`)
  if (!ALLOWED_DECISIONS.has(row.reviewer_decision)) errors.push(`${prefix} invalid reviewer_decision`)
  if (!Array.isArray(row.selected_candidate_match_ids)) errors.push(`${prefix} selected_candidate_match_ids must be an array`)
  for (const selected of row.selected_candidate_match_ids || []) {
    if (!expected.source_candidate_match_ids.includes(selected)) errors.push(`${prefix} selected candidate is not in source options: ${selected}`)
  }
  for (const [key, value] of Object.entries(row.required_confirmations || {})) {
    if (row.reviewer_decision === 'pending' && value !== false) {
      errors.push(`${prefix} pending required_confirmations.${key} must remain false`)
    }
  }
  if (row.reviewer_decision !== 'pending') requireFilledDecision(row, prefix, errors)
  if (POSITIVE_DECISIONS.has(row.reviewer_decision)) {
    if (!row.selected_candidate_match_ids?.length) errors.push(`${prefix} positive decision requires selected_candidate_match_ids`)
    for (const [key, value] of Object.entries(row.required_confirmations || {})) {
      if (value !== true) errors.push(`${prefix} positive decision requires required_confirmations.${key}=true`)
    }
  }
  if (args.requireComplete && row.reviewer_decision === 'pending') errors.push(`${prefix} must not be pending when --require-complete is set`)
  stats.audited_decisions += 1
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['decisions', args.decisions],
    ['batch', args.batch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { anchor_policy_review_decisions: [] }
  const batch = existsSync(args.batch) ? readJson(args.batch) : { anchor_policy_review_items: [] }
  if (!errors.length) validateTopLevel(decisions, batch, args, errors)
  const rows = decisions.anchor_policy_review_decisions || []
  const byItem = mapBy(rows, 'anchor_policy_review_item_id', errors, 'decisions')
  const expected = expectedByItem(batch)
  const stats = {
    audited_decisions: 0,
    expected_decisions: expected.size,
    extra_decisions: 0,
    missing_decisions: 0,
    ...summarize(rows)
  }
  if (!sameJson(decisions.summary || {}, summarize(rows))) errors.push('decisions summary does not match rows')
  for (const [id, expectedRow] of expected.entries()) {
    const row = byItem.get(id)
    if (!row) {
      stats.missing_decisions += 1
      errors.push(`${id} missing decision`)
      continue
    }
    validateDecision(row, expectedRow, args, errors, stats)
  }
  for (const id of byItem.keys()) {
    if (!expected.has(id)) {
      stats.extra_decisions += 1
      errors.push(`${id} unexpected decision`)
    }
  }
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no decisions were audited')
  return {
    batch: args.batch,
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    require_complete: args.requireComplete,
    require_items: args.requireItems,
    summary: stats,
    valid: errors.length === 0,
    writes_public_data: false
  }
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Anchor Policy Review Decisions Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected decisions | ${payload.summary.expected_decisions} |
| audited decisions | ${payload.summary.audited_decisions} |
| missing decisions | ${payload.summary.missing_decisions} |
| extra decisions | ${payload.summary.extra_decisions} |
| pending decisions | ${payload.summary.pending_decisions} |
| completed decisions | ${payload.summary.completed_decisions} |

## Reviewer Decisions

| decision | rows |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

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
  const payload = audit(args)
  if (args.out) writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
