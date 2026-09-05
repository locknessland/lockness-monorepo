# Plan: Reconnect-triggered immediate revocation re-check

**Branch**: `241-reconnect-revocation-recheck` | **Date**: 2026-09-05 | **Backlog item**: [#271 — Realtime: reconnect-triggered immediate revocation re-check](https://github.com/locknessland/lockness-monorepo/issues/271)

**This is the feature's one planning document.** Business and technical together, read whole by
whoever implements it.

---

## 1. Why this exists

An **evicted user keeps receiving events** for up to one reconcile interval — by default ~10s, and
as long as the operator's `reconcileIntervalMs` allows.

Realtime authorization is cached at subscribe time: `ChannelManager.deliverLocal` fans a message to
`subscriptions.get(channel)`, a set built when the authorizer approved the connection. Nothing
re-authorizes per message, so **eviction is the only revocation path** (#268, FR-011). Eviction
travels as a one-shot control frame over Redis pub/sub, which is at-most-once: if the owning
instance's subscribe socket is between reconnects when the frame is published, the frame is gone.

#268 closed the correctness hole with a durable Redis marker (`{prefix}:revoked:*`) plus a periodic
re-check on a dedicated timer (`packages/realtime/drivers/redis.ts`, `onRevocationReconcile`). That
recovers every missed evict — eventually. It does **not** recover it at the one moment we know a
frame was probably lost: the instant the subscribe socket comes back.

FR-014 of #268 specified both triggers — "re-checked by the owning instance **on subscribe-socket
reconnect** and on a periodic reconcile". Only the second shipped, because
`@lockness/redis`'s `RedisSubscribeConnection` has no reconnect seam to hang the first on. This
feature adds that seam and wires it.

**The measurement — and it is larger than #271 assumed.** The security audit established (S-F1,
verified against `packages/redis/resp.ts:58` and `ReplyReader`'s constructor-fixed deadline) that
`subscriber.ts:183` calls `readReply(conn)` with the **default 30s deadline**, which bounds even the
wait for the first byte. There is no subscribe-mode PING keepalive. **On any bus quieter than 30s,
every instance tears its subscribe socket down and re-dials roughly every 30 seconds** — ~2 880
times per day per instance. Each of those re-dials is a real, recurring window in which a published
`evict` control frame is lost.

So the exposure this feature removes is not the rare one the issue described. Today: after a lost
evict, worst-case exposure = `reconcileIntervalMs` (default 10 000 ms), and the exposure is
*unbounded relative to the reconnect* — the socket can be back for 9.9s and still deliver to a
revoked connection. After: exposure ends within one Redis round-trip of the socket being usable
again, on a churn cycle that happens every half-minute.

This remains a **latency tightening of an already-correct recovery**, not a correctness fix — the
periodic timer runs on the separate command socket and recovers every case regardless. The value is
that the window shrinks from "a tick" to "immediately", on an event far more frequent than anyone
believed, and that FR-014 stops being half-implemented.

## 2. User scenarios

### US1 — A missed evict is recovered the moment the socket returns (P1)

**Given** instance A owns the WebSocket for connection `c1`, and A's Redis subscribe socket has
faulted
**And** instance B evicts `c1` (durable marker written, control frame published while A is deaf)
**When** A's subscribe socket reconnects and re-issues its `PSUBSCRIBE`s
**Then** A runs the revocation re-check immediately, finds `c1` in the durable revoked set, and
hard-closes `c1`'s socket — **without** waiting for the next periodic tick.

### US2 — An operator keeps the periodic safety net (P1)

**Given** a deployment where a control frame was dropped by the ingest guard with no socket fault
**When** the periodic reconcile tick fires
**Then** the revocation is still recovered exactly as it is today — the new trigger is **added to**
the periodic pass, never a replacement for it.

### US3 — A subscriber that does not implement the seam keeps working untouched (P2)

**Given** an application or test that constructs `RedisBroadcastDriver` with its own object
satisfying the `RedisSubscriber` port
**When** that object does not implement the new reconnect seam
**Then** the driver constructs and runs exactly as before, with the periodic trigger only — no
throw, no type error. `packages/realtime/tests/driver_redis.test.ts`'s fake is deliberately left
**without** the seam and is this scenario's standing regression proof.

### Edge cases

- **Reconnect while a reconcile is already running.** Harmless, and for a reason worth recording:
  in `manager.ts:284-287` the `members.get` / `members.delete` pair is separated by no `await`, so
  the check-then-act is atomic on Deno's single-threaded loop — the second pass skips the roster
  removal and the `presence-leave` publish entirely, and `revokeLocal`'s second `close(4403)` is a
  WHATWG no-op on an already-closing socket.
- **The reconnect's own re-`PSUBSCRIBE` fails.** No handler fires — a failed reconnect is not a
  reconnect. The periodic timer remains the backstop.
- **The handler throws or rejects.** It must not kill the subscribe connection's read loop or its
  reconnect path. Contained and logged at WARN at the seam.
- **First connect.** The very first `psubscribe` is not a reconnect and must not fire the handler.
- **An idle-timeout re-dial** (the ~30s churn of S-F1) **is** a reconnect and **does** fire the
  seam: frames published during the re-dial were genuinely missed.
- **A flapping socket.** Each fire costs one `SMEMBERS` plus one `EXISTS` per indexed revocation.
  Rate is bounded by *successful* TCP + AUTH + `PSUBSCRIBE` round-trips.
- **Driver closed mid-reconnect.** A handler that fires after `close()` must be a no-op — including
  on the injected-port path, where `close()` does not own the subscriber (see FR-007).

## 3. Requirements

- **FR-001**: `RedisSubscribeConnection` exposes a reconnect seam — a registration method taking a
  handler invoked **after** a fault-triggered reconnect has re-issued its active `PSUBSCRIBE`s.
- **FR-002**: The seam fires **only** on a reconnect. It does not fire on the first connect, nor on
  a reconnect whose re-subscribe failed. The discriminator is **structural**, not a parameter: the
  two callers of the shared activation body become two named private entry points (A1).
- **FR-003**: A handler error (thrown or rejected) is contained at the seam and logged at WARN
  **via `safeForLog(this.hostname)` + `renderError(error)`**, matching the three existing WARNs in
  `packages/redis/subscriber.ts`. Containment **may not** disarm the seam: a caught error never
  unregisters the handler or stops future fires (S-F3). It never propagates into the read loop, the
  reconnect path, or `psubscribe`'s caller.
- **FR-004**: `@lockness/realtime`'s `RedisSubscriber` port gains the seam as an **optional** member,
  so **every existing implementation of that port keeps compiling and running unchanged**. The set is
  enumerated by `grep -rn "psubscribe" packages` — today: `packages/redis/subscriber.ts`,
  `packages/realtime/tests/fake_redis.ts`, `packages/realtime/tests/driver_redis.test.ts`.
- **FR-005**: `RedisBroadcastDriver` registers the revocation re-check on the subscriber's reconnect
  seam at the same moment it registers the periodic timer — one registration point, both triggers.
  It registers `() => this.#runRevocationReconcile()`, **not** the raw handler, so both triggers
  share the driver's existing contextual WARN (A4 / S-F3).
- **FR-006**: The reconnect trigger is **additive**. The periodic timer's cadence, its error
  handling and its unconditional start are unchanged; removing the reconnect seam must leave #268's
  behaviour exactly as shipped, and `packages/realtime/tests/eviction_durable.test.ts` stays green
  untouched.
- **FR-007**: A reconnect that fires after `RedisBroadcastDriver.close()` is a no-op — **on both
  construction paths**, including the injected-port path where `close()` does not own the
  subscriber. This is resource hygiene and test determinism, not a security boundary (S-Q2).
- **FR-008**: The seam is documented on the public API per constitution rule 7, and the behaviour
  change is reflected in `docs/realtime.md` and the two package `AGENTS.md` briefs.
- **FR-009**: `#activate`'s existing failure WARN states that **no further reconnect will be
  attempted**, so an operator can tell a transient warning from a terminal one — the pre-existing
  no-retry dead end (§9) becomes detectable without being fixed here (A5 / S-F2).

## 4. Success criteria

- **SC-001**: An eviction issued while the owning instance's subscribe socket is down takes effect
  as soon as that socket is usable again — the evicted connection receives no further channel
  events, without any periodic tick having elapsed.
- **SC-002**: The recovery still happens on the periodic pass when no reconnect occurs.
- **SC-003**: Delivery, roster and wire behaviour are unchanged: no client observes a different
  frame, a different close code, or a different event stream than it does today. *(Corrected per
  S-F1: the original wording — "an operator who never suffers a socket fault observes no change" —
  described a deployment that does not exist, since the subscribe socket faults on its own every
  ~30s on an idle bus.)*
- **SC-004**: An integrator whose subscriber does not implement the new seam observes no change and
  no error.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **What counts as a reconnect** (a fault-triggered re-open whose `PSUBSCRIBE`s were re-issued — not a first connect, not a failed re-open) | `packages/redis/subscriber.ts` — the seam fires from a **dedicated `#reconnectAll()` entry point**, inside its try block, after the re-issue loop succeeds; `psubscribe`'s first connect calls a sibling entry point that does not fire. Both delegate to the shared activation body. | a boolean `isReconnect` parameter threaded through the shared body (this relocates the decision to the two call sites); deriving it from `this.#handle !== undefined`, `loopConn === null`, or `toIssue.length === patterns.size`; `packages/realtime/drivers/redis.ts` inferring reconnect for itself via a message-gap heuristic, a `psubscribe` wrapper, or a socket-state poll |
| **When the *revocation* re-check runs** (periodic tick **and** subscribe-socket reconnect) | `packages/realtime/drivers/redis.ts` — `onRevocationReconcile`, which registers both triggers | `packages/realtime/manager.ts` registering its own reconnect listener; a second `setInterval`; the reconnect trigger registered at a different call site from the timer. **Scoped to revocation**: a future non-revocation consumer of the reconnect signal (metrics, the ghost sweep) does not belong in this method — it amends this table with its own row (A6 forecast). |
| **Whether a subscriber supports the seam** (feature detection on the optional port member) | `packages/realtime/drivers/redis.ts` — one optional call, `this.subscriber.onReconnect?.(…)`, inside `onRevocationReconcile`, matching the manager's existing `driver.onControl?.()` idiom | a `typeof x === 'function'` guard anywhere; any feature-detect in `packages/realtime/manager.ts`, which must not know a subscriber exists (layer breach — `manager.ts` names `@lockness/redis` nowhere today) |
| **What makes a fired reconnect trigger a no-op after shutdown** | `packages/realtime/drivers/redis.ts` — `close()` sets `this.revocationHandler = undefined`, making `#runRevocationReconcile`'s existing `if (!this.revocationHandler) return` guard the single gate for **both** triggers on **both** construction paths | a `closed` boolean added to the driver; relying on `packages/redis/subscriber.ts`'s own `closed` flag, which covers only the `fromConfig` path and misses the injected-port path entirely |
| **What a revocation re-check does** (read the durable revoked set, revoke every id this instance owns) | `packages/realtime/manager.ts` — `reconcileRevocations` (unchanged, from #268) | a reconnect-specific re-check that re-derives revocation state instead of calling the same handler |
| **Whether a revoked connection stays revoked** (the durable marker + its TTL) | `packages/realtime/drivers/redis.ts` — `{prefix}:revoked:*` and `{prefix}:revoked` (unchanged, from #268) | any new per-reconnect revocation cache, or a second marker keyed on the reconnect event |
| **That a handler fault never reaches the socket** (containment at the seam) | `packages/redis/subscriber.ts` — the try/catch around the fire, so the **read loop** survives | a *third* catch added around the reconnect callback specifically. `#runRevocationReconcile`'s existing catch (`drivers/redis.ts:650-661`) is **not** a duplicate and **stays** — it is the only containment for the *timer* trigger and the only WARN naming which control failed. The two are nested with different owners: the seam keeps the socket alive, the driver keeps the timer alive and names the subject. |

**Binding on the implementer.** A decision may not move out of its home without this table being
amended first. Two homes for one row is a plan violation, not a style opinion.

## 6. Technical context

**Language/Version**: TypeScript on Deno (workspace `deno.json`)
**Primary Dependencies**: `@lockness/redis` (raw-RESP client + subscribe connection),
`@lockness/realtime`, `@lockness/contract` (`safeForLog`, `renderError`)
**Storage**: Redis — existing keys only (`{prefix}:revoked`, `{prefix}:revoked:<target>`)
**Testing**: `Deno.test`; `packages/redis/tests/fake_server.ts` for a real-socket subscribe test,
`packages/realtime/tests/fake_redis.ts` + `@std/testing/time` `FakeTime` for the driver/manager path
**Target Platform**: Deno server, multi-instance
**Project Type**: library (two workspace packages)
**Performance Goals**: revocation takes effect within one Redis round-trip of the subscribe socket
being usable, instead of within `reconcileIntervalMs`
**Constraints**: no new dependency edge (`@lockness/realtime → @lockness/redis` already exists);
**purely additive** on a published JSR surface; no `deno.lock` hand-edit; the reconnect handler's
type stays unexported (like `MessageHandler` at `subscriber.ts:51`) so the generated `AGENTS.md`
surface blocks are untouched
**Scale/Scope**: 2 source files changed, 1 port interface extended, 2 new tests, 1 shared test fake
extended

### Domain model

**No new entities.** The feature adds a *trigger*, not state.

- **Bounded context**: `realtime` (broadcast/eviction), with a seam added in `redis` (transport).
- **Vocabulary**: **reconnect** — a subscribe socket re-opened after a wire fault, with its active
  patterns re-issued. **Revocation re-check** — reading the durable revoked set and closing every
  named connection this instance owns. **Trigger** — an event that causes a re-check; there are now
  two, and they invoke one handler.
- **Invariants**:
  - A revocation re-check has exactly one implementation, invoked by every trigger.
  - The durable marker is the sole authority on whether a connection is revoked; a trigger never
    decides revocation, only *when to ask*.
  - **The revocation re-check is MONOTONE** — a trigger may only cause a revocation to be *applied*,
    never rescinded. No trigger-driven path may `DEL` or `SREM` a live marker; index reaping remains
    driven solely by the per-target key's TTL expiry (`drivers/redis.ts:610`). This is the property
    that makes a peer-influenceable trigger safe to fire more often (S-F5).
  - The seam carries **no data** — the handler signature is nullary. No topic, no payload, no
    peer-supplied byte crosses it.
  - A reconnect seam fires only after the subscription state is whole again.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1. No direct `hono` import | pass | No HTTP surface touched. |
| 2. JSR-only, declared per package | pass | No new dependency; the `realtime → redis` edge is already declared in `packages/realtime/deno.json`. |
| 3. No `any` in exported APIs | pass | The seam's handler is `() => void \| Promise<void>` — the shape `onRevocationReconcile` already uses. |
| 4. Tailwind v4 syntax | pass | No front-end surface. |
| 5. Pre-completion gate | pass | `deno fmt && deno lint && deno check && deno task test` before done. |
| 6. Never hand-edit `deno.lock` | pass | No dependency change. |
| 7. JSDoc on public APIs | pass | FR-008. |
| 8. MVC layering | pass | Transport primitive → driver → manager; `manager.ts` still names `@lockness/redis` nowhere, and the feature-detect stays in the adapter (§5 row 3). |
| 9. Commit discipline | pass | Split: `feat(redis)` seam, `feat(realtime)` wiring, `test`, `docs`, `chore` for regenerated briefs. |
| TDD | pass | Failing test first for both SC-001 and the redis-level seam. |
| DDD layering | pass | The decision (revocation) stays in its context; `redis` contributes only a transport event, via a nullary callback that leaks no vocabulary. |
| Domain Model gate | pass | Section 6. |
| SOLID / DRY / KISS / YAGNI | pass | One handler, two triggers. The `#activate` split (A1) is `replace-parameter-with-explicit-methods` over a fixed two-element caller set. |
| No silent catches | pass | FR-003 requires WARN with the file's existing encoder, and forbids containment that disarms the retry. |

### Complexity tracking

No violations.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/redis` public API (`mod.ts`) | yes | `RedisSubscribeConnection` gains one method (additive). No signature changes. Handler type stays unexported. |
| `@lockness/realtime` public API (`mod.ts`) | yes | The exported `RedisSubscriber` interface gains one **optional** member. Additive. |
| `BroadcastDriver` port (`packages/realtime/driver.ts`) | no | `onRevocationReconcile` keeps its exact signature; only its internals gain a second trigger. |
| `ChannelManager` (`packages/realtime/manager.ts`) | no | `reconcileRevocations` is reused verbatim; the file still names `@lockness/redis` nowhere. |
| `MemoryBroadcastDriver` | no | No subscribe socket, no reconnect. |
| `@lockness/session`, `@lockness/queue`, `@lockness/scheduler` | no | They use `RedisClient`, not the subscribe connection. |
| HTTP routes / controllers / CLI | no | None. |
| Front-end / UX-UI | no | No `.tsx`/`.html`/framework surface in either package — back-end only. |
| Wire protocol (`@lockness/realtime/client`) | no | No frame shape changes; an evicted socket closes with the existing `4403` / `'evicted'`. |
| Configuration | no | No new option (see §12 — deliberate). |
| Docs | yes | `docs/realtime.md`, `packages/redis/AGENTS.md`, `packages/realtime/AGENTS.md`. |

**Blast radius, counted** (all three original counts re-verified by the architecture audit; the
test-side count was missing and is added):

- **1 in-repo consumer** of `RedisSubscribeConnection` (`packages/realtime/drivers/redis.ts:333`).
  The class is exported at `packages/redis/mod.ts:36` on a **published JSR package at `0.2.0`**, so
  the true consumer count is unbounded — safe **only** because the change is purely additive.
- **2 production `psubscribe` call sites** (`drivers/redis.ts:404`, `:440`).
- **3 implementations of the `RedisSubscriber` port** — `packages/redis/subscriber.ts`,
  `packages/realtime/tests/fake_redis.ts:58`, `packages/realtime/tests/driver_redis.test.ts:42`.
- **Those 3 feed 18 driver constructions across 9 test files** (15 `new RedisBroadcastDriver(...)`,
  3 `fromConfig`). Seven files share `FakeRedis.subscriberFor()`, so giving that shared fake a
  *fireable* seam is one edit observed by seven files — including
  `eviction_durable.test.ts`, which FR-006 requires stay green untouched.
  `driver_redis.test.ts`'s independent fake is deliberately **not** given the seam: it becomes the
  FR-004 / US3 regression proof.

### Documentation (this feature)

```text
.specnaut/specs/241-reconnect-revocation-recheck/
├── plan.md    # This file — the whole plan
└── tasks.md   # derived from THIS file once approved
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| The seam fires on first connect too, making "reconnect" mean "connect" | FR-002 + §5 row 1. **Corrected per A1**: the shipped `#activate` is one shared body with two callers and **no** distinguishable reconnect path — the earlier claim that it "is distinguishable" was false. The discriminator is created by splitting the two callers into named entry points; a test asserts zero fires on the first `psubscribe`. |
| A throwing handler kills the read loop, turning a latency fix into a delivery outage | FR-003 — contained + WARN at the seam's own home, with a test injecting a throwing handler. |
| Containment is "improved" into disarming the seam after a failure | FR-003 forbids it explicitly. The periodic timer is what makes containment fail *closed*; a containment that stops future fires converts that into permanent silent degradation (S-F3). |
| The reconnect trigger is treated as a replacement for the periodic pass and the timer is "simplified" away | FR-006; `eviction_durable.test.ts` stays green untouched. |
| A flapping socket drives a reconcile storm | **Rate corrected per S-F1**: on an idle bus the real cadence is ~1 fire per 30s per instance, not "rare". Against a 10s periodic timer that is ~+33% reconcile load, each fire being `SMEMBERS` + one `EXISTS` per live revocation. Bounded, not a storm — but the plan no longer claims the event is unusual. |
| **Pre-existing, named so it is not mistaken for new:** `#activate`'s catch logs and returns with no retry scheduled (`subscriber.ts:163-169`), so a reconnect that fails to dial is never retried — delivery *and* this feature's trigger stay dead for the life of the process, silently | Not introduced here and not fixed here. **S-F2 sharpens it**: combined with the ~30s churn, that dead end is reached on the first transient DNS or connect blip, with ~2 880 chances per instance per day. Revocation still functions — the periodic timer drives the *command* socket. FR-009 makes the dead state observable in one line without expanding scope. Filed as [#275](https://github.com/locknessland/lockness-monorepo/issues/275). |
| **New, from S-F1:** the subscribe socket has no keepalive and a 30s read deadline, so it churns continuously on an idle bus — a recurring lost-frame window and an undocumented second cadence | **Settled at the stop (§12 Q1): filed separately as [#274](https://github.com/locknessland/lockness-monorepo/issues/274), not fixed here** — this branch stays additive. This plan's claims are corrected (§1, SC-003, the flapping row above), and until that issue ships this feature is the mitigation. |
| The whole test suite is blind to the churn (fake-server tests finish well under 30s) | Confirms open issue **#273** (live-Redis integration coverage) and strengthens its case. Noted, not fixed here. |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 (HIGH) | §5 row 1 named a home that does not exist: `#activate` is **one shared body with two callers and no branch on caller**, so "the reconnect path in `#activate`" is not a location, and §9's mitigation asserting it "is distinguishable" was false about shipped code. `loopConn` is null in both cases and `toIssue.length === patterns.size` is true on a single-pattern first connect, so it is not derivable either. The fire also cannot be hoisted to `#readLoop`, because `#activate` is invoked as `void` and swallows re-subscribe failure — FR-002's "not on a failed re-subscribe" is unimplementable outside its try block. | **Plan changed** — §5 row 1 rewritten to name the **discriminator**, not a location: split the two callers into named private entry points (`replace-parameter-with-explicit-methods` over a fixed two-element set), the reconnect one firing inside its try after the re-issue loop. FR-002 records the split. Row 1's duplication column now forbids a threaded `isReconnect` boolean and all three derivation tricks by name. §9's risk-1 mitigation corrected. |
| A2 (HIGH) | FR-007 was a rule with **no §5 row**, and its two candidate homes are not equivalent. `close()` clears `revocationTimer` but never `revocationHandler`, and on the **injected-port path** `owned` is empty (populated only at `:337`), so `close()` does not close the subscriber either — a driver built through the documented public constructor keeps a live seam after shutdown, running `listRevoked()` against a command client the app may have closed. The subscriber's own `closed` flag covers only `fromConfig` and misses this path entirely. | **Plan changed** — new §5 row: home is `packages/realtime/drivers/redis.ts`, `close()` sets `revocationHandler = undefined`, making the existing `if (!this.revocationHandler) return` guard the single gate for both triggers on both paths. FR-007 restated to say "both construction paths". |
| A3 (MEDIUM) | FR-004 was a rule with **no §5 row**: it made the member optional but never said who feature-detects it. Two wrong homes were reachable — a `typeof` guard diverging from the settled `?.()` idiom, or the manager feature-detecting the subscriber, a genuine layer breach since `manager.ts` names `@lockness/redis` nowhere. | **Plan changed** — new §5 row placing the feature-detect at `this.subscriber.onReconnect?.()` inside `onRevocationReconcile`, with the manager named in the duplication column. |
| A4 (MEDIUM) | §5 row 5's duplication column, read literally, **forbade code that already ships and must stay**: `#runRevocationReconcile`'s try/catch (`drivers/redis.ts:650-661`) is exactly "a second try/catch in the driver around its own callback body", and it is the only containment for the *timer* trigger. Since §5 is binding, a literal reading licensed removing it and regressing #268. The two catches answer to different owners and change for different reasons — coincidental similarity, not duplication. *(Found independently by the security audit as S-F3, with the added detail that dropping it also loses the only WARN naming which control failed.)* | **Plan changed** — the row now carves out the driver's existing catch explicitly and distinguishes **containment** (`subscriber.ts`, keeps the socket alive) from **observability** (`drivers/redis.ts`, names the subject). FR-005 made explicit that the seam registers `() => this.#runRevocationReconcile()`, not the raw handler. |
| A5 (MEDIUM) | §8's three counts were **all correct** on re-grep, but omitted the test-side count where the work actually is: 18 driver constructions across 9 test files, 7 sharing `FakeRedis.subscriberFor()`, plus a second independent fake in `driver_redis.test.ts`. "~2 new tests" understated it. Also, "1 production consumer" is 1 *in-repo* — the class is public JSR API, so the real count is unbounded and safe only because the change is additive. | **Plan changed** — §8's blast radius restated with the test-side numbers and the JSR caveat; `driver_redis.test.ts`'s fake explicitly left **without** the seam as the US3 regression proof (the audit's own recommendation). §6 scope updated. |
| A6 (LOW) | Both §12 open questions were answerable from shipped code. **Q2** (`AuthenticatedConnection` vs subscribe-only): only `RedisSubscribeConnection` holds `this.patterns`; `AuthenticatedConnection` is shared with `RedisClient`, where "reconnect" carries no subscription-restoration meaning — one name, two meanings, in the security-critical shared primitive. **Q1** (roster sweep on reconnect): **no** — the authoritative roster is Redis and `listMembers` reads it live, while `manager.ts:106-118` states the local `presence` map is explicitly not the roster, so a reconnect leaves nothing stale; the only loss is missed presence join/leave frames, which open issue **#272** independently characterises as cosmetic. Coupling two unrelated cadences buys no correctness. | **Plan changed** — both moved to §12 "Decided without asking" with those reasons. Also folded the audit's forecast: §5 row 2 is now scoped to *revocation* triggers, so a future metrics or sweep consumer must add its own row rather than squat inside `onRevocationReconcile` and turn it into a trigger registry (the predicted `divergent-change` finding). |

**Verdict**: `fail` — 0 CRITICAL, 2 HIGH, 3 MEDIUM, 1 LOW. **Coverage**: the decision table's
completeness against §3, each home against the shipped code in `packages/redis/subscriber.ts`,
`connection.ts`, `packages/realtime/drivers/redis.ts`, `manager.ts`, `driver.ts`; the dependency
direction and layer boundaries; grep-verified blast radius (3/3 confirmed, 1 omission); and a
three-cycle forecast. It explicitly cleared: the port/adapter direction (`manager.ts` names
`@lockness/redis` nowhere), registration ordering (handler registered before any socket can fault),
idempotent re-registration, and `drivers/redis.ts`'s 881 LOC (not a god file — 1.7× the next
largest, well under the 3× distribution test). The `fail` verdict is against the **plan text**, and
every finding was resolved by amending it; the audit's own recommendation was to amend and
**proceed to `tasks` without a second stop**.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel with the architecture
audit. Kept separate on purpose — the two answer different questions.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S-F1 (MEDIUM) | **The premise of the plan's risk model was false.** `subscriber.ts:183` calls `readReply(conn)` with the default `READ_TIMEOUT_MS = 30_000` (`resp.ts:58`), and `ReplyReader` fixes its deadline at construction, bounding even the wait for the first byte. There is no subscribe-mode PING keepalive. So on any bus quieter than 30s **every instance re-dials its subscribe socket ~2 880×/day** — each cycle a real lost-control-frame window. Consequences: SC-003 as written described a deployment that does not exist; §9's "bounded by real reconnects" rested on a false rate; and the feature is **more** valuable than #271 claimed. Not a DoS — against a 10s periodic timer it is ~+33% reconcile load. The whole fake-server suite is blind to it, which **confirms #273**. | **Plan changed** — §1 rewritten with the measured cadence; SC-003 corrected to a claim that can hold; §9's flapping row restated against ~30s; a new §9 row names the churn itself; §2 records that an idle-timeout re-dial **is** a reconnect and **does** fire the seam, since frames were genuinely missed. **The fix to the churn is out of this feature's scope and is §12 Q1** — the one question at the stop. |
| S-F2 (MEDIUM) | Confirms the plan's own pre-existing `#activate` no-retry row and adds two things it did not say: the **rate** (combined with S-F1, a re-dial is attempted every ~30s, so the dead end is reached on the first transient blip, ~2 880 chances/instance/day), and the **consequence for this feature** (once there, the new trigger is permanently dead and emits no signal saying so; SC-001 is unachievable on that instance forever). Credits the plan for being right that revocation still functions — `revocationTimer` drives the separate command socket. Not a revocation bypass: a feature that silently no-ops, plus a pre-existing delivery outage. | **Plan changed** — §9's pre-existing row carries both additions. Added **FR-009**, in scope and one line: the existing failure WARN must state that no further reconnect will be attempted, so the dead state is detectable. The retry itself stays out of scope, as the plan had it. |
| S-F3 (LOW) | §5 row 5's prohibition pushed the implementer to register the raw handler and lose the WARN naming **which control** failed — a security-control failure logged without its subject (ASVS 16.2.1). Also flagged: FR-003's containment must never be extended into "and then stop firing", because the periodic timer being alive is what makes containment fail *closed*; a containment that disarms the retry converts fail-closed into permanent silent degradation. | **Plan changed** — same row rewrite as A4 (the two audits converged here independently), plus FR-005 naming `() => this.#runRevocationReconcile()` as the registered callback, plus an explicit prohibition in FR-003 and a matching §9 row. |
| S-F4 (LOW) | FR-003 specified a WARN but not its **encoder**, leaving the log-injection guarantee resting on the implementer copying the neighbouring line. The audit says plainly it could **not** show a reachable injection — every value that can transitively reach that error is charset-constrained (`isValidName`, `crypto.randomUUID()`). A specification-completeness gap, worth one line only because `renderError` already provides the guarantee for free (200-char cap, DSN redaction, `safeForLog` encoding) and the file's other three WARNs all use it. | **Plan changed** — FR-003 now names `safeForLog(this.hostname)` + `renderError(error)`, matching §6's stated dependencies. |
| S-F5 (LOW) | The re-check's **monotonicity** — that it can only apply a revocation, never rescind one — is what makes a peer-influenceable trigger safe, and it was only an emergent property of `revokeLocal` happening to call `close()` and disconnect. Nothing forbade a future change making the re-check two-way; the moment it did, a trigger a Redis peer can drive would become a trigger that drives a *decision*. One sentence now, a cross-cutting re-audit later. | **Plan changed** — added to §6 as an explicit invariant, together with the seam's nullary "carries no data" property that the audit identified as the other load-bearing fact. |

**Verdict**: `needs_followup` — 0 CRITICAL, 0 HIGH, 2 MEDIUM, 3 LOW, and **no merge blocker**.
**Coverage**: the four standard questions plus the two judgments this plan specifically asked for.
It affirmed, with traced evidence: the seam accepts **no data** (nullary signature); the durable
marker remains the **sole authority** and the re-check is **monotone** — there is no code path from
a trigger to `SREM`/`DEL` of a live marker, and index reaping is TTL-driven only; **FR-003's
containment does not defeat revocation** — it fails *closed* onto #268's shipped periodic guarantee,
never past it; **a post-`close()` fire is not exploitable** (FR-007 is hygiene, not a boundary);
**no WebSocket client can reach any of this** — `decodeClientMessage` is a deny-by-default
allowlist of `subscribe`/`unsubscribe`/`ping`, so no client can place a byte on the Redis bus;
connection ids are ephemeral `crypto.randomUUID()`, not user identifiers; and **an authenticated
stranger gains nothing** — six specific paths were enumerated and checked. It did **not** re-file
#268 S1 (this work's origin), found **no interaction with #272** (the seam carries no frame, so no
replay surface), and **confirms #273**. Two leaves were left unread on budget
(`03-injection-and-input.md`, `04-cryptography-and-secrets.md`) on the grounds that the HMAC and
injection surface is #268's and unchanged here — that is the coverage limit worth knowing.

Neither MEDIUM is a hole this feature opens: both are pre-existing `@lockness/redis` behaviours the
plan's risk model mis-stated, and both changed what the plan **claims** rather than what it builds.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1 — Scope: fix the subscribe-socket idle churn here, or file it?** The audits established that the subscribe socket re-dials every ~30s on an idle bus, because it reads with the default 30s deadline and has no PING keepalive. It is a pre-existing `@lockness/redis` defect, not one this feature introduces — but it is the direct cause of most of the lost-frame windows this feature exists to close. | **File it separately.** This branch stays purely additive — add the seam, ship. The churn fix is a behaviour change to the RESP read discipline of a **published** transport primitive, and deserves its own plan and its own audits rather than riding along on a plan that was validated without it. Until it ships, this feature is precisely the mitigation: every one of those ~2 880 daily re-dials now recovers a lost evict immediately instead of on the next tick. Filed as [#274](https://github.com/locknessland/lockness-monorepo/issues/274). | 2026-09-05 |

### Decided without asking

- **The seam lives on `RedisSubscribeConnection` only, not on `AuthenticatedConnection`.** *(Was
  Q2; closed by the architecture audit.)* Only the subscribe connection holds `this.patterns` and
  can say "my subscriptions were re-issued". `AuthenticatedConnection` is shared with `RedisClient`,
  where a reconnect is a command retry with no subscription-restoration meaning — putting the seam
  there gives one name two meanings inside the security-critical shared primitive.
- **The reconnect seam does NOT drive the presence ghost sweep.** *(Was an open question; closed by
  the architecture audit.)* The authoritative roster is Redis and `listMembers` reads it live;
  `manager.ts:106-118` states the local `presence` map is explicitly not the roster, so a reconnect
  leaves nothing stale to reconcile. The only loss is missed presence join/leave frames, which #272
  independently characterises as cosmetic. #268's risk table claimed roster-reconcile-on-reconnect;
  that claim was over-stated, and coupling two unrelated cadences buys no correctness.
- **An idle-timeout re-dial fires the seam like any other reconnect.** Frames published during the
  re-dial were genuinely missed; the seam's meaning is "my subscriptions were re-issued", not "a
  fault I judged interesting occurred".
- **The handler is registered inside `onRevocationReconcile`, not at construction.** That method is
  already the single registration point for the revocation trigger; splitting registration across
  two call sites is the duplication §5 row 2 forbids.
- **No debounce or minimum interval between reconnect-driven re-checks.** The re-check is idempotent
  and monotone, and ~1 fire per 30s against a 10s timer is ~+33% load. A cooldown would be a second
  cadence to reason about (YAGNI). Revisit only if a deployment shows it.
- **No new configuration option.** The trigger has no useful "off" — an operator who does not want
  it is asking for a slower revocation, which the periodic timer already provides as a floor.
- **Single handler, last-registration-wins**, matching `onMessage` / `onControl` /
  `onRevocationReconcile`. Symmetry with the three existing seams is worth more than speculative
  multicast against a single consumer; a multicast list would make this the one seam in the package
  behaving differently. Recorded here because the architecture audit predicts a second consumer
  arriving in ~3 cycles, at which point this is the decision that gets renegotiated.
- **The handler stays nullary.** A future consumer wanting selective re-checks will want the fault
  duration; adding it later is a signature change on published JSR API. Deliberately deferred — the
  nullary signature is also the property the security audit identified as making the seam carry no
  peer-influenceable data.
- **The handler's type stays unexported**, like `MessageHandler` at `subscriber.ts:51`, so the
  generated `AGENTS.md` surface blocks need no regeneration for a new type name.
- **Test doubles are updated, not the port made mandatory.** FR-004 keeps the member optional so
  application-supplied subscribers are not broken by a minor release, and
  `driver_redis.test.ts`'s fake is left without it as the standing US3 proof.
