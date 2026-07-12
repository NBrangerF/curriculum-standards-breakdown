# kebiao V2 Phase 9 渐进上线 Runbook

日期：2026-07-11

当前执行状态（2026-07-12）：RC2 已冻结；Phase 9 安全部署控制已加入 `codex/kebiao-v2-rc2`。Preview 环境全量开启 V2，Production 未部署、未修改，仍为旧版。5% 生产阶段必须在启用观测能力并获得明确生产发布授权后开始。

观测实现与隐私字段契约：`docs/releases/KEBIAO_V2_PHASE9_OBSERVABILITY.md`。Analytics 与 Speed Insights 均默认关闭；不得在未确认数据采集边界时仅为满足 Gate 而开启。

## 上线原则

逐路由、可回滚、先内部再小流量。视觉升级不得改变正式内容、公开 URL 或图谱 provenance。旧 UI 至少保留两个稳定发布周期。

生产构建 fail-closed：缺少 V2 环境配置时，所有增强默认关闭；开发环境默认开启。Preview 设置 `VITE_UI_V2_DEFAULT=true` 用于全量内部验收。Production 使用各路由 `VITE_UI_V2_*` 值控制，可取 `false`、`true` 或 `0`–`100` 的百分比；百分比分桶基于只保存在浏览器本地的匿名稳定 ID，不采集身份信息。同一使用者随百分比扩大保持在原有 cohort。

## 发布顺序

1. 内部：`home`、`collections`、`glossary`、`feedback`、`print`、`styleguide`。
2. 5%：Home、Search、Collections；观察至少 48 小时。
3. 20%：Subject、Standard、Skill Detail；观察至少 72 小时。
4. 50%：Skills Graph、Subject Graph、Compare、Path；观察至少 7 天。
5. 100%：仅在两个连续稳定发布周期后执行。

## 每阶段 Gate

发布前：

- `npm run test:e2e`
- `npm run validate:rollout-contract`
- `npm run validate:observability-contract`
- `npm run test:a11y`
- `npm run test:visual`
- `npm run validate:ui-baseline`
- `npm run compare:ui-baseline`，并确认 `candidateMeetsV2Contract=true`
- `npm run check:bundle`
- `npm run test:lighthouse`
- `npm run typecheck`
- `npm audit`

当前 `https://www.kebiao.org` 捕获结果为 `candidateMeetsV2Contract=false`：线上仍是旧“课标罗盘”。在 V2 获得明确发布授权并重新捕获前，不得把当前生产域名视为 V2 灰度起点。

观察指标：

| 指标 | 通过阈值 | 回滚阈值 |
| --- | ---: | ---: |
| 路由错误率 | 不高于旧版 +0.1pp | 高于旧版 +0.3pp |
| 核心任务完成率 | 不低于旧版 -2% | 低于旧版 -5% |
| p75 LCP | ≤ 2.5s | > 3.0s |
| p75 INP | ≤ 200ms | > 300ms |
| CLS | ≤ 0.1 | > 0.15 |
| 图谱失败/降级率 | < 1% | ≥ 3% |
| 前端异常会话 | 不高于旧版 +10% | 高于旧版 +25% |

## 回滚

- 单用户临时回滚：URL `?ui-v2=0`。
- 浏览器持续回滚：设置 `localStorage` 对应 route flag 为关闭。
- 环境级回滚：关闭目标路由的 V2 环境 flag，重新发布静态资源。
- 图谱单独回滚：保留标准阅读、收藏、编码复制和 DOM 等价关系列表，只关闭增强 renderer。
- 回滚后记录触发指标、路由、浏览器、数据规模与时间，修复通过同一阶段 Gate 后再恢复流量。

### 路由语义

- Enhancement rollback：Home、Subject、Skills、Skill Detail、Standard，关闭叙事或图谱增强，保留核心任务。
- Passthrough rollback：Search、Glossary、Collections、Collection Detail、Print、Style Guide、Feedback。flag 用于逐路由诊断和环境控制，内容/任务保持，不声称存在第二套旧页面。
- 权威机器契约：`docs/baselines/2026-07-12-ui-rollback-contract.machine.json`。

## 人工验收清单

签字模板：`docs/baselines/2026-07-12-screen-reader-manual-signoff.md`。

- Safari + VoiceOver：Home → Search → Standard → Graph DOM relation list → Collection。
- 仅键盘：移动导航、Tabs、SearchField、Dialog、图谱关系树和 Inspector。
- 200% 缩放、390px 宽度、reduced motion、强制高对比度抽检。
- 运行 `npm run validate:ui-baseline`，确认两档移动视口 `mobileTouchTargetFailureCount` 为 0；面包屑文字例外逐项可追溯。
- 产品负责人确认字段、顺序与来源与旧版一致。

## Legacy 删除条件

只有在 100% 流量完成两个连续稳定发布周期、人工读屏 Gate 签字、无 P0/P1 回归、回滚开关演练成功后，才允许单独提交删除回滚行为、foundation bridge、兼容 alias 与确有用途的旧组件。CSS Module 迁移本身不删除上述行为契约。
