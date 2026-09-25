# ADR 007 — A lapsed instance re-asserts its presence slots when it notices, and no connection hears presence about itself

**Status:** Accepted, amended by [ADR 014](014-realtime-bounded-close-drain.md)
(§5, S5) **Date:** 2026-09-23 **Owner:** architect **Amends:**
[ADR 004](004-realtime-roster-slots-held-per-instance.md) §2, §5,
[ADR 005](005-realtime-swept-departures-announced.md) §5 and
[ADR 006](006-realtime-sweep-writes-only-while-dead.md) §5 **Affects:**
`packages/realtime/driver.ts`, `packages/realtime/drivers/redis.ts`,
`packages/realtime/drivers/lapse_run.ts`, `packages/realtime/manager.ts`,
`packages/realtime/tests/fake_redis.ts`, `docs/realtime.md`,
`packages/realtime/AGENTS.md`

---

## 1. The question

An instance can stay up while its liveness key lapses: a stalled event loop, a
long GC pause, a partition to Redis. A peer's ghost sweep then treats it as
crashed. Since ADR 006 the sweep stops as soon as the instance renews, but every
hold it released **before** the renewal stayed released, and nothing put it
back:

- **Unbounded absence.** A member whose socket stayed open and subscribed on the
  lapsed instance disappeared from `readRoster` and `here` on every instance
  until that instance next wrote the member's slot — indefinitely, for a member
  who does nothing.
- **A self-`left` with no matching `joined`.** The sweep's `left` reached the
  member's own tabs, because a `left` excluded nobody (ADR 004 §2); the later
  `joined` skipped them. Those tabs saw themselves leave and never come back.
- **No self-repair.** The Redis driver never compared what it thinks it holds
  with what the roster says, and its heartbeat could not tell a renewal from a
  re-creation.

Tracked as
[#349 — Realtime: an alive instance whose liveness lapsed is swept and never re-holds its presence slots while its sockets stay open](https://github.com/locknessland/lockness-monorepo/issues/349).
The design comes from the `architect-expert` disposition on #349 (2026-09-23);
the self-frame question was a product decision, answered by the maintainer the
same day: **no self-frames**.

---

## 2. The decision

**The command that renews liveness reports the lapse; the driver tells its owner
through one optional hook; the owner re-checks revocations, then writes every
local slot again through its one write path, one at a time; and `emitPresence`
keeps a member's own connections out of every frame about it.**

### Detection: the renewal reports the lapse

`#heartbeat`'s liveness write is `SET <alive key> 1 EX <ttl> GET`. Its reply is
the key's previous value — a bulk while the key existed, **nil when it had
expired or been deleted**, i.e. when this write re-created it and a peer may
have swept this instance's holds meanwhile. `GET` needs Redis 6.2; the driver's
floor is already 7.0. It is still a `SET` on the alive key (so
`withFaultyInstance` still injects), still written before `SADD instances`, and
the `SADD` is still attempted when it failed (ADR 006).

`decodeBeatReply` is the one place a beat reply is given meaning: nil →
`lapsed`, any bulk → `continuous`, anything else throws a **constant** message
naming the accepted shapes and never the reply. It runs **inside** the `SET`'s
`try`, so a reply it refuses is one failed beat — never a rejection escaping an
interval callback or `holdMember`'s boot beat.

**Two gates**, both read at the beat's tail, once both writes are done:

- **A hold was issued.** `#holdIssued` is set synchronously just before
  `holdMember`'s `EVAL`, after the boot beat, and never cleared. Before any hold
  nothing of this instance's can have been swept, so the boot beat's nil (the
  key never existed) and a failed beat carry no lapse.
- **Suspicion.** A beat whose `SET` failed, or whose reply did not decode, after
  a hold was issued sets `#lapseSuspected`: its reply — lost after the write
  committed, say — may have been the nil. The next successful beat then triggers
  the re-assert whatever its own reply says. A failed lapse run sets it too, so
  the next successful beat retries. A failed `SADD` sets nothing.

**The boot-beat reading (A4).** The flag is read at the tail, not when the beat
is issued: read at issue time, a hold that overtook the boot beat's `SET` on a
port that does not serialize — and was swept — would never be re-asserted. The
cost is on the production client, which serializes: a second hold enqueued while
the boot beat is in flight sets the flag before the tail reads it, so the boot
nil counts as a lapse. That is **one extra re-assert on boot**, with no frame
(every slot is already held: `arrived` is `false`).

### The seam: a fifth optional hook

`BroadcastDriver` gains
`onRosterLapse?(handler: (signal: AbortSignal) => void | Promise<void>): void`.
It reports "this process's holds may have been released on its behalf — write
them again through your normal write path". `PresenceCapableDriver` does not
require it and no new type is exported: the memory driver has no peer to sweep
it, a roster-less driver no slot to lose, and a third-party driver without the
hook keeps today's behaviour.

**Its delivery contract** is `LapseRun`'s, a concrete, internal, lapse-only
class in `drivers/lapse_run.ts`:

- the heartbeat never awaits the handler — K slot writes in front of the next
  renewal would cause the next lapse;
- at most one run in flight; however many lapses arrive during a run, **exactly
  one** trailing run follows it;
- none once closed: `close()` marks the run closed and aborts its signal
  synchronously, waits for the run in flight, then drops the handler;
- a run never throws: a handler that throws or rejects is one WARN, carrying no
  member id or channel, then `onFailure`, which marks the lapse suspected. There
  is no retry timer; the heartbeat bounds the retries.

The handler takes an `AbortSignal` because a re-assert is K writes long and
`close()` must stop it between two of them without the manager keeping a closed
flag of its own.

**The hooks' shared lifecycle is stated once**, in `BroadcastDriver`'s JSDoc:
one owner per driver, so a second registration replaces the first; one handler;
the driver's own shutdown drops it. `onControlRefused`, `onRevocationReconcile`,
`onRosterDeparture` and `onRosterLapse` refer to it. `onControl` is the named
exception: its lifetime is its subscription. For the rule to be true of every
hook it names, the Redis driver's `close()` now also drops the
`onControlRefused` handler (FR-006a).

**The rule for a sixth hook.** A new driver-to-owner notification becomes a new
hook only if its payload **and** its delivery contract differ from every
existing one. The bookkeeping is consolidated only when a **second** production
driver implements three or more of these hooks.

> **Amended by
> [ADR 015](015-realtime-owed-release-retried-by-maintenance-drain.md)
> (2026-09-26).** The rule produced its sixth hook: `onRosterMaintenance`, fired
> unconditionally after every successful heartbeat — a payload (nothing) and a
> delivery contract ("every tick that proved the connection healthy") that match
> neither this section's `onRevocationReconcile` nor `onRosterLapse`. It joins
> the shared-lifecycle list above. Still one implementation beyond `LapseRun`'s
> own (a new concrete `RosterMaintenanceRun`, without an `AbortSignal` — its
> handler takes no argument at all); the bookkeeping-consolidation threshold
> this section states is unchanged.

### The re-assert: revocations first, then each slot through its tail

The manager registers `onRosterLapse` inside its roster block, after
`onRosterDeparture`. `#reassertRoster(signal)`:

1. **Re-checks durable revocations first** (`reconcileRevocations()`, the A2 /
   S2 ruling). A revoke issued during the lapse, whose control frame this
   instance never received, is enforced before anything is re-held — otherwise
   the room would hear `left`, `joined` (carrying `info`) and `left` again for a
   member revoked on purpose. A failed re-check is **one WARN** naming no target
   or member; the re-assert still runs, and the failure never joins the run's
   rejection and never marks the lapse suspected — a broken revocation store
   must not re-assert K slots on every beat.
2. Returns if the signal is aborted.
3. **Snapshots** the `(channel, origin)` pairs: the channels are the `presence`
   keys, each channel's members are `#localRoster`'s (the one dedupe rule), and
   each member's origin is the connection whose entry **is** that member object
   — found by identity, with no second dedupe rule.
4. Awaits `#syncRosterMember(channel, origin)` for each pair **one at a time**,
   checking the signal before each. A slot that rejects is recorded and the loop
   goes on; afterwards one `Error` carries the count and the first failure,
   never a member id or `info`.

**No new write path and no new announcement path.** The desired state is read
inside the slot's tail at issue time (ADR 003), so a leave or join queued on the
same slot is ordered with the re-write. The hold's `arrived` bit decides the
frame (ADR 004): a slot nobody swept announces nothing, a swept one announces
one `joined`. `#announcePresence` keeps exactly two callers (ADR 005 §6).

### No self-frames

`emitPresence(channel, frame)` excludes **every** local subscriber of the
channel whose presence entry has the frame's member id — read at emit time — for
`joined` **and** `left`, on the local announcement and on the receive side of
both `presence-join` and `presence-leave`. The `exceptMemberId` option is gone:
no caller passes it, and none can drop it.

In a consistent roster this excludes nobody from a `left`: a `left` is announced
only when no process holds the slot, and a live local connection of that member
means this process holds it or has a hold queued. It removes a frame only in the
two defect cases: a lapsed instance's own tabs hearing the sweep's `left`, and a
tab on the sweeper whose hold commits right behind the sweep's release.

---

## 3. Why this shape

- **The lapse is a fact about the renewal, so the renewal reports it.** No
  second command, no marker key, and no race between a check and the write it
  checks: the nil and the re-creation are one atomic step.
- **The driver detects; the owner decides.** The driver knows its key lapsed;
  only the manager knows which members this process should hold (ADR 003).
  Re-holding from the driver's memory of its own holds would be a second source
  of desired state.
- **Through the slot tail, one at a time.** Every roster write already goes
  through `#syncRosterMember`, which orders it with the slot's other writes and
  announces from the bit it returns. One at a time keeps the heartbeat from
  queueing behind K writes on a command client that runs one exchange at a time.
- **The exclusion belongs to the emit, not to its callers.** A rule each caller
  had to remember was already remembered by only two of three.

---

## 4. Rejected, and what each would have cost

| Alternative                                                                        | Why not                                                                                                    |
| :--------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- |
| **A separate `GET` / `EXISTS` / `TTL` around the `SET`**                           | Two round trips per beat, and the read races the expiry it is checking for                                 |
| **The heartbeat as one `EVAL`**                                                    | A script where one command answers the question; `withFaultyInstance` would no longer match it             |
| **A `swept:<id>` marker key written by the sweeper**                               | A new key family with its own TTL and a sweeper that crashes before writing it                             |
| **Inferring the lapse from an incoming `presence-leave` about a member held here** | Pub/sub keeps nothing: the lapsed instance's subscribe socket is often the thing that was down             |
| **A periodic `SMEMBERS` / `SCARD` self-audit**                                     | A steady-state cost on every instance, for a rare event the renewal already reports                        |
| **"Skip the first beat" instead of the hold flag**                                 | Misses a hold that overtook the boot beat and was swept                                                    |
| **The hold flag read when the beat is issued**                                     | The same miss, on a port that does not serialize (A4)                                                      |
| **The driver re-holding from its own memory of holds**                             | A second desired state beside the manager's; a leave during the lapse would be undone                      |
| **`Promise.all` over the slots**                                                   | K writes queued at once sit in front of the next heartbeat and cause the next lapse                        |
| **Stopping at the first failed slot**                                              | One bad slot leaves every later member absent until the next run                                           |
| **The scheduling inlined in the driver** (A6)                                      | Testable only through a broker double; `LapseRun` is unit-tested alone                                     |
| **A generic runner or an interface for the hooks now**                             | One implementation; the sixth-hook rule says when to consolidate                                           |
| **Accepting the revoked-member residue** (A2 (b))                                  | The room hears `left`, `joined` with `info`, `left` for a member revoked on purpose                        |
| **The driver sequencing the revocation hook before the lapse hook** (A2 (c))       | Couples two hook contracts, and every third-party driver would have to repeat it                           |
| **Filtering the snapshot by the revocation store** (A2 (d))                        | A second spelling of revocation                                                                            |
| **Failing the re-assert when the re-check fails**                                  | A broken revocation store would re-assert K slots on every beat                                            |
| **Excluding only the origin connection, or excluding at the call sites**           | A second tab of the member, or a caller that forgets, receives a frame about itself                        |
| **Suppressing the sweeper's `left`**                                               | The sweep cannot tell a lapse from a crash at the moment it releases; a crash's `left` is the #348 promise |

---

## 5. What this does not solve, and what it costs

**Accepted costs.**

- **Every failed beat after the first hold costs one full re-assert** (A7): K
  repeat holds (`EVAL`s) and no frame, once the next beat succeeds. A failed run
  followed by a successful trailing run leaves suspicion set, which costs one
  redundant run. **The upgrade path**, if this cost ever shows: suspect a lapse
  only when the next successful reply arrives at least one TTL after the last
  successful beat was issued — a failed beat inside the TTL cannot have let the
  key lapse.
- **Broker backoff (#358, S3).** A backoff that makes beats fail marks the lapse
  suspected on every failure, so each surviving instance re-holds its K slots
  per recovery. Bounded by the coalescing (one run plus one trailing) and by
  writing one slot at a time, and no frame goes out.
- **A non-string value at the alive key no longer self-heals (S4).** Written by
  some other broker client, it makes `SET … GET` answer `WRONGTYPE` and — unlike
  the plain `SET` before — leaves the value in place, so every beat fails until
  the key is removed. Deleting the alive key forces a re-assert. Both need write
  access to the broker, which already controls the unsigned data plane.
- **The shown `info` is rewritten.** When the member is also held on another
  instance with different `info`, the re-assert rewrites the shown entry with
  this instance's, as any hold does (last hold wins, ADR 004), with no frame.
- **`close()` waits for the run in flight (S5)**: at most one slot write plus
  whatever is queued ahead of it on that slot, or the revocation re-check in
  flight — the run's first step, which the signal cannot cut short. That is 30 s
  per command on the built-in client, unbounded on an injected port whose
  commands never settle.

  > **Amended by [ADR 014](014-realtime-bounded-close-drain.md) (2026-09-25).**
  > No longer unbounded: this wait shares `close()`'s one liveness-TTL budget
  > with the sweep pass, through `awaitCloseDrain`. A port whose commands never
  > settle now costs `close()` at most that one TTL, reported with one WARN, not
  > an indefinite hang.

**Residue.**

- **Latency.** A returning member is back within one heartbeat interval, plus
  one revocation re-check, plus the re-assert's own K writes.
- **The revocation window is unchanged.** A revoke with no durable record, a
  revoke issued after the re-check's read whose frame is also lost, or a revoke
  lost with no lapse at all is caught only by the periodic revocation reconcile.
  A re-check that **fails** leaves the A2 (b) residue — `left`, `joined`, `left`
  with `info` — for one interval.
- **A lost sweeper `presence-leave`** (the lapsed instance's subscribe socket
  was down, and pub/sub keeps nothing): its local observers receive a `joined`
  with no `left` before it. Clients that key members by id absorb it (ADR 005).
- **Frame order across two publishers.** The sweeper's `presence-leave` delayed
  past the re-assert's `presence-join` reads `joined`, then `left`; the roster
  and `here` stay right (ADR 004).
- **Broker data loss** makes every instance's next beat report a lapse and
  rebuild the roster, with one `joined` per member and no `left` before it.
- **Mixed `0.3.0` / `0.4.0` fleet.** A `0.3.0` sweeper has no liveness check and
  can release holds after the re-assert; a `0.3.0` instance still sends a
  self-`left` to its own tabs.
- **An instance that stays stalled stays missing**: from the fleet's side, it is
  down.
- **Redis Cluster**, as in ADR 004.

### Recorded deviations from the plan

Found by the implementation, pinned by the fake-vs-live conformance suite:

- **Real Redis accepts `GET` given twice** in one `SET`; the plan expected a
  refusal. FakeRedis refuses it rather than guess, and the live conformance test
  records it as a **declared gap** (`fakeRefuses`). The driver never sends it.
- **`GET` over a key of another type is refused on both sides** (`WRONGTYPE`),
  where the plan expected a declared gap. The fake and the broker agree, so the
  step is an ordinary conformance step.
- **`presence_read_bound_341`'s pinned ingest dropped by 2 bytes**: the first
  `SET … GET` of a fresh instance answers nil, which carries no payload, where
  the plain `SET` answered the 2-byte `OK`.

---

## 6. The standing constraint

**A lapse is detected only by `#heartbeat`, from `decodeBeatReply`'s reading of
the renewal, gated by `#holdIssued` and `#lapseSuspected`; the lapse handler
runs only through `LapseRun`.** The re-assert re-checks durable revocations
first, then writes through `#syncRosterMember` one slot at a time and never
announces anything itself — `#announcePresence` keeps its two callers. **No
presence frame reaches a local connection whose presence entry has the frame's
member id**, and that rule lives in `emitPresence` alone, with no option to opt
out.
