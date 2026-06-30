# 初中段 7-9 课标结构覆盖审计

更新时间：2026-06-30

本文记录 7-9 staging raw items 对《义务教育课程标准（2022年版）》结构的覆盖情况，重点检查：

- 课程目标
- 课程内容
- 学业质量
- 教学建议
- 评价建议

## 1. 审计命令

```bash
npm run grade7_9:audit-structure -- --out generated/grade7_9_structure_coverage.json
```

该命令只读取：

- `scripts/grade7_9/curated/*_h3_raw.json`
- `scripts/grade7_9/review_ranges.json`

不会写入正式 `public/data`。

## 2. 当前结论

当前结果：

```json
{
  "valid": true,
  "errors": []
}
```

含义：

- 9 个学科 curated raw 均保留 `source_pages` 和 `target_grades`。
- 每条 raw item 都有 `practice`、`teaching_tip`、`assessment_evidence_type`。
- 每科至少有课程目标、课程内容、学业质量的来源证据；证据来自 raw item 的 `source_section` 或 review ranges。
- 教学建议和评价建议不总是被拆成独立 raw item；教学建议主要落入每条记录的 `teaching_tip`，评价建议主要落入 `assessment_evidence_type` 和学业质量/评价相关 source sections。

## 3. 学科覆盖摘要

| 学科 | raw_items | 课程目标证据 | 课程内容证据 | 学业质量证据 | 教学建议承载 | 评价建议承载 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 艺术 | 62 | 直接 source_section | 直接 source_section | 直接 source_section | `teaching_tip` 字段 | 学业质量 source_section + `assessment_evidence_type` |
| 语文 | 52 | 直接 source_section | 直接 source_section | 直接 source_section | review range + `teaching_tip` | 学业质量/review range + `assessment_evidence_type` |
| 英语 | 54 | 直接 source_section | 直接 source_section | 直接 source_section | review range + `teaching_tip` | 学业质量 + `assessment_evidence_type` |
| 信息科技 | 22 | 直接 source_section | 直接 source_section | 直接 source_section | `teaching_tip` 字段 | 学业质量 + `assessment_evidence_type` |
| 劳动 | 22 | 直接 source_section | 直接 source_section | 劳动素养要求 | `teaching_tip` 字段 | 课程评价建议 + `assessment_evidence_type` |
| 数学 | 38 | 直接 source_section | 直接 source_section | 直接 source_section | review range + `teaching_tip` | 学业质量/review range + `assessment_evidence_type` |
| 道德与法治 | 42 | review range | 直接 source_section | 直接 source_section | review range + `teaching_tip` | 学业质量/review range + `assessment_evidence_type` |
| 体育与健康 | 41 | 直接 source_section | 直接 source_section | 直接 source_section | `teaching_tip` 字段 | 学业质量 + `assessment_evidence_type` |
| 科学 | 67 | 直接 source_section | 直接 source_section | 直接 source_section | `teaching_tip` 字段 | 学业质量 + `assessment_evidence_type` |

## 4. 审计提醒

`audit-structure` 会保留 warnings，用于说明来源结构的承载方式。例如：

- 有些学科的教学建议存在于 review ranges，但没有拆成独立 raw item。
- 有些学科没有独立“教学建议”source_section，但每条 raw item 都有 `teaching_tip`。
- 道德与法治的课程目标作为 review range 证据保留，首批 raw items 以课程内容和学业质量为主体。

这些 warning 不代表 schema 失败；它们提醒后续人工复核时需要确认教学建议、评价建议和课程目标没有被弱化或误读。

## 5. 推荐 gate

后续修改 curated raw 后，应运行：

```bash
npm run grade7_9:audit-structure
npm run grade7_9:build-curated
npm run grade7_9:audit-grade-split
npm run grade7_9:validate -- --staging-root generated/grade7_9_all_curated --existing-data-root public/data
npm run grade7_9:check-ui -- --staging-root generated/grade7_9_all_curated
```

如果 `audit-structure` 出现 errors，应先修复 raw item 或 review range，再继续构建 staging。
