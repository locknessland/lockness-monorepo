# Plan: Bound the command path's write leg

**Branch**: `249-command-write-deadline` | **Date**: 2026-09-06 | **Backlog item**:
[#297 — Redis: the command path's write leg is still unbounded](https://github.com/locknessland/lockness-monorepo/issues/297)

---

## 1. Why this exists

#286 bounded the **subscribe** connection's write leg. The **command** path still carries the
identical defect, and the reason it was left is recorded rather than assumed: the plan for #286
answered its Q1 with "subscribe path only", because a *defaulted* `writeFrame` deadline would have
reached every caller invisibly. Deliberate scoping, not an oversight — and the residual was filed
the same day.

`exchange` (`packages/redis/connection.ts:108-116`) is:

```ts
return writeFrame(conn, encodeCommand(args)).then(() =>
    timeoutMs === undefined ? readReply(conn) : readReply(conn, timeoutMs)
)
```

Its `timeoutMs` reaches the **read leg only**. `writeFrame` is called with two arguments, so its
optional deadline is `undefined` and the loop is unbounded. A peer that accepts the connection and
then stops draining leaves `RedisClient.command` suspended: no error, no timeout, no log line.

**Who hangs.** Counted by `grep -rl '@lockness/redis' packages/ app/ config/` — five packages, and
four of them reach `writeFrame` through this function: `@lockness/session` (every session read and
write), `@lockness/queue` (every job push and pop), `@lockness/core` (the scheduler's distributed
lock), `@lockness/realtime` (the revocation index). A wedged-but-alive broker hangs each of them
indefinitely, and a hung scheduler lock is a scheduler that never runs again.

**The trap this issue must not be "fixed" by.** Defaulting `writeFrame`'s parameter. That reaches
`AUTH`, `SELECT` and `QUIT` as well, and — worse — bypasses the handshake's `#remaining(deadline)`
threading, whose own docstring records why it exists: *"Applied per step it multiplied: the dial,
`AUTH` and `SELECT` each got the full value, so a stalling peer cost up to three times the
configured window."* For the subscribe connection that takes the handshake's worst case from 45s to
about 105s, back outside the window #274 exists to keep it inside. `packages/redis/AGENTS.md`
already records this as a **recurring** misreading — including in #274's own body.

## 2. User scenarios

### US1 — A command against a wedged broker fails instead of hanging (P1)

**Given** a broker that accepts the connection and then stops draining bytes
**When** an application issues any `RedisClient.command`
**Then** the call rejects within a bounded time, the socket is discarded, and the caller sees an
error naming the stall — rather than a promise that never settles.

### US2 — The handshake keeps ONE budget across all its steps (P1)

**Given** `handshakeTimeoutMs` configured
**When** the dial, `AUTH` and `SELECT` each run
**Then** the total is still bounded by that one value — a write leg gaining a deadline must not
reintroduce the per-step multiplication #274 removed.

### US3 — Nothing else changes (P1)

**Given** the four consuming packages
**When** their suites run
**Then** they pass unchanged. This is a bound on a path that previously had none; a healthy write of
a small frame completes in microseconds, so no correct caller can notice.

### Edge cases

- **A write that consumes most of the budget.** The read then gets what is left, which is the point
  of one budget — but it means a command whose write took 29s of a 30s budget has ~1s to read. That
  is a change in shape from "unbounded write, then a full read window", and it is the intended one.
- **`timeoutMs` omitted entirely** (`RedisClient.command` today). The whole exchange takes
  `READ_TIMEOUT_MS` as its budget, so the read leg keeps exactly the ceiling it has now and the
  write leg gains that same ceiling as its own worst case.
- **A budget already expired when a leg starts.** Must fail rather than pass `0` or a negative value
  into a deadline, which `writeFrame` refuses with a `RangeError` (#286's FR-010).
- **`QUIT` during `close()`** (`client.ts:233`) — already wrapped so a failure does not block the
  close; it must stay that way when the write can now time out.

## 3. Requirements

- **FR-001**: `exchange` computes **one deadline** at entry and gives each leg the time remaining
  against it, so the write and the read share a single budget rather than each receiving the full
  value.
- **FR-002**: The seam carries an **instant, not a duration**. `exchange` takes an optional
  `deadline` typed as a branded epoch-ms value, so `exchange(conn, args, 5000)` — which today
  compiles and would mean an instant in 1970 — stops compiling. §6's domain model already says the
  distinction is the whole point; an earlier draft then kept `timeoutMs?: number` and converted
  instant → duration → instant at every crossing. The handshake stays bounded today **only because
  both call sites recompute `#remaining` on the line before the call**; the moment one hoists it —
  a retry loop, a batch, or #298's generation object carrying a budget — the multiplication #274
  removed comes back silently. Four in-repo call sites and an unpublished package is the cheapest
  this will ever be.
- **FR-003**: `remaining(deadline)` returns the **raw signed difference**, and each call site
  decides what a non-positive answer means. This is the correction to an earlier draft that said
  "one home for how long is left": `#remaining` clamps with `Math.max(1, …)` and so can never report
  *expired*, which made FR-005's guard unreachable and its mutation a guaranteed survivor. `#dial`
  keeps its clamp; `exchange` treats non-positive as a fault. "How long is left" and "what to do when
  the answer is none" are two decisions, and merging them is what hid this.
- **FR-004 — two write budgets, because they measure different frames.**
  - The **handshake's** write legs take `min(remaining, WRITE_STALL_CEILING_MS)`. `AUTH` and
    `SELECT` are ~40-byte frames, exactly what that constant was created for. Without this, one
    subscribe socket gives its ~40-byte `PSUBSCRIBE` write 5s and its ~40-byte `AUTH` write up to
    45s — `handshakeTimeoutMs` defaults to `livenessMs` — which is the same coupling
    `WRITE_STALL_CEILING_MS`'s own docstring was written to prevent, reintroduced one function away
    and landing on the credential-carrying frame.
  - The **command** path's write leg takes the full remaining budget. Its frames are not ~40 bytes:
    a `SETEX` of a session blob or a queue payload can be megabytes, and `writeFrame`'s docstring
    records ~320 KB accepted against a slow reader. Sharing the 5s ceiling would reject legitimate
    large writes.
  - The constant moves to `resp.ts` beside `READ_TIMEOUT_MS`, so "how long a frame may take to
    reach the socket" has one home rather than living in `subscriber.ts` and being imported
    upward.
- **FR-005**: A leg that starts with **no time left** raises `RespFramingError` from `exchange`,
  before either leg runs — **not** `RangeError`. §5 says the discard obligation is carried by the
  type, `subscriber.ts:601` routes *positively* on `RespFramingError`, and the comment above that
  line records this exact gap as a live defect already fixed twice. `writeFrame`'s `RangeError`
  stays for what it is for: a caller passing `NaN` or a negative, which is a programming error and
  not a deadline outcome.
- **FR-006**: When no deadline is given, the exchange's budget is `READ_TIMEOUT_MS`, exported from
  `resp.ts` for internal import rather than copied as a literal into `connection.ts` — it is
  module-private today, and the two available routes are "export it" or "write `30_000` in a second
  file", the latter being the duplication the row below forbids. It is **not** added to `mod.ts`.
- **FR-007**: A write-leg error message may name the command **verb**, never an argument and never a
  length derived from one. `writeTimeout` interpolates `frame.byteLength`, which for
  `encodeCommand(['AUTH', pw])` is an invertible function of the password's byte length — measured:
  8/16/32/64-byte passwords give 28/37/53/85-byte frames, and the rendered message is 169
  characters, so `renderError`'s 200-char cap does **not** truncate it away. Unreachable today
  because the handshake's write cannot time out; **this feature is what creates the path**, and
  `connection.ts:20` currently asserts in prose that the raw password never appears in an error.
  The offset alone already tells an operator the write made no progress.
- **FR-008**: `handshakeTimeoutMs` is validated in `AuthenticatedConnection`'s constructor with the
  same `RangeError` shape `#assertCadences` uses. It is unchecked today, so `NaN` yields a `NaN`
  deadline, `setTimeout(…, NaN)` fires immediately, and every handshake fails instantly with "after
  NaNms" — a misconfiguration presenting as a broker outage. This branch is what routes that
  unvalidated number into a **second** consumer, which is why it belongs here.
- **FR-009**: The handshake's total stays bounded by `handshakeTimeoutMs` across dial + `AUTH` +
  `SELECT`, write legs included. Quantifies over **every** step; the enumerating search is
  `grep -n 'exchange(' packages/redis/connection.ts`.
- **FR-010**: A timed-out write on the command path discards the socket. Verified, not assumed:
  `RespFramingError` and `RespServerError` are siblings under `RespError`, and `client.ts:198`
  routes *negatively* (`!(error instanceof RespServerError)`), so a write-leg framing error
  discards. The test is what says the wiring holds.
- **FR-011**: `writeFrame`'s parameter stays **optional**, and `exchange` remains the only place
  that decides a budget. Nothing gains a default that reaches callers who did not ask.

## 4. Success criteria

- **SC-001**: A command issued against a socket that never drains rejects within the budget, and the
  connection is discarded so the next command re-dials.
- **SC-002**: The handshake against a stalling peer completes or fails within `handshakeTimeoutMs`
  in **total** — measured, not reasoned — with the write legs bounded.
- **SC-003**: The handshake's write legs are bounded by the ceiling, not by the window: a stalled
  `AUTH` write against a 45s `handshakeTimeoutMs` fails at the ceiling.
- **SC-004**: A read whose write completed promptly still gets essentially the full
  `READ_TIMEOUT_MS`. The read leg's ceiling **does** fall by whatever the write consumed — an
  earlier draft claimed it was unchanged and §2's own edge case contradicted it two sections later.
- **SC-005**: An exhausted budget fails as a `RespFramingError` before either leg, and the mutation
  removing that guard is **killable** — which it is only because FR-003 dropped the clamp.
- **SC-006**: No error message reaching a caller or a log contains a command argument or a length
  derived from one, asserted for `AUTH` specifically.
- **SC-007**: `close()` is tested by calling `client.close()` **directly**. Driven through the
  shutdown sequence it would go green on that sequence's own 10s deadline and prove nothing.
- **SC-008**: All four consuming packages' suites pass unchanged.
- **SC-009**: Every guard is mutation-verified, each mutant proved to have compiled and executed
  before its result is recorded.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| How long is left against a deadline | `packages/redis/connection.ts` — one module-level `remaining(deadline)` returning the raw difference | The private `#remaining` staying beside it. Note it returns the **unclamped** value; the clamp moves to `#dial`, which is the only caller that wants one. |
| What an exhausted budget means | `packages/redis/connection.ts` — `exchange`, which raises `RespFramingError` before either leg | `writeFrame`'s `RangeError` being used as the signal; a caller comparing the number itself. |
| That one exchange has one budget | `packages/redis/connection.ts` — `exchange` | A caller pre-splitting a budget; `writeFrame` or `readReply` acquiring a default nobody chose. |
| **How long one frame may take to reach the socket** | `packages/redis/resp.ts` — `WRITE_STALL_CEILING_MS`, moved here from `subscriber.ts` | A second ceiling in `connection.ts`; the handshake inheriting `handshakeTimeoutMs` for its writes, which is the 9× asymmetry this row exists to stop. The **command** path deliberately does not use it — its frames can be megabytes — and that exemption is part of this decision, not a gap in it. |
| The command path's budget when none is given | `packages/redis/connection.ts` — `exchange`'s fallback to the imported `READ_TIMEOUT_MS` | `RedisClient` growing its own timeout option; `30_000` written as a literal in a second file. |
| That a timed-out write means "discard this socket" | `packages/redis/resp.ts` — the `RespFramingError` type | A second `instanceof` list at `client.ts`; a boolean flag on the error. |
| **What a write-leg error message may carry** | `packages/redis/resp.ts` — `writeTimeout` | Any interpolation of an argument or a length derived from one. `frame.byteLength` is such a length. |
| That a deadline is an instant | `packages/redis/connection.ts` — the branded `Deadline` type | `number` at the seam, which lets a duration be passed where an instant is meant. |

## 6. Technical context

**Language/Version**: TypeScript on Deno
**Primary Dependencies**: none beyond `@lockness/contract`
**Storage**: none
**Testing**: `deno test`, `packages/redis/tests/`, plus the live-broker suite gated on
`LOCKNESS_REDIS_INTEGRATION=1`
**Project Type**: framework library
**Performance Goals**: unchanged — one `Date.now()` per leg
**Constraints**: `exchange` is consumed by `RedisClient.command` (every Redis operation in four
packages) and by the handshake. `@lockness/redis` is unpublished, so no external caller exists.
**Scale/Scope**: 2 production files, 2 test files

### Domain model

No new entities. One value object gains a name:

- **Exchange budget** — the wall-clock allowance for one request/reply pair, fixed at entry and
  consumed by both legs. Invariant: **the sum of what the legs are allowed never exceeds it**, which
  is precisely what per-step application violated.
- **Deadline** — an epoch instant, not a duration. The distinction is the whole point: a duration
  passed to each step multiplies, an instant does not.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1. No direct `hono` import | pass | Not touched. |
| 2. JSR-only, declared per package | pass | No dependency change. |
| 3. No `any` in exported APIs | pass | `exchange` keeps its signature shape. |
| 4. Tailwind v4 syntax | pass | No UI. |
| 5. Pre-completion gate | pass | Widened to the four consumers. |
| 6. Never hand-edit `deno.lock` | pass | No dependency change. |
| 7. JSDoc on public APIs | pass | `exchange`'s `@param timeoutMs` and `@throws` both change. |
| 8. MVC layering | pass | Adapter layer only. |
| 9. One category per commit | pass | `fix` + `test`. |
| TDD | pass | SC-001 and SC-002 are failing tests first. |
| No silent catches | pass | No new catch. |

### Complexity tracking

No violations.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `exchange` signature | no | Same three parameters; `timeoutMs` now bounds the whole exchange rather than the read alone. |
| `RedisClient.command` behaviour | **yes** | Its write leg is bounded where it was not. A stalled write now rejects and discards instead of hanging. |
| Handshake behaviour | **yes** | Write legs join the one-budget accounting. The total is unchanged; what changes is that it is now actually enforced on both legs. |
| `writeFrame` / `readReply` | no | Neither gains a default. |
| `@lockness/session`, `queue`, `core`, `realtime` | no API change | A previously-unbounded hang becomes a bounded rejection. Their suites are the check. |

### Visual Prototyping with Claude Artifacts

Nothing to prototype — a deadline threaded through one function.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| **A wedged or hostile broker drives re-dial churn**, each cycle re-sending `AUTH` in cleartext (`tls` defaults to `false`) | Accepted and **filed**, per Q1. Bounded by the application's command rate rather than unbounded in time, and strictly better than the permanent hang it replaces. `AuthenticatedConnection` has no backoff and this branch does not add one — that is its own design. |
| **A legitimately large write now fails** where it used to succeed | The budget is 30s for a frame; `writeFrame`'s docstring records ~320 KB accepted against a slow reader, so this bites only on a link that was already failing the operation in practice. Named rather than mitigated, and the write-side frame-size bound is filed with it. |
| A slow-but-healthy write eats the read's budget | Only if the write takes a meaningful share of 30s, which for a small frame means the socket is already wedged. Named as an edge case, and SC-003 asserts the healthy case is unchanged. |
| The handshake's multiplication comes back through the write leg | FR-006 and SC-002 — measured against a stalling peer, not reasoned about. This is the specific regression the issue warns about. |
| A caller relied on an unbounded write | None can: the package is unpublished and every in-repo caller goes through `exchange`. |
| `close()`'s `QUIT` now fails where it silently hung | It is already wrapped so a failure does not block the close; the test must confirm that still holds rather than assume it. |

## 10. Architecture audit

*`architect-expert` against this document, before any code existed. Verdict: **fail** — 0 critical,
2 high, 5 medium, 1 low.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | HIGH — "how long may a write stall" has no row and no home; the plan derived it by accident from a READ constant, leaving one socket with two tolerances 9× apart | **Verified independently**: `handshakeTimeoutMs` defaults to `livenessMs` (45s) on the subscribe connection, while its `PSUBSCRIBE` write gets `min(45000, 5000)`. Same socket, same ~40-byte frame. Plan changed: FR-004 splits the two budgets, with the reason each way. The audit explicitly declined to share the constant with the command path — its frames can be megabytes — and that exemption is now part of the decision. |
| A2 | HIGH — `#remaining`'s `Math.max(1, …)` clamp makes the expired-budget guard unreachable, so its mutation is a guaranteed survivor | **Verified independently** at `connection.ts:304-307`. Plan changed: FR-003 returns the raw difference and each site decides; `#dial` keeps its clamp. Without this, SC-009's own "each mutant proved to have executed" would have certified a mutant that cannot execute. |
| A3 | MEDIUM — §5 named `connection.ts` as the home of a constant that lives unexported in `resp.ts`, inviting the literal to be copied one row below the row forbidding it | Plan changed: FR-006 names the route — export from `resp.ts`, not into `mod.ts`. |
| A4 | MEDIUM — FR-002 claimed one home for "how long is left" while creating the **third** spelling; the two in `resp.ts` hold the opposite expiry policy | Plan changed: the split in FR-003 makes the policy explicit rather than merged. |
| A5 | MEDIUM — FR-003 asserted the read leg's worst case was unchanged; §2's own edge case said otherwise two sections later | Plan changed: SC-004 states the change of shape. The audit is right that a legitimately slow multi-megabyte write can starve a read; FR-004's split bounds that for the handshake and names it for the command path. |
| A6 | MEDIUM — `close()`'s new QUIT bound is inert on the only path that registers it: the shutdown sequence's own 10s deadline (7.5s for hooks) fires first and abandons it | **Traced and accepted.** §9 no longer claims a behaviour change that cannot be observed, and SC-007 targets `client.close()` directly — a test driven through the sequence would go green on the sequence's deadline. |
| A7 | MEDIUM — the seam keeps a **duration** while §6 says the instant is the whole point; the invariant then rests on both call sites recomputing `#remaining` on the line before | Plan changed: FR-002 brands the deadline. This is the audit's answer to "what would a reviewer find three cycles from now", and it is the same story this package has already run three times — #274, #286→#297, #298. Four call sites and an unpublished package is the cheapest it will be. |
| A8 | LOW — `exchange` is exported from `mod.ts`; §8's "signature: no" was stated as a fact rather than a consequence of the package being unpublished | Plan changed: §8 records it, which is what makes A7 cheap to accept. |

**Verdict**: fail, on two HIGH — both folded in, both changing what the code must do. **Coverage**:
`plan.md` whole; `connection.ts` (405 lines), `client.ts` (249), `resp.ts` (743) whole;
`subscriber.ts` in the relevant ranges; `mod.ts`, `deno.json`, `AGENTS.md:60-105`;
`core/kernel/shutdown_sequence.ts` and `contract/lifecycle/disposables.ts` for the `close()` trace;
blast radius counted by `git grep`, exact. **Not covered**: the test files beyond grepping for call
sites, so nothing here says whether the current suite would catch any of it; nothing executed; and
the security surface of a bounded write, which is the parallel seat's and which found S3.

## 11. Security audit

*`security-expert`, in parallel. Verdict: **needs_followup** — 0 critical, 0 high, 3 medium, 3 low.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | MEDIUM — the handshake's write legs get up to 45s where 5s was already settled for the same socket, and the loosest bound lands on the credential-carrying `AUTH` frame | Same finding as A1, reached independently from the other side. Folded once, into FR-004. |
| S2 | MEDIUM — naming `RangeError` as the expired-budget signal; it does not carry the discard obligation §5 says lives in the type | Plan changed: FR-005. The seat's evidence is the sharpest kind — `subscriber.ts:601` routes *positively* on `RespFramingError`, and the comment above it records this same gap as a defect already found twice. Designing it back in a third time is what the audit stopped. |
| S3 | MEDIUM — the fix converts an unbounded hang into broker-controlled reconnect churn with no backoff, each cycle re-sending `AUTH` in cleartext (`tls` defaults to false); and there is no write-side frame-size bound | Escalated to **Q1** — it is the one finding with a real trade-off rather than an editorial fix. |
| S4 | LOW — the write-timeout message interpolates `frame.byteLength`, disclosing the password's exact byte length into consumer logs; **newly reachable because of this feature** | **Verified independently**: 8/16/32/64-byte passwords → 28/37/53/85-byte frames, invertible; the message is 169 characters and survives `renderError`'s 200-char cap. Plan changed: FR-007 and a §5 row. `connection.ts:20` asserts in prose that the password never appears in an error, which this would have made a half-truth. |
| S5 | LOW — `handshakeTimeoutMs` has no validator, and this plan widens where the unvalidated number lands | Plan changed: FR-008. `NaN` today fails every handshake instantly with "after NaNms" — a misconfiguration presenting as an outage. |
| S6 | LOW — FR-002 and FR-004 as first written were mutually unsatisfiable | Same as A2; resolved by FR-003's split. Two seats reached it independently. |

**Positive results worth recording:**

- **The read side is not weakened.** Every reply guard is a **size** check — `parseLength`,
  `MAX_LINE_BYTES`, `MAX_BULK_BYTES`, `MAX_ARRAY_ELEMENTS`, `MAX_REPLY_BYTES`, the CRLF terminator —
  and `resp.ts` says so deliberately ("on SIZE, not on time"). Shrinking the read window makes them
  more binding, never less. This was the thing most worth checking.
- **The authentication step does not move and cannot fail open.** `AUTH` still runs before
  `this.connection = conn`; a write timeout yields a rejected `connect()` and a socket never
  published.
- **No partial-frame retry exists.** `RespFramingError` and `RespServerError` are siblings, so
  `client.ts:198`'s negative routing discards; `command()` re-runs nothing. The
  surplus-parsed-as-inline-command shape `resp.ts:20-27` records is not reachable here.
- **A partial `AUTH` frame cannot be completed by a later write.** The socket is closed in
  `connect()`'s catch before anything else runs, and the abandoned `conn.write` cannot deliver to a
  closed socket. A fragment reaches the wire, but a broker that stalled the write could have taken
  the whole password by draining instead.
- **No caller logs command arguments.** Checked at `client.ts`, `connection.ts` and
  `session/drivers/redis.ts`; `renderError` renders `message` only, no `cause`, no stack.

**Coverage**: the plan whole; `connection.ts`, `client.ts`, `resp.ts` whole; `subscriber.ts`
targeted; `AGENTS.md` pitfalls; `session/drivers/redis.ts` log sites;
`contract/logging/sanitize.ts`. **Not covered**: `03-injection-and-input.md` was not loaded, so the
RESP-framing claims are sourced from `resp.ts`'s own recorded history rather than the domain file;
`09-design-and-business-logic.md` not loaded.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1** — Bounding the write turns an unbounded hang into a discard, and nothing between `RedisClient` and `AuthenticatedConnection` has backoff or a circuit breaker: the next command re-dials immediately, re-sending `AUTH` in cleartext (`tls` defaults to `false`). A hostile or wedged broker can drive that loop at request rate. Separately, there is no write-side frame-size bound — `MAX_BULK_BYTES` and `MAX_REPLY_BYTES` bound *replies* only — so a legitimately large `SETEX` can exceed the budget and fail an operation that used to succeed. | **Ship the bound; file the churn.** Failing fast is strictly better than hanging forever, and the residual is bounded by how fast the application issues commands rather than being unbounded in time. Backoff needs its own design — it touches `RedisClient`, `AuthenticatedConnection` and four consumers' timing assumptions, and the subscribe connection's took a whole issue (#245) to get right. Doing it under this branch's pressure is how it gets done badly. A write-side frame-size bound is likewise a judgement about the largest legitimate session blob or queue payload, and picking that number in passing would reject working writes. **Both are filed**: the churn as
[#299](https://github.com/locknessland/lockness-monorepo/issues/299) (P1) and the write-side
frame-size bound as [#300](https://github.com/locknessland/lockness-monorepo/issues/300) (P1). A
correction while filing: this plan cited #245 as the issue that got the subscribe backoff right —
#245 is a JSDoc task. The cadence landed in #275 and was corrected in #286. | 2026-09-06 |

### Decided without asking

- **One budget for the exchange, not one per leg** — what the handshake already does, and what
  `#remaining`'s docstring already argues for.
- **`READ_TIMEOUT_MS` as the default budget** rather than a new option; #286's plan rejected a
  second knob for the same reason.
- **Two write ceilings, not one** (FR-004), because a ~40-byte handshake frame and a multi-megabyte
  `SETEX` are not the same physics — the point where the audit's own recommendation was to *not*
  share the constant.
- **The branded `Deadline`** (FR-002), accepted rather than deferred: 4 call sites, unpublished
  package, and it pre-empts the exact recurrence this package has already had three times.
- **One branch, not merged with #298.** Zero file overlap — #298 is entirely `subscriber.ts`, this
  is `connection.ts` and `resp.ts` — and landing the typed seam first makes #298 easier, since a
  socket generation is the natural owner of a deadline.
