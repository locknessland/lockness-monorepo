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
   ├─ /ship step 3            → draft Release → composed body; publishing the draft is the consent-gated act
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
with no changes. `deno task bump` does it atomically: the root `deno.jsonc`, all
27 `packages/*/deno.json`, and every `jsr:@lockness/*` inter-package specifier.

**The engine is Deno's native `deno bump-version` (Deno ≥ 2.8).** In workspace
mode with an increment (`--patch` / `--minor` / `--major`), it applies one
shared increment to every member and rewrites the cross-package `jsr:`
constraints in place — the lockstep model, natively. `scripts/bump-native.ts` is
a thin wrapper that maps our interface (`--patch` / `--minor` / `--major`, a
bare `patch` / `minor` / `major` keyword, or an absolute `X.Y.Z` that is one
clean step from the current version) onto it. Adopting it (issue #162) retired
most of the hand-rolled `scripts/bump.ts`, which had a latent bug — it dropped
the subpath from a versioned specifier, collapsing `@lockness/hono/jsx-runtime`
onto the base export.

`scripts/bump.ts` survives as `deno task bump:legacy`, its subpath bug fixed,
for the two things native cannot do: set an arbitrary version in one jump, and
serve as a fallback while `deno bump-version` is still flagged experimental.
Neither tool touches stub files — no stub carries a version pin today.

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
breaking change anywhere is major for everyone, and every release lists its
breaking changes in one place, its GitHub Release (see
[Release history](#release-history)). Do not try to give each package an honest
semver story while they share a number; that is the category error, not the
lockstep.

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

One check holds the line, and it must be green before a release:
`deno task publish:check`. It copies each package out of the workspace and
type-checks it alone, so an undeclared import of any kind — `@lockness/*`,
`@std/*` or third-party — fails there; it is what caught `@lockness/cli`
importing an undeclared `@std/jsonc`. It fails closed: the only failure it
tolerates is a `@lockness/*` version that is not on JSR yet, and anything it
does not recognise is red. It resolves against JSR, so it needs the network.

`deno task deps:analyze` does **not** check declarations. It had a "check B"
that claimed to, and it was removed (#388): it read an import-map alias's
_value_ as a declaration while Deno resolves by _key_, and it only saw
`@lockness/*` imports — so it could not have caught the `@std/fs` half of #385.

## Read-only package mirrors

Each package is also published to `locknessland/<package>` as a **generated shop
window**. `deno task mirror` does it.

Why they exist: a monorepo gives no per-package GitHub presence, so someone
searching for "deno scheduler" lands on nothing. The mirrors answer that, and
nothing else — **they are never used to publish**. Publishing stays atomic from
the monorepo, with OIDC provenance. This is the Laravel / Symfony shape
(`illuminate/database` is literally described `[READ ONLY] Subtree split ...`),
minus their reason for it: Composer resolves from git, JSR does not.

| Property     | Value                                                                 |
| :----------- | :-------------------------------------------------------------------- |
| History      | **one commit per release**, subject `Release v<version>`              |
| Root         | the package directory itself — `mod.ts`, not `packages/<name>/mod.ts` |
| Tag          | `v<version>`, matching the monorepo                                   |
| Description  | `[READ ONLY] … Source, issues and pull requests: <monorepo>`          |
| Issues / PRs | **on the monorepo**, never on a mirror                                |

**Not `git subtree split`.** That replays every monorepo commit that ever
touched the directory. Each sync instead builds a single commit whose _tree is_
the package directory, with `git commit-tree`, parented on the mirror's previous
commit — so the history reads as a list of releases.

```bash
deno task mirror --dry-run    # report, touch nothing
deno task mirror --create     # create any missing mirror repository
deno task mirror              # sync every package at the current version
deno task mirror --flatten    # initial import only: one commit, no parent
```

`--flatten` drops the parent, so it rewrites a mirror's history. It is for the
first import; do not use it afterwards, or the release history disappears.

A contributor who only cares about one package can still work from the monorepo
cheaply: `deno test -A packages/session/` runs that package's suite in under a
second, and cross-package changes — the majority, given 252 cross-package
references — are only possible there.

## Version history

Versions `0.1.x` up to and including **`0.1.30`** were published from the
retired repository. Numbering continues from there — `0.2.0` is the first
release cut from `locknessland/lockness-monorepo`. Every Release body says so in
its first line, which `deno task release:notes` emits, so the JSR version
history stays readable across the migration.

## Release history

**The GitHub Release for tag `v<X.Y.Z>` is the framework's one changelog.**
There is no `CHANGELOG.md`, at the root or in any package. The Release is the
home because it exists for every version by construction — publishing it is what
triggers `publish.yml` — and because shipped code and docs already point there:
`@lockness/upgrade` prints the Releases list, and the README and the docs index
link it. A second file would be a second copy, free to drift from the first.

**A breaking change is recorded once, in the guide of the package that owns it,
in the same PR as the change.** It is a `### N.` item under
`## Upgrading to v<X.Y.Z>`, where `X.Y.Z` is the next unreleased version. The
heading is level 2 and its text is exactly that form; a heading that reads like
one without being it (`## Upgrading to 0.4.0`, `## Upgrade to v0.4.0`) is
refused. The item is not hand-written into the Release, not copied into a README
or an `AGENTS.md`, and a `!` commit marker is not the record.

**A released section is frozen.** Once `v<X.Y.Z>` is tagged, its section never
gains a title: the Release that shipped did not list it, so an item added
afterwards reaches no reader. Retitling counts as adding. Pruning, removing a
title, fixing prose and moving the guide all pass.
`deno task release:notes
--check` enforces this before every tag.

**Links are pinned to the tag.** Each guide in a Release is linked at
`blob/v<X.Y.Z>/…`, so a reader lands on the instructions that shipped with that
version, not on whatever `main` says today.

**The body is composed, not written.** The breaking-change index is derived from
the guides at the tag, the notes are the only hand-written part, and the
generated commit log passes through untouched. The order itself belongs to
[`scripts/release_notes.ts`](../scripts/release_notes.ts). The reason is that
the index was once typed by hand at the moment of the irreversible publish, and
it diverged: v0.3.0's Release listed five breaking changes where its guide
recorded two. Nothing that can be derived is typed at that moment any more.

**What this does not catch.** A breaking change with no guide item is still
missed — unless a commit in the release range marks it (`type!:` or a
`BREAKING CHANGE` footer), in which case the Release refuses to say "no breaking
change is recorded". An unmarked, unrecorded change ships unlisted.

## Before any release

```bash
deno task gate
```

That is the one versioned gate — the pre-push hook and CI's `test` job run the
same task, and its step list lives in `scripts/gate.ts` only, so there is no
copy here to drift. Judge it by its exit status.

`publish.yml` runs its own pre-publish battery, adding
`publish:check
--registry`, before it publishes. It is not a formality:
`deno publish --dry-run` passes inside the workspace even for a package whose
manifest a consumer cannot resolve, so the dry run is **not** evidence.

## Irreversibility

A published JSR version cannot be unpublished. A release publishes **all 27
packages** at once. Treat every release as permanent and public, and confirm
explicitly before triggering one.
