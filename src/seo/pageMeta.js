// Page titles and descriptions, shared by the prerender script (Node) and the React pages.
// Keep this file free of browser APIs and bundler-only imports.

export const SITE_URL = 'https://www.kebiao.org'
export const SITE_NAME = 'kebiao 课标'
export const STANDARDS_DOC = '义务教育课程标准（2022年版）'
export const V2_STANDARDS_DOC = '义务教育课程标准（2022年版2025年修订）'

// Share-card URLs carry a version that changes with the data or the card design
// (bump CARD_DESIGN after changing apps/cards/src/render.ts), so caches pick up new images.
export const CARD_DESIGN = 'c3'
export function cardVersion(dataVersion) {
    let hash = 2166136261
    for (const char of `${dataVersion}:${CARD_DESIGN}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
    return (hash >>> 0).toString(36)
}

const GRADE_LABELS = {
    H1: '1–2年级',
    H2: '3–4年级',
    H3: '5–6年级',
    H4G7: '七年级',
    H4G8: '八年级',
    H4G9: '九年级',
    H4: '7–9年级'
}

export function gradeLabel(standard) {
    return GRADE_LABELS[standard?.grade_band] || (standard?.grade_range ? `${standard.grade_range}年级` : '')
}

export function getDisplayTitle(sourceText, fallbackTitle = '') {
    const cleanFallback = String(fallbackTitle || '').replace(/[.…]+$/u, '').trim()
    if (cleanFallback && cleanFallback.length <= 32 && !String(fallbackTitle).includes('...')) {
        return cleanFallback
    }

    const cleanSource = String(sourceText || '').trim()
    if (cleanSource.length <= 32) return cleanSource

    const firstClause = cleanSource.split(/[，；。]/u).map(part => part.trim()).find(Boolean)
    return firstClause || cleanFallback || cleanSource
}

// Collapse whitespace and cut to `max` characters, preferring a sentence break.
export function clip(text, max = 150) {
    const flat = String(text || '').replace(/【[^】]*】/gu, '').replace(/\s+/gu, ' ').trim()
    if (flat.length <= max) return flat
    const cut = flat.slice(0, max - 1)
    const stop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('；'), cut.lastIndexOf('，'))
    return `${stop > max * 0.6 ? cut.slice(0, stop) : cut}…`
}

function page(title, description, path) {
    return { title: `${title} | ${SITE_NAME}`, description: clip(description), path }
}

export function homeMeta({ standardCount, indicatorCount, subjectCount } = {}) {
    const counts = standardCount ? `收录 ${subjectCount} 门学科 ${standardCount} 条标准${indicatorCount ? `、${indicatorCount} 条要点` : ''}，` : ''
    return {
        title: `${SITE_NAME} · 中国义务教育课程标准结构化索引`,
        description: clip(`${V2_STANDARDS_DOC}逐条拆解：${counts}要点逐字取自课标原文并标明页码，可按学科、学段、领域查找和引用，附对应教材与学习资源。`),
        path: '/'
    }
}

export function subjectMeta(subject, { standardCount, indicatorCount, shortDescription } = {}) {
    const name = subject?.subject || subject?.subject_cn || ''
    const counts = standardCount ? `${standardCount} 条标准${indicatorCount ? `、${indicatorCount} 条要点` : ''}` : ''
    return page(
        `义务教育${name}课程标准（2022年版2025年修订）${counts ? ` · ${counts}` : ''}`,
        `${shortDescription || ''} 按学段和领域浏览${name}课标：每条标准对应一个学段的一个内容单元，要点逐字取自课标原文，附页码与修订对照。`,
        `/subjects/${subject?.subject_slug}`
    )
}

export function standardMeta(standard) {
    const title = getDisplayTitle(standard.standard, standard.standard_title)
    const grade = gradeLabel(standard)
    // Short titles repeat across codes (e.g. 艺术七年级 categories), so the code keeps every title unique.
    return page(
        `${title} · ${standard.subject}${grade} · ${standard.code}`,
        `${standard.subject}课程标准（2022年版）${grade} · ${standard.domain}｜${standard.code}：${standard.standard}`,
        `/standards/${standard.code}`
    )
}

// v2 standard: one 学段 × one content unit, with its 要点 (课标原文) on the page.
export function v2StageLabel(standard, subject) {
    return subject?.stages?.find(stage => stage.stage_code === standard.stage_code)?.label || `${String(standard.stage).replace('-', '–')} 年级`
}
export function v2StandardMeta(standard, subject) {
    const stage = v2StageLabel(standard, subject)
    return page(
        `${standard.level2} · ${subject.subject}${stage} · ${standard.code}`,
        `${subject.subject}课程标准${stage} · ${standard.level1}｜${standard.code}：${standard.statement} 共 ${standard.indicators.length} 条要点，逐字取自课标原文。`,
        `/standards/${standard.code}`
    )
}

export function skillsOverviewMeta({ competencyCount = 7, subskillCount } = {}) {
    return page(
        `可迁移技能：${competencyCount} 个领域${subskillCount ? ` ${subskillCount} 项子技能` : ''}`,
        '可迁移技能是学生能跨学科、跨情境迁移运用的能力。从技能出发，反查每门学科里最能练到它的课标条目。',
        '/skills'
    )
}

export function skillMeta(skill) {
    return page(
        `${skill.name_cn}（${skill.code}）· 可迁移技能`,
        `${skill.tagline_cn || ''}${skill.definition_cn || ''}`,
        `/skills/${skill.code}`
    )
}

export function textbooksMeta({ textbookCount } = {}) {
    return page(
        `教材馆：${textbookCount || ''} 册义务教育教材与课标对照`,
        '按学科、年级和册次浏览义务教育教材目录，查看每个单元对应的课程标准。',
        '/textbooks'
    )
}

export function textbookMeta(book) {
    return page(
        `${book.title}（${book.edition_name}）· 目录与课标对照`,
        `${book.edition_name}${book.title}，共 ${book.page_count || ''} 页。查看目录和每个单元对应的${book.subject}课程标准。`,
        `/textbooks/${book.edition_id}`
    )
}

export function textbookUnitMeta(unit, book) {
    // Some tables of contents repeat a unit heading, so the page keeps titles unique.
    const pageLabel = unit.printed_page ? `第 ${unit.printed_page} 页` : unit.pdf_page ? `PDF 第 ${unit.pdf_page} 页` : ''
    const bookTitle = unit.textbook_title || book?.title || ''
    return page(
        `${unit.title}${pageLabel ? `（${pageLabel}）` : ''} · ${bookTitle}`,
        `${book?.edition_name || ''}${bookTitle}「${unit.title}」${pageLabel ? `（${pageLabel}起）` : ''}对应哪些课程标准、该怎么教。`,
        `/textbook-units/${unit.entry_id || unit.unit_id}`
    )
}

export function learningResourcesMeta({ resourceCount } = {}) {
    return page(
        `开放学习资源：${resourceCount || ''} 个精选资源与课标对照`,
        '精选的开放学习资源，标明许可与国内能否直接访问，并对应到具体课标条目，点击跳转原站使用。',
        '/learning-resources'
    )
}

export function learningResourceMeta(resource) {
    return page(
        `${resource.title_zh} · 开放学习资源`,
        `${resource.provider}。${resource.summary_zh || ''}`,
        `/learning-resources/${resource.id}`
    )
}

export function conceptsMeta({ termCount } = {}) {
    return page(
        '概念词典：大概念、大单元、学习任务群……课标原文怎么说',
        `${termCount || ''} 个教研常用概念，逐条引用修订版课标原文和页码，按学科说明含义的不同，附国外课程的对照、常见误解和真实条目；另有 14 门学科的内容骨架。`,
        '/concepts'
    )
}

export function conceptMeta(term) {
    return page(
        `${term.term}是什么 · 课标原文、各学科用法与常见误解`,
        `${term.plain}`,
        `/concepts/${term.id}`
    )
}

export function subjectSkeletonMeta(subject) {
    return page(
        `${subject.name}课标的骨架：用什么组织内容、核心素养、单元抓手`,
        `${subject.name}（${V2_STANDARDS_DOC}）${subject.organized_by} 核心素养：${(subject.core_literacy || []).join('、')}。`,
        `/concepts/subjects/${subject.slug}`
    )
}

export const STATIC_PAGE_META = {
    '/glossary': page('术语表', '课标、学段、领域、可迁移技能等 kebiao 常用概念的解释与示例。', '/glossary'),
    '/api': page('开放 API', '用 REST API 查询义务教育课程标准、可迁移技能和教材对照，可接入备课工具、智能体和 MCP。', '/api'),
    '/contact': page('联系我们', '反馈 kebiao 的数据问题、提出合作或接入需求。', '/contact'),
    '/smart-search': page('智能检索', '用一句话描述教学内容或学习目标，找到最相关的义务教育课程标准条目。', '/smart-search'),
    '/search': page('检索课标', '按关键词、学科、学段和领域检索义务教育课程标准。', '/search')
}

export const DEFAULT_PAGE_META = homeMeta()

export function notFoundMeta(path) {
    return page('页面不存在', '这个网址没有对应的页面。可以从首页按学科浏览课标。', path)
}
