# ADR-0004：学习脉络的知识点、Taxonomy 与先修关系域

- 状态：Accepted
- 日期：2026-07-12

## 背景

现有课程关系图由学科、领域、课程标准和可迁移能力构成，包含 `contains`、`skill_alignment` 与 `progression`。其中 `progression` 是经核验的学段进阶，而不是认知先修；当前生产数据没有任何显式 prerequisite。

用户任务不是浏览全量网络，而是回答“先掌握什么、它会解锁什么”，并在复杂 Taxonomy 中持续定位。因此不能把 taxonomy 父子、标准相邻导航或文本相似度伪装成学习依赖。

## 决策

建立独立 Learning Map 域：

- `knowledge_point`：可教、可掌握、可映射到课程标准的知识点；
- `taxonomy_node` 与 `taxonomy_parent`：仅表示分类位置和多父上下文；
- `prerequisite`：严格有向、经证据和审核批准的学习依赖；
- `standardCodes`：知识点与既有课程标准的对齐；
- `unlocks`：由 prerequisite 出边反向派生，不单独存储。

Taxonomy 采用搜索、breadcrumb 和 Miller Columns 做持续定位；默认学习关系只呈现直接前置、当前知识点和直接解锁。完整索引与可见投影分离，过滤不删除合法的依赖上下文。

## 语义边界

- `progression` 保持“学段进阶”名称和独立 Lens；
- `previous_code` / `next_code` 保持详情导航；
- `contains` 与 `taxonomy_parent` 不推断 prerequisite；
- 未审核数据只显示“当前尚无经证实的先修关系”，不能显示“无需先修”；
- 只有 `approved` prerequisite 可进入生产索引。

## Renderer 决策

默认使用 CSS layered DOM 完成可访问的三栏关系阅读。只有局部 DAG 的基准测试通过后，才允许采用 React Flow + Dagre 作为桌面增强 renderer；任何 renderer 都必须消费同一方向严格的 selector，并保留 DOM 等价路径。

## 验证

后续 validator 必须证明 prerequisite/taxonomy 分离、端点完整、无自环、无重复、无环、每条公开边具有理由与证据。Playwright、axe、键盘和读屏验收覆盖任务完成而不是画布存在。
