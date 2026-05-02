---
name: backlog
description: Manage Lockness's product backlog directly on GitHub Project #1 ("Lockness Framework", org locknessland). Use when the user asks to "list the backlog", "add to the backlog", "what's next", "move task X to in-progress / done", "open an issue for Y", or any backlog/project management on this repo. Source of truth is GitHub — there is no local markdown copy.
allowed-tools: Bash(gh *) Bash(${CLAUDE_SKILL_DIR}/scripts/*.sh) Bash(jq *) Bash(column *) Bash(sort *)
---

# Backlog skill — Lockness (GitHub Project #1)

The backlog lives on **GitHub Project #1 "Lockness Framework"** (org-owned by
`locknessland`), backed by issues in **`locknessland/lockness`**. There is no
local markdown mirror. Everything goes through `gh` CLI — wrappers in `scripts/`
cover the common cases; raw `gh api graphql` is documented below for one-offs.

## All mutations go through the Product Owner agent

The main session does not call `add.sh`, `move.sh`, `clarify-comment.sh`, or
`gh issue {create,close,edit}` against this repo directly. **Dispatch the
`product-owner` subagent** for any mutation: creating issues, clarifying bodies,
moving status columns, closing items. The PO is the single owner of the backlog
lifecycle (see `.claude/agents/product-owner.md`).

This skill's scripts are the **toolbox** the PO uses. The main session may call
the read-only ones (`list.sh`, `view.sh`) directly to inspect state, but every
write goes through the PO — **with one carve-out**:

**Mechanical Status moves are exempt.** When a Status change is a deterministic
step inside an established workflow (e.g. orchestrate Step 3b "move to In
progress" once architect ships, or Step 7 "move to In review" once a PR opens),
the main session may call `move.sh <num> <Status>` directly. No PO judgment is
involved — the trigger condition fully determines the new Status. This avoids
spinning up a sub-agent for a one-line bash call. Issue creation, body
clarification, and triage decisions still go through the PO.

## Project handles

| Thing           | Value                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Repo            | `locknessland/lockness`                                                                                 |
| Project number  | `1` (owner: `locknessland`, org-owned)                                                                  |
| Project node ID | `PVT_kwDOCgOOI84BLfQw`                                                                                  |
| Status field ID | `PVTSSF_lADOCgOOI84BLfQwzg7C_9o`                                                                        |
| Status options  | Backlog `1f6e6607` · Ready `289e2594` · In progress `da4b8f3f` · In review `b7e316c4` · Done `1c701f60` |

If the project layout changes, refresh with:

```bash
gh project field-list 1 --owner locknessland --format json | jq '.fields[] | select(.name=="Status")'
gh project view 1 --owner locknessland --format json | jq '.id'
```

## Scripts (preferred path)

```bash
.claude/skills/backlog/scripts/list.sh                    # all items, with Status
.claude/skills/backlog/scripts/list.sh Backlog            # filter by Status
.claude/skills/backlog/scripts/view.sh <issue-number>     # one item + comments
.claude/skills/backlog/scripts/add.sh "<title>" [body] [labels-csv]   # creates issue + attaches to project
.claude/skills/backlog/scripts/move.sh <issue-number> <Status>        # Status = Backlog|Ready|"In progress"|"In review"|Done
.claude/skills/backlog/scripts/clarify-comment.sh <issue> "<comment>" # leave a question on the issue
```

For closing or editing, just use `gh` directly — no wrapper needed:

```bash
gh issue close  <num> --repo locknessland/lockness --reason completed     # or not_planned
gh issue reopen <num> --repo locknessland/lockness
gh issue edit   <num> --repo locknessland/lockness --title "…" --body "…" --add-label "…" --remove-label "…"
```

## Why we don't use `gh project item-list`

`gh project item-list 1 --owner locknessland` and the equivalent
`viewer.projectV2(1).items` GraphQL field can return 0 items in some
account/permission contexts even when items genuinely exist (verified via direct
node queries). The `list.sh` and `move.sh` scripts work around it by querying
via `repository.issues[].projectItems[]` filtered by `project.number == 1`. Same
data, reverse path through the graph.

## Conventions

- **Titles** — short imperative phrases ("Add docx skill", not "I want to add a
  docx skill"). Lowercase OK; no leading emoji.
- **Bodies** — once clarified, follow `## Why` / `## Acceptance criteria` /
  `## Out of scope` / optional `## Notes`. Keep it tight: half a page beats a
  vague essay.
- **Priority** — Project #1 has a separate `Priority` single-select field. Use
  it (alongside Status) when ordering the backlog. Status alone carries the
  workflow state, not the order.
- **Drafts** (project items with no underlying issue) are not used. Every task
  is a real issue.
- **Closing** — close the issue, don't just move to Done. The repo's issue
  history is the audit trail.

## When NOT to use this skill

- The user is implementing a backlog item — that's normal coding work; only
  return here when they want to update the item's status afterwards.
- The user asks about another repo's backlog — this skill is hard-wired to
  `locknessland/lockness` and Project #1.

## Troubleshooting

- `gh: Not Found (HTTP 404)` on a project command → confirm `gh auth status`
  shows the `project` scope. If missing: `gh auth refresh -s project`.
- An issue is on the repo but not on the project board →
  `gh project item-add 1 --owner locknessland --url <issue-url>` (the underlying
  call works even though `item-list` may not).
- The Status field/option IDs above don't match a query result → the project
  layout was edited; refresh with the commands at the top of this file and
  update both the table and `scripts/move.sh`.
