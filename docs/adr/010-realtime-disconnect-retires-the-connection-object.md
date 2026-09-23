# ADR 010 — A disconnect retires the connection object, and a retired one is refused at admission

**Status:** Accepted **Date:** 2026-09-23 **Owner:** architect **Amended by:**
[#363](https://github.com/locknessland/lockness-monorepo/issues/363), when it
lands **Affects:** `packages/realtime/manager.ts`, `packages/realtime/mod.ts`,
`packages/realtime/types.ts`, `docs/realtime.md`, `packages/realtime/AGENTS.md`

---

## 1. The question

`ChannelManager.subscribe` awaits the application's authorizer, and only then
checks the caps, registers the connection in `connections` and joins.
`ChannelManager.disconnect` copies the connection's channel list once, awaits
`unsubscribe` for each, and forgets the id in its `finally`. **Nothing recorded
that a connection had been disconnected.** After the `finally`, "absent from
`connections`" looks exactly like "never registered", and `subscribe` may
register implicitly.

So a `subscribe` spanning a `disconnect` of the same connection wrote a
membership nothing would ever tear down. Three windows:

- **(a)** the authorizer resolves while the teardown loop is suspended: the join
  misses the copied list, and the `finally` forgets the id;
- **(b)** the teardown finishes while the authorizer is still pending;
- **(c)** `subscribe` is called after the teardown settled — any `onMessage`
  that awaits before it.

The stranded membership held a cap slot (the anonymous share included), a broker
watch nobody listened to, and on a presence channel a roster hold every instance
showed, which the lapse re-assert
([ADR 007](007-realtime-lapsed-instance-reasserts.md)) re-held after every
lapse. Where an application reused ids, a later connection under the stranded id
received the channel's frames without its authorizer ever running. In (b) and
(c) the implicit registration also re-added a zombie that `connectionCount`
counted.

A second cause stranded the same presence state: `unsubscribe` awaited the leave
before it forgot the presence member, so an unwatch that rejected skipped the
forget and the roster release.

Tracked as
[#361 — Realtime: a subscribe resolving during a disconnect of the same connection strands a channel membership forever](https://github.com/locknessland/lockness-monorepo/issues/361).

---

## 2. The decision

### Retirement is recorded by object, in one place

`ChannelManager` keeps a `WeakSet` of retired connection **objects**. Its JSDoc
in `packages/realtime/manager.ts` is **the definition**; this record links to it
and does not restate it. `disconnect` is its only writer: in its first
statements, before any await, from the same `connections.get` that decides the
`owned` outcome. Retirement and the copy of the reverse index share that one
synchronous turn, so a join that committed before it is in the copy and torn
down, and a join after it meets the retirement.

### Admission and ownership are different questions

`connections` still answers **ownership** — `unsubscribe`'s outcome, `evict`'s
routing, `revokeLocal`, the revocation decider and its `owns` predicate
([ADR 009](009-realtime-revocation-recheck-reads-index-in-pages.md)), and
delivery. A retiring connection is still owned until the `finally`: its
memberships and revocations are this instance's to act on. It is only no longer
**admissible**. One private predicate, `#assertAdmissible`, is the only reader
of the retired set; nothing that decides ownership consults it, and `disconnect`
does not delete from `connections` at its entry.

### Three askers, one decider

`register` asks first. `subscribe` asks twice: directly after the id and channel
assertions and before the authorizer, so a retired connection's authorizer never
runs; and again after the authorizer's result is classified, in the synchronous
turn it shares with the caps, the registration and the join's adds. Every
refusal lands before any write — nothing is taken, watched, held or announced,
so nothing is ever undone.

### Two refusal types, one predicate

- **This object was retired** → `ConnectionDisconnectedError`. The socket is
  gone; no retry can succeed; the application drops the frame.
- **A different object presents an id still bound to a retired one** →
  `ConnectionIdInUseError`. That breaches the `Connection.id` contract; it is
  neither retried nor dropped silently. The clause holds only while the id is
  bound, so it retains nothing.

One class could not carry both: "no retry will help, drop the frame" is true of
the first and false of the second.

### Precedence

The refusal replaces only an **admission**. Every outcome the authorizer's own
result produced — a denial (`{ ok: false }`) or a defect
(`AuthorizeResultError`, a member error) — is reported as produced. Before the
authorizer the retirement wins, because the authorizer never runs. Id and
channel defects come first everywhere. `subscribe` never resolves `{ ok: true }`
for a retired connection, and resolves `{ ok: false }` only when its own
authorizer denied.

### `unsubscribe` forgets before it leaves

The presence member is forgotten before the awaited leave, and the roster
release runs whether or not the leave rejected. The leave's failure is
re-thrown; a release failure after it is a WARN. A subscribe racing a suspended
leave then performs a real join instead of reading a membership the leave is
removing.

### A failure is recorded by a flag, never by its value

A rejection may carry `undefined`. Every failure collector in `manager.ts` —
`disconnect`, `unsubscribe`, `handlerHooks.onClose`, `evict`, `revokeChannel`
and the record clear under it — records a failure with a flag beside the value.

### The framework's socket path always disconnects

`handlerHooks.onClose` runs the application's `onClose`, then `disconnect`
whatever that hook did. The application's error is re-thrown first; a teardown
failure after it is a WARN.

---

## 3. The transport lifecycle contract

Retirement reaches only a transport that:

1. calls `register` with the connection object from its open hook;
2. presents **that same object** for the socket's whole life;
3. calls `disconnect` when the socket closes.

The same-object duty lives in the `Connection` JSDoc (`types.ts`), the open-hook
duty in `register`'s JSDoc, and the user-facing statement in `docs/realtime.md`
§ _Your connection ids and your transport's lifecycle_. `handlerHooks` and
`buildEvents` meet all three: `buildEvents` creates one object per socket.

---

## 4. Rejected, and what each would have cost

- **`disconnect` re-reads the reverse index until it is empty.** No new state,
  but it closes only window (a); (b) and (c) land after it returned and leave a
  zombie. The late subscribe still reports `ok: true`, presence announces a
  `joined` then a `left` for a member already gone, and the disconnect's
  duration becomes client-influenced.
- **An id-keyed tombstone or a per-id generation.** A set held only during the
  teardown closes only window (a). Covering (b) and (c) means one entry per
  socket ever closed — memory driven by client churn — and a TTL reopens the
  race at its edge. An object key is bounded by construction.
- **Making `register` mandatory**, so `subscribe` refuses an id absent from
  `connections`. A breaking change to most callers of `subscribe`, and it still
  misses window (a) unless `disconnect` deletes at entry, which moves every
  ownership reader. Implicit registration deserves retiring on its own merits,
  separately.
- **Refuse-and-undo.** A transient cap slot other subscribers can observe, a
  watch then an unwatch at the broker, and a cluster-wide `joined` then `left`.
  Every refusal in `subscribe` sits above the writes so nothing needs undoing.
- **A `closed` flag on `Connection`.** It is an interface applications
  implement: a required member breaks every custom transport, an optional one
  fails open, and it answers "is the socket closed?", not "has this manager torn
  it down?".
- **`{ ok: false }`, or a `reason` field on `SubscribeResult`.** `{ ok: false }`
  means a denial (#331); an application auditing denials would record one that
  never happened, and a field is ignored by every caller that checks only `ok`.

---

## 5. What this does not solve

- **An unregistered connection's first `subscribe` racing `disconnect(id)`.**
  Nothing was registered, so nothing is retired; the subscribe registers and
  joins a socket nobody will disconnect. It breaks duty 1 and is unreachable
  through `handlerHooks`. Retiring implicit registration is its fix.
- **A transport building a fresh `Connection` per call** is covered only while
  the id is still bound (window (a)). It breaks duty 2.
- **A different object under the id of a live, non-retiring connection** is not
  refused —
  [#363](https://github.com/locknessland/lockness-monorepo/issues/363), which
  amends this record.
- **`websocket.ts` ran the composed `onClose` outside its error guard**, so a
  rejection from it was unhandled. Resolved separately by
  [#369](https://github.com/locknessland/lockness-monorepo/issues/369): the
  rejection now reaches `onError`.
- **The #323 compensation in `#joinPresence`** still skips its roster reclaim
  when its leave rejects. It undoes its own write under an error it already
  propagates, and is filed separately.
- **A failed roster release during a teardown** can leave the driver-side hold;
  local state is clean and the failure is re-thrown.
- **A failed unwatch** leaves a broker subscription with no local member, which
  the next reconnect's re-issue heals.

---

## 6. The standing constraint

Retirement is keyed by object, is terminal, and is not a spelling of ownership.
Never consult it in the revocation decider or any other ownership reader, never
re-key it by id, and never delete from `connections` at `disconnect`'s entry.
