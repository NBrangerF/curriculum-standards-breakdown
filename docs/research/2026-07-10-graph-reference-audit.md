# kebiao 图谱外部参考审查

- 日期：2026-07-10
- 阶段：Master Plan Phase 1.5 / Gate B2 前的只读研究
- 结论：本阶段**没有**向产品代码、`package.json` 或数据集引入任何外部项目。

## 本地只读下载

以下参考项目下载至仓库外的临时只读位置 `/tmp/kebiao-reference-projects/`，不作为产品源代码的一部分：

| 项目 | 本地提交 | 观察到的可借鉴部分 | 许可与边界 |
| --- | --- | --- | --- |
| [withmarbleapp/os-taxonomy](https://github.com/withmarbleapp/os-taxonomy) | `96a7933` | 大规模知识点在空间里按学科分层、按年龄形成高度，以及“点开后追踪相邻关系”的探索隐喻 | 数据库为 ODbL 1.0，作者文本为 CC BY-SA 4.0，来源课程标准另有上游许可；**只借鉴交互问题与空间呈现，不复制数据、关系、文案、图标或视觉皮肤**。 |
| [graphology/graphology](https://github.com/graphology/graphology) | `249ec5e` | 有向/无向/混合图结构、事件化更新、布局与遍历工具；适合成为未来 `GraphModel` 的候选运行时 | MIT；可在 Gate B2 基准之后作为候选依赖重新审查。当前未安装。 |

`sigma.js` 的浅克隆在临时网络传输阶段未完成，已停止，不保留为可用本地参考。主计划中它仍是“Sigma.js stable v3 + Graphology”的**领先假设**，而不是本轮已批准依赖；Gate B2 必须重新取得精确版本、许可证与 gzip/性能数据后才能作出决定。

## 对 kebiao 的可用借鉴

### os-taxonomy

采用的问题意识，而不是实现或数据：

1. 大图不要默认把所有节点同权展示；先定位一个用户关心的局部范围。
2. 节点的空间位置必须有可解释编码。本项目以学段轴、领域轨道和标准锚点替代其年龄高度与学科颜色。
3. 选中节点的价值在于显示真实的邻接关系和来源，而不是生成漂亮的连线。
4. 3D 是探索实验，不是默认桌面方案，更不能成为唯一可访问路径。

### Graphology

采用它作为引擎候选所需的工程前提：

1. 先定义与渲染器无关的 `GraphModel`；数据转换不得散落在 React 组件中。
2. 使用稳定 ID、节点类型、真实关系类型、来源、置信/审核状态和过滤范围。
3. Inspector 的选择状态与布局状态分离；节点选择不触发全图重算。
4. 任何图层关闭或过滤都必须能在等价关系树中表达。

## 明确禁止的复用

- 不导入 Marble 的 JSON、文本、依赖关系、图片、视频、名称或默认配色。
- 不将 Marble 的 prerequisite 语义映射到 kebiao 的章节顺序、学段顺序或关联技能。
- 不在未验证关系证据时绘制方向箭头。
- 不复制 Sigma、G6、Cytoscape、React Flow 的 demo 皮肤作为产品界面。

## Gate B2 的依赖选择任务

只有在 Gate A 方向通过后执行：

1. 为 Sigma.js、Graphology、AntV G6、Cytoscape、React Flow 建立精确版本和许可证 ADR。
2. 用同一份本地 `GraphModel` 测试 200、500、1000 节点和相应关系数。
3. 记录首次可交互时间、选择延迟、平移/缩放中位帧率、峰值内存和 gzip 增量。
4. 验证图谱失效时的 `VirtualizedRelationTree`、焦点顺序、键盘移动和 reduced-motion。
5. 达到 Master Plan 的门槛后，才允许添加生产依赖并以 feature flag 接入一个既有页面。
