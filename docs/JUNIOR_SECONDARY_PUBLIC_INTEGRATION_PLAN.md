# 初中段 7-9 正式数据接入记录

更新时间：2026-07-01

本文记录将初中 7-9 数据接入正式 `public/data/by_subject/` 的当前方式。核心修复是：恢复并保留原有 `H3=5-6`，并将 7-9 年级从单一 `H4=7-9` 拆成 `H4G7/H4G8/H4G9`。

## 1. 当前接入策略

当前 runtime 口径：

| grade_band | grade_range |
| --- | --- |
| H1 | 1-2 |
| H2 | 3-4 |
| H3 | 5-6 |
| H4G7 | 7 |
| H4G8 | 8 |
| H4G9 | 9 |

实际策略：

- 恢复并保留原 public 中的 H1/H2/H3 记录：852 条。
- 将 7-9 staging records 转为 H4G7/H4G8/H4G9：1081 条。
- 不再让 7-9 占用 H3，也不再把初中三年作为单一 H4 筛选项。
- 为初中 records 写入年级归属依据、教材证据、进阶关系和 review status。
- 重新生成 `public/data/manifest.json` 和 `public/data/indexes/*.json`。
- 将 `src/data/dataLoader.js` 的正式可选项改为 H1/H2/H3/H4G7/H4G8/H4G9；H4 仅作为 legacy stage label。

## 2. 写入命令

候选数据通过以下命令生成：

```bash
npm run grade7_9:build-grade-level-candidate
```

候选审计：

```bash
npm run grade7_9:audit-grade-level-candidate -- --strict
node scripts/validate-data-indexes.js --data-root generated/grade7_9_grade_level_candidate
```

实际写入通过以下命令执行：

```bash
npm run grade7_9:apply-grade-level-candidate -- --write --confirm-h4g-policy
```

`grade7_9:apply-grade-level-candidate` 默认仍是 dry-run。只有同时传入 `--write` 和 `--confirm-h4g-policy` 时，才会写入正式 `public/data`。

## 3. 写入影响面

实际写入更新：

- `public/data/manifest.json`
- `public/data/junior_grade_level_summary.json`
- `public/data/by_subject/*.json`
- `public/data/indexes/code_to_subject.json`
- `public/data/indexes/skill_to_subjects.json`
- `public/data/indexes/subject_stats.json`
- 前端 `GRADE_BANDS`、筛选入口、对比逻辑、schema normalization、卡片和详情页证据展示

当前写入结果：

```json
{
  "preserved_non_junior_records": 852,
  "transformed_junior_records": 1081,
  "candidate_records": 1933,
  "records_with_textbook_evidence": 949,
  "auto_judged_low_confidence_records": 132
}
```

## 4. 当前正式数据规模

| 学科 | 当前正式条数 | H1 | H2 | H3 | H4G7 | H4G8 | H4G9 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 艺术 | 233 | 42 | 46 | 48 | 27 | 35 | 35 |
| 语文 | 225 | 15 | 26 | 28 | 52 | 52 | 52 |
| 英语 | 236 | 0 | 57 | 47 | 44 | 44 | 44 |
| 信息科技 | 116 | 16 | 19 | 15 | 22 | 22 | 22 |
| 劳动 | 181 | 25 | 43 | 47 | 22 | 22 | 22 |
| 数学 | 161 | 7 | 18 | 22 | 38 | 38 | 38 |
| 道德与法治 | 221 | 36 | 31 | 28 | 42 | 42 | 42 |
| 体育 | 211 | 30 | 29 | 29 | 41 | 41 | 41 |
| 科学 | 349 | 65 | 39 | 44 | 67 | 67 | 67 |
| **合计** | **1933** | **236** | **308** | **308** | **355** | **363** | **363** |

## 5. 已通过的 gate

写入后已通过：

```bash
npm run build:indexes
npm run validate:indexes
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-textbook-progression -- --strict
```

结果：

- 索引一致，`validate:indexes` 返回 `valid: true`。
- 学段政策一致，`audit-grade-band-policy --strict` 返回 `policy_ready: true`，正式 public 未拆分 H4 记录为 0。
- 教材进阶审计返回 `ready_for_public_h4g_split: true`，没有 blocker。
- 信息科技和劳动保留 warning，因为 ChinaTextbook 没有可映射初中教材，正式记录已标为 `auto_judged_low_confidence`。

## 6. 后续维护方式

后续如继续调整 7-9 curated raw 或映射规则，推荐顺序是：

```bash
npm run textbooks:index-china
npm run grade7_9:build-grade-level-candidate
npm run grade7_9:audit-grade-level-candidate -- --strict
node scripts/validate-data-indexes.js --data-root generated/grade7_9_grade_level_candidate
npm run grade7_9:apply-grade-level-candidate
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-textbook-progression -- --strict
npm run build
```

确认候选集后，再执行真实写入：

```bash
npm run grade7_9:apply-grade-level-candidate -- --write --confirm-h4g-policy
npm run build:indexes
npm run validate:indexes
npm run build
```

不得绕过 H4G candidate/apply 脚本直接手工拼接 `public/data/by_subject/*.json`。
