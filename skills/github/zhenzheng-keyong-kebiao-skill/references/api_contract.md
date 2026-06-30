# API 契约建议

## 元数据

```http
GET /api/v1/meta
GET /api/v1/data-version
```

## 课程标准

```http
POST /api/v1/standards/search
GET  /api/v1/standards/{code}
POST /api/v1/standards/batch
```

搜索请求：

```json
{
  "subjects": ["science"],
  "grade_bands": ["H2"],
  "domains": ["生命科学"],
  "skills": ["TS1", "TS5"],
  "keyword": "植物",
  "limit": 20
}
```

搜索响应：

```json
{
  "data_version": "curriculum_compass_2026_06_30_v1",
  "total": 8,
  "results": [
    {
      "code": "SC-D2-LS-003",
      "subject": "科学",
      "grade_band": "H2",
      "domain": "生命科学",
      "standard": "...",
      "ts_primary": ["TS1"]
    }
  ]
}
```

## 课程方案

```http
POST /api/v1/plans/parse
POST /api/v1/plans/validate
```

## 匹配、覆盖与课表

```http
POST /api/v1/matching/plan-to-standards
POST /api/v1/coverage/analyze
POST /api/v1/schedules/weekly
POST /api/v1/schedules/timetable
```

所有 API 响应都要包含：

- `data_version`
- `warnings`
- `errors`
- `request_id`
