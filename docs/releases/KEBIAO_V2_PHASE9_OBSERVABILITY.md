# kebiao V2 Phase 9 观测契约

日期：2026-07-12
状态：代码就绪，默认关闭；等待产品方授权后启用真实数据采集

## 开关

| 环境变量 | 默认 | 作用 |
| --- | --- | --- |
| `VITE_ENABLE_ANALYTICS` | `false` | Vercel Web Analytics、页面访问与 `kebiao_task` 自定义事件 |
| `VITE_ENABLE_SPEED_INSIGHTS` | `false` | LCP、INP、CLS、FCP、TTFB 真实用户数据 |

缺少变量时不插入采集组件、不安装点击监听器，也不发送网络事件。

## 事件

所有自定义事件名称为 `kebiao_task`，仅含两个属性：

- `task`：固定白名单任务。
- `variant`：`legacy`、`v2` 或 `v2:5%` 等 cohort 描述。

任务白名单：

- `search_start`
- `search_results`
- `graph_open`
- `graph_ready`
- `graph_fallback`
- `favorite_toggle`
- `collection_create`

禁止发送 rollout subject、bucket、URL query、标准编码、清单名称、搜索输入、邮箱、自由文本或其他可识别数据。

## 指标计算

| 指标 | 计算方式 | Phase 9 Gate |
| --- | --- | --- |
| 搜索任务完成代理 | `search_results / search_start`，按 `variant` 对比 | 不低于旧版 -2%；低于 -5% 回滚 |
| 图谱就绪率 | `graph_ready / graph_open` | ≥ 99% |
| 图谱降级率 | `graph_fallback / graph_open` | < 1%；≥ 3% 回滚 |
| 收藏使用量 | `favorite_toggle`，按 variant 与访问量归一化 | 观察，不单独阻断 |
| 清单创建量 | `collection_create`，按 variant 与访问量归一化 | 观察，不单独阻断 |
| CWV | Speed Insights p75 LCP / INP / CLS | LCP ≤ 2.5s、INP ≤ 200ms、CLS ≤ 0.1 |
| Runtime error | Vercel Logs / API structured logs | 不高于旧版 +10%；+25% 回滚 |

事件是任务完成率的产品代理，不声称等同于用户研究结论。样本不足时延长观察窗口，不用小样本证明稳定。

## 激活顺序

1. Preview 开启 Analytics 与 Speed Insights，确认 dashboard 收到匿名数据且属性符合契约。
2. 外部 NVDA 与 VoiceOver 听觉签字完成。
3. Production 首次发布保持 V2 默认关闭，确认 runtime logs 与回滚开关。
4. Home、Search、Collections 进入 5%；观察至少 48 小时。
5. 按 Runbook 晋级 20%、50%、100%，每阶段记录开始/结束时间、样本量、指标、缺陷与决定。

## 稳定周期记录模板

| 字段 | 值 |
| --- | --- |
| Deployment / Git SHA | 待填写 |
| 阶段与路由 | 待填写 |
| 开始 / 结束 | 待填写 |
| V2 / legacy 样本 | 待填写 |
| 搜索完成代理 | 待填写 |
| 图谱就绪 / 降级 | 待填写 |
| p75 LCP / INP / CLS | 待填写 |
| Runtime errors | 待填写 |
| P0 / P1 / P2 | 待填写 |
| 决定与签字人 | 待填写 |
