# CSS Modules 样式隔离 Wave 2

日期：2026-07-12

## 目标

把 Wave 1 从复用组件扩展到完整生产路由。优先选择已有 route-level lazy chunk、视觉基线、axe 扫描和核心流程证据的中低耦合页面，保持信息组织与业务行为不变。

## 完整页面迁移

| 路由 | 新样式 owner | 关键跨边界契约 | 验证重点 |
| --- | --- | --- | --- |
| `/glossary` | `GlossaryPage.module.css` | `data-kb-component="glossary-result-count"` | 搜索、类别、结果计数、视觉、axe、响应式 |
| `/print` | `PrintPage.module.css` | `:global(.main-content)`、`data-kb-shell`、`data-kb-field="print-date"` | 屏幕预览、打印隐藏、动态日期 mask、axe |
| `/feedback` | `FeedbackPage.module.css` | field id/ARIA 保持不变 | 首错聚焦、输入保留、邮件 fallback、视觉、axe |
| `/collections/:id` | `CollectionDetailPage.module.css` | StandardCard 与 Toast 保持独立 owner | 并行加载、移除/撤销、统计、视觉、axe |

## 迁移规则

- 页面只导入自己的 `.module.css`，旧同名全局 stylesheet 被删除。
- 全局 `.container`、`.page-content`、`.btn` 只作为明确的 foundation compatibility bridge 保留。
- 测试不再查询视觉类名；结果计数、打印日期等使用 role 或 `data-kb-*` 契约。
- Stylelint 允许 CSS Modules 的 `:global()`，但只用于确实由 App Shell 拥有的全局结构。
- 四条路由保持原有 lazy import，不增加运行时依赖。

## 视觉审查

- Glossary 的屏幕阅读器 label 已在 Wave 1 正确隐藏；其视觉基线已在人工比对后更新。
- Wave 2 页面迁移本身没有产生新的视觉基线变更。
- Print 屏幕基线和打印媒体核心流程均保持。

## 全量门禁

- E2E：40/40。
- Visual：12/12。
- axe：16/16，critical/serious 为 0。
- 主包：122.40 KB gzip / 150 KB。
- GraphCanvas：39.87 KB gzip / 60 KB。
- SkillsGraphWorkspace：9.86 KB gzip / 30 KB。
- TypeScript、Stylelint、design contract、`git diff --check`：通过。
- `npm audit`：0 vulnerabilities。

## GitHub 项目决策

本 Wave 不新增生产依赖。React Aria、Motion、Sigma.js、Graphology、GSAP 与 Phosphor 已覆盖行为、动效、图谱和图标需求；页面样式隔离由 Vite 原生 CSS Modules 完成。新增 styled-components、Emotion、Tailwind 或第二套 primitive 会扩大迁移面并产生重复契约。

## 下一 Wave

1. CollectionsPage 与 StyleGuidePage。
2. SearchResultsPage 与 CompareView 的联合迁移，避免页面反向选择器。
3. Subject/Skills 页面与图谱 workspace 的边界整理。
4. 最后处理 Home、StandardDetail、H4G 等高耦合大样式 owner。
