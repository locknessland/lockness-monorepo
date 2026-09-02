# Plan — `@lockness/vite` integration (epic #64)

> **Epic:** [#64](https://github.com/locknessland/lockness-monorepo/issues/64).
> **This is ONE plan for the whole epic** — children #105–#116 (#103 research and
> #104 ADR are merged). One decision table, one stop, one branch
> (`015-vite-package-skeleton`), one epic merge. Feature dir is named for its
> first child; it holds the epic plan.
> **Depends on merged docs:** `../vite-integration/research.md` (#103),
> `../vite-integration/adr-packaging.md` (#104).

## 1. Why this exists

The Lockness dev workflow needs two terminals today — the backend dev server and
a separate Tailwind `css:watch`. There is no HMR, no single dev command, and no
unified asset pipeline; production has no hashed-asset manifest. A prior
big-bang attempt failed because its scope could not land as one change. This
epic delivers Vite as **dev server** (HMR, CSS injection, one `dev` command) and
**build tool** (single client manifest) as a standalone, opt-in package,
`@lockness/vite`, built in independently-shippable increments.

**Measured outcome:** `deno task dev` for a Vite-enabled app runs **one** process
(down from two); a production `build` emits a manifest that `viteAssets()`
resolves to hashed URLs.

## 2. User scenarios

- **P1 — Single-command dev (US1).** *Given* a Lockness app configured with
  `@lockness/vite`, *when* the developer runs the dev server, *then* one process
  serves SSR pages via `App.fetch()`, injects CSS, and hot-reloads on both client
  and backend changes — no second terminal. (Children #106–#112.)
- **P1 — Deployable build (US2).** *Given* the app, *when* the developer builds,
  *then* Vite emits `public/assets/.vite/manifest.json` and `viteAssets(entry)`
  returns the correct hashed `<script>`/`<link>` tags in production. (#110, #113.)
- **P2 — Deno-native specifiers (US3).** *Given* app code importing `jsr:`,
  `npm:`, or `https:` specifiers, *when* Vite dev/build resolves the graph,
  *then* those specifiers resolve through Deno rather than failing. (#106.)
- **P2 — CSP-safe assets (US4).** *Given* an app sending a strict CSP, *when*
  `viteAssets(entry, { nonce })` renders, *then* every emitted tag carries the
  nonce and dev adds `localhost:5173` to the relevant directives. (#114.)
- **P3 — Proven end-to-end (US5).** A demo app boots, renders SSR JSX, hot-reloads
  a `.tsx` edit, and builds a manifest — validated by an automated test. (#115.)
- **Edge cases:** manifest missing in production → clear thrown error (never
  silent); Vite-internal requests (`/@vite/client`, HMR ws) must never reach
  `App.fetch()`; CSS-only change must not trigger a full server reload.

## 3. Requirements

- **FR-001** Ship `@lockness/vite` as a standalone workspace package
  (`packages/vite/`), registered in the root workspace and `deps.policy.jsonc`.
  (#105; ADR #104.)
- **FR-002** Target **Vite 8** — declare `npm:vite@^8` with an inline JSR-first
  exception justification. (#105; user instruction 2026-09-02; supersedes #103's
  Vite 7.)
- **FR-003** Provide `DEFAULTS` (serverEntry `main.ts`, clientEntry
  `app/client.ts`, routeDir `app/controller`, outDir `public/assets`,
  manifestPath `public/assets/.vite/manifest.json`, devServerUrl
  `http://localhost:5173`, **cssInput `app/view/assets/app.css`**) and
  `defineViteConfig(Partial<LocknessViteConfig>): Required<LocknessViteConfig>`
  merging user config over `DEFAULTS`. (#107.) **Production CSS is emitted as a
  hashed asset under `outDir` and referenced from the manifest — the pre-Vite
  standalone `public/css/app.css` output is retired under Vite, not a default**
  (resolves the arch audit's cssOutput/outDir mismatch, §10 A-H2).
- **FR-004** `denoResolver()` plugin resolves `jsr:`/`npm:`/`https:` specifiers
  via Deno; leaves relative/local imports to Vite. (#106.)
- **FR-005** Dev-server bridge plugin forwards **non-asset** requests to
  `App.fetch(request)` and forwards the `Response` back; injects collected CSS
  into `text/html`; never intercepts Vite-internal requests. (#108.)
- **FR-006** `lockness:client-entry` virtual module (Vite `\0` convention)
  re-exports the client runtime (stub until it exists) and the user's
  `app/client.ts` when present; injects the HMR client in dev. (#109.)
- **FR-007** `viteAssets(entry, options?): Promise<ViteAssetsTagResult>` — dev
  points at the dev server; production reads the manifest via a `ManifestReader`;
  missing manifest throws a clear error; `nonce` propagates to all tags. (#110,
  #113, #114.)
- **FR-008** CSS/Tailwind: dev rebuilds `app/view/assets/app.css` on
  `app/**/*.{ts,tsx}` changes, injected by the bridge; production emits hashed
  CSS into the manifest; no second terminal. (#111.)
- **FR-009** Server reload: watching the **server-reload globs**
  (`app/controller/**`, `app/service/**`, `app/middleware/**`, `app/routes.ts`,
  `config/**`) triggers a full reload and re-initialises the app; CSS-only
  changes do not. (#112.)
- **FR-010** Production build emits `public/assets/.vite/manifest.json`; no SSR
  build artifact (server runs under Deno directly). (#113.)
- **FR-011** Demo app + automated e2e smoke test proving dev SSR + HMR + build.
  (#115.)
- **FR-012** `docs/vite.md` + root README link + `docs/STUBS.md` if stubs change.
  (#116.)

## 4. Success criteria

- **SC-001** A Vite-enabled app's dev workflow is **one** process (was two).
- **SC-002** After a build, a page's assets load from **hashed** URLs resolved
  from the manifest; a missing manifest yields a descriptive error, never a blank
  page.
- **SC-003** App code using `jsr:`/`npm:`/`https:` specifiers resolves in both
  dev and build.
- **SC-004** Editing a controller updates the served response without a manual
  restart; editing a `.tsx` updates the browser via HMR.
- **SC-005** With a nonce supplied, every emitted asset tag carries it.

## 5. 🔒 Decision table

The rules this epic introduces, each with its single home and what a second
spelling would look like. **Binding on the implementer** — a decision may not
move home without amending this plan.

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| `@lockness/vite` is standalone, never folded into core (#104) | `packages/vite/deno.json` (`name`/`exports`) + `deps.policy.jsonc` `"vite"` entry | a `vite` module under `packages/core/`, or a `vite` export in `core`'s `mod.ts` |
| Target Vite version is `^8` | `packages/vite/deno.json` `imports.vite` | a `vite` pin invented independently in a plugin file or docs (the demo's required pin is NOT a duplicate — see the demo-pin row) |
| The demo's own `vite` pin references one source of the range | `packages/vite/demo/deno.json`, with a comment pointing at `packages/vite/deno.json` as the authoritative range (`npm:vite` cannot resolve by workspace-member name, so the demo pin is *required*, not accidental — A-M4) | a demo pin with a *different* range than the package's |
| `npm:vite` is the sole JSR-first exception, justified | inline comment in `packages/vite/deno.json` beside the pin | an undocumented `npm:` specifier anywhere else in the package |
| **The seven configurable paths** — serverEntry, clientEntry, routeDir, outDir, manifestPath, devServerUrl, **cssInput** | `packages/vite/src/shared.ts` — `DEFAULTS` const | a literal `'public/assets/.vite/manifest.json'`, `'http://localhost:5173'`, or `'app/view/assets/app.css'` in `dev_server.ts`, `css.ts`, `vite_assets.ts`, `client_entry.ts`, or the build |
| **CSS/Tailwind pipeline paths + the Tailwind CLI invocation** (FR-008) | `src/shared.ts` — `cssInput` in `DEFAULTS` + a single `TAILWIND_CLI` command const; production CSS emitted hashed under `outDir` (not `public/css/app.css`) | the input/output path or the `@tailwindcss/cli` command re-spelled across the #111 watcher, the #111 injector, and the #113 prod emit (A-H2) |
| Dev-vs-production mode detection | `src/manifest_reader.ts` — `ManifestReader.mode()`: **dev-server context wins** — `runningUnderViteDevServer ? 'dev' : (manifestExists ? 'production' : 'dev')` (A-H1) | a bare `manifestExists` check in `shared.ts`, or a separate `Deno.env.get('DENO_ENV')` check in `vite_assets.ts` vs `dev_server.ts` |
| "Is this a Vite-internal/asset request?" (must NOT reach `App.fetch()`) — an **allowlist of Vite prefixes; everything else forwards** (S-F* default-forward) | `src/plugins/dev_server.ts` — one predicate | an inline `url.startsWith('/@')` re-check in `hmr.ts` (#112) or `css.ts` (#111) |
| Which handler wins for a file matching **both** the CSS glob and a server-reload glob (e.g. a `.tsx` under `app/controller/`) | `src/shared.ts` — the glob sets, with a documented precedence rule (server-reload wins; a pure `.css` edit hits neither) | an ad-hoc "did CSS already handle it?" check inside `hmr.ts` (A-Q4-3) |
| Server-reload globs | `src/shared.ts` const `SERVER_RELOAD_GLOBS` | a hardcoded glob array inside `hmr.ts` and again in the CSS watcher |
| The virtual module id `lockness:client-entry` and its `\0` resolved form | `src/plugins/client_entry.ts` | the literal string repeated in `dev_server.ts` or docs code samples treated as source |
| Manifest read + cache (location, shape, presence) | `src/manifest_reader.ts` — `ManifestReader` (owns **all** manifest filesystem access: existence, contents, mode) | a second `JSON.parse(manifest)` or a separate `exists()` in `vite_assets.ts`/`shared.ts` (A-M-mode; avoids the TOCTOU split) |
| `entry` → asset URL is a **keyed manifest lookup** (unknown key throws), never a path built from `entry` | `src/vite_assets.ts` via `ManifestReader` | joining `entry` onto `outDir` to form a path (S-F3 path-traversal) |
| Nonce **value** source vs its two uses | value is caller-supplied (opaque); tag-attribute application lives in `src/vite_assets.ts`, CSP-header mutation lives in the dev CSP injector — **two distinct jobs, one value** (A-L1) | unifying the two so the CSP injector re-templates tags, or `viteAssets` minting/caching a nonce (S-F4) |
| The plugin set Lockness returns to Vite | `src/mod.ts` — the `lockness()` factory (aggregate root) | assembling the plugin array in `demo/vite.config.ts` instead of calling `lockness()` |

## 6. Technical context

- **Language/runtime:** Deno, TypeScript, TC39 decorators (n/a here — build
  tooling, not MVC).
- **Build tool:** **Vite 8** (`npm:vite@^8`), Rolldown-based bundler. Root
  already sets `nodeModulesDir: "auto"` (needed for Vite's native deps).
- **Testing:** `deno test` (unit per plugin; e2e smoke in the demo, #115).
- **Storage:** none.
- **Scale/constraints:** dev tooling; hot paths are the dev request loop
  (asset-request predicate, CSS injection) and the manifest read (cache once).

**Domain Model (bounded context: `build`, from #64).**
- **Aggregate root** `VitePlugin` — the `lockness()` factory; owns the returned
  plugin array; orchestrates DevServer, ClientEntry, DenoResolver.
- `ManifestReader` — reads + caches the Manifest; shared by `viteAssets` in prod.
- **Value objects / vocabulary:** `DevServer`, `SSR Bridge`, `Manifest`,
  `ClientEntry`, `ServerEntry` (referenced, not bundled), `ViteAssets`,
  `DenoResolver`, `DEFAULTS`.
- **Invariants:** Vite-internal requests never reach `App.fetch()`; a missing
  manifest in production throws (never silent); `main.ts` is never bundled; **dev
  mode never reads a (possibly stale) manifest** — mode is dev-server-context-first
  (A-H1); the dev server **binds loopback (127.0.0.1) by default** and keeps Vite
  `server.fs.strict: true` (S-F1); the bridge forwards method, headers and body
  **verbatim** (S-F6); the resolver **delegates to Deno and performs no custom
  fetch** (S-F7).
- **Out of scope:** island discovery, client-side routing, a Lockness client
  runtime (stubbed), CSP-hash mode, migrating the template app.

**Module layout (§6, split so the god-file is designed away — A-M dev_server).**
`dev_server.ts` (bridge + the asset-request predicate only), `css.ts` (#111
collection / injection / Tailwind watcher), `hmr.ts` (#112 reload), plus
`manifest_reader.ts` (all manifest fs access + `mode()`), `vite_assets.ts`,
`define_config.ts`, `shared.ts` (pure data: `DEFAULTS`, glob sets, `TAILWIND_CLI`),
`plugins/deno.ts` (the resolver), `plugins/client_entry.ts`, and `mod.ts`
(`lockness()` aggregate root + public re-exports).

- **`plugins/deno.ts` imports nothing Lockness-specific** (no `shared.ts`) so the
  resolver stays reusable outside Lockness, per the epic scope (A-L2).
- **The resolver invokes Deno via `Deno.Command` with an argument array (never a
  shell string, never `shell:true`) and validates each specifier** against a
  bounded `jsr:`/`npm:`/`https:` allowlist pattern before any subprocess/fetch
  (S-F2). Prefer a programmatic resolve over spawning `deno info`.

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| 1 — no direct `hono` import | **PASS** — the package is framework-agnostic; the bridge takes `App.fetch()` (a web-standard `{ fetch }` handler) by injection and never imports `core`/`hono`. `viteAssets` returns a plain tag result, not JSX. |
| 2 — JSR-only specifiers | **PASS with declared exception** — `npm:vite@^8` (no JSR build of Vite), justified inline per rule 2; everything else JSR (`@std/*`). |
| 3 — no `any` in exported APIs | **PASS** — `defineViteConfig`, `viteAssets`, config/result types are concrete; Vite's `Plugin` type is imported from `vite`. |
| 4 — Tailwind v4 syntax | **N/A** — package ships no Tailwind utility classes; it invokes the existing Tailwind CLI. |
| 5 — pre-completion gate | **Enforced** per child (fast gate) and at epic merge. |
| 6 — never hand-edit `deno.lock` | **Observed** — `deno cache`/tasks regenerate it. |
| 7 — JSDoc on public APIs | **Required** on every export (`lockness`, `defineViteConfig`, `viteAssets`, types, `DEFAULTS`). |
| 8 — MVC layering | **N/A** — build tooling, not controller/service/model. Recorded exemption. |
| 9 — commit discipline | **Epic loop** — one commit per child, scope-tagged, `chore(deps)` for the `deps.policy` widening split out. |
| No silent catches | **Required** — manifest/import/resolve failures log or throw with a clear message (#110/#113 mandate it). |

No violations → no Complexity Tracking entries.

## 8. Surface impact

- **New public package `@lockness/vite`** — exported surface: `lockness()`,
  `defineViteConfig()`, `viteAssets()`, `LocknessViteConfig`,
  `ViteAssetsTagResult`, `DEFAULTS`. Consumed by a user's `vite.config.ts` and
  server view code.
- **Root `deno.jsonc`** — workspace array gains `./packages/vite`.
- **`deps.policy.jsonc`** — new `"vite"` implementation-tier entry (own
  `chore(deps)` commit); `docs/dependencies.md` regenerated by `deps:analyze`.
- **`docs/vite.md`** + root README link + `docs/STUBS.md` (#116).
- **`packages/vite/demo/`** — smoke-test app (#115).
- **Codegen:** `deno task agents:brief` must be run so `packages/vite/AGENTS.md`
  exists (pre-push hook rejects a stale/missing brief).
- **`scripts/deps_analyzer.ts`** (A-M blast radius) — `collectSourceFiles`
  excludes only `tests`/`stubs`, and `ownerOf` attributes everything under
  `packages/vite/` to `vite`; the `demo/` (FR-011) would be scanned and its bare
  `@lockness/*` imports mis-attributed, tripping the drift gate. Add `demo` to
  the exclusion set (or make the demo a self-contained member with its own import
  map). **Counted, previously un-listed.**
- **Root `AGENTS.md`/`CLAUDE.md` package index** (one file, a symlink) — the
  hand-maintained per-package brief + docs tables need an `@lockness/vite` row.
  `agents:brief` generates the package file, not the root index. **Counted,
  previously un-listed.**

**No new user-facing UI.** This is build tooling; the demo's page is a smoke-test
fixture, not a shipped surface. Per the plan contract's FE-surface gate, there is
no front-end surface introduced → **no Visual Prototyping / artifacts subsection**
and the `mobile-first-contract` does not apply.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| **Rolldown compat (Vite 8).** The Deno resolver references (`@deno/vite-plugin`, Fresh `plugins/deno.ts`) were written against Rollup; Vite 8 replaces Rollup/esbuild with Rolldown. | #106 validates the resolver against Rolldown first; Vite 8 ships a Rollup-compatible plugin API + config compat layer. Treat "resolver works under Rolldown" as #106's first acceptance gate. |
| **Environment API still experimental in Vite 8.** The SSR dev-load API may shift. | Per #103, isolate the dev SSR path behind one seam in `dev_server.ts`; use the stable middleware-mode + same-runtime path; do not build on unstable Environment internals. |
| **Deno↔npm interop for Vite** (node_modules/.bin, native deps). | Root already sets `nodeModulesDir: "auto"`; document the `--node-modules-dir`/permission flags in #116. |
| **Epic size** (12 children, one branch). | Epic loop: one commit per child, scope-tagged; resume reconstructs from git + board. No worktree (see decisions) to avoid the known developer-agent worktree turn-limit trap. |
| **Client runtime does not exist.** `lockness:client-entry` re-exports a runtime Lockness may not ship. | #109 stubs it; SSR-first is the intended posture (see open question Q-client). |
| **Branch divergence** — #64's body prescribes a `feat/vite-epic` worktree; Specnaut put the epic on `015-vite-package-skeleton`. | Follow the Specnaut branch (single working tree, no worktree). Documented deviation. |

## 10. Architecture audit

`architect-expert`, on this plan, before any code. Verdict **fail** (2 HIGH) —
all findings are plan edits; none re-scope the epic. Coverage: FR→row mapping,
home correctness, DAG acyclicity (verified against `deps.policy.jsonc` +
`scripts/deps_analyzer.ts` — **no reverse edge; `core` never imports `vite`**),
blast-radius count, three-cycles-out prediction.

| ID | Sev | Finding | Disposition |
| :--- | :--- | :--- | :--- |
| A-H1 | HIGH | Mode = "manifest-exists" contradicts the "never read a stale manifest in dev" invariant — a leftover manifest flips the running dev session into production and serves stale hashed URLs. | **Fixed in plan.** §5 mode row + §6 invariant now dev-server-context-first; §12 decision corrected. |
| A-H2 | HIGH | Decision table incomplete: FR-008 (CSS) had no row, and row 4's "all configurable paths" omitted the CSS input/output + Tailwind command; `public/css/app.css` ≠ `outDir`. | **Fixed in plan.** Added the CSS/Tailwind row + glob-arbiter row; FR-003 gains `cssInput`; prod CSS reconciled to hashed-under-`outDir`. |
| A-M1 | MED | Blast radius under-counted — `scripts/deps_analyzer.ts` (demo scan) and the root package index un-listed. | **Fixed in plan.** Both added to §8, counted. |
| A-M2 | MED | Mode predicate homed in `shared.ts` belongs on `ManifestReader` (TOCTOU / I/O in a constants module). | **Fixed in plan.** Moved to `ManifestReader.mode()` (§5, §6). |
| A-M3 | MED | `dev_server.ts` is a god-file-in-waiting (#108+#111+#112 converge). | **Fixed in plan.** §6 module layout splits `dev_server.ts` / `css.ts` / `hmr.ts`. |
| A-M4 | MED | Row 2 forbids the demo's *required* `vite` pin without a single source. | **Fixed in plan.** New demo-pin row names `packages/vite/deno.json` as the authoritative range. |
| A-L1 | LOW | Row 10 conflated tag-attribute nonce with CSP-header mutation. | **Fixed in plan.** Split into value-source + two uses. |
| A-L2 | LOW | Resolver reusability vs a `shared.ts` import. | **Fixed in plan.** §6 asserts `plugins/deno.ts` imports nothing Lockness-specific. |

**Forward note (not a finding):** SSG #54 will later want `lockness()` to expose a
build hook — a future consumer, out of scope here.

## 11. Security audit

`security-expert`, on this plan, before any code, concurrently with §10. Verdict
**needs_followup** — **0 CRITICAL / 0 HIGH** under the intended loopback posture;
3 MEDIUM, 4 LOW, all plan edits adding a named bound where the plan named none.
Coverage: dev-bridge input, resolver subprocess/fetch, manifest reader, `entry`
handling, nonce, dev CSP widening. (Kept separate from §10 by design.)

| ID | Sev | Finding | Disposition |
| :--- | :--- | :--- | :--- |
| S-F1 | MED (HIGH if bound off-loopback) | Dev-server bind host + Vite `server.fs` allowlist unpinned → unauthenticated `/@fs` source+secret read if bound non-loopback. | **Fixed in plan.** §6 invariant: loopback by default, `server.fs.strict:true` kept, warn on non-loopback. |
| S-F2 | MED | Resolver may shell out to `deno info` with an unvalidated specifier → build-time RCE from a crafted dependency specifier. | **Fixed in plan.** §6: `Deno.Command` arg-array, no shell, validated specifier allowlist. |
| S-F3 | MED | `viteAssets(entry)` must be a keyed manifest lookup, never a path built from `entry` (traversal). | **Fixed in plan.** New §5 row: keyed lookup via `ManifestReader`, unknown key throws. |
| S-F4 | LOW | Tag builder must attribute-encode nonce/URLs and never mint/cache a nonce. | **Fixed in plan.** §5 nonce row: opaque caller value, attribute-encoded. |
| S-F5 | LOW | Dev-only CSP widening (`localhost:5173`) must be provably absent from production. | **Accepted + test.** Structurally contained (mode-gated, dev-only middleware); a production-output test asserting no `localhost:5173` is required at #114. |
| S-F6 | LOW | Request-forwarding fidelity unbounded (proxy correctness = the app's guards). | **Fixed in plan.** §6 invariant: method/headers/body forwarded verbatim. |
| S-F7 | LOW | `https:` specifier resolution is build-time SSRF-adjacent. | **Fixed in plan.** §6 invariant: delegate to Deno, no custom fetch; #116 documents pinning/locking `https:` imports. |

## 11. Security audit

_Dispatched to `security-expert` on this plan before any code, in the same
message as the architecture audit. Findings and disposition folded in here,
kept separate from §10._

## 12. Open questions

_Presented at STOP 1. Answers recorded here, dated, once given._

**Answered by the user 2026-09-02:**
- **Q-merge → MVP checkpoint at #113.** This chain builds and merges **#105–#113**
  (skeleton → resolver → config → dev bridge → client-entry → viteAssets → CSS →
  HMR → production build). **CSP #114, demo #115, docs #116 are deferred to a
  second chain** and a second epic merge. The epic #64 stays open until that
  second chain closes them.
- **Q-devtask → prove in the demo, migrate later.** Root `deno.jsonc`
  `dev`/`css:watch`/`css:build` tasks are **not** changed by this epic; the
  integration is proven in `packages/vite/demo/` (which lands in the deferred
  #115). Switching the template app's dev workflow is a follow-up issue.

**Decided from context / your standing instruction (one line each; correct me if
wrong):**
- **Vite 8 target** — per your 2026-09-02 "use the latest Vite"; supersedes
  #103's Vite 7 (research addendum to be recorded).
- **No git worktree** — implement on `015-vite-package-skeleton` directly, to
  avoid the known worktree turn-limit failure mode.
- **Client runtime stubbed** — Lockness is SSR-first; `lockness:client-entry`
  ships a placeholder client runtime (Q-client below only if you want more).
- **Production-mode detection is dev-server-context-first** (A-H1 correction):
  `runningUnderViteDevServer ? dev : (manifestExists ? production : dev)`, homed on
  `ManifestReader.mode()` — *not* bare manifest-exists (which would flip a live dev
  session to production after any prior build).
