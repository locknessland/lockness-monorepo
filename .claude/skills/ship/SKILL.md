---
name: ship
description: One-shot release of the Lockness framework — push behind the full gate, bump every package in lockstep, tag, and publish the GitHub Release that triggers the JSR publish workflow. Delegates each step to the skill that already owns it (/git, /specnaut tag-version, /specnaut release-version) rather than keeping a second copy. Encodes the standing decisions — why versioning is lockstep, and why publishing needs explicit consent every time. Use on "/ship", "release", "publie", "sors une version", "tag and release".
argument-hint: [patch|minor|major] [--dry-run]
allowed-tools: Bash(git status *) Bash(git log *) Bash(git tag *) Bash(git rev-parse *) Bash(gh release *) Bash(gh run *) Bash(deno task *) Read Grep Glob Skill
---

# `/ship` — release the framework

This skill **owns no procedure**. Every step below already has a home, and
duplicating one is how the two copies drift:

| Step | Owner |
| :--- | :---- |
| Pre-flight, gate, push | **`/git push`** |
| Version bump + annotated tag | **`/specnaut tag-version`** |
| Categorised notes + GitHub Release | **`/specnaut release-version`** |
| Actual JSR publish | `.github/workflows/publish.yml`, on `release: published` |

`/ship` exists to run them in the right order, once, and to hold the standing
decisions so they are not re-litigated every release.

## ⛔ Before anything: publishing is irreversible and public

A GitHub Release triggers `publish.yml`, which runs `deno publish` for **all 27
packages**. JSR versions cannot be unpublished.

**Require the user's explicit consent in this session, every time.** Not implied
by "ship it" from a previous release, not implied by an approved plan, not
implied by the user having asked for this skill to exist. If consent for *this*
release has not been given in words, stop at the tag and ask.

`--dry-run` runs everything up to and including the tag, and stops before the
release. Prefer it when unsure.

## The state of the rail

**The pipeline works.** `v0.2.0` shipped on 2026-08-31 — the repository's first
tag and first release — and all 27 packages are on JSR with Sigstore provenance.
[#122] and [#134] are closed.

Getting there hit four blockers. Three are now guarded by checks; **the fourth
recurs every time a package is added**, so read it before any release that
introduces one.

### 1. Every package must EXIST on JSR before it can be published

`deno publish` is **atomic across the workspace**: one package the registry has
never heard of aborts all 27. `@lockness/scheduler` was new and stopped the
first attempt dead.

```bash
deno task publish:check --registry
```

It prints `https://jsr.io/new?scope=lockness&package=<name>` for anything
missing. Creating the package is a manual step in the JSR UI — nothing here can
do it for you.

### 2. Every package must LINK to this repository

JSR authorises GitHub Actions publishing through OIDC by matching the package's
`githubRepository` against the repo running the workflow. Mismatched or unset,
publishing fails with:

```
Failed to publish @lockness/hono@0.2.0: The actor that this request was
authenticated for is not authorized to access this resource. (actorNotAuthorized)
```

This is what a **newly created package** looks like: JSR creates it unlinked.

```bash
deno task jsr:link --dry-run                 # read-only, no token
JSR_TOKEN=jsrt_xxx deno task jsr:link        # writes the link
```

The token needs **full API access**, not the package-scoped variant — writing
package settings is refused with `missingPermission` otherwise. It is needed
only for this one operation: publishing itself uses OIDC and no secret. Revoke
it afterwards.

### 3 and 4. Manifests and resolution — already guarded

Every real import must be declared in its own package's `deno.json`, and each
package must resolve standalone outside the workspace. `deno task deps:analyze`
(check B) and `deno task publish:check` enforce both, and `publish.yml` runs
them before `deno publish`. Nothing to do by hand.

### Verify the state before starting

```bash
git tag -l | tail -3
gh release list --limit 3
deno task publish:check --registry     # must exit 0
```

## Steps

### 1. Push, behind the full gate — delegate to `/git`

Invoke the `git` skill with `push`. Do not reimplement the gate; it is defined
in `.claude/skills/git/references/push.md` and that is the only copy.

If the pre-flight returns STOP paths, stop here and surface them. A release is
the worst possible moment to guess whether an uncommitted file belongs.

### 2. Bump and tag — delegate to `/specnaut tag-version`

```
/specnaut tag-version --bump <patch|minor|major>
```

The Lockness override is already documented in that phase: in bump-driven mode
it runs `deno task bump --<bump>`, which rewrites the root `deno.jsonc`, all 27
`packages/*/deno.json`, every `jsr:@lockness/*` inter-package specifier, and
every stub file, atomically.

**Do not pass `--no-verify` here on the reasoning that the push already ran the
suite.** The bump *rewrites 27 manifests and every inter-package specifier*
between the push and the tag, so the tree at tag time is not the tree that was
tested. Run the gate again.

### 3. Release — delegate to `/specnaut release-version`

Only after explicit consent (see above). This is the step that publishes.

The notes must state that numbering continues from `0.1.30` published under the
retired repository, so the JSR version history stays readable.

### 4. Watch — and never read the run through a pipe

```bash
gh run watch <run-id> --repo locknessland/lockness-monorepo --exit-status >/dev/null 2>&1
echo "EXIT=$?"
```

**Do not pipe this into `tail` or `head`.** `$?` after a pipeline is the *last*
command's status, so `gh run watch … | tail -25` reports `0` for a run that
failed. That happened on the v0.2.0 release: the publish step had failed, the
pipe returned 0, and it read as success.

### 5. Verify against JSR, not against the run

A green run is not evidence that anything was published — the first v0.2.0
attempt exited 0 through a pipe while publishing nothing at all. Ask the
registry:

```bash
for d in packages/*/; do p=$(basename "$d")
  v=$(curl -s "https://api.jsr.io/scopes/lockness/packages/$p" \
      | python3 -c "import json,sys;print(json.load(sys.stdin).get('latestVersion') or 'NONE')")
  [ "$v" = "<version>" ] || echo "  ❌ $p = $v"
done
```

Provenance should be present too — `rekorLogId` non-null on
`api.jsr.io/scopes/lockness/packages/<name>/versions/<version>`. A null there
means the publish did not come from GitHub Actions OIDC.

**A fresh version cannot be installed for 24 hours.** Deno's minimum dependency
age blocks recently published versions against supply-chain attacks. That is
expected, not a fault; `--min-dep-age 0` bypasses it for a smoke test.

## Why versioning is lockstep — and when to revisit

Every package moves to the same version on every release, even the ones with no
changes. `scripts/bump.ts` implements it. This is deliberate:

1. **The graph is dense** — 252 measured cross-package references. Independent
   versioning means resolving a compatibility matrix on every change, and JSR
   has no `peerDependencies` to express "these must match".
2. **`@lockness/core` re-exports most of the workspace.** Mismatched versions
   give a consumer two copies of `@lockness/container`, therefore **two DI
   registries** — a class of bug lockstep removes by construction.
3. **`@lockness/upgrade`** rewrites a project's specifiers to the latest
   published versions. That only makes sense if they are consistent.

The known cost is real: `@lockness/mail` goes `0.2.0 → 0.3.0` with no changes,
so **per-package semver means nothing**. The resolution is to read the version
at the *framework* level — one number is one framework release, a breaking
change anywhere is major for everyone, and the changelog lives at the root with
per-package sections. Do not try to give each package an honest semver story
while they share a number; that is the category error, not the lockstep.

**Revisit when, and only when, a package gains an independent consumer base.**
None has one today.

## Hard rules

- **Explicit consent for every publish.** No exceptions, no inheritance from a
  previous release.
- **Never publish with `deps:analyze` red.** Check B failing means at least one
  package ships a manifest a consumer cannot resolve.
- **Never hand-edit `deno.lock`** or a version field. `deno task bump` owns
  them.
- **One category per commit** still applies to everything this skill produces.
- **If a step fails, stop.** A half-released framework — tagged but not
  published, or published for some packages — is worse than an unreleased one.

[#122]: https://github.com/locknessland/lockness-monorepo/issues/122
[#134]: https://github.com/locknessland/lockness-monorepo/issues/134
