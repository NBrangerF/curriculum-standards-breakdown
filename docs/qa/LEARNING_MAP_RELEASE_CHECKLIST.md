# 学习脉络发布验收清单

发布对象：`学习脉络 — 先掌握什么 · 接下来解锁什么`

此清单不允许用既有 `contains`、`progression`、`previous_code`、`next_code` 或机器候选替代 prerequisite 证据。

## Gate A：数据真实

- [ ] `docs/data/reviews/knowledge_graph/math_geometry_review_decisions.json` 存在，且由被授权课程领域专家填写。
- [ ] `docs/data/reviews/knowledge_graph/math_geometry_signoff.md` 存在，含 reviewer role、日期、版本及批准范围。
- [ ] 所有 `approved` prerequisite 均有 rationale、至少一个 evidenceRef、necessity、confidence、review metadata。
- [ ] `npm run build:knowledge-graph` 通过；它只能在 decisions 与 signoff 均存在时写入 `public/data/knowledge_graph/`。
- [ ] `npm run validate:knowledge-graph-loader`、`npm run audit:knowledge-graph` 通过。
- [ ] 三个数学·图形与几何 golden anchors 已由领域专家核对“直接前置 / 直接解锁 / taxonomy path”。

## Gate B：用户任务

- [ ] 从已对齐标准详情或搜索结果进入，在两次交互内读到直接前置与直接解锁。
- [ ] 选择一条边时，Inspector 显示 `A 是 B 的必要/建议前置`、理由、证据及标准对齐。
- [ ] 选择节点时，URL 使用 `pushState`；切换 taxonomy path 使用 `pushState`；改变展示深度或选择关系使用 `replaceState`。
- [ ] 刷新、后退、前进后恢复 selectedNode、contextPath、depth 与 necessity。
- [ ] 多父节点不自动任选第一个父路径；用户可切换替代路径。
- [ ] 超出 40（默认）/ 60 节点或 80 边限制时，显示准确未展开计数与语义列表。

## Gate C：质量与无障碍

- [ ] `npm run core:test`
- [ ] `npm run typecheck`
- [ ] `npm run validate:learning-map-interaction`
- [ ] `npm run validate:learning-map-layout`
- [ ] `npm run benchmark:learning-map` 的 p95 小于 100ms（在未并行构建时执行）。
- [ ] `npm run test:e2e`
- [ ] `npm run test:a11y`
- [ ] `npm run build-storybook`
- [ ] `npm run check:bundle`
- [ ] 390×844、768px、1440px 与 200% zoom 没有横向溢出或任务阻断。
- [ ] `prefers-reduced-motion: reduce` 下没有必需依赖动画的交互。
- [ ] VoiceOver + Safari 完成：搜索、读直接前置、选择证据、切换 taxonomy path。
- [ ] NVDA + Chrome/Firefox 完成同一任务；记录浏览器/读屏版本与结论。

## Gate D：可回滚发布

- [ ] `learning-map` 独立 flag 通过 query、localStorage、surface env、global env 和 production default-off 测试。
- [ ] `ui-v2=0` 时不加载 Learning Map，即使 query 中含 `view=learning-map`。
- [ ] approved 数据可以通过单独数据提交回滚；不需要回滚应用代码。
- [ ] 依序执行 `default-off → 5% → 20% → 50% → 100% cycle 1 → 100% cycle 2`，每一档先重跑自动化 Gate。
- [ ] 不使用“观察 48 小时”作为发布条件；两个独立的自动化成功 100% 发布周期后再评估旧图退役。

## 当前状态（2026-07-13）

- Gate B/C 的 fixture、route、DOM fallback、局部 DAG、证据 Inspector、URL 与 keyboard taxonomy 行为已实现并有自动化覆盖。
- Gate A 未满足：生产目录没有 approved Learning Map manifest，当前 production prerequisite 数为 0。
- 因此 feature flag 保持生产 default-off；任何直接入口必须安全显示数据错误或“暂无经审核学习脉络”，不能输出伪造先修答案。
