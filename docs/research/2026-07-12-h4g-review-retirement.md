# H4G 人工审核工作台退役记录

日期：2026-07-12
决策：审核已经完成，`/h4g-review` 不再属于 kebiao 生产产品面。

## 从生产包移除

- Header“人工审核”入口、React 路由、独立 feature flag。
- `H4GReviewPage` 运行时代码、样式和虚拟列表依赖。
- 两份仅供工作台读取的 public review packet。
- 对应 E2E、axe、视觉用例与快照。
- Content Inventory、rollback contract 和 Phase 9 Runbook 中的生产路由定义。

## 明确保留

- 已审核并发布到正式 standards 数据中的 H4G 内容、年级拆分和来源字段。
- `src/data/h4gDifferentiation.js` 的正式发布判定。
- 数据构建、审计、reviewed candidate 发布脚本和历史执行报告；它们用于可追溯与必要时离线再生成，不进入用户导航。
- Gate A 概念板与 RC1 证据作为历史记录，不回写成当前产品事实。

RC2 从 13 个路由收敛为 12 个生产路由，并重新生成 12 × 5 的本地视觉与内容基线。
