# 艺术 7-9 年级首批结构化 staging 说明

更新时间：2026-06-30

## 1. 当前状态

艺术学科已经完成 7-9 年级首批 curated raw items，并通过现有 7-9 staging pipeline 生成可校验的 by_subject 数据。

当前产物仍是 staging，不写入 `public/data/by_subject/`。

原因：

- 当前正式数据中 `H3` 已被 6-7 或 5-6 年级使用。
- 初中段 `H3=7-9` 口径尚未与正式数据合并策略统一。
- 艺术课标本身采用特殊分段：3-7 年级以音乐、美术为主，8-9 年级开设艺术选项。
- OCR 文本虽已可用，但仍需要人工复核。

## 2. 输入来源

官方来源：

```text
raw/grade7_9/sources/arts-W020220420582364678888.pdf
```

复核页包：

```text
generated/grade7_9/review_packs_arts_range/arts.junior_review.md
generated/grade7_9/review_packs_arts_range/arts.junior_review.json
```

该复核包按 7 个连续页范围生成，共覆盖 109 页。

curated raw：

```text
scripts/grade7_9/curated/arts_h3_raw.json
```

主要依据页码：

- 课程目标与分段设计：10-21 页
- 音乐第三与第四学段：22-54 页
- 美术第三与第四学段：55-80 页
- 舞蹈 7 年级与第四学段：81-88 页
- 戏剧 7 年级与第四学段：89-97 页
- 影视 7 年级与第四学段：98-106 页
- 艺术学业质量：107-117 页

## 3. 拆解口径

艺术课标不是单一 7-9 学段结构：

- 3-7 年级开设音乐、美术，融入舞蹈、戏剧（含戏曲）、影视（含数字媒体艺术）。
- 8-9 年级开设艺术选项，包括音乐、美术、舞蹈、戏剧（含戏曲）、影视（含数字媒体艺术），每位学生至少选择 2 项学习。
- 有条件的地区和学校，可在 7 年级开设舞蹈、戏剧（含戏曲）、影视（含数字媒体艺术）。
- 官方明确 6、7 年级学业要求分年级表述，因此七年级音乐、美术直接取 7 年级要求。

本批 staging 按以下规则整理：

- 七年级音乐、美术：来自第三学段（6-7 年级）中 7 年级学业要求。
- 七年级舞蹈、戏剧、影视：仅按官方“有条件的地区和学校可开设”的 7 年级选项任务整理。
- 八年级、九年级：来自第四学段（8-9 年级）共同要求，并由 `target_grades: [8, 9]` 展开为独立 records。

## 4. 拆解结果

首批 curated raw items：

- 62 条原子标准草案。
- 每条包含 `source_pages` 以便回查官方 PDF。
- 七年级 target items 27 条。
- 八年级 target items 35 条。
- 九年级 target items 35 条。

normalize 后：

- 97 条 standards。
- 七年级 27 条。
- 八年级 35 条。
- 九年级 35 条。

七、八、九年级数量不同是预期结果，因为艺术课标对七年级和八/九年级采用不同课程组织方式。

领域分布：

| domain | records |
| --- | ---: |
| 音乐 | 30 |
| 美术 | 15 |
| 课程目标 | 12 |
| 学业质量 | 12 |
| 戏剧（含戏曲） | 10 |
| 影视（含数字媒体艺术） | 10 |
| 舞蹈 | 8 |

可迁移技能主标签分布：

| ts_primary | records |
| --- | ---: |
| TS1 | 23 |
| TS2 | 35 |
| TS4 | 12 |
| TS5 | 14 |
| TS6 | 11 |
| TS7 | 2 |

## 5. 验证命令

```bash
npm run grade7_9:review-packs -- \
  --subjects arts \
  --ranges-file scripts/grade7_9/review_ranges.json \
  --out-dir generated/grade7_9/review_packs_arts_range

rm -rf generated/grade7_9_arts_curated
mkdir -p generated/grade7_9_arts_curated/{normalized,mapped,by_subject}
node scripts/grade7_9/normalize_schema.js \
  --input scripts/grade7_9/curated/arts_h3_raw.json \
  --out generated/grade7_9_arts_curated/normalized/arts.json
node scripts/grade7_9/map_ts.js \
  --input generated/grade7_9_arts_curated/normalized/arts.json \
  --out generated/grade7_9_arts_curated/mapped/arts.json
node scripts/grade7_9/build_by_subject.js \
  --input-dir generated/grade7_9_arts_curated/mapped \
  --out-dir generated/grade7_9_arts_curated/by_subject
node scripts/grade7_9/validate_schema.js \
  --by-subject-dir generated/grade7_9_arts_curated/by_subject \
  --existing-data-root public/data
node scripts/grade7_9/generate_manifest.js \
  --by-subject-dir generated/grade7_9_arts_curated/by_subject \
  --out-dir generated/grade7_9_arts_curated
```

验证结果：

```json
{
  "valid": true,
  "total": 97,
  "errors": [],
  "warnings": [
    "Existing data already uses H3 with non-7-9 grade_range ..."
  ]
}
```

## 6. 限制与下一步

- 当前艺术 7-9 数据为首批结构化草案，仍需人工复核 OCR 误差和标准粒度。
- 七年级舞蹈、戏剧、影视条目来自官方“有条件开设”选项任务，正式入库前应决定是否在 UI 中标注选修/条件开设属性；当前 schema 不新增字段，只在 `context` 与 `standard` 中说明。
- 八年级、九年级 records 是从第四学段共同要求拆成独立年级 records；后续如需要更细年级递进，可继续在 curated raw 中拆分。
- 当前 TS 映射由 keyword-based + rule-based 脚本生成，正式入库前应继续人工复核标签合理性。
- 不得直接覆盖正式 `public/data/by_subject/arts.json`，除非 H3 口径冲突已解决。
