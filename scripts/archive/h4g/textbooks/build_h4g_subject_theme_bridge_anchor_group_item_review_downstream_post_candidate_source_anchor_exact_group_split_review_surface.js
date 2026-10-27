#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_ACTION_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_GROUP_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_EXACT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_STANDARDS_ROOT = 'public/data/by_subject'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_surface_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_surface_anchor_domain_rejected_english_pe.md'

const SPLIT_QUEUE = 'split_overbroad_group_before_standard_level_review_queue'

function parseArgs(argv) {
  const args = {
    actionWorklist: DEFAULT_ACTION_WORKLIST,
    exactPacket: DEFAULT_EXACT_PACKET,
    groupPacket: DEFAULT_GROUP_PACKET,
    out: DEFAULT_OUT,
    requireItems: false,
    standardsRoot: DEFAULT_STANDARDS_ROOT,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--action-worklist') args.actionWorklist = argv[++i]
    else if (item === '--group-packet') args.groupPacket = argv[++i]
    else if (item === '--exact-packet') args.exactPacket = argv[++i]
    else if (item === '--standards-root') args.standardsRoot = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_surface.js \\
  --strict --require-items

Builds a read-only standard-level review surface from exact group action work
items in the split queue. It expands each split group back to individual
standard+grade+unit exact-anchor rows. It does not edit decisions, approve
standards, write public/data, change official standard text, or enable
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

function truncate(value, max = 100) {
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

function noPublicPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    publication_ready: false,
    requires_later_decision_gate: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    split_review_is_not_approval: true,
    standard_level_exact_anchor_review_required: true,
    writes_public_data: false
  }
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

function validateTopLevel(actionWorklist, groupPacket, exactPacket, args, errors) {
  if (actionWorklist.valid !== true) errors.push('action worklist valid must be true')
  if ((actionWorklist.errors || []).length) errors.push('action worklist errors must be empty')
  if (actionWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_action_worklist') {
    errors.push('action worklist purpose mismatch')
  }
  if (actionWorklist.action_worklist_only !== true) errors.push('action worklist action_worklist_only must be true')
  if (!Array.isArray(actionWorklist.exact_anchor_group_review_action_work_items)) {
    errors.push('action worklist exact_anchor_group_review_action_work_items must be an array')
  }
  validatePolicy('action worklist', actionWorklist, errors)

  if (groupPacket.valid !== true) errors.push('group packet valid must be true')
  if ((groupPacket.errors || []).length) errors.push('group packet errors must be empty')
  if (groupPacket.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet') {
    errors.push('group packet purpose mismatch')
  }
  if (groupPacket.exact_anchor_group_review_packet_only !== true) {
    errors.push('group packet exact_anchor_group_review_packet_only must be true')
  }
  if (groupPacket.source_post_candidate_source_anchor_exact_evidence_packet !== args.exactPacket) {
    errors.push('group packet source exact packet must match --exact-packet')
  }
  if (!Array.isArray(groupPacket.exact_anchor_group_review_items)) {
    errors.push('group packet exact_anchor_group_review_items must be an array')
  }
  validatePolicy('group packet', groupPacket, errors)

  if (exactPacket.valid !== true) errors.push('exact packet valid must be true')
  if ((exactPacket.errors || []).length) errors.push('exact packet errors must be empty')
  if (exactPacket.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet') {
    errors.push('exact packet purpose mismatch')
  }
  if (!Array.isArray(exactPacket.source_anchor_exact_evidence_items)) {
    errors.push('exact packet source_anchor_exact_evidence_items must be an array')
  }
  validatePolicy('exact packet', exactPacket, errors)
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

function buildStandardIndex(root, subjectSlugs, errors) {
  const out = new Map()
  for (const subjectSlug of sorted(subjectSlugs)) {
    for (const standard of loadStandardsForSubject(root, subjectSlug, errors)) {
      const code = standard.code || standard.id
      if (code) out.set(code, standard)
    }
  }
  return out
}

function selectedSplitActions(actionWorklist) {
  return (actionWorklist.exact_anchor_group_review_action_work_items || [])
    .filter(row => row.work_queue === SPLIT_QUEUE)
    .sort((a, b) => Number(a.worklist_rank || 0) - Number(b.worklist_rank || 0) ||
      String(a.group_key || '').localeCompare(String(b.group_key || '')))
}

function splitReviewItemId(action, standardRow) {
  return `h4g_anchor_group_post_candidate_source_anchor_exact_group_split_review_${hashText(`${action.action_work_item_id}|${standardRow.exact_anchor_evidence_packet_id}`)}`
}

function standardContext(publicStandard, sourceContext, subjectSlug) {
  return {
    code: publicStandard?.code || sourceContext?.code || '',
    domain: publicStandard?.domain || sourceContext?.domain || '',
    grade_band: publicStandard?.grade_band || '',
    grade_level: publicStandard?.grade_level ?? null,
    legacy_code: publicStandard?.legacy_code || sourceContext?.legacy_code || '',
    practice: publicStandard?.practice || sourceContext?.practice || '',
    progression_group_id: publicStandard?.progression_group_id || '',
    progression_role: publicStandard?.progression_role || sourceContext?.progression_role || '',
    standard: publicStandard?.standard || sourceContext?.standard || '',
    subdomain: publicStandard?.subdomain || sourceContext?.subdomain || '',
    subject_slug: publicStandard?.subject_slug || subjectSlug || ''
  }
}

function reviewQuestions(action, group, exact, standardRow) {
  return [
    ...(group.group_review_prompts || []),
    ...(action.review_questions || []),
    `Review standard ${standardRow.standard_code || 'missing'} independently from the parent unit group.`,
    'Accept only if the body text shows standard-specific evidence, not only a broad unit title or theme.',
    'If the exact evidence is still generic, route this standard to reject or more specific evidence instead of matcher/publication.'
  ].filter(Boolean)
}

function buildSurfaceItem(action, group, standardRow, exact, publicStandard, index) {
  return {
    allowed_reviewer_decisions: [
      'accept_standard_exact_anchor_for_later_decision_candidate',
      'reject_standard_anchor_as_overbroad_or_generic',
      'needs_more_specific_source_evidence',
      'split_to_activity_or_task_level_review'
    ],
    anchor_requirement_summary: exact.anchor_requirement_summary || standardRow.anchor_requirement_summary || '',
    downstream_action_decision_id: exact.downstream_action_decision_id || standardRow.downstream_action_decision_id || '',
    exact_anchor_evidence_packet_id: exact.exact_anchor_evidence_packet_id || standardRow.exact_anchor_evidence_packet_id || '',
    exact_anchor_group_review_item_id: action.exact_anchor_group_review_item_id || '',
    exact_anchor_group_review_recommendation_id: action.exact_anchor_group_review_recommendation_id || '',
    grade_band: action.grade_band || standardRow.grade_band || exact.grade_band || '',
    group_key: action.group_key || group.group_key || '',
    group_review_route: action.group_review_route || group.group_review_route || '',
    item_review_surface: 'post_candidate_source_anchor_exact_group_split_standard_review',
    page_evidence_context: exact.page_evidence_context || {},
    page_evidence_packet_item_id: exact.page_evidence_packet_item_id || standardRow.page_evidence_packet_item_id || '',
    page_evidence_status: exact.page_evidence_status || standardRow.page_evidence_status || '',
    page_hint_source: exact.page_hint_source || standardRow.page_hint_source || '',
    parent_action_work_item_id: action.action_work_item_id || '',
    parent_action_worklist_rank: Number(action.worklist_rank || 0),
    parent_decision_id: action.decision_id || '',
    parent_source_anchor_exact_evidence_items: Number(action.source_anchor_exact_evidence_items || 0),
    parent_standard_codes: action.standard_codes || [],
    priority_tier: action.priority_tier || group.priority_tier || '',
    progression_group_id: exact.progression_group_id || standardRow.progression_group_id || '',
    review_grain: 'standard_code+grade_band+unit_evidence_id+exact_anchor_evidence_packet_id',
    review_questions: reviewQuestions(action, group, exact, standardRow),
    reviewer_decision: 'pending',
    risk_profile: exact.risk_profile || standardRow.risk_profile || {},
    risk_signals: exact.risk_signals || standardRow.risk_signals || [],
    source_anchor_review_recommendation_id: exact.source_anchor_review_recommendation_id || standardRow.source_anchor_review_recommendation_id || '',
    source_key: exact.source_key || standardRow.source_key || '',
    source_standard_context: standardContext(publicStandard, exact.source_standard_context || standardRow.source_standard_context || {}, action.subject_slug || ''),
    split_review_item_id: splitReviewItemId(action, standardRow),
    split_review_item_is_not_decision: true,
    standard_code: standardRow.standard_code || exact.standard_code || '',
    standard_level_exact_anchor_review_required: true,
    subject_slug: action.subject_slug || standardRow.subject_slug || exact.subject_slug || '',
    target_standard_code: exact.target_standard_code || standardRow.target_standard_code || standardRow.standard_code || '',
    unit_context: exact.unit_context || group.unit_context || {},
    unit_evidence_id: action.unit_evidence_id || standardRow.unit_evidence_id || exact.unit_evidence_id || '',
    unit_title: action.unit_title || standardRow.unit_title || exact.unit_title || '',
    work_queue: SPLIT_QUEUE,
    worklist_rank: index + 1,
    writes_public_data: false
  }
}

function validateActionGroup(action, group, errors) {
  const prefix = action.action_work_item_id || action.group_key || '(missing split action)'
  if (!group) {
    errors.push(`${prefix} missing exact group review item`)
    return
  }
  const groupCodes = sorted((group.standard_review_rows || []).map(row => row.standard_code))
  const actionCodes = sorted(action.standard_codes || [])
  if (group.group_key !== action.group_key) errors.push(`${prefix} group_key mismatch`)
  if (group.source_anchor_exact_evidence_items !== action.source_anchor_exact_evidence_items) {
    errors.push(`${prefix} group source row count mismatch`)
  }
  if (groupCodes.join('|') !== actionCodes.join('|')) errors.push(`${prefix} standard_codes mismatch with group packet`)
}

function buildItems(actionWorklist, groupPacket, exactPacket, standardsByCode, errors) {
  const groupById = mapBy(groupPacket.exact_anchor_group_review_items || [], 'exact_anchor_group_review_item_id', errors, 'group packet')
  const exactById = mapBy(exactPacket.source_anchor_exact_evidence_items || [], 'exact_anchor_evidence_packet_id', errors, 'exact packet')
  const items = []
  for (const action of selectedSplitActions(actionWorklist)) {
    const group = groupById.get(action.exact_anchor_group_review_item_id)
    validateActionGroup(action, group, errors)
    for (const standardRow of group?.standard_review_rows || []) {
      const exact = exactById.get(standardRow.exact_anchor_evidence_packet_id)
      if (!exact) {
        errors.push(`${standardRow.exact_anchor_evidence_packet_id || '(missing exact id)'} not found in exact packet`)
        continue
      }
      const publicStandard = standardsByCode.get(standardRow.standard_code)
      if (!publicStandard) errors.push(`${standardRow.standard_code} not found in public standard data`)
      items.push(buildSurfaceItem(action, group, standardRow, exact, publicStandard, items.length))
    }
  }
  return items.sort((a, b) => Number(a.parent_action_worklist_rank || 0) - Number(b.parent_action_worklist_rank || 0) ||
    String(a.standard_code || '').localeCompare(String(b.standard_code || '')) ||
    String(a.split_review_item_id || '').localeCompare(String(b.split_review_item_id || '')))
    .map((row, index) => ({ ...row, worklist_rank: index + 1 }))
}

function summarize(items, splitActions) {
  const summary = {
    auto_approval_items: 0,
    by_grade_band: {},
    by_group_review_route: {},
    by_item_review_surface: {},
    by_priority_tier: {},
    by_review_grain: {},
    by_subject: {},
    by_unit_evidence_id: {},
    parent_split_action_work_items: splitActions.length,
    source_anchor_exact_evidence_items: items.length,
    split_review_items: items.length,
    standard_level_ready_items: 0,
    unique_exact_anchor_evidence_items: sorted(items.map(row => row.exact_anchor_evidence_packet_id)).length,
    unique_parent_groups: sorted(items.map(row => row.exact_anchor_group_review_item_id)).length,
    unique_progression_groups: sorted(items.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(items.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(items.map(row => row.unit_evidence_id)).length
  }
  for (const item of items) {
    countInto(summary.by_grade_band, item.grade_band)
    countInto(summary.by_group_review_route, item.group_review_route)
    countInto(summary.by_item_review_surface, item.item_review_surface)
    countInto(summary.by_priority_tier, item.priority_tier)
    countInto(summary.by_review_grain, item.review_grain)
    countInto(summary.by_subject, item.subject_slug)
    countInto(summary.by_unit_evidence_id, item.unit_evidence_id)
  }
  return summary
}

function previewRows(items) {
  return items.slice(0, 80).map(row => (
    `| ${row.worklist_rank} | ${markdownCell(row.grade_band)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.priority_tier)} | ${truncate(row.unit_title)} | ${truncate(row.source_standard_context?.domain || '')} |`
  )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Source-Anchor Exact Group Split Review Surface

Generated at: ${payload.generated_at}

This is a read-only standard-level review surface for exact group action items
in the split queue. It expands broad unit groups into individual
\`standard_code + grade_band + unit_evidence_id + exact_anchor_evidence_packet_id\`
rows so H4G7, H4G8 and H4G9 are reviewed separately. It does not edit
decisions, approve standards, write public data, enable matcher use, or mark
publication readiness.

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| parent split action work items | ${payload.summary.parent_split_action_work_items} |
| split review items | ${payload.summary.split_review_items} |
| source-anchor exact evidence rows | ${payload.summary.source_anchor_exact_evidence_items} |
| unique standard codes | ${payload.summary.unique_standard_codes} |
| unique unit evidence ids | ${payload.summary.unique_unit_evidence_ids} |
| standard-level ready items | ${payload.summary.standard_level_ready_items} |
| auto approval items | ${payload.summary.auto_approval_items} |

## Grade Bands

| grade band | items |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Group Routes

| route | items |
| --- | ---: |
${countRows(payload.summary.by_group_review_route)}

## Preview

| rank | grade | subject | standard | tier | unit | domain |
| ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.exact_anchor_group_split_review_items || [])}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  for (const [label, path] of [
    ['action worklist', args.actionWorklist],
    ['group packet', args.groupPacket],
    ['exact packet', args.exactPacket]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const actionWorklist = errors.length ? { exact_anchor_group_review_action_work_items: [] } : readJson(args.actionWorklist)
  const groupPacket = errors.length ? { exact_anchor_group_review_items: [] } : readJson(args.groupPacket)
  const exactPacket = errors.length ? { source_anchor_exact_evidence_items: [] } : readJson(args.exactPacket)
  if (!errors.length) validateTopLevel(actionWorklist, groupPacket, exactPacket, args, errors)
  const splitActions = selectedSplitActions(actionWorklist)
  const standardsByCode = buildStandardIndex(args.standardsRoot, sorted(splitActions.map(row => row.subject_slug)), errors)
  const items = buildItems(actionWorklist, groupPacket, exactPacket, standardsByCode, errors)
  if (args.requireItems && !items.length) errors.push('requireItems is set but split review surface has no rows')
  const payload = {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    exact_anchor_group_split_review_items: items,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: noPublicPolicy(),
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_surface',
    review_only: true,
    source_exact_group_review_action_worklist: args.actionWorklist,
    source_exact_group_review_packet: args.groupPacket,
    source_post_candidate_source_anchor_exact_evidence_packet: args.exactPacket,
    split_review_surface_only: true,
    standard_level_exact_anchor_review_surface_only: true,
    summary: summarize(items, splitActions),
    valid: errors.length === 0,
    writes_public_data: false
  }
  writeJson(args.out, payload)
  writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({ out: args.out, summary: payload.summary, valid: payload.valid }, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
if (args.help) usage()
else build(args)
