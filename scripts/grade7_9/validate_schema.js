#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
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
    .map(file => join(dir, file))
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
  if (!args['by-subject-dir']) {
    console.log('Usage: node scripts/grade7_9/validate_schema.js --by-subject-dir generated/grade7_9/by_subject [--existing-data-root public/data]')
    process.exit(1)
  }
  const errors = []
  const warnings = []
  const seenCodes = new Set()
  let total = 0
  for (const file of subjectFiles(args['by-subject-dir'])) {
    const subjectSlug = file.split('/').pop().replace('.json', '')
    if (!SUBJECTS[subjectSlug]) errors.push(`unknown subject file: ${subjectSlug}`)
    const payload = readJson(file)
    if (payload.grade_band !== GRADE_BAND) errors.push(`${subjectSlug} top-level grade_band must be ${GRADE_BAND}`)
    for (const record of payload.standards || []) {
      total += 1
      validateRecord(record, subjectSlug, seenCodes, errors, warnings)
    }
  }
  validateExistingConflict(args['existing-data-root'], warnings)
  const result = { valid: errors.length === 0, total, errors, warnings }
  console.log(JSON.stringify(result, null, 2))
  if (errors.length) process.exit(1)
}

main()
