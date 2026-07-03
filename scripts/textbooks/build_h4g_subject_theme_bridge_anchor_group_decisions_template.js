#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_MATRIX = 'generated/textbook_evidence/h4g_theme_bridge_anchor_priority_matrix_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_template_anchor_domain_rejected_english_pe.md'

const GROUP_DECISIONS = [
  'pending',
  'ready_for_item_level_source_review',
  'needs_source_anchor_evidence',
  'reject_group_anchor_path',
  'split_or_refine_group_scope'
]

function parseArgs(argv) {
  const args = {
    matrix: DEFAULT_MATRIX,
    out: DEFAULT_OUT,
    requireGroups: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--matrix') args.matrix = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-groups') args.requireGroups = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_decisions_template.js \\
  --matrix generated/textbook_evidence/h4g_theme_bridge_anchor_priority_matrix_anchor_domain_rejected_english_pe.json \\
  --strict --require-groups

Builds an editable group-level decision template from the H4G anchor priority
matrix. This template decides how each progression group should be reviewed
next; it does not approve bridges, write public/data, change official standard
text, or enable matcher use.`)
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

function compactList(values, limit = 5) {
  const items = [...new Set((values || []).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b))
  if (items.length <= limit) return items.join('；')
  return `${items.slice(0, limit).join('；')}；...(+${items.length - limit})`
}

function basePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    requires_later_item_decision_gate: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function groupDecision(group) {
  return {
    action_families: group.action_families || [],
    action_family_item_counts: group.action_family_item_counts || {},
    allowed_decisions: GROUP_DECISIONS,
    anchor_types: group.anchor_types || [],
    approved_grade_bands_from_matrix: group.approved_grade_bands || [],
    decision_id: `h4g_subject_theme_bridge_anchor_group_decision_${hashText(group.progression_group_id)}`,
    decision_note: '',
    decision_status: 'pending_review',
    decision_type: 'subject_theme_anchor_priority_group_decision',
    grade_band_item_counts: group.grade_band_item_counts || {},
    grade_bands: group.grade_bands || [],
    high_priority_items: group.high_priority_items || 0,
    matrix_item_ids: group.matrix_item_ids || [],
    missing_grade_bands: group.missing_grade_bands || [],
    priority_rank: group.priority_rank,
    priority_tier: group.priority_tier || '',
    progression_group_id: group.progression_group_id || '',
    publication_policy: basePolicy(),
    remediation_item_ids: group.remediation_item_ids || [],
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: {
      anchor_type_matches_target_domain: false,
      fanout_risk_reviewed: false,
      group_scope_is_bounded: false,
      item_level_review_still_required: false,
      no_public_write_requested: false,
      official_standard_text_preserved: false,
      same_grade_scope_checked: false,
      same_subject_scope_checked: false,
      source_items_reviewed: false
    },
    review_owner: group.subject_slug === 'pe' ? 'pe_anchor_group_source_review' : 'english_anchor_group_source_review',
    review_strategy: group.review_strategy || '',
    reviewed_at: '',
    reviewed_by: '',
    reviewer_decision: 'pending',
    risk_flags: group.risk_flags || [],
    sample_items: group.sample_items || [],
    source_priority_group_rank: group.priority_rank,
    standard_codes: group.standard_codes || [],
    subject_slug: group.subject_slug || '',
    surface_id: 'subject_theme_anchor_priority_group',
    total_items: group.total_items || 0,
    unit_evidence_ids: group.unit_evidence_ids || [],
    unit_titles: group.unit_titles || []
  }
}

function validateMatrix(matrix, args, errors) {
  if (matrix.valid !== true) errors.push('priority matrix valid must be true')
  if (matrix.purpose !== 'h4g_subject_theme_bridge_anchor_priority_matrix') {
    errors.push('priority matrix purpose must be h4g_subject_theme_bridge_anchor_priority_matrix')
  }
  if (!Array.isArray(matrix.priority_groups)) errors.push('priority matrix priority_groups must be an array')
  if (matrix.writes_public_data !== false) errors.push('priority matrix writes_public_data must be false')
  if (matrix.changes_official_standard_text !== false) errors.push('priority matrix changes_official_standard_text must be false')
  if (matrix.direct_matcher_use !== false) errors.push('priority matrix direct_matcher_use must be false')
  if (matrix.matcher_ready !== false) errors.push('priority matrix matcher_ready must be false')
  if (matrix.publication_ready !== false) errors.push('priority matrix publication_ready must be false')
  if (args.requireGroups && !(matrix.priority_groups || []).length) {
    errors.push('requireGroups is set but priority matrix has no groups')
  }
}

function summarize(decisions) {
  const summary = {
    completed_group_decisions: 0,
    group_decisions: decisions.length,
    pending_group_decisions: 0,
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_review_strategy: {},
    by_subject: {}
  }
  for (const row of decisions) {
    if (row.reviewer_decision === 'pending') summary.pending_group_decisions += 1
    else summary.completed_group_decisions += 1
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_review_strategy, row.review_strategy)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(decisions) {
  return decisions.slice(0, 60).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.priority_tier)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.progression_group_id)} | ${row.total_items} | ${markdownCell(row.review_strategy)} | ${markdownCell(compactList(row.action_families, 3))} | ${markdownCell(row.reviewer_decision)} |`
  )).join('\n') || '| - | - | - | - | 0 | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Subject Theme Bridge Anchor Group Decisions Template

Generated at: ${payload.generated_at}

This is an editable group-level review template. It routes progression groups
from the anchor priority matrix into the next review step. It does not approve
any bridge, write \`public/data\`, change official standard text, or enable
matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| group review complete | ${payload.group_review_complete} |
| group decisions | ${payload.summary.group_decisions} |
| pending group decisions | ${payload.summary.pending_group_decisions} |
| publication ready | ${payload.publication_ready} |
| matcher ready | ${payload.matcher_ready} |

## Subjects

| subject | groups |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Priority Tiers

| tier | groups |
| --- | ---: |
${countRows(payload.summary.by_priority_tier)}

## Review Strategies

| strategy | groups |
| --- | ---: |
${countRows(payload.summary.by_review_strategy)}

## Group Preview

| rank | tier | subject | progression group | items | strategy | action families | decision |
| ---: | --- | --- | --- | ---: | --- | --- | --- |
${previewRows(payload.group_review_decisions)}

## Editing Rules

- Keep all requested write, official-text-change, and direct-matcher fields false.
- Use \`ready_for_item_level_source_review\` only when the group scope is bounded and each item still needs item-level source review.
- Use \`reject_group_anchor_path\` when the group-level anchor route is unsafe as a whole.
- Use \`split_or_refine_group_scope\` when broad fanout means the group must be split before item review.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  if (!existsSync(args.matrix)) errors.push(`Missing priority matrix: ${args.matrix}`)
  const matrix = errors.length ? { priority_groups: [] } : readJson(args.matrix)
  if (!errors.length) validateMatrix(matrix, args, errors)

  const decisions = (matrix.priority_groups || [])
    .slice()
    .sort((a, b) => (a.priority_rank || 9999) - (b.priority_rank || 9999))
    .map(groupDecision)
  const payload = {
    changes_official_standard_text: false,
    data_scope: 'h4g_subject_theme_bridge_anchor_group_decisions_template',
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    group_review_complete: false,
    group_review_decisions: decisions,
    matcher_ready: false,
    publication_candidate: false,
    publication_policy: basePolicy(),
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_decisions_template',
    source_anchor_review_batch: matrix.source_anchor_review_batch || '',
    source_priority_matrix: args.matrix,
    summary: summarize(decisions),
    valid: false,
    writes_public_data: false
  }
  payload.valid = errors.length === 0

  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
