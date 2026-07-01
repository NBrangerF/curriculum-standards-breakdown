#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  GRADE_BAND,
  GRADE_RANGE,
  REQUIRED_STANDARD_FIELDS,
  SUBJECTS,
  VALID_TS
} from './config.js'
import { GRADE_BANDS } from '../../src/data/dataLoader.js'

const DEFAULT_STAGING_ROOT = 'generated/grade7_9_all_curated'
const DEFAULT_PUBLIC_DATA_ROOT = 'public/data'
const DEFAULT_CURATED_DIR = 'scripts/grade7_9/curated'
const EXPECTED_GRADES = ['七年级', '八年级', '九年级']

function parseArgs(argv) {
  const args = {
    stagingRoot: DEFAULT_STAGING_ROOT,
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    curatedDir: DEFAULT_CURATED_DIR,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--staging-root') args.stagingRoot = argv[++i]
    else if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--curated-dir') args.curatedDir = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_release_readiness.js [--staging-root generated/grade7_9_all_curated] [--strict]

Audits whether 7-9 staging data is complete and whether it is safe to write into public/data.
Without --strict, known release blockers are reported but do not fail the command.
With --strict, release blockers make the command exit non-zero.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function countBy(rows, getKey) {
  const out = {}
  for (const row of rows) {
    const key = getKey(row) || 'missing'
    out[key] = (out[key] || 0) + 1
  }
  return out
}

function sorted(value) {
  return [...value].sort((a, b) => a.localeCompare(b))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
}

function sameJson(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b))
}

function expectedSubjectSlugs() {
  return sorted(Object.keys(SUBJECTS))
}

function subjectFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
}

function collectStaging(args, errors, warnings) {
  const manifestFile = join(args.stagingRoot, 'manifest.json')
  const bySubjectDir = join(args.stagingRoot, 'by_subject')
  const indexesDir = join(args.stagingRoot, 'indexes')
  const requiredFiles = [
    manifestFile,
    join(indexesDir, 'code_to_subject.json'),
    join(indexesDir, 'skill_to_subjects.json'),
    join(indexesDir, 'subject_stats.json')
  ]

  for (const file of requiredFiles) {
    if (!existsSync(file)) errors.push(`Required staging file missing: ${file}`)
  }
  if (!existsSync(bySubjectDir)) errors.push(`Staging by_subject dir missing: ${bySubjectDir}`)
  if (errors.length) return null

  const manifest = readJson(manifestFile)
  const codeToSubject = readJson(join(indexesDir, 'code_to_subject.json'))
  const skillToSubjects = readJson(join(indexesDir, 'skill_to_subjects.json'))
  const subjectStats = readJson(join(indexesDir, 'subject_stats.json'))
  const subjectPayloads = new Map()
  const standards = []

  const manifestSubjects = manifest.subjects || []
  const manifestSlugs = sorted(manifestSubjects.map(subject => subject.subject_slug))
  const expectedSlugs = expectedSubjectSlugs()
  if (!sameJson(manifestSlugs, expectedSlugs)) {
    errors.push(`Staging subjects mismatch: expected ${expectedSlugs.join(', ')}, got ${manifestSlugs.join(', ')}`)
  }

  for (const subject of manifestSubjects) {
    const subjectFile = join(args.stagingRoot, subject.file || `by_subject/${subject.subject_slug}.json`)
    if (!existsSync(subjectFile)) {
      errors.push(`Subject file missing: ${subjectFile}`)
      continue
    }
    const payload = readJson(subjectFile)
    const rows = payload.standards || []
    subjectPayloads.set(subject.subject_slug, payload)
    standards.push(...rows)

    if (payload.subject_slug !== subject.subject_slug) {
      errors.push(`${subject.subject_slug} payload subject_slug mismatch: ${payload.subject_slug}`)
    }
    if (payload.grade_band !== GRADE_BAND) {
      errors.push(`${subject.subject_slug} payload grade_band must be ${GRADE_BAND}`)
    }
    if (payload.grade_range !== GRADE_RANGE) {
      errors.push(`${subject.subject_slug} payload grade_range must be ${GRADE_RANGE}`)
    }
    if (rows.length !== subject.record_count) {
      errors.push(`${subject.subject_slug} manifest record_count mismatch: ${subject.record_count} != ${rows.length}`)
    }
  }

  const seenCodes = new Set()
  const skillToSubjectSets = {}
  const codeToSubjectExpected = {}
  const subjectStatsExpected = {}
  const bySubjectSummaries = {}

  for (const [subjectSlug, payload] of subjectPayloads.entries()) {
    const rows = payload.standards || []
    const gradeCounts = countBy(rows, row => row.grade)
    const gradeBandCounts = countBy(rows, row => row.grade_band)
    const domainCounts = countBy(rows, row => row.domain)
    const skillCoverage = {}

    for (const grade of EXPECTED_GRADES) {
      if (!gradeCounts[grade]) errors.push(`${subjectSlug} missing grade split: ${grade}`)
    }

    for (const row of rows) {
      for (const field of REQUIRED_STANDARD_FIELDS) {
        if (!(field in row)) errors.push(`${row.code || '(missing code)'} missing field ${field}`)
      }
      if (!row.code) errors.push(`${subjectSlug} has record without code`)
      if (row.code && seenCodes.has(row.code)) errors.push(`Duplicate staging code: ${row.code}`)
      if (row.code) seenCodes.add(row.code)
      if (row.code && !row.code.startsWith(`${SUBJECTS[subjectSlug]?.prefix}-${GRADE_BAND}-`)) {
        errors.push(`${row.code} does not use expected ${subjectSlug} ${GRADE_BAND} code prefix`)
      }
      if (row.subject_slug !== subjectSlug) errors.push(`${row.code} subject_slug mismatch: ${row.subject_slug} != ${subjectSlug}`)
      if (row.grade_band !== GRADE_BAND) errors.push(`${row.code} grade_band must be ${GRADE_BAND}`)
      if (row.grade_range !== GRADE_RANGE) errors.push(`${row.code} grade_range must be ${GRADE_RANGE}`)
      if (!EXPECTED_GRADES.includes(row.grade)) errors.push(`${row.code} grade must be one of ${EXPECTED_GRADES.join(', ')}`)
      if (!row.domain) errors.push(`${row.code} domain must be non-empty`)
      if (!row.standard) errors.push(`${row.code} standard must be non-empty`)
      if (!Array.isArray(row.ts_primary) || row.ts_primary.length !== 1) {
        errors.push(`${row.code} ts_primary must contain exactly one TS`)
      }
      if (!Array.isArray(row.ts_secondary)) errors.push(`${row.code} ts_secondary must be an array`)
      if (row.ts_secondary?.length > 2) errors.push(`${row.code} ts_secondary can contain at most 2 TS codes`)
      for (const ts of [...(row.ts_primary || []), ...(row.ts_secondary || [])]) {
        if (!VALID_TS.has(ts)) errors.push(`${row.code} invalid TS code: ${ts}`)
        const main = String(ts).split('.')[0]
        skillCoverage[main] = (skillCoverage[main] || 0) + 1
        if (!skillToSubjectSets[main]) skillToSubjectSets[main] = new Set()
        skillToSubjectSets[main].add(subjectSlug)
      }
      if (!row.ts_rationale) warnings.push(`${row.code} missing ts_rationale`)
      if (row.code) codeToSubjectExpected[row.code] = subjectSlug
    }

    subjectStatsExpected[subjectSlug] = {
      total: rows.length,
      domains: Object.keys(domainCounts).length,
      grade_bands: gradeBandCounts,
      grades: gradeCounts,
      skill_coverage: skillCoverage
    }
    bySubjectSummaries[subjectSlug] = {
      total: rows.length,
      grades: gradeCounts,
      domains: Object.keys(domainCounts).length
    }
  }

  const skillToSubjectsExpected = Object.fromEntries(
    Object.entries(skillToSubjectSets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([skill, values]) => [skill, sorted(values)])
  )

  if (!sameJson(codeToSubject, codeToSubjectExpected)) errors.push('Staging code_to_subject index does not match records')
  if (!sameJson(skillToSubjects, skillToSubjectsExpected)) errors.push('Staging skill_to_subjects index does not match records')
  if (!sameJson(subjectStats, subjectStatsExpected)) errors.push('Staging subject_stats index does not match records')

  const mainSkillCodes = sorted(Object.keys(skillToSubjectsExpected))
  const expectedSkills = sorted([...VALID_TS])
  if (!sameJson(mainSkillCodes, expectedSkills)) {
    errors.push(`Staging TS coverage mismatch: expected ${expectedSkills.join(', ')}, got ${mainSkillCodes.join(', ')}`)
  }

  return {
    manifest,
    standards,
    bySubjectSummaries,
    subjects: manifestSlugs,
    total: standards.length,
    skillToSubjects: skillToSubjectsExpected
  }
}

function auditCuratedSources(args, errors, warnings) {
  const summaries = {}
  const expectedSlugs = expectedSubjectSlugs()
  if (!existsSync(args.curatedDir)) {
    errors.push(`Curated dir missing: ${args.curatedDir}`)
    return summaries
  }

  for (const subjectSlug of expectedSlugs) {
    const file = join(args.curatedDir, `${subjectSlug}_h3_raw.json`)
    if (!existsSync(file)) {
      errors.push(`Missing curated raw file for ${subjectSlug}: ${file}`)
      continue
    }
    const payload = readJson(file)
    const rawItems = payload.raw_items || []
    if (!rawItems.length) errors.push(`${subjectSlug} curated raw_items is empty`)
    if (payload.grade_scope !== GRADE_RANGE) errors.push(`${subjectSlug} curated grade_scope must be ${GRADE_RANGE}`)
    if (!payload.review_status) warnings.push(`${subjectSlug} curated file missing review_status`)

    let missingSourcePages = 0
    let missingTargetGrades = 0
    for (const item of rawItems) {
      if (!Array.isArray(item.source_pages) || item.source_pages.length === 0) missingSourcePages += 1
      if (!Array.isArray(item.target_grades) || item.target_grades.length === 0) missingTargetGrades += 1
    }
    if (missingSourcePages) errors.push(`${subjectSlug} has ${missingSourcePages} raw_items without source_pages`)
    if (missingTargetGrades) errors.push(`${subjectSlug} has ${missingTargetGrades} raw_items without target_grades`)

    summaries[subjectSlug] = {
      raw_items: rawItems.length,
      review_status: payload.review_status || '',
      missing_source_pages: missingSourcePages,
      missing_target_grades: missingTargetGrades
    }
  }
  return summaries
}

function auditPublicIntegration(args, blockers, warnings) {
  const bySubjectDir = join(args.publicDataRoot, 'by_subject')
  const conflicts = {}
  if (!existsSync(bySubjectDir)) {
    blockers.push(`Public by_subject dir missing: ${bySubjectDir}`)
    return { conflicts }
  }

  for (const file of subjectFiles(bySubjectDir)) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(join(bySubjectDir, file))
    const rows = payload.standards || []
    for (const row of rows) {
      if (row.grade_band === GRADE_BAND && row.grade_range !== GRADE_RANGE) {
        const key = `${row.grade_range || 'missing'}`
        conflicts[subjectSlug] ||= {}
        conflicts[subjectSlug][key] = (conflicts[subjectSlug][key] || 0) + 1
      }
    }
  }

  if (Object.keys(conflicts).length) {
    blockers.push(`public/data already contains ${GRADE_BAND} records whose grade_range is not ${GRADE_RANGE}; direct write would mix incompatible grade-band meanings.`)
  }

  const juniorRange = GRADE_BANDS[GRADE_BAND]?.range || ''
  if (!String(juniorRange).includes(GRADE_RANGE)) {
    blockers.push(`src/data/dataLoader.js GRADE_BANDS.${GRADE_BAND}.range is "${juniorRange}", not "${GRADE_RANGE}".`)
  }

  const h3Range = GRADE_BANDS.H3?.range || ''
  if (!String(h3Range).includes('5-6')) {
    blockers.push(`src/data/dataLoader.js GRADE_BANDS.H3.range is "${h3Range}", not "5-6".`)
  }

  if (GRADE_BANDS.H2?.range && !String(GRADE_BANDS.H2.range).includes('3-4')) {
    warnings.push(`GRADE_BANDS.H2.range is "${GRADE_BANDS.H2.range}"; confirm grade-band policy before release.`)
  }

  return {
    conflicts,
    frontend_grade_bands: GRADE_BANDS
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const warnings = []
  const blockers = []
  const staging = collectStaging(args, errors, warnings)
  const curated = auditCuratedSources(args, errors, warnings)
  const publicIntegration = auditPublicIntegration(args, blockers, warnings)

  const completedChecks = [
    'staging schema uses the existing standard fields',
    `staging grade_band is ${GRADE_BAND} and grade_range is ${GRADE_RANGE}`,
    'staging records split into 七年级, 八年级, 九年级',
    'staging indexes are derived from by_subject records',
    'curated raw files retain source_pages and target_grades',
    'TS mapping uses TS1-TS7 with one primary TS per standard'
  ]

  const nextActions = []
  if (blockers.length) {
    nextActions.push('Resolve grade-band policy before writing staging data into public/data/by_subject.')
    nextActions.push(`Update GRADE_BANDS and formal public data so H3 remains 5-6 and ${GRADE_BAND} represents ${GRADE_RANGE}.`)
  }
  if (errors.length) {
    nextActions.push('Fix staging or curated source errors, then rerun grade7_9:build-curated and this audit.')
  }

  const result = {
    ready: errors.length === 0 && blockers.length === 0,
    staging_ready: errors.length === 0,
    direct_public_integration_ready: errors.length === 0 && blockers.length === 0,
    staging_root: args.stagingRoot,
    public_data_root: args.publicDataRoot,
    counts: {
      staging_subjects: staging?.subjects.length || 0,
      staging_standards: staging?.total || 0,
      expected_subjects: expectedSubjectSlugs().length,
      public_junior_band_conflict_subjects: Object.keys(publicIntegration.conflicts || {}).length
    },
    completed_checks: errors.length ? [] : completedChecks,
    staging_subjects: staging?.bySubjectSummaries || {},
    curated_sources: curated,
    public_integration: publicIntegration,
    blockers,
    errors,
    warnings,
    next_actions: nextActions
  }

  console.log(JSON.stringify(result, null, 2))
  if (errors.length || (args.strict && blockers.length)) process.exit(1)
}

main()
