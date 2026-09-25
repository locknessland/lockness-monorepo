# ADR 014 — `close()` bounds its drain at the liveness TTL

**Status:** Accepted **Date:** 2026-09-25 **Owner:** architect **Affects:**
`packages/realtime/drivers/redis.ts`,
`packages/realtime/drivers/close_drain.ts`, `docs/realtime.md`,
`packages/realtime/AGENTS.md` **Amends:** ADR
[006](006-realtime-sweep-writes-only-while-dead.md) §2, §5, ADR
[007](007-realtime-lapsed-instance-reasserts.md) §5 (S5) **Strikes as closed:**
ADR [011](011-realtime-revocation-bound-is-checked.md) §4's "`close()` still
hangs on a stalled port" residue

---

## 1. The question

`RedisBroadcastDriver.close()` (`packages/realtime/drivers/redis.ts`) awaits its
ghost-sweep pass (`await this.#reconcilePass`), then its lapse run
(`await stopped`, ADR 007's order). The command port serialises every exchange
(`RedisCommandClient`, #362's contract): one exchange in flight at a time, in
call order. If an injected port has a command that never settles, the pass — or
the command it is queued behind — never settles either, so `close()` never
returns: a graceful shutdown hangs forever, and the owned ports are never
closed.

This is the ghost sweep's version of #362's L3. #362's disposition (2026-09-23,
residue 3) named it for separate filing; #362 itself bounds only the
**revocation** pass, and its own port contract (`RedisCommandClient`: every
command settles, within a bound **the port owns**) does not cover the two app
handlers `close()` also awaits — the departure handler and the lapse re-check
apply. The built-in client is not affected in practice: `READ_TIMEOUT_MS`
(`packages/redis/resp.ts`) bounds every round trip; only an injected port that
violates the contract reaches this.

Tracked as
[#368 — Realtime: close() hangs forever on a stalled injected command port because it awaits the sweep pass](https://github.com/locknessland/lockness-monorepo/issues/368).
The design comes from the `architect-expert` disposition on #368 (2026-09-25).

## 2. The decision

**`close()` waits for the work it has in flight for at most one liveness TTL.**
When that expires it writes one WARN and carries on with the rest of its
teardown. It never cancels a command and never frees the sweep slot. From that
point a stalled close behaves exactly like a crash, which is the failure the
sweep was built to survive (ADR 005, ADR 006).

The options the issue named were not a closed set. This is a third shape:
bounded, but the bound is not a new timeout — it is the driver's **existing**
definition of when a silent instance counts as dead.

### The bound

`Math.min(this.livenessTtlSeconds * 1000, MAX_TIMER_MS)`, computed by `close()`
itself. There is no new tuning constant. The heartbeat stopped when `close()`
began; after one TTL, peers are entitled to sweep this instance, so the graceful
work has already been overtaken by the fleet's own crash handling.
`MAX_TIMER_MS` is reused so an oversized TTL cannot overflow to a 1 ms timer
(the #293/#381 family).

### The one home: `drivers/close_drain.ts`

A new internal module, following the precedent of `lapse_run.ts` and
`enforcement_deadline.ts`: concrete, not exported from `mod.ts`, full JSDoc. It
exposes one function, `awaitCloseDrain(budgetMs, sweepPass, lapseRun)`.

- It arms **one** timer, deliberately **ref'd** — unlike every other timer this
  driver holds. Its job is to let an awaited call finish: a stall that holds no
  I/O must still let `close()` resolve, and an unref'd timer is not guaranteed
  to fire when nothing else keeps the event loop alive.
- It awaits the sweep pass, then the lapse run (ADR 007's order), both against
  that **one shared** expiry. The order now lives in one place instead of two
  sequential `await` lines.
- It clears the timer once both have settled, and returns which of the two were
  still pending when the timer expired.

### `close()`

Everything up to and including `this.revocationHandler = undefined` is
unchanged: `#closing` first, #355 A1 (the revocation handler dropped
synchronously, before any wait), and the synchronous `#lapse.close()`. The two
sequential awaits become one `awaitCloseDrain` call. The handler drops and the
owned-connection closes then run exactly as before, **whether or not the timer
expired**.

### The log

One WARN, marker `CLOSE_DRAIN_EXPIRED`, in the #369 shape: `console.warn` first;
if that throws, one marked `console.error` line through `writeMarkedFallback`
(`CLOSE_LOG_FAILED`, #391) — never a throw that escapes `close()`. It names what
was still pending — the sweep pass, with its age read from `#sweepPass`, and/or
the lapse run — and the budget. It points at the `RedisCommandClient` contract
and at the handlers this instance drops regardless. It carries no member,
channel or instance id.

### The pending pass after `close()` returns

It stays in `#reconcilePass`, and only its own `finally` (in `#armReconcile`)
clears it — `close()` never frees the sweep slot. `#closing` is terminal and
blocks any re-arm, so ADR 006 holds. If its command settles later, the pass
issues nothing more: the four `#closing` checks (ADR 006, amended by ADR 008)
stop it. A release reply that arrives after `close()` has returned finds
`#departureHandler` undefined, and `onControlRefused` already dropped — both
read at call time, so no hook fires after `close()` returns (#348, #349).

## 3. Rejected, and what each would have cost

- **The #362 contract alone**, relying on `close()` to inherit it. The hang
  stays silent (`close()` itself closes the enforcement deadline, which is the
  only thing that would otherwise report a stall). The contract does not cover
  the two app handlers `close()` also awaits. It creates an ownership deadlock:
  an injected port is closed by the app, only after `close()` returns, and
  closing that port is what would settle the stuck command. While the process
  lingers, the durable revocation re-check is already off — a strictest-security
  cost.
- **A fixed timeout** (about 60 s, taken from `READ_TIMEOUT_MS`): fits exactly
  the one port that never stalls. For an injected port it is a guess; it needs
  either a new export from `@lockness/redis` or a copied literal that will
  drift; at 60–90 s it is longer than common stop grace periods, so the WARN
  often never gets written.
- **A watchdog WARN that keeps waiting.** Keeps every guarantee bit for bit, but
  the process still never exits — the same deadlock and security cost as the
  contract-alone shape.
- **A caller-owned budget** (`close(signal)` or a `closeTimeoutMs` option).
  Deferred, not rejected: it adds new public surface that still needs this
  default, and every caller today would pass the same value
  (speculative-generality). File it when a real port needs a longer drain.
- **Cancelling** the stalled command, freeing the slot, or closing the injected
  port from inside `close()`. The driver cannot cancel a command (#362); freeing
  the slot breaks ADR 006; the injected port belongs to the app.
- **One budget per await** (a fresh timer for the sweep pass, another for the
  lapse run). On a serialising port both waits sit behind the same command, so
  this doubles the hang for nothing.

## 4. What this does not solve

1. **The stalled command itself.** It is never cancelled. On an injected port it
   ends when the app closes its port.
2. **A late-settling sweep release.** It commits with no `left`. The #348
   announcement of an in-flight release is lost at expiry — ADR 005's "lost
   frames" residue: clients heal on resubscribe.
3. **A late lapse run.** The last-page apply of a late re-check may still run
   leaves and roster writes after `close()` returns. These only remove access
   (#359 FR-013); a late re-assert hold is swept along with this instance.
4. **Logs after `close()` returns.** The sweep's per-instance line and
   `SWEEP_LOG_FAILED` can still be written. They are logs, not hooks.
5. **Slow but contract-honouring ports.** A port or broker that takes longer
   than one TTL per command, while honouring its #362 contract, gets crash
   semantics.
6. **The owned connections' close.** It stays outside the budget.
   `RedisClient.close()` queues `QUIT` behind the command in flight, which
   `READ_TIMEOUT_MS` bounds.
7. **A second `close()`** writes a second WARN.
8. **Revocation passes** are still not awaited (#359). A ghost-sweep stall
   outside `close()` is still reported only by #360's metric.
9. **No deadline on the sweep pass itself.** This bounds `close()`'s wait, never
   the pass — the #362 disposition's ruling that the sweep enforces no TTL-bound
   guarantee is unchanged.

## 5. Related

- ADR [006](006-realtime-sweep-writes-only-while-dead.md) §2 ("`close()` waits
  for the pass") and §5 (latency): both amended here — the wait is now bounded,
  and its cost is the TTL budget, not an unbounded broker round trip.
- ADR [007](007-realtime-lapsed-instance-reasserts.md) §5, S5 ("`close()` waits
  for the run in flight"): amended — the wait is the same shared budget, not a
  second unbounded one.
- ADR [011](011-realtime-revocation-bound-is-checked.md) §4: its "`close()`
  still hangs on a stalled port (#368)" line is closed by this record.
- The port contract itself, and the revocation pass's own bound, are ADR
  [011](011-realtime-revocation-bound-is-checked.md) — unchanged, and not
  restated here.
- ADR [005](005-realtime-swept-departures-announced.md): what a swept departure
  means; unchanged by this record's residue 2.
