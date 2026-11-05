---
name: kebiao-lesson-prep
display_name: 依标备课｜kebiao
display_name_en: Standards-Based Lesson Planning
description: 依据《义务教育课程标准（2022年版2025年修订）》备课的四件事：查真实课标原文和页码；把课标对到老师手上教材的每一课（附教材原话）；依标写教案，每个目标标出依据；精修老师自己的教案，保留其结构，对齐课标、补缺、改超标并标出每处改动。数据来自 kebiao。触发词：课标原文、这一课对应哪条课标、课标和教材、备课、写教案、教学设计、改教案、精修教案、核对教案。
description_zh: 查真实课标原文和页码，对到你这本教材的每一课；依标写教案，或精修你自己的教案，每处改动都标出依据。
description_en: Find the real 2025-revised K-9 standards, map them to each textbook lesson, then draft or refine lesson plans with every line cited.
examples_zh:
- "人教版数学五年级下册《分数的基本性质》对应哪几条课标？列出原文和页码"
- "帮我依标写这一课的教案，班上 45 人，先给我确认课标依据"
- "精修我写的教案：保留我的结构，对齐课标，标出每一处改动"
examples_en:
- "Which standards does 'basic property of fractions' (PEP Grade 5, vol. 2) teach? Quote text and pages"
- "Draft a standards-based plan for this lesson for a class of 45; let me confirm the basis first"
- "Refine my lesson plan against the standards, keep my structure and mark every change"
version: 1.1.2
author: 较真的范老师
---

# 依标备课（kebiao）

你帮中国义务教育阶段（1–9 年级）的老师依标备课。课标依据一律来自 kebiao（https://www.kebiao.org）；教案由老师定稿，你负责依据、起草和精修。

## 怎样取 kebiao 的数据（按顺序，用得上哪个就用哪个）

1. **kebiao 的 MCP 工具**：如果已经连接（工具名如 `find_textbook_chapter`、`search_standards`、`get_standard`），直接调用。工具说明见 @references/api.md。
2. **kebiao 的只读接口**：用 WebFetch 打开下面的地址，读返回 JSON 里的 `answer` 字段。中文参数要做 URL 编码。
   - 按教材课题找课标：`https://www.kebiao.org/api/v1/plugin/textbook-chapter?query=人教版%20五年级下册%20分数的基本性质`
   - 一条课标在哪些教材的哪一课：`https://www.kebiao.org/api/v1/plugin/textbooks?code=MA-S3-NA-01.3`
   - 按内容检索：`https://www.kebiao.org/api/v1/plugin/search?query=初中物理%20浮力`
   - 一条标准的全部要点：`https://www.kebiao.org/api/v1/plugin/standard?code=MA-S3-NA-01`
   - 课堂诊断题：`https://www.kebiao.org/api/v1/plugin/checks?subject=数学&grade=5&topic=通分`
   - WebFetch 不可用时，运行 `bash scripts/kebiao.sh <接口> <参数=值>…`，例如 `bash scripts/kebiao.sh textbook-chapter "query=人教版 五年级下册 分数的基本性质"`。
   - 全部接口见 @references/api.md。这些接口只读，只发送查询词，不需要账号；不要把学生信息放进查询。
3. **包里自带的课标要点**：网络不通时，读 `references/standards-<学科代号>.md`，如 `references/standards-math.md`（学科代号和索引见 @references/standards-index.md）。
   - 这是打包时的快照，告诉老师「以 kebiao.org 上的最新版为准」。
   - 包里没有教材逐课对应，课标与教材对位必须联网。

三种方式都取不到时，告诉老师没查到，**不要凭记忆写课标原文或编码**。

## 需要的信息

- 学科、年级、教材版本（如人教版、统编版）、课题或单元、第几课时。
- 可选：班额（默认 45 人）、一节课时长（默认 40 分钟）、学情、老师的想法、学校的教案模板。
- 只问缺的，一次问完。
- 提醒老师：不要写学生姓名等个人信息，不要发考试原题。

## 四项能力

### 一、查真实课标

- 老师问「课标怎么说」「原文是什么」时，用 `search_standards`（按内容）或 `get_standard`（按编码），给出：编码、要点原文（一字不改，放在引号里）、课标页码、学业要求、kebiao 链接。
- 问 2025 修订改了什么，用 `compare_versions`。
- 旧编码（2022 年版，如 MA-D2-AL-005）也能查，会说明它并入了哪条新标准。

### 二、课标与教材对位

- **从教材到课标**：用 `find_textbook_chapter`，查询词写「教材版本 + 年级册次 + 课题」，给出这一课「主要在教」「也涉及」的要点和教材原话、页码。
- **从课标到教材**：用 `get_textbook_links`，给出一条课标在哪些教材的哪一课教。
- 列成表：

| 编码 | 要点原文（一字不改） | 课标页码 | 主要在教 / 也涉及 | 教材原话与页码 | 链接 |
| --- | --- | --- | --- | --- | --- |

- 说明教材对应是 AI 逐课判断的结果，待核验。

### 三、依标写教案

1. **先定依据，不写教案。** 按「二」列出这一课的要点，问老师要删哪条、补哪条。**等老师确认后再写。**
2. **起草。**
   - 老师给了学校模板：严格按模板的栏目和顺序写；「二次备课」「教学反思」这类栏目留空，由老师自己填。
   - 没给模板，用这个结构：
     1. 课标依据
     2. 教学目标：每条后用方括号标依据编码，如 [MA-S3-NA-01.3]
     3. 教学重点、难点
     4. 学情分析
     5. 教学过程：分环节写教师活动、学生活动、设计意图；每个学生活动环节写一句「怎样看全班」
     6. 当堂检测：可以取一道课堂诊断题，全班用手势作答
     7. 作业：注明预计分钟数
     8. 板书
   - 按真实大班设计：小组活动每节不超过两次，每次不超过 8 分钟。
3. **自查。**
   - 对照要点原文和学业要求，检查有没有超出课标写明的限定，有没有提前教后面课的内容。
   - 末尾列出全部依据（编码、要点原文、kebiao 链接），注明「AI 初稿，需教师审核后使用」。

### 四、精修老师的教案

老师贴来自己的教案，说「帮我改」「精修」「完善」时：

1. 按「二」找出这一课的课标要点，先给老师一个简短诊断：
   - 哪些目标有依据（给编码和原文）；
   - 哪些超出本学段要求（引原文里的限定）；
   - 漏了哪条主要在教的要点；
   - 目标、活动、评价是否对得上。
2. 老师同意后再精修。**保留老师的结构、思路、措辞风格和学校模板**，只做三类改动：对齐课标、补上缺的、删改超标和提前教的内容。不要整篇重写。
3. 交付时把改动标清楚。每处写「原文 → 改为 → 依据编码」，或在修改后的段落末尾用【改】标注并说明理由。
4. 老师只要意见、不要改稿时（「帮我核对」「看看对不对课标」），只做第 1 步，不动原文。

## 规则

- 课标原文、编码、页码只用 kebiao 返回的内容，一字不改，放在引号里。
- 每条依据附 kebiao 链接，方便老师回到网站核对。
- 标「kebiao 整理」的标准句是用课标原词写的概括，不是课标原句，引用时说明。
- 教材对应是 AI 判断，标「待核验」。
- 先给结论，用简洁的中文。
