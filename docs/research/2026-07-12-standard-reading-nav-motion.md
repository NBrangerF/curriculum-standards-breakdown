# 标准详情阅读导航连续指示器

日期：2026-07-12

## 目标

在不改变标准详情页字段、内容顺序或锚点 URL 的前提下，让 sticky 页面目录真实反映当前阅读位置，并把原先瞬时出现的 CSS 下划线升级为连续、克制的空间反馈。

## 外部项目采用

- [Motion](https://github.com/motiondivision/motion)：复用项目已有 `LazyMotion + m` 运行时，以共享 `layoutId` 在目录项之间移动同一个指示器。
- 未引入新的动画库。AutoAnimate 不适合跨兄弟锚点共享元素，GSAP 保持只服务首页品牌叙事，避免产生第二套常规 UI 动效模型。
- `withmarbleapp/os-taxonomy` 继续只用于知识图谱层级浏览参考；本功能属于阅读导航，不套用其图谱工作台视觉。

## 实现契约

- `ReadingNavLink` 统一目录链接、活动状态和指示器渲染。
- 当前项使用 `aria-current="location"`，视觉指示器为 `aria-hidden`，不会制造重复朗读。
- 页面任何时刻只有一个 `[data-kb-reading-indicator]`。
- IntersectionObserver、锚点 id、滚动位置与内容顺序保持原样。
- 共享指示器使用高阻尼 spring；全局 `MotionConfig reducedMotion="user"` 会为减少动态偏好的用户即时完成位移。
- 指示器只改变 transform/位置并带轻量靛蓝辉光，不驱动正文进入动画。

## 验证

- E2E：点击“教学线索”后 URL 保留 `#standard-content`，活动链接切换为唯一 `aria-current="location"`，共享指示器同步更新。
- 全量交互/内容/回滚/响应式：52/52。
- axe/辅助模式：23/23，critical/serious 为 0。
- visual：15/15，新增 `standard-reading-indicator-desktop.png`。
- 五档基线：13 路由 × 5 视口共 65 张；10,730 个交互候选低于 44px 为 0，横向溢出、console error、page error 均为 0。
- bundle：main 138.37 KB gzip（预算 150 KB）；Motion 复用已有 lazy feature chunk，graph lazy leak 为 0。
- 依赖审计：0 vulnerabilities。

## 顺带稳定化

筛选展开态的 axe 场景此前会在面板透明度进入动画的中间帧采样，把最终满足 AA 的颜色与白底混合后误报对比度。该场景现与其他动态 a11y 场景一致，等待有限动画完成再审计；静止态 axe 已重新全量通过。
