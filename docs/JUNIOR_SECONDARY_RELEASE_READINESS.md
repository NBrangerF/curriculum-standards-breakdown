# 初中段 7-9 正式接入准备度

更新时间：2026-07-03

本文记录当前 `public/data/` 的正式 runtime 状态。当前结论：`H3=5-6` 已保留，初中第四学段不再用单一 `H4=7-9` 暴露给网站，而是拆为 `H4G7`、`H4G8`、`H4G9`。

## 1. 当前结论

正式数据已经切到 H4G 年级粒度：

```json
{
  "policy_ready": true,
  "public_records": 1933,
  "junior_records": 1081,
  "records_with_textbook_evidence": 949,
  "unit_level_evidence_records": 45,
  "auto_judged_low_confidence_records": 132,
  "legacy_unsplit_h4_public_records": 0
}
```

当前正式口径是：

| grade_band | grade_range | 说明 |
| --- | --- | --- |
| H1 | 1-2 | 第一学段 |
| H2 | 3-4 | 第二学段 |
| H3 | 5-6 | 第三学段 |
| H4G7 | 7 | 第四学段七年级 |
| H4G8 | 8 | 第四学段八年级 |
| H4G9 | 9 | 第四学段九年级 |

旧 `H4=7-9` 只保留为 staging/legacy stage 语义，不再作为正式筛选项。

2026-07-03 起，数学 28 条、科学 17 条 H4G records 已通过 reviewed publication gate 写入 `textbook_unit_level` 证据和 `grade_specific_focus`。这不是改写官方课标原文，而是在共享源标准下补充已审核的年级学习重点；全量 H4G 仍有 1036 条 records 待单元证据或复核。

## 2. 正式数据规模

`public/data/by_subject/*.json` 当前合计 1933 条：

| 学科 | 条目数 | H4G7 | H4G8 | H4G9 | 教材证据 | 低置信度自动判断 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 艺术 | 233 | 27 | 35 | 35 | 97 | 0 |
| 语文 | 225 | 52 | 52 | 52 | 156 | 0 |
| 英语 | 236 | 44 | 44 | 44 | 132 | 0 |
| 信息科技 | 116 | 22 | 22 | 22 | 0 | 66 |
| 劳动 | 181 | 22 | 22 | 22 | 0 | 66 |
| 数学 | 161 | 38 | 38 | 38 | 114 | 0 |
| 道德与法治 | 221 | 42 | 42 | 42 | 126 | 0 |
| 体育 | 211 | 41 | 41 | 41 | 123 | 0 |
| 科学 | 349 | 67 | 67 | 67 | 201 | 0 |
| **合计** | **1933** | **355** | **363** | **363** | **949** | **132** |

信息科技和劳动在 ChinaTextbook 初中目录中没有可映射教材文件，因此 132 条记录显式标为 `auto_judged_low_confidence`，前端卡片和详情页会显示低置信度与年级归属依据。

其中 `textbook_unit_level` records 当前合计 45 条：数学 28 条、科学 17 条；年级分布为 `H4G7=14`、`H4G8=16`、`H4G9=15`。

## 3. 已完成的修复

- 保留原正式 H1/H2/H3 记录，共 852 条。
- 将 1081 条初中记录从 `H4=7-9` 转为 `H4G7/H4G8/H4G9`。
- 为初中记录写入 `stage_band`、`grade_level`、`grade_assignment_*`、`textbook_evidence_ids`、`progression_*`、`review_status`。
- 更新前端 `GRADE_BANDS`、筛选入口、对比上限、卡片和详情页证据展示。
- 新增 `grade7_9:apply-grade-level-candidate`，正式写入必须使用 `--write --confirm-h4g-policy`。
- `public/data/junior_grade_level_summary.json` 记录本次 H4G 写入统计。

## 4. 已通过的检查

已运行并通过：

```bash
npm run grade7_9:build-grade-level-candidate
npm run grade7_9:audit-grade-level-candidate -- --strict
node scripts/validate-data-indexes.js --data-root generated/grade7_9_grade_level_candidate
npm run grade7_9:apply-grade-level-candidate -- --write --confirm-h4g-policy
npm run build:indexes
npm run validate:indexes
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-textbook-progression -- --strict
npm run grade7_9:audit-h4g-grade-differentiation -- --data-root public/data
npm run grade7_9:audit-h4g-distinctiveness -- --data-root public/data --strict
```

`audit-textbook-progression` 当前没有 blocker；保留 warning 的原因是部分 curated raw 仍为 7/8/9 共享要求，以及信息科技、劳动缺少教材覆盖但已低置信度标注。

## 5. 后续维护 gate

每次修改 7-9 curated raw、H4G 生成脚本或正式 `public/data/by_subject` 后，建议运行：

```bash
npm run textbooks:index-china
npm run grade7_9:build-grade-level-candidate
npm run grade7_9:audit-grade-level-candidate -- --strict
node scripts/validate-data-indexes.js --data-root generated/grade7_9_grade_level_candidate
npm run grade7_9:apply-grade-level-candidate -- --write --confirm-h4g-policy
npm run build:indexes
npm run validate:indexes
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-textbook-progression -- --strict
npm run build
```

正式数据的唯一 runtime 主入口仍是 `public/data/by_subject/*.json`；`generated/grade7_9*` 目录是可重建工作产物，不作为网站发布入口。
