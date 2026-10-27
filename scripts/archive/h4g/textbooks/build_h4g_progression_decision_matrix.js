#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_UNIT_CANDIDATE = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate.json'
const DEFAULT_CONSISTENCY = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_consistency_audit.json'
const DEFAULT_REVERSE_GAPS = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_reverse_lookup_gaps.json'
const DEFAULT_PLACEMENT_CANDIDATE = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_placement_evidence_candidate.json'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_decision_matrix.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_decision_matrix.md'
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])

function parseArgs(argv) {
  const args = {
    unitCandidate: DEFAULT_UNIT_CANDIDATE,
    consistency: DEFAULT_CONSISTENCY,
    reverseGaps: DEFAULT_REVERSE_GAPS,
    placementCandidate: DEFAULT_PLACEMENT_CANDIDATE,
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    subject: 'math',
    minEditionsPerStandard: 2,
    maxUnresolvedGaps: null,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--unit-candidate') args.unitCandidate = argv[++i]
    else if (item === '--consistency') args.consistency = argv[++i]
    else if (item === '--reverse-gaps') args.reverseGaps = argv[++i]
    else if (item === '--placement-candidate') args.placementCandidate = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subject') args.subject = argv[++i]
    else if (item === '--min-editions-per-standard') args.minEditionsPerStandard = positiveInteger(argv[++i], args.minEditionsPerStandard)
    else if (item === '--max-unresolved-gaps') args.maxUnresolvedGaps = positiveInteger(argv[++i], 0)
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_progression_decision_matrix.js \\
  --unit-candidate generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate.json \\
  --consistency generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_consistency_audit.json \\
  --reverse-gaps generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_reverse_lookup_gaps.json \\
  --placement-candidate generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_placement_evidence_candidate.json

Builds a read-only H4G progression decision matrix by joining same-grade unit
evidence, publication consistency, reverse lookup gaps, and edition-placement
diagnostics. The output is a pre-publication decision aid and never writes
public data or textbook_unit_evidence_ids.`)
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
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

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadSubjectStandards(dataRoot, subject) {
  const standards = []
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    if (subject && subjectSlug !== subject) continue
    const payload = readJson(file)
    for (const row of payload.standards || []) {
      if (TARGET_GRADE_BANDS.has(row.grade_band)) standards.push(row)
    }
  }
  standards.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
  return standards
}

function unsafePolicyErrors(payload, label) {
  const errors = []
  if (payload?.valid === false) errors.push(`${label} is marked valid=false`)
  if (payload?.policy?.writes_public_data !== undefined && payload.policy.writes_public_data !== false) {
    errors.push(`${label} policy.writes_public_data must be false`)
  }
  if (payload?.policy?.writes_textbook_unit_evidence_ids !== undefined && payload.policy.writes_textbook_unit_evidence_ids !== false) {
    errors.push(`${label} policy.writes_textbook_unit_evidence_ids must be false`)
  }
  return errors
}

function detailByStandard(consistency) {
  const out = new Map()
  for (const detail of consistency?.summary?.candidate_details || []) {
    if (detail.standard_code) out.set(detail.standard_code, detail)
  }
  return out
}

function unitCandidateByStandard(unitCandidate) {
  const out = new Map()
  for (const candidate of unitCandidate?.candidates || []) {
    if (candidate.standard_code) out.set(candidate.standard_code, candidate)
  }
  return out
}

function reverseGapByStandard(reverseGaps) {
  const out = new Map()
  for (const gap of reverseGaps?.standard_gaps || []) {
    if (gap.standard_code) out.set(gap.standard_code, gap)
  }
  return out
}

function placementByStandard(placementCandidate) {
  const out = new Map()
  for (const candidate of placementCandidate?.candidates || []) {
    for (const standard of candidate.review_standards || []) {
      out.set(standard.standard_code, {
        candidate_id: candidate.candidate_id,
        progression_group_id: candidate.progression_group_id,
        topic_subdomains: candidate.topic_subdomains || [],
        missing_editions_with_cross_grade_topic: standard.missing_editions_with_cross_grade_topic || [],
        cross_grade_unit_count: (candidate.placement_evidence?.cross_grade_units || [])
          .filter(unit => unit.source_standard_code === standard.standard_code).length,
        same_grade_unit_count: (candidate.placement_evidence?.same_grade_units || [])
          .filter(unit => unit.source_standard_code === standard.standard_code).length
      })
    }
  }
  return out
}

function actionCounts(gap) {
  const out = {}
  for (const action of gap?.missing_edition_actions || []) countInto(out, action.action)
  return out
}

function isPageReady(detail) {
  return detail?.page_evidence_status === 'page_start_present' &&
    !(detail.page_range_statuses || []).includes('toc_page_nonmonotonic')
}

function classifyStandard(standard, context) {
  const { unitByCode, detailByCode, gapByCode, placementByCode, minEditionsPerStandard } = context
  const unitCandidate = unitByCode.get(standard.code)
  const detail = detailByCode.get(standard.code)
  const gap = gapByCode.get(standard.code)
  const placement = placementByCode.get(standard.code)
  const editions = sorted(detail?.editions || [])
  const pageReady = isPageReady(detail)
  const editionReady = editions.length >= minEditionsPerStandard
  let decision = 'not_in_current_unit_candidate_scope'
  let recommendedNextStep = 'Defer until this standard enters a reviewed unit-evidence work item.'

  if (detail && editionReady && pageReady) {
    decision = 'same_grade_unit_candidate_ready'
    recommendedNextStep = 'Manual review may consider same-grade unit evidence; do not mark grade_specific_variant without source/progression review.'
  } else if (detail && placement) {
    decision = 'edition_placement_review'
    recommendedNextStep = 'Do not broaden aliases to force same-grade evidence; decide whether the progression model needs an edition-placement note or a different publication gate.'
  } else if (detail && gap) {
    decision = 'continue_gap_remediation'
    recommendedNextStep = 'Continue reverse lookup remediation for the missing same-grade editions before publication.'
  } else if (detail) {
    decision = 'same_grade_candidate_needs_more_evidence'
    recommendedNextStep = 'Review same-grade candidate quality and add missing editions before publication.'
  }

  return {
    standard_code: standard.code,
    subject_slug: standard.subject_slug,
    grade_band: standard.grade_band,
    grade: standard.grade || '',
    domain: standard.domain || '',
    subdomain: standard.subdomain || '',
    progression_group_id: standard.progression_group_id || '',
    decision,
    recommended_next_step: recommendedNextStep,
    same_grade_unit_candidate: Boolean(unitCandidate),
    same_grade_editions: editions,
    same_grade_edition_count: editions.length,
    same_grade_page_ready: pageReady,
    unit_evidence_count: detail?.unit_evidence_count || 0,
    page_range_statuses: detail?.page_range_statuses || [],
    reverse_gap_actions: actionCounts(gap),
    missing_same_grade_editions: gap?.missing_editions || [],
    placement_candidate_id: placement?.candidate_id || '',
    placement_topics: placement?.topic_subdomains || [],
    placement_missing_editions_with_cross_grade_topic: placement?.missing_editions_with_cross_grade_topic || [],
    placement_cross_grade_unit_count: placement?.cross_grade_unit_count || 0,
    placement_same_grade_unit_count: placement?.same_grade_unit_count || 0
  }
}

function groupRows(standards, standardDecisions) {
  const byGroup = new Map()
  const byCode = new Map(standardDecisions.map(row => [row.standard_code, row]))
  for (const standard of standards) {
    const groupId = standard.progression_group_id || 'missing'
    if (!byGroup.has(groupId)) {
      byGroup.set(groupId, {
        progression_group_id: groupId,
        subject_slug: standard.subject_slug || '',
        public_grade_bands: new Set(),
        standard_codes: new Set(),
        decisions: new Set(),
        ready_standards: new Set(),
        placement_review_standards: new Set(),
        unresolved_gap_standards: new Set(),
        candidate_standards: new Set()
      })
    }
    const group = byGroup.get(groupId)
    group.public_grade_bands.add(standard.grade_band)
    group.standard_codes.add(standard.code)
    const decision = byCode.get(standard.code)
    if (!decision) continue
    group.decisions.add(decision.decision)
    if (decision.same_grade_unit_candidate) group.candidate_standards.add(standard.code)
    if (decision.decision === 'same_grade_unit_candidate_ready') group.ready_standards.add(standard.code)
    if (decision.decision === 'edition_placement_review') group.placement_review_standards.add(standard.code)
    if (decision.decision === 'continue_gap_remediation' || decision.decision === 'same_grade_candidate_needs_more_evidence') {
      group.unresolved_gap_standards.add(standard.code)
    }
  }

  return [...byGroup.values()].map(group => {
    const decisions = sorted([...group.decisions])
    let groupDecision = 'not_in_current_unit_candidate_scope'
    if (group.unresolved_gap_standards.size) groupDecision = 'unresolved_gap_remediation'
    else if (group.placement_review_standards.size) groupDecision = 'edition_placement_model_review'
    else if (group.candidate_standards.size && group.ready_standards.size === group.standard_codes.size) {
      groupDecision = 'same_grade_publication_review_ready'
    } else if (group.candidate_standards.size) {
      groupDecision = 'partial_same_grade_candidate'
    }
    return {
      progression_group_id: group.progression_group_id,
      subject_slug: group.subject_slug,
      public_grade_bands: sorted([...group.public_grade_bands]),
      standard_codes: sorted([...group.standard_codes]),
      candidate_standards: sorted([...group.candidate_standards]),
      ready_standards: sorted([...group.ready_standards]),
      placement_review_standards: sorted([...group.placement_review_standards]),
      unresolved_gap_standards: sorted([...group.unresolved_gap_standards]),
      decisions,
      group_decision: groupDecision
    }
  }).sort((a, b) => a.progression_group_id.localeCompare(b.progression_group_id))
}

function buildMatrix(args) {
  const errors = []
  for (const [label, path] of [
    ['unit candidate', args.unitCandidate],
    ['consistency audit', args.consistency],
    ['reverse gaps', args.reverseGaps],
    ['placement candidate', args.placementCandidate]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (!existsSync(join(args.dataRoot, 'by_subject'))) errors.push(`Missing data root by_subject: ${args.dataRoot}`)

  const unitCandidate = errors.length ? { candidates: [] } : readJson(args.unitCandidate)
  const consistency = errors.length ? { summary: { candidate_details: [] } } : readJson(args.consistency)
  const reverseGaps = errors.length ? { standard_gaps: [] } : readJson(args.reverseGaps)
  const placementCandidate = errors.length ? { candidates: [] } : readJson(args.placementCandidate)
  errors.push(...unsafePolicyErrors(unitCandidate, 'unit candidate'))
  errors.push(...unsafePolicyErrors(placementCandidate, 'placement candidate'))

  if (placementCandidate?.policy?.cross_grade_units_are_diagnostic_only !== true) {
    errors.push('placement candidate policy.cross_grade_units_are_diagnostic_only must be true')
  }
  if (Array.isArray(placementCandidate?.candidates)) {
    for (const candidate of placementCandidate.candidates) {
      if (Object.prototype.hasOwnProperty.call(candidate, 'proposed_update')) {
        errors.push(`${candidate.progression_group_id || candidate.candidate_id} placement candidate must not contain proposed_update`)
      }
    }
  }

  const standards = errors.length ? [] : loadSubjectStandards(args.dataRoot, args.subject)
  const context = {
    unitByCode: unitCandidateByStandard(unitCandidate),
    detailByCode: detailByStandard(consistency),
    gapByCode: reverseGapByStandard(reverseGaps),
    placementByCode: placementByStandard(placementCandidate),
    minEditionsPerStandard: args.minEditionsPerStandard
  }
  const standardDecisions = standards.map(standard => classifyStandard(standard, context))
  const progressionGroups = groupRows(standards, standardDecisions)
  const summary = {
    subject: args.subject,
    standards_in_subject: standards.length,
    progression_groups_in_subject: progressionGroups.length,
    same_grade_unit_candidate_standards: 0,
    same_grade_unit_candidate_ready: 0,
    edition_placement_review_standards: 0,
    unresolved_gap_standards: 0,
    not_in_current_unit_candidate_scope: 0,
    placement_review_progression_groups: 0,
    unresolved_gap_progression_groups: 0,
    same_grade_publication_review_ready_groups: 0,
    by_standard_decision: {},
    by_group_decision: {}
  }
  for (const row of standardDecisions) {
    countInto(summary.by_standard_decision, row.decision)
    if (row.same_grade_unit_candidate) summary.same_grade_unit_candidate_standards += 1
    if (row.decision === 'same_grade_unit_candidate_ready') summary.same_grade_unit_candidate_ready += 1
    if (row.decision === 'edition_placement_review') summary.edition_placement_review_standards += 1
    if (row.decision === 'continue_gap_remediation' || row.decision === 'same_grade_candidate_needs_more_evidence') {
      summary.unresolved_gap_standards += 1
    }
    if (row.decision === 'not_in_current_unit_candidate_scope') summary.not_in_current_unit_candidate_scope += 1
  }
  for (const group of progressionGroups) {
    countInto(summary.by_group_decision, group.group_decision)
    if (group.group_decision === 'edition_placement_model_review') summary.placement_review_progression_groups += 1
    if (group.group_decision === 'unresolved_gap_remediation') summary.unresolved_gap_progression_groups += 1
    if (group.group_decision === 'same_grade_publication_review_ready') summary.same_grade_publication_review_ready_groups += 1
  }

  if (args.maxUnresolvedGaps !== null && summary.unresolved_gap_standards > args.maxUnresolvedGaps) {
    errors.push(`unresolved_gap_standards=${summary.unresolved_gap_standards} exceeds maxUnresolvedGaps=${args.maxUnresolvedGaps}`)
  }

  return {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    sources: {
      unit_candidate: args.unitCandidate,
      consistency: args.consistency,
      reverse_gaps: args.reverseGaps,
      placement_candidate: args.placementCandidate,
      data_root: args.dataRoot
    },
    policy: {
      writes_public_data: false,
      writes_textbook_unit_evidence_ids: false,
      same_grade_unit_evidence_is_apply_prerequisite_only: true,
      edition_placement_evidence_is_diagnostic_only: true,
      min_editions_per_standard: args.minEditionsPerStandard,
      max_unresolved_gaps: args.maxUnresolvedGaps
    },
    summary,
    standard_decisions: standardDecisions,
    progression_groups: progressionGroups,
    errors
  }
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

function standardRow(row) {
  const placement = row.placement_topics.length
    ? `${row.placement_topics.join('；')} (${row.placement_cross_grade_unit_count} cross-grade units)`
    : '-'
  const gapActions = Object.entries(row.reverse_gap_actions)
    .map(([key, value]) => `${key}:${value}`)
    .join('；') || '-'
  return `| ${row.standard_code} | ${row.grade_band} | ${markdownCell(row.subdomain)} | ${row.decision} | ${row.same_grade_edition_count} | ${markdownCell(row.same_grade_editions.join('；') || '-')} | ${markdownCell(placement)} | ${markdownCell(gapActions)} |`
}

function groupRow(row) {
  return `| ${row.progression_group_id} | ${markdownCell(row.public_grade_bands.join('；'))} | ${markdownCell(row.candidate_standards.join('；') || '-')} | ${markdownCell(row.placement_review_standards.join('；') || '-')} | ${markdownCell(row.unresolved_gap_standards.join('；') || '-')} | ${row.group_decision} |`
}

function markdownSummary(payload) {
  const activeRows = payload.standard_decisions
    .filter(row => row.decision !== 'not_in_current_unit_candidate_scope')
  const activeTable = activeRows.map(standardRow).join('\n') || '| - | - | - | - | 0 | - | - | - |'
  const groupTable = payload.progression_groups
    .filter(row => row.group_decision !== 'not_in_current_unit_candidate_scope')
    .map(groupRow)
    .join('\n') || '| - | - | - | - | - | - |'
  const unresolved = activeRows
    .filter(row => row.decision === 'continue_gap_remediation' || row.decision === 'same_grade_candidate_needs_more_evidence')
    .map(standardRow)
    .join('\n') || '| - | - | - | - | 0 | - | - | - |'

  return `# H4G Progression Decision Matrix

生成时间：${payload.generated_at}

## Summary

| 指标 | 数量 |
| --- | ---: |
| standards in subject | ${payload.summary.standards_in_subject} |
| progression groups in subject | ${payload.summary.progression_groups_in_subject} |
| same-grade unit candidate standards | ${payload.summary.same_grade_unit_candidate_standards} |
| same-grade unit candidate ready | ${payload.summary.same_grade_unit_candidate_ready} |
| edition placement review standards | ${payload.summary.edition_placement_review_standards} |
| unresolved gap standards | ${payload.summary.unresolved_gap_standards} |
| not in current unit candidate scope | ${payload.summary.not_in_current_unit_candidate_scope} |
| placement review progression groups | ${payload.summary.placement_review_progression_groups} |
| unresolved gap progression groups | ${payload.summary.unresolved_gap_progression_groups} |

## Standard Decision Counts

| decision | count |
| --- | ---: |
${countRows(payload.summary.by_standard_decision)}

## Active Standard Decisions

| standard | grade | subdomain | decision | same-grade editions | editions | placement evidence | reverse gap actions |
| --- | --- | --- | --- | ---: | --- | --- | --- |
${activeTable}

## Active Progression Groups

| progression_group_id | public grades | candidate standards | placement review standards | unresolved gap standards | group decision |
| --- | --- | --- | --- | --- | --- |
${groupTable}

## Unresolved Same-Grade Gaps

| standard | grade | subdomain | decision | same-grade editions | editions | placement evidence | reverse gap actions |
| --- | --- | --- | --- | ---: | --- | --- | --- |
${unresolved}

## Boundary

- This matrix is read-only and does not write \`public/data\`.
- \`same_grade_unit_candidate_ready\` is a publication review input, not automatic release.
- \`edition_placement_review\` explains cross-version grade placement differences and must not be converted into same-grade \`textbook_unit_evidence_ids\`.
- Remaining unresolved gaps should be fixed through targeted reverse lookup, not broad alias relaxation.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const payload = buildMatrix(args)
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
