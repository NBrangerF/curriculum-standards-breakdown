#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { SUBJECTS } from './config.js'

const DEFAULT_PUBLIC_DATA_ROOT = 'public/data'
const DEFAULT_TEXTBOOK_INDEX = 'generated/textbook_evidence/china_textbook_index.json'
const DEFAULT_OUT_DIR = 'generated/grade7_9_grade_level_candidate'

const GRADE_META = {
  七年级: { grade_level: 7, grade_band: 'H4G7', grade_range: '7', progression_role: 'introductory' },
  八年级: { grade_level: 8, grade_band: 'H4G8', grade_range: '8', progression_role: 'developing' },
  九年级: { grade_level: 9, grade_band: 'H4G9', grade_range: '9', progression_role: 'consolidating' }
}
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']
const TARGET_GRADE_SET = new Set(TARGET_GRADE_BANDS)
const CORE_TEXT_FIELDS = ['domain', 'subdomain', 'standard', 'context', 'practice', 'teaching_tip', 'assessment_evidence_type']

const EVIDENCE_ROLE_PRIORITY = {
  direct_textbook: 1,
  discipline_textbook: 2,
  adjacent_discipline_textbook: 3
}

function parseArgs(argv) {
  const args = {
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    textbookIndex: DEFAULT_TEXTBOOK_INDEX,
    outDir: DEFAULT_OUT_DIR,
    clean: true,
    maxEvidence: 6
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--textbook-index') args.textbookIndex = argv[++i]
    else if (item === '--out-dir') args.outDir = argv[++i]
    else if (item === '--max-evidence') args.maxEvidence = Number(argv[++i]) || args.maxEvidence
    else if (item === '--no-clean') args.clean = false
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/build_grade_level_candidate.js \\
  --public-data-root public/data \\
  --textbook-index generated/textbook_evidence/china_textbook_index.json \\
  --out-dir generated/grade7_9_grade_level_candidate

Builds a generated data root that preserves H1/H2/H3 records and transforms
junior H4/7-9 records into H4G7/H4G8/H4G9 records with textbook/progression
evidence fields. This script never writes to public/data.`)
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

function subjectFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(file => file.endsWith('.json')).sort((a, b) => a.localeCompare(b))
}

function countInto(target, value) {
  if (!value) return
  target[value] = (target[value] || 0) + 1
}

function countBy(rows, getKey) {
  const out = {}
  for (const row of rows) countInto(out, getKey(row))
  return out
}

function gradeKey(record) {
  const grade = String(record.grade || '').trim()
  if (grade) return grade
  const gradeBand = String(record.grade_band || '').trim()
  const gradeRange = String(record.grade_range || '').trim()
  if (gradeBand && gradeRange) return `${gradeBand}:${gradeRange}`
  return gradeBand || gradeRange
}

function hashText(value, length = 12) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function signature(record, fields) {
  return fields.map(field => normalizeText(record[field])).join('\n---\n')
}

function isJuniorRecord(record) {
  const grade = String(record.grade || '').trim()
  return record.grade_band === 'H4' || record.grade_range === '7-9' || Object.hasOwn(GRADE_META, grade)
}

function isTargetJuniorRecord(record) {
  return record.stage_band === 'H4' || TARGET_GRADE_SET.has(record.grade_band) || record.source_grade_band === 'H4'
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

function codeForGradeLevel(record, gradeBand) {
  const code = String(record.code || '')
  if (code.includes(`-${gradeBand}-`)) return code
  if (/-H4G[789]-/.test(code)) return code.replace(/-H4G[789]-/, `-${gradeBand}-`)
  if (code.includes('-H4-')) return code.replace('-H4-', `-${gradeBand}-`)
  return `${code || 'STD'}-${gradeBand}`
}

function buildTextbookEvidenceIndex(textbookIndex) {
  const bySubjectGrade = {}
  for (const record of textbookIndex.records || []) {
    for (const mapping of record.standard_subject_mappings || []) {
      const key = `${mapping.subject_slug}:${record.grade_label}`
      bySubjectGrade[key] ||= []
      bySubjectGrade[key].push({
        evidence_id: record.evidence_id,
        evidence_role: mapping.evidence_role,
        textbook_subject: record.textbook_subject,
        edition: record.edition,
        grade_label: record.grade_label,
        volume: record.volume,
        file_name: record.file_name,
        evidence_url: record.evidence_url
      })
    }
  }
  for (const values of Object.values(bySubjectGrade)) {
    values.sort((a, b) => {
      const role = (EVIDENCE_ROLE_PRIORITY[a.evidence_role] || 99) - (EVIDENCE_ROLE_PRIORITY[b.evidence_role] || 99)
      if (role !== 0) return role
      const edition = String(a.edition || '').localeCompare(String(b.edition || ''))
      if (edition !== 0) return edition
      return String(a.file_name || '').localeCompare(String(b.file_name || ''))
    })
  }
  return bySubjectGrade
}

function chooseEvidence(evidenceBySubjectGrade, subjectSlug, gradeLabel, maxEvidence) {
  return (evidenceBySubjectGrade[`${subjectSlug}:${gradeLabel}`] || []).slice(0, maxEvidence)
}

function assignmentFor(record, evidence, gradeLabel) {
  if (!evidence.length) {
    return {
      grade_assignment_type: 'auto_judged_low_confidence',
      grade_assignment_confidence: 0.35,
      progression_basis: 'auto_judgment',
      progression_confidence: 0.35,
      review_status: 'auto_judged',
      rationale: `ChinaTextbook has no mapped textbook file for ${record.subject || record.subject_slug} ${gradeLabel}; kept grade placement by current record grade and autonomous judgment.`
    }
  }

  const roles = new Set(evidence.map(item => item.evidence_role))
  const hasDirect = roles.has('direct_textbook')
  const hasDiscipline = roles.has('discipline_textbook')
  const confidence = hasDirect ? 0.78 : hasDiscipline ? 0.68 : 0.56
  const type = hasDirect || hasDiscipline ? 'textbook_supported' : 'adjacent_textbook_supported'
  return {
    grade_assignment_type: type,
    grade_assignment_confidence: confidence,
    progression_basis: hasDirect || hasDiscipline ? 'textbook_sequence' : 'adjacent_textbook_sequence',
    progression_confidence: Math.max(0.45, confidence - 0.08),
    review_status: confidence >= 0.65 ? 'auto_judged' : 'auto_judged_low_confidence',
    rationale: `ChinaTextbook index provides ${evidence.length} ${gradeLabel} textbook file(s), strongest role: ${evidence[0]?.evidence_role || 'unknown'}.`
  }
}

function progressionGroupId(record) {
  const seed = [
    record.subject_slug,
    record.domain,
    record.subdomain,
    record.standard
  ].join('|')
  return `${record.subject_slug || 'subject'}-${hashText(seed, 14)}`
}

function transformJuniorRecord(record, evidenceBySubjectGrade, maxEvidence) {
  const gradeLabel = String(record.grade || '').trim()
  const meta = GRADE_META[gradeLabel]
  if (!meta) return { record, warning: `${record.code || '(missing code)'} has unsupported junior grade label: ${gradeLabel || '(blank)'}` }

  const evidence = chooseEvidence(evidenceBySubjectGrade, record.subject_slug, gradeLabel, maxEvidence)
  const assignment = assignmentFor(record, evidence, gradeLabel)
  const evidenceIds = evidence.map(item => item.evidence_id)
  const groupId = progressionGroupId(record)
  const nextGrade = meta.grade_level < 9 ? `H4G${meta.grade_level + 1}` : ''
  const previousGrade = meta.grade_level > 7 ? `H4G${meta.grade_level - 1}` : ''

  const out = {
    ...record,
    legacy_code: record.legacy_code || record.code,
    source_grade_band: record.source_grade_band || record.grade_band,
    source_grade_range: record.source_grade_range || record.grade_range,
    id: codeForGradeLevel(record, meta.grade_band),
    code: codeForGradeLevel(record, meta.grade_band),
    stage_band: 'H4',
    grade_band: meta.grade_band,
    grade_range: meta.grade_range,
    grade_level: meta.grade_level,
    grade_assignment_type: assignment.grade_assignment_type,
    grade_assignment_confidence: assignment.grade_assignment_confidence,
    grade_assignment_rationale: assignment.rationale,
    textbook_evidence_ids: evidenceIds,
    textbook_evidence: evidence,
    progression_group_id: groupId,
    progression_role: meta.progression_role,
    progression_basis: assignment.progression_basis,
    progression_confidence: assignment.progression_confidence,
    progression_previous_grade_band: previousGrade,
    progression_next_grade_band: nextGrade,
    review_status: assignment.review_status
  }
  return { record: out }
}

function gradeLabel(record) {
  return record.grade || `${record.grade_range || record.grade_band}年级`
}

function sharedRequirementType(record, granularity) {
  if (!record.textbook_evidence_ids?.length) return 'auto_judged_low_confidence'
  if (granularity === 'textbook_unit_level') return 'shared_requirement_textbook_unit_supported'
  if (record.grade_assignment_type === 'adjacent_textbook_supported') return 'shared_requirement_adjacent_textbook_file_supported'
  return 'shared_requirement_textbook_file_supported'
}

function changedCoreFields(records) {
  return CORE_TEXT_FIELDS.filter(field => new Set(records.map(record => normalizeText(record[field]))).size > 1)
}

function annotateProgressionDistinctiveness(rows) {
  const groups = new Map()
  for (const record of rows) {
    if (!isTargetJuniorRecord(record)) continue
    const key = record.progression_group_id || progressionGroupId(record)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }

  const summary = {
    progression_groups: groups.size,
    complete_triplets: 0,
    exact_identical_triplets: 0,
    differentiated_triplets: 0,
    incomplete_groups: 0,
    shared_requirement_records: 0,
    needs_grade_differentiation_records: 0,
    records_requiring_unit_level_evidence: 0,
    records_with_unit_level_evidence: 0,
    standard_variant_types: {},
    review_statuses: {},
    evidence_granularities: {}
  }

  for (const [groupId, records] of groups.entries()) {
    const presentBands = new Set(records.map(record => record.grade_band).filter(Boolean))
    const completeTriplet = TARGET_GRADE_BANDS.every(band => presentBands.has(band))
    const exactIdentical = completeTriplet && new Set(records.map(record => signature(record, CORE_TEXT_FIELDS))).size === 1
    const changedFields = changedCoreFields(records)
    if (completeTriplet) summary.complete_triplets += 1
    else summary.incomplete_groups += 1
    if (exactIdentical) summary.exact_identical_triplets += 1
    if (completeTriplet && !exactIdentical) summary.differentiated_triplets += 1

    for (const record of records) {
      const granularity = evidenceGranularity(record)
      const hasUnitEvidence = granularity === 'textbook_unit_level'
      const hasEvidence = Array.isArray(record.textbook_evidence_ids) && record.textbook_evidence_ids.length > 0
      const sourceScope = exactIdentical ? 'stage_shared_7_9' : completeTriplet ? 'grade_differentiated_source' : 'partial_grade_source'
      const variantType = exactIdentical ? 'same_source_shared' : completeTriplet ? 'grade_specific_variant' : 'single_or_partial_grade_variant'

      record.standard_text_role = 'source_standard_original'
      record.source_standard_scope = sourceScope
      record.standard_variant_type = variantType
      record.evidence_granularity = granularity
      record.textbook_unit_evidence_ids = record.textbook_unit_evidence_ids || []
      record.progression_distinctiveness = exactIdentical ? 'identical_core_fields' : changedFields.length ? 'core_fields_differ' : 'partial_group'
      record.progression_distinctiveness_fields = changedFields
      record.requires_unit_level_evidence = !hasUnitEvidence

      if (exactIdentical) {
        record.grade_assignment_type = sharedRequirementType(record, granularity)
        record.grade_assignment_confidence = hasEvidence ? Math.min(Number(record.grade_assignment_confidence) || 0.6, hasUnitEvidence ? 0.68 : 0.6) : 0.35
        record.progression_basis = hasEvidence
          ? hasUnitEvidence ? 'shared_standard_textbook_unit_sequence' : 'shared_standard_textbook_file_sequence'
          : 'shared_standard_auto_judgment'
        record.progression_confidence = hasEvidence ? Math.min(Number(record.progression_confidence) || 0.42, hasUnitEvidence ? 0.6 : 0.42) : 0.35
        record.review_status = hasEvidence ? 'needs_grade_differentiation' : 'needs_grade_differentiation_low_confidence'
        record.progression_role = record.progression_role || 'shared_requirement'
        record.grade_specific_focus = `待基于${gradeLabel(record)}教材单元/章节补充本年级专属学习重点。`
        record.progression_delta = 'not_yet_differentiated_from_shared_7_9_source'
        record.progression_review_note = '该记录保留第四学段 7-9 共同课标原文；当前核心文本与同组其他年级一致，不能视为已经完成七八九分化。'
        record.grade_assignment_rationale = hasEvidence
          ? `该记录保留 7-9 共同课标文本；ChinaTextbook 目前提供${gradeLabel(record)}教材文件级证据，但尚未匹配到单元/章节级知识点，因此只作为共享要求的本年级展示。`
          : `该记录保留 7-9 共同课标文本；当前没有映射到${gradeLabel(record)}教材证据，只能低置信度保留为共享要求的本年级展示。`
      } else {
        record.grade_specific_focus = record.grade_specific_focus || ''
        record.progression_delta = changedFields.length ? `source_core_fields_differ:${changedFields.join(',')}` : 'partial_grade_group'
        record.progression_review_note = hasUnitEvidence
          ? '该记录已有单元/章节级教材证据，可用于进一步确认年级化解释。'
          : '该记录核心文本已有年级差异或只覆盖部分年级，但教材证据仍需推进到单元/章节级。'
      }

      if (record.requires_unit_level_evidence) summary.records_requiring_unit_level_evidence += 1
      if (hasUnitEvidence) summary.records_with_unit_level_evidence += 1
      if (variantType === 'same_source_shared') summary.shared_requirement_records += 1
      if (String(record.review_status || '').includes('needs_grade_differentiation')) summary.needs_grade_differentiation_records += 1
      countInto(summary.standard_variant_types, record.standard_variant_type)
      countInto(summary.review_statuses, record.review_status)
      countInto(summary.evidence_granularities, record.evidence_granularity)
    }
  }
  return summary
}

function buildSubjectPayload(subjectSlug, subjectName, rows, sourceRows) {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))].sort((a, b) => a.localeCompare(b))
  return {
    generated_at: new Date().toISOString(),
    data_scope: 'grade7_9_grade_level_candidate_h4g7_h4g8_h4g9',
    target_policy: {
      H1: '1-2',
      H2: '3-4',
      H3: '5-6',
      H4G7: '7',
      H4G8: '8',
      H4G9: '9'
    },
    subject: subjectName,
    subject_slug: subjectSlug,
    record_count: rows.length,
    source_record_count: sourceRows.length,
    columns,
    indexes: {
      domains: countBy(rows, row => row.domain),
      grade_bands: countBy(rows, row => row.grade_band),
      grades: countBy(rows, gradeKey),
      grade_assignment_types: countBy(rows, row => row.grade_assignment_type),
      progression_basis: countBy(rows, row => row.progression_basis),
      standard_variant_types: countBy(rows, row => row.standard_variant_type),
      evidence_granularities: countBy(rows, row => row.evidence_granularity),
      review_statuses: countBy(rows, row => row.review_status),
      ts_primary: countBy(rows, row => (row.ts_primary || [])[0])
    },
    standards: rows
  }
}

function buildDerivedIndexes(candidateRoot) {
  const bySubjectDir = join(candidateRoot, 'by_subject')
  const subjects = []
  const columns = new Set()
  const codeToSubject = {}
  const skillToSubjectSets = {}
  const subjectStats = {}

  for (const file of subjectFiles(bySubjectDir)) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(join(bySubjectDir, file))
    const standards = payload.standards || []
    const domains = countBy(standards, row => row.domain)
    const gradeBands = countBy(standards, row => row.grade_band)
    const grades = countBy(standards, gradeKey)
    const skillCoverage = {}

    for (const record of standards) {
      for (const key of Object.keys(record)) columns.add(key)
      if (record.code) codeToSubject[record.code] = subjectSlug
      for (const ts of [...(record.ts_primary || []), ...(record.ts_secondary || [])]) {
        const main = String(ts).split('.')[0]
        countInto(skillCoverage, main)
        skillToSubjectSets[main] ||= new Set()
        skillToSubjectSets[main].add(subjectSlug)
      }
    }

    subjects.push({
      subject: payload.subject,
      subject_slug: subjectSlug,
      record_count: standards.length,
      file: `by_subject/${file}`,
      domains,
      grade_bands: gradeBands,
      grades
    })

    subjectStats[subjectSlug] = {
      total: standards.length,
      domains: Object.keys(domains).length,
      grade_bands: gradeBands,
      grades,
      skill_coverage: skillCoverage
    }
  }

  const skillToSubjects = Object.fromEntries(
    Object.entries(skillToSubjectSets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([skill, values]) => [skill, [...values].sort()])
  )

  writeJson(join(candidateRoot, 'manifest.json'), {
    generated_at: new Date().toISOString(),
    data_scope: 'grade7_9_grade_level_candidate_h4g7_h4g8_h4g9',
    target_policy: {
      H1: '1-2',
      H2: '3-4',
      H3: '5-6',
      H4G7: '7',
      H4G8: '8',
      H4G9: '9'
    },
    columns: [...columns].sort((a, b) => a.localeCompare(b)),
    subjects
  })
  writeJson(join(candidateRoot, 'indexes/code_to_subject.json'), codeToSubject)
  writeJson(join(candidateRoot, 'indexes/skill_to_subjects.json'), skillToSubjects)
  writeJson(join(candidateRoot, 'indexes/subject_stats.json'), subjectStats)

  return { total: subjects.reduce((sum, subject) => sum + subject.record_count, 0), subjects: subjects.length }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const publicBySubjectDir = join(args.publicDataRoot, 'by_subject')
  if (!existsSync(publicBySubjectDir)) throw new Error(`Missing public by_subject dir: ${publicBySubjectDir}`)
  if (!existsSync(args.textbookIndex)) throw new Error(`Missing textbook index: ${args.textbookIndex}. Run npm run textbooks:index-china first.`)

  const textbookIndex = readJson(args.textbookIndex)
  const evidenceBySubjectGrade = buildTextbookEvidenceIndex(textbookIndex)

  if (args.clean) rmSync(args.outDir, { recursive: true, force: true })
  mkdirSync(join(args.outDir, 'by_subject'), { recursive: true })
  mkdirSync(join(args.outDir, 'indexes'), { recursive: true })

  for (const file of ['subjects_meta.json', 'skills_meta.json', 'glossary.json']) {
    const source = join(args.publicDataRoot, file)
    if (existsSync(source)) writeFileSync(join(args.outDir, file), readFileSync(source))
  }

  const summary = {
    generated_at: new Date().toISOString(),
    data_scope: 'grade7_9_grade_level_candidate_h4g7_h4g8_h4g9',
    public_data_root: args.publicDataRoot,
    textbook_index: args.textbookIndex,
    textbook_source_commit: textbookIndex.source_commit,
    subjects: {},
    totals: {
      source_records: 0,
      preserved_non_junior_records: 0,
      transformed_junior_records: 0,
      candidate_records: 0,
      auto_judged_low_confidence_records: 0,
      records_with_textbook_evidence: 0,
      shared_requirement_records: 0,
      needs_grade_differentiation_records: 0,
      records_requiring_unit_level_evidence: 0,
      records_with_unit_level_evidence: 0
    },
    warnings: []
  }

  for (const subjectSlug of Object.keys(SUBJECTS).sort((a, b) => a.localeCompare(b))) {
    const publicFile = join(publicBySubjectDir, `${subjectSlug}.json`)
    if (!existsSync(publicFile)) throw new Error(`Missing subject file: ${publicFile}`)
    const payload = readJson(publicFile)
    const rows = payload.standards || []
    const outRows = []
    let transformed = 0
    let preserved = 0

    for (const row of rows) {
      if (!isJuniorRecord(row)) {
        outRows.push(row)
        preserved += 1
        continue
      }
      const transformedRow = transformJuniorRecord(row, evidenceBySubjectGrade, args.maxEvidence)
      if (transformedRow.warning) summary.warnings.push(transformedRow.warning)
      const record = transformedRow.record
      outRows.push(record)
      transformed += 1
    }

    const distinctiveness = annotateProgressionDistinctiveness(outRows)
    const finalAssignmentTypes = {}
    const finalGradeBands = {}
    let finalLowConfidence = 0
    let finalWithEvidence = 0
    for (const record of outRows) {
      if (!isTargetJuniorRecord(record)) continue
      countInto(finalAssignmentTypes, record.grade_assignment_type)
      countInto(finalGradeBands, record.grade_band)
      if (record.grade_assignment_type === 'auto_judged_low_confidence' || String(record.review_status || '').includes('low_confidence')) finalLowConfidence += 1
      if (record.textbook_evidence_ids?.length) finalWithEvidence += 1
    }

    summary.subjects[subjectSlug] = {
      subject: payload.subject || SUBJECTS[subjectSlug].subject,
      source_records: rows.length,
      preserved_non_junior_records: preserved,
      transformed_junior_records: transformed,
      candidate_records: outRows.length,
      grade_bands: finalGradeBands,
      grade_assignment_types: finalAssignmentTypes,
      auto_judged_low_confidence_records: finalLowConfidence,
      records_with_textbook_evidence: finalWithEvidence,
      distinctiveness
    }
    summary.totals.source_records += rows.length
    summary.totals.preserved_non_junior_records += preserved
    summary.totals.transformed_junior_records += transformed
    summary.totals.candidate_records += outRows.length
    summary.totals.auto_judged_low_confidence_records += finalLowConfidence
    summary.totals.records_with_textbook_evidence += finalWithEvidence
    summary.totals.shared_requirement_records += distinctiveness.shared_requirement_records
    summary.totals.needs_grade_differentiation_records += distinctiveness.needs_grade_differentiation_records
    summary.totals.records_requiring_unit_level_evidence += distinctiveness.records_requiring_unit_level_evidence
    summary.totals.records_with_unit_level_evidence += distinctiveness.records_with_unit_level_evidence

    writeJson(
      join(args.outDir, 'by_subject', `${subjectSlug}.json`),
      buildSubjectPayload(subjectSlug, payload.subject || SUBJECTS[subjectSlug].subject, outRows, rows)
    )
  }

  const derived = buildDerivedIndexes(args.outDir)
  summary.derived_indexes = derived
  writeJson(join(args.outDir, 'grade_level_candidate_summary.json'), summary)
  console.log(JSON.stringify({
    wrote: args.outDir,
    textbook_source_commit: textbookIndex.source_commit,
    ...summary.totals,
    warnings: summary.warnings.length
  }, null, 2))
}

main()
