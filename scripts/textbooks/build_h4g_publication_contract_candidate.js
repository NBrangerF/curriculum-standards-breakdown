#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const BASE_DIR = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean'
const DEFAULT_REVIEW_PACKET = `${BASE_DIR}/h4g_publication_review_packet.json`
const DEFAULT_OUT = `${BASE_DIR}/h4g_publication_contract_candidate.json`
const DEFAULT_SUMMARY_OUT = `${BASE_DIR}/h4g_publication_contract_candidate.md`

const OFFICIAL_STANDARD_FIELDS = new Set([
  'domain',
  'subdomain',
  'standard',
  'context',
  'practice',
  'teaching_tip',
  'assessment_evidence_type'
])

const STANDARD_UNIT_ALLOWED_FIELDS = [
  'textbook_unit_evidence_ids',
  'textbook_unit_evidence',
  'evidence_granularity',
  'grade_assignment_type',
  'grade_assignment_rationale',
  'progression_basis',
  'progression_confidence',
  'progression_delta',
  'progression_review_note',
  'requires_unit_level_evidence',
  'grade_specific_focus',
  'review_status'
]

const NOTE_RECORD_FIELDS = [
  'note_id',
  'progression_group_id',
  'subject_slug',
  'topic_subdomains',
  'standard_codes',
  'affected_standard_codes',
  'placement_grade_bands',
  'edition_count',
  'cross_grade_diagnostic_relations',
  'decision_status',
  'review_status',
  'note_summary',
  'evidence_source',
  'publication_surface',
  'safety'
]

function parseArgs(argv) {
  const args = {
    reviewPacket: DEFAULT_REVIEW_PACKET,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireReadySurface: false,
    requireEditionNoteSurface: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--review-packet') args.reviewPacket = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-ready-surface') args.requireReadySurface = true
    else if (item === '--require-edition-note-surface') args.requireEditionNoteSurface = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_publication_contract_candidate.js \\
  --review-packet generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_review_packet.json \\
  --strict --require-ready-surface --require-edition-note-surface

Builds a read-only data-contract candidate for future H4G publication. It
defines additive publication surfaces but does not write public/data.`)
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

function buildContract() {
  return {
    contract_id: 'h4g_publication_contract_candidate_v1',
    status: 'candidate_not_applied',
    compatibility: {
      public_data_change_type: 'additive_after_review',
      existing_standard_fields_preserved: true,
      official_standard_text_fields_immutable: [...OFFICIAL_STANDARD_FIELDS].sort((a, b) => a.localeCompare(b)),
      current_frontend_change_required_for_candidate: false
    },
    surfaces: [
      {
        surface_id: 'standard_same_grade_unit_evidence',
        grain: 'standard_code',
        target: 'public/data/by_subject/<subject>.json::standards[]',
        current_status: 'candidate_contract_only',
        future_publication_condition: 'manual_review_approves_same_grade_unit_evidence',
        allowed_fields: STANDARD_UNIT_ALLOWED_FIELDS,
        disallowed_fields: [...OFFICIAL_STANDARD_FIELDS].sort((a, b) => a.localeCompare(b)),
        required_gates: [
          'textbooks:h4g-ready-unit-candidates --strict --require-candidates',
          'textbooks:audit-h4g-unit-candidates --strict --require-candidates --require-page-start',
          'textbooks:audit-h4g-unit-consistency --strict --require-candidates --require-page-start --fail-on-nonmonotonic-pages --min-editions-per-standard 2 --min-editions-per-progression-group 2',
          'grade7_9:audit-h4g-distinctiveness --strict',
          'grade7_9:audit-grade-band-policy --strict'
        ],
        publication_effect: [
          'May fill same-grade textbook_unit_evidence_ids after review.',
          'May set evidence_granularity to textbook_unit_level after review.',
          'Must not auto-change official standard text.',
          'Must not auto-change standard_variant_type to grade_specific_variant.'
        ]
      },
      {
        surface_id: 'progression_group_edition_placement_note',
        grain: 'progression_group_id',
        target: 'future additive progression-group note collection',
        candidate_public_path: 'public/data/h4g_progression_notes.json',
        current_status: 'candidate_contract_only',
        future_publication_condition: 'curriculum_progression_review_approves_edition_variable_sequence',
        record_fields: NOTE_RECORD_FIELDS,
        disallowed_fields: [
          'textbook_unit_evidence_ids',
          ...OFFICIAL_STANDARD_FIELDS
        ],
        required_gates: [
          'textbooks:h4g-edition-placement-model --strict --require-candidates',
          'textbooks:h4g-publication-review --strict --require-ready --require-edition-notes',
          'manual curriculum_progression_review approval'
        ],
        publication_effect: [
          'May explain edition-variable grade placement at progression-group level.',
          'Must keep cross-grade textbook units diagnostic only.',
          'Must not write cross-grade units into same-grade standard evidence.'
        ]
      },
      {
        surface_id: 'blocked_review_registry',
        grain: 'review_id',
        target: 'generated/textbook_evidence only',
        current_status: 'blocked',
        future_publication_condition: 'none_until_remediated',
        allowed_fields: [],
        disallowed_fields: [
          'public/data writes',
          'textbook_unit_evidence_ids',
          ...OFFICIAL_STANDARD_FIELDS
        ],
        required_gates: [
          'targeted remediation evidence',
          'repeat publication review packet'
        ],
        publication_effect: [
          'No public publication surface until remediation clears the blocker.'
        ]
      }
    ]
  }
}

function unitEvidenceDraft(review) {
  return {
    draft_id: `h4g_standard_unit_contract_${hashText(review.standard_code)}`,
    surface_id: 'standard_same_grade_unit_evidence',
    grain_key: review.standard_code,
    standard_code: review.standard_code,
    progression_group_id: review.progression_group_id,
    subject_slug: review.subject_slug,
    grade_band: review.grade_band,
    subdomain: review.subdomain,
    candidate_unit_evidence_count: review.unit_evidence_count,
    same_grade_edition_count: review.same_grade_edition_count,
    same_grade_editions: review.same_grade_editions || [],
    allowed_fields: STANDARD_UNIT_ALLOWED_FIELDS,
    proposed_update_fields_from_review_packet: review.proposed_update_fields || [],
    required_manual_review: true,
    publication_readiness: 'candidate_ready_for_manual_review',
    immutable_official_fields: [...OFFICIAL_STANDARD_FIELDS].sort((a, b) => a.localeCompare(b)),
    guardrails: [
      'Do not change official standard text.',
      'Do not mark grade_specific_variant without source-text or progression-review approval.',
      'Only same-grade toc_unit_or_chapter evidence may populate textbook_unit_evidence_ids.'
    ]
  }
}

function noteDraft(review) {
  const topic = (review.topic_subdomains || []).join('、') || '该主题'
  const grades = (review.placement_grade_bands || []).join('、') || '多个年级'
  return {
    note_id: `h4g_edition_note_${hashText(review.progression_group_id)}`,
    surface_id: 'progression_group_edition_placement_note',
    grain_key: review.progression_group_id,
    progression_group_id: review.progression_group_id,
    subject_slug: review.subject_slug,
    topic_subdomains: review.topic_subdomains || [],
    standard_codes: review.standard_codes || [],
    affected_standard_codes: review.affected_standard_codes || [],
    placement_grade_bands: review.placement_grade_bands || [],
    edition_count: review.edition_count,
    cross_grade_diagnostic_relations: review.cross_grade_diagnostic_relations,
    decision_status: review.model_decision,
    review_status: 'candidate_note_needs_curriculum_progression_review',
    note_summary: `候选说明：${topic} 在当前教材版本中存在 ${grades} 的年级投放差异；该说明只解释版本投放差异，不作为同年级单元证据。`,
    evidence_source: review.review_id,
    publication_surface: 'progression_group_edition_placement_note',
    required_manual_review: true,
    safety: {
      cross_grade_evidence_is_diagnostic_only: true,
      writes_textbook_unit_evidence_ids: false,
      official_standard_text_changed: false
    }
  }
}

function blockedDraft(review) {
  return {
    blocked_id: `h4g_blocked_contract_${hashText(review.review_id)}`,
    surface_id: 'blocked_review_registry',
    grain_key: review.review_id,
    review_type: review.review_type,
    progression_group_id: review.progression_group_id,
    subject_slug: review.subject_slug,
    topic_subdomains: review.topic_subdomains || [],
    affected_standard_codes: review.affected_standard_codes || [],
    blocking_decision: review.blocking_decision,
    blocked_reason: review.blocked_reason,
    required_next_step: review.required_next_step,
    publication_surface: 'none_until_remediated',
    safety: {
      writes_public_data: false,
      writes_textbook_unit_evidence_ids: false,
      official_standard_text_changed: false
    }
  }
}

function summarize(unitDrafts, noteDrafts, blockedDrafts, packet) {
  const bySurface = {}
  const byReadyGradeBand = {}
  const byBlockedType = {}
  for (const row of unitDrafts) {
    countInto(bySurface, row.surface_id)
    countInto(byReadyGradeBand, row.grade_band)
  }
  for (const row of noteDrafts) countInto(bySurface, row.surface_id)
  for (const row of blockedDrafts) {
    countInto(bySurface, row.surface_id)
    countInto(byBlockedType, row.review_type)
  }
  return {
    standard_unit_evidence_contracts: unitDrafts.length,
    edition_placement_note_contracts: noteDrafts.length,
    blocked_registry_contracts: blockedDrafts.length,
    candidate_unit_evidence_objects: unitDrafts.reduce((sum, row) => sum + row.candidate_unit_evidence_count, 0),
    edition_note_affected_standards: sorted(noteDrafts.flatMap(row => row.affected_standard_codes)).length,
    blocked_affected_standards: sorted(blockedDrafts.flatMap(row => row.affected_standard_codes)).length,
    not_in_current_unit_candidate_scope: packet.summary?.not_in_current_unit_candidate_scope || 0,
    by_surface: bySurface,
    by_ready_grade_band: byReadyGradeBand,
    by_blocked_review_type: byBlockedType
  }
}

function validatePayload(payload, packet, args) {
  const errors = []
  const warnings = []
  if (packet.valid === false) errors.push('Review packet is marked valid=false')
  if (packet.policy?.writes_public_data !== false) errors.push('Review packet policy.writes_public_data must be false')
  if (packet.policy?.writes_textbook_unit_evidence_ids !== false) {
    errors.push('Review packet policy.writes_textbook_unit_evidence_ids must be false')
  }
  if (packet.policy?.separates_same_grade_unit_evidence_from_edition_placement_notes !== true) {
    errors.push('Review packet must separate same-grade unit evidence from edition placement notes')
  }
  if (args.requireReadySurface && !payload.contract_drafts.standard_unit_evidence.length) {
    errors.push('requireReadySurface is set but no standard unit evidence contracts were produced')
  }
  if (args.requireEditionNoteSurface && !payload.contract_drafts.progression_group_edition_placement_notes.length) {
    errors.push('requireEditionNoteSurface is set but no edition placement note contracts were produced')
  }

  const contract = payload.contract
  const surfaceIds = new Set(contract.surfaces.map(surface => surface.surface_id))
  for (const required of [
    'standard_same_grade_unit_evidence',
    'progression_group_edition_placement_note',
    'blocked_review_registry'
  ]) {
    if (!surfaceIds.has(required)) errors.push(`Missing contract surface ${required}`)
  }

  for (const surface of contract.surfaces) {
    const fields = [...(surface.allowed_fields || []), ...(surface.record_fields || [])]
    for (const field of fields) {
      if (OFFICIAL_STANDARD_FIELDS.has(field)) errors.push(`${surface.surface_id} must not allow official field ${field}`)
    }
  }

  for (const draft of payload.contract_drafts.standard_unit_evidence) {
    const unexpected = (draft.proposed_update_fields_from_review_packet || [])
      .filter(field => !STANDARD_UNIT_ALLOWED_FIELDS.includes(field))
    if (unexpected.length) errors.push(`${draft.standard_code} proposed fields outside standard unit contract: ${unexpected.join(', ')}`)
    if (draft.same_grade_edition_count < 2) errors.push(`${draft.standard_code} has fewer than two same-grade editions`)
  }

  for (const note of payload.contract_drafts.progression_group_edition_placement_notes) {
    if (note.safety?.writes_textbook_unit_evidence_ids !== false) {
      errors.push(`${note.note_id} must not write textbook_unit_evidence_ids`)
    }
    if (note.decision_status !== 'candidate_for_edition_placement_note') {
      errors.push(`${note.note_id} must be based on candidate_for_edition_placement_note`)
    }
  }

  const readyCodes = new Set(payload.contract_drafts.standard_unit_evidence.map(row => row.standard_code))
  const noteAffectedCodes = new Set(payload.contract_drafts.progression_group_edition_placement_notes.flatMap(row => row.affected_standard_codes))
  const blockedCodes = new Set(payload.contract_drafts.blocked_review_registry.flatMap(row => row.affected_standard_codes))
  for (const code of noteAffectedCodes) if (readyCodes.has(code)) errors.push(`${code} overlaps ready standard and edition note draft`)
  for (const code of blockedCodes) if (readyCodes.has(code)) errors.push(`${code} overlaps ready standard and blocked draft`)

  if (payload.summary.not_in_current_unit_candidate_scope) {
    warnings.push(`${payload.summary.not_in_current_unit_candidate_scope} standards remain outside current unit candidate scope`)
  }
  return { errors, warnings }
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.reviewPacket)) errors.push(`Missing review packet: ${args.reviewPacket}`)
  const packet = errors.length ? {} : readJson(args.reviewPacket)
  const contract = buildContract()
  const unitDrafts = (packet.same_grade_unit_reviews || []).map(unitEvidenceDraft)
  const noteDrafts = (packet.edition_placement_note_reviews || []).map(noteDraft)
  const blockedDrafts = (packet.blocked_reviews || []).map(blockedDraft)

  const payload = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    source_review_packet: args.reviewPacket,
    policy: {
      purpose: 'pre_publication_h4g_data_contract_candidate',
      publication_candidate: false,
      writes_public_data: false,
      writes_standard_records: false,
      writes_textbook_unit_evidence_ids: false,
      official_standard_text_changed: false,
      additive_contract_only: true,
      backwards_compatible_when_applied_after_review: true
    },
    contract,
    summary: summarize(unitDrafts, noteDrafts, blockedDrafts, packet),
    contract_drafts: {
      standard_unit_evidence: unitDrafts,
      progression_group_edition_placement_notes: noteDrafts,
      blocked_review_registry: blockedDrafts
    },
    errors,
    warnings: []
  }
  const validation = validatePayload(payload, packet, args)
  payload.errors.push(...validation.errors)
  payload.warnings.push(...validation.warnings)
  payload.valid = payload.errors.length === 0
  return payload
}

function markdownSummary(payload) {
  const surfaceRows = payload.contract.surfaces
    .map(surface => `| ${surface.surface_id} | ${surface.grain} | ${markdownCell(surface.target)} | ${surface.current_status} |`)
    .join('\n')
  const unitRows = payload.contract_drafts.standard_unit_evidence
    .map(row => `| ${row.standard_code} | ${row.grade_band} | ${markdownCell(row.subdomain)} | ${row.same_grade_edition_count} | ${row.candidate_unit_evidence_count} |`)
    .join('\n') || '| - | - | - | 0 | 0 |'
  const noteRows = payload.contract_drafts.progression_group_edition_placement_notes
    .map(row => `| ${row.progression_group_id} | ${markdownCell(row.topic_subdomains.join('；'))} | ${markdownCell(row.placement_grade_bands.join('；'))} | ${row.affected_standard_codes.length} | ${row.cross_grade_diagnostic_relations} |`)
    .join('\n') || '| - | - | - | 0 | 0 |'
  const blockedRows = payload.contract_drafts.blocked_review_registry
    .map(row => `| ${row.progression_group_id} | ${row.review_type} | ${markdownCell(row.affected_standard_codes.join('；'))} | ${markdownCell(row.blocking_decision)} |`)
    .join('\n') || '| - | - | - | - |'

  return `# H4G Publication Contract Candidate

生成时间：${payload.generated_at}

source review packet：\`${payload.source_review_packet}\`

## Summary

| 指标 | 数量 |
| --- | ---: |
| standard unit evidence contracts | ${payload.summary.standard_unit_evidence_contracts} |
| edition placement note contracts | ${payload.summary.edition_placement_note_contracts} |
| blocked registry contracts | ${payload.summary.blocked_registry_contracts} |
| candidate unit evidence objects | ${payload.summary.candidate_unit_evidence_objects} |
| edition note affected standards | ${payload.summary.edition_note_affected_standards} |
| blocked affected standards | ${payload.summary.blocked_affected_standards} |
| not in current unit candidate scope | ${payload.summary.not_in_current_unit_candidate_scope} |

## Surfaces

| surface | grain | target | status |
| --- | --- | --- | --- |
${surfaceRows}

## Standard Unit Evidence Drafts

| standard | grade | subdomain | editions | unit evidence |
| --- | --- | --- | ---: | ---: |
${unitRows}

## Edition Placement Note Drafts

| progression group | topic | placement grades | affected standards | cross-grade relations |
| --- | --- | --- | ---: | ---: |
${noteRows}

## Blocked Registry Drafts

| progression group | review type | affected standards | blocking decision |
| --- | --- | --- | --- |
${blockedRows}

## Boundaries

- This is a data-contract candidate, not a public data migration.
- Applying the standard-level surface would be additive after manual review and must preserve official standard text.
- Applying the edition-placement surface should use a progression-group note collection, not \`textbook_unit_evidence_ids\`.
- Blocked registry rows have no public publication surface until remediated.

## Counts

### By Surface

| surface | count |
| --- | ---: |
${countRows(payload.summary.by_surface)}

### Ready By Grade

| grade | count |
| --- | ---: |
${countRows(payload.summary.by_ready_grade_band)}
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
