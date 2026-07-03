#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_UNIT_INDEX = 'generated/textbook_evidence/textbook_unit_index.json'
const DEFAULT_OUT = 'generated/textbook_evidence/textbook_unit_standard_matches.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/textbook_unit_standard_matches_summary.md'
const DEFAULT_ALIGNMENT_ALIASES = 'scripts/textbooks/textbook_unit_alignment_aliases.json'
const DEFAULT_SUBJECT_THEME_BRIDGES = 'generated/textbook_evidence/h4g_subject_theme_bridge_registry.json'
const DEFAULT_MIN_SCORE = 0.3
const DEFAULT_ELIGIBLE_SCORE = 0.55
const DEFAULT_MAX_MATCHES = 5
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])
const STANDARD_FIELDS = [
  'domain',
  'subdomain',
  'standard',
  'context',
  'practice',
  'teaching_tip',
  'assessment_evidence_type'
]
const STOP_TOKENS = new Set([
  '义务', '教育', '教科', '教科书', '教材', '课程', '标准', '年级',
  '上册', '下册', '全一册', '学生', '学习', '活动', '能够', '通过',
  '理解', '认识', '了解', '掌握', '运用', '形成', '发展', '进行',
  '目录', '语文', '英语', '数学', '科学', '化学', '物理', '生物',
  '地理', '历史', '艺术', '音乐', '美术', '体育', '劳动',
  '七年级', '八年级', '九年级'
])
const WEAK_EDGE_CHARS = new Set(['与', '的', '和', '中', '及', '或', '并', '在', '为', '对', '到', '从'])
const FIELD_WEIGHTS = {
  domain: 1.4,
  subdomain: 1.8,
  standard: 2.2,
  context: 1.0,
  practice: 1.1,
  teaching_tip: 0.8,
  assessment_evidence_type: 0.7
}
const BROAD_SUBDOMAIN_LABELS = new Set([
  '第四学段目标',
  '课程目标',
  '水平四内容结构'
])
const FIELD_ALIGNMENT_EVIDENCE_FIELDS = new Set([
  'standard',
  'practice',
  'teaching_tip',
  'assessment_evidence_type'
])
const FIELD_ALIGNMENT_MIN_HAN_CHARS = 4

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    unitIndex: DEFAULT_UNIT_INDEX,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    subjects: [],
    gradeBands: [],
    minScore: DEFAULT_MIN_SCORE,
    eligibleScore: DEFAULT_ELIGIBLE_SCORE,
    maxMatches: DEFAULT_MAX_MATCHES,
    includeVolumeSeeds: false,
    alignmentAliases: DEFAULT_ALIGNMENT_ALIASES,
    useAlignmentAliases: true,
    subjectThemeBridges: DEFAULT_SUBJECT_THEME_BRIDGES,
    useSubjectThemeBridges: true
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--unit-index') args.unitIndex = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = splitArg(argv[++i])
    else if (item === '--grade-bands') args.gradeBands = splitArg(argv[++i])
    else if (item === '--min-score') args.minScore = Number(argv[++i]) || args.minScore
    else if (item === '--eligible-score') args.eligibleScore = Number(argv[++i]) || args.eligibleScore
    else if (item === '--max-matches') args.maxMatches = Number(argv[++i]) || args.maxMatches
    else if (item === '--include-volume-seeds') args.includeVolumeSeeds = true
    else if (item === '--alignment-aliases') args.alignmentAliases = argv[++i]
    else if (item === '--no-alignment-aliases') args.useAlignmentAliases = false
    else if (item === '--subject-theme-bridges') args.subjectThemeBridges = argv[++i]
    else if (item === '--no-subject-theme-bridges') args.useSubjectThemeBridges = false
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/match_standards_to_textbook_units.js \\
  --subjects math,science \\
  --unit-index generated/textbook_evidence/textbook_unit_index.json

Builds explainable candidate matches from H4G standards to textbook
toc_unit_or_chapter candidates. File-level volume_seed records are ignored by
default because they are not unit-level evidence. Reviewed alignment aliases are
standard-scoped by default; use --no-alignment-aliases to disable them. Reviewed
subject-theme bridges are loaded only from an approved generated registry and
can be disabled with --no-subject-theme-bridges.`)
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

function hashText(value, length = 12) {
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

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
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

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[，。！？；：、“”‘’（）《》【】]/g, ' ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasHan(value) {
  return /\p{Script=Han}/u.test(value)
}

function hanCharCount(value) {
  return (String(value || '').match(/\p{Script=Han}/gu) || []).length
}

function grams(text, min, max) {
  const compact = String(text || '').replace(/\s+/g, '')
  const out = []
  for (let size = min; size <= max; size += 1) {
    for (let index = 0; index <= compact.length - size; index += 1) {
      out.push(compact.slice(index, index + size))
    }
  }
  return out
}

function keepToken(token) {
  if (!token || token.length < 2) return false
  if (STOP_TOKENS.has(token)) return false
  if (WEAK_EDGE_CHARS.has(token[0]) || WEAK_EDGE_CHARS.has(token[token.length - 1])) return false
  return true
}

function tokenize(value) {
  const normalized = normalizeText(value)
  const tokens = new Set()
  for (const part of normalized.split(/\s+/).filter(Boolean)) {
    if (/^\d+$/.test(part)) continue
    if (keepToken(part)) tokens.add(part)
    if (hasHan(part)) {
      for (const gram of grams(part, 2, 4)) {
        if (keepToken(gram)) tokens.add(gram)
      }
    }
  }
  return tokens
}

function weightedStandardTokens(standard) {
  const weights = new Map()
  const fieldTokens = {}
  for (const field of STANDARD_FIELDS) {
    const tokens = tokenize(standard[field])
    fieldTokens[field] = tokens
    for (const token of tokens) {
      weights.set(token, (weights.get(token) || 0) + (FIELD_WEIGHTS[field] || 1))
    }
  }
  return { weights, fieldTokens }
}

function unitTokens(unit) {
  return tokenize([
    unit.unit_title,
    unit.matched_line,
    unit.volume
  ].filter(Boolean).join(' '))
}

function confidenceBand(score) {
  if (score >= 0.8) return 'high'
  if (score >= 0.55) return 'medium'
  if (score >= 0.3) return 'low'
  return 'below_threshold'
}

function excerpt(value, length = 80) {
  return normalizeText(value).slice(0, length)
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, '')
}

function normalizeAliasTerm(value) {
  return compactText(value)
}

function subdomainAnchors(value) {
  const raw = String(value || '').replace(/\s+/g, '')
  if (!raw || BROAD_SUBDOMAIN_LABELS.has(raw)) return []
  const chunks = raw
    .split(/[与和及、，,\/（）()的]/u)
    .map(item => item.trim())
    .filter(item => item.length >= 2)
  const anchors = chunks.length ? chunks : [raw]
  return [...new Set(anchors.filter(anchor => !BROAD_SUBDOMAIN_LABELS.has(anchor)))]
}

function subdomainAlignment(standard, unit) {
  const anchors = subdomainAnchors(standard.subdomain)
  const unitTitle = compactText(unit.unit_title)
  const matchedAnchors = anchors.filter(anchor => unitTitle.includes(compactText(anchor)))
  return {
    required: anchors.length > 0,
    matched: matchedAnchors.length > 0,
    anchors,
    matched_anchors: matchedAnchors
  }
}

function allowsStrongFieldAlignment(standard) {
  return standard.subject_slug === 'science' && /^\d+\.\d+\s/u.test(String(standard.subdomain || ''))
}

function strongFieldAlignment(standard, unit, scoredMatch, args) {
  const matchedFields = new Set((scoredMatch.matched_fields || []).map(row => row.field))
  const evidenceFields = [...matchedFields].filter(field => FIELD_ALIGNMENT_EVIDENCE_FIELDS.has(field))
  const longKeywords = (scoredMatch.matched_keywords || [])
    .filter(keyword => hanCharCount(keyword) >= FIELD_ALIGNMENT_MIN_HAN_CHARS)
  const matched = (
    allowsStrongFieldAlignment(standard) &&
    scoredMatch.score >= args.eligibleScore &&
    unit.candidate_type === 'toc_unit_or_chapter' &&
    matchedFields.has('standard') &&
    evidenceFields.length >= 2 &&
    longKeywords.length > 0
  )
  return {
    required: false,
    matched,
    policy: 'science_numbered_content_strong_field_terms',
    evidence_fields: evidenceFields.sort((a, b) => a.localeCompare(b)),
    matched_keywords: [...new Set(longKeywords)].sort((a, b) => a.localeCompare(b)).slice(0, 12),
    min_keyword_han_chars: FIELD_ALIGNMENT_MIN_HAN_CHARS,
    reason: matched
      ? 'Strong science content term matched standard evidence fields even though the broad subdomain title did not appear verbatim in the unit title.'
      : ''
  }
}

function loadAlignmentAliases(args) {
  if (!args.useAlignmentAliases) return new Map()
  const payload = readOptionalJson(args.alignmentAliases)
  const aliases = new Map()
  for (const row of payload?.aliases || []) {
    const standardCode = String(row.standard_code || '').trim()
    const terms = (row.terms || [])
      .map(normalizeAliasTerm)
      .filter(term => term.length >= 2)
    if (!standardCode || !terms.length) continue
    const editions = new Set((row.editions || []).map(item => String(item).trim()).filter(Boolean))
    const unitTitles = new Set((row.unit_titles || []).map(normalizeAliasTerm).filter(Boolean))
    aliases.set(standardCode, [
      ...(aliases.get(standardCode) || []),
      {
        ...row,
        alias_file: args.alignmentAliases,
        standard_code: standardCode,
        terms_original: row.terms || [],
        terms,
        editions,
        unit_titles: unitTitles
      }
    ])
  }
  return aliases
}

function loadSubjectThemeBridgeRegistry(args, warnings) {
  if (!args.useSubjectThemeBridges) return { byStandard: new Map(), byGroup: new Map(), loaded: 0, source: null }
  const payload = readOptionalJson(args.subjectThemeBridges)
  if (!payload) return { byStandard: new Map(), byGroup: new Map(), loaded: 0, source: args.subjectThemeBridges }
  if (payload.valid !== true || payload.purpose !== 'h4g_reviewed_subject_theme_bridge_registry') {
    warnings.push(`Ignoring invalid subject theme bridge registry: ${args.subjectThemeBridges}`)
    return { byStandard: new Map(), byGroup: new Map(), loaded: 0, source: args.subjectThemeBridges }
  }
  const byStandard = new Map()
  const byGroup = new Map()
  for (const bridge of payload.bridges || []) {
    if (bridge.eligible_alignment !== 'reviewed_subject_theme_bridge') continue
    if (bridge.scope_type === 'standard_code' && bridge.standard_code) {
      byStandard.set(bridge.standard_code, [...(byStandard.get(bridge.standard_code) || []), bridge])
    } else if (bridge.scope_type === 'progression_group' && bridge.progression_group_id) {
      byGroup.set(bridge.progression_group_id, [...(byGroup.get(bridge.progression_group_id) || []), bridge])
    }
  }
  return {
    byStandard,
    byGroup,
    loaded: [...byStandard.values(), ...byGroup.values()].reduce((sum, rows) => sum + rows.length, 0),
    source: args.subjectThemeBridges
  }
}

function reviewedAliasAlignment(standard, unit, aliasIndex) {
  const rows = aliasIndex.get(standard.code) || []
  const unitTitle = compactText(unit.unit_title)
  const edition = String(unit.edition || '').trim()
  const matched = []
  for (const row of rows) {
    if (row.subject_slug && row.subject_slug !== standard.subject_slug) continue
    if (row.grade_band && row.grade_band !== standard.grade_band) continue
    if (row.editions.size && !row.editions.has(edition)) continue
    if (row.unit_titles.size && !row.unit_titles.has(unitTitle)) continue
    const matchedTerms = row.terms.filter(term => unitTitle.includes(term))
    if (!matchedTerms.length) continue
    matched.push({
      source: row.source || 'reviewed_alignment_alias',
      review_status: row.review_status || '',
      rationale: row.rationale || '',
      note: row.note || '',
      alias_file: row.alias_file || '',
      matched_terms: matchedTerms,
      original_terms: row.terms_original || []
    })
  }
  const matchedTerms = [...new Set(matched.flatMap(row => row.matched_terms))]
    .sort((a, b) => a.localeCompare(b))
  return {
    required: false,
    matched: matchedTerms.length > 0,
    policy: 'standard_scoped_reviewed_alias',
    alias_file: matched[0]?.alias_file || '',
    matched_terms: matchedTerms,
    reviewed_aliases: matched
  }
}

function reviewedSubjectThemeBridgeAlignment(standard, unit, bridgeIndex) {
  const rows = [
    ...(bridgeIndex.byStandard.get(standard.code) || []),
    ...(bridgeIndex.byGroup.get(standard.progression_group_id || '') || [])
  ]
  const matched = []
  for (const row of rows) {
    if (row.subject_slug && row.subject_slug !== standard.subject_slug) continue
    if (row.grade_band && row.grade_band !== standard.grade_band) continue
    if (row.unit_grade_band && row.unit_grade_band !== unit.grade_band) continue
    if (row.unit_evidence_id && row.unit_evidence_id !== unit.unit_evidence_id) continue
    if (row.textbook_evidence_id && row.textbook_evidence_id !== unit.textbook_evidence_id) continue
    if (row.edition && row.edition !== unit.edition) continue
    matched.push({
      bridge_id: row.bridge_id || '',
      source_decision_id: row.source_decision_id || '',
      source_review_id: row.source_review_id || '',
      scope_type: row.scope_type || '',
      reviewer_decision: row.reviewer_decision || '',
      reviewed_at: row.reviewed_at || '',
      reviewed_by: row.reviewed_by || '',
      decision_note: row.decision_note || '',
      matcher_score: row.matcher_score || 0.56,
      shared_topic_tags: row.shared_topic_tags || [],
      standard_topic_tags: row.standard_topic_tags || [],
      unit_topic_tags: row.unit_topic_tags || [],
      page_ready: row.page_ready === true,
      page_range_status: row.page_range_status || '',
      publication_policy: row.publication_policy || {}
    })
  }
  const topicTags = [...new Set(matched.flatMap(row => row.shared_topic_tags || []))]
    .sort((a, b) => a.localeCompare(b))
  return {
    required: false,
    matched: matched.length > 0,
    policy: 'approved_subject_theme_bridge_registry',
    bridge_registry: bridgeIndex.source || '',
    matched_topic_tags: topicTags,
    reviewed_bridges: matched,
    matcher_score: Math.max(...matched.map(row => Number(row.matcher_score || 0.56)), 0.56)
  }
}

function scoreMatch(standard, unit) {
  const { weights, fieldTokens } = weightedStandardTokens(standard)
  const titleTokens = unitTokens(unit)
  if (!titleTokens.size || !weights.size) {
    return {
      score: 0,
      matched_keywords: [],
      matched_fields: [],
      rationale: 'No comparable tokens between standard fields and unit title.'
    }
  }

  let matchedWeight = 0
  let totalUnitWeight = 0
  const matched = []
  const matchedFields = []

  for (const token of titleTokens) {
    const tokenWeight = Math.max(1, Math.min(4, token.length / 2))
    totalUnitWeight += tokenWeight
    if (!weights.has(token)) continue
    matchedWeight += tokenWeight * Math.min(2.5, weights.get(token))
    matched.push(token)
    for (const [field, tokens] of Object.entries(fieldTokens)) {
      if (tokens.has(token)) {
        matchedFields.push({
          field,
          keyword: token,
          field_excerpt: excerpt(standard[field])
        })
      }
    }
  }

  const domain = normalizeText(standard.domain)
  const subdomain = normalizeText(standard.subdomain)
  const unitTitle = normalizeText(unit.unit_title)
  let boost = 0
  if (domain && unitTitle.includes(domain)) boost += 0.12
  if (subdomain && unitTitle.includes(subdomain)) boost += 0.18

  const base = totalUnitWeight ? matchedWeight / (totalUnitWeight * 2.5) : 0
  const score = Number(Math.max(0, Math.min(1, base + boost)).toFixed(4))
  const uniqueKeywords = [...new Set(matched)].sort((a, b) => a.localeCompare(b))
  const rationale = uniqueKeywords.length
    ? `Matched ${uniqueKeywords.length} keyword(s) between unit title and standard fields: ${uniqueKeywords.slice(0, 8).join(', ')}.`
    : 'No shared keywords above the token threshold.'

  return {
    score,
    matched_keywords: uniqueKeywords.slice(0, 40),
    matched_fields: dedupeMatchedFields(matchedFields).slice(0, 30),
    rationale
  }
}

function dedupeMatchedFields(rows) {
  const seen = new Set()
  const out = []
  for (const row of rows) {
    const key = `${row.field}:${row.keyword}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out.sort((a, b) => {
    const field = a.field.localeCompare(b.field)
    if (field !== 0) return field
    return a.keyword.localeCompare(b.keyword)
  })
}

function loadStandards(args) {
  const allowedSubjects = new Set(args.subjects)
  const allowedBands = new Set(args.gradeBands.length ? args.gradeBands : [...TARGET_GRADE_BANDS])
  const out = []
  for (const file of subjectFiles(args.dataRoot)) {
    const subjectSlug = basename(file, '.json')
    if (allowedSubjects.size && !allowedSubjects.has(subjectSlug)) continue
    const payload = readJson(file)
    for (const standard of payload.standards || []) {
      if (!TARGET_GRADE_BANDS.has(standard.grade_band)) continue
      if (!allowedBands.has(standard.grade_band)) continue
      out.push(standard)
    }
  }
  return out
}

function loadUnits(args, warnings) {
  if (!existsSync(args.unitIndex)) {
    warnings.push(`Missing unit index: ${args.unitIndex}`)
    return { payload: null, units: [] }
  }
  const payload = readJson(args.unitIndex)
  const allowedSubjects = new Set(args.subjects)
  const allowedBands = new Set(args.gradeBands.length ? args.gradeBands : [...TARGET_GRADE_BANDS])
  const units = (payload.unit_candidates || [])
    .map(unit => ({ ...unit, grade_band: gradeBandForUnit(unit) }))
    .filter(unit => !allowedSubjects.size || allowedSubjects.has(unit.subject_slug))
    .filter(unit => !allowedBands.size || allowedBands.has(unit.grade_band))
    .filter(unit => args.includeVolumeSeeds || unit.candidate_type === 'toc_unit_or_chapter')
  const filteredNoiseUnits = units.filter(unit => unit.candidate_type === 'toc_unit_or_chapter' && isNoiseUnitCandidate(unit))
  const cleanUnits = units.filter(unit => unit.candidate_type !== 'toc_unit_or_chapter' || !isNoiseUnitCandidate(unit))
  if (filteredNoiseUnits.length) {
    warnings.push(`Filtered ${filteredNoiseUnits.length} toc_unit_or_chapter candidate(s) with empty/TOC-only titles before matching.`)
  }
  const realUnits = cleanUnits.filter(unit => unit.candidate_type === 'toc_unit_or_chapter')
  if (!realUnits.length) {
    warnings.push('No toc_unit_or_chapter candidates are available; standard-unit matching cannot produce H4G differentiation evidence yet.')
  }
  if (args.includeVolumeSeeds) {
    warnings.push('includeVolumeSeeds is enabled; volume_seed matches are diagnostic only and are never eligible for H4G differentiation.')
  }
  return { payload, units: cleanUnits }
}

function isNoiseUnitCandidate(unit) {
  const title = compactText(unit.unit_title)
  if (!title) return true
  if (title === '目录' || title.includes('目录')) return true
  return false
}

function groupUnits(units) {
  const bySubjectGrade = {}
  for (const unit of units) {
    const key = `${unit.subject_slug}:${unit.grade_band}`
    bySubjectGrade[key] ||= []
    bySubjectGrade[key].push(unit)
  }
  return bySubjectGrade
}

function bridgeMatchedFields(themeBridgeAlignment) {
  return (themeBridgeAlignment.matched_topic_tags || []).map(tag => ({
    field: 'subject_theme_bridge',
    keyword: tag,
    field_excerpt: 'approved subject theme bridge registry'
  }))
}

function bridgeMatchedKeywords(scoredMatch, themeBridgeAlignment) {
  return [...new Set([
    ...(scoredMatch.matched_keywords || []),
    ...(themeBridgeAlignment.matched_topic_tags || [])
  ])].sort((a, b) => a.localeCompare(b)).slice(0, 40)
}

function effectiveScore(scoredMatch, themeBridgeAlignment) {
  if (!themeBridgeAlignment.matched) return scoredMatch.score
  return Number(Math.max(scoredMatch.score, themeBridgeAlignment.matcher_score || DEFAULT_ELIGIBLE_SCORE).toFixed(4))
}

function buildMatches(standards, unitsBySubjectGrade, args, aliasIndex, bridgeIndex) {
  const matches = []
  const unmatchedStandards = []
  for (const standard of standards) {
    const key = `${standard.subject_slug}:${standard.grade_band}`
    const candidates = unitsBySubjectGrade[key] || []
    const scored = []
    for (const unit of candidates) {
      const scoredMatch = scoreMatch(standard, unit)
      const alignment = subdomainAlignment(standard, unit)
      const fieldAlignment = strongFieldAlignment(standard, unit, scoredMatch, args)
      const aliasAlignment = reviewedAliasAlignment(standard, unit, aliasIndex)
      const themeBridgeAlignment = reviewedSubjectThemeBridgeAlignment(standard, unit, bridgeIndex)
      if (scoredMatch.score < args.minScore && !themeBridgeAlignment.matched) continue
      const score = effectiveScore(scoredMatch, themeBridgeAlignment)
      const eligibleAlignment = alignment.matched || aliasAlignment.matched || fieldAlignment.matched || themeBridgeAlignment.matched
      const eligible = unit.candidate_type === 'toc_unit_or_chapter' && score >= args.eligibleScore && eligibleAlignment
      const matchedKeywords = themeBridgeAlignment.matched ? bridgeMatchedKeywords(scoredMatch, themeBridgeAlignment) : scoredMatch.matched_keywords
      const matchedFields = themeBridgeAlignment.matched
        ? [...scoredMatch.matched_fields, ...bridgeMatchedFields(themeBridgeAlignment)]
        : scoredMatch.matched_fields
      scored.push({
        match_id: `ctm_${hashText(`${standard.code}|${unit.unit_evidence_id}`, 14)}`,
        standard_code: standard.code,
        standard_id: standard.id || standard.code,
        progression_group_id: standard.progression_group_id || '',
        subject_slug: standard.subject_slug,
        grade_band: standard.grade_band,
        grade_level: standard.grade_level || Number(String(standard.grade_band).replace('H4G', '')),
        unit_evidence_id: unit.unit_evidence_id,
        textbook_evidence_id: unit.textbook_evidence_id,
        candidate_type: unit.candidate_type,
        evidence_granularity: unit.evidence_granularity,
        unit_title: unit.unit_title,
        textbook_subject: unit.textbook_subject,
        edition: unit.edition,
        volume: unit.volume,
        repository_path: unit.repository_path,
        evidence_url: unit.evidence_url,
        page_start: unit.page_start ?? null,
        page_end: unit.page_end ?? null,
        page_range: unit.page_range || '',
        page_range_status: unit.page_range_status || '',
        toc_page_source: unit.toc_page_source || '',
        page_start_override: unit.page_start_override || null,
        toc_raw_line: unit.toc_raw_line || '',
        toc_source_order: unit.toc_source_order ?? null,
        pdf_page_hint: unit.pdf_page_hint ?? null,
        score,
        keyword_score: scoredMatch.score,
        confidence_band: confidenceBand(score),
        match_type: themeBridgeAlignment.matched ? 'textbook_unit_candidate_subject_theme_bridge' : 'textbook_unit_candidate_keyword',
        matched_keywords: matchedKeywords,
        matched_fields: dedupeMatchedFields(matchedFields).slice(0, 30),
        subdomain_alignment: alignment,
        alias_alignment: aliasAlignment,
        field_alignment: fieldAlignment,
        subject_theme_bridge_alignment: themeBridgeAlignment,
        eligible_alignment: alignment.matched ? 'subdomain_anchor' : aliasAlignment.matched ? 'reviewed_alias_anchor' : fieldAlignment.matched ? 'strong_field_alignment' : themeBridgeAlignment.matched ? 'reviewed_subject_theme_bridge' : 'none',
        rationale: themeBridgeAlignment.matched
          ? `Approved subject-theme bridge matched topic tag(s): ${themeBridgeAlignment.matched_topic_tags.join(', ')}. Keyword score before bridge: ${scoredMatch.score}.`
          : scoredMatch.rationale,
        eligible_for_h4g_differentiation: eligible,
        requires_review: true
      })
    }
    scored.sort((a, b) => {
      const score = b.score - a.score
      if (score !== 0) return score
      return a.unit_evidence_id.localeCompare(b.unit_evidence_id)
    })
    const top = scored.slice(0, args.maxMatches)
    matches.push(...top)
    if (!top.length) {
      unmatchedStandards.push({
        standard_code: standard.code,
        subject_slug: standard.subject_slug,
        grade_band: standard.grade_band,
        progression_group_id: standard.progression_group_id || '',
        reason: candidates.length ? 'no candidate reached min_score' : 'no unit candidates for subject and grade'
      })
    }
  }
  return { matches, unmatchedStandards }
}

function summarize(standards, units, matches, unmatchedStandards, warnings) {
  const bySubject = {}
  const byUnitType = {}
  const byConfidence = {}
  const byEligibleAlignment = {}
  for (const standard of standards) countInto(bySubject, standard.subject_slug)
  for (const unit of units) countInto(byUnitType, unit.candidate_type)
  for (const match of matches) {
    countInto(byConfidence, match.confidence_band)
    if (match.eligible_for_h4g_differentiation) countInto(byEligibleAlignment, match.eligible_alignment || 'missing')
  }
  return {
    standards_evaluated: standards.length,
    unit_candidates_considered: units.length,
    real_unit_or_chapter_candidates: units.filter(unit => unit.candidate_type === 'toc_unit_or_chapter').length,
    volume_seed_candidates_considered: units.filter(unit => unit.candidate_type === 'volume_seed').length,
    matches: matches.length,
    standards_with_matches: new Set(matches.map(match => match.standard_code)).size,
    eligible_matches: matches.filter(match => match.eligible_for_h4g_differentiation).length,
    unmatched_standards: unmatchedStandards.length,
    warnings: warnings.length,
    by_subject: Object.fromEntries(Object.entries(bySubject).sort(([a], [b]) => a.localeCompare(b))),
    by_unit_candidate_type: Object.fromEntries(Object.entries(byUnitType).sort(([a], [b]) => a.localeCompare(b))),
    by_confidence_band: Object.fromEntries(Object.entries(byConfidence).sort(([a], [b]) => a.localeCompare(b))),
    by_eligible_alignment: Object.fromEntries(Object.entries(byEligibleAlignment).sort(([a], [b]) => a.localeCompare(b)))
  }
}

function markdownSummary(payload) {
  const subjectRows = Object.entries(payload.summary.by_subject)
    .map(([subject, count]) => `| ${subject} | ${count} |`)
    .join('\n')
  const alignmentRows = Object.entries(payload.summary.by_eligible_alignment || {})
    .map(([alignment, count]) => `| ${alignment} | ${count} |`)
    .join('\n') || '| - | 0 |'
  const warnings = payload.warnings.length
    ? payload.warnings.map(item => `- ${item}`).join('\n')
    : '- 无'
  return `# Textbook Unit Standard Match Summary

生成时间：${payload.generated_at}

数据根目录：\`${payload.data_root}\`

单元索引：\`${payload.unit_index}\`

## 摘要

| 指标 | 数量 |
| --- | ---: |
| H4G standards evaluated | ${payload.summary.standards_evaluated} |
| unit candidates considered | ${payload.summary.unit_candidates_considered} |
| toc_unit_or_chapter candidates | ${payload.summary.real_unit_or_chapter_candidates} |
| matches | ${payload.summary.matches} |
| eligible matches | ${payload.summary.eligible_matches} |
| unmatched standards | ${payload.summary.unmatched_standards} |

## Eligible Alignment

| alignment | matches |
| --- | ---: |
${alignmentRows}

## 学科范围

| subject_slug | standards |
| --- | ---: |
${subjectRows}

## Warnings

${warnings}

说明：只有 \`candidate_type: "toc_unit_or_chapter"\`、达到 eligible score，并通过 alignment gate 的匹配，才可能作为 H4G 年级分化候选证据。alignment gate 通常要求 \`subdomain_anchor\`；标准级已复核 alias 可用 \`reviewed_alias_anchor\` 作为局部例外；科学编号内容项可用保守的 \`strong_field_alignment\` 第二通道。文件级 \`volume_seed\` 不可用于升级 \`standard_variant_type\`。
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const warnings = []
  if (!existsSync(join(args.dataRoot, 'by_subject'))) {
    throw new Error(`Missing data root by_subject directory: ${args.dataRoot}`)
  }
  const standards = loadStandards(args)
  const { payload: unitPayload, units } = loadUnits(args, warnings)
  const unitsBySubjectGrade = groupUnits(units)
  const aliasIndex = loadAlignmentAliases(args)
  const bridgeIndex = loadSubjectThemeBridgeRegistry(args, warnings)
  const { matches, unmatchedStandards } = buildMatches(standards, unitsBySubjectGrade, args, aliasIndex, bridgeIndex)
  const summary = summarize(standards, units, matches, unmatchedStandards, warnings)
  const output = {
    generated_at: new Date().toISOString(),
    data_root: args.dataRoot,
    unit_index: args.unitIndex,
    source_commit: unitPayload?.source_commit || null,
    match_policy: {
      min_score: args.minScore,
      eligible_score: args.eligibleScore,
      max_matches_per_standard: args.maxMatches,
      include_volume_seeds: args.includeVolumeSeeds,
      eligible_candidate_type: 'toc_unit_or_chapter',
      eligible_requires_alignment: 'subdomain_anchor_or_reviewed_alias_anchor_or_strong_field_alignment_or_reviewed_subject_theme_bridge',
      alignment_aliases: args.useAlignmentAliases ? args.alignmentAliases : null,
      alignment_aliases_loaded: [...aliasIndex.values()].reduce((sum, rows) => sum + rows.length, 0),
      subject_theme_bridges: args.useSubjectThemeBridges ? args.subjectThemeBridges : null,
      subject_theme_bridges_loaded: bridgeIndex.loaded,
      reviewed_alias_alignment_policy: {
        scope: 'standard_code',
        optional_filters: ['subject_slug', 'grade_band', 'editions', 'unit_titles'],
        source_file: args.alignmentAliases
      },
      strong_field_alignment_policy: {
        subjects: ['science'],
        subdomain_pattern: '^\\d+\\.\\d+\\s',
        min_han_keyword_chars: FIELD_ALIGNMENT_MIN_HAN_CHARS,
        required_fields: ['standard'],
        min_evidence_fields: 2
      },
      reviewed_subject_theme_bridge_policy: {
        source_file: args.subjectThemeBridges,
        eligible_alignment: 'reviewed_subject_theme_bridge',
        required_scope: 'standard_code_or_progression_group',
        source_review_required: true,
        publication_gate_still_required: true
      }
    },
    summary,
    warnings,
    matches,
    unmatched_standards: unmatchedStandards
  }

  writeJson(args.out, output)
  if (args.summaryOut) {
    mkdirSync(dirname(args.summaryOut), { recursive: true })
    writeFileSync(args.summaryOut, markdownSummary(output))
  }
  console.log(JSON.stringify({
    wrote: args.out,
    summary_out: args.summaryOut || null,
    ...summary
  }, null, 2))
}

main()
