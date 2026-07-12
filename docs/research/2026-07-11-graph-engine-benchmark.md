# kebiao Gate B2 图谱引擎基准

- 日期：2026-07-11
- 环境：Chromium 150，1440 × 900，本地 Vite dev server
- 数据：同一 1000 实体 / 2345 真实关系固定 fixture
- 方法：每个候选连续三次 warm-cache 运行，表内为中位数；另保留首次冷启动样本
- 状态：2D renderer 技术选择完成；Gate B2 的页面历史恢复集成测试仍在后续任务中

## 候选与边界

| 候选 | 精确版本 | 许可证 | 在 kebiao 中评估的角色 |
| --- | --- | --- | --- |
| Sigma.js + Graphology | 3.0.3 + 0.26.0 | MIT + MIT | WebGL 全局二维图 + 中立图运行时 |
| Cytoscape.js | 3.34.0 | MIT | 交互丰富的替代 renderer |
| AntV G6 | 5.1.1 | MIT | 一体化图可视化候选 |
| XYFlow | 12.11.2 | MIT | 局部节点工作台候选，不默认承担千级全局图 |

版本和许可证由各候选的 package metadata 与官方仓库交叉核验。所有候选只放在隔离 benchmark workspace，未在测量前污染生产 bundle。

## 1000 节点三轮中位数

| 引擎 | 首次可交互 | 节点选择 | camera-loop 中位 FPS | used JS heap | total JS heap | 结论 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Sigma + Graphology | 43.9 ms | 26.4 ms | 59.9 | 19.3 MB | 32.7 MB | 通过，领先 |
| Cytoscape.js | 180.3 ms | 27.9 ms | 59.9 | 46.4 MB | 135.0 MB | 通过，候补 |
| AntV G6 | 301.8 ms | 33.5 ms | 59.9 | 95.3 MB | 192.3 MB | 性能通过，bundle 未过 |
| XYFlow | 369.3 ms | 208.7 ms | 59.9 | 83.2 MB | 186.6 MB | 选择延迟未过 100 ms |

一次独立冷启动 Sigma 样本为 437.0 ms 首次可交互、27.2 ms 选择、59.9 FPS、11.7 MB used heap，仍大幅低于 2.5 秒门槛。

## 生产 lazy chunk gzip 增量

| 引擎 | engine chunk gzip | 300 KB 门槛 |
| --- | ---: | --- |
| Sigma + Graphology | 37.95 KB | 通过 |
| XYFlow | 106.03 KB JS + 2.67 KB CSS | 通过 |
| Cytoscape.js | 142.36 KB | 通过 |
| AntV G6 | 411.24 KB | 未通过 |

数值来自同一 Vite build 的手工 engine chunks；React 和 benchmark shell 不计入引擎增量。

加入语义布局、共享路径高亮、相机聚焦和可播报的 WebGL failure fallback 后，生产 `GraphCanvas` lazy chunk 为 40.51 KB gzip；CSS chunk 0.63 KB gzip。未打开图谱时不会请求这些 chunks。

## 全量图 warm-cache 对照

当前全量真实实体图为 2079 节点 / 6373 边，不能诚实构造 5000 个实体。

| 引擎 | 首次可交互 | 选择 | camera-loop FPS | used heap | total heap |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sigma + Graphology | 69.4 ms | 30.0 ms | 59.9 | 13.7 MB | — |
| Cytoscape.js | 418.2 ms | 48.9 ms | 59.9 | 183.9 MB | 248.9 MB |

## 选择

1. 批准 Sigma.js 3.0.3 + Graphology 0.26.0 作为生产全局二维图 renderer/runtime。
2. 保留 Cytoscape.js 为已测候补，不进入首期生产依赖。
3. G6 因 lazy chunk 超出 300 KB 目标，不进入生产默认路径。
4. XYFlow 不用于千级全局图；未来若需要人工编排的局部关系工作台，可单独复测。
5. 首期不做 3D。3D 不增加课程标准检索与关系追踪的核心信息，且会增加空间导航、移动端和可访问性成本；待 2D Path/Compare 模式验证出明确缺口后再立项。

## 可访问性与 URL 前置验证

- `GraphA11yController` 与 renderer 共用 GraphModel、selectedNode、relationTypes 和 focusDepth。
- `GraphFallbackList` 提供 DOM 等价关系列表、方向/关系/实体类型文本和 aria-live 宣告。
- 键盘控制原型支持前后邻居、父级与子级移动。
- 图谱 query adapter 增量支持 `view, subject, gradeBand, domain, relationTypes, selectedNode, focusDepth, compareSelection`。
- 旧 filters 与未知参数在 graph state round-trip 中保留。
- 自动化命令：`npm run validate:graph-interaction`。

## 测量限制

- 这是本地开发服务器基准，不是生产 RUM。
- camera-loop 通过 requestAnimationFrame 驱动引擎相机并计算中位帧间隔，不能等同于逐帧 compositor trace。
- warm-cache 三轮用于稳定比较；冷启动模块下载、网络和低端移动设备需在生产 lazy route 上继续测量。
- 浏览器 heap 会受同一 session 的 GC 时机影响，因此同时报告 used/total，并把 250 MB 当目标而非精密容量证明。
