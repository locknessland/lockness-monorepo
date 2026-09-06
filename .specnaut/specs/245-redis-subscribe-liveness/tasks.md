# Tasks: keep the Redis subscribe socket alive, and never let it go deaf

**Feature**: `245-redis-subscribe-liveness` | **Branch**: `245-redis-subscribe-liveness`
**Backlog**: [#275](https://github.com/locknessland/lockness-monorepo/issues/275) (primary) +
[#274](https://github.com/locknessland/lockness-monorepo/issues/274)
**Derived from**: `plan.md`, approved 2026-09-06 with all three open questions answered.

**TDD is non-negotiable** (constitution, "Engineering methodology"), so every behaviour task is
preceded by a failing test. **And SC-006 raises the bar**: a test must be *mutation-verified* —
disable the behaviour, watch the test fail, restore it. A test that stays green with its subject
removed proves nothing, and this feature exists because the previous suite was exactly that.

## 🔒 Decision-table homes, carried forward

Every task below that touches a rule names its home. A task may not put a decision anywhere else.

| Decision | Home | Tasks |
| :--- | :--- | :--- |
| How long the socket may wait for its peer (loop **and** handshake) | `packages/redis/subscriber.ts` | T012, T020, T021 |
| When a keepalive `PING` is written | `packages/redis/subscriber.ts` | T015, T016 |
| Whether a failed activation is retried, and after how long | `packages/redis/subscriber.ts` — `#scheduleRetry` | T024, T025, T027 |
| Which patterns an activation issues | `packages/redis/subscriber.ts` — always `[...this.patterns.keys()]` | T010, T011 |
| What counts as a reconnect (latched) | `packages/redis/subscriber.ts` — entry-point choice | T028, T029 |
| Who may write to the socket, and in what order | `packages/redis/subscriber.ts` — the write path | T008, T009 |
| What resets the liveness clock | `packages/redis/subscriber.ts` — `#readLoop`'s one-reply-per-iteration | T020 |
| Attempt count and next delay | `packages/redis/subscriber.ts` — one per-connection counter | T026, T032 |
| When both timers are cleared | `packages/redis/subscriber.ts` — `#discardSocket(conn)` | T006, T007 |
| The largest RESP line | `packages/redis/resp.ts` — `MAX_LINE_BYTES` | T004, T005 |
| "The broker is unreachable" (test-side) | `packages/redis/tests/fake_server.ts` — `unreachable()`/`reachable()` | T002 |
| "The broker accepts and answers nothing" (test-side) | `packages/redis/tests/fake_server.ts` — `mute()`/`unmute()` | T003 |

---

## Phase 1 — Setup

- [X] T001 Add the four cadence options (`keepaliveMs`, `livenessMs`, `retryBaseMs`, `retryMaxMs`) with JSDoc and the named default constants (`15_000` / `45_000` / `250` / `30_000`) to `RedisSubscribeConnectionConfig` in `packages/redis/subscriber.ts`

## Phase 2 — Foundational (blocking: every user story depends on these)

**The test harness cannot express two of the three failure modes today.** T002 and T003 are what
make US2 and US3 provable at all — the plan's A3 finding was that one mechanism cannot do both.

- [X] T002 [P] Add `unreachable()` / `reachable()` to `packages/redis/tests/fake_server.ts` — close the listener and re-`Deno.listen` on the **same captured port** so a dial gets `ECONNREFUSED`. Capture the port at first bind (it comes from `port: 0` at `fake_server.ts:174`). Home: fake_server.ts, decision row 11
- [X] T003 [P] Add `mute()` / `unmute()` to `packages/redis/tests/fake_server.ts` — keep the listener bound, stop servicing accepted sockets, so a dial **resolves** and then hears nothing. Document in the JSDoc that `mute()` must NOT be used to prove FR-004 and `unreachable()` must NOT be used to prove FR-002. Home: fake_server.ts, decision row 12
- [X] T004 [P] Write the failing test for `MAX_LINE_BYTES` in `packages/redis/tests/resp.test.ts` — a reply whose first line never terminates is refused on **size**, not by waiting out a deadline
- [X] T005 Add `MAX_LINE_BYTES` (64 KiB) to `packages/redis/resp.ts` beside `MAX_BULK_BYTES`, and enforce it in `ReplyReader.readLine` (`resp.ts:353-366`). FR-019. Home: resp.ts, decision row 10
- [X] T006 [P] Write the failing test in `packages/redis/tests/subscriber.test.ts` — after a wire fault, no keepalive timer survives (assert via `--trace-leaks` and an explicit timer count)
- [X] T007 Add `#discardSocket(conn)` to `packages/redis/subscriber.ts`: discard the socket **and** clear both timers, used at every discard site (the read-loop fault at `:303`, the new activation-catch site, and `close`). FR-008. Home: subscriber.ts, decision row 9
- [X] T008 [P] Write the failing test in `packages/redis/tests/subscriber.test.ts` — two concurrent writers on one subscribe socket produce two **complete, non-interleaved** frames in `commandLog`
- [X] T009 Add the serializing write path to `packages/redis/subscriber.ts` — a promise chain mirroring `RedisClient` (`client.ts:105,164-166`); `PSUBSCRIBE`, `PING` and the retry's re-issue all await it. **No direct `writeFrame(conn, …)` may remain in the file.** FR-013, invariant 5. Home: subscriber.ts, decision row 6
- [X] T010 [P] Write the failing test in `packages/redis/tests/subscriber.test.ts` — psubscribe **two** patterns, and assert **both** reach the wire from a single activation. This is the CRITICAL finding's regression test and the production boot shape (`manager.ts:132,135`)
- [X] T011 Change `#connectAndSubscribe()` in `packages/redis/subscriber.ts` to take no pattern and issue `[...this.patterns.keys()]`, the same set `#reconnectAll` issues. FR-011, SC-007. Home: subscriber.ts, decision row 4
- [X] T012 Add the constructor validation to `packages/redis/subscriber.ts`: all four cadences positive and finite, `retryMaxMs >= retryBaseMs`, `livenessMs >= 2 * keepaliveMs` — **throwing**, per the `drivers/redis.ts:478-486` precedent. A strict `>` admits `keepalive + 1`. FR-018, invariant 4
- [X] T013 [P] Write the failing test in `packages/redis/tests/subscriber.test.ts` for each rejected cadence pair (zero, negative, `NaN`, `Infinity`, `retryMax < retryBase`, `liveness == keepalive`, `liveness == keepalive + 1`)

**Checkpoint** — the harness can express all three failure modes, one writer owns the socket, both
entry points issue every pattern, and bad cadences cannot be constructed.

## Phase 3 — US1: an idle deployment stops churning (P1) 🎯 MVP

**Independent test**: a connection idle well past the old 30-second deadline performs exactly one
dial and one `PSUBSCRIBE`, and logs nothing.

- [X] T014 [P] [US1] Write the failing test in `packages/redis/tests/subscriber.test.ts` — with `keepaliveMs: 20` and `livenessMs: 60`, an idle connection over ~10 liveness windows shows `server.accepts() === 1` and one `PSUBSCRIBE`, with zero warnings
- [X] T015 [US1] Arm the keepalive timer in `#activate` in `packages/redis/subscriber.ts`: write `encodeCommand(['PING'])` through the write path every `keepaliveMs`, unref'd. **The frame carries no interpolated token** — a correlation id would make the security audit's "nothing" answer stop being true. FR-003. Home: subscriber.ts, decision row 2
- [X] T016 [US1] Pass `livenessMs` as `readReply`'s `timeoutMs` at the single call site in `#readLoop` (`packages/redis/subscriber.ts:294`). FR-001/FR-002. Home: subscriber.ts, decision row 1
- [X] T017 [US1] **Mutation-verify T014**: remove the keepalive write, confirm the test fails, restore. SC-006
- [X] T018 [US1] Make `packages/redis/tests/fake_server.ts` answer `PING` with the real subscribe-mode multi-bulk `["pong", ""]` once a `PSUBSCRIBE` has been seen on that connection, keeping `+PONG` before it. Retires this slice of [#285](https://github.com/locknessland/lockness-monorepo/issues/285) rather than growing it
- [X] T019 [US1] Confirm the existing assertions still hold — `subscriber.test.ts:36` and `driver_redis_live.test.ts:62` filter for `PSUBSCRIBE`, `subscriber.test.ts:186-193` is order-tolerant. The architect counted zero breakages from the `PING`; verify rather than trust

**Checkpoint** — US1 is independently shippable: the churn is gone. [#274](https://github.com/locknessland/lockness-monorepo/issues/274)'s first AC is met.

## Phase 4 — US2: a broker that stops answering is still caught (P1)

**Independent test**: a peer that accepts and never answers is discarded and re-dialled inside the
liveness window.

- [X] T020 [P] [US2] Write the failing test in `packages/redis/tests/subscriber.test.ts` using `mute()` — the socket faults within `livenessMs` and the WARN names the read fault. Assert the *timing*, not merely that it eventually reconnects. Home: decision row 7 (one reader per reply is what makes any inbound frame reset the clock)
- [X] T021 [US2] Thread the liveness deadline into the handshake: add an optional deadline to `AuthenticatedConnection` in `packages/redis/connection.ts` (defaulted, so `RedisClient`'s four `exchange` sites are untouched) and pass `livenessMs` from `RedisSubscribeConnection`. FR-014. Home: subscriber.ts, decision row 1
- [X] T022 [US2] Write the test proving SC-010 — the accept-but-never-answer case with **`password` set and `db: 2`**, so the handshake half of the window is actually exercised. Today's only password test (`subscriber.test.ts:167-208`) is answered instantly and never reaches this
- [X] T023 [US2] **Mutation-verify T020 and T022**: restore the 30s default at each call site in turn, confirm each test fails, restore. SC-006

**Checkpoint** — US2 shippable: [#274](https://github.com/locknessland/lockness-monorepo/issues/274)'s second AC ("a genuinely dead or half-open socket is still detected") is met, handshake included.

## Phase 5 — US3: a transient blip no longer kills the instance (P1)

**Independent test**: a re-dial that fails at least once and then succeeds resumes delivery.

- [X] T024 [P] [US3] Write the failing test in `packages/redis/tests/subscriber.test.ts` using `unreachable()` / `reachable()` — the dial fails N times, then succeeds, and a published message reaches the handler. SC-003
- [X] T025 [US3] Add `#scheduleRetry` to `packages/redis/subscriber.ts`: exponential backoff from `retryBaseMs`, capped at `retryMaxMs`, with **full jitter** (`random() * min(cap, base * 2^n)`), one timer replaced not stacked, unref'd, cleared by `close`. FR-004/FR-006/FR-015. Home: subscriber.ts, decision row 3
- [X] T026 [US3] Add the per-connection attempt counter, reset on a successful activation. FR-005. Home: subscriber.ts, decision row 8
- [X] T027 [US3] **`#activate`'s catch must discard the socket before scheduling the retry** — via `#discardSocket` from T007. Without it `connect()` returns the cached dead socket (`connection.ts:191`) and the retry loops on a corpse forever. FR-012, invariant 6, security HIGH
- [X] T028 [P] [US3] Write the failing test in `packages/redis/tests/subscriber.test.ts` — a `PSUBSCRIBE` write that fails on a **live** socket (accept, then drop mid-write) recovers on a later attempt. SC-008. This is the test that fails if T027 is skipped
- [X] T029 [US3] Implement the monotonic reconnect-identity latch in `packages/redis/subscriber.ts`: once any activation folded into the pending chain is a reconnect, the chain is a reconnect. FR-017, invariant 2. Home: subscriber.ts, decision row 5
- [X] T030 [US3] Write the test proving SC-005 — across a recovery that took N failed attempts, `onReconnect` fires **exactly once** — and the test proving FR-007: a retried *first* connect fires nothing
- [X] T031 [US3] Rewrite `close()` in `packages/redis/subscriber.ts` so it does **not** await `conn.connect()`: set `closed`, clear both timers, and let the pending dial's continuation observe `closed` and discard what it receives. Add the post-await `closed` re-check in `#activate` that discards a socket arriving after close. FR-020
- [X] T032 [US3] Write the test proving SC-009 — `close()` during an in-flight dial to an unreachable address resolves inside a bounded time. Note in the test why loopback alone cannot prove this (`ECONNREFUSED` on 127.0.0.1 is instant)
- [X] T033 [US3] **Correct the existing test** `subscriber - onReconnect does not fire when the re-dial itself fails` (`packages/redis/tests/subscriber.test.ts:250`) — it asserts the WARN text `no further reconnect`, which this feature makes untrue. The *property* it guards (a failed re-dial is not a reconnect) still holds and must stay asserted
- [X] T034 [US3] **Mutation-verify T024, T028 and T030**: remove the retry, remove the discard, and break the latch in turn; confirm the matching test fails each time; restore. SC-006

**Checkpoint** — US3 shippable: [#275](https://github.com/locknessland/lockness-monorepo/issues/275) is closed. This is the feature's core.

## Phase 6 — US4: an operator can see it happening (P2)

- [X] T035 [P] [US4] Write the failing tests in `packages/redis/tests/subscriber.test.ts` — the failure WARN names the attempt count and the next delay; the **recovery** line names attempts and elapsed time
- [X] T036 [US4] Implement both log lines in `packages/redis/subscriber.ts` through the existing encoder pair — `safeForLog(hostname)` and `renderError(error)`, as at `subscriber.ts:253-257`. FR-005/FR-016. [#277](https://github.com/locknessland/lockness-monorepo/issues/277) exists because the realtime package skipped this pair; do not repeat it here
- [X] T037 [US4] Add the cleartext-`AUTH` notice to the failure WARN when `tls` is false and a password is set — **location and kind only, never a value**. The constructor's one-time warning (`connection.ts:144-155`) has long scrolled away by the time a retry loop is running. FR-005, security S5
- [X] T038 [US4] Write the test proving the notice fires only for `tls: false` **and** a password set — and that it carries no password bytes

## Phase 7 — Polish & cross-cutting

- [X] T039 [P] Widen `RedisBroadcastDriver.fromConfig`'s parameter in `packages/realtime/drivers/redis.ts:527-532` to carry the four cadences, so they are reachable from the only production construction path. Q3, architect A6
- [X] T040 [P] Document the cadences and the backoff policy in `packages/redis/README.md` — **named** (`keepaliveMs`, `livenessMs`, `retryBaseMs`, `retryMaxMs` and their defaults appear literally), not merely described. FR-009
- [X] T041 [P] Add the live-broker test in `packages/realtime/tests/` or `packages/redis/tests/` (gated by `LOCKNESS_REDIS_INTEGRATION=1`, per [#273](https://github.com/locknessland/lockness-monorepo/issues/273)'s harness) proving a real broker's subscribe-mode `PING` reply keeps the socket alive across more than one liveness window
- [X] T042 [P] Update `packages/redis/AGENTS.md` with the liveness/retry behaviour and the new pitfall: **every writer goes through the write path**
- [X] T043 Add the [#283](https://github.com/locknessland/lockness-monorepo/issues/283) interaction note to `packages/realtime/AGENTS.md` or the issue itself — removing the churn removes an accidental load shedder for the control replay store, so the store's fill rate moved adversely
- [X] T044 Run `deno task deps:analyze` and regenerate anything it reports; no new package edge is expected, but the handshake-deadline change touches `connection.ts`
- [X] T045 **The gate**: `deno fmt && deno lint && deno check && deno task test`, plus `deno task test -- --trace-leaks` for SC-004 and `deno task test:redis` if a broker is reachable
- [X] T046 Run `deno task agents:brief --check` — a non-`.test.ts` module added to a package lands in its source inventory and in no human-read Markdown otherwise

---

## Dependencies

```text
Phase 1 (T001)
  └─> Phase 2 (T002-T013)  ← BLOCKING: the harness and the three structural fixes
        ├─> Phase 3 US1 (T014-T019)   keepalive          [MVP]
        ├─> Phase 4 US2 (T020-T023)   half-open detection
        │     └─ needs T016 (the liveness deadline is what US2 measures)
        ├─> Phase 5 US3 (T024-T034)   the retry          [the core]
        │     └─ needs T007 (#discardSocket) and T011 (all patterns)
        └─> Phase 6 US4 (T035-T038)   observability
              └─ needs T026 (the attempt counter)
                    └─> Phase 7 (T039-T046)
```

**US1, US2 and US3 are independently testable** once Phase 2 lands. US4 is the only story with a
hard dependency on another story's implementation (T026).

## Parallel opportunities

- **Phase 2**: T002 ∥ T003 ∥ T004 ∥ T006 ∥ T008 ∥ T010 ∥ T013 — six different files or six
  independent test bodies. Their implementations (T005, T007, T009, T011, T012) then serialize on
  `subscriber.ts`.
- **Phase 5**: T024 ∥ T028 (different failure modes, different harness verbs).
- **Phase 7**: T039 ∥ T040 ∥ T041 ∥ T042 — four distinct files.

## Implementation strategy

**MVP is Phase 1 + 2 + 3** — the churn stops and [#274](https://github.com/locknessland/lockness-monorepo/issues/274)'s first AC is met. It is a checkpoint inside the
full path, not a fork: [#275](https://github.com/locknessland/lockness-monorepo/issues/275) is the primary issue and Phase 5 is what closes it.

**Phase 2 is not optional and not deferrable.** Three of its tasks (T007, T009, T011) are fixes to
defects the audits found *in the fix itself* — shipping the retry without them recreates the outage
this feature exists to remove.

**Total**: 46 tasks — 1 setup, 12 foundational, 6 US1, 4 US2, 11 US3, 4 US4, 8 polish.
