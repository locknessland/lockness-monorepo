# Plan: Nested-prefix isolation for the Redis realtime driver

**Branch**: `247-nested-prefix-isolation` | **Date**: 2026-09-06 | **Backlog item**:
[#288 — Realtime: a deployment with a nested prefix receives another deployment's events AND its unverified control frames](https://github.com/locknessland/lockness-monorepo/issues/288)

**This is the feature's one planning document.** Business and technical together, read whole by
whoever implements it.

---

## 1. Why this exists

`RedisBroadcastDriver.onMessage` subscribes with the glob `${prefix}:*`
(`packages/realtime/drivers/redis.ts:722`). A Redis glob `*` matches across **any** characters, `:`
included. So two deployments sharing one broker whose prefixes nest — `app` and `app:eu` — are not
isolated in one direction:

```
app:*  ⊃  app:eu:orders      # outer receives the inner's EVENTS
app:*  ⊃  app:eu__control    # outer receives the inner's control frames
```

The reach is not a hypothesis. `SC-002` in `packages/realtime/tests/prefix_anchoring.test.ts:365`
asserts it exactly, against the driver's own recorded subscriptions, and passes today.

### What is actually broken, and what is not

Three claims in #288's body do not survive contact with the code. They are corrected here because
each one changes what the fix has to achieve.

| #288 claims | What the code does | Evidence |
| :--- | :--- | :--- |
| The inner deployment's `origin`, `target`, `member`, `ts`, `nonce` and `mac` "are handed to the outer deployment's subscribers as an ordinary event payload" | They are **not**. A control wire carries no `event` field, and `redis.ts:736-744` drops any ingested payload whose `event` is not a string, before `handler(...)`. The frame is delivered by the broker and discarded by the driver. | `publishControl` builds `ControlWire` (`redis.ts:779-788`) — `kind`/`target`/`channel`/`member`/`origin`/`ts`/`nonce`/`mac`, no `event`. |
| "The MAC is bypassed by routing" | Not reached ≠ bypassed. Nothing downstream trusts the frame. | Same ingest check. |
| `SC-002` "is landed `ignore: true`" | It is **not** ignored. It was rewritten to assert current behaviour, precisely so it goes RED when #288 is fixed. | `grep -n 'ignore' packages/realtime/tests/prefix_anchoring.test.ts` → three comment lines, no `ignore:` option. |

**A fourth correction, this one to an earlier draft of this plan** (security audit S1). That draft
asserted a live contradiction between `redis.ts:33` and `redis.ts:254-260`, quoting the latter as
documenting the prefix as *"multi-app / multi-tenant isolation"*. **It does not.** #282 already
rewrote it, and it now reads *"**Not an isolation boundary**, despite what this docstring said until
#282 … Calling it 'multi-tenant isolation' is what would lead an operator to give two deployments
nested prefixes"*. The stale sentence lives on only in #288's body. There is no contradiction to
resolve — and an FR instructing an implementer to "resolve it in favour of one statement" would most
naturally *soften* a docstring that is currently correct, recreating the root cause. FR-006 is
written accordingly.

### The P0 that remains

The **event** disclosure is real and unmitigated: `app:eu:orders` reaches the outer driver, `app:` is
stripped, the channel `eu:orders` passes `isValidName` (charset `[A-Za-z0-9:._-]` permits `:`), and
`handler({channel: 'eu:orders', event, data})` delivers the inner deployment's payload to the outer
deployment's subscribers. One tenant reads another's realtime traffic, from configuration alone.

Secondary cost: the outer deployment burns broker fan-out on traffic it discards, and logs a WARN per
inner control frame whose text (`"dropped a Redis message with an invalid name"`) does not describe
what happened. That WARN is **not** framed here as a security signal being lost (S10): after the fix
nesting is harmless outbound, and it never signalled the inbound exposure that persists.

## 2. User scenarios

### US1 — Two nested deployments on one broker are isolated outbound (P1)

**Given** one Redis broker, an instance configured with `prefix: 'app'` and an instance configured
with `prefix: 'app:eu'`
**When** the `app:eu` instance publishes an event on channel `orders`
**Then** the `app` instance's `onMessage` handler is never invoked, and **the broker never routes the
frame to it** — the subscription does not match, rather than the payload being filtered after arrival.

### US2 — A control frame cannot reach the event handler, whatever the prefixes (P1)

**Given** any two prefixes accepted by the driver's own validation
**When** either publishes a control frame
**Then** no `PSUBSCRIBE` pattern derived by the other — or by itself — can match that control topic,
so `#verifyAndDecode` is the only path a control frame has and the MAC check cannot be skipped by
routing.

### US3 — The live-broker suite still proves what it claims (P1)

**Given** the live-broker tests, whose readiness gate `awaitSubscribers` counts `PUBLISH` receivers on
`${prefix}:probe-ready` (`tests/live_realtime.ts:83`, used at `:312`)
**When** the event topic changes
**Then** the gate is re-pointed in the same commit — otherwise it matches no subscription, every live
test times out after 10s, and any "the driver did **not** receive X" assertion passes for the wrong
reason.

### US4 — An operator upgrading a multi-instance app is told what happens (P2)

**Given** an app running N instances of a pre-change `@lockness/realtime`
**When** the operator deploys this change
**Then** `docs/realtime.md` states that the wire topic changed, that pre- and post-change instances do
not exchange events, and that the remedy is to restart the fleet together — pub/sub is not durable, so
nothing is queued and nothing is lost beyond the in-flight window.

### Edge cases

- **A prefix containing the reserved separator lead-in** (`app__event:x`) reopens the hole one level
  up. Refused by FR-003.
- **The trailing-underscore pair** (`app` / `app_`) is the only near-miss in the isolation proof —
  patterns `app__event:*` and `app___event:*` diverge at one offset. It must be a test fixture
  (FR-005), not a proof step nobody re-runs.
- **A channel containing the separator** (`__event:x`, `__control` — both legal under `NAME_RE`, which
  permits `_` and `:`). Must round-trip: the channel sits entirely to the right of every pattern's
  literal part, so it cannot forge a topic — but a `replace()`-based strip would corrupt it.
- **A channel containing `:`** (`presence-room.1:v2` is explicitly legal, `protocol.ts:78`). Must keep
  working: the fix constrains the **prefix side** of the topic, never the channel side.
- **The default prefix** `lockness:realtime` contains `:` but no `__`, and stays valid.

## 3. Requirements

- **FR-001**: The event topic is `${prefix}__event:${channel}` and the event subscription is
  `${prefix}__event:*`. The `:` separator between prefix and channel is gone from the topic.
- **FR-002**: The separator has **one production home**: a member returning the topic *prefix*, not
  the topic. `topic(channel)`, the subscribe pattern, and the ingest strip length are all derived from
  it. The strip is a **fixed-offset slice**, never a `replace`/`split` — a channel may legally contain
  the separator. A topic that does not start with the expected marker is **dropped with a WARN naming
  the shape mismatch**, never passed through as a channel name (today `redis.ts:724-726` falls back to
  the raw topic).
- **FR-003**: A prefix containing the two-character sequence `__` is refused at construction, with the
  same shape of error as the existing glob-metacharacter refusal. This quantifies over **all**
  prefixes: a substring test, not an enumeration.
- **FR-004** *(the invariant that makes FR-001 and FR-003 one decision rather than two)*: **Every
  reserved separator this driver introduces MUST begin with the two-character sequence
  `assertUsablePrefix` refuses.** `__control` and `__event:` both do, which is *why* the isolation
  theorem holds. A future `__presence:` would be safe by accident; a future `#event:` would break the
  theorem and pass every test in this plan. The rule is stated at the constant, with the proof sketch.
- **FR-005**: `SC-002` is rewritten as a loop over an explicit **pair table** — at minimum
  `('app','app:eu')`, `('app:eu','app')`, `('app','app_')`, `('app_','app')` — asserting the reachable
  set is empty **per pair, with the pair named in the failure message**, and carrying a **positive
  control in the same body**: each prefix's own pattern must match its own topic. An empty-set
  assertion with no positive control is satisfied by a neutered `globMatches`, a zero-subscription
  `exercise`, or a deleted loop body — the exact failure `prefix_anchoring.test.ts:22-55` records five
  times.
- **FR-006**: The prefix's guarantee is stated **once**, post-fix, at
  `RedisBroadcastDriverOptions.prefix`; the other four sites become pointers to it. The surviving
  sentence is, verbatim: *"The prefix bounds this driver's **outbound routing**: no deployment receives
  another deployment's frames. It is **not** an inbound boundary — any client on the broker can publish
  into, and read from, these topics and keys. Use Redis ACLs for that."* The five sites are
  `packages/realtime/drivers/redis.ts:33-35`, `:253-261`, `docs/realtime.md:427-441`,
  `packages/realtime/README.md:50-55`, `packages/realtime/AGENTS.md:93-102`. Two of them state things
  that become **false** after the fix and are not optional to update.
- **FR-007**: `docs/realtime.md` states the wire change, its rolling-upgrade consequence, and the
  residual in **both** directions (FR-011). The "no compatibility shim" decision is recorded as an
  **ordering constraint**, not an observation: this must land in or before the first release that
  publishes `@lockness/realtime`; if that release ships first, the shim question reopens.
- **FR-008**: **Every** test that hard-codes an event topic or the event pattern is re-pointed. The set
  is 20 sites across 5 files (§8). Each **negative** ingest test — `driver_redis.test.ts:143`, `:162`,
  `:181` — must be **observed failing before it is re-pointed**: `FakeRedisBus` routes by
  `topic.startsWith(pattern.replace(/\*$/,''))` (`:34`), not by a glob, so after the change those
  topics reach no handler and their `assertEquals(got.length, 0)` passes vacuously.
- **FR-009**: `tests/live_realtime.ts` is corrected in the same commit: `probeTopic` (`:83`) becomes an
  event topic under the new marker, and the unused `eventTopic` (`:64`, `:80` — no caller anywhere in
  `packages/`) is deleted rather than updated. A second spelling nothing executes cannot go red.
- **FR-010**: The set of prefix-derived names is enumerated by **search over the whole package**
  (`grep -rn 'prefix' packages/realtime/`), not one file — the harness at `tests/live_realtime.ts:69-83`
  is a second home a single-file grep cannot see. The **executable** enumerator is SC-004's source
  regex (`prefix_anchoring.test.ts:262-268`); the grep is its human-readable restatement, not a rival
  authority.
- **FR-011**: The residual exposure is stated in both directions and its compensating control is named
  as the **condition** under which the out-of-scope decision is safe: inbound, any broker client can
  `PUBLISH` into these topics; outbound, any broker client can `PSUBSCRIBE ${prefix}__control` and read
  every control frame in clear (connection ids, `member.info`, instance ids), `HGETALL` the presence
  rosters, `SMEMBERS ${prefix}:instances`, and `ZRANGEBYSCORE ${prefix}:revocations`. The MAC protects
  integrity, not confidentiality. The compensating control is a Redis ACL scoped per deployment.
- **FR-012**: **Every** name the driver derives is anchored with a `__`-leading separator, keys as
  well as topics — the enumeration is FR-010's search, not a list. The five live keys become
  `${prefix}__presence:${channel}`, `${prefix}__owned:${id}`, `${prefix}__alive:${id}`,
  `${prefix}__instances`, `${prefix}__revocations`. **The two legacy keys keep their `:` shape**
  (`${prefix}:revoked`, `${prefix}:revoked:${target}`): they exist solely to read what a pre-#276
  instance wrote at those exact names, so renaming them would delete their only purpose. They are the
  documented exception, and [#278](https://github.com/locknessland/lockness-monorepo/issues/278)
  removes them — which closes the residual rather than papering over it, and
  [#278 now records that](https://github.com/locknessland/lockness-monorepo/issues/278#issuecomment-5559191487)
  with the concrete collision (`app` and `app:revoked` are both accepted and
  derive the same key).
- **FR-013**: The prefix is validated by a **positive allowlist**, `/^[A-Za-z0-9:._-]{1,64}$/`, plus
  the FR-003 `__` rule. This is the same alphabet as `NAME_RE`, so the isolation proof holds over one
  charset instead of two. `PREFIX_GLOB_CHARS` **stays** as defence in depth, with a comment recording
  that the allowlist now implies it — a redundant control that is documented as redundant is not
  duplication, and removing it would make the guard depend on the allowlist never loosening.

## 4. Success criteria

- **SC-001**: With two deployments whose prefixes nest, neither receives any frame the other
  published — measured at the broker's routing decision, not by a post-delivery filter.
- **SC-002**: No pattern either deployment subscribes can match any topic the other publishes, for
  every pair of prefixes the driver accepts — demonstrated over a pair table that includes the
  trailing-underscore near-miss, each pair with a positive control.
- **SC-003**: A channel containing `:` **and** a channel containing the reserved separator both
  round-trip publish → deliver → correct channel.
- **SC-004**: Isolation does not depend on channel validation. After the fix the channel sits entirely
  to the right of every pattern's literal part, so even a wholly unvalidated channel cannot cross into
  another accepted prefix — a two-validator dependency becomes a one-validator dependency.
- **SC-005**: The live-broker suite passes with the same assertions it makes today, none of them
  timing out and none passing because a topic reaches nothing.
- **SC-006**: An operator reading `docs/realtime.md` can state, without reading code, what happens to a
  fleet mid-upgrade and what the prefix does and does not guarantee in each direction.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Where an event topic's prefix ends and the channel begins | `packages/realtime/drivers/redis.ts` — `private get eventTopicPrefix()` returning `` `${this.prefix}__event:` `` | Any second literal `'__event:'` in **production**. `topic()`, the `PSUBSCRIBE` pattern and the ingest strip length all read this member. Deriving the pattern via `topic('*')` is the shape to reject: `PUBLISH` is a literal context and `PSUBSCRIBE` a pattern context, and one builder serving both means a future escape inside `topic()` silently corrupts the subscription. Tests pin the literal **on purpose** — a wire-format test that computes its expectation from the code under test asserts nothing — so the rule is *one production expression*, not one expression. |
| What may be used as a reserved separator | `packages/realtime/drivers/redis.ts` — the module constant block beside `PREFIX_GLOB_CHARS` | Adding a separator that does not begin with the refused sequence. The isolation theorem holds **only** because `__control` and `__event:` both start with `__`; a `#event:` breaks it and passes every test here. The rule and its proof sketch live at the constant, not in this plan. |
| Which prefixes are usable | `packages/realtime/drivers/redis.ts` — `assertUsablePrefix` | A second validation at `topic()`/`controlTopic`; a test asserting a bad prefix by listing values rather than by the rule; a doc listing allowed characters independently of the constant. It is the only code that sees the prefix before any name is derived (called at `:529`, before every getter), and it already owns the structurally identical glob rule. |
| That a control frame is authenticated before it is obeyed | `packages/realtime/drivers/redis.ts` — `#verifyAndDecode` | The `onMessage` ingest check dropping a control-shaped payload is a **second asker, not a second decider** — it stays, and its comment says it is defence in depth. Verified: the only route to `onControl`'s handler is `psubscribe(controlTopic, …)` → `#verifyAndDecode` → `if (control) handler(...)`, and it fails closed with no secret configured (`:1080-1088`). The change narrows a pattern; a narrowing cannot admit anything new. |
| What happens to an ingested topic of unexpected shape | `packages/realtime/drivers/redis.ts` — `onMessage`'s strip branch | The current `: topic` fallback, which renames a mismatch into a plausible, charset-valid channel. Deny by default: drop and WARN. |
| What counts as a prefix-derived name | `packages/realtime/tests/prefix_anchoring.test.ts` — SC-004's source regex (the only enumerator that runs in CI) | FR-010's grep acting as a second authority rather than a restatement; `PREFIX_MEMBERS` edited to go green. Note: re-homing the separator on `eventTopicPrefix` **changes what that regex matches** — both need deliberate edits. |
| What "anchored under a prefix" means for a derived name | `packages/realtime/tests/recording_ports.ts` — `isAnchored` / `ANCHOR_SEPARATORS` | Any test re-implementing `startsWith(prefix)` inline. **No code change here**: `ANCHOR_SEPARATORS` already reads `[':', '__']` (`:118`). The edit this file needs is the `isAnchored` docstring (`:120-142`), which narrates the #288 leak in the present tense, plus a line recording that anchoring is **not exclusive** between prefixes differing by a trailing separator (`isAnchored('app___event:x','app')` is `true`) — exclusivity is tested by SC-002, not by this predicate. |

## 6. Technical context

**Language/Version**: TypeScript on Deno (TC39 Stage 3 decorators)
**Primary Dependencies**: `@lockness/redis` (the two injected ports), `@lockness/contract`
**Storage**: Redis — pub/sub topics and keys, no durable state
**Testing**: `deno test`; `tests/prefix_anchoring.test.ts` (recording ports, no broker), `tests/driver_redis.test.ts` (fake bus), plus the live-broker suite
**Target Platform**: Deno server, multi-instance
**Project Type**: framework library
**Performance Goals**: unchanged — a topic rename, not an algorithm change
**Constraints**: `@lockness/realtime` is not on JSR (404, checked 2026-09-06) and is imported by no other package, `app/`, `config/` or `main.ts`. But `packages/realtime/deno.json` carries `"version": "0.2.0"` and this repo versions in lockstep, so the next `/ship` publishes it — hence FR-007's ordering constraint rather than a snapshot.
**Scale/Scope**: 1 production file, 5 test files, 4 docs — see §8. Not "one, one, one"; an earlier draft said so and was wrong.

### Domain model

No new entities. The vocabulary the code must use:

- **Prefix** — value object. The operator-chosen reservation. Invariant: non-empty, no Redis glob
  metacharacter, no `__`.
- **Reserved separator** — value object. Invariant: begins with the sequence the prefix guard refuses.
  This is the invariant the isolation theorem rests on.
- **Event topic** / **control topic** — value objects derived from a prefix. Invariant: neither is
  matchable by a pattern derived from a *different* accepted prefix.
- **Channel** — value object, charset `[A-Za-z0-9:._-]`, max 200. Unchanged by this feature.
- **Undocumented invariants worth writing down** (both currently true by construction, both silently
  breakable): the client-controlled segment is always **last** in a key, after a fixed infix — which is
  why a channel named `instances` yields `app:presence:instances`, never `app:instances`. And
  `OWNED_SEP` is a space (`redis.ts:423`), outside `NAME_RE`, which is why a validated channel cannot
  shift the ghost-sweep's split (`:1288`) onto another user's member. "Tidying" that separator to `:`
  would make it a cross-user presence-removal primitive.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1. No direct `hono` import | pass | Not touched. |
| 2. JSR-only, declared per package | pass | No dependency change. |
| 3. No `any` in exported APIs | pass | No signature change. |
| 4. Tailwind v4 syntax | pass | No UI. |
| 5. Pre-completion gate | pass | Enforced before review. |
| 6. Never hand-edit `deno.lock` | pass | No dependency change. |
| 7. JSDoc on public APIs | pass | `topic()`, `controlTopic`, the new `eventTopicPrefix` and the constructor's `@throws` all change. `controlTopic`'s stated reason (*"WITHOUT the `:` separator so it never matches the `${prefix}:*` event pattern"*) is the sentence this change invalidates. |
| 8. MVC layering | pass | Driver/adapter layer only. |
| 9. One category per commit | pass | `fix` (driver + guard), `test` (SC-002 + the 20 re-points + the harness), `docs` — three commits. |
| TDD | pass | SC-002 exists and asserts the defect; rewriting it to the pair table first is the failing test. FR-008 additionally requires each negative ingest test be **observed failing** before re-pointing. |
| No silent catches | pass | The one `catch` in `onMessage` keeps its WARN; the new shape-mismatch branch gains one. |

### Complexity tracking

No violations.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `RedisBroadcastDriver` public API | no | Same constructor, methods and types. |
| Redis wire format | **yes** | Event topic `${prefix}:${channel}` → `${prefix}__event:${channel}`. Breaking between instance versions. |
| Accepted configuration | **yes** | A prefix must match `/^[A-Za-z0-9:._-]{1,64}$/` and contain no `__`. The default `lockness:realtime` passes. |
| Redis **key** names | **yes** | 5 live keys move to `${prefix}__…`. Rosters, instance inventory and the revocation index discontinue across the upgrade — same restart the wire break already requires. The 2 legacy keys keep their `:` names on purpose (FR-012). |
| WebSocket / client protocol | no | Channel names and frames unchanged. |
| Memory driver | no | Prefixes are a Redis concern. |

**Counted blast radius.** 14 `this.prefix` references in `drivers/redis.ts` (`:528, :529, :649, :659,
:663, :667, :671, :675, :688, :693, :698, :722, :724, :725`) deriving 10 names. With Q1 answered,
**8 expressions change**: `topic()` `:649`, the pattern `:722`, the strip `:724-725`, and the five live
keys `:663, :667, :671, :675, :688`. **Unchanged: the 2 legacy keys** (`:693`, `:698`) — deliberately,
per FR-012. **5 docstrings** become wrong or incomplete (`:33-35`, `:159`, `:253-261`, `:518-521`,
`:654-656`); `assertUsablePrefix`'s own docstring (`:200-231`) changes with FR-013.

Q1 also widens the test sweep beyond the 20 event-topic sites below: every pinned **key** name moves
too — `prefix_anchoring.test.ts`'s `shapes` map (`:288-300`), `live_realtime.ts`'s `keys()` (`:69-83`),
and the live key assertions. FR-010's package-wide search is what enumerates them; do not work from
this paragraph.

| Test file | Sites hard-coding the old shape |
| :--- | :--- |
| `tests/driver_redis.test.ts` | `:34` (the fake bus matcher), `:143`, `:162`, `:181`, `:198`, `:238` |
| `tests/driver_redis_live.test.ts` | `:43` (`PATTERN`, used 8×), `:133`, `:180`, `:196` |
| `tests/prefix_anchoring.test.ts` | `:10`, `:30-42`, `:161`, `:232-242`, `:267`, `:294`, `:349-351`, `:378-403` |
| `tests/live_realtime.ts` | `:64`, `:80`, `:83` |
| `tests/recording_ports.ts` | `:120-142` (docstring) |

Docs: `docs/realtime.md:427-441`, `packages/realtime/README.md:50-55`,
`packages/realtime/AGENTS.md:93-102` (already stale — it says SC-002 is "landed `ignore`d").

### Documentation (this feature)

```text
.specnaut/specs/247-nested-prefix-isolation/
├── plan.md
└── tasks.md
```

### Visual Prototyping with Claude Artifacts

Nothing to prototype. This feature changes a Redis topic name and a constructor validation; no screen
or state changes.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| Three negative ingest tests degrade to vacuous passes | FR-008 — each is observed failing before it is re-pointed. This is the single most likely way this P0 ships with green tests proving nothing. |
| The live suite times out wholesale on `probeTopic` | FR-009 — corrected in the same commit; SC-005 asserts the suite still passes on its own assertions. |
| A future separator breaks the theorem silently | FR-004 — the rule lives at the constant with its proof sketch, not in this document. |
| The separator gets spelled twice and drifts | Decision table row 1: one **production** expression; `onMessage` reads `eventTopicPrefix`, never its own string. |
| The wire break lands between two published versions | FR-007's ordering constraint. The JSR 404 is a fact about one day, not a property. |
| The `#273` reaper comment at `redis.ts:221` describes a `SCAN MATCH` this file no longer has | Confirmed: the reaper lives in the test harness (`tests/live_realtime.ts:425`), not in shipped code. Out of scope; follow-up. |

## 10. Architecture audit

*`architect-expert` against this document, before any code existed. Verdict: **fail** — 0 critical, 6
high, 4 medium, 2 low. Every finding is folded in below.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | HIGH — FR-006 claimed to de-duplicate a statement with five homes and named two | Plan changed: FR-006 enumerates all five by `path:line`. Its **premise** was separately falsified by S1 and rewritten — see §1. |
| A2 | HIGH — row 1 homed the decision in `topic(channel)`, which returns neither the pattern nor the strip length `onMessage` needs | Plan changed: re-homed on `eventTopicPrefix`. Also flagged that this changes what SC-004's regex matches, so `PREFIX_MEMBERS` and the regex need deliberate, not go-green, edits. |
| A3 | HIGH — "`__event` in exactly one expression" is falsified by FR-005 and invites a tautological test | Plan changed: *one **production** expression*; tests pin the literal on purpose, as the wire contract. Precedent measured: `__control` already appears in 6 non-production places. |
| A4 | HIGH — FR-001 and FR-003 are one decision recorded as two; the joining invariant is written nowhere | Plan changed: FR-004 and its own decision-table row. The audit called this the highest-value edit in it; agreed. |
| A5 | HIGH — three negative ingest tests silently become vacuous passes; radius undercounted by 4 test files and 3 docs | **Verified independently** at `driver_redis.test.ts:34`. Plan changed: FR-008, a §9 risk row, and a counted §8. |
| A6 | HIGH — the inverted SC-002 is an empty-set assertion with no positive control | Plan changed: FR-005 requires a positive control in the same body. |
| A7 | MEDIUM — FR-002 said "strips" without saying how, and was silent on a non-matching topic | Plan changed: fixed-offset slice; drop-and-WARN on mismatch. |
| A8 | MEDIUM — FR-004's enumerator had no home; three rival counts exist (14 / 9 / 10) | Plan changed: FR-010 names SC-004's regex as the executable authority. |
| A9 | MEDIUM — keys are excluded on a reach argument; the residual risk is **collision** | **Verified independently**: `app` + channel `eu:presence:room` and `app:presence:eu` + channel `room` both derive `app:presence:eu:presence:room`. Both prefixes accepted, channel valid. Escalated to **Q1** — this is a user decision, not an editorial one. |
| A10 | MEDIUM — the rejected alternative is recorded with the weaker of its two arguments | Plan changed, §12. The decisive argument is correctness, not cost: per-channel `SUBSCRIBE` cannot satisfy SC-002, because `p="app"`+channel `"eu:orders"` and `q="app:eu"`+channel `"orders"` produce the *identical* topic. It is an optimisation, not a substitute. Its blocker is #290. |
| A11 | LOW — row 4 prescribed a no-op; `ANCHOR_SEPARATORS` already contains `__` | Plan changed: the row now says "no code change" and names the docstring that does need editing. |
| A12 | LOW — `live_realtime.ts`'s `eventTopic` is a second spelling nothing executes | **Verified**: `grep -rn eventTopic packages/` → declaration and definition only, no caller. FR-009 deletes it. |

**Verdict**: fail, on six HIGH design gaps — all folded in above. **Coverage**: the plan whole;
`drivers/redis.ts` whole (all 14 `this.prefix` sites and every named member);
`prefix_anchoring.test.ts` and `recording_ports.ts` whole; `driver_redis.test.ts`,
`driver_redis_live.test.ts`, `live_realtime.ts` in the relevant ranges; `protocol.ts`;
`docs/realtime.md:380-455`, `README.md:40-60`, `AGENTS.md:80-110`; ten open issue bodies. **Not
covered**: runtime behaviour of any of it (nothing executed, no broker); `manager.ts`, `channel.ts`,
`websocket.ts`, `control_replay_window.ts`; the memory driver; `@lockness/redis` beyond the two port
declarations.

## 11. Security audit

*`security-expert`, in parallel. Verdict: **needs_followup** — 0 critical, 0 high, 5 medium, 5 low.*

**The proof generalises to keys, which is what makes FR-012 safe.** Every derived name is now
`prefix + "__" + family(+separator) + tail`. For accepted `P ≠ Q` the same positional argument applies
to any two families: if `|Q| ≥ |P|+2` then `Q` contains the `__` and is refused; if `|Q| = |P|+1` then
`Q = P+"_"` and the literals diverge one offset later; equal lengths diverge inside the prefix. So no
two accepted prefixes can derive an equal name, in **any** family — which is exactly the collision A9
found, closed structurally rather than documented. The two legacy `:`-shaped keys are outside this and
are named as the exception.

**The central claim survived adversarial analysis, and both seats proved it independently.** For
accepted prefixes `P ≠ Q` (non-empty, no `*?[]\`, no `__`) and arbitrary channel `C`, `Q__event:*`
cannot match `P__event:C`: if `|Q| ≥ |P|+2` then `Q` contains the topic's `__` and is refused; if
`|Q| = |P|+1` then `Q = P+"_"` and the literals diverge at offset `|P|+2` (`_` vs `e`); equal lengths
diverge inside the prefix. The same argument kills event-pattern-vs-control-topic, and `Q__control` is
glob-free so it matches only itself. **The proof is purely positional and never uses the channel
charset** — which is SC-004, and is the strongest property this change buys.

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | MEDIUM — FR-006 rested on a premise that is already false: #282 removed the "multi-tenant isolation" wording, so there is no contradiction, and "resolve it in favour of one statement" invites *softening* a correct docstring | **Verified independently** at `redis.ts:253-261`. §1 corrected — the stale quotation was mine, taken from #288's body. FR-006 now states the surviving sentence verbatim instead of instructing a choice, and adds `docs/realtime.md:427-441` (whose "does not isolate outbound either" becomes false) to scope. |
| S2 | MEDIUM — `tests/live_realtime.ts:80` is a second home for the topic that FR-004's single-file grep cannot see | **Verified, and sharper than reported**: `probeTopic` (`:83`) is not incidental — `awaitSubscribers` (`:290-312`) is the readiness gate for *every* live test and counts `PUBLISH` receivers on it. Un-re-pointed, the whole live suite times out. FR-009 + FR-010 + US3 + SC-005. |
| S3 | MEDIUM — a claim quantified over all prefix pairs, tested with one pair, and not the adversarial one | Plan changed: FR-005's pair table includes `('app','app_')`; SC-003 gains the separator-bearing channel; SC-005 fixtures gain `__` cases, one occurrence each — the discipline `prefix_anchoring.test.ts:414-417` already documents for metacharacters. |
| S4 | MEDIUM — the prefix stays a 6-item denylist with no charset allowlist or length cap, while the *less* trusted channel gets a positive allowlist | Escalated to **Q2**. The seat was explicit that it could not turn this into an exploit (UTF-8 is self-synchronising, so no multi-byte sequence contains the metacharacter bytes) — and that having to reason it out is what an allowlist removes. Cheap now, a breaking config change once operators have prefixes in production. |
| S5 | MEDIUM — the out-of-scope statement names only inbound `PUBLISH`; the residual **read** side is strictly larger and enumerated nowhere | Plan changed: FR-011 states both directions and names the Redis ACL as the *condition* under which the out-of-scope decision is safe, not as a suggestion. |
| S6 | LOW — `onMessage`'s non-matching branch falls open to the raw topic | Plan changed: FR-002 (same as A7). Note `isValidName('app__control')` is `true`, so the ingest check does not stop it — only the absent `event` field does. |
| S7 | LOW — deriving the pattern from `topic()` conflates a literal context with a pattern context | Plan changed: decision-table row 1 rejects `topic('*')` explicitly (same as A2, reached independently). |
| S8 | LOW — `ANCHOR_SEPARATORS` already has `__`; `isAnchored` is ambiguous for the trailing-underscore pair | Plan changed: row 7 (same as A11), plus the docstring line recording that anchoring is not exclusive. |
| S9 | LOW — "no shim owed" rests on a JSR snapshot, not a release-ordering constraint | Plan changed: FR-007 states it as an ordering constraint; §6 records that lockstep versioning means the next `/ship` publishes the package. |
| S10 | LOW — the plan framed the disappearing WARN as a security improvement; it is also the only current signal of nested prefixes | Plan changed: §1 no longer frames it that way. No new detection is warranted — nesting becomes harmless outbound, and the WARN never signalled the inbound exposure. |

**Positive results worth recording** (a clean verdict is worth what it covered):

- **`#verifyAndDecode` is the single decider, verified against the code**: the only route to
  `onControl`'s handler, no bypass branch, and it **fails closed with no secret configured**
  (`:1080-1088`, before parsing). The self-loopback skip runs before the MAC and is not exploitable — a
  forged frame carrying a victim's `instanceId` is dropped only by that victim.
- **Keys are never glob-matched in production**: `psubscribe` appears at exactly two sites (`:723`,
  `:759`); no `SCAN`/`KEYS`/`MATCH` anywhere in `drivers/redis.ts` or `manager.ts`.
- **Logs are clean**: all 18 `console.warn`/`error` sites checked; none interpolates the prefix, a
  topic or a payload. The two carrying an identifier route `origin` through `safeForLog`. The #292
  bidi gap adds no path here.
- **An authenticated stranger can do nothing to another account**, having checked four paths: no
  user-reachable route to `publishControl`; a channel cannot escape the topic (the proof above); a
  channel cannot collide with a control key, because the client-controlled segment is always **last**,
  after a fixed infix; and the ghost-sweep split cannot be shifted, because `OWNED_SEP` is a space and
  outside `NAME_RE`.

**Coverage**: the plan whole; the security-relevant surface of `drivers/redis.ts` (prefix validation,
all ten derived names, publish/subscribe/ingest, the full `#verifyAndDecode` gate chain, all 18 log
sites, the owned-key join/split); `protocol.ts`; `recording_ports.ts`; SC-002/SC-005 and `globMatches`;
the live-harness derivations; `docs/realtime.md:388-449`; the package's distribution surface; eleven
open issue bodies. **Not covered**: `manager.ts`'s local re-authorization, the `@lockness/redis` RESP
encoder, the client-side protocol.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1** — Keys collide between accepted prefixes (A9, verified): `app` + channel `eu:presence:room` and `app:presence:eu` + channel `room` both derive `app:presence:eu:presence:room`, so one deployment's `listMembers` returns the other's roster. Extend the `__` anchoring to the 7 key names too, or fix topics only and document the residual? | **Anchor the keys too** (FR-012). The objection to renaming keys is losing live rosters and revocation entries on upgrade; here that costs ~nothing, because the wire break already forces a fleet-wide restart and both are runtime state rebuilt on reconnect. Isolation becomes structural in both halves rather than conventional in one. The two **legacy** keys are the deliberate exception — see FR-012. | 2026-09-06 |
| **Q2** — Make the prefix a positive allowlist with a length cap (S4), or keep the denylist and file it? | **Allowlist now** (FR-013), `/^[A-Za-z0-9:._-]{1,64}$/`. One line while nobody has a prefix in production config; a breaking configuration change with no migration once they do. The default `lockness:realtime` (17 chars) passes. | 2026-09-06 |

### Decided without asking

- **The fix is a reserved separator, not per-channel `SUBSCRIBE`.** Not primarily on cost:
  per-channel subscribe **cannot satisfy SC-002**, because channel names may contain `:`, so
  `p="app"` publishing `"eu:orders"` and `q="app:eu"` publishing `"orders"` produce the *identical*
  topic — an exact-match collision no subscription discipline routes around. What is genuinely
  deferred is broker fan-out (today every instance receives every channel under its prefix and
  filters in `ChannelManager.deliverLocal`; per-channel subscribe makes that O(hosted) rather than
  O(prefix)). Its cost: `RedisSubscriber` (`redis.ts:152-175`) has `psubscribe` and no unsubscribe,
  and per-channel state multiplies what must be re-issued on reconnect — a seam **#290 is open
  against**. Filed as
  [#295](https://github.com/locknessland/lockness-monorepo/issues/295) (P3/M),
  whose `## Why` carries the correctness argument in bold so nobody reopens it
  as a way to revisit #288.
- **No compatibility shim**, as an ordering constraint rather than an observation — FR-007.
- **`__` is refused wholesale rather than only `__event`/`__control`.** One substring test stays true
  as separators are added; a reserved-token list has to be kept in step with them.
- **The `onMessage` ingest check stays.** It is now unreachable for control frames, and that is the
  point: defence in depth whose comment says so.
