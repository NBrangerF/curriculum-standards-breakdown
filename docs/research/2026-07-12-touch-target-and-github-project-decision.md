# Touch Target 与 GitHub 项目复核

日期：2026-07-12

## 本轮结果

- 13 条生产路由、390 × 844 与 360 × 800 两档移动视口，共审计 3,876 个可见交互目标。
- 小于 44 × 44px 的移动端目标：0。
- 五档全视口最新共审计 10,730 个可见交互目标，小于 44 × 44px：0；验证器已升级为全视口阻断。
- 10 个面包屑文字链接作为 `breadcrumb-inline-link` 语义例外进入 manifest；它们不是图标按钮或孤立控件，不以扩张行高破坏阅读密度。
- 自动门禁已写入 `validate-ui-baseline.mjs`，后续任一移动端目标回退到 44px 以下会使基线验证失败。
- StandardCard 取消 28/32px 桌面操作和 hover footer 后，原有桌面剩余项也归零；后续任一视口回退都会使基线验证失败。

## GitHub 项目决策

| 项目 | kebiao 中的职责 | 本轮决定 |
| --- | --- | --- |
| [withmarbleapp/os-taxonomy](https://github.com/withmarbleapp/os-taxonomy) | 大规模课程图谱的学科着色、年龄/学段轴、先修追踪、全局到局部披露参考 | 继续只借鉴交互模型；不复制其数据、文案或 ID，避免引入 ODbL / CC BY-SA 派生数据库义务 |
| [jacomyal/sigma.js](https://github.com/jacomyal/sigma.js) | WebGL 大规模节点/边渲染 | 保留为唯一图谱 renderer；不增加 XYFlow、Cytoscape 或 react-force-graph 的第二运行时 |
| [graphology/graphology](https://github.com/graphology/graphology) | 中立图数据结构、过滤、邻域、路径与索引 | 保留为 GraphModel 下层；DOM 等价关系列表仍独立于 canvas 提供 |
| [motiondivision/motion](https://github.com/motiondivision/motion) | 页面状态、布局、抽屉、视图切换和 reduced-motion | 保留为唯一常规产品动效运行时；不引入 react-spring 重复实现同一能力 |
| [greensock/GSAP](https://github.com/greensock/GSAP) | 首页叙事滚动编排 | 仅在独立 lazy chunk 内使用，不与 Motion 争夺同一元素的 transform/opacity |
| [floating-ui/floating-ui](https://github.com/floating-ui/floating-ui) | tooltip 的碰撞检测、翻转和边界定位 | 采用 `@floating-ui/dom@1.7.6` 作为轻量定位内核；Dialog/Popover 继续使用 React Aria，不引入第二套 React 状态层 |

## 质量判断

整体质感的下一阶段收益不来自继续堆叠 UI 库，而来自对既有运行时做更精确的使用：Sigma/Graphology 负责图谱规模与语义，Motion 负责状态反馈，GSAP 只负责首页叙事，CSS Modules 和 canonical tokens 负责视觉一致性。新增项目必须补足真实能力缺口，并同时通过包体、可访问性、reduced-motion 与回滚契约。

## Tooltip 质感硬化

生产 Tooltip 已从局部绝对定位 CSS 升级为 Floating UI DOM 驱动的按需 Portal：靠近视口边缘自动翻转与避让、真实 Tab 焦点建立 `aria-describedby`，进入动效遵守 reduced-motion。Style Guide 已加入真实 primitive 示例；两项键盘/视口测试连续 5 轮共 10 次通过。React Aria Tooltip 方案虽语义完整，但会把主包从 128.05 KB 推到 142.21 KB gzip；最终轻量定位方案在移动导航、StandardCard 硬化、共享浮层 hook 与首页结构化 lazy placeholder 合入后为 136.34 KB gzip，仍低于 150 KB 门禁，并继续由 kebiao primitive 包装焦点、计时器、ARIA 与 Portal 生命周期。

Tooltip 与 StandardCard action menu 现共享 `useFloatingLayer`，统一 reference/floating refs、fixed strategy、auto-update、offset、flip、shift、ready 状态与动画 placement；Floating UI 不再是单点接入，而是受 primitive 边界约束的浮层定位内核。
