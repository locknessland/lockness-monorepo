# Plan: cross-process per-channel revoke

**Feature:** `257-cross-process-channel-revoke` · **Branch:**
`257-cross-process-channel-revoke` · **Date:** 2026-09-09 **Backlog item:**
[#332 — Realtime: no cross-process per-channel revoke — unsubscribe is silently a no-op on a non-owning instance](https://github.com/locknessland/lockness-monorepo/issues/332)
**Design of record:**
`docs/superpowers/specs/2026-09-09-realtime-cross-process-channel-revoke-design.md`
(rev. 2, `architect-expert`, 2026-09-09)

> The architecture below was **decided by the `architect-expert` seat** under
> hard rule #11 and is recorded here, not re-opened. What this plan adds is the
> re-derivation of every claim against the code as it stands **after** #327,
> #329, #330 and #331 merged — the design doc's line citations predate all four
> — plus the one question that is genuinely the user's.

---

## 1. Why this exists

`ChannelManager` has **two tiers of verb and names neither.**

The **local tier** — `register`, `subscribe`, `unsubscribe`, `disconnect`,
`revokeLocal` — acts only on sockets *this* process owns. Every one of them
reads `connections` / `subscriptions` / `presence` / `#channelsByClient`, and
none of those ever holds another instance's connections: `handleControl`
re-emits presence frames and never writes `presence`
(`packages/realtime/manager.ts:1855`).

The **addressed tier** has exactly one member, `evict(clientId)`. It writes the
durable marker first, then either revokes locally or publishes an `evict`
control frame to the owner, and a reconcile pass recovers a frame the bus lost
(`packages/realtime/manager.ts:1652`).

`unsubscribe(clientId, channel)` sits in the local tier while **looking** like an
addressed one, because it takes a routable `clientId` where `subscribe` takes a
`Connection`. On a non-owning instance `#leaveLocal` returns at
`if (!set?.delete(clientId)) return` (`packages/realtime/manager.ts:1381`), the
presence block is gated on the member it did not find
(`packages/realtime/manager.ts:1528`), and the method resolves `Promise<void>`.
**Nothing removed, nothing announced, nothing reported.**

Two consequences measured in the current tree, not assumed:

1. **`disconnect(clientId)` carries the identical defect.** It iterates
   `[...this.#channelsByClient.get(clientId) ?? []]` — empty on a non-owner — and
   deletes two absent map entries in its `finally`
   (`packages/realtime/manager.ts:1566`). A fix that special-cases `unsubscribe`
   leaves the same trap one method over, in the verb whose name promises *more*.
2. **There is no supported call for "drop this connection from this one room,
   everywhere."** `evict` is per-connection and hard-closes with 4403
   (`packages/realtime/manager.ts:1713`), taking every other still-authorized
   channel with it — and the shipped `packages/realtime/client.ts` has **no
   reconnect logic at all** (verified: no `4403`, no `reconnect`), so "ban from
   one room" delivered by `evict` is, for a framework client, "logged out of
   realtime".

[#331 — Realtime: a denied re-subscribe does not revoke the standing subscription](https://github.com/locknessland/lockness-monorepo/issues/331)
named this gap as its own residue and filed #332 for it. This plan answers it
**consistently with #331**: a denial still never revokes, and revocation stays an
explicit server-side verb.

**Measured, not asserted.** Three of the four defect claims above were
re-derived against HEAD (`a6b68d3b`) rather than taken from the design doc, whose
line numbers all moved. The fourth — the client's missing reconnect — was
re-verified by grep.

---

## 2. User scenarios

### US1 — An operator bans a member from one room, fleet-wide (P1)

**Given** a connection held by instance B and subscribed to `presence-room` and
`private-orders`, **when** server code on instance A calls
`revokeChannel(id, 'presence-room')`, **then** B removes the member from
`presence-room`, the authoritative roster no longer lists it, a `left` reaches
presence subscribers on **both** instances, the socket **stays open**, and a
broadcast on `private-orders` still reaches that connection.

### US2 — Server code learns its leave went nowhere (P1)

**Given** server code holding a connection id, **when** it calls
`unsubscribe(id, channel)` on an instance that does not own that socket,
**then** the call resolves `'not-owned'` — distinguishable from `'left'` (it was
removed) and from `'not-subscribed'` (this instance owns it and it was not in
that channel) — **and** the driver records no command and no control publish for
that call. The same holds for `disconnect(id)`, which resolves
`'disconnected' | 'not-owned'`.

### US3 — The revoke survives a lost control frame (P2)

**Given** a `revokeChannel` whose control frame is refused or never delivered,
**when** the driver's next reconcile tick fires, **then** the owning instance
applies the channel leave; **and** when it fires again, nothing happens — the
record was cleared on apply — and the connection may legitimately re-subscribe
and stay.

### US4 — A rolling deploy meets the published 0.3.0 (P2)

**Given** a fleet mid-upgrade with both `0.3.0` and upgraded instances,
**when** channel-scoped records and the new control kind reach a `0.3.0` peer,
**then** the peer is **inert**: it skips the composite index member, admits and
ignores the unknown control kind, and never widens a channel revoke into a
socket kill. A revoke aimed at a socket a `0.3.0` instance owns **does not
land** — this is accepted and documented, with `evict` named as the mid-deploy
escape hatch.

### US5 — A third-party driver that predates the seam is refused loudly (P3)

**Given** a driver implementing the `0.3.0` revocation pair, **when** a
`ChannelManager` is constructed with it, **then** construction **throws**,
naming the migration — rather than silently losing `evict`'s durability. A
driver implementing neither pair (the memory driver) constructs fine.

### Edge cases

- `revokeChannel` on a connection this instance owns that is **not** in the
  channel → the durable record is written and the local apply reports
  `'not-subscribed'`; no `unsubscribed` frame is sent to the client.
- `revokeChannel` where the driver has a control plane but **no** revocation
  store → `RevocationScopeError`, and **nothing is published**.
- `revokeChannel` on a single-process driver (no control plane, no store) → a
  plain local leave plus the client notification; no durability is owed because
  there is no bus to lose a frame on. **If the target is not owned locally
  either**, it resolves `'not-owned'` (FR-022) — never a silent success, which
  is the defect this whole feature exists to remove.
- A durable record the driver cannot decode → **dropped** (FR-018). Never
  applied, and never widened to connection scope.
- `clearRevocation` fails after the leave was applied → warned, not re-thrown on
  the reconcile / control-frame paths (FR-019); the repeat apply is idempotent
  (FR-020).
- An id or channel outside `isValidName` → throws before anything is published,
  on `evict`'s precedent, for **both** arguments.
- A revoked client that immediately re-subscribes → **admitted**, if the
  application's `authorize` says so. The framework owns no deny list (§3, and
  #331's settled model).
- The durable write fails (broker unreachable) → the revocation is applied
  anyway and the error is re-thrown **after**, exactly as `evict` does. Never
  fail open.

---

## 3. Requirements

| Id | Requirement |
| :--- | :--- |
| **FR-001** | `unsubscribe(clientId, channel)` resolves `'left' \| 'not-subscribed' \| 'not-owned'` and continues never to throw for a misaddressed id. |
| **FR-002** | `disconnect(clientId)` resolves `'disconnected' \| 'not-owned'` and keeps its existing re-throw contract for a teardown failure. |
| **FR-003** | A new addressed verb `revokeChannel(clientId, channel)` removes a connection from **one** channel wherever its socket lives, and leaves the socket open. |
| **FR-004** | `revokeChannel` asserts **both** arguments against `isValidName` before anything is written or published. |
| **FR-005** | `revokeChannel` writes the durable record **first**; a durability failure is warned and re-thrown only **after** the revocation has been applied. |
| **FR-006** | The owning instance applies the revoke by calling the existing leave path — roster removal, local `left`, cross-instance `presence-leave`. **No new announcement machinery.** |
| **FR-007** | When the leave actually removed a membership, the revoked client receives `{ type: 'unsubscribed', channel }` exactly once. A **client-initiated** `unsubscribe` still sends nothing. |
| **FR-008** | The durable record is **cleared on apply**, so it means exactly "a revocation the owning instance has not applied yet". |
| **FR-009** | The driver seam carries the domain fact — a `Revocation` record — and the driver alone chooses its bytes. |
| **FR-010** | The three revocation members are detected **as a set**, once, at construction, by a `revocationStore(driver)` probe; never member-by-member at a call site. |
| **FR-011** | A driver presenting the `0.3.0` revocation pair and not the new members **throws at construction**, naming the migration. |
| **FR-012** | `revokeChannel` throws `RevocationScopeError` — exported, `ConnectionIdError`-shaped — when the driver has a control plane but no revocation store, and publishes nothing. |
| **FR-013** | A channel-scoped durable record is **structurally undecodable** as a connection id by any reader, old or new. |
| **FR-014** | The new control kind adds **no new wire field**, so the MAC canonicalisation is byte-identical and a `0.3.0` peer verifies and then ignores it. |
| **FR-015** | The two tiers are stated where they are read: the two docstrings, `docs/realtime.md`, `packages/realtime/AGENTS.md`. |
| **FR-016** | `docs/realtime.md`'s Upgrading section describes the migration from the **published** `0.3.0`, naming it explicitly. |
| **FR-017** | The stale clause in `unsubscribe`'s comment — `disconnect` "iterates `subscriptions.keys()`" (`packages/realtime/manager.ts:1521`) — is corrected; it has iterated `#channelsByClient` since the fix documented 46 lines below it (`:1567`). |
| **FR-018** | `listRevocations` re-validates **every decoded component** against `isValidName` and **drops** any member it cannot fully decode. A decode failure never degrades to connection scope: a record that does not yield a valid `target`, and a record whose delimiter is present but whose channel half is invalid, are both discarded — never widened. _(security audit F1)_ |
| **FR-019** | A `clearRevocation` failure is warned and **not** re-thrown on the control-frame and reconcile apply paths, where no caller exists to receive it; it is re-thrown only on `revokeChannel`'s own local-apply path, after the revocation has been applied, on FR-005's sequencing. _(security audit F3)_ |
| **FR-020** | Re-applying a channel-scoped record is **idempotent**: a second apply resolves `'not-subscribed'` and sends no second `unsubscribed` frame. _(security audit F3)_ |
| **FR-021** | Every log line this feature adds encodes `clientId` and `channel` through `safeForLog` and any error through `renderError`, on `evict`'s precedent (`packages/realtime/manager.ts:1667`). Never `console.warn(msg, error)`. _(security audit F4)_ |
| **FR-022** | `revokeChannel` reports its outcome — `Promise<'revoked' \| 'not-subscribed' \| 'not-owned'>` — so it cannot resolve successfully having revoked nothing on a driver with no control plane. _(security audit F2)_ |
| **FR-023** | `unsubscribe`'s and `disconnect`'s outcomes are documented as **server-side** values: never relayed to a client, and `clientId` never taken from a client frame. _(security audit F5)_ |
| **FR-024** | `#leaveLocal` reports whether it removed a membership, from its **one** membership predicate (`set?.delete(clientId)`, `manager.ts:1382`) — **not** from the end of the method, which is reached only on the 1→0 path. A leave from a channel that still holds other members reports `'left'`. _(architecture audit M6)_ |
| **FR-026** | `docs/realtime.md` records **once**, in its Upgrading section, that third-party realtime drivers are not a supported extension point before 1.0 and that the built-in drivers are the contract — so the next seam change does not re-argue it. _(user decision, 2026-09-09)_ |
| **FR-025** | Both mutation batteries whose anchors this change moves are **repaired, not deleted**: `tests/mutations/channel_name_314.ts` (row 4 anchors on `unsubscribe`'s signature line, which FR-001 rewrites) and `tests/mutations/connection_id_304.ts` (the reconcile-filter row anchors on `if (id && isValidName(id)) live.add(id)`, which FR-009/FR-018 replace). The repaired `connection_id_304` anchor guards **both halves** of the composite, and carries its existing reason forward verbatim. _(architecture audit H1)_ |

---

## 4. Success criteria

| Id | Criterion |
| :--- | :--- |
| **SC-001** | An operator can remove one member from one room across every instance without ending that member's session in any other room. |
| **SC-002** | Server code can tell "removed", "not in that room" and "wrong process" apart from the return value alone, with no logging and no seam registration — **on every id-addressed verb, `revokeChannel` included**. No revocation verb resolves successfully having revoked nothing. |
| **SC-003** | A revocation issued while the control bus drops the frame still takes effect within one reconcile interval, and takes effect **once**. |
| **SC-004** | A fleet running both the published version and the new one never converts a room-scoped revocation into a session kill, in either direction. |
| **SC-005** | An integrator whose driver predates the seam learns at construction, with the migration named — never from a revocation that reported success and did nothing. |
| **SC-006** | A revoked client is told it left the room, rather than discovering it from silence. |
| **SC-007** | A durable record written by anything other than this framework can, at worst, remove a connection from a room it names — it can never be made to end that connection's whole session. |
| **SC-008** | The common case is the one that is pinned: **two members in one room, one leaves** → the leaver reports `'left'` and the other member's membership is untouched. Every existing fixture is single-member, so a leave-report taken from the wrong place would pass the whole suite. |

---

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **What a local leave verb reports** — `'left'` / `'not-subscribed'` / `'not-owned'` | `packages/realtime/manager.ts` — `unsubscribe`'s return, derived from `connections.has` plus `#leaveLocal`'s **one** membership predicate, `set?.delete(clientId)` (`manager.ts:1382`) | A second `boolean` on `disconnect`; a `wasOwner` flag threaded through `#leaveLocal`; an `onUnsubscribeMisaddressed` seam re-delivering the same fact; **reporting from the END of `#leaveLocal`**, which is reached only on the 1→0 path |
| **Whether this instance owns a socket** | `packages/realtime/manager.ts` — `this.connections.has(clientId)`, already the sole spelling used by `evict` (`:1691`), `reconcileRevocations` (`:1733`) and `handleControl` (`:1887`) | A `#ownedIds` set; `#channelsByClient.has(clientId)` used as a proxy (it is empty for an owned connection that holds no channel); re-deriving ownership from `subscriptions` |
| **Whether a revocation may be cancelled by a durability failure** — no, never | `packages/realtime/manager.ts` — `evict`'s durable-first block (`:1659-1698`), which `revokeChannel` obeys identically (FR-005) | A second re-throw ordering in `revokeChannel`; a `finally` (which would mask the revocation's own failure); an `allowUndurable` escape; a durability write moved after the apply |
| **Whether a control frame may carry a new field** — no; a new **kind**, never a new field | `packages/realtime/drivers/redis.ts` — `#canonical`'s field list (`:1659-1672`) (FR-014) | A field on the wire absent from `#canonical` (ships **unauthenticated**); a field added to both on the new side only (dropped by every published peer as an invalid MAC); a `scope` discriminator instead of a kind; a version byte on the frame |
| **What a revocation's scope does to the socket** — no channel means hard-close 4403; a channel means a leave with the socket open | `packages/realtime/manager.ts` — one private mapping that `handleControl`'s case and `reconcileRevocations`' branch both **call**, so the two entry points dispatch and neither decides | A `kind` test in the reconcile; a `channel === undefined` test in `handleControl`; a `wholeSocket` boolean on the record; a third scope added to one branch only |
| **Whether a revocation is scoped to a connection or to one channel** | `packages/realtime/driver.ts` — the optional `channel` on the `Revocation` record | An `evict(id, { channel })` overload; a `markRevokedScoped` beside `markRevoked`; a boolean `wholeSocket` on the control frame |
| **How a `Revocation` is encoded in the durable index** | `packages/realtime/drivers/redis.ts` — the composite index member | Parsing the composite in the manager; a documented delimiter in `driver.ts`'s JSDoc that an implementer must reproduce; a `version` field on the record |
| **Whether a driver may participate in revocation at all** | `packages/realtime/manager.ts` — the `revocationStore(driver)` probe, on `presenceRoster` / `channelWatcher`'s precedent (`manager.ts:324`, `manager.ts:358`) | `if (driver.markRevocation)` at any call site; a per-member optional-chain in `evict`, `revokeChannel` or `reconcileRevocations` |
| **Whether a `0.3.0`-shaped driver is admitted** | `packages/realtime/manager.ts` — the construction-time throw inside that same probe | A runtime warning at first `evict`; a `legacy: true` option; a shim adapter in `drivers/` |
| **Whether a revocation may proceed without durability** | `packages/realtime/manager.ts` — `revokeChannel`'s `RevocationScopeError` | An `allowUndurable` option; falling back to a bare `publishControl`; treating a missing store as a single-process driver when a control plane is present |
| **When a durable record stops applying** | `packages/realtime/manager.ts` — the `clearRevocation` call on the apply path | A shorter TTL for channel-scoped records; an applied-set in the driver; a de-dup cache keyed by `(target, channel)` |
| **Which ids and channels may be minted onto the control plane** | `packages/realtime/manager.ts` — `#assertUsableId` (`manager.ts:699`) and `#assertUsableChannel` (`manager.ts:781`) | A second validation inside `revokeChannel`; relying on the Redis driver's own `isValidName` re-check as the boundary |
| **Whether a revoked client is told** | `packages/realtime/manager.ts` — `#revokeChannelLocal`, gated on the `'left'` outcome | Sending `unsubscribed` from `unsubscribe` itself (which would also fire for a client-initiated leave); sending it from `handleControl` |
| **What a durable record that cannot be decoded means** — nothing; it is dropped | `packages/realtime/drivers/redis.ts` — the `listRevocations` decoder, which fails **closed** (FR-018) | A re-validation in the manager (which would make the byte encoding normative outside its home); a `catch` at the call site that falls back to connection scope; trusting `isValidName` at the write site alone, when the index is the one **unauthenticated** cross-instance write channel |
| **What `revokeChannel` reports** | `packages/realtime/manager.ts` — `revokeChannel`'s return (FR-022) | Inferring the outcome from whether `#revokeChannelLocal` was reached; a `revoked: boolean` on a result object; leaving `Promise<void>` and asking the caller to re-read the roster |

**Seven askers, one decider — counted, because the number is the point.**
`connections.has` has **three** askers today (`manager.ts:1691`, `:1733`,
`:1887`), and this plan adds **four**: `revokeChannel`, `handleControl`'s
`revoke-channel` case, `reconcileRevocations`' channel branch, and the outcome
derivation shared by `unsubscribe` and `disconnect`. None re-decides ownership —
it is one private-field predicate inside one class, and that is what makes seven
readers acceptable rather than alarming. **The count is written down so an
eighth is noticed**; the first draft of this table said "two", which would have
let every later asker land unremarked. _(architecture audit M2.)_

**A private `#owns(clientId)` is not on the duplication list, and the first
draft wrongly put it there.** A sole reader of `connections.has` is Extract
Method — the cure for duplication, not an instance of it. It is simply not
taken: a one-token predicate reads fine at seven sites, and wrapping it would
add a hop without removing a decision.

**A deliberate asymmetry, recorded so a reviewer does not read it as drift.**
`revokeChannel` asserts its channel; `unsubscribe` deliberately does **not**
(#314). `revokeChannel` is a **minting** boundary — both values travel onto the
control plane and into a durable record. `unsubscribe` is a **cleanup** path
reached from `disconnect`'s loop, where "creation is guarded, cleanup is total"
was decided for a stated reason (`packages/realtime/manager.ts:1517`).

---

## 6. Technical context

| Axis | Value |
| :--- | :--- |
| Language / runtime | TypeScript on Deno, TC39 Stage 3 decorators |
| Package | `@lockness/realtime` — **published on JSR at `0.3.0`, the only published version** (verified against the registry: created 2026-09-08) |
| Storage | Redis — one sorted-set revocation index, score = expiry epoch second. **No new key, no migration, no dual-write.** |
| Testing | `Deno.test` over `FakeRedis` two-instance fixtures, plus the memory-driver path; one mutation battery |
| Dependency graph | **unchanged** — `contract`, `hono`, `redis` static; `events` soft. No new edge. |
| Scale | Per-revocation cost is one durable write, one control publish, one leave. Fleet-wide verification cost is unchanged: the new kind adds no wire field. |

**A fact the design doc could not know.** The working tree's `deno.json` still
reads `0.3.0`, but HEAD is **seven merged issues ahead of the published
artefact**: #323, #326, #327, #328, #329, #330, #331 — enumerated with
`git log v0.3.0..HEAD -- packages/realtime/`, so a reader can re-check it rather
than trust it. "The published `0.3.0`" and "the local `0.3.0`" are therefore
different code, and every mixed-fleet claim in this plan is about the
**published** one.

**None of #323 / #326 / #328 touches the revocation index, the control-kind set
or the MAC canonicalisation**, so no conclusion in this plan moves — but a
reviewer diffing the tag finds three issues the first draft of this section did
not name, and had no cheap way to know they were inert. _(architecture audit
M1 — the first draft said four.)_

### Domain model

**Bounded context:** realtime channel membership and its revocation.

**Vocabulary**

- **Local tier** — verbs that act on sockets this process owns.
- **Addressed tier** — verbs that reach a socket wherever it lives, via a
  durable record plus a routed control frame.
- **Revocation** — a server-side removal of membership. Durable, addressed by
  connection id, routed to the owner, and **scoped** either to the whole
  connection or to one channel.

**Entities (have identity)**

- **Connection** — identified by `connection.id`, a per-socket UUID that is
  never reused. Charge target for every addressed verb.
- **Revocation record** — identified by `(target, channel?)`. Lives in the
  driver's index with a TTL.

**Value objects**

- `Revocation` — `{ readonly target: string; readonly channel?: string }`.
  Immutable, no identity of its own beyond its pair.
- The leave outcome unions — `'left' | 'not-subscribed' | 'not-owned'` and
  `'disconnected' | 'not-owned'`.

**Invariants**

1. A revocation is **durable before it is applied**, or it is refused.
2. A record means exactly *"a revocation the owning instance has not applied
   yet"* — so it is cleared on apply.
3. A channel-scoped record is **never** readable as a connection-scoped one, by
   any version.
4. The outcome unions derive from exactly two predicates — `connections.has`
   and `set.delete` — and nothing else. A third predicate means the tier split
   moved and the model must be revisited, not the union extended.
5. Revocation never re-authorizes: a revoked connection may re-subscribe, and
   the application's `authorize` is the only thing that can refuse it.

**Out of scope:** `AuthorizeResult` / `Authorizer` contract changes; continuous
or per-message re-authorization; a framework-owned deny list consulted by
`subscribe`; `evict`'s per-connection semantics and marker lifecycle.

---

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| 1 — No direct `hono` import | ✅ Not touched; `packages/realtime` imports `@lockness/hono` only through its declared edge. |
| 2 — JSR-only, declared per package | ✅ No new dependency; `deps:analyze` unaffected. |
| 3 — No `any` in exported APIs | ✅ `Revocation`, `RevocationScopeError` and both outcome unions are concrete types. |
| 4 — Tailwind v4 CSS-variable syntax | ➖ No CSS in scope. |
| 5 — Pre-completion gate | ✅ `deno fmt && deno lint && deno check && deno task test`, plus `deps:analyze` and `agents:brief`. |
| 6 — Never hand-edit `deno.lock` | ✅ No dependency change. |
| 7 — JSDoc on public APIs | ✅ Every new export carries description, `@param`, `@returns`, `@throws`, `@example`. |
| 8 — MVC layering | ➖ No controller / service / repository in scope; the manager is a framework service and the driver is its port. |
| 9 — Commit discipline | ✅ Split by category: `feat` (verb + seam), `test`, `docs`, `chore` (regenerated briefs). |
| 10 — Public repository | ✅ No credential, host, port or container detail in any artefact. The framework-side security reasoning **is** the wanted exception and is recorded here and on the issue. |
| 11 — Design to `architect-expert`, product to the user | ✅ The whole architecture was decided by that seat (design doc rev. 2). §12 carries the one question that is genuinely the user's. |
| TDD | ✅ Failing test first for each of the eleven validation criteria. |
| DDD layering | ✅ `Revocation` is a value object on the port; the encoding stays in the adapter. |
| Domain Model gate | ✅ §6. |
| No silent catches | ✅ Every new `catch` warns and re-throws, on `evict`'s sequencing. |

### Complexity tracking

**One accepted violation of "smallest diff", justified.** Replacing the
published driver pair rather than widening it is a **breaking** seam change on a
package with a live release. It is taken because the alternative fails
*dangerously* rather than merely inconveniently: a one-parameter implementation
satisfies a two-parameter signature, so a `0.3.0` driver would type-check,
ignore the `channel`, and write a **connection**-scoped record — which any
reader then applies as a full socket kill (4403), with no error, no warning and
no type failure. Escalation-by-omission on a security verb is the one cost this
plan will not pay.

---

## 8. Surface impact

| Surface | Impact |
| :--- | :--- |
| **Public API (`packages/realtime/mod.ts`)** | New exports: `Revocation`, `RevocationScopeError`, and the outcome unions if named. `BroadcastDriver` gains three members and loses two. **`ControlRefusal.kind` is typed `ControlMessage['kind']` (`driver.ts:67`) and is exported** — adding the new kind silently widens a second public union. In-repo there is no exhaustive switch on it; out of repo the count is unbounded. |
| **Private signature (not public surface)** | `#leaveLocal` changes from `Promise<void>` to reporting its membership predicate (FR-024). `revocationStore` is a module-level export of `manager.ts` on `presenceRoster` / `channelWatcher`'s precedent — and, like both of them, is **deliberately not re-exported from `mod.ts`**, so it is not public surface. |
| **Mutation batteries (`packages/realtime/tests/mutations/`)** | `channel_name_314.ts` and `connection_id_304.ts` **break deterministically** and are repaired per FR-025 — the disposition `docs/testing.md:402` mandates: *the source moved, the guard remains → repair the anchor, the row lives.* `log_encoding_291.ts` carries a **bidirectional** hazard on its `manager.ts` WARN anchors: if `#revokeChannelLocal` copies `revokeLocal`'s wording the anchor matches twice and the battery errors; if the block is extracted it matches zero times. Whichever way FR-005's home resolves, that battery is touched. |
| **`ChannelManager` methods** | `revokeChannel` added; `unsubscribe` and `disconnect` return types widened. |
| **Wire (control plane)** | One new kind, `revoke-channel`. **No new field** — the MAC canonicalisation is byte-identical in both directions. |
| **Redis keyspace** | No new key, no migration, no dual-write. The index is read-compatible both ways. |
| **Browser client (`packages/realtime/client.ts`)** | Unchanged. It already handles `{ type: 'unsubscribed' }` as a protocol frame; it grows no reconnect logic here. |
| **Front-end / UX-UI** | **None.** This feature touches no view, no component and no stylesheet. |
| **Dependency graph** | Unchanged. |

### Interface contracts exposed

```ts
type Revocation = { readonly target: string; readonly channel?: string }

// BroadcastDriver — optional, detected as a SET
markRevocation?(revocation: Revocation): void | Promise<void>
listRevocations?(): Revocation[] | Promise<Revocation[]>
clearRevocation?(revocation: Revocation): void | Promise<void>

// ChannelManager
revokeChannel(clientId: string, channel: string):
    Promise<'revoked' | 'not-subscribed' | 'not-owned'>
unsubscribe(clientId: string, channel: string):
    Promise<'left' | 'not-subscribed' | 'not-owned'>
disconnect(clientId: string): Promise<'disconnected' | 'not-owned'>
```

**Consumer impact of the return widening.** Not a compile error for callers that
ignore the value, and `(…) => Promise<X>` stays assignable to a
`(…) => Promise<void>` annotation. It **is** a contract change, and it breaks a
subclass that overrides either method with `Promise<void>`.

### Documentation (this feature)

| Document | What it owes |
| :--- | :--- |
| `docs/realtime.md` | A "Revocation scopes" subsection leading with the **consequence** (socket stays open / socket dies), not the verb name; the revised Revocation code block; the five-item Upgrading note naming `0.3.0` explicitly. |
| `packages/realtime/README.md` | The two-tier split, one paragraph. |
| `packages/realtime/AGENTS.md` | Pitfall rows for: the delimiter (why it must stay outside `NAME_RE`), the re-added-`markRevoked` hazard, clear-on-apply, and the mint-versus-cleanup assertion asymmetry. Regenerate the surface + tests blocks. |
| The docstrings | `unsubscribe`, `disconnect`, `revokeChannel`, `evict` — the tier each belongs to, stated at the site. Plus FR-017's stale-clause fix. |

---

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| The composite delimiter is later "tidied" to `:` or `.` for readability. | Those are inside `NAME_RE` (`/^[A-Za-z0-9:._-]+$/`, verified at `packages/realtime/protocol.ts:48`), so a composite would collide with a real id and an old reader would widen a channel revoke into a socket kill. Mutation battery mutant 3 is the **only** witness; the reason goes in the `AGENTS.md` pitfall row. |
| Someone re-adds `markRevoked` "for compatibility" and the escalation hazard returns. | The concrete failure chain is quoted in the pitfall row, and the construction-throw test fails on a driver presenting the old pair. |
| The construction-time throw fires for a driver that never implemented revocation. | The probe tests for the **old** members' presence, not the new ones' absence. Verified: `MemoryBroadcastDriver` implements none of them. |
| `revokeChannel` reads as "the soft one" and operators reach for it where `evict` is required. | The docs table leads with the consequence, not the name; the Upgrading note names `evict` as the mid-deploy verb every version obeys. |
| Clear-on-apply is later read as an inconsistency with `evict` and removed. | The reason — the target outlives the application in one scope and not the other — goes in the pitfall row, and mutant 1 fails on removal. |
| The new callers of the leave path re-open #330's race. | **Read the code, not the design doc's prediction.** #330 did *not* serialize at the verb boundary: it put a per-**roster-slot** FIFO keyed `` `${channel}\0${memberId}` `` around the authoritative write alone (`manager.ts:1457-1485`). That is deeper, and better here — any caller reaching `#syncRosterMember` is serialized whatever its entry point, so the three new non-frame callers **are** covered for the roster write. It covers **presence channels only**: `unsubscribe` reaches `#syncRosterMember` inside `if (members && member)` (`:1530`), so a revoke on a private channel (US1's own `private-orders`) has no roster write and needs none. Nothing else on the leave path is ordered against a concurrent subscribe. _(architecture audit L1 — the first draft overstated this.)_ |
| `manager.ts` is a god file, and this plan grows the cluster it would be split on. | **Measured:** 1893 lines against 368 for the next-largest authored file in the package — 5.1×, where the catalogue's signal is 3×. It grew **+594 lines (+46%)** across the seven issues since `v0.3.0` (1299 → 1893). Reasons to change are already four — membership, presence-roster projection, revocation, caps/validation — and this plan adds six members to the revocation cluster. **Not extracted here**, deliberately: it would move every anchor in three mutation batteries at once and turn the security review of `revokeChannel` into the review of a file move. Filed as its own item instead. Note `drivers/redis.ts` is 1948 lines on the same curve and is untouched by this. |
| A per-connection mutex is later added and deadlocks. | `revokeLocal → disconnect → unsubscribe` is already a nested call on one connection; `#revokeChannelLocal → unsubscribe` adds a second. Recorded here and in the pitfall row. |
| The outcome unions grow a fourth state. | Invariant 4 of the domain model: the states derive from two predicates and nothing else. A fifth predicate is a signal that the tier split moved. |
| A later "tidy" makes the reap drop members it cannot parse. | The reap is **score-only** (`ZREMRANGEBYSCORE`, `packages/realtime/drivers/redis.ts:120`) and the `isValidName` gate is JS-side and non-destructive (`:1548`). That is what makes a published peer not merely skip a channel-scoped record but **preserve** it for the upgraded owner. A destructive reap would delete revocations mid-deploy. Pitfall row + a test that a peer-shaped read leaves the member in the index. |
| The decoder is written as `members.map(split)` and a malformed member degrades to connection scope. | FR-018 plus a mutation-battery mutant that returns the raw member as `{ target }` on split failure and asserts **no 4403 fires**. This is escalation-by-omission arriving through the decoder instead of the type system — the class §7 refuses to pay for. |

---

## 10. Architecture audit

**Seat:** `architect-expert`, plan audit, 2026-09-09. **Verdict: `fail`** — 0
CRITICAL, **2 HIGH**, 7 MEDIUM, 2 LOW.

**The decisive sentence, and it is not a criticism of the design:** *"None of my
findings asks for a design change. Every one is a row, a count, a file-list
entry or a corrected sentence."* The architecture of record survived every
falsification attempt the seat made. What failed was **this plan's carriage of
it** — three rules with no home, and four factual claims wrong.

**Coverage.** `docs/architecture.md`, `docs/dependencies.md` and
`deps.policy.jsonc` were **not** read; the plan proposes no new package edge and
the seat verified none is implied, so **no dependency-direction verdict is
offered** and the one structural finding (M7) is a measurement with no
extraction prescribed. All five open backlog items read.

### Four claims of this plan that were wrong, and are now corrected

The seat re-derived rather than trusted, and it caught more than it confirmed.

| The plan said | The code says | Where it is fixed |
| :--- | :--- | :--- |
| HEAD is **four** merged issues ahead of published `0.3.0` | **Seven** — #323, #326, #327, #328, #329, #330, #331 (`git log v0.3.0..HEAD -- packages/realtime/`) | §6, with the command and the inertness of the three extras |
| #330 serialized "at the manager's verb boundary" | A per-**roster-slot** FIFO around the authoritative write alone (`manager.ts:1457`) — deeper, better here, and **presence-only** | §9 |
| The outcomes derive from "**two** predicates" | `#leaveLocal` has **one** membership predicate and **three** exits, two of which mean *left* | §5 row 1, FR-024, SC-008 |
| "**Two** askers, one decider" | **Seven** — three today, four added | §5 |

The `#leaveLocal` one is the expensive one. A report taken from the **end** of
that method is `true` only on the 1→0 path, so `unsubscribe` would answer
`'not-subscribed'` for every leave from a room that still holds someone else —
the common case, and US2's headline outcome wrong. **Every existing fixture is
single-member, so the whole suite would stay green.** Hence SC-008.

### Findings, and what was done with each

| # | Sev | Finding | Disposition |
| :--- | :--- | :--- | :--- |
| **H1** | **HIGH** | **Two mutation batteries break deterministically and the plan named neither file.** `channel_name_314.ts` row 4 anchors on `unsubscribe`'s exact signature line, which FR-001 rewrites. `connection_id_304.ts`'s reconcile-filter row anchors on `if (id && isValidName(id)) live.add(id)`, which FR-009/FR-018 replace — **and that row is the security guard the security audit's F1 is about**, whose own comment calls it *"the only thing standing between a broker-sourced member and `revokeLocal`"*. `deno task mutate` sits **outside** hard rule #5's gate, so the change ships green locally and fails nightly under a contributor who did not make it. | **Plan changed** — FR-025 added, plus a §8 row for `tests/mutations/` carrying `docs/testing.md:402`'s disposition and the bidirectional `log_encoding_291` hazard. |
| **H2** | **HIGH** | **FR-014 — "a new kind, never a new field" — had no decision-table row**, and it is the single rule the whole mixed-fleet safety argument rests on. The design doc states it exhaustively; the design doc is not what `tasks` and `implement` read. A contributor adding `scope: 'channel'` for readability breaks MAC compatibility in one direction and **ships unauthenticated** in the other. Separately `ControlRefusal.kind` is typed `ControlMessage['kind']` and exported, so the new kind widens a second public union that §8 did not mention. | **Plan changed** — one §5 row homed on `#canonical`'s field list; `ControlRefusal` added to §8. |
| **M1** | MED | §6's baseline count wrong by three. | **Corrected**, with the command so it is re-checkable. |
| **M2** | MED | "Two askers" undercounts by five; and the table listed `isOwner()` as duplication when a sole reader of `connections.has` is **Extract Method — the cure**, not an instance. As written the table discouraged the one move that would give the decision a nameable home. | **Corrected** — real count stated, the helper moved out of the duplication column and rejected on its own grounds. |
| **M3** | MED | **The scope → consequence mapping had no home** and would be spelled twice — a `kind` switch in `handleControl` and a `channel === undefined` test in `reconcileRevocations`, arriving by different routes with nothing linking them. §5 had rows for what a record *is* and how it is *encoded*, never for what it *means*. | **Plan changed** — one §5 row; both entry points call one private mapping and neither decides. |
| **M4** | MED | **FR-005's never-fail-open sequencing had no home** and would be a verbatim copy of `evict`'s 30-line block, which carries the #276 HIGH-2 and #291 disclosure reasoning and is mutation-guarded. Same rule, same owner, same failure mode — so the constitution's "DRY only for *semantic* duplication" is met. **Not prescribing the extraction** (two copies is Rule-of-Three territory); prescribing a named home so the next correction reaches both. | **Plan changed** — one §5 row; the implementer picks shared-private or comment-pointer, and either answer touches `log_encoding_291`. |
| **M5** | MED | **Row 6 cited a precedent that has no throw.** `presenceRoster` and `channelWatcher` are *total, non-throwing* narrowing functions; returning `undefined` is their whole contract. Fusing the migration throw into `revocationStore` gives it two reasons to change. Concrete cost: three cycles out, someone restoring consistency with the two siblings makes the probe non-throwing — which is §9's "someone re-adds `markRevoked`" risk arriving from the other side. | **Accepted, plan changed** — the timing stays (it is right); the unit splits into a total `revocationStore(driver)` plus an `#assertNotLegacyRevocationDriver(driver)` called beside it where both siblings are already wired (`manager.ts:584`). Row 6's home names the assertion. **What this does not solve, in the seat's words:** the probe proves presence, never conformance. |
| **M6** | MED | `#leaveLocal`'s predicate count — see the table above. | **Plan changed** — FR-024, SC-008, §5 row 1, §8 private-signature row. |
| **M7** | MED | **`manager.ts` is a god file by the catalogue's own measure** — 1893 lines, 5.1× the next-largest authored file where the signal is 3×, +46% across the seven issues since the tag. Four reasons to change; this plan adds six members to one of them. | **Accepted, not fixed here** — §9 risk row with the measurement, and a backlog item. Extracting inside this change would move every anchor in three batteries at once and turn a security review into a file-move review. |
| **L1** | LOW | §9's #330 row described the wrong mechanism and over-claimed: the protection is real and *deeper* than stated, and covers **presence channels only**. | **Corrected** in §9. |
| **L2** | LOW | Three homes left their reason or their surface in the design doc: why `Revocation` sits on `driver.ts` and not beside `PresenceMember` on `channel.ts`; whether `revocationStore` is public surface; and FR-017's "40 lines" (it is 46). | **Corrected** — §8 private-signature row, FR-017's number, and the port/adapter reason stated below. |

**Why `Revocation` lives on `driver.ts` and not beside `PresenceMember`.**
`PresenceMember` is **client-visible** — it travels to browsers on presence
frames. `Revocation` is **driver-internal**: it never leaves the server, and it
exists to describe a capability the port needs. Same split the package already
makes between the client-visible member and the driver-internal sweep metadata.

### What a reviewer will find three cycles from now — in writing

1. **Two near-twin revocation verbs whose shared rule was never named** — M4's
   defect, arriving after the second copy has drifted.
2. **A third revocation scope** (per-event, per-identity — the model now invites
   one) added to one of the two scope→consequence spellings and not the other,
   visible only under a lost control frame. M3 exists to prevent this.
3. **Two dead batteries** nobody remembers the reason for, if H1 is not repaired
   in this change.
4. **An eighth asker of `connections.has`** landing unremarked, because a
   reviewer does not re-count and the guard sentence never fires. The count is
   now written down for exactly this reason.
5. **`manager.ts` past 2100 lines** with five reasons to change.

### Confirms #334, from a new angle

[#334 — Realtime: an empty presence channel map is retained for the life of the process](https://github.com/locknessland/lockness-monorepo/issues/334)
says `unsubscribe` never deletes the empty `presence` entry. The new angle:
`#syncRosterMember`'s slot key is computed against that same retained map, so
the entry is now read by the roster projection **on every leave**. #334's cost
is no longer purely memory. One line owed on that issue; not this plan's to fix.

### The seat declined Q1, deliberately

*"Which release may break a published integrator changes what the software does
for whoever consumes it. That is the user's, not mine, and I decline it
deliberately rather than by omission."* — which is hard rule #11 read from the
correct side.

## 11. Security audit

**Seat:** `security-expert`, plan audit, 2026-09-09. **Verdict: `fail`** — 0
CRITICAL, **1 HIGH**, 4 MEDIUM, 0 LOW. Nothing blocks the plan; every finding is
a requirement row today and a migration-plus-callers after the code exists.

**Coverage, because a clean claim is worth exactly what it covered.** Re-derived
against `packages/realtime/protocol.ts`, `manager.ts`, `drivers/redis.ts`,
`control_replay_window.ts`, `client.ts`. All five open backlog items read. Two
security memory domains — access control, logging — were **not** loaded within
the seat's budget, and F4 is downgraded on that basis and labelled as a
suspicion with strong local precedent rather than a fully-backed finding.

### Findings, and what was done with each

| # | Sev | Finding | Disposition |
| :--- | :--- | :--- | :--- |
| **F1** | **HIGH** | **The seam replacement loses the broker-sourced ingest filter's home.** `listRevoked` ends with `if (id && isValidName(id)) live.add(id)` (`drivers/redis.ts:1548`), whose own comment calls it *"the only thing standing between a broker-sourced member and `revokeLocal`"*. The revocation index is the **only unauthenticated cross-instance write channel** in the package — control frames carry a MAC, the index does not. Replacing `listRevoked(): string[]` with `listRevocations(): Revocation[]` invites `members.map(split)`, and a member that fails to split cleanly can return `{ target: "<id> <channel>" }` or `{ target, channel: undefined }` — which `reconcileRevocations` applies as a **connection** revocation, hard-closing 4403. That is escalation-by-omission **relocated from the type system to the decoder**: §7 removed the type-level instance of the hazard, not the class. | **Plan changed** — FR-018 added (decode fails closed, both halves re-validated), one decision-table row added naming the decoder as its home, one risk row, one mutation-battery mutant. |
| **F2** | MEDIUM | **The security verb kept the silent no-op.** `publishControl` is optional-chained (`manager.ts:1502`). On a driver with no control plane whose target is not owned locally, `revokeChannel` resolves `Promise<void>` having published nothing, applied nothing and recorded nothing — FR-012's `RevocationScopeError` fires only when a control plane **is** present. Verbatim the defect #332 was filed about, reintroduced in the verb built to fix it. SC-002 granted distinguishability to `unsubscribe` and `disconnect` and withheld it from the one verb whose silence is a *security* failure. | **Plan changed** — FR-022 added; `revokeChannel` reports `'revoked' \| 'not-subscribed' \| 'not-owned'`. This **extends the recorded design rather than contradicting it**: it is decision (a)'s own rule ("two outcomes must not share one representation") applied to the verb (b) introduced. |
| **F3** | MEDIUM | **`clearRevocation`'s failure mode is unspecified, and US3 depends on it.** FR-005 covers a failed *mark*; nothing covered a failed *clear*, and clear-on-apply has no `evict` precedent to inherit — `evict`'s records are never cleared, they expire. One failed clear leaves the record live to TTL (default 300 s), and every reconcile tick re-evicts a member who legitimately re-subscribed. Separately, §7's "warns and re-throws" commitment is unsatisfiable on the `handleControl` path, where the precedent is `void this.revokeLocal(...)` (`manager.ts:1886`) — a re-throw there is an unhandled rejection, not a caller signal. | **Plan changed** — FR-019 (re-throw only where a caller exists) and FR-020 (repeat apply is idempotent) added. |
| **F4** | MEDIUM | **No requirement carried the log encoders onto the new lines**, and `revokeChannel` is the first revocation path that logs a **channel name** — application data that routinely carries a tenant or account identifier. §7 committed only to `evict`'s *ordering*, not its *encoding*. The package made this exact mistake once and fixed it, recording that the hazard is **disclosure**, not injection: `console.warn(msg, error)` prints the message *and* the stack, and a credential-bearing failure was measured reaching the sink in cleartext (`manager.ts:1667`). | **Plan changed** — FR-021 added. |
| **F5** | MEDIUM | **The widened `unsubscribe` return is a membership oracle if an application relays it.** The framework ships no socket-to-manager wiring — the application writes that handler — and §1 of this plan says the signature *invites* passing a client-supplied id. The three states then read: `'not-owned'` → that id is live somewhere in the fleet but not here; `'not-subscribed'` → this instance owns that socket and it is not in that room; `'left'` → a stranger was just removed and it worked. The precondition is an application bug that predates this plan; the **oracle** is what this plan adds. | **Plan changed** — FR-023 added; the clause lands in the docstring and as a fifth `AGENTS.md` pitfall row, both already scheduled by §8. |

### Six claims attacked and confirmed — two came out stronger

Recorded so no reader pays to re-derive them.

1. **`revokeChannel` is not client-reachable.** `decodeClientMessage`
   (`protocol.ts:104`) is a `switch` whose `default` **throws**, and it returns a
   freshly-constructed narrowed object rather than the parsed one — no extra
   field survives decode.
2. **The MAC is byte-identical (FR-014).** `#canonical`
   (`drivers/redis.ts:1659`) already covers `channel`, an existing wire field.
   The channel **is** MAC-covered, so a bus-read attacker cannot rewrite a
   frame's target room.
3. **A published peer admits and ignores the new kind.** `#verifyAndDecode` has
   no kind allowlist — only `typeof wire.kind !== 'string'`
   (`drivers/redis.ts:1710`) — and `handleControl`'s switch has no `default`.
4. **Old-reader inertness — stronger than claimed.** The reap is score-only
   (`drivers/redis.ts:120`) and the `isValidName` gate is JS-side and
   non-destructive (`:1548`). A published peer not only **skips** a
   channel-scoped record, it **cannot delete it** — so the record survives for
   the upgraded owner. Now recorded in §9 as a risk, because a future "tidy"
   would break it silently.
5. **The replay-window cost is self-contained.** `ControlReplayWindow` evicts
   per-origin against a fair share (`control_replay_window.ts:52`), so an
   instance flooding the new kind evicts **its own** oldest nonces and cannot
   degrade a peer's replay protection. The seat formed the opposite hypothesis
   and disproved it.
6. **The mint-versus-cleanup assertion asymmetry is sound**, conditional on
   F1's filter existing — the decoder is the one place a never-asserted value
   re-enters.

### What an authenticated stranger gets

**Nothing new from the framework**, and the seat named what it checked: the
client wire is deny-by-default; control frames are MAC-covered, origin-filtered,
name-revalidated and replay-gated, and a replayed revocation targets a
per-socket UUID that is never reused. The durable index is the one
unauthenticated write channel — already true for `evict` today, bounded by
`isValidName`, and **not widened by this plan provided FR-018 lands**. What
changes is expressiveness, not reach: max severity per record goes **down**
(room, not session); the number of shapes the decoder must refuse goes **up**.
That asymmetry is why F1 is HIGH and not a note.

**One product-shaped consequence, accepted and documented rather than fixed:**
a revocation is **not a ban**. A revoked connection may re-subscribe if the
application's `authorize` says so (invariant 5, inherited from #331). An
operator reaching for `revokeChannel` to "ban from one room" will assume
otherwise, so `docs/realtime.md`'s new subsection says it in one sentence.

---

## 12. Open questions

**Q1 (blocking) — Which release carries a construction-time throw against a
published driver seam, and are third-party realtime drivers a supported
extension point at 0.x at all?**

This is a **release-model** decision, not a design one: the shape is settled and
the seat has ruled. What is not settled is what a published package may do to
its integrators, and in which version. `@lockness/realtime@0.3.0` is live on
JSR; `revokeChannel` requires new driver members; and a third-party driver
presenting only the `0.3.0` pair **throws at construction**.

**Answered 2026-09-09 — `0.4.0`, hard refusal. Settled.**

**The built-in drivers are the contract at 0.x.** Third-party realtime drivers
are **not** a supported extension point before 1.0. Consequences, all binding on
`tasks` and `implement`:

- The construction-time throw ships in **`0.4.0`** as designed. No deprecation
  window, no `'unsupported'` fourth outcome, no shim release.
- A third-party driver of `0.3.0` shape **stops constructing** on upgrade, with
  an error naming the migration — which is the whole point: the alternative was
  `evict` losing its durability silently on a driver that plainly implements it.
- **This stance is recorded once**, in `docs/realtime.md`'s Upgrading section,
  so the next seam change does not re-argue it. It is a documentation
  obligation of this feature, not a follow-up.
- The version bump is `deno task bump 0.4.0` — lockstep across the monorepo, at
  release time, not in this branch.

_Rejected, with its cost: a deprecation window in `0.4.0` with the throw
deferred to `0.5.0`. It would add a fourth state to a public union, schedule a
removal, and leave `evict` silently undurable on a `0.3.0`-shaped driver for a
whole release — the exact failure the seam exists to prevent. Also rejected:
holding `revokeChannel` to 1.0, which would make the silent no-op visible with
no remedy to point at._

### Decided without asking

One line each, so a wrong assumption is visible rather than buried.

- **The design is not re-opened.** Decisions (a) and (b), the seam replacement,
  the composite encoding, clear-on-apply and the new control kind were decided
  by `architect-expert` on 2026-09-09 (rev. 2). Hard rule #11: recorded and
  implemented, not relayed back.
- **`0.3.0` is the published baseline** — verified against the registry, not
  against a workflow's green tick. It is the only published version.
- **#330's sequencing constraint is lifted.** It merged this morning, and it put
  the serialization at the manager's verb boundary — the placement §6.6 of the
  design asked for. Nothing waits on it.
- **No ADR.** Package-scoped, so the repo's convention for this class (#314,
  #323, #327, #331) applies: docstring at the site, `docs/realtime.md`,
  `AGENTS.md` pitfall row.
- **`#leavePresence` stays unextracted.** The symmetric counterpart to #328's
  `#joinPresence` is wanted and is **not** required here; `unsubscribe`'s
  `members.get` → `members.delete` pair is already synchronous and adjacent.
  Its own issue.
- **The local tier is not retyped to take a `Connection`.** That is the
  strictly cleanest shape and is rejected on cost — it breaks two documented
  signatures for every consumer, and disciplines the incorrect callers by
  breaking the correct ones. Worth its own issue if ever wanted.
- **`revokeChannel` reports an outcome** (FR-022), which the recorded design did
  not specify. This **extends** decision (a) rather than contradicting it: it is
  the design's own rule — two outcomes must not share one representation —
  applied to the verb (b) introduced. Taken rather than re-dispatched.
- **The capability probe splits in two** (M5): a total `revocationStore` on its
  siblings' precedent, plus a separate legacy assertion. The construction-time
  *timing* is unchanged; only the unit is.
- **`manager.ts`'s size is a backlog item, not this change** (M7). Extracting
  the revocation cluster here would move every anchor in three mutation
  batteries at once.
- **One line is owed on #334** — the retained `presence` entry is now read by
  the roster projection on every leave, so its cost is no longer purely memory.
  Filed against that issue, not fixed here.
- **Delivery obligation carried forward:** landing `revokeChannel` adds a
  non-frame caller to the leave path, which obliges an update to
  `packages/realtime/tests/churn_cost_329.test.ts` and to the published
  per-frame cost table in `docs/realtime.md`. That table is **derived** from
  that test and says so — the two move together or the documentation drifts.
