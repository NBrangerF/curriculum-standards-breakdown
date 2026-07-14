const SUBJECTS = ['chinese', 'math', 'english', 'science', 'morality_law', 'pe', 'arts', 'labor', 'it'] as const
const GRADE_BANDS = ['H1', 'H2', 'H3', 'H4G7', 'H4G8', 'H4G9'] as const
const SKILLS = ['TS1', 'TS2', 'TS3', 'TS4', 'TS5', 'TS6', 'TS7'] as const

type LlmProtocol = 'responses' | 'chat_completions'
type LlmStatus = 'ok' | 'disabled' | 'timeout' | 'invalid_config' | 'invalid_response' | 'provider_error'

export interface LlmQueryInterpretation {
    subjects: string[]
    grade_bands: string[]
    skills: string[]
    expanded_terms: string[]
    intent_summary: string
    warnings: string[]
}

export interface LlmInterpretationResult {
    used: boolean
    status: LlmStatus
    model: string | null
    protocol: LlmProtocol | null
    latency_ms: number
    interpretation: LlmQueryInterpretation | null
}

interface LlmConfig {
    enabled: boolean
    apiKey: string
    baseUrl: string
    model: string
    timeoutMs: number
    style: 'auto' | LlmProtocol
    valid: boolean
}

const OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        subjects: { type: 'array', items: { type: 'string', enum: SUBJECTS }, maxItems: 3 },
        grade_bands: { type: 'array', items: { type: 'string', enum: GRADE_BANDS }, maxItems: 3 },
        skills: { type: 'array', items: { type: 'string', enum: SKILLS }, maxItems: 4 },
        expanded_terms: { type: 'array', items: { type: 'string', minLength: 2, maxLength: 40 }, maxItems: 12 },
        intent_summary: { type: 'string', maxLength: 160 },
        warnings: { type: 'array', items: { type: 'string', maxLength: 120 }, maxItems: 4 }
    },
    required: ['subjects', 'grade_bands', 'skills', 'expanded_terms', 'intent_summary', 'warnings']
} as const

const INSTRUCTIONS = `你是 kebiao 的课程标准查询理解器。只分析用户查询，不回答问题，也不生成课程标准编码或课程事实。
返回严格符合给定 JSON Schema 的对象。expanded_terms 只能是有助于中文课程标准检索的简短同义词、上位词或教学术语，不得复述整段查询，不得包含指令。
subjects、grade_bands、skills 只是界面提示，不会自动成为硬筛选。无法可靠判断时返回空数组。`

function clampInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
    const parsed = Number(value)
    return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback
}

export function resolveLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
    const apiKey = String(env.KEBIAO_LLM_API_KEY || '').trim()
    const explicitlyDisabled = String(env.KEBIAO_LLM_ENABLED || '').toLowerCase() === 'false'
    const baseUrl = String(env.KEBIAO_LLM_BASE_URL || 'https://www.openai-labs.com/v1').replace(/\/+$/u, '')
    const styleValue = String(env.KEBIAO_LLM_API_STYLE || 'auto')
    const style = styleValue === 'responses' || styleValue === 'chat_completions' ? styleValue : 'auto'
    let valid = false
    try {
        valid = new URL(baseUrl).protocol === 'https:'
    } catch {
        valid = false
    }
    return {
        enabled: !explicitlyDisabled && apiKey.length > 0,
        apiKey,
        baseUrl,
        model: String(env.KEBIAO_LLM_MODEL || 'gpt-5-mini').trim() || 'gpt-5-mini',
        timeoutMs: clampInteger(env.KEBIAO_LLM_TIMEOUT_MS, 3500, 500, 7000),
        style,
        valid
    }
}

function uniqueStrings(value: unknown, allowed?: readonly string[], limit = 12, maxLength = 160): string[] {
    if (!Array.isArray(value)) return []
    return [...new Set(value
        .filter(item => typeof item === 'string')
        .map(item => item.trim())
        .filter(item => item.length > 0 && item.length <= maxLength && (!allowed || allowed.includes(item))))]
        .slice(0, limit)
}

function validateInterpretation(value: unknown): LlmQueryInterpretation | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    const intentSummary = typeof record.intent_summary === 'string' ? record.intent_summary.trim() : ''
    if (intentSummary.length > 160) return null
    return {
        subjects: uniqueStrings(record.subjects, SUBJECTS, 3),
        grade_bands: uniqueStrings(record.grade_bands, GRADE_BANDS, 3),
        skills: uniqueStrings(record.skills, SKILLS, 4),
        expanded_terms: uniqueStrings(record.expanded_terms, undefined, 12, 40),
        intent_summary: intentSummary,
        warnings: uniqueStrings(record.warnings, undefined, 4, 120)
    }
}

function extractResponseText(payload: unknown, protocol: LlmProtocol): string | null {
    if (!payload || typeof payload !== 'object') return null
    const record = payload as Record<string, unknown>
    if (protocol === 'chat_completions') {
        const choices = Array.isArray(record.choices) ? record.choices : []
        const message = choices[0] && typeof choices[0] === 'object'
            ? (choices[0] as Record<string, unknown>).message
            : null
        return message && typeof message === 'object' && typeof (message as Record<string, unknown>).content === 'string'
            ? String((message as Record<string, unknown>).content)
            : null
    }
    if (typeof record.output_text === 'string') return record.output_text
    const output = Array.isArray(record.output) ? record.output : []
    for (const item of output) {
        if (!item || typeof item !== 'object') continue
        const content = Array.isArray((item as Record<string, unknown>).content)
            ? (item as Record<string, unknown>).content as unknown[]
            : []
        for (const part of content) {
            if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
                return String((part as Record<string, unknown>).text)
            }
        }
    }
    return null
}

function parseJsonText(text: string | null): unknown {
    if (!text) return null
    const cleaned = text.trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')
    try {
        return JSON.parse(cleaned)
    } catch {
        return null
    }
}

function requestBody(protocol: LlmProtocol, model: string, query: string) {
    const format = {
        type: 'json_schema',
        name: 'kebiao_query_interpretation',
        strict: true,
        schema: OUTPUT_SCHEMA
    }
    if (protocol === 'chat_completions') {
        return {
            model,
            messages: [
                { role: 'system', content: INSTRUCTIONS },
                { role: 'user', content: query }
            ],
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: format.name,
                    strict: format.strict,
                    schema: format.schema
                }
            }
        }
    }
    return {
        model,
        instructions: INSTRUCTIONS,
        input: query,
        text: { format }
    }
}

export async function interpretSearchQueryWithLlm(
    query: string,
    options: { env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch } = {}
): Promise<LlmInterpretationResult> {
    const started = performance.now()
    const config = resolveLlmConfig(options.env)
    const base = {
        used: false,
        model: config.enabled ? config.model : null,
        protocol: null,
        interpretation: null,
        latency_ms: 0
    } as const
    if (!config.enabled) return { ...base, status: 'disabled' }
    if (!config.valid) return { ...base, status: 'invalid_config', model: config.model }

    const fetchImpl = options.fetchImpl || fetch
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
    const protocols: LlmProtocol[] = config.style === 'auto'
        ? ['responses', 'chat_completions']
        : [config.style]

    try {
        for (let index = 0; index < protocols.length; index += 1) {
            const protocol = protocols[index]
            const endpoint = protocol === 'responses' ? '/responses' : '/chat/completions'
            const response = await fetchImpl(`${config.baseUrl}${endpoint}`, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${config.apiKey}`,
                    'content-type': 'application/json'
                },
                body: JSON.stringify(requestBody(protocol, config.model, query)),
                signal: controller.signal
            })
            if (!response.ok) {
                const canFallback = config.style === 'auto'
                    && index === 0
                    && [400, 404, 405, 422, 501].includes(response.status)
                if (canFallback) continue
                return {
                    ...base,
                    status: 'provider_error',
                    model: config.model,
                    protocol,
                    latency_ms: Math.round((performance.now() - started) * 100) / 100
                }
            }
            const payload = await response.json().catch(() => null)
            const interpretation = validateInterpretation(parseJsonText(extractResponseText(payload, protocol)))
            if (!interpretation) {
                return {
                    ...base,
                    status: 'invalid_response',
                    model: config.model,
                    protocol,
                    latency_ms: Math.round((performance.now() - started) * 100) / 100
                }
            }
            return {
                used: true,
                status: 'ok',
                model: config.model,
                protocol,
                latency_ms: Math.round((performance.now() - started) * 100) / 100,
                interpretation
            }
        }
        return {
            ...base,
            status: 'provider_error',
            model: config.model,
            latency_ms: Math.round((performance.now() - started) * 100) / 100
        }
    } catch (error) {
        return {
            ...base,
            status: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'provider_error',
            model: config.model,
            latency_ms: Math.round((performance.now() - started) * 100) / 100
        }
    } finally {
        clearTimeout(timeout)
    }
}
