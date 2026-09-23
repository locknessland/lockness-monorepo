# Tasks: a lapsed-but-alive instance re-holds its presence slots, and no connection hears presence about itself

**Plan**: `.specnaut/specs/263-lapse-rehold/plan.md` (approved at stop 1, 2026-09-23) | **Backlog item**:
[#349 — Realtime: an alive instance whose liveness lapsed is swept and never re-holds its presence slots while its sockets stay open](https://github.com/locknessland/lockness-monorepo/issues/349)

TDD is mandatory (constitution): every behaviour task starts with a witness proven red on the current
code. Every task that touches a rule in the plan's 🔒 decision table names that rule's **home**; the
decision may not land anywhere else. Homes are in `packages/realtime/drivers/redis.ts` unless the task
says otherwise.

Witness and mutant ids come from the plan's §4 tables:

- witnesses W1–W15, W3b, W11b, W15b, WS1, WS2, WD, WL and WC;
- mutants M1–M23 (including M5a/b/c), plus the new `fake_redis_280` row.

User stories are US1–US6 of the plan's §2.

## Phase 1: Setup — the test double, and the lapse run in isolation

- [X] T001 FakeRedis models `SET … GET` in the `SET` arm of `packages/realtime/tests/fake_redis.ts` (**home: that arm**, FR-015). Test first in `packages/realtime/tests/fake_redis_conformance.test.ts`: a new WC-fake test, red first.
  - The WC-fake test asserts:
    - `SET k v EX 30 GET` on an absent key → nil;
    - the same again → bulk `v`;
    - `SET k v GET EX 30` → bulk;
    - on an expired key → nil (FakeTime);
    - `GET` twice → refused;
    - `GET` over a hash → refused.
  - The `GET` branch goes **above** `if (opts[i].toUpperCase() !== 'EX') {`, and that line stays verbatim.
  - The previous value is read after the expiry check and before the write.
  - Every other option is still refused.
  - In the same file, `['GET']` leaves the refused list of "#280 SET rejects an option it does not model" (FR-017).
- [X] T002 [P] WC-live in `packages/realtime/tests/live_fake_conformance.test.ts`, in a new step group gated like the others:
  - `SET … EX 30 GET` on an absent key → nil, then → bulk;
  - the reordered `GET EX` form → bulk;
  - `GET` over a hash marked `fakeRefuses` (a declared gap; the broker answers `WRONGTYPE`).

  The fake and the live broker must agree on every other step.
- [X] T003 [P] `LapseRun` unit witnesses, red first (the module does not exist yet), in `packages/realtime/tests/lapse_run_349.test.ts` (new), with no FakeRedis:
  - W11: `close()` while a run is gated → the signal is aborted, `close()`'s promise is pending until the run settles, and no run starts afterwards;
  - W12: three `trigger()`s during a gated run → exactly one trailing run;
  - W14: `trigger()` after `close()` → the handler is never called;
  - WS2: `() => { throw new Error() }` → one WARN, `onFailure` called once, and nothing reaches an `unhandledrejection` listener;
  - a rejecting handler → one WARN and `onFailure`;
  - `register` replaces the handler.
- [X] T004 `LapseRun` in `packages/realtime/drivers/lapse_run.ts` (new, non-exported from `mod.ts`). **Home of "when the lapse handler runs" and of "how the lapse run is shut down"** (FR-007, A6).
  - Constructor `(onFailure: () => void)`.
  - `register(handler)`.
  - `trigger()`: no-op when closed or when no handler is registered; while a run is in flight, it sets the trailing flag and returns.
  - A run is `try { await handler(signal) } catch (error) { console.warn(<constant text> + renderError(error)); onFailure() }`. Its `finally` clears the run and starts the trailing run once, unless closed.
  - `close()` marks the run closed, aborts the signal, returns a promise that settles after the run in flight, then drops the handler.
  - It is concrete, with no interface and no generic runner. The WARN carries no member id and no channel.
  - JSDoc with `@fileoverview` / `@module`.
  - Turns T003 green.

## Phase 2: Foundational — the red witnesses

- [X] T005 Driver and manager witnesses in `packages/realtime/tests/lapse_rehold_349.test.ts` (new): two or three drivers and managers on one FakeRedis behind #348's `serializedCommands` wrapper, with FakeTime and a command wrapper that refuses `SET` on the alive prefix. Save each red run to the scratchpad.
  - Red on `main`:
    - **W1**: 7 back in B's `readRoster` and `here` within one heartbeat interval, plus the re-assert, plus slack;
    - **W2**: each observer on B and C gets `['left', 'joined']` for 7;
    - **W3**: 7's own tab on A receives no frame for 7, and 8's tab gets `left` then `joined`;
    - **W3b**: #348 W8's race, where 7's new tab on B receives no `left`;
    - **W7** (i) boot beat before any hold `EVAL` → no re-assert; (ii) non-serializing port with the boot `SET` gated → the racing hold's sweep is re-asserted; (iii) two holds racing the boot beat on the serializing wrapper → exactly one run, no frame;
    - **W15**: A partitioned (a subscriber wrapper drops its control deliveries); `revokeChannel(c7, X)` from B with its durable record; B sweeps A; after A heals → no `joined` for 7 anywhere, 7 absent from `readRoster`, c7 has left X.
  - Also written now, red because the code is absent:
    - W8: the reply is lost after the `SET` commits;
    - W9: one of three holds rejects;
    - W11b: the signal is aborted between slots;
    - W13: K = 5, and the beat's `SET` commits before the last hold;
    - W15b: `listRevocations` rejects once → one manager WARN, and 8 is restored;
    - WS1: `SET` answered `OK`, then an integer → no rejection escapes, one WARN per beat, no run;
    - WD: the decoder table;
    - WL: re-registration replaces, and `close()` drops the lapse **and** refusal handlers.
  - Guards, green now and green after: W4, W5, W6, W10.
- [X] T006 [P] Live W1 in `packages/realtime/tests/redis_broker_integration.test.ts`:
  - `withFaultyInstance` for A, unchanged, using `breakLivenessWrites` / `healLivenessWrites`;
  - a normal peer from `withInstances` nested in its body on the same namespace;
  - after the heal, 7 is back in the peer's roster within the bound.

  Red on `main` (`LOCKNESS_REDIS_INTEGRATION=1`).

## Phase 3: US1 — a lapsed instance puts its members back (P1)

- [X] T007 [US1] `decodeBeatReply` beside the other decoders (**home of what a beat reply means**, FR-002):
  - `{ type: 'nil' }` → `'lapsed'`;
  - any bulk → `'continuous'`;
  - anything else throws a constant message that names the accepted shapes and never the reply, its type or its length.

  Turns WD green.
- [X] T008 [US1] `holdMember` sets `#holdIssued = true` synchronously, immediately before its `EVAL` and after `await this.#ensureSweepStarted()` (**home of "counts only once a hold was issued"**, FR-003). Nothing else sets it, and it is never cleared.
- [X] T009 [US1] `#heartbeat` (**home of lapse detection; decode inside the SET's `try`**, FR-001, FR-004, S1):
  - The liveness write becomes `'SET', aliveKey, '1', 'EX', ttl, 'GET'`.
  - `const outcome = decodeBeatReply(reply)` runs **inside** that `try`, into a local variable.
  - The `catch` keeps exactly its two lines (#355 M20 anchor), and the `SADD` block is unchanged.
  - After both writes, the tail reads `#holdIssued` **at that moment**:
    - no outcome and `#holdIssued` → set `#lapseSuspected`;
    - an outcome, `#holdIssued`, and (`'lapsed'` or `#lapseSuspected`) → clear `#lapseSuspected` and call `this.#lapse.trigger()` without `await`.
  - **Home of suspicion: `#lapseSuspected`**, written only here and by the `onFailure` callback.
  - A failed `SADD` sets nothing.
  - The heartbeat stays an unguarded `setInterval` (**home: `#ensureSweepStarted`**, untouched).
- [X] T010 [US1] Driver wiring:
  - the `#lapse = new LapseRun(() => { this.#lapseSuspected = true })` field, declared **after** `#departureHandler` (#355 M24 anchor);
  - `onRosterLapse(handler)` → `this.#lapse.register(handler)`, with JSDoc and `@example`.
- [X] T011 [US1] [P] The seam in `packages/realtime/driver.ts`: `onRosterLapse?(handler: (signal: AbortSignal) => void | Promise<void>): void` on `BroadcastDriver`.
  - JSDoc: what it reports, the delivery contract (not awaited, one in flight plus one trailing, abortable, a failure retried by the next successful beat), why it takes an `AbortSignal`, and an `@example`.
  - `PresenceCapableDriver` is unchanged, and `mod.ts` is unchanged (FR-005).
- [X] T012 [US1] Manager registration (**home: the `if (roster)` block of the constructor in `packages/realtime/manager.ts`**, FR-009): `this.driver.onRosterLapse?.((signal) => this.#reassertRoster(signal))` **after** the `onRosterDeparture` registration, whose lines stay untouched (#348 M5 anchor).
- [X] T013 [US1] `#reassertRoster(signal)` in `packages/realtime/manager.ts`, slot part (FR-010, FR-011, FR-012).
  - **Homes**:
    - `#reassertRoster` for "one slot at a time, try all, then reject" and for "the origin is found by object identity against `#localRoster`";
    - `#syncRosterMember`, **unchanged**, for the write and ordering;
    - its queued run for who announces.
  - Snapshot the `(channel, origin)` pairs from `presence`'s keys and `#localRoster(channel)`. The origin's `clientId` is the entry whose value **is** the kept member object.
  - `await this.#syncRosterMember(channel, origin)` one pair at a time, checking `signal.aborted` before each.
  - Record failures and continue. At the end, reject with one `Error` giving the count and the first `renderError`, with no member id and no `info`.
  - No call to `#announcePresence` or `emitPresence`.
  - Turns W1, W2, W4 (guard), W5, W6, W8, W9, W11b and W13 green.
- [X] T014 [US1] [P] A canned `SET: { type: 'nil' }` reply where `recordingPorts`' default `null` now fails the decode (FR-017) in `packages/realtime/tests/prefix_anchoring.test.ts`, `packages/realtime/tests/channel_watch_295.test.ts` and `packages/realtime/tests/connection_id_charset.test.ts`. Record in the commit body which of the three actually needed it.

## Phase 4: US2 — a member never hears presence about itself (P1)

- [X] T015 [US2] `PresenceTransitionFrame = Extract<OutboundFrame, { type: 'presence' }> & { action: 'joined' | 'left'; member: PresenceMember }` (internal) and `emitPresence(channel, frame: PresenceTransitionFrame)` in `packages/realtime/manager.ts` (**home of "no self-frames"**, FR-013, A8).
  - It excludes every local subscriber whose presence entry on that channel has `frame.member.id` (`sameMemberId`, read at emit time), for both actions.
  - The `options` parameter and `exceptMemberId` are removed.
  - JSDoc rewritten (the maintainer's decision, 2026-09-23).
- [X] T016 [US2] The two call sites pass `(channel, frame)` only (FR-014): the local emit in `#announcePresence`, and `handleControl`'s `presence-join` arm. The `presence-leave` arm's code is unchanged.
  - `grep -n 'emitPresence(' packages/realtime/manager.ts` shows the definition plus three calls.
  - JSDoc of both methods updated.
  - Turns W3 and W3b green; #344 W9 (local and remote) stays green.
- [X] T017 [US2] Repair `packages/realtime/tests/presence_sweep_departure_348.test.ts` (FR-017):
  - rewrite the self-`left` comments of W5 and W8;
  - W8 gains W3b's assertion that 7's own new tab on B receives no `left` for 7.

  No assertion is loosened.

## Phase 5: US3 — a revocation issued during the lapse stays enforced (P1)

- [X] T018 [US3] At the top of `#reassertRoster` in `packages/realtime/manager.ts` (**home of "revocations are applied before re-holding"**, FR-010a, the A2 / S2 ruling):
  - `try { await this.reconcileRevocations() } catch (error) { console.warn(<constant text naming no target or member> + renderError(error)) }`;
  - then `if (signal.aborted) return`;
  - then T013's snapshot and loop, unchanged.

  A failed re-check never joins the aggregate rejection and never reaches `#lapseSuspected`. No change to the seam or the driver. Turns W15 and W15b green.

## Phase 6: US4 + US5 — nothing changes for a consistent roster; an unswept lapse is silent (P2)

- [X] T019 [US4] [US5] Regression run, and W10 with a hand-rolled **roster** driver without `onRosterLapse`, in `packages/realtime/tests/lapse_rehold_349.test.ts`. Run and save to the scratchpad:
  - `presence_member_transitions_344.test.ts`
  - `presence_sweep_departure_348.test.ts`
  - `reconcile_single_pass_355.test.ts`
  - `presence_join_compensation_323.test.ts`
  - `memory_driver.test.ts`
  - `presence_join_rosterless_342.test.ts`

  All green, and W5, W6 and W10 green.

## Phase 7: US6 — shutting down during a re-assert (P2)

- [X] T020 [US6] `close()` in `packages/realtime/drivers/redis.ts` (**home of the `close()` order**, FR-008, A1):
  1. `#closing`;
  2. clear the timers;
  3. `const stopped = this.#lapse.close()`;
  4. drop `revocationHandler`, still immediately above `// The pass stops at its next write` (#355 M15);
  5. `await this.#reconcilePass` (#355 M11);
  6. `await stopped`, on its own line;
  7. drop `#departureHandler`, keeping the #348 M12 comment line, and `controlRefusedHandler` (FR-006a);
  8. close the owned resources.

  JSDoc: the order, and the S5 wait bound (at most one slot write plus its queue: ≤ 30 s per `EVAL` on the built-in client, unbounded on an injected port). Turns WL, W11b's driver half and W14's driver half green.

## Phase 8: Batteries

- [X] T021 New battery `packages/realtime/tests/mutations/lapse_rehold_349.ts`. Each anchor is asserted present, and each mutant is proven live: it executes and turns its named witness red.
  - Rows and their witnesses:
    - M1 (W1);
    - M2 (W4);
    - M3 (W5, W6);
    - M4 (W2);
    - M5a (W7 i);
    - M5b, M5c (W7 ii);
    - M6 (W8);
    - M8 (W3, W3b);
    - M9 (W10);
    - M10 (W13);
    - M12, the merged self-exclusion row (#344 W9, W9 remote, W3);
    - M15 (W13);
    - M16 (WD);
    - M17 (WL);
    - M18 (W9);
    - M19, M20 (W15);
    - M21 (W15b);
    - M22 (WS1).
  - The `LapseRun` rows mutate `packages/realtime/drivers/lapse_run.ts` and run only `lapse_run_349.test.ts`: M7 (W12), M11 (W11), M13 (W14), M14 (W9 via its unit twin, and WS2), M23 (WS2).
- [X] T022 Re-anchor, anchor text replaced (3), per `docs/testing.md`:
  - Delete `packages/realtime/tests/mutations/presence_member_transitions_344.ts` **M7** and its **"handleControl re-emits a remote `joined` without exceptMemberId"** row. They merge into T021's M12, with both reasons carried verbatim as comments (subsumption), and the header's retired-rows list is updated.
  - Re-anchor `packages/realtime/tests/mutations/reconcile_single_pass_355.ts` **M19**'s `BEAT_SET` on the new `SET … GET` call text. The mutation and witness are unchanged.
- [X] T023 Re-prove live, anchor intact while the code under it or its witness changed (8):
  - `packages/realtime/tests/mutations/fake_redis_280.ts`:
    - "SET accepts an unmodelled option again" (its witness lost `['GET']`);
    - "SET stops checking its EX argument";
    - "a plain SET stops clearing the TTL".
  - `reconcile_single_pass_355.ts` **M20**.
  - `presence_member_transitions_344.ts` **M13** and **M6**.
  - `packages/realtime/tests/mutations/presence_join_323.ts`, "the announcement moves back ABOVE the authoritative write".
  - `packages/realtime/tests/mutations/self_skip_310.ts`, **against a live broker** (`LOCKNESS_REDIS_INTEGRATION=1`).

  Add a one-line "re-proven live for #349" note to each row's comment.
- [X] T024 Confirm, anchor intact unless moved (7):
  - `packages/realtime/tests/mutations/presence_sweep_departure_348.ts`: **M5**, and **M12**, whose `expectSurvival` reason is extended: `close()` also awaits the lapse run before it drops handlers;
  - `reconcile_single_pass_355.ts`: **M11**, **M14**, **M15**, **M23**, **M24**.

  Repair any row the harness reports as `DEAD MUTANT`.
- [X] T025 [P] New `fake_redis_280` row, "SET … GET answers OK", killed by the T001 WC-fake test, in `packages/realtime/tests/mutations/fake_redis_280.ts`. Then run every realtime battery; all must exit 0.

## Phase 9: Polish — ADR and docs

- [X] T026 [P] `docs/adr/007-realtime-lapsed-instance-reasserts.md` (new) records:
  - lapse detection on renewal, and the boot-beat reading (A4);
  - the revocation re-check precondition and its residue (A2 / S2);
  - the re-assert through `#syncRosterMember`, one slot at a time;
  - `LapseRun` and the hook's delivery contract;
  - the fifth hook and the rule for a sixth;
  - no self-frames (maintainer, 2026-09-23);
  - the cost of a failed beat, the redundant run, and the upgrade path (A7);
  - #358's backoff cost (S3);
  - the `WRONGTYPE` non-healing change (S4);
  - the shown-`info` rewrite;
  - the rejected shapes from the disposition and the audits.

  It amends, with Status-line and inline "Amended by ADR 007" callouts (ADR 003 convention):
  - `docs/adr/004-realtime-roster-slots-held-per-instance.md` **§2** ("`left` excludes nobody") and §5 (the lapsed-instance bullet);
  - `docs/adr/005-realtime-swept-departures-announced.md` §5;
  - `docs/adr/006-realtime-sweep-writes-only-while-dead.md` **§5** (the #349 bullet).
- [X] T027 [P] `docs/realtime.md`:
  - "Ghost sweep": rewrite the "crash recovery mechanism, not a repair" bullet with the lapsed instance's self-repair, its latency (one heartbeat interval + one revocation re-check + the re-assert), its cost (K `EVAL`s, one `PUBLISH` per returning member, and a full re-assert per failed beat once holding) and the upgrade path.
  - "Writing a presence driver": the optional `onRosterLapse`, its delivery contract, the shared lifecycle, and the refusal handler dropped on `close()`.
  - The `onControlRefused` section: one line saying `close()` drops the handler.
  - "What a `joined` frame promises": "a connection never receives `joined` **or `left`** for its own member id".
  - New **item 14** under "Upgrading to v0.4.0", "A connection never receives `joined` or `left` for its own member id", with before and after.
  - The header becomes "**Ten** breaking changes", naming this one, and "read items 1, 3, 5, 6, 8, 9, 10, 11, 12, 13 and 14".
- [X] T028 [P] Shared-lifecycle JSDoc on `BroadcastDriver` in `packages/realtime/driver.ts` (**home of the hooks' lifecycle and the rule for a sixth**, FR-006, A5):
  - One owner per driver: a second registration replaces the first.
  - One handler, dropped by the driver's own shutdown.
  - `onControl` is the named exception: its lifetime is its subscription.
  - The rule for a sixth hook: payload **and** delivery contract must differ from every existing one; consolidate only when a second production driver implements three or more hooks.

  `onControlRefused`, `onRevocationReconcile`, `onRosterDeparture` and `onRosterLapse` refer to it instead of restating it.
- [X] T029 [P] `packages/realtime/AGENTS.md` pitfalls:
  - the `GET` bit, the hold gate read at the tail, and decoding inside the `try`;
  - `LapseRun` owns when the handler runs;
  - revocations are re-checked first;
  - one slot at a time;
  - the hook rule;
  - `#announcePresence` has two callers;
  - the self-exclusion lives in `emitPresence` with no option (rewrite the `exceptMemberId` / "`left` excludes nobody" pitfall);
  - the battery count goes from 31 to 32.

  Regenerate the brief (`deno task agents:brief`).
- [X] T030 [P] Remaining JSDoc (FR-019): `decodeBeatReply`, `#heartbeat`, `holdMember` and `onRosterLapse` in `packages/realtime/drivers/redis.ts`; `#reassertRoster` and `#announcePresence` ("excludes every local connection of that member id, for both actions") in `packages/realtime/manager.ts`.
- [X] T031 Full gate, judged by exit status only: `deno fmt && deno lint && deno check && deno task test && deno task agents:brief --check && deno task mutate realtime`. Also run T006 and T023's `self_skip_310` against a live broker, and save the runs to the scratchpad.

## Dependencies

T001 → T002 / T003 → T004 → T005 / T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026–T030 → T031.

- T002 needs T001's arm. T003 and T002 are independent.
- T004 needs T003 to be red first.
- T005 and T006 need T001, because the witnesses drive `SET … GET` through FakeRedis.
- T007–T010 all edit `redis.ts` and run in order:
  - T009 needs T007 (the decoder) and T008 (the flag);
  - T010 needs T004 (`LapseRun`).
- T011 is parallel with T010 (a different file).
- T012 needs T011's type.
- T013 needs T012.
- T014 can run beside T013, but must land before T009's decode reaches `deno task test`. Commit them together.
- T015–T016 need T013 for W3's re-assert half. T017 needs T016.
- T018 needs T013; it edits the same method, above the loop.
- T020 needs T010 (`#lapse`). It is placed after the stories so that the `close()` anchors are touched once.
- T021–T025 need every behaviour task. T023's `self_skip_310` re-proof needs T009.
- T026–T030 are parallel with each other.

**Parallel example (Phase 1):** T002 (live conformance) and T003 (`LapseRun` unit witnesses) touch different files.

**Parallel example (Phase 9):** T026 (ADR), T027 (`docs/realtime.md`), T028 (`driver.ts` JSDoc), T029 (`AGENTS.md`) and T030 (JSDoc) touch five different files. T028 and T030 do not overlap: T030 does not touch `driver.ts`.

## Implementation strategy

One branch, with commits split by category:

1. `test(349)`: FakeRedis `SET … GET` and its conformance, fake and live (T001–T002).
2. `test(349)`: the red witnesses, `LapseRun` unit (T003), driver and manager (T005), and live W1 (T006).
3. `fix(349)`: `LapseRun`, the beat decode, the hold gate, suspicion, the seam, the manager registration and the slot re-assert (T004, T007–T014), with T014's canned replies in the same commit.
4. `fix(349)`: no self-frames (T015–T017), with the #348 test repair in the same commit.
5. `fix(349)`: the revocation re-check before the re-assert (T018), and the `close()` order and refusal-handler drop (T020).
6. `test(349)`: the regression run (T019, if it adds W10's hand-rolled driver), the new battery, the 18 re-anchors (3 / 8 / 7) and the new `fake_redis_280` row (T021–T025).
7. `docs(349)`: ADR 007 and the ADR 004 / 005 / 006 amendments, `docs/realtime.md` including item 14, the `driver.ts` lifecycle JSDoc, `AGENTS.md` and the brief, and JSDoc (T026–T030).

MVP is W1, W2 and W3 green (T001–T016). Everything after that is still part of the approved scope, not an option.
