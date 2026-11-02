// After retrieval, the model reads each candidate standard (its 标准句 and 要点 原文) against the teacher's request and
// says whether it is what they asked for (2), related (1) or off-topic (0), with a short reason and the best 要点.
// Retrieval finds words; this step checks meaning, so "阅读" in a 英语 standard about 非语言信息 no longer passes
// for a request that excludes language subjects.
// Two modes: 'search' (AI 检索) lists only matches, each with a quote from the 要点 that must be in its text; 'pick'
// (AI 备课 choosing a lesson's 要点) keeps the earlier form, a verdict and reason for every candidate, because the
// page shows why a standard the textbook alignment named does not fit.
import { createHash } from 'node:crypto'
import { LruCache, runRetriedLlm, type LlmStatus, type LlmUsage, type StructuredLlmAdapter, type StructuredLlmOptions } from './llm.js'

export type JudgeCandidate = {
    code: string
    subject: string
    stage: string
    title: string
    statement: string
    indicators: Array<{ code: string, text: string }>
}

export type Judgement = { code: string, grade: 0 | 1 | 2, reason: string, point: string | null, aspect: string, quote: string }
export type JudgeMode = 'search' | 'pick'

export type JudgeResult = {
    used: boolean
    status: LlmStatus | 'partial'
    model: string | null
    latency_ms: number
    usage: LlmUsage | null
    judgements: Map<string, Judgement>
    /** How the calls ended (ok, timeout, provider_error…), and how many were sent a second time. */
    calls: Record<string, number>
    retries: number
}

// smaller batches answer sooner, and one slow call holds back fewer candidates
const BATCH_SIZE = 8
const TIMEOUT_MS = 15000

/** Each call waits up to 15 s; KEBIAO_LLM_JUDGE_TIMEOUT_MS can shorten that to between 3 and 15 s. */
export function judgeTimeoutMs(env: NodeJS.ProcessEnv = process.env) {
    const parsed = Number(env.KEBIAO_LLM_JUDGE_TIMEOUT_MS)
    return Number.isInteger(parsed) ? Math.max(3000, Math.min(TIMEOUT_MS, parsed)) : TIMEOUT_MS
}

const PICK_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        judgements: {
            type: 'array',
            maxItems: BATCH_SIZE,
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    code: { type: 'string', maxLength: 24 },
                    grade: { type: 'integer', enum: [0, 1, 2] },
                    reason: { type: 'string', maxLength: 60 },
                    point: { type: 'string', maxLength: 24 }
                },
                required: ['code', 'grade', 'reason', 'point']
            }
        }
    },
    required: ['judgements']
} as const

const PICK_INSTRUCTIONS = `你是 kebiao 的课标检索核对员。老师用一句话描述要找的课程标准；下面给出若干候选标准（编码、学科、学段、标准名、标准句和要点原文）。逐条判断每个候选是否符合老师的需要：
grade=2：这条标准或其中某条要点直接就是老师要找的内容；
grade=1：相关，要点原文里有具体的相关内容，可作参考或延伸，但不是直接对应；
grade=0：不符合——只是字面上有相同的词而意思不同，或违反了老师说的学科、学段、排除条件；只能说“可能涉及”“间接相关”的牵强联系也给 0。
reason 用不超过 25 个汉字写判断依据，点明是哪方面内容；不要复述老师的问题，不要以“该标准”开头。
point 填最符合需要的那条要点编码（如 MA-S3-NA-01.2）；没有合适的要点填空字符串。
每个候选都必须给出一条判断，只用给出的编码，不得编造。`

const PICK_CHAT_INSTRUCTIONS = `${PICK_INSTRUCTIONS}
必须只返回一个 JSON 对象：{"judgements":[{"code":"…","grade":0|1|2,"reason":"…","point":"…"}]}。`

const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        judgements: {
            type: 'array',
            maxItems: BATCH_SIZE,
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    code: { type: 'string', maxLength: 24 },
                    grade: { type: 'integer', enum: [0, 1, 2] },
                    reason: { type: 'string', maxLength: 60 },
                    aspect: { type: 'string', maxLength: 16 },
                    quote: { type: 'string', maxLength: 24 },
                    point: { type: 'string', maxLength: 24 }
                },
                required: ['code', 'grade', 'reason', 'aspect', 'quote', 'point']
            }
        }
    },
    required: ['judgements']
} as const

// Teachers often ask for a competency across subjects (阅读, 表达, 合作…). The 课标 rarely use the teacher's word for it:
// 阅读 is 识读乐谱 in 音乐 and 读统计图 in 数学. The model is told so, or it passes over most of what the teacher wants.
const INSTRUCTIONS = `你是 kebiao 的课标检索核对员。老师用一句话描述要找的课程标准；下面给出若干候选标准（编码、学科、学段、标准名、标准句和要点原文）。候选是按系统识别出的学段、学科筛选出来的；有的学科学段划分更宽（如艺术按 3–5 年级编排），不要因此判 0，但违反老师明确说的学段、学科或排除条件时判 0。
老师常问跨学科的能力或主题（阅读、表达、合作、探究、数据等），课标在各学科里会换成本学科的说法：例如“阅读”在音乐里是识读乐谱，在数学里是读统计图、查找资料，在劳动里是识读示意图，在信息科技里是在线搜索获取信息；“表达”在数学里是用统计图表示数据，在美术里是用视觉形象表达想法。
逐条判断每个候选，先找 quote：要点原文里直接写这件事（或它在本学科的说法）的最短字句，逐字照抄，不超过 12 个字，如“识读简单的示意图”“会查找资料”。
grade=2：quote 写的就是学生要做的这件事。
grade=1：quote 写的也是这件事本身，只是它在要点里占比很小，或只是为别的目标服务的手段（例如为了解月球而“利用图片资料”）。
grade=0：找不到这样的 quote；或理由要靠“涉及”“需要”“含……要素”“有助于”才能连上；或 quote 写的是相近但不同的事——问阅读时，表达、展示、观察、测量、评价、欣赏、交流、倾听都不算；问表达时，阅读、观察不算。
reason：不超过 16 个汉字，说原文写了什么，如“识读示意图后按流程制作”；不要复述老师的问题。
aspect：2～8 个字，用 quote 里的词说这件事在本学科里叫什么，如 quote“识读简单乐谱”→aspect“识读乐谱”。
point：quote 所在的要点编码（如 MA-S3-NA-01.2）；quote 来自标准句时填空字符串。
只列出 grade 为 1 或 2 的候选；不符合的不要列出，没列出的就是 0。都不符合时返回空列表。只用给出的编码，不得编造。`

const CHAT_INSTRUCTIONS = `${INSTRUCTIONS}
必须只返回一个 JSON 对象：{"judgements":[{"code":"…","grade":0|1|2,"reason":"…","aspect":"…","quote":"…","point":"…"}]}。`

export const SEARCH_JUDGE_PROMPT_VERSION = createHash('sha256').update(JSON.stringify([INSTRUCTIONS, CHAT_INSTRUCTIONS, SCHEMA])).digest('hex').slice(0, 12)
const PICK_PROMPT_VERSION = createHash('sha256').update(JSON.stringify([PICK_INSTRUCTIONS, PICK_CHAT_INSTRUCTIONS, PICK_SCHEMA])).digest('hex').slice(0, 12)

const clip = (text: string, length: number) => (text.length > length ? `${text.slice(0, length)}…` : text)

const MAX_POINTS = 12
const pairsOf = (text: string) => {
    const plain = text.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '')
    const pairs = new Set<string>()
    for (let index = 0; index + 1 < plain.length; index += 1) pairs.add(plain.slice(index, index + 2))
    return pairs
}

// A standard can hold up to 71 要点 (英语语言技能). The model reads at most 12: those sharing the most word pairs with
// the request first, then the rest in order, so 「线段垂直平分线的性质」 sees MA-S4-GG-03.10 and not only .1–.8.
export function pointsFor(candidate: JudgeCandidate, query: string) {
    if (candidate.indicators.length <= MAX_POINTS) return candidate.indicators
    const wanted = pairsOf(query)
    const scored = candidate.indicators.map((item, index) => ({ index, score: [...pairsOf(item.text)].filter(pair => wanted.has(pair)).length }))
    const keep = new Set(scored.filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, MAX_POINTS).map(item => item.index))
    for (const item of scored) {
        if (keep.size >= MAX_POINTS) break
        keep.add(item.index)
    }
    return candidate.indicators.filter((_, index) => keep.has(index))
}

function describe(candidate: JudgeCandidate, query: string) {
    return [
        `【${candidate.code}】${candidate.subject} · ${candidate.stage} · ${candidate.title}`,
        `标准：${clip(candidate.statement, 120)}`,
        ...pointsFor(candidate, query).map(item => `${item.code}：${clip(item.text, 90)}`)
    ].join('\n')
}

// Quotes are compared without spaces and punctuation: the model drops a comma or turns 「」 into “”.
const plainText = (text: string) => text.replace(/[\s\p{P}\p{S}]/gu, '')

// the model sometimes lists two 要点 in one field ("GE-S4-RE-04.3, GE-S4-RE-04.4"): keep the first real one
const firstPoint = (value: unknown, points: Set<string> | undefined) => String(value || '').split(/[\s,，、;；]+/u).find(item => points?.has(item)) || null

// 'pick': a verdict for every candidate, as the model gave it
function pickAdapter(batch: JudgeCandidate[]): StructuredLlmAdapter<Judgement[]> {
    const points = new Map(batch.map(candidate => [candidate.code, new Set(candidate.indicators.map(item => item.code))]))
    return {
        name: 'kebiao_search_judge',
        schema: PICK_SCHEMA,
        instructions: PICK_INSTRUCTIONS,
        chatInstructions: PICK_CHAT_INSTRUCTIONS,
        maxCompletionTokens: 1600,
        validate(value) {
            const list = value && typeof value === 'object' ? (value as Record<string, unknown>).judgements : null
            if (!Array.isArray(list)) return null
            const out: Judgement[] = []
            for (const item of list) {
                if (!item || typeof item !== 'object') continue
                const record = item as Record<string, unknown>
                const code = String(record.code || '').trim()
                const grade = Number(record.grade)
                if (!points.has(code) || ![0, 1, 2].includes(grade) || out.some(j => j.code === code)) continue
                out.push({ code, grade: grade as 0 | 1 | 2, reason: String(record.reason || '').trim().slice(0, 60), point: firstPoint(record.point, points.get(code)), aspect: '', quote: '' })
            }
            return out.length ? out : null
        }
    }
}

function adapterFor(batch: JudgeCandidate[]): StructuredLlmAdapter<Judgement[]> {
    const points = new Map(batch.map(candidate => [candidate.code, new Set(candidate.indicators.map(item => item.code))]))
    const byCode = new Map(batch.map(candidate => [candidate.code, candidate]))
    return {
        name: 'kebiao_search_judge',
        schema: SCHEMA,
        instructions: INSTRUCTIONS,
        chatInstructions: CHAT_INSTRUCTIONS,
        // minimal reasoning: with 'low' the provider's calls ran past 15 s and most checks timed out (live test, 11-02);
        // the price is that a plain match is now and then left out of one run
        maxCompletionTokens: 1600,
        validate(value) {
            const list = value && typeof value === 'object' ? (value as Record<string, unknown>).judgements : null
            if (!Array.isArray(list)) return null
            // only matches are listed (a line per reject was most of a call's output, and its time); a complete answer
            // marks every candidate it leaves out as 0
            const out: Judgement[] = []
            for (const item of list) {
                if (!item || typeof item !== 'object') continue
                const record = item as Record<string, unknown>
                const code = String(record.code || '').trim()
                const grade = Number(record.grade)
                if (!points.has(code) || ![0, 1, 2].includes(grade) || out.some(j => j.code === code)) continue
                const named = firstPoint(record.point, points.get(code))
                // a match stands only on words the 课标 actually has: a quote that is not in the text is an invented
                // link ("要先读懂才能做"), so the verdict becomes 0; the 要点 holding the quote is the closest one
                const candidate = byCode.get(code)!
                const quote = String(record.quote || '').trim()
                const wanted = plainText(quote)
                const holder = wanted.length >= 2 ? candidate.indicators.find(item => plainText(item.text).includes(wanted)) : undefined
                const quoted = Boolean(holder) || (wanted.length >= 2 && plainText(candidate.statement).includes(wanted))
                // the aspect names the match in the quote's own words; one that shares no word with it (「音乐内容理解」
                // for 「能表达自己的观演感受」) shows the quote is not evidence of what the teacher asked for
                const aspect = String(record.aspect || '').trim().slice(0, 12)
                const grounded = !plainText(aspect) || [...pairsOf(aspect)].some(pair => wanted.includes(pair))
                const kept = grade > 0 && quoted && grounded ? grade as 1 | 2 : 0
                out.push({
                    code,
                    grade: kept,
                    reason: kept ? String(record.reason || '').trim().slice(0, 60) : '',
                    point: kept ? holder?.code || named : null,
                    aspect: kept ? aspect : '',
                    quote: kept ? quote.slice(0, 40) : ''
                })
            }
            for (const code of byCode.keys()) {
                if (!out.some(judgement => judgement.code === code)) out.push({ code, grade: 0, reason: '', point: null, aspect: '', quote: '' })
            }
            return out
        }
    }
}

export const searchJudgeCache = new LruCache<Judgement>(4000, 6 * 60 * 60 * 1000)

const cacheKey = (model: string, mode: JudgeMode, query: string, code: string) => [model, mode === 'pick' ? PICK_PROMPT_VERSION : SEARCH_JUDGE_PROMPT_VERSION, query.replace(/\s+/gu, ' ').trim(), code].join('\u0000')

export async function judgeSearchCandidates(
    query: string,
    understanding: string,
    candidates: JudgeCandidate[],
    options: StructuredLlmOptions & { cache?: LruCache<Judgement>, mode?: JudgeMode } = {}
): Promise<JudgeResult> {
    const started = performance.now()
    const mode = options.mode || 'search'
    const model = String((options.env || process.env).KEBIAO_LLM_MODEL || 'gpt-5-mini').trim() || 'gpt-5-mini'
    const judgements = new Map<string, Judgement>()
    const fresh: JudgeCandidate[] = []
    for (const candidate of candidates) {
        const hit = options.cache?.get(cacheKey(model, mode, query, candidate.code))
        if (hit) judgements.set(candidate.code, hit)
        else fresh.push(candidate)
    }
    const batches: JudgeCandidate[][] = []
    for (let index = 0; index < fresh.length; index += BATCH_SIZE) batches.push(fresh.slice(index, index + BATCH_SIZE))
    // batches run side by side, so the wait is about one batch however many candidates there are
    const timeoutMs = options.timeoutMs ?? judgeTimeoutMs(options.env || process.env)
    const runs = await Promise.all(batches.map(batch => runRetriedLlm(
        [`老师的需要：${query}`, understanding ? `系统的理解：${understanding}` : '', '候选：', ...batch.map(candidate => describe(candidate, query))].filter(Boolean).join('\n\n'),
        mode === 'pick' ? pickAdapter(batch) : adapterFor(batch),
        { ...options, timeoutMs }
    )))
    for (const run of runs) {
        for (const judgement of run.output || []) {
            judgements.set(judgement.code, judgement)
            options.cache?.set(cacheKey(model, mode, query, judgement.code), judgement)
        }
    }
    const usage = runs.reduce<LlmUsage | null>((sum, run) => run.usage
        ? { input_tokens: (sum?.input_tokens || 0) + run.usage.input_tokens, output_tokens: (sum?.output_tokens || 0) + run.usage.output_tokens, total_tokens: (sum?.total_tokens || 0) + run.usage.total_tokens }
        : sum, null)
    const failed = runs.filter(run => run.status !== 'ok')
    const status: JudgeResult['status'] = !runs.length || !failed.length ? 'ok' : failed.length < runs.length ? 'partial' : failed[0].status
    const calls: Record<string, number> = {}
    for (const run of runs) calls[run.status] = (calls[run.status] || 0) + 1
    return {
        used: judgements.size > 0,
        status,
        model: runs[0]?.model ?? model,
        latency_ms: Math.round((performance.now() - started) * 100) / 100,
        usage,
        judgements,
        calls,
        retries: runs.filter(run => (run.attempts || 1) > 1).length
    }
}
