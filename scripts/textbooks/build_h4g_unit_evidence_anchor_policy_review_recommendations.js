#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_batch.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_decisions_template.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_recommendations.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_recommendations.md'

const ALLOWED_DECISIONS = [
  'pending',
  'keep_noneligible_overbroad_match',
  'needs_source_anchor_specificity_review',
  'needs_scoped_alias_review',
  'needs_manual_candidate_rebuild',
  'reject_match_not_relevant'
]
const DECISION_SET = new Set(ALLOWED_DECISIONS)
const SCOPED_ALIGNMENT_VALUES = new Set(['reviewed_alias_anchor', 'strong_field_alignment', 'same_grade_unit_anchor'])

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
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
node scripts/textbooks/build_h4g_unit_evidence_anchor_policy_review_recommendations.js \\
  --strict --require-items

Builds read-only triage recommendations for H4G unit-evidence anchor-policy
review items. Recommendations help reviewers route each pending item, but they
do not approve candidates, fill selected_candidate_match_ids, write public/data,
change official standard text, or enable matcher/publication use.`)
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
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    publication_ready: false,
    recommendation_only: true,
    requires_later_candidate_coverage_recheck: true,
    requires_later_consistency_gate: true,
    requires_later_manual_review: true,
    requires_later_publication_gate: true,
    review_batch_only: true,
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

function validateInputs(batch, decisions, args, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_unit_evidence_anchor_policy_review_batch') errors.push('batch purpose mismatch')
  if (batch.review_batch_only !== true) errors.push('batch review_batch_only must be true')
  validatePolicy('batch', batch, errors)

  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_unit_evidence_anchor_policy_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  if (decisions.source_anchor_policy_review_batch !== args.batch) {
    errors.push('decisions source_anchor_policy_review_batch must match --batch')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  if (decisions.review_batch_only !== true) errors.push('decisions review_batch_only must be true')
  validatePolicy('decisions', decisions, errors)
  if (!sameJson(decisions.allowed_decisions || [], ALLOWED_DECISIONS)) errors.push('decisions allowed_decisions mismatch')
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

function matchOptionIds(row) {
  return sorted((row?.candidate_match_options || []).map(match => match.match_id))
}

function validateDecisionCoverage(batch, decisions, errors) {
  const decisionByItem = mapBy(decisions.anchor_policy_review_decisions || [], 'anchor_policy_review_item_id', errors, 'decisions')
  for (const item of batch.anchor_policy_review_items || []) {
    const decision = decisionByItem.get(item.anchor_policy_review_item_id)
    if (!decision) {
      errors.push(`${item.anchor_policy_review_item_id} missing decision template row`)
      continue
    }
    if (decision.standard_code !== item.standard_code) errors.push(`${decision.decision_id} standard_code mismatch`)
    if (decision.grade_band !== item.grade_band) errors.push(`${decision.decision_id} grade_band mismatch`)
    const itemMatchIds = sorted((item.candidate_matches || []).map(match => match.match_id))
    if (!sameJson(matchOptionIds(decision), itemMatchIds)) {
      errors.push(`${decision.decision_id} candidate_match_options mismatch`)
    }
    if (!DECISION_SET.has(decision.reviewer_decision)) {
      errors.push(`${decision.decision_id} invalid current reviewer_decision`)
    }
  }
}

function evidenceSummary(item) {
  const matches = item.candidate_matches || []
  const byConfidenceBand = {}
  const byEligibleAlignment = {}
  const byEdition = {}
  let matchesWithPageStart = 0
  let matchesWithoutPageStart = 0
  let highConfidenceMatches = 0
  let mediumConfidenceMatches = 0
  let keywordScoreTotal = 0
  let keywordScoreCount = 0
  let maxKeywordScore = null
  for (const match of matches) {
    countInto(byConfidenceBand, match.confidence_band)
    countInto(byEligibleAlignment, match.eligible_alignment)
    countInto(byEdition, match.edition)
    if (match.confidence_band === 'high') highConfidenceMatches += 1
    if (match.confidence_band === 'medium') mediumConfidenceMatches += 1
    if (match.page_start !== '' && match.page_start !== null && match.page_start !== undefined) matchesWithPageStart += 1
    else matchesWithoutPageStart += 1
    const keywordScore = Number(match.keyword_score)
    if (Number.isFinite(keywordScore)) {
      keywordScoreTotal += keywordScore
      keywordScoreCount += 1
      maxKeywordScore = maxKeywordScore === null ? keywordScore : Math.max(maxKeywordScore, keywordScore)
    }
  }
  return {
    by_confidence_band: byConfidenceBand,
    by_eligible_alignment: byEligibleAlignment,
    by_edition: byEdition,
    candidate_matches: matches.length,
    clean_edition_count: Number(item.source_diagnostic?.clean_edition_count || 0),
    coverage_status: item.source_diagnostic?.coverage_status || '',
    high_confidence_matches: highConfidenceMatches,
    keyword_score_average: keywordScoreCount ? Number((keywordScoreTotal / keywordScoreCount).toFixed(4)) : null,
    keyword_score_max: maxKeywordScore,
    matches_with_page_start: matchesWithPageStart,
    matches_without_page_start: matchesWithoutPageStart,
    medium_confidence_matches: mediumConfidenceMatches,
    public_has_unit_evidence: item.source_diagnostic?.public_has_unit_evidence === true,
    source_match_counts: item.source_diagnostic?.match_counts || {},
    unique_edition_count: sorted(matches.map(match => match.edition)).length,
    unique_evidence_count: sorted(matches.map(match => match.evidence_id)).length,
    unique_source_file_count: sorted(matches.map(match => match.source_file)).length,
    unit_titles: sorted(matches.map(match => match.unit_title))
  }
}

function riskFlags(item, summary) {
  const flags = []
  if (summary.coverage_status === 'missing_candidate_unit_evidence') flags.push('missing_candidate_unit_evidence')
  if (summary.clean_edition_count === 0) flags.push('no_clean_edition_unit_evidence')
  if (Object.keys(summary.by_eligible_alignment || {}).length === 1 && summary.by_eligible_alignment.none) {
    flags.push('noneligible_alignment_only')
  }
  if (summary.unique_edition_count < 2) flags.push('single_edition_candidate_pool')
  if (summary.candidate_matches < 2) flags.push('low_candidate_depth')
  if (summary.matches_with_page_start === 0) flags.push('no_page_start_candidates')
  else if (summary.matches_without_page_start > 0) flags.push('partial_page_start_candidates')
  if (item.group_progression_completeness !== 'complete_h4g_triplet') flags.push('partial_h4g_group')
  if (item.standard_context?.source_standard_scope === 'stage_shared_7_9') flags.push('stage_shared_source_standard')
  if (summary.high_confidence_matches === 0 && summary.medium_confidence_matches > 0) flags.push('medium_confidence_only')
  if (summary.high_confidence_matches > 0 && summary.by_eligible_alignment.none) flags.push('high_confidence_but_noneligible')
  return flags
}

function hasScopedAlignment(summary) {
  return Object.keys(summary.by_eligible_alignment || {}).some(value => SCOPED_ALIGNMENT_VALUES.has(value))
}

function referenceMatches(item, route) {
  if (route === 'manual_candidate_rebuild_required') return []
  return [...(item.candidate_matches || [])]
    .filter(match => match.page_start !== '' && match.page_start !== null && match.page_start !== undefined)
    .sort((a, b) => {
      const band = (b.confidence_band === 'high' ? 2 : 1) - (a.confidence_band === 'high' ? 2 : 1)
      if (band) return band
      const keyword = Number(b.keyword_score || 0) - Number(a.keyword_score || 0)
      if (keyword) return keyword
      return String(a.edition || '').localeCompare(String(b.edition || '')) || String(a.match_id || '').localeCompare(String(b.match_id || ''))
    })
    .slice(0, 5)
    .map(match => ({
      confidence_band: match.confidence_band || '',
      edition: match.edition || '',
      evidence_id: match.evidence_id || '',
      keyword_score: match.keyword_score ?? null,
      match_id: match.match_id || '',
      page_range: match.page_range || '',
      page_start: match.page_start || '',
      unit_title: match.unit_title || ''
    }))
}

function recommendationRoute(item, summary, flags) {
  if (summary.candidate_matches === 0) {
    return {
      decision: 'needs_manual_candidate_rebuild',
      nextGate: 'rebuild_candidate_unit_evidence_then_run_coverage_and_consistency_audits',
      reason: 'No candidate matches are available for reviewer inspection.',
      route: 'manual_candidate_rebuild_required'
    }
  }
  if (flags.includes('single_edition_candidate_pool') || flags.includes('low_candidate_depth') || flags.includes('no_page_start_candidates')) {
    return {
      decision: 'needs_manual_candidate_rebuild',
      nextGate: 'rebuild_candidate_unit_evidence_then_run_coverage_and_consistency_audits',
      reason: 'The candidate pool is too thin to support cross-version H4G grade differentiation.',
      route: 'manual_candidate_rebuild_required'
    }
  }
  if (hasScopedAlignment(summary)) {
    return {
      decision: 'needs_scoped_alias_review',
      nextGate: 'manual_scoped_alias_review_then_regenerate_unit_candidate_coverage',
      reason: 'At least one match has a scoped alignment signal, but it still needs manual same-grade and source-anchor confirmation.',
      route: 'scoped_alias_review_possible'
    }
  }
  return {
    decision: 'needs_source_anchor_specificity_review',
    nextGate: 'manual_anchor_specificity_review_before_decision_template_edit',
    reason: 'The matches are medium/high confidence, but all remain noneligible and need source-anchor specificity review before any decision template edit.',
    route: flags.includes('partial_page_start_candidates')
      ? 'source_anchor_specificity_review_with_page_gaps'
      : 'source_anchor_specificity_review_required'
  }
}

function requiredManualChecks(route, flags) {
  const checks = [
    'Confirm the match belongs to the same H4G grade, not only the shared 7-9 source standard.',
    'Confirm the unit title and page range are specific to this standard instead of a broad domain or project topic.',
    'Compare the candidate against sibling H4G7/H4G8/H4G9 standards in the same progression group.',
    'Document why the original noneligible alignment should remain blocked or move to a scoped source-review path.'
  ]
  if (route === 'manual_candidate_rebuild_required') {
    checks.push('Rebuild candidate unit evidence from source files with page_start and at least two editions before reviewer approval.')
  }
  if (route === 'source_anchor_specificity_review_with_page_gaps') {
    checks.push('Fill or discard candidate matches with missing page_start before selecting any match IDs.')
  }
  if (flags.includes('partial_h4g_group')) {
    checks.push('Repair or explicitly accept the partial H4G group before treating the evidence as a progression decision.')
  }
  return checks
}

function buildRecommendation(item, decision) {
  const summary = evidenceSummary(item)
  const flags = riskFlags(item, summary)
  const route = recommendationRoute(item, summary, flags)
  const matches = referenceMatches(item, route.route)
  return {
    allowed_reviewer_decisions: ALLOWED_DECISIONS,
    anchor_policy_review_item_id: item.anchor_policy_review_item_id || '',
    changes_official_standard_text: false,
    current_decision_status: decision?.decision_status || '',
    current_reviewer_decision: decision?.reviewer_decision || '',
    decision_id: decision?.decision_id || '',
    direct_matcher_use: false,
    do_not_copy_reference_matches_to_selected_candidate_match_ids: true,
    eligible_for_h4g_differentiation: false,
    evidence_summary: summary,
    grade_band: item.grade_band || '',
    group_grade_bands: item.group_grade_bands || [],
    group_progression_completeness: item.group_progression_completeness || '',
    group_standard_codes: item.group_standard_codes || [],
    matcher_ready: false,
    parent_action_work_item_id: item.parent_action_work_item_id || '',
    policy: policy(),
    priority_score: item.priority_score || 0,
    progression_group_id: item.progression_group_id || '',
    publication_ready: false,
    recommendation_confidence: 'triage_only',
    recommendation_id: `h4g_unit_anchor_policy_recommendation_${hashText(item.anchor_policy_review_item_id)}`,
    recommended_next_gate: route.nextGate,
    recommended_route: route.route,
    reference_candidate_match_ids: matches.map(match => match.match_id),
    reference_candidate_matches: matches,
    required_manual_checks: requiredManualChecks(route.route, flags),
    risk_flags: flags,
    selected_candidate_match_ids: [],
    standard_code: item.standard_code || '',
    standard_context: item.standard_context || null,
    subject_slug: item.subject_slug || '',
    suggested_reviewer_decision: route.decision,
    triage_reason: route.reason,
    writes_public_data: false
  }
}

function summarize(recommendations) {
  const summary = {
    anchor_policy_review_recommendations: recommendations.length,
    by_grade_band: {},
    by_recommended_next_gate: {},
    by_recommended_route: {},
    by_risk_flag: {},
    by_subject: {},
    by_suggested_reviewer_decision: {},
    candidate_match_options: 0,
    high_confidence_candidate_matches: 0,
    manual_rebuild_recommendations: 0,
    medium_confidence_candidate_matches: 0,
    noneligible_alignment_only_recommendations: 0,
    reference_candidate_match_ids: 0,
    source_anchor_specificity_review_recommendations: 0
  }
  for (const row of recommendations) {
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_recommended_next_gate, row.recommended_next_gate)
    countInto(summary.by_recommended_route, row.recommended_route)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_suggested_reviewer_decision, row.suggested_reviewer_decision)
    for (const flag of row.risk_flags || []) countInto(summary.by_risk_flag, flag)
    summary.candidate_match_options += row.evidence_summary?.candidate_matches || 0
    summary.high_confidence_candidate_matches += row.evidence_summary?.high_confidence_matches || 0
    summary.medium_confidence_candidate_matches += row.evidence_summary?.medium_confidence_matches || 0
    summary.reference_candidate_match_ids += row.reference_candidate_match_ids?.length || 0
    if (row.suggested_reviewer_decision === 'needs_manual_candidate_rebuild') summary.manual_rebuild_recommendations += 1
    if (row.suggested_reviewer_decision === 'needs_source_anchor_specificity_review') {
      summary.source_anchor_specificity_review_recommendations += 1
    }
    if (row.risk_flags?.includes('noneligible_alignment_only')) summary.noneligible_alignment_only_recommendations += 1
  }
  return summary
}

function tableRows(recommendations, limit = 50) {
  return recommendations.slice(0, limit).map(row => (
    `| ${markdownCell(row.recommendation_id)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.suggested_reviewer_decision)} | ${markdownCell(row.recommended_route)} | ${row.evidence_summary.candidate_matches} | ${row.evidence_summary.unique_edition_count} | ${row.evidence_summary.matches_with_page_start}/${row.evidence_summary.candidate_matches} | ${truncate(row.triage_reason, 90)} |`
  )).join('\n') || '| - | - | - | - | - | - | 0 | 0 | 0/0 | - |'
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Anchor Policy Review Recommendations

Generated at: ${payload.generated_at}

This read-only file triages anchor-policy review items into reviewer routes.
It is not a decision file: it does not approve candidates, fill
\`selected_candidate_match_ids\`, write \`public/data\`, change official standard
text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| recommendations | ${payload.summary.anchor_policy_review_recommendations} |
| candidate match options | ${payload.summary.candidate_match_options} |
| reference match IDs | ${payload.summary.reference_candidate_match_ids} |
| manual rebuild recommendations | ${payload.summary.manual_rebuild_recommendations} |
| source anchor specificity review recommendations | ${payload.summary.source_anchor_specificity_review_recommendations} |
| noneligible alignment only recommendations | ${payload.summary.noneligible_alignment_only_recommendations} |

## Suggested Reviewer Decisions

| decision | rows |
| --- | ---: |
${countRows(payload.summary.by_suggested_reviewer_decision)}

## Recommended Routes

| route | rows |
| --- | ---: |
${countRows(payload.summary.by_recommended_route)}

## Risk Flags

| risk flag | rows |
| --- | ---: |
${countRows(payload.summary.by_risk_flag)}

## First Recommendations

| recommendation | subject | grade | standard | suggested decision | route | matches | editions | page-start matches | reason |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
${tableRows(payload.anchor_policy_review_recommendations)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['batch', args.batch],
    ['decisions', args.decisions]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const batch = existsSync(args.batch) ? readJson(args.batch) : { anchor_policy_review_items: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { anchor_policy_review_decisions: [] }
  if (!errors.length) validateInputs(batch, decisions, args, errors)
  if (!errors.length) validateDecisionCoverage(batch, decisions, errors)

  const decisionsByItem = mapBy(decisions.anchor_policy_review_decisions || [], 'anchor_policy_review_item_id', errors, 'decisions')
  const recommendations = errors.length
    ? []
    : (batch.anchor_policy_review_items || [])
      .map(item => buildRecommendation(item, decisionsByItem.get(item.anchor_policy_review_item_id)))
      .sort((a, b) => {
        const priority = Number(b.priority_score || 0) - Number(a.priority_score || 0)
        if (priority) return priority
        return a.standard_code.localeCompare(b.standard_code)
      })
  if (args.requireItems && !recommendations.length) {
    errors.push('requireItems is set but no recommendations were generated')
  }

  return {
    anchor_policy_review_recommendations: recommendations,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: policy(),
    publication_ready: false,
    purpose: 'h4g_unit_evidence_anchor_policy_review_recommendations',
    recommendation_only: true,
    review_batch_only: true,
    source_anchor_policy_review_batch: args.batch,
    source_anchor_policy_review_decisions: args.decisions,
    summary: summarize(recommendations),
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
