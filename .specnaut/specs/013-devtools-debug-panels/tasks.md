---
description: "Task breakdown for the devtools debug panels (#27)"
---

# Tasks: Devtools debug panels (events, sessions)

**Input**: `plan.md` in this directory.
**Feature**: add Events + Sessions panels to the existing devtools bar; **DI panel deferred** (#128).
**Tests**: included (constitution TDD rule).

## Format: `[ID] [P?] [Story] Description`

- **[Story]** — US1 (events) / US2 (sessions) / US4 (route + fail-closed gate + empty states). US3 (DI) is deferred.
- Each task names its **decision-table home** where it touches a rule (plan §5).

## Decision-table homes carried forward (plan §5)

| Rule | Home |
| :--- | :--- |
| Bar mounts/collects only when explicitly development (fail closed) | `packages/devtools/mod.ts` (mount) **and** `packages/devtools/middleware.ts` (collection) |
| "What is production/dev" | `@lockness/contract` env helper (moved from core, A2), imported by devtools |
| Every event captured once | `packages/devtools/mod.ts` — one `onAny`, `eventsWired` guard (A6) |
| Events correlate to the request | `packages/devtools/middleware.ts` — the one `AsyncLocalStorage` `requestId` scope (A4) |
| Events bucket bound | `packages/devtools/collector.ts` — `maxEvents` + slice (A5) |
| Per-request session snapshot + redaction | `packages/devtools/middleware.ts` capture; redaction at capture (S3) |
| Record shapes | `packages/devtools/types.ts` (`EventInfo` incl. `requestId`; `SessionData` + `flash?`) |
| Panel empty state | each panel under `packages/devtools/ui/panels/` |

---

## Phase 1: Setup

- [ ] T001 Add pinned deps to `packages/devtools/deno.json` (A7): `@lockness/events`, `@lockness/session`, `@lockness/contract`. Run `deno task deps:analyze` to confirm the graph stays acyclic.

---

## Phase 2: Foundational (blocking prerequisites)

- [ ] T002 **Env helper → contract (A2/Q2)**: move `resolveEnvName`/`isProduction`/`isDevelopment` from `packages/core/environment.ts` to `@lockness/contract`; **re-export from `@lockness/core`** so #144's public API is unchanged. Add **`isExplicitlyDevelopment()`** (true only when `DENO_ENV`/`APP_ENV` is *explicitly set* to `development`; NotCapable-safe) for the fail-closed gate (Q_gate). Update core's six #144 import sites to resolve via the re-export (no behaviour change).
- [ ] T003 [P] Env-helper tests in `packages/contract/tests/environment.test.ts` — move/extend the #144 tests; add `isExplicitlyDevelopment()`: true only for an explicitly-set `development`, false for unset/NotCapable/production/other.
- [ ] T004 `EventInfo` type in `packages/devtools/types.ts` — `{ eventName, listenerCount, timestamp, requestId?: string }`; add `events: EventInfo[]` to `DevtoolsData`. Add `flash?: Record<string, unknown>` to the devtools `SessionData` (S3).
- [ ] T005 Collector (`packages/devtools/collector.ts`): `events: []` initializer; `events: []` in `clear()`; `addEvent` (with `maxEvents` slice trim, mirroring `addLog`, A5) + `getEvents`.
- [ ] T006 [P] Collector tests (`packages/devtools/tests/collector.test.ts`): `addEvent`/`getEvents`, `maxEvents` trim bounds the bucket, `clear()` zeroes `events` (extend the existing clear test).
- [ ] T007 **Fail-closed gate (S1/S2/Q_gate)**: a single `devtoolsActive()` predicate (`isExplicitlyDevelopment() || LOCKNESS_DEVTOOLS=1`, default off) used at **both** `enableDevtools` (mount) and the collection boundary in `middleware.ts` (`if (!devtoolsActive()) return`/no-op). No raw env read beyond the contract helper + the explicit `LOCKNESS_DEVTOOLS` opt-in.
- [ ] T008 [P] Gate tests: bar does **not** mount and middleware does **not** collect when neither env var is set, under a compiled-binary NotCapable read, and under production; mounts only on explicit `development` / `LOCKNESS_DEVTOOLS=1`.

---

## Phase 3: US1 — Events panel (P1)

**Goal**: see the events a request fired (registered-listener count, timestamp), correlated per request.
**Independent test**: fire events within a request scope → panel lists them under that request; events outside a request → unattributed.

- [ ] T009 [US1] Establish the `AsyncLocalStorage` (`node:async_hooks`) `requestId` scope in `packages/devtools/middleware.ts` — run the request inside `als.run({ requestId }, () => next())` (the **one** home, A4). Export the store so the subscriber can read it.
- [ ] T010 [US1] Register the **single** `dispatcher().onAny` subscriber in `mod.ts` guarded by a module-scope `eventsWired` flag (A6); on each event call `collector.addEvent({ eventName, listenerCount: emitter.listenerCount(eventName), timestamp, requestId: store?.requestId })` (A3 — registered count).
- [ ] T011 [P] [US1] `packages/devtools/ui/panels/Events.tsx` — table of events grouped/labelled by `requestId` (unattributed group for none), newest-first, with a "no events" empty state (Q5). Wire into `ui/Dashboard.tsx` + `EventsTab` in `NavTabs.tsx` + `Navbar.tsx` (desktop **and** mobile).
- [ ] T012 [US1] Tests: subscriber captures name + registered count + timestamp + requestId within a request; idempotent (two `enableDevtools` calls → one subscriber); events outside a request are unattributed, not dropped.

---

## Phase 4: US2 — Sessions panel (P1)

**Goal**: see the current session's id, keys, and flash — secrets redacted.
**Independent test**: a request with a session → panel shows id + keys + flash with secret values masked; no session → empty state.

- [ ] T013 [US2] Session capture in `packages/devtools/middleware.ts` after `next()`: `const s = c.get('session')` (guarded when absent); `collector.updateSession({ id: s.getId(), data: redact(s.all()), flash: redact(flashFrom(s.all())), ... })`. Derive flash from `all()` (Q4).
- [ ] T014 [US2] Redaction helper (S3): mask values of keys matching `password|token|secret|key|authorization|csrf|apikey` (case-insensitive), show the key. Central to capture, not per-panel.
- [ ] T015 [P] [US2] `packages/devtools/ui/panels/Sessions.tsx` — session id, keys table (masked values), flash section, "no session" empty state (Q5). Wire into Dashboard + NavTabs + Navbar (desktop + mobile).
- [ ] T016 [US2] Tests: capture reads `c.get('session')`; redaction masks secret-looking keys and preserves others; no session → empty state, no throw.

---

## Phase 5: US4 — Route, gate wiring, empty states (P1, cross-cutting)

- [ ] T017 [US4] Document reaching the bar at `/_debug` via `enableDevtools(app, { basePath: '/_debug' })` (Q3); keep the `/_devtools` default. No default change.
- [ ] T018 [US4] Verify each **new** panel renders its empty state with zero data (Q5); confirm the existing placeholder panels are untouched.

---

## Phase 6: Polish

- [ ] T019 [P] Docs: update `packages/devtools/docs/DOCS.md` + `README.md` — the two new panels, the `/_debug` basePath, the fail-closed gate (explicit-dev/`LOCKNESS_DEVTOOLS`), and the redaction + per-request-events behaviour. Note the DI panel is deferred to #128.
- [ ] T020 Pre-completion gate — `deno fmt && deno lint && deno check <changed> && deno task test` green; `deno task deps:analyze` clean.

---

## Dependencies & order

- **Phase 2 blocks all stories.** T002→T003 (helper before its tests); T004→T005→T006; T007 needs T002 (`isExplicitlyDevelopment`).
- **US1** needs T009 (ALS) + T010 (subscriber) + the events bucket (T005). **US2** needs T013/T014 + the `sessions` bucket (exists) + `flash?` (T004). **US4** needs the gate (T007) and the panels (US1/US2).
- Phase 6 last.

## Parallel opportunities

- After T004/T005: **T006, T008** (tests) parallel. Panels **T011, T015** parallel. Docs **T019** parallel with code.

## MVP scope

**US1 + US2 + US4** (all P1) = the completed bar minus the DI panel. Ship as one increment; the DI panel is a #128-gated follow-up.

## Deferred (not in this feature)

- **US3 — DI container panel**: hard-blocked on **#128** (container has no public enumeration). Filed against #128; #27's DI criterion stays open there.

## Suggested commit split (by scope)

1. `refactor(144)` or `refactor(27)` — env helper → contract + re-export + `isExplicitlyDevelopment` (foundational; own commit since it touches core/#144).
2. `feat(27)` — collector buckets, gate, ALS + subscriber, session capture + redaction, panels, nav.
3. `test(27)` — all new tests.
4. `docs(27)` — devtools docs.
5. `chore(codegen)` — regenerated devtools/core agent briefs if the public surface changed.
