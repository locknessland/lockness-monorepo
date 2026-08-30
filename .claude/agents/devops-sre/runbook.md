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

Runs on PRs targeting `main` or `develop`. Steps:

1. Checkout code.
2. Setup Deno v2.x.
3. Cache `~/.deno` and `~/.cache/deno`.
4. `deno lint`
5. `deno check`
6. `deno fmt`
7. `deno task test`

### `.github/workflows/publish.yml`

Runs on `release: published`. Steps:

1. Checkout.
2. Setup Deno v2.x.
3. `deno fmt --check`
4. `deno lint`
5. `deno task test -A`
6. `deno publish` (uses `id-token: write` permission for JSR).

> Both workflows use `deno-version: v2.x`. Bump with caution — pin a specific
> minor if you need stability.

## Release pipeline — automated via Specnaut

The full chain from "I want to ship" to "JSR has new packages" is two slash
commands. No manual `deno task bump`, no manual `gh release create`. CI does the
publish.

```
/specnaut tag-version [--bump major|minor|patch]
   └─ .specnaut/scripts/release/tag.sh
         ├─ refuses dirty working tree
         ├─ deno task bump --<bump>            ← scripts/bump.ts
         │     ├─ rewrites deno.jsonc (version + @lockness/* imports)
         │     ├─ rewrites every packages/*/deno.json
         │     └─ rewrites packages/*/stubs/*.stub
         ├─ git add -A && git commit -m "chore(release): vX.Y.Z"
         ├─ git tag -a vX.Y.Z -m "Release vX.Y.Z ..."
         └─ git push origin <branch> && git push origin vX.Y.Z

/specnaut release-version
   └─ .specnaut/scripts/release/release-github.sh
         ├─ baseline = previous DEPLOYED tag (skips tags w/o release)
         ├─ categorized notes from Conventional-Commits buckets
         └─ gh release create vX.Y.Z --notes-file -
              └─ event: release: published
                   └─ .github/workflows/publish.yml
                         ├─ deno fmt --check
                         ├─ deno lint
                         ├─ deno task test -A
                         └─ deno publish                ← JSR
```

Default `--bump patch`. `bump.ts` reads the current version from `deno.jsonc`
and increments — the latest git tag is informative but not authoritative; the
deno.jsonc field is the source of truth for "what version is next."

## File map

| Path                                                | Owner of...                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `.specnaut/scripts/release/tag.sh`                  | bump → commit → tag → push orchestration (Lockness-customized SemVer mode)    |
| `.specnaut/scripts/release/release-github.sh`       | categorized release notes + `gh release create`                               |
| `scripts/bump.ts`                                   | atomic monorepo version rewrite (`deno.jsonc`, `packages/*/deno.json`, stubs) |
| `.github/workflows/publish.yml`                     | JSR publish triggered by `release: published`                                 |
| `.github/workflows/test.yml`                        | PR gate: fmt/lint/check/test                                                  |
| `.claude/skills/specnaut/phases/tag-version.md`     | `/specnaut tag-version` skill contract                                        |
| `.claude/skills/specnaut/phases/release-version.md` | `/specnaut release-version` skill contract                                    |

## Invariants

- **Bump-driven mode never runs on a dirty tree.** `tag.sh` refuses; commit or
  stash first. The bump commit must contain only the version files.
- **The tag points at the bump commit, not before.** Any other commit would
  cause JSR to publish the old version.
- **Never run `deno publish` locally** after creating the release. CI is the
  publisher — duplicate publish will fail and pollute the audit trail.
- **Never amend a pushed annotated tag.** Tags are immutable on origin once
  pushed. If wrong: delete remote (`git push --delete origin vX.Y.Z`), delete
  local, re-run `/specnaut tag-version`.
- **Never edit `deno.lock` by hand.** It is generated.
- **Manual mode (`tag.sh <sha>`) does not bump.** It only tags existing commits
  — useful for back-tagging historical releases, never for new releases.

## Debug — symptom → cause → check

| Symptom                                                   | Probable cause                                                             | Check                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| JSR publishes the previous version                        | Tag points before the bump commit                                          | `git show <tag>:deno.jsonc` — confirm `version` matches the tag                     |
| `tag.sh` exits "working tree has uncommitted changes"     | Dirty tree (often deno-fmt hook output)                                    | `git status --short`; commit or `git stash`                                         |
| `tag.sh` exits "tag already exists — refusing to clobber" | Same version tagged before; bump didn't move the version                   | `cat deno.jsonc \| grep '"version"'` vs `git tag --list 'v*' \| sort -V \| tail`    |
| `tag.sh` exits "deno task bump produced no file changes"  | bump.ts ran but couldn't find the version field, or already at target      | Re-run `deno task bump --patch` manually and inspect                                |
| `publish.yml` doesn't trigger                             | Release not in "published" state (still draft), or workflow file edited    | GitHub UI → Releases → confirm not draft; check `on: release: types: [published]`   |
| `publish.yml` runs but `deno publish` fails on auth       | Trusted publishing not configured, or `id-token: write` permission missing | `.github/workflows/publish.yml` permissions block; JSR package "Trusted publishers" |
| `publish.yml` fails on `deno fmt --check`                 | Drift slipped past local hook                                              | Run `deno fmt` locally on the bump commit, force-push not possible — open a new tag |

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

- The `publish.yml` workflow needs `id-token: write` permission for JSR's
  trusted publishing — do not remove it.
- Stubs reference `@lockness/...@^X.Y.Z`. After a bump, verify the `^`/`~`
  semantics are still intended; the bump script preserves them.
- `deno.lock` is generated and managed by Deno. Never edit by hand.
- Deno Deploy automatically runs TS — no compile step needed there.
- The standalone binary is platform-specific. Compile on the target OS or use
  Deno's cross-compile flags.

## References

- `.github/workflows/test.yml`
- `.github/workflows/publish.yml`
- `scripts/bump.ts`
- `docs/deployment.md`
- `docs/compilation.md`
- `Dockerfile`
- `AGENTS.md`
- `AGENTS.md`
