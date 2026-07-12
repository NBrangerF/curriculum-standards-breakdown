# StandardCard 交互质感硬化

日期：2026-07-12

## 修复的问题

- 标准编码默认藏在悬停 footer 中，不利于快速扫描。
- footer 通过 `max-height` 与 padding 动画展开，悬停会改变卡片高度并推动长列表。
- 展开按钮和复制按钮在桌面端仍有 32px / 28px 目标。
- 更多操作菜单没有显式 menu 语义、焦点进入或 Escape 焦点返回。
- 多处使用 `transition: all`，无法约束实际发生的动画属性。

## 当前实现

- 标准编码以紧凑 monospace 元信息常驻卡片头部。
- 删除会导致布局跳动的悬停 footer；复制操作进入头部 hover/focus 动作区，移动端仍由更多菜单提供。
- 复制、展开和更多操作统一为 44px。
- 更多操作改用 Phosphor `DotsThree`，补齐 `aria-expanded`、`aria-controls`、`role=menu/menuitem`、打开后首项聚焦和 Escape 返回。
- 菜单通过共享 Floating UI layer Portal 到 `document.body`，使用 `autoUpdate + flip + shift`；不再受卡片 `overflow: hidden` 裁切，并支持上下方向键、Home/End 循环导航。
- 卡片、操作和文字只过渡 transform、opacity、color、border-color 与 box-shadow；reduced-motion 下取消位移。
- 卡片悬停只产生 1px 抬升和低对比度扩散阴影，不改变任何列表几何尺寸。

## 证据

- Tooltip 与标准卡菜单焦点任务流多轮通过。
- 新增独立 E2E 验证菜单焦点进入和 Escape 返回，核心 E2E 总数变为 44。
- 桌面局部 normal/hover 截图人工检查了编码、标签、操作密度与正文颜色。
- 打开态截图确认菜单位于触发器下方、未裁切且不改变卡片几何尺寸。
