# kebiao V2 Phase 9 同日加速验收协议

日期：2026-07-12
授权：产品方明确要求不等待 48 小时，使用当前可完成的方式收口计划

## 证据边界

本模式替代 48h / 72h / 7d 的真实流量观察，但不把同日结果表述为长期 RUM 稳定性。最终结论是“同日加速生产验收通过”，证据由确定性 cohort、完整质量门、合成性能、Production READY、即时 Runtime Logs 和两次连续 100% 部署组成。

Analytics 与 Speed Insights 代码保留但不在本模式中开启：启用 Speed Insights 可能产生项目级费用，自定义 Analytics 事件也受账户方案与事件计费约束；同日验收使用 Lighthouse、Runtime Logs 和机器 Gate，不触发新的观测费用。

## 晋级序列

1. `production-default-off`：部署 V2 代码，所有增强关闭，验证 Production READY 与回滚查询参数。
2. `5%`：Home、Search、Collections 使用稳定匿名 cohort。
3. `20%`：累计加入 Subject、Standard、Skill Detail，并把前一组提升到 20%。
4. `50%`：累计加入 Skills Graph、Subject Graph、Compare、Path。
5. `100% cycle 1`：所有生产路由全开。
6. `100% cycle 2`：同一冻结提交再次完整部署，作为第二个连续加速稳定周期。

每一步都必须满足：

- Vercel deployment `READY`。
- error-level Runtime Logs 为 0。
- P0/P1 为 0。
- `?ui-v2=0` 与 `?ui-v2=1` 回滚探针通过。
- 完整 E2E / axe / visual / bundle / Lighthouse / baseline Gate 已通过。

## 构建矩阵

`npm run validate:rollout-build-matrix` 对 `default-off / 5 / 20 / 50 / 100` 分别生成真实 production bundle，并在 Chrome 中验证 12 个路由、命中/未命中 cohort、百分比、bucket、query override 和默认关闭的 telemetry。

## 机器结论

每个生产阶段使用 `mode=accelerated` 的 observation report。只有以下字段全部通过才输出 `advance`：

- `cohortBuildMatrixPassed`
- `fullQualityGatePassed`
- `syntheticPerformanceGatePassed`
- `productionReady`
- `rollbackProbePassed`
- `runtimeErrorCount=0`
- P0/P1 = 0

100% 还要求 `acceleratedStableCycles >= 2`。
