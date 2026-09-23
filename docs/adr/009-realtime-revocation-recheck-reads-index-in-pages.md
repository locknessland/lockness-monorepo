# ADR 009 — The revocation re-check reads the index in pages, one pass at a time

**Status:** Accepted **Date:** 2026-09-23 **Owner:** architect **Amends:**
[ADR 006](006-realtime-sweep-writes-only-while-dead.md) §2 and
[ADR 008](008-realtime-sweep-reads-owned-set-in-pages.md) §5 **Affects:**
`packages/realtime/drivers/redis.ts`, `packages/realtime/driver.ts`,
`packages/realtime/manager.ts`, `packages/realtime/tests/fake_redis.ts`,
`docs/realtime.md`, `packages/realtime/AGENTS.md`

---

## 1. The question

The Redis driver's durable revocation re-check ran `LIST_REVOKED_SCRIPT` on the
instance's **shared** command client. The script reaped expired revocations and
then answered **every** live one in a single reply:
`return redis.call('ZRANGEBYSCORE', KEYS[1], t, '+inf')`. Nothing bounded that
reply, and the re-check runs on every instance, on every tick, and once per
lapse since [ADR 007](007-realtime-lapsed-instance-reasserts.md).

The index is bounded by time, not by count: each record lives
`revocationTtlSeconds`, and every `revoke` / `revokeChannel` adds one member. A
channel-scoped member is up to 602 bytes, so about 55,000 maximal records cross
the client's 32 MiB `MAX_REPLY_BYTES`. Once they did:

- **Every consumer of the client was refused.** The reader threw, the client
  dropped its socket and opened its refusal window — on every instance, every
  tick, for as long as the index stayed that large.
- **The re-check enforced nothing.** It failed every tick, so a revoke whose
  one-shot control frame was lost was never recovered.
- **Heap before the cap.** Below it, the reply was still parsed whole, at about
  20× its wire size.

Allocation without limits on a shared resource (CWE-770) — the class
[ADR 008](008-realtime-sweep-reads-owned-set-in-pages.md) closed for the ghost
sweep's read. Tracked as
[#359 — Realtime: the revocation re-check reads every live revocation in one reply that can breach the shared client's reply cap](https://github.com/locknessland/lockness-monorepo/issues/359).

---

## 2. The decision

### The reap is the only delete, and it answers the pass's one `now`

`REAP_REVOKED_SCRIPT` replaces `LIST_REVOKED_SCRIPT`. It reads `TIME`, runs
`ZREMRANGEBYSCORE <index> -inf t` as a bare call statement, and returns `t` —
one integer's worth of reply, whatever the size of the index. It is the pass's
only delete. `decodeReapReply` accepts only a bulk string matching
`EPOCH_SECONDS` (canonical, at most 15 digits), the one epoch-seconds grammar;
anything else throws a constant message.

### The read is `ZSCAN` pages, and it deletes nothing

`listRevocations` then reads the index with
`ZSCAN <index> <cursor> COUNT REVOCATION_SCAN_COUNT` (100, not configurable) and
no other option, from cursor `'0'` until the cursor comes back `'0'`: one full
iteration per pass, no budget, no resume state, no page counter. An empty page
with a non-zero cursor does not end it. `decodeRevocationPage` decodes each page
on ADR 008's `decodeScanReply`; it is the one home of a well-formed pair.

### Liveness is judged against the carried `now`

A record is live iff its score is **strictly above the reap's `t`**. The reap's
`t` is carried to every page and never re-read — not a `TIME` per page, and
never the instance's clock.

**Why the split does not re-open #276.** #276's race was a read in one round
trip acted on by a delete in a later one. Here the delete is still one script
bounded by its own `TIME`, so it cannot remove a record live at that second; the
read deletes nothing; and `t` is carried, so a later page never judges liveness
against a later clock than the reap used. A record another instance's reap
removes mid-pass had expired at that reap's `now`, so missing it is correct.

### The caller says which targets it keeps: `owns`

The port gains one optional parameter: `listRevocations(owns?)`. The manager
passes `(target) => this.connections.has(target)`, and the Redis driver drops
every record `owns` rejects as it pages — so an instance holds one page of other
instances' records at a time, plus its own matches. The manager still decides:
its own `connections.has` check stays, so a driver that ignores `owns` is
correct. What a port implementation must return is stated once, in the
`listRevocations` JSDoc of
[`packages/realtime/driver.ts`](../../packages/realtime/driver.ts).

### Nothing is applied before the enumeration ends

The manager's re-check awaits the **whole** `listRevocations` result, then
groups channel records by pair, then applies. There is no per-page callback and
no iterator: applying page by page would re-open #337 across page boundaries —
two records of one pair on two pages would leave the room twice, and the second
leave would kick a client that had legitimately re-subscribed.

### One pass per driver, and one re-check per manager

**The driver.** `#armRevocationReconcile` is the single arming site of the
revocation timer: one `setTimeout`, never a `setInterval`. **The timer is armed
from the end of the pass that consumed it; an edge-triggered pass never moves a
pending timer.** `#startRevocationPass` is the single entry for all three
triggers — the timer, the reconnect seam and the #308 retry. While a pass is in
flight, a timer starts nothing, and a reconnect or a retry is recorded in one
slot (`'reconnect'` wins): however many arrive, **one** trailing pass follows.
It returns nothing, so no caller mistakes a coalesced request for its own
finished pass.

**The manager.** `reconcileRevocations()` is a gate onto a private serial tail
(the ADR 003 slot-tail idiom). Its two callers — the driver's pass and the lapse
run's re-check — are each one at a time, but they are independent of each other,
so without the tail they could overlap: one run leaves pair X and clears its
record, the client re-subscribes, and the other run, still holding the record
from its older snapshot, kicks it again. Each run starts only after the previous
one has settled and reads the index afresh; a rejected run never stops the next,
and its caller still sees the rejection. The tail is never coalesced: it is at
most two deep by construction.

### A malformed pair is counted and logged, never silent

Inside a well-formed page, a pair whose member is not a string, or whose score
is not canonical epoch seconds (`inf`, `+inf`, a decimal point, an exponent), is
skipped **and counted**. After the loop ends, a nonzero count is one WARN per
pass — `REVOCATION_PAIRS_SKIPPED` and the number, never member or score bytes. A
broker that formats scores differently would otherwise leave every revocation
unenforced without a line. It is not a throw: a planted `+inf` member is never
reaped, and a throw would fail every pass. A malformed **page** (an envelope, an
odd item list) or a closing driver throws, and never answers `[]`.

### No budget, and the bound it leaves

A pass takes as many round trips as the index has pages, one at a time, and no
budget caps them. The lost-frame enforcement bound this leaves — its formula,
its terms and when it holds — is stated once, in the `onRevocationReconcile`
JSDoc of
[`packages/realtime/drivers/redis.ts`](../../packages/realtime/drivers/redis.ts),
and is not restated here.

---

## 3. Why this shape

- **`ZSCAN` bounds the reply at the source.** Whatever the index's size, each
  reply is a page, so nothing downstream sees it — the reply cap, the heap, the
  shared socket.
- **One `now` keeps the semantics of the one-script read.** Carrying the reap's
  `t` makes a paged pass decide liveness exactly as the single reply did; only
  the reply's size changes.
- **A full iteration needs no state.** The cursor lives in one local for one
  pass: nothing survives a crash, a `close()` or a failed page read, so nothing
  can go stale.
- **One gate per level.** The driver's single-flight decides when a pass runs;
  the manager's tail decides that no two re-checks overlap, whoever asked. Each
  is one mechanism in one home.

---

## 4. Rejected, and what each would have cost

- **Keeping the one-script read and raising the cap.** Moves the cliff, keeps
  the heap cost, and every consumer of the client inherits the larger ceiling.
- **Reaping inside every page's script** (a `TIME` per page). A later page would
  judge liveness against a later clock than an earlier one, and a pass would
  issue N / 100 deletes instead of one.
- **Applying as the pages arrive** (a per-page callback, or an `AsyncIterable`
  seam). Re-opens #337 across page boundaries, and puts manager state changes
  between page reads.
- **Accepting two concurrent re-checks** as idempotent. They are not: the older
  snapshot re-kicks a client that re-subscribed after the first leave, a window
  of about one pass.
- **Routing the lapse re-check through the driver's single-flight.** Grows the
  port or makes the order driver-dependent, and re-anchors ADR 007's tested
  re-assert.
- **A coalescing flag in the manager.** A second coalescing mechanism beside the
  driver's rerun slot, for a queue that is at most two deep.
- **A shared async-generator page loop** for the sweep and this pass. Two
  callers with different closing semantics (a return value against a throw), and
  a rewrite of ADR 008's proven loop for no behaviour.
- **A slow-pass WARN.** A continuous quantity reported as a threshold line that
  fires on every pass at scale, and a clock read on paths tests drive with
  `FakeTime`. Its home is a pass-duration metric for both ADR 006 passes (#360).
- **A per-pass page budget with a resume cursor.** State that must agree with an
  index that changes under it, to solve a delay nobody has measured.
- **Throwing on a malformed pair.** A planted `+inf` member is never reaped, so
  every pass would fail for as long as it stays — every revocation unenforced.
- **Skipping a malformed pair silently.** Fails open: a broker that formats
  scores differently would leave every revocation unenforced with no log.

---

## 5. What this does not solve

- **The lapse re-hold can wait up to one driver pass.** The lapse run's re-check
  queues on the manager's tail behind a pass in flight.
- **`#reassertRoster`'s WARN text is false at shutdown.** A closing throw inside
  the lapse run's re-check surfaces as that WARN, whose "the holds are
  re-asserted anyway" is not what happens once `close()` has begun. The text is
  ADR 007's and is not reworded here.
- **`close()` waits through an apply after the last page.** The re-check stops
  before its next page read, but when the read in flight is the **last** page,
  the read returns normally and the manager's apply phase — leaves, roster
  writes, clears — runs while `close()` waits.
- **Undecodable members are not counted.** A well-formed pair whose member does
  not decode (two parts, four parts, a character outside the charset) is skipped
  on every pass, without a WARN: during a rolling deploy it is expected state,
  not a fault. It expires on its score.
- **The page bound rests on the broker honouring `COUNT`.** A listpack-encoded
  sorted set is answered whole — harmless at Redis's defaults (at most 128
  entries of at most 64 bytes). An operator who raises `zset-max-listpack-*`, or
  a Redis-compatible server that answers `ZSCAN` whole, reopens the large reply
  on that deployment. The #285 live conformance case asserts the seeded index
  needs more than one call.
- **A mixed `0.3.0` / `0.4.0` fleet.** A `0.3.0` instance still reads the whole
  index with `LIST_REVOKED_SCRIPT` on its own client.
- **Third-party drivers that ignore `owns`.** Correct — the manager filters
  again — but unbounded in their own store.
- **No authenticity tag on records.** A writer with access to the index can
  still plant a member; the decode filter decides scope, and a malformed pair is
  counted, but a well-formed forged record is applied.
- **Fleet-wide amplification.** Every instance reads the whole index every pass.
  The escalation is an owner-partitioned index; its revisit trigger — a pass
  above 10% of `reconcileIntervalMs` — **cannot be observed** until the
  pass-duration metric exists, tracked as
  [#360 — Realtime: expose a pass-duration metric (duration, pages) for the Redis driver's ghost sweep and revocation re-check](https://github.com/locknessland/lockness-monorepo/issues/360).

---

## 6. The standing constraint

**The revocation index is read only by `listRevocations`' `ZSCAN`, with `COUNT`
set to `REVOCATION_SCAN_COUNT`, and deleted only by `REAP_REVOKED_SCRIPT`; no
re-check reply grows with the index.** Liveness is the reap's `t`, carried to
every page. Nothing is applied before the enumeration ends, and at most one
re-check runs per instance at a time.
