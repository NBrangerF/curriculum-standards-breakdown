---
name: zhenzheng-keyong-kebiao-skill
description: Use this skill when building or operating a GitHub-hosted curriculum standards assistant that queries real curriculum standards, parses teaching plans, matches plans to standards, generates weekly teaching schedules or class timetables, analyzes coverage, designs APIs/core packages, or handles 课程标准、课标、课程方案、教学计划、课表、教学进度表、数据契约、API 契约、GitHub skill packaging.
---

# “真正”能用的课标 Skill（GitHub 版）

## 目标

用这个 Skill 把课标罗盘从“可浏览的网站”推进为“可复用的课程标准智能引擎”。它面向 GitHub 仓库维护场景，既能回答教师的课标/课表问题，也能指导工程实现：数据契约、core package、API、解析器、匹配器、排课器和质量校验。

## 先判断任务类型

1. **教师使用任务**：查课标、匹配教学计划、生成教学进度表、生成周课表、做覆盖分析。
2. **工程建设任务**：整理数据契约、修复数据质量、抽 core package、设计 API、编写脚本、准备发布包。
3. **仓库维护任务**：更新数据版本、重建索引、增加测试 prompt、验证 GitHub/Skill Hub 产物差异。

## 执行原则

- 真实标准优先：所有标准 code 和标准正文必须来自数据源或 API。
- 结构化中间结果优先：解析课程方案时先产出 JSON，再生成自然语言。
- 可解释匹配优先：每个匹配都要给 score、matched_fields、rationale。
- 质量校验优先：课表、覆盖分析和数据发布前必须列出约束检查。
- 工程复用优先：把可重复逻辑放进 scripts 或未来的 `packages/curriculum-core`，不要写成只适合一次性回答的散文。

## 推荐仓库结构

```text
curriculum-standards-breakdown/
  apps/web/
  packages/curriculum-core/
  services/api/
  skills/
    github/zhenzheng-keyong-kebiao-skill/
    skill-hub/zhenzheng-keyong-kebiao-skill/
  scripts/
  docs/
```

当前仓库尚未完全迁移到这个结构时，仍可读取现有 `public/data`、`src/data`、`docs/RESOURCE_ARCHITECTURE.md`。

## 工作流

### 1. 建立数据上下文

先确认：

- 数据根目录：默认 `public/data`。
- 数据版本：优先 `data_version.json`，否则读取 `manifest.json.generated_at` 并标注未校验。
- 覆盖学科和条目数。
- H1/H2/H3 学段口径是否统一。

需要字段细节时读取 `references/data_schema.md`。

### 2. 处理用户输入

用户上传或粘贴课程方案时：

1. 提取年级、学段、学期、学科、周课时、总课时、教学周数。
2. 提取单元、主题、学习目标、关键词、评价要求、复习/考试周。
3. 产出 parsed_plan JSON。
4. 运行 `scripts/validate_plan.py` 或等价逻辑。
5. 对缺失或低置信度字段写入 warnings。

### 3. 检索和匹配标准

先使用确定性筛选，再用关键词/语义匹配。详细规则见 `references/matching_rules.md`。

本地脚本：

```bash
python3 scripts/query_standards.py --data-root /path/to/public/data --subjects science --grade-bands H2 --keyword 植物
python3 scripts/match_standards.py --data-root /path/to/public/data --plan assets/examples/sample_primary_science_plan.json
python3 scripts/coverage_analysis.py --data-root /path/to/public/data --plan assets/examples/sample_primary_science_plan.json
```

### 4. 生成课表

区分两类课表：

- **教学进度课表**：按周次/单元/课时安排教学，附标准 code、活动建议和评价证据。
- **日常节次课表**：按星期/节次安排学科，满足周课时、固定活动、教师/教室不可用等约束。

详细规则见 `references/schedule_rules.md`。

### 5. 输出

先根据任务读取 `references/output_templates.md`，再输出。每次输出必须包含：

- 查询或解析理解。
- 数据版本。
- 真实标准 code。
- 标准正文和建议内容的区分。
- warnings、限制和人工确认项。
- 约束检查或覆盖检查。

## 资源导航

- `references/product_scope.md`：产品目标、MVP 和边界。
- `references/data_schema.md`：标准、课程方案、匹配、覆盖、课表数据模型。
- `references/matching_rules.md`：确定性筛选、关键词匹配、可解释输出。
- `references/schedule_rules.md`：教学进度表和日常周课表规则。
- `references/api_contract.md`：未来 API-backed Skill 接口建议。
- `references/output_templates.md`：教师可读输出模板。
- `references/safety_and_quality.md`：不编造、数据版本、低置信度、学段口径规则。
- `references/examples.md`：典型请求和期望处理方式。
- `scripts/`：本地 MVP 脚本，可作为未来 core package 的原型。
