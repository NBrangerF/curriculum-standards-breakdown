# kebiao V2 人工读屏与辅助模式签字记录

日期：2026-07-12
状态：Safari + VoiceOver 结构/焦点任务已执行；听觉自然度与 Windows + NVDA 外部签字待完成

## 自动前置证据

- RC1 axe / 辅助模式：27/27，critical / serious 为 0；覆盖 Tooltip Portal、forced-colors 与 200% 显示缩放代理。
- RC1 13 路由 forced-colors、200% 缩放代理与 5 视口 65/65 基线全部通过。H4G 审核路由在完成审核后退役；RC2 以 12 个生产路由重新冻结。
- RC2 12 路由 × 5 视口：60/60，Content Inventory 缺失、横向溢出、console/page error 均为 0；8,808 个触控候选低于 44 × 44px 为 0。
- 两档移动视口触控候选 3,186，低于 44 × 44px 为 0；面包屑内联文字例外 10 项已在 manifest 显式记录。
- 五档全视口触控候选 9,009，低于 44 × 44px 为 0；自动验证现对全部视口阻断。
- 图谱拥有 DOM 等价关系列表；画布不是唯一操作路径。

这些自动证据不能替代 VoiceOver/NVDA 的真实语音输出、浏览顺序和使用者判断。

## 环境记录

| 项目 | 值 |
| --- | --- |
| 测试 URL / build | `http://127.0.0.1:4175` / kebiao V2 RC1 |
| Git SHA / source fingerprint | `3b2dac21b843906200cd134e4f21b21fb2f3f5a7` / `d44938a929bca8244dc56b69e8bf7c0ff1c380c6819b33b1f56e49535d7d4c6d` |
| macOS / Safari / VoiceOver 版本 | macOS 26.5.2 / Safari 26.5.2 / VoiceOver 已真实开启执行，结束后关闭 |
| macOS / Chrome / VoiceOver 版本 | 不再承担已退役 H4G 审核任务 |
| Windows / Chrome 或 Edge / NVDA 版本 | 当前设备为 macOS arm64，没有 Windows / NVDA 环境 |
| 测试人 | Codex Computer Use；语音自然度与 NVDA 仍需真实使用者签字 |
| 日期 | 2026-07-12 |

## 已完成的人工前置检查

- Safari Accessibility Tree：品牌、主导航、H1、筛选、学科入口、能力入口、使用说明和页脚顺序可发现；首页首个可交互项为“跳到主要内容”。
- Chrome Accessibility Tree：Home 的 landmark、名称、heading 与交互状态可发现。
- 真实仅键盘 Home：首个 Tab 命中“跳到主要内容”，Enter 将 URL 和焦点移动到 `#main-content`。
- VoiceOver 在系统设置中真实开启后，Safari 完成 Home、Search、Standard、Graph DOM 邻接关系与 Collection Dialog 结构/焦点抽检；未发现 P0/P1。
- Collection“新建清单”Dialog 首字段获得焦点，Escape 后焦点返回“新建清单”触发器。
- Computer Use 无法监听 VoiceOver 音频，所以中文停顿、发音和播报冗余仍须真人听觉签字；不将结构检查冒充语音自然度验收。

## RC 视觉复核

Home desktop/mobile、Standard Graph、Compare 与 Subject Math 未发现 P0/P1。以下 P2 不阻塞 RC，需产品负责人决定是否进入后续优化：

1. Subject Math Hero 首屏纵向留白偏多；owner：产品/视觉，期限：20% 灰度前决定。
2. Compare 顶部“调整对比条件”存在两处入口；owner：产品，期限：内部阶段观察后决定是否合并。
3. Standard 白色阅读区切入深色 Graph 工作台的明暗过渡较突然；owner：视觉，期限：50% 图谱灰度前复核。

## Safari + VoiceOver 主任务流

| 步骤 | 预期 | 结果 | 备注 |
| --- | --- | --- | --- |
| Home 从页面顶部进入 | 宣读 kebiao 品牌、主导航、H1；跳转主内容可用 | 结构/焦点通过 | 真人听觉自然度待签字 |
| 进入 Search，对比数学第二学段 | 筛选、当前条件和结果列名称清晰 | 结构/焦点通过 | 真人听觉自然度待签字 |
| 打开 Standard | 编码、标题、正文、收藏、复制和页内目录顺序合理 | 结构/焦点通过 | 真人听觉自然度待签字 |
| 打开关系图谱 | 可进入 DOM 邻接关系而不依赖 Canvas | 通过 | DOM 等价路径存在 |
| 选择邻接节点 | Inspector、关系与来源可发现 | 通过 | 未发现空白焦点 |
| 收藏并进入 Collection | Dialog 名称、初始焦点与焦点返回正确 | 通过 | Escape 返回触发器 |

## Windows + NVDA 任务流

重复 Safari 主任务流，并额外确认：

- Browse / Focus Mode 切换不会丢失控件。
- Tabs、SearchField、combobox、checkbox 与 Dialog 使用 NVDA 预期角色和状态。
- 图谱 DOM 关系列表可用上下方向键、Tab 和 Enter 完成探索。
- Live region 不重复、不过度打断正文。

结果：待测。

## 签字 Gate

- [x] Safari + VoiceOver 结构与焦点任务无 P0/P1。
- [ ] 真人确认 VoiceOver 中文语音自然度、停顿和播报冗余。
- [ ] Windows + NVDA 无 P0/P1。
- [x] 仅键盘任务流通过。
- [ ] 产品负责人确认字段、顺序、来源和审核流程。
- [ ] 所有 P2 问题已有 owner 和处理期限。

签字人：待填写
签字日期：待填写

## 当前执行说明

2026-07-12 在用户明确授权后，通过系统设置真实开启 VoiceOver，并在 Safari 完成上述结构与焦点任务，随后恢复为关闭状态。当前设备没有 Windows/NVDA；用户已允许外部验收，执行模板见 `docs/baselines/2026-07-12-nvda-external-acceptance.md`。本记录不把无法监听的语音质量或 macOS 结果误写为 NVDA 签字。
