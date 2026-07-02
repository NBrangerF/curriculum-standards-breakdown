#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_RUN_ROOT = 'generated/textbook_evidence/h4g_runs'
const DEFAULT_TAXONOMY = 'scripts/textbooks/h4g_subject_theme_taxonomy.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_packet.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_packet.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']
const STANDARD_TEXT_FIELDS = [
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
    taxonomy: DEFAULT_TAXONOMY,
    subjects: [],
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    maxUnitsPerStandard: 4,
    strict: false,
    requireCandidates: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--run-root') args.runRoot = argv[++i]
    else if (item === '--run-dirs') args.runDirs = splitArg(argv[++i])
    else if (item === '--taxonomy') args.taxonomy = argv[++i]
    else if (item === '--subjects') args.subjects = splitArg(argv[++i])
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--max-units-per-standard') args.maxUnitsPerStandard = positiveInteger(argv[++i], args.maxUnitsPerStandard)
    else if (item === '--strict') args.strict = true
    else if (item === '--require-candidates') args.requireCandidates = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_review_packet.js \\
  --run-dirs generated/textbook_evidence/h4g_runs/h4g_unit_work_english_89497c34,generated/textbook_evidence/h4g_runs/h4g_unit_work_pe_6aec3166 \\
  --subjects english,pe \\
  --strict --require-candidates

Builds a review-only subject theme bridge packet. The packet tags textbook units
and H4G standards with controlled subject theme tags, then proposes same-grade
review candidates. It never writes public/data and never approves bridges.`)
}

function splitArg(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
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

function hashText(value, length = 12) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function normalized(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[，。！？；：、“”‘’（）《》【】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compact(value) {
  return normalized(value).replace(/\s+/g, '')
}

function includesPattern(text, pattern) {
  const patternText = normalized(pattern)
  if (!patternText) return false
  const textNorm = normalized(text)
  if (textNorm.includes(patternText)) return true
  return compact(textNorm).includes(compact(patternText))
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

function hasPositivePageStart(value) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function discoverRunDirs(root) {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .map(entry => join(root, entry))
    .filter(path => statSync(path).isDirectory())
    .filter(path => existsSync(join(path, 'textbook_unit_index.json')))
    .sort((a, b) => a.localeCompare(b))
}

function loadStandards(dataRoot, subjectsFilter) {
  const selected = new Set(subjectsFilter)
  const records = []
  const subjects = {}
  for (const file of subjectFiles(dataRoot)) {
    const subject = basename(file, '.json')
    if (selected.size && !selected.has(subject)) continue
    const payload = readJson(file)
    subjects[subject] = payload.subject || subject
    for (const record of payload.standards || []) {
      if (!TARGET_GRADE_BANDS.includes(record.grade_band)) continue
      records.push({
        ...record,
        subject_slug: record.subject_slug || subject,
        subject_label: payload.subject || subject
      })
    }
  }
  return { records, subjects }
}

function loadUnits(runDirs, subjectsFilter) {
  const selected = new Set(subjectsFilter)
  const units = []
  for (const runDir of runDirs) {
    const unitIndexPath = join(runDir, 'textbook_unit_index.json')
    const unitIndex = readOptionalJson(unitIndexPath)
    for (const unit of unitIndex?.unit_candidates || []) {
      if (unit.candidate_type !== 'toc_unit_or_chapter') continue
      if (selected.size && !selected.has(unit.subject_slug)) continue
      units.push({
        ...unit,
        run_dir: runDir,
        unit_index: unitIndexPath,
        grade_band: gradeBandForUnit(unit)
      })
    }
  }
  return units
}

function taxonomyForSubject(taxonomy, subject) {
  return taxonomy.subjects?.[subject] || { topic_tags: [], deny_standalone_terms: [] }
}

function tagMatchesForText(subjectTaxonomy, text, patternField) {
  const matches = []
  for (const row of subjectTaxonomy.topic_tags || []) {
    const patterns = row[patternField] || []
    const matchedPatterns = patterns.filter(pattern => includesPattern(text, pattern))
    if (!matchedPatterns.length) continue
    matches.push({
      tag: row.tag,
      label: row.label || row.tag,
      curriculum_theme_terms: row.curriculum_theme_terms || [],
      matched_patterns: matchedPatterns
    })
  }
  return matches.sort((a, b) => a.tag.localeCompare(b.tag))
}

function tagSet(rows) {
  return new Set(rows.map(row => row.tag))
}

function standardText(record) {
  return STANDARD_TEXT_FIELDS.map(field => record[field] || '').join('\n')
}

function groupStandards(records) {
  const groups = new Map()
  for (const record of records) {
    const key = record.progression_group_id || `${record.subject_slug}:${record.code || hashText(JSON.stringify(record))}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }
  return [...groups.entries()].map(([progressionGroupId, rows]) => ({
    progression_group_id: progressionGroupId,
    subject_slug: rows[0]?.subject_slug || '',
    subject_label: rows[0]?.subject_label || rows[0]?.subject_slug || '',
    domain: rows[0]?.domain || '',
    subdomain: rows[0]?.subdomain || '',
    grade_bands: TARGET_GRADE_BANDS.filter(band => rows.some(row => row.grade_band === band)),
    standard_codes: rows.map(row => row.code).filter(Boolean),
    records: rows.sort((a, b) => TARGET_GRADE_BANDS.indexOf(a.grade_band) - TARGET_GRADE_BANDS.indexOf(b.grade_band) || String(a.code || '').localeCompare(String(b.code || '')))
  })).sort((a, b) => a.subject_slug.localeCompare(b.subject_slug) || a.progression_group_id.localeCompare(b.progression_group_id))
}

function buildUnitThemeItems(units, taxonomy) {
  return units.map(unit => {
    const subjectTaxonomy = taxonomyForSubject(taxonomy, unit.subject_slug)
    const text = [unit.unit_title, unit.matched_line, unit.volume].filter(Boolean).join('\n')
    const matches = tagMatchesForText(subjectTaxonomy, text, 'unit_title_patterns')
    return {
      review_id: `h4g_unit_theme_review_${hashText(unit.unit_evidence_id || `${unit.textbook_evidence_id}:${unit.unit_title}`)}`,
      review_type: 'unit_theme_tag_review',
      subject_slug: unit.subject_slug,
      grade_band: unit.grade_band,
      grade_label: unit.grade_label || '',
      edition: unit.edition || '',
      volume: unit.volume || '',
      textbook_subject: unit.textbook_subject || '',
      unit_evidence_id: unit.unit_evidence_id || '',
      textbook_evidence_id: unit.textbook_evidence_id || '',
      unit_title: unit.unit_title || '',
      unit_level: unit.unit_level || '',
      page_start: unit.page_start ?? null,
      page_end: unit.page_end ?? null,
      page_range: unit.page_range || '',
      page_range_status: unit.page_range_status || '',
      page_ready: hasPositivePageStart(unit.page_start),
      topic_matches: matches,
      suggested_topic_tags: matches.map(row => row.tag),
      suggested_curriculum_theme_terms: [...new Set(matches.flatMap(row => row.curriculum_theme_terms || []))].sort((a, b) => a.localeCompare(b)),
      review_status: taxonomy.review_policy?.default_review_status || 'needs_source_review',
      eligible_for_h4g_differentiation: false,
      writes_public_data: false,
      source: 'rule_seeded_textbook_unit_title_theme_tags',
      run_dir: unit.run_dir,
      unit_index: unit.unit_index,
      review_questions: [
        'Does this textbook unit title actually represent the suggested curriculum topic?',
        'Is the topic too broad to support a standard-level bridge?',
        'Does the unit need page-start recovery before any publication gate?'
      ]
    }
  }).sort((a, b) => a.subject_slug.localeCompare(b.subject_slug) ||
    TARGET_GRADE_BANDS.indexOf(a.grade_band) - TARGET_GRADE_BANDS.indexOf(b.grade_band) ||
    String(a.unit_title).localeCompare(String(b.unit_title)))
}

function buildProgressionThemeItems(groups, taxonomy) {
  return groups.map(group => {
    const subjectTaxonomy = taxonomyForSubject(taxonomy, group.subject_slug)
    const text = group.records.map(standardText).join('\n')
    const matches = tagMatchesForText(subjectTaxonomy, text, 'standard_text_patterns')
    return {
      review_id: `h4g_progression_theme_review_${hashText(group.progression_group_id)}`,
      review_type: 'progression_group_theme_tag_review',
      subject_slug: group.subject_slug,
      subject_label: group.subject_label,
      progression_group_id: group.progression_group_id,
      grade_bands: group.grade_bands,
      standard_codes: group.standard_codes,
      domain: group.domain,
      subdomain: group.subdomain,
      topic_matches: matches,
      suggested_topic_tags: matches.map(row => row.tag),
      suggested_curriculum_theme_terms: [...new Set(matches.flatMap(row => row.curriculum_theme_terms || []))].sort((a, b) => a.localeCompare(b)),
      review_status: taxonomy.review_policy?.default_review_status || 'needs_source_review',
      eligible_for_h4g_differentiation: false,
      writes_public_data: false,
      source: 'rule_seeded_curriculum_standard_theme_tags',
      review_questions: [
        'Does the suggested topic describe this progression group without changing official standard text?',
        'Should the bridge be scoped to the whole progression group or only specific standard codes?',
        'Could the topic create a broad alias that would overmatch unrelated units?'
      ]
    }
  }).sort((a, b) => a.subject_slug.localeCompare(b.subject_slug) || a.progression_group_id.localeCompare(b.progression_group_id))
}

function buildBridgeCandidates(records, unitItems, progressionItems, args) {
  const unitsBySubjectGrade = {}
  for (const item of unitItems) {
    const key = `${item.subject_slug}:${item.grade_band}`
    unitsBySubjectGrade[key] ||= []
    unitsBySubjectGrade[key].push(item)
  }
  const progressionById = new Map(progressionItems.map(item => [item.progression_group_id, item]))
  const candidates = []
  const standardsWithoutCandidates = []

  for (const record of records) {
    const progression = progressionById.get(record.progression_group_id || '')
    const standardTags = progression?.suggested_topic_tags || []
    const standardTagSet = new Set(standardTags)
    const units = unitsBySubjectGrade[`${record.subject_slug}:${record.grade_band}`] || []
    const matches = []
    for (const unit of units) {
      const shared = unit.suggested_topic_tags.filter(tag => standardTagSet.has(tag))
      if (!shared.length) continue
      matches.push({
        unit,
        shared_topic_tags: shared.sort((a, b) => a.localeCompare(b)),
        score: shared.length * 10 + (unit.page_ready ? 2 : 0) + Math.min(3, unit.suggested_topic_tags.length)
      })
    }
    matches.sort((a, b) => b.score - a.score || a.unit.unit_evidence_id.localeCompare(b.unit.unit_evidence_id))
    const selected = matches.slice(0, args.maxUnitsPerStandard)
    if (!selected.length) {
      standardsWithoutCandidates.push({
        standard_code: record.code,
        subject_slug: record.subject_slug,
        grade_band: record.grade_band,
        progression_group_id: record.progression_group_id || '',
        reason: standardTags.length ? 'no_same_grade_unit_with_shared_topic_tag' : 'standard_progression_group_has_no_suggested_topic_tag'
      })
      continue
    }
    for (const match of selected) {
      candidates.push({
        review_id: `h4g_subject_theme_bridge_${hashText(`${record.code}:${match.unit.unit_evidence_id}`)}`,
        review_type: 'subject_theme_bridge_review_candidate',
        match_type: 'subject_theme_review_candidate',
        subject_slug: record.subject_slug,
        grade_band: record.grade_band,
        standard_code: record.code,
        progression_group_id: record.progression_group_id || '',
        domain: record.domain || '',
        subdomain: record.subdomain || '',
        unit_evidence_id: match.unit.unit_evidence_id,
        unit_grade_band: match.unit.grade_band,
        textbook_evidence_id: match.unit.textbook_evidence_id,
        unit_title: match.unit.unit_title,
        unit_level: match.unit.unit_level,
        edition: match.unit.edition,
        volume: match.unit.volume,
        page_start: match.unit.page_start,
        page_end: match.unit.page_end,
        page_range: match.unit.page_range,
        page_range_status: match.unit.page_range_status,
        page_ready: match.unit.page_ready,
        standard_topic_tags: standardTags,
        unit_topic_tags: match.unit.suggested_topic_tags,
        shared_topic_tags: match.shared_topic_tags,
        bridge_score: match.score,
        review_status: 'needs_source_review',
        eligible_for_h4g_differentiation: false,
        writes_public_data: false,
        changes_official_standard_text: false,
        requires_source_review: true,
        rationale: 'Same-grade standard and textbook unit share controlled subject theme tags, but the bridge is not approved until source review confirms the alignment.',
        review_questions: [
          'Does the shared topic prove this exact standard-to-unit relationship, not only a broad subject relationship?',
          'Should the bridge be scoped to this standard_code, the whole progression_group_id, or rejected?',
          'Is page evidence sufficient for this unit before any later publication gate?'
        ]
      })
    }
  }

  return { candidates, standardsWithoutCandidates }
}

function summarize(packet) {
  const summary = {
    subjects: 0,
    unit_theme_items: packet.unit_theme_items.length,
    progression_theme_items: packet.progression_theme_items.length,
    bridge_review_candidates: packet.bridge_review_candidates.length,
    standards_without_bridge_candidates: packet.standards_without_bridge_candidates.length,
    page_ready_bridge_candidates: packet.bridge_review_candidates.filter(item => item.page_ready).length,
    by_subject: {},
    by_topic_tag: {},
    by_review_status: {}
  }
  const subjects = new Set()
  for (const item of packet.unit_theme_items) {
    subjects.add(item.subject_slug)
    summary.by_subject[item.subject_slug] ||= emptySubjectSummary()
    summary.by_subject[item.subject_slug].unit_theme_items += 1
    if (item.page_ready) summary.by_subject[item.subject_slug].page_ready_units += 1
    for (const tag of item.suggested_topic_tags) countInto(summary.by_topic_tag, tag)
    countInto(summary.by_review_status, item.review_status)
  }
  for (const item of packet.progression_theme_items) {
    subjects.add(item.subject_slug)
    summary.by_subject[item.subject_slug] ||= emptySubjectSummary()
    summary.by_subject[item.subject_slug].progression_theme_items += 1
    countInto(summary.by_review_status, item.review_status)
  }
  for (const item of packet.bridge_review_candidates) {
    subjects.add(item.subject_slug)
    summary.by_subject[item.subject_slug] ||= emptySubjectSummary()
    summary.by_subject[item.subject_slug].bridge_review_candidates += 1
    if (item.page_ready) summary.by_subject[item.subject_slug].page_ready_bridge_candidates += 1
    countInto(summary.by_review_status, item.review_status)
  }
  for (const item of packet.standards_without_bridge_candidates) {
    summary.by_subject[item.subject_slug] ||= emptySubjectSummary()
    summary.by_subject[item.subject_slug].standards_without_bridge_candidates += 1
  }
  summary.subjects = subjects.size
  summary.by_subject = Object.fromEntries(Object.entries(summary.by_subject).sort(([a], [b]) => a.localeCompare(b)))
  summary.by_topic_tag = Object.fromEntries(Object.entries(summary.by_topic_tag).sort(([a], [b]) => a.localeCompare(b)))
  summary.by_review_status = Object.fromEntries(Object.entries(summary.by_review_status).sort(([a], [b]) => a.localeCompare(b)))
  return summary
}

function emptySubjectSummary() {
  return {
    unit_theme_items: 0,
    page_ready_units: 0,
    progression_theme_items: 0,
    bridge_review_candidates: 0,
    page_ready_bridge_candidates: 0,
    standards_without_bridge_candidates: 0
  }
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function countRows(rows) {
  return Object.entries(rows || {})
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function subjectRows(summary) {
  return Object.entries(summary.by_subject || {})
    .map(([subject, stats]) => `| ${markdownCell(subject)} | ${stats.unit_theme_items} | ${stats.page_ready_units} | ${stats.progression_theme_items} | ${stats.bridge_review_candidates} | ${stats.page_ready_bridge_candidates} | ${stats.standards_without_bridge_candidates} |`)
    .join('\n') || '| - | 0 | 0 | 0 | 0 | 0 | 0 |'
}

function candidateRows(candidates) {
  return candidates.slice(0, 80)
    .map(item => `| ${markdownCell(item.subject_slug)} | ${markdownCell(item.grade_band)} | ${markdownCell(item.standard_code)} | ${markdownCell(item.unit_title)} | ${markdownCell(item.shared_topic_tags.join(', '))} | ${markdownCell(item.page_range_status)} | ${markdownCell(item.review_status)} |`)
    .join('\n') || '| - | - | - | - | - | - | - |'
}

function buildMarkdown(packet) {
  return `# H4G Subject Theme Bridge Review Packet

Generated at: ${packet.generated_at}

This is a review-only packet. It does not write \`public/data\`, does not approve aliases, and does not change official standard text.

## Summary

| Field | Value |
| --- | ---: |
| subjects | ${packet.summary.subjects} |
| unit theme items | ${packet.summary.unit_theme_items} |
| progression theme items | ${packet.summary.progression_theme_items} |
| bridge review candidates | ${packet.summary.bridge_review_candidates} |
| standards without bridge candidates | ${packet.summary.standards_without_bridge_candidates} |
| page-ready bridge candidates | ${packet.summary.page_ready_bridge_candidates} |

## Subject Matrix

| Subject | Unit Theme Items | Page-Ready Units | Progression Theme Items | Bridge Candidates | Page-Ready Bridge Candidates | Standards Without Candidates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${subjectRows(packet.summary)}

## Topic Tags

| Topic Tag | Unit Theme Hits |
| --- | ---: |
${countRows(packet.summary.by_topic_tag)}

## Candidate Preview

| Subject | Grade | Standard | Unit Title | Shared Topic Tags | Page Status | Review Status |
| --- | --- | --- | --- | --- | --- | --- |
${candidateRows(packet.bridge_review_candidates)}

## Policy

- Every bridge candidate is \`needs_source_review\` and \`eligible_for_h4g_differentiation=false\`.
- Candidates are limited to same-subject and same-grade unit evidence.
- Shared topic tags are review prompts, not approved alignment.
- Page-missing candidates cannot enter any later reviewed publication gate until page evidence is recovered.
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
  if (!existsSync(join(args.dataRoot, 'by_subject'))) errors.push(`Missing by_subject under ${args.dataRoot}`)
  if (!existsSync(args.taxonomy)) errors.push(`Missing taxonomy: ${args.taxonomy}`)
  if (!runDirs.length) errors.push(`No run dirs found under ${args.runRoot}`)

  const taxonomy = errors.length ? { subjects: {}, review_policy: {} } : readJson(args.taxonomy)
  const { records } = loadStandards(args.dataRoot, args.subjects)
  const units = loadUnits(runDirs, args.subjects)
  const groups = groupStandards(records)
  const unitThemeItems = buildUnitThemeItems(units, taxonomy)
  const progressionThemeItems = buildProgressionThemeItems(groups, taxonomy)
  const { candidates, standardsWithoutCandidates } = buildBridgeCandidates(records, unitThemeItems, progressionThemeItems, args)

  if (args.requireCandidates && !candidates.length) errors.push('requireCandidates is set but no bridge review candidates were generated')

  const packet = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    schema_version: 1,
    purpose: 'h4g_subject_theme_bridge_review_packet',
    data_root: args.dataRoot,
    run_dirs: runDirs,
    taxonomy: args.taxonomy,
    target_grade_bands: TARGET_GRADE_BANDS,
    review_policy: {
      writes_public_data: false,
      changes_official_standard_text: false,
      generated_candidates_are_approved: false,
      eligible_for_h4g_differentiation: false,
      requires_source_review_before_matcher_use: true
    },
    unit_theme_items: unitThemeItems,
    progression_theme_items: progressionThemeItems,
    bridge_review_candidates: candidates,
    standards_without_bridge_candidates: standardsWithoutCandidates,
    errors: errors
  }
  packet.summary = summarize(packet)

  writeJson(args.out, packet)
  if (args.summaryOut) writeText(args.summaryOut, buildMarkdown(packet))
  console.log(JSON.stringify(stable({
    valid: packet.valid,
    wrote: args.out,
    summary_out: args.summaryOut || null,
    summary: packet.summary,
    errors
  }), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
