# ADR 010 — A disconnect retires the connection object, and a retired one is refused at admission

**Status:** Accepted **Date:** 2026-09-23 **Owner:** architect **Amended by:**
[#370](https://github.com/locknessland/lockness-monorepo/issues/370) and
[#363](https://github.com/locknessland/lockness-monorepo/issues/363), 2026-09-25
(§7); [#404](https://github.com/locknessland/lockness-monorepo/issues/404),
2026-09-25 (§7, the `onClose` pairing);
[#372](https://github.com/locknessland/lockness-monorepo/issues/372), 2026-09-26
(§5); [#393](https://github.com/locknessland/lockness-monorepo/issues/393),
2026-09-26 (§6, §7) **Affects:** `packages/realtime/manager.ts`,
`packages/realtime/mod.ts`, `packages/realtime/types.ts`, `docs/realtime.md`,
`packages/realtime/AGENTS.md`

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

> **Amended by §7.** `subscribe` now asks `#assertBound` at both sites, which
> asks this decider first and then whether the object is registered.

### Two refusal types, one predicate

- **This object was retired** → `ConnectionDisconnectedError`. The socket is
  gone; no retry can succeed; the application drops the frame.
- **A different object presents an id still bound to a retired one** →
  `ConnectionIdInUseError`. That breaches the `Connection.id` contract; it is
  neither retried nor dropped silently. The clause holds only while the id is
  bound, so it retains nothing.

One class could not carry both: "no retry will help, drop the frame" is true of
the first and false of the second.

> **Amended by §7.** Clause 2 now refuses any different holder, live or
> retiring, and a third refusal, `ConnectionNotRegisteredError`, joins these
> two.

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

> **Amended by #404 (§7).** The application's `onClose` now runs only for a
> socket whose `onOpen` ran, and once; `disconnect` still runs on every close.

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

> **Amended by §7.** The three duties are now enforced rather than assumed:
> `subscribe` refuses an unregistered object, a different object under a held id
> is refused, and duty 3 reads "call `disconnect(conn)` with the registered
> object" — its home is `disconnect`'s JSDoc.

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
  separately. _Reversed by
  [#370](https://github.com/locknessland/lockness-monorepo/issues/370) (§7):_
  retirement is keyed by object, so the window-(a) case is already refused by
  clause 1 and no delete at entry is needed; the breaking change was accepted to
  close an availability hole.
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

- ~~**An unregistered connection's first `subscribe` racing
  `disconnect(id)`.**~~ **Resolved by
  [#370](https://github.com/locknessland/lockness-monorepo/issues/370) (§7):**
  `subscribe` refuses an object `register` never bound, before its authorizer.
- ~~**A transport building a fresh `Connection` per call**~~ **Resolved by
  [#363](https://github.com/locknessland/lockness-monorepo/issues/363) (§7):** a
  different object under a held id is refused at any time.
- ~~**A different object under the id of a live, non-retiring connection**~~
  **Resolved by
  [#363](https://github.com/locknessland/lockness-monorepo/issues/363) (§7).**
- **`websocket.ts` ran the composed `onClose` outside its error guard**, so a
  rejection from it was unhandled. Resolved separately by
  [#369](https://github.com/locknessland/lockness-monorepo/issues/369): the
  rejection now reaches `onError`.
- **The #323 compensation in `#joinPresence`** still skips its roster reclaim
  when its leave rejects. It undoes its own write under an error it already
  propagates, and is filed separately.
- **A failed roster release during a teardown** can leave the driver-side hold;
  local state is clean and the failure is re-thrown.
- ~~**A failed unwatch** leaves a broker subscription with no local member,
  which the next reconnect's re-issue heals.~~ **Resolved by
  [#372](https://github.com/locknessland/lockness-monorepo/issues/372):** a
  failed unsubscribe **write** now discards and reconnects the Redis subscribe
  socket directly, in `@lockness/redis`, instead of depending on an unrelated
  later fault to trigger that reconnect — the same treatment every other write
  on that connection already gets. A lost `+punsubscribe` **acknowledgement**
  (the write landed, the broker's reply didn't) is a different failure mode and
  is untouched.

---

## 6. The standing constraint

Retirement is keyed by object, is terminal, and is not a spelling of ownership.
Never consult it in the revocation decider or any other ownership reader, never
re-key it by id, and never delete from `connections` at `disconnect`'s entry.

Since §7: `register` is the only writer of `connections`, and a teardown the
framework runs acts only on the object that owns the id.

Since #393: the map now stores the settled promise, not a boolean — a second
teardown of an object already present joins it rather than running its own.

---

## 7. Amendment — `register` is the only way in, and teardown is owner-scoped

_[#370](https://github.com/locknessland/lockness-monorepo/issues/370) and
[#363](https://github.com/locknessland/lockness-monorepo/issues/363),
2026-09-25. The design is the `architect-expert` disposition of that date, as
amended by its plan audits._

### The owner rule

Every id has at most **one owner object**: the object `register` bound under it.
`register` is the only writer of `connections`; `subscribe`'s implicit write is
gone. Three deciders, and only these, compare a binding to an object:

- **`#assertAdmissible`** — clause 1 (this object was retired) is unchanged and
  first. **Clause 2 is widened**: from "the id is bound to a retired object" to
  "the id is bound to a **different** object", live or retiring. The same object
  presenting itself again passes, which makes a second `register` of one object
  a no-op. `register` asks it first, before the id charset — an order nobody can
  observe, because a bound id was already usable.
- **`#assertBound`** — `subscribe`'s decider, asked at both of #361's sites:
  admissibility **first**, then "is it registered". A retired object whose id is
  already unbound therefore hears `ConnectionDisconnectedError`, not an
  instruction to register. Its JSDoc holds why two mutations of `subscribe` are
  equivalent (the post-site's registration clause is unreachable while the
  `finally` below is guarded; re-adding the write stores what is there).
- **`#isOwner`** — `connections.get(id) === object`. Its askers are
  `disconnect`'s object form, `disconnect`'s loop (before each leave),
  `disconnect`'s `finally`, and `handlerHooks.onMessage`.

### Owner-scoped teardown

`disconnect(target: string | Connection)`:

- **the object form** asks `#isOwner` first and returns `'not-owned'` before
  retiring, copying or awaiting anything when the object does not own its id —
  the socket `register` refused, or an evicted socket whose id was
  re-registered;
- **the id form** is unchanged. `evict` (through `revokeLocal`) keeps it;
- **the loop** stops before a leave once the torn-down object no longer owns the
  id: each leave is keyed by id, so the rest of its copy would strip the new
  owner of any channel both held (added by the #370 review);
- **the `finally`** deletes the binding and the reverse index only while the
  torn-down object still owns the id, so a teardown whose object was replaced
  while it ran leaves the new binding alone.

`handlerHooks.onClose` passes the object. `handlerHooks.onMessage` runs the
app's hook only for the owner and drops any other frame without a log line — a
line per frame from a socket with no owner would be a flooding vector. `onOpen`
still answers every `register` refusal with `1011 'unusable connection id'`: no
new client-visible text, and a distinct reason would tell a client whether an id
is live.

### Why three refusal classes and no base class

`ConnectionDisconnectedError` (drop the frame: the socket is gone),
`ConnectionIdInUseError` (mint a fresh id per socket) and
`ConnectionNotRegisteredError` (call `register` from the open hook) each call
for a **different remedy**. A shared base class would invite one `catch` for all
three, which is exactly the handling none of them should get; a `reason` field
is ignored by every caller that checks only the class. Each class's JSDoc states
its own remedy and links here. Neither `ConnectionIdInUseError` (whose
constructor now takes no argument) nor `ConnectionNotRegisteredError` carries
the id in its message.

### Rejected, with their costs

- **(a) Implicit registration under the same checks** (#370 option b). It needs
  an id-keyed tombstone (§4) and keeps two entry points to one map.
- **(b) Deprecate first** (#370 option c). It keeps an availability hole open in
  a published package for a release cycle.
- **(c) Last registration wins** (#363 option b). An async `register`, and any
  stable id becomes a way to kill someone else's socket.
- **(d) A no-op old `disconnect`.** The second object still receives the first
  one's channels.
- **(e) `subscribe(id, channel)`.** A forgeable string replaces an unforgeable
  object as the thing admission is decided on.
- **(f) An `onClose`-only guard.** It protects only the framework path, and
  reads a binding outside the deciders.
- **(g) An object-only `disconnect`.** It breaks `revokeLocal` and every id-form
  caller.
- **(h) Deferring the teardown fix.** #363 would close while still reproducible
  through the refused socket's own close.

### What this does not solve

- **Apps that call `disconnect(conn.id)` from their own close hook** keep
  id-keyed teardown. On `handlerHooks` a refused socket no longer reaches that
  hook (#404, below), but an evicted socket whose id was re-registered still
  does, and its `disconnect(conn.id)` tears down the new holder. They should
  pass `conn`; deprecating the id form for app callers is
  [#392](https://github.com/locknessland/lockness-monorepo/issues/392). A custom
  transport that does not use `handlerHooks` keeps the refused-socket case too.
- ~~**Two overlapping teardowns of one object** mid-loop on a shared channel. It
  needs this record's retirement restructured to one teardown per object; the
  owner checks above cover only the case where the object was replaced.~~
  **Resolved by
  [#393](https://github.com/locknessland/lockness-monorepo/issues/393):** see
  below.
- **The app's own `onClose` runs exactly once for each socket whose `onOpen`
  ran** on `handlerHooks` — evicted ones included, refused ones never (#404,
  below). It is still not an ownership signal: an evicted socket's id may
  already be someone else's.
- **A custom transport that does not use `handlerHooks`** can still run app code
  for a socket that does not own its id. It must gate on `disconnect(conn)`'s
  outcome and never call `unsubscribe(conn.id, …)` for a refused socket.
- **A registered socket that is never disconnected** still leaks (duty 3).
- **An id is reusable once its teardown completes**, by design; `evict(id)`
  recovers a leaked binding. A cross-instance id collision is not detected.
- **§5's other bullets** are unchanged.

### #404 — the app's `onClose` pairs with its `onOpen`

_[#404](https://github.com/locknessland/lockness-monorepo/issues/404),
2026-09-25. The design is the `architect-expert` disposition of that date._

**The rule.** On `handlerHooks`, the app's `onClose` runs exactly once for each
socket whose `onOpen` ran — evicted sockets included, refused sockets never.
Before this, a socket `register` refused still got the app's `onClose`, so an
id-form verb there (`unsubscribe(conn.id, …)`, `disconnect(conn.id)`) landed on
the live owner of that id, and a per-identity counter kept in `onOpen` /
`onClose` was decremented for a socket it never counted.

**The home** is `handlerHooks`, and only there: a closure-local
`WeakSet<Connection>` of the **admitted objects**, added to after `register`
succeeds and before the app's `onOpen`, and cleared by the close — the app's
hook runs only when `opened.delete(conn)` succeeds. It is not a record of
refused sockets, the thing the earlier bullet said skipping the hook would need:
a refused socket simply never enters it. It pairs open with close and is never
asked who owns an id; `#isOwner` stays the one authority on that (row 17 of the
#370 plan). `disconnect(conn)` still runs on every close (#361), `onMessage`
keeps its owner gate, and `onError` stays ungated.

**Rejected, with their costs:**

- **(404-a) A public `owns(conn)`, or a flag on the connection.** A new public
  API whose natural use is the wrong question: ownership drops the hook for
  every evicted socket. A flag on the app's own `Connection` object is writable
  by the app and becomes a second source of truth beside `connections`.
- **(404-b) Skip the hook for non-owners** (`#isOwner` as the gate). An evicted
  socket no longer owns its id, so it loses its close hook: the per-identity
  counter is incremented on open and never decremented. This is the battery's
  M2, killed by the evicted-socket witness.
- **(404-c) `#isOwner || #retired.has(conn)`.** It restores the evicted socket,
  but a closed socket stays retired, so a second close runs the hook again; and
  it makes two admission stores answer a lifecycle question, adding an asker the
  owner rule does not list.

**What it does not solve:** an evicted socket whose id was re-registered still
runs the hook, and an id-form verb there hits the new holder (#392); a custom
transport that does not use `handlerHooks`; a transport that calls `onOpen`
twice for one object. By design, an app `onOpen` that throws or closes the
socket itself still gets `onClose` — the socket was admitted — so an app counter
must increment first; `docs/realtime.md` shows the pattern. `onError` still
hears a refused socket.

### #393 — one teardown per object

_[#393](https://github.com/locknessland/lockness-monorepo/issues/393),
2026-09-26. The design is the `architect-expert` disposition of that date._

**The rule.** `#retired` becomes a
`WeakMap<Connection, Promise<DisconnectOutcome>>`. A second `disconnect` of an
object already present here — `evict`'s id-form call racing the transport's own
close event with the object form, both entered while the object still owned the
id — joins the first call's promise instead of computing its own snapshot of
`#channelsByClient` and running its own loop. No new snapshot, no new loop: the
id stays bound to the retiring object until that one teardown ends.

**The home** is `disconnect`, and only there. The owner pre-check (object form)
is unchanged, asked first. `bound = connections.get(clientId)` is read exactly
as #361 always read it. If `bound` is present and `#retired.get(bound)` is
already set, that promise is returned — nothing else runs. Otherwise `#teardown`
(the extracted loop and `finally`, #361/#370/#363's shape, unmoved) is called
and its promise is written into `#retired` synchronously, in the same turn,
before `disconnect` does anything else: `#teardown` already ran up to its own
first `await` by the time that write happens, so nothing has run in between that
could have found `bound` retiring with no entry — a same-turn double call for
the very same object still joins. `#assertAdmissible` keeps asking
`.has(connection)`: the value a joiner reads is `disconnect`'s business, not
admission's.

**Rejected, with their costs:**

- **A second `WeakSet` (`#tearingDown`) beside `#retired`**, coordinated by
  polling or a callback. Two structures answering one question — exactly the
  duplication ADR 010 already avoids by design — for a guarantee a stored
  promise gives for free.
- **An id-keyed lock (`Map<string, Promise>`).** §4 already rejected an id-keyed
  retirement record for this exact reason: one entry per socket ever closed,
  memory driven by client churn, and it reopens a settled question. It would
  also need an explicit cleanup path a `WeakMap` gets from the GC alone.
- **Making `unsubscribe` itself owner-checked** (pass the object, verify per
  channel). `unsubscribe` is a deliberately id-addressed _public_ verb — apps
  and `revokeChannel` call it with a bare id — so widening its contract is a
  breaking change to a wider surface than `disconnect`'s own re-entrancy, and it
  would only treat the symptom per call rather than removing the duplicate
  caller.

**What this does not solve:**

- **The different-object case** — a different, live or retiring object under the
  id — is already closed by #363's per-channel `#isOwner` break (§7); unchanged
  here.
- **A third or later teardown of the same object** also joins the same settled
  promise. Correct, but a rejected first teardown means every joiner throws too
  — unchanged from the single-caller contract this always was.
- **Which callers race** is untouched: `evict`'s id-form call and a transport's
  own close event are the framework-internal pair this fix closes for; an
  application choosing to call `disconnect(conn.id)` itself is #392's and item
  21's territory.
- **§5's and §7's other bullets** are unchanged.
