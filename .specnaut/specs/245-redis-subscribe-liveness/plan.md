# Plan: keep the Redis subscribe socket alive, and never let it go deaf

**Branch**: `245-redis-subscribe-liveness` | **Date**: 2026-09-06 | **Backlog items**:
[#275 — Redis: a failed subscribe re-dial is never retried](https://github.com/locknessland/lockness-monorepo/issues/275)
(primary) and
[#274 — Redis: subscribe socket re-dials every ~30s on an idle bus](https://github.com/locknessland/lockness-monorepo/issues/274)

**One branch, two issues.** Both issues' own Notes sections say so and prescribe this ordering:
they are coupled in both directions. Fixing #275's retry alone produces a retry cycle every ~30s;
fixing #274's churn alone leaves the first transient blip terminal. They share one file, one code
path, and — as section 5 shows — one liveness clock.

---

## 1. Why this exists

`RedisSubscribeConnection` is the socket every cross-process realtime frame arrives on. Today it has
two defects that compound into a silent delivery outage.

**The churn (#274).** `#readLoop` calls `readReply(conn)` with no deadline argument
(`packages/redis/subscriber.ts:294`), so it takes `resp.ts`'s `READ_TIMEOUT_MS = 30_000` default.
That deadline is fixed once, when the reader is constructed (`packages/redis/resp.ts:310`), and
bounds even the wait for the **first byte**. A subscribe socket idles by design. So on any bus
quieter than 30 seconds the read faults, the catch treats it as a wire fault, and the connection
tears down and re-dials: measured shape is **~2 880 socket teardowns per instance per day** on an
idle deployment, each one a window in which a published frame — including an `evict` control frame —
is simply lost.

**The dead end (#275).** When a re-dial fails, `#activate`'s catch logs a WARN and returns.
The code says so inline: `nothing here schedules a retry (#275)`
(`packages/redis/subscriber.ts:246-257`). Nothing will call `#activate` again — `#readLoop` has
already returned, `loopConn` is null, and the only other caller is `psubscribe()`, which
`@lockness/realtime`'s driver invokes exactly twice, at boot. **One transient DNS or connect blip
leaves the instance permanently deaf**, with no signal beyond a single WARN line.

Together: 2 880 chances per day to hit a dead end that never recovers.

Neither defect is visible to the existing fake-server suite, because every test in it completes in
well under 30 seconds.

## 2. User scenarios

### US1 — an idle deployment stops churning (P1)

**Given** a Lockness instance subscribed to a realtime bus with no traffic,
**when** five minutes pass with nothing published,
**then** the subscribe socket is still the same socket — no teardown, no re-dial, no
re-`PSUBSCRIBE`, and no WARN.

### US2 — a broker that stops answering is still caught (P1)

**Given** a subscribe socket whose peer accepts the connection but has stopped responding
(a half-open link, a hung broker),
**when** the named liveness window passes with no frame of any kind,
**then** the socket is discarded and a reconnect is attempted — the same self-heal as today,
reached by a genuine liveness signal instead of by an idle timer.

### US3 — a transient blip no longer kills the instance (P1)

**Given** a subscribe connection whose re-dial fails (connect refused, DNS blip, broker restarting),
**when** the broker becomes reachable again,
**then** the connection re-dials, re-issues every active `PSUBSCRIBE`, resumes delivery, and fires
the reconnect seam exactly once — without any application intervention or process restart.

### US4 — an operator can see it happening (P2)

**Given** a broker that is unreachable for an extended period,
**when** an operator reads the logs,
**then** each failed attempt is named at WARN with its attempt number and the delay before the next
one, so "still trying" is distinguishable from "gave up" — and there is no state in which the
connection is deaf while the log is quiet.

### Edge cases

- **`close()` during a pending retry.** The timer must be cancelled; `close()` must not wait on it,
  and no test may leak it.
- **`psubscribe()` called while a retry is pending.** The new pattern is recorded and picked up by
  the pending attempt, not by a second parallel dial.
- **A keepalive write that itself fails.** A failed `PING` write is a wire fault like any other and
  takes the existing fault path — it must not be swallowed, and must not double-trigger a reconnect
  alongside the read fault the same broken socket will produce.
- **Subscribe-mode `PING` reply shape.** Real Redis in subscribe mode answers `PING` with a
  multi-bulk `["pong", ""]`, not the `+PONG` simple string the fake server returns
  (`packages/redis/tests/fake_server.ts:133`). Both are non-`pmessage` frames that `#dispatch`
  already ignores, but the divergence is real and is exactly the class
  [#285](https://github.com/locknessland/lockness-monorepo/issues/285) exists to close.
- **A first connect that never succeeds** (wrong host in config). Must not spin hot, must not be
  silent, must not stack timers.

## 3. Requirements

- **FR-001** — An idle subscribe socket MUST NOT be torn down. No re-dial and no re-`PSUBSCRIBE`
  may be triggered by the mere absence of published traffic, for any idle duration.
- **FR-002** — A peer that stops producing frames MUST still be detected, within a bounded window
  that is a **named constant with a stated value** (`livenessMs = 45_000`), not an incidental default
  inherited from another module.
- **FR-003** — Liveness is maintained by writing `PING` on the subscribe socket every
  `keepaliveMs = 15_000`.
  **Any** inbound frame satisfies liveness — a `pmessage`, a subscribe confirmation, or a pong —
  because all three prove the peer is alive, and only one of them is under our control.
- **FR-004** — A failed activation (connect, `AUTH`, or `PSUBSCRIBE`) MUST be retried with
  exponential backoff from `retryBaseMs = 250`, capped at `retryMaxMs = 30_000`. Abandoning is not
  an outcome.
- **FR-005** — Every failed attempt is logged at WARN, naming the attempt count and the delay before
  the next attempt. There is no state in which the connection is deaf and the log is silent.
- **FR-006** — At most **one** retry may be in flight. `close()` cancels the pending retry, and the
  process must be able to exit with none pending.
- **FR-007** — A recovery after one or more failed attempts fires the reconnect seam **exactly
  once**, and only when the activation was a reconnect. A retried *first* connect fires nothing —
  there is still nothing to reconcile.
- **FR-008** — The keepalive and the retry hold no unbounded state: one timer each, replaced rather
  than stacked.
- **FR-009** — Both cadences and the backoff policy are documented in `packages/redis/README.md`,
  **named** (the constant identifiers appear), not merely described.
- **FR-010** — The test harness must be able to make the broker unreachable and later reachable
  again on the same port, so FR-004 is provable without a live broker. It must also be able to
  accept a connection and then answer nothing, so FR-002 is provable the same way.
- **FR-011** — A successful activation leaves **every recorded pattern** subscribed, not only the
  pattern that triggered it. *(architecture audit, CRITICAL)*
- **FR-012** — A failed activation **discards the socket** before scheduling its retry. A retry may
  never re-use the socket the previous attempt failed on. *(security audit, HIGH)*
- **FR-013** — Every byte written to the subscribe socket passes through **one serializing write
  path**. `PSUBSCRIBE`, the keepalive `PING`, and the retry's re-issue all await it.
  *(both audits, independently)*
- **FR-014** — The liveness window bounds the **whole activation**, handshake included — not only
  the read loop. `AUTH` and `SELECT` may not inherit the command path's 30s default.
- **FR-015** — Backoff carries **full jitter** (`random() * min(cap, base * 2^n)`), so N instances
  do not re-dial a recovering broker in lockstep.
- **FR-016** — A recovery after one or more failed attempts logs **once**, naming the attempt count
  and the elapsed time. An outage that ends must be as visible as one that starts.
- **FR-017** — Reconnect identity is a **monotonic latch**: once any activation folded into the
  pending retry chain is a reconnect, the chain is a reconnect. The fail-safe direction — the
  revocation re-check is idempotent reconciliation.
- **FR-018** — All four cadences are validated at construction: positive, finite,
  `retryMaxMs >= retryBaseMs`, and `livenessMs >= 2 x keepaliveMs`. A strict `>` admits
  `keepalive + 1`, which inverts into the permanent churn this feature exists to remove.
- **FR-019** — `resp.ts` gains `MAX_LINE_BYTES`. A longer read deadline widens an uncapped buffer,
  so the bound must become a **size** check rather than continue riding on a timeout.
- **FR-021** — A socket that **activated and then faulted** re-dials through the same backoff a
  failed activation uses. The failure streak resets only once a socket has **survived** a keepalive
  interval — an activation completing is not proof the peer will keep answering, and a streak that
  resets on arrival is not a throttle. *(review gate, HIGH)*
- **FR-020** — `close()` MUST NOT await an in-flight dial. It sets `closed`, clears both timers, and
  lets the pending dial's own continuation observe `closed` and discard what it receives.

## 4. Success criteria

- **SC-001** — A subscribe connection left idle for at least **three times** the previous 30-second
  deadline performs exactly one dial and one `PSUBSCRIBE`, and logs no warning.
- **SC-002** — A peer that accepts but never answers is discarded and re-dialled within the named
  liveness window, and the fault is logged.
- **SC-003** — A connection whose re-dial fails at least once and then succeeds resumes delivering
  published messages to its handler.
- **SC-004** — The whole `@lockness/redis` and `@lockness/realtime` suite passes under
  `--trace-leaks`: no timer and no socket outlives its test.
- **SC-005** — Across a recovery that took N failed attempts, the reconnect seam fires exactly once.
- **SC-006** — Mutation-verified: disabling the keepalive makes SC-001 fail; disabling the retry
  makes SC-003 fail. A test that stays green with its subject removed proves nothing.
- **SC-007** — Two patterns are recorded, the first dial fails, and after recovery **both** reach the
  wire. This is the CRITICAL finding's regression test and the boot path's real shape.
- **SC-008** — An activation whose `PSUBSCRIBE` write fails on a live socket recovers on a later
  attempt — proving the socket was discarded rather than re-used.
- **SC-009** — `close()` called while a dial to an unreachable address is in flight resolves inside a
  bounded time, not after the OS SYN budget (~75s macOS / ~130s Linux).
- **SC-011** — A peer that accepts, answers `PSUBSCRIBE` and then drops produces a **throttled**
  reconnect rate, not a hot loop. Measured before the fix: 7 539 dials per second.
- **SC-010** — The accept-but-never-answer test runs **with a password and `db: 2` set**, so the
  handshake half of the liveness window is actually exercised.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **How long the subscribe socket may wait for its peer** — read loop **and** handshake | `packages/redis/subscriber.ts` — one constant, passed both at the `readReply` call site in `#readLoop` and into the activation's handshake | Changing `READ_TIMEOUT_MS` in `resp.ts` (it is the *command* path's budget); a second `readReply` taking the default; `AUTH`/`SELECT` silently inheriting 30s via `connection.ts:94` |
| **When a keepalive `PING` is written** | `packages/redis/subscriber.ts` — one timer, armed on activation, cleared in `#discardSocket` and `close` | A second timer anywhere in the file; a `PING` issued by the realtime driver or by `RedisClient` on this socket; a per-pattern timer |
| **Whether a re-dial is retried, and after how long** | `packages/redis/subscriber.ts` — one `#scheduleRetry`, reached from **both** re-dial paths (a failed activation's catch and the read loop's fault), each **after** discarding its socket | A retry loop inside `psubscribe()`; caller-side retry in `packages/realtime/drivers/redis.ts`; a second backoff for first-connect vs reconnect vs fault; a retry that skips the discard |
| **Which patterns an activation issues** | `packages/redis/subscriber.ts` — always `[...this.patterns.keys()]`, for **both** entry points | Passing a single pattern from `psubscribe`; a retry that issues only the pattern that failed |
| **What counts as a reconnect** (and so fires `onReconnect`) | `packages/redis/subscriber.ts` — the choice of entry point, `#connectAndSubscribe` vs `#reconnectAll`, **latched monotonically** across a coalesced retry chain | A boolean threaded through `#scheduleRetry`; the seam fired from the retry timer rather than from inside `#activate`'s success path; a coalesced chain that takes the *last* identity instead of the latched one |
| **Who may write to the subscribe socket, and in what order** | `packages/redis/subscriber.ts` — one serializing write path all three writers funnel through | Any direct `writeFrame(conn, …)` elsewhere in the file; a keepalive that writes outside the queue |
| **What resets the liveness clock** | `packages/redis/subscriber.ts` — `#readLoop`'s one-`readReply`-per-iteration structure, each call building a fresh reader | A persistent `ReplyReader` across replies (what pipelining would introduce); a second read path |
| **How many attempts have failed, and the delay before the next** | `packages/redis/subscriber.ts` — one counter, scoped **per connection**, incremented inside `#scheduleRetry` after its early returns and reset once a socket **survives** a keepalive interval | A counter per activation; incrementing at the call sites (it then grows for attempts that were never scheduled); a second counter for logging; a delay recomputed at the log site; a reset on activation rather than on survival |
| **When both timers are cleared** | `packages/redis/subscriber.ts` — one `#discardSocket(conn)` that discards and clears, used at every discard site | Clearing at each `conn.discard` call site by hand; `close()` clearing a different set than the fault path |
| **The largest RESP line** | `packages/redis/resp.ts` — `MAX_LINE_BYTES`, beside `MAX_BULK_BYTES` | A length check in `subscriber.ts`; relying on the read deadline to bound memory |
| **"The broker is unreachable"** (test-side) | `packages/redis/tests/fake_server.ts` — `unreachable()` / `reachable()`: close the listener, re-bind the **same captured port** | A second fake server; re-binding on a different port; using `mute()` to prove FR-004 |
| **How fast a re-dial may follow a socket that ACTIVATED and then faulted** | `packages/redis/subscriber.ts` — the same `#scheduleRetry` a failed activation uses, with the cause named | The read loop calling `#reconnectAll` directly; a second cadence for the fault path; a streak counter reset by an activation completing rather than by the socket surviving |
| **"The broker accepts and answers nothing"** (test-side) | `packages/redis/tests/fake_server.ts` — `mute()` / `unmute()`: keep the listener bound, stop servicing accepted sockets | Using `unreachable()` to prove FR-002; a per-test socket hack |

**Binding.** A decision may not move out of its home without this plan being amended. Two *askers*
are fine; two *deciders* is the defect.

**Rows 3 and 8 were amended in place, not merely supplemented.** Adding row 12 while leaving them
stating the superseded rule would have spelled one decision in three rows, two of them false — which
is the defect this table exists to prevent, committed inside the table itself.

**Row 12 was missing entirely, and that was the review gate's HIGH.** Row 3 governs a *failed
activation*; the read loop's fault is a *successful* activation that dies a moment later, and the
table had no home for its cadence. So `#readLoop` re-dialled bare — no attempt count, no delay —
and a peer that accepts, answers `PSUBSCRIBE` and then drops spun the client at **7 539 dials per
second**, measured, in the default no-password config with no attacker involved. Both plan audits
read the table and neither could see the gap, because a missing row looks exactly like a decision
nobody needed to make. The row is the fix; the code change alone would leave the next author free
to re-introduce it.

**Row 4 and row 5 were one row in the first draft, and that was the CRITICAL finding.** "Which
patterns to issue" and "whether this fires the seam" are orthogonal decisions that the two entry
points encoded as one — and only two of the four cells existed. The retry needs the third (all
patterns, no seam). Splitting them is what makes "the retry re-enters through the same entry point"
a true statement instead of a hopeful one.

## 6. Technical context

| | |
| :--- | :--- |
| **Language** | TypeScript, Deno, TC39 Stage 3 decorators |
| **Package** | `@lockness/redis` (`packages/redis/`) — `subscriber.ts` is the only production file that changes |
| **Storage** | None. All state is per-connection and in-memory |
| **Testing** | `Deno.test` over the byte-level fake in `packages/redis/tests/fake_server.ts`; the gated live-broker suite from [#273](https://github.com/locknessland/lockness-monorepo/issues/273) for the real subscribe-mode `PING` shape |
| **Constraints** | No new dependency. No `npm:` specifier. The fake-server suite must stay fast — a test may not actually wait 45 seconds |
| **Scale** | One subscribe socket per process; one `PING` per cadence; a handful of patterns |

**The speed constraint drives a design decision.** The cadences must be injectable so a test can
drive them in milliseconds. They are constructor options with named-constant defaults — not a
`FakeTime`, which cannot advance a real socket's `Deno.conn.read`.

### Domain model

**Bounded context** — the Redis wire adapter. Infrastructure only: no domain rule crosses into it,
and it exposes a port (`psubscribe(pattern, handler)`) that `@lockness/realtime` consumes
structurally.

**Vocabulary**

| Term | Meaning |
| :--- | :--- |
| **Activation** | One attempt to have a connected, authenticated socket with every required pattern `PSUBSCRIBE`d and a read loop draining it |
| **Liveness window** | The longest silence, from any cause, that is not treated as a fault |
| **Keepalive** | A `PING` written solely to make a healthy peer produce a frame inside the liveness window |
| **Reconnect** | A **fault-triggered** activation whose patterns were re-issued **successfully**. Not a first connect, and not a failed one |
| **Retry** | A repeat of an activation that failed. It inherits the original's reconnect-or-not identity |

**Entities** — `RedisSubscribeConnection` has identity (its socket and its pattern set).

**Value objects** — the cadences (liveness window, keepalive interval, backoff base and cap) are
immutable numbers fixed at construction.

**Invariants**

1. At most one read loop, one keepalive timer and one retry timer exist per connection at any time.
2. Reconnect identity is a **monotonic latch** — a retry may promote a chain to "reconnect", never
   demote it. Fail-safe: the revocation re-check is idempotent reconciliation, so an extra fire costs
   one command round-trip and a missed fire costs enforcement latency.
3. `close()` leaves nothing pending: no timer, no unresolved read — and does not *await* a dial.
4. **All four cadences are positive and finite**, `retryMaxMs >= retryBaseMs`, and
   `livenessMs >= 2 x keepaliveMs`. Validated at construction, throwing — the precedent is
   `packages/realtime/drivers/redis.ts:478-486`. A strict `>` admits `keepalive + 1`, which inverts
   into permanent churn on any broker with non-zero RTT.
5. **One writer at a time.** Every byte reaching the socket passes the serializing write path.
6. A socket that failed an activation is discarded before the retry is scheduled; no retry ever sees
   the previous attempt's socket.

**Out of scope** — `RedisClient`'s command-path deadline (correct as-is), and the fake-vs-real
conformance question owned by [#285](https://github.com/locknessland/lockness-monorepo/issues/285).

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| No direct `hono` import | ✅ n/a — no HTTP surface |
| JSR-only dependencies, declared per package | ✅ no new dependency |
| No `any` in exported APIs | ✅ new options are `number`; no `any` |
| Tailwind v4 CSS-variable syntax | ✅ n/a — no UI |
| Pre-completion gate | ✅ `deno fmt && deno lint && deno check && deno task test` before done |
| Never modify `deno.lock` manually | ✅ untouched |
| JSDoc on public APIs | ✅ the new config fields and constants carry it |
| MVC layering | ✅ n/a — infrastructure adapter |
| Commit discipline, one category per commit | ✅ `feat` / `test` / `docs` split |
| TDD non-negotiable | ✅ failing test first for each of FR-001, FR-002, FR-004 |
| DDD layering | ✅ pure infrastructure; no domain logic added |
| Domain Model gate | ✅ section 6 |
| **No silent catches** | ⚠️ **the one to watch.** Every new catch (keepalive write, retry timer) logs at WARN or re-throws. A retry that swallows its own failure would be exactly the defect #275 is about |
| SOLID / DRY / KISS / YAGNI | ✅ one clock, not two — see the architecture note below |

### Complexity tracking

No violation. One thing worth naming: this adds two timers to a class that already reasons about a
read loop and a disposable. The mitigation is that both are **replaced, never stacked**, and both
are cleared at exactly two points (socket discard, and `close`).

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/redis` public API | **yes** | `RedisSubscribeConnectionConfig` gains optional `keepaliveMs`, `livenessMs`, `retryBaseMs`, `retryMaxMs`. Additive; every existing call site keeps working |
| `packages/redis/subscriber.ts` | **yes** | The keepalive, the liveness deadline, the retry |
| `packages/redis/resp.ts` | **yes** | `READ_TIMEOUT_MS` stays (it is the command path's budget), but `MAX_LINE_BYTES` is added — FR-019. `readLine` (`resp.ts:353-366`) has no length cap at all and grows geometrically until the deadline fires, so a longer deadline widens an existing hole |
| `packages/redis/connection.ts` | **yes** | The handshake gains an optional deadline so `AUTH`/`SELECT` stop inheriting the command path's 30s default (FR-014). Defaulted — `RedisClient`'s four `exchange` sites are untouched |
| `@lockness/realtime` driver | **type only** | Behaviour improves with no code change, but `fromConfig` takes `RedisClientConfig` (`drivers/redis.ts:527-532`), so the new cadences are unreachable — and a literal carrying one is a TS2353 excess-property error. See open question 3 |
| `packages/redis/tests/fake_server.ts` | **yes** | Listener pause/resume, and an accept-but-never-answer mode (FR-010) |
| `packages/redis/tests/subscriber.test.ts` | **yes** | New tests, **plus one existing test to correct**: `onReconnect does not fire when the re-dial itself fails` asserts the WARN text `no further reconnect`, which this feature makes untrue |
| `packages/redis/README.md` | **yes** | FR-009 |
| CLI / HTTP / UI surfaces | **no** | None |

### Documentation (this feature)

```text
.specnaut/specs/245-redis-subscribe-liveness/
├── plan.md    # This file — the whole plan
└── tasks.md   # derived from THIS file once approved
```

No front-end surface: this feature touches no FE source, so there is no prototyping section.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| **The liveness window inverts into permanent churn** if it is ever set at or below the keepalive interval | Invariant 4 — validated at construction with a **2× margin**, not a strict `>`. A bad pair throws rather than degrading in production |
| **Three concurrent writers desync the frame.** `writeFrame` loops on short writes (`resp.ts:229-243`) and its own doc records a measured 320 KB short write. A corrupted-but-valid `PSUBSCRIBE` on a truncated pattern produces **no error and no fault** — `#dispatch` routes by the pmessage's own pattern value (`subscriber.ts:326`), so every frame is silently dropped, permanently | FR-013 — one serializing write path. **Both audits found this independently and both named it the finding that gets expensive later**: ~15 lines now, versus re-auditing every writer once the keepalive has normalised the direct-write pattern |
| **A retry loops forever on a poisoned socket.** `#activate`'s catch never discards, and `connect()` returns the cached socket (`connection.ts:191`), so a failed `PSUBSCRIBE` write feeds the same corpse to every attempt — while the log emits "retrying" forever | FR-012 + invariant 6. Worse than today's terminal WARN, because the output *looks* like recovery in progress |
| **A synchronised herd against a recovering broker** — N instances fail at the same instant, compute the same deterministic backoff, and re-dial in lockstep forever | FR-015, full jitter. The per-instance rate is trivial; the *synchronisation* is the defect |
| **Cleartext `AUTH` re-sent forever.** `tls` defaults to `false` (`connection.ts:142`) and the cleartext warning fires once, at construction (`:144-155`). "Never abandon" turns a one-shot exposure into a guaranteed one for anyone who later binds that host:port | FR-005's WARN names that `AUTH` is being re-sent in cleartext when `tls` is false and a password is set — location and kind, never a value. Bounding the retry is **not** the fix: #275 is right that abandoning is worse |
| **`close()` blocks for minutes** — it guards on `conn.isActive`, true mid-dial, then awaits `conn.connect()`. Against a blackholed host that is the OS SYN budget: ~75s on macOS, ~130s on Linux, at exactly the moment an operator is restarting during an outage | FR-020 + SC-009. Loopback tests can never surface this — `ECONNREFUSED` on 127.0.0.1 is instant |
| **`#activate` publishes a socket after `close()` has run** — it checks `closed` once, before the await, then registers a disposable and writes on a socket nobody owns | An immediate post-await `closed` re-check that discards. Latent today with one boot activation; a live race on every shutdown once retries chain |
| **A longer deadline widens `readLine`'s uncapped growth** — the memory an attacker can force is bandwidth × deadline, and `MAX_BULK_BYTES` guards only a *body* behind a well-formed length line | FR-019, `MAX_LINE_BYTES`. This does not conflict with decision row 1: that row forbids moving the *timeout*; `resp.ts` already owns "a reply's maximum size" |
| **Test-suite slowdown** — a liveness test that genuinely waits | Cadences are injectable; tests drive them in milliseconds |
| **Leaked timers** turn `--trace-leaks` red across unrelated suites | SC-004; both timers cleared in `#discardSocket` and `close`, and the retry timer is unref'd |
| **The fake server's `+PONG` diverges from real subscribe-mode `["pong", ""]`** | Both ignored identically by `#dispatch` (`subscriber.ts:316`, on `length !== 4`). Verified by both audits. `fake_server.ts` will emit the multi-bulk shape once a `PSUBSCRIBE` has been seen — retiring this slice of [#285](https://github.com/locknessland/lockness-monorepo/issues/285) on this branch rather than growing it |
| **Removing the churn removes an accidental load shedder** for the control replay store — each dial window today drops the frames published during it, marginally slowing the store's fill toward its 10 000 cap | Direction of change, not a threshold crossing (a dial window is milliseconds against a 30s replay window). Recorded here so whoever sizes [#283](https://github.com/locknessland/lockness-monorepo/issues/283) knows this branch moved the fill rate adversely |

## 10. Architecture audit

**Verdict: `fail`** — 1 CRITICAL, 3 HIGH, 3 MEDIUM, 1 LOW. Coverage: `plan.md` plus all of
`subscriber.ts`, `resp.ts`, `connection.ts`, `drivers/redis.ts`, `fake_server.ts`, and
`subscriber.test.ts:160-385`; 10 open backlog items read.

| # | Finding | Disposition |
| :--- | :--- | :--- |
| **A1** `CRITICAL` | Row 4's entry-point mechanism drops a pattern on a retried first connect. `#connectAndSubscribe(pattern)` issues **one** pattern; `manager.ts:132,135` psubscribes **two** back-to-back, sharing the single-flight dial at `connection.ts:190`. A blip rejects both; one retry slot means one pattern loses its retry; the survivor re-enters the one-pattern door. **The instance is permanently deaf on the control topic** — the exact state #275 exists to eliminate, recreated by its own fix | **Plan changed.** Row 4 split from row 5; `#connectAndSubscribe()` now issues `[...this.patterns.keys()]`. FR-011 + SC-007 added. Re-`PSUBSCRIBE` of a live pattern is a no-op, which today's `#reconnectAll` already depends on |
| **A2** `HIGH` | **#274's body is factually wrong.** It states "`RedisClient` passes its own [deadline]". It does not: `client.ts:196` → `exchange` → `connection.ts:94` calls `readReply(conn)` bare. All four production `exchange` sites take the 30s default — including `AUTH` and `SELECT` on **every** activation. So on any deployment with a password, half the liveness window is exactly the inherited default FR-002 forbids | **Plan changed** — row 1 widened, FR-014 + SC-010 added. **Verified independently against the code before accepting.** The issue body needs correcting on the board |
| **A3** `HIGH` | Row 5's "pause/resume the listener" cannot produce connect-refused. A bound listener that stops accepting completes the handshake into the backlog, so `Deno.connect` **resolves** — that is FR-010's *other* capability. SC-003 would go green having never exercised a connect blip | **Plan changed.** Split into `unreachable()`/`reachable()` (close and re-bind the same captured port) and `mute()`/`unmute()`, with each row naming which FR it may **not** prove |
| **A4** `HIGH` | `close()` awaits an in-flight dial (75–130s on a blackholed host), and `#activate` publishes a socket after `close()` has run — registering a disposable the close already deregistered | **Plan changed** — FR-020, SC-009, two risk rows |
| **A5** `MEDIUM` | Four rules had no decision-table row: FR-003's second half, FR-005, FR-006, FR-010's second half | **Plan changed** — the table went from 5 rows to 12 |
| **A6** `MEDIUM` | The new cadences are unreachable from the only production construction path. `fromConfig` takes `RedisClientConfig` (`drivers/redis.ts:527-532`); a literal carrying `keepaliveMs` is a TS2353 error. FR-009 would document four knobs nobody can set | **Open question 3.** Either widen `fromConfig`'s parameter, or state they are a test seam and drop the "knobs" framing. Silence ships a README that lies |
| **A7** `MEDIUM` | The socket goes from one writer to three with no serialization, and the invariant keeping it safe ("frames are small") is written nowhere | **Plan changed** — FR-013. Independently found by the security audit; see S2 |
| **A8** `LOW` | `PING` becomes load-bearing in production while proved only against `+PONG`, a shape real Redis never sends in subscribe mode | **Accepted, with a cheap fix taken.** Containment verified in both audits; `fake_server.ts` will emit the real multi-bulk shape |

**Its three-cycle prediction, recorded because it is cheaper to answer now.** Cycle 1: the suite is
green — 7 of 8 subscriber tests use a single pattern, so A1 has no test that can see it. Cycle 2: a
production report that presence members never leave, fixed by a one-liner that *silently falsifies
row 4*. Cycle 3: a 4-minute pod termination diagnosed as a Kubernetes grace-period problem. The
audit's own note on scope is adopted: the class is near the threshold where a `SubscribeSocketLifecycle`
extraction becomes right, and §7 now says a fourth timer is that threshold.

## 11. Security audit

**Verdict: `fail`** — 0 CRITICAL, 1 HIGH, 6 MEDIUM, 1 LOW, 1 INFO. Coverage: `plan.md`,
`subscriber.ts`, `resp.ts`, `connection.ts`, `drivers/redis.ts`; 10 open backlog items read.

**Answers to its four framing questions, kept because they bound what follows.** No new
externally-reachable surface: `subscriber.ts` has no handler and no caller-supplied string, and both
new capabilities are self-directed. No authorization decision exists here or needs to. The retry is
**not** an SSRF or amplification vector — the destination is frozen in the constructor
(`connection.ts:136-143`), never peer-derived. And an authenticated stranger gains **nothing** against
another account: the `onReconnect` seam is nullary by construction, and a missed fire is bounded to
~10s by the independent `revocationTimer` (`drivers/redis.ts:324`). The realistic worst case is
availability of one instance's delivery — a delivery outage, not a revocation bypass, which confirms
#275's own conclusion.

| # | Finding | Disposition |
| :--- | :--- | :--- |
| **S1** `HIGH` | The retry loops forever on a poisoned socket — `#activate`'s catch never discards, `connect()` returns the cached dead socket (`connection.ts:191`), and no read loop exists on it to fault (the write loop runs *before* `loopConn` is assigned). The log says "retrying" forever | **Plan changed** — FR-012, SC-008, one `#discardSocket` helper. **Verified against the code before accepting** |
| **S2** `MEDIUM` | Three concurrent writers, no serialization. Outcome (a) is a `-ERR` that self-heals; outcome (b) is a *valid but different* command — a truncated `PSUBSCRIBE` — with no error, no fault, and every frame silently dropped forever. Least safe exactly when the peer is hung, which is the case the feature exists to handle | **Plan changed** — FR-013 + invariant 5. Named by both seats as **the one that gets expensive later** |
| **S3** `MEDIUM` | The longer deadline widens an uncapped buffer. `readLine` (`resp.ts:353-366`) has no length cap and grows geometrically via `#reserve`; `MAX_BULK_BYTES` guards only a body behind a well-formed length line. Forceable memory = bandwidth × deadline | **Plan changed** — FR-019, `MAX_LINE_BYTES`, and §8 reopened for `resp.ts`. **Verified: `readLine` is bounded by the deadline alone** |
| **S4** `MEDIUM` | No jitter — a synchronised herd against a recovering broker, forever | **Plan changed** — FR-015 |
| **S5** `MEDIUM` | "Never abandon" turns one-shot cleartext `AUTH` exposure into a guaranteed one. Credential capture becomes a matter of patience instead of timing, and silently — the constructor's one-time warning scrolled away long ago | **Plan changed** — FR-005 names the cleartext re-send. Explicitly **not** fixed by bounding the retry |
| **S6** `MEDIUM` | Every failure logs; recovery logs nothing. "Recovered", "the process died" and "the loop is wedged" look identical to an operator watching the WARN stream stop — which is US4's own stated goal, unmet | **Plan changed** — FR-016 |
| **S7** `MEDIUM` | The reconnect identity of a *coalesced* retry is undefined. A `psubscribe` failure (identity `false`) can race the read loop's fault (identity `true`); one retry slot means one identity wins and the plan didn't say which. Untestable after the fact — both paths look identical in the log | **Plan changed** — FR-017 + invariant 2, latching monotonically toward "reconnect" |
| **S8** `LOW` | Four knobs, no values and no validation. `keepaliveMs: 0` is a PING flood at loop rate against the operator's own broker | **Plan changed** — invariant 4 covers all four; **open question 2** fixes the values |
| **S9** `INFO` | Removing the churn removes an accidental load shedder for the [#283](https://github.com/locknessland/lockness-monorepo/issues/283) replay store | **Accepted** — recorded in §9 so whoever sizes #283 knows the fill rate moved adversely |

**Two audits, one finding, found independently.** A7 and S2 are the same defect reached from
opposite directions — the architect asking whether the rule has one home, the security seat asking
what a hostile peer does with it. Both concluded it is cheap now and expensive after this branch
normalises the direct-write pattern. That agreement is why FR-013 is in scope rather than filed.

## 12. Open questions

**All three answered at the stop, 2026-09-06. Settled decisions, binding on the implementer.**

| # | Question | Answer |
| :--- | :--- | :--- |
| **Q1** | How much of the audit-surfaced surface ships on this branch? | **All of it.** The write queue (FR-013), `MAX_LINE_BYTES` (FR-019) and the handshake deadline (FR-014) are in scope, alongside every correctness fix. Rationale accepted: both seats priced the write queue as ~15 lines now versus re-auditing every writer once the keepalive normalises the direct-write pattern |
| **Q2** | What are the cadence values? | **`keepaliveMs = 15_000`, `livenessMs = 45_000`, `retryBaseMs = 250`, `retryMaxMs = 30_000`.** A 3x margin, comfortably clearing invariant 4's 2x minimum, and tolerating two consecutive lost pongs. 5 760 PINGs per instance per day, against ~2 880 full socket teardowns today |
| **Q3** | Are the cadences operator-tunable, or a test seam? | **Tunable.** `RedisBroadcastDriver.fromConfig`'s parameter widens to carry the four cadences, so FR-009's documented knobs are actually reachable. §8's "type only" row becomes a real, small type change in `packages/realtime/drivers/redis.ts` |

### Decided without asking

| Decision | Why it needed no question |
| :--- | :--- |
| `PING` as the keepalive, not a no-op `SUBSCRIBE` | Redis permits `PING` in subscribe mode; it is the documented mechanism |
| `READ_TIMEOUT_MS` stays as-is in `resp.ts` | It is the command path's budget. The *conclusion* survived the audit; the reason given in the first draft (inherited from #274) did not |
| TCP-level `setKeepAlive` rejected | Deno exposes the toggle but not the interval; OS defaults are ~2 hours, far outside any useful window |
| Cadences injectable via config rather than module-level mutable state | Tests need millisecond cadences; a mutable module global would be a second home for the same decision |
| Both entry points issue every recorded pattern | A1. A re-`PSUBSCRIBE` of a live pattern is a no-op, and today's `#reconnectAll` already depends on that |
| Reconnect identity latches toward "reconnect" | S7. The re-check is idempotent reconciliation: an extra fire costs one round-trip, a missed one costs enforcement latency |
| The write queue is a promise chain, mirroring `RedisClient` (`client.ts:105,164-166`) | The pattern already exists in this package; inventing a second shape would be the duplication the table forbids |
| `MAX_LINE_BYTES = 64 KiB` | The longest legitimate RESP line is a bulk length. Generous by three orders of magnitude |
| Retry stays unbounded (no exhaustion state) | #275's whole point. S5's credential concern is answered by making the exposure visible, not by going deaf again |
