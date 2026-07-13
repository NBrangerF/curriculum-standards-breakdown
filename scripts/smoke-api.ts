type JsonObject = Record<string, unknown>

type SmokeCheck = {
    name: string
    method?: 'GET' | 'POST'
    path: string
    body?: unknown
    apiKey?: string
    expectStatus?: number
    expect: (response: Response, payload: unknown, text: string) => void
}

const baseUrl = normalizeBaseUrl(
    process.env.API_BASE ||
    process.env.CURRICULUM_API_BASE ||
    'http://localhost:8787'
)

const apiKey = process.env.CURRICULUM_SMOKE_API_KEY || process.env.CURRICULUM_API_KEY || ''
const adminKey = process.env.CURRICULUM_SMOKE_ADMIN_API_KEY || process.env.CURRICULUM_ADMIN_API_KEY || ''

function normalizeBaseUrl(value: string): string {
    return value.replace(/\/+$/, '')
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

function asObject(value: unknown): JsonObject {
    assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected JSON object')
    return value as JsonObject
}

function getData(payload: unknown): unknown {
    const root = asObject(payload)
    assert('data' in root, 'Expected response envelope with data')
    return root.data
}

function getMeta(payload: unknown): JsonObject {
    const root = asObject(payload)
    assert(root.meta && typeof root.meta === 'object', 'Expected response envelope with meta')
    return root.meta as JsonObject
}

function expectEnvelope(response: Response, payload: unknown) {
    assert(response.headers.get('x-request-id'), 'Expected x-request-id header')
    getData(payload)
    const meta = getMeta(payload)
    assert(typeof meta.request_id === 'string', 'Expected meta.request_id')
}

function expectArray(value: unknown, message: string): unknown[] {
    assert(Array.isArray(value), message)
    return value
}

function expectObject(value: unknown, message: string): JsonObject {
    assert(value && typeof value === 'object' && !Array.isArray(value), message)
    return value as JsonObject
}

async function readResponse(response: Response) {
    const text = await response.text()
    const contentType = response.headers.get('content-type') || ''
    if (!text || !contentType.includes('json')) return { payload: null, text }
    return { payload: JSON.parse(text) as unknown, text }
}

async function runCheck(check: SmokeCheck) {
    const method = check.method || 'GET'
    const response = await fetch(`${baseUrl}${check.path}`, {
        method,
        headers: {
            ...(check.body ? { 'content-type': 'application/json' } : {}),
            ...(check.apiKey ? { 'x-api-key': check.apiKey } : {})
        },
        body: check.body ? JSON.stringify(check.body) : undefined
    })
    const { payload, text } = await readResponse(response)
    const expected = check.expectStatus || 200
    assert(
        response.status === expected,
        `${check.name} expected HTTP ${expected}, got ${response.status}: ${text.slice(0, 500)}`
    )
    check.expect(response, payload, text)
    return { status: response.status, requestId: response.headers.get('x-request-id') || null }
}

const checks: SmokeCheck[] = [
    {
        name: 'health',
        path: '/api/v1/health',
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectObject(getData(payload), 'Expected health object')
            assert(data.status === 'ok', 'Expected health status ok')
        }
    },
    {
        name: 'data version',
        path: '/api/v1/data-version',
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectObject(getData(payload), 'Expected data version object')
            assert(typeof data.data_version === 'string', 'Expected data_version')
            assert(typeof data.schema_version === 'string', 'Expected schema_version')
        }
    },
    {
        name: 'subjects',
        path: '/api/v1/subjects',
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectArray(getData(payload), 'Expected subjects array')
            assert(data.length >= 1, 'Expected at least one subject')
        }
    },
    {
        name: 'standard detail',
        path: '/api/v1/standards/SC-D2-SC-010',
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectObject(getData(payload), 'Expected standard object')
            assert(data.code === 'SC-D2-SC-010', 'Expected standard code SC-D2-SC-010')
        }
    },
    {
        name: 'standard search',
        method: 'POST',
        path: '/api/v1/standards/search',
        body: {
            subjects: ['science'],
            keyword: '植物',
            limit: 3
        },
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectArray(getData(payload), 'Expected search result array')
            assert(data.length >= 1, 'Expected at least one search result')
        }
    },
    {
        name: 'standard batch',
        method: 'POST',
        path: '/api/v1/standards/batch',
        body: {
            codes: ['SC-D2-SC-010', 'NOPE-404']
        },
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectArray(getData(payload), 'Expected batch result array')
            assert(data.length === 1, 'Expected one found standard')
            const meta = getMeta(payload)
            assert(Array.isArray(meta.missing), 'Expected batch missing list')
        }
    },
    {
        name: 'standard progression',
        path: '/api/v1/standards/SC-H4G7-AR-001/progression',
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectObject(getData(payload), 'Expected progression result')
            assert(data.status === 'available' || data.status === 'partial', 'Expected declared progression status')
        }
    },
    {
        name: 'standard neighbors',
        path: '/api/v1/standards/SC-D2-SC-010/neighbors',
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectObject(getData(payload), 'Expected neighbor result')
            const relationships = expectObject(data.relationships, 'Expected relationships')
            assert(typeof relationships.previous_all === 'object', 'Expected multi-value previous relation')
        }
    },
    {
        name: 'openapi yaml',
        path: '/api/v1/openapi.yaml',
        expect(response, _payload, text) {
            assert((response.headers.get('content-type') || '').includes('yaml'), 'Expected YAML content-type')
            assert(text.includes('openapi: 3.1.0'), 'Expected OpenAPI version')
            assert(text.includes('https://www.kebiao.org'), 'Expected canonical production server')
        }
    },
    {
        name: 'swagger docs',
        path: '/api/v1/docs',
        expect(response, _payload, text) {
            assert((response.headers.get('content-type') || '').includes('text/html'), 'Expected HTML content-type')
            assert(text.includes('SwaggerUIBundle'), 'Expected Swagger UI bundle')
        }
    }
]

if (apiKey) {
    checks.push({
        name: 'developer fieldset access',
        path: '/api/v1/standards/SC-D2-SC-010?include=public,evidence',
        apiKey,
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectObject(getData(payload), 'Expected standard object')
            assert(data.code === 'SC-D2-SC-010', 'Expected developer fieldset standard code')
        }
    })
}

if (adminKey) {
    checks.push({
        name: 'admin metrics',
        path: '/api/v1/metrics',
        apiKey: adminKey,
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectObject(getData(payload), 'Expected metrics object')
            assert(typeof data.memory === 'object', 'Expected memory metrics')
        }
    })
}

console.log(JSON.stringify({
    event: 'api_smoke_start',
    base_url: baseUrl,
    checks: checks.map(check => check.name),
    developer_key_present: Boolean(apiKey),
    admin_key_present: Boolean(adminKey)
}, null, 2))

const results = []

for (const check of checks) {
    const started = performance.now()
    try {
        const result = await runCheck(check)
        const durationMs = Math.round((performance.now() - started) * 100) / 100
        results.push({ name: check.name, ok: true, duration_ms: durationMs, ...result })
        console.log(`ok ${check.name} ${durationMs}ms`)
    } catch (error) {
        const durationMs = Math.round((performance.now() - started) * 100) / 100
        results.push({
            name: check.name,
            ok: false,
            duration_ms: durationMs,
            error: error instanceof Error ? error.message : String(error)
        })
        console.error(`fail ${check.name} ${durationMs}ms`)
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
        break
    }
}

console.log(JSON.stringify({
    event: 'api_smoke_complete',
    base_url: baseUrl,
    ok: process.exitCode !== 1,
    results
}, null, 2))
