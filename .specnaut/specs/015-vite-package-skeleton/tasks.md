---
description: "Epic task breakdown for @lockness/vite (#64) — MVP chain #105–#113"
---

# Tasks: `@lockness/vite` integration (epic #64)

**Input:** `plan.md` in this directory. **Tests:** included (TDD per child).
**Scope of this chain:** the MVP checkpoint the user chose — children
**#105–#113**. CSP #114, demo #115, docs #116 are a **deferred second chain** and
are listed at the end for reference only, not built here.

## The loop unit is the child, not the `T` row

Per `phases/epic-loop.md`: **one child = one sub-issue = one commit.** The `T<NN>`
below is the **child's ordinal in dependency order** — the value the commit scope
carries (`feat(vite/T01): …`). Several checklist items under a child still produce
**one** commit. Children are built in the `T01…T09` order below; each child's card
moves to In progress at its turn and to In review once its commit lands.

## Homes carried forward (plan §5 decision table)

| Rule | Home |
| :--- | :--- |
| Standalone package; Vite `^8`; `npm:` exception | `packages/vite/deno.json` + `deps.policy.jsonc` `"vite"` |
| The seven configurable paths + CSS paths + Tailwind command | `src/shared.ts` — `DEFAULTS`, glob sets, `TAILWIND_CLI` |
| Mode detection (dev-server-context-first) + all manifest fs access | `src/manifest_reader.ts` — `ManifestReader` |
| Vite-internal/asset-request predicate (allowlist, default-forward) | `src/plugins/dev_server.ts` |
| Reload-vs-CSS glob precedence (server-reload wins) | `src/shared.ts` glob sets |
| Virtual module id `lockness:client-entry` | `src/plugins/client_entry.ts` |
| `entry` → keyed manifest lookup (never a path build) | `src/vite_assets.ts` via `ManifestReader` |
| Nonce value (opaque) vs tag-attribute vs CSP-header uses | `src/vite_assets.ts` (attr) / dev CSP injector (header) |
| Resolver: `Deno.Command` arg-array + validated specifier; no Lockness imports | `src/plugins/deno.ts` |
| Plugin set returned to Vite | `src/mod.ts` — `lockness()` |

---

## T01 — #105 Scaffold `packages/vite/` skeleton

- [ ] Create `packages/vite/deno.json`: `name` `@lockness/vite`, `version` `0.2.0`
  (lockstep), `exports` `./mod.ts`, `imports.vite` = `npm:vite@^8` **with an inline
  JSR-first exception comment**, `@std/*` from JSR, `test` task, `publish.exclude`
  `["tests/","demo/"]`.
- [ ] Create `packages/vite/mod.ts` — placeholder (`// TODO` + empty re-export), no logic.
- [ ] Create stub dirs/files: `src/mod.ts`, `src/shared.ts`, `src/plugins/deno.ts`,
  `src/plugins/dev_server.ts`, `src/plugins/client_entry.ts` — each a `// TODO` stub.
- [ ] Add `./packages/vite` to the root `deno.jsonc` `workspace` array.
- [ ] `chore(deps)` (separate commit-worthy change, folded per epic-commit rules):
  add `"vite": { "tier": "implementation", "allow": [] }` to `deps.policy.jsonc`;
  exclude `demo` in `scripts/deps_analyzer.ts` `collectSourceFiles`; run
  `deno task deps:analyze` (regenerates `docs/dependencies.md`), confirm acyclic.
- [ ] Run `deno task agents:brief` → `packages/vite/AGENTS.md`; add the `@lockness/vite`
  row to root `AGENTS.md`/`CLAUDE.md` package index.
- [ ] Gate: `deno check packages/vite/mod.ts` + `deno lint packages/vite/` pass.

## T02 — #106 Deno specifier resolver plugin (`src/plugins/deno.ts`)

- [ ] `denoResolver()` intercepts `jsr:` / `npm:` / `https:`; passes relative/local
  imports through. **Imports nothing Lockness-specific** (no `shared.ts`) — A-L2.
- [ ] **Validate against Rolldown first** (Vite 8) — the plan's first acceptance gate.
- [ ] Invoke Deno via `Deno.Command` **arg-array, no shell**; validate each specifier
  against a bounded allowlist before any subprocess/fetch (S-F2); delegate `https:`
  to Deno, no custom fetch (S-F7).
- [ ] Tests (`tests/deno_resolver_test.ts`): each of `jsr:`/`npm:`/`https:` resolves;
  a relative import passes through.
- [ ] Gate.

## T03 — #107 `defineViteConfig()` + `DEFAULTS` (`src/shared.ts`, `src/define_config.ts`)

- [ ] `DEFAULTS` in `src/shared.ts`: serverEntry `main.ts`, clientEntry `app/client.ts`,
  routeDir `app/controller`, outDir `public/assets`, manifestPath
  `public/assets/.vite/manifest.json`, devServerUrl `http://localhost:5173`,
  cssInput `app/view/assets/app.css`; plus `SERVER_RELOAD_GLOBS`, CSS glob set (with
  the server-reload-wins precedence note), and `TAILWIND_CLI`.
- [ ] `defineViteConfig(Partial<LocknessViteConfig>): Required<LocknessViteConfig>`
  merges over `DEFAULTS`; `LocknessViteConfig` exported from `mod.ts`. **No `any`.**
- [ ] Tests: no args → all `DEFAULTS`; partial overrides only provided keys.
- [ ] Gate.

## T04 — #108 Dev-server bridge plugin (`src/plugins/dev_server.ts`)

- [ ] `configureServer` hook; the **asset-request predicate = allowlist of Vite
  prefixes, everything else forwards** to `App.fetch(request)`; forward status /
  headers / body back **verbatim** (S-F6); inject collected CSS into `text/html`.
- [ ] Never intercept `/@vite/client`, `/@id`, `/@fs`, HMR ws (single predicate home).
- [ ] Bind **loopback by default**, keep Vite `server.fs.strict: true`, warn on
  non-loopback host (S-F1). Accept `LocknessViteConfig` for port/devServerUrl.
- [ ] Integration/smoke test (or documented manual): a route renders via the bridge.
- [ ] Gate.

## T05 — #109 `lockness:client-entry` virtual module (`src/plugins/client_entry.ts`)

- [ ] Resolve `lockness:client-entry` → `\0lockness:client-entry`; `load` returns the
  generated module: import the client runtime (**stub** — SSR-first), re-export
  `app/client.ts` when present, inject `/@vite/client` in dev.
- [ ] Test: resolving the id returns the expected import statements.
- [ ] Gate.

## T06 — #110 `viteAssets()` + `ManifestReader` (`src/vite_assets.ts`, `src/manifest_reader.ts`)

- [ ] `ManifestReader` owns **all** manifest fs access (existence, contents, cache)
  and `mode()` — **dev-server-context-first** (A-H1), not bare manifest-exists.
- [ ] `viteAssets(entry, { devServerUrl?, nonce? }): Promise<ViteAssetsTagResult>`;
  dev → dev-server URLs; production → **keyed** manifest lookup (unknown key throws;
  never a path built from `entry` — S-F3) incl. CSS deps; missing manifest throws a
  clear error; `nonce` **attribute-encoded** on every tag, never minted/cached (S-F4).
  `ViteAssetsTagResult` exported from `mod.ts`. **No `any`.**
- [ ] Tests: dev URL gen; prod lookup with CSS deps (fixture manifest); missing
  manifest throws; nonce propagation.
- [ ] Gate.

## T07 — #111 CSS / Tailwind integration (`src/plugins/css.ts`)

- [ ] Dev: rebuild `DEFAULTS.cssInput` on `app/**/*.{ts,tsx}` via `TAILWIND_CLI`
  (from `shared.ts`); collected CSS injected by the dev bridge (T04).
- [ ] Production: CSS emitted as a **hashed asset under `outDir`**, referenced in the
  manifest (not `public/css/app.css`).
- [ ] Watcher globs from `shared.ts`; **server-reload globs win** over CSS globs for a
  `.tsx` under `app/controller/` (glob-arbiter home).
- [ ] Gate.

## T08 — #112 HMR + server reload (`src/plugins/hmr.ts`)

- [ ] Watch `SERVER_RELOAD_GLOBS`; on change → full reload + re-init the app instance
  (Vite `server.restart()` / `ws.send({type:'full-reload'})` — validate for Vite 8).
- [ ] CSS-only change does **not** trigger a server reload (arbiter from T07).
- [ ] Documented smoke test: edit a controller → browser reloads → new response.
- [ ] Gate.

## T09 — #113 Production build (single manifest)

- [ ] `vite build` (Deno task) emits `public/assets/.vite/manifest.json`; no SSR
  build artifact (server runs under Deno directly).
- [ ] `viteAssets()` production path reads it (via `ManifestReader`); malformed/missing
  manifest throws a clear, descriptive error (no silent failure).
- [ ] Snapshot/unit test: tag output against a fixture manifest.
- [ ] Gate. **← first epic merge (MVP checkpoint) lands here.**

---

## Deferred to the second chain (NOT built here)

- **#114** CSP / nonce header widening — incl. the S-F5 test asserting production
  output carries no `localhost:5173`.
- **#115** Demo app + e2e smoke test — brings `packages/vite/demo/` (and the
  `deps_analyzer.ts` `demo` exclusion becomes load-bearing then).
- **#116** `docs/vite.md` + README link + STUBS; documents `https:` pinning (S-F7)
  and the Deno interop flags.

## Dependency order (verified against each child's stated deps)

`#105 → #106 → #107 → #108 → #109 → #110 → #111 → #112 → #113`. Each child's plan
deps are satisfied by an earlier `T`: #108 needs 105/106/107 (T01–T03); #109 needs
105/106; #110 needs 105/107; #111 needs 108 (T04); #112 needs 108/111 (T04/T07);
#113 needs 105/107/110 (T06).

## Implementation strategy

Build `T01…T09` in order, one commit per child (`feat(vite/T0N): …`, the
`chore(deps)` widening in T01 split out). Fast gate after each child; a failure is
fixed in place, not escalated. The **last child's review (#113) is the single
stop** before the MVP epic merge.
