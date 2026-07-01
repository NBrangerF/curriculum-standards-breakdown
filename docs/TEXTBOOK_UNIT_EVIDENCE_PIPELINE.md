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

生成 H4G 单元证据工作清单：

```bash
npm run textbooks:plan-h4g-unit-worklist -- --strict --require-work-items
npm run textbooks:plan-h4g-unit-worklist -- --subjects math,science --out /tmp/h4g_unit_evidence_worklist_math_science.json --summary-out /tmp/h4g_unit_evidence_worklist_math_science.md --strict --require-work-items
```

该命令会合并三类事实：当前 `public/data` 中仍需单元证据的 H4G progression groups、已有候选包覆盖、以及 ChinaTextbook 中每个学科可用的完整 7/8/9 教材版本。它输出下一批应物化的 `evidence_ids` 和完整命令链，但不写 `public/data`，也不把工作项本身当作证据。

执行单个 H4G work item 的端到端 gate：

```bash
npm run textbooks:run-h4g-unit-work-item -- --work-item h4g_unit_work_math_6aec3166
npm run textbooks:run-h4g-unit-work-item -- --subject math --edition 人教版-人民教育出版社 --out-dir generated/textbook_evidence/h4g_runs/math_renjiao
```

该命令会按 worklist 中的 `evidence_ids` 串行执行：教材单元物化与 OCR fallback、真实单元索引审计、标准-单元匹配、匹配审计、H4G 候选包、候选安全审计、consistency audit、候选数据根 apply、候选根索引重建、`validate-data-indexes`、`audit-h4g-distinctiveness` 和 `audit-grade-band-policy --data-only`。默认输出到 `generated/textbook_evidence/h4g_runs/<work_item_id>/`，并写出 `run_summary.json` 与 `run_summary.md`。该 runner 仍不写 `public/data`；加 `--publication-gate` 时会把 consistency audit 升级为发布级检查，即要求跨版本、完整 progression group 和非单调页码清零。

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
| `page_start` / `page_end` / `page_range` | 目录中解析出的教材印刷页起点、推断终点和候选页段。该字段来自目录文本，不是 PDF 页码。 |
| `page_range_status` | 页段质量状态，如 `toc_page_range_inferred`、`toc_page_start_only`、`toc_page_nonmonotonic` 或 `missing`。 |
| `toc_page_source` | 起始页来源：同一行尾页码或目录标题后的独立页码行。 |
| `toc_raw_line` | 原始目录行，供人工复核页码和标题解析。 |
| `pdf_page_hint` | 目录行所在的 PDF 页码提示，和教材印刷页不同。 |
| `confidence` | 候选提取置信度。 |
| `requires_review` | 当前一律为 true，不能跳过人工/规则复核。 |

`textbook_unit_standard_matches.json` 的关键字段：

| 字段 | 说明 |
| --- | --- |
| `match_id` | 稳定匹配 ID。 |
| `standard_code` | 被匹配的 H4G standard code，必须来自 `public/data` 或 candidate data root。 |
| `unit_evidence_id` | 来源单元/章节候选 ID。 |
| `candidate_type` | 当前可作为匹配证据的类型必须是 `toc_unit_or_chapter`。 |
| `page_start` / `page_range` / `page_range_status` | 从单元候选传入的教材印刷页证据，用于 review pack 和 H4G 年级分化 gate。 |
| `score` | 0 到 1 的关键词匹配分数。 |
| `confidence_band` | `high`、`medium`、`low` 或 `below_threshold`。 |
| `matched_keywords` | 标准字段与单元标题之间的关键词交集。 |
| `matched_fields` | 关键词命中的标准字段和短摘录。 |
| `subdomain_alignment` | 单元标题是否命中标准 `subdomain` 锚点。 |
| `field_alignment` | 当 `subdomain` 是科学编号内容项且标题不逐字命中时，记录是否由强标准字段概念词命中补足。 |
| `eligible_alignment` | `subdomain_anchor`、`strong_field_alignment` 或 `none`。 |
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
2. 如果 blobless Git 物化超时或失败，默认 fallback 到 `raw.githubusercontent.com` 下载同一 commit 的 PDF。
3. 缓存到 `generated/textbook_evidence/pdf_cache/`；raw 下载超时时保留 `.part`，下次同一教材可断点续传。
4. 使用 Python `pypdf` 提取前若干页文本。
5. 从目录行或“第 X 单元/章/课”模式生成 `toc_unit_or_chapter` 候选。
6. 如显式启用 `--ocr-fallback`，当 PDF 文本层没有目录候选时，用 Apple Vision OCR 读取前若干页后再走同一套目录解析。

新增诊断参数：

| 参数 | 作用 |
| --- | --- |
| `--evidence-ids` | 精确指定 `china_textbook_index.json` 中的教材文件 ID，适合小批量复现。指定后不再按 `--max-files` 截断。 |
| `--materialize-timeout-ms` | 限制单个 PDF blob 物化时间，默认 60000ms。超时会记为 `materialize_timeout`。 |
| `--no-download-fallback` | 禁用 raw URL fallback，只使用本地 ChinaTextbook Git blob。 |
| `--download-timeout-ms` | 限制 raw URL 下载窗口，默认 180000ms。超时会记为 `raw_materialize_timeout` 并保留可续传 `.part`。 |
| `--download-retries` | raw URL 下载重试次数，默认 2。 |
| `--raw-ref` | 覆盖 raw URL 使用的 ref；默认使用 `china_textbook_index.json` 固定的 `source_commit`。 |
| `--debug-text-dir` | 保存已提取 PDF 文本，便于人工检查目录格式和改进解析规则。 |
| `--ocr-fallback` | 可选 macOS Apple Vision OCR fallback；仅在文本层没有目录候选时运行。默认关闭。 |
| `--ocr-dpi` | OCR 渲染 DPI，默认 180。 |
| `--ocr-batch-size` | OCR 分批页数，默认 4。 |
| `--ocr-languages` | OCR 语言列表，默认 `zh-Hans,en-US`。 |

注意：`--materialize`、raw URL fallback 和 `--ocr-fallback` 仍然不能作为默认质量门；它们依赖外部 GitHub 文件获取、本机 PDF 渲染和 macOS Vision OCR，只能用于小批量探索，或在后续建立稳定 PDF/OCR 缓存后再纳入严格流程。`materialize_timeout` 或 `raw_materialize_timeout` 是教材文件获取失败，不等于教材没有目录；`text_extracted` 但无目录候选通常表示需要改 parser 或进入 OCR。

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

当前 eligible 还只是候选证据，不直接写入 `public/data`。匹配脚本已经加上 alignment 门：数学等学科继续要求命中 `subdomain` 锚点，达到 score 但没有命中 `subdomain` 锚点的候选，例如 `实数` 标准匹配到 `有理数` 单元、`一次函数` 标准匹配到 `一元一次方程` 单元，会被保留为普通 match，但不会成为 `eligible_for_h4g_differentiation`。科学编号内容项允许第二通道 `strong_field_alignment`：必须是 `toc_unit_or_chapter`、medium 以上分数、命中 `standard` 字段、至少两个证据字段参与，并且有 4 个以上汉字的具体科学概念词命中。

写回前候选包入口：

```bash
npm run textbooks:h4g-unit-candidates -- --matches /tmp/textbook_unit_standard_matches_math_h4g_pep_ocr2.json --out /tmp/h4g_unit_evidence_candidate_math_ocr2.json --summary-out /tmp/h4g_unit_evidence_candidate_math_ocr2.md --strict --require-candidates
npm run textbooks:audit-h4g-unit-candidates -- --candidate /tmp/h4g_unit_evidence_candidate_math_ocr2.json --out /tmp/h4g_unit_evidence_candidate_math_ocr2_audit.json --strict --require-candidates
npm run textbooks:audit-h4g-unit-consistency -- --candidate /tmp/h4g_unit_evidence_candidate_math_ocr2.json --out /tmp/h4g_unit_evidence_consistency_math_ocr2.json --strict --require-candidates
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

该候选包仍不写 `public/data`，只把可复核的 `textbook_unit_evidence_ids`、单元标题、页段、match score、matched fields、alignment 证据和建议更新字段组织出来。`--summary-out` 生成的 Markdown 现在同时作为 review pack：逐条列出官方字段摘录、当前/建议状态、候选单元、页码状态、alignment 类型、命中字段和命中关键词，便于人工或更强规则复核。`textbooks:audit-h4g-unit-candidates` 是 apply 前 safety gate，会校验候选包仍是写回前材料、官方字段快照与 `public/data` 一致、unit evidence 是真实 `toc_unit_or_chapter`、alignment 可解释、proposed update 不包含官方课标字段。`textbooks:audit-h4g-unit-consistency` 是发布前 consistency gate，会报告每条候选的教材版本数、progression group 年级覆盖、页码状态和发布级缺口；正式发布级检查应使用 `--require-page-start --fail-on-nonmonotonic-pages --min-editions-per-standard 2 --min-editions-per-progression-group 2 --require-complete-progression-groups`。

新增 H4G worklist 当前结果：全量 9 学科共 1081 条 H4G records、400 个 progression groups 仍需单元证据，正式 `public/data` 中 `textbook_unit_level` 仍为 0。当前 ChinaTextbook 索引下，数学有 9 个完整 7/8/9 版本、科学 8 个、英语 6 个、体育 3 个、艺术 26 个，可以进入跨版本候选生成；语文和道德与法治各只有 1 个完整统编版本，不能单独证明跨版本一致；信息科技和劳动没有完整教材版本。`--subjects math,science` 试运行给出 6 个推荐 work items：数学人教版、冀教版、华东师大版；科学沪教版、华东师大版、武汉版。

## 8. 应用到候选数据根

候选包可以先应用到独立数据根，用于验证索引、审计和 UI 兼容性；默认仍不写 `public/data`：

```bash
npm run textbooks:apply-h4g-unit-candidates -- --candidate /tmp/h4g_unit_evidence_candidate_math_ocr2.json --out-data-root /tmp/h4g_unit_evidence_data_candidate_math --strict
node scripts/build-indexes.js --data-root /tmp/h4g_unit_evidence_data_candidate_math
node scripts/validate-data-indexes.js --data-root /tmp/h4g_unit_evidence_data_candidate_math
npm run grade7_9:audit-h4g-distinctiveness -- --data-root /tmp/h4g_unit_evidence_data_candidate_math --out /tmp/h4g_distinctiveness_candidate_math.json --strict
npm run grade7_9:audit-grade-band-policy -- --public-data-root /tmp/h4g_unit_evidence_data_candidate_math --staging-root generated/grade7_9_all_curated --data-only --out /tmp/h4g_grade_band_policy_candidate_math.json --strict
```

当前数学 OCR 样本 apply 结果：

```json
{
  "applied_records": 15,
  "missing_records": 0,
  "skipped_records": 0,
  "unit_evidence_objects_added": 32,
  "official_standard_text_changed": false,
  "writes_public_data": false,
  "by_grade_band": {
    "H4G7": 7,
    "H4G8": 3,
    "H4G9": 5
  }
}
```

候选根重建索引后，`validate-data-indexes`、`audit-h4g-distinctiveness --strict` 和 `audit-grade-band-policy --data-only --strict` 均通过。H4G distinctiveness 审计在候选根中识别到 15 条 `unit_level_evidence_records`；数学学科内为 15 条 `textbook_unit_level`、99 条 `textbook_file_grade_level`。对这 15 条记录与正式 `public/data` 的官方字段进行独立比对，`domain`、`subdomain`、`standard`、`context`、`practice`、`teaching_tip`、`assessment_evidence_type` 的变化数为 0。

写入策略仍然是：候选根可用于复核和展示验证；正式 `public/data` 写入必须另走人工复核/发布 gate。

同一数学人教版批次现在也已通过 `textbooks:run-h4g-unit-work-item` 自动复现，输出目录示例为：

```text
generated/textbook_evidence/h4g_runs/math_renjiao_smoke_compact/
```

runner summary 的关键指标：

```json
{
  "valid": true,
  "real_unit_or_chapter_candidates": 118,
  "matches": 106,
  "eligible_matches": 32,
  "candidates": 15,
  "unit_evidence_objects": 32,
  "applied_records": 15,
  "candidate_data_unit_level_records": 15,
  "cross_version_consistency_proven": false,
  "complete_progression_groups": false
}
```

该结果说明端到端执行 gate 已经稳定；同时也再次确认，单一人教版只能把 15 条记录推进到 review-only 单元证据候选，不能作为发布级年级分化。

### 8.1 科学浙教版诊断样本

科学学科的直接教材文件覆盖为 24 本，七、八、九年级各 8 本。当前先以浙教版六册做诊断：

- 七年级上、下册可直接物化并从文本层抽取目录。
- 八年级上、八年级下、九年级上、九年级下曾在 60 秒单册 Git blob 窗口内返回 `materialize_timeout`；加入 raw URL fallback 与 `.part` 断点续传后，六册都能稳定进入文本层目录解析。
- 该结果说明先前瓶颈主要是远端 PDF blob 获取稳定性，不是浙教版科学八、九年级教材没有目录。

浙教版六册完整诊断命令：

```bash
npm run textbooks:unit-index -- --evidence-ids ctb_4f376c0018fa,ctb_3f30c933f4d6,ctb_943ec07406e2,ctb_c4e71c26b3da,ctb_056ac74f165c,ctb_df20fdb436e6 --materialize --ocr-fallback --max-pages 16 --materialize-timeout-ms 60000 --download-timeout-ms 180000 --debug-text-dir /tmp/textbook_debug_text_science_h4g_zj_all_pages --out /tmp/textbook_unit_index_science_h4g_zj_all_pages.json --summary-out /tmp/textbook_unit_index_science_h4g_zj_all_pages.md
```

目录索引结果：

```json
{
  "textbook_files": 6,
  "unit_candidates": 175,
  "real_unit_or_chapter_candidates": 175,
  "page_start_candidates": 175,
  "page_range_candidates": 175,
  "volume_seed_candidates": 0,
  "by_page_range_status": {
    "toc_page_range_inferred": 136,
    "toc_page_nonmonotonic": 33,
    "toc_page_start_only": 6
  },
  "by_extraction_status": {
    "cached": 6
  }
}
```

进入标准匹配后的结果：

```json
{
  "standards_evaluated": 201,
  "unit_candidates_considered": 175,
  "matches": 77,
  "eligible_matches": 11,
  "candidate_standards": 11,
  "by_grade_band": {
    "H4G7": 2,
    "H4G8": 4,
    "H4G9": 5
  },
  "by_eligible_alignment": {
    "subdomain_anchor": 4,
    "strong_field_alignment": 7
  },
  "by_page_range_status": {
    "toc_page_range_inferred": 10,
    "toc_page_nonmonotonic": 1
  }
}
```

生成的 11 条科学候选为：

| standard_code | grade_band | alignment | unit | page_range | page status |
| --- | --- | --- | --- | --- | --- |
| `SC-H4G7-EVOL-010` | H4G7 | `subdomain_anchor` | `第6节 细菌和真菌的繁殖` | `43-87` | `toc_page_range_inferred` |
| `SC-H4G7-PR-001` | H4G7 | `subdomain_anchor` | `第5节 科学探究` | `34-36` | `toc_page_range_inferred` |
| `SC-H4G8-CHG-011` | H4G8 | `strong_field_alignment` | `第3节 化学方程式` | `108-114` | `toc_page_range_inferred` |
| `SC-H4G8-HOME-002` | H4G8 | `strong_field_alignment` | `第6节 光合作用` | `129-163` | `toc_page_range_inferred` |
| `SC-H4G8-HOME-008` | H4G8 | `strong_field_alignment` | `第3节 神经调节` | `121-128` | `toc_page_range_inferred` |
| `SC-H4G8-MAT-005` | H4G8 | `strong_field_alignment` | `第4节 二氧化碳` | `115-119` | `toc_page_range_inferred` |
| `SC-H4G9-ECO-003` | H4G9 | `strong_field_alignment` | `第1节 生物与环境的相互关系` | `42-78` | `toc_page_range_inferred` |
| `SC-H4G9-ECO-009` | H4G9 | `strong_field_alignment` | `第6节 健康生活` | `125` | `toc_page_nonmonotonic` |
| `SC-H4G9-ECO-012` | H4G9 | `strong_field_alignment` | `第1节 生物与环境的相互关系` | `42-78` | `toc_page_range_inferred` |
| `SC-H4G9-ENE-006` | H4G9 | `subdomain_anchor` | `第4章 可持续发展` | `120-148` | `toc_page_range_inferred` |
| `SC-H4G9-MAT-009` | H4G9 | `subdomain_anchor` | `第1节 金属材料` | `47-53` | `toc_page_range_inferred` |

候选 review pack 已生成到 `/tmp/h4g_unit_evidence_candidate_science_zj_all_pages.md`，包含 11 条逐条复核明细。新增候选包审计对 `/tmp/h4g_unit_evidence_candidate_science_zj_all_pages.json` 通过，结果为 valid true、errors 0、warnings 0；使用 `--require-page-start` 时也通过，并确认 11 条候选都带有 `page_start/page_range`。alignment 分布为 `subdomain_anchor` 4、`strong_field_alignment` 7；页码状态分布为 `toc_page_range_inferred` 10、`toc_page_nonmonotonic` 1。

新增 consistency audit 对同一候选包的结果为：普通 review gate valid true，`page_start_gate_ready: true`，但 `page_range_gate_ready: false`、`cross_version_consistency_proven: false`、`complete_progression_groups: false`。原因是 11 条候选都只来自 `浙教版-浙江教育出版社` 一个版本，其中 1 条存在 `toc_page_nonmonotonic`，且 11 个 progression group 都只覆盖了三年级中的一个年级。因此该样本已经能证明候选证据链可跑通，但不能证明可正式发布为跨版本一致的 H4G 年级分化。

这个样本证明科学浙教版 7/8/9 六册可以走通 PDF 获取、目录抽取、目录印刷页解析、标准匹配和候选包审计；也证明 H4G8 的问题主要来自过严的 `subdomain` 逐字锚点，而不是教材缺失。当前 11 条仍是候选证据，不能直接把记录标成 `grade_specific_variant`；下一步要继续做跨版本一致性、人工/规则复核，并对 `toc_page_nonmonotonic` 的页段做人工确认。

## 9. 与 H4G 分化的关系

H4G 记录只有满足以下条件，才可以从文件级共享要求推进到 `textbook_unit_level` 候选证据。是否进一步标为 `grade_specific_variant`，必须依赖人工复核、真实源文本差异或更强的年级化证据，不能仅凭单一教材关键词匹配自动完成。

1. 至少有一个同学科、同年级的 `toc_unit_or_chapter` 候选。
2. 标准核心字段与候选单元/章节建立可解释匹配。
3. 匹配通过 `textbooks:audit-unit-matches -- --strict --require-matches --require-eligible`。
4. 先通过 `textbooks:h4g-unit-candidates` 生成写回前候选包。
5. 候选包通过 `textbooks:audit-h4g-unit-candidates -- --strict --require-candidates`；当该批次声称支持 H4G 年级分化时，还应加 `--require-page-start`。
6. 候选包通过 `textbooks:audit-h4g-unit-consistency -- --strict --require-candidates --require-page-start`；正式发布级检查还应加 `--fail-on-nonmonotonic-pages --min-editions-per-standard 2 --min-editions-per-progression-group 2 --require-complete-progression-groups`。
7. 候选包 summary/review pack 逐条展示官方字段、候选单元、页段、页码状态、alignment、匹配关键词、匹配分数和 rationale。
8. `grade_specific_focus` 与 `progression_delta` 基于证据生成，不直接改写课标原文。
9. `grade7_9:audit-h4g-distinctiveness -- --strict` 仍然通过。

换句话说，`volume_seed` 是任务入口；`toc_unit_or_chapter` 才是后续年级分化的候选证据。

## 10. 下一步

建议顺序：

1. 先以数学、科学为试点，因为概念链和教材单元结构最清楚。
2. 为少量教材建立稳定 PDF/OCR 缓存，避免每次依赖 GitHub 懒加载。
3. 补充跨版本一致性、人工/规则复核状态，并复核 `toc_page_nonmonotonic` 页段。
4. 设计通过复核的候选包 apply 流程，再进入正式 public 写入 gate。
