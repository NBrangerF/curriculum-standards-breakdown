# 教材单元证据管线

更新时间：2026-07-01

本文记录从 ChinaTextbook 教材文件索引继续推进到“单元/章节级候选证据”的当前管线。它是后续真正区分 `H4G7`、`H4G8`、`H4G9` standards 的证据入口，但当前阶段不会直接改写正式 `public/data`。

## 1. 目标

当前 H4G 数据已经做到：

- 正式 runtime 使用 `H4G7/H4G8/H4G9`，不再暴露单一 `H4=7-9`。
- 核心文本完全相同的三年级记录已标为 `same_source_shared`。
- 这些记录明确写入 `requires_unit_level_evidence: true` 和空的 `textbook_unit_evidence_ids`。

下一步要解决的是：把教材证据从“某本教材属于某年级”推进到“某个标准可解释地对应某个教材单元/章节”。只有完成这一步，才可以把一部分记录从 `same_source_shared` 升级为真正的 `grade_specific_variant`。

## 2. 输入

基础输入来自教材文件索引：

```text
generated/textbook_evidence/china_textbook_index.json
```

该索引由以下命令生成：

```bash
npm run textbooks:index-china
```

索引固定 ChinaTextbook commit：

```text
5a80345f2043ba6f8db8d7be9cf3db82725ff1f7
```

本仓库不提交教材 PDF。`generated/external/ChinaTextbook` 推荐保持 blobless/no-checkout clone，默认索引只读 Git tree，不触发 PDF blob 下载。

## 3. 新增命令

生成单元/章节候选索引：

```bash
npm run textbooks:unit-index
```

常用参数：

```bash
npm run textbooks:unit-index -- --subjects math --all
npm run textbooks:unit-index -- --subjects math,science --max-files 12
npm run textbooks:unit-index -- --grades 7,8 --max-files 20
npm run textbooks:unit-index -- --evidence-ids ctb_48072359f7df --materialize --max-pages 12 --materialize-timeout-ms 45000
```

输出：

```text
generated/textbook_evidence/textbook_unit_index.json
generated/textbook_evidence/textbook_unit_index_summary.md
```

审计：

```bash
npm run textbooks:audit-unit-index -- --strict
```

当未来要求必须已经有真实单元/章节候选时，使用：

```bash
npm run textbooks:audit-unit-index -- --strict --require-real-units
```

生成标准-单元候选匹配：

```bash
npm run textbooks:match-units
```

常用参数：

```bash
npm run textbooks:match-units -- --subjects math,science
npm run textbooks:match-units -- --subjects math --unit-index /tmp/textbook_unit_index_math.json
```

输出：

```text
generated/textbook_evidence/textbook_unit_standard_matches.json
generated/textbook_evidence/textbook_unit_standard_matches_summary.md
```

匹配审计：

```bash
npm run textbooks:audit-unit-matches -- --strict
```

当未来已经要求存在真实匹配时，使用：

```bash
npm run textbooks:audit-unit-matches -- --strict --require-matches --require-eligible
```

## 4. 输出结构

`textbook_unit_index.json` 有两个核心数组：

| 字段 | 说明 |
| --- | --- |
| `textbook_files` | 被选中的教材文件，保留原 `evidence_id`、年级、版本、册次、文件路径和提取状态。 |
| `unit_candidates` | 单元/章节候选证据，后续标准匹配只应读取这里。 |

`unit_candidates` 的关键字段：

| 字段 | 说明 |
| --- | --- |
| `unit_evidence_id` | 稳定候选 ID，未来可被 `textbook_unit_evidence_ids` 引用。 |
| `textbook_evidence_id` | 来源教材文件 ID，对应 `china_textbook_index.json`。 |
| `subject_slug` | 映射到本站的学科。 |
| `grade` / `grade_label` | 教材路径解析出的年级。 |
| `edition` / `volume` | 版本和册次。 |
| `unit_title` | 候选单元或占位标题。 |
| `candidate_type` | `volume_seed` 或 `toc_unit_or_chapter`。 |
| `evidence_granularity` | `textbook_file_grade_level` 或 `textbook_unit_or_chapter_candidate`。 |
| `confidence` | 候选提取置信度。 |
| `requires_review` | 当前一律为 true，不能跳过人工/规则复核。 |

`textbook_unit_standard_matches.json` 的关键字段：

| 字段 | 说明 |
| --- | --- |
| `match_id` | 稳定匹配 ID。 |
| `standard_code` | 被匹配的 H4G standard code，必须来自 `public/data` 或 candidate data root。 |
| `unit_evidence_id` | 来源单元/章节候选 ID。 |
| `candidate_type` | 当前可作为匹配证据的类型必须是 `toc_unit_or_chapter`。 |
| `score` | 0 到 1 的关键词匹配分数。 |
| `confidence_band` | `high`、`medium`、`low` 或 `below_threshold`。 |
| `matched_keywords` | 标准字段与单元标题之间的关键词交集。 |
| `matched_fields` | 关键词命中的标准字段和短摘录。 |
| `rationale` | 可读匹配理由。 |
| `eligible_for_h4g_differentiation` | 是否达到后续 H4G 分化候选证据门槛。 |
| `requires_review` | 当前一律为 true。 |

## 5. 候选类型边界

当前有两种候选类型：

| candidate_type | 粒度 | 可用于什么 | 不能用于什么 |
| --- | --- | --- | --- |
| `volume_seed` | `textbook_file_grade_level` | 证明某个学科、年级、版本、册次教材存在；作为后续 OCR/目录提取的任务种子。 | 不能证明某条 standard 已匹配到具体单元；不能把 H4G 记录升级为 `grade_specific_variant`。 |
| `toc_unit_or_chapter` | `textbook_unit_or_chapter_candidate` | 可进入后续标准-教材匹配打分。 | 仍不能直接当作课标原文；需要匹配 rationale 和人工/规则复核。 |

默认不加 `--materialize` 时，只产生 `volume_seed`。这是稳定、可重复、不会下载 PDF 的模式。

标准-单元匹配脚本默认只读取 `toc_unit_or_chapter`。如果使用 `--include-volume-seeds`，输出只可用于诊断；审计脚本会阻止 `volume_seed` 被当作正式匹配证据。

## 6. 可选 PDF 物化模式

如果需要尝试从 PDF 前若干页解析目录，可使用：

```bash
npm run textbooks:unit-index -- --subjects math --max-files 2 --max-pages 18 --materialize
npm run textbooks:unit-index -- --evidence-ids ctb_48072359f7df --materialize --max-pages 12 --materialize-timeout-ms 45000 --debug-text-dir /tmp/textbook_debug_text
```

该模式会：

1. 用 `git show` 从 ChinaTextbook 读取选中 PDF blob。
2. 缓存到 `generated/textbook_evidence/pdf_cache/`。
3. 使用 Python `pypdf` 提取前若干页文本。
4. 从目录行或“第 X 单元/章/课”模式生成 `toc_unit_or_chapter` 候选。

新增诊断参数：

| 参数 | 作用 |
| --- | --- |
| `--evidence-ids` | 精确指定 `china_textbook_index.json` 中的教材文件 ID，适合小批量复现。指定后不再按 `--max-files` 截断。 |
| `--materialize-timeout-ms` | 限制单个 PDF blob 物化时间，默认 60000ms。超时会记为 `materialize_timeout`。 |
| `--debug-text-dir` | 保存已提取 PDF 文本，便于人工检查目录格式和改进解析规则。 |

注意：本地样本执行时，`git show` 懒加载 PDF blob 与 GitHub raw URL 都出现超时。因此 `--materialize` 不能作为默认质量门；它只能用于小批量探索，或在后续建立稳定 PDF/OCR 缓存后再纳入严格流程。超时是教材 blob 获取失败，不等于教材没有目录。

## 7. 当前验证结果

已通过语法与无物化流程验证：

```bash
node --check scripts/textbooks/build_textbook_unit_index.js
node --check scripts/textbooks/audit_textbook_unit_index.js
node --check scripts/textbooks/match_standards_to_textbook_units.js
node --check scripts/textbooks/audit_textbook_standard_matches.js
npm run textbooks:unit-index -- --subjects math --max-files 3 --out /tmp/textbook_unit_index_math3.json --summary-out /tmp/textbook_unit_index_math3.md
npm run textbooks:unit-index -- --subjects math --all --out /tmp/textbook_unit_index_math_all.json --summary-out /tmp/textbook_unit_index_math_all.md
node scripts/textbooks/audit_textbook_unit_index.js --unit-index /tmp/textbook_unit_index_math_all.json --out /tmp/textbook_unit_index_math_all_audit.json --strict
npm run textbooks:match-units -- --subjects math --out /tmp/textbook_unit_standard_matches_math.json --summary-out /tmp/textbook_unit_standard_matches_math.md
node scripts/textbooks/audit_textbook_standard_matches.js --matches /tmp/textbook_unit_standard_matches_math.json --out /tmp/textbook_unit_standard_matches_math_audit.json --strict
```

已通过指定教材 ID 的物化超时诊断：

```bash
npm run textbooks:unit-index -- --evidence-ids ctb_48072359f7df --materialize --max-pages 12 --materialize-timeout-ms 45000 --debug-text-dir /tmp/textbook_debug_text --out /tmp/textbook_unit_index_math_g7_id_timeout.json --summary-out /tmp/textbook_unit_index_math_g7_id_timeout.md
npm run textbooks:audit-unit-index -- --unit-index /tmp/textbook_unit_index_math_g7_id_timeout.json --out /tmp/textbook_unit_index_math_g7_id_timeout_audit.json --strict
```

该样本结果：

```json
{
  "textbook_files": 1,
  "unit_candidates": 1,
  "real_unit_or_chapter_candidates": 0,
  "volume_seed_candidates": 1,
  "by_extraction_status": {
    "materialize_timeout": 1
  }
}
```

数学全量无物化结果：

```json
{
  "textbook_files": 51,
  "unit_candidates": 51,
  "real_unit_or_chapter_candidates": 0,
  "volume_seed_candidates": 51,
  "by_subject": {
    "math": 51
  }
}
```

审计通过但保留 warning：当前索引还没有 `toc_unit_or_chapter`，只有文件/册次级 seed。

当前真实数据下的数学标准-单元匹配结果：

```json
{
  "standards_evaluated": 114,
  "unit_candidates_considered": 0,
  "real_unit_or_chapter_candidates": 0,
  "matches": 0,
  "eligible_matches": 0,
  "unmatched_standards": 114
}
```

这说明匹配 gate 目前能正确阻止文件级 seed 被误用为单元证据。临时 `toc_unit_or_chapter` 样本也已验证过非空路径：候选存在时会输出 `score`、`matched_fields`、`matched_keywords` 和 `rationale`，并由 `audit-unit-matches` 严格校验。

## 8. 与 H4G 分化的关系

H4G 记录只有满足以下条件，才可以从 `same_source_shared` 向 `grade_specific_variant` 升级：

1. 至少有一个同学科、同年级的 `toc_unit_or_chapter` 候选。
2. 标准核心字段与候选单元/章节建立可解释匹配。
3. 匹配通过 `textbooks:audit-unit-matches -- --strict --require-matches --require-eligible`。
4. 记录写入 `textbook_unit_evidence_ids`、匹配关键词、匹配分数和 rationale。
5. `grade_specific_focus` 与 `progression_delta` 基于证据生成，不直接改写课标原文。
6. `grade7_9:audit-h4g-distinctiveness -- --strict` 仍然通过。

换句话说，`volume_seed` 是任务入口；`toc_unit_or_chapter` 才是后续年级分化的候选证据。

## 9. 下一步

建议顺序：

1. 先以数学、科学为试点，因为概念链和教材单元结构最清楚。
2. 为少量教材建立稳定 PDF/OCR 缓存，避免每次依赖 GitHub 懒加载。
3. 改进目录解析，补充页码范围、关键词和册次位置。
4. 扩展标准-单元匹配脚本，加入页码范围、版本一致性和跨版本一致性证据。
5. 设计通过复核的匹配写回 H4G candidate 的流程，再进入正式 public 写入 gate。
