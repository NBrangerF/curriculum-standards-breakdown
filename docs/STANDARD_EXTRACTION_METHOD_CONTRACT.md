# Standard Extraction Method Contract

Status: v1. This contract freezes how standards should be extracted from the
curriculum documents before any further H4G source-anchor correction or
standard rewrite work.

This file is the master method contract. Subject-specific H4G repair contracts
must follow it.

## 1. Core Decision

The current problem is not primarily grade progression. The current H4G
G7/G8/G9 grade differentiation is useful, but some subjects selected the wrong
curriculum section as the shared source anchor.

Therefore the next major task is:

> Fix the extraction source method for each subject, then remap H4G standards
> to the correct source anchors subject by subject.

## 2. Stage Policy

| Stage | Policy |
| --- | --- |
| H1, H2, H3 | Keep the existing extraction method. These stages are treated as the stable reference implementation unless a later audit finds a specific defect. |
| H4G7, H4G8, H4G9 | Keep the current grade differentiation as the starting point, but correct source anchors and classification according to this contract. |

For H4G, source-anchor correction comes before any new standard rewrite. A
record should be rewritten only when the existing grade-level standard no
longer aligns with the corrected source anchor.

## 3. Data Layering

Every standard must separate these layers:

| Layer | Meaning |
| --- | --- |
| official source text | The curriculum section from which the standard is extracted. |
| source anchor | The selected primary source unit used to justify one or more product standards. |
| supporting source | Narrower content requirements, textbook evidence, exams, teaching guidance, or prior source text. |
| product standard | The user-facing standard shown in the website. |
| grade adaptation | G7/G8/G9 cognitive and task-complexity differentiation. |

The source anchor and the product standard are not always the same text. For
example, a broad academic quality description may anchor several narrower
product standards, while task/content evidence makes the product standard
specific enough for users.

## 4. Required Source Fields

Future candidates must support these fields where applicable:

| Field | Meaning |
| --- | --- |
| `source_section_type` | Curriculum section type: `学业质量描述`, `学段目标`, `课程内容-学业要求`, `课程内容-内容要求`, `课程内容-素养表现`, etc. |
| `source_anchor_id` | Stable id for the selected primary source anchor. |
| `source_anchor_category` | Canonical product/category grouping required by this contract. |
| `source_anchor_subcategory` | More specific source descriptor. |
| `source_standard_original` | Correct primary source text. |
| `supporting_source_standard_original` | Narrower or prior source text retained as support. |
| `previous_source_standard_original` | Previous public source text when doing correction. |
| `core_concept_tag` | Required for Science when standards are extracted from core concepts. |
| `task_group_tag` | Required for Labor when standards are extracted from task groups. |
| `learning_theme_tag` | Required for Morality and Law when standards are extracted from learning themes. |
| `content_module_tag` | Required when source specificity depends on curriculum content modules, especially PE and Science. |

## 5. Subject Extraction Rules

### 5.1 Chinese

Primary source:

- 学业质量描述

Canonical categories:

- 表达与交流
- 梳理与探究
- 识字与写字
- 阅读与鉴赏

Method:

- Extract standards from academic quality descriptions.
- Use learning task groups and content requirements as supporting evidence,
  not as the primary H4G source anchor.
- Existing H4G grade differentiation may be retained when it aligns with the
  corrected academic quality anchor.

### 5.2 Arts

Primary source:

- 学业质量描述

Canonical categories:

- 审美感知
- 艺术表现
- 创意实践
- 文化理解

Method:

- Extract standards from academic quality descriptions.
- Keep art-discipline tags such as music, visual arts, dance, drama, film, or
  digital media when they are needed for specificity.
- Use art-discipline content requirements as supporting evidence.
- A single academic quality description may anchor multiple product dimensions
  when the product standard is classified as 审美感知, 艺术表现, 创意实践, or
  文化理解. In that case, preserve the art discipline as a tag and treat the
  dimension as the product category, not as a separate official source section.

### 5.3 English

Primary source:

- 学段目标

Canonical categories:

- 文化意识
- 语言能力
- 学习能力
- 思维品质

Method:

- Extract standards from stage objectives.
- Use content requirements such as themes, discourse, language knowledge,
  cultural knowledge, language skills, and learning strategies as supporting
  evidence.
- Product standards should remain previewable by retaining task/context
  specificity, but the primary source anchor must be the stage objective.

### 5.4 Information Technology

Primary source:

- 学段目标

Canonical categories:

- 信息意识
- 计算思维
- 数字化学习与创新
- 信息社会责任

Method:

- Extract standards from stage objectives.
- Use curriculum content modules, practice tasks, and textbook evidence as
  supporting specificity.
- Standards should not use individual content modules as the primary source
  anchor when the product category is one of the four core literacy dimensions.

### 5.5 Math

Primary source:

- 课程内容中的学业要求

Supporting source:

- 课程内容中的内容要求

Canonical categories:

- 数与代数
- 图形与几何
- 统计与概率
- 综合与实践

Method:

- Extract standards primarily from academic requirements inside curriculum
  content.
- Use content requirements to preserve mathematical object specificity.
- Use textbooks to split G7/G8/G9 sequencing and task complexity.

### 5.6 Science

Primary source:

- 课程内容中每个核心概念的内容要求

Canonical categories:

- 态度责任
- 探究实践
- 科学观念
- 科学思维

Required retained tag:

- `core_concept_tag`

Method:

- Extract standards from the content requirements under each core concept.
- Classify each standard into one of the four science literacy categories.
- Preserve the core concept as a tag rather than replacing the literacy
  category.
- Product browsing should be by literacy category, while detailed filtering and
  review should still expose the core concept.
- A single core-concept content requirement may anchor standards in different
  science literacy categories. In that case, the source text remains the core
  concept content requirement, while the product category is 态度责任, 探究实践,
  科学观念, or 科学思维.

### 5.7 Physical Education and Health

Primary source:

- 课程内容中的学业要求

Supporting source:

- 课程内容中的内容要求

Required retained tag:

- `content_module_tag`

Method:

- Extract all standards from the curriculum content section.
- Use academic requirements as the primary standard source.
- Use content requirements to preserve activity, sport, health, or module
  specificity.
- Do not use broad course goals as the primary source anchor for product
  standards.

### 5.8 Labor

Primary source:

- 课程内容中各任务群的内容要求
- 课程内容中各任务群的素养表现

Canonical categories:

- 日常生活劳动
- 生产劳动
- 服务性劳动
- 公益劳动与志愿服务

Required retained tag:

- `task_group_tag`

Method:

- Extract standards from each task group's content requirements and literacy
  performance descriptions.
- Classify each standard into one of the four labor categories.
- Preserve the task group as a tag because task group specificity is essential
  for teaching and review.

### 5.9 Morality and Law

Primary source:

- 课程内容

Canonical learning themes:

- 生命安全与健康教育
- 法治教育
- 中华优秀传统文化教育
- 革命传统教育
- 国情教育

Required retained tag:

- `learning_theme_tag`

Method:

- Extract standards primarily from curriculum content.
- Classify standards by learning theme.
- Preserve lesson/topic specificity in subcategory or supporting tags.
- Do not let broad course goals replace the learning-theme source anchor.

## 6. H4G Correction Workflow

Each subject must follow the same correction gates:

1. Build source-anchor registry from the correct source section.
2. Map existing H4G records to corrected source anchors.
3. Preserve old source text in `previous_source_standard_original`.
4. Preserve narrow source details as supporting evidence.
5. Keep grade-level standards unless they conflict with the corrected source.
6. Generate subject-specific review packet.
7. Publish only after the subject dry-run has been reviewed.

The all-subject review surface must keep source-anchor correction and grade
differentiation as separate layers. Each H4G progression group should expose:

- corrected source-anchor category and source text;
- subject-specific retained tags;
- G7/G8/G9 standards and grade-specific focus;
- textbook, task-signal, G8-anchor, and G9-cap evidence;
- priority queue for manual review.

## 7. Audit Rules

A source-anchor correction candidate is invalid if:

- a target H4G record lacks `source_section_type`;
- a target H4G record lacks `source_anchor_id`;
- a target H4G record loses prior source text;
- a subject-specific required tag is missing;
- source anchor category is outside the contract's canonical categories;
- G7/G8/G9 siblings in one progression group map to incoherent source families;
- non-target subjects change in a subject-specific run;
- the candidate writes to `public/data` before explicit approval.

## 8. Major Task Definition

The next major task is named:

`H4G_SOURCE_ANCHOR_METHOD_LOCK_AND_REMAP`

Scope:

- lock this extraction method contract;
- update subject-specific source-anchor correction rules;
- generate source-anchor registries for all nine subjects;
- run dry-run remap candidates subject by subject;
- review and publish subject batches only after their review packets are
  accepted.

Recommended execution order:

1. Chinese
2. Arts
3. English
4. Information Technology
5. Math
6. Science
7. Physical Education and Health
8. Labor
9. Morality and Law
