# Vite 6+ Integration Research

> **Issue:** [#103](https://github.com/locknessland/lockness-monorepo/issues/103)
> — sub-issue of epic [#64](https://github.com/locknessland/lockness-monorepo/issues/64).
> **Status:** research only — no production code. Signals into ADR #104
> (packaging shape).
>
> **Deliverable path note.** The issue AC names
> `.specflow/specs/vite-integration/research.md`. That path is a carry-over from
> the retired repository's tooling; this project uses `.specnaut/specs/`, so the
> document lives at `.specnaut/specs/vite-integration/research.md`. Same folder
> name, current tooling root.
>
> **Research date:** 2026-09-02. Version numbers below were current on that date;
> re-verify at implementation time (#105+).

## Overview

Epic #64 replaces the two-terminal dev workflow (backend dev server + separate
CSS watcher) with a single Vite-driven pipeline: HMR, CSS injection, a unified
asset manifest, and an SSR bridge where Vite in **middleware mode** forwards
non-asset requests to `App.fetch()`. This document validates that approach
against the Vite 6/7 ecosystem and Deno's current Vite story **before** any code
is written, so the incremental build (sub-issues #105–#116) starts from facts,
not from the assumptions that sank the earlier big-bang attempt.

The headline conclusions:

- **Target Vite 7** (7.x). It is the current stable major, ESM-only, and its
  Node baseline lines up with Deno's Node-compat layer. See
  [Recommendations](#recommendations).
- **The middleware-mode + same-runtime SSR bridge is sound** and is exactly what
  AdonisJS ships in production. The Environments API changes the *API surface*
  of that bridge, not its *architecture*.
- **Deno + Vite works**, via `deno task` over `package.json` scripts plus a Deno
  resolver plugin. There is an official one (`@deno/vite-plugin`) and a more
  aggressive community one (`@deno-plc/vite-plugin-deno`); for a fullstack SSR
  framework the official plugin + `node_modules` interop is the safer base.
- **`@fresh/plugin-vite` is current and maintained** — Fresh 2 is now a Vite
  plugin — and is the closest reference implementation to what Lockness needs.

## Vite 6+ Changes

| Fact | Vite 6 | Vite 7 |
| :--- | :--- | :--- |
| Released | Nov 2024 | 2025-06-24 |
| Headline | First **experimental Environment API** since Vite 2 | Environment API refinements + `buildApp` hook |
| Node baseline | Node 18+ | **Node 20.19+ / 22.12+** (Node 18 dropped) |
| Distribution | ESM + CJS | **ESM-only** (relies on `require(esm)` from the new Node baseline) |
| Default build target | `'modules'` | **`'baseline-widely-available'`** — Chrome 107, Edge 107, Firefox 104, Safari 16.0 |

Relevant highlights for an SSR / multi-environment build tool:

- **Environments** formalise what were, up to Vite 5, two implicit environments
  (`client` and optionally `ssr`). Vite 6 made them first-class and pluralisable;
  a framework can declare as many as its production topology needs.
- **Vite 7 `buildApp` hook** lets a plugin coordinate the build of multiple
  environments in one pass — the build-time counterpart to the dev-time
  Environment API. Lockness only needs `client` + `ssr` at v1, so this is
  forward-looking, not required.
- **ESM-only + the raised Node baseline** are the two changes that most affect
  Deno: both are non-issues (Deno is ESM-native and its Node-compat targets
  modern Node), but they do mean tutorials or plugins written for Vite ≤5 CJS
  assumptions may be stale.

## Environments API

**Explicit answer to the AC question — does the Environments API change the SSR
bridge design?**

**Yes at the API level, no at the architecture level.** The bridge stays
"Vite in middleware mode, same Deno process, forward non-asset requests to
`App.fetch()`." What changes is *how the SSR entry module is loaded in dev*:

| | Pre-6 (Vite ≤5) | Environment API (Vite 6/7) |
| :--- | :--- | :--- |
| Load SSR entry in dev | `server.ssrLoadModule('/entry-server.ts')` | `environment.runner.import('/entry-server.ts')` via a `RunnableDevEnvironment`, **or** a custom `ModuleRunner` + transport for a different runtime |
| Where SSR code executes | In the Vite server process | Decoupled: a `DevEnvironment` owns transform + module graph; a separate `ModuleRunner` executes the transformed code in a target runtime |
| Cross-runtime SSR (worker/edge) | Not a first-class concept | First-class — the runner talks to the server over a pluggable `ModuleRunnerTransport` (RPC / worker / HTTP) |

What this means concretely for Lockness's bridge:

- The Lockness `App` runs in the **same Deno runtime** as the Vite dev server, so
  the default `ssr` environment as a **`RunnableDevEnvironment`** is sufficient —
  `environment.runner.import()` is the same-process replacement for
  `ssrLoadModule`. No transport, no worker plumbing.
- The Environment API does **not** push us toward running SSR in a worker or a
  separate process. That option now exists, but it is opt-in and out of scope
  for the epic's v1.
- **Stability caveat:** the Environment API is still marked **experimental** in
  Vite 7 ("kept experimental while the ecosystem provides feedback"), with
  stabilisation planned for a future major. Vite maintains it between majors so
  frameworks can build on it, but the surface can still shift.

**Design guidance for the bridge plugin (#108):** keep the dev SSR loader behind
a one-function seam (e.g. `loadSsrEntry(server, id)`) that today calls
`ssrLoadModule` (stable) or the `RunnableDevEnvironment` runner where present.
That isolates any future Environment-API churn to a single function instead of
threading it through the middleware.

## Deno Compatibility

**How Vite runs under Deno today:**

- Deno reads `package.json` `scripts` as tasks, so `vite` / `vite build` are
  available through `deno task dev` / `deno task build`. `deno install`
  materialises a `node_modules/` for Vite and its Rollup/esbuild native deps.
- Vite itself is consumed as an `npm:` package. Vite 7's ESM-only, modern-Node
  baseline is compatible with Deno's Node-compat layer.

**Deno resolver plugins** (the piece sub-issue #106 will build on):

| Plugin | Source | What it resolves | Fit for Lockness |
| :--- | :--- | :--- | :--- |
| `@deno/vite-plugin` | **Official** (`@deno` npm namespace) | `deno.json` aliases, `npm:`, `jsr:`, `http(s):` — by consulting the Deno CLI | **Preferred base.** Official, aligns with Deno's own resolution. Caveat: Deno-specific resolution **cannot** be used inside `vite.config.ts` itself (Vite doesn't route the config file's own bundling through plugins). |
| `@deno-plc/vite-plugin-deno` | Community (`deno-plc`) | Native `jsr:` / `npm:` / `https:` **without `node_modules`**, via an injected Rollup resolver | Powerful for pure client bundles, but flagged **"fullstack frameworks most likely incompatible,"** **React unsupported**, and some CJS-hacky npm packages fail. Too risky as the primary resolver for an SSR framework; keep as a fallback/experiment. |

**Deno-specific gotchas for running Vite under `deno task`** (explicit AC list):

1. **`node_modules` is still needed.** Vite's native deps (esbuild, Rollup) and
   many plugins assume a `node_modules/`; run with `--node-modules-dir` (or
   `"nodeModulesDir": "auto"` in `deno.json`) so npm packages materialise on
   disk. The fully-native `@deno-plc` path avoids this but sacrifices fullstack
   compatibility.
2. **Permissions.** The dev server needs `--allow-read --allow-write`
   (node_modules, cache, temp), `--allow-net` (HMR websocket + dev server),
   `--allow-env`, and `--allow-run` when a resolver plugin shells out to the
   Deno CLI. Scaffolding examples use `-A`; the shipped tasks should enumerate
   the minimum set once the surface is known.
3. **Config-file resolution blind spot.** `@deno/vite-plugin` cannot rewrite
   specifiers used **in `vite.config.ts` itself** — imports there must be
   resolvable by Deno directly (bare specifiers via `deno.json` import map, not
   `jsr:`/`npm:` sugar that only the plugin understands at build time).
4. **Two dependency manifests.** A Vite-under-Deno project ends up with both
   `deno.json` and `package.json`. Decide which owns the Vite dep and keep them
   from drifting (ADR #104 territory). Lockness's hard rule is JSR-first; Vite is
   a legitimate `npm:` exception (no JSR build of Vite), which must be documented
   per the dependency contract.
5. **ESM-only Vite 7** removes any CJS-interop escape hatch — fine for Deno, but
   any plugin still shipping CJS-only may need `--node-modules-dir` + interop.
6. **`deno.lock` vs `package-lock`.** Let Deno own the lock; do not hand-maintain
   a Node lockfile. (Consistent with the framework's "never hand-edit the lock"
   rule.)

## Fresh Plugin Status

**Current and maintained — this is the reference implementation to study.**

- Fresh 2.0 has graduated from alpha (63 alpha releases) to **beta**, and the
  last major architectural change was **Vite integration**. Ryan Dahl:
  "fresh is now a vite plugin."
- **`@fresh/plugin-vite`** is published on JSR at **v1.1.2** (100% JSR score,
  actively maintained as of research date).
- The plugin handles: JSX configuration, **HMR**, island discovery,
  **client/server code splitting**, and React→Preact aliasing. In production it
  **bundles server code**, reducing the file count Deno must resolve at boot —
  reported **9–12× faster** production boot depending on project size.

Why this matters for Lockness:

- It proves the **Vite-plugin-under-Deno** model end to end in a real Deno
  fullstack framework — the same runtime, the same `jsr:`/`npm:` resolution
  problems, solved and shipping.
- Its client/server split and server-bundling approach are directly relevant to
  sub-issues #107 (`defineViteConfig` DEFAULTS) and #108 (SSR bridge). Read its
  source before designing ours.
- **Caveat:** Fresh is Preact/islands-oriented; Lockness is Hono-JSX/MVC. We
  borrow the *plumbing patterns* (plugin shape, HMR wiring, manifest handling),
  not the islands runtime.

## AdonisJS Patterns

AdonisJS's current ("experimental" → v7) Vite integration is the closest
architectural match to what epic #64 describes, and it is **still applicable**:

- **Middleware mode, embedded dev server.** Vite runs inside the Adonis dev
  server; an HTTP middleware forwards asset requests to Vite and everything else
  to the app. One process, not two. → This is exactly Lockness's "Vite middleware
  forwards non-asset requests to `App.fetch()`."
- **Direct access to Vite's runtime API** for SSR from within that middleware —
  no separate SSR process.
- **Entrypoints** are declared in `vite.config.ts` and rendered into HTML via a
  template tag (`@vite` Edge tag) that emits the right `<script>`/`<link>` tags.
  → Lockness needs the Hono-JSX equivalent (a helper/component that reads the
  manifest in prod and the dev URLs in dev).
- **Manifest in production.** Vite writes `manifest.json` beside the built
  assets; the server reads it to resolve hashed asset paths. Vite does **not**
  write a manifest in dev.
- **`hotFile`** marks dev mode — its presence tells the server to point tags at
  the Vite dev server instead of the manifest.

Takeaways that carry over verbatim: the dev/prod split (proxy-to-Vite in dev,
read-manifest in prod), the entrypoint tag helper, and the hotFile sentinel are
all patterns Lockness should reuse rather than reinvent.

## Recommendations

### Minimum Vite version: **7.x** (explicit AC answer)

Reasons:

1. **Current stable major** (released 2025-06-24); Vite 6 is superseded and
   received far less Deno-ecosystem testing.
2. **Node baseline (20.19+/22.12+) aligns with Deno's Node-compat layer** —
   fewer interop surprises than Vite 6's Node 18 assumptions.
3. **ESM-only** matches Deno's native module model; no CJS interop debt.
4. **Environment API + `buildApp` hook are present**, giving a forward path to
   multi-environment builds without adopting them in v1.
5. The reference implementations we are copying (`@fresh/plugin-vite`, AdonisJS
   v7) target this generation.

Do **not** target Vite 6 as a floor; do not block on a future Vite 8.

### Packaging (signals into ADR #104)

- Ship as **`@lockness/vite`**, a standalone package (co-located in
  `packages/vite/`), consistent with the epic's "reusable outside Lockness"
  goal for the Deno resolver plugin.
- Vite is an `npm:` dependency (no JSR build exists) — a **documented exception**
  to the JSR-first hard rule, declared in the package's own manifest per the
  dependency contract.

### Deno resolution

- Build the resolver plugin (#106) on **`@deno/vite-plugin`** (official) plus
  `--node-modules-dir` interop. Treat `@deno-plc/vite-plugin-deno` as an
  experiment only — its "fullstack frameworks likely incompatible" warning
  disqualifies it as the primary path for an SSR framework.
- Keep `vite.config.ts`'s own imports resolvable by Deno directly (import map),
  given the plugin's config-file blind spot.

### SSR bridge (#108)

- **Middleware mode + same-runtime `RunnableDevEnvironment`**, following the
  AdonisJS pattern. Forward non-asset requests to `App.fetch()`.
- Isolate the dev SSR-entry loader behind one seam (`ssrLoadModule` stable path,
  `runner.import()` where available) so the still-experimental Environment API
  can stabilise without rippling through the middleware.
- Prod: read Vite's `manifest.json`; dev: detect the `hotFile` sentinel and
  point asset tags at the dev server. Provide a Hono-JSX entrypoint-tag helper.

### Sequenced next steps

1. **#104 (ADR):** lock the packaging shape and the JSR-exception rationale using
   the signals above.
2. **#105:** scaffold `packages/vite/`.
3. **#106:** Deno resolver plugin on `@deno/vite-plugin`.
4. **#107:** `defineViteConfig()` DEFAULTS (study `@fresh/plugin-vite`).
5. **#108:** SSR bridge middleware (study AdonisJS).

## Sources

- [Vite 7.0 announcement](https://vite.dev/blog/announcing-vite7) — release date,
  Node baseline, ESM-only, build target, `buildApp`.
- [Environment API guide](https://vite.dev/guide/api-environment) and
  [Environment API for Runtimes](https://vite.dev/guide/api-environment-runtimes.html)
  — DevEnvironment / ModuleRunner / RunnableDevEnvironment, experimental status.
- [Vite SSR guide](https://vite.dev/guide/ssr).
- [Deno — Use Vite](https://docs.deno.com/examples/vite_tutorial/) and
  [Node & npm compatibility](https://docs.deno.com/runtime/fundamentals/node/).
- [`@deno/vite-plugin`](https://www.npmjs.com/package/@deno/vite-plugin) (official
  Deno resolver) and
  [`@deno-plc/vite-plugin-deno`](https://github.com/deno-plc/vite-plugin-deno)
  (community native resolver).
- [Fresh 2.0 graduates to beta, adds Vite support](https://deno.com/blog/fresh-and-vite),
  [`@fresh/plugin-vite` on JSR](https://jsr.io/@fresh/plugin-vite),
  [Fresh Vite docs](https://fresh.deno.dev/docs/advanced/vite).
- [AdonisJS Vite integration](https://docs.adonisjs.com/guides/basics/vite) and
  [experimental Vite guide](https://docs.adonisjs.com/guides/experimental-vite).
