# H4G 大规模审核队列虚拟化

日期：2026-07-12

## 对应主计划

闭环 `8.11 H4G 审核页` 中“大列表和面板可在验证后使用 Virtual 与 resizable panels”的条件项。保留入口、390 组队列、比较字段、审核状态和导出流程，只改变队列的渲染与键盘导航方式。

## 真实规模与决策

- 审核包：390 个 group、1170 条 record、9 个学科；每组固定 3 条学段记录。
- 旧队列：首屏一次挂载 390 个复合按钮，因此满足“真实结果规模达到阈值”条件。
- 引入 [TanStack Virtual](https://github.com/TanStack/virtual) `@tanstack/react-virtual@3.14.5`，采用官方 [React Virtualizer API](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual)；精确版本写入 lockfile，许可证为 MIT。
- 不引入 `react-resizable-panels`：当前 21rem 桌面队列与移动端单列重排已通过五档布局验证；没有证据表明拖拽宽度能改善审核任务，额外 handle、触控和读屏状态反而会扩大交互面。以后只有在可用性观察证明固定宽度阻碍比较时再复审。
- `performance-smell-detection` 的具体规则面向 Java，不直接套用前端；采用其中“先测真实热点再优化”的原则，以审核包和浏览器 DOM 取证作为 Gate。

## 实现

- 队列滚动容器只渲染可见项和 6 项 overscan，动态测量每个复合按钮高度。
- group id 作为稳定 item key；筛选后总数和选中项继续来自原有 React state。
- 选中项使用 roving `tabIndex`，支持 `ArrowUp`、`ArrowDown`、`Home`、`End`。
- 长距离跳转先由 virtualizer 定位，再等待目标 DOM 节点实际挂载后恢复焦点；有限 12 帧重试避免虚拟节点尚未出现时焦点落回页面。
- 焦点使用 `preventScroll`，避免浏览器再次滚动外层页面；队列内部滚动仍由 virtualizer 唯一负责。
- 保留普通 button、`aria-pressed`、完整中文 accessible name 和审核详情 DOM，不把 Canvas 或不可读自绘层引入审核流程。

## 浏览器量化

| 视口 | 总组数 | 实际挂载队列按钮 |
| --- | ---: | ---: |
| 1440 × 900 | 390 | 13 |
| 1024 × 768 | 390 | 9 |
| 768 × 1024 | 390 | 9 |
| 390 × 844 | 390 | 9 |
| 360 × 800 | 390 | 9 |

桌面默认态队列节点由 390 降至 13，减少 96.7%。五档全站可见触控候选由 10,910 降至 9,009，减少 1,901；移动两档由 3,948 降至 3,186。两组变化来自不再挂载不可见审核按钮，不是删除信息或缩小触控区域。

## 验证

- 全量交互/内容/回滚/响应式：58/58。
- axe/辅助模式：27/27；滚至第 390 项后的虚拟队列 critical/serious 为 0。
- visual：21/21；默认工作台与队尾焦点状态均有独立基线。
- 五档基线：65 张；9,009 个默认态交互候选低于 44px 为 0，其中移动端 3,186 个失败为 0；horizontal overflow、console error、page error 均为 0。
- bundle：main 仍为 138.52 KB gzip；H4G 独立 lazy chunk 为 13.85 KB gzip；graph lazy leak 为 0。
- 依赖审计：0 vulnerabilities。
- 本地候选源码指纹：`d44938a929bca8244dc56b69e8bf7c0ff1c380c6819b33b1f56e49535d7d4c6d`。

## 视觉证据

- 默认工作台：`tests/e2e/visual.spec.js-snapshots/h4g-review-desktop-chromium-desktop-darwin.png`
- 队尾键盘焦点：`tests/e2e/visual.spec.js-snapshots/h4g-virtual-queue-end-desktop-chromium-desktop-darwin.png`
