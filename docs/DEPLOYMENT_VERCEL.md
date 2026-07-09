# Vercel Deployment Runbook

更新时间：2026-07-09

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
- `/api/:path*` 走 Vercel Function。
- 其他非静态资源路径回落到 SPA `index.html`。
- OpenAPI `servers` 默认 production first，Swagger UI 的 Try it out 会优先请求线上 API。

## 3. Environment Variables

Production/Preview 至少配置：

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `CURRICULUM_API_KEYS` | Recommended | `dev_xxx:developer,partner_xxx:partner` | 逗号分隔，格式为 `key:tier`。 |
| `CURRICULUM_ADMIN_API_KEYS` | Recommended | `admin_xxx` | 访问 `/api/v1/metrics` 和 admin fieldset。 |
| `CURRICULUM_ALLOWED_ORIGINS` | Recommended | `https://your-domain.com` | 默认 `*`，生产建议收窄。 |
| `CURRICULUM_ENABLE_REQUEST_LOGS` | Recommended | `true` | 输出不含请求体的结构化日志。 |
| `CURRICULUM_DATA_ROOT` | Optional | `public/data` | Vercel 默认可不填。 |
| `CURRICULUM_OPENAPI_PATH` | Optional | `docs/api/openapi.yaml` | Vercel 默认可不填。 |
| `CURRICULUM_METRICS_FILE` | Optional | `/tmp/curriculum-api-metrics.ndjson` | Node/file 部署可持久到文件；Vercel 上建议依赖平台日志作为 durable sink。 |
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
API_BASE=https://YOUR_DOMAIN npm run smoke:api
```

带 developer/admin key 验证受限 fieldset 和 metrics：

```bash
API_BASE=https://YOUR_DOMAIN \
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
API_BASE=https://YOUR_DOMAIN npm run smoke:api
```

也可以手动验证关键路径：

```bash
curl -s https://YOUR_DOMAIN/api/v1/health | jq
curl -s https://YOUR_DOMAIN/api/v1/openapi.yaml | head
curl -s https://YOUR_DOMAIN/api/v1/standards/SC-D2-SC-010/neighbors | jq
curl -s -X POST https://YOUR_DOMAIN/api/v1/matching/plan-to-standards \
  -H 'content-type: application/json' \
  -d '{"plan":{"title":"三年级科学植物观察单元","subject_slug":"science","grade":"三年级","units":[{"title":"植物生命周期观察","learning_goals":["观察植物结构","记录数据并交流发现"],"keywords":["植物","观察","数据"]}]},"top_k_per_unit":2,"min_score":0.2}' | jq
```

Admin-only metrics:

```bash
curl -s https://YOUR_DOMAIN/api/v1/metrics \
  -H 'x-api-key: YOUR_ADMIN_KEY' | jq
```

## 7. Custom Domain Cutover

你后续在 Vercel 购买或绑定正式域名后，按这个顺序切换：

1. 在 Vercel Project 里添加 domain，并等待 DNS / SSL 状态变为 ready。
2. 将 `CURRICULUM_ALLOWED_ORIGINS` 从 `*` 或旧域名改为正式域名；若还有管理后台或本地调试来源，用逗号追加。
3. 更新 `docs/api/openapi.yaml` 的 production server URL。
4. 运行 `npm run typecheck && npm run test:api && npm run build`。
5. 部署后执行 `API_BASE=https://YOUR_DOMAIN npm run smoke:api`。
6. 确认 Swagger UI 的 server 下拉框默认显示正式域名。

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
