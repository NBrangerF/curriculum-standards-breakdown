# H4G Standard Enrichment Publication Contract

生成时间：2026-07-05

状态：v1 publication contract。已用于把 `generated/h4g_standard_enrichment/data_candidate` 转成可审计的 public apply candidate，并在用户确认后全量写入正式 `public/data`。

## 0. 结论

本 contract 先定义 **publication candidate gate**，再由单独 production write gate 执行正式写入。

当前允许做：

- 从 `public/data` 读取正式数据。
- 从 `generated/h4g_standard_enrichment/data_candidate` 读取全量补强候选。
- 生成隔离候选根：`generated/h4g_standard_enrichment_publication/data_candidate`。
- 在候选根里用 enrichment H4G records 替换正式 H4G records，并补入缺失 H4G sibling records。
- 重建候选根 indexes。
- 对候选根做独立 audit。

candidate gate 阶段禁止做：

- 不允许直接写 `public/data`。
- 不允许跳过独立 audit。
- 不允许丢失 `source_standard_original`。
- 不允许把非 H4G records 改掉。
- 不允许把候选等同于已人工审核发布。

## 1. Publication Candidate 的目标

生成一个“如果把 enrichment candidate 发布到正式网站，数据根会长什么样”的候选数据根。

它应满足：

- `public/data` 中非 H4G records 完全不变。
- `public/data` 中已有 1081 条 H4G records 被 enrichment 版本替换。
- enrichment 中新增的 89 条 H4G sibling records 被加入候选根。
- 候选根 H4G records 总数为 1170。
- 候选根 H4G progression groups 总数为 390。
- 每个 group 都有且仅有 H4G7 / H4G8 / H4G9 三条 records。
- 每条 H4G record 保留 `source_standard_original` 和 enrichment lineage。

## 2. 数据来源

| 输入 | 作用 |
| --- | --- |
| `public/data` | 当前 production 数据源，用于保留非 H4G records 和正式元数据。 |
| `generated/h4g_standard_enrichment/data_candidate` | 已完成全量补强的 H4G candidate source。 |
| `generated/h4g_standard_enrichment/standard_enrichment_audit.json` | enrichment candidate 的前置质量证明。 |

## 3. 输出

| 输出 | 作用 |
| --- | --- |
| `generated/h4g_standard_enrichment_publication/data_candidate` | dry-run public apply candidate root。 |
| `generated/h4g_standard_enrichment_publication/publication_apply_summary.json` | apply gate 摘要与对账结果。 |
| `generated/h4g_standard_enrichment_publication/publication_apply_summary.md` | apply gate 人读摘要。 |
| `generated/h4g_standard_enrichment_publication/publication_audit.json` | 独立 audit 结果。 |
| `generated/h4g_standard_enrichment_publication/publication_audit.md` | 独立 audit 人读摘要。 |

## 4. Record 级规则

### 4.1 H4G records

H4G records 以 enrichment candidate 为准。

必须保留：

- `standard`
- `source_standard_original`
- `previous_standard_rewrite`
- `standard_text_role`
- `h4g_rewrite_contract_version`
- `standard_enrichment_contract_version`
- `standard_enrichment_candidate_id`
- `standard_enrichment_method`
- `standard_enrichment_rationale`
- `supplemental_evidence_ids`

必须满足：

- `standard_text_role = "grade_adapted_display_standard"`。
- `standard` 不等于 `source_standard_original`。
- `standard` 不等于 `previous_standard_rewrite`。
- 不含旧模板痕迹：`能结合“` 或 `核心要求`。
- `supplemental_evidence_ids` 非空。

### 4.2 非 H4G records

非 H4G records 必须从 `public/data` 原样保留。

独立 audit 必须确认：

- 非 H4G record count 不变。
- 非 H4G record code 集合不变。
- 非 H4G record 内容不变。

## 5. Group 级规则

每个 H4G `progression_group_id` 必须满足：

- 只有一个 H4G7。
- 只有一个 H4G8。
- 只有一个 H4G9。
- 三条 `standard` 文案必须不同。
- 三条 records 必须共享同一 progression group。

## 6. Public Write 决策

本 contract 的 candidate 输出不能自动写入 `public/data`。

进入真正 public write 前，还需要用户明确决定：

```text
确认将 generated/h4g_standard_enrichment_publication/data_candidate 写入 public/data
```

后续 production write gate 应额外要求：

- publication candidate audit valid。
- candidate root index validation valid。
- `public/data` 备份或 git diff 可回滚。
- 用户明确确认一次性写入。

本轮用户已明确要求全量发布，并已通过 production write gate 写入。

## 7. 命令顺序

```bash
npm run grade7_9:h4g-standard-enrichment-publication-candidate -- --strict --clean
node scripts/build-indexes.js --data-root generated/h4g_standard_enrichment_publication/data_candidate
node scripts/validate-data-indexes.js --data-root generated/h4g_standard_enrichment_publication/data_candidate
npm run grade7_9:audit-h4g-standard-enrichment-publication-candidate -- --strict
npm run validate:indexes
```

最后一条 `npm run validate:indexes` 用于确认正式 `public/data` 没有被本 gate 改动破坏。

正式发布命令：

```bash
npm run grade7_9:publish-h4g-standard-enrichment-publication-candidate -- --write --confirm-h4g-standard-enrichment-publication --strict
npm run build:indexes
npm run grade7_9:audit-h4g-standard-enrichment-publication-release -- --strict
npm run validate:indexes
npm run build
```

## 8. Candidate Gate 执行结果

已执行并通过：

- publication candidate apply：valid。
- publication candidate audit：valid。
- publication candidate index validation：valid。
- current public data index validation：valid。

关键计数：

- candidate H4G records：1170。
- existing public H4G records replaced：1081。
- new H4G sibling records added：89。
- progression groups：390。
- H4G7 / H4G8 / H4G9 records：390 / 390 / 390。
- non-H4G changed records：0。
- writes public data：false。

candidate gate 状态：

`generated/h4g_standard_enrichment_publication/data_candidate` 已作为整体 review 的候选数据根通过验证。

## 9. Production Release 结果

已执行并通过：

- production write：valid。
- release audit：valid。
- public data index validation：valid。
- frontend build：valid。

关键计数：

- public records：2022。
- public H4G records：1170。
- progression groups：390。
- H4G7 / H4G8 / H4G9 records：390 / 390 / 390。
- H4G candidate content mismatches：0。
- non-H4G mismatches：0。
- published status errors：0。

发布摘要：

- `generated/h4g_standard_enrichment_publication/publication_release_summary.md`
- `generated/h4g_standard_enrichment_publication/publication_release_audit.md`

写入前备份：

- `generated/h4g_standard_enrichment_publication/backups/public_data_before_h4g_standard_enrichment_2026-07-05T04-39-34-888Z`
