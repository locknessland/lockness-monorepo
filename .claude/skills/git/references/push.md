# Push — the gate, and the failures that keep recurring

Read this before any push, including one that looks routine.

## The gate, in order

Run from the repository root. **Every step must be able to fail** — never pipe a
gate command into something that swallows its exit code, and never append
`|| true`.

```bash
deno fmt --check                 # 1
deno lint                        # 2
deno check                       # 3
deno task deps:analyze           # 4
deno task agents:brief --check   # 5
deno task test                   # 6
```

What each one actually catches — this matters, because a step whose purpose you
cannot state is a step you will skip under pressure:

| # | Step | Catches |
| :- | :--- | :------ |
| 1 | `fmt --check` | Formatting drift. **Must be `--check`.** Plain `deno fmt` reformats the tree and exits 0, so it can never fail — that bug sat in CI and in the pre-commit hook. |
| 2 | `lint` | Lint rules, including `no-explicit-any` in exported APIs. |
| 3 | `check` | Type errors across the whole workspace. |
| 4 | `deps:analyze` | New import cycles; an import not declared in its own package's `deno.json` (which resolves in the workspace and breaks for a JSR consumer); an edge outside `deps.policy.jsonc`. |
| 5 | `agents:brief --check` | A package brief whose generated blocks no longer match the code. |
| 6 | `test` | The suite. |

Steps 4 and 5 are cheap and catch classes of damage the other four cannot see at
all. Do not drop them because the diff "is only docs" — a docs-only diff can
still stale a generated block.

## Checking the exit code correctly

```bash
deno task test 2>&1 | tail -3
```

`tail` returns 0 whatever the task did. `$?` after that pipeline is **tail's**
exit code, not the task's. If you pipe, either read `${PIPESTATUS[0]}` or run the
command a second time without a pipe:

```bash
deno task test >/dev/null 2>&1; echo "exit=$?"
```

This has produced untrue "the suite passes" claims here. The suite reports its
own verdict on the last line — read it (`ok | N passed | 0 failed`) rather than
trusting an exit code you did not actually capture.

## Recurring failures

### A test suite that passes alone and fails in the run

Before calling it a flake, check for **order dependence**: a test that leaves
global state behind (a registered service in the container, a configured cache
driver, an armed timer) makes the *next* test fail. The failing test is usually
not the guilty one.

```bash
deno test -A <the one file>          # passes?
deno task test                        # fails?
```

If so, look at what ran before it for a missing reset, not at the failing
assertion.

### A leaked timer does **not** fail `Deno.test`

Measured on Deno 2.9.6, in sync and async form, with and without
`--trace-leaks`: a timer left armed does not fail the test. Anything relying on
"the sanitizer would have caught it" is relying on nothing. Assert on the
owning registry's own count instead.

### `--filter` is a substring match, not an alternation

`deno test --filter 'a\|b'` matches nothing and reports "0 passed, N filtered
out", which reads like success. Run the files instead.

### The pre-push hook

`deno task hooks:install` writes `.git/hooks/pre-push`, which runs the gate. It
is the last thing between a broken tree and origin.

**Never `git push --no-verify.`** If the hook is in the way, the answer is to fix
what it found. If it is genuinely wrong, fix the hook in its own `ci:` commit.

## Order of operations

1. Pre-flight (`scripts/preflight.sh`). Exit 1 → stop and surface.
2. Commit what belongs, one category per commit.
3. Run the gate. Read the last line of each step.
4. Push.

Never run the gate on a dirty tree and then commit — you will have tested
something other than what you pushed.

## Pushing to `main`

This repository works on `main` directly for maintenance, and on a feature
branch for anything with a plan behind it. If you are on `main` and the change
is not trivial maintenance, branch first:

```bash
git switch -c <type>/<short-name>
```

Merge back fast-forward-only so history stays linear:

```bash
git switch main && git merge --ff-only <branch>
```

If the fast-forward is refused, `main` moved. Rebase the branch onto it and
re-run the gate — the gate result from before the rebase does not carry over.
