# H4G 七八九年级 distinctiveness 修复记录

更新时间：2026-07-02

本文记录 `H4G7`、`H4G8`、`H4G9` 中 standards 几乎完全相同的问题、已完成的系统性修复，以及后续真正做年级进阶拆解的路线。

## 1. 问题定义

上一轮 H4G 拆分解决了结构问题：

- 正式 runtime 不再使用单一 `H4=7-9`。
- 初中记录已进入 `H4G7`、`H4G8`、`H4G9`。
- 前端筛选和对比视图也使用单年级口径。

但它没有解决语义问题：

- 大量 `H4G7/H4G8/H4G9` 记录来自同一条 7-9 共同课标文本。
- `standard`、`context`、`practice`、`teaching_tip`、`assessment_evidence_type` 等核心字段在三年级之间完全相同。
- 当前 ChinaTextbook 证据停留在“年级教材文件级”，还没有做到“标准条目到教材单元/章节/知识点级”的匹配。

因此不能把这些记录解释为“七、八、九年级已经完成真实分化”。它们应被视为“共享源标准在三个年级下的展示占位”，并显式标记为待进一步年级化细分。

## 2. 新增审计

新增命令：

```bash
npm run grade7_9:audit-h4g-distinctiveness -- --strict
```

脚本：

```text
scripts/grade7_9/audit_h4g_distinctiveness.js
```

审计逻辑：

- 按 `progression_group_id` 聚合 H4G records。
- 检查每个组是否同时包含 `H4G7/H4G8/H4G9`。
- 比较核心文本字段：
  - `domain`
  - `subdomain`
  - `standard`
  - `context`
  - `practice`
  - `teaching_tip`
  - `assessment_evidence_type`
- 如果完整三元组核心文本完全一致，但没有标记为共享要求或待细分，则 strict 失败。
- 如果完全一致但已标记为共享要求，则 strict 通过，并把问题作为 warning 留在报告中。

当前 public 数据审计结果要点：

```json
{
  "valid": true,
  "junior_records": 1081,
  "progression_groups": 400,
  "complete_triplets": 323,
  "exact_identical_triplets": 323,
  "unlabeled_identical_triplets": 0,
  "shared_labeled_records": 969,
  "unit_level_evidence_records": 0
}
```

这说明当前数据仍有大量三年级共享文本，但已经不再伪装成已分化标准；所有完整重复三元组都被标记为共享源标准。

## 3. 数据字段修复

H4G records 新增或强化以下字段：

| 字段 | 用途 |
| --- | --- |
| `standard_text_role` | 标明 `standard` 是源课标原文/整理文本，不是新生成的年级化改写。 |
| `source_standard_scope` | 标明来源范围，如 `stage_shared_7_9`。 |
| `standard_variant_type` | 标明是否为 `same_source_shared`、`grade_specific_variant` 或 `single_or_partial_grade_variant`。 |
| `evidence_granularity` | 标明证据粒度，如 `textbook_file_grade_level`、`textbook_unit_level`、`none`。 |
| `textbook_unit_evidence_ids` | 未来单元/章节级教材证据 ID，目前为空数组。 |
| `progression_distinctiveness` | 标明当前组是 `identical_core_fields` 还是 `core_fields_differ`。 |
| `progression_distinctiveness_fields` | 记录发生差异的核心字段。 |
| `requires_unit_level_evidence` | 标明是否仍需教材单元/章节级证据。 |
| `grade_specific_focus` | 年级化学习重点占位；共享文本记录只写“待补充”，不编造内容。 |
| `progression_delta` | 标明当前是否尚未从 7-9 共享源中分化。 |
| `progression_review_note` | 给前端和人工复核看的非课标原文说明。 |

对完整重复三元组，生成器会自动设置：

```json
{
  "source_standard_scope": "stage_shared_7_9",
  "standard_variant_type": "same_source_shared",
  "progression_distinctiveness": "identical_core_fields",
  "review_status": "needs_grade_differentiation",
  "progression_delta": "not_yet_differentiated_from_shared_7_9_source"
}
```

没有教材覆盖的记录继续保留低置信度：

```json
{
  "grade_assignment_type": "auto_judged_low_confidence",
  "review_status": "needs_grade_differentiation_low_confidence"
}
```

## 4. 生成与发布链路

候选生成器已升级：

```text
scripts/grade7_9/build_grade_level_candidate.js
```

它现在会在生成 candidate 时自动：

1. 计算每个 `progression_group_id` 的 H4G 三元组。
2. 判断核心文本是否真正分化。
3. 对共享源标准写入 `same_source_shared` 和 `needs_grade_differentiation`。
4. 对教材证据粒度写入 `evidence_granularity`。
5. 在 summary 中统计共享要求、待细分记录和单元级证据覆盖。

发布前 gate：

```bash
npm run grade7_9:build-grade-level-candidate
node scripts/grade7_9/audit_grade_level_candidate.js --strict
npm run grade7_9:audit-h4g-distinctiveness -- --data-root generated/grade7_9_grade_level_candidate --strict
node scripts/grade7_9/apply_grade_level_candidate.js
node scripts/grade7_9/apply_grade_level_candidate.js --write --confirm-h4g-policy
npm run grade7_9:audit-h4g-distinctiveness -- --strict
```

## 5. 前端展示修复

`StandardCard` 和 `StandardDetailPage` 已显示：

- `低置信度`
- `待年级化细分`
- 年级归属依据
- 共享源标准状态
- 证据粒度
- 是否需要单元级证据

这些内容都在“年级归属依据”区域展示，并明确不属于课程标准原文。

## 6. 后续真正分化路线

当前修复的目标是“停止误导”和“建立质量门槛”，不是一次性完成所有七八九标准的真实分化。

真正分化需要下一阶段数据工程：

1. 建立教材单元/章节级索引。
2. 为每个教材单元提取标题、册次、页码范围、关键词和知识点。
3. 用 `domain/subdomain/standard/context/practice` 与教材单元做可解释匹配。
4. 给每条 standard 写入 `textbook_unit_evidence_ids`、`matched_keywords`、`match_score`、`rationale`。
5. 基于单元证据补充真实的 `grade_specific_focus` 和 `progression_delta`。
6. 当三年级核心解释真正不同后，再把对应记录从 `same_source_shared` 升级为 `grade_specific_variant`。

已落地的下一阶段入口：

```bash
npm run textbooks:unit-index
npm run textbooks:audit-unit-index -- --strict
npm run textbooks:match-units
npm run textbooks:audit-unit-matches -- --strict
```

新增脚本：

```text
scripts/textbooks/build_textbook_unit_index.js
scripts/textbooks/audit_textbook_unit_index.js
scripts/textbooks/match_standards_to_textbook_units.js
scripts/textbooks/audit_textbook_standard_matches.js
docs/TEXTBOOK_UNIT_EVIDENCE_PIPELINE.md
```

当前管线默认不下载 PDF，只从 `china_textbook_index.json` 生成 `volume_seed`。`volume_seed` 只代表“某年级某册教材文件存在”，不能作为标准-单元匹配证据。只有后续通过可选 `--materialize` 或稳定 OCR 缓存得到的 `toc_unit_or_chapter`，才可以进入 H4G 年级分化匹配。

`textbooks:unit-index` 已支持 `--evidence-ids`、`--materialize-timeout-ms`、raw URL fallback、`.part` 断点续传、`--debug-text-dir` 和可选 `--ocr-fallback`，用于精确复现单本教材的 PDF 物化、文本层目录解析和 OCR fallback。当前数学人教版 7/8/9 六册样本已能物化 PDF，并在 OCR fallback 后抽出 118 个真实 `toc_unit_or_chapter`；七下、八下、九下由 Apple Vision OCR 补足目录候选。

当前已验证的无物化样例：

```json
{
  "subject": "math",
  "textbook_files": 51,
  "unit_candidates": 51,
  "real_unit_or_chapter_candidates": 0,
  "volume_seed_candidates": 51
}
```

这进一步确认当前 H4G standards 还不能声称已经真实分化；它们只是有了可重复的下一阶段证据任务入口。

标准-单元匹配入口当前也已落地。数学人教版 7/8/9 小批量真实数据下，114 条 H4G standards 被评估，118 个 `toc_unit_or_chapter` 候选进入匹配，得到 106 个 matches 和 32 个 `eligible_for_h4g_differentiation` 候选。eligible 门槛要求真实单元候选、分数达标，并通过 alignment gate；数学等学科继续要求命中标准 `subdomain` 锚点，这会阻止 `实数` 被 `有理数` 单元误升级、`一次函数` 被 `一元一次方程` 单元误升级。科学编号内容项允许 `strong_field_alignment` 第二通道：medium 以上分数、命中 `standard` 字段、至少两个证据字段参与，并且有 4 个以上汉字的具体科学概念词命中。

写回前候选包入口也已新增：

```bash
npm run textbooks:plan-h4g-unit-worklist -- --strict --require-work-items
npm run textbooks:run-h4g-unit-work-item -- --work-item h4g_unit_work_math_6aec3166
npm run textbooks:h4g-unit-candidates -- --strict --require-candidates
npm run textbooks:audit-h4g-unit-candidates -- --strict --require-candidates
npm run textbooks:audit-h4g-unit-consistency -- --strict --require-candidates
```

新增 worklist gate 会把当前正式 H4G 缺口转成可执行教材批次：全量 1081 条 H4G records、400 个 progression groups 仍需单元证据，正式 `public/data` 中 `textbook_unit_level` 仍为 0。当前教材索引下，数学、科学、英语、体育、艺术具备至少两个完整 7/8/9 教材版本，能进入跨版本候选生成；语文、道德与法治只有一个完整统编版本；信息科技、劳动暂无完整教材版本。以数学/科学试点时，worklist 推荐先跑数学人教版、冀教版、华东师大版，以及科学沪教版、华东师大版、武汉版。

`textbooks:run-h4g-unit-work-item` 会把 worklist 的单个批次串起来执行：教材物化/OCR、真实单元审计、标准匹配、候选包、consistency audit、候选数据根 apply、索引重建和 H4G 审计。它默认只写 `generated/textbook_evidence/h4g_runs/<work_item_id>/`，不写 `public/data`。如果使用 `--publication-gate`，会要求至少两个版本、完整 progression group 覆盖，并阻止非单调页码证据通过发布级检查。

当前数学 OCR 样本可生成 15 条 public standard 对应的单元级证据候选，分布为 H4G7 7 条、H4G8 3 条、H4G9 5 条。候选包只组织 `textbook_unit_evidence_ids`、单元标题、页段、match score、matched fields、alignment 证据和建议更新字段，不写 `public/data`，也不改写课标原文。候选包 Markdown 摘要现在同时作为 review pack，逐条展示官方字段摘录、当前/建议状态、候选单元、页码状态、alignment 类型、命中字段和关键词。候选包 safety audit 会在 apply 前确认官方字段快照、候选安全边界、真实单元证据、alignment 和 proposed update 均符合写回前复核要求；新增 consistency audit 会检查跨版本一致性、progression group 年级覆盖和页码状态，避免把单版本诊断样本误当作发布级分化证据。

候选包 apply 到独立数据根的流程也已落地：

```bash
npm run textbooks:apply-h4g-unit-candidates -- --candidate /tmp/h4g_unit_evidence_candidate_math_ocr2.json --out-data-root /tmp/h4g_unit_evidence_data_candidate_math --strict
```

该步骤会复制 `public/data` 到候选数据根，然后只更新候选命中的 H4G records。当前数学样本 apply 结果为 15 条 applied、0 条 missing、0 条 skipped、32 个单元证据对象，且 `official_standard_text_changed: false`、`writes_public_data: false`。候选根重建索引后，`validate-data-indexes`、`audit-h4g-distinctiveness --strict` 与 `audit-grade-band-policy --data-only --strict` 均通过；审计能识别到 15 条 `unit_level_evidence_records`。

同一数学人教版批次已由 runner 自动复现。`h4g_unit_work_math_6aec3166` 的端到端结果为 valid true、118 个真实单元/章节候选、106 个 matches、32 个 eligible matches、15 条 H4G 单元证据候选、32 个单元证据对象；候选数据根中 `unit_level_evidence_records` 从 0 增加到 15，且年级/学段 policy 仍通过。consistency audit 同时确认：当前 `cross_version_consistency_proven: false`、`complete_progression_groups: false`、`page_range_gate_ready: false`，所以该批次只能作为 review-only 证据推进，不能发布为真正年级化分化。

科学浙教版 7/8/9 六册也完成一轮小样本验证：加入 raw URL fallback 与 `.part` 断点续传后，六册都能进入文本层目录解析，共抽出 175 个真实目录/章节候选、0 个 `volume_seed`，且 175 条都带有目录印刷页 `page_start/page_range`。201 条科学 H4G standards 进入匹配后，得到 77 个 matches、11 个 eligible candidates，并形成 11 条单元级证据候选，分布为 H4G7 2 条、H4G8 4 条、H4G9 5 条；alignment 分布为 `subdomain_anchor` 4 条、`strong_field_alignment` 7 条；页码状态分布为 `toc_page_range_inferred` 10 条、`toc_page_nonmonotonic` 1 条。候选 review pack 已生成 11 条逐条复核明细，候选包审计在 `--require-page-start` 下通过且 errors/warnings 均为 0。新增 consistency audit 对该包给出的结论是：`page_start_gate_ready: true`，但 `page_range_gate_ready: false`、`cross_version_consistency_proven: false`、`complete_progression_groups: false`，因为 11 条候选都来自单一浙教版、1 条页码非单调、且各 progression group 只覆盖一个年级。该结果解决了先前八、九年级科学 PDF `materialize_timeout`、H4G8 被过严 `subdomain` 逐字锚点挡住、以及候选包缺少页码证据的三个阻塞；但这些仍是诊断/复核候选，正式写入前还需要跨版本一致性、人工/规则复核，并对 `toc_page_nonmonotonic` 页段做人工确认。

后续一旦有真实 `toc_unit_or_chapter`，匹配输出必须包含：

- `score`
- `matched_fields`
- `matched_keywords`
- `rationale`
- `eligible_for_h4g_differentiation`

且必须通过：

```bash
npm run textbooks:audit-unit-matches -- --strict --require-matches --require-eligible
```

## 7. 2026-07-02 数学三版本 page-clean 候选进展

本轮继续沿着“先证据、后写入”的路线推进数学。已完成三套完整 7/8/9 数学版本的端到端候选：

| 版本 | 运行目录 | 状态 |
| --- | --- | --- |
| 人教版-人民教育出版社 | `generated/textbook_evidence/h4g_runs/math_renjiao_smoke` | 已生成候选 |
| 冀教版-河北教育出版社 | `generated/textbook_evidence/h4g_runs/math_jijiao_smoke` | 已生成候选 |
| 华东师大版-华东师范大学出版社 | `generated/textbook_evidence/h4g_runs/math_huadong_smoke` | 已生成候选 |

三版本合并时使用发布前页码门：

```bash
npm run textbooks:combine-h4g-unit-candidates -- \
  --candidates generated/textbook_evidence/h4g_runs/math_renjiao_smoke/h4g_unit_evidence_candidate.json,generated/textbook_evidence/h4g_runs/math_jijiao_smoke/h4g_unit_evidence_candidate.json,generated/textbook_evidence/h4g_runs/math_huadong_smoke/h4g_unit_evidence_candidate.json \
  --out generated/textbook_evidence/h4g_runs/math_three_edition_page_clean/h4g_unit_evidence_candidate.json \
  --summary-out generated/textbook_evidence/h4g_runs/math_three_edition_page_clean/h4g_unit_evidence_candidate_summary.md \
  --strict \
  --require-candidates \
  --publication-page-gate
```

合并结果：

```json
{
  "merged_candidates": 24,
  "unit_evidence_objects": 74,
  "by_grade_band": {
    "H4G7": 8,
    "H4G8": 9,
    "H4G9": 7
  },
  "multi_edition_standards": 14,
  "single_edition_standards": 10,
  "excluded_unit_evidence_objects": 33,
  "excluded_by_page_range_status": {
    "toc_page_nonmonotonic": 33
  }
}
```

这说明三版本数学候选已经比两版本候选更稳定：候选 records 从 21 增加到 24，unit evidence 从 56 增加到 74，多版本支撑 standards 从 9 增加到 14；同时所有非单调页码证据都被 page-clean gate 排除。

### 7.1 已通过的门

三版本候选安全审计通过：

```json
{
  "valid": true,
  "candidates": 24,
  "unit_evidence_objects": 74,
  "page_start_records": 74,
  "page_range_records": 74,
  "errors": 0,
  "warnings": 0
}
```

consistency audit 在 review-only 口径下通过：

```json
{
  "valid": true,
  "page_start_gate_ready": true,
  "page_range_gate_ready": true,
  "nonmonotonic_page_records": 0,
  "multi_edition_standards": 14,
  "single_edition_standards": 10,
  "complete_progression_group_candidates": 1,
  "partial_progression_group_candidates": 17
}
```

候选包已应用到独立数据根：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_page_clean/data_candidate
```

并通过：

```bash
node scripts/build-indexes.js --data-root generated/textbook_evidence/h4g_runs/math_three_edition_page_clean/data_candidate
node scripts/validate-data-indexes.js --data-root generated/textbook_evidence/h4g_runs/math_three_edition_page_clean/data_candidate
npm run grade7_9:audit-h4g-distinctiveness -- --data-root generated/textbook_evidence/h4g_runs/math_three_edition_page_clean/data_candidate --strict
npm run grade7_9:audit-grade-band-policy -- --public-data-root generated/textbook_evidence/h4g_runs/math_three_edition_page_clean/data_candidate --data-only --strict
```

候选根仍保持 `1933` 条 standards，数学 `161` 条，说明该流程只添加单元证据候选，没有改写官方课标字段。

### 7.2 仍未通过的发布门

发布级门槛仍未通过：

```json
{
  "valid": false,
  "standards_below_min_editions": 10,
  "progression_groups": 18,
  "complete_progression_group_candidates": 1,
  "partial_progression_group_candidates": 17,
  "progression_groups_below_min_editions": 5,
  "nonmonotonic_page_records": 0
}
```

因此该数学三版本候选仍是 review-only，不应直接写入 `public/data`。主要缺口不是页码质量，而是跨版本一致性和 G7/G8/G9 进阶组完整度。

当前单版本 standards：

| standard_code | grade_band | subdomain | 当前唯一版本 | 单元 |
| --- | --- | --- | --- | --- |
| `MA-H4G7-ALG-007` | H4G7 | 实数 | 人教版-人民教育出版社 | `6.3 实数` |
| `MA-H4G7-ALG-010` | H4G7 | 代数式 | 华东师大版-华东师范大学出版社 | `3.1 列代数式 /` |
| `MA-H4G7-GEO-037` | H4G7 | 图形的位置与坐标 | 人教版-人民教育出版社 | `第七章 平面直角坐标系`、`7.1 平面直角坐标系` |
| `MA-H4G7-GEO-040` | H4G7 | 图形的运动与坐标 | 人教版-人民教育出版社 | `第七章 平面直角坐标系`、`7.1 平面直角坐标系` |
| `MA-H4G8-ALG-029` | H4G8 | 反比例函数 | 华东师大版-华东师范大学出版社 | `17.4 反比例函数 /` |
| `MA-H4G8-GEO-020` | H4G8 | 定义命题定理与证明 | 华东师大版-华东师范大学出版社 | `13.1 命题、定理与证明 /` |
| `MA-H4G8-GEO-023` | H4G8 | 轴对称 | 冀教版-河北教育出版社 | `16.1 轴对称` |
| `MA-H4G8-GEO-038` | H4G8 | 图形的位置与坐标 | 冀教版-河北教育出版社 | `第十九章 平面直角坐标系` |
| `MA-H4G8-GEO-041` | H4G8 | 图形的运动与坐标 | 冀教版-河北教育出版社 | `第十九章 平面直角坐标系` |
| `MA-H4G9-GEO-036` | H4G9 | 投影视图与展开图 | 冀教版-河北教育出版社 | `32.3 直棱柱和圆锥的侧面展开图` |

当前不完整 progression groups：

| progression_group_id | 已覆盖 | 缺失 | standards |
| --- | --- | --- | --- |
| `math-0a46f4ce0f0992` | H4G8 | H4G7, H4G9 | `MA-H4G8-ALG-023` |
| `math-277214238af387` | H4G7, H4G8 | H4G9 | `MA-H4G7-GEO-040`, `MA-H4G8-GEO-041` |
| `math-345c62c4b339ff` | H4G9 | H4G7, H4G8 | `MA-H4G9-ALG-027` |
| `math-4c3aea46890a49` | H4G7 | H4G8, H4G9 | `MA-H4G7-ALG-007` |
| `math-53511c80d61c2f` | H4G8 | H4G7, H4G9 | `MA-H4G8-GEO-023` |
| `math-69f11fc5c4e9d7` | H4G8 | H4G7, H4G9 | `MA-H4G8-GEO-014` |
| `math-78f4d5d99da1f7` | H4G8, H4G9 | H4G7 | `MA-H4G8-ALG-029`, `MA-H4G9-ALG-030` |
| `math-940b98b661e748` | H4G9 | H4G7, H4G8 | `MA-H4G9-GEO-033` |
| `math-9861497a513d68` | H4G9 | H4G7, H4G8 | `MA-H4G9-GEO-036` |
| `math-a150404509d8f2` | H4G7 | H4G8, H4G9 | `MA-H4G7-ALG-016` |
| `math-aaf500e9978601` | H4G7 | H4G8, H4G9 | `MA-H4G7-ALG-004` |
| `math-bfedcd833a8d70` | H4G7 | H4G8, H4G9 | `MA-H4G7-ALG-010` |
| `math-d856f0e4936a67` | H4G9 | H4G7, H4G8 | `MA-H4G9-GEO-018` |
| `math-ebcb1d40147403` | H4G7 | H4G8, H4G9 | `MA-H4G7-GEO-007` |
| `math-f2c7b690c0a85b` | H4G7, H4G8 | H4G9 | `MA-H4G7-GEO-037`, `MA-H4G8-GEO-038` |
| `math-f8d97669301604` | H4G8, H4G9 | H4G7 | `MA-H4G8-GEO-011`, `MA-H4G9-GEO-012` |
| `math-fc9470468452b2` | H4G8 | H4G7, H4G9 | `MA-H4G8-GEO-020` |

### 7.3 下一步修复顺序

1. 先不写 `public/data`，继续把三版本数学候选作为 review pack。
2. 页码非单调问题清零后，优先对单版本 standards 和缺失年级 progression groups 做反向检索：从缺失年级教材目录出发，查是否是匹配锚点过严、目录标题同义词未覆盖，还是该版本教材确实没有对应单元。
3. 对仍只有单版本支撑的 standards 做跨版本补证据，优先补能让完整 progression group 达标的年级。
4. 只有同时满足 `--min-editions-per-standard 2`、`--min-editions-per-progression-group 2`、`--require-complete-progression-groups` 且非单调页码为 0，才允许把对应 records 从 `same_source_shared` 进一步升级为真正的 `grade_specific_variant`。
5. 数学门槛跑通后，再复制同一套 page-clean + publication gate 到科学、英语、体育、艺术等具备多版本教材的学科。

当前数学/科学候选包已经能形成带页码证据的写回前 review pack，但仍不能直接写入 `public/data`：跨版本一致性、完整 progression group、人工/规则复核和正式 apply 流程尚未全部完成。

### 7.4 目录页码解析修复后的数学复跑

对上一轮 33 条 `toc_page_nonmonotonic` 排除证据做质量诊断后，确认主要问题不是教材本身非单调，而是目录 OCR 文本里的页码被错误截断。例如 `1 3 . 1 轴对称 5 8` 原先会把页码解析成 `8`，实际应为印刷页 `58`；`2 2 . 1 二次函数的图象和性质 2 8` 原先会解析成 `8`，实际应为 `28`。本轮修复了 `scripts/textbooks/build_textbook_unit_index.js` 中目录行内页码解析：

- `parsedPrintedPage` 会先移除页码内部空白，再要求 1-3 位数字。
- `parseInlineTocPageTail` 会优先读取主标题后的第一个页码，避免同一行后续 `信息技术应用`、`复习题` 等附属栏目页码覆盖主单元页码。

修复后重新跑数学人教版、冀教版、华东师大版，并生成新的三版本 page-clean 候选：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_page_parse_fix_page_clean/h4g_unit_evidence_candidate.json
```

与上一版 page-clean 候选相比：

| 指标 | 修复前 | 修复后 |
| --- | ---: | ---: |
| input candidates | 51 | 56 |
| input unit evidence objects | 107 | 116 |
| merged candidates | 24 | 26 |
| unit evidence objects | 74 | 85 |
| multi-edition standards | 14 | 15 |
| single-edition standards | 10 | 11 |
| excluded `toc_page_nonmonotonic` evidence | 33 | 31 |

修复后的 page-clean 候选分布为 H4G7 9 条、H4G8 9 条、H4G9 8 条；85 个保留的单元证据全部有 `page_start/page_range`，且 page-clean 候选内 `nonmonotonic_page_records` 为 0。

本轮实质性改进：

- `MA-H4G8-GEO-023`（轴对称）从单版本证据提升为人教版 + 冀教版两版本证据。
- `MA-H4G9-ALG-027` 纳入人教版 `22.2 二次函数与一元二次方程`，该条达到三版本证据。
- 再次验证候选 apply 仍是隔离数据根：26 条 applied、85 个单元证据对象、`official_standard_text_changed: false`、`writes_public_data: false`。
- 候选数据根通过 `build-indexes`、`validate-data-indexes`、`audit-h4g-distinctiveness --strict` 和 `audit-grade-band-policy --data-only --strict`。

但发布级门槛仍未通过：

```json
{
  "valid": false,
  "standards_below_min_editions": 11,
  "progression_groups": 20,
  "complete_progression_group_candidates": 1,
  "partial_progression_group_candidates": 19,
  "progression_groups_below_min_editions": 6,
  "nonmonotonic_page_records": 0
}
```

当前低于两版本门槛的 standards 为：

```text
MA-H4G7-ALG-007
MA-H4G7-ALG-010
MA-H4G7-GEO-037
MA-H4G7-GEO-040
MA-H4G7-QUAL-004
MA-H4G8-ALG-029
MA-H4G8-GEO-020
MA-H4G8-GEO-038
MA-H4G8-GEO-041
MA-H4G9-GEO-027
MA-H4G9-GEO-036
```

其中 `MA-H4G7-QUAL-004` 和 `MA-H4G9-GEO-027` 是页码解析修复后新增召回的单版本候选，说明 parser 修复提升了召回，但也会暴露更多仍需复核的单版本证据。下一轮优先处理剩余 `toc_page_nonmonotonic` 的真实来源：无行内页码的章标题可能被后续 PDF 页脚误识别为目录页码；同时需要清理少量 OCR 噪声标题，并继续对单版本 standards 做缺失版本反向检索。

### 7.5 目录顺序与独立页码绑定修复后的数学复跑

在 `page_parse_fix` 后继续诊断剩余 `toc_page_nonmonotonic`，确认主要问题已转为目录结构解析：部分冀教版目录是双栏/交错 OCR 顺序，源文本顺序会出现多次页码回退；另有少量无行内页码的章标题会误绑定较远的 PDF 页脚或公式数字。本轮继续修复 `scripts/textbooks/build_textbook_unit_index.js`：

- 独立页码行只绑定“紧邻上一条无页码目录候选”，遇到任何非页码行或新 PDF 页即清空 pending，避免章标题抓到后续页脚。
- 当目录源顺序里出现两次及以上页码回退时，按教材印刷页顺序推断页段，用于处理双栏/交错 OCR 目录。
- 独立页码行支持 `-34`、`_63`、`990` 这类 OCR 噪声，其中 `990` 会按前缀噪声恢复为 `90`。
- 无附属栏目标签的紧凑行尾页码优先按整段尾部解析，修复 `纸盒1 4 2` 被误切成 `42` 的问题。

修复后重新跑数学人教版、冀教版、华东师大版，并生成新的三版本候选：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_page_order_fix_page_clean/h4g_unit_evidence_candidate.json
```

与上一轮 `page_parse_fix` 候选相比：

| 指标 | page_parse_fix | page_order_fix |
| --- | ---: | ---: |
| input candidates | 56 | 54 |
| input unit evidence objects | 116 | 91 |
| merged candidates | 26 | 29 |
| unit evidence objects | 85 | 91 |
| multi-edition standards | 15 | 15 |
| single-edition standards | 11 | 14 |
| excluded `toc_page_nonmonotonic` evidence | 31 | 0 |
| complete progression group candidates | 1 | 2 |
| progression groups below min editions | 6 | 4 |

单版本候选包复跑结果：

| 版本 | candidates | unit evidence | H4G7 | H4G8 | H4G9 | nonmonotonic |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 人教版 | 18 | 25 | 7 | 4 | 7 | 0 |
| 冀教版 | 21 | 46 | 6 | 8 | 7 | 0 |
| 华东师大版 | 15 | 20 | 3 | 7 | 5 | 0 |

三版本合并结果为 29 条 standards、91 个单元级证据对象，分布为 H4G7 10 条、H4G8 11 条、H4G9 8 条；91 个证据全部带 `page_start`，页码状态为 `toc_page_range_inferred` 87 条、`toc_page_start_only` 4 条，`toc_page_nonmonotonic` 为 0。候选安全审计和普通 consistency audit 均通过；候选 apply 到隔离数据根后，29 条 records 获得 91 个单元证据对象，且 `official_standard_text_changed: false`、`writes_public_data: false`，隔离数据根通过 `build-indexes`、`validate-data-indexes`、`audit-h4g-distinctiveness --strict` 和 `audit-grade-band-policy --data-only --strict`。

publication gate 仍失败，但失败原因已经收敛到跨版本与完整 progression 覆盖，不再是页码质量：

```json
{
  "valid": false,
  "standards_below_min_editions": 14,
  "progression_groups": 20,
  "complete_progression_group_candidates": 2,
  "partial_progression_group_candidates": 18,
  "progression_groups_below_min_editions": 4,
  "nonmonotonic_page_records": 0
}
```

当前低于两版本门槛的 standards 为：

```text
MA-H4G7-ALG-007
MA-H4G7-ALG-016
MA-H4G7-GEO-010
MA-H4G7-GEO-037
MA-H4G7-GEO-040
MA-H4G7-QUAL-004
MA-H4G8-ALG-008
MA-H4G8-ALG-029
MA-H4G8-GEO-020
MA-H4G8-GEO-026
MA-H4G8-GEO-038
MA-H4G8-GEO-041
MA-H4G9-GEO-027
MA-H4G9-GEO-036
```

因此本轮结论是：数学证据管线的页码层已经足够干净，可以进入下一阶段“缺失年级/缺失版本反向检索”；但这批候选仍不得发布到 `public/data`，也不得把对应 records 标为已经完成真实年级分化。

### 7.6 数学缺口反向检索画像

本轮新增 read-only 反向检索审计：

```bash
npm run textbooks:audit-h4g-reverse-gaps
```

该命令读取数学三版本 `page_order_fix_page_clean` 候选包，以及三套版本各自的标准-单元匹配结果，按“当前候选已经有的版本”和“缺失版本教材中曾经出现过的近邻匹配”反推 publication gate 卡在哪里。当前结果：

```json
{
  "candidate_standards": 29,
  "standards_below_min_editions": 14,
  "progression_groups_with_candidates": 20,
  "complete_progression_groups": 2,
  "partial_progression_groups": 18,
  "progression_groups_below_min_editions": 4,
  "missing_grade_slots": 31,
  "near_miss_actions": {
    "review_alignment_or_alias": 13,
    "recover_page_start": 1,
    "no_match_returned": 11,
    "low_score_or_wrong_grade": 3
  }
}
```

这个画像说明剩余问题不是单一 parser bug，而是四类问题并存：

- `recover_page_start`：有 eligible 匹配，但目录页码缺失。当前最典型的是人教版七下 `MA-H4G7-ALG-016`（不等式与不等式组）；OCR 目录能看到章/节标题，但右侧印刷页码缺失或未被识别。
- `review_alignment_or_alias`：分数达到 eligible 线，但未通过 alignment gate。不能全局放宽，因为已有反例会把 `实数` 误吸到 `数轴`、把不相关单元靠共享词拉高分；这类应逐条确认是否补同义词、子领域锚点或规则例外。
- `no_match_returned`：缺失版本当前 top matches 没有候选，需要扩大检索、检查教材目录是否缺 OCR，或确认该版本教材确实没有对应单元。
- `low_score_or_wrong_grade`：只有低分或疑似错年级/错单元匹配，不应自动升级为证据。

下一步修复顺序应从低风险到高风险推进：先处理 `recover_page_start` 的可见标题缺页码问题；再逐条审核 `review_alignment_or_alias`，只补局部 alias/anchor；最后才扩大检索 `no_match_returned`，避免为了追求覆盖率牺牲证据可靠性。

跨学科优先级建议：

1. 数学、科学：先按 `textbooks:plan-h4g-unit-worklist -- --subjects math,science` 推荐的完整版本批次建立稳定 PDF/OCR 缓存。
2. 英语、体育、艺术：有至少两个完整教材版本，可在数学/科学流程稳定后进入跨版本候选生成。
3. 语文、道德与法治：当前只有一个完整统编版本，适合先做单版本 review pack，但不能单独证明跨版本一致。
4. 信息科技、劳动：当前 ChinaTextbook 覆盖为空，应继续低置信度并寻找补充教材来源。

## 8. 当前边界

当前 public 数据可以支持：

- 按 H4G7/H4G8/H4G9 浏览。
- 明确看到哪些记录只是共享源标准。
- 明确看到哪些记录需要教材单元级证据。
- 避免把 7-9 共同要求误读为官方逐年级标准。

当前 public 数据不能声称：

- 所有 H4G7/H4G8/H4G9 standards 已经真实分化。
- 当前教材证据已经定位到具体单元/章节。
- `grade_specific_focus` 已经是完整年级教学进阶建议。
