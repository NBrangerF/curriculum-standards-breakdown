# Skill Detail 与 progression 路径集成记录

日期：2026-07-11

## 结论

`/skills/:code` 保留原有信息组织与内容顺序，完成视觉和交互升级；`?view=graph` 复用生产 GraphWorkspace，按技能根代码锁定真实课程标准范围。Inspector 新增专用“进阶”模式，只使用 GraphModel 中显式、定向且带 provenance 的 `progression` 边。

## 外部项目分工

- `withmarbleapp/os-taxonomy`：借鉴年龄/学段作为进阶维度、选择概念后追溯依赖的表达原则；不导入其数据或许可证内容。
- `sigma@3.0.3`：继续承担大规模 WebGL 图谱呈现。
- `graphology@0.26.0`：继续承担 renderer 之外的图结构容器。
- `motion@12.42.2`：继续承担工作台进入和状态变化；遵守 reduced-motion。

## 实现

- Skill Detail Hero 从旧版深色渐变改为冷白编辑式构图，以能力代码、超大标题和轨道图形建立识别度。
- 定义、表现证据、教师策略、进阶说明、子技能、关联标准的顺序和文字均未改变。
- 子技能区改为深石墨 taxonomy 表面，移除 emoji 标题与同质化白色卡片。
- 关联标准支持列表/关系图谱平行入口；图谱锁定当前技能，但保留学科、学段、领域筛选。
- `buildProgressionPath` 从当前标准沿显式 progression 边向前、向后建立确定性主链；不会从文本相似度推断先修关系。
- 进阶 Inspector 同时提供 Before → Current → After、完整序列、关系字段来源和去重后的显式旁路计数。
- 新增 `analysis=progression` query，复制链接、刷新和直接打开可恢复进阶模式；未知 query 仍保留。

## 验证证据

- 自动契约样本：真实 progression 主链 3 个节点，前后节点均存在，所有边均为 `progression` 且带 provenance。
- TS1 图谱：838 实体、3259 关系、789 条关联标准。
- 浏览器样本：`AR-H4G7-DA-RW-4F245C → AR-H4G8-DA-005 → AR-H4G9-DA-006`。
- 390 × 844：无横向溢出；进阶三段概览和完整序列可读。
- 控制台：0 error、0 warning（React DevTools 与 Vercel Analytics 开发日志不计错误）。
- 生产构建：GraphCanvas 40.51 KB gzip，GraphWorkspace 9.99 KB gzip，相关 CSS 4.61 KB gzip，graph lazy 合计约 55.11 KB gzip。

## 截图

- `output/playwright/kebiao-skill-ts1-list-v2.png`
- `output/playwright/kebiao-skill-ts1-progression-v1.png`
- `output/playwright/kebiao-skill-ts1-progression-mobile.png`
