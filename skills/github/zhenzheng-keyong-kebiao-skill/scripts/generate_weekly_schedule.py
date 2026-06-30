#!/usr/bin/env python3
from __future__ import annotations

import argparse
from curriculum_core import generate_weekly_schedule, match_plan_to_standards, read_json, write_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--plan", required=True)
    args = parser.parse_args()
    plan = read_json(args.plan)
    matches = match_plan_to_standards(args.data_root, plan)
    print(write_json({
        "data_version": matches.get("data_version"),
        "schedule": generate_weekly_schedule(plan, matches),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
