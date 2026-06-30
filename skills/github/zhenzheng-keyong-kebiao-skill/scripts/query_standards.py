#!/usr/bin/env python3
from __future__ import annotations

import argparse
from curriculum_core import csv_list, search_standards, write_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--subjects")
    parser.add_argument("--grade-bands")
    parser.add_argument("--domains")
    parser.add_argument("--skills")
    parser.add_argument("--keyword")
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    payload = search_standards(args.data_root, {
        "subjects": csv_list(args.subjects),
        "grade_bands": csv_list(args.grade_bands),
        "domains": csv_list(args.domains),
        "skills": csv_list(args.skills),
        "keyword": args.keyword,
        "limit": args.limit,
    })
    print(write_json(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
