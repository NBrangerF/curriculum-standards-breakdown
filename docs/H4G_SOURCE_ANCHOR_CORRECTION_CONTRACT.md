# H4G Source Anchor Correction Contract

Status: v1 draft for source-anchor correction. This contract fixes the next
problem after the full H4G standard enrichment publication: the G7/G8/G9
grade-level standards are generally usable, but the shared curriculum source
anchor was selected from the wrong section for several subjects.

This contract is intentionally narrower than the enrichment publication
contract. It does not redesign grade progression. It corrects the official
source layer that the product-facing standards inherit from.

## 1. Core Decision

The next correction must preserve the current grade differentiation unless a
record clearly conflicts with the corrected source anchor.

The primary repair target is:

- `source_standard_original`
- source section metadata
- subject category/subcategory alignment
- source lineage and review surface

The primary non-target is:

- a full rewrite of all G7/G8/G9 product-facing standards

## 2. Source Layer Model

Every H4G record must distinguish three layers:

| Layer | Purpose | Public write rule |
| --- | --- | --- |
| primary source anchor | Official curriculum section that legitimizes the standard | Required |
| supporting evidence | Textbook, content requirement, exam, teaching guidance, or prior source text | Required when available |
| grade-level product standard | User-facing G7/G8/G9 preview text | May be adapted from primary source plus supporting evidence |

The primary source anchor may be broad. Supporting evidence may be narrower.
The product-facing standard should remain specific enough for users to preview.

## 3. Subject Source Rules

| Subject | Primary source section | Canonical categories | Supporting evidence |
| --- | --- | --- | --- |
| 语文 | 学业质量描述 | 表达与交流, 梳理与探究, 识字与写字, 阅读与鉴赏 | 课程内容、学习任务群、教材、评价样例 |
| 艺术 | 学业质量描述 | 审美感知, 艺术表现, 创意实践, 文化理解 | 艺术门类内容要求、教材、作品/实践任务 |
| 英语 | 学段目标 | 文化意识, 语言能力, 学习能力, 思维品质 | 内容要求、语篇/主题/语言知识、教材 |
| 信息科技 | 学段目标 | 信息意识, 计算思维, 数字化学习与创新, 信息社会责任 | 内容模块、实践任务、教材 |
| 数学 | 课程内容中的学业要求为主；内容要求补充 | 数与代数, 图形与几何, 统计与概率, 综合与实践 | 内容要求、教材顺序、例题/活动 |
| 科学 | 课程内容中每个核心概念的内容要求 | 态度责任, 探究实践, 科学观念, 科学思维 | 核心概念 tag、教材、实验/探究任务 |
| 体育 | 课程内容中的学业要求为主；内容要求辅助 | 按课程内容/产品分类重建，必须保留内容模块 tag | 内容要求、运动项目、健康模块、评价量规 |
| 劳动 | 课程内容中各任务群的内容要求和素养表现 | 日常生活劳动, 生产劳动, 服务性劳动, 公益劳动与志愿服务 | 任务群 tag、劳动项目、评价建议 |
| 道德与法治 | 课程内容 | 生命安全与健康教育, 法治教育, 中华优秀传统文化教育, 革命传统教育, 国情教育 | 学习主题 tag、教学提示、评价建议 |

Execution notes:

- Arts may reuse the same academic quality source anchor across the four
  product dimensions, but must retain the art-discipline tag.
- Science may reuse the same core-concept content requirement across the four
  literacy categories, but must retain `core_concept_tag`.
- These reuse rules affect source-anchor registry construction only. They do
  not permit unreviewed public writes.

## 4. Required Fields

Every corrected H4G candidate record must include:

| Field | Meaning |
| --- | --- |
| `source_standard_original` | Corrected official primary source text. |
| `source_section_type` | Source section type, such as `学业质量描述`, `学段目标`, or `课程内容-学业要求`. |
| `source_anchor_id` | Stable id for the selected source anchor. |
| `source_anchor_category` | Canonical subject category. |
| `source_anchor_subcategory` | More specific anchor descriptor. |
| `source_anchor_correction_contract_version` | Contract version. |
| `source_anchor_correction_status` | Candidate/review/publication status. |
| `source_anchor_correction_confidence` | Deterministic confidence score for the remap. |
| `source_anchor_correction_method` | How the anchor was selected. |
| `previous_source_standard_original` | Previously published source text. |
| `previous_source_standard_scope` | Previously published source scope. |
| `previous_domain` | Previously published product domain, when changed. |
| `previous_subdomain` | Previously published product subdomain, when changed. |
| `supporting_source_standard_original` | Prior source text retained as supporting evidence. |
| `standard_source_alignment_status` | Whether the user-facing standard needs review after anchor swap. |
| `core_concept_tag` | Required for Science source anchors. |
| `task_group_tag` | Required for Labor source anchors. |
| `learning_theme_tag` | Required for Morality and Law source anchors. |
| `content_module_tag` | Required when course-content module specificity must be retained, especially PE and Science. |

## 5. Mutation Rules

Allowed in dry-run candidates:

- Replace `source_standard_original` with the corrected official source anchor.
- Add source-anchor metadata.
- Preserve the old source in `previous_*` and supporting evidence fields.
- Normalize product grouping fields when the subject contract requires it.
- Adjust `grade_specific_focus` to stop claiming that the old source is the
  primary source.

Not allowed in this correction stage:

- Drop old source text.
- Publish directly to `public/data`.
- Change non-target subjects during a subject-specific run.
- Delete H4G triplets.
- Treat textbook or exam evidence as the primary curriculum source.

## 6. Review Gates

A subject-specific source-anchor correction candidate is valid only when:

- all target H4G records are present;
- no non-target subject changes;
- every target H4G record has `source_section_type`;
- every target H4G record has `source_anchor_id`;
- every target H4G record preserves `previous_source_standard_original`;
- every target H4G record has a non-empty canonical category;
- every G7/G8/G9 triplet shares a coherent corrected source-anchor family;
- low-confidence mappings are surfaced for human review;
- the candidate writes only under `generated/`.

## 7. Chinese v1 Pilot Rule

The Chinese pilot uses the locally curated fourth-stage academic quality records
as source anchors.

Primary source:

`generated/grade7_9_chinese_curated/mapped/chinese.json`

Accepted anchor records:

- `domain = 学业质量`
- `context` contains `第四学段学业质量描述`

Canonical category mapping:

| Anchor subdomain | Canonical category |
| --- | --- |
| 识字写字与语言积累表现 | 识字与写字 |
| 讨论、信息阅读与证据判断 | 表达与交流 |
| 议论阅读与写作表达表现 | 表达与交流 |
| 热点问题与活动设计表现 | 梳理与探究 |
| 文学作品阅读与审美表现 | 阅读与鉴赏 |
| 文化作品推荐与探究表现 | 阅读与鉴赏 |
| 跨学科学习与研究成果表现 | 梳理与探究 |

The pilot may change Chinese `domain` to the canonical category and preserve the
previous domain in `previous_domain`. The detailed topic should remain in
`subdomain`.

## 8. Publication Rule

No source-anchor correction may be written to `public/data` until the
subject-specific dry-run packet is reviewed. Publication must be a later,
explicit step with its own apply gate and release audit.

## 9. Contract Link

This H4G correction contract is subordinate to:

`docs/STANDARD_EXTRACTION_METHOD_CONTRACT.md`

If the two contracts conflict, the master extraction method contract wins.
