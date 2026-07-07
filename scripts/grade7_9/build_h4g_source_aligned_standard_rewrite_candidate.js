#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  TARGET_GRADE_BANDS,
  countInto,
  markdownCell,
  normalizeText,
  recordsByGroup,
  shortHash,
  subjectFiles,
  writeJson,
  writeText,
  readJson
} from './h4g_supplemental_pipeline_utils.js'
import { SUBJECTS } from './config.js'

const CONTRACT_VERSION = 'H4G_SOURCE_ALIGNED_STANDARD_REWRITE_CONTRACT_v0.1'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT_DIR = 'generated/h4g_source_aligned_standard_rewrite'

const FORBIDDEN_TEMPLATE_TOKENS = [
  '围绕“',
  '关键要求',
  '候选',
  '本次补强',
  '原始标准',
  '可预览',
  '可观察',
  '可评价',
  '能结合“',
  '核心要求'
]

const FORBIDDEN_FLUENCY_TOKENS = [
  '能并',
  '综合运用能',
  '能第三学段',
  '能第四学段',
  '能写作有',
  '能写作时',
  '能时能',
  '时能时能',
  '能不同',
  '功，能',
  '，能量',
  '，能源'
]

const GRADE_PROFILES = {
  H4G7: {
    label: '七年级',
    demand: '识别、理解、描述、单步骤应用、熟悉情境',
    context: {
      chinese: '熟悉的语文阅读、交流和表达任务',
      math: '熟悉的数学或生活问题',
      english: '熟悉主题、简短语篇或基础交际任务',
      science: '可见现象和基础探究任务',
      morality_law: '个人成长、校园生活和熟悉社会情境',
      it: '熟悉数字工具、数据活动或简单问题',
      arts: '熟悉作品、材料、动作和基本技法',
      pe: '基础练习、规则学习和健康情境',
      labor: '家庭、学校或熟悉劳动任务'
    }
  },
  H4G8: {
    label: '八年级',
    demand: '比较、整合、解释、推断、多步骤应用、关系化理解',
    context: {
      chinese: '多文本、专题阅读或结构化表达任务',
      math: '包含多个条件或关系的数学问题',
      english: '较长语篇、多信息任务或互动交流活动',
      science: '多因素现象和连续探究任务',
      morality_law: '家庭、校园和社会案例',
      it: '较完整的信息活动或数字项目',
      arts: '多样作品、主题表达或表现任务',
      pe: '组合技能、合作竞赛和健康管理任务',
      labor: '综合劳动任务或协作项目'
    }
  },
  H4G9: {
    label: '九年级',
    demand: '迁移、评价、论证、综合探究、真实情境问题解决',
    context: {
      chinese: '综合阅读、真实议题或开放表达任务',
      math: '综合数学问题或真实应用情境',
      english: '多语篇、真实交际或跨文化情境',
      science: '综合科学问题或真实问题情境',
      morality_law: '公共议题、法治案例和国家社会情境',
      it: '真实数字化问题或智能系统情境',
      arts: '综合艺术任务和文化情境',
      pe: '专项运动、真实比赛或自主管理情境',
      labor: '真实需求、服务场景或创新劳动项目'
    }
  }
}

const SOURCE_CUE_WEIGHTS = {
  H4G7: ['理解', '了解', '知道', '识别', '描述', '基本', '简单', '熟悉', '掌握', '感受', '体验'],
  H4G8: ['比较', '分析', '解释', '整合', '应用', '运用', '组织', '设计', '调查', '合作', '多步骤'],
  H4G9: ['评价', '论证', '迁移', '综合', '优化', '反思', '判断', '独立', '真实', '责任', '创新']
}

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    outDir: DEFAULT_OUT_DIR,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out-dir') args.outDir = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:h4g-source-aligned-standard-rewrite-candidate -- --strict

Builds a full H4G G7/G8/G9 source-aligned rewrite candidate from the current
corrected public source anchors. Writes only under generated/.`)
}

function copyJsonTree(sourceRoot, targetRoot) {
  mkdirSync(targetRoot, { recursive: true })
  for (const name of readdirSync(sourceRoot)) {
    const source = join(sourceRoot, name)
    const target = join(targetRoot, name)
    const stat = statSync(source)
    if (stat.isDirectory()) copyJsonTree(source, target)
    else if (name.endsWith('.json')) copyFileSync(source, target)
  }
}

function isH4G(record) {
  return TARGET_GRADE_BANDS.includes(record.grade_band)
}

function normalizeClause(value) {
  let text = normalizeText(value)
  text = text.replace(/^[第]?[三四]学段结束时[，,]?/u, '')
  text = text.replace(/^学生能够/u, '能')
  text = text.replace(/^学生能/u, '能')
  text = text.replace(/^并能/u, '能')
  text = text.replace(/^并/u, '')
  text = text.replace(/^写作(?!时能)/u, '写作时能')
  text = text.replace(/^不同/u, '说明不同')
  text = text.replace(/[。；;，,]+$/u, '')
  text = text.replace(/\s+/g, '')
  text = text.replace(/^(阅读[^，,。；;]{2,24})能(?=区分|描述|说明|运用|比较|完成|获取|表达|判断|解释|设计|提出|识别|说出|列举|分析|理解|知道|掌握|观察|记录|参与|形成)/u, '$1，能')
  text = text.replace(/能并/u, '能')
  text = text.replace(/，+/gu, '，')
  return text
}

function splitClauses(text) {
  const normalized = normalizeText(text)
  if (!normalized) return []
  const coarse = normalized.split(/[。；;]/u)
  const clauses = []
  for (const part of coarse) {
    const subparts = part.length > 42 ? part.split(/[，,]/u) : [part]
    for (const subpart of subparts) {
      const clause = normalizeClause(subpart)
      if (clause.length >= 4 && !/^[第]?[三四]学段结束时$/u.test(clause) && !clauses.includes(clause)) clauses.push(clause)
    }
  }
  return clauses
}

function cueScore(clause, gradeBand) {
  const cues = SOURCE_CUE_WEIGHTS[gradeBand] || []
  let score = 0
  for (const cue of cues) {
    if (clause.includes(cue)) score += 2
  }
  if (gradeBand === 'H4G7' && clause.length <= 24) score += 1
  if (gradeBand === 'H4G8' && clause.length > 18 && clause.length <= 42) score += 1
  if (gradeBand === 'H4G9' && clause.length >= 22) score += 1
  return score
}

function isSimilar(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const aChars = new Set([...a])
  const bChars = new Set([...b])
  const overlap = [...aChars].filter(ch => bChars.has(ch)).length
  return overlap / Math.max(1, Math.min(aChars.size, bChars.size)) > 0.82
}

function sortedClausesForGrade(clauses, gradeBand) {
  return [...clauses].sort((a, b) => {
    const score = cueScore(b, gradeBand) - cueScore(a, gradeBand)
    if (score) return score
    return clauses.indexOf(a) - clauses.indexOf(b)
  })
}

function chooseClauses(record) {
  const primary = splitClauses(record.source_standard_original)
  const supporting = splitClauses(record.supporting_source_standard_original)
    .filter(clause => !primary.some(item => isSimilar(item, clause)))
  const previous = splitClauses(record.previous_source_standard_original)
    .filter(clause => !primary.some(item => isSimilar(item, clause)))
    .filter(clause => !supporting.some(item => isSimilar(item, clause)))

  const rankedPrimary = sortedClausesForGrade(primary, record.grade_band)
  const rankedSupport = sortedClausesForGrade([...supporting, ...previous], record.grade_band)
  const chosen = []
  for (const clause of rankedPrimary) {
    if (!chosen.some(item => isSimilar(item, clause))) chosen.push(clause)
    if (chosen.length >= 2) break
  }
  for (const clause of rankedSupport) {
    if (!chosen.some(item => isSimilar(item, clause))) chosen.push(clause)
    if (chosen.length >= 3) break
  }
  if (!chosen.length && primary.length) chosen.push(primary[0])
  return {
    chosen,
    primary,
    supporting,
    previous
  }
}

function adaptGradeDemand(text, gradeBand) {
  let value = normalizeClause(text)
  if (gradeBand === 'H4G7') {
    value = value.replace(/综合运用/gu, '尝试运用')
    value = value.replace(/独立组织与开展/gu, '在指导下组织与开展')
    value = value.replace(/独立/gu, '在支架下')
    value = value.replace(/评价/gu, '初步判断')
    value = value.replace(/价值判断/gu, '有依据地说明自己的判断')
    value = value.replace(/优化/gu, '改进')
  } else if (gradeBand === 'H4G8') {
    value = value.replace(/综合运用/gu, '整合运用')
    value = value.replace(/评价/gu, '分析并判断')
  } else if (gradeBand === 'H4G9') {
    if (!/[评价论证迁移综合优化反思]/u.test(value)) {
      const bare = value.replace(/^能/u, '')
      value = bare.startsWith('运用') ? `综合${bare}` : `能综合运用${bare}`
    }
  }
  return value
}

function ensureCapability(text, gradeBand) {
  const value = adaptGradeDemand(text, gradeBand)
  let result = value
  if (/^(能|能够|会|尝试|了解|理解|掌握|认识|运用|应用|设计|分析|比较|评价|综合|迁移|形成|完成|参与|表现|弘扬|尊重|认同|写作时能)/u.test(value)) {
    result = value
  } else if (value.includes('，能')) {
    result = value
  } else {
    result = `能${value}`
  }
  return result
    .replace(/^能并能/u, '能')
    .replace(/^能并/u, '能')
    .replace(/；能并能/gu, '；能')
    .replace(/；能并/gu, '；能')
    .replace(/综合运用能/gu, '能综合运用')
    .replace(/^能写作时能时能/u, '写作时能')
    .replace(/^能写作时能/u, '写作时能')
    .replace(/时能时能/gu, '时能')
}

function subjectContext(record) {
  const profile = GRADE_PROFILES[record.grade_band]
  return profile.context[record.subject_slug] || (record.grade_band === 'H4G7'
    ? '熟悉学习任务'
    : record.grade_band === 'H4G8'
      ? '较复杂学习任务'
      : '综合真实学习任务')
}

function tagNote(record) {
  const tags = [
    record.core_concept_tag,
    record.content_module_tag,
    record.task_group_tag,
    record.learning_theme_tag,
    record.art_discipline_tag,
    record.source_anchor_tags?.core_concept_tag,
    record.source_anchor_tags?.content_module_tag,
    record.source_anchor_tags?.task_group_tag,
    record.source_anchor_tags?.learning_theme_tag,
    record.source_anchor_tags?.art_discipline_tag
  ].filter(Boolean)
  return [...new Set(tags)][0] || ''
}

function buildStandard(record) {
  const { chosen } = chooseClauses(record)
  const context = subjectContext(record)
  const primary = ensureCapability(chosen[0] || record.source_standard_original, record.grade_band)
  const secondary = chosen[1] ? ensureCapability(chosen[1], record.grade_band) : ''
  const tertiary = chosen[2] ? ensureCapability(chosen[2], record.grade_band) : ''
  const tag = tagNote(record)

  const parts = [`在${context}中，${primary}`]
  if (secondary) parts.push(secondary)
  if (tertiary) parts.push(tertiary)
  if (tag && record.subject_slug === 'science') parts.push(`并能结合${tag}说明相关科学概念、探究证据或社会责任`)
  if (tag && record.subject_slug === 'labor') parts.push(`并能保留${tag}的任务群特征`)
  return `${parts.join('；')}。`.replace(/；。$/u, '。')
}

function evidenceSummary(record) {
  const units = Array.isArray(record.textbook_unit_evidence) ? record.textbook_unit_evidence : []
  const textbooks = Array.isArray(record.textbook_evidence) ? record.textbook_evidence : []
  if (units.length) {
    const titles = units.map(item => item.unit_title || item.chapter_title || item.section_title).filter(Boolean).slice(0, 3)
    return titles.length ? `单元证据：${titles.join('、')}` : `单元证据 ${units.length} 条`
  }
  if (textbooks.length) {
    const volumes = textbooks.map(item => item.grade_label || item.volume || item.file_name).filter(Boolean).slice(0, 2)
    return volumes.length ? `教材文件证据：${volumes.join('、')}` : `教材文件证据 ${textbooks.length} 条`
  }
  return '暂无教材文件证据'
}

function sourceExcerpt(text, max = 42) {
  const clauses = splitClauses(text)
  const value = clauses[0] || normalizeText(text)
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function buildGradeSpecificFocus(record, standard) {
  const profile = GRADE_PROFILES[record.grade_band]
  const source = sourceExcerpt(record.source_standard_original)
  const support = normalizeText(record.supporting_source_standard_original)
  const sourceText = normalizeText(record.source_standard_original)
  const supportPart = support && support !== sourceText
    ? `；supporting source 补充 ${sourceExcerpt(support, 34)}`
    : ''
  return `${profile.label}聚焦${profile.demand}；以 corrected source「${source}」为主线${supportPart}；${evidenceSummary(record)}。`
}

function forbiddenHits(...texts) {
  const joined = texts.map(text => normalizeText(text)).join('\n')
  return [...FORBIDDEN_TEMPLATE_TOKENS, ...FORBIDDEN_FLUENCY_TOKENS].filter(token => joined.includes(token))
}

function sourceOverlapScore(record, standard) {
  const source = `${record.source_standard_original || ''}${record.supporting_source_standard_original || ''}`
  const clean = text => normalizeText(text).replace(/[，。；、：:“”《》（）()\s]/gu, '')
  const sourceText = clean(source)
  const standardText = clean(standard)
  if (!sourceText || !standardText) return 0
  const grams = new Set()
  for (let i = 0; i < sourceText.length - 1; i += 1) {
    const gram = sourceText.slice(i, i + 2)
    if (!/[的一是在和与中为对等及或并]/u.test(gram)) grams.add(gram)
  }
  if (!grams.size) return 0
  let hits = 0
  for (const gram of grams) {
    if (standardText.includes(gram)) hits += 1
  }
  return Number((hits / grams.size).toFixed(4))
}

function rewriteRecord(record) {
  const previousStandard = record.standard || ''
  const previousFocus = record.grade_specific_focus || ''
  const standard = buildStandard(record)
  const gradeSpecificFocus = buildGradeSpecificFocus(record, standard)
  const hits = forbiddenHits(standard, gradeSpecificFocus)
  const overlap = sourceOverlapScore(record, standard)
  const candidateId = `sarw-${shortHash([record.code, record.source_anchor_id, standard].join('|'), 16)}`
  return {
    ...record,
    grade_specific_focus: gradeSpecificFocus,
    previous_template_grade_specific_focus: previousFocus,
    previous_template_standard: previousStandard,
    public_write_candidate: false,
    review_status: 'source_aligned_standard_rewrite_candidate_needs_review',
    source_aligned_forbidden_template_hits: hits,
    source_aligned_rewrite_candidate_id: candidateId,
    source_aligned_rewrite_contract_version: CONTRACT_VERSION,
    source_aligned_rewrite_method: 'corrected_source_supporting_source_textbook_evidence',
    source_aligned_rewrite_rationale: `Rewritten from corrected source anchor, supporting source, and ${record.evidence_granularity || 'available'} grade evidence; previous template standard preserved in previous_template_standard.`,
    source_aligned_rewrite_status: hits.length
      ? 'candidate_has_forbidden_template_hits'
      : overlap < 0.12
        ? 'candidate_low_source_overlap_needs_review'
        : 'candidate_needs_review',
    source_aligned_source_overlap: overlap,
    standard,
    standard_text_role: 'source_aligned_grade_display_standard',
    writes_public_data: false
  }
}

function loadPayloads(dataRoot, errors) {
  const payloads = new Map()
  if (!existsSync(dataRoot)) {
    errors.push(`Missing data root: ${dataRoot}`)
    return payloads
  }
  for (const file of subjectFiles(dataRoot)) {
    payloads.set(basename(file, '.json'), readJson(file))
  }
  return payloads
}

function subjectMarkdown(subjectSlug, candidates, summary) {
  const samples = candidates.slice(0, 6)
  return `# H4G Source-Aligned Standard Rewrite Candidate - ${SUBJECTS[subjectSlug]?.subject || subjectSlug}

| Metric | Value |
| --- | ---: |
| records | ${summary.records} |
| groups | ${summary.groups} |
| forbidden hits | ${summary.forbidden_hits} |
| low overlap | ${summary.low_overlap} |

## Samples

${samples.map(item => `### ${item.code}

- corrected source: ${markdownCell(item.source_standard_original)}
- supporting source: ${markdownCell(item.supporting_source_standard_original)}
- previous template: ${markdownCell(item.previous_template_standard)}
- new standard: ${markdownCell(item.standard)}
- focus: ${markdownCell(item.grade_specific_focus)}
- overlap: ${item.source_aligned_source_overlap}
`).join('\n')}
`
}

function overallMarkdown(result) {
  return `# H4G Source-Aligned Standard Rewrite Candidate

Generated at: ${result.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${result.valid} |
| H4G records | ${result.summary.h4g_records} |
| progression groups | ${result.summary.progression_groups} |
| forbidden template hits | ${result.summary.forbidden_hits} |
| low source overlap | ${result.summary.low_overlap} |
| public writes | ${result.writes_public_data} |
| errors | ${result.errors.length} |

## Subject Summary

| Subject | Records | Groups | Forbidden Hits | Low Overlap |
| --- | ---: | ---: | ---: | ---: |
${result.subjects.map(item => `| ${item.subject_slug} | ${item.summary.records} | ${item.summary.groups} | ${item.summary.forbidden_hits} | ${item.summary.low_overlap} |`).join('\n')}

## Errors

${result.errors.length ? result.errors.map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  const payloads = loadPayloads(args.dataRoot, errors)
  const outRoot = args.outDir
  const dataCandidateRoot = join(outRoot, 'data_candidate')
  const bySubjectOut = join(outRoot, 'by_subject')
  const allCandidates = []
  const subjects = []

  if (!errors.length) copyJsonTree(args.dataRoot, dataCandidateRoot)
  mkdirSync(bySubjectOut, { recursive: true })

  for (const [subjectSlug, payload] of payloads) {
    const h4gRows = (payload.standards || []).filter(isH4G)
    const candidates = h4gRows.map(rewriteRecord)
    const candidateByCode = new Map(candidates.map(record => [record.code, record]))
    const nextPayload = {
      ...payload,
      h4g_source_aligned_rewrite_contract_version: CONTRACT_VERSION,
      h4g_source_aligned_rewrite_generated_at: new Date().toISOString(),
      h4g_source_aligned_rewrite_status: 'candidate_needs_audit',
      publication_candidate: true,
      writes_public_data: false,
      standards: (payload.standards || []).map(record => candidateByCode.get(record.code) || record)
    }
    writeJson(join(dataCandidateRoot, 'by_subject', `${subjectSlug}.json`), nextPayload)
    const groups = recordsByGroup(candidates)
    const summary = {
      forbidden_hits: candidates.filter(record => record.source_aligned_forbidden_template_hits.length).length,
      groups: groups.size,
      low_overlap: candidates.filter(record => record.source_aligned_source_overlap < 0.12).length,
      records: candidates.length
    }
    writeJson(join(bySubjectOut, `${subjectSlug}.json`), {
      candidates,
      contract_version: CONTRACT_VERSION,
      generated_at: nextPayload.h4g_source_aligned_rewrite_generated_at,
      summary,
      writes_public_data: false
    })
    writeText(join(bySubjectOut, `${subjectSlug}.md`), subjectMarkdown(subjectSlug, candidates, summary))
    subjects.push({ subject_slug: subjectSlug, subject: SUBJECTS[subjectSlug]?.subject || subjectSlug, summary })
    allCandidates.push(...candidates)
  }

  const groups = recordsByGroup(allCandidates)
  const result = {
    contract_version: CONTRACT_VERSION,
    data_candidate_root: dataCandidateRoot,
    errors,
    generated_at: new Date().toISOString(),
    purpose: 'h4g_source_aligned_standard_rewrite_candidate',
    subjects,
    summary: {
      forbidden_hits: allCandidates.filter(record => record.source_aligned_forbidden_template_hits.length).length,
      h4g_records: allCandidates.length,
      low_overlap: allCandidates.filter(record => record.source_aligned_source_overlap < 0.12).length,
      progression_groups: groups.size
    },
    valid: errors.length === 0,
    writes_public_data: false
  }

  writeJson(join(outRoot, 'source_aligned_standard_rewrite_candidates.json'), {
    contract_version: CONTRACT_VERSION,
    generated_at: result.generated_at,
    source_aligned_standard_rewrite_candidates: allCandidates,
    summary: result.summary,
    writes_public_data: false
  })
  writeJson(join(outRoot, 'source_aligned_standard_rewrite_candidate_summary.json'), result)
  writeText(join(outRoot, 'source_aligned_standard_rewrite_candidate_summary.md'), overallMarkdown(result))
  return result
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const result = build(args)
console.log(JSON.stringify({
  forbidden_hits: result.summary.forbidden_hits,
  h4g_records: result.summary.h4g_records,
  low_overlap: result.summary.low_overlap,
  progression_groups: result.summary.progression_groups,
  valid: result.valid,
  writes_public_data: result.writes_public_data
}, null, 2))

if (!result.valid && args.strict) process.exitCode = 1
