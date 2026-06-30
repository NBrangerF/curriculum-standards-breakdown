# 劳动 7-9 年级首批结构化 staging 说明

更新时间：2026-06-30

## 1. 当前状态

劳动学科已经完成第四学段首批 curated raw items，并通过现有 7-9 staging pipeline 生成可校验的 by_subject 数据。

当前产物仍是 staging，不写入 `public/data/by_subject/`。

原因：

- 当前正式数据中 `H3` 已被 5-6 或 6-7 年级使用。
- 初中段 `H3=7-9` 口径尚未与正式数据合并策略统一。
- OCR 文本虽已可用，但仍需要人工复核。

## 2. 输入来源

官方来源：

```text
raw/grade7_9/sources/labor-W020220420582367012450.pdf
```

复核页包：

```text
generated/grade7_9/review_packs_range/labor.junior_review.md
generated/grade7_9/review_packs_range/labor.junior_review.json
```

curated raw：

```text
scripts/grade7_9/curated/labor_h3_raw.json
```

主要依据页码：

- 第四学段课程目标：17-18 页
- 第四学段课程内容：35-44 页
- 项目开发与年级示例：45-46 页
- 课程评价建议：62-64 页

## 3. 拆解结果

首批 curated raw items：

- 22 条原子标准草案。
- 每条包含 `source_pages` 以便回查官方 PDF。
- 每条使用 `target_grades: [7, 8, 9]`。

normalize 后：

- 66 条 standards。
- 七年级 22 条。
- 八年级 22 条。
- 九年级 22 条。

领域分布：

| domain | records |
| --- | ---: |
| 日常生活劳动 | 12 |
| 生产劳动 | 15 |
| 服务性劳动 | 6 |
| 公益劳动与志愿服务 | 3 |
| 劳动目标 | 12 |
| 劳动素养要求 | 12 |
| 课程评价 | 6 |

## 4. 验证命令

```bash
rm -rf generated/grade7_9_labor_curated
mkdir -p generated/grade7_9_labor_curated/{normalized,mapped,by_subject}
node scripts/grade7_9/normalize_schema.js \
  --input scripts/grade7_9/curated/labor_h3_raw.json \
  --out generated/grade7_9_labor_curated/normalized/labor.json
node scripts/grade7_9/map_ts.js \
  --input generated/grade7_9_labor_curated/normalized/labor.json \
  --out generated/grade7_9_labor_curated/mapped/labor.json
node scripts/grade7_9/build_by_subject.js \
  --input-dir generated/grade7_9_labor_curated/mapped \
  --out-dir generated/grade7_9_labor_curated/by_subject
node scripts/grade7_9/validate_schema.js \
  --by-subject-dir generated/grade7_9_labor_curated/by_subject \
  --existing-data-root public/data
node scripts/grade7_9/generate_manifest.js \
  --by-subject-dir generated/grade7_9_labor_curated/by_subject \
  --out-dir generated/grade7_9_labor_curated
```

验证结果：

```json
{
  "valid": true,
  "total": 66,
  "errors": [],
  "warnings": [
    "Existing data already uses H3 with non-7-9 grade_range ..."
  ]
}
```

## 5. 限制与下一步

- 当前劳动 7-9 数据为首批结构化草案，仍需人工复核 OCR 误差和标准粒度。
- 当前七/八/九年级 records 是从第四学段共同要求拆成独立年级 records；后续如需要更细年级递进，可继续在 curated raw 中拆分。
- 不得直接覆盖正式 `public/data/by_subject/labor.json`，除非 H3 口径冲突已解决。
- 下一步可按同一方法推进信息科技、道德与法治、数学等学科。
