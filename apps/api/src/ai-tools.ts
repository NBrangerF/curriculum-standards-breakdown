// Read-only tools over the 2025 standards for AI clients: the MCP server (/mcp) and the 扣子 / 元器 plugin
// endpoints (/api/v1/plugin/*) both call these, so an assistant gets the same answer either way.
// Every answer carries the code, the 课标原文 and a link back to kebiao.org.
import type { FileCurriculumRepository, FileTextbookRepository } from '../../../packages/curriculum-core/src/index.js'
import { SOURCE_LABEL, V2_CODE, type V2Standard, type V2Store, type V2Subject } from './v2-store.js'

export const SITE = 'https://www.kebiao.org'

export interface ToolContext {
    repository: FileCurriculumRepository
    textbookRepository: FileTextbookRepository
    v2: V2Store
}

type JsonSchema = Record<string, unknown>
export interface KebiaoTool {
    name: string
    title: string
    description: string
    inputSchema: JsonSchema
    run(args: Record<string, unknown>, ctx: ToolContext): Promise<{ text: string, data: unknown }>
}

// A caller error (unknown subject, missing code): the message is shown to the assistant as is.
export class ToolInputError extends Error {}

const SUBJECT_ALIASES: Record<string, string> = {
    道法: 'morality_law', 道德与法治: 'morality_law', 思品: 'morality_law', 信息技术: 'it', 信息科技: 'it', 信息: 'it',
    体育: 'pe', 体育与健康: 'pe', 生物: 'biology', 生物学: 'biology', 美术: 'arts', 音乐: 'arts', 舞蹈: 'arts', 戏剧: 'arts'
}
const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const standardUrl = (code: string, anchor?: string | null) => `${SITE}/standards/${code}${anchor ? `#${anchor}` : ''}`
const pagesNote = (pages?: number[]) => (pages?.length ? `课标第 ${pages.join('、')} 页` : '')
const stageLabel = (standard: V2Standard, subject: V2Subject) => subject.stages.find(st => st.stage_code === standard.stage_code)?.label || `${standard.stage} 年级`

async function subjectSlug(input: unknown, ctx: ToolContext, required = true): Promise<string | null> {
    const raw = str(input)
    if (!raw) {
        if (required) throw new ToolInputError('请提供学科，例如「数学」或 math。')
        return null
    }
    const subjects = (await ctx.v2.manifest())?.subjects || []
    const hit = subjects.find(s => s.subject_slug === raw.toLowerCase() || s.subject === raw)
        || subjects.find(s => s.subject_slug === SUBJECT_ALIASES[raw])
        || subjects.find(s => raw.includes(s.subject))
    if (!hit) throw new ToolInputError(`没有这门学科：${raw}。可用：${subjects.map(s => s.subject).join('、')}。`)
    return hit.subject_slug
}

// "3-4" / "三四年级" / "五年级" / "第二学段" / "水平三" / "初中" / "7–9" → the grade a stage must contain
function gradeOf(input: unknown): number | null {
    const raw = str(input)
    if (!raw) return null
    if (/初中|初[一二三]/u.test(raw)) return /初二/u.test(raw) ? 8 : /初三/u.test(raw) ? 9 : 7
    const ordinal = raw.match(/第([一二三四])学段|水平([一二三四])|([一二三])级/u)
    if (ordinal) return [1, 3, 5, 7][(CN_NUM[ordinal[1] || ordinal[2] || ordinal[3]] || 1) - 1]
    const digit = raw.match(/\d/u)
    if (digit) return Number(digit[0])
    const cn = raw.match(/[一二三四五六七八九]/u)
    return cn ? CN_NUM[cn[0]] : null
}
const BAND_OF_GRADE = (grade: number) => (grade <= 2 ? 'H1' : grade <= 4 ? 'H2' : grade <= 6 ? 'H3' : 'H4')

function stageOf(subject: V2Subject, input: unknown) {
    const grade = gradeOf(input)
    if (grade === null) return null
    const stage = subject.stages.find(st => st.grades.includes(grade))
    if (!stage) throw new ToolInputError(`${subject.subject}没有包含 ${grade} 年级的学段。可用：${subject.stages.map(st => st.label).join('、')}。`)
    return stage
}

function briefStandard(standard: V2Standard, subject: V2Subject) {
    return {
        code: standard.code,
        name: standard.level2,
        subject: subject.subject,
        stage: stageLabel(standard, subject),
        level1: standard.level1,
        statement: standard.statement,
        statement_source: standard.statement_source === 'official' ? '课标原文' : 'kebiao 整理（用课标原词概括）',
        indicator_count: standard.indicators.length,
        url: standardUrl(standard.code)
    }
}

// The 要点 that holds most of the matched words, for the search answer.
function bestIndicator(standard: V2Standard, terms: string[]) {
    let best: { code: string, text: string, pages?: number[], hits: number } | null = null
    for (const item of standard.indicators) {
        const hits = terms.filter(term => item.text.includes(term)).length
        if (hits && (!best || hits > best.hits)) best = { code: item.code, text: item.text, pages: item.pages, hits }
    }
    return best ? { code: best.code, text: best.text, page: pagesNote(best.pages), url: standardUrl(standard.code, best.code) } : null
}

const SOURCE_NOTE = '要点逐字取自《义务教育课程标准（2022年版2025年修订）》；修订版文本取自凤溪中学转载的日常修订版，以官方出版物为准。'

export const KEBIAO_TOOLS: KebiaoTool[] = [
    {
        name: 'list_subjects',
        title: '列出学科',
        description: '列出 kebiao 收录的义务教育课程标准学科（14 门，2022年版2025年修订）、各学科的学段和标准、要点条数。List the subjects, their stages and counts.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        async run(_args, ctx) {
            const manifest = await ctx.v2.manifest()
            if (!manifest) throw new ToolInputError('课标数据暂不可用。')
            const subjects = manifest.subjects.map(s => ({ subject_slug: s.subject_slug, subject: s.subject, standard_count: s.standard_count, indicator_count: s.indicator_count, stages: s.stages.map(st => st.label) }))
            return {
                data: { source: manifest.source_version, subjects },
                text: [`${manifest.source_version}，共 ${manifest.totals.subjects} 门学科、${manifest.totals.standards} 条标准、${manifest.totals.indicators} 条要点。`, ...subjects.map(s => `- ${s.subject}（${s.subject_slug}）：${s.standard_count} 条标准、${s.indicator_count} 条要点；${s.stages.join('，')}`)].join('\n')
            }
        }
    },
    {
        name: 'search_standards',
        title: '检索课标',
        description: '用一句话检索义务教育课程标准（2025 修订版），返回最相关的标准、命中的要点原文和链接。可按学科、学段筛选。适合「三年级科学里讲植物生长的课标」「初中物理 浮力」这类问题。Search the standards by topic.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: '要找的教学内容或主题，例如「分数的大小比较」「辛亥革命」' },
                subject: { type: 'string', description: '学科，可选，例如「数学」或 math' },
                stage: { type: 'string', description: '学段或年级，可选，例如「3-4」「五年级」「初中」' },
                limit: { type: 'integer', minimum: 1, maximum: 10, description: '返回条数，默认 5' }
            },
            required: ['query'],
            additionalProperties: false
        },
        async run(args, ctx) {
            const query = str(args.query)
            if (query.length < 2) throw new ToolInputError('请给出至少两个字的检索内容。')
            const slug = await subjectSlug(args.subject, ctx, false)
            const grade = gradeOf(args.stage)
            const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10)
            const response = await ctx.repository.smartSearchStandards({ query, ...(slug ? { subjects: [slug] } : {}), ...(grade ? { grade_bands: [BAND_OF_GRADE(grade)] } : {}), limit })
            const results = []
            for (const r of response.results) {
                const found = await ctx.v2.find(r.code)
                if (!found) continue
                results.push({ ...briefStandard(found.standard, found.subject), matched_point: bestIndicator(found.standard, r.matched_concepts), match: r.match_strength === 'direct' ? '直接相关' : '相关' })
            }
            return {
                data: { query, understood: response.understanding_summary, results },
                text: results.length
                    ? [`检索「${query}」：${response.understanding_summary}`, ...results.map((r, k) => `${k + 1}. ${r.code} ${r.name}（${r.subject} · ${r.stage}）\n   标准：${r.statement}${r.matched_point ? `\n   命中要点 ${r.matched_point.code}：${r.matched_point.text}（${r.matched_point.page}）` : ''}\n   ${r.matched_point?.url || r.url}`), SOURCE_NOTE].join('\n')
                    : `没有找到与「${query}」直接相关的课标条目；可以换个说法，或去掉学科、学段限制。`
            }
        }
    },
    {
        name: 'get_standard',
        title: '查看一条标准',
        description: '按编码查看一条课标：标准句（标明是课标原文还是 kebiao 整理）、全部要点原文和页码、学业要求、链接。接受标准编码（MA-S2-NA-02）、要点编码（MA-S2-NA-02.1）和 2022 年版旧编码（MA-D2-AL-005，会说明它并入了哪条新标准）。Look up one standard by code.',
        inputSchema: {
            type: 'object',
            properties: { code: { type: 'string', description: '标准、要点或旧编码' } },
            required: ['code'],
            additionalProperties: false
        },
        async run(args, ctx) {
            const asked = str(args.code).toUpperCase()
            if (!asked) throw new ToolInputError('请提供编码，例如 MA-S2-NA-02。')
            let code = asked
            let movedFrom: string | null = null
            if (!V2_CODE.test(asked)) {
                const target = await ctx.v2.movedTo(asked)
                if (!target) throw new ToolInputError(`没有这个编码：${asked}。`)
                if (!target.startsWith('/standards/')) {
                    return { data: { code: asked, moved_to: `${SITE}${target}` }, text: `旧编码 ${asked} 在 2025 修订版重建时并入了学科概览（学段目标），没有单独的标准：${SITE}${target}` }
                }
                movedFrom = asked
                // "/standards/MA-S2-NA-02#MA-S2-NA-02.1" → the 要点 it joined, or the standard
                const [path, anchor] = target.slice('/standards/'.length).split('#')
                code = anchor || path
            }
            const found = await ctx.v2.find(code)
            if (!found) throw new ToolInputError(`没有这个编码：${asked}。`)
            const { standard, subject } = found
            const focus = code !== standard.code ? code : null
            const indicators = standard.indicators.map(item => ({ code: item.code, text: item.text, page: pagesNote(item.pages), grades: item.grades || null, revised_2025: item.check?.status === 'revised' }))
            const requirements = (standard.requirements || []).map(item => ({ text: item.text, page: pagesNote(item.pages) }))
            const data = { ...briefStandard(standard, subject), ...(movedFrom ? { moved_from: movedFrom } : {}), ...(focus ? { focus_indicator: focus } : {}), indicators, requirements, url: standardUrl(standard.code, focus), source: SOURCE_NOTE }
            const lines = [
                `${standard.code} ${standard.level2}（${subject.subject} · ${data.stage} · ${standard.level1}）`,
                movedFrom ? `（旧编码 ${movedFrom} 已并入这条标准${focus ? `的要点 ${focus}` : ''}）` : '',
                `标准句（${data.statement_source}）：${standard.statement}`,
                '要点（课标原文）：',
                ...indicators.map(item => `${item.code === focus ? '→ ' : '- '}${item.code} ${item.text}（${item.page}${item.grades ? `，${item.grades.join('、')} 年级` : ''}${item.revised_2025 ? '，2025 修订有改动' : ''}）`),
                ...(requirements.length ? ['学业要求（课标原文）：', ...requirements.map(item => `- ${item.text}（${item.page}）`)] : []),
                `链接：${data.url}`,
                SOURCE_NOTE
            ]
            return { data, text: lines.filter(Boolean).join('\n') }
        }
    },
    {
        name: 'list_standards',
        title: '列出一门学科的标准',
        description: '列出一门学科（可限定一个学段）的全部标准：编码、名称、领域、要点条数。适合先看全貌再用 get_standard 看细节。List a subject\'s standards.',
        inputSchema: {
            type: 'object',
            properties: { subject: { type: 'string', description: '学科，例如「历史」或 history' }, stage: { type: 'string', description: '学段或年级，可选' } },
            required: ['subject'],
            additionalProperties: false
        },
        async run(args, ctx) {
            const slug = (await subjectSlug(args.subject, ctx))!
            const subject = (await ctx.v2.subject(slug))!
            const only = stageOf(subject, args.stage)
            const stages = subject.stages.filter(st => !only || st.stage_code === only.stage_code).map(st => ({
                stage: st.label,
                standards: subject.standards.filter(s => s.stage_code === st.stage_code).map(s => ({ code: s.code, name: s.level2, level1: s.level1, indicator_count: s.indicators.length, url: standardUrl(s.code) }))
            }))
            return {
                data: { subject: subject.subject, stages },
                text: [`${subject.subject}课程标准（2022年版2025年修订）`, ...stages.flatMap(st => [`【${st.stage}】`, ...st.standards.map(s => `- ${s.code} ${s.name}（${s.level1}，${s.indicator_count} 条要点）`)]), `学科页：${SITE}/subjects/${slug}`].join('\n')
            }
        }
    },
    {
        name: 'get_stage_goals',
        title: '学段目标',
        description: '查看一门学科各学段的学段目标（体育为水平目标），课标原文，按核心素养或学科分组。语文、英语的学段要求/学段目标已是标准本身，请用 list_standards；初中新增五科只有一个学段。Stage goals of a subject.',
        inputSchema: {
            type: 'object',
            properties: { subject: { type: 'string', description: '学科' }, stage: { type: 'string', description: '学段或年级，可选' } },
            required: ['subject'],
            additionalProperties: false
        },
        async run(args, ctx) {
            const slug = (await subjectSlug(args.subject, ctx))!
            const subject = (await ctx.v2.subject(slug))!
            const only = stageOf(subject, args.stage)
            const goals = (subject.stage_overview?.stage_goals || []).filter(g => !only || g.stage === only.stage)
            if (!goals.length) return { data: { subject: subject.subject, goals: [] }, text: `${subject.subject}在 kebiao 上没有单列的学段目标（语文、英语的学段目标就是各条标准；初中新增学科只有一个学段）。可以用 list_standards 查看。` }
            const notes = (subject.stage_overview?.stage_notes || []).map(n => n.text)
            const data = goals.map(g => ({ stage: subject.stages.find(st => st.stage === g.stage)?.label || g.stage, group: g.group, items: g.items.map(item => ({ text: item.text, page: pagesNote(item.pages) })) }))
            return {
                data: { subject: subject.subject, goals: data, notes },
                text: [`${subject.subject}${slug === 'pe' ? '水平目标' : '学段目标'}（课标原文）`, ...data.flatMap(g => [`【${g.stage}${g.group ? ` · ${g.group}` : ''}】`, ...g.items.map(item => `- ${item.text}（${item.page}）`)]), ...notes, `学科页：${SITE}/subjects/${slug}`].join('\n')
            }
        }
    },
    {
        name: 'get_textbook_links',
        title: '标准对应的教材',
        description: '查看一条标准或要点在哪些教材的哪一课教（人教版、统编版等）：AI 逐课读了教材原文判断，每条附这一课教材的原话和页码；没有逐课结果的，再列机器对齐的单元。都待核验。Textbook lessons and chapters for a standard.',
        inputSchema: {
            type: 'object',
            properties: { code: { type: 'string', description: '标准或要点编码' } },
            required: ['code'],
            additionalProperties: false
        },
        async run(args, ctx) {
            const asked = str(args.code).toUpperCase()
            const found = await ctx.v2.find(asked)
            if (!found) throw new ToolInputError(`没有这个标准编码：${str(args.code)}。`)
            const { standard } = found
            // lesson by lesson, with the textbook's own words (教材与课标对应)
            const wanted = (point: string) => (/\.\d+$/u.test(asked) ? point === asked : point.replace(/\.\d+$/u, '') === standard.code)
            const lessons: Array<{ textbook: string, unit: string, lesson: string, point: string, relation: string, quote: string, where: string, url: string }> = []
            for (const [edition, textbook, unit, title, , , matches] of (await ctx.v2.lessonAlignment()).lessons) {
                for (const [point, relation, quote, source, page] of matches) {
                    if (wanted(point)) lessons.push({ textbook, unit, lesson: title, point, relation: relation === 'T' ? '主要在教' : '也涉及', quote, where: SOURCE_LABEL(source, page), url: `${SITE}/textbooks/${edition}/standards` })
                }
            }
            lessons.sort((a, b) => (a.relation === b.relation ? 0 : a.relation === '主要在教' ? -1 : 1) || a.textbook.localeCompare(b.textbook, 'zh-Hans-CN', { numeric: true }))
            const items: Array<{ textbook: string, chapter: string | null, printed_page: unknown, url: string, status: string }> = []
            const seen = new Set<string>()
            const push = (item: { textbook: string, chapter: string | null, printed_page: unknown, url: string, status: string }) => {
                const key = `${item.textbook}|${item.chapter || ''}`
                if (!seen.has(key)) { seen.add(key); items.push(item) }
            }
            for (const link of (await ctx.v2.textbookLinks()).standards[standard.code] || []) {
                push({ textbook: link.textbook_title, chapter: link.title, printed_page: link.printed_page, url: link.unit_id ? `${SITE}/textbook-units/${link.unit_id}` : `${SITE}/textbooks/${link.edition_id}`, status: '机器对齐，待核验' })
            }
            for (const old of standard.legacy_codes || []) {
                for (const raw of await ctx.textbookRepository.getTextbooksForStandard(old)) {
                    const chapter = String(raw.unit_title || raw.node_title || '') || null
                    if (!chapter && !raw.pdf_page) continue
                    push({ textbook: String(raw.textbook_title || ''), chapter, printed_page: raw.printed_page ?? null, url: raw.unit_id ? `${SITE}/textbook-units/${raw.unit_id}` : `${SITE}/textbooks/${raw.edition_id}`, status: raw.review_status === 'approved' ? '已核验' : '机器对齐，待核验' })
                }
            }
            const shown = items.slice(0, lessons.length ? 6 : 12)
            const lessonLines = lessons.slice(0, 12).map(item => `- ${item.textbook} · ${item.unit}${item.lesson && item.lesson !== item.unit ? ` · ${item.lesson}` : ''}：${item.relation} ${item.point}，教材里写着“${item.quote}”（${item.where}）${item.url}`)
            return {
                data: { code: asked, name: standard.level2, lessons: lessons.slice(0, 12), lesson_total: lessons.length, textbooks: shown, total: items.length },
                text: lessons.length || shown.length
                    ? [
                        ...(lessons.length ? [`${asked} ${standard.level2} 在这些课教（AI 逐课读了教材原文判断，${lessons.length} 处，待核验）：`, ...lessonLines] : []),
                        ...(shown.length ? [`${lessons.length ? '另外，机器按单元对齐的' : `${standard.code} ${standard.level2} 对应的`}教材（${items.length} 处${items.length > shown.length ? `，列出前 ${shown.length} 处` : ''}）：`, ...shown.map(item => `- ${item.textbook}${item.chapter ? ` · ${item.chapter}` : '（整册）'}${item.printed_page ? `，第 ${item.printed_page} 页` : ''}（${item.status}）${item.url}`)] : [])
                    ].join('\n')
                    : `${standard.code} ${standard.level2} 暂时没有对应到具体教材。`
            }
        }
    },
    {
        name: 'find_textbook_chapter',
        title: '从教材章节找课标',
        description: '按教材单元、章节或课的标题（如「分数的基本性质」「七七事变与全民族抗战」）找到它，再给出它对应的课标要点：先列 AI 逐课读了教材原文判断的（附教材原话和页码），再列机器按目录对齐的。可按学科、年级筛选。适合「下周教这一课，对应哪条课标」。Find a textbook lesson or chapter and its standards.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: '单元、章节或课的标题' },
                subject: { type: 'string', description: '学科，可选' },
                grade: { type: 'string', description: '年级，可选，例如「五年级」「8」' }
            },
            required: ['query'],
            additionalProperties: false
        },
        async run(args, ctx) {
            const query = str(args.query).replace(/\s+/gu, '')
            if (query.length < 2) throw new ToolInputError('请给出至少两个字的章节标题。')
            const slug = await subjectSlug(args.subject, ctx, false)
            const grade = gradeOf(args.grade)
            // every textbook's units, chapters and lessons, read from its 目录 at build time, with the standards aligned to its pages
            const index = await ctx.v2.textbookChapters()
            const v2Slug = (bookSlug: string) => (['art', 'music'].includes(bookSlug) ? 'arts' : bookSlug)
            // first the 国家平台 lessons judged one by one on their own pages, with the textbook's own words
            const lessonHits = (await ctx.v2.lessonAlignment()).lessons.filter(([edition, , unit, title]) => {
                const book = index.books[edition]
                if (book && ((slug && v2Slug(book[1]) !== slug) || (grade && book[2] !== grade))) return false
                const name = title.replace(/\s+/gu, '')
                return name.includes(query) || (query.length >= 3 && name.length >= 3 && query.includes(name)) || (!name.includes(query) && unit.replace(/\s+/gu, '').includes(query) && title === unit)
            }).slice(0, 6)
            const hits = index.chapters.filter(([edition, title]) => {
                const book = index.books[edition]
                if (!book || (slug && v2Slug(book[1]) !== slug) || (grade && book[2] !== grade)) return false
                const name = title.replace(/\s+/gu, '').replace(/^(?:第[一二三四五六七八九十百零\d]+(?:单元|章|节|课)|课题\d+|\d+(?:\.\d+)*\*?)\s*/u, '')
                return name.includes(query) || (query.length >= 3 && name.length >= 3 && query.includes(name))
            }).slice(0, 8)
            const results = []
            for (const [edition, title, printedPage, , unitId, codes] of hits) {
                const [textbook, bookSlug, bookGrade] = index.books[edition]
                const standards = []
                for (const code of codes) {
                    const found = await ctx.v2.find(code)
                    if (found) standards.push({ code, name: found.standard.level2, subject: found.subject.subject, stage: stageLabel(found.standard, found.subject), url: standardUrl(code) })
                }
                // a chapter with no aligned pages gets the standards its own title finds, marked as a search
                let via = 'aligned'
                if (!standards.length) {
                    const name = title.replace(/^(?:第[一二三四五六七八九十百零\d]+(?:单元|章|节|课)|课题\d+|\d+(?:\.\d+)*)\s*/u, '')
                    const response = await ctx.repository.smartSearchStandards({ query: name, subjects: [v2Slug(bookSlug)], grade_bands: [BAND_OF_GRADE(bookGrade)], limit: 3 })
                    for (const r of response.results.filter(x => x.match_strength === 'direct')) {
                        const found = await ctx.v2.find(r.code)
                        if (found) standards.push({ code: r.code, name: found.standard.level2, subject: found.subject.subject, stage: stageLabel(found.standard, found.subject), url: standardUrl(r.code) })
                    }
                    via = standards.length ? 'title_search' : 'none'
                }
                results.push({ textbook, chapter: title, printed_page: printedPage, url: unitId ? `${SITE}/textbook-units/${unitId}` : `${SITE}/textbooks/${edition}`, standards, via })
            }
            const note = { aligned: '按教材页码对齐', title_search: '这一章没有页码对齐，按章节标题检索，仅供参考', none: '暂无对应课标' } as Record<string, string>
            const lessons = lessonHits.map(([edition, textbook, unit, title, , pdfPage, matches]) => ({
                textbook, unit, lesson: title, pdf_page: pdfPage, url: `${SITE}/textbooks/${edition}/standards`,
                points: matches.map(([point, relation, quote, source, page]) => ({ point, relation: relation === 'T' ? '主要在教' : '也涉及', quote, where: SOURCE_LABEL(source, page), url: standardUrl(point.replace(/\.\d+$/u, ''), point) }))
            }))
            const lessonText = lessons.map(item => `- ${item.textbook} · ${item.unit}${item.lesson !== item.unit ? ` · ${item.lesson}` : ''} ${item.url}\n${item.points.map(point => `  ${point.relation} ${point.point}：教材里写着“${point.quote}”（${point.where}）`).join('\n') || '  没找到这一课主要在教的要点'}`)
            const chapterText = results.map(r => `- ${r.textbook} · ${r.chapter}${r.printed_page ? `（第 ${r.printed_page} 页）` : ''} ${r.url}\n  ${r.standards.length ? `${r.standards.map(s => `${s.code} ${s.name}（${s.subject} · ${s.stage}）`).join('；')}（${note[r.via]}）` : note.none}`)
            return {
                data: { query, lessons, results },
                text: lessons.length || results.length
                    ? [
                        ...(lessons.length ? [`找到 ${lessons.length} 节课（AI 逐课读了教材原文判断，附原话，待核验）：`, ...lessonText] : []),
                        ...(results.length ? [`${lessons.length ? '另外，' : ''}找到 ${results.length} 个教材章节（对应关系为机器对齐，待核验）：`, ...chapterText] : [])
                    ].join('\n')
                    : `没有找到标题包含「${query}」的教材章节；可以换个写法，或用 search_standards 按内容检索。`
            }
        }
    },
    {
        name: 'compare_versions',
        title: '2022 与 2025 修订对照',
        description: '查看一条标准在 2025 修订版中改了哪些地方：改动的要点、修订版原文和其中新写入的文字。List what the 2025 revision changed in a standard.',
        inputSchema: {
            type: 'object',
            properties: { code: { type: 'string', description: '标准或要点编码' } },
            required: ['code'],
            additionalProperties: false
        },
        async run(args, ctx) {
            const found = await ctx.v2.find(str(args.code).toUpperCase())
            if (!found) throw new ToolInputError(`没有这个标准编码：${str(args.code)}。`)
            const { standard } = found
            const changes = [
                ...(standard.statement_check?.status === 'revised' ? [{ where: '标准句', text_2025: standard.statement, summary: String(standard.statement_check.summary || '') }] : []),
                ...standard.indicators.filter(item => item.check?.status === 'revised').map(item => ({ where: item.code, text_2025: item.text, summary: String(item.check?.summary || '') }))
            ]
            return {
                data: { code: standard.code, name: standard.level2, changes, url: standardUrl(standard.code) },
                text: changes.length
                    ? [`${standard.code} ${standard.level2}：2025 修订有 ${changes.length} 处改动（按 2022 年版与修订版扫描件逐句对照；只列修订版新写入的文字）`, ...changes.map(ch => `- ${ch.where}：${ch.summary}
  修订版原文：${ch.text_2025}`), `链接：${standardUrl(standard.code)}`].join('\n')
                    : `${standard.code} ${standard.level2} 的要点在 2025 修订版中没有发现改动（按 2022 年版与修订版逐句对照）。`
            }
        }
    }
]

export const findTool = (name: string) => KEBIAO_TOOLS.find(tool => tool.name === name) || null
