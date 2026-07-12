# 术语表索引与阅读位置连续性

日期：2026-07-12

## 对应主计划

闭环 `8.9 术语表` 的三项要求：当前索引位置高亮、术语跳转/搜索/返回连续性，以及不把定义拆成更多卡片。

## 项目与依赖决策

- [Motion](https://github.com/motiondivision/motion)：复用现有 `LazyMotion + m`，为分类 underline 与当前术语索引使用共享 `layoutId`；全局 reduced-motion 自动退化。
- [React Router](https://github.com/remix-run/react-router)：`category`、`q`、`term` 成为 URL source of truth，浏览器前进/后退可以恢复筛选和阅读目标。
- 原生 IntersectionObserver：13 条术语不需要额外 ScrollSpy 运行时。观察器每次从完整可见列表计算最接近 activation line 的术语，避免只比较本次变化 entries 导致高亮漂移。
- 未引入 Lenis、scrollama、react-scrollspy 或虚拟列表。当前规模下，这些项目会增加滚动接管、bundle 与无障碍风险，而不会提升信息质量。

## 稳定标识与跳转

- 术语 ID 由英文名称规范化生成，例如 `assessment-evidence`，DOM id 为 `glossary-term-assessment-evidence`。
- 分类和搜索写入 URL；连续输入使用 history replace，分类与术语跳转使用 history push。
- sticky 当前索引为每个可见术语提供真实链接，当前项使用 `aria-current="location"`。
- URL 中存在 `term` 时，页面滚动到对应定义并把焦点交给 `h3`；相关术语跳转和浏览器返回均复用同一恢复路径。
- `related_terms` 保留原 schema code 文本，通过显式 alias 映射连接到已有术语；没有对应定义的 `grade_range` 继续保持非链接代码，不制造不存在的术语。

## 视觉与响应式

- 当前分类使用连续移动的短 underline。
- 当前术语同时使用索引左侧标记、浅靛蓝背景、文章边缘线与 `aria-current`，不依赖单一颜色。
- 桌面索引保持 sticky 并在自身区域滚动；980px 以下转换为横向索引轨道，不改变术语 DOM 顺序。
- 正文没有整体进入动画、抬升或滚动劫持。

## 验证

- 深链接 `category=教学字段&term=assessment-evidence` 会聚焦“评价证据”，并同步索引与文章 active 状态。
- 从评价证据跳转实践建议后，浏览器返回恢复原 URL、焦点与索引位置。
- 搜索与分类参数进入 URL，结果数量保持显式 live status。
- 390px 横向溢出为 0，所有术语索引链接高度至少 44px。
- 全量交互/内容/回滚/响应式：56/56。
- axe/辅助模式：25/25，critical/serious 为 0。
- visual：18/18，默认术语页与深链接活动态均有基线。
- 五档基线：65 张；10,910 个默认态交互候选低于 44px 为 0，其中移动端 3,948 个失败为 0；console/page error 为 0。
- bundle：main 138.52 KB gzip；GlossaryPage 独立 lazy chunk 4.50 KB gzip；graph lazy leak 为 0。
- 依赖审计：0 vulnerabilities。

## 测试稳定性修复

清单移动选择态原视觉测试使用 `scrollIntoView(center)`，字体完成后元素高度变化会带来约 3% 垂直漂移。现等待 `document.fonts.ready`，再按工具条固定视口顶边计算滚动位置；连续 3 轮视觉回归一致，没有通过放宽 diff 阈值掩盖问题。
