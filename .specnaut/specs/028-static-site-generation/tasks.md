# Tasks — Static Site Generation (`@Static` + `ssg:build`)

**Feature dir:** `.specnaut/specs/028-static-site-generation/` · **Issue:** #54 · **Branch:** `028-static-site-generation`
Derived from the approved `plan.md`. TDD is mandatory (constitution) — a failing test precedes its code in every story. Each task names the plan §5 decision-table **home** where it touches a homed rule.

**Legend:** `[P]` = parallelizable (different files, no incomplete dep) · `[USn]` = user-story phase.

---

## Phase 1 — Setup

- [X] T001 Create the SSG module dir `packages/core/ssg/` with a `mod.ts` barrel (empty exports for now) and confirm `packages/core/deno.json` needs no new dependency (only `@std/fs`, `@std/path`, already present).
- [X] T002 Add an `ssg:build` command skeleton in `packages/core/cli/ssg_command.ts` implementing `CommandContract` (mirror `compile_command.ts`: `static _commandName = 'ssg:build'`, `_commandDescription`, `handle(ctx)`); handler prints "not yet implemented" and returns. This file is the single home for "SSG is a command, not a Vite plugin" (§5 row 11).

## Phase 2 — Foundational (blocking prerequisites for all stories)

**`@Static` decorator (§5 row 1 home: `packages/contract/routing/decorators.ts`)**
- [X] T003 [P] Write failing tests in `packages/contract/tests/static_decorator.test.ts`: method-level `@Static` records the method in `_staticConfigs`; class-level `@Static` marks the class; `StaticOptions.params` is stored; metadata initializes via `addInitializer` on first instance (mirror the `@Cache` test pattern).
- [X] T004 Add `StaticOptions { params?: ReadonlyArray<Record<string, string>> }` and `_staticConfigs?: Record<string, StaticOptions>` (+ a class-level marker) to `ControllerWithMetadata` in `packages/contract/routing/decorators.ts`; implement `@Static` cloning the `@Cache` mechanism (L657). No data/fetch field (§5 row "build-time data forbidden", API-shape home). Full JSDoc.
- [X] T005 Re-export `Static` + `StaticOptions` through `packages/contract/mod.ts` and confirm `@lockness/core` re-exports them (same path as `@Cache`/`@Throttle`). Run `deno check` on both packages.

**Kernel SSG config (§5 row 2 home: `@Kernel({ ssg: { locales } })`, `KERNEL_CONFIG`-discovered)**
- [X] T006 [P] Write failing tests in `packages/core/tests/kernel_ssg_config.test.ts`: a kernel decorated with `ssg: { locales: ['en-us'] }` exposes it via `KERNEL_CONFIG`; absent config yields `undefined` (root-only build).
- [X] T007 Add the `ssg?: { locales?: readonly string[] }` field to the `@Kernel` config type and its `KERNEL_CONFIG` storage (`packages/core/kernel/kernel_decorators.ts`); JSDoc. This is the single home for "which locales are emitted".

**Output path with containment (§5 row 4 home: `packages/core/ssg/paths.ts` — security S1/R6)**
- [X] T008 [P] Write failing tests in `packages/core/ssg/tests/paths.test.ts`: `/` → `dist/index.html`; `/x/y` → `dist/x/y/index.html`; a locale prefix nests correctly; **rejects** a segment with `..`, an absolute segment, a control char, or not matching `/^[a-z0-9._-]+$/` / leading `.` (SC-009); asserts the resolved path is inside the resolved `dist/` root.
- [X] T009 Implement `outputPathFor(url, distRoot)` in `packages/core/ssg/paths.ts`: normalize, segment-allowlist, containment assertion, throw a descriptive error on violation. Full JSDoc.

**Enumeration (§5 rows 6/8/10 home: `packages/core/ssg/enumerate.ts`)**
- [X] T010 [P] Write failing tests in `packages/core/ssg/tests/enumerate.test.ts`: enumerates only `@Static` GET routes from a fixture controllers dir; a non-GET `@Static` route errors (FR-010); a parameterized `@Static` route with no `params` errors with an actionable message (FR-010/SC-007); an import/instantiation failure is **fatal** (throws, names the file — FR-012/SC-008), NOT warn-and-skip.
- [X] T011 Implement `enumerate.ts`: dynamic-import the controllers dir (reuse the `router_commands.ts` discovery shape but make failures fatal per FR-012), read `_staticConfigs` + `_routes` off each constructor, produce a `RenderTarget { url, outputPath }` list (root variants only; locales added in US2), validate GET-only + params-present. Full JSDoc.

## Phase 3 — US1: Ship a static page (P1) 🎯 MVP

**Goal:** a parameterless `@Static` route renders to `dist/<path>/index.html`; dynamic routes untouched.
**Independent test:** decorate one fixture route `@Static`, run the build, assert the file exists and its bytes equal an `App.fetch` render; assert a non-`@Static` route wrote nothing.

- [X] T012 [P] [US1] Write failing tests in `packages/core/ssg/tests/build.test.ts`: the render loop fetches each `RenderTarget` via `App.fetch`, writes bytes through `outputPathFor`, reports per file (SC-006); a target that throws aborts the whole loop non-zero naming the route (FR-009/SC-005); two targets on the same output path abort with a collision error (FR-011); a non-`@Static` route is never fetched or written (SC-003).
- [X] T013 [US1] Implement `runSsgBuild(app, config, distRoot)` in `packages/core/ssg/build.ts`: iterate `RenderTarget`s, `App.fetch` each (GET-only, §5 "render only via App.fetch"), collision-detect via a seen-path set, write via `@std/fs` + `outputPathFor`, abort on throw. Full JSDoc. (§5 rows 5/7/8.)
- [X] T014 [US1] Wire `ssg_command.ts` `handle()`: discover + bootstrap the app via `createApp(Kernel)` (as `compile_command.ts` finds `KERNEL_CONFIG`), call `enumerate` then `runSsgBuild`, print the report, exit non-zero on any abort. Register the command so `deno task cli ssg:build` resolves.
- [X] T015 [US1] Add an integration test `packages/core/ssg/tests/build_integration.test.ts` driving a tiny in-memory app with one `@Static` and one plain route end-to-end through the command's build entry (temp `dist/`, cleaned up).

## Phase 4 — US2: i18n curated locales (P2)

**Goal:** each `@Static` route also emits under the app's real mount prefix, once per curated locale.
**Independent test:** with `ssg: { locales: ['en-us','fr-ca'] }` and an i18n mount, one route yields exactly 3 files (root + 2), never 25 (SC-004).

- [X] T016 [P] [US2] Write failing tests in `packages/core/ssg/tests/locales.test.ts`: curated locales expand a target into root + per-locale variants; the prefix is derived from the app's `mountPoint` (not a literal — §5 row 3); an entry failing `isValidLanguage`/`isValidCountry` aborts; the `validLanguages × validCountries` product is never produced.
- [X] T017 [US2] Extend `enumerate.ts` (or a `locales.ts` helper): read curated locales from the kernel `ssg.locales`, derive the prefix shape from the booted app's registered `mountPoint` (home `config/routing.ts`), validate each entry, expand each `RenderTarget`. Full JSDoc.

## Phase 5 — US3 & US4: loud failure + literal params (P2 / P3)

**Goal (US3):** a broken route or an unloadable controller fails the build, never a silent partial `dist/`.
**Goal (US4):** a literal `params` list expands a parameterized route; missing params still fails fast.
Most failure paths were coded in Phase 2–3; these tasks add the remaining behaviour + prove the ACs.

- [X] T018 [P] [US3] Verify/extend failure-path coverage in `build.test.ts` + `enumerate.test.ts`: the throwing-route abort message names the route+cause (SC-005); the unloadable-controller abort names the file (SC-008). Add code only where a message is missing.
- [X] T019 [P] [US4] Write failing tests in `enumerate.test.ts`: a `@Static` route with `params: [{slug:'a'},{slug:'b'}]` expands to two targets with substituted URLs and distinct output paths; a parameterized route with no `params` still errors (FR-010/SC-007); param values pass through `outputPathFor`'s allowlist (a `..` slug is rejected — ties to S1).
- [X] T020 [US4] Implement literal `params` expansion in `enumerate.ts` (Q1 decision A): substitute each param map into the route path, produce one `RenderTarget` per map, no data access. Full JSDoc.

## Phase 6 — Polish & cross-cutting

- [X] T021 [P] Implement FR-013: `ssg_command.ts` prints a warning that `@Static` renders run the full middleware stack with the environment loaded; state-free/secret-free guidance surfaced in the report.
- [X] T022 [P] Docs: add `packages/core/docs/ssg.md` (the `@Static` decorator, `ssg:build`, kernel `ssg.locales`, output convention, the state-free/secret-free contract and the no-build-time-data boundary); link it from the core docs index.
- [X] T023 [P] Update `packages/core/AGENTS.md` and `packages/contract/AGENTS.md` public-surface sections for `@Static` / `ssg:build` / kernel `ssg` config; add the doc row to root `AGENTS.md`'s package-doc table.
- [~] T024 [US1] Dogfood validation (qa): decorate the 10 parameterless routes across `app/controller/{docs,ui,llm,app,demo}_controller` with `@Static`, run `deno task cli ssg:build`, confirm each `dist/**/index.html` exists and renders under a plain static server (SC-002). Record the result; do not commit app-controller decoration if it is validation-only — capture in the qa note.
- [X] T025 Run `deno task deps:analyze` (confirm zero new dependency edge) and the full pre-completion gate `deno fmt && deno lint && deno check <files> && deno task test`; fix any red before declaring done.

---

## Dependencies & order

- **Phase 1 → 2 → 3** are strictly ordered (setup, then foundational decorator/config/paths/enumeration, then the MVP render loop).
- **US2 (Phase 4)** depends on US1's build loop + the kernel config (T007) and enumeration (T011).
- **US3/US4 (Phase 5)** depend on the build loop (T013) and enumeration (T011); largely tests + message polish over code already present.
- **Phase 6** depends on all stories.

## Parallel opportunities

- Within Phase 2: T003, T006, T008, T010 (four independent test files) run in parallel; their implementations (T004/T007/T009/T011) follow each.
- Phase 6: T021, T022, T023 are independent files.

## MVP scope

**US1 alone (Phases 1–3)** is a shippable increment: parameterless `@Static` routes → `dist/`, dynamic routes untouched, loud failure on throw. i18n (US2), params (US4) and the loud-load guarantee polish (US3) layer on without reworking it.

## Independent test criteria

- **US1** — one `@Static` route produces one correct file; a plain route produces none.
- **US2** — one route + two curated locales → exactly three files; never the 25-product.
- **US3** — a throwing route and an unloadable controller each abort non-zero, named.
- **US4** — a literal `params` list yields one file per entry; missing params fails fast.

## Implementation notes (2026-09-03)

- **T024 dogfood — partial (`[~]`).** The full SSG pipeline is validated end-to-end by
  `build_integration.test.ts` (a real `App` via `app.init`, one `@Static` + one dynamic route,
  `App.fetch` render, file writes, dynamic route untouched) and `createApp(AppKernel)` boots
  cleanly on its own. Running `deno task cli ssg:build` against the live site hit a **pre-existing,
  out-of-scope** failure: under the `--env`-loaded route table, `MountManager.probeCompile` throws
  `undefined is not iterable` inside Hono 4.11.1's reg-exp-router (resolved via `node_modules`).
  It reproduces on any full CLI app boot with the i18n mount + `--env`, is independent of every SSG
  file (the command only *calls* `createApp`), and matches the `constrainedParam` route-table
  interaction the `mount_pattern.ts` JSDoc already documents. **Logged for the PO** as a separate
  app-boot/Hono-resolution issue (a boundary this task does not touch); the live-controller dogfood
  should re-run once it is resolved.
- **Gate (T025):** `deno fmt && deno lint && deno check && deno task test` green — 1333 passed,
  0 failed, 2 ignored; `deno task deps:analyze` clean (no new edge).
