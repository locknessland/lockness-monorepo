# .tasks/ → GitHub Project #1 — Migration plan (dry-run)

**Date:** 2026-05-02
**Source:** `.tasks/*.md` (15 files, excluding `.template.md` and `.prompt.md`)
**Target:** Project #1 of `locknessland/lockness`
**Author:** product-owner subagent (dry-run; no mutations performed)

## Summary

- **9 tasks** already exist as **OPEN** issues on Project #1 — no creation needed; only verify body quality.
- **1 task** corresponds to a **CLOSED** issue (work shipped) — `.tasks/` file is stale and should be deleted.
- **3 tasks** need **NEW** issues created on Project #1.
- **2 tasks** are **AMBIGUOUS** and need Kevin's call (scope/intent unclear or possibly superseded).
- **Final disposition of `.tasks/` folder:** delete each `.md` after its corresponding GitHub issue is verified live (or the file is confirmed obsolete). Then delete `.template.md` and `.prompt.md` (legacy templates referencing the deprecated GEMINI.md flow), then remove the empty `.tasks/` directory. Add `.tasks/` to a denylist or note in `CLAUDE.md` to prevent reintroduction (already covered by the existing rule "do not create new task files there").

## Per-task disposition

| `.tasks/` file | Disposition | Issue # | Notes |
|---|---|---|---|
| `cached-decorator.md` | NEW | — | No matching open or closed issue. File is well-formed (clear objectives, file paths, API). Body content can be lifted nearly verbatim into `## Why` / `## Acceptance criteria` / `## Out of scope`. |
| `debug-event-dispatcher-cli.md` | MATCH | #90 | Issue title matches exactly: "CLI Debug Event Dispatcher". Verify issue #90 body has the four standard sections; if not, lift content from `.tasks/` file. |
| `devtools_ui_refactor.md` | MATCH (CLOSED) | #28 | Already shipped and CLOSED. The `.tasks/` file is stale. Verify the current code state matches the closed scope, then delete the file with no new issue. |
| `frontend-architecture.md` | AMBIGUOUS | — | This is a **decision log** ("Décision: Lockness reste sur SSR classique avec Hono JSX"), not a task. It lists future *options* (Islands, HTMX, Alpine) but commits to none. Possibly superseded by #54 (SSG) and #64 (Vite plugin). **Kevin's call needed.** |
| `improve-bump.md` | NEW | — | Small, well-scoped: preserve comments in `deno.jsonc` when running `scripts/bump.ts`. No matching issue. Easy lift. |
| `jsdoc-typesafety-guidelines.md` | AMBIGUOUS | — | Possibly **already enforced** by `.claude/CLAUDE.md` rule #3 (no `any` in exported APIs) and rule #7 (JSDoc on public APIs). The `.tasks/` file proposes systemic enforcement (lint rules, coverage tooling). **Kevin's call:** is enforcement done via project rules now, or is there still concrete tooling work to do (e.g., a `deno lint` rule for missing JSDoc)? |
| `kernel-loader-refactor.md` | MATCH (CLOSED) | #88 | Title and scope match issue #88 "Kernel Loader Refactor (Bootstrap Steps)" — already CLOSED. Stale `.tasks/` file; delete. |
| `kysely-integration.md` | MATCH | #26 | Issue title: "Implement Lockness Kysely". Same scope. Verify #26 body quality; if thin, lift `.tasks/` content. |
| `lockness-events-system.md` | MATCH (CLOSED) | #86 | Issue #86 "Lockness Events System" already CLOSED (events package shipped). Stale `.tasks/` file; delete. |
| `lockness-vite-plugin.md` | MATCH | #64 | Issue title: "Create a Lockness Vite Plugin like Fresh". Same scope. Verify body quality; if thin, lift `.tasks/` content. |
| `migrate-emittery.md` | MATCH | #91 | Issue title matches: "Migrate Events Engine to Emittery". Verify body. |
| `robust-i18n-routing.md` | NEW | — | No matching issue. Well-formed task with concrete proposal (regex path constraints `/:langId{[a-z]{2}}/:countryId{[a-z]{2}}`). Easy lift. |
| `schedule-decorator.md` | NEW (or AMBIGUOUS) | — | No matching issue found in either OPEN or CLOSED. Sibling decorator issues #70 (`@OnBoot`), #72 (`@NamedMiddleware`), #74 (`@DeclareMiddleware`), #76 (`@Kernel`) are all CLOSED, suggesting the decorator-suite work is partly underway. `@Schedule` requires a new `@lockness/scheduler` package — significant scope. Recommend NEW issue. |
| `starter-kits.md` | NEW | — | No matching issue. Tiny file (8 lines, 4 checkboxes for `web`/`api`/`slim` kits + CLI flag). Either expand into a real issue body or split into multiple sub-issues. Recommend single issue with the 4 checkboxes as acceptance criteria. |
| `throttle-decorator.md` | NEW | — | No matching issue. Sibling to `cached-decorator.md` and `schedule-decorator.md`. Well-scoped and well-documented. Easy lift. |

### Counts

- MATCH (open): 5 — #26, #64, #67-adjacent? no, #90, #91, plus by table count: #26, #64, #90, #91, **and** issue #69 / #67 / #54 / #80 / #27 are open issues that have **no** corresponding `.tasks/` file (they exist only on GitHub, which is fine).
- MATCH (closed, file stale): 3 — #28, #86, #88
- NEW: 5 — `cached-decorator`, `improve-bump`, `robust-i18n-routing`, `schedule-decorator`, `starter-kits`, `throttle-decorator` (= **6**, with `schedule-decorator` flagged as borderline-ambiguous)
- AMBIGUOUS: 2 — `frontend-architecture`, `jsdoc-typesafety-guidelines`

(Recount: 4 open MATCH + 3 closed MATCH + 6 NEW + 2 AMBIGUOUS = 15. ✓)

> Correction: open MATCH count is **4** (#26, #64, #90, #91), not 5. The summary above is updated accordingly: 4 already-open + 3 already-closed + 6 new + 2 ambiguous = 15.

## New issues to create (6)

For each: title is imperative and emoji-free per runbook conventions. Body uses the `## Why` / `## Acceptance criteria` / `## Out of scope` / optional `## Notes` template. Status defaults to `Backlog` (Kevin promotes to `Ready` when the body is fully clarified and prioritized).

---

### 1. Add `@Cached` decorator to `@lockness/cache`

**Status:** Backlog (well-formed; could move to Ready after Kevin reviews scope)
**Source:** `.tasks/cached-decorator.md`

```markdown
## Why

`@lockness/cache` exposes an imperative API (`cache.get/set/delete`) but lacks a
declarative way to cache method return values. A `@Cached` decorator would
provide ergonomic caching of expensive computations or DB queries, mirroring
the existing decorator-driven DX of the framework (e.g., `@OnBoot`,
`@NamedMiddleware`).

## Acceptance criteria

- [ ] `@Cached(options)` decorator exported from `@lockness/cache`
- [ ] Caches method return values keyed by method name + serialized arguments
- [ ] Supports per-call TTL and tag-based invalidation (integrating with
      existing `@lockness/cache` tag API)
- [ ] Companion `@CacheInvalidate(tags)` decorator for write methods
- [ ] Preserves method type signatures (no `any` in public API)
- [ ] Unit tests covering hit/miss, TTL expiry, tag invalidation, async methods
- [ ] JSDoc with `@example` blocks on all exported decorators
- [ ] README and `docs/DOCS.md` updated with usage examples

## Out of scope

- Distributed cache backends (covered by existing `@lockness/cache` Redis
  support, #55).
- Cross-package decorator (e.g., on `@lockness/kysely` repositories) — those
  packages compose `@Cached` themselves.

## Notes

Lifted from `.tasks/cached-decorator.md`. New files under `/packages/cache/`:
`decorators.ts`, `tests/decorators.test.ts`. Modify `mod.ts` to export.
```

---

### 2. Preserve comments in `deno.jsonc` when bumping versions

**Status:** Ready (small, well-defined)
**Source:** `.tasks/improve-bump.md`

```markdown
## Why

`scripts/bump.ts` currently uses `JSON.stringify`, which strips all comments
and reformats `deno.jsonc` when updating package versions. This degrades the
file each release and forces manual cleanup.

## Acceptance criteria

- [ ] `scripts/bump.ts` updates the `version` field and `imports` entries
      without removing comments or reflowing the file
- [ ] All existing `deno.jsonc` comments are preserved byte-for-byte after a
      bump (verified by snapshot test)
- [ ] Bump still works on every package's `deno.jsonc` (smoke test on at least
      `core`, `cache`, `events`)

## Out of scope

- Migrating `deno.jsonc` to a different format.
- Adding new bump features (e.g., changelog generation).

## Notes

Two viable strategies (per source file): JSONC CST/AST parser (e.g.,
`jsonc-parser`), or targeted regex replacement on the `version` and `imports`
keys. Prefer the parser for correctness if a JSR-compatible one exists.
```

---

### 3. Constrain i18n route params and protect system paths

**Status:** Ready (well-defined, has solution proposed)
**Source:** `.tasks/robust-i18n-routing.md`

```markdown
## Why

Lockness's i18n mount-point pattern `/:langId/:countryId` is too permissive:
URLs like `/.well-known/appspecific/com.chrome.devtools.json` match it
(`langId=.well-known`, `countryId=appspecific`), triggering the i18n middleware,
which then 404s and pollutes production logs with error stacks.

## Acceptance criteria

- [ ] Mount-point pattern accepts a regex constraint, e.g.,
      `/:langId{[a-z]{2}}/:countryId{[a-z]{2}}`, so non-ISO segments never hit
      the i18n middleware
- [ ] System paths (`/.well-known/*`, `/favicon.ico`, etc.) bypass the i18n
      mount entirely
- [ ] Existing i18n routes still resolve correctly for valid 2-letter codes
- [ ] Unit test asserts `.well-known` paths return their handler's response
      (or 404 from the framework, not from the i18n middleware)

## Out of scope

- Changing the validation strategy for valid ISO codes inside the middleware.
- Adding new locales / countries to the supported list.

## Notes

Source proposes two solutions: regex path constraints (recommended) and an
explicit `exclude` list on `MountPoint`. Pick one — the regex approach has zero
overhead for non-matching URLs.
```

---

### 4. Add `@Schedule` decorator and `@lockness/scheduler` package

**Status:** Backlog (significant scope; Kevin should confirm priority)
**Source:** `.tasks/schedule-decorator.md`

```markdown
## Why

Lockness has no built-in mechanism for declarative cron-based task scheduling.
Users currently bolt on external cron systems or `Deno.cron`. A `@Schedule`
decorator backed by a new `@lockness/scheduler` package would provide a
type-safe, in-app way to declare recurring jobs alongside their service code.

## Acceptance criteria

- [ ] New `@lockness/scheduler` package exposing `@Schedule(cron)` decorator
      and a `Scheduler` service registered with the kernel
- [ ] Cron expression parser (or wrap a JSR-available library) supporting
      standard 5-field cron syntax
- [ ] Human-readable presets: `'daily'`, `'hourly'`, `'every-5-minutes'`,
      `'weekly'`, `'monthly'`
- [ ] Scheduler integrates with the kernel's bootstrap (auto-discovery of
      `@Schedule`-annotated methods)
- [ ] Graceful shutdown stops all scheduled tasks
- [ ] Unit tests for parser, scheduler lifecycle, and decorator registration
- [ ] JSDoc on all public APIs; README + `docs/DOCS.md`; LLM doc

## Out of scope

- Distributed locking (single-node only for v1; v2 can integrate
  `@lockness/cache` Redis lock).
- One-shot delayed jobs (`setTimeout`-style); only recurring cron.
- UI/devtools panel for scheduled jobs (future enhancement).

## Notes

Mirrors decorator pattern of `@OnBoot` (#70), `@NamedMiddleware` (#72),
`@DeclareMiddleware` (#74), `@Kernel` (#76) — all of which are already merged.
New package files: `mod.ts`, `decorators.ts`, `scheduler.ts`, `cron_parser.ts`,
`types.ts`, `presets.ts`, `deno.json`.
```

---

### 5. Add `@Throttle` decorator (rate limiting) via `@lockness/hono`

**Status:** Backlog
**Source:** `.tasks/throttle-decorator.md`

```markdown
## Why

Lockness lacks declarative rate limiting on controllers and routes. Exposing
`hono-rate-limiter` through `@lockness/hono` and adding a `@Throttle` decorator
in `@lockness/core` would give users one-line rate limiting that integrates
with the existing decorator stack.

## Acceptance criteria

- [ ] `@lockness/hono` re-exports `hono-rate-limiter` (added to
      `packages/hono/security.ts` and `mod.ts`)
- [ ] `@Throttle(options)` decorator in `@lockness/core` applies to both
      controller classes and individual route methods
- [ ] Method-level throttle overrides class-level throttle when both are
      present
- [ ] Optional integration with `@lockness/cache` for distributed (multi-node)
      rate limit storage
- [ ] Unit tests covering single-route, controller-wide, and override cases
- [ ] JSDoc + README + LLM doc

## Out of scope

- Custom rate-limit algorithms beyond what `hono-rate-limiter` offers.
- IP-based vs. user-based key strategies — defer to user-supplied
  `keyGenerator` callback.

## Notes

Architecture chain: `npm:hono-rate-limiter` → `@lockness/hono` →
`@lockness/core` → user app.
```

---

### 6. Add official starter kits (web, api, slim)

**Status:** Backlog (small spec; Kevin to confirm scope/priority before Ready)
**Source:** `.tasks/starter-kits.md`

```markdown
## Why

Lockness has no official starter kits. AdonisJS-style starter kits (`web`,
`api`, `slim`) would dramatically lower the time-to-first-app for new users
and let us showcase recommended package combinations.

## Acceptance criteria

- [ ] `web` kit — full-stack with SSR views, sessions, auth
- [ ] `api` kit — REST API with JWT auth, CORS, rate limiting
- [ ] `slim` kit — minimal setup, no auth, no views
- [ ] CLI integration: `cli init --kit=<name>`
- [ ] Each kit ships with a README explaining included packages and how to
      extend

## Out of scope

- Front-end SPA kits (Next/Remix/Svelte) — those consume Lockness as an API.
- Hosting-specific kits (Deno Deploy, Cloudflare Workers) — out of scope for v1.

## Notes

Source is minimal (`.tasks/starter-kits.md` is 8 lines). Body above expands
the original four checkboxes. Kevin to confirm whether each kit should be a
separate sub-issue or a single tracking issue.
```

---

## Open Project #1 issues without a `.tasks/` file (informational)

These are already open on Project #1 and need no migration action. Listed here so Kevin can see the full open backlog at a glance:

- **#27** DevTool like Symfony Debug Bar
- **#54** Implement SSG (body is currently empty — separate clarify task)
- **#67** Interface declaration style (body: "MiddlewareInterface instead of IMiddleware" — needs the four-section template)
- **#69** Lockness MCP Server
- **#80** Blog Page

> These are out of scope for *this* migration but flagged for the PO's next pass: #54 and #67 have empty/thin bodies and should not be moved to Ready until clarified.

## Ambiguous (2) — Kevin's call needed

### A. `frontend-architecture.md`

**Question for Kevin:** This file is a **decision log from December 2024** documenting why Lockness sticks with SSR + Hono JSX rather than Islands/SPA/Inertia. It lists three "future options" (Islands when `deno bundle` stabilizes, HTMX integration, Alpine.js helpers) but commits to none and is partially superseded by #54 (SSG) and #64 (Vite plugin) work. **Should we (a) delete it as a stale ADR, (b) move its content to `docs/decisions/` as a proper ADR, or (c) split the three "future options" into separate parking-lot issues?**

### B. `jsdoc-typesafety-guidelines.md`

**Question for Kevin:** This 14 KB file proposes systemic JSDoc + type-safety enforcement. The two top-level rules are already in `.claude/CLAUDE.md` (rule #3: no `any` in exported APIs; rule #7: JSDoc on public APIs). **Is the remaining work (a) already covered by those rules + your code review and we delete the file, or (b) a concrete tooling task — e.g., a custom `deno lint` rule that fails CI on missing JSDoc — which would warrant a new issue?** If (b), we'd file a focused issue titled "Enforce JSDoc presence on exported APIs via custom deno lint rule".

## After-migration cleanup

Per-file cleanup actions, to be performed only **after** the corresponding GitHub mutation has been verified:

| File | Action | Trigger |
|---|---|---|
| `cached-decorator.md` | Delete | After NEW issue created and verified live |
| `debug-event-dispatcher-cli.md` | Delete | After body of #90 is updated/verified |
| `devtools_ui_refactor.md` | Delete now | Issue #28 already CLOSED; file is stale |
| `frontend-architecture.md` | Pending Kevin's call (delete OR move to `docs/decisions/`) | After Kevin answers ambiguous A |
| `improve-bump.md` | Delete | After NEW issue created and verified live |
| `jsdoc-typesafety-guidelines.md` | Pending Kevin's call (delete OR convert to NEW issue) | After Kevin answers ambiguous B |
| `kernel-loader-refactor.md` | Delete now | Issue #88 already CLOSED; file is stale |
| `kysely-integration.md` | Delete | After body of #26 is updated/verified |
| `lockness-events-system.md` | Delete now | Issue #86 already CLOSED; file is stale |
| `lockness-vite-plugin.md` | Delete | After body of #64 is updated/verified |
| `migrate-emittery.md` | Delete | After body of #91 is updated/verified |
| `robust-i18n-routing.md` | Delete | After NEW issue created and verified live |
| `schedule-decorator.md` | Delete | After NEW issue created and verified live |
| `starter-kits.md` | Delete | After NEW issue created and verified live |
| `throttle-decorator.md` | Delete | After NEW issue created and verified live |

Then:

- Delete `.tasks/.template.md` — legacy template referencing the deprecated GEMINI.md flow.
- Delete `.tasks/.prompt.md` — legacy prompt template, same lineage.
- Delete the empty `.tasks/` directory.
- Confirm `.claude/CLAUDE.md` still says: "The legacy `.tasks/` folder is being phased out — do not create new task files there." (already present, keep.)

## Execution checklist (for the next session that does run mutations)

1. Have Kevin resolve the 2 ambiguous items (A and B above).
2. Create the 6 NEW issues using `add.sh "<title>" "<body>"`; the script attaches them to Project #1 with default Status = Backlog.
3. For each open MATCH (#26, #64, #90, #91): read the existing issue body; if it lacks `## Why` / `## Acceptance criteria` / `## Out of scope`, edit with `gh issue edit` to lift the well-formed body from the corresponding `.tasks/` file.
4. Verify each created/edited issue appears on the Project #1 board.
5. Delete the 15 `.tasks/*.md` files per the table above (skip the two ambiguous ones until resolved).
6. Delete `.template.md`, `.prompt.md`, and the now-empty `.tasks/` directory.
7. Commit: `chore: phase out .tasks/ in favor of GitHub Project #1`.
