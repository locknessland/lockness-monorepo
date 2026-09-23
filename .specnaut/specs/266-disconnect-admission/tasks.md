# Tasks: a disconnected connection is refused at admission, and `unsubscribe` forgets before it leaves

**Plan**: `.specnaut/specs/266-disconnect-admission/plan.md` (approved 2026-09-23, `1553c23f`) | **Backlog item**:
[#361 — Realtime: a subscribe resolving during a disconnect of the same connection strands a channel membership forever](https://github.com/locknessland/lockness-monorepo/issues/361)

**TDD is mandatory** (constitution). Every witness is written and run red on the current tree before the code that
turns it green. The red output is saved to the scratchpad.

**Decision homes.** Every task that touches a rule in the plan's 🔒 decision table (§5) names that rule's home as
**row N**. The decision may not land anywhere else. All homes are in `packages/realtime/manager.ts` unless stated.

**Ids.**
- Witnesses are W1–W12, plus W3 (ii) and W6 (ii), from the plan's §4.
- Mutants are N1–N13 and N13b.
- Test names start `#361 W<n> ` with a **trailing space**, so `W1 ` is not a prefix of `W10`–`W12`.

**Expected red on `main`.** The file does not compile on `main`, because it imports the two error classes. That is its
first red. Once T007 adds the classes, the behavioural reds are:
- **Red:** W1, W2, W3 (i), W4, W5, W6 (i and ii), W8, W9, W10, W11 and W12.
- **Pins, green before and after:** W3 (ii), the denial precedence (A3), and W7, the committed join (#330).

**Numbers assigned at landing.**
- **The upgrade note is item 17, not the plan's 15.** #365 (`ff61275d`) landed after the plan and brought
  *Upgrading to v0.4.0* to items 1–16, so the next free number is 17.
- **ADR 010 is provisional.** It is the next free number today, but #362 also planned 010. Run `ls docs/adr` when the
  ADR lands, and take the next free number.

**Anchor hygiene** (FR-012). No new comment or docstring may quote verbatim a line that a battery row anchors on. The
lines are:
- `this.connections.set(connection.id, connection)`;
- `const member = this.#forgetPresenceMember(channel, clientId)`;
- `await this.#syncRosterMember(channel, { clientId, member })`;
- `const kind = channelKind(channel)`;
- `conn.close(1011, 'unusable connection id')`;
- the durable-revocation WARN;
- the message text of any sibling error.

A second match makes a row `DEAD`. T042 greps for these.

**Worktree and the pre-commit hook.** The implementing developer works in an isolated git worktree. The pre-commit
hook type-checks **every** git worktree, not just the one being committed. So:
- the witness file imports the classes, and is committed **with** T006–T007, never alone;
- before any commit on `266-disconnect-admission`, move the worktree's diff onto the branch and remove the worktree;
- never commit with a worktree open, and never use `--no-verify`.

`deno.lock` is never touched.

## Phase 1: Setup — rebase and baseline

- [X] T001 Rebase `266-disconnect-admission` onto `main` (it now contains `ff61275d`, #365). Without this, item 17
  and the v0.4.0 intro that T038 edits do not exist on the branch.
  - Confirm with `grep -c '^### 16\. Read this even if you change nothing' docs/realtime.md`, which must print `1`.
  - Confirm that `packages/realtime/manager.ts` is byte-identical to `c00bfcde`, where the plan's line numbers were
    counted: `git diff c00bfcde -- packages/realtime/` is empty.
- [X] T002 **Baseline before the first edit.** Run the whole realtime suite, `deno test -A packages/realtime/`, and
  save the output to the scratchpad. It must be green. T014, T017, T024 and T043 compare against it.
  - Any test that later fails because it reused an object after its `disconnect` or `evict` is **repaired, never
    weakened** (plan §9, row 1). The plan's scan found none.
- [X] T003 **Battery baseline.** Run `deno task mutate realtime` and save the output to the scratchpad.
  - Batteries that need a live broker (`live_conformance_285`, `self_skip_310`, `sweep_parse_316`) may report
    `PARTIAL` without one. That is acceptable only if each is named in the saved output.
  - Every other battery must be clean. T034 compares against this run.

## Phase 2: Foundational — the harness, every red witness, then the two classes

- [X] T004 New file `packages/realtime/tests/disconnect_admission_361.test.ts` with its harnesses (FR-013). This file
  is **row 19's home**: the race harness lives here and nowhere else, and no shared helper module is created for it.
  - `GatedUnwatchDriver` extends `MemoryBroadcastDriver` (D6). It records every watch and unwatch, and suspends
    `unwatchChannel` until the test opens it. It exposes `unwatching`, a promise that resolves when the unwatch is
    reached.
  - A driver whose `unwatchChannel` rejects for one named channel, with a chosen value. The value may be `undefined`.
  - A driver with a gated `holdMember`, for W7.
  - A captured `onRosterLapse` handler that can be fired, with a count of `holdMember` calls.
  - A spy authorizer that counts its calls, and a gated authorizer that admits or denies on command.
  - Waits use the gates' promises. There are no fixed microtask counts.
- [X] T005 Write the witnesses W1–W12, W3 (ii) and W6 (ii) in
  `packages/realtime/tests/disconnect_admission_361.test.ts`, exactly as in the plan's §4 table.
  - W6 (i) must hold `news` as a second channel and assert that its teardown ran (D5). N11 depends on that assertion.
  - W8 keeps its positive control: C receives the next broadcast after its own authorized subscribe.
  - W11 drives `buildEvents(manager.handlerHooks({ onOpen: capture }), identity)` directly.
  - Run the file on the current tree. It fails to compile (the classes do not exist), and that is the first red. Save
    the output to the scratchpad.
- [X] T006 Add `ConnectionDisconnectedError` and `ConnectionIdInUseError` to `packages/realtime/manager.ts`, beside
  `ConnectionIdError` and shaped like it. **Row 7's home.** Neither class is placed in `websocket.ts`, and neither
  reuses `ConnectionIdError`, `ChannelLimitError` or a bare `Error`.
  - Each has `override readonly name`, and an `id: string` rendered through `safeForLog`. The raw id never appears in
    the message.
  - **`ConnectionDisconnectedError` (FR-003):**
    - Its message is constant: the connection was disconnected, nothing was subscribed or registered, and no retry
      will help.
    - Its full JSDoc covers why it is a named type and not `{ ok: false }` (#331), and why it is not a field on
      `SubscribeResult`.
    - Its `@example` drops the frame on `instanceof` inside `onMessage`.
  - **`ConnectionIdInUseError` (FR-003a):**
    - Its message says the id is still bound to a connection that is being disconnected. It makes no retry claim and
      gives no "drop the frame" advice.
    - Its JSDoc cites the `Connection.id` contract, and says that #363 may widen the refusal to live bindings.
  - Neither message contains a sibling's message text (FR-012).
- [X] T007 Export both classes from `packages/realtime/mod.ts`, in the error block beside `ConnectionIdError`
  (FR-011; row 7). Add one sentence to the block's comment: a lifecycle refusal that reaches the shared `onError` hook
  also needs `instanceof`.
  - Run `deno check packages/realtime/mod.ts`.
  - Re-run the witness file and save the behavioural red set. It must be exactly the "Expected red" list above:
    W3 (ii) and W7 green, and every other witness red for the reason the plan's table gives.
  - If a pin is red, or a red passes, stop and find out why before writing any code.

## Phase 3: US1 — a subscribe that spans the disconnect leaves nothing behind (P1) 🎯 MVP

**Goal:** window (a) is closed. A subscribe whose authorizer resolves while the teardown is suspended is refused, and
nothing names the connection afterwards.
**Independent test:** W1 and W2 pass.

- [X] T008 [US1] Declare `readonly #retired = new WeakSet<Connection<Identity>>()` in `packages/realtime/manager.ts`,
  beside `connections` and `#channelsByClient`. **Row 1's home.**
  - Its JSDoc carries **the definition**, and nothing else restates it:
    - retired means a `disconnect` has begun for this connection **object**;
    - retirement is terminal and per-manager;
    - it is keyed by object, so it is bounded by construction;
    - it is not a spelling of ownership;
    - it links to the ADR from T036.
  - Do not use an id-keyed set, a tombstone, a generation counter, a `closed` flag, a set cleared in `finally`, or a
    TTL.
- [X] T009 [US1] Retire the connection at the entry of `disconnect` in `packages/realtime/manager.ts`. **Row 2's home**
  (the only writer) and **row 10's home** (one synchronous turn with the reverse-index copy).
  - The first statements are, in order:
    1. `const bound = this.connections.get(clientId)`;
    2. `if (bound) this.#retired.add(bound)`;
    3. `const owned = bound !== undefined`.
  - There is no await between these statements and the copy of `#channelsByClient`, and no second `get` for `owned`.
  - `revokeLocal` and `handlerHooks.onClose` do **not** add to `#retired`: `evict` retires only through `disconnect`.
  - The loop's per-channel policy and the `finally` stay as they are (**row 13's home**). Do not delete from
    `connections` at entry (row 5).
  - Correct the docstring and the `owned` comment (FR-008). "It cannot change underneath: only this method's own
    `finally` deletes from `connections`" is false today. It becomes a statement of the retirement turn.
- [X] T010 [US1] Add `#assertAdmissible(connection: Connection<Identity>): void` to `packages/realtime/manager.ts`. For
  now it has **clause 1** only: `this.#retired.has(connection)` throws `new ConnectionDisconnectedError(connection.id)`.
  **Row 3's home** (the one reader of `#retired`) and **row 6's home** (a refusal throws).
  - T018 adds clause 2 to this same method. There is never a second predicate.
  - Its JSDoc names its three call sites and why each one exists.
- [X] T011 [US1] Add **the post-check** to `subscribe` in `packages/realtime/manager.ts`: `this.#assertAdmissible(connection)`.
  **Row 4** (where admission is asked), **row 8** (precedence) and **row 9** (no write before the refusal).
  - It goes between the #347 invariant's closing `}` and the `// BEFORE any membership mutation` comment (FR-006).
  - It is therefore below the deny `return` and every authorizer-result throw, and in the #323 synchronous turn with
    `#checkChannelCaps`, `connections.set` and the join's adds. No await is added.
  - Confirm that the `authorize_result_347`, `presence_member_admission_350`, `manager_debt_353` and
    `authorize_result_357` anchors still match once, byte for byte.
- [X] T012 [US1] Retire R13 (d) from `packages/realtime/tests/revocation_paging_359.test.ts`, removing the test at
  `:832` and its `GatedUnwatchDriver` at `:810` (FR-015, D6). `RecordingRevocationDriver` stays, because R13 (b, c)
  use it. Put this one comment line in their place:
  *"R13 (d) retired by #361: its precondition, a membership naming an id absent from `connections`, is no longer
  reachable. See `disconnect_admission_361.test.ts` W1."*
  - This lands in the **same commit** as T009–T011. T011 makes R13 (d)'s setup unreachable, so the test fails without
    it.
- [X] T013 [US1] Run `deno check packages/realtime/manager.ts packages/realtime/tests/disconnect_admission_361.test.ts`.
- [X] T014 [US1] Run the witness file. **W1 and W2 must be green.** Then run the whole realtime suite and compare it
  with T002: the only change is the retired R13 (d).

## Phase 4: US2 — a subscribe after the disconnect is refused before it costs anything (P1)

**Goal:** windows (b) and (c) are closed. A retired connection's authorizer never runs, no cap is spent, and no zombie
is re-registered.
**Independent test:** W3 (i), W3 (ii), W4, W5, W10 and W11 pass.

- [X] T015 [US2] Add **the pre-check** to `subscribe` in `packages/realtime/manager.ts`: `this.#assertAdmissible(connection)`
  is the statement directly after `const kind = channelKind(channel)` (FR-005). **Rows 4 and 8.**
  - It comes after the id and channel assertions, and before the `identity === null` denial and the authorizer.
  - Confirm that the `channel_name_314` anchors (which end at `const kind`) and the #347 and #357 anchors (which begin
    at `let member`) are byte-identical.
  - Add both classes to `subscribe`'s `@throws`: raised before the authorizer and again after it, always before any
    write (FR-007).
- [X] T016 [US2] Make `this.#assertAdmissible(connection)` the **first** statement of `register` in
  `packages/realtime/manager.ts`, before `#assertUsableId` (FR-004). **Rows 4 and 8.**
  - Keep this order: it is unobservable (A3), and it keeps the `connection_id_304` register anchor byte-identical.
  - Add both classes to `@throws`. T035 writes the lifecycle duty ("must be called from the transport's open hook").
- [X] T017 [US2] Run the witness file. **W3 (i), W3 (ii), W4, W5, W10 and W11 must be green.**
  - W10 goes green through `evict` → `revokeLocal` → `disconnect`, with nothing added to `evict` (row 2).
  - W11 pins that `connFor` presents one object for the socket's life, which is the framework side of row 16.
  - Then run the whole realtime suite green.

## Phase 5: US3 — a reused id inherits nothing (P1)

**Goal:** a different object under an id that is still being torn down is refused with its own error.
**Independent test:** W8 passes, including its positive control.

- [X] T018 [US3] Add **clause 2** to `#assertAdmissible` in `packages/realtime/manager.ts`. **Row 3's home** (one
  predicate, two clauses) and **row 7** (the choice of class).
  - Take `const bound = this.connections.get(connection.id)`. Then `bound !== undefined && this.#retired.has(bound)`
    throws `new ConnectionIdInUseError(connection.id)`.
  - The `bound !== undefined` guard is the D1 spelling: `WeakSet.has(undefined)` does not type-check.
  - The clause holds only while the id is bound, so it retains nothing.
  - Update the method's JSDoc for both clauses.
- [X] T019 [US3] Run the witness file. **W8 must be green**, including C's positive control. Then run the whole
  realtime suite green.

## Phase 6: US4 — a failed unwatch does not leave a presence ghost (P2)

**Goal:** `unsubscribe` forgets before it leaves, and every collector records a failure with a flag.
**Independent test:** W6 (i), W6 (ii) and W9 pass.

- [X] T020 [US4] Reorder `unsubscribe` in `packages/realtime/manager.ts`, in the order FR-010 gives. **Row 11's home.**
  1. `owned` stays unchanged.
  2. Forget the presence member.
  3. Await `#leaveLocal` inside a `try`, recording a failure with a flag and its value.
  4. `if (member)`, run the roster release inside a `try`, **whether or not the leave failed**. If the leave
     succeeded, a release failure is re-thrown. If the leave failed, the release failure is WARNed through
     `safeForLog(channel)` and `renderError`, and never names the member.
  5. Re-throw the leave's error, if there was one.
  6. Otherwise return the outcome as today.
  - Every promise is awaited where it is created. Do not use `Promise.allSettled`.
  - The #323 compensation in `#joinPresence` is **not** changed (FR-010a).
  - Do not duplicate the reorder in `disconnect`.
- [X] T021 [US4] Make `disconnect`'s collector use a flag in `packages/realtime/manager.ts`: `let failed = false` plus
  the value, never `failure === undefined` (FR-008, FR-010b). **Rows 12 and 13.** The rest of the policy is
  unchanged: the remaining channels are still torn down, the first failure is re-thrown, and later failures are WARNed.
- [X] T022 [US4] Make `evict`'s durability collector use a flag in `packages/realtime/manager.ts` (FR-010b). **Row 12.**
  - `let durabilityError: unknown` and `if (durabilityError !== undefined) throw durabilityError` become a flag plus
    the value.
  - Change only the capture and the final re-throw. The `connection_id_304` evict guard and the two `log_encoding_291`
    durable-revocation WARN anchors stay byte-identical.
- [X] T023 [US4] Make `revokeChannel`'s durability collector and `#revokeChannelLocal`'s clear collector use flags in
  `packages/realtime/manager.ts` (FR-010b). **Row 12.**
  - `#revokeChannelLocal` returns `{ outcome, clearFailed, clearError }`.
  - `revokeChannel`'s fallback reads the flag instead of testing `durabilityError === undefined`.
  - `#applyRevocation` ignores the clear result and stays unchanged.
  - Change only the capture lines and the return shape. The `channel_revoke_332` anchors (`revocationId: revocation.id,`,
    and `if (left === 'left') {` / `for (const id of group.ids) {`) stay byte-identical.
- [X] T024 [US4] Checks, then witnesses:
  - `grep -nE "(Error|failure) (===|!==) undefined" packages/realtime/manager.ts` finds no collector.
  - Run `deno check packages/realtime/manager.ts`.
  - Run the witness file. **W6 (i), W6 (ii) and W9 must be green.**
  - Run the whole realtime suite, and compare it with T002.

## Phase 7: US5 — the framework's own socket path is torn down, whatever the app's close hook does (P2)

**Goal:** `handlerHooks.onClose` always runs `disconnect`, and never loses the app's error.
**Independent test:** W12 passes, in both of its cases.

- [X] T025 [US5] Rewrite `handlerHooks.onClose` in `packages/realtime/manager.ts` (FR-010c). **Row 14's home.**
  1. Await `userHooks.onClose?.(…)` inside a `try`, recording a failure with a flag and its value.
  2. Await `this.disconnect(conn.id)` inside a `try`. If the app hook succeeded, a disconnect failure is re-thrown.
     Otherwise it is WARNed through `safeForLog(conn.id)` and `renderError`.
  3. Re-throw the app hook's error first.
  - Never use a bare `try/finally`. Do not run `disconnect` before the app hook. Do not add a catch in `websocket.ts`:
    that is the separate S2b item.
  - `onOpen`'s `conn.close(1011, 'unusable connection id')` lines stay untouched (`connection_id_304` ×2).
- [X] T026 [US5] Run the witness file. **W12 must be green in both cases**: the rejection is `APP`, and when
  `disconnect` also fails, its failure is exactly one WARN. Then run the whole realtime suite green.

## Phase 8: US6 — a join that committed before the disconnect behaves as today (P3)

**Goal:** #330's semantics are unchanged.
**Independent test:** W7 passes.

- [X] T027 [US6] Confirm that **W7** in `packages/realtime/tests/disconnect_admission_361.test.ts` is still green after
  T008–T025, as it was on `main` (T007):
  - the subscribe resolves `{ ok: true }`;
  - the disconnect resolves `'disconnected'`;
  - no state names `c1`;
  - the roster does not hold member 1.

  No code changes. If W7 is red, the post-check (T011) or the reorder (T020) is misplaced. Fix that, and never the
  witness.

## Phase 9: Batteries — #361's battery, the re-anchors, #359's M14 and the adjacent rows

- [X] T028 New battery `packages/realtime/tests/mutations/disconnect_admission_361.ts` (FR-014). `SUITES` is
  `disconnect_admission_361.test.ts`.
  - `this.#assertAdmissible(connection)` appears three times, so each row anchors on a neighbouring line and must match
    exactly **once**:

  | Row | Mutant | Anchor | Killed by |
  | :--- | :--- | :--- | :--- |
  | N1 | post-check removed | the post-check plus `// BEFORE any membership mutation` | W1, W3 (i) |
  | N2 | pre-check removed | `const kind = channelKind(channel)` plus the pre-check | W4 (authorizer call count) |
  | N3 | retirement moved from `disconnect`'s entry into its `finally` | the entry's `#retired.add` line | W1 |
  | N4 | post-check moved below `connections.set` | the post-check through the `connections.set` line | W3 (i) (`connectionCount`) |
  | N5 | `register`'s check removed | the check plus `#assertUsableId` | W5 |
  | N6 | `unsubscribe`'s forget moved back after the awaited leave | the forget and the leave `try` | W6, W9 |
  | N7 | the release skipped when the leave failed | the release `try` | W6 |
  | N8 | clause 2 removed from `#assertAdmissible` | the clause-2 lines | W8 |
  | N9 | the split collapsed: clause 2 throws `ConnectionDisconnectedError` | the clause-2 `throw` | W8 |
  | N10 | post-check hoisted above the deny `return`, straight after the awaited authorizer | the awaited authorizer line | W3 (ii) |
  | N11 | `disconnect`'s per-channel `try`/`catch` removed | the loop body | W6 (i) (`news` torn down) |
  | N12 | `handlerHooks.onClose` back to the unprotected order | the `onClose` body | W12 |
  | N13 | `disconnect`'s collector back to `failure === undefined` | the flag lines | W6 (ii) |
  | N13b | `#revokeChannelLocal`'s clear collector back to `clearError === undefined`, with the returned flag dropped | the clear `catch` and the return | W6 (ii), the `revokeChannel` clear case |

  - **Every row is proven live.** Each is `KILLED` by its named witness, run alone against the mutated source.
  - A kill caused by a type error, or by a different test, does not count. Where that happens, the anchor or the
    mutant is wrong.

  **As built:** N6 is attributed to W9 only. With the leave's failure collected by a flag, a forget placed after the
  leave still runs, so W6 cannot see the order: the row was measured `MISATTRIBUTED` against W6 and `KILLED` by W9.
  All 14 rows are `KILLED`, attributed.

  **Also repaired:** `presence_member_transitions_344.test.ts` #344 W7 went red under T020. Its interleaving issued
  the leave while the join was suspended at its watch, before its hold existed; the forget-before-leave makes that a
  join the leave overtook, which announces nothing. W7 now puts the hold in flight first, as its name says, and a new
  W7b pins the old interleaving (nothing announced).
- [X] T029 [P] Re-anchor `presence_eviction_334` ("#334 the local entry is dropped AFTER the roster write, not
  before") in `packages/realtime/tests/mutations/presence_eviction_334.ts`. FR-010 separated its two anchor lines.
  - New anchor: `"        const member = this.#forgetPresenceMember(channel, clientId)\n"`. It is unique, because
    the #323 compensation forgets `connection.id`.
  - New mutant: `"        const member = this.presence.get(channel)?.get(clientId)\n"`.
  - Re-prove the row live.
- [X] T030 [P] Re-verify `presence_member_transitions_344` M6 in
  `packages/realtime/tests/mutations/presence_member_transitions_344.ts`.
  - Its 12-space anchor is `"            await this.#syncRosterMember(channel, { clientId, member })\n"`. It is now a
    substring of the 16-space release line inside T020's `try`.
  - Confirm that it matches once and is `KILLED`. If not, repair it to the 16-space line and re-prove it.
- [X] T031 [P] Move M14 to `expectSurvival` in `packages/realtime/tests/mutations/revocation_paging_359.ts:333`
  (FR-015). **Row 17's home.** Keep the row and its anchor unchanged.
  - `killedBy: '(none — equivalent)'`, which is the #341 sentinel (A8).
  - The reason is the plan's FR-015 text verbatim. It names R13 (b, c)'s foreign id as the fixture that would kill it.
  - Update the row comment (`:340–347`) and the battery header (`:36–39`).
  - Do not re-point M14 at an unwatch-failure witness, do not delete it, and do not restate the reason in the #361
    battery.
- [X] T032 Re-run each battery that holds an **adjacent row** (plan §4: 22 rows in 11 batteries). Confirm every row:
  - **Unchanged and `KILLED`** (20 rows):
    - `connection_id_304` ×6: the `register()` guard, the `subscribe()` guard, the id in the message, the two `onOpen`
      close lines, and the evict guard;
    - `channel_name_314` ×3. "UNSUBSCRIBE guarded too" is re-verified live, because its injected assertion now lands
      above the forget;
    - `authorize_result_347` M7;
    - `authorize_result_357` M1, M5 and M7;
    - `manager_debt_353` M1;
    - `presence_member_306` ("moved AFTER the roster write");
    - `presence_member_admission_350` M10;
    - `log_encoding_291` ×2 (the durable-revocation WARN);
    - `channel_revoke_332` ×2 (the publish, and the clear loop). Both are re-verified live, because the clear loop's
      `catch` sits right below the second anchor.
  - **Re-anchored:** `presence_eviction_334` (T029).
  - **Re-verified:** `presence_member_transitions_344` M6 (T030).
  - **Also re-run:** `revocation_paging_359`, where M14 is now at its `expectSurvival` (T031).
  - A `DEAD MUTANT` is **repaired, never deleted**, and only after checking that T011, T015, T016 and T020–T025 kept
    their anchors byte-identical.
- [X] T033 Re-run the presence batteries **whole**, because the `unsubscribe` reorder can change an observable
  ordering (plan §9). Run their test files too.
  - The batteries are `presence_join_323`, `roster_sync_330`, `presence_eviction_334`, `presence_local_member_343`,
    `presence_member_transitions_344`, `presence_member_holds_345`, `presence_sweep_departure_348` and
    `lapse_rehold_349`, all in `packages/realtime/tests/mutations/`.
  - Every row must be `KILLED` or at its recorded `expectSurvival`.
- [X] T034 Run `deno task mutate realtime` and compare it with T003. There must be 35 batteries: 34 plus
  `disconnect_admission_361`.
  - Every one is clean, except the named live-broker batteries (`live_conformance_285`, `self_skip_310`,
    `sweep_parse_316`), which may report `PARTIAL` when no broker is available. Name them in the result.

## Phase 10: Polish — JSDoc, ADR, docs, the brief, and the gate

- [X] T035 [P] JSDoc in `packages/realtime/types.ts` and `packages/realtime/manager.ts` (FR-017, FR-017a; hard rule
  #7).
  - **`Connection`** (`types.ts:106–115`) is **the home of the same-object duty** (row 16): a transport presents the
    object it registered for the socket's whole life.
  - **`register`** is **the home of the open-hook duty** (row 16): it must be called from the transport's open hook.
  - Audit that each of these carries what FR-017 lists:
    - `#retired` (the definition, row 1) and `#assertAdmissible` (both clauses, and its three call sites);
    - both classes (T006), and the `mod.ts` block sentence (T007);
    - `subscribe` (`@throws`), `disconnect` (the retirement turn, the flag);
    - `unsubscribe` (forget before leave, the failure policy);
    - `handlerHooks` (the `onClose` guarantee), `evict` (the flag).
  - Nothing here quotes an anchor line (FR-012).
- [X] T036 [P] Write the ADR. Run `ls docs/adr` first and take the next free number: 010 today, unless #362 has
  landed. The file is `docs/adr/<NNN>-realtime-disconnect-retires-the-connection-object.md`. It records:
  - the question and the three windows;
  - retirement by object, **linking** to `#retired`'s JSDoc rather than restating the definition (row 1);
  - admission versus ownership (row 5);
  - the two refusal types (row 7);
  - the precedence rule (row 8);
  - the transport lifecycle contract, linking to its homes (row 16);
  - the rejected options with their costs (disposition §9);
  - the residue (plan §9): S2b, the unregistered first subscribe, a fresh object per call, the A11 compensation gap,
    the driver-side hold and the orphan watch;
  - that #363 amends it.

  Then put the number you took into T008's `#retired` link.
- [X] T037 [P] `docs/realtime.md`, the contract section and the worked example (FR-017a, FR-017).
  - § *Two constraints on your connection ids* (`:466`) becomes **one** section, covering the two id rules and the
    three lifecycle duties: register at open with the object, the same object for life, and disconnect at close.
    **This is row 16's user-facing home.** There is no second "constraints" section.
  - § *The connection* gains a pointer to that section, without restating it.
  - The worked example (the `onMessage` that awaits `data.arrayBuffer()`, near `:1016–1053`) wraps
    `await dispatch(conn, frame)` in a `try`. It drops the frame on `instanceof ConnectionDisconnectedError` and
    re-throws anything else. **Row 18's home.**
- [X] T038 `docs/realtime.md` § *Upgrading to v0.4.0*: add **item 17** (FR-017). Row 18. This runs after T037,
  because it edits the same file.
  - **The heading and a before/after** document the two classes separately:
    - `ConnectionDisconnectedError`: this object was disconnected. Catch it with `instanceof` and drop the frame.
    - `ConnectionIdInUseError`: a different object under an id that is still being torn down. It is a breach of the id
      contract, so it is not retried and not dropped silently.
  - **It also covers:**
    - an uncaught refusal reaches `onError`, or the default ERROR line;
    - the precedence rule: a denial is still `{ ok: false }`;
    - `handlerHooks` now always disconnects, even when the app's `onClose` throws;
    - `connectionCount` no longer counts zombies;
    - `evict` and `revokeChannel` now re-throw a rejection whose value is `undefined`;
    - there is no wire change and no migration step.
  - Item 17 **points to** the T037 section and does not restate the lifecycle duties.
  - **The intro.** "Sixteen items. Eleven are breaking changes — …" becomes "Seventeen items. Twelve are breaking
    changes — …", adding "a disconnected connection now refused at admission" to the list.
  - Add 17 to the "read items 1, 3, 5, … 15 and 16" list, because every application with an awaiting `onMessage` is
    affected.
- [X] T039 [P] Add one bullet to *What ships* in `packages/realtime/README.md`: a disconnected connection is refused
  with `ConnectionDisconnectedError`, and a reused id that is still being torn down is refused with
  `ConnectionIdInUseError`. Link to item 17. Do not restate the guidance beyond this bullet (row 18).
- [X] T040 [P] Update `packages/realtime/AGENTS.md`.
  - Add both classes to the *Public surface* row (`:56`).
  - The *Invariants* bullet becomes "…reaches a connection only after the authorizer approved **that object's own**
    subscribe".
  - Add the new pitfall, pointing at the T036 ADR: *retirement is keyed by object and terminal, and it is not a
    spelling of ownership. Never consult it in the revocation decider or any other ownership reader, never re-key it
    by id, and never delete from `connections` at `disconnect`'s entry.*
  - Then run `deno task agents:brief` to regenerate the *Tests* list (it now includes `disconnect_admission_361`).
- [X] T041 [P] In `.specnaut/specs/265-paged-revocation-read/tasks.md`, add one line after `:221` (T035's
  **As built** paragraph): *"Resolved by #361: R13 (d) retired, M14 is `expectSurvival`."* Leave the rest of that
  historical file untouched.
- [X] T042 Hygiene greps, each checked by its count:
  - `grep -n '#retired' packages/realtime/manager.ts` finds only the declaration, the one `add` in `disconnect`, and
    the reads inside `#assertAdmissible` (rows 1–3).
  - `grep -c 'this.#assertAdmissible(connection)' packages/realtime/manager.ts` prints `3` (row 4).
  - `#retired` does not appear in `#recheckRevocations`, `owns`, `unsubscribe`, `evict` or `deliverLocal` (row 5).
  - Each FR-012 anchor line in the header still matches the count its battery expects, so no new comment has
    duplicated one.
  - The FR-010b grep from T024 still finds nothing.
- [X] T043 **The full gate, judged by exit status only**, never by a pipe's:
  `deno fmt && deno lint && deno check && deno task test && deno task agents:brief --check && deno task mutate realtime`.
  - Batteries that need a live broker may report `PARTIAL` only if each is named. Where a broker is available, run
    them live (`LOCKNESS_REDIS_INTEGRATION=1`).
  - Confirm that `git diff --stat main -- deno.lock` is empty, and that `git worktree list` shows no leftover
    worktree.
  - Record the pass and fail counts and the battery totals in this task when you tick it.

  **Recorded:** `deno fmt --check`, `deno lint`, `deno check` and `agents:brief --check` exit 0; `deno task test`
  exit 0, 2898 passed, 0 failed, 42 ignored; `deno task mutate realtime` exit 0, 35 batteries, 32 clean, 0 failed,
  3 partial (`live_conformance_285`, `self_skip_310`, `sweep_parse_316`: no live broker). `deno.lock` untouched. The
  T003 baseline reported `websocket_error_routing_352` as FAIL (its suite "did not compile"): that run overlapped the
  uncommitted witness file, which imported classes that did not exist yet. It is clean in this run.

## Dependencies

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 →
T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026 → T027 → T028 / T029 / T030 / T031 → T032 → T033 → T034 →
T035–T041 → T042 → T043.

- **Rebase first.** T001 comes before everything. Item 17 (T038) and an honest baseline (T002) both need #365.
- **Red before green.** T005's compile red and T007's behavioural red come before any change to `manager.ts` other
  than the two classes. Each story phase ends with the task that turns its witnesses green.
- **`manager.ts` goes in order.** T006 and T008–T025 all edit `packages/realtime/manager.ts` and run in sequence.
  T010 and T018 build the one predicate in two steps, and T018 must not create a second one.
- **Story order.**
  - US1 comes before US2 and US3, because they use the predicate and the retirement.
  - US4 and US5 depend only on Phase 2, but share `manager.ts`, so they run after US3.
  - US6 is a check after US1–US5.
- **Commits under the hook.**
  - T004–T007 are committed together: the witness file imports the classes.
  - T012 goes with T009–T011, because R13 (d) fails once they land.
  - Every commit is made with no worktree open.
- **Batteries.**
  - T028 depends on every code task.
  - T029 and T030 depend on T020.
  - T031 depends on T012 and T020. It is honest only once the precondition is unreachable (W1, W3, W8) and presence is
    forgotten before the leave (W6).
  - T032–T034 come after T028–T031.
- **Docs.** T036's number feeds T008's link and T040's pitfall. T038 follows T037, because they edit the same file.

## Parallel examples

- **Phase 9:** T028 (new battery), T029 (`presence_eviction_334.ts`), T030 (`presence_member_transitions_344.ts`) and
  T031 (`revocation_paging_359.ts`) touch different files.
- **Phase 10:** T035 (JSDoc in `types.ts` and `manager.ts`), T036 (ADR), T037 (`docs/realtime.md`), T039 (README),
  T040 (`AGENTS.md`) and T041 (#359's `tasks.md`) touch different files. T038 follows T037.
- **Phases 3–8** are serial: one file, `manager.ts`, and one witness file.

## Implementation strategy

This is one branch, `266-disconnect-admission`. Incremental commits during implementation are fine, for example one
per story phase once its witnesses are green, each with a conventional prefix and `(361)`. At merge, the history is
**squashed by scope** into two commits:

1. `fix(361)`: the code and the tests (T004–T034).
   - The two classes and their export.
   - `#retired` and `#assertAdmissible`.
   - The retirement at `disconnect`'s entry, and the three call sites.
   - The `unsubscribe` reorder.
   - The flag collectors.
   - `handlerHooks.onClose`.
   - The witness file.
   - R13 (d) retired.
   - The #361 battery, the 334 re-anchor, the 344 re-verification and M14's `expectSurvival`.
   - The `types.ts` and `manager.ts` JSDoc from T035. JSDoc lands with its code (hard rule #7).
2. `docs(361)`: the ADR, `docs/realtime.md` (the merged contract section, the worked example and item 17), the README
   bullet, `AGENTS.md` and the regenerated briefs, and the #359 `tasks.md` line (T036–T041).

**MVP = US1 green (T001–T014).** Window (a), the stranding HIGH, is closed. Everything after it is approved scope, not
an option:
- windows (b) and (c);
- the id-reuse refusal;
- the presence ghost and the flag rule;
- the `handlerHooks` guarantee;
- the batteries;
- the docs.
