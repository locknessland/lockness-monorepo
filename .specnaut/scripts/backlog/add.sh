#!/usr/bin/env bash
# Create a GitHub Issue and attach it to the configured Project. Optional
# `--parent <num>` flag links the new issue as a sub-issue of an existing
# parent via GitHub's native `/sub_issues` REST endpoint (beta).
#
# Usage:
#   add.sh "<title>" [body] [labels-csv] [--parent <num>]
set -euo pipefail

# Parse arguments before sourcing _config.sh so `--help` and unknown-flag
# handling work regardless of whether the backlog backend is configured.
PARENT=""
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)
      echo 'usage: add.sh "<title>" [body] [labels-csv] [--parent <num>]'
      exit 0
      ;;
    --parent)
      if [ $# -lt 2 ]; then
        echo 'usage: add.sh "<title>" [body] [labels-csv] [--parent <num>]' >&2
        exit 2
      fi
      PARENT="$2"
      shift 2
      ;;
    --*)
      echo "add.sh: unknown flag '$1'" >&2
      echo 'usage: add.sh "<title>" [body] [labels-csv] [--parent <num>]' >&2
      exit 2
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

if [ "${#ARGS[@]}" -lt 1 ]; then
  echo 'usage: add.sh "<title>" [body] [labels-csv] [--parent <num>]' >&2
  exit 2
fi
TITLE="${ARGS[0]}"
BODY="${ARGS[1]:-}"
LABELS="${ARGS[2]:-}"

# shellcheck source=./_config.sh
. "$(dirname "$0")/_config.sh"
require_project   # a project that does not resolve fails here, not mid-write

# When --parent is set, fail fast if the parent issue doesn't exist —
# GitHub's sub_issues POST returns a confusing 404 otherwise.
if [ -n "$PARENT" ]; then
  if ! gh api "repos/$REPO_OWNER/$REPO_NAME/issues/$PARENT" --jq '.number' >/dev/null 2>&1; then
    echo "✗ parent issue #$PARENT not found in $REPO_OWNER/$REPO_NAME" >&2
    exit 3
  fi
fi

CREATE_ARGS=("--repo" "$REPO" "--title" "$TITLE")
if [ -n "$BODY" ]; then CREATE_ARGS+=("--body" "$BODY"); else CREATE_ARGS+=("--body" ""); fi
if [ -n "$LABELS" ]; then CREATE_ARGS+=("--label" "$LABELS"); fi

URL=$(gh issue create "${CREATE_ARGS[@]}")
echo "✓ created: $URL"

# Attach to the project. `item-add` leaves Status *null* — it does not fall
# back to the first column — so the item is invisible to every column-filtered
# board view AND to any grooming sweep that enumerates the columns, because it
# matches none of them. Place it explicitly, below.
#
# The attach RACES the board's own `Auto-add to project` workflow (#289). When
# that workflow's insert is still in flight, `addProjectV2ItemById` answers
# "Content already exists in this project" and `gh` exits non-zero — and under
# `set -e` that killed the script HERE, above every failure-tolerant line
# below. So the one step whose absence the comment above warns about was
# exactly the step skipped: the issue existed, attached, with a NULL Status,
# matching no column filter and invisible to every board view and every
# grooming sweep, while the caller saw "✓ created" and a real URL. A silent
# half-success is worse than a loud failure, which at least says "try again".
ATTACH_ERR=$(mktemp)
if ITEM_ID=$(gh project item-add "$PROJECT_NUMBER" --owner "$REPO_OWNER" \
  --url "$URL" --format json --jq '.id' 2>"$ATTACH_ERR"); then
  echo "✓ attached to Project #$PROJECT_NUMBER"
elif grep -qi 'content already exists in this project' "$ATTACH_ERR"; then
  # The board won the race. That is SUCCESS — the item is attached, which is
  # all this step wanted — but the id still has to be recovered or
  # `place_in_backlog` below has nothing to edit and the null Status stands.
  #
  # Filtered by project NUMBER, not node id: `PROJECT_NODE_ID` arrives later,
  # from `detect-fields.sh` inside `place_in_backlog`, and resolving it here
  # would buy a second API call for a value this query already carries.
  ITEM_ID=$(gh api graphql -f query='
    query($owner:String!, $name:String!, $num:Int!) {
      repository(owner:$owner, name:$name) {
        issue(number:$num) {
          projectItems(first:10) { nodes { id project { number } } }
        }
      }
    }' -f owner="$REPO_OWNER" -f name="$REPO_NAME" -F num="${URL##*/}" 2>/dev/null \
    | jq -r --argjson p "$PROJECT_NUMBER" \
        '.data.repository.issue.projectItems.nodes[]
         | select(.project.number==$p) | .id' | head -1) || true
  if [ -n "$ITEM_ID" ] && [ "$ITEM_ID" != "null" ]; then
    echo "✓ attached to Project #$PROJECT_NUMBER (by the board's own workflow)"
  else
    ITEM_ID=""
    echo "⚠ attached by the board, but its item id could not be read — the" \
      "item may be left without a Status" >&2
  fi
else
  # ANY other failure still reaches the caller. Swallowing them all would trade
  # this defect for a worse one: an item that is not on the board at all, and a
  # script that says so only in a warning nobody reads.
  cat "$ATTACH_ERR" >&2
  rm -f "$ATTACH_ERR"
  exit 1
fi
rm -f "$ATTACH_ERR"

# Placing the item is best-effort and MUST NOT fail this script: the issue
# already exists by now, so a non-zero exit would leave the caller unsure
# whether anything was created, and a re-run would duplicate it. Every failure
# path below warns and returns 0.
place_in_backlog() {
  # The recovery path above can legitimately come back empty (#289). Say so in
  # the caller's own vocabulary rather than letting `item-edit` fail into the
  # generic "could not set Status" further down, which would point at the
  # field lookup when the real cause is a missing item id.
  if [ -z "${ITEM_ID:-}" ]; then
    echo "⚠ no project item id — item attached but not placed" >&2
    return 0
  fi
  local fields
  if ! fields=$("$(dirname "$0")/detect-fields.sh" 2>/dev/null); then
    echo "⚠ could not read the project's fields — item attached but not placed" >&2
    return 0
  fi
  # detect-fields.sh emits assignments only, and is the single source of the
  # Status lookup — no third copy of the field/option resolution.
  eval "$fields"

  if [ -z "${STATUS_FIELD_ID:-}" ]; then
    echo "⚠ project has no Status field — item attached but not placed" >&2
    return 0
  fi

  local option_id="${STATUS_OPT_BACKLOG:-}" placed="Backlog"
  if [ -z "$option_id" ]; then
    # The board belongs to the user and need not have a "Backlog" column.
    # Fall back to whatever its first column is rather than refusing.
    option_id="${STATUS_FIRST_OPT_ID:-}"
    placed="${STATUS_OPT_NAMES%%,*}"
    if [ -n "$option_id" ]; then
      echo "⚠ no 'Backlog' column on this board (found: ${STATUS_OPT_NAMES:-none})" >&2
    fi
  fi

  if [ -z "$option_id" ]; then
    echo "⚠ Status field has no options — item attached but not placed" >&2
    return 0
  fi

  if gh project item-edit \
    --id "$ITEM_ID" \
    --project-id "$PROJECT_NODE_ID" \
    --field-id "$STATUS_FIELD_ID" \
    --single-select-option-id "$option_id" >/dev/null 2>&1; then
    echo "✓ placed in $placed"
  else
    echo "⚠ could not set Status — item attached but not placed" >&2
  fi
  return 0
}

place_in_backlog || true

# Link as a sub-issue if --parent was given. Two-step: extract the new
# issue's REST id (NOT its number — sub_issues is keyed by id), then POST
# to the parent's /sub_issues endpoint.
if [ -n "$PARENT" ]; then
  CHILD_NUM="${URL##*/}"
  CHILD_ID=$(gh api "repos/$REPO_OWNER/$REPO_NAME/issues/$CHILD_NUM" --jq '.id')
  gh api -X POST "repos/$REPO_OWNER/$REPO_NAME/issues/$PARENT/sub_issues" \
    -F sub_issue_id="$CHILD_ID" >/dev/null
  echo "✓ linked as sub-issue of #$PARENT"
fi
