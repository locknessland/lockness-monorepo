---
name: backlog
description: Manage Lockness's product backlog directly on GitHub Project #1 ("Lockness Framework", org locknessland). Use when the user asks to "list the backlog", "add to the backlog", "what's next", "move task X to in-progress / done", "open an issue for Y", or any backlog/project management on this repo. Source of truth is GitHub — there is no local markdown copy.
argument-hint: [list|next|add|update|estimate|status|groom|brief] [args]
allowed-tools: Bash(gh *) Bash(.specnaut/scripts/backlog/*.sh) Bash(jq *) Bash(column *) Bash(sort *)
---

# Backlog skill — Lockness (GitHub Project #1)

The backlog lives on **GitHub Project #1 "Lockness Framework"** (org-owned by
`locknessland`), backed by issues in **`locknessland/lockness`**. **No local
markdown mirror** — GitHub is the source of truth. Everything goes through `gh`
CLI; wrappers under `.specnaut/scripts/backlog/` cover the common operations.

## All mutations go through the Product Owner agent

The main session does not call `add.sh`, `move.sh`, `clarify-comment.sh`, or
`gh issue {create,close,edit}` against this repo directly. **Dispatch the
`product-owner` subagent** for any mutation: creating issues, clarifying bodies,
classifying (Size / Priority / Issue Type / labels), moving status columns,
closing items. The PO is the single owner of the backlog lifecycle (see
`.claude/agents/product-owner.md`).

This skill's scripts are the **toolbox** the PO uses. The main session may call
the read-only ones (`list.sh`, `view.sh`) directly to inspect state, but every
write goes through the PO — **with one carve-out**:

**Mechanical Status moves are exempt.** When a Status change is a deterministic
step inside an established workflow (e.g. `/orchestrate` Step 3b "move to In
progress" once architect ships, or Step 7 "move to In review" once a PR opens),
the main session may call `move.sh <num> <Status>` directly. No PO judgment is
involved — the trigger condition fully determines the new Status. This avoids
spinning up a sub-agent for a one-line bash call. Issue creation, body
clarification, classification, and triage decisions still go through the PO.

## Project handles

Configuration is loaded by `_config.sh` from `.specnaut/backlog-config.yml`. The
cached identifiers below are filled on first script invocation.

| Thing             | Value                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Repo              | `locknessland/lockness`                                                                                 |
| Project number    | `1` (owner: `locknessland`, org-owned)                                                                  |
| Project node ID   | `PVT_kwDOCgOOI84BLfQw`                                                                                  |
| Status field ID   | `PVTSSF_lADOCgOOI84BLfQwzg7C_9o`                                                                        |
| Status options    | Backlog `1f6e6607` · Ready `289e2594` · In progress `da4b8f3f` · In review `b7e316c4` · Done `1c701f60` |
| Priority field ID | `PVTSSF_lADOCgOOI84BLfQwzg7DAQU`                                                                        |
| Priority options  | P0 `79628723` · P1 `0a877460` · P2 `da944a9c` · P3 `2355d55e`                                           |

If the project layout changes, refresh with:

```bash
gh project field-list 1 --owner locknessland --format json | jq '.fields[] | select(.name=="Status")'
gh project view 1 --owner locknessland --format json | jq '.id'
```

…and update `.specnaut/backlog-config.yml`.

## Scripts (preferred path)

```bash
.specnaut/scripts/backlog/list.sh [Status]                              # all items, optional Status filter
.specnaut/scripts/backlog/view.sh <number>                              # one issue + comments
.specnaut/scripts/backlog/add.sh "<title>" [body] [labels-csv]          # create issue + attach to project
.specnaut/scripts/backlog/add.sh --parent <num> "<title>" ...           # create sub-issue under parent epic
.specnaut/scripts/backlog/move.sh <number> <Status>                     # Backlog|Ready|"In progress"|"In review"|Done
.specnaut/scripts/backlog/clarify-comment.sh <number> "<question>"      # leave a question on the issue
.specnaut/scripts/backlog/cascade-check.sh <number>                     # epic close gate (exit 0 = safe, 11 = blocked)
.specnaut/scripts/backlog/detect-fields.sh                              # discover native Priority/Size fields
.specnaut/scripts/backlog/set-field.sh <num> <Priority|Size|IssueType> <value>  # set native field; exit 10/11 = label fallback, 12 = not on project
.specnaut/scripts/backlog/ensure-labels.sh                              # idempotently bootstrap semantic labels
```

For closing or editing, use `gh` directly — no wrapper needed:

```bash
gh issue close  <num> --repo locknessland/lockness --reason completed   # or not_planned
gh issue reopen <num> --repo locknessland/lockness
gh issue edit   <num> --repo locknessland/lockness --title "…" --body "…" --add-label "…" --remove-label "…"
```

## Two paths to GitHub: MCP (preferred) and shell (always available)

When the **GitHub MCP server** is wired in Claude Code (`/mcp` to set up the
cloud connector, or `.mcp.json` for self-hosted), the PO subagent should prefer
the structured `mcp__github__*` tools (`mcp__github__list_issues`,
`mcp__github__create_issue`, `mcp__github__add_issue_comment`,
`mcp__github__get_issue`, etc.). They return JSON, no shell parsing needed.

Otherwise the PO falls back to the shell scripts above. The skill is path-aware:
switching MCP on/off requires no Specnaut change.

## Why we don't use `gh project item-list`

`gh project item-list 1 --owner locknessland` and the equivalent
`viewer.projectV2(1).items` GraphQL field can return 0 items in some
account/permission contexts even when items genuinely exist (verified via direct
node queries). The scripts query via `repository.issues[].projectItems[]`
filtered by `project.number == 1`. Same data, reverse path through the graph.

## Conventions

- **Titles** — short imperative phrases ("Add docx skill", not "I want to add a
  docx skill"). Lowercase OK; no leading emoji.
- **Bodies** — once clarified, follow `## Why` / `## Acceptance criteria` /
  `## Out of scope` / optional `## Notes`. Keep it tight; half a page beats a
  vague essay. Briefs include a `## Domain Model` block (see PO agent).
- **Classification is mandatory** — every created or clarified item exits with
  **Size, Priority, Issue Type, and ≥1 classifying label**. `Priority` and
  `Size` are native Project V2 single-select fields; `Issue Type` (`Task` /
  `Bug` / `Feature`) is a native org-level concept. Write all three through
  `set-field.sh` and **NEVER also apply a matching `priority:*` / `size:*` /
  `type:*` label** when the native field is set — dual-signal drift is exactly
  what the helper exists to prevent. Labels are reserved as a fallback for
  projects/orgs without the native field. Exit codes: `10` = field/type absent
  (label fallback), `11` = value unrecognised (add option or fix call), `12` =
  issue not on project.
- **Priority** — Project #1 has a separate `Priority` single-select field. Use
  it (alongside Status) when ordering the backlog. Status alone carries workflow
  state, not order.
- **Drafts** (project items with no underlying issue) are not used. Every task
  is a real issue.
- **Closing** — close the issue (don't just move to Done). For GitHub: always
  `move.sh <num> Done` BEFORE `gh issue close <num>` (two-step). Repo issue
  history is the audit trail.
- **English-only persisted artifacts** — titles, bodies, AC are written in
  English. Chat replies may be in the user's language.

## Epics & sub-tasks

Big work that needs decomposition lives as a parent **epic** with one or more
**sub-tasks**. GitHub native sub-issues API:
`gh api -X POST .../issues/<parent>/sub_issues`. Project V2 boards render
children under the parent's `Sub-issues progress` field.

- **Creating a child:** `add.sh --parent <num> "<title>"` — writes the link,
  attaches to the project, fails fast (exit 3) if parent doesn't exist.
- **Closing a parent:** `cascade-check.sh <num>` is the close gate — exits 11
  with open children listed when unsafe, 0 when all children closed. PO must run
  it before `gh issue close`.
- **Auto-detection:** the PO proactively detects epic-worthy requests (>5 AC
  bullets, scope crosses ≥2 subsystems / bounded contexts, trigger phrases like
  "break down" / "phased" / "as an epic") — see the "Epic detection heuristic"
  in `.claude/agents/product-owner.md`.

## When NOT to use this skill

- The user is implementing a backlog item — that's normal coding work; only
  return here when they want to update the item's status afterwards.
- The user asks about another repo's backlog — this skill is hard-wired to
  `locknessland/lockness` and Project #1.

## Troubleshooting

- `gh: Not Found (HTTP 404)` on a project command → confirm `gh auth status`
  shows the `project` scope. If missing: `gh auth refresh -s project`.
- An issue is on the repo but not on the project board →
  `gh project item-add 1 --owner locknessland --url <issue-url>`.
- The Status field/option IDs above don't match a query result → the project
  layout was edited; refresh with the commands above and update
  `.specnaut/backlog-config.yml` (and re-cache IDs on next script run).
