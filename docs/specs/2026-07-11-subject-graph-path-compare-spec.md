# Spec: Subject Graph、Path Mode 与 Compare Overlay

## Objective

在不改变 kebiao 现有 Subject 信息架构、标准内容和 URL 旧含义的前提下，为 `/subjects/:slug` 增加平行 `view=graph`，并在共享图谱工作台中加入可追溯路径和最多四节点对比。

目标用户是需要从学科结构、学段进阶和能力映射中定位课程标准的教师与研究者。

## Assumptions

1. 不新增主路由；Subject 图谱只使用现有 `view` 参数。
2. Path Mode 只遍历当前启用的真实关系。
3. `compareSelection` 的前两个节点同时作为 Path 起终点。
4. Compare 最多四个实体；不修改现有 compareLogic 或标准数据。
5. Subject 页面列表和现有学段矩阵继续可用。

## Tech Stack

- React 18.3.1、React Router 7.1.1、Vite 6
- `sigma@3.0.3` + `graphology@0.26.0`
- Motion 12.42.2，只负责面板状态过渡
- 中立 GraphModel 与 GraphA11yController

## Commands

- Build：`npm run build`
- Data validation：`npm run validate:json && npm run validate:indexes`
- Graph validation：`npm run validate:graph-model && npm run audit:graph-data`
- Interaction contract：`npm run validate:graph-interaction`
- Dev：`npm run dev -- --host 127.0.0.1 --port 4173`

## Project Structure

- `src/pages/SubjectPage.jsx`：Subject 三视图入口与 URL 状态
- `src/features/graph/SkillsGraphWorkspace.jsx`：泛化为 Skills/Subject 共用 workspace
- `src/features/graph/graphPath.js`：renderer-neutral 最短路径选择器
- `src/features/graph/GraphPathPanel.jsx`：文本路径与复制入口
- `src/features/graph/GraphCompareOverlay.jsx`：最多四实体差异面板
- `scripts/validate-graph-interaction-contract.mjs`：路径、对比和 URL 纯逻辑校验

## Code Style

```js
const path = findShortestPath(model, {
    sourceId,
    targetId,
    relationTypes
})

if (!path) return { nodes: [], edges: [], status: 'unreachable' }
```

- selectors 不依赖 React、DOM 或 Sigma。
- 页面不直接 import Sigma/Graphology。
- 重复查找使用 Map/Set，不在 edge reducer 或 BFS 内做数组线性搜索。
- URL 是可分享业务状态 source of truth；Motion 不保存选择状态。

## Testing Strategy

- 纯逻辑：真实 GraphModel 上验证可达路径、不可达路径、关系层约束、compareSelection 去重与上限。
- Build：验证 Subject graph 继续保持 lazy chunk。
- Browser：列表/对比/图谱切换、刷新、后退前进、直接分享、未知参数、移动端无横向溢出。
- Accessibility：Path 必须有有序文本列表；Compare 必须是可读表格/定义列表；canvas 不是唯一内容。
- Performance：Subject 数据只使用已加载的单学科 records，不重新加载九学科。

## Boundaries

- Always：所有路径边可追溯；保留旧 URL；提供 DOM 等价内容；尊重 reduced-motion。
- Ask first：新增关系语义、改变数据 schema、改变 compareLogic、引入新依赖。
- Never：按数组顺序推断 prerequisite；用随机图；把画布作为唯一内容；复制外部项目皮肤或数据。

## Success Criteria

1. `/subjects/math?view=graph` 只加载数学标准并显示 Subject 焦点图。
2. List、Compare、Graph 三视图可切换，旧 `view=compare` 行为不变。
3. compareSelection 去重、最多四个节点，可刷新和浏览器历史恢复。
4. 两个已选节点之间能显示真实最短路径；禁用所需关系后正确显示不可达。
5. Path 有有序文本关系链和可复制分享链接。
6. Compare Overlay 显示实体类型、编码、学段/领域、直接关系数和共同/差异关系类型。
7. 桌面与 390px 移动端无横向溢出，控制台 0 error。
8. build、数据、GraphModel、interaction contract 和 secret scan 全部通过。

## Open Questions

- Path 的带权语义排序与 Before/Current/After 专用视图留到下一迭代；首期使用无权最短真实关系链。
- Compare 与旧学段矩阵的业务合并暂不进行；两者保持平行能力。
