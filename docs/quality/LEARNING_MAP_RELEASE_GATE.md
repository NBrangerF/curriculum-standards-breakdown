# 学习脉络发布 Gate

发布对象：`学习脉络 — 先掌握什么 · 接下来解锁什么`。

本文件记录当前仓库可自动验证的发布状态；它不构成课程领域审核，也不以 fixture 替代生产数据。

## Gate A：课程数据与专家签署 — Pending

截至 2026-07-13，以下生产发布前提均不存在：

- `docs/data/reviews/knowledge_graph/math_geometry_review_decisions.json`
- `docs/data/reviews/knowledge_graph/math_geometry_signoff.md`
- `public/data/knowledge_graph/manifest.json` 及其只含 approved 记录的发布数据

因此没有任何生产 approved prerequisite edge，production Learning Map 必须保持 default-off，且不允许推出、合并上线或以 taxonomy、学段进阶、`previous_code`、`next_code` 推断“先修 / 解锁”。测试 fixture 只用于工程预览与回归。

解除 Gate A 需要：课程领域专家填入审核 decisions、签署范围和版本，并令 `npm run build:knowledge-graph`、`npm run validate:knowledge-graph-loader` 与 `npm run audit:knowledge-graph` 对该真实数据通过。

## Gate B：交互与可回滚 — Engineering preview

- `npm run test:learning-map` 覆盖共享 URL、focus/path/depth 恢复、先修→解锁方向、证据、multi-parent context、刷新/前进/后退、reviewed 与 unreviewed 空关系、loader failure、移动端语义 fallback 和 UI V2 × Learning Map 四种 query 组合。
- `npm run validate:learning-map-rollout-matrix` 验证四种开关组合、query 覆盖优先级和标准详情根节点的 Learning Map metadata contract。
- `npm run validate:learning-map-rollout` 验证学习脉络 URL state 与独立开关基础契约。

## Gate C：代码质量 — Required before release

在 Gate A 解除后，依次执行并记录结果：

```bash
npm run validate:knowledge-graph
npm run audit:knowledge-graph
npm run validate:learning-map-interaction
npm run validate:learning-map-layout
npm run benchmark:learning-map
npm run test:learning-map
npm run test:e2e
npm run test:a11y
npm run typecheck
npm run lint:styles
npm run build-storybook
npm run check:bundle
```

自动化通过不覆盖人工 VoiceOver/NVDA 验收；该记录仍须在发布决定前补齐。

## Gate D：上线

当前状态：**不可上线**。在 Gate A 与 Gate C 完成前，禁止提高 rollout percentage。Gate A 解除后，按既有独立 `learning-map` flag 做可回滚的分档发布；不把“观察 48 小时”作为前置条件。
