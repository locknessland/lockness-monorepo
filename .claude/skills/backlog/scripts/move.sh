#!/usr/bin/env bash
# Move a backlog issue to a Status column on Project #1.
# Usage: move.sh <ISSUE_NUMBER> <STATUS>
#   STATUS — Backlog | Ready | "In progress" | "In review" | Done
set -euo pipefail

ISSUE="${1:?usage: move.sh <issue-number> <status>}"
STATUS="${2:?usage: move.sh <issue-number> <status>}"

PROJECT_ID="PVT_kwDOCgOOI84BLfQw"
STATUS_FIELD_ID="PVTSSF_lADOCgOOI84BLfQwzg7C_9o"

case "$STATUS" in
  Backlog)        OPT="1f6e6607" ;;
  Ready)          OPT="289e2594" ;;
  "In progress")  OPT="da4b8f3f" ;;
  "In review")    OPT="b7e316c4" ;;
  Done)           OPT="1c701f60" ;;
  *) echo "unknown status: $STATUS (Backlog|Ready|\"In progress\"|\"In review\"|Done)" >&2; exit 1 ;;
esac

ITEM_ID=$(gh api graphql -f query='
  query($num: Int!) {
    repository(owner:"locknessland", name:"lockness") {
      issue(number: $num) {
        projectItems(first: 5) {
          nodes { id project { number } }
        }
      }
    }
  }' -F num="$ISSUE" \
  | jq -r '.data.repository.issue.projectItems.nodes[] | select(.project.number == 1) | .id')

if [[ -z "$ITEM_ID" ]]; then
  echo "issue #$ISSUE is not on Project #1" >&2
  exit 1
fi

gh project item-edit \
  --id "$ITEM_ID" \
  --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" \
  --single-select-option-id "$OPT" >/dev/null

echo "moved #$ISSUE → $STATUS"
