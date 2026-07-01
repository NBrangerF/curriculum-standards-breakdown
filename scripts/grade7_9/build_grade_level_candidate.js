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

function isJuniorRecord(record) {
  const grade = String(record.grade || '').trim()
  return record.grade_band === 'H4' || record.grade_range === '7-9' || Object.hasOwn(GRADE_META, grade)
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
      records_with_textbook_evidence: 0
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
    let lowConfidence = 0
    let withEvidence = 0
    const assignmentTypes = {}
    const gradeBands = {}

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
      if (record.grade_assignment_type === 'auto_judged_low_confidence') lowConfidence += 1
      if (record.textbook_evidence_ids?.length) withEvidence += 1
      countInto(assignmentTypes, record.grade_assignment_type)
      countInto(gradeBands, record.grade_band)
    }

    summary.subjects[subjectSlug] = {
      subject: payload.subject || SUBJECTS[subjectSlug].subject,
      source_records: rows.length,
      preserved_non_junior_records: preserved,
      transformed_junior_records: transformed,
      candidate_records: outRows.length,
      grade_bands: gradeBands,
      grade_assignment_types: assignmentTypes,
      auto_judged_low_confidence_records: lowConfidence,
      records_with_textbook_evidence: withEvidence
    }
    summary.totals.source_records += rows.length
    summary.totals.preserved_non_junior_records += preserved
    summary.totals.transformed_junior_records += transformed
    summary.totals.candidate_records += outRows.length
    summary.totals.auto_judged_low_confidence_records += lowConfidence
    summary.totals.records_with_textbook_evidence += withEvidence

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
