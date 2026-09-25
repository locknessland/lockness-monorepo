# Tasks: `register` is the only way in — one owner object per connection id

**Plan**: `.specnaut/specs/270-register-only-admission/plan.md` (approved 2026-09-25 at `a1d1c0eb`, rebased as
`470f887c`) | **Backlog items**:
[#370 — Realtime: retire subscribe's implicit registration](https://github.com/locknessland/lockness-monorepo/issues/370)
and
[#363 — Realtime: a different Connection registered under a live connection's id takes over its memberships, and the old socket's disconnect then tears the new one down](https://github.com/locknessland/lockness-monorepo/issues/363)

**TDD is mandatory** (constitution). Every witness is written and run red on the current tree before the code that
turns it green. The red output is saved to the scratchpad.

**Decision homes.** Every task that touches a rule in the plan's 🔒 decision table (§5) names that rule's home as
**row N**. The decision may not land anywhere else. All homes are in `packages/realtime/manager.ts` unless stated.

**Ids.**
- **Witnesses:** W1–W9 and W11–W13, in `packages/realtime/tests/register_only_admission_370.test.ts`, and
  `#361 W13`, in `packages/realtime/tests/disconnect_admission_361.test.ts`. W10 is not reused (plan A3).
- **Mutants:** M1–M13 in the new battery; the 10 re-anchored rows and the 1 re-verified row in existing batteries.
- **Test names** start `#370 W<n> ` with a **trailing space**, so `W1 ` is not a prefix of `W11`–`W13`.

**Expected red on `main`.** The witness file does not compile on `main`, because it imports
`ConnectionNotRegisteredError`. That is its first red. Once T021 adds the class, the behavioural set is:
- **Red:** W1, W2, W3, W4, W5, W7, W8, W11, W12 (i and ii) and W13.
- **Pins, green before and after:** W6 (same-object no-op), W9 (clause 1 first) and `#361 W13` (the post-site
  before the caps).

**The commit order is binding (plan A2, §7).** Five commits, in this order:
1. **`test(370)`** — the fixture migration, **green against the UNMODIFIED `manager.ts`** (Phase 2);
2. **`fix(370,363)`** — the code, its JSDoc, and the witness files (Phases 3–8);
3. **`test(370)`** — the tests whose premise was implicit registration, rewritten and listed (Phase 9);
4. **`test(370)`** — the new battery and the re-anchors (Phase 10);
5. **`docs(370,363)`** — ADR 010, `docs/realtime.md`, README and `AGENTS.md` (Phase 11).

**Numbers assigned at landing.** The upgrade items are **20 and 21** if *Upgrading to v0.4.0* still ends at item 19
when T052 runs. Re-check with `grep -n '^### 1[89]\.\|^### 2[0-9]\.' docs/realtime.md` and take the next free
numbers. The intro counts follow: 21 items and 15 breaking today, or whatever the re-check gives.

**#376 is landing in `manager.ts`** (`#dispatchRevocation`, inside `handleControl`). Its hunks do not touch any site
this feature edits. It does add a battery (`apply_revocation_376`), re-anchor `revoke_channel_idless_340`, and add a
test file. T001 and T004 re-check both.

**Anchor hygiene** (plan FR-012). No new comment, docstring or message may quote verbatim a line that a battery row
anchors on. The lines are:
- `this.connections.set(connection.id, connection)`;
- `const kind = channelKind(channel)`;
- `this.#assertUsableId(connection.id)`;
- `conn.close(1011, 'unusable connection id')`;
- the #353 invariant's `throw` text;
- any sibling error's message text.

A second match makes a row `DEAD`. T056 greps for these.

**Worktree and the pre-commit hook.** The hook type-checks **every** git worktree.
- The witness file imports the new class, so it is committed with the fix (commit 2), never alone.
- Before any commit on `270-register-only-admission`, move the worktree's diff onto the branch and remove the
  worktree. Never commit with a worktree open, and never use `--no-verify`.

`deno.lock` is never touched.

## Phase 1: Setup — rebase, baselines and the measured migration list

- [x] T001 Rebase `270-register-only-admission` onto `origin/main`.
  - Record whether #376 has landed: `grep -c '#dispatchRevocation' packages/realtime/manager.ts`.
  - If it has, re-run the plan's anchor dump for `revoke_channel_idless_340` and the new `apply_revocation_376`.
    Confirm that neither anchors in `register`, `subscribe`, `#assertAdmissible`, `disconnect` or `handlerHooks`. Add
    any row that does to T043's list before going on.
- [x] T002 **Suite baseline.** Run `deno test -A packages/realtime/` and save the output to the scratchpad. It must be
  green. T017, T030 and T058 compare against it.
- [x] T003 **Battery baseline.** Run `deno task mutate realtime` and save the output.
  - The live-broker batteries (`live_conformance_285`, `self_skip_310`, `sweep_parse_316`) may report `PARTIAL` only
    if each is named in the saved output. Every other battery must be clean.
- [x] T004 **The migration list, re-measured** (plan D1, FR-013).
  - Apply the three disposition edits to a scratch copy of `packages/realtime/manager.ts`: clause 2 widened, a
    `#assertBound` at both `subscribe` sites (with a plain `Error` for the class), and `subscribe`'s
    `connections.set` deleted.
  - Run the realtime suite, record every failing test by file, then **restore the file**. Confirm with
    `git diff -- packages/realtime/manager.ts`, which must be empty.
  - Compare the list with the plan's §4 (449 tests in 44 files at `150755df`). Any new file, such as #376's test file,
    joins the Phase 2 tasks. Save the list; T017 uses it.

## Phase 2: Foundational — the fixture migration (commit 1, `test(370)`, green on the UNMODIFIED `manager.ts`)

**Rule for every task in this phase (row 15's home is each file's own factory).**
- Build each connection object **once**. **Register it at the socket's open, with the manager that subscribes it.**
  Reuse it for every later call on that socket.
- A fresh object per call, such as `subscribe(conn('c1'), …)` used twice, becomes one held object.
- Keep each file's own factory. Do not create a shared helper module, and do not add a test-mode flag.
- **Never weaken, delete or skip an assertion.**
- A test whose **premise** is implicit registration cannot pass both before and after the fix. An example is a test
  that asserts `connectionCount` grew from a `subscribe`. **Leave it unchanged here**, and add it to T016's list.
- `packages/realtime/manager.ts` is not edited in this phase.

- [x] T005 [P] Migrate `packages/realtime/tests/authorize_result_357.test.ts` (84 failing in the probe).
- [x] T006 [P] Migrate `packages/realtime/tests/authorize_result_347.test.ts` (55).
- [x] T007 [P] Migrate `packages/realtime/tests/presence_member_id_type_346.test.ts` (47).
- [x] T008 [P] Migrate `packages/realtime/tests/manager_debt_353.test.ts` (34).
- [x] T009 [P] Migrate `packages/realtime/tests/lapse_rehold_349.test.ts` (28) and
  `packages/realtime/tests/presence_member_admission_350.test.ts` (28).
- [x] T010 [P] Migrate `packages/realtime/tests/presence_member_frozen_354.test.ts` (18) and
  `packages/realtime/tests/channel_watch_295.test.ts` (16).
- [x] T011 [P] Migrate `packages/realtime/tests/revocation_paging_359.test.ts` (13) and
  `packages/realtime/tests/channel_revoke_332.test.ts` (10).
- [x] T012 [P] Migrate `packages/realtime/tests/disconnect_admission_361.test.ts` (12: W1, W2, W4, W5 and the eight W6
  cases; plan D3). Register first. Their assertions do not change.
- [x] T013 [P] Migrate the 5–9 group in `packages/realtime/tests/`: `presence_sweep_departure_348`, `churn_cost_329`,
  `presence_join_compensation_323`, `presence_local_member_343`, `presence_member_transitions_344`,
  `presence_rejoin_327` and `presence_snapshot_bound_339` (`.test.ts`).
- [x] T014 [P] Migrate the 2–4 group in `packages/realtime/tests/`: `channels`, `leave_outcome_332`, `presence`,
  `presence_eviction_334`, `revoke_channel_idless_340`, `subscribe_unsubscribe_race_330`, `authorize_denial_331`,
  `driver_redis`, `driver_redis_live`, `member_info_bound_326`, `revocation_clear_race_337`, `emit_isolation_323`,
  `presence_cap_concurrency_323` and `presence_read_bound_341` (`.test.ts`).
  - `driver_redis_live`'s broker-only tests are migrated the same way, and run under
    `LOCKNESS_REDIS_INTEGRATION=1` where a broker is available.
- [x] T015 [P] Migrate the 1-each group in `packages/realtime/tests/`: `connection_id_charset`, `control_auth`,
  `deliver_local_reauth`, `disconnect_propagation`, `eviction_control`, `eviction_durable`, `eviction_reconnect`,
  `log_encoding_291`, `mixed_fleet_332`, `presence_authoritative`, `presence_join_rosterless_342` and
  `roster_holders_345` (`.test.ts`), plus any file T004 added.
- [x] T016 **The premise list.** Name, by file and test, every test left unchanged under the phase rule. Record the
  list in this task when you tick it. Phase 9 rewrites exactly these tests.
  - **Recorded (re-measured at `587bb7ca`):** the probe failed 453 tests in 45 files before the migration (#376's
    `apply_revocation_376` joined the list). After it, exactly 146 premise tests remained: `authorize_result_347` 45,
    `manager_debt_353` 32, `presence_member_id_type_346` 32, `authorize_result_357` 26 (the 24 `(a)` rows and the 2
    `(e) { id: 7, info: new Date(0) }` rows), `presence_member_admission_350` 10, and `presence_rejoin_327`'s
    "a reconnect re-binds the socket". One more surfaced at T040: `churn_cost_329`'s "the decision that there is no
    framework meter is ANCHORED", which pinned `onMessage: userHooks.onMessage,` verbatim.
- [x] T017 **The proof, then commit 1.**
  - `git diff origin/main -- packages/realtime/manager.ts` is empty.
  - `deno test -A packages/realtime/` is green, with the same count as T002.
  - Re-run T004's probe on the migrated tree. The only failures are exactly T016's premise list. That proves the
    migration needs no assertion change.
  - Run `deno fmt`, `deno lint` and `deno check` on the touched files.
  - Commit as `test(370): register every connection at open and reuse one object per socket`.

## Phase 3: Foundational — every witness, red, then the class

- [x] T018 New file `packages/realtime/tests/register_only_admission_370.test.ts` with its harnesses:
  - a spy authorizer that counts its calls, and a gated authorizer that admits or denies on command;
  - a `MemoryBroadcastDriver` subclass with a recording watch pair and a gated `unwatchChannel`, for W12 (ii);
  - a fake transport `Connection` whose `close` records its `(code, reason)` and whose `send` records frames;
  - `handlerHooks` driven directly, for W7, W11, W12 and W13.

  Waits use the gates' promises. There are no fixed microtask counts. No shared helper module is created.
- [x] T019 Write W1–W9 and W11–W13 in `packages/realtime/tests/register_only_admission_370.test.ts`, exactly as in the
  plan's §4 table.
  - W4's positive control (A receives) and W5's (B receives after its own authorized subscribe) are kept, so that
    "receives nothing" cannot pass on a broken broadcast.
  - W4 also asserts that the error message contains neither the id nor `disconnect` (S3).
  - **W7 uses `assertThrows`**, not `assertRejects`: `onOpen` throws synchronously (plan A8).
  - W12 (ii) gates the two teardowns so that the first settles and A1 registers while the second is still suspended.
- [x] T020 Add **`#361 W13`** (the post-site before the caps) to
  `packages/realtime/tests/disconnect_admission_361.test.ts` (plan A3). It is a pin: run it green on the current
  tree.
- [x] T021 Add `ConnectionNotRegisteredError` to `packages/realtime/manager.ts`, after `ConnectionIdInUseError`.
  **Row 6's home.**
  - It takes **no id**, and its constant message carries none (S3). The message: never registered, nothing was
    subscribed, call `register` from the transport's open hook. It must not contain a sibling's message text.
  - Its JSDoc states the remedy, names `handlerHooks` as the zero-work path, and has an `@example` that registers in
    `onOpen`. It **links to ADR 010 §7** for why there is no base class, and does not restate that reason.
  - Export it from `packages/realtime/mod.ts` beside `ConnectionIdInUseError`, and name the three lifecycle refusals
    in that block's comment (FR-010).
  - Run the witness file, and save the behavioural red set. It must be exactly the "Expected red" list in the header.
    If a pin is red, or a red passes, stop and find out why before writing more code.

## Phase 4: US1 — an unregistered connection is refused before it costs anything (P1) 🎯 MVP

**Goal:** `register` is the only writer, and `subscribe` refuses an unregistered object before its authorizer.
**Independent test:** W1, W2 and W9 pass.

- [x] T022 [US1] Add `#assertBound(connection)` below `#assertAdmissible` in `packages/realtime/manager.ts`. **Row 3's
  home, and row 7b's** (admissibility first, then registration).
  - Its body is `this.#assertAdmissible(connection)`, then
    `if (!this.connections.has(connection.id)) throw new ConnectionNotRegisteredError()`.
  - Its JSDoc is **row 14's home**:
    - M8: the unregistered clause is unreachable at the post-site **while `disconnect`'s `finally` deletes only its
      owner's binding** (T033);
    - M9: restoring `subscribe`'s write is equivalent;
    - it is `subscribe`'s decider.
- [x] T023 [US1] In `subscribe`, in `packages/realtime/manager.ts`, replace both `this.#assertAdmissible(connection)`
  calls with `this.#assertBound(connection)`. **Row 4** (its home is `#assertAdmissible`'s JSDoc, updated in T027) and
  **row 7a** (statement order).
  - The pre-site stays directly after `const kind = channelKind(channel)`.
  - The post-site stays between the #347 invariant and `// BEFORE any membership mutation`, with its two comment lines
    above it byte-identical.
- [x] T024 [US1] Delete `subscribe`'s `this.connections.set(connection.id, connection)` in
  `packages/realtime/manager.ts` (FR-001). **Row 1's home is `register`**, whose line stays untouched. **Row 8:** no
  write before a refusal.
  - Afterwards, `grep -n 'connections.set' packages/realtime/manager.ts` finds exactly one line, in `register`.
- [x] T025 [US1] Correct `subscribe`'s comments about the deleted write in `packages/realtime/manager.ts` (FR-008).
  That includes the #353 invariant's "above the caps and `connections.set` … would leave a `connections` entry
  behind". Quote no anchor line (FR-012).
  - Add `@throws {ConnectionNotRegisteredError}` to `subscribe`: raised at the pre-site, always before the
    authorizer.
- [x] T026 [US1] Run the witness file. **W1, W2 and W9 must be green.** Run the realtime suite. The only failures
  allowed are T016's premise list and the witnesses of later phases.

## Phase 5: US2 — a second object under a live id is refused (P1)

**Goal:** clause 2 refuses any different holder, live or retiring, and the refusal names no id.
**Independent test:** W3, W4, W6 and W8 pass, and `#361` W8 stays green.

- [x] T027 [US2] Widen `#assertAdmissible`'s clause 2 in `packages/realtime/manager.ts` to
  `bound !== undefined && bound !== connection` (FR-002). **Row 2's home, and row 5's** (same-object re-registration
  is a no-op).
  - Clause 1 is unchanged and stays first.
  - `grep -c 'this.#retired' packages/realtime/manager.ts` prints **2**: clause 1 and `disconnect`'s `add`.
  - Rewrite `#assertAdmissible`'s JSDoc. It is **row 4's home**: it lists the askers (`register` → `#assertAdmissible`;
    `subscribe` → `#assertBound`, twice) and says the same object re-registering passes.
- [x] T028 [US2] Widen `ConnectionIdInUseError` in `packages/realtime/manager.ts` (FR-011). **Row 6.**
  - Its constructor takes no argument, and its constant message carries no id (S3). It says a different connection
    object already holds this id, and that ids are minted per socket and never reused.
  - Its JSDoc states the live-or-retiring rule, drops "#363 may widen it", and links to ADR 010 §7.
  - Update its two `throw` sites to the no-argument form.
- [x] T029 [US2] Update `register`'s JSDoc in `packages/realtime/manager.ts`. **Row 9's home for duty 1** (call it from
  the open hook). Replace the "escapes" paragraph (D6), and widen `@throws {ConnectionIdInUseError}` to any different
  holder. `register`'s body is unchanged (row 7b: admission before the charset, unobservable).
- [x] T030 [US2] Run the witness file. **W3, W4, W6 and W8 must be green.** `#361` W8 stays green unmodified. Then run
  the realtime suite and compare it with T002.

## Phase 6: US3 — the refused socket's close, and a late close, harm no one else (P1)

**Goal:** every teardown the framework runs acts only on the owner, and a non-owner never reaches the app's
`onMessage`.
**Independent test:** W5, W11, W12 (i and ii) and W13 pass.

- [x] T031 [US3] Add `#isOwner(connection: Connection<Identity>): boolean` in `packages/realtime/manager.ts`, beside
  `#assertBound`. It returns `this.connections.get(connection.id) === connection`. **Row 17's home.** Its JSDoc names
  its three askers (T032, T033, T034).
- [x] T032 [US3] Widen `disconnect` to `disconnect(target: string | Connection<Identity>)` in
  `packages/realtime/manager.ts` (FR-009a). **Row 16's home.**
  - **The object form** asks `this.#isOwner(target)` first. If the object is not the owner, it returns `'not-owned'`
    **before** retiring, copying or awaiting anything. If it is, the teardown runs for `target.id` with
    `bound === target`.
  - **The id form** is unchanged. `revokeLocal` keeps `this.disconnect(clientId)`.
  - The retirement stays at the entry, from the same read as `owned`.
  - The JSDoc is **row 9's home for duty 3**: call `disconnect(conn)` with the registered object at close.
- [x] T033 [US3] Guard `disconnect`'s `finally` in `packages/realtime/manager.ts` (FR-009b). **Row 16.**
  - It deletes from `#channelsByClient` and `connections` only when `bound !== undefined && this.#isOwner(bound)`.
  - The per-channel collector and its flag are unchanged.
  - No binding is compared to an object outside `#assertAdmissible`, `#assertBound` and `#isOwner` (row 17).
- [x] T034 [US3] Update `handlerHooks` in `packages/realtime/manager.ts` (FR-009c). **Row 10's home.**
  - `onClose`: `await this.disconnect(conn)`, the object form. The #361 collector is otherwise unchanged.
  - `onMessage`: a wrapper that runs `userHooks.onMessage?.(conn, data)` only when `this.#isOwner(conn)`, and
    otherwise drops the frame **without a log line**.
  - `onOpen` is unchanged, including `conn.close(1011, 'unusable connection id')` (D5).
  - Update `handlerHooks`' JSDoc: `onClose` passes the object, and `onMessage` is owner-gated.
  - `websocket.ts` is not touched.
- [x] T035 [US3] Run the witness file. **W5, W11, W12 (i and ii) and W13 must be green.** Then run the realtime suite.
  The 23 existing id-form `disconnect(…)` test calls stay green unchanged.

## Phase 7: US4 — the framework path and same-object re-registration behave as today (P2)

**Goal:** apps on `handlerHooks` with framework ids see no change.
**Independent test:** W6, `#361` W11 and `#361 W13` pass, and the migrated suite is green.

- [x] T036 [US4] Confirm without code changes:
  - W6 (same object twice) is green;
  - `#361` W11 (`buildEvents` presents one object per socket) is green;
  - `#361 W13` (the post-site before the caps) is still green.

  If any is red, the fix is misplaced (T023, T027 or T034). Fix that, never the witness.
- [x] T037 [US4] Update the `Connection` JSDoc in `packages/realtime/types.ts` (FR-017). **Row 9's home for duty 2.**
  - Replace the "escapes that refusal" sentence (D6) with the enforced rule: a different object is refused while the
    owner is bound.
  - `Connection.id`: the server mints the id per socket, never from client input and never from a user or session key
    (S2).
- [x] T038 [US4] Give the `ChannelManager` class `@example` in `packages/realtime/manager.ts` its missing
  `manager.register(conn)` (D7).

## Phase 8: US5 — a custom transport that reuses ids hears about it (P2)

**Goal:** a second socket under a live id gets a synchronous refusal and a `1011`, and the first is untouched.
**Independent test:** W7 passes.

- [x] T039 [US5] Run W7. It goes green through T027: clause 2 now refuses the live holder's id, and `onOpen`'s close
  path is unchanged.
  - Confirm that the close reason is exactly `'unusable connection id'` (D5), and that the app's `onOpen` ran once.
- [x] T040 **Commit 2.** Run `deno fmt`, `deno lint` and
  `deno check packages/realtime/mod.ts packages/realtime/tests/register_only_admission_370.test.ts`.
  - Every witness is green. The suite's only failures are exactly T016's premise list.
  - Commit T018–T039 as `fix(370,363): register is the only way in, and teardown acts only on the owner`, with no
    worktree open.

## Phase 9: the premise tests (commit 3, `test(370)`)

- [x] T041 Rewrite each test on T016's list, in its own file, to the new outcome. An example: a subscribe on an
  unregistered object now throws `ConnectionNotRegisteredError` and leaves `connectionCount` unchanged.
  - A test's intent is kept. Only its premise changes.
  - List each rewritten test by name here when you tick it.
  - **Rewritten (147):** the T016 list plus `churn_cost_329`'s anchored-decision test, which now pins the one
    `onMessage` wrapper (the ownership gate) verbatim. A follow-up `test(370)` commit restored two
    `connection_id_charset` rows the migration had pointed at `register` instead of `subscribe`; the
    `connection_id_304` battery's subscribe-guard row caught it.
- [x] T042 Run `deno test -A packages/realtime/`: it is fully green. Commit as
  `test(370): rewrite the tests that relied on implicit registration`.

## Phase 10: Batteries (commit 4, `test(370)`)

- [x] T043 New battery `packages/realtime/tests/mutations/register_only_admission_370.ts` (FR-015). `SUITES` is
  `register_only_admission_370.test.ts` plus `disconnect_admission_361.test.ts`. Each row anchors on text that matches
  **once**:

  | Row | Mutant | Killed by |
  | :--- | :--- | :--- |
  | M1 | `#assertBound`'s unregistered throw removed | W1, W2 |
  | M2 | the pre-site calls `#assertAdmissible` | W1 (the authorizer call count) |
  | M3 | clause 2 narrowed back to `this.#retired.has(bound)` | W4, W3 |
  | M4 | clause 2 removed | W4 |
  | M5 | clause 2 over-widened to `bound !== undefined` | W6 |
  | M6 | clause 1 removed | `#361` W5 |
  | M7 | `#assertBound` asks the binding before `#assertAdmissible` | W9 |
  | M8 | the post-site calls `#assertAdmissible` | `expectSurvival`, `'(none — equivalent)'` |
  | M9 | `subscribe`'s `connections.set` restored after `#checkChannelCaps` | `expectSurvival`, `'(none — equivalent)'` |
  | M10 | `disconnect`'s object-form owner check removed | W11, W12 (i) |
  | M11 | `disconnect`'s `finally` guard removed | W12 (ii) |
  | M12 | `handlerHooks.onMessage`'s owner gate removed | W13 |
  | M13 | `handlerHooks.onClose` passes `conn.id` | W11 |

  - **M8 and M9 reasons** point to `#assertBound`'s JSDoc (row 14), and do not restate it.
  - **Every killed row is proven live.** It must be `KILLED` by its named witness, run against the mutated source. A
    kill from a type error or from a different test does not count; fix the anchor or the mutant.
- [x] T044 [P] Re-anchor the rows whose anchor included the deleted `connections.set` (plan §4):
  - `packages/realtime/tests/mutations/authorize_result_347.ts` M7: the `#checkChannelCaps(…)` block alone; drop
    "and the `connections` write" from its label;
  - `packages/realtime/tests/mutations/authorize_result_357.ts` M5 and
    `packages/realtime/tests/mutations/presence_member_admission_350.ts` M10: the third edit anchors on
    `connection.identity !== null,\n        )\n` plus the blank line and ``// `member` is set``;
  - `packages/realtime/tests/mutations/manager_debt_353.ts` M1: below `#checkChannelCaps`; update the label, and keep
    the killer.

  Re-prove each row live.
- [x] T045 [P] Re-anchor the #361 rows in `packages/realtime/tests/mutations/disconnect_admission_361.ts`:
  - N1, N2 and N10: only the method name changes, to `#assertBound`; the killers are unchanged;
  - N4: rewritten as "the post-site moved below `#checkChannelCaps`", `killedBy: '#361 W13 '` (plan D3);
  - N8: re-anchored on `if (bound !== undefined && bound !== connection) {` plus its `throw`; killed by `#361` W8;
  - N12: `this.disconnect(conn.id)` becomes `this.disconnect(conn)` in its anchor; re-proven against `#361` W12 (i);
  - **N9 is re-verified**: `throw new ConnectionIdInUseError(` occurs once, and its `to` line drops the argument.

  Update the battery's header list. Re-prove each row live.
- [x] T046 Re-run each battery holding an **unchanged adjacent row**, and confirm each row is `KILLED`:
  - `authorize_result_357` M1 and M7;
  - `presence_member_306`;
  - `channel_name_314` ×2;
  - `connection_id_304` (the `register()` and `subscribe()` guards, and the two `onOpen` close rows);
  - `#361` N5.

  A `DEAD MUTANT` is **repaired, never deleted**, and only after checking that T023, T024 and T027 kept the anchors
  byte-identical.
- [x] T047 If #376 has landed (T001), re-run `apply_revocation_376` and `revoke_channel_idless_340`, which must be
  clean.
- [x] T048 Run `deno task mutate realtime` and compare it with T003. The new battery is added, and every battery is
  clean, except the named live-broker batteries, which may report `PARTIAL`. Commit as
  `test(370): prove every admission and teardown guard live`.

## Phase 11: Docs (commit 5, `docs(370,363)`), hygiene and the gate

- [x] T049 [P] Amend ADR 010 in `docs/adr/010-realtime-disconnect-retires-the-connection-object.md` (FR-018). **Rows 12
  and 13's home, and row 6's no-base reason.**
  - Header: "Amended by" names #370 and #363 with the date.
  - New **§7, "Amendment — `register` is the only way in, and teardown is owner-scoped"**:
    - the owner rule;
    - clause 2 widened;
    - `#assertBound` and its order;
    - `#isOwner` and its three askers;
    - `disconnect`'s object form and guarded `finally`;
    - **why the third class has no base class**;
    - the rejected options (a)–(h) with their costs;
    - what this does not solve.
  - "Amended by §7" pointers under §2's *Three askers, one decider* and *Two refusal types, one predicate*, and
    under §3.
  - §4's "Making `register` mandatory" gains a closing line: #370 reverses it, and why. The original text is kept.
  - §5: bullets 1–3 are marked resolved, and 4–7 are unchanged.
  - §6 gains: `register` is the only writer of `connections`, and a teardown acts only on its owner.
- [x] T050 [P] `docs/realtime.md`, the lifecycle section (`:503–551`) and the examples. **Row 9's user-facing home.**
  - Replace the "reaches only … escapes it" sentences (D6) with the enforced rules.
  - Duty 3 reads "call `disconnect(conn)` with the registered object", and points to `disconnect`'s JSDoc.
  - Widen the "while a teardown is still running" paragraph to any holder.
  - Add one paragraph for custom transports without `handlerHooks`: never run app code, or
    `unsubscribe(conn.id, …)`, for a socket that was refused (plan §9, S1).
  - `:24` becomes `onClose: (conn) => manager.disconnect(conn)`.
  - The § *Channels* snippet (`:74–91`) gains `manager.register(conn)` (D7).
- [x] T051 `docs/realtime.md` § *Upgrading to v0.4.0*: correct **item 17's** `ConnectionIdInUseError` bullet to "a
  different object holds this id, live or being torn down". **Row 11.** This runs after T050, because it edits the
  same file.
- [x] T052 `docs/realtime.md`: add **item 20, "`subscribe` requires `register`"**, numbered at landing (see the
  header). **Row 11's home.**
  - A before/after: `ConnectionNotRegisteredError`, thrown before the authorizer.
  - The fix: call `register(conn)` from your open hook. **`handlerHooks` is the zero-work path.**
  - `connectionCount` counts only registered connections.
  - It points to the lifecycle section, and does not restate the duties.
- [x] T053 `docs/realtime.md`: add **item 21, "An id held by a live connection is refused"**, numbered at landing.
  **Row 11's home.**
  - A before/after for `register` and `subscribe`, and the `1011` from `handlerHooks.onOpen`.
  - The server mints the id per socket (`crypto.randomUUID()`), never from client input or a user or session key.
  - The consequences: **lockout** and **disclosure of who is online** (S2).
  - **`evict(id)` recovers a leaked binding.**
  - `disconnect(conn)` is owner-scoped. Pass the object, because `disconnect(conn.id)` still acts on whoever holds
    the id.
  - `handlerHooks.onMessage` skips frames from a socket that does not own its id.
  - The `ConnectionIdInUseError` constructor now takes no argument.
  - **The intro:** "Nineteen items. Thirteen are breaking changes — …" becomes "Twenty-one items. Fifteen are
    breaking changes — …" (or the landing re-check's numbers), adding the two to the list. Add 20 and 21 to the "read
    items …" list.
- [x] T054 [P] `packages/realtime/README.md`: in the "A disconnected connection is refused at admission" bullet, widen
  the `ConnectionIdInUseError` sentence, and add one sentence each on `ConnectionNotRegisteredError` and
  `disconnect(conn)`, linking to items 20 and 21 (FR-019). No second bullet.
- [x] T055 [P] `packages/realtime/AGENTS.md` (FR-020).
  - Add `ConnectionNotRegisteredError` to the class row (`:56`).
  - The pitfall "Retirement is never an ownership reader's business" gains:
    - `register` is the only writer of `connections`;
    - a teardown acts only on its owner (`#isOwner`);
    - never re-add a `connections.set`;
    - never narrow clause 2 back;
    - never compare a binding to an object outside the three deciders;
    - never call `#assertAdmissible` from `subscribe`, or `#assertBound` from `register`.
  - Add `register_only_admission_370` to its witness and battery lists.
  - Run `deno task agents:brief` to regenerate the *Tests* list.
- [x] T056 Hygiene greps, each checked by its count:
  - `grep -n 'connections.set' packages/realtime/manager.ts` finds one line, in `register` (row 1);
  - `grep -c 'this.#retired' packages/realtime/manager.ts` prints `2` (row 2);
  - `grep -c '#assertBound(connection)'` prints `2`, and `grep -c '#assertAdmissible(connection)'` prints `2`
    (row 4);
  - `grep -nE 'connections\.get\([^)]*\) ===' packages/realtime/manager.ts` finds only `#isOwner` (row 17);
  - neither `ConnectionNotRegisteredError` nor `ConnectionIdInUseError` interpolates an id (S3);
  - each FR-012 anchor line in the header still matches the count its battery expects.
- [x] T057 Commit T049–T055 as `docs(370,363): register-only admission and owner-scoped teardown`.
- [x] T058 **The full gate, judged by exit status only**, never by a pipe's: `deno task gate`, then
  `deno task mutate realtime`.
  - Name any `PARTIAL` battery (the live-broker ones), and run them live where a broker is available
    (`LOCKNESS_REDIS_INTEGRATION=1`).
  - Confirm that `git diff --stat origin/main -- deno.lock` is empty, and that `git worktree list` shows no leftover
    worktree.
  - Record the pass and fail counts and the battery totals here when you tick it.
  - **Recorded, after the rebase onto #391:** `deno task gate` exit 0 (3101 passed, 0 failed, 42 ignored);
    `deno task mutate realtime` exit 0 — 41 batteries, 38 clean, 0 failed, 3 PARTIAL (`live_conformance_285`,
    `self_skip_310`, `sweep_parse_316`: no live broker). `deno.lock` untouched.

## Dependencies

T001 → T002 → T003 → T004 → T005–T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026 →
T027 → T028 → T029 → T030 → T031 → T032 → T033 → T034 → T035 → T036 → T037 → T038 → T039 → T040 → T041 → T042 →
T043 / T044 / T045 → T046 → T047 → T048 → T049 / T050 / T054 / T055 → T051 → T052 → T053 → T056 → T057 → T058.

- **Migration first (A2).** Commit 1 (T017) lands before any line of `manager.ts` changes. Its proof is a green suite
  against the unmodified file.
- **Red before green.** T019's compile red and T021's behavioural red come before T022.
- **`manager.ts` goes in order.** T021–T034 edit one file, in sequence. T031 (`#isOwner`) comes before its three
  askers (T032–T034).
- **Story order.**
  - US1 comes first: it adds `#assertBound`, which US2's witnesses exercise.
  - US2 comes before US3: W11 and W12 start from W7's refused socket, which needs clause 2.
  - US4 and US5 are checks after US3.
- **Commit 2 (T040)** carries the witness files, because they import the new class. **Commit 3 (T042)** turns the
  premise tests green. **Commit 4 (T048)** needs every code task. **Commit 5 (T057)** is docs only.
- **Docs.** T051–T053 edit the same file after T050, in order.

## Parallel examples

- **Phase 2:** T005–T015 each touch different test files.
- **Phase 10:** T043 (new battery), T044 (four batteries) and T045 (the #361 battery) touch different files.
- **Phase 11:** T049 (ADR), T050 (`docs/realtime.md`), T054 (README) and T055 (`AGENTS.md`) touch different files.
  T051–T053 follow T050.
- **Phases 3–8** are serial: one file, `manager.ts`, and one witness file.

## Implementation strategy

One branch, `270-register-only-admission`, with the five commits above in that order. At merge, the history is
**squashed by scope** into `test(370)` (migration), `fix(370,363)` (code, JSDoc, witnesses, premise tests and
batteries) and `docs(370,363)`. The migration commit stays separate, because it is the evidence that no assertion was
weakened.

**MVP = US1 green (T001–T026).** The #370 availability hole is closed. Everything after it is approved scope, not an
option:
- the live-id refusal (#363's takeover);
- owner-scoped teardown (#363's cross-teardown);
- the `onMessage` gate;
- the batteries;
- the docs.

## Summary

- **58 tasks.**
- **Per story:** US1 5 (T022–T026), US2 4 (T027–T030), US3 5 (T031–T035), US4 3 (T036–T038), US5 1 (T039).
- **Unlabelled:** setup 4, migration 13, witnesses and class 4, commits and premise tests 3, batteries 6, docs and gate
  10.
