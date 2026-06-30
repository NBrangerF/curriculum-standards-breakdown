#!/usr/bin/env python3
"""Local helper for the "真正"能用的课标 Skill.

This script intentionally uses only the local JSON data directory. It never
creates standard codes and always returns the records it found.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
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


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def resolve_data_root(raw: str | None) -> Path:
    if raw:
        root = Path(raw).expanduser().resolve()
    else:
        root = Path.cwd() / "public" / "data"
    if not root.exists():
        raise SystemExit(f"Data root not found: {root}")
    return root


def load_data_version(data_root: Path) -> dict[str, Any]:
    version_path = data_root / "data_version.json"
    if version_path.exists():
        return load_json(version_path)
    manifest_path = data_root / "manifest.json"
    generated_at = None
    if manifest_path.exists():
        generated_at = load_json(manifest_path).get("generated_at")
    return {
        "data_version": generated_at or "unknown",
        "source_standard": "未找到独立 data_version.json",
        "validated": False,
    }


def load_standards(data_root: Path, subjects: list[str] | None = None) -> list[dict[str, Any]]:
    by_subject = data_root / "by_subject"
    if not by_subject.exists():
        raise SystemExit(f"Missing by_subject directory: {by_subject}")
    files = sorted(by_subject.glob("*.json"))
    if subjects:
        wanted = set(subjects)
        files = [p for p in files if p.stem in wanted]
    records: list[dict[str, Any]] = []
    for path in files:
        data = load_json(path)
        for raw in data.get("standards", []):
            records.append(normalize_standard(raw))
    return records


def normalize_standard(raw: dict[str, Any]) -> dict[str, Any]:
    item = dict(raw)
    item["id"] = item.get("id") or item.get("code") or ""
    item["ts_primary"] = ensure_list(item.get("ts_primary"))
    item["ts_secondary"] = ensure_list(item.get("ts_secondary"))
    return item


def ensure_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value in (None, ""):
        return []
    return [value]


def split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [x.strip() for x in value.split(",") if x.strip()]


def tokenise(text: str) -> list[str]:
    parts = re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z0-9_\\.\\-]+", text or "")
    return [p.lower() for p in parts if p.strip()]


def score_keywords(record: dict[str, Any], keywords: list[str]) -> tuple[float, list[str]]:
    if not keywords:
        return 0.0, []
    matched_fields: list[str] = []
    hits = 0
    for field in TEXT_FIELDS:
        text = str(record.get(field) or "").lower()
        field_hit = any(kw.lower() in text for kw in keywords if kw)
        if field_hit:
            matched_fields.append(field)
            hits += 1
    keyword_bonus = min(0.35, len(matched_fields) * 0.07)
    unique_hits = sum(1 for kw in keywords if kw and kw.lower() in " ".join(str(record.get(f) or "").lower() for f in TEXT_FIELDS))
    coverage = unique_hits / max(1, len(keywords))
    return min(1.0, keyword_bonus + coverage * 0.65), matched_fields


def standard_matches(record: dict[str, Any], args: argparse.Namespace) -> bool:
    if args.subjects and record.get("subject_slug") not in args.subjects:
        return False
    if args.grade_bands and record.get("grade_band") not in args.grade_bands:
        return False
    if args.domains and record.get("domain") not in args.domains:
        return False
    if args.skills:
        skills = {str(s).split(".")[0] for s in record.get("ts_primary", []) + record.get("ts_secondary", [])}
        requested = {s.split(".")[0] for s in args.skills}
        if not skills.intersection(requested):
            return False
    if args.keyword:
        kw = args.keyword.lower()
        haystack = " ".join(str(record.get(f) or "").lower() for f in TEXT_FIELDS)
        if kw not in haystack:
            return False
    return True


def search(args: argparse.Namespace) -> dict[str, Any]:
    data_root = resolve_data_root(args.data_root)
    args.subjects = split_csv(args.subjects)
    args.grade_bands = split_csv(args.grade_bands)
    args.domains = split_csv(args.domains)
    args.skills = split_csv(args.skills)
    records = load_standards(data_root, args.subjects or None)
    results = [r for r in records if standard_matches(r, args)]
    if args.keyword:
        keywords = tokenise(args.keyword)
        for item in results:
            item["_score"], item["_matched_fields"] = score_keywords(item, keywords)
        results.sort(key=lambda x: x.get("_score", 0), reverse=True)
    return {
        "data_version": load_data_version(data_root),
        "total": len(results),
        "results": results[: args.limit],
    }


def match_plan(args: argparse.Namespace) -> dict[str, Any]:
    data_root = resolve_data_root(args.data_root)
    plan = load_json(Path(args.plan))
    subject_slug = plan.get("subject_slug")
    grade_band = plan.get("grade_band")
    records = load_standards(data_root, [subject_slug] if subject_slug else None)
    if grade_band:
        records = [r for r in records if r.get("grade_band") == grade_band]
    rows = []
    for idx, unit in enumerate(plan.get("units", []), start=1):
        keywords = list(unit.get("keywords") or [])
        keywords += tokenise(unit.get("unit_title", ""))
        for goal in unit.get("learning_goals", []):
            keywords += tokenise(goal)
        candidates = []
        for record in records:
            score, fields = score_keywords(record, sorted(set(keywords)))
            if score >= args.min_score:
                candidates.append({
                    "code": record.get("code"),
                    "subject": record.get("subject"),
                    "grade_band": record.get("grade_band"),
                    "domain": record.get("domain"),
                    "subdomain": record.get("subdomain"),
                    "standard": record.get("standard"),
                    "score": round(score, 3),
                    "matched_fields": fields,
                    "rationale": f"单元“{unit.get('unit_title', f'unit_{idx}')}”与字段 {', '.join(fields) or '无'} 存在关键词对应，需按教学语境复核。",
                })
        candidates.sort(key=lambda x: x["score"], reverse=True)
        rows.append({
            "unit_id": unit.get("unit_id") or f"unit_{idx}",
            "unit_title": unit.get("unit_title"),
            "matched_standards": candidates[: args.limit_per_unit],
        })
    return {
        "data_version": load_data_version(data_root),
        "plan_summary": {
            "subject_slug": subject_slug,
            "grade_band": grade_band,
            "teaching_weeks": plan.get("teaching_weeks"),
            "periods_per_week": plan.get("periods_per_week"),
        },
        "warnings": plan.get("warnings", []),
        "matches": rows,
    }


def weekly_schedule(args: argparse.Namespace) -> dict[str, Any]:
    plan = load_json(Path(args.plan))
    matches = match_plan(args)
    weeks = int(plan.get("teaching_weeks") or 18)
    periods_per_week = max(1, int(plan.get("periods_per_week") or 1))
    exam_weeks = set((plan.get("constraints") or {}).get("exam_weeks") or [])
    review_weeks = set((plan.get("constraints") or {}).get("review_weeks") or [])
    available_weeks = [w for w in range(1, weeks + 1) if w not in exam_weeks and w not in review_weeks]
    units = plan.get("units", [])
    rows = []
    cursor = 0
    for unit, unit_match in zip(units, matches["matches"]):
        periods = int(unit.get("suggested_periods") or 1)
        span = max(1, (periods + periods_per_week - 1) // periods_per_week)
        assigned = available_weeks[cursor: cursor + span] or available_weeks[-1:]
        cursor += span
        codes = [m["code"] for m in unit_match.get("matched_standards", [])[:3]]
        remaining = periods
        for week in assigned:
            week_periods = min(periods_per_week, remaining)
            remaining = max(0, remaining - week_periods)
            rows.append({
                "week": week,
                "unit_title": unit.get("unit_title"),
                "periods": week_periods,
                "standard_codes": codes,
                "activity_suggestion": "基于课标生成的建议：围绕单元关键词组织观察、记录、交流和证据表达。",
                "assessment_evidence": "基于课标生成的建议：学习记录、作品、口头说明或观察清单。",
            })
    for week in sorted(review_weeks):
        rows.append({"week": week, "unit_title": "复习与整理", "periods": 0, "standard_codes": [], "activity_suggestion": "复习周", "assessment_evidence": "阶段性整理"})
    for week in sorted(exam_weeks):
        rows.append({"week": week, "unit_title": "评价/考试", "periods": 0, "standard_codes": [], "activity_suggestion": "评价周", "assessment_evidence": "综合评价"})
    rows.sort(key=lambda x: x["week"])
    return {
        "data_version": matches["data_version"],
        "warnings": plan.get("warnings", []),
        "schedule_type": "weekly_teaching_schedule",
        "constraint_check": {
            "teaching_weeks": weeks,
            "reserved_weeks": sorted(exam_weeks | review_weeks),
            "unused_available_weeks": available_weeks[cursor:],
            "hard_constraints_satisfied": True,
        },
        "rows": rows,
    }


def emit(payload: dict[str, Any], fmt: str) -> None:
    if fmt == "json":
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return
    if "results" in payload:
        print("# 课程标准查询结果\n")
        print(f"- 数据版本：{payload.get('data_version', {}).get('data_version')}")
        print(f"- 匹配数量：{payload.get('total')}\n")
        print("| Code | 学科 | 学段 | 领域 | 标准正文 |")
        print("|---|---|---|---|---|")
        for item in payload.get("results", []):
            print(f"| {item.get('code')} | {item.get('subject')} | {item.get('grade_band')} | {item.get('domain')} | {item.get('standard')} |")
        return
    if "rows" in payload:
        print("# 教学进度课表\n")
        print("| 周次 | 单元/主题 | 对应标准 Code | 基于课标生成的教学活动 |")
        print("|---:|---|---|---|")
        for row in payload.get("rows", []):
            print(f"| {row.get('week')} | {row.get('unit_title')} | {', '.join(row.get('standard_codes', []))} | {row.get('activity_suggestion')} |")
        return
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    search_p = sub.add_parser("search")
    search_p.add_argument("--data-root")
    search_p.add_argument("--subjects")
    search_p.add_argument("--grade-bands")
    search_p.add_argument("--domains")
    search_p.add_argument("--skills")
    search_p.add_argument("--keyword")
    search_p.add_argument("--limit", type=int, default=20)
    search_p.add_argument("--format", choices=["json", "md"], default="json")

    match_p = sub.add_parser("match-plan")
    match_p.add_argument("--data-root")
    match_p.add_argument("--plan", required=True)
    match_p.add_argument("--limit-per-unit", type=int, default=5)
    match_p.add_argument("--min-score", type=float, default=0.3)
    match_p.add_argument("--format", choices=["json", "md"], default="json")

    weekly_p = sub.add_parser("weekly-schedule")
    weekly_p.add_argument("--data-root")
    weekly_p.add_argument("--plan", required=True)
    weekly_p.add_argument("--limit-per-unit", type=int, default=3)
    weekly_p.add_argument("--min-score", type=float, default=0.3)
    weekly_p.add_argument("--format", choices=["json", "md"], default="json")

    args = parser.parse_args()
    if args.command == "search":
        emit(search(args), args.format)
    elif args.command == "match-plan":
        emit(match_plan(args), args.format)
    elif args.command == "weekly-schedule":
        emit(weekly_schedule(args), args.format)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
