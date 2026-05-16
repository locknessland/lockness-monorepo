---
name: autonomous-sweep
description: On every grooming pass, the PO must autonomously clean orphan-status items (closed-without-Done, merged-but-stuck-in-Ready/In-progress, closed-but-still-in-Backlog) without asking the user. It is part of the PO's role to keep the board self-consistent.
metadata:
    type: feedback
---

On every grooming pass, the PO sweeps orphan-status items autonomously — **do
not surface a yes/no question to the user**.

**Why:** Kevin's view is that "Status" exists so the board reflects reality.
Items closed but still sitting in Backlog/Ready, or merged PRs whose issues are
still in In progress/In review, are mechanical inconsistencies. Asking before
fixing them wastes a round-trip on something the PO is meant to own. This rule
was set after a `/backlog groom` pass surfaced 36 closed items attached to the
project without Status and the PO asked for confirmation — Kevin clarified that
this is exactly the kind of thing the PO should fix unprompted.

**How to apply:** On every grooming pass, before producing the report:

1. **Closed-without-Done sweep** — list issues with `state:closed` attached to
   the project: any whose Status is empty, Backlog, Ready, In progress, or In
   review → `move.sh <num> Done`. No user prompt. Mention the count in the
   report ("Swept N orphan-closed items to Done").
2. **Merged-PR sweep** — list issues with `state:closed` that were closed via a
   PR (look at the close commit / linked PR) and whose Status is not Done →
   `move.sh <num> Done`. Covered by the rule above.
3. **Reopened-into-Done sweep** — issues with `state:open` whose Status is Done
   → reassign Status to In progress or Backlog based on whether a PR is open. If
   ambiguous, leave it and flag in the report (this one IS judgment).

Mechanical = no judgment = no prompt. Anything that requires deciding a
priority, splitting an epic, or interpreting an AC bullet is still a judgment
call and stays in the user-facing decision list.

## Rate-limit precaution (GitHub GraphQL)

Each `move.sh` call burns **~170 GraphQL points** (not "2-3" as initially
estimated — the underlying `updateProjectV2ItemFieldValue` mutation triggers
sub-queries that compound). Sweeping 40+ orphan items in one go has hit the
5000-points/hour limit mid-pass TWICE in the same session (incidents 2026-05-16:
3/42 swept on first attempt; then 25/39 of the remainder on second attempt after
reset — quota burns at ~170/item, not at the documented per-call cost).

Before starting a large sweep:

1. `gh api rate_limit --jq .resources.graphql` — confirm remaining points.
2. If `remaining < items_to_sweep * 200`, batch: do `min(N, remaining/200)`
   items this pass (use 200 as a safety budget over the observed ~170 cost),
   report the partial result with the remaining issue numbers listed, and tell
   the user when the reset hits (the `reset` field is a Unix epoch — convert to
   local time).
3. Never spin in a sleep loop hoping the quota refills — return control to the
   user with a clean resumable list.
