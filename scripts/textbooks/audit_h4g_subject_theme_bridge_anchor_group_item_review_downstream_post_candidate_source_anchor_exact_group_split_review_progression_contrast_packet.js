#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_SURFACE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_surface_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_packet_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_packet_anchor_domain_rejected_english_pe_audit.md'

const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    recommendations: DEFAULT_RECOMMENDATIONS,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    surface: DEFAULT_SURFACE
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
    else if (item === '--surface') args.surface = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--recommendations') args.recommendations = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_packet.js \\
  --strict --require-items

Audits the read-only H4G7/H4G8/H4G9 progression contrast packet by
recomputing every contrast row from the split review surface and public
same-progression sibling standards.`)
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

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function gradeNumber(gradeBand) {
  const match = String(gradeBand || '').match(/H4G(\d+)/)
  return match ? Number(match[1]) : 0
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

function validateSourceArtifacts(surface, decisions, recommendations, args, errors) {
  if (surface.valid !== true) errors.push('split review surface valid must be true')
  if (surface.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_surface') {
    errors.push('split review surface purpose mismatch')
  }
  if (!Array.isArray(surface.exact_anchor_group_split_review_items)) {
    errors.push('split review surface rows must be an array')
  }
  validatePolicy('split review surface', surface, errors)

  if (decisions.valid !== true) errors.push('split review decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_decisions_template') {
    errors.push('split review decisions purpose mismatch')
  }
  if (decisions.source_exact_group_split_review_surface !== args.surface) {
    errors.push('split review decisions source surface must match --surface')
  }
  if (!Array.isArray(decisions.split_review_decisions)) errors.push('split review decisions rows must be an array')
  validatePolicy('split review decisions', decisions, errors)

  if (recommendations.valid !== true) errors.push('split review recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_recommendations') {
    errors.push('split review recommendations purpose mismatch')
  }
  if (recommendations.source_split_review_decisions !== args.decisions) {
    errors.push('split review recommendations source decisions must match --decisions')
  }
  if (!Array.isArray(recommendations.split_review_recommendations)) {
    errors.push('split review recommendations rows must be an array')
  }
  validatePolicy('split review recommendations', recommendations, errors)
}

function validatePacketTopLevel(packet, args, errors) {
  if (packet.valid !== true) errors.push('progression contrast packet valid must be true')
  if ((packet.errors || []).length) errors.push('progression contrast packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_packet') {
    errors.push('progression contrast packet purpose mismatch')
  }
  if (packet.progression_contrast_packet_only !== true) {
    errors.push('progression contrast packet progression_contrast_packet_only must be true')
  }
  if (packet.review_only !== true) errors.push('progression contrast packet review_only must be true')
  if (packet.source_split_review_surface !== args.surface) {
    errors.push('progression contrast packet source surface must match --surface')
  }
  if (packet.source_split_review_decisions !== args.decisions) {
    errors.push('progression contrast packet source decisions must match --decisions')
  }
  if (packet.source_split_review_recommendations !== args.recommendations) {
    errors.push('progression contrast packet source recommendations must match --recommendations')
  }
  if (packet.data_root !== args.dataRoot) errors.push('progression contrast packet data_root must match --data-root')
  if (!Array.isArray(packet.progression_contrast_items)) {
    errors.push('progression contrast packet rows must be an array')
  }
  validatePolicy('progression contrast packet', packet, errors)
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

function loadStandardsBySubject(dataRoot, subjects, errors) {
  const out = new Map()
  for (const subject of sorted(subjects)) {
    const path = join(dataRoot, 'by_subject', `${subject}.json`)
    if (!existsSync(path)) {
      errors.push(`Missing public subject data: ${path}`)
      continue
    }
    out.set(subject, readJson(path).standards || [])
  }
  return out
}

function publicSiblings(row, standardsBySubject) {
  const standards = standardsBySubject.get(row.subject_slug) || []
  return standards
    .filter(item => item.progression_group_id && item.progression_group_id === row.progression_group_id)
    .filter(item => TARGET_GRADE_BANDS.includes(item.grade_band))
    .sort((a, b) => gradeNumber(a.grade_band) - gradeNumber(b.grade_band) || String(a.code).localeCompare(String(b.code)))
}

function placeholderFocus(value) {
  const text = normalizeText(value)
  return !text || text.startsWith('\u5f85\u57fa\u4e8e')
}

function compactSibling(item) {
  const unitIds = item.textbook_unit_evidence_ids || []
  return {
    code: item.code || '',
    domain: item.domain || '',
    grade_band: item.grade_band || '',
    grade_specific_focus_status: placeholderFocus(item.grade_specific_focus) ? 'placeholder_or_missing' : 'reviewed_or_specific',
    legacy_code: item.legacy_code || '',
    progression_role: item.progression_role || '',
    standard: normalizeText(item.standard),
    subdomain: item.subdomain || '',
    textbook_unit_evidence_count: unitIds.length,
    textbook_unit_evidence_ids: unitIds
  }
}

function splitSurfaceRowsForProgression(row, rows) {
  return rows
    .filter(item => item.subject_slug === row.subject_slug && item.progression_group_id === row.progression_group_id)
    .sort((a, b) => gradeNumber(a.grade_band) - gradeNumber(b.grade_band) || Number(a.worklist_rank || 0) - Number(b.worklist_rank || 0))
}

function splitSurfaceEvidenceByGrade(rows) {
  return Object.fromEntries(TARGET_GRADE_BANDS.map(grade => {
    const items = rows.filter(row => row.grade_band === grade)
    return [grade, {
      split_review_items: items.length,
      standard_codes: sorted(items.map(row => row.standard_code)),
      unit_titles: sorted(items.map(row => row.unit_title)),
      unit_evidence_ids: sorted(items.map(row => row.unit_evidence_id))
    }]
  }))
}

function publicEvidenceByGrade(siblings) {
  return Object.fromEntries(TARGET_GRADE_BANDS.map(grade => {
    const item = siblings.find(row => row.grade_band === grade)
    return [grade, {
      code: item?.code || '',
      grade_specific_focus_status: item ? (placeholderFocus(item.grade_specific_focus) ? 'placeholder_or_missing' : 'reviewed_or_specific') : 'missing_public_sibling',
      textbook_unit_evidence_count: (item?.textbook_unit_evidence_ids || []).length
    }]
  }))
}

function contrastRoute({ fullTriplet, identicalText, siblingPublicEvidenceGrades, splitSurfaceGradeBands }) {
  if (!fullTriplet) return 'missing_public_sibling_progression_context'
  if (identicalText && siblingPublicEvidenceGrades.length === 0 && splitSurfaceGradeBands.length <= 1) {
    return 'identical_official_standard_current_grade_only_source_evidence'
  }
  if (identicalText && siblingPublicEvidenceGrades.length === 0) {
    return 'identical_official_standard_no_public_unit_evidence_yet'
  }
  if (identicalText) return 'identical_official_standard_compare_grade_specific_evidence'
  return 'nonidentical_official_standard_requires_manual_progression_check'
}

function reviewFocus(route) {
  if (route === 'identical_official_standard_current_grade_only_source_evidence') {
    return 'Do not accept from the current unit alone; first prove the body-text evidence is grade-specific and not only a shared official standard.'
  }
  if (route === 'identical_official_standard_no_public_unit_evidence_yet') {
    return 'Compare sibling H4G standards before accepting; official text is identical and no sibling has public unit evidence yet.'
  }
  if (route === 'identical_official_standard_compare_grade_specific_evidence') {
    return 'Compare against sibling grade evidence and preserve the official shared standard text.'
  }
  if (route === 'missing_public_sibling_progression_context') {
    return 'Repair sibling progression context before deciding this exact anchor.'
  }
  return 'Manually inspect whether the official standard text itself differs by grade before routing.'
}

function progressionContrastId(row) {
  return `h4g_anchor_group_post_candidate_source_anchor_exact_group_split_review_progression_contrast_${hashText(row.split_review_item_id)}`
}

function buildContrastItem(row, rows, standardsBySubject) {
  const siblings = publicSiblings(row, standardsBySubject)
  const compactSiblings = siblings.map(compactSibling)
  const siblingGradeBands = sorted(compactSiblings.map(item => item.grade_band))
  const splitRows = splitSurfaceRowsForProgression(row, rows)
  const splitSurfaceGradeBands = sorted(splitRows.map(item => item.grade_band))
  const siblingPublicEvidenceGrades = sorted(compactSiblings.filter(item => item.textbook_unit_evidence_count > 0).map(item => item.grade_band))
  const officialTextSet = sorted(compactSiblings.map(item => normalizeText(item.standard)))
  const fullTriplet = TARGET_GRADE_BANDS.every(grade => siblingGradeBands.includes(grade))
  const identicalText = fullTriplet && officialTextSet.length === 1
  const route = contrastRoute({ fullTriplet, identicalText, siblingPublicEvidenceGrades, splitSurfaceGradeBands })
  const pagePreviews = row.page_evidence_context?.page_text_excerpt_previews || []
  return {
    approval_prohibited: true,
    changes_official_standard_text: false,
    contrast_route: route,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    exact_anchor_evidence_packet_id: row.exact_anchor_evidence_packet_id || '',
    grade_band: row.grade_band || '',
    group_review_route: row.group_review_route || '',
    has_full_h4g_triplet_context: fullTriplet,
    inherited_risk_profile: row.risk_profile || {},
    official_standard_texts_identical_across_siblings: identicalText,
    page_evidence_status: row.page_evidence_status || '',
    page_hint_source: row.page_hint_source || '',
    page_text_excerpt_previews: pagePreviews.slice(0, 3),
    progression_contrast_item_id: progressionContrastId(row),
    progression_contrast_only: true,
    progression_group_id: row.progression_group_id || '',
    publication_ready: false,
    recommendation_only: false,
    review_focus: reviewFocus(route),
    review_only: true,
    review_questions: [
      'Compare the target grade row against its H4G7/H4G8/H4G9 sibling standards before any accept decision.',
      'If the official standard text is identical, the body-text evidence must prove a grade-specific focus rather than a broad unit topic.',
      'If sibling grades still have placeholder focus and no unit evidence, treat the current row as a pending source-evidence clue, not a public-ready differentiator.',
      'Record exact page activity/task/language behavior evidence before changing the editable split decision.',
      'Keep official standard text unchanged even when a grade-specific focus is later approved.',
      ...(row.review_questions || []).slice(0, 8)
    ],
    sibling_grade_bands: siblingGradeBands,
    sibling_h4g_grade_count: siblingGradeBands.length,
    sibling_progression_records: compactSiblings,
    sibling_public_evidence_by_grade: publicEvidenceByGrade(siblings),
    sibling_public_unit_evidence_grades: siblingPublicEvidenceGrades,
    source_split_review_item_id: row.split_review_item_id || '',
    source_standard_context: row.source_standard_context || {},
    split_surface_evidence_by_grade: splitSurfaceEvidenceByGrade(splitRows),
    split_surface_grade_bands_for_progression: splitSurfaceGradeBands,
    standard_code: row.standard_code || '',
    subject_slug: row.subject_slug || '',
    target_standard_code: row.target_standard_code || row.standard_code || '',
    unit_context: row.unit_context || {},
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || '',
    work_queue: row.work_queue || '',
    worklist_rank: row.worklist_rank || 0,
    writes_public_data: false
  }
}

function summarize(items) {
  const summary = {
    auto_approval_items: 0,
    by_contrast_route: {},
    by_grade_band: {},
    by_group_review_route: {},
    by_official_standard_text_similarity: {},
    by_sibling_grade_context: {},
    by_subject: {},
    by_work_queue: {},
    full_h4g_triplet_context_items: 0,
    identical_official_standard_items: 0,
    missing_sibling_context_items: 0,
    progression_contrast_items: items.length,
    public_write_items: 0,
    split_surface_current_grade_only_items: 0,
    unique_progression_groups: sorted(items.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(items.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(items.map(row => row.unit_evidence_id)).length
  }
  for (const row of items) {
    countInto(summary.by_contrast_route, row.contrast_route)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_group_review_route, row.group_review_route)
    countInto(summary.by_official_standard_text_similarity, row.official_standard_texts_identical_across_siblings ? 'identical' : 'not_identical_or_incomplete')
    countInto(summary.by_sibling_grade_context, row.sibling_grade_bands.join('+') || 'missing')
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_work_queue, row.work_queue)
    if (row.has_full_h4g_triplet_context) summary.full_h4g_triplet_context_items += 1
    else summary.missing_sibling_context_items += 1
    if (row.official_standard_texts_identical_across_siblings) summary.identical_official_standard_items += 1
    if ((row.split_surface_grade_bands_for_progression || []).length <= 1) summary.split_surface_current_grade_only_items += 1
    if (row.writes_public_data !== false) summary.public_write_items += 1
  }
  return summary
}

function emptyStats(surface) {
  const rows = surface.exact_anchor_group_split_review_items || []
  return {
    ...summarize([]),
    duplicate_packet_items: 0,
    expected_progression_contrast_items: rows.length,
    extra_packet_items: 0,
    missing_decision_items: 0,
    missing_packet_items: 0,
    missing_recommendation_items: 0,
    row_mismatch_items: 0
  }
}

function validatePacketRows(packetRows, expectedRows, stats, errors) {
  const expectedBySourceId = new Map(expectedRows.map(row => [row.source_split_review_item_id, row]))
  const packetBySourceId = new Map()
  for (const row of packetRows) {
    const sourceId = row.source_split_review_item_id || ''
    if (!sourceId) {
      errors.push(`${row.progression_contrast_item_id || '(missing item id)'} missing source_split_review_item_id`)
      stats.extra_packet_items += 1
      continue
    }
    if (packetBySourceId.has(sourceId)) {
      errors.push(`duplicate progression contrast packet source row: ${sourceId}`)
      stats.duplicate_packet_items += 1
    }
    packetBySourceId.set(sourceId, row)
  }

  for (const expected of expectedRows) {
    const actual = packetBySourceId.get(expected.source_split_review_item_id)
    if (!actual) {
      errors.push(`${expected.source_split_review_item_id} missing progression contrast packet row`)
      stats.missing_packet_items += 1
      continue
    }
    if (!sameJson(actual, expected)) {
      errors.push(`${expected.source_split_review_item_id} does not match recomputed progression contrast row`)
      stats.row_mismatch_items += 1
    }
  }

  for (const row of packetRows) {
    if (!expectedBySourceId.has(row.source_split_review_item_id || '')) {
      errors.push(`${row.source_split_review_item_id || '(missing source id)'} extra progression contrast packet row`)
      stats.extra_packet_items += 1
    }
    if (row.writes_public_data !== false) errors.push(`${row.progression_contrast_item_id || row.source_split_review_item_id} writes_public_data must be false`)
    if (row.changes_official_standard_text !== false) {
      errors.push(`${row.progression_contrast_item_id || row.source_split_review_item_id} changes_official_standard_text must be false`)
    }
    if (row.direct_matcher_use !== false) errors.push(`${row.progression_contrast_item_id || row.source_split_review_item_id} direct_matcher_use must be false`)
    if (row.eligible_for_h4g_differentiation !== false) {
      errors.push(`${row.progression_contrast_item_id || row.source_split_review_item_id} eligible_for_h4g_differentiation must be false`)
    }
    if (row.approval_prohibited !== true) errors.push(`${row.progression_contrast_item_id || row.source_split_review_item_id} approval_prohibited must be true`)
    if (row.progression_contrast_only !== true) errors.push(`${row.progression_contrast_item_id || row.source_split_review_item_id} progression_contrast_only must be true`)
    if (row.review_only !== true) errors.push(`${row.progression_contrast_item_id || row.source_split_review_item_id} review_only must be true`)
  }
}

function validatePairedSources(surface, decisions, recommendations, stats, errors) {
  const decisionBySplitItemId = mapBy(decisions.split_review_decisions || [], 'source_split_review_item_id', errors, 'split review decision')
  const recommendationByDecisionId = mapBy(recommendations.split_review_recommendations || [], 'source_split_review_decision_id', errors, 'split review recommendation')
  for (const row of surface.exact_anchor_group_split_review_items || []) {
    const decision = decisionBySplitItemId.get(row.split_review_item_id)
    if (!decision) {
      stats.missing_decision_items += 1
      errors.push(`${row.split_review_item_id} missing paired split review decision`)
      continue
    }
    if (!recommendationByDecisionId.has(decision.decision_id)) {
      stats.missing_recommendation_items += 1
      errors.push(`${decision.decision_id} missing paired split review recommendation`)
    }
  }
}

function validateSummary(packet, expectedSummary, stats, errors) {
  const summary = packet.summary || {}
  for (const key of [
    'auto_approval_items',
    'full_h4g_triplet_context_items',
    'identical_official_standard_items',
    'missing_sibling_context_items',
    'progression_contrast_items',
    'public_write_items',
    'split_surface_current_grade_only_items',
    'unique_progression_groups',
    'unique_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (Number(summary[key] || 0) !== Number(expectedSummary[key] || 0)) errors.push(`summary.${key} mismatch`)
  }
  for (const key of [
    'by_contrast_route',
    'by_grade_band',
    'by_group_review_route',
    'by_official_standard_text_similarity',
    'by_sibling_grade_context',
    'by_subject',
    'by_work_queue'
  ]) {
    if (!sameJson(summary[key] || {}, expectedSummary[key] || {})) errors.push(`summary.${key} mismatch`)
  }
  Object.assign(stats, expectedSummary)
}

function markdownSummary(payload) {
  return `# H4G Exact Group Split Review Progression Contrast Packet Audit

Generated at: ${payload.generated_at}

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| expected progression contrast items | ${payload.summary.expected_progression_contrast_items} |
| progression contrast items | ${payload.summary.progression_contrast_items} |
| missing packet items | ${payload.summary.missing_packet_items} |
| extra packet items | ${payload.summary.extra_packet_items} |
| row mismatch items | ${payload.summary.row_mismatch_items} |
| duplicate packet items | ${payload.summary.duplicate_packet_items} |
| full H4G triplet context items | ${payload.summary.full_h4g_triplet_context_items} |
| identical official standard items | ${payload.summary.identical_official_standard_items} |
| current-grade-only split surface items | ${payload.summary.split_surface_current_grade_only_items} |
| missing sibling context items | ${payload.summary.missing_sibling_context_items} |
| public write items | ${payload.summary.public_write_items} |
| auto approval items | ${payload.summary.auto_approval_items} |

## Contrast Routes

| route | rows |
| --- | ---: |
${countRows(payload.summary.by_contrast_route)}

## Sibling Grade Context

| sibling grades | rows |
| --- | ---: |
${countRows(payload.summary.by_sibling_grade_context)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    decisions: args.decisions,
    packet: args.packet,
    recommendations: args.recommendations,
    surface: args.surface
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const packet = existsSync(args.packet) ? readJson(args.packet) : { progression_contrast_items: [] }
  const surface = existsSync(args.surface) ? readJson(args.surface) : { exact_anchor_group_split_review_items: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { split_review_decisions: [] }
  const recommendations = existsSync(args.recommendations) ? readJson(args.recommendations) : { split_review_recommendations: [] }

  if (!errors.length) {
    validatePacketTopLevel(packet, args, errors)
    validateSourceArtifacts(surface, decisions, recommendations, args, errors)
  }

  const sourceRows = surface.exact_anchor_group_split_review_items || []
  if (args.requireItems && !sourceRows.length) errors.push('requireItems is set but split review surface has no rows')
  if (args.requireItems && !(packet.progression_contrast_items || []).length) {
    errors.push('requireItems is set but progression contrast packet has no rows')
  }

  const standardsBySubject = loadStandardsBySubject(args.dataRoot, sourceRows.map(row => row.subject_slug), errors)
  const expectedRows = sourceRows
    .map(row => buildContrastItem(row, sourceRows, standardsBySubject))
    .sort((a, b) => Number(a.worklist_rank || 0) - Number(b.worklist_rank || 0) || a.standard_code.localeCompare(b.standard_code))

  const stats = emptyStats(surface)
  validatePairedSources(surface, decisions, recommendations, stats, errors)
  validatePacketRows(packet.progression_contrast_items || [], expectedRows, stats, errors)
  validateSummary(packet, summarize(expectedRows), stats, errors)

  if (stats.public_write_items) errors.push(`progression contrast packet must not write public data: ${stats.public_write_items}`)
  if (stats.auto_approval_items) errors.push(`progression contrast packet must not auto-approve: ${stats.auto_approval_items}`)

  return {
    changes_official_standard_text: false,
    data_root: args.dataRoot,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    packet: args.packet,
    publication_ready: false,
    recommendations: args.recommendations,
    require_items: args.requireItems,
    source_split_review_decisions: args.decisions,
    source_split_review_surface: args.surface,
    summary: stats,
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
  const payload = audit(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({
    out: args.out,
    summary: payload.summary,
    valid: payload.valid
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
