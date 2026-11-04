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
            assert(typeof data.data_version === 'string' && data.data_version.startsWith('2025r-'), 'Expected the 2025 data version')
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
        name: 'standard detail (a 2022 code answers with the 2025 standard it joined)',
        path: '/api/v1/standards/SC-D2-SC-010',
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectObject(getData(payload), 'Expected standard object')
            assert(data.code === 'SC-S2-PS-02', 'Expected standard code SC-S2-PS-02')
            assert(getMeta(payload).moved_from === 'SC-D2-SC-010', 'Expected meta.moved_from SC-D2-SC-010')
        }
    },
    {
        name: 'legacy 2022 record',
        path: '/api/v1/legacy/standards/SC-D2-SC-010',
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectObject(getData(payload), 'Expected legacy standard object')
            assert(data.code === 'SC-D2-SC-010', 'Expected the 2022 record SC-D2-SC-010')
            assert(getMeta(payload).moved_to === '/standards/SC-S2-PS-02', 'Expected meta.moved_to')
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
            assert(data.every(item => /^SC-S\d-/u.test(String(expectObject(item, 'Expected standard').code))), 'Expected 2025 standard codes')
        }
    },
    {
        name: 'natural-language query plan regression',
        method: 'POST',
        path: '/api/v1/standards/semantic-search',
        body: {
            query: '第二学段 G3-4，和阅读相关的标准，但不是语文学科中的'
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
            const plan = expectObject(data.query_plan, 'Expected nlq-v2 query plan')
            assert(plan.version === 'nlq-v2', 'Expected nlq-v2 query plan')
            const constraints = expectObject(plan.resolved_constraints, 'Expected resolved natural-language constraints')
            const excludedSubjects = expectArray(constraints.excluded_subjects, 'Expected excluded subject constraints')
            const gradeBands = expectArray(constraints.grade_bands, 'Expected grade constraints')
            assert(excludedSubjects.length === 1 && excludedSubjects[0] === 'chinese', 'Expected natural-language Chinese exclusion')
            assert(gradeBands.length === 1 && gradeBands[0] === 'H2', 'Expected G3-4 to resolve only to H2')
            const parsed = expectObject(data.parsed_query, 'Expected deterministic parsed query')
            const coreTerms = expectArray(parsed.core_terms, 'Expected normalized core terms')
            assert(coreTerms.length === 1 && coreTerms[0] === '阅读', 'Expected only reading as the core topic')
            assert(!coreTerms.includes('g3') && !coreTerms.includes('但不是'), 'Query scaffolding leaked into core topics')
            const results = expectArray(data.results, 'Expected smart search results')
            assert(results.length >= 1, 'Expected at least one smart search candidate')
            for (const result of results) {
                const candidate = expectObject(result, 'Expected smart search candidate object')
                const standard = expectObject(candidate.standard, 'Expected candidate standard object')
                assert(standard.subject_slug !== 'chinese', 'Smart search violated natural-language subject exclusion')
                assert(standard.grade_band === 'H2', 'Smart search violated natural-language grade constraint')
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
            // The AI reads each candidate's 要点: the 信息科技 standard whose 要点 is 「识字、朗读和阅读」 is the direct
            // match; how many related ones follow varies from run to run, so only the bounds are checked.
            const results = expectArray(data.results, 'Expected exclusion smart search results')
            assert(results.length >= 1 && results.length <= 6, 'Expected one to six first-stage results')
            assert(Number(data.omitted_low_relevance) >= 1, 'Expected low-relevance hard-filter matches to be omitted')
            const first = expectObject(results[0], 'Expected smart search candidate object')
            assert(first.code === 'IT-S1-IS-01', 'Expected the 信息科技 standard on 识字、朗读和阅读 first')
            assert(first.match_strength === 'direct', 'Expected the first result to be a direct topic match')
            assert(expectArray(first.matched_concepts, 'Expected matched concepts').includes('阅读'), 'Expected evidence to match the reading concept')
            for (const result of results) {
                const candidate = expectObject(result, 'Expected smart search candidate object')
                const standard = expectObject(candidate.standard, 'Expected candidate standard object')
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
            assert(expectObject(data[0], 'Expected standard').code === 'SC-S2-PS-02', 'Expected the 2025 standard SC-S2-PS-02')
            const meta = getMeta(payload)
            assert(Array.isArray(meta.missing), 'Expected batch missing list')
        }
    },
    {
        name: 'standard progression',
        path: '/api/v1/standards/SC-S2-PS-01/progression',
        expect(response, payload) {
            expectEnvelope(response, payload)
            const data = expectObject(getData(payload), 'Expected progression result')
            assert(data.method === 'same_name' && expectArray(data.chain, 'Expected chain').length === 4, 'Expected the same standard across four 学段')
        }
    },
    {
        name: 'legacy 2022 progression',
        path: '/api/v1/legacy/standards/SC-H4G7-AR-001/progression',
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
            assert(expectObject(data.standard, 'Expected standard').code === 'SC-S2-PS-02', 'Expected the 2025 standard SC-S2-PS-02')
            assert(Array.isArray(data.same_stage_domain), 'Expected the same 学段 and 领域 list')
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
        // The AI checks wait on the model provider, which now and then answers slower than its timeout; one slow
        // answer gets a second try, a real regression fails twice.
        const result = await runCheck(check).catch(async error => {
            console.log(`retry ${check.name}: ${error instanceof Error ? error.message : String(error)}`)
            await new Promise(resolve => setTimeout(resolve, 5000))
            return runCheck(check)
        })
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
