# Plan: prove the Redis driver anchors every key and every pattern under its prefix

**Branch**: `246-realtime-prefix-anchoring` | **Date**: 2026-09-06 | **Backlog item**:
[#282 — Realtime: assert the Redis driver prefix-anchors every key and subscribe pattern](https://github.com/locknessland/lockness-monorepo/issues/282)

**This plan was rewritten after its audits.** The first draft made containment a whole-keyspace
`SCAN` diff and called that its central decision. Both seats showed the diff is blind to half the
surface, and that the anchoring predicate it proposed would pass the exact leak the feature exists
to catch. Sections 1–9 are the corrected design; sections 10 and 11 record what was found.

---

## 1. Why this exists

[#273](https://github.com/locknessland/lockness-monorepo/issues/273)'s live harness is airtight about
containment for every name **the suite** addresses. But the suite hands its namespace to
`RedisBroadcastDriver` as `prefix`, and **no seat verified that the driver anchors every name it
derives**. All three [#273](https://github.com/locknessland/lockness-monorepo/issues/273) seats
missed it; it is the single load-bearing unverified claim under the containment story, and
[#272](https://github.com/locknessland/lockness-monorepo/issues/272)'s live control-plane seam now
rests on it.

**The surface, counted rather than estimated.** `grep -c 'this.prefix'` returns 13, and three of
those derive no name — `:455` is the field assignment, `:636`/`:637` are the topic-strip arithmetic.
The real surface is **9 name-deriving members** (`:561`, `:571`, `:575`, `:579`, `:583`, `:587`,
`:600`, `:605`, `:610`) plus **1 inline subscribe pattern** (`:634`) = **10**.

**Two directions, and only one of them is in scope.** The audits showed the first draft conflated
them, so they are stated apart:

| Direction | Property | In scope? |
| :--- | :--- | :--- |
| **Outbound — containment** | Every name *this driver derives* stays under its prefix | **Yes.** This is the feature |
| **Inbound — isolation** | Nothing outside the prefix can reach in | **No.** Redis enforces none of it; any client can `PUBLISH` into `${prefix}:<channel>` |

`redis.ts:33` says the prefix is not a security boundary. That is a statement about the **inbound**
direction and it remains true. An unanchored *outbound* pattern is a different thing: it is
cross-deployment disclosure of realtime payloads, and it is a **vulnerability**, not a style defect.
The two coexist; the first draft printed them side by side without saying so, which read as the plan
disclaiming the guarantee it exists to establish.

## 2. User scenarios

### US1 — an unanchored NAME cannot escape unnoticed (P1)

**Given** a driver exercised across every one of its ten prefix-derived names,
**when** every argument it sends and every pattern it subscribes is captured **at the port
boundary**,
**then** each derived name is anchored under the configured prefix, and one that is not fails by
name.

### US2 — a NESTED deployment's traffic must not arrive (P1)

**Given** two deployments on one broker whose prefixes nest — `app` and `app:eu` —
**when** the outer driver subscribes,
**then** it receives none of the inner deployment's events **and none of its control frames**.

This is the scenario the first draft's motivation described and none of its criteria asserted. It is
the one that matters most: `${prefix}:*` matches `app:eu:orders` *and* `app:eu__control`, both survive
`isValidName` (`NAME_RE = /^[A-Za-z0-9:._-]+$/`), and the control frames arrive through `onMessage`
rather than `onControl` — so the MAC check at `:1064` is never reached and B's `origin`, `member`,
`nonce` and `mac` are handed to A's subscribers as ordinary events.

### US3 — the check does not assume a separator (P1)

**Given** the control topic is `${prefix}__control`, with no `:`,
**when** containment is asserted,
**then** it is covered — a check written `${prefix}:*` would exempt the one name US2 turns on.

### US4 — a prefix that widens a subscription is refused (P1)

**Given** a `prefix` containing a Redis glob metacharacter — `*`, `?` or `[` —
**when** the driver is constructed,
**then** it throws, because `:634` and `:671` both pass the prefix into a **pattern** context, where
a metacharacter widens the subscription to traffic the deployment does not own — and such a prefix
is trivially `startsWith`-anchored, so US1 alone would pass it.

### Edge cases

- **The check that cannot see its own defect — twice.** `SCAN MATCH ${prefix}*` returns only
  anchored keys. The first draft caught that and replaced it with a whole-keyspace diff — which
  observes a name only if the name **becomes a key**, and 5 of the 10 never do: `topic` (PUBLISH),
  `controlTopic` (PSUBSCRIBE/PUBLISH), the `${prefix}:*` pattern, and the two legacy names that
  `redis.ts:889` documents as "read, never reaped and never written". The port boundary is the only
  vantage that sees all ten.
- **`startsWith` is not anchoring.** `app:*` "begins with" `app`, and reads `app:eu`'s traffic.
- **A glob metacharacter in `prefix`.** `:455` stores it unvalidated, and `:634`/`:671` both pass it
  into a *pattern* context. A prefix containing `*` or `?` widens both subscriptions — and is
  trivially `startsWith`-anchored, so a naive test passes while the driver reads the broker.
  `live_broker.ts:157-172` already documents this hazard for the test namespace; the driver does not
  apply the same discipline to the operator's.
- **No key-creating path needs a timer.** `addMember` awaits `#ensureSweepStarted()`, which awaits
  `#heartbeat()` **before** installing either interval (`:733`, `:1116`), so `instancesKey` and
  `aliveKey` are created synchronously on the first join. The first draft's timer edge case was
  false, and with it the implied dependency on
  [#281](https://github.com/locknessland/lockness-monorepo/issues/281).

## 3. Requirements

- **FR-001** — Every argument the driver sends and every pattern it subscribes is captured at the
  **port boundary** and asserted anchored. Both dependencies are constructor-injected
  (`redis.ts:450-453`), so this needs **no broker**. This is the primary mechanism.
- **FR-002** — Which strings are prefix-derived is determined **differentially**: the same exercise
  runs twice under two distinct prefixes, and every captured string that differs between the runs is
  prefix-derived by construction. No per-command key-position map, no semantic model of Redis.
- **FR-003** — **Anchored means `prefix` plus a separator**, not `startsWith`. A derived name must
  equal `prefix`, or begin `${prefix}:`, or begin `${prefix}__`. The permitted separators are
  enumerated; anything else fails, including a bare `${prefix}x`.
- **FR-004** — The driver **rejects a `prefix` containing a Redis glob metacharacter** at
  construction. This is a **production change**, and recording it here is how §8's "a change there
  would be a finding" is meant to work.
- **FR-005** — Roster **completeness** is a source assertion: a scan of `drivers/redis.ts` finds
  exactly the members whose body interpolates `this.prefix`, and their **names** match a pinned
  list. Pinning names, not a count — a count moves on a harmless refactor and fails to move on a
  getter that reads the prefix into a local first.
- **FR-006** — Roster **exercise** is a runtime assertion: every name on that list appears in the
  captured log. Completeness and exercise are different claims and get different criteria.
- **FR-007** — Mutation-verified: un-anchoring any one member, or the subscribe pattern, fails the
  suite. Where the mutation can be a **fixture** rather than an edit, it is one — a deliberately
  broken double asserted to be rejected is a committed, re-runnable artefact; a hand-edit leaves
  none.
- **FR-008** — The driver's `prefix` docstring must not promise isolation the file header disclaims.
  `redis.ts:204` calls it "Reserved topic prefix for multi-app / multi-tenant isolation" while
  `redis.ts:33` says it is not a security boundary; the docstring is the one that misleads, and it is
  what would lead an operator to the nested prefixes US2 is about.

**There is no live-broker half.** Dropped at the stop (question 1): the port boundary observes all
ten names, so a keyspace diff adds nothing it can see, and dropping it removes S1, S4, S5/A3 and A8
entirely rather than mitigating them. [#282](https://github.com/locknessland/lockness-monorepo/issues/282)'s
criterion says "enumerated with `SCAN`"; the two-prefix differential meets its **intent** — no list of
expected names — by a mechanism that can actually observe the defect. That divergence is recorded on
the issue, not silently taken.

## 4. Success criteria

- **SC-001** — All **10** derived names are observed at the port and are separator-anchored.
- **SC-002** — A driver at prefix `p` receives no message published under `p:child` — neither an
  event nor a control frame.
- **SC-003** — `${prefix}__control` is covered by the same predicate as the `:`-separated names.
- **SC-004** — The pinned member-name list equals what a source scan finds; adding a getter fails
  the test **by name**, not by a count mismatch.
- **SC-005** — A `prefix` containing `*`, `?` or `[` is refused at construction.
- **SC-006** — Mutation-verified in both halves.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **What "anchored" means** | `packages/realtime/tests/` — one separator-aware predicate | An inline `startsWith` in a test body; a second predicate for topics vs keys; any check spelled `${prefix}:*` |
| **How a driver call is observed** | `packages/realtime/tests/` — **one** recording double over both ports, recording argv and returning canned replies | A second recorder in a test body; asserting from `FakeRedis`'s internal store instead of from recorded argv; a recorder that captures one of the two `psubscribe` sites |
| **Which strings are prefix-derived** | The **two-prefix differential** (FR-002) | A per-command key-position table; a hand-written list of expected key names |
| **What the driver's names are** — for **containment** | `packages/realtime/drivers/redis.ts` only. `keys()` is **forbidden** here | Consulting `live_realtime.ts`'s `keys()`, which is a verbatim second copy of all nine templates — a containment check that reads it asserts agreement between two models, not anchoring |
| **What the driver's names are** — for **read-back** | `live_realtime.ts`'s `keys()`, unchanged | An inline rebuild in a test body. This row is [#273](https://github.com/locknessland/lockness-monorepo/issues/273)'s and stays correct |
| **What mutation verification means** | `packages/realtime/tests/` — the named mutations and their observed failures recorded in the test's JSDoc | A verification that leaves no artefact and so cannot be distinguished from not having been done |

**Binding.** Row 4 and row 5 look contradictory and are not: they answer for **different halves**.
The first draft had one row that blessed `keys()` for both, which would have routed the containment
check back through a model of the thing it was meant to observe.

## 6. Technical context

| | |
| :--- | :--- |
| **Language** | TypeScript, Deno |
| **Packages** | `@lockness/realtime`. Tests, **plus one production guard** (FR-004) |
| **Testing** | `Deno.test`; a semantics-free recording double over both ports; the gated live harness only if open question 1 keeps it |
| **Precedent** | `packages/session/tests/no_placeholder_keys.test.ts` already does a source scan against repo files under plain `deno test -A`; reuse its shape rather than inventing a second |

### Domain model

**Bounded context** — the realtime Redis adapter's *naming*.

**Vocabulary**

| Term | Meaning |
| :--- | :--- |
| **Anchored** | Equal to `prefix`, or beginning `${prefix}:` or `${prefix}__`. **Not** `startsWith` |
| **Containment** | Outbound: every name the driver derives is anchored |
| **Isolation** | Inbound: nothing else can reach in. Not provided, not claimed, out of scope |
| **Derived name** | A string the driver builds from `prefix` — 9 members + 1 inline pattern |

**Invariants**

1. Every derived name is anchored, separator included.
2. The observation used to check invariant 1 must be capable of seeing its violation. The port
   boundary is; a keyspace diff is not, for 5 of the 10.
3. The suite touches no broker at all, so it can neither leave residue nor read a foreign key name.
   This is a consequence of the port-boundary design, not a rule it has to remember.

**Out of scope** — inbound isolation; renaming the control topic.

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| No `hono` · JSR-only · no `any` · Tailwind | ✅ n/a or unaffected |
| Pre-completion gate · JSDoc · no silent catches | ✅ |
| TDD | ✅ mutation verification (FR-007), with fixtures preferred over hand-edits |
| Domain Model gate | ✅ section 6 |
| MVC / DDD layering | ✅ the recorder sits at an existing port, not beside one |

### Complexity tracking

One violation to declare: **FR-004 changes production code** in a feature whose §8 says a production
change is a finding. It *is* the finding — the driver validates no prefix while the test harness
validates its own namespace for exactly this reason. Recorded rather than smuggled.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `packages/realtime/tests/` (new) | **yes** | The recorder, the predicate, both halves |
| `packages/realtime/drivers/redis.ts` | **yes — FR-004 only** | A constructor guard on `prefix`. Any other change here is a finding |
| `packages/realtime/tests/live_realtime.ts` | **no** | The live half was dropped, so no third cursor loop is added and `scanKeys` is left alone |
| Public API, CLI, HTTP, UI | **no** | None |

### Documentation (this feature)

```text
.specnaut/specs/246-realtime-prefix-anchoring/
├── plan.md
└── tasks.md
```

No front-end surface.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| **The observation cannot see its own defect** — twice now: a namespaced scan, then a keyspace diff | Invariant 2; the port boundary sees all ten |
| **`startsWith` passes the nested-prefix leak** | FR-003, and SC-002 asserts the leak directly |
| **A glob metacharacter widens both subscriptions** and passes anchoring trivially | FR-004 / SC-005 |
| ~~Whole-keyspace enumeration widens the live gate's consent~~ · ~~the escaped key is left on the broker~~ | **Dissolved**, not mitigated — the live half was dropped at the stop. Recorded struck through because a reader of §10/§11 will look for them |
| **A pinned count becomes a rubber stamp** — [#278](https://github.com/locknessland/lockness-monorepo/issues/278) deletes two legacy names and would turn a count red on a correct change | FR-005 pins **names**; [#278](https://github.com/locknessland/lockness-monorepo/issues/278) should carry a matching criterion |
| **The recorder inherits [#280](https://github.com/locknessland/lockness-monorepo/issues/280)'s modelled-but-wrong class** | It records argv and returns canned replies. It models no Redis semantics, so there is nothing to model wrongly |

## 10. Architecture audit

**Verdict `fail`** — 1 CRITICAL, 5 HIGH, 4 MEDIUM, 3 LOW. Coverage: the plan, `drivers/redis.ts`,
`live_realtime.ts`, `live_broker.ts`, `fake_redis.ts`, the `no_placeholder_keys` precedent, root
tasks; board items #277, #278, #280, #281, #283, #285.

| # | Finding | Disposition |
| :--- | :--- | :--- |
| **A1** `CRITICAL` | The keyspace diff is blind to 5 of 10 names — 3 create no key, 2 are read-only by design (`redis.ts:889`). FR-001/FR-004/SC-001/SC-004 all overclaimed. **The plan named this trap and walked into a second instance of it** | **Plan rewritten.** Port boundary is now the primary mechanism; the two-prefix differential replaces any key-position model. **Verified independently** |
| **A2** `HIGH` | "Thirteen getters" is wrong — 9 members + 1 pattern; 3 grep hits derive nothing. SC-004's pinned total was unsatisfiable | **Plan changed** — counts corrected, SC-004 split into completeness (FR-005) and exercise (FR-006). **Verified: 13 raw, 10 deriving** |
| **A3** `HIGH` | The test that detects an escaped key leaves it on the broker — `teardown` is namespace-scoped by explicit decree | **Open question 1**; invariant 3 added regardless |
| **A4** `HIGH` | Row 4 blessed `keys()`, a verbatim second copy of all nine templates, and contradicted row 2 for the containment half | **Plan changed** — rows split by half; `keys()` forbidden for containment |
| **A5** `HIGH` | FR-002 (port capture) had no home, and three plausible implementations | **Plan changed** — decision row 2 |
| **A6** `HIGH` | Zero key-creating paths need a timer — `#heartbeat()` is awaited at `:1116` before either interval | **Plan changed** — edge case deleted, and the implied [#281](https://github.com/locknessland/lockness-monorepo/issues/281) dependency with it. **Verified** |
| **A7–A10** `MEDIUM` | [#281](https://github.com/locknessland/lockness-monorepo/issues/281) overlap dissolves with A6; a third `SCAN` cursor loop where `scanKeys('')` already exists; blast radius on a shared broker; FR-005 leaves no artefact | **Adopted** — reuse `scanKeys`, and mutation verification gets a home and prefers fixtures |
| **A11–A13** `LOW` | [#278](https://github.com/locknessland/lockness-monorepo/issues/278) will move the roster; `LIVE_BROKER` is the declared single home; the no-broker half must not depend on `FakeRedis` fidelity | **Adopted** into §5 and §9 |

**Its answer on SC-004** — achievable as a mechanism, not as phrased, with `no_placeholder_keys.test.ts`
as precedent. `deno coverage --json` would close the residual gap and was **explicitly rejected**: it
needs a second process and would put the test outside `deno task test`.

## 11. Security audit

**Verdict `fail`** — 2 HIGH, 3 MEDIUM, 2 LOW. Coverage: the plan, `drivers/redis.ts`,
`live_realtime.ts`, `live_broker.ts`, `protocol.ts`, `deno.jsonc`, the CI workflow; board items #277,
#278, #280, #281, #283, #285.

**It corrected a premise in the dispatch, which was mine.** I told it the live suite was gated on
`LOCKNESS_REDIS_INTEGRATION=1` **and a loopback check**. There is no loopback run gate: `LOOPBACK`
is consulted at exactly one place, `live_broker.ts:106`, and only to refuse a cleartext `AUTH`. With
TLS on or no password set, any hostname is accepted. **Verified.**

| # | Finding | Disposition |
| :--- | :--- | :--- |
| **S1** `HIGH` | A whole-keyspace `SCAN` silently promotes what `LOCKNESS_REDIS_INTEGRATION=1` consents to, from "write under one namespace" to "enumerate the operator's keyspace" — and Redis key names routinely *are* identifiers, session ids included | **Dissolved** — the live half was dropped at the stop (Q1), so nothing enumerates a keyspace |
| **S2** `HIGH` | "Anchored = `startsWith`, nothing about separators" is satisfied by `${prefix}:*` **while it reads a nested deployment's events and control frames**. The control frames arrive via `onMessage`, so the MAC check is never reached. The test would go green on the exact failure the motivation describes | **Plan changed** — FR-003 + SC-002 + §1's two-direction table. **Verified end to end**, including that `NAME_RE` accepts both stripped names |
| **S3** `MEDIUM` | `prefix` is never validated (`:455`), so a glob metacharacter widens both patterns and passes anchoring trivially | **Plan changed** — FR-004 / SC-005, declared in §7 as the production change it is |
| **S4** `MEDIUM` | `after − before` does not tolerate a concurrent third-party write, contradicting the risk row that claimed it did — and its failure path is what prints foreign key names | **Adopted** — the claim was wrong; FR-008 and invariant 3 |
| **S5** `MEDIUM` | The plan has no answer for a key found outside the namespace, and the obvious one is a whole-keyspace `DEL` | **Adopted** — decision row 7 forbids composing a scan with a delete |
| **S6–S7** `LOW` | SC-004's count includes non-deriving sites (agrees with A2); broker-read strings printed unencoded — **confirms [#277](https://github.com/locknessland/lockness-monorepo/issues/277)** and extends its class | **Adopted** — FR-008 strips control characters locally rather than importing `@lockness/contract`, leaving that trade to [#277](https://github.com/locknessland/lockness-monorepo/issues/277) |

**Its answer to "coherent or not"**: the pair is reconcilable but the draft did not reconcile it, and
an unanchored subscribe pattern is a **vulnerability** — cross-deployment disclosure — not merely a
bug. `redis.ts:204` calls the prefix "Reserved topic prefix for multi-app / multi-tenant isolation"
while `redis.ts:33` disclaims isolation; one of the two misleads.

## 12. Open questions

**All three answered at the stop, 2026-09-06. Settled, binding on the implementer.**

| # | Question | Answer |
| :--- | :--- | :--- |
| **Q1** | Does the live-broker half survive? | **No — port only.** The recorder observes all ten names; a keyspace diff adds nothing it can see. This **dissolves** S1, S4, S5/A3 and A8 rather than mitigating them. [#282](https://github.com/locknessland/lockness-monorepo/issues/282)'s "enumerated with `SCAN`" is met in intent — no list of expected names — by a mechanism that can observe the defect, and the divergence goes on the issue rather than being taken silently |
| **Q2** | Where do the two driver defects land? | **Both here.** The glob-metacharacter guard (FR-004/SC-005) and the `redis.ts:204` docstring (FR-008). A test proving anchoring is worthless while a metacharacter prefix passes it, and the docstring is what would lead an operator to nested prefixes in the first place. Declared in §7 Complexity Tracking, not smuggled |
| **Q3** | If US2 fails — the nested-prefix leak is real | **Stop and report.** Land the failing test `ignore`d with its evidence and raise a P0/P1 security issue for its own plan. Fixing cross-deployment disclosure means changing the topic scheme or the subscribe pattern — a design decision with a rolling-upgrade migration, far larger than this ticket, and not something to improvise inside it |

### The Q3 branch was taken: US2 failed

`SC-002` **fails against the current driver**, reproduced at the port boundary:

```
app:*  contains  app:eu:orders     the outer deployment receives the inner's events
app:*  contains  app:eu__control   ...and its CONTROL frames
```

The second is the disclosure. A control frame whose topic matches the **event**
pattern is delivered to `onMessage`, so `#verifyAndDecode` — and with it the HMAC
check and [#272](https://github.com/locknessland/lockness-monorepo/issues/272)'s
replay window — is never reached. The MAC is bypassed by **routing**, not by
forgery.

Per Q3 the branch stopped rather than improvising: the test is landed
`ignore: true` naming
[#288](https://github.com/locknessland/lockness-monorepo/issues/288), filed at
**P0**. Every candidate fix changes the wire-level subscription for every
deployment, which is a rolling-upgrade migration this plan did not cost.

### Decided without asking

| Decision | Why it needed no question |
| :--- | :--- |
| Port boundary as the primary mechanism | It is the only vantage that sees all ten names |
| Two-prefix differential rather than a key-position map | Needs no semantic model and cannot drift from one |
| The recorder records argv and returns canned replies | Modelling nothing is what keeps [#280](https://github.com/locknessland/lockness-monorepo/issues/280)'s class out |
| Pin member **names**, not a count | A count moves on a refactor and misses a hoisted local |
| `deno coverage` rejected | A second process, and the test leaves `deno task test` |
