#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_RUN_ROOT = 'generated/textbook_evidence/h4g_runs'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_gaps.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_gaps.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']
const CORE_TEXT_FIELDS = [
  'domain',
  'subdomain',
  'standard',
  'context',
  'practice',
  'teaching_tip',
  'assessment_evidence_type'
]

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    runRoot: DEFAULT_RUN_ROOT,
    runDirs: [],
    subjects: [],
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireItems: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--run-root') args.runRoot = argv[++i]
    else if (item === '--run-dirs') args.runDirs = splitArg(argv[++i])
    else if (item === '--subjects') args.subjects = splitArg(argv[++i])
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_gaps.js \\
  --run-dirs generated/textbook_evidence/h4g_runs/h4g_unit_work_english_89497c34,generated/textbook_evidence/h4g_runs/h4g_unit_work_pe_6aec3166 \\
  --strict --require-items

Builds a read-only diagnostic for subjects where real textbook units exist, but
H4G standard-to-unit matching cannot produce usable evidence without a
subject-level theme bridge. It does not write public/data.`)
}

function splitArg(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readOptionalJson(path) {
  if (!existsSync(path)) return null
  return readJson(path)
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function hashText(value, length = 10) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function coreSignature(record) {
  return CORE_TEXT_FIELDS.map(field => normalizeText(record[field])).join('\n---\n')
}

function groupKey(record) {
  return record.progression_group_id || `${record.subject_slug}:${record.code || hashText(JSON.stringify(record))}`
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadH4GSubjects(dataRoot, subjectsFilter) {
  const selected = new Set(subjectsFilter)
  const bySubject = {}
  for (const file of subjectFiles(dataRoot)) {
    const subject = basename(file, '.json')
    if (selected.size && !selected.has(subject)) continue
    const payload = readJson(file)
    const records = (payload.standards || []).filter(record => TARGET_GRADE_BANDS.includes(record.grade_band))
    const groups = new Map()
    const byGradeBand = {}
    const byVariantType = {}
    const byReviewStatus = {}
    for (const record of records) {
      countInto(byGradeBand, record.grade_band)
      countInto(byVariantType, record.standard_variant_type)
      countInto(byReviewStatus, record.review_status)
      const key = groupKey(record)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(record)
    }
    const groupRows = [...groups.entries()].map(([progressionGroupId, rows]) => {
      const gradeBands = TARGET_GRADE_BANDS.filter(band => rows.some(record => record.grade_band === band))
      return {
        progression_group_id: progressionGroupId,
        grade_bands: gradeBands,
        complete_triplet: gradeBands.length === TARGET_GRADE_BANDS.length,
        core_identical: gradeBands.length === TARGET_GRADE_BANDS.length && new Set(rows.map(coreSignature)).size === 1,
        standard_codes: rows.map(record => record.code).filter(Boolean),
        domain: rows[0]?.domain || '',
        subdomain: rows[0]?.subdomain || ''
      }
    })
    bySubject[subject] = {
      subject_slug: subject,
      subject_label: payload.subject || subject,
      h4g_records: records.length,
      progression_groups: groupRows.length,
      complete_triplets: groupRows.filter(row => row.complete_triplet).length,
      identical_complete_triplets: groupRows.filter(row => row.core_identical).length,
      by_grade_band: byGradeBand,
      by_variant_type: byVariantType,
      by_review_status: byReviewStatus,
      sample_progression_groups: groupRows
        .filter(row => row.core_identical)
        .slice(0, 8)
        .map(row => ({
          progression_group_id: row.progression_group_id,
          standard_codes: row.standard_codes,
          domain: row.domain,
          subdomain: row.subdomain
        }))
    }
  }
  return bySubject
}

function discoverRunDirs(root) {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .map(entry => join(root, entry))
    .filter(path => statSync(path).isDirectory())
    .filter(path => existsSync(join(path, 'textbook_unit_index.json')) && existsSync(join(path, 'textbook_unit_standard_matches.json')))
    .sort((a, b) => a.localeCompare(b))
}

function gradeBandForUnit(unit) {
  const grade = Number(unit.grade)
  if (grade >= 7 && grade <= 9) return `H4G${grade}`
  const label = String(unit.grade_label || '')
  if (label.includes('七')) return 'H4G7'
  if (label.includes('八')) return 'H4G8'
  if (label.includes('九')) return 'H4G9'
  return ''
}

function languageProfile(value) {
  const text = String(value || '')
  const han = (text.match(/\p{Script=Han}/gu) || []).length
  const latin = (text.match(/[A-Za-z]/g) || []).length
  if (latin > 0 && han === 0) return 'latin_only'
  if (latin > 0 && han > 0) return 'mixed_latin_han'
  if (han > 0) return 'han_only'
  return 'other_or_numeric'
}

function hasPositivePageStart(value) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0
}

function sampleUnits(units) {
  const byGrade = {}
  for (const unit of units) {
    const grade = gradeBandForUnit(unit) || 'missing'
    byGrade[grade] ||= []
    if (byGrade[grade].length < 8) {
      byGrade[grade].push({
        unit_evidence_id: unit.unit_evidence_id,
        grade_band: grade,
        grade_label: unit.grade_label || '',
        volume: unit.volume || '',
        unit_level: unit.unit_level || '',
        unit_title: unit.unit_title || '',
        page_start: unit.page_start ?? null,
        page_range_status: unit.page_range_status || ''
      })
    }
  }
  return byGrade
}

function summarizeUnits(unitIndex) {
  const realUnits = (unitIndex?.unit_candidates || []).filter(unit => unit.candidate_type === 'toc_unit_or_chapter')
  const byGradeBand = {}
  const byUnitLevel = {}
  const byLanguageProfile = {}
  const byPageStatus = {}
  for (const unit of realUnits) {
    countInto(byGradeBand, gradeBandForUnit(unit))
    countInto(byUnitLevel, unit.unit_level)
    countInto(byLanguageProfile, languageProfile(unit.unit_title))
    countInto(byPageStatus, unit.page_range_status)
  }
  return {
    real_unit_or_chapter_candidates: realUnits.length,
    page_start_candidates: realUnits.filter(unit => hasPositivePageStart(unit.page_start)).length,
    page_missing_candidates: realUnits.filter(unit => !hasPositivePageStart(unit.page_start)).length,
    by_grade_band: byGradeBand,
    by_unit_level: byUnitLevel,
    by_language_profile: byLanguageProfile,
    by_page_range_status: byPageStatus,
    sample_units_by_grade_band: sampleUnits(realUnits)
  }
}

function summarizeMatches(payload, subject = '') {
  const allMatches = payload?.matches || []
  const matches = subject ? allMatches.filter(match => match.subject_slug === subject) : allMatches
  const allUnmatched = payload?.unmatched_standards || []
  const unmatched = subject ? allUnmatched.filter(row => row.subject_slug === subject) : allUnmatched
  const summary = payload?.summary || {}
  const scores = matches.map(match => Number(match.score)).filter(score => Number.isFinite(score))
  const byAlignment = {}
  const byConfidence = {}
  for (const match of matches) {
    countInto(byConfidence, match.confidence_band)
    if (match.eligible_for_h4g_differentiation) countInto(byAlignment, match.eligible_alignment)
  }
  const standardsWithMatches = new Set(matches.map(match => match.standard_code)).size
  const eligibleMatches = matches.filter(match => match.eligible_for_h4g_differentiation).length
  return {
    exists: Boolean(payload),
    standards_evaluated: subject ? (summary.by_subject?.[subject] || unmatched.length || 0) : (summary.standards_evaluated || 0),
    unit_candidates_considered: summary.unit_candidates_considered || 0,
    real_unit_or_chapter_candidates: summary.real_unit_or_chapter_candidates || 0,
    matches: subject ? matches.length : (summary.matches || matches.length),
    standards_with_matches: subject ? standardsWithMatches : (summary.standards_with_matches || standardsWithMatches),
    eligible_matches: subject ? eligibleMatches : (summary.eligible_matches || eligibleMatches),
    unmatched_standards: subject ? unmatched.length : (summary.unmatched_standards || unmatched.length || 0),
    max_score: scores.length ? Number(Math.max(...scores).toFixed(4)) : 0,
    by_confidence_band: subject || !Object.keys(summary.by_confidence_band || {}).length ? byConfidence : summary.by_confidence_band,
    by_eligible_alignment: subject || !Object.keys(summary.by_eligible_alignment || {}).length ? byAlignment : summary.by_eligible_alignment
  }
}

function subjectsInRun(unitIndex, matchesPayload) {
  const subjects = new Set()
  for (const unit of unitIndex?.unit_candidates || []) {
    if (unit.subject_slug) subjects.add(unit.subject_slug)
  }
  for (const subject of Object.keys(matchesPayload?.summary?.by_subject || {})) {
    subjects.add(subject)
  }
  return [...subjects].sort((a, b) => a.localeCompare(b))
}

function bridgeType(subject, unitSummary, defaultMatches, diagnosticMatches) {
  if (!unitSummary.real_unit_or_chapter_candidates) return 'build_real_unit_candidates_first'
  if (defaultMatches.eligible_matches > 0) return 'unit_matching_available'
  const latinUnits = unitSummary.by_language_profile.latin_only || 0
  const hanUnits = unitSummary.by_language_profile.han_only || 0
  if (subject === 'english' && latinUnits > hanUnits) return 'bilingual_topic_bridge_required'
  if (subject === 'pe') return 'curriculum_activity_theme_bridge_required'
  if (diagnosticMatches.exists && diagnosticMatches.matches === 0) return 'controlled_topic_taxonomy_required'
  return 'subject_theme_bridge_required'
}

function causeLabels(subject, unitSummary, defaultMatches, diagnosticMatches) {
  const labels = []
  if (!unitSummary.real_unit_or_chapter_candidates) labels.push('no_real_unit_candidates')
  if (unitSummary.real_unit_or_chapter_candidates && defaultMatches.matches === 0) labels.push('default_match_zero')
  if (diagnosticMatches.exists && diagnosticMatches.matches === 0) labels.push('no_low_threshold_lexical_overlap')
  if (diagnosticMatches.exists && diagnosticMatches.matches > 0 && diagnosticMatches.eligible_matches === 0) labels.push('weak_overlap_without_alignment')
  if (unitSummary.page_missing_candidates > unitSummary.page_start_candidates) labels.push('page_start_gap')
  if (subject === 'english') labels.push('cross_language_title_gap')
  if (subject === 'pe') labels.push('broad_competency_to_activity_title_gap')
  return [...new Set(labels)]
}

function recommendedActions(subject, type) {
  if (subject === 'english' || type === 'bilingual_topic_bridge_required') {
    return [
      'build_controlled_bilingual_topic_taxonomy_for_english_unit_titles',
      'tag_each_module_or_unit_with_chinese_curriculum_topics_before_matching',
      'map_progression_groups_to_reviewed_topic_tags_instead_of_global_aliases',
      'recover_page_starts_for_unpaged_units_before_publication_gate',
      'rerun_match_units_with_subject_bridge_and_keep_eligible_alignment_gate'
    ]
  }
  if (subject === 'pe' || type === 'curriculum_activity_theme_bridge_required') {
    return [
      'build_pe_activity_theme_taxonomy_for_sport_health_and_fitness_units',
      'separate_sport_skill_evidence_from_health_fitness_and_character_evidence',
      'ban_generic_terms_such_as_health_or_movement_as_standalone_alignment',
      'recover_toc_page_starts_for_missing_chapters_before_publication_gate',
      'rerun_match_units_with_subject_bridge_and_reviewed_alignment_policy'
    ]
  }
  return [
    'build_subject_topic_taxonomy',
    'tag_unit_titles_with_reviewed_topic_terms',
    'rerun_matching_with_subject_bridge',
    'keep_publication_gate_review_only_until_cross_version_evidence_passes'
  ]
}

function reviewStatus(type, defaultMatches) {
  if (type === 'build_real_unit_candidates_first') return 'unit_parser_or_materialization_gap'
  if (type === 'unit_matching_available' && defaultMatches.eligible_matches > 0) return 'not_a_theme_bridge_blocker'
  return 'needs_subject_theme_bridge_before_unit_evidence_candidate'
}

function analyzeRun(runDir, h4gSubjects) {
  const unitIndexPath = join(runDir, 'textbook_unit_index.json')
  const matchesPath = join(runDir, 'textbook_unit_standard_matches.json')
  const diagnosticPath = join(runDir, 'textbook_unit_standard_matches_low_threshold_diagnostic.json')
  const runSummaryPath = join(runDir, 'run_summary.json')
  const unitIndex = readOptionalJson(unitIndexPath)
  const matchesPayload = readOptionalJson(matchesPath)
  const diagnosticPayload = readOptionalJson(diagnosticPath)
  const runSummary = readOptionalJson(runSummaryPath)
  const unitSummary = summarizeUnits(unitIndex)
  const defaultMatches = summarizeMatches(matchesPayload)
  const diagnosticMatches = summarizeMatches(diagnosticPayload)
  const subjects = subjectsInRun(unitIndex, matchesPayload)
  const analyses = []

  for (const subject of subjects) {
    const subjectUnitCandidates = (unitIndex?.unit_candidates || []).filter(unit => unit.subject_slug === subject)
    const subjectUnitSummary = summarizeUnits({ unit_candidates: subjectUnitCandidates })
    const subjectDefaultMatches = summarizeMatches(matchesPayload, subject)
    const subjectDiagnosticMatches = summarizeMatches(diagnosticPayload, subject)
    const type = bridgeType(subject, subjectUnitSummary, subjectDefaultMatches, subjectDiagnosticMatches)
    const causes = causeLabels(subject, subjectUnitSummary, subjectDefaultMatches, subjectDiagnosticMatches)
    const status = reviewStatus(type, subjectDefaultMatches)
    analyses.push({
      analysis_id: `h4g_theme_bridge_${subject}_${hashText(runDir)}`,
      subject,
      subject_label: h4gSubjects[subject]?.subject_label || subject,
      run_dir: runDir,
      work_item_id: runSummary?.work_item?.work_item_id || basename(runDir),
      edition: runSummary?.work_item?.edition || '',
      textbook_unit_index: unitIndexPath,
      match_file: matchesPath,
      low_threshold_diagnostic_match_file: diagnosticPayload ? diagnosticPath : '',
      h4g_subject_summary: h4gSubjects[subject] || null,
      unit_summary: subjectUnitSummary,
      default_match_summary: subjectDefaultMatches,
      low_threshold_match_summary: subjectDiagnosticMatches,
      bridge_type: type,
      cause_labels: causes,
      review_status: status,
      recommended_actions: recommendedActions(subject, type),
      publication_policy: {
        writes_public_data: false,
        changes_official_standard_text: false,
        can_create_h4g_unit_evidence_candidate: subjectDefaultMatches.eligible_matches > 0,
        requires_source_review_before_alias_or_bridge_publication: true
      }
    })
  }

  return {
    run_dir: runDir,
    unit_index_exists: Boolean(unitIndex),
    matches_exists: Boolean(matchesPayload),
    low_threshold_diagnostic_exists: Boolean(diagnosticPayload),
    subjects,
    unit_summary: unitSummary,
    default_match_summary: defaultMatches,
    low_threshold_match_summary: diagnosticMatches,
    analyses
  }
}

function buildSummary(subjectRuns) {
  const analyses = subjectRuns.flatMap(run => run.analyses)
  const byBridgeType = {}
  const byReviewStatus = {}
  const bySubject = {}
  for (const item of analyses) {
    countInto(byBridgeType, item.bridge_type)
    countInto(byReviewStatus, item.review_status)
    bySubject[item.subject] ||= {
      analyses: 0,
      real_unit_or_chapter_candidates: 0,
      default_matches: 0,
      low_threshold_matches: 0,
      eligible_matches: 0
    }
    bySubject[item.subject].analyses += 1
    bySubject[item.subject].real_unit_or_chapter_candidates += item.unit_summary.real_unit_or_chapter_candidates
    bySubject[item.subject].default_matches += item.default_match_summary.matches
    bySubject[item.subject].low_threshold_matches += item.low_threshold_match_summary.matches
    bySubject[item.subject].eligible_matches += item.default_match_summary.eligible_matches
  }
  return {
    runs: subjectRuns.length,
    subject_run_analyses: analyses.length,
    bridge_work_items: analyses.filter(item => item.review_status === 'needs_subject_theme_bridge_before_unit_evidence_candidate').length,
    by_bridge_type: byBridgeType,
    by_review_status: byReviewStatus,
    by_subject: Object.fromEntries(Object.entries(bySubject).sort(([a], [b]) => a.localeCompare(b)))
  }
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function subjectRunRows(analyses) {
  return analyses.map(item => `| ${markdownCell(item.subject)} | ${markdownCell(item.edition || item.work_item_id)} | ${item.h4g_subject_summary?.h4g_records || 0} | ${item.h4g_subject_summary?.identical_complete_triplets || 0} | ${item.unit_summary.real_unit_or_chapter_candidates} | ${item.unit_summary.page_start_candidates}/${item.unit_summary.real_unit_or_chapter_candidates} | ${item.default_match_summary.matches} | ${item.low_threshold_match_summary.exists ? item.low_threshold_match_summary.matches : 'n/a'} | ${item.default_match_summary.eligible_matches} | ${markdownCell(item.bridge_type)} | ${markdownCell(item.review_status)} |`).join('\n') || '| - | - | 0 | 0 | 0 | 0/0 | 0 | n/a | 0 | - | - |'
}

function sampleUnitRows(analyses) {
  const rows = []
  for (const item of analyses) {
    for (const [gradeBand, units] of Object.entries(item.unit_summary.sample_units_by_grade_band || {})) {
      for (const unit of units.slice(0, 4)) {
        rows.push(`| ${markdownCell(item.subject)} | ${markdownCell(gradeBand)} | ${markdownCell(unit.volume)} | ${markdownCell(unit.unit_level)} | ${markdownCell(unit.unit_title)} | ${markdownCell(unit.page_range_status)} |`)
      }
    }
  }
  return rows.join('\n') || '| - | - | - | - | - | - |'
}

function actionRows(analyses) {
  return analyses.map(item => `| ${markdownCell(item.analysis_id)} | ${markdownCell(item.subject)} | ${markdownCell(item.bridge_type)} | ${markdownCell(item.cause_labels.join(', '))} | ${markdownCell(item.recommended_actions.join('; '))} |`).join('\n') || '| - | - | - | - | - |'
}

function buildMarkdown(result) {
  const analyses = result.subject_runs.flatMap(run => run.analyses)
  return `# H4G Subject Theme Bridge Gap Audit

Generated at: ${result.generated_at}

This is a read-only diagnostic. It does not write \`public/data\`, does not add aliases, and does not change official standard text.

## Summary

| Field | Value |
| --- | ---: |
| valid | ${result.valid} |
| runs analyzed | ${result.summary.runs} |
| subject run analyses | ${result.summary.subject_run_analyses} |
| bridge work items | ${result.summary.bridge_work_items} |

## Bridge Types

| Bridge Type | Count |
| --- | ---: |
${countRows(result.summary.by_bridge_type)}

## Review Status

| Status | Count |
| --- | ---: |
${countRows(result.summary.by_review_status)}

## Subject Runs

| Subject | Edition / Work Item | H4G Records | Identical Triplets | Real Units | Page Starts | Default Matches | Low-Threshold Matches | Eligible | Bridge Type | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
${subjectRunRows(analyses)}

## Unit Samples

| Subject | Grade | Volume | Unit Level | Unit Title | Page Status |
| --- | --- | --- | --- | --- | --- |
${sampleUnitRows(analyses)}

## Work Items

| Analysis ID | Subject | Bridge Type | Causes | Recommended Actions |
| --- | --- | --- | --- | --- |
${actionRows(analyses)}

## Interpretation

- \`bilingual_topic_bridge_required\`: real unit titles exist, but current token matching cannot compare Chinese standards with mostly English unit titles.
- \`curriculum_activity_theme_bridge_required\`: real activity or sport chapter titles exist, but broad PE competencies need a reviewed subject taxonomy before alignment.
- \`weak_overlap_without_alignment\`: low-threshold matches are only weak lexical overlap; generic terms must not be promoted to evidence.
- \`page_start_gap\`: even after a theme bridge, publication still needs page-start recovery or source review.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const runDirs = args.runDirs.length ? args.runDirs : discoverRunDirs(args.runRoot)
  if (!existsSync(join(args.dataRoot, 'by_subject'))) errors.push(`Missing by_subject directory under ${args.dataRoot}`)
  if (!runDirs.length) errors.push(`No H4G run directories found under ${args.runRoot}`)

  const h4gSubjects = loadH4GSubjects(args.dataRoot, args.subjects)
  const selectedSubjects = new Set(args.subjects)
  const subjectRuns = runDirs
    .filter(runDir => existsSync(runDir))
    .map(runDir => analyzeRun(runDir, h4gSubjects))
    .map(run => ({
      ...run,
      analyses: selectedSubjects.size
        ? run.analyses.filter(item => selectedSubjects.has(item.subject))
        : run.analyses
    }))
    .filter(run => run.analyses.length)

  const summary = buildSummary(subjectRuns)
  if (args.requireItems && !summary.bridge_work_items) errors.push('requireItems is set but no bridge work items were generated')

  const result = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    data_root: args.dataRoot,
    run_root: args.runRoot,
    run_dirs: runDirs,
    target_grade_bands: TARGET_GRADE_BANDS,
    summary,
    subject_runs: subjectRuns,
    errors
  }

  writeJson(args.out, result)
  if (args.summaryOut) writeText(args.summaryOut, buildMarkdown(result))
  console.log(JSON.stringify(stable({
    valid: result.valid,
    wrote: args.out,
    summary_out: args.summaryOut || null,
    summary,
    errors
  }), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
