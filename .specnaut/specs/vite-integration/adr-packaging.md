# ADR: Packaging shape for `@lockness/vite`

> **Issue:** [#104](https://github.com/locknessland/lockness-monorepo/issues/104)
> — sub-issue of epic [#64](https://github.com/locknessland/lockness-monorepo/issues/64).
> **Status:** Accepted. **Date:** 2026-09-02. **Deciders:** Vite-integration epic.
> **Depends on:** research [#103](https://github.com/locknessland/lockness-monorepo/issues/103)
> (`./research.md`), merged.
>
> **Deliverable path note.** The issue AC names
> `.specflow/specs/vite-integration/adr-packaging.md`; that root is retired-repo
> tooling. This project uses `.specnaut/specs/`, so the ADR lives at
> `.specnaut/specs/vite-integration/adr-packaging.md` — same folder as the
> research doc, current tooling root.

## Context

Epic #64 integrates Vite as the dev server and build tool. Before scaffolding
any code (sub-issue #105), one decision must be recorded: does the integration
ship as a **standalone workspace package** (`@lockness/vite` in `packages/vite/`)
or as a **module folded into `@lockness/core`**?

The choice is expensive to reverse — it fixes the dependency graph, the
user-facing import surface, and where an `npm:` exception lives. The relevant
constraints, several sharpened by the #103 research:

- **`@lockness/core` is deliberately minimal.** It is the single package a user
  app imports directly, and its philosophy is "only essentials (DI + Hono),
  optional features imported explicitly." Every optional capability — `auth`,
  `session`, `cache`, `queue`, `ui`, … — is already its own workspace package.
- **Vite is an `npm:` dependency.** There is no JSR build of Vite, so consuming
  it is a documented exception to the JSR-first hard rule (#103,
  Recommendations). That exception should be confined, not spread into core.
- **Lockness versions lockstep.** All workspace packages are bumped to one shared
  version by `deno task bump <version>` (`scripts/bump.ts`, `docs/releasing.md`).
  This directly contradicts a commonly-cited pro of "standalone = independent
  versioning": here it would **not** be independent. That pro is struck from the
  evaluation below as inapplicable.
- **The Deno resolver plugin should be reusable outside Lockness** (epic scope) —
  a goal a standalone package serves and a core module buries.
- **The SSR bridge is decoupling-friendly.** It forwards non-asset requests to
  `App.fetch()` — a Hono/Deno `{ fetch }` handler injected by the user's dev
  entrypoint. The bridge does **not** need to import `@lockness/core`; the app is
  handed to it. So a standalone package introduces no reverse edge into the DAG.

## Decision

**Ship a standalone workspace package, `@lockness/vite`, in `packages/vite/`** —
mirroring the layout of the other optional packages (`@lockness/auth`,
`@lockness/session`, …): its own `deno.json` (`exports: "./mod.ts"`, fully
qualified + pinned `jsr:` imports), own `AGENTS.md` / `README.md` / `docs/`, and
an `implementation`-tier entry in `deps.policy.jsonc`.

**Rationale.** Vite is a dev-and-build tool that most deployment targets don't
need at runtime (compiled binaries, direct `deno run`, or a consumer's own
bundler). Folding it into `core` would drag an `npm:vite` dependency — the very
JSR-first exception #103 flagged — into the one package everyone imports,
contradicting the minimal-core philosophy for zero benefit, since lockstep
versioning means a standalone package gains no version independence anyway. A
standalone package instead **confines the `npm:` exception to a single manifest,
keeps the integration opt-in, lets the reusable Deno resolver plugin stand on its
own, and matches the established pattern for every other optional capability** —
all without adding a reverse dependency edge, because the SSR bridge receives
`App.fetch()` by injection rather than importing core.

### Options evaluated

| Criterion | Standalone `@lockness/vite` (chosen) | Fold into `@lockness/core` (rejected) |
| :--- | :--- | :--- |
| Core bundle / graph | Unchanged; core stays minimal | Heavier — core inherits `npm:vite` + plugin deps |
| `npm:` exception | Confined to one package manifest | Leaks into the universally-imported package |
| Install model | Opt-in; only projects using Vite add it | Always present, even for binary/no-bundler deploys |
| Import ergonomics | One extra dependency to add | Simpler (`from '@lockness/core'`), always available |
| Resolver reuse (epic goal) | Natural — importable standalone | Buried inside core's surface |
| Versioning | Lockstep (same as core) — **no independence gained** | Lockstep — identical |
| Consistency | Matches `auth`/`session`/`cache`/… | One-off exception to the package pattern |
| DAG impact | None — bridge takes `App.fetch()` by injection | Risk of a core↔tooling coupling |

The only genuine advantage of core integration is import ergonomics (no extra
`deno add`), and that is fully neutralised by having `lockness init` scaffold
`@lockness/vite` into new projects — the user never adds it by hand.

## Consequences

**Positive**

- `@lockness/core` stays minimal; no `npm:vite` in the universal import path.
- The JSR-first exception is documented in exactly one place —
  `packages/vite/deno.json` and that package's dependency contract.
- Vite is opt-in: binary-compiled and no-bundler deployments carry nothing extra.
- The Deno resolver plugin (#106) is independently importable and reusable
  outside Lockness, per the epic goal.
- The package graph stays acyclic: `@lockness/vite` depends downward only
  (`hono`/`contract` as needed) and is never imported by `core`; the user's dev
  entrypoint wires the app into it.

**Negative / trade-offs (all mitigated)**

- Users must depend on `@lockness/vite` explicitly → mitigated by `lockness init`
  scaffolding it into the generated project and `deno task dev`/`build` wiring.
- A dev-tool package still owns the `npm:` interop story from #103
  (`--node-modules-dir`, permission flags, config-file resolution blind spot) →
  that is exactly why confining it to one package is preferable to spreading it.
- A new `deps.policy.jsonc` tier entry is needed (#105) — expected
  `"vite": { "tier": "implementation", "allow": [ … minimal … ] }`; it must not
  list `core`. Deciding the precise `allow` set is #105/#106 work, not this ADR.

**Neutral**

- Lockstep versioning is unchanged: `@lockness/vite` bumps with everything else.
  The "independent versioning" argument sometimes made for standalone packages
  does not apply and was not a factor in this decision.

## Follow-ups

- **#105** — scaffold `packages/vite/` (`deno.json`, `mod.ts`, `AGENTS.md`,
  `README.md`, tier entry). Target **Vite 7.x** per #103.
- **#106** — Deno resolver plugin, built on the official `@deno/vite-plugin`
  (#103 Recommendations).

## References

- Research doc `./research.md` (#103) — Deno compatibility, the `npm:vite`
  exception, resolver-plugin choice, and the Vite 7 target.
- `docs/releasing.md` — the lockstep versioning model.
- Existing optional-package layout: `packages/auth/`, `packages/session/`.
