// Read-only tools over the 2025 standards for AI clients: the MCP server (/mcp) and the 扣子 / 元器 plugin
// endpoints (/api/v1/plugin/*) both call these, so an assistant gets the same answer either way.
// Every answer carries the code, the 课标原文 and a link back to kebiao.org.
import type { FileCurriculumRepository, FileTextbookRepository } from '../../../packages/curriculum-core/src/index.js'
import { SOURCE_LABEL, V2_CODE, type LessonAlignRow, type V2Standard, type V2Store, type V2Subject } from './v2-store.js'
import { findChecks, presentUrl, publicCheck, type CheckStore } from './checks.js'
import { checkObjectives, splitObjectives, type CheckPoint } from './objectives-check.js'

export const SITE = 'https://www.kebiao.org'

export interface ToolContext {
    repository: FileCurriculumRepository
    textbookRepository: FileTextbookRepository
    v2: V2Store
    checks?: CheckStore
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
const AI_TOOL_CALLS_PER_MINUTE = 20
const aiCalls = { minute: 0, count: 0 }
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

// 「ma-s3-na-01.3」「ＭＡ－Ｓ３－ＮＡ－０１」 → MA-S3-NA-01.3
const normCode = (value: unknown) => str(value).normalize('NFKC').toUpperCase().replace(/\s+/gu, '').replace(/[–—－]/gu, '-').replace(/[。．]/gu, '.')
// An unknown code gets the real codes nearby, so the assistant copies one instead of guessing again.
async function codeHint(asked: string, ctx: ToolContext) {
    const tail = '编码请从 search_standards 或 find_textbook_chapter 的结果里复制，不要自己拼。'
    const [prefix, stage, domain] = asked.split('-')
    const entry = (await ctx.v2.manifest())?.subjects.find(item => item.prefix === prefix)
    const subject = entry ? await ctx.v2.subject(entry.subject_slug) : null
    if (!entry || !subject) return `没有这个编码：${asked}。${tail}`
    const inStage = subject.standards.filter(item => !/^S\d$/u.test(stage || '') || item.code.split('-')[1] === stage)
    const inDomain = inStage.filter(item => !domain || item.code.split('-')[2] === domain.replace(/\..*$/u, ''))
    const near = (inDomain.length ? inDomain : inStage).slice(0, 8)
    return `没有这个编码：${asked}。${entry.subject}${/^S\d$/u.test(stage || '') ? `第 ${stage.slice(1)} 学段` : ''}的标准有：${near.map(item => `${item.code} ${item.level2}`).join('；')}${(inDomain.length ? inDomain : inStage).length > near.length ? ' 等' : ''}。${tail}`
}

const SOURCE_NOTE = '要点逐字取自《义务教育课程标准（2022年版2025年修订）》；修订版文本取自凤溪中学转载的日常修订版，以官方出版物为准。'

// How teachers name a lesson: 「人教版 八年级上册 光的反射」「统编版四年级上册《观潮》」「五下 分数的基本性质」.
// The edition, grade, volume and subject become filters; what is left is the title.
const PUBLISHERS: Array<[string, string]> = [
    ['人教版?|人民教育出版社|PEP', '人教版'], ['统编版?|部编版?', '统编版'], ['北师大?版?', '北师大版'], ['苏教版?', '苏教版'],
    ['冀教版?', '冀教版'], ['青岛版?', '青岛版'], ['华东师大版?|华师大?版', '华东师大版'], ['教科版?', '教科版'], ['人美版?', '人美版'], ['人音版?', '人音版']
]
export const publisherOf = (text: string) => PUBLISHERS.find(([pattern]) => new RegExp(pattern, 'iu').test(text))?.[1] || null
const GRADE_CN = '一二三四五六七八九'
const gradeNumber = (g: string) => (/\d/u.test(g) ? Number(g) : GRADE_CN.indexOf(g) + 1)
const volumeOf = (v: string) => (v.startsWith('上') ? '上册' : v.startsWith('下') ? '下册' : '全一册')
// lesson numbering a teacher leaves out: 「第2节」「24 」「3.」「一、」「课题1」「☆」, and 「（第一课时）」
const TITLE_PREFIX = /^(?:第[一二三四五六七八九十百零\d]+\s*(?:单元|章|节|课时|课)|课题\s*\d+|[一二三四五六七八九十]+\s*[、.．]|\d+(?:\.\d+)*(?:\s+|\s*[.、．]\s*)|[☆★*＊]+)\s*/u
export function normTitle(title: string) {
    let t = title.normalize('NFKC').trim()
    for (let i = 0; i < 3; i += 1) t = t.replace(TITLE_PREFIX, '')
    t = t.replace(/[（(]\s*第?[一二三四五六七八九十\d]+\s*课时\s*[)）]$/u, '')
    return t.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}
// 100 = same title; less for a title that contains the words asked, or is contained in them
function titleScore(title: string, asked: string) {
    const t = normTitle(title)
    if (!t || !asked) return 0
    if (t === asked) return 100
    if (asked.length >= 2 && t.includes(asked)) return 60 + Math.round(20 * asked.length / t.length)
    if (t.length >= 2 && asked.includes(t) && t.length / asked.length >= 0.34) return 40 + Math.round(20 * t.length / asked.length)
    return 0
}

export type LessonQuery = { publisher: string | null, grade: number | null, volume: string | null, subject: string | null, title: string, label: string }
export function parseLessonQuery(raw: string, subjectWords: string[]): LessonQuery {
    const q: LessonQuery = { publisher: null, grade: null, volume: null, subject: null, title: '', label: '' }
    let s = raw.normalize('NFKC').replace(/[（(]?\s*第?[一二三四五六七八九十\d]+\s*课时\s*[)）]?/gu, ' ')
        .replace(/(?:主要)?(?:对应|涉及|依据|是)?(?:哪[几些]?条?|什么)?(?:的)?(?:课标|课程标准)[\s\S]*$/u, ' ')
        .replace(/(?:的)?(?:教案|教学设计|说课稿|课件)$/u, ' ')
    const tokens: Array<[string, (m: RegExpMatchArray) => void, string?]> = [
        [`([1-9]|[${GRADE_CN}])\\s*年级\\s*(上册|下册|全一册|上|下)?`, m => { q.grade = gradeNumber(m[1]); if (m[2]) q.volume = volumeOf(m[2]) }],
        ['初([一二三])\\s*(上册|下册|上|下)?', m => { q.grade = 6 + gradeNumber(m[1]); if (m[2]) q.volume = volumeOf(m[2]) }],
        [`([1-9]|[${GRADE_CN}])\\s*(上册|下册|上|下)(?=$|[\\s《册])`, m => { q.grade = gradeNumber(m[1]); q.volume = volumeOf(m[2]) }],
        ['(上册|下册|全一册)', m => { q.volume = volumeOf(m[1]) }],
        ...PUBLISHERS.map(([pattern, label]) => [`(?:${pattern})`, () => { q.publisher = label }] as [string, (m: RegExpMatchArray) => void]),
        // a subject word counts only when it stands apart from the title: 「数学 五年级」, not 「数学广角」
        ...[...subjectWords].sort((a, b) => b.length - a.length).map(word => [`${word}(?=$|[\\s,，、·:：/|《]|[1-9${GRADE_CN}]\\s*(?:年级|上|下)|初[一二三]|上册|下册|全一册|${PUBLISHERS.map(([p]) => p).join('|')})`, () => { q.subject = word }, `(?<=^|[\\s,，、·:：/|》]|年级|上册|下册|全一册|版)${word}`] as [string, (m: RegExpMatchArray) => void, string?])
    ]
    const quoted = s.match(/[《〈「“"]([^》〉」”"]+)[》〉」”"]/u)
    if (quoted) {
        // 《title》 is the title; the rest only says which book
        q.title = quoted[1]
        const rest = s.replace(quoted[0], ' ')
        for (const [source, apply] of tokens) {
            const m = rest.match(new RegExp(source, 'iu'))
            if (m) apply(m)
        }
    } else {
        // book words sit before or after the title: peel them off both ends
        const SEP = '[\\s,，、·:：/|\\-—]*'
        for (const edge of ['start', 'end'] as const) {
            for (let guard = 0; guard < 8; guard += 1) {
                s = s.trim()
                const hit = tokens.map(([source, apply, endSource]) => [s.match(new RegExp(edge === 'start' ? `^${SEP}(?:${source})${SEP}` : `${SEP}(?:${endSource || source})${SEP}$`, 'iu')), apply] as const).find(([m]) => m)
                if (!hit) break
                hit[1](hit[0]!)
                s = edge === 'start' ? s.slice(hit[0]![0].length) : s.slice(0, s.length - hit[0]![0].length)
            }
        }
        q.title = s.trim()
    }
    // label: the title as the teacher wrote it; title: the form compared with lesson titles
    q.label = q.title.trim()
    q.title = normTitle(q.title)
    return q
}

// The 要点 a teacher's objectives are checked against: the codes given, or the lesson's own 要点 (found by its title
// in the lessons kebiao read one by one), topped up by a search limited to the grade asked for.
export async function objectiveCheckPoints(input: { objectives: string[], slug: string, grade: number | null, topic: string, codes?: unknown }, ctx: ToolContext) {
    // the 要点 to check against: the codes given, or else the standards the topic (or the objectives) find
    const given: string[] = (Array.isArray(input.codes) ? input.codes : []).map(code => str(code).slice(0, 24)).filter(code => V2_CODE.test(code)).slice(0, 6)
    const taught: string[] = given.filter(code => /\.\d+$/u.test(code))
    // a lesson title is looked up in the lessons kebiao read one by one: its 主要在教 要点 are what it should teach
    if (!given.length && input.topic.length >= 2) {
        const index = await ctx.v2.textbookChapters()
        const alignment = await ctx.v2.lessonAlignment()
        const name = input.topic.replace(/\s+/gu, '')
        const hit = alignment.lessons.find(([edition, , , title]) => {
            const book = index.books[edition] || alignment.platform_books?.[edition]
            if (book && ((['art', 'music'].includes(book[1]) ? 'arts' : book[1]) !== input.slug || (input.grade && book[2] !== input.grade))) return false
            return title.replace(/\s+/gu, '').includes(name)
        })
        for (const [code, relation] of hit?.[6] || []) if (relation === 'T' || given.length < 4) given.push(code)
        taught.push(...(hit?.[6] || []).filter(match => match[1] === 'T').map(match => match[0]))
    }
    const searched = given.length >= 3 ? [] : (await ctx.repository.smartSearchStandards({ query: (given.length ? input.objectives.join('；') : input.topic || input.objectives.join('；')).slice(0, 300), subjects: [input.slug], ...(input.grade ? { grade_bands: [BAND_OF_GRADE(input.grade)] } : {}), limit: given.length ? 2 : 4 })).results.map(r => r.code)
    // the search ranks by words, so the grade asked for is enforced here: 五年级「通分」 must not pull in 初中 分式
    const inGrade = []
    for (const code of searched) {
        const found = await ctx.v2.find(code)
        const stage = found?.subject.stages.find(st => st.stage_code === found.standard.stage_code)
        if (found && (!input.grade || !stage || stage.grades.includes(input.grade))) inGrade.push(code)
    }
    const lessonCodes = given.concat(inGrade)
    const standardCodes = [...new Set(lessonCodes.map(code => code.replace(/\.\d+$/u, '')))]
    const points: CheckPoint[] = []
    for (const code of standardCodes) {
        const found = await ctx.v2.find(code)
        if (!found) continue
        for (const item of found.standard.indicators || []) {
            if (!lessonCodes.some(c => c.startsWith(`${found.standard.code}.`)) || lessonCodes.includes(item.code)) points.push({ code: item.code, text: String(item.text || ''), header: `${found.standard.level2} · ${stageLabel(found.standard, found.subject)}` })
        }
    }
    return { points, taught }
}

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
        description: '老师说的是教学内容或主题时用它：用一句话检索义务教育课程标准（2025 修订版），返回最相关的标准、命中的要点原文、页码和链接，可按学科、学段筛选。例如「三年级科学里讲植物生长的课标」「初中物理 浮力」。老师说的是教材里的某一课时，改用 find_textbook_chapter。结果里的编码可以直接传给 get_standard 取全部要点。Search the standards by topic.',
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
            // the same 500-character cap as POST /standards/semantic-search
            const query = str(args.query).slice(0, 500)
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
        description: '按编码查看一条课标：标准句（标明是课标原文还是 kebiao 整理）、全部要点原文和页码、学业要求、链接。接受标准编码（MA-S2-NA-02）、要点编码（MA-S2-NA-02.1）和 2022 年版旧编码（MA-D2-AL-005，会说明它并入了哪条新标准）。编码请从其他工具的结果里复制，不要自己拼；编码不存在时，会返回同学科同学段的真实编码供选择。Look up one standard by code.',
        inputSchema: {
            type: 'object',
            properties: { code: { type: 'string', description: '标准、要点或旧编码' } },
            required: ['code'],
            additionalProperties: false
        },
        async run(args, ctx) {
            const asked = normCode(args.code)
            if (!asked) throw new ToolInputError('请提供编码，例如 MA-S2-NA-02。')
            let code = asked
            let movedFrom: string | null = null
            if (!V2_CODE.test(asked)) {
                const target = await ctx.v2.movedTo(asked)
                if (!target) throw new ToolInputError(await codeHint(asked, ctx))
                if (!target.startsWith('/standards/')) {
                    return { data: { code: asked, moved_to: `${SITE}${target}` }, text: `旧编码 ${asked} 在 2025 修订版重建时并入了学科概览（学段目标），没有单独的标准：${SITE}${target}` }
                }
                movedFrom = asked
                // "/standards/MA-S2-NA-02#MA-S2-NA-02.1" → the 要点 it joined, or the standard
                const [path, anchor] = target.slice('/standards/'.length).split('#')
                code = anchor || path
            }
            const found = await ctx.v2.find(code)
            if (!found) throw new ToolInputError(await codeHint(asked, ctx))
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
        description: '从一条课标反查教材：查看一条标准或要点在哪些教材的哪一课教（人教版、统编版等）：AI 逐课读了教材原文判断，每条附这一课教材的原话和页码；没有逐课结果的，再列机器对齐的单元。都待核验。Textbook lessons and chapters for a standard.',
        inputSchema: {
            type: 'object',
            properties: { code: { type: 'string', description: '标准或要点编码' } },
            required: ['code'],
            additionalProperties: false
        },
        async run(args, ctx) {
            const asked = normCode(args.code)
            const found = await ctx.v2.find(asked)
            if (!found) throw new ToolInputError(await codeHint(asked, ctx))
            const { standard } = found
            // lesson by lesson, with the textbook's own words (教材与课标对应)
            const wanted = (point: string) => (/\.\d+$/u.test(asked) ? point === asked : point.replace(/\.\d+$/u, '') === standard.code)
            const lessons: Array<{ edition_id: string, textbook: string, unit: string, lesson: string, point: string, relation: string, quote: string, where: string, url: string }> = []
            for (const [edition, textbook, unit, title, , , matches] of (await ctx.v2.lessonAlignment()).lessons) {
                for (const [point, relation, quote, source, page] of matches) {
                    if (wanted(point)) lessons.push({ edition_id: edition, textbook, unit, lesson: title, point, relation: relation === 'T' ? '主要在教' : '也涉及', quote, where: SOURCE_LABEL(source, page), url: `${SITE}/textbooks/${edition}/standards` })
                }
            }
            // the library's books before the editions judged on lesson titles (pf_), whose quotes are not from the book
            const pilot = (item: { edition_id: string }) => Number(item.edition_id.startsWith('pf_'))
            lessons.sort((a, b) => (a.relation === b.relation ? 0 : a.relation === '主要在教' ? -1 : 1) || pilot(a) - pilot(b) || a.textbook.localeCompare(b.textbook, 'zh-Hans-CN', { numeric: true }))
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
        title: '从教材的一课找课标',
        description: '老师说的是教材里的一课时用它。把老师的原话放进 query 即可，例如「人教版 八年级上册 光的反射」「统编版四年级上册《观潮》」「五下 分数的基本性质」，工具会认出版本、年级、册次和学科。返回这一课「主要在教」「也涉及」的课标要点：要点原文和课标页码、教材里的原话和出处、这一课的课堂学习目标；再列机器按目录对齐的章节。对应关系是 AI 逐课判断，引用时注明「待核验」。找不到时如实告诉老师，不要编造。Find a textbook lesson the way teachers name it, with the standards it teaches.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: '老师对这一课的说法，可以带版本和年级册次，例如「人教版 八年级上册 光的反射」；只写课题也可以' },
                subject: { type: 'string', description: '学科，可选，例如「物理」' },
                grade: { type: 'string', description: '年级，可选，例如「八年级」「8」' },
                edition: { type: 'string', description: '教材版本，可选，例如「人教版」「统编版」「北师大版」' },
                volume: { type: 'string', description: '册次，可选：上册、下册、全一册' }
            },
            required: ['query'],
            additionalProperties: false
        },
        async run(args, ctx) {
            const raw = str(args.query).slice(0, 200)
            if (raw.replace(/\s+/gu, '').length < 2) throw new ToolInputError('请给出至少两个字的课题，例如「光的反射」。')
            const manifest = await ctx.v2.manifest()
            const asked = parseLessonQuery(raw, [...(manifest?.subjects.map(s => s.subject) || []), ...Object.keys(SUBJECT_ALIASES)])
            if (str(args.edition)) asked.publisher = publisherOf(str(args.edition)) || asked.publisher
            if (str(args.volume)) asked.volume = volumeOf(str(args.volume))
            asked.grade = gradeOf(args.grade) ?? asked.grade
            const subjectWord = str(args.subject) || asked.subject
            const slug = subjectWord ? await subjectSlug(subjectWord, ctx, false) : null
            // 美术 and 音乐 are separate books under one 艺术 standard
            const bookSubject = subjectWord === '美术' ? 'art' : subjectWord === '音乐' ? 'music' : null
            if (asked.title.length < 2) throw new ToolInputError(`「${raw}」里没有课题。请写上这一课的题目，例如「人教版 八年级上册 光的反射」。`)
            const understood = [asked.publisher, asked.grade ? `${asked.grade} 年级` : '', asked.volume, subjectWord, asked.label].filter(Boolean).join(' · ')

            // every textbook's units, chapters and lessons, read from its 目录 at build time, with the standards aligned to its pages
            const index = await ctx.v2.textbookChapters()
            const alignment = await ctx.v2.lessonAlignment()
            const v2Slug = (bookSlug: string) => (['art', 'music'].includes(bookSlug) ? 'arts' : bookSlug)
            const bookOf = (edition: string) => index.books[edition] || alignment.platform_books?.[edition]
            const filtered = !!(slug || bookSubject || asked.grade || asked.volume)
            const fits = (edition: string, withVolume: boolean, strict = true) => {
                const book = bookOf(edition)
                if (!book) return !strict || !filtered
                if (!strict) return true
                return (!slug || v2Slug(book[1]) === slug) && (!bookSubject || book[1] === bookSubject) && (!asked.grade || book[2] === asked.grade)
                    && (!withVolume || !asked.volume || book[3].split('·')[0] === asked.volume)
            }
            // best title first, then the edition asked for, then the library's own books; a volume asked for is dropped if nothing has it
            const rank = <T>(rows: T[], edition: (row: T) => string, score: (row: T) => number, strict = true) => {
                for (const withVolume of [true, false]) {
                    const scored = rows.map(row => ({ row, edition: edition(row), score: score(row) }))
                        .filter(x => x.score > 0 && fits(x.edition, withVolume, strict))
                        .map(x => {
                            const publisher = publisherOf(bookOf(x.edition)?.[0] || '')
                            return { ...x, publisher, score: x.score + (asked.publisher && publisher === asked.publisher ? 30 : 0) + (x.edition.startsWith('ed_') ? 3 : 0) }
                        })
                        .sort((a, b) => b.score - a.score)
                    if (scored.length || !asked.volume || !strict) return scored
                }
                return []
            }
            // with the edition asked for found, other editions only get a mention
            const focus = <T extends { publisher: string | null, edition: string }>(items: T[]) => {
                if (!asked.publisher || !items.some(x => x.publisher === asked.publisher)) return { items, others: [] as string[] }
                const others = [...new Set(items.filter(x => x.publisher !== asked.publisher).map(x => bookOf(x.edition)?.[0]).filter(Boolean) as string[])]
                return { items: items.filter(x => x.publisher === asked.publisher), others }
            }

            // first the lessons judged one by one on their own pages, with the textbook's own words; a unit title brings its first lessons
            const lessonScore = ([, , unit, title]: LessonAlignRow) => {
                const own = titleScore(title, asked.title)
                const byUnit = title !== unit ? titleScore(unit, asked.title) : 0
                return Math.max(own, byUnit >= 60 ? byUnit - 30 : 0)
            }
            const perUnit = new Map<string, number>()
            const rankedLessons = focus(rank(alignment.lessons, row => row[0], lessonScore).filter(({ row }) => {
                const key = `${row[0]}|${row[2]}`
                perUnit.set(key, (perUnit.get(key) || 0) + 1)
                return perUnit.get(key)! <= 3
            }))
            const lessonHits = rankedLessons.items.slice(0, asked.publisher ? 4 : 6).map(x => x.row)
            const rankedChapters = focus(rank(index.chapters, row => row[0], ([, title]) => titleScore(title, asked.title)))
            const hits = rankedChapters.items.slice(0, lessonHits.length ? 3 : 8).map(x => x.row)
            const otherEditions = [...new Set([...rankedLessons.others, ...rankedChapters.others])].slice(0, 5)

            const indicatorOf = async (point: string) => {
                const found = await ctx.v2.find(point)
                const item = found?.standard.indicators.find(entry => entry.code === point)
                return item ? { text: item.text, page: pagesNote(item.pages) } : { text: '', page: '' }
            }
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
                    const name = title.replace(TITLE_PREFIX, '')
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
            const lessons = await Promise.all(lessonHits.map(async ([edition, textbook, unit, title, lessonId, pdfPage, matches]) => {
                const goals = await ctx.v2.lessonGoals(edition, lessonId)
                return {
                    textbook: bookOf(edition)?.[0] || textbook, unit, lesson: title, pdf_page: pdfPage, url: `${SITE}/textbooks/${edition}/standards#lesson-${lessonId}`,
                    points: await Promise.all(matches.map(async ([point, relation, quote, source, page]) => {
                        const indicator = await indicatorOf(point)
                        return { point, relation: relation === 'T' ? '主要在教' : '也涉及', text: indicator.text, page: indicator.page, quote, where: SOURCE_LABEL(source, page), url: standardUrl(point.replace(/\.\d+$/u, ''), point) }
                    })),
                    objectives: (goals?.items || []).map(([text, basis, from, show]) => ({ text, basis, from, show }))
                }
            }))
            const lessonText = lessons.map(item => `- ${item.textbook} · ${item.unit}${item.lesson !== item.unit ? ` · ${item.lesson}` : ''} ${item.url}\n${item.points.map(point => `  ${point.relation} ${point.point}${point.text ? `「${point.text}」（${point.page}）` : ''}\n    教材里写着“${point.quote}”（${point.where}）`).join('\n') || '  没找到这一课主要在教的要点'}${item.objectives.length ? `\n  课堂学习目标（AI 依据要点原文起草，待核验）：\n${item.objectives.map((goal, k) => `   ${k + 1}. ${goal.text}（依据 ${goal.basis.join('、')}「${goal.from}」）`).join('\n')}` : ''}`)
            const chapterText = results.map(r => `- ${r.textbook} · ${r.chapter}${r.printed_page ? `（第 ${r.printed_page} 页）` : ''} ${r.url}\n  ${r.standards.length ? `${r.standards.map(s => `${s.code} ${s.name}（${s.subject} · ${s.stage}）`).join('；')}（${note[r.via]}）` : note.none}`)
            // nothing under the filters: say where a lesson of that title does exist, so the next call can fix the grade or edition
            const elsewhere = !lessons.length && !results.length && filtered
                ? [...new Set(rank(alignment.lessons, row => row[0], lessonScore, false).slice(0, 12).map(x => bookOf(x.edition)?.[0]).filter(Boolean) as string[])].slice(0, 4)
                : []
            const data = { query: raw, understood: { edition: asked.publisher, grade: asked.grade, volume: asked.volume, subject: subjectWord || null, title: asked.title }, lessons, results, other_editions: otherEditions, elsewhere }
            return {
                data,
                text: lessons.length || results.length
                    ? [
                        `按「${understood}」查找。`,
                        ...(lessons.length ? [`找到 ${lessons.length} 节课（AI 逐课读了教材原文判断，附原话，待核验）：`, ...lessonText] : []),
                        ...(otherEditions.length ? [`其他版本也有这一课：${otherEditions.join('、')}。`] : []),
                        ...(results.length ? [`${lessons.length ? '另外，' : ''}找到 ${results.length} 个教材章节（对应关系为机器对齐，待核验）：`, ...chapterText] : []),
                        SOURCE_NOTE
                    ].join('\n')
                    : `按「${understood}」没有找到这一课。${elsewhere.length ? `同名的课在：${elsewhere.join('、')}，请核对年级、册次或版本。` : '可以只写课题再试，或用 search_standards 按内容检索。'}`
            }
        }
    },
    {
        name: 'check_objectives',
        title: '目标体检',
        description: '老师已经写好的学习目标，逐条对照课标要点体检：依据哪条要点、出自要点原文的哪几个字、程度比要点高还是低、缺不缺条件/行为/程度，并给一条「学生能……」的改写；另查看不见的动词、主语不是学生、课标「不包括」的内容。给出学科、年级和课题（或要点编码）。Check a teacher\'s own learning objectives against the standards.',
        inputSchema: {
            type: 'object',
            properties: {
                objectives: { type: 'string', description: '老师写的学习目标，一行一条' },
                subject: { type: 'string', description: '学科，例如「数学」或 math' },
                grade: { type: 'string', description: '年级，例如「五年级」「8」' },
                topic: { type: 'string', description: '课题或教学内容，例如「分数的基本性质」，可选' },
                codes: { type: 'array', items: { type: 'string' }, description: '这节课依据的要点或标准编码，可选；给了就按这些对照' }
            },
            required: ['objectives', 'subject'],
            additionalProperties: false
        },
        async run(args, ctx) {
            // the one tool that calls the AI: /mcp has a looser limit than the AI routes, so these calls share a cap
            const minute = Math.floor(Date.now() / 60000)
            if (aiCalls.minute !== minute) Object.assign(aiCalls, { minute, count: 0 })
            if (++aiCalls.count > AI_TOOL_CALLS_PER_MINUTE) throw new ToolInputError('这一分钟体检的人有点多，请一分钟后再试。')
            const text = str(args.objectives).slice(0, 3000)
            const objectives = splitObjectives(text)
            if (!objectives.length) throw new ToolInputError('请给出至少一条学习目标，一行一条。')
            const slug = await subjectSlug(args.subject, ctx)
            const grade = gradeOf(args.grade)
            const topic = str(args.topic).slice(0, 60)
            const { points, taught } = await objectiveCheckPoints({ objectives, slug: slug!, grade, topic, codes: args.codes }, ctx)
            if (!points.length) return { data: { objectives, points: [] }, text: '没有找到可对照的课标要点；请给出课题，或用 search_standards 找到要点编码后放进 codes。' }
            const run = await checkObjectives(objectives, { line: `${grade ? `${grade}年级` : ''}${slug}${topic ? `，课题「${topic}」` : ''}`, subject_slug: slug!, points: points.slice(0, 24), taught, unitLessons: [] })
            if (!run.output) throw new Error('AI 这次没有读完这些目标，请再试一次。')
            const LEVEL: Record<string, string> = { match: '程度相当', above: '超出要点', below: '没到要点', unclear: '程度没写清' }
            const lines = run.output.objectives.map((item, index) => [
                `${index + 1}. ${item.text}`,
                item.basis.length ? `   依据 ${item.basis.join('、')}${item.from ? `「${item.from}」` : ''}${item.level ? `（${LEVEL[item.level]}${item.level_note ? `：${item.level_note}` : ''}）` : ''} ${standardUrl(item.basis[0].replace(/\.\d+$/u, ''), item.basis[0])}` : '',
                item.missing.length ? `   缺：${item.missing.join('、')}` : '',
                ...item.flags.map(flag => `   · ${flag.message}`),
                item.rewrite ? `   可以这样写：${item.rewrite}` : ''
            ].filter(Boolean).join('\n'))
            return {
                data: { ...run.output, points: points.map(point => ({ ...point, url: standardUrl(point.code.replace(/\.\d+$/u, ''), point.code) })) },
                text: [...(taught.length && !(Array.isArray(args.codes) && args.codes.length) ? [`「${topic}」这一课主要在教：${taught.join('、')}（kebiao 逐课读教材判断）`] : []), `对照了 ${points.length} 条课标要点（AI 体检，引用的课标原词已核对，判断待老师核验）：`, ...lines, ...run.output.uncovered.map(point => `还没有目标落到 ${point.code}：${point.text}`), ...run.output.notes].join('\n')
            }
        }
    },
    {
        name: 'get_check_questions',
        title: '课堂诊断题',
        description: '取课堂诊断题（语文、数学、英语、道德与法治、历史、地理、科学、物理、化学、生物学、信息科技、体育与健康、音乐、美术、劳动）：全班用手势、拇指或举草稿纸一起作答的题，每个错误答案对应一种常见错法（为什么会错、课上怎么接），附正确做法和三级阶梯练习，可直接投影放映。按学科、课标要点或标准编码、年级、或关键词查。kebiao 编写，对应教材单元或课标学段。Whole-class diagnostic questions with misconception-tagged wrong answers, every subject.',
        inputSchema: {
            type: 'object',
            properties: {
                subject: { type: 'string', description: '学科，如「英语」或 english；不填时按编码判断，或在所有学科里找' },
                code: { type: 'string', description: '课标要点或标准编码，如 MA-S3-NA-01.3、PH-S4-MA-02.3' },
                grade: { type: 'integer', description: '年级 1–9' },
                topic: { type: 'string', description: '关键词，如「通分」「密度」「一般过去时」' },
                limit: { type: 'integer', description: '最多返回几题，默认 3，最多 8' }
            },
            additionalProperties: false
        },
        async run(args, ctx) {
            if (!ctx.checks) throw new ToolInputError('诊断题暂时不可用。')
            const subject = str(args.subject)
            const code = str(args.code)
            const topic = str(args.topic)
            const grade = Number(args.grade) || gradeOf(args.grade) || 0
            if (!code && !topic && !grade) throw new ToolInputError('请给出课标要点编码、年级或关键词，例如 subject「数学」、topic「通分」。')
            const banks = await ctx.checks.banksFor({ subject, code })
            if (subject && !banks.length) throw new ToolInputError(`「${subject}」还没有课堂诊断题。`)
            const limit = Math.min(8, Math.max(1, Number(args.limit) || 3))
            const found = banks.flatMap(bank => findChecks(bank, { code, grade, q: topic }).map(item => ({ item, bank })))
            const shown = found.slice(0, limit).map(({ item, bank }) => publicCheck(item, bank))
            const lines = shown.flatMap((item, index) => [
                `${index + 1}. 【${item.topic}】${item.textbook_unit}（${item.points.join('、')}）`,
                `   ${item.stem}${item.work ? ` ${item.work.join(' ')}` : ''}`,
                ...(item.options || []).map((option, n) => `   ${n + 1}. ${option}`),
                `   答案：${item.answer}；作答方式：${item.how_to_answer}`,
                ...item.wrong_answers.map(wrong => `   选「${wrong.answer}」可能是：${wrong.misconceptions.map(m => `${m!.name}（${m!.why} 课上可以：${m!.move}）`).join('；')}`),
                ...(item.step_error ? [`   这一步错在：${item.step_error.name}（${item.step_error.why} 课上可以：${item.step_error.move}）`] : []),
                `   放映：${item.present_url}`
            ])
            return {
                data: { total: found.length, questions: shown, present_all: shown.length ? presentUrl(shown.map(item => item.id)) : null },
                text: shown.length
                    ? [`找到 ${found.length} 道课堂诊断题${found.length > shown.length ? `，列出前 ${shown.length} 道` : ''}：`, ...lines, `一起放映：${presentUrl(shown.map(item => item.id))}`].join('\n')
                    : '没有找到对应的课堂诊断题。可以换个关键词，或去 https://www.kebiao.org/checks 按学科和年级浏览。'
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
            const found = await ctx.v2.find(normCode(args.code))
            if (!found) throw new ToolInputError(await codeHint(normCode(args.code), ctx))
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

/** Every answer leads back to kebiao.org, so a teacher reading an agent's reply can check the source. */
export function withKebiaoLink(text: string) {
    return /kebiao\.org/u.test(text) ? text : `${text}\n来源：kebiao 课标 ${SITE}`
}

/** Runs a tool for MCP and the plugin API alike. */
export async function runTool(tool: KebiaoTool, args: Record<string, unknown>, ctx: ToolContext) {
    const out = await tool.run(args, ctx)
    return { ...out, text: withKebiaoLink(out.text) }
}
