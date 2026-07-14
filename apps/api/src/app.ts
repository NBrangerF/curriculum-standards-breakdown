import { readFile } from 'fs/promises'
import { Hono, type Context } from 'hono'
import {
    CoverageAnalyzeRequestSchema,
    FileCurriculumRepository,
    PlanParseRequestSchema,
    PlanToStandardsRequestSchema,
    PlanValidateRequestSchema,
    StandardBatchRequestSchema,
    StandardCompareRequestSchema,
    StandardSearchRequestSchema,
    SmartSearchRequestSchema,
    WeeklyScheduleRequestSchema,
    projectStandard
} from '../../../packages/curriculum-core/src/index.js'
import {
    apiAccessMiddleware,
    apiError,
    ensureFieldsetAccess,
    ensureTierAccess,
    metricsSnapshot,
    observabilityMiddleware,
    ok,
    parseInclude,
    rateLimitMiddleware,
    requestIdMiddleware,
    securityHeadersMiddleware,
    type ApiBindings
} from './http.js'
import { resolveOpenApiPath, resolveSwaggerUiAssetPath } from './config.js'
import { renderApiDocsPage } from './docs-page.js'
import { interpretSearchQueryWithLlm } from './llm.js'

const DEVELOPMENT_API_ROUTES = [
    '/api/v1/standards/:code/evidence',
    '/api/v1/matching/plan-to-standards',
    '/api/v1/coverage/analyze',
    '/api/v1/schedules/weekly'
]

const DEVELOPMENT_OPENAPI_PATHS = new Set([
    '/api/v1/standards/{code}/evidence',
    '/api/v1/matching/plan-to-standards',
    '/api/v1/coverage/analyze',
    '/api/v1/schedules/weekly'
])

function publicOpenApiDocument(source: string) {
    let omit = false
    return source
        .split('\n')
        .filter(line => {
            const path = line.match(/^  (\/api\/v1\/[^:]+):\s*$/)?.[1]
            if (path) omit = DEVELOPMENT_OPENAPI_PATHS.has(path)
            else if (line === 'components:') omit = false
            return !omit
        })
        .join('\n')
}

export function createApp(repository: FileCurriculumRepository) {
    const app = new Hono<ApiBindings>()

    app.use('*', requestIdMiddleware)
    app.use('*', securityHeadersMiddleware)
    app.use('*', apiAccessMiddleware)
    app.use('*', rateLimitMiddleware)
    app.use('*', observabilityMiddleware)

    for (const path of DEVELOPMENT_API_ROUTES) {
        app.all(path, c => apiError(c, 404, 'not_found', '未找到接口。'))
    }

    async function parseJson(c: Context<ApiBindings>) {
        return c.req.json().catch(() => null)
    }

    async function resolveStandardOrError(c: Context<ApiBindings>, code: string) {
        const resolved = await repository.resolveStandard(code)
        if (resolved.status === 'ambiguous') {
            return {
                resolved: null,
                response: apiError(
                    c,
                    409,
                    'ambiguous_standard_code',
                    `标准编码存在多个候选：${code}`,
                    (resolved.candidates || []).map(candidate => ({ code: candidate.code, grade_band: candidate.grade_band }))
                )
            }
        }
        if (resolved.status === 'missing' || !resolved.record) {
            return {
                resolved: null,
                response: apiError(c, 404, 'not_found', `未找到课程标准：${code}`)
            }
        }
        return { resolved, response: null }
    }

    app.get('/api/v1/health', async c => {
        const version = await repository.loadDataVersion()
        return ok(c, version, {
            status: 'ok',
            data_version: version.data_version,
            schema_version: version.schema_version
        })
    })

    app.get('/api/v1/openapi.yaml', async c => {
        const yaml = publicOpenApiDocument(await readFile(resolveOpenApiPath(), 'utf8'))
        c.header('content-type', 'application/yaml; charset=utf-8')
        return c.body(yaml)
    })

    app.get('/api/v1/docs', c => {
        c.header('content-type', 'text/html; charset=utf-8')
        return c.body(renderApiDocsPage())
    })

    app.get('/api/v1/docs/assets/:asset', async c => {
        const asset = c.req.param('asset')
        if (asset !== 'swagger-ui.css' && asset !== 'swagger-ui-bundle.js') {
            return apiError(c, 404, 'not_found', '未找到文档资源。')
        }
        const content = await readFile(resolveSwaggerUiAssetPath(asset), 'utf8')
        c.header('content-type', asset.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : 'text/javascript; charset=utf-8')
        c.header('cache-control', 'public, max-age=31536000, immutable')
        return c.body(content)
    })

    app.get('/api/v1/metrics', async c => {
        const blocked = ensureTierAccess(c, 'admin')
        if (blocked) return blocked
        const version = await repository.loadDataVersion()
        return ok(c, version, await metricsSnapshot())
    })

    app.get('/api/v1/data-version', async c => {
        const version = await repository.loadDataVersion()
        return ok(c, version, version)
    })

    app.get('/api/v1/meta', async c => {
        const [version, manifest] = await Promise.all([
            repository.loadDataVersion(),
            repository.loadManifest()
        ])
        return ok(c, version, {
            data_version: version,
            data_scope: manifest.data_scope,
            generated_at: manifest.generated_at,
            standard_count: manifest.subjects.reduce((sum, subject) => sum + subject.record_count, 0),
            subjects_covered: manifest.subjects.length,
            columns_count: manifest.columns?.length || 0,
            target_policy: manifest.target_policy,
            filters: {
                subjects: manifest.subjects.map(subject => subject.subject_slug),
                grade_bands: Object.keys(manifest.target_policy || {}),
                skills: ['TS1', 'TS2', 'TS3', 'TS4', 'TS5', 'TS6', 'TS7']
            }
        })
    })

    app.get('/api/v1/subjects', async c => {
        const [version, manifest, metadata, stats] = await Promise.all([
            repository.loadDataVersion(),
            repository.loadManifest(),
            repository.loadSubjectsMeta(),
            repository.loadSubjectStats()
        ])
        const metaBySlug = new Map(metadata.map(item => [String(item.subject_slug), item]))
        const subjects = manifest.subjects.map(subject => ({
            ...subject,
            metadata: metaBySlug.get(subject.subject_slug) || null,
            stats: stats[subject.subject_slug] || null
        }))
        return ok(c, version, subjects, { total: subjects.length })
    })

    app.get('/api/v1/subjects/:subject_slug/domains', async c => {
        const version = await repository.loadDataVersion()
        const slug = c.req.param('subject_slug')
        const domains = await repository.getSubjectDomains(slug)
        if (!domains) return apiError(c, 404, 'not_found', `未找到学科：${slug}`)
        return ok(c, version, domains)
    })

    app.get('/api/v1/subjects/:subject_slug', async c => {
        const version = await repository.loadDataVersion()
        const slug = c.req.param('subject_slug')
        const [manifest, metadata, stats] = await Promise.all([
            repository.loadManifest(),
            repository.loadSubjectsMeta(),
            repository.loadSubjectStats()
        ])
        const subject = manifest.subjects.find(item => item.subject_slug === slug)
        if (!subject) return apiError(c, 404, 'not_found', `未找到学科：${slug}`)
        const meta = metadata.find(item => item.subject_slug === slug) || null
        return ok(c, version, {
            ...subject,
            metadata: meta,
            stats: stats[slug] || null
        })
    })

    app.get('/api/v1/skills', async c => {
        const version = await repository.loadDataVersion()
        const payload = await repository.loadSkillsMeta()
        return ok(c, version, payload)
    })

    app.get('/api/v1/skills/:skill_code', async c => {
        const version = await repository.loadDataVersion()
        const code = c.req.param('skill_code').toUpperCase()
        const payload = await repository.loadSkillsMeta()
        const competencies = Array.isArray(payload.competencies) ? payload.competencies : []
        const skill = competencies.find(item => String((item as Record<string, unknown>).code).toUpperCase() === code)
        if (!skill) return apiError(c, 404, 'not_found', `未找到可迁移能力：${code}`)
        return ok(c, version, skill)
    })

    app.get('/api/v1/skills/:skill_code/standards', async c => {
        const version = await repository.loadDataVersion()
        const code = c.req.param('skill_code').toUpperCase()
        const include = parseInclude(c.req.query('include') || null)
        const blocked = ensureFieldsetAccess(c, include)
        if (blocked) return blocked
        const limit = Number(c.req.query('limit') || 20)
        const cursor = c.req.query('cursor') || null
        const result = await repository.searchStandards({
            skills: [code],
            include: include as never,
            limit,
            cursor
        })
        return ok(c, version, result.items, {
            total: result.total,
            limit: result.limit,
            next_cursor: result.next_cursor
        })
    })

    app.get('/api/v1/standards/:code/progression', async c => {
        const version = await repository.loadDataVersion()
        const code = c.req.param('code')
        const include = parseInclude(c.req.query('include') || null) as never
        const blocked = ensureFieldsetAccess(c, include)
        if (blocked) return blocked
        const lookup = await resolveStandardOrError(c, code)
        if (lookup.response) return lookup.response
        const result = await repository.getProgressionForCode(lookup.resolved!.record!.code, include || ['public'])
        return ok(c, version, result, lookup.resolved!.resolved_from ? { resolved_from: lookup.resolved!.resolved_from } : {})
    })

    app.get('/api/v1/standards/:code/neighbors', async c => {
        const version = await repository.loadDataVersion()
        const code = c.req.param('code')
        const include = parseInclude(c.req.query('include') || null) as never
        const blocked = ensureFieldsetAccess(c, include)
        if (blocked) return blocked
        const lookup = await resolveStandardOrError(c, code)
        if (lookup.response) return lookup.response
        const result = await repository.getStandardNeighbors(lookup.resolved!.record!.code, include || ['public'])
        return ok(c, version, result, lookup.resolved!.resolved_from ? { resolved_from: lookup.resolved!.resolved_from } : {})
    })

    app.get('/api/v1/standards/:code/evidence', async c => {
        const version = await repository.loadDataVersion()
        const code = c.req.param('code')
        const result = await repository.getEvidenceSummaryForCode(code)
        if (!result) return apiError(c, 404, 'not_found', `未找到课程标准：${code}`)
        return ok(c, version, result)
    })

    app.get('/api/v1/standards/:code', async c => {
        const version = await repository.loadDataVersion()
        const code = c.req.param('code')
        const include = parseInclude(c.req.query('include') || null) as never
        const blocked = ensureFieldsetAccess(c, include)
        if (blocked) return blocked
        const lookup = await resolveStandardOrError(c, code)
        if (lookup.response) return lookup.response
        return ok(
            c,
            version,
            projectStandard(lookup.resolved!.record!, include),
            lookup.resolved!.resolved_from ? { resolved_from: lookup.resolved!.resolved_from } : {}
        )
    })

    app.post('/api/v1/standards/search', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = StandardSearchRequestSchema.safeParse(body || {})
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', '请求参数或请求体校验失败。', parsed.error.issues)
        }
        const blocked = ensureFieldsetAccess(c, parsed.data.include)
        if (blocked) return blocked
        const filterErrors = await repository.validateSearchFilters(parsed.data)
        if (filterErrors.length) {
            return apiError(c, 422, 'validation_error', '筛选条件不在当前公开数据契约中。', filterErrors)
        }
        const result = await repository.searchStandards(parsed.data)
        return ok(c, version, result.items, {
            total: result.total,
            limit: result.limit,
            next_cursor: result.next_cursor
        })
    })

    app.post('/api/v1/standards/semantic-search', async c => {
        const started = performance.now()
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = SmartSearchRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', '请求参数或请求体校验失败。', parsed.error.issues)
        }
        const blocked = ensureFieldsetAccess(c, parsed.data.include)
        if (blocked) return blocked
        const filterErrors = await repository.validateSearchFilters(parsed.data)
        if (filterErrors.length) {
            return apiError(c, 422, 'validation_error', '筛选条件不在当前公开数据契约中。', filterErrors)
        }
        const interpretation = await interpretSearchQueryWithLlm(parsed.data.query)
        const result = await repository.smartSearchStandards({
            ...parsed.data,
            query_expansion_terms: interpretation.interpretation?.expanded_terms || []
        })
        result.query_interpretation = {
            used: interpretation.used,
            status: interpretation.status,
            model: interpretation.model,
            protocol: interpretation.protocol,
            latency_ms: interpretation.latency_ms,
            subjects: interpretation.interpretation?.subjects || [],
            grade_bands: interpretation.interpretation?.grade_bands || [],
            skills: interpretation.interpretation?.skills || [],
            expanded_terms: interpretation.interpretation?.expanded_terms || [],
            intent_summary: interpretation.interpretation?.intent_summary || '',
            warnings: interpretation.interpretation?.warnings || []
        }
        return ok(c, version, result, {
            retrieval_version: result.retrieval_version,
            semantic_provider: result.semantic_provider,
            query_interpreter: interpretation.used ? 'llm' : 'deterministic_fallback',
            query_interpreter_model: interpretation.model,
            query_interpreter_status: interpretation.status,
            latency_ms: Math.round((performance.now() - started) * 100) / 100,
            warnings: result.warnings
        })
    })

    app.post('/api/v1/standards/batch', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = StandardBatchRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', '请求参数或请求体校验失败。', parsed.error.issues)
        }
        const blocked = ensureFieldsetAccess(c, parsed.data.include)
        if (blocked) return blocked
        const result = await repository.batchStandards(parsed.data.codes, parsed.data.include)
        return ok(c, version, result.items, {
            total: result.items.length,
            missing: result.missing,
            resolved: result.resolved,
            ambiguous: result.ambiguous,
            duplicates: result.duplicates
        })
    })

    app.post('/api/v1/standards/compare', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = StandardCompareRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', '请求参数或请求体校验失败。', parsed.error.issues)
        }
        const blocked = ensureFieldsetAccess(c, parsed.data.include)
        if (blocked) return blocked
        const result = await repository.compareStandards(parsed.data.codes, parsed.data.include)
        return ok(c, version, result, {
            total: result.standards.length,
            missing: result.missing
        })
    })

    app.post('/api/v1/plans/parse', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = PlanParseRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', '请求参数或请求体校验失败。', parsed.error.issues)
        }
        const result = repository.parsePlan(parsed.data)
        return ok(c, version, result, { warnings: result.warnings })
    })

    app.post('/api/v1/plans/validate', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = PlanValidateRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', '请求参数或请求体校验失败。', parsed.error.issues)
        }
        const result = await repository.validatePlan(parsed.data.plan)
        return ok(c, version, result, { warnings: result.warnings })
    })

    app.post('/api/v1/matching/plan-to-standards', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = PlanToStandardsRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', '请求参数或请求体校验失败。', parsed.error.issues)
        }
        const blocked = ensureFieldsetAccess(c, parsed.data.include)
        if (blocked) return blocked
        const result = await repository.matchPlan(parsed.data.plan, parsed.data)
        return ok(c, version, result, {
            total_units: result.units.length,
            warnings: result.warnings
        })
    })

    app.post('/api/v1/plans/match-standards', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = PlanToStandardsRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', '请求参数或请求体校验失败。', parsed.error.issues)
        }
        const blocked = ensureFieldsetAccess(c, parsed.data.include)
        if (blocked) return blocked
        const result = await repository.matchPlan(parsed.data.plan, parsed.data)
        return ok(c, version, result, {
            total_units: result.units.length,
            retrieval_version: 'trusted-hybrid-v1',
            review_required: true,
            warnings: result.warnings
        })
    })

    app.post('/api/v1/plans/analyze-coverage', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = CoverageAnalyzeRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', '请求参数或请求体校验失败。', parsed.error.issues)
        }
        const blocked = ensureFieldsetAccess(c, parsed.data.include)
        if (blocked) return blocked
        const matching = parsed.data.matches && typeof parsed.data.matches === 'object'
            ? parsed.data.matches as Awaited<ReturnType<typeof repository.matchPlan>>
            : undefined
        const result = await repository.analyzePlanCoverage(parsed.data.plan, matching, parsed.data)
        return ok(c, version, result, {
            covered_standard_count: result.covered_standard_codes.length,
            review_required: true,
            warnings: result.warnings
        })
    })

    app.post('/api/v1/coverage/analyze', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = CoverageAnalyzeRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', '请求参数或请求体校验失败。', parsed.error.issues)
        }
        const blocked = ensureFieldsetAccess(c, parsed.data.include)
        if (blocked) return blocked
        const matching = parsed.data.matches && typeof parsed.data.matches === 'object'
            ? parsed.data.matches as Awaited<ReturnType<typeof repository.matchPlan>>
            : undefined
        const result = await repository.analyzePlanCoverage(parsed.data.plan, matching, parsed.data)
        return ok(c, version, result, {
            covered_standard_count: result.covered_standard_codes.length,
            warnings: result.warnings
        })
    })

    app.post('/api/v1/schedules/weekly', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = WeeklyScheduleRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', '请求参数或请求体校验失败。', parsed.error.issues)
        }
        const blocked = ensureFieldsetAccess(c, parsed.data.include)
        if (blocked) return blocked
        const matching = parsed.data.matches && typeof parsed.data.matches === 'object'
            ? parsed.data.matches as Awaited<ReturnType<typeof repository.matchPlan>>
            : undefined
        const result = await repository.generateWeeklySchedule(parsed.data.plan, matching, parsed.data)
        return ok(c, version, result, { total: result.length })
    })

    app.notFound(c => apiError(c, 404, 'not_found', '未找到接口。'))

    app.onError((error, c) => {
        console.error(error)
        return apiError(c, 500, 'internal_error', '服务发生内部错误。')
    })

    return app
}
