# Phase 7 动效强化集成记录

日期：2026-07-11

## 完成范围

- 图谱相机聚焦调整为 620ms，并增加单一、跟随 Sigma framed 坐标的节点脉冲。
- Inspector 在选中实体变化时以 320ms 位移/淡入联动；业务状态仍由 GraphA11yController 与 URL 管理。
- 学科、能力总览、能力详情的列表/图谱切换使用原生 View Transitions 进行 420ms surface morph；不支持时直接切换。
- 图谱筛选重建时容器以 420ms transform/opacity 进入，不逐节点创建 tween。
- Standard Detail 展开局部图时，标准编码与标题通过原生 View Transition 连续进入图谱身份行。
- 首页新增唯一 GSAP 叙事段，用 Subject → Domain → Standard → Skill 解释结构化索引。
- MotionConfig、CSS、View Transition、Sigma 相机与 GSAP 均尊重 reduced-motion。

## 开源与外部项目

- Motion：常规布局、Inspector 和组件状态。
- GSAP + @gsap/react + ScrollTrigger：首页唯一滚动叙事，许可证见 ADR-0002。
- Sigma.js：相机聚焦与 framedGraphToViewport 坐标转换。
- 浏览器 View Transitions API：列表/图谱与 Standard→Graph 渐进增强。

## 浏览器证据

- 首页首屏未请求 HomeNarrative/GSAP；距离叙事段 700px 后才加载。
- 首页叙事滚动采样：median 16.70ms，p95 17.70ms，2/83 帧超过 32ms。
- reduced-motion：4 个步骤全部可见，pin spacer 0，功能完整。
- 390 × 844：无横向溢出，叙事退化为静态纵向结构。
- 图谱选择：pulse 坐标位于画布内；Inspector 和 URL 同步为选中标准。
- Standard→Graph：编码、标题、图谱身份行与键盘焦点均存在；控制台 0 error。

## 生产体积

| Chunk | gzip |
| --- | ---: |
| HomeNarrativeSection JS（含 GSAP） | 47.47 KB |
| HomeNarrativeSection CSS | 1.41 KB |
| GraphCanvas JS | 40.83 KB |
| GraphCanvas CSS | 0.77 KB |
| Shared GraphWorkspace JS | 10.10 KB |
| Shared GraphWorkspace CSS | 3.98 KB |
| main JS | 123.39 KB |

## 截图

- `output/playwright/kebiao-phase7-home-narrative-active.png`
- `output/playwright/kebiao-phase7-home-narrative-mobile.png`
- `output/playwright/kebiao-phase7-reduced-motion.png`
- `output/playwright/kebiao-phase7-standard-to-graph.png`
