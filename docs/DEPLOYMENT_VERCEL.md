# Vercel Deployment Runbook

更新时间：2026-07-10

本文档说明如何把 Curriculum Intelligence API + Web app 部署到 Vercel。

## 1. 部署形态

当前仓库使用同一个 Vercel project 承载两层能力：

- Web app：Vite build 输出到 `dist/`。
- API service：`api/v1/[...path].ts` 作为 Vercel Function 入口，复用 `apps/api/src/app.ts` 和 `packages/curriculum-core`。

关键文件：

- `vercel.json`
- `api/v1/[...path].ts`
- `.vercelignore`
- `apps/api/src/config.ts`
- `docs/api/openapi.yaml`
- `scripts/smoke-api.ts`

## 2. Vercel Project Settings

建议在 Vercel project 中使用：

| Setting | Value |
| --- | --- |
| Framework Preset | Vite |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Root Directory | repository root |

`vercel.json` 已显式声明这些设置，并配置：

- `public/data/**` 打包进 API function。
- `docs/api/openapi.yaml` 打包进 API function。
- `/api/v1/:path*` 显式改写到 Vercel Function，避免嵌套路由落入 SPA fallback。
- 其他非静态资源路径回落到 SPA `index.html`。
- OpenAPI `servers` 默认 production first，Swagger UI 的 Try it out 会优先请求线上 API。

## 3. Environment Variables

Production/Preview 至少配置：

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `CURRICULUM_API_KEYS` | Recommended | `partner_alpha:key:developer` | 逗号分隔，推荐格式为 `key_id:key:tier`。 |
| `CURRICULUM_ADMIN_API_KEYS` | Recommended | `ops_primary:key` | 访问 `/api/v1/metrics` 和 admin fieldset；推荐格式为 `key_id:key`。 |
| `CURRICULUM_ALLOWED_ORIGINS` | Recommended | `https://www.kebiao.org,https://kebiao.org` | 默认 `*`，生产建议仅允许正式域名。 |
| `CURRICULUM_ENABLE_REQUEST_LOGS` | Recommended | `true` | 输出不含请求体的结构化日志。 |
| `CURRICULUM_DATA_ROOT` | Optional | `public/data` | Vercel 默认可不填。 |
| `CURRICULUM_OPENAPI_PATH` | Optional | `docs/api/openapi.yaml` | Vercel 默认可不填。 |
| `CURRICULUM_METRICS_REDIS_REST_URL` | Recommended | `https://...` | Vercel/Upstash Redis REST URL；与 token 同时配置后启用 durable metrics。 |
| `CURRICULUM_METRICS_REDIS_REST_TOKEN` | Recommended | `...` | Redis REST bearer token。 |
| `CURRICULUM_METRICS_REDIS_MAX_EVENTS` | Optional | `10000` | 每个 UTC 日键保留的事件上限。 |
| `CURRICULUM_METRICS_REDIS_TTL_SECONDS` | Optional | `2592000` | Redis 事件窗口保留时间，默认 30 天。 |
| `CURRICULUM_METRICS_FILE` | Optional | `/tmp/curriculum-api-metrics.ndjson` | 仅适用于 Node/file 部署；Vercel 不应依赖 `/tmp`。 |
| `MEILI_HOST` | Optional | `https://search.example.com` | Meilisearch 写入时使用。 |
| `MEILI_API_KEY` | Optional | `...` | Meilisearch 写入时使用。 |
| `MEILI_INDEX_UID` | Optional | `curriculum_standards` | Meilisearch index 名称。 |

## 4. Local Release Checklist

部署前运行：

```bash
npm run test:api
npm run typecheck
npm run eval:matching
npm run search:index-meilisearch
npm run build
npm audit --omit=dev
```

本地 smoke test 需要先启动 API：

```bash
npm run api:dev
API_BASE=http://localhost:8787 npm run smoke:api
```

如果要对 production 或 preview 做 smoke test：

```bash
API_BASE=https://www.kebiao.org npm run smoke:api
```

带 developer/admin key 验证受限 fieldset 和 metrics：

```bash
API_BASE=https://www.kebiao.org \
CURRICULUM_SMOKE_API_KEY=dev_xxx \
CURRICULUM_SMOKE_ADMIN_API_KEY=admin_xxx \
npm run smoke:api
```

`npm run search:index-meilisearch` 默认 dry run，不会写入远端。实际写入：

```bash
MEILI_HOST=https://search.example.com \
MEILI_API_KEY=... \
npm run search:index-meilisearch -- --write
```

## 5. Deploy

如果使用 Vercel Git Integration：

1. 将当前 milestone commit 推到 GitHub。
2. Vercel 会生成 Preview Deployment。
3. 验证 Preview 后合并或 Promote 到 Production。

如果使用 CLI：

```bash
npm run deploy:vercel
```

## 6. Smoke Tests

部署后验证：

```bash
API_BASE=https://www.kebiao.org npm run smoke:api
```

也可以手动验证关键路径：

```bash
curl -s https://www.kebiao.org/api/v1/health | jq
curl -s https://www.kebiao.org/api/v1/openapi.yaml | head
curl -s https://www.kebiao.org/api/v1/standards/SC-D2-SC-010/neighbors | jq
curl -s -X POST https://www.kebiao.org/api/v1/matching/plan-to-standards \
  -H 'content-type: application/json' \
  -d '{"plan":{"title":"三年级科学植物观察单元","subject_slug":"science","grade":"三年级","units":[{"title":"植物生命周期观察","learning_goals":["观察植物结构","记录数据并交流发现"],"keywords":["植物","观察","数据"]}]},"top_k_per_unit":2,"min_score":0.2}' | jq
```

Admin-only metrics:

```bash
curl -s https://www.kebiao.org/api/v1/metrics \
  -H 'x-api-key: YOUR_ADMIN_KEY' | jq
```

持久化指标与 API Key 签发、轮换、撤销见 `docs/API_OPERATIONS.md`。

## 7. 正式域名

当前正式生产域名是 `https://www.kebiao.org`。所有新的客户集成、SDK 示例、OpenAPI `servers` 和 smoke test 都必须使用该地址。

域名配置后的发布检查：

1. 确认 Vercel 的 `www.kebiao.org` DNS 和 SSL 均为 ready，并且 apex 域名的跳转策略已明确。
2. 将 `CURRICULUM_ALLOWED_ORIGINS` 设为实际需要的浏览器来源，例如 `https://www.kebiao.org,https://kebiao.org`；不要在生产环境长期保留 `*`。
3. 运行 `npm run typecheck && npm run test:api && npm run eval:matching && npm run build`。
4. 部署后执行 `API_BASE=https://www.kebiao.org npm run smoke:api`。
5. 打开 `https://www.kebiao.org/api/v1/docs`，确认 Swagger UI 的首个 server 为正式域名。

## 8. Rollback

首选 Vercel dashboard 直接 Promote 前一个健康 deployment。

CLI 可使用：

```bash
vercel rollback
```

回滚前后都要验证 `/api/v1/health` 和一个真实 standards endpoint。

## 9. Notes

- Planning APIs 不记录原始请求体；日志只记录 method、path、status、duration、tier、request_id。
- `admin` fieldset 只允许 admin tier。
- `textbook` fieldset 只允许 partner 或 admin tier。
- 默认 JSON repository 仍然是 source of truth；Meilisearch 只是搜索 adapter。

参考：

- Vercel Project Configuration: https://vercel.com/docs/project-configuration
- Vercel Functions: https://vercel.com/docs/functions
- Vercel Rewrites: https://vercel.com/docs/rewrites
