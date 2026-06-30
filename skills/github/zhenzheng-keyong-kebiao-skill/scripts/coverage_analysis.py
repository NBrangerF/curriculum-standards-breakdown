#!/usr/bin/env python3
from __future__ import annotations

import argparse
from curriculum_core import coverage_analysis, match_plan_to_standards, read_json, write_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--min-score", type=float, default=0.3)
    args = parser.parse_args()
    matches = match_plan_to_standards(args.data_root, read_json(args.plan), min_score=args.min_score)
    print(write_json({
        "data_version": matches.get("data_version"),
        "coverage": coverage_analysis(matches),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
