# ADR 011 — The Redis revocation bound is checked: at boot, and at runtime

**Status:** Accepted **Date:** 2026-09-24 **Owner:** architect **Affects:**
`packages/realtime/drivers/redis.ts`,
`packages/realtime/drivers/enforcement_deadline.ts`, `docs/realtime.md`,
`packages/realtime/AGENTS.md`

---

## 1. The question

The revocation re-check exists for one guarantee: **a revocation whose one-shot
control frame was lost is still applied, within a known bound.** That bound has
one home, the `onRevocationReconcile` JSDoc in
`packages/realtime/drivers/redis.ts`, and this record does not restate it. A
durable revocation record lives `revocationTtlSeconds`; when the bound exceeds
the TTL, the record expires before any pass applies it, and the revoked socket
keeps its access. The #359 security review found two ways this happened, and
nothing reported either
([#362](https://github.com/locknessland/lockness-monorepo/issues/362)):

- **L3: a pass that never settles stops enforcement for the driver's life,
  silently.** One pass runs at a time (ADR
  [006](006-realtime-sweep-writes-only-while-dead.md)), and the next is armed
  from its end. A command port command that never settles holds that end forever
  — no pass, no timer, no log line. The built-in client bounds every round trip;
  an injected port had no such duty.
- **L4: the bound was never compared with the TTL, and neither value was
  validated.** A `NaN`, zero, negative or infinite interval reached `setTimeout`
  as 0 ms and re-armed both the revocation pass and the ghost sweep back to back
  — a hot loop against the broker. A `NaN` TTL passed every comparison.

## 2. The decision

### The port owns the settle bound

`RedisCommandClient` carries a second contract beside the #348 one: **every
command settles**, within a bound the port owns. `RedisClient` meets it through
its read timeout. The driver does not cancel a command: a per-command timeout
around the port would be a second clock for the same duty, and it could not
release the serial queue a non-settling command holds anyway.

### Ranges, then the relation, refused at boot

The constructor checks the pair in the #293 shape, and both refusals are plain
`Error`s with distinct messages:

- **ranges**: the interval is finite and at least 1 ms; the TTL is a safe
  integer of seconds from 1 to `⌊MAX_TIMER_MS / 1000⌋`. `MAX_TIMER_MS` is
  `2 ** 31 - 1`: measured on Deno 2.9.6, a longer delay fires after 1 ms, which
  is the hot loop again. The interval's own ceiling follows from the relation;
- **the relation**: `2 × reconcileIntervalMs ≤ revocationTtlSeconds × 1000`. At
  any wider interval, one failed pass lets a lost revocation expire before the
  next applies it; the factor also leaves the runtime deadline at least half a
  TTL of headroom over healthy passes, so it never fires on them.

The operator statement of both, and the fix (lower the interval or raise the
TTL), is the configuration paragraph of
[`docs/realtime.md`](../realtime.md#revocation-timing). The maintainer chose a
refusal over a WARN (2026-09-23): a timing that cannot keep the guarantee is a
misconfiguration, not a degradation.

### One deadline, anchored at the last success's start

`EnforcementDeadline` (`drivers/enforcement_deadline.ts`, internal) holds one
timer. The guarantee is broken exactly when no pass has completed within one TTL
of the **start** of the last success — a record written just after that start
may be missed behind its cursor and must be applied by the next pass — so a
success re-arms it `ttl − (end − start)` from its end. A failed pass leaves it
alone. It moves at three sites and `close()`, named in the
`#startRevocationPass` JSDoc: the first registration arms it, the start records
the pass, and the end re-arms it last, for an `ok` pass while `close()` has not
begun.

When it expires it writes one line and never re-arms itself: `STALLED` naming
the pass in flight (its trigger and age) when one is, `MISSED` otherwise. An
overdue arm — a success whose own window is already broken — decides `MISSED` at
arm time, so a trailing pass started in between is never named as stalled. One
episode is one line, however long it lasts. The pass slot is never freed by the
deadline: a stalled pass is reported, not abandoned.

Intervals are measured on one monotonic pass clock, `#passClock()`; the epoch
`now()` is the control-frame stamp clock, and a wall-clock step would corrupt an
interval.

### The broker's clock is checked too

Records expire on the broker's clock, which the local deadline cannot see.
`listRevocations` records the reap time of each completed enumeration
(`#lastReadAt`, its only writer). When two consecutive successes' reap times are
at least one TTL apart while the local deadline is still pending, the deadline
writes `SKEWED`, naming both. A step after the local deadline already fired adds
nothing to that episode. The `SKEWED` timer then arms the ordinary deadline, so
a failure run right after a skewed success is still reported. **Only `close()`
drops a line that is decided but not yet written**: an `arm()` that finds one —
a fast rerun ending before the 0 ms timer, as a failover's reconnect pass does —
writes it first and then arms the remaining time, because a 0 ms timer lands
after a few milliseconds and `SKEWED` is the only report of that loss.

### No log sink failure escapes

Every deadline line is written in the deadline's own timer callback, never from
the pass's end site, in the #369 shape: a `console.warn` that throws becomes one
marked `console.error` line, the marker in the fixed prefix and both halves
rendered. The pass chain ends in a handler that does the same for a rejection,
which happens only when a log sink itself threw (#349).

## 3. Rejected, and what each would have cost

- **A driver-side timeout per command.** A second clock for the port's own duty,
  and no release of the serial queue behind the stalled command.
- **Freeing the pass slot on a timer** (a `Promise.race`). Two passes at once
  against one serial port, which ADR 006 and #359 rule out; and the second pass
  would queue behind the stalled command anyway.
- **A WARN instead of a refusal at boot.** A deployment that cannot keep the
  guarantee would run, and the first sign would be a revoked socket that stays
  connected.
- **A per-pass duration threshold.** It judges a performance value, which the
  #360 ruling rejects; the deadline fires only when the stated guarantee is
  falsified, at a point fixed by `revocationTtlSeconds`.
- **Anchoring at the end of the last success.** It lets a slow success extend
  the window by its own length, so a broken guarantee would go unreported.
- **Chunking a long delay over several timers.** A cap at one timer is simpler,
  and no useful TTL needs more than 24 days.
- **A generic deadline runner, or an export from `mod.ts`.** One consumer;
  `lapse_run.ts` set the concrete, internal precedent.

## 4. What this does not solve

- **`ok` means the enumeration completed**, not that every record was applied. A
  record whose apply always throws expires with only its #349 WARN.
- **The broker-clock check** sees only what `listRevocations` reads: a
  third-party handler that never calls it gets the local check only. `TIME` has
  a one-second granularity; a backward step is harmless (records live longer).
  It detects loss; it does not prevent it.
- **Prevention.** A failure run longer than the TTL still lets records expire
  unapplied, now with a WARN. Retention is a separate design.
- **The stall itself.** After a command that never settles on a serialising
  port, no pass runs again. The contract is the fix and the WARN is the signal.
- **`close()` still hangs on a stalled port**
  ([#368](https://github.com/locknessland/lockness-monorepo/issues/368)).
- **The #293 heartbeat overflows the same way** (a delay of 2^31 ms or more
  fires after 1 ms); it is tracked separately.
- **A throwing `console.error` is fatal**, as in #369.
- **Precision.** Local monotonic time and broker time agree to within one round
  trip.

## 5. The fleet

A record lives for its **writer's** TTL, extended upward by `ZADD … GT`. Both
checks use **this** instance's TTL, so a peer configured with a shorter one
writes records that expire silently as far as this instance's checks go. The
docs state the TTL is assumed uniform across the fleet. Rejected remedies:

- **fleet keys** publishing each instance's TTL: a boot round trip, a
  mixed-fleet decode hazard, and the question of how long a minimum key lives;
- **a per-record TTL** read back from the index: it fails open mid-deploy,
  because an instance running an older release cannot decode the new member and
  skips it.

## 6. Related

- ADR [009](009-realtime-revocation-recheck-reads-index-in-pages.md) §2, the
  paged read this watches, is unchanged.
- ADR [006](006-realtime-sweep-writes-only-while-dead.md), one pass at a time.
- #360 consumes the pass clock, the pass record and the outcome. _Update (#360,
  2026-09-24): the pass record gains `pages`, its one mutable member, and the
  outcome alias becomes `PassOutcome`, shared with the ghost sweep — see
  [ADR 012](012-measurements-reach-the-app-through-a-seam.md)._
