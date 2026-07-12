# kebiao Gate B1 图谱数据就绪审计

- 日期：2026-07-11
- 数据范围：`public/data/by_subject/*.json`
- 标准记录：2025
- 自动化命令：`npm run audit:graph-data`、`npm run validate:graph-model`、`npm run build:graph-samples`
- Gate 状态：通过

## 批准进入首期 GraphModel 的关系

| 关系 | 全局去重边数 | provenance / 约束 | 决定 |
| --- | ---: | --- | --- |
| `contains` | 2063 | `subject_slug + domain`、`domain + code` | 批准 |
| `progression` | 788 | 显式 progression grade-band hint + 唯一同组目标 + 正向学段校验 | 批准 |
| `skill_alignment` | 3522 | `ts_primary` 或 `ts_secondary` | 批准 |

全局 GraphModel 共 2079 个实体、6373 条去重关系，所有展示边都有 `provenance.field`。全量 2025 个标准局部模型均通过节点唯一性、边端点和 provenance 校验。

## progression 映射审计

| 指标 | 数量 |
| --- | ---: |
| 含 progression 字段的记录 | 1170 |
| `progression_group_id` 分组 | 390 |
| 接受的显式正向边 | 788 |
| 完整连续链分组 | 363 |
| 同学段自指提示（拒绝） | 62 |
| 逆向或无序提示（拒绝） | 27 |
| 缺失或歧义目标（拒绝） | 0 |

`buildExplicitProgressionEdges` 不按数组顺序、代码排序或视觉位置推断进阶关系。只有同一 progression group 内目标学段唯一、起止节点不同且目标学段严格后移时才生成边；所有拒绝原因进入 diagnostics。

## 明确不展示的关系

| 数据现状 | 数量 | 决定 |
| --- | ---: | --- |
| 显式 related standard 记录 | 0 | 首期不展示 `related_standard` |
| 显式 prerequisite 记录 | 0 | 首期不展示 `prerequisite` |
| 推断 prerequisite | 0 | 必须持续保持为 0 |

`previous_code` 369 条和 `next_code` 386 条继续只服务详情页相邻导航，不解释为 progression、prerequisite 或 related_standard。

## 固定真实拓扑样本

采样方法为确定性的 entity-type seeded BFS。样本不使用随机图、不重复实体来凑数。

| 请求规模 | 实际实体 | 真实关系 | 说明 |
| ---: | ---: | ---: | --- |
| 200 | 200 | 372 | 包含三类获批关系 |
| 500 | 500 | 875 | 包含三类获批关系 |
| 1000 | 1000 | 2345 | Gate B2 主基准 |
| 5000 | 2079 | 6373 | 当前实体模型全量；不伪造额外节点 |

当前批准实体层只有 2079 个真实节点，因此“5000”档位用完整图而不是复制节点。fixture hash 和字节数记录在 `benchmarks/graph-engine/public/fixtures/manifest.json`。
## GraphModel 契约

```js
{
  id,
  version: 1,
  nodes: [{ id, type, label, meta, provenance }],
  edges: [{ id, source, target, type, directed, label, provenance }],
  meta: { focusNodeId, scope, inferredPrerequisiteCount }
}
```

renderer、等价关系列表和 GraphA11yController 读取同一模型。页面组件不得直接把源数据字段解释成新的关系语义。

## Gate B1 结论

- 100% 当前展示候选边可追溯。
- 推断 prerequisite 为 0。
- 首期关系集合批准为 `contains + progression + skill_alignment`。
- GraphModel、采样器和校验器不依赖 renderer。
