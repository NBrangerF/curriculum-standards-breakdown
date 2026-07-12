# ADR-0003：按路由隔离 UI V2 灰度与回滚

- 状态：Accepted
- 日期：2026-07-11

## 背景

kebiao 的升级保持原信息组织和 URL 契约，但首页、学科、能力、标准详情与图谱工作台的视觉和交互变化较大。上线时需要能按路由回退增强层，同时保留标准正文、筛选、收藏、复制和列表等核心任务。

## 决策

通过 `RouteUiBoundary` 为 13 个生产路由建立独立 key：`home`、`subject`、`skills`、`skillDetail`、`search`、`glossary`、`standard`、`collections`、`collectionDetail`、`print`、`styleguide`、`feedback` 和 `h4gReview`。解析优先级固定为：

1. 查询参数 `ui-v2=0|1` 或 `ui=legacy|v2`；
2. `localStorage` 的 `kebiao:ui-v2:<routeKey>`；
3. `VITE_UI_V2_<ROUTE>` 环境变量；
4. 默认启用 V2。

边界输出 `data-ui-route`、`data-ui-version` 和 `data-ui-flag-source`，便于 E2E、线上诊断和遥测识别。

## 回滚语义

- 首页回滚移除增强叙事段，保留检索与原内容入口。
- 学科、能力总览与能力详情回滚到列表内容，不加载图谱增强。
- 标准详情回滚隐藏“在图谱中定位”和关系面板，保留正文、编码复制与收藏。
- Search、Glossary、Collections、Collection Detail、Print、Style Guide、Feedback 与 H4G Review 为 passthrough route：没有独立重型增强层需要关闭，legacy flag 保持内容与任务不变，并提供独立诊断/环境控制。
- 查询参数只用于单次会话验证，不永久覆盖环境配置。
- 回滚行为契约、foundation bridge 与必要兼容 alias 至少保留两个稳定发布周期；删除必须另立变更。CSS Module 迁移不等于删除回滚行为。

机器可读契约位于 `docs/baselines/2026-07-12-ui-rollback-contract.machine.json`。它明确区分 `enhancement` 与 `passthrough`，防止把仅有诊断 flag 的支撑路由误写成完整旧页面。

## 验证

`tests/e2e/feature-flags.spec.js` 覆盖查询优先级、13 路由独立 key、冻结内容清单、增强项消失与 passthrough 内容保持。每个路由都有独立环境变量入口，不再复用其他页面的灰度状态。

## 后续

先内部环境，再小流量。观察性能、错误率和任务完成率后逐路由扩大；本 ADR 不代表已经完成真实流量灰度或两个稳定发布周期。
