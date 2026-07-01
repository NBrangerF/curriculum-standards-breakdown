# 初中段 7-9 正式接入准备度

更新时间：2026-07-01

本文记录 `generated/grade7_9_all_curated/` 写入正式 `public/data/by_subject/` 后的当前状态。当前修复后的结论是：H3 已恢复为 5-6，7-9 年级使用 H4。

## 1. 当前结论

7-9 年级数据已经按修复后的口径接入正式 runtime 数据：

```json
{
  "ready": true,
  "staging_ready": true,
  "direct_public_integration_ready": true,
  "public_records": 1933,
  "staging_7_9_records": 1081,
  "public_junior_band_conflict_subjects": 0
}
```

当前正式口径是：

| grade_band | grade_range |
| --- | --- |
| H1 | 1-2 |
| H2 | 3-4 |
| H3 | 5-6 |
| H4 | 7-9 |

## 2. 正式数据规模

`public/data/by_subject/*.json` 当前合计 1933 条，分学科如下：

| 学科 | 条目数 | H4/7-9 条数 | H4 年级拆分 |
| --- | ---: | ---: | --- |
| 艺术 | 233 | 97 | 七年级 27，八年级 35，九年级 35 |
| 语文 | 225 | 156 | 七年级 52，八年级 52，九年级 52 |
| 英语 | 236 | 132 | 七年级 44，八年级 44，九年级 44 |
| 信息科技 | 116 | 66 | 七年级 22，八年级 22，九年级 22 |
| 劳动 | 181 | 66 | 七年级 22，八年级 22，九年级 22 |
| 数学 | 161 | 114 | 七年级 38，八年级 38，九年级 38 |
| 道德与法治 | 221 | 126 | 七年级 42，八年级 42，九年级 42 |
| 体育 | 211 | 123 | 七年级 41，八年级 41，九年级 41 |
| 科学 | 349 | 201 | 七年级 67，八年级 67，九年级 67 |

## 3. 已修复的问题

上一版接入把 7-9 写入 H3，并导致旧 `H3=5-6` runtime 数据缺失。本次修复：

- 恢复旧 public H1/H2/H3 数据，共 852 条。
- 将 7-9 staging 重新生成为 H4，共 1081 条。
- 更新前端 `GRADE_BANDS` 为 H1/H2/H3/H4 四段。
- 更新 compare 逻辑和样式，允许单学科最多对比 4 个学段。
- 更新 release candidate、policy audit、release readiness 和 UI compatibility 脚本。

## 4. 已通过的检查

已运行并通过：

```bash
npm run grade7_9:build-curated
npm run grade7_9:check-ui -- --staging-root generated/grade7_9_all_curated
npm run grade7_9:build-release-candidate -- --public-data-root generated/pre_h4_baseline/public/data
node scripts/validate-data-indexes.js --data-root generated/grade7_9_release_candidate
node scripts/grade7_9/audit_grade_band_policy.js --public-data-root generated/grade7_9_release_candidate --staging-root generated/grade7_9_release_candidate --data-only --strict
npm run grade7_9:check-release-candidate
npm run grade7_9:apply-release-candidate -- --write --confirm-target-policy
npm run validate:indexes
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict
```

当前仍有一个非阻塞 warning：既有非 H4 记录 `SC-D1-SC-012` 的 `assessment_evidence_type` 为空。它不影响本次学段修复。

## 5. 后续维护 gate

每次修改 7-9 curated raw、release candidate 脚本或正式 `public/data/by_subject` 后，建议运行：

```bash
npm run grade7_9:build-curated
npm run grade7_9:build-release-candidate
npm run grade7_9:check-release-candidate
npm run validate:indexes
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict
npm run build
```

正式数据的唯一 runtime 主入口仍是 `public/data/by_subject/*.json`；`generated/grade7_9*` 目录是可重建的工作产物，不作为网站发布入口。
