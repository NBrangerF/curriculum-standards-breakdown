#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { GRADE_BAND, GRADE_RANGE, SUBJECTS } from './config.js'
import { GRADE_BANDS } from '../../src/data/dataLoader.js'

const DEFAULT_STAGING_ROOT = 'generated/grade7_9_all_curated'
const DEFAULT_PUBLIC_DATA_ROOT = 'public/data'

function parseArgs(argv) {
  const args = {
    stagingRoot: DEFAULT_STAGING_ROOT,
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    out: ''
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--staging-root') args.stagingRoot = argv[++i]
    else if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/plan_public_integration.js [--staging-root generated/grade7_9_all_curated] [--out generated/grade7_9_public_integration_plan.json]

Dry-runs the impact of appending 7-9 staging standards into public/data/by_subject.
This script never writes to public/data.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
}

function countBy(rows, getKey) {
  const out = {}
  for (const row of rows) {
    const key = getKey(row) || 'missing'
    out[key] = (out[key] || 0) + 1
  }
  return out
}

function subjectFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(file => file.endsWith('.json')).sort((a, b) => a.localeCompare(b))
}

function loadSubjectMap(bySubjectDir) {
  const map = new Map()
  for (const file of subjectFiles(bySubjectDir)) {
    const slug = file.replace('.json', '')
    const payload = readJson(join(bySubjectDir, file))
    map.set(slug, payload)
  }
  return map
}

function collectCodes(subjectMap) {
  const codes = new Map()
  for (const [subjectSlug, payload] of subjectMap.entries()) {
    for (const standard of payload.standards || []) {
      if (!standard.code) continue
      codes.set(standard.code, subjectSlug)
    }
  }
  return codes
}

function gradeRangeSummary(rows) {
  return countBy(rows, row => `${row.grade_band || 'missing'}:${row.grade_range || 'missing'}`)
}

function impactedDocs() {
  return [
    'README.md',
    'docs/RESOURCE_ARCHITECTURE.md',
    'docs/CURRICULUM_STANDARD_DECOMPOSITION_METHOD.md',
    'docs/CURRICULUM_STANDARD_BREAKDOWN_METHOD_CURRENT.md',
    'docs/JUNIOR_SECONDARY_RELEASE_READINESS.md'
  ]
}

function buildPlan(args) {
  const publicBySubjectDir = join(args.publicDataRoot, 'by_subject')
  const stagingBySubjectDir = join(args.stagingRoot, 'by_subject')
  const publicSubjects = loadSubjectMap(publicBySubjectDir)
  const stagingSubjects = loadSubjectMap(stagingBySubjectDir)
  const expectedSubjects = Object.keys(SUBJECTS).sort((a, b) => a.localeCompare(b))
  const publicCodes = collectCodes(publicSubjects)
  const stagingCodes = collectCodes(stagingSubjects)
  const duplicateCodes = []
  for (const [code, subjectSlug] of stagingCodes.entries()) {
    if (publicCodes.has(code)) {
      duplicateCodes.push({
        code,
        public_subject: publicCodes.get(code),
        staging_subject: subjectSlug
      })
    }
  }

  const subjects = {}
  let publicTotal = 0
  let stagingTotal = 0
  let publicJuniorConflictTotal = 0
  let postAppendJuniorMixedSubjectCount = 0

  for (const subjectSlug of expectedSubjects) {
    const publicPayload = publicSubjects.get(subjectSlug)
    const stagingPayload = stagingSubjects.get(subjectSlug)
    const publicRows = publicPayload?.standards || []
    const stagingRows = stagingPayload?.standards || []
    const appendedRows = [...publicRows, ...stagingRows]
    const publicJuniorConflicts = publicRows.filter(row => row.grade_band === GRADE_BAND && row.grade_range !== GRADE_RANGE)
    const postAppendJuniorRanges = [...new Set(appendedRows.filter(row => row.grade_band === GRADE_BAND).map(row => row.grade_range || 'missing'))].sort()

    publicTotal += publicRows.length
    stagingTotal += stagingRows.length
    publicJuniorConflictTotal += publicJuniorConflicts.length
    if (postAppendJuniorRanges.length > 1) postAppendJuniorMixedSubjectCount += 1

    subjects[subjectSlug] = {
      public_records: publicRows.length,
      staging_7_9_records: stagingRows.length,
      append_total: appendedRows.length,
      public_grade_ranges: gradeRangeSummary(publicRows),
      staging_grade_ranges: gradeRangeSummary(stagingRows),
      post_append_grade_ranges: gradeRangeSummary(appendedRows),
      public_junior_band_non_7_9_records: publicJuniorConflicts.length,
      public_junior_band_non_7_9_ranges: countBy(publicJuniorConflicts, row => row.grade_range),
      post_append_junior_band_ranges: postAppendJuniorRanges,
      post_append_junior_band_is_mixed: postAppendJuniorRanges.length > 1
    }
  }

  const appendAsIsReady = duplicateCodes.length === 0 && publicJuniorConflictTotal === 0 && String(GRADE_BANDS[GRADE_BAND]?.range || '').includes(GRADE_RANGE)
  const filesToUpdate = [
    ...expectedSubjects.map(subjectSlug => `public/data/by_subject/${subjectSlug}.json`),
    'public/data/manifest.json',
    'public/data/indexes/code_to_subject.json',
    'public/data/indexes/skill_to_subjects.json',
    'public/data/indexes/subject_stats.json',
    'src/data/dataLoader.js',
    'src/data/schema.js',
    ...impactedDocs()
  ]

  return {
    generated_at: new Date().toISOString(),
    mode: 'dry_run_no_public_writes',
    staging_root: args.stagingRoot,
    public_data_root: args.publicDataRoot,
    objective_policy: {
      target_junior_grade_band: GRADE_BAND,
      target_junior_grade_range: GRADE_RANGE,
      current_frontend_h3_range: GRADE_BANDS.H3?.range || '',
      current_frontend_junior_range: GRADE_BANDS[GRADE_BAND]?.range || ''
    },
    append_as_is: {
      ready: appendAsIsReady,
      public_records: publicTotal,
      staging_records_to_append: stagingTotal,
      projected_total: publicTotal + stagingTotal,
      duplicate_code_count: duplicateCodes.length,
      public_junior_band_non_7_9_records: publicJuniorConflictTotal,
      post_append_junior_band_mixed_subjects: postAppendJuniorMixedSubjectCount,
      would_preserve_existing_public_records: true,
      would_mix_junior_band_meanings: publicJuniorConflictTotal > 0,
      note: `Appending as-is is only safe before H4 has already been written. If public/data already contains H4 records, use grade7_9:build-release-candidate to replace H4 instead of duplicating it.`
    },
    duplicate_codes: duplicateCodes,
    subjects,
    required_policy_decisions: [
      'Keep original H3 records for 5-6 and arts 6-7 in public/data.',
      'Represent 7-9 with H4 instead of H3.',
      'Use release candidate replacement when public/data already contains H4 records.',
      'Update frontend GRADE_BANDS so visible labels match H1/H2/H3/H4.',
      'Regenerate manifest and indexes after the policy migration and before release.'
    ],
    files_to_update_for_real_integration: filesToUpdate,
    recommended_next_gate: 'npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict'
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const plan = buildPlan(args)
  if (args.out) writeJson(args.out, plan)
  console.log(JSON.stringify(stable(plan), null, 2))
}

main()
