# 初中段 7-9 学段口径政策审计

更新时间：2026-07-01

本文记录当前 runtime 数据采用的学段/年级口径、旧 H4 staging 的边界，以及可执行的发布 gate。

## 1. 当前正式口径

当前正式 `public/data/by_subject/` 采用以下展示口径：

| grade_band | grade_range | 前端展示 |
| --- | --- | --- |
| H1 | 1-2 | 第一学段 / 1-2年级 |
| H2 | 3-4 | 第二学段 / 3-4年级 |
| H3 | 5-6 | 第三学段 / 5-6年级 |
| H4G7 | 7 | 第四学段·七年级 / 7年级 |
| H4G8 | 8 | 第四学段·八年级 / 8年级 |
| H4G9 | 9 | 第四学段·九年级 / 9年级 |

初中记录使用：

```json
{
  "stage_band": "H4",
  "grade_band": "H4G7 | H4G8 | H4G9",
  "grade_range": "7 | 8 | 9",
  "grade": "七年级 | 八年级 | 九年级"
}
```

`src/data/dataLoader.js` 中 `GRADE_BANDS.H4` 仅保留为 `selectable: false` 的 legacy stage label；首页、搜索页、学科页和对比视图使用 `H4G7/H4G8/H4G9`。

## 2. 数据范围说明

当前 strict gate 区分“正式 runtime 目标范围”和“中间层允许范围”：

| grade_band | runtime 目标 | 允许的数据范围 |
| --- | --- | --- |
| H1 | 1-2 | 1-2 |
| H2 | 3-4 | 3-4，艺术旧数据 3-5 |
| H3 | 5-6 | 5-6，艺术旧数据 6-7 |
| H4G7 | 7 | 7 |
| H4G8 | 8 | 8 |
| H4G9 | 9 | 9 |
| H4 | legacy staging only | 7-9 |

艺术学科保留 `H2:3-5` 和 `H3:6-7` 是为了不篡改旧 public 数据中的来源年级范围；前端仍按 H2/H3 的顺序展示，并在详情页显示记录自己的 `grade_range`。

## 3. 审计命令

发布 gate 使用 strict 模式：

```bash
npm run grade7_9:audit-grade-band-policy -- --strict
```

当前 strict 结果要点：

```json
{
  "policy_ready": true,
  "public_data": {
    "totals": {
      "records": 1933,
      "subjects": 9,
      "incompatible_records": 0,
      "legacy_unsplit_junior_records": 0
    }
  },
  "frontend": {
    "grade_bands": {
      "H1": { "matches": true },
      "H2": { "matches": true },
      "H3": { "matches": true },
      "H4G7": { "matches": true },
      "H4G8": { "matches": true },
      "H4G9": { "matches": true }
    }
  },
  "blockers": [],
  "errors": [],
  "warnings": []
}
```

## 4. 当前正式数据分布

| 学科 | H1 | H2 | H3 | H4G7 | H4G8 | H4G9 | 合计 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 艺术 | 42 | 46 | 48 | 27 | 35 | 35 | 233 |
| 语文 | 15 | 26 | 28 | 52 | 52 | 52 | 225 |
| 英语 | 0 | 57 | 47 | 44 | 44 | 44 | 236 |
| 信息科技 | 16 | 19 | 15 | 22 | 22 | 22 | 116 |
| 劳动 | 25 | 43 | 47 | 22 | 22 | 22 | 181 |
| 数学 | 7 | 18 | 22 | 38 | 38 | 38 | 161 |
| 道德与法治 | 36 | 31 | 28 | 42 | 42 | 42 | 221 |
| 体育 | 30 | 29 | 29 | 41 | 41 | 41 | 211 |
| 科学 | 65 | 39 | 44 | 67 | 67 | 67 | 349 |
| **合计** | **236** | **308** | **308** | **355** | **363** | **363** | **1933** |

## 5. H4G runtime 工具

候选生成器使用当前 `public/data` 和 ChinaTextbook 索引生成可审计 H4G 数据根：

```bash
npm run grade7_9:build-grade-level-candidate
npm run grade7_9:audit-grade-level-candidate -- --strict
npm run grade7_9:audit-h4g-distinctiveness -- --data-root generated/grade7_9_grade_level_candidate --strict
node scripts/validate-data-indexes.js --data-root generated/grade7_9_grade_level_candidate
```

实际写入必须显式确认：

```bash
npm run grade7_9:apply-grade-level-candidate -- --write --confirm-h4g-policy
```

写入后必须重建并校验正式索引：

```bash
npm run build:indexes
npm run validate:indexes
npm run grade7_9:audit-h4g-distinctiveness -- --strict
```

当前 H4G distinctiveness 口径：

- `H4G7/H4G8/H4G9` 是正式 runtime 年级筛选口径。
- 如果同一 `progression_group_id` 的三年级核心文本完全相同，数据必须标为 `standard_variant_type: "same_source_shared"`。
- 这些记录的 `review_status` 必须包含 `needs_grade_differentiation`，直到教材单元/章节级证据足以支撑真实年级化解释。
- 当前 public 数据中 323 个完整 H4G 三元组核心文本完全相同，均已标为共享源标准；`unlabeled_identical_triplets` 为 0。

## 6. 不应执行的操作

后续维护时不应：

- 把 7-9 写入 H3。
- 把正式 runtime 继续暴露为单一 `H4=7-9`。
- 为了通过校验而删除旧 `H3=5-6` 数据。
- 把艺术旧 `H2:3-5` 或 `H3:6-7` 强行改成通用展示范围。
- 绕过 H4G candidate/apply 脚本手工拼接 `public/data/by_subject/*.json`。

这些做法都会造成课标数据与年级含义不一致。

## 7. 推荐 gate

每次准备发布或改动正式数据后运行：

```bash
npm run grade7_9:build-grade-level-candidate
npm run grade7_9:audit-grade-level-candidate -- --strict
npm run grade7_9:audit-h4g-distinctiveness -- --data-root generated/grade7_9_grade_level_candidate --strict
npm run validate:indexes
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-textbook-progression -- --strict
npm run grade7_9:audit-h4g-distinctiveness -- --strict
npm run build
```

只有以上 gates 通过，当前 `H1=1-2, H2=3-4, H3=5-6, H4G7=7, H4G8=8, H4G9=9` runtime 口径才算保持一致，并且 H4G 重复记录不会被误读为已完成真实年级分化。
