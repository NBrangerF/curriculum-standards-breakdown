# kebiao V2 Phase 9 Preview 2

日期：2026-07-12
分支：`codex/kebiao-v2-rc2`
源码提交：`35cd52e`

## 部署

- 状态：Vercel Preview `READY`
- Deployment ID：`dpl_EX6EWLfei3GMsZEFhgPRyoB1e41A`
- Preview URL：`https://curriculum-standards-breakdown-3b45vxpca-sichuang-fans-projects.vercel.app`
- Inspector：`https://vercel.com/sichuang-fans-projects/curriculum-standards-breakdown/EX6EWLfei3GMsZEFhgPRyoB1e41A`
- V2：Preview 环境全开。
- Analytics / Speed Insights：代码已包含，但环境变量仍关闭；本部署不开始真实数据采集。
- Production：未部署、未修改。

## 相对 Preview 1

- 加入 `@vercel/speed-insights` React 集成，受独立环境变量控制。
- 加入隐私安全的 `kebiao_task` 事件层，只有 `task` 与 `variant` 两个属性。
- 覆盖搜索、图谱就绪/降级、收藏和清单创建；不发送 rollout ID、bucket 或内容字段。
- 新增机器可执行 observability contract。

## 本地质量证据

- E2E：55/55。
- axe / 辅助模式：25/25。
- visual：19/19。
- rollout / observability contract：通过。
- bundle budget：main 138.95 KB gzip，graph lazy leak 0。
- 12 × 5 baseline：60/60；内容、溢出、触控与运行错误均为 0。
- `npm audit --audit-level=high`：0 vulnerabilities。
- READY 后一小时 error-level Runtime Logs 扫描：0 条错误。

该 Preview 是启用观测前的最终 dormant-telemetry 候选。只有获得产品方明确授权后，才允许在后续 Preview 打开 Analytics / Speed Insights 并验证 dashboard 数据。
