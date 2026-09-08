# Plan: per-channel subscribe

**Feature dir:** `.specnaut/specs/253-per-channel-subscribe`
**Branch:** `253-per-channel-subscribe`
**Linked issue:** [#295](https://github.com/locknessland/lockness-monorepo/issues/295)
**Status:** plan — **re-entry 2026-09-08**, stop 1 passed; Q1/Q2/Q3 all answered

> **Re-entry note.** The banked plan below failed both audits on 2026-09-07 and
> every finding was folded into a requirement — but the amended plan was never
> re-audited, and three of its requirements have since been **overtaken by code
> that shipped**. This pass corrects the plan against today's tree first, then
> re-runs both audits on the corrected document. What changed:
>
> | Was | Is now |
> | :--- | :--- |
> | FR-009's "confirmed issued" record was a shape to be designed | Designed and priced against the `SocketGeneration` type #298 shipped — FR-009 + FR-021 |
> | FR-016 — the driver refuses an out-of-charset channel | **Satisfied by #314**; re-adding it would be a second decider. Replaced by FR-022, which records the dependency |
> | S1 (HIGH) — nothing on `subscribe`'s path calls `isValidName` | **False today.** `#assertUsableChannel` is `subscribe`'s second statement |
> | Q3 — two breaking constraints | **One.** The charset half shipped as #314; only the caps remain |
>
> **The re-audit then failed the corrected plan too, and that is the useful
> result.** Architecture returned 2 CRITICAL / 5 HIGH / 5 MEDIUM / 4 LOW,
> security 0 / 1 / 3 / 2 — with both struck HIGHs verified correctly struck.
> The two CRITICALs are defects in the design written *on re-entry*, and the
> finding that explains how they survived is **M3**: eight of the 2026-09-07
> remediations were recorded as `Accepted` in §10's table and never applied to
> the requirements. All eight are applied now. Everything in §3, §4 and §5 above
> this line reflects both re-audits.

---

## 1. Why this exists

`RedisBroadcastDriver.onMessage` pattern-subscribes `${prefix}__event:*`
(`drivers/redis.ts:955-958`), so **every instance receives every channel's
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

- **FR-001** The `RedisSubscriber` port exposes an **optional** unsubscribe
  seam, and an **optional single-pattern subscribe seam returning
  `void | Promise<void>`** — the one FR-009 needs anyway. The existing
  `psubscribe(pattern, handler): void` keeps its contract untouched, so Q2's
  "no second port break later" argument stays true and none of the 9
  `RedisSubscriber` implementations breaks: both members are new and optional,
  so only the production connection and the doubles SC-014 already touches gain
  them. **Without this, FR-002's awaited guarantee has nothing beneath it** —
  today's `psubscribe` fires `void this.#connectAndSubscribe()`
  (`subscriber.ts:498-503`) and returns in the same tick, so an
  `async watchChannel()` wrapping it would resolve having awaited nothing while
  its JSDoc claimed the frame was on the wire.

  **The seam REJECTS when the write does not reach the socket, and still
  schedules the retry.** This is the half the first draft omitted, and without
  it the whole await is decorative: `#activate` catches everything, logs at
  WARN, discards the socket, schedules a retry and **returns normally**
  (`subscriber.ts:753-757` documents the never-throw contract, `:859` is the
  catch that honours it). A `subscribeOne` that simply returns `#activate([p])`
  therefore resolves with nothing on the wire.

  **`#activate`'s never-throw contract is unchanged, and that is why this is
  safe**: its two existing callers — the synchronous `psubscribe` and the retry
  timer — have **no caller to reject to**, which is the reason the contract
  exists. A seam whose caller is awaiting is a different case. The never-deaf
  property (#275) is preserved either way, because the retry is scheduled
  before the rejection.
- **FR-002** `BroadcastDriver` exposes optional per-channel `watchChannel` /
  `unwatchChannel` hooks; a driver that omits them keeps today's behaviour.
  **Both return `void | Promise<void>` and `ChannelManager.subscribe` awaits
  `watchChannel`** (decided 2026-09-08, §12 Q2), backed by FR-001's awaitable
  subscriber seam. The awaited guarantee is exactly *"the `PSUBSCRIBE` frame is
  on the wire"* — never *"delivery has started"*, which `#activate` does not
  promise (`subscriber.ts:830`).

  **The residual is not "one broker RTT", and the JSDoc must not say it is.**
  Every frame crosses one serialized per-generation write chain
  (`subscriber.ts:614-622`), so under the burst FR-009 exists to handle, the
  k-th concurrent join resolves after k writes; on a reconnect at the 1 000 cap
  the last join waits behind the full re-issue plus its 999 peers. The stated
  residual is therefore **one RTT plus the queue depth ahead of the frame,
  bounded by FR-017a's cap** — and on the presence path it is paid *before*
  `roster.addMember` and `publishControl` (`manager.ts:449-459`). Recorded in
  §9 beside R-2, not only here.

  **And the guarantee has a failure leg, stated rather than assumed.** It is
  *"the frame is on the wire, **or the caller was told it is not**"* — never
  "the frame is on the wire" alone, which is the false docstring an unqualified
  await would have shipped.

  `ChannelManager.subscribe` catches the rejection, **keeps the membership**,
  logs one WARN naming the channel, and answers `{ ok: true }`. All three are
  deliberate:

  - **Keeping the membership** is what makes the answer true: the pattern is
    recorded in `patterns`, so the scheduled retry re-issues it and delivery
    resumes. Dropping it turns a transient write failure into permanent local
    deafness — the defect #275 removed.
  - **`{ ok: true }`**, because the join succeeded and delivery resumes. The
    window is then the retry backoff, which §11 S6 already accepts and
    documents as a guarantee change. `{ ok: false }` would make a transient
    write failure indistinguishable from an authorization denial — the same
    argument FR-017 makes for `ChannelLimitError`.
  - **The WARN** is the only reason propagating the rejection is worth
    anything: without it the awaited port buys nothing on the path where it
    matters.

  **This is a new `catch`, and §7's row is corrected for it.**
- **FR-003** `ChannelManager` calls `watchChannel(channel)` when a channel's
  local subscriber set goes 0→1 and `unwatchChannel(channel)` when it goes 1→0,
  and at no other time.
- **FR-004** `RedisBroadcastDriver.onMessage` registers the handler **without
  subscribing anything** — but only when the injected subscriber is per-channel
  capable (FR-025). Absent that, `onMessage` keeps today's prefix-wide
  `PSUBSCRIBE` and no `watchChannel` ever fires. `watchChannel` **throws** when
  no handler has been registered: FR-004 makes "subscribed with no handler"
  reachable where it is structurally impossible today, and the manager calling
  `onMessage` first (`manager.ts:202`) is an ordering, not a contract.
- **FR-005** An unwatched channel is removed from the subscriber's re-issue set
  (`patterns`) **and from the live generation's record — both halves of it**,
  via the single `retire(pattern)` of FR-009. **Both removals are written when
  the `PUNSUBSCRIBE` is enqueued**, never at its acknowledgement.

  **The asymmetry is between writes and erasures, not between the two sets: a
  write to the record is acknowledged, an erasure is enqueued.** Both erasures
  land at the same moment, and the rule is one sentence — which is what makes
  it checkable.

  Three failure modes, all silent, all closed by that one rule:

  1. **Erasing only `issued`.** The channel is still claimed in `pending`, the
     re-watch computes its delta and skips it, and the socket is deaf for its
     lifetime while `subscribe` answers `{ ok: true }`. The burst path
     `pending` exists for is *precisely* the path that fills it — so a `pending`
     the retire does not clear makes the C2 remedy manufacture the C1 defect.
  2. **A late acknowledgement.** Redis answers in order, so the `+psubscribe`
     for a pre-unwatch subscribe lands *after* the retire. `confirm` therefore
     **drops an acknowledgement whose claim is gone** (FR-009). Without that,
     the ack re-adds the pattern against a broker that no longer holds the
     subscription.
  3. **Erasing `patterns` at the acknowledgement.** A channel re-watched inside
     the `PUNSUBSCRIBE` round trip has its handler deleted by the arriving ack:
     subscribed on the broker, no handler recorded, every frame discarded,
     `{ ok: true }`, nothing logged. Enqueue-timed instead costs at worst a
     stale broker-side subscription the next socket drops — a bounded waste
     rather than silent loss.

  watch → unwatch → watch is the commonest lifecycle a chat deployment has, and
  every route above reaches it.
- **FR-006** Every derived topic remains anchored under the reserved
  `__`-separator scheme (#288). No new topic shape is introduced.
- **FR-007** The control topic's subscription is unchanged and unconditional.
- **FR-008** A watch for an already-watched channel is a no-op **on the wire**.
  *Unsatisfiable against today's `psubscribe` — see FR-009.*
- **FR-009** `psubscribe` gains a way to issue **one** pattern rather than
  re-issuing the recorded set, and the record that makes the difference
  computable carries **two states, not one**.

  The naive delta (`#activate([pattern])`) reintroduces #245 — a transient blip
  over a single-flight dial left one of two patterns recorded-but-never-
  subscribed and the instance permanently deaf on the control topic. The record
  is therefore per-generation, so a socket change drops it and the full set is
  re-issued. #298 shipped `SocketGeneration` and its FR-013 priced the member
  against the shipped type:

  **The two sets are private behind four verbs — three writers and the one
  reader** — not two public `Set`s
  written from three call sites. Nothing reads a whole set — only the delta —
  so encapsulating costs nothing, and it is what lets FR-005's retire rule be
  stated once instead of at every writer:

  ```ts
  class SocketGeneration {
      readonly conn: Deno.Conn
      #writeChain: Promise<void> = Promise.resolve()
      #keepaliveTimer: ReturnType<typeof setInterval> | undefined
  +   #pending = new Set<string>()  // frame on this socket's write chain
  +   #issued = new Set<string>()   // broker ACKNOWLEDGED on this socket
  +
  +   /** A PSUBSCRIBE for `p` is going on the wire. Before the first await. */
  +   claim(p: string): void { this.#pending.add(p) }
  +   /** A `+psubscribe` landed. A retired claim makes the ack STALE (FR-005). */
  +   confirm(p: string): void {
  +       if (!this.#pending.delete(p)) return
  +       this.#issued.add(p)
  +   }
  +   /** A PUNSUBSCRIBE is going on the wire: erase the claim AND the fact. */
  +   retire(p: string): void {
  +       this.#pending.delete(p)
  +       this.#issued.delete(p)
  +   }
  +   /** Already on this socket — claimed or confirmed. */
  +   has(p: string): boolean {
  +       return this.#pending.has(p) || this.#issued.has(p)
  +   }
  }
  ```

  **`#activate` issues every recorded pattern for which `gen.has(p)` is false.**

  **The mutation and its frame's enqueue are ONE SYNCHRONOUS TURN.** This is
  FR-020's twin, on the side where the write chain makes the ordering
  observable — and it is strictly stronger than "before the first await", which
  is what this requirement first said and which is not enough:

  > `claim(p)`, the `patterns.has(p)` re-read that precedes it, and **that
  > pattern's** enqueue are one synchronous turn. So are `retire(p)`,
  > `patterns.delete(p)` and the `PUNSUBSCRIBE` enqueue. Nothing awaits between
  > them.

  Why, in one sentence: **the record and the write chain agree only if every
  mutation is co-turn with its frame's enqueue** — that is the entire
  correctness argument for the two sets. An `await` slipped between `claim(p)`
  and the enqueue lets an unwatch put `PUNSUBSCRIBE` on the chain **first**,
  leaving the broker subscribed, `has(p)` false and `patterns` empty: a live
  subscription with no handler for the life of the socket, frames discarded,
  nothing logged. FR-013's re-read does **not** rescue it — that re-read is
  upstream of the claim.

  Note "**that pattern's** enqueue", not the loop's: a bulk claim taken ahead
  of the whole loop makes every `gen.has(p)` true, and `#activate` issues
  nothing at all.

  **One state is not enough, and the reason survives FR-002's await.** A
  confirmation-only record is empty for every join in a batch, so watch #k
  issues k patterns and Σk = **N(N+1)/2** — the original CRITICAL's arithmetic,
  unchanged, on the exact path §11 S2 flags as unauthenticated and unbounded.

  **What forms the batch is the caller's concurrency, not the absence of an
  await.** The first draft of this argument said `ChannelManager.subscribe` has
  no await at all on the public path — true of the code as it stands
  (`manager.ts:404-464`) and **made false by FR-002 in this same section**. The
  conclusion is unchanged; the premise is now stated correctly. A burst forms
  whenever the WebSocket layer handles frames concurrently rather than strictly
  one at a time, which it does. `claim` closes the window — and SC-005 has to
  name the construction that reaches it, because a criterion written as
  `for (…) await subscribe(…)` serialises, counts N frames, passes, and never
  enters the state this requirement exists to bound.

  **`issued` is still `acknowledged`, never `written`, and that is the half
  #245 is about.** An activation awaits only that its `PSUBSCRIBE` reached the
  socket, never that the broker answered (`subscriber.ts:830`, and #309's
  shipped contract). So `issued` is written in `#dispatch`, which today
  **discards** the acknowledgement at its `reply.value.length !== 4` guard
  (`subscriber.ts:1079`). Recognising it is the one new branch.

  **The acknowledgement is an array push frame, not a simple string.** It is
  `[bulk "psubscribe", bulk <pattern>, integer <count>]` — three elements.
  Writing `reply.type === 'simple'` produces a branch that never fires.
  `punsubscribe` acknowledgements share the shape and matter for FR-005.

  **One residual, stated rather than implied.** A frame that reaches the socket
  and is never acknowledged while the socket stays live stays `pending`
  forever. Bounded in practice — Redis answers `PSUBSCRIBE` in order, and a
  lost reply is a RESP desync `readReply` raises as `RespFramingError`, which
  discards the socket and drops the generation — but named here, because
  FR-009's whole case against a write-time record is this failure mode and
  `pending` re-admits a narrower version of it.
- **FR-010** A reconnect re-issues the full set; an ordinary watch issues the
  delta. Two decisions sharing one method today (`#activate`, called from
  `subscriber.ts:582` and `:1008`, both passing `[...patterns.keys()]`). The
  two log lines that carry a count are **not the same line and must not get the
  same rule**:

  - `subscriber.ts:917` (`#reportRecovery`, *"N subscription(s) re-issued"*)
    reports what **this activation actually put on the wire** — the delta's
    length. Not `patterns.size`, which over-reports an outage that ends; and
    **not** the generation's issued size, which FR-009 defines as
    *acknowledged* and which is driven by acks that may not have landed.
  - `subscriber.ts:998` is the retry **scheduling** line, fired at the fault,
    before any generation exists, forecasting what the retry will attempt. The
    whole recorded set *is* what will be attempted, so `patterns.size` is
    already correct there. **Exempt, and this records why** — an earlier draft
    of this requirement would have degraded a correct line.
- **FR-011** "Not hosted" has ONE representation: the transition pair deletes
  the map entry when the set empties, so `subscriptions.has(channel)` is the
  single spelling.
- **FR-012** One `#joinLocal` / `#leaveLocal` pair owns the transition and is
  called from every membership mutation; the hooks fire there and nowhere else.
  The sites it must funnel are `manager.ts:432` (map create), `:444` (presence
  add), `:463` (public/private add) and `:507` (delete), plus FR-011's new
  delete-on-empty.
- **FR-013** `#activate` re-reads `patterns.has(pattern)` **and the
  generation's `pending`/`issued` state** inside its loop rather than trusting
  the snapshot taken before the awaits. Both races are the same race:
  `#dispatch` can add to `issued` during those same awaits
  (`subscriber.ts:785`).
- **FR-014** `#handlerFaults` throttles **once per socket generation** rather
  than once per pattern — one broken handler on 3 000 channels must not produce
  3 000 stack traces, whose blocked stderr back-pressures the read loop past
  its liveness window. **The map stays a class field**: `SocketGeneration`'s
  membership note (`subscriber.ts:199-205`) records that it is reached from a
  deferred `.catch` that can run once the generation is already gone, and
  keying on a live generation *object* would retain a discarded `Deno.Conn`.
  **Attribution is preserved** — the per-pattern tally is emitted at
  `#discardSocket`'s clear (`subscriber.ts:637`), so suppression bounds the
  volume without hiding which handlers failed.
- **FR-015** The keepalive is armed on a generation change, not on every
  activation. Today `#activate` calls `#armKeepalive` unconditionally
  (`subscriber.ts:843`), so **every watch resets the keepalive clock**: an
  instance with a join more often than `keepaliveMs` never emits a `PING`, and
  the liveness signal stops being independent of application traffic.
- ~~**FR-016** The driver refuses a channel failing `isValidName` at the
  `watchChannel` boundary — the value reaches a PSUBSCRIBE **pattern**
  context.~~ **Satisfied by #314, shipped 2026-09-07 — do not re-add, and do
  not re-derive.** `ChannelManager.subscribe` calls `#assertUsableChannel`
  before `channelKind` (`manager.ts:409-410`) and before the awaited authorizer
  (`:418`), raising `ChannelNameError` when `isValidName` fails. `NAME_RE` —
  `/^[A-Za-z0-9:._-]+$/` at `protocol.ts:48` — excludes every Redis glob
  metacharacter (`*`, `?`, `[`, `]`, `\`, `^`), so a validated channel name is
  a glob-inert literal and the exact-topic subscribe is safe by construction.
  **Both audits verified the strike independently** rather than accepting it,
  including an enumeration of every path to a watch. A second refusal at the
  `watchChannel` boundary would push a domain rule outward into the adapter and
  create the second decider §5 row 6 forbids. Kept visible rather than deleted,
  on the same reasoning as FR-018.
- **FR-017** A per-instance watched-channel cap of **1 000** and a
  per-connection cap of **100** (decided 2026-09-08, §12 Q3), both refused
  **loudly** at `ChannelManager.subscribe` before `set.add`. Refusal is a new exported `ChannelLimitError` **thrown**,
  matching `ConnectionIdError`'s precedent — not `{ ok: false }`, which would
  make resource exhaustion indistinguishable from an authorization denial in
  every application's client code. `subscribe`'s own docstring
  (`manager.ts:390-393`) draws that line: a denied subscribe answers
  `{ ok: false }`, a caller bug throws; a cap breach is neither, and the
  exported error type is how it stops being neither.

  **The per-connection count needs a structure that does not exist, and D-1
  currently forbids it** — see D-1's amendment below. `subscriptions` is
  `Map<channel, Set<clientId>>`, so counting one connection's channels is an
  O(channels) scan; the reverse index `Map<clientId, Set<channel>>` is
  maintained in the same `#joinLocal`/`#leaveLocal` pair as FR-012, at no extra
  call site.

  **Its home is decided** — see §12 Q3, and §5 row 14. Nothing about FR-017 is
  open any more.
- **FR-017a** The per-instance cap is the stated upper bound on the reconnect
  re-issue length (`subscriber.ts:784-786`), and therefore on the post-outage
  revocation delay (R-8). **SC-007's "realistic N" is that cap** — 1 000 — not
  an independently chosen figure, or the criterion and the requirement can both
  pass at two different numbers.
- **FR-017b** The caps land over **two releases**: the first WARNs on breach,
  naming the connection or instance and its **actual count**, and admits the
  subscribe; the next refuses. Nobody breaks on upgrade, and an operator learns
  their real number before it costs them anything — nothing in the framework
  measures channels-per-instance today, so no one can currently answer whether
  1 000 is generous or tight. The WARN carries a stable prefix an alert can
  match, and the requirement includes **removing** it in the refusing release:
  a deprecation shim nobody deletes is how a two-release plan becomes a
  permanent one. **The removal is an artefact, not a promise**: filing the
  issue that deletes the WARN is a task of the WARN release itself, referenced
  from here the way #321 is referenced from FR-021 — otherwise this requirement
  reproduces the defect it names.

  **`@lockness/deprecation-contracts` was considered and not used.** Its strict
  mode *is* a WARN-then-refuse flip and its collector is exactly how a shim
  stops being forgotten. It is declined on two grounds, recorded rather than
  left implicit: an operational limit breach and an API deprecation answer to
  different owners and change for different reasons, and reuse would add a
  `realtime → deprecation-contracts` edge to the dependency graph for one
  boolean.
- ~~**FR-018** `prefix_anchoring.test.ts` identifies the control subscription by
  equality with `controlTopic` and event subscriptions by the
  `eventTopicPrefix` head — never by `endsWith('*')`.~~ **Satisfied by #315,
  shipped 2026-09-07 (`c5baf3b9`) — do not re-derive.** `controlSubscription`
  binds by equality with `${prefix}__control`, `eventSubscriptions` by the
  `${prefix}__event:` head, and `splitSubscriptions` additionally pins that the
  two families account for every recorded subscription. Proven by
  `tests/mutations/subscription_identity_315.ts`: both rows KILLED, each
  attributed to `SC-002`, and both MISATTRIBUTED against the pre-#315 file.
  **Re-verified on re-entry**: `app__event:alpha` still satisfies the head
  test and N event subscriptions still satisfy the completeness assertion, so
  the suite stays meaningful under exact-topic subscribes rather than vacuous.
- **FR-019** The channel a received frame is attributed to is derived from the
  **delivered topic** and nowhere else, including under per-channel subscribe.
  `onMessage`'s deny-by-default `topic.startsWith(marker)` and fixed-offset
  slice (`drivers/redis.ts:963-978`) are what make a mis-derived pattern
  non-exploitable, since `deliverLocal` re-keys on the topic-derived channel. A
  `watchChannel` closure must not capture `channel` and pass it to the handler
  — which is the shape an implementer reaches for, because `channel` is right
  there in scope, and which turns that check into dead code a later tidy-up
  removes with a clean conscience.
- **FR-020** The transition test and its hook run in the **same synchronous
  turn** as the set mutation — no `await` between them.
- **FR-021** The generation is **threaded** into the write site —
  `#readLoop(conn, gen)` → `#dispatch(reply, gen)` → **`gen.confirm(p)`** — and
  never re-read from `this.#generation` there. The arrow ends at `confirm`, not
  at a bare `issued.add`: FR-009 made the sets private precisely because an
  unconditional add re-records a **retired** pattern on a late acknowledgement,
  which is FR-005's failure mode #2 and puts the socket back to deaf. **Binding, not stylistic.** On
  this route the object in hand *is* the generation the frame arrived on, so it
  costs no new `=== conn` predicate. Reaching through `this.#generation`
  instead lets a discard landing inside `readReply` record a pattern on a
  generation that never confirmed it — #245 again — and correctness then
  demands `if (this.#generation?.conn === conn)` plus a `conn` parameter.

  **The precondition this requirement first claimed was false, and the
  correction is load-bearing.** It cited #298's FR-002 — *"`#activate` binds
  the generation it constructed to a `const` and never re-reads
  `this.#generation` after an await"*, called there *"the single condition
  under which zero new identity predicates is true rather than aspirational"*.
  **That half of #298's FR-002 did not ship.** `#activate` binds no generation
  local — `subscriber.ts:782` assigns the field, inside the `:780-783` block —
  and it *does* re-read the field after the awaited writes, via
  `#armKeepalive(conn)` at `:843`, whose body reads `this.#generation` at
  `:689`. **Filed as [#321](https://github.com/locknessland/lockness-monorepo/issues/321)**
  (P2/S); not fixed here.

  So the route costs **one local**: `#activate` binds `const gen =
  this.#generation` at the construction site (`subscriber.ts:780-783`) and
  passes it to `#armKeepalive` at `:843` — **not `:841`, which is
  `this.loopDone = this.#readLoop(conn)`**. The audit gave that citation wrong
  and it is corrected here rather than carried. Its staleness is excluded by the existing
  `this.conn.socket !== conn` guard at `:837`, and that guard is sufficient
  **only because** `AuthenticatedConnection.discard` closes the socket and
  nulls `connection` in one synchronous call (`connection.ts:516-522`). That is
  an **intra-package** dependency — `connection.ts` and `subscriber.ts` are
  adjacent files in `@lockness/redis` — not R-7's cross-package class; calling
  it cross-package overstated the risk and mis-located the mitigation, which by
  H3's own doctrine belongs **at `discard`**. FR-022's list gains it as a third
  site.

  **And `:837` is knowingly untested.** Its own comment says so — *"DEFENSIVE
  AND UNTESTED, deliberately… two attempts to pin it went green for the wrong
  reason and were removed"*. This requirement promotes it to the sole staleness
  exclusion for a new correctness property, and adds **no** criterion, because
  the two attempts that were removed are evidence that a witness here is likely
  to be green for the wrong reason. That is a deliberate acceptance, recorded so
  a reader finds it here rather than discovering the file's comment later.

  Passing the local to `#armKeepalive` too retires the predicate
  at `:690`, which makes the predicate count **net-negative** rather than
  merely neutral.
- **FR-022** The exact-topic subscribe is glob-safe only because
  `#assertUsableChannel` runs on `subscribe`'s path (FR-016). **The dependency
  is recorded where the breaking change is made, not where the dependent code
  lives** — three places:

  1. `protocol.ts` — beside `NAME_RE` (`:48`) and in `isValidName`'s JSDoc:
     widening this charset makes every channel name a live Redis pattern,
     broker-wide.
  2. `manager.ts` — in `#assertUsableChannel`'s docstring (`:353`): the Redis
     driver depends on this running before `subscribe` reaches it. The
     precedent is one method over — `#assertUsableMemberId`'s docstring
     (`:294-297`) already cites its enforcement point both ways.
  3. `drivers/redis.ts` — the `watchChannel` docstring, citing both.
  4. `packages/redis/connection.ts` — at `discard` (`:516-522`), stating that
     `#activate`'s generation local (FR-021) depends on the `close()` and the
     null being **one synchronous step**. Same doctrine, different dependency:
     record it where the breaking change would be made.

  Recording it **only** at the `watchChannel` docstring, as this requirement
  first did, reaches a reviewer in the one file the breaking change never
  opens.

  **The invariant is narrower and stronger than "the assertion runs".** What
  makes `watchChannel` unreachable with an unvalidated name is that
  `manager.ts:431-432` is the **single construction site** of a `subscriptions`
  entry. A future warm-start, roster-driven pre-subscribe or promoted test
  helper that seeds the map satisfies "the assertion runs on `subscribe`" and
  still defeats this.

  **The removal leg is guarded differently, and that is not an oversight.**
  `unsubscribe` is deliberately not channel-asserted (`manager.ts:499-505` —
  *"creation is guarded, cleanup is total"*), so `unwatchChannel` can receive a
  name the assertion never saw. It is safe because it is reachable only from a
  key already in `subscriptions`, never from a caller-supplied string, and
  because `PUNSUBSCRIBE` matches its argument by literal string equality rather
  than glob. An implementation that calls `unwatchChannel(channel)` before
  confirming the map entry existed breaks this. #314's "cleanup is total"
  comment is amended to say cleanup is now also a **wire** operation.
- **FR-023** A reconnect issues the **control topic first**, ahead of every
  event topic, and `#fireReconnect` fires once the control topic's write has
  landed rather than after the full re-issue.

  Two seats reached this from opposite ends and it is one requirement.
  `#activate`'s re-issue is a sequential awaited loop (`subscriber.ts:784-786`)
  and the seam fires strictly after all of it (`:859`, deliberately — a
  reconnect whose `PSUBSCRIBE` never landed must not be reported as one). At
  N=2 the ordering is free. At N=3 000 the framework's **only** revocation fast
  path (#271/#308, `drivers/redis.ts:1349`) sits behind 3 000 serialized
  writes. Event delivery resuming late is a latency cost; enforcement resuming
  late is a security one.

  **And a partial re-issue must not decide the control topic's fate by
  accident.** A throw at write *k* skips *k..N*. Which subscription survives is
  currently settled by `patterns` Map insertion order, which is settled by
  `ChannelManager`'s constructor calling `onMessage` (`manager.ts:202`) before
  `onControl` (`:205`) — so **today** the event glob is inserted first and the
  control topic is the one lost, and **after FR-004** the order silently
  inverts because `onMessage` no longer subscribes. Either way it is an
  ordering no requirement states and no test pins, and the failure mode is
  control-plane deafness — the one thing FR-007 exists to prevent.
- **FR-024** The live suite's readiness gate stops depending on an event-topic
  probe. `awaitSubscribers` (`tests/live_realtime.ts:432`) publishes to
  `probeTopic` = `${prefix}__event:probe-ready` and waits for the receiver
  count to reach N — a channel **no instance hosts** once subscriptions are
  per-channel. The count stays 0 and all **ten** of its callers in
  `redis_broker_integration.test.ts` time out at 10 s; the helper's own
  docstring predicts exactly that symptom.

  **Only the event half changes, and that is the whole requirement.** The gate
  already publishes to *both* `probeTopic` and `controlTopic` and requires
  both counts (`events >= count && control >= count`). The control half stays
  **byte-identical**, including its deliberately unsigned probe: that probe is
  dropped by `#verifyAndDecode`, and its expected
  `realtime: dropped a control message of invalid shape` line is documented as
  live evidence that the FR-015 MAC check runs against a real broker. A rewrite
  that "modernises" it retires that evidence silently.

  The event half is replaced by a probe on a channel the instance has
  **demonstrably watched**, published after the watch resolves — which FR-002's
  await now makes expressible. It must not simply be deleted: it is the only
  assertion in the harness that any event subscription exists at all, which is
  exactly what this feature changes.

  **This is load-bearing for the feature's own proof**: SC-002, SC-007 and the
  issue's third acceptance criterion all require a live broker.
- **FR-025** Per-channel capability is detected **as a set**, once, never
  member by member. The precedent is `presenceRoster` (`manager.ts:112-120`),
  documented as *"the single feature-detect guard… rather than repeating
  `if (driver.addMember)` per call site"*. A subscriber offering `psubscribe`
  without `punsubscribe` accumulates one permanent subscription per channel
  ever hosted — strictly worse than the behaviour it replaces and invisible,
  because delivery stays correct (D-5).

## 4. Success criteria

- **SC-001** For an instance hosting a strict subset of the prefix's channels, a
  publish to a non-hosted channel produces **zero** frames on that instance's
  subscribe socket. Measured by the broker's own receiver count — `PUBLISH`
  returns the number of subscribers it delivered to, which is exact, needs no
  client instrumentation and cannot be satisfied by timing. `FakeRedis`
  implements the same reply (`tests/fake_redis.ts:538`), so this is measurable
  hermetically as well as live.
- **SC-002** After a forced socket fault, every still-hosted channel delivers
  again, and every dropped channel does not. Live broker.
- **SC-003** Two clients on one channel produce exactly one `PSUBSCRIBE` **per
  socket generation** and, after both leave, exactly one `PUNSUBSCRIBE`. Not
  "exactly one" absolute: FR-010 makes a reconnect re-issue legitimately, so an
  absolute count either fails on a flaky broker or is written to tolerate a
  fault — and tolerating a fault is exactly what C1 needs it not to do.
- **SC-004** The control plane's behaviour is byte-identical to today —
  same topic, same subscription, same MAC path.
- **SC-005** A **burst** of N channel joins puts **N** `PSUBSCRIBE` frames on
  the wire, not N(N+1)/2. **The construction is part of the criterion**: N
  `subscribe()` calls started without awaiting and settled together with
  `Promise.all` — never `for (…) await subscribe(…)`, which serialises, sees a
  delta of one per join, counts N frames and passes without ever entering the
  state FR-009 exists to bound. Sequential watches are the case a
  confirmation-only record already passes.
- **SC-006** After an unwatch, **zero frames arrive on the socket** for that
  channel — measured by receiver count at the broker, not at delivery, because
  a subscription with no handler delivers nothing and still costs bandwidth.
- **SC-007** A full re-issue completes at **N = 1 000** on a live broker —
  FR-017a's per-instance cap. "It works at N=2" is what is tested today.
- **SC-008** A join landing during a leave's roster round-trip leaves the
  channel watched and delivering.
- **SC-009** A `+psubscribe` acknowledgement arriving after its generation was
  discarded records nothing. The pattern is absent from the new generation's
  record, so the reconnect issues it rather than skipping it.
- **SC-010** watch → unwatch → watch of the same channel **on the same socket
  generation** delivers on the second watch. Live broker, measured at the
  socket. This is C1, and it is the commonest lifecycle the feature has.
- **SC-011** After a forced fault on an instance hosting N channels, the
  reconnect seam fires within **one** write of the re-issue starting, not N.
  Measured at realistic N on a live broker.
- **SC-012** A re-issue forced to fail at write *k* (1 < *k* ≤ N) leaves the
  control topic subscribed and delivering, and leaves exactly the channels at
  positions ≥ *k* unsubscribed until the retry converges.
- **SC-013** `isValidName` rejects every Redis glob metacharacter — `*`, `?`,
  `[`, `]`, `\`, `^` — in a test named for the dependency it protects.
  Widening `NAME_RE` turns a silent broker-wide firehose into a red test.
  Mutation-proven, the shape #315 used.
- **SC-015** A channel unwatched and re-watched **before the `+punsubscribe`
  acknowledgement lands** delivers on the re-watch. This is the window
  `retire`-at-enqueue exists for, and SC-010 does not reach it — SC-010 lets
  the unwatch settle first.
- **SC-016** A `+psubscribe` acknowledgement arriving after its pattern was
  retired **and NOT re-watched** records nothing: `has(p)` stays false and the
  next watch issues. Distinct from SC-009, which covers a *discarded
  generation*; this one is a live generation with a stale claim.
  **The construction is part of the criterion**, because SC-015's own sequence
  falsifies the unqualified version: with a re-watch outstanding, the stale ack
  consumes the **new** claim and writes `issued`. That is safe — `confirm` can
  only move a pattern from pending to issued, so it never changes what `has`
  answers, and nothing reads the distinction. Written without the construction
  this criterion goes red on correct code, and the natural repair is
  generation-stamped or counted claims: the multiplicity machinery the
  `has`-guarded single claim exists to avoid.
- **SC-017** In the WARN release, a breach of either cap emits one WARN naming
  the breached scope and its **actual count**, and admits the subscribe. In the
  refusing release, the same breach raises `ChannelLimitError` and leaves
  membership unchanged. Both are pinned, because a two-release rollout with no
  criterion on either half is how the first half becomes permanent.
- **SC-014** At least one **hermetic** test drives the per-channel branch end
  to end. Both new port members are optional, so all 14 `BroadcastDriver`
  doubles and 8 of the 9 `RedisSubscriber` doubles keep the old path by
  default, and without this the pre-completion gate exercises the branch this
  feature replaces.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Whether a channel's local membership just crossed 0→1 or 1→0 | `packages/realtime/manager.ts` — `#joinLocal` / `#leaveLocal`, the only writers of `subscriptions` | A bare `set.add` / `set.delete` at `:444`, `:463` or `:507`; a `size === 0` test written outside them; `disconnect` testing membership itself; a second counter on the connection |
| Whether this instance hosts a channel at all | `packages/realtime/manager.ts` — `subscriptions.has(channel)`, the entry deleted when its set empties (FR-011) | A `size > 0` test anywhere; a `hosted` flag on the connection; treating an empty `Set` and an absent key as different answers |
| Which topic string a channel is **published** to (literal context) | `packages/realtime/drivers/redis.ts` — `topic(channel)` | Any caller building `${prefix}__event:${channel}` inline; a test asserting the literal |
| Which topic string a channel is **subscribed** on (pattern context) | `packages/realtime/drivers/redis.ts` — a new `eventPattern(channel)` | **`watchChannel` calling `topic(channel)`** — it returns the right bytes today and silently corrupts the subscription the first time `topic()` learns to escape (`drivers/redis.ts:830-836`); `onMessage` recomputing the strip length instead of `eventTopicPrefix.length` |
| When a subscription is created or destroyed on the wire | `packages/realtime/drivers/redis.ts` — `watchChannel` / `unwatchChannel` | The manager calling `psubscribe` directly; `onMessage` subscribing anything under FR-004 |
| Which subscriptions a reconnect re-issues | `packages/redis/subscriber.ts` — the `patterns` map | The realtime driver keeping its own list to re-issue; a reconnect handler that re-subscribes |
| How many patterns ONE activation issues | `packages/redis/subscriber.ts` — `#activate`'s delta against the live generation | Each of the two callers (`:582`, `:1008`) deciding for itself; `psubscribe` calling `#activate([pattern])` |
| Which patterns THIS socket generation has issued or confirmed | `packages/redis/subscriber.ts` — `SocketGeneration`'s `claim` / `confirm` / `retire` / `has`, over two **private** sets | **A caller writing either set directly** — `confirm`'s stale-claim drop is the rule, and a bare `add` is how it goes missing; **A pending/in-flight set on `RedisSubscribeConnection` rather than on the generation** — #245's shape, and the first thing an implementer hitting the burst quadratic reaches for; the realtime driver tracking what it believes is subscribed; `#activate` trusting its `toIssue` argument as the record |
| When the reconnect seam fires relative to the re-issue | `packages/redis/subscriber.ts` — `#activate`'s ordering (control topic first) | Firing after the full loop; the realtime driver polling `listRevoked` faster to compensate |
| That the control topic is always subscribed | `packages/realtime/drivers/redis.ts` — `onControl` | `watchChannel` special-casing the control topic; the manager knowing it exists |
| Which channel a received frame is attributed to | `packages/realtime/drivers/redis.ts` — `onMessage`'s `topic.startsWith(marker)` + fixed-offset slice (`:963-978`) | A `watchChannel` closure capturing `channel` and passing it to the handler; `deliverLocal` keying on anything but the topic-derived name |
| Whether a channel name is safe to use as an exact topic | `packages/realtime/protocol.ts` — `isValidName`, **enforced at `manager.ts`'s `#assertUsableChannel` (#314)** | A glob-metacharacter check added in the driver or the subscriber; a second refusal at the `watchChannel` boundary; widening `NAME_RE` without reading FR-022; **recording the dependency only at the `watchChannel` docstring — the reviewer widening `NAME_RE` never opens that file**; **a second site that creates a `subscriptions` entry** — the 0→1 that fires `watchChannel` must be unreachable except through `manager.ts:432` |
| Whether this driver may use per-channel subscribe at all | `packages/realtime/manager.ts` — a `channelWatcher(driver)` guard beside `presenceRoster` (`:112-120`) | An `if (driver.watchChannel)` at any call site; detecting `watchChannel` and `unwatchChannel` independently rather than as a set |
| How many channels one connection / one instance may watch | `packages/realtime/manager.ts` — the cap test in `subscribe`, **before `set.add`**, counted from the `Map<clientId, Set<channel>>` maintained in `#joinLocal` / `#leaveLocal` | A per-connection cap in `websocket.ts` and a per-instance cap in the driver, disagreeing; a count derived from anything but that map; **a cap tested at `#joinLocal` instead — where the throw fires after the membership mutation** |
| What counts as proof that a subscription is LIVE | `packages/redis/subscriber.ts` — the activation contract: the **write leg** is the guarantee, the acknowledgement is what `confirm` records | A driver or a test defining its own readiness signal; a caller treating `watchChannel`'s resolution as delivery; a second poll-until-true loop beside `waitFor` |

## 6. Technical context

- **Language / runtime:** Deno, TypeScript, TC39 decorators.
- **Packages touched:** `@lockness/realtime` (manager, driver port, redis
  driver), `@lockness/redis` (subscriber). **The memory driver is NOT touched**
  — `MemoryBroadcastDriver.onMessage` (`drivers/memory.ts:49-51`) is a bare
  handler assignment with no subscription to make per-channel, so it implements
  neither hook and keeps today's behaviour by FR-002. §6 previously listed it
  among the packages touched while FR-002 said it need not change; this settles
  it in the direction the design already implied.
- **Testing:** hermetic suite + live-broker suite gated behind
  `LOCKNESS_REDIS_INTEGRATION=1`; mutation batteries under the shared harness.
- **Scale:** the win grows with (channels under prefix ÷ channels per instance).
- **Memory, the cost side:** the subscriber's `patterns` map and each
  generation's `pending`/`issued` sets become **O(channels this instance
  hosts)** where they are O(1) today, and the reconnect re-issue becomes O(N)
  sequential awaited writes. FR-017a's cap is the stated bound on all three.
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
| No silent catches | **Pass, and there IS one new catch.** `ChannelManager.subscribe` catches a rejected `watchChannel` (FR-002), keeps the membership, logs one WARN naming the channel and answers `{ ok: true }` — it fully handles, decides what the error means and logs it, which is what the rule asks. This row read *"no new catch introduced; `watch`/`unwatch` failures log at WARN"*: true before the port became awaitable, false after, **and still carrying the pre-rename spelling through three audits** — §7 was the one section the L1 rename never reached, while §10's table claimed it had. |
| SOLID / DRY / KISS / YAGNI | **Pass** — the ref count is `set.size`, not a new field (see D-1). |
| No `any` in exported APIs | **Pass**. |
| JSDoc on public APIs | **Required** — two new port members. |
| Hard rule #2 (JSR-only, declared) | **N/A** — no new dependency. |

### Complexity tracking

None. The change removes a glob rather than adding a layer.

## 8. Surface impact

- **`BroadcastDriver`** — two new **optional** members (`watchChannel?`,
  `unwatchChannel?`), taking its optional members from 9 to 11 against 2
  required.
- **`RedisSubscriber`** — one new **optional** member (`punsubscribe?`).
  Additive, same reasoning as `onReconnect?` (#271).
- **`RedisSubscribeConnection`** — one new public method.
- **`RedisSubscriber`** — a second new **optional** member (FR-001): a
  single-pattern subscribe returning `void | Promise<void>`. Existing
  `psubscribe` is untouched, so no implementation breaks.
- **`ChannelLimitError`** — a new exported error type (FR-017), raised when a
  watched-channel cap is exceeded. **Inert in the first release** (FR-017b
  WARNs), thrown in the next — exported from the start so an application can
  catch it before it can be raised.
- **`ChannelManager.subscribe` gains an awaited step.** It is already `async`
  and already returns a promise, so no caller signature changes; what changes
  is *when* it resolves on a channel this instance does not yet host.
- **The memory driver implements neither hook and is unchanged** — it has no
  broker subscription to narrow, so per-channel subscribe is a no-op for it.
- **A cap is the one user-facing behaviour change.** FR-017 refuses a
  `subscribe` that succeeds today. There is nothing to migrate, but there is
  something to announce — see §12 Q3.

**"Additive" is not the reassurance it reads as.** Because both new members are
optional, **zero** of the 23 port implementations are forced to change: 14
`BroadcastDriver` implementations (2 production, 12 doubles) and 9
`RedisSubscriber` implementations (1 production, 8 doubles). All of them would
silently take D-5's prefix-wide fallback, so the default `deno task test` would
exercise the branch this feature *replaces*, and the new path would be
reachable only behind `LOCKNESS_REDIS_INTEGRATION=1`. SC-014 is the requirement
that stops it; concretely, `tests/fake_redis.ts` and `tests/recording_ports.ts`
gain `punsubscribe`, and `driver_contract.test.ts`'s conformance driver gains
both hooks.

### Documentation (this feature)

- `docs/realtime.md` — the fan-out section: what an instance now receives.
- `packages/redis/README.md` — the new unsubscribe seam.
- `packages/realtime/AGENTS.md` — the watched-set/re-issue-set invariant.
- `packages/realtime/protocol.ts` + `packages/realtime/manager.ts` — the FR-022
  dependency, at both enforcement points, not only at the consumer.

### Test plumbing that changes shape (recorded here, not discovered in `implement`)

- `tests/live_realtime.ts` — `awaitSubscribers`'s readiness gate (FR-024). Ten
  callers in `redis_broker_integration.test.ts` depend on it.
- `tests/prefix_anchoring.test.ts` — `eventSubscriptions` asserts
  `found.length > 0` (`:573-584`). Under FR-004 a fixture that registers the
  seams and never watches now has **zero** event subscriptions and the helper
  throws. That is the right direction — loud rather than vacuous, which is what
  #315 bought — but #288's fixtures need a `watchChannel` added.

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
  **Mitigated by Q2's answer (2026-09-08): the port is awaitable**, closing the
  write leg — FR-001 puts the awaitable seam on `RedisSubscriber` so FR-002's
  guarantee has something beneath it. The residual is one broker RTT **plus the
  queue depth ahead of the frame on the generation's serialized write chain**,
  bounded by FR-017a's cap, and on the presence path it is paid before
  `roster.addMember` and `publishControl`. The "fire-and-forget by port
  contract" clause above describes the port **as it stands today**, which is
  what FR-001 changes.
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
  stop. **Satisfied 2026-09-08**: #298 shipped on branch
  `251-socket-generation-object`. `SocketGeneration` exists with exactly those
  three members, and its FR-013 designs this feature's fourth member rather than
  leaving it to be discovered here — the diff is written out in that feature's
  `tasks.md`, and it costs one field, zero initialisers, zero release lines, one
  new `#dispatch` branch and two signature changes. **Zero new identity
  predicates, and only on one route**: thread the generation down
  (`#readLoop` → `#dispatch` → `gen.issued.add(p)`). Reaching it through
  `this.#generation` instead needs `if (this.#generation?.conn === conn)` and a
  `conn` parameter — the seventh predicate — because a discard landing inside
  `readReply` would otherwise record a pattern on a generation that never
  confirmed it, which is #245 again.
- **R-7 — the safety argument now lives in another package (NEW).** The exact
  topic this feature subscribes is glob-inert only because
  `ChannelManager.#assertUsableChannel` refuses an out-of-charset channel
  before `subscribe` reaches the driver (#314). Nothing in `@lockness/redis`
  can see that, and nothing in the driver re-checks it — by design, because a
  second decider is the defect §5 forbids. So a future change that widens
  `NAME_RE`, moves the assertion later, or adds a `subscribe` path that skips
  it turns every channel name back into a live Redis pattern, **broker-wide**
  and with nothing in the log. **Mitigation:** FR-022 — the dependency is
  written at the `watchChannel` docstring and in §5 row 6's duplication column,
  which is where a reviewer of that future change will be standing.
  **Amended by the re-entry audit (H3): that last clause was false, and it was
  the whole mitigation.** Widening `NAME_RE` is a change made in
  `protocol.ts`; moving the assertion is made in `manager.ts`. Neither reviewer
  opens `drivers/redis.ts`. FR-022 now records the dependency at all three
  sites, and SC-013 gives it an executable witness rather than prose in two
  places.
- **R-8 — the post-outage revocation window scales with the watched set
  (NEW).** `#fireReconnect` (`subscriber.ts:859`) runs after the N sequential
  awaited writes at `:784-786`, so #271/#308's revocation fast path
  (`drivers/redis.ts:1349`) is delayed by N — which under this feature is
  client-driven and, on a public channel, unauthenticated (§11 S2). The
  reconcile it then runs, `listRevoked` (`drivers/redis.ts:1236`), still
  performs #278's dual read: one `EVAL`, one `SMEMBERS`, and one serially
  awaited `EXISTS` per legacy member. **Mitigation:** FR-023 puts the control
  topic first, so the seam no longer waits on the event set at all; FR-017a
  bounds N; the residual is bounded by `reconcileIntervalMs`, since the
  periodic timer (`drivers/redis.ts:1337`) still runs. **Cross-reference
  #278** — removing the dual read shortens exactly the window this feature
  lengthens, and #278's release gate means the two overlap in the field.

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
| M2 | FR-004 splits `onMessage` (register) from `watch` (subscribe), making "subscribed with no handler" reachable where it is structurally impossible today. The manager happens to call `onMessage` first — by luck, not contract. | **Accepted.** `watchChannel` throws when no handler is registered. |
| M3 | `#handlerFaults` throttles per *pattern* per generation. One pattern today → one ERROR per generation. Per-channel → one per channel: 3 000 stack traces for one broken handler, and a blocked stderr back-pressures the read loop into missing its liveness window. | **Accepted.** FR-014: the throttle key becomes the generation. |
| M4 | `#activate` re-arms the keepalive, so **every watch resets the keepalive clock**. An instance with a join more often than `keepaliveMs` never emits a `PING`, and the liveness signal stops being independent of application traffic. | **Accepted.** FR-015. |
| M5 | The join window: an async port closes the **write leg only** — `#activate` never awaits `+psubscribe`, which `#dispatch` discards. | **Accepted**; R-2 corrected, and the residual is now named rather than left open. |
| L1-L4 | `watch` collides with Redis's own `WATCH` command; the memory driver's non-role is asserted in §6 and absent from §8; `owned:<instanceId>` is an existing partial second spelling of "channels this instance hosts"; new O(hosted) memory bounds unstated. | **All accepted** — renamed to `watchChannel`/`unwatchChannel`, §8 line added, row 1 duplication column extended, §6 Scale line added. |


### Re-audit, 2026-09-08 — **verdict `fail`: 2 CRITICAL, 5 HIGH, 5 MEDIUM, 4 LOW**

Run against the amended plan, before any code. Every finding below is applied
above unless the row says otherwise.

**The finding that explains the other two.** **M3 — eight of the 2026-09-07
remediations recorded in this section as `Accepted` were never applied to the
document.** The "What was done" column is what a reader trusts *instead of*
re-deriving, so recording a fix there and not making it is how the two CRITICALs
below stayed live through a whole pass. The eight: H1's new decision row; H2's
"row 1 restated as file:method"; H4's "FR-004 becomes conditional"; M1's "two
builders"; M2's "`watchChannel` throws when no handler is registered"; L1's
rename (half-applied — §12 used the new name, §3/§5/§7/§8 the old); L2's "§8
line added" for the memory driver; L3's row-1 duplication extension; L4's "§6
Scale line added" (the line present was about the *win*, not the memory bound).
**Applied in this pass — except one, which is the point.** The L1 rename
reached §3, §5 and §8 and **not §7**, whose constitution row kept the
`watch`/`unwatch` spelling for two further audits while this very sentence
claimed the rename was complete. Caught on the third verification pass and
fixed there, along with the substantive defect in the same row.

The process lesson is the one that matters, and it is now on its **third**
demonstration in one feature: **an audit finding is closed by an edit to the
requirement, never by a sentence in the audit table** — and a claim that eight
edits landed is worth exactly as much as a grep proving it, which is what
should have been run here.

| # | Finding | What was done |
| :--- | :--- | :--- |
| C1 | **`issued` is append-only, so watch → unwatch → watch on one socket generation is silently skipped.** FR-005 removed the channel from `patterns` only. The rejoin computes its delta, finds the pattern still in `issued`, issues nothing — recorded locally, unsubscribed on the broker, never re-subscribed for the life of the socket, `{ ok: true }` returned, nothing logged. This is US2 followed by a rejoin: the commonest lifecycle a chat deployment has, and neither SC-002 nor SC-003 reached it. | **Accepted.** FR-005 rewritten to name both sets and their deliberately **asymmetric** write moments — removal at the `PUNSUBSCRIBE` *enqueue*, addition at the acknowledgement — so a lost ack fails safe. New SC-010. |
| C2 | **The delta cannot deliver SC-005: the quadratic survives on the public path.** `ChannelManager.subscribe` has **no await** for a public channel (`manager.ts:404-464`), so N joins in one WebSocket batch all resolve in one tick, all compute against an empty confirmation record, and watch #k issues k patterns — Σk = N(N+1)/2, the original CRITICAL's arithmetic unchanged, on the exact path §11 S2 flags as unauthenticated. SC-005 as written ("N *sequential* watches") passes hermetically and degrades under the load the feature exists to serve. | **Accepted, and it changes the design.** FR-009 now carries **two** states — `pending` (written at enqueue) and `issued` (written at ack) — with `#activate` issuing `patterns \ (pending ∪ issued)`. Both release with the generation, so FR-009's #245 argument is preserved rather than weakened. SC-005 rewritten to measure a **burst**. Row 8 amended. |
| H1 | **FR-021's stated precondition is false in the shipped file.** It cited #298's FR-002 — *"`#activate` binds the generation to a `const` and never re-reads `this.#generation` after an await"* — as shipped. It is not: `#activate` binds no local (`subscriber.ts:780-783`) and re-reads the field after the awaited writes via `#armKeepalive` (`:843` → `:689`). #298's FR-002 called that local *"the single condition under which zero new identity predicates is true rather than aspirational"*, and **that half did not ship**. | **Accepted — and it is a defect in #298, not only in this plan.** FR-021 rewritten: the route costs **one local**, and its staleness is excluded by the existing `this.conn.socket !== conn` guard at `:837`, which is sufficient only because `discard` closes and nulls in one synchronous call (`connection.ts:516-522`) — verified. Passing the local to `#armKeepalive` retires `:690` and makes the predicate count net-negative. #298's divergence is filed separately, not fixed here. |
| H2 | **Row 2 named `eventTopic(channel)`, a symbol that does not exist**, and named one builder where M1's accepted remediation said two. `watchChannel` needs the prefix in a **pattern** context; calling `topic(channel)` — which returns the right bytes today — re-collapses the two contexts `drivers/redis.ts:830-836` separated on purpose. | **Accepted.** Row 2 split into a literal-context row (`topic`) and a pattern-context row (a new `eventPattern`), the latter naming `watchChannel` calling `topic()` as the duplication. |
| H3 | **FR-022 recorded the dependency in the one file the breaking change never opens.** Its own text claimed the `watchChannel` docstring is "where a reviewer of that future change will be standing" — false for all three changes R-7 names (`protocol.ts`, `manager.ts`, `manager.ts`). And it had no executable witness, where FR-018's equivalent got #315 plus a mutation battery. | **Accepted.** FR-022 rewritten to record it at three sites chosen by where the change is made; SC-013 adds the witness. Row 12's duplication column extended. |
| H4 | **Five requirements and one rule have no decision-table row** — FR-010, FR-012, FR-017, FR-019, FR-020, and the capability-detection rule FR-001/FR-002/D-5 jointly create. Two are the direct output of previously accepted HIGHs. | **Accepted.** Five rows added; FR-025 written for capability detection, on `presenceRoster`'s precedent (`manager.ts:112-120`). FR-017's row is deliberately the one marked **OPEN** — see §12 Q3. |
| H5 | **The revocation fast-path regression was diagnosed in §11 S2 and carried by no requirement.** `#fireReconnect` runs strictly after the sequential re-issue loop, so at N=3 000 the framework's only revocation fast path sits behind 3 000 serialized writes. FR-017 bounds the degradation; it does not remove it. | **Accepted.** FR-023 + SC-011, merged with the security seat's S9 (same requirement reached from the other end) and a new row. |
| M1 | FR-014 read as "move `#handlerFaults` onto the generation", which `subscriber.ts:199-205` already refutes — it is reached from a deferred `.catch` that can outlive the generation, and keying on a live generation object retains a discarded `Deno.Conn`. The one-line fix also deleted **attribution**: 3 000 broken channels, one line naming one arbitrary pattern. | **Accepted.** FR-014 rewritten — the map stays a class field, and the per-pattern tally is emitted at `#discardSocket`'s clear. |
| M2 | **Zero of the 23 port implementations are forced to change**, so 12 driver doubles and 8 subscriber doubles take the fallback and the hermetic suite exercises the branch this feature replaces. §8 read that count as reassurance. | **Accepted.** SC-014, plus the named plumbing in §8. |
| M3 | The eight unapplied remediations, above. | **All applied.** |
| M4 | §6 listed the memory driver among packages touched while FR-002 said it need not change. | **Accepted** — §6 and §8 now say it is untouched, and why. |
| M5 | FR-013's re-read rule covered `patterns` and not the new record, though `#dispatch` writes to it during the same awaits. | **Accepted** — FR-013 extended. |
| L1 | "The seventh identity predicate" hangs a binding constraint on a count the plan never enumerates; the file has 5 `#generation.conn` comparisons and 10 `conn`-identity comparisons, neither of which is six. | **Accepted in substance, and the claim was dropped rather than repaired.** FR-021 now states the cost as *"no new `=== conn` predicate"* and, with `#armKeepalive` taking the local, net-negative — which is checkable at review without an enumeration. |
| L2 | The acknowledgement was written `` `+psubscribe` ``, which reads as a RESP simple string. It is a 3-element array push frame whose third element is an integer; an implementer following the plan writes `reply.type === 'simple'` and the branch never fires. | **Accepted** — the shape is spelled out in FR-009, `punsubscribe` included. |
| L3 | SC-003's "exactly one `PSUBSCRIBE`" is false across a reconnect, which FR-010 makes legitimate. | **Accepted** — "per socket generation", with the reason. |
| L4 | The re-issue log lines print `patterns.size` and would over-report under a delta. | **Accepted** — FR-010. |

### Verification pass, 2026-09-08 (same day) — **`fail`: 1 CRITICAL, 4 HIGH, 5 MEDIUM, 3 LOW**

The seat was re-run on the amended §3/§4/§5, as its own recommendation asked.
It confirmed H1's corrected citation and the staleness argument, confirmed the
two-state record bounds the burst to N, and confirmed the awaited port is
neutral **to that bound**. It then found that the fix for C2 had created the
defect C1 was about.

| # | Finding | What was done |
| :--- | :--- | :--- |
| **C1'** | **FR-005 retired only `issued`, so `pending` re-opened C1 — and the burst path `pending` exists for is exactly the path that fills it.** Two silent routes: a channel unwatched inside a broker RTT stays claimed and the re-watch skips it; and a late `+psubscribe` for a pre-unwatch subscribe re-adds the pattern after the retire, because `#dispatch` recorded acknowledgements unconditionally. Neither SC-009 (discarded generation) nor SC-010 (settled unwatch) reached either route. | **Accepted — the remedy is one rule, not two more sets.** `SocketGeneration` now owns `claim` / `confirm` / `retire` over two **private** sets: `retire` clears both, and `confirm` **drops an acknowledgement whose claim is gone**. A retire erases the claim the ack would confirm, which kills both routes with one sentence. FR-005 rewritten around it; SC-015 and SC-016 added for the two windows. |
| H-A | **FR-005 never stated when `patterns` is removed**, and its own "different moments" rationale described a pairing it did not name. One reading deletes a live handler under a live subscription. | **Accepted.** Both erasures are enqueue-timed, and the surviving asymmetry is restated as the thing that is actually true: **writes are acknowledged, erasures are enqueued.** |
| H-B | **FR-002's awaited guarantee had nothing beneath it.** `RedisSubscriber.psubscribe` returns `void` and fires `void this.#connectAndSubscribe()`; §8 added no awaitable member. An implementer following the plan writes `async watchChannel()` that awaits nothing while its JSDoc claims the frame is on the wire. | **Accepted.** FR-001 extended: the single-pattern seam FR-009 needs anyway returns `void | Promise<void>`. Existing `psubscribe` untouched, so no implementation breaks and Q2's "no second port break" argument survives. §8 counts it. |
| H-C | **The FR-002 await falsified FR-009's premise**, and left SC-005 constructible as a green test that never forms a burst — the previous pass's SC-005 defect, relocated. | **Accepted.** The premise is restated as what is true (the burst comes from the *caller's* concurrency), and SC-005 now names its construction: N calls started without awaiting, settled with `Promise.all`. FR-009 also states the ordering the bound rests on — `claim` before the activation's first await. |
| H-D | **§5 row 14 and FR-017 still said the cap's home was undecided** after Q3 decided it. §5 is the locked artefact the next phase reads. | **Accepted** — row 14 homed, FR-017's closing paragraphs replaced by a pointer. |
| M-A | The awaited watch couples join latency to the generation's whole serialized write chain; "one broker RTT" is the single-join residual only. | **Accepted** — FR-002 and R-2 both state the residual as one RTT plus queue depth, bounded by the cap. |
| M-B | FR-021 called an **intra**-package dependency cross-package, and recorded it nowhere; and it promoted a guard the file itself calls "DEFENSIVE AND UNTESTED" to a new correctness property with no criterion. | **Accepted.** The label is corrected, FR-022 gains `connection.ts` at `discard` as a fourth site, and the decision not to add a criterion is stated with its reason rather than left silent. |
| M-C | FR-024's prescription was half-shipped — the gate already probes the control topic, and its unsigned probe is deliberate live evidence that the MAC check runs. | **Accepted** — FR-024 narrowed to the event half, with the control half's rationale protected. |
| M-D | The caps shipped with no success criterion, and FR-017b created the very undeleted shim it warns about. | **Accepted** — SC-017, and the removal made an artefact filed by the WARN release. |
| M-E | No row homed "what counts as proof that a subscription is live", now answered in two places (FR-002's await, FR-024's gate). | **Accepted** — a fifteenth row. |
| L-A/B/C | FR-009 named a field (`confirmed`) its own sketch did not declare; R-2 pointed at Q1 for a mitigation Q2 decided; FR-017b reinvented `@lockness/deprecation-contracts`' strict mode without recording the rejection. | **All accepted** — the formula is gone in favour of `gen.has(p)`, R-2 cites Q2, and the deprecation-contracts route is declined on the record with its two reasons. |

### Third verification pass, 2026-09-08 — **`fail`: 0 CRITICAL, 1 HIGH, 4 MEDIUM, 1 LOW**

Scoped to the new state machine and the port change, since those were the only
things that moved.

**The state machine is sound, and the seat proved it rather than checking
sequences.** `confirm` can only move a pattern from pending to issued and is
gated on the claim's deletion succeeding, so it is **`has`-invariant** — it can
never change the only thing anything reads. Correctness therefore reduces to a
single property: every mutation is co-turn with its frame's enqueue. `Set`
multiplicity turns out not to matter, because `claim` is reachable only where
`has(p)` is false, so **at most one claim per pattern is ever outstanding** —
the guard enforces the cardinality, not the container.

**The near-miss, recorded because knowing where the edge is worth more than
knowing it holds:** `claim(p)`, then an `await` on something *other than* the
write, then the enqueue. An unwatch in that window puts `PUNSUBSCRIBE` on the
chain first — broker subscribed, `has(p)` false, `patterns` empty, a live
subscription with no handler. FR-013 does not catch it. That is why FR-009 now
carries a same-turn rule rather than a before-the-first-await one.

| # | Finding | What was done |
| :--- | :--- | :--- |
| **H-E** | **FR-002's awaited guarantee had no failure semantics, and two sections already said it was false.** `#activate` catches everything, logs at WARN, discards, schedules a retry and returns **normally** — so a `subscribeOne` returning `#activate([p])` resolves with nothing on the wire while the mandated JSDoc says the frame landed. §7's row said "no new catch introduced" and §11 S6 accepts a 30 s window; neither survives "the residual is one RTT plus queue depth". FR-024 compounded it: a gate probing after a watch that "resolves undemonstrated" hangs for 10 s — the exact symptom FR-024 exists to remove. | **Accepted, and the fork resolved toward the decision the user actually made.** The seam **rejects** when the write does not reach the socket and still schedules the retry; `#activate`'s never-throw contract is untouched for its two existing callers, which have no caller to reject to. The guarantee is restated as *"on the wire, or the caller was told it is not"*. `ChannelManager.subscribe` catches, **keeps the membership** (the retry re-issues from `patterns`), WARNs naming the channel, and answers `{ ok: true }` — because delivery does resume, and `{ ok: false }` would be indistinguishable from an authorization denial. §7's row corrected. Weakening the guarantee instead was the alternative, and it was rejected: it would have delivered an await that guarantees nothing, which is not what Q2 bought. |
| M-F | FR-021 and §5 row 8 still spelled the **pre-encapsulation** shape — the threading arrow ended at `gen.issued.add(p)`. That literal cannot compile against a private field, but the semantics an implementer reconstructs from it is the unconditional add `confirm` exists to prevent. | **Accepted** — the arrow ends at `gen.confirm(p)`, row 8's home is the four verbs, and its duplication column names a caller writing either set directly. |
| M-G | FR-010's "issued count" collided with the meaning FR-009 had just given `issued`, and `:998` is not a report at all — it is the retry **scheduling** line, where `patterns.size` is already correct. | **Accepted** — the two lines get separate rules, and `:998`'s exemption records why, so a later reader does not "fix" it. |
| M-H | **SC-016 was falsified by SC-015's own construction.** With a re-watch outstanding, a stale ack legitimately consumes the new claim. Written unqualified, SC-016 goes red on correct code — and the natural repair reintroduces the counted-claim machinery the design avoids. | **Accepted** — SC-016 names its construction, and records why the re-watch case is safe. |
| M-I | `claim`/`retire` were given an **ordering** rule where the design needs a **same-turn** rule, and FR-020 already states the equivalent for the manager. The subscriber is the side where the write chain makes it observable and had no counterpart. | **Accepted** — FR-009 carries FR-020's twin, with the one-sentence reason. |
| L-D | "three verbs" heading a block that defines four; `has` is the only reader. | **Accepted.** |

**One finding was checked and NOT raised**, recorded because its absence is informative: the seat opened `Encapsulate Collection` and dropped it — `subscriptions` is `private readonly` and escapes nowhere, so the technique does not apply. And the backlog check found **no overlap with #278** on the architecture axis: the legacy dual-read keys (`drivers/redis.ts:903-933`) are Redis *keys*, never pub/sub topics, so no subscription this feature creates or destroys touches them. The security seat's S10 reaches #278 by a different route — latency, not topics — and that one *is* recorded as `confirms #278` in R-8.


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
| S1 (HIGH) | `watchChannel` puts a channel name into a **PSUBSCRIBE pattern context for the first time**, and **nothing on `ChannelManager.subscribe`'s path calls `isValidName`** — the only channel validation in the package is `decodeClientMessage`, which guards the WebSocket wire, not the public API. An application doing `manager.subscribe(conn, \`chat:${userInput}\`)` registers `*a*a*a…` as a live Redis pattern; Redis matches every pattern against every PUBLISH single-threaded and **broker-wide**, which the prefix explicitly does not isolate (CWE-1333, CVE-2022-36021). A plain `*` silently restores the firehose and defeats SC-001 with nothing in the log. | **Accepted — the plan's §5 row 6 named a control that does not exist on this path.** FR-016: the driver refuses a channel failing `isValidName`, at the boundary, same shape as `assertUsablePrefix`. Note the precedent: that docstring hardened the prefix because it "reaches PSUBSCRIBE at two pattern contexts" while assuming the channel never does. **This feature is what breaks that assumption**, so the assumption is discharged here. **STRUCK ON RE-ENTRY 2026-09-08 — the premise is false today.** #314 shipped `#assertUsableChannel` as `ChannelManager.subscribe`'s **second statement**, before `channelKind` and before the awaited authorizer, so the exploit path this finding describes — an application doing `manager.subscribe(conn, ...)` with user input and registering `*a*a*a…` as a live Redis pattern — raises `ChannelNameError` today. The finding was **right when written and is satisfied elsewhere now**; FR-016 is struck with it. FR-022 and R-7 replace it with the part that is still true and still fragile: the guarantee is real but it lives in another package, where this feature cannot see it. |
| S2 (HIGH) | The subscribed-pattern set becomes **unbounded and client-driven**: `channelKind` returns `public` unless the name starts with `presence-`/`private-`, and `subscribe` runs **no authorizer for public channels**. No cap exists in `websocket.ts`, `manager.ts` or the driver. Three effects: broker-wide match cost; reconnect becomes all-or-nothing over N patterns, and a failed re-issue leaves the **control topic** unsubscribed too; and #271/#308's revocation fast path fires only after all N writes, so eviction latency after an outage grows with N. | **Accepted.** FR-017 (per-connection and per-instance caps, refused loudly, matching `ConnectionIdError`'s precedent) and SC-007 (a full re-issue proven at realistic N, not N=2). |
| S3 (HIGH) | **#288's own isolation suite is structurally coupled to the glob shape.** `SC-002` derives `eventPatterns = myPatterns.filter(p => p.endsWith('*'))`; under exact-topic subscribes that becomes **empty**, the loop body never runs, and `ownControl` binds to an event topic. **The test passes having stopped checking anything** — and it is the test for the property whose failure routes a control frame to `onMessage`, where the MAC check is not. The suite's header already records five prior green-for-the-wrong-reason mutations; this would be the sixth. | **Accepted.** FR-018 + a decision row: the suite identifies the control subscription by **equality with `controlTopic`**, never `!endsWith('*')`, and event subscriptions by the `eventTopicPrefix` head. **Done — split out as #315 and shipped 2026-09-07 (`c5baf3b9`), independently of this plan.** S3 is closed; this feature no longer carries it. |
| S4 (MED) | The natural `watchChannel` implementation closes over `channel` and drops `onMessage`'s `topic.startsWith(marker)` check and fixed-offset slice — **and it will look correct**. That check is what makes a mis-derived pattern non-exploitable, since `deliverLocal` re-keys on the topic-derived channel. Combined with S1 it becomes a real cross-channel delivery leak. | **Accepted.** FR-019: the channel a frame is attributed to comes from the **delivered topic** and nowhere else; a `watch` closure must not carry the channel into delivery. |
| S5 (MED) | The 1→0 transition is **not atomic with the wire operation**. `unsubscribe` does `set.delete(id)` then awaits `roster.removeMember`; a new client joining during that await takes 0→1 (a wire no-op, the pattern still exists), then the suspended continuation fires `unwatch` — unwatching a channel with a live authorized subscriber. Silent, and **permanent**: FR-005 removes it from the re-issue set, so the reconnect that heals every other deafness is guaranteed not to heal this. | **Accepted, and it reshapes FR-003 from a transition requirement into an atomicity one.** FR-020 + SC-008. |
| S6 (MED) | The join window converts "cannot be missed at join" into "can be missed at join" for application-carried security signals, widened by backoff to `retryMaxMs` (30s) during a fault. Nothing security-relevant travels EVENT topics at framework level — `evict`/`presence-*` are all CONTROL, MAC-signed, unconditionally subscribed, and rosters are read authoritatively from Redis — so this is correctness, not confidentiality. | **Accepted.** Documented as a guarantee change; the awaitable-`watch` question goes to the user (§12 Q2) because it is **port-breaking later**. |
| S7 (LOW) | The plan cites decisions **D-1 and D-5 three times and neither exists.** | **Accepted — my defect.** Both now written below. |


### Re-audit, 2026-09-08 — **verdict `fail`: 0 CRITICAL, 1 HIGH, 3 MEDIUM, 2 LOW**

**The headline is that two HIGHs are correctly closed, and the seat proved it
rather than accepting it.** S1's strike was tested by enumerating *every* path
to a watch: `subscriptions` has one construction site (`manager.ts:431-432`) and
two add sites (`:444`, `:463`), all three inside `subscribe` and all three after
the assertion at `:409`; `websocket.ts` never calls `subscribe` at all (it owns
the upgrade, the CSWSH guard and identity resolution), `handlerHooks` wires only
`register` and `disconnect`, `events_bridge.ts` only `broadcast`, and
`broadcastable.ts` is an interface with no call site. `psubscribe` has exactly
two production callers. S3's strike was tested against
`prefix_anchoring.test.ts:549-614`, which binds by equality and by head and
additionally pins that the two families account for every subscription — so it
stays meaningful under exact topics rather than vacuous.

| # | Finding | What was done |
| :--- | :--- | :--- |
| S2 (HIGH, carried) | **The watched set is client-driven and FR-017 was one sentence.** The premise was re-verified: no cap of any spelling exists in either package — the only `limit` in the port is `ControlRefusal.limit`, a byte ceiling. And the plan **understated** the exposure: `manager.ts:416`'s `identity === null` check sits *inside* `if (kind !== 'public')`, so a public channel needs neither an authorizer nor an identity, and the watched set is driven by an **unauthenticated** socket wherever the application permits an anonymous upgrade. FR-017 could not be implemented without re-deciding four things: no `§5` row, no error type, no default, no binding to SC-007 — and the per-connection counter collides head-on with D-1. | **Accepted.** FR-017 rewritten with the refusal site, `ChannelLimitError` in §8, and the reverse-index structure; FR-017a binds the cap to SC-007's N and to R-8's window; D-1 amended explicitly rather than left in conflict. **Its home is the one thing left open** — §12 Q3. |
| S8 (MED) | **`unwatchChannel` inherits `unsubscribe`'s deliberate non-assertion**, and FR-022 stated the invariant one-directionally. #314's "creation is guarded, cleanup is total" was written when cleanup was local memory only; this feature makes cleanup a **wire** operation whose argument is a pattern. | **Accepted, with the seat's own clearance recorded.** Not exploitable — an entry can only originate post-assertion at `manager.ts:432`, the map is per-process, and `PUNSUBSCRIBE` matches by literal string equality, not glob. FR-022 now states both legs and why they are guarded differently, and #314's comment is amended. |
| S9 (MED) | **The control topic survives a partial re-issue only by an unpinned ordering coincidence, and §11 S2 asserted the opposite.** A throw at write *k* skips *k..N*; which subscription survives is settled by `patterns` Map insertion order, itself settled by `ChannelManager`'s constructor calling `onMessage` (`manager.ts:202`) before `onControl` (`:205`). | **Accepted, with one correction to the finding.** Verified in the tree: **today** the event glob is inserted first, so the control topic *is* the one lost — §11 S2 was right about the present. **After FR-004** `onMessage` subscribes nothing and the order silently **inverts**. So the defect is not that the claim is false; it is that its truth value flips on a change this plan makes, pinned by nothing. FR-023 + SC-012. |
| S10 (MED) | **The post-outage revocation window grows with N**, compounded by #278's dual read — one `EVAL`, one `SMEMBERS`, one serially awaited `EXISTS` per legacy member. **`confirms #278`**, and gives it its first argument about security latency rather than tech debt. | **Accepted.** R-8, cross-referencing #278 and noting the release gate means the two overlap in the field. |
| S11 (LOW) | The invariant that makes S1's strike sound is narrower than FR-022 stated: it is the **single construction site** at `manager.ts:431-432`, not "the assertion runs". A future warm-start or promoted test helper satisfies FR-022 as written and defeats it. | **Accepted** — row 12's duplication column names it. |
| S12 (LOW) | FR-004 makes `eventSubscriptions` (`prefix_anchoring.test.ts:573-584`) throw on any fixture that registers the seams and never watches — the right direction, but it would surface as a mysterious red. | **Accepted** — §8's test-plumbing list. |

**On the §11 clearance, re-checked under exact topics and found stronger.** The
control topic is *already* an exact-string `PSUBSCRIBE` today
(`drivers/redis.ts:1018`), so FR-007 holds by construction. On the event side
the pattern narrows from `{P__event:*}` to the single topic `{P__event:C}` with
`C` glob-inert — a strict subset, so every topic reachable under exact-topic
subscribe was already reachable under the glob. **The clearance is inherited and
narrowed, not re-run.**

**Q4, in writing.** An authenticated stranger cannot read another user's channel
traffic (`deliverLocal` fans only to `subscriptions.get(channel)`, and
membership for `private-`/`presence-` requires an identity and the app's
authorizer), cannot reach another deployment's traffic (`__` anchoring holds and
narrows), and cannot forge a control frame (MAC-verified before the handler, and
no event pattern reaches `__control`). **What they can do is denial of service
and lengthening someone else's revocation window** — every distinct public
channel name one socket subscribes to becomes one broker `PSUBSCRIBE`, one entry
in the re-issue set, and one more serialized write ahead of the revocation fast
path. That is the concrete cross-account effect, and it is why FR-017 being one
sentence was a HIGH rather than a MEDIUM.


### Decisions the plan referenced and did not contain

- **D-1 — the ref count is `set.size`, not a new field.** The manager already
  holds `subscriptions: Map<channel, Set<clientId>>`; a second counter would be
  a second spelling of hosting. **Amended by H1/S5**: the transition is read
  from the mutation's own result in a synchronous turn, and the empty `Set` is
  deleted so `has()` is the single spelling of "not hosted". **Amended again on
  re-entry (S2/FR-017):** a per-connection cap needs
  `Map<clientId, Set<channel>>`, which D-1 as written forbids. The amendment is
  narrow and the distinction is the point — that map is a **reverse index of
  the same fact**, not a second counter; it is written only inside FR-012's
  `#joinLocal`/`#leaveLocal` pair, and no code may read *hosting* from it. Left
  in conflict, the plan would have told the implementer both to add it and not
  to.
- **D-5 — a subscriber without `punsubscribe` does NOT get per-channel
  subscribe.** It falls back to today's single prefix-wide glob. "Watch without
  unwatch" is rejected **explicitly**: it would make the pattern set monotonic
  over the process lifetime — every channel ever hosted, re-issued on every
  reconnect — which is strictly worse than the behaviour it replaces, and
  invisible because delivery stays correct.

## 11b. Review gate, 2026-09-08 — **`fail`: 0 CRITICAL, 7 HIGH, 9 MEDIUM, 5 LOW**

Three seats on the frozen tree. Six HIGHs were fixed in-branch; the seventh is
recorded here because **it asks to reverse a decision the user made at stop 1**,
and a review pass is not where that gets reversed.

| # | Finding | What was done |
| :--- | :--- | :--- |
| **H-1** | **The reconnect seam could fire with the control topic unsubscribed** — reached independently by the code and security seats from opposite ends of one guard. The priority partition was skipped when `toIssue.length > 1` was false (a single-pattern `subscribeOne` after a fault) **or** when `#priority.size > 0` was false (any activation before `onControl` ran), yet the `landed === 1` early fire consumed the latch anyway. The retry then read a consumed latch and never re-fired: revocation falls back to the periodic reconcile, which is the pre-#271 exposure the seam exists to remove. | **Fixed.** The seam now fires on the pattern that **feeds** it — `#priority.has(pattern)` when any priority exists, `landed === 1` otherwise — and an activation that fired early and then threw re-arms the latch, so the retry that actually restores delivery owes and pays its own seam. |
| **H-2** | **FR-010's recovery line reported the wrong quantity.** `generation.size` is pending+issued for the whole socket — the figure FR-010 explicitly excludes. It agrees with the delta on a fresh socket and diverges on a cached one: a hundred confirmed patterns plus a three-pattern retry reported "100 re-issued" having written three. | **Fixed.** The activation records what it wrote, and the report reads that. An outage report that overstates itself is worse than none, because it is believed. |
| **H-3** | **A throwing teardown stranded the connection.** `disconnect`'s loop awaited `unsubscribe`, which awaits three rejectable calls; one transient fault aborted the loop, so later channels stayed watched and the two deletes never ran — the connection sat in `connections`, the reverse index and `subscriptions` for the life of the process, permanently charged against its own cap. The join path contains driver faults deliberately; the leave path did not, and a leave is where giving up is least affordable. | **Fixed**, and the first attempt was wrong in an instructive way: swallowing the error made the evict path's own WARN unreachable, which #291's suite caught immediately. Failures are now collected, the teardown completes, the deletes run in a `finally`, and the first error is re-thrown so `disconnect`'s contract is unchanged. |
| **H-4** | **SC-012 was green for the wrong reason.** It built a partial-failure rig and then asserted only that frame #1 carried the control topic — satisfied by construction. Flagged NOT VERIFIED by the seat and **verified here**: with the failure injection disabled entirely it still passed. SC-011's assertion wearing SC-012's name. | **Fixed and proven live.** It now asserts exactly one frame reached the socket, that it is the control topic, and that the skipped patterns converge once the failure lifts. Re-checked with the injection disabled: red. Its 60-second runtime was a hanging teardown reporting a PASS, fixed with it. |
| **H-5** | The instance-wide cap branch was executed by **no test** — the only cap witness loops one connection, and its filter matched both WARN strings so it could not have distinguished them. | **Fixed** — a witness driving one connection per channel, asserting the instance branch fires and the per-connection branch does not. |
| **H-6** | `ChannelLimitError` is new exported public API that nothing constructed. Nothing proved it is an `Error`, carries its name, or is `instanceof`-usable — the contract `ConnectionIdError` was exported to establish. | **Fixed** — a witness on the type itself, including that it is reachable from the package root. |
| **H-7** | **The caps observe and admit**, and `subscribe` runs no authorizer for a public channel, so on a deployment permitting anonymous upgrades one unauthenticated frame buys permanent broker-side subscription state. The seat proposes making the per-connection cap refuse now. | **NOT changed, and the reason is not disagreement with the finding.** §12 Q3 put exactly this trade to the user — "warn one release, then refuse" against "refuse immediately" — and they chose the warning release, so that the number is validated against real deployments before a refusal costs anyone anything. The seat did not know that. The refusal is filed as [#322](https://github.com/locknessland/lockness-monorepo/issues/322) and the exposure is bounded by one release. |

**Cleared by the seats, recorded so nobody re-derives it:** the co-turn rule holds at every site (no `await` separates any record mutation from its frame's enqueue); injection is clean, since `#globs` is private with three writers and RESP bulk strings are length-prefixed by byte count so a CRLF in a name cannot splice; the single-construction-site invariant holds; the control plane's MAC path is byte-identical; FR-019 has no channel capture; FR-024's control half including its unsigned probe is byte-identical; every battery anchor matches live code exactly once.

**Both seats independently reached the same conclusion about `#issued`**: nothing reads the pending/issued distinction today, so the state is YAGNI and the battery's recorded survivor is legitimate rather than a never-run mutation. That agrees with what the battery already says, and with #322's sibling question — if Q2's door is never walked through, delete the second set.

**MEDIUM and LOW go to the backlog**, per the two-stop rule. They cluster on test soundness (a sleep masking a race that fails green, a count read before the frames it forbids, keepalive witnesses on real timers) and on coverage SC-007 does not yet have — the largest re-issue any test exercises is three patterns against a cap of a thousand.

## 12. Open questions

### Q1 — sequencing, given the CRITICAL. **ANSWERED 2026-09-07 (park behind #298); CLOSED 2026-09-08 (the gate is satisfied).**

The CRITICAL requires changing `psubscribe`'s contract, and the correct shape
for that change (a per-generation "confirmed issued" record) is a **fourth**
member of the group #298 exists to consolidate. Building it here would be the
fifth repetition of the pattern #298 was filed to stop.

**Decision (2026-09-07): #295 does not proceed. It is gated on #298.** The
subscriber gets consolidated once, rather than growing a fourth parallel field
and then being consolidated.

**Outcome (2026-09-08): #298 shipped** on `main` (`f39f4f90..91ba27c2`) and is
closed. `SocketGeneration` exists with exactly `conn`, `keepaliveTimer` and
`writeChain`, and its FR-013 priced this feature's fourth member **against the
shipped type** — one field, zero initialisers, zero release lines, one new
`#dispatch` branch, two signature changes, and **zero** new identity predicates
on the one binding route. FR-009 and FR-021 carry that design. The parking
decision paid for itself twice: the member arrives designed rather than
discovered, and the consolidation took the 248 mutation battery from 4 recorded
survivors to 2.

**And parking left nothing exposed, as it claimed.** Both HIGH security
findings it named have since been closed by other work — S3 by #315
(2026-09-07), S1 by #314's channel assertion. Parking cost the fan-out win and
nothing else.

### Q2 — is `watchChannel` awaitable? **ANSWERED 2026-09-08: yes, awaitable now, closing the write leg.**

**Decision (user, at stop 1): awaitable now.** `watchChannel` returns
`void | Promise<void>` and `subscribe` awaits it, so `subscribe` resolves once
the `PSUBSCRIBE` frame is on the wire. The claim made in the docs is that and
only that; the residual is one broker RTT, named rather than implied away.

The reason to take it now rather than later is that it is the one decision
this feature cannot revisit cheaply, and the reason to stop at the write leg is
that going further costs an RTT on every join and would make the feature
undeliverable until `issued` lands. Once `issued` exists, awaiting the
acknowledgement instead becomes reachable **with no second port break**,
because the return type is already a promise.

<details><summary>The question as it stood</summary>

It is the one decision that becomes **port-breaking later**: adding a return
promise after `watchChannel?()` ships means changing `BroadcastDriver`,
`subscribe`'s contract and every driver.

**What it buys, precisely — and what it does not.** The join window is real:
`psubscribe` is fire-and-forget by port contract, so a client joining a channel
this instance does not yet host can miss messages published between the join
and the `PSUBSCRIBE` landing. The prefix-wide subscribe has no such window, so
this is a genuine regression traded for the fan-out win (R-2). An async port
closes the **write leg only**: `#activate` awaits that the frame reached the
socket, never that the broker answered `+psubscribe` (`subscriber.ts:830`). So
the honest claim is *"the frame is on the wire before `subscribe` resolves"*,
never *"delivery has started"*. The residual is one broker RTT.

**FR-009 changes the shape of this answer.** Once `SocketGeneration.issued`
records broker **acknowledgements**, fully closing the window becomes reachable
later — await the `+psubscribe` rather than the write — with **no second port
break**, because the return type would already be a promise. An awaitable port
today is therefore also the option that keeps that door open.

</details>

### Q3 — the watched-channel caps. **ANSWERED 2026-09-08: 1 000 / 100, warned for one release then refused.**

**Decision (user, at stop 1):** a per-instance cap of **1 000** and a
per-connection cap of **100**, landing over two releases — WARN with the actual
count first, refuse next (FR-017 / FR-017a / FR-017b). SC-007's live-broker
re-issue is proven at N = 1 000, which is the same number, deliberately.

The warning release is what makes the number honest: nothing in the framework
measures channels-per-instance today, so nobody — including this plan — can say
whether 1 000 is generous or tight. One release of WARNs answers that from real
deployments before the refusal costs anyone anything.

<details><summary>The question as it stood</summary>

The charset half has **left this question**: #314 shipped `#assertUsableChannel`
on `subscribe`'s path on 2026-09-07, which is the breaking change this question
was asking permission for. It landed; the plan is amended rather than re-asking
(FR-016, struck).

**FR-017 is what remains.** No cap of any spelling exists today — verified
across `@lockness/realtime` and `@lockness/redis` on 2026-09-08. The argument
for adding it now is the one `PREFIX_RE`'s docstring makes about itself: *"one
line to add before any operator had a prefix in production config, and a
breaking configuration change with no migration afterwards"*. The argument
against is that a cap refuses a `subscribe` that succeeds today — a behaviour
change for any deployment already over whatever limit is chosen.

**Why this feature is what raises it.** Today the subscribed-pattern set is
**one** glob no matter how many channels an instance hosts. Under per-channel
subscribe it becomes one pattern per hosted channel, client-driven and — the
re-audit sharpened this — **unauthenticated**: `manager.ts:416`'s
`identity === null` check sits *inside* `if (kind !== 'public')`, so a public
channel needs neither an authorizer nor an identity. Three costs then scale
with N: broker-wide pattern match cost; an all-or-nothing reconnect over N
patterns; and #271/#308's revocation fast path firing only after all N writes,
so another user's eviction latency after an outage becomes a function of this
socket's subscribe count (R-8).

**The home is decided; the numbers are not.** I took the home myself, because
the code answers it: both caps are refused at `ChannelManager.subscribe` before
`set.add`, as an exported `ChannelLimitError`. A per-connection cap in
`websocket.ts` cannot see the instance total, and a cap in the driver is
downstream of the decision — either placement gives "how many channels may this
deployment host" two answers that disagree. That is FR-017, and D-1 is amended
in the same pass rather than left in contradiction.

**What is actually open, and only you can answer it:**

1. **What are the two numbers?** They are not free choices: FR-017a binds the
   per-instance cap to SC-007's "realistic N" and to R-8's revocation window,
   so the number chosen here is the number the live-broker criterion must pass
   at.
2. **How does a deployment already over the cap learn?** Refused on upgrade, or
   warned for one release and refused in the next. This is the only
   user-visible behaviour change the feature makes — everything else is
   invisible — and it is the `PREFIX_RE` argument again: one line now, a
   breaking configuration change with no migration afterwards.

</details>
