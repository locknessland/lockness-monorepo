# devops-sre runbook

## Purpose recap

Get green code from `main` to JSR (and to production) safely and atomically.

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

> Both workflows use `deno-version: v2.x`. Bump with caution — pin a
> specific minor if you need stability.

## Version bump flow

The `scripts/bump.ts` script updates everything in one shot:

- Root `deno.jsonc` `version` field.
- Each `packages/*/deno.json` `version` field.
- Inter-package `imports` pointing at `jsr:@lockness/...` versions.
- Stub files in `packages/*/stubs/` referencing pinned Lockness versions.

### Usage

```bash
# Explicit version
deno task bump 0.3.0

# Or by semver bump type
deno task bump --major     # X.0.0
deno task bump --minor     # 0.X.0
deno task bump --patch     # 0.0.X
```

After running, verify:

```bash
git diff --stat   # check that all packages got the bump
deno task test    # green
```

## Release flow (JSR publish)

1. Confirm `main` is green (latest CI passed).
2. Decide the new version (semver: breaking → major, feature → minor,
   fix → patch).
3. `deno task bump <X.Y.Z>` (or with a flag).
4. Inspect the diff: `git diff`.
5. Run the local pre-publish gate: `deno fmt --check && deno lint && deno task test -A`.
6. Commit: `git commit -am "chore: bump version to <X.Y.Z>"`.
7. Push: `git push origin main`.
8. Create a GitHub Release: `gh release create vX.Y.Z --title "vX.Y.Z" --notes "<changelog>"`.
9. The `publish.yml` workflow runs and publishes to JSR.
10. Verify on https://jsr.io/@lockness — packages appear at the new version.

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
The binary requires the `public/` folder beside it. Always deploy the
entire `_dist/` directory.

### Option 3: Docker
```bash
docker build -t lockness:<version> .
docker run -p 8888:8888 --env-file .env.production lockness:<version>
```
Multi-stage Dockerfile, runs as non-root, includes health check.

## Gotchas

- The `publish.yml` workflow needs `id-token: write` permission for JSR's
  trusted publishing — do not remove it.
- Stubs reference `@lockness/...@^X.Y.Z`. After a bump, verify the
  `^`/`~` semantics are still intended; the bump script preserves them.
- `deno.lock` is generated and managed by Deno. Never edit by hand.
- Deno Deploy automatically runs TS — no compile step needed there.
- The standalone binary is platform-specific. Compile on the target OS or
  use Deno's cross-compile flags.

## References

- `.github/workflows/test.yml`
- `.github/workflows/publish.yml`
- `scripts/bump.ts`
- `docs/deployment.md`
- `docs/compilation.md`
- `Dockerfile`
- `.claude/CLAUDE.md`
- `AGENTS.md`
