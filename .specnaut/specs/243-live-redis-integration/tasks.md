# Tasks: Live-Redis integration coverage for the realtime bus

**Feature**: `243-live-redis-integration` | **Backlog item**: [#273](https://github.com/locknessland/lockness-monorepo/issues/273)
**Plan**: [plan.md](plan.md) — read §5 before writing a line; every decision below names its home.

**This feature's deliverable IS tests.** What replaces red-first here is **mutation verification**:
every assertion is proved to fail when the behaviour it guards is broken, then restored. A task that
says "mutation-verify" is not optional polish — it is the only thing that distinguishes an assertion
from a comment.

---

## Phase 1 — Setup

- [X] T001 Start a throwaway broker for local verification: `docker run -d --rm --name lockness-it-redis -p 63790:6379 redis:7-alpine`, and confirm `INFO server` reports 7.0+. This is the broker every later mutation check runs against; without it no task in Phase 3–6 can be verified.

## Phase 2 — Foundational (blocks every user story)

The broker-generic half of the harness. **Home: `packages/redis/tests/live_broker.ts`** — see plan
§5's split rationale; this file must not know that `@lockness/realtime` exists.

- [X] T002 Create `packages/redis/tests/live_broker.ts` with `@fileoverview`/`@module` and the exported gate constant `LIVE_BROKER` reading `LOCKNESS_REDIS_INTEGRATION === '1'` — the **single home** for "whether the suite runs at all" (plan §5 row 1). No other file may read that variable.
- [X] T003 Add the `BrokerConfig` builder to `packages/redis/tests/live_broker.ts`: `LOCKNESS_REDIS_HOST` (default `127.0.0.1`), `_PORT` (`6379`), `_PASSWORD`, `_DB` (`0`), `_TLS` (`false`). Returns a `RedisClientConfig`. The **single home** for connection settings (FR-002).
- [X] T004 Add `preflight()` to `packages/redis/tests/live_broker.ts` — the **single home** for every refusal (plan §5 row 3): (a) unreachable broker fails naming host and port **and nothing else from the config** (FR-003); (b) `INFO server` below Redis 7.0 fails naming the version found (FR-004); (c) password set + TLS off + non-loopback host fails (FR-002/S4). Never degrades to a skip.
- [X] T005 Add `runNamespace()` to `packages/redis/tests/live_broker.ts`: `lockness-it:<random>` where `<random>` is `crypto.getRandomValues` rendered over a fixed `[a-z0-9]` alphabet, so it matches `/^lockness-it:[a-z0-9]+$/` and contains no glob metacharacter (FR-005/S6). The **single home** for the namespace.
- [X] T006 Add the `finally`-bound teardown to `packages/redis/tests/live_broker.ts`: `SCAN … MATCH <namespace>*` then `DEL` in batches, covering the no-TTL keys (`{prefix}:instances`, `{prefix}:owned:<id>`, legacy `{prefix}:revoked`). **Never `FLUSHDB`, `FLUSHALL` or `KEYS`** (FR-006). The **single home** for cleanup.
- [X] T007 Move `waitFor` into `packages/redis/tests/live_broker.ts` as the **single home** (plan §5 row 6, A10) — poll-until-true with a deadline, never a fixed `setTimeout`.
- [X] T008 [P] Verify T004's three refusals by construction: point the gate at a closed port, at the running 7.x broker with a bogus password + non-loopback host, and assert each fails with its own distinguishable message (SC-003). This is the mutation check for the preflight.
- [X] T009 [P] Verify T006 leaves nothing behind: seed a key outside the namespace, run the teardown, assert the foreign key is byte-identical and every namespaced key is gone (SC-004). Then make an assertion throw mid-body and assert the teardown **still** ran (S3).

## Phase 3 — Realtime harness (blocks US1–US4)

The realtime-specific half. **Home: `packages/realtime/tests/live_realtime.ts`.**

- [X] T010 Create `packages/realtime/tests/live_realtime.ts` with `@fileoverview`/`@module`, importing the Phase-2 harness via `../../redis/tests/live_broker.ts` (established precedent: `driver_redis_live.test.ts:34-37`).
- [X] T011 Add `keys(namespace)` to `packages/realtime/tests/live_realtime.ts` — the **single home** for the Redis key layout the suite reads back (plan §5 row 7): `presence`, `owned`, `alive`, `instances`, `revocations`, and the legacy `revoked`. The driver's own getters are `private` (`packages/realtime/drivers/redis.ts:427-452`), so this second home is forced; it must exist once, not once per test.
- [X] T012 Add `controlSecret()` to `packages/realtime/tests/live_realtime.ts`: 32 bytes from `crypto.getRandomValues`, hex. **No control-secret literal in any tracked file** (FR-010/S1). The **single home**.
- [X] T013 Add the raw read-backs to `packages/realtime/tests/live_realtime.ts` — `roster(channel)` via `HGETALL`, `revoked()` via `ZRANGEBYSCORE`, `ttlOf(key)` via `TTL` — issued on **a client the suite owns**. The **single home** for "what counts as an authoritative read-back" (FR-008/A3). Nothing in this feature may assert through `driver.listMembers()` or `driver.listRevoked()`.
- [X] T014 Add `withInstances(n, body)` to `packages/realtime/tests/live_realtime.ts` — the **single home** for instance construction and disposal (plan §5 row 10, A6). Builds `n` driver+manager pairs through `RedisBroadcastDriver.fromConfig` with the run's namespace as `prefix` and T012's secret, and closes every one in a `finally`. CI runs `deno task test:leaks` (`.github/workflows/test.yml:68`), so a leak is a red build.
- [X] T015 Add the namespace-bounded control-frame seam to `packages/realtime/tests/live_realtime.ts` — publish an arbitrary payload onto **this run's** control topic and observe the ingest outcome. Bounded to `<namespace>*` (FR-005/S2). Not used by this feature's assertions; it exists so #272's replay test inherits the boundary instead of reaching for an unbounded subscribe.

## Phase 4 — US1: cross-process delivery (P1)

**Independent test criterion**: an event broadcast on instance A arrives at an authorized subscriber
on instance B, and a connection B's own authorizer rejects receives nothing — asserted over a live
broker.

- [X] T016 [US1] Create `packages/realtime/tests/redis_broker_integration.test.ts` with `@fileoverview`/`@module`, `ignore: !LIVE_BROKER` on every test (FR-001, precedent `packages/vite/tests/css.test.ts:176`), and `[integration]` in each test name.
- [X] T017 [US1] Assert cross-process delivery over the live broker (SC-001): two instances via `withInstances(2)`, subscribe on B, broadcast on A, `waitFor` the arrival.
- [X] T018 [US1] Assert a connection B's authorizer rejects receives nothing, proving B re-applies its own authorization rather than trusting the bus (plan §1's S6 reference).
- [X] T019 [US1] Mutation-verify T017: break the fan-out (point the publish at a different topic), watch it fail, restore.

## Phase 5 — US2: authoritative presence (P1)

**Independent test criterion**: the roster read **out of Redis** lists both instances' members.

- [X] T020 [US2] Assert both members appear in the roster read via T013's raw `HGETALL` (SC-002, FR-008) — never via `driver.listMembers()`.
- [X] T021 [US2] Assert each client observed a `joined` for the other.
- [X] T022 [US2] Mutation-verify T020 against a wrong key name: confirm the assertion fails rather than passing vacuously (FR-009).

## Phase 6 — US3: cross-process eviction (P1)

**Independent test criterion**: an evict issued on the instance that does **not** own the socket
closes it, and the member leaves the authoritative roster.

- [X] T023 [US3] Assert the socket owned by A is closed when B evicts the client id (SC-003).
- [X] T024 [US3] Assert the member is **absent** from the roster read via T013 — and, in the same test, assert its **presence** beforehand, so a mistyped key cannot pass vacuously (FR-009/A4).
- [X] T025 [US3] Assert presence subscribers on both instances observed a `left`.
- [X] T026 [US3] Mutation-verify T023: suppress the revocation, watch the assertion fail, restore.

  **The first mutation was wrong and the test correctly ignored it.** Disabling the local-revoke branch inside `evict()` changed nothing, because the target lives on instance A while the evict is issued on B — that branch never runs in this scenario. The mutation that exercises the real path is suppressing `handleControl`'s `evict` arm on the owning instance, and it fails with `waitFor timed out: the owning instance to close the evicted socket`. Recorded because a mutation check that passes is ambiguous: it means either the test is weak or the mutation missed, and only looking tells you which.

## Phase 7 — US4: the durable revocation index under real Redis semantics (P1)

**Independent test criterion**: the sorted-set index behaves under the real `ZADD … GT`,
`EXPIRE … NX`, `EXPIRE … GT` and `TIME` semantics — the code that was wrong twice while the suite
stayed green. Expected values are recorded in plan §1's probe table.

- [X] T027 [US4] Assert `markRevoked` arms a TTL on first write: `ttlOf(keys.revocations)` is positive, not `-1`. This is the assertion that would have caught the inert `EXPIRE … GT` shipped mid-#276.
- [X] T028 [US4] Assert the TTL extends but never shrinks across two `markRevoked` calls with different TTLs (FR-011 of #276, plan §1 probe rows 3–4).
- [X] T029 [US4] Assert `listRevoked` reaps expired entries and returns live ones, read back via T013's raw `ZRANGEBYSCORE` rather than through the driver (FR-008).
- [X] T030 [US4] Assert the index's cardinality is bounded — a second `markRevoked` for the same target does not add a second member (`ZADD … GT` semantics).
- [X] T031 [US4] Mutation-verify T027: revert the driver's `EXPIRE … NX` line to `GT` alone, confirm T027 fails, restore. **Done — T027 fails with `Got -1`.**

  **Correction to this task's own premise.** It was written as "the proof this suite catches what `fake_redis.ts` did not". That is false today and the wording has been fixed in the suite's header: the fake was corrected in the same change that fixed the driver, so it catches this mutation too. What the live suite is, is the only check that does not *depend* on the fake being right — both were wrong together twice and nothing in the repository could tell. Watching this file go red is a statement about Redis; watching the fake go red is a statement about the fake.

## Phase 8 — Polish & cross-cutting

- [X] T032 Add the root task to `deno.jsonc` running the gated suite in one command (FR-012). It is the **one sanctioned second occurrence** of the `LOCKNESS_REDIS_INTEGRATION` literal (plan §5 row 1).
- [X] T033 Add the CI job to `.github/workflows/test.yml` with a `redis:7` service container and the gate set (FR-013, Q1). Every `LOCKNESS_REDIS_*` value comes from the workflow file, never from anything a fork's pull request can influence.
- [X] T034 [P] Document the suite in `docs/testing.md`: the gate, every env var, the throwaway-broker command, and the secret's **provenance** (`openssl rand -hex 32`) — never a value (FR-010/FR-011).
- [X] T035 [P] Add the pointer in `packages/realtime/README.md` for a maintainer standing in the package (FR-011).
- [X] T036 Regenerate both agent briefs — `deno task agents:brief` — because `scripts/agents_brief.ts:184-185` files a non-`.test.ts` file into a package's **source** inventory and `.github/workflows/test.yml:59` runs `agents:brief --check` as a hard step (A7). Both `packages/redis/AGENTS.md` and `packages/realtime/AGENTS.md` change.
- [X] T037 Grep-verify FR-005 over **both** connections: `grep -nE "\.command\(|psubscribe\(" packages/redis/tests/live_broker.ts packages/realtime/tests/live_realtime.ts packages/realtime/tests/redis_broker_integration.test.ts` — every key and every topic derives from the run namespace, no literal.
- [X] T038 Grep-verify the bans: no `FLUSHDB`, `FLUSHALL` or `KEYS` anywhere in the three new files; no control-secret literal in any tracked file.
- [X] T039 Run the pre-completion gate: `deno fmt && deno lint && deno check && deno task test` — the suite **skipped**, proving SC-002 and that the default run stays hermetic.
- [X] T040 Run the gate again with the suite **on**, against the T001 broker: every test green (SC-001). A gate that only proves the suite skips proves nothing.
- [X] T041 Stop and remove the throwaway broker; confirm the suite then skips rather than hangs.

---

## Dependencies

```text
Phase 1 (T001)
   └─> Phase 2 (T002–T009)      broker-generic harness — blocks everything
          └─> Phase 3 (T010–T015)   realtime harness — blocks US1–US4
                 ├─> Phase 4 US1 (T016–T019)
                 ├─> Phase 5 US2 (T020–T022)
                 ├─> Phase 6 US3 (T023–T026)
                 └─> Phase 7 US4 (T027–T031)
                        └─> Phase 8 (T032–T041)
```

US1–US4 are independent of each other once Phase 3 lands: each owns its own scenario and its own
instances. T016 creates the file the other three write into, so it is US1's first task by ordering,
not by dependency.

## Parallel opportunities

- T008 ‖ T009 — different behaviours of the same harness, no shared state.
- Phase 4 ‖ 5 ‖ 6 ‖ 7 once T016 exists — different tests in one file, independent instances.
- T034 ‖ T035 — different documents.

## MVP scope

**Phases 1–4** (T001–T019) deliver #273's headline criterion: cross-process delivery proven against
a live broker. Phases 5–6 complete its three stated acceptance criteria. Phase 7 is the scope the
user added at the plan stop (Q2) and carries the highest value per test.

## Review cycle (2026-09-05)

The `/specnaut review` gate returned **fail — 0 CRITICAL, 4 HIGH, 10 MEDIUM, 12 LOW**. The four
HIGH were all the same class: assertions that pass for the wrong reason. Two arrived marked
NOT VERIFIED; both were confirmed by executing the mutation before anything was changed.

| # | Finding | Mutation that proved it | Outcome |
| :--- | :--- | :--- | :--- |
| H1 | US3's third clause had no assertion — `left` appeared 0 times in the suite | suppress `handleControl`'s `presence-leave` arm | fixed; now fails |
| H2 | `-inf +inf` read-back is score-blind | `t + ARGV[1]` → `t - ARGV[1]` (revocations dead on arrival) — **all 10 passed** | fixed; bounded by broker clock + a reaping test |
| H3 | bare `EXISTS == 0`, no paired presence | mistype `keys().legacyRevoked` | fixed **twice** — see below |
| H4 | `extended >= armed` is satisfied by a TTL that never moves | delete the driver's `EXPIRE … GT` line — **all 10 passed** | fixed; numeric floor |

**H3's first fix was worse than useless.** Seeding and re-reading the same helper constant proves
the key is *writable*, not that it is the *right* key: mistype the constant and both halves are
mistyped together, and the mutation showed it still passed. The driver never writes that key, so
nothing can observe its spelling — the honest assertion enumerates the namespace with `SCAN`. That
version fails under a driver mutated to write the legacy SET.

**Strengthening US2's `joined` assertion disproved a plan claim.** Plan §2's US2 says "each observed
a `joined` for the other". That only holds if both join after both are subscribed: a later joiner
receives no replayed join and learns the roster instead. The test now asserts what actually holds,
plus the absence of a replay.

MEDIUM/LOW: M1, M2, M3, M5, M6, M7, M8, M9, M10 and six LOWs fixed in the same cycle. M4 filed as
[#281](https://github.com/locknessland/lockness-monorepo/issues/281), and the review's one
cross-seat blind spot — nobody verified the *driver* prefix-anchors its keys and patterns — filed as
[#282](https://github.com/locknessland/lockness-monorepo/issues/282).

## Not delivered by this feature

**#280's conformance item stays open** — the differential that runs the same command sequences
against `fake_redis.ts` and a real Redis and diffs the answers. This feature builds the live half and
the harness that makes the other half cheap. It must not be used to close #280.

**#274 stays invisible** — the idle-bus re-dial is below this suite's 30 s budget.
