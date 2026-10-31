// 教材与课标对应: the model reads lessons of one textbook unit — each with its own material (教材原文, the 国家平台
// 教学设计's 教学目标, or only the 课题) — against every 要点 of the subject at that grade, and says which 要点 each
// lesson teaches (teaches) or only touches (touches). Every match must quote the lesson's material; a match whose
// quote is not in the material is dropped. Models over-claim alignment (MathFish, Lucy et al. 2024), so a match has
// to point at the place in the book that shows it.
import { createHash } from 'node:crypto'
import { runStructuredLlm, type LlmStatus, type LlmUsage, type StructuredLlmAdapter, type StructuredLlmOptions } from './llm.js'

export type AlignPoint = { code: string, standard: string, header: string, text: string }
export type AlignLessonInput = { id: string, title: string, material: string }
export type AlignMatch = { point: string, standard: string, relation: 'teaches' | 'touches', quote: string, quote_check: 'exact' | 'close' }
export type AlignLessonResult = { id: string, matches: AlignMatch[], dropped: number }
export type AlignResult = {
    status: LlmStatus | 'partial'
    model: string | null
    latency_ms: number
    usage: LlmUsage | null
    lessons: AlignLessonResult[]
}

const GROUP_SIZE = 3
const MAX_TEACHES = 3
const MAX_TOUCHES = 2

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
                    matches: {
                        type: 'array',
                        maxItems: 6,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                point: { type: 'string', maxLength: 24 },
                                relation: { type: 'string', enum: ['teaches', 'touches'] },
                                quote: { type: 'string', maxLength: 60 }
                            },
                            required: ['point', 'relation', 'quote']
                        }
                    }
                },
                required: ['id', 'matches']
            }
        }
    },
    required: ['lessons']
} as const

const INSTRUCTIONS = `你是 kebiao 的教材与课标对应审核员。下面先列出某学科这个年级的全部课标要点（编码和原文），再给出一本教材里的几课，每课附有材料：教材原文摘录、国家平台教学设计里的教学目标，或者只有课题。
对每一课，找出这一课实际在教的要点：
relation=teaches：这一课的主要内容就是在教这条要点（新授，或这一课专门练习它）；
relation=touches：这一课有一部分涉及这条要点（为它作铺垫、用到前面学过的、拓展延伸），但不是这一课的主要目标。
判断要看内容，不看字面：要点里的词在材料里出现了，但材料并没有在教要点要求的那件事，不选；要点要求的内容在材料里看不出来，也不选。
宁缺勿滥：每课 teaches 最多 3 条、touches 最多 2 条；材料只有课题时，只选把握最大的 1–2 条。复习课、单元整理课可以选它复习的要点，标 touches。
quote 必须从这一课自己的材料里原样摘一段连续文字（6–30 个字），读者看了能明白这一课在教这条要点；摘不出来就不要选这条。不要摘课标原文，不要改写。
只用给出的要点编码，不得编造；每一课都要返回，没有对应的要点就返回空数组。`

const CHAT_INSTRUCTIONS = `${INSTRUCTIONS}
必须只返回一个 JSON 对象：{"lessons":[{"id":"L1","matches":[{"point":"…","relation":"teaches","quote":"…"}]}]}。`

export const ALIGN_PROMPT_VERSION = createHash('sha256').update(JSON.stringify([INSTRUCTIONS, CHAT_INSTRUCTIONS, SCHEMA])).digest('hex').slice(0, 12)

// quotes are compared without spaces and punctuation: OCR and PDF text layers break lines and spaces anywhere
export const squash = (text: string) => String(text || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()

const pairsOf = (plain: string) => {
    const pairs = new Set<string>()
    for (let index = 0; index + 1 < plain.length; index += 1) pairs.add(plain.slice(index, index + 2))
    return pairs
}

// 'exact' when the quote is in the material; 'close' when OCR noise breaks it but a six-character run is there and
// nearly every character pair is; null otherwise.
export function checkQuote(quote: string, material: string): 'exact' | 'close' | null {
    const key = squash(quote)
    const text = squash(material)
    if (key.length < 4) return null
    if (text.includes(key)) return 'exact'
    if (key.length < 8) return null
    let run = false
    for (let index = 0; index + 6 <= key.length && !run; index += 1) run = text.includes(key.slice(index, index + 6))
    if (!run) return null
    const have = pairsOf(text)
    const pairs = [...pairsOf(key)]
    return pairs.filter(pair => have.has(pair)).length / pairs.length >= 0.8 ? 'close' : null
}

function describePool(points: AlignPoint[]) {
    const lines: string[] = []
    let header = ''
    for (const point of points) {
        if (point.header !== header) {
            header = point.header
            lines.push(`【${point.standard}】${header}`)
        }
        lines.push(`${point.code}：${point.text.length > 160 ? `${point.text.slice(0, 160)}…` : point.text}`)
    }
    return lines.join('\n')
}

function adapterFor(group: Array<AlignLessonInput & { key: string }>, points: Map<string, AlignPoint>): StructuredLlmAdapter<AlignLessonResult[]> {
    return {
        name: 'kebiao_textbook_align',
        schema: SCHEMA,
        instructions: INSTRUCTIONS,
        chatInstructions: CHAT_INSTRUCTIONS,
        maxCompletionTokens: 6000,
        // with no thinking the model ties 「从三个方向观察几何体」 to 图形的平移、旋转
        reasoningEffort: 'low',
        validate(value) {
            const list = value && typeof value === 'object' ? (value as Record<string, unknown>).lessons : null
            if (!Array.isArray(list)) return null
            const out: AlignLessonResult[] = []
            for (const lesson of group) {
                const answer = list.find(item => item && typeof item === 'object' && String((item as Record<string, unknown>).id || '').trim() === lesson.key) as Record<string, unknown> | undefined
                if (!answer) continue
                const material = `${lesson.title}\n${lesson.material}`
                const matches: AlignMatch[] = []
                let dropped = 0
                for (const item of Array.isArray(answer.matches) ? answer.matches : []) {
                    if (!item || typeof item !== 'object') continue
                    const record = item as Record<string, unknown>
                    const code = String(record.point || '').split(/[\s,，、;；]+/u).find(value => points.has(value)) || ''
                    const relation = record.relation === 'touches' ? 'touches' : record.relation === 'teaches' ? 'teaches' : null
                    const quote = String(record.quote || '').trim().slice(0, 60)
                    // a lesson with only its 课题 (「约分」) can only quote the 课题
                    const check = !quote ? null : squash(quote) === squash(lesson.title) ? 'exact' : checkQuote(quote, material)
                    // a quote of the 要点 itself is not evidence from the book
                    const ofPoint = code && squash(points.get(code)?.text || '').includes(squash(quote)) && !squash(material).includes(squash(quote))
                    if (!code || !relation || !check || ofPoint || matches.some(match => match.point === code)) {
                        dropped += 1
                        continue
                    }
                    const count = matches.filter(match => match.relation === relation).length
                    if (count >= (relation === 'teaches' ? MAX_TEACHES : MAX_TOUCHES)) continue
                    matches.push({ point: code, standard: points.get(code)!.standard, relation, quote, quote_check: check })
                }
                out.push({ id: lesson.id, matches, dropped })
            }
            return out.length ? out : null
        }
    }
}

export async function alignLessons(
    context: string,
    pool: AlignPoint[],
    lessons: AlignLessonInput[],
    options: StructuredLlmOptions = {}
): Promise<AlignResult> {
    const started = performance.now()
    const points = new Map(pool.map(point => [point.code, point]))
    const keyed = lessons.map((lesson, index) => ({ ...lesson, key: `L${index + 1}` }))
    const groups: Array<typeof keyed> = []
    for (let index = 0; index < keyed.length; index += GROUP_SIZE) groups.push(keyed.slice(index, index + GROUP_SIZE))
    const poolText = describePool(pool)
    // groups run side by side, so the wait is about one group however many lessons the unit has
    const runs = await Promise.all(groups.map(group => runStructuredLlm(
        [
            context,
            '课标要点：',
            poolText,
            '教材里的课：',
            ...group.map(lesson => `〔${lesson.key}〕${lesson.title}\n${lesson.material || '（只有课题，没有材料）'}`)
        ].join('\n\n'),
        adapterFor(group, points),
        { ...options, timeoutMs: options.timeoutMs ?? 40000 }
    )))
    const results = new Map<string, AlignLessonResult>()
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
