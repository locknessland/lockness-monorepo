# product-owner runbook

## Purpose recap

Keep the GitHub Project #2 Kanban clean, prioritized, and free of duplicates.

## Backlog source of truth

- Repo: `locknessland/lockness-monorepo`
- Project: #1 ("Lockness", org `locknessland`)
- URL: https://github.com/orgs/locknessland/projects/2/views/1
- Status options: `Backlog`, `Ready`, `In progress`, `In review`, `Done`

> The `.claude/skills/backlog/` skill currently references a legacy project.
> Sub-project 2 of the agent-team rollout will repoint it. Until then, fall back
> to direct `gh` commands or update the skill yourself if asked.

## Common procedures

### Triage a new idea

1. Search for duplicates:
   `gh issue list --repo locknessland/lockness-monorepo --search "<keywords>"`.
2. If unique, create the issue with the body template (see below) and add to
   Project #2 with Status = `Backlog`.
3. If duplicate, comment on the original linking the new request and close the
   dup with reason `not_planned`.

### Clarify a vague issue

1. Read the issue: `gh issue view <num> --repo locknessland/lockness-monorepo`.
2. Post a comment with specific clarifying questions.
3. Leave Status = `Backlog`. Do not move to `Ready` until the questions are
   answered and the body has the four sections.

### Promote to "Ready"

An issue is `Ready` only if it has all of:

- Imperative title (no leading emoji, lowercase OK).
- `## Why` section with motivation.
- `## Acceptance criteria` section with at least one observable criterion.
- `## Out of scope` section (can be "n/a" but must be present).

Move with the backlog skill's `move.sh` script or `gh project item-edit`.

### Close a shipped issue

1. Confirm the work actually shipped.
2. `.specnaut/scripts/backlog/move.sh <num> Done`.
3. Verify the state: `gh issue view <num> --json state,stateReason` should read
   `CLOSED` / `COMPLETED`.

**⚠️ Moving to Done now CLOSES the issue.** Project #2 has an "Auto-close
issue" workflow, so the move is the close — `gh issue close` afterwards returns
"already closed". Measured 2026-08-31 on #122: `move.sh 122 Done` at 16:52:02
closed it, and the follow-up comment landed at 16:52:08, six seconds later.

Two consequences:

- The old two-step (close, then move) is one step. Closing with
  `gh issue close` alone still works but leaves Status behind, so prefer
  `move.sh`.
- **`move.sh <num> Done` is no longer a harmless status correction.** The
  mechanical-move carve-out in `.claude/skills/backlog/SKILL.md` lets the main
  session move Status without PO judgement; that carve-out does **not** extend
  to `Done`, because it now ends the issue. Only move to `Done` when the work
  is genuinely finished.

This reverses the note that stood here from 2026-05-02 (verified against #94,
when closing left Status stuck at "In review"). The automation was added since.

## Issue body template

```markdown
## Why

<one paragraph: motivation, context, what problem this solves>

## Acceptance criteria

- [ ] <observable criterion 1>
- [ ] <observable criterion 2>

## Out of scope

- <what this issue does NOT include>

## Notes (optional)

<links, references, prior discussion>
```

## Conventions

- Imperative title: "Add X", "Fix Y", "Refactor Z" (not "I want X").
- No leading emoji in titles.
- Real issues only (not draft project items).
- Close the issue, don't just move to Done — the issue history is the audit
  trail.
- Labels are optional; Status carries workflow state.

## Gotchas

- `gh project item-list` may return 0 items in some auth contexts even when
  items exist; the backlog skill scripts work around it via the
  `repository.issues[].projectItems[]` path. If a script fails, prefer raw
  GraphQL over `item-list`.
- `gh auth status` must show `project` scope. If missing:
  `gh auth refresh -s project`.

## References

- `.claude/skills/backlog/SKILL.md`
- `.specnaut/scripts/backlog/{list,view,add,move,clarify-comment}.sh`
- `AGENTS.md`
