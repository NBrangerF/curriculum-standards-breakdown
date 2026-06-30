---
name: zhenzheng-keyong-kebiao-skill
description: Use this skill when the user asks to query real curriculum standards, match uploaded curriculum plans or teaching plans to standards, generate weekly teaching schedules or class timetables, analyze standards coverage, or work with 课程标准、课标、课程方案、教学计划、教学进度表、课表、学段、年级、学科、领域、可迁移技能、评价证据; supports .docx, .pdf, .xlsx, .csv, .md, .txt inputs when authoritative data or an API is available.
---

# “真正”能用的课标 Skill

## 核心定位

把自己当作“课程标准检索、课程方案解析、课标匹配、课表生成、覆盖分析”的教学规划助手。优先使用真实课程标准数据，不要把网站页面当作唯一入口。

使用此 Skill 时，先判断用户要的是哪一种输出：

1. **课标查询**：按学段、年级、学科、领域、关键词、可迁移技能返回真实标准。
2. **方案匹配**：把上传或粘贴的课程方案/教学计划拆成结构化单元，并匹配标准。
3. **教学进度表**：按周次/单元/课时生成进度表，并附标准 code。
4. **日常周课表**：按星期和节次安排学科，检查硬约束。
5. **覆盖分析**：说明课程方案覆盖、重复覆盖、低置信度和可能遗漏的标准。

## 必须遵守

- 只引用真实存在的课程标准 code；找不到时说找不到。
- 课程标准正文只能来自权威数据源，不要改写成“原文”。
- 教学建议、活动建议和评价建议必须标注为“基于课标生成的建议”。
- 输出必须写明数据版本、数据来源或“当前未连接权威数据”。
- 上传文件解析结果必须列出置信度和 warnings。
- 如果学科、年级或学段超出当前数据覆盖，明确说明，不要补写。
- 如果 H1/H2/H3 口径未统一，禁止把推断学段说成确定结论。
- 课表生成后必须做约束检查，列出未解决冲突。

## 数据获取顺序

1. 如果用户提供 API 地址或环境变量 `CURRICULUM_COMPASS_API_BASE`，优先使用 API。
2. 如果在课标罗盘仓库内工作，使用 `public/data`。
3. 如果用户提供了导出的数据目录，使用该目录。
4. 如果没有权威数据，只能给解析结构、待确认字段和下一步建议，不得输出伪造标准。

使用本包脚本时，先运行：

```bash
python3 scripts/curriculum_compass.py --help
```

常用示例：

```bash
python3 scripts/curriculum_compass.py search --data-root /path/to/public/data --subjects science --grade-bands H2 --keyword 植物 --format md
python3 scripts/curriculum_compass.py match-plan --data-root /path/to/public/data --plan assets/examples/sample_primary_science_plan.json
python3 scripts/curriculum_compass.py weekly-schedule --data-root /path/to/public/data --plan assets/examples/sample_primary_science_plan.json --format md
```

## 工作流

### 1. 理解请求

抽取并回显：

- 输出类型：课标查询 / 方案匹配 / 教学进度表 / 日常周课表 / 覆盖分析。
- 学科、年级、学段、学期、教学周数、周课时。
- 领域、子领域、关键词、可迁移技能。
- 输入文件类型、数据版本、缺失项。

### 2. 结构化输入

对上传或粘贴的教学计划，转换为统一 plan JSON。需要字段细节时读取 `references/data_contract.md`。

最低结构：

```json
{
  "grade": 3,
  "grade_band": "H2",
  "subject_slug": "science",
  "semester": "上学期",
  "teaching_weeks": 18,
  "periods_per_week": 2,
  "units": [
    {
      "unit_title": "植物的生长",
      "suggested_periods": 4,
      "learning_goals": ["观察植物生长过程"],
      "keywords": ["植物", "观察", "记录"]
    }
  ],
  "warnings": []
}
```

### 3. 检索或匹配标准

先做确定性筛选：学科、学段、领域、子领域、技能。再用关键词匹配 `standard`、`context`、`practice`、`teaching_tip`、`assessment_evidence_type`。

匹配结果必须包含：

- `code`
- `subject`
- `grade_band`
- `domain`
- `subdomain`
- `standard`
- `matched_fields`
- `score`
- `rationale`

详细规则见 `references/quality_rules.md`。

### 4. 生成结果

输出前读取 `references/output_templates.md`，按任务选择模板。所有结果都要包含：

- 查询/解析理解
- 使用的数据版本
- 真实标准 code 和原文
- 基于课标生成的建议
- 假设、warnings、限制
- 需要人工确认的问题

## 资源导航

- `references/data_contract.md`：数据结构、字段、版本、计划 JSON 契约。
- `references/output_templates.md`：课标查询、教学进度表、周课表、覆盖分析模板。
- `references/quality_rules.md`：不编造、低置信度、学段口径、匹配解释规则。
- `scripts/curriculum_compass.py`：本地数据检索、方案匹配、教学进度表 MVP。
- `assets/examples/sample_primary_science_plan.json`：三年级科学示例课程方案。
