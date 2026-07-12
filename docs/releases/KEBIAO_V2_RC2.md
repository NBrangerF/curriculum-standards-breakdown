# kebiao V2 Release Candidate 2

日期：2026-07-12
分支：`codex/kebiao-v2-rc1`
标签：`kebiao-v2-rc2`

## 候选范围

RC2 继承 RC1 的视觉、交互与知识图谱方案，并按产品决策退役已经完成使命的 H4G 人工审核工作台。正式 H4G 标准内容、年级拆分、来源字段与离线审计/发布流水线继续保留。

- 生产路由从 13 条收敛为 12 条。
- Header、route、feature flag、页面 chunk、虚拟列表依赖和约 10MB review packet 已移除。
- 旧审核页的 E2E、axe、视觉场景及发布契约同步退役。
- Windows + NVDA 已转为外部验收包；本机不伪报 Windows 结果。

## 源码与基线身份

- 实现提交：`10ef847dd9722f9722dd0be3c6193b7fdf3a84b7`
- 本地五视口源码指纹：`64abd8dd6a278a37836401e8543a20ec056de7bb813a398dfdbefa405b220a6a`
- 路由 / 视口 / artifact：12 / 5 / 60
- Content Inventory、横向溢出、console/page error：0 / 0 / 0/0
- 五视口触控候选：8,808，低于 44 × 44px：0

## RC2 新鲜门禁

- design、motion、GraphModel 与 graph interaction contract：通过。
- E2E：55/55。
- axe / 辅助模式：25/25，critical / serious 为 0。
- visual：19/19。
- TypeScript workspace + Vercel typecheck：通过。
- Storybook production build：通过。
- production bundle：main 138.33 KB gzip；graph lazy leak 0。
- production preview Lighthouse：Home 100/100/100/100，Skills 100/100/100/100，Standard 94/98/100/100；三条 URL 均满足断言。
- `npm audit --audit-level=high`：0 vulnerabilities。
- 本地 60 artifact checksum 与源码指纹验证：通过。

## 人工辅助技术状态

- 用户授权后真实开启 macOS VoiceOver；Safari 完成 Home → Search → Standard → Graph DOM 邻接关系 → Collection Dialog 的结构与焦点任务，P0/P1 为 0。
- Computer Use 无法监听 VoiceOver 音频；中文语音自然度仍需真人听觉签字。
- Windows + NVDA 外部验收已获许可，回填模板：`docs/baselines/2026-07-12-nvda-external-acceptance.md`。

## 发布边界

RC2 是可部署候选，不代表 V2 已进入生产流量。当前正式域名仍为旧版，comparison 为 `candidateMeetsV2Contract=false`，并额外发现旧生产基线仍含已退役的 `h4gReview`。Phase 9 必须从 Preview/Internal 开始，按 5% → 20% → 50% → 100% 的观察窗口推进。

权威文档：

- `docs/PHASE_9_ROLLOUT_RUNBOOK.md`
- `docs/baselines/2026-07-12-ui-rollback-contract.machine.json`
- `docs/baselines/2026-07-12-screen-reader-manual-signoff.md`
- `docs/research/2026-07-12-h4g-review-retirement.md`
