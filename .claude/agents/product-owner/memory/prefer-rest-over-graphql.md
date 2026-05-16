---
name: prefer-rest-over-graphql
description: Always reach for the REST API (`gh issue`, `gh api repos/...`) over GraphQL when both can do the job. GraphQL is reserved for the cases where it is the ONLY path. Reason — REST and GraphQL have separate rate-limit budgets and REST mutations are far cheaper per call.
metadata:
    type: feedback
---

When you have a choice between REST and GraphQL, pick **REST** every time. Set
by Kevin on 2026-05-16 after a grooming session burned the entire 5000-point
GraphQL budget on Project V2 field updates that would have been free over REST
if they had been issue-level instead.

**Why:** GitHub's two APIs have separate budgets:

- **REST** — 5000 requests/hour. Each call ≈ 1 unit.
- **GraphQL** — 5000 _points_/hour. A single `updateProjectV2ItemFieldValue`
  mutation observed at **~170 points** in this project (see [[autonomous-sweep]]
  for the incident). Compounds fast under any bulk loop.

REST exhaustion will only happen at ≥5000 calls/hour. GraphQL exhaustion can
land in 30 mutations.

**How to apply:**

- **Issue creation** → `gh issue create` (REST). Already done by `add.sh`.
- **Issue editing (title, body, labels, assignees, milestone)** →
  `gh issue edit` (REST). Already done.
- **Closing / reopening** → `gh issue close` / `gh issue reopen` (REST).
- **Comments** → `gh issue comment` (REST).
- **Sub-issue linkage** →
  `gh api -X POST repos/{owner}/{repo}/issues/{parent}/sub_issues` (REST preview
  endpoint — done by `add.sh --parent`).
- **Reading issue state** → `gh issue view --json …` (REST).

**Forced GraphQL cases (no REST equivalent — accept the cost, but batch):**

- Setting any Project V2 native field — `Status`, `Priority`, `Size`,
  `Issue Type`, or any custom field. There is **no REST endpoint** for
  `updateProjectV2ItemFieldValue`. Used by `move.sh`, `set-field.sh`.
- Adding / removing items to a Project V2 board — `addProjectV2ItemById` /
  `deleteProjectV2Item`. Used by `add.sh`.
- Listing project items reliably — see the carve-out in `SKILL.md` ("Why we
  don't use `gh project item-list`").

**Decision rule before any call:**

1. Can I answer this with `gh issue ...` or `gh api repos/...` (REST)? → Use
   REST.
2. Is the target a Project V2 field or board membership? → GraphQL is the only
   path; check `gh api rate_limit --jq .resources.graphql` first if you're about
   to loop, and apply the batching rules in [[autonomous-sweep]].
3. Listing data? Try REST first (`gh issue list --json …`). Fall back to GraphQL
   only if you actually need a Project V2 field on the result.

**Side benefit:** REST responses are easier to parse from JSON and don't carry
the GraphQL `viewer` permission quirks that bit us with `gh project item-list`.
