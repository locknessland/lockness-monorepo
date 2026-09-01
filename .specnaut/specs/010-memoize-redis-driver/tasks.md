# Tasks: Memoize the Redis session driver (#145)

**Input**: `.specnaut/specs/010-memoize-redis-driver/plan.md` (the one design document)
**Branch**: `010-memoize-redis-driver`

**Tests**: REQUIRED. The constitution makes TDD non-negotiable for the developer, and this feature's
success criteria (SC-001..SC-006) are the security control itself — a failing test comes first for
each.

**Organization**: by user story (plan §2), in priority order. **The security invariant
"serialize before memoize" (FR-007 / decision-table row 3a) is a hard phase boundary**: US2 (the
command mutex) MUST be complete and green **before** US1 (adding `'redis'` to `MEMOIZED`) is
touched. So US2 precedes US1 in execution order even though US1 is the headline.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different file, no dependency on an incomplete task)
- Decision-table homes (plan §5) are named inline; a task may not spell a rule anywhere but its home.

---

## Phase 1: Setup

- [X] T001 Add `jsr:@std/crypto@^1` to `packages/session/deno.json` imports and run `deno cache` so `deno.lock` regenerates (never hand-edit the lock — hard rule #6). This is the synchronous SHA-256 (`digestSync`) the memo key needs (plan §6, §12 Q1).

## Phase 2: Foundational (blocking prerequisites for all stories)

- [X] T002 [P] Extract a private `#exchange(conn, args): Promise<RespReply>` on `RedisSessionDriver` in `packages/session/drivers/redis.ts` — the `writeFrame` + `readReply` + discard-on-desync body currently inline in `sendCommand`. Pure refactor, no behavior change; existing tests stay green. This is the seam the mutex and `connect()` both build on (plan §9 R2).
- [X] T003 In `packages/session/drivers/redis.ts`, make the desync-close path reset **both** `this.connection` **and** the (soon-to-exist) `connectPromise` together — the mid-stream self-heal (FR-005, home: `redis.ts` connectPromise reset; Security F2). Leave a `connectPromise` field stub if T007 hasn't landed yet, or sequence T003 after T007.

---

## Phase 3: US2 — command mutex (P1, security) — **MUST GREEN BEFORE US1**

**Goal**: two overlapping `sendCommand` calls never interleave their frames (FR-006/FR-007).
**Independent test**: two both-in-flight commands each receive their own reply on a fake socket.

- [X] T004 [US2] Write a failing test in `packages/session/tests/redis_mutex.test.ts`: against `tests/fake_redis.ts`, start two `sendCommand` calls **without awaiting the first** (a large `SETEX`/`EVAL` then a `GET`) and assert each caller receives its OWN reply — a mis-drained or write-only mutex must fail this. Overlap, not back-to-back (plan US2/SC-004; Security F4). Extend `fake_redis.ts` if it cannot model interleaved frames.
- [X] T005 [US2] Implement the per-connection command-queue mutex in `packages/session/drivers/redis.ts` (home: `redis.ts` command-queue, decision-table row 5): a promise-chain tail serializing the critical section, which does `await connect()` **then** `#exchange` — `await connect()` **inside** the serialized section (FR-006; Architect MED). The internal tail swallows to keep the chain alive; the returned promise still rejects to its caller (no silent catch — FR R3).
- [X] T006 [US2] Verify `connect()`'s `AUTH`/`SELECT` call `#exchange` **directly**, never `sendCommand` — no mutex re-entrancy/deadlock (plan §9 R2). Add a test that a password-configured driver authenticates and serves a command without hanging.

## Phase 4: US1 — memoize the redis driver (P1) — only after US2 is green

**Goal**: one authenticated socket per process per resolved config (FR-001).
**Independent test**: same driver instance across two requests; a burst opens one connection.

- [X] T007 [US1] Implement single-flight `connect()` in `packages/session/drivers/redis.ts` — cache the in-flight `connectPromise`, reset on rejection, self-heal (home: `redis.ts` connectPromise, decision-table rows 6+7; FR-004/FR-005), mirroring `deno_kv.ts` `kvPromise`. Register the disposable when the socket is first held; `close()` deregisters, is idempotent, and serializes `QUIT` through the mutex guarded against reopening (FR-008; Security F3/Architect MED).
- [X] T008 [US1] Write a failing test in `packages/session/tests/redis_memo.test.ts`: stub `Deno.connect` via `Object.defineProperty` (the `Deno.openKv` pattern from `driver_memo.test.ts`), fire a concurrent cold-start burst, assert **one** connection opened and **one** `AUTH` sent (SC-001).
- [X] T009 [US1] Add the SHA-256 password-digest to `driverKey`'s redis case in `packages/session/drivers/registry.ts` (home: `registry.ts` `driverKey` — the SOLE home; distinct from `redis.ts`'s `redactSessionId`; decision-table rows 2+3). Key = `redis:${host}:${port}:${db}:${sha256hex(password)}` via `@std/crypto` `digestSync`; never the cleartext password (FR-002/FR-003; Security F1/Architect MED).
- [X] T010 [US1] Add `'redis'` to the `MEMOIZED` set in `packages/session/drivers/registry.ts` and narrow `driverKey`'s `@throws` to `cookie` only (home: `registry.ts` MEMOIZED, decision-table row 1; FR-001). **This is the row-3a gate — do not land it until T004-T006 are green.**
- [X] T011 [US1] In `packages/session/tests/driver_memo.test.ts`, **flip** the redis non-identity assertion (lines ~124-128) to an **identity** assertion, with a comment that it is the #145 inverse of #138's FR-007 gate. Update `driverKey` test expectations (lines ~132-153) for the redis key now succeeding instead of throwing. Tests stay **synchronous** (Q1 sync — plan §9 R4/FR-011).

## Phase 5: US3 — credential discrimination (P2, security)

**Goal**: same host, different password ⇒ different socket (FR-003).
**Independent test**: two configs differing only in password produce different `driverKey`s.

- [X] T012 [US3] Write a test in `packages/session/tests/redis_memo.test.ts` (or the driver_memo test): two redis configs identical but for `password` yield **different** `driverKey`s and thus different memoized instances; two identical configs yield the same key (SC-003). Assert the key contains no cleartext password substring.

## Phase 6: US4 — shutdown & self-heal (P2)

**Goal**: the memoized socket closes exactly once; a command failure self-heals (SC-005/SC-006).

- [X] T013 [P] [US4] Test in `packages/session/tests/redis_memo.test.ts`: after `resetDriverRegistry` / the disposables drain, the memoized redis driver's `close()` ran (spy) and a double-close does not throw (SC-005; FR-009). `QUIT` does not throw when the socket is already closed.
- [X] T014 [P] [US4] Test the mid-stream self-heal: a command whose `#exchange` fails closes the socket and nulls `connectPromise`; the next command reconnects and succeeds (SC-006; Security F2 / FR-005).

## Phase 7: Polish & cross-cutting

- [X] T015 [P] Repoint the `#145` "gated / tracked" comments to shipped behavior: `redis.ts` class `@remarks` (the "Per-connection command serialization … tracked in #145" note) and `registry.ts` module doc + `driverKey` `@throws` (the "redis is per-request while gated" language) — they now describe what ships, not a pending gate (FR-010).
- [X] T016 [P] JSDoc pass: `driverKey` (redis case, the digest, `@throws` now cookie-only), `close()` (idempotent, disposable, QUIT serialization). Hard rule #7.
- [X] T017 [P] Update `packages/session/docs/DOCS.md` and `packages/session/AGENTS.md` (the driver-lifecycle / memoization section and the test list) for the shared, serialized redis socket. Regenerate the brief with `deno task agents:brief` if surface changed.
- [X] T018 The pre-completion gate on the whole package: `deno fmt && deno lint && deno check packages/session/**/*.ts && deno task test` — green before review (hard rule #5). Fix and re-run on any red.

---

## Dependencies & execution order

```
Phase 1 (T001) → Phase 2 (T002, T003)
   → Phase 3 US2 mutex (T004→T005→T006)   ← SECURITY GATE: green before US1
      → Phase 4 US1 memo (T007→T008→T009→T010→T011)   T010 is the row-3a gate
         → Phase 5 US3 (T012)
         → Phase 6 US4 (T013, T014)  [P once T007 landed]
            → Phase 7 polish (T015-T017 [P]) → T018 gate
```

- **Hard security ordering**: T010 (`'redis'` into `MEMOIZED`) MUST NOT precede green T004-T006. Serialize before memoize (FR-007, Security-S5).
- **T003/T007 coupling**: the desync reset (T003) touches `connectPromise` (T007) — land T007 first or stub the field.

## Parallel opportunities

- Phase 2: T002 ∥ (T003 after T007).
- Phase 6: T013 ∥ T014.
- Phase 7: T015 ∥ T016 ∥ T017, then T018 alone.

## MVP scope

US2 + US1 (T001-T011): the shared authenticated socket with the interleave guard and credential
keying — the whole point of #145. US3/US4 harden and prove; polish repoints the docs/comments.

## Format validation

All 18 tasks carry a checkbox, sequential ID, story label where required (US phases), and an exact
file path. Setup/Foundational/Polish carry no story label by rule.
