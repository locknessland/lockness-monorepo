# Tasks: one Redis reconcile pass at a time, sweeping only while the target is dead

**Plan**: `.specnaut/specs/262-reconcile-single-pass/plan.md` (approved 2026-09-23) | **Backlog item**:
[#355 — Realtime: run one Redis reconcile pass at a time, sweep only while the target is dead, and count only effective releases](https://github.com/locknessland/lockness-monorepo/issues/355)

TDD is mandatory (constitution): every behaviour task starts with a witness proven red on the
current code. Every task that touches a rule in the plan's 🔒 decision table names that rule's home —
the decision may not land anywhere else. All homes are in `packages/realtime/drivers/redis.ts`
unless stated. Witness and mutant ids are the plan's §4 tables (W1–W7, W6b, WD, WC; M1–M17).
**Scheduling lands first** (plan A6): one FakeTime `tickAsync` fires a timer callback without
awaiting its promise, so under the new scheduler one tick of k intervals runs one pass.

## Phase 1: Setup — the scheduler, alone

- [X] T001 Inventory the 12 files that drive the sweep clock and record, in a comment block at the top of `packages/realtime/tests/reconcile_single_pass_355.test.ts` (new), which of them change under the self-re-arming timer and why: `driver_redis.test.ts`, `eviction_durable.test.ts`, `eviction_reconnect.test.ts`, `live_fake_conformance.test.ts`, `live_realtime.ts`, `presence_member_frozen_354.test.ts`, `presence_sweep_departure_348.test.ts`, `presence_sweep.test.ts`, `redis_broker_integration.test.ts`, `revocation_retry.test.ts`, `roster_atomicity_323.test.ts`, `roster_holders_345.test.ts` (all under `packages/realtime/tests/`). For each: does it rely on more than one sweep pass per `tickAsync`, or on overlapping passes (then it changes — split the tick, or `tickAsync` per interval), or only on the revocation timer (then it does not). Save the pre-change run of all 12 to the scratchpad as the baseline.
- [X] T002 Scheduler, landed on its own and green before anything else (FR-001, FR-002, FR-013): add `#closing = false`, `#reconcilePass?: Promise<void>`, `reconcileTimer` typed `ReturnType<typeof setTimeout>`; new `#armReconcile()` — **home of "at most one pass" and of "armed only while not closing"** — returns while `#closing`, else arms one `setTimeout(reconcileIntervalMs)` whose callback stores the pass in `#reconcilePass`, runs `#reconcile()`, and in the pass's `finally` clears `#reconcilePass` and calls `#armReconcile()`. `#ensureSweepStarted` (**home of "heartbeat armed only while not closing, and unguarded"**) awaits the boot beat, arms the heartbeat `setInterval` only if `!#closing`, then calls `#armReconcile()`. `#reconcile` keeps exactly one caller. Adjust only the T001 files classified as changing, with a one-line reason each; no assertion is weakened.
- [X] T003 Correct the two comments that claim `tickAsync` awaits a timer callback's promise — `#ensureSweepStarted` and the revocation timer (`packages/realtime/drivers/redis.ts`, currently near `:2372` and `:2122`) (FR-017, A6).

## Phase 2: Foundational — witnesses, red first

- [X] T004 Witnesses in `packages/realtime/tests/reconcile_single_pass_355.test.ts` (FakeRedis behind #348's `serializedCommands` wrapper, FakeTime); each red one proven red on the T002 tree first (save the red run to the scratchpad):
  - W1 (**red** on `main`; record whether T002 already greens it): owned-set `SMEMBERS` gated, two intervals elapse → one owned-set `SMEMBERS`, no second instance-set `SMEMBERS`; gate opened → one departure, one "released" line.
  - W2 (**red**): emptied + kept (live peer) + absent → `released 2 hold(s) of dead instance … (1 emptied their slot)`; all-absent → no "released" line.
  - W3 (guard): the instance-set read rejects → one WARN; the next interval's pass sweeps.
  - W4 (**red**) cases (i)–(vi) as the plan's §4 table: gated release keeps `close()` pending and its departure is announced, no second release; no deregistration; no `EXISTS` / `SMEMBERS` for a second dead instance; no command in two intervals after `close()`; `close()` during the gated boot beat → no command after; a reconnect during `close()` runs no revocation handler and leaves no retry timer.
  - W5 (**red**): renewal mid-sweep → *refused*, B stops, A's second slot held, A registered, one `left`, one "renewed" line, no "released" line.
  - W6 (**red**): renewal while deregistration is gated → A registered, one "renewed" line.
  - W6b (**red**): a hold of A lands between the owned-set read and deregistration while A is still lapsed → A registered, no "renewed" line; the next pass releases it and deregisters A.
  - W7 (**red**): two dead instances, the first's owned-set `SMEMBERS` rejects → one `sweep of dead instance … failed after 0 hold(s) released (0 emptied)` WARN, first stays registered, second swept and deregistered in the same pass.
- [X] T005 [P] WD in `packages/realtime/tests/roster_holders_345.test.ts` (extend the #348 FR-004a test, rename to name four replies): each of the four release replies decodes through `releaseMember` / the sweep; integer 1, nil, array, empty bulk throw; an array reply carrying a marker string → the message lacks the marker; *refused* reaching `releaseMember` throws its constant message. Update the expected message text (FR-010).

## Phase 3: US1 + US4 — one pass, and a clean shutdown (P1 / P2)

- [X] T006 [US4] `close()` (**home of the stop / drop / await order**, FR-003): set `#closing`; clear reconcile, heartbeat, revocation and retry timers; drop `revocationHandler` synchronously; `await this.#reconcilePass`; drop `#departureHandler`; close owned resources. JSDoc rewritten (what it awaits, the wait bound S6).
- [X] T007 [US1] [US4] `#closing` read synchronously at exactly three points (FR-004; **home: `#reconcile` for the instance check, `#sweepInstance` for release and deregistration**): top of `#reconcile`'s loop body before `EXISTS`; before each `#release`; before deregistration. **No check and no await between a release reply and the departure handler call** (#348 order). Turns W1, W4 green; #348 W8/M8/M9 stay green.
- [X] T008 [US4] Repair `packages/realtime/tests/presence_sweep_departure_348.test.ts` (FR-015): A6's mid-sweep half (asserts the reverse of W4 and now deadlocks) → registration replaces; `close()` drops the handler; mid-sweep is W4's. W8's `holdIssued` predicate re-keyed off `args[2] === '4'` to B's hold (B's owned key); its assertions unchanged.

## Phase 4: US3 — the sweep writes only while its target is dead (P1)

- [X] T009 [US3] `KEPT = 2`, `REFUSED = 3` as named constants beside `RELEASE_MEMBER_SCRIPT` (**home of the codes**, FR-009); template literals only on the script lines holding them (FR-008, A7).
- [X] T010 [US3] `RELEASE_MEMBER_SCRIPT` (**home of "a sweep writes only while its target is dead"**, FR-005): `KEYS[4]` releaser's liveness key, `ARGV[4]` `'1'`/`'0'`; the nested-`if` liveness check first, before any read or write; tail after the promotion block → `if mine == false then` / `return 0` / `end` / `return <KEPT>`. Every other line byte-identical. JSDoc key legend and the four replies.
- [X] T011 [US3] `#release` takes the explicit boolean and builds `KEYS[4]` as `this.aliveKey(releaserId)` only (**home: `#release` builds the key, `#sweepInstance` is the only caller passing `true`**, FR-006, S5); `releaseMember` passes `false`.
- [X] T012 [US3] `decodeReleaseReply` → unexported `ReleaseOutcome` union (**home of what a release reply means**, FR-010) with a constant error message that never includes the reply (S4). `releaseMember` (**home of the public `gone` answer**, FR-011): `emptied` → `true`, `kept`/`absent` → `false`, `refused` → throw a constant message. `RosterRelease` in `packages/realtime/driver.ts` untouched.
- [X] T013 [US3] `DEREGISTER_INSTANCE_SCRIPT` (**home of "deregistered only while dead and owning nothing"**, FR-007) with `KEYS[1]` instances, `KEYS[2]` liveness, `KEYS[3]` owned; `decodeDeregisterReply` beside it (**home of the deregistration reply**): `0` / `REFUSED` / `KEPT`, else a constant-message throw. Replaces the raw `SREM` in `#sweepInstance`.
- [X] T014 [US3] `#heartbeat` (**home of the write order**, FR-008a): `SET alive … EX` before `SADD instances`; `SADD` still attempted when `SET` failed; one WARN per failed beat. Turns W5, W6, W6b green.
- [X] T015 [US3] Update the comment in `packages/realtime/tests/prefix_anchoring.test.ts` `CANNED.EVAL` (release now 4 keys, deregistration 3; `>= 3 → 0` already answers both) (FR-015).

## Phase 5: US2 + US5 — honest count, contained failure (P1 / P2)

- [X] T016 [US2] [US5] `#sweepInstance` (**home of what a sweep logs and of "a refused sweep stops that instance"**, FR-012): count N = emptied + kept, E = emptied from `ReleaseOutcome`; on *refused* (release or deregistration) stop that instance and log the "renewed" line; on completion log the "released" line only when N > 0 (keep the substring `hold(s) of dead instance`); ids through `safeForLog`. Turns W2 green.
- [X] T017 [US5] Per-instance `catch` in `#sweepInstance` (**home of "one instance's failure ends only that instance's sweep"**, FR-004a): one "failed" WARN with N, E and `renderError`, no deregistration; `#reconcile`'s outer catch keeps only the instance-set read and `EXISTS`. Turns W7 green; W3 stays green.

## Phase 6: Conformance

- [X] T018 [P] WC in `packages/realtime/tests/live_fake_conformance.test.ts` (gated live rows, `LOCKNESS_REDIS_INTEGRATION=1`): each of the four release replies and the three deregistration replies, on FakeRedis and the live broker.

## Phase 7: Batteries

- [X] T019 New battery `packages/realtime/tests/mutations/reconcile_single_pass_355.ts`, each anchor asserted present and each mutant proven live (it executes and turns its named witness red): M1 (W1), M2 re-arm moved into `#reconcile`'s `try` (W3), M3 (W2), M4 (W2), M5 (W5), M6 (the #344 leave witnesses + #345 W1), M7 (W5), M8 (W2), M9 (W6), M10 (W6b), M11 (W4 i), M12a/b/c (W4 iii / i / ii), M13 (W4 iv, v), M14 (W4 v), M15 (W4 vi), M16 (WD, W5), M17 (W7), and — plan amendment 2026-09-23 — M18 the "released" line dropped on the `close()` path (W4 (vii)).
- [X] T020 Re-anchor — anchor text replaced (8), each repaired or subsumed per `docs/testing.md`, then proven live: `packages/realtime/tests/mutations/presence_member_holds_345.ts` "the sweep goes back to a raw presence HDEL", "the sweep releases with its OWN id instead of the dead one's", "the sweep DELs the dead instance's owned set again" (its `SREM` anchor → the deregistration call); `packages/realtime/tests/mutations/presence_sweep_departure_348.ts` M1, M4 (the sweep's `#release` call), M2 (rewritten as "the kept reply answers the entry"), M3 (`releaseMember`'s mapping), M7 (the decoder's bulk branch).
- [X] T021 Re-prove live — anchor survives, code under it changed (7): `presence_member_holds_345.ts` the four release-script rows (holders `HDEL`, presence `HDEL` at `n == 0`, `shown == mine` guard, copy branch); `presence_member_transitions_344.ts` M4 (reason comment: still dies on the decoder's nil throw); `packages/realtime/tests/mutations/self_skip_310.ts` (after the T014 heartbeat reorder, against its live scenario); `presence_sweep_departure_348.ts` M12 → `expectSurvival` with the falsifiable reason (close awaits the pass, the pass stops on `#closing`, `#armReconcile` never arms while closing), never deleted.
- [X] T022 Confirm — anchor intact unless moved (5): `presence_sweep_departure_348.ts` M9, M10; `sweep_parse_316.ts` ×2; `revocation_retry_308.ts` "close() stops clearing the pending retry". Repair any the harness reports as `DEAD MUTANT`. Run every realtime battery; all exit 0.

## Phase 8: Polish — ADR and docs

- [X] T023 [P] `docs/adr/006-realtime-sweep-writes-only-while-dead.md` (new): the decision (one pass per driver; the in-write liveness check; deregistration only while dead and owning nothing; four release outcomes), the rejected shapes from the disposition and audits A3/A4, the residues (cross-instance overlap, latency + one pass, an unparsable owned entry keeps a dead instance registered, a `0.3.0` sweeper's raw `SREM`, an owned set too large for one reply — filed separately). Amend `docs/adr/004-*` §2, §5 and `docs/adr/005-*` §2, §5 with Status-line and inline "Amended by ADR 006" callouts (ADR 003 convention): overlapping passes closed, deregistration residue closed, lapsed-instance bullet narrowed.
- [X] T024 [P] `docs/realtime.md` "Ghost sweep": one pass at a time; what N and E mean; no line at 0; the "renewed" and "failed" lines; latency = liveness TTL + reconcile interval + one pass; `close()` can wait up to two broker round trips plus one departure-handler call (≈60 s worst case on `fromConfig`). No numbered upgrade item.
- [X] T025 [P] `packages/realtime/AGENTS.md`: strict-decoder pitfall (four release replies, three deregistration replies, two decoders), the sweep bullet (one pass, in-write liveness, per-instance containment), heartbeat write order; regenerate the brief (`deno task agents:brief`) so the new test and battery are listed.
- [X] T026 [P] JSDoc in `packages/realtime/drivers/redis.ts`: `RELEASE_MEMBER_SCRIPT`, `DEREGISTER_INSTANCE_SCRIPT`, `decodeReleaseReply`, `decodeDeregisterReply`, `#release`, `releaseMember`, `#sweepInstance`, `#reconcile`, `#armReconcile`, `#ensureSweepStarted`, `#heartbeat`, `close`.
- [X] T027 Full gate, exit status only: `deno fmt && deno lint && deno check && deno task test && deno task agents:brief --check && deno task mutate realtime`.

## Dependencies

T001 → T002 → T003 → T004 / T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 / T019 → T020 → T021 → T022 → T023–T026 → T027.

- T002 must be green on its own before any witness is written (A6).
- T005 is parallel with T004 (different file). T018 is parallel with T019.
- T009–T012 all edit `redis.ts` and run in order; T013 depends on T009 (the codes); T016 depends on T012 and T013 (the outcomes it counts).
- T021's `self_skip_310` re-proof depends on T014.
- T023–T026 are parallel with each other.

**Parallel example (Phase 8):** T023 (ADR), T024 (`docs/realtime.md`), T025 (`AGENTS.md`) and T026 (JSDoc) touch four different files and can be written at once.

## Implementation strategy

One branch, commits split by category:

1. `refactor(355)` — the scheduler alone (T002–T003) plus the test adjustments T001 recorded.
2. `test(355)` — the red witnesses (T004–T005).
3. `fix(355)` — `close()`, the closing checks, the scripts, decoders, heartbeat and sweep (T006–T017), with T008 and T015's test repairs in the same commit as the behaviour that needs them.
4. `test(355)` — conformance, the new battery and the 20 re-anchors (T018–T022).
5. `docs(355)` — ADR 006, the ADR 004/005 amendments, `docs/realtime.md`, `AGENTS.md`, JSDoc (T023–T026).

MVP = W1 and W4 green (T001–T008). Everything after that is still part of the approved scope, not an option.
