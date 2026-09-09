# Plan: bound the cost of subscribe-verb churn on the WebSocket message path

**Branch**: `256-subscribe-churn-budget` | **Date**: 2026-09-09 | **Backlog item**:
[#329 — Realtime: bound the cost of subscribe-verb churn on the WebSocket message path](https://github.com/locknessland/lockness-monorepo/issues/329)

**This is the feature's one planning document.**

---

## 1. Why this exists

`@lockness/realtime`'s channel caps meter a **set at rest** — how many channels an instance hosts
and how many a connection holds. A `subscribe → unsubscribe → subscribe` loop returns that set to
exactly where it started, so `maxWatchedChannels`, `maxChannelsPerConnection` and
`anonymousHostingShare` all charge it **nothing**, by construction rather than by oversight.

**What one hostile socket buys, measured against the code rather than estimated.** For a presence
channel a sole-holding connection is churning, one `subscribe`/`unsubscribe` **pair** costs:

- **5 driver commands** — `SUBSCRIBE` (`drivers/redis.ts:1223`), `EVAL` roster add (`:1394`),
  `HGETALL` closing read (`:1440`), `UNSUBSCRIBE` (`:1233`), `EVAL` roster remove (`:1420`). The
  first and fourth ride the **subscribe** connection; the rest ride the command connection.
- **2 control publishes** — `presence-join`, `presence-leave`
- **2 cluster-wide re-emissions**, scaling with the room's **hosting** population, and
- **`N−1` control-frame verifications**, scaling with **fleet** size and charged to instances that
  host nothing. The loopback drop happens *before* the MAC (`drivers/redis.ts:1732`), so every other
  instance pays a length gate, a `JSON.parse`, field validation, a synchronous SHA-256 HMAC, a
  timing-safe compare and a replay-window prune-and-admit. The driver's own comment says so
  (`:1691`). This is CPU, not retained memory — `ControlReplayWindow` is bounded at 10 000 entries
  with per-origin fair share.
- **one reply proportional to the whole room** — `HGETALL` returns every member's `info`

**#329's own body under-counts this by more than half.** It says "two broker writes and two
cluster-wide fan-outs", missing the #295 watch pair (`manager.ts:1287`, `manager.ts:1311`), the
closing read and the fleet-wide verify term. The issue is right about the exposure and wrong about
its size. (It also names a `register` frame in its out-of-scope list; `ClientMessage` has no such
member — the inbound surface is exactly `subscribe` / `unsubscribe` / `ping`.)

**And the path #327 made free is not free.** `#327` made a re-join write nothing, announce nothing
and publish nothing — and left `#closingRead → rosterSnapshot → roster.listMembers` (an `HGETALL`,
`drivers/redis.ts:1439`) running on **every** presence subscribe frame, re-joins included. Its
frame-rate cost is now zero writes; its **byte** cost is the whole cluster-wide roster, per frame,
metered by nothing.

**The defect in the shipped prose is rhetorical, and naming it precisely matters.** No document says
"a re-join is free". Three say "writes nothing, announces nothing, publishes nothing" — an
exhaustive-sounding triple under a heading whose subject is *metering*, from which a reader infers
zero. The three sites are `docs/realtime.md:578`, `packages/realtime/README.md:108` and
**`manager.ts:845`, the published `subscribe` JSDoc**. `packages/realtime/AGENTS.md` carries no cost
claim at all — an earlier draft of this plan asserted it did, and the audit disproved it.

**What the shipped guidance tells applications to do does not work.** `docs/realtime.md:601-603`
says `authorize` "is the supported place to put a per-call budget of your own". Verified against the
code, it is blind to most of what it is supposed to bound — and worse:

| Why the `authorize` advice fails | Anchor |
| :--- | :--- |
| A **public** channel runs no authorizer at all — `if (kind !== 'public')` skips the whole block | `manager.ts:892` |
| `unsubscribe` runs no authorizer, so half the cycle is invisible even on presence channels | `manager.ts:1451` |
| Per #331 a denial on a channel already held **changes nothing** — so an authorizer-as-limiter can refuse the first join and the cheap re-join, and can never refuse the expensive leave | `channel.ts`, `AuthorizeResult` |
| It is not merely blind to the churn — **it is the largest per-frame charge in the package.** The authorizer runs *ahead of every cap* (`#checkChannelCaps` is downstream at `manager.ts:916`), so a **denied** subscribe naming any invented `private-*` name buys a full application authorizer invocation — a DB read, an audit write — for one ~30-byte frame, charged by nothing. It doubles as a channel-name enumeration oracle | `manager.ts:892-916` |

A lone client churning **unique public channel names** flips `SUBSCRIBE`/`UNSUBSCRIBE` on the shared
subscribe connection once per pair, forever — charged by no cap, seen by no authorizer, and
unreachable from the seam the docs point at. It needs **no identity at all**: `resolveIdentity` is
optional and defaults to `null` (`websocket.ts:262`), and `checkOrigin` is a CSWSH control, not
authentication.

**And the blast radius crosses tenants.** `RedisBroadcastDriver` holds **one** `RedisSubscriber`, and
that single connection carries the per-channel `subscribeOne`, the prefix-wide event glob **and the
reserved control topic** (`drivers/redis.ts:1196,1206,1275`). Every frame crosses that generation's
serialized write chain (`packages/redis/subscriber.ts:676`: "the k-th of k concurrent calls resolves
after k writes"). So one anonymous socket's churn delays, on that instance: every other connection's
event delivery, every presence fan-out, and **every inbound `evict` control frame** — it delays
revocation for every tenant on the box.

**What the caps do bound, and it is worth stating because it strengthens the case rather than
weakening it:** the at-rest dimension holds. `anonymousHostingShare` means about eight anonymous
sockets exhaust the anonymous hosting share and no more, and identified connections keep the
reserved remainder. The caps are a real backstop against *exhaustion*; they are simply orthogonal to
*rate*, which is this feature's whole thesis.

## 2. User scenarios

### US1 — an operator sizes a verb budget for their own deployment (P1)

**Given** an application wiring `@lockness/realtime` behind its own `onMessage`
**When** the operator reads `docs/realtime.md` to decide what a subscribe frame costs
**Then** they find a cost table on the axes their meter can actually key on (see FR-004 — this
scenario does not restate them), plus the burst floor below which their meter would refuse a
legitimate reconnect.

### US2 — an application refuses a churning client without breaking eviction (P1)

**Given** an operator following the documented seam
**When** they put a token bucket in their own `onMessage`, keyed on a **stable string derived from**
`connection.identity`
**Then** the churn loop is refused at the transport edge, and `evict`, `disconnect` and the
cross-instance revocation paths — none of which are client-driven — are untouched.

### US3 — a reconnecting client re-subscribes to its whole channel set (P1)

**Given** a client whose socket dropped while holding up to the **effective**
`maxChannelsPerConnection` this manager was constructed with
**When** it reconnects and re-issues its whole set as one burst
**Then** nothing in `@lockness/realtime` refuses it, and an application following the guidance sized
its burst against that effective value rather than against the default constant.

### US4 — a maintainer is tempted to wrap `onMessage` (P2)

**Given** a future contributor adding a rate limit to `ChannelManager`
**When** they open `handlerHooks` and see `onMessage: userHooks.onMessage` beside a composed
`onOpen` and a composed `onClose`
**Then** the docstring tells them the pass-through is a **decision with a reason**, not an omission,
and names what a budget on `unsubscribe` would break.

### Edge cases

- **An anonymous socket on a public channel** has `identity === null` and no peer address surfaced,
  so neither the framework nor a correctly-written application has a non-rotatable charge target
  inside this package. Accepted explicitly, in writing — see FR-006. **And keying the recommended
  meter on the null identity is not a fallback but a denial-of-service amplifier**: every anonymous
  socket shares one bucket, so one attacker drains it and every other anonymous client is refused —
  rejected option (d)'s failure mode reappearing inside the remedy.
- **An identity the attacker can mint.** "Does not rotate on reconnect" is not "cannot be minted":
  under open self-registration, `identity` is as mintable as `connection.id`, at signup cost.
- **An object identity.** `Identity = unknown`, so `buckets.get(connection.identity)` on a fresh
  user object keys a `Map` **by reference**, misses every time, and the meter silently accumulates
  nothing. It fails **open**, with no type complaint and no test failure unless the test reconnects.
- **A client that spends its own budget mid-eviction.** Six paths reach `ChannelManager.unsubscribe`
  and exactly one is client-driven (enumerated in §6); a framework-side budget on that method would
  make a spent budget leave permanent roster ghosts.
- **An unsubscribe on a non-owning instance, or a double unsubscribe** — `#leaveLocal` returns early
  (`manager.ts:1307`) and the presence branch is gated on `members?.get(clientId)`, so it costs
  **zero**. That cell is in the table (FR-004) and #332 will add a caller to it.
- **A driver with no roster capability** is single-process: no `EVAL`, no `HGETALL`, and the presence
  rows collapse. The table names its collapse axes.

## 3. Requirements

- **FR-001**: `@lockness/realtime` adds **no** churn meter, no new option on
  `ChannelManagerOptions`, no new member on `WebSocketHooks` and no new error type. **One** additive,
  read-only surface addition is admitted and only one: `ChannelManager.get maxChannelsPerConnection`
  — see FR-010 for why it is not optional. **Verified structurally**, not by a file diff: capture
  `deno doc --json packages/realtime/mod.ts` before and after the branch and diff them, because
  `git diff --stat mod.ts` sees a new exported *name* and is blind to a new **member** on the
  already-exported `ChannelManagerOptions`, `WebSocketHooks` or `ChannelManager` — which is exactly
  what this requirement forbids. Backstop grep:
  `rg -n 'churnBudget|maxSubscribesPerConnection|subscribeBudget|verbRate|SubscribeBudgetError|ChannelChurnError|rateLimit\?:' packages/realtime/` (0 hits today, 0 after).
- **FR-002**: The decision that the framework does not meter the verb rate is recorded **at its
  home**: the `ChannelManager.handlerHooks` docstring, immediately above the
  `onMessage: userHooks.onMessage` pass-through (`manager.ts:630`). It states why `connection.id`
  cannot be the charge target and names a stable projection of `connection.identity` as the one that
  can. Two things make it enforceable rather than rot-prone:
  - it carries a **source-text marker** (`VERB RATE IS THE APPLICATION'S`) that `churn_cost_329.test.ts`
    asserts on — the precedent this repo already set at `tests/log_encoding_291.test.ts:392`, and the
    only thing that makes SC-004 falsifiable;
  - the **contradicting neighbour twelve lines above** (`manager.ts:618`, "the app's own onOpen —
    where a per-socket rate limit ... lives") is reconciled in the same edit with one clause: a
    per-**socket** limit at open, the per-**verb** budget below.
- **FR-003**: The `authorize`-as-verb-budget advice is corrected at **all four sites it ships from**
  — the plan's earlier draft named one:

  | Site | What it is | Correction |
  | :--- | :--- | :--- |
  | `docs/realtime.md:597-603` | prose | rewritten (the three reasons, each with its anchor) |
  | `packages/realtime/README.md:113-115` | prose | rewritten to the one-line version + link |
  | `packages/realtime/channel.ts:78` | **published JSDoc** on `AuthorizeResult` | **one clause added, nothing deleted** — an authorizer legitimately *is* a rate-limit increment for the **admission** decision, and #331's reasoning depends on that reading. It gains "…which is not a verb budget: see `ChannelManager.handlerHooks`." |
  | `packages/realtime/AGENTS.md:144` | agent brief | same clause |

  The rewritten guidance must additionally:
  - name `onMessage` as the seam, with a worked example whose **first branch handles
    `identity === null`** — refusing the verb outright, or falling back to a per-connection bucket
    with its reset named. **Never one shared anonymous bucket**, which is rejected option (d)
    reappearing inside the remedy;
  - key on an explicit **stable string projection** (`String(user.id)`), never on
    `connection.identity` directly, with the one-sentence reason: `Identity` is `unknown`, so an
    object identity keys a `Map` by reference and the meter never accumulates;
  - show the **throttled upgrade route beside** the metered `onMessage` — the seam is only half the
    answer (FR-006, R4);
  - install an `onError` hook, so the framework's default log sink is not the deployment's
    rate-limit-free surface;
  - state that an application whose **signup is unauthenticated** needs a second key above the
    identity meter, because a per-identity bucket scales with account count;
  - carry one sentence on the fail-open default: kind is derived from the name and the default is
    **public** — a channel matching neither `private-` nor `presence-` runs no authorizer and is
    readable by any anonymous socket. **Naming is the access control.**
- **FR-004**: Two artefacts, deliberately on **different axes**, because they answer to different
  consumers:
  - **The published table is `verb × channel kind`, worst case per frame** — those are the only
    dimensions the consuming meter can observe. An app-side budget runs in `onMessage`, *before*
    `manager.subscribe`; `subscriptions`, `presence` and `#channelsByClient` are private, so the
    0→1 / already-hosted / 1→0 / others-remain transitions are invisible to it. Transition-dependent
    variation is shown as a **range**, with one sentence saying the seam cannot tell the cheap cell
    from the expensive one, so the budget is sized on the worst.
  - **The fine-grained cross-product lives in the test**, where the transitions *are* observable.

  Both carry four measures, not two: **driver commands**, **control publishes (issued)**,
  **control-frame verifications (fleet-wide, N−1)**, and **application authorizer invocations** —
  the last is the term the operator actually pays for and no earlier draft counted it. A
  `not a member / not owned → 0` row is included (the #332 case and the ordinary double-unsubscribe).
  **No benchmarked throughput, latency or capacity figure appears anywhere in it** — counts and
  shapes only. A row reading "≈X frames/sec before saturation" describes the maintainer's machine,
  not the framework, and is hard rule #10's line.
- **FR-005**: The three sites carrying the exhaustive-sounding triple are corrected to say that a
  re-join still performs **one authoritative roster read whose reply is the whole room**. The set is
  enumerated by
  `rg -n 'writes nothing|announces nothing|publishes nothing' docs/realtime.md packages/realtime/ --glob '!tests/'`
  — 4 hits, all real. (The earlier draft's `free|costs nothing|writes nothing` returned 38 hits of
  which 34 were noise: `charset-free`, `glob-free`, `presence-free`, `freezes`.) The three sites are
  `docs/realtime.md:578`, `packages/realtime/README.md:108` and `manager.ts:845`. A pitfall row is
  **added** to `packages/realtime/AGENTS.md` — that file carries no cost claim today, so there is
  nothing there to correct.
- **FR-006**: `docs/realtime.md` states **exhaustively** what remains unmetered, and "exhaustively"
  is a derivation rather than an assertion: it is every `(verb, kind)` cell in FR-004's table whose
  cost is non-zero and which no cap charges. That yields:
  - the verb rate itself; `ping`; application frames;
  - a **public-channel churn loop on unique names**, with no authorizer anywhere in the path;
  - **an application authorizer invocation per private/presence subscribe frame, denied ones
    included, ahead of every cap**;
  - **the decode-rejection path** — `decodeClientMessage` runs a full `TextDecoder` pass and then a
    full `TextEncoder().encode(text)` over the whole received frame **before** the size check, so
    the cost is proportional to what was sent; and when the `ProtocolError` escapes, `guard()` emits
    **one `console.error` per malformed frame** at whatever rate the client chooses, unless the
    application installed `onError` (`websocket.ts:184`);
  - **the empty `presence` entry** a presence churn cycle retains (R5);
  - the reconnect that resets any per-connection counter;
  - and, for an anonymous socket, the absence of any non-rotatable charge target — **and that keying
    the meter on the null identity itself is a denial-of-service amplifier, not a fallback**.
- **FR-007**: A test drives a `subscribe → unsubscribe → subscribe` loop from one connection and
  asserts the **composite per-cycle totals**, per channel kind, measured on the driver double and the
  subscriber spies — never on return values. **Composite, not per-op**, because three shipped tests
  already own the atoms and FR-008 pins them unmodified: `channel_watch_295.test.ts:118-128` already
  asserts `['watch:news','unwatch:news','watch:news']`; `roster_atomicity_323.test.ts` already
  asserts one `EVAL` per roster write; `presence_rejoin_327.test.ts:111,169` already owns the
  re-join's zero-write and its authoritative read. `churn_cost_329.test.ts` asserts the **cycle sum**
  and cites those three for the atoms; the doc table's caption names all four files.
- **FR-008**: The #323 co-turn is untouched: no statement is added or removed between
  `#checkChannelCaps` and `#joinLocal`, and `presence_cap_concurrency_323.test.ts`,
  `presence_rejoin_327.test.ts` and `subscribe_unsubscribe_race_330.test.ts` stay green unmodified.
  **And `deno task mutate presence_join_323 roster_sync_330` is run once after the FR-002 edit** —
  the mutation harness requires every anchor to match exactly once, `presence_join_323.ts:118-131`
  records that one of its anchors already had to move because `throw error` "also matches
  `handlerHooks`'s onOpen", and `deno task mutate` is **not** in hard rule #5's gate, so a broken
  anchor ships green and surfaces the next night. One command converts an assumption into evidence.
- **FR-009**: The residues this disposition does not close and that are **defects** are filed as
  tracked `domain:realtime` issues before #329 closes, each citing this plan: **R1** (the per-frame
  roster read) and **R5** (the retained `presence` entry). R2, R3 and R4 are accepted in writing
  rather than filed — §9 says why for each. One line is added to **#332**'s body: landing
  `revokeChannel` adds a non-frame caller to the leave path and therefore obliges an update to
  `churn_cost_329.test.ts` and the published table. That sentence is what stops the number going
  stale.
- **FR-010**: `ChannelManager` exposes `get maxChannelsPerConnection(): number` — the **effective**
  cap this instance was constructed with. Without it US3 and SC-002 are unsatisfiable off-default:
  `MAX_CHANNELS_PER_CONNECTION` is documented in its own JSDoc as the **default**, the effective
  value is `options.maxChannelsPerConnection ?? MAX_CHANNELS_PER_CONNECTION` held in a private field
  with no accessor, and `docs/realtime.md:614` — the very section the worked example lands in — sets
  it to `200`. An operator sizing a bucket at 100 then refuses the reconnect burst of a 200-channel
  client, which is exactly what US3 forbids.

## 4. Success criteria

- **SC-001**: An operator can size a verb budget without reading the framework's source — **the
  numbers a budget can be keyed on** are published, on the axes the seam can observe.
- **SC-002**: An application following the documented seam refuses a sustained churn loop while a
  reconnecting client re-issuing its whole channel set is never refused — **for any configured cap,
  not only the default**.
- **SC-003**: The published cost numbers cannot silently drift: a change to the manager's per-cycle
  driver-call or control-publish totals fails a test, in the same run as the change.
- **SC-004**: A maintainer opening `handlerHooks` learns why `onMessage` is passed through, at the
  line where they would otherwise wrap it — and deleting that explanation **fails a test** (FR-002's
  marker), rather than passing silently.
- **SC-005**: Nobody reading the shipped documentation — prose, README, **or published JSDoc in
  their editor** — is told a re-join is free, or pointed at `authorize` for a verb budget.

## 5. 🔒 Decision table

**Each row declares its home-relation**, because three different ones are in play and the third
column only writes itself once the relation is named: a **decision** homes where a maintainer would
edit it, and a second *implementation* duplicates it; a **derived fact** homes in the thing that
computes it, and a second *computation* duplicates it; a **value** homes in its declaration, and a
*literal* duplicates it.

| The decision | Relation | Its single home | What would duplicate it |
| :--- | :--- | :--- | :--- |
| The framework does not meter the WebSocket verb rate; that policy is the application's `onMessage` | decision | `packages/realtime/manager.ts` — the `ChannelManager.handlerHooks` docstring, above the `onMessage: userHooks.onMessage` pass-through | a `churnBudget` / `maxSubscribesPerConnection` / `subscribeBudget` field on `ChannelManagerOptions`; a per-connection counter `Map` beside `#channelsByClient`; a `SubscribeBudgetError` / `ChannelChurnError`; a `rateLimit` / `onVerb` member on `WebSocketHooks`; a refusal inside `unsubscribe`; `handlerHooks` wrapping `onMessage` |
| A meter is charged to a stable projection of `connection.identity`, never to `connection.id` | decision | `packages/realtime/types.ts` — the `Connection.identity` JSDoc | the rule restated as a rule (rather than as a pointer) in `handlerHooks`, `docs/realtime.md` or the README |
| What a **cycle** costs, in driver commands, control publishes, fleet-wide verifications and authorizer invocations | derived fact | `packages/realtime/tests/churn_cost_329.test.ts` — the composite totals; the doc table is **derived from it** and says so | a second **executable** count of the same composite, *including in another test file*; or a hand-maintained count written as an independent claim rather than as a pointer |
| The burst floor an application's meter must clear so a reconnect is never refused | value | `packages/realtime/manager.ts` — `ChannelManager.get maxChannelsPerConnection` (**the effective cap**; `MAX_CHANNELS_PER_CONNECTION` is only its default) | the literal `100` written into the docs, README or worked example; or the **default constant** presented as the floor, which is wrong for every configured deployment |
| `authorize` gates **admission**, never verb rate | decision | `docs/realtime.md` — the corrected section | the README bullet or the `AuthorizeResult` JSDoc **restating** the rule instead of pointing at it |
| What remains unmetered | derived fact | `docs/realtime.md` — the same corrected section, derived as "every `(verb, kind)` cell in FR-004 with non-zero cost that no cap charges" | any second list, or the claim of exhaustiveness asserted without the derivation |

**Binding.** A decision may not move out of its home without this table being amended first. The
enforcement grep is **identifiers, not prose** — the prose pattern returns 11 pre-existing hits
("instance budget", "byte budget") and this feature legitimately adds the word "churn", so a check
whose expected output is "some hits, use judgement" is not a check:

```bash
rg -n 'churnBudget|maxSubscribesPerConnection|subscribeBudget|verbRate|SubscribeBudgetError|ChannelChurnError|rateLimit\?:' packages/realtime/   # 0 today, 0 after
rg -n 'onMessage: userHooks\.onMessage' packages/realtime/manager.ts                                                                            # must still match, unwrapped
```

## 6. Technical context

**Language/Version**: TypeScript on Deno (workspace-pinned)
**Primary Dependencies**: `@lockness/contract`, `@lockness/redis` (driver-side only); no new dependency
**Storage**: N/A — the authoritative roster is the driver's and is not touched by this feature
**Testing**: `Deno.test`, in-package driver doubles and subscriber spies (`packages/realtime/tests/`)
**Target Platform**: Deno server, single- and multi-instance
**Project Type**: library (published on JSR as `@lockness/realtime@0.3.0`)
**Performance Goals**: none changed — this feature adds no runtime code path
**Constraints**: exactly one additive read-only getter on the published surface (FR-001/FR-010); the
#323 co-turn must not be entered (FR-008)
**Scale/Scope**: one docstring + one getter, four documentation sites, one new test file, two
follow-up issues, one sentence on #332

### Domain model

- **Bounded context**: `realtime`
- **Vocabulary**:
  - `Churn cycle` — `subscribe → unsubscribe → subscribe` on the same channel. Net set delta zero;
    net work five driver commands, two control publishes, `N−1` fleet-wide verifications and one
    whole-room read per pair.
  - `Amplification factor` — work performed per inbound frame: fan-out width, broker round-trips,
    fleet-wide verification, reply bytes, **and application authorizer invocations**.
  - `Charge target` — the identity a meter's counter is keyed on. **Two** properties matter, and
    clearing one is not enough: whether the client can **rotate** it (`connection.id`: yes, per
    socket) and whether the client can **mint** more of them (`identity`: as cheaply as the
    deployment's signup).
  - `Verb budget` — a bound on how **often** the channel verbs may be invoked. Owned by the
    application. This feature names the seam and the numbers; it builds no budget.
- **Entities**:
  - `ChannelManager` [aggregate root] — owns membership, the caps and the presence fan-out. Its one
    reason to change is the **membership** invariant; a rate is not one.
  - `Connection` — `id` is `crypto.randomUUID()` per socket (`websocket.ts:154`) and by contract
    never reused, so it is **not** a charge target. `identity` is server-derived and does not rotate
    on reconnect — and is typed `Identity = unknown`, so only the application can project it to a
    key.
- **Value objects**: `OwnedChannelSet(clientId, channels)` — membership is a set, so a churn cycle
  leaves it identical. This is why a set-size cap cannot see churn **at all**.
- **Invariants**:
  - A cap measuring a set at rest cannot meter a sequence returning the set to rest.
  - A meter keyed on a value the client mints is not a bound.
  - `#checkChannelCaps` reads, the #327 re-join guard claims, `#joinLocal` spends — all before the
    first `await` (#323). Inherited, not replaced.

### The six paths into `ChannelManager.unsubscribe` — exactly one is client-driven

This number carries the whole weight of rejecting option (a), so it is enumerated rather than
asserted. `manager.ts:1518` is the only internal call site, reached from:

| # | Path | Driven by |
| --: | :--- | :--- |
| 1 | the application's own `onMessage` → `manager.unsubscribe` | **the client** |
| 2 | `disconnect` (`:1491`) ← `handlerHooks.onClose` (`:632`) | socket close |
| 3 | `disconnect` ← `revokeLocal` (`:1635`) ← `evict` (`:1617`) | local revoke |
| 4 | `revokeLocal` ← `handleControl`'s evict arm (`:1813`) | **another instance** |
| 5 | `revokeLocal` ← `reconcileRevocations` (`:1658`) | the durable revocation timer |
| 6 | a direct programmatic `manager.unsubscribe` | the application |

A budget on that method charges six and means one. Concretely: a client that spends its budget makes
its own eviction leave **permanent** roster ghosts — the budget throws, `disconnect` re-throws
(`:1526`, `:1547`), `revokeLocal` catches and warns (`:1643`), the socket closed first so the
eviction *appears* to work, and the entries survive, reclaimable only by a ghost sweep of a **dead**
instance. That is the harm ADR 003 was written to close, reopened from a direction it could not see.

### The arithmetic that decides the owner

Let `B` be the verb budget a new connection starts with.

- #329's fourth criterion (a reconnect burst is never refused) requires `B ≥` the effective
  `maxChannelsPerConnection`.
- #329's third criterion (a reconnect must not reset the bound) requires that a returning connection
  **not** start at `B`.

On `connection.id` — the framework's only key — these are **jointly unsatisfiable**: the id is minted
fresh per socket, so a returning attacker and a reconnecting client are indistinguishable.

**So a per-connection budget is a cost-raiser, not a bound — and that is not why it is declined.**
Priced honestly: today a churn pair costs the attacker one ~30-byte frame, no round trip, no TLS
handshake, no log line; under a budget of 100 it costs one TLS + HTTP upgrade per 100 verbs. That is
two to three orders of magnitude more attacker cost per unit of server work, and it moves the traffic
out of an in-band channel nothing observes into the HTTP layer, where `@Throttle`, a load balancer's
connection-rate limit and an access log already exist. "A speed bump with a documented bypass"
describes most working rate limits. **It is declined because the only version that covers the whole
cycle sits on `unsubscribe`, and a spent budget there degrades revocation** — an unreliable revoke is
a worse security outcome than the denial of service it mitigates. The subscribe-only variant, which
escapes that objection, is on the record as option (g) in §10.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| #1 no direct `hono` import | pass | no import changes |
| #2 JSR-only, declared per package | pass | no new dependency |
| #3 no `any` in exported APIs | pass | the one addition is `get maxChannelsPerConnection(): number` |
| #4 Tailwind v4 syntax | n/a | no UI surface |
| #5 pre-completion gate | pass | plus `deno task mutate` on two batteries (FR-008), which the gate does **not** run |
| #6 never hand-edit `deno.lock` | pass | untouched |
| #7 JSDoc on public APIs | pass | the deliverable **is** a docstring, and the new getter carries its own |
| #8 MVC layering | n/a | library package |
| #9 one category per commit | pass | `feat:` (the getter), `docs:`, `test:` — split, never bundled |
| #10 public repo, no environment detail | pass | and FR-004 forbids benchmarked figures, which is the one way this feature could cross the line |
| #11 design decision → `architect-expert` | pass | disposition 2026-09-09; the getter-versus-arithmetic choice was decided by the audit seat, recorded in §12 |
| TDD | pass | the cost test is written against the current totals and must fail if they change |
| DDD / SRP | pass | the disposition's core argument: a rate is not a membership invariant |
| Domain Model gate | pass | §6 above |
| No silent catches | pass | no `catch` added |

### Complexity tracking

**One accepted deviation from the disposition's letter.** The 2026-09-09 disposition said the export
surface would be byte-identical. FR-010 adds one read-only getter. Justification: without it, SC-002
and US3 are unsatisfiable for any deployment that configured the cap, and the alternative — telling
operators to recompute the floor themselves — publishes guidance that is wrong by default for anyone
following `docs/realtime.md:614`. Additive, non-breaking, no `any`, one line.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` exported **names** (`mod.ts`) | **no** | unchanged |
| `ChannelManager` public members | **yes** | one additive read-only getter (FR-010) |
| `ChannelManagerOptions` / `WebSocketHooks` members | **no** | forbidden by FR-001, checked by `deno doc --json` |
| `ChannelManager.handlerHooks` JSDoc | yes | the decision, its reason, the marker; plus the `:618` reconciliation |
| `ChannelManager.subscribe` JSDoc (`manager.ts:845`) | yes | the re-join's roster read (FR-005) |
| `AuthorizeResult` JSDoc (`channel.ts:78`) | yes | one clause; **#331's reasoning is preserved** |
| `Connection.identity` JSDoc (`types.ts`) | yes | the charge-target rule (§5 row 2) |
| `docs/realtime.md` | yes | advice corrected; cost table; re-join paragraph; exhaustive unmetered list |
| `packages/realtime/README.md` | yes | two bullets |
| `packages/realtime/AGENTS.md` | yes | one **new** hand-written pitfall row + the FR-003 clause |
| `packages/realtime/tests/` | yes | one new file, `churn_cost_329.test.ts` |
| `packages/realtime/tests/mutations/` | **no** | re-run, not edited (FR-008) |
| Runtime behaviour | **no** | no code path added, removed or reordered |
| GitHub backlog | yes | two new `domain:realtime` issues + one sentence on #332 |

### Documentation (this feature)

```text
.specnaut/specs/256-subscribe-churn-budget/
├── plan.md    # This file
└── tasks.md   # derived from THIS file once approved
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| **The cost table drifts from the code** | FR-007: the composite totals live in an executable test and the doc says it is derived. A change to them fails the run that made it |
| **The published table goes stale when #332 lands** — `revokeChannel` is a new non-frame caller of the leave path | FR-009 puts one sentence on #332's body saying so. Cheap now, invisible later |
| **A future contributor adds the meter anyway** | The decision lives at the line they would edit (FR-002), the marker makes deleting it fail a test, and §5 gives the reviewer an identifier-only grep |
| **"Nothing is built" reads as "nothing was done"** | The deliverable is four corrections of shipped guidance that is currently wrong, one missing accessor, and one executable claim |
| **The exposure stays real for an anonymous public-channel socket** | Not mitigated. Accepted in writing (R4) and named as the boundary of this answer |

### Residue — what this answer does NOT solve

| # | Residue | Disposition |
| :--- | :--- | :--- |
| **R1** | A re-join costs one `HGETALL` per frame whose reply is the whole cluster-wide roster. An app-side **frame-rate** meter bounds frames, never per-frame **bytes** — so this is the one residue the documented remedy provably does not close | **File it (FR-009).** The one place a framework-side mechanism is the right owner: a per-channel single-flight on `rosterSnapshot` has no client-chosen key, refuses nothing, and reduces work rather than rationing it |
| **R2** | `#rosterTails`' queue **depth** is retained memory sized by the client's frame rate | **Accepted, recorded in the docs** — and the earlier draft got this wrong three ways. ADR 003 §6's "bounded in concurrency, not in total" is about the **number of writes issued**, not memory. The property is **not** a consequence of #330: `RedisClient.command` already chains onto `commandTail` (`packages/redis/client.ts:257`) retaining the full `args`, including the member's `info` — #330 added a second, **smaller** queue in front of an older, larger one. And depth is a function of enqueue rate, which the app-side budget this feature documents **bounds**; a deployment installing none has an unbounded verb rate anyway, which is #329's whole subject |
| **R3** | `unsubscribe` and public-channel `subscribe` have no framework-visible authorization seam at all | **Accepted, recorded in the docs.** This feature corrects the advice; it does not add hook surface |
| **R4** | No non-rotatable charge target exists for an anonymous socket inside this package | **Accepted in writing — and the accepted state is that nothing bounds it by default.** The earlier draft named `@lockness/core`'s upgrade throttle as *the* bound; verified, all three legs are conditional. (i) Nothing applies a throttle for you — `@Throttle` is opt-in and neither the handler nor the docs require it on the upgrade route. (ii) With the default `by: 'ip'`, `clientAddress` reads `cf-connecting-ip` / `x-real-ip` / `x-forwarded-for` and the framework's own comment says a client behind a non-stripping proxy can forge them. (iii) **With no proxy at all it returns the literal `'unknown'` for every request** — one shared bucket for the entire internet, which is rejected option (d)'s failure mode arriving through the accepted mitigation |
| **R5** | **`this.presence` is never deleted.** `#joinPresence` does `presence.set(channel, new Map())` (`manager.ts:979`) and `unsubscribe` deletes only the member (`:1453`) — there is no `this.presence.delete` anywhere in the file. Each unique presence channel name leaves an empty inner `Map` for the life of the process, so a presence churn cycle is **not** cost-neutral at rest, which is the premise §1's accounting rests on. `#leaveLocal` deletes its empty `Set` and its docstring says why | **File it (FR-009).** A code defect, so it does not belong inside FR-001's no-code constraint: `unsubscribe` deletes the channel's `presence` entry when `members.size === 0`, mirroring `#leaveLocal`. Until it lands, FR-006 names it |

## 10. Architecture audit

*`architect-expert`, run against THIS document before any code existed. 14 findings — 5 HIGH, 6
MEDIUM, 3 LOW. Verdict `fail`, and every finding is folded in above.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | **HIGH** — FR-004's table was indexed on hosting transitions the consuming meter cannot observe (private maps), re-introducing the content of the disposition's own rejection (f) | **Plan changed.** FR-004 split: doc table is `verb × kind`, worst case, with ranges; the cross-product moved to the test. SC-001 reworded to "the numbers a budget can be keyed on" |
| A2 | **HIGH** — §5's burst-floor row homed a **default** constant while the effective cap is private and FR-001 kept it private, making SC-002/US3 unsatisfiable off-default (`docs/realtime.md:614` sets it to 200) | **Plan changed**, taking the audit's own recommendation (b) as cleaner than the arithmetic workaround: FR-010 adds one read-only getter; FR-001 admits exactly it; §7 records the deviation |
| A3 | **HIGH** — FR-001's `git diff --stat mod.ts` check is blind to a new **member** on `ChannelManagerOptions`, `WebSocketHooks` or `ChannelManager` — precisely what FR-001 forbids | **Plan changed.** `deno doc --json` before/after diff, plus an identifier grep |
| A4 | **HIGH** — §5's cost row claimed a home three shipped tests already occupy, and FR-008 pins them unmodified, so the plan mandated the duplication its own column forbids | **Plan changed.** FR-007 narrowed to **composite** totals; the three atom-owning tests named; the duplication column extended to "a second **executable** count, including in another test file" |
| A5 | **HIGH** — the `authorize`-as-budget advice ships from **four** sites, two of them published JSDoc; FR-003 corrected one, so SC-005 failed on arrival | **Plan changed.** All four listed by path. `channel.ts:78` and `AGENTS.md:144` gain a clause rather than a rewrite — an authorizer legitimately *is* a rate-limit increment on **admission**, and deleting that would break #331's reasoning to fix #329's wording |
| A6 | **MEDIUM** — §1 asserted a defect in `packages/realtime/AGENTS.md` that does not exist, and FR-005's grep returned 38 hits of which 34 were noise (`charset-free`, `freezes`) | **Plan changed, and the claim withdrawn.** The defect is rhetorical, not literal; the three real sites named, including `manager.ts:845` which the draft missed; the grep replaced (4 hits, all real); "corrected" → "**added**" for the AGENTS.md pitfall, reconciling it with §8 |
| A7 | **MEDIUM** — §1 under-counted the very thing it exists to count: the **fleet-wide control-frame verification** term has no cell. The loopback drop is before the MAC, so every other instance pays parse + HMAC + replay-admit, scaling with **fleet** size, charged to instances hosting nothing | **Plan changed.** Added to §1 and given its own column in FR-004. Noted as CPU, not retained memory (`ControlReplayWindow` is bounded), so nobody files it as a leak |
| A8 | **MEDIUM** — R2 was mis-attributed to #330, mis-cited ADR 003 §6 as a memory claim it never made, and is bounded by the very meter this feature documents | **Objection accepted; R2 moved to "accepted", not filed.** FR-009 now files R1 and R5, not R1 and R2 |
| A9 | **MEDIUM** — FR-008 pinned three tests and omitted the two mutation batteries anchored in `manager.ts`; `deno task mutate` is not in the gate, so a broken anchor ships green | **Plan changed.** FR-008 runs both batteries after the FR-002 edit; §8 states the batteries are re-run, not edited |
| A10 | **MEDIUM** — FR-002's home is unenforceable (delete the docstring, every gate stays green), and `manager.ts:618` already says a rate limit lives in `onOpen`, twelve lines above | **Plan changed.** Source-text marker asserted by the test, on this repo's own precedent (`log_encoding_291.test.ts:392`); `:618` reconciled in the same edit; SC-004 made falsifiable |
| A11 | **MEDIUM** — §5's enforcement grep has 11 pre-existing hits and no baseline, and the feature legitimately adds the word "churn" | **Plan changed.** Narrowed to identifiers only — 0 today, 0 after |
| A12 | **LOW** — `confirms #332`. The `not a member / not owned → 0` cell was missing from both the table and the unmetered list, and #332 will add a caller to it | **Plan changed.** Row added; FR-009 puts one sentence on #332 |
| A13 | **LOW** — §5 had no row for the two most drift-prone deliverables (the corrected advice, the exhaustive list), and "exhaustively" was an assertion with no procedure | **Plan changed.** Two rows added; FR-006's exhaustiveness is now **derived** from FR-004's table |
| A14 | **LOW** — the table was specified on three different axis-sets in one document, and the "six paths" number carried the weight of a rejection while never being enumerated | **Plan changed.** US1 defers to FR-004; the six paths enumerated by line in §6 |

**Verdict**: `fail` — **coverage**: the plan document against `manager.ts`, `drivers/redis.ts`,
`channel.ts`, `protocol.ts`, `websocket.ts`, `mod.ts`, `control_replay_window.ts`, four shipped
tests, one mutation battery, `packages/redis/client.ts`, both READMEs/AGENTS.md, `docs/realtime.md`,
ADR 003 and `docs/testing.md`; FR-004's and FR-005's named searches were **run**, not read. It
**spot-checked three of §1's cost rows and confirmed all of them**, and confirmed every anchor in §1
resolves. It did not audit code that does not yet exist.

### The design disposition that produced this plan

Dispatched to `architect-expert` under hard rule #11 on **2026-09-09**, and it decided — this is not
a proposal:

> `@lockness/realtime` ships no churn meter, no new option and no new error type: verb-rate policy
> belongs to the application's own `onMessage` and is charged to `connection.identity`.

**What it rejected, and each option's real cost:**

| Rejected | Its real cost |
| :--- | :--- |
| **(a) A per-connection churn budget on `ChannelManager`** — #327's re-aimed option | Not a *bound* (§6's arithmetic), and — the decisive objection — the only version covering the whole cycle sits on `unsubscribe`, where a spent budget degrades revocation into permanent roster ghosts |
| **(b) "Document `authorize` and add nothing"** | This is what ships today and it is **wrong on four counts** (§1). The disposition is not (b): it is (b)'s conclusion with (b)'s reasoning replaced — the seam is `onMessage`, not `authorize` |
| **(c) A framework `onMessage` decorator hook or a `rateLimit` option on `WebSocketHooks`** | Wrapper ordering is significant and unstated, and the framework cannot order its wrapper against the app's. One registrant, guessed seam. Cost of rejecting: an application writes five lines |
| **(d) An instance-scoped limit on roster writes and control publishes** | The one shape with no rotatable key — and it **refuses the wrong connection**. An empty bucket rejects whoever arrives next, who by construction is not the abuser. This failure mode reappears twice in the audits (R4, and the anonymous-bucket trap in FR-003), which is why it is worth naming twice |
| **(e) Coalescing roster writes in `#syncRosterMember`** | Forbidden by a standing decision: ADR 003 §6 — coalescing would reintroduce a remembered desired state |
| **(f) A "what would this frame cost" query on the public surface** | One caller, guessed seam, leaks `subscriptions` / `presence` through a published API. A ceiling needs a flat weight per verb per kind, which `channelKind` already gives — and A1 shows the first draft of this plan violated that rejection in prose |
| **(g) A subscribe-ONLY budget** *(added by the security audit — it escapes (a)'s decisive objection)* | `subscribe` has **no** non-client callers, so the six-path problem does not arise, and no cycle runs without a subscribe. Rejected on the remaining grounds: it is still not a bound (the reconnect resets it), it still enters the #323 co-turn, and it still cannot be keyed on anything the framework owns. **On the record as considered, not absent** |

## 11. Security audit

*`security-expert`, run against THIS document in parallel with the architecture audit. 10 findings —
3 HIGH, 5 MEDIUM, 1 LOW, 1 INFO. Verdict `fail`. Kept separate on purpose: the architect asks
whether a rule has one home; this seat asks whether that home is reachable by someone who should not
reach it.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | **HIGH** — the application authorizer is the package's **largest** unmetered per-frame cost, and the plan counted it nowhere. It runs *ahead of every cap*, so a **denied** subscribe on an invented `private-*` name buys a full DB read / audit write for one 30-byte frame; it doubles as a channel-name enumeration oracle. **This corrects #329**, which proposes that hook as the mitigation | **Plan changed.** §1 gains the row, FR-004 gains an authorizer-invocations column, FR-006 gains the item. To be said on the issue |
| S2 | **HIGH** — R4 named `@lockness/core`'s upgrade throttle as the bound; all three legs are conditional. Nothing applies a throttle by default; `by: 'ip'` reads forwardable headers; **with no proxy `clientAddress` returns `'unknown'` for every request** — one global bucket | **Plan changed.** R4 rewritten to state that the accepted state is *nothing bounds it by default*, with the three preconditions named. FR-003's example shows the throttled upgrade route beside the metered `onMessage` |
| S3 | **HIGH** — the plan's own recommended meter collapses to **one shared bucket** for every anonymous socket (`resolveIdentity` is optional; default `identity = null`), so one unauthenticated socket denies service to every other — rejected option (d) reappearing inside the remedy | **Plan changed.** FR-003 requires `identity === null` as the example's **first** branch, with the two admissible shapes stated; FR-006's last item amended; §2 edge case added |
| S4 | **MEDIUM** — `this.presence` is never deleted; every unique presence channel name retains an empty `Map` forever, so presence churn is **not** cost-neutral at rest | **Plan changed.** Recorded as **R5** and filed under FR-009 as a code defect (outside FR-001's no-code constraint); FR-006 names it until it lands |
| S5 | **MEDIUM** — §6 proved "not a bound" and concluded "not worth building" without pricing the bypass, and the option space omitted the **subscribe-only** shape | **Objection accepted; the conclusion stands and the reasoning is replaced.** §6 now prices the bypass (two to three orders of magnitude of attacker cost, moved into a layer that already has throttles and logs) and leads with the real reason — revocation degradation. §10 gains option (g) |
| S6 | **MEDIUM** — "does not rotate" is not "cannot be minted": under open self-registration `identity` is as mintable as `connection.id`, at signup cost | **Plan changed.** §6's `Charge target` vocabulary now names **both** properties; FR-003 requires the second-key guidance for unauthenticated signup |
| S7 | **MEDIUM** — `Identity = unknown`, so `buckets.get(connection.identity)` on an object identity keys a `Map` **by reference**, misses every time, and the meter **fails open** silently — the most likely wrong way to follow the advice | **Plan changed.** FR-003 requires a stable **string projection**; US2 and §6 reworded from "keyed on `connection.identity`" |
| S8 | **MEDIUM** — FR-006's "exhaustive" list was not exhaustive: it missed the decode-rejection path (a full encode of the whole frame **before** the size check, plus one `console.error` per malformed frame without an app `onError`), the denied-authorizer call, and the retained `presence` entry | **Plan changed.** Three items added; FR-003 installs `onError`. Noted in §1 that #329's `register` frame does not exist |
| S9 | **LOW** — `channelKind` **fails open**: a name matching neither prefix is public, runs no authorizer, and a one-character slip (`orders-private`) silently makes a gated channel world-readable | **Plan changed.** One sentence in FR-003: naming *is* the access control |
| S10 | **INFO** — verdict on publishing exact amplification factors: **publish**, unhedged. The counts are derivable from published source in minutes or from `MONITOR`; withholding them is obscurity paid for by defenders only, and the operator population is orders of magnitude larger | **Accepted, with one boundary made binding.** FR-004 forbids any benchmarked throughput/latency/capacity figure — that would describe the maintainer's machine, not the framework, and is hard rule #10's line |

**Verdict**: `fail` — **coverage**: the plan document against `manager.ts`, `channel.ts`,
`protocol.ts`, `types.ts`, `websocket.ts`, `driver.ts`, `drivers/redis.ts`,
`packages/redis/subscriber.ts`, `packages/core/http/throttle_middleware.ts` and `docs/realtime.md`.
It answered the cross-account question by enumeration rather than by assertion, and found **no**
framework-side IDOR: `unsubscribe` / `disconnect` / `evict` take a bare `clientId` but `ClientMessage`
carries no client identifier, so none is reachable from the wire; private/presence delivery requires
`identity !== null` plus the app's approval; roster removal is computed from local state, never from
the wire; control frames are HMAC-authenticated. **What a stranger does get is S1.** Hard rule #10:
the plan is clean, and the one way this feature could cross the line is the benchmarked table (S10).

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| *(none outstanding — see below)* | | |

### Decided without asking

- **Whether to build a churn meter at all, and where the policy lives** — a design decision, so it
  went to `architect-expert` under hard rule #11, not to the user. Recorded in §10 and implemented
  rather than re-asked.
- **The getter versus the arithmetic workaround (A2).** The audit seat offered both and said "decide
  it in §12, do not leave both live", naming (b) — one read-only getter — as the cleaner shape and
  the smallest possible surface change. Taken. It is **additive and non-breaking**, so it is a minor
  bump rather than a release-model decision; it is called out here so a wrong assumption is visible.
- **#329's fifth acceptance criterion is amended, not met as written.** "Bounded driver call count
  and bounded control-message publish count" presumes option (a) — a publish count is bounded only by
  refusing frames. It becomes an **exact composite** assertion, which is worth strictly more: it makes
  the published table executable.
- **R2 is accepted rather than filed, reversing this plan's own first draft**, on the audit's
  evidence: it predates #330, belongs to `RedisClient.commandTail`, and is bounded by the meter this
  feature documents.
- **The cost table's home is the test, not the prose** — and its *composite* totals, not its atoms,
  because three shipped tests already own those.
- **R3 and R4 are recorded as accepted rather than filed.** Neither is a defect with a fix — R3 is
  hook surface deliberately not added, R4 is a bounded-context boundary whose conditionality is now
  stated in full.
