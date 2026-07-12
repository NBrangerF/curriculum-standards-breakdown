# kebiao V2 人工读屏与辅助模式签字记录

日期：2026-07-12
状态：待人工执行与签字

## 自动前置证据

- axe / 辅助模式：27/27，critical / serious 为 0；覆盖 Tooltip Portal、H4G 队尾虚拟节点、forced-colors 与 200% 显示缩放代理。
- 13 路由 forced-colors + 390 × 844：Content Boundary、焦点、可见焦点变化与横向溢出通过。
- 13 路由 200% 显示缩放代理：devicePixelRatio 2、720 × 450 CSS viewport，无横向溢出。
- 13 路由 × 5 视口本地基线：65/65，Content Inventory 缺失 0，console/page error 0。
- 两档移动视口触控候选 3,186，低于 44 × 44px 为 0；面包屑内联文字例外 10 项已在 manifest 显式记录。
- 五档全视口触控候选 9,009，低于 44 × 44px 为 0；自动验证现对全部视口阻断。
- H4G 390 组审核队列使用虚拟化，五档只挂载 9 至 13 项；自动键盘测试已验证首项 → 第 390 项 → 首项焦点闭环。
- 图谱拥有 DOM 等价关系列表；画布不是唯一操作路径。

这些自动证据不能替代 VoiceOver/NVDA 的真实语音输出、浏览顺序和使用者判断。

## 环境记录

| 项目 | 值 |
| --- | --- |
| 测试 URL / build | 待填写 |
| Git SHA / source fingerprint | 待填写 |
| macOS / Safari / VoiceOver 版本 | 待填写 |
| macOS / Chrome / VoiceOver 版本 | 待填写 |
| Windows / Chrome 或 Edge / NVDA 版本 | 待填写 |
| 测试人 | 待填写 |
| 日期 | 待填写 |

## Safari + VoiceOver 主任务流

| 步骤 | 预期 | 结果 | 备注 |
| --- | --- | --- | --- |
| Home 从页面顶部进入 | 宣读 kebiao 品牌、主导航、H1；跳转主内容可用 | 待测 | |
| 进入 Search，对比数学第二学段 | 筛选、当前条件、结果列和复制链接名称清晰 | 待测 | |
| 打开 Standard | 编码、标题、正文、收藏、复制和页内目录顺序合理 | 待测 | |
| 打开关系图谱 | 先得到工作台说明；可进入 DOM 邻接关系而不依赖 Canvas | 待测 | |
| 选择邻接节点 | Inspector 名称、编码、关系数、来源与 live announcement 一致 | 待测 | |
| 收藏并进入 Collection | Popover / Dialog 名称、焦点返回、清单内容正确 | 待测 | |

## Chrome + VoiceOver H4G 任务流

| 步骤 | 预期 | 结果 | 备注 |
| --- | --- | --- | --- |
| 进入 H4G Review | 工作台名称、统计、过滤器与审核队列可发现 | 待测 | |
| 搜索并选择队列项 | 选择变化和当前记录标题可理解 | 待测 | |
| 从首项按 End 到队尾 | 宣读第 390 项完整名称与 pressed 状态；焦点不丢失，页面外层不跳动 | 待测 | |
| 从队尾按 Home 回首项 | 回到第 1 项并宣读完整名称与 pressed 状态 | 待测 | |
| 修改审核状态 | pressed / selected 状态被宣读 | 待测 | |
| 操作 issue checkbox | 名称、选中状态与关联问题清楚 | 待测 | |
| 打开“清空本地”确认 | Dialog 标题、风险说明、取消与危险操作顺序清楚 | 待测 | |
| 取消 Dialog | 焦点返回原触发器 | 待测 | |

## Windows + NVDA 任务流

重复 Safari 主任务流，并额外确认：

- Browse / Focus Mode 切换不会丢失控件。
- Tabs、SearchField、combobox、checkbox 与 Dialog 使用 NVDA 预期角色和状态。
- 图谱 DOM 关系列表可用上下方向键、Tab 和 Enter 完成探索。
- Live region 不重复、不过度打断正文。
- H4G 虚拟队列在 End/Home 长距离跳转后仍能继续使用方向键和 Enter，不出现空白焦点。

结果：待测。

## 签字 Gate

- [ ] Safari + VoiceOver 无 P0/P1。
- [ ] Chrome + VoiceOver H4G 无 P0/P1。
- [ ] Windows + NVDA 无 P0/P1。
- [ ] 仅键盘任务流通过。
- [ ] 产品负责人确认字段、顺序、来源和审核流程。
- [ ] 所有 P2 问题已有 owner 和处理期限。

签字人：待填写
签字日期：待填写

## 当前执行说明

2026-07-12 曾尝试通过 Computer Use 启动 macOS 实机抽检，但机器处于锁屏状态，工具未绕过锁屏或修改系统设置。本记录保持“待人工执行”，不把 axe、Accessibility Tree 或键盘测试误写为 VoiceOver/NVDA 签字。
