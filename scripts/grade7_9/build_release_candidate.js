#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { DISPLAY_GRADE_POLICY, GRADE_BAND, GRADE_RANGE, SUBJECTS } from './config.js'

const DEFAULT_PUBLIC_DATA_ROOT = 'public/data'
const DEFAULT_STAGING_ROOT = 'generated/grade7_9_all_curated'
const DEFAULT_OUT_DIR = 'generated/grade7_9_release_candidate'
const TARGET_POLICY = DISPLAY_GRADE_POLICY

function parseArgs(argv) {
  const args = {
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    stagingRoot: DEFAULT_STAGING_ROOT,
    outDir: DEFAULT_OUT_DIR,
    clean: true
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--staging-root') args.stagingRoot = argv[++i]
    else if (item === '--out-dir') args.outDir = argv[++i]
    else if (item === '--no-clean') args.clean = false
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/build_release_candidate.js [--public-data-root public/data] [--staging-root generated/grade7_9_all_curated] [--out-dir generated/grade7_9_release_candidate]

Builds a generated release-candidate data root using H1=1-2, H2=3-4, H3=5-6, H4=7-9.
This script never writes to public/data. Existing ${GRADE_BAND} records are replaced by freshly generated 7-9 staging records.`)
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

function copyFileIfExists(from, to) {
  if (!existsSync(from)) return false
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, readFileSync(from))
  return true
}

function subjectFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(file => file.endsWith('.json')).sort((a, b) => a.localeCompare(b))
}

function countInto(target, value) {
  if (!value) return
  target[value] = (target[value] || 0) + 1
}

function gradeKey(record) {
  const grade = String(record.grade || '').trim()
  if (grade) return grade
  const gradeBand = String(record.grade_band || '').trim()
  const gradeRange = String(record.grade_range || '').trim()
  if (gradeBand && gradeRange) return `${gradeBand}:${gradeRange}`
  return gradeBand || gradeRange || 'missing'
}

function isExistingJuniorRecord(record) {
  return record.grade_band === GRADE_BAND || (record.grade_band === 'H3' && record.grade_range === GRADE_RANGE)
}

function countBy(rows, getKey) {
  const out = {}
  for (const row of rows) countInto(out, getKey(row))
  return out
}

function buildSubjectPayload(subjectSlug, subjectName, rows) {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))].sort((a, b) => a.localeCompare(b))
  return {
    generated_at: new Date().toISOString(),
    data_scope: 'grade7_9_release_candidate_restore_h3_add_h4',
    target_policy: TARGET_POLICY,
    subject: subjectName,
    subject_slug: subjectSlug,
    record_count: rows.length,
    columns,
    indexes: {
      domains: countBy(rows, row => row.domain),
      grade_bands: countBy(rows, row => row.grade_band),
      grades: countBy(rows, gradeKey),
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
  let total = 0

  for (const file of subjectFiles(bySubjectDir)) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(join(bySubjectDir, file))
    const standards = payload.standards || []
    const domains = countBy(standards, row => row.domain)
    const gradeBands = countBy(standards, row => row.grade_band)
    const grades = countBy(standards, gradeKey)
    const skillCoverage = {}

    total += standards.length
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
    data_scope: 'grade7_9_release_candidate_restore_h3_add_h4',
    target_policy: TARGET_POLICY,
    columns: [...columns].sort((a, b) => a.localeCompare(b)),
    subjects
  })
  writeJson(join(candidateRoot, 'indexes/code_to_subject.json'), codeToSubject)
  writeJson(join(candidateRoot, 'indexes/skill_to_subjects.json'), skillToSubjects)
  writeJson(join(candidateRoot, 'indexes/subject_stats.json'), subjectStats)

  return { total, subjects: subjects.length, codeToSubject }
}

function validateNoDuplicateCodes(rowsBySubject) {
  const seen = new Map()
  const duplicates = []
  for (const [subjectSlug, rows] of rowsBySubject.entries()) {
    for (const row of rows) {
      if (!row.code) continue
      if (seen.has(row.code)) {
        duplicates.push({ code: row.code, first_subject: seen.get(row.code), duplicate_subject: subjectSlug })
      } else {
        seen.set(row.code, subjectSlug)
      }
    }
  }
  return duplicates
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const publicBySubjectDir = join(args.publicDataRoot, 'by_subject')
  const stagingBySubjectDir = join(args.stagingRoot, 'by_subject')
  if (!existsSync(publicBySubjectDir)) throw new Error(`Missing public by_subject dir: ${publicBySubjectDir}`)
  if (!existsSync(stagingBySubjectDir)) throw new Error(`Missing staging by_subject dir: ${stagingBySubjectDir}`)

  if (args.clean) rmSync(args.outDir, { recursive: true, force: true })
  mkdirSync(join(args.outDir, 'by_subject'), { recursive: true })
  mkdirSync(join(args.outDir, 'replaced_existing_junior_band'), { recursive: true })
  mkdirSync(join(args.outDir, 'indexes'), { recursive: true })

  const copiedMeta = {}
  for (const file of ['subjects_meta.json', 'skills_meta.json', 'glossary.json']) {
    copiedMeta[file] = copyFileIfExists(join(args.publicDataRoot, file), join(args.outDir, file))
  }

  const rowsBySubject = new Map()
  const summarySubjects = {}
  let publicRecords = 0
  let preservedPublicRecords = 0
  let replacedExistingJuniorRecords = 0
  let stagingRecords = 0

  for (const subjectSlug of Object.keys(SUBJECTS).sort((a, b) => a.localeCompare(b))) {
    const publicFile = join(publicBySubjectDir, `${subjectSlug}.json`)
    const stagingFile = join(stagingBySubjectDir, `${subjectSlug}.json`)
    if (!existsSync(publicFile)) throw new Error(`Missing public subject file: ${publicFile}`)
    if (!existsSync(stagingFile)) throw new Error(`Missing staging subject file: ${stagingFile}`)

    const publicPayload = readJson(publicFile)
    const stagingPayload = readJson(stagingFile)
    const publicRows = publicPayload.standards || []
    const stagingRows = stagingPayload.standards || []
    const preservedRows = publicRows.filter(row => !isExistingJuniorRecord(row))
    const replacedRows = publicRows.filter(isExistingJuniorRecord)
    const mergedRows = [...preservedRows, ...stagingRows]

    publicRecords += publicRows.length
    preservedPublicRecords += preservedRows.length
    replacedExistingJuniorRecords += replacedRows.length
    stagingRecords += stagingRows.length
    rowsBySubject.set(subjectSlug, mergedRows)

    const subjectName = publicPayload.subject || stagingPayload.subject || SUBJECTS[subjectSlug].subject
    writeJson(
      join(args.outDir, 'by_subject', `${subjectSlug}.json`),
      buildSubjectPayload(subjectSlug, subjectName, mergedRows)
    )
    writeJson(join(args.outDir, 'replaced_existing_junior_band', `${subjectSlug}.json`), {
      generated_at: new Date().toISOString(),
      data_scope: 'grade7_9_release_candidate_replaced_existing_junior_band',
      target_policy: TARGET_POLICY,
      subject: subjectName,
      subject_slug: subjectSlug,
      record_count: replacedRows.length,
      grade_ranges: countBy(replacedRows, row => `${row.grade_band || 'missing'}:${row.grade_range || 'missing'}`),
      standards: replacedRows
    })

    summarySubjects[subjectSlug] = {
      public_records: publicRows.length,
      preserved_public_records: preservedRows.length,
      replaced_existing_junior_records: replacedRows.length,
      staging_7_9_records: stagingRows.length,
      candidate_records: mergedRows.length,
      candidate_grade_ranges: countBy(mergedRows, row => `${row.grade_band || 'missing'}:${row.grade_range || 'missing'}`),
      replaced_grade_ranges: countBy(replacedRows, row => `${row.grade_band || 'missing'}:${row.grade_range || 'missing'}`)
    }
  }

  const duplicateCodes = validateNoDuplicateCodes(rowsBySubject)
  const derived = buildDerivedIndexes(args.outDir)
  const result = {
    valid: duplicateCodes.length === 0,
    generated_at: new Date().toISOString(),
    mode: 'generated_release_candidate_no_public_writes',
    data_scope: 'grade7_9_release_candidate_restore_h3_add_h4',
    target_policy: TARGET_POLICY,
    public_data_root: args.publicDataRoot,
    staging_root: args.stagingRoot,
    out_dir: args.outDir,
    copied_meta: copiedMeta,
    totals: {
      public_records: publicRecords,
      preserved_public_records: preservedPublicRecords,
      replaced_existing_junior_records: replacedExistingJuniorRecords,
      staging_7_9_records: stagingRecords,
      candidate_records: derived.total,
      candidate_subjects: derived.subjects
    },
    duplicate_codes: duplicateCodes,
    subjects: summarySubjects,
    next_gates: [
      `node scripts/validate-data-indexes.js --data-root ${args.outDir}`,
      `node scripts/grade7_9/audit_grade_band_policy.js --public-data-root ${args.outDir} --staging-root ${args.outDir} --data-only --strict`
    ]
  }

  writeJson(join(args.outDir, 'release_candidate_summary.json'), result)
  console.log(JSON.stringify(stable(result), null, 2))
  if (duplicateCodes.length) process.exit(1)
}

main()
