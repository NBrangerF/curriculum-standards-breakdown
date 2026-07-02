# 初中七八九年级拆分与教材进阶证据方案

更新时间：2026-07-01

本文定义把原先 `H4=7-9` 初中段继续拆成七年级、八年级、九年级的工作方案。目标不是把同一条 7-9 共同要求机械复制成三个标签，而是为每条标准建立可追溯的年级归属和进阶关系证据。

本方案使用项目内 `zhenzheng-keyong-kebiao-skill` 的质量原则：

- 课标正文和 code 仍以本站课标数据为准。
- 教材只作为年级落点、册次顺序和进阶关系的辅助证据。
- 原文、教材证据、自动判断、教学建议必须分离。
- 低置信度判断可以继续推进，但必须显式标注，不能伪装成官方确定结论。

## 1. 数据源

### 1.1 课标主数据

正式运行数据仍来自：

```text
public/data/by_subject/*.json
```

当前初中段记录使用：

```json
{
  "grade_band": "H4",
  "grade_range": "7-9",
  "grade": "七年级 | 八年级 | 九年级"
}
```

后续目标是把初中段拆为：

| grade_band | grade_level | grade_range | grade |
| --- | ---: | --- | --- |
| H4G7 | 7 | 7 | 七年级 |
| H4G8 | 8 | 8 | 八年级 |
| H4G9 | 9 | 9 | 九年级 |

同时保留一个聚合字段：

```json
{
  "stage_band": "H4"
}
```

`stage_band` 用于表示第四学段，`grade_band` 用于真实年级粒度筛选。

### 1.2 教材辅助证据

教材来自：

```text
https://github.com/TapXWorld/ChinaTextbook
```

当前索引固定到 commit：

```text
5a80345f2043ba6f8db8d7be9cf3db82725ff1f7
```

本仓库不提交教材 PDF。推荐使用 blobless clone：

```bash
git clone --filter=blob:none --no-checkout \
  https://github.com/TapXWorld/ChinaTextbook.git \
  generated/external/ChinaTextbook
```

生成教材索引：

```bash
npm run textbooks:index-china
```

输出：

```text
generated/textbook_evidence/china_textbook_index.json
generated/textbook_evidence/china_textbook_index_summary.md
```

`generated/` 是可重建产物，不提交到 git。

索引中每个教材文件会获得稳定的 `evidence_id`。后续标准记录的 `textbook_evidence_ids` 应引用这些 id，而不是手写教材路径。

当前索引摘要：

| 指标 | 数量 |
| --- | ---: |
| 初中 tree records | 548 |
| 正常教材文件 | 439 |
| merge/pdf 分片文件 | 109 |

按本站学科映射后的教材覆盖：

| subject_slug | 教材文件数 |
| --- | ---: |
| arts | 168 |
| chinese | 6 |
| english | 34 |
| math | 51 |
| morality_law | 12 |
| pe | 10 |
| science | 120 |
| it | 0 |
| labor | 0 |

## 2. 教材证据使用边界

教材可以帮助判断：

- 某个内容通常落在七年级、八年级还是九年级。
- 某个内容在上册、下册、全一册中的位置。
- 多个版本是否对同一概念的年级顺序一致。
- 学科内部概念链的先后，例如数学、科学、英语等。

教材不能用于：

- 改写课标标准正文。
- 生成课标中不存在的标准 code。
- 把教材章节标题直接当作课程标准。
- 把单一版本教材的顺序直接当成官方课标顺序。

如果课标写的是 7-9 共同要求，而教材只能证明常见教学落点，则记录应标为“教材支持的年级适配”，不能标为“课标官方年级要求”。

## 3. 证据等级

| 等级 | 类型 | 可用结论 |
| --- | --- | --- |
| A | 课标官方文本明确写七/八/九年级 | 可确定年级归属 |
| B | 教材文件路径明确年级和册次，且内容匹配标准核心词 | 可确定教材支持的年级适配 |
| C | 多个教材版本对同一内容年级落点一致 | 可提高置信度 |
| D | 课标章节顺序、概念依赖、学科逻辑 | 可作为自动判断候选 |
| E | 证据不足时的自主判断 | 可继续推进，但必须低置信度标注 |

用户已授权“证据不明确时自行判断”，因此 E 级判断不阻塞流程；但必须写清：

```json
{
  "grade_assignment_type": "auto_judged_low_confidence",
  "grade_assignment_confidence": 0.35
}
```

## 4. 新增字段建议

初中年级拆分后的标准记录建议增加：

```json
{
  "stage_band": "H4",
  "grade_band": "H4G7",
  "grade_level": 7,
  "grade_range": "7",
  "grade_assignment_type": "official_explicit | textbook_supported | shared_requirement_textbook_file_supported | shared_requirement_adjacent_textbook_file_supported | shared_requirement_textbook_unit_supported | concept_prerequisite | auto_judged_low_confidence",
  "grade_assignment_confidence": 0.0,
  "grade_assignment_rationale": "",
  "textbook_evidence_ids": [],
  "textbook_unit_evidence_ids": [],
  "progression_group_id": "",
  "progression_role": "introductory | developing | consolidating | shared_requirement",
  "progression_basis": "official_text | textbook_sequence | shared_standard_textbook_file_sequence | shared_standard_textbook_unit_sequence | source_order | concept_prerequisite | auto_judgment",
  "progression_confidence": 0.0,
  "standard_text_role": "source_standard_original",
  "source_standard_scope": "stage_shared_7_9 | grade_specific_source | partial_grade_source",
  "standard_variant_type": "same_source_shared | grade_specific_variant | single_or_partial_grade_variant",
  "evidence_granularity": "none | textbook_file_grade_level | textbook_unit_level",
  "progression_distinctiveness": "identical_core_fields | core_fields_differ | partial_group",
  "progression_distinctiveness_fields": [],
  "requires_unit_level_evidence": true,
  "grade_specific_focus": "",
  "progression_delta": "",
  "progression_review_note": "",
  "review_status": "needs_review | needs_grade_differentiation | needs_grade_differentiation_low_confidence | auto_judged | approved"
}
```

curated raw item 也应补充同类字段，但可以更聚合：

```json
{
  "raw_id": "math_h4_raw_005",
  "grade_assignments": [
    {
      "grade": 7,
      "assignment_type": "textbook_supported",
      "confidence": 0.72,
      "rationale": "教材索引显示多个七年级数学上册覆盖有理数。",
      "textbook_evidence_ids": []
    }
  ],
  "progression_group_id": "math-number-system",
  "progression_basis": "textbook_sequence"
}
```

## 5. 学科证据策略

| 本站学科 | 教材目录 | 策略 |
| --- | --- | --- |
| 语文 | 语文 | 直接使用七八九教材册次辅助年级归属 |
| 数学 | 数学 | 使用教材册次和概念依赖双证据 |
| 英语 | 英语 | 使用教材册次、主题、语言知识和技能等级 |
| 科学 | 科学、物理、化学、生物学、地理 | 优先科学教材；缺口用分科教材作学科证据 |
| 道德与法治 | 道德与法治，必要时参考历史 | 道法教材为直接证据，历史只作邻近证据 |
| 体育 | 体育与健康 | 使用全一册年级路径作年级证据 |
| 艺术 | 艺术、音乐、美术 | 艺术为直接证据，音乐/美术为分科证据 |
| 信息科技 | 当前教材仓库未覆盖 | 使用课标顺序和自主判断，标低置信度 |
| 劳动 | 当前教材仓库未覆盖 | 使用课标顺序和自主判断，标低置信度 |

## 6. 实施阶段

### Phase 1：教材索引与缺口审计

已新增命令：

```bash
npm run textbooks:index-china
npm run grade7_9:audit-textbook-progression
```

目标：

- 固定教材仓库 commit。
- 解析初中教材路径中的学科、版本、年级、册次。
- 建立教材学科到本站学科的映射。
- 输出当前哪些学科有直接证据，哪些只有邻近证据，哪些没有覆盖。

### Phase 1.5：教材单元/章节候选入口

已新增命令：

```bash
npm run textbooks:unit-index
npm run textbooks:audit-unit-index -- --strict
npm run textbooks:match-units
npm run textbooks:audit-unit-matches -- --strict
npm run textbooks:plan-h4g-unit-worklist -- --strict --require-work-items
npm run textbooks:run-h4g-unit-work-item -- --work-item h4g_unit_work_math_6aec3166
```

新增文档：

```text
docs/TEXTBOOK_UNIT_EVIDENCE_PIPELINE.md
```

该阶段目标是把 `china_textbook_index.json` 中的教材文件证据转成后续可匹配的任务入口：

- 默认模式不下载 PDF，只生成 `volume_seed`，粒度为 `textbook_file_grade_level`。
- `volume_seed` 只能说明某年级某册教材文件存在，不能证明某条 standard 对应具体单元。
- 可选 `--materialize` 会尝试读取 PDF 前若干页并解析目录行，生成 `toc_unit_or_chapter`。
- `--evidence-ids` 可以精确指定教材文件做小批量诊断；`--materialize-timeout-ms` 会把长时间 blob 获取记录为 `materialize_timeout`。
- 当前数学人教版样本已可物化 PDF；但 `--materialize` 仍依赖网络、PDF 文本层和 OCR，暂不纳入默认 gate。
- `--ocr-fallback` 可在文本层没有目录候选时使用 macOS Apple Vision OCR 解析前若干页，仍只用于小批量诊断。
- 未来只有 `toc_unit_or_chapter` 加上标准匹配 rationale，才能写入正式 H4G 记录的 `textbook_unit_evidence_ids`。
- `textbooks:match-units` 默认只匹配 `toc_unit_or_chapter`，并输出 `score`、`matched_fields`、`matched_keywords` 和 `rationale`。
- `textbooks:match-units` 的 eligible 门槛要求真实 `toc_unit_or_chapter`、分数达标，并命中标准 `subdomain` 锚点。
- `textbooks:audit-unit-matches` 会阻止 `volume_seed` 或无 `subdomain` 锚点的匹配被当作正式分化证据。
- `textbooks:plan-h4g-unit-worklist` 在物化 PDF 前生成工作清单，按 H4G progression groups、当前候选覆盖和完整 7/8/9 教材版本推荐下一批 `evidence_ids`。
- `textbooks:run-h4g-unit-work-item` 将单个 worklist 批次跑到候选包、consistency gate 和 generated 候选数据根审计；它是执行 gate，不是发布 gate。
- `textbooks:h4g-unit-candidates` 将 eligible matches 组织成写回前候选包，但不修改 `public/data`。
- `textbooks:apply-h4g-unit-candidates` 将候选包应用到独立候选数据根，用于重建索引和严格审计；默认仍不写 `public/data`。

当前数学全量无物化验证结果：

```json
{
  "textbook_files": 51,
  "unit_candidates": 51,
  "real_unit_or_chapter_candidates": 0,
  "volume_seed_candidates": 51
}
```

审计通过但保留 warning：当前还没有真实单元/章节候选。

当前数学人教版 7/8/9 六册小批量验证：

```json
{
  "textbook_files": 6,
  "real_unit_or_chapter_candidates": 118,
  "volume_seed_candidates": 0,
  "eligible_matches": 32,
  "candidate_standards": 15,
  "candidate_standards_by_grade_band": {
    "H4G7": 7,
    "H4G8": 3,
    "H4G9": 5
  }
}
```

七年级下册、八年级下册、九年级下册当前通过 OCR fallback 补足了目录候选。该结果说明候选证据链已经覆盖同版本六册数学教材，但仍不是正式 public 写入；进入写回前还需要通过 consistency audit 检查跨版本一致性、progression group 年级覆盖、页码状态和人工/规则复核状态。

新增 H4G worklist 当前结论：全量 9 学科共有 400 个 progression groups 仍需单元证据，正式 `public/data` 中 `textbook_unit_level` 仍为 0。数学、科学、英语、体育、艺术在 ChinaTextbook 中具备至少两个完整 7/8/9 教材版本；语文、道德与法治只有一个完整统编版本；信息科技、劳动暂无完整教材版本。数学/科学试点 worklist 推荐先跑数学人教版、冀教版、华东师大版，以及科学沪教版、华东师大版、武汉版。

### Phase 2：curated raw 升级

把 `scripts/grade7_9/curated/*_h3_raw.json` 升级为带证据的结构。

建议后续重命名为：

```text
scripts/grade7_9/curated/*_junior_raw.json
```

避免继续使用旧的 `h3` 命名。

### Phase 3：年级映射与进阶关系生成

新增或扩展 normalize 流程：

1. 读取 `grade_assignments`。
2. 生成 `H4G7/H4G8/H4G9` records。
3. 对共同要求标 `standard_variant_type: "same_source_shared"`。
4. 对教材文件级证据写入 `textbook_evidence_ids` 和 `evidence_granularity: "textbook_file_grade_level"`。
5. 对尚未真正分化的三元组写入 `review_status: "needs_grade_differentiation"`。
6. 对证据不足项写入 `auto_judged_low_confidence` 或 `needs_grade_differentiation_low_confidence`。

### Phase 4：严格 gate

新增 gate 应检查：

- 正式初中记录不得继续使用单一 `grade_band: H4`。
- 所有初中记录必须属于 `H4G7/H4G8/H4G9`。
- 每条初中记录必须有 `stage_band: H4`。
- 每条初中记录必须有年级归属依据和置信度。
- `textbook_supported` 必须至少有一个教材证据 id。
- 完整 H4G 三元组如果核心文本完全相同，必须标为 `same_source_shared` 或 `needs_grade_differentiation`。
- `textbook_file_grade_level` 只能证明年级教材文件存在，不能证明标准已经完成单元级分化。
- progression graph 不能形成循环。
- `auto_judged_low_confidence` 可发布，但必须可检索和统计。

### Phase 5：正式数据替换

只有当 Phase 4 gate 通过后，才允许用新的 H4G7/H4G8/H4G9 release candidate 替换当前 H4 记录。

当前状态：Phase 5 已于 2026-07-01 完成，正式 `public/data` 已替换为 H4G7/H4G8/H4G9 runtime 数据。旧 `H4=7-9` 仅保留为 staging/legacy stage 语义。

## 7. 当前已知风险

- 当前 public 数据已经使用 `H4G7/H4G8/H4G9`，不再使用未拆分 H4。
- 当前 curated raw 多数仍是 `target_grades: [7, 8, 9]`，正式 runtime 通过教材序列或低置信度自动判断补足年级归属依据。
- 教材仓库没有直接覆盖信息科技和劳动；这两科正式记录已显式标为 `auto_judged_low_confidence`。
- 科学学科需要处理综合科学与物理、化学、生物学、地理之间的证据边界。
- 教材仓库里存在 `_merge_folder` 分片文件，索引时应默认排除，避免重复计数。

## 8. 首轮审计结论（历史记录）

已运行：

```bash
npm run textbooks:index-china
npm run grade7_9:audit-textbook-progression
```

首轮结论：

```json
{
  "ready_for_public_h4g_split": false,
  "source_commit": "5a80345f2043ba6f8db8d7be9cf3db82725ff1f7",
  "blocker_subjects": 9,
  "warning_subjects": 8
}
```

当时不能直接发布 H4G7/H4G8/H4G9，原因是：

- 9 个学科的正式初中 records 仍使用未拆分的 `grade_band: "H4"`。
- 9 个学科的正式初中 records 都还没有 `grade_assignment_type`、`grade_assignment_confidence`、`progression_group_id`、`progression_basis`、`textbook_evidence_ids`。
- 信息科技、劳动在 ChinaTextbook 初中目录没有直接教材覆盖，后续应使用课标结构顺序和自主判断，标为低置信度。
- 除艺术外，多数学科 curated raw 仍大量使用 `target_grades: [7, 8, 9]`，需要进一步拆出真实年级适配或标成 shared requirement。

教材覆盖摘要：

| subject_slug | 七年级 | 八年级 | 九年级 | 说明 |
| --- | ---: | ---: | ---: | --- |
| arts | 56 | 56 | 56 | 艺术、音乐、美术 |
| chinese | 2 | 2 | 2 | 统编语文上下册 |
| english | 12 | 12 | 10 | 多版本英语 |
| math | 17 | 17 | 17 | 多版本数学 |
| morality_law | 4 | 4 | 4 | 道德与法治 + 历史邻近证据 |
| pe | 4 | 3 | 3 | 体育与健康 |
| science | 39 | 51 | 30 | 科学 + 物理/化学/生物/地理 |
| it | 0 | 0 | 0 | 无直接覆盖 |
| labor | 0 | 0 | 0 | 无直接覆盖 |

## 9. H4G 候选集与正式写入

已新增 H4G 候选生成和审计命令：

```bash
npm run grade7_9:build-grade-level-candidate
npm run grade7_9:audit-grade-level-candidate -- --strict
node scripts/validate-data-indexes.js --data-root generated/grade7_9_grade_level_candidate
```

候选输出目录：

```text
generated/grade7_9_grade_level_candidate/
```

该候选集默认不写入正式 `public/data`，只用于审核。正式写入必须使用 `grade7_9:apply-grade-level-candidate -- --write --confirm-h4g-policy`。

教材单元级候选证据另有候选数据根 apply 流程：

```bash
npm run textbooks:apply-h4g-unit-candidates -- --candidate /tmp/h4g_unit_evidence_candidate_math_ocr2.json --out-data-root /tmp/h4g_unit_evidence_data_candidate_math --strict
node scripts/build-indexes.js --data-root /tmp/h4g_unit_evidence_data_candidate_math
node scripts/validate-data-indexes.js --data-root /tmp/h4g_unit_evidence_data_candidate_math
npm run grade7_9:audit-h4g-distinctiveness -- --data-root /tmp/h4g_unit_evidence_data_candidate_math --strict
npm run grade7_9:audit-h4g-grade-differentiation -- --data-root /tmp/h4g_unit_evidence_data_candidate_math
```

当前数学样本验证结果：15 条 H4G records 获得 `textbook_unit_level` 候选证据，新增 32 个单元证据对象；正式课标字段变化数为 0，候选根严格索引校验和 H4G distinctiveness 审计均通过。新增的 grade differentiation readiness gate 会进一步区分 candidate focus 与 final ready：有单元候选和 `grade_specific_focus` 仍只是复核输入，未获人工/课程复核批准前不能算最终年级化。

当前候选集结果：

```json
{
  "source_records": 1933,
  "preserved_non_junior_records": 852,
  "transformed_junior_records": 1081,
  "candidate_records": 1933,
  "records_with_textbook_evidence": 949,
  "auto_judged_low_confidence_records": 132,
  "shared_requirement_records": 969,
  "needs_grade_differentiation_records": 969,
  "records_requiring_unit_level_evidence": 1081,
  "records_with_unit_level_evidence": 0
}
```

候选初中记录已经从 `H4=7-9` 转为：

| grade_band | grade_range | grade |
| --- | --- | --- |
| H4G7 | 7 | 七年级 |
| H4G8 | 8 | 八年级 |
| H4G9 | 9 | 九年级 |

每条转换后的初中记录都会保留：

- `legacy_code`
- `source_grade_band`
- `source_grade_range`
- `stage_band`
- `grade_level`
- `grade_assignment_type`
- `grade_assignment_confidence`
- `grade_assignment_rationale`
- `textbook_evidence_ids`
- `textbook_evidence`
- `textbook_unit_evidence_ids`
- `progression_group_id`
- `progression_role`
- `progression_basis`
- `progression_confidence`
- `standard_text_role`
- `source_standard_scope`
- `standard_variant_type`
- `evidence_granularity`
- `progression_distinctiveness`
- `progression_distinctiveness_fields`
- `requires_unit_level_evidence`
- `grade_specific_focus`
- `progression_delta`
- `progression_review_note`
- `review_status`

候选审计结果：

```json
{
  "valid": true,
  "ready_for_review": true,
  "junior_records": 1081,
  "records_with_textbook_evidence": 949,
  "auto_judged_low_confidence_records": 132,
  "shared_requirement_records": 969,
  "needs_grade_differentiation_records": 969,
  "records_with_unit_level_evidence": 0
}
```

分学科 H4G 候选统计：

| subject_slug | H4G7 | H4G8 | H4G9 | 教材证据 | 低置信度自动判断 |
| --- | ---: | ---: | ---: | ---: | ---: |
| arts | 27 | 35 | 35 | 97 | 0 |
| chinese | 52 | 52 | 52 | 156 | 0 |
| english | 44 | 44 | 44 | 132 | 0 |
| it | 22 | 22 | 22 | 0 | 66 |
| labor | 22 | 22 | 22 | 0 | 66 |
| math | 38 | 38 | 38 | 114 | 0 |
| morality_law | 42 | 42 | 42 | 126 | 0 |
| pe | 41 | 41 | 41 | 123 | 0 |
| science | 67 | 67 | 67 | 201 | 0 |

当前低置信度自动判断全部来自信息科技和劳动，因为 ChinaTextbook 初中目录没有这两科直接教材覆盖。

正式写入后 public 数据分布为：

```json
{
  "total": 1933,
  "grade_bands": {
    "H1": 236,
    "H2": 308,
    "H3": 308,
    "H4G7": 355,
    "H4G8": 363,
    "H4G9": 363
  }
}
```

## 10. 当前推荐命令

```bash
git clone --filter=blob:none --no-checkout \
  https://github.com/TapXWorld/ChinaTextbook.git \
  generated/external/ChinaTextbook

npm run textbooks:index-china
npm run textbooks:unit-index
npm run textbooks:audit-unit-index -- --strict
npm run textbooks:match-units
npm run textbooks:audit-unit-matches -- --strict
npm run grade7_9:audit-textbook-progression
npm run grade7_9:build-grade-level-candidate
npm run grade7_9:audit-grade-level-candidate -- --strict
npm run grade7_9:audit-h4g-distinctiveness -- --data-root generated/grade7_9_grade_level_candidate --strict
npm run grade7_9:apply-grade-level-candidate -- --write --confirm-h4g-policy
npm run build:indexes
npm run validate:indexes
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-textbook-progression -- --strict
npm run grade7_9:audit-h4g-distinctiveness -- --strict
npm run grade7_9:audit-h4g-grade-differentiation
```

生成的 audit 用来决定每个学科后续人工复核优先级；正式写入 gate 保证 public runtime 不再出现未拆分 H4，distinctiveness gate 保证重复的 H4G 三元组不会被误标为已经完成年级分化，grade differentiation readiness gate 则确认是否已经具备可展示的本年级重点、单元级证据和复核批准。
