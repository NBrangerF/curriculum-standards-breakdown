import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { readFile, rm } from 'node:fs/promises'
import { FileCurriculumRepository } from '@curriculum/core'
import { createApp } from '../src/app.js'
import vercelHandler from '../../../api/v1/[...path].js'

const dataRoot = resolve(process.cwd(), '../../data/internal')
const app = createApp(new FileCurriculumRepository(dataRoot))

async function json(response: Response) {
    return response.json() as Promise<Record<string, any>>
}

test('GET /api/v1/meta returns data summary', async () => {
    const response = await app.request('/api/v1/meta')
    assert.equal(response.status, 200)
    assert.ok(response.headers.get('x-ratelimit-limit'))
    const body = await json(response)
    assert.equal(body.data.standard_count, 2025)
    assert.equal(body.meta.data_version, '2026.07.13')
    assert.ok(body.meta.request_id)
})

test('GET /api/v1/health returns service health', async () => {
    const response = await app.request('/api/v1/health')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    const body = await json(response)
    assert.equal(body.data.status, 'ok')
    assert.equal(body.data.data_version, '2026.07.13')
})

test('OPTIONS preflight returns CORS headers', async () => {
    const response = await app.request('/api/v1/health', {
        method: 'OPTIONS',
        headers: { origin: 'https://example.com' }
    })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    assert.match(response.headers.get('access-control-allow-methods') || '', /POST/)
})

test('GET /api/v1/openapi.yaml and /api/v1/docs expose API documentation', async () => {
    const specResponse = await app.request('/api/v1/openapi.yaml')
    assert.equal(specResponse.status, 200)
    const spec = await specResponse.text()
    assert.match(spec, /课程智能 API/)
    assert.match(spec, /url: https:\/\/www\.kebiao\.org/)
    assert.match(spec, /operationId: searchStandards/)
    assert.match(spec, /summary: 搜索科学学科中与观察有关的标准/)
    assert.match(spec, /materials_tools:/)
    assert.doesNotMatch(spec, /\/api\/v1\/standards\/\{code\}\/evidence:/)
    assert.doesNotMatch(spec, /\/api\/v1\/plans\/parse:/)
    assert.doesNotMatch(spec, /\/api\/v1\/plans\/validate:/)
    assert.doesNotMatch(spec, /\/api\/v1\/matching\/plan-to-standards:/)
    assert.doesNotMatch(spec, /\/api\/v1\/coverage\/analyze:/)
    assert.doesNotMatch(spec, /\/api\/v1\/schedules\/weekly:/)

    const docsResponse = await app.request('/api/v1/docs')
    assert.equal(docsResponse.status, 200)
    const docsHtml = await docsResponse.text()
    assert.match(docsHtml, /<html lang="zh-CN">/)
    assert.match(docsHtml, /课程智能 API 中文开发者文档/)
    assert.match(docsHtml, /三步完成第一次调用/)
    assert.match(docsHtml, /设置 API Key/)
    assert.match(docsHtml, /教学规划能力仍在开发中，暂不提供公开 API/)
    assert.doesNotMatch(docsHtml, /data-operation-id="matchPlanToStandards"/)
    assert.doesNotMatch(docsHtml, /data-operation-id="analyzePlanCoverage"/)
    assert.match(docsHtml, /docExpansion: 'none'/)
    assert.match(docsHtml, /filter: true/)
    assert.match(docsHtml, /persistAuthorization: false/)
    assert.match(docsHtml, /SwaggerUIBundle/)
    assert.match(docsHtml, /\/api\/v1\/docs\/assets\/swagger-ui-bundle\.js\?v=5\.32\.8/)
    assert.doesNotMatch(docsHtml, /unpkg\.com/)

    const cssResponse = await app.request('/api/v1/docs/assets/swagger-ui.css')
    assert.equal(cssResponse.status, 200)
    assert.match(cssResponse.headers.get('content-type') || '', /text\/css/)
    assert.match(await cssResponse.text(), /\.swagger-ui/)

    const scriptResponse = await app.request('/api/v1/docs/assets/swagger-ui-bundle.js')
    assert.equal(scriptResponse.status, 200)
    assert.match(scriptResponse.headers.get('content-type') || '', /text\/javascript/)
    assert.match(await scriptResponse.text(), /SwaggerUIBundle/)
})

test('Vercel rewrite forwards nested API paths to the Hono function', async () => {
    const config = JSON.parse(await readFile(resolve(process.cwd(), '../../vercel.json'), 'utf8'))
    assert.deepEqual(config.rewrites[0], {
        source: '/api/v1/:path*',
        destination: '/api/v1/[...path]'
    })
})

test('Vercel web handler preserves POST JSON request bodies', async () => {
    const response = await vercelHandler.fetch(new Request('http://localhost/api/v1/standards/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subjects: ['science'], keyword: '观察', limit: 1 })
    }))
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.length, 1)
    assert.equal(body.data[0].subject_slug, 'science')
})

test('GET /api/v1/metrics requires admin tier', async () => {
    const forbidden = await app.request('/api/v1/metrics')
    assert.equal(forbidden.status, 403)

    process.env.CURRICULUM_ADMIN_API_KEYS = 'metrics_test_key'
    const response = await app.request('/api/v1/metrics', {
        headers: { 'x-api-key': 'metrics_test_key' }
    })
    delete process.env.CURRICULUM_ADMIN_API_KEYS
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.ok(body.data.memory.total_requests >= 1)
})

test('metrics can persist sanitized request events to file', async () => {
    const metricsFile = '/tmp/curriculum-api-test-metrics.ndjson'
    await rm(metricsFile, { force: true })
    process.env.CURRICULUM_ADMIN_API_KEYS = 'metrics_file_test_key'
    process.env.CURRICULUM_METRICS_FILE = metricsFile
    await app.request('/api/v1/health')
    const response = await app.request('/api/v1/metrics', {
        headers: { 'x-api-key': 'metrics_file_test_key' }
    })
    delete process.env.CURRICULUM_ADMIN_API_KEYS
    delete process.env.CURRICULUM_METRICS_FILE
    await rm(metricsFile, { force: true })

    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.sink, 'file')
    assert.ok(body.data.persistent.total_requests >= 1)
    assert.equal('body' in body.data.persistent, false)
})

test('metrics can persist sanitized events to Upstash Redis REST', async () => {
    const originalFetch = globalThis.fetch
    const originalRedisUrl = process.env.CURRICULUM_METRICS_REDIS_REST_URL
    const originalRedisToken = process.env.CURRICULUM_METRICS_REDIS_REST_TOKEN
    const originalAdminKeys = process.env.CURRICULUM_ADMIN_API_KEYS
    const requests: string[][][] = []

    globalThis.fetch = async (_input, init) => {
        const commands = JSON.parse(String(init?.body || '[]')) as string[][]
        requests.push(commands)
        if (commands[0]?.[0] === 'lrange') {
            return Response.json([
                {
                    result: [JSON.stringify({
                        timestamp: '2026-07-10T00:00:00.000Z',
                        method: 'GET',
                        path: '/api/v1/health',
                        status: 200,
                        duration_ms: 12.5,
                        tier: 'anonymous',
                        api_key_id: 'anonymous'
                    })]
                },
                { result: 3600 }
            ])
        }
        return Response.json([{ result: 1 }, { result: 'OK' }, { result: 1 }])
    }
    process.env.CURRICULUM_METRICS_REDIS_REST_URL = 'https://metrics.example.test'
    process.env.CURRICULUM_METRICS_REDIS_REST_TOKEN = 'test-token'
    process.env.CURRICULUM_ADMIN_API_KEYS = 'ops_admin:metrics_redis_test_key'

    try {
        await app.request('/api/v1/health')
        const response = await app.request('/api/v1/metrics', {
            headers: { 'x-api-key': 'metrics_redis_test_key' }
        })
        assert.equal(response.status, 200)
        const body = await json(response)
        assert.equal(body.data.sink, 'redis')
        assert.equal(body.data.persistent.backend, 'upstash_redis')
        assert.equal(body.data.persistent.total_requests, 1)
        assert.equal(body.data.persistent.by_tier.anonymous, 1)
        assert.equal(body.data.persistent.by_api_key_id.anonymous, 1)

        const write = requests.find(commands => commands[0]?.[0] === 'lpush')
        assert.ok(write)
        const event = JSON.parse(write![0][2]) as Record<string, unknown>
        assert.deepEqual(Object.keys(event).sort(), ['api_key_id', 'duration_ms', 'method', 'path', 'status', 'tier', 'timestamp'])
        assert.equal(event.api_key_id, 'anonymous')
        assert.equal('request_id' in event, false)
        assert.equal('body' in event, false)
    } finally {
        globalThis.fetch = originalFetch
        if (originalRedisUrl === undefined) delete process.env.CURRICULUM_METRICS_REDIS_REST_URL
        else process.env.CURRICULUM_METRICS_REDIS_REST_URL = originalRedisUrl
        if (originalRedisToken === undefined) delete process.env.CURRICULUM_METRICS_REDIS_REST_TOKEN
        else process.env.CURRICULUM_METRICS_REDIS_REST_TOKEN = originalRedisToken
        if (originalAdminKeys === undefined) delete process.env.CURRICULUM_ADMIN_API_KEYS
        else process.env.CURRICULUM_ADMIN_API_KEYS = originalAdminKeys
    }
})

test('API key registry supports named key IDs without breaking legacy keys', async () => {
    const originalApiKeys = process.env.CURRICULUM_API_KEYS
    const originalAdminKeys = process.env.CURRICULUM_ADMIN_API_KEYS
    process.env.CURRICULUM_API_KEYS = 'district_alpha:developer_registry_test_key:developer,legacy_partner_key:partner'
    process.env.CURRICULUM_ADMIN_API_KEYS = 'ops_admin:admin_registry_test_key'

    try {
        const developer = await app.request('/api/v1/standards/SC-D2-SC-010?include=public,evidence', {
            headers: { 'x-api-key': 'developer_registry_test_key' }
        })
        assert.equal(developer.status, 200)

        const legacyPartner = await app.request('/api/v1/standards/SC-D2-SC-010?include=public,textbook', {
            headers: { 'x-api-key': 'legacy_partner_key' }
        })
        assert.equal(legacyPartner.status, 200)

        const admin = await app.request('/api/v1/metrics', {
            headers: { 'x-api-key': 'admin_registry_test_key' }
        })
        assert.equal(admin.status, 200)
    } finally {
        if (originalApiKeys === undefined) delete process.env.CURRICULUM_API_KEYS
        else process.env.CURRICULUM_API_KEYS = originalApiKeys
        if (originalAdminKeys === undefined) delete process.env.CURRICULUM_ADMIN_API_KEYS
        else process.env.CURRICULUM_ADMIN_API_KEYS = originalAdminKeys
    }
})

test('GET /api/v1/standards/:code returns public standard without admin fields', async () => {
    const response = await app.request('/api/v1/standards/AR-D1-AA-MU-007')
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.code, 'AR-D1-AA-MU-007')
    assert.equal('materials_tools' in body.data, true)
    assert.equal('review_status' in body.data, false)
})

test('GET /api/v1/standards/:code resolves a unique legacy alias and rejects an ambiguous alias', async () => {
    const legacy = await app.request('/api/v1/standards/AR-H1-AA-MU-007')
    assert.equal(legacy.status, 200)
    const legacyBody = await json(legacy)
    assert.equal(legacyBody.data.code, 'AR-D1-AA-MU-007')
    assert.equal(legacyBody.meta.resolved_from, 'AR-H1-AA-MU-007')

    const ambiguous = await app.request('/api/v1/standards/AR-H4-DA-001')
    assert.equal(ambiguous.status, 409)
    const ambiguousBody = await json(ambiguous)
    assert.equal(ambiguousBody.error.code, 'ambiguous_standard_code')
    assert.equal(ambiguousBody.error.details.length, 3)
})

test('GET /api/v1/standards/:code returns 404 for missing code', async () => {
    const response = await app.request('/api/v1/standards/NOPE-404')
    assert.equal(response.status, 404)
    const body = await json(response)
    assert.equal(body.error.code, 'not_found')
    assert.equal(body.error.message, '未找到课程标准：NOPE-404')
})

test('GET /api/v1/standards/:code requires an exact, case-sensitive code', async () => {
    const response = await app.request('/api/v1/standards/ar-d1-aa-mu-007')
    assert.equal(response.status, 404)
})

test('POST /api/v1/standards/search filters by subject and keyword', async () => {
    const response = await app.request('/api/v1/standards/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            subjects: ['science'],
            keyword: '观察',
            limit: 3
        })
    })
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.ok(body.meta.total > 0)
    assert.ok(body.data.length <= 3)
    assert.equal(body.data[0].subject_slug, 'science')
})

test('POST /api/v1/standards/search validates filters and searches standard titles', async () => {
    const invalidSubject = await app.request('/api/v1/standards/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subjects: ['not-a-subject'] })
    })
    assert.equal(invalidSubject.status, 422)

    const invalidCursor = await app.request('/api/v1/standards/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cursor: 'not-a-cursor' })
    })
    assert.equal(invalidCursor.status, 422)

    const titleSearch = await app.request('/api/v1/standards/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keyword: '常见材料', limit: 10 })
    })
    assert.equal(titleSearch.status, 200)
    const titleBody = await json(titleSearch)
    assert.ok(titleBody.data.some((item: Record<string, unknown>) => String(item.standard_title).includes('常见材料')))
})

test('POST /api/v1/standards/batch returns found items and missing codes', async () => {
    const response = await app.request('/api/v1/standards/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            codes: ['AR-D1-AA-MU-007', 'AR-H1-AA-MU-007', 'NOPE-404', 'AR-D1-AA-MU-007']
        })
    })
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.length, 2)
    assert.deepEqual(body.meta.missing, ['NOPE-404'])
    assert.deepEqual(body.meta.resolved, { 'AR-H1-AA-MU-007': 'AR-D1-AA-MU-007' })
    assert.deepEqual(body.meta.duplicates, ['AR-D1-AA-MU-007'])
})

test('GET /api/v1/subjects/:subject_slug/domains returns taxonomy', async () => {
    const response = await app.request('/api/v1/subjects/science/domains')
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.subject_slug, 'science')
    assert.ok(body.data.domains.length > 0)
})

test('GET /api/v1/standards/:code/neighbors returns adjacent standards', async () => {
    const response = await app.request('/api/v1/standards/SC-D2-SC-010/neighbors')
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.relationships.previous.code, 'SC-D1-SC-014')
    assert.equal(body.data.relationships.next.code, 'SC-D3-SC-010')
    assert.equal(body.data.relationships.previous_all.total, 1)
    assert.equal(body.data.relationships.next_all.total, 1)
})

test('GET /api/v1/standards/:code/progression remains publicly available', async () => {
    const response = await app.request('/api/v1/standards/SC-H4G7-AR-001/progression')
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.anchor_code, 'SC-H4G7-AR-001')
    assert.equal(body.data.standards.length, 3)
    assert.equal(body.data.status, 'available')
})

test('GET /api/v1/standards/:code/progression describes non-H4 groups as unavailable', async () => {
    const response = await app.request('/api/v1/standards/SC-D2-SC-010/progression')
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.status, 'not_available')
    assert.equal(body.data.semantic, 'grade_progression_group')
})

test('POST /api/v1/standards/compare returns common and different fields', async () => {
    const response = await app.request('/api/v1/standards/compare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            codes: ['SC-D1-SC-014', 'SC-D2-SC-010']
        })
    })
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.standards.length, 2)
    assert.ok('grade_band' in body.data.different_fields)
})

test('fieldsets above public require API tier access', async () => {
    const response = await app.request('/api/v1/standards/AR-D1-AA-MU-007?include=admin')
    assert.equal(response.status, 403)
    const body = await json(response)
    assert.equal(body.error.code, 'forbidden_fieldset')
})

test('development API routes are not publicly available', async () => {
    const requests = [
        ['/api/v1/standards/SC-H4G7-AR-001/evidence', 'GET'],
        ['/api/v1/plans/parse', 'POST'],
        ['/api/v1/plans/validate', 'POST'],
        ['/api/v1/matching/plan-to-standards', 'POST'],
        ['/api/v1/coverage/analyze', 'POST'],
        ['/api/v1/schedules/weekly', 'POST']
    ] as const

    for (const [path, method] of requests) {
        const response = await app.request(path, {
            method,
            headers: { 'content-type': 'application/json' },
            body: method === 'POST' ? '{}' : undefined
        })
        assert.ok(response.status === 404 || response.status === 429, `${method} ${path} should not be public`)
        if (response.status === 404) {
            const body = await json(response)
            assert.equal(body.error.code, 'not_found')
        }
    }
})
