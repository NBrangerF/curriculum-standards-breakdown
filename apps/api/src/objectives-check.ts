// 目标体检: a teacher's own learning objectives, traced back to the 课标. The AI says which 要点 each objective rests
// on, which words of the 要点 it comes from (checked to be the 要点's own words), whether it asks more or less than
// the 要点, what it lacks (条件 / 行为 / 程度) and how it could read. The program adds what it can see itself:
// vague verbs, a later lesson's content, a 课标 「不包括」, a 要点 no objective covers.
import { runStructuredLlm, type LlmStatus, type LlmUsage, type StructuredLlmAdapter, type StructuredLlmOptions } from './llm.js'
import { VERB_SCALES } from './lesson-objectives.js'
import { limitsOf, VAGUE } from './lesson-plan.js'

export type CheckPoint = { code: string, text: string, header: string }
export type ObjectiveCheckInput = {
    line: string, subject_slug: string, points: CheckPoint[],
    // the 要点 the lesson is meant to teach; a missed one is reported
    taught: string[],
    // the unit's lessons in order, this one marked
    unitLessons: Array<{ title: string, current?: boolean }>,
    // 单元目标 for a whole unit rather than one lesson's
    unit?: boolean
}
export type Level = 'match' | 'above' | 'below' | 'unclear'
export type CheckedObjective = {
    text: string, basis: string[], from: string, level: Level | null, level_note: string, missing: string[], rewrite: string,
    flags: Array<{ kind: string, message: string }>
}
export type ObjectivesCheck = { objectives: CheckedObjective[], uncovered: CheckPoint[], notes: string[] }
export type ObjectivesCheckResult = { status: LlmStatus, model: string | null, latency_ms: number, usage: LlmUsage | null, output: ObjectivesCheck | null }

const MAX = 8
const LEVELS = new Set<Level>(['match', 'above', 'below', 'unclear'])
const PARTS = ['条件', '行为', '程度']
const squash = (value: string) => value.replace(/[\s，。、；：「」“”‘’（）()《》,.;:!?！？…·\-—]/gu, '')

// one objective a line; 「1.」「（1）」「①」「目标一：」 numbering and a 「教学目标」 heading dropped; one long line split at 「；」
export function splitObjectives(text: string) {
    let lines = text.split(/\r?\n/u).map(line => line.trim()).filter(Boolean).filter(line => !/^(?:[一二三四五六七八九十]+[、.．]\s*)?(?:教学|学习|课堂)?目标[:：]?$/u.test(line))
    if (lines.length === 1) lines = lines[0].split(/[；;]/u).map(line => line.trim()).filter(Boolean)
    return lines.map(line => line.replace(/^(?:\d+\s*[.．、)）]|[（(]\s*\d+\s*[)）]|[①②③④⑤⑥⑦⑧⑨⑩]|目标[一二三四五六七八九十\d]+[:：、]?|[A-D][.．、])\s*/u, '').trim()).filter(line => line.length >= 4).slice(0, MAX)
}

const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        objectives: {
            type: 'array',
            maxItems: MAX,
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    n: { type: 'integer' },
                    basis: { type: 'array', maxItems: 2, items: { type: 'string', maxLength: 24 } },
                    from: { type: 'string', maxLength: 40 },
                    level: { type: 'string', enum: ['match', 'above', 'below', 'unclear'] },
                    level_note: { type: 'string', maxLength: 80 },
                    missing: { type: 'array', maxItems: 3, items: { type: 'string', enum: PARTS } },
                    rewrite: { type: 'string', maxLength: 120 }
                },
                required: ['n', 'basis', 'from', 'level', 'level_note', 'missing', 'rewrite']
            }
        },
        notes: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 80 } }
    },
    required: ['objectives', 'notes']
} as const

const INSTRUCTIONS = `你是熟悉课程标准的中小学教研员。老师写了一节课或一个单元的学习目标（已编号），请逐条对照「可依据的课标要点」做体检。只评这些目标本身，不替老师重写整节课或整个单元。

每条目标返回：
- n：目标编号。
- basis：这条目标依据的要点编码，0–2 个，只能从给出的编码里选；找不到依据就给空数组。
- from：从 basis 要点原文里原样摘一个短语（2–16 字，一字不改），说明目标出自课标的哪几个字；没有依据就留空。
- level：目标要求的程度和要点原文的行为词相比——match 相当；above 超出（如要点是「初步认识」「了解」，目标写「熟练运用」「灵活解决」）；below 不到（如要点是「掌握」「运用」，目标只写「说出」「知道」）；unclear 目标没写清程度，无法比较。
- level_note：一句话说明判断（不超过 40 字），引用要点和目标里的行为词。
- missing：目标缺了哪几样——条件（通过什么材料、活动或在什么情境下）、行为（学生做出的、看得见的行为）、程度（做到什么水平）。都有就给空数组。
- rewrite：保留老师原意，改写成「学生能……」一句（不超过 70 字），补上缺的部分，程度和要点相当；原目标已经很好就留空。不要编造教材里的具体细节（生字个数、例句、数据等）。

notes：整体上值得老师注意的一两句（如目标太多、几条目标重复、缺少某类目标），没有就给空数组。`

const CHAT_INSTRUCTIONS = `${INSTRUCTIONS}

只返回一个 JSON 对象：{"objectives":[{"n":1,"basis":["…"],"from":"…","level":"match","level_note":"…","missing":[],"rewrite":""}],"notes":[]}`

// later lessons of the unit whose titles are specific enough to spot in an objective (「通分」, not 「练习」)
function laterTitles(unitLessons: ObjectiveCheckInput['unitLessons']) {
    const at = unitLessons.findIndex(item => item.current)
    if (at < 0) return []
    return unitLessons.slice(at + 1).map(item => item.title).filter(title => title.length >= 2 && title.length <= 8 && !unitLessons[at].title.includes(title) && !/…|整理|复习|练习|园地|口语交际|习作|Unit|Section/u.test(title))
}

// what the program can see without the AI
export function ruleFlags(text: string, basisTexts: string[], unitLessons: ObjectiveCheckInput['unitLessons']) {
    const flags: CheckedObjective['flags'] = []
    if (/^(?:使|让|培养|引导|帮助|促进)学生/u.test(text)) flags.push({ kind: 'teacher_subject', message: '主语是老师（「使学生」「培养学生」）；学习目标的主语应是学生：「学生能……」。' })
    const vague = text.match(VAGUE)
    if (vague && !/能|会|说出|写出|解释|比较|设计|完成|运用|判断|计算|画出|列举|指出|朗读|背诵|概括/u.test(text.replace(VAGUE, ''))) flags.push({ kind: 'vague_verb', message: `「${vague[1]}」看不见、测不了；换成学生做得出的行为，如说出、写出、比较、解释。` })
    const ahead = laterTitles(unitLessons).find(title => text.includes(title))
    if (ahead) flags.push({ kind: 'later_lesson', message: `写到了「${ahead}」，本单元后面有「${ahead}」一课专门教它；本课可以只做铺垫。` })
    for (const limit of limitsOf(basisTexts)) {
        if (text.includes(limit.key)) flags.push({ kind: 'beyond_limit', message: `课标写明「${limit.phrase}」，这条目标写到了「${limit.key}」。` })
    }
    if (text.length > 90) flags.push({ kind: 'too_long', message: '一条目标塞了好几件事，拆成两条更好检测。' })
    return flags
}

function adapter(objectives: string[], input: ObjectiveCheckInput): StructuredLlmAdapter<ObjectivesCheck> {
    const points = new Map(input.points.map(point => [point.code, point]))
    return {
        name: 'kebiao_objectives_check',
        schema: SCHEMA,
        instructions: INSTRUCTIONS,
        chatInstructions: CHAT_INSTRUCTIONS,
        maxCompletionTokens: 4000,
        reasoningEffort: 'low',
        validate(value) {
            const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
            const list = Array.isArray(record.objectives) ? record.objectives as Array<Record<string, unknown>> : null
            if (!list) return null
            const checked = objectives.map((text, index): CheckedObjective => {
                const answer = list.find(item => Number(item?.n) === index + 1) || {}
                const basis = [...new Set((Array.isArray(answer.basis) ? answer.basis : []).map(code => String(code).trim()).filter(code => points.has(code)))].slice(0, 2)
                const fromRaw = String(answer.from || '').trim().replace(/^[「“"]|[」”"]$/gu, '')
                const from = fromRaw && basis.some(code => squash(points.get(code)!.text).includes(squash(fromRaw))) ? fromRaw.slice(0, 40) : ''
                const level = LEVELS.has(answer.level as Level) && basis.length ? answer.level as Level : null
                let rewrite = String(answer.rewrite || '').trim().slice(0, 120)
                if (rewrite && (!rewrite.startsWith('学生') || VAGUE.test(rewrite.slice(0, 8)) || squash(rewrite) === squash(text))) rewrite = ''
                const flags = ruleFlags(text, basis.map(code => points.get(code)!.text), input.unitLessons)
                if (!basis.length) flags.unshift({ kind: 'no_basis', message: `在这${input.unit ? '个单元' : '节课'}的要点里找不到这条目标的依据。如果它是过程或素养目标（如分类讨论、合作交流），可以保留，但要写清在哪个活动里、学生做出什么；如果它只是一项活动，就不算目标。` })
                return {
                    text,
                    basis,
                    from,
                    level,
                    level_note: level ? String(answer.level_note || '').trim().slice(0, 80) : '',
                    missing: [...new Set((Array.isArray(answer.missing) ? answer.missing : []).map(String).filter(part => PARTS.includes(part)))],
                    rewrite,
                    flags
                }
            })
            const cited = new Set(checked.flatMap(item => item.basis))
            const notes = (Array.isArray(record.notes) ? record.notes : []).map(note => String(note).trim().slice(0, 80)).filter(Boolean).slice(0, 3)
            if (!input.unit && objectives.length > 5) notes.unshift(`一节课写了 ${objectives.length} 条目标；一般 2–4 条，课上才检测得过来。`)
            return { objectives: checked, uncovered: input.taught.filter(code => !cited.has(code) && points.has(code)).map(code => points.get(code)!), notes }
        }
    }
}

export async function checkObjectives(objectives: string[], input: ObjectiveCheckInput, options: StructuredLlmOptions = {}): Promise<ObjectivesCheckResult> {
    const scale = VERB_SCALES[input.subject_slug]
    const prompt = [
        input.line,
        input.unit ? '这是整个单元的目标，不是一节课的；单元目标可以比课时目标概括，但仍要看得见、测得了。' : '',
        input.unitLessons.length ? `本单元的课（按教材顺序，「←本课」是这一课）：${input.unitLessons.map(item => `${item.title}${item.current ? '←本课' : ''}`).join('、')}` : '',
        ...(scale ? [scale] : []),
        '可依据的课标要点：',
        ...input.points.map(point => `${point.code}（${point.header}）：${point.text}${input.taught.includes(point.code) ? (input.unit ? '〔这个单元主要教〕' : '〔这节课主要教〕') : ''}`),
        '老师写的学习目标：',
        ...objectives.map((text, index) => `${index + 1}. ${text}`)
    ].filter(Boolean).join('\n')
    const run = await runStructuredLlm(prompt, adapter(objectives, input), { ...options, timeoutMs: options.timeoutMs ?? 45000 })
    return { status: run.status, model: run.model, latency_ms: run.latency_ms, usage: run.usage, output: run.output }
}
