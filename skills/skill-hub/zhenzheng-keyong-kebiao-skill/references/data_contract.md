# 数据契约

## 数据版本

每次输出都声明数据版本。优先读取 `public/data/data_version.json`；如果不存在，使用 `manifest.json.generated_at` 并说明“未找到独立 data_version.json”。

建议版本结构：

```json
{
  "data_version": "curriculum_compass_2026_06_30_v1",
  "source_standard": "义务教育课程方案和课程标准（2022年版）",
  "subjects_covered": 9,
  "standard_count": 852,
  "grade_band_policy": "primary_split_1_2_3_4_5_6",
  "validated": true
}
```

## 标准记录字段

标准记录必须至少保留：

- `code`：唯一编码。
- `subject` / `subject_slug`：学科名和 slug。
- `grade_band` / `grade_range` / `grade`：学段和年级范围。
- `domain` / `subdomain`：领域和子领域。
- `standard`：课程标准正文。
- `context`、`practice`、`teaching_tip`、`assessment_evidence_type`：教学支持字段。
- `ts_primary`、`ts_secondary`、`ts_rationale`：可迁移技能标注。

## 学段口径

当前网站代码中常见口径是：

- H1：1-2 年级
- H2：3-4 年级
- H3：5-6 年级

README/术语文件可能出现“义务教育全阶段”口径：

- H1：1-2 年级
- H2：3-6 年级
- H3：7-9 年级

如果数据源未明确统一，输出时写成“按当前数据推断为 H2，需确认学段口径”，不要说成确定事实。

## 课程方案 JSON

解析上传文件后，生成：

```json
{
  "plan_id": "uploaded_plan_xxx",
  "source_file_name": "",
  "school": "",
  "stage": "小学",
  "grade": 3,
  "grade_band": "H2",
  "semester": "上学期",
  "school_year": "2026-2027",
  "teaching_weeks": 18,
  "periods_per_week": 2,
  "total_periods": 36,
  "subject": "科学",
  "subject_slug": "science",
  "units": [
    {
      "unit_id": "unit_1",
      "unit_order": 1,
      "unit_title": "植物的生长",
      "suggested_periods": 4,
      "learning_goals": [],
      "keywords": []
    }
  ],
  "constraints": {
    "exam_weeks": [],
    "review_weeks": [],
    "holidays": [],
    "fixed_events": []
  },
  "confidence": {},
  "warnings": []
}
```
