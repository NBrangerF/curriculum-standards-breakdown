# 教材与课标对应：逐课、有原文为证

2026-10-31。kebiao 怎样把教材的每一课对到《义务教育课程标准（2022年版2025年修订）》的要点上，参考了谁，准不准，还差什么。

## 为什么要做

老师平时面对的是教材，课标只在写教案、命题、评课时才翻。所以 kebiao 的入口是教材：打开一本书，每一课旁边就是它对应的课标要点。

在这之前，对应关系有三套，都不够：

| 来源 | 粒度 | 问题 |
| --- | --- | --- |
| 旧版教材对齐（`data/textbooks/derived/textbook_standard_alignment_index.json`） | 单元 × 旧编码（2,025 条） | 1,073 个单元里 817 个「没有可靠匹配」；编码是改版前的 |
| v2 机器对齐（`public/data/v2/textbook_links.json`） | 章节 × 标准 | 只靠目录标题和年级依据，没有读内容 |
| AI 按单元判断（`data/textbooks/smartedu/unit_picks.json`） | 单元 × 标准 | 只读了单元和课的名字；每条标准只给一条要点；理由空泛 |

## 别人怎么做

- **得克萨斯州教材审定（IMRA）**。出版社要逐条证明教材覆盖了它声称覆盖的每条学生期望（student expectation），而且要有两类证据：讲解处（narrative citation）和学生练习处（activity citation）。审定方抽查核对。覆盖率要求 100%。[IMRA 评审量规](https://im.tea.texas.gov/rubrics-and-breakout-documents)，[2025 年数学 IMRA 工具说明](https://sboe.texas.gov/state-board-of-education/sboe-meetings/math-ad-hoc-imra-tools-8-18-25.pdf)。
- **Illustrative Mathematics**。每一课列出三类标准：本课在教（Addressing）、建立在…之上（Building On）、为…作铺垫（Building Towards），并有「每课的标准」和「每条标准在哪些课」两张表。[马萨诸塞州 CURATE 评审](https://www.doe.mass.edu/instruction/curate/math-k-5-2021-illustrative-math-imagine-learning.pdf)。
- **日本教科书出版社的年间指导计划**。按单元列出教科书页码、指导时数、指导内容、对应的学习指导要领和评价规准。这是出版社给老师的「从教材出发、课标在旁」的表。[日本文教出版 小学算数](https://www.nichibun-g.co.jp/textbooks/sansu/download/r6/r6_sansu_nenkei_kousei.pdf)，[中学社会 地理](https://nichibun-g.co.jp/textbooks/c-shakai/chiri/download/r7/r7_c-shakai_chi_nenkei1.pdf)。
- **Learning Commons 知识图谱**（原陈-扎克伯格基金会教育团队）。把各州标准拆成更细的学习成分（learning components），再把课程的课时挂上去；2026 年已收录 Illustrative Math 的课时顺序。[文档](https://docs.learningcommons.org/knowledge-graph)。
- **元数据标准**。LRMI 的对应类型（assesses、teaches、requires 等）和 1EdTech CASE 的关联类型，说明「对应」本身要分类型。[LRMI alignmentType](https://www.dublincore.org/specifications/lrmi/concept_schemes/alignmentType/)，[CASE](https://www.imsglobal.org/node/199311)。
- **MathFish**（艾伦人工智能研究所、EdReports 等，EMNLP 2024）。大模型给数学题标课标，越细越不准；当错误选项和正确答案很接近时最难；GPT-4 作核验时会高估对应程度。[论文](https://arxiv.org/abs/2408.04226)。
- **题目与课标对应的规模化**（2025）。先缩小候选范围，再让模型判断，正确答案进前五的超过 95%；建议模型初筛加人工复核。[论文](https://arxiv.org/abs/2511.19749)。
- **Webb 对应性分析**。看课标的每个类别有没有被教到（categorical concurrence）、每个类别下教到的面够不够宽（range of knowledge）。[威斯康星州阅读对应研究](https://dpi.wi.gov/sites/default/files/imce/assessment/pdf/td-2006-readalign.pdf)。

## 做法

1. **找到每一课在原书的哪几页**（`scripts/resources/build_lesson_evidence.mjs`）。国家平台同步课的课题是课的名字，常常和书上的标题不完全一样（「认识东南西北四个方向（例1）」）。每一课取几个候选：标题作为页首、标题出现在页中、标题的字对大部分出现在页中（模糊），英语按 Unit 和 Part；再在整本书上取「页码不倒退、权重最大」的一条链，一个早期的错配不会把后面所有课都推错。跳过目录、单元导语（同一页列了三课以上的标题）、附录。扫描版 40 册先用 Vision OCR 识别全文（`ocr_textbook_pages.mjs`）。
2. **每一课的材料**：教材原文那几页（约 1,500 字）；国家平台教学设计第一页的教学目标和重难点（`ocr_lesson_designs.mjs`，1,779 份）；平台的课程简介。都没有的只有课题。
3. **AI 判断**（`POST /api/v1/lesson-plans/align`，`apps/api/src/textbook-align.ts`）。一个单元的课一起送，三课一组并行。模型读这门课这个年级的全部要点（历史按这一册的时期），对每一课给出：
   - 主要在教（teaches）：这一课的教学目标，大部分时间在学它；最多两条。
   - 也涉及（touches）：用到、提到、为它作铺垫；最多三条。拿不准的标也涉及。
   - 每一条摘这一课材料里的一段原话（6–30 字）。
4. **核对原话**。服务器逐条核对：原话（去掉空格标点后）在材料里，或 OCR 噪声下六字连续命中且八成字对都在，才算；摘的是课标原文而不是教材的，不算；编码不在本年级的，不算。被拒的连同原因返回（`rejected`），批处理会对「答案全被拒」的课再问一次。
5. **汇总**（`scripts/resources/build_national_lessons.mjs`）：
   - 每本书的课（`public/data/textbooks/national-lessons/<edition>.json` 的 `align`），同一课的几个课时、几个版本合并；
   - 每条要点在哪些课教（`public/data/v2/national-lessons/<前缀>.json` 的 `points`，主要在教在前，每本书最多两课）；
   - 全部课的索引（`public/data/v2/lesson_alignment.json`，给 API 和 MCP）；
   - 按学科、学段的覆盖（`public/data/textbooks/alignment_coverage.json`）。

## 网站和接口

- 每本书的课标对应表：`/textbooks/<edition>/standards`。每一课的主要在教、也涉及、原话和页码（点页码翻原书），本年级没在这本书找到的要点及它们在哪一册教；可下载 Word。
- 标准页「教材里在哪教」：按要点列出教它的课和原话。
- AI 备课：选了一课、老师没有补充时，直接勾上这一课主要在教的要点，附原话，不再现场问 AI；老师补一句，才重新找。
- 教材与课标对应总览：`/textbook-alignment`，方法、准确度、按学段的覆盖。
- API：`GET /api/v1/textbooks/{edition_id}/alignment`，`GET /api/v1/standards/{code}/lessons`（标准或要点）。MCP 的「标准对应的教材」「从教材章节找课标」先给逐课结果。

## 准不准

人工对照集（14 课，14 个学科各一课，先按课标原文标出每课该对的核心要点和可接受要点，再看 AI 的结果）：

| 版本 | 找到核心要点的课 | 主要在教的准确率 |
| --- | --- | --- |
| 第一版提示词（主要在教最多三条） | 12 / 13 | 16 / 29（55%） |
| 主要在教限两条，拿不准标也涉及 | 12 / 13 | 15 / 19（79%） |

错的多是把「也涉及」说成「主要在教」（把秦汉统一的要点也算进《东汉的兴衰》）。「也涉及」放得宽，只作参考，页面上默认折叠。

全量结果和抽查见下文「全量运行」。

## 全量运行

（运行结束后补充。）

## 还差什么

- **教研员审校**。所有对应都标「待核验」。下一步是按学科请教研员抽查，人工确认的标为「已核验」，改过的记录理由。
- **其他版本的教材**。馆里每门课只有一个版本（人教版、统编版为主）。国家平台有北师大版、苏教版等的课目录和教学设计，可以只用课题和教学设计做逐课对应，但没有原书页码。
- **英语和语文的要点很宽**。英语的语言技能、语文的学习任务群，一课常常同时对上好几条，「主要在教」的区分度不如数学、科学。
- **印刷页码**。现在给的是 PDF 页码；书上的印刷页码只有一部分教材有对照。
