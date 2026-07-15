const SUBJECTS = ['chinese', 'math', 'english', 'science', 'morality_law', 'pe', 'arts', 'labor', 'it'] as const
const GRADE_BANDS = ['H1', 'H2', 'H3', 'H4G7', 'H4G8', 'H4G9'] as const
const SKILLS = ['TS1', 'TS2', 'TS3', 'TS4', 'TS5', 'TS6', 'TS7'] as const

export type LlmProtocol = 'responses' | 'chat_completions'
export type LlmStatus = 'ok' | 'disabled' | 'timeout' | 'invalid_config' | 'invalid_response' | 'provider_error'

export interface LlmQueryInterpretation {
    subjects: string[]
    excluded_subjects: string[]
    grade_bands: string[]
    skills: string[]
    core_terms: string[]
    expanded_terms: string[]
    constraint_evidence: LlmConstraintEvidence[]
    ambiguities: string[]
    clarification_question: string
    intent_summary: string
    warnings: string[]
}

export interface LlmConstraintEvidence {
    kind: 'subject' | 'excluded_subject' | 'grade_band'
    value: string
    evidence_span: string
}

export interface LlmInterpretationResult {
    used: boolean
    status: LlmStatus
    model: string | null
    protocol: LlmProtocol | null
    latency_ms: number
    interpretation: LlmQueryInterpretation | null
    usage: LlmUsage | null
}

export interface LlmUsage {
    input_tokens: number
    output_tokens: number
    total_tokens: number
}

export interface StructuredLlmResult<T> {
    used: boolean
    status: LlmStatus
    model: string | null
    protocol: LlmProtocol | null
    latency_ms: number
    output: T | null
    usage: LlmUsage | null
}

export interface StructuredLlmAdapter<T> {
    name: string
    schema: Record<string, unknown>
    instructions: string
    chatInstructions: string
    maxCompletionTokens: number
    validate: (value: unknown) => T | null
}

export interface StructuredLlmOptions {
    env?: NodeJS.ProcessEnv
    fetchImpl?: typeof fetch
    timeoutMs?: number
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
        excluded_subjects: { type: 'array', items: { type: 'string', enum: SUBJECTS }, maxItems: 9 },
        grade_bands: { type: 'array', items: { type: 'string', enum: GRADE_BANDS }, maxItems: 3 },
        skills: { type: 'array', items: { type: 'string', enum: SKILLS }, maxItems: 4 },
        core_terms: { type: 'array', items: { type: 'string', minLength: 2, maxLength: 24 }, maxItems: 6 },
        expanded_terms: { type: 'array', items: { type: 'string', minLength: 2, maxLength: 40 }, maxItems: 12 },
        constraint_evidence: {
            type: 'array',
            maxItems: 15,
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    kind: { type: 'string', enum: ['subject', 'excluded_subject', 'grade_band'] },
                    value: { type: 'string', maxLength: 64 },
                    evidence_span: { type: 'string', minLength: 1, maxLength: 80 }
                },
                required: ['kind', 'value', 'evidence_span']
            }
        },
        ambiguities: { type: 'array', items: { type: 'string', maxLength: 120 }, maxItems: 4 },
        clarification_question: { type: 'string', maxLength: 120 },
        intent_summary: { type: 'string', maxLength: 160 },
        warnings: { type: 'array', items: { type: 'string', maxLength: 120 }, maxItems: 4 }
    },
    required: ['subjects', 'excluded_subjects', 'grade_bands', 'skills', 'core_terms', 'expanded_terms', 'constraint_evidence', 'ambiguities', 'clarification_question', 'intent_summary', 'warnings']
} as const

const INSTRUCTIONS = `你是 kebiao 的课程标准查询理解器。只分析用户查询，不回答问题，也不生成课程标准编码或课程事实。
	返回严格符合给定 JSON Schema 的对象。core_terms 只填写用户真正要查找的核心主题概念，例如查询“除了语文之外跟阅读相关”时填写“阅读”，不得填写学科、学段、课标、相关、要求、目标、能力、教学、学习等筛选词或泛词。
	expanded_terms 只能填写 core_terms 的紧密同义词或可验证的相邻表达；不得复述整段查询，不得用“理解、要求、目标、能力”等泛词补足数量。无法可靠提取核心主题时返回空数组。
	subjects 表示用户明确要求包含的学科；excluded_subjects 表示“除了语文”“排除数学”“非英语”等明确排除的学科，同一学科不得同时出现在二者中。
	学段映射必须严格使用：H1=第一学段=1-2年级=G1-2；H2=第二学段=3-4年级=G3-4；H3=第三学段=5-6年级=G5-6；H4G7=七年级=G7；H4G8=八年级=G8；H4G9=九年级=G9。
	grade_bands、skills 只在用户意图明确时填写。无法可靠判断时返回空数组。
	每个 subjects、excluded_subjects、grade_bands 值都必须在 constraint_evidence 中提供 kind、value 和用户原文中逐字存在的 evidence_span；没有原文证据时不得输出该约束。
	如果用户表达真的存在歧义，把原因写入 ambiguities，并只提出一个简短 clarification_question；不要猜测。没有歧义时返回空数组和空字符串。`

const CHAT_JSON_INSTRUCTIONS = `${INSTRUCTIONS}
	必须只返回一个 JSON 对象，并完整包含以下字段：subjects、excluded_subjects、grade_bands、skills、core_terms、expanded_terms、constraint_evidence、ambiguities、clarification_question、intent_summary、warnings。
subjects 和 excluded_subjects 只能来自 ${SUBJECTS.join(', ')}；grade_bands 只能来自 ${GRADE_BANDS.join(', ')}；skills 只能来自 ${SKILLS.join(', ')}。core_terms、expanded_terms 和 warnings 也必须是字符串数组，intent_summary 必须是字符串。`

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
    const subjects = uniqueStrings(record.subjects, SUBJECTS, 3)
    const excludedSubjects = uniqueStrings(record.excluded_subjects, SUBJECTS, 9)
        .filter(subject => !subjects.includes(subject))
    const gradeBands = uniqueStrings(record.grade_bands, GRADE_BANDS, 3)
    const skills = uniqueStrings(record.skills, SKILLS, 4)
    const constraintEvidence = Array.isArray(record.constraint_evidence)
        ? record.constraint_evidence.flatMap(item => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return []
            const evidence = item as Record<string, unknown>
            const kind = evidence.kind
            const rawValue = typeof evidence.value === 'string' ? evidence.value.trim() : ''
            const span = typeof evidence.evidence_span === 'string' ? evidence.evidence_span.trim().slice(0, 80) : ''
            if (kind !== 'subject' && kind !== 'excluded_subject' && kind !== 'grade_band') return []
            const allowed = kind === 'grade_band' ? GRADE_BANDS : SUBJECTS
            if (!allowed.includes(rawValue as never) || !span) return []
            return [{ kind, value: rawValue, evidence_span: span } as LlmConstraintEvidence]
        }).slice(0, 15)
        : []
    const inputCount = (input: unknown) => Array.isArray(input) ? input.length : 0
    const removedUnsupportedValue = subjects.length !== inputCount(record.subjects)
        || excludedSubjects.length !== inputCount(record.excluded_subjects)
        || gradeBands.length !== inputCount(record.grade_bands)
        || skills.length !== inputCount(record.skills)
    return {
        subjects,
        excluded_subjects: excludedSubjects,
        grade_bands: gradeBands,
        skills,
        core_terms: uniqueStrings(record.core_terms, undefined, 6, 24),
        expanded_terms: uniqueStrings(record.expanded_terms, undefined, 12, 40),
        constraint_evidence: constraintEvidence,
        ambiguities: uniqueStrings(record.ambiguities, undefined, 4, 120),
        clarification_question: typeof record.clarification_question === 'string' ? record.clarification_question.trim().slice(0, 120) : '',
        intent_summary: typeof record.intent_summary === 'string' ? record.intent_summary.trim().slice(0, 160) : '',
        warnings: uniqueStrings([
            ...(Array.isArray(record.warnings) ? record.warnings : []),
            ...(removedUnsupportedValue ? ['模型返回的部分筛选值不在公开枚举中，已忽略。'] : [])
        ], undefined, 4, 120)
    }
}

function normalizeEvidenceText(value: string) {
    return value.toLowerCase().normalize('NFKC').replace(/[—–−]/gu, '-').replace(/\s+/gu, ' ').trim()
}

function enforceConstraintEvidence(query: string, interpretation: LlmQueryInterpretation): LlmQueryInterpretation {
    const normalizedQuery = normalizeEvidenceText(query)
    const evidence = interpretation.constraint_evidence.filter(item => (
        normalizedQuery.includes(normalizeEvidenceText(item.evidence_span))
    ))
    const supported = (kind: LlmConstraintEvidence['kind'], value: string) => (
        evidence.some(item => item.kind === kind && item.value === value)
    )
    const subjects = interpretation.subjects.filter(value => supported('subject', value))
    const excludedSubjects = interpretation.excluded_subjects.filter(value => supported('excluded_subject', value))
    const gradeBands = interpretation.grade_bands.filter(value => supported('grade_band', value))
    const removed = subjects.length !== interpretation.subjects.length
        || excludedSubjects.length !== interpretation.excluded_subjects.length
        || gradeBands.length !== interpretation.grade_bands.length
        || evidence.length !== interpretation.constraint_evidence.length
    return {
        ...interpretation,
        subjects,
        excluded_subjects: excludedSubjects,
        grade_bands: gradeBands,
        constraint_evidence: evidence.filter(item => (
            (item.kind === 'subject' && subjects.includes(item.value))
            || (item.kind === 'excluded_subject' && excludedSubjects.includes(item.value))
            || (item.kind === 'grade_band' && gradeBands.includes(item.value))
        )),
        warnings: uniqueStrings([
            ...interpretation.warnings,
            ...(removed ? ['模型返回的部分约束缺少可定位的用户原文证据，已忽略。'] : [])
        ], undefined, 4, 120)
    }
}

function extractUsage(payload: unknown): LlmUsage | null {
    if (!payload || typeof payload !== 'object') return null
    const usage = (payload as Record<string, unknown>).usage
    if (!usage || typeof usage !== 'object') return null
    const record = usage as Record<string, unknown>
    const input = Number(record.input_tokens ?? record.prompt_tokens ?? 0)
    const output = Number(record.output_tokens ?? record.completion_tokens ?? 0)
    const total = Number(record.total_tokens ?? input + output)
    if (![input, output, total].every(value => Number.isFinite(value) && value >= 0)) return null
    return {
        input_tokens: Math.floor(input),
        output_tokens: Math.floor(output),
        total_tokens: Math.floor(total)
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

function requestBody<T>(protocol: LlmProtocol, model: string, input: string, adapter: StructuredLlmAdapter<T>) {
    const format = {
        type: 'json_schema',
        name: adapter.name,
        strict: true,
        schema: adapter.schema
    }
    if (protocol === 'chat_completions') {
        return {
            model,
            reasoning_effort: 'minimal',
            verbosity: 'low',
            max_completion_tokens: adapter.maxCompletionTokens,
            messages: [
                { role: 'system', content: adapter.chatInstructions },
                { role: 'user', content: input }
            ],
            response_format: { type: 'json_object' }
        }
    }
    return {
        model,
        instructions: adapter.instructions,
        input,
        text: { format }
    }
}

export async function runStructuredLlm<T>(
    input: string,
    adapter: StructuredLlmAdapter<T>,
    options: StructuredLlmOptions = {}
): Promise<StructuredLlmResult<T>> {
    const started = performance.now()
    const config = resolveLlmConfig(options.env)
    const base = {
        used: false,
        model: config.enabled ? config.model : null,
        protocol: null,
        output: null,
        usage: null,
        latency_ms: 0
    } as const
    if (!config.enabled) return { ...base, status: 'disabled' }
    if (!config.valid) return { ...base, status: 'invalid_config', model: config.model }

    const fetchImpl = options.fetchImpl || fetch
    const controller = new AbortController()
    const timeoutMs = typeof options.timeoutMs === 'number' && Number.isInteger(options.timeoutMs)
        ? Math.max(500, Math.min(20000, options.timeoutMs))
        : config.timeoutMs
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const protocols: LlmProtocol[] = config.style === 'auto'
        ? ['responses', 'chat_completions']
        : [config.style]

    let activeProtocol: LlmProtocol | null = null
    try {
        for (let index = 0; index < protocols.length; index += 1) {
            const protocol = protocols[index]
            activeProtocol = protocol
            const endpoint = protocol === 'responses' ? '/responses' : '/chat/completions'
            const response = await fetchImpl(`${config.baseUrl}${endpoint}`, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${config.apiKey}`,
                    'content-type': 'application/json'
                },
                body: JSON.stringify(requestBody(protocol, config.model, input, adapter)),
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
            const output = adapter.validate(parseJsonText(extractResponseText(payload, protocol)))
            if (!output) {
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
                output,
                usage: extractUsage(payload)
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
            protocol: activeProtocol,
            latency_ms: Math.round((performance.now() - started) * 100) / 100
        }
    } finally {
        clearTimeout(timeout)
    }
}

const QUERY_INTERPRETATION_ADAPTER: StructuredLlmAdapter<LlmQueryInterpretation> = {
    name: 'kebiao_query_interpretation',
    schema: OUTPUT_SCHEMA,
    instructions: INSTRUCTIONS,
    chatInstructions: CHAT_JSON_INSTRUCTIONS,
    maxCompletionTokens: 400,
    validate: validateInterpretation
}

function readQueryTimeoutMs(env: NodeJS.ProcessEnv): number {
    const parsed = Number(env.KEBIAO_LLM_QUERY_TIMEOUT_MS)
    return Number.isInteger(parsed) ? Math.max(2000, Math.min(12000, parsed)) : 8000
}

export async function interpretSearchQueryWithLlm(
    query: string,
    options: StructuredLlmOptions = {}
): Promise<LlmInterpretationResult> {
    const env = options.env || process.env
    const result = await runStructuredLlm(query, QUERY_INTERPRETATION_ADAPTER, {
        ...options,
        timeoutMs: readQueryTimeoutMs(env)
    })
    return {
        used: result.used,
        status: result.status,
        model: result.model,
        protocol: result.protocol,
        latency_ms: result.latency_ms,
        interpretation: result.output ? enforceConstraintEvidence(query, result.output) : null,
        usage: result.usage
    }
}
