# 英语 7-9 年级首批结构化 staging 说明

更新时间：2026-06-30

## 1. 当前状态

英语学科已经完成三级（7-9 年级）首批 curated raw items，并通过现有 7-9 staging pipeline 生成可校验的 by_subject 数据。

当前产物仍是 staging，不写入 `public/data/by_subject/`。

原因：

- 当前正式数据中 `H3` 已被 5-6 或 6-7 年级使用。
- 初中段 `H3=7-9` 口径尚未与正式数据合并策略统一。
- OCR 文本虽已可用，但仍需要人工复核。

## 2. 输入来源

官方来源：

```text
raw/grade7_9/sources/english-W020220420582349487953.pdf
```

复核页包：

```text
generated/grade7_9/review_packs_english_range/english.junior_review.md
generated/grade7_9/review_packs_english_range/english.junior_review.json
```

curated raw：

```text
scripts/grade7_9/curated/english_h3_raw.json
```

主要依据页码：

- 三级课程目标：13-18 页
- 三级课程内容结构：20 页
- 三级主题内容：23-24 页
- 三级语篇内容：25 页
- 三级语言知识与文化知识：26-31 页
- 三级分年级语言技能：34-38 页
- 三级学习策略：40-41 页
- 三级教学提示：45-48 页
- 三级学业质量：52-53 页
- 7-9 核心素养分项特征：88-91 页
- 7-9 语音、词汇、语法附录依据：92、105、145 页

## 3. 拆解结果

首批 curated raw items：

- 54 条原子标准草案。
- 每条包含 `source_pages` 以便回查官方 PDF。
- 39 条三级共同要求使用 `target_grades: [7, 8, 9]`。
- 表17、表18、表19 已明确语言技能分属 7 年级、8 年级、9 年级，因此 15 条语言技能条目只写入对应年级。

normalize 后：

- 132 条 standards。
- 七年级 44 条。
- 八年级 44 条。
- 九年级 44 条。

领域分布：

| domain | records |
| --- | ---: |
| 文化意识 | 9 |
| 文化知识 | 6 |
| 语篇 | 6 |
| 语言知识 | 27 |
| 语言能力 | 9 |
| 学习能力 | 9 |
| 学业质量 | 21 |
| 语言技能 | 15 |
| 学习策略 | 12 |
| 主题 | 9 |
| 思维品质 | 9 |

可迁移技能主标签分布：

| ts_primary | records |
| --- | ---: |
| TS1 | 24 |
| TS2 | 6 |
| TS3 | 20 |
| TS4 | 6 |
| TS5 | 42 |
| TS6 | 25 |
| TS7 | 9 |

## 4. 验证命令

```bash
npm run grade7_9:review-packs -- \
  --subjects english \
  --ranges-file scripts/grade7_9/review_ranges.json \
  --out-dir generated/grade7_9/review_packs_english_range

rm -rf generated/grade7_9_english_curated
mkdir -p generated/grade7_9_english_curated/{normalized,mapped,by_subject}
node scripts/grade7_9/normalize_schema.js \
  --input scripts/grade7_9/curated/english_h3_raw.json \
  --out generated/grade7_9_english_curated/normalized/english.json
node scripts/grade7_9/map_ts.js \
  --input generated/grade7_9_english_curated/normalized/english.json \
  --out generated/grade7_9_english_curated/mapped/english.json
node scripts/grade7_9/build_by_subject.js \
  --input-dir generated/grade7_9_english_curated/mapped \
  --out-dir generated/grade7_9_english_curated/by_subject
node scripts/grade7_9/validate_schema.js \
  --by-subject-dir generated/grade7_9_english_curated/by_subject \
  --existing-data-root public/data
node scripts/grade7_9/generate_manifest.js \
  --by-subject-dir generated/grade7_9_english_curated/by_subject \
  --out-dir generated/grade7_9_english_curated
```

验证结果：

```json
{
  "valid": true,
  "total": 132,
  "errors": [],
  "warnings": [
    "Existing data already uses H3 with non-7-9 grade_range ..."
  ]
}
```

## 5. 限制与下一步

- 当前英语 7-9 数据为首批结构化草案，仍需人工复核 OCR 误差和标准粒度。
- 英语课标用“三级”表示 7-9 年级目标和内容要求；表17、表18、表19 的语言技能已经按官方年级拆分。
- 当前 TS 映射由 keyword-based + rule-based 脚本生成，正式入库前应继续人工复核标签合理性。
- 不得直接覆盖正式 `public/data/by_subject/english.json`，除非 H3 口径冲突已解决。
- 下一步可按同一方法推进科学、体育与健康、艺术等学科。
