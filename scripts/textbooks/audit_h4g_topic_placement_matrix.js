#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_SUBJECT = 'math'
const DEFAULT_UNIT_INDEXES = [
  'generated/textbook_evidence/h4g_runs/math_renjiao_alignment_alias/textbook_unit_index.json',
  'generated/textbook_evidence/h4g_runs/math_jijiao_page_order_fix/textbook_unit_index.json',
  'generated/textbook_evidence/h4g_runs/math_huadong_page_order_fix/textbook_unit_index.json'
]
const DEFAULT_REVERSE_GAPS = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_reverse_lookup_gaps.json'
const DEFAULT_ALIGNMENT_ALIASES = 'scripts/textbooks/textbook_unit_alignment_aliases.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_topic_placement_matrix.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_topic_placement_matrix.md'
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])
const GENERIC_ANCHORS = new Set([
  '图形',
  '位置',
  '运动',
  '性质',
  '应用',
  '综合表现',
  '图形与几何综合表现',
  '课程目标',
  '第四学段目标',
  '水平四内容结构'
])

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    subject: DEFAULT_SUBJECT,
    unitIndexes: DEFAULT_UNIT_INDEXES,
    reverseGaps: DEFAULT_REVERSE_GAPS,
    alignmentAliases: DEFAULT_ALIGNMENT_ALIASES,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireHits: false,
    maxUnitsPerEditionGrade: 6,
    maxRows: 80
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--subject') args.subject = argv[++i]
    else if (item === '--unit-indexes') args.unitIndexes = splitArg(argv[++i])
    else if (item === '--reverse-gaps') args.reverseGaps = argv[++i]
    else if (item === '--alignment-aliases') args.alignmentAliases = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--max-units-per-edition-grade') args.maxUnitsPerEditionGrade = positiveInteger(argv[++i], args.maxUnitsPerEditionGrade)
    else if (item === '--max-rows') args.maxRows = positiveInteger(argv[++i], args.maxRows)
    else if (item === '--strict') args.strict = true
    else if (item === '--require-hits') args.requireHits = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_topic_placement_matrix.js \\
  --subject math \\
  --unit-indexes generated/textbook_evidence/h4g_runs/math_renjiao_alignment_alias/textbook_unit_index.json,generated/textbook_evidence/h4g_runs/math_jijiao_page_order_fix/textbook_unit_index.json,generated/textbook_evidence/h4g_runs/math_huadong_page_order_fix/textbook_unit_index.json

Builds a read-only H4G topic placement matrix. It scans textbook unit titles
across grade 7/8/9 and editions to show where each progression-group topic is
placed. Cross-grade hits are diagnostics only; they must not be treated as
same-grade standard evidence.`)
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
  if (!path || !existsSync(path)) return null
  return readJson(path)
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

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function compactText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[，。！？；：、“”‘’（）《》【】]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
    .trim()
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadStandards(args) {
  const standards = []
  for (const file of subjectFiles(args.dataRoot)) {
    const subjectSlug = basename(file, '.json')
    if (args.subject && subjectSlug !== args.subject) continue
    const payload = readJson(file)
    for (const row of payload.standards || []) {
      if (!TARGET_GRADE_BANDS.has(row.grade_band)) continue
      standards.push(row)
    }
  }
  return standards
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

function loadUnits(paths, errors, warnings) {
  const units = []
  for (const path of paths) {
    if (!existsSync(path)) {
      errors.push(`Missing unit index: ${path}`)
      continue
    }
    const payload = readJson(path)
    const rows = (payload.unit_candidates || [])
      .filter(unit => unit.candidate_type === 'toc_unit_or_chapter')
      .map(unit => ({
        ...unit,
        grade_band: gradeBandForUnit(unit),
        unit_index_file: path
      }))
      .filter(unit => TARGET_GRADE_BANDS.has(unit.grade_band))
    if (!rows.length) warnings.push(`${path} has no H4G toc_unit_or_chapter rows`)
    units.push(...rows)
  }
  return units
}

function loadAliasTerms(path) {
  const payload = readOptionalJson(path)
  const byCode = new Map()
  for (const row of payload?.aliases || []) {
    const code = String(row.standard_code || '').trim()
    if (!code) continue
    byCode.set(code, [
      ...(byCode.get(code) || []),
      ...(row.terms || []).map(term => ({
        term: String(term || '').trim(),
        source: 'reviewed_alignment_alias'
      }))
    ])
  }
  return byCode
}

function subdomainAnchors(value) {
  const raw = String(value || '').replace(/\s+/g, '')
  if (!raw || GENERIC_ANCHORS.has(raw)) return []
  const chunks = raw
    .split(/[与和及、，,\/（）()的]/u)
    .map(item => item.trim())
    .filter(item => item.length >= 2)
    .filter(item => !GENERIC_ANCHORS.has(item))
  return sorted(chunks.length ? chunks : [raw])
}

function standardTopicTerms(standard, aliasTermsByCode) {
  const terms = []
  const rawSubdomain = String(standard.subdomain || '')
  for (const anchor of subdomainAnchors(standard.subdomain)) {
    terms.push({ term: anchor, source: 'subdomain_anchor' })
  }
  for (const alias of aliasTermsByCode.get(standard.code) || []) {
    if (alias.term) terms.push(alias)
  }
  if (rawSubdomain.includes('坐标')) terms.push({ term: '平面直角坐标系', source: 'subdomain_support_term' })
  if (rawSubdomain.includes('投影') || rawSubdomain.includes('视图')) {
    terms.push({ term: '投影', source: 'subdomain_support_term' })
    terms.push({ term: '视图', source: 'subdomain_support_term' })
    terms.push({ term: '三视图', source: 'subdomain_support_term' })
  }
  if (rawSubdomain.includes('命题') || rawSubdomain.includes('定理') || rawSubdomain.includes('证明')) {
    terms.push({ term: '命题', source: 'subdomain_support_term' })
    terms.push({ term: '定理', source: 'subdomain_support_term' })
    terms.push({ term: '证明', source: 'subdomain_support_term' })
  }
  if (rawSubdomain.includes('相似')) terms.push({ term: '相似', source: 'subdomain_support_term' })
  if (rawSubdomain.includes('锐角三角函数')) terms.push({ term: '三角函数', source: 'subdomain_support_term' })
  if (rawSubdomain.includes('不等式')) {
    terms.push({ term: '一元一次不等式', source: 'subdomain_support_term' })
    terms.push({ term: '不等式组', source: 'subdomain_support_term' })
  }
  const seen = new Set()
  return terms
    .map(row => ({ ...row, compact: compactText(row.term) }))
    .filter(row => row.compact.length >= 2 && !GENERIC_ANCHORS.has(row.compact))
    .filter(row => {
      const key = row.compact
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function matchUnit(standard, unit, terms) {
  const unitTitle = compactText(unit.unit_title)
  const matched = terms.filter(row => unitTitle.includes(row.compact))
  if (!matched.length) return null
  const directSubdomain = matched.some(row => row.source === 'subdomain_anchor')
  const reviewedAlias = matched.some(row => row.source === 'reviewed_alignment_alias')
  const supportTerm = matched.some(row => row.source === 'subdomain_support_term' && row.compact.length >= 3)
  const confidence = directSubdomain || reviewedAlias
    ? 'high'
    : supportTerm
      ? 'medium'
      : 'low'
  return {
    unit_evidence_id: unit.unit_evidence_id,
    textbook_evidence_id: unit.textbook_evidence_id,
    unit_title: unit.unit_title,
    edition: unit.edition,
    volume: unit.volume,
    unit_grade_band: unit.grade_band,
    standard_grade_band: standard.grade_band,
    grade_relation: unit.grade_band === standard.grade_band ? 'same_grade' : 'cross_grade',
    page_start: unit.page_start ?? null,
    page_range: unit.page_range || '',
    page_range_status: unit.page_range_status || '',
    confidence,
    matched_terms: matched.map(row => ({
      term: row.term,
      source: row.source
    }))
  }
}

function unitSort(a, b) {
  const relation = a.grade_relation.localeCompare(b.grade_relation)
  if (relation) return relation
  const confidenceOrder = { high: 0, medium: 1, low: 2 }
  const confidence = (confidenceOrder[a.confidence] ?? 9) - (confidenceOrder[b.confidence] ?? 9)
  if (confidence) return confidence
  const grade = String(a.unit_grade_band || '').localeCompare(String(b.unit_grade_band || ''))
  if (grade) return grade
  const page = (Number(a.page_start) || Number.MAX_SAFE_INTEGER) - (Number(b.page_start) || Number.MAX_SAFE_INTEGER)
  if (page) return page
  return String(a.unit_title || '').localeCompare(String(b.unit_title || ''))
}

function limitByEditionGrade(matches, maxRows) {
  const groups = new Map()
  for (const match of matches.slice().sort(unitSort)) {
    const key = `${match.edition}|${match.unit_grade_band}`
    if (!groups.has(key)) groups.set(key, [])
    if (groups.get(key).length < maxRows) groups.get(key).push(match)
  }
  return [...groups.values()].flat().sort(unitSort)
}

function standardMatches(standard, units, terms, maxRows) {
  const matches = []
  for (const unit of units) {
    if (unit.subject_slug !== standard.subject_slug) continue
    const match = matchUnit(standard, unit, terms)
    if (match) matches.push(match)
  }
  return limitByEditionGrade(matches, maxRows)
}

function existingGapLookup(path) {
  const payload = readOptionalJson(path)
  const lookup = new Map()
  for (const gap of payload?.standard_gaps || []) {
    lookup.set(gap.standard_code, gap)
  }
  return lookup
}

function gradePlacement(matches) {
  const out = {}
  for (const match of matches || []) {
    const edition = match.edition || 'missing'
    out[edition] ||= {}
    out[edition][match.unit_grade_band] ||= []
    out[edition][match.unit_grade_band].push({
      unit_title: match.unit_title,
      page_range: match.page_range,
      page_range_status: match.page_range_status,
      confidence: match.confidence,
      matched_terms: sorted((match.matched_terms || []).map(row => row.term))
    })
  }
  return out
}

function classifyPlacement(standard, matches, gap) {
  const sameGradeEditions = sorted(matches.filter(match => match.grade_relation === 'same_grade').map(match => match.edition))
  const crossGradeEditions = sorted(matches.filter(match => match.grade_relation === 'cross_grade').map(match => match.edition))
  const missingEditionCrossGradeHits = []
  for (const edition of gap?.missing_editions || []) {
    const hits = matches.filter(match => match.edition === edition && match.grade_relation === 'cross_grade')
    if (hits.length) missingEditionCrossGradeHits.push(edition)
  }
  if (sameGradeEditions.length && crossGradeEditions.length) return 'mixed_same_and_cross_grade'
  if (sameGradeEditions.length) return 'same_grade_topic_present'
  if (crossGradeEditions.length) return 'cross_grade_topic_present_only'
  return 'no_topic_title_hit'
}

function buildReport(args) {
  const errors = []
  const warnings = []
  if (!existsSync(join(args.dataRoot, 'by_subject'))) errors.push(`Missing data root by_subject: ${args.dataRoot}`)
  const standards = errors.length ? [] : loadStandards(args)
  const units = loadUnits(args.unitIndexes, errors, warnings)
  const aliasTermsByCode = loadAliasTerms(args.alignmentAliases)
  const gapByCode = existingGapLookup(args.reverseGaps)
  const byProgressionGroup = new Map()
  const standardRows = []
  const summary = {
    subject: args.subject,
    standards_evaluated: standards.length,
    unit_candidates_scanned: units.length,
    standards_with_topic_hits: 0,
    standards_with_same_grade_hits: 0,
    standards_with_cross_grade_hits: 0,
    standards_with_cross_grade_only_hits: 0,
    standards_in_reverse_gap_report: 0,
    reverse_gap_standards_with_cross_grade_missing_edition_hits: 0,
    by_placement_status: {},
    by_grade_band: {},
    by_missing_edition_action_hint: {}
  }

  for (const standard of standards) {
    const terms = standardTopicTerms(standard, aliasTermsByCode)
    const matches = standardMatches(standard, units, terms, args.maxUnitsPerEditionGrade)
    const sameGradeMatches = matches.filter(match => match.grade_relation === 'same_grade')
    const crossGradeMatches = matches.filter(match => match.grade_relation === 'cross_grade')
    const gap = gapByCode.get(standard.code) || null
    const placementStatus = classifyPlacement(standard, matches, gap)
    const missingEditionCrossGradeHits = sorted((gap?.missing_editions || [])
      .filter(edition => crossGradeMatches.some(match => match.edition === edition)))
    const actionHint = gap && missingEditionCrossGradeHits.length
      ? 'review_cross_grade_placement'
      : gap
        ? 'continue_existing_gap_action'
        : 'not_in_reverse_gap_report'

    if (matches.length) summary.standards_with_topic_hits += 1
    if (sameGradeMatches.length) summary.standards_with_same_grade_hits += 1
    if (crossGradeMatches.length) summary.standards_with_cross_grade_hits += 1
    if (!sameGradeMatches.length && crossGradeMatches.length) summary.standards_with_cross_grade_only_hits += 1
    if (gap) summary.standards_in_reverse_gap_report += 1
    if (missingEditionCrossGradeHits.length) summary.reverse_gap_standards_with_cross_grade_missing_edition_hits += 1
    countInto(summary.by_placement_status, placementStatus)
    countInto(summary.by_grade_band, standard.grade_band)
    countInto(summary.by_missing_edition_action_hint, actionHint)

    const row = {
      standard_code: standard.code,
      subject_slug: standard.subject_slug,
      grade_band: standard.grade_band,
      progression_group_id: standard.progression_group_id || '',
      subdomain: standard.subdomain || '',
      topic_terms: terms.map(row => ({ term: row.term, source: row.source })),
      placement_status: placementStatus,
      reverse_gap_status: gap ? {
        current_editions: gap.current_editions || [],
        missing_editions: gap.missing_editions || [],
        missing_edition_actions: gap.missing_edition_actions || []
      } : null,
      missing_edition_cross_grade_hits: missingEditionCrossGradeHits,
      action_hint: actionHint,
      same_grade_matches: sameGradeMatches,
      cross_grade_matches: crossGradeMatches,
      placement_by_edition: gradePlacement(matches)
    }
    standardRows.push(row)
    if (standard.progression_group_id) {
      if (!byProgressionGroup.has(standard.progression_group_id)) byProgressionGroup.set(standard.progression_group_id, [])
      byProgressionGroup.get(standard.progression_group_id).push(row)
    }
  }

  const progressionGroups = [...byProgressionGroup.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([progressionGroupId, rows]) => {
      const placementByEdition = {}
      for (const row of rows) {
        for (const match of [...row.same_grade_matches, ...row.cross_grade_matches]) {
          placementByEdition[match.edition] ||= {}
          placementByEdition[match.edition][match.unit_grade_band] ||= new Set()
          placementByEdition[match.edition][match.unit_grade_band].add(row.standard_code)
        }
      }
      const matrix = Object.fromEntries(Object.entries(placementByEdition)
        .map(([edition, grades]) => [
          edition,
          Object.fromEntries(Object.entries(grades)
            .map(([grade, codes]) => [grade, sorted([...codes])])
            .sort(([a], [b]) => a.localeCompare(b)))
        ])
        .sort(([a], [b]) => a.localeCompare(b)))
      const statuses = sorted(rows.map(row => row.placement_status))
      return {
        progression_group_id: progressionGroupId,
        subject_slug: args.subject,
        standard_codes: rows.map(row => row.standard_code),
        grade_bands: rows.map(row => row.grade_band),
        subdomains: sorted(rows.map(row => row.subdomain)),
        placement_statuses: statuses,
        placement_by_edition: matrix,
        action_hints: sorted(rows.map(row => row.action_hint))
      }
    })

  if (args.requireHits && !summary.standards_with_topic_hits) errors.push('requireHits is set but no topic placement hits were found')
  return {
    generated_at: new Date().toISOString(),
    valid: errors.length === 0,
    data_root: args.dataRoot,
    subject: args.subject,
    unit_indexes: args.unitIndexes,
    reverse_gaps: existsSync(args.reverseGaps) ? args.reverseGaps : null,
    alignment_aliases: existsSync(args.alignmentAliases) ? args.alignmentAliases : null,
    policy: {
      target_grade_bands: [...TARGET_GRADE_BANDS],
      same_grade_required_for_standard_evidence: true,
      cross_grade_hits_are_diagnostic_only: true,
      max_units_per_edition_grade: args.maxUnitsPerEditionGrade
    },
    summary,
    standard_placements: standardRows,
    progression_group_placements: progressionGroups,
    errors,
    warnings
  }
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function unitLabel(unit) {
  const page = unit.page_range ? ` p.${unit.page_range}` : ''
  const terms = sorted((unit.matched_terms || []).map(row => row.term)).slice(0, 5).join('、')
  return `${unit.unit_grade_band}:${unit.unit_title}${page}${terms ? ` (${terms})` : ''}`
}

function markdownSummary(report, args) {
  const statusRows = Object.entries(report.summary.by_placement_status)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `| ${status} | ${count} |`)
    .join('\n') || '| - | 0 |'
  const hintRows = Object.entries(report.summary.by_missing_edition_action_hint)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hint, count]) => `| ${hint} | ${count} |`)
    .join('\n') || '| - | 0 |'
  const gapRows = report.standard_placements
    .filter(row => row.reverse_gap_status)
    .slice(0, args.maxRows)
    .map(row => {
      const same = row.same_grade_matches.slice(0, 4).map(unitLabel).join('；') || '-'
      const cross = row.cross_grade_matches.slice(0, 6).map(unitLabel).join('；') || '-'
      return `| ${row.standard_code} | ${row.grade_band} | ${markdownCell(row.subdomain)} | ${row.placement_status} | ${row.action_hint} | ${markdownCell(row.missing_edition_cross_grade_hits.join('；') || '-')} | ${markdownCell(same)} | ${markdownCell(cross)} |`
    })
    .join('\n') || '| - | - | - | - | - | - | - | - |'
  const groupRows = report.progression_group_placements
    .filter(group => group.action_hints.includes('review_cross_grade_placement'))
    .slice(0, args.maxRows)
    .map(group => {
      const placement = Object.entries(group.placement_by_edition)
        .map(([edition, grades]) => `${edition}: ${Object.entries(grades).map(([grade, codes]) => `${grade}(${codes.length})`).join(', ')}`)
        .join('；')
      return `| ${group.progression_group_id} | ${markdownCell(group.subdomains.join('；'))} | ${markdownCell(group.grade_bands.join('；'))} | ${markdownCell(placement || '-')} |`
    })
    .join('\n') || '| - | - | - | - |'

  return `# H4G Topic Placement Matrix

生成时间：${report.generated_at}

学科：\`${report.subject}\`

## Summary

| 指标 | 数量 |
| --- | ---: |
| standards evaluated | ${report.summary.standards_evaluated} |
| unit candidates scanned | ${report.summary.unit_candidates_scanned} |
| standards with topic hits | ${report.summary.standards_with_topic_hits} |
| standards with same-grade hits | ${report.summary.standards_with_same_grade_hits} |
| standards with cross-grade hits | ${report.summary.standards_with_cross_grade_hits} |
| standards with cross-grade-only hits | ${report.summary.standards_with_cross_grade_only_hits} |
| reverse-gap standards | ${report.summary.standards_in_reverse_gap_report} |
| reverse-gap standards with cross-grade missing-edition hits | ${report.summary.reverse_gap_standards_with_cross_grade_missing_edition_hits} |

## Placement Status

| status | standards |
| --- | ---: |
${statusRows}

## Action Hints

| hint | standards |
| --- | ---: |
${hintRows}

## Reverse Gap Placement Diagnostics

| standard | grade | subdomain | placement | hint | missing editions with cross-grade hits | same-grade hits | cross-grade hits |
| --- | --- | --- | --- | --- | --- | --- | --- |
${gapRows}

## Cross-Grade Progression Groups

| progression_group_id | subdomains | public grade bands | placement by edition |
| --- | --- | --- | --- |
${groupRows}

## Boundary

- This report is diagnostic only and does not write \`public/data\`.
- A cross-grade hit means the topic appears in another grade in that textbook edition; it is not same-grade evidence for the standard.
- Use \`review_cross_grade_placement\` to decide whether the progression model needs an edition-placement note, a different publication gate, or manual review rather than an alias.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const report = buildReport(args)
  writeJson(args.out, report)
  if (args.summaryOut) {
    mkdirSync(dirname(args.summaryOut), { recursive: true })
    writeFileSync(args.summaryOut, markdownSummary(report, args))
  }
  console.log(JSON.stringify({
    valid: report.valid,
    wrote: args.out,
    summary_out: args.summaryOut || null,
    ...report.summary,
    errors: report.errors.length,
    warnings: report.warnings.length
  }, null, 2))
  if (args.strict && report.errors.length) process.exit(1)
}

main()
