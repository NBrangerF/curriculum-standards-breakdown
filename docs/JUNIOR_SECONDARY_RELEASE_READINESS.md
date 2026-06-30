# 初中段 7-9 正式接入准备度

更新时间：2026-07-01

本文记录 `generated/grade7_9_all_curated/` 写入正式 `public/data/by_subject/` 后的当前状态。

学段口径政策审计见 `docs/JUNIOR_SECONDARY_GRADE_BAND_POLICY.md`。
接入影响面和写入方式见 `docs/JUNIOR_SECONDARY_PUBLIC_INTEGRATION_PLAN.md`。

## 1. 当前结论

7-9 年级数据已经按目标口径接入正式 runtime 数据：

```json
{
  "ready": true,
  "staging_ready": true,
  "direct_public_integration_ready": true,
  "public_records": 1579,
  "staging_7_9_records": 1081,
  "public_h3_conflict_subjects": 0
}
```

当前正式口径是：

| grade_band | grade_range |
| --- | --- |
| H1 | 1-2 |
| H2 | 3-4 |
| H3 | 7-9 |

`src/data/dataLoader.js` 中 `GRADE_BANDS.H3.range` 已同步为 `7-9年级`。

## 2. 正式数据规模

`public/data/by_subject/*.json` 当前合计 1579 条，分学科如下：

| 学科 | 条目数 | H3/7-9 条数 | H3 年级拆分 |
| --- | ---: | ---: | --- |
| 艺术 | 139 | 97 | 七年级 27，八年级 35，九年级 35 |
| 语文 | 197 | 156 | 七年级 52，八年级 52，九年级 52 |
| 英语 | 189 | 132 | 七年级 44，八年级 44，九年级 44 |
| 信息科技 | 101 | 66 | 七年级 22，八年级 22，九年级 22 |
| 劳动 | 134 | 66 | 七年级 22，八年级 22，九年级 22 |
| 数学 | 139 | 114 | 七年级 38，八年级 38，九年级 38 |
| 道德与法治 | 193 | 126 | 七年级 42，八年级 42，九年级 42 |
| 体育 | 182 | 123 | 七年级 41，八年级 41，九年级 41 |
| 科学 | 305 | 201 | 七年级 67，八年级 67，九年级 67 |

## 3. 处理过的口径冲突

按目标政策接入时，原正式 public 数据中没有目标槽位的 354 条记录未保留在 runtime `public/data/by_subject` 中：

| 原范围 | 条数 | 说明 |
| --- | ---: | --- |
| H2:3-5 | 46 | 艺术旧范围 |
| H3:5-6 | 260 | 8 科旧小学高段范围 |
| H3:6-7 | 48 | 艺术旧范围 |

这些记录没有被改写成 7-9 数据；本次采用的是目标口径 runtime 数据集：保留原 public 中符合 `H1=1-2`、`H2=3-4` 的记录，再追加 7-9 staging 记录，并重新生成 manifest 和 indexes。

## 4. 已通过的检查

已运行并通过：

```bash
npm run grade7_9:build-release-candidate
npm run grade7_9:check-release-candidate
npm run grade7_9:apply-release-candidate -- --write --confirm-target-policy
npm run validate:indexes
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict
git diff --check
npm run build
```

检查结果要点：

- `validate:indexes` 返回 `valid: true`。
- `audit-grade-band-policy --strict` 返回 `policy_ready: true`，无 blockers、errors、warnings。
- `audit-release --strict` 返回 `ready: true`、`direct_public_integration_ready: true`。
- `npm run build` 通过，并在 prebuild 中重新生成 1579 条标准对应的 manifest 和索引。
- 候选 runtime 兼容检查覆盖 SubjectPage、CompareView、SearchResultsPage、SkillDetailPage、StandardDetailPage 的主要数据路径。

当前仍有一个非阻塞 warning：既有非 H3 记录 `SC-D1-SC-012` 的 `assessment_evidence_type` 为空。它不影响 7-9 接入，但后续数据质量整理时可以补齐。

## 5. 后续维护 gate

每次修改 7-9 curated raw、release candidate 脚本或正式 `public/data/by_subject` 后，建议运行：

```bash
npm run grade7_9:build-release-candidate
npm run grade7_9:check-release-candidate
npm run validate:indexes
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict
npm run build
```

正式数据的唯一 runtime 主入口仍是 `public/data/by_subject/*.json`；`generated/grade7_9*` 目录是可重建的工作产物，不作为网站发布入口。
