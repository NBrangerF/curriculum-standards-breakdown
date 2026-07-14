import { projectStandard } from './fieldsets.js'
import { ensureArray, ensureObject, normalizeStandard } from './normalize.js'
import type {
    Fieldset,
    JsonObject,
    SmartSearchRequest,
    SmartSearchResponse,
    SmartSearchResult,
    StandardRecord
} from './types.js'

const SUBJECT_ALIASES: Record<string, string[]> = {
    chinese: ['语文', '中文', 'chinese'],
    math: ['数学', 'math', 'mathematics'],
    english: ['英语', '英文', 'english'],
    science: ['科学', 'science'],
    morality_law: ['道德与法治', '道法', 'morality', 'law'],
    history: ['历史', 'history'],
    geography: ['地理', 'geography'],
    pe: ['体育与健康', '体育', 'pe'],
    arts: ['艺术', '美术', '音乐', '舞蹈', '戏剧', '影视', 'art'],
    labor: ['劳动', '劳动教育', 'labor'],
    it: ['信息科技', '信息技术', 'it']
}

// These names follow the current public skills taxonomy. They are query hints only;
// an inferred skill is never written back to the canonical standard data.
const SKILL_ALIASES: Record<string, string[]> = {
    TS1: ['批判性思维', '问题解决', '分析', '判断', '推理', '证据'],
    TS2: ['创新', '创意', '创造性实践', '设计', '想象'],
    TS3: ['学习者能动性', '自主学习', '自我管理', '反思', '目标管理'],
    TS4: ['协作', '合作', '共同体行动', '团队', '社会参与'],
    TS5: ['沟通', '表达', '交流', '写作', '呈现'],
    TS6: ['数字素养', '信息素养', '媒介素养', '数据', '信息技术'],
    TS7: ['全球公民', '可持续发展', '伦理', '责任', '文化理解']
}

const GRADE_PATTERNS: Array<[RegExp, string]> = [
    [/(?:一|1)\s*[-—至到]\s*(?:二|2)年级|一二年级|第一学段/u, 'H1'],
    [/(?:三|3)\s*[-—至到]\s*(?:四|4)年级|三四年级|第二学段/u, 'H2'],
    [/(?:五|5)\s*[-—至到]\s*(?:六|6)年级|五六年级|第三学段/u, 'H3'],
    [/(?:七|7)年级|初一|H4G7/i, 'H4G7'],
    [/(?:八|8)年级|初二|H4G8/i, 'H4G8'],
    [/(?:九|9)年级|初三|H4G9/i, 'H4G9']
]

const STOP_WORDS = new Set(['学生', '学习', '课程', '标准', '课标', '教学', '相关', '能够', '通过', '进行', '一个', '一些', '如何', '需要', '适合', '内容', '活动'])
const SEARCH_FIELDS: Array<[string, number]> = [
    ['standard', 1],
    ['standard_title', 0.92],
    ['domain', 0.78],
    ['subdomain', 0.76],
    ['display_subcategory', 0.72],
    ['context', 0.58],
    ['practice', 0.54],
    ['teaching_tip', 0.46],
    ['assessment_evidence_type', 0.42]
]

function unique<T>(items: T[]): T[] {
    return [...new Set(items)]
}

function textTokens(value: unknown): string[] {
    const text = String(value || '').toLowerCase().trim()
    if (!text) return []
    const tokens = text
        .split(/[\s,，.。;；:：、/|()[\]{}"'“”‘’<>《》!?！？\n\r\t—-]+/u)
        .map(item => item.trim())
        .filter(item => item.length >= 2 && !STOP_WORDS.has(item))
    const cjk = text.replace(/[^\u4e00-\u9fff]/gu, '')
    for (let index = 0; index < cjk.length - 1; index += 1) tokens.push(cjk.slice(index, index + 2))
    return unique(tokens).slice(0, 160)
}

function detectAliases(text: string, aliases: Record<string, string[]>): string[] {
    const lower = text.toLowerCase()
    return Object.entries(aliases)
        .filter(([, values]) => values.some(value => lower.includes(value.toLowerCase())))
        .map(([key]) => key)
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function isExcludedAlias(text: string, alias: string): boolean {
    const escaped = escapeRegExp(alias)
    return [
        new RegExp(`(?:除了?|排除|不含|不要|剔除|不是|非)\\s*[^，。；;]{0,12}${escaped}(?:[^，。；;]{0,12}(?:之外|以外|外))?`, 'iu'),
        new RegExp(`${escaped}\\s*[^，。；;]{0,8}(?:除外|排除|不包含|不要)`, 'iu')
    ].some(pattern => pattern.test(text))
}

function detectSubjectIntent(text: string) {
    const included: string[] = []
    const excluded: string[] = []
    for (const [subject, aliases] of Object.entries(SUBJECT_ALIASES)) {
        const matches = aliases.filter(alias => text.toLowerCase().includes(alias.toLowerCase()))
        if (!matches.length) continue
        if (matches.some(alias => isExcludedAlias(text, alias))) excluded.push(subject)
        else included.push(subject)
    }
    return { included: unique(included), excluded: unique(excluded) }
}

function fieldTrust(record: StandardRecord, field: string) {
    const metadata = ensureObject(ensureObject(record.field_provenance)[field])
    return {
        eligible: metadata.rag_eligible !== false,
        provenance: String(metadata.provenance || (field === 'standard' ? ensureObject(record.provenance).provenance || 'extracted' : 'editorial')),
        review_status: String(metadata.review_status || 'unreviewed'),
        confidence: Math.max(0, Math.min(1, Number(metadata.confidence ?? 0.5))),
        quality_flags: ensureArray<string>(metadata.quality_flags).map(String)
    }
}

export function parseSmartSearchQuery(query: string) {
    const text = String(query || '').trim()
    const gradeBands = GRADE_PATTERNS.filter(([pattern]) => pattern.test(text)).map(([, band]) => band)
    const subjectIntent = detectSubjectIntent(text)
    return {
        original: text,
        subjects: subjectIntent.included,
        excluded_subjects: subjectIntent.excluded,
        grade_bands: unique(gradeBands),
        skills: detectAliases(text, SKILL_ALIASES),
        terms: textTokens(text)
    }
}

function mergeFilters(request: SmartSearchRequest, parsed: ReturnType<typeof parseSmartSearchQuery>) {
    const warnings: string[] = []
    const merge = (explicit: string[] | undefined, inferred: string[], label: string) => {
        if (!explicit?.length) return inferred
        if (inferred.length && !inferred.some(value => explicit.includes(value))) {
            warnings.push(`查询中识别到的${label}与显式筛选不一致；已以显式筛选为准。`)
        }
        return unique(explicit)
    }
    const explicitSubjects = unique(request.subjects || [])
    const inferredSubjects = request.inferred_subjects?.length
        ? unique(request.inferred_subjects)
        : parsed.subjects
    const inferredGradeBands = request.inferred_grade_bands?.length
        ? unique(request.inferred_grade_bands)
        : parsed.grade_bands
    const excludedSubjects = unique([
        ...(request.excluded_subjects || []),
        ...(request.inferred_excluded_subjects || []),
        ...parsed.excluded_subjects
    ]).filter(subject => !explicitSubjects.includes(subject))
    const allowedInferredSubjects = inferredSubjects.filter(subject => !excludedSubjects.includes(subject))
    return {
        filters: {
            subjects: merge(request.subjects, allowedInferredSubjects, '学科'),
            excluded_subjects: excludedSubjects,
            grade_bands: merge(request.grade_bands, inferredGradeBands, '学段'),
            domains: unique(request.domains || []),
            // Skill language is broad and polysemous (for example “信息”); inferred
            // skills remain a ranking signal. Only an explicit skill filter is hard.
            skills: merge(request.skills, [], '可迁移技能')
        },
        warnings
    }
}

function mainSkills(record: StandardRecord): string[] {
    return unique([
        ...ensureArray<string>(record.ts_primary),
        ...ensureArray<string>(record.ts_secondary)
    ].map(value => String(value).split('.')[0].toUpperCase()))
}

function matchesHardFilters(record: StandardRecord, filters: ReturnType<typeof mergeFilters>['filters']): boolean {
    if (filters.subjects.length && !filters.subjects.includes(String(record.subject_slug))) return false
    if (filters.excluded_subjects.includes(String(record.subject_slug))) return false
    if (filters.grade_bands.length && !filters.grade_bands.includes(String(record.grade_band))) return false
    if (filters.domains.length && !filters.domains.includes(String(record.domain))) return false
    if (filters.skills.length && !filters.skills.some(skill => mainSkills(record).includes(skill))) return false
    return true
}

function scoreRecord(recordInput: StandardRecord, terms: string[], filters: ReturnType<typeof mergeFilters>['filters'], include?: Fieldset[]): SmartSearchResult {
    const record = normalizeStandard(recordInput)
    const matchedFields: SmartSearchResult['matched_fields'] = []
    let weightedOverlap = 0
    let availableWeight = 0
    let qualityTotal = 0
    let qualityWeight = 0

    for (const [field, weight] of SEARCH_FIELDS) {
        const value = record[field]
        const trust = fieldTrust(record, field)
        if (!value || !trust.eligible) continue
        const lower = String(value).toLowerCase()
        const matched = terms.filter(term => lower.includes(term)).slice(0, 10)
        availableWeight += weight
        qualityTotal += trust.confidence * weight
        qualityWeight += weight
        if (!matched.length) continue
        const coverage = Math.min(1, matched.length / Math.max(2, Math.min(terms.length, 8)))
        weightedOverlap += coverage * weight
        matchedFields.push({
            field,
            matched_terms: unique(matched),
            excerpt: String(value).slice(0, 180),
            provenance: trust.provenance,
            review_status: trust.review_status,
            confidence: trust.confidence,
            quality_flags: trust.quality_flags
        })
    }

    const lexical = availableWeight ? Math.min(1, weightedOverlap / Math.min(2.4, availableWeight)) : 0
    const structuralSignals = [
        filters.subjects.length ? filters.subjects.includes(String(record.subject_slug)) : null,
        filters.grade_bands.length ? filters.grade_bands.includes(String(record.grade_band)) : null,
        filters.domains.length ? filters.domains.includes(String(record.domain)) : null
    ].filter(value => value !== null)
    const structural = structuralSignals.length ? structuralSignals.filter(Boolean).length / structuralSignals.length : 0.35
    const recordSkills = mainSkills(record)
    const skill = filters.skills.length
        ? filters.skills.filter(value => recordSkills.includes(value)).length / filters.skills.length
        : parsedSkillOverlap(terms, recordSkills)
    const quality = qualityWeight ? qualityTotal / qualityWeight : 0.5
    const score = Number((lexical * 0.62 + structural * 0.16 + skill * 0.12 + quality * 0.1).toFixed(4))
    const topEvidence = matchedFields.slice(0, 3)

    return {
        code: record.code,
        score,
        score_breakdown: {
            lexical: Number(lexical.toFixed(4)),
            structural: Number(structural.toFixed(4)),
            skill: Number(skill.toFixed(4)),
            source_quality: Number(quality.toFixed(4)),
            semantic: 0
        },
        match_type: 'trusted_hybrid_deterministic_v1',
        matched_fields: topEvidence,
        rationale: topEvidence.length
            ? `候选依据：${topEvidence.map(item => `${item.field} 命中“${item.matched_terms.slice(0, 2).join('、')}”`).join('；')}。`
            : '候选主要由显式学科、学段或技能约束筛出，文本证据较弱。',
        requires_human_review: true,
        standard: projectStandard(record, include || ['public'])
    }
}

function parsedSkillOverlap(terms: string[], recordSkills: string[]): number {
    if (!recordSkills.length) return 0
    const inferred = Object.entries(SKILL_ALIASES)
        .filter(([, aliases]) => aliases.some(alias => terms.some(term => alias.includes(term) || term.includes(alias))))
        .map(([code]) => code)
    return inferred.length ? inferred.filter(code => recordSkills.includes(code)).length / inferred.length : 0
}

export function smartSearchStandards(
    standards: StandardRecord[],
    request: SmartSearchRequest
): SmartSearchResponse {
    const parsedQuery = parseSmartSearchQuery(request.query)
    const expansionTerms = unique((request.query_expansion_terms || []).flatMap(textTokens)).slice(0, 80)
    const searchTerms = unique([...parsedQuery.terms, ...expansionTerms])
    const { filters, warnings } = mergeFilters(request, parsedQuery)
    const limit = Math.min(Math.max(request.limit || 12, 1), 50)
    const minScore = request.min_score ?? 0.08
    const candidates = standards.filter(record => matchesHardFilters(record, filters))
    const results = candidates
        .map(record => scoreRecord(record, searchTerms, filters, request.include))
        .filter(result => result.score >= minScore)
        .sort((left, right) => right.score - left.score || left.code.localeCompare(right.code))
        .slice(0, limit)

    if (!results.length) warnings.push('没有候选同时满足当前硬筛选与最低检索分数；请减少筛选条件或改写查询。')
    return {
        query: request.query,
        parsed_query: {
            ...parsedQuery,
            query_expansion_terms: unique(request.query_expansion_terms || []).slice(0, 12)
        },
        applied_filters: filters,
        results,
        total_candidates: candidates.length,
        retrieval_version: 'trusted-hybrid-v1',
        semantic_provider: 'none',
        warnings: unique(warnings)
    }
}
