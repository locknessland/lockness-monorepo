# Tasks: Bound the roster read a presence subscribe ingests

**Plan**: `.specnaut/specs/259-presence-bounded-read/plan.md` (approved 2026-09-14) | **Backlog item**:
[#341 — Realtime: every presence subscribe still reads and parses the whole room on the instance (R1e)](https://github.com/locknessland/lockness-monorepo/issues/341)

TDD is mandatory (constitution): every behaviour task starts with a witness proven red. Every task
that touches a rule in the plan's 🔒 decision table names that rule's home — the decision may not
land anywhere else.

## Phase 1: Setup — test infrastructure

- [X] T001 [P] Extend the Lua test evaluator in `packages/redis/tests/lua_eval.ts`: widen `LuaValue` for nested tables and nil/false elements, `unpack(ARGV, n)` argument expansion, table-constructor `return`; keep throwing on anything else; update its "Supported:" docstring, add rows to `packages/redis/tests/lua_eval.test.ts`, update `packages/redis/AGENTS.md`. Separate `test(redis)` commit.
- [X] T002 [P] Add `HLEN`, `HMGET` (≥ 1 field enforced, nil for absent) and `HRANDFIELD key count WITHVALUES` (first `count` in insertion order, documented as one outcome real Redis can produce) to `packages/realtime/tests/fake_redis.ts`; conformance rows in the `fake_redis_280` suite, including `HMGET` with zero fields erroring.

## Phase 2: Foundational — the seam

- [X] T003 Define `RosterWindow`, optional `readRoster(channel, limit, selfIds)` on `BroadcastDriver`, required on `PresenceCapableDriver`, remove `listMembers`, and `MAX_ROSTER_READ_SELF_IDS = 1000` with full JSDoc (contract: `members.length === min(limit, total)`, one per `String(id)`, driver order; `total` at the same instant; `selves` are `PresenceMember`s matched by parsed id, no `owner`; SHOULD transfer O(limit + selfIds), unenforceable) — home `packages/realtime/driver.ts`; value export of the constant in `packages/realtime/mod.ts`.
- [X] T004 Presence capability = `addMember` + `removeMember` + `readRoster` in `presenceRoster`, and NEW `assertNotLegacyRosterDriver` (throws at construction when `listMembers` is present, naming the migration), beside and separate from `assertNotLegacyRevocationDriver` — home `packages/realtime/manager.ts`. Witness first: a driver with `listMembers` throws (US4).

## Phase 3: US1 — a large room costs the same per subscribe (P1)

- [X] T005 [US1] Witness (red first) `packages/realtime/tests/presence_read_bound_341.test.ts`: a counting `RedisCommandClient` over `FakeRedis`; members padded to 4 KiB info, fixed-width ids, fixed `instanceId`; rooms of N = 1 000 and N = 10 000 yield the SAME pinned reply-byte count; `here.total === N`; the joiner (last in) is kept from `selves`; K = 10 pins its own count.
- [X] T006 [US1] Memory `readRoster` in `packages/realtime/drivers/memory.ts`: walk at most `limit` values in insertion order, `total = size`, `selves` via `get`, strip nothing beyond `PresenceMember`; throw before work unless `limit` is a positive integer and `selfIds.length ≤ MAX` (S2). Remove `listMembers`.
- [X] T007 [US1] Redis `readRoster` in `packages/realtime/drivers/redis.ts`: one loop-free `EVAL` constant — `HLEN`, `HRANDFIELD KEYS[1] ARGV[1] WITHVALUES`, `HMGET KEYS[1] unpack(ARGV, 2)` with self ids padded by `''` so `HMGET` always has ≥ 1 field (A1); ids only via `ARGV`; parse in TypeScript; `selves` matched by parsed `entry.member.id`, mismatches dropped, `owner` stripped (S3, S4); input asserts before any command (S2). Remove `listMembers`. If the live row in T013 shows `HRANDFIELD count ≥ N` does not return the whole hash, branch to `HGETALL` inside the SAME script when `HLEN ≤ limit` (S5).
- [X] T008 [US1] `localWindow(members)` (NEW) and `boundPresenceSnapshot(window, selfId, limit)` in `packages/realtime/presence_snapshot.ts`: self from `members`, else from `selves`; self replaces the last slot only when `members.length === limit`, else appended; self kept only if the roster holds it; each caller gets its own array.
- [X] T009 [US1] `rosterSnapshot` returns a `RosterWindow` (authoritative via `readRoster(channel, K, selfIds)`, local via `localWindow(#localRoster(channel))`); `#closingRead` takes the FETCH self id before the barrier call (only widens the read) and keeps the unchanged post-await self lookup; the three `return await this.#closingRead(channel, connection.id)` lines stay byte-identical — home `packages/realtime/manager.ts`.

## Phase 4: US2 — concurrent subscribes still share one read (P1)

- [X] T010 [US2] Witness (red first) in `packages/realtime/tests/presence_read_bound_341.test.ts`: gated shared read — B and C outside the window each keep their own self and not the other's, exactly 2 reads; an unsubscribe during the gated read drops self; 5 000 frames with ONE member id cost 2 reads (S1); with the cap set to 2, three distinct callers → 3 reads, none over the cap.
- [X] T011 [US2] Self-id batches in `packages/realtime/roster_read_barrier.ts`: the running read holds its callers' ids; each queued batch is a `Set` of `String(id)`, a caller whose id is pending joins without counting, `undefined` contributes nothing, a full batch starts a new FIFO batch; one read in flight per channel; trailing edge and rejection path on both arms unchanged; nothing retained once drained; cap injected via constructor (`new RosterReadBarrier(read, maxSelfIds)`).

## Phase 5: US3 — small rooms unchanged (P2)

- [X] T012 [US3] Witness in `packages/realtime/tests/presence_read_bound_341.test.ts`: a room ≤ K comes back whole, in driver order, on memory and FakeRedis; the local fallback (`readRoster` rejecting) and a roster-less driver still return `source: 'local'` / `'authoritative'` windows as today (#343 rows stay green).
- [X] T013 [US3] Gated live rows (`LOCKNESS_REDIS_INTEGRATION=1`) on Redis 7 in the realtime live conformance suite: `min(K, N)` distinct members; `total === HLEN`; a room ≤ limit returns the whole hash in `HGETALL` order; zero self ids is a valid read (A1); an absent self id between two present ones yields only the present entries, correctly matched (S3); `limit` of `-1`, `0`, `1.5` and `MAX + 1` ids throw before any command (S2).

## Phase 6: Migration and batteries

- [X] T014 Migrate every `listMembers` in tests (32 files, 72 lines — enumerate with `grep -rln listMembers packages/realtime/tests packages/redis`) to `readRoster`; each of the 24 inline doubles in 20 files additionally asserts `source: 'authoritative'` or a read count so none silently becomes roster-less (A8).
- [X] T015 New battery `packages/realtime/tests/mutations/presence_read_bound_341.ts`, each row proven live: limit → `Number.MAX_SAFE_INTEGER` (T005); `total` from window length (T005); next batch sends only the first caller's id (T010); cut ignores `selves` (T005/T010); cut uses the pre-await id (T010); overflow caller joins the full batch (T010); dedupe removed — frames counted instead of ids (T010); legacy guard returns silently (T004); `''` padding removed (fake `HMGET` minimum row); driver input assert removed (T013/unit); fake `HMGET` returns `''` instead of nil (`fake_redis_280`). Memory O(limit) walk vs full copy: declared equivalent survivor.
- [X] T016 Re-anchor and re-run: `roster_read_barrier_333` (4/4 rows), `presence_snapshot_339` (up to 6/8), `presence_local_member_343` (2/6), `live_conformance_285` (2 Lua rows); re-run unchanged `presence_join_323`, `roster_sync_330`, `presence_join_rosterless_342`, `churn_cost_329` (totals must not move — SC-004). No row may report a result on an anchor that no longer matches.

## Phase 7: Polish — docs

- [X] T017 [P] `docs/realtime.md`: new "Writing a presence driver" section (the three methods, `RosterWindow` contract, cost contract, input asserts); "Upgrading to v0.4.0" item 7 (`listMembers` → `readRoster`, construction-time refusal, random Redis sample for rooms > K accepted 2026-09-14, no Redis migration); correct the unbounded-read / `HGETALL` / hash-order passages (~599, ~628, ~719, ~739-743, ~1057, ~1070-1074); link the existing Redis 7.0 statement (~1282) instead of restating it. `README.md` ~142.
- [X] T018 [P] `packages/realtime/AGENTS.md`: correct ~402 and the reversed pitfalls ~423/~429; add pitfalls (the read is bounded in the driver, K and self stay in `presence_snapshot.ts`; batches count distinct ids; never add an unbounded fallback); regenerate with `deno task agents:brief`.
- [ ] T019 Full gate: `deno fmt --check`, `deno lint`, `deno check`, `deno task deps:analyze`, `deno task agents:brief --check`, `deno task test`, `deno task test:redis` (live), the batteries of T015/T016; FR-002's scoped grep returns only the legacy guard's probe.

## Dependencies

T001, T002 → T003 → T004 → (T005 → T006, T007, T008 → T009) → (T010 → T011) → T012, T013 → T014 → T015, T016 → T017, T018 → T019.
US1 and US2 share `presence_snapshot.ts` and the barrier call in `manager.ts`, so they run sequentially; T001/T002 and T017/T018 are the parallel pairs.

## Implementation strategy

MVP checkpoint = Phase 3 (US1): the seam, both drivers and the byte pin green on a single caller. US2 (batches) then restores read sharing under the new seam; US3 and the migration make the whole suite and the live Redis rows green. The branch ships only after T019; the MVP is a checkpoint inside the full path, not a fork.
