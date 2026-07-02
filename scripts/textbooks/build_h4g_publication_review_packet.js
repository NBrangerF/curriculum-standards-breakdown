#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const BASE_DIR = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean'
const DEFAULT_READY_CANDIDATE = `${BASE_DIR}/h4g_unit_evidence_candidate_ready_only.json`
const DEFAULT_EDITION_MODEL = `${BASE_DIR}/h4g_edition_placement_model_candidate.json`
const DEFAULT_REVIEW_WORKLIST = `${BASE_DIR}/h4g_progression_review_worklist.json`
const DEFAULT_DECISION_MATRIX = `${BASE_DIR}/h4g_progression_decision_matrix.json`
const DEFAULT_OUT = `${BASE_DIR}/h4g_publication_review_packet.json`
const DEFAULT_SUMMARY_OUT = `${BASE_DIR}/h4g_publication_review_packet.md`

function parseArgs(argv) {
  const args = {
    readyCandidate: DEFAULT_READY_CANDIDATE,
    editionModel: DEFAULT_EDITION_MODEL,
    reviewWorklist: DEFAULT_REVIEW_WORKLIST,
    decisionMatrix: DEFAULT_DECISION_MATRIX,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireReady: false,
    requireEditionNotes: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--ready-candidate') args.readyCandidate = argv[++i]
    else if (item === '--edition-model') args.editionModel = argv[++i]
    else if (item === '--review-worklist') args.reviewWorklist = argv[++i]
    else if (item === '--decision-matrix') args.decisionMatrix = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-ready') args.requireReady = true
    else if (item === '--require-edition-notes') args.requireEditionNotes = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_publication_review_packet.js \\
  --ready-candidate generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate_ready_only.json \\
  --edition-model generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_edition_placement_model_candidate.json \\
  --strict --require-ready --require-edition-notes

Builds a read-only publication review packet that keeps same-grade unit
evidence, edition-placement notes, and blocked remediation items in separate
pre-publication layers. It never writes public data.`)
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

function standardDecisionMap(decisionMatrix) {
  return new Map((decisionMatrix.standard_decisions || [])
    .filter(row => row.standard_code)
    .map(row => [row.standard_code, row]))
}

function worklistByGroup(worklist) {
  return new Map((worklist.work_items || [])
    .filter(item => item.progression_group_id)
    .map(item => [item.progression_group_id, item]))
}

function inputPolicyErrors(payload, label) {
  const errors = []
  if (payload?.valid === false) errors.push(`${label} is marked valid=false`)
  if (payload?.policy?.writes_public_data !== undefined && payload.policy.writes_public_data !== false) {
    errors.push(`${label} policy.writes_public_data must be false`)
  }
  if (payload?.policy?.writes_textbook_unit_evidence_ids !== undefined && payload.policy.writes_textbook_unit_evidence_ids !== false) {
    errors.push(`${label} policy.writes_textbook_unit_evidence_ids must be false`)
  }
  if (payload?.policy?.official_standard_text_changed === true) {
    errors.push(`${label} policy.official_standard_text_changed must not be true`)
  }
  return errors
}

function readyReview(candidate, decisionByCode) {
  const decision = decisionByCode.get(candidate.standard_code) || {}
  const units = candidate.unit_evidence || []
  return {
    review_id: candidate.candidate_id,
    review_type: 'same_grade_unit_evidence_review',
    standard_code: candidate.standard_code,
    subject_slug: candidate.subject_slug,
    grade_band: candidate.grade_band,
    grade: candidate.grade || '',
    domain: candidate.domain || '',
    subdomain: candidate.subdomain || '',
    progression_group_id: decision.progression_group_id || '',
    decision: 'ready_for_manual_same_grade_unit_review',
    unit_evidence_count: units.length,
    same_grade_edition_count: decision.same_grade_edition_count || sorted(units.map(unit => unit.edition)).length,
    same_grade_editions: decision.same_grade_editions || sorted(units.map(unit => unit.edition)),
    page_range_statuses: sorted(units.map(unit => unit.page_range_status || 'missing')),
    eligible_alignments: sorted(units.map(unit => unit.eligible_alignment || 'missing')),
    proposed_update_fields: Object.keys(candidate.proposed_update || {}).sort((a, b) => a.localeCompare(b)),
    allowed_future_publication_surface: 'same_grade_standard_textbook_unit_evidence_after_manual_review',
    disallowed_publication_surface: 'cross_grade_edition_placement_note',
    safety: {
      writes_public_data: false,
      writes_textbook_unit_evidence_ids_now: false,
      official_standard_text_changed: false,
      requires_manual_review: true
    }
  }
}

function editionNoteReview(candidate, workItem) {
  return {
    review_id: candidate.candidate_id,
    review_type: 'progression_group_edition_placement_note_review',
    progression_group_id: candidate.progression_group_id,
    subject_slug: candidate.subject_slug,
    topic_subdomains: candidate.topic_subdomains || [],
    standard_codes: candidate.standard_codes || [],
    affected_standard_codes: (candidate.affected_standards || []).map(row => row.standard_code),
    model_decision: candidate.placement_model?.decision || 'missing',
    confidence: candidate.placement_model?.confidence || 'missing',
    placement_grade_bands: candidate.placement_summary?.placement_grade_bands || [],
    edition_count: candidate.placement_summary?.edition_count || 0,
    cross_grade_diagnostic_relations: (candidate.placement_relations || [])
      .filter(row => row.grade_relation !== 'same_grade').length,
    required_decision_owner: workItem?.required_decision_owner || candidate.required_review?.decision_owner || 'curriculum_progression_review',
    allowed_future_publication_surface: 'progression_group_edition_placement_note_after_curriculum_review',
    disallowed_publication_surface: 'same_grade_textbook_unit_evidence_ids',
    safety: {
      writes_public_data: false,
      writes_textbook_unit_evidence_ids_now: false,
      cross_grade_evidence_is_diagnostic_only: true,
      official_standard_text_changed: false,
      requires_manual_review: true
    }
  }
}

function blockedFromEditionModel(candidate, workItem) {
  const uncovered = []
  for (const standard of candidate.affected_standards || []) {
    for (const edition of standard.missing_editions_without_cross_grade_topic || []) {
      uncovered.push(`${standard.standard_code}:${edition}`)
    }
  }
  return {
    review_id: candidate.candidate_id,
    review_type: 'blocked_partial_edition_placement_review',
    progression_group_id: candidate.progression_group_id,
    subject_slug: candidate.subject_slug,
    topic_subdomains: candidate.topic_subdomains || [],
    affected_standard_codes: (candidate.affected_standards || []).map(row => row.standard_code),
    blocking_decision: candidate.placement_model?.decision || 'missing',
    blocked_reason: 'missing_editions_without_cross_grade_topic',
    uncovered_missing_editions: uncovered,
    required_next_step: 'Inspect uncovered missing editions before designing a progression-group edition placement note.',
    source_work_item_id: workItem?.work_item_id || candidate.source_work_item_id || '',
    safety: {
      writes_public_data: false,
      writes_textbook_unit_evidence_ids_now: false,
      official_standard_text_changed: false,
      requires_manual_review: true
    }
  }
}

function blockedFromWorkItem(item) {
  return {
    review_id: item.work_item_id,
    review_type: 'blocked_same_grade_gap_remediation',
    progression_group_id: item.progression_group_id,
    subject_slug: item.subject_slug || 'math',
    topic_subdomains: item.topic_subdomains || [],
    affected_standard_codes: (item.affected_standards || []).map(row => row.standard_code),
    blocking_decision: item.remediation_analysis?.decision || 'same_grade_gap_remediation',
    blocked_reason: (item.remediation_analysis?.reason_codes || []).join('; ') || 'same_grade_gap_requires_more_evidence',
    required_next_step: item.remediation_analysis?.recommended_next_step ||
      'Continue same-grade evidence remediation; do not add broad aliases or publish low-score matches.',
    source_work_item_id: item.work_item_id,
    safety: {
      writes_public_data: false,
      writes_textbook_unit_evidence_ids_now: false,
      official_standard_text_changed: false,
      requires_manual_review: true
    }
  }
}

function collectSummary(readyReviews, noteReviews, blockedReviews, decisionMatrix) {
  const byLayer = {
    same_grade_unit_evidence_review: readyReviews.length,
    progression_group_edition_placement_note_review: noteReviews.length,
    blocked_or_partial_review: blockedReviews.length
  }
  const byGradeBand = {}
  const byBlockedType = {}
  for (const review of readyReviews) countInto(byGradeBand, review.grade_band)
  for (const review of blockedReviews) countInto(byBlockedType, review.review_type)
  const noteAffectedStandards = sorted(noteReviews.flatMap(review => review.affected_standard_codes)).length
  const blockedStandards = sorted(blockedReviews.flatMap(review => review.affected_standard_codes)).length
  return {
    ready_same_grade_standard_reviews: readyReviews.length,
    ready_unit_evidence_objects: readyReviews.reduce((sum, review) => sum + review.unit_evidence_count, 0),
    edition_placement_note_reviews: noteReviews.length,
    edition_placement_note_affected_standards: noteAffectedStandards,
    blocked_reviews: blockedReviews.length,
    blocked_affected_standards: blockedStandards,
    total_current_subject_standards: decisionMatrix.summary?.standards_in_subject || 0,
    not_in_current_unit_candidate_scope: decisionMatrix.summary?.not_in_current_unit_candidate_scope || 0,
    by_publication_layer: byLayer,
    by_ready_grade_band: byGradeBand,
    by_blocked_review_type: byBlockedType
  }
}

function validatePacket(payload, inputs) {
  const errors = []
  const warnings = []
  const readyCodes = new Set(payload.same_grade_unit_reviews.map(review => review.standard_code))
  const noteAffectedCodes = new Set(payload.edition_placement_note_reviews.flatMap(review => review.affected_standard_codes))
  const blockedCodes = new Set(payload.blocked_reviews.flatMap(review => review.affected_standard_codes))

  for (const code of noteAffectedCodes) {
    if (readyCodes.has(code)) errors.push(`${code} appears in both same-grade unit reviews and edition-placement note reviews`)
  }
  for (const code of blockedCodes) {
    if (readyCodes.has(code)) errors.push(`${code} appears in both same-grade unit reviews and blocked reviews`)
  }
  for (const review of payload.same_grade_unit_reviews) {
    if (review.same_grade_edition_count < 2) errors.push(`${review.standard_code} has fewer than two same-grade editions`)
    if (!review.page_range_statuses.length || review.page_range_statuses.includes('toc_page_nonmonotonic')) {
      errors.push(`${review.standard_code} has unsafe page range status`)
    }
    if (!review.proposed_update_fields.includes('textbook_unit_evidence_ids')) {
      errors.push(`${review.standard_code} ready review lacks proposed textbook_unit_evidence_ids field`)
    }
  }
  for (const review of payload.edition_placement_note_reviews) {
    if (review.model_decision !== 'candidate_for_edition_placement_note') {
      errors.push(`${review.progression_group_id} note review must come from candidate_for_edition_placement_note`)
    }
    if (!review.cross_grade_diagnostic_relations) {
      errors.push(`${review.progression_group_id} note review has no cross-grade diagnostic relations`)
    }
  }

  const modelGroups = new Set((inputs.editionModel.candidates || []).map(candidate => candidate.progression_group_id))
  const worklistEditionGroups = new Set((inputs.reviewWorklist.work_items || [])
    .filter(item => item.work_item_type === 'edition_placement_model_review')
    .map(item => item.progression_group_id))
  for (const group of worklistEditionGroups) {
    if (!modelGroups.has(group)) errors.push(`${group} exists in worklist but not edition model candidate`)
  }
  const sameGradeGapItems = (inputs.reviewWorklist.work_items || [])
    .filter(item => item.work_item_type === 'same_grade_gap_remediation')
  for (const item of sameGradeGapItems) {
    if (!payload.blocked_reviews.some(review => review.source_work_item_id === item.work_item_id)) {
      errors.push(`${item.work_item_id} same-grade gap remediation item is missing from blocked reviews`)
    }
  }

  if (payload.policy.writes_public_data !== false) errors.push('Packet policy.writes_public_data must be false')
  if (payload.policy.writes_textbook_unit_evidence_ids !== false) {
    errors.push('Packet policy.writes_textbook_unit_evidence_ids must be false')
  }
  if (payload.policy.separates_same_grade_unit_evidence_from_edition_placement_notes !== true) {
    errors.push('Packet must separate same-grade unit evidence from edition placement notes')
  }
  if (payload.summary.not_in_current_unit_candidate_scope) {
    warnings.push(`${payload.summary.not_in_current_unit_candidate_scope} standards remain outside current unit candidate scope`)
  }
  return { errors, warnings }
}

function buildPayload(args) {
  const errors = []
  const warnings = []
  for (const [label, path] of Object.entries({
    readyCandidate: args.readyCandidate,
    editionModel: args.editionModel,
    reviewWorklist: args.reviewWorklist,
    decisionMatrix: args.decisionMatrix
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const inputs = errors.length
    ? { readyCandidate: {}, editionModel: {}, reviewWorklist: {}, decisionMatrix: {} }
    : {
        readyCandidate: readJson(args.readyCandidate),
        editionModel: readJson(args.editionModel),
        reviewWorklist: readJson(args.reviewWorklist),
        decisionMatrix: readJson(args.decisionMatrix)
      }

  errors.push(...inputPolicyErrors(inputs.readyCandidate, 'readyCandidate'))
  errors.push(...inputPolicyErrors(inputs.editionModel, 'editionModel'))
  errors.push(...inputPolicyErrors(inputs.reviewWorklist, 'reviewWorklist'))
  errors.push(...inputPolicyErrors(inputs.decisionMatrix, 'decisionMatrix'))

  const decisionByCode = standardDecisionMap(inputs.decisionMatrix)
  const workItemByGroup = worklistByGroup(inputs.reviewWorklist)
  const sameGradeUnitReviews = (inputs.readyCandidate.candidates || [])
    .map(candidate => readyReview(candidate, decisionByCode))
    .sort((a, b) => a.standard_code.localeCompare(b.standard_code))

  const noteReviews = []
  const blockedReviews = []
  for (const candidate of inputs.editionModel.candidates || []) {
    const workItem = workItemByGroup.get(candidate.progression_group_id)
    if (candidate.placement_model?.decision === 'candidate_for_edition_placement_note') {
      noteReviews.push(editionNoteReview(candidate, workItem))
    } else {
      blockedReviews.push(blockedFromEditionModel(candidate, workItem))
    }
  }
  for (const item of inputs.reviewWorklist.work_items || []) {
    if (item.work_item_type === 'same_grade_gap_remediation') blockedReviews.push(blockedFromWorkItem(item))
  }
  noteReviews.sort((a, b) => a.progression_group_id.localeCompare(b.progression_group_id))
  blockedReviews.sort((a, b) => {
    const type = a.review_type.localeCompare(b.review_type)
    if (type) return type
    return a.progression_group_id.localeCompare(b.progression_group_id)
  })

  if (args.requireReady && !sameGradeUnitReviews.length) errors.push('requireReady is set but no same-grade unit reviews were produced')
  if (args.requireEditionNotes && !noteReviews.length) errors.push('requireEditionNotes is set but no edition placement note reviews were produced')

  const payload = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    sources: {
      ready_candidate: args.readyCandidate,
      edition_model_candidate: args.editionModel,
      progression_review_worklist: args.reviewWorklist,
      progression_decision_matrix: args.decisionMatrix
    },
    policy: {
      purpose: 'pre_publication_h4g_review_packet',
      publication_candidate: false,
      writes_public_data: false,
      writes_standard_records: false,
      writes_textbook_unit_evidence_ids: false,
      official_standard_text_changed: false,
      separates_same_grade_unit_evidence_from_edition_placement_notes: true,
      cross_grade_evidence_is_diagnostic_only: true,
      requires_manual_review_before_publication: true
    },
    summary: collectSummary(sameGradeUnitReviews, noteReviews, blockedReviews, inputs.decisionMatrix),
    publication_layers: [
      {
        layer_id: 'same_grade_unit_evidence_review',
        review_count: sameGradeUnitReviews.length,
        future_publication_surface: 'standard.textbook_unit_evidence_ids',
        current_status: 'review_only_not_public'
      },
      {
        layer_id: 'progression_group_edition_placement_note_review',
        review_count: noteReviews.length,
        future_publication_surface: 'progression_group_edition_placement_note',
        current_status: 'review_only_not_public'
      },
      {
        layer_id: 'blocked_or_partial_review',
        review_count: blockedReviews.length,
        future_publication_surface: 'none_until_remediated',
        current_status: 'blocked'
      }
    ],
    same_grade_unit_reviews: sameGradeUnitReviews,
    edition_placement_note_reviews: noteReviews,
    blocked_reviews: blockedReviews,
    errors,
    warnings
  }

  const validation = validatePacket(payload, inputs)
  payload.errors.push(...validation.errors)
  payload.warnings.push(...validation.warnings)
  payload.valid = payload.errors.length === 0
  return payload
}

function markdownSummary(payload) {
  const layerRows = payload.publication_layers
    .map(layer => `| ${layer.layer_id} | ${layer.review_count} | ${layer.future_publication_surface} | ${layer.current_status} |`)
    .join('\n') || '| - | 0 | - | - |'
  const readyRows = payload.same_grade_unit_reviews
    .map(review => `| ${review.standard_code} | ${review.grade_band} | ${markdownCell(review.subdomain)} | ${review.same_grade_edition_count} | ${review.unit_evidence_count} | ${markdownCell(review.eligible_alignments.join('；'))} |`)
    .join('\n') || '| - | - | - | 0 | 0 | - |'
  const noteRows = payload.edition_placement_note_reviews
    .map(review => `| ${review.progression_group_id} | ${markdownCell(review.topic_subdomains.join('；'))} | ${review.model_decision} | ${review.confidence} | ${markdownCell(review.placement_grade_bands.join('；'))} | ${review.affected_standard_codes.length} | ${review.cross_grade_diagnostic_relations} |`)
    .join('\n') || '| - | - | - | - | - | 0 | 0 |'
  const blockedRows = payload.blocked_reviews
    .map(review => `| ${review.progression_group_id} | ${review.review_type} | ${markdownCell(review.topic_subdomains.join('；'))} | ${markdownCell(review.affected_standard_codes.join('；'))} | ${markdownCell(review.blocking_decision)} |`)
    .join('\n') || '| - | - | - | - | - |'

  return `# H4G Publication Review Packet

生成时间：${payload.generated_at}

## Summary

| 指标 | 数量 |
| --- | ---: |
| same-grade unit reviews | ${payload.summary.ready_same_grade_standard_reviews} |
| ready unit evidence objects | ${payload.summary.ready_unit_evidence_objects} |
| edition placement note reviews | ${payload.summary.edition_placement_note_reviews} |
| edition placement affected standards | ${payload.summary.edition_placement_note_affected_standards} |
| blocked reviews | ${payload.summary.blocked_reviews} |
| blocked affected standards | ${payload.summary.blocked_affected_standards} |
| not in current unit candidate scope | ${payload.summary.not_in_current_unit_candidate_scope} |

## Publication Layers

| layer | reviews | future surface | current status |
| --- | ---: | --- | --- |
${layerRows}

## Ready Same-Grade Unit Reviews

| standard | grade | subdomain | editions | units | alignments |
| --- | --- | --- | ---: | ---: | --- |
${readyRows}

## Edition Placement Note Reviews

| progression group | topic | decision | confidence | placement grades | affected standards | cross-grade relations |
| --- | --- | --- | --- | --- | ---: | ---: |
${noteRows}

## Blocked Reviews

| progression group | review type | topic | affected standards | blocking decision |
| --- | --- | --- | --- | --- |
${blockedRows}

## Boundaries

- This packet is read-only and is not a public data write.
- Same-grade unit evidence and edition-placement notes are separate publication surfaces.
- Cross-grade textbook units must not be written to same-grade \`textbook_unit_evidence_ids\`.
- \`candidate_for_edition_placement_note\` still requires curriculum progression review.
- Blocked and partial reviews remain excluded from publication until remediated.

## Counts

### Ready Reviews By Grade

| grade | count |
| --- | ---: |
${countRows(payload.summary.by_ready_grade_band)}

### Blocked Reviews By Type

| type | count |
| --- | ---: |
${countRows(payload.summary.by_blocked_review_type)}
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
    errors: payload.errors.length,
    warnings: payload.warnings.length
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
