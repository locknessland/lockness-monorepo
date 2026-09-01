#!/usr/bin/env bash
# List items on the configured GitHub Project, with Status. Optional filter.
#
# Uses `gh issue list --json projectItems` — the gh CLI exposes the Project V2
# Status field via its REST-ish JSON projection, costing ~1 GraphQL point per
# call (vs ~20 for the bulky `repository.issues[].projectItems[].fieldValues[]`
# query that lived here previously and was the main rate-limit offender).
#
# Usage: list.sh [Status]
set -euo pipefail

# shellcheck source=./_config.sh
. "$(dirname "$0")/_config.sh"

FILTER="${1:-}"

# `Done` needs `--state all`, and only `Done` does.
#
# This project auto-closes an issue when its card moves to Done, so a Done card
# is always a closed issue — and querying `--state open` for it returned the
# empty set by construction. Not an error and not a warning: a caller asking
# "what shipped?" got silence, and a grooming sweep that trusts it under-reports
# the Done column without saying so. Every other Status is a working column and
# stays open-only, so the unfiltered listing is unchanged.
STATE=open
[ "$FILTER" = "Done" ] && STATE=all

JSON=$(gh issue list --repo "$REPO" --state "$STATE" --limit 200 \
  --json number,title,projectItems)

echo "$JSON" | jq -r --arg filter "$FILTER" '
  .[]
  | . as $issue
  | (.projectItems[0].status.name // "—") as $status
  | select($issue.projectItems | length > 0)
  | select($filter == "" or $status == $filter)
  | "  #\($issue.number)  \($status)  \($issue.title)"
'
