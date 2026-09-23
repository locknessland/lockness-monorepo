# ADR 004 — Roster slots are held per instance, and the holder that fills or empties one announces it

**Status:** Accepted, amended by
[ADR 005](005-realtime-swept-departures-announced.md) (§2, §5, §6) and
[ADR 006](006-realtime-sweep-writes-only-while-dead.md) (§2, §5) **Date:**
2026-09-15 **Owner:** architect **Amends:**
[ADR 003](003-realtime-roster-write-ownership.md) §3, §6, §7 **Affects:**
`packages/realtime/driver.ts`, `packages/realtime/manager.ts`,
`packages/realtime/drivers/redis.ts`, `packages/realtime/drivers/memory.ts`,
`docs/realtime.md`

---

## 1. The question

`docs/realtime.md` promised one roster slot per identity "however many tabs it
opens". Two defects broke that promise, and they share one cause: **nothing
counted who holds a slot.**

- **The Redis slot was last-writer-wins**
  ([#345](https://github.com/locknessland/lockness-monorepo/issues/345)). One
  presence-hash field per member id named a single owner. With member M on
  instances A and B, A's leave deleted the slot B still held — every later
  `here` omitted M — the last writer won `info`, and A's death swept B's live
  slot.
- **Announcements were per connection**
  ([#344](https://github.com/locknessland/lockness-monorepo/issues/344)). The
  join emitted `joined` and published `presence-join` for every connection, and
  `unsubscribe` did the same with `left`. A second tab announced a member
  already listed; closing one of two tabs removed a present member from every
  client's list until the next snapshot. Every multi-tab user on the default
  configuration hit it.

Only the code that changes a slot's holder count, atomically, sees "member
arrived" (no holder → one) and "member gone" (one → none) exactly. So both fixes
live in the same place.

---

## 2. The decision

**A roster slot is held per process, and the write that observes it fill or
empty is the one that announces it.**

### The seam

`holdMember(channel, member): RosterHold` and
`releaseMember(channel, memberId): RosterRelease` replace the add/remove pair
(`packages/realtime/driver.ts`, the single home of the meaning):

- **Hold** — "this process holds `String(member.id)` with this entry". `arrived`
  is `true` only if **no process** held the slot before.
- **Release** — "this process drops its hold". `gone` is `true` only if **this
  process held it** and no holder is left.

A driver may not fake either bit. A driver presenting any retired roster member
is refused at construction by `assertNotLegacyRosterDriver`, **once**, naming
every one present and citing the upgrade section by title, never by number.

### Redis: a holders hash per slot

Each slot has `<prefix>__holders:<channel> <id>`, mapping
`instanceId → that instance's entry`, with **no TTL**.

- **Hold** is one `EVAL` over four keys: the holders entry, the presence field,
  the instance's owned-set entry, and the instance's registration. It returns 1
  iff the holders `HSET` added a field and the hash then has exactly one.
- **Release** is one `EVAL` over three keys. It drops the releaser's holders and
  owned entries; with no holder left it deletes the field and returns 1 iff the
  releaser held it; with holders left it keeps the field, and replaces the shown
  entry with a remaining holder's only when the shown one was the releaser's —
  or when neither exists, so a non-holder's release restores a missing field
  from a remaining holder.
- **The ghost sweep is a release on the dead instance's behalf** — the same
  script, with the dead id, once per owned entry, return ignored. It no longer
  deletes the owned set, so a hold landing mid-sweep stays sweepable.

> **Amended by [ADR 005](005-realtime-swept-departures-announced.md)
> (2026-09-23).** The release no longer returns 1 when it empties a slot it
> held: it returns **the released holder's stored entry**, and 0 otherwise,
> decoded by a second strict decoder (`decodeReleaseReply`). The sweep's return
> is **no longer ignored** — each entry it gets back is reported, through the
> driver's optional `onRosterDeparture` callback, as a departure the manager
> announces as `left`.

> **Amended by [ADR 006](006-realtime-sweep-writes-only-while-dead.md)
> (2026-09-23).** The release takes a fourth key, the releaser's liveness key,
> and on a sweep (`ARGV[4] = '1'`) answers **refused** before any write while
> that key exists. Its replies are four — the entry, `KEPT`, `0`, `REFUSED`. The
> sweep no longer ends with a raw `SREM`: it deregisters through a script that
> requires the instance to be dead **and** own nothing. One pass runs at a time.

The memory driver has one process: `arrived = !has`, `gone = delete`. A
roster-less driver gets its bits from the manager's private `#heldSlots`,
updated inside the queued run before announcing.

### The manager: announcements live in the queue

`#syncRosterMember(channel, origin)` still derives the desired state inside the
slot's serial tail (ADR 003, unchanged). It now holds or releases, and on
`arrived` calls `#announcePresence('joined', desired, origin)`, on `gone`
`#announcePresence('left', origin.member, origin)`.

- **`#joinPresence` and `unsubscribe` announce nothing.** `origin` names who to
  announce as, never the desired state.
- **Local first, then the control publish.** A publish or `encode` failure is
  one WARN carrying the channel, the action and the error — never the member id
  or `info` — and is never rethrown: a throw inside the tail would reject
  another call's write and roll back a committed hold. `unsubscribe` therefore
  resolves `'left'` when its `presence-leave` publish fails; a failed release
  still rejects.
- **`joined` never reaches a connection of the same member id.**
  `emitPresence(…, { exceptMemberId })` skips every local subscriber whose
  presence entry has that id, read at emit time. `#announcePresence` and the
  receive side's `presence-join` arm both ask it, so a connection that claimed
  the member on another instance is excluded too. `left` excludes nobody.

### What makes `joined` / `left` truthful

**A member id unique per identity.** The roster keys slots by `String(id)`, so
two identities an authorizer maps to one id are one member: the roster shows one
entry for both, the second one's arrival is never announced, and neither is a
departure while the other still holds the slot
([#346](https://github.com/locknessland/lockness-monorepo/issues/346)). Nothing
in this design can detect that; the application's authorizer owns it.

---

## 3. Why this shape

**The transition is only observable where the holder count changes.** Any other
place — the manager reading its own maps, a count fetched in a second command —
sees a snapshot that another instance's hold can invalidate before it acts.
Putting the bit in the atomic write, and the announcement in the one queued run
that receives the bit, leaves nothing to race.

**The queue already serialises one slot's writes** (ADR 003), so two writes for
one slot never observe the same transition. The #330 rule falls out: a join
overtaken by its own leave finds nothing to hold, and the leave finds nothing it
held, so neither announces. The #323 rule holds: an announcement follows a hold
the roster accepted.

**The sweep reuses the release** rather than a second removal path, so a leave
and a crash recovery cannot disagree about what releasing means, and no raw
presence `HDEL` remains in the driver.

**The break is taken in `0.4.0`**, which is unreleased and already breaks this
seam for the bounded read (#341). Keeping the old names with new return types
would contradict their meaning, and a stale driver would fail with a `TypeError`
inside the #323 rollback instead of at construction.

---

## 4. Rejected, and what each would have cost

| Alternative                                                                    | Why not                                                                                                                                                                                                                                                                    |
| :----------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fix the Redis slot only; manager and seam signatures unchanged**             | The first disposition on #345, superseded by #344's. It closes the slot defect and leaves every multi-tab announcement wrong; fixing #344 afterwards needs the arrival bit only that write can return, so the seam would break a second time                               |
| **Decide arrival / departure in the manager from its local `presence` counts** | Correct for one instance, wrong for a fleet: a member on A and B is "first connection" on both, so two `joined`; closing A's tab sends `left` while B holds. It also puts announcement logic back in `subscribe` / `unsubscribe`, outside the queue that orders the writes |
| **Read `HLEN` or the owner from TypeScript, then write**                       | Two round-trips: another instance's hold or release lands between them, and two instances both see "no holder". Arrival inferred from the presence `HSET` reply is wrong the same way — the field exists while another instance holds it                                   |
| **A TTL on the holders hash as a safety net**                                  | A holders hash that expires on its own makes a release see no holder and delete a slot another instance holds — #345 again, on a timer. The cost moved to operations instead: the realtime Redis must run `noeviction` or `volatile-*`                                     |
| **Keep the old method names with the new return types**                        | The names would say "write the slot" while the contract says "hold it beside others". A stale driver returning nothing would fail with a `TypeError` inside the #323 rollback, not at construction                                                                         |
| **Exclude only the origin connection from `joined`**                           | A second tab — or a connection that claimed the member while the arrival was queued, or on another instance — receives `joined` for itself                                                                                                                                 |
| **A separate release script for the sweep, or the old owned-set `DEL`**        | Two definitions of releasing that can drift; and deleting the owned set wholesale strands a hold that landed between the sweep's read and its end — an entry no sweep can ever reach                                                                                       |

---

## 5. What this does not solve

- **Mixed `0.3.0` / `0.4.0` fleet.** The slot defect stays live until the last
  `0.3.0` instance is gone: its leave or sweep still deletes a slot a `0.4.0`
  instance holds. A holders hash left without its field is not repaired by a
  holder's own release — only by a new hold, or by a release from an instance
  that did not hold the slot.
- **Rollback, then re-upgrade.** `0.3.0` ignores the holders family; a `0.4.0`
  instance that crashed and was swept by a `0.3.0` peer leaves a holders entry
  no sweep reaches, and that member is present for good. The documented remedy
  is a `SCAN MATCH` + `UNLINK` cleanup before re-upgrading (upgrade item 3).
- **Unreachable holders entries** from key eviction, or from a hold racing the
  sweep's final instance deregistration on an instance that then dies. The later
  fix is to prune holders whose instance is not registered — no migration
  needed.
- **A live instance whose heartbeat lapsed** loses its holds to a peer's sweep,
  which now announces `left`; its next hold is a real arrival, so its `joined`
  follows that `left`. Its own open tabs still receive the `left` and never the
  `joined`
  ([#349](https://github.com/locknessland/lockness-monorepo/issues/349)).

> **Amended by [ADR 005](005-realtime-swept-departures-announced.md)
> (2026-09-23).** "Sweep removals announce nothing" is no longer a residue: a
> slot the sweep empties is announced as `left`, exactly once across sweepers.
> The lapsed-instance bullet above is rewritten accordingly.

> **Amended by [ADR 006](006-realtime-sweep-writes-only-while-dead.md)
> (2026-09-23).** The "hold racing the sweep's final instance deregistration"
> case is **closed**: deregistration requires an empty owned set, so a late hold
> keeps its instance registered and the next pass releases it. The
> lapsed-instance bullet is **narrowed**: a release on its behalf is refused
> once it renews, so it loses only the holds swept before its renewal.

- **A lost release reply** skips the `left`, with no retry.
- **A lost hold reply after commit** (#323): the rollback's release reports
  `gone` and sends a truthful `left` with no `joined` before it.
- **A roster-less driver with a control plane** decides arrival and departure
  per instance.
- **Redis Cluster**: hold and release span keys in different hash slots.
- **Shown `info`**: random among three or more holders when the shown one
  releases; `left.member.info` is the releasing connection's.
- **Frame order** across two publishers within one Redis round-trip.
- **A third-party driver** can fake `arrived` / `gone` or ignore holds; the seam
  forbids it and cannot enforce it.
- **Applications counting tabs from frames** lose that signal.
- **Memory**: `1 + k` stored entries per member held on k instances.

---

## 6. The standing constraint

**An announcement of `joined` or `left` is made only by `#announcePresence`,
called only from `#syncRosterMember`'s queued run on the bit the roster write
returned.** The receive side of the control plane is the one exception. A
`joined` / `left` emit or `presence-join` / `presence-leave` publish added to
`subscribe`, `unsubscribe`, the join's compensation or any new verb reintroduces
per-connection announcements. And a driver's hold / release decides its bit in
the same atomic operation as its write, or it is wrong under concurrency.

> **Amended by [ADR 005](005-realtime-swept-departures-announced.md)
> (2026-09-23).** `#announcePresence` has a **second caller**: the manager's
> departure handler, on an entry a release returned while emptying another
> process's slot (the ghost sweep). Both callers announce only a bit a roster
> write returned. The departure is not queued on the slot's tail.
