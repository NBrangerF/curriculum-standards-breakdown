# 知识图谱：调研与设计依据（2026-11-01）

用户原话（2026-11-01）：「中考复习地图的功能，不如知识图谱的功能。很多人喜欢要一个非常细致，UI 简洁明了的知识图谱功能。这个功能请参考各种成熟的项目（一定要进行大量的 research）」。

本文记下这一轮调研看了什么、学到什么，以及 kebiao 的数据能诚实地撑起什么。设计决定在第五节，界面稿另见设计页。

## 一、结论先说

1. **成熟的学习地图都不把整张图摊给人看。** Khan Academy 的全景知识地图后来下线了；Obsidian 用户普遍说全局图没用，局部图才有用。Achieve the Core 的 Coherence Map、DLM 的 mini-map、开源的初中数学知识图谱，都是「先选一个点，再看它前后几步」。
2. **横轴固定为年级。** Coherence Map 左早右晚，澳大利亚课程 v9 按年级并排成列，Oak 按年级排单元。老师一眼就能读出「往前追」「往后看」。
3. **线只有两种，而且用大白话定义。** Coherence Map 的箭头 A→B 表示「学不会 A 的学生，很可能也学不会 B」，并特意说明这不等于「A 必须先学完」。虚线只表示「相关」。
4. **细节放在被选中的那一个点上。** Coherence Map 把选中的标准放大成卡片，卡片上有原文、例题和进阶说明。roadmap.sh 点一个节点就从右侧拉出说明和资源。地图本身保持干净。
5. **「线索」比连线更清楚。** Oak 选一条线索（如代数），把各年级属于这条线索的单元高亮，其余变暗，一根线都不画。这是看「一个主题从一年级到九年级怎么发展」最简洁的办法。
6. **课和标准的关系分主次。** Illustrative Mathematics 给每课的标准分三类：正在教（Addressing）、建立在之前的基础上（Building On）、为以后打基础（Building Towards）。kebiao 已有的「主要在教 / 也涉及」正对应前两类。
7. **国内产品的「知识图谱」主要用在诊断上。** 松鼠AI、科大讯飞、学而思/好未来、北师大智慧学伴，都靠知识点之间的先后关系定位学生的薄弱点并追溯前置知识。它们面向学生，图谱本身不公开。国家中小学智慧教育平台没有公开的知识图谱，但 2025 年的《教育部等九部门关于加快推进教育数字化的意见》（教办〔2025〕3号）写明要「完善知识图谱，构建能力图谱」。
8. **kebiao 的长处是真实的课标原文和教材原话。** 别人的图谱多是自己拆的知识点；kebiao 的每个点是课标「学生能……」的原句（要点），下面挂着教材里的课和课文原话。这一层没有别的公开产品做到。
9. **旧的能力图谱（capability graph）不能直接上图。** 它的「先修候选」是按 2,025 条旧编码生成的。映射到新的 2,520 个要点后，只剩 349 对，抽查有不少明显不对（见第四节）。要做「要先会」这一层，需要按新要点重新判断。

## 二、学习地图类产品

每个项目按同一组问题看：一次显示多少、怎么聚焦、怎么表示先修和进阶、能不能搜、怎么按年级筛、标准怎么连到教材里的课。

### 1. Achieve the Core · Coherence Map（美国共同核心数学）

2026-11-01 在内置浏览器里实际操作过（tools.achievethecore.org/coherence-map）。

- **入口**：先选年级（K–8、高中九块），再选领域（如 5.NF 分数），再在领域里的标准卡片上点「Map Standard」。面包屑一直显示「Grade 5 / Domain 5.NF / Standard 5.NF.A.1」。
- **地图**：选中的标准是一张大卡片，上面有原文、所属类别（Major / Supporting cluster）、一道 Illustrative Mathematics 的例题和进阶文件（Progressions）的摘录。点放大镜把卡片缩小后，可以看到它左边是之前的标准，右边是之后的标准，各展开一到两层。每张小卡片都能读到全文，并带有「Map Standard」按钮，点一下就以它为中心重新排布。
- **线**：箭头 A→B 的定义原话是「a student who cannot meet A is not likely to be able to meet B」，并说明「the arrow does not necessarily mean that A must be mastered before B」。虚线表示相关。
- **用途**（官方列出三条）：在年级内外串联概念；顺着先修往回追，找学生的知识漏洞；看辅助标准怎样支撑主要内容。
- **数据**：基于 Jason Zimba 的「Wiring Diagram」，即全部 K–8 标准的手工连线图。
- **对 kebiao 的启发**：从一个点出发、左早右晚、每个点都可读全文、点谁谁当中心、两种线写清定义。没有全景图，没有缩放到天边的毛线团。

### 2. Learning Commons Knowledge Graph（陈-扎克伯格基金会，2025 年发布）

- **是什么**：给教育 AI 用的开放数据层，有 REST API、MCP 和文件下载，以 CC BY 4.0 发布。
- **结构**：标准框架 → 标准分组 → 标准；「学习成分」（learning components）是把标准拆成可教的小技能（数学部分由 Achievement Network 开发）；课程层包括课程、课、活动和评价（Illustrative Mathematics、OpenSciEd）。
- **关系**：`supports`（学习成分支撑标准）；`hasStandardAlignment`（各州标准对共同核心，用共享学习成分算 Jaccard 相似度）；`buildsTowards`（学习进阶，来自 Student Achievement Partners，即 Coherence Map 的数据，文档写明不要求严格的先修顺序）；`relatesTo`（相关，无顺序）；`hasEducationalAlignment`（课程对标准，类型如 `teaches`）。
- **对 kebiao 的启发**：标准之下再拆一层「可教的小单位」，课程对标准时标明「教」。kebiao 的「要点」本身就是课标原文里最小的一层，不必再拆；「主要在教 / 也涉及」就是 `teaches` 的两档。它也给 AI 用（MCP），和 kebiao 的 /mcp 是同一思路。

### 3. Khan Academy 知识地图（约 2011–2015）

- **是什么**：把所有数学练习画成一张可平移、缩放的大图（据开发者说用的是 Google Maps 的平移缩放），线表示依赖，节点显示学习进度。
- **结局**：Khan 推出 Mission 和后来的 Course Mastery 后，就下线了这张图。官方客服说没有恢复的计划。后来的做法是先做一组前测，再推荐下一步练习。
- **用户怎么说**：有家长说，孩子落下以后，这张图让他看出缺了哪几块，回头补。也有人抱怨，按年级排的列表看不出依赖关系。
- **对 kebiao 的启发**：依赖关系对「补漏」确实有用，但一张全景大图不是好入口。要把依赖放在「这一个点」的周围。

### 4. 松鼠AI（纳米级知识点）

- 媒体和企业自述：把初中数学约 300（另一说 500）个知识点细化为约 3 万个「纳米级」知识点；「分数的加减法」别家拆 50 个，它拆 100 个。学生在某个细分点出错时，只回溯这个点的前置知识，不用重学整个大知识点。
- 这些数字来自 2018–2019 年的访谈，没有公开的图谱可以核对。
- **对 kebiao 的启发**：越细的图谱越需要「只看前置」这一种视图，否则无法阅读。kebiao 不必拆到纳米级：课标要点之下就是教材里的一课，老师最熟的「知识点」名字（约分、通分、正比例函数……）本来就是课名。

### 5. 科大讯飞 AI 学习机、好未来（学而思）

- **科大讯飞**：2019 年发布的 AI 学习机内置「个性化精准学」，宣传语是「知识图谱找弱项」。先做少量锚题找出薄弱知识点，再推送微课和少量练习，并用知识图谱向孩子展示各知识点的掌握程度。
- **好未来**：2023 年 6 月，好未来承建的「智慧教育国家新一代人工智能开放创新平台」免费开放小学数学知识图谱和知识点标签体系，分数学基本概念、数和代数、空间和几何、数据和概率四大类，可以平面或 3D 显示，提供接口和 SDK。报道里没有说明前置后继关系，也没有说明它和课标、教材的对应。
- 学而思学习机自己的知识图谱界面，本轮没有找到可核对的公开资料。
- **对 kebiao 的启发**：国内老师和家长熟悉「知识图谱 = 知识点 + 前后关系 + 追溯薄弱点」这套说法。kebiao 不做测评，但可以做好「往前追」这一步：每个要点都能顺着线找到前几个年级的课。

### 6. 国家中小学智慧教育平台与政策

- 本轮没有找到平台公开的学科知识图谱。平台的习题资源标有知识点和难度；2025 年 3 月上线的 2.0 智能版增加了智慧学伴、AI 搜索等功能。
- 《教育部等九部门关于加快推进教育数字化的意见》（教办〔2025〕3号）第（八）条：「推动课程、教材、教学数字化变革。完善知识图谱，构建能力图谱，深化教育大模型应用……」（原文已核对）。
- **对 kebiao 的启发**：知识图谱是政策明确要做的方向，老师会在培训和教研里听到这个词。kebiao 用课标原文和国家平台同步课做图谱，有据可查，这正是它和商业产品不同的地方。

### 7. 北师大「智慧学伴」

- 北京师范大学未来教育高精尖创新中心研发，面向北京中小学的测评与诊断平台。以数学为例，以数学素养为纲、学科能力为本，构建「核心概念知识图谱」和学科能力模型（学习理解、应用实践、迁移创新三层），再配诊断工具和干预资源（《中国电化教育》2019 年第 1 期专题）。
- **对 kebiao 的启发**：国内教育研究界的「学科知识图谱」以核心概念为骨架，不是把知识点平铺开。这和 kebiao 的「领域 → 主题 → 标准 → 要点」骨架一致；科学、生物学、化学、历史课标本身就用核心概念、大概念组织内容（见概念词典）。

### 8. Metacademy（2014，机器学习领域）

- 自称「知识的包管理器」：每个概念有先修列表、学习目标、预计时间和学习资源。用户选一个目标概念，系统只列出它的依赖子图，再减去已经会的部分，生成学习计划。
- 局限：每个概念只有一套依赖；哪个算先修，需要大量人工判断。
- **对 kebiao 的启发**：「以目标为中心，只画它的依赖」是阅读大图谱最省力的方式；先修关系本身必须有人判断，并说明依据。

### 9. roadmap.sh（开发者学习路线）

2026-11-01 实际打开过前端路线图。

- **布局**：一条竖直主干放主要主题，两侧分出子主题；推荐的选项打勾；中途插一句「到这里，你应该能……」作为阶段小结。
- **点一个节点**：从右侧拉出抽屉，里面有一段说明、AI 讲解、免费和付费资源，以及「在学 / 学完 / 跳过」三种状态；地图在后面变暗但仍可见。
- **对 kebiao 的启发**：一条主干加少量分支、用一句话做阶段小结，非常好读。路线是人工编排的，所以干净；自动生成的图要靠限制显示数量来保持干净。

### 10. 开源项目 cn-math-taxonomy（初中数学知识图谱）

- 初中 315 个知识点，563 条先修边，其中 45 条连回小学。每条边标「硬」（没有它很难学下去）或「软」（有帮助但不是必需），并且只保留直接先修。
- 知识点对应 2022 年版课标第四学段的 157 条内容要求（313/315 有对应，标「精确/推断」），也对应人教版 2024 新教材的章。
- 界面：用 Cytoscape + dagre 画局部先修图，实线为硬依赖、虚线为软依赖，可按年级和领域筛选，可从任一点开始诊断，沿先修链往回追，找到根源。
- 作者写明「AI 生成的初稿，未经任何教师审核」。许可为 CC BY-NC 4.0，kebiao 不引用其数据。
- **对 kebiao 的启发**：这是最接近 kebiao 想做的东西：课标对应、教材章节、局部图、硬/软两种线、直接先修。它对 AI 生成的诚实标注也值得照做。

### 11. Dynamic Learning Maps（DLM，美国特殊教育测评）

- 背后是一张极细的学习地图，每个基本要素（Essential Element）分五级（从最初的前置到后继）。老师看到的只是一张「mini-map」：围绕一个要素的一小块。州教育厅的培训材料反复提醒：mini-map 只画出部分节点，节点之间还有别的学习步骤；它不是课程本身，但对教学有指导作用。
- **对 kebiao 的启发**：底层可以很细，老师每次只看一小块，并配一句「这里没画出全部」的提示。

### 12. Oak National Academy（英国国家学院）

2026-11-01 实际打开过中学数学单元序列。

- **单元序列页**：左侧筛选关键阶段、年级、难度层级，还有一项「Highlight a thread」（突出一条线索）。选「Algebra」后，各年级属于代数线索的单元变成黑底，显示「16 units highlighted」，网址变成 `?threads=algebra`。
- **单元页**：写「Why this why now」（为什么在这里学）、「Prior knowledge requirements」（学这个单元前要会的，三条短句）、所属线索，然后是 17 节课，每课一句「I can……」，并有上一单元 / 下一单元按钮。
- **对 kebiao 的启发**：线索高亮不画线也能看清进阶；「之前要会什么」写成几条短句，比画线更直接。

### 13. Illustrative Mathematics：课和标准的三种关系

- 每节课把相关标准分成三类：Addressing（这节课在教）、Building On（建立在以前学过的标准上）、Building Towards（为后面的标准打基础）。州评审报告（如马萨诸塞州 CURATE）把这当作内容连贯的证据。
- **对 kebiao 的启发**：kebiao 的「主要在教 / 也涉及」只描述这一课本身；「要先会」和「为后面打基础」由图谱的先学、后学两侧补上。

### 14. 其他

- **CK-12 Concept Map**：输入一个数学或科学主题，显示相关概念，颜色区分学科，点开继续展开（2016 年前后的资料）。
- **Obsidian 图谱视图**：社区普遍认为局部图（深度 1–3）有用，全局图要大量过滤才有意义。用户最想要的，是在局部图里调整深度。

## 三、课程进阶类

- **NGSS（美国新一代科学标准）附录 E**：把每个学科核心概念在 K–2、3–5、6–8、9–12 四个学段的终点写成一张表，横着读就是进阶。附录 F、G 对科学实践和跨学科概念做了同样的处理。
- **澳大利亚课程 v9**：页面顶部写「You're viewing curriculum for Mathematics – Year 5」，可以快速选择或高级选择。选三个年级（如 `year-4_year-5_year-6`）时并排成三列，各列内容按分支（strand）对齐，横着读就是同一分支在相邻年级的变化。每个学习领域都有一个「Understand this learning area」入口。实际打开过。
- **不列颠哥伦比亚省（加拿大）**：「Continuous Views」把大概念、课程能力和内容从幼儿园到十年级连起来看，按学科分 K–9、K–10 或 5–12。
- **国内课标自身**：各学科课标都有「学段目标」和「学业要求」，数学课标的主题在小学和初中换了名字（小学「数与运算」「数量关系」，初中「数与式」「方程与不等式」「函数」），课标正文说明了它们之间的衔接。
- **共同点**：进阶都按学段或年级排成列；同一条线索放在同一行。表格就足以表达进阶，不需要连线。

## 四、图形界面的模式和库

### 模式

- **先概览，再缩放、过滤，最后按需看细节**（Shneiderman 1996 年的信息可视化原则）。
- **先搜索，再显示上下文，按需展开**（van Ham & Perer 2009，IEEE TVCG 15(6)）：大图不从全景开始，从一个搜索结果开始，按「兴趣度」取一个有限大小的子图，再让用户朝感兴趣的方向展开。
- **固定的空间编码**：位置必须有意义（年级、领域），否则每次布局都不一样，老师无法记住。力导向布局（d3-force）每次结果不同，也表达不了先后，不适合先修图。
- **局部图 + 深度**：Obsidian、Coherence Map、DLM 都只显示一到两层邻居。
- **两种线就够**：先修和相关。线多了，读者分不清。
- **详情放在侧栏或卡片里**：roadmap.sh 的抽屉、Coherence Map 的放大卡片。
- **可访问性**：大型网络图对读屏用户很难用。可行的做法是配一份等价的列表或表格，支持键盘从一个节点走到相邻节点，图本身作为装饰（Mermaid 可访问性演示、KeyLines 指南、W3C SVG 可访问性工作组讨论）。kebiao 七月的图谱已有 `GraphFallbackList` 和 `GraphA11yController`，思路相同。

### 库

kebiao 七月做过基准测试（`docs/research/2026-07-11-graph-engine-benchmark.md`，1,000 节点，三次中位数）：

| 库 | 按需加载 gzip | 首次可交互 | 适合 |
| --- | ---: | ---: | --- |
| Sigma.js + Graphology | 38 KB | 44 ms | 上千节点的全局网络（WebGL） |
| React Flow（XYFlow） | 106 KB | 369 ms（选择延迟 209 ms） | 几十到几百个可编辑的 DOM 节点 |
| Cytoscape.js | 142 KB | 180 ms | 几百到几千节点，布局丰富 |
| AntV G6 | 411 KB | 302 ms | 体积超出预算 |

- **布局**：dagre 小而快，适合树形和分层图；elkjs 可配置性最强，但体积大（不同来源报 300 KB 到 1.4 MB），React Flow 官方也说它难配置。d3-dag 是更轻的分层布局。
- **结论**：知识图谱每屏只显示一个点的前后几步（通常不超过 40 个节点），不需要 WebGL 和自动布局。按年级排列，用普通 DOM 卡片加一层 SVG 画线（教材页的 `UnitMap` 已经这样做），最轻，也最容易做到可访问，不需要新增依赖。Sigma、React Flow 和 dagre 已在依赖里，供旧页面使用，新页面不加载它们。

## 五、kebiao 已有的数据（2026-11-01 实测）

- **课标**：14 门课，513 条标准，2,520 个要点（`public/data/v2/by_subject`）。初中要点带教材年级（`grades`，如 `[7]`，并有 `grade_basis`「七年级上册 第一章 有理数」）；小学要点只带学段。
- **同一主题跨学段**（标准的 `level2` 在相邻学段重复出现）：语文 75/97 条标准有上一学段的同主题标准，英语 36/54，科学 36/49，劳动 21/31，体育 17/26，道法 12/20，艺术 12/56，数学只有 11/43，信息科技 3/13，物理、化学、生物学、历史、地理只有 7–9 一个学段，为 0。数学少，是因为小学的「数与运算」「数量关系」到初中拆成了「有理数」「实数」「代数式」「方程与方程组」「函数」等，名字变了。
- **教材里在哪教**（AI 逐课判断，`public/data/v2/national-lessons/<前缀>.json` 的 `points`）：有「主要在教」的要点，数学 206/230（89%），生物学 82%，物理 77%，历史 77%，道法 76%，语文 53%，地理 52%，科学 40%，化学 38%，体育 28%，艺术 28%，英语 16%；信息科技和劳动没有。其中数学涉及 69 本书、1,225 课。也有误判，如「中位数」被判为在教一次函数。
- **概念词典**：25 个术语，14 门课的骨架（`public/data/concepts.json`），说明每门课怎么组织内容（学习任务群、核心概念、大概念……）。
- **旧能力图谱**（`public/data/capability_graph/by_code`，2,025 个旧编码）：1,719 条先修候选，其中 1,175 条来自旧数据「上一条」字段（`curriculum_sequence_candidate`），544 条来自跨学段相似度（`grade_band_bridge_candidate`，置信度多在 0.1 左右）。经审核的为 0，跨学科的为 0，新增的五门课没有。按要点上的 `legacy_codes` 映射到新编码后，只剩 349 对要点关系，另有 1,014 条映射不上。抽查样例：
  - 对：「阅读、欣赏革命领袖、革命先烈创作的文学作品」（5–6）→「阅读反映中国革命各个时期……的优秀文学作品」（7–9）。
  - 不对：英语「能用简短的句子描述……中外文化有关的具体事物」→「能听懂发音清晰、语速较慢的简短口头表达」；道法「了解公共卫生事件……」→「正确认识顺境和逆境的关系」；体育「水上或冰雪类运动项目」→「球类运动项目的比赛中遵守规则」。
  - 结论：旧候选不能当作「要先会」上图。

## 六、设计决定

1. **一个节点 = 一个要点。** 要点是课标原文「学生能……」的句子，是课标里最小的单位。节点上用教材的课名做标签（约分、通分、正比例函数……），因为老师说的「知识点」就是这些课名。
2. **只有两屏：全景和聚焦。**
   - 全景：一门课的「线索 × 年级」星点图。每一行是一条线索（如数学「数量关系 → 方程与不等式 → 函数」），每一列是一个年级（1–2、3–4、5–6、七、八、九），每个要点是一颗星，同一行的星用一根细线串起来（像地铁线路）。有「教材里的课」的星为金色。
   - 聚焦：点一颗星，它居中成为一张卡片，左边是「先学」（它要用到的），右边是「后学」（用到它的），都标明年级；卡片上写原文、页码、教材里在哪教（「我的书」的版本排在前面，带教材原话）、同一条课标的其他要点，以及「用它备课」。点任何一张小卡片，就以它为中心。
   - 不做全局网络图。
3. **横轴永远是年级，左早右晚。** 初中要点按教材年级放进七、八、九年级三列；标「7–9 共同」的放在三列中间。
4. **两种线，用一句话定义。**
   - 实线「要先会」：学生没掌握左边的要点，很可能学不好右边的要点；不表示必须先学完（照 Coherence Map 的定义）。由 AI 逐条判断，标「AI 判断 · 待核验」。
   - 虚线「同一线索」：课标里同一主题的上一学段或下一学段。来自课标结构，数学等换了名字的主题由 kebiao 整理对应关系，并标出课标页码。
5. **「要先会」按新要点重新判断，旧候选不上图。** 每个要点最多 3 条，只能指向更早的年级，或同一年级里教材更靠前的章；理科可以跨学科（如物理的欧姆定律 ← 数学的正比例函数，初中物理、化学、生物学、地理 ← 小学科学）。判断后抽样核对，在页面上公布抽查结果。
6. **搜索**：一个输入框，能搜课名、要点原文和主题，跨学科（输入「浮力」直接到物理）。
7. **手机**（390 px）：全景变成一条条线索带，每条线索一行，六个年级格；聚焦变成竖排：先学 ↑ · 这个要点 · 后学 ↓ · 教材里在哪教。
8. **可访问**：节点都是真实的链接和按钮，线只是装饰（`aria-hidden`）；每张卡片用文字写出它的先学、后学；全景另有列表视图，同时也是给爬虫的静态内容。
9. **渲染**：DOM 卡片加 SVG 画线，沿用 `UnitMap` 的做法，不引入新库。
10. **来源分三层标注**：课标原文；kebiao 整理（线索对应）；AI 判断 · 待核验（要先会、教材对应），每条都有报错入口。
11. **中考复习地图的用途被覆盖**：初中学科的全景就是七、八、九年级三列；点开要点能看到三年教材里的课；线索的行头展开后能读到课标原文里的学业要求。`/review` 永久重定向到新页面。

## 七、不做什么

- 不做 3D、不做力导向布局、不做可以无限缩放的全景大图。
- 不做学生测评和掌握度着色，kebiao 没有学生数据。
- 不把「要先会」说成认知科学意义上的先修，只说「很可能需要先会」。
- 不导入别家的知识点体系或先修数据（cn-math-taxonomy 为 CC BY-NC，os-taxonomy 为 ODbL）。

## 参考

- Achieve the Core Coherence Map：https://tools.achievethecore.org/coherence-map/ ，说明页 https://achievethecore.org/page/2801/learn-more-about-the-coherence-map ，Wiring Diagram https://achievethecore.org/page/844/ccssm-wiring-diagram
- Learning Commons Knowledge Graph：https://learningcommons.org/knowledge-graph/features/ ，核心概念 https://docs.learningcommons.org/knowledge-graph/understanding-knowledge-graph/core-concepts ，学习进阶 https://docs.learningcommons.org/knowledge-graph/entity-and-relationship-reference/learning-progressions ，GitHub https://github.com/learning-commons-org/knowledge-graph
- Khan Academy 知识地图下线：https://support.khanacademy.org/hc/de/community/posts/360058025692/comments/360012904612
- 松鼠AI：https://m.gelonghui.com/p/203242 ，http://www.duozhi.com/company/201905268781.shtml
- 科大讯飞学习机：https://finance.sina.cn/2019-10-22/detail-iicezzrr4044488.d.html
- 好未来开放小学数学知识图谱：https://fashion.chinadaily.com.cn/a/202306/16/WS648c15aca310dbde06d23cd2.html
- 教办〔2025〕3号：https://www.kmmu.edu.cn/upload/20250530/2025053010472251.pdf
- 国家中小学智慧教育平台 2.0：https://www.pingwest.com/w/303524
- 北师大智慧学伴：https://aic-fe.bnu.edu.cn/docs/20190104114747866765.pdf
- Metacademy：https://hunch.net/?p=2714 ，https://foldl.me/2014/metacademy
- roadmap.sh：https://roadmap.sh/frontend
- cn-math-taxonomy：https://github.com/sdvch/cn-math-taxonomy
- Dynamic Learning Maps：https://legacy.sde.ok.gov/sites/default/files/2024-2025%20DLM%20Resources%20for%20Teachers.pdf ，https://www.ksde.gov/Portals/0/SES/DLM/DLM-InstructionalPlans-Creating.pdf
- Oak National Academy：https://www.thenational.academy/teachers/programmes/maths-secondary/units?threads=algebra
- Illustrative Mathematics（马萨诸塞州 CURATE 评审）：https://www.doe.mass.edu/instruction/curate/math-2021-illustrative-math-kendall-hunt.pdf
- CK-12 Concept Map：https://help.ck12.org/hc/en-us/articles/200344405-What-Is-a-Concept-Map
- Obsidian 局部图讨论：https://forum.obsidian.md/t/add-a-depth-slider-to-filtered-graph-view/11571
- NGSS 附录：https://www.nextgenscience.org/resources/ngss-appendices
- 澳大利亚课程 v9：https://v9.australiancurriculum.edu.au/
- BC 课程工具：https://curriculum.gov.bc.ca/curriculum/tools
- van Ham & Perer 2009：https://aviz.fr/wiki/uploads/Teaching2015/SearchShowContextArticle.pdf
- React Flow 布局指南：https://reactflow.dev/learn/layouting/layouting
- 图库对比：https://dev.to/timlrx/a-comparison-of-javascript-graph-network-visualisation-libraries-34a8
- 图的可访问性：https://samkacer.github.io/MermaidAccessDemo/guide ，https://cambridge-intelligence.com/build-accessible-data-visualization-apps-with-keylines/
