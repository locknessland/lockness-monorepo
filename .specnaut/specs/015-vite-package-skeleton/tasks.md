---
description: "Epic task breakdown for @lockness/vite (#64) — MVP #105–#113 (shipped) + second chain #114–#116"
---

# Tasks: `@lockness/vite` integration (epic #64)

**Input:** `plan.md` in this directory. **Tests:** included (TDD per child).
**MVP chain (shipped at `1c02f0d`):** children **#105–#113** — kept below as the
historical record. **Second chain (this run, branch `016-vite-csp-demo-docs`):**
CSP #114, demo #115, docs #116 — broken down as **T10–T12** and built here; the
second epic merge closes #64.

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

## Second chain — #114–#116 (BUILT HERE)

The MVP checkpoint shipped at #113 (`1c02f0d`). This is the deferred second chain
the user opened on 2026-09-02 with `/specnaut plan 64`. Same epic, same plan, same
loop unit (**one child = one commit**). `T<NN>` continues the child ordinal:
**T10 = #114, T11 = #115, T12 = #116**, built in that dependency order
(`#114 → #115 → #116`). Branch: `016-vite-csp-demo-docs`. The **last child's
review (#116) is the single stop** before the second epic merge.

### T10 — #114 CSP / nonce for `viteAssets()` + dev CSP widening

**State carried in from MVP:** `viteAssets()` already accepts `{ nonce }` and
applies it (S-F4, attribute-encoded, opaque caller value — `src/vite_assets.ts`).
This child completes the CSP story; it does **not** re-mint the nonce.

- [ ] T10a [US4] Confirm/extend `src/vite_assets.ts` so the `nonce` attribute lands
  on **every** emitted tag — `<script>` **and** `<link rel="preload"|"stylesheet">`,
  dev and production paths (AC: nonce on both tag kinds). Keep the value opaque and
  attribute-encoded (S-F4 home unchanged).
- [ ] T10b [US4] Add the **dev-only CSP widening** to the bridge in
  `src/plugins/dev_server.ts`: when the forwarded `Response` carries a
  `Content-Security-Policy` header, append `http://localhost:5173` (value from
  `DEFAULTS.devServerUrl`, never a literal — decision-table CSS/paths home) to the
  `script-src`, `style-src`, and `connect-src` directives; leave a response without a
  CSP header untouched. **Mode-gated**: this middleware only runs under the dev server
  (`ManifestReader.mode()` is dev), so it is structurally absent from production
  (S-F5 containment). The nonce **value** vs its two uses stays split per §5: tag
  attribute in `vite_assets.ts`, header mutation here — one opaque value, two jobs.
- [ ] T10c [US4] Tests (`tests/vite_assets_test.ts` + `tests/dev_server_test.ts`):
  nonce present on script **and** link in both dev and prod; dev CSP widening appends
  the three directives only when a CSP header is present; **S-F5 test** — a production
  `viteAssets()` render + a production-mode path emits **no** `localhost:5173`
  anywhere.
- [ ] T10 Gate: `deno fmt && deno lint && deno check packages/vite/ && deno task test`.

### T11 — #115 Demo app + e2e smoke test (`packages/vite/demo/`)

- [ ] T11a [US5] Scaffold `packages/vite/demo/` — a minimal Lockness app: `deno.json`
  (own `vite` pin referencing `packages/vite/deno.json` as the authoritative range —
  demo-pin decision row, A-M4), `vite.config.ts` calling `lockness({ app })` (never
  assembling the plugin array by hand — aggregate-root home), `main.ts`, one
  controller rendering an SSR JSX page via `@lockness/core`, `app/client.ts`, and the
  Tailwind `cssInput`.
- [ ] T11b [US5] Confirm the `deps_analyzer.ts` `demo` exclusion (added in T01)
  is now **load-bearing**: run `deno task deps:analyze` and confirm the demo's bare
  `@lockness/*` imports are not mis-attributed and the graph stays acyclic.
- [ ] T11c [US5] e2e smoke test (`tests/e2e_smoke_test.ts`, `deno test` + fetch):
  boots the demo dev bridge, asserts the SSR response contains the expected markup;
  runs the production build, asserts `manifest.json` is emitted and `viteAssets()`
  resolves the entry to a hashed URL. (HMR `.tsx`-save reload documented as a manual
  smoke step where an automated browser is unavailable — named, not silently dropped.)
- [ ] T11 Gate.

### T12 — #116 `docs/vite.md` + README link + docs indexes (docs-writer)

- [ ] T12a Write `docs/vite.md`: installation/setup, a `vite.config.ts` example,
  the `DEFAULTS` table, dev vs production behaviour, the **CSP + nonce recipe**
  (from #114), `https:`/`jsr:` pinning note (S-F7) + the Deno interop flags
  (`nodeModulesDir`, permissions), and troubleshooting.
- [ ] T12b Link `docs/vite.md` from root `README.md`; add the `docs/vite.md` row to
  the root `AGENTS.md`/`CLAUDE.md` docs index (**one file — a symlink; edit once**);
  update `docs/STUBS.md` only if the implementation introduced stub mappings (it did
  not — record "no stub changes").
- [ ] T12c **Remove the README exemption**: delete the `vite: ['README.md']` entry
  from `tests/package_structure.test.ts` EXEMPTIONS and add `packages/vite/README.md`
  (this is what backlog #153 tracks — folded in here since docs land now). Add
  `docs/vite.md` accuracy review against the shipped implementation.
- [ ] T12 Gate. **← second epic merge (epic #64 closes) lands after this child's review.**

## Dependency order (verified against each child's stated deps)

**MVP chain (shipped):**
`#105 → #106 → #107 → #108 → #109 → #110 → #111 → #112 → #113`. Each child's plan
deps are satisfied by an earlier `T`: #108 needs 105/106/107 (T01–T03); #109 needs
105/106; #110 needs 105/107; #111 needs 108 (T04); #112 needs 108/111 (T04/T07);
#113 needs 105/107/110 (T06).

**Second chain (this run):**
`#114 → #115 → #116`. #114 needs 108/110 (dev bridge + viteAssets, both shipped);
#115 needs the whole MVP #105–#113 (shipped) + #114 for the S-F5 assertion; #116
needs everything (docs land last, and document the #114 CSP recipe + #115 demo).

## Implementation strategy

**MVP chain (T01…T09, shipped at `1c02f0d`).** Built in order, one commit per child
(`feat(vite/T0N): …`, the `chore(deps)` widening in T01 split out). The last child's
review (#113) was the single stop before the MVP epic merge.

**Second chain (T10…T12).** Same loop: one commit per child
(`<type>(T<NN>): <subject> (#<child>)` + `Epic: #64` trailer). Fast gate after each
child; a failure is fixed in place, not escalated. The **last child's review (#116)
is the single stop** before the second epic merge, which **closes epic #64**.
