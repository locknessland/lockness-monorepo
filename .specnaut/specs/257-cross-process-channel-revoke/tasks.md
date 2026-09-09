# Tasks: cross-process per-channel revoke

**Feature:** `257-cross-process-channel-revoke` · **Backlog item:**
[#332 — Realtime: no cross-process per-channel revoke — unsubscribe is silently a no-op on a non-owning instance](https://github.com/locknessland/lockness-monorepo/issues/332)
**Plan:** `.specnaut/specs/257-cross-process-channel-revoke/plan.md` (read it
whole — this file does not restate its reasoning)

**TDD is non-negotiable** (constitution): every implementation task below is
preceded by the test that fails without it. A test written after the code is a
test that passes for reasons nobody checked.

---

## How to read the decision-table column

Every task that touches a rule in `plan.md` §5 names that rule's **home**. A
task may not put a decision anywhere else. Where a task says *"home: X"*, moving
the decision out of X is a **plan violation**, not a style opinion — amend the
plan first.

---

## Phase 1 — Setup

- [X] T001 Capture the mutation baseline before anything moves: run `deno task mutate realtime` and record which batteries are green, in the branch's scratch notes (not in the repo). Two of them are expected to break in Phase 2 and the difference is only legible against a recorded starting point.
- [X] T002 Confirm the working tree is green on the full gate — `deno fmt && deno lint && deno check && deno task test` — so a later red is attributable to this branch.

**Checkpoint:** the batteries' starting state is known and the tree is green.

---

## Phase 2 — Foundational (BLOCKING — no user story starts before this closes)

Everything here is a prerequisite of two or more stories. The seam replacement
and `#leaveLocal`'s report are what `revokeChannel` is built on.

### The driver seam

- [X] T003 [P] Write the failing test that `Revocation` narrows as a **set**: a driver with two of the three new members is not a revocation store, in `packages/realtime/tests/revocation_seam_332.test.ts`.
- [X] T004 Add `Revocation` (`{ readonly target: string; readonly channel?: string }`) plus `markRevocation?` / `listRevocations?` / `clearRevocation?` to `packages/realtime/driver.ts`, and **remove** `markRevoked?` / `listRevoked?`. Full JSDoc on each (hard rule #7). Home: the scope lives on the `Revocation` record — §5 row 3.
- [X] T005 Add `revocationStore(driver)` to `packages/realtime/manager.ts` beside `presenceRoster` (`:324`) and `channelWatcher` (`:358`) — **total and non-throwing**, exactly as both siblings are. Home: §5 row 5.
- [X] T006 Add `#assertNotLegacyRevocationDriver(driver)` to `packages/realtime/manager.ts` as a **separate** unit from T005, called beside it in the constructor (`:584`). It throws when the driver presents `markRevoked`/`listRevoked` and not the new trio, naming the migration. Home: §5 row 6 — the assertion, not the probe. _(architecture audit M5: the siblings have no failure mode, so the throw may not borrow their precedent.)_
- [X] T007 Point `evict` (`packages/realtime/manager.ts:1671`) and `reconcileRevocations` (`:1731`) at the narrowed store instead of the optional-chained members.

### The record's bytes, and the decoder that must fail closed

- [X] T008 [P] Write the failing tests for the composite encoding in `packages/realtime/tests/revocation_encoding_332.test.ts`: a bare member decodes to connection scope; `"<id> <channel>"` decodes to channel scope; **a member with a second space, an invalid target half, or an invalid channel half is DROPPED** — never widened to connection scope (FR-018, SC-007).
- [X] T009 Implement encode/parse plus `clearRevocation` in `packages/realtime/drivers/redis.ts`, keeping `MARK_REVOKED_SCRIPT`'s `ZADD … GT` / `EXPIRE NX` / `EXPIRE GT` extend-only discipline and its in-script `TIME` read unchanged. The delimiter is a **space**, because it is outside `NAME_RE` (`packages/realtime/protocol.ts:48`). Home: §5 row 4 — the bytes stay in the driver.
- [X] T010 Carry `isValidName` forward onto **both halves** in `listRevocations`, and drop any member that does not fully decode. Transcribe the existing reason from `listRevoked`'s docstring verbatim — the index is the **only unauthenticated cross-instance write channel** in this package. Home: §5's decode row.
- [X] T011 Verify the reap stays **score-only** (`ZREMRANGEBYSCORE`, `drivers/redis.ts:120`) and the name gate stays JS-side and non-destructive. Add the test that a peer-shaped read leaves an undecodable member **in** the index — that is what preserves a channel-scoped record for the upgraded owner.

### `#leaveLocal` reports, and the batteries that break

- [X] T012 [P] Write the failing test for SC-008 in `packages/realtime/tests/leave_outcome_332.test.ts`: **two members in one channel, one leaves** → `'left'`, and the other member's membership is untouched. Every existing fixture is single-member, so this is the only witness that catches a report taken from the wrong place.
- [X] T013 Make `#leaveLocal` (`packages/realtime/manager.ts:1380`) report from its **one** membership predicate, `set?.delete(clientId)` (`:1382`) — **not** from the end of the method, which is reached only on the 1→0 path. Home: §5 row 1 (FR-024).
- [X] T014 Repair `packages/realtime/tests/mutations/channel_name_314.ts` row 4, whose anchor is `unsubscribe`'s exact signature line. The source moved, the guard remains → **repair the anchor, the row lives** (`docs/testing.md:402`). Do not delete it. (FR-025)
- [X] T015 Repair `packages/realtime/tests/mutations/connection_id_304.ts`'s reconcile-filter row, whose anchor is `if (id && isValidName(id)) live.add(id)`. The repaired anchor must guard **both halves** of the composite, and the row's existing reason is carried forward **verbatim** — it is the security guard the plan's F1 is about. (FR-025)
- [X] T016 Run `deno task mutate realtime` and confirm both repaired batteries are green again. `deno task mutate` is **outside** hard rule #5's gate, so nothing else in this chain will catch a dead row.

**Checkpoint:** the seam is replaced, the decoder fails closed, the leave path
reports, and no battery is dead. User stories may now start.

---

## Phase 3 — US2: server code learns its leave went nowhere (P1)

**Goal:** every id-addressed local verb reports a distinguishable outcome.
**Independently testable:** yes — no `revokeChannel` needed.

- [X] T017 [P] [US2] Write the failing test for all three outcomes of `unsubscribe` in `packages/realtime/tests/leave_outcome_332.test.ts`: owner + member → `'left'`; owner + never joined → `'not-subscribed'`; non-owner → `'not-owned'`, **and the driver recorded no command and no control publish for that call**.
- [X] T018 [P] [US2] Write the failing test that `disconnect` on a non-owner → `'not-owned'` and nothing is removed anywhere, in the same file.
- [X] T019 [US2] Widen `unsubscribe`'s return to `'left' | 'not-subscribed' | 'not-owned'` (`packages/realtime/manager.ts:1526`), derived from `connections.has` plus T013's predicate. Home: §5 rows 1 and 2 (FR-001).
- [X] T020 [US2] Widen `disconnect`'s return to `'disconnected' | 'not-owned'` (`:1566`), keeping its existing re-throw contract for a teardown failure unchanged (FR-002).
- [X] T021 [US2] Update `disconnect`'s internal call (`:1593`) — the **only** production caller of `unsubscribe` — so the loop ignores the outcome deliberately and says so in a comment.
- [X] T022 [P] [US2] State in both docstrings that the outcome is a **server-side** value: never relayed to a client, and `clientId` never taken from a client frame (FR-023). The framework ships no socket-to-manager wiring, so the application writes that handler and the signature invites the mistake.
- [X] T023 [US2] Fix the stale clause in `unsubscribe`'s comment (`:1521`) — `disconnect` iterates `#channelsByClient`, not `subscriptions.keys()`, and has since the fix documented 46 lines below at `:1567` (FR-017).
- [X] T024 [US2] Update the 25 existing `unsubscribe` call sites and 7 `disconnect` call sites across the 8 + 7 test files the plan's blast-radius count names, where a widened return changes an assertion.

**Checkpoint:** US2 delivers on its own — the silent no-op is visible even
before a remedy exists.

---

## Phase 4 — US1: an operator bans a member from one room, fleet-wide (P1)

**Goal:** `revokeChannel` reaches a socket on any instance and leaves it open.
**Independently testable:** yes, over a two-instance `FakeRedis` fixture.

- [X] T025 [P] [US1] Write the failing headline test in `packages/realtime/tests/channel_revoke_332.test.ts`: B owns the socket, A calls `revokeChannel(id, 'presence-room')` → B removes the member, the roster no longer lists it, a `left` reaches presence subscribers on **both** instances, **the socket stays open**, and a broadcast on `private-orders` still reaches that connection.
- [X] T026 [P] [US1] Write the failing test that `revokeChannel` throws on an id **or** a channel outside `isValidName` and publishes nothing (FR-004) — both arguments, on `evict`'s precedent.
- [X] T027 [P] [US1] Write the failing test that `revokeChannel` reports `'revoked' | 'not-subscribed' | 'not-owned'` (FR-022), including the case that motivated it: a driver with **no** control plane and a target this instance does not own → `'not-owned'`, never a silent success.
- [X] T028 [P] [US1] Write the failing test that `revokeChannel` refuses an undurable route — control plane present, revocation store absent → `RevocationScopeError`, **nothing published** (FR-012).
- [X] T029 [P] [US1] Write the failing test that the revoked client receives `{ type: 'unsubscribed', channel }` **exactly once**, and that a client-initiated `unsubscribe` still sends nothing (FR-007).
- [X] T030 [US1] Add `RevocationScopeError` to `packages/realtime/manager.ts`, `ConnectionIdError`-shaped, and export it from `packages/realtime/mod.ts`. A named error a caller cannot name is just an `Error`.
- [X] T031 [US1] Implement `revokeChannel(clientId, channel)` in `packages/realtime/manager.ts`: assert both arguments (`#assertUsableId`, `#assertUsableChannel` — home: §5 row 9), durable first, then local apply or control publish. Home for the never-fail-open ordering: §5's durability row (FR-005).
- [X] T032 [US1] Implement `#revokeChannelLocal(clientId, channel)`: `await this.unsubscribe(...)` — **reusing the whole existing leave path, no new announcement machinery** (FR-006) — then, only on `'left'`, send the client frame, then clear the record. Home for "whether the client is told": §5 row 10.
- [X] T033 [US1] Add the `revoke-channel` case to `handleControl`'s switch (`packages/realtime/manager.ts:1861`) so it **calls** the scope→consequence mapping rather than deciding. Home: §5's scope row.
- [X] T034 [US1] Add the single private scope→consequence mapping — no channel means `revokeLocal` (hard-close 4403), a channel means `#revokeChannelLocal` (socket stays open) — and route **both** `handleControl`'s case and `reconcileRevocations`' branch through it. Two entry points, one decider. Home: §5's scope row (M3).
- [X] T035 [US1] Export `Revocation` and the outcome unions from `packages/realtime/mod.ts`. `revocationStore` stays **unexported** from `mod.ts`, like both its siblings.
- [X] T036 [US1] Document the mint-versus-cleanup assertion asymmetry at the site: `revokeChannel` asserts its channel because both values travel onto the control plane and into a durable record; `unsubscribe` deliberately does not (#314). A reviewer reads it as drift otherwise.

**Checkpoint:** the MVP. US1 + US2 together are #332's headline, and the branch
is shippable here if the remaining stories are deferred.

---

## Phase 5 — US3: the revoke survives a lost control frame (P2)

- [X] T037 [P] [US3] Write the failing test: refuse the publish (or use a subscriber that never delivers), fire the reconcile → the owner applies the channel leave. Fire it **again** → nothing happens, and the connection may re-subscribe and stay (FR-008, FR-020).
- [X] T038 [P] [US3] Write the failing test that a `clearRevocation` failure on the reconcile / control-frame path is **warned and not re-thrown** (no unhandled rejection from `void this.revokeLocal(...)`-shaped dispatch), and **is** re-thrown on `revokeChannel`'s own local-apply path after the revocation was applied (FR-019).
- [X] T039 [US3] Implement clear-on-apply and the two failure dispositions. The record must mean exactly *"a revocation the owning instance has not applied yet"*. Home: §5 row 8.
- [X] T040 [US3] Add the reconcile scope dispatch through T034's mapping, so a channel-scoped record never reaches `revokeLocal`.

---

## Phase 6 — US4: a rolling deploy meets the published 0.3.0 (P2)

- [X] T041 [P] [US4] Write the failing test for **all four rows** of the mixed-fleet table in `packages/realtime/tests/mixed_fleet_332.test.ts`, driven against `FakeRedis` with a hand-written bare member standing in for a published-version write. The row that matters most: a channel-scoped member is **skipped** by a published-shaped reconcile and never widened to a socket revoke.
- [X] T042 [P] [US4] Write the failing test that the control kind survives a published peer: sign a `revoke-channel` frame and run it through the published ingest chain — the MAC verifies (proving `#canonical` is unchanged), the frame is admitted, and `handleControl` does nothing.
- [X] T043 [US4] Add the `revoke-channel` kind to `ControlMessage['kind']` in `packages/realtime/driver.ts`, adding **no new wire field** — home: §5's `#canonical` row (FR-014). Note in `ControlRefusal`'s JSDoc (`driver.ts:67`) that its `kind` widens with it.
- [X] T044 [US4] Add the `FakeRedis` arm plus its row in `packages/realtime/tests/live_fake_conformance.test.ts`; the fake must **refuse** an argument it does not read (#280).

---

## Phase 7 — US5: a legacy third-party driver is refused loudly (P3)

- [X] T045 [P] [US5] Write the failing test that a driver exposing `markRevoked`/`listRevoked` and not the new members **throws at construction** with the migration named, and that a driver exposing neither — `MemoryBroadcastDriver`, which implements 0 of 3 — constructs fine (FR-011).
- [X] T046 [US5] Verify T006's assertion is what fires, not T005's probe, so a later "restore consistency with the siblings" pass cannot delete the throw by making the probe total.

---

## Phase 8 — Polish and cross-cutting

- [X] T047 [P] Write `packages/realtime/tests/mutations/channel_revoke_332.ts` with the three mutants a green suite would otherwise survive: dropping the `clearRevocation` call (only T037's second tick sees it), inverting the `connections.has` guard in the reconcile's channel branch, and **changing the composite delimiter to a `NAME_RE` character** — which passes every same-version test and breaks only T041's mixed-fleet inertness. Add the mutant that returns the raw member as `{ target }` on a split failure and asserts **no 4403 fires**.
- [X] T048 [P] Rewrite `docs/realtime.md`'s Revocation section: a "Revocation scopes" subsection leading with the **consequence** (socket stays open / socket dies), not the verb name; the sentence that a revocation is **not a ban** (a revoked connection may re-subscribe if the application's `authorize` says so); and the five-item Upgrading note naming `0.3.0` explicitly — upgrade every instance first, the seam rename with its three-line migration, no Redis migration, the return-value change, and the MAC compatibility (FR-016).
- [X] T049 [P] Record **once** in that Upgrading section that third-party realtime drivers are **not** a supported extension point before 1.0 and the built-in drivers are the contract, so the next seam change reads it instead of re-arguing it (FR-026, the user's decision of 2026-09-09).
- [X] T050 [P] Update `packages/realtime/README.md` — the two-tier split, one paragraph — and the `markRevoked`/`listRevoked` mentions at `README.md:95-96`.
- [X] T051 Add five pitfall rows to `packages/realtime/AGENTS.md`: the delimiter must stay outside `NAME_RE`; the re-added-`markRevoked` escalation hazard, quoted with its concrete failure chain; clear-on-apply and why the two scopes differ; the mint-versus-cleanup asymmetry; and the outcome-is-server-side rule (F5). Update the `markRevoked` mention at `AGENTS.md:149`.
- [X] T052 Update `packages/realtime/tests/churn_cost_329.test.ts` and the published per-frame cost table in `docs/realtime.md` — landing `revokeChannel` adds a non-frame caller to the leave path, and that table is **derived** from that test and says so. The two move together or the documentation drifts.
- [X] T053 Run `deno task agents:brief` to regenerate the surface and tests blocks, and `deno task deps:analyze` to confirm the graph is unchanged.
- [X] T054 Run the full gate: `deno fmt && deno lint && deno check && deno task test`, then `deno test -A packages/realtime/`, then `deno task mutate realtime` — the last one is outside the gate and is the only thing that catches a dead battery.

---

## Dependencies

```
Phase 1 (setup)
   └─> Phase 2 (foundational — BLOCKING)
          ├─> Phase 3 (US2, P1) ──┐
          │                        └─> Phase 4 (US1, P1)  ← MVP closes here
          │                              ├─> Phase 5 (US3, P2)
          │                              └─> Phase 6 (US4, P2)
          └─> Phase 7 (US5, P3)
                                          └─> Phase 8 (polish)
```

**US1 depends on US2**, and that is real rather than bookkeeping:
`#revokeChannelLocal` gates the client notification on `unsubscribe` reporting
`'left'`. US5 depends only on Phase 2. US3 and US4 are independent of each
other.

## Parallel opportunities

| Phase | Runs together |
| :--- | :--- |
| 2 | T003 / T008 / T012 — three test files, no shared source |
| 3 | T017 / T018 / T022 |
| 4 | T025 / T026 / T027 / T028 / T029 — five independent witnesses before any implementation |
| 6 | T041 / T042 |
| 8 | T047 / T048 / T049 / T050 — one battery, three documents |

## Implementation strategy

**MVP = Phase 2 + Phase 3 + Phase 4.** That is #332's acceptance criteria in
full: the silent no-op becomes observable, and the remedy it points at exists.
Phases 5–7 harden it against a lost frame, a rolling deploy and a stale driver;
Phase 8 is the documentation the release note depends on.

The MVP is a **checkpoint inside the full path, not a fork to offer** — the plan
states both, and the whole scope was chosen at the plan stop.

## Format validation

All 54 tasks carry a checkbox, a sequential `T0NN` id, a `[P]` marker where
parallelisable, a `[USn]` label in every user-story phase and none in Setup /
Foundational / Polish, and an explicit file path.

---

## What the run corrected in these instructions

Recorded because a breakdown that is never audited against its own execution
teaches nothing. Four things this file got wrong.

1. **T043's type change had to move to Phase 2.** The `revoke-channel` kind is
   needed by T033's `handleControl` case, which is Phase 4 — so leaving the
   union widening in Phase 6 made Phase 4 unbuildable. A real dependency the
   ordering missed. What stayed in Phase 6 is the part that genuinely belongs
   there: the mixed-fleet verification and the `ControlRefusal` note.
2. **T001's first run was worthless twice over**, and both faults are in this
   file's own instruction to "capture the baseline". It ran concurrently with
   the first source edit, and its exit codes were `tail`'s rather than the
   commands' — reported `MUTATE_EXIT=0` / `TEST_EXIT=0` over a type-check that
   had failed. Redone on a stashed clean tree with the status captured directly.
   **A baseline task must say: freeze the tree, and no pipe.**
3. **T014/T015 needed two passes, for two different reasons.** The plan
   predicted the anchors would die because the code moved. They also died
   because the new `#assertUsableId` / `#assertUsableChannel` calls made three
   anchors in *other* rows match twice — a direction nothing predicted. The
   repair for that then failed as well, because it assumed the two assertions in
   `subscribe` were adjacent when a five-line comment sits between them.
4. **T044 needed a `FakeRedis` arm that no task named.** `clearRevocation`
   issues `ZREM`, which the fake did not model at all. The task said "add a row
   to the conformance test"; the actual work was a new command arm plus a
   differential sequence, run against a live broker.

## What the REVIEW corrected, after these tasks were all ticked

A fifth correction, and the one that matters most, because it lands on work this
file had already marked delivered.

5. **T047 was ticked over a mutant that was never written.** It promised a row
   inverting the `connections.has` guard in the reconcile's channel branch; the
   battery carried five rows and none of them was it. A clean **14/14** had
   therefore been reported over coverage that did not exist. The review
   coordinator verified the absence independently rather than taking the seat's
   word for it, which is the only reason it was caught.
6. **Two guards were correct and unwitnessed** — the channel-less
   `revoke-channel` drop and the reconcile's ownership check. Deleting either
   left the whole suite green. Now both have a witness and a mutant.
7. **A HIGH reached the review that the plan's own audit had already named
   once.** `#clearRevocation` ran outside the `left === 'left'` guard, so a
   revoke racing a subscribe's authorizer erased the record it had just written
   and left the connection in the room permanently while reporting success.
   Plan §11 F2 is the same defect, in the same verb, found before any code
   existed — and it came back in code written after that fix.
8. **A fix of mine weakened a witness of mine, in the same turn.** Gating the
   clear on `'left'` meant that inverting the reconcile guard no longer produced
   a spurious clear, so the test written for that guard was observing the wrong
   consequence and the harness called it `MISATTRIBUTED` rather than counting it
   as a kill.

## Outcome

| Gate | Result |
| :--- | :--- |
| `deno fmt && deno lint && deno check` | clean |
| `deno task test` | **2258 passed**, 0 failed (baseline 2224) |
| `deno test -A packages/realtime/` with a live broker | 343 passed, 0 failed |
| `deno task mutate realtime` with a live broker | **14 batteries, 14 clean, 0 failed, 0 partial** (8 rows in this feature's own battery) |
| `deno task deps:analyze` | graph unchanged |
| `deno task agents:brief` | regenerated |
