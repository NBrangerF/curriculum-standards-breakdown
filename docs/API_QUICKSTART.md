# Curriculum Intelligence API Quickstart

更新时间：2026-07-09

本文档面向 API 使用者和集成方，说明如何调用 Curriculum Intelligence API、如何使用 API key、如何理解返回结构，以及如何在部署后做 smoke test。

## 1. Base URL

当前生产地址：

```text
https://curriculum-standards-breakdown.vercel.app
```

本地开发地址：

```text
http://localhost:8787
```

后续购买并绑定正式域名后，只需要把示例里的 base URL 换成新域名，并同步更新：

- Vercel domain alias
- `CURRICULUM_ALLOWED_ORIGINS`
- `docs/api/openapi.yaml` 的 `servers`
- smoke test 的 `API_BASE`

## 2. API Docs

Swagger UI：

```text
https://curriculum-standards-breakdown.vercel.app/api/v1/docs
```

OpenAPI YAML：

```text
https://curriculum-standards-breakdown.vercel.app/api/v1/openapi.yaml
```

Swagger UI 里的 server 默认指向 production。若本地调试，可以在 server 下拉框切换到 `http://localhost:8787`。

## 3. Authentication

公开 fieldset 可匿名访问。更高权限通过 `x-api-key` 请求头传入：

```bash
curl -s "$API_BASE/api/v1/health" \
  -H "x-api-key: $CURRICULUM_API_KEY"
```

环境变量格式：

```bash
CURRICULUM_API_KEYS="dev_xxx:developer,partner_xxx:partner"
CURRICULUM_ADMIN_API_KEYS="admin_xxx"
```

权限 tier：

| Tier | 用途 | 可访问 fieldset |
| --- | --- | --- |
| anonymous | 文档、健康检查、公开标准数据 | `public` |
| developer | 开发者集成与 evidence 级别分析 | `public`, `source`, `evidence` |
| partner | 教材证据和合作方集成 | `public`, `source`, `evidence`, `textbook` |
| admin | 运维和内部诊断 | all fieldsets, `/api/v1/metrics` |

## 4. Response Envelope

成功响应统一返回：

```json
{
  "data": {},
  "meta": {
    "request_id": "uuid",
    "data_version": "2026.07.09",
    "schema_version": "1.0.0",
    "warnings": []
  }
}
```

错误响应统一返回：

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": []
  },
  "meta": {
    "request_id": "uuid"
  }
}
```

常见错误码：

| HTTP | Code | 说明 |
| --- | --- | --- |
| 403 | `forbidden_tier` | 需要更高 API tier |
| 403 | `forbidden_fieldset` | 当前 key 不能访问请求的 fieldset |
| 404 | `not_found` | 学科、技能或标准 code 不存在 |
| 422 | `validation_error` | 请求体字段不符合 schema |
| 429 | `rate_limit_exceeded` | 超出当前 tier 限流 |

## 5. Curl Examples

设置 base URL：

```bash
export API_BASE="https://curriculum-standards-breakdown.vercel.app"
```

健康检查：

```bash
curl -s "$API_BASE/api/v1/health" | jq
```

列出学科：

```bash
curl -s "$API_BASE/api/v1/subjects" | jq
```

读取一条标准：

```bash
curl -s "$API_BASE/api/v1/standards/SC-D2-SC-010" | jq
```

搜索 standards：

```bash
curl -s -X POST "$API_BASE/api/v1/standards/search" \
  -H "content-type: application/json" \
  -d '{"subjects":["science"],"keyword":"植物","limit":3}' | jq
```

课程计划匹配 standards：

```bash
curl -s -X POST "$API_BASE/api/v1/matching/plan-to-standards" \
  -H "content-type: application/json" \
  -d '{
    "plan": {
      "title": "三年级科学植物观察单元",
      "subject_slug": "science",
      "grade": "三年级",
      "units": [
        {
          "title": "植物生命周期观察",
          "learning_goals": ["观察植物结构", "记录数据并交流发现"],
          "keywords": ["植物", "观察", "数据"]
        }
      ]
    },
    "top_k_per_unit": 2,
    "min_score": 0.2
  }' | jq
```

访问 evidence fieldset：

```bash
curl -s "$API_BASE/api/v1/standards/SC-D2-SC-010?include=public,evidence" \
  -H "x-api-key: $CURRICULUM_API_KEY" | jq
```

Admin metrics：

```bash
curl -s "$API_BASE/api/v1/metrics" \
  -H "x-api-key: $CURRICULUM_ADMIN_API_KEY" | jq
```

## 6. TypeScript Client

当前仓库提供轻量 client：

```ts
import { CurriculumClient } from '@curriculum/client'

const client = new CurriculumClient({
  baseUrl: 'https://curriculum-standards-breakdown.vercel.app',
  apiKey: process.env.CURRICULUM_API_KEY
})

const health = await client.getHealth()
const standards = await client.searchStandards({
  subjects: ['science'],
  keyword: '植物',
  limit: 3
})

const matches = await client.matchPlanToStandards({
  plan: {
    title: '三年级科学植物观察单元',
    subject_slug: 'science',
    grade: '三年级',
    units: [
      {
        title: '植物生命周期观察',
        learning_goals: ['观察植物结构', '记录数据并交流发现'],
        keywords: ['植物', '观察', '数据']
      }
    ]
  },
  top_k_per_unit: 2,
  min_score: 0.2
})
```

## 7. Smoke Test

部署后运行：

```bash
API_BASE="https://curriculum-standards-breakdown.vercel.app" npm run smoke:api
```

带 API key 验证 developer/admin 权限：

```bash
API_BASE="https://curriculum-standards-breakdown.vercel.app" \
CURRICULUM_SMOKE_API_KEY="$CURRICULUM_API_KEY" \
CURRICULUM_SMOKE_ADMIN_API_KEY="$CURRICULUM_ADMIN_API_KEY" \
npm run smoke:api
```

本地验证：

```bash
npm run api:dev
API_BASE="http://localhost:8787" npm run smoke:api
```

## 8. Integration Notes

- Planning APIs 不记录原始请求体；日志只记录 method、path、status、latency、tier、request_id。
- `public/data` 是当前 source of truth；Meilisearch 只作为搜索 adapter。
- 对外集成建议先从匿名/public 数据开始，再申请 developer 或 partner key。
- 所有返回都带 `request_id`；遇到错误时请把 `request_id` 和请求时间一起提供，方便查日志。
