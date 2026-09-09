# ADR 003 — The authoritative roster is written by projection, one slot at a time

**Status:** Accepted **Date:** 2026-09-09 **Owner:** architect **Supersedes:**
nothing **Affects:** `packages/realtime/manager.ts`,
`packages/realtime/tests/subscribe_unsubscribe_race_330.test.ts`,
`packages/realtime/tests/mutations/roster_sync_330.ts`, `docs/realtime.md`

---

## 1. The question

Two verbs on one socket — `subscribe` and `unsubscribe` for the same channel —
could each perform an authoritative roster write, both outstanding at once.
Whichever reached the wire second decided the outcome, and neither the manager
nor the caller had any say in which that was.

The harm is not a lost update. It is a **permanent** one: a removal followed by
an add leaves a member in the authoritative roster with no local membership, no
subscription, and its `left` already announced. The ghost sweep that would
reclaim it enumerates a **dead** instance's owned set, and a live instance never
sweeps its own — so for a healthy process the entry outlives the connection, the
channel, and the process itself.

---

## 2. What was verified, and two corrections to the original report

| Claim                                    | Verdict       | Evidence                                                                                                                                    |
| :--------------------------------------- | :------------ | :------------------------------------------------------------------------------------------------------------------------------------------ |
| The broker decides the commit order      | **Wrong**     | `RedisClient.command` chains onto `commandTail` _synchronously at call time_ (`packages/redis/client.ts`), so commit order is enqueue order |
| The nondeterminism is in issue order     | **Confirmed** | `#joinPresence` claims, suspends at `#watch`, then issues `addMember` from a state that no longer holds the membership                      |
| A driver pre-await can defer the enqueue | **Confirmed** | `RedisBroadcastDriver.addMember` awaits `#ensureSweepStarted()` before enqueueing                                                           |
| The defect reaches the in-memory driver  | **Wrong**     | `MemoryBroadcastDriver`'s roster ops are synchronous — this is strictly cross-process                                                       |
| The local maps end divergent             | **Wrong**     | They end consistent; the divergence observed earlier was a mid-flight reading from a tick-counting probe whose result moved between runs    |

The first and last corrections are why an earlier pair of mitigations was
reverted rather than shipped: neither sat upstream of an authoritative write.

---

## 3. The decision

**Every authoritative roster write is a projection of this instance's local
`presence` map for one `(channel, member.id)` slot, computed at issue time, with
at most one write in flight per slot.**

`ChannelManager.#syncRosterMember(channel, memberId)` is the only writer. The
caller names a slot; it does not pass a desired state. The desired state is read
from the local map **inside** the serial tail, immediately before the write.

Three call sites route through it and none may bypass it: the join, the join's
failed-write compensation, and `unsubscribe`.

---

## 4. Why this shape

**`#joinLocal` and `#leaveLocal` were already correct, and that is the whole
argument.** Each computes its transition and issues its wire op in the _same
synchronous turn_, so racing verbs issue `watchChannel` / `unwatchChannel` in
decision order. The roster write was the one place that did not, and restoring
the property is a smaller claim than inventing a mechanism.

Because the state is **derived**, there is no version, no epoch and no
tombstone. Nothing is remembered, so nothing can fall out of step with anything
else. A join whose membership was removed while its write was queued issues that
removal instead — and, having removed rather than added, announces nothing,
which is #323's rule arriving from a direction #323 could not have seen.

The slot is keyed by `member.id` rather than by connection id because the roster
hash is: two connections sharing one member id are one slot, and the projection
must see whichever of them the local map still holds.

---

## 5. Rejected, and what each would have cost

| Alternative                                                 | Why not                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| :---------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Serialize `void guard(...)` per connection**              | **Insufficient**, which is decisive: `subscribe`/`unsubscribe` are public API, and `handleControl`'s `evict` arm and `reconcileRevocations` both reach `unsubscribe` via `void revokeLocal(...)`, never through `guard`. It turns the witness green and leaves three paths open. It also changes the concurrency contract of every hook — a product decision — and a per-connection queue is state keyed by a cardinality a client chooses |
| **Lua fence / CAS in the driver**                           | A removal deletes the slot, so the fence needs a tombstone that `listMembers`, `#sweepInstance`, the fake and the conformance suite must all learn, or a third key on a script already documented as Cluster-hostile. No globally comparable generation exists. And it is a driver-level fix for a manager-level invariant on an **optional public seam**, so every driver re-implements it or is silently wrong                           |
| **Issue in the caller's turn and trust the driver's order** | `RedisBroadcastDriver.addMember` already violates it, and it would force every witness down to an order-preserving fake                                                                                                                                                                                                                                                                                                                    |
| **Re-validate the claim before writing** (three lines)      | Closes the ghost, leaves the mirror hole: a stale removal landing after a fresh add on a leave→re-subscribe pipeline, which #327 and #331 make ordinary traffic                                                                                                                                                                                                                                                                            |

---

## 6. What this does not solve

- **Cross-instance slot ownership.** One hash field per `member.id`, and `owner`
  is not consulted on removal. Live today, not worsened here, and the ground
  [#332](https://github.com/locknessland/lockness-monorepo/issues/332) stands
  on.
- **Announcement interleaving.** Ordering the writes does not order the frames.
- **Write amplification.** Bounded in concurrency, not in total; deliberately
  not coalesced, because coalescing would reintroduce a remembered desired
  state.

---

## 7. The standing constraint

**A new authoritative roster write must go through `#syncRosterMember`, and must
not carry its desired state from its caller.** A future verb that adds one —
[#332](https://github.com/locknessland/lockness-monorepo/issues/332)'s
`revokeChannel` is the next — routes through it rather than beside it. This ADR
exists because the three rejected remedies above are each intuitive enough to be
proposed again by someone who has not seen why they fail.
