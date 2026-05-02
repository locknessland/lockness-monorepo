#!/usr/bin/env bash
# Create a new issue on locknessland/lockness and attach it to Project #1 (Backlog).
# Usage:
#   add.sh "<title>"
#   add.sh "<title>" "<body>"
#   add.sh "<title>" "<body>" "<label1,label2,...>"
set -euo pipefail

TITLE="${1:?usage: add.sh \"<title>\" [<body>] [<labels-csv>]}"
BODY="${2:-}"
LABELS="${3:-}"

ARGS=(--repo locknessland/lockness --title "$TITLE")
[[ -n "$BODY" ]]   && ARGS+=(--body "$BODY")
[[ -n "$LABELS" ]] && ARGS+=(--label "$LABELS")

URL=$(gh issue create "${ARGS[@]}" 2>&1 | tail -1)
gh project item-add 1 --owner locknessland --url "$URL" >/dev/null

echo "$URL"
