# Push — the gate, and the failures that keep recurring

Read this before any push, including one that looks routine.

## The gate

Run from the repository root:

```bash
deno task gate
```

The step list lives in one place, `scripts/gate.ts`, behind the `gate` task in
`deno.jsonc`. The pre-push hook and CI run that same task (CI as
`deno task gate --leaks`), so there is no second copy here to drift. Read the
script for the steps; do not re-type them by hand, and do not skip one because
the diff "is only docs". A docs-only diff can still stale a generated block.

The gate needs the network: `publish:check` resolves every package against JSR,
so an offline push fails inside the gate.

**The gate must be able to fail.** Never pipe it into something that swallows
its exit code, and never append `|| true`. Judge it by its exit status, never by
printed text.

### Reading a GitHub Actions run

The same pipe trap, in the form that actually bit:

```bash
gh run watch <id> --repo <owner>/<repo> --exit-status >/dev/null 2>&1
echo "EXIT=$?"
```

Piping `gh run watch` into `tail` reports the pipe's status. On the v0.2.0
release that turned a failed publish into an apparent success, and the error was
only found by asking JSR what had actually been published.

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

`deno task hooks:install` writes the `pre-push` hook, which runs
`deno task gate`. It is the last thing between a broken tree and origin. Hooks
are shared by every worktree, so the installer writes into the repository's
common hooks directory whether it runs from the main checkout or a linked
worktree.

**Never `git push --no-verify.`** If the hook is in the way, the answer is to fix
what it found. If it is genuinely wrong, fix the hook in its own `ci:` commit.

## Order of operations

1. Pre-flight (`scripts/preflight.sh`). Exit 1 → stop and surface.
2. Commit what belongs, one category per commit.
3. Run the gate (`deno task gate`). Judge it by its exit status.
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
