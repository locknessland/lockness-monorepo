# Plan: Command-path resilience — backoff after a discard, and a bounded outbound frame

**Branch**: `250-command-path-resilience` | **Date**: 2026-09-06 | **Backlog items**:
[#299 — a forced discard re-dials with no backoff, re-sending AUTH in cleartext](https://github.com/locknessland/lockness-monorepo/issues/299) ·
[#300 — there is no write-side frame-size bound](https://github.com/locknessland/lockness-monorepo/issues/300)

**Two items, one branch, and they are one finding.** Both are halves of the security audit's S3 on
#297, split only so each had an owner. They are coupled in the direction that matters: #300 removes
one of #299's *triggers* — a legitimately large write that outlasts the budget, times out, and
forces the discard that starts the churn. Fixing the churn without the frame bound leaves a
legitimate operation failing slowly instead of quickly; fixing the bound without the churn leaves a
hostile broker driving the loop anyway.

---

## 1. Why this exists

#297 bounded the command path's write leg. That was strictly better than the unbounded hang it
replaced, and it changed the failure *shape*: a timed-out write raises `RespFramingError`,
`client.ts:198` discards the socket, and the very next command calls `connect()` and dials again.

**Nothing between `RedisClient` and `AuthenticatedConnection` has a backoff or a circuit breaker.**
Measured, not assumed: `grep -n 'backoff\|jitter' packages/redis/client.ts packages/redis/connection.ts`
returns nothing.

So a wedged or hostile broker — or a machine-in-the-middle on a plaintext link — drives a
discard/re-dial loop at the application's command rate. Each cycle re-runs the handshake, and `tls`
defaults to `false` (`connection.ts:310`), so each cycle puts another `AUTH` frame on the wire in
cleartext. This codebase already treats that as a security consequence rather than a nuisance:
`subscriber.ts:724` **already emits** the warning `'(AUTH is being re-sent in cleartext on every
attempt — tls is off)'` — on the subscribe path. The command path has neither the cadence nor the
warning, and that asymmetry is the argument.

**And there is no bound on an outbound frame at all.** `MAX_BULK_BYTES` (10 MiB) and
`MAX_REPLY_BYTES` (32 MiB) bound **replies**. After #297 the exchange's time budget —
`READ_TIMEOUT_MS`, 30s — became the only limit on how large a command frame can be, which makes the
effective maximum a function of link speed rather than a number anyone chose. `writeFrame`'s own
docstring records the measurement: an 8 MiB write returned about 320 KB against a slow reader. So on
a slow or cross-region link a legitimately large `SETEX` — a session blob, a queue job body, both
partly influenced by application data — fails after 30 seconds *and a socket discard*, where it
should fail immediately and say why.

The subscribe connection solved the cadence half already, in #275 and again in #286. This is the
same discipline, on the connection that never got it.

## 2. User scenarios

### US1 — A wedged broker cannot be driven into a re-dial loop (P1)

**Given** a broker that accepts the connection and then stops draining
**When** an application issues commands in a tight loop
**Then** the dial count stays bounded by the backoff rather than tracking the command rate, and each
refused attempt fails the caller **fast** rather than making it wait out a timer.

### US2 — A caller behind backoff gets an error, not a hang (P1)

**Given** a connection inside its backoff window
**When** a command is issued
**Then** it rejects immediately, naming the wait remaining — the whole point being that this path is
**pull-based**: the subscribe connection schedules its own retry and nobody is waiting, whereas here
a caller is holding a promise.

### US3 — Backoff resets on a connection proved healthy, not merely opened (P1)

**Given** a broker that accepts the dial and then wedges
**When** the client re-dials
**Then** the streak does **not** reset on the dial succeeding, because a connect-fault-connect-fault
loop would zero its own backoff on every pass and never grow. `subscriber.ts` records exactly this
("Proof the socket WORKS, which an activation completing is not") and this must not re-learn it.

### US4 — An oversized frame is refused before the write begins (P1)

**Given** a command whose encoded frame exceeds the bound
**When** it is issued
**Then** it fails immediately, naming the limit and the actual size, without touching the socket and
without forcing a discard.

### Edge cases

- **A frame just under the limit** must still write. A bound that cannot be approached is a bound
  set wrong.
- **The error naming the size** must not name a command argument, and must not name a length from
  which an argument's length is recoverable — #297's constraint, established because the `AUTH`
  frame's length discloses the password's.
- **`close()`'s `QUIT`** must not be refused by backoff. Shutting down is not a retry.
- **The first failure** must not be delayed: backoff starts *after* a failure, so attempt one is
  immediate or the fix costs latency on every cold start.
- **Concurrent commands** all queue behind `commandTail`, so a single failure must not multiply into
  N counted attempts — `subscriber.ts` records that exact defect ("a second concurrent failure
  folding into a pending chain still bumped the count").

## 3. Requirements

- **FR-001**: The backoff **state** — streak, window, cadence — lives in `RedisClient`, **not** in
  `AuthenticatedConnection`. Only the **curve** is shared, as a pure function in a new
  `packages/redis/backoff.ts`. An earlier draft put the guard in `connect()`, which
  `RedisSubscribeConnection` also calls (`subscriber.ts:609`), and put the reset in `client.ts`,
  which the subscriber never calls — so the subscribe connection's streak would only ever grow, pin
  at `retryMaxMs` after ~8 failures, and stay there for the life of the process. That is #275's
  permanent deafness, recreated in a file §8 marked untouched. `connection.ts:24-28` already
  disclaims this responsibility: *"Each consumer owns its own command discipline… this primitive
  owns only the socket's birth and its self-healing death."*
- **FR-002**: The curve is full-jitter exponential —
  `ceiling = min(retryMaxMs, retryBaseMs * 2 ** (attempts - 1))`, `delay = max(1, floor(random *
  ceiling))` — identical to `subscriber.ts`'s. One home for the shape; separate state per consumer,
  because the two have genuinely different policies (one schedules, one rejects).
- **FR-003**: A refused attempt **rejects immediately**, naming the milliseconds remaining. It does
  not sleep. The subscribe path schedules and nobody waits; here a caller holds the promise.
- **FR-004 — "proved healthy" means SURVIVAL, not arrival.** The streak resets only when the socket
  that completed an exchange has been live **longer than the delay that produced it**. An earlier
  draft said "one completed exchange", which cites half of the precedent and drops the other half:
  `subscriber.ts:668-669` guards recovery with *"Survival, not arrival"*, and `:221-229` records why
  — *"a throttle that resets itself is not a throttle."* Without the survival condition a broker
  answering `+OK` once per cycle pins the ceiling at `retryBaseMs`: ~8 dials a second, ~8 cleartext
  `AUTH` frames a second, forever, from a five-byte reply. An in-sync `RespServerError` **does**
  count as proof — the reply was fully drained and `client.ts:198` deliberately keeps the socket.
- **FR-005**: The attempt counter increments in one place, **inside** the "may I dial" guard's
  not-refused branch. `command()` chains on `commandTail`, so queued commands call `connect()`
  strictly sequentially and the `pending` single-flight never merges them — without this, one outage
  counts N times. The one genuinely concurrent path is a consumer calling `connect()` directly
  alongside a queued command, where `pending` does collapse two callers into one dial.
- **FR-006**: The refusal is logged once per window, carrying the cleartext-`AUTH` warning when
  `tls` is off, plus the client's `disposableName` so an operator can tell **which** shared client is
  refusing. The cause goes through `renderError` and the hostname through `safeForLog` — never the
  raw error: a `RespFramingError` can carry up to `MAX_LINE_BYTES` of peer bytes, and it is
  `renderError`'s 200-char truncation plus `safeForLog` that makes the line safe.
- **FR-007**: `close()` bypasses backoff. This is a **placement constraint, not a mechanism**:
  `close()` reaches the socket via `this.conn.socket` and never calls `connect()`, so it is already
  true — and it breaks only if the guard is put in `command()` or `exchange`. SC-005 is a regression
  tripwire that passes on day one.
- **FR-008**: An oversized frame is refused inside **`encodeCommand`**, before the allocation. Not
  in `exchange`: by then `encodeCommand` has already run `new Uint8Array(total)` (`resp.ts:255`), so
  a 500 MB argument costs 500 MB of heap and is *then* told it was too large — the refusal becomes
  the memory event it exists to prevent. `encodeCommand` computes `total` before allocating, and it
  is pure, so §5's objection to `writeFrame` (a check there implies a wire fault and a discard) does
  not transfer.
- **FR-009**: The refusal raises `RespCommandTooLargeError`, which extends `RespError` but **not**
  `RespFramingError` — **and `client.ts:198`'s routing is widened to exempt it.** Without that
  exemption the refusal discards a healthy authenticated socket, because that line's rule is
  "everything that is not a `RespServerError` is a desync". FR-008's "must not touch the socket" is
  unachievable by throwing alone.
- **FR-010**: `MAX_COMMAND_FRAME_BYTES` is **derived from `MAX_BULK_BYTES`**, never an independent
  literal, with `MAX_COMMAND_FRAME_BYTES <= MAX_BULK_BYTES` as a hard inequality. The payload survey
  an earlier draft asked for **cannot be conducted**: `session/drivers/redis.ts:163` and
  `queue/drivers/redis.ts:116` bound nothing, so any number chosen for them is the round number that
  draft forbade. The derivation that *is* available is a round-trip invariant — **a value this
  client writes must be one it can read back** — and a bound above `MAX_BULK_BYTES` produces a
  poison key: written successfully, then `RespFramingError` on every read (`resp.ts:676`), a
  discard, and a backoff window. That survives process restart, because the poison is in Redis. One
  inequality now; a data migration later.
- **FR-011**: The name is `MAX_COMMAND_FRAME_BYTES`, not `MAX_FRAME_BYTES`. `realtime/protocol.ts:47`
  already exports `MAX_FRAME_BYTES = 16 * 1024` meaning an inbound WebSocket frame, and
  `realtime/drivers/redis.ts` imports `@lockness/redis`, so both names would meet in one import
  namespace 640× apart in value.
- **FR-012**: The refusal message names the limit, the **verb**, and the size **rounded to a coarse
  bucket** — never the exact size, no per-argument length, no argument value. An exact frame size is
  a length derived from arguments and inverts, for a fixed arity, to their summed byte length: an
  attacker padding a field they influence inside a blob that also holds a secret reads the secret's
  length to the byte in one probe. `resp.ts:337-342` records #297 removing exactly this class.
  Bucketing drops the oracle's resolution from 1 byte to 1 MiB and leaves the operator everything
  actionable.
- **FR-013**: `retryBaseMs` and `retryMaxMs` are validated at construction — positive, finite,
  `retryMaxMs >= retryBaseMs`, and an upper bound on `retryMaxMs` — with the same `RangeError` shape
  `subscriber.ts:326` uses. Unvalidated, `NaN` makes `ceiling` `NaN`, `delay` `NaN`, `windowEnds`
  `NaN`, and `Date.now() < NaN` is **false**: the guard never fires and the backoff silently does not
  exist. The asymmetry matters — in `subscriber.ts` the same `NaN` reaches `setTimeout(cb, NaN)` and
  produces a *loud* hot loop; here it produces silence indistinguishable from health.
- **FR-014**: `packages/queue/worker.ts` gains a `try/catch` around its `pop()`. It has none
  (`:65`), so a rejected `pop()` escapes `start()` and terminates the worker. Today the broker must
  wedge ~30s first; under FR-003 it happens in milliseconds, and a restart supervisor then gives
  each restart a fresh `RedisClient`, a fresh streak, and an immediate cleartext `AUTH` — defeating
  the feature entirely for the queue. Of the four consuming surfaces this is the only one that
  breaks: the scheduler lock catches and skips, realtime is timer-paced and catches, session
  propagates to a request handler.
- **FR-015**: Every guard is mutation-verified, each mutant proved to have **compiled and executed**.

## 4. Success criteria

- **SC-001**: Against a wedged broker driven at high command rate, the dial count stays bounded —
  measured, and measured at the **deployment** rather than the object: a worker must survive the
  outage without the process restarting (FR-014), or the bound is true of a `RedisClient` and false
  of the thing running.
- **SC-002**: A command inside the window rejects in single-digit milliseconds, proving it did not
  sleep.
- **SC-003**: A peer alternating one `+OK` with one fault does **not** prevent the ceiling reaching
  `retryMaxMs` — the survival condition, measured as a dial count over a fixed interval.
- **SC-004**: A single failure with N commands queued counts as one attempt.
- **SC-005**: `close()` completes inside a backoff window.
- **SC-006**: A frame one byte over the limit is refused; a frame just under it writes; a value
  written at exactly the limit **reads back** without a discard; and the pathological argument is
  refused **without being encoded**.
- **SC-007**: After a refused oversized frame, the socket is the same object and the next command
  does not re-dial.
- **SC-008**: Two payloads of different sizes within the same bucket produce **byte-identical**
  messages. An equality, not an absence: `resp.ts:326-345` records that an absence assertion is
  exactly what let the previous length disclosure survive — *"guarded by a test that asserted only
  absences and so could not see it."*
- **SC-009**: A non-finite cadence throws at construction, not at the first fault.
- **SC-010**: The suites of the three declared consumers pass, plus core's scheduler-lock tests.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| The backoff **curve** | `packages/redis/backoff.ts` — one pure function | A second curve in `client.ts`. `subscriber.ts` can adopt it later under #298 with no behaviour change. |
| The backoff **state** | `packages/redis/client.ts` — streak, window, cadence | Any of it in `AuthenticatedConnection`, which `RedisSubscribeConnection` shares and which disclaims command-path policy at `connection.ts:24-28`. This row is the CRITICAL. |
| Whether a dial is allowed right now | `packages/redis/client.ts` — `#serializedExchange`, before `await this.connect()` | A guard in `connect()` (reaches the subscribe path) or in `exchange` (breaks `close()`). |
| **What counts as survival** | `packages/redis/client.ts` — generation age against the delay that produced it | Zeroing on any completed exchange, which a peer defeats with one `+OK` per cycle. |
| Where the attempt counter moves | `packages/redis/client.ts` — one increment inside the not-refused branch | Incrementing at each failure site; incrementing before the guard. |
| **What arms the window** | `packages/redis/client.ts` — a *faulted* exchange | `discard()` itself, which is also called on the clean `close()` path (`client.ts:244`) and by the subscriber (`subscriber.ts:510`). Two of its three callers are not faults. |
| The largest outbound frame | `packages/redis/resp.ts` — `MAX_COMMAND_FRAME_BYTES`, **derived from** `MAX_BULK_BYTES` | A second independent literal, which lets a write succeed that no read can recover. |
| Where an oversized frame is refused | `packages/redis/resp.ts` — `encodeCommand`, before the allocation | `exchange` (too late — already allocated) or `writeFrame` (implies a discard). |
| **Which faults imply a discard** | `packages/redis/client.ts` — `#serializedExchange`'s catch | Assuming the throw site determines the obligation. A new error type is, by that line's current rule, a desync. |
| What these messages may carry | `packages/redis/resp.ts` and `client.ts` — verb, limit, bucketed size | Any argument, or any length derived from one at byte resolution. |
| Where the refusal is logged, and what it carries | `packages/redis/client.ts` — one line per window | A second copy of the cleartext-`AUTH` sentence; `${error.message}` instead of `renderError`. |

## 6. Technical context

**Language/Version**: TypeScript on Deno
**Primary Dependencies**: `@lockness/contract` for `safeForLog`/`renderError`
**Testing**: `deno test`, `packages/redis/tests/`, the live-broker suite, and the mutation battery
**Constraints**: `@lockness/redis` is declared by **three** packages — realtime, session, queue —
plus `@lockness/core`, which consumes it *structurally* (`core/scheduler/locks.ts` duck-types
`RedisCommandClient` and imports nothing). `@lockness/cache` is **not** a consumer; it declares its
own unrelated `RedisClient` for `npm:redis`. `RedisClient.command` has **35** non-test call sites
across those four surfaces — realtime 19, queue 10, session 4, core 2 — not the 92 an earlier draft
gave, which was a grep including tests and unrelated `.command(` hits. The `onReconnect` seam is not touched (#290 owns its timing), and `subscriber.ts` is not
touched (#298 owns its state shape).
**Scale/Scope**: 3 production files, 2–3 test files

### Domain model

- **Attempt streak** — consecutive failures since the last proved-healthy exchange. Invariant: it
  advances once per *window*, not once per failure, because concurrent callers share one window.
- **Backoff window** — the interval during which a dial is refused. Invariant: a caller inside it is
  **rejected**, never parked.
- **Proved healthy** — one completed exchange. Invariant: a completed *dial* is not proof, because
  the failure this guards against is a socket that opens and then wedges.
- **Frame bound** — the largest encoded command. Invariant: checked before the socket is touched, so
  its refusal implies no discard.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1–4, 6, 8 | pass | No hono, no new dependency, no `any`, no UI, no lockfile, adapter layer only. |
| 5. Pre-completion gate | pass | Widened to all five consumers. |
| 7. JSDoc on public APIs | pass | `RedisClientConfig` gains cadence options; `exchange`'s `@throws` changes. |
| 9. One category per commit | pass | `fix(299)`, `fix(300)`, `test`. |
| TDD | pass | SC-001 and SC-006 are failing tests first. |
| No silent catches | pass | No new catch. |

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `RedisClientConfig` | **yes** | Gains `retryBaseMs` / `retryMaxMs`, defaulted to the subscribe connection's values so nothing needs configuring. |
| `RedisClient.command` behaviour | **yes** | Can now reject with "backing off" or "frame too large" where it previously dialled or wrote. |
| `exchange` | **yes** | Refuses an oversized frame before the write. |
| `AuthenticatedConnection.connect()` | **yes** | Can refuse. Its `@throws` changes. |
| Five consuming packages | no API change | A previously-unbounded re-dial becomes bounded; an oversized write fails fast. Their suites are the check. |
| `subscriber.ts` | **no** | It has its own cadence already and #298 owns its state shape. |

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| Backoff delays a legitimate recovery after a transient blip | Full jitter starting at `retryBaseMs` (250ms by default), and FR-003 resets on the first proved-healthy exchange. |
| A caller sees a new error class it does not handle | It already had to handle a rejected `command()`; this is a different message, not a different contract. The five suites are the check. |
| `MAX_FRAME_BYTES` set too low rejects working writes | FR-008 requires the derivation, not a round number. SC-006 asserts a frame just under it still writes. |
| The reset seam is forgotten by a future caller | FR-003 puts it in `client.ts`'s one exchange path, which is also the only place a completed exchange is observable. |

## 10. Architecture audit

*`architect-expert`. Verdict: **fail** — 1 critical, 4 high, 1 medium, 3 low.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | **CRITICAL** — a guard in `AuthenticatedConnection.connect()` reaches the subscribe path, whose streak nothing would reset | **Verified independently**: `subscriber.ts:609` calls `this.conn.connect()`, `:510` calls `this.conn.discard()`, and `subscriber.ts:144/149` *already* declares `retryBaseMs`/`retryMaxMs` on a config extending the shared base — so the names would forward its cadence into a second nested backoff. Its streak would only grow, pin at `retryMaxMs`, and stay: #275's permanent deafness, in a file §8 marked untouched. Plan changed: FR-001 moves the state to `RedisClient`; only the curve is shared. |
| A2 | HIGH — the frame check in `exchange` refuses only after `encodeCommand` allocated the frame | Plan changed: FR-008 moves it into `encodeCommand`, before `new Uint8Array(total)`. The audit noted the plan asked the right question — §5 rejected `writeFrame` correctly — and answered it one function short. |
| A3 | HIGH — FR-007's "actual size" is the disclosure #297 removed, while FR-009 asserted nothing changed | Plan changed: FR-012, coarse buckets. Both seats reached this independently. |
| A4 | HIGH — the payload survey FR-008 demanded **cannot be conducted** | **Verified**: `session/drivers/redis.ts:163` and `queue/drivers/redis.ts:116` bound nothing. Plan changed: FR-010 derives the bound from `MAX_BULK_BYTES` via the round-trip invariant instead. |
| A5 | HIGH — `queue/worker.ts:65` has no `try/catch`, so a fast rejection kills the worker and a restart supervisor resets the backoff | **Verified**. Plan changed: FR-014 adds it to scope, and SC-001 now measures at the deployment. The audit's point stands on its own — of four consuming surfaces this is the only one that breaks, and it breaks in the direction that defeats the feature. |
| A6 | MEDIUM — "proved healthy" cites half its precedent | Same as S1; folded once into FR-004. |
| A7 | LOW — FR-006 described a property the code already has | Plan changed: restated as a placement constraint, with SC-005 as a tripwire. |
| A8 | LOW — `MAX_FRAME_BYTES` already exists in `realtime/protocol.ts:47` meaning something else, and realtime imports redis | **Verified**. Plan changed: FR-011 renames it. |
| A9 | LOW — "five consuming packages" names a set that does not exist | **Verified**: three declared manifests; core consumes structurally; `@lockness/cache` declares its own unrelated `RedisClient` for `npm:redis`. Corrected in §6, §8, SC-010. |

**Also answered, and not a finding**: the `pending` single-flight does **not** collapse concurrent
command failures, because `commandTail` makes queued commands call `connect()` strictly
sequentially — so FR-005 is not redundant, and the increment must sit inside the not-refused branch
rather than at the top.

**Verdict**: fail. **Coverage** — and the audit stated its gaps explicitly, which is why they are
repeated here rather than glossed: it did **not** read the existing test suites, so it cannot say how
many tests A1's relocation moves nor whether `fake_server.ts` can drive a wedged broker for SC-001;
it did not read the #248 mutation battery, so FR-015 is unassessed; it read `resp.ts` only to line
380; and #290's body only to its mechanism section, so A1's relocation was not traced against it.

## 11. Security audit

*`security-expert`. Verdict: **fail** — 2 high, 4 medium, 2 low.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | HIGH — the reset seam is peer-controlled: five bytes pin the ceiling at its floor | **Verified independently** at `subscriber.ts:668-669`. The plan quoted one half of the precedent and dropped *"Survival, not arrival"* four lines away. At the 250ms default that is ~8 dials and ~8 cleartext `AUTH` frames per second, forever. Plan changed: FR-004. |
| S2 | HIGH — the refusal will discard the socket it promises not to touch | **Verified** at `client.ts:198`. "Everything that is not a `RespServerError` is a desync" makes a new error type a desync by construction, so FR-008's promise was unachievable by throwing alone. Plan changed: FR-009 adds the routing exemption and a `RespError`-but-not-`RespFramingError` type. |
| S3 | MEDIUM — the exact size is a 1-byte-resolution length oracle | Same as A3. Folded into FR-012, with the seat's constraint: verb, limit, bucketed size. |
| S4 | MEDIUM — the bound is unconstrained against `MAX_BULK_BYTES`, permitting a **stored poison pill** | **Verified** at `resp.ts:676`. Written successfully, unreadable forever, surviving process restart because the poison is in Redis. Plan changed: FR-010's hard inequality and SC-006's read-back clause. One inequality now; a data migration later. |
| S5 | MEDIUM — the check runs after `encodeCommand` allocated ~2× the payload | Same as A2. The seat added the pre-encode lower bound: `Σ args[i].length` in UTF-16 units is a sound lower bound on UTF-8 byte length, so it refuses with zero false positives and zero allocation. |
| S6 | MEDIUM — the new cadence has no validator, and `NaN` fails the backoff **open**, silently | Plan changed: FR-013. The asymmetry is the sharp part — the same `NaN` is loud on the subscribe path and silent here. |
| S7 | LOW — FR-005 did not say what the log line may carry | Plan changed: FR-006 names `renderError`/`safeForLog` and the `disposableName`. |
| S8 | LOW — cadence sits outside `redisMemoKey`, so one poisoned command refuses every consumer sharing the memoized client | Plan changed: recorded, with SC-001 extended to the blast radius. Not adding cadence to the key is correct — it does not change identity — but the consequence must be stated. |

**Positive results worth recording:**

- **Backoff moves no authorization decision.** `AUTH`/`SELECT` run inside `connect()`'s single-flight
  closure and only on a fresh dial; refusing to dial cannot skip a handshake that never starts.
- **The read side is already bounded at five places** and this changes none of them.
- **The cleartext-`AUTH` warning carries no password** (`connection.ts:317-324`), confirmed.
- **`Math.random()` for jitter is not a finding** — a thundering-herd control, not a secret, and
  `subscriber.ts:723` already uses it. Recorded so it is not re-raised.
- **`close()`'s bypass needs no mechanism** — reached the same conclusion as A7 independently.

**Coverage**: the plan whole; `connection.ts`, `client.ts`, `resp.ts`, `memo.ts`, `sanitize.ts`, and
`subscriber.ts`'s retry/recovery/cadence methods. **Not covered**: the five consumers' 92 command
call sites, so S2's and S3's reachability from user-influenced payloads is argued from the plan's
description rather than a traced path; `09-design-and-business-logic.md` not loaded.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1** — FR-014 puts `packages/queue/worker.ts` in this branch. It belongs to neither issue and is a different package. Include it, or file it? | **Fix it here**, as its own `fix` commit citing #299's AC 5 — which explicitly asks that the four consumers' timing assumptions be checked, and this is the check failing. Filing it would ship #299 not achieving its security objective for one of its four surfaces: the worker would die faster than it does today and each supervised restart would reset the backoff it exists to establish. | 2026-09-06 |

### Corrected during implementation

Two things the tests found that neither audit did, both recorded because both
were the code being wrong rather than the tests:

- **The first fault opened a window**, so a single transient blip refused the
  next command — contradicting §2's own edge case. Two session tests caught it.
  The first fault now re-dials immediately; the second opens the window.
- **The survival threshold floored at the last delay**, which is `0` before any
  window exists — so any completed exchange reset the streak, which is exactly
  the defeat FR-004 was written to prevent, reintroduced by FR-004. Floored at
  the base cadence.

### Decided without asking

- **Reject rather than sleep**: the subscribe path schedules and nobody waits; here a caller holds
  the promise.
- **The state moves to `RedisClient`; only the curve is shared.** This contradicts the first draft's
  anti-duplication argument, and the audit's answer is right: it separates the curve (one home) from
  the state (per-consumer, because one schedules and one rejects).
- **Survival, not arrival**, and an in-sync `RespServerError` counts as proof.
- **Two issues, one branch** — #300 removes a trigger of #299, and they share three files and the
  disclosure rule.
