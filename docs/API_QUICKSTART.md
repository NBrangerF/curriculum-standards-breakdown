# 课程智能 API 快速开始

更新时间：2026-07-10

本文档面向 API 使用者和集成方，说明如何调用课程智能 API、如何使用 API Key、如何理解返回结构，以及如何在部署后做冒烟测试。

## 1. 服务地址

当前生产地址：

```text
https://www.kebiao.org
```

本地开发地址：

```text
http://localhost:8787
```

`www.kebiao.org` 是对外文档、SDK 示例和 OpenAPI 的唯一正式 base URL。Vercel 技术域名只保留为部署别名，不应作为新的集成地址。

## 2. API 文档

中文 API 文档界面：

```text
https://www.kebiao.org/api/v1/docs
```

中文 OpenAPI YAML：

```text
https://www.kebiao.org/api/v1/openapi.yaml
```

API 文档界面的 server 默认指向 production。若本地调试，可以在 server 下拉框切换到 `http://localhost:8787`。

## 3. 认证

公开 fieldset 可匿名访问。更高权限通过 `x-api-key` 请求头传入：

```bash
curl -s "$API_BASE/api/v1/health" \
  -H "x-api-key: $CURRICULUM_API_KEY"
```

环境变量格式：

```bash
CURRICULUM_API_KEYS="partner_alpha_20260710:kb_live_developer_xxx:developer"
CURRICULUM_ADMIN_API_KEYS="ops_primary_20260710:kb_live_admin_xxx"
```

推荐的 registry 格式是 `key_id:key:tier`（admin 为 `key_id:key`）。`key_id` 只用于管理员指标和运维日志归属；不要在其中放姓名、邮箱或其他个人信息。历史 `key:tier` 格式仍可用。签发、轮换和撤销流程见 `docs/API_OPERATIONS.md`。

权限层级：

| 层级 | 用途 | 可访问字段集 |
| --- | --- | --- |
| anonymous | 文档、健康检查、公开标准数据 | `public` |
| developer | 开发者集成与 evidence 级别分析 | `public`, `source`, `evidence` |
| partner | 教材证据和合作方集成 | `public`, `source`, `evidence`, `textbook` |
| admin | 运维和内部诊断 | all fieldsets, `/api/v1/metrics` |

## 4. 响应结构

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
    "message": "请求参数或请求体校验失败。",
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
| 403 | `forbidden_tier` | 需要更高 API 权限层级 |
| 403 | `forbidden_fieldset` | 当前 API Key 不能访问请求的字段集 |
| 404 | `not_found` | 学科、技能或标准 code 不存在 |
| 422 | `validation_error` | 请求体字段不符合 schema |
| 429 | `rate_limit_exceeded` | 超出当前 tier 限流 |

## 5. curl 示例

设置 base URL：

```bash
export API_BASE="https://www.kebiao.org"
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

搜索课程标准：

```bash
curl -s -X POST "$API_BASE/api/v1/standards/search" \
  -H "content-type: application/json" \
  -d '{"subjects":["science"],"keyword":"植物","limit":3}' | jq
```

课程计划匹配课程标准：

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

访问 evidence 字段集：

```bash
curl -s "$API_BASE/api/v1/standards/SC-D2-SC-010?include=public,evidence" \
  -H "x-api-key: $CURRICULUM_API_KEY" | jq
```

管理员运行指标：

```bash
curl -s "$API_BASE/api/v1/metrics" \
  -H "x-api-key: $CURRICULUM_ADMIN_API_KEY" | jq
```

## 6. TypeScript 客户端

当前仓库提供轻量客户端：

```ts
import { CurriculumClient } from '@curriculum/client'

const client = new CurriculumClient({
  baseUrl: 'https://www.kebiao.org',
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

## 7. 冒烟测试

部署后运行：

```bash
API_BASE="https://www.kebiao.org" npm run smoke:api
```

带 API Key 验证 developer/admin 权限：

```bash
API_BASE="https://www.kebiao.org" \
CURRICULUM_SMOKE_API_KEY="$CURRICULUM_API_KEY" \
CURRICULUM_SMOKE_ADMIN_API_KEY="$CURRICULUM_ADMIN_API_KEY" \
npm run smoke:api
```

本地验证：

```bash
npm run api:dev
API_BASE="http://localhost:8787" npm run smoke:api
```

## 8. 集成注意事项

- 教学规划 API 不记录原始请求体；日志与 durable metrics 只记录 method、path、status、latency、tier 和非敏感 `api_key_id`。
- `public/data` 是当前唯一数据源；Meilisearch 只作为搜索适配器。
- 对外集成建议先从匿名/public 数据开始，再申请 developer 或 partner API Key。
- 所有返回都带 `request_id`；遇到错误时请把 `request_id` 和请求时间一起提供，方便查日志。
