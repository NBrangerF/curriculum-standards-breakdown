import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { readFile, rm } from 'node:fs/promises'
import { FileCurriculumRepository } from '@curriculum/core'
import { createApp } from '../src/app.js'
import { interpretSearchQueryWithLlm, resolveLlmConfig } from '../src/llm.js'
import { redactSensitiveText } from '../src/ai-privacy.js'
import { parsePlanWithLlm } from '../src/plan-llm.js'
import vercelHandler from '../../../api/v1/[...path].js'

const dataRoot = resolve(process.cwd(), '../../data/internal')
const app = createApp(new FileCurriculumRepository(dataRoot))
const dataVersion = JSON.parse(await readFile(resolve(dataRoot, 'data_version.json'), 'utf8')).data_version

async function json(response: Response) {
    return response.json() as Promise<Record<string, any>>
}

test('LLM query interpreter is disabled without a secret and keeps safe defaults', async () => {
    const config = resolveLlmConfig({})
    assert.equal(config.enabled, false)
    assert.equal(config.model, 'gpt-5-mini')
    assert.equal(config.baseUrl, 'https://www.openai-labs.com/v1')

    const result = await interpretSearchQueryWithLlm('三四年级科学观察', { env: {} })
    assert.equal(result.status, 'disabled')
    assert.equal(result.used, false)
    assert.equal(result.interpretation, null)
})

test('AI privacy filter removes direct identifiers before provider calls', () => {
    const result = redactSensitiveText('学校：示例小学，学生姓名：张三，电话 13800138000，邮箱 teacher@example.com，身份证 11010519491231002X；查找三年级科学观察。')
    assert.equal(result.redacted, true)
    assert.equal(result.redaction_count, 5)
    assert.deepEqual(new Set(result.categories), new Set(['named_identifier', 'phone', 'email', 'national_id']))
    assert.doesNotMatch(result.text, /示例小学|张三|13800138000|teacher@example\.com|11010519491231002X/)
    assert.match(result.text, /三年级科学观察/)
})

test('LLM query interpreter accepts a schema-constrained Responses API payload', async () => {
    let endpoint = ''
    const result = await interpretSearchQueryWithLlm('三四年级科学观察材料', {
        env: {
            KEBIAO_LLM_API_KEY: 'test-secret',
            KEBIAO_LLM_BASE_URL: 'https://llm.example.test/v1',
            KEBIAO_LLM_MODEL: 'gpt-5-mini'
        },
        fetchImpl: async (input, init) => {
            endpoint = String(input)
            assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-secret')
            const request = JSON.parse(String(init?.body))
            assert.equal(request.model, 'gpt-5-mini')
            assert.equal(request.text.format.type, 'json_schema')
            assert.ok(request.text.format.schema.required.includes('excluded_subjects'))
            assert.ok(request.text.format.schema.required.includes('core_terms'))
            return Response.json({
                usage: { input_tokens: 81, output_tokens: 35, total_tokens: 116 },
                output: [{
                    type: 'message',
                    content: [{
                        type: 'output_text',
                        text: JSON.stringify({
                            subjects: ['science'],
                            excluded_subjects: [],
                            grade_bands: ['H2'],
                            skills: ['TS1'],
                            core_terms: ['观察', '证据解释'],
                            expanded_terms: ['观察记录', '材料变化', '证据解释'],
                            intent_summary: '查找第二学段科学观察与证据解释相关标准',
                            warnings: []
                        })
                    }]
                }]
            })
        }
    })
    assert.equal(endpoint, 'https://llm.example.test/v1/responses')
    assert.equal(result.status, 'ok')
    assert.equal(result.used, true)
    assert.equal(result.protocol, 'responses')
    assert.deepEqual(result.usage, { input_tokens: 81, output_tokens: 35, total_tokens: 116 })
    assert.deepEqual(result.interpretation?.core_terms, ['观察', '证据解释'])
    assert.deepEqual(result.interpretation?.expanded_terms, ['观察记录', '材料变化', '证据解释'])
})

test('LLM query interpreter falls back to Chat Completions and rejects malformed output', async () => {
    const endpoints: string[] = []
    const fallback = await interpretSearchQueryWithLlm('语文跨媒介表达', {
        env: {
            KEBIAO_LLM_API_KEY: 'test-secret',
            KEBIAO_LLM_BASE_URL: 'https://llm.example.test/v1'
        },
        fetchImpl: async (input, init) => {
            endpoints.push(String(input))
            if (String(input).endsWith('/responses')) return new Response(null, { status: 404 })
            const request = JSON.parse(String(init?.body))
            assert.equal(request.response_format.type, 'json_object')
            assert.equal(request.reasoning_effort, 'minimal')
            assert.equal(request.max_completion_tokens, 400)
            return Response.json({
                choices: [{ message: { content: JSON.stringify({
                    subjects: ['chinese'],
                    excluded_subjects: [],
                    grade_bands: [],
                    skills: ['TS5'],
                    core_terms: ['跨媒介表达'],
                    expanded_terms: ['跨媒介阅读', '沟通表达'],
                    intent_summary: '查找语文跨媒介表达标准',
                    warnings: []
                }) } }]
            })
        }
    })
    assert.deepEqual(endpoints, [
        'https://llm.example.test/v1/responses',
        'https://llm.example.test/v1/chat/completions'
    ])
    assert.equal(fallback.status, 'ok')
    assert.equal(fallback.protocol, 'chat_completions')

    const malformed = await interpretSearchQueryWithLlm('科学观察', {
        env: { KEBIAO_LLM_API_KEY: 'test-secret' },
        fetchImpl: async () => Response.json({ output_text: 'not json' })
    })
    assert.equal(malformed.status, 'invalid_response')
    assert.equal(malformed.used, false)

    const filteredEnum = await interpretSearchQueryWithLlm('历史课程', {
        env: { KEBIAO_LLM_API_KEY: 'test-secret' },
        fetchImpl: async () => Response.json({ output_text: JSON.stringify({
            subjects: ['history'],
            excluded_subjects: [],
            grade_bands: [],
            skills: [],
            core_terms: ['历史'],
            expanded_terms: ['历史课程'],
            intent_summary: '历史课程',
            warnings: []
        }) })
    })
    assert.equal(filteredEnum.status, 'ok')
    assert.deepEqual(filteredEnum.interpretation?.subjects, [])
    assert.ok(filteredEnum.interpretation?.warnings.some(warning => warning.includes('公开枚举')))

    const invalidShape = await interpretSearchQueryWithLlm('科学观察', {
        env: { KEBIAO_LLM_API_KEY: 'test-secret' },
        fetchImpl: async () => Response.json({ output_text: JSON.stringify({
            subjects: [42],
            excluded_subjects: ['chinese'],
            grade_bands: [],
            skills: [],
            core_terms: ['观察'],
            expanded_terms: ['科学观察'],
            intent_summary: '科学观察',
            warnings: []
        }) })
    })
    assert.equal(invalidShape.status, 'ok')
    assert.deepEqual(invalidShape.interpretation?.subjects, [])
    assert.deepEqual(invalidShape.interpretation?.excluded_subjects, [])
    assert.ok(invalidShape.interpretation?.warnings.some(warning => warning.includes('原文证据')))
})

test('LLM query interpreter accepts only hard constraints backed by source spans', async () => {
    const unsupported = await interpretSearchQueryWithLlm('第二学段 G3-4，和阅读相关，但不是语文', {
        env: { KEBIAO_LLM_API_KEY: 'test-secret' },
        fetchImpl: async () => Response.json({ output_text: JSON.stringify({
            subjects: [],
            excluded_subjects: ['chinese'],
            grade_bands: ['H4G7', 'H4G8', 'H4G9'],
            skills: [],
            core_terms: ['阅读'],
            expanded_terms: ['阅读理解'],
            constraint_evidence: [],
            ambiguities: [],
            clarification_question: '',
            intent_summary: '错误地把 G3-4 理解为七至九年级',
            warnings: []
        }) })
    })
    assert.deepEqual(unsupported.interpretation?.grade_bands, [])
    assert.deepEqual(unsupported.interpretation?.excluded_subjects, [])
    assert.ok(unsupported.interpretation?.warnings.some(warning => warning.includes('原文证据')))

    const supported = await interpretSearchQueryWithLlm('第二学段 G3-4，和阅读相关，但不是语文', {
        env: { KEBIAO_LLM_API_KEY: 'test-secret' },
        fetchImpl: async () => Response.json({ output_text: JSON.stringify({
            subjects: [],
            excluded_subjects: ['chinese'],
            grade_bands: ['H2'],
            skills: [],
            core_terms: ['阅读'],
            expanded_terms: ['阅读理解'],
            constraint_evidence: [
                { kind: 'grade_band', value: 'H2', evidence_span: '第二学段 G3-4' },
                { kind: 'excluded_subject', value: 'chinese', evidence_span: '不是语文' }
            ],
            ambiguities: [],
            clarification_question: '',
            intent_summary: '小学三至四年级，排除语文，查找阅读标准',
            warnings: []
        }) })
    })
    assert.deepEqual(supported.interpretation?.grade_bands, ['H2'])
    assert.deepEqual(supported.interpretation?.excluded_subjects, ['chinese'])
    assert.equal(supported.interpretation?.constraint_evidence.length, 2)
})

test('LLM plan parser applies only fields with locatable evidence', async () => {
    const input = '三年级科学植物观察计划\n学科：科学\n年级：三年级\n共 4 周，每周 2 课时\n单元一：观察植物生长\n学习目标：记录植物结构变化'
    const fallback = {
        title: '三年级科学植物观察计划',
        subject_slug: 'science',
        grade: '三年级',
        grade_band: 'H2',
        units: [{ unit_id: 'U1', title: '规则解析单元', learning_goals: [], keywords: [] }]
    }
    const result = await parsePlanWithLlm(input, fallback, {
        env: {
            KEBIAO_LLM_API_KEY: 'test-secret',
            KEBIAO_LLM_BASE_URL: 'https://llm.example.test/v1',
            KEBIAO_LLM_MODEL: 'gpt-5-mini'
        },
        fetchImpl: async (_input, init) => {
            const request = JSON.parse(String(init?.body))
            assert.equal(request.text.format.name, 'kebiao_plan_parsing')
            return Response.json({
                usage: { input_tokens: 120, output_tokens: 180, total_tokens: 300 },
                output_text: JSON.stringify({
                    title: '三年级科学植物观察计划',
                    subject_slug: 'science',
                    grade: '三年级',
                    grade_band: 'H2',
                    duration_weeks: 4,
                    lessons_per_week: 2,
                    units: [{
                        title: '观察植物生长', week_start: 0, week_end: 0, lesson_count: 3,
                        learning_goals: ['记录植物结构变化'], keywords: ['植物观察']
                    }],
                    field_evidence: [
                        { path: 'title', confidence: 0.99, source_excerpt: '三年级科学植物观察计划', inferred: false },
                        { path: 'subject_slug', confidence: 0.9, source_excerpt: '学科：科学', inferred: true },
                        { path: 'grade', confidence: 0.96, source_excerpt: '年级：三年级', inferred: false },
                        { path: 'grade_band', confidence: 0.9, source_excerpt: '年级：三年级', inferred: true },
                        { path: 'duration_weeks', confidence: 0.95, source_excerpt: '共 4 周', inferred: false },
                        { path: 'lessons_per_week', confidence: 0.95, source_excerpt: '每周 2 课时', inferred: false },
                        { path: 'units.0.title', confidence: 0.96, source_excerpt: '单元一：观察植物生长', inferred: false },
                        { path: 'units.0.learning_goals.0', confidence: 0.96, source_excerpt: '学习目标：记录植物结构变化', inferred: false },
                        { path: 'units.0.lesson_count', confidence: 0.99, source_excerpt: '', inferred: true },
                        { path: 'units.0.keywords.0', confidence: 0.7, source_excerpt: '不存在的片段', inferred: false }
                    ],
                    warnings: []
                })
            })
        }
    })
    assert.equal(result.status, 'ok')
    assert.equal(result.applied, true)
    assert.equal(result.plan.duration_weeks, 4)
    assert.equal(result.plan.units?.[0].title, '观察植物生长')
    assert.equal(result.plan.units?.[0].lesson_count, undefined)
    assert.deepEqual(result.plan.units?.[0].keywords, [])
    assert.ok(result.warnings.some(warning => warning.includes('无法在输入文本中定位')))
    assert.equal(result.field_evidence.some(evidence => evidence.source_excerpt === '不存在的片段'), false)
})

test('LLM plan parser salvages individually valid chat fields', async () => {
    const input = '单元一：观察植物生长'
    const fallback = {
        title: '科学计划', subject_slug: 'science', grade: '三年级', grade_band: 'H2',
        units: [{ unit_id: 'U1', title: '规则解析单元', learning_goals: [], keywords: [] }]
    }
    const result = await parsePlanWithLlm(input, fallback, {
        env: { KEBIAO_LLM_API_KEY: 'test-secret', KEBIAO_LLM_API_STYLE: 'chat_completions' },
        fetchImpl: async () => Response.json({
            choices: [{ message: { content: JSON.stringify({
                title: null,
                subject_slug: '科学',
                grade: '三年级',
                grade_band: 'H2',
                duration_weeks: null,
                lessons_per_week: null,
                units: [{ title: '观察植物生长', week_start: null, week_end: null, lesson_count: null, learning_goals: null, keywords: [] }],
                field_evidence: [{ path: 'units[0].title', confidence: 0.94, source_excerpt: '单元一：观察植物生长', inferred: false }],
                warnings: '请复核'
            }) } }]
        })
    })
    assert.equal(result.status, 'ok')
    assert.equal(result.applied, true)
    assert.equal(result.plan.units?.[0].title, '观察植物生长')
    assert.equal(result.plan.subject_slug, 'science')
    assert.equal(result.field_evidence[0]?.path, 'units.0.title')
})

test('GET /api/v1/meta returns data summary', async () => {
    const response = await app.request('/api/v1/meta')
    assert.equal(response.status, 200)
    assert.ok(response.headers.get('x-ratelimit-limit'))
    const body = await json(response)
    assert.equal(body.data.standard_count, 2025)
    assert.equal(body.meta.data_version, dataVersion)
    assert.ok(body.meta.request_id)
})

test('GET /api/v1/health returns service health', async () => {
    const response = await app.request('/api/v1/health')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    const body = await json(response)
    assert.equal(body.data.status, 'ok')
    assert.equal(body.data.data_version, dataVersion)
    assert.equal(body.data.smart_search_relevance_version, 'topic-evidence-v1')
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
    assert.match(spec, /\/api\/v1\/standards\/semantic-search:/)
    assert.match(spec, /\/api\/v1\/plans\/parse:/)
    assert.match(spec, /\/api\/v1\/plans\/validate:/)
    assert.match(spec, /\/api\/v1\/plans\/match-standards:/)
    assert.match(spec, /\/api\/v1\/plans\/analyze-coverage:/)
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
    assert.match(docsHtml, /智能检索可使用 AI 扩展查询/)
    assert.match(docsHtml, /data-operation-id="matchPlanToStandards"/)
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
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'smart-search-test' },
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

test('AI metrics persist status and redaction counts without query contents', async () => {
    const metricsFile = '/tmp/curriculum-api-ai-metrics.ndjson'
    await rm(metricsFile, { force: true })
    process.env.CURRICULUM_METRICS_FILE = metricsFile
    await app.request('/api/v1/standards/semantic-search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'ai-metrics-test' },
        body: JSON.stringify({
            query: '教师姓名：张三 科学观察',
            subjects: ['science'],
            grade_bands: ['H2'],
            limit: 1
        })
    })
    delete process.env.CURRICULUM_METRICS_FILE
    const persisted = await readFile(metricsFile, 'utf8')
    await rm(metricsFile, { force: true })
    const event = JSON.parse(persisted.trim().split('\n').at(-1) || '{}')
    assert.equal(event.ai.feature, 'query_interpretation')
    assert.equal(event.ai.status, 'disabled')
    assert.equal(event.ai.redaction_count, 1)
    assert.doesNotMatch(persisted, /张三|科学观察/)
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
    assert.equal(body.data.code, 'AR-D1-AA-007')
    assert.equal('materials_tools' in body.data, true)
    assert.equal('review_status' in body.data, false)
})

test('GET /api/v1/standards/:code resolves a unique legacy alias and rejects an ambiguous alias', async () => {
    const legacy = await app.request('/api/v1/standards/AR-H1-AA-MU-007')
    assert.equal(legacy.status, 200)
    const legacyBody = await json(legacy)
    assert.equal(legacyBody.data.code, 'AR-D1-AA-007')
    assert.equal(legacyBody.meta.resolved_from, 'AR-H1-AA-MU-007')

    const migratedH4 = await app.request('/api/v1/standards/CN-H4G7-COMM-001')
    assert.equal(migratedH4.status, 200)
    const migratedH4Body = await json(migratedH4)
    assert.equal(migratedH4Body.data.code, 'CN-H4G7-CM-001')
    assert.equal(migratedH4Body.meta.resolved_from, 'CN-H4G7-COMM-001')

    const migratedEnglish = await app.request('/api/v1/standards/ENG-H4G7-CA-CUL-001')
    assert.equal(migratedEnglish.status, 200)
    const migratedEnglishBody = await json(migratedEnglish)
    assert.equal(migratedEnglishBody.data.code, 'EN-H4G7-CA-001')
    assert.equal(migratedEnglishBody.meta.resolved_from, 'ENG-H4G7-CA-CUL-001')

    const migratedMath = await app.request('/api/v1/standards/MA-H4G7-AL-ALG-001')
    assert.equal(migratedMath.status, 200)
    const migratedMathBody = await json(migratedMath)
    assert.equal(migratedMathBody.data.code, 'MA-H4G7-AL-001')

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
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'plan-alignment-test' },
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
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'plan-alignment-test' },
        body: JSON.stringify({ subjects: ['not-a-subject'] })
    })
    assert.equal(invalidSubject.status, 422)

    const invalidCursor = await app.request('/api/v1/standards/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'plan-alignment-test' },
        body: JSON.stringify({ cursor: 'not-a-cursor' })
    })
    assert.equal(invalidCursor.status, 422)

    const titleSearch = await app.request('/api/v1/standards/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'plan-alignment-test' },
        body: JSON.stringify({ keyword: '常见材料', limit: 10 })
    })
    assert.equal(titleSearch.status, 200)
    const titleBody = await json(titleSearch)
    assert.ok(titleBody.data.some((item: Record<string, unknown>) => String(item.standard_title).includes('常见材料')))
})

test('POST /api/v1/standards/semantic-search returns trusted explainable candidates', async () => {
    const response = await app.request('/api/v1/standards/semantic-search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'smart-search-test' },
        body: JSON.stringify({
            query: '三四年级科学中观察材料并用证据解释变化',
            subjects: ['science'],
            grade_bands: ['H2'],
            limit: 5
        })
    })
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.retrieval_version, 'trusted-hybrid-v1')
    assert.equal(body.data.semantic_provider, 'none')
    assert.equal(body.data.query_interpretation.status, 'disabled')
    assert.equal(body.meta.query_interpreter, 'deterministic_fallback')
    assert.ok(body.data.results.length > 0)
    assert.ok(body.data.results.every((item: any) => item.standard.subject_slug === 'science'))
    assert.ok(body.data.results.every((item: any) => item.standard.grade_band === 'H2'))
    assert.ok(body.data.results.every((item: any) => item.requires_human_review === true))
    assert.ok(body.data.results.every((item: any) => ['direct', 'supporting'].includes(item.match_strength)))
    assert.ok(body.data.results.every((item: any) => item.matched_concepts.length > 0))
    assert.equal(body.data.relevance_version, 'topic-evidence-v1')
    assert.equal(response.headers.get('x-ratelimit-policy'), 'ai-per-minute')
})

test('semantic search preserves exclusion intent when AI falls back', async () => {
    const response = await app.request('/api/v1/standards/semantic-search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'smart-search-exclusion-test' },
        body: JSON.stringify({
            query: '第一学段，除了语文学科之外，跟阅读相关的课标',
            limit: 12,
            min_score: 0
        })
    })
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.deepEqual(body.data.parsed_query.subjects, [])
    assert.deepEqual(body.data.parsed_query.excluded_subjects, ['chinese'])
    assert.deepEqual(body.data.applied_filters.excluded_subjects, ['chinese'])
    assert.deepEqual(body.data.applied_filters.grade_bands, ['H1'])
    assert.deepEqual(body.data.parsed_query.core_terms, ['阅读'])
    assert.deepEqual(body.data.results.map((item: any) => item.code), ['IT-H1-DL-001'])
    assert.equal(body.data.results[0].match_strength, 'direct')
    assert.ok(body.data.results[0].matched_concepts.includes('阅读'))
    assert.deepEqual(body.data.relevance_summary, { direct: 1, supporting: 0 })
    assert.equal(body.data.relevant_candidates, 1)
    assert.ok(body.data.omitted_low_relevance > 0)
    assert.match(body.data.coverage_note, /没有用低相关记录补足 12 条/)
})

test('semantic search redacts identifiers and uses a stricter anonymous rate limit', async () => {
    const privacyResponse = await app.request('/api/v1/standards/semantic-search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'smart-search-privacy-test' },
        body: JSON.stringify({
            query: '学生姓名：张三，邮箱 teacher@example.com，查找三四年级科学观察',
            subjects: ['science'],
            grade_bands: ['H2'],
            limit: 1,
            min_score: 0
        })
    })
    assert.equal(privacyResponse.status, 200)
    const privacyBody = await json(privacyResponse)
    assert.equal(privacyBody.data.query_interpretation.privacy.redacted, true)
    assert.equal(privacyBody.data.query_interpretation.privacy.redaction_count, 2)
    assert.ok(privacyBody.data.warnings.some((warning: string) => warning.includes('可识别个人信息')))

    const statuses: number[] = []
    for (let index = 0; index < 11; index += 1) {
        const response = await app.request('/api/v1/standards/semantic-search', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-forwarded-for': 'smart-search-rate-limit-test' },
            body: JSON.stringify({ query: '科学观察', limit: 1, min_score: 0 })
        })
        statuses.push(response.status)
    }
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200))
    assert.equal(statuses[10], 429)
})

test('plan alignment APIs require teacher decisions before coverage', async () => {
    const parsedResponse = await app.request('/api/v1/plans/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'plan-api-test' },
        body: JSON.stringify({ text: '三年级科学计划\n学科：科学\n年级：三年级\n单元一：观察植物生长' })
    })
    assert.equal(parsedResponse.status, 200)
    const parsedBody = await json(parsedResponse)
    const plan = parsedBody.data.plan
    assert.equal(parsedBody.data.parse_interpretation.status, 'disabled')
    assert.equal(parsedResponse.headers.get('x-ratelimit-policy'), 'ai-per-minute')

    const matchResponse = await app.request('/api/v1/plans/match-standards', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'plan-api-test' },
        body: JSON.stringify({ plan, top_k_per_unit: 3 })
    })
    assert.equal(matchResponse.status, 200)
    const matchBody = await json(matchResponse)
    const first = matchBody.data.units[0].matches[0]
    assert.ok(first)

    const unreviewedResponse = await app.request('/api/v1/plans/analyze-coverage', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'plan-api-test' },
        body: JSON.stringify({ plan, matches: matchBody.data })
    })
    assert.equal(unreviewedResponse.status, 200)
    const unreviewed = await json(unreviewedResponse)
    assert.equal(unreviewed.data.covered_standard_codes.length, 0)
    assert.equal(unreviewed.data.gap_standard_codes.length, 0)

    const reviewedResponse = await app.request('/api/v1/plans/analyze-coverage', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'plan-api-test' },
        body: JSON.stringify({
            plan,
            matches: matchBody.data,
            review_decisions: [{ unit_id: matchBody.data.units[0].unit_id, code: first.code, decision: 'accepted' }]
        })
    })
    assert.equal(reviewedResponse.status, 200)
    const reviewed = await json(reviewedResponse)
    assert.deepEqual(reviewed.data.covered_standard_codes, [first.code])

    const scheduleResponse = await app.request('/api/v1/plans/generate-weekly-schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'plan-schedule-test' },
        body: JSON.stringify({
            plan,
            review_decisions: [{ unit_id: matchBody.data.units[0].unit_id, code: first.code, decision: 'accepted' }],
            teaching_weeks: 2,
            lessons_per_week: 2
        })
    })
    assert.equal(scheduleResponse.status, 200)
    const schedule = await json(scheduleResponse)
    assert.equal(schedule.data.generation_method, 'deterministic_confirmed_alignment_v1')
    assert.deepEqual(schedule.data.accepted_standard_codes, [first.code])
    assert.equal(schedule.data.schedule.length, 2)
    assert.ok(schedule.data.schedule.every((week: any) => week.standard_codes.every((code: string) => code === first.code)))

    const unverifiedScheduleResponse = await app.request('/api/v1/plans/generate-weekly-schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'plan-schedule-forged-test' },
        body: JSON.stringify({
            plan,
            review_decisions: [{ unit_id: matchBody.data.units[0].unit_id, code: 'FAKE-D2-XX-999', decision: 'accepted' }]
        })
    })
    assert.equal(unverifiedScheduleResponse.status, 422)
    const unverifiedSchedule = await json(unverifiedScheduleResponse)
    assert.equal(unverifiedSchedule.error.code, 'no_verified_accepted_standards')

    const forgedResponse = await app.request('/api/v1/plans/analyze-coverage', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'plan-forgery-test' },
        body: JSON.stringify({
            plan,
            matches: {
                plan,
                units: [{
                    unit_id: matchBody.data.units[0].unit_id,
                    unit_title: '伪造单元',
                    matches: [{
                        code: 'FAKE-D2-XX-999',
                        score: 1,
                        match_type: 'trusted_hybrid_deterministic_v1',
                        matched_fields: [],
                        rationale: '伪造',
                        requires_human_review: true,
                        standard: { code: 'FAKE-D2-XX-999', domain: '伪造领域' }
                    }]
                }],
                warnings: []
            },
            review_decisions: [{ unit_id: matchBody.data.units[0].unit_id, code: 'FAKE-D2-XX-999', decision: 'accepted' }]
        })
    })
    assert.equal(forgedResponse.status, 200)
    const forged = await json(forgedResponse)
    assert.equal(forged.data.covered_standard_codes.includes('FAKE-D2-XX-999'), false)
    assert.ok(forged.data.warnings.some((warning: string) => warning.includes('客户端回传的匹配对象不作为可信事实')))

    const invalidScopeResponse = await app.request('/api/v1/plans/analyze-coverage', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'plan-scope-test' },
        body: JSON.stringify({ plan, reference_scope_codes: ['FAKE-D2-XX-999'] })
    })
    assert.equal(invalidScopeResponse.status, 422)
    const invalidScope = await json(invalidScopeResponse)
    assert.equal(invalidScope.error.code, 'invalid_reference_scope')
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
    assert.deepEqual(body.meta.resolved, {
        'AR-D1-AA-MU-007': 'AR-D1-AA-007',
        'AR-H1-AA-MU-007': 'AR-D1-AA-007'
    })
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

test('GET /api/v1/standards/:code/progression exposes exact G7-G9 edges and an explicit inferred bridge', async () => {
    const response = await app.request('/api/v1/standards/SC-H4G7-AR-001/progression')
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.anchor_code, 'SC-H4G7-AR-001')
    assert.deepEqual(body.data.grade_bands, ['H3', 'H4G7', 'H4G8', 'H4G9'])
    assert.equal(body.data.status, 'partial')
    assert.ok(body.data.edges.some((edge: any) => edge.from === 'SC-H4G7-AR-001'
        && edge.to === 'SC-H4G8-AR-002' && edge.relation === 'grade_progression'))
    assert.ok(body.data.edges.some((edge: any) => edge.from === 'SC-H4G8-AR-002'
        && edge.to === 'SC-H4G9-AR-003' && edge.relation === 'grade_progression'))
    assert.ok(body.data.edges.some((edge: any) => edge.relation === 'inferred_stage_bridge'))
})

test('GET /api/v1/standards/:code/progression connects D1-D3 with G7-G9', async () => {
    const response = await app.request('/api/v1/standards/SC-D2-SC-010/progression')
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.status, 'partial')
    assert.equal(body.data.semantic, 'curriculum_progression_graph')
    assert.deepEqual(body.data.grade_bands, ['H1', 'H2', 'H3', 'H4G7', 'H4G8', 'H4G9'])
    assert.ok(body.data.edges.some((edge: any) => edge.relation === 'stage_progression'))
    assert.ok(body.data.edges.some((edge: any) => edge.relation === 'inferred_stage_bridge'))
    assert.ok(body.data.edges.some((edge: any) => edge.relation === 'grade_progression'))
})

test('GET /api/v1/standards/:code/progression reports a real H3-H4 domain gap without fabricating an edge', async () => {
    const response = await app.request('/api/v1/standards/ML-D3-MOR-001/progression')
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.deepEqual(body.data.grade_bands, ['H1', 'H2', 'H3'])
    assert.equal(body.data.bridge.status, 'not_available')
    assert.ok(body.data.warnings.some((warning: string) => warning.includes('尚未找到同领域')))
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
