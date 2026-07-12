# ADR-0001：全局二维知识图谱采用 Sigma.js + Graphology

- 状态：Accepted for implementation
- 日期：2026-07-11
- 决策范围：kebiao 全局/学科图谱的首期二维 renderer 与图运行时

## Context

kebiao 需要在不改变现有信息架构的前提下增加课程关系导航。当前批准的完整 GraphModel 有 2079 个实体、6373 条可追溯关系，首期关系为 contains、progression、skill_alignment。renderer 必须满足千级 WebGL、选择反馈低于 100 ms、50 FPS 目标、lazy gzip 小于 300 KB，并与 DOM 等价关系列表同步。

## Decision

- 生产全局二维 renderer 使用 `sigma@3.0.3`。
- 图数据运行时使用 `graphology@0.26.0`。
- 页面只能依赖 kebiao 的 `GraphCanvas`/controller wrapper，不直接散落 import 第三方 API。
- GraphModel 保持 renderer-neutral；Sigma adapter 负责 GraphModel → Graphology 转换。
- `GraphA11yController` 是 renderer 同级控制面，不把 WebGL canvas 当作可靠 DOM 焦点。
- 关系筛选、选中节点与 focus depth 的 source of truth 是共享 controller/URL state，不是 Sigma 内部状态。
- 首期不采用 3D。

## Evidence

同一 1000/2345 真实 fixture 三轮 warm-cache 中位数：Sigma 首次可交互 43.9 ms、选择 26.4 ms、59.9 camera-loop FPS、19.3 MB used JS heap。引擎 gzip 增量 37.95 KB。详见 `docs/research/2026-07-11-graph-engine-benchmark.md`。

## Alternatives

- Cytoscape.js：性能门槛通过，但全量图内存明显高于 Sigma；保留为候补。
- AntV G6：411.24 KB gzip 超过生产目标。
- XYFlow：1000 节点选择中位延迟 208.7 ms；只保留为未来局部编辑工作台候选。
- 自研 Canvas/WebGL：缺少足以抵消维护、布局和交互成本的产品优势。

## Consequences

- 获得较小的生产图谱 chunk 和更好的千级拓扑余量。
- 需要自行实现 kebiao 节点视觉、LOD、GraphA11yController、Inspector、关系树与 URL 同步。
- Sigma 只负责呈现与相机；业务语义、provenance 和可访问文本不能进入 renderer 私有结构。
- 版本升级必须重新运行固定 fixture benchmark，不能直接跟随 major/alpha。

## Follow-up gates

- 在实际 `/skills?view=graph` 或平行视图中完成 lazy integration。
- 完成旧链接、未知参数、刷新、前进/后退与分享恢复的浏览器测试。
- 验证 Inspector 打开不触发全图重排。
- 在生产 wrapper 中运行键盘/读屏浏览器级测试。
