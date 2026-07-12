# Phase 8 质量硬化与 Gate C 自动化证据

日期：2026-07-11

## 结论

Phase 8 的自动化部分已经通过：组件状态矩阵、核心流程、响应式、路由回滚、axe、视觉回归、Lighthouse、bundle 预算、图谱规模/内存、类型检查、API 与数据契约均有可复现命令。VoiceOver/NVDA 仍是人工 Gate，真实小流量和两个稳定发布周期属于 Phase 9，不能由本地自动化替代。

## 外部项目与职责边界

| 项目 | 精确版本 | 许可证 | kebiao 中的用途 |
| --- | --- | --- | --- |
| Storybook React Vite | 10.5.0 | MIT | Header、年级 Tabs、TS 徽标、收藏、异步状态、图谱图层控件的状态矩阵 |
| Storybook a11y | 10.5.0 | MIT | 组件级 axe 反馈 |
| Playwright | 1.61.1 | Apache-2.0 | 核心流程、6 档响应式、视觉基线、feature flag 回滚 |
| axe-core Playwright | 4.12.1 | MPL-2.0 | 关键路由 WCAG 自动扫描 |
| Lighthouse CI | 0.15.1 | Apache-2.0 | 三条生产关键路径的性能、a11y、最佳实践与 SEO 门禁 |
| vite-bundle-visualizer | 1.2.1 | MIT | 构建依赖结构审计，不进入生产 runtime |

以上项目只承担基础设施或专门引擎职责；kebiao 的品牌层级、课程语义、交互模型和图谱数据仍由本项目控制。

官方仓库：

- https://github.com/storybookjs/storybook
- https://github.com/microsoft/playwright
- https://github.com/dequelabs/axe-core-npm
- https://github.com/GoogleChrome/lighthouse-ci
- https://github.com/KusStar/vite-bundle-visualizer

## 自动化结果

### 组件、交互与可访问性

- Storybook 静态构建：1791 modules，构建通过；新增 Tooltip、Toast、Skeleton、Disclosure 可操作契约。
- 真实浏览器抽检：年级多选由 `H2` 变为 `H2、H1`；图谱关系层 checkbox/select/pressed 状态完整。
- Storybook 抽检故事：Grade Tabs 与 Graph Layer Controls 均为 `Violations 0`。
- Playwright content parity、核心、响应式与回滚：40/40 通过，其中 14 条由机器可读 Content Inventory 驱动。
- axe 关键路由、图谱 DOM 等价路径、Dialog、Favorite Popover 与 Toast：16/16 通过，critical/serious 为 0。
- 视觉基线：桌面首页、桌面标准图谱、学科课程坐标 Hero、对比工作台、移动首页、清单、清单详情、术语、反馈、打印预览、H4G 与 Style Guide 12/12 通过；首页允许最多 400 个抗锯齿差异像素，占画面低于 0.03%。
- 自动扫描只等待有限动画完成，忽略 loading spinner 等无限动画，避免等待超时或把中间透明帧误判为最终对比度。

### Lighthouse CI

| 路由 | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 100 | 100 | 100 | 100 | 657 ms | 0 | 0 ms |
| `/skills` | 100 | 100 | 100 | 100 | 570 ms | 0 | 0 ms |
| `/standards/MA-D2-GE-003` | 95 | 98 | 100 | 100 | 1565 ms | 0 | 0 ms |

门槛：LCP ≤ 2500ms、CLS ≤ 0.1、TBT ≤ 200ms、Accessibility ≥ 90；全部通过。

### Bundle 预算

| Chunk | Vite gzip | 预算 | 状态 |
| --- | ---: | ---: | --- |
| main | 122.40 KB | 150 KB | 通过 |
| GraphCanvas | 39.87 KB | 60 KB | 通过 |
| SkillsGraphWorkspace | 9.86 KB | 30 KB | 通过 |
| HomeNarrativeSection | 46.35 KB | 60 KB | 通过 |

生产主入口没有静态泄漏图谱 lazy chunk。

### 图谱规模与内存

生产获批图谱保持 2079 个真实实体、6373 条可追溯关系。5000 节点场景是基于获批 topology 的确定性克隆压力 fixture，只用于容量测试，不伪装为课程标准数据，也不进入生产数据。

| 节点 | 边 | 首次可交互 | 选择延迟 | 中位 FPS | JS Heap |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 200 | 372 | 125.1 ms | 32.8 ms | 59.9 | 6.9 MB |
| 500 | 875 | 31.4 ms | 26.8 ms | 59.9 | 12.8 MB |
| 1000 | 2345 | 39.5 ms | 27.8 ms | 59.9 | 8.6 MB |
| 5000 | 15283 | 161.3 ms | 79.5 ms | 59.9 | 73.0 MB |

所有 1000/5000 节点 Gate 通过；基准脚本会在完成后清理整个开发服务器进程组。

### 其余验证

- TypeScript：core、client、api、Vercel adapter 全部通过。
- API：core 6、client 2、api 22，共 30/30 通过。
- 图谱模型：2025 standards、9597 nodes、7572 edges、missing provenance 0。
- 全局图谱数据审计：推断 prerequisite 0，previous/next 明确保持 navigation-only。
- URL state、未知参数保留、图谱交互契约和 reduced-motion 契约通过。
- 完整 `npm audit`：0 vulnerabilities；Lighthouse CI 的旧 `tmp`/`uuid` 通过已验证的 npm override 升级。
- Stylelint：通过。
- 密钥模式扫描、外部 Google Fonts 扫描、`git diff --check`：通过。

## 可复现命令

```bash
npm run build-storybook
npm run test:e2e
npm run test:a11y
npm run test:visual
npm run check:bundle
npm run benchmark:graph
npm run test:lighthouse
npm run typecheck
npm run test:api
npm run validate:graph-model
npm run audit:graph-data
npm run validate:graph-interaction
npm run validate:motion-contract
npm audit --omit=dev
```

## 未自动化的 Gate

- VoiceOver（macOS/Safari）或 NVDA（Windows/Chrome/Firefox）人工任务流。
- 真实生产小流量的错误率、完成率与性能观察。
- legacy UI 连续保留并验证两个稳定发布周期。

因此，Phase 8 自动化完成不等于整个 Gate C 或 Phase 9 已经完成。
