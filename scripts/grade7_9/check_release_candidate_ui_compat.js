#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { normalizeManifestSubject, normalizeStandards } from '../../src/data/schema.js'
import { filterStandards, GRADE_BANDS, groupByDomain } from '../../src/data/dataLoader.js'
import { getCompareMode, isValidCompareSelection } from '../../src/data/compareLogic.js'
import { GRADE_RANGE, SUBJECTS, VALID_TS } from './config.js'

const DEFAULT_CANDIDATE_ROOT = 'generated/grade7_9_release_candidate'
const DEFAULT_SKILLS_META = 'public/data/skills_meta.json'
const TARGET_POLICY = {
  H1: '1-2',
  H2: '3-4',
  H3: GRADE_RANGE
}
const JUNIOR_GRADES = ['七年级', '八年级', '九年级']
const CORE_DETAIL_FIELDS = [
  'id',
  'code',
  'subject',
  'subject_slug',
  'domain',
  'grade_band',
  'grade_range',
  'standard'
]
const H3_REQUIRED_DETAIL_FIELDS = [
  ...CORE_DETAIL_FIELDS,
  'context',
  'practice',
  'teaching_tip',
  'assessment_evidence_type'
]

function parseArgs(argv) {
  const args = {
    candidateRoot: DEFAULT_CANDIDATE_ROOT,
    skillsMeta: DEFAULT_SKILLS_META,
    samplePerSubject: 1
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate-root') args.candidateRoot = argv[++i]
    else if (item === '--skills-meta') args.skillsMeta = argv[++i]
    else if (item === '--sample-per-subject') args.samplePerSubject = Number(argv[++i] || 1)
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/check_release_candidate_ui_compat.js [--candidate-root generated/grade7_9_release_candidate]

Checks whether the generated release-candidate data root can support current web data-layer paths:
- SubjectPage grade-band filters and domain grouping
- CompareView subject/grade-band modes
- SearchResultsPage grade-band and TS filters
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

function sameArray(a, b) {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
}

function hasSkill(standard, skillCode) {
  const allCodes = [...(standard.ts_primary || []), ...(standard.ts_secondary || [])]
  return allCodes.some(code => {
    const normalized = String(code)
    return normalized.startsWith(skillCode) || skillCode.startsWith(normalized)
  })
}

function isTargetPolicyRecord(record) {
  return TARGET_POLICY[record.grade_band] === record.grade_range
}

function loadRequiredFiles(args, errors) {
  const files = {
    manifest: join(args.candidateRoot, 'manifest.json'),
    codeToSubject: join(args.candidateRoot, 'indexes', 'code_to_subject.json'),
    skillToSubjects: join(args.candidateRoot, 'indexes', 'skill_to_subjects.json'),
    subjectStats: join(args.candidateRoot, 'indexes', 'subject_stats.json'),
    releaseSummary: join(args.candidateRoot, 'release_candidate_summary.json'),
    skillsMeta: args.skillsMeta
  }
  for (const file of Object.values(files)) {
    if (!existsSync(file)) errors.push(`Required file missing: ${file}`)
  }
  if (errors.length) return null
  return {
    manifest: readJson(files.manifest),
    codeToSubject: readJson(files.codeToSubject),
    skillToSubjects: readJson(files.skillToSubjects),
    subjectStats: readJson(files.subjectStats),
    releaseSummary: readJson(files.releaseSummary),
    skillsMeta: readJson(files.skillsMeta)
  }
}

function validateSubject(manifestSubject, args, codeToSubject, subjectStats, errors, warnings) {
  const subject = normalizeManifestSubject(manifestSubject)
  const subjectFile = join(args.candidateRoot, subject.file || `by_subject/${subject.subject_slug}.json`)
  if (!existsSync(subjectFile)) {
    errors.push(`Subject file missing for ${subject.subject_slug}: ${subjectFile}`)
    return null
  }

  const payload = readJson(subjectFile)
  const standards = normalizeStandards(payload.standards || [])
  const domains = countBy(standards, row => row.domain)
  const gradeBands = countBy(standards, row => row.grade_band)
  const h3Standards = filterStandards(standards, { gradeBands: ['H3'] })
  const h3Grades = countBy(h3Standards, row => row.grade)
  const byDomain = groupByDomain(standards)

  if (basename(subject.file || '') !== `${subject.subject_slug}.json`) {
    errors.push(`${subject.subject_slug} manifest file should point to its by_subject JSON`)
  }
  if (payload.subject_slug !== subject.subject_slug) {
    errors.push(`${subject.subject_slug} payload subject_slug mismatch: ${payload.subject_slug}`)
  }
  if (standards.length !== subject.record_count) {
    errors.push(`${subject.subject_slug} record_count mismatch: manifest ${subject.record_count}, file ${standards.length}`)
  }
  if (standards.some(row => !isTargetPolicyRecord(row))) {
    errors.push(`${subject.subject_slug} has records outside target grade-band policy`)
  }
  if (!h3Standards.length) {
    errors.push(`${subject.subject_slug} has no H3 7-9 standards in release candidate`)
  }
  for (const grade of JUNIOR_GRADES) {
    if (!h3Grades[grade]) errors.push(`${subject.subject_slug} missing H3 grade split: ${grade}`)
  }
  if (!Object.keys(byDomain).length) {
    errors.push(`${subject.subject_slug} SubjectPage domain grouping would be empty`)
  }
  for (const [band, count] of Object.entries(subject.grade_bands || {})) {
    const filtered = filterStandards(standards, { gradeBands: [band] })
    if (filtered.length !== count) {
      errors.push(`${subject.subject_slug} manifest grade_bands ${band} mismatch: ${count} != ${filtered.length}`)
    }
  }
  if (JSON.stringify(sortObjectKeys(subject.domains || {})) !== JSON.stringify(sortObjectKeys(domains))) {
    errors.push(`${subject.subject_slug} manifest domains do not match candidate records`)
  }
  if (JSON.stringify(sortObjectKeys(subjectStats[subject.subject_slug]?.grade_bands || {})) !== JSON.stringify(sortObjectKeys(gradeBands))) {
    errors.push(`${subject.subject_slug} subject_stats grade_bands do not match candidate records`)
  }

  for (const standard of standards) {
    for (const field of CORE_DETAIL_FIELDS) {
      if (!standard[field]) errors.push(`${standard.code} missing detail display field: ${field}`)
    }
    if (standard.grade_band === 'H3') {
      for (const field of H3_REQUIRED_DETAIL_FIELDS) {
        if (!standard[field]) errors.push(`${standard.code} missing H3 detail display field: ${field}`)
      }
      if (!Array.isArray(standard.ts_primary) || standard.ts_primary.length !== 1) {
        errors.push(`${standard.code} H3 record must have exactly one ts_primary`)
      }
      if (!Array.isArray(standard.ts_secondary)) {
        errors.push(`${standard.code} H3 record ts_secondary must be an array`)
      }
      if (standard.ts_secondary?.length > 2) {
        errors.push(`${standard.code} H3 record has more than two secondary TS codes`)
      }
      for (const ts of [...(standard.ts_primary || []), ...(standard.ts_secondary || [])]) {
        if (!VALID_TS.has(ts)) errors.push(`${standard.code} invalid TS code: ${ts}`)
      }
    } else {
      for (const field of H3_REQUIRED_DETAIL_FIELDS) {
        if (!standard[field]) warnings.push(`${standard.code} non-H3 record has empty detail field: ${field}`)
      }
    }
    if (codeToSubject[standard.code] !== subject.subject_slug) {
      errors.push(`${standard.code} code_to_subject mismatch: ${codeToSubject[standard.code]} != ${subject.subject_slug}`)
    }
  }

  return {
    subject: subject.subject,
    subject_slug: subject.subject_slug,
    record_count: standards.length,
    grade_bands: sortObjectKeys(gradeBands),
    h3_grades: sortObjectKeys(h3Grades),
    domains: Object.keys(byDomain).length,
    standards
  }
}

function checkSkillCoverage(allStandards, skillToSubjects, skillsMeta, errors) {
  const skillChecks = {}
  const metaSkillCodes = new Set((skillsMeta.competencies || []).map(skill => skill.code))
  for (const skill of [...VALID_TS].sort()) {
    if (!metaSkillCodes.has(skill)) errors.push(`skills_meta missing competency ${skill}`)
    const matching = filterStandards(allStandards, { gradeBands: ['H3'], skills: [skill] })
    const actualSubjects = new Set(matching.map(row => row.subject_slug))
    const indexedSubjects = new Set(skillToSubjects[skill] || [])
    if (!matching.length) errors.push(`SkillDetail/Search TS filter has no H3 candidate results for ${skill}`)
    if (![...actualSubjects].every(subject => indexedSubjects.has(subject))) {
      errors.push(`${skill} skill_to_subjects index is missing H3 candidate subjects`)
    }
    if (matching.some(row => !hasSkill(row, skill))) {
      errors.push(`${skill} filter returned a standard without that TS code`)
    }
    skillChecks[skill] = {
      h3_standards: matching.length,
      h3_subjects: [...actualSubjects].sort(),
      index_subjects: [...indexedSubjects].sort()
    }
  }
  return skillChecks
}

function checkCompareAndSearch(subjectChecks, allStandards, errors) {
  const slugs = subjectChecks.map(subject => subject.subject_slug)
  const sampleSubjects = slugs.slice(0, Math.min(3, slugs.length))
  const multiSubjectValid = isValidCompareSelection(sampleSubjects, ['H3'])
  const multiSubjectMode = getCompareMode(sampleSubjects, ['H3'])
  const candidateBands = ['H1', 'H2', 'H3']
  const singleSubjectValid = isValidCompareSelection([slugs[0]], candidateBands)
  const singleSubjectMode = getCompareMode([slugs[0]], candidateBands)

  if (!multiSubjectValid || multiSubjectMode !== 'subjects') {
    errors.push(`CompareView multi-subject mode invalid for ${sampleSubjects.join(',')} + H3`)
  }
  if (!singleSubjectValid || singleSubjectMode !== 'gradeBands') {
    errors.push(`CompareView single-subject mode invalid for ${slugs[0]} + ${candidateBands.join(',')}`)
  }

  const h3SearchSample = filterStandards(allStandards, {
    subjects: sampleSubjects,
    gradeBands: ['H3'],
    skills: ['TS1']
  })
  if (!h3SearchSample.length) {
    errors.push('SearchResultsPage combined subject + H3 + TS1 filter would be empty')
  }

  const allBandSearchSample = filterStandards(allStandards, {
    subjects: [slugs[0]],
    gradeBands: candidateBands
  })
  if (!allBandSearchSample.length) {
    errors.push('SearchResultsPage candidate all-band subject filter would be empty')
  }

  return {
    multi_subject_h3: {
      subjects: sampleSubjects,
      grade_bands: ['H3'],
      valid: multiSubjectValid,
      mode: multiSubjectMode
    },
    single_subject_all_bands: {
      subjects: [slugs[0]],
      grade_bands: candidateBands,
      valid: singleSubjectValid,
      mode: singleSubjectMode
    },
    h3_ts1_search_results: h3SearchSample.length,
    all_band_subject_results: allBandSearchSample.length
  }
}

function checkDetailSamples(subjectChecks, samplePerSubject, errors) {
  const samples = []
  for (const subject of subjectChecks) {
    const h3Sample = subject.standards.filter(row => row.grade_band === 'H3').slice(0, Math.max(1, samplePerSubject))
    const earlierSample = subject.standards.filter(row => row.grade_band !== 'H3').slice(0, Math.max(1, samplePerSubject))
    for (const standard of [...h3Sample, ...earlierSample]) {
      const gradeBandInfo = GRADE_BANDS[standard.grade_band] || {}
      if (!gradeBandInfo.label) errors.push(`${standard.code} has no GRADE_BANDS label for ${standard.grade_band}`)
      samples.push({
        code: standard.code,
        subject_slug: standard.subject_slug,
        grade_band: standard.grade_band,
        grade_range: standard.grade_range,
        grade: standard.grade,
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
  const loaded = loadRequiredFiles(args, errors)
  if (!loaded) {
    console.log(JSON.stringify({ valid: false, errors, warnings }, null, 2))
    process.exit(1)
  }

  const expectedSubjects = Object.keys(SUBJECTS).sort((a, b) => a.localeCompare(b))
  const manifestSubjects = (loaded.manifest.subjects || []).map(subject => subject.subject_slug).sort((a, b) => a.localeCompare(b))
  if (!sameArray(expectedSubjects, manifestSubjects)) {
    errors.push(`Candidate manifest subjects mismatch: expected ${expectedSubjects.join(', ')}, got ${manifestSubjects.join(', ')}`)
  }
  if (loaded.releaseSummary.valid !== true) errors.push('release_candidate_summary.json is not valid')
  if (loaded.releaseSummary.totals?.candidate_records !== (loaded.manifest.subjects || []).reduce((sum, subject) => sum + Number(subject.record_count || 0), 0)) {
    errors.push('release candidate summary total does not match manifest total')
  }

  const subjectChecks = []
  for (const subject of loaded.manifest.subjects || []) {
    const check = validateSubject(subject, args, loaded.codeToSubject, loaded.subjectStats, errors, warnings)
    if (check) subjectChecks.push(check)
  }

  const allStandards = subjectChecks.flatMap(subject => subject.standards)
  const totalFromSubjects = subjectChecks.reduce((sum, subject) => sum + subject.record_count, 0)
  const manifestTotal = (loaded.manifest.subjects || []).reduce((sum, subject) => sum + Number(subject.record_count || 0), 0)
  if (totalFromSubjects !== manifestTotal) {
    errors.push(`Manifest total mismatch: ${manifestTotal} != ${totalFromSubjects}`)
  }

  const gradeBandH3 = GRADE_BANDS.H3 || {}
  if (!String(gradeBandH3.range || '').includes('7-9')) {
    warnings.push(`Frontend GRADE_BANDS.H3.range is "${gradeBandH3.range || ''}", while candidate uses H3 grade_range "7-9". Update GRADE_BANDS before public release.`)
  }

  const skillChecks = checkSkillCoverage(allStandards, loaded.skillToSubjects, loaded.skillsMeta, errors)
  const compareChecks = checkCompareAndSearch(subjectChecks, allStandards, errors)
  const detailSamples = checkDetailSamples(subjectChecks, args.samplePerSubject, errors)

  const result = {
    valid: errors.length === 0,
    candidate_root: args.candidateRoot,
    data_scope: loaded.manifest.data_scope || '',
    subjects: subjectChecks.length,
    total: allStandards.length,
    release_summary_totals: loaded.releaseSummary.totals || {},
    ui_paths_checked: [
      'SubjectPage grade-band filters and domain grouping',
      'CompareView subject/grade-band modes',
      'SearchResultsPage grade-band and TS filters',
      'SkillDetailPage TS reverse lookup',
      'StandardDetailPage code lookup and detail fields'
    ],
    grade_band_labels: {
      H1: GRADE_BANDS.H1,
      H2: GRADE_BANDS.H2,
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
