---
description: "Task breakdown for feature 009 — session regenerate() TTL + Redis reply handling"
---

# Tasks: Fix session regenerate() TTL and Redis reply handling

**Input**: `plan.md` in this directory (the one design document).
**Backlog item**: [#139](https://github.com/locknessland/lockness-monorepo/issues/139)
**Tests**: REQUIRED — TDD is non-negotiable per the constitution, and the plan's SC-005/SC-006/SC-007
are mutation criteria. Every implementation task has a failing test written first.

**Package**: `@lockness/session`. All paths under `packages/session/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different file, no dependency on an incomplete task).
- Decision-table homes (plan §5) are named in the task that touches them — a task may not spell a
  decision anywhere but its home.

---

## Phase 1: Setup

- [X] T001 Confirm `safeForLog` is importable from `@lockness/contract` (the `session → contract`
  edge was added in #138 for `lifecycle/internal`; verify the specifier is declared in
  `packages/session/deno.json` and the symbol is public). If `safeForLog` is not exported, note it
  and fall back to a local hash-prefix redactor in `drivers/redis.ts` — decided at T014, not here.

---

## Phase 2: Foundational (blocking — the tree must compile before any story lands)

**The interface change is the single blocking prerequisite (plan §5 row 1, §8, Architecture Q3: 8
edit points, auth insulated).** A required param means every implementation and the two direct-driver
tests change together or the package fails typecheck.

- [X] T002 Add `lifetime: number` to `SessionDriver.regenerate` in `packages/session/types.ts:183`,
  with JSDoc for the new param (home of "how long a session lives" is the caller that passes it —
  `SessionStore`, not the driver).
- [X] T003 `SessionStore.regenerate()` in `packages/session/store.ts:81-86` passes
  `this.config.lifetime` to `driver.regenerate(oldId, newId, lifetime)` — the same source `save()`
  already reads (§5 row 1). Do NOT change the unconditional `this.sessionId = newId` assignment.
- [X] T004 [P] Update `CookieSessionDriver.regenerate` signature in `drivers/cookie.ts:514` to accept
  `lifetime` (body stays a no-op — cookie is stateless).
- [X] T005 Update the two direct-driver `regenerate(...)` call sites in `tests/drivers.test.ts:158`
  and `:218` to pass a lifetime argument, so the suite compiles.

*T002 blocks T003/T004/T005 and every story. T004/T005 are [P] with each other.*

---

## Phase 3: US1 — an authenticated session expires on schedule (P1)

**Goal**: regenerate on deno-kv and redis preserves the session lifetime (SC-002). This phase lands
the **atomic regenerate rewrite** (plan FR-011) since TTL and atomicity are one code region.
**Independent test**: create a session with a known lifetime, regenerate, assert the new key's
remaining server-side TTL is within 1s of the lifetime, on both server drivers.

- [X] T006 [P] [US1] Failing test in `tests/regenerate_ttl.test.ts`: on the Deno KV driver
  (`:memory:`), after `regenerate(old, new, 7200)` the new key's `expireIn`/remaining TTL is within
  1s of 7200s and the old key is gone (SC-002). Red before T008.
- [X] T007 [P] [US1] Failing wire test in `tests/redis_wire.test.ts` (or a new
  `tests/redis_regenerate.test.ts`) against `tests/resp_server.ts`: `regenerate(old, new, 7200)`
  issues a single atomic command carrying `7200` as the TTL, never `config.db`. Assert the fake sees
  one `EVAL` (not a GET+SET+DEL sequence of separate frames) and `obs.error === null`. Red first.
- [X] T008 [US1] Rewrite `DenoKvSessionDriver.regenerate` in `drivers/deno_kv.ts:97-104` to be
  atomic and lifetime-carrying:
  `kv.atomic().set(['sessions', newId], value, { expireIn: lifetime*1000 }).delete(['sessions', oldId]).commit()`
  (plan §5 atomic-rotation row + §5 row 1). Handle the "old key absent" case as a no-op commit.
- [X] T009 [US1] Rewrite `RedisSessionDriver.regenerate` in `drivers/redis.ts:163-169` as a single
  `EVAL` script — `GET old → SET new <value> EX <lifetime> → DEL old` — keyed on `oldId`/`newId`
  with `lifetime` in `ARGV`. Lifetime is the passed param, never `config.db` (§5 row 1 + atomic
  row). The session bytes never leave the server.
- [X] T010 [US1] Update `MemorySessionDriver.regenerate` in `drivers/memory.ts:60-66` to recompute
  `expires = Date.now() + lifetime*1000` (Architecture A-M1 / §5 row 1 third wrong home), not copy
  the old `{data, expires}` verbatim.
- [X] T011 [US1] Run the suite; T006/T007 green. Confirm the mutation SC-005 (revert to `config.db`
  or drop `expireIn`) turns a test red.

*T006/T007 [P]. T008/T009/T010 touch three different files — [P] with each other after T007. T011 last.*

---

## Phase 4: US2 — login rotates the id on every driver, atomically (P1)

**Goal**: session-fixation protection is on for all four drivers, and rotation is atomic (SC-001,
SC-007). Depends on US1's regenerate rewrite.
**Independent test**: the parametrised suite below, driven off the `SessionConfig['driver']` union.

- [X] T012 [US2] Failing parametrised test in `tests/regenerate_fixation.test.ts`, enumerating the
  drivers from the `SessionConfig['driver']` **union type** (not a hand-written array — §5 test-set
  row / A-L3). For each of cookie / memory / deno-kv / redis: after login-regenerate, (a) `getId()`
  differs from the pre-login id, and — for the two **server** drivers — (b) the new id reads back the
  carried data and (c) the old id no longer resolves server-side (Security S2 / FR-008). Red first.
- [X] T013 [US2] Failing atomicity test (SC-007): inject a fault between write and delete — an
  `EVAL` error on Redis (via the fake) and a forced `kv.atomic()` commit failure on Deno KV — and
  assert the store is left in a both-or-neither state, never new-resolves-while-old-also-resolves.
  Then confirm green against the T008/T009 atomic implementations.
- [X] T014 [US2] Failing Redis login-e2e test (FR-009): a full write → regenerate → read cycle on
  the Redis driver against the fake succeeds (the path that 500s today via `SETEX 0`). Green after
  US1.

*T012/T013/T014 are all [P] (separate test files); the implementation they verify landed in US1.*

---

## Phase 5: US3 — a Redis outage is visible, not a silent logout (P1)

**Goal**: `read()` returns `null` only for a genuine RESP nil; every failure logs once (redacted)
and propagates (FR-005, SC-003). Introduces `readReply` in `resp.ts` (FR-007).
**Independent test**: outage → one ERROR line + throw; miss → `null`, no log; empty value → `''`.

- [X] T015 [P] [US3] Failing unit tests for `readReply` in `tests/resp.test.ts`: parse each RESP
  reply type off a byte buffer — `+` simple, `:` integer, `-` error (throws with the server message),
  `$N` bulk, `$-1` nil (distinct outcome), `$0` empty bulk (→ `''`, NOT nil) (FR-006 / A-M2). Red
  first.
- [X] T016 [US3] Implement `readReply(conn)` in `drivers/resp.ts` beside `writeFrame` (§5 "when a
  reply is complete" home / FR-007): read the type byte, then the reply, returning a shape that keeps
  nil distinct from empty. Retain any bytes past the frame for the next call (A-L2 / §6). Full JSDoc.
- [X] T017 [US3] Rewrite `RedisSessionDriver.sendCommand`'s reply read (`drivers/redis.ts:104-110`)
  to call `readReply`, and **delete** `parseResponse` (`redis.ts:113-134`) — no second framing home
  (FR-007).
- [X] T018 [P] [US3] Failing tests in `tests/redis_error.test.ts`: (a) a dropped connection mid-read
  makes `read()` throw (not return `null`) and emit exactly one ERROR line; (b) a GET on a missing
  key returns `null` with no log; (c) a `-ERR` reply throws. Red first.
- [X] T019 [US3] Rewrite `RedisSessionDriver.read` (`drivers/redis.ts:136-144`): return `null` only
  for a RESP nil; on any thrown failure log **once** at ERROR through `safeForLog` (or the T001
  fallback) with a redacted id — never the raw `session:<id>` — then rethrow a typed error (§5
  log-once row / FR-005 / A-M3). The upstream handler renders a generic 500 without re-logging.
- [X] T020 [US3] Confirm the propagated error surfaces as a generic 500 in the framework error path
  (no RESP text / connection string to the client) — add or extend an integration assertion.

*T015/T018 [P] (different files). T016 blocks T017/T019. T019 depends on T001's `safeForLog` finding.*

---

## Phase 6: US4 — a large session round-trips through Redis (P2)

**Goal**: replies larger than one 4096-byte read reassemble intact, and the reader is bounded
(SC-004, SC-006). Builds on US3's `readReply`.
**Independent test**: an ≥8KB value round-trips byte-identical; a split bulk body reassembles; an
oversized declared length throws without allocating.

- [X] T021 [P] [US4] Failing test in `tests/redis_wire.test.ts`: an ≥8192-byte session value written
  then read back is byte-identical (SC-004), including the case where the fake delivers the bulk body
  in two TCP writes (split-read reassembly). Red against a single-read reader.
- [X] T022 [US4] Extend `readReply` (`drivers/resp.ts`) to drain the connection across multiple
  `conn.read`s until the RESP reply is structurally complete, using a growable buffer (FR-006). No
  per-byte allocation.
- [X] T023 [P] [US4] Failing test (SC-006): a `$` prefix declaring a length beyond the 10 MiB bound
  makes `readReply` throw promptly and NOT allocate a buffer of the declared size (Security S1). Red
  first.
- [X] T024 [US4] Add the 10 MiB max-bulk-length rejection and a production read timeout to the drain
  loop in `readReply` (FR-010 / §5 reply-size home). Green T021/T023.

*T021/T023 [P]. T022 before T021 goes green; T024 before T023 goes green.*

---

## Phase 7: Polish & cross-cutting

- [ ] T025 Post the Security-S5 ordering invariant as a comment on
  [#145](https://github.com/locknessland/lockness-monorepo/issues/145) (via the product-owner):
  driver memoization / a shared socket MUST NOT land before per-connection command serialization, or
  `readReply` becomes a cross-user disclosure primitive. (Plan §6 already records it.)
- [X] T026 Update `packages/session/docs/DOCS.md` and `drivers/resp.ts` header: reply reading now
  lives in `resp.ts`; `regenerate` is atomic and lifetime-carrying; `read()` no longer swallows.
- [X] T027 Run the full pre-completion gate: `deno fmt && deno lint && deno check <changed> &&
  deno task test`. All green before `review`. Re-run the SC-005/SC-006/SC-007 mutations to confirm
  each falsifier is red when the fix is reverted.

---

## Dependencies

```
Phase 1 (T001)
   └─ Phase 2 Foundational (T002 → T003/T004/T005)   ← blocks all stories
         ├─ Phase 3 US1 (regenerate rewrite: T006/T007 → T008/T009/T010 → T011)
         │     └─ Phase 4 US2 (fixation + atomicity tests: T012/T013/T014)
         └─ Phase 5 US3 (read/readReply: T015/T018 → T016 → T017/T019 → T020)
               └─ Phase 6 US4 (drain + bound: T021/T023 ↔ T022/T024)
   └─ Phase 7 Polish (T025/T026/T027)  ← after all stories
```

- **US1 → US2**: US2's tests verify US1's atomic implementation.
- **US3 → US4**: US4 extends the `readReply` US3 introduces.
- **US1 track and US3 track are independent** after Foundational (different methods: `regenerate` vs
  `read`/`sendCommand`), but both are P1 — sequence US1/US2 then US3/US4 on one branch.

## Parallel opportunities

- Foundational: T004, T005 in parallel after T002.
- US1: T006, T007 (tests) in parallel; then T008, T009, T010 in parallel (three files).
- US2: T012, T013, T014 in parallel (three test files).
- US3: T015, T018 in parallel.
- US4: T021, T023 in parallel.

## Implementation strategy (MVP → full)

- **MVP = US1 + US2** (P1): the TTL fix + atomic fixation. This alone closes the CRITICAL (Redis
  fixation off) and the deno-kv immortal-session bug — the core of #139.
- **US3** (P1): stop the silent logouts. Ships next; independent of US1.
- **US4** (P2): large-session correctness + the resource bound. Last.
- The full path (US1–US4 + polish) is one branch, one `review`, squashed by scope at merge.
