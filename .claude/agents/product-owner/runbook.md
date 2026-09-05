# product-owner runbook

## Purpose recap

Keep the GitHub Project #2 Kanban clean, prioritized, and free of duplicates.

## Backlog source of truth

- Repo: `locknessland/lockness-monorepo`
- Project: #1 ("Lockness", org `locknessland`)
- URL: https://github.com/orgs/locknessland/projects/2/views/1
- Status options: `Backlog`, `Ready`, `In progress`, `In review`, `Done`

> The board skill is `.claude/skills/board/SKILL.md` — `backlog` was renamed and
> absorbed into it by Specnaut 4.2.0 (2026-08-31), and the old skill is deleted.
> Handles come from `.specnaut/backlog-config.yml`
> (`locknessland/lockness-monorepo`, project 2); the Lockness-specific
> conventions were ported into the board skill's project-notes section.

## Common procedures

### Triage a new idea

1. Search for duplicates:
   `gh issue list --repo locknessland/lockness-monorepo --search "<keywords>"`.
2. If unique, create the issue with the body template (see below) and add to
   Project #2 with Status = `Backlog`.
3. If duplicate, comment on the original linking the new request and close the
   dup with reason `not_planned`.

### Intake a batch of findings from a plan audit

Audit findings arrive as a list of "file these". **Dedupe against the open board before creating
anything** — the audit seats do not reliably do it, and a duplicate costs more to unwind than to
prevent.

1. `gh issue list --repo locknessland/lockness-monorepo --state open --label "domain:<context>"`
   for every bounded context the findings touch. Read the bodies, not just the titles: a finding is
   often one bullet inside an existing item's acceptance criteria.
2. For each finding, classify it as **new**, **duplicate of #N**, or **partially covered by #N**.
   Partial is the common case and the one that gets mishandled — file only the uncovered half, and
   name the covering item in the new item's `## Out of scope` and its ordering note.
3. **Verify the claim against the tree before writing it into a body.** Cite line numbers you
   personally read. Where a claim's severity depends on runtime behaviour, run it — a live probe
   settles in one turn what prose argues about for three.
4. Where a new item and an existing one would own the same fix, **one fix gets one owner**: move the
   acceptance bullet, and record the move on both items with the date.
5. Where the verification **disproves an existing item's stated conclusion**, correct the body and
   record that the original assessment was disproven, with the date and the evidence. Correct the
   conclusion; do not erase that it was held — the next reader needs to know the reasoning failed,
   not merely that it changed. A confidently-worded wrong severity is worse than a gap, because it
   tells the next developer to deprioritise.
6. Report the dedupe explicitly: "N findings → X created, Y already covered by #A/#B". Silently
   creating N items is the failure mode.

Measured 2026-09-01: the #137 plan audits re-found two defects the #136 audits had already filed as
#138 and #139. The upstream fix is in `.claude/skills/specnaut/phases/plan-audits.md`; this
procedure is the backstop for when it does not hold.

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
4. **docs audit** — see below. Its findings go in the close comment.

#### The docs audit

Run it on every close where the merge changed a **public API** or **user-visible
behaviour**. Skip it, and say so in the comment, for a pure refactor, a test-only
change, or an internal fix nothing outside the package can observe.

Ask three questions, and answer each by grepping rather than by recollection:

1. **Is every new or changed public symbol named in a Markdown file?**
   `grep -rn "<symbol>" --include="*.md" .` — zero hits on a symbol a consumer is
   expected to call is the finding.
2. **Does the package's own `README.md` still describe the old surface?** The
   README is the user-facing doc for that package; `AGENTS.md` beside it is not a
   substitute, and neither is JSDoc. A generated `AGENTS.md` block updating on its
   own is precisely what makes this gap easy to miss.
3. **Does the relevant `docs/*.md` guide name the API, not just the behaviour?**
   A guide that describes what the system now does, without naming the method an
   integrator must implement to get it, reads complete and is not.

Report each gap in the close comment with its file path. **Do not open an issue
for a gap that is a prose edit** — hand it back to whoever is closing, who is one
commit away from fixing it. Open one only for the four standard reasons (a
product decision, a boundary this branch does not touch, a migration, or a fix
larger than the work being closed).

Why this is a numbered step rather than a habit: on **#271** every automated gate
was green and the generated `packages/realtime/AGENTS.md` block had refreshed
itself, so nothing anywhere flagged that `packages/redis/README.md` still
described `RedisSubscribeConnection` as `psubscribe` plus silent self-heal —
a public method (`onReconnect`) had shipped with no user-facing doc naming it,
and `docs/realtime.md` documented the new behaviour without naming the API.
Question 1 above catches exactly that, in one grep. Added 2026-09-05; this is the
step `.claude/skills/specnaut/phases/merge-close.md` refers to as the PO's
"`docs audit` line", which until now had no definition anywhere.

**⚠️ Moving to Done now CLOSES the issue.** Project #2 has an "Auto-close
issue" workflow, so the move is the close — `gh issue close` afterwards returns
"already closed". Measured 2026-08-31 on #122: `move.sh 122 Done` at 16:52:02
closed it, and the follow-up comment landed at 16:52:08, six seconds later.

Two consequences:

- The old two-step (close, then move) is one step. Closing with
  `gh issue close` alone still works but leaves Status behind, so prefer
  `move.sh`.
- **`move.sh <num> Done` is no longer a harmless status correction.** The
  mechanical-move carve-out in `.claude/skills/board/SKILL.md` lets the main
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

- `.claude/skills/board/SKILL.md`
- `.specnaut/scripts/backlog/{list,view,add,move,clarify-comment}.sh`
- `AGENTS.md`
