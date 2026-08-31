# Commit convention — Lockness

## The format

```
<type>(<scope>): <subject in the imperative, lowercase, no trailing period>

<body: what changed and WHY. Wrap at 72. State what was measured, not
what was assumed.>
```

`type` is one of: `feat` `fix` `chore` `docs` `refactor` `test` `build` `ci`
`style` `perf`.

`scope` is the package short name (`container`, `scheduler`, `ui`), a subsystem
(`deps`, `agents`, `codegen`), or the issue number when the commit closes one
(`96`, `134`).

## One category per commit — framework hard rule #9

This is the rule that gets broken most, because it is invisible while you work
and obvious in `git log` a month later.

A session that produced a new feature, a regenerated lockfile and updated docs
produces **three** commits:

```
feat(scheduler): arm one timer per task
chore(codegen):  lockfile + dependency graph
docs(scheduler): document the decorator and its presets
```

Not one commit called `feat(scheduler): add scheduling`.

### How to check before committing

```bash
git diff --cached --name-only
```

Read the list and ask: **would one sentence starting with a single type honestly
describe all of this?** If the honest answer needs "and", split:

```bash
git reset                       # unstage everything (mixed, keeps the tree)
git add <paths for category 1>
git commit
git add <paths for category 2>
git commit
```

`git reset --soft <base>` is the wrong tool for this — it leaves everything
staged, so a later `git add` by name is a no-op and the split silently does not
happen.

### Which category, when it is ambiguous

| Change | Type |
| :----- | :--- |
| New public API, new package, new decorator | `feat` |
| Behaviour was wrong and now is not | `fix` |
| Regenerated output (`deno.lock`, `docs/dependencies.md`, route registry) | `chore(codegen)` |
| Widening `deps.policy.jsonc` | `chore(deps)` — always its own commit |
| Prose, JSDoc-only, `AGENTS.md`, `README.md` | `docs` |
| Tests only | `test` |
| Workflow files, hooks | `ci` |
| Same behaviour, different shape | `refactor` |

A commit that fixes a bug **and** adds the test proving it is a single `fix` —
the test is part of the fix, not a separate category.

## The body carries the evidence

The body is where a reader learns why the change is right. Prefer the measured
form:

> Reproducing the published shape gave
> `TS2307: Import "@lockness/cli" not a dependency and not in import map`.

over the asserted form:

> This could break JSR consumers.

If a claim in the body was not verified, either verify it or drop it. A commit
message is the most-read documentation in the repository and the least
corrected.

## Issue references

- `Refs #134` — related, still open.
- `Closes #134` — this commit finishes it.

**GitHub does not accept a shared keyword across a list.** `Closes #1, #2, #3`
closes only `#1`. Repeat the keyword:

```
Closes #123, closes #124, closes #125
```

## Trailers

Add when the work was done in a Claude Code session:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Only when the user has asked for commits to carry it — do not add trailers
unprompted.

## What never goes in a commit

- Secrets, tokens, `.env*` contents.
- A `deno.lock` edited by hand.
- A generated file whose generator was not run (`docs/dependencies.md` written
  by hand is a lie that CI will contradict).
- Unrelated formatting churn. If `deno fmt` touched files outside your change,
  commit that separately as `style:`.
