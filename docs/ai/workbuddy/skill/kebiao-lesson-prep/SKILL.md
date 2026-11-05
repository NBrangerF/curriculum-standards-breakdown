---
name: kebiao-lesson-prep
display_name: 依标备课｜kebiao
display_name_en: Standards-Based Lesson Prep | kebiao
description: 依据《义务教育课程标准（2022年版2025年修订）》备课：查课标原文和页码；找出教材的一课主要在教哪几条课标（附教材原话）；依标写教案；核对和精修老师自己的教学目标与教案，每处改动都附依据。数据来自 kebiao。触发词：课标原文、这一课对应哪条课标、依标备课、写教案、教学设计、简案、详案、说课稿、改教案、核对教学目标。
description_zh: 查课标原文和页码，对到教材的一课；依标写教案，核对、精修老师的教学目标和教案，每处都附依据。
description_en: Cite the 2025-revised K-9 standards, map them to textbook lessons, draft standards-aligned plans, and check or refine a teacher's own plans.
examples_zh:
- "人教版五年级下册《分数的基本性质》对应哪几条课标？列出原文和页码"
- "统编版四年级上册《观潮》第一课时，帮我写一份依标教案（45 人，40 分钟）"
- "帮我核对并改写这两条教学目标：1. 使学生掌握分数的基本性质；2. 培养学生的合作意识（人教版五年级下册）"
examples_en:
- "Which standards does the PEP Grade 5 (vol. 2) lesson 'Basic property of fractions' teach? Quote the text and pages"
- "Write a standards-based plan for lesson 1 of 'Watching the Tide' (Grade 4, vol. 1) for a class of 45, 40 minutes"
- "Check and rewrite these objectives: 1. Students master the basic property of fractions; 2. Develop cooperation (PEP Grade 5)"
version: 2.0.0
author: 较真的范老师
---

# 依标备课（kebiao）

课标依据一律来自 kebiao（https://www.kebiao.org）：14 门学科的课标要点逐字取自课标原文并标页码，新教材逐课对到要点并附教材原话。

## 一、怎样取数（按顺序，能用哪个用哪个）

1. **kebiao 连接器的工具**：已连接时直接调用，工具名如 `find_textbook_chapter`、`search_standards`、`get_standard`、`check_objectives`、`get_check_questions`。
2. **命令行（推荐，原文不会被改写）**：
   - `bash scripts/kebiao.sh <接口> 参数=值 …`，例如 `bash scripts/kebiao.sh textbook-chapter "query=人教版 八年级上册 光的反射"`。
   - 找不到脚本时，在任何目录运行这一行，读输出里的 `answer`：
     `curl -sG "https://www.kebiao.org/api/v1/plugin/textbook-chapter" --data-urlencode "query=人教版 八年级上册 光的反射"`
   - Windows PowerShell：`(Invoke-RestMethod "https://www.kebiao.org/api/v1/plugin/textbook-chapter?query=$([uri]::EscapeDataString('人教版 八年级上册 光的反射'))").answer`
3. **WebFetch**：打开同样的地址，要求它把 JSON 里的 `answer` 字段原样返回，不要概括。
4. **断网时**：读包里的快照 `references/standards-<学科代号>.md`（索引见 @references/standards-index.md）。快照只有课标原文，没有教材对位；告诉老师「以 kebiao.org 最新版为准」，教材对位写「需联网，本次未查到」。

接口和参数见 @references/api.md。所有接口只读，只发送查询词，不需要账号；查询里不要放学生信息。

## 二、每类任务的取数步骤

| 任务 | 步骤 |
| --- | --- |
| 查课标 | `search`（query=教学内容，可加 subject、stage）→ 对结果里的编码调 `standard`（code=编码）取全部要点、页码、学业要求 |
| 2025 修订改了什么 | `standard` → `changes`（code=编码） |
| 教材对位 | `textbook-chapter`，query 直接写老师的说法，如「人教版 八年级上册 光的反射」「统编版四年级上册《观潮》」。一次返回这一课主要在教、也涉及的要点原文、页码、教材原话和课堂学习目标 |
| 写教案 | `textbook-chapter` → 需要学业要求时 `standard` → `checks`（grade、topic）取一道诊断题做当堂检测 |
| 核对与精修 | `textbook-chapter` 认出这一课的要点 → `objectives-check`（objectives=老师的目标，一行一条；subject；grade；topic）逐条体检 |

- 查空时：缩短课题再查一次；返回里列了「同名的课在哪本书」，就按它核对年级或版本。仍然没有，用 `search` 按内容检索，并写明「按内容检索，不是逐课对位」。
- 编码不存在时，`standard` 会列出同学科、同学段的真实编码，从里面选，不要再猜。

## 三、写法

模板见 @references/templates.md，按任务选用。

**教学目标**
- 主语是学生：「学生能……」，不写「使学生」「培养学生」。
- 行为看得见：说出、写出、比较、解释、用……表示、在……中找出。可以用课标原词，但要补上看得见的行为和程度。
- 程度不超过课标：不超出课标写明的限定（例如「不包括将循环小数转化成分数」），不提前教本单元后面几课的内容。
- 一课 1–3 条，每条不超过 70 字，后面用方括号标依据编码。

**大班课堂（45 人左右）**
- 先让学生自己试 1–3 分钟，再根据学生的想法讲解，然后练习。
- 以同桌交流为主；四人小组每节不超过两次，每次不超过 8 分钟。
- 每个学生活动环节写一句「怎样看全班」：手势、举草稿纸、抽查几人等。
- 当堂检测要能看出每条目标是否达到。
- 作业写预计分钟数：小学一、二年级不布置书面家庭作业；三至六年级每天书面作业平均不超过 60 分钟；初中不超过 90 分钟。这是全部学科的总量，一门课的作业要远少于此。

**核对与精修**
- 保留老师的结构、思路、措辞和学校模板，只做三类改动：对齐课标、补上漏掉的主要在教的要点、删改超标和提前教的内容。
- 每处改动写「原文 → 改为 → 依据或理由」；修改后的全文里，改动处标【改】。
- 老师只要核对时，只给诊断，不动原文。

## 四、引用

- 课标原文、编码、页码、教材原话只复制工具返回的文字，原文放在「」里，后面写（编码，课标第 N 页）。「」只放课标原文；老师的原文、改写和教材原话用“”。
- 依据要和这一课教的内容对得上。体检工具给出的依据不在这一课的学段，或内容不相干（例如五年级分数课的目标被对到初中要点、或综合与实践里关于体育的要点），不要采用；没有合适依据的目标，写「这一条没有直接的课标依据」，不要硬套。
- 建议新增目标时，只写这一课该教的内容；本单元后面几课的内容（例如分数的基本性质之后的约分、通分）不要放进来。
- 标「kebiao 整理」的标准句是概括，不是课标原句；教材对位和课堂学习目标是 AI 判断，注明「待核验」。
- 每条依据附 kebiao 链接，写成 [编码](链接)。
