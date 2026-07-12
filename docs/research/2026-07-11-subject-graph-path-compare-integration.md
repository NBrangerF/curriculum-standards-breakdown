# kebiao Subject Graph、Path Mode 与 Compare Overlay 集成记录

- 日期：2026-07-11
- 路由：`/subjects/:slug?view=graph`
- 规格：`docs/specs/2026-07-11-subject-graph-path-compare-spec.md`
- 状态：Subject 首期图谱、无权真实最短路径和四节点关系对比通过集成验证

## Subject 平行视图

- List、原有 `view=compare`、新增 `view=graph` 三种视图共用原路由。
- 切换回列表只删除 graph-owned 参数，未知参数保留。
- Graph view 使用 Subject 页面已加载的单学科 standards，不调用 `loadAllStandards`。
- 数学实测只请求 `math.json`，未请求其他八个学科文件。
- 默认焦点为 `subject:math`，focusDepth 2；数学图为 175 实体、512 关系、164 标准。
- Subject 筛选在 LayerPanel 中锁定，学段、领域、关系层和焦点深度仍可调整。

## Path Mode

- renderer-neutral BFS 位于 `graphPath.js`。
- 只遍历当前启用的 `contains / progression / skill_alignment` 真实边。
- 无权最短路径允许从关系两端追溯，同时保留 forward / reverse / undirected 方向说明。
- 默认最大十步，防止意外遍历超大路径。
- `compareSelection` 前两个实体作为起终点；两个实体的分享链接默认打开 Path Mode。
- Path 在 WebGL 中高亮节点和边，同时提供完整有序文本列表和 provenance 字段。

真实验证路径：

1. `数学`
2. `包含领域`（`subject_slug+domain`）
3. `图形与几何`
4. `包含标准`（`domain+code`）
5. `MA-D2-GE-003`

路径长度为 2。关闭 contains 后正确显示“当前关系层不可达”；浏览器后退恢复 contains 和两步路径。

## Compare Overlay

- Inspector 支持“加入/移出对比”。
- `compareSelection` 去重、过滤不存在节点并限制为最多四项。
- 恶意/旧链接传入五个有效节点和一个无效节点时，URL 自动规范为前四个有效实体。
- 对比表提供实体类型、学段、领域、直接关系数、关系类型、共同关系和差异关系。
- 一项选择打开 Compare，恰好两项默认 Path，三至四项默认 Compare；用户可在邻接/对比/路径标签间切换。
- 画布用紫色标记 compare nodes，用金色标记 path nodes/edges；高亮状态由 GraphA11yController 管理，不写入 Sigma 私有业务状态。

## URL 与浏览器行为

验证通过：

- `view=graph`
- 锁定 `subject`
- `relationTypes`
- `selectedNode`
- `focusDepth`
- `compareSelection`
- 未知参数 `utm_source`
- 直接打开、刷新、后退、前进、切换 List/Compare/Graph

旧 `/subjects/math?view=compare` 的六学段矩阵保持原行为。

## 性能与可访问性

环境：Chromium 150，1440 × 900，本地 Vite dev server，warm cache。

| 指标 | 结果 |
| --- | ---: |
| Subject graph ready（含 250ms 稳定等待） | 1354.9 ms |
| 单学科数据请求 | `math.json` 1 个 |
| used / total JS heap | 15.9 / 26.6 MB |
| DOM elements | 304 |
| Subject 邻接 4 条实际虚拟行 | 4 |
| 共享 graph route lazy 增量 | 55.11 KB gzip |
| 移动端横向溢出 | false |
| 浏览器控制台 | 0 error / 0 warning |

- Path 使用有序 DOM 列表，不依赖 canvas。
- Compare 使用原生 table、th scope 和 dl。
- tabs 暴露 `role=tablist/tab` 与 `aria-selected`。
- Subject list 的长标准组使用 `content-visibility`，不删除原内容。
- 390 × 844 下 LayerPanel 默认折叠，Compare 表横向局部滚动，整页无横向溢出。

## 视觉升级

- Subject Hero 从旧深色通用 banner 升级为宽幅冷白研究界面、主题色空间轨道和大字号学科标题。
- 课程说明、内容结构、学段选择和领域列表保持原顺序，改为连续边界和高密度编辑式布局。
- 删除 Subject 页面的 emoji 标题与通用圆角卡片堆叠。

## 后续

- 专用 Before → Current → After progression path 呈现。
- Compare 与现有 compareLogic 的关系增减语义映射。
- `/skills/:code?view=graph` Skill detail 平行视图已在后续批次完成。
- GraphToolbar 从 workspace 内联结构抽成稳定 wrapper。
