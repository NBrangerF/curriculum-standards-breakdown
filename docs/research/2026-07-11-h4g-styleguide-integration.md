# H4G 与 Style Guide 视觉交互整合

日期：2026-07-11

## 结论

H4G 审核工作台与 `/styleguide` 已完成 kebiao V2 视觉和交互同步。两页保留原字段、顺序、筛选、审核和清空行为，仅升级视觉层级、状态表达、键盘行为、焦点管理、响应式与性能隔离。

## 设计结果

### H4G 审核工作台

- 采用高密度冷银工作台；队列、状态、来源、差异、问题标记和审核操作在 1440 × 900 首屏内形成清晰三栏层级。
- 队列项、状态选择和问题 checkbox 都有显式 pressed/checked 状态，不依赖 hover 或颜色。
- 清空本地数据改为 React Aria Dialog，支持焦点锁定、Escape 关闭和触发器焦点返回。
- 搜索可一键清空；工具栏、队列、详情和工作区补齐语义标签。
- 路由独立 lazy chunk：JS 15.77 KB / 5.20 KB gzip，CSS 22.16 KB / 4.41 KB gzip。

### kebiao Design System

- 移除 Ocean、Orca、暖纸朱红、古籍衬线与通用 AI 渐变概念，建立冷白坐标网格、石墨图谱表面和信号靛蓝的统一契约。
- 文档覆盖 Foundation、Primitives、States、Graph language 与 Brand，并提供紧凑/舒适密度切换。
- Button、Search、Checkbox、Tabs、Filter Chips、Disclosure、loading/empty/error、图谱关系和品牌禁用项都以可操作实例呈现。
- 路由独立 lazy chunk：JS 15.38 KB / 4.75 KB gzip，CSS 15.04 KB / 3.20 KB gzip。

## 外部项目与边界

| 项目 | 使用位置 | 借用内容 | 明确不使用 |
| --- | --- | --- | --- |
| `withmarbleapp/os-taxonomy` | H4G 密集工作台、图谱语言 | 大规模关系数据的分区、可扫描层级、局部聚焦原则 | 不复制品牌、不导入 taxonomy 数据、不引入其业务语义 |
| React Aria Components 1.19.0 | Dialog 与 Storybook primitive 契约 | 键盘、焦点、ARIA、跨设备行为 | 不引入 React Spectrum 视觉皮肤 |
| Phosphor Icons 2.1.10 | 搜索、导出、状态与操作图标 | 统一线性图标语法、按文件 tree-shaking | 不用 Emoji 代替功能图标 |
| Storybook React Vite 10.5.0 | Foundation 状态矩阵 | Button、SearchField、Checkbox、Tabs、Dialog 的隔离契约 | 不进入生产 runtime |

## 验证

- 最新全量 content parity、核心、响应式与回滚 E2E：40/40。
- 最新 axe 路由、图谱等价路径、Dialog、Popover 与 Toast：16/16，critical/serious 为 0。
- 当前视觉基线：12/12，包含 H4G、Style Guide、Subject Hero 与 Compare Workspace。
- 6 档宽度：两页无横向溢出。
- Storybook 构建：1763 modules，通过。
- Primitive Storybook 浏览器抽检：SearchField、Checkbox、Tabs、Dialog 键盘交互与 axe 通过。
- Bundle budget、Stylelint、TypeScript、`npm audit` 均通过；完整 audit 为 0 vulnerabilities。

## 人工 Gate

VoiceOver/Safari 或 NVDA/Chrome 的真实读屏任务流仍必须由人工执行并签字，自动 axe 与 DOM 语义检查不能替代该 Gate。
