# 信息科技 7-9 年级首批结构化 staging 说明

更新时间：2026-06-30

## 1. 当前状态

信息科技学科已经完成第四学段首批 curated raw items，并通过现有 7-9 staging pipeline 生成可校验的 by_subject 数据。

当前产物仍是 staging，不写入 `public/data/by_subject/`。

原因：

- 当前正式数据中 `H3` 已被 5-6 或 6-7 年级使用。
- 初中段 `H3=7-9` 口径尚未与正式数据合并策略统一。
- OCR 文本虽已可用，但仍需要人工复核。

## 2. 输入来源

官方来源：

```text
raw/grade7_9/sources/it-W020220420582361024968.pdf
```

复核页包：

```text
generated/grade7_9/review_packs_it_range/it.junior_review.md
generated/grade7_9/review_packs_it_range/it.junior_review.json
```

curated raw：

```text
scripts/grade7_9/curated/it_h3_raw.json
```

主要依据页码：

- 第四学段课程目标：15-18 页
- 第四学段课程内容：41-53 页
- 学段特征与信息社会责任：67-69 页
- 跨学科主题案例：70-73 页

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
| 互联网应用与创新 | 9 |
| 互联智能设计 | 3 |
| 计算思维 | 6 |
| 人工智能与智慧社会 | 12 |
| 数字化学习与创新 | 6 |
| 物联网实践与探索 | 9 |
| 信息科技目标 | 6 |
| 信息社会责任 | 9 |
| 学业质量 | 6 |

可迁移技能主标签分布：

| ts_primary | records |
| --- | ---: |
| TS1 | 6 |
| TS2 | 6 |
| TS5 | 3 |
| TS6 | 42 |
| TS7 | 9 |

## 4. 验证命令

```bash
rm -rf generated/grade7_9_it_curated
mkdir -p generated/grade7_9_it_curated/{normalized,mapped,by_subject}
node scripts/grade7_9/normalize_schema.js \
  --input scripts/grade7_9/curated/it_h3_raw.json \
  --out generated/grade7_9_it_curated/normalized/it.json
node scripts/grade7_9/map_ts.js \
  --input generated/grade7_9_it_curated/normalized/it.json \
  --out generated/grade7_9_it_curated/mapped/it.json
node scripts/grade7_9/build_by_subject.js \
  --input-dir generated/grade7_9_it_curated/mapped \
  --out-dir generated/grade7_9_it_curated/by_subject
node scripts/grade7_9/validate_schema.js \
  --by-subject-dir generated/grade7_9_it_curated/by_subject \
  --existing-data-root public/data
node scripts/grade7_9/generate_manifest.js \
  --by-subject-dir generated/grade7_9_it_curated/by_subject \
  --out-dir generated/grade7_9_it_curated
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

- 当前信息科技 7-9 数据为首批结构化草案，仍需人工复核 OCR 误差和标准粒度。
- 当前七/八/九年级 records 是从第四学段共同要求拆成独立年级 records；后续如需要更细年级递进，可继续在 curated raw 中拆分。
- 不得直接覆盖正式 `public/data/by_subject/it.json`，除非 H3 口径冲突已解决。
- 下一步可按同一方法推进道德与法治、数学、语文、英语、科学、体育与健康、艺术等学科。
