// 课堂学习目标: for the lessons of one textbook unit, the learning objectives each lesson can reach, written from
// three things at once — the 课标 要点 the lesson teaches (verbatim), the lesson itself (its 课题 and the textbook's
// words), and an ordinary class at that grade (it has had the unit's earlier lessons, not the later ones).
// Every objective names the 要点 it rests on and quotes the words of that 要点 it comes from, so a teacher can go
// from the objective back to the 课标 and from the 课标 forward to the lesson. Quotes not in the 要点 are dropped.
import { runStructuredLlm, type LlmStatus, type LlmUsage, type StructuredLlmAdapter, type StructuredLlmOptions } from './llm.js'

export type ObjectivePoint = { code: string, standard: string, header: string, text: string }
export type ObjectiveLessonInput = { id: string, title: string, points: Array<{ code: string, relation: 'T' | 'P', quote: string }> }
export type LessonObjective = { text: string, basis: string[], from: string, show: string }
export type LessonObjectives = { id: string, take: string, later: string, objectives: LessonObjective[], dropped: number }
export type ObjectivesResult = { status: LlmStatus | 'partial', model: string | null, latency_ms: number, usage: LlmUsage | null, lessons: LessonObjectives[] }

const GROUP_SIZE = 4
const MAX_OBJECTIVES = 3

const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        lessons: {
            type: 'array',
            maxItems: GROUP_SIZE,
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    id: { type: 'string', maxLength: 6 },
                    take: { type: 'string', maxLength: 120 },
                    later: { type: 'string', maxLength: 80 },
                    objectives: {
                        type: 'array',
                        maxItems: 4,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                text: { type: 'string', maxLength: 140 },
                                basis: { type: 'array', maxItems: 2, items: { type: 'string', maxLength: 24 } },
                                from: { type: 'string', maxLength: 40 },
                                show: { type: 'string', maxLength: 80 }
                            },
                            required: ['text', 'basis', 'from', 'show']
                        }
                    }
                },
                required: ['id', 'take', 'later', 'objectives']
            }
        }
    },
    required: ['lessons']
} as const

const INSTRUCTIONS = `你是熟悉课程标准的中小学教研员。下面是一本教材一个单元里的几节课。请为每节课写它的课堂学习目标。目标同时依据三样东西：这节课对应的课标要点原文、这节课的教材内容（课题和教材原话），以及这个年级一般学生的学情（已经学过本单元前面的课，还没学后面的课）。

每节课返回：
- take：本课承担这些要点的哪一部分、做到什么程度（不超过 60 字）。
- later：这些要点里哪些留给本单元后面的课或以后的学段（不超过 40 字；没有就留空字符串）。
- objectives：1–3 条，每条包括：
  - text：以「学生能」开头，写清条件（通过什么材料或活动、在什么情境中）、看得见的行为和程度，不超过 70 字。只写这一节课能达成的，不要把整条课标搬进来。不要用「了解」「理解」「体会」「感受」「培养」「提高」作行为动词，要用学生做得出、看得见的行为（说出、指出、比较、解释、举例、画出、计算、改写、设计、朗读……）。活动只能写在条件里，不能当目标。
  - basis：这条目标依据的要点编码，1–2 个，只能从这节课给出的编码里选。
  - from：从 basis 要点原文里原样摘一个短语（2–16 字，一字不改），说明这条目标出自课标的哪几个字。
  - show：怎样算做到——学生能做出或说出的一个具体表现（不超过 40 字）。

要求：
- 程度要和要点原文的行为词相当：原文是「初步认识」「了解」「知道」，就不要写到「运用」「灵活解决」；原文是「掌握」「运用」，也不要只写「说出」。
- 要点原文里写明「不包括」「不要求」的内容不能出现在目标里。
- 不要写本单元后面那些课才教的内容。
- 目标写的必须是这节课的课题和教材原话里确实会教的东西。要点里和这节课不相干的部分不写；要点和课题对不上时，只写对得上的那一两条。
- 不要编造你没看到的教材细节：生字个数、具体例句、人物、数据、页码都不要写，除非它出现在给出的教材原话里；不确定时用概括的说法（如「本课的生字」「课文中的例子」）。
- 主语是学生，不写「使学生」「让学生」「培养学生」。`

const CHAT_INSTRUCTIONS = `${INSTRUCTIONS}

只返回一个 JSON 对象：{"lessons":[{"id":"L1","take":"…","later":"…","objectives":[{"text":"学生能…","basis":["…"],"from":"…","show":"…"}]}]}`

// the two subjects whose 课标 define their behaviour verbs (数学 附录 2, 科学 附录 2), given to the model as the scale
export const VERB_SCALES: Record<string, string> = {
    math: '数学课标附录 2 的行为动词：结果目标——了解（从具体实例中知道或举例说明对象的有关特征；同类词：知道、初步认识）、理解（描述对象的由来、内涵和特征，阐述与相关对象的区别和联系；同类词：认识、会）、掌握（多角度理解和表征对象的本质，把对象用于新的情境；同类词：能）、运用（选择或创造适当的方法解决问题；同类词：证明、应用）。过程目标——经历、体验、感悟、探索。',
    science: '科学课标附录 2 的行为动词：认知性——一级 知道、举例说出、说出、描述、识别、列举、了解；二级 比较、举例说明、说明、概述、解释、认识、理解；三级 区别、辨析、判断、分析、阐明、分类、应用、预测、评价。技能性——一级 观察、观测、测量、记录；二级 使用、调查、估测、查阅；三级 计算、绘制、设计、制作、检测、优化、改进。体验性——一级 关注、感受、体验；二级 感知、领悟、认同、关心；三级 养成、质疑、形成、树立。'
}

const squash = (value: string) => value.replace(/[\s，。、；：「」“”‘’（）()《》,.;:!?！？…·\-—]/gu, '')
const VAGUE_LEAD = /^(学生能)?(了解|理解|体会|感受|培养|提高|感悟)/u
const BOSSY = /^(使|让|培养|引导|帮助)学生/u

// a later lesson's title is a sign only when it names something (「通分」), not a 「练习」 or 「整理和复习」
function laterTitles(unitLessons: string[], title: string) {
    const at = unitLessons.findIndex(item => squash(item) === squash(title))
    return at < 0 ? [] : unitLessons.slice(at + 1).map(item => item.replace(/^[第\d一二三四五六七八九十]+[课节单元]?\s*|[（(].*?[）)]/gu, '').trim()).filter(item => item.length >= 2 && !/练习|复习|整理|回顾|单元|测试|活动|阅读|习作|口语交际|语文园地|快乐读书吧/u.test(item))
}

function adapterFor(group: Array<ObjectiveLessonInput & { key: string }>, points: Map<string, ObjectivePoint>, unitLessons: string[]): StructuredLlmAdapter<LessonObjectives[]> {
    return {
        name: 'kebiao_lesson_objectives',
        schema: SCHEMA,
        instructions: INSTRUCTIONS,
        chatInstructions: CHAT_INSTRUCTIONS,
        maxCompletionTokens: 5000,
        reasoningEffort: 'low',
        validate(value) {
            const list = value && typeof value === 'object' ? (value as Record<string, unknown>).lessons : null
            if (!Array.isArray(list)) return null
            const out: LessonObjectives[] = []
            for (const lesson of group) {
                const answer = list.find(item => item && typeof item === 'object' && String((item as Record<string, unknown>).id || '').trim() === lesson.key) as Record<string, unknown> | undefined
                if (!answer) continue
                const allowed = new Set(lesson.points.map(point => point.code))
                const later = laterTitles(unitLessons, lesson.title)
                const objectives: LessonObjective[] = []
                let dropped = 0
                for (const item of Array.isArray(answer.objectives) ? answer.objectives : []) {
                    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
                    let text = String(record.text || '').trim().replace(/^\d+[.、．]\s*/u, '')
                    if (text && !text.startsWith('学生')) text = `学生${text.startsWith('能') ? '' : '能'}${text}`
                    const basis = [...new Set((Array.isArray(record.basis) ? record.basis : []).map(code => String(code).trim()).filter(code => allowed.has(code)))].slice(0, 2)
                    const fromRaw = String(record.from || '').trim().replace(/^[「“"]|[」”"]$/gu, '')
                    // the quote must be the 要点's own words, or the objective is not traceable
                    const from = fromRaw && basis.some(code => squash(points.get(code)?.text || '').includes(squash(fromRaw))) ? fromRaw.slice(0, 40) : ''
                    const show = String(record.show || '').trim().slice(0, 80)
                    const bad = !text || text.length > 110 || !basis.length || !from || VAGUE_LEAD.test(text) || BOSSY.test(text)
                        || later.some(title => text.includes(title)) || objectives.length >= MAX_OBJECTIVES
                    if (bad) { dropped += 1; continue }
                    objectives.push({ text, basis, from, show })
                }
                if (!objectives.length) continue
                out.push({ id: lesson.id, take: String(answer.take || '').trim().slice(0, 120), later: String(answer.later || '').trim().slice(0, 80), objectives, dropped })
            }
            return out.length ? out : null
        }
    }
}

export async function writeLessonObjectives(
    context: { subject_slug: string, line: string },
    unitLessons: string[],
    pool: ObjectivePoint[],
    lessons: ObjectiveLessonInput[],
    options: StructuredLlmOptions = {}
): Promise<ObjectivesResult> {
    const started = performance.now()
    const points = new Map(pool.map(point => [point.code, point]))
    const keyed = lessons.map((lesson, index) => ({ ...lesson, key: `L${index + 1}` }))
    const groups: Array<typeof keyed> = []
    for (let index = 0; index < keyed.length; index += GROUP_SIZE) groups.push(keyed.slice(index, index + GROUP_SIZE))
    const scale = VERB_SCALES[context.subject_slug]
    const describe = (lesson: (typeof keyed)[number]) => [
        `〔${lesson.key}〕${lesson.title}`,
        ...lesson.points.map(point => {
            const known = points.get(point.code)
            return `  ${point.relation === 'T' ? '主要在教' : '也涉及'} ${point.code}（${known?.header || ''}）：${known?.text || ''}${point.quote ? `\n    本课教材原话：${point.quote}` : ''}`
        })
    ].join('\n')
    const runs = await Promise.all(groups.map(group => runStructuredLlm(
        [
            context.line,
            `本单元的课（按教材顺序）：${unitLessons.join('、')}`,
            ...(scale ? [scale] : []),
            '要写目标的课：',
            ...group.map(describe)
        ].join('\n\n'),
        adapterFor(group, points, unitLessons),
        { ...options, timeoutMs: options.timeoutMs ?? 45000 }
    )))
    const results = new Map<string, LessonObjectives>()
    for (const run of runs) for (const lesson of run.output || []) results.set(lesson.id, lesson)
    const usage = runs.reduce<LlmUsage | null>((sum, run) => run.usage
        ? { input_tokens: (sum?.input_tokens || 0) + run.usage.input_tokens, output_tokens: (sum?.output_tokens || 0) + run.usage.output_tokens, total_tokens: (sum?.total_tokens || 0) + run.usage.total_tokens }
        : sum, null)
    const failed = runs.filter(run => run.status !== 'ok' || !run.output)
    return {
        status: !failed.length ? 'ok' : failed.length < runs.length ? 'partial' : (failed[0].status === 'ok' ? 'invalid_response' : failed[0].status),
        model: runs[0]?.model ?? null,
        latency_ms: Math.round((performance.now() - started) * 100) / 100,
        usage,
        lessons: lessons.filter(lesson => results.has(lesson.id)).map(lesson => results.get(lesson.id)!)
    }
}
