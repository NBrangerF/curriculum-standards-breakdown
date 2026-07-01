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

### H4G 初中年级拆分字段

当 `grade_band` 为 `H4G7`、`H4G8`、`H4G9` 时，记录还应携带以下拆分证据字段：

```json
{
  "stage_band": "H4",
  "grade_level": 7,
  "legacy_code": "MA-H4-ALG-001",
  "source_grade_band": "H4",
  "source_grade_range": "7-9",
  "grade_assignment_type": "shared_requirement_textbook_file_supported",
  "grade_assignment_confidence": 0.6,
  "grade_assignment_rationale": "年级归属依据说明，非课标原文。",
  "textbook_evidence_ids": [],
  "textbook_unit_evidence_ids": [],
  "standard_text_role": "source_standard_original",
  "source_standard_scope": "stage_shared_7_9",
  "standard_variant_type": "same_source_shared",
  "evidence_granularity": "textbook_file_grade_level",
  "progression_group_id": "math-...",
  "progression_role": "introductory",
  "progression_basis": "shared_standard_textbook_file_sequence",
  "progression_confidence": 0.42,
  "progression_distinctiveness": "identical_core_fields",
  "progression_distinctiveness_fields": [],
  "requires_unit_level_evidence": true,
  "grade_specific_focus": "待基于七年级教材单元/章节补充本年级专属学习重点。",
  "progression_delta": "not_yet_differentiated_from_shared_7_9_source",
  "progression_review_note": "该记录保留第四学段 7-9 共同课标原文；当前不能视为已经完成七八九分化。",
  "review_status": "needs_grade_differentiation"
}
```

注意：`standard` 仍是源课标核心文本。不能为了让 `H4G7/H4G8/H4G9` 看起来不同而改写或编造官方标准。若三年级核心文本相同，必须标为 `same_source_shared` 和 `needs_grade_differentiation`，直到有教材单元/章节级证据支撑真实年级化解释。

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
