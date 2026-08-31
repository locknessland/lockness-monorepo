# Releasing Lockness

How a version of the framework reaches JSR, and the decisions behind it.

The **procedure** lives in the `/ship` skill (`.claude/skills/ship/SKILL.md`) —
this document is the model and the reasoning, so the two do not drift into two
procedures.

## The rail

```
commit on main
   │
   ├─ /specnaut tag-version   → deno task bump <version>, then an annotated tag v<version>
   │
   ├─ /specnaut release-version → GitHub Release attached to that tag
   │
   └─ release: published      → .github/workflows/publish.yml → deno publish
```

**Releases are cut from a git tag.** The tag is created first and carries the
version bump; the GitHub Release is attached to it. This was an open question
until 2026-08-31 — the repository had no tags at all, and never had any, so
nothing implied an answer either way.

**The tag alone publishes nothing.** `publish.yml` listens for
`release: published`, not for a tag push. Pushing a tag without creating a
Release is a no-op, which makes the tag a safe checkpoint: you can tag, inspect,
and decide afterwards.

## One version for the whole workspace

Every package moves to the same version on every release, including packages
with no changes. `deno task bump <version>` does it atomically: the root
`deno.jsonc`, all 27 `packages/*/deno.json`, every `jsr:@lockness/*`
inter-package specifier, and every stub file.

Why lockstep, and not per-package semver:

| Reason                                            | Detail                                                                                                              |
| :------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------ |
| The graph is dense                                | 252 measured cross-package references. Independent versions mean resolving a compatibility matrix on every change.  |
| JSR has no `peerDependencies`                     | There is no way to express "these must match".                                                                      |
| `@lockness/core` re-exports most of the workspace | Mismatched versions give a consumer two copies of `@lockness/container`, therefore **two DI registries**.           |
| `@lockness/upgrade`                               | It rewrites a project's specifiers to the latest published versions, which only makes sense if they are consistent. |

The cost is real and worth naming: `@lockness/mail` goes `0.2.0 → 0.3.0` with no
changes, so **per-package semver carries no information**. The resolution is to
read the version at _framework_ level — one number is one framework release, a
breaking change anywhere is major for everyone, and the changelog lives at the
root with per-package sections. Do not try to give each package an honest semver
story while they share a number; that is the category error, not the lockstep.

Revisit only when a package gains an independent consumer base. None has one.

## How specifiers are written

**In source: bare.** `import { addPackage } from '@lockness/cli'`.

**In each package's own `deno.json`: fully qualified and pinned.**
`"@lockness/cli": "jsr:@lockness/cli@^0.2.0"`.

This is the part that has already broken once. Inside the workspace a bare
specifier resolves by **workspace member name**, which shadows the import map
entirely — so an import that no manifest declares still works locally, and ships
a package a consumer cannot resolve:

```
TS2307: Import "@lockness/cli" not a dependency and not in import map
```

Two checks hold the line, and both must be green before a release:

- `deno task deps:analyze` — check B: every `@lockness/*` import is declared by
  the package that makes it.
- `deno task publish:check` — copies each package out of the workspace and
  type-checks it alone. This is the only check that sees non-`@lockness`
  dependencies; it is what caught `@lockness/cli` importing an undeclared
  `@std/jsonc`.

## Version history

Versions `0.1.x` up to and including **`0.1.30`** were published from the
retired repository. Numbering continues from there — `0.2.0` is the first
release cut from `locknessland/lockness-monorepo`. Release notes should say so,
so the JSR version history stays readable across the migration.

## Before any release

```bash
deno fmt --check && deno lint && deno check
deno task deps:analyze
deno task agents:brief --check
deno task publish:check
deno task test
```

`publish.yml` runs the same battery before it publishes. It is not a formality:
`deno publish --dry-run` passes inside the workspace even for a package whose
manifest a consumer cannot resolve, so the dry run is **not** evidence.

## Irreversibility

A published JSR version cannot be unpublished. A release publishes **all 27
packages** at once. Treat every release as permanent and public, and confirm
explicitly before triggering one.
