# kebiao 工具与接口

kebiao 收录义务教育 14 门学科的课程标准（2022年版2025年修订）：513 条标准、2,520 条要点，要点逐字取自课标原文并标页码；最新印次的教材逐课对到要点，并附教材原话。

两种接法，背后是同一组只读工具，回答内容一致：
- MCP：`https://www.kebiao.org/mcp`（Streamable HTTP，不需要授权）。
- HTTP GET：`https://www.kebiao.org/api/v1/plugin/<接口>?参数=值`，返回 JSON，`answer` 字段是一段可直接引用的中文，带编码、原文、页码和 kebiao 链接。

| MCP 工具 | HTTP 接口 | 参数（*必填） | 用途 |
| --- | --- | --- | --- |
| `find_textbook_chapter` | `textbook-chapter` | query*（教材版本、年级册次、课题），subject，grade | 按教材课题找这一课「主要在教」「也涉及」的要点和教材原话 |
| `search_standards` | `search` | query*，subject，stage（如 3-4、五年级、初中），limit（1–10） | 按教学内容检索课标 |
| `get_standard` | `standard` | code*（标准、要点或 2022 年版旧编码） | 标准句、全部要点原文和页码、学业要求 |
| `get_textbook_links` | `textbooks` | code* | 这条课标在哪些教材的哪一课教 |
| `list_standards` | `standards` | subject*，stage | 一门学科的标准列表 |
| `get_stage_goals` | `stage-goals` | subject*，stage | 学段目标原文 |
| `compare_versions` | `changes` | code* | 2025 修订改了哪些要点 |
| `get_check_questions` | `checks` | subject，code，grade，topic，limit（编码、年级、关键词至少一个） | 课堂诊断题：每个错误答案对应一种常见错法，附放映链接 |
| `list_subjects` | `subjects` | 无 | 14 门学科、学段和条数 |

编码规则：`MA-S3-NA-01` 是数学（MA）第三学段（S3）数与运算（NA）第 1 条标准；`MA-S3-NA-01.3` 是它的第 3 条要点。

引用规则：
- 原文一字不改；
- 标「kebiao 整理」的标准句是 kebiao 用课标原词写的概括；
- 教材对应是 AI 判断，待核验；
- 修订版文本取自凤溪中学转载的日常修订版，以官方出版物为准。
