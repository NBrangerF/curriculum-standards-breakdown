# 初中段 7-9 正式数据接入记录

更新时间：2026-07-01

本文记录将 `generated/grade7_9_all_curated/` 接入正式 `public/data/by_subject/` 的当前方式。核心修复是：恢复原有 `H3=5-6`，并将 7-9 年级统一放入 `H4=7-9`。

## 1. 当前接入策略

当前 runtime 口径：

| grade_band | grade_range |
| --- | --- |
| H1 | 1-2 |
| H2 | 3-4 |
| H3 | 5-6 |
| H4 | 7-9 |

实际策略：

- 恢复并保留原 public 中的 H1/H2/H3 记录：852 条。
- 将 7-9 staging records 作为 H4 追加：1081 条。
- 不再让 7-9 占用 H3。
- 重新生成 `public/data/manifest.json` 和 `public/data/indexes/*.json`。
- 将 `src/data/dataLoader.js` 中 H3 恢复为 `5-6年级`，新增 H4 `7-9年级`。

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

实际写入更新：

- `public/data/manifest.json`
- `public/data/by_subject/*.json`
- `public/data/indexes/code_to_subject.json`
- `public/data/indexes/skill_to_subjects.json`
- `public/data/indexes/subject_stats.json`
- `src/data/dataLoader.js`

当前写入结果：

```json
{
  "public_records_restored": 852,
  "staging_7_9_records": 1081,
  "candidate_records": 1933,
  "candidate_subjects": 9
}
```

## 4. 当前正式数据规模

| 学科 | 当前正式条数 | H1 | H2 | H3 | H4/7-9 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 艺术 | 233 | 42 | 46 | 48 | 97 |
| 语文 | 225 | 15 | 26 | 28 | 156 |
| 英语 | 236 | 0 | 57 | 47 | 132 |
| 信息科技 | 116 | 16 | 19 | 15 | 66 |
| 劳动 | 181 | 25 | 43 | 47 | 66 |
| 数学 | 161 | 7 | 18 | 22 | 114 |
| 道德与法治 | 221 | 36 | 31 | 28 | 126 |
| 体育 | 211 | 30 | 29 | 29 | 123 |
| 科学 | 349 | 65 | 39 | 44 | 201 |
| **合计** | **1933** | **236** | **308** | **308** | **1081** |

## 5. 已通过的 gate

写入后已通过：

```bash
npm run validate:indexes
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict
```

结果：

- 索引一致，`validate:indexes` 返回 `valid: true`。
- 学段政策一致，`audit-grade-band-policy --strict` 返回 `policy_ready: true`。
- 发布审计一致，`audit-release --strict` 返回 `ready: true`。

## 6. 后续维护方式

后续如继续调整 7-9 curated raw 或映射规则，推荐顺序是：

```bash
npm run grade7_9:build-curated
npm run grade7_9:check-ui -- --staging-root generated/grade7_9_all_curated
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

不得绕过 release candidate 直接手工拼接 `public/data/by_subject/*.json`。
