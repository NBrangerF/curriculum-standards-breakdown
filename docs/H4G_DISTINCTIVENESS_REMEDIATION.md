# H4G 七八九年级 distinctiveness 修复记录

更新时间：2026-07-03

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
  "unit_level_evidence_records": 45
}
```

这说明当前数据仍有大量三年级共享文本，但已经不再伪装成已改写的官方分化标准；所有完整重复三元组都被标记为共享源标准。45 条数学/科学 records 已拥有 reviewed 单元级证据和年级化学习重点，但全量 H4G 仍为 `differentiation_ready=false`。

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

对 `review_status=unit_evidence_approved` 且具备 `textbook_unit_level` 证据的 records，前端优先展示 `grade_specific_focus`，并不再显示“待年级化细分”徽标；但仍保留共享源标准说明，避免把年级焦点误读为官方课标原文。

## 6. Reviewed Publication Gate

2026-07-03 新增正式 public 写入 gate：

```bash
npm run textbooks:publish-h4g-reviewed-candidate -- \
  --candidate-root generated/textbook_evidence/h4g_runs/math_six_edition_page_clean/data_candidate_codex_reviewed \
  --write \
  --confirm-reviewed-h4g-publication \
  --strict
```

该 gate 的当前写入结果：

```json
{
  "valid": true,
  "applied_records": 45,
  "by_subject": {
    "math": 28,
    "science": 17
  },
  "by_grade_band": {
    "H4G7": 14,
    "H4G8": 16,
    "H4G9": 15
  },
  "official_standard_text_changed": false
}
```

它只允许写入已审核的同年级单元证据字段，包括 `textbook_unit_evidence_ids`、`textbook_unit_evidence`、`evidence_granularity`、`grade_specific_focus` 和 `review_status` 等；`domain`、`subdomain`、`standard`、`context`、`practice`、`teaching_tip`、`assessment_evidence_type` 等官方核心字段必须保持不变。

## 7. 后续真正分化路线

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

新增 worklist gate 会把当前正式 H4G 缺口转成可执行教材批次：全量 1081 条 H4G records、400 个 progression groups 中，已有 45 条 records 进入 `textbook_unit_level`，仍有 1036 条 records 待补单元证据或复核。当前教材索引下，数学、科学、英语、体育、艺术具备至少两个完整 7/8/9 教材版本，能进入跨版本候选生成；语文、道德与法治只有一个完整统编版本；信息科技、劳动暂无完整教材版本。数学已完成六版本 page-clean 发布，科学已完成八版本首批发布；英语和体育已能解析真实目录，但匹配层仍需补充学科主题桥接/alias 模型。

`textbooks:run-h4g-unit-work-item` 会把 worklist 的单个批次串起来执行：教材物化/OCR、真实单元审计、标准匹配、候选包、consistency audit、候选数据根 apply、索引重建和 H4G 审计。它默认只写 `generated/textbook_evidence/h4g_runs/<work_item_id>/`，不写 `public/data`。如果使用 `--publication-gate`，会要求至少两个版本、完整 progression group 覆盖，并阻止非单调页码证据通过发布级检查。

当前数学 OCR 样本可生成 15 条 public standard 对应的单元级证据候选，分布为 H4G7 7 条、H4G8 3 条、H4G9 5 条。候选包只组织 `textbook_unit_evidence_ids`、单元标题、页段、match score、matched fields、alignment 证据和建议更新字段，不写 `public/data`，也不改写课标原文。候选包 Markdown 摘要现在同时作为 review pack，逐条展示官方字段摘录、当前/建议状态、候选单元、页码状态、alignment 类型、命中字段和关键词。候选包 safety audit 会在 apply 前确认官方字段快照、候选安全边界、真实单元证据、alignment 和 proposed update 均符合写回前复核要求；新增 consistency audit 会检查跨版本一致性、progression group 年级覆盖和页码状态，避免把单版本诊断样本误当作发布级分化证据。

候选包 apply 到独立数据根的流程也已落地：

```bash
npm run textbooks:apply-h4g-unit-candidates -- --candidate /tmp/h4g_unit_evidence_candidate_math_ocr2.json --out-data-root /tmp/h4g_unit_evidence_data_candidate_math --strict
```

该步骤会复制 `public/data` 到候选数据根，然后只更新候选命中的 H4G records。当前数学样本 apply 结果为 15 条 applied、0 条 missing、0 条 skipped、32 个单元证据对象，且 `official_standard_text_changed: false`、`writes_public_data: false`。候选根重建索引后，`validate-data-indexes`、`audit-h4g-distinctiveness --strict` 与 `audit-grade-band-policy --data-only --strict` 均通过；审计能识别到 15 条 `unit_level_evidence_records`。

同一数学人教版批次已由 runner 自动复现。`h4g_unit_work_math_6aec3166` 的端到端结果为 valid true、118 个真实单元/章节候选、106 个 matches、32 个 eligible matches、15 条 H4G 单元证据候选、32 个单元证据对象；候选数据根中 `unit_level_evidence_records` 从 0 增加到 15，且年级/学段 policy 仍通过。consistency audit 同时确认：当前 `cross_version_consistency_proven: false`、`complete_progression_groups: false`、`page_range_gate_ready: false`，所以该批次只能作为 review-only 证据推进，不能发布为真正年级化分化。

科学浙教版 7/8/9 六册也完成一轮小样本验证：加入 raw URL fallback 与 `.part` 断点续传后，六册都能进入文本层目录解析，共抽出 175 个真实目录/章节候选、0 个 `volume_seed`，且 175 条都带有目录印刷页 `page_start/page_range`。201 条科学 H4G standards 进入匹配后，得到 77 个 matches、11 个 eligible candidates，并形成 11 条单元级证据候选，分布为 H4G7 2 条、H4G8 4 条、H4G9 5 条；alignment 分布为 `subdomain_anchor` 4 条、`strong_field_alignment` 7 条；页码状态分布为 `toc_page_range_inferred` 10 条、`toc_page_nonmonotonic` 1 条。候选 review pack 已生成 11 条逐条复核明细，候选包审计在 `--require-page-start` 下通过且 errors/warnings 均为 0。新增 consistency audit 对该包给出的结论是：`page_start_gate_ready: true`，但 `page_range_gate_ready: false`、`cross_version_consistency_proven: false`、`complete_progression_groups: false`，因为 11 条候选都来自单一浙教版、1 条页码非单调、且各 progression group 只覆盖一个年级。该结果解决了先前八、九年级科学 PDF `materialize_timeout`、H4G8 被过严 `subdomain` 逐字锚点挡住、以及候选包缺少页码证据的三个阻塞；但这些仍是诊断/复核候选，正式写入前还需要跨版本一致性、人工/规则复核，并对 `toc_page_nonmonotonic` 页段做人工确认。

English/PE 主题桥接也完成 after-P2 页码恢复与全量 source review：先新增 11 条 reviewed `page_start` overrides，使 page-ready decisions 从 254 增至 472；随后对 218 条 H4G7/H4G9 page-ready pending items 执行 conservative source review recommendation，completed decisions 增至 472。最后又补齐剩余 10 个 page recovery units，使 English run-level 真实候选仍为 47 个、page-start candidates 增至 33，PE 真实候选仍为 13 个、page-start candidates 增至 13；515 条 decisions 全部 page-ready。最终 conservative source review 审计在 `--require-complete --require-page-ready-for-approval` 下为 `valid=true`：approved 18、rejected 83、needs_revision 414、pending 0。新的 registry 仍只有 18 条 approved bridges，说明 English/PE 仍是 review-only，不写 `public/data`，也不能标为已完成真实年级分化。414 条 needs_revision 已进一步拆成 remediation packet：English 325 条、PE 89 条，覆盖 155 条 standards 和 70 个 progression groups；progression matrix 又把这些 items 和 18 条 approved bridges 上卷到 70 个 progression groups，审计确认 missing/extra group 均为 0，且 `complete_h4g_triplet_approved_groups=0`。下一步应按 action family 与 resolution track 做更窄 source review，而不是扩大 matcher 阈值。

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

### 7.7 人教七下缺页码补证据

本轮优先处理 `recover_page_start` 的唯一缺口：人教版七年级下册 `ctb_c5fa3c0e2226` 中第九章“不等式与不等式组”。目录 OCR 第 6 页能识别章/节标题，但缺右侧印刷页码；因此上一轮人教版有 4 个 eligible matches 被 `--require-page-start` 排除。

新增受审计的页码补证据文件：

```text
scripts/textbooks/textbook_unit_page_start_overrides.json
```

补证据原则：

- 只补已有 `toc_unit_or_chapter` 候选的 `page_start`，不新增单元。
- 来源必须来自正文 OCR 的标题和页脚，不凭目录上下文猜页码。
- 补证据通过 `page_start_override` 保留 provenance，并继续标记为 `requires_review`。
- 可用 `--no-page-start-overrides` 关闭该机制，做 parser-only 对照。

本次正文 OCR 证据：

| 候选 | PDF 页 | 印刷页 | 证据 |
| --- | ---: | ---: | --- |
| 第九章 不等式与不等式组 | 119 | 113 | PDF 120 同章页脚为 114，故相邻章首页为 113 |
| 9.1 不等式 | 120 | 114 | 同页标题 `9.1 不等式`，页脚 `114 第九章 不等式与不等式组` |
| 9.2 一元一次不等式 | 128 | 122 | 同页标题 `9.2 一元一次不等式`，页脚 `122 第九章 不等式与不等式组` |
| 9.3 一元一次不等式组 | 133 | 127 | 同页标题 `9.3 一元一次不等式组`，页脚 `127` |
| 第十章 数据的收集、整理与描述 | 140 | 134 | PDF 141 的 `10.1` 首页页脚为 135，故相邻章首页为 134 |
| 10.1 统计调查 | 141 | 135 | 同页标题 `10.1 统计调查`，页脚 `135` |

重跑人教版候选后：

```json
{
  "eligible_matches": 41,
  "candidate_standards": 19,
  "page_start_records": 29,
  "page_range_records": 29,
  "page_start_override_candidates": 6
}
```

`MA-H4G7-ALG-016` 现在获得人教版 + 冀教版两版本证据，人教版候选页段为 `9.1 不等式 114-121`、`9.2 一元一次不等式 122-126`、`9.3 一元一次不等式组 127-133` 和章首页 `113`。

三版本 page-clean 合并后的指标：

```json
{
  "merged_candidates": 29,
  "unit_evidence_objects": 95,
  "multi_edition_standards": 16,
  "single_edition_standards": 13,
  "page_start_records": 95,
  "excluded_unit_evidence_objects": 0
}
```

新的反向检索画像：

```json
{
  "standards_below_min_editions": 13,
  "progression_groups_below_min_editions": 3,
  "near_miss_actions": {
    "review_alignment_or_alias": 12,
    "no_match_returned": 11,
    "low_score_or_wrong_grade": 3
  }
}
```

这说明 `recover_page_start` 已清零；剩余问题已经转为 alignment、无候选和低分/疑似错年级，不应再通过页码 parser 修复来解决。publication gate 仍失败，因为还有 13 条 standards 低于两版本门槛、18 个 progression groups 仍不完整，所以仍不得写入 `public/data`。

### 7.8 标准级 alignment alias 修复

本轮处理 `review_alignment_or_alias` 时没有放宽全局 alignment gate，而是新增标准级、已复核 alias 文件：

```text
scripts/textbooks/textbook_unit_alignment_aliases.json
```

规则边界：

- alias 必须绑定具体 `standard_code`，可选限制学科、年级、版本和单元标题。
- 匹配结果保留 `alias_alignment`，候选包保留命中词、来源、复核状态和 rationale。
- `eligible_alignment` 新增 `reviewed_alias_anchor`，但只在达到原有分数门槛且命中复核词时生效。
- 不把局部 alias 扩散成全局同义词；例如不允许把 `实数` 全局映射到 `数轴/有理数`，也不允许把宽泛 `函数` 映射到 `反比例函数`。

本轮采纳的 alias：

| standard | 复核词 | 作用 |
| --- | --- | --- |
| `MA-H4G8-ALG-008` | `二次根式` | 补足 H4G8 实数标准在人教、冀教中的直接单元证据；华东原本已有 `11.2 实数`。 |
| `MA-H4G8-GEO-020` | `反证法` | 补足“定义、命题、定理与证明”标准在冀教 `17.5 反证法` 的窄范围证明方法证据。 |
| `MA-H4G9-GEO-036` | `投影与视图`、`投影`、`三视图` | 补足九年级“投影、视图、展开图”在人教 `29.1 投影`、`29.2 三视图` 和冀教 `32.1 投影` 的证据。 |

同时补充人教九下 `ctb_286bc7db0209` 第二十九章正文 OCR 页码证据：

| 候选 | PDF 页 | 印刷页 | 页段结果 |
| --- | ---: | ---: | --- |
| 第二十九章 投影与视图 | 92 | 86 | `86` |
| 29.1 投影 | 93 | 87 | `87-93` |
| 29.2 三视图 | 100 | 94 | `94-104` |
| 29.3 课题学习 | 111 | 105 | `105` |

三版本合并后的新候选包：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate.json
```

关键指标：

```json
{
  "merged_candidates": 29,
  "unit_evidence_objects": 101,
  "multi_edition_standards": 19,
  "single_edition_standards": 10,
  "page_start_records": 101,
  "by_eligible_alignment": {
    "subdomain_anchor": 95,
    "reviewed_alias_anchor": 6
  }
}
```

新的反向检索画像：

```json
{
  "standards_below_min_editions": 10,
  "progression_groups_below_min_editions": 1,
  "near_miss_actions": {
    "review_alignment_or_alias": 8,
    "no_match_returned": 9,
    "low_score_or_wrong_grade": 3
  }
}
```

这一步把低于两版本门槛的 standards 从 13 降到 10，把低于两版本门槛的 progression groups 从 3 降到 1。publication gate 仍不得放行，因为仍有 10 条 standards 只有单版本证据，18 个 progression groups 仍不完整；下一阶段应优先处理 `no_match_returned` 和剩余 `review_alignment_or_alias` 中可安全复核的具体单元。

### 7.9 跨版本年级投放矩阵

继续检查剩余 10 条单版本 standards 后，发现多数缺口不是 parser、页码或 alias 问题，而是不同教材版本把同一主题安排在不同年级。为避免把错年级教材单元硬塞进某条 standard，新增只读诊断脚本：

```bash
npm run textbooks:audit-h4g-topic-placement -- --strict --require-hits
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_topic_placement_matrix.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_topic_placement_matrix.md
```

该脚本读取三版本单元索引、最新 reverse gap 报告和标准级 alias 文件，按 standard / progression group / 教材版本 / 年级列出主题单元位置。它只做诊断，不写 `public/data`，也不会把 cross-grade hit 当作 same-grade evidence。

收紧主题词后，本轮矩阵结果：

```json
{
  "standards_evaluated": 114,
  "unit_candidates_scanned": 426,
  "standards_with_topic_hits": 63,
  "standards_with_same_grade_hits": 41,
  "standards_with_cross_grade_hits": 55,
  "standards_with_cross_grade_only_hits": 22,
  "standards_in_reverse_gap_report": 10,
  "reverse_gap_standards_with_cross_grade_missing_edition_hits": 9,
  "by_missing_edition_action_hint": {
    "review_cross_grade_placement": 9,
    "continue_existing_gap_action": 1
  }
}
```

典型结论：

| progression group / standard | 当前现象 | 含义 |
| --- | --- | --- |
| `math-f8d97669301604` / 三角形 | 冀教在七年级，人教和华东主要在八年级 | `MA-H4G7-GEO-010` 缺人教/华东不是无教材主题，而是年级投放不同。 |
| `math-f2c7b690c0a85b` / 图形的位置与坐标 | 人教七年级、冀教八年级、华东九年级 | 同一主题跨版本分散到 7/8/9，不能用单一 `min-editions-per-standard=2` 简单解释。 |
| `math-78f4d5d99da1f7` / 反比例函数 | 华东八年级，人教/冀教九年级 | `MA-H4G8-ALG-029` 的缺失版本不应通过 `函数` 这种宽泛 alias 修复。 |
| `math-76edb58e7a55e4` / 旋转与中心对称 | 人教九年级，冀教七/八年级 | 需讨论 progression model 是否允许“版本内年级投放”作为独立证据层。 |

因此下一步不应继续扩大 alias 表来追求指标，而应先决定 publication gate 如何表达两类不同事实：

1. same-grade unit evidence：某条 H4G7/H4G8/H4G9 standard 在同年级教材单元中被至少两个版本支持。
2. edition placement evidence：同一 progression topic 在不同教材版本中存在年级投放差异，可解释为什么同一 standard 低于两版本门槛，但不能直接证明该年级标准完成分化。

### 7.10 年级投放差异候选包

为把上一步矩阵转成可复核材料，新增 progression group 级候选包：

```bash
npm run textbooks:h4g-placement-candidates -- --strict --require-candidates
npm run textbooks:audit-h4g-placement-candidates -- --strict --require-candidates --require-cross-grade-evidence
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_placement_evidence_candidate.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_placement_evidence_candidate.md
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_placement_evidence_candidate_audit.json
```

当前候选包结果：

```json
{
  "candidate_progression_groups": 6,
  "review_standards": 9,
  "same_grade_unit_evidence": 27,
  "cross_grade_unit_evidence": 44,
  "by_grade_band": {
    "H4G7": 6,
    "H4G8": 6,
    "H4G9": 6
  }
}
```

候选包覆盖的 6 个 progression groups：

| progression_group_id | 主题 | 需要 review 的 standards |
| --- | --- | --- |
| `math-277214238af387` | 图形的运动与坐标 | `MA-H4G7-GEO-040`, `MA-H4G8-GEO-041` |
| `math-4c3aea46890a49` | 实数 | `MA-H4G7-ALG-007` |
| `math-76edb58e7a55e4` | 旋转与中心对称 | `MA-H4G8-GEO-026`, `MA-H4G9-GEO-027` |
| `math-78f4d5d99da1f7` | 反比例函数 | `MA-H4G8-ALG-029` |
| `math-f2c7b690c0a85b` | 图形的位置与坐标 | `MA-H4G7-GEO-037`, `MA-H4G8-GEO-038` |
| `math-f8d97669301604` | 三角形 | `MA-H4G7-GEO-010` |

这一步的结论是：H4G7/H4G8/H4G9 “看起来仍不够分化”的原因，已经有一大块从“我们没有找到证据”变成了“教材版本之间本来就把同一主题放在不同年级”。因此修复方向不能只是继续补 alias 或降低匹配门槛，而应把 publication gate 拆成两层：

1. `same-grade unit evidence`：仍用于证明某条具体年级 standard 有同年级教材单元支撑。
2. `edition placement evidence`：用于说明不同版本教材的年级投放差异，支持 progression model 决策或人工 review note。

placement 候选包仍不允许写入 `public/data`，也不允许写入 `textbook_unit_evidence_ids`。审计会强制 `writes_public_data=false`、`writes_textbook_unit_evidence_ids=false`、`cross_grade_evidence_is_diagnostic_only=true`，并禁止出现 `proposed_update`。也就是说，它解决的是“如何解释和决策”，不是“直接发布分化结果”。

### 7.11 Progression 发布前决策矩阵

为了避免 same-grade evidence、reverse gap 和 edition placement evidence 分散在三份报告中难以决策，本轮新增合并矩阵：

```bash
npm run textbooks:h4g-progression-decisions -- --strict --max-unresolved-gaps 1
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_decision_matrix.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_decision_matrix.md
```

当前数学结果：

```json
{
  "standards_in_subject": 114,
  "progression_groups_in_subject": 38,
  "same_grade_unit_candidate_standards": 29,
  "same_grade_unit_candidate_ready": 19,
  "edition_placement_review_standards": 9,
  "unresolved_gap_standards": 1,
  "not_in_current_unit_candidate_scope": 85,
  "by_standard_decision": {
    "same_grade_unit_candidate_ready": 19,
    "edition_placement_review": 9,
    "continue_gap_remediation": 1,
    "not_in_current_unit_candidate_scope": 85
  }
}
```

这一步把前几轮的发现转成可执行分流：

| 决策类别 | 数量 | 含义 |
| --- | ---: | --- |
| `same_grade_unit_candidate_ready` | 19 | 已有同年级、多版本、页码可用的单元证据候选；可以进入人工发布复核，但仍不能自动发布。 |
| `edition_placement_review` | 9 | 当前同年级版本数不足，但缺失版本存在 cross-grade topic；应讨论 progression model 或版本投放说明，而不是继续放宽 alias。 |
| `continue_gap_remediation` | 1 | 仍需继续做同年级缺口修复。当前唯一项是 `MA-H4G7-QUAL-004`。 |
| `not_in_current_unit_candidate_scope` | 85 | 当前数学三版本候选包尚未覆盖，不应被解读为已分化或已发布。 |

当前唯一未被 placement 解释的缺口：

| standard | grade | subdomain | 当前同年级版本 | reverse gap actions |
| --- | --- | --- | ---: | --- |
| `MA-H4G7-QUAL-004` | H4G7 | 图形与几何综合表现 | 1 | `low_score_or_wrong_grade:1`; `no_match_returned:1` |

因此下一步数学不应继续追求“把 29 条全部硬推成同年级多版本”，而应分别处理：

1. 对 19 条 `same_grade_unit_candidate_ready` 做人工/规则复核，确认是否可以进入候选数据根 apply。
2. 对 9 条 `edition_placement_review` 设计新的 publication 表达：例如版本投放差异 note、progression group 层证据，或单独的 `edition_placement_evidence` 字段；不能写入同年级 `textbook_unit_evidence_ids`。
3. 对 `MA-H4G7-QUAL-004` 继续做定向 reverse lookup，不用宽泛 alias 兜底。

### 7.12 Ready-only 候选包与隔离数据根验证

本轮把 19 条 `same_grade_unit_candidate_ready` 从 29 条数学候选中单独过滤出来，形成 ready-only 写回前候选包：

```bash
npm run textbooks:h4g-ready-unit-candidates -- --strict --require-candidates
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate_ready_only.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate_ready_only.md
```

过滤结果：

```json
{
  "candidates": 19,
  "unit_evidence_objects": 87,
  "by_grade_band": {
    "H4G7": 5,
    "H4G8": 7,
    "H4G9": 7
  },
  "multi_edition_standards": 19,
  "single_edition_standards": 0,
  "page_start_records": 87,
  "excluded_by_decision": {
    "edition_placement_review": 9,
    "continue_gap_remediation": 1
  }
}
```

ready-only 候选包通过：

```bash
npm run textbooks:audit-h4g-unit-candidates -- \
  --candidate generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate_ready_only.json \
  --strict \
  --require-candidates \
  --require-page-start
npm run textbooks:audit-h4g-unit-consistency -- \
  --candidate generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate_ready_only.json \
  --strict \
  --require-candidates \
  --require-page-start \
  --fail-on-nonmonotonic-pages \
  --min-editions-per-standard 2 \
  --min-editions-per-progression-group 2
```

consistency 结果显示：

```json
{
  "cross_version_consistency_proven": true,
  "page_start_gate_ready": true,
  "page_range_gate_ready": true,
  "standards_below_min_editions": 0,
  "progression_groups_below_min_editions": 0,
  "complete_progression_groups": false
}
```

这说明 19 条 ready-only standards 在 record-level 上已经具备同年级、多版本、页码可用的候选证据；但 progression group 完整度仍未全部满足，所以它们只能进入人工发布复核，不能被解释为整组 H4G progression 已正式完成。

ready-only 候选包已应用到隔离数据根：

```bash
npm run textbooks:apply-h4g-unit-candidates -- \
  --candidate generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate_ready_only.json \
  --out-data-root generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_ready_only \
  --strict
node scripts/build-indexes.js --data-root generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_ready_only
node scripts/validate-data-indexes.js --data-root generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_ready_only
npm run grade7_9:audit-h4g-distinctiveness -- \
  --data-root generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_ready_only \
  --strict
npm run grade7_9:audit-grade-band-policy -- \
  --public-data-root generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_ready_only \
  --staging-root generated/grade7_9_all_curated \
  --data-only \
  --strict
```

隔离 apply 结果为 19 条 applied、0 条 missing、0 条 skipped、87 个单元证据对象，且 `official_standard_text_changed: false`、`writes_public_data: false`。候选根中 `unit_level_evidence_records` 从 0 增加到 19，索引校验、H4G distinctiveness strict audit 和 grade-band policy data-only strict audit 均通过。

### 7.13 Progression review worklist

ready-only 候选包排除了 10 条还不能进入同年级单元证据写回复核的 standards。本轮把这些 blocked standards 固化为 progression review worklist：

```bash
npm run textbooks:h4g-progression-review-worklist -- --strict --require-work-items
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_review_worklist.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_review_worklist.md
```

生成结果：

```json
{
  "work_items": 7,
  "affected_standards": 10,
  "edition_placement_work_items": 6,
  "same_grade_gap_work_items": 1,
  "edition_placement_review_standards": 9,
  "same_grade_gap_standards": 1,
  "cross_grade_unit_evidence": 44,
  "same_grade_unit_evidence": 27,
  "by_grade_band": {
    "H4G7": 5,
    "H4G8": 4,
    "H4G9": 1
  }
}
```

`same_grade_gap_remediation` 现在会给出机器可复核的 `remediation_analysis`。当前唯一缺口 `MA-H4G7-QUAL-004` 的结论为：

```json
{
  "decision": "keep_blocked_no_safe_same_grade_remediation",
  "current_same_grade_edition_count": 1,
  "max_missing_top_match_score": 0.3978,
  "eligible_missing_matches": 0,
  "low_score_or_noise_matches": 3,
  "safe_to_add_reviewed_alias": false,
  "rerun_matching_recommended": false,
  "no_match_returned_editions": [
    "华东师大版-华东师范大学出版社"
  ],
  "low_score_or_wrong_grade_editions": [
    "冀教版-河北教育出版社"
  ],
  "reason_codes": [
    "broad_quality_or_comprehensive_performance_standard",
    "current_same_grade_evidence_below_publication_gate",
    "missing_edition_has_no_returned_match",
    "missing_edition_only_has_low_score_or_wrong_grade_matches",
    "some_near_matches_lack_page_evidence",
    "subdomain_anchor_is_too_generic_at_low_score"
  ]
}
```

这意味着 `MA-H4G7-QUAL-004` 不能通过放宽 alias 修复：它属于 `学业质量/综合表现` 宽口径标准，当前只有人教版同年级单元候选；冀教版候选是低分或错向匹配，华东师大版无候选。该记录应保持 blocked，不进入 ready-only，也不写 `textbook_unit_evidence_ids`。

worklist 覆盖的 6 个跨版本投放复核主题：

| progression group | topic | affected standards |
| --- | --- | --- |
| `math-277214238af387` | 图形的运动与坐标 | `MA-H4G7-GEO-040`, `MA-H4G8-GEO-041` |
| `math-4c3aea46890a49` | 实数 | `MA-H4G7-ALG-007` |
| `math-76edb58e7a55e4` | 旋转与中心对称 | `MA-H4G8-GEO-026`, `MA-H4G9-GEO-027` |
| `math-78f4d5d99da1f7` | 反比例函数 | `MA-H4G8-ALG-029` |
| `math-f2c7b690c0a85b` | 图形的位置与坐标 | `MA-H4G7-GEO-037`, `MA-H4G8-GEO-038` |
| `math-f8d97669301604` | 三角形 | `MA-H4G7-GEO-010` |

唯一同年级缺口补救项：

| progression group | topic | affected standard | reverse gap actions |
| --- | --- | --- | --- |
| `math-cb764ede689779` | 图形与几何综合表现 | `MA-H4G7-QUAL-004` | `low_score_or_wrong_grade:1`, `no_match_returned:1` |

这一步不是新的发布候选。它的作用是防止把 blocked standards 混入 ready-only，同时明确下一步策略：`edition_placement_model_review` 要讨论版本投放差异如何进入 progression model；`same_grade_gap_remediation` 才继续做同年级证据修复。worklist 的 policy 明确 `writes_public_data=false`、`writes_textbook_unit_evidence_ids=false`、`publication_candidate=false`，cross-grade units 只能作为诊断材料。

跨学科优先级建议：

1. 数学、科学：先按 `textbooks:plan-h4g-unit-worklist -- --subjects math,science` 推荐的完整版本批次建立稳定 PDF/OCR 缓存。
2. 英语、体育、艺术：有至少两个完整教材版本，可在数学/科学流程稳定后进入跨版本候选生成。
3. 语文、道德与法治：当前只有一个完整统编版本，适合先做单版本 review pack，但不能单独证明跨版本一致。
4. 信息科技、劳动：当前 ChinaTextbook 覆盖为空，应继续低置信度并寻找补充教材来源。

### 7.14 版本投放模型候选

worklist 把 6 个跨版本投放主题标为 `edition_placement_model_review` 后，本轮继续新增只读模型候选 gate：

```bash
npm run textbooks:h4g-edition-placement-model -- --strict --require-candidates
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_edition_placement_model_candidate.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_edition_placement_model_candidate.md
```

当前结果：

```json
{
  "candidates": 6,
  "affected_standards": 9,
  "candidate_for_edition_placement_note": 5,
  "partial_edition_placement_evidence_needs_more_review": 1,
  "cross_grade_diagnostic_relations": 19,
  "by_confidence": {
    "high": 5,
    "medium": 1
  }
}
```

这一步进一步区分了两类 `edition_placement_model_review`：

| model decision | 数量 | 含义 |
| --- | ---: | --- |
| `candidate_for_edition_placement_note` | 5 | 缺失的同年级版本在其他年级存在同主题教材单元，可进入 progression group 级“版本投放差异说明”复核。 |
| `partial_edition_placement_evidence_needs_more_review` | 1 | 仍有 missing edition 没有 cross-grade topic 解释，不能先写投放说明。 |

5 个可进入版本投放说明复核的主题：

| progression group | 主题 | 受影响 standards |
| --- | --- | --- |
| `math-277214238af387` | 图形的运动与坐标 | `MA-H4G7-GEO-040`, `MA-H4G8-GEO-041` |
| `math-4c3aea46890a49` | 实数 | `MA-H4G7-ALG-007` |
| `math-78f4d5d99da1f7` | 反比例函数 | `MA-H4G8-ALG-029` |
| `math-f2c7b690c0a85b` | 图形的位置与坐标 | `MA-H4G7-GEO-037`, `MA-H4G8-GEO-038` |
| `math-f8d97669301604` | 三角形 | `MA-H4G7-GEO-010` |

仍需继续 review 的主题：

| progression group | 主题 | 阻塞点 |
| --- | --- | --- |
| `math-76edb58e7a55e4` | 旋转与中心对称 | `MA-H4G8-GEO-026`、`MA-H4G9-GEO-027` 的华东师大版 missing edition 仍没有 cross-grade topic 覆盖。 |

这个 gate 的安全边界比 placement candidate 更明确：它只产出 `progression_group_edition_placement_diagnostic`，建议的 publication surface 也只是 `progression_group_edition_placement_note`。即使 decision 是 `candidate_for_edition_placement_note`，也仍然需要课程进阶复核；它不写 `public/data`，不生成 `proposed_update`，不把 cross-grade units 写入 same-grade `textbook_unit_evidence_ids`，也不把任何 record 自动升级为 `grade_specific_variant`。

### 7.15 发布前复核包

为了把前面几层结果转成可执行的复核入口，本轮新增只读 publication review packet：

```bash
npm run textbooks:h4g-publication-review -- --strict --require-ready --require-edition-notes
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_review_packet.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_review_packet.md
```

当前结果：

```json
{
  "ready_same_grade_standard_reviews": 19,
  "ready_unit_evidence_objects": 87,
  "edition_placement_note_reviews": 5,
  "edition_placement_note_affected_standards": 7,
  "blocked_reviews": 2,
  "blocked_affected_standards": 3,
  "not_in_current_unit_candidate_scope": 85
}
```

三层含义：

| publication layer | 数量 | 含义 |
| --- | ---: | --- |
| `same_grade_unit_evidence_review` | 19 | 同年级、多版本、页码可用的 standards，可进入人工复核；未来 surface 才可能是 `standard.textbook_unit_evidence_ids`。 |
| `progression_group_edition_placement_note_review` | 5 | 跨版本投放差异已完整解释的 progression groups，可进入课程进阶复核；未来 surface 才可能是 `progression_group_edition_placement_note`。 |
| `blocked_or_partial_review` | 2 | 仍未满足发布前条件的 partial/缺口项，继续 blocked。 |

blocked reviews 当前包括：

| progression group | 类型 | 影响 |
| --- | --- | --- |
| `math-76edb58e7a55e4` | `blocked_partial_edition_placement_review` | “旋转与中心对称”仍缺华东师大版 cross-grade topic 解释，影响 `MA-H4G8-GEO-026`、`MA-H4G9-GEO-027`。 |
| `math-cb764ede689779` | `blocked_same_grade_gap_remediation` | `MA-H4G7-QUAL-004` 仍是宽口径学业质量/综合表现标准，不能用低分或泛词候选补证据。 |

这个包的实质价值是把“下一步怎么发布”拆清楚：同年级单元证据、版本投放说明、阻塞项互斥，不再把 cross-grade units 写进 same-grade standard，也不再让 blocked standards 混入 ready-only apply。它仍然不是 `public/data` 写入，也不改任何课标原文字段。当前 85 条数学 H4G standards 仍不在三版本单元候选范围内，所以数学整体 H4G 分化仍未完成。

### 7.16 发布数据契约候选

在复核包之后，本轮继续新增数据契约候选 gate：

```bash
npm run textbooks:h4g-publication-contract -- --strict --require-ready-surface --require-edition-note-surface
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_contract_candidate.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_contract_candidate.md
```

当前结果：

```json
{
  "standard_unit_evidence_contracts": 19,
  "edition_placement_note_contracts": 5,
  "blocked_registry_contracts": 2,
  "candidate_unit_evidence_objects": 87,
  "edition_note_affected_standards": 7,
  "blocked_affected_standards": 3,
  "not_in_current_unit_candidate_scope": 85
}
```

这个 contract candidate 把未来可能发布的 surface 明确为三类：

| surface | grain | 用途 | 边界 |
| --- | --- | --- | --- |
| `standard_same_grade_unit_evidence` | `standard_code` | 未来通过人工复核后，允许同年级单元证据写入标准记录的证据字段。 | 只能写 `textbook_evidence_ids`、`textbook_unit_evidence_ids`、`textbook_unit_evidence`、progression/review 等证据字段；不能改 `domain/subdomain/standard/context/practice/teaching_tip/assessment_evidence_type`，也不能自动改成 `grade_specific_variant`。 |
| `progression_group_edition_placement_note` | `progression_group_id` | 未来通过课程进阶复核后，表达不同教材版本把同一主题放到不同年级。 | 应作为 progression group 层 note，不写入 same-grade `textbook_unit_evidence_ids`。 |
| `blocked_review_registry` | `review_id` | 保留 partial/blocked 项，等待补证据或模型复核。 | 没有 public surface，不能发布。 |

这一步是数据契约设计，不是迁移：policy 仍是 `writes_public_data=false`、`writes_standard_records=false`、`writes_textbook_unit_evidence_ids=false`。它把“可以怎么写”和“绝对不能怎么写”固化下来，为后续真正 public migration 做准备。

### 7.17 发布契约候选数据根 dry-run

在 contract candidate 之后，本轮新增一个隔离 apply gate：

```bash
npm run textbooks:apply-h4g-publication-contract -- --strict
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_publication_contract/
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_publication_contract/h4g_progression_notes.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_publication_contract/h4g_publication_contract_apply_summary.json
```

当前 apply dry-run 结果：

```json
{
  "applied_standard_records": 19,
  "missing_standard_records": 0,
  "unit_evidence_objects_added": 87,
  "notes": 5,
  "blocked_registry_contracts": 2,
  "by_grade_band": {
    "H4G7": 5,
    "H4G8": 7,
    "H4G9": 7
  },
  "official_standard_text_changed": false,
  "writes_public_data": false
}
```

这一步把 contract candidate 变成可跑索引和 policy audit 的候选数据根，但它仍不是正式 `public/data` 写入。标准记录只演练写入白名单中的证据/复核字段；`domain`、`subdomain`、`standard`、`context`、`practice`、`teaching_tip`、`assessment_evidence_type` 均保持不变；5 条 `h4g_progression_notes` 只是 progression group 级版本投放说明候选，不被当前前端读取。2 个 blocked registry contracts 继续只停留在 generated 复核层，没有 public surface。

### 7.18 发布准备度安全审计

在 dry-run 候选根之后，本轮新增发布准备度审计 gate：

```bash
npm run textbooks:audit-h4g-publication-readiness -- --strict
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_readiness_audit.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_readiness_audit.md
```

当前审计结果：

```json
{
  "valid": true,
  "readiness_level": "ready_for_manual_review_not_publication",
  "manual_review_ready": true,
  "publication_ready": false,
  "public_migration_ready": false,
  "applied_standard_records": 19,
  "unit_evidence_objects": 87,
  "progression_note_candidates": 5,
  "blocked_registry_contracts": 2,
  "not_in_current_unit_candidate_scope": 85
}
```

这一步把“可以进入人工/课程复核”和“可以正式发布”拆开：审计会逐项比对 review packet、contract、apply summary、候选数据根、`h4g_progression_notes.json` 和 blocked registry，确认 19 条候选标准只改证据/复核字段、官方课标文本未变、5 条 note 仍是 progression group 级候选、2 个 blocked reviews 没有 public surface。它同时强制保留 `publication_ready=false`，因为人工复核记录、课程进阶复核、progression-note schema/UI、正式 public migration gate 和 85 条范围外数学 H4G standards 仍未完成。

### 7.19 人工/课程复核决策模板

在 readiness audit 之后，本轮新增复核决策模板：

```bash
npm run textbooks:h4g-publication-review-decisions -- --strict
npm run textbooks:audit-h4g-publication-review-decisions -- --strict
npm run textbooks:audit-h4g-publication-readiness -- --strict --require-review-decisions-audit
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_review_decisions_template.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_review_decisions_template.md
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_review_decisions_audit.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_review_decisions_audit.md
```

当前模板结果：

```json
{
  "required_manual_decisions": 24,
  "pending_required_decisions": 24,
  "standard_same_grade_decisions": 19,
  "progression_note_decisions": 5,
  "blocked_registry_decisions": 2,
  "manual_review_complete": false,
  "publication_ready": false
}
```

这一步把缺失的人工/课程复核记录变成了可编辑、可审计的输入文件。19 条同年级单元证据由 `manual_same_grade_unit_review` 决定，5 条 progression notes 由 `curriculum_progression_review` 决定，2 条 blocked guardrails 只能保持 blocked 或进入定向补救。默认所有必需决策都是 `pending`；审计允许 pending，但会报告 24 个 required decisions 未完成。带 `--require-review-decisions-audit` 复跑 readiness 后，主 readiness summary 也会记录 `review_decisions_audit_present=true`、`review_decisions_pending_required_decisions=24`、`manual_review_complete=false`。真实复核完成后，应使用 `textbooks:audit-h4g-publication-review-decisions -- --strict --require-complete`，且任何 public write、官方课标文本改写、自动 `grade_specific_variant` 升级、blocked 项发布都会被拒绝。

### 7.20 年级化显示层 readiness gate

本轮新增 H4G 年级化显示层审计：

```bash
npm run grade7_9:audit-h4g-grade-differentiation
npm run textbooks:apply-h4g-publication-review-decisions -- --strict
npm run grade7_9:audit-h4g-grade-differentiation -- --data-root generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_publication_contract
npm run grade7_9:audit-h4g-grade-differentiation -- --data-root generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_review_decisions
```

它和 `audit-h4g-distinctiveness` 的职责不同：

- `audit-h4g-distinctiveness` 只回答“重复的 H4G 三元组是否被诚实标成共享源标准/待分化”。
- `audit-h4g-grade-differentiation` 回答“这些记录是否已经具备可展示的本年级学习重点、单元/章节级教材证据和人工/课程复核批准”。

当前 public 根的预期结果：

```json
{
  "valid": true,
  "differentiation_ready": false,
  "h4g_records": 1081,
  "complete_triplets": 323,
  "exact_core_identical_triplets": 323,
  "unit_level_evidence_records": 36,
  "usable_grade_focus_records": 36,
  "final_ready_records": 36
}
```

数学 publication contract 候选根的预期结果：

```json
{
  "valid": true,
  "differentiation_ready": false,
  "unit_level_evidence_records": 19,
  "usable_grade_focus_records": 19,
  "candidate_grade_focus_records": 19,
  "final_ready_records": 0
}
```

这把“候选进展”和“最终发布就绪”拆开：contract 候选根中的 records 仍可能是 `unit_evidence_candidate_needs_review`；只有经过 review decisions apply 和 `textbooks:publish-h4g-reviewed-candidate` 的 records 才会在 public 中计入 `final_ready_records`。

同时新增 `textbooks:apply-h4g-publication-review-decisions`。它把填好的复核决策应用到新的 generated 候选根：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_review_decisions/
```

当前默认模板全部 pending，因此 apply summary 应显示 `applied_standard_decisions=0`、`pending_standard_decisions=19`、`pending_note_decisions=5`、`pending_blocked_decisions=2`。临时回归测试证明：如果某条 same-grade decision 被合规标为 `approve_same_grade_unit_evidence`，该脚本会在候选根中把对应 record 标为 `review_status: "unit_evidence_approved"`，随后 `audit-h4g-grade-differentiation` 会把该条计入 `ready_grade_specific`。这仍不写 `public/data`，也不改 `standard` 原文。

### 7.21 Codex 复核决策候选

为把三版本数学 19 条 ready 候选从“证据已准备好但全部 pending”推进到“候选根可验证的复核完成状态”，新增命令：

```bash
npm run textbooks:h4g-publication-review-recommendations -- --strict
npm run textbooks:audit-h4g-publication-review-decisions -- \
  --decisions generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_review_decisions_codex_reviewed.json \
  --out generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_review_decisions_codex_reviewed_audit.json \
  --summary-out generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_review_decisions_codex_reviewed_audit.md \
  --strict \
  --require-complete
npm run textbooks:apply-h4g-publication-review-decisions -- \
  --decisions generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_review_decisions_codex_reviewed.json \
  --out-data-root generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_codex_reviewed \
  --strict \
  --require-complete
```

该脚本只会在 publication review packet 已经满足以下条件时填入批准决策：

- 同年级 standard evidence 至少有 2 个版本、真实单元/章节证据、无 `toc_page_nonmonotonic`，且 alignment 为 `subdomain_anchor`、`reviewed_alias_anchor` 或 `strong_field_alignment`。
- progression note 必须是 high-confidence 的 `candidate_for_edition_placement_note`，且只批准为 progression-group 说明，不写入 same-grade `textbook_unit_evidence_ids`。
- blocked reviews 继续保持 `keep_blocked` 或 `needs_targeted_remediation`，没有 public publication surface。

当前数学候选的预期复核结果是：

```json
{
  "approve_same_grade_unit_evidence": 19,
  "approve_progression_group_note": 5,
  "blocked_review_kept_or_remediation": 2,
  "pending_required_decisions": 0,
  "writes_public_data": false,
  "official_standard_text_changed": false
}
```

将该复核决策应用到隔离候选根后，三版本候选根可看到 19 条数学 `final_ready_records`。2026-07-03 已进一步扩展到数学六版本 page-clean 包，并通过 reviewed publication gate 把数学 28 条和科学 17 条写入正式 `public/data`；`standard` 原文未改，且全量仍有 1036 条 H4G records 待补单元证据或复核。

### 7.22 数学六版本 page-clean 发布

2026-07-03 追加执行沪科技版、浙教版、湘教版三个完整 7/8/9 数学 work items，并与既有人教版、冀教版、华东师大版候选合并为六版本 page-clean 包：

```text
generated/textbook_evidence/h4g_runs/math_six_edition_page_clean/
```

关键结果：

```json
{
  "merged_candidates": 33,
  "ready_same_grade_records": 28,
  "unit_evidence_objects": 176,
  "multi_edition_standards": 28,
  "by_grade_band": {
    "H4G7": 9,
    "H4G8": 11,
    "H4G9": 8
  },
  "edition_placement_note_reviews": 3,
  "blocked_reviews": 2
}
```

这批次的改进点不是简单放宽匹配，而是增加了更多同年级版本证据：沪科技版 14 条候选、浙教版 6 条候选、湘教版 25 条候选进入合并池；publication page gate 排除了 2 个非单调页码对象。人工/课程复核决策批准 28 条 same-grade unit evidence、3 条 progression note，2 条仍保持 targeted remediation。最终 public 写入摘要为 `applied_records=45`，其中数学 28 条、科学 17 条，年级分布 `H4G7=14/H4G8=16/H4G9=15`，`official_standard_text_changed=false`。

本轮同时修复了教材目录 parser 的几个真实格式：

- 英文教材的 `Contents`、`Module 1`、`Unit 1`、`Revision module A`。
- 拉丁字母标题的真实目录候选识别。
- `S2` / `S 2` 这类印刷页码。
- 数学目录中“页码在 leader 前”的格式，例如 `24 . 1 旋转 2……`。

英语外研社目录因此已能抽出 47 个真实 module/unit 候选，但标准匹配仍为 0；体育人教版目录也能抽出 13 个真实候选但匹配仍为 0。根因不是目录解析，而是英语标准多为中文能力描述、教材单元多为英文主题标题；体育标准多为体能/健康/品德能力项，教材单元多为运动项目或活动主题。下一步需要学科级主题桥接或标准级 alias source review，不能用泛词匹配绕过 evidence gate。

### 7.23 English / PE 主题桥接缺口审计

为把上述判断固化成可复现质量门，新增只读命令：

```bash
npm run textbooks:audit-h4g-theme-bridge-gaps -- \
  --run-dirs generated/textbook_evidence/h4g_runs/h4g_unit_work_english_89497c34,generated/textbook_evidence/h4g_runs/h4g_unit_work_pe_6aec3166 \
  --out generated/textbook_evidence/h4g_theme_bridge_gaps_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_gaps_english_pe.md \
  --strict \
  --require-items
```

审计结果为 `valid=true`，并生成 2 个 bridge work items：

```json
{
  "bridge_work_items": 2,
  "by_bridge_type": {
    "bilingual_topic_bridge_required": 1,
    "curriculum_activity_theme_bridge_required": 1
  },
  "by_subject": {
    "english": {
      "real_unit_or_chapter_candidates": 47,
      "default_matches": 0,
      "low_threshold_matches": 0,
      "eligible_matches": 0
    },
    "pe": {
      "real_unit_or_chapter_candidates": 13,
      "default_matches": 0,
      "low_threshold_matches": 114,
      "eligible_matches": 0
    }
  }
}
```

这一步明确区分了两个不同根因：

- English：47 个真实目录候选都是英文标题，中文课标能力描述与英文教材主题在当前 token 模型下没有低阈值 overlap，应先做受控双语主题表，再把主题映射绑定到 progression group 或 standard code。
- PE：低阈值虽然有 114 个弱匹配，但最高分只有 0.2525，且都没有 eligible alignment；“运动”“健康”等泛词不能作为证据，应先建立运动项目/健康/体能/专项技能主题表，再做 source review。
- 两者还都有 page start gap：English 16/47，PE 1/13。主题桥接通过后仍需要页码补证据或人工回源复核，才能进入 reviewed publication gate。

因此，English/PE 的下一步不是调低通用匹配分数，而是新增学科级主题桥接层；桥接数据必须记录来源、年级/版本适用范围和 review status，且不得改写官方课标原文。

详细数据契约和进阶判定规则见 `docs/H4G_SUBJECT_THEME_BRIDGE_PLAN.md`。

### 7.24 English / PE 主题桥接 review packet

已新增受控主题表和 review-only gate：

```text
scripts/textbooks/h4g_subject_theme_taxonomy.json
scripts/textbooks/build_h4g_subject_theme_bridge_review_packet.js
scripts/textbooks/audit_h4g_subject_theme_bridge_review_packet.js
```

执行 English/PE 首批 review packet：

```bash
npm run textbooks:h4g-theme-bridge-review -- \
  --run-dirs generated/textbook_evidence/h4g_runs/h4g_unit_work_english_89497c34,generated/textbook_evidence/h4g_runs/h4g_unit_work_pe_6aec3166 \
  --subjects english,pe \
  --out generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe.md \
  --strict \
  --require-candidates

npm run textbooks:audit-h4g-theme-bridge-review -- \
  --packet generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe_audit.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe_audit.md \
  --strict \
  --require-candidates
```

结果为 `valid=true`：60 个 unit theme items、95 个 progression theme items、515 个 bridge review candidates，其中 English 340 条、PE 175 条；所有 670 个 review items 都是 `needs_source_review`。audit 确认没有 public write、没有官方文本变更、没有未复核 eligible evidence、没有跨年级 same-grade candidate。仍有 421 条 bridge candidates 缺 page-ready evidence，因此它们只能进入 source review / page recovery 队列，不能进入 reviewed publication gate。

### 7.26 主题桥接 source review 决策层

为避免 English/PE 的 515 条 bridge candidates 停留在“待复核列表”而无法进入可治理流程，本轮新增 source review decisions 模板和审计：

```bash
npm run textbooks:h4g-theme-bridge-review-decisions -- \
  --packet generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.md \
  --strict \
  --require-decisions

npm run textbooks:audit-h4g-theme-bridge-review-decisions -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --packet generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_decisions_audit_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_decisions_audit_english_pe.md \
  --strict
```

生成结果：515 条必需 source review decisions，English 340 条、PE 175 条；按年级分布为 `H4G7=216`、`H4G8=160`、`H4G9=139`；94 条 page-ready，421 条缺页码。默认全部 pending，因此 audit 为 `valid=true`，但 `source_review_complete=false`、`matcher_ready=false`、`publication_ready=false`。

这一步补上的不是 matcher 逻辑，而是决策记录层：每条批准都必须明确 `approve_standard_scoped_subject_theme_bridge` 或 `approve_progression_group_subject_theme_bridge`，并确认 source text、同学科、同年级、非泛词、页码检查、scope bounded、官方课标文本不变、不请求 public write。后续真实复核完成后，应先用 `--require-complete` 复跑 audit；若要进入 publication-page eligible 的后续 gate，还应加 `--require-page-ready-for-approval`。

### 7.27 主题桥接 source review worklist

在 decisions template 之后，本轮继续新增复核执行队列：

```bash
npm run textbooks:h4g-theme-bridge-review-worklist -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.md \
  --strict \
  --require-items

npm run textbooks:audit-h4g-theme-bridge-review-worklist -- \
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_worklist_audit_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_worklist_audit_english_pe.md \
  --strict \
  --require-items \
  --require-priority-one
```

结果为 `valid=true`：515 个 work items 全覆盖 source review decisions；94 个可先进入 `source_review_ready`，421 个必须先做 `page_recovery_then_source_review`。优先级分布为 `P1=27`、`P2=67`、`P3=3`、`P4=418`。主要风险包括 broad topic tag、同一 unit 关联过多 standards、低 bridge score、quality/performance standard 需要课程复核，以及 421 条 page missing。

这个 worklist 是执行层，不是审批层：P1 只表示“最适合先审”，不表示 bridge 已批准。下一步 source reviewer 应先处理 P1/page-ready 条目，并对 high fan-out units（例如 English 的 `Language in use`、PE 的球类章节）保持 standard-scoped 审核，防止主题桥接扩散成泛 alias。

### 7.28 Approved bridge registry 与 matcher 接口

为了让真实 source review 完成后可以进入 matcher，同时防止 pending bridge 被误用，本轮新增 approved bridge registry：

```bash
npm run textbooks:h4g-theme-bridge-registry -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --decisions-audit generated/textbook_evidence/h4g_theme_bridge_review_decisions_audit_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_registry_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_registry_english_pe.md \
  --strict

npm run textbooks:audit-h4g-theme-bridge-registry -- \
  --registry generated/textbook_evidence/h4g_theme_bridge_registry_english_pe.json \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_registry_audit_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_registry_audit_english_pe.md \
  --strict
```

当前正式 decisions 全部 pending，因此 registry 为 `valid=true`、`approved_bridges=0`。这正是预期状态：没有 source review 批准，就不会有任何 theme bridge 进入 matcher。

同时，`match_standards_to_textbook_units.js` 已新增 `reviewed_subject_theme_bridge` alignment 通道。该通道只读取 approved registry，并把证据写入 `subject_theme_bridge_alignment`；`audit_textbook_standard_matches.js` 和 `audit_h4g_unit_evidence_candidate.js` 已同步要求该 alignment 必须带 matched topic tags 和 reviewed bridge 记录。临时正向验证显示，1 条 approved standard-scoped bridge 可生成 1 条 English eligible match 和 1 条 H4G candidate；但该示例缺 page_start，所以仍被候选审计警告，后续 publication page gate 不会被绕过。

### 7.29 主题桥接 P1 source review batch

为了让真实 source review 不再只面对 515 条 pending rows，本轮新增 P1 审前阅读包：

```bash
npm run textbooks:h4g-theme-bridge-review-batch -- \
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe.md \
  --strict \
  --require-items \
  --max-priority 1 \
  --review-path source_review_ready

npm run textbooks:audit-h4g-theme-bridge-review-batch -- \
  --batch generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe.json \
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe_audit.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe_audit.md \
  --strict \
  --require-items \
  --max-priority 1 \
  --review-path source_review_ready
```

结果为 `valid=true`：27 个 batch items 与 worklist selection 完全一致，全部是 English/H4G7、`source_review_ready`、page-ready，且 27 条 source decisions 仍为 `pending`。batch 中每条都补齐了官方标准原文、context、practice、teaching tip、assessment evidence type、教材单元页码、topic tag、fan-out 风险和待编辑决策模板。

这个 batch 的作用是让 reviewer 判断“该单元是否真的支撑这个标准或 progression group”，不是自动批准。分布上也暴露了下一步风险：P1 没有覆盖 H4G8/H4G9；P2 才出现少量 H4G9，H4G8 当前全部位于 page recovery 队列。因此后续 7/8/9 分化不能只跑 P1 source review，还必须做 H4G8 页码补证据和 H4G9 P2 复核。

### 7.30 H4G8 主题桥接 page recovery batch

为了系统性处理 H4G8 全部缺页码的问题，本轮新增 page recovery batch：

```bash
npm run textbooks:h4g-theme-bridge-page-recovery -- \
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_page_recovery_batch_h4g8_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_page_recovery_batch_h4g8_english_pe.md \
  --strict \
  --require-items \
  --grade-bands H4G8

npm run textbooks:audit-h4g-theme-bridge-page-recovery -- \
  --batch generated/textbook_evidence/h4g_theme_bridge_page_recovery_batch_h4g8_english_pe.json \
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_page_recovery_batch_h4g8_english_pe_audit.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_page_recovery_batch_h4g8_english_pe_audit.md \
  --strict \
  --require-items \
  --grade-bands H4G8
```

结果为 `valid=true`：H4G8 的 160 条 `page_recovery_then_source_review` work items 聚合成 9 个 recovery units，其中 English 8 个、PE 1 个，分布在 `ctb_f73a093e2c3d`、`ctb_0f2ed61a1c90`、`ctb_640488b51030` 三个教材文件。优先级分布为 `R1=5`、`R2=2`、`R3=1`、`R4=1`，R1 包含：

- `Unit 1 Let’s try to speak English as much`
- `Unit 2 I feel nervous when I speak Chinese.`
- `Unit 2 You should smile at her!`
- `第三章 足球`
- `Unit 3 Language in use`

这一步把 H4G8 阻塞从“160 条 standards 候选都缺页码”收敛为“先复核 3 个教材文件中的 9 个单元页码”。但它仍是 read-only page recovery task：不填 `page_start`，不写 `public/data`，不批准 subject-theme bridge。真实页码应先通过 TOC OCR 或正文页脚证据写入 `scripts/textbooks/textbook_unit_page_start_overrides.json`，再重跑 unit index、theme bridge packet、decisions/worklist、source review batch 和后续 registry/matcher gates。

### 7.31 H4G8 R1 页码恢复写入

本轮按 7.30 的 R1 顺序，先恢复 5 个最高影响面的 H4G8 单元页码，并写入 `scripts/textbooks/textbook_unit_page_start_overrides.json`：

| textbook_evidence_id | 单元 | page_start | 证据 |
| --- | --- | ---: | --- |
| `ctb_f73a093e2c3d` | `Unit 1 Let’s try to speak English as much` | 2 | PDF page 9 正文标题 `Unit 1 Let’s try to speak English as much as possible.`，同页页脚 2；Scope and sequence PDF page 5 也列 Module 1 `P2`。 |
| `ctb_f73a093e2c3d` | `Unit 2 You should smile at her!` | 4 | PDF page 11 正文标题 `Unit 2 You should smile at her!`，同页页脚 4。 |
| `ctb_f73a093e2c3d` | `Unit 3 Language in use` | 6 | PDF page 13 正文标题 `Unit 3 Language in use`，同页页脚 6。 |
| `ctb_0f2ed61a1c90` | `Unit 2 I feel nervous when I speak Chinese.` | 4 | PDF page 11 正文标题 `Unit 2 I feel nervous when I speak Chinese.`，同页页脚 4。 |
| `ctb_640488b51030` | `第三章 足球` | 22 | TOC PDF page 5 列 `P22 第三章 足球`；PDF page 28 正文标题 `第三章 足 球`，同页页脚 22。 |

重跑 run-level unit index 后，English 的 page-start candidates 从 16 增至 20，其中 4 条来自 override；PE 的 page-start candidates 从 1 增至 2，其中 1 条来自 override。两个 unit index audit 均为 `valid=true`。

重跑 theme bridge 全链路后，English/PE review packet 仍为 515 条 bridge candidates，但 page-ready bridge candidates 从 94 增至 226，缺页码 candidates 从 421 降至 289。R1 后 worklist 为 `source_review_ready=226`、`page_recovery_then_source_review=289`，优先级为 `P1=54`、`P2=172`、`P3=3`、`P4=286`。H4G8 的分布从 160 条全缺页码，变为 English `source_review_ready=110`、PE `source_review_ready=22`、English 剩余 `page_recovery_then_source_review=28`。新的 H4G8 page recovery batch 为 `valid=true`，只剩 28 条 work items、3 个 English recovery units。

P1 source review batch 也随之从 27 条扩展为 54 条：H4G7 27 条、H4G8 27 条；subject 分布为 English 40 条、PE 14 条。注意这仍只是 source review 输入，不是 approval；registry 重跑后仍为 `approved_bridges=0`，因为所有 decisions 仍是 `pending`。

### 7.32 H4G8 R2/R3 页码恢复完成

为清空 H4G8 剩余 page recovery，本轮继续恢复 R2/R3 的 3 个 English 单元，并写入 `scripts/textbooks/textbook_unit_page_start_overrides.json`：

| textbook_evidence_id | 单元 | page_start | 证据 |
| --- | --- | ---: | --- |
| `ctb_0f2ed61a1c90` | `Unit 3 Language in use` | 6 | PDF page 13 正文标题 `Unit 3 Language in use`，同页页脚 6。 |
| `ctb_f73a093e2c3d` | `Unit 1 It’s taller than many other buildings.` | 10 | Scope and sequence PDF page 5 列 Module 2 `P10`；PDF page 17 正文标题同页页脚 10。 |
| `ctb_0f2ed61a1c90` | `Unit 1 It smells delicious.` | 2 | Scope and sequence PDF page 5 列 Module 1 `P2`；PDF page 9 正文标题同页页脚 2。 |

局部 unit index audit 和 English run-level unit index audit 均为 `valid=true`。English page-start candidates 从 R1 后的 20 增至 23，新增 3 条来自 reviewed overrides。

重跑 theme bridge 全链路后，515 条 bridge candidates 不变，但 page-ready bridge candidates 从 226 增至 254，缺页码 candidates 从 289 降至 261。Worklist 为 `source_review_ready=254`、`page_recovery_then_source_review=261`，优先级为 `P1=57`、`P2=197`、`P3=3`、`P4=258`。H4G8 已没有 page recovery 项：160 条全部进入 `source_review_ready`，其中 English 138 条、PE 22 条。新的 H4G8 page recovery batch 为 `valid=true` 且 `selected_work_items=0`，作为 H4G8 页码恢复完成的审计证据。

P1 source review batch 现在为 57 条：H4G7 27 条、H4G8 30 条；subject 分布为 English 43 条、PE 14 条；全部 page-ready 且仍为 `pending`。Registry 仍为 `approved_bridges=0`，因为页码恢复不能替代 source review approval。

### 7.33 P1 source review recommendation 与 matcher 验证

在 H4G8 页码恢复完成后，本轮新增 P1 批次级 source review recommendation 脚本：

```bash
npm run textbooks:h4g-theme-bridge-review-recommendations -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --batch generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe.md \
  --strict \
  --require-items
```

该脚本只修改 batch 内出现的 decisions，不改原始 pending template。规则边界是保守的：只批准强 standard-scoped bridge；PE 足球单元误连到田径、体操、水上、传统体育、轮滑、新兴体育等 standards 时显式拒绝；其余宽泛主题相关但不足以证明精确 standard-to-unit 关系的 rows 标为 `needs_revision`。

当前 P1 结果：

```json
{
  "required_source_review_decisions": 515,
  "completed_source_review_decisions": 57,
  "approved_bridge_decisions": 18,
  "pending_source_review_decisions": 458,
  "by_reviewer_decision": {
    "approve_standard_scoped_subject_theme_bridge": 18,
    "needs_revision": 30,
    "reject_subject_theme_bridge": 9,
    "pending": 458
  }
}
```

decision audit 为 `valid=true`，且 18 条 approved bridges 全部 page-ready；但 `source_review_complete=false`、`matcher_ready=false`、`publication_ready=false`，因为还有 458 条 source review decisions 没有完成。

用 P1 reviewed decisions 导出的 registry 也通过审计：

```json
{
  "approved_bridges": 18,
  "by_subject": {
    "english": 15,
    "pe": 3
  },
  "by_grade_band": {
    "H4G7": 12,
    "H4G8": 6
  },
  "by_scope_type": {
    "standard_code": 18
  },
  "page_missing_bridges": 0,
  "page_ready_bridges": 18
}
```

这说明 theme bridge 的 approved registry 可以安全进入 matcher，但只是 P1 子集：H4G9 仍没有 approved bridge，H4G7/H4G8 也只覆盖少量标准。用该 registry 复跑后，English 产生 15 条 `reviewed_subject_theme_bridge` eligible matches，覆盖 8 条 standards；PE 产生 3 条 eligible matches，覆盖 3 条 standards。对应 H4G unit candidate audit 均为 `valid=true`，且 page_start 完整。

最终 consistency audit 仍给出发布阻断：English 8 条 candidate standards / 15 个单元证据对象和 PE 3 条 candidate standards / 3 个单元证据对象都只来自单一教材版本，`cross_version_consistency_proven=false`、`complete_progression_groups=false`。因此本轮修复的结论是：English/PE 的主题桥接审批链、approved registry、matcher 和候选包审计可以工作；但这些 P1 样本不能写入 `public/data`，也不能证明 H4G7/H4G8/H4G9 standards 已完成真实年级分化。

### 7.34 P2 pending source review batch

P1 recommendation 后，剩余 458 条 source review decisions 仍为 pending，其中 197 条已经 page-ready。为避免下一轮审阅把已审过的 P1 rows 混进来，本轮扩展了 `build_h4g_subject_theme_bridge_review_batch.js` 与对应 audit：

- `--min-priority`：与 `--max-priority` 组合成 priority range。
- `--reviewer-decisions`：只选择指定当前决策状态，如 `pending`。

用 P1 reviewed decisions 重建 after-P1 worklist 并抽取 P2 pending batch：

```bash
npm run textbooks:h4g-theme-bridge-review-worklist -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_worklist_after_p1_codex_reviewed_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_worklist_after_p1_codex_reviewed_english_pe.md \
  --strict \
  --require-items

npm run textbooks:h4g-theme-bridge-review-batch -- \
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_after_p1_codex_reviewed_english_pe.json \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_batch_p2_pending_after_p1_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_batch_p2_pending_after_p1_english_pe.md \
  --strict \
  --require-items \
  --min-priority 2 \
  --max-priority 2 \
  --review-path source_review_ready \
  --reviewer-decisions pending
```

P2 batch audit 为 `valid=true`：

```json
{
  "batch_items": 197,
  "page_ready_items": 197,
  "page_missing_items": 0,
  "by_current_reviewer_decision": {
    "pending": 197
  },
  "by_grade_band": {
    "H4G7": 57,
    "H4G8": 130,
    "H4G9": 10
  },
  "by_subject": {
    "english": 179,
    "pe": 18
  }
}
```

这一步的价值是把 H4G9 纳入可执行 source review 队列，并把 H4G8 的审阅面从 P1 的 30 条扩大到 P2 的 130 条；但它不是 approval。P2 的质量画像显示 182 条 `unit_overmatches_many_standards`、193 条 `single_shared_topic_tag`、131 条 `standard_has_many_bridge_candidates`，因此下一轮应以人工/课程 source review 为主，不能直接用 P1 的强规则自动生成大批 approved registry。

### 7.35 P2 conservative recommendation 与 after-P2 page recovery

对 P2 pending batch 运行同一 recommendation gate，但采用保守结果：不新增 approved bridge，只把明确项目错配拒绝，其余高风险宽主题 rows 标为 `needs_revision`。

```bash
npm run textbooks:h4g-theme-bridge-review-recommendations -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe.json \
  --batch generated/textbook_evidence/h4g_theme_bridge_review_batch_p2_pending_after_p1_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_p2_codex_reviewed_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_p2_codex_reviewed_english_pe.md \
  --strict \
  --require-items
```

审计结果为 `valid=true`：

```json
{
  "required_source_review_decisions": 515,
  "completed_source_review_decisions": 254,
  "approved_bridge_decisions": 18,
  "pending_source_review_decisions": 261,
  "by_reviewer_decision": {
    "approve_standard_scoped_subject_theme_bridge": 18,
    "needs_revision": 220,
    "reject_subject_theme_bridge": 16,
    "pending": 261
  }
}
```

P2 没有新增 matcher-approved bridge；after-P2 registry 仍是 18 条，全部来自 P1。这个结果很关键：P2 确认了高 fan-out 宽主题不能自动放行，source review 风险被收敛到需要更窄 topic/alias 或课程复核。

after-P2 的剩余 261 条 pending 全部缺页码，不再有 page-ready pending 项。缺口分布：

| subject / grade | pending page-missing decisions |
| --- | ---: |
| PE H4G7 | 113 |
| English H4G9 | 99 |
| PE H4G9 | 30 |
| English H4G7 | 19 |

因此下一步主线转为 page recovery。已生成并审计两个恢复批次：

| batch | recovery units | linked work items | R1 units |
| --- | ---: | ---: | --- |
| H4G9 after-P2 | 9 | 129 | English 九年级两个 `Unit 3 Language in use` |
| H4G7 after-P2 | 12 | 132 | PE 七年级足球、篮球、排球、乒乓球章节 |

H4G9 批次分布在 `ctb_0ad2b1e46e08`、`ctb_836e0338edc2`、`ctb_028db4ce8af0` 三个教材文件；H4G7 批次分布在 `ctb_b2ca748e7eca` 和 `ctb_7f9265bf475e`。这些批次仍只是 override 模板和页码恢复任务，不填 `page_start`，不批准 bridge，也不写 `public/data`。

## 8. 当前边界

当前 public 数据可以支持：

- 按 H4G7/H4G8/H4G9 浏览。
- 明确看到哪些记录只是共享源标准。
- 对 45 条已审核 records 展示基于教材单元证据的 `grade_specific_focus`。
- 明确看到哪些记录需要教材单元级证据。
- 避免把 7-9 共同要求误读为官方逐年级标准。

当前 public 数据不能声称：

- 所有 H4G7/H4G8/H4G9 standards 已经真实分化。
- 当前教材证据已经定位到具体单元/章节。
- `grade_specific_focus` 已经是完整年级教学进阶建议。
