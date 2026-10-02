# devops-sre runbook

## Purpose recap

Get green code from `main` to JSR (and to production) safely and atomically.

## Branch hygiene at start

When you create a feature branch off `main` (e.g.
`git checkout -b feat/<slug>`), the repo's pre-commit hook may have left
unstaged formatting drift in `docs/` or other files from a previous commit on
`main`. Right after the branch is created:

1. Run `git status --short` — if you see `M` on files outside your task scope,
   run `git checkout -- <path>` to discard the drift on this branch.
2. Only then start the implementation. This keeps the PR diff clean for the
   code-reviewer.

## CI workflows in this repo

### `.github/workflows/test.yml`

Runs on pushes and PRs targeting `main` or `develop`. The `test` job (OS ×
Deno matrix) checks out, sets up Deno, restores the cache, and runs
`deno task gate --leaks` — the same versioned gate as the pre-push hook, whose
step list lives in `scripts/gate.ts` only. Never re-list the steps in the
workflow. Separate jobs: live Redis, coverage, starter kits, and the nightly
mutation batteries.

### `.github/workflows/publish.yml`

Runs on `release: published`. The workflow defaults to `contents: read`, and
it has three jobs (#476):

1. **`gate`** — `contents: read`, no `id-token`. Runs
   `deno task gate --registry`, the same versioned gate as everywhere else;
   `--registry` reaches its `publish:check` step only (#396).
2. **`kits`** — `contents: read`, no `id-token`. Runs
   `deno task kits:smoke --registry`, which boots every starter kit from a
   localhost-only JSR registry filled by `deno publish` (#470).
3. **`publish`** — `needs: [gate, kits]`, `contents: read` +
   `id-token: write`. Runs checkout, setup-deno and `deno publish`, and nothing
   else. The type-check is kept: no `--no-check`.

`gate` and `kits` run in parallel. Every checkout pins `ref: ${{ github.sha }}`
and `persist-credentials: false`, so the commit that was checked is the commit
that is published.

**The invariant, stated at the top of the workflow:** `id-token: write` exists
in exactly one job, and that job runs no test, project script, scaffolded kit or
third-party module. Any process in that job can request an OIDC token and
publish as `@lockness`. `publish` takes only the _verdict_ of `gate` and `kits`
through `needs:`. Never add `actions/cache`, `upload-artifact`,
`download-artifact` or job outputs that cross into it — a tag-triggered run can
restore caches `test.yml` wrote. A new check goes into `gate` (via
`scripts/gate.ts`) or a job of its own that `publish` needs, never into
`publish`.

> Both workflows use `deno-version: v2.x`. Bump with caution — pin a specific
> minor if you need stability.

## Release pipeline — through `/ship`

A release runs through `/ship` (`.claude/skills/ship/SKILL.md`), which owns the
step order; its step 3 is the one publish act. The vendored release phase
(`.claude/skills/ship/phases/release.md`) and `release-github.sh` are never run
on their own. No manual `deno task bump`, no
manual `gh release create`. CI does the publish. The diagram below shows the
mechanics each step delegates to, not a second procedure.

```
/ship step 2 → .claude/skills/ship/phases/tag.md [--bump major|minor|patch]
   └─ .specnaut/scripts/release/tag.sh
         ├─ refuses dirty working tree
         ├─ deno task bump --<bump>            ← scripts/bump-native.ts
         │     ├─ deno bump-version --workspace <inc>
         │     │     ├─ rewrites every packages/*/deno.json
         │     │     ├─ rewrites @lockness/* cross-package specifiers
         │     │     └─ does NOT touch the root's own version (#324)
         │     ├─ writes deno.jsonc's version itself, after
         │     └─ deno install → deno.lock          ← scripts/lockfile.ts (#429)
         ├─ git add -A && git commit -m "chore(release): vX.Y.Z"
         ├─ git tag -a vX.Y.Z -m "Release vX.Y.Z ..."
         └─ git push origin <branch> && git push origin vX.Y.Z

/ship step 3 → publish selected → release: published
   └─ .github/workflows/publish.yml
         ├─ gate     deno task gate --registry        ┐ parallel, no id-token
         ├─ kits     deno task kits:smoke --registry  ┘
         └─ publish  needs [gate, kits] → deno publish  ← JSR (id-token: write)
```

Default `--bump patch`. `bump-native.ts` reads the current version from
`deno.jsonc` and increments — the latest git tag is informative but not
authoritative; the deno.jsonc field is the source of truth for "what version is
next."

**`scripts/bump.ts` is NOT the release path any more** (#162). It is
`deno task bump:legacy`, kept for arbitrary version jumps the native command
cannot express as one increment; `bump-native.ts` still imports its
`updateRootJsonc` to write the root. Anything describing `bump.ts` as the
release mechanism predates the migration.

Both paths end with the same lockfile refresh, `refreshLockfile()` in
`scripts/lockfile.ts`: one command, one dry-run notice, one failure and
recovery message. A bump path that skips it leaves a release commit
`deno publish` refuses (v0.4.0's first publish; #429 for the legacy path). Both
accept `--dry-run`. `tests/bump.test.ts` runs each path against a throwaway
workspace and asserts the lockfile admits the new version.

## File map

| Path                                                | Owner of...                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `.specnaut/scripts/release/tag.sh`                  | bump → commit → tag → push orchestration (Lockness-customized SemVer mode)    |
| `.specnaut/scripts/release/release-github.sh`       | draft Release + generated log; invoked only by `/ship` step 3(a)              |
| `scripts/release_notes.ts`                          | `deno task release:notes` — upgrade-guide check, Release body composition     |
| `scripts/bump-native.ts`                            | **the** version rewrite — `deno bump-version --workspace`, plus the root's own `version` (#324) |
| `scripts/bump.ts`                                   | `deno task bump:legacy` — arbitrary version jumps; exports `updateRootJsonc`   |
| `scripts/lockfile.ts`                               | `refreshLockfile()` — the `deno.lock` refresh both bump paths end with (#429)  |
| `.github/workflows/publish.yml`                     | JSR publish triggered by `release: published`                                 |
| `.github/workflows/test.yml`                        | PR gate: `deno task gate --leaks`, plus coverage / live-broker / kits jobs    |
| `.claude/skills/ship/phases/tag.md`                 | tag phase contract, `/ship` step 2 (Specnaut 4.4.0 moved it out of `/specnaut`) |
| `.claude/skills/ship/phases/release.md`             | release phase contract (vendored; never run on its own here)                   |

## Invariants

- **Bump-driven mode never runs on a dirty tree.** `tag.sh` refuses; commit or
  stash first. The bump commit must contain only the version files.
- **The tag points at the bump commit, not before.** Any other commit would
  cause JSR to publish the old version.
- **Never run `deno publish` locally** after creating the release. CI is the
  publisher — duplicate publish will fail and pollute the audit trail.
- **Never amend a pushed annotated tag.** Tags are immutable on origin once
  pushed. If wrong: delete remote (`git push --delete origin vX.Y.Z`), delete
  local, re-run `/ship` step 2 (`phases/tag.md`).
- **Never edit `deno.lock` by hand.** It is generated.
- **Manual mode (`tag.sh <sha>`) does not bump.** It only tags existing commits
  — useful for back-tagging historical releases, never for new releases.

## Debug — symptom → cause → check

| Symptom                                                   | Probable cause                                                             | Check                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| JSR publishes the previous version                        | Tag points before the bump commit                                          | `git show <tag>:deno.jsonc` — confirm `version` matches the tag                     |
| `tag.sh` exits "working tree has uncommitted changes"     | Dirty tree (often deno-fmt hook output)                                    | `git status --short`; commit or `git stash`                                         |
| `tag.sh` exits "tag already exists — refusing to clobber" | Same version tagged before, **or** the bump moved the members and left the root behind — the #324 shape, which this guard is the only thing that catches | `cat deno.jsonc \| grep '"version"'` vs `git tag --list 'v*' \| sort -V \| tail`, then compare against any `packages/*/deno.json` — if they disagree, the root was not written |
| `tag.sh` exits "deno task bump produced no file changes"  | the bump ran but couldn't find the version field, or is already at target  | Re-run `deno task bump --patch` manually and inspect                                |
| `publish.yml` doesn't trigger                             | Release not in "published" state (still draft), or workflow file edited    | `gh release view vX.Y.Z --json isDraft`; check `on: release: types: [published]`. A draft is promoted only by `/ship` step 3(e) — never from the GitHub UI |
| `publish.yml` runs but `deno publish` fails on auth       | Trusted publishing not configured, or `id-token: write` permission missing | `.github/workflows/publish.yml` permissions block; JSR package "Trusted publishers" |
| `publish.yml`'s `gate` or `kits` job is red, `publish` skipped | A gate step or a kit boot fails on the tagged commit (drift that slipped past the local hook, or a kit-only break) | Re-run `deno task gate --registry` / `deno task kits:smoke --registry` locally on the tag; fix on `main` and cut a new tag — a pushed tag is never amended |

## Deployment options

### Option 1: Deno Deploy (recommended)

- Entry point: `main.ts`.
- Build command: `deno task routes:generate && deno task css:build`.
- Env vars (set in Deno Deploy UI or via API):
  - `APP_ENV=production`
  - `APP_PORT=8888`
  - `DATABASE_URL=postgresql://...`
  - `SESSION_SECRET=<strong-random>`

### Option 2: Standalone binary

```bash
deno task compile
# Output: _dist/lockness (~92MB) + _dist/public/
scp -r _dist/ user@server:/opt/lockness/
ssh user@server -- 'cd /opt/lockness/_dist && ./lockness'
```

The binary requires the `public/` folder beside it. Always deploy the entire
`_dist/` directory.

### Option 3: Docker

```bash
docker build -t lockness:<version> .
docker run -p 8888:8888 --env-file .env.production lockness:<version>
```

Multi-stage Dockerfile, runs as non-root, includes health check.

## Gotchas

- The `publish.yml` `publish` job needs `id-token: write` for JSR's trusted
  publishing — do not remove it, and do not grant it to any other job or add a
  step to that job (#476).
- Stubs reference `@lockness/...@^X.Y.Z`. After a bump, verify the `^`/`~`
  semantics are still intended; the bump script preserves them.
- `deno.lock` is generated and managed by Deno. Never edit by hand.
- Deno Deploy automatically runs TS — no compile step needed there.
- The standalone binary is platform-specific. Compile on the target OS or use
  Deno's cross-compile flags.

## References

- `.github/workflows/test.yml`
- `.github/workflows/publish.yml`
- `scripts/bump-native.ts`
- `scripts/bump.ts`
- `docs/deployment.md`
- `docs/compilation.md`
- `Dockerfile`
- `AGENTS.md`
- `AGENTS.md`
