# 标准序列关系预览

## 问题

主计划要求“相关标准 hover 或 focus 显示轻量预览”。标准详情页已有 `previous_code` / `next_code` 顺序关系，但页尾只显示编码。研究者在跳转前无法判断相邻标准的具体内容，序列导航的信息密度和交互质感均不足。

## 实现

- 页面加载后通过现有 `loadStandardByCode` 读取相邻标准，不增加新数据接口。
- hover 或键盘 focus 时显示编码、真实摘要、学科、领域和年级。
- 复用 kebiao `Tooltip` 与共享 `useFloatingLayer`，由 Floating UI 负责 Portal、flip、shift 和视口边界定位。
- 预览只提供非交互摘要；原 React Router Link 的 accessible name、跳转目标和 Tab 顺序保持不变。
- 链接新增克制的 1px hover 抬升、pressed feedback 和明确 focus ring；reduced-motion 下取消位移与过渡。

## 外部项目决策

- 采用 [floating-ui/floating-ui](https://github.com/floating-ui/floating-ui) 现有依赖作为几何定位内核。
- 不引入 Radix Hover Card、Tippy.js 或第二套 Popover 状态系统，避免重复 focus、Portal、theme 和 bundle 契约。
- 语义与视觉继续由 kebiao wrapper 控制，外部项目不提供默认皮肤。

## 验证

- 新增键盘 E2E：焦点进入上一条标准后，真实数据预览可见，原链接 accessible name 不变。
- 标准页 axe critical/serious 为 0。
- 13 路由 × 5 视口共 65 份基线通过；10,730 个交互目标低于 44px 为 0。
- Stylelint、全 workspace typecheck、生产构建和 bundle budget 通过。
- 主包 136.55 KB gzip，仍低于 150 KB；图谱 chunks 与 lazyGraphLeak 门禁不变。
