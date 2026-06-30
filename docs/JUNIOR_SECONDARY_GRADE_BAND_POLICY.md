# 初中段 7-9 学段口径政策审计

更新时间：2026-07-01

本文记录当前 runtime 数据采用的学段口径、旧数据冲突处理方式，以及可执行的发布 gate。

## 1. 当前正式口径

当前正式 `public/data/by_subject/` 已采用以下目标口径：

| grade_band | grade_range | 前端展示 |
| --- | --- | --- |
| H1 | 1-2 | 1-2年级 |
| H2 | 3-4 | 3-4年级 |
| H3 | 7-9 | 7-9年级 |

7-9 年级记录使用：

```json
{
  "grade_band": "H3",
  "grade_range": "7-9",
  "grade": "七年级 | 八年级 | 九年级"
}
```

`src/data/dataLoader.js` 中 `GRADE_BANDS.H3.range` 已同步为 `7-9年级`。

## 2. 审计命令

非 strict 模式可输出报告：

```bash
npm run grade7_9:audit-grade-band-policy -- \
  --out generated/grade7_9_grade_band_policy.json
```

发布 gate 使用 strict 模式：

```bash
npm run grade7_9:audit-grade-band-policy -- --strict
```

当前 strict 结果：

```json
{
  "policy_ready": true,
  "public_data": {
    "totals": {
      "records": 1579,
      "subjects": 9,
      "incompatible_records": 0,
      "incompatible_ranges": {}
    }
  },
  "frontend": {
    "grade_bands": {
      "H1": { "matches": true },
      "H2": { "matches": true },
      "H3": { "matches": true }
    }
  },
  "blockers": [],
  "errors": [],
  "warnings": []
}
```

## 3. 已处理的旧口径冲突

写入目标口径 runtime 前，旧 `public/data/by_subject` 中有 354 条记录不符合当前目标政策：

| 冲突范围 | 条数 | 涉及学科 |
| --- | ---: | --- |
| H2:3-5 | 46 | arts |
| H3:5-6 | 260 | chinese, english, it, labor, math, morality_law, pe, science |
| H3:6-7 | 48 | arts |

本次没有把这些记录直接改成 `H3:7-9`，也没有把 5-6 强行塞入 `H2:3-4`。当前 runtime 采用 target-policy-only 策略：

- 保留旧 public 中已符合目标口径的 498 条记录。
- 追加 7-9 staging 的 1081 条记录。
- 将 354 条 out-of-policy 记录移出 runtime 主数据。
- 重新派生 manifest 和 indexes。

这使 `public/data/by_subject` 中不再存在 `H2:3-5`、`H3:5-6`、`H3:6-7` 这些无法由当前目标口径表达的范围。

## 4. 当前正式数据分布

| 学科 | H1:1-2 | H2:3-4 | H3:7-9 | 合计 |
| --- | ---: | ---: | ---: | ---: |
| arts | 42 | 0 | 97 | 139 |
| chinese | 15 | 26 | 156 | 197 |
| english | 0 | 57 | 132 | 189 |
| it | 16 | 19 | 66 | 101 |
| labor | 25 | 43 | 66 | 134 |
| math | 7 | 18 | 114 | 139 |
| morality_law | 36 | 31 | 126 | 193 |
| pe | 30 | 29 | 123 | 182 |
| science | 65 | 39 | 201 | 305 |
| **合计** | **236** | **262** | **1081** | **1579** |

## 5. 候选 runtime 工具

候选生成器用于从当前 staging 和 public 数据重建目标口径 runtime：

```bash
npm run grade7_9:build-release-candidate
```

默认输出：

```text
generated/grade7_9_release_candidate/
├── by_subject/
├── indexes/
├── archived_out_of_policy/
├── manifest.json
├── subjects_meta.json
├── skills_meta.json
├── glossary.json
└── release_candidate_summary.json
```

候选数据校验：

```bash
node scripts/validate-data-indexes.js --data-root generated/grade7_9_release_candidate
node scripts/grade7_9/audit_grade_band_policy.js \
  --public-data-root generated/grade7_9_release_candidate \
  --staging-root generated/grade7_9_release_candidate \
  --data-only \
  --strict
npm run grade7_9:check-release-candidate
```

正式写入必须显式确认目标政策：

```bash
npm run grade7_9:apply-release-candidate -- --write --confirm-target-policy
```

不带 `--write` 时，该命令只做 dry-run。

## 6. 不应执行的操作

后续维护时仍不应：

- 直接 append 7-9 staging 到 `public/data/by_subject`，绕过 release candidate。
- 把旧 `H3:5-6` 或 `H3:6-7` 记录直接改成 `H3:7-9`。
- 把旧 `H2:3-5` 强行改成 `H2:3-4`。
- 修改 grade_band 口径但不同步 schema、前端文案、manifest、indexes 和文档。

这些做法都会造成课标数据与年级含义不一致。

## 7. 推荐 gate

每次准备发布或改动正式数据后运行：

```bash
npm run validate:indexes
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict
npm run build
```

只有以上 gates 通过，当前 `H1=1-2, H2=3-4, H3=7-9` runtime 口径才算保持一致。
