#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_ENGLISH_FILE = 'public/data/by_subject/english.json'
const DEFAULT_SUMMARY_FILE = 'public/data/junior_grade_level_summary.json'
const DEFAULT_OUT = 'generated/grade7_9_english_h4g_language_skill_progression_group_repair.json'
const DEFAULT_SUMMARY_OUT = 'generated/grade7_9_english_h4g_language_skill_progression_group_repair.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']
const CORE_TEXT_FIELDS = ['domain', 'subdomain', 'standard', 'context', 'practice', 'teaching_tip', 'assessment_evidence_type']
const OFFICIAL_TEXT_FIELDS = CORE_TEXT_FIELDS

const SKILL_SLOTS = [
  {
    slot_id: 'oral_listening_viewing',
    target_group_id: 'english-60cc19b838b6d9',
    codes: ['ENG-H4G7-SKILL-001', 'ENG-H4G8-SKILL-006', 'ENG-H4G9-SKILL-011']
  },
  {
    slot_id: 'written_text_comprehension',
    target_group_id: 'english-c9f076d1fda994',
    codes: ['ENG-H4G7-SKILL-002', 'ENG-H4G8-SKILL-007', 'ENG-H4G9-SKILL-012']
  },
  {
    slot_id: 'extracurricular_viewing_reading',
    target_group_id: 'english-53b7a45c654152',
    codes: ['ENG-H4G7-SKILL-003', 'ENG-H4G8-SKILL-008', 'ENG-H4G9-SKILL-013']
  },
  {
    slot_id: 'oral_expression_and_relaying',
    target_group_id: 'english-e103c6354b9142',
    codes: ['ENG-H4G7-SKILL-004', 'ENG-H4G8-SKILL-009', 'ENG-H4G9-SKILL-014']
  },
  {
    slot_id: 'writing_and_integrated_expression',
    target_group_id: 'english-ac74e6b04b059b',
    codes: ['ENG-H4G7-SKILL-005', 'ENG-H4G8-SKILL-010', 'ENG-H4G9-SKILL-015']
  }
]

function parseArgs(argv) {
  const args = {
    englishFile: DEFAULT_ENGLISH_FILE,
    summaryFile: DEFAULT_SUMMARY_FILE,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    write: false,
    updateSummary: true,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--english-file') args.englishFile = argv[++i]
    else if (item === '--summary-file') args.summaryFile = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--write') args.write = true
    else if (item === '--no-summary-update') args.updateSummary = false
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/repair_english_h4g_language_skill_progression_groups.js \\
  --strict [--write]

Repairs the English H4G language-skill progression context by grouping the
official H4G7/H4G8/H4G9 skill rows into five skill-slot triplets. The repair
only changes progression metadata and never edits official standard text.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`)
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function signature(record, fields) {
  return fields.map(field => normalizeText(record[field])).join('\n---\n')
}

function changedCoreFields(records) {
  return CORE_TEXT_FIELDS.filter(field => new Set(records.map(record => normalizeText(record[field]))).size > 1)
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function hasUnitLevelEvidence(record) {
  const evidence = [
    ...(Array.isArray(record.textbook_unit_evidence) ? record.textbook_unit_evidence : []),
    ...(Array.isArray(record.textbook_evidence) ? record.textbook_evidence : [])
  ]
  const hasUnitEvidenceIds = Array.isArray(record.textbook_unit_evidence_ids) && record.textbook_unit_evidence_ids.length > 0
  return evidence.some(item => (
    item.unit_evidence_id ||
    item.unit_title ||
    item.chapter_title ||
    item.section_title ||
    item.page_range ||
    item.page_start ||
    item.matched_keywords?.length
  )) || (record.evidence_granularity === 'textbook_unit_level' && hasUnitEvidenceIds)
}

function evidenceGranularity(record) {
  if (hasUnitLevelEvidence(record)) return 'textbook_unit_level'
  if (!Array.isArray(record.textbook_evidence_ids) || record.textbook_evidence_ids.length === 0) return 'none'
  return 'textbook_file_grade_level'
}

function summarizeEnglishPublicData(payload) {
  const h4gRecords = (payload.standards || []).filter(record => TARGET_GRADE_BANDS.includes(record.grade_band))
  const groups = new Map()
  const stats = {
    complete_triplets: 0,
    differentiated_triplets: 0,
    evidence_granularities: {},
    exact_identical_triplets: 0,
    incomplete_groups: 0,
    needs_grade_differentiation_records: 0,
    progression_groups: 0,
    records_requiring_unit_level_evidence: 0,
    records_with_unit_level_evidence: 0,
    review_statuses: {},
    shared_requirement_records: 0,
    standard_variant_types: {}
  }
  for (const record of h4gRecords) {
    if (!groups.has(record.progression_group_id)) groups.set(record.progression_group_id, [])
    groups.get(record.progression_group_id).push(record)
    if (record.requires_unit_level_evidence) stats.records_requiring_unit_level_evidence += 1
    if (hasUnitLevelEvidence(record)) stats.records_with_unit_level_evidence += 1
    if (String(record.review_status || '').includes('needs_grade_differentiation')) stats.needs_grade_differentiation_records += 1
    if (record.standard_variant_type === 'same_source_shared') stats.shared_requirement_records += 1
    countInto(stats.evidence_granularities, evidenceGranularity(record))
    countInto(stats.review_statuses, record.review_status)
    countInto(stats.standard_variant_types, record.standard_variant_type)
  }
  stats.progression_groups = groups.size
  for (const rows of groups.values()) {
    const presentBands = new Set(rows.map(record => record.grade_band))
    const completeTriplet = TARGET_GRADE_BANDS.every(band => presentBands.has(band))
    const exactIdentical = completeTriplet && new Set(rows.map(record => signature(record, CORE_TEXT_FIELDS))).size === 1
    if (completeTriplet) stats.complete_triplets += 1
    else stats.incomplete_groups += 1
    if (exactIdentical) stats.exact_identical_triplets += 1
    if (completeTriplet && !exactIdentical) stats.differentiated_triplets += 1
  }
  return stats
}

function summarizeEnglishSubject(payload) {
  const h4gRecords = (payload.standards || []).filter(record => TARGET_GRADE_BANDS.includes(record.grade_band))
  const gradeAssignmentTypes = {}
  const gradeBands = {}
  let recordsWithTextbookEvidence = 0
  let autoJudgedLowConfidenceRecords = 0
  for (const record of h4gRecords) {
    countInto(gradeAssignmentTypes, record.grade_assignment_type)
    countInto(gradeBands, record.grade_band)
    if (Array.isArray(record.textbook_evidence_ids) && record.textbook_evidence_ids.length > 0) recordsWithTextbookEvidence += 1
    if (record.grade_assignment_type === 'auto_judged_low_confidence') autoJudgedLowConfidenceRecords += 1
  }
  return {
    auto_judged_low_confidence_records: autoJudgedLowConfidenceRecords,
    candidate_records: payload.record_count,
    distinctiveness: summarizeEnglishPublicData(payload),
    grade_assignment_types: gradeAssignmentTypes,
    grade_bands: gradeBands,
    preserved_non_junior_records: Number(payload.record_count || 0) - h4gRecords.length,
    records_with_textbook_evidence: recordsWithTextbookEvidence,
    source_records: payload.source_record_count,
    subject: payload.subject,
    transformed_junior_records: h4gRecords.length
  }
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function slotTable(slots) {
  return slots.map(slot => (
    `| ${markdownCell(slot.slot_id)} | ${markdownCell(slot.target_group_id)} | ${markdownCell(slot.codes.join(', '))} | ${markdownCell(slot.grade_bands_after.join(', '))} | ${markdownCell(slot.changed_core_fields.join(', '))} |`
  )).join('\n')
}

function markdownReport(payload) {
  return `# English H4G Language Skill Progression Group Repair

Generated at: ${payload.generated_at}

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| dry run | ${payload.dry_run} |
| write requested | ${payload.write_requested} |
| target slots | ${payload.summary.target_slots} |
| target records | ${payload.summary.target_records} |
| records with progression metadata changes | ${payload.summary.records_with_progression_metadata_changes} |
| complete skill triplets after repair | ${payload.summary.complete_skill_triplets_after} |
| singleton skill groups after repair | ${payload.summary.singleton_skill_groups_after} |
| official text changes | ${payload.summary.official_text_changes} |

## Slots

| slot | target group | codes | grade bands after | changed core fields |
| --- | --- | --- | --- | --- |
${slotTable(payload.slots)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function updatePublicSummary(args, englishPayload, generatedAt) {
  if (!args.updateSummary || !existsSync(args.summaryFile)) return { updated: false, reason: 'summary update disabled or file missing' }
  const summary = readJson(args.summaryFile)
  if (!summary.subjects || !summary.subjects.english) return { updated: false, reason: 'summary subjects.english missing' }
  summary.generated_at = generatedAt
  summary.subjects.english = summarizeEnglishSubject(englishPayload)
  if (args.write) writeJson(args.summaryFile, summary)
  return { updated: args.write, reason: args.write ? 'updated' : 'dry_run' }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const generatedAt = new Date().toISOString()
  const errors = []
  const english = readJson(args.englishFile)
  if (english.subject_slug !== 'english') errors.push('english file subject_slug must be english')
  if (!Array.isArray(english.standards)) errors.push('english.standards must be an array')

  const byCode = new Map((english.standards || []).map(record => [record.code, record]))
  const officialBefore = new Map((english.standards || []).map(record => [record.code, signature(record, OFFICIAL_TEXT_FIELDS)]))
  const changes = []
  const slots = []

  for (const slot of SKILL_SLOTS) {
    const rows = slot.codes.map(code => byCode.get(code)).filter(Boolean)
    if (rows.length !== slot.codes.length) {
      errors.push(`${slot.slot_id} expected ${slot.codes.length} rows, found ${rows.length}`)
      continue
    }
    const expectedBands = TARGET_GRADE_BANDS
    const gradeBandsBefore = rows.map(record => record.grade_band)
    const gradeBandsAfter = []
    for (let index = 0; index < rows.length; index += 1) {
      const record = rows[index]
      const expectedBand = expectedBands[index]
      if (record.grade_band !== expectedBand) errors.push(`${record.code} grade_band ${record.grade_band} must be ${expectedBand}`)
      if (record.domain !== '语言技能') errors.push(`${record.code} domain must be 语言技能`)
      if (record.subject_slug !== 'english') errors.push(`${record.code} subject_slug must be english`)
      gradeBandsAfter.push(record.grade_band)
    }

    const changedFields = changedCoreFields(rows)
    if (!changedFields.length) errors.push(`${slot.slot_id} should have grade-specific core field differences`)
    const progressionDelta = `source_core_fields_differ:${changedFields.join(',')}`

    for (const record of rows) {
      const before = {
        progression_delta: record.progression_delta,
        progression_distinctiveness: record.progression_distinctiveness,
        progression_distinctiveness_fields: record.progression_distinctiveness_fields,
        progression_group_id: record.progression_group_id,
        source_standard_scope: record.source_standard_scope,
        standard_variant_type: record.standard_variant_type
      }

      record.progression_group_id = slot.target_group_id
      record.source_standard_scope = 'grade_differentiated_source'
      record.standard_variant_type = 'grade_specific_variant'
      record.progression_distinctiveness = 'core_fields_differ'
      record.progression_distinctiveness_fields = changedFields
      record.progression_delta = progressionDelta
      record.progression_review_note = '该记录来自英语三级语言技能分年级表，已按同一技能槽位重建 H4G7/H4G8/H4G9 进阶组；仍需单元/章节级教材证据继续确认教学落点。'

      const after = {
        progression_delta: record.progression_delta,
        progression_distinctiveness: record.progression_distinctiveness,
        progression_distinctiveness_fields: record.progression_distinctiveness_fields,
        progression_group_id: record.progression_group_id,
        source_standard_scope: record.source_standard_scope,
        standard_variant_type: record.standard_variant_type
      }
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changes.push({
          code: record.code,
          slot_id: slot.slot_id,
          before,
          after
        })
      }
    }

    slots.push({
      slot_id: slot.slot_id,
      target_group_id: slot.target_group_id,
      codes: slot.codes,
      grade_bands_before: gradeBandsBefore,
      grade_bands_after: gradeBandsAfter,
      changed_core_fields: changedFields
    })
  }

  const targetCodes = new Set(SKILL_SLOTS.flatMap(slot => slot.codes))
  const officialTextChanges = []
  for (const record of english.standards || []) {
    const before = officialBefore.get(record.code)
    const after = signature(record, OFFICIAL_TEXT_FIELDS)
    if (before !== after) officialTextChanges.push(record.code)
  }

  const skillRows = (english.standards || []).filter(record => targetCodes.has(record.code))
  const skillGroupsAfter = new Map()
  for (const record of skillRows) {
    if (!skillGroupsAfter.has(record.progression_group_id)) skillGroupsAfter.set(record.progression_group_id, [])
    skillGroupsAfter.get(record.progression_group_id).push(record)
  }
  let completeSkillTripletsAfter = 0
  let singletonSkillGroupsAfter = 0
  for (const [groupId, rows] of skillGroupsAfter.entries()) {
    const codes = rows.map(record => record.code).sort((a, b) => a.localeCompare(b))
    const gradeBands = new Set(rows.map(record => record.grade_band))
    const slot = SKILL_SLOTS.find(item => item.target_group_id === groupId)
    if (slot && JSON.stringify(codes) !== JSON.stringify([...slot.codes].sort((a, b) => a.localeCompare(b)))) {
      errors.push(`${groupId} contains unexpected skill codes after repair: ${codes.join(', ')}`)
    }
    if (TARGET_GRADE_BANDS.every(band => gradeBands.has(band)) && rows.length === 3) completeSkillTripletsAfter += 1
    if (rows.length === 1) singletonSkillGroupsAfter += 1
  }

  const nonSkillRowsUsingTargetGroups = (english.standards || []).filter(record => (
    !targetCodes.has(record.code) &&
    SKILL_SLOTS.some(slot => slot.target_group_id === record.progression_group_id)
  ))
  if (nonSkillRowsUsingTargetGroups.length) {
    errors.push(`target groups include non-skill records: ${nonSkillRowsUsingTargetGroups.map(record => record.code).join(', ')}`)
  }
  if (completeSkillTripletsAfter !== SKILL_SLOTS.length) errors.push(`complete skill triplets after repair ${completeSkillTripletsAfter} must equal ${SKILL_SLOTS.length}`)
  if (singletonSkillGroupsAfter !== 0) errors.push(`singleton skill groups after repair must be 0, found ${singletonSkillGroupsAfter}`)
  if (officialTextChanges.length) errors.push(`official text changed for ${officialTextChanges.join(', ')}`)

  const canWritePublic = args.write && !errors.length
  const publicSummary = updatePublicSummary({ ...args, write: canWritePublic }, english, generatedAt)
  if (canWritePublic) writeJson(args.englishFile, english)

  const payload = {
    valid: errors.length === 0,
    dry_run: !args.write,
    write_requested: args.write,
    generated_at: generatedAt,
    source_english_file: args.englishFile,
    source_summary_file: args.summaryFile,
    writes_public_data: canWritePublic,
    official_text_fields_checked: OFFICIAL_TEXT_FIELDS,
    official_text_changes: officialTextChanges,
    public_summary: publicSummary,
    slots,
    changes,
    summary: {
      target_slots: SKILL_SLOTS.length,
      target_records: targetCodes.size,
      records_with_progression_metadata_changes: changes.length,
      complete_skill_triplets_after: completeSkillTripletsAfter,
      singleton_skill_groups_after: singletonSkillGroupsAfter,
      official_text_changes: officialTextChanges.length
    },
    errors
  }

  writeJson(args.out, payload)
  writeText(args.summaryOut, markdownReport(payload))
  console.log(JSON.stringify(payload.summary, null, 2))

  if (args.strict && !payload.valid) process.exit(1)
}

main()
