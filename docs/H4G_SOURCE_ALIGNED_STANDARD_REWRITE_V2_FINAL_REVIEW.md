# H4G Source-Aligned Standard Rewrite V2 Final Review

Generated at: 2026-07-06

## Conclusion

V2 candidate is ready for human review, not public publication.

The main systemic issue from the previous batch has been fixed: H4G7/H4G8/H4G9 standards no longer rely on wrapper templates such as "围绕……关键要求" or "相关材料/任务/问题时". The new candidate keeps the corrected source as authority boundary, uses supporting/previous sources when they provide finer task evidence, and places grade differentiation directly inside the visible standard text.

## Audit Results

| Check | Result |
| --- | ---: |
| H4G records | 1170 |
| progression groups | 390 |
| complete distinct triplets | 390 |
| style wrapper records | 0 |
| mechanical transfer records | 0 |
| forbidden template records | 0 |
| metadata leak records | 0 |
| low source overlap records | 0 |
| sibling replication findings | 0 |
| changed non-H4G records | 0 |
| allowed non-H4 reference repairs | 94 |

The 94 allowed non-H4 repairs are limited to the arts H2/H3 reference grade labels:

- H2: `第二学段（3-4年级）`, `grade_range: 3-4`
- H3: `第三学段（5-6年级）`, `grade_range: 5-6`

## Subject Coverage

| Subject | H4G Records | Groups | Domains |
| --- | ---: | ---: | --- |
| arts | 186 | 62 | 创意实践；艺术表现；审美感知；文化理解 |
| chinese | 156 | 52 | 阅读与鉴赏；表达与交流；梳理与探究；识字与写字 |
| english | 132 | 44 | 文化意识；语言能力；学习能力；思维品质 |
| it | 66 | 22 | 信息意识；计算思维；数字化学习与创新；信息社会责任 |
| labor | 66 | 22 | 日常生活劳动；生产劳动；服务性劳动；公益劳动与志愿服务 |
| math | 114 | 38 | 数与代数；图形与几何；统计与概率；综合与实践 |
| morality_law | 126 | 42 | 生命安全与健康教育；法治教育；中华优秀传统文化教育；革命传统教育；国情教育 |
| pe | 123 | 41 | 运动能力；健康行为；体育品德 |
| science | 201 | 67 | 科学观念；科学思维；探究实践；态度责任 |

Required tags are present for science core concepts, labor task groups, PE content modules, and morality/law learning themes.

## Critique

The candidate is much closer to H1-H3 style because standards now begin with curriculum-source capability language instead of generated scene wrappers. However, H4 standards remain longer than many H1-H3 standards, especially in Chinese, English, arts, PE, and science. This is partly expected because H4 source anchors are broader and often need both source evidence and grade differentiation in one visible standard.

The strongest remaining human-review risk is not structural coverage but phrasing quality:

- Some standards now contain two source clauses plus one grade outcome clause. This is safer than the previous wrapper, but still may read dense.
- Grade outcome clauses are intentionally subject-level, so reviewers should spot-check whether they feel too generic in a specific subdomain.
- `grade_specific_focus` still documents the corrected source boundary even when supporting source supplies the concrete task. This is useful for provenance but may look noisy in UI review.

## Recommended Human Review Focus

1. Review one high-density subject first: Chinese or arts.
2. For each reviewed group, check whether the standard is actually derived from supporting/corrected source text, not from the generated grade outcome clause alone.
3. Confirm whether the final grade outcome clause is helpful or should be shortened for specific subjects.
4. For PE, verify that the three visible domains `运动能力 / 健康行为 / 体育品德` are correct while `content_module_tag` preserves the finer module.
5. For science and labor, verify that core concept/task group tags remain visible in the review surface even when the standard text itself is concise.

## Generated Assets

- Candidate data root: `generated/h4g_source_aligned_standard_rewrite_v2/data_candidate`
- Audit JSON: `generated/h4g_source_aligned_standard_rewrite_v2/source_aligned_standard_rewrite_v2_audit.json`
- Audit summary: `generated/h4g_source_aligned_standard_rewrite_v2/source_aligned_standard_rewrite_v2_audit.md`
- Review packet JSON: `generated/h4g_source_aligned_standard_rewrite_v2/source_aligned_standard_review_packet_v2.json`
- Review packet MD: `generated/h4g_source_aligned_standard_rewrite_v2/source_aligned_standard_review_packet_v2.md`
- Frontend review asset: `public/data/reviews/h4g_source_aligned_standard_review_packet_v2.json`
