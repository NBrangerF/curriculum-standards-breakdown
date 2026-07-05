# H4G7/H4G8/H4G9 Standards 区分补强资料调研与执行计划

生成时间：2026-07-04

## 结论

当前 G7/G8/G9 难以区分，不是因为现有拆解方式失效，而是因为国家课程标准本身大量采用 `7-9 年级` 学段式表述。继续只比较课程标准正文，会把同一个学段目标强行拆成三个年级，容易制造伪差异。

当前计划的执行状态应定位为：

> Research OS v0.5 → Execution Ready v0.1

它已经可以进入 Codex 执行阶段，但只能以 `source registry → evidence extraction → skill graph v0` 三个 gate 起跑。现在禁止直接推进 full 14-day pipeline、全学科同步补强、完整 skill graph 自动生成或任何 public H4G production 写入。

下一步应从“按年级拆课标文本”转为“按能力发展轨迹建模”。外部资料的作用不是替代课程标准，而是为同一个 compressed standard 补充三个年级的能力证据：

- G7：入门、识别、理解、单步骤应用、基础表达。
- G8：比较、整合、推断、关系化理解、多步骤应用。
- G9：迁移、评价、论证、综合探究、真实情境问题解决。

最值得补充的资料不是传统“考试大纲”。教育部已经明确取消初中学业水平考试大纲或考试说明，命题应严格依据课程标准。因此，我们应把资料源分成四类：课程标准内生证据、考试评价证据、教学实施证据、能力刻度证据。

## 本次使用的 skill / plugin

- `architecture-review`：用于审查 research pipeline 的层级边界、gate 顺序、freeze point 和执行范围。
- `ecc:deep-research`：用于多来源调研和来源分级。
- `dbs-deconstruct`：用于把“G7/G8/G9 区分”从一个模糊问题拆成可验证的数据问题。
- `exa` plugin：已通过 tool discovery 加载并尝试检索，但两次请求均在 300 秒超时；本轮调研改用 web search 完成，并在计划中保留 exa/firecrawl 作为后续批量抓取候选。

## 核心判断

### 0. 这不是 production plan，而是 gated execution plan

这份计划的最大风险不是资料方向错误，而是执行粒度过大。`source registry`、`evidence extraction`、`skill graph`、`progression inference` 分别属于不同稳定性层级，不能在同一轮任务里混合执行。

必须先建立 freeze point：

- registry freeze：来源、权限、学科覆盖、allowed use 稳定后，才能抽 evidence。
- evidence freeze：task signals 和 confidence gate 稳定后，才能建 skill graph。
- skill graph freeze：skill node 和 group mapping 稳定后，才能推 G7/G8/G9 progression candidates。

每个 gate 的输出都必须是只读派生产物；在 Gate 3 通过人工 review 之前，不允许写入 `public/data`。

### 1. “考纲”不是稳定答案

教育部《关于加强初中学业水平考试命题工作的意见》明确提出取消初中学业水平考试大纲，严格依据义务教育课程标准命题，不得超标命题。2022 年中考命题通知也再次强调取消考试大纲或考试说明。

这意味着：不能依赖“官方考纲”作为唯一补充来源。更合适的做法是使用各地的命题原则、试题评析、命题思路、考试实施方案和课程标准学业质量描述来建立证据链。

### 2. G9 上限可以由学业水平考试反推

初中学业水平考试主要发生在九年级末，虽然不能直接给 G7/G8 分界，但它能提供 G9 的毕业水平上限，尤其是：

- 能力目标。
- 题型结构。
- 情境复杂度。
- 主观题/开放题比例。
- 评分标准中的表现要求。
- 跨学科、综合性、探究性要求。

浙江省 2025 年初中学业水平考试命题思路和试题评析是高价值来源，因为它按学科解释了“依标命题、素养立意、真实情境、综合应用”的具体落点。

### 3. G8 可用国家义务教育质量监测作为中段锚点

国家义务教育质量监测对象包含四年级和八年级学生，并覆盖德育、语文、数学、英语、科学、体育与健康、艺术、劳动、心理健康等领域。它虽然不是逐条课标映射，但可以作为 G8 的“中段能力锚点”：

- 八年级学生在语文、数学、科学等学科上的表现水平。
- 综合应用能力、科学探究、书面表达、阅读等能力维度。
- 非中考强绑定学科如艺术、劳动、体育的评价维度。

### 4. 2022 课标内已有隐藏进阶信号

2022 版课程标准不只提供“内容要求”，还提供：

- 学业要求。
- 教学提示。
- 评价建议。
- 学业质量标准。
- 教学与评价案例。

这些字段比 `standard` 正文更适合抽取 G7/G8/G9 的任务复杂度信号。

### 5. 非考试学科要走“课程实施 + 质量监测 + 表现性评价”

艺术、信息科技、劳动这类学科不能用中考逻辑硬拆。它们更适合用：

- 国家课程标准中的学业质量与评价建议。
- 国家义务教育质量监测方案。
- 地方课程实施意见。
- 项目/作品/实践任务评价量规。
- 教材或教学指南中的任务序列。

## 对执行收敛 insight 的 review

本轮 critique 的核心判断是正确的：原计划的方向是对的，但执行范围必须收窄。真正的问题不是继续扩展资料，而是先把资料系统变成一个可冻结、可审计、可复算的 data layer。

采纳的判断：

- “考纲”应降级为考试评价线索，而不是 truth source。
- G8 应作为 anchor source，而不是简单的 G7/G9 midpoint。
- source registry、evidence extraction、skill graph 必须拆成不同 gate。
- 没有 registry freeze 之前，不应做 evidence extraction。
- 没有 evidence freeze 之前，不应做 skill graph。
- 没有 skill graph freeze 之前，不应做 progression inference。
- 没有人工 review 之前，不应写 public H4G production。

需要进一步硬化的地方：

- Gate 0 不能只产出 `source_registry.json`，还必须产出 `source_authority_map.json` 和 `source_index_by_subject.json`，否则后续无法判断某个学科的来源覆盖是否足够。
- confidence 不能只作为说明文字，必须成为每个 gate 的准入条件。
- freeze 必须是显式 artifact，而不是“我们认为差不多稳定了”的口头状态。
- source 的 `allowed_use` 和 `disallowed_use` 必须同时存在，避免把 G9 考试上限误用于 G7/G8 直接分配。

暂不采纳或延后的部分：

- 不执行 full 14-day pipeline。
- 不做全学科并行补强。
- 不自动生成完整 skill graph。
- 不生成 final G7/G8/G9 descriptors。
- 不写 `public/data`。

## 来源地图

| 优先级 | 资料类型 | 代表来源 | 能解决什么 | 适用学科 |
| --- | --- | --- | --- | --- |
| P0 | 2022 义务教育课程标准原文 | 教育部课程方案与 16 个课程标准 | 提供合法主轴、学业质量、评价建议、教学提示 | 全部 |
| P0 | 初中学业水平考试命题政策 | 教育部 2019 命题意见、2022 中考命题通知 | 明确考试不是另立考纲，而是依标评价；提供命题原则 | 中考科目为主 |
| P1 | 省级中考命题思路/试题评析 | 浙江省 2024/2025 命题思路与试题评析 | 提供 G9 上限、任务复杂度、真实情境、开放性信号 | 语文、数学、英语、科学、社会/道法 |
| P1 | 地方考试实施方案 | 北京、上海、浙江等考试院/教育厅文件 | 确认考试科目、形态、听说/实验/综合测试等评价方式 | 语文、数学、英语、科学、道法、体育 |
| P1 | 国家义务教育质量监测 | 教育部监测方案、质量监测报告 | 提供 G8 能力锚点和跨学科评价维度 | 全部，尤其艺术/劳动/体育/科学 |
| P2 | 地方教学基本要求/终结性评价指南 | 上海初中学科教学基本要求、终结性评价指南 | 提供教学深度、能力目标、内容要求的细颗粒度描述 | 语文、数学、英语、科学、艺术、信息科技 |
| P2 | 2024 新教材目录与国家智慧教育平台 | 教育部 2024 教学用书目录、国家中小学智慧教育平台 | 更新教材证据，补充新版教材和配套数字资源 | 全部 |
| P2 | 课程标准权威解读 | 高教社/课程教材研究所组织的课标解读 | 解释课标隐含逻辑、学业质量、评价建议 | 全部 |
| P3 | 国际/通用能力框架 | Bloom、SOLO、Webb DOK、PISA proficiency | 不是证据源，只作为统一编码工具 | 全部 |

## 已识别的关键来源

| 来源 | 链接 | 可抽取信号 | 使用方式 |
| --- | --- | --- | --- |
| 教育部：义务教育课程方案和课程标准（2022 年版）通知 | https://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html | 课程标准原始依据、各学科 PDF 入口 | 作为所有补强的最高优先级 source |
| 教育部：加强初中学业水平考试命题工作的意见 | https://www.moe.gov.cn/srcsite/A06/s3321/201911/t20191128_409951.html | 取消考试大纲、依标命题、减少机械记忆、增加探究开放综合 | 作为考试源使用边界 |
| 教育部办公厅：做好 2022 年中考命题工作的通知 | https://www.moe.gov.cn/srcsite/A06/s3321/202204/t20220406_614237.html | 不得使用高中内容、不得随意扩大/压减范围、取消考试说明 | 作为数据合法性 gate |
| 浙江省 2025 年初中学业水平考试命题思路 | https://www.zjzs.net/art/2025/6/23/art_31_11386.html | 各科命题思路、素养导向、真实情境、能力要求 | 作为 G9 assessment cap |
| 浙江省 2025 年初中学业水平考试试题评析 | https://www.zjzs.net/art/2025/6/23/art_31_11385.html | 试题如何体现基础性、开放性、综合性、教-学-评一致 | 用于 task complexity 标注 |
| 浙江省 2024 年中考命题思路 | https://www.zjzs.net/art/2024/6/24/art_155_9739.html | 学科主干、通性通法、情境任务、问题层级 | 用于跨年度稳定性验证 |
| 浙江省教育厅：初中学业水平考试全省统一命题通知 | https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3114/site/attach/0/924fe84581ff48a6bba132fac066ea0d.pdf | 考试范围、统一命题科目、非统一考试科目处理 | 建立考试科目与非考试科目分流 |
| 北京教育考试院中考中招频道 | https://www.bjeea.cn/html/zkzz/ | 北京学考政策、报名、科目、听说考试信息 | 补充地区考试形态 |
| 上海市 2025 年高中阶段学校考试招生实施细则 | https://edu.sh.gov.cn/mbjy_xwzx/20250314/8562a13f31484d7688d71974ebbd23b8.html | 上海科目结构、综合测试、实验操作、外语听说 | 补充综合测试/实验评价 |
| 国家义务教育质量监测方案（2021 修订版） | https://www.moe.gov.cn/srcsite/A11/moe_1789/202109/t20210926_567095.html | 监测学科、周期、八年级监测对象 | 建立 G8 benchmark |
| 中国义务教育质量监测报告 | https://www.moe.gov.cn/jyb_xwfb/moe_1946/fj_2018/201807/P020180724685827455405.pdf | 语文、数学、科学等表现水平；综合应用弱项 | 建立能力维度与水平段 |
| 2024 义务教育国家课程教学用书目录 | https://jw.beijing.gov.cn/xxgk/2024zcwj/2024qtwj/202408/W020240905543232813376.pdf | 2022 课标修订教材、外语听力、体育数字资源、信息科技教学指南 | 更新教材和配套资源 pipeline |
| 国家中小学智慧教育平台 | https://www.zxx.edu.cn/ | 官方教材与数字资源入口 | 作为教材源 registry |
| 义务教育信息科技课程标准（2022 年版） | https://www.moe.gov.cn/srcsite/A26/s8001/202204/W020220420582361024968.pdf | 信息意识、计算思维、数字化学习与创新、信息社会责任 | 补信息科技 |
| 义务教育艺术课程标准（2022 年版） | https://www.moe.gov.cn/srcsite/A26/s8001/202204/W020220420582364678888.pdf | 1-7 与 8-9 课程结构差异、作品/活动评价 | 补艺术 |
| 义务教育劳动课程标准（2022 年版） | https://www.moe.gov.cn/srcsite/A26/s8001/202204/W020220420582367012450.pdf | 项目任务、实践难度、劳动品质 | 补劳动 |
| PISA 2022 Assessment and Analytical Framework | https://www.oecd.org/content/dam/oecd/en/publications/reports/2023/08/pisa-2022-assessment-and-analytical-framework_a124aec8/dfe0bf9c-en.pdf | 阅读/数学/科学素养水平、真实问题解决 | 仅作能力刻度参考 |
| Webb DOK primer | https://www.webbalign.org/dok-primer | cognitive demand 编码 | 仅作任务复杂度编码工具 |

## 学科补强策略

### 语文

主要问题：52 个完整 triplets 仍共享核心文本。

优先资料：

- 2022 语文课标中的学习任务群、学业质量、评价建议。
- 浙江中考语文命题思路与试题评析。
- 上海初中语文终结性评价指南，作为旧版但细粒度能力目标参考。
- 八年级义务教育质量监测中的阅读、表达、古诗文等维度。

建议建模轴：

- 文本复杂度：单篇理解 → 多文本比较 → 综合评价与表达。
- 表达复杂度：复述/说明 → 观点表达 → 论证/文学鉴赏/综合写作。
- 文化理解：识记常识 → 解释意义 → 评价与迁移。

### 数学

主要问题：37 个待处理 groups 仍是文本未分清，另 1 个 group 已 product-ready。

优先资料：

- 2022 数学课标的核心素养、学业质量、综合与实践。
- 浙江 2024/2025 数学命题思路和试题评析。
- PISA 数学 proficiency 作为真实问题解决刻度参考。
- 已有 unit-level evidence 的数学 pipeline。

建议建模轴：

- 概念掌握：知道/理解 → 关联/表示 → 迁移建模。
- 推理层级：规则计算 → 多步推理 → 证明/反思/评价。
- 情境复杂度：纯数学 → 生活情境 → 跨学科/真实约束。

### 英语

主要问题：44 个 groups 中 39 个文本未分清，5 个语言技能 groups 已核心差异化但证据/审核未闭环。

优先资料：

- 2022 英语课标，尤其三级目标、语言技能年级表、学业质量。
- 浙江中考英语命题思路与试题评析。
- 北京/上海英语听说考试实施信息。
- 2024 新人教版初中英语教材介绍和国家平台听力资源。

建议建模轴：

- 语篇输入：简短/熟悉 → 稍长/多信息 → 多语篇/复杂观点。
- 输出任务：句段表达 → 结构化表达 → 观点论证/互动调适。
- 文化与思维：识别差异 → 比较解释 → 判断评价与跨文化沟通。

### 科学

主要问题：67 个完整 triplets 仍文本未分清；已有 17 条 unit-level evidence。

优先资料：

- 2022 科学课标的核心概念、学业质量、探究实践。
- 浙江科学中考命题思路/试题评析。
- 义务教育质量监测八年级科学探究与科学思维维度。
- 物理/化学实验操作或综合测试资料。

建议建模轴：

- 科学概念：识别现象 → 建立解释 → 模型化/证据推理。
- 探究实践：观察记录 → 控制变量/分析数据 → 设计实验/评价方案。
- 跨学科应用：单概念应用 → 多概念整合 → 真实问题解决。

### 道德与法治

主要问题：42 个完整 triplets 仍文本未分清。

优先资料：

- 2022 道德与法治课标及权威解读。
- 中考道法试题评析/命题思路，尤其情境材料与非选择题评分。
- 国家质量监测德育维度。

建议建模轴：

- 价值认知：知道规范 → 情境判断 → 复杂公共议题分析。
- 法治理解：规则识别 → 案例解释 → 权利义务综合运用。
- 行动表达：态度说明 → 方案建议 → 论证与反思。

### 体育与健康

主要问题：41 个完整 triplets 仍文本未分清。

优先资料：

- 2022 体育与健康课标中的运动能力、健康行为、体育品德和学业质量。
- 北京/上海体育学考实施方案。
- 国家质量监测体育与健康维度。
- 体育专项/项目学习评价量表。

建议建模轴：

- 技能熟练度：基本动作 → 组合运用 → 比赛/专项策略。
- 健康行为：知道方法 → 自主管理 → 长期计划与反思。
- 体育品德：遵守规则 → 合作竞争 → 组织/评价/责任承担。

### 艺术

主要问题：62 个 groups 结构未分清，是当前最大结构修复对象。

优先资料：

- 2022 艺术课标。特别注意：一至七年级以音乐、美术为主线，八至九年级分项选择，这是非常强的结构信号。
- 国家义务教育质量监测艺术维度。
- 上海初中音乐、美术、艺术教学基本要求。
- 作品集、展示、表演、鉴赏评价量规。

建议建模轴：

- 艺术感知：感受/描述 → 分析/比较 → 鉴赏/评价。
- 表现创造：模仿/练习 → 主题创作 → 综合呈现与阐释。
- 课程结构：G7 音乐/美术综合基础，G8/G9 分项深化。

### 信息科技

主要问题：22 个完整 triplets 仍文本未分清，同时 source coverage / low confidence gap 明显。

优先资料：

- 2022 信息科技课标。
- 教育部 2024 义务教育信息科技教学指南及配套课件。
- 国家义务教育质量监测信息/相关数字素养维度。
- 地方信息科技教学基本要求或学业评价样例。

建议建模轴：

- 数据意识：识别数据 → 组织处理 → 建模与解释。
- 算法与计算思维：步骤执行 → 分解抽象 → 算法设计与优化。
- 数字社会责任：安全规范 → 情境判断 → 伦理与治理议题。

### 劳动

主要问题：22 个完整 triplets 仍文本未分清，同时 source coverage / low confidence gap 明显。

优先资料：

- 2022 劳动课标中的任务群、项目难度和评价建议。
- 国家义务教育质量监测劳动维度。
- 地方劳动教育实施意见，例如深圳等地文件。
- 学校项目式劳动任务与表现性评价量规。

建议建模轴：

- 劳动技能：简单操作 → 项目完成 → 设计优化。
- 劳动观念：参与体验 → 责任意识 → 服务/创造/社会理解。
- 项目复杂度：单一任务 → 多步骤协作 → 真实约束下方案实施。

## 建议新增数据模型

### 1. supplemental source registry

新增一个资料注册表，不直接写入 public 数据，先作为 generated/source registry。

Gate 0 的 registry 必须同时生成三个只读产物：

- `generated/h4g_supplemental_sources/source_registry.json`
- `generated/h4g_supplemental_sources/source_authority_map.json`
- `generated/h4g_supplemental_sources/source_index_by_subject.json`

建议字段：

```json
{
  "source_id": "zhejiang-2025-exam-thinking-english",
  "source_type": "exam_thinking",
  "authority_level": "provincial_exam_authority",
  "authority_score": 0.86,
  "subject_coverage": [
    "english"
  ],
  "grade_signal": "G9_cap",
  "grade_band_signal": "H4G7-H4G9",
  "url": "https://www.zjzs.net/art/2025/6/23/art_31_11386.html",
  "published_at": "2025-06-23",
  "allowed_use": [
    "task_complexity",
    "assessment_evidence",
    "cognitive_demand"
  ],
  "disallowed_use": [
    "direct_grade_assignment",
    "public_standard_text_rewrite"
  ],
  "license_status": "link_and_metadata_only",
  "registry_status": "candidate",
  "freeze_status": "unfrozen",
  "notes": "Use short excerpts only; store derived metadata, not copied article text."
}
```

### 2. progression evidence item

每个 source 只抽取“可验证信号”，不要把整段文本搬进数据。

```json
{
  "evidence_id": "ev-english-g9-reading-evaluate-001",
  "source_id": "zhejiang-2025-exam-thinking-english",
  "subject_slug": "english",
  "progression_group_id": "english-08c354d4bfffbc",
  "target_grade_band": "H4G9",
  "skill_node": "discourse_information_analysis",
  "signal_type": "assessment_task_complexity",
  "signal_value": {
    "bloom_level": "analyze_evaluate",
    "dok_level": 3,
    "task_form": "multi_step_reading_inference",
    "context_authenticity": "realistic_student_life_or_social_context",
    "output_requirement": "justify_answer_with_textual_evidence"
  },
  "confidence": 0.74,
  "review_status": "needs_human_review"
}
```

### 3. skill progression node

把 `progression_group_id` 背后的技能抽象出来。

```json
{
  "skill_node_id": "english.discourse.information_analysis",
  "subject_slug": "english",
  "source_progression_groups": [
    "english-08c354d4bfffbc"
  ],
  "axis": [
    "input_complexity",
    "reasoning_depth",
    "output_independence",
    "context_authenticity"
  ],
  "grade_descriptors": {
    "H4G7": "extract and summarize key information from familiar short texts",
    "H4G8": "compare, infer and organize information across longer texts",
    "H4G9": "evaluate viewpoints and justify interpretations in complex contexts"
  },
  "evidence_confidence": {
    "H4G7": 0.52,
    "H4G8": 0.47,
    "H4G9": 0.81
  }
}
```

## 区分模型

建议不要再让模型直接回答“这个 standard 属于 G7 还是 G8”。应先回答四个中间问题：

1. 这个 group 对应哪个 skill node？
2. 该 skill 的能力轴是什么？
3. 每个资料源给出的任务复杂度信号是什么？
4. G7/G8/G9 的差异是否足够强，可以写入 public 数据？

推荐综合评分：

| 证据层 | 权重 | 说明 |
| --- | ---: | --- |
| 国家课标学业质量/评价建议 | 0.30 | 最高合法性，但多为学段级 |
| 学业水平考试/命题评析 | 0.25 | 提供 G9 上限和 assessment cap |
| 教材单元/章节/任务 | 0.20 | 提供真实教学实现路径 |
| 地方教学基本要求/教研指导 | 0.15 | 补教学深度、顺序、活动要求 |
| Bloom/DOK/SOLO/PISA 编码 | 0.10 | 只作归一化，不作事实来源 |

> 2026-07-04 contract update：以下写入规则中的“不改官方 `standard` 正文”是旧策略。后续 H4G standard rewrite 以 `docs/H4G_STANDARD_REWRITE_CONTRACT.md` 为准：`standard` 可以作为产品展示字段进行年级化改写，但必须保留 `source_standard_original` 和完整证据链。

写入 public 的最低条件：

- 至少 2 个独立来源支持同一个年级差异。
- 其中至少 1 个来源必须是 P0/P1。
- `standard` 可以按 `docs/H4G_STANDARD_REWRITE_CONTRACT.md` 改写为年级化产品展示文本。
- 必须保留 `source_standard_original`、`source_standard_scope`、`grade_adaptation_method`、`grade_adaptation_rationale`、`supplemental_evidence_ids` 和置信度字段。
- 如果证据不足，标记为 `blocked_insufficient_evidence` 或 `shared_source_pending_adaptation`，不要伪造差异。

## Gated Execution Plan v0.1

这不是 14 天 full pipeline。执行必须按 gate 顺序推进：Gate 1 只有在 Gate 0 冻结并通过 audit 后才能执行；Gate 2 只有在 Gate 1 冻结并通过 audit 后才能执行；Gate 3 只能产出 review-only candidates 和 public-write gate，不能直接写生产数据。

截至 2026-07-05，本方案已经按 `Gate 0 → Gate 1 → Gate 2 → Gate 3 → Standard Rewrite Staging Candidate → Standard Enrichment Full Batch Candidate` 完成一次只读执行。所有输出均在 `generated/` 下，`public/data` 未被修改。

### Gate 0：Source Ingestion Lock

目标：建立不可变 source registry。只判断资料“是什么、来自哪里、可用于什么”，不判断它能推出哪个年级差异。

输入：

- 本文档中的 P0/P1 source 列表。
- 官方 URL 与本地已确认资料链接。

输出：

- `generated/h4g_supplemental_sources/source_registry.json`
- `generated/h4g_supplemental_sources/source_authority_map.json`
- `generated/h4g_supplemental_sources/source_index_by_subject.json`
- `generated/h4g_supplemental_sources/source_registry.md`

只允许做：

- URL validation。
- authority scoring。
- subject tagging。
- coverage tagging。
- allowed/disallowed use 标注。
- license/access risk 标注。

禁止做：

- skill mapping。
- grade inference。
- task extraction。
- progression candidate 生成。
- public 数据写入。

通过标准：

- 每个 source 都有 `source_id`、`source_type`、`authority_level`、`authority_score`、`subject_coverage`、`allowed_use`、`disallowed_use`、`license_status`。
- `source_authority_map.json` 能按 authority level 和 source type 聚合。
- `source_index_by_subject.json` 能回答每个学科有哪些 P0/P1/P2 source。
- registry 中没有 dead URL 或无法解释的非官方来源。
- `freeze_status` 可以从 `unfrozen` 进入 `frozen_candidate`，但必须由 audit 脚本确认。

### Gate 1：Evidence Extraction Pipeline

前置条件：Gate 0 registry freeze。

目标：从 frozen source 中提取 task signals。这里可以标注“年级信号提示”，但不能做最终年级归属。

输入：

- `source_registry.json`
- `source_authority_map.json`
- `source_index_by_subject.json`

输出：

- `generated/h4g_supplemental_evidence/task_signal_items.json`
- `generated/h4g_supplemental_evidence/evidence_items.json`
- `generated/h4g_supplemental_evidence/evidence_extraction_audit.md`

只允许做：

- Bloom mapping。
- DOK mapping。
- task complexity tagging。
- grade signal hinting。
- source excerpt metadata，且只保存短摘录或页码/链接，不复制长文本。

禁止做：

- skill graph 生成。
- G7/G8/G9 final descriptor 生成。
- public 数据写入。
- 把考试题全文、教辅材料或版权长文本写入项目数据。

通过标准：

- 每个 evidence item 都能追溯到 frozen source。
- 每个 evidence item 都有 `signal_type`、`signal_value`、`confidence`、`review_status`。
- `grade_signal_hint` 只能是 `G7_baseline`、`G8_anchor`、`G9_cap`、`H4G7-H4G9_shared` 或 `unknown`，不能直接写成最终年级判定。
- 低置信 evidence 不进入 skill graph 输入。

### Gate 2：Skill Graph Construction

前置条件：Gate 1 evidence freeze。

目标：构建 skill-level graph，而不是 grade-level graph。skill 是 invariant unit，不以 G7/G8/G9 为主键。

输入：

- `evidence_items.json`
- 当前 390 个 H4G progression groups。

输出：

- `generated/h4g_skill_graph/skill_nodes.json`
- `generated/h4g_skill_graph/skill_edges.json`
- `generated/h4g_skill_graph/group_to_skill_map.json`
- `generated/h4g_skill_graph/skill_graph_review.md`

只允许做：

- progression group → skill node 初步映射。
- skill axis 归纳。
- over-broad / ambiguous / partial group 标记。
- subject-level graph 质量审计。

禁止做：

- 直接写 G7/G8/G9 final labels。
- 生成 public write candidates。
- 修改 `public/data`。

通过标准：

- 每个 skill node 至少有明确 `skill_node_id`、`subject_slug`、`axis`、`source_progression_groups`。
- `group_to_skill_map` 对每个 group 给出 `mapping_confidence` 和 `mapping_risk_flags`。
- ambiguous groups 必须保留为 review item，不能强行归并。
- 同一 skill node 可覆盖多个 progression groups，但必须解释合并理由。

### Gate 3：Progression Inference

前置条件：Gate 1 和 Gate 2 都已冻结并通过机器 audit。Gate 3 本身只生成 draft candidates；进入 public write review 仍必须人工复核。

目标：从 skill graph 推出 progression candidates，而不是直接写生产数据。

输出：

- `generated/h4g_progression_candidates/by_subject/*.json`
- `generated/h4g_progression_candidates/review_worklist.md`
- `generated/h4g_progression_candidates/public_write_candidates.json`

只允许做：

- G7/G8/G9 descriptor draft。
- confidence scoring。
- ambiguity tagging。
- recommended next action。

禁止做：

- 自动写入 H4G production。
- 修改官方 `standard` 正文。
- 把单一来源推断当成稳定差异。

通过标准：

- 至少 2 个独立来源支持同一个年级差异。
- 至少 1 个来源为 P0/P1。
- 候选 descriptor 必须能回链到 skill node 和 evidence item。
- 低于阈值的 candidate 必须标记为 `shared_standard_with_grade_specific_learning_path`。

## Freeze 与 Confidence Gate

每个 gate 都必须显式产出 freeze 状态：

| Gate | Freeze artifact | Freeze 条件 | 解冻条件 |
| --- | --- | --- | --- |
| Gate 0 | `source_registry.freeze.json` | source schema/audit 通过，无 dead URL，无未解释来源 | 新增或删除 source |
| Gate 1 | `evidence_items.freeze.json` | evidence 可追溯、confidence 完整、低置信隔离 | source registry 变化 |
| Gate 2 | `skill_graph.freeze.json` | skill node/map 审核通过，ambiguous item 已列入 worklist | evidence freeze 变化 |
| Gate 3 | `progression_candidates.freeze.json` | candidate 双来源支持，人工 review 完成 | skill graph 变化 |

建议 confidence 阈值：

| 阶段 | 进入下一 gate 的最低要求 |
| --- | --- |
| Source | `authority_score >= 0.60`，且 `allowed_use` 非空 |
| Evidence | `confidence >= 0.55` 才能进入 skill graph；低于阈值只保留为参考 |
| Skill map | `mapping_confidence >= 0.60` 才能进入 progression inference |
| Progression candidate | `candidate_confidence >= 0.70` 且双来源支持，才允许进入人工 public-write review |

## 当前启动范围

本轮已经完成 Gate 0-3 的只读执行。

明确不做：

- 不做 full 14-day pipeline。
- 不做全学科同步补强。
- 不做完整 production skill graph 自动批准。
- 不做 final G7/G8/G9 descriptor。
- 不做 public write。

Gate 3 的 `public_write_candidates.json` 当前明确为 0 条，原因是候选仍缺人工 review 和更细粒度 item/unit-level evidence。

## Gate 0 执行记录

状态：已执行，`source_registry.freeze.json` 为 `frozen_candidate`。

执行时间：2026-07-04。

已生成产物：

- `generated/h4g_supplemental_sources/source_registry.json`
- `generated/h4g_supplemental_sources/source_authority_map.json`
- `generated/h4g_supplemental_sources/source_index_by_subject.json`
- `generated/h4g_supplemental_sources/source_registry.md`
- `generated/h4g_supplemental_sources/source_registry_audit.json`
- `generated/h4g_supplemental_sources/source_registry_audit.md`
- `generated/h4g_supplemental_sources/source_registry.freeze.json`

验证结果：

- registry sources：25。
- P0 sources：13。
- P1 sources：8。
- P2 sources：2。
- P3 sources：2。
- URL validation：25/25 valid。
- subject coverage：9/9 学科均有 P0/P1 source。
- writes public data：false。
- changes official standard text：false。
- direct matcher use：false。

本次新增脚本：

- `scripts/grade7_9/build_h4g_supplemental_source_registry.js`
- `scripts/grade7_9/audit_h4g_supplemental_source_registry.js`

本次新增 npm scripts：

```bash
npm run grade7_9:h4g-supplemental-source-registry -- --validate-urls --strict --freeze
npm run grade7_9:audit-h4g-supplemental-source-registry -- --strict --require-url-validation
```

Gate 0 freeze 的含义只限于 source metadata，不包含 evidence extraction、skill mapping、progression inference 或 public write permission。

## Gate 1 执行记录

状态：已执行，`evidence_items.freeze.json` 为 `frozen_candidate`。

执行时间：2026-07-04。

已生成产物：

- `generated/h4g_supplemental_evidence/evidence_items.json`
- `generated/h4g_supplemental_evidence/task_signal_items.json`
- `generated/h4g_supplemental_evidence/evidence_extraction_audit.json`
- `generated/h4g_supplemental_evidence/evidence_extraction_audit.md`
- `generated/h4g_supplemental_evidence/evidence_items.freeze.json`

验证结果：

- H4G records：1081。
- progression groups：390。
- evidence items：5530。
- task signal items：17213。
- groups with evidence：390/390。
- missing P0 evidence groups：0。
- missing G8 anchor groups：0。
- missing G9 cap groups：0。
- writes public data：false。
- direct grade assignment：false。

grade signal hint 分布：

| grade_signal_hint | count |
| --- | ---: |
| `H4G7-H4G9_shared` | 1950 |
| `G8_anchor` | 672 |
| `G9_cap` | 2361 |
| `framework_only` | 547 |

本次新增脚本：

- `scripts/grade7_9/build_h4g_supplemental_evidence.js`
- `scripts/grade7_9/audit_h4g_supplemental_evidence.js`
- `scripts/grade7_9/h4g_supplemental_pipeline_utils.js`

本次新增 npm scripts：

```bash
npm run grade7_9:h4g-supplemental-evidence -- --strict --freeze
npm run grade7_9:audit-h4g-supplemental-evidence -- --strict
```

Gate 1 freeze 的含义只限于 source-derived evidence 和 task signals。它不代表 G7/G8/G9 已经被区分，也不代表任何 descriptor 可发布。

## Gate 2 执行记录

状态：已执行，`skill_graph.freeze.json` 为 `frozen_candidate`。

执行时间：2026-07-04。

已生成产物：

- `generated/h4g_skill_graph/skill_nodes.json`
- `generated/h4g_skill_graph/skill_edges.json`
- `generated/h4g_skill_graph/group_to_skill_map.json`
- `generated/h4g_skill_graph/skill_graph_audit.json`
- `generated/h4g_skill_graph/skill_graph_review.md`
- `generated/h4g_skill_graph/skill_graph.freeze.json`

验证结果：

- H4G records：1081。
- expected groups：390。
- group_to_skill_map：390。
- unmapped groups：0。
- skill nodes：388。
- skill edges：304。
- audit valid：true。
- audit warnings：62。
- writes public data：false。
- direct grade assignment：false。

风险信号：

| risk_flag | count |
| --- | ---: |
| `all_groups_exact_core_identical` | 323 |
| `partial_triplet_group` | 60 |

说明：Gate 2 的 `skill_nodes` 是 v0 invariant skill nodes，不是最终能力本体。节点数接近 group 数，说明当前 `domain/subdomain` 粒度已经很细；后续如要提高泛化能力，应在人工 review 后再做跨 group 合并。

本次新增脚本：

- `scripts/grade7_9/build_h4g_skill_graph.js`
- `scripts/grade7_9/audit_h4g_skill_graph.js`

本次新增 npm scripts：

```bash
npm run grade7_9:h4g-skill-graph -- --strict --freeze
npm run grade7_9:audit-h4g-skill-graph -- --strict
```

## Gate 3 执行记录

状态：已执行，`progression_candidates.freeze.json` 为 `frozen_candidate`，但 public-write candidates 为 0。

执行时间：2026-07-04。

已生成产物：

- `generated/h4g_progression_candidates/progression_candidates.json`
- `generated/h4g_progression_candidates/by_subject/*.json`
- `generated/h4g_progression_candidates/review_worklist.md`
- `generated/h4g_progression_candidates/public_write_candidates.json`
- `generated/h4g_progression_candidates/progression_candidates_audit.json`
- `generated/h4g_progression_candidates/progression_candidates_audit.md`
- `generated/h4g_progression_candidates/progression_candidates.freeze.json`

验证结果：

- progression candidates：390。
- public write candidates：0。
- audit valid：true。
- audit warnings：0。
- writes public data：false。
- direct grade assignment：false。
- descriptor status：`draft_axis_only_not_public_ready`。

inference status 分布：

| inference_status | count |
| --- | ---: |
| `compressed_standard_needs_deep_evidence_extraction` | 323 |
| `partial_triplet_needs_scope_repair` | 62 |
| `manual_progression_review_ready` | 5 |

recommended next action 分布：

| recommended_next_action | count |
| --- | ---: |
| `extract_item_level_assessment_teaching_and_unit_evidence` | 323 |
| `repair_progression_group_scope_before_progression_inference` | 62 |
| `manual_gate3_progression_review` | 5 |

public write blockers：

| blocker | count |
| --- | ---: |
| `not_human_reviewed` | 390 |
| `descriptors_are_axis_drafts` | 390 |
| `public_write_requires_manual_gate3_review` | 390 |
| `compressed_standard_text_identical_across_g7_g8_g9` | 323 |
| `missing_item_level_or_unit_level_source_evidence` | 354 |
| `incomplete_h4g_triplet` | 62 |

本次新增脚本：

- `scripts/grade7_9/build_h4g_progression_candidates.js`
- `scripts/grade7_9/audit_h4g_progression_candidates.js`

本次新增 npm scripts：

```bash
npm run grade7_9:h4g-progression-candidates -- --strict --freeze
npm run grade7_9:audit-h4g-progression-candidates -- --strict
```

Gate 3 的结论是：当前系统已经能完整定位每个 H4G group 的证据状态、skill mapping 和下一步动作，但尚不能自动发布任何 G7/G8/G9 final descriptors。后续已根据 `docs/H4G_STANDARD_REWRITE_CONTRACT.md` 新增 standard rewrite staging candidate gate：允许改写产品展示用 `standard`，但保留 `source_standard_original` 和完整证据链。

## Standard Rewrite Staging Candidate 执行记录

状态：已执行，`standard_rewrite.freeze.json` 为 `frozen_candidate`，只生成 staging candidate，不写 `public/data`。

执行时间：2026-07-04。

已生成产物：

- `generated/h4g_standard_rewrite/standard_rewrite_candidates.json`
- `generated/h4g_standard_rewrite/by_subject/*.json`
- `generated/h4g_standard_rewrite/data_candidate/by_subject/*.json`
- `generated/h4g_standard_rewrite/data_candidate/manifest.json`
- `generated/h4g_standard_rewrite/data_candidate/indexes/*.json`
- `generated/h4g_standard_rewrite/standard_rewrite_audit.json`
- `generated/h4g_standard_rewrite/standard_rewrite_audit.md`
- `generated/h4g_standard_rewrite/standard_rewrite_review.md`
- `generated/h4g_standard_rewrite/standard_rewrite.freeze.json`

验证结果：

- source H4G records：1081。
- staging H4G records：1170。
- progression groups：390。
- H4G7/H4G8/H4G9 records：390 / 390 / 390。
- generated missing records：89。
- audit valid：true。
- audit warnings：0。
- writes public data：false。
- candidate data root index validation：true。

record origin 分布：

| origin | count |
| --- | ---: |
| `rewritten_existing_public_record` | 1081 |
| `generated_missing_h4g_sibling` | 89 |

standard variant type 分布：

| standard_variant_type | count |
| --- | ---: |
| `grade_adapted_from_shared_source` | 969 |
| `grade_adapted_from_partial_source_range` | 186 |
| `grade_specific_variant` | 15 |

grade adaptation method 分布：

| grade_adaptation_method | count |
| --- | ---: |
| `cognitive_complexity_split` | 687 |
| `performance_rubric_split` | 189 |
| `source_range_bridge` | 186 |
| `textbook_sequence_split` | 108 |

本次新增脚本：

- `scripts/grade7_9/build_h4g_standard_rewrite_candidates.js`
- `scripts/grade7_9/audit_h4g_standard_rewrite_candidates.js`

本次新增 npm scripts：

```bash
npm run grade7_9:h4g-standard-rewrite-candidates -- --strict --freeze
node scripts/build-indexes.js --data-root generated/h4g_standard_rewrite/data_candidate
node scripts/validate-data-indexes.js --data-root generated/h4g_standard_rewrite/data_candidate
npm run grade7_9:audit-h4g-standard-rewrite-candidates -- --strict
```

本 gate 的结论是：当前已具备完整的 G7/G8/G9 年级化 standard staging surface，适合进入用户整体 review。由于本轮生成的是 product-facing rewrite candidate，不是人工最终发布，后续不应直接 public apply；应先按 `standard_rewrite_audit.md` 和 `by_subject` 候选文件做质量 review。

## Standard Enrichment Full Batch Candidate 执行记录

状态：已执行，`standard_enrichment.freeze.json` 为 `frozen_candidate`，只生成全量补强候选，不写 `public/data`。

执行时间：2026-07-05。

已生成产物：

- `generated/h4g_standard_enrichment/standard_enrichment_candidates.json`
- `generated/h4g_standard_enrichment/by_subject/*.json`
- `generated/h4g_standard_enrichment/data_candidate/by_subject/*.json`
- `generated/h4g_standard_enrichment/data_candidate/manifest.json`
- `generated/h4g_standard_enrichment/data_candidate/indexes/*.json`
- `generated/h4g_standard_enrichment/standard_enrichment_audit.json`
- `generated/h4g_standard_enrichment/standard_enrichment_audit.md`
- `generated/h4g_standard_enrichment/standard_enrichment_review.md`
- `generated/h4g_standard_enrichment/standard_enrichment.freeze.json`

验证结果：

- H4G records：1170。
- progression groups：390。
- H4G7 / H4G8 / H4G9 records：390 / 390 / 390。
- quality flagged records：0。
- audit valid：true。
- audit warnings：0。
- writes public data：false。
- candidate data root index validation：true。
- public data index validation：true。

standard enrichment method 分布：

| standard_enrichment_method | count |
| --- | ---: |
| `full_batch_cognitive_complexity_enrichment` | 687 |
| `full_batch_performance_rubric_enrichment` | 189 |
| `full_batch_source_range_bridge_enrichment` | 186 |
| `full_batch_textbook_sequence_enrichment` | 108 |

review status 分布：

| review_status | count |
| --- | ---: |
| `standard_enrichment_candidate_needs_review` | 984 |
| `standard_enrichment_partial_source_bridge_needs_review` | 186 |

本次新增脚本：

- `scripts/grade7_9/build_h4g_standard_enrichment_candidate.js`
- `scripts/grade7_9/audit_h4g_standard_enrichment_candidate.js`

本次新增 npm scripts：

```bash
npm run grade7_9:h4g-standard-enrichment-candidate -- --strict --freeze
node scripts/build-indexes.js --data-root generated/h4g_standard_enrichment/data_candidate
node scripts/validate-data-indexes.js --data-root generated/h4g_standard_enrichment/data_candidate
npm run grade7_9:audit-h4g-standard-enrichment-candidate -- --strict
```

本 gate 的结论是：当前已完成一次全量 H4G standard 补强候选。它比上一层 rewrite candidate 更适合作为用户整体 review 的主入口，但仍不是 production write。后续已新增 publication contract 和 dry-run apply/audit gate，用于在写入正式 `public/data` 前先生成隔离候选根并完成对账。

## Standard Enrichment Publication Candidate 执行记录

状态：已执行，只生成 publication dry-run candidate root，不写 `public/data`。

执行时间：2026-07-05。

契约文件：

- `docs/H4G_STANDARD_ENRICHMENT_PUBLICATION_CONTRACT.md`

已生成产物：

- `generated/h4g_standard_enrichment_publication/data_candidate/by_subject/*.json`
- `generated/h4g_standard_enrichment_publication/data_candidate/manifest.json`
- `generated/h4g_standard_enrichment_publication/data_candidate/indexes/*.json`
- `generated/h4g_standard_enrichment_publication/publication_apply_summary.json`
- `generated/h4g_standard_enrichment_publication/publication_apply_summary.md`
- `generated/h4g_standard_enrichment_publication/publication_audit.json`
- `generated/h4g_standard_enrichment_publication/publication_audit.md`

验证结果：

- candidate H4G records：1170。
- existing public H4G records replaced：1081。
- new H4G sibling records added：89。
- progression groups：390。
- H4G7 / H4G8 / H4G9 records：390 / 390 / 390。
- non-H4G changed records：0。
- publication candidate audit valid：true。
- publication candidate index validation：true。
- current public data index validation：true。
- writes public data：false。

本次新增脚本：

- `scripts/grade7_9/build_h4g_standard_enrichment_publication_candidate.js`
- `scripts/grade7_9/audit_h4g_standard_enrichment_publication_candidate.js`

本次新增 npm scripts：

```bash
npm run grade7_9:h4g-standard-enrichment-publication-candidate -- --strict --clean
node scripts/build-indexes.js --data-root generated/h4g_standard_enrichment_publication/data_candidate
node scripts/validate-data-indexes.js --data-root generated/h4g_standard_enrichment_publication/data_candidate
npm run grade7_9:audit-h4g-standard-enrichment-publication-candidate -- --strict
npm run validate:indexes
```

本 gate 的结论是：当前已经有一个可审计的 public apply candidate root，能准确展示 enrichment 发布后的完整数据形态。后续已在用户明确要求下进入 production write gate。

## Standard Enrichment Publication Review Packet 执行记录

状态：已执行，只生成 review packet 和机器可读 review surface，不写 `public/data`。

执行时间：2026-07-05。

已生成产物：

- `docs/H4G_STANDARD_ENRICHMENT_PUBLICATION_REVIEW_PACKET.md`
- `generated/h4g_standard_enrichment_publication/publication_review_surface.json`

验证结果：

- review packet valid：true。
- writes public data：false。
- candidate H4G records：1170。
- P0 groups：62。
- P1 groups：323。
- P2 groups：5。
- generated missing sibling records：89。
- partial source range bridge records：186。

本次新增脚本：

- `scripts/grade7_9/build_h4g_standard_enrichment_publication_review_packet.js`

本次新增 npm script：

```bash
npm run grade7_9:h4g-standard-enrichment-publication-review-packet -- --strict
```

本 gate 的结论是：review 入口已经可读化。P0 全部来自艺术 partial source range bridge：62 个 groups、186 条 records，其中 89 条是新补 H4G sibling；P1 为 323 个 compressed source-original triplets，适合做跨学科抽样 review；P2 只有 5 个 English groups。用户随后明确要求全量发布，因此进入 production write gate。

## Standard Enrichment Production Release 执行记录

状态：已执行，已全量写入正式 `public/data`。

执行时间：2026-07-05。

已生成产物：

- `generated/h4g_standard_enrichment_publication/publication_release_summary.json`
- `generated/h4g_standard_enrichment_publication/publication_release_summary.md`
- `generated/h4g_standard_enrichment_publication/publication_release_audit.json`
- `generated/h4g_standard_enrichment_publication/publication_release_audit.md`
- `generated/h4g_standard_enrichment_publication/backups/public_data_before_h4g_standard_enrichment_2026-07-05T04-39-34-888Z`

验证结果：

- public records：2022。
- public H4G records：1170。
- progression groups：390。
- H4G7 / H4G8 / H4G9 records：390 / 390 / 390。
- H4G candidate content mismatches：0。
- non-H4G mismatches：0。
- published status errors：0。
- public data index validation：true。
- frontend build：true。

本次新增脚本：

- `scripts/grade7_9/publish_h4g_standard_enrichment_publication_candidate.js`
- `scripts/grade7_9/audit_h4g_standard_enrichment_publication_release.js`

本次新增 npm scripts：

```bash
npm run grade7_9:publish-h4g-standard-enrichment-publication-candidate -- --write --confirm-h4g-standard-enrichment-publication --strict
npm run grade7_9:audit-h4g-standard-enrichment-publication-release -- --strict
```

本 gate 的结论是：H4G standard enrichment 已完成全量 production release。正式 `public/data` 中 984 条普通 enrichment records 标记为 `standard_enrichment_published_full_batch`，186 条 partial source bridge records 标记为 `standard_enrichment_partial_source_bridge_published_full_batch`。

## 风险与原则

### 风险 1：把 G9 考试能力误当成 G7/G8/G9 全部差异

解决：G9 考试只能提供上限，G7/G8 必须结合教材、教学要求和 G8 质量监测补充。

### 风险 2：地方资料和国家课标冲突

解决：地方资料只作为实现层证据，不覆盖国家课标；冲突时以国家课标为准。

### 风险 3：非考试学科被考试逻辑误伤

解决：艺术、体育、劳动、信息科技优先用表现性评价、项目任务、质量监测和课程实施资料。

### 风险 4：为了“分清楚”制造假差异

解决：允许存在 `shared_standard_with_grade_specific_learning_path`。真正要区分的是学习路径、任务复杂度、评价证据，而不是强改课标正文。

## 下一步最小可执行动作

当前 Gate 0-3、standard rewrite staging candidate、standard enrichment full-batch candidate、publication dry-run candidate、publication review packet 和 production release 已完成闭环。下一步应进入发布后 QA，而不是继续改写发布数据。

优先级：

1. 先运行并保留 `generated/h4g_standard_enrichment_publication/publication_release_audit.md` 作为发布证明。
2. 做前端抽样 QA：艺术、英语、科学、数学各打开 H4G7/H4G8/H4G9 代表标准，确认 preview 文案和详情页展示正常。
3. 检查筛选、搜索、对比、收藏清单是否能处理 2022 条正式 standards。
4. 记录任何需要后续人工微调的 wording 问题，但不要直接绕过 release gate 修改 `public/data`。

后续 Codex 启动指令：

```text
Start from the standard enrichment production release.

Task:
QA the H4G G7/G8/G9 standard enrichment production release in this order:
1. release audit summary
2. public data indexes
3. frontend build output
4. representative subject pages
5. standard detail pages for H4G7/H4G8/H4G9 triplets

Constraints:
- Do NOT rewrite public/data without a new release gate.
- Do NOT lose source_standard_original.
- Keep all new evidence traceable to Gate 0 source ids.

Inputs:
- generated/h4g_standard_enrichment_publication/publication_release_audit.md
- generated/h4g_standard_enrichment_publication/publication_release_summary.md
- docs/H4G_STANDARD_ENRICHMENT_PUBLICATION_REVIEW_PACKET.md
- generated/h4g_standard_enrichment_publication/publication_review_surface.json
- generated/h4g_standard_enrichment/standard_enrichment_audit.md
- generated/h4g_standard_enrichment/standard_enrichment_candidates.json
- generated/h4g_standard_enrichment/by_subject/*.json
- generated/h4g_standard_enrichment/data_candidate/by_subject/*.json
- generated/h4g_standard_enrichment_publication/publication_audit.md
- generated/h4g_standard_enrichment_publication/publication_apply_summary.md
- generated/h4g_standard_enrichment_publication/data_candidate/by_subject/*.json

Validation:
- Every resolved blocker must have evidence ids.
- Every reviewed candidate must preserve source_standard_original.
- Release audit must remain valid after any further public data change.
```
