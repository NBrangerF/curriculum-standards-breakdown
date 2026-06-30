# 初中段 7-9 正式数据接入记录

更新时间：2026-07-01

本文记录将 `generated/grade7_9_all_curated/` 接入正式 `public/data/by_subject/` 的实际方式、影响面和后续维护命令。

学段口径政策审计见 `docs/JUNIOR_SECONDARY_GRADE_BAND_POLICY.md`。
发布准备度见 `docs/JUNIOR_SECONDARY_RELEASE_READINESS.md`。

## 1. 接入策略

本次采用目标口径 runtime 数据集：

| grade_band | grade_range |
| --- | --- |
| H1 | 1-2 |
| H2 | 3-4 |
| H3 | 7-9 |

策略不是 append-as-is。原因是旧 public 数据中存在 `H2:3-5`、`H3:5-6`、`H3:6-7`，如果直接追加 7-9，会让同一个 `grade_band` 表示多个年级范围。

实际策略：

- 保留旧 public 中符合目标口径的记录：498 条。
- 追加 7-9 staging records：1081 条。
- 不把旧的 354 条 out-of-policy 记录保留在 runtime `public/data/by_subject`。
- 重新生成 `public/data/manifest.json` 和 `public/data/indexes/*.json`。
- 将 `src/data/dataLoader.js` 中 `GRADE_BANDS.H3.range` 更新为 `7-9年级`。

## 2. 写入命令

候选数据通过以下命令生成：

```bash
npm run grade7_9:build-release-candidate
```

实际写入通过以下命令执行：

```bash
npm run grade7_9:apply-release-candidate -- --write --confirm-target-policy
```

`grade7_9:apply-release-candidate` 默认仍是 dry-run。只有同时传入 `--write` 和 `--confirm-target-policy` 时，才会写入正式 `public/data`。

## 3. 写入影响面

实际写入更新了：

- `public/data/manifest.json`
- `public/data/by_subject/arts.json`
- `public/data/by_subject/chinese.json`
- `public/data/by_subject/english.json`
- `public/data/by_subject/it.json`
- `public/data/by_subject/labor.json`
- `public/data/by_subject/math.json`
- `public/data/by_subject/morality_law.json`
- `public/data/by_subject/pe.json`
- `public/data/by_subject/science.json`
- `public/data/indexes/code_to_subject.json`
- `public/data/indexes/skill_to_subjects.json`
- `public/data/indexes/subject_stats.json`
- `src/data/dataLoader.js`

写入结果：

```json
{
  "public_records_before": 852,
  "preserved_public_records": 498,
  "staging_7_9_records": 1081,
  "archived_out_of_policy_records": 354,
  "candidate_records": 1579,
  "candidate_subjects": 9
}
```

说明：`archived_out_of_policy_records` 是候选生成阶段统计的旧口径记录数；这些旧记录没有被改写为新年级，也没有进入当前 runtime 主数据。

## 4. 当前正式数据规模

| 学科 | 当前正式条数 | H1 | H2 | H3/7-9 |
| --- | ---: | ---: | ---: | ---: |
| 艺术 | 139 | 42 | 0 | 97 |
| 语文 | 197 | 15 | 26 | 156 |
| 英语 | 189 | 0 | 57 | 132 |
| 信息科技 | 101 | 16 | 19 | 66 |
| 劳动 | 134 | 25 | 43 | 66 |
| 数学 | 139 | 7 | 18 | 114 |
| 道德与法治 | 193 | 36 | 31 | 126 |
| 体育 | 182 | 30 | 29 | 123 |
| 科学 | 305 | 65 | 39 | 201 |
| **合计** | **1579** | **236** | **262** | **1081** |

## 5. 已通过的 gate

写入后已通过：

```bash
npm run validate:indexes
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict
git diff --check
npm run build
```

结果：

- 索引一致，`validate:indexes` 返回 `valid: true`。
- 学段政策一致，`audit-grade-band-policy --strict` 返回 `policy_ready: true`。
- 发布审计一致，`audit-release --strict` 返回 `ready: true`。
- 前端生产构建通过。

## 6. 后续维护方式

后续如继续调整 7-9 curated raw 或映射规则，推荐顺序是：

```bash
npm run grade7_9:build-curated
npm run grade7_9:audit-grade-split -- --out generated/grade7_9_grade_split_audit.json
npm run grade7_9:build-release-candidate
npm run grade7_9:check-release-candidate
npm run grade7_9:apply-release-candidate
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict
npm run build
```

确认候选集后，再执行真实写入：

```bash
npm run grade7_9:apply-release-candidate -- --write --confirm-target-policy
npm run validate:indexes
npm run build
```

不得绕过 release candidate 直接手工拼接 `public/data/by_subject/*.json`，否则容易造成 manifest、indexes、前端学段口径或 TS 反查不一致。
