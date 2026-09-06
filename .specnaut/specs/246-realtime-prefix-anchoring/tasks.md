# Tasks: prove the Redis driver anchors every key and every pattern under its prefix

**Feature**: `246-realtime-prefix-anchoring` | **Branch**: `246-realtime-prefix-anchoring`
**Backlog**: [#282](https://github.com/locknessland/lockness-monorepo/issues/282)
**Derived from**: `plan.md`, approved 2026-09-06 with all three questions answered.

**No broker.** The live-broker half was dropped at the stop. Every task below runs under plain
`deno task test`.

**Mutation verification is the acceptance test for a test.** This feature's deliverable *is* a test,
so "it passes" proves nothing on its own — the previous branch found nine tests that passed for the
wrong reason. Every assertion here is checked by breaking its subject and watching it go red, and
where the break can be a **fixture** rather than a hand-edit, it is one (FR-007).

## 🔒 Decision-table homes, carried forward

| Decision | Home | Tasks |
| :--- | :--- | :--- |
| What "anchored" means | one separator-aware predicate in `packages/realtime/tests/` | T003, T004 |
| How a driver call is observed | **one** recording double over both ports | T001, T002 |
| Which strings are prefix-derived | the two-prefix differential | T006 |
| The driver's names — **containment** | `drivers/redis.ts` only; `keys()` **forbidden** | T007, T008 |
| The driver's names — **read-back** | `live_realtime.ts`'s `keys()`, untouched | — |
| What mutation verification means | the named mutations recorded in the test's JSDoc | T014 |

---

## Phase 1 — Setup

- [X] T001 Create `packages/realtime/tests/recording_ports.ts` with a `RedisCommandClient` +
      `RedisSubscriber` double that records every `command(...)` argv and every `psubscribe`
      `(pattern)`, and returns **canned replies only**. It models no Redis semantics — that is what
      keeps [#280](https://github.com/locknessland/lockness-monorepo/issues/280)'s
      modelled-but-wrong class out of this feature. JSDoc says so. Home: decision row 2

## Phase 2 — Foundational (blocking)

- [X] T002 [P] Write the failing test that the recorder captures **both** `psubscribe` sites
      (`drivers/redis.ts:635` events, `:671` control) — asserted **by count**, since a recorder that
      catches only the first would pass US1 while missing the name US3 exists for
- [X] T003 [P] Write the failing tests for the anchoring predicate in
      `packages/realtime/tests/`: `p` ✓, `p:x` ✓, `p__control` ✓, `px` ✗, `p:*` **✗ as a derived
      name**, `` and a name under a *nested* prefix `p:child:…` ✗
- [X] T004 Implement the separator-aware predicate — equal to `prefix`, or beginning `${prefix}:`,
      or beginning `${prefix}__`. **Not `startsWith`.** FR-003. Home: decision row 1
- [X] T005 [P] Write the failing test for the **two-prefix differential**: the same captured log
      under prefixes `alpha` and `beta` differs exactly in the prefix-derived strings
- [X] T006 Implement the differential helper: run an exercise under two prefixes, diff the two argv
      + pattern logs, and return the strings that differ. FR-002. Home: decision row 3

**Checkpoint** — the observation mechanism exists and is proven to see both subscribe sites.

## Phase 3 — US1: no unanchored name escapes (P1) 🎯 MVP

- [X] T007 [P] [US1] Write the failing roster-**completeness** test: scan `drivers/redis.ts` for
      members whose body interpolates `this.prefix`, assert the **names** equal a pinned list of
      nine, plus the inline pattern at `:634` handled explicitly. Pin names, never a count — a count
      moves on a harmless refactor and does **not** move on a getter that reads the prefix into a
      local first. Reuse the shape of `packages/session/tests/no_placeholder_keys.test.ts`. FR-005
- [X] T008 [US1] Write the **exercise** that drives all ten names — publish, presence join/leave,
      evict, durable revocation, both legacy reads (driven from canned replies, **not** from a
      `FakeRedis` store), heartbeat and reconcile. No timer is needed: `addMember` awaits
      `#ensureSweepStarted()` → `#heartbeat()` at `:733`/`:1116`
- [X] T009 [US1] Assert every string the differential returns is anchored by T004's predicate.
      FR-001/FR-006, SC-001
- [X] T010 [US1] Assert **roster exercise**: every name on T007's pinned list appears in the captured
      log, so a name that exists but is never driven fails. SC-004

**Checkpoint** — US1 shippable. [#282](https://github.com/locknessland/lockness-monorepo/issues/282)'s
first two criteria are met, by a mechanism that can fail.

## Phase 4 — US2: a nested deployment's traffic must not arrive (P1)

**This phase can stop the branch.** Per the stop's Q3: if the assertion fails, land it `ignore`d with
its evidence and raise a P0/P1 security issue. Do **not** improvise a fix — changing the topic scheme
or the subscribe pattern is a rolling-upgrade migration this plan has not costed.

- [X] T011 [US2] Write the test: a driver at prefix `app` and a second at `app:eu`; publish an event
      **and** a control frame under `app:eu`; assert the outer driver's `onMessage` and `onControl`
      handlers receive neither. SC-002
- [X] T012 [US2] **The assertion FAILED — the leak is real.** Recorded in `plan.md` §12; the test is landed `ignore: true` pointing at [#288](https://github.com/locknessland/lockness-monorepo/issues/288), filed P0. Original text: Record the outcome in `plan.md` §12 either way. If it fails: mark the test
      `ignore: true` with a comment naming the issue, and open the issue **before** moving on — a
      known cross-deployment disclosure left unfiled is worse than an unwritten test

## Phase 5 — US3 + US4: the separator, and a prefix that widens a subscription (P1)

- [X] T013 [P] [US3] Assert `${prefix}__control` is covered by the same predicate as the
      `:`-separated names — the mutation for this is a check spelled `${prefix}:*`, which must go
      red. SC-003
- [X] T014 [US4] Write the failing test: a `prefix` containing `*`, `?` or `[` is refused at
      construction. Note in the test **why** this is not merely hygiene — such a prefix is trivially
      `startsWith`-anchored, so US1 alone passes it while the driver reads the broker. SC-005
- [X] T015 [US4] **Production change** — add the constructor guard to `drivers/redis.ts:455`,
      mirroring the rationale already written at `packages/redis/tests/live_broker.ts:157-172` for
      the test namespace. FR-004. Declared in `plan.md` §7 Complexity Tracking
- [X] T016 [US4] **Production change** — reconcile `drivers/redis.ts:204`'s "Reserved topic prefix
      for multi-app / multi-tenant isolation" with `:33`'s "not a security boundary". The docstring
      is the one that misleads, and it is what would lead an operator to the nested prefixes US2 is
      about. FR-008

## Phase 6 — Polish

- [X] T017 **Mutation battery**, recorded in the test file's JSDoc with each observed failure:
      un-anchor each of the nine members in turn; un-anchor the `:634` pattern; weaken T004's
      predicate to `startsWith`; drop one `psubscribe` site from the recorder; remove the glob guard.
      Every one must go red. FR-007, SC-006
- [X] T018 [P] Update `packages/realtime/AGENTS.md` with the containment invariant and the pitfall:
      **a containment check must never consult `keys()`** — that asserts agreement between two
      models rather than anchoring
- [X] T019 [P] Add a criterion to
      [#278](https://github.com/locknessland/lockness-monorepo/issues/278): deleting the two legacy
      names must drop them from this feature's pinned roster. Without it, a correct change turns this
      test red and the next author edits the list instead of understanding it
- [X] T020 **The gate**: `deno fmt && deno lint && deno check && deno task test`, plus
      `deno task deps:analyze` and `deno task agents:brief --check`

---

## Dependencies

```text
T001 (the recorder)
  └─> Phase 2 (T002-T006)  ← BLOCKING: the observation mechanism
        ├─> Phase 3 US1 (T007-T010)   the roster            [MVP]
        ├─> Phase 4 US2 (T011-T012)   the nested-prefix leak [may stop the branch]
        └─> Phase 5 US3+US4 (T013-T016)
              └─> Phase 6 (T017-T020)
```

## Parallel opportunities

- **Phase 2**: T002 ∥ T003 ∥ T005 — three independent test bodies before their implementations
  serialize on the predicate and the differential.
- **Phase 5**: T013 ∥ T014.
- **Phase 6**: T018 ∥ T019.

## Implementation strategy

**MVP is Phase 1 + 2 + 3** — the roster is proven and
[#282](https://github.com/locknessland/lockness-monorepo/issues/282)'s core criteria are met.

**Phase 4 is the one that can change the plan**, not merely fail a test. Treat its outcome as a
finding, not as a task result.

**Total**: 20 tasks — 1 setup, 5 foundational, 4 US1, 2 US2, 4 US3/US4, 4 polish. Two of them
(T015, T016) touch production code, both declared.
