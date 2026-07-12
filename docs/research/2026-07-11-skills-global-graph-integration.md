# kebiao `/skills?view=graph` 全局图谱集成记录

- 日期：2026-07-11
- 阶段：Phase 6 / Skills 平行图谱视图
- 状态：该路由的首期全局二维图谱通过集成验证

## 信息架构边界

- `/skills` 的技能定义、使用说明、七领域框架和技能详情保持原有内容与顺序。
- 新图谱通过 `/skills?view=graph` 作为平行视图加入，不新建主导航层级。
- 只有用户进入 graph view 后才 lazy load 图谱 workspace、Sigma/Graphology 和九学科标准数据。
- “框架视图”始终可作为无 WebGL 的完整回退入口。

## 生产能力

- 全量 2079 实体 / 6373 条真实关系。
- 默认以 TS1 为焦点，仅显示一层 790 节点范围；不把完整画布当成不可读的静态总览。
- 学科、学段、领域、关系类型、焦点深度筛选。
- 标准编码、领域和技能实体搜索。
- 语义布局：技能位于中心能力环，学科位于外层轨道，领域围绕所属学科，标准围绕所属领域；空间位置有可解释含义。
- WebGL canvas、MiniMap、Legend、Inspector 和 VirtualizedRelationTree 共用 GraphA11yController。
- 选中节点自动聚焦相机；reduced-motion 下不执行相机过渡。
- Inspector 提供完整条目入口和 provenance 字段。
- WebGL 初始化失败时显示错误说明，同时保留 Inspector 与虚拟化等价关系列表。

## URL 与历史

已在真实浏览器验证：

- `view`
- `subject`
- `gradeBand`
- `domain`
- `relationTypes`
- `selectedNode`
- `focusDepth`
- 未知参数（测试为 `utm_source=qa`）

筛选、选择、刷新、直接分享、浏览器后退和前进均能恢复同一节点与图层状态。切回框架视图时只清理 graph-owned 参数，不删除未知或旧参数。

## 性能与 DOM

环境：Chromium 150，1440 × 900，本地 Vite dev server，warm cache。

| 指标 | 结果 |
| --- | ---: |
| 完整 graph route ready（含人为 500ms 稳定等待） | 1072.9 ms |
| used JS heap | 94.5 MB |
| total JS heap | 133.6 MB |
| 页面 DOM elements | 432 |
| 789 条 TS1 邻接关系实际渲染行 | 16 |
| 页面内选择 → Inspector | 39.9 ms |
| 选择后 graph stage reflow | false |
| GraphCanvas production JS gzip | 40.51 KB |
| Shared GraphWorkspace production JS gzip | 9.99 KB |
| 两个图谱 CSS chunks gzip | 4.31 KB |

加入 Path/Compare/Progression 后，合计 graph route lazy 增量约 55.11 KB gzip，低于 300 KB Gate B2 目标。dev resource transfer size 受 HMR/cache 影响，不作为生产字节证据；生产字节来自 Vite build。

## 浏览器与回退验证

- 桌面 1440 × 900：框架视图、全局图、筛选、深度、搜索、Inspector 通过。
- 移动 390 × 844：无横向溢出；图层面板默认折叠，画布更早进入视口；框架视图标题保持两行。
- WebGL 强制禁用：fallback 可见、Inspector 可见、等价关系树仍渲染 16 行窗口。
- 控制台：移除遗留 Google Fonts 请求后 0 error / 0 warning。

## 外部项目使用边界

- Sigma.js + Graphology：只通过 `GraphCanvas` 和 `sigmaGraphAdapter` wrapper 进入生产。
- withmarbleapp/os-taxonomy：只吸收“可解释空间轨道、全局到局部、选中后追溯关系”的呈现原则，不导入其数据或视觉皮肤。
- Cytoscape、G6、XYFlow：仍只存在隔离 benchmark workspace，不进入此生产路由。

## 后续

- Subject 平行图谱视图。
- Path Mode 与 Compare overlay。
- 多节点 compareSelection 与可分享路径。
- 全局搜索结果到图谱的跨路由定位。
- 生产 preview/RUM 下复测网络、INP 与低端设备。
