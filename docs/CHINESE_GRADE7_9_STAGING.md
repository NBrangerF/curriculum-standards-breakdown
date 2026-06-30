# 语文 7-9 年级首批结构化 staging 说明

更新时间：2026-06-30

## 1. 当前状态

语文学科已经完成第四学段首批 curated raw items，并通过现有 7-9 staging pipeline 生成可校验的 by_subject 数据。

当前产物仍是 staging，不写入 `public/data/by_subject/`。

原因：

- 当前正式数据中 `H3` 已被 5-6 或 6-7 年级使用。
- 初中段 `H3=7-9` 口径尚未与正式数据合并策略统一。
- OCR 文本虽已可用，但仍需要人工复核。

## 2. 输入来源

官方来源：

```text
raw/grade7_9/sources/chinese-W020220420582344386456.pdf
```

复核页包：

```text
generated/grade7_9/review_packs_chinese_range/chinese.junior_review.md
generated/grade7_9/review_packs_chinese_range/chinese.junior_review.json
```

curated raw：

```text
scripts/grade7_9/curated/chinese_h3_raw.json
```

主要依据页码：

- 第四学段学段要求：21-24 页
- 语言文字积累与梳理：28-30 页
- 实用性阅读与交流：32-33 页
- 文学阅读与创意表达：34-35 页
- 思辨性阅读与表达：37-38 页
- 整本书阅读：40-41 页
- 跨学科学习：42-43 页
- 第四学段学业质量：49-50 页
- 教学与评价建议：51-58 页
- 7-9 年级优秀诗文背诵推荐篇目：65-72 页

## 3. 拆解结果

首批 curated raw items：

- 52 条原子标准草案。
- 每条包含 `source_pages` 以便回查官方 PDF。
- 每条使用 `target_grades: [7, 8, 9]`。

normalize 后：

- 156 条 standards。
- 七年级 52 条。
- 八年级 52 条。
- 九年级 52 条。

领域分布：

| domain | records |
| --- | ---: |
| 表达与交流 | 21 |
| 跨学科学习 | 15 |
| 识字与写字 | 6 |
| 实用性阅读与交流 | 9 |
| 梳理与探究 | 15 |
| 思辨性阅读与表达 | 12 |
| 文学阅读与创意表达 | 12 |
| 学业质量 | 21 |
| 语言文字积累与梳理 | 9 |
| 阅读与鉴赏 | 24 |
| 整本书阅读 | 12 |

可迁移技能主标签分布：

| ts_primary | records |
| --- | ---: |
| TS1 | 27 |
| TS2 | 6 |
| TS3 | 9 |
| TS4 | 6 |
| TS5 | 99 |
| TS6 | 6 |
| TS7 | 3 |

## 4. 验证命令

```bash
rm -rf generated/grade7_9_chinese_curated
mkdir -p generated/grade7_9_chinese_curated/{normalized,mapped,by_subject}
node scripts/grade7_9/normalize_schema.js \
  --input scripts/grade7_9/curated/chinese_h3_raw.json \
  --out generated/grade7_9_chinese_curated/normalized/chinese.json
node scripts/grade7_9/map_ts.js \
  --input generated/grade7_9_chinese_curated/normalized/chinese.json \
  --out generated/grade7_9_chinese_curated/mapped/chinese.json
node scripts/grade7_9/build_by_subject.js \
  --input-dir generated/grade7_9_chinese_curated/mapped \
  --out-dir generated/grade7_9_chinese_curated/by_subject
node scripts/grade7_9/validate_schema.js \
  --by-subject-dir generated/grade7_9_chinese_curated/by_subject \
  --existing-data-root public/data
node scripts/grade7_9/generate_manifest.js \
  --by-subject-dir generated/grade7_9_chinese_curated/by_subject \
  --out-dir generated/grade7_9_chinese_curated
```

验证结果：

```json
{
  "valid": true,
  "total": 156,
  "errors": [],
  "warnings": [
    "Existing data already uses H3 with non-7-9 grade_range ..."
  ]
}
```

## 5. 限制与下一步

- 当前语文 7-9 数据为首批结构化草案，仍需人工复核 OCR 误差和标准粒度。
- 当前七/八/九年级 records 是从第四学段共同要求拆成独立年级 records；后续如需要更细年级递进，可继续在 curated raw 中拆分。
- 附录优秀诗文背诵推荐篇目已作为古诗文诵读与积累条目的 source_pages 保留；如后续需要逐篇检索，可另行建立篇目索引。
- 不得直接覆盖正式 `public/data/by_subject/chinese.json`，除非 H3 口径冲突已解决。
- 下一步可按同一方法推进数学、英语、科学、体育与健康、艺术等学科。
