
## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).
Common natural-language requests:

- `/specnaut tag-version` — tag HEAD with the next version
- `/specnaut tag-version <sha>` — tag a specific commit
- `/specnaut tag-version --bump minor` — SemVer projects only: bump
  minor instead of patch (also `--bump major` / `--bump patch`)
- `/specnaut tag-version --no-push` — skip pushing to `origin`

## What this command does

Creates an annotated git tag using the **versioning scheme baked into
this project at `specnaut init`** (one of SemVer `v1.2.3` or date-based
`vYY.M.Da`).

The bundled script does all the work:

```bash
bash .specnaut/scripts/release/tag.sh "$@"
```

What the script does:

1. Runs `git fetch --tags --quiet` so the next-tag computation sees
   every tag that already exists on `origin`.
2. Computes the next tag from the project's scheme:
   - **SemVer** — finds the latest `v*.*.*` tag, applies the bump
     direction from `--bump` (default `patch`), validates the result.
   - **Date-based** — computes today's `vYY.M.D` prefix (no leading
     zeros), scans existing tags for today, increments the letter
     suffix (`a` → `b` → … → `z`, then errors out at 26 same-day tags).
3. Creates an annotated tag with the commit subject in the message.
4. Pushes to `origin` if a remote is configured (use `--no-push` to
   skip).

## What this command does NOT do

- It does **not** create a GitHub / GitLab release — pushing a tag
  alone does not publish a release. Run `/specnaut release-version`
  after this to publish the categorized release notes.
- It does **not** deploy anything. A tag push never ships to
  production — in the recommended model, deploys are triggered by a
  *published release*, not by tags or branch pushes. See
  `/specnaut release-version` → "From release to production (CD)".
- It does **not** run tests, lint, or any quality gate. Run those
  yourself before tagging if your project needs them — the contract
  there is project-specific and lives outside Specnaut's tag/release
  flow.

## Lockness override — `tag.sh` DOES bump version files

The generic Specnaut doctrine is "the git tag is the version, the
script does not touch `package.json` / `deno.json` / etc." **This
project overrides that.** In bump-driven mode (no `<commit-sha>`
argument), `tag.sh` runs `deno task bump --<bump>`, which atomically
rewrites `deno.jsonc`, every `packages/*/deno.json`, all
`jsr:@lockness/*` inter-package imports, and every stub file. The
script then commits those changes as `chore(release): vX.Y.Z` and tags
that commit.

Why: JSR publishes from the `version` field in each `deno.json` — not
from git tags. Tagging without bumping would publish stale versions.
See `.claude/agents/devops-sre/runbook.md` for the full release
pipeline.

Manual mode (`tag.sh <commit-sha>`) skips the bump step and keeps
Specnaut's original "tag an existing commit" semantic.

## After running

If the script exits non-zero, read the stderr message — it says
exactly what failed (validation regex, missing remote, exhausted
letter suffix, missing tag).

On success, suggest `/specnaut release-version` as the natural next
step. Do NOT run it automatically — releasing is an explicit,
deliberate user action.
