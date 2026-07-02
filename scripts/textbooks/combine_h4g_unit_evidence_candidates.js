#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_candidate_combined.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_candidate_combined_summary.md'
const OFFICIAL_STANDARD_FIELDS = [
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
    candidates: [],
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireCandidates: false,
    requirePageStart: false,
    excludePageStatuses: []
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidates.push(argv[++i])
    else if (item === '--candidates') args.candidates.push(...splitArg(argv[++i]))
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-candidates') args.requireCandidates = true
    else if (item === '--require-page-start') args.requirePageStart = true
    else if (item === '--exclude-page-statuses') args.excludePageStatuses = splitArg(argv[++i])
    else if (item === '--publication-page-gate') {
      args.requirePageStart = true
      args.excludePageStatuses = uniqueSorted([...args.excludePageStatuses, 'toc_page_nonmonotonic'])
    }
    else if (item === '--help') args.help = true
  }
  args.candidates = [...new Set(args.candidates.filter(Boolean))]
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/combine_h4g_unit_evidence_candidates.js \\
  --candidates generated/textbook_evidence/h4g_runs/math_renjiao_smoke/h4g_unit_evidence_candidate.json,generated/textbook_evidence/h4g_runs/math_jijiao_smoke/h4g_unit_evidence_candidate.json \\
  --strict --require-candidates --require-page-start

Combines reviewable H4G unit-evidence candidate packs by standard_code so one
candidate can carry unit evidence from multiple textbook editions. The output
is still a pre-publication candidate pack and never writes public/data. Use
--publication-page-gate to exclude nonmonotonic TOC page evidence while keeping
only candidates that still have page-start-backed units.`)
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

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function candidateEditions(candidate) {
  return uniqueSorted((candidate.unit_evidence || []).map(unit => unit.edition))
}

function hasPositivePageStart(value) {
  return Number.isInteger(Number(value)) && Number(value) >= 1
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function unitSort(a, b) {
  const edition = String(a.edition || '').localeCompare(String(b.edition || ''))
  if (edition !== 0) return edition
  const textbook = String(a.textbook_evidence_id || '').localeCompare(String(b.textbook_evidence_id || ''))
  if (textbook !== 0) return textbook
  const page = (Number(a.page_start) || Number.MAX_SAFE_INTEGER) - (Number(b.page_start) || Number.MAX_SAFE_INTEGER)
  if (page !== 0) return page
  return String(a.unit_title || '').localeCompare(String(b.unit_title || ''))
}

function dedupeUnits(items, warnings, standardCode) {
  const byId = new Map()
  for (const item of items) {
    const unit = item.unit
    const id = unit.unit_evidence_id
    if (!id) {
      warnings.push(`${standardCode} has unit evidence without unit_evidence_id from ${item.source}`)
      continue
    }
    if (byId.has(id)) {
      warnings.push(`${standardCode} duplicate unit_evidence_id ${id}; keeping the first occurrence`)
      continue
    }
    byId.set(id, clone(unit))
  }
  return [...byId.values()].sort(unitSort)
}

function filterUnitItems(items, args, stats, warnings, standardCode) {
  const excludedStatuses = new Set(args.excludePageStatuses || [])
  const out = []
  for (const item of items) {
    const unit = item.unit || {}
    if (excludedStatuses.has(unit.page_range_status || 'missing')) {
      stats.excluded_unit_evidence_objects += 1
      countInto(stats.excluded_by_page_range_status, unit.page_range_status || 'missing')
      continue
    }
    out.push(item)
  }
  if (items.length && !out.length) {
    warnings.push(`${standardCode} has no unit evidence after page-status filters`)
  }
  return out
}

function assertCompatible(base, incoming, source, errors) {
  const code = base.standard_code || incoming.standard_code || '(missing standard_code)'
  for (const field of ['standard_code', 'subject_slug', 'grade_band', 'grade_level', 'grade']) {
    if (normalizeText(base[field]) !== normalizeText(incoming[field])) {
      errors.push(`${code} incompatible ${field} in ${source}`)
    }
  }
  for (const field of OFFICIAL_STANDARD_FIELDS) {
    const left = normalizeText(base.official_standard_fields?.[field])
    const right = normalizeText(incoming.official_standard_fields?.[field])
    if (left !== right) errors.push(`${code} official_standard_fields.${field} differs in ${source}`)
  }
}

function proposedFocus(candidate, units) {
  const editions = uniqueSorted(units.map(unit => unit.edition))
  const unitLabels = units
    .slice()
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 4)
    .map(unit => `${unit.edition || '未知版本'}《${unit.unit_title || '未命名单元'}》`)
    .join('、')
  return `候选：基于${editions.length}个教材版本（${editions.join('、')}）的单元证据${unitLabels}补充${candidate.grade || candidate.grade_band}学习重点；课标原文保持不变。`
}

function proposedProgressionDelta(units) {
  const editions = uniqueSorted(units.map(unit => unit.edition)).join('、')
  const titles = units
    .slice()
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 6)
    .map(unit => `${unit.edition || '未知版本'}:${unit.unit_title || '未命名单元'}`)
    .join('；')
  return `unit_evidence_candidate:multi_edition:${editions}:${titles}`
}

function mergeGroup(rows, args, errors, warnings, filterStats) {
  const base = clone(rows[0].candidate)
  for (const row of rows.slice(1)) assertCompatible(base, row.candidate, row.source, errors)

  const unitItems = rows.flatMap(row => (row.candidate.unit_evidence || []).map(unit => ({
    unit,
    source: row.source
  })))
  const filteredUnitItems = filterUnitItems(unitItems, args, filterStats, warnings, base.standard_code)
  const units = dedupeUnits(filteredUnitItems, warnings, base.standard_code)
  if (!units.length) return null

  if (args.requirePageStart) {
    for (const unit of units) {
      if (!hasPositivePageStart(unit.page_start)) {
        errors.push(`${base.standard_code}/${unit.unit_evidence_id || 'missing'} missing positive page_start`)
      }
    }
  }

  const unitIds = units.map(unit => unit.unit_evidence_id)
  const sourceCandidateIds = uniqueSorted(rows.map(row => row.candidate.candidate_id))
  const sourceFiles = uniqueSorted(rows.map(row => row.source))
  const confidences = rows.map(row => row.candidate.proposed_update?.progression_confidence).filter(value => typeof value === 'number')
  const maxConfidence = confidences.length ? Math.max(...confidences) : 0.5

  return {
    ...base,
    candidate_id: `h4g_unit_multi_${hashText(`${base.standard_code}|${unitIds.join('|')}`)}`,
    source_candidate_ids: sourceCandidateIds,
    source_candidate_files: sourceFiles,
    proposed_update: {
      ...(base.proposed_update || {}),
      textbook_unit_evidence_ids: unitIds,
      evidence_granularity: 'textbook_unit_level',
      grade_assignment_type: 'shared_requirement_textbook_unit_supported',
      progression_basis: 'shared_standard_textbook_unit_sequence',
      progression_confidence: Number(Math.min(0.76, Math.max(0.5, maxConfidence)).toFixed(3)),
      requires_unit_level_evidence: false,
      review_status: 'unit_evidence_candidate_needs_review',
      grade_specific_focus: proposedFocus(base, units),
      progression_delta: proposedProgressionDelta(units)
    },
    unit_evidence: units,
    safety: {
      ...(base.safety || {}),
      writes_public_data: false,
      official_standard_text_changed: false,
      requires_manual_review: true,
      eligible_gate: `${base.safety?.eligible_gate || 'eligible H4G unit evidence'}; combined across ${sourceFiles.length} candidate source(s)`
    }
  }
}

function markdownCell(value) {
  return normalizeText(value).replace(/\|/g, '\\|')
}

function markdownSummary(payload) {
  const sourceRows = payload.sources
    .map(source => `| ${markdownCell(source.path)} | ${source.valid} | ${source.candidates} | ${source.unit_evidence_objects} |`)
    .join('\n') || '| - | - | 0 | 0 |'
  const editionRows = Object.entries(payload.summary.by_edition)
    .map(([edition, count]) => `| ${markdownCell(edition)} | ${count} |`)
    .join('\n') || '| - | 0 |'
  const candidateRows = payload.candidates
    .map(candidate => {
      const editions = uniqueSorted(candidate.unit_evidence.map(unit => unit.edition)).join('；')
      return `| ${candidate.standard_code} | ${candidate.grade_band} | ${markdownCell(editions)} | ${candidate.unit_evidence.length} | ${candidate.source_candidate_ids?.length || 0} |`
    })
    .join('\n') || '| - | - | - | 0 | 0 |'

  return `# H4G Unit Evidence Combined Candidate Summary

生成时间：${payload.generated_at}

## 输入候选包

| file | valid | candidates | unit evidence |
| --- | --- | ---: | ---: |
${sourceRows}

## 摘要

| 指标 | 数量 |
| --- | ---: |
| source files | ${payload.summary.source_files} |
| input candidates | ${payload.summary.input_candidates} |
| input unit evidence | ${payload.summary.input_unit_evidence_objects} |
| merged candidates | ${payload.summary.merged_candidates} |
| multi-source standards | ${payload.summary.multi_source_standards} |
| single-source standards | ${payload.summary.single_source_standards} |
| multi-edition standards | ${payload.summary.multi_edition_standards} |
| single-edition standards | ${payload.summary.single_edition_standards} |
| unit evidence objects | ${payload.summary.unit_evidence_objects} |
| excluded unit evidence | ${payload.summary.excluded_unit_evidence_objects} |
| standards skipped after filters | ${payload.summary.standards_skipped_after_filters} |
| page_start records | ${payload.summary.page_start_records} |

## 版本分布

| edition | unit evidence |
| --- | ---: |
${editionRows}

## 合并候选

| standard_code | grade_band | editions | unit evidence | source candidates |
| --- | --- | --- | ---: | ---: |
${candidateRows}

## 边界

- 该文件仍是写回前候选包，不修改 \`public/data\`。
- 合并只按 \`standard_code\` 汇总不同教材版本证据，课标原文保持不变。
- 正式写入前仍需通过 candidate audit、consistency audit 与人工复核。
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
  if (!args.candidates.length) errors.push('Use --candidate or --candidates with at least one candidate pack.')
  for (const file of args.candidates) {
    if (!existsSync(file)) errors.push(`Missing candidate file: ${file}`)
  }

  const sources = []
  const groups = new Map()
  if (!errors.length) {
    for (const file of args.candidates) {
      const payload = readJson(file)
      if (payload.valid === false) errors.push(`${file} is marked valid=false`)
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
      if (!Array.isArray(payload.candidates)) errors.push(`${file} missing candidates array`)
      sources.push({
        path: file,
        valid: payload.valid !== false,
        generated_at: payload.generated_at || '',
        match_source_commit: payload.match_source_commit || null,
        candidates: candidates.length,
        unit_evidence_objects: candidates.reduce((sum, candidate) => sum + (candidate.unit_evidence || []).length, 0)
      })
      for (const candidate of candidates) {
        const code = candidate.standard_code
        if (!code) {
          errors.push(`${file} contains candidate without standard_code`)
          continue
        }
        if (!groups.has(code)) groups.set(code, [])
        groups.get(code).push({ candidate, source: file })
      }
    }
  }

  const candidates = []
  const filterStats = {
    excluded_unit_evidence_objects: 0,
    excluded_by_page_range_status: {}
  }
  for (const [code, rows] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const candidate = mergeGroup(rows, args, errors, warnings, filterStats)
    if (candidate) candidates.push(candidate)
  }

  const summary = {
    source_files: sources.length,
    input_candidates: sources.reduce((sum, source) => sum + source.candidates, 0),
    input_unit_evidence_objects: sources.reduce((sum, source) => sum + source.unit_evidence_objects, 0),
    merged_candidates: candidates.length,
    standards_skipped_after_filters: groups.size - candidates.length,
    multi_source_standards: candidates.filter(candidate => (candidate.source_candidate_files || []).length > 1).length,
    single_source_standards: candidates.filter(candidate => (candidate.source_candidate_files || []).length === 1).length,
    multi_edition_standards: candidates.filter(candidate => candidateEditions(candidate).length > 1).length,
    single_edition_standards: candidates.filter(candidate => candidateEditions(candidate).length === 1).length,
    unit_evidence_objects: candidates.reduce((sum, candidate) => sum + candidate.unit_evidence.length, 0),
    excluded_unit_evidence_objects: filterStats.excluded_unit_evidence_objects,
    page_start_records: candidates.reduce((sum, candidate) => sum + candidate.unit_evidence.filter(unit => hasPositivePageStart(unit.page_start)).length, 0),
    by_subject: {},
    by_grade_band: {},
    by_edition: {},
    by_page_range_status: {},
    excluded_by_page_range_status: filterStats.excluded_by_page_range_status
  }
  for (const candidate of candidates) {
    countInto(summary.by_subject, candidate.subject_slug)
    countInto(summary.by_grade_band, candidate.grade_band)
    for (const unit of candidate.unit_evidence || []) {
      countInto(summary.by_edition, unit.edition)
      countInto(summary.by_page_range_status, unit.page_range_status)
    }
  }
  if (args.requireCandidates && !candidates.length) errors.push('requireCandidates is set but no candidates were produced')

  const matchSourceCommits = uniqueSorted(sources.map(source => source.match_source_commit))
  const payload = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    sources,
    match_source_commit: matchSourceCommits.length === 1 ? matchSourceCommits[0] : null,
    match_source_commits: matchSourceCommits,
    policy: {
      writes_public_data: false,
      only_eligible_matches: true,
      official_standard_text_changed: false,
      combined_candidate_sources: true,
      require_page_start: args.requirePageStart,
      exclude_page_statuses: args.excludePageStatuses
    },
    summary,
    candidates,
    warnings,
    errors
  }

  writeJson(args.out, payload)
  if (args.summaryOut) {
    mkdirSync(dirname(args.summaryOut), { recursive: true })
    writeFileSync(args.summaryOut, markdownSummary(payload))
  }
  console.log(JSON.stringify({
    valid: payload.valid,
    wrote: args.out,
    summary_out: args.summaryOut || null,
    ...summary,
    warnings: warnings.length,
    errors: errors.length
  }, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
