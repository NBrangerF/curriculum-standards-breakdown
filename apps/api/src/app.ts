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
import { resolveOpenApiPath } from './config.js'

export function createApp(repository: FileCurriculumRepository) {
    const app = new Hono<ApiBindings>()

    app.use('*', requestIdMiddleware)
    app.use('*', securityHeadersMiddleware)
    app.use('*', apiAccessMiddleware)
    app.use('*', rateLimitMiddleware)
    app.use('*', observabilityMiddleware)

    async function parseJson(c: Context<ApiBindings>) {
        return c.req.json().catch(() => null)
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
        const yaml = await readFile(resolveOpenApiPath(), 'utf8')
        c.header('content-type', 'application/yaml; charset=utf-8')
        return c.body(yaml)
    })

    app.get('/api/v1/docs', c => {
        c.header('content-type', 'text/html; charset=utf-8')
        return c.body(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>课程智能 API 文档</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    :root {
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    body { margin: 0; background: #fff; color: #172033; }
    .api-docs-header {
      border-bottom: 1px solid #e6e8ef;
      padding: 24px 36px 18px;
    }
    .api-docs-header h1 {
      margin: 0 0 8px;
      font-size: 24px;
      line-height: 1.25;
      font-weight: 700;
      letter-spacing: 0;
    }
    .api-docs-header p {
      margin: 0;
      max-width: 920px;
      color: #536079;
      font-size: 14px;
      line-height: 1.7;
    }
    #swagger-ui { min-height: 100vh; }
    .swagger-ui,
    .swagger-ui .info .title,
    .swagger-ui .opblock-tag,
    .swagger-ui button,
    .swagger-ui input,
    .swagger-ui select,
    .swagger-ui textarea {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .swagger-ui .info { margin: 24px 0 18px; }
    .swagger-ui .info .title { font-size: 28px; letter-spacing: 0; }
    .swagger-ui .scheme-container { box-shadow: none; border-top: 1px solid #eef0f5; border-bottom: 1px solid #eef0f5; }
    @media (max-width: 720px) {
      .api-docs-header { padding: 18px 18px 14px; }
      .api-docs-header h1 { font-size: 21px; }
    }
  </style>
</head>
<body>
  <header class="api-docs-header">
    <h1>课程智能 API 文档</h1>
    <p>面向课程标准检索、能力图谱、教学规划解析、标准匹配、覆盖分析和周进度生成的中文 API 文档。Endpoint、字段名和枚举值保持英文，以便开发者直接复制调用。</p>
  </header>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    const zhText = new Map(Object.entries({
      "Servers": "服务地址",
      "Schemas": "数据结构",
      "Authorize": "认证",
      "Close": "关闭",
      "Available authorizations": "可用认证方式",
      "Value": "值",
      "Logout": "退出认证",
      "Try it out": "试运行",
      "Cancel": "取消",
      "Execute": "发送请求",
      "Clear": "清除",
      "Reset": "重置",
      "Responses": "响应",
      "Response body": "响应体",
      "Response headers": "响应头",
      "Request body": "请求体",
      "Parameters": "参数",
      "Name": "名称",
      "Description": "说明",
      "Default value": "默认值",
      "Required": "必填",
      "Schema": "结构",
      "Example Value": "示例值",
      "Model": "模型",
      "Media type": "媒体类型",
      "Code": "状态码",
      "Links": "链接",
      "No links": "无链接",
      "Server response": "服务端响应",
      "Curl": "curl 命令",
      "Request URL": "请求地址",
      "Undocumented": "未文档化",
      "Controls Accept header.": "控制 Accept 请求头。",
      "Parameter content type": "参数内容类型",
      "No parameters": "无参数",
      "Responses content type": "响应内容类型",
      "Download": "下载",
      "string": "字符串",
      "object": "对象",
      "integer": "整数",
      "number": "数字",
      "boolean": "布尔值",
      "array": "数组",
      "Fieldset": "字段集",
      "ApiMeta": "响应元信息",
      "ApiResponse": "成功响应",
      "ApiError": "错误响应",
      "DataVersion": "数据版本",
      "StandardPublic": "课程标准公开字段",
      "StandardSearchRequest": "标准搜索请求",
      "StandardBatchRequest": "批量标准请求",
      "StandardCompareRequest": "标准对比请求",
      "StandardCollectionResponse": "标准列表响应",
      "StandardNeighbors": "标准邻接关系",
      "RelatedStandards": "相关标准集合",
      "StandardEvidenceSummary": "标准证据摘要",
      "PlanUnit": "教学单元",
      "ParsedPlan": "解析后的教学计划",
      "PlanParseRequest": "计划解析请求",
      "PlanToStandardsRequest": "计划匹配标准请求",
      "MatchedField": "命中字段",
      "PlanStandardMatch": "计划标准匹配结果",
      "PlanMatchingResult": "计划匹配结果",
      "CoverageAnalyzeRequest": "覆盖分析请求",
      "WeeklyScheduleRequest": "周进度请求"
    }))

    const zhAttributes = new Map(Object.entries({
      "Collapse operation": "收起接口",
      "Expand operation": "展开接口",
      "Expand all": "全部展开",
      "Collapse all": "全部收起",
      "authorization header": "认证请求头"
    }))

    function replaceExactText(node) {
      const raw = node.nodeValue || ""
      const trimmed = raw.trim()
      const replacement = zhText.get(trimmed) || zhAttributes.get(trimmed)
      if (!replacement) return
      node.nodeValue = raw.replace(trimmed, replacement)
    }

    function localizeAttributes(element) {
      for (const attribute of ["aria-label", "title", "placeholder", "value"]) {
        const value = element.getAttribute(attribute)
        if (!value) continue
        const replacement = zhText.get(value.trim()) || zhAttributes.get(value.trim())
        if (replacement) element.setAttribute(attribute, replacement)
      }
    }

    function localizeSwaggerUi(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let textNode = walker.nextNode()
      while (textNode) {
        replaceExactText(textNode)
        textNode = walker.nextNode()
      }
      root.querySelectorAll("[aria-label], [title], [placeholder], [value]").forEach(localizeAttributes)
    }

    function scheduleLocalization() {
      window.requestAnimationFrame(function () {
        const root = document.getElementById("swagger-ui")
        if (root) localizeSwaggerUi(root)
      })
    }

    window.ui = SwaggerUIBundle({
      url: '/api/v1/openapi.yaml',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout'
    })

    const observer = new MutationObserver(scheduleLocalization)
    observer.observe(document.getElementById("swagger-ui"), { childList: true, subtree: true })
    scheduleLocalization()
  </script>
</body>
</html>`)
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
        if (!domains) return apiError(c, 404, 'not_found', `Subject not found: ${slug}`)
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
        if (!subject) return apiError(c, 404, 'not_found', `Subject not found: ${slug}`)
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
        if (!skill) return apiError(c, 404, 'not_found', `Skill not found: ${code}`)
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
        const result = await repository.getProgressionForCode(code, include || ['public'])
        if (!result) return apiError(c, 404, 'not_found', `Standard not found: ${code}`)
        return ok(c, version, result)
    })

    app.get('/api/v1/standards/:code/neighbors', async c => {
        const version = await repository.loadDataVersion()
        const code = c.req.param('code')
        const include = parseInclude(c.req.query('include') || null) as never
        const blocked = ensureFieldsetAccess(c, include)
        if (blocked) return blocked
        const result = await repository.getStandardNeighbors(code, include || ['public'])
        if (!result) return apiError(c, 404, 'not_found', `Standard not found: ${code}`)
        return ok(c, version, result)
    })

    app.get('/api/v1/standards/:code/evidence', async c => {
        const version = await repository.loadDataVersion()
        const code = c.req.param('code')
        const result = await repository.getEvidenceSummaryForCode(code)
        if (!result) return apiError(c, 404, 'not_found', `Standard not found: ${code}`)
        return ok(c, version, result)
    })

    app.get('/api/v1/standards/:code', async c => {
        const version = await repository.loadDataVersion()
        const code = c.req.param('code')
        const include = parseInclude(c.req.query('include') || null) as never
        const blocked = ensureFieldsetAccess(c, include)
        if (blocked) return blocked
        const standard = await repository.findStandardByCode(code)
        if (!standard) return apiError(c, 404, 'not_found', `Standard not found: ${code}`)
        return ok(c, version, projectStandard(standard, include))
    })

    app.post('/api/v1/standards/search', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = StandardSearchRequestSchema.safeParse(body || {})
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', 'Request validation failed', parsed.error.issues)
        }
        const blocked = ensureFieldsetAccess(c, parsed.data.include)
        if (blocked) return blocked
        const result = await repository.searchStandards(parsed.data)
        return ok(c, version, result.items, {
            total: result.total,
            limit: result.limit,
            next_cursor: result.next_cursor
        })
    })

    app.post('/api/v1/standards/batch', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = StandardBatchRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', 'Request validation failed', parsed.error.issues)
        }
        const blocked = ensureFieldsetAccess(c, parsed.data.include)
        if (blocked) return blocked
        const result = await repository.batchStandards(parsed.data.codes, parsed.data.include)
        return ok(c, version, result.items, {
            total: result.items.length,
            missing: result.missing
        })
    })

    app.post('/api/v1/standards/compare', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = StandardCompareRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', 'Request validation failed', parsed.error.issues)
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
            return apiError(c, 422, 'validation_error', 'Request validation failed', parsed.error.issues)
        }
        const result = repository.parsePlan(parsed.data)
        return ok(c, version, result, { warnings: result.warnings })
    })

    app.post('/api/v1/plans/validate', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = PlanValidateRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', 'Request validation failed', parsed.error.issues)
        }
        const result = await repository.validatePlan(parsed.data.plan)
        return ok(c, version, result, { warnings: result.warnings })
    })

    app.post('/api/v1/matching/plan-to-standards', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = PlanToStandardsRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', 'Request validation failed', parsed.error.issues)
        }
        const blocked = ensureFieldsetAccess(c, parsed.data.include)
        if (blocked) return blocked
        const result = await repository.matchPlan(parsed.data.plan, parsed.data)
        return ok(c, version, result, {
            total_units: result.units.length,
            warnings: result.warnings
        })
    })

    app.post('/api/v1/coverage/analyze', async c => {
        const version = await repository.loadDataVersion()
        const body = await parseJson(c)
        const parsed = CoverageAnalyzeRequestSchema.safeParse(body)
        if (!parsed.success) {
            return apiError(c, 422, 'validation_error', 'Request validation failed', parsed.error.issues)
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
            return apiError(c, 422, 'validation_error', 'Request validation failed', parsed.error.issues)
        }
        const blocked = ensureFieldsetAccess(c, parsed.data.include)
        if (blocked) return blocked
        const matching = parsed.data.matches && typeof parsed.data.matches === 'object'
            ? parsed.data.matches as Awaited<ReturnType<typeof repository.matchPlan>>
            : undefined
        const result = await repository.generateWeeklySchedule(parsed.data.plan, matching, parsed.data)
        return ok(c, version, result, { total: result.length })
    })

    app.notFound(c => apiError(c, 404, 'not_found', 'Endpoint not found'))

    app.onError((error, c) => {
        console.error(error)
        return apiError(c, 500, 'internal_error', 'Internal server error')
    })

    return app
}
