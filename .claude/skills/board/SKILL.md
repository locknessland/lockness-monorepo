---
name: board
description: Manage this project's board — the backlog and every other status column. Add, list, view, move, clarify, groom and close items, from Backlog through Done. The backend is fixed at init time and recorded in `.specnaut/installed.lock`. Run `specnaut upgrade --backlog <new>` to switch.
argument-hint: [list|next|add|update|estimate|status|groom|brief] [args]
---

# Board skill

Use this skill when the user says "add to backlog", "list backlog", "what's
next?", "move task X to in-progress", or any backlog mutation. The exact
flow depends on the backend chosen at `specnaut init` (or the most recent
`specnaut upgrade --backlog <name>`).

**Backlog references** follow the `backlog-reference-contract` skill — read it; never restate it here.

## Dispatch

`/board [subcommand] [args]`. Absorbed from the command shim that used to
carry it, so the table and the `argument-hint` above cannot drift apart again.

| Input | Action |
| --- | --- |
| _(empty)_ or `list` | Backlog overview |
| `next` | Recommend the top 3 items, with workflow advice |
| `add <title>` | Create an item |
| `update <id>` | Update an existing item |
| `estimate <id>` | Estimate complexity |
| `status` | Dashboard summary |
| `groom` | Full grooming pass — see `groom.md` |
| `brief <id>` | Product-owner business brief |
| `<number>` | Show that item |

After any mutation (`add` / `update` / `groom` / `estimate`), commit the backlog
changes — `chore(backlog): add task NNN — <short title>`, or
`chore(backlog): update task NNN — <what changed>`. Stage only the files the
product-owner agent reports as touched. This applies to the local backend, where
the backlog is files in the repo; remote backends have nothing to commit.

## Which skill owns what

`/board` owns **backlog management**. `/specnaut` owns the specification
phases tied to the project, and code implementation, planning and review. The
line decides where a new capability lands, not where a file happens to sit
today.

## `groom`

The grooming pass — Backlog-column clarification, board drift, stale PRs — is
specified in **`groom.md`, beside this file**. Read and follow it. It is the
only copy, and `/board groom` is its only entry point — the `/specnaut`
router carries no `groom` verb. Do not restate any of it here, and do not
answer a grooming request from memory.

Orphan **spec** detection is deliberately not part of it. That reads spec
artefacts and prescribes specnaut phases, so it lives on the other side of the
line, in the specnaut skill's `phases/auto-chain.md`.

## All mutations go through the Product Owner agent

The main session does **not** run the scripts directly. Dispatch the
`product-owner` subagent for any mutation: creating items, clarifying
bodies, moving status, closing. The PO is the single owner of the backlog
lifecycle (see `.claude/agents/product-owner.md`).

The scripts under `.specnaut/scripts/backlog/` are the toolbox the PO
uses. The main session may call the read-only ones (`list.sh`, `view.sh`)
to inspect state, but every write goes through the PO.


## Backend: GitHub Issues + Project

This project's backlog lives on a GitHub Project linked to issues in the
configured repo. Configuration is read from `.specnaut/backlog-config.yml`
at runtime — fill in `repo` and `project_number` before running any
mutation.

### Configuration file

```yaml
# .specnaut/backlog-config.yml
repo: myorg/myproject              # GitHub repo (owner/name)
project_number: <N>                # GitHub Project V2 number
```

Both are placeholders; resolve the number with
`gh project list --owner <org>`. A wrong `project_number` is invisible to
`list.sh` / `view.sh` — they address the board through `repo:` alone — and
refused up front by every writing script.

### Two paths to GitHub: MCP (preferred) and shell (always available)

Two ways to talk to GitHub from this project. Pick whichever fits your
setup; the skill works either way.

#### A. GitHub MCP — preferred when available

If the **GitHub MCP server is wired up in Claude Code**, the PO
subagent should call its tools directly: `mcp__github__issue_write`,
`mcp__github__issue_read`, `mcp__github__add_issue_comment`,
`mcp__github__list_issues`, `mcp__github__search_issues`, etc. They
return structured data, no shell parsing needed.

Two ways to enable the GitHub MCP:

1. **Claude Code cloud connector (recommended)** — open a Claude Code
   session in this project, run `/mcp`, choose **GitHub**, and complete
   the OAuth flow. No file lives in this repo for that — it's stored
   in your Claude Code account.

2. **Self-hosted MCP** — add the official server to the project's
   `.mcp.json` (creates the file if absent). Specnaut does NOT scaffold
   this for you because it requires Node + a GitHub token; do it
   manually:

   ```json
   {
     "mcpServers": {
       "github": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-github"],
         "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }
       }
     }
   }
   ```

   Then restart your Claude Code session.

#### B. Shell scripts — always available

The `gh` CLI scripts under `.specnaut/scripts/backlog/` are scaffolded
unconditionally and work without MCP. They wrap `gh issue` / `gh
project` calls and read configuration from `backlog-config.yml`.

```bash
.specnaut/scripts/backlog/list.sh [Status]            # all items, optional Status filter
.specnaut/scripts/backlog/view.sh <number>            # one issue + comments
.specnaut/scripts/backlog/add.sh "<title>" [body] [labels-csv]
.specnaut/scripts/backlog/move.sh <number> <Status>   # sets Project Status field
.specnaut/scripts/backlog/clarify-comment.sh <num> "<question>"
.specnaut/scripts/backlog/detect-fields.sh                                 # discover native Priority/Size single-select fields → env lines
.specnaut/scripts/backlog/set-field.sh <num> <Priority|Size|IssueType> <value>  # set the native Project V2 field / org Issue Type; exit codes 10/11/12 signal label fallback
.specnaut/scripts/backlog/ensure-labels.sh                                 # idempotently bootstrap the 7 Specnaut semantic labels (security/refactor/docs/tech-debt/dx/performance/dependency)
```

For closing or editing, use `gh` directly:

```bash
gh issue close  <num> --repo <repo> --reason completed     # or not_planned
gh issue edit   <num> --repo <repo> --title "…" --body "…"
```

#### Decision rule for the PO subagent

When dispatched, the PO checks tool availability at runtime:

1. If `mcp__github__*` tools are visible in the session, prefer them.
2. Otherwise fall back to the shell scripts.

This means a project can switch from shell to MCP (or back) without any
Specnaut change — the skill is path-aware.

### Conventions

- **Titles** — short imperative phrases. Lowercase OK; no leading emoji.
- **Bodies** — `## Why` / `## Acceptance criteria` / `## Out of scope`.
- **Closing** — close the issue (don't just move to Done). The repo's
  issue history is the audit trail.
- **Drafts** are not used. Every task is a real issue.
- **Batch every mutation — fewest requests possible.** Creating /
  moving / closing / field-setting **multiple** items goes in **one
  batched `gh api graphql` multi-alias mutation** (`m1:`, `m2:`, …), or
  the REST batch equivalent — **never call-by-call**. Gather all node /
  field / option ids in one query, then emit a single mutation. N items
  → 1–2 requests, not N. This is the default (not an optimization): it
  is what keeps grooming inside GitHub's REST + GraphQL rate limits.
  Loop the per-item scripts only for a single item.
- **Classification is mandatory — every created or clarified item
  exits with Size, Priority, Issue Type, and at least one label.**
  `Priority` / `Size` are native Project V2 single-select fields;
  `Issue Type` (`Task` / `Bug` / `Feature`) is a native org-level
  concept. Write all three through `set-field.sh` and **NEVER also
  apply a matching `priority:*` / `size:*` / `type:*` label on an item
  that already carries the native field or type** — that dual-signal
  drift is exactly what the helper exists to prevent. Labels are
  reserved as a strict fallback for projects / orgs without the native
  field or type — or *temporarily* when the platform is rate-limiting and
  a native write cannot land; the native field is always the goal, so
  reconcile a label fallback back to it once unblocked. Non-zero exit
  codes tell the caller which fallback
  applies: `10` = field / type absent (use the label), `11` = present
  but the value is unrecognised (for Priority/Size, add the option to
  the field then re-run; for Issue Type, fix the call), `12` = issue
  not on the project / not in the repo.

### Prerequisites

For the **shell path**: the `gh` CLI must be authenticated with the
`project` scope. If `gh project` returns 404, run
`gh auth refresh -s project`.

For the **MCP path**: see "Two paths to GitHub" above.



## Epics & sub-tasks

Big work that needs decomposition lives as a parent **epic** with one or
more **sub-tasks**. The link mechanism differs per backend, but the PO
contract is the same: parents cannot close while any child is open.

| Backend | Parent → child link | Discoverability |
|---|---|---|
| local | `parent: "#NNN"` in the child's frontmatter, plus a `## Sub-tasks` cross-link added to the parent file's body | `grep -l 'parent: "#042"' .specnaut/backlog/*.md` lists every child of #042 |
| github | Native sub-issues API (`gh api -X POST .../issues/<parent>/sub_issues`) | Project V2 boards render the children automatically under the parent's `Sub-issues progress` field |
| gitlab | Scoped label `parent::#NNN` on the child (Free-tier compatible; native Epics are Premium-only) | `glab issue list --label "parent::#042" --opened` lists every child of #042 |

**Creating a child:** `add.sh --parent <num>` does the right thing on
every backend — writes the link, attaches to the project/board, and
fails fast if the named parent doesn't exist (exit 3).

**Closing a parent:** `cascade-check.sh <num>` (github + gitlab) is the
close gate — exits 11 with the open children listed when close is
unsafe, exits 0 when all children are closed. The PO must run it before
`gh issue close` / `glab issue close`. The local backend uses an
inline grep equivalent.

**Finding a child's parent:** `parent-of.sh <num>` (github + gitlab) is
`cascade-check.sh` read from the other end — given a child it prints its
parent's number and exits 0, exits **10** when the item has no parent, and
exits 3 when it could not ask. Those last two are separate codes on purpose:
"this is a standalone item" and "the lookup failed" would otherwise be
indistinguishable, and a caller branches the same way on each. Branch creation
uses it to put a whole epic on one branch.

**Auto-detection:** the bundled `product-owner` agent proactively
detects epic-worthy requests (>5 AC bullets, scope crosses ≥2
subsystems, trigger phrases like "break down" / "phased" / "as an
epic") and either auto-decomposes or proposes a concrete sub-task list
— see the "Epic detection heuristic" section in
`.claude/agents/product-owner.md`.


## When NOT to use this skill

- The user is implementing a backlog item — that's normal coding work;
  return here only when they want to update its status afterwards.
- The user asks about another project's backlog — this skill is wired to
  this project only.

---

## Lockness project notes

Ported from the retired `backlog` skill on 2026-08-31, when `specnaut upgrade`
replaced it with this one. Handles live in `.specnaut/backlog-config.yml`
(`repo: locknessland/lockness-monorepo`, `project_number: '2'`); everything
below is knowledge that config cannot carry.

### ⚠️ Moving to `Done` CLOSES the issue

Project #2 has an "Auto-close issue" workflow, so `move.sh <num> Done` **is**
the close — a following `gh issue close` returns "already closed". Measured
2026-08-31 on #122: the move at 16:52:02 closed it.

Two consequences:

- The old two-step (close, then move) is one step. Prefer `move.sh`, which
  leaves no Status drift.
- **`Done` is never a mechanical move.** The carve-out below covers
  `In progress` and `In review` only.

### Mutations go through the Product Owner — with one carve-out

The main session does not create, clarify, classify or close items directly;
it dispatches the `product-owner` agent, which owns the backlog lifecycle.

**Exempt:** a Status move to `In progress` or `In review` when it is a
deterministic step inside an established workflow (`/orchestrate` moving to
`In progress` once the architect ships, or to `In review` once a PR opens). No
judgement is involved, so no agent is needed. Creation, clarification,
classification, triage — and any move to `Done` — still go through the PO.

### `gh project item-list` returns 0 items here

`gh project item-list 2 --owner locknessland` and the equivalent
`viewer.projectV2(2).items` GraphQL field can report an empty list in some
account/permission contexts even when items exist — verified against direct
node queries. The scripts query via `repository.issues[].projectItems[]`
filtered by project number instead. Same data, reverse path through the graph.

### Persisted artefacts are English-only

Titles, bodies and acceptance criteria are written in English. Chat replies may
be in the user's language.

### Prefer REST over GraphQL

The two APIs have separate budgets: REST is 5000 requests/hour at ~1 unit per
call, GraphQL is 5000 *points*/hour and a single `updateProjectV2ItemFieldValue`
was measured at ~170 points. A bulk loop can exhaust GraphQL in 30 mutations.
Use `gh issue create/edit/close/comment` (REST) wherever both work.
