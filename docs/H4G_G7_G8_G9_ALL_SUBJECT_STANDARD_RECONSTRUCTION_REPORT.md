# H4G G7 G8 G9 All-Subject Standard Reconstruction Report

Status: full public-data reconstruction pass completed.

## 1. What Changed

This pass reconstructed all H4G G7/G8/G9 records across the nine subjects using
the updated source-anchor method contract.

The grade-specific `standard` text was preserved from the previously published
enrichment pass because the G7/G8/G9 differentiation layer was already usable.
The primary repair was the official source-anchor layer and product category
alignment.

For every H4G record, this pass added or updated:

- `source_anchor_id`
- `source_anchor_category`
- `source_anchor_subcategory`
- `source_section_type`
- `source_standard_original`
- `source_standard_scope`
- `previous_source_standard_original`
- `supporting_source_standard_original`
- `standard_source_alignment_status`
- `source_anchor_correction_*`
- subject-specific tags such as `art_discipline_tag`, `core_concept_tag`,
  `content_module_tag`, `task_group_tag`, or `learning_theme_tag`

## 2. Public Data Scope

| Metric | Value |
| --- | ---: |
| Subjects | 9 |
| Total public standards | 2022 |
| H4G records reconstructed | 1170 |
| H4G progression groups | 390 |
| Complete G7/G8/G9 triplets | 390 |
| Distinct G7/G8/G9 standard triplets | 390 |
| Non-H4G records changed | 0 |

## 3. Subject Results

| Subject | H4G Records | Groups | Source Section | Category Distribution |
| --- | ---: | ---: | --- | --- |
| Chinese | 156 | 52 | 学业质量描述 | 阅读与鉴赏 69; 表达与交流 21; 梳理与探究 51; 识字与写字 15 |
| Arts | 186 | 62 | 学业质量描述 | 创意实践 69; 艺术表现 36; 审美感知 27; 文化理解 54 |
| English | 132 | 44 | 学段目标 | 文化意识 30; 语言能力 57; 学习能力 21; 思维品质 24 |
| Information Technology | 66 | 22 | 学段目标 | 计算思维 15; 信息社会责任 27; 数字化学习与创新 18; 信息意识 6 |
| Math | 114 | 38 | 课程内容-学业要求 | 数与代数 39; 图形与几何 45; 综合与实践 12; 统计与概率 18 |
| Science | 201 | 67 | 课程内容-内容要求 | 态度责任 27; 科学观念 138; 探究实践 27; 科学思维 9 |
| Physical Education and Health | 123 | 41 | 课程内容-学业要求 | 体能 21; 健康教育 24; 体育品德 24; 运动能力 3; 专项运动技能 36; 跨学科主题学习 15 |
| Labor | 66 | 22 | 课程内容-任务群内容要求与素养表现 | 日常生活劳动 39; 生产劳动 18; 服务性劳动 6; 公益劳动与志愿服务 3 |
| Morality and Law | 126 | 42 | 课程内容 | 中华优秀传统文化教育 18; 法治教育 54; 生命安全与健康教育 15; 国情教育 21; 革命传统教育 18 |

## 4. Commands Run

```bash
npm run grade7_9:h4g-subject-remap-differentiation-review -- --strict
npm run grade7_9:h4g-source-anchor-remap-candidate -- --strict
npm run grade7_9:audit-h4g-source-anchor-remap-candidate -- --strict
npm run grade7_9:publish-h4g-source-anchor-remap-candidate -- --strict
npm run build:indexes
diff -qr generated/h4g_source_anchor_remap_candidate/data_candidate/by_subject public/data/by_subject
npm run grade7_9:audit-h4g-source-anchor-remap-candidate -- --base-root generated/h4g_source_anchor_remap_candidate/data_candidate --candidate-root public/data --out generated/h4g_source_anchor_remap_candidate/source_anchor_remap_public_deep_audit.json --summary-out generated/h4g_source_anchor_remap_candidate/source_anchor_remap_public_deep_audit.md --strict
npm run validate:indexes
npm run grade7_9:audit-h4g-distinctiveness -- --data-root public/data --strict
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-h4g-grade-differentiation -- --data-root public/data --strict
npm run grade7_9:audit-h4g-product-readiness -- --data-root public/data --strict
git diff --check
npm run build
```

## 5. Verification Results

| Check | Result |
| --- | --- |
| source-anchor review generation | valid |
| source-anchor remap candidate | valid |
| source-anchor remap deep audit | valid |
| public by_subject equals audited candidate | no diff |
| public source-anchor remap audit | valid |
| index validation | valid |
| H4G distinctiveness audit | valid; 390/390 differentiated triplets |
| grade-band policy audit | valid |
| H4G grade-differentiation audit | valid; `differentiation_ready=false` under final manual-review definition |
| H4G product-readiness audit | valid; `product_ready=false` under unit-evidence/manual-approval definition |
| production build | passed |

## 6. Important Residual Layer

The reconstruction pass is complete at the source-anchor and published standard
data layer. The stricter product-readiness audit still reports
`product_ready=false` because that audit requires every H4G record to have:

- textbook unit-level evidence;
- an approved manual review status.

Those requirements are intentionally stronger than this reconstruction pass.
They should remain as the next human review and evidence-hardening layer, not be
faked by changing review statuses.

## 7. Human Spot-Check Priorities

Start with these areas:

- Chinese P1 mappings where broad academic quality descriptions anchor many
  standards.
- Arts groups using academic quality descriptions across four dimensions,
  especially film/digital media and cross-art tasks.
- Information Technology P2 groups, because several have thinner supplemental
  evidence.
- Labor P2 groups, because task-group tags are essential to preserve.
- Science general literacy groups that are now anchored back to core-concept
  content requirements.

## 8. Generated Review Surfaces

Key generated files:

- `generated/h4g_subject_remap_differentiation/overall_review.md`
- `generated/h4g_source_anchor_remap_candidate/source_anchor_remap_candidate_review.md`
- `generated/h4g_source_anchor_remap_candidate/source_anchor_remap_candidate_deep_audit.md`
- `generated/h4g_source_anchor_remap_candidate/source_anchor_remap_public_deep_audit.md`
- `generated/h4g_source_anchor_remap_candidate/source_anchor_remap_publication_receipt.json`
