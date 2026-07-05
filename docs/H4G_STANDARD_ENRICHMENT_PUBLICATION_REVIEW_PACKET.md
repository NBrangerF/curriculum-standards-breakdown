# H4G Standard Enrichment Publication Review Packet

Generated at: 2026-07-05T04:39:27.519Z

Status: review packet only. This packet does not write `public/data`.

## 0. Decision Framing

The publication dry-run candidate is structurally valid, but it should not be treated as automatically approved production data. The next decision is whether to publish all 1170 H4G records, publish a lower-risk subset, or revise candidate wording before any production write gate.

Recommended review order:

1. Review P0 generated sibling and partial source range bridge records first.
2. Spot-check P1 compressed source-original triplets across all subjects.
3. Decide one publication strategy: full release, risk-based release, or candidate revision.
4. Keep `public/data` unchanged until a separate production write gate is explicitly approved.

## 1. Gate Status

| Check | Value |
| --- | --- |
| publication audit valid | true |
| publication apply valid | true |
| enrichment audit valid | true |
| candidate H4G records | 1170 |
| progression groups | 390 |
| non-H4G changed records | 0 |
| writes public data | false |

## 2. Snapshot

| Metric | Value |
| --- | ---: |
| public H4G records | 1081 |
| candidate H4G records | 1170 |
| existing public H4G records replaced | 1081 |
| new H4G sibling records added | 89 |
| progression groups | 390 |
| H4G7 / H4G8 / H4G9 records | 390 / 390 / 390 |
| publication candidate errors | 0 |
| publication candidate warnings | 0 |

## 3. Risk Queue Summary

Risk queues can overlap. For example, the same Arts group can be both generated-sibling and partial-source-range.

| Queue | Records | Groups | Subjects |
| --- | ---: | ---: | --- |
| P0 generated missing sibling | 89 | 62 | arts |
| P0 partial source range bridge | 186 | 62 | arts |
| P1 compressed source-original triplet | 969 | 323 | chinese, english, it, labor, math, morality_law, pe, science |
| P1 low confidence | 0 | 0 |  |
| P2 regular candidate | 15 | 5 | english |

## 4. Subject Summary

| Subject | Candidate H4G | Public H4G | New Siblings | Partial Bridge Records | Groups | P0 Groups | P1 Groups | P2 Groups |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 艺术 | 186 | 97 | 89 | 186 | 62 | 62 | 0 | 0 |
| 语文 | 156 | 156 | 0 | 0 | 52 | 0 | 52 | 0 |
| 英语 | 132 | 132 | 0 | 0 | 44 | 0 | 39 | 5 |
| 信息科技 | 66 | 66 | 0 | 0 | 22 | 0 | 22 | 0 |
| 劳动 | 66 | 66 | 0 | 0 | 22 | 0 | 22 | 0 |
| 数学 | 114 | 114 | 0 | 0 | 38 | 0 | 38 | 0 |
| 道德与法治 | 126 | 126 | 0 | 0 | 42 | 0 | 42 | 0 |
| 体育 | 123 | 123 | 0 | 0 | 41 | 0 | 41 | 0 |
| 科学 | 201 | 201 | 0 | 0 | 67 | 0 | 67 | 0 |

## 5. Review Status Distribution

| Status | Count |
| --- | ---: |
| standard_enrichment_candidate_needs_review | 984 |
| standard_enrichment_partial_source_bridge_needs_review | 186 |

## 6. Standard Enrichment Method Distribution

| Method | Count |
| --- | ---: |
| full_batch_cognitive_complexity_enrichment | 687 |
| full_batch_performance_rubric_enrichment | 189 |
| full_batch_source_range_bridge_enrichment | 186 |
| full_batch_textbook_sequence_enrichment | 108 |

## 7. P0 Generated Sibling Examples

### 艺术 / 音乐 / 创造：主题构思与作品完善

- progression group: `arts-02fc61c4f95c24`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能构思音乐创作主题和内容，运用一定技法完成富有新意的节奏型、简单歌曲或乐曲编创，阐释创作想法和方法，客观评价他人的创作活动，并根据评价建议修改完善作品。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-MU-RW-90029D | 在熟悉作品、材料、动作或技法中，围绕“创造：主题构思与作品完善”感知构思音乐创作主题和内容、一定技法完成富有新意的节奏型、简单歌曲或乐曲编创等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-MU-025 | 在多样作品、主题或表现任务中，围绕“创造：主题构思与作品完善”比较构思音乐创作主题和内容、一定技法完成富有新意的节奏型、简单歌曲或乐曲编创等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-MU-026 | 在综合艺术任务和文化情境中，围绕“创造：主题构思与作品完善”评价构思音乐创作主题和内容、一定技法完成富有新意的节奏型、简单歌曲或乐曲编创等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 学业质量 / 美术第三学段质量

- progression group: `arts-06e85a89294abf`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 第三学段结束时，知道中外著名美术家及代表作，能分析描述作品内容和特点，认识世界美术多样性，创作至少 3 件富有创意的平面、立体和动态美术作品，完成学校或社区环境调研与设计、传统工艺制作和校园微电影，具备综合探索和学习迁移能力。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-QUAL-004 | 在熟悉作品、材料、动作或技法中，围绕“美术第三学段质量”感知第三学段结束时、中外著名美术家及代表作等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-QUAL-RW-CF575B | 在多样作品、主题或表现任务中，围绕“美术第三学段质量”比较第三学段结束时、中外著名美术家及代表作等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-QUAL-RW-B7C41C | 在综合艺术任务和文化情境中，围绕“美术第三学段质量”评价第三学段结束时、中外著名美术家及代表作等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 影视（含数字媒体艺术） / 初试影视技术：欣赏与拍摄

- progression group: `arts-07d35622af8db6`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 在有条件开设影视选项时，能欣赏优秀影视（含数字媒体艺术）作品并辨析其中的技术元素，借助移动终端、数码相机等设备记录生活中的视觉和听觉元素，掌握运动画面拍摄与声音录制的基本技巧。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-FM-001 | 在熟悉作品、材料、动作或技法中，围绕“初试影视技术：欣赏与拍摄”感知欣赏优秀影视作品并辨析其中的技术元素、借助移动终端等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-FM-RW-3BAD24 | 在多样作品、主题或表现任务中，围绕“初试影视技术：欣赏与拍摄”比较欣赏优秀影视作品并辨析其中的技术元素、借助移动终端等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-FM-RW-46DAA6 | 在综合艺术任务和文化情境中，围绕“初试影视技术：欣赏与拍摄”评价欣赏优秀影视作品并辨析其中的技术元素、借助移动终端等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 音乐 / 欣赏：音乐要素与情感理解

- progression group: `arts-13f5aa9e08a793`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能结合对音乐节奏、节拍、旋律及其他表现要素的分析，理解音乐表达的情感内涵，并能根据情感表达或交流需要在生活中选用合适的音乐。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-MU-001 | 在熟悉作品、材料、动作或技法中，围绕“欣赏：音乐要素与情感理解”感知对音乐节奏、节拍、旋律及其他表现要素的分析、音乐表达的情感内涵等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-MU-RW-3E8BCD | 在多样作品、主题或表现任务中，围绕“欣赏：音乐要素与情感理解”比较对音乐节奏、节拍、旋律及其他表现要素的分析、音乐表达的情感内涵等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-MU-RW-C7D7A2 | 在综合艺术任务和文化情境中，围绕“欣赏：音乐要素与情感理解”评价对音乐节奏、节拍、旋律及其他表现要素的分析、音乐表达的情感内涵等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 音乐 / 表现：演奏编创与评价

- progression group: `arts-172e7ef2d40a78`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能根据要求即兴或有计划地用乐器编创和表现短小音乐作品，客观分析、评价自己及他人的演奏，并根据评价反馈提高演奏技巧与表现力；每学年能演奏稍具复杂性的乐曲 1-2 首。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-MU-008 | 在熟悉作品、材料、动作或技法中，围绕“表现：演奏编创与评价”感知要求即兴或有计划地用乐器编创和表现短小音乐作品、客观分析、评价自己及他人的演奏等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-MU-RW-C2562D | 在多样作品、主题或表现任务中，围绕“表现：演奏编创与评价”比较要求即兴或有计划地用乐器编创和表现短小音乐作品、客观分析、评价自己及他人的演奏等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-MU-RW-B20EAC | 在综合艺术任务和文化情境中，围绕“表现：演奏编创与评价”评价要求即兴或有计划地用乐器编创和表现短小音乐作品、客观分析、评价自己及他人的演奏等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 音乐 / 欣赏：音乐表现与文化分析

- progression group: `arts-18d471bc4c318d`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能在听赏中较准确听辨并描述音乐表现要素、表现形式和表现手段的特点与作用，对音乐情绪情感形成个性化理解，综合运用知识分析代表性音乐的体裁、形式、审美特征、风格特点和文化内涵。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-MU-RW-50BA40 | 在熟悉作品、材料、动作或技法中，围绕“欣赏：音乐表现与文化分析”感知在听赏中较准确听辨并描述音乐表现要素、对音乐情绪情感形成个性化理解等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-MU-013 | 在多样作品、主题或表现任务中，围绕“欣赏：音乐表现与文化分析”比较在听赏中较准确听辨并描述音乐表现要素、对音乐情绪情感形成个性化理解等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-MU-014 | 在综合艺术任务和文化情境中，围绕“欣赏：音乐表现与文化分析”评价在听赏中较准确听辨并描述音乐表现要素、对音乐情绪情感形成个性化理解等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 美术 / 欣赏评述：世界美术多样性

- progression group: `arts-19cce2df1fd5e3`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能运用美术语言以及分析、比较等方法欣赏评述外国美术作品，领略世界美术的多样性，了解著名艺术家及代表作、不同时代地区民族和国家的历史文化传统、中国书法篆刻特点，并分享交流自己的看法。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-VA-001 | 在熟悉作品、材料、动作或技法中，围绕“欣赏评述：世界美术多样性”感知美术语言以及分析、比较等方法欣赏评述外国美术作品、领略世界美术的多样性等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-VA-RW-A65D7C | 在多样作品、主题或表现任务中，围绕“欣赏评述：世界美术多样性”比较美术语言以及分析、比较等方法欣赏评述外国美术作品、领略世界美术的多样性等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-VA-RW-C5E8B3 | 在综合艺术任务和文化情境中，围绕“欣赏评述：世界美术多样性”评价美术语言以及分析、比较等方法欣赏评述外国美术作品、领略世界美术的多样性等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 学业质量 / 舞蹈第四学段质量

- progression group: `arts-22f34cc031c7ca`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 第四学段结束时，能展示多舞种舞蹈语汇并与他人合作完成队列变化和造型配合，能用身体语言配合音乐表达情绪情感，能捕捉生活或自然形象进行即兴表现和舞蹈小品创作，理解不同历史时期、地区和民族的舞蹈风格特征与文化内涵，并能欣赏品评舞蹈、阐述观点。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-QUAL-RW-D212C6 | 在熟悉作品、材料、动作或技法中，围绕“舞蹈第四学段质量”感知第四学段结束时、展示多舞种舞蹈语汇并与他人合作完成队列变化和造型等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-QUAL-007 | 在多样作品、主题或表现任务中，围绕“舞蹈第四学段质量”比较第四学段结束时、展示多舞种舞蹈语汇并与他人合作完成队列变化和造型等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-QUAL-008 | 在综合艺术任务和文化情境中，围绕“舞蹈第四学段质量”评价第四学段结束时、展示多舞种舞蹈语汇并与他人合作完成队列变化和造型等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 音乐 / 创造：音乐编创与数字记录

- progression group: `arts-29b789e7dd8c95`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能结合生活情境进行节奏化、韵律化吟唱，按主题和要求即兴编创节奏、旋律短句和和弦，为朗诵、歌（乐）曲、舞蹈配乐或伴奏，并能用简谱、五线谱、图形谱、音视频技术或软件记录作品。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-MU-RW-38C40C | 在熟悉作品、材料、动作或技法中，围绕“创造：音乐编创与数字记录”感知生活情境进行节奏化、韵律化吟唱、按主题和要求即兴编创节奏、旋律短句和和弦等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-MU-023 | 在多样作品、主题或表现任务中，围绕“创造：音乐编创与数字记录”比较生活情境进行节奏化、韵律化吟唱、按主题和要求即兴编创节奏、旋律短句和和弦等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-MU-024 | 在综合艺术任务和文化情境中，围绕“创造：音乐编创与数字记录”评价生活情境进行节奏化、韵律化吟唱、按主题和要求即兴编创节奏、旋律短句和和弦等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 课程目标 / 美术学段目标

- progression group: `arts-2df1f3347a3e97`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能运用造型元素、形式原理和欣赏方法评述世界美术作品，运用传统与现代工具材料创作平面、立体或动态作品，开展环境设计、传统工艺和校园微电影等综合探索。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-GOAL-002 | 在熟悉作品、材料、动作或技法中，围绕“美术学段目标”感知造型元素、形式原理和欣赏方法评述世界美术作品、传统与现代工具材料创作平面、立体或动态作品等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-GOAL-RW-22F129 | 在多样作品、主题或表现任务中，围绕“美术学段目标”比较造型元素、形式原理和欣赏方法评述世界美术作品、传统与现代工具材料创作平面、立体或动态作品等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-GOAL-RW-A69F0B | 在综合艺术任务和文化情境中，围绕“美术学段目标”评价造型元素、形式原理和欣赏方法评述世界美术作品、传统与现代工具材料创作平面、立体或动态作品等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 舞蹈 / 风格舞蹈表演

- progression group: `arts-33d3880a91fed2`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能学习至少两种不同国家和地区、民族或时代舞蹈的基本动律、技术技巧和风格特征，识别并理解舞蹈种类，运用基本动作准确表达不同风格舞蹈的动律与特征，并进行综合表演。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-DA-RW-4F245C | 在熟悉作品、材料、动作或技法中，围绕“风格舞蹈表演”感知至少两种不同国家和地区、识别并理解舞蹈种类等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-DA-005 | 在多样作品、主题或表现任务中，围绕“风格舞蹈表演”比较至少两种不同国家和地区、识别并理解舞蹈种类等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-DA-006 | 在综合艺术任务和文化情境中，围绕“风格舞蹈表演”评价至少两种不同国家和地区、识别并理解舞蹈种类等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 美术 / 设计应用：非遗与文创

- progression group: `arts-369de2a3829318`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能表达对继承与发展文化遗产的认识，运用传统工艺制作方法制作工艺品，借鉴不同地域中华优秀传统文化特色设计文创产品，反思作品并倾听建议加以改进，安全使用工具材料。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-VA-RW-FE377E | 在熟悉作品、材料、动作或技法中，围绕“设计应用：非遗与文创”感知表达对继承与发展文化遗产的认识、传统工艺制作方法制作工艺品等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-VA-012 | 在多样作品、主题或表现任务中，围绕“设计应用：非遗与文创”比较表达对继承与发展文化遗产的认识、传统工艺制作方法制作工艺品等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-VA-013 | 在综合艺术任务和文化情境中，围绕“设计应用：非遗与文创”评价表达对继承与发展文化遗产的认识、传统工艺制作方法制作工艺品等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

## 8. P0 Partial Source Range Bridge Examples

### 艺术 / 音乐 / 创造：主题构思与作品完善

- progression group: `arts-02fc61c4f95c24`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能构思音乐创作主题和内容，运用一定技法完成富有新意的节奏型、简单歌曲或乐曲编创，阐释创作想法和方法，客观评价他人的创作活动，并根据评价建议修改完善作品。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-MU-RW-90029D | 在熟悉作品、材料、动作或技法中，围绕“创造：主题构思与作品完善”感知构思音乐创作主题和内容、一定技法完成富有新意的节奏型、简单歌曲或乐曲编创等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-MU-025 | 在多样作品、主题或表现任务中，围绕“创造：主题构思与作品完善”比较构思音乐创作主题和内容、一定技法完成富有新意的节奏型、简单歌曲或乐曲编创等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-MU-026 | 在综合艺术任务和文化情境中，围绕“创造：主题构思与作品完善”评价构思音乐创作主题和内容、一定技法完成富有新意的节奏型、简单歌曲或乐曲编创等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 学业质量 / 美术第三学段质量

- progression group: `arts-06e85a89294abf`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 第三学段结束时，知道中外著名美术家及代表作，能分析描述作品内容和特点，认识世界美术多样性，创作至少 3 件富有创意的平面、立体和动态美术作品，完成学校或社区环境调研与设计、传统工艺制作和校园微电影，具备综合探索和学习迁移能力。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-QUAL-004 | 在熟悉作品、材料、动作或技法中，围绕“美术第三学段质量”感知第三学段结束时、中外著名美术家及代表作等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-QUAL-RW-CF575B | 在多样作品、主题或表现任务中，围绕“美术第三学段质量”比较第三学段结束时、中外著名美术家及代表作等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-QUAL-RW-B7C41C | 在综合艺术任务和文化情境中，围绕“美术第三学段质量”评价第三学段结束时、中外著名美术家及代表作等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 影视（含数字媒体艺术） / 初试影视技术：欣赏与拍摄

- progression group: `arts-07d35622af8db6`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 在有条件开设影视选项时，能欣赏优秀影视（含数字媒体艺术）作品并辨析其中的技术元素，借助移动终端、数码相机等设备记录生活中的视觉和听觉元素，掌握运动画面拍摄与声音录制的基本技巧。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-FM-001 | 在熟悉作品、材料、动作或技法中，围绕“初试影视技术：欣赏与拍摄”感知欣赏优秀影视作品并辨析其中的技术元素、借助移动终端等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-FM-RW-3BAD24 | 在多样作品、主题或表现任务中，围绕“初试影视技术：欣赏与拍摄”比较欣赏优秀影视作品并辨析其中的技术元素、借助移动终端等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-FM-RW-46DAA6 | 在综合艺术任务和文化情境中，围绕“初试影视技术：欣赏与拍摄”评价欣赏优秀影视作品并辨析其中的技术元素、借助移动终端等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 音乐 / 欣赏：音乐要素与情感理解

- progression group: `arts-13f5aa9e08a793`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能结合对音乐节奏、节拍、旋律及其他表现要素的分析，理解音乐表达的情感内涵，并能根据情感表达或交流需要在生活中选用合适的音乐。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-MU-001 | 在熟悉作品、材料、动作或技法中，围绕“欣赏：音乐要素与情感理解”感知对音乐节奏、节拍、旋律及其他表现要素的分析、音乐表达的情感内涵等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-MU-RW-3E8BCD | 在多样作品、主题或表现任务中，围绕“欣赏：音乐要素与情感理解”比较对音乐节奏、节拍、旋律及其他表现要素的分析、音乐表达的情感内涵等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-MU-RW-C7D7A2 | 在综合艺术任务和文化情境中，围绕“欣赏：音乐要素与情感理解”评价对音乐节奏、节拍、旋律及其他表现要素的分析、音乐表达的情感内涵等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 音乐 / 表现：演奏编创与评价

- progression group: `arts-172e7ef2d40a78`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能根据要求即兴或有计划地用乐器编创和表现短小音乐作品，客观分析、评价自己及他人的演奏，并根据评价反馈提高演奏技巧与表现力；每学年能演奏稍具复杂性的乐曲 1-2 首。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-MU-008 | 在熟悉作品、材料、动作或技法中，围绕“表现：演奏编创与评价”感知要求即兴或有计划地用乐器编创和表现短小音乐作品、客观分析、评价自己及他人的演奏等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-MU-RW-C2562D | 在多样作品、主题或表现任务中，围绕“表现：演奏编创与评价”比较要求即兴或有计划地用乐器编创和表现短小音乐作品、客观分析、评价自己及他人的演奏等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-MU-RW-B20EAC | 在综合艺术任务和文化情境中，围绕“表现：演奏编创与评价”评价要求即兴或有计划地用乐器编创和表现短小音乐作品、客观分析、评价自己及他人的演奏等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 音乐 / 欣赏：音乐表现与文化分析

- progression group: `arts-18d471bc4c318d`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能在听赏中较准确听辨并描述音乐表现要素、表现形式和表现手段的特点与作用，对音乐情绪情感形成个性化理解，综合运用知识分析代表性音乐的体裁、形式、审美特征、风格特点和文化内涵。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-MU-RW-50BA40 | 在熟悉作品、材料、动作或技法中，围绕“欣赏：音乐表现与文化分析”感知在听赏中较准确听辨并描述音乐表现要素、对音乐情绪情感形成个性化理解等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-MU-013 | 在多样作品、主题或表现任务中，围绕“欣赏：音乐表现与文化分析”比较在听赏中较准确听辨并描述音乐表现要素、对音乐情绪情感形成个性化理解等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-MU-014 | 在综合艺术任务和文化情境中，围绕“欣赏：音乐表现与文化分析”评价在听赏中较准确听辨并描述音乐表现要素、对音乐情绪情感形成个性化理解等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 美术 / 欣赏评述：世界美术多样性

- progression group: `arts-19cce2df1fd5e3`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能运用美术语言以及分析、比较等方法欣赏评述外国美术作品，领略世界美术的多样性，了解著名艺术家及代表作、不同时代地区民族和国家的历史文化传统、中国书法篆刻特点，并分享交流自己的看法。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-VA-001 | 在熟悉作品、材料、动作或技法中，围绕“欣赏评述：世界美术多样性”感知美术语言以及分析、比较等方法欣赏评述外国美术作品、领略世界美术的多样性等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-VA-RW-A65D7C | 在多样作品、主题或表现任务中，围绕“欣赏评述：世界美术多样性”比较美术语言以及分析、比较等方法欣赏评述外国美术作品、领略世界美术的多样性等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-VA-RW-C5E8B3 | 在综合艺术任务和文化情境中，围绕“欣赏评述：世界美术多样性”评价美术语言以及分析、比较等方法欣赏评述外国美术作品、领略世界美术的多样性等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 学业质量 / 舞蹈第四学段质量

- progression group: `arts-22f34cc031c7ca`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 第四学段结束时，能展示多舞种舞蹈语汇并与他人合作完成队列变化和造型配合，能用身体语言配合音乐表达情绪情感，能捕捉生活或自然形象进行即兴表现和舞蹈小品创作，理解不同历史时期、地区和民族的舞蹈风格特征与文化内涵，并能欣赏品评舞蹈、阐述观点。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-QUAL-RW-D212C6 | 在熟悉作品、材料、动作或技法中，围绕“舞蹈第四学段质量”感知第四学段结束时、展示多舞种舞蹈语汇并与他人合作完成队列变化和造型等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-QUAL-007 | 在多样作品、主题或表现任务中，围绕“舞蹈第四学段质量”比较第四学段结束时、展示多舞种舞蹈语汇并与他人合作完成队列变化和造型等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-QUAL-008 | 在综合艺术任务和文化情境中，围绕“舞蹈第四学段质量”评价第四学段结束时、展示多舞种舞蹈语汇并与他人合作完成队列变化和造型等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 音乐 / 创造：音乐编创与数字记录

- progression group: `arts-29b789e7dd8c95`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能结合生活情境进行节奏化、韵律化吟唱，按主题和要求即兴编创节奏、旋律短句和和弦，为朗诵、歌（乐）曲、舞蹈配乐或伴奏，并能用简谱、五线谱、图形谱、音视频技术或软件记录作品。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-MU-RW-38C40C | 在熟悉作品、材料、动作或技法中，围绕“创造：音乐编创与数字记录”感知生活情境进行节奏化、韵律化吟唱、按主题和要求即兴编创节奏、旋律短句和和弦等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-MU-023 | 在多样作品、主题或表现任务中，围绕“创造：音乐编创与数字记录”比较生活情境进行节奏化、韵律化吟唱、按主题和要求即兴编创节奏、旋律短句和和弦等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-MU-024 | 在综合艺术任务和文化情境中，围绕“创造：音乐编创与数字记录”评价生活情境进行节奏化、韵律化吟唱、按主题和要求即兴编创节奏、旋律短句和和弦等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 课程目标 / 美术学段目标

- progression group: `arts-2df1f3347a3e97`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能运用造型元素、形式原理和欣赏方法评述世界美术作品，运用传统与现代工具材料创作平面、立体或动态作品，开展环境设计、传统工艺和校园微电影等综合探索。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-GOAL-002 | 在熟悉作品、材料、动作或技法中，围绕“美术学段目标”感知造型元素、形式原理和欣赏方法评述世界美术作品、传统与现代工具材料创作平面、立体或动态作品等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-GOAL-RW-22F129 | 在多样作品、主题或表现任务中，围绕“美术学段目标”比较造型元素、形式原理和欣赏方法评述世界美术作品、传统与现代工具材料创作平面、立体或动态作品等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-GOAL-RW-A69F0B | 在综合艺术任务和文化情境中，围绕“美术学段目标”评价造型元素、形式原理和欣赏方法评述世界美术作品、传统与现代工具材料创作平面、立体或动态作品等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 舞蹈 / 风格舞蹈表演

- progression group: `arts-33d3880a91fed2`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能学习至少两种不同国家和地区、民族或时代舞蹈的基本动律、技术技巧和风格特征，识别并理解舞蹈种类，运用基本动作准确表达不同风格舞蹈的动律与特征，并进行综合表演。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-DA-RW-4F245C | 在熟悉作品、材料、动作或技法中，围绕“风格舞蹈表演”感知至少两种不同国家和地区、识别并理解舞蹈种类等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-DA-005 | 在多样作品、主题或表现任务中，围绕“风格舞蹈表演”比较至少两种不同国家和地区、识别并理解舞蹈种类等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-DA-006 | 在综合艺术任务和文化情境中，围绕“风格舞蹈表演”评价至少两种不同国家和地区、识别并理解舞蹈种类等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 艺术 / 美术 / 设计应用：非遗与文创

- progression group: `arts-369de2a3829318`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能表达对继承与发展文化遗产的认识，运用传统工艺制作方法制作工艺品，借鉴不同地域中华优秀传统文化特色设计文创产品，反思作品并倾听建议加以改进，安全使用工具材料。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-VA-RW-FE377E | 在熟悉作品、材料、动作或技法中，围绕“设计应用：非遗与文创”感知表达对继承与发展文化遗产的认识、传统工艺制作方法制作工艺品等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-VA-012 | 在多样作品、主题或表现任务中，围绕“设计应用：非遗与文创”比较表达对继承与发展文化遗产的认识、传统工艺制作方法制作工艺品等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-VA-013 | 在综合艺术任务和文化情境中，围绕“设计应用：非遗与文创”评价表达对继承与发展文化遗产的认识、传统工艺制作方法制作工艺品等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

## 9. Subject Triplet Samples

### 艺术 / 音乐 / 创造：主题构思与作品完善

- progression group: `arts-02fc61c4f95c24`
- priority: `P0`
- risk reasons: `generated_missing_h4g_sibling`, `partial_source_range_bridge`, `compressed_source_original_triplet`, `low_grade_adaptation_confidence`, `requires_unit_level_evidence_followup`
- source original: 能构思音乐创作主题和内容，运用一定技法完成富有新意的节奏型、简单歌曲或乐曲编创，阐释创作想法和方法，客观评价他人的创作活动，并根据评价建议修改完善作品。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | AR-H4G7-MU-RW-90029D | 在熟悉作品、材料、动作或技法中，围绕“创造：主题构思与作品完善”感知构思音乐创作主题和内容、一定技法完成富有新意的节奏型、简单歌曲或乐曲编创等关键要求，能描述艺术要素并完成有支架的表现、欣赏或创意实践。 |
| H4G8 | AR-H4G8-MU-025 | 在多样作品、主题或表现任务中，围绕“创造：主题构思与作品完善”比较构思音乐创作主题和内容、一定技法完成富有新意的节奏型、简单歌曲或乐曲编创等关键要求，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。 |
| H4G9 | AR-H4G9-MU-026 | 在综合艺术任务和文化情境中，围绕“创造：主题构思与作品完善”评价构思音乐创作主题和内容、一定技法完成富有新意的节奏型、简单歌曲或乐曲编创等关键要求，能阐释意义、迁移技法并优化有观点的创作、展示或评论。 |

### 语文 / 梳理与探究 / 文学活动与热点探究

- progression group: `chinese-05ffafef093f8b`
- priority: `P1`
- risk reasons: `compressed_source_original_triplet`, `requires_unit_level_evidence_followup`
- source original: 能自主组织文学活动，在办刊、演出、讨论等活动中体验合作与成功；关心学校、本地区和国内外大事，就共同关注的热点问题搜集资料、调查访问、相互讨论，并用文字、图表、图画、照片等展示学习成果。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | CN-H4G7-INQ-007 | 在单篇文本、整本书片段或熟悉语文活动中，围绕“文学活动与热点探究”梳理自主组织文学活动、在办刊、演出、讨论等活动中体验合作与成功等关键要求，能提取关键信息、说清基本理解，并完成简短阅读记录或表达。 |
| H4G8 | CN-H4G8-INQ-008 | 在多文本、专题阅读或结构化表达任务中，围绕“文学活动与热点探究”整合自主组织文学活动、在办刊、演出、讨论等活动中体验合作与成功等关键要求，能比较材料、解释依据，并形成有层次的交流或写作成果。 |
| H4G9 | CN-H4G9-INQ-009 | 在综合阅读、真实议题或开放表达任务中，围绕“文学活动与热点探究”评价自主组织文学活动、在办刊、演出、讨论等活动中体验合作与成功等关键要求，能迁移阅读与表达方法，形成有观点、有证据的阐释或作品。 |

### 英语 / 思维品质 / 归纳推断与深层意义

- progression group: `english-08c354d4bfffbc`
- priority: `P1`
- risk reasons: `compressed_source_original_triplet`, `requires_unit_level_evidence_followup`
- source original: 能提取、整理、概括稍长语篇的关键信息、主要内容、思想和观点，判断信息异同和关联，根据语篇推断人物心理、行为动机及信息间简单逻辑关系，并从不同角度解读语篇深层含义。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | ENG-H4G7-THINK-004 | 在熟悉主题、简短语篇或基础交际任务中，围绕“归纳推断与深层意义”理解提取、整理、概括稍长语篇的关键信息、主要内容、判断信息异同和关联等关键要求，能获取主要信息并进行句段表达。 |
| H4G8 | ENG-H4G8-THINK-005 | 在较长语篇、多信息任务或互动交流中，围绕“归纳推断与深层意义”整合提取、整理、概括稍长语篇的关键信息、主要内容、判断信息异同和关联等关键要求，能推断意图、比较观点并组织连贯表达。 |
| H4G9 | ENG-H4G9-THINK-006 | 在多语篇、真实交际或跨文化情境中，围绕“归纳推断与深层意义”评价提取、整理、概括稍长语篇的关键信息、主要内容、判断信息异同和关联等关键要求，能调适策略、论证理解并完成综合表达。 |

### 信息科技 / 学业质量 / 第四学段学业质量

- progression group: `it-0d430957d0f96e`
- priority: `P1`
- risk reasons: `compressed_source_original_triplet`, `requires_unit_level_evidence_followup`
- source original: 能够通过互联网工具或平台进行较精准的信息搜索、沟通交流与协作，贡献有价值的数据和资源，并理解网络数据编码、传输和呈现原理。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | IT-H4G7-QUAL-001 | 在熟悉数字工具、数据或简单问题中，围绕“第四学段学业质量”识别互联网工具或平台进行较精准的信息搜索、贡献有价值的数据和资源等关键要求，能完成基础操作、表达或单步骤设计。 |
| H4G8 | IT-H4G8-QUAL-002 | 在较完整的信息活动或项目中，围绕“第四学段学业质量”整合互联网工具或平台进行较精准的信息搜索、贡献有价值的数据和资源等关键要求，能分解问题、组织数据、设计流程并调试改进。 |
| H4G9 | IT-H4G9-QUAL-003 | 在真实数字化问题或智能系统情境中，围绕“第四学段学业质量”综合运用互联网工具或平台进行较精准的信息搜索、贡献有价值的数据和资源等关键要求，能评价优化方案，并说明安全、伦理或社会责任。 |

### 劳动 / 日常生活劳动 / 烹饪与营养

- progression group: `labor-09fbadbcd162fb`
- priority: `P1`
- risk reasons: `compressed_source_original_triplet`, `requires_unit_level_evidence_followup`
- source original: 根据家庭成员健康状况和饮食特点设计一日三餐食谱，合理搭配营养，独立制作午餐或晚餐中的三至四道菜。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | LA-H4G7-DL-007 | 在家庭、学校或熟悉劳动任务中，围绕“烹饪与营养”理解家庭成员健康状况和饮食特点设计一日三餐食谱、搭配营养等关键要求，能按规范安全操作并完成单项或低复杂度劳动实践。 |
| H4G8 | LA-H4G8-DL-008 | 在综合劳动任务或协作项目中，围绕“烹饪与营养”整合家庭成员健康状况和饮食特点设计一日三餐食谱、搭配营养等关键要求，能设计流程、分工协作、解决过程问题并形成完整成果。 |
| H4G9 | LA-H4G9-DL-009 | 在真实需求、服务或创新项目中，围绕“烹饪与营养”统筹家庭成员健康状况和饮食特点设计一日三餐食谱、搭配营养等关键要求，能优化方案、评价质量并形成可展示、可改进的劳动成果。 |

### 数学 / 数与代数 / 函数概念

- progression group: `math-04e70e6e295f1c`
- priority: `P1`
- risk reasons: `compressed_source_original_triplet`, `requires_unit_level_evidence_followup`
- source original: 探索简单实例中的数量关系和变化规律，了解常量、变量、函数概念和表示法，能举出函数实例，确定简单实际问题中自变量取值范围并求函数值，用适当表示法刻画变量关系，结合图象分析函数关系并初步讨论变量变化情况。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | MA-H4G7-ALG-019 | 在熟悉数学或生活情境中，围绕“函数概念”理解简单实例中的数量关系和变化规律、常量、变量、函数概念和表示法的关键要求，能完成表示、计算、作图或简单应用，并说明基本过程。 |
| H4G8 | MA-H4G8-ALG-020 | 在含有多个条件或关系的数学情境中，围绕“函数概念”联结简单实例中的数量关系和变化规律、常量、变量、函数概念和表示法的关键要求，能选择方法进行多步推理、计算或建模，并解释关键关系。 |
| H4G9 | MA-H4G9-ALG-021 | 在综合或真实问题情境中，围绕“函数概念”迁移运用简单实例中的数量关系和变化规律、常量、变量、函数概念和表示法的关键要求，能建构模型、论证方法、评价结果并反思改进。 |

### 道德与法治 / 法治教育 / 国家安全与国家主权

- progression group: `morality_law-04c5e7ed8a949f`
- priority: `P1`
- risk reasons: `compressed_source_original_triplet`, `requires_unit_level_evidence_followup`
- source original: 认识国家主权的内涵，树立国家利益至上的观念，理解总体国家安全观，知道维护国家安全是每个公民的义务，自觉维护国家安全。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | ML-H4G7-LAW-043 | 在个人成长、校园生活或熟悉社会情境中，围绕“国家安全与国家主权”识别国家主权的内涵、树立国家利益至上的观念等关键要求，能说清基本规则、价值或事实，并作出简单判断。 |
| H4G8 | ML-H4G8-LAW-044 | 在家庭、校园和社会案例中，围绕“国家安全与国家主权”分析国家主权的内涵、树立国家利益至上的观念等关键要求，能解释关系、权利义务或价值冲突，并提出有条理的建议。 |
| H4G9 | ML-H4G9-LAW-045 | 在公共议题、法治案例或国家社会情境中，围绕“国家安全与国家主权”综合运用国家主权的内涵、树立国家利益至上的观念等关键要求，能论证判断、形成行动方案并反思责任。 |

### 体育 / 专项运动技能 / 田径完整动作与运动原理

- progression group: `pe-06fabd9db33e41`
- priority: `P1`
- risk reasons: `compressed_source_original_triplet`, `requires_unit_level_evidence_followup`
- source original: 能掌握所学田径类运动项目的完整动作技术，并在跑、跳、投掷比赛中合理运用，对所学田径类运动项目有整体体验和理解，能解释跑步、跳跃、投掷的运动原理和文化。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | PE-H4G7-SMS-007 | 在基础练习、规则学习或健康情境中，围绕“田径完整动作与运动原理”掌握所学田径类运动项目的完整动作技术、在跑、跳、投掷比赛中合理运用等关键要求，能按规范完成练习、说明安全要求并进行简单应用。 |
| H4G8 | PE-H4G8-SMS-008 | 在组合技能、合作竞赛或健康管理任务中，围绕“田径完整动作与运动原理”整合所学田径类运动项目的完整动作技术、在跑、跳、投掷比赛中合理运用等关键要求，能调整方法、分析表现并完成较复杂练习或计划。 |
| H4G9 | PE-H4G9-SMS-009 | 在专项运动、真实比赛或自主管理情境中，围绕“田径完整动作与运动原理”综合运用所学田径类运动项目的完整动作技术、在跑、跳、投掷比赛中合理运用等关键要求，能评价表现、优化方案并体现责任与合作。 |

### 科学 / 生命系统的构成层次 / 5.6 生态系统由生物与非生物环境共同组成

- progression group: `science-015acdb16d7e4d`
- priority: `P1`
- risk reasons: `compressed_source_original_triplet`, `requires_unit_level_evidence_followup`
- source original: 知道种群、群落、生态系统和生物圈，能举例说明食物链和食物网，描述生态系统组成及功能，列举不同生态系统并运用生态系统概念分析生产生活中的简单问题，关注生物圈保护，体验生命系统的复杂性、开放性和层次性。

| Grade | Code | Candidate Standard |
| --- | --- | --- |
| H4G7 | SC-H4G7-LIFE-016 | 在可观察现象和基础实验任务中，围绕“5.6生态系统由生物与非生物环境共同组成”识别种群、群落、生态系统和生物圈、举例说明食物链和食物网等关键要求，能记录证据、作出基本解释并完成单变量探究。 |
| H4G8 | SC-H4G8-LIFE-017 | 在多因素现象和连续探究任务中，围绕“5.6生态系统由生物与非生物环境共同组成”分析种群、群落、生态系统和生物圈、举例说明食物链和食物网等关键要求，能解释关系、建立初步模型并形成证据说明。 |
| H4G9 | SC-H4G9-LIFE-018 | 在综合科学或真实问题情境中，围绕“5.6生态系统由生物与非生物环境共同组成”迁移种群、群落、生态系统和生物圈、举例说明食物链和食物网等关键要求，能设计方案、评价证据和模型，并提出优化解释。 |

## 10. Review Checklist

- Confirm whether the 89 generated missing H4G sibling records should enter the product data surface.
- Confirm whether Arts partial source range bridge records can safely represent H4G7/H4G8/H4G9 preview standards.
- For P1 compressed source-original triplets, check that the three grade standards differ by task complexity, evidence type, output expectation, or context depth rather than only wording.
- Confirm every reviewed candidate preserves `source_standard_original`, `previous_standard_rewrite`, `supplemental_evidence_ids`, and enrichment lineage.
- Choose publication strategy only after this review: full release, risk-based release, or revise candidate.

## 11. Machine-Readable Surface

Full review queues are available at:

`generated/h4g_standard_enrichment_publication/publication_review_surface.json`
