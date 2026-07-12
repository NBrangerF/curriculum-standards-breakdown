# kebiao UI、动效与图谱外部项目审查

- 日期：2026-07-11
- 对应阶段：Foundation Gate / Phase 3 / Gate B2 前置研究
- 原则：外部项目按“字体、动效运行时、图谱呈现参考、图谱引擎候选”分层管理，不复制 demo 皮肤，不引入无证据关系。

## 当前决定

| 项目 | 许可证 | 本阶段状态 | kebiao 使用范围 | 明确不使用 |
| --- | --- | --- | --- | --- |
| [vercel/geist-font](https://github.com/vercel/geist-font) | OFL 1.1 | 已采用，本地托管字体文件与许可证 | 英文品牌、数字、标准编码和工作台界面排版 | 不把默认粗体 Geist 当作完整品牌设计 |
| [motiondivision/motion](https://github.com/motiondivision/motion) | MIT | 已采用，锁定 `motion@12.42.2` | 全站 reduced-motion 策略、进入/退出、布局与状态过渡 | 不做滚动劫持，不控制图谱相机业务状态，不与 CSS/GSAP 争夺同一 transform |
| [withmarbleapp/os-taxonomy](https://github.com/withmarbleapp/os-taxonomy) | ODbL 1.0 / CC BY-SA 4.0 / 上游来源许可 | 只读参考 | 年龄/学段轴、主题聚类、选中节点后追溯邻接关系、全局到局部的探索模型 | 不导入其数据、文本、关系、配色、图标、图片或视频 |
| [xyflow/xyflow](https://github.com/xyflow/xyflow) | MIT | Gate B2 已测，不进入生产依赖 | 未来可单独验证局部人工编排工作台 | 不用于千级全局图，不复制 demo 主题 |
| [graphology/graphology](https://github.com/graphology/graphology) + [Sigma.js](https://github.com/jacomyal/sigma.js) | MIT | Gate B2 胜出，锁定 `graphology@0.26.0` + `sigma@3.0.3` | renderer-neutral 图运行时、WebGL 全局二维图、标准局部关系图 | 页面不直接 import；不让 renderer 持有业务/URL source of truth |

## 从 os-taxonomy 吸收的呈现原则

1. 空间位置必须有解释：kebiao 使用学段轴、领域轨道和标准锚点，不使用无意义力导向漂浮。
2. 默认先给可读的局部结构，再允许进入全局视图；节点选中后只强调真实邻居。
3. 节点大小、标签密度和关系线可按缩放层级变化，但同一关系语义不能因视觉层级改变。
4. 3D 仅可作为未来实验；生产默认仍是可访问的 2D 图谱，并始终提供等价列表。

## Motion 接入约束

- 根级 `MotionConfig reducedMotion="user"` 统一尊重系统偏好。
- 使用 `LazyMotion + domAnimation + m`，避免普通页面默认加载完整动效能力。
- 首屏动效只使用透明度和短距离位移；内容在无动画时立即可见。
- 筛选、列表、矩阵、Inspector 的状态由 React/URL 管理；Motion 只做表现过渡。
- 50 个以上的节点或列表项不逐个做 React layout animation；图谱交由专门 renderer。

## Gate B2 结论与剩余集成验证

1. 同一 1000/2345 真实 fixture 的基准选择 Sigma + Graphology；详情见 `2026-07-11-graph-engine-benchmark.md`。
2. GraphA11yController、DOM 等价关系列表和增量 query contract 已有原型与自动校验。
3. 标准详情、Skills 与 Subject 图谱共用 lazy Sigma wrapper；生产 GraphCanvas chunk 为 40.51 KB gzip，低于 300 KB 门槛。
4. 独立全局/学科图谱视图仍需完成浏览器历史、分享恢复、Inspector 焦点回归和失败 fallback 的集成验证。

## 本阶段落地文件

- `public/fonts/geist/`：Geist Sans、Geist Mono 与 OFL 许可证。
- `src/components/KebiaoMotionProvider.jsx`：统一 Motion 与 reduced-motion 配置。
- `src/components/HomeHeroBanner.jsx`：首屏分层进入序列。
- `src/components/CurriculumCoordinateMap.jsx`：课程坐标图的节点与关系渐进呈现。
- `src/features/graph/`：Sigma wrapper、GraphA11yController、graph selectors 与 DOM 等价关系列表。
- `docs/adr/ADR-0001-graph-engine.md`：2D renderer 决策与升级约束。
