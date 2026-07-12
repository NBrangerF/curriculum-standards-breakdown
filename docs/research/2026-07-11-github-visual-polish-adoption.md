# kebiao GitHub 视觉与交互项目采用记录

日期：2026-07-11

## 原则

外部项目用于补足渲染、行为、动效和质量能力，不复制其品牌皮肤或重写 kebiao 已确认的信息架构。生产依赖必须有明确收益、独立包装层、bundle 门禁和降级路径。

## 当前决策

| 项目 | kebiao 使用位置 | 决策 | 边界 |
| --- | --- | --- | --- |
| [withmarbleapp/os-taxonomy](https://github.com/withmarbleapp/os-taxonomy) | 大规模知识图谱的全局到局部、邻接追踪与关系图例 | 设计参考 | 不导入 Marble 数据、文本、品牌或默认视觉 |
| [jacomyal/sigma.js](https://github.com/jacomyal/sigma.js) + [graphology/graphology](https://github.com/graphology/graphology) | 2079 实体 WebGL 图谱、图模型与算法层 | 已锁定生产依赖 | 仅在图谱路由 lazy load；必须保留 DOM 等价列表 |
| [adobe/react-spectrum](https://github.com/adobe/react-spectrum) 的 React Aria Components | Dialog、Popover、Button、SearchField、Checkbox、Tabs 等行为层 | 已锁定生产依赖 | 通过 `src/ui/primitives` 包装；不引入 Spectrum 视觉皮肤 |
| [motiondivision/motion](https://github.com/motiondivision/motion) | 产品状态、列表、抽屉、图谱 surface 过渡 | 已锁定生产依赖 | 不做滚动劫持，不与 GSAP 争夺同一元素属性 |
| [greensock/GSAP](https://github.com/greensock/GSAP) | 首页唯一 pinned narrative | 已锁定、延迟加载 | 只用于品牌叙事段；reduced-motion 降级 |
| [phosphor-icons/core](https://github.com/phosphor-icons/core) | 全站功能图标 | 已锁定生产依赖 | 按图标文件导入，不使用 barrel，不用 Emoji 代替图标 |
| [floating-ui/floating-ui](https://github.com/floating-ui/floating-ui) | Tooltip 的碰撞检测、翻转与边界定位 | 已锁定 `@floating-ui/dom@1.7.6` | 只作为 Tooltip 定位内核；Dialog/Popover 继续由 React Aria 负责，不引入 Floating UI React 状态层 |
| [emilkowalski/sonner](https://github.com/emilkowalski/sonner) | Toast 交互与质感参考 | 只参考原则 | kebiao 仅需单条、可撤销、非阻塞反馈；现有统一 Toast 更轻且已通过无障碍与 bundle 门禁 |
| [xyflow/xyflow](https://github.com/xyflow/xyflow) | 局部人工编排工作台候选 | 已复核，当前不引入 | 2079 实体全局图继续使用已通过基准的 Sigma；避免第二套 renderer、状态与 CSS runtime |

## 本轮落实

- 统一 Tooltip、Toast、Skeleton、Disclosure 的视觉、焦点、ARIA 与 reduced-motion 契约。
- Tooltip、Toast、Skeleton、Disclosure 完成首批 CSS Modules 隔离样板。
- Storybook 新增四类 primitive 的可操作状态页。
- 40 条 E2E、16 条 axe、12 张视觉基线全部通过；CSS Modules Wave 2 后主包自定义统计为 122.40 KB gzip。

## 2026-07-12 增量

- 将能力名称、摘要与 provenance 写入中立 GraphModel，Inspector 与搜索由编码优先改为名称优先。
- os-taxonomy 继续只提供“全局到局部、选择后解释”的交互原则。
- XYFlow 经最新项目能力复核后仍不进入生产依赖；详细证据见 `2026-07-12-graph-semantic-polish.md`。
- Tooltip 已升级为 `@floating-ui/dom` 驱动的按需 Portal 浮层，并以真实 Tab 焦点、360px 视口边界和 axe 契约验证；只采用轻量 DOM 定位内核，避免 React Aria Tooltip 将主包推近预算上限。
