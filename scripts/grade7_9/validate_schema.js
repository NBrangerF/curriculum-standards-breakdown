#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { GRADE_BAND, GRADE_RANGE, REQUIRED_STANDARD_FIELDS, SUBJECTS, VALID_TS } from './config.js'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) args[key] = true
    else {
      args[key] = value
      i += 1
    }
  }
  return args
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function subjectFiles(dir) {
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => join(dir, file))
}

function countBy(rows, field) {
  const out = {}
  for (const row of rows) {
    const key = row[field] || '未分类'
    out[key] = (out[key] || 0) + 1
  }
  return out
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
}

function sameJson(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b))
}

function buildExpectedIndexes(subjectPayloads) {
  const subjects = []
  const codeToSubject = {}
  const skillToSubjectSets = {}
  const subjectStats = {}
  let total = 0

  for (const [subjectSlug, payload] of [...subjectPayloads.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const standards = payload.standards || []
    const domains = countBy(standards, 'domain')
    const gradeBands = countBy(standards, 'grade_band')
    const grades = countBy(standards, 'grade')
    total += standards.length
    subjects.push({
      subject: payload.subject,
      subject_slug: subjectSlug,
      record_count: standards.length,
      file: `by_subject/${subjectSlug}.json`,
      domains,
      grade_bands: gradeBands,
      grades
    })
    subjectStats[subjectSlug] = {
      total: standards.length,
      domains: Object.keys(domains).length,
      grade_bands: gradeBands,
      grades,
      skill_coverage: {}
    }
    for (const standard of standards) {
      codeToSubject[standard.code] = subjectSlug
      for (const ts of [...(standard.ts_primary || []), ...(standard.ts_secondary || [])]) {
        const main = String(ts).split('.')[0]
        subjectStats[subjectSlug].skill_coverage[main] = (subjectStats[subjectSlug].skill_coverage[main] || 0) + 1
        if (!skillToSubjectSets[main]) skillToSubjectSets[main] = new Set()
        skillToSubjectSets[main].add(subjectSlug)
      }
    }
  }

  const skillToSubjects = Object.fromEntries(
    Object.entries(skillToSubjectSets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([skill, values]) => [skill, [...values].sort()])
  )

  return { subjects, codeToSubject, skillToSubjects, subjectStats, total }
}

function validateRecord(record, subjectSlug, seenCodes, errors, warnings) {
  for (const field of REQUIRED_STANDARD_FIELDS) {
    if (!(field in record)) errors.push(`${record.code || '(missing code)'} missing field ${field}`)
  }
  if (seenCodes.has(record.code)) errors.push(`duplicate code: ${record.code}`)
  seenCodes.add(record.code)
  if (record.subject_slug !== subjectSlug) errors.push(`${record.code} subject_slug mismatch: ${record.subject_slug} != ${subjectSlug}`)
  if (record.grade_band !== GRADE_BAND) errors.push(`${record.code} grade_band must be ${GRADE_BAND}`)
  if (record.grade_range !== GRADE_RANGE) errors.push(`${record.code} grade_range must be ${GRADE_RANGE}`)
  if (!['七年级', '八年级', '九年级', '7年级', '8年级', '9年级'].includes(record.grade)) {
    errors.push(`${record.code} grade must split into 七/八/九年级; got ${record.grade}`)
  }
  if (!record.domain) errors.push(`${record.code} domain must be non-empty`)
  if (!record.standard) errors.push(`${record.code} standard must be non-empty`)
  if (!Array.isArray(record.ts_primary) || record.ts_primary.length !== 1) {
    errors.push(`${record.code} ts_primary must contain exactly one primary TS`)
  }
  if (!Array.isArray(record.ts_secondary)) errors.push(`${record.code} ts_secondary must be an array`)
  if (record.ts_secondary?.length > 2) errors.push(`${record.code} ts_secondary can contain at most 2 TS codes`)
  for (const ts of [...(record.ts_primary || []), ...(record.ts_secondary || [])]) {
    if (!VALID_TS.has(ts)) errors.push(`${record.code} invalid TS code: ${ts}`)
  }
  if (!record.ts_rationale) warnings.push(`${record.code} missing ts_rationale`)
  if (!record.context) warnings.push(`${record.code} missing context`)
  if (!record.assessment_evidence_type) warnings.push(`${record.code} missing assessment_evidence_type`)
}

function validateManifest(manifestFile, expected, errors) {
  if (!manifestFile) return
  if (!existsSync(manifestFile)) {
    errors.push(`manifest file missing: ${manifestFile}`)
    return
  }
  const manifest = readJson(manifestFile)
  const manifestSubjects = Array.isArray(manifest.subjects) ? manifest.subjects : []
  const manifestTotal = manifestSubjects.reduce((sum, subject) => sum + (Number(subject.record_count) || 0), 0)
  if (manifestTotal !== expected.total) {
    errors.push(`manifest total ${manifestTotal} does not match by_subject total ${expected.total}`)
  }
  const expectedBySlug = new Map(expected.subjects.map(subject => [subject.subject_slug, subject]))
  const manifestBySlug = new Map(manifestSubjects.map(subject => [subject.subject_slug, subject]))
  for (const subject of expected.subjects) {
    const actual = manifestBySlug.get(subject.subject_slug)
    if (!actual) {
      errors.push(`manifest missing subject: ${subject.subject_slug}`)
      continue
    }
    for (const field of ['subject', 'subject_slug', 'record_count', 'file']) {
      if (actual[field] !== subject[field]) {
        errors.push(`manifest ${subject.subject_slug} ${field} mismatch: ${JSON.stringify(actual[field])} != ${JSON.stringify(subject[field])}`)
      }
    }
    for (const field of ['domains', 'grade_bands', 'grades']) {
      if (!sameJson(actual[field] || {}, subject[field])) {
        errors.push(`manifest ${subject.subject_slug} ${field} mismatch`)
      }
    }
  }
  for (const subject of manifestSubjects) {
    if (!expectedBySlug.has(subject.subject_slug)) errors.push(`manifest contains extra subject: ${subject.subject_slug}`)
  }
  const missingColumns = REQUIRED_STANDARD_FIELDS.filter(field => !(manifest.columns || []).includes(field))
  if (missingColumns.length) errors.push(`manifest columns missing required fields: ${missingColumns.join(', ')}`)
}

function validateIndexes(indexesDir, expected, errors) {
  if (!indexesDir) return
  const files = {
    codeToSubject: join(indexesDir, 'code_to_subject.json'),
    skillToSubjects: join(indexesDir, 'skill_to_subjects.json'),
    subjectStats: join(indexesDir, 'subject_stats.json')
  }
  for (const [label, path] of Object.entries(files)) {
    if (!existsSync(path)) errors.push(`${label} index missing: ${path}`)
  }
  if (!Object.values(files).every(existsSync)) return

  const codeToSubject = readJson(files.codeToSubject)
  if (!sameJson(codeToSubject, expected.codeToSubject)) {
    errors.push('code_to_subject index does not match by_subject records')
  }
  const skillToSubjects = readJson(files.skillToSubjects)
  if (!sameJson(skillToSubjects, expected.skillToSubjects)) {
    errors.push('skill_to_subjects index does not match by_subject records')
  }
  const subjectStats = readJson(files.subjectStats)
  if (!sameJson(subjectStats, expected.subjectStats)) {
    errors.push('subject_stats index does not match by_subject records')
  }
}

function validateExistingConflict(existingRoot, warnings) {
  if (!existingRoot) return
  const bySubject = join(existingRoot, 'by_subject')
  if (!existsSync(bySubject)) return
  const conflicts = []
  for (const file of subjectFiles(bySubject)) {
    const payload = readJson(file)
    for (const record of payload.standards || []) {
      if (record.grade_band === 'H3' && record.grade_range !== GRADE_RANGE) {
        conflicts.push(`${record.subject_slug}:${record.grade_range}`)
      }
    }
  }
  if (conflicts.length) {
    warnings.push(`Existing data already uses H3 with non-7-9 grade_range (${[...new Set(conflicts)].join(', ')}). Do not overwrite public/data/by_subject until grade-band policy is resolved.`)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args['staging-root']) {
    args['by-subject-dir'] ||= join(args['staging-root'], 'by_subject')
    args['manifest-file'] ||= join(args['staging-root'], 'manifest.json')
    args['indexes-dir'] ||= join(args['staging-root'], 'indexes')
  }
  if (!args['by-subject-dir']) {
    console.log('Usage: node scripts/grade7_9/validate_schema.js --by-subject-dir generated/grade7_9/by_subject [--manifest-file generated/grade7_9/manifest.json --indexes-dir generated/grade7_9/indexes] [--existing-data-root public/data]\n       node scripts/grade7_9/validate_schema.js --staging-root generated/grade7_9 [--existing-data-root public/data]')
    process.exit(1)
  }
  const errors = []
  const warnings = []
  const seenCodes = new Set()
  const subjectPayloads = new Map()
  let total = 0
  for (const file of subjectFiles(args['by-subject-dir'])) {
    const subjectSlug = basename(file, '.json')
    if (!SUBJECTS[subjectSlug]) errors.push(`unknown subject file: ${subjectSlug}`)
    const payload = readJson(file)
    subjectPayloads.set(subjectSlug, payload)
    if (payload.grade_band !== GRADE_BAND) errors.push(`${subjectSlug} top-level grade_band must be ${GRADE_BAND}`)
    for (const record of payload.standards || []) {
      total += 1
      validateRecord(record, subjectSlug, seenCodes, errors, warnings)
    }
  }
  const expected = buildExpectedIndexes(subjectPayloads)
  if (expected.total !== total) errors.push(`internal total mismatch: expected ${expected.total}, counted ${total}`)
  validateManifest(args['manifest-file'], expected, errors)
  validateIndexes(args['indexes-dir'], expected, errors)
  validateExistingConflict(args['existing-data-root'], warnings)
  const result = { valid: errors.length === 0, total, errors, warnings }
  console.log(JSON.stringify(result, null, 2))
  if (errors.length) process.exit(1)
}

main()
