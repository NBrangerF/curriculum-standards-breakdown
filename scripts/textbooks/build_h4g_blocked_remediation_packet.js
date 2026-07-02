#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const BASE_DIR = 'generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean'
const DEFAULT_WORKLIST = `${BASE_DIR}/h4g_progression_review_worklist.json`
const DEFAULT_REVERSE_GAPS = `${BASE_DIR}/h4g_reverse_lookup_gaps.json`
const DEFAULT_ALIAS_REVIEW = `${BASE_DIR}/h4g_alias_source_review_packet.json`
const DEFAULT_EDITION_MODEL = `${BASE_DIR}/h4g_edition_placement_model_candidate.json`
const DEFAULT_OUT = `${BASE_DIR}/h4g_blocked_remediation_packet.json`
const DEFAULT_SUMMARY_OUT = `${BASE_DIR}/h4g_blocked_remediation_packet.md`

function parseArgs(argv) {
  const args = {
    worklist: DEFAULT_WORKLIST,
    reverseGaps: DEFAULT_REVERSE_GAPS,
    aliasReview: DEFAULT_ALIAS_REVIEW,
    editionModel: DEFAULT_EDITION_MODEL,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireItems: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--reverse-gaps') args.reverseGaps = argv[++i]
    else if (item === '--alias-review') args.aliasReview = argv[++i]
    else if (item === '--edition-model') args.editionModel = argv[++i]
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
node scripts/textbooks/build_h4g_blocked_remediation_packet.js \\
  --worklist generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_progression_review_worklist.json \\
  --strict --require-items

Builds a read-only action packet for H4G blocked/partial review items. It
joins the progression review worklist, reverse gaps, alias/source review packet,
and edition placement model candidates. It never writes public data.`)
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

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
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

function standardCodes(item) {
  return sorted((item.affected_standards || []).map(row => row.standard_code))
}

function aliasReviewsForItem(item, aliasReview) {
  const codes = new Set(standardCodes(item))
  return (aliasReview.review_items || [])
    .filter(review => {
      const reviewCodes = review.target_standard_codes || []
      if (review.progression_group_id === item.progression_group_id) return true
      return reviewCodes.some(code => codes.has(code))
    })
    .map(review => ({
      review_id: review.review_id || '',
      review_type: review.review_type || '',
      work_item_id: review.work_item_id || '',
      progression_group_id: review.progression_group_id || '',
      target_standard_codes: review.target_standard_codes || [],
      target_grade_bands: review.target_grade_bands || [],
      target_missing_editions: review.target_missing_editions || [],
      source_review_gate: review.source_review_gate || '',
      alias_review_status: review.alias_review_status || '',
      alias_review_recommended_action: review.alias_review_recommended_action || '',
      candidate_matches: (review.candidate_matches || []).slice(0, 5).map(match => ({
        edition: match.edition || '',
        unit_title: match.unit_title || '',
        page_start: match.page_start ?? null,
        page_range: match.page_range || '',
        page_range_status: match.page_range_status || '',
        score: match.score ?? null,
        bucket: match.bucket || '',
        eligible_alignment: match.eligible_alignment || '',
        specific_keywords: match.specific_keywords || [],
        generic_keywords: match.generic_keywords || []
      }))
    }))
}

function reverseGapByCode(reverseGaps) {
  return new Map((reverseGaps.standard_gaps || [])
    .filter(row => row.standard_code)
    .map(row => [row.standard_code, row]))
}

function editionModelByGroup(editionModel) {
  return new Map((editionModel.candidates || [])
    .filter(row => row.progression_group_id)
    .map(row => [row.progression_group_id, row]))
}

function actionCountsFromStandards(standards) {
  const out = {}
  for (const standard of standards || []) {
    for (const [action, count] of Object.entries(standard.reverse_gap_actions || {})) {
      countInto(out, action, count)
    }
  }
  return out
}

function missingEditionCount(standards) {
  return sorted((standards || []).flatMap(row => row.missing_same_grade_editions || [])).length
}

function currentEditionCount(standards) {
  return sorted((standards || []).flatMap(row => row.current_same_grade_editions || [])).length
}

function compactStandard(standard, gapByCode) {
  const gap = gapByCode.get(standard.standard_code) || {}
  return {
    standard_code: standard.standard_code || '',
    grade_band: standard.grade_band || '',
    domain: standard.domain || '',
    subdomain: standard.subdomain || '',
    current_same_grade_editions: standard.current_same_grade_editions || gap.current_editions || [],
    missing_same_grade_editions: standard.missing_same_grade_editions || gap.missing_editions || [],
    missing_editions_with_cross_grade_topic: standard.missing_editions_with_cross_grade_topic || [],
    reverse_gap_actions: standard.reverse_gap_actions || {},
    best_action: standard.best_action || gap.best_action || ''
  }
}

function placementProfile(item, editionCandidate) {
  const placementModel = editionCandidate?.placement_model || {}
  const placementSummary = editionCandidate?.placement_summary || {}
  const affected = editionCandidate?.affected_standards || []
  return {
    candidate_id: editionCandidate?.candidate_id || '',
    model_decision: placementModel.decision || '',
    confidence: placementModel.confidence || '',
    has_multi_grade_placement: Boolean(placementModel.has_multi_grade_placement),
    placement_grade_bands: placementSummary.placement_grade_bands || [],
    placement_grade_band_count: placementSummary.placement_grade_band_count || 0,
    edition_count: placementSummary.edition_count || 0,
    cross_grade_diagnostic_relations: (editionCandidate?.placement_relations || [])
      .filter(row => row.grade_relation !== 'same_grade').length,
    standards_with_uncovered_missing_editions: placementModel.standards_with_uncovered_missing_editions || [],
    missing_editions_without_cross_grade_topic: sorted(affected.flatMap(row => row.missing_editions_without_cross_grade_topic || [])),
    cross_grade_covered_missing_editions: sorted(affected.flatMap(row => row.cross_grade_covered_missing_editions || [])),
    same_grade_diagnostic_units: item.evidence_snapshot?.same_grade_units?.length || 0,
    cross_grade_diagnostic_units: item.evidence_snapshot?.cross_grade_units?.length || 0
  }
}

function gapProfile(item) {
  const analysis = item.remediation_analysis || {}
  return {
    remediation_decision: analysis.decision || '',
    reason_codes: analysis.reason_codes || [],
    safe_to_add_reviewed_alias: Boolean(analysis.safe_to_add_reviewed_alias),
    rerun_matching_recommended: Boolean(analysis.rerun_matching_recommended),
    eligible_missing_matches: analysis.eligible_missing_matches || 0,
    low_score_or_noise_matches: analysis.low_score_or_noise_matches || 0,
    missing_page_matches: analysis.missing_page_matches || 0,
    no_match_returned_editions: analysis.no_match_returned_editions || [],
    low_score_or_wrong_grade_editions: analysis.low_score_or_wrong_grade_editions || [],
    max_missing_top_match_score: analysis.max_missing_top_match_score ?? null
  }
}

function classifyPlacement(item, aliases, editionCandidate) {
  const profile = placementProfile(item, editionCandidate)
  if (profile.placement_grade_band_count <= 1) {
    return {
      action_family: 'placement_partial_single_direction_review',
      action_priority: 'high',
      decision_owner: 'curriculum_progression_review',
      recommended_next_step: 'Keep blocked and inspect the single-direction placement evidence; collect missing edition evidence before considering any progression-group note.'
    }
  }
  if (aliases.length) {
    return {
      action_family: 'placement_partial_source_review_before_note',
      action_priority: 'high',
      decision_owner: 'curriculum_progression_review',
      recommended_next_step: 'Review the linked source-review candidates, reject generic/noisy matches, and collect missing edition evidence before defining a placement note.'
    }
  }
  return {
    action_family: 'placement_partial_collect_missing_edition_evidence',
    action_priority: 'medium',
    decision_owner: 'curriculum_progression_review',
    recommended_next_step: 'Collect same-topic evidence for editions still missing cross-grade explanation; keep cross-grade units diagnostic only.'
  }
}

function classifyGap(item, aliases) {
  const profile = gapProfile(item)
  if (profile.remediation_decision === 'keep_blocked_no_safe_same_grade_remediation') {
    return {
      action_family: 'same_grade_gap_keep_blocked_no_safe_alias',
      action_priority: 'high',
      decision_owner: 'unit_evidence_remediation',
      recommended_next_step: 'Keep blocked; do not add alias or publish until a non-unit evidence model or stronger same-grade evidence exists.'
    }
  }
  if (aliases.length) {
    return {
      action_family: 'same_grade_gap_source_review_or_scoped_anchor',
      action_priority: 'high',
      decision_owner: 'unit_evidence_remediation',
      recommended_next_step: 'Inspect source-review matches and add only standard-scoped anchors if the same-grade unit is conceptually supported.'
    }
  }
  if ((profile.no_match_returned_editions || []).length) {
    return {
      action_family: 'same_grade_gap_collect_missing_edition_units',
      action_priority: 'medium',
      decision_owner: 'unit_evidence_remediation',
      recommended_next_step: 'Collect or re-index same-grade units for editions with no returned match; rerun matching before any publication review.'
    }
  }
  return {
    action_family: 'same_grade_gap_match_policy_review',
    action_priority: 'medium',
    decision_owner: 'unit_evidence_remediation',
    recommended_next_step: 'Inspect low-score or wrong-grade matches and update match policy only if stable, standard-scoped evidence supports it.'
  }
}

function buildItem(item, sources) {
  const codes = standardCodes(item)
  const aliases = aliasReviewsForItem(item, sources.aliasReview)
  const gapByCode = reverseGapByCode(sources.reverseGaps)
  const editionCandidate = editionModelByGroup(sources.editionModel).get(item.progression_group_id)
  const classification = item.work_item_type === 'edition_placement_model_review'
    ? classifyPlacement(item, aliases, editionCandidate)
    : classifyGap(item, aliases)
  const standards = (item.affected_standards || []).map(row => compactStandard(row, gapByCode))
  const reverseGapActions = actionCountsFromStandards(standards)

  return {
    remediation_item_id: `h4g_blocked_remediation_${hashText(item.work_item_id)}`,
    source_work_item_id: item.work_item_id,
    work_item_type: item.work_item_type,
    progression_group_id: item.progression_group_id,
    subject_slug: item.subject_slug || '',
    topic_subdomains: item.topic_subdomains || [],
    affected_standard_codes: codes,
    affected_standards: standards,
    action: {
      ...classification,
      writes_public_data: false,
      writes_textbook_unit_evidence_ids: false,
      cross_grade_evidence_is_diagnostic_only: item.work_item_type === 'edition_placement_model_review'
    },
    evidence_profile: {
      current_same_grade_edition_count: currentEditionCount(standards),
      missing_same_grade_edition_count: missingEditionCount(standards),
      reverse_gap_actions: reverseGapActions,
      linked_alias_source_review_count: aliases.length,
      linked_alias_source_reviews: aliases,
      gap: item.work_item_type === 'same_grade_gap_remediation' ? gapProfile(item) : null,
      placement: item.work_item_type === 'edition_placement_model_review'
        ? placementProfile(item, editionCandidate)
        : null
    },
    guardrails: [
      'Do not write public/data from this packet.',
      'Do not change official standard text.',
      item.work_item_type === 'edition_placement_model_review'
        ? 'Keep cross-grade units diagnostic; do not write them to same-grade textbook_unit_evidence_ids.'
        : 'Do not add broad aliases; any alias or anchor must be standard-scoped and source-reviewed.'
    ]
  }
}

function validatePayload(payload, worklist) {
  const errors = []
  const workIds = new Set((worklist.work_items || []).map(item => item.work_item_id))
  const coveredIds = new Set()
  for (const item of payload.remediation_items || []) {
    if (coveredIds.has(item.source_work_item_id)) errors.push(`${item.source_work_item_id} appears more than once`)
    coveredIds.add(item.source_work_item_id)
    if (!workIds.has(item.source_work_item_id)) errors.push(`${item.source_work_item_id} is not in worklist`)
    if (item.action?.writes_public_data !== false) errors.push(`${item.remediation_item_id} must not write public data`)
    if (item.action?.writes_textbook_unit_evidence_ids !== false) {
      errors.push(`${item.remediation_item_id} must not write textbook_unit_evidence_ids`)
    }
    if (item.work_item_type === 'edition_placement_model_review') {
      if (item.action.cross_grade_evidence_is_diagnostic_only !== true) {
        errors.push(`${item.remediation_item_id} placement item must keep cross-grade evidence diagnostic`)
      }
      if (!item.evidence_profile?.placement?.candidate_id) {
        errors.push(`${item.remediation_item_id} placement item missing edition model candidate`)
      }
    }
    if (item.work_item_type === 'same_grade_gap_remediation' && !item.evidence_profile?.gap?.remediation_decision) {
      errors.push(`${item.remediation_item_id} gap item missing remediation decision`)
    }
  }
  for (const id of workIds) {
    if (!coveredIds.has(id)) errors.push(`${id} from worklist is missing from remediation packet`)
  }
  return errors
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['worklist', args.worklist],
    ['reverse gaps', args.reverseGaps],
    ['alias review', args.aliasReview],
    ['edition model', args.editionModel]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const sources = errors.length
    ? { worklist: { work_items: [] }, reverseGaps: {}, aliasReview: {}, editionModel: {} }
    : {
        worklist: readJson(args.worklist),
        reverseGaps: readJson(args.reverseGaps),
        aliasReview: readJson(args.aliasReview),
        editionModel: readJson(args.editionModel)
      }

  for (const [label, payload] of [
    ['worklist', sources.worklist],
    ['reverse gaps', sources.reverseGaps],
    ['alias review', sources.aliasReview],
    ['edition model', sources.editionModel]
  ]) {
    if (payload.valid === false) errors.push(`${label} is marked valid=false`)
  }
  if (sources.worklist.policy?.writes_public_data !== false) errors.push('worklist policy.writes_public_data must be false')
  if (sources.aliasReview.policy?.writes_public_data !== false) errors.push('alias review policy.writes_public_data must be false')
  if (sources.editionModel.policy?.cross_grade_evidence_is_diagnostic_only !== true) {
    errors.push('edition model must keep cross-grade evidence diagnostic only')
  }

  const remediationItems = (sources.worklist.work_items || [])
    .map(item => buildItem(item, sources))
    .sort((a, b) => {
      const priority = String(a.action.action_priority).localeCompare(String(b.action.action_priority))
      if (priority) return priority
      const family = a.action.action_family.localeCompare(b.action.action_family)
      if (family) return family
      return a.progression_group_id.localeCompare(b.progression_group_id)
    })

  if (args.requireItems && !remediationItems.length) errors.push('requireItems is set but no remediation items were produced')

  const summary = {
    remediation_items: remediationItems.length,
    affected_standards: sorted(remediationItems.flatMap(item => item.affected_standard_codes)).length,
    linked_alias_source_review_items: 0,
    placement_partial_items: 0,
    same_grade_gap_items: 0,
    by_action_family: {},
    by_action_priority: {},
    by_decision_owner: {},
    by_work_item_type: {},
    by_gap_remediation_decision: {},
    by_placement_model_decision: {}
  }
  for (const item of remediationItems) {
    countInto(summary.by_action_family, item.action.action_family)
    countInto(summary.by_action_priority, item.action.action_priority)
    countInto(summary.by_decision_owner, item.action.decision_owner)
    countInto(summary.by_work_item_type, item.work_item_type)
    summary.linked_alias_source_review_items += item.evidence_profile.linked_alias_source_review_count
    if (item.work_item_type === 'edition_placement_model_review') {
      summary.placement_partial_items += 1
      countInto(summary.by_placement_model_decision, item.evidence_profile.placement?.model_decision)
    } else if (item.work_item_type === 'same_grade_gap_remediation') {
      summary.same_grade_gap_items += 1
      countInto(summary.by_gap_remediation_decision, item.evidence_profile.gap?.remediation_decision)
    }
  }

  const payload = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    sources: {
      worklist: args.worklist,
      reverse_gaps: args.reverseGaps,
      alias_source_review_packet: args.aliasReview,
      edition_placement_model_candidate: args.editionModel
    },
    policy: {
      purpose: 'h4g_blocked_remediation_action_packet',
      publication_candidate: false,
      writes_public_data: false,
      writes_textbook_unit_evidence_ids: false,
      official_standard_text_changed: false,
      cross_grade_evidence_is_diagnostic_only: true,
      requires_manual_or_source_review: true
    },
    summary,
    remediation_items: remediationItems,
    errors
  }
  payload.errors.push(...validatePayload(payload, sources.worklist))
  payload.valid = payload.errors.length === 0
  return payload
}

function itemRow(item) {
  const standards = item.affected_standard_codes.join('；')
  const topics = (item.topic_subdomains || []).join('；') || '-'
  return `| ${item.source_work_item_id} | ${item.work_item_type} | ${item.action.action_family} | ${item.action.action_priority} | ${markdownCell(topics)} | ${markdownCell(standards)} | ${item.evidence_profile.linked_alias_source_review_count} | ${markdownCell(item.action.recommended_next_step)} |`
}

function markdownSummary(payload) {
  const rows = payload.remediation_items.map(itemRow).join('\n') || '| - | - | - | - | - | - | 0 | - |'
  return `# H4G Blocked Remediation Packet

生成时间：${payload.generated_at}

worklist：\`${payload.sources.worklist}\`

reverse gaps：\`${payload.sources.reverse_gaps}\`

alias source review：\`${payload.sources.alias_source_review_packet}\`

edition model：\`${payload.sources.edition_placement_model_candidate}\`

## Summary

| 指标 | 数量 |
| --- | ---: |
| remediation items | ${payload.summary.remediation_items} |
| affected standards | ${payload.summary.affected_standards} |
| placement partial items | ${payload.summary.placement_partial_items} |
| same-grade gap items | ${payload.summary.same_grade_gap_items} |
| linked alias source review items | ${payload.summary.linked_alias_source_review_items} |

## Action Families

| action family | count |
| --- | ---: |
${countRows(payload.summary.by_action_family)}

## Owners

| owner | count |
| --- | ---: |
${countRows(payload.summary.by_decision_owner)}

## Gap Remediation Decisions

| decision | count |
| --- | ---: |
${countRows(payload.summary.by_gap_remediation_decision)}

## Placement Decisions

| decision | count |
| --- | ---: |
${countRows(payload.summary.by_placement_model_decision)}

## Remediation Items

| source work item | type | action family | priority | topic | affected standards | source-review links | next step |
| --- | --- | --- | --- | --- | --- | ---: | --- |
${rows}

## Boundaries

- This packet is an action plan, not a publication candidate.
- It does not write \`public/data\`, \`textbook_unit_evidence_ids\`, or official standard text.
- Cross-grade evidence remains diagnostic only.
- Same-grade remediation must use source-reviewed, standard-scoped evidence; broad aliases remain disallowed.
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
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({
    valid: payload.valid,
    wrote: args.out,
    summary_out: args.summaryOut,
    ...payload.summary,
    errors: payload.errors.length
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
