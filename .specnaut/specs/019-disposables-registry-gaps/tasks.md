# Tasks: Close four registration-lifecycle gaps in the disposables registry

**Feature:** #140 · **Branch:** `019-disposables-registry-gaps` · **Plan:** `plan.md`

TDD is non-negotiable (constitution) and AC-4 requires each success criterion to
be **negative-tested** — every implementation task is preceded by a test that
fails against the current behaviour. The three user stories are independent
(distinct packages/files), so the phases may run in parallel; within a phase, the
test task precedes its implementation.

**Decision-table homes carried forward (plan §5) — a task may not put a decision anywhere else:**
- Worker "registered iff running" → `packages/queue/mod.ts` (`QueueWorker.start`/`.stop`)
- Redis "registered iff owns client" (+ GC self-deregistration) → `packages/cache/drivers/redis_driver.ts` (constructor)
- KV "acquired at most once, registered once" → `packages/cache/drivers/deno_kv_driver.ts` **and** `packages/queue/mod.ts` (`DenoKvQueueDriver`)

## Phase 1: Setup

No new files, dependencies, or structure. `disposableCount()` /
`drainDisposables()` from `@lockness/contract/lifecycle/internal` are the
existing test probes. Nothing to do.

## Phase 2: Foundational

None — the three fixes share no blocking prerequisite.

## Phase 3: User Story 1 — a restarted worker is stopped at shutdown (P1) 🎯 MVP

**Goal:** `QueueWorker` is registered iff its loop is running. **Independent test:**
start→stop→start leaves the worker registered; construction alone registers nothing.

- [x] T001 [US1] Rewrite the three construction-time-registration cases in `packages/queue/tests/shutdown.test.ts` (`:43-45`, `:53-59`, `:95-98`) to the new invariant — SC-002: `new QueueWorker()` leaves `disposableCount()` unchanged; follow the start-then-drain shape already at `:17-37`. *(FR-007 / audit A1)*
- [x] T002 [US1] Add a **failing** test in `packages/queue/tests/shutdown.test.ts`: after `start()`→`stop()`→`start()`, the worker is registered again (`disposableCount()` reflects it); assert it fails against current field-init registration. Control the loop via `sleep` high + empty in-memory driver, `stop()` promptly. *(SC-004, FR-006)*
- [x] T003 [US1] In `packages/queue/mod.ts` (`QueueWorker`), remove the field-initialiser `registerDisposable` and register in `start()` via `this.#handle ??= registerDisposable({ name: 'queue:worker', dispose: () => this.stop(), priority: 30 })`; `stop()` unchanged (deregister + clear). *(FR-001, FR-002)*
- [x] T004 [US1] Gate the queue package: `deno fmt && deno lint && deno check packages/queue/mod.ts packages/queue/tests/shutdown.test.ts && deno test packages/queue/`.

## Phase 4: User Story 2 — a discarded Redis driver does not accumulate (P1)

**Goal:** a `RedisCacheDriver` registers iff it owns its client; an owning driver
dropped without `close()` self-deregisters on GC. **Independent test:** a
non-owning driver leaves `disposableCount()` unchanged; an owning one increments
by one and `close()` returns it.

- [x] T005 [US2] Rewrite the vacuous injected-redis case `packages/cache/tests/shutdown.test.ts:72-90` to assert **non-registration** — SC-005: `new RedisCacheDriver(client)` (default, non-owning) leaves `disposableCount()` unchanged; assert it fails against the current unconditional constructor registration. Keep/confirm the `ownsClient:true` case still registers + drains. *(SC-005, FR-006, audit A5)*
- [x] T006 [US2] Add a **best-effort** GC test in `packages/cache/tests/shutdown.test.ts`, gated on `typeof globalThis.gc === 'function'` (skip otherwise): construct an owning driver, drop the reference, force GC, assert `disposableCount()` returns to baseline. Document that it runs only under `--v8-flags=--expose-gc`. *(OQ-1; non-deterministic path, best-effort per plan §12)*
- [x] T007 [US2] In `packages/cache/drivers/redis_driver.ts` constructor: register **iff** `options.ownsClient === true`; for an owning driver, register with a `WeakRef`-based dispose (`const ref = new WeakRef(this); dispose: () => ref.deref()?.close()`) and enrol it in a module-level `FinalizationRegistry` (target = driver, held = handle, unregister token = driver) that calls `deregisterDisposable(handle)`; `close()` unregisters the token. Rewrite the stale comment `:263-266` to match. *(FR-003 — see plan §12 OQ-1 pinning constraint)*
- [x] T008 [US2] Gate the cache/redis path: `deno fmt && deno lint && deno check packages/cache/drivers/redis_driver.ts packages/cache/tests/shutdown.test.ts && deno test packages/cache/`.

## Phase 5: User Story 3 — a concurrent cold start opens exactly one KV handle (P1)

**Goal:** single-flight cold path in **both** Deno-KV drivers; `close()` handles
an in-flight open and is safe twice. **Independent test:** two concurrent
cold-path calls open exactly one `Deno.Kv`.

- [x] T009 [US3] Add a **failing** test in `packages/cache/tests/` : stub `Deno.openKv` with a controllable deferred + call counter, fire two concurrent cold-path ops on `DenoKvCacheDriver`, assert `Deno.openKv` called **once**; restore the stub (resource sanitizer stays green). Assert it fails against the current `check→await→assign`. *(SC-006, FR-006)*
- [x] T010 [US3] Add the same concurrent-cold-start test for `DenoKvQueueDriver` in `packages/queue/tests/`. *(SC-006, audit A2)*
- [x] T011 [US3] Add a test that `close()` on a KV driver whose open is still in flight closes exactly one handle, and that a second `close()` does not throw (`Deno.Kv.close()` throws on double-close). Both drivers. *(FR-005, security §11 INFO carry)*
- [x] T012 [US3] Implement single-flight in `packages/cache/drivers/deno_kv_driver.ts`: `this.kvPromise ??= this.#openKv()`; `#openKv()` opens, sets `this.kv`, registers once; `close()` takes-and-clears the promise, awaits it, closes once, deregisters. *(FR-004, FR-005)*
- [x] T013 [US3] Apply the identical single-flight shape to `DenoKvQueueDriver` in `packages/queue/mod.ts:192-204` and its `close()`. *(FR-004, FR-005, audit A2)*
- [x] T014 [US3] Gate both packages: `deno fmt && deno lint && deno check packages/cache/drivers/deno_kv_driver.ts packages/queue/mod.ts <test files> && deno test packages/cache/ packages/queue/`.

## Phase 6: Polish & cross-cutting

- [x] T015 [P] Review `docs/lifecycle-events.md` and each touched driver/worker JSDoc for stale timing claims (construction-time vs start/lazy registration); update only where an assertion is now wrong. *(plan §8 Documentation)*
- [x] T016 Full pre-completion gate (hard rule #5): `deno fmt && deno lint && deno check <all touched files> && deno task test` — green before done.

## Dependencies

- US1, US2, US3 are independent (distinct packages/files) — parallelizable.
- Within each story: test task(s) → implementation task → per-story gate.
- T016 (full gate) runs last, after all stories.

## Implementation strategy

**MVP = US1** (the P1 worker-restart leak is the most direct regression of #136's
purpose). US2 and US3 are equal-priority P1 and follow. All three ship together —
the issue tracks them as one pass; there is no partial-ship checkpoint.
