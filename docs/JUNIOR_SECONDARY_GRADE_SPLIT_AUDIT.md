# 初中段 7-9 年级拆分审计

更新时间：2026-06-30

本文记录 7-9 staging 如何从合写的 H3 raw items 展开为七年级、八年级、九年级记录，并说明当前审计结果。

## 1. 审计命令

```bash
npm run grade7_9:audit-grade-split -- --out generated/grade7_9_grade_split_audit.json
```

该命令只读取：

- `scripts/grade7_9/curated/*_h3_raw.json`
- `generated/grade7_9_all_curated/by_subject/*.json`

不会写入正式 `public/data`。

## 2. 年级拆分原则

2022 版初中段课标常以第四学段或 7-9 年级合写。当前仓库不新增 public schema 字段，而是采用两层结构：

- curated raw 阶段使用 `target_grades` 标明适用年级，例如 `[7, 8, 9]`。
- staging by_subject 阶段使用现有 `grade` 字段展开成 `七年级`、`八年级`、`九年级`。

因此，一条 raw item 如果 `target_grades: [7, 8, 9]`，规范化后必须生成 3 条 records；如果 `target_grades: [8, 9]`，则必须生成 2 条 records。

## 3. 当前审计结论

当前结果：

```json
{
  "valid": true,
  "errorCount": 0,
  "totals": {
    "subjects": 9,
    "raw_items": 400,
    "expected_expanded_records": 1081,
    "actual_expanded_records": 1081
  }
}
```

含义：

- 9 个学科的 curated raw items 都有合法 `target_grades`。
- staging 中每科最终记录数等于 raw `target_grades` 展开数。
- staging 中所有 H3 records 都落在 `七年级`、`八年级`、`九年级`。

## 4. 学科拆分摘要

| 学科 | raw_items | 七年级 | 八年级 | 九年级 | 展开后总数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 艺术 | 62 | 27 | 35 | 35 | 97 |
| 语文 | 52 | 52 | 52 | 52 | 156 |
| 英语 | 54 | 44 | 44 | 44 | 132 |
| 信息科技 | 22 | 22 | 22 | 22 | 66 |
| 劳动 | 22 | 22 | 22 | 22 | 66 |
| 数学 | 38 | 38 | 38 | 38 | 114 |
| 道德与法治 | 42 | 42 | 42 | 42 | 126 |
| 体育与健康 | 41 | 41 | 41 | 41 | 123 |
| 科学 | 67 | 67 | 67 | 67 | 201 |

## 5. 推荐 gate

后续修改 curated raw 或重建 staging 后，应运行：

```bash
npm run grade7_9:build-curated
npm run grade7_9:audit-structure -- --out generated/grade7_9_structure_coverage.json
npm run grade7_9:audit-grade-split -- --out generated/grade7_9_grade_split_audit.json
npm run grade7_9:check-ui -- --staging-root generated/grade7_9_all_curated
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated
```

如果 `audit-grade-split` 失败，应先修复 raw item 的 `target_grades`，或修复 `normalize_schema.js` 的年级展开逻辑，再继续发布准备。
