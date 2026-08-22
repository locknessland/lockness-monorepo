#!/usr/bin/env bash
# Create an annotated SemVer git tag.
#
# Two modes, picked by whether a commit-sha argument is passed:
#
#   tag.sh [--bump <major|minor|patch>] [--no-push]
#     Bump-driven mode (Lockness default). Defers SemVer math to
#     `deno task bump` (scripts/bump.ts), which updates `deno.jsonc`,
#     every `packages/*/deno.json`, inter-package `jsr:@lockness/*`
#     imports, and stub files in one atomic step. The script then
#     commits those changes as `chore(release): vX.Y.Z` and tags the
#     new commit. This is what `/specflow tag-version` runs.
#
#   tag.sh [--bump <major|minor|patch>] [--no-push] <commit-sha>
#     Manual mode. Tags an existing commit. No file edits, no commit.
#     SemVer math runs locally from the latest tag.
#
# `publish.yml` triggers on `release: published`, so the JSR publish
# happens after `/specflow release-version` creates the GitHub release
# from the tag this script produced.
set -euo pipefail

NO_PUSH=false
BUMP="patch"
COMMIT=""
BUMP_FILES=true
while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-push) NO_PUSH=true; shift ;;
    --bump) BUMP="$2"; shift 2 ;;
    --bump=*) BUMP="${1#--bump=}"; shift ;;
    --help|-h)
      echo "usage: tag.sh [--no-push] [--bump <major|minor|patch>] [<commit-sha>]"
      exit 0
      ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) COMMIT="$1"; BUMP_FILES=false; shift ;;
  esac
done

case "$BUMP" in
  major|minor|patch) ;;
  *) echo "invalid --bump value: $BUMP (must be major|minor|patch)" >&2; exit 2 ;;
esac

git fetch --tags --quiet 2>/dev/null || true

if [ "$BUMP_FILES" = "true" ]; then
  # Refuse to bump on a dirty tree — we must not mix unrelated edits into the release commit.
  if ! git diff-index --quiet HEAD --; then
    echo "working tree has uncommitted changes — commit or stash before tagging" >&2
    exit 1
  fi

  echo "→ deno task bump --$BUMP (monorepo-wide version update)"
  deno task bump --"$BUMP"

  VERSION=$(grep -E '^\s*"version"\s*:' deno.jsonc | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
  if ! printf '%s' "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "could not parse new version from deno.jsonc after bump (got: '$VERSION')" >&2
    exit 1
  fi
  NEW="v${VERSION}"

  if git rev-parse "$NEW" >/dev/null 2>&1; then
    echo "tag '$NEW' already exists — refusing to clobber" >&2
    exit 1
  fi

  if git diff-index --quiet HEAD --; then
    echo "deno task bump produced no file changes — refusing to create an empty release commit" >&2
    exit 1
  fi

  git add -A
  git commit -m "chore(release): $NEW"
  COMMIT_SHA=$(git rev-parse HEAD)
else
  LATEST=$(git tag --list 'v*.*.*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n1 || true)
  if [ -z "$LATEST" ]; then
    echo "manual tag mode requires at least one existing SemVer tag — drop the commit-sha argument to use bump-driven mode" >&2
    exit 1
  fi
  CURRENT="${LATEST#v}"
  IFS=. read -r MAJOR MINOR PATCH <<< "$CURRENT"
  case "$BUMP" in
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    patch) PATCH=$((PATCH + 1)) ;;
  esac
  NEW="v${MAJOR}.${MINOR}.${PATCH}"
  if git rev-parse "$NEW" >/dev/null 2>&1; then
    echo "tag '$NEW' already exists — refusing to clobber" >&2
    exit 1
  fi
  COMMIT_SHA=$(git rev-parse "$COMMIT")
fi

if ! printf '%s' "$NEW" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "computed tag '$NEW' failed SemVer validation" >&2
  exit 1
fi

SUBJECT=$(git log -1 --format=%s "$COMMIT_SHA")
echo "→ creating annotated tag $NEW on $COMMIT_SHA"
echo "    subject: $SUBJECT"
git tag -a "$NEW" -m "Release $NEW

$SUBJECT" "$COMMIT_SHA"

if [ "$NO_PUSH" = "true" ]; then
  echo "✓ tagged $NEW (local only — --no-push)"
elif git remote get-url origin >/dev/null 2>&1; then
  if [ "$BUMP_FILES" = "true" ]; then
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    git push origin "$CURRENT_BRANCH"
  fi
  git push origin "$NEW"
  echo "✓ tagged $NEW and pushed to origin"
else
  echo "✓ tagged $NEW (no origin configured — tag is local-only)"
fi
