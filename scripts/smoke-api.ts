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
const expectedRelevanceVersion = process.env.SMOKE_EXPECTED_RELEVANCE_VERSION || 'topic-evidence-v1'
const readinessAttempts = clampInteger(process.env.SMOKE_READINESS_ATTEMPTS, 1, 1, 30)
const readinessIntervalMs = clampInteger(process.env.SMOKE_READINESS_INTERVAL_MS, 5_000, 250, 30_000)

function normalizeBaseUrl(value: string): string {
    return value.replace(/\/+$/, '')
}

function clampInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
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

async function waitForDeploymentReadiness() {
    let lastObserved = 'unavailable'
    for (let attempt = 1; attempt <= readinessAttempts; attempt += 1) {
        try {
            const response = await fetch(`${baseUrl}/api/v1/health?readiness=${Date.now()}`, {
                cache: 'no-store',
                headers: { 'cache-control': 'no-cache' }
            })
            const { payload } = await readResponse(response)
            if (response.ok && payload) {
                const data = expectObject(getData(payload), 'Expected readiness health object')
                lastObserved = String(data.smart_search_relevance_version || 'missing')
                if (lastObserved === expectedRelevanceVersion) {
                    console.log(`ready deployment contract ${lastObserved} on attempt ${attempt}/${readinessAttempts}`)
                    return
                }
            } else {
                lastObserved = `HTTP ${response.status}`
            }
        } catch (error) {
            lastObserved = error instanceof Error ? error.message : String(error)
        }

        console.log(`wait deployment contract attempt ${attempt}/${readinessAttempts}: ${lastObserved}`)
        if (attempt < readinessAttempts) {
            await new Promise(resolve => setTimeout(resolve, readinessIntervalMs))
        }
    }
    throw new Error(`Expected deployed smart-search contract ${expectedRelevanceVersion}, observed ${lastObserved}`)
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
            assert(data.smart_search_relevance_version === expectedRelevanceVersion, 'Expected current smart-search relevance contract')
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
        name: 'trusted smart search',
        method: 'POST',
        path: '/api/v1/standards/semantic-search',
        body: {
            query: '三四年级科学中观察材料并用证据解释变化',
            subjects: ['science'],
            grade_bands: ['H2'],
            limit: 3
        },
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectObject(getData(payload), 'Expected smart search object')
            assert(data.retrieval_version === 'trusted-hybrid-v1', 'Expected trusted-hybrid-v1')
            assert(data.relevance_version === 'topic-evidence-v1', 'Expected topic-evidence-v1')
            assert(data.semantic_provider === 'none', 'Expected deterministic provider declaration')
            const interpretation = expectObject(data.query_interpretation, 'Expected query interpretation metadata')
            assert(
                interpretation.status === 'ok' || interpretation.status === 'disabled'
                    || interpretation.status === 'timeout' || interpretation.status === 'invalid_config'
                    || interpretation.status === 'invalid_response' || interpretation.status === 'provider_error',
                'Expected an explicit query interpreter status'
            )
            if (interpretation.used === true) {
                assert(interpretation.model === 'gpt-5-mini', 'Expected configured gpt-5-mini query interpreter')
            }
            const results = expectArray(data.results, 'Expected smart search results')
            assert(results.length >= 1, 'Expected at least one smart search candidate')
            for (const result of results) {
                const candidate = expectObject(result, 'Expected smart search candidate object')
                const standard = expectObject(candidate.standard, 'Expected candidate standard object')
                assert(standard.subject_slug === 'science', 'Smart search violated subject hard filter')
                assert(standard.grade_band === 'H2', 'Smart search violated grade hard filter')
                assert(candidate.requires_human_review === true, 'Expected human review requirement')
            }
        }
    },
    {
        name: 'smart search subject exclusion intent',
        method: 'POST',
        path: '/api/v1/standards/semantic-search',
        body: {
            query: '第一学段，除了语文学科之外，跟阅读相关的课标',
            limit: 6,
            min_score: 0
        },
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectObject(getData(payload), 'Expected exclusion smart search object')
            const interpretation = expectObject(data.query_interpretation, 'Expected query interpretation metadata')
            assert(interpretation.status === 'ok', 'Expected production AI query interpretation to be available')
            assert(interpretation.used === true, 'Expected production query to use AI interpretation')
            assert(interpretation.model === 'gpt-5-mini', 'Expected configured gpt-5-mini query interpreter')
            const interpretedCoreTerms = expectArray(interpretation.core_terms, 'Expected interpreted core terms')
            assert(interpretedCoreTerms.includes('阅读'), 'Expected AI to identify reading as a core concept')
            const filters = expectObject(data.applied_filters, 'Expected applied smart search filters')
            const excludedSubjects = expectArray(filters.excluded_subjects, 'Expected excluded subjects')
            const gradeBands = expectArray(filters.grade_bands, 'Expected grade bands')
            assert(excludedSubjects.includes('chinese'), 'Expected query to exclude Chinese')
            assert(gradeBands.includes('H1'), 'Expected query to constrain the first learning stage')
            const results = expectArray(data.results, 'Expected exclusion smart search results')
            assert(results.length === 1, 'Expected exactly one topic-evidenced first-stage result')
            assert(data.relevant_candidates === 1, 'Expected exactly one relevant candidate')
            assert(data.omitted_low_relevance >= 1, 'Expected low-relevance hard-filter matches to be omitted')
            assert(String(data.coverage_note).includes('没有用低相关记录补足'), 'Expected an honest underfilled-result note')
            for (const result of results) {
                const candidate = expectObject(result, 'Expected smart search candidate object')
                const standard = expectObject(candidate.standard, 'Expected candidate standard object')
                assert(candidate.code === 'IT-H1-DL-001', 'Expected the directly reading-related Information Technology standard')
                assert(candidate.match_strength === 'direct', 'Expected a direct topic match')
                const matchedConcepts = expectArray(candidate.matched_concepts, 'Expected matched concepts')
                assert(matchedConcepts.includes('阅读'), 'Expected evidence to match the reading concept')
                assert(standard.subject_slug !== 'chinese', 'Excluded Chinese result leaked into candidates')
                assert(standard.grade_band === 'H1', 'Result violated first-stage query intent')
            }
        }
    },
    {
        name: 'trusted plan parsing',
        method: 'POST',
        path: '/api/v1/plans/parse',
        body: {
            text: '三年级科学计划\n学科：科学\n年级：三年级\n单元一：观察植物生长'
        },
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectObject(getData(payload), 'Expected parsed plan result')
            const plan = expectObject(data.plan, 'Expected parsed plan')
            assert(plan.subject_slug === 'science', 'Expected science plan')
            assert(Array.isArray(data.field_evidence), 'Expected field evidence array')
            const interpretation = expectObject(data.parse_interpretation, 'Expected parse interpretation metadata')
            assert(
                interpretation.status === 'ok' || interpretation.status === 'disabled'
                    || interpretation.status === 'timeout' || interpretation.status === 'invalid_config'
                    || interpretation.status === 'invalid_response' || interpretation.status === 'provider_error'
                    || interpretation.status === 'skipped_length',
                'Expected an explicit plan parser status'
            )
            if (interpretation.used === true) {
                assert(interpretation.model === 'gpt-5-mini', 'Expected configured gpt-5-mini plan parser')
            }
            const meta = getMeta(payload)
            assert(meta.review_required === true, 'Expected plan review requirement')
        }
    },
    {
        name: 'confirmed weekly schedule',
        method: 'POST',
        path: '/api/v1/plans/generate-weekly-schedule',
        body: {
            plan: {
                title: '三年级科学计划',
                subject_slug: 'science',
                grade: '三年级',
                grade_band: 'H2',
                units: [{
                    unit_id: 'U1',
                    title: '观察植物生长',
                    learning_goals: [],
                    keywords: ['观察植物生长', '观察', '植物', '生长']
                }]
            },
            review_decisions: [{ unit_id: 'U1', code: 'SC-D2-SC-002', decision: 'accepted' }],
            teaching_weeks: 2,
            lessons_per_week: 2,
            top_k_per_unit: 3
        },
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectObject(getData(payload), 'Expected weekly schedule result')
            assert(data.generation_method === 'deterministic_confirmed_alignment_v1', 'Expected confirmed deterministic schedule')
            assert(data.requires_human_review === true, 'Expected schedule review requirement')
            const accepted = expectArray(data.accepted_standard_codes, 'Expected accepted standard codes')
            assert(accepted.includes('SC-D2-SC-002'), 'Expected server-verified accepted standard')
            const schedule = expectArray(data.schedule, 'Expected schedule array')
            assert(schedule.length === 2, 'Expected two schedule weeks')
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

await waitForDeploymentReadiness()

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
