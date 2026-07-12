# 图谱语义与质感强化

日期：2026-07-12

## 问题

真实浏览器审查发现，全局图谱选中能力节点后，Inspector 以 `TS1` 同时作为标题与摘要。画布具备规模感，但详情层仍像内部调试工具，削弱了专业产品质感，也让搜索与读屏缺少人类可读语义。

## GitHub 项目取舍

| 项目 | 本轮用途 | 决策 |
| --- | --- | --- |
| [withmarbleapp/os-taxonomy](https://github.com/withmarbleapp/os-taxonomy) | 选中节点后呈现明确语义、由全局空间进入局部解释 | 继续作为设计参考；不复制数据、品牌或视觉皮肤 |
| [jacomyal/sigma.js](https://github.com/jacomyal/sigma.js) + [graphology/graphology](https://github.com/graphology/graphology) | 2079 实体 / 6373 关系 WebGL 图谱与中立图模型 | 保持现有生产依赖与 lazy 边界 |
| [xyflow/xyflow](https://github.com/xyflow/xyflow) | DOM 节点、MiniMap、Controls 与人工编排工作台候选 | 本轮不引入；它擅长 node-based editor，但不能替换已通过千级基准的 Sigma 全局图，第二套 renderer 会增加 CSS、状态和无障碍契约 |
| [xyflow/awesome-node-based-uis](https://github.com/xyflow/awesome-node-based-uis) | renderer / layout / graph utility 方案目录 | 只作未来调研索引，不形成依赖 |

## 落地

- `skills_meta.json` 的名称、tagline 与来源进入 GraphModel；URL 和节点 id 仍使用稳定编码。
- Inspector 改为“人类可读名称 → 编码 → 定义摘要”的层级。
- 图谱搜索结果改为名称主显示，类型与编码作辅助信息。
- 标准局部图使用同一语义规则，避免全局图与局部图产生两套表达。
- provenance 同时显示 source 与 field，不再只展示孤立的 `name_cn`。
- `GraphA11yController` 的 live announcement 和关系列表自动获得人类可读名称。

## 证据

- `validate:graph-interaction`：2079 节点、6373 边、语义布局与 TS1 元数据契约通过。
- 核心 E2E：19/19；完整 E2E：43/43。
- 视觉回归：12/12；axe：17/17。
- TypeScript、Stylelint、design/motion contract、bundle 与 `npm audit`：通过。
- 主包 128.00 KB gzip；GraphCanvas 39.97 KB；GraphWorkspace 10.88 KB；lazy graph leak 为 0。
- 浏览器截图：`output/playwright/kebiao-polish-human-readable-graph.png`。

本轮没有新增 npm 依赖，也没有改变信息组织、URL、筛选或图谱关系。
