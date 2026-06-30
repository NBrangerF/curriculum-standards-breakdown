# 道德与法治 7-9 年级首批结构化 staging 说明

更新时间：2026-06-30

## 1. 当前状态

道德与法治学科已经完成第四学段首批 curated raw items，并通过现有 7-9 staging pipeline 生成可校验的 by_subject 数据。

当前产物仍是 staging，不写入 `public/data/by_subject/`。

原因：

- 当前正式数据中 `H3` 已被 5-6 或 6-7 年级使用。
- 初中段 `H3=7-9` 口径尚未与正式数据合并策略统一。
- OCR 文本虽已可用，但仍需要人工复核。

## 2. 输入来源

官方来源：

```text
raw/grade7_9/sources/morality_law-W020220420582343475848.pdf
```

复核页包：

```text
generated/grade7_9/review_packs_morality_law_range/morality_law.junior_review.md
generated/grade7_9/review_packs_morality_law_range/morality_law.junior_review.json
```

curated raw：

```text
scripts/grade7_9/curated/morality_law_h3_raw.json
```

主要依据页码：

- 第四学段课程目标：17-23 页
- 第四学段课程内容：41-49 页
- 第四学段学业质量：53 页
- 教学与评价建议：54-64 页
- 核心素养学段表现：71-73 页

## 3. 拆解结果

首批 curated raw items：

- 42 条原子标准草案。
- 每条包含 `source_pages` 以便回查官方 PDF。
- 每条使用 `target_grades: [7, 8, 9]`。

normalize 后：

- 126 条 standards。
- 七年级 42 条。
- 八年级 42 条。
- 九年级 42 条。

领域分布：

| domain | records |
| --- | ---: |
| 道德教育 | 3 |
| 法治教育 | 48 |
| 革命传统教育 | 15 |
| 国情教育 | 12 |
| 生命安全与健康教育 | 12 |
| 学业质量 | 21 |
| 中华优秀传统文化教育 | 15 |

可迁移技能主标签分布：

| ts_primary | records |
| --- | ---: |
| TS1 | 33 |
| TS2 | 9 |
| TS3 | 6 |
| TS4 | 6 |
| TS5 | 15 |
| TS6 | 3 |
| TS7 | 54 |

## 4. 验证命令

```bash
rm -rf generated/grade7_9_morality_law_curated
mkdir -p generated/grade7_9_morality_law_curated/{normalized,mapped,by_subject}
node scripts/grade7_9/normalize_schema.js \
  --input scripts/grade7_9/curated/morality_law_h3_raw.json \
  --out generated/grade7_9_morality_law_curated/normalized/morality_law.json
node scripts/grade7_9/map_ts.js \
  --input generated/grade7_9_morality_law_curated/normalized/morality_law.json \
  --out generated/grade7_9_morality_law_curated/mapped/morality_law.json
node scripts/grade7_9/build_by_subject.js \
  --input-dir generated/grade7_9_morality_law_curated/mapped \
  --out-dir generated/grade7_9_morality_law_curated/by_subject
node scripts/grade7_9/validate_schema.js \
  --by-subject-dir generated/grade7_9_morality_law_curated/by_subject \
  --existing-data-root public/data
node scripts/grade7_9/generate_manifest.js \
  --by-subject-dir generated/grade7_9_morality_law_curated/by_subject \
  --out-dir generated/grade7_9_morality_law_curated
```

验证结果：

```json
{
  "valid": true,
  "total": 126,
  "errors": [],
  "warnings": [
    "Existing data already uses H3 with non-7-9 grade_range ..."
  ]
}
```

## 5. 限制与下一步

- 当前道德与法治 7-9 数据为首批结构化草案，仍需人工复核 OCR 误差和标准粒度。
- 当前七/八/九年级 records 是从第四学段共同要求拆成独立年级 records；后续如需要更细年级递进，可继续在 curated raw 中拆分。
- 课程目标和学业质量已经作为 source_pages 和评价证据来源保留，但当前首批主要按第四学段课程内容和学业质量拆解。
- 不得直接覆盖正式 `public/data/by_subject/morality_law.json`，除非 H3 口径冲突已解决。
- 下一步可按同一方法推进数学、语文、英语、科学、体育与健康、艺术等学科。
