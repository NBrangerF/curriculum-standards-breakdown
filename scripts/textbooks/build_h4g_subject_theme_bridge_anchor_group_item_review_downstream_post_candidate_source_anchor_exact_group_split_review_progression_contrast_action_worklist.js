#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_worklist_anchor_domain_rejected_english_pe.md'

const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']

const ROUTE_PRIORITY = [
  'missing_public_sibling_progression_context',
  'identical_official_standard_current_grade_only_source_evidence',
  'identical_official_standard_no_public_unit_evidence_yet',
  'identical_official_standard_compare_grade_specific_evidence',
  'nonidentical_official_standard_requires_manual_progression_check'
]

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_worklist.js \\
  --strict --require-items

Builds a read-only progression-level action worklist from the H4G7/H4G8/H4G9
progression contrast packet. It groups standard-level rows by progression
group so reviewers can repair sibling context or collect grade-specific source
evidence before editing split-review decisions.`)
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

function validatePacket(packet, errors) {
  if (packet.valid !== true) errors.push('progression contrast packet valid must be true')
  if ((packet.errors || []).length) errors.push('progression contrast packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_packet') {
    errors.push('progression contrast packet purpose mismatch')
  }
  if (packet.progression_contrast_packet_only !== true) {
    errors.push('progression contrast packet progression_contrast_packet_only must be true')
  }
  if (packet.review_only !== true) errors.push('progression contrast packet review_only must be true')
  if (!Array.isArray(packet.progression_contrast_items)) {
    errors.push('progression contrast packet rows must be an array')
  }
  validatePolicy('progression contrast packet', packet, errors)
}

function groupRows(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = row.progression_group_id || 'missing'
    const group = groups.get(key) || []
    group.push(row)
    groups.set(key, group)
  }
  return [...groups.entries()].map(([progressionGroupId, items]) => ({
    items: items.sort((a, b) => Number(a.worklist_rank || 0) - Number(b.worklist_rank || 0) || String(a.standard_code).localeCompare(String(b.standard_code))),
    progressionGroupId
  }))
}

function selectedRoute(routes) {
  for (const route of ROUTE_PRIORITY) {
    if (routes.includes(route)) return route
  }
  return routes[0] || 'missing'
}

function actionDefinition(route) {
  if (route === 'missing_public_sibling_progression_context') {
    return {
      priority_tier: 'P0',
      recommended_next_gate: 'repair_public_h4g_sibling_progression_context_then_rerun_contrast_packet',
      reviewer_action: 'repair_or_confirm_h4g7_h4g8_h4g9_sibling_progression_context',
      work_queue: 'repair_missing_public_sibling_progression_context_queue'
    }
  }
  if (route === 'identical_official_standard_current_grade_only_source_evidence') {
    return {
      priority_tier: 'P1',
      recommended_next_gate: 'collect_grade_specific_page_evidence_before_split_review_decision',
      reviewer_action: 'prove_current_grade_specific_source_evidence_against_h4g_siblings',
      work_queue: 'prove_current_grade_specific_source_evidence_queue'
    }
  }
  if (route === 'identical_official_standard_no_public_unit_evidence_yet') {
    return {
      priority_tier: 'P1',
      recommended_next_gate: 'collect_sibling_grade_unit_evidence_before_split_review_decision',
      reviewer_action: 'collect_or_compare_h4g_sibling_grade_specific_source_evidence',
      work_queue: 'collect_sibling_grade_source_evidence_queue'
    }
  }
  if (route === 'identical_official_standard_compare_grade_specific_evidence') {
    return {
      priority_tier: 'P2',
      recommended_next_gate: 'compare_sibling_grade_evidence_before_split_review_decision',
      reviewer_action: 'compare_existing_sibling_grade_specific_evidence',
      work_queue: 'compare_sibling_grade_specific_evidence_queue'
    }
  }
  return {
    priority_tier: 'P2',
    recommended_next_gate: 'manual_progression_text_and_evidence_check_before_split_review_decision',
    reviewer_action: 'manually_check_nonidentical_official_standard_progression_text',
    work_queue: 'manual_progression_text_check_queue'
  }
}

function actionWorkItemId(progressionGroupId) {
  return `h4g_anchor_group_post_candidate_source_anchor_exact_group_split_review_progression_action_${hashText(progressionGroupId)}`
}

function uniqueSiblingRecords(rows) {
  const byCode = new Map()
  for (const row of rows) {
    for (const sibling of row.sibling_progression_records || []) {
      if (sibling.code && !byCode.has(sibling.code)) byCode.set(sibling.code, sibling)
    }
  }
  return [...byCode.values()].sort((a, b) => String(a.grade_band).localeCompare(String(b.grade_band)) || String(a.code).localeCompare(String(b.code)))
}

function publicEvidenceByGrade(siblingRecords) {
  return Object.fromEntries(TARGET_GRADE_BANDS.map(grade => {
    const item = siblingRecords.find(row => row.grade_band === grade)
    return [grade, {
      code: item?.code || '',
      grade_specific_focus_status: item?.grade_specific_focus_status || 'missing_public_sibling',
      textbook_unit_evidence_count: Number(item?.textbook_unit_evidence_count || 0),
      textbook_unit_evidence_ids: item?.textbook_unit_evidence_ids || []
    }]
  }))
}

function splitEvidenceByGrade(rows) {
  return Object.fromEntries(TARGET_GRADE_BANDS.map(grade => {
    const items = rows.filter(row => row.grade_band === grade)
    return [grade, {
      split_review_items: items.length,
      source_progression_contrast_item_ids: sorted(items.map(row => row.progression_contrast_item_id)),
      standard_codes: sorted(items.map(row => row.standard_code)),
      unit_evidence_ids: sorted(items.map(row => row.unit_evidence_id)),
      unit_titles: sorted(items.map(row => row.unit_title))
    }]
  }))
}

function manualReviewQuestions(route) {
  const common = [
    'Confirm the relationship by progression_group_id, not by shared broad unit topic alone.',
    'Keep official standard text unchanged; only grade-specific focus/evidence may be repaired later.',
    'Before editing split-review decisions, record exact page/activity/task/language behavior evidence for the target grade.',
    'If official standard text is identical across H4G7/H4G8/H4G9, require grade-specific evidence before any accept candidate decision.',
    'This action work item is not a decision, matcher approval, or publication approval.'
  ]
  if (route === 'missing_public_sibling_progression_context') {
    return [
      'Repair or confirm the missing H4G sibling standard records before judging unit evidence.',
      'Check whether H4G7/H4G8/H4G9 should all exist for this progression group.',
      ...common
    ]
  }
  if (route === 'identical_official_standard_current_grade_only_source_evidence') {
    return [
      'Do not accept from the current grade row alone; compare the sibling standards first.',
      'Collect or cite sibling-grade evidence that proves the target evidence is grade-specific rather than shared standard language.',
      ...common
    ]
  }
  if (route === 'identical_official_standard_no_public_unit_evidence_yet') {
    return [
      'Collect same-progression H4G7/H4G8/H4G9 source evidence before approving any one grade.',
      'Use the contrast packet to decide which grade needs source evidence first.',
      ...common
    ]
  }
  return [
    'Compare existing sibling grade evidence before deciding the split review row.',
    ...common
  ]
}

function buildWorkItem(group, index) {
  const rows = group.items
  const routes = sorted(rows.map(row => row.contrast_route))
  const route = selectedRoute(routes)
  const action = actionDefinition(route)
  const siblingRecords = uniqueSiblingRecords(rows)
  const siblingGradeBands = sorted(siblingRecords.map(row => row.grade_band))
  const splitGradeBands = sorted(rows.map(row => row.grade_band))
  const missingSiblingGradeBands = TARGET_GRADE_BANDS.filter(grade => !siblingGradeBands.includes(grade))
  const allOfficialTextsIdentical = rows.some(row => row.official_standard_texts_identical_across_siblings === true)
  const allFullTriplet = rows.every(row => row.has_full_h4g_triplet_context === true)
  return {
    action_work_item_id: actionWorkItemId(group.progressionGroupId),
    action_work_item_is_not_decision: true,
    approval_prohibited: true,
    changes_official_standard_text: false,
    contrast_routes: routes,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    has_full_h4g_triplet_context: allFullTriplet,
    manual_review_questions: manualReviewQuestions(route),
    missing_sibling_grade_bands: missingSiblingGradeBands,
    official_standard_texts_identical_across_siblings: allOfficialTextsIdentical,
    priority_tier: action.priority_tier,
    progression_action_worklist_only: true,
    progression_group_id: group.progressionGroupId,
    publication_ready: false,
    recommended_next_gate: action.recommended_next_gate,
    reviewer_action: action.reviewer_action,
    selected_contrast_route: route,
    sibling_grade_bands: siblingGradeBands,
    sibling_grade_context: siblingGradeBands.join('+') || 'missing',
    sibling_progression_records: siblingRecords,
    sibling_public_evidence_by_grade: publicEvidenceByGrade(siblingRecords),
    source_progression_contrast_item_ids: sorted(rows.map(row => row.progression_contrast_item_id)),
    split_review_item_count: rows.length,
    split_review_items: rows.map(row => ({
      contrast_route: row.contrast_route || '',
      grade_band: row.grade_band || '',
      source_split_review_item_id: row.source_split_review_item_id || '',
      standard_code: row.standard_code || '',
      unit_evidence_id: row.unit_evidence_id || '',
      unit_title: row.unit_title || '',
      worklist_rank: Number(row.worklist_rank || 0)
    })),
    split_surface_evidence_by_grade: splitEvidenceByGrade(rows),
    split_surface_grade_bands_for_progression: splitGradeBands,
    standard_codes: sorted(rows.map(row => row.standard_code)),
    subject_slug: rows[0]?.subject_slug || '',
    unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)),
    unit_titles: sorted(rows.map(row => row.unit_title)),
    work_queue: action.work_queue,
    worklist_rank: index + 1,
    writes_public_data: false
  }
}

function buildWorkItems(packetRows) {
  return groupRows(packetRows)
    .map(buildWorkItem)
    .sort((a, b) => {
      const priority = String(a.priority_tier).localeCompare(String(b.priority_tier))
      if (priority) return priority
      return a.progression_group_id.localeCompare(b.progression_group_id)
    })
    .map((row, index) => ({ ...row, worklist_rank: index + 1 }))
}

function summarize(rows, sourceRows) {
  const summary = {
    auto_approval_items: 0,
    by_contrast_route: {},
    by_priority_tier: {},
    by_selected_contrast_route: {},
    by_sibling_grade_context: {},
    by_split_surface_grade_context: {},
    by_subject: {},
    by_work_queue: {},
    current_grade_only_work_items: 0,
    expected_progression_contrast_items: sourceRows.length,
    full_h4g_triplet_context_work_items: 0,
    identical_official_standard_work_items: 0,
    missing_sibling_context_work_items: 0,
    no_public_unit_evidence_work_items: 0,
    progression_action_work_items: rows.length,
    public_write_items: 0,
    source_progression_contrast_items: sourceRows.length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(rows.flatMap(row => row.standard_codes || [])).length,
    unique_unit_evidence_ids: sorted(rows.flatMap(row => row.unit_evidence_ids || [])).length
  }
  for (const row of rows) {
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_selected_contrast_route, row.selected_contrast_route)
    countInto(summary.by_sibling_grade_context, row.sibling_grade_context)
    countInto(summary.by_split_surface_grade_context, (row.split_surface_grade_bands_for_progression || []).join('+') || 'missing')
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_work_queue, row.work_queue)
    for (const route of row.contrast_routes || []) countInto(summary.by_contrast_route, route)
    if (row.selected_contrast_route === 'missing_public_sibling_progression_context') summary.missing_sibling_context_work_items += 1
    if (row.selected_contrast_route === 'identical_official_standard_current_grade_only_source_evidence') summary.current_grade_only_work_items += 1
    if (row.selected_contrast_route === 'identical_official_standard_no_public_unit_evidence_yet') summary.no_public_unit_evidence_work_items += 1
    if (row.has_full_h4g_triplet_context) summary.full_h4g_triplet_context_work_items += 1
    if (row.official_standard_texts_identical_across_siblings) summary.identical_official_standard_work_items += 1
    if (row.writes_public_data !== false) summary.public_write_items += 1
  }
  return summary
}

function markdownSummary(payload) {
  return `# H4G Split Review Progression Contrast Action Worklist

Generated at: ${payload.generated_at}

This read-only worklist groups standard-level progression contrast rows by
\`progression_group_id\`. It turns the H4G7/H4G8/H4G9 contrast diagnosis into
progression-level repair or evidence-collection actions. It does not edit
decisions, write \`public/data\`, approve standards, or enable matcher use.

## Summary

| field | value |
| --- | ---: |
| progression action work items | ${payload.summary.progression_action_work_items} |
| source progression contrast items | ${payload.summary.source_progression_contrast_items} |
| full H4G triplet context work items | ${payload.summary.full_h4g_triplet_context_work_items} |
| identical official standard work items | ${payload.summary.identical_official_standard_work_items} |
| current-grade-only work items | ${payload.summary.current_grade_only_work_items} |
| no-public-unit-evidence work items | ${payload.summary.no_public_unit_evidence_work_items} |
| missing sibling context work items | ${payload.summary.missing_sibling_context_work_items} |
| public write items | ${payload.summary.public_write_items} |
| auto approval items | ${payload.summary.auto_approval_items} |

## Work Queues

| work queue | work items |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Selected Contrast Routes

| route | work items |
| --- | ---: |
${countRows(payload.summary.by_selected_contrast_route)}

## Sibling Grade Context

| sibling grades | work items |
| --- | ---: |
${countRows(payload.summary.by_sibling_grade_context)}

## Sample Work Items

| rank | queue | progression group | split grades | standards | units |
| ---: | --- | --- | --- | --- | --- |
${payload.progression_contrast_action_work_items.slice(0, 20).map(row => `| ${row.worklist_rank} | ${markdownCell(row.work_queue)} | ${markdownCell(row.progression_group_id)} | ${markdownCell((row.split_surface_grade_bands_for_progression || []).join('+'))} | ${truncate((row.standard_codes || []).join(', '), 120)} | ${truncate((row.unit_titles || []).join('; '), 140)} |`).join('\n') || '| - | - | - | - | - | - |'}

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
  const packet = existsSync(args.packet) ? readJson(args.packet) : { progression_contrast_items: [] }
  validatePacket(packet, errors)
  const sourceRows = packet.progression_contrast_items || []
  if (args.requireItems && !sourceRows.length) errors.push('requireItems is set but progression contrast packet has no rows')

  const workItems = buildWorkItems(sourceRows)
  const summary = summarize(workItems, sourceRows)
  if (summary.public_write_items) errors.push(`progression contrast action worklist has public write items: ${summary.public_write_items}`)
  if (summary.auto_approval_items) errors.push(`progression contrast action worklist has auto approval items: ${summary.auto_approval_items}`)

  const payload = {
    action_worklist_only: true,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    progression_contrast_action_work_items: workItems,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_worklist',
    review_only: true,
    source_progression_contrast_packet: args.packet,
    summary,
    valid: errors.length === 0,
    writes_public_data: false
  }

  writeJson(args.out, payload)
  writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({ out: args.out, summary, valid: payload.valid }, null, 2))
  if (args.strict && !payload.valid) process.exit(1)
}

main()
