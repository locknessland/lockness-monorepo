# Realtime — the authoritative roster write, serialized per member slot — Design

**Status:** Draft for review **Date:** 2026-09-09 **Issue:**
[#330](https://github.com/locknessland/lockness-monorepo/issues/330) **Owner:**
architect **Base:** `main` @ `c6277352`

## 1. Problem statement

`ChannelManager` keeps two records of one fact. The **local** record is
`presence` / `subscriptions` / `#channelsByClient`, mutated synchronously. The
**authoritative** record is the driver's roster, mutated by an awaited
round-trip. Every membership transition has to reach both.

`#joinLocal` and `#leaveLocal` get this right, and the reason is worth naming
because it is the whole design: they compute the 0→1 / 1→0 transition
synchronously and **issue** the wire op in that same turn. Two racing verbs for
one channel therefore issue `watchChannel` and `unwatchChannel` in the order the
transitions were decided.

`#joinPresence` does not. It claims the member synchronously, then suspends in
`#joinLocal` at `#watch`, and only issues `roster.addMember` **after** resuming.
`unsubscribe` meanwhile deletes the local entry and issues `roster.removeMember`
co-turn. So the join's write is issued from a state that no longer holds the
membership it is about to write, and the two writes are outstanding at once with
no ordering relationship. Removal-then-add writes the member back after its
removal: an entry in the authoritative roster with no local membership, no
subscription, and the `left` already announced. The add re-`SADD`s the owned-set
entry too, so the pair is internally consistent and the ghost sweep will reclaim
it — **when this instance dies**. For a healthy process it is permanent, and it
appears in every `here` read on every instance until then.

Deterministic reproducer: `tests/subscribe_unsubscribe_race_330.test.ts`
(uncommitted, branch `330-deterministic-race-repro`), 10/10 red.

Two facts sharpen the issue's own narrative. **The broker is not the only thing
that decides the order.** `RedisClient.command` chains onto `commandTail`
synchronously at call time (`packages/redis/client.ts:257-258`), so on the
shipped driver commit order equals _issue_ order — and issue order is where the
nondeterminism actually lives, because whether `#joinLocal` and `#leaveLocal`
suspend at all depends on the 0→1 / 1→0 transitions, and
`RedisBroadcastDriver.addMember` awaits `#ensureSweepStarted()` before it
enqueues anything. **And `MemoryBroadcastDriver`'s roster ops are synchronous**,
so this is strictly a cross-process defect.

## 2. Goals

1. The authoritative roster never holds a member this instance does not hold
   locally, and never omits one it does — whatever order the driver's calls
   settle in.
2. No reliance on any ordering property of `BroadcastDriver`; the seam is public
   and third-party implementations are anticipated.
3. Preserve the #323/#327 synchronous-turn invariant, `unsubscribe`'s
   `Promise<void>`, and "a reconnecting client is never refused" (#331, #327).
4. A witness that is deterministic and structural, not timing-dependent.

## 3. Non-goals

- Serializing the `void guard(...)` hook dispatch (see §5.1).
- Any change to the Lua scripts, the roster key layout, or
  `PresenceCapableDriver` (see §5.2).
- Ordering the announcement frames (`joined` / `left`) under pipelining. This
  remedy is about the roster; frame interleaving is unchanged from today.
- The cross-instance slot-ownership question (§7) — that is #332's ground.
- A churn budget (#329) — still warranted, see §8.

## 4. Architecture

### The rule

> **An authoritative roster write is a projection of this instance's local
> `presence` map for one `(channel, memberId)` slot, computed at the moment the
> write is issued, with at most one write in flight per slot.**

Nothing else writes the roster. There is no generation, no epoch, no tombstone,
no version — the desired state is _derived_, so there is nothing to keep in sync
with anything.

### The collaborator

One private method on `ChannelManager` plus one map:

```
#rosterSync: Map<channel, Map<memberField, { tail: Promise<void>, applied: 'present' | 'absent' }>>

async #syncRosterMember(channel, memberId): Promise<'present' | 'absent'>
```

`#syncRosterMember` chains onto the slot's `tail`. Inside the chained section
it:

1. computes `desired` synchronously — `present` iff **any** connection in
   `presence.get(channel)` holds a member whose `String(id)` equals the field
   (this is a projection, not a flag, which is what makes it correct after an
   arbitrary number of intervening transitions);
2. returns immediately if `desired === applied`;
3. issues `roster.addMember(channel, member)` or
   `roster.removeMember(channel,
   field)` and awaits it;
4. sets `applied = desired` on success; a rejection propagates to this caller
   and leaves `applied` untouched, so the next transition re-attempts;
5. deletes the slot record when the chain has drained and
   `applied === 'absent'`.

A driver with no roster (`this.roster === undefined`) short-circuits to the
projection with no write — single-process, the local map _is_ the authority.

### The two call sites

`#joinPresence`, replacing the
`if (this.roster) { try { addMember } catch {…} }` block, keeping its position
(after `#joinLocal`, before the announcements):

```
const state = await this.#syncRosterMember(channel, member.id)   // may throw
if (state === 'absent') return await this.#closingRead(channel)  // superseded
…emitPresence(joined) / publishControl(presence-join)…
```

- **Rejection** → the existing compensation, unchanged in shape: delete the
  claim, `#leaveLocal`, and then a second `#syncRosterMember` for the
  best-effort reclaim (which now goes through the same serialized path instead
  of being a third unordered write), then rethrow.
- **`'absent'`** → the join was superseded by the client's own `unsubscribe`
  while it was in flight. Announce nothing, publish nothing, return the closing
  read. This is the #327 vocabulary applied one step later: _`joined` records a
  transition, and a transition that has already been undone is not one._
  `{ ok: true }` still, because the subscribe was authorized — `{ ok: false }`
  means denied (#331) and must keep meaning only that.

`unsubscribe`, one line:

```
if (this.roster) await this.roster.removeMember(channel, member.id)
→ await this.#syncRosterMember(channel, member.id)
```

Its local delete and its `left` announcement are unchanged; whether the write
was superseded does not change that a local transition happened.

### Why the invariants hold

- **#323/#327 synchronous turn** — nothing is added above `#joinPresence`'s
  first `await`. `#checkChannelCaps` reads, the re-join guard claims,
  `#joinLocal`'s adds spend, all still co-turn. The new call replaces an
  existing `await` at the same position.
- **A reconnecting client is never refused** — nothing in this path refuses. The
  superseded branch returns `{ ok: true }` with the roster.
- **`unsubscribe: Promise<void>`** — unchanged.
- **No driver ordering assumption** — the manager holds the tail. The
  reproducer's fake driver may keep resolving in any order it likes, which is
  what keeps the witness honest.

### Dependency impact

None. No new package edge; `realtime` keeps `contract`, `hono`, `redis` static
and `events` soft. No change to `driver.ts`, so no driver contract to
re-document and no re-run of `deps:analyze` beyond the routine gate.

## 5. Decisions — what was rejected, and its real cost

### 5.1 Serializing the `void guard(...)` dispatch per connection — REJECTED

This is what the issue proposes, and it is written there as the filer's guess.
Its strongest case is genuine: it is the smallest conceptual change, it matches
what mature realtime protocols do (a client's frames are ordered), it would fix
_any_ future pair of verbs that races rather than this one, and it makes the
whole `onMessage` surface reason-about-able.

Cost:

- **It changes the concurrency contract of every hook**, not just the two verbs.
  An application whose `onMessage` does slow work gets head-of-line blocking per
  socket. That is a change to what the software _does_ for whoever uses it, so
  it is not the architect's call alone (hard rule #11's own test), and #327 put
  it out of scope for exactly that reason.
- **A per-connection queue is state with a lifetime.** Connection ids are
  unguessable and never reused, so the map needs eviction wired to `onClose` —
  and `onClose` is the hook that does not run in every failure mode. A leak
  keyed by attacker-supplied cardinality, on the transport layer.
- **It is insufficient, and reads as if it were total.** `subscribe` and
  `unsubscribe` are public API reachable from server code with no socket
  involved; `handleControl`'s `evict` arm dispatches `void this.revokeLocal(…)`,
  and `reconcileRevocations` calls it too —
  `revokeLocal → disconnect →
  unsubscribe` never passes through `guard`. It
  would turn the reproducer green and leave the defect class open on three
  paths.
- **It puts a domain invariant in the transport layer**, where `ChannelManager`
  can neither state it nor test it.

### 5.2 A generation/fence or compare-and-set in the Lua script — REJECTED

Strongest case: it is the _only_ place that can order writes originating on
**different instances**, which is precisely the case §7 leaves open; and it
makes the roster self-defending against any buggy caller, present or future.

Cost:

- **A removal deletes the slot, so there is nowhere to keep the fence.** Closing
  the ghost direction needs a tombstone living in the presence hash with a TTL,
  which `listMembers`, `#sweepInstance`, `FakeRedis` and the live conformance
  suite must all learn; or a third key, on a script already documented as
  cross-slot and Cluster-hostile (`ADD_MEMBER_SCRIPT`'s docstring).
- **The generation has to be globally comparable and there is no global clock.**
  A per-instance counter does not order two instances. `redis.call('TIME')`
  inside the script measures _arrival_, which is the exact order that is wrong.
- **It is a driver-level fix for a manager-level invariant.** `addMember` /
  `removeMember` are an optional public seam; every driver — memory, Redis, any
  third-party one — would have to re-implement the fence, and one that does not
  is silently wrong with a green suite.
- `cjson` decode per roster write on the hot path.

It buys the cross-instance case at the price of multiplying an invariant across
an open seam. If §7 is ever taken on, this is the shape to revisit — under #332,
with the slot-ownership model settled first.

### 5.3 Issue the write co-turn and rely on the driver preserving issue order — REJECTED

Tempting, and nearly free: hold `roster.addMember(...)`'s promise from the claim
turn and await it after `#joinLocal`. `RedisClient.command` really does chain at
call time, so on the shipped driver issue order _is_ commit order.

Cost: it converts an unstated property of one driver into a load-bearing
requirement of the whole seam, and **`RedisBroadcastDriver.addMember` already
violates it** — it awaits `#ensureSweepStarted()` before enqueueing the `EVAL`,
so calling it synchronously does not issue synchronously. Fixing that is easy;
guaranteeing it forever across an open seam is not, and nothing in
`BroadcastDriver`'s types can express it. Worse, the witness would have to be
weakened to an order-preserving fake, which is the same as deleting it.

### 5.4 Claim re-validation alone — REJECTED

Re-read `presence.get(channel)?.get(connection.id) === member` immediately
before issuing `addMember`, and abandon if the claim is gone. Three lines, no
new object, kills the reproducer.

Cost: it closes one direction only. The mirror — a stale `removeMember` landing
after a fresh `addMember` (unsubscribe, then re-subscribe, pipelined) — leaves a
**hole**: a live local member absent from `here` on every instance, self-healing
never, until the connection closes. #331 and #327 both establish that a
re-subscribe after a blip is ordinary traffic, so that sequence is not exotic.
It would close the issue and leave the same class open in the direction nobody
had written a test for. The projection covers both directions with one
mechanism, which is why it is worth an object rather than three lines.

### 5.5 The two reverted #327 mitigations — the revert is CONFIRMED

Co-checking `subscriptions` in the re-join guard, and gating the failed-join
compensation on entry identity. Neither sits upstream of an authoritative write;
both change only which local branch is taken, and the local maps already end
consistent (`presence` empty, `subscriptions` empty). Neither would change any
end-state assertion, which is exactly the reading that got them reverted, and it
holds. Bringing either back would add a guard whose witness is a mid-flight
probe — the kind that moved between runs.

One amendment, not a reinstatement: the compensation's own `removeMember` **is**
worth revisiting, and it is revisited here as part of the remedy — it routes
through `#syncRosterMember` so the reclaim is ordered against everything else
touching the slot, instead of being a third unordered write with its own catch.

## 6. What a consumer does differently

Nothing. No public type, signature, option or error changes. The observable
differences are all corrections:

- A pipelined subscribe+unsubscribe leaves no roster entry.
- A subscribe superseded by the client's own unsubscribe no longer emits
  `joined` locally or publishes `presence-join` — it announced a membership that
  was already gone.
- Two connections on **one instance** carrying the same `member.id` no longer
  lose their roster entry when the first of them leaves. This falls out of the
  projection ("present iff _any_ local connection holds it") rather than being
  designed for; it is a pre-existing defect the shape happens to close.

`docs/realtime.md` gains one sentence stating the guarantee; `AGENTS.md` gains
the pitfall.

## 7. What this does NOT solve

1. **The cross-instance slot.** The roster is keyed by `member.id`, membership
   is per connection, and `removeMember` does not consult the stored `owner`.
   Two sockets of one user on two instances still share one hash field, so
   instance A's leave deletes the field instance B owns and B's member vanishes
   from `here` while its socket is open. This is live today, is not made worse,
   and needs the slot's ownership model settled (per-owner refcount, or a field
   keyed by `(memberId, owner)`) — a key-layout change, therefore breaking.
   **File it, or let #332 own it** (§8).
2. **Announcement ordering.** `joined` / `left` frames are still emitted per
   verb and can interleave under pipelining, including a `left` for a member
   whose `joined` was never announced. Unchanged from today.
3. **Any racing pair that is not a roster write.** The rule is stated for the
   roster because that is where the two records are; `subscriptions` is already
   safe by co-turn issuance, and nothing else in the manager has a second
   record.
4. **Write amplification.** N pipelined verbs still produce up to N roster
   writes, now serialized rather than concurrent — bounded in concurrency, not
   in total. Deliberately not coalesced: dropping a transition that has already
   been announced would make the frames lie.

## 8. Relationship to the concurrent and adjacent issues

**#332** (`unsubscribe`'s silent no-op on a non-owning instance; whether a
per-channel cross-process revoke should exist) — **independent to decide,
coupled at implementation, and it depends on this one, not the reverse.** This
remedy changes nothing about which instance may remove what:
`#syncRosterMember`'s projection is over _this instance's_ `presence` map, so a
removal is still issued only for a membership this instance held, which is the
behaviour #332 is examining. Two constraints flow outward: (a) if #332 adds a
cross-process revoke, the roster write it produces must go through
`#syncRosterMember` on whichever instance performs it, or the class reopens on a
new path; (b) §7.1 is #332's ground — a deliberate cross-process revoke makes
the shared-field case reachable on purpose, so the slot-ownership model has to
be settled there. **Do not merge the two into one shape.** This one is entirely
within a single instance, can ship first, and is the foundation the other builds
on.

**#329** (churn budget on the same message path) — **still necessary, with a new
home.** Per §7.4 the amplification is bounded in concurrency but not in total,
so a budget is still the right instrument. What changes is where it goes: the
slot record in `#rosterSync` is the natural place to meter roster writes per
`(channel, member)`, which is a sharper unit than "frames per connection".

## 9. Validation criteria — what the witness must assert

`tests/subscribe_unsubscribe_race_330.test.ts` keeps its rig — resolving driver
promises **by name** is the right technique and is what made it deterministic —
and changes what it asserts.

1. **Structural, and this is the primary assertion.** The fake driver counts
   in-flight roster calls per `(channel, field)` and the test fails if the count
   ever exceeds 1. That is the remedy's contract, it is checked continuously
   rather than at one instant, and it is killable by removing the serialization
   alone.
2. **Order-independent end state.** Step 5 must no longer _choose_ a commit
   order, because after the remedy only one write per slot is ever outstanding.
   Assert instead: the roster, `presence` and the local subscription set all
   agree and are empty. Drive it twice, opening the remaining gates in both
   orders, and assert the same end state — the point being that the end state no
   longer depends on the schedule.
3. **The mirror case (§5.4's hole).** Pipeline `unsubscribe` then `subscribe`
   for the same connection and channel; assert the roster **holds** the member
   and agrees with `presence`.
4. **The superseded join announces nothing.** Record frames on the connection
   and assert no `joined` and no `presence-join` control publish for a join
   whose membership was released before the write was issued.
5. **Two connections, one `member.id`, one instance** (§6): the first leaving
   must not remove the roster entry the second still holds.

Assertions 1 and 3 are the ones that no earlier attempt made and that the
rejected 5.4 would not satisfy.

A mutation battery is warranted — `tests/mutations/roster_sync_330.ts` — with at
minimum: drop the serial tail (killed by 1); read the desired state from a
captured flag instead of projecting from `presence` (killed by 3); drop the
`'absent'` early return (killed by 4); project `present` from the connection's
own entry rather than "any local connection" (killed by 5).

## 10. Pre-requisites & re-anchoring cost

No blocking issue. One cost to name rather than discover:
`tests/mutations/presence_join_323.ts` anchors on exact source text in
`#joinPresence`, and replacing the
`if (this.roster) { try { await
this.roster.addMember(…) } catch … }` block
re-anchors roughly five of its ten rows — the announcement-order row, both
compensation rows, the swallowed-rejection row (anchored on the closing braces
of that very block) and the cap-await row (whose replacement text is the
`addMember` line itself). The #327 claim row and the `except` row are untouched.
That file already documents two prior re-anchorings; a third belongs in the same
comments.

## 11. Risks

| Risk                                                                      | Mitigation                                                                                                                                                |
| :------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The slot map becomes a leak                                               | The record is deleted when the chain drains and `applied === 'absent'`; peak size is bounded by live memberships + in-flight writes.                      |
| A rejected write wedges the slot                                          | `tail` swallows so the chain always advances (`RedisClient.commandTail`'s precedent); the rejection still reaches its own caller.                         |
| `applied` drifts from reality if the driver is mutated behind the manager | It is a memo, not a source of truth — it only suppresses a redundant write. The projection is recomputed every pass.                                      |
| The extracted method grows into a second home for join policy             | It takes `(channel, memberId)` and reads `presence`. No connection, no authorizer, no caps — the same discipline as `#checkChannelCaps`'s `isIdentified`. |

## 12. ADR

**Yes — `docs/adr/003-realtime-roster-write-ownership.md`, short.** The test is
not the size of the change but whether it establishes a standing constraint, and
it does: _the authoritative roster is written only as a serialized projection of
local membership, and no other code path writes it._ It also closes three
remedies that will each be proposed again — the dispatch serialization is
written into the issue itself, and "make the broker do it" is the reflex answer
— and it records a residue (§7.1) that the next reader will otherwise rediscover
as a surprise. Existing ADRs are repository-scoped; this is the first
package-scoped one, which is fine: the alternative is `AGENTS.md`, and a pitfall
entry cannot carry rejected alternatives with their costs.
