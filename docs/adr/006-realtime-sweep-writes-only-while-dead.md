# ADR 006 — One sweep pass at a time, and a sweep writes only while its target is dead

**Status:** Accepted, amended by
[ADR 007](007-realtime-lapsed-instance-reasserts.md) (§5) and
[ADR 008](008-realtime-sweep-reads-owned-set-in-pages.md) (§2, §5, §6) **Date:**
2026-09-23 **Owner:** architect **Amends:**
[ADR 004](004-realtime-roster-slots-held-per-instance.md) §2, §5 and
[ADR 005](005-realtime-swept-departures-announced.md) §2, §5 **Affects:**
`packages/realtime/drivers/redis.ts`, `docs/realtime.md`,
`packages/realtime/AGENTS.md`

---

## 1. The question

The Redis driver's ghost sweep ran on a bare `setInterval`. A pass slower than
the interval — a slow broker, on a command client that runs one exchange at a
time — got a second pass started beside it, then a third. Exactly-once held (the
release script is atomic), but three defects shared the incident:

- **Overlap.** K passes in flight issued K times the `SMEMBERS`, `EXISTS`,
  `EVAL` and `SREM`, on the broker that was already the reason the pass was
  slow.
- **A dishonest log.** The sweep counted every release it _issued_, so an
  overlapping pass that removed nothing still logged
  `released N hold(s) of dead instance <id>`.
- **A stale precondition.** The pass read `EXISTS alive:<id>` once, then kept
  releasing. An instance that had only lapsed and renewed mid-sweep kept losing
  holds, and the final raw `SREM` deregistered a live instance — and, on an
  instance that took a hold after the sweep read its owned set, orphaned that
  hold (ADR 004 §5).

Tracked as
[#355 — Realtime: run one Redis reconcile pass at a time, sweep only while the target is dead, and count only effective releases](https://github.com/locknessland/lockness-monorepo/issues/355).

---

## 2. The decision

### One pass per driver, by construction

`#armReconcile()` is the **single arming site** of the sweep timer. It arms one
`setTimeout(reconcileIntervalMs)` whose callback stores the pass in
`#reconcilePass`, runs `#reconcile()`, and re-arms from the pass's `finally` —
so the next interval starts when this pass ends, success or failure. It returns
without arming while `close()` is in progress. There is no in-flight flag and no
trailing pass: the sweep is level-triggered, every pass re-reads the instance
set and each liveness key, so a pass that did not run loses nothing.

The heartbeat stays an **unguarded `setInterval`**: a guard would turn one slow
renewal into a missed one — a lapse — while an overlapping beat is a harmless
repeat. `#ensureSweepStarted` arms it only while not closing.

### `close()` waits for the pass

`close()` sets `#closing`, clears every timer, drops the revocation handler
**synchronously** (a reconnect during the wait runs nothing and arms no retry),
awaits `#reconcilePass`, then drops the departure handler and closes the owned
connections. The pass reads `#closing` at exactly three points — the top of each
instance, before each release, before the deregistration — and never between a
release reply and the departure handler, so an in-flight release's departure is
still announced (ADR 005's order is unchanged).

> **Amended by [ADR 008](008-realtime-sweep-reads-owned-set-in-pages.md)
> (2026-09-23).** The owned set is read in `SSCAN` pages, and the pass reads
> `#closing` at **four** points: the top of each instance, **before each page
> read**, before each release, and before the deregistration. A page read never
> sits between a release reply and the departure handler either.

### A sweep writes only while its target is dead — decided inside the write

`RELEASE_MEMBER_SCRIPT` gains `KEYS[4]`, the **releaser's** liveness key, and
`ARGV[4]`, `'1'` when the release is on another process's behalf. With `'1'` its
first statements read that key and answer **refused** before any read or write
when it exists. Only the sweep asks; a leave passes `'0'` and is never refused.
`#release` builds `KEYS[4]` from `releaserId` and nowhere else — the sweeper's
own key would refuse every sweep release forever.

The final raw `SREM` becomes `DEREGISTER_INSTANCE_SCRIPT`: it deregisters only
while the instance is **dead and owns nothing** — its liveness key absent (else
**renewed**) and its owned set absent (else **kept**, a late hold left for the
next pass). `EXISTS`, not `SCARD`: Redis deletes an emptied set.

The `EXISTS` in `#reconcile` now only **selects** candidates; it never
authorises a write. The heartbeat writes the liveness key **before**
`SADD instances`, and still attempts the `SADD` when the `SET` failed.

### The replies name their outcomes

The release answers one of four: the released entry (**emptied**), `KEPT`
(**kept** — other holders keep the slot), `0` (**absent** — the releaser held
nothing there) or `REFUSED` (**refused**). The deregistration answers `0`
(**deregistered**), `REFUSED` (**renewed**) or `KEPT` (**kept**). `KEPT = 2` and
`REFUSED = 3` are two named constants interpolated into both scripts and read by
both decoders — never `1` (a pre-#348 reply that must still throw), never
negative. `decodeReleaseReply` and `decodeDeregisterReply` are the only places a
reply is given meaning; anything else throws a **constant** message that never
carries the reply's bytes. `releaseMember` still answers only `gone` (emptied →
`true`, kept / absent → `false`) and throws on refused, which a leave never asks
for.

### The sweep counts what it removed, one line per instance

`#sweepOwned` counts N = emptied + kept and E = emptied as each reply is
decoded, and returns how the sweep ended — `completed`, `closed` or `renewed`; a
throw becomes `failed` in `#sweepInstance`'s per-instance `catch`.
`#sweepInstance` is the ONE log site, so an exit added later cannot skip the
line or write a second: exactly one WARN per swept instance, or none:

- **released** — when N > 0, whether the sweep completed or `close()` cut it
  short (amended 2026-09-23: the count covers every hold removed); nothing when
  N is 0. The line reads
  `released N hold(s) of dead instance <id> (E emptied their slot)`;
- **renewed** — a release or the deregistration answered refused: the sweep of
  that instance stops, with no further release and no deregistration;
- **failed** — anything thrown while sweeping that instance, caught by a
  per-instance `catch`: no deregistration, retried next pass, and the pass goes
  on to the next instance.

> **Amended by [ADR 008](008-realtime-sweep-reads-owned-set-in-pages.md)
> (2026-09-23).** The ends are four: `completed` now means **deregistered**
> only, and **`kept`** is new — one full scan, then the deregistration answered
> _kept_ (a hold that landed behind the scan's cursor, or an unparsable entry).
> On a `kept` or `closed` end with N > 0 the "released" line ends
> `— unfinished: it stays registered and a later pass resumes it`; `completed`
> has no suffix, and N = 0 stays silent on every end. "failed" may now follow a
> page read.

---

## 3. Why this shape

- **A self-re-arming timeout makes "one pass" structural.** An in-flight flag
  would be a second piece of state that has to agree with the timer; the timeout
  has nothing to agree with.
- **The check belongs inside the write.** Any TypeScript `EXISTS` before an
  `EVAL` races the renewal it is checking for. One more `EXISTS` inside a script
  costs no round trip.
- **Deregistration needs both conditions.** Liveness alone narrows ADR 004 §5's
  orphan but does not close it: a still-lapsed instance can take a hold between
  the owned-set read and the deregistration.
- **Containment per instance.** One unreadable owned set must not starve every
  other dead instance's sweep, fleet-wide.

---

## 4. Rejected, and what each would have cost

- **An in-flight flag on the interval.** A second source of truth beside the
  timer, and a missed pass whenever the two disagree.
- **A coalesced trailing pass.** Work for a level-triggered sweep that loses
  nothing by skipping a pass.
- **A TypeScript `EXISTS` before each release or the deregistration.** Races the
  renewal; the window it leaves is the defect.
- **A second release script for sweeps.** Two definitions of "release" that can
  drift (ADR 004 rejected it for the same reason).
- **A sweep lock or leader.** Cross-instance coordination the atomic scripts
  already make unnecessary for correctness.
- **A whole-pass catch** (starves every later instance), or **a catch in
  `#reconcile` around `#sweepInstance`** (splits reporting, loses N and E).
- **Deregistration on liveness alone** (the late-hold orphan stays), **the owned
  set replacing liveness** (loses the "renewed" signal), **the sweep deleting
  unparsable owned entries** (needs its own guarded script), and **the hold
  script refusing while lapsed** (a product decision, not this item's).

---

## 5. What this does not solve

- **Cross-instance overlap.** Two different instances sweeping the same dead one
  both read and `EVAL` every entry; exactly-once still holds.
- **Latency.** The crash `left` arrives up to the liveness TTL plus the
  reconcile interval **plus one pass**. `close()` can wait up to two broker
  round trips plus one departure-handler call (about a minute at `fromConfig`'s
  30 s command timeout).
- **An unparsable owned entry** keeps a dead instance registered: it is re-read
  every pass and never deregistered.
- **Mixed `0.3.0` / `0.4.0` fleet.** A `0.3.0` sweeper has no liveness check,
  releases a renewed instance's holds and deregisters with a raw `SREM`.
- ~~**An owned set too large for one reply** is never swept; an SSCAN-budgeted
  sweep is filed separately.~~ **Closed by
  [ADR 008](008-realtime-sweep-reads-owned-set-in-pages.md)**
  ([#358](https://github.com/locknessland/lockness-monorepo/issues/358)): the
  owned set is read in bounded `SSCAN` pages, one full iteration per pass, with
  no budget.
- **Re-holding a lapsed instance's swept slots** is
  [#349](https://github.com/locknessland/lockness-monorepo/issues/349).

> **Amended by [ADR 007](007-realtime-lapsed-instance-reasserts.md)
> (2026-09-23).** Re-holding is **solved**: the heartbeat's `SET … GET` reports
> the lapse, and the lapsed instance re-asserts its slots itself. `close()` now
> also closes that lapse run — right after the timers, synchronously — and
> awaits it after the pass, on its own line, before it drops the departure and
> the refusal handlers.

---

## 6. The standing constraint

**The sweep timer is armed only by `#armReconcile`, and `#reconcile` has one
caller, the callback it arms.** A sweep write is authorised only inside its own
script, by the target's liveness key (and, for the deregistration, its owned
set) — never by a read that precedes it. A release or deregistration reply means
only what its decoder says.

> **Amended by [ADR 008](008-realtime-sweep-reads-owned-set-in-pages.md)
> (2026-09-23).** And the owned set is read only by `#sweepOwned`'s `SSCAN`,
> with `COUNT` set to `OWNED_SCAN_COUNT` and no other option: no sweep read
> grows with the owned set.
