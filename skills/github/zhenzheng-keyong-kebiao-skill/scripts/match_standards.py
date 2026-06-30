#!/usr/bin/env python3
from __future__ import annotations

import argparse
from curriculum_core import match_plan_to_standards, read_json, write_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--min-score", type=float, default=0.3)
    parser.add_argument("--limit-per-unit", type=int, default=5)
    args = parser.parse_args()
    payload = match_plan_to_standards(
        args.data_root,
        read_json(args.plan),
        min_score=args.min_score,
        limit_per_unit=args.limit_per_unit,
    )
    print(write_json(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
