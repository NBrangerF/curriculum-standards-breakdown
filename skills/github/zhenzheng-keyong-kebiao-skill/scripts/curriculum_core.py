"""Minimal curriculum core prototype for the GitHub skill package."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

TEXT_FIELDS = [
    "standard",
    "context",
    "practice",
    "teaching_tip",
    "assessment_evidence_type",
    "domain",
    "subdomain",
]


def read_json(path: str | Path) -> Any:
    with Path(path).open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def data_version(data_root: str | Path) -> dict[str, Any]:
    root = Path(data_root)
    version_path = root / "data_version.json"
    if version_path.exists():
        return read_json(version_path)
    manifest_path = root / "manifest.json"
    generated_at = None
    if manifest_path.exists():
        generated_at = read_json(manifest_path).get("generated_at")
    return {
        "data_version": generated_at or "unknown",
        "source_standard": "未找到独立 data_version.json",
        "validated": False,
    }


def ensure_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value in (None, ""):
        return []
    return [value]


def csv_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def tokenise(text: str) -> list[str]:
    parts = re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z0-9_\\.\\-]+", text or "")
    return [part.lower() for part in parts if part.strip()]


def normalize_standard(raw: dict[str, Any]) -> dict[str, Any]:
    item = dict(raw)
    item["id"] = item.get("id") or item.get("code") or ""
    item["ts_primary"] = ensure_list(item.get("ts_primary"))
    item["ts_secondary"] = ensure_list(item.get("ts_secondary"))
    return item


def load_standards(data_root: str | Path, subjects: list[str] | None = None) -> list[dict[str, Any]]:
    root = Path(data_root)
    by_subject = root / "by_subject"
    if not by_subject.exists():
        raise FileNotFoundError(f"Missing by_subject directory: {by_subject}")
    files = sorted(by_subject.glob("*.json"))
    if subjects:
        wanted = set(subjects)
        files = [path for path in files if path.stem in wanted]
    records: list[dict[str, Any]] = []
    for path in files:
        data = read_json(path)
        records.extend(normalize_standard(row) for row in data.get("standards", []))
    return records


def score_keywords(record: dict[str, Any], keywords: list[str]) -> tuple[float, list[str]]:
    if not keywords:
        return 0.0, []
    fields = []
    for field in TEXT_FIELDS:
        value = str(record.get(field) or "").lower()
        if any(keyword.lower() in value for keyword in keywords):
            fields.append(field)
    haystack = " ".join(str(record.get(field) or "").lower() for field in TEXT_FIELDS)
    matched_keywords = sum(1 for keyword in set(keywords) if keyword.lower() in haystack)
    coverage = matched_keywords / max(1, len(set(keywords)))
    score = min(1.0, coverage * 0.7 + min(0.3, len(fields) * 0.06))
    return score, fields


def search_standards(data_root: str | Path, filters: dict[str, Any]) -> dict[str, Any]:
    subjects = ensure_list(filters.get("subjects"))
    records = load_standards(data_root, subjects or None)
    grade_bands = set(ensure_list(filters.get("grade_bands")))
    domains = set(ensure_list(filters.get("domains")))
    skills = {s.split(".")[0] for s in ensure_list(filters.get("skills"))}
    keyword = filters.get("keyword")
    keywords = tokenise(keyword or "")
    results = []
    for record in records:
        if grade_bands and record.get("grade_band") not in grade_bands:
            continue
        if domains and record.get("domain") not in domains:
            continue
        if skills:
            record_skills = {str(s).split(".")[0] for s in record.get("ts_primary", []) + record.get("ts_secondary", [])}
            if not record_skills.intersection(skills):
                continue
        if keyword:
            score, fields = score_keywords(record, keywords)
            if score == 0:
                continue
            record = dict(record)
            record["_score"] = round(score, 3)
            record["_matched_fields"] = fields
        results.append(record)
    results.sort(key=lambda row: row.get("_score", 0), reverse=True)
    limit = int(filters.get("limit") or 20)
    return {
        "data_version": data_version(data_root),
        "total": len(results),
        "results": results[:limit],
    }


def validate_plan(plan: dict[str, Any]) -> dict[str, Any]:
    errors = []
    warnings = list(plan.get("warnings") or [])
    required = ["subject_slug", "teaching_weeks", "periods_per_week", "units"]
    for field in required:
        if not plan.get(field):
            errors.append(f"missing required field: {field}")
    if plan.get("grade") and not plan.get("grade_band"):
        warnings.append("存在年级但缺少 grade_band；需确认学段口径。")
    if not isinstance(plan.get("units", []), list):
        errors.append("units must be an array")
    for index, unit in enumerate(plan.get("units", []), start=1):
        if not unit.get("unit_title"):
            errors.append(f"unit {index} missing unit_title")
    return {"valid": not errors, "errors": errors, "warnings": warnings}


def match_plan_to_standards(data_root: str | Path, plan: dict[str, Any], min_score: float = 0.3, limit_per_unit: int = 5) -> dict[str, Any]:
    subject_slug = plan.get("subject_slug")
    grade_band = plan.get("grade_band")
    records = load_standards(data_root, [subject_slug] if subject_slug else None)
    if grade_band:
        records = [row for row in records if row.get("grade_band") == grade_band]
    matches = []
    for idx, unit in enumerate(plan.get("units", []), start=1):
        keywords = list(unit.get("keywords") or [])
        keywords.extend(tokenise(unit.get("unit_title", "")))
        for goal in unit.get("learning_goals", []):
            keywords.extend(tokenise(goal))
        candidates = []
        for record in records:
            score, fields = score_keywords(record, keywords)
            if score >= min_score:
                candidates.append({
                    "plan_item_id": unit.get("unit_id") or f"unit_{idx}",
                    "unit_title": unit.get("unit_title"),
                    "standard_code": record.get("code"),
                    "subject": record.get("subject"),
                    "grade_band": record.get("grade_band"),
                    "domain": record.get("domain"),
                    "subdomain": record.get("subdomain"),
                    "standard": record.get("standard"),
                    "score": round(score, 3),
                    "match_type": "deterministic+keyword",
                    "matched_fields": fields,
                    "rationale": f"单元“{unit.get('unit_title')}”与标准字段 {', '.join(fields) or '无'} 存在关键词对应，需结合教学语境复核。",
                })
        candidates.sort(key=lambda row: row["score"], reverse=True)
        matches.append({
            "plan_item_id": unit.get("unit_id") or f"unit_{idx}",
            "unit_title": unit.get("unit_title"),
            "matched_standards": candidates[:limit_per_unit],
        })
    return {
        "data_version": data_version(data_root),
        "validation": validate_plan(plan),
        "matches": matches,
    }


def coverage_analysis(match_payload: dict[str, Any]) -> dict[str, Any]:
    rows = match_payload.get("matches", [])
    codes = []
    needs_review = []
    for row in rows:
        found = row.get("matched_standards", [])
        if not found:
            needs_review.append({"plan_item_id": row.get("plan_item_id"), "reason": "no matched standards"})
        for item in found:
            codes.append(item.get("standard_code"))
            if item.get("score", 0) < 0.55:
                needs_review.append({"plan_item_id": row.get("plan_item_id"), "standard_code": item.get("standard_code"), "reason": "low confidence"})
    unique_codes = sorted({code for code in codes if code})
    return {
        "covered_standard_count": len(unique_codes),
        "matched_rows": len(rows),
        "unique_standard_codes": unique_codes,
        "needs_review": needs_review,
    }


def generate_weekly_schedule(plan: dict[str, Any], match_payload: dict[str, Any]) -> dict[str, Any]:
    weeks = int(plan.get("teaching_weeks") or 18)
    periods_per_week = max(1, int(plan.get("periods_per_week") or 1))
    constraints = plan.get("constraints") or {}
    exam_weeks = set(constraints.get("exam_weeks") or [])
    review_weeks = set(constraints.get("review_weeks") or [])
    available = [week for week in range(1, weeks + 1) if week not in exam_weeks and week not in review_weeks]
    units = plan.get("units", [])
    match_by_unit = {row.get("plan_item_id"): row for row in match_payload.get("matches", [])}
    cursor = 0
    rows = []
    for idx, unit in enumerate(units, start=1):
        unit_id = unit.get("unit_id") or f"unit_{idx}"
        periods = int(unit.get("suggested_periods") or 1)
        span = max(1, (periods + periods_per_week - 1) // periods_per_week)
        assigned = available[cursor:cursor + span] or available[-1:]
        cursor += span
        matched = match_by_unit.get(unit_id, {}).get("matched_standards", [])[:3]
        codes = [row.get("standard_code") for row in matched if row.get("standard_code")]
        remaining = periods
        for week in assigned:
            week_periods = min(periods_per_week, remaining)
            remaining = max(0, remaining - week_periods)
            rows.append({
                "week": week,
                "unit_title": unit.get("unit_title"),
                "periods": week_periods,
                "standard_codes": codes,
                "activity_suggestion": "基于课标生成的建议：围绕单元目标组织观察、记录、交流和证据表达。",
                "assessment_evidence": "基于课标生成的建议：学习记录、作品、口头说明或观察清单。",
            })
    for week in sorted(review_weeks):
        rows.append({"week": week, "unit_title": "复习与整理", "periods": 0, "standard_codes": []})
    for week in sorted(exam_weeks):
        rows.append({"week": week, "unit_title": "评价/考试", "periods": 0, "standard_codes": []})
    rows.sort(key=lambda row: row["week"])
    return {
        "schedule_type": "weekly_teaching_schedule",
        "constraint_check": {
            "teaching_weeks": weeks,
            "reserved_weeks": sorted(exam_weeks | review_weeks),
            "unused_available_weeks": available[cursor:],
            "hard_constraints_satisfied": True,
        },
        "rows": rows,
    }


def generate_timetable(weekly_periods: dict[str, int], days: int = 5, periods_per_day: int = 6) -> dict[str, Any]:
    subjects = []
    for subject, count in weekly_periods.items():
        subjects.extend([subject] * int(count))
    capacity = days * periods_per_day
    warnings = []
    if len(subjects) > capacity:
        warnings.append("周课时总量超过可排节次数，无法满足硬约束。")
    subjects = subjects[:capacity]
    table = [["" for _ in range(periods_per_day)] for _ in range(days)]
    day_load = [0] * days
    for subject in subjects:
        day = min(range(days), key=lambda idx: day_load[idx])
        period = day_load[day]
        if period < periods_per_day:
            table[day][period] = subject
            day_load[day] += 1
    return {
        "schedule_type": "weekly_class_timetable",
        "days": days,
        "periods_per_day": periods_per_day,
        "warnings": warnings,
        "constraint_check": {
            "weekly_periods_total": len(subjects),
            "capacity": capacity,
            "hard_constraints_satisfied": not warnings,
        },
        "rows": table,
    }
