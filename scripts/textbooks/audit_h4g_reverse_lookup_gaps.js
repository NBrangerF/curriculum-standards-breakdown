#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_runs/math_three_edition_page_override_page_clean/h4g_unit_evidence_candidate.json'
const DEFAULT_MATCHES = [
  'generated/textbook_evidence/h4g_runs/math_renjiao_page_override/textbook_unit_standard_matches.json',
  'generated/textbook_evidence/h4g_runs/math_jijiao_page_order_fix/textbook_unit_standard_matches.json',
  'generated/textbook_evidence/h4g_runs/math_huadong_page_order_fix/textbook_unit_standard_matches.json'
]
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_page_override_page_clean/h4g_reverse_lookup_gaps.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_page_override_page_clean/h4g_reverse_lookup_gaps.md'
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])

function parseArgs(argv) {
  const args = {
    candidate: DEFAULT_CANDIDATE,
    matches: DEFAULT_MATCHES,
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    subject: 'math',
    minEditionsPerStandard: 2,
    minEditionsPerProgressionGroup: 2,
    eligibleScore: 0.55,
    maxMatchesPerEdition: 5,
    maxSamples: 12
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--matches') args.matches = splitArg(argv[++i])
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subject') args.subject = argv[++i]
    else if (item === '--min-editions-per-standard') args.minEditionsPerStandard = positiveInteger(argv[++i], args.minEditionsPerStandard)
    else if (item === '--min-editions-per-progression-group') args.minEditionsPerProgressionGroup = positiveInteger(argv[++i], args.minEditionsPerProgressionGroup)
    else if (item === '--eligible-score') args.eligibleScore = Number(argv[++i]) || args.eligibleScore
    else if (item === '--max-matches-per-edition') args.maxMatchesPerEdition = positiveInteger(argv[++i], args.maxMatchesPerEdition)
    else if (item === '--max-samples') args.maxSamples = positiveInteger(argv[++i], args.maxSamples)
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_reverse_lookup_gaps.js \\
  --candidate generated/textbook_evidence/h4g_runs/math_three_edition_page_override_page_clean/h4g_unit_evidence_candidate.json \\
  --matches generated/textbook_evidence/h4g_runs/math_renjiao_page_override/textbook_unit_standard_matches.json,generated/textbook_evidence/h4g_runs/math_jijiao_page_order_fix/textbook_unit_standard_matches.json,generated/textbook_evidence/h4g_runs/math_huadong_page_order_fix/textbook_unit_standard_matches.json

Builds a read-only reverse-lookup report for H4G unit-evidence candidates. It
explains why publication gates are still failing by standard, progression group,
edition, missing grade band, match eligibility, and page evidence status.`)
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

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
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

function hasPageStart(match) {
  const page = Number(match.page_start)
  return Number.isInteger(page) && page >= 1
}

function pageReady(match) {
  return hasPageStart(match) && match.page_range_status !== 'toc_page_nonmonotonic'
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadStandards(dataRoot, subject) {
  const byCode = new Map()
  const byProgressionGroup = new Map()
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    if (subject && subjectSlug !== subject) continue
    const payload = readJson(file)
    for (const row of payload.standards || []) {
      if (!TARGET_GRADE_BANDS.has(row.grade_band)) continue
      if (row.code) byCode.set(row.code, row)
      if (row.progression_group_id) {
        if (!byProgressionGroup.has(row.progression_group_id)) byProgressionGroup.set(row.progression_group_id, [])
        byProgressionGroup.get(row.progression_group_id).push(row)
      }
    }
  }
  return { byCode, byProgressionGroup }
}

function loadMatches(files) {
  const out = []
  for (const file of files) {
    if (!existsSync(file)) continue
    const payload = readJson(file)
    for (const match of payload.matches || []) {
      out.push({ ...match, match_file: file })
    }
  }
  return out
}

function candidateEditions(candidate) {
  return sorted((candidate.unit_evidence || []).map(unit => unit.edition))
}

function candidatePageStatuses(candidate) {
  return sorted((candidate.unit_evidence || []).map(unit => unit.page_range_status || 'missing'))
}

function matchBucket(match, eligibleScore) {
  if (match.eligible_for_h4g_differentiation && pageReady(match)) return 'eligible_page_ready'
  if (match.eligible_for_h4g_differentiation && !hasPageStart(match)) return 'eligible_missing_page'
  if (match.eligible_for_h4g_differentiation && match.page_range_status === 'toc_page_nonmonotonic') return 'eligible_nonmonotonic_page'
  if ((Number(match.score) || 0) >= eligibleScore && match.eligible_alignment === 'none') return 'alignment_gap'
  if ((Number(match.score) || 0) >= eligibleScore) return 'other_eligible_score_gap'
  return 'low_score_or_noise'
}

function repairClass(matches, eligibleScore) {
  const buckets = new Set(matches.map(match => matchBucket(match, eligibleScore)))
  if (buckets.has('eligible_page_ready')) return 'ready_candidate_not_packed'
  if (buckets.has('eligible_missing_page')) return 'recover_page_start'
  if (buckets.has('eligible_nonmonotonic_page')) return 'confirm_nonmonotonic_page'
  if (buckets.has('alignment_gap')) return 'review_alignment_or_alias'
  if (buckets.has('other_eligible_score_gap')) return 'review_match_policy'
  if (matches.length) return 'low_score_or_wrong_grade'
  return 'no_match_returned'
}

function compactMatch(match, eligibleScore) {
  return {
    match_id: match.match_id || '',
    unit_title: match.unit_title || '',
    edition: match.edition || '',
    volume: match.volume || '',
    textbook_evidence_id: match.textbook_evidence_id || '',
    unit_evidence_id: match.unit_evidence_id || '',
    score: match.score ?? null,
    confidence_band: match.confidence_band || '',
    eligible: Boolean(match.eligible_for_h4g_differentiation),
    eligible_alignment: match.eligible_alignment || '',
    bucket: matchBucket(match, eligibleScore),
    page_start: match.page_start ?? null,
    page_range: match.page_range || '',
    page_range_status: match.page_range_status || '',
    matched_keywords: (match.matched_keywords || []).slice(0, 10),
    subdomain_alignment: match.subdomain_alignment || null,
    field_alignment: match.field_alignment || null,
    rationale: match.rationale || ''
  }
}

function topMatchesByEdition(matches, allEditions, args) {
  const out = {}
  for (const edition of allEditions) {
    const rows = matches
      .filter(match => match.edition === edition)
      .sort((a, b) => {
        const score = (Number(b.score) || 0) - (Number(a.score) || 0)
        if (score) return score
        return String(a.unit_evidence_id || '').localeCompare(String(b.unit_evidence_id || ''))
      })
      .slice(0, args.maxMatchesPerEdition)
    if (rows.length) out[edition] = rows.map(match => compactMatch(match, args.eligibleScore))
  }
  return out
}

function opportunityForStandard(standardCode, currentEditions, allEditions, matchesByCode, args) {
  const matches = matchesByCode.get(standardCode) || []
  const byEdition = topMatchesByEdition(matches, allEditions, args)
  const missingEditions = allEditions.filter(edition => !currentEditions.includes(edition))
  const missingEditionActions = missingEditions.map(edition => {
    const rows = matches.filter(match => match.edition === edition)
    return {
      edition,
      action: repairClass(rows, args.eligibleScore),
      top_matches: (byEdition[edition] || []).slice(0, args.maxMatchesPerEdition)
    }
  })
  return { byEdition, missingEditionActions }
}

function buildReport(args) {
  const candidatePayload = readJson(args.candidate)
  const matches = loadMatches(args.matches)
  const standards = loadStandards(args.dataRoot, args.subject)
  const candidateRows = (candidatePayload.candidates || []).filter(candidate => !args.subject || candidate.subject_slug === args.subject)
  const candidateByCode = new Map(candidateRows.map(candidate => [candidate.standard_code, candidate]))
  const matchesByCode = new Map()
  for (const match of matches) {
    if (!matchesByCode.has(match.standard_code)) matchesByCode.set(match.standard_code, [])
    matchesByCode.get(match.standard_code).push(match)
  }
  const allEditions = sorted([
    ...matches.map(match => match.edition),
    ...candidateRows.flatMap(candidate => (candidate.unit_evidence || []).map(unit => unit.edition))
  ])

  const summary = {
    subject: args.subject,
    standards_in_subject: standards.byCode.size,
    candidate_standards: candidateRows.length,
    all_editions: allEditions,
    standards_below_min_editions: 0,
    progression_groups_with_candidates: 0,
    partial_progression_groups: 0,
    complete_progression_groups: 0,
    progression_groups_below_min_editions: 0,
    missing_grade_slots: 0,
    near_miss_actions: {}
  }

  const standardGaps = []
  for (const candidate of candidateRows) {
    const record = standards.byCode.get(candidate.standard_code)
    const editions = candidateEditions(candidate)
    if (editions.length >= args.minEditionsPerStandard) continue
    summary.standards_below_min_editions += 1
    const opportunity = opportunityForStandard(candidate.standard_code, editions, allEditions, matchesByCode, args)
    for (const item of opportunity.missingEditionActions) countInto(summary.near_miss_actions, item.action)
    standardGaps.push({
      standard_code: candidate.standard_code,
      grade_band: candidate.grade_band || record?.grade_band || '',
      progression_group_id: candidate.progression_group_id || record?.progression_group_id || '',
      subdomain: candidate.subdomain || record?.subdomain || '',
      current_editions: editions,
      missing_editions: allEditions.filter(edition => !editions.includes(edition)),
      page_range_statuses: candidatePageStatuses(candidate),
      missing_edition_actions: opportunity.missingEditionActions,
      top_matches_by_edition: opportunity.byEdition
    })
  }

  const progressionGaps = []
  for (const [progressionGroupId, publicRows] of standards.byProgressionGroup.entries()) {
    const candidateStandards = publicRows.filter(row => candidateByCode.has(row.code))
    if (!candidateStandards.length) continue
    summary.progression_groups_with_candidates += 1
    const candidateGradeBands = sorted(candidateStandards.map(row => row.grade_band))
    const publicGradeBands = sorted(publicRows.map(row => row.grade_band).filter(grade => TARGET_GRADE_BANDS.has(grade)))
    const missingGradeBands = publicGradeBands.filter(grade => !candidateGradeBands.includes(grade))
    const groupEditions = sorted(candidateStandards.flatMap(row => candidateEditions(candidateByCode.get(row.code))))
    const status = missingGradeBands.length ? 'partial_candidate_group' : 'complete_candidate_group'
    if (status === 'partial_candidate_group') summary.partial_progression_groups += 1
    else summary.complete_progression_groups += 1
    if (groupEditions.length < args.minEditionsPerProgressionGroup) summary.progression_groups_below_min_editions += 1
    summary.missing_grade_slots += missingGradeBands.length
    if (!missingGradeBands.length && groupEditions.length >= args.minEditionsPerProgressionGroup) continue

    const standardDetails = publicRows.map(row => {
      const candidate = candidateByCode.get(row.code)
      const currentEditions = candidate ? candidateEditions(candidate) : []
      const opportunity = opportunityForStandard(row.code, currentEditions, allEditions, matchesByCode, args)
      return {
        standard_code: row.code,
        grade_band: row.grade_band,
        subdomain: row.subdomain || '',
        has_candidate: Boolean(candidate),
        current_editions: currentEditions,
        best_action: repairClass(matchesByCode.get(row.code) || [], args.eligibleScore),
        top_matches_by_edition: opportunity.byEdition
      }
    })
    progressionGaps.push({
      progression_group_id: progressionGroupId,
      subject_slug: args.subject,
      public_grade_bands: publicGradeBands,
      candidate_grade_bands: candidateGradeBands,
      missing_grade_bands: missingGradeBands,
      group_editions: groupEditions,
      status,
      standards: standardDetails
    })
  }

  return {
    generated_at: new Date().toISOString(),
    valid: true,
    data_root: args.dataRoot,
    candidate: args.candidate,
    match_files: args.matches,
    policy: {
      subject: args.subject,
      min_editions_per_standard: args.minEditionsPerStandard,
      min_editions_per_progression_group: args.minEditionsPerProgressionGroup,
      eligible_score: args.eligibleScore,
      max_matches_per_edition: args.maxMatchesPerEdition
    },
    summary,
    standard_gaps: standardGaps,
    progression_group_gaps: progressionGaps
  }
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function actionSummary(actions) {
  const counts = {}
  for (const action of actions || []) countInto(counts, action.action)
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([action, count]) => `${action}:${count}`)
    .join(', ') || '-'
}

function markdownSummary(report, args) {
  const standardRows = report.standard_gaps
    .slice(0, args.maxSamples)
    .map(gap => `| ${gap.standard_code} | ${gap.grade_band} | ${markdownCell(gap.subdomain)} | ${gap.current_editions.join('；')} | ${gap.missing_editions.join('；')} | ${actionSummary(gap.missing_edition_actions)} |`)
    .join('\n') || '| - | - | - | - | - | - |'
  const progressionRows = report.progression_group_gaps
    .slice(0, args.maxSamples)
    .map(gap => `| ${gap.progression_group_id} | ${gap.candidate_grade_bands.join('；')} | ${gap.missing_grade_bands.join('；') || '-'} | ${gap.group_editions.join('；')} |`)
    .join('\n') || '| - | - | - | - |'
  const actionRows = Object.entries(report.summary.near_miss_actions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([action, count]) => `| ${action} | ${count} |`)
    .join('\n') || '| - | 0 |'

  return `# H4G Reverse Lookup Gap Report

生成时间：${report.generated_at}

候选包：\`${report.candidate}\`

## Summary

| 指标 | 数量 |
| --- | ---: |
| candidate standards | ${report.summary.candidate_standards} |
| standards below min editions | ${report.summary.standards_below_min_editions} |
| progression groups with candidates | ${report.summary.progression_groups_with_candidates} |
| complete progression groups | ${report.summary.complete_progression_groups} |
| partial progression groups | ${report.summary.partial_progression_groups} |
| progression groups below min editions | ${report.summary.progression_groups_below_min_editions} |
| missing grade slots | ${report.summary.missing_grade_slots} |

## Near-Miss Actions

| action | missing edition count |
| --- | ---: |
${actionRows}

## Standard Gaps

| standard | grade | subdomain | current editions | missing editions | missing edition actions |
| --- | --- | --- | --- | --- | --- |
${standardRows}

## Progression Group Gaps

| progression group | candidate grades | missing grades | group editions |
| --- | --- | --- | --- |
${progressionRows}

## Action Meaning

- \`recover_page_start\`: 有 eligible 匹配，但缺教材目录印刷页码，优先回到 TOC/OCR 解析补页码。
- \`review_alignment_or_alias\`: 分数达到 eligible 线，但没有通过 alignment gate，需人工确认是否补同义词/领域锚点。
- \`low_score_or_wrong_grade\`: 只有低分或疑似错年级/错单元匹配，不应自动放宽。
- \`no_match_returned\`: 当前 top matches 没有返回候选，需扩大检索或确认教材确无对应单元。
- \`ready_candidate_not_packed\`: 已有可用匹配但未进入候选包，需检查 max-units 或合并逻辑。

该报告只用于反向检索规划，不写 \`public/data\`，也不改变官方课标原文。
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const missingInputs = [args.candidate, ...args.matches].filter(file => !existsSync(file))
  if (missingInputs.length) {
    throw new Error(`Missing input file(s): ${missingInputs.join(', ')}`)
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
    ...report.summary
  }, null, 2))
}

main()
