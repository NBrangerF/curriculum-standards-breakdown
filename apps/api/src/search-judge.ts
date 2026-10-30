// After retrieval, the model reads each candidate standard (its 标准句 and 要点 原文) against the teacher's request and
// says whether it is what they asked for (2), related (1) or off-topic (0), with a short reason and the best 要点.
// Retrieval finds words; this step checks meaning, so "阅读" in a 英语 standard about 非语言信息 no longer passes
// for a request that excludes language subjects.
import { createHash } from 'node:crypto'
import { LruCache, runStructuredLlm, type LlmStatus, type LlmUsage, type StructuredLlmAdapter, type StructuredLlmOptions } from './llm.js'

export type JudgeCandidate = {
    code: string
    subject: string
    stage: string
    title: string
    statement: string
    indicators: Array<{ code: string, text: string }>
}

export type Judgement = { code: string, grade: 0 | 1 | 2, reason: string, point: string | null }

export type JudgeResult = {
    used: boolean
    status: LlmStatus | 'partial'
    model: string | null
    latency_ms: number
    usage: LlmUsage | null
    judgements: Map<string, Judgement>
}

const BATCH_SIZE = 10
const TIMEOUT_MS = 15000

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
                    point: { type: 'string', maxLength: 24 }
                },
                required: ['code', 'grade', 'reason', 'point']
            }
        }
    },
    required: ['judgements']
} as const

const INSTRUCTIONS = `你是 kebiao 的课标检索核对员。老师用一句话描述要找的课程标准；下面给出若干候选标准（编码、学科、学段、标准名、标准句和要点原文）。逐条判断每个候选是否符合老师的需要：
grade=2：这条标准或其中某条要点直接就是老师要找的内容；
grade=1：相关，可作参考或延伸，但不是直接对应；
grade=0：不符合——只是字面上有相同的词而意思不同，或违反了老师说的学科、学段、排除条件。
reason 用不超过 25 个汉字写判断依据，点明是哪方面内容；不要复述老师的问题，不要以“该标准”开头。
point 填最符合需要的那条要点编码（如 MA-S3-NA-01.2）；没有合适的要点填空字符串。
每个候选都必须给出一条判断，只用给出的编码，不得编造。`

const CHAT_INSTRUCTIONS = `${INSTRUCTIONS}
必须只返回一个 JSON 对象：{"judgements":[{"code":"…","grade":0|1|2,"reason":"…","point":"…"}]}。`

export const SEARCH_JUDGE_PROMPT_VERSION = createHash('sha256').update(JSON.stringify([INSTRUCTIONS, CHAT_INSTRUCTIONS, SCHEMA])).digest('hex').slice(0, 12)

const clip = (text: string, length: number) => (text.length > length ? `${text.slice(0, length)}…` : text)

function describe(candidate: JudgeCandidate) {
    return [
        `【${candidate.code}】${candidate.subject} · ${candidate.stage} · ${candidate.title}`,
        `标准：${clip(candidate.statement, 120)}`,
        ...candidate.indicators.slice(0, 8).map(item => `${item.code}：${clip(item.text, 90)}`)
    ].join('\n')
}

function adapterFor(codes: Set<string>): StructuredLlmAdapter<Judgement[]> {
    return {
        name: 'kebiao_search_judge',
        schema: SCHEMA,
        instructions: INSTRUCTIONS,
        chatInstructions: CHAT_INSTRUCTIONS,
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
                if (!codes.has(code) || ![0, 1, 2].includes(grade) || out.some(j => j.code === code)) continue
                const point = String(record.point || '').trim()
                out.push({
                    code,
                    grade: grade as 0 | 1 | 2,
                    reason: String(record.reason || '').trim().slice(0, 60),
                    point: point.startsWith(`${code}.`) ? point : null
                })
            }
            return out.length ? out : null
        }
    }
}

export const searchJudgeCache = new LruCache<Judgement>(4000, 6 * 60 * 60 * 1000)

const cacheKey = (model: string, query: string, code: string) => [model, SEARCH_JUDGE_PROMPT_VERSION, query.replace(/\s+/gu, ' ').trim(), code].join('\u0000')

export async function judgeSearchCandidates(
    query: string,
    understanding: string,
    candidates: JudgeCandidate[],
    options: StructuredLlmOptions & { cache?: LruCache<Judgement> } = {}
): Promise<JudgeResult> {
    const started = performance.now()
    const model = String((options.env || process.env).KEBIAO_LLM_MODEL || 'gpt-5-mini').trim() || 'gpt-5-mini'
    const judgements = new Map<string, Judgement>()
    const fresh: JudgeCandidate[] = []
    for (const candidate of candidates) {
        const hit = options.cache?.get(cacheKey(model, query, candidate.code))
        if (hit) judgements.set(candidate.code, hit)
        else fresh.push(candidate)
    }
    const batches: JudgeCandidate[][] = []
    for (let index = 0; index < fresh.length; index += BATCH_SIZE) batches.push(fresh.slice(index, index + BATCH_SIZE))
    // batches run side by side, so the wait is about one batch however many candidates there are
    const runs = await Promise.all(batches.map(batch => runStructuredLlm(
        [`老师的需要：${query}`, understanding ? `系统的理解：${understanding}` : '', '候选：', ...batch.map(describe)].filter(Boolean).join('\n\n'),
        adapterFor(new Set(batch.map(c => c.code))),
        { ...options, timeoutMs: options.timeoutMs ?? TIMEOUT_MS }
    )))
    for (const run of runs) {
        for (const judgement of run.output || []) {
            judgements.set(judgement.code, judgement)
            options.cache?.set(cacheKey(model, query, judgement.code), judgement)
        }
    }
    const usage = runs.reduce<LlmUsage | null>((sum, run) => run.usage
        ? { input_tokens: (sum?.input_tokens || 0) + run.usage.input_tokens, output_tokens: (sum?.output_tokens || 0) + run.usage.output_tokens, total_tokens: (sum?.total_tokens || 0) + run.usage.total_tokens }
        : sum, null)
    const failed = runs.filter(run => run.status !== 'ok')
    const status: JudgeResult['status'] = !runs.length || !failed.length ? 'ok' : failed.length < runs.length ? 'partial' : failed[0].status
    return {
        used: judgements.size > 0,
        status,
        model: runs[0]?.model ?? model,
        latency_ms: Math.round((performance.now() - started) * 100) / 100,
        usage,
        judgements
    }
}
