# 数据模型

## 课程标准 Standard

```json
{
  "code": "SC-D1-AR-001",
  "subject": "科学",
  "subject_slug": "science",
  "grade_band": "H1",
  "grade_range": "1-2",
  "domain": "态度责任",
  "subdomain": "人类活动与环境",
  "standard": "愿意倾听他人想法，并乐于分享和表达自己的观点。",
  "context": "",
  "practice": "",
  "teaching_tip": "",
  "assessment_evidence_type": "",
  "ts_primary": ["TS4"],
  "ts_secondary": [],
  "ts_rationale": ""
}
```

## 课程方案 ParsedPlan

```json
{
  "plan_id": "uploaded_plan_2026_06_30_xxx",
  "source_file_name": "三年级科学上册教学计划.docx",
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
      "learning_goals": ["观察植物生长过程"],
      "keywords": ["植物", "观察", "记录"]
    }
  ],
  "constraints": {
    "exam_weeks": [18],
    "review_weeks": [17],
    "holidays": [],
    "fixed_events": []
  },
  "confidence": {
    "grade": 0.95,
    "periods_per_week": 0.72
  },
  "warnings": []
}
```

## 标准匹配 Match

```json
{
  "plan_item_id": "unit_1",
  "standard_code": "SC-D2-LS-003",
  "relation": "primary",
  "confidence": 0.86,
  "match_type": "deterministic+keyword",
  "matched_fields": ["standard", "practice"],
  "rationale": "单元目标中的观察、记录与该标准高度一致。"
}
```

## 数据版本 DataVersion

```json
{
  "data_version": "curriculum_compass_2026_06_30_v1",
  "source_standard": "义务教育课程方案和课程标准（2022年版）",
  "subjects_covered": 9,
  "standard_count": 852,
  "grade_band_policy": "primary_split_1_2_3_4_5_6",
  "generated_at": "2026-06-30",
  "validated": true
}
```
