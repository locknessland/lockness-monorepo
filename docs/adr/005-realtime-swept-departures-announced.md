# ADR 005 — A slot the ghost sweep empties is announced as left, by the manager, exactly once

**Status:** Accepted **Date:** 2026-09-23 **Owner:** architect **Amends:**
[ADR 004](004-realtime-roster-slots-held-per-instance.md) §2, §5, §6
**Affects:** `packages/realtime/driver.ts`, `packages/realtime/protocol.ts`,
`packages/realtime/manager.ts`, `packages/realtime/drivers/redis.ts`,
`docs/realtime.md`

---

## 1. The question

When a Redis-backed instance crashes, a surviving instance's reconcile pass
releases the dead instance's roster holds (ADR 004 §2, "the ghost sweep"). The
authoritative roster is then right, but **nobody tells the room**
([#348](https://github.com/locknessland/lockness-monorepo/issues/348)): the
sweep threw the release script's reply away, and no `left` frame or
`presence-leave` control frame was sent.

An application that builds its member list from `joined` / `left` — a documented
integration style — kept a ghost for every member the crashed instance held,
until each subscriber resubscribed and got a fresh `here`. ADR 004 made `left` a
per-member event and made the sweep reuse the release script, which already
knows when a slot empties; the sweep discarded exactly that answer. #344's
product question P1 had settled that a crash produces a plain `left`, with no
distinct reason.

---

## 2. The decision

**The release script answers which entry left; the sweep reports it to the
manager through one optional driver callback; the manager announces it through
the one announcement home.**

### The release reply carries the departure

`RELEASE_MEMBER_SCRIPT` replies with **the released holder's stored entry** (a
bulk string) when its release empties the slot, and integer `0` otherwise. The
entry _is_ the gone bit. One strict decoder, `decodeReleaseReply`, maps `0` → no
departure and a non-empty bulk → the entry; anything else throws.
`releaseMember` keeps its public contract (`RosterRelease { gone }`), with
`gone = entry !== undefined`. The hold decoder is renamed `decodeHoldReply` and
is hold-only.

**Exactly once across any number of sweepers**, from the script's atomicity
alone: the read and the delete of the dead holder's entry are one step, so of
two sweeps of one dead instance only the first release gets the entry.

### The seam: one optional callback

`BroadcastDriver` gains
`onRosterDeparture?(handler: (departure: RosterDeparture) => void | Promise<void>): void`
and the exported type `RosterDeparture { channel, member }`. A driver calls the
handler **only for a slot it emptied while releasing another process's hold** —
never for `releaseMember`, whose caller announces `gone` itself. One handler:
re-registration replaces it, `close()` drops it (the `onRevocationReconcile`
precedent). The manager registers it at construction **only when it has a
roster**.

### The sweep reports, and checks what it reports

`#sweepInstance` is the only caller of the handler. For each entry a release
returned, it drops — one WARN naming the channel only, no report, the release
still committed — an entry whose owned-entry channel is not a valid name, whose
value does not decode, or **whose member id is not the slot it was released
from**. Otherwise it calls the handler, awaited one at a time; a throw is the
same one WARN and the sweep goes on.

**A swept `presence-leave` carries broker-sourced bytes.** The entry comes out
of Redis and the sweeper signs it into a MAC-valid control frame. The channel
and slot-binding checks are what stop a broker-level writer from making a
sweeper announce `left` for a member who is present; that writer already
controls the unsigned data plane, which is the residue.

No WARN on this path renders the entry, the member or a parser error: a V8
`SyntaxError` quotes its input, so `#parseRosterValue` logs a fixed reason
instead — which fixes its `readRoster` caller too.

### The manager: the second caller of `#announcePresence`

The departure handler checks the departure — a valid channel name and a member
that passes `isWirePresenceMember` (`protocol.ts`; renamed
`isPresenceMemberWire` and made an allow-list of keys by #350), the same rule
every peer's ingest applies — then announces a `left` through
`#announcePresence`, with the channel as the frame's `target`. A departure that
fails either check is dropped with one WARN: this instance must not show its own
subscribers a frame every peer refuses.

`#announcePresence`'s `origin` parameter became `target: string`. A departure
passes the **channel name**: it always passes the peers' `isValidName`, and no
receiver acts on `target` for a presence frame. `ControlMessage.target`'s JSDoc
now says so: acted on only for `evict` / `revoke-channel`, informational on
`presence-join` / `presence-leave`.

### `left` precedes an in-flight hold's `joined`

A hold of the same slot issued while the sweep's release is outstanding commits
after that release. Three things keep the room hearing `left` before that hold's
`joined`, and they are one decision:

- the sweep does **no I/O await** between the release reply and the handler
  call;
- the manager's handler is **not queued on the slot's roster tail** and awaits
  nothing before `#announcePresence`;
- the Redis command client runs **one exchange in flight at a time** — a
  contract now stated on the `RedisCommandClient` port.

---

## 3. Why this shape

**Only the release knows when a slot empties, and which entry left.** Reading
the holders hash before or after the `EVAL` is a second round trip another
instance's hold can invalidate; putting the entry in the reply leaves nothing to
race and needs no lock.

**The manager already owns every announcement** (ADR 004 §6). A driver that
reports and a manager that announces keeps encoding, fan-out, the `joined`
exclusion and the MAC-signed publish in one place, for every driver that opts
in.

**Optional, so nothing breaks.** The memory driver has no survivor to announce
from, a roster-less driver has no slot to empty, and a third-party driver that
does not implement the callback keeps today's silent sweep.

---

## 4. Rejected, and what each would have cost

| Alternative                                                             | Why not                                                                                                                                                                                                                                                                                         |
| :---------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The driver publishes `presence-leave` itself**                        | No seam change, but a second announcement home (breaks ADR 004 §6); the winner's own subscribers miss it (a driver drops its own frames on loopback) unless an unauthenticated frame is injected into the MAC-checked path; and every roster driver re-implements encode, fan-out and exclusion |
| **Each sweeper emits locally, none publishes**                          | Only the winner knows the slot emptied; the others would need a racy holders read, or would duplicate                                                                                                                                                                                           |
| **A sweep lock or a leader (`SET NX`)**                                 | A new key family with a TTL and death-mid-sweep cases, an extra round trip, and it duplicates the per-slot exactly-once the script already gives                                                                                                                                                |
| **A `{ gone, entry }` tuple, or an `HGET` first**                       | The tuple can contradict itself; reading first costs two round trips and can report stale `info`. Cost accepted instead: a two-typed release reply and a second strict decoder                                                                                                                  |
| **The manager runs the sweep** (`sweepInstance(id): RosterDeparture[]`) | Moves liveness timers into a transport-agnostic manager; two seam methods instead of one optional one                                                                                                                                                                                           |
| **Queue the departure on the slot's roster tail**                       | Behind an in-flight hold, the room hears `joined` then `left` for a member who is present                                                                                                                                                                                                       |
| **A new `presence-swept` kind or a `cause` field**                      | Ignored or dropped by 0.3.0 peers; receivers need a second, identical handler                                                                                                                                                                                                                   |
| **Required on `PresenceCapableDriver`**                                 | The memory driver would carry a hook it can never call                                                                                                                                                                                                                                          |

---

## 5. What this does not solve

- **Crash latency.** The `left` arrives up to the liveness TTL plus the
  reconcile interval after the crash — about 25 s with the defaults.
- **A large crash is a burst.** K exclusively-held members cost the sweeper K
  release `EVAL`s plus K `PUBLISH`es on the shared command client; above the
  per-origin share of a peer's replay window (10 000 nonces) that peer WARNs and
  evicts the origin's oldest nonces, so a replay of one of them would be a
  duplicate `left`. Accepted: bounded by what the dead instance legitimately
  held, and batching needs a new kind or field that 0.3.0 peers would drop.
- **Lost frames.** The winning sweeper crashes, or its publish fails, after the
  release commits: nobody announces and nothing retries. Its local subscribers
  still get the `left`; peers heal on resubscribe.
- **Mixed 0.3.0 / 0.4.0 fleet.** A 0.3.0 sweeper announces nothing — at most one
  `left`, not exactly one. A crashed 0.3.0 instance wrote no holders entry, so
  its release returns `0` and nobody announces.
- **A lapsed-but-alive instance** stays missing from the roster while its
  sockets are open, until its next write for that slot; its own open tabs
  receive the swept `left` and never the later `joined`
  ([#349](https://github.com/locknessland/lockness-monorepo/issues/349)).
- **Holders entries no sweep reaches** (eviction, a rollback) are never
  announced.
- **A third-party driver** can call the handler falsely; the manager drops a
  malformed departure but cannot tell a well-formed false one from a true one. A
  driver is trusted code, and it already feeds `onControl`.
- **Overlapping reconcile passes** double the sweep's work; exactly-once still
  holds.
- **Redis Cluster**, and **frame order across publishers**, as in ADR 004.

---

## 6. The standing constraint

**`#announcePresence` has exactly two callers**: `#syncRosterMember`'s queued
run, on the bit a roster write returned, and the departure handler, on an entry
a release returned while emptying another process's slot. The receive side of
the control plane is the one other place a `joined` / `left` is emitted. **The
sweep is the only caller of the departure handler**, and `releaseMember` never
reports one. A departure is never queued on the slot's tail, and nothing awaits
I/O between the release reply and the announcement.
