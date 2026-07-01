#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_TEXTBOOK_INDEX = 'generated/textbook_evidence/china_textbook_index.json'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_UNIT_INDEX = 'generated/textbook_evidence/textbook_unit_index.json'
const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_unit_evidence_candidate.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_worklist.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_worklist.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']
const GRADE_LABEL_BY_BAND = {
  H4G7: '七年级',
  H4G8: '八年级',
  H4G9: '九年级'
}
const BAND_BY_GRADE_LABEL = Object.fromEntries(Object.entries(GRADE_LABEL_BY_BAND).map(([band, label]) => [label, band]))
const CORE_TEXT_FIELDS = [
  'domain',
  'subdomain',
  'standard',
  'context',
  'practice',
  'teaching_tip',
  'assessment_evidence_type'
]
const SUBJECT_LABELS = {
  arts: '艺术',
  chinese: '语文',
  english: '英语',
  it: '信息科技',
  labor: '劳动',
  math: '数学',
  morality_law: '道德与法治',
  pe: '体育',
  science: '科学'
}
const ROLE_RANK = {
  direct_textbook: 3,
  discipline_textbook: 2,
  adjacent_discipline_textbook: 1
}

function parseArgs(argv) {
  const args = {
    textbookIndex: DEFAULT_TEXTBOOK_INDEX,
    dataRoot: DEFAULT_DATA_ROOT,
    unitIndex: DEFAULT_UNIT_INDEX,
    candidate: DEFAULT_CANDIDATE,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    subjects: [],
    maxEditionsPerSubject: 3,
    minPublicationEditions: 2,
    strict: false,
    requireWorkItems: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--textbook-index') args.textbookIndex = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--unit-index') args.unitIndex = argv[++i]
    else if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = splitArg(argv[++i])
    else if (item === '--max-editions-per-subject') args.maxEditionsPerSubject = positiveInteger(argv[++i], args.maxEditionsPerSubject)
    else if (item === '--min-publication-editions') args.minPublicationEditions = positiveInteger(argv[++i], args.minPublicationEditions)
    else if (item === '--strict') args.strict = true
    else if (item === '--require-work-items') args.requireWorkItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/plan_h4g_unit_evidence_worklist.js \\
  --subjects math,science \\
  --max-editions-per-subject 3

Builds a read-only worklist for the H4G unit-evidence effort. It joins public
H4G progression groups, current unit/candidate evidence, and ChinaTextbook
edition coverage to identify which textbook batches should be materialized next.
It does not write public/data.`)
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

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== ''))]
    .map(String)
    .sort((a, b) => a.localeCompare(b))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function hashText(value, length = 10) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function coreSignature(record) {
  return JSON.stringify(Object.fromEntries(CORE_TEXT_FIELDS.map(field => [field, record[field] || ''])))
}

function hasUnitEvidence(record) {
  return record.evidence_granularity === 'textbook_unit_level' ||
    (Array.isArray(record.textbook_unit_evidence_ids) && record.textbook_unit_evidence_ids.length > 0)
}

function needsUnitEvidence(record) {
  return record.requires_unit_level_evidence === true ||
    record.standard_variant_type === 'same_source_shared' ||
    String(record.review_status || '').includes('needs_grade_differentiation')
}

function loadH4GStandards(dataRoot, subjectsFilter) {
  const selected = new Set(subjectsFilter)
  const subjects = {}
  const groups = new Map()
  const errors = []

  if (!existsSync(join(dataRoot, 'by_subject'))) {
    errors.push(`Missing data root by_subject: ${dataRoot}`)
    return { subjects, groups: [], errors }
  }

  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    if (selected.size && !selected.has(subjectSlug)) continue
    const payload = readJson(file)
    const subjectStats = {
      subject: payload.subject || SUBJECT_LABELS[subjectSlug] || subjectSlug,
      subject_slug: subjectSlug,
      h4g_records: 0,
      unit_level_records: 0,
      records_needing_unit_evidence: 0,
      grade_bands: {},
      review_statuses: {},
      standard_variant_types: {},
      progression_groups: 0,
      complete_triplets: 0,
      identical_complete_triplets: 0,
      groups_needing_unit_evidence: 0,
      groups_with_public_unit_evidence: 0
    }
    for (const record of payload.standards || []) {
      if (!TARGET_GRADE_BANDS.includes(record.grade_band)) continue
      subjectStats.h4g_records += 1
      countInto(subjectStats.grade_bands, record.grade_band)
      countInto(subjectStats.review_statuses, record.review_status)
      countInto(subjectStats.standard_variant_types, record.standard_variant_type)
      if (hasUnitEvidence(record)) subjectStats.unit_level_records += 1
      if (needsUnitEvidence(record)) subjectStats.records_needing_unit_evidence += 1

      const groupId = record.progression_group_id || `${subjectSlug}:${record.code || hashText(JSON.stringify(record))}`
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          progression_group_id: groupId,
          subject: subjectStats.subject,
          subject_slug: subjectSlug,
          records: []
        })
      }
      groups.get(groupId).records.push(record)
    }
    subjects[subjectSlug] = subjectStats
  }

  const groupDetails = [...groups.values()]
    .map(group => {
      const gradeBands = sorted(group.records.map(record => record.grade_band))
      const signatures = sorted(group.records.map(coreSignature))
      const unitEvidenceRecords = group.records.filter(hasUnitEvidence).length
      const needingRecords = group.records.filter(needsUnitEvidence).length
      const complete = TARGET_GRADE_BANDS.every(band => gradeBands.includes(band))
      return {
        progression_group_id: group.progression_group_id,
        subject: group.subject,
        subject_slug: group.subject_slug,
        grade_bands: gradeBands,
        complete_h4g_triplet: complete,
        core_text_status: signatures.length === 1 ? 'identical_core_fields' : 'core_fields_differ',
        records: group.records.length,
        standard_codes: sorted(group.records.map(record => record.code)),
        records_needing_unit_evidence: needingRecords,
        public_unit_level_records: unitEvidenceRecords,
        group_needs_unit_evidence: needingRecords > 0 && unitEvidenceRecords < group.records.length
      }
    })
    .sort((a, b) => a.subject_slug.localeCompare(b.subject_slug) || a.progression_group_id.localeCompare(b.progression_group_id))

  for (const group of groupDetails) {
    const subject = subjects[group.subject_slug]
    if (!subject) continue
    subject.progression_groups += 1
    if (group.complete_h4g_triplet) subject.complete_triplets += 1
    if (group.complete_h4g_triplet && group.core_text_status === 'identical_core_fields') subject.identical_complete_triplets += 1
    if (group.group_needs_unit_evidence) subject.groups_needing_unit_evidence += 1
    if (group.public_unit_level_records) subject.groups_with_public_unit_evidence += 1
  }

  return { subjects, groups: groupDetails, errors }
}

function loadUnitIndexSummary(path) {
  if (!existsSync(path)) return { exists: false }
  const payload = readJson(path)
  return {
    exists: true,
    source_commit: payload.source_commit || null,
    unit_candidates: payload.summary?.unit_candidates || 0,
    real_unit_or_chapter_candidates: payload.summary?.real_unit_or_chapter_candidates || 0,
    volume_seed_candidates: payload.summary?.volume_seed_candidates || 0,
    by_subject: payload.summary?.by_subject || {}
  }
}

function loadCandidateCoverage(path) {
  if (!path || !existsSync(path)) return { exists: false, by_subject: {}, by_progression_group: {}, summary: {} }
  const payload = readJson(path)
  const bySubject = {}
  const byProgressionGroup = {}
  for (const candidate of payload.candidates || []) {
    const subject = candidate.subject_slug || 'missing'
    bySubject[subject] ||= {
      candidates: 0,
      standard_codes: new Set(),
      progression_groups: new Set(),
      grade_bands: {},
      editions: new Set(),
      page_range_statuses: {}
    }
    const subjectStats = bySubject[subject]
    subjectStats.candidates += 1
    if (candidate.standard_code) subjectStats.standard_codes.add(candidate.standard_code)
    if (candidate.progression_group_id) subjectStats.progression_groups.add(candidate.progression_group_id)
    countInto(subjectStats.grade_bands, candidate.grade_band)
    for (const unit of candidate.unit_evidence || []) {
      if (unit.edition) subjectStats.editions.add(unit.edition)
      countInto(subjectStats.page_range_statuses, unit.page_range_status || 'missing')
    }

    const groupId = candidate.progression_group_id || candidate.standard_code || candidate.candidate_id
    if (groupId) {
      byProgressionGroup[groupId] ||= {
        candidates: 0,
        standard_codes: new Set(),
        grade_bands: new Set(),
        editions: new Set()
      }
      const group = byProgressionGroup[groupId]
      group.candidates += 1
      if (candidate.standard_code) group.standard_codes.add(candidate.standard_code)
      if (candidate.grade_band) group.grade_bands.add(candidate.grade_band)
      for (const unit of candidate.unit_evidence || []) {
        if (unit.edition) group.editions.add(unit.edition)
      }
    }
  }

  return {
    exists: true,
    candidate_file: path,
    by_subject: Object.fromEntries(Object.entries(bySubject).map(([subject, stats]) => [subject, {
      candidates: stats.candidates,
      standard_codes: sorted([...stats.standard_codes]),
      progression_groups: sorted([...stats.progression_groups]),
      grade_bands: stats.grade_bands,
      editions: sorted([...stats.editions]),
      page_range_statuses: stats.page_range_statuses
    }])),
    by_progression_group: Object.fromEntries(Object.entries(byProgressionGroup).map(([groupId, stats]) => [groupId, {
      candidates: stats.candidates,
      standard_codes: sorted([...stats.standard_codes]),
      grade_bands: sorted([...stats.grade_bands]),
      editions: sorted([...stats.editions])
    }])),
    summary: payload.summary || {}
  }
}

function buildEditionCoverage(index, subjectsFilter) {
  const selected = new Set(subjectsFilter)
  const bySubject = {}

  for (const record of index.records || []) {
    if (record.is_fragment || record.extension !== 'pdf') continue
    const band = BAND_BY_GRADE_LABEL[record.grade_label]
    if (!band) continue
    for (const mapping of record.standard_subject_mappings || []) {
      const subject = mapping.subject_slug
      if (selected.size && !selected.has(subject)) continue
      bySubject[subject] ||= {}
      const edition = record.edition || 'missing'
      bySubject[subject][edition] ||= {
        subject_slug: subject,
        edition,
        grade_bands: {},
        evidence_ids_by_grade_band: {},
        roles: {},
        textbook_subjects: {},
        volumes: {},
        files: []
      }
      const item = bySubject[subject][edition]
      countInto(item.grade_bands, band)
      item.evidence_ids_by_grade_band[band] ||= []
      item.evidence_ids_by_grade_band[band].push(record.evidence_id)
      countInto(item.roles, mapping.evidence_role)
      countInto(item.textbook_subjects, record.textbook_subject)
      countInto(item.volumes, record.volume)
      item.files.push({
        evidence_id: record.evidence_id,
        grade_band: band,
        grade_label: record.grade_label,
        edition: record.edition,
        volume: record.volume,
        textbook_subject: record.textbook_subject,
        evidence_role: mapping.evidence_role,
        file_name: record.file_name,
        repository_path: record.repository_path,
        evidence_url: record.evidence_url
      })
    }
  }

  return Object.fromEntries(Object.entries(bySubject)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subject, editions]) => [
      subject,
      Object.values(editions).map(finalizeEditionCoverage).sort(compareEditionCoverage)
    ]))
}

function finalizeEditionCoverage(item) {
  const completeGradeCoverage = TARGET_GRADE_BANDS.every(band => (item.grade_bands[band] || 0) > 0)
  const roleRanksByGrade = Object.fromEntries(TARGET_GRADE_BANDS.map(band => {
    const roles = item.files.filter(file => file.grade_band === band).map(file => ROLE_RANK[file.evidence_role] || 0)
    return [band, roles.length ? Math.max(...roles) : 0]
  }))
  const minRoleRank = Math.min(...Object.values(roleRanksByGrade))
  const coverageRole = minRoleRank >= 3
    ? 'direct_all_grades'
    : minRoleRank >= 2
      ? 'direct_or_discipline_all_grades'
      : completeGradeCoverage
        ? 'adjacent_included'
        : 'partial_grade_coverage'
  return {
    ...item,
    complete_grade_coverage: completeGradeCoverage,
    coverage_role: coverageRole,
    evidence_ids: sorted(item.files.map(file => file.evidence_id)),
    evidence_ids_by_grade_band: Object.fromEntries(TARGET_GRADE_BANDS.map(band => [
      band,
      sorted(item.evidence_ids_by_grade_band[band] || [])
    ])),
    files: item.files.sort((a, b) => TARGET_GRADE_BANDS.indexOf(a.grade_band) - TARGET_GRADE_BANDS.indexOf(b.grade_band) ||
      String(a.volume || '').localeCompare(String(b.volume || '')) ||
      a.evidence_id.localeCompare(b.evidence_id))
  }
}

function compareEditionCoverage(a, b) {
  if (a.complete_grade_coverage !== b.complete_grade_coverage) return a.complete_grade_coverage ? -1 : 1
  const roleScore = coverageScore(b) - coverageScore(a)
  if (roleScore) return roleScore
  const fileCount = b.files.length - a.files.length
  if (fileCount) return fileCount
  return a.edition.localeCompare(b.edition)
}

function coverageScore(item) {
  const roleScore = item.coverage_role === 'direct_all_grades' ? 30 :
    item.coverage_role === 'direct_or_discipline_all_grades' ? 20 :
      item.coverage_role === 'adjacent_included' ? 10 : 0
  return roleScore + TARGET_GRADE_BANDS.filter(band => (item.grade_bands[band] || 0) > 0).length
}

function commandPaths(subject, edition) {
  const key = `${subject}_${hashText(edition, 8)}`
  return {
    key,
    debugTextDir: `/tmp/textbook_debug_text_h4g_${key}`,
    unitIndex: `/tmp/textbook_unit_index_h4g_${key}.json`,
    unitSummary: `/tmp/textbook_unit_index_h4g_${key}.md`,
    unitAudit: `/tmp/textbook_unit_index_h4g_${key}_audit.json`,
    matches: `/tmp/textbook_unit_standard_matches_h4g_${key}.json`,
    matchesSummary: `/tmp/textbook_unit_standard_matches_h4g_${key}.md`,
    matchesAudit: `/tmp/textbook_unit_standard_matches_h4g_${key}_audit.json`,
    candidate: `/tmp/h4g_unit_evidence_candidate_${key}.json`,
    candidateSummary: `/tmp/h4g_unit_evidence_candidate_${key}.md`,
    candidateAudit: `/tmp/h4g_unit_evidence_candidate_${key}_audit.json`,
    consistencyAudit: `/tmp/h4g_unit_evidence_consistency_${key}.json`
  }
}

function buildCommands(subject, edition, evidenceIds) {
  const paths = commandPaths(subject, edition)
  const ids = evidenceIds.join(',')
  return {
    materialize_units: `npm run textbooks:unit-index -- --evidence-ids ${ids} --materialize --ocr-fallback --max-pages 18 --materialize-timeout-ms 60000 --download-timeout-ms 180000 --debug-text-dir ${paths.debugTextDir} --out ${paths.unitIndex} --summary-out ${paths.unitSummary}`,
    audit_units: `npm run textbooks:audit-unit-index -- --unit-index ${paths.unitIndex} --out ${paths.unitAudit} --strict --require-real-units`,
    match_units: `npm run textbooks:match-units -- --subjects ${subject} --unit-index ${paths.unitIndex} --out ${paths.matches} --summary-out ${paths.matchesSummary}`,
    audit_matches: `npm run textbooks:audit-unit-matches -- --matches ${paths.matches} --unit-index ${paths.unitIndex} --out ${paths.matchesAudit} --strict --require-matches --require-eligible`,
    build_candidates: `npm run textbooks:h4g-unit-candidates -- --matches ${paths.matches} --out ${paths.candidate} --summary-out ${paths.candidateSummary} --strict --require-candidates`,
    audit_candidates: `npm run textbooks:audit-h4g-unit-candidates -- --candidate ${paths.candidate} --out ${paths.candidateAudit} --strict --require-candidates --require-page-start`,
    audit_consistency_review_gate: `npm run textbooks:audit-h4g-unit-consistency -- --candidate ${paths.candidate} --out ${paths.consistencyAudit} --strict --require-candidates --require-page-start`
  }
}

function buildWorkItems(subjects, editionCoverage, candidateCoverage, args) {
  const items = []
  for (const [subject, stats] of Object.entries(subjects).sort(([a], [b]) => a.localeCompare(b))) {
    if (!stats.groups_needing_unit_evidence) continue
    const editions = (editionCoverage[subject] || []).filter(edition => edition.complete_grade_coverage)
    for (const edition of editions.slice(0, args.maxEditionsPerSubject)) {
      const evidenceIds = edition.evidence_ids
      items.push({
        work_item_id: `h4g_unit_work_${subject}_${hashText(edition.edition, 8)}`,
        subject,
        subject_label: stats.subject,
        edition: edition.edition,
        coverage_role: edition.coverage_role,
        grade_bands: edition.grade_bands,
        textbook_subjects: edition.textbook_subjects,
        volumes: edition.volumes,
        evidence_ids: evidenceIds,
        evidence_ids_by_grade_band: edition.evidence_ids_by_grade_band,
        target_groups_needing_unit_evidence: stats.groups_needing_unit_evidence,
        current_public_unit_level_records: stats.unit_level_records,
        current_candidate_progression_groups: candidateCoverage.by_subject[subject]?.progression_groups?.length || 0,
        purpose: 'materialize TOC unit evidence, match H4G standards, and build review-only unit evidence candidates',
        commands: buildCommands(subject, edition.edition, evidenceIds)
      })
    }
  }
  return items
}

function publicationStatus(subjectStats, editions, candidateSubject, minPublicationEditions) {
  const completeEditions = editions.filter(edition => edition.complete_grade_coverage).length
  const candidateEditions = candidateSubject?.editions?.length || 0
  if (!subjectStats.groups_needing_unit_evidence) return 'no_h4g_unit_evidence_gap'
  if (!completeEditions) return 'no_complete_textbook_edition_available'
  if (completeEditions < minPublicationEditions) return 'textbook_index_has_single_complete_edition'
  if (candidateEditions < minPublicationEditions) return 'needs_cross_version_candidate_evidence'
  return 'candidate_evidence_ready_for_publication_gate'
}

function summarize(subjects, editionCoverage, candidateCoverage, workItems, args) {
  const summary = {
    subjects: Object.keys(subjects).length,
    h4g_records: 0,
    progression_groups: 0,
    complete_triplets: 0,
    identical_complete_triplets: 0,
    groups_needing_unit_evidence: 0,
    public_unit_level_records: 0,
    recommended_work_items: workItems.length,
    subjects_with_publication_edition_capacity: 0,
    subjects_without_complete_textbook_edition: 0,
    by_subject: {}
  }

  for (const [subject, stats] of Object.entries(subjects).sort(([a], [b]) => a.localeCompare(b))) {
    const editions = editionCoverage[subject] || []
    const completeEditions = editions.filter(edition => edition.complete_grade_coverage)
    const candidateSubject = candidateCoverage.by_subject[subject]
    const status = publicationStatus(stats, editions, candidateSubject, args.minPublicationEditions)
    if (completeEditions.length >= args.minPublicationEditions) summary.subjects_with_publication_edition_capacity += 1
    if (!completeEditions.length) summary.subjects_without_complete_textbook_edition += 1
    summary.h4g_records += stats.h4g_records
    summary.progression_groups += stats.progression_groups
    summary.complete_triplets += stats.complete_triplets
    summary.identical_complete_triplets += stats.identical_complete_triplets
    summary.groups_needing_unit_evidence += stats.groups_needing_unit_evidence
    summary.public_unit_level_records += stats.unit_level_records
    summary.by_subject[subject] = {
      subject: stats.subject,
      h4g_records: stats.h4g_records,
      progression_groups: stats.progression_groups,
      complete_triplets: stats.complete_triplets,
      identical_complete_triplets: stats.identical_complete_triplets,
      groups_needing_unit_evidence: stats.groups_needing_unit_evidence,
      public_unit_level_records: stats.unit_level_records,
      complete_textbook_editions: completeEditions.length,
      candidate_standards: candidateSubject?.standard_codes?.length || 0,
      candidate_progression_groups: candidateSubject?.progression_groups?.length || 0,
      candidate_editions: candidateSubject?.editions?.length || 0,
      publication_status: status,
      recommended_editions: completeEditions.slice(0, args.maxEditionsPerSubject).map(edition => ({
        edition: edition.edition,
        coverage_role: edition.coverage_role,
        evidence_ids: edition.evidence_ids
      }))
    }
  }

  return summary
}

function markdownTable(rows, headers) {
  const escape = value => String(value ?? '').replace(/\|/g, '\\|')
  return [
    `| ${headers.map(header => escape(header.label)).join(' | ')} |`,
    `| ${headers.map(header => header.align === 'right' ? '---:' : '---').join(' | ')} |`,
    ...rows.map(row => `| ${headers.map(header => escape(row[header.key])).join(' | ')} |`)
  ].join('\n')
}

function markdownSummary(result) {
  const subjectRows = Object.entries(result.summary.by_subject).map(([subject, stats]) => ({
    subject: `${stats.subject} (${subject})`,
    h4g: stats.h4g_records,
    groups: stats.progression_groups,
    needs: stats.groups_needing_unit_evidence,
    publicUnits: stats.public_unit_level_records,
    completeEditions: stats.complete_textbook_editions,
    candidateGroups: stats.candidate_progression_groups,
    status: stats.publication_status
  }))
  const workRows = result.recommended_work_items.map(item => ({
    id: item.work_item_id,
    subject: `${item.subject_label} (${item.subject})`,
    edition: item.edition,
    role: item.coverage_role,
    files: item.evidence_ids.length,
    groups: item.target_groups_needing_unit_evidence
  }))
  const firstCommands = result.recommended_work_items.slice(0, 3).map(item => `### ${item.subject_label} / ${item.edition}

\`\`\`bash
${Object.values(item.commands).join('\n')}
\`\`\`
`).join('\n')

  return `# H4G 单元证据工作清单

生成时间：${result.generated_at}

该文件是只读计划，不写 \`public/data\`。它把当前 H4G 待分化组、已有候选证据和 ChinaTextbook 教材版本覆盖合并成下一批可执行工作单。

## 总览

| 指标 | 数量 |
| --- | ---: |
| H4G records | ${result.summary.h4g_records} |
| progression groups | ${result.summary.progression_groups} |
| complete triplets | ${result.summary.complete_triplets} |
| identical complete triplets | ${result.summary.identical_complete_triplets} |
| groups needing unit evidence | ${result.summary.groups_needing_unit_evidence} |
| public unit-level records | ${result.summary.public_unit_level_records} |
| recommended work items | ${result.summary.recommended_work_items} |

## 学科状态

${markdownTable(subjectRows, [
  { key: 'subject', label: 'subject' },
  { key: 'h4g', label: 'H4G records', align: 'right' },
  { key: 'groups', label: 'groups', align: 'right' },
  { key: 'needs', label: 'needs unit evidence', align: 'right' },
  { key: 'publicUnits', label: 'public unit records', align: 'right' },
  { key: 'completeEditions', label: 'complete editions', align: 'right' },
  { key: 'candidateGroups', label: 'candidate groups', align: 'right' },
  { key: 'status', label: 'status' }
])}

## 推荐工作项

${workRows.length ? markdownTable(workRows, [
  { key: 'id', label: 'work item' },
  { key: 'subject', label: 'subject' },
  { key: 'edition', label: 'edition' },
  { key: 'role', label: 'coverage role' },
  { key: 'files', label: 'files', align: 'right' },
  { key: 'groups', label: 'target groups', align: 'right' }
]) : '当前没有可生成的工作项。'}

## 前三项命令

${firstCommands || '无'}

## 发布级门槛

单批 work item 只用于生成 review pack。正式发布前仍需把同一学科的候选证据汇总后运行：

\`\`\`bash
npm run textbooks:audit-h4g-unit-consistency -- --strict --require-candidates --require-page-start --fail-on-nonmonotonic-pages --min-editions-per-standard ${result.requirements.min_publication_editions} --min-editions-per-progression-group ${result.requirements.min_publication_editions} --require-complete-progression-groups
\`\`\`
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const warnings = []
  if (!existsSync(args.textbookIndex)) errors.push(`Missing textbook index: ${args.textbookIndex}`)
  if (!existsSync(join(args.dataRoot, 'by_subject'))) errors.push(`Missing data root by_subject: ${args.dataRoot}`)

  const index = errors.length ? { records: [], source_commit: null } : readJson(args.textbookIndex)
  const h4g = loadH4GStandards(args.dataRoot, args.subjects)
  errors.push(...h4g.errors)
  const unitIndex = loadUnitIndexSummary(args.unitIndex)
  const candidateCoverage = loadCandidateCoverage(args.candidate)
  if (!candidateCoverage.exists) warnings.push(`No candidate pack found at ${args.candidate}; candidate coverage is treated as 0`)

  const editionCoverage = buildEditionCoverage(index, args.subjects)
  const workItems = buildWorkItems(h4g.subjects, editionCoverage, candidateCoverage, args)
  if (!workItems.length) {
    warnings.push('No recommended work items were generated')
    if (args.requireWorkItems) errors.push('requireWorkItems is set but no work items were generated')
  }

  const result = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    data_root: args.dataRoot,
    textbook_index: args.textbookIndex,
    textbook_source_commit: index.source_commit || index.summary?.source_commit || null,
    unit_index: unitIndex,
    candidate_coverage: candidateCoverage,
    requirements: {
      target_grade_bands: TARGET_GRADE_BANDS,
      max_editions_per_subject: args.maxEditionsPerSubject,
      min_publication_editions: args.minPublicationEditions
    },
    summary: summarize(h4g.subjects, editionCoverage, candidateCoverage, workItems, args),
    edition_coverage: Object.fromEntries(Object.entries(editionCoverage).map(([subject, editions]) => [
      subject,
      editions.map(edition => ({
        subject_slug: edition.subject_slug,
        edition: edition.edition,
        complete_grade_coverage: edition.complete_grade_coverage,
        coverage_role: edition.coverage_role,
        grade_bands: edition.grade_bands,
        evidence_ids: edition.evidence_ids,
        evidence_ids_by_grade_band: edition.evidence_ids_by_grade_band,
        textbook_subjects: edition.textbook_subjects,
        volumes: edition.volumes
      }))
    ])),
    progression_groups_needing_unit_evidence: h4g.groups.filter(group => group.group_needs_unit_evidence),
    recommended_work_items: workItems,
    errors,
    warnings
  }

  if (args.out) writeJson(args.out, result)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(result))
  console.log(JSON.stringify(result, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
