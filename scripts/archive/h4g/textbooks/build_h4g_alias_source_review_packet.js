#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const BASE_DIR = 'generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean'
const DEFAULT_REVERSE_GAPS = `${BASE_DIR}/h4g_reverse_lookup_gaps.json`
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = `${BASE_DIR}/h4g_alias_source_review_packet.json`
const DEFAULT_SUMMARY_OUT = `${BASE_DIR}/h4g_alias_source_review_packet.md`
const DEFAULT_REVIEW_STATUSES = ['needs_source_review']
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])

const GENERIC_ALIGNMENT_TERMS = new Set([
  '科学', '化学', '物理', '生物', '地理', '数学',
  '科学探究', '工程实践',
  '探究', '实验', '活动', '实践', '研究',
  '物质', '物体', '自然', '环境', '生命', '健康',
  '材料', '性质', '变化', '作用', '关系', '结构',
  '系统', '形式', '转化', '转移', '能量', '运动',
  '资源', '地球', '宇宙', '技术', '工程', '人类',
  '生活', '组成', '分类', '循环', '平衡', '原因',
  '影响', '空气', '水'
])

function parseArgs(argv) {
  const args = {
    reverseGaps: DEFAULT_REVERSE_GAPS,
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    subject: 'science',
    statuses: DEFAULT_REVIEW_STATUSES,
    maxMatchesPerItem: 12,
    strict: false,
    requireItems: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--reverse-gaps') args.reverseGaps = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subject') args.subject = argv[++i]
    else if (item === '--statuses') args.statuses = splitArg(argv[++i])
    else if (item === '--max-matches-per-item') args.maxMatchesPerItem = positiveInteger(argv[++i], args.maxMatchesPerItem)
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_alias_source_review_packet.js \\
  --reverse-gaps generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_reverse_lookup_gaps.json \\
  --strict --require-items

Builds a read-only source review packet for H4G alignment gaps that need
standard/textbook source review before any standard-scoped alias is considered.
The packet never writes public data and never adds aliases.`)
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

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function hashText(value, length = 12) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
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

function compactText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\uFFFD+/gu, '')
    .replace(/[，。！？；：、“”‘’（）《》【】\s]/g, '')
    .trim()
}

function hanCharCount(value) {
  return (String(value || '').match(/\p{Script=Han}/gu) || []).length
}

function isGenericAlignmentTerm(keyword) {
  const term = compactText(keyword)
  if (!term) return true
  if (hanCharCount(term) < 4) return true
  if (GENERIC_ALIGNMENT_TERMS.has(term)) return true
  return false
}

function normalizedKeywords(match) {
  const keywords = [
    ...(match.matched_keywords || []),
    ...(match.field_alignment?.matched_keywords || [])
  ]
  return sorted(keywords.map(keyword => compactText(keyword)).filter(Boolean))
}

function specificKeywords(match) {
  return normalizedKeywords(match).filter(keyword => !isGenericAlignmentTerm(keyword))
}

function genericKeywords(match) {
  return normalizedKeywords(match).filter(keyword => isGenericAlignmentTerm(keyword))
}

function unitTitleIsNoise(match) {
  const title = compactText(match.unit_title)
  if (!title) return true
  if (title === '目录' || title.includes('目录')) return true
  return false
}

function pageReady(match) {
  const page = Number(match.page_start)
  return Number.isInteger(page) && page >= 1 && match.page_range_status !== 'toc_page_nonmonotonic'
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

function compactStandard(row) {
  if (!row) return null
  return {
    code: row.code || '',
    grade_band: row.grade_band || '',
    grade: row.grade || '',
    progression_role: row.progression_role || '',
    progression_previous_grade_band: row.progression_previous_grade_band || '',
    progression_next_grade_band: row.progression_next_grade_band || '',
    progression_distinctiveness: row.progression_distinctiveness || '',
    progression_delta: row.progression_delta || '',
    review_status: row.review_status || '',
    domain: row.domain || '',
    subdomain: row.subdomain || '',
    standard: row.standard || '',
    practice: row.practice || '',
    teaching_tip: row.teaching_tip || '',
    assessment_evidence_type: row.assessment_evidence_type || '',
    grade_specific_focus: row.grade_specific_focus || '',
    textbook_unit_evidence_ids: row.textbook_unit_evidence_ids || []
  }
}

function progressionSnapshot(progressions) {
  const rows = progressions.filter(Boolean)
  const distinctCoreTexts = sorted(rows.map(row => compactText(row.standard)))
  const distinctPracticeTexts = sorted(rows.map(row => compactText(row.practice)))
  const distinctTeachingTips = sorted(rows.map(row => compactText(row.teaching_tip)))
  return {
    grade_bands: sorted(rows.map(row => row.grade_band)),
    standard_codes: sorted(rows.map(row => row.code)),
    core_text_distinct_count: distinctCoreTexts.length,
    practice_distinct_count: distinctPracticeTexts.length,
    teaching_tip_distinct_count: distinctTeachingTips.length,
    current_progression_distinctiveness: sorted(rows.map(row => row.progression_distinctiveness || 'missing')),
    review_statuses: sorted(rows.map(row => row.review_status || 'missing')),
    needs_curriculum_progression_review: distinctCoreTexts.length <= 1 ||
      rows.some(row => row.progression_distinctiveness === 'identical_core_fields')
  }
}

function standardCodesForItem(item, standards, reverseGaps) {
  if (item.standard_code) return [item.standard_code]
  const group = reverseGaps.no_candidate_progression_group_gaps
    ?.find(row => row.progression_group_id === item.progression_group_id)
  const codes = (group?.standards || []).map(row => row.standard_code)
  if (codes.length) return sorted(codes)
  return sorted((standards.byProgressionGroup.get(item.progression_group_id) || []).map(row => row.code))
}

function collectMatches(item, maxMatches) {
  const rows = []
  const seen = new Set()
  for (const [editionKey, matches] of Object.entries(item.top_matches_by_edition || {})) {
    const [standardCodeFromKey, editionFromKey] = editionKey.includes(':')
      ? editionKey.split(/:(.+)/).filter(Boolean)
      : ['', editionKey]
    for (const match of matches || []) {
      const key = match.match_id || `${editionKey}|${match.unit_evidence_id}|${match.unit_title}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        ...match,
        source_standard_code: item.standard_code || standardCodeFromKey || '',
        source_edition_key: editionKey,
        source_edition: match.edition || editionFromKey || ''
      })
    }
  }
  return rows.sort((a, b) => {
    const bucket = bucketRank(a.bucket) - bucketRank(b.bucket)
    if (bucket) return bucket
    const score = (Number(b.score) || 0) - (Number(a.score) || 0)
    if (score) return score
    return String(a.unit_evidence_id || '').localeCompare(String(b.unit_evidence_id || ''))
  }).slice(0, maxMatches)
}

function bucketRank(bucket) {
  if (bucket === 'alignment_gap') return 0
  if (bucket === 'eligible_page_ready') return 1
  if (bucket === 'eligible_missing_page') return 2
  if (bucket === 'low_score_or_noise') return 4
  return 3
}

function compactMatch(match) {
  const fields = match.field_alignment?.evidence_fields || []
  return {
    source_standard_code: match.source_standard_code || '',
    edition: match.edition || match.source_edition || '',
    volume: match.volume || '',
    unit_title: match.unit_title || '',
    unit_evidence_id: match.unit_evidence_id || '',
    textbook_evidence_id: match.textbook_evidence_id || '',
    score: match.score ?? null,
    confidence_band: match.confidence_band || '',
    bucket: match.bucket || '',
    page_start: match.page_start ?? null,
    page_range: match.page_range || '',
    page_range_status: match.page_range_status || '',
    page_ready: pageReady(match),
    eligible_alignment: match.eligible_alignment || 'none',
    is_noise_title: unitTitleIsNoise(match),
    specific_keywords: specificKeywords(match).slice(0, 12),
    generic_keywords: genericKeywords(match).slice(0, 12),
    field_evidence_fields: fields,
    field_evidence_field_count: fields.length,
    has_standard_field_evidence: fields.includes('standard'),
    has_multi_field_evidence: fields.length >= 2,
    subdomain_alignment: {
      required: Boolean(match.subdomain_alignment?.required),
      matched: Boolean(match.subdomain_alignment?.matched),
      anchors: match.subdomain_alignment?.anchors || [],
      matched_anchors: match.subdomain_alignment?.matched_anchors || []
    },
    rationale: match.rationale || ''
  }
}

function sourceReviewGate(item, matches) {
  const primaryMatches = matches.filter(match => match.bucket === 'alignment_gap')
  const reviewMatches = primaryMatches.length ? primaryMatches : matches
  if (!item.standard_code) return 'decompose_group_before_alias_review'
  if (!reviewMatches.length) return 'missing_match_context'
  if (reviewMatches.some(match => unitTitleIsNoise(match))) return 'reject_or_reparse_noise_before_alias_review'
  if (!reviewMatches.some(match => pageReady(match))) return 'recover_page_start_before_source_review'
  if (!reviewMatches.some(match => specificKeywords(match).length > 0)) return 'reject_generic_keyword_match'
  if (!reviewMatches.some(match => {
    const fields = match.field_alignment?.evidence_fields || []
    return fields.includes('standard') && fields.length >= 2
  })) {
    return 'inspect_source_for_single_field_concept_match'
  }
  return 'standard_level_source_review_candidate'
}

function allowedDecisionValues(gate) {
  const common = ['reject_alias_keep_blocked', 'request_match_policy_update', 'request_new_same_grade_evidence']
  if (gate === 'decompose_group_before_alias_review') return ['decompose_to_standard_level_review', ...common]
  if (gate === 'standard_level_source_review_candidate') return ['approve_standard_scoped_alias_after_source_review', ...common]
  if (gate === 'inspect_source_for_single_field_concept_match') return ['inspect_source_then_decide_alias_or_anchor', ...common]
  return common
}

function buildReviewItem(item, standards, reverseGaps, args) {
  const standardCodes = standardCodesForItem(item, standards, reverseGaps)
  const progressionRows = (standards.byProgressionGroup.get(item.progression_group_id) || [])
    .sort((a, b) => (a.grade_level || 0) - (b.grade_level || 0))
  const matches = collectMatches(item, args.maxMatchesPerItem)
  const compactMatches = matches.map(compactMatch)
  const gate = sourceReviewGate(item, matches)
  const targetStandards = standardCodes
    .map(code => compactStandard(standards.byCode.get(code)))
    .filter(Boolean)
  return {
    review_id: `h4g_alias_source_review_${hashText(item.work_item_id)}`,
    review_type: item.standard_code ? 'standard_alias_source_review' : 'group_alias_source_review',
    work_item_id: item.work_item_id,
    gap_type: item.gap_type,
    best_action: item.best_action,
    priority_score: item.priority_score,
    subject_slug: item.subject_slug || args.subject,
    progression_group_id: item.progression_group_id || '',
    target_standard_codes: standardCodes,
    target_grade_bands: sorted(targetStandards.map(row => row.grade_band).concat(item.grade_band || '', item.missing_grade_bands || [])),
    alias_review_status: item.alias_review?.status || '',
    alias_review_recommended_action: item.alias_review?.recommended_action || '',
    source_review_gate: gate,
    allowed_decision_values: allowedDecisionValues(gate),
    current_editions: item.current_editions || [],
    target_missing_editions: item.target_missing_editions || [],
    current_candidate_grade_bands: item.current_candidate_grade_bands || [],
    missing_grade_bands: item.missing_grade_bands || [],
    target_standards: targetStandards,
    progression_group_snapshot: progressionSnapshot(progressionRows),
    progression_standards: progressionRows.map(compactStandard),
    candidate_matches: compactMatches,
    source_review_questions: sourceReviewQuestions(gate, item, compactMatches),
    safety: {
      writes_public_data: false,
      writes_textbook_unit_evidence_ids: false,
      adds_reviewed_alias: false,
      official_standard_text_changed: false,
      requires_human_source_review: true
    }
  }
}

function sourceReviewQuestions(gate, item, matches) {
  const questions = [
    '该教材单元是否对应目标 standard 的同年级要求，而不是同组其他年级或跨年级投放？',
    '候选单元标题中的具体概念是否能在 standard/practice/teaching_tip 等多个字段中得到支撑？',
    '如果通过，alias 是否能限定到具体 standard_code、edition 或 unit_title，而不是全局放宽？'
  ]
  if (gate === 'decompose_group_before_alias_review') {
    questions.unshift('该 group-level 缺口应先拆到哪几条 H4G7/H4G8/H4G9 standard？')
  }
  if (matches.some(match => match.is_noise_title)) {
    questions.unshift('是否需要修正 TOC 解析，避免目录页或噪声标题进入高分候选？')
  }
  if (item.gap_type === 'fill_missing_grade_slot') {
    questions.push('该候选是否真的补齐 missing grade slot，还是只证明同一主题在其他年级教材中出现？')
  }
  return questions
}

function buildPacket(args) {
  const errors = []
  if (!existsSync(args.reverseGaps)) errors.push(`Missing reverse gap report: ${args.reverseGaps}`)
  if (!existsSync(join(args.dataRoot, 'by_subject'))) errors.push(`Missing data root by_subject directory: ${args.dataRoot}`)
  const reverseGaps = errors.length ? { remediation_work_items: [] } : readJson(args.reverseGaps)
  if (reverseGaps.valid === false) errors.push('Reverse gap report is marked valid=false')
  const standards = errors.length ? { byCode: new Map(), byProgressionGroup: new Map() } : loadStandards(args.dataRoot, args.subject)
  const statuses = new Set(args.statuses)
  const sourceItems = (reverseGaps.remediation_work_items || [])
    .filter(item => statuses.has(item.alias_review?.status || ''))
    .map(item => buildReviewItem(item, standards, reverseGaps, args))

  if (args.requireItems && !sourceItems.length) {
    errors.push(`No source review items found for statuses: ${args.statuses.join(', ')}`)
  }

  const summary = {
    subject: args.subject,
    source_review_items: sourceItems.length,
    by_review_type: {},
    by_gap_type: {},
    by_source_review_gate: {},
    by_alias_review_status: {},
    group_level_items: sourceItems.filter(item => item.review_type === 'group_alias_source_review').length,
    standard_level_items: sourceItems.filter(item => item.review_type === 'standard_alias_source_review').length,
    candidate_matches: sourceItems.reduce((sum, item) => sum + item.candidate_matches.length, 0),
    page_ready_candidate_matches: sourceItems.reduce((sum, item) => sum + item.candidate_matches.filter(match => match.page_ready).length, 0),
    noise_title_candidate_matches: sourceItems.reduce((sum, item) => sum + item.candidate_matches.filter(match => match.is_noise_title).length, 0)
  }
  for (const item of sourceItems) {
    countInto(summary.by_review_type, item.review_type)
    countInto(summary.by_gap_type, item.gap_type)
    countInto(summary.by_source_review_gate, item.source_review_gate)
    countInto(summary.by_alias_review_status, item.alias_review_status)
  }

  return {
    generated_at: new Date().toISOString(),
    valid: errors.length === 0,
    errors,
    sources: {
      data_root: args.dataRoot,
      reverse_gaps: args.reverseGaps
    },
    policy: {
      purpose: 'h4g_alias_source_review_packet',
      subject: args.subject,
      included_alias_review_statuses: args.statuses,
      writes_public_data: false,
      writes_textbook_unit_evidence_ids: false,
      adds_reviewed_aliases: false,
      official_standard_text_changed: false,
      requires_human_source_review: true
    },
    summary,
    review_items: sourceItems
  }
}

function markdownSummary(packet) {
  const itemRows = packet.review_items
    .slice(0, 30)
    .map(item => {
      const titles = item.candidate_matches
        .filter(match => match.bucket === 'alignment_gap')
        .slice(0, 3)
        .map(match => `${match.edition}:${match.unit_title}`)
        .join('；') || '-'
      return `| ${item.review_id} | ${item.review_type} | ${item.gap_type} | ${item.progression_group_id} | ${item.target_standard_codes.join('；') || '-'} | ${item.target_grade_bands.join('；') || '-'} | ${item.source_review_gate} | ${markdownCell(titles)} |`
    })
    .join('\n') || '| - | - | - | - | - | - | - | - |'

  return `# H4G Alias Source Review Packet

生成时间：${packet.generated_at}

reverse gaps：\`${packet.sources.reverse_gaps}\`

## Summary

| 指标 | 数量 |
| --- | ---: |
| source review items | ${packet.summary.source_review_items} |
| standard-level items | ${packet.summary.standard_level_items} |
| group-level items | ${packet.summary.group_level_items} |
| candidate matches | ${packet.summary.candidate_matches} |
| page-ready candidate matches | ${packet.summary.page_ready_candidate_matches} |
| noise-title candidate matches | ${packet.summary.noise_title_candidate_matches} |

## Review Types

| review type | items |
| --- | ---: |
${countRows(packet.summary.by_review_type)}

## Source Review Gates

| gate | items |
| --- | ---: |
${countRows(packet.summary.by_source_review_gate)}

## Gap Types

| gap type | items |
| --- | ---: |
${countRows(packet.summary.by_gap_type)}

## Review Items

| review id | type | gap type | progression group | standards | grades | gate | top alignment-gap matches |
| --- | --- | --- | --- | --- | --- | --- | --- |
${itemRows}

## Boundary

- This packet is a source-review input only.
- It does not write \`public/data\`, does not add aliases, and does not change official standard text.
- Group-level items must be decomposed to H4G7/H4G8/H4G9 standards before any standard-scoped alias can be reviewed.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const packet = buildPacket(args)
  writeJson(args.out, packet)
  if (args.summaryOut) {
    mkdirSync(dirname(args.summaryOut), { recursive: true })
    writeFileSync(args.summaryOut, markdownSummary(packet))
  }
  console.log(JSON.stringify({
    valid: packet.valid,
    errors: packet.errors,
    wrote: args.out,
    summary_out: args.summaryOut || null,
    ...packet.summary
  }, null, 2))
  if (args.strict && !packet.valid) process.exit(1)
}

main()
