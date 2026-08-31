---
name: orchestrate
description: Orchestrate a backlog issue through the Lockness agent team — product-owner → architect (optional) → developer → qa-tester → code-reviewer, with docs-writer / devops-sre dispatched in parallel when relevant. Use when the user says "let's work on issue #N", "pick the top of Ready", or "orchestrate the next task".
allowed-tools: Read, Glob, Grep, Bash
---

# Orchestrate skill — Lockness agent team

Drives the main session through the standard workflow: pick a Ready issue,
dispatch to the right specialists in the right order, track status on the
Kanban, escalate to the user on blockers.

## When to invoke this skill

- User says "let's work on issue #N" / "let's pick the next one" / "what's next
  on the backlog".
- User says "orchestrate <slug>" or `/orchestrate`.
- Main session has just shipped one task and the user wants the next.

## When NOT to invoke

- The user wants to do a single specialist's job manually (e.g. "just write the
  design doc"). Spawn the specific agent directly — don't run the whole
  pipeline.
- The user is debugging or exploring without a backlog issue. Skip the pipeline.

## Workflow

The main session executes the steps below itself, spawning sub-agents via the
Agent tool.

### Step 1: Pick the issue

Spawn the **product-owner** sub-agent:

> "Give me the top issue in the Ready column of Project #2
> (`locknessland/lockness-monorepo`). Return: number, title, full body, and the
> acceptance criteria. If Ready is empty, say so."

If the PO returns "no Ready issues", report to the user and stop.

### Step 2: Decide if architect is needed

Check the issue body. Architect is **needed** unless the issue is one of:

- Pure typo or doc fix.
- Version bump (`deno task bump`).
- Mechanical rename across files.
- Stub regeneration after a deterministic CLI change.

If architect is **not needed**, jump to Step 4.

### Step 3: Spawn architect

Spawn the **architect** sub-agent:

> "Design issue #<num>: <title>. The body is:
>
> <full body>
>
> Produce a design doc in `docs/superpowers/specs/<YYYY-MM-DD>-<slug>-design.md`
> per your runbook. Return the doc path + a 5-line summary + a rough list of
> files the developer will likely touch."

Wait for the design doc. If the architect escalates (size, hard trade-off,
missing pre-req), surface that to the user and stop.

Ask the PO to move the issue to "In progress":

> "Move issue #<num> to 'In progress'."

### Step 4: Spawn the implementer

Pick the right implementer based on the diff scope (the architect's design doc
should name one — if not, decide here):

- **developer** — product code: `app/`, `packages/*` (everything except pure
  release plumbing). Uses `isolation: worktree`.
- **devops-sre** — release/CI plumbing: `scripts/bump.ts`,
  `.github/workflows/*`, `Dockerfile`, root-level `deno.jsonc` changes that are
  release-related. No worktree (works on a normal feature branch).

If unsure, default to **developer**. Both follow the same TDD discipline; the
split is who owns the file area being changed.

Spawn the chosen implementer:

> "Implement issue #<num>: <title>. <If design doc exists, point at it; else
> point at the issue body>. Follow your TDD runbook. When done, return the
> branch name, the commit list, and the pre-completion gate result."

Wait for the implementer. If they escalate (test that should pass keeps failing,
lock-file change required), surface to the user and stop.

### Step 5: Spawn qa-tester (and docs-writer / devops-sre in parallel if relevant)

Determine parallel dispatches:

- **docs-writer** — needed if the diff touches files exported from any `mod.ts`,
  public signatures, stubs, or documented behavior. Skip for pure internal
  refactors.
- **devops-sre** — needed if the diff touches `.github/workflows/`, the
  `Dockerfile`, `scripts/bump.ts`, `deno.json` of the root, or anything
  release-relevant.

Spawn all needed sub-agents in **parallel** in a single message:

> qa-tester: "Validate the developer's branch <branch> against issue #<num>'s
> acceptance criteria. Add integration tests if needed. Return the validation
> report and a verdict."
>
> docs-writer: "Issue #<num> shipped on branch <branch>. Diff touched
> <list of files>. Update docs everywhere needed per your runbook. Return the
> list of files modified."
>
> devops-sre: "Issue #<num> shipped on branch <branch>. Diff touched
> <CI/release-relevant files>. Update workflows / scripts / Docker as needed.
> Return what changed."

If qa-tester returns ❌, loop back to Step 4 with the qa report.

### Step 6: Spawn code-reviewer

Spawn the **code-reviewer** sub-agent:

> "Review the diff on branch <branch> against `main`. Apply your full runbook
> checklist. Return verdict ✅/❌ + findings."

If verdict is ❌, loop back to Step 4 with the reviewer's findings. If ✅,
continue.

### Step 7: PR + status update

Open a PR (the developer or main session can use `gh pr create`). Then spawn the
**product-owner**:

> "Issue #<num>: PR opened at <url>. Move issue to 'In review'."

When the PR is merged (manually by Kevin, or via `gh pr merge` if authorized),
spawn PO again:

> "PR for issue #<num> merged. Close the issue with reason 'completed'."

### Step 8: Report

Summarize for Kevin:

- Issue #, title.
- Branch, commits, PR URL.
- Tests added (unit + integration).
- Docs updated.
- CI/release impact.
- Final status on Kanban.

## Escalation rules

Stop the pipeline and surface to Kevin when:

- PO reports an empty Ready column (nothing to do).
- Architect flags a hard trade-off, missing pre-req, or that the issue needs
  splitting.
- Developer flags a stuck failing test or a forced lock-file change.
- QA reports a contradiction between issue and design.
- Reviewer ❌ persists after 2 dev iterations.

## Conventions

- One issue at a time. If parallel issues are desired, run two main sessions (or
  use Claude Code's agent-teams once it leaves experimental).
- Always commit after each green TDD cycle (developer's responsibility).
- Always update Kanban Status promptly via PO — don't let it drift.

## References

- `.claude/agents/<name>.md` for each role.
- `.claude/agents/<name>/runbook.md` for each role's procedures.
- `.claude/skills/board/SKILL.md` for backlog scripts (used by PO).
- `AGENTS.md` for project hard rules.
- `docs/superpowers/specs/2026-05-02-agent-team-architecture-design.md` — this
  skill's own design doc.
