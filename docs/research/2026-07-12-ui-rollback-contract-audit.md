# UI V2 路由回滚契约审计

日期：2026-07-12

## 结论

13 个 route flag 的正式语义是 enhancement-layer rollback，不是 13 套完整旧页面并行维护。

- 5 个 enhancement route：`home`、`subject`、`skills`、`skillDetail`、`standard`。
- 8 个 passthrough route：`search`、`glossary`、`collections`、`collectionDetail`、`print`、`styleguide`、`feedback`、`h4gReview`。

Passthrough 表示该路由没有独立的可关闭重型增强层；flag 仍提供诊断与独立环境控制，但 legacy 模式必须保持冻结内容与核心任务，不伪造一套未实现的旧 UI。

## 机器契约

`docs/baselines/2026-07-12-ui-rollback-contract.machine.json` 定义：

- 每个 route key 的 mode；
- enhancement route 被关闭的能力；
- legacy 模式应消失的按钮或文本；
- routeCount 与 13 个生产 key 的一一对应。

`validate:design-contract` 会拒绝缺 key、重复 key、非法 mode，或未声明 disabled enhancement 的增强路由。

## 发现并修复

Subject legacy 模式此前隐藏“列表视图”却保留“关系图谱”按钮。图谱不会真正加载，但按钮语义错误且无法明确返回列表。现改为：

- 列表视图：保留；
- 学段对比：保留；
- 关系图谱：legacy 隐藏；
- graph query 在 legacy 下仍强制回到列表。

## 浏览器证据

Feature flag E2E 对 13 条冻结路由逐一执行 `ui-v2=0`：

- `data-ui-version="legacy"`；
- source 为 query；
- 内容清单中的标题、非增强按钮、链接与文本保持；
- enhancement route 的声明项消失；
- passthrough route 内容保持。

4/4 feature flag 场景通过；完整 UI E2E 仍为 43/43。

## 尚未证明

契约与浏览器测试证明回滚语义可执行，不代表已经完成生产流量回滚演练、人工读屏或两个稳定发布周期。
