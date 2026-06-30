#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from curriculum_core import generate_timetable, read_json, write_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weekly-periods", help='JSON object, e.g. {"语文":6,"数学":5}')
    parser.add_argument("--weekly-periods-file")
    parser.add_argument("--days", type=int, default=5)
    parser.add_argument("--periods-per-day", type=int, default=6)
    args = parser.parse_args()
    if args.weekly_periods_file:
        weekly_periods = read_json(args.weekly_periods_file)
    elif args.weekly_periods:
        weekly_periods = json.loads(args.weekly_periods)
    else:
        raise SystemExit("Provide --weekly-periods or --weekly-periods-file")
    print(write_json(generate_timetable(weekly_periods, args.days, args.periods_per_day)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
