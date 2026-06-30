#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { GRADE_BAND, GRADE_RANGE, JUNIOR_GRADES, gradeLabel } from './config.js'

const DEFAULT_CURATED_DIR = 'scripts/grade7_9/curated'
const DEFAULT_STAGING_ROOT = 'generated/grade7_9_all_curated'

function parseArgs(argv) {
  const args = {
    curatedDir: DEFAULT_CURATED_DIR,
    stagingRoot: DEFAULT_STAGING_ROOT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--curated-dir') args.curatedDir = argv[++i]
    else if (item === '--staging-root') args.stagingRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_grade_split.js [--curated-dir scripts/grade7_9/curated] [--staging-root generated/grade7_9_all_curated] [--out generated/grade7_9_grade_split_audit.json]

Checks that curated raw_items target_grades expand into exactly matching 七/八/九年级 records in staging by_subject files.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function curatedFiles(curatedDir) {
  return readdirSync(curatedDir)
    .filter(file => file.endsWith('_h3_raw.json'))
    .sort()
    .map(file => join(curatedDir, file))
}

function zeroGradeCounts() {
  return Object.fromEntries(JUNIOR_GRADES.map(grade => [String(grade), 0]))
}

function zeroLabelCounts() {
  return Object.fromEntries(JUNIOR_GRADES.map(grade => [gradeLabel(grade), 0]))
}

function normalizeTargetGrades(item) {
  const raw = item.target_grades
  if (!Array.isArray(raw)) return { values: [], errors: ['target_grades must be an array'] }
  const values = raw.map(value => Number(String(value).replace(/[^\d]/g, '')))
  const errors = []
  if (!values.length) errors.push('target_grades must not be empty')
  for (const value of values) {
    if (!JUNIOR_GRADES.includes(value)) errors.push(`invalid target grade: ${value || '(blank)'}`)
  }
  if (new Set(values).size !== values.length) errors.push(`duplicate target grade in [${raw.join(', ')}]`)
  return { values, errors }
}

function countRawTargets(raw, subjectSlug, errors) {
  const counts = zeroGradeCounts()
  const rawItems = Array.isArray(raw.raw_items) ? raw.raw_items : []
  let expectedTotal = 0
  const missingTargetIndexes = []
  const invalidTargetIndexes = []

  rawItems.forEach((item, index) => {
    if (!('target_grades' in item)) {
      missingTargetIndexes.push(index + 1)
      errors.push(`${subjectSlug} raw item ${index + 1} missing target_grades`)
      return
    }
    const target = normalizeTargetGrades(item)
    if (target.errors.length) {
      invalidTargetIndexes.push(index + 1)
      for (const message of target.errors) errors.push(`${subjectSlug} raw item ${index + 1} ${message}`)
      return
    }
    for (const grade of target.values) {
      counts[String(grade)] += 1
      expectedTotal += 1
    }
  })

  return {
    raw_items: rawItems.length,
    expected_expanded_records: expectedTotal,
    target_grade_counts: counts,
    missing_target_grades: missingTargetIndexes.length,
    invalid_target_grades: invalidTargetIndexes.length
  }
}

function countStagingGrades(stagingFile, subjectSlug, errors) {
  if (!existsSync(stagingFile)) {
    errors.push(`${subjectSlug} staging file missing: ${stagingFile}`)
    return {
      actual_expanded_records: 0,
      actual_grade_counts: zeroLabelCounts(),
      invalid_records: 0
    }
  }

  const payload = readJson(stagingFile)
  const standards = Array.isArray(payload.standards) ? payload.standards : []
  const counts = zeroLabelCounts()
  let invalidRecords = 0
  const validLabels = new Set(JUNIOR_GRADES.map(gradeLabel))

  if (payload.grade_band !== GRADE_BAND) errors.push(`${subjectSlug} top-level grade_band must be ${GRADE_BAND}`)
  if (payload.grade_range !== GRADE_RANGE) errors.push(`${subjectSlug} top-level grade_range must be ${GRADE_RANGE}`)

  standards.forEach(record => {
    if (record.grade_band !== GRADE_BAND) {
      invalidRecords += 1
      errors.push(`${record.code || subjectSlug} grade_band must be ${GRADE_BAND}`)
    }
    if (record.grade_range !== GRADE_RANGE) {
      invalidRecords += 1
      errors.push(`${record.code || subjectSlug} grade_range must be ${GRADE_RANGE}`)
    }
    if (!validLabels.has(record.grade)) {
      invalidRecords += 1
      errors.push(`${record.code || subjectSlug} grade must be 七年级/八年级/九年级; got ${record.grade || '(blank)'}`)
      return
    }
    counts[record.grade] += 1
  })

  return {
    actual_expanded_records: standards.length,
    actual_grade_counts: counts,
    invalid_records: invalidRecords
  }
}

function compareCounts(subjectSlug, rawStats, stagingStats, errors) {
  if (rawStats.expected_expanded_records !== stagingStats.actual_expanded_records) {
    errors.push(`${subjectSlug} expanded total mismatch: expected ${rawStats.expected_expanded_records}, actual ${stagingStats.actual_expanded_records}`)
  }

  for (const grade of JUNIOR_GRADES) {
    const expected = rawStats.target_grade_counts[String(grade)]
    const actual = stagingStats.actual_grade_counts[gradeLabel(grade)]
    if (expected !== actual) {
      errors.push(`${subjectSlug} ${gradeLabel(grade)} count mismatch: expected ${expected}, actual ${actual}`)
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  if (!existsSync(args.curatedDir)) throw new Error(`Curated dir not found: ${args.curatedDir}`)
  const bySubjectDir = join(args.stagingRoot, 'by_subject')
  if (!existsSync(bySubjectDir)) throw new Error(`Staging by_subject dir not found: ${bySubjectDir}`)

  const errors = []
  const warnings = []
  const subjects = []
  let totalRawItems = 0
  let totalExpectedExpandedRecords = 0
  let totalActualExpandedRecords = 0

  for (const file of curatedFiles(args.curatedDir)) {
    const subjectSlug = basename(file, '_h3_raw.json')
    const raw = readJson(file)
    const rawStats = countRawTargets(raw, subjectSlug, errors)
    const stagingStats = countStagingGrades(join(bySubjectDir, `${subjectSlug}.json`), subjectSlug, errors)
    compareCounts(subjectSlug, rawStats, stagingStats, errors)

    totalRawItems += rawStats.raw_items
    totalExpectedExpandedRecords += rawStats.expected_expanded_records
    totalActualExpandedRecords += stagingStats.actual_expanded_records

    subjects.push({
      subject: raw.subject || subjectSlug,
      subject_slug: subjectSlug,
      ...rawStats,
      ...stagingStats
    })
  }

  if (!subjects.length) warnings.push(`No curated raw files found in ${args.curatedDir}`)

  const result = {
    valid: errors.length === 0,
    errorCount: errors.length,
    warningCount: warnings.length,
    curated_dir: args.curatedDir,
    staging_root: args.stagingRoot,
    totals: {
      subjects: subjects.length,
      raw_items: totalRawItems,
      expected_expanded_records: totalExpectedExpandedRecords,
      actual_expanded_records: totalActualExpandedRecords
    },
    subjects,
    errors,
    warnings
  }

  if (args.out) writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result, null, 2))
  if (errors.length) process.exit(1)
}

main()
