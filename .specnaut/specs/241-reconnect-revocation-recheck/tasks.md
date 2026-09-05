---
description: "Task breakdown for #271 — reconnect-triggered immediate revocation re-check"
---

# Tasks: Reconnect-triggered immediate revocation re-check

**Input**: `/.specnaut/specs/241-reconnect-revocation-recheck/plan.md`
**Prerequisites**: `plan.md` (approved at the plan stop, 2026-09-05)
**Backlog item**: [#271](https://github.com/locknessland/lockness-monorepo/issues/271)

**Tests**: REQUIRED. TDD is non-negotiable per `.specnaut/memory/constitution.md` — failing test
first, minimal code to pass, then refactor.

**Organization**: grouped by the user stories in `plan.md` §2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task.
- **[Story]**: `US1` / `US2` / `US3`, mapping to `plan.md` §2.

## Path conventions

Deno workspace. Two packages: `packages/redis/` and `packages/realtime/`. Tests live in each
package's `tests/` directory.

## 🔒 Decision-table homes carried forward

Binding, from `plan.md` §5. A task may not put a decision anywhere but its named home.

| Decision | Home | Enforced by |
| :--- | :--- | :--- |
| What counts as a reconnect | `packages/redis/subscriber.ts` — `#reconnectAll()` entry point | T004, T005 |
| When the *revocation* re-check runs | `packages/realtime/drivers/redis.ts` — `onRevocationReconcile` | T012 |
| Whether a subscriber supports the seam | `packages/realtime/drivers/redis.ts` — `this.subscriber.onReconnect?.()` | T012 |
| Post-shutdown no-op | `packages/realtime/drivers/redis.ts` — `close()` clears `revocationHandler` | T014 |
| What a revocation re-check does | `packages/realtime/manager.ts` — `reconcileRevocations` (**unchanged**) | T012 (must not edit) |
| Whether a revoked connection stays revoked | `packages/realtime/drivers/redis.ts` — the durable marker (**unchanged**) | — |
| Handler fault never reaches the socket | `packages/redis/subscriber.ts` — containment at the seam; the driver's `#runRevocationReconcile` catch **stays** | T007, T012 |

---

## Phase 1: Setup

**Purpose**: none required — both packages exist, the `@lockness/realtime → @lockness/redis` edge is
already declared and pinned in `packages/realtime/deno.json`, and no dependency changes.

- [X] T001 Confirm the working tree is clean on branch `241-reconnect-revocation-recheck` and that `deno task test` is green before any edit, so a later failure is attributable to this work

---

## Phase 2: Foundational — the transport seam (BLOCKING)

**Purpose**: `packages/redis/subscriber.ts` gains the reconnect seam. Every user story depends on
it. Nothing in `@lockness/realtime` may be touched in this phase.

**⚠️ Complete this phase before starting Phase 3.**

### Tests first (TDD)

- [X] T002 [P] In `packages/redis/tests/subscriber.test.ts`, add a **failing** test: after a wire fault triggers a reconnect and the patterns are re-issued (drive it with `packages/redis/tests/fake_server.ts`, as the three existing reconnect tests do), a handler registered via `onReconnect` is invoked exactly once
- [X] T003 [P] In `packages/redis/tests/subscriber.test.ts`, add a **failing** test asserting FR-002's two negatives: the handler fires **zero** times on the first `psubscribe` (first connect is not a reconnect), and zero times when the re-dial itself fails (point the connection at a closed port after the fault)

### Implementation

- [X] T004 In `packages/redis/subscriber.ts`, split the two callers of `#activate` into named private entry points per `plan.md` §5 row 1 — `#connectAndSubscribe(pattern)` called from `psubscribe`, and `#reconnectAll()` called from `#readLoop`'s catch — both delegating to the existing shared activation body. **Do not** add an `isReconnect` parameter, and do not derive the discriminator from `#handle`, `loopConn`, or `toIssue.length`
- [X] T005 In `packages/redis/subscriber.ts`, fire the registered reconnect handler from `#reconnectAll()` only, **inside** the try block and **after** the `writeFrame`/`PSUBSCRIBE` re-issue loop succeeds, so FR-002's "not on a failed re-subscribe" holds
- [X] T006 In `packages/redis/subscriber.ts`, add `onReconnect(handler)` with a single-handler, last-registration-wins field (matching `onMessage`/`onControl`/`onRevocationReconcile`) and a **nullary** `() => void | Promise<void>` signature. Keep the handler's type **unexported**, like `MessageHandler` at line 51, so the generated `AGENTS.md` surface blocks need no regeneration
- [X] T007 In `packages/redis/subscriber.ts`, contain a thrown or rejected handler in a try/catch around the fire, logging at WARN via `safeForLog(this.hostname)` + `renderError(error)` per FR-003 — matching the three existing WARNs in the file. The catch **must not** unregister the handler or stop future fires
- [X] T008 In `packages/redis/subscriber.ts`, guard the fire with the existing `closed` flag so a handler cannot run after `close()`, closing the connect-resolves-during-close race
- [X] T009 [P] In `packages/redis/tests/subscriber.test.ts`, add a test injecting a **throwing** handler and asserting the read loop survives — delivery continues on the reconnected socket (FR-003)
- [X] T010 In `packages/redis/subscriber.ts`, extend `#activate`'s existing failure WARN (line ~164) to state that **no further reconnect will be attempted**, so the terminal state is distinguishable from a transient one (FR-009). This is a message change only — do **not** add a retry; that is [#275](https://github.com/locknessland/lockness-monorepo/issues/275)
- [X] T011 Update `packages/redis/subscriber.ts`'s `@fileoverview` and the class JSDoc to document the seam per constitution rule 7 (description, `@param`, `@throws`, `@example`)

**Checkpoint**: `deno test -A packages/redis/tests/` green. `@lockness/realtime` untouched.

---

## Phase 3: US1 (P1) — a missed evict is recovered the moment the socket returns

**Goal**: an eviction issued while the owning instance's subscribe socket was down takes effect as
soon as that socket is usable again, with no periodic tick elapsed.

**Independent test**: SC-001 — with `FakeTime` never advanced past a reconcile interval, a revoked
connection is hard-closed after a simulated reconnect.

### Tests first (TDD)

- [X] T012a [US1] In `packages/realtime/tests/fake_redis.ts`, give the shared `subscriberFor()` fake an `onReconnect` registration plus a test-only way to fire it. **Seven** test files share this fake — verify all seven still pass after the edit, and leave `packages/realtime/tests/driver_redis.test.ts`'s independent fake **without** the seam (it is US3's regression proof)
- [X] T013 [US1] In a new `packages/realtime/tests/eviction_reconnect.test.ts`, add a **failing** SC-001 test: instance B evicts a connection owned by instance A while A's subscriber is deaf; firing A's subscriber reconnect hard-closes the target's socket, with `FakeTime` never advanced by a full `reconcileIntervalMs`

### Implementation

- [X] T012 [US1] In `packages/realtime/drivers/redis.ts`, inside `onRevocationReconcile` (the §5 row-2 home), register the seam as `this.subscriber.onReconnect?.(() => this.#runRevocationReconcile())`. Use the optional-call idiom, **not** a `typeof` guard, and do **not** register the raw `revocationHandler` — routing through `#runRevocationReconcile` keeps the driver's existing contextual WARN, which is the only log line naming *which* control failed. `packages/realtime/manager.ts` and `packages/realtime/driver.ts` must not be edited
- [X] T015 [US1] In `packages/realtime/drivers/redis.ts`, add `onReconnect?` as an **optional** member of the exported `RedisSubscriber` port interface (FR-004), with JSDoc

**Checkpoint**: T013 passes. US1 is independently demonstrable.

---

## Phase 4: US2 (P1) — the periodic safety net is untouched

**Goal**: the reconnect trigger is strictly additive; #268's periodic behaviour is unchanged.

**Independent test**: SC-002 — `packages/realtime/tests/eviction_durable.test.ts` passes with **no
edits to that file**.

- [X] T016 [US2] Run `deno test -A packages/realtime/tests/eviction_durable.test.ts` and confirm it is green **without having modified it** (FR-006). If it needed an edit, the change was not additive — revisit T012
- [X] T014 [US2] In `packages/realtime/drivers/redis.ts`, make `close()` set `this.revocationHandler = undefined` (the §5 post-shutdown home), so `#runRevocationReconcile`'s existing `if (!this.revocationHandler) return` guard gates **both** triggers on **both** construction paths. Do **not** add a `closed` boolean to the driver, and do not rely on the subscriber's own `closed` flag — it does not cover the injected-port path, where `owned` is empty
- [X] T017 [US2] In `packages/realtime/tests/eviction_reconnect.test.ts`, add a test for FR-007/A2: a driver built through the **public constructor** with an injected subscriber, then `close()`d, runs nothing when its subscriber's reconnect fires — no command reaches the fake client
- [X] T018 [US2] In `packages/realtime/tests/eviction_reconnect.test.ts`, add a test that the periodic timer still fires after a reconnect-driven re-check has thrown, proving FR-003's containment does not disarm the retry

**Checkpoint**: `deno test -A packages/realtime/tests/` green, `eviction_durable.test.ts` unmodified.

---

## Phase 5: US3 (P2) — a seam-less subscriber keeps working

**Goal**: FR-004 — the optional port member breaks no existing implementation.

**Independent test**: SC-004 — a driver built on a subscriber with no `onReconnect` constructs and
runs with the periodic trigger only.

- [X] T019 [US3] In `packages/realtime/tests/driver_redis.test.ts`, add a test asserting its independent (deliberately seam-less) fake still drives a full evict → revoke cycle through the periodic trigger, with no throw and no type error — the standing FR-004 / US3 regression proof
- [X] T020 [US3] [P] Type-check the whole workspace (`deno check`) to confirm the optional member breaks none of the three port implementations

---

## Phase 6: Polish & cross-cutting

- [X] T021 [P] Update `docs/realtime.md` — document that revocation is re-checked on subscribe-socket reconnect as well as on the periodic tick, and what an operator observes
- [X] T022 [P] Regenerate/refresh `packages/redis/AGENTS.md` and `packages/realtime/AGENTS.md` (`deno task` brief generation, not hand-edits where generated blocks are involved). Add a Pitfalls entry to `packages/redis/AGENTS.md`: the subscribe socket has no keepalive and reads with the default 30s deadline, so it re-dials on an idle bus — [#274](https://github.com/locknessland/lockness-monorepo/issues/274), discovered 2026-09-05
- [X] T023 Run the full pre-completion gate: `deno fmt && deno lint && deno check && deno task test`. All green before declaring done (constitution rule 5)
- [X] T024 Commit by category, one category per commit (constitution rule 9): `feat(redis)` for the seam (T004–T011), `feat(realtime)` for the wiring (T012, T014, T015), `test` for the new tests (T002, T003, T009, T012a, T013, T017, T018, T019), `docs` for T021, `chore` for the regenerated briefs (T022)

---

## Dependencies

```
Phase 1 (T001)
   └─> Phase 2 — the transport seam (T002…T011)   [BLOCKING: nothing in realtime before this]
          ├─> Phase 3 — US1 (T012a, T013, T012, T015)
          │      ├─> Phase 4 — US2 (T016, T014, T017, T018)
          │      └─> Phase 5 — US3 (T019, T020)
          └────────> Phase 6 — polish (T021…T024)
```

- **Phase 2 blocks everything.** The driver cannot register a seam that does not exist.
- **T012a blocks T013, T017, T018** — those tests need a fireable fake.
- **Phase 4 and Phase 5 are independent of each other** once Phase 3 lands.
- **T016 is a gate, not a task**: if `eviction_durable.test.ts` needs editing, the change was not additive.

## Parallel opportunities

| Batch | Tasks | Why safe |
| :--- | :--- | :--- |
| Phase 2 tests | T002, T003 | Same file, distinct test bodies — write together, both red before T004 |
| Phase 2 follow-up | T009 | Independent of T002/T003 once the seam exists |
| Phase 5 | T019, T020 | Different files; T020 is a workspace-wide check |
| Phase 6 | T021, T022 | Docs only, no source overlap |

## Implementation strategy

**MVP = Phase 2 + Phase 3.** That is the seam plus its single consumer, and it satisfies #271's
three acceptance criteria on its own (a reconnect hook, the driver invoking the reconcile at
reconnect, and a test proving recovery at reconnect rather than on the next tick).

Phases 4 and 5 are the regression envelope the audits demanded — A2's post-close leak and A3/FR-004's
optional-member compatibility. **Ship them in the same branch**: A2 is a live seam surviving
shutdown on the documented public constructor path, introduced by this feature.

Phase 6 closes the docs and the gate.

**Out of scope, filed:** [#274](https://github.com/locknessland/lockness-monorepo/issues/274) (the
~30s idle churn) and [#275](https://github.com/locknessland/lockness-monorepo/issues/275) (a failed
re-dial is never retried). T010 makes #275's state observable; it does not fix it.
