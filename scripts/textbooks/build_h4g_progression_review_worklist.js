#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISION_MATRIX = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_decision_matrix.json'
const DEFAULT_PLACEMENT_CANDIDATE = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_placement_evidence_candidate.json'
const DEFAULT_REVERSE_GAPS = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_reverse_lookup_gaps.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_review_worklist.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_review_worklist.md'
const REVIEW_DECISIONS = new Set(['edition_placement_review', 'continue_gap_remediation', 'same_grade_candidate_needs_more_evidence'])

function parseArgs(argv) {
  const args = {
    decisionMatrix: DEFAULT_DECISION_MATRIX,
    placementCandidate: DEFAULT_PLACEMENT_CANDIDATE,
    reverseGaps: DEFAULT_REVERSE_GAPS,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireWorkItems: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decision-matrix') args.decisionMatrix = argv[++i]
    else if (item === '--placement-candidate') args.placementCandidate = argv[++i]
    else if (item === '--reverse-gaps') args.reverseGaps = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-work-items') args.requireWorkItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_progression_review_worklist.js \\
  --decision-matrix generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_decision_matrix.json \\
  --strict --require-work-items

Builds a read-only worklist for H4G standards that are blocked from ready-only
unit evidence publication by edition placement differences or unresolved
same-grade gaps. The worklist is diagnostic and never writes public data.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
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

function standardDecisionByCode(matrix) {
  const out = new Map()
  for (const row of matrix?.standard_decisions || []) {
    if (row.standard_code) out.set(row.standard_code, row)
  }
  return out
}

function groupDecisionById(matrix) {
  const out = new Map()
  for (const row of matrix?.progression_groups || []) {
    if (row.progression_group_id) out.set(row.progression_group_id, row)
  }
  return out
}

function placementByGroup(placementCandidate) {
  const out = new Map()
  for (const candidate of placementCandidate?.candidates || []) {
    if (candidate.progression_group_id) out.set(candidate.progression_group_id, candidate)
  }
  return out
}

function reverseGapByCode(reverseGaps) {
  const out = new Map()
  for (const gap of reverseGaps?.standard_gaps || []) {
    if (gap.standard_code) out.set(gap.standard_code, gap)
  }
  return out
}

function actionCounts(gap) {
  const out = {}
  for (const action of gap?.missing_edition_actions || []) countInto(out, action.action)
  return out
}

function compactMatch(match) {
  return {
    edition: match.edition || '',
    volume: match.volume || '',
    unit_evidence_id: match.unit_evidence_id || '',
    textbook_evidence_id: match.textbook_evidence_id || '',
    unit_title: match.unit_title || '',
    score: match.score ?? null,
    confidence_band: match.confidence_band || '',
    bucket: match.bucket || '',
    page_start: match.page_start ?? null,
    page_range: match.page_range || '',
    page_range_status: match.page_range_status || '',
    eligible: Boolean(match.eligible),
    eligible_alignment: match.eligible_alignment || 'none',
    matched_keywords: match.matched_keywords || [],
    subdomain_alignment: {
      required: Boolean(match.subdomain_alignment?.required),
      matched: Boolean(match.subdomain_alignment?.matched),
      anchors: match.subdomain_alignment?.anchors || [],
      matched_anchors: match.subdomain_alignment?.matched_anchors || []
    },
    alias_alignment: {
      required: Boolean(match.alias_alignment?.required),
      matched: Boolean(match.alias_alignment?.matched),
      reviewed_aliases: match.alias_alignment?.reviewed_aliases || [],
      matched_terms: match.alias_alignment?.matched_terms || []
    }
  }
}

function compactMissingActions(gap) {
  return (gap?.missing_edition_actions || []).map(action => ({
    edition: action.edition || '',
    action: action.action || '',
    top_matches: (action.top_matches || []).slice(0, 5).map(compactMatch)
  }))
}

function compactUnit(unit) {
  return {
    source_standard_code: unit.source_standard_code || '',
    source_standard_grade_band: unit.source_standard_grade_band || '',
    edition: unit.edition || '',
    volume: unit.volume || '',
    unit_grade_band: unit.unit_grade_band || '',
    grade_relation: unit.grade_relation || '',
    unit_evidence_id: unit.unit_evidence_id || '',
    textbook_evidence_id: unit.textbook_evidence_id || '',
    unit_title: unit.unit_title || '',
    page_start: unit.page_start ?? null,
    page_range: unit.page_range || '',
    page_range_status: unit.page_range_status || '',
    matched_terms: unit.matched_terms || []
  }
}

function placementStandards(candidate) {
  const byCode = new Map()
  for (const standard of candidate?.review_standards || []) {
    byCode.set(standard.standard_code, standard)
  }
  return byCode
}

function buildPlacementItem(group, placementCandidate, standardByCode) {
  const placementReviewCodes = group.placement_review_standards || []
  const reviewByCode = placementStandards(placementCandidate)
  const affectedStandards = placementReviewCodes.map(code => {
    const decision = standardByCode.get(code) || {}
    const review = reviewByCode.get(code) || {}
    return {
      standard_code: code,
      grade_band: decision.grade_band || review.grade_band || '',
      domain: decision.domain || '',
      subdomain: decision.subdomain || review.subdomain || '',
      current_same_grade_editions: review.current_same_grade_editions || decision.same_grade_editions || [],
      missing_same_grade_editions: review.missing_same_grade_editions || decision.missing_same_grade_editions || [],
      missing_editions_with_cross_grade_topic: review.missing_editions_with_cross_grade_topic || decision.placement_missing_editions_with_cross_grade_topic || [],
      same_grade_match_count: review.same_grade_match_count || decision.placement_same_grade_unit_count || 0,
      cross_grade_match_count: review.cross_grade_match_count || decision.placement_cross_grade_unit_count || 0,
      reverse_gap_actions: decision.reverse_gap_actions || {}
    }
  })

  const sameGradeUnits = (placementCandidate?.placement_evidence?.same_grade_units || []).map(compactUnit)
  const crossGradeUnits = (placementCandidate?.placement_evidence?.cross_grade_units || []).map(compactUnit)

  return {
    work_item_id: `h4g_progression_review_${hashText(`${group.progression_group_id}|placement`)}`,
    work_item_type: 'edition_placement_model_review',
    priority: 'high',
    progression_group_id: group.progression_group_id,
    subject_slug: group.subject_slug || 'math',
    topic_subdomains: placementCandidate?.topic_subdomains || sorted(affectedStandards.map(row => row.subdomain)),
    standard_codes: group.standard_codes || [],
    affected_standards: affectedStandards,
    ready_standards_in_group: group.ready_standards || [],
    candidate_standards_in_group: group.candidate_standards || [],
    evidence_snapshot: {
      same_grade_units: sameGradeUnits,
      cross_grade_units: crossGradeUnits,
      placement_by_edition_grade: placementCandidate?.placement_evidence?.placement_by_edition_grade || {}
    },
    required_decision: {
      decision_owner: 'curriculum_progression_review',
      question: '同一主题在不同教材版本被投放到不同年级时，发布门应如何表达 7/8/9 进阶关系？',
      acceptable_outcomes: [
        'Keep blocked: retain same_source_shared and require manual progression split.',
        'Add edition-placement note only: document cross-version grade placement without writing cross-grade units as same-grade evidence.',
        'Revise progression model: define a reviewed rule for this topic before any grade_specific_variant upgrade.'
      ],
      disallowed_outcomes: [
        'Do not broaden aliases only to satisfy same-grade edition count.',
        'Do not write cross-grade units into textbook_unit_evidence_ids for a same-grade standard.',
        'Do not mark grade_specific_variant without a reviewed progression rule.'
      ]
    },
    recommended_next_step: 'Review the edition-grade placement table and decide whether this topic needs an edition-placement note, a topic-specific progression rule, or continued blocking.',
    safety: {
      writes_public_data: false,
      writes_textbook_unit_evidence_ids: false,
      official_standard_text_changed: false,
      cross_grade_evidence_is_diagnostic_only: true,
      requires_manual_review: true
    }
  }
}

function buildGapItem(group, standardByCode, gapByCode) {
  const gapCodes = group.unresolved_gap_standards || []
  const affectedStandards = gapCodes.map(code => {
    const decision = standardByCode.get(code) || {}
    const gap = gapByCode.get(code) || {}
    return {
      standard_code: code,
      grade_band: decision.grade_band || gap.grade_band || '',
      domain: decision.domain || '',
      subdomain: decision.subdomain || gap.subdomain || '',
      current_same_grade_editions: gap.current_editions || decision.same_grade_editions || [],
      missing_same_grade_editions: gap.missing_editions || decision.missing_same_grade_editions || [],
      best_action: gap.best_action || '',
      reverse_gap_actions: actionCounts(gap),
      missing_edition_actions: compactMissingActions(gap)
    }
  })

  return {
    work_item_id: `h4g_progression_review_${hashText(`${group.progression_group_id}|gap`)}`,
    work_item_type: 'same_grade_gap_remediation',
    priority: 'high',
    progression_group_id: group.progression_group_id,
    subject_slug: group.subject_slug || 'math',
    topic_subdomains: sorted(affectedStandards.map(row => row.subdomain)),
    standard_codes: group.standard_codes || [],
    affected_standards: affectedStandards,
    ready_standards_in_group: group.ready_standards || [],
    candidate_standards_in_group: group.candidate_standards || [],
    required_decision: {
      decision_owner: 'unit_evidence_remediation',
      question: '缺失版本是否能通过精确 alias、目录修复或重跑匹配获得同年级单元证据？',
      acceptable_outcomes: [
        'Add a standard-scoped reviewed alias only when it is conceptually equivalent and supported by unit titles.',
        'Fix missing page or TOC extraction issues, then rerun unit matching and candidate consistency audits.',
        'Keep blocked when top matches are low-score, wrong-grade, or no reliable unit is returned.'
      ],
      disallowed_outcomes: [
        'Do not add broad subject-level aliases.',
        'Do not accept low-score/noise matches to meet edition count.',
        'Do not publish with fewer than the configured same-grade edition gate.'
      ]
    },
    recommended_next_step: 'Inspect missing_edition_actions, add only scoped remediation if justified, then rerun reverse gap and progression decision gates.',
    safety: {
      writes_public_data: false,
      writes_textbook_unit_evidence_ids: false,
      official_standard_text_changed: false,
      cross_grade_evidence_is_diagnostic_only: false,
      requires_manual_review: true
    }
  }
}

function validateWorkItems(payload, matrix) {
  const errors = []
  const reviewCodes = new Set((matrix.standard_decisions || [])
    .filter(row => REVIEW_DECISIONS.has(row.decision))
    .map(row => row.standard_code))
  const coveredCodes = new Set()
  for (const item of payload.work_items) {
    if (item.safety?.writes_public_data !== false) errors.push(`${item.work_item_id} safety.writes_public_data must be false`)
    if (item.safety?.writes_textbook_unit_evidence_ids !== false) {
      errors.push(`${item.work_item_id} safety.writes_textbook_unit_evidence_ids must be false`)
    }
    for (const standard of item.affected_standards || []) {
      if (coveredCodes.has(standard.standard_code)) errors.push(`${standard.standard_code} appears in more than one work item`)
      coveredCodes.add(standard.standard_code)
    }
    if (item.work_item_type === 'edition_placement_model_review') {
      if (!item.evidence_snapshot?.cross_grade_units?.length) {
        errors.push(`${item.work_item_id} placement review item must include cross-grade diagnostic units`)
      }
      if (item.safety?.cross_grade_evidence_is_diagnostic_only !== true) {
        errors.push(`${item.work_item_id} must mark cross-grade evidence as diagnostic only`)
      }
    }
  }
  for (const code of reviewCodes) {
    if (!coveredCodes.has(code)) errors.push(`${code} is review-blocked in decision matrix but missing from worklist`)
  }
  for (const code of coveredCodes) {
    if (!reviewCodes.has(code)) errors.push(`${code} is in worklist but is not review-blocked in decision matrix`)
  }
  return errors
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['decision matrix', args.decisionMatrix],
    ['placement candidate', args.placementCandidate],
    ['reverse gaps', args.reverseGaps]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const matrix = errors.length ? { standard_decisions: [], progression_groups: [] } : readJson(args.decisionMatrix)
  const placementCandidate = errors.length ? { candidates: [] } : readJson(args.placementCandidate)
  const reverseGaps = errors.length ? { standard_gaps: [] } : readJson(args.reverseGaps)

  if (matrix.valid === false) errors.push('Decision matrix is marked valid=false')
  if (placementCandidate.valid === false) errors.push('Placement candidate is marked valid=false')
  if (reverseGaps.valid === false) errors.push('Reverse gap report is marked valid=false')
  if (matrix.policy?.writes_public_data !== false) errors.push('Decision matrix policy.writes_public_data must be false')
  if (matrix.policy?.writes_textbook_unit_evidence_ids !== false) {
    errors.push('Decision matrix policy.writes_textbook_unit_evidence_ids must be false')
  }
  if (placementCandidate.policy?.writes_public_data !== false) {
    errors.push('Placement candidate policy.writes_public_data must be false')
  }
  if (placementCandidate.policy?.cross_grade_units_are_diagnostic_only !== true) {
    errors.push('Placement candidate policy.cross_grade_units_are_diagnostic_only must be true')
  }

  const standardByCode = standardDecisionByCode(matrix)
  const gapByCode = reverseGapByCode(reverseGaps)
  const placementById = placementByGroup(placementCandidate)
  const workItems = []
  const groups = groupDecisionById(matrix)

  for (const group of [...groups.values()].sort((a, b) => a.progression_group_id.localeCompare(b.progression_group_id))) {
    if (group.group_decision === 'edition_placement_model_review') {
      const placement = placementById.get(group.progression_group_id)
      if (!placement) {
        errors.push(`${group.progression_group_id} is edition_placement_model_review but has no placement candidate`)
        continue
      }
      workItems.push(buildPlacementItem(group, placement, standardByCode))
    } else if (group.group_decision === 'unresolved_gap_remediation') {
      workItems.push(buildGapItem(group, standardByCode, gapByCode))
    }
  }

  if (args.requireWorkItems && !workItems.length) errors.push('requireWorkItems is set but no work items were produced')

  const summary = {
    work_items: workItems.length,
    affected_standards: 0,
    edition_placement_work_items: 0,
    same_grade_gap_work_items: 0,
    edition_placement_review_standards: 0,
    same_grade_gap_standards: 0,
    cross_grade_unit_evidence: 0,
    same_grade_unit_evidence: 0,
    by_work_item_type: {},
    by_grade_band: {},
    by_required_decision_owner: {}
  }

  for (const item of workItems) {
    countInto(summary.by_work_item_type, item.work_item_type)
    countInto(summary.by_required_decision_owner, item.required_decision?.decision_owner)
    summary.affected_standards += (item.affected_standards || []).length
    for (const standard of item.affected_standards || []) countInto(summary.by_grade_band, standard.grade_band)
    if (item.work_item_type === 'edition_placement_model_review') {
      summary.edition_placement_work_items += 1
      summary.edition_placement_review_standards += (item.affected_standards || []).length
      summary.cross_grade_unit_evidence += item.evidence_snapshot?.cross_grade_units?.length || 0
      summary.same_grade_unit_evidence += item.evidence_snapshot?.same_grade_units?.length || 0
    } else if (item.work_item_type === 'same_grade_gap_remediation') {
      summary.same_grade_gap_work_items += 1
      summary.same_grade_gap_standards += (item.affected_standards || []).length
    }
  }

  const payload = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    sources: {
      decision_matrix: args.decisionMatrix,
      placement_candidate: args.placementCandidate,
      reverse_gaps: args.reverseGaps
    },
    policy: {
      writes_public_data: false,
      writes_textbook_unit_evidence_ids: false,
      official_standard_text_changed: false,
      cross_grade_evidence_is_diagnostic_only: true,
      publication_candidate: false,
      purpose: 'pre_publication_progression_review_worklist'
    },
    summary,
    work_items: workItems,
    errors
  }
  payload.errors.push(...validateWorkItems(payload, matrix))
  payload.valid = payload.errors.length === 0
  return payload
}

function workItemRow(item) {
  const standards = (item.affected_standards || []).map(row => `${row.standard_code}(${row.grade_band})`).join('；')
  const topics = (item.topic_subdomains || []).join('；') || '-'
  const same = item.evidence_snapshot?.same_grade_units?.length || 0
  const cross = item.evidence_snapshot?.cross_grade_units?.length || 0
  return `| ${item.work_item_id} | ${item.work_item_type} | ${item.progression_group_id} | ${markdownCell(topics)} | ${markdownCell(standards)} | ${same} | ${cross} |`
}

function affectedStandardRow(item, standard) {
  const missing = standard.missing_same_grade_editions || []
  const cross = standard.missing_editions_with_cross_grade_topic || []
  const actions = Object.entries(standard.reverse_gap_actions || {}).map(([key, value]) => `${key}:${value}`).join('；') || '-'
  return `| ${standard.standard_code} | ${standard.grade_band} | ${markdownCell(standard.subdomain)} | ${item.work_item_type} | ${markdownCell(missing.join('；') || '-')} | ${markdownCell(cross.join('；') || '-')} | ${markdownCell(actions)} |`
}

function markdownSummary(payload) {
  const workItemRows = payload.work_items.map(workItemRow).join('\n') || '| - | - | - | - | - | 0 | 0 |'
  const standardRows = payload.work_items
    .flatMap(item => (item.affected_standards || []).map(standard => affectedStandardRow(item, standard)))
    .join('\n') || '| - | - | - | - | - | - | - |'

  return `# H4G Progression Review Worklist

生成时间：${payload.generated_at}

decision matrix：\`${payload.sources.decision_matrix}\`

placement candidate：\`${payload.sources.placement_candidate}\`

reverse gaps：\`${payload.sources.reverse_gaps}\`

## Summary

| 指标 | 数量 |
| --- | ---: |
| work items | ${payload.summary.work_items} |
| affected standards | ${payload.summary.affected_standards} |
| edition placement work items | ${payload.summary.edition_placement_work_items} |
| edition placement standards | ${payload.summary.edition_placement_review_standards} |
| same-grade gap work items | ${payload.summary.same_grade_gap_work_items} |
| same-grade gap standards | ${payload.summary.same_grade_gap_standards} |
| same-grade diagnostic units | ${payload.summary.same_grade_unit_evidence} |
| cross-grade diagnostic units | ${payload.summary.cross_grade_unit_evidence} |

## Work Item Types

| type | count |
| --- | ---: |
${countRows(payload.summary.by_work_item_type)}

## Grade Bands

| grade | affected standards |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Work Items

| work item | type | progression group | topic | affected standards | same-grade units | cross-grade units |
| --- | --- | --- | --- | --- | ---: | ---: |
${workItemRows}

## Affected Standards

| standard | grade | subdomain | work type | missing same-grade editions | editions with cross-grade topic | reverse gap actions |
| --- | --- | --- | --- | --- | --- | --- |
${standardRows}

## Review Rule

- \`edition_placement_model_review\` means the same topic appears in different grades across editions; it must stay diagnostic until a progression rule is reviewed.
- \`same_grade_gap_remediation\` means the current same-grade evidence is incomplete; fix through scoped alias, TOC/page repair, or rerun matching.
- Cross-grade units must not be written to same-grade \`textbook_unit_evidence_ids\`.
- This worklist does not write \`public/data\`, does not alter official standard text, and is not a publication candidate.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const payload = buildPayload(args)
  writeJson(args.out, payload)
  if (args.summaryOut) {
    mkdirSync(dirname(args.summaryOut), { recursive: true })
    writeFileSync(args.summaryOut, markdownSummary(payload))
  }
  console.log(JSON.stringify({
    valid: payload.valid,
    wrote: args.out,
    summary_out: args.summaryOut || null,
    ...payload.summary,
    errors: payload.errors.length
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
