# Plan: presence-join compensation when the authoritative roster write fails

| | |
| :--- | :--- |
| **Backlog item** | [#323](https://github.com/locknessland/lockness-monorepo/issues/323) — *Realtime: a presence join is not compensated when the driver roster write fails* |
| **Branch** | `255-presence-join-compensation` |
| **Bounded context** | `realtime` |
| **Kind** | bug — correctness of a locally-visible effect against an authoritative write |

---

## 1. Why this exists

`ChannelManager.subscribe` commits the **locally visible** half of a presence
join before the **authoritative** half, and nothing compensates when the
authoritative half fails:

```ts
this.emitPresence(channel, { action: 'joined', member })  // 1. subscribers told
await this.#joinLocal(channel, connection.id)             // 2. local set grown
members.set(connection.id, member)                        // 3. local map written
if (this.roster) await this.roster.addMember(channel, member)  // 4. MAY REJECT
```

A rejection at step 4 propagates out of `subscribe`, so the caller sees a failed
join — but steps 1–3 already happened. Every local subscriber holds a `joined`
frame for a member the authoritative roster has no record of, and this instance
counts that member in `presence`.

**Measured blast radius: 1 call site.** `roster.addMember` is invoked from
exactly one place (`packages/realtime/manager.ts:759`), reachable on every
`presence-*` subscribe whenever the driver exposes a roster.

### 🔴 The issue's stated healing mechanism does not exist

#323 says the split "heals … when the ghost-member sweep runs". **It does not,
and this is the finding that decides the disposition.**

The sweep is *instance-scoped*: `RosterEntry` carries `owner: this.instanceId`
(`packages/realtime/drivers/redis.ts:1322`), and `#reconcile` removes roster
entries whose owning instance's liveness key has expired
(`drivers/redis.ts:824`). It removes **entries that exist and are orphaned**.

In this failure the roster entry was **never written**. There is nothing for the
sweep to find, and it would not be the wrong owner if there were. The split
therefore persists until the member leaves — indefinitely, for a long-lived
socket.

Recorded per the constitution's *"a disproven assessment is corrected, not
erased"*: #323's option 2 rests on a premise this plan disproves, and the issue
body is updated with the evidence rather than silently re-decided.

---

## 2. User scenarios

### US1 — a failed presence join leaves no trace (P1)

**Given** a presence channel on a driver whose roster is unavailable (a broker
blip, a `NOPERM`, a timeout),
**When** a client subscribes and the authoritative roster write rejects,
**Then** the subscribe fails **and** no local subscriber ever received a
`joined` frame for that member, and this instance's `presence` map holds no
entry for it.

### US2 — a failed join can be retried cleanly (P1)

**Given** a presence join that just failed on the roster write,
**When** the same connection retries the same channel after the broker recovers,
**Then** the join succeeds and produces exactly one member — no duplicate, no
stale local subscription, no second `joined` frame for the first attempt.

### US3 — a lost announcement is not a lost roster (P2)

**Given** a presence join whose roster write succeeded,
**When** the `presence-join` control publish then fails,
**Then** the authoritative roster keeps the member and every instance reading
the roster is correct; only the cross-instance *announcement* is lost, and that
is stated as the contract rather than compensated.

### Edge cases

- **The driver has no roster** (`presenceRoster(driver)` → `undefined`,
  single-process). No authoritative write exists; the local view *is* the
  roster. Behaviour must be unchanged.
- **The newcomer is the first subscriber.** `emitPresence` returns early on an
  absent set, so nothing was announced; the rollback must still be correct and
  must not create the set.
- **`#joinLocal` triggered a `watchChannel`.** A 0→1 transition took a broker
  subscription; undoing the join must release it, or the instance hosts a
  channel with no members.
- **The rollback itself fails.** It touches in-memory state plus one optional
  `unwatchChannel`; the plan must say what happens when that op rejects.
- **A second connection is already in the channel.** The rollback must not
  unwatch a channel that still has members.

---

## 3. Requirements

- **FR-001** — No locally visible effect of a presence join occurs before the
  authoritative roster write has succeeded. "Locally visible" means: a frame
  sent to any subscriber, an entry in `presence`, or a membership in
  `subscriptions`.
- **FR-002** — When `roster.addMember` rejects, `subscribe` propagates the
  rejection and the instance is left in the state it held before the call:
  no `joined` frame emitted, no `presence` entry, no `subscriptions` membership,
  no broker subscription taken *for this join*.
- **FR-003** — A failed join leaves no residue: the same `(channel, connection)`
  pair can be retried and produces exactly one member.
- **FR-004** — A driver with **no roster capability** (`presenceRoster(driver)`
  → `undefined`) is behaviourally unchanged, including frame order.
  **`MemoryBroadcastDriver` is NOT that driver** — it implements the full roster
  surface (`drivers/memory.ts:59`), so the default single-process deployment
  takes this change in full and must be tested as such.
- **FR-008** — `addMember` is **one atomic operation** at the driver. The Redis
  adapter's `HSET` + `SADD` are two writes encoding one fact and can be made to
  disagree; they become a single `EVAL`, following `markRevoked`'s precedent
  (`drivers/redis.ts:1394-1401`).
- **FR-009** — A frame fan-out survives one unusable socket: a throwing `send`
  removes that connection from the fan-out, never aborts it for the others.
- **FR-005** — The `presence-join` control publish keeps its current position
  (after the roster write). A **transient** failure loses the announcement, never
  the roster. This contract covers transient failure ONLY — the deterministic,
  user-steerable oversize path is a defect, filed separately, not a contract.
- **FR-006** — Every step between the authoritative write and the end of
  `subscribe` that can **reject OR silently degrade** is either impossible to
  fail, or its disposition is named at the call site. "Silently degrade" is in
  the requirement because the oversize control publish warns and returns rather
  than rejecting — an audit that asks only "can it reject?" walks straight past
  the one step a user can steer.
- **FR-007** — The presence contract — what a `joined` frame promises about the
  authoritative roster — is stated in `docs/realtime.md` and
  `packages/realtime/README.md`.

---

## 4. Success criteria

- **SC-001** — A rejecting `addMember` produces zero `joined` frames at every
  subscriber of the channel, measured on what the connections' `send` received,
  not on `subscribe`'s return.
- **SC-002** — After a rejecting `addMember`, `rosterSnapshot` on this instance
  and on any other instance agree: the member is absent from both.
- **SC-003** — Retrying a join after a failure yields exactly one member in the
  authoritative roster and exactly one `joined` frame in total.
- **SC-004** — A join that took a 0→1 channel transition and then failed leaves
  the instance hosting zero channels.
- **SC-005** — With no roster capability, the frame sequence for a join is
  byte-identical to today's.
- **SC-006** — A reader of the presence docs can state, without reading code,
  **both** that a `joined` frame from the joining instance follows a successful
  roster write, **and** that presence is an announcement channel, never an
  authorization source.
- **SC-007** — K concurrent presence subscribes against a cap with one slot
  remaining admit exactly one. Driven with a roster double whose `addMember`
  resolves on a **later microtask turn** — an immediately-resolving stub
  reproduces today's single-turn behaviour and the criterion passes vacuously.
- **SC-008** — A partial authoritative write is not constructible: the roster
  hash entry and its owned-set entry are created by one operation or neither.

---

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **When a presence join becomes VISIBLE** — no frame announces a member before the authoritative write succeeds | `packages/realtime/manager.ts` — the position of the `emitPresence` call inside `subscribe`'s presence branch | A second emit site for `joined`; an `announced` boolean; any caller deciding "is it safe to emit yet" |
| **Who is excluded from a join's own announcement** | `packages/realtime/manager.ts` — `emitPresence`'s `except` parameter | The old implicit answer — *emit before `#joinLocal` so the set cannot contain the newcomer* — left in place as well, giving one rule an ordering home AND a parameter home |
| **What "no residue" means for a failed join** | `packages/realtime/manager.ts` — `#leaveLocal`, the sole owner of "remove from the set, unwatch on 1→0", plus the `presence` map delete beside it | A bespoke undo that deletes from `subscriptions` directly; a second unwatch call site |
| **That the cap decision and the writes it bounds happen in ONE synchronous turn** | `packages/realtime/manager.ts` — the unbroken statement run `#checkChannelCaps` → `#joinLocal`, whose docstring already states it | Any `await` inserted between them; a cap re-check after the authoritative write, which makes two deciders |
| **That the authoritative roster write is ONE fact** | `packages/realtime/drivers/redis.ts` — a single `EVAL`, following `markRevoked`'s precedent | The current `HSET`-then-`SADD` pair; a reconciliation pass added to clean up after them |
| **Whether the driver owns an authoritative roster** | `packages/realtime/manager.ts` — `presenceRoster(driver)`, resolved once into `this.roster` | A fresh `'addMember' in driver` test inside the new ordering |
| **What a failure AFTER the authoritative write costs** (FR-006) | `packages/realtime/manager.ts` — the `subscribe` call site, one named disposition per step | A blanket `try/catch` around the tail that treats three different failures as one |
| **What a `joined` frame promises — and what it does NOT** | `docs/realtime.md`, presence section | A second, differently-worded promise in `packages/realtime/README.md` — the README **links**, it does not restate |

**Row 1 is narrowed on purpose.** Its first wording banned compensation
outright. Both audits showed that too strong: the steps that survive the
authoritative write need dispositions, and a cap reservation needs a release.
What the rule actually protects is that **the announcement** is never
compensated — a retracted `joined` is the observable artefact this plan exists
to avoid.

**Binding.** A decision may not move out of its home without this plan being
amended. Two homes for one rule is a plan violation, not a style opinion.

---

## 6. Technical context

- **Language / runtime** — TypeScript on Deno, TC39 Stage 3 decorators.
- **Package** — `@lockness/realtime`, with `@lockness/redis` as the driver that
  owns a real roster.
- **Storage** — the authoritative roster is a Redis hash per presence channel,
  keyed by member id, each entry carrying its owning-instance id.
- **Testing** — `Deno.test`, hermetic doubles in `packages/realtime/tests/`;
  the live-broker battery is opt-in behind `LOCKNESS_REDIS_INTEGRATION`.
- **Scale** — the reordering adds no round-trip: the same one `addMember` call
  runs, at a different point in the statement sequence.

### Domain model

- **Bounded context** — `realtime`.
- **Vocabulary** — *Presence join*, *Local view*, *Authoritative roster*,
  *Split view*, *Compensation*, as defined in #323. Added here:
  **Locally visible effect** — a frame sent, or a mutation any later read of
  this instance can observe.
- **Entities** — `ChannelManager` [aggregate root], sole writer of both the
  local view and the authoritative roster. `PresenceCapableDriver` — the port
  holding the authoritative roster.
- **Value objects** — `PresenceMember(id, info)`, `Channel(name)`.
- **Invariants**
  - A member announced as `joined` **by the instance it joined on** is in the
    authoritative roster. On every OTHER instance the frame is re-emitted from
    the control message (`manager.ts:1268-1277`) without a roster read, so there
    the frame attests an announcement, not a roster state. **Verified against
    the code, not assumed** — this is the scoped form; the unscoped one was
    false.
  - The local `presence` map is a cache of the authoritative roster, never a
    second source of truth.
  - A failed join leaves no residue.
- **Out of scope** — the `redis` broker's durability and key layout (#276/#278);
  the `auth` context (authorization runs before this branch and is unaffected).

---

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| No direct `hono` import | ✅ N/A — no HTTP surface touched |
| JSR-only specifiers | ✅ no new dependency |
| No `any` in exported APIs | ✅ no signature change |
| Tailwind v4 syntax | ✅ N/A — no view |
| Pre-completion gate | ✅ enforced before done |
| Never edit `deno.lock` | ✅ untouched |
| JSDoc on public APIs | ⚠️ `subscribe`'s docblock must state the new ordering guarantee — the reordering IS the contract |
| MVC layering | ✅ N/A — infrastructure service |
| Commit discipline | ✅ `fix` + `test` + `docs` split |
| TDD non-negotiable | ✅ the rejecting-driver test is written first and proven to fail |
| DDD layering | ✅ the port (`PresenceCapableDriver`) is unchanged; only the aggregate's statement order moves |
| No silent catches | 🔒 **binding here** — any rollback `catch` logs at WARN with the channel and the underlying error |
| Domain Model block | ✅ §6 |

### Complexity tracking

None. The change removes a state (the compensable window) rather than adding one.

---

## 8. Surface impact

| Surface | Impact |
| :--- | :--- |
| `ChannelManager.subscribe` | **Behaviour change, no signature change.** A failed presence join now emits nothing instead of emitting a `joined`. |
| Wire protocol | None — no new frame kind, no field. |
| `PresenceCapableDriver` port | None. |
| Public exports (`mod.ts`) | None. |
| CLI / config | None. |

**Interface contract exposed**, in the scoped form the code supports:

> A `joined` frame emitted by the instance the member joined on follows a
> successful authoritative roster write. A `joined` frame emitted from a control
> frame on any other instance reflects an **announcement**, not a roster read.
> **Presence is an announcement channel, not an authorization source**: an
> application must re-authorize an action rather than infer permission from a
> presence frame or a roster snapshot.

The earlier draft claimed "no application can break on a promise becoming
stronger". That is true for liveness and **false for security** — a stronger
promise is exactly what makes an application stop re-checking, and a guarantee
that has been relied on cannot be retracted by a patch. Hence the negative
clause, which costs a paragraph now and is unpayable later.

### Documentation (this feature)

| File | What it owes |
| :--- | :--- |
| `docs/realtime.md` | The presence section states the join ordering and what a `joined` guarantees; the sweep passage is corrected so it no longer implies it heals a missing entry |
| `packages/realtime/README.md` | Links to that contract in one line; does not restate it |
| `packages/realtime/AGENTS.md` | The pitfall list carries the ordering as a rule with its reason |
| `#323` body | The disproven "the sweep heals it" premise, with the evidence |

*(No front-end surface in this package — no Artifacts subsection, per the FE gate.)*

---

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| ~~The residual direction is sweepable because the entry carries this instance's owner id~~ — **FALSE, and withdrawn** | The sweep reads `SMEMBERS ownedKey(deadId)` (`drivers/redis.ts:1803`); sweepability comes from the `SADD`, not from `owner`, which no production code reads. A partial `addMember` (`HSET` ok, `SADD` failed) is therefore **unreclaimable**. FR-008 removes the partial state instead of relying on a sweep that cannot see it. |
| A cap breach after the authoritative write would cost a roster write plus a removal on every refused join | The cap check keeps its position **before** the roster write. Only `emitPresence` moves, so no expected-and-frequent outcome pays a broker round-trip. |
| `#assertUsableMemberId` currently runs before the roster write; reordering could move it after | It is asserted before **both** halves and stays there. #312's battery already fails if it moves — a live witness, not a comment. |
| A rollback path is added *as well as* the reordering, giving the rule two homes | §5 row 1 forbids it explicitly; the review greps for a compensation block. |
| The `left`-after-`joined` visible artefact that option 1 would have caused | Avoided entirely: nothing is announced before the write, so there is nothing to retract. |
| Frame ordering for the single-process path changes silently | SC-005 pins it; the no-roster path skips the authoritative step and keeps today's sequence. |

---

## 10. Architecture audit

*`architect-expert`, dispatched on this plan before any code existed.*
**Verdict: FAIL** — 1 critical, 3 high, 3 medium, 2 low. Backlog read first:
`domain:realtime` has exactly one open item (#323 itself), so no `confirms #N`
deduplication applied.

**Three findings were re-verified by hand before being accepted**, because each
overturns something this plan asserted.

| # | Finding | Disposition |
| :-- | :--- | :--- |
| **C1** | `addMember` is **two** Redis commands (`HSET` then `SADD`, `drivers/redis.ts:1324-1334`) with no `MULTI` and no script. A failed `SADD` leaves a hash entry in **no** owned set, and `#sweepInstance` reads only `SMEMBERS ownedKey` (`redis.ts:1803`) — so it is unreclaimable forever. Today that phantom is healed **by accident**, because `presence.set` runs *before* the throwing `addMember`, so `disconnect` → `unsubscribe` issues the `removeMember`. The first draft of this plan deleted that accident. | **Plan changed — FR-008.** Verified by hand at `redis.ts:1320-1335`. The adapter makes the write one `EVAL`, following the precedent `markRevoked` already set for exactly this shape (`redis.ts:1394-1401`: *"not a marker key plus a separate index entry, which were two structures encoding one fact and could be made to disagree"*). Without it the reorder is a net regression. |
| **H1** | The reorder inserts an awaited broker round-trip between `#checkChannelCaps` and the counter writes inside `#joinLocal`, breaking the same-synchronous-turn pairing that `#joinLocal`'s own docstring (`manager.ts:844-849`) was written to protect. | **Plan changed — the architecture is different now.** Verified by hand. Only `emitPresence` moves; the cap check and `#joinLocal` stay adjacent. See the revised order below. |
| **H2** | FR-006 had **no decision-table row**, and three steps still reject after the authoritative write (`connection.send`, `publishControl`, `rosterSnapshot`), so the window moved rather than closed. FR-006 was unsatisfiable without a compensation §5 row 1 forbade. | **Plan changed.** §5 gains the FR-006 row; row 1 is narrowed to ban compensating **the announcement**, which is the rule it meant. |
| **H3** | The ordering home is unbindable by the witness §5 pointed at: `roster_control_atomicity.test.ts`'s log records **driver ops only** and its double's `send` is `() => {}`, so it structurally cannot observe emit-vs-write. | **Plan changed.** The recording driver's `send` pushes into the same log, and a mutant that swaps the statements back must be proven to die. A home with no witness is a comment. |
| **M1** | `MemoryBroadcastDriver` **implements the roster** (`drivers/memory.ts:59`), so the default single-process deployment takes this change in full. FR-004 protected almost nothing. | **Plan changed.** Verified by hand. FR-004 restated as "a driver with no roster capability"; the memory driver is named as being on the changed path. |
| **M2** | §5's `#leaveLocal` row was dead — the chosen disposition never called it. | **Plan changed.** The revised design *does* compensate the internal state on an `addMember` failure, so the row is live again. |
| **M3** | "Blast radius: 1 call site" counted `addMember` call sites, not the reorder's neighbourhood. Real count: **10** production statements, **8** driver `addMember` implementations, **47** presence-subscribe test call sites across 15 files, **12** order-dependent assertions, **1** mutation anchor (`presence_member_306.ts:81`), **5** doc passages. | **Accepted, plan corrected.** The mutation anchor is the one that bites silently: `AGENTS.md:308` says the full sweep is nightly, so the pre-completion gate will not catch it. |
| **L1/L2** | FR-001's enumeration omits `connections`; the plan overstated its correction of #323 (the issue *had* already flagged the leave clause as inert). | **Accepted.** #323's update credits the parenthetical instead of implying both clauses were wrong. |

---

## 11. Security audit

*`security-expert`, dispatched in the same message as the architecture audit.*
**Verdict: FAIL** — 0 critical, 1 high, 4 medium, 1 low.

**What it cleared, explicitly.** The reorder is confined below `manager.ts:740`;
the authorizer, `#assertUsableMemberId` and `#checkChannelCaps` all sit above it
and cannot move. No IDOR, no cross-member write, no impersonation primitive:
`member` is the app's `authorize()` return, defaulting to a server-minted UUID
the client never chooses. And the reorder **removes an existing information
leak** — today a *failed* join has already fanned the member's id and `info` to
every subscriber, permanently and with no retraction.

| # | Finding | Disposition |
| :-- | :--- | :--- |
| **S-1 (HIGH)** | The same cap race as H1, reached from the other side: `onMessage` dispatches `void guard(...)` (`websocket.ts:204-207`), so a client's subscribe frames are **not serialized** and the race is won by pipelining. The overshoot is not merely memory — `manager.ts:29-32` states the cap bounds the post-outage revocation window, so exceeding it widens the period an evicted client stays reachable. | **Plan changed.** Verified by hand. Same fix as H1 — the cap check and the writes it bounds stay in one turn — plus **SC-007**, driven with a double whose `addMember` resolves on a later microtask turn (an immediate stub passes vacuously). |
| **S-2 (MED)** | §9's "this direction is sweepable" was false twice over: the sweep never reads the hash's `owner` field (nothing in production does), and `#reconcile` **skips its own instance** (`redis.ts:1785`), so a live instance never reclaims its own orphan. | **Plan changed.** §9 row rewritten; FR-008 removes the case rather than adding a second cleaner. Confirms C1 from the security side, independently. |
| **S-3 (MED)** | The strengthened invariant **does not hold cross-instance**: `handleControl` emits `joined` from the control frame without reading the roster (`manager.ts:1268-1277`) — i.e. for most subscribers in the deployment this feature exists for. And "no application can break on a promise becoming stronger" inverts the security argument. | **Plan changed.** Verified by hand. §6 and §8 now carry the scoped form plus an explicit *presence is not an authorization source* clause; SC-006 requires a reader to state the negative half too. |
| **S-4 (MED)** | `PresenceMember.info` is **size-unbounded**, and the oversize control publish *warns and returns* rather than rejecting (`redis.ts:1291-1308`) — a self-service presence-cloaking primitive in any app sourcing `info` from user-editable fields. FR-006 audits steps that "can reject", so it is structurally blind to a step that silently degrades. | **Partly accepted, partly deferred.** FR-005 is reworded to cover transient failure only and FR-006 to audit steps that "reject **or silently degrade**". The `info` bound itself is a distinct defect on a boundary this plan does not otherwise touch — **filed, not folded** (see §12 Q2). |
| **S-5 (LOW)** | Any WARN on this path must not carry `member`: `info` is arbitrary app PII and a raw driver error can carry a DSN. | **Accepted, binding.** Every WARN emits `safeForLog(channel)` + `renderError(error)` and nothing derived from `member`, following `#watch` (`manager.ts:927-932`). |
| **S-6 (MED)** | **Pre-existing:** a repeated subscribe to a channel the connection already holds is charged by neither cap (`manager.ts:802`, `:822-825`) and amplifies one frame into an N-way fan-out plus two broker round-trips. | **Filed, not folded** — the seat says so itself. The plan drops its "adds no round-trip" neutrality claim, which was true per call and silent about calls per second. |

---

## The revised architecture

Both audits killed *"move the authoritative write to the front"*. What survives
is narrower and better: **move only the visible effect, not the bookkeeping.**

```text
#checkChannelCaps          sync ─┐ one turn, uninterrupted: the cap
#joinLocal                 sync ─┘ decision and the counter it spends
presence.set               sync
roster.addMember           ← authoritative, now ATOMIC (FR-008)
emitPresence(joined, { except: connection.id })   ← FIRST visible effect
publishControl
rosterSnapshot
```

Three properties fall out, and none of them needed a compensation for the
announcement:

1. **Nothing is announced before the roster holds the member.** The only
   locally *visible* effect is the frame; `#joinLocal` and `presence.set` are
   bookkeeping no subscriber can observe.
2. **The cap stays exact.** Nothing awaited separates the check from the writes.
3. **A failed `addMember` compensates internal state only** — `#leaveLocal` plus
   the `presence` delete. **No `left` frame is needed, because no `joined` was
   sent**, which is precisely the objection that sank #323's option 1.

`emitPresence` gains an `except` parameter. That is not incidental: it turns
"the newcomer must not hear its own join" from a rule enforced by *statement
order* — invisible to every witness — into an argument a test can read.

---

## 12. Open questions

### Q1 — Does `addMember`'s atomicity belong in this branch? — **ANSWERED 2026-09-09: yes, here.**

The critical finding is a driver change, outside #323's stated scope. Settled in
this branch because the reordering **is a net regression without it**: it deletes
the accidental `disconnect`-time healing that today masks a partial write, so
shipping the two separately would take #323 through a state strictly worse than
the present one. FR-008 is therefore in scope, and the branch carries the `EVAL`.

Rejected: *file separately and block #323* (leaves the branch unshippable for no
gain, since the work is the same work) and *file separately and ship #323 anyway*
(the state the audit calls a net regression, with an unreclaimable phantom where
today's defect is bounded by the socket's lifetime).

### Q2 — Does the `PresenceMember.info` bound belong in this branch? — **ANSWERED 2026-09-09: no, filed separately.**

S-4 is a distinct defect on a boundary this plan does not otherwise touch, and
the constitution sends a MEDIUM to the backlog. **What stays here is the
wording**: FR-005 is reworded to cover transient failure only, and FR-006 to
audit steps that "reject **or silently degrade**" — because as first written they
blessed the cloaking path as contract, which is the part that would have
outlived the branch.

Accepted cost, stated: the cloaking primitive remains open until the filed issue
is worked.

### Decided without asking

- **The disposition is (4) reorder, not one of #323's three.** The issue offers
  rollback / keep-and-WARN / retry, all of which compensate *after* a visible
  effect. Making the authoritative write precede every visible effect removes
  the window instead of paying for it. Presented as a proposal with its
  alternatives at the stop — the user's veto is the point of that stop.
- **`presence-join` control publish keeps its position** (after the roster
  write). #312 already fixed and witnessed that order; reopening it here would
  give one decision two homes.
- **The single-process path is not "fixed"** — with no authoritative roster
  there is no second source of truth to disagree with, so there is nothing to
  order.
- **No retry policy.** A bounded retry needs a terminal disposition, which is
  the same question again; the caller already sees the rejection and can retry.
