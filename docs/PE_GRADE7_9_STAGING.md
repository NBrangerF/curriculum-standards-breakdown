# 体育与健康 7-9 年级首批结构化 staging 说明

更新时间：2026-06-30

## 1. 当前状态

体育与健康学科已经完成水平四首批 curated raw items，并通过现有 7-9 staging pipeline 生成可校验的 by_subject 数据。

当前产物仍是 staging，不写入 `public/data/by_subject/`。

原因：

- 当前正式数据中 `H3` 已被 5-6 或 6-7 年级使用。
- 初中段 `H3=7-9` 口径尚未与正式数据合并策略统一。
- OCR 文本虽已可用，但仍需要人工复核。

## 2. 输入来源

官方来源：

```text
raw/grade7_9/sources/pe-W020220420582362336303.pdf
```

复核页包：

```text
generated/grade7_9/review_packs_pe_range/pe.junior_review.md
generated/grade7_9/review_packs_pe_range/pe.junior_review.json
```

该复核包按 12 个连续页范围生成，共覆盖 55 页。

curated raw：

```text
scripts/grade7_9/curated/pe_h3_raw.json
```

主要依据页码：

- 水平四课程目标：14-16 页
- 课程内容结构：17-18 页
- 水平四体能：24-26 页
- 水平四健康教育：32-33 页
- 水平四球类运动：42-45 页
- 水平四田径类运动：54-57 页
- 水平四体操类运动：66-69 页
- 水平四水上或冰雪类运动：77-80 页
- 水平四中华传统体育类运动：90-93 页
- 水平四新兴体育类运动：104-106 页
- 水平四跨学科主题学习：109-113 页
- 水平四学业质量：115-126 页

## 3. 拆解结果

首批 curated raw items：

- 41 条原子标准草案。
- 每条包含 `source_pages` 以便回查官方 PDF。
- 每条使用 `target_grades: [7, 8, 9]`。
- 官方文本使用“水平四”表示初中相关目标层级，因此按 7-9 年级共同要求展开。

normalize 后：

- 123 条 standards。
- 七年级 41 条。
- 八年级 41 条。
- 九年级 41 条。

领域分布：

| domain | records |
| --- | ---: |
| 专项运动技能 | 36 |
| 体育品德 | 6 |
| 体能 | 12 |
| 健康教育 | 18 |
| 学业质量 | 30 |
| 课程目标 | 3 |
| 跨学科主题学习 | 15 |
| 运动能力 | 3 |

可迁移技能主标签分布：

| ts_primary | records |
| --- | ---: |
| TS1 | 33 |
| TS2 | 24 |
| TS3 | 15 |
| TS4 | 9 |
| TS6 | 6 |
| TS7 | 36 |

## 4. 验证命令

```bash
npm run grade7_9:review-packs -- \
  --subjects pe \
  --ranges-file scripts/grade7_9/review_ranges.json \
  --out-dir generated/grade7_9/review_packs_pe_range

rm -rf generated/grade7_9_pe_curated
mkdir -p generated/grade7_9_pe_curated/{normalized,mapped,by_subject}
node scripts/grade7_9/normalize_schema.js \
  --input scripts/grade7_9/curated/pe_h3_raw.json \
  --out generated/grade7_9_pe_curated/normalized/pe.json
node scripts/grade7_9/map_ts.js \
  --input generated/grade7_9_pe_curated/normalized/pe.json \
  --out generated/grade7_9_pe_curated/mapped/pe.json
node scripts/grade7_9/build_by_subject.js \
  --input-dir generated/grade7_9_pe_curated/mapped \
  --out-dir generated/grade7_9_pe_curated/by_subject
node scripts/grade7_9/validate_schema.js \
  --by-subject-dir generated/grade7_9_pe_curated/by_subject \
  --existing-data-root public/data
node scripts/grade7_9/generate_manifest.js \
  --by-subject-dir generated/grade7_9_pe_curated/by_subject \
  --out-dir generated/grade7_9_pe_curated
```

验证结果：

```json
{
  "valid": true,
  "total": 123,
  "errors": [],
  "warnings": [
    "Existing data already uses H3 with non-7-9 grade_range ..."
  ]
}
```

## 5. 限制与下一步

- 当前体育与健康 7-9 数据为首批结构化草案，仍需人工复核 OCR 误差和标准粒度。
- 当前七/八/九年级 records 是从水平四共同要求拆成独立年级 records；后续如需要更细年级递进，可继续在 curated raw 中拆分。
- 体育与健康课标中大量内容是运动项目类别要求，正式入库前应人工确认项目类别、体能、健康教育和学业质量之间的颗粒度是否一致。
- 当前 TS 映射由 keyword-based + rule-based 脚本生成，正式入库前应继续人工复核标签合理性。
- 不得直接覆盖正式 `public/data/by_subject/pe.json`，除非 H3 口径冲突已解决。
- 下一步可按同一方法推进科学、艺术等学科。
