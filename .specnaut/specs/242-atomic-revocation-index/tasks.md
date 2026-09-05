---
description: "Task breakdown for #276 — atomic revocation index"
---

# Tasks: Atomic revocation index

**Input**: `/.specnaut/specs/242-atomic-revocation-index/plan.md`
**Prerequisites**: `plan.md`, approved at the plan stop 2026-09-05 with **Q1 = option D**
**Backlog item**: [#276](https://github.com/locknessland/lockness-monorepo/issues/276)

**Tests**: REQUIRED (TDD, constitution). **Order matters more than usual here**: FR-008's throwing
default lands *first*, because without it every later task can ship green while doing nothing.

## Format: `[ID] [P?] [Story] Description`

## 🔒 Decision-table homes carried forward

| Decision | Home | Enforced by |
| :--- | :--- | :--- |
| Whether a revocation is live | `packages/realtime/drivers/redis.ts` — the ZSET score, sole authority | T012 |
| When an entry is removed | same file — `ZREMRANGEBYSCORE` bounded by the script's own `t` | T012 |
| Recording a revocation (one operation, FR-013) | same file — one `EVAL` | T011 |
| Re-eviction may not shorten (FR-011) | same file — `ZADD … GT` | T011, T014 |
| Whose clock decides (FR-012) | same file — `redis.call('TIME')`, never `Date.now()` | T011, T012, T015 |
| Rollout behaviour (FR-009) | same file — new key + dual-read | T017 |
| What the fake claims Redis does | `packages/realtime/tests/fake_redis.ts` + `packages/redis/tests/` evaluator | T002, T005–T009 |

---

## Phase 1: Setup

- [X] T001 Confirm a clean tree on `242-atomic-revocation-index` and `deno task test` green before any edit

---

## Phase 2: Foundational A — make the test double honest (BLOCKING, own commit)

**Purpose**: FR-008. Until an unmodelled command fails loudly, every task below can pass while doing
nothing. This is the plan's named "single most likely way this feature ships broken".

- [X] T002 In `packages/realtime/tests/fake_redis.ts`, replace `default: return { type: 'nil' }` (line ~172) with a throw naming the command. Verified free: the driver issues exactly 10 commands and the fake models all 10
- [X] T003 Run the **full** suite unchanged. It must stay green — that is the proof nothing relied on the silence. Any failure is a pre-existing bug this task just exposed: fix it here, in this commit, and say so
- [X] T004 Commit as `test(fake): fail loudly on an unmodelled command` **before** starting Phase 3

**Checkpoint**: full suite green with a throwing default.

---

## Phase 3: Foundational B — model what option D actually uses (BLOCKING)

**Purpose**: the driver is about to issue `EVAL`, `TIME`, `ZADD … GT`, `ZREMRANGEBYSCORE`,
`ZRANGEBYSCORE`, `EXPIRE`. After T002 each is a loud failure until modelled — which is the point.

- [X] T005 [P] Create `packages/redis/tests/lua_eval.ts` — a shared, honest Lua-subset evaluator, per plan §9 / A10. It is Redis knowledge, not realtime knowledge, so it lives beside `fake_server.ts` and **never** on `@lockness/redis`'s published surface. Model it on `packages/session/tests/fake_redis.ts:97` `runEvalScript`, extended with the three things that evaluator lacks and these scripts need: **indexing** (`redis.call('TIME')[1]`), **integer arithmetic** (`t + ARGV[1]`), and **`return redis.call(...)`**
- [X] T006 [P] In `packages/redis/tests/lua_eval.ts`, make the evaluator **refuse what it does not understand** — an unrecognised statement throws rather than being skipped. A permissive evaluator is the same defect as the `nil` default, one layer up. Do **not** dispatch on script *text* (`script.includes(...)`); `packages/queue/tests/redis_driver.test.ts:61` is the in-repo example of getting this wrong
- [X] T007 Unit-test the evaluator in `packages/redis/tests/lua_eval.test.ts`: KEYS/ARGV resolution, indexing, arithmetic, return values, and a throw on an unknown construct
- [X] T008 In `packages/realtime/tests/fake_redis.ts`, add a sorted-set store and the arms: `ZADD` (**including the `GT` flag** — an ignored option token is FR-008's second clause), `ZREMRANGEBYSCORE`, `ZRANGEBYSCORE`, `EXPIRE`, `TIME`
- [X] T009 In `packages/realtime/tests/fake_redis.ts`, add the `EVAL` arm delegating to `lua_eval.ts`, and a **`TIME` source the test can control** — the fake currently shares one `Date.now()` across every driver instance, which is why plan §9 records clock skew as untestable. A settable clock also makes T015 possible
- [X] T010 Add a test-only inspector to `FakeRedis` exposing **stored cardinality** of the revocation key, so a dead reap cannot hide behind `listRevoked()`'s in-code filter (plan §9)

**Checkpoint**: `deno test -A packages/redis/tests/ packages/realtime/tests/` green; driver untouched.

---

## Phase 4: US1 + US2 (P1) — both races closed by construction

**Independent test**: SC-001 — an eviction at any point during another instance's reconcile still
revokes.

### Tests first

- [X] T013 [US1] In a new `packages/realtime/tests/revocation_atomicity.test.ts`, write **race 1** as a failing test: instance A enumerates, the entry's expiry passes, B re-evicts, A reaps — the revocation survives. Inject at the **command boundary** (FR-007), never by monkey-patching the driver
- [X] T014 [US2] In the same file, write **race 2** as a failing test: a reconcile runs while an eviction is part-way recorded. Under option D this should be *unconstructable* — one operation, no window. Assert that, and assert `ZADD … GT` cannot shorten a live score (FR-011)

### Implementation

- [X] T011 [US1] In `packages/realtime/drivers/redis.ts`, rewrite `markRevoked` as **one** `EVAL` against the new key `{prefix}:revocations` — `TIME`, then `ZADD … GT` with `t + ttl`, then `EXPIRE key ttl+slack`. Script as a private static, per the repo's three existing precedents. **Never** `Date.now()`
- [X] T012 [US1] Rewrite `listRevoked` as **one** `EVAL` — `TIME`, then `ZREMRANGEBYSCORE -inf t`, then `return ZRANGEBYSCORE t +inf`. Delete `#markerLive`: with one authority there is nothing to cross-check. `manager.ts` and `driver.ts` are **not** edited
- [X] T015 [US1] With the settable clock from T009, prove FR-012: two driver instances whose *local* clocks differ by more than the TTL both agree on what is live, because neither clock participates

**Checkpoint**: T013–T015 green.

---

## Phase 5: US3 (P1) — bounded, and observable

- [X] T016 [US3] Assert via T010's inspector that expired entries are **removed from storage**, not merely filtered from the return value (SC-002)
- [ ] ~~T018 [US3] Implement FR-015: the reap's removed count is recorded/returned~~ — **NOT DONE, deferred to [#279](https://github.com/locknessland/lockness-monorepo/issues/279).** An implementation was written and removed before merge: the anomaly clause is unconstructable under this design (the script reaps `score ≤ t` and returns `score > t` in one pass), and the count needs a Lua table return that `packages/redis/tests/lua_eval.ts` does not model — a change to a shared helper larger than the fix it would instrument

---

## Phase 6: US4 (P2) — the rollout

- [X] T017 [US4] Implement dual-read / write-new-only in `listRevoked`: the ZSET union the legacy `SMEMBERS {prefix}:revoked` filtered by `EXISTS {prefix}:revoked:<id>`. Reap **only** the new structure. `markRevoked` writes **only** the new one — dual-*write* would reinstate the two-structure defect
- [X] T019 [US4] **Edit `packages/realtime/tests/eviction_reconnect.test.ts:205`**, which pins the literal `'app:rt:revoked'` as a fault-injection predicate. Left alone it silently stops matching and the test passes while injecting nothing (plan §8 Tests row)
- [X] T020 [US4] Add a mixed-version test: legacy-shaped data present, new instance reads both, and **no key changes Redis type under its existing name** (FR-009)
- [X] T021 [US4] File the dual-read removal as its own issue against a named version, and reference it in the **same commit** that lands T017 — otherwise it becomes permanent (plan §9)

---

## Phase 7: Polish

- [X] T022 [P] `docs/realtime.md` — the durable-marker paragraph, plus the **Redis 7.0 floor** (FR-006), stated here and in §6
- [X] T023 [P] Refresh `packages/realtime/AGENTS.md` / `packages/redis/AGENTS.md`; add a Pitfalls entry for the fake's former silent default
- [X] T024 Full gate: `deno fmt && deno lint && deno check && deno task test`, plus `deno task deps:analyze` and `deno task publish:check`
- [X] T025 Commit by category: `test(fake)` (T002–T004, already committed), `test(redis)` evaluator, `fix(276)` driver, `test(realtime)`, `docs`, `chore`

---

## Dependencies

```
T001
 └─> Phase 2 (T002–T004)   ← BLOCKING, own commit, nothing proceeds until green
       └─> Phase 3 (T005–T010)   ← BLOCKING
             └─> Phase 4 (T013,T014 → T011,T012,T015)
                   ├─> Phase 5 (T016, T018)
                   └─> Phase 6 (T017, T019, T020, T021)
                         └─> Phase 7
```

- **Phase 2 blocks everything.** It is what makes every later "green" mean something.
- **T019 is not optional and not cosmetic** — skipping it leaves a test asserting nothing.
- T005–T007 (evaluator) are independent of T008–T010 (fake arms) and can proceed in parallel.

## Parallel opportunities

| Batch | Tasks | Why safe |
| :--- | :--- | :--- |
| Phase 3 | T005+T006+T007 alongside T008+T009+T010 | Different files (`redis/tests/` vs `realtime/tests/`) |
| Phase 7 | T022, T023 | Docs only |

## Implementation strategy

**MVP = Phases 2–4.** That is the honest fake, the modelled commands, and both races closed — #276's
two acceptance criteria in full.

Phase 5 makes the reap provable and observable; Phase 6 is the rollout US4 requires. **Ship all of
them in this branch**: a keyspace change without its migration is the one part of this that cannot be
added later without a second migration.

**Out of scope, filed:** [#274](https://github.com/locknessland/lockness-monorepo/issues/274),
[#275](https://github.com/locknessland/lockness-monorepo/issues/275),
[#277](https://github.com/locknessland/lockness-monorepo/issues/277). T021 files one more.
