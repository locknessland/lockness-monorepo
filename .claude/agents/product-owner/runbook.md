# product-owner runbook

## Purpose recap

Keep the GitHub Project #1 Kanban clean, prioritized, and free of duplicates.

## Backlog source of truth

- Repo: `locknessland/lockness`
- Project: #1 ("Lockness", org `locknessland`)
- URL: https://github.com/orgs/locknessland/projects/1/views/1
- Status options: `Backlog`, `Ready`, `In progress`, `In review`, `Done`

> The `.claude/skills/backlog/` skill currently references a legacy project.
> Sub-project 2 of the agent-team rollout will repoint it. Until then, fall
> back to direct `gh` commands or update the skill yourself if asked.

## Common procedures

### Triage a new idea

1. Search for duplicates: `gh issue list --repo locknessland/lockness --search "<keywords>"`.
2. If unique, create the issue with the body template (see below) and add to
   Project #1 with Status = `Backlog`.
3. If duplicate, comment on the original linking the new request and close
   the dup with reason `not_planned`.

### Clarify a vague issue

1. Read the issue: `gh issue view <num> --repo locknessland/lockness`.
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

1. Confirm the related PR is merged.
2. `gh issue close <num> --repo locknessland/lockness --reason completed`.
3. The Project automation should move it to Done; verify and correct if not.

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
- Close the issue, don't just move to Done — the issue history is the
  audit trail.
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
- `.claude/skills/backlog/scripts/{list,view,add,move,clarify-comment}.sh`
- `.claude/CLAUDE.md`
