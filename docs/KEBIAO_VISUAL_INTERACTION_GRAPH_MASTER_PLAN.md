# kebiao 视觉、交互与知识图谱升级 Master Plan

- 状态：Draft for approval
- 日期：2026-07-10
- 适用仓库：curriculum-standards-breakdown
- 产品名：kebiao
- 固定副标题：中国课程标准的结构化索引与智能引擎
- 本轮范围：视觉设计、交互设计、动效系统、知识图谱呈现
- 明确不在本轮：信息架构重组、页面内容重排、业务逻辑改写

## 0. 文档权威与使用方式

本文件是下一阶段设计与实现的主计划。

它取代以下文件中的视觉方向、页面重组建议和暖纸朱红方案，但保留其中有效的工程约束、测试策略和图谱行为定义：

- docs/KEBIAO_UI_VISUAL_UPGRADE_SPEC.md
- /Users/shawn.fsc/Downloads/kebiao_V2_Design_Documentation_Package.md

以下内容按优先级构成设计事实源：

1. 当前生产版本的页面信息组织与业务行为
2. 用户本轮明确要求
3. 本 Master Plan
4. 两张参考图的工作台与详情交互模型
5. 旧文档中不与以上内容冲突的工程建议

如果设计稿、外部项目或实现建议与当前页面的信息组织冲突，当前页面结构优先。

### 0.1 本计划的输入

- 当前仓库与现有 13 个路由
- docs/KEBIAO_UI_VISUAL_UPGRADE_SPEC.md
- /Users/shawn.fsc/Downloads/kebiao_V2_Design_Documentation_Package.md
- /Users/shawn.fsc/Downloads/ChatGPT Image 2026年7月10日 19_21_03.png
- /Users/shawn.fsc/Downloads/ChatGPT Image 2026年7月10日 19_21_12.png
- withmarbleapp/os-taxonomy

### 0.2 使用的方法、Skill 与 Plugin

| 能力 | 对本计划的影响 |
| --- | --- |
| redesign-existing-projects | 将当前信息架构、业务行为和技术栈设为不可破坏基线 |
| gpt-taste | 只用于视觉节奏、首页单一叙事增强和高级动效范式，不强制套用 AIDA 或重组页面 |
| high-end-visual-design | 建立材质层级、微交互、动效性能和高质感标准 |
| spec-driven-development | 建立范围边界、阶段 Gate、任务模板、验收和回退 |
| GitHub Plugin | 核验 os-taxonomy、Sigma.js、Graphology、react-force-graph、G6、Cytoscape 和 React Flow 仓库状态 |
| view_image | 以原始分辨率审查两张参考图，区分信息组织与视觉语言 |

## 1. 核心决策

### 1.1 保留什么

- 保留当前导航层级、导航顺序、页面入口和用户认知路径。
- 保留所有现有路由、深链和 URL 查询参数。
- 保留每个页面现有的信息区块、字段、内容顺序、筛选拓扑、结果语义和操作入口。
- 保留收藏、分享、打印、反馈、浏览器前进后退和对比 draft → apply 行为。
- 保留 React、Vite、React Router、现有数据模型、API 和搜索契约。
- 保留现有列表、详情和矩阵视图。
- 知识图谱作为平行视图和增强视图，不替代现有入口。

### 1.2 升级什么

- 重建品牌视觉系统。
- 重建材质、光影、层级、排版、图标与状态语言。
- 为现有控件补齐 hover、focus、pressed、selected、loading、success 和 error 反馈。
- 为现有页面增加空间连续性、视图切换、面板联动和共享元素过渡。
- 增加可探索、可筛选、可聚焦的知识图谱视图。
- 建立统一动效语法、性能预算和 reduced-motion 退化方案。
- 建立可测试、可回滚的设计系统与组件体系。

### 1.3 废弃什么

- 暖米白、宣纸感、朱砂红和暗金色的核心品牌组合。
- 宋体、仿宋、书卷式标题和古籍出版物气质。
- 印章、竖排题字、红色批注线、古典纹样等隐性中国风符号。
- 大衬线 kebiao 字标。
- 每个区块都包细灰框的纸质报告感。
- 圆形和菱形节点直接拼成静态教学图。
- 蓝紫 AI 渐变、全站霓虹、全站玻璃化和无意义发光。
- Emoji、粗线图标和混用多套图标。
- 以视觉升级为理由重排内容、合并页面或隐藏既有入口。

## 2. 设计定位

### 2.1 Design Read

kebiao 是一套 Interactive Curriculum Intelligence Workspace。

用户第一眼应感受到：

- 这是现代知识基础设施。
- 这是可长期使用的专业研究工具。
- 课程标准之间存在可以探索的结构与关系。
- 页面信息很多，但系统清楚、响应迅速、操作有反馈。

它不应像：

- 教育政务网站
- 纸质教材电子化
- 传统文化数字展览
- 通用 SaaS 模板
- 炫技型 3D 数据演示

### 2.2 三种产品表面

| 表面 | 视觉密度 | 动效强度 | 主要目标 |
| --- | ---: | ---: | --- |
| 首页与品牌入口 | 4/10 | 7/10 | 建立品牌与结构感 |
| 检索、详情、对比工作台 | 7/10 | 5/10 | 提高理解和操作效率 |
| 知识图谱工作台 | 7/10 | 7/10 | 关系探索与空间导航 |
| H4G 等内部工具 | 9/10 | 2/10 | 审核效率和状态准确性 |

### 2.3 设计关键词

- Precise
- Spatial
- Responsive
- Intelligent
- Instrumental
- Calm under density

### 2.4 kebiao 独有视觉签名

冷白、石墨、信号靛蓝和 Geist 只是基础材料，不能直接构成品牌。

kebiao 的专属视觉签名是“课程坐标系”：

- 学段轴
- 领域轨道
- 标准编码锚点
- 关系索引线
- 当前定位坐标

这些元素来自真实课程结构，并以同一套几何规则出现在首页、筛选状态、详情页关系入口和图谱中。禁止用通用光球、AI 网格、假数据面板或发光渐变代替品牌签名。

## 3. 绝对范围边界

### 3.1 Always

- 每次页面改造前先建立当前页面 Content Inventory。
- 每个现有信息项都必须在新版中一一对应。
- 所有业务状态与动画状态分离。
- 所有新交互都有键盘和触屏路径。
- 图谱始终有等价列表。
- 每个路由独立发布和回退。
- 每个阶段都运行构建、行为回归和截图对比。

### 3.2 Ask first

- 改导航名称、顺序或入口。
- 改页面区块顺序。
- 改路由或 URL 参数语义。
- 改搜索相关性和结果排序。
- 改数据模型或新增关系数据。
- 引入 GSAP 商业使用前的许可证决策。
- 上线默认 3D 图谱。

### 3.3 Never

- 删除现有字段或操作。
- 把功能藏在 hover 或手势中。
- 把图谱变成唯一入口。
- 复制外部项目的品牌、默认皮肤或受限数据。
- 在客户端暴露管理密钥。
- 用动画掩盖加载、错误或状态不确定性。
- 为追求效果使用滚动劫持、持续粒子和无限漂浮节点。

## 4. 当前信息架构冻结清单

### 4.1 路由

以下路由保留：

- /
- /subjects/:slug
- /skills
- /skills/:code
- /search
- /glossary
- /standards/:code
- /collections
- /collections/:id
- /print
- /styleguide
- /feedback
- /h4g-review

### 4.2 首页内容顺序

保留当前顺序：

1. 首页品牌与价值说明
2. 对比筛选
3. 学科入口
4. 可迁移技能
5. 使用说明

允许调整的是视觉比例、间距、材质、动效和局部展开方式，不允许改变区块责任和主任务顺序。

### 4.3 学科页

保留：

- 学科上下文
- 学段选择
- 列表与对比模式
- 领域分组
- 标准列表
- 当前筛选和 URL 状态

### 4.4 搜索与对比页

保留：

- 当前筛选项
- 当前查询参数
- 结果区域
- 对比模式
- 调整筛选入口
- 结果数量和空状态语义

### 4.5 标准详情页

保留：

- 面包屑
- 标准代码和标题
- 学科、学段、领域等元数据
- 标准内容
- 理解与教学说明
- 证据线索
- 相关标准
- 相关能力
- 收藏、打印、分享
- 来源

### 4.6 其他页面

清单、术语、反馈、打印、Style Guide 和 H4G 的字段、顺序与操作保持当前版本。

### 4.7 Content Inventory Manifest

实现前新增只读基线文档，按路由记录：

- 页面标题
- 区块顺序
- 字段和文案
- 筛选项
- 操作入口
- URL 状态
- loading、empty、error、success
- 桌面与移动截图

该 Manifest 是视觉改造的内容 parity 验收依据。

## 5. 参考图审查

### 5.1 参考强度

| 维度 | 采用程度 |
| --- | ---: |
| 当前生产 IA | 100% 保留 |
| 参考图信息组织 | 0% 直接迁移 |
| 参考图图谱交互模型 | 65% 借鉴 |
| 参考图视觉语言 | 15% 以下 |
| 色彩、字体和中国风装饰 | 0% |

### 5.2 图谱参考图可保留的部分

- 全局搜索和当前上下文。
- 图谱、列表、矩阵的平行视图。
- 左侧图层、筛选和图例。
- 中央大画布。
- 右侧节点 Inspector。
- 关系类型、布局、缩放、全屏和缩略图。
- 节点选中后原位探索。
- 两侧面板可折叠，画布可进入专注模式。

### 5.3 标准详情参考图可保留的部分

- 标准编码和标题优先。
- 主阅读区与上下文辅助区并存。
- 页面目录跟随阅读位置。
- 相关能力、相关标准和来源靠近当前内容。
- 收藏、打印、分享有明确状态反馈。
- 从标准详情进入对应图谱节点。

### 5.4 明确不采用

- 米白纸张、朱红和暗金。
- 衬线品牌字和书籍标题排版。
- 红色章节竖线与传统出版物语气。
- 静态圆形、菱形知识节点。
- 每个模块都有相同边框和圆角。
- 低对比细线与过小正文。
- 长期常驻且无法折叠的宽侧栏。

## 6. 新视觉方向

### 6.1 方向名称

Precision Intelligence Workbench

### 6.2 双表面系统

#### Light Workspace

用于首页、检索、详情、列表、矩阵和表单。

- 冷白画布
- 石墨文本
- 低饱和冷灰表面
- 信号靛蓝作为唯一品牌强调色
- 极少量环境阴影
- 通过排版、留白和局部层级减少边框

#### Graph Observatory

用于图谱专注模式。

- 深石墨画布
- 极弱点阵和坐标纹理
- 高对比节点与关系
- 浮动工具岛和 Inspector
- 暗色只服务图谱任务，不随机插入普通阅读页面

这不是全站深色主题，也不提供首期主题切换器。

### 6.3 基础色彩候选

| Token | 值 | 用途 |
| --- | --- | --- |
| kb-canvas | #F5F7FA | 页面背景 |
| kb-surface | #FFFFFF | 阅读与控件表面 |
| kb-surface-muted | #EEF1F6 | 分组和次级状态 |
| kb-ink | #0C111D | 主文本 |
| kb-ink-muted | #5B6472 | 辅助文本 |
| kb-hairline | rgba(12, 17, 29, 0.10) | 精细分隔 |
| kb-accent | #3E5BEF | 主行动与选中 |
| kb-accent-hover | #2944D6 | Hover 与 pressed |
| kb-accent-soft | #E8ECFF | 轻量选中 |
| kb-focus | #88A0FF | 焦点环 |
| kb-graph-canvas | #090C14 | 图谱背景 |
| kb-graph-surface | #111725 | 图谱面板 |
| kb-graph-text | #F3F6FF | 图谱主文本 |
| kb-graph-muted | #97A1B2 | 图谱辅助文本 |

已核算的基础对比：

- kb-accent / white 为 5.32:1。
- kb-ink / kb-canvas 为 17.57:1。
- kb-ink-muted / kb-canvas 为 5.57:1。
- kb-graph-text / kb-graph-canvas 为 18.09:1。
- kb-graph-muted / kb-graph-canvas 为 7.50:1。

品牌色只有信号靛蓝。学科色、关系色和状态色属于数据语义，不能用作通用装饰。

### 6.4 字体

- 英文品牌与界面：Geist Variable。
- 中文界面与正文：MiSans Variable 或 Source Han Sans SC Variable，样张评审后二选一。
- 标准编码与数值：Geist Mono。
- 不使用衬线字体作为 kebiao 主品牌字体。
- kebiao 字标必须完成专属字距、字重和至少一个定制字形细节，不能直接使用默认 Geist 粗体文本。
- 字体自托管，不依赖运行时字体 CDN。

推荐排版基线：

| 场景 | 字号 | 行高 | 字重 |
| --- | ---: | ---: | ---: |
| 品牌字标 | 32 至 48 | 0.95 | 650 至 750 |
| 页面 H1 | 36 至 56 | 1.05 | 620 至 700 |
| 页面 H2 | 24 至 34 | 1.15 | 600 至 680 |
| 正文 | 16 至 18 | 1.7 至 1.85 | 400 |
| 控件 | 13 至 15 | 1.4 | 500 至 600 |
| 标准编码 | 13 至 18 | 1.4 | 500 |

### 6.5 材质与层级

- 主内容减少卡片化，使用留白、背景变化和排版分组。
- 浮动工具栏、Inspector、Popover 和 Dialog 才使用环境阴影。
- 表面边界使用半透明 hairline，不使用大量固定灰边框。
- 只有浮动导航、弹层和 Inspector 可使用有限 backdrop blur。
- 图谱背景使用固定低对比点阵，不使用持续粒子。
- 工作台和阅读页不使用噪点。图谱只使用功能性点阵和坐标纹理。
- 控件圆角 8 至 10px，浮层圆角 12 至 16px。
- 胶囊只用于筛选条件、状态和紧凑 segmented control。

### 6.6 图标

- 全站使用 Phosphor Icons，默认 regular 或 light weight。
- 品牌标志单独设计，不直接使用图标库图标。
- 节点类型可使用自定义细线图标。
- 装饰图标 aria-hidden，功能图标必须有可读名称。
- 不使用 Emoji。

## 7. Interaction Grammar

### 7.1 原则

1. 每次状态变化都给用户因果反馈。
2. 动效保持空间连续性。
3. 操作反馈快于布局过渡。
4. 阅读页面稳定，图谱页面富有空间感。
5. 动画状态不决定业务状态。
6. 动效关闭时功能和层级完整。
7. 一次状态变化只允许一个主运动和一个辅助淡入，避免多个方向同时竞争。

### 7.2 时间与曲线

| 类型 | 时长 | 推荐曲线 |
| --- | ---: | --- |
| Hover、pressed、focus | 100 至 160ms | cubic-bezier(.2,.8,.2,1) |
| Tooltip、Toast | 140 至 220ms | cubic-bezier(.16,1,.3,1) |
| Accordion、Filter chip | 180 至 280ms | spring 或 cubic-bezier(.22,1,.36,1) |
| Drawer、Inspector、Dialog | 240 至 360ms | spring，低回弹 |
| 结果重排、视图切换 | 320 至 520ms | spring，保持共享位置 |
| 图谱聚焦和相机移动 | 500 至 800ms | cubic-bezier(.16,1,.3,1) |
| 首页叙事增强 | 600 至 1000ms | GSAP scrub 或 timeline |

### 7.3 控件状态

所有可点击控件必须定义：

- default
- hover
- focus-visible
- pressed
- selected
- disabled
- loading
- success
- error

状态不得只靠颜色表达。

### 7.4 页面与视图过渡

- 路由切换使用短 crossfade 和 8 至 16px 位移，不做全屏遮罩。
- 图谱、列表、矩阵切换使用共享工具栏和内容容器 morph。
- Inspector 打开时画布平滑缩窄，选中节点保持可视焦点。
- 从列表或详情进入图谱时，标准代码和标题使用共享元素连续性。
- 共享元素只作为渐进增强，匹配失败时退化为短 crossfade。
- 返回列表时恢复原筛选、滚动和选中状态。
- 页面目录滚动跟随只改变当前指示，不推动正文。

### 7.5 加载与反馈

- 使用与最终布局一致的 Skeleton。
- 图谱先显示画布框架和簇轮廓，再逐级显示标签。
- 筛选结果重排时保留旧结果位置，完成后平滑更新。
- 复制代码、收藏和分享使用短 Toast。
- 错误显示在操作上下文中，不使用 alert。

### 7.6 Reduced Motion

prefers-reduced-motion 下：

- 取消 GSAP scrub、视差和大位移。
- 图谱相机改为短淡入或瞬时定位。
- 节点展开不使用弹性 overshoot。
- 所有功能、关系和状态仍完整可见。

## 8. 逐页面 Visual Reskin Map

### 8.1 全局 Header

保留：

- 当前品牌区
- 当前五个导航入口及其顺序
- 当前“我的清单”入口和本地收藏语义

升级：

- 使用 sans 品牌字标。
- 采用冷白悬浮或轻 sticky 表面。
- 产品页使用稳定、紧凑、全宽的工作台 Header，不使用胶囊式悬浮导航。浮动工具岛只出现在图谱画布内。
- 当前导航使用位置、字重和短指示线，不使用大色块。
- 移动菜单使用全高 Sheet 与焦点管理。

新增全局搜索、账号、历史或用户入口不属于纯视觉换肤，必须单独经过产品确认。首期不把“我的清单”解释为账号系统。

外部项目：

- React Aria Components
- Phosphor Icons
- Motion

### 8.2 首页

保留当前区块和顺序。

升级：

- Hero 使用真实课程字段、关系线和标准代码构成动态 Data Field。
- 主标题不超过两行。
- 保留当前三个操作入口，通过一个主行动和两个次级行动建立视觉权重，不删除入口。
- 对比筛选从卡片墙升级为有空间层级的操作台。
- 学科入口和能力入口增加 hover preview 与关系提示。
- 使用说明保持自然滚动，不为每个段落添加入场动画。

动效：

- 首页只允许一个品牌级主运动：“标准编码逐步解析为课程关系网络”。
- Data Field 与关系线属于同一叙事。
- 不使用 card stacking，不同时叠加多段 pin、视差和连线动画。
- 移动端恢复为静态分步显现。
- 任何 pin 都不得改变 DOM 顺序、Tab 顺序、内容可发现性或遮挡后续区块，否则取消 pin。

外部项目：

- Motion 负责常规状态与布局。
- GSAP 只负责一个首页叙事段，许可证批准后启用。

### 8.3 学科页

保留现有学科、学段、模式和领域结构。

升级：

- 学科色缩小为索引信号。
- 学段切换使用共享 underline 或 sliding indicator。
- 领域展开保持行位置，标准列表使用分隔与排版取代卡片堆叠。
- 列表与对比模式使用 morph 过渡。

### 8.4 搜索页

保留当前筛选组织和结果语义。

升级：

- 筛选区、结果区和状态区建立清楚的深度层级。
- 已选筛选条件可回退、可批量清除并有撤销反馈。
- 结果行 hover 时显示快速预览，不改变默认内容顺序。
- 查询、筛选和 URL 更新保持同步。
- 移动端仅改变容器形式，不改变筛选可发现性。

外部项目：

- React Aria Components
- Motion
- TanStack Virtual 仅在真实结果规模达到阈值时

### 8.5 对比视图

保留现有对比逻辑、选择约束和 draft → apply。

升级：

- 使用 sticky header 和 sticky 领域列。
- 列切换和差异模式保持行位置。
- 差异高亮同时使用标记、背景和文字，不做纯红绿 diff。
- 移动端按当前结构重新容器化，始终显示内容所属对象。

外部项目：

- TanStack Table v8 仅承担状态和表格模型。
- TanStack Virtual 仅用于大矩阵。
- Motion 负责列和差异状态过渡。

### 8.6 标准详情页

保留全部内容顺序和字段。

升级：

- 使用现代 sans 排版和更强正文节奏。
- 取消纸质报告边框感。
- 页面目录、相关能力和来源与当前阅读位置联动。
- 标准代码支持复制反馈。
- 相关标准 hover 或 focus 显示轻量预览。
- 增加“在图谱中定位”入口，不移动现有内容。
- 正文段落不做滚动显现、抬升或连续 hover 变形。

动效强度低：

- 目录指示移动
- Toast
- 关系预览
- 进入图谱的共享元素过渡

### 8.7 能力页

保留当前能力介绍、技能框架和详情列表。

升级：

- 增加列表 / 图谱平行视图切换。
- 图谱选中能力后，现有详情内容在 Inspector 中复用。
- 视图切换共享筛选与选中状态。

### 8.8 清单页与清单详情

保留现有信息和本地存储行为。

升级：

- 加强批量选择、导入、导出和删除反馈。
- Dialog 使用真实焦点管理。
- 列表行支持快捷操作和撤销。
- 空状态清楚解释数据存储位置。

### 8.9 术语表

保留当前术语和定义组织。

升级：

- 当前索引位置高亮。
- 术语跳转、搜索和返回位置有连续性。
- 不把术语拆成更多卡片。

### 8.10 反馈页

保留字段和提交流程。

升级：

- 即时字段校验。
- 错误聚焦和恢复。
- 提交中、成功、失败有完整状态。
- 网络失败不清空输入。

### 8.11 H4G 审核页

保留入口、字段、队列、比较和导出。

升级：

- 只做高密度工具视觉和状态反馈。
- 不套用首页动效。
- 390 组真实审核队列已通过验证并使用 TanStack Virtual；五档仅挂载 9 至 13 个可见/overscan 按钮，保留完整键盘与读屏语义。
- resizable panels 经验证暂不引入：固定桌面队列与移动单列重排已通过，尚无用户价值证据支持增加拖拽、触控和读屏复杂度。

### 8.12 Print 与 Style Guide

- Print 保持黑白、来源、代码和分页。
- Style Guide 继续存在，Storybook 作为开发组件契约，不自动删除现有路由。

## 9. 知识图谱体验规格

### 9.1 图谱角色

图谱是课程关系导航层，不是首页装饰。

它回答：

- 这条标准属于哪个学科和领域？
- 它在学段进阶中处于什么位置？
- 它关联哪些能力？
- 它的前置、后续和支撑关系是什么？
- 哪些相邻标准值得继续查看？

### 9.2 接入位置

首期不新增主路由，使用现有页面中的平行视图：

- /skills?view=graph
- /skills/:code?view=graph
- /subjects/:slug?view=graph
- /standards/:code 中的“在图谱中定位”

如果未来需要独立全屏路由，必须另行产品决策。

以上 query 形式是提案，不是已批准契约。Gate B2 必须先批准完整 schema，并确保新参数仅增量加入，不改变任何旧参数含义。

### 9.3 实体层

| 层 | Entity | 最低字段 |
| --- | --- | --- |
| 1 | Subject | slug、名称、版本 |
| 2 | Domain | 名称、所属学科、学段覆盖 |
| 3 | Standard | code、标题、学段、内容摘要 |
| 4 | Transferable Skill | code、名称、关联标准 |

不得为了视觉效果创建没有数据来源的实体。

### 9.4 关系

首期只显示数据中可验证的关系：

- contains
- belongs_to
- progression
- related_standard
- skill_alignment

prerequisite 只有在数据源明确存在时才启用，不能把列表顺序自动解释为先修关系。

每条边具有：

- type
- source
- target
- direction
- confidence 或 provenance，若数据存在
- 可读文本说明

### 9.5 节点设计

不使用静态泡泡图。

节点是可缩放 Entity Plate：

- Subject：紧凑标题与范围标记
- Domain：名称与标准数量
- Standard：代码、短标题、学段标记
- Skill：代码、名称、关联数量

视觉边界：

- 节点使用哑光实体表面。
- 不使用外发光、渐变描边、持续脉冲或自动漂浮。
- 默认关系线使用中性灰。
- 数据语义色只在筛选、选中、路径和比较状态中增强。

节点类型同时使用：

- 形状或轮廓
- 图标
- 文本前缀
- 数据色

不能只靠颜色区分。

### 9.6 语义缩放

#### 远景

- 只显示 cluster、学段轴和领域轨道。
- 标签数量严格限制。
- 边以密度和方向表达，不显示全部文本。
- 不显示节点图标和节点操作。

#### 中景

- 显示 Standard cluster 和关键 Skill。
- 显示当前筛选的主要关系。
- 标签按重要性和碰撞策略显示。
- 只显示有限的关键标准，不显示全部详细节点。

#### 近景

- 显示 Standard、Skill、完整边类型和节点操作。
- Inspector 显示现有详情信息。
- 支持路径和相邻节点浏览。

LOD 硬性预算：

- 同一时刻只允许一个层级拥有完整文字标签。
- cluster hull、节点图标、完整标签、边标签和节点操作不能在同一缩放层级全部出现。
- 超出标签预算时优先保留当前路径、选中节点和键盘焦点。

### 9.7 布局

- x 轴优先表达领域或主题簇。
- y 轴优先表达学段或进阶。
- 节点大小表达结构重要性或关联数量，不表达主观价值。
- subject color 仅作数据编码。
- cluster hull 表达领域归属。
- 布局计算放入 Web Worker。
- 首次布局稳定后持久化坐标，避免每次进入全部重排。

### 9.8 Focus Mode

点击或键盘选择节点后：

1. 当前节点进入焦点。
2. 一阶邻居保持完整对比。
3. 二阶及无关节点退到 20% 至 30% 不透明度。
4. 关系按类型逐组显现。
5. Inspector 打开。
6. 画布偏移，选中节点仍位于可视中心。
7. Esc 返回前一层焦点。

### 9.9 Path Mode

支持：

- Before → Current → After
- 学段进阶路径
- Standard → Skill
- Domain → Standard cluster

路径必须提供文本列表和复制链接。

### 9.10 Compare Mode

- 复用当前对比选择和 URL 状态。
- 图谱只负责展示关系差异。
- 对比逻辑仍由现有 compareLogic 负责。
- 可以突出新增、持续、减弱和缺失关系。
- 关闭图谱后原矩阵完整可用。

### 9.11 工具与面板

保留参考图的三层工作台模型：

- 左：图层、筛选、图例，可折叠。
- 中：画布、浮动工具岛、缩略图。
- 右：Inspector，可折叠和调整宽度。

低于 1024px：

- 侧栏变为 Sheet。
- 画布保持第一视觉层。
- 移动端默认列表，图谱为全屏可选模式。

### 9.12 URL 与状态

可序列化状态：

- view
- subject
- gradeBand
- domain
- relationTypes
- selectedNode
- focusDepth
- compareSelection

不建议序列化每一帧 camera 坐标。只保存稳定视图 preset 或返回锚点。

所有新参数通过现有 query adapter 编解码，并覆盖未知参数、旧链接、分享、刷新、前进和后退测试。

### 9.13 可访问性

- Canvas 或 WebGL 节点本身不视为可靠的 DOM 焦点。
- GraphA11yController 维护与画布同步的选中节点、邻居集合和关系树。
- VirtualizedRelationTree 提供可键盘操作的 DOM 等价视图。
- 所有节点有可读名称和类型。
- 键盘可在邻居、父级和子级间移动。
- Inspector 打开后焦点进入，关闭后返回节点。
- 画布提供等价关系列表。
- 当前位置和关系数量使用 aria-live 适度宣布。
- 图谱不作为打印和读屏的唯一内容。

### 9.14 性能分档

| 档位 | 目标 | 策略 |
| --- | ---: | --- |
| Focus subgraph | 20 至 200 节点 | 完整标签、完整关系 |
| Subject graph | 200 至 1000 节点 | LOD、标签碰撞、cluster |
| Whole curriculum | 1000 至 5000+ 节点 | WebGL、聚类、裁剪、Worker |

验收：

- 选中反馈低于 100ms。
- 常用桌面平移缩放中位帧率不低于 50fps。
- Inspector 打开不触发全图重新布局。
- 图谱失败时自动回到等价列表。

## 10. os-taxonomy 借鉴边界

withmarbleapp/os-taxonomy 的有效参考：

- 每个点代表学习实体。
- 学科使用数据色区分。
- 年龄或学段成为空间轴。
- 边表达先修关系。
- 点击实体后追踪其上游与下游。
- 大规模全局概览与局部路径探索并存。

kebiao 不采用：

- 直接使用 os-taxonomy 数据。
- 直接复制其文本、命名、品牌资产或网站视觉。
- 把 3D 旋转图作为默认研究界面。
- 只依赖漂浮点和颜色表达实体。
- 在没有来源的情况下生成 prerequisite。

许可证边界：

- 数据库结构与关系使用 ODbL 1.0。
- Marble 自有文本使用 CC BY-SA 4.0。
- 本项目首期只参考呈现原则，不导入数据，因此不触发衍生数据库方案。
- 如果未来使用其数据，必须单独完成 attribution、share-alike 和 provenance 审计。

## 11. Graph Engine ADR

### 11.1 Benchmark 领先假设

进入 Benchmark 前的领先假设：

- 项目内部定义与 renderer 无关的 GraphModel。
- Graphology 作为候选算法与事件层。
- Sigma.js stable v3 作为候选大规模二维 WebGL renderer。
- graphology-layout-forceatlas2 或自定义分层布局作为 Worker 候选。

原因：

- Sigma.js 官方定位是用 WebGL 展示数千节点和边。
- Graphology 提供统一图模型、事件和图算法。
- 中立 GraphModel 与 renderer 解耦，便于替换或增加实验视图。
- 适合 os-taxonomy 式全局概览和局部聚焦。

以上是需要验证的假设，不是提前锁定的生产依赖。Gate B 之后只安装胜出的 renderer 与必要算法包。

### 11.2 可选沉浸式实验

react-force-graph-3d 只用于：

- 桌面端全局课程宇宙预览
- 展示或演示模式
- 用户主动开启的 immersive view

它不用于：

- 默认图谱工作台
- 标准详情阅读
- 移动端默认视图
- 无障碍主路径

### 11.3 候选引擎

| 项目 | 优势 | 风险 | 决策 |
| --- | --- | --- | --- |
| Sigma.js + Graphology | WebGL、千级图、数据与渲染分离 | 复杂自定义节点和 a11y 需自行封装 | 首选基准 |
| AntV G6 | 布局、交互、主题、插件完整 | API 与 bundle 较重 | Benchmark 候选 |
| Cytoscape.js | 图算法和成熟交互丰富 | 默认视觉需彻底重做，扩展组合复杂 | Benchmark 候选 |
| React Flow | React 节点和编辑器体验好 | 大规模 DOM 节点成本高 | 仅小型 focus subgraph 候选 |
| react-force-graph | 2D、3D、VR、AR 表现力强 | 文字、a11y 和稳定研究布局成本高 | 可选 3D 实验 |

### 11.4 Benchmark

用 kebiao 真实数据构造 200、500、1000、5000 节点样本，对比：

- 首次可交互时间
- 平移缩放帧率
- 节点选中延迟
- Inspector 打开影响
- 标签碰撞
- 内存
- 移动设备退化
- 自定义节点成本
- 键盘与读屏适配成本
- Bundle 和 lazy chunk 大小

Benchmark 结果写入 ADR 后再安装最终 renderer。

## 12. 外部项目使用矩阵

### 12.1 生产直接依赖

| 项目 | 使用位置 | 职责 | 明确边界 | 许可证 |
| --- | --- | --- | --- | --- |
| React Aria Components | 全站 primitive 和表单 | 键盘、焦点、ARIA、跨设备行为 | 不引入 React Spectrum 皮肤 | Apache-2.0 |
| Phosphor Icons React | 全站图标 | 统一轻量图标语言 | 不直接作为 Logo | MIT |
| Motion | 全站产品交互 | 布局、抽屉、视图、状态过渡 | 不做滚动劫持 | MIT |
| TanStack Table v8 | 当前对比和 H4G | Headless 表格状态 | 不改变现有信息结构 | MIT |
| TanStack Virtual | 大列表和大矩阵 | 虚拟化 | 达到阈值才启用 | MIT |

### 12.2 条件依赖

| 项目 | 条件 | 用途 | 风险 |
| --- | --- | --- | --- |
| GSAP + @gsap/react | 许可证通过 | 首页单一叙事段 | 自定义 no-charge 许可证 |
| Sigma.js + Graphology | Benchmark 胜出 | 二维 WebGL renderer 与图算法 | 自定义节点与 a11y 成本 |
| react-force-graph-3d | 3D 原型通过性能和价值评审 | 桌面沉浸式总览 | WebGL、a11y、bundle |
| AntV G6 | Benchmark 胜出 | 替代 Sigma renderer | API、bundle、主题成本 |
| Cytoscape.js | 分析能力成为核心 | 图分析和复杂布局 | 扩展和样式复杂 |
| React Flow | 需要小型可编辑或富 React 节点子图 | Focus subgraph | 不用于千级总览 |
| react-resizable-panels | 面板可调确有用户价值且依赖 Gate 通过 | 图谱或 H4G 面板 | 移动端必须改 Sheet |

### 12.3 开发质量依赖

| 项目 | 用途 |
| --- | --- |
| Storybook React Vite | 组件状态和动效文档 |
| Storybook a11y | 开发期无障碍检查 |
| Playwright | 核心流程和视觉回归 |
| @axe-core/playwright | 自动无障碍检查 |
| Lighthouse CI | 性能预算 |
| Stylelint | CSS Modules 与 token 约束 |

### 12.4 只做参考

| 项目 | 借鉴 | 不复制 |
| --- | --- | --- |
| withmarbleapp/os-taxonomy | 学科色、学段轴、先修追踪、全局到局部 | 数据、文案、品牌和默认视觉 |
| OpenMetadata | 实体关系与 Inspector | 企业后台皮肤 |
| DataHub | lineage、实体元数据 | 治理术语和复杂导航 |
| Linear | 状态连续性与交互精度 | 品牌和商业视觉 |
| Observable | 数据叙事 | 编辑器结构 |

## 13. 技术架构

### 13.1 保持现有技术栈

- React 18
- Vite 6
- React Router
- 现有数据模块、API 和 Meilisearch
- Vanilla CSS 逐步迁移到 CSS Modules

不迁移 Next.js、Tailwind、Ant Design、MUI 或默认 shadcn。

### 13.2 目录目标

    src/
      design/
        tokens.css
        motion.css
        fonts.css
        reset.css
      ui/
        primitives/
        composed/
      features/
        graph/
          graphAdapter.js
          graphSelectors.js
          GraphCanvas.jsx
          GraphInspector.jsx
          GraphToolbar.jsx
          GraphFallbackList.jsx
          GraphA11yController.js
          VirtualizedRelationTree.jsx
        search/
        compare/
        collections/
      pages/
      stories/
    e2e/
    docs/
      adr/
      baselines/

### 13.3 CSS 规则

- 只有一个 token 源。
- token 分 reference、semantic、component 三层。
- 新 token 使用 --kb-*。
- 使用 @layer reset, tokens, base, components, pages, utilities。
- 页面和组件使用 CSS Modules。
- 全局只保留 reset、fonts、tokens 和少量 layout helper。
- 禁止 .card、.title、.spinner 等裸全局业务类。
- 旧 token 通过单向 bridge 迁移。

### 13.4 外部组件包装层

页面不得直接到处 import 第三方 primitive。

示例：

    import { Button as AriaButton } from "react-aria-components"

    export function Button(props) {
        return <AriaButton {...props} />
    }

所有视觉、状态和动效由 kebiao wrapper 统一。

### 13.5 图谱数据适配

业务数据先转换成中立 GraphModel：

    {
      nodes: [{ id, type, label, meta, provenance }],
      edges: [{ id, source, target, type, directed, provenance }]
    }

renderer 只读取 GraphModel，不直接读取页面数据。

GraphA11yController 同样读取 GraphModel，并与 renderer 共享 selectedNode、focusDepth 和 relationTypes。任何 renderer 如果不能可靠同步这些状态，就不能进入生产。

### 13.6 动画状态隔离

- URL 和业务数据是 source of truth。
- Motion 与 GSAP 不保存业务状态。
- 同一元素不能同时由 Motion 和 GSAP 控制 transform 或 opacity。
- 图谱相机状态由 GraphController 管理。
- reduced-motion 在统一 MotionProvider 中处理。

### 13.7 加载策略

- 图谱按路由和 view 参数 lazy import。
- 3D renderer 单独 chunk。
- GSAP 单独 chunk。
- H4G 工具单独 chunk。
- 字体按字重和字符范围子集化。
- 图标具名导入。

## 14. 实施计划

### Phase 0：记录并冻结基线

目标：

- 明确基线来源和 worktree 状态。
- 冻结现有信息架构和行为。

任务：

- 记录生产部署 URL、Git SHA、数据 manifest 版本和截图时间。
- 记录 worktree 状态，不执行 reset、checkout、删除或清理用户文件。
- 记录所有路由和核心流程。
- 生成 Content Inventory Manifest。
- 记录 1440、1024、768、390、360 截图。
- 建立关键 URL 和数据数量基线。

验收：

- 13 个现有路由可加载。
- 页面区块、字段和操作已记录。
- 搜索、分享、收藏、打印、反馈、对比均有 smoke baseline。

Gate 0：

- 基线来源可追溯。
- Content Inventory 已由产品确认。
- 生产截图和本地截图的差异已经记录。

### Phase 1：视觉方向验证

目标：

- 在写生产代码前确认新方向真正摆脱中国风。

交付：

- Global Shell 高保真概念
- 首页高保真概念
- 标准详情高保真概念
- 图谱工作台高保真概念
- 搜索和对比关键状态
- 390px 移动端概念
- 15 至 30 秒 motion study

评审点：

- 冷白与深石墨双表面是否成立
- 信号靛蓝是否具备品牌识别
- sans 品牌字体是否成立
- 图谱是否像研究工具而非展示动画
- 当前信息组织是否完整保留

Gate A：

以上概念获得批准后才进入生产实现。

### Phase 1.5：Dependency & License Gate

在安装生产依赖前核验：

- 精确 npm 版本和锁定策略
- React、Node 和目标浏览器兼容性
- 许可证与商业使用边界
- 维护状态和退出方案
- gzip 与 parsed bundle 增量
- 中国大陆网络环境与自托管要求

必须单独确认：

- GSAP 商业使用许可证
- MiSans 自托管和再分发许可
- 图谱 renderer、layout 和 plugin 许可证
- react-resizable-panels 是否确有必要
- 字体加载失败时的合法 fallback

依赖清单获得批准后才进入 Phase 2。

### Phase 2：Token、字体与 CSS 隔离

任务：

- 建立新色彩、字体、间距、层级、阴影和动效 token。
- 自托管字体。
- 建立 CSS Modules 和 cascade layer。
- 清理重复 token 和全局污染。
- 建立旧 token compatibility bridge。

验收：

- 只有一套 token。
- 页面 CSS 不影响其他路由。
- 不出现暖纸、朱红和衬线品牌残留。
- 所有基础文字对比度达标。

### Phase 3：Primitive、图标与 Motion Provider

任务：

- Button
- IconButton
- Checkbox
- SearchField
- Tabs
- Disclosure
- Dialog
- Popover
- Tooltip
- Toast
- Skeleton
- EmptyState

每个组件覆盖：

- default
- hover
- focus
- pressed
- selected
- disabled
- loading
- success
- error
- reduced motion

### Phase 4：Global Shell 与现有页面换肤

按风险和复用顺序：

1. Header、Footer
2. 标准详情
3. 学科页
4. 搜索页
5. 对比视图
6. 首页
7. 能力页
8. 清单、术语、反馈
9. H4G 与 Print

全局搜索只有在单独产品确认后加入，不与 Header 换肤捆绑。

每个页面执行：

1. 锁定 Content Inventory。
2. 建立视觉映射。
3. 实现 feature flag 下的 v2。
4. 运行 content parity。
5. 运行桌面与移动截图。
6. 验收后再进入下一路由。

### Phase 5：Graph Data Readiness、Adapter 与 Benchmark

任务：

- 统计真实数据中 contains、progression、related_standard、skill_alignment 和 prerequisite 的实际数量。
- 审计每条边的 provenance。
- 100% 展示边必须可追溯到现有数据。
- 0 条 prerequisite 可以由列表顺序或视觉推断生成。
- 明确首期真实可实现的关系集合。
- 从现有数据构建中立 GraphModel。
- 使用真实拓扑生成 200、500、1000、5000 节点样本，不使用随机图替代。
- 对 Sigma、G6、Cytoscape 运行 Benchmark。
- 对可选 3D 运行独立价值和性能测试。

Gate B1，Graph Data Readiness：

- 真实关系统计和 provenance 审计通过。
- 首期关系集合得到确认。
- GraphModel 不依赖任何 renderer。

Gate B2，Graph Engine：

- 选择最终 2D renderer。
- 决定是否继续 3D 实验。
- 完成 Graph Engine ADR。
- 批准图谱 query schema，并统一通过现有 query adapter 编解码。
- 旧链接、未知参数、浏览器前进后退和分享恢复测试通过。
- 完成键盘和读屏原型，无法支持 GraphA11yController 的引擎直接淘汰。

### Phase 6：知识图谱核心

任务：

- GraphCanvas
- GraphToolbar
- LayerPanel
- Legend
- GraphInspector
- MiniMap
- GraphFallbackList
- GraphA11yController
- VirtualizedRelationTree
- URL state
- Focus Mode
- Path Mode
- Compare overlay

验收：

- 图谱和列表结果一致。
- 选中、筛选、关系和路径可恢复。
- Inspector 不触发全图重排。
- 键盘可以完成核心探索。

### Phase 7：动效强化

任务：

- 视图 morph
- Inspector 联动
- 筛选结果重排
- Standard → Graph 共享元素
- 首页单一 GSAP 叙事段
- 图谱相机与节点展开
- reduced-motion 全站退化

Gate C：

- 动效解释状态，不影响阅读和操作。
- 目标设备接近 60fps。
- 无 motion sickness 风险。

### Phase 8：质量硬化

任务：

- Storybook 状态矩阵
- Playwright 核心流程
- axe 自动扫描
- VoiceOver 或 NVDA 人工测试
- Lighthouse CI
- Bundle 分析
- 图谱规模与内存测试

### Phase 9：渐进上线

- 每个路由独立 ui-v2 flag。
- 先内部与小流量。
- 收集性能、错误和完成率。
- 旧 UI 保留两个稳定发布周期。
- 稳定后删除 legacy CSS 和 bridge。

## 15. 任务拆分规则

每个实现任务：

- 最多改约 5 个主要文件。
- 有明确 acceptance。
- 有明确 verify。
- 只处理一个页面、组件族或图谱能力。
- 不顺带修改信息架构和业务逻辑。

任务模板：

    - [ ] Task: 名称
      - Scope: 视觉、交互或图谱能力
      - Preserve: 必须保持的内容与行为
      - Acceptance: 可测试结果
      - Verify: 命令、截图和交互路径
      - Files: 预计文件
      - Rollback: feature flag 或 legacy 入口

## 16. 测试策略

### 16.1 Content Parity

- DOM 区块清单对比。
- 字段存在性对比。
- 操作入口对比。
- URL 状态对比。
- 数据数量对比。
- 页面标题和可访问名称对比。

### 16.2 Interaction

- 键盘导航。
- Focus return。
- Dialog 与 Sheet。
- Tabs 与 segmented control。
- 筛选、清除和撤销。
- 收藏、分享、打印。
- 列表、矩阵和图谱切换。

### 16.3 Motion

- 动画只使用 transform、opacity、clip-path。
- 不出现 layout thrashing。
- reduced-motion 完整。
- 页面切换不造成 CLS。
- Motion 和 GSAP 不争夺同一属性。

### 16.4 Graph

- 200、500、1000、5000 节点档位。
- 选择和路径延迟。
- 平移缩放帧率。
- 标签碰撞。
- Inspector。
- URL 恢复。
- 列表一致性。
- Canvas 失败退化。

### 16.5 响应式

- 1440 × 900
- 1280 × 800
- 1024 × 768
- 768 × 1024
- 390 × 844
- 360 × 800

### 16.6 无障碍

- WCAG 2.2 AA。
- axe critical 和 serious 为 0。
- 200% 缩放。
- 44 × 44px 触摸目标。
- 键盘完成核心任务。
- 图谱等价关系列表。

### 16.7 性能

- LCP < 2.5s。
- CLS < 0.1。
- INP < 200ms。
- 图谱 chunk 不进入普通详情首包。
- 3D、GSAP 和 H4G 独立 lazy chunk。
- 常用图谱平移缩放中位帧率不低于 50fps。

## 17. 验证命令

现有基线：

    npm run build
    npm run typecheck
    npm run validate:json
    npm run validate:indexes
    npm run test:api

实施后：

    npm run storybook
    npm run test:ui
    npm run test:e2e
    npm run test:a11y
    npm run test:visual
    npm run analyze:bundle
    npm run benchmark:graph

## 18. Definition of Done

### 信息架构

- 所有现有页面、区块、字段和操作有一一对应。
- 默认内容顺序和筛选语义不变。
- 原 URL、收藏、打印、反馈和对比行为通过回归。
- 新交互不降低可发现性。

### 视觉

- 不再出现暖纸、朱红、暗金、古籍衬线和传统档案风组合。
- 第一眼像现代知识基础设施。
- 信息密度不低于当前版本。
- 边框和同质化卡片数量明显减少。
- 品牌、控件、图谱和阅读页面属于同一系统。

### 交互与动效

- 所有控件拥有完整状态。
- 动效解释状态变化和关系变化。
- 关闭动效后功能完整。
- 关键路径接近 60fps。
- 无只能靠 hover、拖拽或手势完成的操作。

### 图谱

- Subject、Domain、Standard、Skill 四类实体可识别。
- 每种关系有图例、筛选和文本说明。
- Focus、Path、Compare、Inspector 和返回视口可用。
- 图谱与列表共享筛选和结果。
- 千级节点达到性能门槛。
- 3D 不成为默认或唯一视图。

### 工程

- 只有一套 token。
- 页面 CSS 不互相污染。
- 重型依赖按路由懒加载。
- build、typecheck、数据验证、API、Playwright 和 a11y 全部通过。
- 每个路由可以独立回退。

## 19. 风险与控制

| 风险 | 控制 |
| --- | --- |
| 再次把视觉升级变成 IA 重构 | Content Inventory 和 content parity gate |
| 新方向仍然像通用 AI SaaS | 禁止蓝紫渐变、假指标、全站玻璃和模板卡片 |
| 图谱只是演示 | 必须绑定真实实体、真实关系、URL 和 Inspector |
| 千级图谱卡顿 | Sigma + Graphology、LOD、Worker、cluster、裁剪 |
| 3D 影响可用性 | 仅实验、用户主动开启、移动端关闭 |
| 动效影响阅读 | 按页面设定动效强度，详情页保持低动效 |
| Motion 与 GSAP 冲突 | 分组件、分属性、统一 MotionProvider |
| 第三方库造成视觉拼贴 | 所有库经 kebiao wrapper，不引入默认皮肤 |
| 图谱无障碍不足 | 等价列表、键盘邻居导航、Inspector 焦点管理 |
| CSS 继续污染 | CSS Modules、@layer、Stylelint |
| 回滚困难 | 逐路由 feature flag 和 legacy bridge |

## 20. 非目标

- 不重做导航和页面架构。
- 不扩展搜索相关性和 Meilisearch 功能。
- 不改变数据 schema。
- 不生成新的先修关系。
- 不做权限、账号和云同步。
- 不改变 H4G 业务流程。
- 不引入全量 CSS 框架。
- 不复制参考图的中国风视觉。
- 不把 3D 作为默认图谱。

## 21. 审批 Gate

### Gate 0：基线

- 生产部署 URL、Git SHA、数据 manifest 和截图时间完整。
- Content Inventory 缺失项为 0。
- 当前 URL、数据数量和核心操作已经建立 smoke baseline。
- 未执行任何清理用户 worktree 的命令。

### Gate A：视觉概念

必须批准：

- Global Shell
- 首页
- 标准详情
- 图谱工作台
- 移动端
- Motion study
- 至少一个由真实课程坐标系生成的 kebiao 标志性交互
- 视觉评审确认没有中国风，也没有退化成通用靛蓝 AI SaaS

### Foundation Gate：设计系统

- canonical token 源数量为 1。
- legacy token 只能单向 alias。
- Storybook 组件状态覆盖完整。
- Stylelint 通过。
- axe critical 和 serious 为 0。
- Button、Checkbox、Tabs、Dialog 和 SearchField 键盘测试通过。

### Gate B1：图谱数据

- 100% 展示边可追溯。
- 推断生成 prerequisite 数量为 0。
- 首期关系集合已经批准。
- GraphModel 与 renderer 解耦。

### Gate B2：图谱引擎

必须批准：

- Benchmark
- Graph Engine ADR
- 2D renderer
- 3D 是否继续
- 图谱 query schema
- GraphA11yController 原型

量化门槛：

- 参考桌面：MacBook Air M1 级别或等效设备，Chromium 当前稳定版。
- 1000 节点首次可交互时间不高于 2.5s。
- 节点选择反馈不高于 100ms。
- 常用平移缩放中位帧率不低于 50fps。
- 1000 节点场景峰值内存目标不高于 250MB。
- 2D 图谱生产 lazy chunk gzip 增量目标不高于 300KB。
- Inspector 打开不触发全图重排。
- 键盘和读屏原型失败的引擎直接淘汰。

### Gate C：逐路由上线

必须批准：

- Content parity
- 视觉回归
- 交互回归
- 性能和 a11y
- 回滚开关

量化门槛：

- Content Inventory 缺失数为 0。
- 旧 URL 行为差异数为 0。
- 核心 E2E 全部通过。
- LCP、INP 和 bundle 不超过该路由批准回归预算。
- feature flag 回滚演练通过。

未通过 Gate A，不进入生产 UI 实现。

## 22. 当前建议

1. 以 Precision Intelligence Workbench 作为唯一方向继续概念设计。
2. 使用冷白 + 深石墨双表面和信号靛蓝，不保留暖纸朱红。
3. 用 Geist、中文 Variable Sans 和 Geist Mono 建立 sans 排版。
4. 先做四张高保真概念和 motion study，再写生产代码。
5. 图谱 Benchmark 已选择 Sigma.js + Graphology；精确版本和约束见 ADR-0001。
6. os-taxonomy 只参考呈现原则，不导入数据。
7. 3D 只做可选实验，不进入首期默认路径。
8. 当前信息组织和业务行为保持不变。

## 23. 执行记录（2026-07-11）

### 已完成

- Foundation 第一批：token、Geist 本地字体、MotionProvider、Global Shell、首页与标准详情视觉升级。
- Gate B1：2079 实体、6373 条获批关系；contains 2063、progression 788、skill_alignment 3522；missing provenance 0；推断 prerequisite 0。
- Gate B2 引擎基准：Sigma/Graphology、Cytoscape、G6、XYFlow 使用同一真实 topology fixture 完成三轮比较。
- ADR-0001：生产全局二维 renderer 锁定 `sigma@3.0.3 + graphology@0.26.0`；首期不做 3D。
- 中立 GraphModel、真实拓扑采样器、GraphA11yController、GraphFallbackList 和增量 query adapter。
- 标准详情“在图谱中定位”已接生产 lazy WebGL wrapper、关系层筛选、Inspector、provenance 与 DOM 等价列表。
- `/skills?view=graph` 已接 2079 实体全局图谱、可解释语义布局、LayerPanel、MiniMap、Legend、Inspector、VirtualizedRelationTree、搜索与 URL state。
- `/subjects/:slug?view=graph` 已接单学科图谱；Path Mode、四节点 Compare Overlay、路径文本与分享链接已落地。
- `/skills/:code?view=graph` 已接技能范围图谱；保留原信息顺序并完成 Skill Detail 冷白编辑式 Hero、定义证据区、深色 taxonomy 区的视觉升级。
- 专用 progression 视图已落地：只遍历显式有向关系，提供 Before → Current → After、完整学段序列、provenance、旁路提示和可恢复分享链接。
- Phase 7 动效强化已落地：列表/图谱 surface morph、Inspector 联动、筛选重排、Standard → Graph 共享连续性、620ms 图谱相机与节点脉冲、首页唯一 GSAP 叙事段及全链路 reduced-motion。
- 桌面 1440 × 900 与移动 390 × 844 浏览器验证通过，移动端无横向溢出，控制台 0 error。
- Phase 8 自动化质量硬化已落地：完整 Storybook primitive 状态矩阵、40 条 content parity/核心/响应式/回滚 E2E、16 条 axe 扫描、12 张视觉基线、Lighthouse CI、bundle budget、1000/5000 节点容量与内存门禁全部通过。
- ADR-0003 已建立逐路由 `ui-v2` 隔离开关；查询参数、localStorage 与环境变量优先级明确，标准详情回滚保留阅读、编码复制与收藏。
- Phase 4 支撑路由第一、二批完成：清单列表、清单详情、术语表、反馈与 Print 已统一到冷白课程坐标系；清单 Dialog 使用 React Aria，图标使用按文件导入的 Phosphor，并移除 Emoji、深色玻璃模板与 hover-only 删除。
- 清单详情增加并行标准加载与可撤销移除；反馈增加首错聚焦与失败保留输入；Print 在打印介质中隐藏全站壳层并保持 `collection` / `codes` 参数。
- Foundation Gate 新增 Stylelint 自动门禁；完整依赖审计为 0 vulnerabilities。七个支撑页面均为 route-level lazy chunk，当前 main 自定义 budget gzip 为 119.18 KB。
- H4G 与 Style Guide 已同步 kebiao V2：H4G 采用冷银高密度审核工作台和 React Aria 清空确认；Style Guide 改为 Foundation、Primitives、States、Graph language、Brand 五段式可操作设计系统，两页均独立 lazy chunk。
- Foundation Storybook 已补齐 Button、SearchField、Checkbox、Tabs、Dialog 的真实 React Aria 行为契约；浏览器键盘抽检和 axe 通过，Foundation Gate 自动项全部完成。
- Phase 9 渐进上线 runbook 已建立，包含 5%/20%/50%/100% 阶段、指标阈值、逐路由回滚、人工读屏与 legacy 删除条件。
- canonical token 已真正收敛：`design-tokens.css` 是唯一声明源，175 个 token 由自动契约守护；Search/Compare 已升级为冷白 aligned matrix，Subject/Skill Hero 的流体 blob 已替换为真实 H1→H4 课程坐标路径。
- 13 个生产路由现拥有一一对应的 route key 与环境 flag；Favorite 清单选择升级为按需加载 React Aria Popover/Dialog，Escape、焦点返回、axe 与 bundle 门禁通过。
- `validate:design-contract` 已加入质量链路，自动拒绝 token 重复、Emoji、阻塞式 alert/confirm、页面直连 React Aria、Phosphor barrel import 和缺失路由 flag。
- 13 路由机器可读 Content Inventory 已落地，逐页验证标题、关键操作、landmark、文本与 URL 参数；当前 parity/核心/回滚/响应式 40/40 通过。
- Tooltip、Toast、Skeleton、Disclosure 已收敛为统一生产 primitive，并进入真实页面与 Storybook；Tooltip 同时成为 CSS Modules 渐进隔离的首个样板。最新交互/内容/回滚/响应式 E2E 为 40/40。
- CSS Modules Wave 1 已扩展到 Header、Footer、GradeBandTabs、TSBadge 与 StateComponents；打印模式和跨组件联动改用显式 `data-kb-*` 契约，设计契约阻止旧全局 stylesheet 回流。证据见 `research/2026-07-12-css-modules-isolation-wave-1.md`。
- canonical cascade layer 顺序已建立，tokens/reset/base/utilities/overrides 分层生效；新增 `.sr-only` utility 修复 Glossary 重复可见标签。未迁移的 legacy global component styles 暂保留 unlayered，避免无意改变已验收视觉。
- CSS Modules Wave 2 已完成 Glossary、Print、Feedback 与 Collection Detail 四条完整 lazy route；测试选择器改为 role/`data-kb-*` 稳定契约，40 E2E、12 visual、16 axe 和 122.40 KB 主包门禁通过。证据见 `research/2026-07-12-css-modules-isolation-wave-2.md`。
- CSS Modules Wave 3 已完成 Collections、Style Guide、Search Results 与 Compare View；Search/Compare 联合隔离移除了其对首页筛选卡的全局串色，人工核对后只更新首页桌面基线。当前 40 E2E、12 visual、16 axe、123.35 KB 主包和 0 vulnerabilities 门禁通过。`os-taxonomy` 继续作为图谱层级浏览与渐进披露参考，未新增 renderer 或 CSS runtime。证据见 `research/2026-07-12-css-modules-isolation-wave-3.md`。
- CSS Modules Wave 4 已完成 Skills Overview、Subject、Skill Detail、Standard Detail、SkillCard、FavoriteButton/Popover 与 StandardRelationPanel；补齐 Subject / Skill Detail 锁定范围与浏览器历史恢复测试，并修复 Skill Detail 小字与深色技能色对比度。当前 42 E2E、12 visual、17 axe、125.81 KB 主包、0 lazy graph leak 与 0 vulnerabilities 门禁通过。证据见 `research/2026-07-12-css-modules-isolation-wave-4.md`。
- CSS Modules Wave 5 已完成 Home、H4G、Card/Column、Hero/Coordinate、Home Narrative 与完整 graph feature family；生产 page/component/feature 的非模块 CSS import 为 0，设计契约阻止回流。当前 43 E2E、12 visual、17 axe、Storybook、motion/graph contract、127.85 KB 主包、0 lazy graph leak 与 0 vulnerabilities 全部通过。证据见 `research/2026-07-12-css-modules-isolation-wave-5.md`。
- Phase 9 回滚语义已机器化：5 个 enhancement route 与 8 个 passthrough route 明确区分，13 路由 legacy 模式逐页验证冻结内容与增强项消失；Subject legacy 的图谱按钮错误已修复。证据见 `research/2026-07-12-ui-rollback-contract-audit.md`。
- 图谱语义质感强化完成：能力元数据进入中立 GraphModel，Inspector、搜索与读屏由编码优先升级为名称优先；os-taxonomy 继续作交互参考，XYFlow 经复核仍不引入，避免第二套 renderer。证据见 `research/2026-07-12-graph-semantic-polish.md`。
- Gate 0 五档基线自动取证完成：本地候选与正式域名各 13 路由 × 5 视口，共 130 张截图；checksum、源码/部署指纹、Content Inventory、overflow、console/page error 与生产/本地 comparison manifest 已落地。捕获修复 Skill Detail 移动端 72/102px Grid min-content 溢出；当前生产 65/65 截图仍为旧“课标罗盘”，V2 contract drift 明确，尚未发布 V2。证据见 `baselines/2026-07-12-ui-v2-local-five-viewport/README.md`、`baselines/2026-07-12-production-five-viewport/README.md`。
- Gate C 辅助模式自动项强化：13 路由在 forced-colors + 390px 下保留布局、聚焦与可见焦点变化；13 路由在 DPR 2 / 720px CSS viewport 的 200% 显示缩放代理下无横向溢出。axe/辅助模式现为 20 条；Tooltip 额外验证真实 Tab 焦点、Portal 语义与移动视口避让。VoiceOver/NVDA 仍保持人工待签字，模板见 `baselines/2026-07-12-screen-reader-manual-signoff.md`。
- 移动触控硬化完成：390 × 844 与 360 × 800 两档、13 路由共审计 3,876 个真实可见交互目标，小于 44 × 44px 为 0；10 个面包屑文字链接作为显式语义例外写入 manifest。GitHub 项目复核继续采用 os-taxonomy 交互模型、Sigma/Graphology 唯一图谱运行时与 Motion 唯一常规动效运行时，不引入重复 renderer/animation runtime。证据见 `research/2026-07-12-touch-target-and-github-project-decision.md`。
- Sigma 首帧稳定契约已补齐：GraphCanvas 只有在初始相机定位并完成一次 `afterRender` 后才标记 `data-kb-ready=true`；标准局部图视觉测试改为等待该信号，连续 5 轮保持同一基线，不再把随机相机中间态冻结为视觉结果。
- 移动导航质感硬化完成：现有 Motion 负责固定浮层、遮罩、链接错峰进入与退出过渡；菜单不再推动页面内容，Escape 会关闭并返回触发器焦点，透明度经 390px 实图检查后收敛到清晰白色表面。信息架构与导航项未改。证据见 `research/2026-07-12-mobile-navigation-polish.md`。
- StandardCard 长列表交互完成去跳动硬化：编码改为常驻头部元信息，移除会改变卡片高度的 hover footer；复制/展开统一 44px，更多菜单补齐 menu 语义、首项焦点和 Escape 返回，所有反馈只使用受控 transform/opacity/color。证据见 `research/2026-07-12-standard-card-interaction-polish.md`。
- Floating layer 已系统化：Tooltip 与 StandardCard action menu 共享 `useFloatingLayer` 的 fixed/autoUpdate/flip/shift/ready 契约；菜单 Portal 脱离卡片 overflow，并补齐 ArrowUp/ArrowDown/Home/End 导航。
- 五档触控门禁在术语/反馈阶段已全量闭环：该轮 13 路由 × 5 视口共 10,910 个可见交互目标，低于 44 × 44px 为 0；其中移动端 3,948 个候选失败为 0。后续 H4G 虚拟化在不删除信息的前提下降低不可见节点，最新数量见本节末记录。
- 首页品牌叙事的 lazy boundary 已从纯黑占位改为与最终三栏结构同构的课程坐标 Skeleton；未滚入视口时保留学科→领域→标准→能力的视觉轮廓，滚入后替换为 GSAP/静态 reduced-motion 内容，不改变信息顺序。证据见 `research/2026-07-12-home-narrative-lazy-boundary.md`。
- 标准详情的相邻标准预览已落地：上一条/下一条链接在 hover 或键盘 focus 时显示真实数据驱动的编码、摘要、学科、领域和年级；定位复用 Floating UI primitive，链接名称和跳转语义不变。证据见 `research/2026-07-12-standard-sequence-preview.md`。
- 搜索对比结果快速预览已落地：仅在 CompareView 中为 StandardCard 启用，正文链接 hover/focus 时显示真实教学线索与能力关联；预览通过 top-start + flip/shift 避免宽链接定位溢出，不改变结果顺序或卡片高度。证据见 `research/2026-07-12-search-result-quick-preview.md`。
- 首页学科与能力关系提示已落地：学科入口直接显示真实标准数、领域数和领域索引，能力入口显示跨学科覆盖与子技能数；hover/focus 只增强关系线与层级，不改变入口顺序。初版低透明度因 WCAG 对比不足被门禁否决，最终改为始终可读的中性灰。证据见 `research/2026-07-12-home-entry-relationship-preview.md`。
- 搜索筛选可逆工作流已落地：已选学科/学段/能力以可移除 chip 呈现，支持批量清除、原状态撤销与重置反馈；空状态保持应用按钮禁用，不会提交非法 compare URL。展开态单独通过 axe，所有新增控件至少 44px。证据见 `research/2026-07-12-search-filter-reversible-workflow.md`。
- 对比差异模式已落地：同一学科多学段网格可切换“突出差异”，领域行不重排；数量差异同时使用摘要文字、领域标记、列内数量标签、靛蓝背景与边缘线，不依赖红绿。Motion 仅负责标记进出，reduced-motion 自动退化。证据见 `research/2026-07-12-compare-difference-mode.md`。
- 移动对比所属上下文已补齐：桌面列头在单列折叠后不再是唯一归属来源；CompareView 为卡片传入学科/学段 context label，仅在 768px 以下常驻显示，覆盖多学段与多学科两种模式。证据见 `research/2026-07-12-mobile-compare-ownership.md`。
- 标准详情阅读目录联动已升级：当前章节以唯一 `aria-current="location"` 表达，Motion 共享 `layoutId` 指示器会在 sticky 目录项之间连续移动；锚点 URL、IntersectionObserver、内容顺序与 reduced-motion 语义保持不变。筛选展开态 axe 同步改为等待有限进入动画结束，避免中间透明度帧造成对比度误报。证据见 `research/2026-07-12-standard-reading-nav-motion.md`。
- 清单列表的批量工作流已落地：自定义清单可进入显式选择模式，支持全选、批量删除确认、完整 localStorage 快照与 6 秒 Toast 撤销；默认收藏夹永不进入删除集合，恢复时不覆盖同 ID 新数据。桌面与 390px 使用同一信息结构，移动选择态无溢出且所有操作至少 44px。证据见 `research/2026-07-12-collection-batch-selection-undo.md`。
- 术语表索引连续性已落地：13 条术语获得稳定深链接，分类、搜索和当前术语由 URL 恢复；sticky 索引通过原生 IntersectionObserver 跟随阅读位置，Motion 只移动分类/术语指示器。相关 schema code 在确有目标定义时成为可访问链接，浏览器返回恢复原术语焦点；移动端索引转为横向轨道。证据见 `research/2026-07-12-glossary-index-continuity.md`。
- 反馈页状态闭环已完成：补齐页面 URL 自定义校验、pending live status、可控网络失败保留输入、mailto 降级、真实成功确认与继续提交焦点恢复。Playwright 使用测试 key 和网络拦截验证 pending/503/success，不使用蜜罐路径伪造成功；成功页同时修复 sticky Header 遮挡聚焦标题。证据见 `research/2026-07-12-feedback-state-completion.md`。
- H4G 390 组审核队列已使用 `@tanstack/react-virtual@3.14.5` 完成真实规模虚拟化：五档只挂载 9 至 13 项，支持方向键/Home/End、长距离焦点恢复和外层页面防跳动；五档全站触控候选由 10,910 降至 9,009。`react-resizable-panels` 因缺少用户收益证据暂不引入。证据见 `research/2026-07-12-h4g-virtual-queue.md`。
- Phase 9 已依产品方“不等待 48 小时”的明确授权完成同日加速发布：冻结候选 `520f31c` 依次经历 production-default-off、5%、20%、50% 与两次连续 100% 生产部署，六次均为 Vercel READY，逐阶段 error-level Runtime Logs 为 0；5/20/50/100 四份机器报告均输出 `decision=advance`。该结论不声称完成长期真实流量观察，完整边界与部署证据见 `releases/KEBIAO_V2_PHASE9_ACCELERATED_RELEASE.md`。

### 当前 Gate 状态

| Gate | 状态 | 证据 / 剩余 |
| --- | --- | --- |
| Gate 0 | 通过 | 冻结信息架构与五视口机器基线完成；产品方已确认无需继续保留单独人工审核页面，生产已发布 V2 |
| Gate B1 | 通过 | `graph-data-readiness-audit.md` + 自动校验 |
| Gate B2 engine decision | 通过 | benchmark + ADR-0001 + 40.51 KB gzip GraphCanvas lazy chunk |
| Gate B2 Skills route integration | 通过 | history/share/unknown params、无重排 Inspector、WebGL fallback、桌面与移动验证 |
| Phase 6 | 核心完成 | 标准局部图、Skills 全局图、Subject 图、Skill Detail 图、Path、Compare、progression 专用路径及 URL 恢复均已落地 |
| Phase 7 | 完成 | ADR-0002；GSAP 独立延迟 chunk；桌面滚动 median 16.70ms / p95 17.70ms；移动与 reduced-motion 退化通过 |
| Phase 8 | 完成（自动化与 VoiceOver 结构任务流） | 发布候选本轮 55 E2E、25 axe/辅助模式、19 visual 与 60 份五视口基线通过；VoiceOver 结构/焦点任务流已执行，外部 NVDA 验收包已交接 |
| Phase 4 supporting routes | 完成 | 清单、清单详情、术语、反馈、Print、H4G 与 Style Guide 已同步冷白课程坐标系与交互契约 |
| Foundation Gate | 自动项通过 | canonical token、完整 Storybook primitive 状态矩阵、Stylelint、axe 与 Button/Checkbox/Tabs/Dialog/SearchField 键盘测试通过 |
| Gate C | 同日加速生产验收通过 | axe critical/serious 0；Lighthouse、视觉、E2E、bundle、五档 production build、回滚探针、Production READY 与 Runtime Logs 门禁通过；不等同 48 小时真实流量稳定性 |
| Phase 9 | 同日加速发布完成 | default-off → 5% → 20% → 50% → 100% cycle 1/2 全部执行；四份机器报告均为 `advance`，最终生产为 100% V2，路由级回滚仍保留 |
