# 教材单元证据管线

更新时间：2026-07-03

本文记录从 ChinaTextbook 教材文件索引继续推进到“单元/章节级候选证据”的当前管线。它是后续真正区分 `H4G7`、`H4G8`、`H4G9` standards 的证据入口。默认候选、复核、contract 和 decision apply 阶段仍只写 `generated/`；只有通过 reviewed publication gate 的 records 才能写入正式 `public/data`。

2026-07-03 当前正式发布状态：

- 已通过 reviewed publication gate 写入 45 条 H4G records：数学 28 条、科学 17 条。
- 年级分布为 `H4G7=14`、`H4G8=16`、`H4G9=15`。
- 这些 records 的 `review_status=unit_evidence_approved`、`evidence_granularity=textbook_unit_level`，并拥有可展示的 `grade_specific_focus`。
- 正式课标核心文本未被改写，`official_standard_text_changed=false`。
- 全量 H4G 仍是 `differentiation_ready=false`：1081 条 H4G records 中 45 条 ready，1036 条仍缺少已审核的单元级证据或年级焦点。

## 1. 目标

当前 H4G 数据已经做到：

- 正式 runtime 使用 `H4G7/H4G8/H4G9`，不再暴露单一 `H4=7-9`。
- 核心文本完全相同的三年级记录已标为 `same_source_shared`。
- 这些记录明确写入 `requires_unit_level_evidence: true` 和空的 `textbook_unit_evidence_ids`。

下一步要继续解决的是：把更多教材证据从“某本教材属于某年级”推进到“某个标准可解释地对应某个教材单元/章节”。只有完成单元级证据、人工/课程复核和 reviewed publication gate 后，才可以把对应记录标为已审核的年级化学习重点。当前仍保留 `standard_variant_type=same_source_shared`，因为官方源标准文本本身仍是 7-9 共享要求；前端通过 `grade_specific_focus` 呈现年级重点，而不是伪造新的课标原文。

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
npm run textbooks:plan-h4g-unit-worklist -- --subjects math,science --discover-candidates --out /tmp/h4g_unit_worklist_math_science_discovered.json --summary-out /tmp/h4g_unit_worklist_math_science_discovered.md --strict --require-work-items
```

该命令会合并三类事实：当前 `public/data` 中仍需单元证据的 H4G progression groups、已有候选包覆盖、以及 ChinaTextbook 中每个学科可用的完整 7/8/9 教材版本。`--candidate` 可以传入逗号分隔的候选包；`--discover-candidates` 会扫描 `generated/textbook_evidence/h4g_runs/**/h4g_unit_evidence_candidate*.json`，并用当前标准索引补齐旧候选包缺失的 `progression_group_id`。它输出下一批应物化的 `evidence_ids` 和完整命令链，但不写 `public/data`，也不把工作项本身当作证据。

2026-07-02 的 `math,science --discover-candidates` 结果：发现 22 个数学候选包，覆盖 29 条数学 standards、20 个 progression groups、3 个教材版本和 1150 个历史候选 evidence objects；数学因此不再被推荐重复整版物化，而被标记为 `candidate_evidence_partial_needs_gap_remediation`。科学仍为 0 个 candidate standards / progression groups / editions，因此 worklist 只推荐科学沪教版、华东师大版、武汉版三项跨版本单元证据工作。

2026-07-03 更新：worklist planner 不再因为某学科已有不少于 2 个候选版本就停止推荐。只有当候选 progression groups 已覆盖全部待补 groups 时才停止；否则继续推荐完整 7/8/9 教材版本，并优先把尚未进入候选包的版本排在前面。当前科学已有浙教版+沪教版候选后，`math,science --discover-candidates` 仍有效，并把科学后续工作项排为华东师大版、武汉版、人教版；科学当前候选覆盖为 12 个 standards / 12 个 progression groups / 2 个 editions，仍是 `candidate_evidence_partial_needs_gap_remediation`。

执行单个 H4G work item 的端到端 gate：

```bash
npm run textbooks:run-h4g-unit-work-item -- --work-item h4g_unit_work_math_6aec3166
npm run textbooks:run-h4g-unit-work-item -- --subject math --edition 人教版-人民教育出版社 --out-dir generated/textbook_evidence/h4g_runs/math_renjiao
```

该命令会按 worklist 中的 `evidence_ids` 串行执行：教材单元物化与 OCR fallback、真实单元索引审计、标准-单元匹配、匹配审计、H4G 候选包、候选安全审计、consistency audit、候选数据根 apply、候选根索引重建、`validate-data-indexes`、`audit-h4g-distinctiveness` 和 `audit-grade-band-policy --data-only`。默认输出到 `generated/textbook_evidence/h4g_runs/<work_item_id>/`，并写出 `run_summary.json` 与 `run_summary.md`。该 runner 仍不写 `public/data`；加 `--publication-gate` 时会把 consistency audit 升级为发布级检查，即要求跨版本、完整 progression group 和非单调页码清零。

合并多个版本的 H4G 单元证据候选：

```bash
npm run textbooks:combine-h4g-unit-candidates -- \
  --candidates generated/textbook_evidence/h4g_runs/math_renjiao_smoke/h4g_unit_evidence_candidate.json,generated/textbook_evidence/h4g_runs/math_jijiao_smoke/h4g_unit_evidence_candidate.json \
  --out generated/textbook_evidence/h4g_runs/math_multi_edition_review/h4g_unit_evidence_candidate.json \
  --summary-out generated/textbook_evidence/h4g_runs/math_multi_edition_review/h4g_unit_evidence_candidate_summary.md \
  --strict \
  --require-candidates
```

如果要生成可进入发布前复核的 page-clean 候选，必须使用：

```bash
npm run textbooks:combine-h4g-unit-candidates -- \
  --candidates generated/textbook_evidence/h4g_runs/math_renjiao_smoke/h4g_unit_evidence_candidate.json,generated/textbook_evidence/h4g_runs/math_jijiao_smoke/h4g_unit_evidence_candidate.json,generated/textbook_evidence/h4g_runs/math_huadong_smoke/h4g_unit_evidence_candidate.json \
  --out generated/textbook_evidence/h4g_runs/math_three_edition_page_clean/h4g_unit_evidence_candidate.json \
  --summary-out generated/textbook_evidence/h4g_runs/math_three_edition_page_clean/h4g_unit_evidence_candidate_summary.md \
  --strict \
  --require-candidates \
  --publication-page-gate
```

`--publication-page-gate` 等价于合并阶段要求 page start，并排除 `toc_page_nonmonotonic` 证据。它只解决页码质量门，不代表候选可以发布；发布级一致性仍需另跑：

```bash
npm run textbooks:audit-h4g-unit-consistency -- \
  --candidate generated/textbook_evidence/h4g_runs/math_three_edition_page_clean/h4g_unit_evidence_candidate.json \
  --require-candidates \
  --require-page-start \
  --fail-on-nonmonotonic-pages \
  --min-editions-per-standard 2 \
  --min-editions-per-progression-group 2 \
  --require-complete-progression-groups
```

该命令允许在非 strict 模式下生成失败报告；只有 `valid: true` 时，候选才满足发布级跨版本与完整进阶组要求。

反向检索 H4G 发布缺口：

```bash
npm run textbooks:audit-h4g-reverse-gaps
```

该命令默认读取数学三版本 `alignment_alias_page_clean` 候选包，以及人教版、冀教版、华东师大版三套带标准级 alias 的标准-单元匹配结果，输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_reverse_lookup_gaps.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_reverse_lookup_gaps.md
```

它不写 `public/data`，只把 publication gate 失败拆成可执行原因：已有可用匹配但未打包、目录页码缺失、alignment gate 未通过、低分/疑似错年级、当前 top matches 没有返回候选。`near_miss_actions` 统计的是低于版本门槛 standards 的缺失版本；progression group 的缺失年级另在 `progression_group_gaps` 中展开。

2026-07-03 后，该报告还输出 targeted remediation 视图：

- `no_candidate_progression_group_gaps`：正式 H4G progression group 需要单元证据，但当前候选包完全没有覆盖。
- `remediation_work_items`：按 `standard_below_min_editions`、`fill_missing_grade_slot`、`no_candidate_progression_group` 三类生成可排序工作项。
- `remediation_actions`：把每个工作项归入 `recover_page_start`、`review_alignment_or_alias`、`low_score_or_wrong_grade`、`no_match_returned` 等最小修复动作。
- `alias_review`：对 `review_alignment_or_alias` 工作项进一步标出泛词/目录噪声、需回源复核、或可进入标准级 alias 复核的状态。

这层输出用于决定下一批具体复核/解析/alias 任务，不代表候选可以发布，也不能直接写入 `textbook_unit_evidence_ids`。

示例：对科学八版本候选包运行 reverse gap，可显式传入当前科学各批次的 matches：

```bash
npm run textbooks:audit-h4g-reverse-gaps -- \
  --subject science \
  --candidate generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_unit_evidence_candidate.json \
  --matches generated/textbook_evidence/h4g_runs/science_beijing_discipline_unit_review/textbook_unit_standard_matches.json,generated/textbook_evidence/h4g_runs/science_huadong_page_clean_unit_review/textbook_unit_standard_matches.json,generated/textbook_evidence/h4g_runs/science_hujiao_full_unit_review/textbook_unit_standard_matches.json,generated/textbook_evidence/h4g_runs/science_kepu_adjacent_unit_review/textbook_unit_standard_matches.json,generated/textbook_evidence/h4g_runs/science_renjiao_discipline_unit_review/textbook_unit_standard_matches.json,generated/textbook_evidence/h4g_runs/science_suke_discipline_unit_review/textbook_unit_standard_matches.json,generated/textbook_evidence/h4g_runs/science_wuhan_unit_review/textbook_unit_standard_matches.json,generated/textbook_evidence/h4g_runs/science_zj_unit_review/textbook_unit_standard_matches.json \
  --out generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_reverse_lookup_gaps.json \
  --summary-out generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_reverse_lookup_gaps.md \
  --min-editions-per-standard 2 \
  --min-editions-per-progression-group 2
```

生成 H4G alias 回源复核包：

```bash
npm run textbooks:h4g-alias-source-review -- --strict --require-items
```

该命令默认读取科学八版本 reverse gap 报告，并只抽取 `alias_review.status = needs_source_review` 的工作项，输出：

```text
generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_alias_source_review_packet.json
generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_alias_source_review_packet.md
```

它会把每个待复核项补齐到可审粒度：目标 standard、同一 progression group 的 H4G7/H4G8/H4G9 原文、当前进阶差异状态、候选教材单元、页码、alignment gap、具体/泛化关键词、以及下一步 source review gate。该包不写 `public/data`，不新增 alias，也不改变官方标准文本。

跨版本年级投放矩阵：

```bash
npm run textbooks:audit-h4g-topic-placement -- --strict --require-hits
```

该命令默认读取数学三版本单元索引、最新 reverse gap 报告和标准级 alias 文件，输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_topic_placement_matrix.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_topic_placement_matrix.md
```

它不写 `public/data`，只诊断同一主题在不同教材版本中的 7/8/9 年级投放位置。`review_cross_grade_placement` 表示缺失版本并非没有相关主题，而是该主题出现在另一个年级；这类结果不能自动当作 same-grade standard 证据，需要单独决定 progression model 或 publication gate 如何处理跨版本年级差异。

生成 H4G 年级投放差异候选包：

```bash
npm run textbooks:h4g-placement-candidates -- --strict --require-candidates
npm run textbooks:audit-h4g-placement-candidates -- --strict --require-candidates --require-cross-grade-evidence
```

该命令默认读取上一步 topic placement matrix，输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_placement_evidence_candidate.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_placement_evidence_candidate.md
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_placement_evidence_candidate_audit.json
```

它把 `review_cross_grade_placement` 的 standards 按 `progression_group_id` 汇总成 review pack。候选包会同时列出 same-grade units 和 cross-grade units，但它仍是诊断材料：`candidate_type=edition_topic_placement_candidate`、`evidence_granularity=textbook_topic_placement_diagnostic`，并显式声明 `writes_public_data=false`、`writes_textbook_unit_evidence_ids=false`。cross-grade units 只能解释“某个版本把同一主题放在另一个年级”，不能写入某条同年级 standard 的 `textbook_unit_evidence_ids`。

生成 H4G progression 发布前决策矩阵：

```bash
npm run textbooks:h4g-progression-decisions -- --strict --max-unresolved-gaps 1
```

该命令默认合并数学三版本的同年级单元候选包、consistency audit、reverse gap 报告和 placement 候选包，输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_decision_matrix.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_decision_matrix.md
```

它把每条数学 H4G standard 分成四类：`same_grade_unit_candidate_ready`、`edition_placement_review`、`continue_gap_remediation` 和 `not_in_current_unit_candidate_scope`。这一步仍不写 `public/data`，也不把候选证据转成 `textbook_unit_evidence_ids`；它只是把“同年级证据可进入人工发布复核”和“跨版本投放差异需要 progression model 决策”放到同一张矩阵里。

生成 ready-only H4G 单元证据候选包：

```bash
npm run textbooks:h4g-ready-unit-candidates -- --strict --require-candidates
npm run textbooks:audit-h4g-unit-candidates -- \
  --candidate generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate_ready_only.json \
  --out generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate_ready_only_audit.json \
  --strict \
  --require-candidates \
  --require-page-start
npm run textbooks:audit-h4g-unit-consistency -- \
  --candidate generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate_ready_only.json \
  --out generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_consistency_ready_only_audit.json \
  --strict \
  --require-candidates \
  --require-page-start \
  --fail-on-nonmonotonic-pages \
  --min-editions-per-standard 2 \
  --min-editions-per-progression-group 2
```

该命令只保留 decision matrix 中的 `same_grade_unit_candidate_ready` standards，自动排除 `edition_placement_review` 和 `continue_gap_remediation`。当前数学结果为 19 条 standards、87 个单元证据对象、0 条单版本 standards、0 条缺页码、0 条非单调页码。它仍是写回前候选包，只能先应用到隔离数据根做 QA。

生成 H4G progression 复核工作清单：

```bash
npm run textbooks:h4g-progression-review-worklist -- --strict --require-work-items
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_review_worklist.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_review_worklist.md
```

该命令专门处理 ready-only 排除掉的 standards。当前数学结果为 7 个 work items、10 条 affected standards：其中 6 个 `edition_placement_model_review` work items 覆盖 9 条 standards，1 个 `same_grade_gap_remediation` work item 覆盖 `MA-H4G7-QUAL-004`。它把 44 个 cross-grade diagnostic units 和 27 个 same-grade diagnostic units 放在同一复核入口里，但仍明确 `writes_public_data=false`、`writes_textbook_unit_evidence_ids=false`、`publication_candidate=false`。

同一个 progression group 可以同时含有 `edition_placement_review` 和 `continue_gap_remediation` standards；worklist 必须按标准级 decision 分别生成 placement item 与 gap item，不能让 group 级 `group_decision` 单选标签吞掉其中一类。例如科学 `science-4b1d1f03f15d52` 中，`SC-H4G7-CHG-001` 进入同年级缺口补证，`SC-H4G8-CHG-002` 进入跨版本投放复核。

`same_grade_gap_remediation` 现在会生成 `remediation_analysis`。当前唯一缺口 `MA-H4G7-QUAL-004` 的结论是 `keep_blocked_no_safe_same_grade_remediation`：它属于 `学业质量/综合表现` 宽口径标准，只有人教版一个同年级单元候选；冀教版只有低分或错向候选，华东师大版无候选。因此当前不能加 reviewed alias、不能发布，也不应把低分泛词命中升级成同年级单元证据。

生成 H4G 版本投放模型候选：

```bash
npm run textbooks:h4g-edition-placement-model -- --strict --require-candidates
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_edition_placement_model_candidate.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_edition_placement_model_candidate.md
```

该命令只读取 `edition_placement_model_review` work items，把跨版本、跨年级教材单元位置整理成 progression group 级模型候选。当前数学结果为 6 个 candidates、9 条 affected standards、19 条 cross-grade diagnostic relations；其中 5 个为 `candidate_for_edition_placement_note`，1 个为 `partial_edition_placement_evidence_needs_more_review`。它仍是课程进阶复核输入，不写 `public/data`、不写 `textbook_unit_evidence_ids`、不改课标原文，也不生成可 apply 的 `proposed_update`。

当前唯一 partial candidate 是 `math-76edb58e7a55e4`（旋转与中心对称）：`MA-H4G8-GEO-026` 和 `MA-H4G9-GEO-027` 的华东师大版 missing edition 仍缺 cross-grade topic 解释，因此应继续保留 review/block 状态，不能直接转成版本投放说明。

`candidate_for_edition_placement_note` 只允许来自完整的 multi-grade placement evidence；如果只有单向 cross-grade 诊断证据，或仍有 missing editions 没有 cross-grade topic 解释，必须保持 `partial_edition_placement_evidence_needs_more_review`。科学八版本当前 13 个 placement model candidates 全部为 partial，因此不能生成 progression note draft。

生成 H4G blocked remediation 行动包：

```bash
npm run textbooks:h4g-blocked-remediation-packet -- --strict --require-items
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_blocked_remediation_packet.json
generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_blocked_remediation_packet.md
```

该命令把 progression worklist、reverse gaps、alias source review packet 和 edition placement model candidate 合并成 blocker 级行动清单。它不会生成 publication candidate，也不会写 `public/data`、`textbook_unit_evidence_ids` 或官方课标文本；cross-grade evidence 继续只能作为诊断，same-grade gap 只能通过 source-reviewed、standard-scoped evidence 补救。

当前科学八版本结果为 25 个 remediation items，覆盖 32 条 affected standards：12 个 `edition_placement_model_review` 和 13 个 `same_grade_gap_remediation`。其中 7 个为 high priority，18 个为 medium priority；12 个归 `curriculum_progression_review`，13 个归 `unit_evidence_remediation`。action family 分布为：`placement_partial_single_direction_review=1`、`placement_partial_source_review_before_note=5`、`placement_partial_collect_missing_edition_evidence=6`、`same_grade_gap_keep_blocked_no_safe_alias=1`、`same_grade_gap_collect_missing_edition_units=12`。`SC-H4G9-ECO-006` 与 `SC-H4G9-ENE-003` 已分别通过标准级、版本级、单元标题级受限 alias 从 source-review blocker 推进为 ready same-grade evidence，因此不再出现在 source-review blocker 路径中。

生成 H4G 发布前复核包：

```bash
npm run textbooks:h4g-publication-review -- --strict --require-ready --require-edition-notes
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_review_packet.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_review_packet.md
```

该命令把三类结果合并到同一个只读复核包中，但保持 publication surface 分离：

| layer | 当前数量 | 后续可能的 publication surface |
| --- | ---: | --- |
| `same_grade_unit_evidence_review` | 19 条 standards / 87 个单元证据对象 | `standard.textbook_unit_evidence_ids`，仅限人工复核后同年级证据写入。 |
| `progression_group_edition_placement_note_review` | 5 个 progression groups / 7 条 affected standards | `progression_group_edition_placement_note`，仅限课程进阶复核后表达版本投放差异。 |
| `blocked_or_partial_review` | 2 个 blocked reviews / 3 条 affected standards | 暂无 publication surface，先继续补证据或模型复核。 |

这一步解决的是“如何把可复核材料分层交付”，不是正式发布。它的 policy 明确 `writes_public_data=false`、`writes_standard_records=false`、`writes_textbook_unit_evidence_ids=false`，并强制 `separates_same_grade_unit_evidence_from_edition_placement_notes=true`。当前仍有 85 条数学 H4G standards 不在三版本单元候选范围内，不能因为 19 条 ready 或 5 个 note candidates 就声称数学 H4G 已整体完成分化。

生成 H4G 发布数据契约候选：

```bash
npm run textbooks:h4g-publication-contract -- --strict --require-ready-surface --require-edition-note-surface
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_contract_candidate.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_contract_candidate.md
```

该命令从 publication review packet 生成未来 public 数据契约候选，而不是执行迁移。当前结果：

```json
{
  "standard_unit_evidence_contracts": 19,
  "edition_placement_note_contracts": 5,
  "blocked_registry_contracts": 2,
  "candidate_unit_evidence_objects": 87,
  "not_in_current_unit_candidate_scope": 85
}
```

contract candidate 定义三类 surface：

| surface | grain | 当前状态 | 关键边界 |
| --- | --- | --- | --- |
| `standard_same_grade_unit_evidence` | `standard_code` | candidate contract only | 只允许写入 `textbook_evidence_ids`、`textbook_unit_evidence_ids`、`evidence_granularity`、`progression_*`、`grade_specific_focus` 等证据/复核字段；`domain/subdomain/standard/context/practice/teaching_tip/assessment_evidence_type` 不可改。 |
| `progression_group_edition_placement_note` | `progression_group_id` | candidate contract only | 建议未来使用独立 progression-group note collection 表达版本投放差异；不得写入 same-grade `textbook_unit_evidence_ids`。 |
| `blocked_review_registry` | `review_id` | blocked | 只留在 generated 复核层，暂时没有 public publication surface。 |

因此这一步把“未来怎么写”变成可检查的契约，但仍不写 `public/data`、不改 frontend schema、不把任何 record 标成 `grade_specific_variant`。如果后续要进入正式写入，应先让该 contract candidate 过人工/课程进阶复核，再设计实际 migration 和 UI 消费。

将 H4G 发布数据契约应用到隔离候选根：

```bash
npm run textbooks:apply-h4g-publication-contract -- --strict
```

默认输出到：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_publication_contract/
```

该命令会复制 `public/data` 到 generated 候选根，然后只对 contract 中的 `standard_same_grade_unit_evidence` records 写入白名单证据字段，并额外生成 `h4g_progression_notes.json` 作为 progression group 版本投放说明候选 collection。当前 dry-run 结果为 19 条 applied、0 条 missing、87 个单元证据对象、5 条 note candidates、2 个 blocked registry contracts；`official_standard_text_changed: false`、`writes_public_data: false`。这仍不是正式迁移：候选根用于索引、H4G distinctiveness 和 grade-band policy 审计，不会被当前网站 runtime 读取，也不会把任何 record 自动改成 `grade_specific_variant`。

审计 H4G 发布准备度：

```bash
npm run textbooks:audit-h4g-publication-readiness -- --strict
```

默认输出：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_readiness_audit.json
generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_readiness_audit.md
```

该 gate 会把 publication review packet、contract candidate、apply summary、candidate data root、`h4g_progression_notes.json` 和 blocked registry 放在一起检查。当前审计 `valid=true`、`manual_review_ready=true`，但仍明确 `publication_ready=false`、`public_migration_ready=false`。阻塞原因包括：19 条同年级单元证据尚未有人工复核记录、5 条 progression notes 尚未有课程进阶复核、progression-group note collection 尚未完成 schema/UI 消费设计、正式 public migration gate 仍未建立、85 条数学 H4G standards 不在当前单元候选范围内、2 个 blocked reviews 没有 public surface。

生成 H4G 人工/课程复核决策模板：

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

当前模板包含 24 个必需人工/课程决策：19 个 `standard_same_grade_unit_evidence`、5 个 `progression_group_edition_placement_note`，另有 2 个 `blocked_review_registry` guardrail 决策。默认全部为 `pending`，所以审计结果是 `valid=true`、`manual_review_complete=false`、`publication_ready=false`。如果后续真实复核完成，应使用 `textbooks:audit-h4g-publication-review-decisions -- --strict --require-complete` 作为更强门禁；即便全部通过，仍需单独 public migration gate 才能写正式数据。

带 `--require-review-decisions-audit` 复跑 readiness audit 后，当前 readiness summary 会显式包含 `review_decisions_audit_present=true`、`review_decisions_required_manual_decisions=24`、`review_decisions_pending_required_decisions=24`、`manual_review_complete=false`。这一步把复核决策文件接入发布准备度主链路，但仍保持 `publication_ready=false`。

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
| `alias_alignment` | 标准级、已复核 alias 是否命中；只来自 `scripts/textbooks/textbook_unit_alignment_aliases.json`，不能当作全局同义词。 |
| `field_alignment` | 当 `subdomain` 是科学编号内容项且标题不逐字命中时，记录是否由强标准字段概念词命中补足。 |
| `subject_theme_bridge_alignment` | 当 approved subject-theme bridge registry 命中时，记录 bridge id、source decision、matched topic tags 和 page readiness。 |
| `eligible_alignment` | `subdomain_anchor`、`reviewed_alias_anchor`、`strong_field_alignment`、`reviewed_subject_theme_bridge` 或 `none`。 |
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
2. 如果 blobless Git 物化超时或失败，默认先通过 GitHub `git/blobs/<sha>` API 请求 raw PDF 内容。
3. 如果 GitHub API raw 路径失败或超时，再 fallback 到 `raw.githubusercontent.com` 下载同一 commit 的 PDF。
4. 缓存到 `generated/textbook_evidence/pdf_cache/`；API/raw 下载超时时分别保留 `.api.part` 或 `.part`，下次同一教材可断点续传。
5. 使用 Python `pypdf` 提取前若干页文本。
6. 从目录行或“第 X 单元/章/课”模式生成 `toc_unit_or_chapter` 候选。
7. 如显式启用 `--ocr-fallback`，当 PDF 文本层没有目录候选时，用 Apple Vision OCR 读取前若干页后再走同一套目录解析。

新增诊断参数：

| 参数 | 作用 |
| --- | --- |
| `--evidence-ids` | 精确指定 `china_textbook_index.json` 中的教材文件 ID，适合小批量复现。指定后不再按 `--max-files` 截断。 |
| `--materialize-timeout-ms` | 限制单个 PDF blob 物化时间，默认 60000ms。超时会记为 `materialize_timeout`。 |
| `--no-download-fallback` | 禁用 GitHub API raw 与 raw URL fallback，只使用本地 ChinaTextbook Git blob。 |
| `--download-timeout-ms` | 限制 GitHub API raw/raw URL 下载窗口，默认 180000ms。API 超时会记为 `api_raw_materialize_timeout` 并保留 `.api.part`，随后继续尝试 raw URL；raw URL 超时会记为 `raw_materialize_timeout` 并保留 `.part`。两个 curl fallback 现在都有 Node 外层 timeout，避免子进程悬挂。 |
| `--download-retries` | GitHub API raw/raw URL 下载重试次数，默认 2。 |
| `--raw-ref` | 覆盖远端下载使用的 ref；默认使用 `china_textbook_index.json` 固定的 `source_commit`。 |
| `--debug-text-dir` | 保存已提取 PDF 文本，便于人工检查目录格式和改进解析规则。 |
| `--ocr-fallback` | 可选 macOS Apple Vision OCR fallback；仅在文本层没有目录候选时运行。默认关闭。 |
| `--ocr-dpi` | OCR 渲染 DPI，默认 180。 |
| `--ocr-batch-size` | OCR 分批页数，默认 4。 |
| `--ocr-languages` | OCR 语言列表，默认 `zh-Hans,en-US`。 |
| `--page-start-overrides` | 指定已复核的目录页码补证据文件，默认读取 `scripts/textbooks/textbook_unit_page_start_overrides.json`。 |
| `--no-page-start-overrides` | 关闭页码补证据，只看 parser/OCR 本身能抽出的目录页码。 |

注意：`--materialize`、GitHub API raw/raw URL fallback 和 `--ocr-fallback` 仍然不能作为默认质量门；它们依赖外部 GitHub 文件获取、本机 PDF 渲染和 macOS Vision OCR，只能用于小批量探索，或在后续建立稳定 PDF/OCR 缓存后再纳入严格流程。`materialize_timeout`、`api_raw_materialize_timeout` 或 `raw_materialize_timeout` 是教材文件获取失败，不等于教材没有目录；`text_extracted` 但无目录候选通常表示需要改 parser 或进入 OCR。

页码补证据只允许附着到已经存在的 `toc_unit_or_chapter` 候选，不能新增教材单元，也不能改写课标字段。每条 override 必须记录 `textbook_evidence_id`、`unit_title`、`page_start`、`source`、`review_status` 和正文 OCR/页脚等 provenance；生成结果会把 `page_start_override` 传入 unit index、standard matches 和 H4G candidate review pack。

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

当前 eligible 还只是候选证据，不直接写入 `public/data`。匹配脚本已经加上 alignment 门：数学等学科默认要求命中 `subdomain` 锚点；达到 score 但没有命中 `subdomain` 锚点的候选，例如 `实数` 标准匹配到 `有理数` 单元、`一次函数` 标准匹配到 `一元一次方程` 单元，会被保留为普通 match，但不会成为 `eligible_for_h4g_differentiation`。只有写入 `scripts/textbooks/textbook_unit_alignment_aliases.json` 的标准级已复核 alias 可以作为 `reviewed_alias_anchor` 局部例外。科学编号内容项允许第二通道 `strong_field_alignment`：必须是 `toc_unit_or_chapter`、medium 以上分数、命中 `standard` 字段、至少两个证据字段参与，并且有 4 个以上汉字的具体科学概念词命中。

2026-07-03 证据清洗更新：标准-单元匹配不再把 `textbook_subject` 当作单元 token，并把 `目录`、`科学`、`化学`、`物理`、`生物`、`地理` 等学科/噪声词纳入 stop tokens；读取单元候选时也会过滤空标题或 `目录` 标题。`textbooks:audit-unit-matches -- --strict` 现在会阻止空/目录标题，以及“高置信但只命中泛学科词”的 match 回归。科学八版本复跑后，8 个 match 文件合计 405 条 matches、76 条 eligible matches、`generic_only_high_confidence_matches=0`、`noise_title_matches=0`。

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

2026-07-03 科学八版本候选根执行结果：

```bash
npm run textbooks:apply-h4g-unit-candidates -- --candidate generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_unit_evidence_candidate.json --out-data-root generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_unit_evidence_data_candidate --strict
node scripts/build-indexes.js --data-root generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_unit_evidence_data_candidate
node scripts/validate-data-indexes.js --data-root generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_unit_evidence_data_candidate
npm run grade7_9:audit-h4g-grade-differentiation -- --data-root generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_unit_evidence_data_candidate
```

```json
{
  "candidate_standards": 46,
  "unit_evidence_objects": 69,
  "applied_records": 46,
  "official_standard_text_changed": false,
  "writes_public_data": false,
  "candidate_grade_focus_records": 46,
  "candidate_ready_groups": 3,
  "final_ready_records": 0
}
```

该候选根使科学 46 条 H4G records 从占位状态推进到 `candidate_needs_review`，但仍保留 `standard_variant_type: "same_source_shared"`，不把候选 focus 当作官方课标文本，也不标记为最终发布 ready。

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

浙教版六册持久复跑命令：

```bash
npm run textbooks:unit-index -- --evidence-ids ctb_4f376c0018fa,ctb_3f30c933f4d6,ctb_943ec07406e2,ctb_c4e71c26b3da,ctb_056ac74f165c,ctb_df20fdb436e6 --materialize --ocr-fallback --max-pages 16 --materialize-timeout-ms 60000 --download-timeout-ms 180000 --debug-text-dir generated/textbook_evidence/h4g_runs/science_zj_unit_review/debug_text --out generated/textbook_evidence/h4g_runs/science_zj_unit_review/textbook_unit_index.json --summary-out generated/textbook_evidence/h4g_runs/science_zj_unit_review/textbook_unit_index_summary.md
```

2026-07-03 复跑时发现浙教版科学目录文本采用“标题块 + 独立页码块”格式：目录页先列出多个章节标题，再在页面下方集中列出页码。`build_textbook_unit_index.js` 现在只在明显目录页块中绑定这类页码，即同一 PDF 页至少有 5 个目录候选和 5 个独立页码行；绑定后仍交给 `page_range_status` 和 consistency audit 判断是否存在非单调页码风险。

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
    "toc_page_range_inferred": 163,
    "toc_page_nonmonotonic": 1,
    "toc_page_start_only": 11
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
    "toc_page_range_inferred": 11
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
| `SC-H4G9-ECO-003` | H4G9 | `strong_field_alignment` | `第1节 生物与环境的相互关系` | `42-46` | `toc_page_range_inferred` |
| `SC-H4G9-ECO-009` | H4G9 | `strong_field_alignment` | `第6节 健康生活` | `125-134` | `toc_page_range_inferred` |
| `SC-H4G9-ECO-012` | H4G9 | `strong_field_alignment` | `第1节 生物与环境的相互关系` | `42-46` | `toc_page_range_inferred` |
| `SC-H4G9-ENE-006` | H4G9 | `subdomain_anchor` | `第4章 可持续发展` | `120-124` | `toc_page_range_inferred` |
| `SC-H4G9-MAT-009` | H4G9 | `subdomain_anchor` | `第1节 金属材料` | `47-53` | `toc_page_range_inferred` |

候选 review pack 已生成到 `generated/textbook_evidence/h4g_runs/science_zj_unit_review/h4g_unit_evidence_candidate_summary.md` 和 `h4g_unit_evidence_candidate.json`，包含 11 条逐条复核明细。候选包审计对 `generated/textbook_evidence/h4g_runs/science_zj_unit_review/h4g_unit_evidence_candidate.json` 通过，结果为 valid true、errors 0、warnings 0；使用 `--require-page-start` 时也通过，并确认 11 条候选都带有 `page_start/page_range`。alignment 分布为 `subdomain_anchor` 4、`strong_field_alignment` 7；页码状态分布为 `toc_page_range_inferred` 11。

新增 consistency audit 对同一候选包的结果为：普通 review gate valid true，`page_start_gate_ready: true`、`page_range_gate_ready: true`，但 `cross_version_consistency_proven: false`、`complete_progression_groups: false`。原因是 11 条候选都只来自 `浙教版-浙江教育出版社` 一个版本，且 11 个 progression group 都只覆盖了三年级中的一个年级。因此该样本已经能证明候选证据链可跑通，但不能证明可正式发布为跨版本一致的 H4G 年级分化。

这个样本证明科学浙教版 7/8/9 六册可以走通 PDF 获取、目录抽取、目录印刷页解析、标准匹配和候选包审计；也证明 H4G8 的问题主要来自过严的 `subdomain` 逐字锚点，而不是教材缺失。当前 11 条仍是候选证据，不能直接把记录标成 `grade_specific_variant`；下一步要继续做跨版本一致性，并用科学沪教版、华东师大版、武汉版等版本补第二版本证据。

2026-07-02 追加科学 worklist 诊断：`textbooks:plan-h4g-unit-worklist -- --subjects science` 识别到 201 条科学 H4G records、67 个完整同文三元 progression groups，推荐优先跑沪教版、华东师大版和武汉版三个完整 7/8/9 教材版本。华东师大版完整 work item 在物化阶段长时间等待，因此先缩小到单册 `ctb_538ade3b02d2`（七年级上册）做 PDF 获取诊断。

单册诊断结论：

```json
{
  "evidence_id": "ctb_538ade3b02d2",
  "edition": "华东师大版-华东师范大学出版社",
  "grade_label": "七年级",
  "volume": "上册",
  "repository_path": "初中/科学/华东师大版-华东师范大学出版社/七年级/义务教育教科书·科学七年级上册.pdf",
  "git_object": "f190241204289ba7fd4fd436630575d6140e4832",
  "extraction_status": "api_raw_materialize_timeout",
  "materialize_duration_ms": 20021,
  "materialize_api_partial_bytes": 814903
}
```

该结果说明本轮卡点仍在外部 PDF 物化：`api.github.com` 的 raw blob 路径可开始传输并保留 `.api.part`，但在 20 秒窗口内未完成 27MB PDF 下载；partial bytes 会随网络窗口变化。脚本现在会把这种状态明确记录为 `api_raw_materialize_timeout`，并继续尝试 raw URL fallback。后续科学批量运行应优先复用已缓存 PDF，或先用 `textbooks:prefetch-h4g-pdfs` 分批补齐 PDF cache；不能把该状态解释为科学课标没有教材单元依据。

2026-07-03 追加科学沪教版诊断：

- `textbooks:prefetch-h4g-pdfs --work-item h4g_unit_work_science_2e916100` 在固定 raw IP 轮换下先缓存 4/8 本，2 本 partial、2 本 missing；改用 `--raw-ips ""` 走系统 DNS 后，又补齐 3 本，最终 7/8 本完整缓存。
- 唯一未完整的是 `ctb_f7198c2bcad8`（沪教版化学九年级下册），已续传到 41,737,693 bytes，但距离 44,714,543 bytes 仍差约 3MB，暂不作为可用证据。
- 用已缓存的 7 本沪教版教材运行 `textbooks:unit-index --no-download-fallback --materialize-timeout-ms 1000`，结果为 7 个教材文件、34 个真实单元/章节、32 个 page start、32 个 page range。
- `textbooks:match-units --subjects science` 得到 19 个 matches、2 个 eligible matches；H4G 候选包得到 2 条候选，均为 H4G9：`SC-H4G9-CHG-009` 和 `SC-H4G9-ECO-009`，页码状态均为 `toc_page_range_inferred`。
- 将沪教版候选与浙教版候选合并后，科学共有 12 条候选 standards、13 个 unit evidence objects、H4G7 2 条、H4G8 4 条、H4G9 6 条；其中 `SC-H4G9-ECO-009` 已有浙教版+沪教版双版本证据。发布级 gate 仍为 false，因为 11 条 standards 仍低于 2 个版本，所有 12 个 progression groups 仍未覆盖完整 H4G7/H4G8/H4G9。

### 8.2 数学三版本 page-clean 候选

2026-07-02 追加完成数学华东师大版 7/8/9 六册运行，并与既有人教版、冀教版合并成三版本 page-clean 候选。

华东师大版单版本运行结果：

```json
{
  "textbook_files": 6,
  "unit_candidates": 112,
  "matches": 110,
  "eligible_matches": 24,
  "candidates": 15,
  "unit_evidence_objects": 22,
  "by_grade_band": {
    "H4G7": 3,
    "H4G8": 7,
    "H4G9": 5
  }
}
```

三版本 page-clean 合并结果：

```json
{
  "source_files": 3,
  "input_candidates": 51,
  "input_unit_evidence_objects": 107,
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

候选安全审计：

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

review-only consistency audit：

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

publication gate 仍失败：

```json
{
  "valid": false,
  "standards_below_min_editions": 10,
  "complete_progression_group_candidates": 1,
  "partial_progression_group_candidates": 17,
  "progression_groups_below_min_editions": 5,
  "nonmonotonic_page_records": 0
}
```

候选已应用到隔离数据根：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_page_clean/data_candidate
```

该候选根已通过索引校验、H4G distinctiveness audit 和 grade-band policy audit；但由于仍有 10 个 standards 低于两版本门槛、17 个 progression groups 不完整，它仍不能直接写入 `public/data`。下一轮数学修复优先从两处入手：

1. 复核本轮被排除的 33 条 `toc_page_nonmonotonic` 证据，判断是否是目录解析问题，优先补上当前单版本 standards 的第二版本证据。
2. 对不完整 progression groups 做缺失年级反向检索，区分“教材确实没有对应单元”和“同义标题、目录解析或匹配锚点导致漏召回”。

### 8.3 数学目录页码 parser 修复复跑

对三版本 page-clean 候选中的 33 条排除证据做数据质量检查后，发现一类稳定 parser 问题：OCR 会把目录页码拆成空格分隔数字，旧逻辑只读取最后一个数字，导致真实印刷页 `58` 被解析成 `8`、`28` 被解析成 `8`。另一个风险是同一目录行包含主单元和附属栏目时，旧逻辑可能把附属栏目页码绑定到主单元。

已在 `scripts/textbooks/build_textbook_unit_index.js` 中修复：

- `parsedPrintedPage` 支持 `5 8`、`2 8` 这类空格分隔页码，并继续拒绝非 1-3 位数字。
- `parseInlineTocPageTail` 优先绑定“主标题后的第一个页码”，遇到 `阅读与思考`、`实验与探究`、`观察与猜想`、`信息技术应用`、`数学活动`、`小结`、`复习题` 等附属栏目时不再用最后页码覆盖主单元。

复跑目录 probe 后，关键样例已恢复：

| 原目录文本场景 | 修复后页码 |
| --- | --- |
| `13.1 轴对称 5 8` | `58-66` |
| `22.1 二次函数的图象和性质 2 8` | `28-42` |
| `22.2 二次函数与一元二次方程 4 3 信息技术应用 ... 4 8` | `43-48` |

随后使用修复后的 parser 重新跑数学三版本，输出到：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_page_parse_fix_page_clean/
```

三版本 page-clean 合并结果变为：

```json
{
  "source_files": 3,
  "input_candidates": 56,
  "input_unit_evidence_objects": 116,
  "merged_candidates": 26,
  "unit_evidence_objects": 85,
  "by_grade_band": {
    "H4G7": 9,
    "H4G8": 9,
    "H4G9": 8
  },
  "multi_edition_standards": 15,
  "single_edition_standards": 11,
  "excluded_unit_evidence_objects": 31,
  "excluded_by_page_range_status": {
    "toc_page_nonmonotonic": 31
  }
}
```

review-only gates 继续通过：候选安全审计 valid true、errors 0、warnings 0；consistency audit valid true，候选内 `nonmonotonic_page_records` 为 0。候选 apply 到隔离数据根后，26 条 records 获得 85 个单元证据对象，且 `official_standard_text_changed: false`、`writes_public_data: false`；候选数据根通过索引校验、H4G distinctiveness strict audit 和 grade-band policy data-only strict audit。

publication gate 仍失败：

```json
{
  "valid": false,
  "standards_below_min_editions": 11,
  "complete_progression_group_candidates": 1,
  "partial_progression_group_candidates": 19,
  "progression_groups_below_min_editions": 6,
  "nonmonotonic_page_records": 0
}
```

因此 parser 修复后的结论是：页码召回和 page-clean 质量有改进，尤其 `MA-H4G8-GEO-023` 已获得人教版 + 冀教版两版本支撑；但新增召回也带来新的单版本候选（如 `MA-H4G7-QUAL-004`、`MA-H4G9-GEO-027`）。这些仍只能作为 review pack，不得自动发布到 `public/data` 或标记为已经完成真实年级分化。

### 8.4 数学目录顺序与页码绑定修复复跑

继续排查剩余 `toc_page_nonmonotonic` 后，确认剩余噪声主要来自目录结构而非教材真实页码非单调：部分目录是双栏/交错 OCR 顺序，源文本顺序会多次回退；部分无行内页码标题会错误绑定后续页脚或公式数字。本轮在 `scripts/textbooks/build_textbook_unit_index.js` 中补充以下规则：

- `parsePageNumberLine` 支持带 OCR 前缀符号和空格的独立页码行，如 `-34`、`_63`。
- `parsedPrintedPage` 将印刷页限制在 1-300，并在独立页码行中允许恢复 `990 -> 90` 这类三位 OCR 前缀噪声。
- 没有附属栏目标签时，行尾紧凑页码优先按整段尾部解析，避免 `纸盒1 4 2` 被切成 `42`。
- 无页码候选只允许绑定紧邻下一行的独立页码；遇到新 PDF 页或任何非页码行即清空 pending。
- 当一个目录窗口中页码在源顺序里出现两次及以上下降时，按教材印刷页顺序推断页段，用于双栏/交错目录；普通单次异常仍保留 `toc_page_nonmonotonic`，避免隐藏真实错误。

重新跑数学三版本后，单版本 work item 全部通过 review gate：

| 版本 | real units | matches | eligible | candidates | unit evidence | nonmonotonic |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 人教版 | 118 | 131 | 41 | 18 | 25 | 0 |
| 冀教版 | 196 | 187 | 54 | 21 | 46 | 0 |
| 华东师大版 | 112 | 110 | 24 | 15 | 20 | 0 |

三版本合并输出到：

```text
generated/textbook_evidence/h4g_runs/math_three_edition_page_order_fix_page_clean/
```

合并结果：

```json
{
  "input_candidates": 54,
  "input_unit_evidence_objects": 91,
  "merged_candidates": 29,
  "unit_evidence_objects": 91,
  "multi_edition_standards": 15,
  "single_edition_standards": 14,
  "excluded_unit_evidence_objects": 0,
  "page_start_records": 91,
  "by_grade_band": {
    "H4G7": 10,
    "H4G8": 11,
    "H4G9": 8
  },
  "by_page_range_status": {
    "toc_page_range_inferred": 87,
    "toc_page_start_only": 4
  }
}
```

候选安全审计通过，普通 consistency audit 通过，隔离数据根 apply 也通过：29 条 records 增加 91 个单元证据对象，`official_standard_text_changed: false`，`writes_public_data: false`。隔离数据根随后通过 `build-indexes`、`validate-data-indexes`、H4G distinctiveness strict audit 与 grade-band policy data-only strict audit。

发布级 gate 仍失败：

```json
{
  "valid": false,
  "standards_below_min_editions": 14,
  "complete_progression_group_candidates": 2,
  "partial_progression_group_candidates": 18,
  "progression_groups_below_min_editions": 4,
  "nonmonotonic_page_records": 0
}
```

因此本轮 parser 修复把数学候选推进到“页码证据可用于 review”的状态；下一步不再优先修页码，而是对单版本 standards 和缺失年级 progression groups 做反向检索，补足跨版本与完整 H4G7/H4G8/H4G9 覆盖。

### 8.5 科学华东师大版目录解析与三版本合并

2026-07-03 继续补科学华东师大版 7/8/9 六册。PDF 缓存阶段先完整取得 5/6 本，`ctb_538ade3b02d2` 首次只得到 partial；单独重试后六册全部完整缓存。该版本目录格式不同于浙教版：章标题通常没有页码，例如 `第1章 声`；真正的印刷页码在下一层数字小节行，例如 `1 声音的产生和传播／2`。因此本轮在 `scripts/textbooks/build_textbook_unit_index.js` 中补充两条解析规则：

- `parseInlineTocPageTail` 识别 `标题／页码` 和 `标题/页码` 形式。
- `candidateFromLine` 在行内页码存在时，将 `1 标题／2` 这类数字小节识别为 `unit_level=section` 的真实目录单元。

华东师大版单版本重新抽取结果：

```json
{
  "textbook_files": 6,
  "unit_candidates": 208,
  "real_unit_or_chapter_candidates": 208,
  "by_unit_level": {
    "chapter": 44,
    "section": 164
  },
  "page_start_candidates": 164,
  "page_range_candidates": 164,
  "by_page_range_status": {
    "missing": 44,
    "toc_page_range_inferred": 158,
    "toc_page_start_only": 6
  }
}
```

其中 44 条 `missing` 是无页码的章标题；164 条 section 已有可用页码。单元索引审计通过，标准匹配结果为 201 条科学 H4G standards 参与、361 个 matches、111 条 standards 有 matches、24 个 eligible matches。原始 H4G candidate 有 15 条 standards、24 个 unit evidence objects；其中 5 个 evidence objects 来自无页码章标题，无法通过 `--require-page-start`。因此发布前口径使用 page-clean 过滤：

```json
{
  "merged_candidates": 14,
  "unit_evidence_objects": 19,
  "single_edition_standards": 14,
  "excluded_unit_evidence_objects": 5,
  "by_grade_band": {
    "H4G7": 5,
    "H4G8": 5,
    "H4G9": 4
  },
  "by_page_range_status": {
    "toc_page_range_inferred": 18,
    "toc_page_start_only": 1
  }
}
```

随后将科学浙教版、沪教版和华东师大版合并为三版本 page-clean 候选，输出到：

```text
generated/textbook_evidence/h4g_runs/science_three_edition_page_clean/
```

合并结果：

```json
{
  "merged_candidates": 23,
  "unit_evidence_objects": 32,
  "multi_edition_standards": 4,
  "single_edition_standards": 19,
  "by_edition": {
    "华东师大版-华东师范大学出版社": 19,
    "沪教版-上海教育出版社": 2,
    "浙教版-浙江教育出版社": 11
  },
  "by_grade_band": {
    "H4G7": 6,
    "H4G8": 8,
    "H4G9": 9
  },
  "by_page_range_status": {
    "toc_page_range_inferred": 31,
    "toc_page_start_only": 1
  }
}
```

该候选包通过 `textbooks:audit-h4g-unit-candidates -- --strict --require-candidates --require-page-start` 和普通 consistency audit：`unit_evidence_missing_page_start=0`、`nonmonotonic_page_records=0`。但发布级 gate 仍失败：

```json
{
  "standards_below_min_editions": 19,
  "progression_groups_below_min_editions": 14,
  "complete_progression_group_candidates": 0,
  "partial_progression_group_candidates": 20,
  "unit_evidence_missing_page_start": 0,
  "nonmonotonic_page_records": 0
}
```

这说明科学 H4G7/H4G8/H4G9 的核心问题已经从“页码/目录抽取不稳定”转移为“跨版本与完整 progression group 证据不足”：当前只有 4 条 standards 达到多版本候选，20 个 progression groups 仍都是 partial，不能写入 `public/data`，也不能宣称科学 H4G 已完成正式年级分化。

刷新 `math,science --discover-candidates` 后，科学当前候选覆盖为 23 条 standards、20 个 progression groups、3 个版本。注意 discover 统计会扫描 generated 目录中的历史候选包，因此 page range status 中仍会看到旧的 raw 华东候选 `missing: 5`；真正干净的发布前口径应以 `science_three_edition_page_clean/h4g_unit_evidence_candidate.json` 为准。下一批科学推荐工作项为：

| work item | 版本 | role | files | target groups |
| --- | --- | --- | ---: | ---: |
| `h4g_unit_work_science_06f37cd5` | 武汉版-武汉出版社 | `direct_all_grades` | 6 | 67 |
| `h4g_unit_work_science_6aec3166` | 人教版-人民教育出版社 | `direct_or_discipline_all_grades` | 13 | 67 |
| `h4g_unit_work_science_34a90be0` | 苏科版-江苏凤凰科学技术出版社 | `direct_or_discipline_all_grades` | 8 | 67 |

因此科学下一步优先跑武汉版，因为它是完整 7/8/9 的直接科学教材版本；人教版和苏科版可以作为跨学科/分科版本补充，用于判断同一 progression topic 在不同教材体系中是否存在年级投放差异。

### 8.6 科学武汉版与四版本合并

2026-07-03 继续执行 worklist 推荐的科学武汉版 7/8/9 六册。PDF 预取使用系统 DNS，六册全部完整缓存，无 partial：

```json
{
  "selected": 6,
  "cached": 6,
  "missing": 0,
  "partial_progress": 0,
  "partial_no_progress": 0,
  "total_cached_bytes": 72327367
}
```

武汉版目录抽取无需新增 parser 规则。六册目录均能直接抽出带页码的 section：

```json
{
  "textbook_files": 6,
  "unit_candidates": 157,
  "real_unit_or_chapter_candidates": 157,
  "by_unit_level": {
    "section": 157
  },
  "page_start_candidates": 157,
  "page_range_candidates": 157,
  "by_page_range_status": {
    "toc_page_range_inferred": 151,
    "toc_page_start_only": 6
  }
}
```

单元索引审计通过。标准匹配结果：

```json
{
  "standards_evaluated": 201,
  "unit_candidates_considered": 157,
  "matches": 404,
  "standards_with_matches": 102,
  "eligible_matches": 10,
  "unmatched_standards": 99,
  "by_eligible_alignment": {
    "strong_field_alignment": 7,
    "subdomain_anchor": 3
  }
}
```

武汉版单版本 H4G candidate 有 10 条 standards，全部具备页码，可通过 candidate audit 和普通 consistency audit：

```json
{
  "candidate_standards": 10,
  "by_grade_band": {
    "H4G7": 4,
    "H4G8": 2,
    "H4G9": 4
  },
  "by_page_range_status": {
    "toc_page_range_inferred": 9,
    "toc_page_start_only": 1
  }
}
```

随后将武汉版与既有科学三版本 page-clean 候选合并为四版本候选，输出到：

```text
generated/textbook_evidence/h4g_runs/science_four_edition_page_clean/
```

四版本合并结果：

```json
{
  "merged_candidates": 31,
  "unit_evidence_objects": 42,
  "multi_edition_standards": 6,
  "single_edition_standards": 25,
  "by_grade_band": {
    "H4G7": 10,
    "H4G8": 10,
    "H4G9": 11
  },
  "by_edition": {
    "华东师大版-华东师范大学出版社": 19,
    "武汉版-武汉出版社": 10,
    "沪教版-上海教育出版社": 2,
    "浙教版-浙江教育出版社": 11
  },
  "by_page_range_status": {
    "toc_page_range_inferred": 40,
    "toc_page_start_only": 2
  }
}
```

四版本 candidate audit 和普通 consistency audit 均通过：`unit_evidence_missing_page_start=0`、`nonmonotonic_page_records=0`。发布级 gate 仍失败：

```json
{
  "standards_below_min_editions": 25,
  "progression_groups": 23,
  "progression_groups_below_min_editions": 13,
  "complete_progression_group_candidates": 0,
  "partial_progression_group_candidates": 23,
  "unit_evidence_missing_page_start": 0,
  "nonmonotonic_page_records": 0
}
```

相较三版本，武汉版带来了 8 条新增 standards、3 个新增 progression groups，并把多版本 standards 从 4 条提升到 6 条；但所有 23 个 progression groups 仍是 partial，没有任何一组完整覆盖 H4G7/H4G8/H4G9。因此科学仍处于 `candidate_evidence_partial_needs_gap_remediation`，不能写入 `public/data`。

刷新 `math,science --discover-candidates` 后，科学当前候选覆盖为 31 条 standards、23 个 progression groups、4 个版本。由于 discover 会扫描 generated 历史包，page status 中仍会看到旧 raw 华东候选的 `missing: 5`；发布前干净口径应以 `science_four_edition_page_clean/h4g_unit_evidence_candidate.json` 为准。下一批科学推荐工作项变为：

| work item | 版本 | role | files | target groups |
| --- | --- | --- | ---: | ---: |
| `h4g_unit_work_science_6aec3166` | 人教版-人民教育出版社 | `direct_or_discipline_all_grades` | 13 | 67 |
| `h4g_unit_work_science_34a90be0` | 苏科版-江苏凤凰科学技术出版社 | `direct_or_discipline_all_grades` | 8 | 67 |
| `h4g_unit_work_science_b908a758` | 北京版-北京出版社 | `direct_or_discipline_all_grades` | 6 | 67 |

因此下一步不再优先找新的直接科学整版，而应进入分科/跨学科教材版本：先跑人教版，再跑苏科版或北京版，用于补同一 progression group 的缺失年级和第二版本证据，同时记录可能出现的年级投放差异。

### 8.7 科学人教版分科教材与五版本合并

2026-07-03 继续执行科学人教版分科教材工作项。该批不是一套名为“科学”的综合教材，而是覆盖化学、地理、物理、生物学的分科教材组合，因此它的作用是补强特定概念链和跨学科年级投放判断，不能期待它像直接科学整版一样覆盖全部科学 H4G groups。

PDF 预取阶段直接缓存 12/13 本；`ctb_29dc6f39b08d`（化学九年级上册）通过 raw 下载多次失败，但 ChinaTextbook 本地 Git blob 已存在，blob 大小为 16,252,622 bytes，随后通过 `textbooks:unit-index --materialize` 从本地 blob 成功物化。完整 13 本分科教材目录抽取结果：

```json
{
  "textbook_files": 13,
  "unit_candidates": 190,
  "real_unit_or_chapter_candidates": 184,
  "volume_seed_candidates": 6,
  "page_start_candidates": 184,
  "page_range_candidates": 184,
  "by_unit_level": {
    "chapter": 43,
    "section": 1,
    "unit": 140
  },
  "by_page_range_status": {
    "toc_page_nonmonotonic": 1,
    "toc_page_range_inferred": 176,
    "toc_page_start_only": 7
  }
}
```

单元索引审计通过。标准匹配结果显示分科教材能补到少量高价值概念，但召回范围有限：

```json
{
  "standards_evaluated": 201,
  "unit_candidates_considered": 184,
  "matches": 52,
  "standards_with_matches": 28,
  "eligible_matches": 5,
  "unmatched_standards": 173,
  "by_eligible_alignment": {
    "strong_field_alignment": 3,
    "subdomain_anchor": 2
  }
}
```

人教版单版本 H4G candidate 有 5 条 standards，全部具备 page_start，并通过 candidate audit 与普通 consistency audit：

| standard_code | grade_band | alignment | 单元 |
| --- | --- | --- | --- |
| `SC-H4G7-LIFE-007` | H4G7 | `subdomain_anchor` | `第一章 细胞是生命活动的基本单位` p.36-41 |
| `SC-H4G8-CHG-002` | H4G8 | `strong_field_alignment` | `第三章 物态变化` p.46 |
| `SC-H4G8-ENV-005` | H4G8 | `strong_field_alignment` | `第四节 自然灾害` p.54-60 |
| `SC-H4G9-CHG-012` | H4G9 | `strong_field_alignment` | `第五单 元 化学方程式` p.91-104 |
| `SC-H4G9-ENE-006` | H4G9 | `subdomain_anchor` | `第4节 能源与可持续发展` p.178 |

随后将人教版与既有科学四版本 page-clean 候选合并为五版本候选，输出到：

```text
generated/textbook_evidence/h4g_runs/science_five_edition_page_clean/
```

五版本合并结果：

```json
{
  "merged_candidates": 34,
  "unit_evidence_objects": 47,
  "multi_edition_standards": 6,
  "single_edition_standards": 28,
  "by_grade_band": {
    "H4G7": 11,
    "H4G8": 12,
    "H4G9": 11
  },
  "by_edition": {
    "华东师大版-华东师范大学出版社": 19,
    "武汉版-武汉出版社": 10,
    "浙教版-浙江教育出版社": 11,
    "人教版-人民教育出版社": 5,
    "沪教版-上海教育出版社": 2
  },
  "by_page_range_status": {
    "toc_page_range_inferred": 44,
    "toc_page_start_only": 3
  }
}
```

五版本 candidate audit 和普通 consistency audit 均通过：`unit_evidence_missing_page_start=0`、`nonmonotonic_page_records=0`。发布级 gate 仍失败：

```json
{
  "standards_below_min_editions": 28,
  "progression_groups": 26,
  "progression_groups_below_min_editions": 16,
  "complete_progression_group_candidates": 0,
  "partial_progression_group_candidates": 26,
  "unit_evidence_missing_page_start": 0,
  "nonmonotonic_page_records": 0
}
```

相较四版本，人教版新增 3 条 standards / progression groups，并强化了部分九年级化学与能源链条，例如 `SC-H4G9-CHG-012` 现在有人教版、华东师大版、武汉版三版本证据，`SC-H4G9-ENE-006` 现在有人教版、华东师大版、浙教版三版本证据。但整体发布状态没有改变：科学仍有 28 条 standards 只有单版本证据，26 个 progression groups 全部都是 partial，没有任何一组完整覆盖 H4G7/H4G8/H4G9。

刷新 `math,science --discover-candidates` 后，科学当前候选覆盖为 34 条 page-clean standards、26 个 page-clean progression groups、5 个版本；discover 统计会扫描 generated 历史候选包，因此聚合口径会看到 143 个历史 science candidates、186 个历史 unit evidence objects 和旧 raw 华东候选遗留的 `missing: 5`。发布前干净口径仍应以 `science_five_edition_page_clean/h4g_unit_evidence_candidate.json` 为准。下一批科学推荐工作项变为：

| work item | 版本 | role | files | target groups |
| --- | --- | --- | ---: | ---: |
| `h4g_unit_work_science_34a90be0` | 苏科版-江苏凤凰科学技术出版社 | `direct_or_discipline_all_grades` | 8 | 67 |
| `h4g_unit_work_science_b908a758` | 北京版-北京出版社 | `direct_or_discipline_all_grades` | 6 | 67 |
| `h4g_unit_work_science_8ce3c359` | 科普版-科学普及出版社 | `adjacent_included` | 6 | 67 |

因此科学下一步应继续补苏科版和北京版。科普版可作为 adjacent 补充，用来解释化学/地理等分科主题的投放差异，但不能替代同年级、同学科的多版本发布 gate。

### 8.8 科学苏科版分科教材与六版本合并

2026-07-03 继续执行科学苏科版分科教材工作项。该批覆盖生物学与物理，不含完整综合科学教材，因此它主要用于补生命系统、生态、多样性、能量等分科主题证据。

PDF 预取阶段直接缓存 7/8 本；`ctb_4aa8d7ad5883`（生物学七年级上册）raw 下载失败并留下 40,747 bytes partial，但本地 ChinaTextbook Git blob 可用，blob 大小为 45,427,127 bytes。随后 unit-index 阶段通过本地 blob 成功物化该文件，其余 7 本复用 PDF cache。完整 8 本目录抽取结果：

```json
{
  "textbook_files": 8,
  "unit_candidates": 126,
  "real_unit_or_chapter_candidates": 126,
  "volume_seed_candidates": 0,
  "page_start_candidates": 102,
  "page_range_candidates": 102,
  "by_unit_level": {
    "chapter": 45,
    "section": 8,
    "unit": 73
  },
  "by_page_range_status": {
    "missing": 24,
    "toc_page_range_inferred": 96,
    "toc_page_start_only": 6
  },
  "by_extraction_status": {
    "cached": 7,
    "materialized": 1
  }
}
```

单元索引审计通过。标准匹配结果：

```json
{
  "standards_evaluated": 201,
  "unit_candidates_considered": 126,
  "matches": 34,
  "standards_with_matches": 21,
  "eligible_matches": 3,
  "unmatched_standards": 180,
  "by_eligible_alignment": {
    "strong_field_alignment": 2,
    "subdomain_anchor": 1
  }
}
```

3 条 eligible 中，`SC-H4G9-ENE-006` 命中 `第十七章 能源与可持续发展`，但该章标题缺 `page_start`，因此在 page-clean 候选包中被过滤。苏科版最终 page-clean H4G candidate 有 2 条 standards，全部通过 candidate audit 与普通 consistency audit：

| standard_code | grade_band | alignment | 单元 |
| --- | --- | --- | --- |
| `SC-H4G7-LIFE-016` | H4G7 | `strong_field_alignment` | `第3章 生态系统和生物圈` p.36 |
| `SC-H4G8-ECO-005` | H4G8 | `strong_field_alignment` | `第2节 保护生物多样性` p.96-103 |

随后将苏科版与既有科学五版本 page-clean 候选合并为六版本候选，输出到：

```text
generated/textbook_evidence/h4g_runs/science_six_edition_page_clean/
```

六版本合并结果：

```json
{
  "merged_candidates": 35,
  "unit_evidence_objects": 49,
  "multi_edition_standards": 7,
  "single_edition_standards": 28,
  "by_grade_band": {
    "H4G7": 11,
    "H4G8": 13,
    "H4G9": 11
  },
  "by_edition": {
    "华东师大版-华东师范大学出版社": 19,
    "武汉版-武汉出版社": 10,
    "浙教版-浙江教育出版社": 11,
    "人教版-人民教育出版社": 5,
    "苏科版-江苏凤凰科学技术出版社": 2,
    "沪教版-上海教育出版社": 2
  },
  "by_page_range_status": {
    "toc_page_range_inferred": 46,
    "toc_page_start_only": 3
  }
}
```

六版本 candidate audit 和普通 consistency audit 均通过：`unit_evidence_missing_page_start=0`、`nonmonotonic_page_records=0`。相较五版本，苏科版带来 1 条新增 standard（`SC-H4G8-ECO-005`），并把多版本 standards 从 6 条提升到 7 条。更重要的是，`science-d887780b2ca2bb` 第一次成为完整 H4G7/H4G8/H4G9 progression group candidate：

| progression_group_id | candidate grade bands | standards | editions |
| --- | --- | --- | --- |
| `science-d887780b2ca2bb` | H4G7, H4G8, H4G9 | `SC-H4G7-ECO-004`, `SC-H4G8-ECO-005`, `SC-H4G9-ECO-006` | 华东师大版、苏科版 |

但发布级 gate 仍失败：

```json
{
  "standards_below_min_editions": 28,
  "progression_groups": 26,
  "progression_groups_below_min_editions": 15,
  "complete_progression_group_candidates": 1,
  "partial_progression_group_candidates": 25,
  "unit_evidence_missing_page_start": 0,
  "nonmonotonic_page_records": 0
}
```

这个失败是预期的：`science-d887780b2ca2bb` 已经在 progression group 粒度补齐 H4G7/H4G8/H4G9，但多条单个 standard 仍只有一个教材版本证据，未达到 `min-editions-per-standard=2`。因此六版本包仍只能作为 review-only 候选，不写 `public/data`，也不能把科学 H4G 标记为正式完成分化。

刷新 `math,science --discover-candidates` 后，科学当前候选覆盖为 35 条 page-clean standards、26 个 page-clean progression groups、6 个版本。下一批科学推荐工作项变为：

| work item | 版本 | role | files | target groups |
| --- | --- | --- | ---: | ---: |
| `h4g_unit_work_science_b908a758` | 北京版-北京出版社 | `direct_or_discipline_all_grades` | 6 | 67 |
| `h4g_unit_work_science_8ce3c359` | 科普版-科学普及出版社 | `adjacent_included` | 6 | 67 |
| `h4g_unit_work_science_2e916100` | 沪教版-上海教育出版社 | `direct_all_grades` | 8 | 67 |

因此下一步优先跑北京版，用化学和生物学补人教版/苏科版没有覆盖到的分科链条；科普版可继续作为 adjacent 补充，沪教版则可回头补完整 direct_all_grades 版本。

### 8.9 科学北京版分科教材与七版本合并

2026-07-03 继续执行科学北京版分科教材工作项。该批覆盖生物学与化学，其中生物学为七、八年级上下册，化学为九年级上下册；它不是综合科学整版教材，因此主要用于补生态、生命系统和九年级化学链条的分科证据。

PDF 预取阶段 `ctb_05dc6712c813` 长时间无进展，因此中止 raw 预取，改用本地 ChinaTextbook Git blob 物化。6 个 evidence 的 Git blob 均可用，最大文件为九年级化学下册 `ctb_2e8be265691e`，大小 51,785,902 bytes。随后 unit-index 阶段全部通过本地 blob 成功物化：

```json
{
  "textbook_files": 6,
  "unit_candidates": 121,
  "real_unit_or_chapter_candidates": 121,
  "page_start_candidates": 103,
  "page_range_candidates": 103,
  "by_unit_level": {
    "chapter": 28,
    "unit": 93
  },
  "by_page_range_status": {
    "missing": 18,
    "toc_page_nonmonotonic": 1,
    "toc_page_range_inferred": 96,
    "toc_page_start_only": 6
  },
  "by_extraction_status": {
    "materialized": 6
  }
}
```

单元索引审计通过。标准匹配结果：

```json
{
  "standards_evaluated": 201,
  "unit_candidates_considered": 121,
  "matches": 44,
  "standards_with_matches": 28,
  "eligible_matches": 6,
  "unmatched_standards": 173,
  "by_eligible_alignment": {
    "strong_field_alignment": 6
  }
}
```

6 条 eligible 中有 4 条来自九年级化学章标题，但这些目录候选缺少可靠 `page_start`，因此在 page-clean 口径下被过滤。北京版最终 page-clean H4G candidate 有 2 条 standards，全部来自八年级下册生物学 `第三节 生态系统`，并通过 candidate audit 与普通 consistency audit：

| standard_code | grade_band | alignment | 单元 |
| --- | --- | --- | --- |
| `SC-H4G8-ECO-005` | H4G8 | `strong_field_alignment` | `第三节 生态系统` p.65-72 |
| `SC-H4G8-LIFE-017` | H4G8 | `strong_field_alignment` | `第三节 生态系统` p.65-72 |

随后将北京版与既有科学六版本 page-clean 候选合并为七版本候选，输出到：

```text
generated/textbook_evidence/h4g_runs/science_seven_edition_page_clean/
```

七版本合并结果：

```json
{
  "merged_candidates": 35,
  "unit_evidence_objects": 51,
  "multi_edition_standards": 9,
  "single_edition_standards": 26,
  "by_grade_band": {
    "H4G7": 11,
    "H4G8": 13,
    "H4G9": 11
  },
  "by_edition": {
    "华东师大版-华东师范大学出版社": 19,
    "武汉版-武汉出版社": 10,
    "浙教版-浙江教育出版社": 11,
    "人教版-人民教育出版社": 5,
    "苏科版-江苏凤凰科学技术出版社": 2,
    "北京版-北京出版社": 2,
    "沪教版-上海教育出版社": 2
  },
  "by_page_range_status": {
    "toc_page_range_inferred": 48,
    "toc_page_start_only": 3
  }
}
```

七版本 candidate audit 和普通 consistency audit 均通过：`unit_evidence_missing_page_start=0`、`nonmonotonic_page_records=0`。相较六版本，北京版没有新增 standard，但把 2 条 H4G8 standards 从单版本推进到多版本：

| standard_code | grade_band | progression_group_id | 七版本后的版本证据 |
| --- | --- | --- | --- |
| `SC-H4G8-ECO-005` | H4G8 | `science-d887780b2ca2bb` | 北京版 `第三节 生态系统` p.65-72；苏科版 `第2节 保护生物多样性` p.96-103 |
| `SC-H4G8-LIFE-017` | H4G8 | `science-015acdb16d7e4d` | 北京版 `第三节 生态系统` p.65-72；武汉版 `6.3 生态系统和生物圈` p.118-129 |

其中 `science-d887780b2ca2bb` 仍是当前唯一完整 H4G7/H4G8/H4G9 progression group candidate，并且版本集合扩展为北京版、华东师大版、苏科版：

| progression_group_id | candidate grade bands | standards | editions |
| --- | --- | --- | --- |
| `science-d887780b2ca2bb` | H4G7, H4G8, H4G9 | `SC-H4G7-ECO-004`, `SC-H4G8-ECO-005`, `SC-H4G9-ECO-006` | 北京版、华东师大版、苏科版 |

发布级 gate 仍失败：

```json
{
  "standards_below_min_editions": 26,
  "progression_groups": 26,
  "progression_groups_below_min_editions": 15,
  "complete_progression_group_candidates": 1,
  "partial_progression_group_candidates": 25,
  "unit_evidence_missing_page_start": 0,
  "nonmonotonic_page_records": 0
}
```

这个失败仍是预期的：北京版提升了 H4G8 生态/生命系统的跨版本一致性，但没有补出新的 H4G7 或 H4G9 standards，也没有让 25 个 partial progression groups 变成完整三元组。因此七版本包仍只能作为 review-only 候选，不写 `public/data`，也不能把科学 H4G 标记为正式完成分化。

刷新 `math,science --discover-candidates` 后，科学当前候选覆盖为 35 条 page-clean standards、26 个 page-clean progression groups、7 个版本；科学总计仍有 201 条 H4G records、67 个完整同文三元 progression groups 需要单元级证据，正式 `public/data` 中 `textbook_unit_level` 仍为 0。下一批科学推荐工作项变为：

| work item | 版本 | role | files |
| --- | --- | --- | ---: |
| `h4g_unit_work_science_8ce3c359` | 科普版-科学普及出版社 | `adjacent_included` | 6 |
| `h4g_unit_work_science_2e916100` | 沪教版-上海教育出版社 | `direct_all_grades` | 8 |
| `h4g_unit_work_science_32198635` | 华东师大版-华东师范大学出版社 | `direct_all_grades` | 6 |

因此下一步不应把北京版重复跑一遍，而应优先处理科普版的 adjacent 分科证据，并回到沪教版、华东师大版这类完整 direct_all_grades 版本，补同年级第二版本证据和缺失 H4G7/H4G9 progression 节点。

### 8.10 科学科普版 adjacent 分科教材与八版本合并

2026-07-03 继续执行科学科普版 adjacent 工作项。该批覆盖地理七、八年级上下册和化学九年级上下册，不是综合科学整版教材；它的价值是补地球系统、自然环境、自然灾害等分科主题的年级投放证据，而不是直接证明完整科学 H4G 已完成。

6 个 evidence 的本地 Git blob 均可用，大小约 9.5-15MB。unit-index 使用本地 blob 物化并启用 OCR fallback，未走 GitHub raw 下载；其中 4 本使用 OCR 文本，2 本直接抽取文本。完整目录抽取结果：

```json
{
  "textbook_files": 6,
  "unit_candidates": 76,
  "real_unit_or_chapter_candidates": 74,
  "volume_seed_candidates": 2,
  "page_start_candidates": 31,
  "page_range_candidates": 31,
  "by_unit_level": {
    "chapter": 18,
    "unit": 56
  },
  "by_page_range_status": {
    "missing": 43,
    "toc_page_range_inferred": 27,
    "toc_page_start_only": 4
  },
  "by_extraction_status": {
    "materialized": 6
  },
  "by_text_status": {
    "ocr_text_extracted": 4,
    "text_extracted": 2
  }
}
```

单元索引审计通过。标准匹配结果：

```json
{
  "standards_evaluated": 201,
  "unit_candidates_considered": 74,
  "matches": 7,
  "standards_with_matches": 4,
  "eligible_matches": 3,
  "unmatched_standards": 197,
  "by_eligible_alignment": {
    "strong_field_alignment": 2,
    "subdomain_anchor": 1
  }
}
```

科普版最终 page-clean H4G candidate 有 3 条 standards，全部带 `page_start` 和页段，并通过 candidate audit 与普通 consistency audit：

| standard_code | grade_band | alignment | 单元 |
| --- | --- | --- | --- |
| `SC-H4G7-ESYS-001` | H4G7 | `subdomain_anchor` | `第三节 主要气候类型` p.61-70 |
| `SC-H4G8-ENV-005` | H4G8 | `strong_field_alignment` | `第四节 自然灾害多发` p.48-51 |
| `SC-H4G8-ENV-008` | H4G8 | `strong_field_alignment` | `第二章 自然环境` p.21-47 |

随后将科普版与既有科学七版本 page-clean 候选合并为八版本候选，输出到：

```text
generated/textbook_evidence/h4g_runs/science_eight_edition_page_clean/
```

八版本合并结果：

```json
{
  "merged_candidates": 37,
  "unit_evidence_objects": 54,
  "multi_edition_standards": 10,
  "single_edition_standards": 27,
  "by_grade_band": {
    "H4G7": 12,
    "H4G8": 14,
    "H4G9": 11
  },
  "by_edition": {
    "华东师大版-华东师范大学出版社": 19,
    "武汉版-武汉出版社": 10,
    "科普版-科学普及出版社": 3,
    "浙教版-浙江教育出版社": 11,
    "人教版-人民教育出版社": 5,
    "苏科版-江苏凤凰科学技术出版社": 2,
    "北京版-北京出版社": 2,
    "沪教版-上海教育出版社": 2
  },
  "by_page_range_status": {
    "toc_page_range_inferred": 51,
    "toc_page_start_only": 3
  }
}
```

八版本 candidate audit 和普通 consistency audit 均通过：`unit_evidence_missing_page_start=0`、`nonmonotonic_page_records=0`。相较七版本，科普版新增 2 条 standards（`SC-H4G7-ESYS-001`、`SC-H4G8-ENV-008`），并把 `SC-H4G8-ENV-005` 从人教版单版本推进到人教版+科普版双版本：

| standard_code | grade_band | progression_group_id | 八版本后的版本证据 |
| --- | --- | --- | --- |
| `SC-H4G7-ESYS-001` | H4G7 | `science-30035abac2f1b0` | 科普版 `第三节 主要气候类型` p.61-70 |
| `SC-H4G8-ENV-005` | H4G8 | `science-dd33b8c6bcca73` | 人教版 `第四节 自然灾害` p.54-60；科普版 `第四节 自然灾害多发` p.48-51 |
| `SC-H4G8-ENV-008` | H4G8 | `science-f6bbaae20ef843` | 科普版 `第二章 自然环境` p.21-47 |

发布级 gate 仍失败：

```json
{
  "standards_below_min_editions": 27,
  "progression_groups": 27,
  "progression_groups_below_min_editions": 14,
  "complete_progression_group_candidates": 1,
  "partial_progression_group_candidates": 26,
  "unit_evidence_missing_page_start": 0,
  "nonmonotonic_page_records": 0
}
```

这个失败仍是预期的：科普版把科学候选从 35 条 standards / 26 个 progression groups 推进到 37 条 standards / 27 个 progression groups，但新增内容仍集中在 H4G7/H4G8，未补出 H4G9 对应节点，也没有增加新的完整 H4G7/H4G8/H4G9 progression group。当前唯一完整组仍是 `science-d887780b2ca2bb`。

刷新 `math,science --discover-candidates` 后，科学当前候选覆盖为 37 条 page-clean standards、27 个 page-clean progression groups、8 个版本；科学总计仍有 201 条 H4G records、67 个完整同文三元 progression groups 需要单元级证据，正式 `public/data` 中 `textbook_unit_level` 仍为 0。下一批科学推荐工作项变为：

| work item | 版本 | role | files | target groups |
| --- | --- | --- | ---: | ---: |
| `h4g_unit_work_science_2e916100` | 沪教版-上海教育出版社 | `direct_all_grades` | 8 | 67 |
| `h4g_unit_work_science_32198635` | 华东师大版-华东师范大学出版社 | `direct_all_grades` | 6 | 67 |
| `h4g_unit_work_science_06f37cd5` | 武汉版-武汉出版社 | `direct_all_grades` | 6 | 67 |

因此下一步应回到完整 direct_all_grades 版本，优先补同年级第二版本证据和缺失 H4G9 节点；adjacent 分科版本只能解释特定主题的投放差异，不能替代完整版本的发布 gate。

### 8.11 科学沪教版完整八册复跑与 page-clean 稳定性

2026-07-03 对科学沪教版重新执行完整 `direct_all_grades` 证据链。此前 `science_hujiao_unit_review` 只覆盖 7 个文件，缺少 `ctb_f7198c2bcad8`（沪教版九年级化学下册），并且该文件当时只有 `.part` 缓存。本轮 8 个 evidence 的本地 Git blob 均可读，使用本地 blob 物化，未走下载 fallback。

完整八册 evidence：

| evidence_id | 教材 | object size |
| --- | --- | ---: |
| `ctb_21ad4cf3b58e` | 科学 八年级 下册 | 7,742,016 |
| `ctb_4a2f8e984139` | 科学 七年级 下册 | 7,645,810 |
| `ctb_67c7dbc3ca69` | 科学 七年级 上册 | 8,243,931 |
| `ctb_7e63d69177a1` | 科学 九年级 上册 | 10,019,020 |
| `ctb_95efc7d32733` | 化学 九年级 上册 | 19,096,092 |
| `ctb_afa098984e6c` | 科学 九年级 下册 | 10,191,899 |
| `ctb_eeb16734255b` | 科学 八年级 上册 | 8,722,065 |
| `ctb_f7198c2bcad8` | 化学 九年级 下册 | 44,714,543 |

unit-index 输出到：

```text
generated/textbook_evidence/h4g_runs/science_hujiao_full_unit_review/
```

完整目录抽取结果：

```json
{
  "textbook_files": 8,
  "unit_candidates": 99,
  "real_unit_or_chapter_candidates": 99,
  "volume_seed_candidates": 0,
  "page_start_candidates": 48,
  "page_range_candidates": 48,
  "by_unit_level": {
    "chapter": 70,
    "numbered_item": 2,
    "unit": 27
  },
  "by_page_range_status": {
    "missing": 51,
    "toc_page_nonmonotonic": 2,
    "toc_page_range_inferred": 43,
    "toc_page_start_only": 3
  },
  "by_extraction_status": {
    "cached": 7,
    "materialized": 1
  },
  "by_text_status": {
    "ocr_text_extracted": 5,
    "text_extracted": 3
  }
}
```

单元索引审计通过。标准匹配结果：

```json
{
  "standards_evaluated": 201,
  "unit_candidates_considered": 99,
  "matches": 35,
  "standards_with_matches": 26,
  "eligible_matches": 4,
  "unmatched_standards": 175,
  "confidence": {
    "low": 30,
    "medium": 5
  },
  "by_eligible_alignment": {
    "strong_field_alignment": 4
  }
}
```

沪教版完整八册最终 page-clean H4G candidate 仍只有 2 条 standards，均为 H4G9，并通过 candidate audit 与普通 consistency audit：

| standard_code | grade_band | evidence_id | 单元 | page_status |
| --- | --- | --- | --- | --- |
| `SC-H4G9-CHG-009` | H4G9 | `ctb_95efc7d32733` | `第4章 认识化学变化 ------` p.91 | `toc_page_range_inferred` |
| `SC-H4G9-ECO-009` | H4G9 | `ctb_afa098984e6c` | `第三章 健康生活 ------` p.56-69 | `toc_page_range_inferred` |

另外 2 条 H4G8 eligible matches 被 `--require-page-start` 过滤掉，原因不是缺少单元匹配，而是沪教版八上目录标题 `第八章 生态系统-----112` 没有被当前页码解析器稳定拆出 `page_start`：

| standard_code | grade_band | evidence_id | 单元 | page_status |
| --- | --- | --- | --- | --- |
| `SC-H4G8-ECO-005` | H4G8 | `ctb_eeb16734255b` | `第八章 生态系统-----112` | `missing` |
| `SC-H4G8-LIFE-017` | H4G8 | `ctb_eeb16734255b` | `第八章 生态系统-----112` | `missing` |

也就是说，沪教版完整八册复跑解决了“缺九下化学文件”的问题，但没有增加 page-clean 候选；真正的下一处高价值修复是安全处理 `第八章 生态系统-----112` 这类 OCR/目录连字符页码，而不是机械重复整版复跑。

随后将完整沪教版候选与既有科学八版本 page-clean 候选合并，输出到：

```text
generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/
```

合并结果仍为 37 条 standards、54 个 unit evidence objects：

```json
{
  "merged_candidates": 37,
  "unit_evidence_objects": 54,
  "multi_edition_standards": 10,
  "single_edition_standards": 27,
  "by_grade_band": {
    "H4G7": 12,
    "H4G8": 14,
    "H4G9": 11
  },
  "by_edition": {
    "华东师大版-华东师范大学出版社": 19,
    "武汉版-武汉出版社": 10,
    "科普版-科学普及出版社": 3,
    "浙教版-浙江教育出版社": 11,
    "人教版-人民教育出版社": 5,
    "苏科版-江苏凤凰科学技术出版社": 2,
    "北京版-北京出版社": 2,
    "沪教版-上海教育出版社": 2
  },
  "unit_evidence_missing_page_start": 0,
  "nonmonotonic_page_records": 0
}
```

发布级 gate 仍失败，且失败原因没有变化：

```json
{
  "standards_below_min_editions": 27,
  "progression_groups": 27,
  "progression_groups_below_min_editions": 14,
  "complete_progression_group_candidates": 1,
  "partial_progression_group_candidates": 26,
  "unit_evidence_missing_page_start": 0,
  "nonmonotonic_page_records": 0
}
```

刷新 `math,science --discover-candidates` 后，worklist 仍推荐沪教版、华东师大版、武汉版三个完整 `direct_all_grades` 工作项；但这里要区分“规划器看到沪教版仍有 gap”和“沪教版刚完成完整复跑但 page-clean 没有新增”。因此下一步不应再无条件重复沪教版整版任务，而应二选一：先对沪教八上 `第八章 生态系统-----112` 做页码解析/人工 override 复核，或跳过重复沪教复跑，进入华东师大版、武汉版完整版本补同年级第二版本证据。

### 8.12 科学沪教版 dash leader 页码解析修复

2026-07-03 继续定位 8.11 中的 H4G8 过滤原因后，确认问题在 `scripts/textbooks/build_textbook_unit_index.js` 的 `parseInlineTocPageTail`：已有逻辑可以识别 `------ 124` 这类“连字符 leader + 空格 + 页码”，但不能识别 `-----112` 这类“连字符 leader 紧贴页码”。本轮增加 `toc_inline_dash_page_tail` 分支，只匹配“含汉字标题 + 至少两个横线 + 1-3 位有效印刷页码”的目录行，避免把普通标题里的单个短横误判为页码。

沪教版完整八册复跑后，unit-index 结果从 `page_start_candidates=48` 提升到 `88`，`missing` 从 `51` 降到 `4`：

```json
{
  "textbook_files": 8,
  "unit_candidates": 92,
  "real_unit_or_chapter_candidates": 92,
  "volume_seed_candidates": 0,
  "page_start_candidates": 88,
  "page_range_candidates": 88,
  "by_unit_level": {
    "chapter": 63,
    "numbered_item": 2,
    "unit": 27
  },
  "by_page_range_status": {
    "missing": 4,
    "toc_page_nonmonotonic": 2,
    "toc_page_range_inferred": 78,
    "toc_page_start_only": 8
  }
}
```

关键单元被正确清洗为：

| evidence_id | raw line | unit_title | page_range | source |
| --- | --- | --- | --- | --- |
| `ctb_eeb16734255b` | `第八章 生态系统-----112` | `第八章 生态系统` | p.112-131 | `toc_inline_dash_page_tail` |
| `ctb_95efc7d32733` | `第 4 章 认识化学变化 ------ 91` | `第4章 认识化学变化` | p.91 | `toc_inline_dash_page_tail` |
| `ctb_afa098984e6c` | `第三章 健康生活 ------ 56` | `第三章 健康生活` | p.56-69 | `toc_inline_dash_page_tail` |

标准匹配仍保持 4 条 eligible，但由于标题噪声被清理，总 matches 从 35 收敛到 33；match audit 继续通过：

```json
{
  "standards_evaluated": 201,
  "unit_candidates_considered": 92,
  "matches": 33,
  "standards_with_matches": 26,
  "eligible_matches": 4,
  "unmatched_standards": 175,
  "by_eligible_alignment": {
    "strong_field_alignment": 4
  }
}
```

沪教版 page-clean H4G candidate 从 2 条提升到 4 条，`filtered_missing_page_start_matches` 归零：

| standard_code | grade_band | 单元 | page_range |
| --- | --- | --- | --- |
| `SC-H4G8-ECO-005` | H4G8 | `第八章 生态系统` | p.112-131 |
| `SC-H4G8-LIFE-017` | H4G8 | `第八章 生态系统` | p.112-131 |
| `SC-H4G9-CHG-009` | H4G9 | `第4章 认识化学变化` | p.91 |
| `SC-H4G9-ECO-009` | H4G9 | `第三章 健康生活` | p.56-69 |

沪教版单批 consistency 仍明确标为 `single_edition_not_proven`；这意味着 parser 修复只恢复页码证据，不会自动把单版本候选升级为发布级证明。

重新合并科学八版本后，标准数仍为 37，但 unit evidence objects 从 54 提升到 58；沪教版在 combine summary 中从 2 个 evidence objects 提升到 6 个：

```json
{
  "merged_candidates": 37,
  "unit_evidence_objects": 58,
  "multi_edition_standards": 10,
  "single_edition_standards": 27,
  "by_grade_band": {
    "H4G7": 12,
    "H4G8": 14,
    "H4G9": 11
  },
  "by_edition": {
    "华东师大版-华东师范大学出版社": 19,
    "武汉版-武汉出版社": 10,
    "科普版-科学普及出版社": 3,
    "浙教版-浙江教育出版社": 11,
    "人教版-人民教育出版社": 5,
    "苏科版-江苏凤凰科学技术出版社": 2,
    "北京版-北京出版社": 2,
    "沪教版-上海教育出版社": 6
  },
  "by_page_range_status": {
    "toc_page_range_inferred": 55,
    "toc_page_start_only": 3
  }
}
```

发布级 gate 仍失败，失败原因仍是跨版本/完整 progression 覆盖不足，而不是页码质量：

```json
{
  "standards_below_min_editions": 27,
  "progression_groups": 27,
  "progression_groups_below_min_editions": 14,
  "complete_progression_group_candidates": 1,
  "partial_progression_group_candidates": 26,
  "unit_evidence_missing_page_start": 0,
  "nonmonotonic_page_records": 0
}
```

本轮修复后，`science-d887780b2ca2bb` 生态 progression group 的 H4G8 标准 `SC-H4G8-ECO-005` 已有北京版、苏科版、沪教版三版本同年级单元证据；但整个科学候选仍只有 1 个完整 H4G7/H4G8/H4G9 progression group。刷新 worklist 后，科学仍显示 37 条 candidate standards、27 个 candidate progression groups、8 个 candidate editions，正式 `public/data` 的 `textbook_unit_level` 仍为 0。planner 仍推荐沪教版，是因为当前 planner 还不区分“刚完成复跑并已做 parser remediation 的版本”和“仍未处理的完整版本”；后续可以改 planner 去重，也可以直接进入华东师大版、武汉版补缺。

### 8.13 planner page-clean 口径与华东师大版严格复跑

2026-07-03 继续检查科学华东师大版、武汉版和沪教版的单批质量。使用 data-quality 口径看，武汉版现有单批已经没有缺页码 unit evidence：10 条 standards、10 个 unit evidence objects，`unit_evidence_missing_page_start=0`。华东师大版旧单批则仍有 5 个无页码章标题混入 candidate package；虽然这些 standards 往往还有 section-level 页码证据，但 standalone candidate 不能再把 missing chapter 当作可发布候选。

本轮先修 planner 两个系统性问题：

1. `plan_h4g_unit_evidence_worklist.js` 生成的 `build_candidates` 命令现在带 `--require-page-start`，与 `run_h4g_unit_work_item.js` 和后续 audit gate 保持一致。
2. `--discover-candidates` 的 candidate coverage 只统计 page-clean unit evidence：必须有正整数 `page_start`，且 `page_range_status` 不能是 `toc_page_nonmonotonic`。这样旧 generated candidate 文件即使仍在本地，也不会把 `missing` 或 nonmonotonic 页码证据计入当前覆盖画像。

随后用修正后的 runner 对华东师大版完整 6 册重跑严格 page-clean 单批，输出到：

```text
generated/textbook_evidence/h4g_runs/science_huadong_page_clean_unit_review/
```

华东师大版旧单批与严格单批对比：

| 指标 | 旧 `science_huadong_unit_review` | 新 `science_huadong_page_clean_unit_review` |
| --- | ---: | ---: |
| candidate standards | 15 | 14 |
| unit evidence objects | 24 | 19 |
| H4G7/H4G8/H4G9 | 5 / 5 / 5 | 5 / 5 / 4 |
| `filtered_missing_page_start_matches` | 0 | 5 |
| `unit_evidence_missing_page_start` | 5 | 0 |
| `nonmonotonic_page_records` | 0 | 0 |
| page statuses | `missing` 5, inferred 18, start-only 1 | inferred 18, start-only 1 |

被严格 page-start gate 剔除的是：

| standard_code | reason |
| --- | --- |
| `SC-H4G9-CHG-009` | 只命中华东师大版九上无页码章标题 `第1章 化学反应`；没有可用 `page_start` 的同标准华东师大版 unit evidence。 |

华东师大版严格单批仍通过 candidate audit 与普通 consistency audit；其作用是把 standalone 华东师大版 candidate package 收敛到 page-clean 证据，而不是增加新的标准覆盖。重新合并到科学八版本 aggregate 后，全局候选没有回退：

```json
{
  "merged_candidates": 37,
  "unit_evidence_objects": 58,
  "multi_edition_standards": 10,
  "single_edition_standards": 27,
  "by_grade_band": {
    "H4G7": 12,
    "H4G8": 14,
    "H4G9": 11
  },
  "by_edition": {
    "华东师大版-华东师范大学出版社": 19,
    "武汉版-武汉出版社": 10,
    "科普版-科学普及出版社": 3,
    "浙教版-浙江教育出版社": 11,
    "人教版-人民教育出版社": 5,
    "苏科版-江苏凤凰科学技术出版社": 2,
    "北京版-北京出版社": 2,
    "沪教版-上海教育出版社": 6
  },
  "by_page_range_status": {
    "toc_page_range_inferred": 55,
    "toc_page_start_only": 3
  }
}
```

aggregate candidate audit 和普通 consistency audit 继续通过。发布级 gate 仍失败，仍是覆盖不足而不是页码质量问题：

```json
{
  "standards_below_min_editions": 27,
  "progression_groups": 27,
  "progression_groups_below_min_editions": 14,
  "complete_progression_group_candidates": 1,
  "partial_progression_group_candidates": 26,
  "unit_evidence_missing_page_start": 0,
  "nonmonotonic_page_records": 0
}
```

重新刷新 `math,science --discover-candidates` 后，科学候选覆盖仍为 37 条 standards、27 个 progression groups、8 个 editions；但 candidate coverage 的 page status 已经只剩 `toc_page_range_inferred` 和 `toc_page_start_only`，不再出现 `missing` 或 `toc_page_nonmonotonic`。这说明 worklist 的“已有候选覆盖”现在按 page-clean 口径读取，不再被旧诊断文件污染。后续真正要解决的是“所有完整版本都已经有候选，但发布 gate 仍缺同年级多版本/完整 H4G7-H4G8-H4G9 progression”的 targeted gap remediation，而不是继续机械重复整版 direct_all_grades。

### 8.14 科学 targeted remediation baseline

2026-07-03 对科学八版本 page-clean aggregate 运行 reverse gap 后，问题被拆成三层：

```json
{
  "standards_needing_unit_evidence": 201,
  "candidate_standards": 37,
  "progression_groups_needing_unit_evidence": 67,
  "progression_groups_with_candidates": 27,
  "progression_groups_without_candidates": 40,
  "partial_progression_groups": 26,
  "complete_progression_groups": 1,
  "standards_below_min_editions": 27,
  "progression_groups_below_min_editions": 14,
  "missing_grade_slots": 44,
  "no_candidate_grade_slots": 120,
  "remediation_work_items": 111
}
```

这说明科学的 H4G7/H4G8/H4G9 不应继续按“再跑一个完整版本”理解；主要缺口已经变成：

1. `no_candidate_progression_group`：40 个 progression groups 完全没有单元候选，覆盖 120 个年级槽位。
2. `fill_missing_grade_slot`：26 个 progression groups 已有部分年级候选，但仍缺 44 个 H4G 年级槽位。
3. `standard_below_min_editions`：27 条 standards 低于同年级至少 2 个版本的发布门槛。

当前 remediation action 分布：

| action | work items |
| --- | ---: |
| `recover_page_start` | 2 |
| `review_alignment_or_alias` | 40 |
| `low_score_or_wrong_grade` | 45 |
| `no_match_returned` | 24 |

推荐执行顺序：

1. 先处理 `recover_page_start`，因为它通常是已命中但缺页码的最低风险修复。
2. 再处理 `review_alignment_or_alias`，每次只补标准级、局部、可解释的 alias 或 anchor，不用泛词扩大覆盖。
3. 对 `low_score_or_wrong_grade` 保持阻塞，除非有人工确认的同年级单元证据。
4. 对 `no_match_returned` 进入更深的检索/教材主题定位，而不是降低自动匹配门槛。

该 baseline 只说明下一批该修哪里；它不改变官方课标字段，不写 `public/data`，也不把 partial group 视为已经完成年级分化。

### 8.15 科学 recover_page_start 修复

按 8.14 的低风险顺序，先处理 `recover_page_start`。本轮只接受已有 eligible 匹配且能从 TOC/OCR 明确恢复印刷页码的单元，不放宽标准匹配规则，不写 `public/data`。

新增两个 reviewed page-start overrides：

| standard | edition | unit | recovered page | evidence |
| --- | --- | --- | ---: | --- |
| `SC-H4G9-CHG-009` | 华东师大版-华东师范大学出版社 | `第1章 化学反应` | 1 | 华东师大九上 debug text 中 PDF page 7 为正文章首页；PDF page 8 第一节页脚显示印刷页 2，因此章首页为印刷页 1。 |
| `SC-H4G9-MAT-006` | 北京版-北京出版社 | `第三节 二氧化碳的实验室制法` | 153 | 北京版九上化学目录 PDF page 6 明确列出 `第三节 二氧化碳的实验室制法 153`；原候选标题因 OCR replacement glyph 未能解析页码。 |

同时，`build_textbook_unit_index.js` 的 override title 归一化会忽略 OCR replacement glyph，避免 reviewed override 被 `����` 阻断。该变化只影响人工复核过的 page-start override 匹配，不扩大自动候选匹配口径。

复跑华东师大版和北京版单批后：

```json
{
  "huadong_candidate_standards": 15,
  "huadong_unit_evidence_objects": 21,
  "beijing_candidate_standards": 3,
  "beijing_unit_evidence_objects": 3,
  "target_matches_with_page_start": 2
}
```

重新合并科学八版本 aggregate 后：

```json
{
  "candidate_standards": 38,
  "unit_evidence_objects": 61,
  "multi_edition_standards": 11,
  "single_edition_standards": 27,
  "complete_progression_group_candidates": 2,
  "partial_progression_group_candidates": 25,
  "progression_groups_below_min_editions": 13,
  "unit_evidence_missing_page_start": 0,
  "nonmonotonic_page_records": 0
}
```

刷新 reverse gap 后，`recover_page_start` 已清零：

| metric | before | after |
| --- | ---: | ---: |
| candidate standards | 37 | 38 |
| complete progression groups | 1 | 2 |
| partial progression groups | 26 | 25 |
| missing grade slots | 44 | 43 |
| remediation work items | 111 | 110 |
| `recover_page_start` actions | 2 | 0 |

当前剩余 remediation action 为：

| action | work items |
| --- | ---: |
| `review_alignment_or_alias` | 41 |
| `low_score_or_wrong_grade` | 45 |
| `no_match_returned` | 24 |

发布级 gate 仍失败是预期结果：科学仍有 27 条 standards 低于同年级多版本门槛，并且还有 25 个 partial progression groups。下一步应进入 `review_alignment_or_alias`，每次只处理标准级、局部、可解释的 alias/anchor，不使用泛词兜底。

### 8.16 科学 review_alignment_or_alias triage

`review_alignment_or_alias` 不能直接等同于“应该补 alias”。本轮给 reverse gap audit 增加了 alias review triage，只增强诊断报告，不写 `public/data`，也不修改 `scripts/textbooks/textbook_unit_alignment_aliases.json`。triage 会把每个 `review_alignment_or_alias` work item 拆成三类：

| status | 含义 |
| --- | --- |
| `ready_for_standard_scoped_alias_review` | 具备具体 `standard_code`、页码可用、非目录噪声，并且具体关键词同时得到多个标准字段支撑；仍只表示可进入人工复核，不自动新增 alias。 |
| `needs_source_review` | 有具体概念词或 group-level 线索，但证据字段不足、混有泛词/目录噪声，或缺少具体 `standard_code`，必须回到标准原文和教材源页逐条确认。 |
| `blocked_generic_or_noise` | 高分主要来自 `科学`、`化学`、短词、目录页或过宽单元标题，不能作为 H4G7/H4G8/H4G9 分化证据。 |

复跑科学八版本 reverse gap 后：

```json
{
  "alias_review_items": 41,
  "alias_review_statuses": {
    "blocked_generic_or_noise": 29,
    "needs_source_review": 12
  },
  "alias_review_recommendations": {
    "do_not_add_alias": 29,
    "inspect_standard_and_textbook_source_before_alias": 12
  }
}
```

这说明当前科学没有任何可以直接升级为 `ready_for_standard_scoped_alias_review` 的 alias 候选。29 个 work items 应明确阻断，典型反例包括 `科学` 把 `2.1 阳光`、`6.1 种群`、`8.1 酸` 推成高分，或 `2 目录` 靠 `化学` 得分；这些正是 H4G7/H4G8/H4G9 看起来“几乎一样”的来源。12 个 `needs_source_review` 只能作为回源复核入口，例如 `生物与环境的相互关系`、`二力平衡`、`机械效率`、`低碳生活` 等具体概念，必须确认它们对应的是哪一个年级标准的进阶要求，而不是同一 progression group 的笼统主题。

为避免继续靠临时查询推进，本轮新增 `textbooks:h4g-alias-source-review` 生成 read-only 回源复核包。复跑结果：

```json
{
  "source_review_items": 12,
  "standard_level_items": 6,
  "group_level_items": 6,
  "by_source_review_gate": {
    "decompose_group_before_alias_review": 6,
    "inspect_source_for_single_field_concept_match": 5,
    "reject_or_reparse_noise_before_alias_review": 1
  },
  "candidate_matches": 118,
  "page_ready_candidate_matches": 115,
  "noise_title_candidate_matches": 2
}
```

复核包路径：

```text
generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_alias_source_review_packet.json
generated/textbook_evidence/h4g_runs/science_eight_edition_hujiao_full_page_clean/h4g_alias_source_review_packet.md
```

该 packet 对每个 item 都带上 `progression_group_snapshot`。当前样本组的 `core_text_distinct_count` 仍为 1，`current_progression_distinctiveness` 仍为 `identical_core_fields`，这说明 H4G7/H4G8/H4G9 的核心标准文本还未真正分化；候选教材单元只能作为回源复核线索，不能直接升级为年级专属标准。

下一步原则：

1. 不新增科学 alias，直到某个 work item 同时具备具体 `standard_code`、同年级页码证据、非目录/非泛词标题、多个标准字段支持，以及人工确认的年级进阶差异。
2. Group-level 缺口不得直接补 alias；必须先拆回 H4G7、H4G8、H4G9 的单条 standards，再分别判断。
3. 对 29 个 `blocked_generic_or_noise`，默认关闭 alias 路径，转向改进检索、修正 TOC 噪声或保留 blocked。
4. 对 12 个 `needs_source_review`，先回源确认标准原文和教材页，再决定是否补标准级 alias、补 field anchor，或维持 blocked。

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

标准级 alias 的边界：`reviewed_alias_anchor` 只能由 `scripts/textbooks/textbook_unit_alignment_aliases.json` 中的具体 `standard_code` 触发。例如 `MA-H4G8-ALG-008` 可以用 `二次根式` 补足 H4G8 实数标准的教材单元证据，但不能把 `实数` 全局放宽为 `数轴` 或 `有理数`；`MA-H4G9-GEO-036` 可以用 `投影`、`三视图` 恢复九年级投影与视图证据，但不能让宽泛的 `函数` 或 `平行四边形` 单元通过无关标准。

跨版本年级投放的边界：`h4g_topic_placement_matrix` 中的 cross-grade hit 只能说明“该版本教材在另一个年级讲了这个主题”。它可以解释为什么 `min-editions-per-standard=2` 失败，也可以支持后续人工决策；但不能把八年级教材单元写成七年级 standard 的单元证据。

placement evidence candidate 的边界：`h4g_placement_evidence_candidate` 是 topic placement matrix 的 review pack 化版本。它能把多个 standards 归并到同一个 progression group 下，方便判断是否需要“版本投放差异说明”或调整 publication gate；但它不是 apply 输入，不包含 `proposed_update`，也不得把 cross-grade unit evidence 当作 `textbook_unit_level` 证据。

progression decision matrix 的边界：`h4g_progression_decision_matrix` 是发布前决策层，不是数据写回层。`same_grade_unit_candidate_ready` 只表示同年级、多版本、页码可用的候选可以进入人工复核；`edition_placement_review` 只表示该 progression topic 需要讨论版本投放差异；`continue_gap_remediation` 才表示还需要继续找同年级证据或改进检索。

ready-only candidate 的边界：`h4g_unit_evidence_candidate_ready_only` 继承原 H4G unit candidate schema，因此可以复用 candidate audit、consistency audit 和 apply-to-generated-data-root 流程。它排除了跨版本投放差异和未解缺口，但 `complete_progression_groups` 仍可能为 false，所以它只能证明 record-level 同年级证据已足够进入复核，不代表整组 H4G progression 已完成正式分化。

progression review worklist 的边界：`h4g_progression_review_worklist` 是复核任务层，不是数据写回层。`edition_placement_model_review` 要回答“同一主题跨版本落在不同年级时，进阶模型如何表达”；`same_grade_gap_remediation` 才继续找同年级证据。该 worklist 覆盖 blocked standards 的下一步决策，但不生成 `proposed_update`，不应用候选数据根，也不能把 cross-grade units 写入 same-grade `textbook_unit_evidence_ids`。同一 progression group 如果同时有 placement review 和 gap remediation standards，必须生成两个 work items，并按标准级 decision 保持互斥覆盖。当 `remediation_analysis.decision=keep_blocked_no_safe_same_grade_remediation` 时，应明确保留阻塞状态，不加 alias、不发布，直到出现更强的同年级多版本证据或新的非单元级质量表现证据模型。

edition placement model candidate 的边界：`h4g_edition_placement_model_candidate` 是 worklist 之后的模型复核输入，只处理 `edition_placement_model_review` 项。它可以把完整跨版本投放解释标为 `candidate_for_edition_placement_note`，但这仍不是正式发布字段；`progression_group_edition_placement_note` 必须另经课程进阶复核后设计。partial candidate 继续保留 blocked，不能用不完整、单向或单一 placement grade 的 cross-grade 诊断关系替代 missing edition 的同年级证据。

publication review packet 的边界：`h4g_publication_review_packet` 是三层复核交付包，不是 public apply 输入。它把 `same_grade_unit_evidence_review`、`progression_group_edition_placement_note_review` 和 `blocked_or_partial_review` 拆开，防止把 cross-grade 诊断证据写进 same-grade standard，也防止 blocked standards 混入 ready-only apply。该包可以帮助设计后续正式字段或人工复核清单，但自身不写 `public/data`。

publication contract candidate 的边界：`h4g_publication_contract_candidate` 只定义未来数据契约，不执行迁移。它是 additive contract：标准级 surface 只能写证据/复核字段，不能改官方核心字段；版本投放说明应落在 progression group 粒度，不能落到 same-grade `textbook_unit_evidence_ids`；blocked registry 没有 public surface。

publication contract apply dry-run 的边界：`apply_h4g_publication_contract_candidate` 只把 contract candidate 应用到 generated 候选数据根。它会演练同年级单元证据写入和 progression note candidate collection，但仍保持 `writes_public_data=false`、`official_standard_text_changed=false`，也不让 blocked registry 进入 public surface。当本轮没有 note-ready placement candidates 时，应写出空的 `h4g_progression_notes.json` 并记录 warning，而不是为了满足脚本门槛生成虚假的 note draft。

publication readiness audit 的边界：`audit_h4g_publication_readiness` 是安全审计，不是发布批准。它通过时只说明当前 artifacts 内部一致、未改官方课标文本、blocked 项没有混入 public surface，并且可以进入人工/课程复核；它仍必须保持 `publication_ready=false`，直到人工复核、schema/UI、正式 migration gate 和剩余缺口处理完成。自定义 review packet 路径时，只有显式传入 `--review-decisions-audit` 或加 `--require-review-decisions-audit` 才接入复核决策审计，避免把默认数学 decisions audit 混入科学等其他 run。

publication review decisions 的边界：`h4g_publication_review_decisions_template` 是可编辑复核输入，不是机器自动审批。它只允许 `approve/reject/needs_revision/pending` 等受控决策值；任何 public write、官方课标文本改写、`grade_specific_variant` 自动升级、blocked 项发布、或把 progression note 写入 same-grade evidence 的请求都会被 `audit_h4g_publication_review_decisions` 拦截。

H4G grade differentiation readiness 的边界：`grade7_9:audit-h4g-grade-differentiation` 是显示层/发布层质量 gate。它不改变数据，只统计 H4G 记录是否具备可用 `grade_specific_focus`、`textbook_unit_level` 证据和已批准的人工/课程复核状态。当前 public 报告 `unit_level_evidence_records=45`、`final_ready_records=45`、`final_ready_groups=1`；数学 28 条、科学 17 条已经过 reviewed publication gate。全量仍为 `differentiation_ready=false`，因为 1036 条 H4G records 仍缺已审核的单元级证据或年级焦点。

publication review decisions apply 的边界：`textbooks:apply-h4g-publication-review-decisions` 是 generated-root dry-run，不是正式发布。它复制 `data_candidate_publication_contract` 到 `data_candidate_review_decisions` 或本轮指定的 `data_candidate_codex_reviewed`，只根据已填写的 same-grade 决策更新标准记录的复核状态；pending 不改数据，progression note/blocker 决策只写 sidecar 摘要，不会写入 same-grade evidence，也不会改变官方课标字段。当前全部 pending 时应显示 `applied_standard_decisions=0`；science Codex reviewed 候选根显示 `applied_standard_decisions=17`、`reviewed_blocked_decisions=24`、`publication_ready=false`。

reviewed publication gate 的边界：`textbooks:publish-h4g-reviewed-candidate` 是当前唯一允许把 reviewed H4G same-grade unit evidence 写入正式 `public/data` 的命令。默认 dry-run；正式写入必须同时传入 `--write --confirm-reviewed-h4g-publication --strict`。该 gate 只接收 `data_candidate_codex_reviewed` 这类已完成决策 apply 的候选根，只发布 `review_status=unit_evidence_approved`、`evidence_granularity=textbook_unit_level`、非候选 `grade_specific_focus` 的标准记录，并拒绝官方核心字段变更。当前发布摘要为 `applied_records=45`、`by_subject={math:28,science:17}`、`by_grade_band={H4G7:14,H4G8:16,H4G9:15}`、`official_standard_text_changed=false`。

publication review recommendations 的边界：`textbooks:h4g-publication-review-recommendations` 是受控复核决策候选生成器，不是正式发布器。它读取 pending 的 decisions template 和 publication review packet，只对已经满足多版本同年级证据、页码安全、alignment 安全的 same-grade standards 填入 `approve_same_grade_unit_evidence`；只对 high-confidence 的 progression group 候选填入 `approve_progression_group_note`；blocked reviews 继续保持 blocked/remediation 状态。它仍保持 `writes_public_data=false`、`publication_ready=false`、`official_standard_text_changed=false`，输出文件必须继续通过 `audit-h4g-publication-review-decisions -- --require-complete` 和 generated-root apply/audit gates。

blocked remediation packet 的边界：`textbooks:h4g-blocked-remediation-packet` 是复核/补证据行动层，不是决策 apply 层。它只把已经 blocked 的 standards 分配到 placement partial review、source review、missing edition evidence collection 或 keep-blocked 路径；任何 item 都不能绕过 source review、same-grade evidence gate 或课程进阶复核直接写入 `grade_specific_focus`、`textbook_unit_evidence_ids`、progression note 或正式 `public/data`。

H4G subject readiness matrix 的边界：`grade7_9:audit-h4g-subject-readiness` 是总览型数据质量画像，不是发布 gate。它把每个学科的 H4G 总量、完整三元组、核心文本重复、单元证据、待复核候选、final-ready 记录和建议下一步整理成一张 compact matrix，用于决定下一批应该优先补单元证据、补复核决策，还是处理低置信度来源缺口。

H4G subject theme bridge gap audit 的边界：`textbooks:audit-h4g-theme-bridge-gaps` 是学科桥接缺口审计，不是匹配器或发布 gate。它读取已执行 work item 的 `textbook_unit_index.json`、标准匹配结果和可选低阈值诊断匹配，专门识别“真实单元已经存在，但当前标准-单元匹配无法生成 H4G 候选证据”的情况。当前 English/PE 审计命令如下：

```bash
npm run textbooks:audit-h4g-theme-bridge-gaps -- \
  --run-dirs generated/textbook_evidence/h4g_runs/h4g_unit_work_english_89497c34,generated/textbook_evidence/h4g_runs/h4g_unit_work_pe_6aec3166 \
  --out generated/textbook_evidence/h4g_theme_bridge_gaps_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_gaps_english_pe.md \
  --strict \
  --require-items
```

当前结果生成 2 个 bridge work items：English 为 `bilingual_topic_bridge_required`，PE 为 `curriculum_activity_theme_bridge_required`。English 有 47 个真实 module/unit/revision module 候选，默认匹配 0、低阈值匹配 0、eligible 0，说明中文课标能力描述与英文单元标题在当前 token 模型下不可比；PE 有 13 个真实章节/活动候选，默认匹配 0、低阈值弱匹配 114、eligible 0，说明“运动”“健康”等泛词不足以支撑证据升级。两个学科都还有 page start gap：English 16/47，PE 1/13。

该审计只输出诊断和 recommended actions，不写 `public/data`，不新增 alias，也不改官方课标原文。English/PE 的下一步应先建立可复核的学科主题桥接层：English 需要受控双语主题表，把英文 unit/module 标到中文课程主题；PE 需要运动项目/健康/体能/专项技能主题表，把活动标题和课程能力项建立受控映射。桥接映射必须绑定学科、年级/版本、progression group 或 standard code，并带 source/review status；不能通过降低阈值或把泛词扩散成全局 alias 来绕过 evidence gate。

详细数据契约和进阶判定规则见 `docs/H4G_SUBJECT_THEME_BRIDGE_PLAN.md`。

H4G subject theme bridge review packet 的边界：`textbooks:h4g-theme-bridge-review` 和 `textbooks:audit-h4g-theme-bridge-review` 是 English/PE 主题桥接的 review-only gate。它们读取 `scripts/textbooks/h4g_subject_theme_taxonomy.json`、已执行 work item 的 `textbook_unit_index.json` 和当前 H4G standards，生成同学科同年级的待复核 bridge candidates；所有候选都保持 `review_status=needs_source_review`、`eligible_for_h4g_differentiation=false`、`writes_public_data=false`。

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

初始 English/PE review packet 结果为 `valid=true`：生成 60 个 unit theme items、95 个 progression theme items、515 个 bridge review candidates，其中 English 340 条、PE 175 条；全部 670 个 review items 都是 `needs_source_review`。audit 也为 `valid=true`，确认没有 public write、没有官方文本变更、没有未复核 eligible evidence、没有跨年级 same-grade candidate。当时仍有 421 条 bridge candidates 缺 page-ready evidence，后续不能进入 publication gate，必须先做页码补证据或 source review。

H4G subject theme bridge review decisions 的边界：`textbooks:h4g-theme-bridge-review-decisions` 和 `textbooks:audit-h4g-theme-bridge-review-decisions` 把 review packet 中的 bridge candidates 转成可编辑 source review 决策文件。它们不写 `public/data`、不改官方课标、不批准直接 matcher use；批准只表示该 bridge 已经过 source review，可作为后续 matcher gate 的输入候选。

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

当前 decisions template 为 `valid=true`：515 条必需 source review decisions，English 340 条、PE 175 条；按年级为 `H4G7=216`、`H4G8=160`、`H4G9=139`；R2/R3 页码恢复后为 254 条 page-ready、261 条缺页码。audit 为 `valid=true`，但 `source_review_complete=false`、`matcher_ready=false`、`publication_ready=false`，并提示 515 条仍 pending。真实复核完成后，可用 `--require-complete` 要求全部填写；如果本轮目标是 publication-page eligible bridge，还应加 `--require-page-ready-for-approval`。

H4G subject theme bridge review worklist 的边界：`textbooks:h4g-theme-bridge-review-worklist` 和 `textbooks:audit-h4g-theme-bridge-review-worklist` 只负责把 source review decisions 排成可执行队列。它们会暴露 page recovery、broad topic tag、unit overmatch、quality/performance standard 等风险，但不改变 decisions，不审批 bridge，也不启用 matcher。

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

当前 worklist 为 `valid=true`：515 个 work items 全覆盖 decisions；R2/R3 页码恢复后为 254 个 `source_review_ready`、261 个 `page_recovery_then_source_review`，优先级为 `P1=57`、`P2=197`、`P3=3`、`P4=258`。audit 为 `valid=true`，但仍警告 261 个 work items 进入 publication gate 前需 page recovery。H4G8 已无 page recovery 项，复核建议先从 P1 且 page-ready 的项目开始，再处理 high fan-out unit 和 broad topic tag。

H4G subject theme bridge source review batch 的边界：`textbooks:h4g-theme-bridge-review-batch` 和 `textbooks:audit-h4g-theme-bridge-review-batch` 把 worklist 中某个可执行批次整理成审前阅读包。它会补齐 `public/data/by_subject` 中的官方标准原文、context、practice、teaching tip、assessment evidence type，以及单元页码和 topic/fan-out 风险；但 batch 不改变 source decisions，不批准 bridge，也不启用 matcher。

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

R1 页码恢复前的 P1 batch 为 `valid=true`：27 个 batch items，全部是 English/H4G7、`source_review_ready` 且 page-ready；所有 decisions 仍为 `pending`。这不是 7/8/9 覆盖完成的信号，而是数据质量排序结果：P2 中有 H4G7 和少量 H4G9 page-ready items；H4G8 当时的主题桥接候选全部需要 page recovery 后才能进入 publication gate。

R2/R3 页码恢复和 P1 recommendation 后，batch builder/audit 新增两个筛选参数：

| 参数 | 作用 |
| --- | --- |
| `--min-priority` | 与 `--max-priority` 组合成 priority range，避免下一批 `P2` 把已经审过的 `P1` 混进来。 |
| `--reviewer-decisions` | 只选择指定当前决策状态，如 `pending`；默认 `all`，保持旧行为。 |

使用 P1 reviewed decisions 生成 after-P1 worklist 后，可以精确抽取下一批 P2 pending/page-ready source review：

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

npm run textbooks:audit-h4g-theme-bridge-review-batch -- \
  --batch generated/textbook_evidence/h4g_theme_bridge_review_batch_p2_pending_after_p1_english_pe.json \
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_after_p1_codex_reviewed_english_pe.json \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_batch_p2_pending_after_p1_english_pe_audit.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_batch_p2_pending_after_p1_english_pe_audit.md \
  --strict \
  --require-items \
  --min-priority 2 \
  --max-priority 2 \
  --review-path source_review_ready \
  --reviewer-decisions pending
```

当前 P2 pending batch 为 `valid=true`：197 条全部 page-ready、全部 pending、全部 P2；English 179 条、PE 18 条；年级分布为 `H4G7=57`、`H4G8=130`、`H4G9=10`。这批的统一 next step 是 `source_review_exact_standard_to_unit_relationship_before_any_approval`，因为风险集中在高 fan-out 和宽主题：182 条 `unit_overmatches_many_standards`、193 条 `single_shared_topic_tag`、131 条 `standard_has_many_bridge_candidates`。它打开了 H4G9 审阅入口，但不代表可以直接生成 approved registry。

对 P2 batch 运行保守 recommendation：

```bash
npm run textbooks:h4g-theme-bridge-review-recommendations -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe.json \
  --batch generated/textbook_evidence/h4g_theme_bridge_review_batch_p2_pending_after_p1_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_p2_codex_reviewed_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_p2_codex_reviewed_english_pe.md \
  --strict \
  --require-items

npm run textbooks:audit-h4g-theme-bridge-review-decisions -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_p2_codex_reviewed_english_pe.json \
  --packet generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_p2_codex_reviewed_english_pe_audit.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_p2_codex_reviewed_english_pe_audit.md \
  --strict \
  --require-page-ready-for-approval
```

结果为 `valid=true`：254 条 completed source review decisions，18 条 approved、16 条 rejected、220 条 needs_revision、261 条 pending。P2 没有新增 approved bridge；after-P2 registry 仍为 18 条，全部来自 P1 且 page-ready。因此 matcher 可用面没有扩大，source review 风险被收敛到“只有 P1 强关系可进入 registry；P2 需要更窄 topic/alias 或课程复核”。

after-P2 worklist 显示剩余 261 条 pending 全部为 `page_recovery_then_source_review`，没有 page-ready pending 项。剩余缺口按 subject/grade 为：PE H4G7 113 条、English H4G9 99 条、PE H4G9 30 条、English H4G7 19 条。下一步应优先做 H4G9 和 H4G7 page recovery，而不是继续扩大 automatic approval。

H4G subject theme bridge page recovery batch 的边界：`textbooks:h4g-theme-bridge-page-recovery` 和 `textbooks:audit-h4g-theme-bridge-page-recovery` 面向缺页码项，不做 source review。它把 `page_recovery_then_source_review` work items 按教材单元聚合，生成 `textbook_unit_page_start_overrides.json` 的填写模板；只有真实 TOC/OCR/页脚证据确认 page_start 后，才能把 page recovery 写入 override 文件并重跑 unit index 与后续 bridge gates。

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

初始 H4G8 page recovery batch 为 `valid=true`：160 条 page-missing work items 聚合为 9 个 recovery units，English 8 个、PE 1 个，分布在 3 个教材文件。优先级为 `R1=5`、`R2=2`、`R3=1`、`R4=1`；R1 覆盖 `Unit 1 Let’s try to speak English as much`、`Unit 2 I feel nervous when I speak Chinese.`、`Unit 2 You should smile at her!`、`第三章 足球`、`Unit 3 Language in use`。audit 为 `valid=true`，但这些项目仍只是 page recovery tasks，不是 approved bridge。

H4G8 R1 page recovery 已完成第一批 reviewed overrides：英语八上 3 个单元、英语八下 1 个单元、体育八年级全一册 1 个章节，共 5 条 `page_start`。证据均来自 PDF text layer 中的正文标题和页脚，体育同时有 TOC 页码与正文页脚互相确认。重跑 English/PE run-level unit index 后，English page-start candidates 从 16 增至 20，PE 从 1 增至 2；重跑 theme bridge packet 后，page-ready bridge candidates 从 94 增至 226，page-missing bridge candidates 从 421 降至 289。R1 后 H4G8 worklist 分布为 English `source_review_ready=110`、PE `source_review_ready=22`、English `page_recovery_then_source_review=28`；P1 source review batch 为 54 条，其中 H4G7 27 条、H4G8 27 条。

H4G8 R2/R3 page recovery 已完成剩余 3 个 English 单元：八下 `Unit 3 Language in use` page_start 6、八上 `Unit 1 It’s taller than many other buildings.` page_start 10、八下 `Unit 1 It smells delicious.` page_start 2。证据来自 Scope and sequence 的模块页码、PDF text layer 正文标题和同页页脚。重跑后，English page-start candidates 从 20 增至 23；theme bridge packet 的 page-ready bridge candidates 增至 254，page-missing bridge candidates 降至 261。H4G8 的 `page_recovery_then_source_review` 已归零，160 条全部进入 `source_review_ready`（English 138、PE 22）；最新 P1 source review batch 为 57 条，其中 H4G7 27 条、H4G8 30 条。

after-P2 H4G9 page recovery batch：

```bash
npm run textbooks:h4g-theme-bridge-page-recovery -- \
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_after_p2_codex_reviewed_english_pe.json \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_p2_codex_reviewed_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_page_recovery_batch_h4g9_after_p2_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_page_recovery_batch_h4g9_after_p2_english_pe.md \
  --strict \
  --require-items \
  --grade-bands H4G9
```

审计为 `valid=true`：129 条 linked work items 聚合为 9 个 recovery units，English 7 个、PE 2 个，分布在 `ctb_0ad2b1e46e08`、`ctb_836e0338edc2`、`ctb_028db4ce8af0` 三个教材文件。优先级为 `R1=2`、`R2=4`、`R3=3`。R1 是两个 English `Unit 3 Language in use`；R2 是 English `Unit 1 It’s more than 2,000 years old.`、`Unit 2 The Grand Canyon was not just big.`，以及 PE `合理安排运动负荷`、`第一节 运动负荷的自我监测`。

after-P2 H4G7 page recovery batch 也已生成并审计为 `valid=true`：132 条 linked work items 聚合为 12 个 recovery units，English 3 个、PE 9 个，分布在 `ctb_b2ca748e7eca` 和 `ctb_7f9265bf475e` 两个教材文件。R1 是 PE 七年级 `第三章 足 球`、`第四章 篮 球`、`第五章 排 球`、`第六章 乒乓球`。这两个 page recovery batch 均只生成 override 模板，不填页码、不批准 bridge、不启用 matcher。

after-P2 H4G7/H4G9 page recovery 已完成第一批 reviewed overrides，共 11 条，写入 `scripts/textbooks/textbook_unit_page_start_overrides.json`。本轮确认了 H4G9 English 上册 `Unit 1 It’s more than 2,000 years old.` page_start 2、`Unit 2 The Grand Canyon was not just big.` page_start 4、`Unit 3 Language in use` page_start 6；H4G9 English 下册 `Unit 3 Language in use` page_start 6；H4G9 PE `第一节 运动负荷的自我监测` 与 `合理安排运动负荷` page_start 1；H4G7 PE 足球、篮球、排球、乒乓球章节 page_start 分别为 34、40、47、51；H4G7 English 下册 `Unit 3 Language in use` page_start 6。

重跑 run-level unit index 后，English 仍为 47 个真实 unit candidates、page-start candidates 从 23 增至 28；PE 仍为 13 个真实 unit candidates、page-start candidates 从 2 增至 8。后续没有采用重排后的 packet 作为 official review state，因为 top candidate 排序会让 14 条旧 P1/P2 reviewed decisions 离开新的 top-4 surface；当前采用保守刷新策略：保留原 515 条 decisions 与 254 条 P1/P2 审阅结论，只从最新 unit index 刷新 page fields。保守 decisions 审计为 `valid=true`，page-ready decisions 为 472、page-missing decisions 为 43，approved 仍为 18 且全部 page-ready。

基于该 page-recovered decisions 生成的新 worklist 审计为 `valid=true`：472 条 `source_review_ready`、43 条 `page_recovery_then_source_review`。新的 pending source review batch 审计为 `valid=true`：218 条全部 page-ready、全部 pending、全部 P2，分布为 H4G7 103 条、H4G9 115 条，English 100 条、PE 118 条。剩余 page recovery batch 审计为 `valid=true`：43 条 linked work items 聚合为 10 个 recovery units，English 5 个、PE 5 个；这些项目仍必须先补页码，再进入 source review。

after-page-recovery pending batch 已完成一轮保守 source review recommendation：218 条 batch decisions 中没有新增 approval，明确错配项被 reject，其余宽主题项进入 needs_revision。新 decisions 审计为 `valid=true`：472 条 completed、43 条 pending；决策分布为 approved 18、rejected 80、needs_revision 374、pending 43。所有 approved rows 均 page-ready，且 pending rows 全部仍为 page-missing。基于该 decisions 导出的 registry 仍为 18 条 approved bridges，matcher-ready 但 publication-ready 仍为 false；新的 remaining page recovery batch 仍是 43 条 linked work items / 10 个 recovery units。

remaining page recovery 也已完成：新增 10 条 reviewed overrides 后，English run-level unit index 保持 47 个真实 candidates、page-start candidates 增至 33；PE 保持 13 个真实 candidates、page-start candidates 增至 13。full-page-recovered decisions 保留原 515 条 decision surface 和所有既有 reviewer decisions，只刷新 page fields，审计为 `valid=true`：515 条全部 page-ready、0 条 page-missing。最后 43 条 pending/full-page-recovered batch 审计为 `valid=true`，随后 conservative recommendation 将所有 decisions 推进到 completed：approved 18、rejected 83、needs_revision 414、pending 0。严格 decisions audit 带 `--require-complete --require-page-ready-for-approval` 通过，registry 仍为 18 条 approved bridges、`publication_ready=false`。

H4G subject theme bridge remediation packet 的边界：`textbooks:h4g-theme-bridge-remediation-packet` 和 `textbooks:audit-h4g-theme-bridge-remediation-packet` 只读取已完成 source review 的 decisions/worklist，并只抽取 `needs_revision` rows。当前 packet 为 `valid=true`：414 个 remediation items，覆盖 155 条 standards、70 个 progression groups；audit 也为 `valid=true`，`expected_needs_revision_decisions=414`、`missing_decision_coverage=0`、`extra_decision_coverage=0`。它把后续工作拆成 action family、priority 和 decision owner，但仍不批准 bridge、不写 `public/data`、不改官方文本、不启用 matcher。

H4G subject theme bridge progression matrix 的边界：`textbooks:h4g-theme-bridge-progression-matrix` 和 `textbooks:audit-h4g-theme-bridge-progression-matrix` 把 remediation packet 与 approved bridge registry 上卷到 `progression_group_id`。当前 matrix 为 `valid=true`：70 个 progression groups、414 个 remediation items、18 条 approved bridges；audit 为 `valid=true`，`expected_source_groups=70`、`missing_source_groups=0`、`extra_matrix_groups=0`。它明确记录 `complete_h4g_triplet_approved_groups=0`，也就是 English/PE 仍没有任何七、八、九年级完整 approved bridge progression group；两个 complete groups 只是单/部分年级 public group，不可误读为完整 H4G 分化。

H4G subject theme bridge source review recommendation 的边界：`textbooks:h4g-theme-bridge-review-recommendations` 读取一个 decisions template 和一个 source review batch，生成新的 reviewed decision candidate 文件。它只更新 batch 内出现的 decisions；未进入 batch 的 rows 保持 `pending`。该命令可以用于 Codex/规则化第一轮复核，但它仍不写 `public/data`、不改官方课标文本、不让系统 publication-ready。

```bash
npm run textbooks:h4g-theme-bridge-review-recommendations -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --batch generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe.md \
  --strict \
  --require-items

npm run textbooks:audit-h4g-theme-bridge-review-decisions -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe.json \
  --packet generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe_audit.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe_audit.md \
  --strict \
  --require-page-ready-for-approval
```

当前 P1 recommendation 结果为 `valid=true`：57 条 batch decisions 被审阅，18 条 `approve_standard_scoped_subject_theme_bridge`，9 条 `reject_subject_theme_bridge`，30 条 `needs_revision`，其余 458 条仍 pending。审批只放行强 standard-scoped 关系，例如七年级英语 greetings/identity 单元与对应沟通/策略 standards、八年级英语 `Let’s try to speak English as much` 与学习策略/主题 standards、八年级体育 `第三章 足球` 与足球/球类专项技能 standards；PE 足球单元误连到田径、体操、水上、传统体育、新兴体育等项目时被显式拒绝。audit 同时确认 18 条 approved bridges 全部 page-ready，`matcher_ready=false`、`publication_ready=false`。

H4G subject theme bridge registry 的边界：`textbooks:h4g-theme-bridge-registry` 和 `textbooks:audit-h4g-theme-bridge-registry` 是 matcher 前的 approved bridge 导出 gate。它们只读取 approved source review decisions；pending、rejected、needs_revision 都不会进入 registry。registry 仍只写 generated artifact，不写 `public/data`，也不代表 publication ready。

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

当前 English/PE 全部 decisions 仍为 pending，因此 registry 为 `valid=true`、`approved_bridges=0`。`match_standards_to_textbook_units.js` 已支持读取 approved registry：命中后会输出 `eligible_alignment=reviewed_subject_theme_bridge` 和 `subject_theme_bridge_alignment`；registry 为空时不改变现有匹配结果。临时正向验证显示：1 条 approved standard-scoped bridge 可生成 1 条 English eligible match，并能进入 H4G candidate/audit；但如果 page_start 缺失，candidate audit 仍会警告，`--require-page-start` 或 publication page gate 仍可继续拦截。

如果改用 P1 recommendation candidate 作为 registry 输入，当前 P1 registry 为 `valid=true`、`matcher_ready=true`、`publication_ready=false`，包含 18 条 approved bridges：English 15 条、PE 3 条；H4G7 12 条、H4G8 6 条；全部为 `standard_code` scope 且 page-ready。用该 registry 复跑 matcher 后，English 得到 15 条 `reviewed_subject_theme_bridge` eligible matches、8 条 candidate standards、15 个单元证据对象；PE 得到 3 条 eligible matches、3 条 candidate standards、3 个单元证据对象。两个 candidate audit 和普通 consistency audit 都为 `valid=true`，但 consistency audit 仍报告 `cross_version_consistency_proven=false`、`complete_progression_groups=false`，因为这些 P1 候选都只有单一教材版本支撑。因此 P1 registry 可用于继续复核链路和 matcher 验证，不能进入正式 reviewed publication gate。

## 10. 下一步

建议顺序：

1. 先以数学、科学为试点，因为概念链和教材单元结构最清楚。
2. 数学六版本 page-clean 已完成正式发布：ready-only 候选为 28 条 standards、176 个单元证据对象，全部为多版本同年级证据；Codex reviewed 决策批准 28 条 same-grade evidence 和 3 条 progression note，2 条保持 targeted remediation。正式 public 当前数学 `final_ready_records=28`、`final_ready_groups=1`，仍有 86 条数学 H4G records 需要继续补同年级单元证据或处理版本投放差异。
3. 科学八版本已完成匹配噪声修复、候选合并、publication review 分层和 Codex reviewed 决策 dry-run：decision matrix 覆盖 201 条科学 H4G standards，其中 17 条进入 `same_grade_unit_candidate_ready`，12 条进入 `edition_placement_review`，13 条进入 `continue_gap_remediation`，153 条仍不在当前 unit candidate scope。ready-only 候选为 17 条 standards、42 个单元证据对象，全部满足至少 2 个版本、页码起始可用、无非单调页码；但 17 条 ready records 仍分散在不同 progression groups，科学当前 `final_ready_groups=0`。下一步应按 remediation packet 处理 10 个 placement partial 和 14 个 gap remediation，并继续补齐缺年级/缺版本证据，而不是把 cross-grade 诊断证据写入 same-grade evidence。
4. 英语和体育的下一步不是继续调通用关键词阈值：英语外研社已能解析 47 个真实 `Module/Unit/Revision module` 候选但标准匹配为 0；体育人教版已能解析 13 个真实候选但标准匹配为 0。两者都需要学科级主题桥接/标准级 alias source review，把中文能力标准和教材主题标题建立受控映射。
5. 为少量教材建立稳定 PDF/OCR 缓存，避免每次依赖 GitHub 懒加载。
6. 对剩余数学/科学缺口继续使用 reverse gaps、topic placement matrix 和 blocked remediation packet，优先处理 `review_alignment_or_alias` 中可回源确认的 standards。
7. 对单版本学科语文、道德与法治，先生成诊断型 unit work item 和人工主题桥接清单；在没有至少两个同年级版本前，不进入 reviewed publication gate。
8. 对信息科技、劳动，先解决 source/textbook coverage 或替代质量证据模型；当前 132 条仍是 `needs_grade_differentiation_low_confidence`。
9. 对已完成人工/课程复核的候选根，使用 `textbooks:publish-h4g-reviewed-candidate -- --write --confirm-reviewed-h4g-publication --strict` 进入正式 public 写入 gate。
10. 写入后必须重跑 `build:indexes`、`validate:indexes`、`grade7_9:audit-h4g-grade-differentiation`、`grade7_9:audit-h4g-distinctiveness -- --strict`、`grade7_9:audit-grade-band-policy -- --data-only --strict` 和 `npm run build`。
