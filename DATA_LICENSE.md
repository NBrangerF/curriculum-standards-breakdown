# kebiao 数据许可

kebiao 自己整理和编写的数据，以[知识共享 署名 4.0 国际许可协议（CC BY 4.0）](https://creativecommons.org/licenses/by/4.0/deed.zh-hans)发布。你可以复制、分发、改编，也可以用于商业用途，只要注明出处。协议全文：<https://creativecommons.org/licenses/by/4.0/legalcode>。

## 包括哪些

- **编码与结构**：标准和要点的编码（如 `MA-S2-NA-02`、`MA-S2-NA-02.1`），标准名，学段、领域等分类，学科骨架。
- **kebiao 整理的文字**：标「kebiao 整理」的标准句、表现示例，概念词典里 kebiao 写的说明。
- **对照与标记**：2022 年版旧编码与 2025 修订版的对照（`public/data/v2/legacy_codes.json`），2025 修订标记，页码索引，核对状态（已核对、识别存疑、表格重建）。
- **推断层（待核验）**：教材每一课与要点的对应关系，课堂学习目标，知识图谱里的「要先会」关系，可迁移技能标签。这些由程序和 AI 生成，没有经过逐条人工审核。
- **kebiao 编写的课堂诊断题**。

以上内容在 `public/data/` 下的 JSON 文件里，也通过 API（<https://www.kebiao.org/api/v1>）和 MCP（<https://www.kebiao.org/mcp>）提供，许可相同。

## 不包括哪些

- **课标原文**：要点、学业要求、教学提示、学段目标、必做实验等取自教育部《义务教育课程标准（2022年版2025年修订）》的文字。它们不是 kebiao 的作品，kebiao 不对其主张权利，也不就其授予许可。修订版文本取自上海市青浦区凤溪中学网站转载的日常修订版，以官方出版物为准。
- **教材**：教材 PDF、页面图像，以及对应关系里引用的教材原话。版权归各出版社。
- **第三方平台的内容**：国家中小学智慧教育平台等平台的课程标题、教学设计和学习任务单摘录、链接。
- **学习资源**：各自的来源和许可见资源详情页。
- **源代码**：网站、API 和脚本的代码不在本许可范围内，另行说明。

## 怎么署名

请写明 kebiao、链接和许可，例如：

> 课标结构化数据：kebiao 课标（https://www.kebiao.org），CC BY 4.0

如果改动过数据，请说明改了什么。需要精确到版本时，加上 `data_version`（见 <https://www.kebiao.org/api/v1/data-version>，如 `2025r-a4888c533b`）。

引用课标原文时，另注原文出处：

> 课标原文：教育部《义务教育课程标准（2022年版2025年修订）》

## 提醒

推断层的内容可能有错。转用时请保留「待核验」或「机器生成」的说明。CC BY 4.0 不提供任何担保；发现错误请到 <https://www.kebiao.org/feedback> 告诉我们。

---

**English summary.** Data that kebiao structured or wrote itself (codes, names, structure, kebiao summaries, the 2022→2025 code map, revision and verification marks, machine- and AI-inferred alignments, learning objectives and prerequisite links, and kebiao-written diagnostic questions) is released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The official curriculum-standard text, textbook content and quotes, third-party platform content, learning resources and the source code are not covered. Attribute as: "kebiao 课标 (https://www.kebiao.org), CC BY 4.0".
