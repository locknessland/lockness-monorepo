# Plan: per-channel subscribe

**Feature dir:** `.specnaut/specs/253-per-channel-subscribe`
**Branch:** `253-per-channel-subscribe`
**Linked issue:** [#295](https://github.com/locknessland/lockness-monorepo/issues/295)
**Status:** plan — awaiting stop 1

---

## 1. Why this exists

`RedisBroadcastDriver.onMessage` pattern-subscribes `${prefix}__event:*`
(`drivers/redis.ts:936-938`), so **every instance receives every channel's
traffic under its prefix** and discards what it does not host, in
`ChannelManager.deliverLocal`.

The cost is paid on the broker and on every instance's read loop, and it scales
with the deployment rather than with the instance. An instance hosting 3 of a
prefix's 3 000 channels still parses all 3 000 channels' payloads and MACs
nothing away until `deliverLocal` looks up a `Set` that is empty.

Measured baseline to beat (SC-001): frames delivered to an instance's read loop
for channels it does not host. Today that is 100 % of the prefix's traffic minus
its own.

**This is an optimisation. It is not a substitute for #288 and must not be read
as reopening it** — see §9 R-1.

## 2. User scenarios

### US1 — an instance receives only what it hosts (P1)

**Given** two instances under prefix `app`, instance A hosting channel `alpha`
and instance B hosting `beta`,
**When** a client publishes to `beta`,
**Then** instance A's subscribe socket receives no frame for it at all — not a
frame it filters, but no frame.

### US2 — the last leaver stops the traffic (P1)

**Given** instance A is the only host of `alpha` and one client remains,
**When** that client unsubscribes or disconnects,
**Then** A unsubscribes from `alpha`'s topic and receives no further frames for
it.

### US3 — a reconnect restores every live subscription (P1)

**Given** instance A hosts `alpha`, `beta` and `gamma`,
**When** its subscribe socket faults and re-dials,
**Then** all three are re-issued and delivery resumes on all three — proven
against a **live broker**, because a fired `onReconnect` is not proof frames are
flowing (#309's shipped contract).

### US4 — a channel dropped before the reconnect stays dropped (P2)

**Given** A hosted `alpha` and its last client left,
**When** the socket faults and re-dials,
**Then** `alpha` is **not** re-issued. A subscription resurrected by a reconnect
is a silent leak that only appears under fault.

### Edge cases

- Two clients join the same channel on one instance → one subscribe, not two.
- The last client leaves and another joins in the same tick → no unsubscribe /
  resubscribe churn is *required*, but correctness must not depend on ordering.
- A channel whose name contains `:` (legal) → exact-topic subscribe, no glob.
- `punsubscribe` absent from an injected subscriber → see D-5.

## 3. Requirements

- **FR-001** The `RedisSubscriber` port exposes an **optional** unsubscribe seam.
- **FR-002** `BroadcastDriver` exposes optional per-channel `watch` / `unwatch`
  hooks; a driver that omits them keeps today's behaviour.
- **FR-003** `ChannelManager` calls `watch(channel)` when a channel's local
  subscriber set goes 0→1 and `unwatch(channel)` when it goes 1→0, and at no
  other time.
- **FR-004** `RedisBroadcastDriver.onMessage` registers the handler without
  subscribing anything; subscriptions are created by `watch`.
- **FR-005** An unwatched channel is removed from the subscriber's re-issue set,
  so a later reconnect does not resurrect it.
- **FR-006** Every derived topic remains anchored under the reserved
  `__`-separator scheme (#288). No new topic shape is introduced.
- **FR-007** The control topic's subscription is unchanged and unconditional.
- **FR-008** A watch for an already-watched channel is a no-op **on the wire**.
  *Unsatisfiable against today's `psubscribe` — see FR-009.*
- **FR-009** `psubscribe` gains a way to issue **one** pattern rather than
  re-issuing the recorded set. The naive delta (`#activate([pattern])`)
  reintroduces #245 — a transient blip over a single-flight dial left one of two
  patterns recorded-but-never-subscribed and the instance permanently deaf on
  the control topic — so the shape is a per-generation record of "confirmed
  issued", with `#activate` writing the difference.
- **FR-010** A reconnect re-issues the full set; an ordinary watch does not.
  Two decisions, one method today.
- **FR-011** "Not hosted" has ONE representation: `unsubscribe` deletes the map
  entry when the set empties, so `subscriptions.has(channel)` is the single
  spelling.
- **FR-012** One `#joinLocal` / `#leaveLocal` pair owns the transition and is
  called from every membership mutation; the hooks fire there and nowhere else.
- **FR-013** `#activate` re-reads `patterns.has(pattern)` inside its loop rather
  than trusting the snapshot taken before the awaits.
- **FR-014** `#handlerFaults` is keyed on the socket generation, not the
  pattern.
- **FR-015** The keepalive is armed on a generation change, not on every
  activation.
- **FR-016** The driver refuses a channel failing `isValidName` at the
  `watchChannel` boundary — the value reaches a PSUBSCRIBE **pattern** context.
- **FR-017** A per-connection and a per-instance watched-channel cap, refused
  loudly rather than degraded.
- **FR-018** `prefix_anchoring.test.ts` identifies the control subscription by
  equality with `controlTopic` and event subscriptions by the
  `eventTopicPrefix` head — never by `endsWith('*')`.
- **FR-019** The channel a received frame is attributed to is derived from the
  **delivered topic** and nowhere else, including under per-channel subscribe.
- **FR-020** The transition test and its hook run in the **same synchronous
  turn** as the set mutation — no `await` between them.

## 4. Success criteria

- **SC-001** For an instance hosting a strict subset of the prefix's channels, a
  publish to a non-hosted channel produces **zero** frames on that instance's
  subscribe socket. Measured on a live broker by frame count, not by timing.
- **SC-002** After a forced socket fault, every still-hosted channel delivers
  again, and every dropped channel does not. Live broker.
- **SC-003** Two clients on one channel produce exactly one `PSUBSCRIBE` and,
  after both leave, exactly one `PUNSUBSCRIBE`.
- **SC-004** The control plane's behaviour is byte-identical to today —
  same topic, same subscription, same MAC path.
- **SC-005** N sequential watches put **N** `PSUBSCRIBE` frames on the wire in
  total, not N²/2. *SC-001 and SC-003 as originally written cannot fail on C1.*
- **SC-006** After an unwatch, **zero frames arrive on the socket** for that
  channel — measured at the socket, not at delivery, because a subscription
  with no handler delivers nothing and still costs bandwidth.
- **SC-007** A full re-issue completes at a realistic N on a live broker. "It
  works at N=2" is what is tested today.
- **SC-008** A join landing during a leave's roster round-trip leaves the
  channel watched and delivering.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Whether this instance hosts a channel at all | `packages/realtime/manager.ts` — the `subscriptions` map's set size | A second counter in the driver; a `hosted` flag on the connection; a `size > 0` test written anywhere else |
| Which topic string a channel maps to | `packages/realtime/drivers/redis.ts` — `eventTopic(channel)` | Any caller building `${prefix}__event:${channel}` inline; a test asserting the literal |
| When a subscription is created or destroyed on the wire | `packages/realtime/drivers/redis.ts` — `watch` / `unwatch` | The manager calling `psubscribe` directly; `onMessage` subscribing anything |
| Which subscriptions a reconnect re-issues | `packages/redis/subscriber.ts` — the `patterns` map | The realtime driver keeping its own list to re-issue; a reconnect handler that re-subscribes |
| That the control topic is always subscribed | `packages/realtime/drivers/redis.ts` — `onControl` | `watch` special-casing the control topic; the manager knowing it exists |
| Whether a channel name is safe to use as an exact topic | `packages/realtime/protocol.ts` — `isValidName` | A glob-metacharacter check added in the driver or the subscriber |

## 6. Technical context

- **Language / runtime:** Deno, TypeScript, TC39 decorators.
- **Packages touched:** `@lockness/realtime` (manager, driver port, redis
  driver, memory driver), `@lockness/redis` (subscriber).
- **Testing:** hermetic suite + live-broker suite gated behind
  `LOCKNESS_REDIS_INTEGRATION=1`; mutation batteries under the shared harness.
- **Scale:** the win grows with (channels under prefix ÷ channels per instance).
- **Constraint:** the wire protocol is Redis pub/sub; `PSUBSCRIBE` on an exact
  string is legal and keeps `pmessage` framing.

### Domain model

- **Bounded context:** `realtime` (fan-out + subscription lifecycle), edge into
  `redis` (the subscribe socket).
- **Vocabulary:**
  - `Hosted channel` — a channel with ≥1 local subscriber on this instance.
  - `Watch` — the instance's declaration that it hosts a channel; becomes a
    broker subscription.
  - `Re-issue set` — the subscriptions a reconnect restores.
- **Entities:** `ChannelManager` [aggregate root] — owns local membership and is
  the only thing that can observe a 0→1 / 1→0 transition.
- **Value objects:** `Channel(name)` — charset-bounded by `isValidName`, which
  is what makes an exact-topic subscribe safe.
- **Invariants:**
  - A channel is watched **iff** it has ≥1 local subscriber. Both directions
    matter: watching an unhosted channel wastes the fan-out this feature exists
    to remove; failing to watch a hosted one drops its messages silently.
  - The re-issue set equals the watched set at all times. A divergence is
    invisible until a fault, which is the worst time to discover it.
- **Out of scope:** the roster, the control plane, `assertUsablePrefix`.

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| TDD — failing test first | **Pass** — SC-001/002/003 are written as failing live-broker tests before the driver changes. |
| DDD layering | **Pass** — the manager decides hosting, the driver decides wire shape. No I/O moves into the manager. |
| Domain Model gate | **Pass** — §6. |
| No silent catches | **Pass** — no new catch introduced; `watch`/`unwatch` failures log at WARN like every other driver path. |
| SOLID / DRY / KISS / YAGNI | **Pass** — the ref count is `set.size`, not a new field (see D-1). |
| No `any` in exported APIs | **Pass**. |
| JSDoc on public APIs | **Required** — two new port members. |
| Hard rule #2 (JSR-only, declared) | **N/A** — no new dependency. |

### Complexity tracking

None. The change removes a glob rather than adding a layer.

## 8. Surface impact

- **`BroadcastDriver`** — two new **optional** members (`watch?`, `unwatch?`).
  Additive; every existing driver still satisfies the port.
- **`RedisSubscriber`** — one new **optional** member (`punsubscribe?`).
  Additive, same reasoning as `onReconnect?` (#271).
- **`RedisSubscribeConnection`** — one new public method.
- **No user-facing config change.** Nothing to set, nothing to migrate.

### Documentation (this feature)

- `docs/realtime.md` — the fan-out section: what an instance now receives.
- `packages/redis/README.md` — the new unsubscribe seam.
- `packages/realtime/AGENTS.md` — the watched-set/re-issue-set invariant.

## 9. Risks

- **R-1 — read as reopening #288.** Per-channel subscribe was evaluated and
  **rejected** as #288's fix: `app` + channel `eu:orders` and `app:eu` + channel
  `orders` once produced a byte-identical topic, which no subscription
  discipline can route around. #288's `__` separator closed it
  (`app__event:eu:orders` vs `app:eu__event:orders`). **Mitigation:** this
  feature changes only *which* topics are subscribed, never how one is derived
  (FR-006), and the decision table gives topic derivation a single home.
- **R-2 — the join window (NEW, and the sharpest).** `psubscribe` is
  fire-and-forget by port contract (synchronous, returns `void`), so a client
  joining a channel this instance does not yet host can miss messages published
  between the join and the `PSUBSCRIBE` landing. **The prefix-wide subscribe has
  no such window.** This is a real regression in exchange for the fan-out win.
  Mitigation options are a stop-1 question (Q1).
- **R-3 — re-issue divergence.** If `punsubscribe` does not remove the pattern
  from the subscriber's re-issue set, a reconnect resurrects dead subscriptions
  and the fan-out win silently decays back toward today's behaviour. Invisible
  until a fault. **Mitigation:** FR-005 + SC-002, tested on a live broker.
- **R-4 — churn.** A join/leave-heavy channel produces `PSUBSCRIBE`/
  `PUNSUBSCRIBE` pairs on every transition. **Mitigation:** measure in SC-003;
  a debounce is explicitly *not* in this plan (YAGNI until measured).
- **R-5 — an injected subscriber without `punsubscribe`.** See D-5, now written.
- **R-6 — SEQUENCING: this feature needs #298 first.** FR-009's "confirmed
  issued on this generation" is a **fourth** member of the per-generation group
  #298 exists to consolidate (`conn`, `keepaliveTimer`, `writeChain`) — each of
  which learned the same ownership guard one incident at a time. Adding a fourth
  inside this feature is the fifth repetition of the shape #298 was filed to
  stop. #298 is currently deferred pending a plan re-entry, so this is a real
  dependency and not a preference.

## 10. Architecture audit

**Verdict: `fail` — 2 CRITICAL, 4 HIGH, 5 MEDIUM, 4 LOW.** Shape right, one
load-bearing assumption about the port wrong, in a way that inverts the feature.

| # | Finding | What was done |
| :--- | :--- | :--- |
| C1 | `psubscribe` does not add one subscription — it records the pattern and re-issues **the whole set** (`#activate([...patterns.keys()])`). Called per channel join, watch #i writes i+1 frames: ~4.5M instead of 3 000 at N=3 000, serialized on one write chain. FR-008 is unsatisfiable as the port stands, and **neither SC-001 nor SC-003 can see it** — the plan would ship green. | **Accepted, and it changes the feature's shape.** New FR-009/FR-010, new SC-005, new R-6. This is why the plan does not proceed to `tasks` as written — see §12 Q1. |
| C2 | The C1 fix adds a **fourth** per-generation field to `RedisSubscribeConnection` — the exact class #298 exists to fix, and the fifth repetition of "learn the guard one incident at a time". | **Accepted** as a hard sequencing dependency. R-6. |
| H1 | 1→0 cannot be read as `set.size === 0`: `disconnect` iterates every channel **ever** hosted and `unsubscribe` never deletes the empty `Set`, so a naive check fires `unwatch` on every accumulated channel on every socket close. "Not hosted" has two spellings today (absent key, empty set). | **Accepted.** FR-011 + a new decision row. Fixing it also closes a pre-existing unbounded-growth leak. |
| H2 | Two `set.add` sites and no funnel. A `watch` written at one and forgotten at the other leaves a channel hosted-but-unwatched — every message dropped while `subscribe` returns `{ ok: true }`, nothing logged. Row 1 named a Map's `.size`, which no reviewer can enforce as a call site. | **Accepted.** FR-012; row 1 restated as file:method. |
| H3 | `punsubscribe` racing `#activate`'s snapshot leaves a live subscription whose handler `#dispatch` can no longer find. Frames arrive and are discarded — the cost this feature removes, restored, with nothing in any log. SC-002 measures delivery, so it passes. | **Accepted.** FR-013 + SC-006. |
| H4 | Optional members are detected individually where every precedent (`presenceRoster`) detects them as a **set**. `psubscribe` without `punsubscribe` accumulates one permanent subscription per channel ever hosted — strictly worse than today, undetectable because delivery stays correct. | **Accepted.** FR-004 becomes conditional; D-5 now written. |
| M1 | Row 2 reverses a **documented** decision: `eventTopicPrefix`'s JSDoc argues `PUBLISH` is a literal context and `PSUBSCRIBE` a pattern context, so one builder serving both means future escaping silently corrupts the subscription. | **Accepted** — two builders, and §9 records that #288's reasoning was revisited. |
| M2 | FR-004 splits `onMessage` (register) from `watch` (subscribe), making "subscribed with no handler" reachable where it is structurally impossible today. The manager happens to call `onMessage` first — by luck, not contract. | **Accepted.** `watch` throws when no handler is registered. |
| M3 | `#handlerFaults` throttles per *pattern* per generation. One pattern today → one ERROR per generation. Per-channel → one per channel: 3 000 stack traces for one broken handler, and a blocked stderr back-pressures the read loop into missing its liveness window. | **Accepted.** FR-014: the throttle key becomes the generation. |
| M4 | `#activate` re-arms the keepalive, so **every watch resets the keepalive clock**. An instance with a join more often than `keepaliveMs` never emits a `PING`, and the liveness signal stops being independent of application traffic. | **Accepted.** FR-015. |
| M5 | The join window: an async port closes the **write leg only** — `#activate` never awaits `+psubscribe`, which `#dispatch` discards. | **Accepted**; R-2 corrected, and the residual is now named rather than left open. |
| L1-L4 | `watch` collides with Redis's own `WATCH` command; the memory driver's non-role is asserted in §6 and absent from §8; `owned:<instanceId>` is an existing partial second spelling of "channels this instance hosts"; new O(hosted) memory bounds unstated. | **All accepted** — renamed to `watchChannel`/`unwatchChannel`, §8 line added, row 1 duplication column extended, §6 Scale line added. |

## 11. Security audit

**Verdict: `fail` — 0 CRITICAL, 3 HIGH, 3 MEDIUM, 1 LOW.** Kept separate from
§10 deliberately: the two answer different questions.

**The headline is a clearance, and it is stronger than what this plan claimed.**
#288's nested-prefix isolation is **not** weakened. The audit proved it
positionally rather than by charset: every subscribe pattern's literal head is
`${prefix}__event:`, and for accepted prefixes `P ≠ Q` no topic `Q__event:C`
can begin with `P__event:` — by case analysis on `|Q|` against `|P|`, with the
`__` refusal in `assertUsablePrefix` closing every branch. **This holds even if
the channel contains `*`**, because the glob sits entirely right of the literal
head. An exact-topic subscribe is strictly narrower than the glob, and cannot
reach this deployment's own control topic either (`__event:` vs `__control`
diverge at `e`/`c`), so FR-007 holds. **The charset gap below is therefore not
an isolation bug and must not be fixed as one.**

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 (HIGH) | `watchChannel` puts a channel name into a **PSUBSCRIBE pattern context for the first time**, and **nothing on `ChannelManager.subscribe`'s path calls `isValidName`** — the only channel validation in the package is `decodeClientMessage`, which guards the WebSocket wire, not the public API. An application doing `manager.subscribe(conn, \`chat:${userInput}\`)` registers `*a*a*a…` as a live Redis pattern; Redis matches every pattern against every PUBLISH single-threaded and **broker-wide**, which the prefix explicitly does not isolate (CWE-1333, CVE-2022-36021). A plain `*` silently restores the firehose and defeats SC-001 with nothing in the log. | **Accepted — the plan's §5 row 6 named a control that does not exist on this path.** FR-016: the driver refuses a channel failing `isValidName`, at the boundary, same shape as `assertUsablePrefix`. Note the precedent: that docstring hardened the prefix because it "reaches PSUBSCRIBE at two pattern contexts" while assuming the channel never does. **This feature is what breaks that assumption**, so the assumption is discharged here. |
| S2 (HIGH) | The subscribed-pattern set becomes **unbounded and client-driven**: `channelKind` returns `public` unless the name starts with `presence-`/`private-`, and `subscribe` runs **no authorizer for public channels**. No cap exists in `websocket.ts`, `manager.ts` or the driver. Three effects: broker-wide match cost; reconnect becomes all-or-nothing over N patterns, and a failed re-issue leaves the **control topic** unsubscribed too; and #271/#308's revocation fast path fires only after all N writes, so eviction latency after an outage grows with N. | **Accepted.** FR-017 (per-connection and per-instance caps, refused loudly, matching `ConnectionIdError`'s precedent) and SC-007 (a full re-issue proven at realistic N, not N=2). |
| S3 (HIGH) | **#288's own isolation suite is structurally coupled to the glob shape.** `SC-002` derives `eventPatterns = myPatterns.filter(p => p.endsWith('*'))`; under exact-topic subscribes that becomes **empty**, the loop body never runs, and `ownControl` binds to an event topic. **The test passes having stopped checking anything** — and it is the test for the property whose failure routes a control frame to `onMessage`, where the MAC check is not. The suite's header already records five prior green-for-the-wrong-reason mutations; this would be the sixth. | **Accepted.** FR-018 + a decision row: the suite identifies the control subscription by **equality with `controlTopic`**, never `!endsWith('*')`, and event subscriptions by the `eventTopicPrefix` head. |
| S4 (MED) | The natural `watchChannel` implementation closes over `channel` and drops `onMessage`'s `topic.startsWith(marker)` check and fixed-offset slice — **and it will look correct**. That check is what makes a mis-derived pattern non-exploitable, since `deliverLocal` re-keys on the topic-derived channel. Combined with S1 it becomes a real cross-channel delivery leak. | **Accepted.** FR-019: the channel a frame is attributed to comes from the **delivered topic** and nowhere else; a `watch` closure must not carry the channel into delivery. |
| S5 (MED) | The 1→0 transition is **not atomic with the wire operation**. `unsubscribe` does `set.delete(id)` then awaits `roster.removeMember`; a new client joining during that await takes 0→1 (a wire no-op, the pattern still exists), then the suspended continuation fires `unwatch` — unwatching a channel with a live authorized subscriber. Silent, and **permanent**: FR-005 removes it from the re-issue set, so the reconnect that heals every other deafness is guaranteed not to heal this. | **Accepted, and it reshapes FR-003 from a transition requirement into an atomicity one.** FR-020 + SC-008. |
| S6 (MED) | The join window converts "cannot be missed at join" into "can be missed at join" for application-carried security signals, widened by backoff to `retryMaxMs` (30s) during a fault. Nothing security-relevant travels EVENT topics at framework level — `evict`/`presence-*` are all CONTROL, MAC-signed, unconditionally subscribed, and rosters are read authoritatively from Redis — so this is correctness, not confidentiality. | **Accepted.** Documented as a guarantee change; the awaitable-`watch` question goes to the user (§12 Q2) because it is **port-breaking later**. |
| S7 (LOW) | The plan cites decisions **D-1 and D-5 three times and neither exists.** | **Accepted — my defect.** Both now written below. |

### Decisions the plan referenced and did not contain

- **D-1 — the ref count is `set.size`, not a new field.** The manager already
  holds `subscriptions: Map<channel, Set<clientId>>`; a second counter would be
  a second spelling of hosting. **Amended by H1/S5**: the transition is read
  from the mutation's own result in a synchronous turn, and the empty `Set` is
  deleted so `has()` is the single spelling of "not hosted".
- **D-5 — a subscriber without `punsubscribe` does NOT get per-channel
  subscribe.** It falls back to today's single prefix-wide glob. "Watch without
  unwatch" is rejected **explicitly**: it would make the pattern set monotonic
  over the process lifetime — every channel ever hosted, re-issued on every
  reconnect — which is strictly worse than the behaviour it replaces, and
  invisible because delivery stays correct.

## 12. Open questions

### Q1 — sequencing, given the CRITICAL. **ANSWERED 2026-09-07: park behind #298.**

The CRITICAL requires changing `psubscribe`'s contract, and the correct shape
for that change (a per-generation "confirmed issued" record) is a **fourth**
member of the group #298 exists to consolidate. Building it here would be the
fifth repetition of the pattern #298 was filed to stop.

**Decision: #295 does not proceed. It is gated on #298**, which itself needs a
`/specnaut plan` re-entry (its banked plan failed both audits and its section 12
still reads `_pending the stop_`). The subscriber gets consolidated once, rather
than growing a fourth parallel field and then being consolidated.

**Nothing is left exposed by parking.** Both HIGH security findings (S1's
pattern-context charset gap, S3's vacuous test migration) are hazards this
feature would **introduce**; neither is live today, because no channel name
currently reaches a `PSUBSCRIBE` pattern context. Parking costs the fan-out win
and nothing else.

### Q2 — is `watchChannel` awaitable? **DEFERRED with Q1, and it must be
answered before any code.**

It is the one decision that becomes **port-breaking later**: adding a return
promise after `watchChannel?()` ships means changing `BroadcastDriver`,
`subscribe`'s contract and every driver. An async port closes the **write leg
only** — `#activate` never awaits `+psubscribe`, which `#dispatch` discards — so
the answer also has to name the residual rather than imply the window is closed.

### Q3 — the two breaking constraints. **DEFERRED with Q1.**

FR-016 (channel charset at the watch boundary) and FR-017 (watched-channel caps)
are both cheap now and **breaking once deployments have live channels that
violate them** — the argument `PREFIX_RE`'s own docstring makes about itself:
"one line to add before any operator had a prefix in production config, and a
breaking configuration change with no migration afterwards".
