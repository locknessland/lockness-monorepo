---
name: git
description: The one entry point for git operations in the Lockness monorepo — classify the working tree, commit under the one-category rule, run scoped parallel reviews on a diff, and push behind the full quality gate. Owns the gate definition and the recurring-failure playbooks, so no other skill keeps a second drifting copy. Trigger on "/git ...", "commit", "commit ça", "pousse", "push", "merge la branche", or any request to move code between branches or to origin.
argument-hint: <preflight|commit|review|push|merge> [args]
allowed-tools: Bash(${CLAUDE_PROJECT_DIR}/.claude/skills/git/scripts/preflight.sh *) Bash(git status *) Bash(git add *) Bash(git commit *) Bash(git log *) Bash(git diff *) Bash(git rev-parse *) Bash(git rev-list *) Bash(git branch *) Bash(git merge *) Bash(git push *) Bash(deno fmt *) Bash(deno lint *) Bash(deno check *) Bash(deno task *) Read Grep Glob Agent
---

# `/git` — the one entry point for git operations

Replaces typing `git commit` / `git push` by hand. Every sub-command runs the
same pre-flight first, because the recurring damage here does not come from git
being hard — it comes from **committing or pushing a tree whose state nobody
classified**.

## Dispatch

| Input | Action |
| :---- | :----- |
| `/git` or `/git preflight` | Classify the working tree, report, change nothing |
| `/git commit [message]` | Pre-flight, then commit — **one category per commit** |
| `/git review [--scope ...]` | Parallel scoped agents over the current diff |
| `/git push` | Pre-flight → full gate → push |
| `/git merge [branch]` | Fast-forward-only merge, linear history |

## Step 1 — ALWAYS run the pre-flight first

```bash
sh "${CLAUDE_PROJECT_DIR}/.claude/skills/git/scripts/preflight.sh"
```

It is a **script, not a judgement**. "Is this uncommitted file legitimate?" asked
of a model answers differently on different days, and the cost is asymmetric: a
forgotten file is recoverable, a junk commit pollutes the history. So the answer
lives in a reviewable table.

Read the exit code, not the prose:

- **`0`** — clean, or everything dirty is AUTO/IGNORE. Proceed.
- **`1`** — at least one path is outside the table. **STOP and surface it.** Do
  not infer that a file is "probably related to the current task". That inference
  is the whole thing this design refuses to make.
- **`2`** — not a git repo / misuse.

Lines are stable and greppable: `AUTO <group> <path>`, `IGNORE <path>`,
`STOP <path>`, `CLEAN`.

### What AUTO means

`AUTO` paths may be committed unattended because membership is decided by **path
alone** and the content is generated or append-only. Commit each group as its
OWN commit so categories stay separated:

| Group | Message |
| :---- | :------ |
| `codegen` | `chore(codegen): <what regenerated it>` |
| `agent-memory` | `chore(agent-memory): <what was learned>` |

Two near-misses are deliberately **not** AUTO:

- **`packages/*/AGENTS.md`** — only its marked blocks are generated. The
  surrounding invariants and pitfalls are exactly the part a human must approve.
- **`deps.policy.jsonc`** — widening the dependency policy is a design decision
  and gets its own reviewed `chore(deps)` commit, never bundled with the change
  that wanted the widening.

## Step 2 — the sub-command

Each procedure lives in a reference file, loaded only when that sub-command
runs. Read the one you need; do not load them all.

- **`references/commit-convention.md`** — the message format, the one-category
  rule and how to check it, and the trailers.
- **`references/push.md`** — the gate, in order, with what each step actually
  catches; and the recurring failures with their recovery. **Read it before any
  push**, even one that looks routine.

## `/git review` — scoped, parallel, on the diff

A single reviewer gravitates to one class of problem. Splitting the diff across
independent lenses means each gets real attention, and they do not overlap.

Dispatch these agents **in one message** so they run concurrently, each with the
diff range and an explicit scope:

| Scope | Agent |
| :---- | :---- |
| `security` | `security-expert` |
| `architecture` | `architect-expert` |
| `tests` | `test-reviewer` |
| `conventions` | `code-reviewer` |
| `deps` | `dependency-expert` |

Default when no `--scope` is given: `security`, `architecture`, `conventions` —
plus `tests` whenever the diff touches a `*.test.ts` file or adds a source file
that has none.

Give each one the range (`git diff main...HEAD`, or the staged diff for a
pre-commit review) and the package boundaries the change touches. For a change
confined to one package, prefer a single `package-expert` dispatch naming that
package — it loads the package's `AGENTS.md` and dependency contract, which the
generic reviewers do not.

**Findings are input, not a verdict.** Report them grouped by severity and let
the human decide. Never auto-apply a review finding inside `/git push`.

## When the pre-flight says STOP

Report the classification and the exact commands you would run, then stop. Ask
which STOP paths belong in this change. **Never stage a STOP path on your own
initiative** — including when it "obviously" belongs to the task in progress.

## Composition

`/ship` delegates its push step here rather than keeping a second, weaker copy.
The chain is:

```
/ship → /git push → /specnaut tag-version → /specnaut release-version
```

`/git` is the single owner of gate and failure knowledge. When a new failure
mode is found it is recorded in `references/push.md` — **one place** — so the
other skills cannot go stale against it.

## Hard rules

- **One category per commit** (framework hard rule #9). A session spanning
  `feat` + `chore` + `docs` produces three commits, not one.
- **Linear history.** Fast-forward when possible; never create a merge commit
  that a fast-forward would have avoided.
- **Never hand-edit `deno.lock`** (hard rule #6). It is regenerated by a `deno`
  command; if it is dirty for any other reason, that is a `STOP`.
- **Never `|| true` a gate command.** Suppressing an exit code so a script keeps
  going has produced untrue "done" claims in this repository more than once. If
  a step can fail, its failure must be able to stop the run.
- **Never push to `main` without the full gate**, and never `--no-verify` on a
  push. The hooks are the last thing standing between a broken tree and origin.
