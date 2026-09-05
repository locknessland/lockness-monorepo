# Plan: Atomic revocation index — a live revocation is never dropped

**Branch**: `242-atomic-revocation-index` | **Date**: 2026-09-05 | **Backlog item**: [#276 — Realtime: listRevoked's index reap is non-atomic and can drop a live revocation](https://github.com/locknessland/lockness-monorepo/issues/276)

**This is the feature's one planning document.**

---

## 1. Why this exists

**An evicted user can keep receiving events indefinitely**, because the durable revocation that was
supposed to catch them is silently erased from the only structure that enumerates it.

Realtime authorization is cached at subscribe (`ChannelManager.deliverLocal` fans to the subscription
set and never re-authorizes per message), so eviction is the sole revocation path. #268 made eviction
durable — a per-target marker plus an index set — precisely because the `evict` control frame travels
over at-most-once pub/sub and can be lost. #271 added a second trigger so the marker is re-checked at
reconnect as well as on a timer. **Both triggers enumerate revocations from the index.** An id missing
from the index is invisible to every recovery path this framework has.

`listRevoked` (`packages/realtime/drivers/redis.ts:611`) reaps with an `EXISTS` and an `SREM` as two
separate round-trips, with nothing between them.

### Two interleavings, not one

**Race 1 — TTL expiry (as filed).** Instance A reads the index, checks `X`'s marker, finds it just
TTL-expired. Instance B re-evicts `X`. A's `SREM` then deletes the entry B just wrote.

**Race 2 — `markRevoked`'s own write order (found while planning).** `markRevoked` (`redis.ts:578`)
issues `SADD` **then** `SET`. Between them the id is in the index with no marker; a concurrent
`listRevoked` sees it, `EXISTS` returns 0, and it `SREM`s the entry — then the `SET` lands. A live
marker, absent from the index.

The security audit tightened the window: the reaper's `SMEMBERS` must land after the `SADD` and its
`EXISTS` for that id before the `SET` — about one round-trip. It is narrow. It is also, as that audit
observed, **not only a race**: if the `SET` never lands (process death, connection fault between the
two awaits) the same end state is reached with no concurrency at all.

**Severity, stated honestly.** Both need a concurrent reconcile inside a short window. The failure is
**silent and permanent**: nothing logs, nothing retries. For a control whose whole purpose is to
survive lost messages, "usually works" is the wrong guarantee. #271 increased the traffic through
these windows — a second trigger firing on every subscribe-socket re-dial, which
[#274](https://github.com/locknessland/lockness-monorepo/issues/274) shows is roughly every 30s per
instance on an idle bus.

## 2. User scenarios

### US1 — A re-eviction during a reap survives (P1)

**Given** `X` is in the index and its marker has just TTL-expired
**And** instance A's reconcile has read the index and decided `X` is reapable
**When** instance B re-evicts `X` before A performs the removal
**Then** `X` is still enumerated by the next `listRevoked` on every instance, and is revoked.

### US2 — An eviction concurrent with a reap survives (P1)

**Given** instance B is part-way through recording an eviction of `Y`
**When** instance A's reconcile enumerates and reaps in that window
**Then** `Y` is still enumerated by the next `listRevoked`, and is revoked.

### US3 — The index stays bounded (P1)

**Given** revocations accumulate over days
**When** their expiry passes
**Then** entries are released and the structure does not grow without bound.

### US4 — An operator upgrading loses no live revocation (P2)

**Given** a running deployment holding revocations under the current layout
**When** the new version rolls out, both versions running briefly side by side
**Then** no live revocation is dropped, and **no instance errors on the stored shape** — in
particular no key changes Redis *type* under a name an old instance still writes.

**Residual exposure, stated rather than implied**: with write-new-only + dual-read (§12 Q1's rollout
shape), a *new* instance's revocation is not enumerable by an *old* one. Avoiding that needs
dual-**write**, which reinstates the two-structure defect this feature removes. The exposure is one
rollout window, bounded by `revocationTtlSeconds` (default 300s), and covered meanwhile by the
`evict` control frame.

### Edge cases

- **Two instances reaping simultaneously.** Removal must be idempotent.
- **A revocation re-issued for an id already live** — **extends the window, never shortens it.**
  Free today (`SET … EX`); **not free** under a scored set, where a bare `ZADD` overwrites. See
  FR-011.
- **Clock skew between instances** — see FR-012, and Q1.
- **An id revoked, expired, and revoked again** across one reconcile pass.
- **An empty index.** Must not error, must not fabricate a revocation.
- **A partial failure mid-`markRevoked`** — must not leave a live revocation unenumerable (FR-013).

## 3. Requirements

- **FR-001**: A revocation live at the instant of removal is **never** removed. This quantifies over
  every interleaving of `markRevoked` and `listRevoked` across any number of instances — not merely
  the two in §1.
- **FR-002**: `listRevoked` returns exactly the ids whose revocation is live at call time.
- **FR-003**: Expired entries are released, so the structure stays bounded (US3).
- **FR-004**: Removal is idempotent and safe under concurrent reapers.
- **FR-005**: `listRevoked` and `markRevoked` keep their current **signatures and semantics**.
  Enumerated by `grep -rn "listRevoked\|markRevoked" packages` — see §8's corrected counts.
- **FR-006**: The implementation states the **minimum Redis version** it requires, in §6 and in
  `docs/realtime.md`. *(Replaces the earlier "no capability the project does not already use", which
  the architecture audit proved void — see A1.)*
- **FR-007**: A test **drives both races** and fails without the fix. Faults are injected **at the
  command boundary**, never by monkey-patching the driver under test — the convention already written
  at `packages/realtime/tests/eviction_reconnect.test.ts:199-201`.
- **FR-008**: `FakeRedis` **fails loudly on any command it does not model.** Its
  `default: return { type: 'nil' }` (`fake_redis.ts:172`) is replaced by a throw naming the command,
  **in its own commit before any other change**. Verified free today: the driver issues exactly ten
  commands and the fake models all ten. Additionally, a command whose **option tokens** the fix
  relies on must model those options — `SET` currently parses only `EX` and silently ignores
  `NX`/`XX`/`GT`/`KEEPTTL`.
- **FR-009**: Upgrade behaviour is implemented and stated (US4), and **no key changes Redis type
  under its existing name**.
- **FR-010**: JSDoc on the changed members explains the **atomicity property**, not just mechanics.
- **FR-011**: A re-eviction may only **extend** a live revocation, never shorten it.
- **FR-012**: **The expiry bound is evaluated by Redis, never by an instance's wall clock** — or, if
  a stored value is used, the plan states the skew tolerance explicitly and Q1 records that trade.
- **FR-013**: Recording a revocation is **one operation**. If more than one structure is written,
  both writes are issued together (a single script, or `MULTI`/`EXEC`); reversing their order is
  **not** sufficient — see §12.
- **FR-014**: Where an interleaving's outcome is ambiguous, it resolves toward **retaining** the
  entry. Retention is provably harmless: connection ids are per-socket `crypto.randomUUID()`, never
  reused, and a reconnecting client draws a fresh id (`redis.ts:591-593`) — so a retained expired
  entry can never revoke the wrong person. The only bound required is FR-003.
- **FR-015**: The reap's removed count is **observable** — recorded/returned rather than silently
  discarded. No per-pass log line.
  **NOT DELIVERED on this branch; filed as [#279](https://github.com/locknessland/lockness-monorepo/issues/279).**
  The count exists inside the script (`ZREMRANGEBYSCORE` returns it) but the return slot carries the
  member list, and returning both needs a Lua **table return** — an extension to the shared
  `lua_eval.ts` helper used by four packages, larger than the fix it would instrument.
  The clause originally attached here — a WARN on "an id reaped in the same pass in which it was
  re-added" — was **withdrawn as unconstructable**: the script reaps `score ≤ t` and returns
  `score > t` in one pass, so no id can be both, and the cross-pass variant fires on a *legitimate*
  re-eviction (US1). An implementation of it was written, found to be dead code, and removed before
  merge.

## 4. Success criteria

- **SC-001**: An eviction issued at any point during another instance's reconcile still results in
  that connection being revoked.
- **SC-002**: A revocation whose expiry has passed stops being reported, and its storage is released.
- **SC-003**: An operator upgrading a running deployment observes no dropped revocation and no error.
- **SC-004**: The behaviour of `evict` as seen by an application is unchanged in every respect other
  than the defect being removed.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **Whether a revocation is still live** | `packages/realtime/drivers/redis.ts` — **one** authority. Both admissible shapes qualify: a single structure whose stored value carries the expiry, **or** a per-target key with a server-side TTL from which the enumeration is derived. What is *not* admissible is two independently-written structures that must agree. | the current pairing of a per-target key with a separately-maintained index set — two structures encoding one fact, which is the defect; any in-process "who is revoked" cache in `manager.ts` |
| **When a revocation entry is removed** | `packages/realtime/drivers/redis.ts` — a removal bounded by "already expired" **evaluated at removal time**, never a read-then-delete across round-trips | an `SREM`/`DEL` conditioned on a value read in an earlier round-trip; a reaper on a separate timer; a reap inside `manager.ts` |
| **Recording a revocation** (one operation, FR-013) | `packages/realtime/drivers/redis.ts` — `markRevoked`, issuing **one** operation | two sequential awaits in any order; a "write the marker first" convention, which trades the race for a partial-failure hole |
| **Whether a re-eviction may shorten a live revocation** (FR-011) | `packages/realtime/drivers/redis.ts` — the write itself refuses to shorten (`ZADD … GT`, or a server-side TTL, depending on Q1) | a read-then-max in the driver (read-then-write again); an "already revoked?" check in `manager.ts` |
| **Whose clock decides expiry** (FR-012) | `packages/realtime/drivers/redis.ts` — and the answer must be **Redis**, whether via a native TTL or a `TIME`-derived bound | a score written from the writer's `Date.now()` and compared against the reader's `Date.now()` — one decision relocated from one process to N |
| **What the rollout does while both versions run** (FR-009) | `packages/realtime/drivers/redis.ts` — a new key name plus one release of dual-read / write-new-only, its removal filed as an issue in the same commit | an ops runbook step; a config flag; dual-**write**, which reinstates the two-structure defect |
| **What a revocation re-check does with the ids** | `packages/realtime/manager.ts` — `reconcileRevocations` (**unchanged**) | any filtering or liveness re-check moved into the manager |
| **When the re-check runs** | `packages/realtime/drivers/redis.ts` — `onRevocationReconcile` (**unchanged**, #271) | — |
| **How long a revocation lasts** | `packages/realtime/drivers/redis.ts` — `revocationTtlSeconds`, one value | a TTL on one structure plus a separate expiry in another |
| **What the test double claims Redis does** | `packages/realtime/tests/fake_redis.ts` — every command modelled, **and an unmodelled one throws** | a `default` branch returning a value indistinguishable from success; a command modelled but with its option tokens ignored |

**Binding on the implementer.** A decision may not move out of its home without this table being
amended first. Row 1 admits two shapes deliberately — Q1 chooses between them, and until it is
answered this table does not pre-decide it.

## 6. Technical context

**Language/Version**: TypeScript on Deno
**Primary Dependencies**: `@lockness/redis` (`RedisClient`), `@lockness/realtime`
**Storage**: Redis. Today: `{prefix}:revoked` (SET) + `{prefix}:revoked:<target>` (string, `EX` TTL)
**Minimum Redis version**: **7.0** (FR-006), set by `EXPIRE … GT`. `ZADD … GT` alone would be 6.2,
but the key-level guard is required for the same reason the member-level one is (review HIGH-1). `EVAL`, `TIME`, `ZREMRANGEBYSCORE` and `ZRANGEBYSCORE`
are all far older. No floor is declared anywhere in this repo today (verified), so this is the first
one, and it is stated in `docs/realtime.md` as well as here.
**Testing**: `Deno.test`, `packages/realtime/tests/fake_redis.ts`, `@std/testing/time` `FakeTime`
**Target Platform**: Deno server, multi-instance
**Project Type**: library
**Performance Goals**: a reconcile pass costs no more round-trips than today (1 + 2N)
**Constraints**: no change to `BroadcastDriver` signatures; no new dependency edge
**Scale/Scope**: 1 source file, 1 test fake, 2 test files, 1 doc

### Domain model

**No new entities.** The feature changes how one existing fact is *stored*.

- **Bounded context**: `realtime` — revocation.
- **Vocabulary**: **revocation** — the durable record that a connection id must be cut off.
  **Live** — its expiry has not passed. **Reap** — releasing storage for expired revocations.
  **Index** — the enumeration the re-check walks. The point of this change is that *index* and
  *revocation* stop being two independently-written things.
- **Invariants**:
  - A revocation that is live is enumerable by every instance. **No interleaving may violate this.**
  - Liveness is decided by **one** authority. Two structures that must agree eventually will not.
  - A reap only removes what is **already** expired, judged at removal time.
  - The re-check remains **monotone** (#271 S-F5) — a trigger may apply a revocation, never rescind
    one. **This is conditional on FR-012**: #271's monotonicity argument rested on reaping being
    TTL-driven, i.e. decided by Redis. A stored score compared against an instance's clock would end
    it, which is why FR-012 exists.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1. No direct `hono` import | pass | Untouched. |
| 2. JSR-only, declared per package | pass | No new dependency. |
| 3. No `any` in exported APIs | pass | Signatures unchanged. |
| 4. Tailwind v4 syntax | pass | No front-end surface. |
| 5. Pre-completion gate | pass | Full gate before done. |
| 6. Never hand-edit `deno.lock` | pass | No dependency change. |
| 7. JSDoc on public APIs | pass | FR-010. |
| 8. MVC layering | pass | Persistence detail stays in the driver; `manager.ts` names no Redis symbol (verified). |
| 9. Commit discipline | pass | `test(fake)` for FR-008 first, then `fix(276)`, `test`, `docs`. |
| TDD | pass | FR-007 — both races fail first. |
| DDD layering | pass | The aggregate boundary is the transaction boundary; §5 row 1 states it. |
| Domain Model gate | pass | §6. |
| SOLID / DRY / KISS / YAGNI | pass | Q1 decides whether the duplication is **removed** or **guarded**; §5 row 1 admits both, §7 does not claim removal. |
| No silent catches | pass | FR-008 replaces the fake's silent `default` — a `silent-catch` instance the audit named. |

### Complexity tracking

No violations.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `BroadcastDriver` port (`driver.ts`) | no | Signatures unchanged (FR-005) |
| `ChannelManager` (`manager.ts`) | no | `reconcileRevocations` unchanged; names no Redis symbol |
| `RedisBroadcastDriver` internals | yes | The revocation storage shape and its reap |
| `@lockness/redis` | no | No script or `EVAL` helper belongs in the transport package — every existing script in this repo is a private static in its **consumer** (`session/drivers/redis.ts:191`, `queue/drivers/redis.ts:53,79`, `core/scheduler/locks.ts:60`) |
| `MemoryBroadcastDriver` | no | Implements no revocation — the durable guarantee is **Redis-only by design**, so §6's invariant is vacuous for single-process deployments |
| Wire protocol / client | no | An evicted socket still closes `4403` |
| Configuration | no | `revocationTtlSeconds` keeps its name and meaning |
| **Redis keyspace** | **yes** | The one externally-visible change — US4 / FR-009 / Q1 |
| **Tests** | **yes** | `eviction_reconnect.test.ts:205` hard-codes `'app:rt:revoked'` as a fault-injection predicate. **A key rename makes it silently stop matching — the test would pass while injecting nothing.** Must be edited with the rename. `eviction_durable.test.ts` also exercises the path. |
| Docs | yes | `docs/realtime.md:173` describes the durable marker in prose (no key names) — one paragraph |
| Front-end / UX-UI | no | Back-end only |

**Blast radius, counted** *(both original figures were wrong — corrected per A5)*:

- **`listRevoked`: 1 call site, 2 triggers** — `manager.ts:390`. The driver's `#runRevocationReconcile`
  is not a second caller; it invokes `revocationHandler`, which *is* that call site.
- **`markRevoked`: 8 call sites** — `manager.ts:349` plus 7 in tests (`eviction_reconnect.test.ts`
  ×5, `eviction_durable.test.ts` ×2). **All go through the port, not the keyspace, so a storage
  change is transparent to every one of them.**
- **Redis keys**: 2 today (`revokedIndexKey`, `revokedKey(target)`) → 1 target, 3 transiently during
  rollout. The driver owns 6 key families in total.
- **Test files importing `fake_redis.ts`**: 10; exercising revocation: 2; pinning a key literal: 1.

### Documentation (this feature)

```text
.specnaut/specs/242-atomic-revocation-index/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A fix that guards only the filed interleaving and leaves race 2 open | FR-001 quantifies over every interleaving; FR-007 requires both driven. **Atomicity alone does not close race 2** — an atomic check-and-remove still observes a marker genuinely absent at that instant. FR-013 is what closes it. |
| **The test double silently absorbs the fix.** `FakeRedis.#exec`'s `default: return { type: 'nil' }` makes an unmodelled command a silent no-op | FR-008, as a throwing default landed **first**, in its own commit. Two sibling doubles already do this right (`redis/tests/fake_server.ts:153`, `session/tests/fake_redis.ts`) — realtime's is the odd one out. Worst case named by the audit: `MULTI`/`EXEC` would hit `default`, the queued writes execute immediately and non-atomically, and every test stays green. |
| A modelled command whose **options** are ignored | `SET` parses only `EX`; `NX`/`GT`/`KEEPTTL` are silently dropped. FR-008 covers option tokens. |
| A reap that does nothing still passes | An assertion reading `listRevoked()`'s return value cannot see it — the in-code filter hides it. Assert **stored cardinality** via a fake inspector (FR-003/SC-002). |
| Keyspace change breaks a mixed-version fleet | FR-009 + a **new key name**. Traced: reusing `{prefix}:revoked` as a ZSET makes an old instance's `SADD` raise `RespServerError` at `manager.ts:349` — `evict()`'s first await, **untried** — so `evict()` throws to its caller and `revokeLocal` never runs. The reconcile side catches and WARNs; evicting fails louder and worse. |
| Clock skew, if expiry becomes a stored score | FR-012. `ZADD … GT` protects the *write* but **not** the reap: a fast-clocked instance's range-delete removes entries live for the whole fleet, globally and permanently. Untestable in the current fake — one shared `Date.now()` across all driver instances. |
| The dual-read path becomes permanent | File its removal as an issue **in the same commit** that lands it, against a named version. |
| Choosing Lua costs a live-Redis harness | **Corrected**: `driver_redis_live.test.ts` is not that harness — it talks to `redis/tests/fake_server.ts`, which implements AUTH/SELECT/QUIT/PSUBSCRIBE/PING/SET/SETEX/DEL/GET and answers `-ERR unknown command` to everything else. No `EVAL`, no `SADD`. Confirms [#273](https://github.com/locknessland/lockness-monorepo/issues/273). |
| A fourth hand-rolled Lua evaluator | Only if Q1 chooses Lua. Three exist (`session/tests/fake_redis.ts:228`, `queue/tests/redis_driver.test.ts:59`, `core/tests/scheduler_locks.test.ts:34`), and one of them **sniffs the script text** (`script.includes('ZRANGEBYSCORE')`) rather than evaluating it. A shared evaluator belongs in `packages/redis/tests/`, never on the published surface. |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| **A1 (CRITICAL)** | **Q1 was posed on a false premise, and I am the one who introduced it.** The plan claimed Lua "would be the FIRST Lua in this codebase (verified: zero `EVAL`/`MULTI`/`WATCH` anywhere)". There are **three production `EVAL` sites** — `core/scheduler/locks.ts:90`, `queue/drivers/redis.ts:126,242`, `session/drivers/redis.ts:208` — and three fakes that model `EVAL`. My verifying grep used non-recursive shell globs and never scanned the `drivers/` subdirectories. FR-006 ("no capability the project does not already use") was therefore satisfied by **both** options and discriminated between neither, and §9's "cannot be honestly tested against the fake" was refuted by `session/tests/fake_redis.ts`, whose `runEvalScript` is a real evaluator built *because a HIGH review finding rejected a hardcoded version*. | **Plan changed** — I re-ran the grep recursively and confirmed all of it. FR-006 replaced with a version-floor requirement. §9's Lua row corrected. Q1 re-framed to the real trade-off: **remove the duplication or guard it.** `core/scheduler/locks.ts`'s `RELEASE_SCRIPT` is noted as the in-repo compare-and-delete precedent. |
| **A2 (HIGH)** | §5 (declared binding) and §6 already **decided** Q1 — row 1's home was "a single structure whose stored value carries the expiry", and §6 asserted "liveness is decided by one stored fact". The Lua option keeps two structures, so choosing it would violate a binding table. A table that pre-decides the open question makes the stop theatre. | **Plan changed** — §5 row 1 widened to admit **both** admissible shapes (single structure, or per-target TTL with a derived enumeration), naming only what is *inadmissible*: two independently-written structures. The preference moved into Q1 as a recommendation. §7's DRY row no longer claims removal. |
| **A3 (HIGH)** | FR-009 (upgrade) had **no §5 row**, and its worst outcome was unanalysed: reusing `{prefix}:revoked` as a ZSET makes an old instance's `SADD` raise `RespServerError` at `manager.ts:349` — `evict()`'s first await, with no `try` — so `evict()` throws to its caller and `revokeLocal` never runs, while the reconcile side merely WARNs. | **Plan changed** — new §5 row (new key name + one release of dual-read/write-new-only, removal filed in the same commit); FR-009 now forbids any key changing Redis **type** under its existing name; US4 states the residual mixed-version exposure; §9 carries the traced `WRONGTYPE` path. |
| **A4 (HIGH)** | "A re-eviction extends the window, never shortens it" was named once in an edge-case bullet, with no FR and no home. It is free today (`SET … EX`) and **not** free under a scored set, where a bare `ZADD` overwrites unconditionally — so a lagging clock could *shorten* a live revocation. | **Plan changed** — promoted to **FR-011** with its own §5 row; mechanism named (`ZADD … GT`, Redis 6.2+), and the duplicating shapes (a read-then-max in the driver, an "already revoked?" check in the manager) called out. |
| **A5 (HIGH)** | §8's "counted" blast radius was **wrong in both directions** — `listRevoked` is 1 call site (not 2: `#runRevocationReconcile` invokes the handler, which *is* that site), `markRevoked` is 8 (not 1). And §8 had **no Tests row**, missing that `eviction_reconnect.test.ts:205` pins the literal `'app:rt:revoked'` as a fault-injection predicate — a key rename makes it stop matching, and the test then **passes while asserting nothing**. | **Plan changed** — both counts corrected with their evidence, a Tests row added naming that file and line as a required edit, and FR-007 now carries the existing command-boundary fault-injection convention (`eviction_reconnect.test.ts:199-201`). |
| **A6 (MEDIUM)** | "Whose clock decides expiry" had no row. §5's TTL row said "unchanged option, possibly a new mechanism" — but the mechanism change *is* the decision, relocating expiry evaluation from the Redis server to N instances. | **Plan changed** — new §5 row and **FR-012**. Converges with the security audit's S-1. |
| **A7 (MEDIUM)** | Q1 was a false binary and recorded **no rejected alternatives**, though the stop is supposed to present them. | **Plan changed** — Q1 now carries **four** options, each with its disqualifier. |
| **A8 (MEDIUM)** | `FakeRedis`'s `default: return { type: 'nil' }` is a `silent-catch` instance — a default indistinguishable from success — and FR-008 fixed it only for this fix's commands, leaving the trap armed. Two sibling doubles already return `-ERR unknown command`. | **Plan changed** — FR-008 widened from "model every command used" to "**an unmodelled command fails loudly**", landed in its own commit first. Verified free: the driver issues exactly 10 commands and the fake models all 10. |
| **A9 (MEDIUM)** | The reap would ship with **zero observability**, and §12 foreclosed adding any — so "did we drop a live revocation again?" would have no answer from production. | **Partly accepted, and REOPENED in substance.** FR-015 was written to require it, an implementation was attempted, and it was withdrawn: the anomaly clause was unconstructable and the count needs a Lua table return the shared evaluator does not model. The reap therefore ships with **no** observability, which is a scope reduction, disclosed rather than concealed — filed as [#279](https://github.com/locknessland/lockness-monorepo/issues/279). See FR-015. |
| **A10 (MEDIUM, conditional)** | If Lua is chosen, a **fourth** script arrives with a **third** hand-rolled evaluator — and one existing evaluator sniffs script text (`script.includes('ZRANGEBYSCORE')`) rather than evaluating it. | **Recorded in §9 and Q1's option B cost.** If Lua wins, a shared evaluator goes in `packages/redis/tests/` beside the RESP fake — not on the published surface, and the three existing scripts are not touched. |
| **A11 (LOW)** | No Redis version floor is declared anywhere in the repo, and the recommended mechanism needs 6.2+. | **Plan changed** — FR-006 rewritten as the version-floor requirement; §6 carries the placeholder pending Q1. |
| **A12 (LOW)** | §9's "test against real Redis" understated its cost — `driver_redis_live.test.ts` talks to an in-process RESP fake with no `EVAL`, `SADD` or `SMEMBERS`. | **Plan changed** — §9's row now names the harness and what it does not cover. Confirms #273. |
| **A13 (LOW, forecast)** | `MemoryBroadcastDriver` implements no revocation, so §6's "enumerable by every instance" is vacuous for single-process deployments. The audit checked this against `speculative-generality` and **dropped the smell** (two real adapters exist); it stands only as a forecast. | **Plan changed** — one sentence in §8's `MemoryBroadcastDriver` row saying the durable guarantee is Redis-only by design. |

**Verdict**: `fail` — 1 CRITICAL, 4 HIGH, 5 MEDIUM, 3 LOW. **Coverage**: §5 completeness against §3, each home against the shipped code, grep-verified blast radius (both figures corrected), a three-cycle forecast, and a reasoned recommendation on Q1 with its migration shape. It **cleared**: §5 row 1's diagnosis as architecturally correct (the aggregate boundary is the transaction boundary), the dependency direction (`manager.ts` names no Redis symbol), and the decision to keep any script in the consumer rather than `@lockness/redis`. It explicitly **dropped two of its own candidate findings** after checking them against their leaves — a god-file call on `drivers/redis.ts` (910 LOC, 1.8× the next largest, under the 3× distribution test) and an inappropriate-intimacy call on the test key literal (same module). The `fail` is against the **plan text**; every finding was resolved by amending it.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel with the architecture
audit. Kept separate on purpose.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| **S-1 (HIGH)** | **A stored expiry moves the liveness decision off Redis's clock and breaks #271's monotonicity invariant.** A `ZREMRANGEBYSCORE … -inf <local now>` reap does not merely misjudge locally — it **deletes, globally and permanently**, on the strength of one instance's clock. Today zero clock dependency exists anywhere in the revocation path. Combined with #274/#275 (a subscribe re-dial every ~30s per instance) and #271's reconnect trigger, the fastest-clocked instance drives that delete ~2 880×/day. And it is **untestable**: `FakeRedis` has one `Date.now()` shared by every driver instance, so §9's skew row had no verification path. | **Plan changed** — **FR-012** binds the expiry bound to Redis-side evaluation, moved out of §9's risk table (advice) into a requirement (checkable), and §6's monotonicity invariant now states it is **conditional on FR-012** rather than inherited. Q1's options are ranked against it. |
| **S-2 (MEDIUM)** | Q1's option set omitted the only candidate that is both single-structure **and** clock-free: keep `{prefix}:revoked:<target>` with `SET … EX` and **derive** the enumeration with `SCAN MATCH` — the literal reading of #276's own acceptance wording. Removal then ceases to exist as an operation, so FR-001/FR-004 hold by construction. | **Plan changed** — added as Q1 **option C**, with its honest costs: a keyspace-proportional scan every reconcile, and a constraint that the target charset exclude the key delimiter. |
| **S-3 (MEDIUM)** | **My "decided without asking" bullet was wrong.** Reversing `SADD`/`SET` does not close race 2 — it trades a race for a **partial-failure hole with the same consequence**, and one that fails *open* where the current order fails *closed* (today an orphaned index entry is reaped and `evict` rejects, so the caller sees it). Separately: **atomicity alone does not close race 2** either, since an atomic check-and-remove still observes a marker genuinely absent at that instant. | **Plan changed** — the bullet is retracted and replaced by **FR-013** (recording a revocation is one operation) with its own §5 row. §9's first risk row now states the atomicity limitation. |
| **S-4 (MEDIUM)** | FR-008 missed the two silent-green paths that matter: (a) `MULTI`/`EXEC` hits the fake's `default` and, because the fake holds no queue state, **the wrapped writes execute immediately and non-atomically** — green suite, zero atomicity, and this is the *default* outcome for the layout-preserving option; (b) `SET` is modelled but parses only `EX`, so option tokens are silently ignored; (c) a dead reap is invisible to any assertion reading `listRevoked()`'s return value. | **Plan changed** — FR-008 now requires a **throwing default** (landed first, in its own commit), option-token modelling, and §9 requires reap assertions to observe **stored cardinality**. Converges with A8. |
| **S-5 (LOW)** | The fail-open tie-break is the plan's central safety property and was in no requirement. FR-001 quantifies over every interleaving, which is an ambition, not a decision procedure. | **Plan changed** — **FR-014**, with the audit's reasoning: retention is provably harmless because ids are per-socket UUIDs never reused, so a retained entry cannot revoke the wrong person. The asymmetry is total; there is no trade, only a bound to keep. |
| **S-6 (LOW)** | FR-006 was unfalsifiable — it forbade "a capability the project does not already use" with no Redis version floor declared anywhere. `ZADD … GT`, `SET … EXAT` are 6.2+. | **Plan changed** — same rewrite as A11. |

**Verdict**: `needs_followup` → resolved in text — 0 CRITICAL, 1 HIGH, 3 MEDIUM, 2 LOW, **no merge
blocker** (no code exists). **Coverage**: the four standard questions plus four specific judgements
this plan asked for. It **affirmed**, with traced evidence: `markRevoked` has exactly one caller and
is **server-only** — `decodeClientMessage`'s allowlist excludes `evict`, and `handleControl`'s
`evict` case calls `revokeLocal` only and **never** `markRevoked`, so a bus peer holding the control
secret cannot write into the index at all; §5 row 1's single-authority framing is correct; the index
holds ephemeral `crypto.randomUUID()` ids with **no** connection-id → user mapping anywhere in Redis
(the roster is keyed by the *application's* member id), so a scored set's incremental leak is
eviction timestamps for anonymous socket ids, to a party who could already `DEL` the whole control —
recorded as INFO, deliberately not filed. **An authenticated stranger gains nothing**: six paths
enumerated and checked. It confirmed §1's race 2 against the real code and judged the severity
framing **right, not inflated**, while noting it is also a partial-failure window. Coverage limit
worth knowing: two knowledge leaves went unread on budget (injection, logging), on the grounds that
that surface is #268's and #277's and unchanged here.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1 — Which storage shape, and does the keyspace change?** Four options below. The two audits **agree on the diagnosis and diverge on the remedy**: the architect wants the duplication *removed* (a scored set), the security seat wants the clock dependency *never introduced* (FR-012). | **Option D — a single expiry-scored set whose bound comes from Redis's own clock**, inside a small script. It is the only option neither audit objects to: one structure (A2/§5 row 1 satisfied, the duplication *removed*), and `now` read from `redis.call('TIME')` rather than any instance's wall clock (FR-012 satisfied, S-1 discharged). Lua is not novel — this is the 4th script, with `core/scheduler/locks.ts`'s `RELEASE_SCRIPT` as the in-repo compare-and-delete precedent and `session/tests/fake_redis.ts`'s `runEvalScript` as the honest-evaluator precedent. Accepted cost: the most moving parts of the four — a keyspace migration **and** an evaluator arm in the realtime fake. | 2026-09-05 |

### The four options

| | Shape | Removes duplication? | Clock-free? | Keyspace change? | Disqualifier |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A** | Single expiry-scored set (`ZADD … GT` / `ZRANGEBYSCORE` / `ZREMRANGEBYSCORE`), new key name | **yes** | **no** — the reap's bound is a local clock | yes | S-1: a fast-clocked instance range-deletes live revocations fleet-wide |
| **B** | Keep the layout; Lua compare-and-`SREM`, plus `MULTI`/one script for `markRevoked` | no — guards it | yes (server-side TTL) | **no** | Two structures survive; needs the fake's evaluator; §5 row 1 and §6 must be rewritten |
| **C** | Per-target `SET … EX` only; **derive** the enumeration with `SCAN MATCH` | **yes** (the second structure is deleted) | **yes** | yes (a key is removed) | Keyspace-proportional scan every reconcile, ~every 30s per instance (#274) — a real hazard on shared Redis |
| **D** ✅ | **A + a `TIME`-derived bound** — the scored set, but `now` comes from Redis inside a small script | **yes** | **yes** | yes | Combines A's migration with B's evaluator cost; the most moving parts — **accepted** |

### The chosen shape (Q1 = D), concretely

Key: **`{prefix}:revocations`** — a *new name*, never a type change on `{prefix}:revoked` (FR-009).

```lua
-- markRevoked(target): one operation (FR-013), extend-only (FR-011)
local t = redis.call('TIME')[1]
redis.call('ZADD', KEYS[1], 'GT', t + ARGV[1], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[1] + <slack>, 'NX')  -- arm
redis.call('EXPIRE', KEYS[1], ARGV[1] + <slack>, 'GT')  -- extend only
```

```lua
-- listRevoked(): reap then enumerate, both bounded by the SAME Redis-read now
local t = redis.call('TIME')[1]
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', t)
return redis.call('ZRANGEBYSCORE', KEYS[1], t, '+inf')
```

Why this closes both races **by construction** rather than by a guard:

- One structure, so there is nothing for a second write to disagree with — race 2 has no window
  because there is no second write.
- The reap's bound is `t`, and every surviving member's score is `> t` at that instant, so a live
  entry is unremovable — race 1 has no window either.
- `t` comes from Redis, so no instance's clock participates (FR-012, S-1).
- `GT` means a re-eviction can only push the score later (FR-011).
- The `EXPIRE` refresh keeps the key bounded even in a deployment that never enumerates — today's
  index SET has **no** TTL at all, so this is a net gain. **It takes two `EXPIRE` calls** (Redis 7.0+):
  `ZADD … GT` protects one member's score, but an unconditional `EXPIRE` lets a shorter-TTL instance
  reset the whole key's lifetime and take every live member down with it — undoing at key
  granularity exactly what the `ZADD` protects at member granularity. Found at review as HIGH-1; the
  script written here originally carried the same hole, so this is a correction to the **design**,
  not a deviation from it.
  The first repair — `EXPIRE … GT` alone — was **inert**, and review cycle 2 caught it: Redis treats a
  key with no TTL as having an *infinite* one, so `GT` always refuses to arm it and the key simply
  never expired. `NX` arms, `GT` extends; the two flags cannot be combined in one call.

**Rollout** (FR-009): one release of write-new-only + dual-read — `listRevoked` returns the ZSET
union the legacy `SMEMBERS` filtered by `EXISTS`, and reaps **only** the new structure; legacy
markers expire on their own `EX` and the legacy SET is one abandoned key. The dual-read's removal is
filed as its own issue **in the same commit that lands it**, against a named version.

### Decided without asking

- **~~`markRevoked`'s `SADD`-before-`SET` ordering is a defect; reverse it.~~ RETRACTED** per S-3.
  Reversing the order trades the race for a partial-failure hole with the same consequence, and one
  that fails *open* where today's order fails *closed*. Superseded by **FR-013**: if more than one
  structure is written, both writes are **one operation**.
- **`reconcileRevocations` in `manager.ts` is not touched.** It consumes ids; where they come from is
  the driver's business.
- **Removal stays inside `listRevoked` rather than becoming its own timer.** A third cadence to
  reason about, for a reap already free wherever enumeration happens (YAGNI).
- **`revocationTtlSeconds` keeps its name and meaning** whatever the shape.
- **No script belongs in `@lockness/redis`.** Every existing script in this repo is a private static
  in its consumer; moving one into the transport package would put a realtime rule inside it.
- **The fake's throwing-default lands first, in its own commit**, so the existing suite proves
  nothing relied on the silence.
