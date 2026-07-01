#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_TEXTBOOK_INDEX = 'generated/textbook_evidence/china_textbook_index.json'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_CURATED_DIR = 'scripts/grade7_9/curated'
const DEFAULT_OUT = 'generated/textbook_evidence/junior_textbook_progression_audit.json'

const SUBJECTS = {
  arts: '艺术',
  chinese: '语文',
  english: '英语',
  it: '信息科技',
  labor: '劳动',
  math: '数学',
  morality_law: '道德与法治',
  pe: '体育',
  science: '科学'
}

const JUNIOR_GRADE_LABELS = ['七年级', '八年级', '九年级']
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']

function parseArgs(argv) {
  const args = {
    textbookIndex: DEFAULT_TEXTBOOK_INDEX,
    dataRoot: DEFAULT_DATA_ROOT,
    curatedDir: DEFAULT_CURATED_DIR,
    out: DEFAULT_OUT,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--textbook-index') args.textbookIndex = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--curated-dir') args.curatedDir = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_textbook_progression.js \\
  --textbook-index generated/textbook_evidence/china_textbook_index.json \\
  --data-root public/data

Audits whether current junior secondary standards have enough textbook evidence
and data fields to be split from H4/7-9 into H4G7/H4G8/H4G9.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function inc(object, key, amount = 1) {
  const normalized = key || '未识别'
  object[normalized] = (object[normalized] || 0) + amount
}

function zeroGradeCounts() {
  return Object.fromEntries(JUNIOR_GRADE_LABELS.map(grade => [grade, 0]))
}

function subjectFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => join(dir, file))
}

function readPublicJuniorData(dataRoot) {
  const bySubjectDir = join(dataRoot, 'by_subject')
  const subjects = {}
  const blockers = []
  if (!existsSync(bySubjectDir)) {
    blockers.push(`by_subject dir missing: ${bySubjectDir}`)
    return { subjects, blockers }
  }

  for (const file of subjectFiles(bySubjectDir)) {
    const subjectSlug = basename(file, '.json')
    if (!SUBJECTS[subjectSlug]) continue
    const payload = readJson(file)
    const records = (payload.standards || []).filter(record => {
      const grade = String(record.grade || '')
      return record.grade_band === 'H4' || TARGET_GRADE_BANDS.includes(record.grade_band) || JUNIOR_GRADE_LABELS.includes(grade)
    })
    const gradeBands = {}
    const grades = zeroGradeCounts()
    const gradeAssignmentTypes = {}
    const reviewStatuses = {}
    const missingEvidenceFields = {
      grade_assignment_type: 0,
      grade_assignment_confidence: 0,
      progression_group_id: 0,
      progression_basis: 0,
      textbook_evidence_ids: 0
    }
    for (const record of records) {
      inc(gradeBands, record.grade_band)
      if (record.grade in grades) grades[record.grade] += 1
      inc(gradeAssignmentTypes, record.grade_assignment_type)
      inc(reviewStatuses, record.review_status)
      for (const field of Object.keys(missingEvidenceFields)) {
        const value = record[field]
        if (Array.isArray(value) ? value.length === 0 : !value) missingEvidenceFields[field] += 1
      }
    }
    subjects[subjectSlug] = {
      subject: payload.subject || SUBJECTS[subjectSlug],
      subject_slug: subjectSlug,
      junior_records: records.length,
      grade_bands: gradeBands,
      grades,
      uses_unsplit_h4: Boolean(gradeBands.H4),
      uses_target_grade_bands: TARGET_GRADE_BANDS.some(band => gradeBands[band]),
      grade_assignment_types: gradeAssignmentTypes,
      review_statuses: reviewStatuses,
      missing_evidence_fields: missingEvidenceFields
    }
  }
  return { subjects, blockers }
}

function readCuratedStats(curatedDir) {
  const out = {}
  if (!existsSync(curatedDir)) return out
  for (const file of subjectFiles(curatedDir).filter(file => file.endsWith('_h3_raw.json'))) {
    const subjectSlug = basename(file, '_h3_raw.json')
    const payload = readJson(file)
    const rawItems = payload.raw_items || []
    const targetGradePatterns = {}
    let shared789 = 0
    let hasProgressionFields = 0
    for (const item of rawItems) {
      const pattern = Array.isArray(item.target_grades) ? item.target_grades.join(',') : '(missing)'
      inc(targetGradePatterns, pattern)
      if (pattern === '7,8,9') shared789 += 1
      if (item.progression_group_id || item.grade_assignments || item.progression_basis) hasProgressionFields += 1
    }
    out[subjectSlug] = {
      subject: payload.subject || SUBJECTS[subjectSlug] || subjectSlug,
      raw_items: rawItems.length,
      target_grade_patterns: targetGradePatterns,
      shared_7_8_9_raw_items: shared789,
      raw_items_with_progression_fields: hasProgressionFields,
      review_status: payload.review_status || ''
    }
  }
  return out
}

function buildTextbookCoverage(index) {
  const coverage = Object.fromEntries(Object.keys(SUBJECTS).map(subject => [subject, {
    direct: zeroGradeCounts(),
    discipline: zeroGradeCounts(),
    adjacent: zeroGradeCounts(),
    total: zeroGradeCounts(),
    sample_records: []
  }]))

  for (const record of index.records || []) {
    if (!JUNIOR_GRADE_LABELS.includes(record.grade_label)) continue
    for (const mapping of record.standard_subject_mappings || []) {
      const subject = coverage[mapping.subject_slug]
      if (!subject) continue
      subject.total[record.grade_label] += 1
      if (mapping.evidence_role === 'direct_textbook') subject.direct[record.grade_label] += 1
      else if (mapping.evidence_role === 'discipline_textbook') subject.discipline[record.grade_label] += 1
      else subject.adjacent[record.grade_label] += 1
      if (subject.sample_records.length < 6) {
        subject.sample_records.push({
          textbook_subject: record.textbook_subject,
          edition: record.edition,
          grade: record.grade_label,
          volume: record.volume,
          file_name: record.file_name,
          evidence_role: mapping.evidence_role,
          evidence_url: record.evidence_url
        })
      }
    }
  }

  return coverage
}

function allGradesCovered(counts) {
  return JUNIOR_GRADE_LABELS.every(grade => (counts[grade] || 0) > 0)
}

function classifySubject(subjectSlug, textbookCoverage, publicStats, curatedStats) {
  const coverage = textbookCoverage[subjectSlug]
  const publicSubject = publicStats[subjectSlug]
  const curated = curatedStats[subjectSlug]
  const blockers = []
  const warnings = []

  const missingCoverage = !coverage || !allGradesCovered(coverage.total)
  const publicJuniorRecords = publicSubject?.junior_records || 0
  const lowConfidenceRecords = publicSubject?.grade_assignment_types?.auto_judged_low_confidence || 0

  if (missingCoverage && (!publicJuniorRecords || lowConfidenceRecords !== publicJuniorRecords)) {
    blockers.push('missing textbook coverage for at least one junior grade')
  } else if (missingCoverage) {
    warnings.push('no mapped textbook coverage; public records are explicitly marked auto_judged_low_confidence')
  }
  if (coverage && !allGradesCovered(coverage.direct) && !allGradesCovered(coverage.discipline)) {
    warnings.push('coverage is partial or adjacent; use autonomous judgment with low confidence where needed')
  }
  if (publicSubject?.uses_unsplit_h4) {
    blockers.push('public data still uses unsplit H4 records')
  }
  if (publicSubject?.junior_records && publicSubject.missing_evidence_fields.progression_group_id === publicSubject.junior_records) {
    blockers.push('public junior records do not yet carry progression evidence fields')
  }
  if (curated?.shared_7_8_9_raw_items) {
    warnings.push(`${curated.shared_7_8_9_raw_items} curated raw items still target 7,8,9 as shared requirements`)
  }

  let readiness = 'ready_for_grade_level_mapping'
  if (blockers.length) readiness = 'needs_contract_and_mapping_work'
  else if (warnings.length) readiness = 'ready_with_low_confidence_judgment'

  return {
    subject: SUBJECTS[subjectSlug],
    subject_slug: subjectSlug,
    readiness,
    blockers,
    warnings
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const blockers = []
  const warnings = []
  if (!existsSync(args.textbookIndex)) {
    blockers.push(`textbook index missing: ${args.textbookIndex}. Run npm run textbooks:index-china first.`)
  }

  const index = existsSync(args.textbookIndex) ? readJson(args.textbookIndex) : { records: [], summary: {} }
  const publicData = readPublicJuniorData(args.dataRoot)
  blockers.push(...publicData.blockers)
  const curated = readCuratedStats(args.curatedDir)
  const textbookCoverage = buildTextbookCoverage(index)
  const subjectReadiness = Object.fromEntries(
    Object.keys(SUBJECTS).map(subjectSlug => [
      subjectSlug,
      classifySubject(subjectSlug, textbookCoverage, publicData.subjects, curated)
    ])
  )

  for (const item of Object.values(subjectReadiness)) {
    if (item.blockers.length) blockers.push(`${item.subject_slug}: ${item.blockers.join('; ')}`)
    if (item.warnings.length) warnings.push(`${item.subject_slug}: ${item.warnings.join('; ')}`)
  }

  const result = {
    ready_for_public_h4g_split: blockers.length === 0,
    source_repo: index.source_repo || 'https://github.com/TapXWorld/ChinaTextbook',
    source_commit: index.source_commit || null,
    textbook_index: args.textbookIndex,
    data_root: args.dataRoot,
    curated_dir: args.curatedDir,
    target_policy: {
      stage_band: 'H4',
      grade_bands: {
        H4G7: '七年级',
        H4G8: '八年级',
        H4G9: '九年级'
      }
    },
    current_public_junior_data: publicData.subjects,
    curated_raw: curated,
    textbook_coverage: textbookCoverage,
    subject_readiness: subjectReadiness,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    next_actions: [
      'Add grade assignment and progression evidence fields to curated raw items.',
      'Use textbook index entries to assign H4G7/H4G8/H4G9 where textbook grade placement is clear.',
      'Mark unresolved cases as auto_judged_low_confidence instead of blocking user input.',
      'Only replace public H4 records after progression evidence fields and H4G7/H4G8/H4G9 policy gates pass.'
    ]
  }

  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true })
    writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`)
  }
  console.log(JSON.stringify(result, null, 2))
  if (args.strict && blockers.length) process.exit(1)
}

main()
