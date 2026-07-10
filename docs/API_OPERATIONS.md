# API 运营手册

更新时间：2026-07-10

本文档面向 `https://www.kebiao.org` 的 API 管理员，覆盖持久化指标、API Key 签发、轮换和撤销。所有敏感值都只存于 Vercel Production 环境变量或团队的密码管理器，不写入 Git、工单、浏览器前端或应用日志。

## 1. Durable Metrics

`/api/v1/metrics` 始终返回当前实例的内存摘要。配置 Redis REST 后，API 同时把一个**有上限、有过期时间**的事件窗口写入 Redis，并由 admin-only `/api/v1/metrics` 汇总读取。

写入 Redis 的事件只有：

```json
{
  "timestamp": "2026-07-10T10:00:00.000Z",
  "method": "POST",
  "path": "/api/v1/matching/plan-to-standards",
  "status": 200,
  "duration_ms": 83.2,
  "tier": "developer",
  "api_key_id": "partner_alpha_20260710"
}
```

不会写入 API Key 明文、`request_id`、请求头、IP、查询参数或教学计划请求体。Redis 写入失败只输出无敏感字段的告警，不会让主 API 请求失败。

### 1.1 Vercel 配置

在 Vercel Marketplace 或自有账户中创建支持 Redis REST 的实例。将该实例的 REST URL 和 token 映射为本项目专用变量，再部署 Production：

| 变量 | 是否必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `CURRICULUM_METRICS_REDIS_REST_URL` | 是 | - | Redis REST HTTPS URL。 |
| `CURRICULUM_METRICS_REDIS_REST_TOKEN` | 是 | - | Redis REST bearer token。 |
| `CURRICULUM_METRICS_REDIS_KEY_PREFIX` | 否 | `curriculum:api:metrics` | 仅允许字母、数字、`_`、`-`、`:`。 |
| `CURRICULUM_METRICS_REDIS_MAX_EVENTS` | 否 | `10000` | 每个 UTC 日键最多保留 100 至 100000 条事件。 |
| `CURRICULUM_METRICS_REDIS_TTL_SECONDS` | 否 | `2592000` | 每个 UTC 日键保留 1 小时至 365 天，默认 30 天。 |

使用 Vercel CLI 时，逐项在 Production 环境中添加，不要把 token 放在 shell history：

```bash
npx vercel env add CURRICULUM_METRICS_REDIS_REST_URL production
npx vercel env add CURRICULUM_METRICS_REDIS_REST_TOKEN production
npx vercel --prod
```

部署后使用 admin key 验证：

```bash
curl -s https://www.kebiao.org/api/v1/metrics \
  -H "x-api-key: $CURRICULUM_ADMIN_API_KEY" | jq '.data | {sink, persistent}'
```

预期 `sink` 为 `redis`，且 `persistent.enabled` 为 `true`、`persistent.backend` 为 `upstash_redis`。未配置 Redis 时保持兼容：Node/file 部署可使用 `CURRICULUM_METRICS_FILE`；Vercel 生产环境不要依赖 `/tmp` 作为持久层。

Redis 是 API 自助指标的短期窗口。仍应保留 `CURRICULUM_ENABLE_REQUEST_LOGS=true`，并在需要长期检索、告警或数据仓库时配置 Vercel Log Drain。结构化日志同样不记录教学计划原文。

## 2. API Key 注册格式

推荐格式通过稳定的 `key_id` 把使用量和密钥本身分开：

```bash
CURRICULUM_API_KEYS="partner_alpha_20260710:kb_live_developer_xxx:developer"
CURRICULUM_ADMIN_API_KEYS="ops_primary_20260710:kb_live_admin_xxx"
```

`key_id` 必须是 3 至 64 位的小写标识符，只能包含字母、数字、`_` 和 `-`。它可以出现在管理员指标和结构化运维日志中；API Key 明文不会出现。旧格式仍兼容：

```bash
CURRICULUM_API_KEYS="legacy_key:developer"
CURRICULUM_ADMIN_API_KEYS="legacy_admin_key"
```

旧格式的日志标识会使用不可逆短哈希，不再截取或显示 key 的任意字符。

## 3. 签发 Key

签发前先确定 tier、集成方、用途、负责人和失效/复核日期。以 developer key 为例：

```bash
npx tsx scripts/issue-api-key.ts \
  --tier developer \
  --id partner_alpha_20260710
```

命令只在终端显示一次 `api_key` 和应追加的 `registry_entry`。将明文 key 通过受控秘密共享渠道发给集成方，并在密码管理器登记 `key_id`、tier、发放时间、负责人和轮换日期。脚本不会写 Vercel、文件或 Git。

签发 admin key 必须显式确认：

```bash
npx tsx scripts/issue-api-key.ts \
  --tier admin \
  --id ops_secondary_20260710 \
  --allow-admin
```

在 Vercel Dashboard 更新**完整**的目标环境变量值。Vercel 会加密且不回显旧值，因此应从受控密码管理器取得现有 registry，再追加新条目；不要为了读取旧值而把它下载到仓库。

## 4. 轮换与撤销

1. 先签发同 tier 的新 key，并记录新的 `key_id`。
2. 将旧条目和新条目同时保留在 Vercel Production registry，部署后让集成方改用新 key。
3. 用新 key 做最小权限 smoke：developer 验证 `include=public,evidence`，partner 验证 `include=public,textbook`，admin 验证 `/api/v1/metrics`。
4. 在 Redis `/metrics` 的 `by_api_key_id` 和结构化日志中确认新 key 已有正常请求量。
5. 到达迁移窗口后，从 registry 删除旧条目并重新部署。撤销泄露 key 时跳过等待窗口，立即执行这一步。
6. 记录撤销时间、原因和受影响集成方；不要记录明文 key。

API Key 永远不应出现在前端 JavaScript、Swagger 截图、浏览器 local storage、公开示例、GitHub Issue 或教学计划内容中。
