#!/usr/bin/env bash
# Query kebiao's read-only plugin API and print the quotable answer.
# Usage: bash scripts/kebiao.sh <endpoint> [key=value ...]
#   endpoints: search, textbook-chapter, standard, standards, stage-goals, textbooks, changes, checks, subjects, objectives-check
#   example:   bash scripts/kebiao.sh textbook-chapter "query=人教版 五年级下册 分数的基本性质"
# Sends only the query words to https://www.kebiao.org; no account, no personal data.
set -euo pipefail
endpoint="${1:-}"
case "$endpoint" in
    search|textbook-chapter|standard|standards|stage-goals|textbooks|changes|checks|subjects|objectives-check) ;;
    *) echo "用法：bash scripts/kebiao.sh <search|textbook-chapter|standard|standards|stage-goals|textbooks|changes|checks|subjects|objectives-check> [参数=值 ...]" >&2; exit 2 ;;
esac
shift
args=()
for pair in "$@"; do args+=(--data-urlencode "$pair"); done
body="$(curl -sS -G --max-time 40 -A 'kebiao-workbuddy-skill/2.0' "https://www.kebiao.org/api/v1/plugin/${endpoint}" "${args[@]}")"
# Print the answer text when python or node can parse JSON; otherwise print the raw JSON.
if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$body" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("answer") or d.get("error") or json.dumps(d, ensure_ascii=False))'
elif command -v node >/dev/null 2>&1; then
    printf '%s' "$body" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const d=JSON.parse(s);console.log(d.answer||d.error||s)})'
else
    printf '%s\n' "$body"
fi
