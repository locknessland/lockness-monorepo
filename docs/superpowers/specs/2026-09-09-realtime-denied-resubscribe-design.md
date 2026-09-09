# Realtime — a denied re-subscribe and the standing subscription — Design

**Status:** Draft for review **Date:** 2026-09-09 **Issue:**
[#331](https://github.com/locknessland/lockness-monorepo/issues/331) **Owner:**
architect

---

## 1. Problem statement

`ChannelManager.subscribe` (`packages/realtime/manager.ts:737`) runs the
application's `authorize` on every private/presence subscribe. When the
authorizer denies, the method answers `{ ok: false }` and returns
(`manager.ts:762`). If the connection already held that channel, nothing is
removed: it stays in `subscriptions`, so `deliverLocal` (`manager.ts:1421`)
keeps fanning every broadcast to it, and its presence roster entry stands.

An application that revokes access and expects "the next subscribe frame will be
refused" to mean "and it stops receiving" gets a refusal that changes nothing.

The framework already has an answer to the general question, in
`docs/realtime.md` §Revocation: _"authorization is point-in-time at subscribe.
Fan-out is not re-authorized per message; it delivers to the subscription set
the authorizer approved at subscribe time. Eviction is therefore the one
revocation path."_ What is missing is the specific case — the denied
**re**-subscribe — where a reader can plausibly believe the refusal did
something. **That silence is the defect**, and #331 is right that the current
state is neither of its two options: it is option (b) unwritten, which is
indistinguishable from an oversight.

`authorize` is documented as possibly being "a DB read, an audit write or a
rate-limit increment" (`manager.ts:744`, `748`), so `false` already carries more
than one application meaning today.

---

## 2. Goals

1. Settle, in one sentence and in the domain's own vocabulary, whether a
   `denial` may cause a `revocation`.
2. Record the decision where a reader of this method actually looks — the
   `subscribe` docstring, the `AuthorizeResult` docstring, and
   `docs/realtime.md`.
3. Make the behaviour **asserted**, not merely written, so the next refactor
   cannot flip it silently.
4. Name the residue this decision leaves open, so it is tracked rather than
   forgotten.

## 3. Non-goals

- Changing `Authorizer` / `AuthorizeResult`'s signature or return type (out of
  scope per the issue).
- Touching `evict` / `markRevoked` / `listRevoked` / `onRevocationReconcile`.
- Adding continuous or per-message authorization.
- Adding a per-channel, cross-process, durable revoke (see §7 — residue).

---

## 4. Decision

> **`authorize` gates admission. It never revokes. `subscribe` is a join verb:
> it adds, or it does nothing — it never removes.**

That is option **(b)**, but stated as a positive rule of the model rather than
as "we chose not to do the other thing". A denial on a channel the connection
already holds refuses **that subscribe attempt** and leaves the standing
subscription exactly as it was. Revocation stays what it already is: an explicit
server-side verb (`unsubscribe`, `disconnect`, `evict`), and for a real revoke,
`evict` — which is durable and cross-process.

### 4.1 Why this is the cleaner design, in the bounded context's vocabulary

**It removes a concept instead of adding one.** Under this rule the model has
exactly two operations on membership — _admission_ (`subscribe`, gated by
`authorize`) and _revocation_ (`unsubscribe` / `disconnect` / `evict`, durable
via `markRevoked`) — and one predicate that only ever answers a question about
an _attempt_. Option (a) would introduce a third thing that is neither: an
**implicit revocation**, triggered by application code that was asked a
question, on a code path named after the opposite operation. `denial` and
`revocation` are already two distinct words in the issue's own Domain Model
block; (a) collapses them and needs a new sentence to explain when one becomes
the other.

**It keeps one revocation path, and it is the strong one.** Revocation in this
package is durable by design: `evict` writes `markRevoked` **first**, precisely
so a lost control frame is recovered by `onRevocationReconcile`
(`manager.ts:1302-1314`, `driver.ts:174-220`). A denial-driven revocation would
write no marker, publish no `evict`, and survive no reconnect. That is a
**second, weaker revocation path sitting beside a durable one** — and the weaker
one would be the one that fires implicitly, without the application asking for
it. Two paths with different durability guarantees for one domain concept is the
smell; this decision refuses to grow it.

**It refuses to enforce an invariant at instants the adversary chooses.** The
issue asks whether "only authorized connections exist in private/presence
subscriptions" must hold _continuously_. Today it holds **at admission**, and
that is a bounded, statable guarantee. Option (a) would make it hold at
admission **plus whenever the client volunteers a subscribe frame** — which is
not a continuous invariant, it is a sampled one whose sampling schedule belongs
to the party being policed. An attacker with revoked access simply never
re-subscribes and is unaffected; a well-behaved client that re-subscribes after
a network blip is the only population it reaches. **A half-invariant is worse
than a clearly-bounded one**, because it reads like the whole thing and gets
relied on as such.

**The verb keeps its promise.** `subscribe` may currently throw
(`ConnectionIdError`, `ChannelNameError`, `ChannelLimitError`), return
`{ ok: false }`, join, or — since #327 — perform a pure roster read. Every one
of those either adds membership or leaves it untouched. Under (a) the same call,
with the same arguments, would sometimes _destroy_ membership, and which one it
does is decided by application code the manager does not control. A caller can
no longer reason about the method from its name.

### 4.2 What was rejected, and what it really costs — option (a), revoke on denial

Stated at its strongest: _we hold an invariant that only authorized connections
sit in a private/presence subscription set. We have just received fresh
first-hand evidence from the authority itself that this connection is no longer
authorized for this channel. Discarding that evidence and continuing to deliver
is failing open on a security control, and the framework has all the machinery
to act (`unsubscribe` already removes the member, removes the roster entry and
announces `left` cross-instance)._ That argument is real. Here is what taking it
costs.

1. **It silently redefines `false` for every deployed authorizer, with no
   migration path and no compile error.** `false` today means "refuse this
   attempt". The docstring itself sanctions authorizers that are rate-limit
   increments — so a `false` meaning "not this fast" would, under (a), remove a
   member from a room they legitimately hold. So would a `false` meaning "the DB
   blipped and I could not confirm". The authorizer contract is **out of scope
   for this issue**, so there is no way here to add the distinction between "no"
   and "no, and remove them" — (a) would ship the collapse without the
   vocabulary to undo it. This is the single largest cost: the semantics of
   application code already in production change underneath it.
2. **It adds a third check-then-act pair across a suspension, in the one method
   whose history is exactly that bug — twice.** `#checkChannelCaps` →
   `#joinLocal` is one pair (#323); `members.has` → `members.set` is the second
   (#327). Both are documented as needing to complete in a single synchronous
   turn, because `onMessage` dispatches as `void guard(...)` and frames
   pipeline. A revoke-on- denial branch necessarily sits **after**
   `await this.authorize(...)`, so K pipelined denied frames each read "is a
   member" and each run the full removal: K× `#leaveLocal`, K× roster
   `removeMember`, K× `presence-leave` control publish, K× local `left` fan-out
   — for one member leaving once. The package's own AGENTS.md records that every
   sequential test still passes in exactly this shape and only a pipelined
   witness dies.
3. **It hands a client a wire-triggered write path.** Today a denied frame costs
   the authorizer call and nothing else. Under (a) a denied frame becomes a
   roster round-trip, a control-plane publish, a local fan-out, and — when the
   member was the last local subscriber — a `unwatchChannel` broker round-trip.
   The amplification is bounded at one per membership (the second denial finds
   nothing to remove), so this is smaller than #327's, but it is the same
   category: work on an inbound frame, metered by no cap.
4. **It buys close to nothing against the threat it names.** The revocation only
   fires if the revoked party sends a subscribe frame. Anyone who wants to keep
   listening simply does not. The connections it does reach are the honest ones.
5. **It would still not be a revocation.** No `markRevoked`, so a reconnect
   re-runs `authorize` and is refused at admission — correct, but by the
   admission gate, not by anything (a) did. (a) contributes nothing that
   survives the socket.

The honest summary of (a): it converts a transient authorizer failure into
membership loss for well-behaved clients, in exchange for enforcement against
adversaries who can opt out of it by doing nothing.

### 4.3 Third shapes considered and rejected

- **A `onAuthorizationDenied` hook** so the application can decide to `evict`.
  Rejected: the application is _already_ inside its own `authorize` callback at
  that instant and knows the identity and the channel; the hook re-delivers
  information the caller just produced. It also fires on the same client-chosen
  schedule as (a), so it converts a silent no-op into an observable no-op
  without changing who is reached. New public surface, no new capability.
- **Continuous / per-message re-authorization.** Rejected: it is the honest
  version of "the invariant holds continuously", and it costs one arbitrary
  application call (possibly a DB read) per subscriber per broadcast. It is
  already settled the other way by S6 and by `docs/realtime.md`, and #331 does
  not reopen it.
- **A `held: true` discriminator on the denied `SubscribeResult`, or a public
  `holds(clientId, channel)` query**, so a caller can tell "refused, and you
  still hold it" from "refused, and you hold nothing". This is the one genuinely
  missing _fact_ — there is no public way to ask it today. Rejected **for now**:
  it is published surface, forever, for a need no consumer has stated, and #327
  deliberately made a re-subscribe indistinguishable from a first join on the ok
  path. Recorded as residue (§7) rather than built speculatively.

---

## 5. Architecture / implementation shape

No structural change. No new module, no new export, no behaviour change. The
work is: say the rule where it is read, and pin it with a test.

| Where                                                        | What                                                                                                                                                                                                                                                                                     |
| :----------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/realtime/channel.ts` — `AuthorizeResult` docstring | One line: `false` refuses **this attempt**; it is not a revocation and never removes a standing membership.                                                                                                                                                                              |
| `packages/realtime/manager.ts` — `subscribe` docstring       | A short paragraph beside the existing #327 re-join paragraph: a denial on a channel the connection already holds refuses the frame and leaves the subscription, the roster entry and delivery intact; `evict` is the revocation verb. State the reason (§4.1) in one sentence, not five. |
| `docs/realtime.md` — §Revocation                             | Extend the existing paragraph (it already says authorization is point-in-time and eviction is the one revocation path) with the denied-re-subscribe case stated explicitly, and the transient-failure rationale in one line.                                                             |
| `packages/realtime/tests/authorize_denial_331.test.ts` (new) | The behaviour, asserted (see §6).                                                                                                                                                                                                                                                        |
| `packages/realtime/AGENTS.md`                                | One pitfall row: `subscribe` never removes; a denial is not a revocation; the tempting "we have fresh evidence, act on it" edit is the one that was rejected, and why.                                                                                                                   |

**Ordering interaction with #327 — verified.** `authorize` runs at
`manager.ts:759-762`, _before_ the `members.has(connection.id)` re-join guard at
`manager.ts:819`. So a denial on a held presence channel is reached today, and
returns `{ ok: false }` before the guard's roster read. That ordering is **kept
as-is**: it is what makes an unauthorized caller denied on its own terms without
learning anything about the room (the same principle as `#checkChannelCaps`
sitting after authorization, `manager.ts:772-779`). Note the consequence
explicitly in the docstring: a denied re-subscribe returns `{ ok: false }` and
**not** the roster, so the caller is not told what it still has.

**Consumer impact: none.** No API change, no wire change, no behaviour change.
An application that wants revocation calls `evict(clientId)` — which is what the
docs already tell it to do.

**Dependency-graph impact: none.** `@lockness/realtime` keeps `contract`,
`hono`, `redis` static + soft `events`. No new edge; `deps:analyze` unaffected.

---

## 6. Validation criteria

The test must be able to fail if someone later implements (a) — a "nothing
happened" assertion that is not falsifiable is worse than none. Over the memory
driver with a `ControllableDriver`-style fake (cf.
`tests/deliver_local_reauth.test.ts`), with an authorizer that approves then
flips to denying:

1. **Private channel.** Subscribe (ok) → flip → re-subscribe returns
   `{ ok: false }` → push a broadcast on the bus → **the connection still
   receives it**. (Fails immediately if a denial revokes.)
2. **Presence channel.** Subscribe (ok) → flip → re-subscribe returns
   `{ ok: false }` → the roster still lists the member, and **no `left` frame
   was emitted** to any local subscriber, and **no `presence-leave` control was
   published**.
3. **The denial is not a wire operation.** No driver command / control publish
   results from the denied frame (assert on the driver's recorded calls).
4. **`evict` still works after a denial** — the documented path is unaffected.

Plus the package gate: `deno test -A packages/realtime/`, then
`deno fmt && deno lint && deno check && deno task test`,
`deno task deps:analyze`, `deno task agents:brief`.

A mutation battery is **not** required here: the mutant that matters is an
_addition_ (grow a revoke branch), not a flip of an existing operator, and
assertions 1–3 are each individually killed by it.

---

## 7. What this does NOT solve — stated, not skipped

1. **A revoked user who never re-subscribes keeps receiving until eviction.**
   This is the larger exposure and it is unchanged. It is the direct consequence
   of point-in-time authorization, it is already documented, and the framework's
   answer is `evict`. This decision does not reduce that window by one
   millisecond — it declines to pretend otherwise.
2. **There is no per-channel, cross-process, durable revoke.** `evict` is
   per-connection and hard-closes the socket, which also drops the connection's
   other, still-authorized channels. `unsubscribe(clientId, channel)` is the
   per-channel verb, but `#leaveLocal` returns early when the id is not in this
   instance's set (`manager.ts:1093-1095`) and the presence block is skipped, so
   **calling it on a non-owning instance silently removes nothing** — no error,
   no warning. An application on a multi-instance deployment that wants "drop
   this user from this one room, everywhere" has no supported call. **This is a
   real gap and it deserves its own issue** (out of scope for #331, which
   excludes the eviction machinery). Suggested title: _"Realtime: no
   cross-process per-channel revoke — `unsubscribe` is silently a no-op on a
   non-owning instance"_.
3. **A caller cannot tell "refused, and you still hold it" from "refused, and
   you hold nothing."** No public query exposes membership. Deliberately not
   built (§4.3); file it if a consumer asks.
4. **Nothing here makes an application's `false` distinguishable between "deny"
   and "could not check".** That needs the `AuthorizeResult` shape, which this
   issue puts out of scope.

---

## 8. ADR? — No.

`docs/adr/` holds two entries, both framework-wide and both about the shape of
the whole repository (dependency integrity; distribution model). This is a
package-scoped decision about one method's contract. The repo's working
convention for exactly this class of decision is the **docstring at the site**
plus `docs/realtime.md` — that is where #314, #323 and #327 all live, and it is
demonstrably being read (this issue was found by someone reading #327's
neighbourhood). A third ADR at a different granularity would dilute the series
and put the rule where nobody editing `subscribe` will see it.

Prose for the issue comment is in the hand-off, not duplicated here.

---

## 9. Pre-requisites & blockers

None. #327 is merged (`8dc3504f`) and this builds on its ordering without
changing it.

## 10. Risks

| Risk                                                                                     | Mitigation                                                                                                                                     |
| :--------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| A reader takes "documented non-revocation" as "the framework is lax about revocation".   | The docs sentence leads with the verb that _does_ revoke (`evict`) and links it, rather than leading with what does not happen.                |
| The docstring paragraph grows into a fifth essay in an already dense method.             | Cap it: the rule, the reason, the pointer to `evict`. The long form lives in this doc and the issue.                                           |
| Someone later implements (a) believing it a security improvement.                        | The AGENTS.md pitfall row names it as tried-and-rejected with the cost, and the §6 tests fail on it — a red suite, not a code-review argument. |
| The residue in §7.2 is never filed and the silent `unsubscribe` no-op bites an operator. | The developer files it as part of this work; it is listed in the hand-off.                                                                     |
