# Plan: the Redis revocation pass is bounded — a configuration the driver cannot enforce refuses to boot, and a broken enforcement guarantee is never silent

**Branch**: `268-revocation-pass-bound` | **Date**: 2026-09-23 | **Backlog item**:
[#362 — Realtime: bound the Redis revocation pass — a pass that never settles stalls every later one, and the lost-frame bound is never checked against revocationTtlSeconds](https://github.com/locknessland/lockness-monorepo/issues/362)

**This is the feature's one planning document.** The design was settled by the `architect-expert`
disposition on #362 (2026-09-23, hard rule #11), and the one product question it raised was answered
by the maintainer the same day: **refuse at boot**. This plan records both as binding. It adds what
the disposition left to the plan: the decision table, the requirements, the witnesses and mutants in
testable form, and the blast radius, **re-counted on `main` at `4c65f603`**. That tree includes #361,
#365 and #369.

Both plan audits are folded in (§10, §11), with the `architect-expert`'s rulings on every finding,
binding under hard rule #11 (2026-09-24). They add first-registration-only arming (A1), arm-time
decisions (A2), one operator statement of the relations (A3), a broker-clock check (S1), timer-ceiling
ranges (S2) and the #369 fallback on every log line (S3).

**Where the tree no longer matches the disposition** (anchored at `c00bfcde`). **All ten were
confirmed by the architecture audit (§10)**; D10 was corrected by it:

- **D1 (anchor moved).** `packages/realtime/drivers/redis.ts`, `packages/redis/resp.ts`,
  `packages/realtime/drivers/lapse_run.ts` and `tests/revocation_atomicity.test.ts` are
  **byte-identical** since `c00bfcde`, so every anchor the disposition gives in them still holds.
  That covers `:421-445`, `:428-435`, `:1652-1655`, `:1706-1711`, `:2715-2731`, `:2807`,
  `:2817-2825`, `:3670`, `:3672`, `resp.ts:124`, `lapse_run.ts:19-22`, and the atomicity suite's
  `:119` and `:185`. **One anchor moved:** #361 inserted 321 lines above the manager's serial re-check
  tail. The tail was `manager.ts:2926-2932` and is now **`:3247-3253`**, with unchanged content.
- **D2 (numbers taken).** The disposition calls the upgrade note "item 15" and the record "ADR 010,
  or an ADR 009 amendment". #361 and #369 have landed since. `docs/realtime.md` § *Upgrading to
  v0.4.0* now has **17** items, and `docs/adr` holds 001–010. This feature's note is **item 18** and
  its record is a **new ADR 011**, unless another item lands first. Both numbers are assigned at
  landing. A new ADR is chosen over an ADR 009 amendment because the decision spans the port
  contract, the constructor and a new module, not only the paged read ADR 009 records.
- **D3 (a third construction refuses).** The disposition says "every other test and doc
  configuration checked passes". That is false for one site:
  `packages/realtime/tests/redis_broker_integration.test.ts:387` passes `revocationTtlSeconds: 30`
  through `withInstances`, and `live_realtime.ts:271` defaults that helper's interval to `60_000`.
  2 × 60 000 > 30 000, so the new check refuses it. The suite is `ignore: !LIVE_BROKER`
  (`:62`), so the default gate never sees it; only a live-broker run would fail. **Suites edited: 3
  constructions in 2 files** (FR-016). Every other site that sets either value was checked with
  `git grep -nE "revocationTtlSeconds|reconcileIntervalMs"`, and all of them pass. That covers the 23
  test, helper and battery files it hits, `docs/realtime.md:1579`, and the ADRs. **`tasks.md`
  records whether the live-broker run happened** (audit ruling).
- **D4 (the battery rows that actually break).** The disposition names `RERUN_TAKE`
  (`mutations/revocation_paging_359.ts:124-126`) as a row that may need repair. Re-counted on today's
  tree, `RERUN_TAKE` survives unchanged, provided its two lines stay contiguous (FR-011). The rows
  that **do** break are in `revocation_retry_308` and `reconcile_single_pass_355`. Declaring
  `#runRevocationReconcile`'s return type turns its bare `return`s into `return 'failed'`, and two
  rows anchor through `return\n`. They are **re-anchored, never deleted**. The full list, after the
  audit fold added the `#lastReadAt` write, is **14 adjacent rows in 4 batteries**: 2 re-anchored,
  2 re-verified and 10 unchanged (§4).
- **D5 (the guard mutants are only live if the witnesses read the message).** Infinity as an
  interval (B4), and 0 or −1 as a TTL (B5), are refused by the **relation** too, because
  2 × ∞ > TTL, and 2 × interval > 0 or −1 000. On their own, B4's Infinity case and B5's 0 and −1
  cases therefore do not kill "finiteness dropped" or "TTL positivity dropped". Every B witness
  asserts **which** refusal fired: the guard's message or the relation's message (FR-005). B5 also
  gains **Infinity**, which the relation lets through (2 × interval > ∞ is false). That is the TTL
  finiteness mutant's only other killer.
- **D6 (the clock choice had no witness).** D1–D5 stub `performance.now` onto fake time. FakeTime
  already fakes `Date`, so a deadline built on the epoch `now()` behaves identically under them, and
  the mutant "epoch clock" survives. **D6 is added**: the wall clock jumps forward one TTL during a
  successful pass, and no WARN follows (N18).
- **D7 (registration after `close()`).** The disposition says "`onRevocationReconcile` arms it" but
  not whether a registration after `close()` does. It does not. Every arm site asks `#closing`,
  which `#armRevocationReconcile` (`:2777-2778`) already calls "the one gate for timers" (#355).
  `EnforcementDeadline.close()` clears the timer and is **not** terminal, so `#closing` stays the
  one decider (row 9).
- **D8 (the "no pass in flight" wording).** The disposition's fallback message is "passes are
  failing". A **successful** pass that took longer than the TTL also fires the deadline, straight
  from the end site (delay ≤ 0), and no failure WARN precedes it. The message says no pass completed
  within the TTL of the last success's start (the A2 wording), whether passes are failing or are
  slower than the bound allows (FR-007).
- **D9 (a pass longer than the TTL WARNs twice).** Once while it runs (fire, pass in flight named),
  and once when it succeeds (its own window, from its start, is already broken). This follows from
  the disposition's exactness rule, `e(i+1) − s(i) > TTL`. The two are two episodes, not a duplicate
  (§2 edge cases, D4 witness).
- **D10 (D1 cannot kill "fire frees the slot" through a manager; corrected by the audit).** A
  second pass calls the handler. Behind a manager, that handler queues on the stalled serial tail
  (`manager.ts:3247-3253`) and never reaches the port, so "exactly one `ZSCAN`" holds under the
  mutant too. D1 registers a raw handler on the driver, over **#359's serialising `serialPort`**
  (`revocation_paging_359.test.ts:157`). `serialPort` records each command **at issue**, before its
  serial queue, so a second pass's `EVAL` is visible even while it waits behind the stalled `ZSCAN`.
  The first draft's non-serialising port was wrong: it is not the production shape. D2 and D4 also
  avoid, or tolerate, a timer pass coinciding with the fire instant.

---

## 1. Why this exists

The revocation re-check exists to give one guarantee: **a revocation whose one-shot control frame
was lost is still applied, within a known bound.** That bound has one home, the
`onRevocationReconcile` JSDoc (`packages/realtime/drivers/redis.ts:2715-2731`):
**`reconcileIntervalMs + 2P`**, where P is one pass. A durable revocation record lives
`revocationTtlSeconds`. If the bound exceeds the TTL, a lost revocation's record expires before any
pass applies it, and the revoked socket keeps its access. The #359 security review found two ways
this happens (L3, L4), and nothing reports either.

**L3: a pass that never settles stops enforcement for the driver's life, silently.**

- `#startRevocationPass` (`:2807`) runs one pass at a time. The next pass starts, or the timer is
  re-armed, only from the running pass's `finally` (`:2817-2825`).
- A command that never settles holds that `finally` forever: no pass, no timer, no log line.
- Freeing the slot would unblock nothing. The command port serialises every exchange (the #348
  contract, `:428-435`), and the manager chains each re-check on a private serial tail
  (`manager.ts:3247-3253`, D1).
- The built-in client bounds every round trip through `READ_TIMEOUT_MS` (`packages/redis/resp.ts:124`,
  30 s). **An injected port has no such bound, and nothing says it must.**

**L4: the bound is never compared with the TTL, and neither value is validated.**

- The constructor resolves both (`:1652-1655`) and compares nothing.
- A `NaN`, `0`, negative or `Infinity` interval reaches `setTimeout` as 0 ms. Both the revocation pass
  and the ghost sweep then re-arm back to back: **a hot loop against the broker, today**.
  `Number(Deno.env.get('…'))` on an unset variable produces exactly this.
- A `NaN` TTL passes every `>` comparison.
- The prior art is the #293 boot guard beside it (`:1627-1650`), which refuses a heartbeat slower
  than half the liveness TTL.

**Who is affected:**

- every Redis deployment whose `revocationTtlSeconds` is under twice its `reconcileIntervalMs`;
- every deployment that reads the interval from an unset environment variable (the hot loop);
- every application that injects its own command port. One command that never settles ends
  revocation enforcement with no signal;
- every deployment where a failure run or a slow index outlasts the TTL. The guarantee breaks and
  nothing says so.

These are availability and enforcement gaps, not a new exploit. They undermine a stated security
bound, which is why the item carries the `security` label.

## 2. User scenarios

### US1 — a configuration the driver cannot enforce refuses to boot (P1)

**Given** an operator who sets `revocationTtlSeconds: 15` at the default `reconcileIntervalMs` of
10 000
**When** the application constructs the Redis driver
**Then** construction throws. The message names `presence.reconcileIntervalMs=10000ms` and
`revocationTtlSeconds=15s`, says how to fix it (lower the interval or raise the TTL), and links #362
and the bound's one home. Nothing connects to the broker.

### US2 — an unset or broken interval refuses instead of hot-looping (P1)

**Given** `reconcileIntervalMs: Number(Deno.env.get('UNSET'))`, which is `NaN`
**When** the driver is constructed
**Then** it throws the finiteness-and-positivity refusal, naming both values. No pass runs.

### US3 — a stalled command port is reported once, and never runs a second pass (P1)

**Given** an injected port whose `ZSCAN` never settles
**When** `revocationTtlSeconds` elapses with no successful pass
**Then** exactly one WARN names the pass in flight (its trigger and its age) and points at the
command port's contract. However long the stall lasts, no second WARN follows and no second pass
starts.

### US4 — a failure run is reported once per episode, and recovery re-arms (P2)

**Given** a broker whose reap command fails on every pass
**When** a full TTL passes with no success
**Then** one WARN says no pass completed within `revocationTtlSeconds` of the last success's start.
After the broker heals
and a pass succeeds, no WARN follows until a new full window passes without a success. A second
failure run produces a second WARN.

### US5 — a healthy deployment sees nothing new (P2)

**Given** the defaults, or any configuration that honours the relation, with passes succeeding
**When** the application runs for any length of time
**Then** it constructs exactly as before, no new WARN appears, and no broker round trip is added.

### US6 — a port author knows the duty (P3)

**Given** a developer writing their own `RedisCommandClient`
**When** they read its JSDoc
**Then** it states that every command must settle within a bound the port owns, that `RedisClient`
meets this through its read timeout, and what stalls when a command never settles.

### Edge cases

- **The boundary.** `2 × interval === TTL × 1000` constructs (B2): the relation is `>`, not `>=`.
- **`close()` during a pass that then succeeds**: the end site does not re-arm (the `#closing`
  gate), so no WARN fires after close (D5 witness).
- **A registration after `close()`** arms nothing (D7).
- **Re-registration** (`onRevocationReconcile` called again) leaves a pending or fired deadline
  alone. Only the first registration arms it (A1), so a registration during a failure run cannot
  postpone a due WARN (D5 (iv)).
- **A reconnect-triggered or retry pass that succeeds** re-arms the deadline like a timer pass. The
  deadline does not care which trigger ran.
- **A successful pass longer than the TTL** WARNs twice: once while in flight, and once at its end
  (D9).
- **A pass whose outcome is never recorded** (the pass promise rejects, which happens only when the
  log sink itself throws, the #349 case) counts as failed. The deadline is left alone, so it still
  fires, and the chain's final handler writes one marked ERROR line (S3, D8).
- **An overdue arm while a trailing pass runs** writes `MISSED`, never `STALLED` naming the trailing
  pass: the verdict is taken at arm time (A2, D4b).
- **The broker's clock jumps forward by a full TTL** between two successes while the local deadline
  is still pending: one `SKEWED` line (S1, D7). A jump after the local deadline already fired adds
  nothing to that episode. A backward jump is harmless.
- **A `console.warn` that throws** at the fire becomes one marked `console.error` line (S3, D8).
- **Mixed-fleet TTL.** A record lives for its writer's TTL, extended upward by `ZADD … GT`. Both
  checks use **this** instance's TTL. A peer configured with a shorter TTL writes records these
  checks do not cover, so the docs state the TTL is assumed uniform across the fleet.
- **Precision.** The deadline measures local monotonic time, while a record's life runs on the
  broker's clock. The two agree to within one round trip.
- **`reconcileIntervalMs` lives under `presence.*`** but also paces the revocation pass. The error
  names its real path, `presence.reconcileIntervalMs`.

## 3. Requirements

**The port contract (L3)**

- **FR-001**: The `RedisCommandClient` JSDoc (`redis.ts:421-436`) gains a second clause beside the
  #348 one, in the same bold form:
  - ***Contract: every command settles***, resolving or rejecting, within a bound the port owns.
    `RedisClient` meets it through its read timeout (`READ_TIMEOUT_MS` in `@lockness/redis`).
  - The clause names what stalls when a command never settles: every command queued behind it,
    meaning the revocation re-check, the ghost sweep, the heartbeat and `close()`.
  - It says the driver does not cancel a command. A command that never settles is reported by the
    enforcement deadline (FR-006–FR-008) and is not recovered.
- **FR-002**: **The bound's one home** (`:2715-2731`) links to that clause for its "read timeout"
  term instead of restating it. Its round-trip count is corrected from `1 + ⌈N/COUNT⌉` to
  `1 + max(1, ⌈N/COUNT⌉)`, because the `do…while` always reads one page. It gains one sentence:
  since #362 the bound is **checked**, statically at boot (FR-004) and at runtime (FR-008). Every new
  message, the new module and ADR 011 link to this home. None restates the formula.

**The boot check (L4, static half)**

- **FR-003** (S2): In the constructor, directly after `this.revocationTtlSeconds = …`
  (`:1654-1655`) and before the control-window block, a **range guard** checks both values in the
  #293 shape (range first, relation second). It refuses when:
  - the interval is not finite, or is below **1 ms**. A fractional interval such as `1.5` stays
    legal. The interval's upper bound follows from the relation, since
    `interval ≤ TTL × 500 ≤ 1 073 741 500 ms`;
  - the TTL is not a **safe integer**, or lies outside **[1, 2 147 483] s**. The upper bound is
    `Math.floor(MAX_TIMER_MS / 1000)`, so the deadline's `ttlMs` always fits one timer.

  **`MAX_TIMER_MS = 2 ** 31 − 1`** is one module constant in `redis.ts`. Its JSDoc records the
  measured Deno 2.9.6 behaviour: a delay of 2^31 ms or more fires after 1 ms. The guard throws a
  plain `Error`. Its message:
  - names both option paths with their values, `presence.reconcileIntervalMs=…` and
    `revocationTtlSeconds=…`;
  - states the two ranges;
  - says why an out-of-range interval matters: it re-arms both passes back to back;
  - carries `(#362)`.
- **FR-004**: **Then the relation.** `this.reconcileIntervalMs * 2 > this.revocationTtlSeconds * 1000`
  throws a plain `Error`. Its message:
  - names `presence.reconcileIntervalMs=…ms` and `revocationTtlSeconds=…s (…ms)`, with units;
  - says a lost revocation's record could expire before a pass applies it;
  - says to lower the interval or raise the TTL;
  - links #362 and names the bound's one home (`onRevocationReconcile` in
    `packages/realtime/drivers/redis.ts`).

  The factor is **2**, for the disposition's reasons:
  - it is the largest interval at which one failed pass of negligible length still applies every
    lost-frame revocation before it expires;
  - it leaves the runtime deadline at least TTL/2 of headroom, so the deadline never fires on
    healthy passes.

  A code comment above the check says this in two sentences and links the one home. It does not
  restate the formula. **This check is the only copy of the factor in code** (A3). The witnesses
  pin it; they do not copy it.
- **FR-005**: Both refusals are **plain `Error`s**, like #293 and `control.windowMs`. No new class
  is exported (confirmed by the audit). The two messages are **distinct**: the guard's contains
  `out of range`, and the relation's contains `at most HALF`. Witnesses assert which one fired
  (D5).

**The enforcement deadline (runtime half)**

- **FR-006**: A new internal module, `packages/realtime/drivers/enforcement_deadline.ts`, holds
  `class EnforcementDeadline`. It follows `lapse_run.ts:19-22`: concrete, revocation-specific, no
  interface, no generic runner, and **not exported from `mod.ts`**. It has a `@fileoverview` and a
  `@module`, and JSDoc on every member.
  - **Constructed with** `{ ttlMs: number, now: () => number, inFlight: () => { readonly trigger:
    string; readonly startedAt: number } | undefined }`.
  - **It holds one timer**, a `setTimeout` passed to `Deno.unrefTimer` (the `:2879` precedent).
    Never a `setInterval`.
  - **`arm(delayMs)`** clears any pending timer. When `delayMs > 0`, it sets a timer for `delayMs`;
    that timer consults `inFlight()` **at fire** (FR-007). **When `delayMs ≤ 0` (an overdue arm),
    it decides `MISSED` at arm time** and sets a 0 ms timer that writes that decided line (A2). It
    never consults `inFlight()`, so a pass started in between cannot be misnamed.
  - **`passSucceeded(startedAt, endedAt, readAt)`** (S1) first runs the **broker-clock check**:
    `readAt` is the reap time `t` of this pass's completed enumeration, in broker seconds. When a
    previous success's `readAt` is known, `readAt − prevReadAt ≥ ttlMs / 1000`, **and the timer is
    still pending**, it decides `REVOCATION_DEADLINE_SKEWED` at arm time and sets a 0 ms timer that
    writes it. Otherwise it calls `arm(ttlMs − (endedAt − startedAt))`. In both cases it keeps
    `readAt` as the new previous value. An `undefined` `readAt` skips the check (see row 18).
  - **`close()`** clears the pending timer. It is **not terminal**: whether a timer may be armed is
    the driver's `#closing` decision (row 9).
  - **On fire**, it clears its own handle and writes its line **once**, in its own timer callback,
    never from the driver's end site (S3). It never re-arms itself, so a stall produces one WARN,
    however long it lasts. It never touches the pass slot.
  - **The write is the #369 shape** (S3). The line goes through `console.warn` inside a `try`. If
    `console.warn` throws, one `console.error` line is written instead. Its **marker is in the fixed
    prefix**, before any error text, and it carries both halves (the intended line and the sink's
    failure), each through `renderError`. A throwing `console.error` is fatal, as in #369 (§9).
  - **Its one import** is `renderError` from `@lockness/contract`, an edge `@lockness/realtime`
    already has. `performance`, `setTimeout` and `Deno.unrefTimer` are globals.
    `deno task deps:analyze` shows no new edge.
- **FR-007**: **The WARN text** has its home in three exported constants of the new module. The
  driver's tests import them, as they import `REVOCATION_PAIRS_SKIPPED` today.
  - **`REVOCATION_DEADLINE_STALLED`** is written only by a timer that expires on its own **and**
    finds `inFlight()` returning a pass. It is followed by the pass's trigger and its age in ms
    (`now() − startedAt`), and says the pass has not settled, pointing at the `RedisCommandClient`
    "every command settles" contract.
  - **`REVOCATION_DEADLINE_MISSED`** is written by a timer that expires on its own with no pass in
    flight, and by every overdue arm (A2). It reads: *no revocation pass completed within
    `revocationTtlSeconds` of the last success's start*. Passes are failing (their own WARNs
    precede it) or are slower than the bound allows (D8).
  - **`REVOCATION_DEADLINE_SKEWED`** (S1) says the broker's clock advanced by at least
    `revocationTtlSeconds` between two successful passes, so records may have expired unapplied.
    It names both reap times.
  - All three carry `(#362)` and name the bound's one home. None restates the formula. None
    carries untrusted text: the trigger is the driver's own enum, and the ages and times are
    numbers.
- **FR-008**: **The driver moves it at three sites and no other** (`redis.ts`). The
  **`#startRevocationPass` JSDoc names all three and `close()`** (A4, row 8):
  1. **`onRevocationReconcile`**: **only the first registration arms it**, at
     `revocationTtlSeconds × 1000`, unless `#closing` is set (A1, D7). "First" means
     `this.revocationHandler` was `undefined` before this call. A later registration leaves a
     pending or fired deadline alone. The pass timer's re-arm is unchanged.
  2. **The one start site, `#startRevocationPass`.** When the slot is free, it records
     `this.#revocationPass = { trigger, startedAt: this.#passClock() }`. `#revocationPass`'s type
     becomes that record. The promise is no longer stored, because nothing awaits it. Its JSDoc
     (`:1490-1493`) is updated.
  3. **The one end site, the pass's `finally`**, which **stays a `.finally`** and **never logs**
     (S3). In order:
     1. take `startedAt` from the start site's closure (the value the slot record holds; amended in
        implementation, architect ruling 2026-09-24), and `endedAt = this.#passClock()`;
     2. free the slot;
     3. take the rerun, and start it or arm the timer, unchanged;
     4. **last**, if the outcome is `'ok'` and `#closing` is unset, call
        `deadline.passSucceeded(startedAt, endedAt, this.#lastReadAt)`. A `'failed'` or
        `'closed'` pass leaves the deadline alone.

  `close()` calls `deadline.close()` with the other timers, after the retry-timer block
  (`:3652-3655`) and before `const stopped = this.#lapse.close()` (`:3659`).
- **FR-009**: **The outcome.** `#runRevocationReconcile` declares
  `Promise<RevocationPassOutcome>`, where `type RevocationPassOutcome = 'ok' | 'failed' | 'closed'`
  is a module-private alias in `redis.ts` (the #355 declared-return rule). It returns:
  - `'closed'` when no handler is registered. That happens only after `close()` has dropped the
    handler (A5). At the one consumer, which checks `#closing` first, `'closed'` is equivalent to
    `'failed'`, so no battery row pins the distinction;
  - `'ok'` after the handler resolves;
  - `'failed'` on every path out of the `catch`: the timer path, the `#closing` path, and after
    arming the retry.

  **"Unrecorded means failed" is decided at the start site's `let outcome: RevocationPassOutcome =
  'failed'`** (A4, row 11). A `.then` placed **before** the `.finally` records the outcome, so a
  rejection leaves `'failed'` and the `finally` still runs. **The chain ends in a final rejection
  handler** (S3). It writes the same marked #369 `console.error` line: a fixed-prefix marker, then
  the rejection through `renderError`. No rejection escapes to the runtime. This overrules the
  earlier "rejection path unchanged, out of scope" note.
- **FR-009a** (S1): **`#lastReadAt`** is a new private field in `redis.ts`. **Its only writer is
  `listRevocations`**. After a *completed* enumeration, it stores the reap time `t`, in broker
  seconds, directly below the skip WARN line (`:2662`) and above `return`. A pass that throws
  mid-enumeration does not write it. `t` goes into **neither** the slot record **nor** the FR-009
  outcome. The end site reads the field and hands it to `passSucceeded`.
- **FR-010**: **One monotonic clock.** `#passClock(): number { return performance.now() }` goes in
  `redis.ts`, directly below the epoch `now()` (`:1704-1711`). Its JSDoc states why it is not `now()`:
  that is the control-frame stamp clock, and a wall-clock step would corrupt an interval. It is the
  **only** `performance.now()` read in the driver. The start site, the end site and the deadline's
  `now` all go through it. #360 reuses it.
- **FR-011**: **Anchor hygiene.**
  - The new end-site lines go **above** `const rerun = this.#revocationRerun`, or below
    `this.#revocationRerun = undefined`, never between them. `RERUN_TAKE`'s two lines keep their
    **16-space indent**, byte for byte.
  - Line `:1501`, `#revocationRerun?: 'reconnect' | 'reconnect-retry'`, is not edited (M17).
  - The retry-clear block in `close()` stays byte-identical (#308 row 5).
  - The `#lastReadAt` write goes **below** `LOOP_END` (`:2661-2662`), never inside it (M3, M10).
  - No new line duplicates a line that a battery row in §4 anchors on.
- **FR-012**: **The pass slot is never freed** by the deadline or anything else new. One pass at a
  time (ADR 006, #359 FR-011) is untouched. The deadline never starts or abandons a pass.

**Tests**

- **FR-013**: Witnesses B1–B6 and D1–D8 go in a new
  `packages/realtime/tests/revocation_pass_bound_362.test.ts` (§4). They are committed **red on
  `main` first**, except the pins B2, B3 and D3. The D witnesses:
  - stub `performance.now` onto FakeTime's `time.now`, since FakeTime does not fake it, and restore
    it in `finally`;
  - **pin the fake broker clock with `FakeRedis.setTime`**, so that only the witness that means to
    move it does so (D6, D7);
  - spy `console.warn` and `console.error`, and count lines starting with the FR-007 constants or
    the marked fallback prefix;
  - use **#359's serialising `serialPort`** (`revocation_paging_359.test.ts:157`), re-created
    locally. It records each command **at issue**, before its serial queue, so a second pass's
    `EVAL` is visible while it waits (D10). The #359 file is not edited.
- **FR-014**: The mutation battery `packages/realtime/tests/mutations/revocation_pass_bound_362.ts`
  holds rows N1–N29 (§4). SUITES is that test file. Each row is **proven live**: it ran, and it
  turned its named witness red.
- **FR-015**: **Battery repair** (§4 list): the two DEAD rows are **re-anchored, never deleted**,
  and re-proven live, and the two substring rows are re-verified live. Then
  `deno task mutate realtime` runs. Any other `DEAD MUTANT` is repaired under "the source moved,
  the guard remains" (`docs/testing.md:428`), never deleted.
- **FR-016**: **Suites that now refuse, repaired by configuration, not by timing:**
  - `revocation_atomicity.test.ts:119` (TTL 10 s) gets `presence: { reconcileIntervalMs: 5_000 }`;
  - `revocation_atomicity.test.ts:185` (TTL 5 s) gets `presence: { reconcileIntervalMs: 2_500 }`;
  - `redis_broker_integration.test.ts:387` (TTL 30 s, through `withInstances`) gets
    `reconcileIntervalMs: 15_000` in its options (D3).

  No assertion changes. **`tasks.md` records whether the live-broker run of that suite happened**,
  and its result, because the default gate cannot see it (D3 ruling).

**Docs**

- **FR-017**:
  - **`docs/realtime.md`**:
    - **The #293 configuration paragraph (`:1584-1600`) becomes the one operator statement of both
      relations** (A3): heartbeat against liveness TTL, and interval against revocation TTL. It
      also states the ranges (FR-003) and the fix: lower the interval or raise the TTL. Everything
      else links to it.
    - **Item 18** of *Upgrading to v0.4.0* (the number is assigned at landing, D2):
      - Before: any timing constructed, and a non-finite or ≤ 0 interval ran both passes back to
        back.
      - After: the driver refuses a timing outside the ranges, or one that breaks the relation.
        The item **links to the configuration paragraph** and does not restate it.
      - Also: an injected command port must settle every command, and a new WARN (three forms)
        appears when the guarantee is broken.
      - No wire change and no migration step.
    - The section's intro becomes "Eighteen items. Thirteen are breaking…", naming the boot refusal,
      and its "read items …" list gains 18.
    - The enforcement-bound paragraph (`:1930-1940`) gains three sentences:
      - the bound is checked at boot (a link to the configuration paragraph) and watched at runtime;
      - `revocationTtlSeconds` is assumed **uniform across the fleet**, because a record lives for
        its writer's TTL;
      - an injected port must settle every command.

      All three link to the one home and do not restate it.
  - **`packages/realtime/README.md`**: one bullet in *What ships*, linking the configuration
    paragraph.
  - **`packages/realtime/AGENTS.md`**:
    - a pitfall: *never free the revocation pass slot on a timer, never add a second deadline clock,
      never read the epoch `now()` for an interval, and never log from the pass's end site*,
      pointing at ADR 011;
    - `enforcement_deadline.ts` in the file map;
    - the *Tests* list, regenerated by `deno task agents:brief`.
  - **ADR 011** (the number is assigned at landing),
    `docs/adr/011-realtime-revocation-bound-is-checked.md`, records:
    - the question (L3, L4);
    - the port contract;
    - the boot ranges, the relation and its factor;
    - the success-anchored deadline, its exactness and the broker-clock check;
    - the rejected options with their costs (the disposition's *Rejected*);
    - **§5, the fleet** (S4): a shorter-TTL peer's records expire silently for this instance's
      checks. The rejected remedies are:
      - fleet keys: a boot round trip, a mixed-fleet decode hazard, and the lifetime of a
        min-key;
      - a per-record TTL: it fails open mid-deploy (`redis.ts:2651-2652`);
    - the residue (§9);
    - that #360 consumes the pass clock and the outcome.

    It **links ADR 009 §2 and ADR 006**, and leaves ADR 009 untouched. It links the bound's one
    home rather than restating it.
  - **JSDoc**:
    - the `RedisCommandClient` clause, and the one home (FR-002);
    - `MAX_TIMER_MS`, with the measured behaviour;
    - `#revocationPass`, `#lastReadAt` and `#passClock`;
    - `#startRevocationPass`: the three deadline sites and `close()`, plus the start and end reads;
    - `#runRevocationReconcile` (`@returns`);
    - `listRevocations`: it writes `#lastReadAt`;
    - the constructor's `@throws`;
    - every member of `EnforcementDeadline`.
  - **No `CHANGELOG` file**: #364 tracks the missing root changelog, as for #361.

## 4. Success criteria

- **SC-001**: A deployment configured so that a lost revocation could outlive its record **does not
  start**. The refusal names both settings with their units and says how to fix it.
- **SC-002**: An unset, zero, negative, fractional-below-1 ms, infinite or timer-overflowing pass
  interval, or TTL, never reaches the broker. The deployment refuses to start instead of hammering
  the broker.
- **SC-003**: Whenever no revocation re-check has completed within one revocation TTL of the last
  success's start, whether passes are stalled, slow or failing, the operator sees **exactly one**
  warning per episode. It names the stalled pass (trigger and age) when one is stalled.
- **SC-004**: A healthy deployment, and every configuration that honours the ranges and the
  relation (the defaults included), behaves exactly as before: it starts, and it never sees the new
  warning.
- **SC-005**: The new detection adds **zero** broker round trips.
- **SC-006**: A stalled pass never leads to a second concurrent pass.
- **SC-007**: When the broker's clock jumps forward by a full TTL between two successful passes, the
  operator is told once, unless a warning for that window was already given.
- **SC-008**: No failure of the log sink along the pass or the deadline escapes as an uncaught
  error. It is reported on one marked line.

**Witnesses** (FR-013), in `tests/revocation_pass_bound_362.test.ts`. "Red" means the witness fails
on `main` at `4c65f603`. Test names start `#362 B<n> ` or `#362 D<n> ` with a trailing space.

| # | Setup → assertion |
| :--- | :--- |
| B1 (red) | interval 10 000, TTL 15 → throws the **relation** message, naming `presence.reconcileIntervalMs=10000ms` and `revocationTtlSeconds=15s`. Today it constructs |
| B2 (pin) | interval 10 000, TTL 20 → constructs (the boundary). Green before and after |
| B3 (pin) | the defaults construct, through both the constructor and `fromConfig` (the latter never dialled). Green before and after |
| B4 (red) | interval `NaN`, `0`, `-1` and `Infinity`, each at TTL 300 → throws the **guard** message (`out of range`), naming both values. Today all four construct |
| B5 (red) | TTL `NaN`, `0`, `-1` and `Infinity`, each at interval 10 000 → throws the **guard** message. Today all four construct |
| B6 (red, S2) | each at interval 1 000 unless stated: TTL `7.5`, TTL `2 147 484`, and interval `0.5` at TTL 300 → each throws the **guard** message. Pin: TTL `2 147 483` constructs. Today the first three construct |
| D1 (red) | interval 1 000, TTL 10; `performance.now` on `time.now`; the broker clock pinned. The handler is registered **directly on the driver** (`driver.onRevocationReconcile(() => driver.listRevocations())`), not through a manager, over **`serialPort`**. The port's `ZSCAN` never settles. Tick 10 s → **exactly one** `REVOCATION_DEADLINE_STALLED` line naming trigger `timer` and an age of 9 000 ms, plus the port contract. Tick 30 s more → still one. The port **issued** exactly one `EVAL` and one `ZSCAN`. Today there are zero lines |
| D2 (red) | interval **3 000**, TTL 10: timer passes at 3, 6 and 9 s never coincide with the fire at 10 s, so the constant is deterministic. The reap (`EVAL`) rejects from t0. Tick 10 s → one `REVOCATION_DEADLINE_MISSED`. Heal; the next pass succeeds, starting at s → no deadline line before s + 10 s. Fail again from then on → a **second** line at s + 10 s |
| D3 (pin) | interval 1 000, TTL 10; healthy passes for 30 s → zero deadline lines of any constant. Green before and after |
| D4 (red) | interval 1 000, TTL 10; `performance.now` on `time.now`. (a) A pass starting at s whose reply is held H = 4 s succeeds; then every pass fails → the first deadline line lands at **s + 10 s**, not s + H + 10 s. (b) The previous success started at s_prev; the next pass (s = s_prev + 1 s) is held H = 12 s → **`STALLED` at s_prev + 10 s, age 9 000 ms** (A6); at its end (s + 12 s) the overdue arm writes **`MISSED`** (D9) |
| D4b (red, A2) | D4 (b), with a **reconnect recorded mid-pass**, so the trailing pass starts in the end site before the deadline call. The overdue arm still writes **`MISSED`**, never `STALLED` naming the trailing pass |
| D5 (red) | (i) `close()` while the last page of a pass is held; release it and let it succeed; tick 2 × TTL → no deadline line. (ii) `close()` with a pending deadline and no pass; tick 2 × TTL → no line. (iii) `onRevocationReconcile` after `close()`; tick 2 × TTL → no line (D7). (iv) (A1) the reap fails from t0; **re-register at TTL − 1 s** → the line still lands at **TTL**, once |
| D6 (red) | interval 1 000, TTL 10; `performance.now` on `time.now`; **the broker clock pinned with `setTime`**. During a successful pass, `Date.now` alone jumps forward 10 s (a wall-clock step); then every pass fails → the line lands at s + 10 s of **monotonic** time, not immediately at the pass's end |
| D7 (red, S1) | interval 1 000, TTL 10; FakeRedis `setTime`. (i) Between two successes the broker clock jumps **exactly 10 s** → **exactly one** `REVOCATION_DEADLINE_SKEWED` line naming both reap times. (ii) A jump of **9 s** → no line. (iii) Passes fail until the local deadline has fired (one `MISSED`); the broker clock jumps 10 s; the next pass succeeds → **no** `SKEWED` line |
| D8 (red, S3) | (i) `console.warn` throws when the deadline fires → exactly one marked `console.error` line carrying both halves, and no uncaught error. (ii) The handler rejects while `console.warn` throws (the #349 case) → exactly one marked line from the chain's final handler; the next timer pass runs; the deadline stays pending and fires at its time |
| — | Every existing realtime test stays green after the three FR-016 configuration repairs, and no other test is edited |

**Mutants** (FR-014), battery `tests/mutations/revocation_pass_bound_362.ts`, each proven live:

| # | Mutant | Killed by |
| :--- | :--- | :--- |
| N1 | the relation check removed | B1 |
| N2 | the factor dropped: `this.reconcileIntervalMs > …` | B1 |
| N3 | `>` → `>=` | B2 |
| N4 | `* 1000` dropped from the TTL side | B3 |
| N5 | the interval's `!Number.isFinite` clause dropped | B4 (NaN; Infinity by message) |
| N6 | the interval's `< 1` clause dropped | B4 (0, −1) |
| N7 | the TTL's `!Number.isSafeInteger` clause dropped | B5 (NaN, Infinity) |
| N8 | the TTL's `< 1` clause dropped | B5 (0, −1, by message) |
| N9 | the fire abandons the pass: the `inFlight` getter clears `#revocationPass` and calls `#armRevocationReconcile()` | D1 (a second `EVAL` issued) |
| N10 | the fire re-arms itself (a WARN per TTL) | D1 (still one line) |
| N11 | a failed pass also re-arms (`outcome !== 'closed'`) | D2 (no first line) |
| N12 | `passSucceeded` ignored once the deadline has fired | D2 (no second line) |
| N13 | the end site never calls `passSucceeded` | D3 |
| N14 | anchored at the end: `passSucceeded(endedAt, endedAt, …)` | D4 (a) |
| N15 | the end site's `#closing` gate dropped | D5 (i) |
| N16 | `close()` does not call `deadline.close()` | D5 (ii) |
| N17 | `onRevocationReconcile` does not arm the deadline | D1 |
| N18 | `#passClock` returns `Date.now()` | D6 |
| N19 | an overdue arm decides at fire, consulting `inFlight()` (A2) | D4b |
| N20 | every registration re-arms the deadline (A1) | D5 (iv) |
| N21 | the TTL's safe-integer clause weakened to `Number.isFinite` | B6 (7.5) |
| N22 | the TTL's upper-bound clause dropped | B6 (2 147 484) |
| N23 | the TTL's upper bound off by one (`>=` against the cap) | B6 (the 2 147 483 pin) |
| N24 | the interval's `< 1` weakened to `<= 0` | B6 (0.5) |
| N25 | the broker-clock check removed | D7 (i) |
| N26 | the broker-clock check's `≥` → `>` | D7 (i) (a jump of exactly one TTL) |
| N27 | the broker-clock check's "timer still pending" condition dropped | D7 (iii) |
| N28 | the fire's #369 fallback removed: a bare `console.warn` | D8 (i) (an uncaught error) |
| N29 | the pass chain's final rejection handler removed | D8 (ii) (an uncaught rejection) |

**Blast radius: existing battery rows.** Counted on `main` at `4c65f603`. Every battery under
`packages/realtime/tests/mutations/` that targets `drivers/redis.ts` was evaluated: 19 of 36. A stub
harness dumped each row's anchors and located them in today's `redis.ts`, 132 rows in all.
`presence_member_frozen_354`, `self_skip_310` and `sweep_parse_316` were read by hand; their
`redis.ts` rows sit in the roster parse, the control ingest and the ghost sweep. **Every one of the
132 anchors matches exactly once today.** The rows in or beside the edit zones: the port contract,
the field block, the constructor, the end of `listRevocations` (`:2655-2663`, added by S1),
`:2700-2885` and `close()`.

*Adjacent rows: **14 in 4 batteries**. 2 are re-anchored, 2 re-verified, and 10 stay as they are,
provided FR-008, FR-009, FR-009a and FR-011 hold.*

- **Re-anchored (2), DEAD once the return type is declared** (FR-009); **never deleted**:
  - `revocation_retry_308` "the TIMER retries too" anchors
    `"            if (trigger !== 'reconnect') return\n"` (`:2864`). It becomes
    `"            if (trigger !== 'reconnect') return 'failed'\n"`, still deleted by the mutant.
  - `reconcile_single_pass_355` M25 anchors `:2864-2867` through two `return\n`s. Both gain
    `'failed'`, in the anchor and in the replacement.
- **Re-verified (2), still matching as substrings:** `revocation_retry_308` "the retry removed" and
  "the retry RETRIES ITSELF" anchor `"            if (trigger !== 'reconnect') return"` with **no**
  newline. Each still matches once, and each mutant keeps the ` 'failed'` suffix, giving
  `return 'failed'` and `if (trigger === 'timer') return 'failed'`. Both are re-proven live.
- **Unchanged (10):**
  - `revocation_retry_308`:
    - "the trigger is no longer named in the WARN" (`:2860`);
    - "close() stops clearing the pending retry" (`:3652-3655`, `expectSurvival`). Its reason
      still holds: `#runRevocationReconcile` now returns `'closed'` on that guard.
  - `revocation_paging_359`:
    - M3 and M10 (`LOOP_END`, `:2661-2662`, directly above the `#lastReadAt` write);
    - M15 (`:2780-2783`, the arm);
    - M16 and M22 (`RERUN_RECORD`, `:2812-2815`);
    - M17 (`:1501`, `:2812-2815`, `RERUN_TAKE` `:2820-2821`);
    - M18 (`:2777-2778`).
  - `lapse_rehold_349` M25 (`:3659`, `:3670`).
- **Nothing anchors** in the `RedisCommandClient` JSDoc, the bound's one home, the constructor's
  timing block or `manager.ts`'s tail. M12 and M23 anchor at `:2657`, clear of the new write.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| 1. The enforcement bound's formula, and when it holds | the `onRevocationReconcile` JSDoc, `packages/realtime/drivers/redis.ts` (corrected to `1 + max(1, ⌈N/COUNT⌉)`) | the formula restated in the boot message, the deadline module, its WARN constants, ADR 011, `docs/realtime.md`, README or `AGENTS.md` |
| 2. A command port must settle every command, within a bound it owns | the `RedisCommandClient` JSDoc, `packages/realtime/drivers/redis.ts` | a driver-side per-command timeout around the port; a second clock for the read timeout; the duty restated in item 18 instead of linked |
| 3. The ranges: interval finite and ≥ 1 ms; TTL a safe integer in [1, ⌊`MAX_TIMER_MS` / 1000⌋] s | the constructor's range guard directly after `:1654-1655`, `packages/realtime/drivers/redis.ts` | a check in `fromConfig`; a check at the arm sites; a `Math.max(…, 1)` clamp; a default substituted for NaN; timer chunking; a second guard in the manager |
| 4. The relation `2 × presence.reconcileIntervalMs ≤ revocationTtlSeconds × 1000`, refused at boot (maintainer decision 2026-09-23) | the constructor's relation check, `packages/realtime/drivers/redis.ts` | **a second check or copy of the factor in code, or a second doc statement** (A3); a WARN instead of a throw; a warn-for-one-release flag; a worst-case-P term. Witnesses pin it; they are not copies |
| 5. The boot refusal's form: a plain `Error` with two distinct messages (guard vs relation) | the two `throw new Error(…)` in the constructor, `packages/realtime/drivers/redis.ts` | a new exported error class; one merged message; the message text copied into a test instead of matched on its distinct fragment |
| 6. When the guarantee is broken: no pass completed within `revocationTtlSeconds` of the **start** of the last success | `EnforcementDeadline.passSucceeded` / `arm`, `packages/realtime/drivers/enforcement_deadline.ts` | anchoring at the end; a per-pass duration threshold (the #360 ruling rejects judging P); a pass deadline that abandons the pass; a check in the manager |
| 7. What the WARN says (three constants); that an overdue arm or a skew is decided at arm time, and only an expiring timer consults `inFlight()`; at most once per episode; written in the deadline's own callback | `REVOCATION_DEADLINE_STALLED` / `_MISSED` / `_SKEWED` and the one-shot fire, `packages/realtime/drivers/enforcement_deadline.ts` | a WARN from the driver's end site; `inFlight()` read by an overdue arm; an interval timer; a re-arm on fire; a per-tick WARN; the text inlined in `redis.ts` |
| 8. Where the deadline moves: the first registration arms; the one start site records; the one end site re-arms on success, last; `close()` clears; nowhere else | **the `#startRevocationPass` JSDoc**, `packages/realtime/drivers/redis.ts`, naming the three sites and `close()` (A4) | a re-arm on failure; a re-arm on every registration (A1); a re-arm in `#armRevocationReconcile` or `#runRevocationReconcile`; a second start site; an end site moved into a `.then` |
| 9. No timer is armed once `close()` has begun | `#closing`, `packages/realtime/drivers/redis.ts` (asked at every arm site, the #355 gate) | `EnforcementDeadline.close()` made terminal, a second decider; a `closed` flag inside the deadline |
| 10. The pass slot is never freed except by the pass's own `finally`; one pass at a time | `#startRevocationPass`, `packages/realtime/drivers/redis.ts` (ADR 006, #359 FR-011) | the deadline clearing `#revocationPass`; a `Promise.race` with a timeout; a slot identity check to allow overlap |
| 11. How a pass ended: `'ok' \| 'failed' \| 'closed'` | `#runRevocationReconcile`'s declared return type and `type RevocationPassOutcome`, `packages/realtime/drivers/redis.ts` | a boolean; an outcome inferred from whether a WARN was logged; a second outcome type in the deadline |
| 11a. Unrecorded means `'failed'` | **the start site's `let outcome: RevocationPassOutcome = 'failed'`**, `packages/realtime/drivers/redis.ts` (A4) | a default of `'ok'`; a second default in the end site or the deadline |
| 12. The pass slot's record: `{ trigger, startedAt }` | `#revocationPass`, `packages/realtime/drivers/redis.ts` | a sibling `#revocationPassStart` field; a record kept in the deadline; a start time re-read at the end; the reap `t` added to it |
| 13. Intervals are measured on the monotonic clock | `#passClock()`, `packages/realtime/drivers/redis.ts` (the only `performance.now()` read) | `now()` or `Date.now()` for an interval; a `performance.now()` inside `enforcement_deadline.ts`; a second clock for #360 |
| 14. The deadline's shape: concrete, internal, revocation-specific | `packages/realtime/drivers/enforcement_deadline.ts` | an interface or a generic deadline runner; an export from `mod.ts`; the logic inlined into `redis.ts` (the god file) |
| 15. `revocationTtlSeconds` is assumed uniform across the fleet | the enforcement-bound paragraph, `docs/realtime.md` (ADR 011 §5 records the residue) | the assumption restated in item 18 or JSDoc instead of linked; a runtime cross-instance TTL check; fleet keys; a per-record TTL |
| 16. The operator statement of both relations, the ranges and the fix (lower the interval or raise the TTL) | **the #293 configuration paragraph, `docs/realtime.md:1584-1600`** (A3) | a second statement in item 18, the bound paragraph, README or `AGENTS.md` (they link); a suggested value that would break the relation |
| 17. The broker-clock check: a forward step of at least one TTL between two successes, while the local deadline is still pending, is reported once | `EnforcementDeadline.passSucceeded`, `packages/realtime/drivers/enforcement_deadline.ts` (S1) | a check in `listRevocations` or the end site; a second timer; a check that also fires after the local deadline already fired; `>` instead of `≥` |
| 18. The reap time of the last completed enumeration | `#lastReadAt`, written only by `listRevocations`, `packages/realtime/drivers/redis.ts` (S1) | a second writer; a write before the enumeration completes; `t` carried in the slot record or the outcome; a `TIME` round trip at the end site |
| 19. The largest delay one timer can hold | `MAX_TIMER_MS`, `packages/realtime/drivers/redis.ts` (S2) | a literal `2147483647` or `2147483` elsewhere; a second cap in the deadline module |
| 20. A log-sink failure never escapes: one marked `console.error` line, the marker in the fixed prefix, both halves through `renderError` (#369 shape) | the deadline's fire callback, `packages/realtime/drivers/enforcement_deadline.ts`; the pass chain's final handler, `#startRevocationPass`, `packages/realtime/drivers/redis.ts` (two askers of the #369 rule) | a `try` around the end site; a silent `catch`; a marker after the error text; an unrendered half |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2 · **Primary dependencies**: `@lockness/realtime` only; the
new module imports `renderError` from `@lockness/contract`, an existing edge (`performance`,
`setTimeout` and `Deno.unrefTimer` are globals) · **Storage**: none; one timer, one small record
and one number per driver · **Testing**: `deno test`; FakeTime plus a stubbed `performance.now`;
FakeRedis `setTime`; #359's `serialPort`; the shared mutation harness · **Target**: server library ·
**Project type**: framework package · **Performance**: zero broker round trips, one timer per
driver, two monotonic reads per pass · **Constraints**: no wire, control-frame, manager or
option-shape change; one new boot refusal; one new WARN in three forms · **Scale**: WARN volume is
at most about one per TTL window, independent of the index size N.

### Domain model

- **Bounded context**: realtime (the Redis driver's durable-revocation re-check).
- **Vocabulary**:
  - *revocation pass*: one run of the re-check, a reap and then one `ZSCAN` page after another;
  - *enforcement bound*: `reconcileIntervalMs + 2P`, with one home;
  - *command port*: the built-in client, or one the application injects;
  - **port contract**: every command settles, within a bound the port owns;
  - *revocation TTL*: how long a durable record survives;
  - **enforcement deadline**: one timer, re-armed only by a successful pass and anchored at its
    start;
  - **episode**: the span from a deadline firing to the next success. At most one WARN per episode;
  - **pass clock**: the monotonic clock intervals are measured on;
  - **read time**: the broker's reap time `t` of a completed enumeration.
- **Entities**:
  - `RedisBroadcastDriver`, the aggregate root: it owns the pass slot (`#revocationPass`,
    `#revocationRerun`), `#lastReadAt`, the timers, the resolved configuration and the deadline;
  - `EnforcementDeadline` (internal): it owns the one deadline timer, the previous read time and
    its WARN.
- **Value objects**:
  - `RevocationTiming(reconcileIntervalMs, revocationTtlSeconds)`, **conceptual** (A7): no class
    exists. It names the pair the constructor's guard and relation enforce;
  - the pass trigger (`'timer' | 'reconnect' | 'reconnect-retry'`);
  - `RevocationPassOutcome` (`'ok' | 'failed' | 'closed'`);
  - the pass record `{ trigger, startedAt }`.
- **Invariants**:
  - at most one revocation pass runs per driver, and no timer frees its slot;
  - a broken guarantee is never silent: one WARN per episode;
  - intervals are read on the pass clock, never on the epoch stamp clock;
  - no timer is armed once `close()` has begun;
  - no log-sink failure escapes the pass or the deadline;
  - the library never judges a performance value: the deadline fires only when the library's own
    stated guarantee is falsified, at a point fixed by `revocationTtlSeconds`.
- **Out of scope**:
  - `ChannelManager`, which decides what a revocation does (untouched);
  - `@lockness/redis`'s read timeout, which the contract names but does not change;
  - #360's metric (it consumes the pass clock and outcome);
  - #368, the `close()` hang on a stalled port;
  - prevention (keeping an unapplied record alive).

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | not touched |
| JSR-only deps, declared per package | pass | no new dependency; `@lockness/contract` is already declared |
| No `any` in exported APIs | pass | nothing new is exported from `mod.ts`; the module's constants are strings |
| Tailwind v4 syntax | pass | no UI |
| Pre-completion gate | pass | per task, plus `deno task mutate realtime` and `deno task deps:analyze` |
| `deno.lock` untouched | pass | no dependency change |
| JSDoc on public APIs | pass | FR-017 lists every block; the new module carries `@fileoverview` and `@module` |
| MVC layering | pass | not applicable (driver) |
| Commit discipline | pass | test (red witnesses, the FR-016 repairs) / fix (`redis.ts`, the new module) / test (the battery, re-anchors) / docs (ADR 011, `realtime.md`, README, `AGENTS.md`) |
| No environment detail in versioned files | pass | none; D3 cites a test flag by name only |
| Design decisions go to architect-expert | pass | the disposition and the audit rulings are binding (§10, §11) |
| Product decisions go to the user | pass | refusal at boot, maintainer, 2026-09-23 |
| Act, don't recommend | pass | #368 is filed; #360 is ordered after this; the S2 and S4 backlog items are filed by the coordinator |
| TDD, red first | pass | B1, B4–B6 and D1, D2, D4–D8 are red on `main`; B2, B3 and D3 are pins |
| No silent catches | pass | the deadline's `try` and the chain's final handler both write a marked ERROR line (#369 shape) |
| Domain Model gate | pass | §6 |
| #293 boot-guard shape | pass | ranges first, then the relation |
| #355 declared return type; the one timer gate | pass | FR-009; row 9 |
| #360: the library never judges a performance value | pass | the deadline is fixed by `revocationTtlSeconds`, not by P |

### Complexity tracking

No violation. What is added:

- one internal module (one class, three constants);
- one private clock method, one private field, one module constant and one private type alias;
- a changed slot type;
- two constructor checks;
- three deadline call sites;
- one final handler;
- one JSDoc clause;
- one ADR.

The module is extracted by responsibility, not size. `redis.ts` is 3 682 lines, the package's
largest file.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` public API | yes, **breaking at boot** | `new RedisBroadcastDriver` and `fromConfig` throw for a timing outside the ranges, or for `2 × interval > TTL × 1000`; no new export |
| `RedisCommandClient` port | contract (doc) | every command must settle; nothing is enforced at runtime beyond the WARN |
| Logs | yes | one new WARN in three forms (`STALLED`, `MISSED`, `SKEWED`), at most once per episode; one marked ERROR fallback |
| Driver internals | yes | the pass slot record, the pass outcome, the pass clock, `#lastReadAt`, the deadline |
| Wire, control plane, manager, options shape, `mod.ts` | no | — |
| Tests | yes | a new witness file and battery; 3 configuration repairs (FR-016); 2 re-anchors and 2 re-verifications (§4) |
| Docs | yes | the configuration paragraph, item 18 (number at landing), the bound paragraph, README, `AGENTS.md`, ADR 011 (number at landing), JSDoc |

### Documentation (this feature)

```text
.specnaut/specs/268-revocation-pass-bound/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| An application configured with a short TTL, a long or sub-millisecond interval, or a fractional TTL no longer boots | Intended (maintainer decision). The message names both values, the ranges, the units and the fix; the configuration paragraph documents it |
| An existing FakeTime suite ticks past its TTL with no successful pass, and now sees a deadline WARN it counts | The largest single tick in a manager-backed Redis suite is 10 000 ms against a 300 s default TTL. Loops were not summed statically, so the full realtime suite runs before the first edit and after it. A suite that newly sees the WARN is examined, never silenced |
| An existing suite moves FakeRedis's clock by a full TTL between two successes, and now sees `SKEWED` | Same mitigation: the full suite runs before and after the first edit |
| A live-broker suite refuses at construction, invisible to the default gate (D3) | FR-016 repairs it; `tasks.md` records whether the live run happened |
| A battery row goes DEAD or turns into a substring match | §4 lists all 14 adjacent rows; FR-011 fixes the insertion points; `deno task mutate realtime` is in the gate |
| **Residue (A7): `'ok'` means the enumeration completed, not that every record was applied.** A record whose apply always throws expires with only its #349 WARN | Accepted. The deadline watches the guarantee's timing, not each record's apply |
| **Residue (S1): the broker-clock check** only sees what `listRevocations` reads. A third-party handler that never calls it gets the local check only. `TIME` has a 1 s granularity. A backward step is harmless (records live longer). The check detects loss; it does not prevent it | Accepted and recorded in ADR 011 |
| **Residue (S2): the #293 `heartbeatIntervalMs` overflows the same way** (a delay of 2^31 ms or more fires after 1 ms) | A backlog item, filed by the coordinator. Out of scope here |
| **Residue (S3): a throwing `console.error` is fatal**, as in #369 | Accepted; the same last line as #369 |
| **Residue (S4): a shorter-TTL peer's records expire silently** for this instance's checks | Documented assumption (row 15), ADR 011 §5; a backlog item, filed by the coordinator |
| **Residue: prevention.** A failure run longer than the TTL still lets records expire unapplied, now with a WARN | Not proposed (disposition). Retention is a separate design, probably a product question |
| **Residue: the stall itself.** After a command that never settles on a serialising port, no pass runs again | The contract is the fix and the WARN is the signal. A violating port stays broken, loudly |
| **Residue: `close()` hangs on a stalled port** (it awaits the sweep pass and the lapse run, `:3670` and `:3672`) | #368, blocked by this item |
| **Residue: precision.** Local monotonic time and broker time agree to within one round trip | Accepted |
| **Residue: `reconcileIntervalMs` lives under `presence.*`** | The error names its real path; moving the option is out of scope |
| The ADR or item number collides with another landing | Assigned at landing (D2) |

## 10. Architecture audit

*`architect-expert`, against this document before any code. Its rulings on A1–A7, on D1–D10 and on
the security findings S1–S5 are **binding** (hard rule #11), folded 2026-09-24.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | Re-registration re-armed the deadline, so a registration during a failure run could postpone a due WARN indefinitely (with S5) | Plan changed. Only the **first** registration arms, and a later one leaves a pending or fired deadline alone (FR-008.1, row 8). Witness D5 (iv); mutant N20. N17 still dies on D1 |
| A2 | An overdue arm that consults `inFlight()` at fire could name a trailing pass started by the end site as `STALLED` | Plan changed. The 0 ms timer is kept, but `MISSED` is **decided at arm time**; only a timer that expires on its own consults `inFlight()` (FR-006, FR-007, row 7). `MISSED` reworded to "no pass completed within `revocationTtlSeconds` of the last success's start". Witness D4b; mutant N19 |
| A3 | The relation would be stated in several docs | Plan changed. The #293 paragraph (`docs/realtime.md:1584-1600`) is the one operator statement of both relations; item 18 and the bound paragraph link to it (FR-017). Row 16 moved there. Row 4's duplicate column now reads "a second check or copy of the factor in code, or a second doc statement". Witnesses are pins, not copies |
| A4 | Rows 8 and 11 had layer-shaped homes | Plan changed. Row 8's home is the `#startRevocationPass` JSDoc naming the three sites and `close()`. "Unrecorded ⇒ failed" is a row of its own (11a), homed in the start site's `let outcome = 'failed'` |
| A5 | `'idle'` misnames the only case it covers | Plan changed. Renamed `'closed'`. It is equivalent to `'failed'` at the one consumer, which checks `#closing` first; no battery row (FR-009) |
| A6 | D4's H = 12 `STALLED` time was wrong: the deadline is anchored at the previous success's start | Plan changed. D4 (b) asserts `STALLED` at **s_prev + TTL**, age 9 000 ms |
| A7 | `'ok'` overstates what a pass guarantees, and `RevocationTiming` reads like a class | Plan changed. The §9 residue states `'ok'` = enumeration completed; §6 marks `RevocationTiming` conceptual |
| D1–D10 | — | **All confirmed.** D3: `tasks.md` records whether the live-broker run happened (FR-016). D4: the two DEAD rows are re-anchored, never deleted, and FR-011 keeps `RERUN_TAKE`'s 16-space indent. D9: two WARNs are two episodes, which is correct. **D10 corrected**: the port is #359's serialising `serialPort` (`revocation_paging_359.test.ts:157`), which records at issue, not a non-serialising one |
| — | Boot refusal as a plain `Error` | Confirmed (FR-005) |
| — | ADR 011 rather than an ADR 009 amendment | Confirmed. It links ADR 009 §2 and ADR 006, and leaves ADR 009 untouched (FR-017) |

**Verdict** (as relayed): the design is confirmed with A1–A7 folded. **Coverage** (as relayed): this
plan in full, including D1–D10, the decision table, the witnesses and mutants, and the blast radius.
The per-file list was not itemised in the relay.

## 11. Security audit

*`security-expert`, in parallel with the architecture audit. Each finding was ruled on by the
`architect-expert`; the rulings are binding.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | The deadline measures local time, while records expire on the broker's clock. A forward step of the broker's clock expires records unapplied, and the local check never sees it | **In scope, as a second input to the one deadline.** `listRevocations` stores the reap `t` of its last completed enumeration in `#lastReadAt`, and is its only writer (FR-009a, row 18). The end site calls `passSucceeded(startedAt, endedAt, readAt)`. The deadline keeps the previous success's `readAt`; if `readAt − prev ≥ ttlS` while its timer is still pending, it decides `REVOCATION_DEADLINE_SKEWED` at arm time (FR-006, FR-007, row 17). `t` goes into neither the slot record nor the outcome. Witness D7; mutants N25–N27. D6 pins the fake broker clock with `setTime`. Residue in §9 |
| S2 | A timing above the timer ceiling fires after 1 ms, which is the hot loop again, and a fractional TTL misbehaves | **Cap, not chunk.** The FR-003 guard: the TTL is a safe integer in [1, 2 147 483] s; the interval is finite and ≥ 1 ms, and its upper bound follows from the relation. One constant, `MAX_TIMER_MS = 2 ** 31 − 1`, in `redis.ts`, with the measured Deno 2.9.6 behaviour in its JSDoc (row 19). A fractional interval stays legal. Witness B6; mutants N21–N24. The #293 heartbeat overflow is §9 residue and a backlog item |
| S3 | The end site's logging and a rejecting pass chain could throw into the runtime when the log sink throws | **Accepted, merged with A2.** The end site never logs. Every deadline WARN is written in the deadline's own timer callback in the #369 shape: a `console.warn` that throws becomes one marked `console.error` line with both halves through `renderError`. The pass chain ends in a final handler writing the same marked line, which overrules "rejection path unchanged / out of scope". The `finally` order: capture `startedAt`, free the slot, take the rerun, call the deadline last (FR-006, FR-008.3, FR-009, row 20). Witness D8; mutants N28 and N29. Residue: a throwing `console.error` is fatal, as in #369 |
| S4 | A uniform fleet TTL is only assumed; a shorter-TTL peer's records expire silently | **Residue plus a backlog item.** Row 15 keeps the documented assumption. ADR 011 §5 records the silent expiry and the rejected remedies: fleet keys (a boot round trip, a mixed-fleet decode hazard, a min-key's lifetime) and a per-record TTL (fails open mid-deploy, `redis.ts:2651-2652`) (FR-017). The backlog item is filed by the coordinator |
| S5 | Re-registration could postpone the deadline indefinitely | Covered by A1 |

**Deviations from implementation, ruled by the `architect-expert` (2026-09-24), binding:**

- **SKEWED arms the deadline.** As planned, the `SKEWED` branch set only a 0 ms line timer, so a
  failure run right after a skewed success left no deadline pending. Ratified: the line is written,
  then the ordinary deadline is armed (witness D7 (iv), row N30).
- **A decided line is carried, never dropped by `arm()`** (a defect found in review). A 0 ms timer
  lands after about 2.5 ms on Deno 2.9.6, and two loopback round trips beat it 199 times in 200, so
  a fast rerun's `arm()` erased a decided `MISSED` or `SKEWED`. Decided lines now sit in
  `#unwritten`; an `arm()` that finds one writes it on a 0 ms timer, then arms the remaining time;
  the `SKEWED` branch is "decide, then `arm(delayMs)`"; only `close()` drops them (witness D7 (v),
  row N31). Residue: a `close()` inside that window still drops the line, which is accepted.
  **Correction (#383, 2026-09-26):** the sentence above claimed D7 (v)/N31 covered "a decided
  `MISSED` or `SKEWED`"; they cover only the `SKEWED` half. The overdue-`MISSED` half of the same
  carry had no witness — #362's own D4b holds the trailing pass, so it never races the carry's 0 ms
  flush timer. #383 adds D4c (the race, unheld) and battery row N38 (reverts the carry to a direct
  write), and relocates N31 from `arm()`'s own check to the top of `passSucceeded`, so it can only
  erase a line CARRIED IN from an earlier call rather than one this same call had just decided.
- **`startedAt` comes from the start site's closure** (FR-008.3.1 amended), and
  `REVOCATION_LOG_FAILED` stays internal to `enforcement_deadline.ts` (not exported from `mod.ts`;
  in `redis.ts` it would be a cycle).

**Verdict** (as relayed): all findings ruled on and folded above. **Coverage** (as relayed): the
stall, the relation and its ranges, the clocks (local and broker), log-sink failure, the fleet TTL
assumption and re-registration. The per-file list was not itemised in the relay.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Should a configuration that booted before now refuse to boot? | **Yes, refuse at boot** (the constructor throws), like the #293 guard. Decided, not a default; no warn-only release | 2026-09-23 |
| Approve the architecture as audited (tasks → implement → review)? | _Asked at stop 1._ | — |

### Decided without asking

- The design is the #362 `architect-expert` disposition (2026-09-23), binding under hard rule #11,
  as amended by the audit rulings A1–A7 and S1–S5 (2026-09-24).
- **D2:** a new ADR 011 rather than an ADR 009 amendment, and item 18. Both numbers are assigned at
  landing.
- **D3:** `redis_broker_integration.test.ts:387` is repaired with `reconcileIntervalMs: 15_000`.
- **D5:** every B witness asserts which message fired, and B5 gains Infinity.
- **D6:** a wall-clock-step witness pins the monotonic clock.
- **D7:** a registration after `close()` arms nothing, and `#closing` stays the one timer gate.
- **D8:** the no-pass-in-flight WARN covers slow passes as well as failing ones.
- **D9:** a pass longer than the TTL WARNs twice, since it opens a second, already-broken window.
- The pass slot keeps no promise, because nothing awaits it. It holds `{ trigger, startedAt }`.
- Both refusals stay plain `Error`s (the #293 and `control.windowMs` shape). No class is exported.
- The deadline takes `inFlight` as a getter rather than the trigger type, so the module never
  imports `redis.ts`, and there is no cycle.
- `RERUN_TAKE` stays contiguous at its 16-space indent and `:1501` is not edited, so #359's rows
  keep their anchors.
- "First registration" is read as `this.revocationHandler === undefined` before the assignment. A
  handler dropped by `close()` cannot re-open it, because `#closing` gates the arm.
- N20 and N28/N29 were added so that D5 (iv) and D8 each kill a named mutant.
- B6 runs at interval 1 000, so the relation cannot refuse first and hide the guard.
- #360 lands after this, and consumes `#passClock`, the slot record and the outcome.
