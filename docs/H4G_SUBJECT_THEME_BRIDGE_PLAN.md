# H4G Subject Theme Bridge Plan

更新时间：2026-07-03

本文定义 H4G7/H4G8/H4G9 在“官方源标准为 7-9 共享文本”时，如何通过教材单元和学科主题桥接来确定年级进阶关系。它是 English/PE 下一阶段的执行边界，不是 public data migration。

## 1. 当前问题

H4G records 的核心文本大量相同，不是单个脚本误判，而是官方源标准本身以第四学段覆盖 7-9 年级。当前 public 只允许在两个条件都满足时呈现年级化重点：

1. 保留官方 `standard` 原文，不伪造逐年级课标。
2. 用同年级教材单元证据和复核状态补出 `grade_specific_focus`。

数学和科学已有 45 条 records 通过 reviewed publication gate。English/PE 的阻塞不同：

| subject | real units | default matches | low-threshold matches | eligible | root cause |
| --- | ---: | ---: | ---: | ---: | --- |
| english | 47 | 0 | 0 | 0 | 中文能力标准无法直接匹配英文 unit/module 标题。 |
| pe | 13 | 0 | 114 | 0 | 宽泛能力项与运动项目/健康章节只有弱泛词 overlap。 |

## 2. 进阶关系如何判定

进阶关系分四层，越往下越接近正式 public 写入：

1. **官方分组层**：`progression_group_id` 和 `grade_band` 决定 H4G7/8/9 的同组关系。核心文本相同的组仍是 `same_source_shared`，不能自动改写成 `grade_specific_variant`。
2. **同年级单元层**：某条 standard 只能引用同学科、同年级的 `toc_unit_or_chapter` 证据。跨年级命中只能进入 placement diagnostic 或 progression note review，不能写入 same-grade evidence。
3. **主题桥接层**：当标准字段和单元标题无法直接关键词匹配时，允许使用经过 source review 的学科主题标签建立桥接。桥接必须绑定 subject、grade/edition 范围、progression group 或 standard code。
4. **发布复核层**：只有多版本、同年级、页码可用、alignment 安全、review decision approved 的记录，才能通过 `publish-h4g-reviewed-candidate` 写入 `public/data`。

判定优先级：

| 情况 | 处理 |
| --- | --- |
| 同年级、多版本真实单元证据充足 | 可进入 same-grade unit evidence review。 |
| 同主题在不同版本落入不同年级 | 进入 edition placement review，不写 same-grade evidence。 |
| 只有弱泛词 overlap | 保持 blocked，不能用 alias 放行。 |
| 缺页码或目录页码不可证 | 可做候选诊断，但不能进 reviewed publication gate。 |
| 无完整 7/8/9 教材版本 | 保持 source/textbook coverage gap。 |

## 3. 主题桥接数据契约

桥接数据应新增为独立 source/review artifact，不能直接混进 matcher 常量。建议 schema：

```json
{
  "schema_version": 1,
  "purpose": "h4g_subject_theme_bridge",
  "writes_public_data": false,
  "bridges": [
    {
      "bridge_id": "h4g_bridge_english_school_life_g7",
      "subject_slug": "english",
      "progression_group_id": "english-example",
      "standard_codes": ["ENG-H4G7-..."],
      "grade_bands": ["H4G7"],
      "editions": ["外研社版-外语教学与研究出版社"],
      "unit_title_terms": ["My teacher and my friends", "My English lesson"],
      "topic_tags": ["school_life", "interpersonal_greeting"],
      "curriculum_theme_terms": ["学校生活", "人际交往"],
      "source": "textbook_unit_title_and_curriculum_review",
      "review_status": "needs_source_review",
      "rationale": "Unit titles indicate school-life communication themes; reviewer must confirm alignment to the target progression group."
    }
  ]
}
```

必须字段：

| field | requirement |
| --- | --- |
| `subject_slug` | 必须绑定学科。 |
| `progression_group_id` 或 `standard_codes` | 至少一个存在，避免全局同义词扩散。 |
| `grade_bands` | 必须明确适用年级；不得把 cross-grade unit 写入同年级证据。 |
| `unit_title_terms` 或 `unit_evidence_ids` | 必须可追溯到真实教材单元。 |
| `topic_tags` / `curriculum_theme_terms` | 必须来自受控主题表。 |
| `review_status` | 只有 approved/reviewed 状态可被 matcher 用作 eligible alignment。 |
| `rationale` | 必须说明为什么该主题能支持目标 standard/progression group。 |

## 4. English 桥接策略

English 的目录标题主要是英文语境主题，例如 family、school、weather、travel、culture、health、competition、technology。下一步不应把中文课标词直接翻译成全局 alias，而应：

1. 给 `Module/Unit/Revision module` 生成受控 bilingual topic tags。
2. 将 tags 复核到 progression group 或 standard code。
3. 区分语言知识、语篇类型、文化意识、学习策略等不同标准类型。
4. 先做 review-only bridge packet；通过 source review 后再进入 matcher。
5. 同步补页码：当前 English 只有 16/47 个真实单元有 page start。

禁止做法：

- 用自动翻译结果直接作为 approved bridge。
- 把 `culture`、`language in use` 这类宽泛词作为全局 evidence。
- 用 H4G9 单元补 H4G7 standard 的 same-grade evidence。

## 5. PE 桥接策略

PE 的目录标题多为运动项目或健康章节，例如足球、篮球、田径、游泳、体操、武术、运动负荷。它们需要映射到课程能力，而不是只看词面：

1. 建立 PE activity taxonomy：球类、田径类、体操类、水上类、中华传统体育、健康教育、体能训练。
2. 区分 `专项运动技能`、`体能`、`健康行为`、`体育品德` 的证据用途。
3. 对“运动”“健康”“体育”等泛词设置 deny-as-standalone 规则。
4. 对具体章节补页码：当前 PE 只有 1/13 个真实章节有 page start。
5. 通过 source review 后，matcher 才能新增 `reviewed_subject_theme_bridge` 一类 eligible alignment。

禁止做法：

- 因为“足球”属于体育，就自动匹配所有 PE standards。
- 用“运动”“健康”单词把体能、健康教育、专项技能、体育品德混在一起。
- 在没有页码和复核状态时写入 `textbook_unit_evidence_ids`。

## 6. 推荐执行顺序

1. 保留 `textbooks:audit-h4g-theme-bridge-gaps` 作为前置诊断，确认问题确实在主题桥接层。
2. 新建受控主题表和 bridge review packet 生成器。
3. 新建 bridge review decisions 模板和审计 gate，把每个候选的 source review 结论记录为可复核字段。
4. 新建 bridge source review worklist，把 pending decisions 按页码、fan-out 和泛化风险排成可执行队列。
5. 对 English/PE 各选一个完整 7/8/9 版本做人工/规则复核样本。
6. 新建 approved bridge registry，把已审 decisions 转成 matcher 可读取的 generated artifact。
7. 新增 bridge audit：检查 no global alias、no cross-grade same-grade evidence、no unreviewed bridge、no generic term standalone。
8. 在 `match_standards_to_textbook_units.js` 中只允许通过 registry audit 的 approved bridge 进入 `eligible_alignment=reviewed_subject_theme_bridge`。
9. 再补第二个教材版本，跑跨版本 consistency gate。
10. 只有通过 reviewed publication gate 后，才写入 `public/data`。

## 6.1 全局执行导航矩阵

2026-07-03 新增只读 issue matrix，用来把 public H4G readiness、distinctiveness audit、English/PE anchor group gate 合成同一张执行路线图：

```bash
npm run grade7_9:audit-h4g-grade-differentiation -- --data-root public/data
npm run grade7_9:audit-h4g-distinctiveness -- --data-root public/data --strict
npm run textbooks:h4g-theme-bridge-anchor-priority-matrix -- --strict --require-items
npm run textbooks:h4g-theme-bridge-anchor-group-decisions -- --strict --require-groups
npm run grade7_9:h4g-differentiation-issue-matrix -- --strict
```

输出：

```text
generated/grade7_9_h4g_differentiation_issue_matrix.json
generated/grade7_9_h4g_differentiation_issue_matrix.md
```

当前 issue matrix 的作用是把 H4G7/H4G8/H4G9 的同质化拆成四类执行入口：

| route | 用途 |
| --- | --- |
| `complete_anchor_group_decisions_before_item_review` | English/PE 先完成 52 个 anchor group decision，再进入 item-level source review。 |
| `expand_existing_unit_evidence_pipeline` | 数学、科学沿已有 reviewed unit evidence pipeline 补齐剩余年级/组。 |
| `repair_or_confirm_single_partial_grade_assignment` | 对艺术等 incomplete group，先确认单年级/部分年级归属是否可靠。 |
| `build_unit_chapter_evidence_from_file_level_sources` | 对仍只有教材文件级证据的学科，先建立真实单元/章节证据。 |

这个矩阵仍保持 `writes_public_data=false`、`changes_official_standard_text=false`、`direct_matcher_use=false`、`publication_ready=false`。它只决定“下一步走哪条 gate”，不批准 bridge，也不把任何记录升级为真实年级分化。

在 English/PE anchor group gate 内，另有一个 recommendation-only 辅助脚本：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-recommendations -- --strict --require-groups
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_decision_recommendations_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_decision_recommendations_anchor_domain_rejected_english_pe.md
```

它只根据 fan-out、missing grade slots、mixed anchor/action family、low evidence signal 等风险给 reviewer 推荐路线，例如 `split_or_refine_group_scope`、`needs_source_anchor_evidence` 或 `ready_for_item_level_source_review`。它不修改 editable decision template；把建议写入 decision template 之前仍必须补 reviewer note、reviewed_at、reviewed_by 和 required confirmations。

当前 recommendation 结果为 `valid=true`，覆盖 52 个 pending group：43 个建议先 `split_or_refine_group_scope`，9 个建议先 `needs_source_anchor_evidence`。没有任何 group 被建议直接视为 matcher-ready 或 publication-ready。

为了把 recommendation 变成可执行审阅面，新增 anchor group action worklist：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-worklist -- --strict --require-groups
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.md
```

该 worklist 会读取完整的 219 条 anchor review item，把 52 个 group 展开成两类工作路径：

| work path | 用途 |
| --- | --- |
| `split_scope_before_item_review` | 对 fan-out 或 mixed anchor/action family 的 group，按 `standard_code + grade_band + action_family + anchor_type` 拆成 bounded slices。 |
| `source_anchor_evidence_gap_review` | 对缺年级槽位或弱证据 group，列出需要补证据的 standard/anchor requests。 |

worklist 仍是 review-only：它不更新正式 decision template，不批准 bridge，不写 `public/data`，不改官方课标文本，也不让 matcher 使用。

当前 action worklist 为 `valid=true`：52 个 group 全覆盖，219 条 item-level anchor review rows 全覆盖；43 个 `split_scope_before_item_review` group 展开为 103 个 bounded split candidates，9 个 `source_anchor_evidence_gap_review` group 展开为 12 个 source-anchor evidence requests。

在 worklist 后新增一个非批准型 triage decision candidate，用来把 recommendation/worklist 固化成可被现有 decisions audit 验证的候选决策层：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-triage-decisions -- --strict --require-groups
npm run textbooks:audit-h4g-theme-bridge-anchor-group-decisions -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json \
  --matrix generated/textbook_evidence/h4g_theme_bridge_anchor_priority_matrix_anchor_domain_rejected_english_pe.json \
  --strict --require-groups --require-complete
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.md
```

当前 triage candidate 为 `valid=true`，并通过 `--require-complete` audit：52 个 group 全部完成非批准型分流，其中 43 个进入 `split_or_refine_group_scope`，9 个进入 `needs_source_anchor_evidence`；覆盖 219 条 anchor items、103 个 bounded split candidates 和 12 个 source-anchor evidence requests。该层只允许 `split_or_refine_group_scope` 与 `needs_source_anchor_evidence` 两类 reviewer decision，明确 `approval_prohibited=true`、`item_level_review_still_required=true`、`writes_public_data=false`、`direct_matcher_use=false`、`publication_ready=false`。

对 43 个 `split_or_refine_group_scope` group，新增 split review batch，把 group-level 分流继续拆到 item-level 审阅粒度：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-split-review-batch -- --strict --require-candidates
npm run textbooks:audit-h4g-theme-bridge-anchor-group-split-review-batch -- --strict --require-candidates
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe_audit.md
```

当前 split review batch 为 `valid=true`，audit 结果为 `valid=true`：43 个 split/refine group 精确展开为 103 个 `standard_code + grade_band + action_family + anchor_type` bounded slices，覆盖 183 条 source-anchor review rows；其中 English 83 个 slices、PE 20 个 slices，H4G7/H4G8/H4G9 分别为 28/53/22 个 slices。该 batch 只用于判断 bounded slice 是否足够窄、是否需要再拆、是否需补 source-anchor evidence；它不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

对 9 个 `needs_source_anchor_evidence` group，新增 source evidence request batch，把补证据路径也拆成可审计的请求项：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-source-evidence-batch -- --strict --require-requests
npm run textbooks:audit-h4g-theme-bridge-anchor-group-source-evidence-batch -- --strict --require-requests
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_source_evidence_batch_anchor_domain_rejected_english_pe_audit.md
```

当前 source evidence batch 为 `valid=true`，audit 结果为 `valid=true`：9 个 group 精确展开为 12 个 source-anchor evidence requests，覆盖 36 条现有 source-anchor review rows；English 9 个 requests、PE 3 个 requests，缺失年级请求分布为 H4G7=1、H4G8=6、H4G9=11。该 batch 反查到 12 个 missing-grade target standards，同时标出 3 个 request 存在 target-standard gap（缺失年级在当前 public standards 中没有对应 progression target）。它仍只是补证据审阅入口，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

在 split review batch 和 source evidence batch 后，新增 item review decisions template，把两条分支合并成可编辑决策面：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-decisions -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-decisions -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_decisions_template_anchor_domain_rejected_english_pe_audit.md
```

当前 item review decisions template 为 `valid=true`，audit 结果为 `valid=true`：115 行 decisions 全部为 `pending`，其中 103 行来自 split review、12 行来自 source evidence request；总计覆盖 219 条 source-anchor review rows。该层只是记录后续 item-level 审阅结果的位置，不等于 source review complete，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

在 editable template 旁边，新增 recommendation-only 辅助层，给 pending item decisions 生成可复算的审阅建议：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-recommendations -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-recommendations -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_recommendations_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_recommendations_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_recommendations_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_recommendations_anchor_domain_rejected_english_pe_audit.md
```

当前 recommendation 为 `valid=true`，audit 结果为 `valid=true`：115 行 recommendations 全覆盖、missing/extra 均为 0。其中 7 行建议 `accept_bounded_slice_for_item_level_source_review`，44 行建议 `split_slice_further`，52 行建议 `needs_source_anchor_evidence`，9 行建议 `needs_textbook_unit_indexing`，3 行建议 `target_missing_grade_standard_absent`。这些只是 reviewer 填写 template 的建议，不是官方 decision，不修改 editable template，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

在 recommendation-only 辅助层后，新增 item-review action worklist，把 115 条建议拆成可执行队列：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-worklist -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-worklist -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe_audit.md
```

当前 action worklist 为 `valid=true`，audit 结果为 `valid=true`：115 个 work items 精确覆盖 115 条 recommendations，missing/extra 均为 0，覆盖 219 条 source-anchor review rows。队列分布为：7 条 `item_level_source_review_ready_queue`，44 条 `unit_or_source_row_split_queue`，52 条 `source_anchor_specificity_queue`，9 条 `missing_grade_textbook_unit_indexing_queue`，3 条 `target_standard_gap_queue`。其中 `split_slice_further` 行进一步给出 124 个建议 child slices，便于后续按 unit/source row 继续拆。该层仍是 worklist-only，不修改 editable decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

对 `item_level_source_review_ready_queue`，新增 source-review-ready batch，将 7 个父 work items 展开为单源 item-level source review 入口：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-source-review-ready-batch -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-source-review-ready-batch -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_review_ready_batch_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_review_ready_batch_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_review_ready_batch_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_review_ready_batch_anchor_domain_rejected_english_pe_audit.md
```

当前 source-review-ready batch 为 `valid=true`，audit 结果为 `valid=true`：7 条 source review ready items 精确覆盖 7 条 expected ready rows，missing/extra 均为 0，来自 7 个父 work items，`unique_source_keys=7`。全部为 PE/H4G7，其中 1 条 movement/fitness/sportsmanship anchor，6 条 health behavior/load-management anchor；该层只打开 item-level source review 入口，不修改 editable decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

对 `unit_or_source_row_split_queue`，新增 child split batch，将 44 个父 work items 展开为单源粒度审阅行：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-child-split-batch -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-child-split-batch -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_child_split_batch_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_child_split_batch_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_child_split_batch_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_child_split_batch_anchor_domain_rejected_english_pe_audit.md
```

当前 child split batch 为 `valid=true`，audit 结果为 `valid=true`：124 条 child split review items 精确覆盖 124 条 expected child slices，missing/extra 均为 0，来自 44 个父 work items，`unique_source_keys=124`。按年级拆分为 H4G7 50 条、H4G8 40 条、H4G9 34 条；按学科拆分为 English 101 条、PE 23 条。该层把继续拆分项收窄到 `standard_code + grade_band + unit_evidence_id + anchor_review_item_id` 粒度，仍不修改 editable decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

对 `source_anchor_specificity_queue`，新增 source-anchor specificity batch，将 52 个父 work items 展开为逐 source row 的 exact-anchor 审阅包：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-source-anchor-specificity-batch -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-source-anchor-specificity-batch -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_anchor_specificity_batch_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_anchor_specificity_batch_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_anchor_specificity_batch_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_source_anchor_specificity_batch_anchor_domain_rejected_english_pe_audit.md
```

当前 specificity batch 为 `valid=true`，audit 结果为 `valid=true`：52 条 source-anchor specificity review items 精确覆盖 52 条 expected items，missing/extra 均为 0，来自 52 个父 work items，`unique_source_keys=52`。按年级拆分为 H4G7 8 条、H4G8 36 条、H4G9 8 条；按学科拆分为 English 47 条、PE 5 条。该层聚焦确认 source row 是否证明 exact anchor，而不是仅共享宽主题或标题；仍不修改 editable decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

对 `missing_grade_textbook_unit_indexing_queue`，新增 missing-grade textbook unit indexing batch，将 9 个父 work items 展开为 target-standard 级索引任务：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-missing-grade-unit-indexing-batch -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-missing-grade-unit-indexing-batch -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_missing_grade_unit_indexing_batch_anchor_domain_rejected_english_pe_audit.md
```

当前 indexing batch 为 `valid=true`，audit 结果为 `valid=true`：12 条 missing-grade unit indexing items 精确覆盖 12 条 expected target-standard items，missing/extra 均为 0，来自 9 个父 work items。待索引年级为 H4G8 3 条、H4G9 9 条；按学科拆分为 English 6 条、PE 6 条。该层只要求为缺失年级 target standards 找同年级教材单元候选；这些候选之后仍需 source-anchor 和 item-level review，不修改 editable decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

对 `target_standard_gap_queue`，新增 target-standard gap batch，将 3 个父 work items 展开为逐缺失年级的目标标准缺口复核行：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-target-standard-gap-batch -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-target-standard-gap-batch -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_standard_gap_batch_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_standard_gap_batch_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_standard_gap_batch_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_standard_gap_batch_anchor_domain_rejected_english_pe_audit.md
```

当前 target-standard gap batch 为 `valid=true`，audit 结果为 `valid=true`：6 条 target-standard gap items 精确覆盖 6 条 expected missing-grade rows，missing/extra 均为 0，来自 3 个父 work items。待处理缺口年级为 H4G7 1 条、H4G8 3 条、H4G9 2 条，全部来自 English。该层只确认“目标年级是否真的没有对应 public standard，或 progression group 是否需要重新切分/收窄”；它不修改 official standard text，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

新增 downstream coverage audit，系统性确认 item-review worklist 的 5 个执行队列全部有对应下游 batch：

```bash
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-coverage -- --strict --require-complete
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_coverage_audit_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_coverage_audit_anchor_domain_rejected_english_pe.md
```

当前 downstream coverage audit 为 `valid=true`：5 个 downstream batches 精确覆盖 115 个 parent work items，展开为 201 条 review rows；expected/covered parent work items 为 115/115，expected/actual review rows 为 201/201，missing parent、extra parent、duplicate parent assignments 均为 0。该 gate 只证明队列覆盖完整，不修改 editable decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

新增 downstream decisions template，将这 5 个 downstream batches 合并成统一可编辑决策入口：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-downstream-decisions -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-decisions -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_decisions_template_anchor_domain_rejected_english_pe_audit.md
```

当前 downstream decisions template 为 `valid=true`，audit 结果为 `valid=true`：201 条 downstream decisions 精确覆盖 201 条 expected downstream review rows，missing/extra 均为 0，全部为 `pending`。按 batch 拆分为 child split 124 条、source-anchor specificity 52 条、missing-grade unit indexing 12 条、source-review ready 7 条、target-standard gap 6 条；按年级拆分为 H4G7 66 条、H4G8 82 条、H4G9 53 条。该层只是统一记录后续 reviewer outcome，不修改上一层 editable item decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

新增 downstream recommendations，为 201 条 pending downstream decisions 给出 recommendation-only 分流：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-downstream-recommendations -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-recommendations -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_recommendations_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_recommendations_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_recommendations_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_recommendations_anchor_domain_rejected_english_pe_audit.md
```

当前 downstream recommendations 为 `valid=true`，audit 结果为 `valid=true`：201 条 recommendations 精确覆盖 201 条 downstream decisions，missing/extra 均为 0。推荐分布为：168 条 `needs_source_anchor_evidence`，12 条 `target_standard_requires_manual_scope_review`，7 条 `source_row_confirms_target_anchor_for_later_gate`，8 条 `accept_bounded_slice_for_item_level_source_review`，6 条 `target_standard_gap_confirmed`。这些 recommendation 必须仍由 reviewer 写入 downstream decisions template 才能生效；它们不修改 editable decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

新增 downstream action worklist，将 201 条 downstream recommendations 转为下一步执行队列：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-downstream-worklist -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-worklist -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe_audit.md
```

当前 downstream action worklist 为 `valid=true`，audit 结果为 `valid=true`：201 个 downstream action work items 精确覆盖 201 条 downstream recommendations，missing/extra 均为 0。队列分布为：168 条 `downstream_source_anchor_evidence_queue`，12 条 `downstream_manual_scope_indexing_queue`，8 条 `downstream_item_level_source_review_queue`，7 条 `downstream_source_row_confirmation_queue`，6 条 `downstream_target_standard_gap_resolution_queue`；按年级仍为 H4G7 66 条、H4G8 82 条、H4G9 53 条。该层只是把 recommendation-only 行变成执行清单，不修改 downstream decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

新增 downstream source-row confirmation batch，将 7 条已经进入 `source_row_confirms_target_anchor_for_later_gate` 的 work items 封成可人工确认的单源批次：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-downstream-source-row-confirmation-batch -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-source-row-confirmation-batch -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_batch_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_batch_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_batch_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_batch_anchor_domain_rejected_english_pe_audit.md
```

当前 downstream source-row confirmation batch 为 `valid=true`，audit 结果为 `valid=true`：7 条 source-row confirmation items 精确覆盖 7 条 expected work items，missing/extra 均为 0，`unique_source_keys=7`，全部为 PE/H4G7，其中 6 条为 `pe_health_behavior_or_load_management_anchor`，1 条为 `pe_movement_skill_fitness_or_sportsmanship_anchor`。该层只记录后续人工确认所需的 source-row 证据粒度，仍不修改 downstream decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

新增 downstream item-level source review batch，将 8 条 `accept_bounded_slice_for_item_level_source_review` work items 封成 child-split 后的单源审阅包：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-downstream-item-level-source-review-batch -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-item-level-source-review-batch -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_batch_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_batch_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_batch_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_item_level_source_review_batch_anchor_domain_rejected_english_pe_audit.md
```

当前 downstream item-level source review batch 为 `valid=true`，audit 结果为 `valid=true`：8 条 item-level source review items 精确覆盖 8 条 expected work items，missing/extra 均为 0，`unique_source_keys=8`。全部为 H4G7/P1，English/PE 各 4 条，全部来自 `child_split`；anchor 类型为 `english_speech_function_or_discourse_anchor` 4 条、`pe_movement_skill_fitness_or_sportsmanship_anchor` 4 条。该层只打开后续 item-level source review 的单源审阅入口，仍不修改 downstream decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

新增 downstream target-standard gap resolution batch，将 6 条 `target_standard_gap_confirmed` work items 封成目标标准缺口复核包：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-downstream-target-standard-gap-resolution-batch -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-target-standard-gap-resolution-batch -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch_anchor_domain_rejected_english_pe_audit.md
```

当前 downstream target-standard gap resolution batch 为 `valid=true`，audit 结果为 `valid=true`：6 条 gap resolution items 精确覆盖 6 条 expected work items，missing/extra 均为 0，`unique_source_keys=6`。全部为 English/P1，缺口年级为 H4G7 1 条、H4G8 3 条、H4G9 2 条；涉及 3 个 source standards / 3 个 progression groups。该层只用于确认目标年级标准是否真的缺位、是否存在于其他 code/group，或 progression group 是否需要重切；仍不修改 downstream decisions，不改 official standard text，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

新增 downstream manual scope/indexing batch，将 12 条 `target_standard_requires_manual_scope_review` work items 封成目标标准范围与同年级教材单元索引复核包：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-downstream-manual-scope-indexing-batch -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-manual-scope-indexing-batch -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_batch_anchor_domain_rejected_english_pe_audit.md
```

当前 downstream manual scope/indexing batch 为 `valid=true`，audit 结果为 `valid=true`：12 条 manual scope/indexing items 精确覆盖 12 条 expected work items，missing/extra 均为 0，`unique_source_keys=12`。全部为 P1，English/PE 各 6 条；目标年级为 H4G8 3 条、H4G9 9 条，涉及 9 个 target standards / 6 个 progression groups。该层只用于确认目标 standard scope 与同年级教材单元索引需求，允许后续在 editable downstream decisions 中记录 `missing_grade_units_indexed_for_later_source_review`、`missing_grade_units_not_found` 或继续 `target_standard_requires_manual_scope_review`；仍不修改 downstream decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

新增 downstream source-anchor evidence batch，将 168 条 `needs_source_anchor_evidence` work items 封成单 source row 的 anchor evidence 复核包：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-downstream-source-anchor-evidence-batch -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-source-anchor-evidence-batch -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe_audit.md
```

当前 downstream source-anchor evidence batch 为 `valid=true`，audit 结果为 `valid=true`：168 条 source-anchor evidence items 精确覆盖 168 条 expected work items，missing/extra 均为 0，`unique_source_keys=168`。其中 child split 116 条、source-anchor specificity 52 条；H4G7/H4G8/H4G9 为 50/76/42，English/PE 为 144/24，P1/P2 为 96/72。该层只允许后续在 editable downstream decisions 中记录 `accept_bounded_slice_for_item_level_source_review`、继续 `needs_source_anchor_evidence` 或 `reject_slice_as_overbroad`；仍不修改 downstream decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

在 source-anchor evidence batch 后，新增 read-only source-anchor evidence inventory，把 168 条单源证据的风险结构标准化，供后续人工 exact-anchor review 使用：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-downstream-source-anchor-evidence-inventory -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-source-anchor-evidence-inventory -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe_audit.md
```

当前 inventory 为 `valid=true`，audit 结果为 `valid=true`：168 条 inventory items 与 source-anchor evidence batch、downstream action decisions 一一对应，expected/audited 为 168/168，missing/extra 均为 0。所有 168 条仍需人工 exact-anchor review；其中 157 条 low bridge score，49 条落入 generic/deny-term 或 broad-topic 风险，116 条多 source/多 unit scope 尚未关闭，3 条需要 fan-out review。该层只提供风险 inventory，不写 editable decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

新增 downstream action coverage audit，将 downstream worklist 的 201 条 work items 与 5 个后续执行 batch 做完整性与互斥性校验：

```bash
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-action-coverage -- --strict --require-complete
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_coverage_audit_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_coverage_audit_anchor_domain_rejected_english_pe.md
```

当前 downstream action coverage audit 为 `valid=true`：5 个 downstream action batches 精确覆盖 201 个 parent work items，expected/actual review rows 为 201/201，missing parent work items 为 0，duplicate parent assignments 为 0。覆盖结构为 source-anchor evidence 168、manual scope/indexing 12、item-level source review 8、source-row confirmation 7、target-standard gap resolution 6。该层只证明执行队列没有漏项或重复分配，仍不代表任何 downstream decision 已完成、不批准 bridge、不写 `public/data`，不启用 matcher，也不进入 publication-ready。

新增 downstream action decisions template，将上述 5 个 downstream action batches 合并为统一 editable review surface：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-downstream-action-decisions -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-action-decisions -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe_audit.md
```

当前 downstream action decisions template 为 `valid=true`，audit 结果为 `valid=true`：201 条 downstream action decisions 精确覆盖 201 条 expected action rows，missing/extra 均为 0，全部 `pending_review` / `reviewer_decision=pending`。该层将 source-anchor evidence、manual scope/indexing、item-level source review、source-row confirmation 和 target-standard gap resolution 的 reviewer outcome 统一到一个可编辑入口；仍不自动关闭任何 downstream decision，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

新增 downstream action recommendations，为 201 条 pending action decisions 给出 recommendation-only reviewer outcome：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-downstream-action-recommendations -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-action-recommendations -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_recommendations_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_recommendations_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_recommendations_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_recommendations_anchor_domain_rejected_english_pe_audit.md
```

当前 downstream action recommendations 为 `valid=true`，audit 结果为 `valid=true`：201 条 recommendations 精确覆盖 201 条 action decisions，missing/extra 均为 0，全部 `recommendation_only=true` 且 `recommendation_requires_manual_confirmation=true`。推荐分布与 action decision allowed outcomes 对齐：needs_source_anchor_evidence 168、target_standard_requires_manual_scope_review 12、accept_bounded_slice_for_item_level_source_review 8、source_row_confirms_target_anchor_for_later_gate 7、target_standard_gap_confirmed 6。该层只给 reviewer 一个可复算建议，不自动改 editable decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

新增 downstream action closure readiness audit，用来确认 recommendation 是否足以关闭 action decision：

```bash
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-action-closure-readiness -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.md
```

当前 closure readiness audit 为 `valid=true`：201 条 closure readiness rows 精确覆盖 201 条 action decisions；`auto_close_allowed_items=0`、`close_ready_items=0`、`manual_confirmation_required_items=201`。其中 6 条 `target_standard_gap_confirmed` 被标为 `priority_manual_confirmation_candidate`，可优先做人审；其余 195 条仍需要 source/scope/item-level/source-row evidence review。该层专门防止把 recommendation 误当成正式 reviewer decision，不修改 editable action decisions，不批准 bridge，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

对 6 条 priority target-standard gap，新增 public inventory audit：

```bash
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-target-standard-gap-inventory -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_anchor_domain_rejected_english_pe.md
```

当前 target gap inventory audit 为 `valid=true`：6 条 inventory rows 全部在 `public/data` 中确认 source standard 存在、同 progression group 只有原 source grade，推导出的 missing-grade target code 不存在，目标年级也没有同 `legacy_code` 的替代记录。因此 6 条均为 `confirmed_absent_in_public_inventory`。这仍只是 inventory evidence，不自动关闭 editable action decisions、不新增或改写 official standard、不写正式数据、不启用 matcher，也不进入 publication-ready。

在 inventory evidence 之后，新增非发布型 target-gap inventory decisions candidate，将 6 条 confirmed-absent target gap 从散落审计发现整理成可审阅的候选 reviewer outcome：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-downstream-target-gap-inventory-decisions-candidate -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-target-gap-inventory-decisions-candidate -- --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe_audit.md
```

当前 target-gap inventory decisions candidate 为 `valid=true`，audit 结果为 `valid=true`：201 条 action decisions 中只有 6 条 target-standard gap rows 被标记为 `target_standard_gap_confirmed` 候选，其余 195 条保持 `pending`；candidate 目标年级分布为 H4G7 1 条、H4G8 3 条、H4G9 2 条，expected/candidate 为 6/6，missing/extra 均为 0。该层仍不修改 editable action decisions template，不自动关闭上游 downstream decisions，不新增或改写 official standard，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

在 action-review candidate 之后，新增 parent downstream decisions candidate，将 6 条 target-gap action candidate 精确回传到上游 downstream decisions：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-downstream-target-gap-inventory-parent-decisions-candidate -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-target-gap-inventory-parent-decisions-candidate -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-decisions -- --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe.json --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe_audit.md
```

当前 parent downstream decisions candidate 为 `valid=true`，专用 audit 与原 downstream decisions audit 均为 `valid=true`：201 条 parent downstream decisions 中只有同一 6 条 target-standard gap rows 被标记为 `target_standard_gap_confirmed` 候选，其余 195 条保持 `pending`；candidate 目标年级分布为 H4G7 1 条、H4G8 3 条、H4G9 2 条，expected/parent candidate 为 6/6，missing/extra 均为 0。该层仍不修改 editable downstream decisions template，不批准 bridge，不新增或改写 official standard，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

在 parent downstream candidate 之后，新增 item-review decisions candidate，将 6 条 parent target-standard gap 证据精确回传到 3 条 source-evidence item-review decisions：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-item-review-target-gap-inventory-decisions-candidate -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-target-gap-inventory-decisions-candidate -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-decisions -- --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.json --strict --require-items
```

输出：

```text
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.md
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe_audit.json
generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe_audit.md
```

当前 item-review target-gap decisions candidate 为 `valid=true`，专用 audit 与原 item-review decisions audit 均为 `valid=true`：115 条 item decisions 中只有 3 条 source-evidence target-gap rows 被标记为 `target_missing_grade_standard_absent` 候选，其余 112 条保持 `pending`；这 3 条 rows 由 6 条 parent target-standard gap candidate 完整覆盖，目标年级分布为 H4G7 1 条、H4G8 3 条、H4G9 2 条，expected/audited/candidate markers 为 3/3/3，missing/extra 均为 0。该层仍不修改 editable item decisions template，不批准 bridge，不新增或改写 official standard，不写 `public/data`，不启用 matcher，也不进入 publication-ready。

## 7. 当前落地状态

已新增受控主题表：

```text
scripts/textbooks/h4g_subject_theme_taxonomy.json
```

已新增 review-only packet 生成器和审计 gate：

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

当前结果：

| item | count |
| --- | ---: |
| unit theme items | 60 |
| progression theme items | 95 |
| bridge review candidates | 515 |
| English bridge candidates | 340 |
| PE bridge candidates | 175 |
| page-ready bridge candidates | 94 |
| standards without bridge candidates | 64 |

初始审计结果为 `valid=true`。所有 review items 都是 `needs_source_review`，且 `eligible_for_h4g_differentiation=false`、`writes_public_data=false`、`changes_official_standard_text=false`。当时 421 条 bridge candidates 缺 page-ready evidence，只能作为 review queue，不能进入 publication gate。

已新增 source review decisions 模板和审计 gate：

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

当前 decisions template 生成 515 条必需 source review 决策：English 340 条、PE 175 条；按年级为 `H4G7=216`、`H4G8=160`、`H4G9=139`。默认全部 `pending`，所以 audit 为 `valid=true`、`source_review_complete=false`、`matcher_ready=false`、`publication_ready=false`。审批时必须明确是 standard-scoped 还是 progression-group-scoped，并确认 source text、同学科、同年级、非泛词、页码检查、scope bounded、官方课标文本不变和不请求 public write。

已新增 source review worklist 和覆盖审计：

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

初始 worklist 覆盖 515 条 decisions：94 条为 `source_review_ready`，421 条为 `page_recovery_then_source_review`；优先级为 `P1=27`、`P2=67`、`P3=3`、`P4=418`。audit 为 `valid=true`，并明确警告 421 条 item 进入 publication gate 前仍需 page recovery。该队列只用于复核排序，不代表 source review complete、matcher ready 或 publication ready。

已新增 P1 source review batch，把最适合先审的 page-ready items 补齐为审前阅读包：

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

R1 页码恢复前的 P1 batch 为 `valid=true`：27 条全部是 English/H4G7，全部 page-ready，且全部仍为 `pending`。这说明首批可复核证据集中在七年级英语；H4G8 没有 page-ready 主题桥接候选，后续必须先做 page recovery，不能把 P1 结果误读成 H4G7/H4G8/H4G9 已经均衡覆盖。

已新增 H4G8 page recovery batch，用来处理首批无法进入 source review 的缺页码项：

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

初始 H4G8 page recovery batch 为 `valid=true`：160 条缺页码 work items 聚合为 9 个教材单元，English 8 个、PE 1 个，覆盖 3 个教材文件。R1 优先级有 5 个单元，先恢复这些 printed page start 能最大幅度打开 H4G8 source review 面。batch 只提供 override 模板，不填 page_start，不批准 bridge；真实页码证据应进入 `scripts/textbooks/textbook_unit_page_start_overrides.json` 后再重跑 unit index、review packet、decisions/worklist 和 source review batch。

R1 页码恢复已完成第一批写入：`scripts/textbooks/textbook_unit_page_start_overrides.json` 新增 5 条 reviewed overrides，覆盖 English 八上 `Unit 1 Let’s try to speak English as much`、`Unit 2 You should smile at her!`、`Unit 3 Language in use`，English 八下 `Unit 2 I feel nervous when I speak Chinese.`，以及 PE 八年级全一册 `第三章 足球`。这些页码均由正文标题和页脚，或 TOC + 正文页脚共同确认。重跑后，review packet 的 page-ready bridge candidates 从 94 增至 226，缺页码 candidates 从 421 降至 289；R1 后 H4G8 有 132 条 `source_review_ready`（English 110、PE 22），剩余 28 条 page recovery 聚合为 3 个 English 单元。P1 source review batch 也从 27 条扩展到 54 条，其中 H4G7 27 条、H4G8 27 条。

R2/R3 页码恢复继续补齐剩余 3 个 H4G8 English 单元：八下 `Unit 3 Language in use` page_start 6、八上 `Unit 1 It’s taller than many other buildings.` page_start 10、八下 `Unit 1 It smells delicious.` page_start 2。证据来自 Scope and sequence 的模块页码、PDF text layer 中的正文标题和同页页脚。重跑后，English page-start candidates 从 20 增至 23；review packet 的 page-ready bridge candidates 增至 254，缺页码 candidates 降至 261。H4G8 的 `page_recovery_then_source_review` 已归零，160 条全部进入 `source_review_ready`（English 138、PE 22）。最新 P1 source review batch 为 57 条，其中 H4G7 27 条、H4G8 30 条；English 43 条、PE 14 条。所有 decisions 仍是 `pending`，所以这只是 source review 入口打开，不是 bridge approval。

已新增 approved bridge registry 和 matcher 接口：

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

当前 English/PE decisions 全部 pending，因此 registry 为 `valid=true` 且 `approved_bridges=0`。matcher 已支持读取 registry；只有 registry 中的 approved rows 才会生成 `eligible_alignment=reviewed_subject_theme_bridge`，并写入 `subject_theme_bridge_alignment`。用 `/tmp` 临时构造 1 条 approved decision 的正向验证已通过：该链路能生成 1 条 English eligible match 和 1 条 H4G candidate，但缺 page_start 时仍会被 page gate 标记为不能发布。

已新增 P1 source review recommendation 候选层，用于把 R2/R3 后的 57 条 P1/page-ready batch items 做第一轮可复核的规则化审阅建议，而不是改写原始 template：

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

当前 P1 recommendation audit 为 `valid=true`：57 条 batch decisions 已审阅，其中 18 条为 `approve_standard_scoped_subject_theme_bridge`、9 条为 `reject_subject_theme_bridge`、30 条为 `needs_revision`，其余 458 条仍为 `pending`。18 条 approval 全部 page-ready、全部 standard-scoped；English 15 条、PE 3 条；H4G7 12 条、H4G8 6 条；H4G9 仍未进入本轮 approved registry。这一步会明确拒绝 PE 足球单元映射到田径、体操、水上、传统体育或新兴体育等 standards 的 false positives，也会把宽泛主题相关但不能证明精确标准关系的 English/PE rows 保持为 `needs_revision`。

基于 P1 recommendation 导出的 registry 和 matcher/candidate 验证也已跑通：

```bash
npm run textbooks:h4g-theme-bridge-registry -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe.json \
  --decisions-audit generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe_audit.json \
  --out generated/textbook_evidence/h4g_theme_bridge_registry_p1_codex_reviewed_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_registry_p1_codex_reviewed_english_pe.md \
  --strict \
  --require-approved \
  --require-page-ready
```

P1 registry audit 为 `valid=true`、`matcher_ready=true`、`publication_ready=false`，包含 18 条 approved bridges，全部有 page-ready 证据。用该 registry 复跑 matcher 后，English 产生 15 条 `reviewed_subject_theme_bridge` eligible matches，覆盖 8 条 standards；PE 产生 3 条 eligible matches，覆盖 3 条 standards。进一步生成 H4G unit candidate 后，English 得到 8 条候选 standards / 15 个单元证据对象，PE 得到 3 条候选 standards / 3 个单元证据对象，候选审计均为 `valid=true` 且 page_start 完整。

但 consistency audit 仍明确阻止发布：English 和 PE 的 P1 候选都只来自单一教材版本，`cross_version_consistency_proven=false`、`complete_progression_groups=false`。因此 P1 recommendation 只证明“主题桥接审批、registry、matcher、candidate/audit 这条链路可以安全工作”，不能证明 H4G7/H4G8/H4G9 已完成真实分化，也不能写入 `public/data`。

P1 后已新增精确 batch selection：`textbooks:h4g-theme-bridge-review-batch` 和对应 audit 支持 `--min-priority` 与 `--reviewer-decisions`，可从 after-P1 worklist 中只抽取仍为 pending 的下一批 source review items，避免把已审阅的 P1 rows 混入下一轮：

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

该 P2 pending batch 审计为 `valid=true`：197 条全部 page-ready、全部 pending、全部 `source_review_ready`；年级分布为 `H4G7=57`、`H4G8=130`、`H4G9=10`，学科分布为 English 179 条、PE 18 条。它是下一轮人工/课程 source review 的主入口，尤其首次把 H4G9 的 PE page-ready 候选纳入审阅；但 182 条存在 `unit_overmatches_many_standards`，193 条只有单一 shared topic tag，131 条 standard 本身有多个 bridge candidates，因此不能自动套用 P1 的批准规则。

已对 P2 batch 执行保守 recommendation：只拒绝明确项目错配，其余高风险/宽主题 rows 标为 `needs_revision`，不新增 approved bridge。

```bash
npm run textbooks:h4g-theme-bridge-review-recommendations -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe.json \
  --batch generated/textbook_evidence/h4g_theme_bridge_review_batch_p2_pending_after_p1_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_p2_codex_reviewed_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_p2_codex_reviewed_english_pe.md \
  --strict \
  --require-items
```

P1+P2 recommendation audit 为 `valid=true`：515 条 decisions 中 254 条已完成审阅，18 条 approved、16 条 rejected、220 条 needs_revision、261 条仍 pending。18 条 approved bridge 全部来自 P1 且 page-ready；P2 没有新增 matcher-approved bridge。after-P2 registry 仍是 18 条，`matcher_ready=true`、`publication_ready=false`。

因此当前主阻塞已经从 source review 转到 page recovery：剩余 261 条 pending 全部是缺页码，按年级和学科为 `PE H4G7=113`、`English H4G9=99`、`PE H4G9=30`、`English H4G7=19`。已生成 after-P2 page recovery 批次：

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

H4G9 page recovery audit 为 `valid=true`：129 条 linked work items 聚合为 9 个 recovery units，English 7 个、PE 2 个，R1 为两个 English `Unit 3 Language in use` 单元；R2 包含 English `Unit 1 It’s more than 2,000 years old.`、`Unit 2 The Grand Canyon was not just big.`，以及 PE `合理安排运动负荷`、`第一节 运动负荷的自我监测`。H4G7 page recovery audit 也为 `valid=true`：132 条 linked work items 聚合为 12 个 recovery units，R1 为 PE 七年级足球、排球、乒乓球、篮球四个章节。两批都只是页码恢复任务，不批准 bridge。

after-P2 页码恢复已完成一批 reviewed overrides：`scripts/textbooks/textbook_unit_page_start_overrides.json` 新增 11 条 page_start，覆盖 H4G9 English 上/下册 4 个单元、H4G9 PE 2 个章节/小节、H4G7 PE 4 个章节、H4G7 English 下册 1 个单元。证据来自 PDF text layer 中的正文标题、Scope and sequence/目录页码与正文页脚交叉确认。重跑 English/PE run-level unit index 后，English page-start candidates 从 23 增至 28，PE 从 2 增至 8；候选总数保持 English 47、PE 13，不扩大 review surface。

注意：重建 review packet 会因为 top-4 候选排序变化而改变旧 P1/P2 审核面。因此当前 official review state 使用保守的 `h4g_theme_bridge_review_decisions_p1_p2_page_recovered_english_pe.json`：它保留原 515 条 decision surface 和 254 条已审 P1/P2 结论，只刷新页码字段。该文件审计为 `valid=true`：254 条 completed、18 条 approved、16 条 rejected、220 条 needs_revision、261 条 pending；18 条 approved 全部仍为 page-ready，且 page-ready decisions 已从 254 增至 472，page-missing 降至 43。

基于保守 page-recovered decisions 重建的 worklist 审计为 `valid=true`：515 条 work items 中 472 条为 `source_review_ready`、43 条仍需 `page_recovery_then_source_review`。新的 pending source-review batch 为 `valid=true`，共 218 条，全部 page-ready、全部 pending、全部 P2；分布为 H4G7 103 条、H4G9 115 条，English 100 条、PE 118 条。剩余 page recovery batch 也审计为 `valid=true`：43 条 linked work items 聚合为 10 个 recovery units，其中 H4G7 7 个、H4G9 3 个；这些仍只是补页码任务，不批准 bridge。

已对这 218 条 after-page-recovery pending batch 执行保守 source review recommendation。结果审计为 `valid=true`：515 条 decisions 中 472 条已完成审阅，18 条 approved、80 条 rejected、374 条 needs_revision、43 条仍 pending。43 条 pending 全部是缺页码项；472 条 page-ready decisions 已无 source-ready pending。新的 registry 审计为 `valid=true`、`matcher_ready=true`、`publication_ready=false`，仍只有原 18 条 approved bridges，全部 page-ready、standard-scoped，分布为 English 15 条、PE 3 条、H4G7 12 条、H4G8 6 条。也就是说，本轮打开并处理了 H4G7/H4G9 的 page-ready 审阅面，但没有自动扩大 matcher-approved 范围。

剩余 10 个 page recovery units 也已完成 reviewed overrides，覆盖 H4G7 PE 第一章/第二章/第七章/第八章/第九章，H4G9 English 上册 `Unit 1 My family always go somewhere interesting`，H4G9 English 下册 `Unit 1 We toured the city by bus and by taxi.`、`Unit 2 It’s a long story.`，以及 H4G7 English 下册 `Unit 1 Whose bag is this?`、`Unit 2 I can run really fast.`。重跑后 English page-start candidates 为 33/47、PE 为 13/13；保守刷新后的 decisions 审计为 `valid=true` 且 page-ready decisions 为 515、page-missing 为 0。最后 43 条 pending batch 也完成保守 source review，严格审计 `--require-complete --require-page-ready-for-approval` 为 `valid=true`：515 条全部完成，18 条 approved、83 条 rejected、414 条 needs_revision、0 pending。最终 registry 仍为 18 条 approved bridges，说明 source review complete 不等于扩大可发布范围。

已新增 subject-theme bridge remediation packet，把 414 条 `needs_revision` 从单一状态拆成 7 个可执行 action families。packet/audit 均为 `valid=true`，且精确覆盖全部 needs_revision decisions：missing coverage 0、extra coverage 0。当前分布为 English 325 条、PE 89 条；高优先级 113 条、中优先级 301 条；action families 包括 English 语言运用需功能锚点 110 条、English 日常交际主题需 speech-function 锚点 140 条、English 文化主题需文化目标复核 48 条、PE 活动技能需运动标准锚点 38 条、PE 健康理论需健康行为复核 35 条、PE 学业质量/表现需课程进阶复核 16 条。该 packet 仍是 read-only，不批准 bridge、不写 `public/data`、不启用 matcher。

已进一步新增 progression-group matrix，把 414 条 remediation items 和 18 条 approved bridges 上卷到 70 个 `progression_group_id`。matrix/audit 均为 `valid=true`，source groups 70 个全部覆盖，missing/extra group 均为 0；其中 English 46 个组、PE 24 个组，60 个组本身覆盖 H4G7/H4G8/H4G9 三年级。关键结论是 `complete_h4g_triplet_approved_groups=0`：当前没有任何 English/PE 主题桥接组已经证明七、八、九年级完整进阶。resolution track 分布为：26 个 generic Language in use title bridge blocked、12 个 English source-anchor model required、16 个 PE source-anchor model required、5 个 PE curriculum progression review required、9 个 partial approved bridge needs grade completion、2 个 single/partial-grade complete 但仍需 publication gates。该 matrix 仍是 read-only，只用于确定下一步 owner 和阻塞原因。

已执行两轮 remediation decision recommendation：第一轮只处理 item-level `english_language_use_requires_function_anchor`，把 110 条 title-only `Unit 3 Language in use` bridge 从 `needs_revision` 推进为 `reject_subject_theme_bridge`；第二轮处理 `pe_quality_or_performance_requires_curriculum_progression_review`，把 16 条 PE 学业质量/表现类 direct bridge 从 `needs_revision` 推进为 `reject_subject_theme_bridge`。新的 decisions audit 在 `--require-complete --require-page-ready-for-approval` 下为 `valid=true`：approved 18、rejected 209、needs_revision 288、pending 0，且 `source_review_complete=true`。基于该 decisions 重建的 registry 仍为 18 条 approved bridges；新的 remediation packet/audit 为 `valid=true`，剩余 288 条 needs_revision，覆盖 120 条 standards、64 个 progression groups；新的 progression matrix/audit 也为 `valid=true`，`missing_source_groups=0`、`extra_matrix_groups=0`、`complete_h4g_triplet_approved_groups=0`。原先的 generic Language in use title bridge blocked track 和 PE curriculum progression review required track 均已清空；剩余项集中在 `english_source_anchor_model_required`、`pe_source_anchor_model_required`、partial approved grade completion 和 single/partial-grade publication gates。

已新增 source-anchor review batch，把剩余 288 条 needs_revision 转成可执行回源审阅项，而不是继续自动扩大 approved registry：

```bash
npm run textbooks:h4g-theme-bridge-anchor-review-batch -- --strict --require-items
npm run textbooks:audit-h4g-theme-bridge-anchor-review-batch -- --strict --require-items
```

该 batch/audit 均为 `valid=true`，且 `missing_remediation_items=0`、`extra_anchor_review_items=0`。它覆盖 120 条 standards、64 个 progression groups，所有 288 条均 page-ready，但仍保持 `publication_ready=false`、`matcher_ready=false`。5 个 anchor 类型分别是 English speech function/discourse 140 条、English cultural objective 48 条、English learning strategy/language knowledge 27 条、PE movement skill/fitness/sportsmanship 38 条、PE health behavior/load management 35 条。它的用途是让 reviewer 判断“有没有具体功能/目标/技能/行为锚点”，不能直接替代 source review decision，也不能写入 `public/data`。

已新增 anchor-domain recommendation pass，只处理锚点类型和目标 domain 明显不兼容的 rows：

```bash
npm run textbooks:h4g-theme-bridge-anchor-recommendations -- --strict --require-items
```

该 pass 拒绝 69 条 mismatch：11 条 English cultural objective anchor 打到语篇、学习策略或语言知识；32 条 English speech/culture/learning anchor 直接打到学业质量标准；15 条 PE activity/movement anchor 打到课程目标、健康教育或跨学科主题学习；11 条 PE health/load-management anchor 打到课程目标、体育品德、运动能力或跨学科主题学习。新的 decisions audit 为 `valid=true`：approved 18、rejected 278、needs_revision 219、pending 0，所有 decisions 均 page-ready。下游 registry 仍只有 18 条 approved bridges；新的 remediation packet/audit 为 `valid=true`，剩余 219 条 needs_revision，覆盖 93 条 standards、52 个 progression groups；新的 progression matrix/audit 也为 `valid=true`，`complete_h4g_triplet_approved_groups=0`。这一步只收敛明确 domain/quality direct-bridge mismatch，不自动处理仍可能由具体活动回源成立的英语 speech/learning rows。

已新增 anchor priority matrix，把剩余 219 条 `needs_revision` 进一步按 `progression_group_id` 聚合成复核队列，避免 reviewer 继续按散点 item 判断：

```bash
npm run textbooks:h4g-theme-bridge-anchor-priority-matrix -- --strict --require-items
```

该 matrix 为 `valid=true`，仍保持 `writes_public_data=false`、`publication_ready=false`、`matcher_ready=false`。它覆盖 52 个 priority groups，其中 English 39 组、PE 13 组；按 item 仍是 English 172 条、PE 47 条。优先级分布为 `P1=27` 组、`P2=25` 组；其中 21 组含 high-priority item。review strategy 分布显示真正工作重点：9 组应先补齐已部分 approved 的缺失年级，2 组可在确认 anchor 后进入 publication gate 检查，40 组应先做 fanout-first source review，因为存在单元过度匹配多 standards、standard 多候选或 single shared topic tag 风险。该矩阵只决定复核顺序和证据焦点，不新增 approval，也不改变官方课标文本。

已新增 group-level anchor decision template 和 audit gate，把 52 个 priority groups 变成可编辑、可审计的复核路由层：

```bash
npm run textbooks:h4g-theme-bridge-anchor-group-decisions -- --strict --require-groups
npm run textbooks:audit-h4g-theme-bridge-anchor-group-decisions -- --strict --require-groups
```

初始 template/audit 均为 `valid=true`，覆盖 52/52 个 priority groups：English 39 组、PE 13 组；P1 27 组、P2 25 组；所有 `reviewer_decision=pending`，所以 `group_review_complete=false`。该层允许 reviewer 选择 `ready_for_item_level_source_review`、`needs_source_anchor_evidence`、`reject_group_anchor_path` 或 `split_or_refine_group_scope`，但即便 group 决策完成，也仍只表示“下一步怎么审”；它不批准任何 bridge，不让 matcher 使用，也不写入 `public/data`。

## 8. 当前结论

English/PE 现在不是 H4G 分组失败，也不是目录解析完全失败。真正问题是标准能力项与教材主题标题之间缺少受控、可复核、学科化的桥接层。下一阶段的质量目标不是提高 match 数量，而是让每一个 match 都能解释：

- 它属于哪个 progression group。
- 它为什么是该年级的证据。
- 它来自哪个教材单元和页码。
- 它经过了什么 review。
- 它没有改写官方课标原文。
