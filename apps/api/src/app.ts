import { readFile } from 'fs/promises'
import { Hono, type Context } from 'hono'
import {
    CoverageAnalyzeRequestSchema,
    FileCurriculumRepository,
    FileTextbookRepository,
    PlanParseRequestSchema,
    PlanToStandardsRequestSchema,
    PlanValidateRequestSchema,
    StandardBatchRequestSchema,
    StandardCompareRequestSchema,
    StandardSearchRequestSchema,
    SmartSearchRequestSchema,
    SMART_SEARCH_RELEVANCE_VERSION,
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
import { redactSensitiveText } from './ai-privacy.js'
import { parsePlanWithLlm } from './plan-llm.js'
import { resolveDataRoot } from './config.js'
import { TextbookAssetService } from './textbook-assets.js'

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

export interface CurriculumAppOptions {
    textbookRepository?: FileTextbookRepository
    textbookAssetService?: TextbookAssetService
}

export function createApp(repository: FileCurriculumRepository, options: CurriculumAppOptions = {}) {
    const app = new Hono<ApiBindings>()
    const textbookRepository = options.textbookRepository || new FileTextbookRepository(resolveDataRoot())
    const textbookAssetService = options.textbookAssetService || new TextbookAssetService()

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
            schema_version: version.schema_version,
            smart_search_relevance_version: SMART_SEARCH_RELEVANCE_VERSION
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

    app.get('/api/v1/textbooks', async c => {
        const version = await repository.loadDataVersion()
        const rawGrade = c.req.query('grade')
        const grade = rawGrade ? Number(rawGrade) : undefined
        if (rawGrade && (!Number.isInteger(grade) || Number(grade) < 1 || Number(grade) > 9)) {
            return apiError(c, 422, 'validation_error', '年级必须是 1–9 的整数。')
        }
        const items = await textbookRepository.search({
            stage: c.req.query('stage') as never,
            subject: c.req.query('subject'),
            grade,
            volume: c.req.query('volume') as never,
            query: c.req.query('q'),
            resource_type: c.req.query('resource_type') || 'student_textbook'
        })
        const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || 50)))
        const offset = Math.max(0, Number(c.req.query('offset') || 0))
        return ok(c, version, items.slice(offset, offset + limit), {
            total: items.length,
            limit,
            offset
        })
    })

    app.get('/api/v1/textbooks/:edition_id', async c => {
        const version = await repository.loadDataVersion()
        const detail = await textbookRepository.get(c.req.param('edition_id'))
        if (!detail) return apiError(c, 404, 'not_found', '未找到教材。')
        return ok(c, version, detail)
    })

    app.get('/api/v1/textbooks/:edition_id/toc', async c => {
        const version = await repository.loadDataVersion()
        const detail = await textbookRepository.get(c.req.param('edition_id'))
        if (!detail) return apiError(c, 404, 'not_found', '未找到教材。')
        return ok(c, version, detail.toc, { total: detail.toc.length, status: detail.toc_status })
    })

    app.get('/api/v1/textbooks/:edition_id/page-map', async c => {
        const version = await repository.loadDataVersion()
        const detail = await textbookRepository.get(c.req.param('edition_id'))
        if (!detail) return apiError(c, 404, 'not_found', '未找到教材。')
        return ok(c, version, detail.page_map, { total: detail.page_map.length, status: detail.page_map_status })
    })

    app.get('/api/v1/textbooks/:edition_id/resources', async c => {
        const version = await repository.loadDataVersion()
        const detail = await textbookRepository.get(c.req.param('edition_id'))
        if (!detail) return apiError(c, 404, 'not_found', '未找到教材。')
        return ok(c, version, detail.related_resources, { total: detail.related_resources.length })
    })

    app.post('/api/v1/textbooks/:edition_id/viewer-session', async c => {
        const version = await repository.loadDataVersion()
        const detail = await textbookRepository.get(c.req.param('edition_id'))
        if (!detail) return apiError(c, 404, 'not_found', '未找到教材。')
        const session = textbookAssetService.createViewerSession(detail.edition_id)
        if (!session) {
            return apiError(c, 503, 'viewer_unavailable', '教材文件当前不在线：请连接 X9 Pro，或配置对象存储地址。')
        }
        return ok(c, version, session)
    })

    app.on(['GET', 'HEAD'], '/api/v1/textbook-assets/:asset_id', c => textbookAssetService.respond(c, c.req.param('asset_id')))

    app.get('/api/v1/units/:unit_id', async c => {
        const version = await repository.loadDataVersion()
        const unit = await textbookRepository.getUnit(c.req.param('unit_id'))
        if (!unit) return apiError(c, 404, 'not_found', '未找到教材单元。')
        return ok(c, version, unit)
    })

    app.get('/api/v1/units/:unit_id/standards', async c => {
        const version = await repository.loadDataVersion()
        const unit = await textbookRepository.getUnit(c.req.param('unit_id'))
        if (!unit) return apiError(c, 404, 'not_found', '未找到教材单元。')
        const alignments = Array.isArray(unit.alignments) ? unit.alignments : []
        return ok(c, version, alignments, { total: alignments.length })
    })

    app.get('/api/v1/units/:unit_id/resources', async c => {
        const version = await repository.loadDataVersion()
        const unit = await textbookRepository.getUnit(c.req.param('unit_id'))
        if (!unit) return apiError(c, 404, 'not_found', '未找到教材单元。')
        const resources = Array.isArray(unit.related_resources) ? unit.related_resources : []
        return ok(c, version, resources, { total: resources.length })
    })

    app.get('/api/v1/standards/:code/textbooks', async c => {
        const version = await repository.loadDataVersion()
        const lookup = await resolveStandardOrError(c, c.req.param('code'))
        if (lookup.response) return lookup.response
        const code = lookup.resolved!.record!.code
        const textbooks = await textbookRepository.getTextbooksForStandard(code)
        return ok(c, version, textbooks, { total: textbooks.length })
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
        const privacy = redactSensitiveText(parsed.data.query)
        const interpretation = await interpretSearchQueryWithLlm(privacy.text)
        c.set('aiMetrics', {
            feature: 'query_interpretation',
            used: interpretation.used,
            status: interpretation.status,
            model: interpretation.model,
            protocol: interpretation.protocol,
            latency_ms: interpretation.latency_ms,
            redaction_count: privacy.redaction_count,
            input_tokens: interpretation.usage?.input_tokens || 0,
            output_tokens: interpretation.usage?.output_tokens || 0,
            total_tokens: interpretation.usage?.total_tokens || 0
        })
        const aiInterpretation = interpretation.interpretation
        const result = await repository.smartSearchStandards({
            ...parsed.data,
            inferred_subjects: aiInterpretation?.subjects,
            inferred_excluded_subjects: aiInterpretation?.excluded_subjects,
            inferred_grade_bands: aiInterpretation?.grade_bands,
            inferred_core_terms: aiInterpretation?.core_terms,
            query_expansion_terms: aiInterpretation?.expanded_terms || []
        })
        const ambiguities = aiInterpretation?.ambiguities || []
        const clarificationQuestion = aiInterpretation?.clarification_question || ''
        if (ambiguities.length && clarificationQuestion) {
            result.query_plan = {
                ...result.query_plan,
                ambiguities,
                needs_clarification: true,
                clarification_question: clarificationQuestion
            }
        }
        result.query_interpretation = {
            used: interpretation.used,
            status: interpretation.status,
            model: interpretation.model,
            protocol: interpretation.protocol,
            latency_ms: interpretation.latency_ms,
            subjects: aiInterpretation?.subjects || [],
            excluded_subjects: aiInterpretation?.excluded_subjects || [],
            grade_bands: aiInterpretation?.grade_bands || [],
            skills: aiInterpretation?.skills || [],
            core_terms: aiInterpretation?.core_terms || [],
            expanded_terms: aiInterpretation?.expanded_terms || [],
            constraint_evidence: aiInterpretation?.constraint_evidence || [],
            ambiguities,
            clarification_question: clarificationQuestion,
            intent_summary: aiInterpretation?.intent_summary || '',
            warnings: aiInterpretation?.warnings || [],
            usage: interpretation.usage,
            privacy: {
                redacted: privacy.redacted,
                redaction_count: privacy.redaction_count,
                categories: privacy.categories
            }
        }
        if (privacy.redacted) {
            result.warnings = [...new Set([...result.warnings, '发送到模型服务前已移除查询中的可识别个人信息；本地检索仍使用原始查询。'])]
        }
        if (interpretation.status !== 'ok' && interpretation.status !== 'disabled') {
            result.warnings = [...new Set([...result.warnings, 'AI 查询理解暂不可用，已自动使用确定性可信检索。'])]
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
        const deterministic = repository.parsePlan(parsed.data)
        if (!parsed.data.text) {
            return ok(c, version, {
                ...deterministic,
                field_evidence: [],
                parse_interpretation: {
                    used: false,
                    applied: false,
                    status: 'not_applicable',
                    model: null,
                    protocol: null,
                    latency_ms: 0,
                    usage: null,
                    privacy: { redacted: false, redaction_count: 0, categories: [] }
                }
            }, { warnings: deterministic.warnings })
        }

        const privacy = redactSensitiveText(parsed.data.text)
        const interpretation = await parsePlanWithLlm(privacy.text, deterministic.plan)
        c.set('aiMetrics', {
            feature: 'plan_parsing',
            used: interpretation.used,
            status: interpretation.status,
            model: interpretation.model,
            protocol: interpretation.protocol,
            latency_ms: interpretation.latency_ms,
            redaction_count: privacy.redaction_count,
            input_tokens: interpretation.usage?.input_tokens || 0,
            output_tokens: interpretation.usage?.output_tokens || 0,
            total_tokens: interpretation.usage?.total_tokens || 0
        })
        const normalized = interpretation.applied
            ? repository.parsePlan({ plan: interpretation.plan })
            : deterministic
        const warnings = [...new Set([
            ...deterministic.warnings,
            ...interpretation.warnings,
            ...(privacy.redacted ? ['发送到模型服务前已移除教学计划中的可识别个人信息。'] : []),
            ...(interpretation.status !== 'ok' && interpretation.status !== 'disabled'
                ? ['AI 计划解析暂不可用或未应用，已保留确定性规则解析结果。'] : [])
        ])]
        const result = {
            ...normalized,
            source: 'text',
            warnings,
            field_evidence: interpretation.field_evidence,
            parse_interpretation: {
                used: interpretation.used,
                applied: interpretation.applied,
                status: interpretation.status,
                model: interpretation.model,
                protocol: interpretation.protocol,
                latency_ms: interpretation.latency_ms,
                usage: interpretation.usage,
                privacy: {
                    redacted: privacy.redacted,
                    redaction_count: privacy.redaction_count,
                    categories: privacy.categories
                }
            }
        }
        return ok(c, version, result, {
            parser: interpretation.applied ? 'ai_assisted_with_verified_evidence' : 'deterministic_fallback',
            review_required: true,
            warnings
        })
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
        let canonicalReferenceScope: string[] = []
        if (parsed.data.reference_scope_codes?.length) {
            const scope = await repository.batchStandards(parsed.data.reference_scope_codes, ['public'])
            if (scope.missing.length || Object.keys(scope.ambiguous).length) {
                return apiError(c, 422, 'invalid_reference_scope', '参考标准范围包含不存在或存在歧义的 code。', [
                    ...scope.missing.map(code => ({ code, reason: 'missing' })),
                    ...Object.entries(scope.ambiguous).map(([code, candidates]) => ({ code, reason: 'ambiguous', candidates }))
                ])
            }
            canonicalReferenceScope = scope.items.map(item => String(item.code))
        }
        // Never trust hydrated matches returned by a browser. Recompute candidates
        // against the current data version, then apply only the teacher's decisions.
        const currentMatching = await repository.matchPlan(parsed.data.plan, parsed.data)
        const result = await repository.analyzePlanCoverage(parsed.data.plan, currentMatching, {
            ...parsed.data,
            reference_scope_codes: canonicalReferenceScope
        })
        const candidatePairs = new Set(currentMatching.units.flatMap(unit => (
            unit.matches.map(match => `${unit.unit_id}::${match.code}`)
        )))
        const ignoredDecisions = (parsed.data.review_decisions || [])
            .filter(decision => !candidatePairs.has(`${decision.unit_id}::${decision.code}`))
        if (parsed.data.matches) {
            result.warnings = [...new Set([...result.warnings, '覆盖分析已基于当前数据版本重新计算候选；客户端回传的匹配对象不作为可信事实。'])]
        }
        if (ignoredDecisions.length) {
            result.warnings = [...new Set([...result.warnings, `${ignoredDecisions.length} 条复核决定不属于当前重新计算的候选，已忽略。`])]
        }
        return ok(c, version, result, {
            covered_standard_count: result.covered_standard_codes.length,
            review_required: true,
            warnings: result.warnings
        })
    })

    app.post('/api/v1/plans/generate-weekly-schedule', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = WeeklyScheduleRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', '请求参数或请求体校验失败。', parsed.error.issues)
        }
        const blocked = ensureFieldsetAccess(c, parsed.data.include)
        if (blocked) return blocked

        const decisionStates = new Map<string, Set<string>>()
        for (const decision of parsed.data.review_decisions) {
            const key = `${decision.unit_id}::${decision.code}`
            const states = decisionStates.get(key) || new Set<string>()
            states.add(decision.decision)
            decisionStates.set(key, states)
        }
        const conflicts = [...decisionStates.entries()].filter(([, states]) => states.size > 1)
        if (conflicts.length) {
            return apiError(c, 422, 'conflicting_review_decisions', '同一单元和标准存在相互冲突的教师决定。', (
                conflicts.map(([pair]) => ({ pair }))
            ))
        }

        const teachingWeeks = parsed.data.teaching_weeks
            || parsed.data.plan.duration_weeks
            || parsed.data.plan.units?.length
            || 1
        const reviewWeeks = new Set(parsed.data.review_weeks || [])
        const examWeeks = new Set(parsed.data.exam_weeks || [])
        const invalidWeeks = [...new Set([...reviewWeeks, ...examWeeks])].filter(week => week > teachingWeeks)
        const overlaps = [...reviewWeeks].filter(week => examWeeks.has(week))
        if (invalidWeeks.length || overlaps.length) {
            return apiError(c, 422, 'invalid_schedule_weeks', '复习周或评价周超出教学周范围，或彼此重叠。', [
                ...invalidWeeks.map(week => ({ week, reason: 'out_of_range' })),
                ...overlaps.map(week => ({ week, reason: 'review_exam_overlap' }))
            ])
        }

        const currentMatching = await repository.matchPlan(parsed.data.plan, parsed.data)
        const candidatePairs = new Set(currentMatching.units.flatMap(unit => (
            unit.matches.map(match => `${unit.unit_id}::${match.code}`)
        )))
        const acceptedPairs = new Set(parsed.data.review_decisions
            .filter(decision => decision.decision === 'accepted')
            .map(decision => `${decision.unit_id}::${decision.code}`)
            .filter(pair => candidatePairs.has(pair)))
        const ignoredDecisions = parsed.data.review_decisions.filter(decision => (
            !candidatePairs.has(`${decision.unit_id}::${decision.code}`)
        ))
        if (!acceptedPairs.size) {
            return apiError(c, 422, 'no_verified_accepted_standards', '至少需要一条属于当前重新计算候选的教师接受决定，才能生成周计划。')
        }

        const confirmedMatching = {
            ...currentMatching,
            units: currentMatching.units.map(unit => ({
                ...unit,
                matches: unit.matches.filter(match => acceptedPairs.has(`${unit.unit_id}::${match.code}`))
            }))
        }
        const schedule = await repository.generateWeeklySchedule(parsed.data.plan, confirmedMatching, {
            ...parsed.data,
            teaching_weeks: teachingWeeks,
            review_confirmed: true
        })
        const acceptedStandardCodes = [...new Set(confirmedMatching.units.flatMap(unit => (
            unit.matches.map(match => match.code)
        )))].sort()
        const warnings = [
            ...(ignoredDecisions.length ? [`${ignoredDecisions.length} 条教师决定不属于当前候选，未进入周计划。`] : []),
            '周计划是基于教师确认标准的确定性草案；课时、顺序与评价安排仍需教师复核。'
        ]
        return ok(c, version, {
            schedule,
            accepted_standard_codes: acceptedStandardCodes,
            ignored_decision_count: ignoredDecisions.length,
            generation_method: 'deterministic_confirmed_alignment_v1',
            requires_human_review: true,
            warnings
        }, {
            total_weeks: schedule.length,
            accepted_standard_count: acceptedStandardCodes.length,
            review_required: true,
            warnings
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
