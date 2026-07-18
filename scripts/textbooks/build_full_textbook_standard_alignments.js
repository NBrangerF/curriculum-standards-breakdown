#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const ROOT = resolve(import.meta.dirname, '../..')
const CURRENT_PATH = join(ROOT, 'data/textbooks/library-state/CURRENT.json')
const STRUCTURE_ROOT = join(ROOT, 'data/textbooks/derived/by-edition')
const STANDARD_ROOT = join(ROOT, 'public/data/by_subject')
const TEXTBOOK_INDEX = join(ROOT, 'generated/textbook_evidence/china_textbook_index.json')
const DEFAULT_OUT = join(ROOT, 'data/textbooks/derived/textbook_standard_alignment_index.json')
const ALGORITHM_VERSION = 'full-alignment-v1'
const STANDARD_FIELDS = ['domain', 'subdomain', 'standard', 'context', 'practice', 'teaching_tip', 'assessment_evidence_type']
const FIELD_WEIGHTS = { domain: 1.5, subdomain: 2.2, standard: 2, context: 1, practice: 1.1, teaching_tip: 0.7, assessment_evidence_type: 0.7 }
const STOP_TOKENS = new Set([
  '义务', '教育', '教科', '教科书', '教材', '课程', '标准', '年级', '上册', '下册', '全一册',
  '学生', '学习', '活动', '能够', '能在', '通过', '理解', '认识', '了解', '掌握', '运用', '形成',
  '发展', '进行', '尝试', '体验', '知道', '可以', '相关', '基本', '初步', '要求', '内容', '任务',
  '目录', '语文', '英语', '数学', '科学', '化学', '物理', '生物', '地理', '历史', '艺术', '音乐',
  '美术', '体育', '劳动', '健康', '单元', '章节', '部分'
])
const FALLBACK_MAPPINGS = {
  chinese: [{ subject_slug: 'chinese', evidence_role: 'direct_textbook' }],
  math: [{ subject_slug: 'math', evidence_role: 'direct_textbook' }],
  english: [{ subject_slug: 'english', evidence_role: 'direct_textbook' }],
  pe: [{ subject_slug: 'pe', evidence_role: 'direct_textbook' }],
  morality_law: [{ subject_slug: 'morality_law', evidence_role: 'direct_textbook' }],
  science: [{ subject_slug: 'science', evidence_role: 'direct_textbook' }],
  physics: [{ subject_slug: 'science', evidence_role: 'discipline_textbook' }],
  chemistry: [{ subject_slug: 'science', evidence_role: 'discipline_textbook' }],
  biology: [{ subject_slug: 'science', evidence_role: 'discipline_textbook' }],
  geography: [{ subject_slug: 'science', evidence_role: 'adjacent_discipline_textbook' }],
  history: [{ subject_slug: 'morality_law', evidence_role: 'adjacent_discipline_textbook' }],
  art: [{ subject_slug: 'arts', evidence_role: 'discipline_textbook' }],
  music: [{ subject_slug: 'arts', evidence_role: 'discipline_textbook' }],
  arts: [{ subject_slug: 'arts', evidence_role: 'direct_textbook' }]
}

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, minCandidateScore: 0.12, machineScore: 0.48, maxMatchesPerUnit: 4 }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.out = resolve(argv[++i])
    else if (argv[i] === '--min-candidate-score') args.minCandidateScore = Number(argv[++i])
    else if (argv[i] === '--machine-score') args.machineScore = Number(argv[++i])
    else if (argv[i] === '--max-matches-per-unit') args.maxMatchesPerUnit = Number(argv[++i])
  }
  return args
}

function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')) }
function readJsonLines(path) { return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse) }
function writeJson(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`) }
function hash(value, length = 16) { return createHash('sha256').update(String(value)).digest('hex').slice(0, length) }
function countInto(target, key) { target[key || 'missing'] = (target[key || 'missing'] || 0) + 1 }

function gradeBand(grade) {
  if (grade <= 2) return 'H1'
  if (grade <= 4) return 'H2'
  if (grade <= 6) return 'H3'
  return `H4G${grade}`
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/^(?:第[一二三四五六七八九十百\d]+[章节课单元]|(?:starter\s+)?unit\s+[a-z]?\d+|module\s+[a-z]?\d+|\d+(?:\.\d+)*)\s*/iu, '')
    .replace(/[，。！？；：、“”‘’（）()《》【】\[\]·•—–_]/g, ' ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function grams(value, min = 2, max = 6) {
  const compact = value.replace(/\s+/g, '')
  const out = []
  for (let size = min; size <= Math.min(max, compact.length); size += 1) {
    for (let index = 0; index <= compact.length - size; index += 1) out.push(compact.slice(index, index + size))
  }
  return out
}

function tokens(value) {
  const result = new Set()
  for (const part of normalize(value).split(/\s+/).filter(Boolean)) {
    if (/^\d+$/.test(part)) continue
    if (/\p{Script=Han}/u.test(part)) {
      for (const gram of grams(part)) if (!STOP_TOKENS.has(gram)) result.add(gram)
    } else if (part.length >= 3 && !STOP_TOKENS.has(part)) result.add(part)
  }
  return result
}

function loadStandards() {
  const standards = []
  for (const file of readdirSync(STANDARD_ROOT).filter(name => name.endsWith('.json')).sort()) {
    const payload = readJson(join(STANDARD_ROOT, file))
    for (const standard of payload.standards || []) standards.push({ ...standard, subject_slug: standard.subject_slug || basename(file, '.json') })
  }
  return standards.sort((a, b) => a.code.localeCompare(b.code))
}

function loadMappings() {
  if (!existsSync(TEXTBOOK_INDEX)) return new Map()
  const payload = readJson(TEXTBOOK_INDEX)
  return new Map((payload.records || []).map(record => [record.evidence_id, record.standard_subject_mappings || []]))
}

function indexStandards(standards) {
  const groups = new Map()
  for (const standard of standards) {
    const key = `${standard.subject_slug}:${standard.grade_band}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(standard)
  }
  return groups
}

function standardTokenIndex(standards) {
  const rows = standards.map(standard => {
    const fieldTokens = {}
    for (const field of STANDARD_FIELDS) fieldTokens[field] = tokens(standard[field])
    return { standard, fieldTokens }
  })
  const documentFrequency = new Map()
  for (const row of rows) {
    const union = new Set(Object.values(row.fieldTokens).flatMap(set => [...set]))
    for (const token of union) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1)
  }
  return { rows, documentFrequency, size: rows.length }
}

function idf(token, index) { return Math.log(1 + (index.size + 1) / ((index.documentFrequency.get(token) || 0) + 1)) }
function hanLength(value) { return (String(value).match(/\p{Script=Han}/gu) || []).length }

function numericModifierConflicts(unitTitle, standard) {
  const unit = normalize(unitTitle).replace(/\s+/g, '')
  const target = normalize(`${standard.standard || ''} ${standard.subdomain || ''}`).replace(/\s+/g, '')
  const families = [
    { name: 'arity', pattern: /[一二三]元/g },
    { name: 'order', pattern: /[一二三]次/g },
    { name: 'dimension', pattern: /[一二三]维/g }
  ]
  const conflicts = []
  for (const family of families) {
    const unitValues = new Set(unit.match(family.pattern) || [])
    const targetValues = new Set(target.match(family.pattern) || [])
    if (unitValues.size && targetValues.size && ![...unitValues].some(value => targetValues.has(value))) {
      conflicts.push(`${family.name}:${[...unitValues].join('|')}!=${[...targetValues].join('|')}`)
    }
  }
  return conflicts
}

function scoreUnit(row, unitTitle, index) {
  const unitTokens = tokens(unitTitle)
  const matched = new Map()
  let denominator = 0
  for (const token of unitTokens) {
    const weight = idf(token, index) * Math.min(3.2, 0.6 + token.length * 0.35)
    denominator += weight
    for (const [field, fieldTokens] of Object.entries(row.fieldTokens)) {
      if (!fieldTokens.has(token)) continue
      const current = matched.get(token) || { token, fields: new Set(), weight: 0 }
      current.fields.add(field)
      current.weight = Math.max(current.weight, weight * (FIELD_WEIGHTS[field] || 1))
      matched.set(token, current)
    }
  }
  const numerator = [...matched.values()].reduce((sum, item) => sum + item.weight, 0)
  const precision = denominator ? Math.min(1, numerator / (denominator * 2.2)) : 0
  const normalizedTitle = normalize(unitTitle).replace(/\s+/g, '')
  const subdomain = normalize(row.standard.subdomain).replace(/\s+/g, '')
  const domain = normalize(row.standard.domain).replace(/\s+/g, '')
  const exactSubdomain = subdomain.length >= 3 && (normalizedTitle.includes(subdomain) || subdomain.includes(normalizedTitle))
  const exactDomain = domain.length >= 3 && (normalizedTitle.includes(domain) || domain.includes(normalizedTitle))
  const longest = Math.max(0, ...[...matched].map(([token]) => hanLength(token) || token.length))
  const longBoost = longest >= 6 ? 0.2 : longest >= 4 ? 0.14 : longest >= 3 ? 0.08 : 0
  const score = Math.max(0, Math.min(1, precision * 0.78 + longBoost + (exactSubdomain ? 0.18 : 0) + (exactDomain ? 0.08 : 0)))
  const evidence = [...matched.values()]
    .sort((a, b) => b.token.length - a.token.length || b.weight - a.weight || a.token.localeCompare(b.token))
    .filter((item, position, all) => !all.slice(0, position).some(parent => parent.token.includes(item.token)))
  return {
    score: Number(score.toFixed(4)),
    matched_keywords: evidence.slice(0, 12).map(item => item.token),
    matched_fields: [...new Set(evidence.flatMap(item => [...item.fields]))].sort(),
    longest_match_length: longest,
    exact_subdomain: exactSubdomain,
    exact_domain: exactDomain,
    modifier_conflicts: numericModifierConflicts(unitTitle, row.standard)
  }
}

function relationType(role) {
  if (role === 'adjacent_discipline_textbook') return 'contextualizes'
  return 'supports'
}

function confidenceFor(score, role) {
  const penalty = role === 'adjacent_discipline_textbook' ? 0.82 : role === 'discipline_textbook' ? 0.94 : 1
  return Number(Math.max(0, Math.min(1, score * penalty)).toFixed(4))
}

function machineChecked(scored, role, threshold) {
  const required = role === 'adjacent_discipline_textbook' ? Math.max(0.62, threshold) : threshold
  return scored.score >= required && scored.longest_match_length >= 4 && scored.matched_fields.length > 0 && !scored.modifier_conflicts.length
}

function build() {
  const args = parseArgs(process.argv.slice(2))
  const current = readJson(CURRENT_PATH)
  const registryPath = join(ROOT, `data/textbooks/library-state/generations/${current.generation_id}/asset_registry.lock.jsonl`)
  const assets = readJsonLines(registryPath).filter(asset => asset.resource_type === 'student_textbook')
  const standards = loadStandards()
  const standardsByScope = indexStandards(standards)
  const mappingsByEvidence = loadMappings()
  const tokenIndexes = new Map()
  const matches = []
  const unitDispositions = []
  const textbookDispositions = []
  const scopeRelations = []
  const legacyApprovedIds = []
  const byStandardSpecific = new Map()
  const byStandardScope = new Map()

  for (const asset of assets.sort((a, b) => a.edition_id.localeCompare(b.edition_id))) {
    const structurePath = join(STRUCTURE_ROOT, `${asset.edition_id}.json`)
    const structure = existsSync(structurePath) ? readJson(structurePath) : { toc: [], page_map: [], alignments: [] }
    const legacyApproved = (structure.alignments || []).filter(row => row.review_status === 'approved')
    for (const row of legacyApproved) legacyApprovedIds.push(row.alignment_id)
    const legacyByKey = new Map(legacyApproved.map(row => [`${row.unit_id}:${row.standard_code}`, row]))
    const evidenceMappings = mappingsByEvidence.get(asset.evidence_id) || []
    const mappings = (evidenceMappings.length ? evidenceMappings : FALLBACK_MAPPINGS[asset.subject_slug] || [])
      .filter(mapping => mapping.subject_slug)
    const band = gradeBand(asset.grade)
    const units = (structure.toc || []).filter(unit => unit.review_status === 'approved')
    const published = []
    const scopeBlocks = []

    for (const mapping of mappings) {
      const scopeStandards = standardsByScope.get(`${mapping.subject_slug}:${band}`) || []
      const standardCodes = scopeStandards.map(standard => standard.code).sort()
      const scope = {
        scope_id: `tcs_${hash(`${asset.edition_id}:${mapping.subject_slug}:${band}:${mapping.evidence_role}`)}`,
        edition_id: asset.edition_id,
        standard_subject_slug: mapping.subject_slug,
        grade_band: band,
        evidence_role: mapping.evidence_role,
        relation_type: mapping.evidence_role === 'adjacent_discipline_textbook' ? 'adjacent_curriculum_scope' : 'curriculum_scope',
        review_status: 'machine_checked',
        algorithm_version: ALGORITHM_VERSION,
        standard_codes: standardCodes
      }
      scopeBlocks.push(scope)
      for (const standardCode of standardCodes) {
        const relation = { ...scope, standard_codes: undefined, standard_code: standardCode }
        scopeRelations.push(relation)
        if (!byStandardScope.has(standardCode)) byStandardScope.set(standardCode, [])
        byStandardScope.get(standardCode).push(relation)
      }

      let tokenIndex = tokenIndexes.get(`${mapping.subject_slug}:${band}`)
      if (!tokenIndex) {
        tokenIndex = standardTokenIndex(scopeStandards)
        tokenIndexes.set(`${mapping.subject_slug}:${band}`, tokenIndex)
      }
      for (const unit of units) {
        const ranked = tokenIndex.rows
          .map(row => ({ standard: row.standard, ...scoreUnit(row, unit.title, tokenIndex) }))
          .filter(row => row.score >= args.minCandidateScore && row.matched_keywords.length)
          .sort((a, b) => b.score - a.score || b.longest_match_length - a.longest_match_length || a.standard.code.localeCompare(b.standard.code))
          .slice(0, args.maxMatchesPerUnit)
        const unitMatches = []
        for (const scored of ranked) {
          const key = `${unit.entry_id}:${scored.standard.code}`
          const legacy = legacyByKey.get(key)
          const reviewStatus = legacy ? 'approved' : machineChecked(scored, mapping.evidence_role, args.machineScore) ? 'machine_checked' : 'candidate'
          const confidence = legacy?.confidence ?? confidenceFor(scored.score, mapping.evidence_role)
          const alignment = {
            alignment_id: legacy?.alignment_id || `tca_${hash(`${asset.edition_id}:${unit.entry_id}:${scored.standard.code}:${ALGORITHM_VERSION}`)}`,
            edition_id: asset.edition_id,
            unit_id: unit.entry_id,
            unit_title: unit.title,
            standard_code: scored.standard.code,
            standard_text: scored.standard.standard || '',
            subject_slug: mapping.subject_slug,
            grade_band: band,
            relation_type: legacy?.relation_type || relationType(mapping.evidence_role),
            evidence_role: mapping.evidence_role,
            confidence,
            score: scored.score,
            matched_keywords: scored.matched_keywords,
            matched_fields: scored.matched_fields,
            modifier_conflicts: scored.modifier_conflicts,
            longest_match_length: scored.longest_match_length,
            alignment_method: legacy ? 'legacy_human_review' : 'constrained_concept_idf',
            algorithm_version: ALGORITHM_VERSION,
            rationale: legacy?.rationale || `教材条目“${unit.title}”与课标 ${scored.standard.code} 在${scored.matched_fields.join('、')}字段命中概念：${scored.matched_keywords.join('、')}。`,
            review_status: reviewStatus,
            publication_status: ['approved', 'machine_checked'].includes(reviewStatus) ? 'published' : 'review_queue',
            evidence_id: legacy?.evidence_id || asset.evidence_id,
            pdf_page: unit.pdf_page ?? null,
            printed_page: unit.printed_page ?? null
          }
          matches.push(alignment)
          unitMatches.push(alignment)
          if (alignment.publication_status === 'published') {
            published.push(alignment)
            if (!byStandardSpecific.has(alignment.standard_code)) byStandardSpecific.set(alignment.standard_code, [])
            byStandardSpecific.get(alignment.standard_code).push(alignment)
          }
        }
        unitDispositions.push({
          edition_id: asset.edition_id,
          unit_id: unit.entry_id,
          unit_title: unit.title,
          standard_subject_slug: mapping.subject_slug,
          grade_band: band,
          status: unitMatches.some(row => row.publication_status === 'published') ? 'aligned' : unitMatches.length ? 'candidate_only' : 'no_reliable_match',
          match_count: unitMatches.length,
          published_match_count: unitMatches.filter(row => row.publication_status === 'published').length
        })
      }
    }

    for (const legacy of legacyApproved) {
      if (published.some(row => row.alignment_id === legacy.alignment_id)) continue
      const enrichedLegacy = {
        ...legacy,
        edition_id: asset.edition_id,
        evidence_role: legacy.evidence_role || 'legacy_reviewed_textbook_evidence',
        score: legacy.score ?? legacy.confidence ?? 1,
        matched_keywords: legacy.matched_keywords?.length ? legacy.matched_keywords : ['人工复核'],
        matched_fields: legacy.matched_fields?.length ? legacy.matched_fields : ['legacy_review'],
        longest_match_length: legacy.longest_match_length ?? 0,
        publication_status: 'published',
        evidence_id: legacy.evidence_id || asset.evidence_id,
        alignment_method: legacy.alignment_method || 'legacy_human_review',
        algorithm_version: legacy.algorithm_version || 'pre-full-alignment'
      }
      published.push(enrichedLegacy)
      matches.push(enrichedLegacy)
      if (!byStandardSpecific.has(enrichedLegacy.standard_code)) byStandardSpecific.set(enrichedLegacy.standard_code, [])
      byStandardSpecific.get(enrichedLegacy.standard_code).push(enrichedLegacy)
      const disposition = unitDispositions.find(row => row.edition_id === asset.edition_id && row.unit_id === enrichedLegacy.unit_id)
      if (disposition) {
        disposition.status = 'aligned'
        disposition.match_count += 1
        disposition.published_match_count += 1
      }
    }
    structure.alignments = [...new Map(published.map(row => [row.alignment_id, row])).values()]
      .sort((a, b) => a.unit_id.localeCompare(b.unit_id) || a.standard_code.localeCompare(b.standard_code))
    structure.standard_scopes = scopeBlocks
    writeJson(structurePath, structure)
    textbookDispositions.push({
      edition_id: asset.edition_id,
      evidence_id: asset.evidence_id,
      subject_slug: asset.subject_slug,
      grade: asset.grade,
      grade_band: band,
      toc_unit_count: units.length,
      processed_unit_scope_count: units.length * mappings.length,
      published_specific_match_count: published.length,
      candidate_specific_match_count: matches.filter(row => row.edition_id === asset.edition_id && row.review_status === 'candidate').length,
      scope_standard_count: scopeBlocks.reduce((sum, scope) => sum + scope.standard_codes.length, 0),
      standard_subject_mappings: mappings.map(mapping => ({
        subject_slug: mapping.subject_slug,
        evidence_role: mapping.evidence_role,
        source: evidenceMappings.length ? 'textbook_evidence_index' : 'subject_policy_fallback'
      })),
      structure_status_reason: units.length
        ? null
        : structure.audit?.ocr?.status || (structure.toc?.length ? 'no_approved_toc_entries' : 'no_toc_detected'),
      status: !mappings.length ? 'no_standard_subject_mapping' : !units.length ? 'scope_only_no_toc' : published.length ? 'unit_aligned' : 'scope_aligned_unit_review_needed'
    })
  }

  const standardDispositions = standards.map(standard => {
    const specific = byStandardSpecific.get(standard.code) || []
    const scopes = byStandardScope.get(standard.code) || []
    const status = specific.length ? 'unit_aligned' : scopes.length ? 'scope_aligned_no_unit_evidence' : 'gap_no_textbook_scope'
    return {
      standard_code: standard.code,
      subject_slug: standard.subject_slug,
      grade_band: standard.grade_band,
      status,
      gap_reason: status === 'gap_no_textbook_scope' ? 'current_library_has_no_mapped_textbook_for_subject_and_grade_band' : null,
      specific_match_count: specific.length,
      textbook_scope_count: new Set(scopes.map(row => row.edition_id)).size
    }
  })
  const summary = {
    textbooks: assets.length,
    textbooks_by_status: {},
    toc_units: unitDispositions.length,
    units_by_status: {},
    standards: standards.length,
    standards_by_status: {},
    specific_matches: matches.length,
    published_specific_matches: matches.filter(row => row.publication_status === 'published').length,
    approved_matches: matches.filter(row => row.review_status === 'approved').length,
    machine_checked_matches: matches.filter(row => row.review_status === 'machine_checked').length,
    candidate_matches: matches.filter(row => row.review_status === 'candidate').length,
    scope_relations: scopeRelations.length,
    legacy_approved_relations: legacyApprovedIds.length
  }
  for (const row of textbookDispositions) countInto(summary.textbooks_by_status, row.status)
  for (const row of unitDispositions) countInto(summary.units_by_status, row.status)
  for (const row of standardDispositions) countInto(summary.standards_by_status, row.status)
  const output = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_generation_id: current.generation_id,
    algorithm_version: ALGORITHM_VERSION,
    policy: {
      grade_band_mapping: { H1: 'grades_1_2', H2: 'grades_3_4', H3: 'grades_5_6', H4G7: 'grade_7', H4G8: 'grade_8', H4G9: 'grade_9' },
      min_candidate_score: args.minCandidateScore,
      machine_checked_score: args.machineScore,
      max_matches_per_unit: args.maxMatchesPerUnit,
      scope_relations_are_not_unit_evidence: true,
      adjacent_discipline_relations_are_not_direct_support: true
    },
    summary,
    legacy_approved_alignment_ids: [...new Set(legacyApprovedIds)].sort(),
    textbook_dispositions: textbookDispositions,
    unit_dispositions: unitDispositions,
    standard_dispositions: standardDispositions,
    matches,
    scope_relations: scopeRelations
  }
  writeJson(args.out, output)
  console.log(JSON.stringify({ wrote: args.out, summary }, null, 2))
}

build()
