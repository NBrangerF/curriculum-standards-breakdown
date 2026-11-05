# kebiao 工具与接口

kebiao 收录义务教育 14 门学科的课程标准（2022年版2025年修订）：513 条标准、2,520 条要点，要点逐字取自课标原文并标页码；新教材逐课对到要点，附教材原话。

同一组只读工具，三种接法，回答一致：
- kebiao 连接器 / MCP：`https://www.kebiao.org/mcp`（不需要授权）。
- 命令行或 WebFetch：`https://www.kebiao.org/api/v1/plugin/<接口>?参数=值`，返回 JSON，`answer` 字段是一段可直接引用的中文，带编码、原文、页码和链接。中文参数要 URL 编码（`curl -G --data-urlencode` 会自动处理）。
- 脚本：`bash scripts/kebiao.sh <接口> 参数=值 …`，只打印 `answer`。

| MCP 工具 | 接口 | 参数（*必填） | 用途 |
| --- | --- | --- | --- |
| `find_textbook_chapter` | `textbook-chapter` | query*（老师的说法，如「人教版 八年级上册 光的反射」），subject，grade，edition，volume | 这一课「主要在教」「也涉及」的要点原文、页码、教材原话和课堂学习目标 |
| `search_standards` | `search` | query*，subject，stage（如 3-4、五年级、初中），limit（1–10） | 按教学内容检索课标 |
| `get_standard` | `standard` | code*（标准、要点或 2022 年版旧编码） | 标准句、全部要点原文和页码、学业要求；编码不存在时列出真实编码 |
| `get_textbook_links` | `textbooks` | code* | 这条课标在哪些教材的哪一课教 |
| `check_objectives` | `objectives-check` | objectives*（一行一条），subject*，grade，topic，codes（逗号分隔） | 目标体检：依据、程度、缺什么、「学生能……」改写；会调用 AI，每分钟次数有上限 |
| `get_check_questions` | `checks` | subject，code，grade，topic，limit（编码、年级、关键词至少一个） | 课堂诊断题：每个错误答案对应一种常见错法 |
| `compare_versions` | `changes` | code* | 2025 修订改了哪些要点 |
| `list_standards` | `standards` | subject*，stage | 一门学科的标准列表 |
| `get_stage_goals` | `stage-goals` | subject*，stage | 学段目标原文 |
| `list_subjects` | `subjects` | 无 | 14 门学科、学段和条数 |

编码规则：`MA-S3-NA-01` 是数学（MA）第三学段（S3）数与运算（NA）第 1 条标准；`MA-S3-NA-01.3` 是它的第 3 条要点。

例子：
- `bash scripts/kebiao.sh textbook-chapter "query=统编版 四年级上册 观潮"`
- `bash scripts/kebiao.sh search "query=浮力" subject=物理 stage=初中`
- `bash scripts/kebiao.sh standard code=MA-S3-NA-01`
- `bash scripts/kebiao.sh objectives-check "objectives=使学生掌握分数的基本性质" subject=数学 grade=五年级 "topic=分数的基本性质"`
- `bash scripts/kebiao.sh checks grade=5 topic=通分`

引用规则：原文一字不改；标「kebiao 整理」的标准句是 kebiao 用课标原词写的概括；教材对应是 AI 判断，待核验；修订版文本取自凤溪中学转载的日常修订版，以官方出版物为准。
