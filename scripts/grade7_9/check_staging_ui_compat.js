#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { normalizeManifestSubject, normalizeStandards } from '../../src/data/schema.js'
import { filterStandards, GRADE_BANDS, groupByDomain } from '../../src/data/dataLoader.js'
import { getCompareMode, isValidCompareSelection } from '../../src/data/compareLogic.js'

const DEFAULT_STAGING_ROOT = 'generated/grade7_9_all_curated'
const DEFAULT_SKILLS_META = 'public/data/skills_meta.json'
const EXPECTED_GRADES = ['七年级', '八年级', '九年级']
const EXPECTED_MAIN_SKILLS = ['TS1', 'TS2', 'TS3', 'TS4', 'TS5', 'TS6', 'TS7']
const REQUIRED_DETAIL_FIELDS = [
  'id',
  'code',
  'subject',
  'subject_slug',
  'domain',
  'grade_band',
  'grade_range',
  'grade',
  'standard',
  'context',
  'practice',
  'teaching_tip',
  'assessment_evidence_type'
]

function parseArgs(argv) {
  const args = {
    stagingRoot: DEFAULT_STAGING_ROOT,
    skillsMeta: DEFAULT_SKILLS_META,
    samplePerSubject: 1
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--staging-root') args.stagingRoot = argv[++i]
    else if (item === '--skills-meta') args.skillsMeta = argv[++i]
    else if (item === '--sample-per-subject') args.samplePerSubject = Number(argv[++i] || 1)
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/check_staging_ui_compat.js [--staging-root generated/grade7_9_all_curated]

Checks whether 7-9 staging data can support the current web data layer:
- SubjectPage grade-band filtering and domain grouping
- CompareView selection modes
- SearchResultsPage grade-band and TS filtering
- SkillDetailPage TS reverse lookup
- StandardDetailPage code-to-subject lookup and detail fields`)
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

function sortObjectKeys(value) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
}

function mainSkillCodes(standard) {
  return new Set(
    [...(standard.ts_primary || []), ...(standard.ts_secondary || [])]
      .filter(Boolean)
      .map(code => String(code).split('.')[0])
  )
}

function hasSkill(standard, skillCode) {
  const allCodes = [...(standard.ts_primary || []), ...(standard.ts_secondary || [])]
  return allCodes.some(code => {
    const normalized = String(code)
    return normalized.startsWith(skillCode) || skillCode.startsWith(normalized)
  })
}

function validateSubject(manifestSubject, stagingRoot, codeToSubject, errors) {
  const subject = normalizeManifestSubject(manifestSubject)
  const subjectFile = join(stagingRoot, subject.file || `by_subject/${subject.subject_slug}.json`)
  if (!existsSync(subjectFile)) {
    errors.push(`Subject file missing for ${subject.subject_slug}: ${subjectFile}`)
    return null
  }

  const payload = readJson(subjectFile)
  const standards = normalizeStandards(payload.standards || [])
  const h3Standards = filterStandards(standards, { gradeBands: ['H3'] })
  const byDomain = groupByDomain(h3Standards)
  const domains = countBy(h3Standards, row => row.domain)
  const grades = countBy(h3Standards, row => row.grade)

  if (basename(subject.file || '') !== `${subject.subject_slug}.json`) {
    errors.push(`${subject.subject_slug} manifest file should point to its by_subject JSON`)
  }
  if (payload.subject_slug !== subject.subject_slug) {
    errors.push(`${subject.subject_slug} payload subject_slug mismatch: ${payload.subject_slug}`)
  }
  if (standards.length !== subject.record_count) {
    errors.push(`${subject.subject_slug} record_count mismatch: manifest ${subject.record_count}, file ${standards.length}`)
  }
  if (h3Standards.length !== standards.length) {
    errors.push(`${subject.subject_slug} has non-H3 records in 7-9 staging`)
  }
  if (!subject.grade_bands?.H3) {
    errors.push(`${subject.subject_slug} manifest grade_bands missing H3`)
  }
  for (const grade of EXPECTED_GRADES) {
    if (!grades[grade]) errors.push(`${subject.subject_slug} missing grade split: ${grade}`)
  }
  if (!Object.keys(byDomain).length) {
    errors.push(`${subject.subject_slug} SubjectPage domain grouping would be empty`)
  }

  for (const [domain, count] of Object.entries(subject.domains || {})) {
    if ((domains[domain] || 0) !== count) {
      errors.push(`${subject.subject_slug} manifest domain count mismatch for ${domain}: ${count} != ${domains[domain] || 0}`)
    }
  }

  for (const standard of standards) {
    for (const field of REQUIRED_DETAIL_FIELDS) {
      if (!standard[field]) errors.push(`${standard.code} missing detail display field: ${field}`)
    }
    if (!Array.isArray(standard.ts_primary) || standard.ts_primary.length === 0) {
      errors.push(`${standard.code} missing ts_primary array`)
    }
    if (!Array.isArray(standard.ts_secondary)) {
      errors.push(`${standard.code} ts_secondary must be an array`)
    }
    if (codeToSubject[standard.code] !== subject.subject_slug) {
      errors.push(`${standard.code} code_to_subject mismatch: ${codeToSubject[standard.code]} != ${subject.subject_slug}`)
    }
  }

  return {
    subject: subject.subject,
    subject_slug: subject.subject_slug,
    record_count: standards.length,
    domains: Object.keys(byDomain).length,
    grades: sortObjectKeys(grades),
    standards
  }
}

function checkSkillCoverage(allStandards, skillToSubjects, skillsMeta, errors) {
  const skillChecks = {}
  const metaSkillCodes = new Set((skillsMeta.competencies || []).map(skill => skill.code))
  for (const skill of EXPECTED_MAIN_SKILLS) {
    if (!metaSkillCodes.has(skill)) errors.push(`skills_meta missing competency ${skill}`)
    const matching = filterStandards(allStandards, { gradeBands: ['H3'], skills: [skill] })
    const actualSubjects = [...new Set(matching.map(row => row.subject_slug))].sort()
    const indexedSubjects = [...(skillToSubjects[skill] || [])].sort()
    if (!matching.length) errors.push(`SkillDetail/Search TS filter has no staged results for ${skill}`)
    if (JSON.stringify(actualSubjects) !== JSON.stringify(indexedSubjects)) {
      errors.push(`${skill} skill_to_subjects mismatch: ${JSON.stringify(indexedSubjects)} != ${JSON.stringify(actualSubjects)}`)
    }
    if (matching.some(row => !hasSkill(row, skill))) {
      errors.push(`${skill} filter returned a standard without that TS code`)
    }
    skillChecks[skill] = {
      standards: matching.length,
      subjects: actualSubjects
    }
  }
  return skillChecks
}

function checkCompareAndSearch(subjectChecks, allStandards, errors) {
  const slugs = subjectChecks.map(subject => subject.subject_slug)
  const sampleSubjects = slugs.slice(0, Math.min(3, slugs.length))
  const multiSubjectValid = isValidCompareSelection(sampleSubjects, ['H3'])
  const multiSubjectMode = getCompareMode(sampleSubjects, ['H3'])
  const singleSubjectValid = isValidCompareSelection([slugs[0]], ['H3'])
  const singleSubjectMode = getCompareMode([slugs[0]], ['H3'])

  if (!multiSubjectValid || multiSubjectMode !== 'subjects') {
    errors.push(`CompareView multi-subject mode invalid for ${sampleSubjects.join(',')} + H3`)
  }
  if (!singleSubjectValid || singleSubjectMode !== 'gradeBands') {
    errors.push(`CompareView single-subject mode invalid for ${slugs[0]} + H3`)
  }

  const searchSample = filterStandards(allStandards, {
    subjects: sampleSubjects,
    gradeBands: ['H3'],
    skills: ['TS1']
  })
  if (!searchSample.length) {
    errors.push('SearchResultsPage combined subject + H3 + TS1 filter would be empty')
  }

  return {
    multi_subject: {
      subjects: sampleSubjects,
      grade_bands: ['H3'],
      valid: multiSubjectValid,
      mode: multiSubjectMode
    },
    single_subject: {
      subjects: [slugs[0]],
      grade_bands: ['H3'],
      valid: singleSubjectValid,
      mode: singleSubjectMode
    },
    sample_search_results: searchSample.length
  }
}

function checkDetailSamples(subjectChecks, samplePerSubject, errors) {
  const samples = []
  for (const subject of subjectChecks) {
    const standards = subject.standards.slice(0, Math.max(1, samplePerSubject))
    for (const standard of standards) {
      const gradeBandInfo = GRADE_BANDS[standard.grade_band] || {}
      if (!gradeBandInfo.label) errors.push(`${standard.code} has no GRADE_BANDS label for ${standard.grade_band}`)
      samples.push({
        code: standard.code,
        subject_slug: standard.subject_slug,
        grade_band: standard.grade_band,
        grade_range: standard.grade_range,
        primary_ts: standard.ts_primary
      })
    }
  }
  return samples
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const warnings = []
  const manifestFile = join(args.stagingRoot, 'manifest.json')
  const codeToSubjectFile = join(args.stagingRoot, 'indexes', 'code_to_subject.json')
  const skillToSubjectsFile = join(args.stagingRoot, 'indexes', 'skill_to_subjects.json')

  for (const file of [manifestFile, codeToSubjectFile, skillToSubjectsFile, args.skillsMeta]) {
    if (!existsSync(file)) errors.push(`Required file missing: ${file}`)
  }
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors, warnings }, null, 2))
    process.exit(1)
  }

  const manifest = readJson(manifestFile)
  const codeToSubject = readJson(codeToSubjectFile)
  const skillToSubjects = readJson(skillToSubjectsFile)
  const skillsMeta = readJson(args.skillsMeta)

  const subjectChecks = []
  for (const subject of manifest.subjects || []) {
    const check = validateSubject(subject, args.stagingRoot, codeToSubject, errors)
    if (check) subjectChecks.push(check)
  }

  const allStandards = subjectChecks.flatMap(subject => subject.standards)
  const totalFromSubjects = subjectChecks.reduce((sum, subject) => sum + subject.record_count, 0)
  const manifestTotal = (manifest.subjects || []).reduce((sum, subject) => sum + Number(subject.record_count || 0), 0)
  if (totalFromSubjects !== manifestTotal) {
    errors.push(`Manifest total mismatch: ${manifestTotal} != ${totalFromSubjects}`)
  }

  const gradeBandH3 = GRADE_BANDS.H3 || {}
  if (!String(gradeBandH3.range || '').includes('7-9')) {
    warnings.push(`Frontend GRADE_BANDS.H3.range is "${gradeBandH3.range || ''}", while staging uses grade_range "7-9". Resolve grade-band policy before writing to public/data.`)
  }

  const skillChecks = checkSkillCoverage(allStandards, skillToSubjects, skillsMeta, errors)
  const compareChecks = checkCompareAndSearch(subjectChecks, allStandards, errors)
  const detailSamples = checkDetailSamples(subjectChecks, args.samplePerSubject, errors)

  const result = {
    valid: errors.length === 0,
    staging_root: args.stagingRoot,
    subjects: subjectChecks.length,
    total: allStandards.length,
    ui_paths_checked: [
      'SubjectPage grade-band filter and domain grouping',
      'CompareView subject/grade-band modes',
      'SearchResultsPage grade-band and TS filters',
      'SkillDetailPage TS reverse lookup',
      'StandardDetailPage code lookup and detail fields'
    ],
    grade_band_labels: {
      H3: gradeBandH3
    },
    subject_checks: subjectChecks.map(({ standards, ...summary }) => summary),
    skill_checks: skillChecks,
    compare_checks: compareChecks,
    detail_samples: detailSamples,
    errors,
    warnings
  }

  console.log(JSON.stringify(result, null, 2))
  if (errors.length) process.exit(1)
}

main()
