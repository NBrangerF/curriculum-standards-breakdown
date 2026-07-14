import { mkdir, readFile, appendFile } from 'fs/promises'
import { dirname } from 'path'
import { createHash } from 'crypto'
import type { Context, MiddlewareHandler } from 'hono'
import type { AccessTier, DataVersion, JsonObject } from '@curriculum/core'

export type ApiBindings = {
    Variables: {
        requestId: string
        accessTier: AccessTier
        apiKeyId: string
        aiMetrics?: AiMetrics
    }
}

export interface AiMetrics {
    feature: 'query_interpretation'
    used: boolean
    status: string
    model: string | null
    protocol: string | null
    latency_ms: number
    redaction_count: number
    input_tokens: number
    output_tokens: number
    total_tokens: number
}

const TIER_LIMITS: Record<AccessTier, number> = {
    anonymous: 30,
    developer: 300,
    partner: 3000,
    admin: 10000
}

const AI_TIER_LIMITS: Record<AccessTier, number> = {
    anonymous: 10,
    developer: 60,
    partner: 600,
    admin: 2000
}

const TIER_ORDER: Record<AccessTier, number> = {
    anonymous: 0,
    developer: 1,
    partner: 2,
    admin: 3
}

const FIELDSET_MIN_TIER: Record<string, AccessTier> = {
    public: 'anonymous',
    source: 'developer',
    evidence: 'developer',
    textbook: 'partner',
    admin: 'admin'
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>()
interface MetricsEvent {
    timestamp: string
    request_id: string
    method: string
    path: string
    status: number
    duration_ms: number
    tier: AccessTier
    api_key_id: string
    ai?: AiMetrics
}

type DurableMetricsEvent = Omit<MetricsEvent, 'request_id'>

interface MetricsSummary {
    total_requests: number
    by_status: Map<string, number>
    by_route: Map<string, number>
    by_tier: Map<string, number>
    by_api_key_id: Map<string, number>
    latency: {
        count: number
        sum_ms: number
        max_ms: number
    }
    ai: {
        total_requests: number
        used_requests: number
        by_status: Map<string, number>
        latency: {
            count: number
            sum_ms: number
            max_ms: number
        }
        input_tokens: number
        output_tokens: number
        total_tokens: number
        redaction_count: number
    }
}

const memoryMetrics: MetricsSummary & { started_at: string } = {
    started_at: new Date().toISOString(),
    total_requests: 0,
    by_status: new Map<string, number>(),
    by_route: new Map<string, number>(),
    by_tier: new Map<string, number>(),
    by_api_key_id: new Map<string, number>(),
    latency: {
        count: 0,
        sum_ms: 0,
        max_ms: 0
    },
    ai: {
        total_requests: 0,
        used_requests: 0,
        by_status: new Map(),
        latency: { count: 0, sum_ms: 0, max_ms: 0 },
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        redaction_count: 0
    }
}

interface ApiKeyAccess {
    key_id: string
    tier: AccessTier
}

interface RedisMetricsConfig {
    base_url: string
    token: string
    key: string
    max_events: number
    ttl_seconds: number
}

function parseApiKeys(): Map<string, ApiKeyAccess> {
    const entries = new Map<string, ApiKeyAccess>()
    const raw = process.env.CURRICULUM_API_KEYS || ''
    for (const item of raw.split(',').map(value => value.trim()).filter(Boolean)) {
        const [first, second, third] = item.split(':')
        if (first && second && third) {
            const keyId = normalizeApiKeyId(first)
            if (keyId) entries.set(second, { key_id: keyId, tier: normalizeTier(third) })
            continue
        }
        if (first) entries.set(first, { key_id: keyFingerprint(first), tier: normalizeTier(second || 'developer') })
    }
    for (const item of (process.env.CURRICULUM_ADMIN_API_KEYS || '').split(',').map(value => value.trim()).filter(Boolean)) {
        const [first, second] = item.split(':')
        if (first && second) {
            const keyId = normalizeApiKeyId(first)
            if (keyId) entries.set(second, { key_id: keyId, tier: 'admin' })
            continue
        }
        if (first) entries.set(first, { key_id: keyFingerprint(first), tier: 'admin' })
    }
    return entries
}

function normalizeTier(value: string): AccessTier {
    if (value === 'admin' || value === 'partner' || value === 'developer') return value
    return 'developer'
}

function keyFingerprint(key: string): string {
    return `legacy_${createHash('sha256').update(key).digest('hex').slice(0, 12)}`
}

function normalizeApiKeyId(value: string): string | null {
    return /^[a-z0-9][a-z0-9_-]{2,63}$/.test(value) ? value : null
}

export const requestIdMiddleware: MiddlewareHandler<ApiBindings> = async (c, next) => {
    const requestId = c.req.header('x-request-id') || crypto.randomUUID()
    c.set('requestId', requestId)
    c.header('x-request-id', requestId)
    await next()
}

export const securityHeadersMiddleware: MiddlewareHandler<ApiBindings> = async (c, next) => {
    const origin = c.req.header('origin')
    const allowedOrigins = (process.env.CURRICULUM_ALLOWED_ORIGINS || '*')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
    const allowAnyOrigin = allowedOrigins.includes('*')
    const allowedOrigin = allowAnyOrigin ? '*' : origin && allowedOrigins.includes(origin) ? origin : null

    if (allowedOrigin) {
        c.header('access-control-allow-origin', allowedOrigin)
        c.header('vary', 'origin')
    }
    c.header('access-control-allow-methods', 'GET,POST,OPTIONS')
    c.header('access-control-allow-headers', 'content-type,x-api-key,x-request-id')
    c.header('access-control-max-age', '86400')
    c.header('x-content-type-options', 'nosniff')
    c.header('x-frame-options', 'SAMEORIGIN')
    c.header('referrer-policy', 'no-referrer')
    c.header('permissions-policy', 'geolocation=(), microphone=(), camera=()')

    if (c.req.method === 'OPTIONS') {
        return c.body(null, 204)
    }

    await next()
}

export const apiAccessMiddleware: MiddlewareHandler<ApiBindings> = async (c, next) => {
    const key = c.req.header('x-api-key') || ''
    const configuredKeys = parseApiKeys()
    const access = key ? configuredKeys.get(key) : undefined
    c.set('accessTier', access?.tier || 'anonymous')
    c.set('apiKeyId', access?.key_id || (key ? keyFingerprint(key) : 'anonymous'))
    await next()
}

export const rateLimitMiddleware: MiddlewareHandler<ApiBindings> = async (c, next) => {
    const tier = c.get('accessTier') || 'anonymous'
    const isAiRoute = c.req.path === '/api/v1/standards/semantic-search'
    const limit = isAiRoute ? AI_TIER_LIMITS[tier] : TIER_LIMITS[tier]
    const now = Date.now()
    const resetAt = Math.ceil(now / 60000) * 60000
    const clientId = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'local'
    const bucketKey = `${isAiRoute ? 'ai' : 'general'}:${tier}:${c.get('apiKeyId')}:${clientId}`
    const bucket = rateBuckets.get(bucketKey)
    const current = bucket && bucket.resetAt > now ? bucket : { count: 0, resetAt }
    current.count += 1
    rateBuckets.set(bucketKey, current)

    const remaining = Math.max(0, limit - current.count)
    c.header('x-ratelimit-limit', String(limit))
    c.header('x-ratelimit-remaining', String(remaining))
    c.header('x-ratelimit-reset', String(Math.ceil(current.resetAt / 1000)))
    c.header('x-ratelimit-policy', isAiRoute ? 'ai-per-minute' : 'general-per-minute')

    if (current.count > limit) {
        c.header('retry-after', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))))
        return apiError(c, 429, 'rate_limit_exceeded', `当前 ${tier} 访问层级已超过速率限制，请稍后重试。`)
    }

    await next()
}

export const observabilityMiddleware: MiddlewareHandler<ApiBindings> = async (c, next) => {
    const started = performance.now()
    await next()
    const durationMs = Math.round((performance.now() - started) * 100) / 100
    const status = String(c.res.status)
    const routeKey = `${c.req.method} ${c.req.path}`
    const event: MetricsEvent = {
        timestamp: new Date().toISOString(),
        request_id: c.get('requestId'),
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        duration_ms: durationMs,
        tier: c.get('accessTier') || 'anonymous',
        api_key_id: c.get('apiKeyId') || 'anonymous'
    }
    const aiMetrics = c.get('aiMetrics')
    if (aiMetrics) event.ai = aiMetrics
    await recordMetricsEvent(event)

    if (process.env.CURRICULUM_ENABLE_REQUEST_LOGS === 'true') {
        console.log(JSON.stringify({
            event: 'api_request',
            ...event
        }))
    }
}

export function apiMeta(c: Context<ApiBindings>, dataVersion: DataVersion, extra: JsonObject = {}) {
    return {
        request_id: c.get('requestId'),
        data_version: dataVersion.data_version,
        schema_version: dataVersion.schema_version,
        warnings: [],
        ...extra
    }
}

export function ok(c: Context<ApiBindings>, dataVersion: DataVersion, data: unknown, extra: JsonObject = {}) {
    return c.json({
        data,
        meta: apiMeta(c, dataVersion, extra)
    })
}

export function apiError(
    c: Context<ApiBindings>,
    status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500,
    code: string,
    message: string,
    details: unknown[] = []
) {
    return c.json(
        {
            error: {
                code,
                message,
                details
            },
            meta: {
                request_id: c.get('requestId')
            }
        },
        status
    )
}

export function parseInclude(value: string | null): string[] | undefined {
    if (!value) return undefined
    return value.split(',').map(item => item.trim()).filter(Boolean)
}

export function hasTierAccess(actual: AccessTier, required: AccessTier): boolean {
    return TIER_ORDER[actual] >= TIER_ORDER[required]
}

export function ensureTierAccess(c: Context<ApiBindings>, required: AccessTier) {
    const tier = c.get('accessTier') || 'anonymous'
    if (hasTierAccess(tier, required)) return null
    return apiError(c, 403, 'forbidden_tier', `此接口需要 ${required} 或更高访问权限。`)
}

export function ensureFieldsetAccess(c: Context<ApiBindings>, include: string[] | undefined) {
    const tier = c.get('accessTier') || 'anonymous'
    const fieldsets = include?.length ? include : ['public']
    const blocked = fieldsets.find(fieldset => !hasTierAccess(tier, FIELDSET_MIN_TIER[fieldset] || 'admin'))
    if (!blocked) return null
    return apiError(
        c,
        403,
        'forbidden_fieldset',
        `字段集 ${blocked} 需要 ${FIELDSET_MIN_TIER[blocked]} 或更高访问权限。`
    )
}

function applyMetricsEvent(summary: MetricsSummary, event: MetricsEvent) {
    const status = String(event.status)
    const routeKey = `${event.method} ${event.path}`
    summary.total_requests += 1
    summary.by_status.set(status, (summary.by_status.get(status) || 0) + 1)
    summary.by_route.set(routeKey, (summary.by_route.get(routeKey) || 0) + 1)
    summary.by_tier.set(event.tier, (summary.by_tier.get(event.tier) || 0) + 1)
    summary.by_api_key_id.set(event.api_key_id, (summary.by_api_key_id.get(event.api_key_id) || 0) + 1)
    summary.latency.count += 1
    summary.latency.sum_ms += event.duration_ms
    summary.latency.max_ms = Math.max(summary.latency.max_ms, event.duration_ms)
    if (event.ai) {
        summary.ai.total_requests += 1
        if (event.ai.used) summary.ai.used_requests += 1
        summary.ai.by_status.set(event.ai.status, (summary.ai.by_status.get(event.ai.status) || 0) + 1)
        summary.ai.latency.count += 1
        summary.ai.latency.sum_ms += event.ai.latency_ms
        summary.ai.latency.max_ms = Math.max(summary.ai.latency.max_ms, event.ai.latency_ms)
        summary.ai.input_tokens += event.ai.input_tokens
        summary.ai.output_tokens += event.ai.output_tokens
        summary.ai.total_tokens += event.ai.total_tokens
        summary.ai.redaction_count += event.ai.redaction_count
    }
}

async function recordMetricsEvent(event: MetricsEvent) {
    applyMetricsEvent(memoryMetrics, event)
    const redisConfig = resolveRedisMetricsConfig()
    try {
        if (redisConfig) {
            await persistRedisMetricsEvent(redisConfig, event)
            return
        }
        await persistFileMetricsEvent(event)
    } catch {
        console.warn(JSON.stringify({
            event: 'api_metrics_persist_failed',
            sink: redisConfig ? 'redis' : 'file'
        }))
    }
}

async function persistFileMetricsEvent(event: MetricsEvent) {
    const metricsFile = process.env.CURRICULUM_METRICS_FILE
    if (!metricsFile) return
    const resolved = metricsFile.startsWith('/') ? metricsFile : `${process.cwd()}/${metricsFile}`
    await mkdir(dirname(resolved), { recursive: true })
    await appendFile(resolved, `${JSON.stringify(event)}\n`, 'utf8')
}

function readBoundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(Math.max(Math.floor(parsed), minimum), maximum)
}

function resolveRedisMetricsConfig(): RedisMetricsConfig | null {
    const rawUrl = process.env.CURRICULUM_METRICS_REDIS_REST_URL || ''
    const token = process.env.CURRICULUM_METRICS_REDIS_REST_TOKEN || ''
    if (!rawUrl || !token) return null
    try {
        const url = new URL(rawUrl)
        if (url.protocol !== 'https:') return null
        const prefix = process.env.CURRICULUM_METRICS_REDIS_KEY_PREFIX || 'curriculum:api:metrics'
        if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(prefix)) return null
        const day = new Date().toISOString().slice(0, 10)
        return {
            base_url: url.toString().replace(/\/$/, ''),
            token,
            key: `${prefix}:events:${day}`,
            max_events: readBoundedInteger(process.env.CURRICULUM_METRICS_REDIS_MAX_EVENTS, 10000, 100, 100000),
            ttl_seconds: readBoundedInteger(process.env.CURRICULUM_METRICS_REDIS_TTL_SECONDS, 2592000, 3600, 31536000)
        }
    } catch {
        return null
    }
}

async function redisPipeline(config: RedisMetricsConfig, commands: string[][]): Promise<Array<{ result?: unknown }>> {
    const response = await fetch(`${config.base_url}/pipeline`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${config.token}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify(commands),
        signal: AbortSignal.timeout(750)
    })
    if (!response.ok) throw new Error(`metrics redis request failed with ${response.status}`)
    const payload = await response.json()
    if (!Array.isArray(payload)) throw new Error('metrics redis response is invalid')
    return payload as Array<{ result?: unknown }>
}

async function persistRedisMetricsEvent(config: RedisMetricsConfig, event: MetricsEvent) {
    const durableEvent: DurableMetricsEvent = {
        timestamp: event.timestamp,
        method: event.method,
        path: event.path,
        status: event.status,
        duration_ms: event.duration_ms,
        tier: event.tier,
        api_key_id: event.api_key_id,
        ...(event.ai ? { ai: event.ai } : {})
    }
    await redisPipeline(config, [
        ['lpush', config.key, JSON.stringify(durableEvent)],
        ['ltrim', config.key, '0', String(config.max_events - 1)],
        ['expire', config.key, String(config.ttl_seconds)]
    ])
}

function serializeSummary(summary: MetricsSummary) {
    return {
        total_requests: summary.total_requests,
        by_status: Object.fromEntries(summary.by_status.entries()),
        by_route: Object.fromEntries(summary.by_route.entries()),
        by_tier: Object.fromEntries(summary.by_tier.entries()),
        by_api_key_id: Object.fromEntries(summary.by_api_key_id.entries()),
        latency_ms: {
            average: summary.latency.count ? Math.round((summary.latency.sum_ms / summary.latency.count) * 100) / 100 : 0,
            max: summary.latency.max_ms
        },
        ai: {
            total_requests: summary.ai.total_requests,
            used_requests: summary.ai.used_requests,
            fallback_requests: summary.ai.total_requests - summary.ai.used_requests,
            by_status: Object.fromEntries(summary.ai.by_status.entries()),
            latency_ms: {
                average: summary.ai.latency.count
                    ? Math.round((summary.ai.latency.sum_ms / summary.ai.latency.count) * 100) / 100
                    : 0,
                max: summary.ai.latency.max_ms
            },
            input_tokens: summary.ai.input_tokens,
            output_tokens: summary.ai.output_tokens,
            total_tokens: summary.ai.total_tokens,
            redaction_count: summary.ai.redaction_count
        }
    }
}

function createMetricsSummary(): MetricsSummary {
    return {
        total_requests: 0,
        by_status: new Map(),
        by_route: new Map(),
        by_tier: new Map(),
        by_api_key_id: new Map(),
        latency: { count: 0, sum_ms: 0, max_ms: 0 },
        ai: {
            total_requests: 0,
            used_requests: 0,
            by_status: new Map(),
            latency: { count: 0, sum_ms: 0, max_ms: 0 },
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            redaction_count: 0
        }
    }
}

async function loadFileMetrics(): Promise<JsonObject | null> {
    const metricsFile = process.env.CURRICULUM_METRICS_FILE
    if (!metricsFile) return null
    const resolved = metricsFile.startsWith('/') ? metricsFile : `${process.cwd()}/${metricsFile}`
    try {
        const text = await readFile(resolved, 'utf8')
        const summary = createMetricsSummary()
        for (const line of text.split('\n')) {
            if (!line.trim()) continue
            const event = JSON.parse(line) as MetricsEvent
            applyMetricsEvent(summary, event)
        }
        return {
            enabled: true,
            file: resolved,
            ...serializeSummary(summary)
        }
    } catch {
        return {
            enabled: true,
            file: resolved,
            total_requests: 0,
            by_status: {},
            by_route: {},
            latency_ms: {
                average: 0,
                max: 0
            }
        }
    }
}

function isDurableMetricsEvent(value: unknown): value is DurableMetricsEvent {
    if (!value || typeof value !== 'object') return false
    const event = value as Record<string, unknown>
    return (
        typeof event.timestamp === 'string'
        && typeof event.method === 'string'
        && typeof event.path === 'string'
        && typeof event.status === 'number'
        && typeof event.duration_ms === 'number'
        && typeof event.api_key_id === 'string'
        && (event.ai === undefined || isAiMetrics(event.ai))
        && (event.tier === 'anonymous' || event.tier === 'developer' || event.tier === 'partner' || event.tier === 'admin')
    )
}

function isAiMetrics(value: unknown): value is AiMetrics {
    if (!value || typeof value !== 'object') return false
    const metrics = value as Record<string, unknown>
    return metrics.feature === 'query_interpretation'
        && typeof metrics.used === 'boolean'
        && typeof metrics.status === 'string'
        && (metrics.model === null || typeof metrics.model === 'string')
        && (metrics.protocol === null || typeof metrics.protocol === 'string')
        && ['latency_ms', 'redaction_count', 'input_tokens', 'output_tokens', 'total_tokens']
            .every(key => typeof metrics[key] === 'number' && Number.isFinite(metrics[key]) && Number(metrics[key]) >= 0)
}

async function loadRedisMetrics(config: RedisMetricsConfig): Promise<JsonObject> {
    try {
        const response = await redisPipeline(config, [
            ['lrange', config.key, '0', '-1'],
            ['ttl', config.key]
        ])
        const serializedEvents = Array.isArray(response[0]?.result) ? response[0].result : []
        const summary = createMetricsSummary()
        for (const value of serializedEvents) {
            if (typeof value !== 'string') continue
            try {
                const event = JSON.parse(value)
                if (!isDurableMetricsEvent(event)) continue
                applyMetricsEvent(summary, { ...event, request_id: 'durable' })
            } catch {
                continue
            }
        }
        return {
            enabled: true,
            backend: 'upstash_redis',
            key: config.key,
            retained_event_count: serializedEvents.length,
            ttl_seconds_remaining: typeof response[1]?.result === 'number' ? response[1].result : null,
            ...serializeSummary(summary)
        }
    } catch {
        return {
            enabled: false,
            backend: 'upstash_redis',
            key: config.key,
            retained_event_count: 0
        }
    }
}

async function loadPersistentMetrics(): Promise<JsonObject | null> {
    const redisConfig = resolveRedisMetricsConfig()
    if (redisConfig) return loadRedisMetrics(redisConfig)
    return loadFileMetrics()
}

export async function metricsSnapshot(): Promise<JsonObject> {
    const redisConfig = resolveRedisMetricsConfig()
    return {
        started_at: memoryMetrics.started_at,
        sink: redisConfig ? 'redis' : process.env.CURRICULUM_METRICS_FILE ? 'file' : 'memory',
        memory: serializeSummary(memoryMetrics),
        persistent: await loadPersistentMetrics()
    }
}
