# ADR 015 — A roster release this instance could not commit is retried by a dedicated, unconditional maintenance drain

**Status:** Accepted **Date:** 2026-09-26 **Owner:** architect **Amends:**
[ADR 003](003-realtime-roster-write-ownership.md) §7,
[ADR 007](007-realtime-lapsed-instance-reasserts.md) §2 **Affects:**
`packages/realtime/driver.ts`, `packages/realtime/manager.ts`,
`packages/realtime/drivers/redis.ts`,
`packages/realtime/drivers/roster_maintenance_run.ts`,
`packages/realtime/tests/owed_release_371.test.ts`,
`packages/realtime/tests/roster_maintenance_run_371.test.ts`,
`packages/realtime/tests/mutations/owed_release_371.ts`, `docs/realtime.md`,
`packages/realtime/AGENTS.md`

---

## 1. The question

A roster release can fail to commit: a presence leave's own release
(`unsubscribe`), or the #323/#373 join compensation's reclaim. Before this ADR
both catch sites only WARNed and moved on — the ghost sweep was the sole
backstop, and it never reaches a **healthy** instance's own holds, because a
live instance never sweeps its own owned set (ADR 006). A member whose release
failed once therefore stayed in every peer's authoritative roster and `here`
snapshot **for the life of the process**, with nothing short of a crash (real or
injected) ever correcting it.

Tracked as
[#371 — Realtime: a roster release that fails leaves the member stranded until the process dies](https://github.com/locknessland/lockness-monorepo/issues/371).
The design comes from the `architect-expert` disposition on #371 (2026-09-26).

---

## 2. The decision

**`ChannelManager` records, per roster slot, that its last release attempt
rejected; a new, dedicated, unconditional `BroadcastDriver` hook —
`onRosterMaintenance` — fires after every heartbeat that proves the driver's
connection healthy, and the manager drains the ledger through
`#syncRosterMember`, the roster's one writer (ADR 003), one slot at a time.**

### The ledger: a trigger, never a desired state

`#owedReleases: Map<string, PresenceOrigin>` on `ChannelManager`, keyed
`<channel>\0<member.id>` — the same string `#syncRosterMember` already derives.
`#recordOwedRelease(channel, origin, error)` is the one writer, called from the
two catch sites that used to only WARN:

- `unsubscribe`'s post-leave release catch;
- `#joinPresence`'s #323/#373 compensation's reclaim catch.

The value is a **trigger**, not a remembered desired state: draining a slot
re-issues it through `#syncRosterMember`, which re-derives what to write from
`presence` **at drain time**, exactly as every other call through that writer
does. This is why the ledger does not reopen ADR 003 — nothing here is state
that can fall out of step with anything.

**Bounded** at `MAX_PENDING_ROSTER_RELEASES` (1 000, sized like this file's
other named caps) distinct slots. A second failure on a slot already queued
always coalesces onto the newest origin, never refused; only a genuinely NEW
slot is refused once the ledger is at its cap, with the pre-#371 wording ("the
ghost sweep is the remaining backstop") and a named reason. Refusing is an
honest, visible degradation; a silently unbounded `Map` would not be.

### The drain: a sixth, unconditional hook

`BroadcastDriver` gains
`onRosterMaintenance?(handler: () => void |
Promise<void>): void`. Its payload
is nothing and its delivery contract is "every tick that proved the connection
healthy" — different from every existing hook's, which is what earns it a place
beside `onRosterLapse` rather than folding into it (the "sixth hook" rule, ADR
007 §2, extended below).

The Redis driver fires it from `#heartbeat`'s existing tail, **after the
liveness `SET` succeeded and decoded** — never on a beat that just proved the
connection broken, and never gated on whether a hold was ever issued (unlike the
lapse decision beside it): an owed release can exist for a channel this instance
no longer holds anything on.

A new, small, concrete scheduler — `RosterMaintenanceRun`
(`drivers/roster_maintenance_run.ts`) — owns the run discipline, on `LapseRun`'s
own precedent and for the same reason (never awaited by the heartbeat; at most
one run in flight, plus exactly one coalesced trailing run; none once `close()`
has begun; a run that never throws). It differs from `LapseRun` in exactly the
way its payload differs: no `AbortSignal`, since `onRosterMaintenance`'s
contract carries no argument at all — a run in flight is waited out by `close()`
rather than cut short mid-slot.

The manager registers the handler inside its existing `if (roster)` block,
beside `onRosterDeparture` and `onRosterLapse` — the same grouping, because
draining owed presence releases is the same category of roster-only maintenance.

**Deliberately NOT the revocation reconcile pass** (`onRevocationReconcile`).
That pass is the #362/#384 deadline-measurement seam, with its own documented
pitfall against threading unrelated work through it; an owed-release retry has
nothing to do with revocations, and inflating that pass's measured duration for
an unrelated reason would corrupt an enforcement bound. **Deliberately NOT
`onRosterLapse`** either: that hook's cost analysis (ADR 007 §5) is bounded on
firing only on a **detected** lapse, and a single release EVAL error is not
reliably a liveness lapse — an owed release could then sit forever behind a
heartbeat that keeps succeeding.

### Exactly one `left`, kept structurally

The drain's only write path is `#syncRosterMember` — already the one place
`arrived`/`gone` are decided (ADR 003/004) and the one place that announces (ADR
004/005 §6, ADR 007 §3). A slot already released by the original attempt
(committed, reply lost) is released again by the retry and answers `gone:
false`
— no second announcement. A slot re-claimed by a fresh join before the drain
runs is re-derived as **held**, not released, by the same fresh `presence` read
the writer always does. Nothing new was taught to `#announcePresence`; it keeps
its two callers.

---

## 3. Why this shape

- **A new hook, not a repurposed one.** ADR 007 §2's own rule: a new
  driver-to-owner notification becomes a new hook only if its payload AND its
  delivery contract differ from every existing one. `onRosterMaintenance`'s
  payload (nothing) and cadence (every successful beat, unconditionally) match
  neither `onRevocationReconcile`'s deadline-measured pass nor `onRosterLapse`'s
  edge-triggered one.
- **The ledger is derived, never authoritative**, on ADR 003's own precedent:
  `#syncRosterMember` already re-derives desired state at issue time from
  `presence`, so a slot the ledger names stale is simply re-derived correctly
  rather than needing a version, epoch or tombstone.
- **A concrete scheduler, not a generic one**, on `LapseRun`'s own precedent
  (ADR 007 §4): one more near-identical, purpose-built class is cheaper and
  clearer than a shared abstraction warranted only once a second production
  driver needs three or more of these hooks.
- **Sequential, never `Promise.all`**, on `#reassertRoster`'s own reasoning (ADR
  007 §2, §4): K writes issued at once would sit in front of the next heartbeat
  and manufacture the very lapse #349's remedy exists to repair.

---

## 4. Rejected, and what each would have cost

| Alternative                                                                     | Why not                                                                                                                                                                                                                                                                                                              |
| :------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Retried by the existing revocation reconcile pass**                           | Corrupts the #362/#384 deadline-measurement contract and its own documented pitfall against threading unrelated work through that seam; two unrelated jobs behind one deadline-bound pass.                                                                                                                           |
| **A periodic reconcile diffing this instance's holds against local `presence`** | The mirror image of the periodic self-audit ADR 007 §4 already rejected for hold re-assertion: a steady-state O(holds) cost paid every tick whether or not anything ever failed, plus a brand-new "read my own owned set" port capability the memory driver can never need.                                          |
| **A bounded in-line retry inside `unsubscribe`/the compensation**               | Short enough not to hold the caller hostage, it does not cover a real outage window; long enough to cover it, it holds `handlerHooks.onClose` — and the whole socket teardown — waiting on a broker already shown unwell, exactly what ADR 006/007 moved this class of problem out of the request/teardown path for. |
| **Reusing `LapseRun` directly, or a generic scheduler interface now**           | `LapseRun`'s own fileoverview declines this on purpose; ADR 007 §4's rule says a shared abstraction is warranted only once a second production driver needs three or more hooks — not before.                                                                                                                        |
| **The State pattern for "owed / not owed" per slot**                            | One boolean-shaped fact (present in the map or not) and one transition; no state machine earns its own abstraction here.                                                                                                                                                                                             |

---

## 5. What this does not solve

- **A retry that keeps failing forever.** Named acceptable residue in #371's own
  filing; this remedy bounds the _rate_ (one attempt per heartbeat) and the
  _memory_ (the cap), never the _count_. The ghost sweep stays the backstop of
  last resort once this instance eventually dies.
- **A drain racing a fresh join for a _different_ member id that reuses the same
  slot key coincidentally.** Cannot happen: the key includes
  `String(member.id)`, and #346 already guarantees that type is stable per
  identity.
- **The #359 confidentiality window** (a stranded member's `info` visible
  cluster-wide) is only shortened, to at most one heartbeat interval on Redis,
  and to zero on memory (unreachable there) — not eliminated on Redis.
- **A broker that never lets any command settle at all.** That is #362/ADR 011's
  port-contract duty; this remedy's writes go through the same port and inherit
  that bound.
- **Cross-instance duplication of retry work**, the same way the ghost sweep
  already accepts it (ADR 006 §5).

---

## 6. The standing constraint

**A roster release ChannelManager could not commit is always retried, never
merely WARNed.** Both catch sites that once ended at an inline `console.warn`
now call `#recordOwedRelease`; a future release-issuing call site does the same,
through that one helper, rather than reintroducing a silent WARN. The drain's
own write path is `#syncRosterMember` alone — a future maintenance concern that
needs to write the roster routes through it, never around it.
