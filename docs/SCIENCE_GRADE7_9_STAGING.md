# 科学 7-9 年级首批结构化 staging 说明

更新时间：2026-06-30

## 1. 当前状态

科学学科已经完成 7-9 年级首批 curated raw items，并通过现有 7-9 staging pipeline 生成可校验的 by_subject 数据。

当前产物仍是 staging，不写入 `public/data/by_subject/`。

原因：

- 当前正式数据中 `H3` 已被 5-6 或 6-7 年级使用。
- 初中段 `H3=7-9` 口径尚未与正式数据合并策略统一。
- OCR 文本虽已可用，但仍需要人工复核。

## 2. 输入来源

官方来源：

```text
raw/grade7_9/sources/science-W020220420582355009892.pdf
```

复核页包：

```text
generated/grade7_9/review_packs_science_range/science.junior_review.md
generated/grade7_9/review_packs_science_range/science.junior_review.json
```

该复核包按 17 个连续页范围生成，共覆盖 114 页。

curated raw：

```text
scripts/grade7_9/curated/science_h3_raw.json
```

主要依据页码：

- 7-9 课程目标：16-22 页
- 课程内容结构：23-26 页
- 物质的结构与性质：28-35 页
- 物质的变化与化学反应：36-41 页
- 物质的运动与相互作用：43-50 页
- 能的转化与能量守恒：51-55 页
- 生命系统的构成层次：57-63 页
- 生物体的稳态与调节：65-68 页
- 生物与环境的相互关系：69-73 页
- 生命的延续与进化：74-79 页
- 宇宙中的地球：80-85 页
- 地球系统：86-91 页
- 人类活动与环境：91-96 页
- 技术、工程与社会：97-108 页
- 工程设计与物化：109-118 页
- 7-9 学业质量：123-124 页
- 7-9 核心素养学段特征：144-147 页

## 3. 拆解结果

首批 curated raw items：

- 67 条原子标准草案。
- 每条包含 `source_pages` 以便回查官方 PDF。
- 每条使用 `target_grades: [7, 8, 9]`。
- 官方文本以 13 个学科核心概念组织课程内容，本批按“核心概念 / 学习内容”粒度拆解。

normalize 后：

- 201 条 standards。
- 七年级 67 条。
- 八年级 67 条。
- 九年级 67 条。

领域分布：

| domain | records |
| --- | ---: |
| 物质的结构与性质 | 21 |
| 物质的变化与化学反应 | 12 |
| 物质的运动与相互作用 | 9 |
| 能的转化与能量守恒 | 6 |
| 生命系统的构成层次 | 18 |
| 生物体的稳态与调节 | 9 |
| 生物与环境的相互关系 | 12 |
| 生命的延续与进化 | 18 |
| 宇宙中的地球 | 18 |
| 地球系统 | 12 |
| 人类活动与环境 | 9 |
| 技术、工程与社会 | 9 |
| 工程设计与物化 | 9 |
| 学业质量 | 15 |
| 核心素养 | 12 |
| 科学观念 | 3 |
| 科学思维 | 3 |
| 探究实践 | 3 |
| 态度责任 | 3 |

可迁移技能主标签分布：

| ts_primary | records |
| --- | ---: |
| TS1 | 81 |
| TS2 | 21 |
| TS4 | 3 |
| TS5 | 3 |
| TS6 | 48 |
| TS7 | 45 |

## 4. 验证命令

```bash
npm run grade7_9:review-packs -- \
  --subjects science \
  --ranges-file scripts/grade7_9/review_ranges.json \
  --out-dir generated/grade7_9/review_packs_science_range

rm -rf generated/grade7_9_science_curated
mkdir -p generated/grade7_9_science_curated/{normalized,mapped,by_subject}
node scripts/grade7_9/normalize_schema.js \
  --input scripts/grade7_9/curated/science_h3_raw.json \
  --out generated/grade7_9_science_curated/normalized/science.json
node scripts/grade7_9/map_ts.js \
  --input generated/grade7_9_science_curated/normalized/science.json \
  --out generated/grade7_9_science_curated/mapped/science.json
node scripts/grade7_9/build_by_subject.js \
  --input-dir generated/grade7_9_science_curated/mapped \
  --out-dir generated/grade7_9_science_curated/by_subject
node scripts/grade7_9/validate_schema.js \
  --by-subject-dir generated/grade7_9_science_curated/by_subject \
  --existing-data-root public/data
node scripts/grade7_9/generate_manifest.js \
  --by-subject-dir generated/grade7_9_science_curated/by_subject \
  --out-dir generated/grade7_9_science_curated
```

验证结果：

```json
{
  "valid": true,
  "total": 201,
  "errors": [],
  "warnings": [
    "Existing data already uses H3 with non-7-9 grade_range ..."
  ]
}
```

## 5. 限制与下一步

- 当前科学 7-9 数据为首批结构化草案，仍需人工复核 OCR 误差和标准粒度。
- 当前七/八/九年级 records 是从 7-9 共同要求拆成独立年级 records；后续如需要更细年级递进，可继续在 curated raw 中拆分。
- 科学课标内容覆盖物质科学、生命科学、地球与宇宙、技术与工程等多个领域，正式入库前应人工确认各核心概念之间的颗粒度是否一致。
- 当前 TS 映射由 keyword-based + rule-based 脚本生成，正式入库前应继续人工复核标签合理性。
- 不得直接覆盖正式 `public/data/by_subject/science.json`，除非 H3 口径冲突已解决。
- 下一步可按同一方法推进艺术学科。
