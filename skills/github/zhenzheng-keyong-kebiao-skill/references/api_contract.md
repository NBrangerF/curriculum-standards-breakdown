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
  "stages": ["S2"],
  "domains": ["生命科学"],
  "skills": ["TS1", "TS5"],
  "keyword": "植物",
  "limit": 20
}
```

搜索响应：

```json
{
  "data": [
    {
      "code": "SC-S2-LS-01",
      "subject": "科学",
      "stage_code": "S2",
      "grades": [3, 4],
      "level1": "生命科学",
      "level2": "...",
      "statement": "...",
      "indicators": [{ "code": "SC-S2-LS-01.1", "text": "课标原文", "pages": [0] }],
      "ts_primary": ["TS1"]
    }
  ],
  "meta": { "data_version": "2025r-…", "total": 8, "next_cursor": null }
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
