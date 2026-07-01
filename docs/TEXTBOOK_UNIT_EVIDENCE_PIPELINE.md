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
5. 如显式启用 `--ocr-fallback`，当 PDF 文本层没有目录候选时，用 Apple Vision OCR 读取前若干页后再走同一套目录解析。

新增诊断参数：

| 参数 | 作用 |
| --- | --- |
| `--evidence-ids` | 精确指定 `china_textbook_index.json` 中的教材文件 ID，适合小批量复现。指定后不再按 `--max-files` 截断。 |
| `--materialize-timeout-ms` | 限制单个 PDF blob 物化时间，默认 60000ms。超时会记为 `materialize_timeout`。 |
| `--debug-text-dir` | 保存已提取 PDF 文本，便于人工检查目录格式和改进解析规则。 |
| `--ocr-fallback` | 可选 macOS Apple Vision OCR fallback；仅在文本层没有目录候选时运行。默认关闭。 |
| `--ocr-dpi` | OCR 渲染 DPI，默认 180。 |
| `--ocr-batch-size` | OCR 分批页数，默认 4。 |
| `--ocr-languages` | OCR 语言列表，默认 `zh-Hans,en-US`。 |

注意：`--materialize` 和 `--ocr-fallback` 仍然不能作为默认质量门；它们依赖外部 GitHub blob 获取、本机 PDF 渲染和 macOS Vision OCR，只能用于小批量探索，或在后续建立稳定 PDF/OCR 缓存后再纳入严格流程。`materialize_timeout` 是教材 blob 获取失败，不等于教材没有目录；`text_extracted` 但无目录候选通常表示需要改 parser 或进入 OCR。

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

已通过指定教材 ID 的真实物化与目录抽取：

```bash
npm run textbooks:unit-index -- --evidence-ids ctb_48072359f7df --materialize --max-pages 24 --materialize-timeout-ms 120000 --debug-text-dir /tmp/textbook_debug_text_h4g_clean --out /tmp/textbook_unit_index_math_g7_clean.json --summary-out /tmp/textbook_unit_index_math_g7_clean.md
npm run textbooks:audit-unit-index -- --unit-index /tmp/textbook_unit_index_math_g7_clean.json --out /tmp/textbook_unit_index_math_g7_clean_audit.json --strict --require-real-units
```

该样本结果：

```json
{
  "textbook_files": 1,
  "unit_candidates": 19,
  "real_unit_or_chapter_candidates": 19,
  "volume_seed_candidates": 0,
  "by_extraction_status": {
    "cached": 1
  },
  "by_unit_level": {
    "chapter": 4,
    "section": 15
  }
}
```

数学人教版 7/8/9 六册小批量验证：

```bash
npm run textbooks:unit-index -- --evidence-ids ctb_48072359f7df,ctb_c5fa3c0e2226,ctb_e14d09b0b94a,ctb_485165afa9c8,ctb_045c4e32dda3,ctb_286bc7db0209 --materialize --max-pages 30 --materialize-timeout-ms 180000 --debug-text-dir /tmp/textbook_debug_text_math_h4g_all_norm2 --out /tmp/textbook_unit_index_math_h4g_pep_all_norm2.json --summary-out /tmp/textbook_unit_index_math_h4g_pep_all_norm2.md
npm run textbooks:audit-unit-index -- --unit-index /tmp/textbook_unit_index_math_h4g_pep_all_norm2.json --out /tmp/textbook_unit_index_math_h4g_pep_all_norm2_audit.json --strict
```

结果：

```json
{
  "textbook_files": 6,
  "unit_candidates": 64,
  "real_unit_or_chapter_candidates": 61,
  "volume_seed_candidates": 3,
  "by_extraction_status": {
    "cached": 6
  }
}
```

其中七年级上册、八年级上册、九年级上册均可从文本层抽出目录候选；七年级下册、八年级下册、九年级下册在不开 OCR 时文本层为空，只保留 `volume_seed`。

开启 OCR fallback 后的数学人教版 7/8/9 六册验证：

```bash
npm run textbooks:unit-index -- --evidence-ids ctb_48072359f7df,ctb_c5fa3c0e2226,ctb_e14d09b0b94a,ctb_485165afa9c8,ctb_045c4e32dda3,ctb_286bc7db0209 --materialize --ocr-fallback --max-pages 14 --materialize-timeout-ms 180000 --debug-text-dir /tmp/textbook_debug_text_math_h4g_ocr2 --out /tmp/textbook_unit_index_math_h4g_pep_ocr2.json --summary-out /tmp/textbook_unit_index_math_h4g_pep_ocr2.md
npm run textbooks:audit-unit-index -- --unit-index /tmp/textbook_unit_index_math_h4g_pep_ocr2.json --out /tmp/textbook_unit_index_math_h4g_pep_ocr2_audit.json --strict --require-real-units
```

结果：

```json
{
  "textbook_files": 6,
  "unit_candidates": 118,
  "real_unit_or_chapter_candidates": 118,
  "volume_seed_candidates": 0,
  "by_text_status": {
    "text_extracted": 3,
    "ocr_text_extracted": 3
  },
  "by_ocr_status": {
    "not_run": 3,
    "ocr_text_extracted": 3
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

当前数学人教版 7/8/9 小批量标准-单元匹配结果（启用 OCR fallback 后）：

```json
{
  "standards_evaluated": 114,
  "unit_candidates_considered": 118,
  "real_unit_or_chapter_candidates": 118,
  "matches": 106,
  "eligible_matches": 32,
  "unmatched_standards": 66
}
```

该结果已通过：

```bash
npm run textbooks:audit-unit-matches -- --matches /tmp/textbook_unit_standard_matches_math_h4g_pep_ocr2.json --unit-index /tmp/textbook_unit_index_math_h4g_pep_ocr2.json --out /tmp/textbook_unit_standard_matches_math_h4g_pep_ocr2_audit.json --strict --require-matches --require-eligible
```

当前 eligible 还只是候选证据，不直接写入 `public/data`。匹配脚本已经加上 `subdomain` 锚点门：达到 score 但没有命中 `subdomain` 锚点的候选，例如 `实数` 标准匹配到 `有理数` 单元、`一次函数` 标准匹配到 `一元一次方程` 单元，会被保留为普通 match，但不会成为 `eligible_for_h4g_differentiation`。

写回前候选包入口：

```bash
npm run textbooks:h4g-unit-candidates -- --matches /tmp/textbook_unit_standard_matches_math_h4g_pep_ocr2.json --out /tmp/h4g_unit_evidence_candidate_math_ocr2.json --summary-out /tmp/h4g_unit_evidence_candidate_math_ocr2.md --strict --require-candidates
```

当前数学候选包结果：

```json
{
  "eligible_matches": 32,
  "candidate_standards": 15,
  "missing_public_records": 0,
  "already_unit_level_records": 0,
  "by_grade_band": {
    "H4G7": 7,
    "H4G8": 3,
    "H4G9": 5
  }
}
```

该候选包仍不写 `public/data`，只把可复核的 `textbook_unit_evidence_ids`、单元标题、match score、matched fields、subdomain anchor 和建议更新字段组织出来。

## 8. 与 H4G 分化的关系

H4G 记录只有满足以下条件，才可以从文件级共享要求推进到 `textbook_unit_level` 候选证据。是否进一步标为 `grade_specific_variant`，必须依赖人工复核、真实源文本差异或更强的年级化证据，不能仅凭单一教材关键词匹配自动完成。

1. 至少有一个同学科、同年级的 `toc_unit_or_chapter` 候选。
2. 标准核心字段与候选单元/章节建立可解释匹配。
3. 匹配通过 `textbooks:audit-unit-matches -- --strict --require-matches --require-eligible`。
4. 先通过 `textbooks:h4g-unit-candidates` 生成写回前候选包。
5. 记录写入 `textbook_unit_evidence_ids`、匹配关键词、匹配分数和 rationale。
6. `grade_specific_focus` 与 `progression_delta` 基于证据生成，不直接改写课标原文。
7. `grade7_9:audit-h4g-distinctiveness -- --strict` 仍然通过。

换句话说，`volume_seed` 是任务入口；`toc_unit_or_chapter` 才是后续年级分化的候选证据。

## 9. 下一步

建议顺序：

1. 先以数学、科学为试点，因为概念链和教材单元结构最清楚。
2. 为少量教材建立稳定 PDF/OCR 缓存，避免每次依赖 GitHub 懒加载。
3. 补充页码范围、跨版本一致性和人工复核状态。
4. 设计通过复核的候选包 apply 流程，再进入正式 public 写入 gate。
