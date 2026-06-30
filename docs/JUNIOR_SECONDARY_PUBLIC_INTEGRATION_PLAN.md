# 初中段 7-9 正式数据接入计划

更新时间：2026-07-01

本文记录将 `generated/grade7_9_all_curated/` 接入正式 `public/data/by_subject/` 的 dry-run 结果。它不是正式合并结果，而是合并前的影响面清单。

学段口径政策审计见 `docs/JUNIOR_SECONDARY_GRADE_BAND_POLICY.md`。

## 1. Dry-run 命令

```bash
npm run grade7_9:plan-integration -- \
  --staging-root generated/grade7_9_all_curated \
  --out generated/grade7_9_public_integration_plan.json
```

该命令只读正式数据和 staging 数据，不写 `public/data`。

## 2. 当前 dry-run 摘要

```json
{
  "append_as_is": {
    "ready": false,
    "public_records": 852,
    "staging_records_to_append": 1081,
    "projected_total": 1933,
    "duplicate_code_count": 0,
    "public_h3_non_7_9_records": 308,
    "post_append_h3_mixed_subjects": 9,
    "would_preserve_existing_public_records": true,
    "would_mix_h3_meanings": true
  }
}
```

解释：

- 7-9 staging 追加到正式数据时没有 code 冲突。
- 追加后总量会从 852 条变为 1933 条。
- 但正式数据已有 308 条 `H3` 非 7-9 记录。
- 9 个学科追加后都会出现同一个 `grade_band: "H3"` 对应多个 `grade_range`。
- 因此不能按 append-as-is 方式直接写入正式 `public/data/by_subject/`。

如果按目标政策 `H1=1-2, H2=3-4, H3=7-9` 审计，正式 public 数据当前共有 354 条不兼容记录，其中包括艺术 `H2:3-5` 46 条、8 科 `H3:5-6` 260 条、艺术 `H3:6-7` 48 条。

## 3. 学科影响面

| 学科 | 正式现有条数 | 7-9 staging 条数 | 追加后条数 | 当前正式 H3 非 7-9 |
| --- | ---: | ---: | ---: | ---: |
| 艺术 | 136 | 97 | 233 | 48 |
| 语文 | 69 | 156 | 225 | 28 |
| 英语 | 104 | 132 | 236 | 47 |
| 信息科技 | 50 | 66 | 116 | 15 |
| 劳动 | 115 | 66 | 181 | 47 |
| 数学 | 47 | 114 | 161 | 22 |
| 道德与法治 | 95 | 126 | 221 | 28 |
| 体育 | 88 | 123 | 211 | 29 |
| 科学 | 148 | 201 | 349 | 44 |

## 4. 真正接入时会触碰的文件

正式接入至少会改动：

- `public/data/by_subject/*.json`
- `public/data/manifest.json`
- `public/data/indexes/code_to_subject.json`
- `public/data/indexes/skill_to_subjects.json`
- `public/data/indexes/subject_stats.json`
- `src/data/dataLoader.js`
- `src/data/schema.js`
- `README.md`
- `docs/RESOURCE_ARCHITECTURE.md`
- `docs/CURRICULUM_STANDARD_DECOMPOSITION_METHOD.md`
- `docs/CURRICULUM_STANDARD_BREAKDOWN_METHOD_CURRENT.md`
- `docs/JUNIOR_SECONDARY_RELEASE_READINESS.md`

## 5. 必须先决策的口径问题

在写入正式数据之前，必须先决定：

1. 现有正式数据中 5-6 和艺术 6-7 的 `H3` 如何迁移或展示。
2. 是否将 `H3` 统一改为只表示 7-9。
3. 是否需要引入新的学段代码，或把小学/初中拆成不同 dataset。
4. 前端 `GRADE_BANDS`、`schema.js` 字段说明、README、glossary 和 manifest 如何同步。

只要这些问题未解决，`grade7_9:audit-release -- --strict` 就应该继续失败，阻止正式写入。

## 6. 推荐 gate

完成口径迁移后，按顺序运行：

```bash
npm run grade7_9:build-release-candidate
node scripts/validate-data-indexes.js --data-root generated/grade7_9_release_candidate
node scripts/grade7_9/audit_grade_band_policy.js --public-data-root generated/grade7_9_release_candidate --staging-root generated/grade7_9_release_candidate --data-only --strict
npm run grade7_9:check-release-candidate
npm run grade7_9:apply-release-candidate
npm run grade7_9:build-curated
npm run grade7_9:plan-integration -- --staging-root generated/grade7_9_all_curated
npm run grade7_9:validate -- --staging-root generated/grade7_9_all_curated --existing-data-root public/data
npm run grade7_9:check-ui -- --staging-root generated/grade7_9_all_curated
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict
npm run build
```

全部通过后，才可以执行真实 `public/data/by_subject` 写入。

候选生成器只写 `generated/grade7_9_release_candidate/`，用于验证目标口径下的数据层形态；它不会修改正式 `public/data`。
候选 UI/runtime 检查会复用前端数据层工具，验证候选数据可支撑学科页、搜索页、对比页、技能页和标准详情页的主要路径。
`grade7_9:apply-release-candidate` 默认也是 dry-run；真正写入必须使用 `-- --write --confirm-target-policy`。
