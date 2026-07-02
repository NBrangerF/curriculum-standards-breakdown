# 教材单元证据管线

更新时间：2026-07-02

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
| `eligible_alignment` | `subdomain_anchor`、`reviewed_alias_anchor`、`strong_field_alignment` 或 `none`。 |
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

progression review worklist 的边界：`h4g_progression_review_worklist` 是复核任务层，不是数据写回层。`edition_placement_model_review` 要回答“同一主题跨版本落在不同年级时，进阶模型如何表达”；`same_grade_gap_remediation` 才继续找同年级证据。该 worklist 覆盖 blocked standards 的下一步决策，但不生成 `proposed_update`，不应用候选数据根，也不能把 cross-grade units 写入 same-grade `textbook_unit_evidence_ids`。当 `remediation_analysis.decision=keep_blocked_no_safe_same_grade_remediation` 时，应明确保留阻塞状态，不加 alias、不发布，直到出现更强的同年级多版本证据或新的非单元级质量表现证据模型。

edition placement model candidate 的边界：`h4g_edition_placement_model_candidate` 是 worklist 之后的模型复核输入，只处理 `edition_placement_model_review` 项。它可以把完整跨版本投放解释标为 `candidate_for_edition_placement_note`，但这仍不是正式发布字段；`progression_group_edition_placement_note` 必须另经课程进阶复核后设计。partial candidate 继续保留 blocked，不能用不完整的 cross-grade 诊断关系替代 missing edition 的同年级证据。

publication review packet 的边界：`h4g_publication_review_packet` 是三层复核交付包，不是 public apply 输入。它把 `same_grade_unit_evidence_review`、`progression_group_edition_placement_note_review` 和 `blocked_or_partial_review` 拆开，防止把 cross-grade 诊断证据写进 same-grade standard，也防止 blocked standards 混入 ready-only apply。该包可以帮助设计后续正式字段或人工复核清单，但自身不写 `public/data`。

publication contract candidate 的边界：`h4g_publication_contract_candidate` 只定义未来数据契约，不执行迁移。它是 additive contract：标准级 surface 只能写证据/复核字段，不能改官方核心字段；版本投放说明应落在 progression group 粒度，不能落到 same-grade `textbook_unit_evidence_ids`；blocked registry 没有 public surface。

publication contract apply dry-run 的边界：`apply_h4g_publication_contract_candidate` 只把 contract candidate 应用到 generated 候选数据根。它会演练 19 条同年级单元证据写入和 5 条 progression note candidate collection，但仍保持 `writes_public_data=false`、`official_standard_text_changed=false`，也不让 blocked registry 进入 public surface。

publication readiness audit 的边界：`audit_h4g_publication_readiness` 是安全审计，不是发布批准。它通过时只说明当前 artifacts 内部一致、未改官方课标文本、blocked 项没有混入 public surface，并且可以进入人工/课程复核；它仍必须保持 `publication_ready=false`，直到人工复核、schema/UI、正式 migration gate 和剩余缺口处理完成。

publication review decisions 的边界：`h4g_publication_review_decisions_template` 是可编辑复核输入，不是机器自动审批。它只允许 `approve/reject/needs_revision/pending` 等受控决策值；任何 public write、官方课标文本改写、`grade_specific_variant` 自动升级、blocked 项发布、或把 progression note 写入 same-grade evidence 的请求都会被 `audit_h4g_publication_review_decisions` 拦截。

H4G grade differentiation readiness 的边界：`grade7_9:audit-h4g-grade-differentiation` 是显示层/发布层质量 gate。它不改变数据，只统计 H4G 记录是否具备可用 `grade_specific_focus`、`textbook_unit_level` 证据和已批准的人工/课程复核状态。当前 public 应报告 `unit_level_evidence_records=0`、`final_ready_records=0`；数学 publication contract 候选根应报告 19 条 `candidate_needs_review`，但仍不是最终发布 ready。

publication review decisions apply 的边界：`textbooks:apply-h4g-publication-review-decisions` 是 generated-root dry-run，不是正式发布。它复制 `data_candidate_publication_contract` 到 `data_candidate_review_decisions`，只根据已填写的 same-grade 决策更新标准记录的复核状态；pending 不改数据，progression note/blocker 决策只写 sidecar 摘要，不会写入 same-grade evidence，也不会改变官方课标字段。当前全部 pending 时应显示 `applied_standard_decisions=0`。

publication review recommendations 的边界：`textbooks:h4g-publication-review-recommendations` 是受控复核决策候选生成器，不是正式发布器。它读取 pending 的 decisions template 和 publication review packet，只对已经满足多版本同年级证据、页码安全、alignment 安全的 same-grade standards 填入 `approve_same_grade_unit_evidence`；只对 high-confidence 的 progression group 候选填入 `approve_progression_group_note`；blocked reviews 继续保持 blocked/remediation 状态。它仍保持 `writes_public_data=false`、`publication_ready=false`、`official_standard_text_changed=false`，输出文件必须继续通过 `audit-h4g-publication-review-decisions -- --require-complete` 和 generated-root apply/audit gates。

H4G subject readiness matrix 的边界：`grade7_9:audit-h4g-subject-readiness` 是总览型数据质量画像，不是发布 gate。它把每个学科的 H4G 总量、完整三元组、核心文本重复、单元证据、待复核候选、final-ready 记录和建议下一步整理成一张 compact matrix，用于决定下一批应该优先补单元证据、补复核决策，还是处理低置信度来源缺口。

## 10. 下一步

建议顺序：

1. 先以数学、科学为试点，因为概念链和教材单元结构最清楚。
2. 为少量教材建立稳定 PDF/OCR 缓存，避免每次依赖 GitHub 懒加载。
3. 对数学先使用 `textbooks:audit-h4g-topic-placement` 区分“同年级证据不足”和“跨版本年级投放差异”，再用 `textbooks:h4g-placement-candidates` 生成 progression group 级 review pack。
4. 使用 `textbooks:h4g-progression-decisions` 合并同年级证据、reverse gaps 和投放差异，形成可复核的发布前决策矩阵。
5. 使用 `textbooks:h4g-ready-unit-candidates` 把 record-level ready 的 standards 过滤成隔离 QA 候选包，并在 generated data root 上验证。
6. 用 `textbooks:h4g-progression-review-worklist` 固化 blocked standards 的复核入口，区分 `edition_placement_model_review` 和 `same_grade_gap_remediation`。
7. 用 `textbooks:h4g-edition-placement-model` 将可解释的跨版本投放差异升级为 progression group 级模型候选，同时保留 partial topics 的 blocked 状态。
8. 用 `textbooks:h4g-publication-review` 把同年级单元证据、版本投放说明候选和 blocked items 合成互斥的发布前复核包。
9. 用 `textbooks:h4g-publication-contract` 和 `textbooks:apply-h4g-publication-contract` 先在 generated 候选根演练未来字段契约。
10. 用 `textbooks:audit-h4g-publication-readiness` 确认 review packet、contract、候选根、notes 和 blocked registry 一致，且仍未越界成正式发布。
11. 用 `textbooks:h4g-publication-review-decisions` 生成可编辑复核决策模板，并用 `textbooks:audit-h4g-publication-review-decisions` 审计其边界。
12. 用 `textbooks:audit-h4g-publication-readiness -- --strict --require-review-decisions-audit` 把决策审计结果接回 readiness summary。
13. 用 `textbooks:apply-h4g-publication-review-decisions -- --strict` 生成决策 apply dry-run 根；当前 pending 模板应不改变任何标准复核状态。
14. 用 `grade7_9:audit-h4g-grade-differentiation -- --data-root generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_review_decisions` 区分 candidate focus 与 final ready。
15. 用 `grade7_9:audit-h4g-subject-readiness` 生成学科级 readiness matrix，确认当前最大缺口仍是缺单元证据还是缺复核决策。
16. 用 `textbooks:h4g-publication-review-recommendations -- --strict` 生成 Codex reviewed 决策候选；该文件仍在 generated 层，不写 public。
17. 对 reviewed 决策候选使用 `textbooks:audit-h4g-publication-review-decisions -- --strict --require-complete`，再用 `textbooks:apply-h4g-publication-review-decisions -- --require-complete` 应用到新的 generated 候选根。
18. 用 `grade7_9:audit-h4g-grade-differentiation` 验证 reviewed 候选根中 19 条数学 standards 是否进入 final-ready 统计。
19. 用 `grade7_9:audit-h4g-subject-readiness -- --data-root generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_codex_reviewed` 复核 reviewed 候选根的学科矩阵，确定下一批优先学科。
20. 补充跨版本一致性、真实人工/课程进阶复核状态，并复核剩余未覆盖学科和 standards。
21. 设计通过复核的候选包 apply 流程，再进入正式 public 写入 gate；正式发布前 `grade7_9:audit-h4g-grade-differentiation -- --require-ready` 必须通过。
