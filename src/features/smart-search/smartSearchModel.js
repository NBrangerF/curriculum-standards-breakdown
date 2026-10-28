export const EXAMPLES = [
    '第二学段，查找语文以外与阅读理解和信息提取相关的课程标准',
    '三四年级科学中，适合培养证据推理的观察活动',
    '七年级数学里与数据分析和表达有关的标准'
]

export const SUBJECT_LABELS = {
    chinese: '语文', math: '数学', english: '英语', science: '科学', morality_law: '道德与法治',
    pe: '体育与健康', arts: '艺术', labor: '劳动', it: '信息科技', history: '历史', geography: '地理'
}

export const GRADE_LABELS = {
    H1: '1–2 年级', H2: '3–4 年级', H3: '5–6 年级', H4G7: '七年级', H4G8: '八年级', H4G9: '九年级'
}

export const FIELD_LABELS = {
    standard: '标准正文',
    standard_title: '标题',
    domain: '领域',
    subdomain: '子领域',
    display_subcategory: '分类',
    context: '情境说明',
    practice: '实践建议',
    teaching_tip: '教学提示',
    assessment_evidence_type: '评价证据'
}

export const PROVENANCE_LABELS = {
    official: '课标原文',
    extracted: '课标章节抽取',
    editorial: 'kebiao 编辑整理',
    rule_generated: '规则生成',
    ai_generated: 'AI 生成'
}

const SUBJECT_COLOR_TOKENS = { morality_law: 'morality' }

export function subjectColor(slug) {
    return slug ? `var(--subject-${SUBJECT_COLOR_TOKENS[slug] || slug}, var(--kb-gold))` : 'var(--kb-gold)'
}

export const NO_IGNORED = Object.freeze({ subjects: [], excluded_subjects: [], grade_bands: [], core_terms: [] })

/** Topic terms not contained in a longer one: "数据分析" stands for its fragments "数据" and "分析". */
function topicHeads(values) {
    return values.filter(value => !values.some(other => other !== value && other.includes(value)))
}

/**
 * The constraints a reader can see and remove, read from the unrelaxed response for this query.
 * `ai` marks constraints only the model found; `evidence` is the quoted span it relied on.
 */
export function understoodConstraints(result) {
    if (!result) return []
    const filters = result.applied_filters || {}
    const parsed = result.parsed_query || {}
    const interpretation = result.query_interpretation || {}
    const evidence = interpretation.constraint_evidence || []
    const spanFor = (kind, value) => evidence.find(item => item.kind === kind && item.value === value)?.evidence_span || ''
    const fromModel = (list, value) => !(list || []).includes(value)
    const chips = []
    for (const value of filters.grade_bands || []) {
        chips.push({ kind: 'grade_bands', value, group: '学段', label: GRADE_LABELS[value] || value, ai: fromModel(parsed.grade_bands, value), evidence: spanFor('grade_band', value) })
    }
    for (const value of filters.subjects || []) {
        chips.push({ kind: 'subjects', value, group: '学科', label: SUBJECT_LABELS[value] || value, ai: fromModel(parsed.subjects, value), evidence: spanFor('subject', value) })
    }
    for (const value of filters.excluded_subjects || []) {
        chips.push({ kind: 'excluded_subjects', value, group: '排除', label: SUBJECT_LABELS[value] || value, ai: fromModel(parsed.excluded_subjects, value), evidence: spanFor('excluded_subject', value) })
    }
    const topics = result.query_plan?.topics || []
    const heads = topicHeads(topics.map(topic => topic.value))
    for (const topic of topics.filter(item => heads.includes(item.value))) {
        chips.push({ kind: 'core_terms', value: topic.value, group: '主题', label: topic.value, ai: topic.source === 'model_supported', evidence: '' })
    }
    return chips
}

export function isIgnored(ignored, chip) {
    return (ignored[chip.kind] || []).includes(chip.value)
}

export function toggleIgnored(ignored, chip) {
    const current = ignored[chip.kind] || []
    return {
        ...ignored,
        [chip.kind]: current.includes(chip.value) ? current.filter(value => value !== chip.value) : [...current, chip.value]
    }
}

export function hasIgnored(ignored) {
    return Object.values(ignored).some(list => list.length > 0)
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/** Splits text into plain and matched parts, longest terms first so "数据分析" wins over "数据". */
export function splitMatches(text, terms) {
    const source = String(text || '')
    const usable = [...new Set((terms || []).map(term => String(term).trim()).filter(term => term.length > 0))]
        .sort((left, right) => right.length - left.length)
    if (!source || !usable.length) return [{ text: source, match: false }]
    const pattern = new RegExp(`(${usable.map(escapeRegExp).join('|')})`, 'giu')
    return source.split(pattern).filter(Boolean).map(part => ({
        text: part,
        match: usable.some(term => term.toLowerCase() === part.toLowerCase())
    }))
}

/** What to tell a teacher when the request itself fails; the raw server message stays out of the page. */
export function friendlySearchError(error) {
    if (error?.status === 429) return { title: '检索得有点频繁', detail: '为保护服务，每分钟的 AI 检索次数有限。请稍等一分钟再试。' }
    if (error?.status === 422) return { title: '这句话需要调整一下', detail: '请用 2 到 500 个字描述学段、学科或主题，再检索一次。' }
    if (!error?.status) return { title: '网络好像断开了', detail: '检查网络连接后，再试一次。' }
    return { title: '检索服务暂时没有响应', detail: '这不是你的问题。请稍后再试，或换一种说法。' }
}
