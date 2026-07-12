# ADR-0002：首页叙事动效采用隔离式 GSAP ScrollTrigger

- 状态：Accepted
- 日期：2026-07-11

## 背景

主计划要求 GSAP 只负责首页一个叙事段，常规组件状态继续由 Motion 负责。GSAP 属条件依赖，必须先确认许可证、加载边界、清理方式和 reduced-motion 退化。

## 决策

采用精确版本 `gsap@3.15.0` 与 `@gsap/react@2.1.2`，仅由 `HomeNarrativeSection.jsx` 导入。该组件经 `React.lazy` 和 IntersectionObserver 延迟到距离视口 700px 时加载，构建为独立 chunk。

桌面且 `prefers-reduced-motion: no-preference` 时启用一个 ScrollTrigger timeline；它只控制步骤与坐标节点的 `transform`/`opacity`。移动端和 reduced-motion 不 pin、不 scrub，完整内容以静态布局显示。

## 许可证

GSAP 官方仓库说明整个工具集现在可免费用于商业用途，但 npm 元数据仍指向 GreenSock Standard “no charge” License；它不是 MIT/OSI 开源许可证。kebiao 使用原始未修改 npm 包，不再分发或派生 GSAP 源码，并在依赖审计中保留该许可证说明。

官方来源：

- https://github.com/greensock/GSAP
- https://github.com/greensock/react
- https://gsap.com/standard-license

## 约束

- GSAP 不保存业务状态。
- GSAP 与 Motion 不同时控制同一元素的 transform/opacity。
- 所有选择器通过 `useGSAP({ scope })` 限定，并在卸载时清理。
- 全站其他页面不得直接导入 GSAP。
- 首页首屏不得请求 GSAP chunk。
- reduced-motion 下不得创建 pin spacer。

## 结果

- 首页普通首屏资源记录中 GSAP/HomeNarrative 请求为 0。
- 接近叙事段后才加载独立 JS 47.47 KB gzip、CSS 1.41 KB gzip。
- 1400ms 程序化滚动采样：median 16.70ms、p95 17.70ms、83 帧中 2 帧超过 32ms。
