# ADR 002 — How Lockness is developed and distributed

**Status:** Proposed **Date:** 2026-08-31 **Owner:** Kevin **Supersedes:**
nothing **Affects:** `scripts/jsr_link_repos.ts`,
`.github/workflows/publish.yml`, `packages/*/.github/`, `docs/releasing.md`,
repository visibility, root `LICENSE`

---

## 1. The question

Development happens in `locknessland/lockness-monorepo`, which is **private**.
All 27 packages publish to JSR from it. The proposal on the table: keep the
monorepo private as the architecture workspace, and on each version bump have CI
push every package's subtree to its own **public** per-package repo as one
squashed commit, each of which then publishes itself to JSR. Stated goals: (1)
free CI minutes, (2) open source so people can read and contribute, (3) flat
history, (4) packages tracked as submodules.

---

## 2. What I verified, and three corrections

| Claim                                           | Verdict           | Evidence                                                                                                              |
| :---------------------------------------------- | :---------------- | :-------------------------------------------------------------------------------------------------------------------- |
| 27 workspace packages                           | **Confirmed**     | `deno.jsonc:5-33`, 27 `packages/*/deno.json`                                                                          |
| Monorepo is private                             | **Confirmed**     | `api.github.com/repos/locknessland/lockness-monorepo` → 404 unauthenticated                                           |
| Full CI battery on every PR                     | **Confirmed**     | `.github/workflows/test.yml:33-52` — 8 gates                                                                          |
| Publish is release-triggered, OIDC, all-at-once | **Confirmed**     | `.github/workflows/publish.yml:3-5,10-12,66` — `deno publish` at workspace root                                       |
| Lockstep versioning                             | **Confirmed**     | `docs/releasing.md:29-54`, `deno task bump`                                                                           |
| JSR authorises Actions via OIDC + linked repo   | **Confirmed**     | JSR docs: `id-token: write`, "you must first link your package to your GitHub repository"                             |
| Provenance only from OIDC publishing            | **Confirmed**     | JSR docs: "Token-based publishing does not generate provenance attestations."                                         |
| Public repos get free Actions minutes           | **Confirmed**     | GitHub billing docs — free for public repos on standard runners                                                       |
| JSR link states (21 null, 6 stale, 0 monorepo)  | **Not verified**  | `api.jsr.io` returns 403 from this environment, as ADR 001 §2 already recorded. Taken from the session's measurement. |
| `rekorLogId` comparison, 12.7 MB, 723 tests     | **Not verified**  | Same 403 / no shell. Consistent with everything else; nothing here depends on the exact numbers.                      |
| **`locknessjs/*` is a third generation**        | **Wrong — see A** | It is the same repos under the org's former name.                                                                     |
| **18 `locknessland/*` repos are live**          | **Wrong — see B** | All 18 are empty.                                                                                                     |

### Correction A — there are two generations of layout, not three

`api.github.com/repos/locknessjs/core` returns **200** with
`full_name: "locknessland/core"`, and `api.github.com/orgs/locknessjs` returns
**404**. `locknessjs` is the org's former name; GitHub redirects the repo paths.
`locknessjs/core` and `locknessland/core` are one repository, not two
generations of one.

This does not rescue the 6 stale JSR links — it explains them. JSR stores
`githubRepository` as an owner/name pair and compares it against the OIDC
`repository` claim, which always carries the **current** name. No workflow
anywhere can ever emit `locknessjs/core` again, so those 6 packages are
unauthorisable by construction. `actorNotAuthorized` is fully explained without
any other cause.

### Correction B — every public per-package repo is empty

`api.github.com/orgs/locknessland/repos?type=public` returns 19 repos (18
packages + `docs`). **All 19 report `size: 0`.**
`api.github.com/repos/locknessland/core/commits` returns **HTTP 409**, which is
GitHub's response for "Git Repository is empty". They were bulk-created on
2025-12-22 and 2025-12-25 (timestamps 20–30 seconds apart) and never populated.

So the premise under goal (2) needs restating. It is not that the packages are
open source and the monorepo is the private part. **There is currently zero
public Lockness source code on GitHub.** The org is 19 empty shells. The owner
is right that this is a problem; he is wrong about which problem it is.

The upside of Correction B: there is no history in those repos to preserve, so
nothing is lost by deleting them.

### Correction C — the 27-workflows problem already exists, and already rotted

17 packages already carry a committed `packages/<pkg>/.github/workflows/`
`publish.yml` from the per-package era. Every one is:

```yaml
on:
    release:
        types: [published]
# ...
- name: Publish to JSR
  run: npx jsr publish
```

No fmt, no lint, no check, no `deps:analyze`, no `publish:check`, no tests — and
`npx`, in a project whose hard rule #2 is "JSR-only, not npm". They are dormant
only because nobody creates releases in empty repos. They are also **shipped
inside the JSR tarball**: `packages/core/deno.json:10-14` excludes only `tests/`
and `docs/`, so `.github/` goes to the registry.

This is the strongest available evidence about the split's maintenance cost. The
generated-workflow problem was created once already and nobody noticed it
rotting.

---

## 3. Goal 1 — the CI-cost argument does not survive

Per-PR CI must keep running where development happens. Under the proposal that
is still the private monorepo, and it is still every gate in `test.yml`. The
split moves **only** the publish job.

Rates: GitHub Free 2,000 private minutes/month, Pro/Team 3,000, overage $0.006
per Linux 2-core minute, public repos free.

| Workload                            | Where it runs after the split | Frequency       | Minutes/month  |
| :---------------------------------- | :---------------------------- | :-------------- | :------------- |
| 8-gate CI on every PR push          | private monorepo — unchanged  | every push      | the whole bill |
| Publish battery + `deno publish`    | moved to 27 public repos      | 1–4 per release | **12–48**      |
| **New:** 27-way subtree/sync matrix | private monorepo — added      | every release   | **+27–54**     |

At ~10 min/run the free allowance covers ~200 runs/month — about 6.6 pushes a
day, sustained, before a cent is billed. This repo is almost certainly at $0
today.

The measured conclusion:

- The split relocates **12–48 minutes/month**, or **~2%** of the free allowance.
  Cash value if already over quota: **$0.29/month**.
- It **adds** a 27-job sync matrix to the private repo on every release. Net
  private-minute consumption most likely **increases**.
- The alternative in §5 takes the CI bill to **exactly zero** — all of it,
  including per-PR — with no new infrastructure.

The saving is illusory, and it is negative once the sync job is counted. This
goal should be dropped from the argument entirely; it is not a weak reason for
the split, it is a reason against it.

There is a second cost inversion. `deps:analyze`, `agents:brief --check` and
`publish:check` are workspace-level by construction (§6.4) and cannot run in a
single-package mirror. So the mirrors' free CI would run a strictly **weaker**
battery than the one still being paid for privately.

---

## 4. Goal 2 — a squashed mirror cannot accept contributions

The mechanism forbids it. The sync is a force-push of a generated tree; any PR
merged into a mirror is destroyed at the next release. Porting it by hand into
the private monorepo means the contributor's commit never appears in any public
history — the mirror's `git log` is one bot commit per release, and its
contributor graph shows one bot. **Attribution is the currency of open-source
contribution, and this design pays none.**

There is no configuration that fixes this. It is what "generated read-only
mirror" means.

### What comparable projects actually do

| Project                      | Pattern                                                            | Where PRs go         | Monorepo visibility |
| :--------------------------- | :----------------------------------------------------------------- | :------------------- | :------------------ |
| **Laravel**                  | public monorepo → read-only subtree splits (`splitsh-lite`)        | `laravel/framework`  | **public**          |
| **Symfony**                  | public monorepo → read-only subtree splits                         | `symfony/symfony`    | **public**          |
| **Deno std**                 | public monorepo, ~40 `@std/*` published from it, no mirrors at all | `denoland/std`       | **public**          |
| **Babel, Angular, Nx, Jest** | public monorepo, many registry packages                            | the monorepo         | **public**          |
| **AdonisJS**                 | genuinely independent public repos per package, real history each  | each package repo    | n/a                 |
| **AOSP (post-2025)**         | private development, periodic public source drops                  | nowhere, effectively | **private**         |

`illuminate/database`'s own GitHub description is literally
`"[READ ONLY] Subtree split of the Illuminate Database component (see laravel/framework)"`.

This is the decisive observation for the proposal. Laravel and Symfony are the
two projects Lockness explicitly models itself on (`AGENTS.md`: "Heavily
inspired by Laravel and AdonisJS"), and **both do exactly the subtree-split
mirroring the owner proposes — while keeping the monorepo public.** The mirrors
exist to solve a _distribution_ constraint (Composer required one package per
repo), never to substitute for openness. The proposal borrows the mechanism and
inverts the one property that makes it work.

JSR removes even the distribution motive: `denoland/std` publishes ~40 packages
to JSR from a single public repo of 26 MB — twice this monorepo's size, same
registry, same runtime, same OIDC publish path. Mirrors buy Lockness nothing
that JSR does not already give it.

The only honest ways to get goal (2):

1. **Make the monorepo public.** PRs land where the code is. §5.
2. **Keep it private and be explicit** — label mirrors `[READ ONLY]`, route
   people to Discussions or an issues-only repo, and accept ~zero code
   contribution. That is the AOSP position; it is defensible, but it should be
   chosen knowingly, not described as "the packages become open source".

---

## 5. The alternative not named: publish the monorepo

It delivers every stated goal except the one that was already illusory, with
**zero new infrastructure**:

| Goal              | Split into 27 public mirrors                | Public monorepo                           |
| :---------------- | :------------------------------------------ | :---------------------------------------- |
| Free CI           | publish job only (~2%)                      | **100% — every PR run, free**             |
| Readable source   | yes, generated                              | yes, with history and review              |
| Real PRs          | **no** (§4)                                 | **yes**                                   |
| Provenance        | yes                                         | yes                                       |
| JSR repo links    | 27 links to maintain                        | 1 target, `jsr:link` already points there |
| Release atomicity | **lost** (§6.3)                             | preserved — `deno publish` stays atomic   |
| Workspace checks  | **unrunnable in mirrors** (§6.4)            | unchanged                                 |
| New moving parts  | sync matrix, 27 workflows, 27 releases, PAT | **none**                                  |
| Flat history      | one commit per release                      | already hard rule #9                      |

### Feasibility checklist

Work through in order; only items 1–2 can actually block.

| #  | Check                                                                                                                                                                                                                        | Status now                                                                                                                                                   |
| :- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | **Secrets in full history**, not just HEAD: `git log --all --full-history -- .env .env.production.local .idea/dataSources.local.xml .idea/workspace.xml`, then `gitleaks detect --no-git=false` or `trufflehog git file://.` | `.env` and `.env.production.local` **exist on disk**; both are in `.gitignore:2,4`. Must confirm they were never committed _before_ the ignore rule existed. |
| 2  | DB credentials in `drizzle.config.ts`, `database/`, `.env.exemple`                                                                                                                                                           | not inspected for values — do it                                                                                                                             |
| 3  | `.idea/` — `.idea/.gitignore` already excludes `workspace.xml`, `dataSources/`, `dataSources.local.xml`. Simplest fix: untrack `.idea/` entirely.                                                                            | low risk, worth doing                                                                                                                                        |
| 4  | **Root `LICENSE` file**                                                                                                                                                                                                      | **missing.** `"license": "MIT"` is declared in the root and all 27 manifests, but no LICENSE file exists. Without it the repo is not legally open source.    |
| 5  | `.claude/` + `.specnaut/` — publish or strip?                                                                                                                                                                                | recommend publish; agent tooling is increasingly a selling point, and nothing there is secret                                                                |
| 6  | GitHub **Project #2** is separate from repo visibility — decide whether the backlog goes public too                                                                                                                          | independent toggle                                                                                                                                           |
| 7  | Community files: `CONTRIBUTING.md` at root (only `docs/contribution.md` today), `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue/PR templates                                                                                      | absent                                                                                                                                                       |
| 8  | Branch protection + required status checks before opening to drive-by PRs                                                                                                                                                    | to configure                                                                                                                                                 |
| 9  | Fork-PR safety: forked PRs receive neither secrets nor `id-token: write`, so `publish.yml` cannot be triggered by an outsider                                                                                                | **already safe** — `publish.yml` is `release: published` only                                                                                                |
| 10 | Third-party asset licensing in `public/`                                                                                                                                                                                     | quick review                                                                                                                                                 |

**The migration**, if 1–2 come back clean, is Settings → Change visibility, plus
items 3–8. If they come back dirty: either `git-filter-repo` the offending
paths, or — given how young the repo is — squash to a single orphan commit and
publish from there. Both are hours, not weeks.

---

## 6. If the split goes ahead anyway

### 6.1 D1 — a sync action. Not submodules, not `git subtree split`

| Option              | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| :------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Submodules**      | **Reject — wrong data direction.** A submodule makes the parent _consume_ the child at a pinned SHA. Here the monorepo is the source and the mirrors are derived, so submodules invert the flow and create a loop: edit in monorepo → CI pushes child → parent must commit a new pointer → triggers CI again. It also breaks the Deno workspace (members must be real files in-tree), makes `deno task bump` a 28-repo atomic commit that git cannot express, and is flatly incompatible with goal (3): a squashed force-push rewrites the SHAs the parent pinned. Goals (3) and (4) contradict each other. |
| `git subtree split` | Correct direction, and what Laravel/Symfony use — but it **preserves** history, which is the opposite of goal (3), and it is O(full history) per package per release. Laravel outgrew plain `subtree split` and moved to `splitsh-lite` for exactly this reason. If you want one squashed commit, this is the wrong tool.                                                                                                                                                                                                                                                                                   |
| **Sync action** ✅  | **Recommend.** One matrix job over 27 packages in the monorepo: copy `packages/<pkg>/` into a fresh tree, inject the generated workflow, commit, force-push. Matches goal (3) exactly, no history arithmetic, one workflow file to maintain instead of 27.                                                                                                                                                                                                                                                                                                                                                  |

### 6.2 D2 — the 27 mirror workflows are generated, never authored

Template lives in the monorepo; the sync job writes it into each mirror on every
sync and force-pushes. Any hand edit in a mirror is overwritten by design, which
is the point. Correction C is the evidence: the hand-maintained version already
exists, already rotted to `npx jsr publish` with zero gates, and already ships
to JSR by accident.

Delete the 17 `packages/*/.github/` directories now regardless of this ADR's
outcome — they are dead under every option, and they are in the tarball.

### 6.3 D3 — the half-failed sync is the disqualifying risk

Today `deno publish` at the workspace root is **atomic across all 27 packages**;
`publish:check --registry` exists precisely because "one missing package aborts
all 27" (`publish.yml:56-60`).

Split into 27 repos and you get 27 independent, non-atomic publishes. Package 14
fails and JSR permanently holds a partial `0.2.0` in which
`@lockness/core@0.2.0` declares `jsr:@lockness/session@^0.2.0` against a version
that does not exist. **A published JSR version cannot be unpublished**
(`docs/releasing.md:102-106`).

With lockstep versioning over a graph of 252 measured cross-package references,
every package is on the critical path of every release. This is not a tail risk;
it is the expected failure mode, and its outcome is irreversible. Recovering
means burning a version number and shipping `0.2.1` — every time.

This single consequence is close to dispositive on its own.

### 6.4 D4 — lockstep survives authoring; the workspace checks do not survive at all

Authoring is fine: `deno task bump` keeps running in the monorepo and rewrites
root + 27 manifests + every inter-package specifier + stubs in one commit. The
mirrors receive the result. What breaks is _release_ coordination — 27 GitHub
Releases must be created to fire 27 workflows, each independently (§6.3).

The workspace-level gates cannot be salvaged:

| Check                  | Why it needs the whole workspace                                                                                                                                       |
| :--------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deps:analyze`         | Computes the cross-package graph and the tier policy. Meaningless with one package.                                                                                    |
| `agents:brief --check` | Compares all 27 briefs against the code they describe.                                                                                                                 |
| `publish:check`        | Copies each package **out of the workspace** and type-checks it alone — it already simulates the split, and it is the only check that catches undeclared dependencies. |

All three must therefore stay in the private monorepo, which is why the mirrors'
free CI is decorative (§3).

---

## 7. Recommendation

**Make `locknessland/lockness-monorepo` public. Keep publishing all 27 packages
from it. Delete the 19 empty shells. Do not build the split.**

Rejected, with reasons:

| Rejected                                                   | Why                                                                                                                                                                                                                                 |
| :--------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private monorepo + generated public mirrors                | Saves ~2% of a bill that is currently $0, adds a sync matrix that costs more than it saves, cannot accept PRs (§4), and trades atomic publishing for irreversible partial releases (§6.3).                                          |
| Private monorepo + submodules                              | Inverts the data flow, breaks the Deno workspace, and goal (4) contradicts goal (3) (§6.1).                                                                                                                                         |
| Split into 27 genuinely independent repos (AdonisJS model) | Honest, but abandons lockstep versioning, the shared DAG check, and atomic release — a far larger change than anything proposed here, for a project with no package that has an independent consumer base (`docs/releasing.md:54`). |
| Status quo (private, unpublished)                          | Leaves 0.2.0 unable to publish and 19 empty public repos advertising an abandoned project.                                                                                                                                          |

The owner is right about goal (2). Nothing about Lockness is publicly readable
today, and that should change. The disagreement is only about the mechanism: the
proposal reaches for the most complex option available, and the simplest one
delivers strictly more.

---

## 8. The immediate unblock — independent of all of the above

**Link all 27 JSR packages to `locknessland/lockness-monorepo` today.**

1. It is where `publish.yml` runs, so the OIDC `repository` claim matches. It is
   the only value under which 0.2.0 publishes at all.
2. **It forecloses nothing.** `githubRepository` is a mutable `PATCH` field —
   `scripts/jsr_link_repos.ts:82-101`. If the model changes later, change
   `OWNER`/`REPO` at lines 36-37 and re-run. Cost of reversal: one command.
3. The 6 stale `locknessjs/*` links are wrong under **every** option — those
   repos are empty and the org name no longer resolves (Correction A).
4. **The tooling already exists and already hardcodes the recommendation.**
   `deno task jsr:link` targets `locknessland/lockness-monorepo` at
   `scripts/jsr_link_repos.ts:36-37`. It needs `JSR_TOKEN` and nothing else.

```bash
JSR_TOKEN=jsrt_xxx deno task jsr:link --dry-run   # enumerate first
JSR_TOKEN=jsrt_xxx deno task jsr:link
```

Run `--dry-run` first for a reason beyond caution: the script reports
`not on JSR — create it first`, and "unlinked" is not the same as "exists".
`deno publish` is atomic across 27, so one absent package aborts the release —
which is what `publish:check --registry` guards.

If the split is later adopted, re-run the script per mirror; the mirrors' JSR
links are the _last_ thing to change, after a sync has been proven end-to-end.

---

## 9. Pre-requisite — one open question that could decide this by itself

**Does JSR permit linking a package to a _private_ repository, and does it emit
provenance for one?** The JSR docs describe the OIDC flow and the linking
requirement but state no visibility requirement either way. I could not test it:
`jsr.io` and `api.jsr.io` both return 403 from this environment, exactly as ADR
001 §2 recorded.

Why it matters: npm's provenance explicitly requires a public repository, and
Sigstore's public-good Rekor log would publish the private repo's path into a
public transparency log regardless. If JSR follows npm here, then §8 does not
work as written and the decision is forced — toward publishing the monorepo.

Settle it before the release, not during:

1. `deno task jsr:link --dry-run` — does the PATCH shape even accept it?
2. Link one low-stakes package (`@lockness/hono`) to the private monorepo and
   check whether JSR accepts the link.
3. Publish a throwaway patch version from Actions and check
   `api.jsr.io/scopes/lockness/packages/hono/versions/<v>` for a non-null
   `rekorLogId`.

Also verify the two facts I could not: the 21/6/0 JSR link distribution, and
`@lockness/core@0.1.30`'s null `rekorLogId`. Neither changes the recommendation
— 0.1.30 predates this repo's `publish.yml`, so a null value is expected and is
evidence of nothing worse.

## 10. Out of scope

Per-package semver (settled in `docs/releasing.md`); splitting `@lockness/core`;
the `docs` repo's future; whether GitHub Project #2 becomes public; any change
to the 8-gate battery itself.
