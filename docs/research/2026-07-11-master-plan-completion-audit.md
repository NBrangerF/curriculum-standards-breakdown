# kebiao Master Plan 完成度审计

日期：2026-07-11

## 结论

主计划尚不能标记为全部完成。生产 UI、知识图谱、动效、自动质量门禁、Phase 3 primitive、CSS Modules 全量迁移、13 路由独立 flag 与增强层回滚契约已形成完整主干；当前缺口只剩生产基线、人工读屏签字和真实灰度观察。

## Phase 证据矩阵

| Phase / Gate | 当前证据 | 判定 | 缺口 |
| --- | --- | --- | --- |
| Phase 0 / Gate 0 | 13/13 路由机器清单；本地与 `https://www.kebiao.org` 各 65 张五档截图；checksum、源码/部署指纹、Content Inventory、overflow、console/page error 与生产/本地 comparison manifest | 自动取证完成 | 产品签字不可由代码证明；当前生产仍是旧“课标罗盘”，尚未部署 V2 |
| Phase 1 / Gate A | Gate A concept brief、Home/Graph/Mobile 概念图、用户确认概念方向、已实现 motion study | 通过 | 评审结论需继续保存在发布记录中 |
| Phase 1.5 | 依赖/许可证审计、Graph ADR、精确 lockfile、0 vulnerabilities | 通过 | 未来新增依赖仍需重复 Gate |
| Phase 2 | 单一 `design-tokens.css`；175 tokens；legacy 单向 alias；本地字体；Stylelint；Wave 1–5 已覆盖全部 page/component/graph feature；生产非模块 CSS import 为 0；仅保留 App/index foundation 与 Storybook CSS；设计契约阻止回流 | 完成 | 无 |
| Phase 3 | Storybook 状态矩阵；React Aria wrapper；Dialog、Popover、Button、SearchField、Checkbox、Tabs、Tooltip、Toast、Skeleton、Disclosure 生产包装与键盘证据 | 通过 | 后续新 primitive 仍须通过统一包装层 |
| Phase 4 | 13 路由保留；全局壳、详情、学科、搜索/对比、首页、能力、支撑路由均已换肤；机器 Content Inventory 与 21 张视觉基线；生产页面/组件/图谱 feature 已完成 CSS Modules 隔离 | 完成 | 无 |
| Phase 5 / Gate B1/B2 | 数据审计、真实 topology benchmark、ADR-0001、中立 GraphModel、query schema、a11y controller | 通过 | 无 |
| Phase 6 | GraphCanvas、Toolbar、Layer、Legend、Inspector、MiniMap、fallback、Path、Compare、URL state | 通过 | 无 |
| Phase 7 | ADR-0002、单一首页 GSAP、Motion、相机、morph、reduced motion、性能基准 | 通过 | 无 |
| Phase 8 | 58 E2E、27 axe/辅助模式、21 visual、Lighthouse、Storybook、bundle、graph capacity、typecheck、audit；13 路由 forced-colors 与 200% 显示缩放代理通过；五档默认态 9,009 个触控候选低于 44px 为 0，搜索展开态、清单选择态、移动术语索引与 H4G 虚拟队列显式通过键盘/axe/44px 契约 | 自动项通过 | VoiceOver/NVDA 人工任务流未签字；模板已建立 |
| Phase 9 | 13 个独立 route key、ADR-0003、rollout runbook、5 enhancement + 8 passthrough 机器契约、legacy 冻结内容 E2E | 回滚准备完成 | 真实内部/小流量、指标观察和两个稳定周期未执行 |

## 本轮修复的矛盾

1. `index.css` 与 `design-tokens.css` 曾重复声明同一 token；现已收敛为唯一 canonical 文件。
2. 术语、反馈、打印、Style Guide 和清单详情曾复用其他路由 flag；现已具备 13 个一一对应 route key 和环境变量。
3. Search/Compare 仍保留深色渐变、青色大块与旧式卡片矩阵；现已改为冷白坐标网格、sticky aligned matrix 和数据色索引。
4. Subject/Skill Hero 的 noise 与 fluid blob 已替换为 H1→H4 课程坐标路径。
5. Emoji、阻塞式 alert/confirm、页面直连 React Aria 和 Phosphor barrel import 已纳入自动失败门禁。
6. Favorite 清单弹层已使用 React Aria Popover/Dialog，并在首次打开时 lazy load；Escape、焦点返回、axe 和 bundle 均通过。
7. Tooltip、Toast、Skeleton、Disclosure 已统一为生产 primitive；真实页面、Storybook、键盘与焦点回归均已覆盖。
8. Search Results 的全局 `.filter-group-secondary` 曾污染首页筛选卡；Wave 3 隔离后首页恢复自身白色分栏，人工核对差异后更新单张桌面基线。
9. Skill Detail 的全局 `.subskill-name` 曾覆盖 Skills Overview 中的 SkillCard；Wave 4 同步隔离页面与卡片后删除 specificity 补丁，axe serious 对比度问题恢复为 0。
10. 全局图谱能力节点曾以 `TS1` 同时充当标题和摘要；现已接入技能元数据，名称、编码、摘要和来源形成明确层级，且读屏 announcement 同步人类可读名称。
11. 五档基线捕获发现 Skill Detail 在 390/360px 下由 Grid min-content 造成 72/102px 横向溢出；现以 child `min-width: 0` 修复，65 张重捕获后全路由 overflow 为 0。
12. 正式域名现已完成同规格只读捕获：65/65 截图与 V2 不同，65 次缺少 V2 main anchor、25 次首标题不匹配、260 项跨五档 Content Inventory drift、3 次 console error；因此生产被明确保留为旧版对照组，而非误报为 V2 已上线。
13. Gate C 新增 forced-colors 与 200% 显示缩放代理：前者验证 13 路由移动宽度、可聚焦控件和 focus 前后可见变化，后者验证 DPR 2 / 720px CSS viewport 重排；两项通过后 axe/辅助模式总数为 19。
14. 移动触控审计首次发现 4,710 个跨视口实例，主要集中在 StandardCard 技能链接/菜单和筛选标签；逐层修正后，390/360 两档共 3,876 个可见候选的低于 44 × 44px 数量为 0。10 个面包屑文字链接以显式语义例外保留，验证器现会阻断任何移动触控回退。
15. Tooltip 从常驻 DOM 的局部 CSS 定位升级为 `@floating-ui/dom` 驱动的按需 Portal 浮层，增加自动翻转、边界避让、真实键盘焦点语义和 reduced-motion；只引入定位内核，Dialog/Popover 仍由 React Aria 负责。新增测试在 360px 下验证视口边界，并连续 5 轮通过。
16. 标准局部图视觉测试曾在 Sigma 初始相机定位前截图，重复采样可产生 4% 至 82% 差异。GraphCanvas 现以初始 camera callback + `afterRender` 暴露 ready 信号，视觉测试等待该信号后连续 5 轮通过。
17. 移动菜单从瞬时、推流式展开升级为 Motion 固定浮层；补齐遮罩、错峰链接、Escape 焦点返回和 reduced-motion，390px 实图复核后提高表面不透明度，避免首页大标题透入菜单。
18. StandardCard 原悬停 footer 会以 max-height/padding 推动长列表，且编码默认隐藏。现改为编码常驻、动作头部渐进披露；菜单补齐 menu 语义、首项焦点和 Escape 返回，新增 E2E 后核心总数为 44。
19. StandardCard 的 28/32px 桌面复制/展开操作是五档触控门禁的最后主要缺口。统一为 44px 并移除旧 footer 后，最新 13 路由 × 5 视口的 10,730 个候选全部通过，验证器现对任意视口失败直接阻断。
20. StandardCard action menu 原本位于 overflow card 内。现与 Tooltip 共享 Floating UI layer，通过 Portal、flip/shift 和 auto-update 脱离裁切边界，并补齐方向键/Home/End 菜单导航。
21. 首页 GSAP 叙事采用 lazy boundary，但未触发 IntersectionObserver 时原占位只有纯黑表面，完整页面截图与低速网络下形成明显断层。现以同构三栏课程坐标 Skeleton 替代，reduced-motion 静态内容完整可读，并新增 lazy boundary E2E；核心总数增至 45。
22. 标准详情页尾的上一条/下一条原本只显示编码，未兑现计划中的相关标准 hover/focus 预览。现复用 Tooltip/Floating UI，在不改变链接语义的前提下显示真实标准摘要和分类坐标，并新增键盘焦点 E2E；核心总数增至 46。
23. 搜索对比结果原先只有 StandardCard 常规 hover 操作，没有计划要求的结果快速预览。现仅在 CompareView 启用教学线索浮层；实图检查发现宽正文链接不适合 right-start 锚定后改为 top-start，并由 flip/shift 兜底。新增 E2E 后核心总数增至 47。
24. 首页学科入口原先只显示名称，能力入口只有 tagline，未完整兑现 hover preview 与关系提示。现用 Manifest 和 skill_to_subjects 索引补充真实关系元数据；初版 46% opacity 触发 axe serious 对比度失败，改为始终满足阅读对比度、hover 只增强位置与关系线。新增 E2E 后核心总数增至 48。
25. 搜索筛选原本只有“重置”，没有已选条件摘要、批量清除和可撤销清除状态。现新增可移除 chips、批量清除、撤销清除及重置 Toast；展开态 axe 顺带发现并修复两个历史对比度问题。新增 E2E 与 axe 后总数为 49 / 21。
26. 多学段对比原先只有对齐网格，没有计划要求的差异模式。现按领域标准数量计算差异，使用文字、图案、背景、边缘与列标签共同表达；切换前后领域顺序机器断言一致。新增专用视觉与 axe 后总数为 50 / 22 / 13。
27. 移动端对比折叠为单列后，StandardCard 会隐藏桌面 grade chip，滚动离开列头时失去所属学段/学科。现由 CompareView 显式传入 ownership label 并仅在移动端显示，覆盖多学段与多学科模式。新增移动视觉和 axe 后总数为 51 / 23 / 14。
28. 标准详情 sticky 目录此前虽能更新章节状态，但视觉下划线瞬时切换，活动位置也没有机器可读语义。现以 Motion 共享 `layoutId` 连续移动唯一指示器，并为当前锚点补充 `aria-current="location"`；筛选面板 axe 场景同步等待有限进入动画完成，避免在半透明中间帧误报颜色对比度。新增交互与视觉基线后总数为 52 / 23 / 15。
29. 清单页已有导入、详情导出与单条标准撤销，但列表没有主计划要求的批量选择，整清单删除也不可恢复。现新增显式选择模式、默认收藏夹保护、单事务批量删除、完整快照和 6 秒撤销；恢复不会覆盖后续创建的同 ID 数据。桌面/移动选择态视觉、Dialog axe、localStorage 完整性及 390px 44px 控件契约通过后总数为 54 / 24 / 17。
30. 术语表已有搜索与分类，但当前索引只是静态说明，筛选和阅读位置不进入 URL，相关术语也是不可操作 code。现以稳定 term key、React Router query、原生 IntersectionObserver 和 Motion 共享指示器实现深链接、ScrollSpy、相关术语跳转与浏览器返回恢复；移动端索引为横向 44px 轨道。新增交互、响应式、axe 和视觉证据后总数为 56 / 25 / 18，五档默认态触控候选增至 10,910 且失败为 0。
31. 反馈页虽已有基础失焦校验和错误保留输入，但页面链接因 `noValidate` 没有自定义 URL 校验，pending/success 也没有可控网络证据。现补齐 HTTP/HTTPS 校验、pending live status、503 保留输入/邮件降级、成功标题焦点与继续提交恢复；Playwright 通过测试 key + route interception 验证真实 fetch 分支。成功态实图同时发现并修复 sticky Header 遮挡标题。新增 E2E、axe 与两张视觉状态后总数为 57 / 26 / 20。
32. H4G 真实审核包含 390 组、1170 条记录，旧队列一次挂载 390 个复合按钮，达到 Virtual 条件。现以 TanStack Virtual 只挂载视口附近 9 至 13 项，保留 button/aria-pressed 语义并增加方向键/Home/End roving focus；长距离跳转等待虚拟节点挂载并用 preventScroll 避免外层页面位移。新增 E2E、axe 与队尾视觉状态后总数为 58 / 27 / 21；五档触控候选降至 9,009 且失败仍为 0。resizable panels 因缺少可验证用户收益不引入。

## 自动契约

`npm run validate:design-contract` 当前验证：

- canonical token source 为 1；
- 13 个生产路由 key 与 13 个环境 flag 完整；
- React Aria 只从 `src/ui/primitives` 进入；
- Phosphor 只按图标文件导入；
- Emoji 为 0；
- 阻塞式 `alert/confirm` 为 0。

## 下一批优先级

1. 执行人工 VoiceOver/NVDA 任务流并记录签字。
2. 经明确发布授权后部署 V2，重新捕获正式域名直至 contract aligned。
3. 按 Phase 9 runbook 执行真实内部/小流量灰度和两个稳定发布周期。
