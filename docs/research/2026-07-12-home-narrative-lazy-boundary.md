# 首页品牌叙事 Lazy Boundary 质感硬化

## 问题

首页唯一品牌级 GSAP 叙事段按计划采用延迟加载，但 IntersectionObserver 尚未触发或 chunk 尚未返回时，原实现只渲染一块接近整屏的纯黑矩形。它不改变内容，却会在完整页面截图、低速网络和快速滚动时形成明显的视觉断层，也无法表达即将出现的内容结构。

## 实现

- 保留原有 lazy import、IntersectionObserver 和 chunk 边界，不把 GSAP 拉回首屏。
- 用与最终内容同构的三栏 Skeleton 替代空矩形：宽标题骨架、四级索引、学科→领域→标准→能力坐标轮廓。
- 占位态完全 `aria-hidden`，不会制造重复朗读内容。
- shimmer 只用于普通动效模式；`prefers-reduced-motion: reduce` 下停用动画。
- 滚入视口后仍由真实叙事组件替换，占位态从 DOM 移除。

## 验证

- 新增 E2E：初始边界存在结构化 placeholder；滚入视口后真实叙事可见且 placeholder 消失。
- 22 条核心流程与 12 条视觉基线联合通过。
- 13 路由 × 5 视口共 65 份最新基线通过；10,730 个可见交互目标低于 44px 为 0。
- `stylelint`、全 workspace typecheck、生产构建和 bundle budget 通过。
- 主包 136.34 KB gzip；Home Narrative 仍为 46.55 KB 独立延迟 chunk，图谱无首屏泄漏。

## GitHub 项目边界

本次没有引入新的运行时。继续使用 GSAP 只处理首页单一滚动叙事，并借鉴 Skeleton UI 的“布局同构”原则；不安装额外 skeleton 组件库，避免为静态占位增加重复主题和依赖成本。
