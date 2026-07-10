import { mkdir, readFile, appendFile } from 'fs/promises'
import { dirname } from 'path'
import type { Context, MiddlewareHandler } from 'hono'
import type { AccessTier, DataVersion, JsonObject } from '@curriculum/core'

export type ApiBindings = {
    Variables: {
        requestId: string
        accessTier: AccessTier
        apiKeyId: string
    }
}

const TIER_LIMITS: Record<AccessTier, number> = {
    anonymous: 30,
    developer: 300,
    partner: 3000,
    admin: 10000
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
}

interface MetricsSummary {
    total_requests: number
    by_status: Map<string, number>
    by_route: Map<string, number>
    latency: {
        count: number
        sum_ms: number
        max_ms: number
    }
}

const memoryMetrics: MetricsSummary & { started_at: string } = {
    started_at: new Date().toISOString(),
    total_requests: 0,
    by_status: new Map<string, number>(),
    by_route: new Map<string, number>(),
    latency: {
        count: 0,
        sum_ms: 0,
        max_ms: 0
    }
}

function parseApiKeys(): Map<string, AccessTier> {
    const entries = new Map<string, AccessTier>()
    const raw = process.env.CURRICULUM_API_KEYS || ''
    for (const item of raw.split(',').map(value => value.trim()).filter(Boolean)) {
        const [key, tier = 'developer'] = item.split(':')
        if (key) entries.set(key, normalizeTier(tier))
    }
    for (const key of (process.env.CURRICULUM_ADMIN_API_KEYS || '').split(',').map(value => value.trim()).filter(Boolean)) {
        entries.set(key, 'admin')
    }
    return entries
}

function normalizeTier(value: string): AccessTier {
    if (value === 'admin' || value === 'partner' || value === 'developer') return value
    return 'developer'
}

function keyFingerprint(key: string): string {
    return key.length <= 8 ? key : `${key.slice(0, 4)}...${key.slice(-4)}`
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
    const tier = key && configuredKeys.has(key) ? configuredKeys.get(key)! : 'anonymous'
    c.set('accessTier', tier)
    c.set('apiKeyId', key ? keyFingerprint(key) : 'anonymous')
    await next()
}

export const rateLimitMiddleware: MiddlewareHandler<ApiBindings> = async (c, next) => {
    const tier = c.get('accessTier') || 'anonymous'
    const limit = TIER_LIMITS[tier]
    const now = Date.now()
    const resetAt = Math.ceil(now / 60000) * 60000
    const clientId = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'local'
    const bucketKey = `${tier}:${c.get('apiKeyId')}:${clientId}`
    const bucket = rateBuckets.get(bucketKey)
    const current = bucket && bucket.resetAt > now ? bucket : { count: 0, resetAt }
    current.count += 1
    rateBuckets.set(bucketKey, current)

    const remaining = Math.max(0, limit - current.count)
    c.header('x-ratelimit-limit', String(limit))
    c.header('x-ratelimit-remaining', String(remaining))
    c.header('x-ratelimit-reset', String(Math.ceil(current.resetAt / 1000)))

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
        tier: c.get('accessTier') || 'anonymous'
    }
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
    status: 400 | 401 | 403 | 404 | 422 | 429 | 500,
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
    summary.latency.count += 1
    summary.latency.sum_ms += event.duration_ms
    summary.latency.max_ms = Math.max(summary.latency.max_ms, event.duration_ms)
}

async function recordMetricsEvent(event: MetricsEvent) {
    applyMetricsEvent(memoryMetrics, event)
    const metricsFile = process.env.CURRICULUM_METRICS_FILE
    if (!metricsFile) return
    const resolved = metricsFile.startsWith('/') ? metricsFile : `${process.cwd()}/${metricsFile}`
    await mkdir(dirname(resolved), { recursive: true })
    await appendFile(resolved, `${JSON.stringify(event)}\n`, 'utf8')
}

function serializeSummary(summary: MetricsSummary) {
    return {
        total_requests: summary.total_requests,
        by_status: Object.fromEntries(summary.by_status.entries()),
        by_route: Object.fromEntries(summary.by_route.entries()),
        latency_ms: {
            average: summary.latency.count ? Math.round((summary.latency.sum_ms / summary.latency.count) * 100) / 100 : 0,
            max: summary.latency.max_ms
        }
    }
}

async function loadPersistentMetrics(): Promise<JsonObject | null> {
    const metricsFile = process.env.CURRICULUM_METRICS_FILE
    if (!metricsFile) return null
    const resolved = metricsFile.startsWith('/') ? metricsFile : `${process.cwd()}/${metricsFile}`
    try {
        const text = await readFile(resolved, 'utf8')
        const summary: MetricsSummary = {
            total_requests: 0,
            by_status: new Map(),
            by_route: new Map(),
            latency: { count: 0, sum_ms: 0, max_ms: 0 }
        }
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

export async function metricsSnapshot(): Promise<JsonObject> {
    return {
        started_at: memoryMetrics.started_at,
        sink: process.env.CURRICULUM_METRICS_FILE ? 'file' : 'memory',
        memory: serializeSummary(memoryMetrics),
        persistent: await loadPersistentMetrics()
    }
}
