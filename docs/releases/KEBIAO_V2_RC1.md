# kebiao V2 Release Candidate 1

日期：2026-07-12
分支：`codex/kebiao-v2-rc1`
标签：`kebiao-v2-rc1`

## 候选范围

- `8ad933d feat(ui): build kebiao v2 experience`
- `04f80ba test(ui): add release quality gates`
- `a87c552 docs(ui): record v2 release evidence`

本候选冻结 kebiao V2 的视觉系统、13 条生产路由、知识图谱、交互动效、响应式、辅助模式、质量门禁与 Phase 9 回滚/发布文档。现有信息架构、URL、标准内容、收藏和 H4G 审核流程保持不变。

## 源码与基线身份

- 本地五视口源码指纹：`d44938a929bca8244dc56b69e8bf7c0ff1c380c6819b33b1f56e49535d7d4c6d`
- 路由：13
- 视口：5
- 基线 artifact：65
- Content Inventory 缺失：0
- 横向溢出：0
- console/page error：0/0
- 五视口触控候选：9,009，低于 44px：0

五视口 PNG 是可重现的本地审计产物，不进入 Git；manifest、checksum、canonical Playwright snapshots 与概念评审图进入版本控制。

## RC1 新鲜门禁

在冻结分支上依次执行并通过：

- design、motion、GraphModel 与 graph interaction contract；
- E2E 58/58；
- axe/辅助模式 27/27；
- visual 21/21；
- TypeScript workspace + Vercel typecheck；
- Storybook production build；
- production bundle budget，main 138.52 KB gzip，graph lazy leak 0；
- Lighthouse CI：Home、Skills、Standard 三条 URL 全部满足断言；
- `npm audit --audit-level=high`：0 vulnerabilities。

## 已知发布前 Gate

- 正式域名仍是旧版，production comparison 为 `candidateMeetsV2Contract=false`；这证明 V2 尚未部署，不是 RC 失败。
- Safari/Chrome VoiceOver 与 Windows NVDA 仍需按人工签字模板执行。
- Phase 9 内部、5%、20%、50%、100% 流量和两个稳定周期尚未执行。
- RC1 不删除 route flags、DOM 图谱等价路径或兼容 alias。

## 回滚

权威回滚语义见：

- `docs/adr/ADR-0003-route-ui-v2-rollout.md`
- `docs/baselines/2026-07-12-ui-rollback-contract.machine.json`
- `docs/PHASE_9_ROLLOUT_RUNBOOK.md`
