# 搜索对比结果快速预览

## 问题

主计划要求搜索结果行在 hover 时显示快速预览，同时不能改变默认内容顺序。搜索页实际由 CompareView 和 StandardCard 组成；此前卡片 hover 只披露操作按钮，研究者需要展开卡片或进入详情页才能看到教学线索。

## 实现

- 为 StandardCard 增加可选 `quickPreview` 契约，默认关闭。
- CompareView 的多学段与多学科两种模式显式开启；学科页、技能页和清单页保持原行为。
- hover 或键盘 focus 正文链接时，显示真实 context / teaching tip / practice / assessment evidence 中首个可用字段，并附能力编码。
- 内容采用四行截断，浮层不改变卡片高度、结果顺序或滚动位置。
- 原结果 Link 的 accessible name、目标和键盘顺序保持不变。

## 定位修正

首版使用 `right-start`。实图检查发现正文 Link 横跨整张卡片，Floating UI 在右侧空间不足时翻转到链接左侧，导致浮层贴近或越过视口边缘。最终改用 `top-start`，使浮层对齐正文左缘，并继续保留 flip/shift 作为窄视口兜底。

## 外部项目与 Motion 边界

- 继续复用 [floating-ui/floating-ui](https://github.com/floating-ui/floating-ui) 作为 Portal、flip、shift 与 auto-update 定位内核。
- `motion` skill 明确建议简单 hover 不使用完整 Motion 组件；本次只使用现有 Tooltip 的 opacity/transform transition。
- 不引入新的 HoverCard、Popover 或动画运行时。

## 验证

- 新增 E2E：搜索结果 hover 后真实教学线索可见，原链接 accessible name 不变。
- 完整 E2E 47/47，通过搜索页视觉基线与 axe critical/serious 0。
- 13 路由 × 5 视口共 65 份基线通过；10,730 个交互目标低于 44px 为 0。
- Stylelint、全 workspace typecheck、生产构建与 audit 通过。
- 主包 136.65 KB gzip，低于 150 KB；图谱 chunks 和 lazyGraphLeak 门禁不变。
