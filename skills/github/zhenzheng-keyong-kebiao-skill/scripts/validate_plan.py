#!/usr/bin/env python3
from __future__ import annotations

import argparse
from curriculum_core import read_json, validate_plan, write_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    args = parser.parse_args()
    result = validate_plan(read_json(args.plan))
    print(write_json(result))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
