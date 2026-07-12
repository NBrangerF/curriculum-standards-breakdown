# kebiao UI 与视觉设计升级规格

- 状态：Draft，等待产品评审
- 日期：2026-07-10
- 适用仓库：curriculum-standards-breakdown
- 品牌名：kebiao
- 固定副标题：中国课程标准的结构化索引与智能引擎

## 1. 决策摘要

这次升级不是在现有卡片界面上继续装饰，而是重建一套与产品价值一致的界面语言。

kebiao 应被看成一套可信、可检索、可比较、可追溯的课程标准基础设施。视觉上采用“编辑型信息设计 + 精密数据工具”，避免教育网站常见的插画化、儿童化，也避免通用 SaaS 模板的紫色渐变、大圆角和悬浮卡片堆叠。

产品拆成三种表面：

| 表面 | 主要用户 | 视觉密度 | 动效强度 | 核心任务 |
| --- | --- | ---: | ---: | --- |
| 品牌入口 | 首次访问者、普通教师 | 中低 | 中高 | 理解 kebiao、进入检索或浏览 |
| 研究工作台 | 教师、教研员、课程研究者 | 中高 | 低 | 检索、阅读、比较、收藏、打印 |
| 内部审核台 | 编辑与审核人员 | 高 | 极低 | 批量核查、处理证据与发布状态 |

现有 React、Vite、React Router、数据模型、URL 查询参数、分享链接、对比逻辑和所有深链继续保留。此次不迁移框架，不改课程数据，不把外部项目整站复制进来。

## 2. 当前设计诊断

当前界面“能用”，但没有形成稳定的产品认知，主要问题如下：

1. 品牌表达泛化。渐变、光斑、网格和大量卡片更像通用 AI SaaS，不能表达“中国课程标准的结构化索引”。
2. 视觉层级不稳定。页面级 CSS 互相覆盖，局部组件会改变其他页面的文字、加载状态和对比度。
3. 设计令牌存在两个来源。design-tokens.css 的青色体系会被 index.css 的蓝紫色体系覆盖，令牌没有成为真正的唯一事实源。
4. 信息架构混合了公众产品和内部工具。“人工审核”出现在公共导航，但词汇表等公众能力反而隐藏。
5. 首页有三个主行动，叙事焦点分散。产品价值、搜索能力和内容来源没有形成清晰的注意力顺序。
6. 搜索承诺与实现不一致。首页暗示支持字段级文本搜索，当前搜索页主要使用学科、学段和能力筛选，但仓库中的 Meilisearch 后端已经具备全文搜索与 facet 能力。
7. 核心筛选控件隐藏原生 checkbox，键盘用户难以可靠访问。
8. 移动端首页边距被覆盖，内容贴边。跨学段对比在移动端先堆叠全部表头，再堆叠全部内容，学段上下文会丢失。
9. 图标语言不统一。emoji、手写 SVG 和文字符号同时存在，削弱可信感。
10. StyleGuidePage 是业务路由中的静态展示页，无法承担组件隔离、状态覆盖与视觉回归的职责。

## 3. 产品目标与非目标

### 3.1 目标

- 让用户在 5 秒内理解 kebiao 是什么，并能立即开始检索或按学科浏览。
- 把课程标准从“卡片集合”提升为可检索、可比较、可追溯的结构化知识系统。
- 建立唯一、可维护、可测试的视觉系统。
- 让核心工作流在键盘、触屏、小屏和缩放场景下完整可用。
- 使用成熟开源项目承担复杂交互，不复制它们的默认皮肤。
- 保持中国大陆网络环境下的稳定性，字体、图标和必要资源不依赖运行时境外 CDN。

### 3.2 非目标

- 不迁移到 Next.js、Tailwind、Ant Design 或其他全量框架。
- 不改变现有路由 slug、数据 schema、课程标准内容或后端接口。
- 不在第一阶段实现登录、多人协作或新的内容管理系统。
- 不把知识图谱作为唯一导航方式。
- 不复制 OpenMetadata、roadmap.sh、Outline 或其他项目的代码和品牌外观。
- 不在研究工作台使用滚动劫持、持续视差或无意义入场动画。
- 第一阶段只做亮色主题，深色主题在令牌层预留，不增加主题切换器。

## 4. 品牌与设计方向

### 4.0 gpt-taste 设计抽签结果

本次方向使用 gpt-taste 的受控随机设计法，RNG seed 为 125：

- Hero：Cinematic Center
- Typography：Cabinet Grotesk + Source Han Sans SC
- Signature components：Infinite Index Rail、Inline Data Windows、Evidence Carousel
- Motion：Scrubbing Text Reveal + Scroll Pinning

Evidence Carousel 只有获得真实用户反馈后才启用，第一阶段不得编造教师评价。Cabinet Grotesk 在完成字体许可证确认前使用 Geist 作为回退。

### 4.1 品牌锁定

- 主品牌统一写作 kebiao，全部小写。
- 固定副标题统一写作：中国课程标准的结构化索引与智能引擎。
- 首页、Header、Footer、网页标题、分享卡片、打印页和空状态中移除“课标罗盘”及旧副标题。
- 不使用指南针、书本、机器人或 emoji 作为品牌符号。
- 品牌图形方向：由字母 k 与“索引网格 / 层级节点”组合成极简符号。它是结构化索引的隐喻，不是装饰性插画。

### 4.2 体验调节值

| 表面 | 视觉差异度 | 动效 | 信息密度 |
| --- | ---: | ---: | ---: |
| 首页 | 7/10 | 6/10 | 4/10 |
| 公共工作台 | 4/10 | 3/10 | 7/10 |
| 内部审核台 | 2/10 | 2/10 | 9/10 |

### 4.3 设计原则

1. 结构先于装饰。层级、对齐、节奏和内容关系优先于渐变、阴影和插图。
2. 一个品牌强调色。学科色和状态色只表达数据语义，不参与通用装饰。
3. 真实数据就是主视觉。标准代码、学段、学科、领域和能力关系比假仪表盘更有说服力。
4. 文档感与工具感并存。阅读区域像经过编辑的出版物，操作区域像精密研究工具。
5. 渐进披露。默认显示决策所需信息，复杂元数据、筛选项和证据按需展开。
6. 可访问性是组件契约，不是上线前补丁。
7. 动效只解释变化、保持上下文或建立叙事，不承担装饰。

## 5. 视觉系统

### 5.1 色彩

建议建立以下语义令牌。实施前用自动化对比度测试确认最终值。

| 令牌 | 建议值 | 用途 |
| --- | --- | --- |
| ink-950 | #171916 | 主文本、深色行动区 |
| ink-700 | #3B3F39 | 次级标题 |
| ink-600 | #62675F | 辅助文本 |
| canvas | #F8F6EF | 暖纸页面底色 |
| surface | #FFFEFA | 阅读与操作表面 |
| surface-muted | #F1EEE4 | 分组、选中前状态 |
| border | #D5D0C3 | 分隔线、控件边界 |
| brand-700 | #B43C2B | 主按钮、链接、当前索引 |
| brand-800 | #912F22 | Hover、Pressed |
| brand-100 | #F4E2DD | 轻量选中和批注底色 |

规则：

- 页面以暖纸色 canvas 和暖白 surface 为主，不做整页蓝紫渐变。
- 品牌强调色只使用“索引朱”。成功、警告、错误属于状态语义。
- 学科色只出现在 3 至 4 像素索引线、数据点、标签小标记和图谱节点，不染满整张卡片。
- 文本对比度至少满足 WCAG AA，普通文本目标 4.5:1，交互焦点在各种表面都清晰可见。
- 已核算的基础对比度：brand-700 / surface 为 5.75:1，ink-600 / canvas 为 5.36:1，ink-950 / canvas 为 16.36:1。

### 5.2 字体

- 中文正文与界面：Source Han Sans SC，自托管，400、500、600、700。
- 首页英文品牌与大号拉丁标题：Cabinet Grotesk，自托管；许可证未确认前回退为 Geist。
- 课程标准代码：Geist Mono 或 JetBrains Mono，自托管或经过许可的本地子集。
- 正文行宽控制在 66 至 76 个中文字符对应的视觉宽度。
- 主标题不超过两行，首页 Hero 文字区域总共不超过三行核心文案。

### 5.3 形状、边界与阴影

- 页面级容器圆角 14px，控件圆角 10px，小标签 6px。
- 只有标签、状态和紧凑筛选项使用胶囊形，不把按钮、卡片和导航全部胶囊化。
- 优先使用 1px 边界、色块与留白建立层级。
- 阴影只用于浮层、抽屉和跨层拖拽状态，不为每张卡片添加阴影。
- 卡片默认不位移。Hover 使用边框、底色和局部高亮，不使用统一上浮。

### 5.4 栅格与间距

- 桌面最大内容宽度 1440px，12 列栅格，左右 gutter 32px。
- 1024px 至 1279px 使用 24px gutter。
- 小于 768px 使用 16px gutter，任何组合选择器不得覆盖移动端页面边距。
- 基础间距序列：4、8、12、16、24、32、48、64、96。
- 研究工作台优先使用纵向紧凑节奏，营销首页才允许 96px 级区段间距。

### 5.5 动效

- 微交互默认 140 至 220ms，使用 opacity、transform、clip-path。
- 布局变化默认 240 至 360ms，保持用户当前上下文。
- 首页唯一的重型叙事段可使用 GSAP ScrollTrigger。
- 研究工作台使用 Motion 处理筛选 chip、抽屉、结果重排和详情过渡。
- 支持 prefers-reduced-motion。减弱模式下取消滚动 scrub、视差与大位移。

## 6. 信息架构

### 6.1 公共导航

建议主导航与现有 URL 映射：

| 导航 | 目标 |
| --- | --- |
| 学科索引 | /#subject-index |
| 标准检索 | /search |
| 跨域对比 | /search?mode=compare |
| 能力图谱 | /skills |
| 我的清单 | /collections |

右侧固定提供全局搜索入口，并显示 Ctrl/Command + K 快捷键提示。窄屏改为菜单按钮与搜索按钮。

“人工审核”从公共导航移除，路由继续保留，进入独立的内部审核 Shell。词汇表放入 Footer 和检索页的术语帮助，不占一级导航。

### 6.2 路由策略

保留以下现有深链：

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
- /feedback
- /h4g-review

/styleguide 不再作为公共产品页面。Storybook 就绪后将其重定向到首页或仅在开发环境启用。

## 7. 页面级升级方案

### 7.1 首页

采用 AIDA 叙事，Hero 只保留两个主行动。

#### Attention

- 使用居中的 Cinematic Center，而不是常见的左右 SaaS Hero。
- 中央：单行超大 kebiao 字标、固定副标题、一句价值说明。
- 主行动：检索课程标准。
- 次行动：按学科浏览。
- 字标后方与首屏下沿使用真实数据生成的 Data Portrait，展示学科、学段、标准代码与能力关系。它不是静态假图表。
- 首屏不放版本 pill、三组 CTA、emoji 和泛化的漂浮光球。

#### Interest

使用 12 列 2 行的紧凑 Bento，用 1px 编辑规则线分隔，24 个网格单元全部填满：

- 真实检索与字段展开占 7 × 2，共 14 个单元。
- 跨学段差异片段占 5 × 1，共 5 个单元。
- 标准与能力关系占 5 × 1，共 5 个单元。

内容直接引用真实索引样本，让用户看到结果格式、筛选方式和标准代码。

#### Desire

一个可选的 pinned narrative，依次解释：

标准文本 → 学段进阶 → 可迁移能力 → 教学与证据线索

左侧滚动叙事，右侧固定展示同一条真实标准的结构变化。只在桌面启用完整 ScrollTrigger，小屏改为普通纵向步骤。

#### Action

底部使用 ink-950 高对比行动区，重复两个行动中的主行动，不增加第三种路线。

### 7.2 标准检索页

桌面采用三栏研究工作台：

| 区域 | 建议宽度 | 内容 |
| --- | ---: | --- |
| FacetRail | 264 至 288px | 学科、学段、领域、能力、来源 |
| Results | 自适应 | 搜索框、结果数、已选筛选、排序、结果列表 |
| PreviewPanel | 360 至 420px | 当前标准预览、元数据、收藏、打开详情 |

关键行为：

- 接入现有 Meilisearch，真正搜索代码、标题、标准文本、上下文、实践建议、证据与领域。
- facet 数量来自搜索索引，不在前端硬编码。
- URL 是搜索状态的唯一可分享来源，刷新和后退不会丢失查询。
- 结果列表默认采用紧凑行，不用大卡片瀑布。
- 高亮命中词，但不破坏中文断句。
- 空状态解释“没有结果的原因”，并提供一键清空部分筛选。
- 移动端使用顶部固定搜索，FacetRail 进入底部抽屉，PreviewPanel 进入全屏详情层。

### 7.3 学科页

- 将大面积 Subject Hero 改为紧凑学科 masthead。
- 学科色只作为左侧索引线或小型数据标记。
- 主要结构：学科概览、学段 Tabs、领域目录、标准结果。
- 学段与领域的选择同步 URL。
- 桌面提供 sticky 工具栏，小屏使用横向可滚动 Tabs 并保留当前学段名称。

### 7.4 标准详情页

- 顶部：面包屑、标准代码、标题、学科与学段元数据、收藏与打印。
- 主栏：标准原文、解释、上下文、实践建议、证据。
- 侧栏：页面目录、来源、相关标准、相关能力。
- 长文阅读采用编辑型排版，不把每个段落放进独立卡片。
- 复制、收藏、分享成功使用统一 Toast。
- 打印模式去除导航、交互按钮、背景和动画，保留来源与更新时间。

### 7.5 跨域对比

对比页是高密度矩阵，不再是并排卡片。

- 第一列固定领域 / 子领域。
- 后续列是用户选择的学段或学科。
- 顶部学段表头 sticky，第一列 sticky。
- 支持行分组、展开、差异高亮、只看差异和共享横向滚动。
- 选择器保留现有 draft → apply 逻辑，避免每次勾选都重算矩阵。
- 大数据量使用行虚拟化。
- 移动端一次显示一组对比对象，顶部明确当前两列，可左右切换。禁止“先全部表头、后全部内容”的堆叠。

### 7.6 能力总览与能力详情

- 默认视图是可访问、可搜索的能力列表。
- 次级视图是关系图谱，使用真实标准与能力关联数据。
- 图谱支持缩放、聚焦、邻居高亮、按学科 / 学段筛选。
- 每次图谱操作都有等价列表结果，屏幕阅读器不依赖 Canvas 理解关系。
- 第一阶段使用 React Flow 构建中等规模、可聚焦的只读关系浏览器。只有压测证明节点规模或聚类分析需求超出 React Flow 能力时，才通过新 ADR 改用 AntV G6。

### 7.7 清单

- 清单页改为紧凑工作区，支持选择、批量移除、打印和分享。
- 删除或清空使用可访问 Dialog，不用浏览器原生 confirm。
- 空清单展示如何从检索和详情页收藏，不放装饰性插画。

### 7.8 反馈

- 保留短表单，使用统一字段、错误、成功和提交中状态。
- 所有样式进入 CSS Module，禁止 spinner、definition-text 等无命名空间全局选择器。

### 7.9 内部审核台

- /h4g-review 使用独立 InternalShell，不出现在公共导航。
- 采用高密度表格、状态列、批量操作和证据抽屉。
- 不使用首页动效、Bento、营销文案和大标题。
- 可继续共享 Button、Checkbox、Dialog、Table 等底层无障碍 primitive。

### 7.10 系统状态与 404

统一覆盖：

- 初次加载 Skeleton
- 局部刷新
- 空结果
- 数据错误
- 离线或搜索服务不可用
- 权限不足
- 404

Skeleton 尺寸必须接近真实内容，避免布局跳动。

## 8. 外部项目使用矩阵

外部项目分为“直接依赖”“开发质量工具”“设计参考”。只有第一类会进入生产 bundle。

依赖核验时间为 2026-07-10。安装时不使用 GitHub default branch 或 beta 标签，必须锁定经过测试的 npm 版本。当前兼容性基线建议为 Node 20.19+：

- React Aria Components 1.19 支持现有 React 18。
- React InstantSearch 7.39 使用 InstantSearch.js 4.105，与当前 Meili adapter 的 v4 系列声明匹配。
- @meilisearch/instant-meilisearch 0.31.2、Storybook 和 Playwright 共同推动 Node 基线升级。
- React Flow 12.11 支持现有 React 18。

### 8.1 直接依赖

| 外部项目 | 包 | 使用位置 | 解决的问题 | 明确边界 | 许可证 |
| --- | --- | --- | --- | --- | --- |
| React Aria Components | react-aria-components | 全站 primitive、筛选器、弹层、Tabs、Dialog、ComboBox | 键盘、焦点、ARIA、跨设备交互 | 只用无样式行为层，不引入 React Spectrum 视觉皮肤 | Apache-2.0 |
| Phosphor Icons | @phosphor-icons/react | Header、按钮、筛选、收藏、打印、反馈 | 统一图标语言与可读名称 | 不混用 emoji、Lucide、手写 SVG | MIT |
| Motion | motion | 研究工作台、抽屉、筛选 chip、结果重排、布局过渡 | 保持状态变化的空间连续性 | 不用于首页 pinned narrative，不做全局滚动劫持 | MIT |
| GSAP | gsap、@gsap/react | 仅首页 Desire 叙事段 | 精确编排 ScrollTrigger 和时间线 | 不进入搜索、详情、矩阵、审核台；采用前先完成许可证确认 | Standard no-charge license |
| React InstantSearch | react-instantsearch | 标准检索页、全局搜索 | 查询状态、facet、命中高亮、分页与自定义 UI | 不使用默认电商皮肤，不接 Algolia 专属推荐和 Insights | MIT |
| instant-meilisearch | @meilisearch/instant-meilisearch | InstantSearch 与现有 Meilisearch 之间 | 复用现有搜索索引和过滤能力 | 不更换搜索后端；浏览器只允许 search-only key | MIT |
| TanStack Table v8 | @tanstack/react-table | 跨域对比、内部审核台 | Headless 分组、排序、展开、列模型 | 锁定稳定 v8，不跟随 v9 beta | MIT |
| TanStack Virtual | @tanstack/react-virtual | 对比矩阵、长结果列表 | 大列表和矩阵虚拟化 | 只在达到性能阈值后启用，避免小列表复杂化 | MIT |
| React Flow | @xyflow/react | 能力关系图谱 | React 节点、关系交互、键盘与读屏辅助能力 | 图谱是次级只读视图，必须提供等价列表；不把它用于首页装饰 | MIT |
| AntV G6，候选 | @antv/g6 | 只有在大规模聚类与图分析压测中胜出时 | 大图布局、Canvas/SVG/WebGL 与图分析 | 第一阶段不安装，不与 React Flow 同时存在 | MIT |

### 8.2 开发质量工具

| 外部项目 | 使用位置 | 目的 | 不进入的范围 |
| --- | --- | --- | --- |
| Storybook | src/ui、src/features 的 stories | 替代公共 StyleGuidePage，隔离组件、状态与文档 | 不进入生产路由 |
| Storybook a11y addon | 每个 primitive 与复合组件 | 开发期无障碍检查 | 不能替代人工键盘和读屏测试 |
| Playwright | 桌面、平板、手机核心流程 | E2E、截图对比、URL 状态、键盘行为 | 不使用脆弱的像素级全页断言覆盖所有内容 |
| axe-core / @axe-core/playwright | Playwright 核心页面 | 自动发现关键 WCAG 问题 | 不能证明完整可访问性 |

Storybook 与当前 Playwright 工具链要求统一到 Node 20 或更高版本，必须在本地和 CI 同步后再加入。Playwright 使用 Apache-2.0，axe-core 使用 MPL-2.0。

### 8.3 字体资源

字体只在构建时引入并自托管：

- Source Han Sans SC
- Cabinet Grotesk，许可证确认后
- Geist / Geist Mono
- JetBrains Mono

可以用 Fontsource 作为可版本锁定的来源，也可以将审阅过许可证的 WOFF2 放入本地 assets。生产页面不访问 Google Fonts 或其他境外字体 CDN。

### 8.4 只做设计参考，不复制代码

| 项目 | 借鉴部分 | 不借鉴部分 |
| --- | --- | --- |
| OpenMetadata | 搜索优先的信息架构、结果与关系预览 | 企业后台视觉皮肤、全部导航层级 |
| DataHub | 数据目录的 facet、实体详情、lineage 思路 | 数据治理术语和复杂管理入口 |
| Kolibri Design System | 教育场景的可访问性、筛选与低带宽意识 | Vue 组件实现和品牌视觉 |
| roadmap.sh | 学习路径的层级与进度阅读方式 | 代码、插画和受限制的视觉资产 |
| Open Knowledge Maps / Headstart | 聚类图与列表互相联动 | 把图谱作为唯一浏览方式 |

### 8.5 明确不引入

- 不引入整套 Ant Design。它会把 kebiao 推向通用后台外观并增加样式覆盖成本。
- 不引入默认 shadcn 组件集。React Aria 已承担行为层，重复 primitive 会造成两套交互契约。
- 不引入 cmdk。全局命令搜索优先由 React Aria ComboBox / Dialog 组合完成。
- 不同时引入 G6 和 React Flow。先用 React Flow 验证中等规模关系浏览和无障碍路径，G6 只作为压测后的替代方案。
- 不引入整页 Smooth Scroll 库。

## 9. 代码与样式架构

保留当前技术栈，逐步拆分为：

    src/
      design/
        tokens.css
        fonts.css
        reset.css
      ui/
        primitives/
        composed/
      features/
        search/
        compare/
        curriculum-graph/
        collections/
      pages/
      shells/
        PublicShell.jsx
        ResearchShell.jsx
        InternalShell.jsx
      stories/
    e2e/

规则：

- tokens.css 是唯一颜色、字体、间距、圆角、阴影、层级、动效来源。
- 页面与组件使用 CSS Modules。只允许 reset、tokens、字体和少量辅助类进入全局 CSS。
- primitive 统一管理 disabled、hover、focus-visible、pressed、loading、error 等状态。
- 业务组件不得用 .spinner、.card、.title、.definition-text 等裸全局类名。
- 路由页面按页面边界 lazy import，首页图谱和 GSAP 段按可见性动态加载。
- 图标按组件导入，禁止整包导入。
- 搜索、对比和图谱状态必须可序列化到 URL 或稳定的业务状态，不藏在动画组件内部。

## 10. 实施批次

每个批次拆成最多 5 个主要文件的可审查任务，完成验证后再进入下一批。

### Phase 0：规格与依赖 ADR

- 评审本文档、品牌方向、导航和页面责任。
- 冻结 1440、1024、768、390、360 五档截图基线。
- 固化 13 个路由、URL 查询参数、结果数量、收藏格式、反馈字段和内部审核导出行为。
- 为标准深链、搜索分享链接、收藏和对比建立 Playwright smoke test。
- 设计逐路由 ui-v2 feature flag，回滚只切换视图，不回滚数据与 API。
- 创建每个生产依赖的 ADR，记录包版本、许可证、bundle 影响和退出方案。
- 将本地与 CI 的 Node 基线统一到 20.19+。
- 产出三张关键线框：首页、标准检索、跨域对比。
- 此阶段不改 UI 代码。

### Phase 1：视觉基础与样式隔离

- 合并重复设计令牌。
- 新令牌统一使用 --kb-* 命名，并按 reference、semantic、component 三层组织。
- 使用 @layer reset, tokens, base, components, pages, utilities 固定 cascade 顺序。
- 引入自托管字体与统一图标。
- 建立 reset、tokens、CSS Modules 约束。
- 修复全局选择器污染、checkbox 键盘问题与移动端 gutter。
- 旧 token 只通过单向 compatibility bridge 过渡，新组件禁止同时读取新旧 token。

### Phase 2：Primitive 与 Shell

- 使用 React Aria 构建 Button、Checkbox、Tabs、Dialog、Disclosure、Popover、ComboBox。
- 建立 PublicShell、ResearchShell、InternalShell。
- 重做 Header、Footer、全局搜索和系统状态。
- 建立 Storybook 与 a11y 检查。

### Phase 3：首页与品牌

- 替换品牌、title、favicon、分享图和旧文案。
- 实现 AIDA 首页与真实数据索引格。
- 用 Motion 完成轻交互。
- GSAP pinned narrative 作为独立增强项，可在许可证或性能不满足时降级为普通步骤。

### Phase 4：标准检索

- 将 Meilisearch 接入 React InstantSearch。
- 保留 SearchAdapter = local | meili 的切换边界，搜索服务失败时不让整个检索页失效。
- 完成三栏工作台、facet、URL 同步、命中高亮与预览。
- 完成移动端筛选抽屉和全屏预览。
- 建立标准代码、自然语言和多 facet 的 golden queries，验证排序与结果数量。
- 客户端只使用 search-only key，索引版本和 filterable attributes 进入部署检查。

### Phase 5：学科与标准详情

- 重做学科 masthead、学段与领域浏览。
- 重做长文详情、目录、来源、相关标准、收藏与打印。
- 接入统一 Toast 和错误状态。

### Phase 6：跨域对比

- 使用 TanStack Table v8 构建矩阵。
- 保留 draft → apply 逻辑。
- 完成 sticky 行列、差异模式、移动端对象切换。
- 达到数据阈值后接入 TanStack Virtual。

### Phase 7：能力图谱

- 先交付可搜索列表。
- 再用 React Flow 增加关系图增强视图。
- 补齐键盘替代路径、等价文本结果和 reduced-motion。

### Phase 8：清单、反馈与内部审核

- 完成清单批量操作和分享。
- 清理反馈页全局样式。
- 将 h4g-review 迁入独立 InternalShell。
- 内部路由退出公开导航、Footer 与 sitemap，并在部署层评估访问保护。隐藏导航不等于权限控制。

### Phase 9：回归、性能与上线

- Playwright 覆盖核心流程和截图断点。
- axe-core 自动扫描加人工键盘测试。
- 对搜索、图谱、字体和首页动效做 bundle 与性能预算。
- 分阶段发布，保留旧页面短期回退开关。

## 11. 验证命令

现有命令继续作为回归基础：

    npm run build
    npm run typecheck
    npm run validate:json
    npm run validate:indexes
    npm run test:api

实施后新增：

    npm run storybook
    npm run test:ui
    npm run test:e2e
    npm run test:a11y

视觉与行为断点：

- 1440 × 900
- 1024 × 768
- 768 × 1024
- 390 × 844
- 360 × 800

## 12. 验收标准

### 品牌

- 所有公共表面统一显示 kebiao。
- 固定副标题完全一致。
- 页面中没有旧品牌、emoji 图标和 Vite 默认资产。

### 视觉系统

- 只有一套全局设计令牌。
- 页面 CSS 不会覆盖其他页面组件。
- 所有交互状态在 Storybook 有可见示例。
- 学科色只用于数据语义。

### 核心体验

- 首页首屏只有两个 CTA，用户 5 秒内能理解产品并进入检索。
- 搜索支持真实关键词、facet、结果数、命中高亮、URL 分享和后退恢复。
- 键盘可完成搜索、筛选、打开结果、收藏、对比和关闭弹层。
- 移动端对比始终显示当前学段 / 学科上下文。
- 图谱有等价列表，禁用 Canvas 或开启 reduced-motion 仍能完成任务。
- 内部审核入口不出现在公共导航。
- 任一路由的 ui-v2 可以独立回退，不改变数据、URL 与 API。

### 可访问性

- axe-core 在核心页面无 critical 与 serious 违规。
- 文字与控件满足 WCAG AA。
- 200% 缩放无内容丢失。
- 触摸目标至少 44 × 44px。
- 焦点不会被 sticky header、Dialog 或抽屉遮挡。

### 性能

- 移动端目标 LCP < 2.5s。
- CLS < 0.1。
- INP < 200ms。
- 首页 GSAP、能力图谱和内部审核代码不进入检索页首包。
- 字体使用子集与 font-display 策略，加载失败时布局仍稳定。

### 回归

- 原有路由、URL 查询、分享链接、收藏、打印和数据读取继续工作。
- npm run build、npm run typecheck、数据验证和 API 测试通过。
- 390px 宽度无意外横向滚动，首页 gutter 不丢失。

## 13. 风险与退出方案

| 风险 | 控制措施 | 退出方案 |
| --- | --- | --- |
| CSS Modules 迁移造成局部回归 | 按页面迁移、Storybook 状态覆盖、截图基线 | 保留旧样式文件直到页面验收 |
| GSAP 许可证或体积不合适 | Phase 0 单独 ADR、首页按需加载 | 使用 Motion 与 CSS sticky 的普通步骤 |
| InstantSearch URL 状态与现有链接冲突 | 先写 query adapter 契约测试 | 保留现有 query parser，逐字段迁移 |
| 关系图对移动端或无障碍不友好 | 默认列表、React Flow 辅助能力、图谱延迟加载、等价文本结果 | 图谱保留为实验功能或暂不上线 |
| TanStack v9 beta API 变动 | 锁定稳定 v8 | 继续使用现有矩阵逻辑加自建布局 |
| 中文字体体积过大 | 子集、分包、系统字体 fallback | 第一阶段只自托管常用字重 |
| 大规模重构影响业务逻辑 | UI 与数据层分离、保留现有路由和数据模块 | 按路由逐页回退 |

## 14. 需要产品确认的三项决策

1. 品牌展示是否在所有中文句子里也始终保持小写 kebiao。本文默认“是”。
2. /h4g-review 是否完全隐藏于公共导航，只通过内部直链访问。本文默认“是”。
3. 第一阶段是否接受亮色主题优先，深色主题只做令牌预留。本文默认“是”。

确认这三项和页面责任后，才进入 Phase 1 的 UI 实现。
