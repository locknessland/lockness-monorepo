# Plan — Static Site Generation (`@Static` + `ssg:build`)

**Feature dir:** `.specnaut/specs/028-static-site-generation/`
**Linked issue:** [#54](https://github.com/locknessland/lockness-monorepo/issues/54) — Implement SSG
**Branch:** `028-static-site-generation`

---

## 1. Why this exists

A Lockness app today can only be served by a running Deno process. There is no way to
pre-render a route to a file and host it on a plain CDN or static host. That rules out the
cheapest, most resilient deployment target for the parts of a site that never change.

The measurable gap: across the five genuinely-static controllers on the Lockness site
(`app/controller/{docs,ui,llm,app,demo}_controller`) there are 14 GET routes, of which **10 are
parameterless** and 4 are parameterized (`docs/:slug`, `docs/llms/:slug`, `ui/:slug`,
`ui/llms/:component`). Today **zero** can ship as static HTML.

**Scope honesty (architecture audit F6):** v1 emits the **landing / index pages** of those
controllers — the 10 parameterless routes. The per-slug **content** pages (docs articles, the
UI-catalogue entries) are the 4 parameterized routes, and their slug lists are exactly the
on-disk data v1 forbids reading at build time. So v1 delivers zero-runtime hosting of the
static/landing subset; the content pages await the deferred build-time-data feature, unless a
developer hand-lists their slugs in `params`.

Opt-in via a `@Static` decorator keeps every other route dynamic and the API ergonomic — the
same shape developers already know from `@Cache` / `@Throttle`.

## 2. User scenarios

**P1 — Ship a static page (SC-001, SC-002, SC-006)**
Given a controller method decorated `@Static` with a parameterless route,
When the developer runs `deno task cli ssg:build`,
Then the route is rendered in-memory and written to `dist/<path>/index.html`, and the build
reports each file written.

**P1 — Dynamic routes are untouched (SC-003)**
Given a controller with a mix of `@Static` and plain routes,
When `ssg:build` runs,
Then only the `@Static` routes are emitted; plain routes are neither rendered nor written and
continue to serve dynamically at runtime.

**P2 — i18n: one page per curated locale (SC-004)**
Given a `@Static` route and a curated locale list `['en-us', 'fr-ca']` in the kernel SSG config,
When `ssg:build` runs and the app declares an i18n mount point,
Then the route is emitted once at root and once per curated locale under the app's **actual**
mount prefix (`dist/en/us/<path>/index.html`, `dist/fr/ca/<path>/index.html`) — never the full
`validLanguages × validCountries` product.

**P2 — A broken static route fails the build loudly (SC-005)**
Given a `@Static` route whose handler throws during render,
When `ssg:build` runs,
Then the build aborts with a non-zero exit and an error naming the route and cause — no partial
`dist/` presented as success.

**P2 — A static controller that fails to load fails the build (SC-008)**
Given a controller owning `@Static` routes that throws on import or instantiation,
When `ssg:build` runs,
Then the build aborts non-zero naming the file — it never warns-and-skips (which would emit a
`dist/` silently missing pages).

**P3 — Parameterized static route is caught early (SC-007)**
Given `@Static` on a route with a path parameter and no explicit `params` list,
When `ssg:build` runs,
Then the build fails with a clear message to supply `params` or remove `@Static` — never a
silent skip, never a data fetch to discover the values.

**Edge cases**
- Two render targets resolving to the same output path → build fails with a collision error (never a silent overwrite).
- `@Static` on a non-GET route → build fails (only GET is renderable to a file).
- A route/param/locale segment containing `..`, an absolute segment, or a control char → build fails before writing (SC-009).
- No `@Static` route found → build exits 0 with a "nothing to render" notice, writing nothing.
- `dist/` already exists → its `@Static`-owned tree is regenerated; the build does not wipe unrelated files it did not write.

## 3. Requirements

- **FR-001** — A `@Static` decorator MUST be applicable to a controller method and to a whole
  controller class (class-level marks every GET route static).
- **FR-002** — `@Static` MUST accept optional `StaticOptions`; in v1 the only field is
  `params?: ReadonlyArray<Record<string, string>>` — an explicit, literal enumeration of a
  parameterized route's values. It MUST NOT expose any data-fetching hook.
- **FR-003** — SSG MUST run as a standalone CLI command (`ssg:build`) implementing the same
  `CommandContract` as `CompileCommand`, living in `packages/core/cli/`. It MUST NOT be a Vite plugin.
- **FR-004** — The command MUST enumerate `@Static` routes by the same discovery mechanism
  `router:list` uses (dynamic import of the controllers dir, read decorator metadata off the
  constructor), never a hand-maintained route list.
- **FR-005** — Each render target MUST be produced by `App.fetch(new Request(url))` on a
  fully-booted app instance — no `Deno.serve`, no HTTP socket. Only GET routes are renderable.
- **FR-006** — Rendered HTML MUST be written to `dist/` using a clean-URL directory convention:
  route `/x/y` → `dist/x/y/index.html`, route `/` → `dist/index.html`. `outputPathFor` MUST
  **normalize** the candidate, **reject** any path/param/locale segment not matching a strict
  allowlist (`/^[a-z0-9._-]+$/`, no leading `.`), **assert** the resolved path is contained
  within the resolved `dist/` root, and **abort** the build on any violation.
- **FR-007** — Output MUST be host-agnostic: plain HTML files, no Deno-Deploy- or
  platform-specific artefact.
- **FR-008** — For every curated locale, the command MUST additionally emit the route under the
  app's registered i18n mount prefix. The locale-URL prefix shape MUST be **derived from the
  app's `mountPoint`** (whose authoring home is `config/routing.ts`), never a literal
  `/<lang>/<country>` restated in the command. The curated locale set MUST come from the
  **kernel SSG config** (`@Kernel({ ssg: { locales } })`), discovered via the same
  `KERNEL_CONFIG` marker `createApp` already uses — not a magic `config/i18n.ts` path — and each
  entry MUST validate against `isValidLanguage` / `isValidCountry`.
- **FR-009** — A `@Static` handler that throws during render MUST abort the whole build with a
  non-zero exit and an error naming the route; no successful-looking partial output.
- **FR-010** — A parameterized `@Static` route with no `params` list MUST fail the build with a
  clear, actionable message. A non-GET `@Static` route MUST fail the build.
- **FR-011** — Two render targets resolving to the same output path MUST fail the build with a
  collision error.
- **FR-012** — During `ssg:build`, an import OR instantiation failure of any candidate
  controller MUST be **fatal** (abort non-zero, name the file). The build path MUST NOT inherit
  `router:list`'s warn-and-continue, which would return success indistinguishable from a
  complete build.
- **FR-013** — `@Static` renders run the full app + global-middleware stack with the developer's
  environment loaded. v1 MUST (a) print a warning that this is so, and (b) document `@Static`
  routes as required to be **state-free and secret-free** (no per-request tokens/nonces, no
  env/secret data in the body). A restricted-env / "no-secrets" render context is recorded as a
  deferred hardening (see §11 disposition), not a v1 deliverable.

## 4. Success criteria

- **SC-001** — A developer turns a parameterless route into a static file with one decorator and one command.
- **SC-002** — The five dogfood controllers' parameterless (landing/index) routes are emitted to `dist/` and render correctly under a plain static file server.
- **SC-003** — After a build, every non-`@Static` route still responds dynamically; runtime serving is unchanged.
- **SC-004** — For a route and a two-entry curated locale list, the build emits exactly three files (root + two locales), not 1 + 25.
- **SC-005** — A throwing `@Static` route makes the command exit non-zero and name the route; `dist/` is not presented as finished.
- **SC-006** — The build prints, per emitted file, its route and its output path.
- **SC-007** — A `@Static` route with a `:param` and no `params` list is reported before any file is written, with an actionable message.
- **SC-008** — A controller that fails to import/instantiate makes the build exit non-zero and name the file (never a silent skip).
- **SC-009** — A traversal/absolute/control-char segment in a route, param, or locale is rejected before any write.

## 5. 🔒 The decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Which routes are static (opt-in) | `@Static` metadata on the controller constructor — `_staticConfigs` in `packages/contract/routing/decorators.ts` | a hardcoded route list in `ssg_command.ts`; a `dist`-paths array in config; a second "isStatic" flag |
| Which locales are emitted | the kernel SSG config `@Kernel({ ssg: { locales } })`, discovered via `KERNEL_CONFIG` | a literal locale array in the command; deriving `validLanguages × validCountries`; a magic `config/i18n.ts` export path |
| The i18n locale-URL prefix shape | the app's registered `mountPoint` (authored once in `config/routing.ts`), read from the booted app / kernel config | hardcoding `"/<lang>/<country>"` in `ssg_command.ts` |
| The output path for a rendered URL (normalized + contained) | `outputPathFor` in `packages/core/ssg/paths.ts` — normalizes, allowlists segments, asserts inside `dist/` | inline `join(dist, …)` at each write site; a second path rule for locale URLs; an unguarded write |
| A `@Static` route that throws aborts the build | the single render loop's try/catch in `packages/core/ssg/build.ts` | a per-route skip-and-continue; swallowing the error and writing a placeholder |
| A controller that fails to import/instantiate aborts the build | the enumeration step in `packages/core/ssg/enumerate.ts` (fatal) | inheriting `router:list`'s warn-and-continue on the build path |
| Two render targets colliding aborts the build | the render loop in `packages/core/ssg/build.ts` (collision set) | an inline overwrite check per write site |
| Only GET is renderable | the enumeration step in `packages/core/ssg/enumerate.ts` (validated before a target is built — fail fast) | a GET check duplicated in the render loop; rendering a non-GET |
| Render only via `App.fetch` (no socket) | the render loop in `packages/core/ssg/build.ts` | a `Deno.serve`/socket render satisfying FR-005 by other means |
| Build-time data is forbidden in v1 | the shape of `StaticOptions` in `decorators.ts` — no data/fetch field (**API-shape only**, see note) | adding a `data:`/`loader:` field without amending this plan; the command reading a DB or calling `fetch` |
| A parameterized static route needs explicit params | the enumeration step in `packages/core/ssg/enumerate.ts` (validates params present) | discovering params by querying data; silently skipping the route |
| SSG is a command, not a Vite plugin | `packages/core/cli/ssg_command.ts` as the single home | a later Vite plugin re-implementing the render/emit path |

> **Note on the "build-time data forbidden" row (security L3 / F3):** this row homes the
> *decorator API* only. A `@Static` handler, a shared layout, or global middleware run through
> `App.fetch` can still call `fetch` / `Deno.env` / an injected DB service — so "no build-time
> data" is an **enforced API shape plus a documented convention**, not a runtime-enforced
> invariant. That gap is the enabler for the confidentiality risk in §11; it is stated here so
> the row is not read as a guarantee.

**Binding on the implementer.** A decision may not move out of its home without this plan being
amended first. Two homes for any row above is a plan violation, not a style opinion.

## 6. Technical context

- **Language / runtime:** Deno, TypeScript, TC39 Stage-3 decorators.
- **Testing:** `Deno.test`; `App.fetch` drives in-memory renders in tests (no socket) — the same primitive the command uses.
- **Constraints:** hard rules #1 (no direct `hono`), #2 (JSR-only, bare in source / pinned in the importing `deno.json`), #3 (no `any` in exported APIs), #7 (JSDoc), #8 (MVC / thin command).
- **Scale:** bounded by (number of `@Static` routes) × (1 + curated locales) — tens, not thousands, in v1.

### Domain Model

- **Bounded contexts:** *routing* (the `@Static` opt-in + enumeration) and *build* (render + file emission). They meet at one value object, `RenderTarget`.
- **Vocabulary:** *Static route* (a GET route opted in via `@Static`); *Curated locale* (a `lang-country` tuple in the kernel SSG config); *Render target* (a static route × a locale-or-root, with URL to fetch and file to write); *Emitted page* (HTML written to `dist/`).
- **Value objects:** `StaticOptions { params? }`; `RenderTarget { url, outputPath }`.
- **Entities:** none — the build is a pure function from decorated controllers + kernel config to a `dist/` tree.
- **Invariants:** only GET routes render; every render target has exactly one contained output path; a render OR load failure aborts the whole build; no build-time data access in v1.
- **Out of scope (domain):** ISR, on-demand revalidation, RSS/sitemap, full auto-discovery without `@Static`, build-time DB/`fetch`.

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| #1 No direct `hono` import | PASS — renders via `App.fetch`; any Hono helper from `@lockness/core`. |
| #2 JSR-only specifiers | PASS — only `@std/fs`, `@std/path`, workspace packages; bare in source, pinned per `deno.json`. |
| #3 No `any` in exported APIs | PASS — `StaticOptions`, `RenderTarget`, build entry fully typed; enumeration uses `unknown` + guards for dynamic imports. |
| #4 Tailwind v4 syntax | N/A — no CSS authored. |
| #5 Pre-completion gate | Enforced at implement time. |
| #6 Never hand-edit `deno.lock` | PASS. |
| #7 JSDoc on public APIs | PASS — `@Static`, `StaticOptions`, the kernel SSG config type, the build entry all documented. |
| #8 MVC / thin command | PASS — `ssg_command.ts` orchestrates only; enumerate/render/write live in `packages/core/ssg/`. |
| TDD | PASS — failing tests first for the decorator, enumerator, path rule (incl. traversal rejection), build loop, fatal-load behaviour. |
| No silent catches | PASS — **on the build path**, import/instantiation failures are fatal (FR-012), the render loop aborts on throw (FR-009); no warn-and-continue. (This corrects the earlier draft, which inherited `router:list`'s warn-skip — architecture audit F2.) |

No violations → no Complexity Tracking entries.

## 8. Surface impact

- **CLI surface (developer-facing):** one new command `ssg:build`, registered alongside core commands. No new HTTP route, no runtime behaviour change.
- **Public API surface:** `@Static` decorator + `StaticOptions` type, exported from `@lockness/contract` and re-exported through `@lockness/core` (the path `@Cache` / `@Throttle` take); a new `ssg` field on the `@Kernel` config with its type in `@lockness/core`.
- **Config surface:** `@Kernel({ ssg: { locales } })` — the curated locale list's home.
- **Build output surface:** a `dist/` tree of `index.html` files.
- **No front-end surface added.** This feature renders *existing* pages to files; it introduces no new UI/component/UX flow — so, per the plan phase's FE gate, no Visual Prototyping subsection applies.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| R1 — Locale output explosion (5×5=25). | Curated kernel `ssg.locales` list is the only source of emitted locales; the product is never derived. |
| R2 — Build-time-data scope creep. | `StaticOptions` carries no data hook; params are literal-only; a parameterized route without them fails fast (FR-010). |
| R3 — A `@Static` route renders **runtime state or secrets** into a published file. | Two distinct cases: *correctness* — a handler reading session/DB returns degraded HTML (opt-in + docs + FR-009 catches throws; a non-throwing degradation cannot be auto-detected — **accepted**); *confidentiality* — a handler/layout/middleware interpolates an env secret/API key/signed URL/CSRF token into the body, which then ships to a public CDN permanently (FR-013 warning + state-free/secret-free docs; restricted-env render deferred — see §11). |
| R4 — `App.fetch` needs a fully-booted app at build time. | The command bootstraps via `createApp(Kernel)` exactly as `main.ts`, reusing the kernel discovery `compile_command` performs. |
| R5 — Clean-URL vs `.html` host differences. | Directory + `index.html` convention (FR-006); documented. |
| R6 — Path-traversal write via a param/locale/route segment. | `outputPathFor` normalizes, allowlists segments, and asserts containment under `dist/` (FR-006); LOW in v1, prevents a HIGH once build-time data lands. |

## 10. Architecture audit

`architect-expert`, on `plan.md`, before code. Backlog cross-checked: only #54 and #151 (unrelated) open under `domain:routing`/`domain:build` — no `confirms #N`. **Verdict: fail** (2 HIGH), both folded into the design below. Coverage: decision-table completeness, home correctness, blast radius (counted), three-cycles-out.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| F1 | HIGH | `ssgLocales` home (`config/i18n.ts` bare export) has no discovery contract and diverges from the kernel-discovery precedent; core→app import would be a layer violation. | **Plan changed.** Curated locales moved to `@Kernel({ ssg: { locales } })`, discovered via `KERNEL_CONFIG` (FR-008, §5 row 2). |
| F2 | HIGH | Enumeration "warn, matching router:list" silently drops `@Static` controllers → contradicts FR-009/SC-005 loud-failure guarantee (silent-catch smell). | **Plan changed.** FR-012 added: import/instantiation failure on the build path is fatal; §7 "No silent catches" corrected; §5 row added. |
| F3 | MED | §5 omitted rows for FR-011 (collision), FR-005 (GET-only + render primitive), FR-003 (command-not-plugin). | **Plan changed.** Three rows added to §5. |
| F4 | MED | The i18n locale-URL shape was a second home for the mount pattern (config/routing.ts is the first). | **Plan changed.** FR-008 now derives the prefix from the app's `mountPoint`; §5 row added. |
| F5 | MED | Build module in `@lockness/core` is defensible for v1 but tensions with "minimal core"; a new package now would be speculative generality. | **Accepted for v1, trigger recorded:** keep `packages/core/ssg/`; the deferred build-time-data feature (DB/fetch in a runtime package) is the trigger to extract to a standalone opt-in package mirroring `@lockness/vite`. |
| F6 | MED | §1 oversold — v1 emits landing/index pages, not the docs/UI content (parameterized) pages that motivate it. | **Plan changed.** §1 reworded with the counted 10-parameterless / 4-parameterized split; content pages named as awaiting build-time data. |
| F7 | INFO | Blast radius of `@Static` + kernel `ssg` config is near-zero (additive; 0 existing routes/consumers altered). | Recorded — the opt-in design working as intended. |

## 11. Security audit

`security-expert`, on `plan.md`, before code. Backlog cross-checked: no open `security` items; only #54/#151 under the domain labels — findings are new. **Verdict: needs_followup** (0 CRITICAL/HIGH; 2 MEDIUM, 2 LOW), all folded. Kept separate from §10.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| S1 | MED | `outputPathFor` had no specified containment guard/segment allowlist — a `..`/absolute/NUL param, route, or malformed locale writes outside `dist/`. LOW in v1 (self-inflicted, repo-write boundary); becomes a HIGH traversal **write** once v2 build-time data makes `params` attacker-influenced. | **Plan changed.** FR-006 now mandates normalize + `/^[a-z0-9._-]+$/` segment allowlist + assert-inside-`dist/` + abort; locale entries validated via `isValidLanguage`/`isValidCountry` (FR-008). §5 row-4 + R6. |
| S2 | MED | `@Static` render (full app + global middleware, `.env` loaded) can bake env secrets / API keys / signed URLs into HTML published to a public CDN — permanent, edge-cached. R3 covered only degraded HTML, not confidentiality. | **Plan changed.** R3 widened to name the confidentiality case; FR-013 added (build warning + state-free/secret-free docs). **Restricted-env / "no-secrets" render context deferred** as a v1-out hardening — recorded here rather than built, to keep v1 thin; revisit with build-time data. |
| S3 | LOW | "No build-time data in v1" is an API-shape convention, not an enforced invariant (handler body unconstrained). | **Plan changed.** §5 note under the row states the enforcement gap explicitly; kept as accepted risk, not a guarantee. |
| S4 | LOW | A per-request CSRF token / CSP nonce on a `@Static` page freezes into the cached file, weakening that control. | **Plan changed.** FR-013 + docs require `@Static` routes to be state-free (no per-request tokens/nonces); build-time warning if feasible. |
| S5 | INFO | Build-time execution of controller code via dynamic import is **not** a new trust boundary (identical to dev/compile/tests, `-A`). | Recorded so it is not re-raised; keep the router:list precedent for the *import mechanism* (but fatal on failure per FR-012). |

**Forward-looking (both audits agree):** S1 and S2 are ~one-line fixes now and become HIGH-severity exploitable — traversal write and stored XSS/secret-leak baked into static files — the moment build-time data (the deferred high-value feature #54 names) lands. Both are designed into v1 despite v1 being unable to trigger them.

## 12. Open questions

_Asked at STOP 1; answers recorded here as settled decisions with their date._

**Q1 — Parameterized `@Static` routes in v1: support the literal `params` list, or parameterless-only?**
- **(A, recommended)** Support a literal `params` array (FR-002 as written) — a developer can
  hand-list a small, stable slug set (e.g. a fixed nav) and get those pages statically, with no
  data access. Costs a little more enumeration/validation code; keeps the door open without
  touching the no-build-time-data boundary.
- **(B)** Parameterless-only in v1 — any `@Static` on a parameterized route is a hard error.
  Simpler and smaller; but even a 3-item fixed list must wait for the build-time-data feature.

_Answer (2026-09-03):_ **(A) Allow the literal `params` list.** FR-002 stands as written — `@Static` accepts an optional `params` array of literal value maps; a developer can hand-list a small fixed slug set for static output with no data access, while a parameterized `@Static` route with no `params` list still fails fast (FR-010). No build-time-data boundary is touched.

**Decisions taken from the code / standing rules (not asked):**
- Locale URL shape is derived from the real mount pattern `/<lang>/<country>` (`config/routing.ts`) — **correcting** the issue body's `/fr/about` example.
- SSG is a standalone command, not a Vite plugin — settled by `packages/vite/src/build_config.ts` ("No SSR build artifact is produced").
- Rendering uses `App.fetch`, not Hono's `toSSG` app-walk (which renders *every* GET route — the opposite of opt-in). `toSSG`/`ssgParams` stay available on the bridge but are not the chosen path.
- Output convention is directory + `index.html` (clean URLs).
- Curated locales live in the kernel SSG config, discovered via `KERNEL_CONFIG` (architecture F1).
