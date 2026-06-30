# 初中段 7-9 正式接入准备度

更新时间：2026-07-01

本文记录 `generated/grade7_9_all_curated/` 距离正式写入 `public/data/by_subject/` 的当前状态。

接入影响面 dry-run 见 `docs/JUNIOR_SECONDARY_PUBLIC_INTEGRATION_PLAN.md`。
学段口径政策审计见 `docs/JUNIOR_SECONDARY_GRADE_BAND_POLICY.md`。

## 1. 审计命令

```bash
npm run grade7_9:audit-grade-band-policy -- --out generated/grade7_9_grade_band_policy.json
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated
```

如需要把它作为发布 gate 使用：

```bash
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict
```

非 strict 模式会报告 blocker 但不让命令失败；strict 模式会在仍存在发布 blocker 时退出非零。

## 2. 当前结论

当前审计结果：

```json
{
  "ready": false,
  "staging_ready": true,
  "direct_public_integration_ready": false,
  "counts": {
    "staging_subjects": 9,
    "staging_standards": 1081,
    "expected_subjects": 9,
    "public_h3_conflict_subjects": 9
  }
}
```

含义：

- 7-9 staging 数据本身已经通过结构、索引、年级拆分和 TS 映射审计。
- 目前不能直接写入正式 `public/data/by_subject/`。
- 阻塞原因不是 7-9 staging 缺数据，而是正式数据和前端仍在使用 `H3=5-6` 或艺术 `H3=6-7`。
- 按目标政策 `H1=1-2, H2=3-4, H3=7-9` 统计，当前正式 public 数据还有 354 条不兼容记录。

## 3. 已通过的检查

- staging 使用现有标准字段，不新增必需 schema。
- staging 全部使用 `grade_band: "H3"` 和 `grade_range: "7-9"`。
- 每科都拆为“七年级、八年级、九年级”独立 records。
- staging manifest、`code_to_subject`、`skill_to_subjects`、`subject_stats` 均从 `by_subject` 派生并一致。
- curated raw 文件保留 `source_pages` 和 `target_grades`。
- TS 映射使用 TS1-TS7，每条标准有且仅有一个 primary TS。

## 4. 当前阻塞项

正式 `public/data/by_subject/` 已有 `H3` 非 7-9 数据：

| 学科 | 当前正式 H3 grade_range | 条数 |
| --- | --- | ---: |
| 艺术 | 6-7 | 48 |
| 语文 | 5-6 | 28 |
| 英语 | 5-6 | 47 |
| 信息科技 | 5-6 | 15 |
| 劳动 | 5-6 | 47 |
| 数学 | 5-6 | 22 |
| 道德与法治 | 5-6 | 28 |
| 体育 | 5-6 | 29 |
| 科学 | 5-6 | 44 |

前端 `src/data/dataLoader.js` 中：

```js
H3: { label: '第三学段', range: '5-6年级', ... }
```

因此如果现在直接把 7-9 staging 写入正式数据，会让同一个 `grade_band: "H3"` 同时表示 5-6、6-7、7-9，筛选、对比和详情展示都会产生混义。

按完整目标政策审计，除了上述 H3 冲突，还存在艺术 `H2:3-5` 46 条没有目标学段槽位。完整明细见 `docs/JUNIOR_SECONDARY_GRADE_BAND_POLICY.md`。

## 5. 下一步

正式接入前必须先决定并执行统一学段口径：

1. 明确 `H3` 在正式数据中是否改为只表示 7-9。
2. 处理现有 5-6 和艺术 6-7 数据的学段编码或展示策略。
3. 更新 `GRADE_BANDS`、README、glossary、manifest 和派生 indexes。
4. 重新运行：

```bash
npm run grade7_9:build-release-candidate
node scripts/validate-data-indexes.js --data-root generated/grade7_9_release_candidate
node scripts/grade7_9/audit_grade_band_policy.js --public-data-root generated/grade7_9_release_candidate --staging-root generated/grade7_9_release_candidate --data-only --strict
npm run grade7_9:build-curated
npm run grade7_9:audit-grade-split -- --out generated/grade7_9_grade_split_audit.json
npm run grade7_9:plan-integration -- --staging-root generated/grade7_9_all_curated
npm run grade7_9:validate -- --staging-root generated/grade7_9_all_curated --existing-data-root public/data
npm run grade7_9:check-ui -- --staging-root generated/grade7_9_all_curated
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict
npm run build:indexes
npm run validate:indexes
```

只有 strict release audit 通过后，才能把 7-9 staging 写入正式 `public/data/by_subject/`。
