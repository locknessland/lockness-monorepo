# Plan: Devtools debug panels (events, sessions, DI container)

**Branch**: `013-devtools-debug-panels` | **Date**: 2026-09-02 | **Backlog item**: [#27 — DevTool like Symfony Debug Bar](https://github.com/locknessland/lockness-monorepo/issues/27)

**This is the feature's one planning document.**

---

## 1. Why this exists

`packages/devtools/` already renders a dev dashboard (routes, requests, deprecations; SQL/logs/queue/mail
are placeholders). To be a Symfony-Debug-Bar equivalent it needs three more panels — **events**, **DI
container**, **sessions** — so a developer can diagnose a whole request from one page. This completes the
existing package; it does not rewrite it.

## 2. User scenarios

### US1 — Events panel (P1)

**Given** the app dispatched events during a request
**When** the developer opens the Events panel
**Then** each event shows its class/name, the number of listeners fired, and a timestamp; an empty run
shows a "no events" state.

### US2 — Sessions panel (P1)

**Given** a request with an active session
**When** the developer opens the Sessions panel
**Then** the session id, the keys present, and any flash messages are shown; no session shows a "no
session" state.

### US3 — DI container panel (P1, **blocked** — see §12 Q1)

**Given** the container has registrations
**When** the developer opens the Container panel
**Then** registered service ids and their resolved/lazy state are listed.
**Blocked**: the container exposes no enumeration today (#128). This story ships only if #128's
introspection lands first (Q1).

### US4 — Route, production gate, empty states (P1, cross-cutting)

**Given** `APP_ENV`/`DENO_ENV` is production
**When** anything tries to expose the debug bar
**Then** it is not mounted and `/_debug` is unreachable. In non-production the bar is reachable at the
configured base (`/_debug` via `basePath`), and every panel renders a graceful empty state.

### Edge cases

- Session middleware not installed → Sessions panel shows "no session", never throws.
- No `--allow-env` / neither env var set → `resolveEnvName()` **defaults to `'development'`**, so both
  `isProduction()` (false) **and** `isDevelopment()` (true) would let the bar mount — a naive gate of
  either polarity fails open here (S1). The only fail-closed gate is a **positive, explicit** dev signal
  that defaults off (an explicitly-set `DENO_ENV`/`APP_ENV === 'development'`, or `LOCKNESS_DEVTOOLS=1`).
  Ambiguity resolves to **not mounted**.
- Events/sessions buckets are bounded (existing `maxN` trim) so a long-running dev server cannot grow
  memory without bound.

## 3. Requirements

- **FR-001**: An `events` bucket + `EventInfo` type + `addEvent`/`getEvents` (+ a `maxEvents` slice trim,
  A5) are added to the collector, and every dispatched event is captured (name, **listeners registered at
  capture time** — A3, timestamp) via **one** passive `onAny` subscriber wired **once** (a module-scope
  `eventsWired` guard, A6). Each event is **correlated to the current request** (A4 → per-request chosen
  at the stop): the devtools middleware runs the request inside an `AsyncLocalStorage` scope carrying a
  `requestId`, and the subscriber tags each `EventInfo` with the store's `requestId` (or `undefined`
  outside a request). Enumerated by: the collector is the only writer of `events`, `mod.ts` the only
  registrar of the subscriber, and the devtools middleware the only place the ALS scope is established.
- **FR-002**: The Events panel renders the captured events, newest-first, with an empty state.
- **FR-003**: The devtools request middleware captures the current session (id, keys, flash) into the
  existing `sessions` collector bucket, guarded when no session is present.
- **FR-004**: The Sessions panel renders the session snapshot with an empty state.
- **FR-005**: The debug bar **mounts only when positively development** — the gate is
  `if (!isDevelopment()) return` (fail closed), **not** `if (isProduction())` (S1). A staging/other
  environment opts in explicitly (e.g. `LOCKNESS_DEVTOOLS=1`). The same fail-closed guard sits at the
  **collection boundary** (`devtoolsMiddleware`/collector no-op when `!isDevelopment()`), so no session/
  header/body data is collected in production even if the middleware is wired directly (S2). Enumerated
  by: both the mount and the collection boundary carry the identical guard.
- **FR-006**: The bar is reachable at `/_debug` when configured (`basePath: '/_debug'`), and each new
  panel shows a "no data" state when its bucket is empty.
- **FR-007**: The Sessions panel **redacts secret-looking keys** at capture — keys matching
  `password`/`token`/`secret`/`key`/`authorization`/`csrf`/`apikey` show the key with a masked value
  (S3). Events carry name/count/timestamp only, never a payload.
- **FR-008** (conditional): If #128 ships, a `container` bucket + Container panel list registered ids and
  resolved/lazy state (**ids + resolved/lazy boolean only, never instance contents** — S4). Otherwise
  this requirement is deferred with the story (Q1).

## 4. Success criteria

- **SC-001**: A developer sees **the events a given request fired**, with registered-listener counts and
  newest-first order, correlated per request (A4 → per-request chosen at the stop). Events fired outside a
  request (boot/background) are shown unattributed rather than dropped.
- **SC-002**: A developer sees the current session's id, keys, and flash on one panel.
- **SC-003**: The debug bar and its data collection are active **only when explicitly development** —
  in production (including a no-env deployment and a compiled binary without `--allow-env`) there is no
  route and no collection, whether wired via `enableDevtools` or the middleware directly (S1, S2).
- **SC-004**: Every panel is legible with zero data (no crash, no blank).
- **SC-005** (conditional): A developer sees the registered services and their state (only if #128).

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| The debug bar mounts/collects only when explicitly development (fail closed) | `packages/devtools/mod.ts` (mount) **and** `packages/devtools/middleware.ts` (collection) — both guard `if (!isDevelopment()) return` (S1/S2) | A `if (isProduction())` gate (fails open on no-env/compiled — S1); a raw `Deno.env.get` in a panel; relying only on the caller's `if`; a guard on the mount but not the collection boundary |
| "What counts as production" | `@lockness/core` `isProduction()` (from #144) — the single source, imported | devtools re-reading `DENO_ENV`/`APP_ENV` itself |
| Every event is captured once | `packages/devtools/mod.ts` — **one** `dispatcher().onAny(...)`, guarded by a module-scope `eventsWired` flag (A6) | a second `onAny`; per-panel capture; re-registering on each `enableDevtools` call |
| Events correlate to the current request (A4) | the devtools middleware — the **one** place the `AsyncLocalStorage` `requestId` scope is established; `EventInfo.requestId` set from the store at capture | reading/deriving a requestId in a panel; a second ALS scope; tagging events from anywhere but the subscriber |
| The events bucket's size bound | `packages/devtools/collector.ts` — `maxEvents` + slice in `addEvent` (A5) | a trim in the panel; an unbounded push |
| The per-request session snapshot | `packages/devtools/middleware.ts` — read `c.get('session')` after `next()`, call `collector.updateSession` | capturing the session in a panel or in `mod.ts`; a second middleware |
| Event/session record shape | `packages/devtools/types.ts` (`EventInfo`, the devtools `SessionData`) | a panel inventing its own record shape inline |
| A panel with no data shows an empty state | each panel component under `packages/devtools/ui/panels/` | an empty state decided in the collector or the dashboard switch |

## 6. Technical context

**Language/Version**: TypeScript on Deno; Hono JSX (devtools UI).
**Primary Dependencies**: `@lockness/devtools` (extend), `@lockness/events` (`dispatcher().onAny`,
`listenerCount`), `@lockness/session` (`getSession`/`Session`), `@lockness/core` (`isProduction`).
**Storage**: in-memory singleton collector (bounded `maxN` trim), dev-only.
**Testing**: `Deno.test` — collector bucket tests (extend `collector.test.ts`), the env gate, the
middleware session capture; panel rendering is smoke-tested where feasible.
**Project Type**: framework package extension (dev tooling).
**Constraints**: read-only (no mutation from panels); production-gated; no new heavy deps.
**Scale/Scope**: dev-only, single developer, one process.

### Domain model

- **Bounded context**: Devtools (dev-only request observability).
- **Vocabulary**: *panel*, *collector bucket*, *event record*, *session snapshot*, *registration*.
- **Entities**: none — collected records have no identity beyond their bucket position.
- **Value objects**: `EventInfo { eventName, listenerCount, timestamp }`; devtools `SessionData
  { id, data, flash?, createdAt, updatedAt }`; (`ContainerRegistration { token, resolved }` — blocked).
- **Invariants**: the bar is never reachable in production; collection is read-only and bounded; the
  devtools `SessionData` is distinct from `@lockness/session`'s `SessionData`.
- **Out of scope**: production access, write/mutation actions, telemetry, flame graphs (#27 out-of-scope).

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | Devtools uses its own JSX setup / `@lockness/core`. |
| JSR-only specifiers | pass | Cross-package deps are `@lockness/*`. |
| No `any` in exported APIs | pass | New types are concrete; no reach-through casts shipped (see Q1). |
| Tailwind v4 parentheses | pass | Panels reuse existing devtools atoms. |
| Pre-completion gate | pass | fmt/lint/check/test before done. |
| JSDoc on public APIs | pass | New collector methods + types documented. |
| MVC layering | pass | Collector = store; middleware = capture; panels = view. |
| No silent catches | pass | The session-capture guard logs/handles absence explicitly. |
| One category per commit | pass | feat / test / docs split. |

### Complexity tracking

- **AsyncLocalStorage for per-request event correlation** (Q_events, chosen at the stop). Justified: the
  user selected per-request scoping over a global log; `node:async_hooks` `AsyncLocalStorage` is the
  standard Deno-supported mechanism, established once in the devtools middleware. Cost: one ALS scope +
  a `requestId` on `EventInfo` + the guard that events outside a request are unattributed. Accepted as
  the price of SC-001's per-request framing.
- **Env helper relocation to `@lockness/contract`** (Q2/A2). Justified: avoids devtools inverting the
  DAG; re-exported from core so #144's API is unchanged. Cost: moves the helper + updates core's 6
  import sites to import from contract (or via core's re-export).
- The DI-panel deferral (Q1) is a scope decision the user took at the stop, not a violation.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| Collector | yes | `events` bucket + `EventInfo` + `addEvent`/`getEvents`; `clear()` reset; `SessionData` gains `flash?`. |
| Events capture | yes | One `dispatcher().onAny` subscriber wired at devtools enable. |
| Middleware | yes | `packages/devtools/middleware.ts` captures the session after `next()`. |
| Mount / config | yes | `enableDevtools` gains the `isProduction()` refusal (FR-005). |
| Dashboard UI | yes | New `Events` + `Sessions` panels; NavTabs + Navbar (desktop + mobile) entries. |
| Container panel | conditional | Only if #128 ships (Q1). |
| **Package manifest** | yes | `packages/devtools/deno.json` gains pinned `@lockness/events` + `@lockness/session` (and the contract env source) — devtools declares only `hono` today (A7, hard rule #2). |
| **Env-helper home** | yes | `resolveEnvName`/`isProduction`/`isDevelopment` move to `@lockness/contract`, re-exported from `@lockness/core` (A2); devtools imports from contract. |
| Tests | yes | Collector buckets + `maxEvents` trim, the fail-closed env gate, session-capture middleware, redaction. |
| Docs | yes | Devtools docs updated with the new panels + the production-gate note. |

### Documentation (this feature)

```text
.specnaut/specs/013-devtools-debug-panels/
├── plan.md
└── tasks.md
```

### Visual Prototyping with Claude Artifacts *(front-end feature)*

The panels reuse the existing devtools atoms (Table/Badge) and the established panel layout, so no new
visual language is introduced — a prototype would answer nothing the `Routes` panel does not already
show. Skipped deliberately.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| Debug bar reachable in production → session/event/DI data leak | FR-005 hard gate in `enableDevtools`; a test asserts no mount under production. |
| Session panel leaks secrets in dev | Dev-only surface; document that it renders whatever the session holds; never enabled in prod. |
| `onAny` subscriber registered twice (double capture) | Single home (decision table); register once at enable, idempotently. |
| Reach-through `(container as any).services` to unblock DI | Forbidden — it breaks the contract #128 exists to provide; DI panel waits for #128 (Q1). |
| Memory growth from event capture on a long dev session | Add an explicit `maxEvents` field + slice trim in `addEvent` (there is **no** generic `maxN` today — A5). |
| Events fired outside a request (boot, background jobs) have no `requestId` | Tag them `undefined` and show them unattributed in the panel — never drop, never throw (SC-001). |
| ALS overhead / a leaked scope across async boundaries | One scope established in the devtools middleware via `als.run(...)` around `next()`; dev-only, so the cost is irrelevant in production (the bar never mounts there). |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed. Kept
separate from §11.*

| # | Sev | Finding | What was done |
| :--- | :--- | :--- | :--- |
| A2 | HIGH | The env gate should **not** make devtools import `@lockness/core`. No static cycle (core loads devtools only via a dynamic `tryImportOptionalPackage`), so a "verify no cycle" check passes and misleads — but devtools would become the **first feature package to import core**, inverting the stated DAG and pulling all of core in for one boolean. | **Plan changed** (pending Q2 confirm). Move `resolveEnvName`/`isProduction`/`isDevelopment` to **`@lockness/contract`** (zero-dep foundation, exists "to avoid circular dependencies"); **re-export from `@lockness/core`** so #144's public API is unchanged; devtools imports from contract. Recorded that the static-cycle check is insufficient here. |
| A3 | MEDIUM | FR-001's "listeners **fired**" is not derivable: `onAny` hands the callback an event **name**, `listenerCount` wants a class, and even by-name it returns **registered** listeners, not fired. | **Plan changed.** FR-001/US1 reworded to "listeners **registered** for the event at capture time" (derived by name via the emitter). Richer per-fire introspection is left to `@lockness/events`/#90. No column labelled "fired" shows registered. |
| A4 | MEDIUM | Events have **no request correlation** — one global `onAny` subscriber is a process-wide stream, contradicting SC-001's "the events **a request** fired." | **Plan changed — per-request chosen at the stop.** The devtools middleware establishes an `AsyncLocalStorage` scope (`node:async_hooks`) with a `requestId`; the subscriber tags each `EventInfo` with it (unattributed outside a request). SC-001 keeps per-request framing; §5 gains the correlation row; complexity tracked in §7. |
| A5 | MEDIUM | The "existing `maxN` trim" cited in §2/§9 **does not exist** — each bucket hardcodes its own cap and the `sessions` bucket has **no** trim. | **Plan changed.** FR-001 adds an explicit `maxEvents` field + slice trim in `addEvent` (mirroring `addLog`); §9/§2 corrected from "existing maxN trim" to the new field. |
| A6 | LOW | Subscriber idempotency has no named home — `dispatcher()` is a global singleton and `enableDevtools` is both boot-called and public API, so double-registration double-captures. | **Plan changed.** §5 gains a row: a module-scope `eventsWired` flag in `mod.ts` (or `offAny`-then-`onAny`) guards the single subscription. |
| A7 | MEDIUM | §8 omitted the **`deno.json` manifest** change — devtools declares only `hono` today; adding `@lockness/events` + `@lockness/session` (+ the contract env source) must be declared pinned (hard rule #2), or `deps:analyze`/`publish:check` fail. | **Plan changed.** §8 gains a "Package manifest" row listing the new pinned deps. |
| A1 | ACCEPT | DI-panel deferral is **endorsed** — container exposes only `has`/`size`, `services` is private, no legitimate enumeration path. `confirms #128`. An honest count-only partial (`size()` → "N services registered") is available pre-#128 if a minimal panel is wanted. | **Accepted.** Q1 offers the count-only partial as an option. |

**Verdict** (`fail` → resolved by edits): audited mechanism/home/dependency-direction/blast-radius against
the real code. Design is sound in shape (extend not rewrite; correct session/middleware seam; correct DI
deferral), but A2 relocates the env helper and A3/A4/A5/A7 correct claims the plan stated inaccurately.
Coverage did **not** include UI/visual design, security (separate seat), or runtime performance.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel. Kept separate from §10.*
The feature's entire security story is **exposure** — the bar surfaces session contents, events, and
(if unblocked) DI internals — so the mount gate is the control that matters.

| # | Sev | Finding | What was done |
| :--- | :--- | :--- | :--- |
| S1 | HIGH | **The production gate fails open.** FR-005 said "refuse when `isProduction()`", but `isProduction()` is `false` when neither `DENO_ENV`/`APP_ENV` is set **and** when a `deno compile` binary runs without `--allow-env` (`resolveEnvName` catches `NotCapable` → `'development'`). Both are real deploy modes → the bar **mounts in production**, exposing `session.all()` + Cookie/Authorization headers + request bodies as unauthenticated JSON (`/_debug/api/data`) = multi-user session-hijack material. | **Plan changed.** FR-005 reworded to **fail closed**: mount only on positive development — `if (!isDevelopment()) return` (with an explicit opt-in env like `LOCKNESS_DEVTOOLS=1` for staging), never `if (isProduction())`. Invariant restated as "mount **only when explicitly development**." A test asserts the bar does **not** mount when neither env var is set. §2's edge-case acceptance is **rejected**. Decision-table row 1 amended. |
| S2 | MEDIUM | **Collection surface sits outside the gate.** `devtoolsMiddleware` is a public export with a documented standalone usage (`app.use('*', devtoolsMiddleware(true))`) that collects session/headers/body regardless of `enableDevtools`. So FR-005's "single mount point" and SC-003's "no data collection surface in production" are **not achievable by gating `enableDevtools` alone**. | **Plan changed.** The fail-closed guard also sits at the **collection boundary**: `devtoolsMiddleware`/the collector no-op when `!isDevelopment()`, so collection cannot happen in prod even via direct wiring. FR-005/SC-003 wording corrected (see below). |
| S3 | MEDIUM | **No data minimisation.** The Sessions panel renders `session.all()` (may hold auth tokens, CSRF, PII) and `/api/data` serves it as JSON. The existing collector also captures **all request headers** (incl. `Cookie`/`Authorization`) and **JSON request bodies**. | **Plan changed** (scoped). Add central redaction at capture for secret-looking session keys (`password`/`token`/`secret`/`key`/`authorization`/`csrf`/`apikey` → show key, mask value) for the **new** Sessions panel. The pre-existing header/body capture is split to a **devtools-hardening follow-up** (not a #27 blocker). Events stay minimised (name/count/timestamp, no payload) — kept. |
| S4 | INFO | **Container reach-through correctly forbidden.** `(container as any).services` would expose *resolved instances* (Config `apiKey`, DB/mail/session creds), far beyond "ids + lazy state". Deferring the DI panel to #128 is the safe call. `confirms #128`. | **Accepted.** Forward note added to Q1/§9: #128's introspection must expose **token ids + resolved/lazy boolean only**, never instance contents. No other private-state reach-through in the events/session capture. |

**Verdict** (`fail` → resolved by amendments): covered the full plan plus the six exposure-path source
files. One HIGH (S1, the central control failed open on two real deploy states — cheap to fix now, a
behaviour change later), two MEDIUM (S2 collection boundary, S3 redaction), one INFO/accept (S4). All
folded; the plan as amended fails closed at both the mount and the collection boundary.

## 12. Open questions

*All answered at the plan stop on 2026-09-02.*

| # | Question | Settled decision | Date |
| :--- | :--- | :--- | :--- |
| Q1 | DI panel vs #128 block | **Defer the DI panel** behind #128; ship events + sessions now (endorsed by A1 + S4). | 2026-09-02 |
| Q2 | Env-helper home (A2) | **Move `resolveEnvName`/`isProduction`/`isDevelopment` to `@lockness/contract`**, re-export from `@lockness/core` (#144 API unchanged); devtools imports from contract. | 2026-09-02 |
| Q_gate | Fail-closed gate (S1) | **Explicit dev signal, default off**: mount only when `DENO_ENV`/`APP_ENV` is explicitly `development` (`isExplicitlyDevelopment()` on the contract helper) or `LOCKNESS_DEVTOOLS=1`; same guard at the collection boundary. | 2026-09-02 |
| Q_events | Event scope (A4) | **Per-request correlation now** — `AsyncLocalStorage` in the devtools middleware tags each event with a `requestId`; unattributed outside a request. (Chose the richer option over the global-log default; complexity tracked in §7.) | 2026-09-02 |
| Q3 | `/_debug` route | **Reach `/_debug` via `basePath: '/_debug'`** (config, no code); keep the `/_devtools` default (changing it is breaking). | 2026-09-02 |
| Q4 | Flash enumeration | **Derive from `all()`** in v1; no session-contract change. | 2026-09-02 |
| Q5 | Empty states | **New panels only**; retrofitting the placeholder panels is separate. | 2026-09-02 |

### Decided without asking

- **Extend, don't rewrite** — the issue mandates it; the collector/dashboard/middleware seams all exist.
- **Events via the passive `onAny` seam** — zero changes to `@lockness/events`.
- **Sessions via the devtools middleware** — the collector bucket/method already exist (currently dead).
- **The env helper moves to `@lockness/contract`** (Q2/A2), re-exported from `@lockness/core` so #144's
  API is unchanged — no new raw env read in devtools.
