# H4G 七八九年级 distinctiveness 修复记录

更新时间：2026-07-01

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

`textbooks:unit-index` 已支持 `--evidence-ids`、`--materialize-timeout-ms`、`--debug-text-dir` 和可选 `--ocr-fallback`，用于精确复现单本教材的 PDF 物化、文本层目录解析和 OCR fallback。当前数学人教版 7/8/9 六册样本已能物化 PDF，并在 OCR fallback 后抽出 118 个真实 `toc_unit_or_chapter`；七下、八下、九下由 Apple Vision OCR 补足目录候选。

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

标准-单元匹配入口当前也已落地。数学人教版 7/8/9 小批量真实数据下，114 条 H4G standards 被评估，118 个 `toc_unit_or_chapter` 候选进入匹配，得到 106 个 matches 和 32 个 `eligible_for_h4g_differentiation` 候选。eligible 门槛要求真实单元候选、分数达标，并命中标准 `subdomain` 锚点；这会阻止 `实数` 被 `有理数` 单元误升级、`一次函数` 被 `一元一次方程` 单元误升级。

写回前候选包入口也已新增：

```bash
npm run textbooks:h4g-unit-candidates -- --strict --require-candidates
```

当前数学 OCR 样本可生成 15 条 public standard 对应的单元级证据候选，分布为 H4G7 7 条、H4G8 3 条、H4G9 5 条。候选包只组织 `textbook_unit_evidence_ids`、单元标题、match score、matched fields、subdomain anchor 和建议更新字段，不写 `public/data`，也不改写课标原文。

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

该小批量已经通过严格匹配审计并形成写回前候选包，但仍不能直接写入 `public/data`：跨版本一致性、页码范围、人工/规则复核和正式 apply 流程尚未完成。

优先级建议：

1. 数学、科学：概念链和教材单元最清楚，最适合先做。
2. 英语、语文：可按主题、任务群、文本类型和能力等级推进。
3. 道德与法治、体育、艺术：保留更多人工复核环节。
4. 信息科技、劳动：当前 ChinaTextbook 覆盖为空，应继续低置信度并寻找补充教材来源。

## 7. 当前边界

当前 public 数据可以支持：

- 按 H4G7/H4G8/H4G9 浏览。
- 明确看到哪些记录只是共享源标准。
- 明确看到哪些记录需要教材单元级证据。
- 避免把 7-9 共同要求误读为官方逐年级标准。

当前 public 数据不能声称：

- 所有 H4G7/H4G8/H4G9 standards 已经真实分化。
- 当前教材证据已经定位到具体单元/章节。
- `grade_specific_focus` 已经是完整年级教学进阶建议。
