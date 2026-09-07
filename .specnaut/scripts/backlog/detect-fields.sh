#!/usr/bin/env bash
# Detect native Project V2 single-select fields for Status, Priority and Size.
# Outputs eval-friendly env lines on stdout. Empty *_FIELD_ID means the field
# does not exist on the project — caller should fall back to labels.
# Usage: eval "$(detect-fields.sh)"
#
# For each single-select field <P> this emits:
#   <P>_FIELD_ID       the field's node id
#   <P>_OPT_<NAME>     one per option, name upper-cased and non-alphanumerics
#                      folded to `_` (so "In progress" -> STATUS_OPT_IN_PROGRESS)
#   <P>_OPT_NAMES      the option names in board order, comma-separated
#   <P>_FIRST_OPT_ID   the first option's id — the safe default for a caller
#                      that must place an item on a board it did not create
set -euo pipefail

# shellcheck source=./_config.sh
. "$(dirname "$0")/_config.sh"
require_project   # a project that does not resolve fails here, not mid-write

FIELDS_JSON=$(gh project field-list "$PROJECT_NUMBER" --owner "$REPO_OWNER" --format json)

emit() {
  local field="$1" prefix="$2"
  local field_block
  field_block=$(echo "$FIELDS_JSON" | jq -r --arg n "$field" '
    .fields[]
    | select(.type == "ProjectV2SingleSelectField")
    | select((.name | ascii_downcase) == ($n | ascii_downcase))
  ')
  if [ -z "$field_block" ]; then
    echo "${prefix}_FIELD_ID="
    return
  fi
  echo "${prefix}_FIELD_ID=$(echo "$field_block" | jq -r '.id')"
  # Option names are not identifiers: "In progress" would emit
  # `STATUS_OPT_IN PROGRESS=…`, which breaks the caller's `eval`. Fold every
  # non-alphanumeric character to `_` so the name is always assignable.
  echo "$field_block" | jq -r --arg p "$prefix" '
    .options[]
    | "\($p)_OPT_\(.name | ascii_upcase | gsub("[^A-Z0-9]"; "_"))=\(.id)"
  '
  echo "$field_block" | jq -r --arg p "$prefix" '
    "\($p)_OPT_NAMES=\"\([.options[].name] | join(", "))\""
  '
  echo "$field_block" | jq -r --arg p "$prefix" '
    "\($p)_FIRST_OPT_ID=\(.options[0].id // "")"
  '
}

emit Status STATUS
emit Priority PRIORITY
emit Size SIZE

# Date + number fields used by the Roadmap view (#264). They are
# regular ProjectV2Field nodes, not single-select — emit just the
# field ID; the writer routes by axis name to --date or --number.
emit_simple() {
  local field="$1" prefix="$2"
  local field_id
  field_id=$(echo "$FIELDS_JSON" | jq -r --arg n "$field" '
    .fields[]
    | select(.type == "ProjectV2Field")
    | select((.name | ascii_downcase) == ($n | ascii_downcase))
    | .id
  ')
  if [ -z "$field_id" ]; then
    echo "${prefix}_FIELD_ID="
    return
  fi
  echo "${prefix}_FIELD_ID=$field_id"
}

# ISSUE-LEVEL FIELDS ARE A SECOND, DIFFERENT SURFACE (#284). A repository can
# carry `Start date` / `Target date` / `Priority` / `Effort` as ISSUE fields,
# which look identical from the board and are written by a DIFFERENT mutation:
# `updateIssueFieldValue`, not `updateProjectV2ItemFieldValue`. Emitting only
# the project id was a silent failure in the direction that matters — the groom
# contract reads a non-empty id as "the field exists, setting it is REQUIRED",
# and then every write is refused with "Issue field values cannot be updated
# using the updateProjectV2ItemFieldValue mutation".
#
# So each date axis now emits a SCOPE alongside its id, and the id emitted is
# the one that can actually be written.
ISSUE_FIELDS_JSON=$(gh api graphql -f query='
  query($owner:String!, $name:String!) {
    repository(owner:$owner, name:$name) {
      issueFields(first:50) { nodes { __typename
        ... on IssueFieldDate { id name }
        ... on IssueFieldSingleSelect { id name }
        ... on IssueFieldNumber { id name }
      } }
    }
  }' -f owner="$REPO_OWNER" -f name="$REPO_NAME" 2>/dev/null \
  | jq -c '[.data.repository.issueFields.nodes[] | select(.id)]' 2>/dev/null) \
  || ISSUE_FIELDS_JSON='[]'
[ -n "$ISSUE_FIELDS_JSON" ] || ISSUE_FIELDS_JSON='[]'

issue_field_id() {
  echo "$ISSUE_FIELDS_JSON" | jq -r --arg n "$1" '
    .[] | select((.name | ascii_downcase) == ($n | ascii_downcase)) | .id
  ' | head -1
}

# Issue-level WINS when both exist. On a repo carrying both, the project copy
# is the one that cannot be written — preferring it is how #284 happened. A
# repo with only the project field is unaffected and reports `project`.
emit_dated() {
  local field="$1" prefix="$2" issue_id
  issue_id=$(issue_field_id "$field")
  if [ -n "$issue_id" ]; then
    echo "${prefix}_FIELD_ID=$issue_id"
    echo "${prefix}_FIELD_SCOPE=issue"
    return
  fi
  emit_simple "$field" "$prefix"
  echo "${prefix}_FIELD_SCOPE=project"
}

emit_dated  "Start date"  STARTDATE
emit_dated  "Target date" TARGETDATE
emit_simple "Estimate"    ESTIMATE
echo "ESTIMATE_FIELD_SCOPE=project"

# The DRIFT SURFACE this repo actually has, reported rather than silently
# tolerated (#284). Issue-level `Priority` / `Effort` are distinct from the
# project's `Priority` / `Size` that Specnaut writes to, and two surfaces
# holding the same judgement is exactly the dual-signal drift the
# classification contract exists to prevent.
for dup in Priority Effort; do
  dup_id=$(issue_field_id "$dup")
  [ -n "$dup_id" ] && echo "ISSUE_LEVEL_${dup}_FIELD_ID=$dup_id" || true
done

# Project node ID — handy for callers that also want to write field values.
echo "PROJECT_NODE_ID=$(gh project view "$PROJECT_NUMBER" --owner "$REPO_OWNER" --format json | jq -r '.id')"
