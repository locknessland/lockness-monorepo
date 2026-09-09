# Realtime — a per-channel revoke that crosses processes — Design

**Status:** Draft for review (rev. 2 — the JSR pre-requisite resolved against
the free path; §6.2, §6.3, §6.5, §6.6, §7, §9, §10, §11 revised, the decision
unchanged) **Date:** 2026-09-09 **Issue:**
[#332](https://github.com/locknessland/lockness-monorepo/issues/332) **Owner:**
architect

---

## 1. Problem statement

`ChannelManager` has two tiers of verb and says so nowhere.

**The local tier** acts on the sockets _this_ instance owns: `register`,
`subscribe`, `unsubscribe`, `disconnect`, and the private `revokeLocal`. Every
one of them reads `connections` / `subscriptions` / `presence` /
`#channelsByClient`, all of which hold this instance's connections and nothing
else — `handleControl` re-emits presence frames and never writes `presence`
(`manager.ts:1700`), so a member joined on instance B is invisible to instance
A's maps.

**The addressed tier** has exactly one member: `evict(clientId)`. It writes the
durable marker first (`markRevoked`, `manager.ts:1499`), then either revokes
locally or publishes an `evict` control frame to the owner, and
`onRevocationReconcile` recovers a frame the bus lost (`manager.ts:1558`,
`drivers/redis.ts:1569`). It is the only verb whose contract is "wherever the
socket lives".

`unsubscribe(clientId, channel)` sits in the local tier while **looking** like
an addressed one, because it takes a `clientId` — a globally meaningful,
routable string — instead of a `Connection`. On a non-owning instance
`#leaveLocal` returns at `if (!set?.delete(clientId)) return`
(`manager.ts:1280`), the presence block is gated on the member it did not find
(`manager.ts:1363`), and the method resolves `Promise<void>`: nothing removed,
nothing announced, nothing reported.

Two consequences the issue does not state and that shape the answer:

1. **`disconnect(clientId)` has the identical defect.** It iterates
   `#channelsByClient.get(clientId) ?? []` — empty on a non-owner — and deletes
   two absent map entries. Any fix that special-cases `unsubscribe` leaves the
   same trap one method over, in the verb whose name promises _more_.
2. **There is no supported call for "drop this connection from this one room,
   everywhere."** `evict` is per-connection and hard-closes with 4403, taking
   the connection's other still-authorized channels with it — and the shipped
   `client.ts` has **no reconnect logic at all** (no `4403`, no `reconnect`,
   verified), so "ban from one room" delivered by `evict` is, for a framework
   client, "logged out of realtime".

#331 named this gap as its own residue and filed it. This design answers it
consistently with #331 rather than reopening it: a denial still never revokes,
and revocation stays an explicit server-side verb.

---

## 2. Goals

1. Give the local tier an outcome a caller can distinguish, without making
   cleanup throw.
2. Give the addressed tier a **channel scope**, using the durable path `evict`
   already owns — not a second, weaker one beside it.
3. State the tier split where it is read: the two docstrings,
   `docs/realtime.md`, `AGENTS.md`.
4. Pin both with multi-instance tests, and pin the **mixed-version** behaviour
   too — `0.3.0` is published and is now a party to every seam decision here.

## 3. Non-goals

- Changing `evict`'s per-connection semantics or its marker lifecycle.
- `AuthorizeResult` / `Authorizer` contract changes.
- Any form of continuous or per-message re-authorization (settled: S6, #331).
- Consulting the revocation index from `subscribe` (see §5.2 — this is the
  tempting edit and it is explicitly refused).
- Extracting `#leavePresence` symmetrically to #328's `#joinPresence` (see §8).
- Fixing #330. This design must not _widen_ it and must not conflict with its
  remedy (§6.6), but the write-ordering defect is that issue's.

---

## 4. Decision

**(a)** `unsubscribe` stays non-throwing and gains a **distinguishable outcome**
— `Promise<'left' | 'not-subscribed' | 'not-owned'>` — and `disconnect` gains
the same third state (`'disconnected' | 'not-owned'`), because a silent no-op in
one of the two id-addressed local verbs is the whole of this bug and leaving the
other one silent reproduces it verbatim.

**(b)** Yes: revocation becomes **scoped**, with a new addressed verb
`revokeChannel(clientId, channel)` that extends the existing durable path — the
same revocation index, the same reconcile pass, the same reconnect fast path —
rather than sitting beside it, and that leaves the socket open where `evict`
closes it.

The two halves complete each other. A distinguishable `'not-owned'` with no
remedy to point at would be half a decision; a remedy nobody discovers because
the wrong call stays silent is the other half.

### 4.1 Why this is the cleaner design, in this package's vocabulary

**The package's standing rule is that two different outcomes must not share one
representation, and it has been applied three times already.**
`ChannelLimitError` _throws_ rather than returning `{ ok: false }` explicitly so
resource exhaustion is not indistinguishable from an authorization denial
(`docs/realtime.md:551`). `ControlRefusal` (#318) exists because "a refused
frame and a published one are the same `void | Promise<void>`" — the same
defect, solved by making the outcome observable rather than by throwing.
`#leaveLocal` deletes the empty `Set` so that `subscriptions.has(channel)` is
_the one spelling_ of "this instance hosts it". Today `unsubscribe` gives
"removed", "owner, but not in that channel" and "wrong process entirely" one
representation: `undefined`. Recommendation (a) is that rule applied a fourth
time, and the mechanism follows #318's principle while diverging from its
carrier for a stated reason: #318 needed a seam because the fact was produced
deep in the driver, asynchronously; here the fact is produced synchronously in
the callee, so the return value is the right carrier.

**`evict` already decided that a revocation must not report success for
nothing.** `#assertUsableId` throws on an unroutable id precisely because the
alternative is "a control frame that every receiving instance drops on ingest,
and a revocation that reports success and does nothing" (`manager.ts:1481`).
That is the exact shape of a misaddressed `unsubscribe`. The precedent settles
the **value** (do not report success for nothing); it does not settle the
mechanism, and here a throw is wrong for the reason the method already records —
`unsubscribe` sits on the client-frame path and is reached from `disconnect`'s
teardown loop, where "creation is guarded, cleanup is total" (`manager.ts:1352`)
was decided for a stated reason. Report, do not refuse.

**A scope is an argument to a concept the model already has; a second revocation
path is a new concept.** After (b) the model reads: _membership is joined by
admission and ended by revocation; revocation is durable, addressed by
connection id, routed to the owner, and scoped either to the connection or to
one channel._ One marker, one reconcile, one control plane, two scopes.

**The type already knew.** `subscribe` cannot be misaddressed because it takes a
`Connection` — an object only the owner holds, since `connections` is private
(`manager.ts:490`). `unsubscribe` and `disconnect` take an id, and that
affordance is the bug. Retyping the local tier to take a `Connection` would make
misaddressing unrepresentable and is the strictly cleanest form of (a) — it is
rejected in §5.1 for a cost, not for taste.

---

## 5. Rejected options

### 5.1 On (a)

| Rejected                                                            | Its real cost                                                                                                                                                                                                                                                                                                                                                                            |
| :------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Document only** — say it is a local verb in three places, ship.   | Permitted by AC1 and genuinely cheap. It leaves a security-shaped call that reports success and does nothing, in a package that already refused exactly that for `evict`. It also relies on the operator reading a docstring at the moment they are writing a moderation feature — the population that most needs the signal is the one that will not look.                              |
| **Throw on a non-owned id** (`ConnectionIdError`-style).            | Fights a decision already taken and stated: `unsubscribe` is a removal path, reached from `disconnect`'s loop, and refusing a removal strands the state it would have removed (`manager.ts:1352`). It would also convert a benign race — the socket closed a millisecond earlier, `connections` already pruned — into a thrown error on the client-frame path.                           |
| **Return `Promise<boolean>`.**                                      | `false` would carry both "this instance owns you and you were not in that channel" (idempotent, correct, boring) and "you are talking to the wrong process" (a mistake). That is the collapse `ChannelLimitError` refused and that #331 refused for `AuthorizeResult`. One bit is cheaper to type and buys the wrong distinction.                                                        |
| **Retype the local tier to take a `Connection`** (unrepresentable). | The cleanest shape in the abstract, and rejected on cost: it breaks two documented public signatures for every consumer, and it breaks the _correct_ callers (the socket handler, which always holds the `Connection`) to discipline the incorrect ones. It also strands callers who legitimately hold only an id after the socket handler returned. Worth its own issue if ever wanted. |
| **An `onUnsubscribeMisaddressed` seam** (the #318 shape).           | The caller is synchronous with the fact and already in scope. A callback re-delivers to a listener what the callee could have returned to the caller, and adds registration surface for it.                                                                                                                                                                                              |

### 5.2 On (b)

| Rejected                                                                                                                                                                                                                             | Its real cost                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No verb — the operator calls `evict`.** (The "no" answer, at its strongest: one revocation path is simpler than two, and the end state is correct because the client reconnects and `authorize` refuses only the revoked channel.) | It hard-closes the socket, so every other authorized channel is dropped and re-joined — presence `left`/`joined` churn in every room the connection held, on every instance. It depends on a reconnect the framework's own client does not implement, so with the shipped `client.ts` a per-room moderation action silently ends the user's whole realtime session. And at fleet scale one kick per user per room becomes a socket storm. It is not a narrower revoke; it is a different, louder action. |
| **Control-frame only** — publish a `revoke-channel` frame, no durable marker.                                                                                                                                                        | This is the option AC2 names and #331 rejected two days ago for the same reason: a second revocation path beside `evict`'s, weaker, and the weaker one is the one the operator would reach for. A lost or MAC-refused frame means a revoke that reported success and did nothing — the very defect this issue is about, relocated from "wrong instance" to "lost frame", and now invisible instead of merely silent.                                                                                     |
| **Overload `evict(clientId, { channel })`.**                                                                                                                                                                                         | One verb, two scopes, and the scopes differ by _killing the socket_. Omitting an optional argument would escalate a room-scoped revocation into a full disconnect — silently, with no compile error. Escalation-by-omission is the worst available default for a security verb. **§6.2 shows this is not hypothetical**: it is precisely what a widened `markRevoked` would do to a 0.3.0 driver.                                                                                                        |
| **A durable per-channel deny list consulted by `subscribe`.**                                                                                                                                                                        | It reads as the strong version — enforcement at admission, no reliance on frame delivery — and it introduces a second authorization source beside the application's `authorize`, in a method whose contract is "the application decides". A stale entry then refuses a join the application has re-authorized, and the framework owns a policy it cannot explain. Explicit non-goal (§3).                                                                                                                |
| **Reuse the `presence-leave` control kind as the carrier.**                                                                                                                                                                          | It is an _announcement_ — `handleControl` re-emits it to local subscribers and touches no membership (`manager.ts:1700`). Giving it an imperative meaning on the owner would make one kind mean two things depending on who receives it, and would fire membership removal on every peer that already treats it as a fan-out.                                                                                                                                                                            |

---

## 6. Architecture / implementation shape

**The pre-requisite resolved against the free path.** `@lockness/realtime` is
published on JSR at **0.3.0**, and 0.3.0 is the only published version. The
package's own brief predicted this ("if a release goes out ahead of this change,
the shim question reopens"). Everything below that touches a seam is written for
a published predecessor, not a hypothetical one.

### 6.1 The verb

`revokeChannel(clientId, channel)` mirrors `evict` exactly:

1. `#assertUsableId(clientId)` **and** `#assertUsableChannel(channel)`. Both
   values travel on the control plane and into a durable record, so this is a
   _minting_ boundary, not a cleanup one — the #314 asymmetry (`unsubscribe` is
   deliberately not channel-asserted) is preserved and the two verbs disagree on
   purpose. Say so in the docstring; a reviewer will otherwise read it as drift.
2. Durable first: `markRevocation({ target, channel })`. A failure is caught,
   warned and re-thrown **after** the revocation was applied — the identical
   never-fail-open sequencing `evict` uses (`manager.ts:1497-1526`).
3. If `connections.has(clientId)` → `#revokeChannelLocal`; else
   `publishControl({ kind: 'revoke-channel', target, channel })`.

`#revokeChannelLocal(clientId, channel)` — the parallel of `revokeLocal`, and
the one place the channel scope is applied:

- `await this.unsubscribe(clientId, channel)` — reusing the whole existing leave
  path: roster removal, local `left`, and the cross-instance `presence-leave`
  announcement. **No new announcement machinery.**
- if the outcome was `'left'`, send the revoked client
  `{ type: 'unsubscribed', channel }` — a frame the protocol already defines and
  that the manager has never sent. Without it a server-initiated revoke is
  invisible to its target (the leaver is removed from `subscriptions` before
  `emitPresence`, so it does not even receive its own `left`), whereas `evict`'s
  target at least gets close code 4403.
- clear the durable record (§6.3).

### 6.2 The seam, against a published 0.3.0

**Widening `markRevoked(target)` to `markRevoked(target, channel?)` is refused,
and the reason is worse than a silent downgrade.** A one-parameter
implementation satisfies a two-parameter signature, so a 0.3.0 third-party
driver type-checks, ignores the `channel`, and writes a **connection-scoped**
record. Any reader — its own reconcile, or an upgraded one — then applies it as
a connection revocation: `revokeLocal`, hard-close 4403, every other channel
gone. That is not a per-channel revoke degrading to nothing; it is a per-channel
revoke **escalating to a socket kill**, with no error, no warning and no type
failure. It is the same escalation-by-omission this design already rejected for
`evict(id, { channel })` (§5.2), arriving through the seam instead of through
the call site.

**Chosen: replace the pair, and probe for the capability at construction — the
`presenceRoster` / `channelWatcher` shape, which this package already uses
twice.**

| Member             | 0.3.0              | After                                                    |
| :----------------- | :----------------- | :------------------------------------------------------- |
| `markRevoked?`     | `(target: string)` | **removed**                                              |
| `listRevoked?`     | `(): string[]`     | **removed**                                              |
| `markRevocation?`  | —                  | `(revocation: Revocation): void \| Promise<void>`        |
| `listRevocations?` | —                  | `(): Revocation[] \| Promise<Revocation[]>`              |
| `clearRevocation?` | —                  | `(revocation: Revocation): void \| Promise<void>`        |
| `Revocation`       | —                  | `{ readonly target: string; readonly channel?: string }` |

- **`revocationStore(driver)`** narrows the three members as a **set**, once, at
  construction — never member-by-member at a call site. The precedent is
  explicit: `channelWatcher` detects `watchChannel`/`unwatchChannel` as a pair
  because "watching without unwatching is strictly worse than the behaviour it
  replaces and invisible, because delivery stays correct." A driver that can
  mark but not clear has the same shape of defect (§6.3).
- **A driver presenting the 0.3.0 members and not the new ones throws at
  construction**, naming the migration. Not a warning: the alternative is that
  `evict` silently loses durability on a driver that plainly implements it,
  which is the failure mode the whole seam exists to prevent. It cannot fire for
  `MemoryBroadcastDriver`, which implements none of them (verified).
- **`revokeChannel` requires the store when the driver has a control plane.** A
  driver with `publishControl` and no revocation store could still route the
  frame, but that is exactly the undurable path §5.2 rejects — so
  `revokeChannel` throws `RevocationScopeError` (new, exported,
  `ConnectionIdError`-shaped) rather than performing a revocation that may
  vanish. On a single-process driver (no control plane, no store — the memory
  driver) `revokeChannel` is a plain local leave plus the client notification,
  and no durability is owed because there is no bus to lose a frame on.

Rejected alternatives for this seam:

| Rejected                                                                       | Its real cost                                                                                                                                                                                                                                                                                                                                |
| :----------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add `markRevokedScoped?` beside `markRevoked?`, keep both.**                 | Two members writing one index — two spellings of one fact, which is the smell this package removes on sight (`subscriptions.has` is _the_ spelling of hosted). It also leaves the escalation hazard live for anyone who keeps calling the old one, and doubles the surface that the next scope has to extend.                                |
| **Keep `listRevoked(): string[]` and parse the composite in the manager.**     | Backward-compatible on the read side, and it makes the byte encoding **normative for every implementer** while still looking like an opaque string. A third-party driver would have to reproduce the delimiter exactly, with nothing in the type saying so. That is the implicit contract this package's `FakeRedis` rules exist to prevent. |
| **A `version` discriminator on the record.**                                   | It versions the _data_ to answer a question about the _capability_, and it answers it after the write has already happened. A probe answers it before, at construction, once.                                                                                                                                                                |
| **A dual-publish / shim release** (0.3.x keeps the old seam, 0.4 the new one). | The package is imported by nothing in-repo and is one release old; a compatibility branch would be maintained for a population that is very likely empty, and the construction-time throw already gives that population an actionable error rather than a silent failure.                                                                    |

### 6.3 The durable record, and what a mixed fleet reads

One index, one script family, one reap — extended, not duplicated.

- **The encoding stays inside the Redis driver.** The seam carries the domain
  fact (`Revocation`); the driver chooses the bytes. Same split as the
  client-visible `PresenceMember` versus the driver-internal sweep metadata
  (FR-018).
- The ZSET member is `"<target> <channel>"` for a channel-scoped record and
  stays a bare `"<target>"` for a connection-scoped one. A space is outside
  `NAME_RE` (`/^[A-Za-z0-9:._-]+$/`) and both halves are asserted against it
  before the write, so the composite is decidable in both directions — strictly
  stronger than the existing owned-set entry (`<channel> <field>`,
  `indexOf(' ')`), where the field is unconstrained.
- `MARK_REVOKED_SCRIPT` keeps its shape: the composite is a different member
  string, and the `ZADD … GT` / `EXPIRE NX` / `EXPIRE GT` extend-only discipline
  and the in-script `TIME` read apply unchanged.

**What each side reads when it meets the other's records, during a rolling
deploy:**

| Reader | Record                                | What happens                                                                                                                                                                              |
| :----- | :------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.3.0  | bare `"c1"` (connection scope)        | Unchanged behaviour — `connections.has('c1')` → revoke or skip.                                                                                                                           |
| 0.3.0  | `"c1 private-orders"` (channel scope) | `connections.has('c1 private-orders')` is **structurally false**: a connection id passed `#assertUsableId`, so it can never contain a space. The record is skipped. **Inert, not wrong.** |
| New    | bare `"c1"`                           | No space → parsed as connection scope. Correct, and no index migration is needed.                                                                                                         |
| New    | `"c1 private-orders"`                 | Parsed as channel scope, applied by the owner, then cleared.                                                                                                                              |

So the answer to "can a mixed fleet silently drop a revoke, or wrongly widen one
to the whole socket?" is: **drop yes, widen no** — and the "no" is bought by two
things that must not be quietly relaxed. The space delimiter is what makes an
old reader inert rather than confused (any delimiter inside `NAME_RE` would let
a composite collide with a real id), and §6.2's construction-time throw is what
stops a 0.3.0 _driver_ from writing the widened record in the first place.

**`clearRevocation` exists only because the two scopes differ in whether the
target outlives the application.** A connection-scoped record becomes moot the
instant the socket dies, so `evict` leaves it to the TTL and this design does
not touch that. A channel-scoped record has a live socket to act on for the
whole TTL, so an un-cleared record would re-apply the leave at every reconcile
tick — kicking a client that has legitimately re-subscribed, up to one reconcile
interval after each attempt. Clearing on apply makes the record mean one thing:
_a revocation the owning instance has not applied yet._

- Alternative considered: a much shorter TTL for channel-scoped records (~2 ×
  `reconcileIntervalMs`) and no `clearRevocation`. Less surface, but it keeps a
  bounded flap and adds a second tunable whose relationship to
  `revocationTtlSeconds` nobody would remember. Rejected.

### 6.4 The control kind in a mixed fleet — verified, and it holds

A new kind rather than a new field on `evict` was argued as tidier; with 0.3.0
published it is load-bearing, so it was checked against the 0.3.0 ingest path
rather than assumed:

1. **Size gate** — a `revoke-channel` frame is a kind and two names, far under
   `maxControlPayloadBytes`. Passes.
2. **Shape gate** (`drivers/redis.ts:1708-1729`) — it tests
   `typeof wire.kind !== 'string'`, **not** a kind allowlist. Passes.
3. **MAC** — `#canonical` covers
   `kind, target, channel, member, origin, ts,
   nonce` and the new frame
   introduces **no new wire field**, so a 0.3.0 peer canonicalises exactly the
   same bytes and the signature verifies. _This is the fact that makes a new
   kind safe and a new field unsafe:_ a field added to the wire but not to
   `#canonical` would ship unauthenticated, and one added to both on the new
   side only would be dropped by every 0.3.0 peer as an invalid MAC.
4. **Name re-validation** (`drivers/redis.ts:1752`) — `target` and `channel` are
   `isValidName`-checked, and `revokeChannel` asserts both before publishing.
   Passes.
5. **Replay window** — the nonce is admitted and stored: the frame costs a 0.3.0
   peer one nonce slot.
6. **`handleControl`** — its switch has three cases and no `default`, so an
   unknown kind falls through and the function returns. **Inert.**

**Acceptable, with one named consequence.** A revoke aimed at a socket owned by
a 0.3.0 instance is ignored, and the durable record does not rescue it (row 2 of
§6.3). The reconcile does _not_ cover this case and cannot: the record is only
ever applied by the owner, and the owner is the instance that cannot read it.
What closes it is the deploy itself — when the 0.3.0 instance drains, its
sockets close, and the reconnecting client is re-admitted through `authorize` on
an upgraded instance, which is #331's model working as designed. The record then
expires unmatched (new connection, new id). The upgrade note (§9) says this
plainly and names `evict` as the verb every version obeys if certainty is needed
mid-deploy.

### 6.5 Consumer impact

- **`unsubscribe` / `disconnect` return-type widening.** Not a compile error for
  callers that ignore the value, and `(…) => Promise<X>` remains assignable to a
  `(…) => Promise<void>` annotation. It _is_ a contract change, it breaks a
  subclass that overrides either method with `Promise<void>`, and it needs the
  recorded decision AC1 asks for — this document plus the docstrings.
- **`BroadcastDriver`'s revocation members are renamed and retyped.** In-repo
  that is the Redis driver and the fakes. Out of repo it is a 0.3.0 implementer,
  who gets a construction-time throw naming the migration rather than a silent
  loss of durability (§6.2).
- **Wire:** one new control kind, MAC-compatible in both directions, ignored by
  a 0.3.0 peer (§6.4).
- **Redis keyspace:** no new key, no migration, no dual-write; the index is
  read-compatible in both directions (§6.3).
- **Dependency graph:** unchanged. `contract`, `hono`, `redis` static, `events`
  soft. No new edge; `deps:analyze` unaffected.

### 6.6 Interaction with #330 — no subsumption, one real conflict

`tests/subscribe_unsubscribe_race_330.test.ts` fails deterministically today: a
`subscribe` and an `unsubscribe` for the same `(connection, channel)` leave two
authoritative roster writes outstanding, and removal-then-add strands a member
no live instance ever sweeps.

**Neither issue subsumes the other.** #330 is about the _ordering_ of
authoritative writes on the owning instance; #332 is about _reach_ from an
instance that owns nothing. Serializing a connection's verbs makes the
join/leave order deterministic where both racers already are; it does nothing
for a leave issued where no local verb is ever called.

**They do conflict, in one specific way, and the other seat should hear it
before it picks a remedy.** #332 adds three non-frame callers of the leave path:
`revokeChannel`'s local apply, `handleControl`'s `revoke-channel` case, and
`reconcileRevocations`. So:

- **If the remedy serializes at the frame dispatcher** (`onMessage`'s
  `void guard(...)` in `websocket.ts`), #332's three callers bypass it entirely
  and the race re-enters through the control plane — invisibly, for the same
  reason #330 was hard to witness: the local maps still end consistent. **The
  serialization belongs at the manager's verb boundary, not at the dispatcher.**
- **If it serializes per connection with a non-reentrant lock**, note that
  `revokeLocal` → `disconnect` → `unsubscribe` is already a nested call on the
  same connection, and `#revokeChannelLocal` → `unsubscribe` would be a second.
  A naive per-connection mutex deadlocks on both.
- **If it fences the roster write**, `revokeChannel`'s removal must draw from
  the same sequence, and a reconcile's _repeat_ application must not burn a
  fence value that would then reject a later legitimate re-join. §6.3's
  clear-on-apply is what keeps repeats from happening at all, and is wanted
  under either remedy.

**Sequencing:** #330 should land first. #332 does not create the race — it adds
callers to a path that already races — but merging it first multiplies the
racers while the defect is open. If #332 lands first, its tests must not encode
the racy ordering as expected behaviour.

### 6.7 Files the developer will touch

| File                                                | What                                                                                                                                                                                                                |
| :-------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/realtime/manager.ts`                      | `revokeChannel`, `#revokeChannelLocal`, `RevocationScopeError`, the construction-time probe + 0.3.0-seam throw, outcomes on `unsubscribe`/`disconnect`, `handleControl` case, `reconcileRevocations` scope dispatch |
| `packages/realtime/driver.ts`                       | `Revocation`, `revocationStore`, the three new members (and removal of two), the new `ControlMessage` kind + their JSDoc                                                                                            |
| `packages/realtime/drivers/redis.ts`                | composite member encode/parse, `clearRevocation`, the renamed pair                                                                                                                                                  |
| `packages/realtime/mod.ts`                          | export `Revocation`, `RevocationScopeError`, the outcome unions if named                                                                                                                                            |
| `packages/realtime/tests/*` (new + `fake_redis.ts`) | §7                                                                                                                                                                                                                  |
| `docs/realtime.md`                                  | a "Revocation scopes" subsection; the §Revocation code block; the §Upgrading note (§9)                                                                                                                              |
| `packages/realtime/AGENTS.md`                       | the pitfall rows + regenerate the surface/tests blocks                                                                                                                                                              |

Also, while in the docstring: `unsubscribe`'s comment still says `disconnect`
"iterates `subscriptions.keys()`" (`manager.ts:1354`). It has iterated
`#channelsByClient` since the fix documented 40 lines below it. Fix the clause.

---

## 7. Validation criteria

Two-instance fixtures over `FakeRedis` (the shape in
`tests/redis_broker_integration.test.ts`), plus the memory-driver path.

1. **AC4, the headline.** B owns the socket; A calls
   `revokeChannel(id, 'presence-room')`. B removes the member, the roster no
   longer lists it, a `left` reaches presence subscribers on **both** instances,
   the socket **stays open**, and a broadcast on another channel the connection
   holds still reaches it.
2. **The outcome, all three.** Owner + member → `'left'`; owner + never joined →
   `'not-subscribed'`; non-owner → `'not-owned'`, **and the driver recorded no
   command and no control publish** for that call.
3. **`disconnect` on a non-owner** → `'not-owned'`, nothing removed anywhere.
4. **Durability.** Drop the control frame (refuse the publish, or a subscriber
   that never delivers), then fire the reconcile: the owner applies the channel
   leave. Fire it again: nothing happens (the record was cleared) and the
   connection may re-subscribe and stay.
5. **Mixed-fleet record reads — all four rows of §6.3's table**, driven against
   `FakeRedis` with a hand-written bare member standing in for a 0.3.0 write.
   The row that matters most: a channel-scoped member is **skipped** by a
   0.3.0-shaped reconcile and never widened to a socket revoke.
6. **The 0.3.0 seam is refused at construction.** A driver exposing
   `markRevoked`/`listRevoked` and not the new members throws, with the
   migration named; a driver exposing neither (the memory driver) constructs
   fine.
7. **`revokeChannel` refuses an undurable route.** Control plane present,
   revocation store absent → `RevocationScopeError`, nothing published.
8. **The control kind survives a 0.3.0 peer.** Sign a `revoke-channel` frame and
   run it through the 0.3.0 ingest chain: the MAC verifies (proving `#canonical`
   is unchanged), the frame is admitted, and `handleControl` does nothing.
9. **Name assertion.** `revokeChannel` throws on an id or a channel outside
   `isValidName` and publishes nothing (the `evict` precedent, both arguments).
10. **The client is told.** The revoked connection receives
    `{ type: 'unsubscribed', channel }` exactly once, and a _client-initiated_
    `unsubscribe` still sends nothing (the application owns that reply).
11. **Fake/real conformance.** Any new `FakeRedis` arm ships a row in
    `tests/live_fake_conformance.test.ts`; the fake must **refuse** an argument
    it does not read (#280).

Gate: `deno test -A packages/realtime/`, then
`deno fmt && deno lint && deno check && deno task test`,
`deno task deps:analyze`, `deno task agents:brief`.

**Mutation battery: yes**, one — `tests/mutations/channel_revoke_332.ts`. Three
mutants a green suite would otherwise survive: dropping the `clearRevocation`
call (only test 4's second tick sees it), inverting the `connections.has` guard
in `reconcileRevocations`'s channel branch, and **changing the composite
delimiter to a `NAME_RE` character** — which passes every same-version test and
breaks only the mixed-fleet inertness of §6.3, so test 5 is the sole witness.

---

## 8. What this does NOT solve — stated, not skipped

1. **It does not make the local tier's misaddressing impossible**, only visible.
   A caller who ignores the returned outcome gets exactly today's silence. The
   type-level fix (§5.1, `Connection`-typed local verbs) is deliberately not
   taken here.
2. **It does not re-authorize anything.** A connection whose access was revoked
   in the application's own store keeps every channel it holds until someone
   calls a revocation verb. Point-in-time authorization, settled by S6 and #331,
   unchanged.
3. **A revoke aimed at a socket owned by a 0.3.0 instance does not land**, and
   no reconcile can rescue it (§6.4). It is bounded by the deploy, and `evict`
   is the escape hatch every version obeys.
4. **It does not survive a broker outage longer than the record's TTL**
   (`revocationTtlSeconds`, default 300 s). A revocation issued while Redis is
   unreachable is not recorded at all — `revokeChannel` warns and re-throws
   after applying what it could, exactly as `evict` does.
5. **It does not fix #330** and must not be read as mitigating it (§6.6).
6. **It leaves `#leavePresence` unextracted.** #328 pulled `#joinPresence` out
   of `subscribe`; the symmetric extraction is wanted for the same reason and is
   **not** required here — `unsubscribe`'s `members.get` → `members.delete` pair
   is already synchronous and adjacent. If the developer extracts it anyway,
   that pair must stay in one synchronous turn. Better as its own issue, and
   better still after #330 picks its remedy.
7. **It does not bound how often a client may re-subscribe after being
   revoked.** The framework meters no WebSocket frame (`docs/realtime.md:588`).
8. **It gives the memory driver nothing new.** Single process, no control plane,
   no record: `revokeChannel` there is a local leave plus the client
   notification, worth asserting so the two drivers do not silently diverge.

---

## 9. ADR? — No. But the upgrade note is now load-bearing.

`docs/adr/` holds two framework-wide entries about the shape of the whole
repository. This is package-scoped, and the repo's convention for this class —
#314, #323, #327, #331 — is the docstring at the site plus `docs/realtime.md`
plus an `AGENTS.md` pitfall row.

What changed with the pre-requisite is the **§Upgrading** section of
`docs/realtime.md`, which now describes a migration from a real predecessor. It
owes five things, and naming 0.3.0 explicitly rather than "an older version":

1. **Upgrade every instance before relying on `revokeChannel`.** A 0.3.0 peer
   ignores the frame (§6.4), so a revoke aimed at a socket it owns does not land
   and the durable record does not rescue it. **Use `evict` mid-deploy if you
   need certainty** — every version obeys it.
2. **The driver seam renamed.** `markRevoked`/`listRevoked` →
   `markRevocation`/`listRevocations`/`clearRevocation` over a `Revocation`
   record. A driver still presenting the 0.3.0 pair **throws at construction**,
   on purpose: the alternative was losing `evict`'s durability silently. Show
   the three-line migration.
3. **No Redis migration.** The revocation index is read-compatible both ways; a
   channel-scoped record is structurally invisible to a 0.3.0 reader and can
   never be mistaken for a connection revocation (§6.3's table, quoted).
4. **`unsubscribe` / `disconnect` return values.** Not a compile error for
   callers; is one for a subclass override. Say what each state means and that
   `'not-owned'` means _use `revokeChannel`_.
5. **The new control kind** is MAC-compatible in both directions — no shared
   secret rotation, no coordinated restart.

The existing §Upgrading paragraph already tells operators that control frames do
not cross between old and new instances by design; this note sits beside it and
must not contradict it.

## 10. Pre-requisites & blockers

- **Resolved, against the free path.** `@lockness/realtime` **is** published on
  JSR at 0.3.0 (verified against the registry, not a workflow's green tick), and
  it is the only published version. §6.2, §6.3, §6.4 and §9 are written for that
  fact. No further check is owed and no dual-publish path is proposed — §6.2
  costs and rejects one.
- **#330 should land first** (§6.6). Not a hard blocker: this design adds
  callers to a racing path rather than creating the race. But its remedy has to
  be chosen knowing about `revokeChannel`'s three non-frame callers, and that is
  a message owed to the concurrent dispatch, not a dependency to wait on
  silently.
- #331 is landed and this is its named residue; #328 is merged and untouched.

## 11. Risks

| Risk                                                                                          | Mitigation                                                                                                                                                                                                                                           |
| :-------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The composite delimiter is later "tidied" to a `:` or a `.` for readability.                  | It is inside `NAME_RE`, so a composite would then collide with a real connection id and a 0.3.0 reader would widen a channel revoke into a socket kill. Mutant 3 of the battery is the only witness; the reason goes in the `AGENTS.md` pitfall row. |
| Someone re-adds `markRevoked` "for compatibility" and the escalation hazard returns.          | §6.2 is quoted in the pitfall row with the concrete failure (old driver ignores arg 2 → bare record → `revokeLocal` → 4403), and test 6 fails on a driver presenting the old pair.                                                                   |
| The construction-time throw fires for a driver that never implemented revocation at all.      | The probe tests for the **old** members' presence, not the new ones' absence. Verified: `MemoryBroadcastDriver` implements none.                                                                                                                     |
| `revokeChannel` reads as "the soft one" and operators reach for it where `evict` is required. | The docs table leads with the consequence (socket stays open / socket dies), not with the name; and §9's item 1 names `evict` as the mid-deploy verb.                                                                                                |
| Clear-on-apply is read later as an inconsistency with `evict` and "fixed" by removing it.     | The reason (the target outlives the application in one scope and not the other) goes in the pitfall row, and mutant 1 fails on removal.                                                                                                              |
| #330's remedy lands at the frame dispatcher and silently excludes the control-plane callers.  | §6.6 is written to be handed to that dispatch now, not discovered at integration.                                                                                                                                                                    |
| The outcome unions grow a fourth state as someone finds another case.                         | The states derive from two existing predicates (`connections.has`, `set.delete`) and nothing else; a fifth predicate is the signal that the tier split moved.                                                                                        |
