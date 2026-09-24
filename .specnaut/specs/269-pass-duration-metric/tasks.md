# Tasks: the Redis driver reports how long each ghost sweep and revocation re-check took, and how many pages it read, to a handler the application wires to its metrics

**Plan**: `.specnaut/specs/269-pass-duration-metric/plan.md` (approved 2026-09-24, `fd9c0b09`) | **Backlog item**:
[#360 — Realtime: expose a pass-duration metric (duration, pages) for the Redis driver's ghost sweep and revocation re-check](https://github.com/locknessland/lockness-monorepo/issues/360)

**TDD is mandatory** (constitution). Every witness is written and run red on the current tree before the code that
turns it green, and the red output is saved to the scratchpad.

**Decision homes.** Every task that touches a rule in the plan's 🔒 decision table (§5) names that rule's home as
**row N**. The decision may not land anywhere else. Unless stated otherwise, homes are in
`packages/realtime/drivers/redis.ts`, written "`redis.ts`".

**Ids.**
- Witnesses are P1–P13 and T1, with the plan's sub-cases:
  - P3 (i–iii);
  - P4 (i–iv), where (iv) has (a) and (b);
  - P7 (i, ii);
  - P8 (i–v), where (v) has (i) and (ii);
  - P10 (i, ii);
  - P12 (i, ii).
- Mutants are M1–M23.
- Test names start `#360 P<n> ` with a **trailing space**, so `P1 ` is not a prefix of `P10`, `P11`, `P12` or `P13`.

**Expected red on `main`.** The witness file does not compile on `main`, because it imports `PassSample`, the
`PASS_SAMPLE_*` and `SWEEP_LOG_FAILED` constants, and `onPassComplete`. That is its first red. `T1` does not compile
either, because `getMeter` does not exist. Once T006 adds the skeleton (types, constants, and a handler that is stored
but never called), the behavioural state is:

- **Red:**
  - P1–P6;
  - P8 (i), (ii), (iii) and (v);
  - P9;
  - P10 (i, ii);
  - P12 (i, ii).

  Every one of them expects a sample or a WARN that no code produces yet.
- **Pins, green before and after:** P11 (no handler, no new line) and P13 (#362's suite, unchanged).
- **Vacuously green on the skeleton, meaningful only once samples exist:** P7 (i, ii) (no sample after `close()`) and
  P8 (iv) (`close()` resolves). They are not counted as reds. Their power is proven by M9 (P7) and M13 (P8 (iv)).
- **P4 (iv)** is red for two reasons. There is no sample, and on `main` a malformed `SMEMBERS` reply is read as
  `?? []`, so it produces no "roster reconcile failed" WARN. It stays red after US1 until T019.

**Numbers assigned at landing.**
- **Upgrade item 19 and ADR 012 are provisional.** Before T045 and T046, run `ls docs/adr` and count the `### <n>.`
  headings under *Upgrading to v0.4.0*, then take the next free numbers. Today these give 001–011 and items 1–18.

**Anchor hygiene** (FR-011). No new line, comment or docstring may duplicate a line that a battery row in the plan's
§4 anchors on. The lines are:
- `RERUN_TAKE`: `const rerun = this.#revocationRerun` and `this.#revocationRerun = undefined`. They stay contiguous,
  at their **16-space** indent.
- `#revocationRerun?: 'reconnect' | 'reconnect-retry'` (`:1537`). It is never edited.
- `#departureHandler?` (`:1575`, #355 M24). The new fields go **above** it, never on it.
- #362's deadline call, `startedAt,` / `endedAt,` / `this.#lastReadAt,` at 24 spaces (N14), and its guard line
  `if (outcome === 'ok' && !this.#closing) {` (N11, N13, N15). The emit call reproduces neither.
- `LOOP_END` (`:2787-2788`), and the `ZSCAN` and `SSCAN` argument lines.
- `await this.#reconcilePass`, `const stopped = this.#lapse.close()` and `await stopped`.
- `this.controlRefusedHandler = undefined` (`:3857`, #349 M17). The new handler drop goes on its **own** line beside
  it.
- `if (!id || id === this.instanceId) continue` (`:3384`, `self_skip_310`) and
  `if (alive === 0) await this.#sweepInstance(id)` (`:3388`).

T049 greps for all of these.

**Worktree and the pre-commit hook.** The pre-commit hook type-checks **every** git worktree. So:
- the realtime witness file is committed **with** T006, never alone;
- `T1` is committed **with** T015 (`getMeter`);
- before any commit on `269-pass-duration-metric`, move a developer worktree's diff onto the branch and remove the
  worktree;
- never commit with a worktree open, and never use `--no-verify`.

`deno.lock` is never touched.

## Phase 1: Setup — rebase and baseline

- [x] T001 Rebase `269-pass-duration-metric` onto `origin/main` (`git fetch origin && git rebase origin/main`).
  - Confirm that the plan's anchors still hold: `git diff f697c100 -- packages/realtime/drivers
    packages/realtime/tests/mutations packages/telemetry` must be empty.
  - If it is not empty, re-locate every §4 anchor before the first edit.
  - At `tasks` time (2026-09-24) the branch was current with `origin/main` at `f697c100`.
- [x] T002 **Baseline before the first edit.** Run `deno test -A packages/realtime/` and `deno test -A
  packages/telemetry/`, and save both outputs to the scratchpad. Both must be green. T016, T023, T025 and T051 compare
  against them.
- [x] T003 **Battery baseline.** Run `deno task mutate realtime` and save the output to the scratchpad.
  - Expected: 37 batteries, 34 clean, and 3 `PARTIAL` without a broker (`live_conformance_285`, `self_skip_310`,
    `sweep_parse_316`). Each must be named in the saved output.
  - Every other battery must be clean. T040 compares against this run.

## Phase 2: Foundational — the harness, every red witness, then the skeleton

- [x] T004 Create `packages/realtime/tests/pass_sample_360.test.ts` with its harnesses (FR-015):
  - **a sample recorder**: a handler that pushes each `PassSample` it receives, plus variants that throw, return a
    rejecting promise, return a promise that never settles, return a native promise whose `constructor` getter
    throws, or return a thenable that calls `reject` three times;
  - `stubPerformanceNow(time)`, re-created from `revocation_pass_bound_362.test.ts:292-299`. It points
    `performance.now` at FakeTime's clock, can step it by a set amount, and is restored in `finally`;
  - **a served-command counter** over FakeRedis that counts the `ZSCAN` and `SSCAN` replies served during one pass
    (D12). The fake's `COUNT` walks a 1 024-slot table (`tests/fake_redis.ts:177`, `:305-340`);
  - **a reply-override port** over FakeRedis. It can:
    - hold one command until released (a page, or the last page);
    - make a command reject from a given point on (the reap `EVAL`, `SMEMBERS`, a release `EVAL`);
    - replace a reply: `SMEMBERS` as `{ type: 'set', … }`, and `EXISTS` as a non-integer;
  - **a dead-instance builder**: an instance with N owned holds and an expired liveness key (P3). Two such instances
    for P3 (iii);
  - spies on `console.warn` and `console.error` that count lines starting with `PASS_SAMPLE_FAILED`,
    `PASS_SAMPLE_LOG_FAILED`, `SWEEP_LOG_FAILED`, #362's `REVOCATION_LOG_FAILED`, or `realtime: roster reconcile
    failed`. Each spy can be made to throw on command;
  - an unhandled-rejection guard (`globalThis.addEventListener('unhandledrejection', …)`) that fails the test, as a
    backstop to the sanitizer;
  - waits use the gates' promises. There are no fixed microtask counts. **P8 (iv)** races `close()` against a bounded
    fake-time wait and asserts it won, so M13 turns it red by an assertion, not by a test timeout.
- [x] T005 Write P1–P13 in `packages/realtime/tests/pass_sample_360.test.ts`, and T1 in
  `packages/telemetry/tests/meter.test.ts`, exactly as in the plan's §4 table:
  - the revocation witnesses register `driver.onRevocationReconcile(() => driver.listRevocations())` **directly on the
    driver**, as #362 D1 does;
  - P2 and P3 (i) and (iii) first assert `served > 1` (A6), then assert `pages` **equals the served count** for that
    pass, never a literal 3 (D12). P1 keeps `pages: 1`, and P3 (ii) keeps `pages: 0`;
  - P1 also asserts `Object.isFrozen(sample)`;
  - P6 asserts the **first** sample is the ended pass (`trigger: 'timer'`, its own pages), not the trailing one;
  - P9 steps `performance.now` by 40 ms **and** jumps `Date.now` by +10 s during the pass, for both passes;
  - P12 (ii) releases a ghost while `console.warn` throws;
  - T1 imports `getMeter` from `@lockness/telemetry` and records on a no-op histogram with `OTEL_DENO` unset.

  Run both files on the current tree. Both fail to compile, and that is the first red. Save the output to the
  scratchpad.
- [x] T006 Add the **skeleton** to `redis.ts`. Nothing is called yet.
  - `export interface PassSample` (FR-001), placed with the other exported types. **Row 1's home**, and **row 17's
    home** (the `ok` definition, S1). Its JSDoc covers every member:
    - `durationMs` is the whole pass, ≥ the round-trip P, and links the bound's one home rather than restating it;
    - what `pages` counts, per pass;
    - `ok` means the enumeration completed, not that every record was applied.

    Export it as `type PassSample` from `packages/realtime/mod.ts`, in the existing `./drivers/redis.ts` block (**row
    11**: not on `BroadcastDriver`).
  - `export const PASS_SAMPLE_FAILED`, `PASS_SAMPLE_LOG_FAILED` and `SWEEP_LOG_FAILED`, each tagged `(#360)` (**row
    14's home**). They follow the `REVOCATION_PAIRS_SKIPPED` precedent (`:1172`) and are not re-exported from
    `mod.ts`.
  - `onPassComplete(handler)` directly after `#refuseControl` (`:2178-2188`), and `#passCompleteHandler` in the field
    block above `:1575` (FR-003, **row 7's home**). Registration stores the handler, and a later one replaces it.
    Its JSDoc has `@param`, and an `@example` that names **no instrument** (row 12).
  - Run `deno check` on `redis.ts`, `mod.ts` and the witness file.
  - Re-run the witness file and save the behavioural state. It must match "Expected red" above exactly. If a pin is
    red, or a red passes, stop and find out why before writing any code.
  - Commit T004–T006 together. `meter.test.ts` stays uncommitted until T015.

## Phase 3: US1 — an operator graphs how long each pass takes (P1) 🎯 MVP

**Goal:** every completed sweep and revocation pass hands over one frozen sample, with its monotonic duration and its
page count.
**Independent test:** P1, P2, P3 (i–iii), P9, P10 (i, ii) and T1 pass.

- [x] T007 [US1] In `redis.ts`, replace `type RevocationPassOutcome` (`:1317-1323`) with
  `type PassOutcome = PassSample['outcome'] | 'closed'` (FR-002).
  - **Row 2's home.** Its JSDoc is **row 3a's home** ("unrecorded means `'failed'`"), and it keeps #362's text and adds
    the sweep.
  - Rename the uses at `:2973` and `:3028`. No second alias remains.
  - This makes `revocation_pass_bound_362` N33 DEAD. T036 re-anchors it.
- [x] T008 [US1] Implement `#emitPassSample(pass, trigger, outcome, startedAt, endedAt, pages)` in `redis.ts`, directly
  after `onPassComplete` (FR-004).
  - **Row 4's home is its JSDoc.** It names its two callers, says each is its pass's one end site, and says every
    argument comes from the start site's closure.
  - It covers **rows 5, 6 and 8**. In order:
    1. return if `#closing` is set. This is the one asker of row 6;
    2. return if `outcome === 'closed'`, or if no handler is registered, before building anything;
    3. build `Object.freeze({ pass, trigger, outcome, durationMs: Math.max(0, endedAt − startedAt), pages })`;
    4. inside **one `try`**, run `const r = handler(sample)` and then `Promise.resolve(r).then(undefined, warn)` (S3).
       Never `await`, and never a duck-typed `typeof r.then` check.
  - `warn` and the `catch` both write the **#369 shape**. `console.warn` of `PASS_SAMPLE_FAILED` plus
    `renderError(e)` runs in a `try`. If it throws, one `console.error` line starts `PASS_SAMPLE_LOG_FAILED` and
    carries both halves through `renderError` (**row 14**).
- [x] T009 [US1] Revocation start and end sites in `#startRevocationPass`, `redis.ts` (FR-006). **Row 9's home**
  (`#revocationPass`, which amends #362 row 12). **Row 3a asker** (`let outcome: PassOutcome = 'failed'`).
  - `#revocationPass`'s type (`:1527-1530`) gains `pages: number`, its one mutable member. `trigger` and `startedAt`
    stay `readonly`. Update the field's JSDoc.
  - The start site keeps the local `const startedAt = this.#passClock()` (`:2971`), builds
    `const pass = { trigger, startedAt, pages: 0 }`, and stores `this.#revocationPass = pass`.
  - The `.finally` keeps #362's order byte for byte. **After the deadline block's closing `}`** it adds one final
    statement: `this.#emitPassSample('revocation', trigger, outcome, startedAt, endedAt, pass.pages)`.
    - It is laid out so that it reproduces neither N14's three lines nor the N11 guard line.
    - It never reads `this.#revocationPass` (D4).
  - The D10 clause in `#startRevocationPass`'s JSDoc names the sample as the end site's final step, and **links** row
    4's home rather than restating it. The three deadline sites are not edited.
- [x] T010 [US1] In `listRevocations` in `redis.ts`, add **one line** directly after the `decodeRevocationPage(…)`
  statement (`:2746-2754`) and above `skipped += page.skipped` (`:2755`) (FR-007): increment
  `this.#revocationPass.pages` when a pass is in flight.
  - **Row 10**: an asker of row 1.
  - It goes nowhere near `LOOP_END`. It is the only addition to the page loop.
- [x] T011 [US1] Sweep record and outcome, in `redis.ts`:
  - `#sweepPass?: { readonly startedAt: number; pages: number }` in the field block, above `:1575`. **Row 9a's home**:
    a Temporary Field (A3). Its JSDoc says so.
  - `#reconcile` declares `Promise<PassOutcome>` (FR-008). **Row 3's home**:
    - `'failed'` at the end of its catch (`:3390-3394`);
    - `'closed'` from the in-loop check, whose line `if (this.#closing) return` (`:3382`) becomes
      `if (this.#closing) return 'closed'`;
    - `'ok'` after the loop.

    A failure contained in `#sweepInstance` stays `'ok'`.
  - This makes `reconcile_single_pass_355` M12a DEAD. T035 re-anchors it.
- [x] T012 [US1] Rewrite `#armReconcile`'s timer callback in `redis.ts` (`:3285-3291`, FR-009). **Row 4 caller**:
  its JSDoc links row 4's home. **Row 3a asker**, and **row 8** (`#passClock` only).
  - Build `const pass = { startedAt: this.#passClock(), pages: 0 }` and set `this.#sweepPass = pass`, then add
    `let outcome: PassOutcome = 'failed'`.
  - Then `this.#reconcilePass = this.#reconcile().then((ended) => void (outcome = ended)).finally(() => { … })`. The
    stored promise stays `Promise<void>`. The `.finally` runs, in order:
    1. `const endedAt = this.#passClock()` — read **first** (A3);
    2. `this.#reconcilePass = undefined`;
    3. `this.#armReconcile()`;
    4. `this.#sweepPass = undefined`;
    5. last: `this.#emitPassSample('sweep', 'timer', outcome, pass.startedAt, endedAt, pass.pages)`.
  - The `.catch` is T021 (US4).
  - This makes `reconcile_single_pass_355` M1 and M2 DEAD (`ARM_TIMER`). T034 re-anchors them.
- [x] T013 [US1] In `#sweepOwned`'s page loop in `redis.ts`, add one line directly after the `decodeScanReply(…)`
  statement (`:3598`) (FR-010): increment `this.#sweepPass.pages` when a sweep is in flight.
  - **Row 10**: an asker of row 1.
  - `#sweepInstance`, `#sweepPage` and `SweepCount` are not edited.
  - This makes `sweep_paging_358` M1 DEAD. T037 re-anchors it.
- [x] T014 [US1] In `#passClock`'s JSDoc (`:1824-1829`) in `redis.ts`, the reader list gains the sweep's start and end
  (A4, FR-013). **Row 8's home.** `grep -c 'performance.now()'` on `redis.ts` still prints `1`.
- [x] T015 [US1] Create `packages/telemetry/meter.ts` (FR-012). **Row 13's home.**
  - It has `@fileoverview` and `@module`, and exports `getMeter(name: string): Meter`, which returns
    `metrics.getMeter(name)` from `@opentelemetry/api`. Its JSDoc has `@param`, `@returns` and an `@example`, and says
    it is the no-op meter when `OTEL_DENO` is unset.
  - Re-export it from `packages/telemetry/mod.ts`.
  - `packages/telemetry/middleware.ts:33` calls `getMeter(TRACER_NAME)`, and drops `metrics` from its
    `@opentelemetry/api` import. It keeps `trace` and `SpanStatusCode`.
  - No `deno.json` or `deps.policy.jsonc` edit.
  - Commit it **with** `meter.test.ts` (T1).
- [x] T016 [US1] Run `deno check` on the changed files. Then run the witness file: **P1, P2, P3 (i–iii), P9 and
  P10 (i, ii) must be green.** Run `packages/telemetry/tests/`: **T1 green**, and `middleware.test.ts` green. Then run
  the whole realtime suite and compare it with T002.

## Phase 4: US2 — a reconnect's catch-up time is visible on its own (P1)

**Goal:** a reconnect or retry pass is tagged with its own trigger, and the ended pass is never confused with the
trailing one.
**Independent test:** P5 and P6 pass.

- [x] T017 [US2] Run P5 and P6. Both must be green on T009's closure-based end site, with no further code. If P6
  shows the trailing pass's trigger or pages, T009 read `#revocationPass`: fix T009, never the witness. **Row 4.**

## Phase 5: US3 — a run of failing passes is visible (P2)

**Goal:** every failed pass reports `failed`, and a sweep reply that does not decode fails the pass instead of being
read as "no instances" or "alive".
**Independent test:** P4 (i–iv) and P12 (i) pass.

- [x] T018 [US3] Add `decodeMembersReply(reply): readonly unknown[]` and `decodeExistsReply(reply): 0 | 1` to
  `redis.ts`, beside `decodeScanReply` (`:984-1040`), in the shape of their neighbours (FR-008a, S2). **Row 3.**
  - Each is an exported function with JSDoc, including `@throws`.
  - Each returns its value, or throws.
- [x] T019 [US3] Wire both into `#reconcile`'s `try`, in `redis.ts`:
  - `asArray(reply) ?? []` (`:3380`) becomes `decodeMembersReply(reply)`;
  - the `asInteger(…)` around `EXISTS` (`:3385-3387`) becomes `decodeExistsReply(…)`.

  The lines `:3381-3384` and `:3388-3389` keep their bytes (M12a after T035, `self_skip_310`, #355 M2's second edit).
  **Row 3's home**: a reply that does not decode is a throw. There is no fallback anywhere.
- [x] T020 [US3] Run the witness file: **P4 (i–iv) and P12 (i) must be green**, and US1 and US2 stay green.

## Phase 6: US4 — observability never breaks the passes (P2)

**Goal:** no handler behaviour and no log-sink failure stops a loop, rejects `close()`, or escapes to the runtime.
**Independent test:** P7 (i, ii), P8 (i–v) and P12 (ii) pass.

- [x] T021 [US4] End T012's sweep chain in `redis.ts` with a final `.catch((error: unknown) => …)` that writes one
  `console.error` line, `${SWEEP_LOG_FAILED} ${renderError(error)}` (FR-009a, A1).
  - **Row 16**: this is the third asker of #362 row 20. **Row 14** (the marker).
  - `#reconcilePass` is the `.catch`'s promise, so `close()`'s `await` never rejects.
  - No new re-anchor beyond T034, whose `ARM_TIMER` includes this line.
- [x] T022 [US4] In `close()` in `redis.ts`, add `this.#passCompleteHandler = undefined` on its **own** line directly
  after `this.controlRefusedHandler = undefined` (`:3857`) (FR-003, **row 7**). This is hygiene only: `#closing` stays
  the decider (row 6). #349 M17's anchor line is unchanged.
- [x] T023 [US4] Run the witness file: **P7 (i, ii), P8 (i–v) and P12 (ii) must be green**, and every earlier witness
  stays green. Then run the whole realtime suite and compare it with T002.

## Phase 7: US5 — an application that wires nothing sees nothing new (P2)

**Goal:** with no handler, the driver behaves as before. The only exception is the intended S2 WARN on a malformed
reply.
**Independent test:** P11 and P13 pass, and the whole suite matches T002.

- [x] T024 [US5] Run P11 (no handler for 5 passes of each kind → zero `PASS_SAMPLE_*` and `SWEEP_LOG_FAILED` lines)
  and P13 (`revocation_pass_bound_362.test.ts` unchanged, and green).
- [x] T025 [US5] Compare the whole realtime suite with T002.
  - Any suite that newly logs `PASS_SAMPLE_*`, `SWEEP_LOG_FAILED`, or a **new** "roster reconcile failed" line is
    **examined, never silenced** (plan §9).
  - A new "roster reconcile failed" line means a test double returns a reply that `decodeMembersReply` or
    `decodeExistsReply` now refuses. Record each suite and the reason when you tick this task.

## Phase 8: Batteries — the new battery, the re-anchors and the blast radius

- [x] T026 New battery `packages/realtime/tests/mutations/pass_sample_360.ts` (FR-016), whose SUITES is
  `pass_sample_360.test.ts`. It has **23 rows, M1–M23**, as in the plan's §4. Each names its `killedBy` witness with a
  trailing space.
  - Every anchor is unique in today's source. Where a line repeats, the anchor carries a neighbouring line.
  - M18 is the plan's compound row (the emit before the re-arm, **with** M12 applied), written as one row with two
    edits.
- [x] T027 [P] **Page rows M1–M4.** Prove each live:
  - M1 → P1;
  - M2 → P2;
  - M3 → P3 (i);
  - M4 → P3 (iii), the per-instance reset.
- [x] T028 [P] **Outcome and trigger rows M5–M8.** Prove each live:
  - M5 → P4 (i);
  - M6 → P4 (ii);
  - M7 → P5;
  - M8 (the end site reads `#revocationPass`) → P6.
- [x] T029 [P] **Gate and containment rows M9–M13.** Prove each live:
  - M9 → P7;
  - M10 → P8 (i);
  - M11 → P8 (ii);
  - M12 → P8 (iii);
  - M13 (the handler awaited) → P8 (iv), which must turn red by its bounded race, not by a test timeout.
  - **Measured at implementation: M13 is killed by P8 (ii), not P8 (iv) (MISATTRIBUTED on the first run, then
    re-attributed).** FR-009's order clears `#reconcilePass` before the sample, and the `#closing` gate calls no
    handler once `close()` began, so `close()` never awaits a called handler. The await surfaces instead as a
    handler rejection reaching the chain's final handler, which P8 (ii) asserts absent. The battery header records
    it; P8 (iv) stays as the `close()` pin. M17 was DEAD on the first run (a bare rethrow narrows `end` to `never`)
    and was reshaped to an opaque rethrow, then KILLED by P4 (iii).
- [x] T030 [P] **Rows M14–M18.** Prove each live:
  - M14 (the epoch `now()` at the sweep's start) → P9;
  - M15 (the handler captured at the start) → P10 (i);
  - M16 (not frozen) → P1;
  - M17 (a contained instance failure fails the pass) → P4 (iii);
  - M18 → P8 (iii): the loop stops re-arming.
- [x] T031 [P] **Audit rows M19–M23.** Prove each live:
  - M19 (the sweep `.catch` removed) → P12 (ii), through an **uncaught rejection**, not merely a missing line;
  - M20 (the sweep default `'ok'`) → P12 (ii);
  - M21 (`?? []` restored) → P4 (iv) (a);
  - M22 (the attachment outside the `try`) → P8 (v) (i);
  - M23 (a duck-typed `then`) → P8 (v) (ii), with three WARNs.
- [x] T032 Run `deno task mutate pass_sample_360`. **All 23 rows must be `KILLED` and attributed.** Save the output.
- [x] T033 **Hand-check the witnesses that have no named mutant**, and record each result in this task:
  - P10 (ii): make `onPassComplete` keep the first handler. Run it, see it red, and restore;
  - P3 (ii): make the sweep skip its sample when no dead instance was found. See it red, and restore;
  - P4 (iv) (b): restore `asInteger(…)` around `EXISTS`. See it red, and restore.

  **Recorded:** P10 (ii) red under `??=` (keep the first handler); P3 (ii) red when the sweep samples only if
  `pass.pages > 0`; P4 (iv) (b) red with `asInteger(…)` restored around `EXISTS`. Each was restored, and
  `git status` was clean after each.

  Also record the plan's three equivalent-by-design mutants as reviewed, not run:
  - `close()` not dropping the handler;
  - a sample built with no handler registered;
  - `getMeter` ignoring its name.
- [x] T034 **Re-anchor** `reconcile_single_pass_355` **M1** and **M2** in
  `packages/realtime/tests/mutations/reconcile_single_pass_355.ts`. **Never delete either.**
  - Redefine `ARM_TIMER` (battery `:69-75`) to T012 + T021's new callback body.
  - M1's `setInterval` replacement must still type-check against `#reconcilePass: Promise<void>`.
  - M2 deletes **only** the `this.#armReconcile()` line, and keeps the sample and the `.catch`. M2's second edit
    (`:3388-3389`) still matches. Re-verify that its inserted re-arm lands before the new `return 'ok'`.
  - Re-prove both live.
- [x] T035 **Re-anchor** `reconcile_single_pass_355` **M12a** in the same file, after T034:
  `if (this.#closing) return\n` becomes `if (this.#closing) return 'closed'\n`, in the anchor and in the deleted
  shape. Re-prove it live.
- [x] T036 [P] **Re-anchor** `revocation_pass_bound_362` **N33** in
  `packages/realtime/tests/mutations/revocation_pass_bound_362.ts`: `RevocationPassOutcome` becomes `PassOutcome`, in
  the anchor **and** the replacement (`'failed'` → `'ok'`). Re-prove it live against its #362 witness. The historical
  268 plan and tasks are not rewritten.
- [x] T037 [P] **Re-anchor** `sweep_paging_358` **M1** in `packages/realtime/tests/mutations/sweep_paging_358.ts`.
  - The whole-`SSCAN`-loop anchor (`:3595-3610`) gains T013's increment line.
  - The `SMEMBERS` replacement leaves the count at 0.
  - Re-prove it live against its #358 witness.
- [x] T038 **Re-verify the six substring rows**, and confirm each is `KILLED`:
  - `revocation_paging_359` **M1**: the decode swapped for a fake one-page object, which the increment still counts;
  - `revocation_paging_359` **M4** and `sweep_paging_358` **M4**: the empty-page `break` now lands after the
    increment;
  - `revocation_pass_bound_362` **N14** (`:2985-2987`): T009 kept the deadline call's bytes;
  - `revocation_pass_bound_362` **N29** (`:2990-2996`): the emit ends directly above its `})`;
  - `reconcile_single_pass_355` **M2**'s second edit, already re-proven by T034.

  **Also check `self_skip_310`** (`:3384`, beside T019's edit). It is a live-broker battery, so without a broker it
  reports `PARTIAL`. Record that, and confirm its anchor still matches once.

  A row that is not `KILLED` is repaired to its full line and re-proven, **never deleted**.
- [x] T039 Re-run every battery holding an **adjacent row** (plan §4), and confirm the unchanged rows are all `KILLED`:
  - `revocation_paging_359`: M2a, M2b, M5, M3, M10, M6, M8, M7, M9, M12, M23, M16, M17 and M22;
  - `revocation_pass_bound_362`: N11, N13, N15 and N16;
  - `reconcile_single_pass_355`: M11, M12c, M13, M15 and M24;
  - `sweep_paging_358`: M2a, M2b, M3, M5, M6 and M7;
  - `presence_member_holds_345`: the `:3612` row;
  - `lapse_rehold_349`: M17, M25 and M26;
  - `presence_sweep_departure_348`: M12;
  - `revocation_retry_308`: "close() stops clearing the pending retry", still at its `expectSurvival`.

  A `DEAD MUTANT` is repaired under "the source moved, the guard remains" (`docs/testing.md`), **never deleted**, and
  only after checking the anchor-hygiene lines in the header.
- [x] T040 Run `deno task mutate realtime` and compare it with T003.
  - There must be exactly one more battery (`pass_sample_360`): **38 batteries, 35 clean**.
  - **Recorded:** the first run gave 34 clean, 1 failed, 3 partial. `revocation_pass_bound_362` N33 was DEAD: the
    8-space `let outcome: PassOutcome = 'failed'` anchor is a substring of the sweep's new 12-space line. It was
    re-anchored on `this.#revocationPass = pass` and the battery re-run clean, giving 38 batteries: 35 clean and 3
    partial.
  - The only exceptions are the live-broker batteries named in the result (`live_conformance_285`, `self_skip_310`,
    `sweep_parse_316`), which may report `PARTIAL` with no broker available.

## Phase 9: Live-broker check

- [x] T041 Where a broker is available, run the three live-broker batteries, with `self_skip_310` in particular
  because it neighbours T019. Write one line in this task when you tick it:
  - *"Live run: yes — `self_skip_310` KILLED, `live_conformance_285` and `sweep_parse_316` clean"*; or
  - *"Live run: no broker available — `self_skip_310` beside the S2 decoders is unverified live."*

  Never leave it blank, and never claim a live pass from a run that ignored the suite.

  **Live run: no broker available — `self_skip_310` beside the S2 decoders is unverified live.** Its anchor
  (`if (!id || id === this.instanceId) continue`) still matches exactly once.

## Phase 10: Polish — JSDoc, docs, ADRs, the briefs, and the gate

- [x] T042 [P] **JSDoc audit** (FR-013, hard rule #7). Confirm each of these carries what FR-013 lists, and that
  nothing quotes an anchor line:
  - `PassSample` and every member (rows 1 and 17);
  - `onPassComplete` (its `@example` names no instrument, row 12) and `#passCompleteHandler`;
  - `#emitPassSample` (row 4's home);
  - `PassOutcome` (row 3a's home), `#reconcile` (`@returns`) and `#armReconcile` (links row 4);
  - `#startRevocationPass` (the D10 clause links row 4);
  - `#passClock` (the reader list, A4);
  - `listRevocations` and `#sweepOwned` (the page increment);
  - `#revocationPass` and `#sweepPass` (a Temporary Field);
  - `decodeMembersReply` and `decodeExistsReply` (`@throws`);
  - the three constants;
  - `getMeter`, and `meter.ts`'s `@fileoverview` and `@module`.
- [x] T043 [P] `docs/observability-and-crypto.md` § OpenTelemetry: add `### Framework instruments` (FR-013). **Row
  12's home**, the only place instrument names, units, attributes and buckets appear:
  - `lockness.http.server.requests` (the existing counter);
  - `lockness.realtime.pass.duration`: a histogram in `s`, recording `durationMs / 1000`;
  - `lockness.realtime.pass.pages`: a histogram in `{page}`;
  - attributes `lockness.realtime.pass.kind` (`sweep` | `revocation`, from `PassSample.pass`), `.trigger` and
    `.outcome`. The `outcome` entry **links** the `PassSample` JSDoc for `ok` (row 17);
  - explicit bucket boundaries, passed as `advice.explicitBucketBoundaries`:
    - duration: `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60`;
    - pages: `1, 2, 5, 10, 20, 50, 100, 200, 500, 1000`;
  - the recipe: `getMeter` plus `onPassComplete`, wiring both histograms with these names, units and buckets.
- [x] T044 [P] `docs/realtime.md` (FR-013):
  - add the `<a id="measuring-passes">` paragraph after the enforcement-bound paragraph (`:1945-1969`). It links the
    `PassSample` JSDoc (row 1) and the T043 recipe (row 12). It says, in **one sentence**, that `durationMs` is the
    whole pass and is not comparable to the round-trip formula. It says a stall records nothing (#362's deadline is
    the signal), and that samples are not buffered. It names no instrument;
  - the "one lifecycle" paragraph (`:1738-1743`) names `onPassComplete` as the Redis-only hook with that lifecycle
    (row 11);
  - the `onControlRefused` recipe (`:667-676`) replaces `metrics.increment` with `getMeter`.
- [x] T045 `docs/realtime.md` § *Upgrading to v0.4.0*: add the new item, after T044 (same file).
  - Count the `### <n>.` headings first. There are 18 today, so the new item is **19**, unless another has landed.
  - The heading says a malformed `SMEMBERS` or `EXISTS` reply now fails the ghost sweep with a WARN.
  - **Before**: a non-array `SMEMBERS` reply was read as an empty instance set, and a non-integer `EXISTS` reply as
    alive, both silently.
  - **After**: one "roster reconcile failed" WARN per pass, and the pass reports `failed`.
  - No wire change, and no migration step.
  - The intro "Eighteen items. Thirteen are breaking…" becomes "Nineteen items. Thirteen are breaking…". The item is
    observable, not breaking. The "read items …" list gains the new number.
- [x] T046 [P] **ADR.** Run `ls docs/adr` and take the next free number (012 today). Write
  `docs/adr/<NNN>-measurements-reach-the-app-through-a-seam.md` (FR-014, **row 15's home**). It records:
  - the rule for **any package's** measurements:
    - a seam hands the application a value;
    - the application wires it through `getMeter`;
    - names live in the observability doc;
    - the library records and never judges;
  - why the app is the composition root (`deps.policy.jsonc:104-117`);
  - the rejected options with their costs: a hard dependency, a contract-level recorder, a soft-load, and a meter port;
  - the first instance: the realtime passes, the ADR 008 and 009 triggers, and the seam kept off `BroadcastDriver`;
  - the plan's eight items of *What this does not solve*.

  It links ADR 006, 008, 009 and 011, and the T043 table. It restates no instrument name. Then put the number into
  T048's pitfall.
- [x] T047 [P] ADR update lines (FR-013). Each gets one dated `Update (#360, 2026-09-24)` line; the recorded text is
  not edited:
  - ADR 008, under `:160-162`, pointing at the T043 table;
  - ADR 009, under `:177` and `:217-220`, pointing at the T043 table;
  - ADR 011, under §6: the pass record gains `pages`, and the outcome alias becomes `PassOutcome` (A5).
- [x] T048 [P] Briefs and READMEs:
  - `packages/realtime/AGENTS.md`: the pitfall, pointing at the T046 ADR: *never await a pass handler; sample only
    from a pass's end site; the end site reads the closure, never `#revocationPass` or `#sweepPass`; never add a second
    `performance.now()`*. Add `onPassComplete` to the surface notes, naming both end sites;
  - `packages/telemetry/AGENTS.md`: `meter.ts` in *Where to work*;
  - one bullet each in `packages/realtime/README.md` (*What ships*) and `packages/telemetry/README.md`, linking the
    T043 recipe;
  - then run `deno task agents:brief` to regenerate the generated blocks (the realtime *Tests* list, and the telemetry
    public surface with `getMeter`).
- [x] T049 Hygiene greps, each checked by its count:
  - `grep -c 'performance.now()' packages/realtime/drivers/redis.ts` prints `1` (row 8);
  - `grep -rn 'lockness\.realtime\.pass' packages/` prints nothing: no instrument name in code (row 12);
  - `grep -rn 'metrics.getMeter' packages/telemetry --include=*.ts` finds `meter.ts` only (row 13);
  - `grep -rn 'opentelemetry' packages/realtime` prints nothing: no new edge (row 13);
  - `grep -rn 'RevocationPassOutcome' packages/` prints nothing (row 2);
  - `grep -n 'asArray(reply) ?? \[\]' packages/realtime/drivers/redis.ts` finds nothing inside `#reconcile` (row 3);
  - `grep -n '#emitPassSample(' packages/realtime/drivers/redis.ts` finds the definition plus exactly two calls
    (row 4);
  - `grep -n 'await.*Handler\|await this.#passCompleteHandler' packages/realtime/drivers/redis.ts` finds no await on
    the pass handler (row 5);
  - `grep -n 'REVOCATION_LOG_FAILED' packages/realtime/drivers/redis.ts` finds nothing on the sweep chain (row 16);
  - each anchor-hygiene line in the header still matches the count its battery expects.
- [x] T050 `deno task deps:analyze` shows no new edge: `realtime` gains no import, and `telemetry`'s
  `@opentelemetry/api` is already declared. `deno task publish:check` passes: `getMeter` is a new public export of
  `@lockness/telemetry`, and the local gate does not run this check.
- [x] T051 **The full gate, judged by exit status only**, never by a pipe's:
  - `deno fmt && deno lint && deno check && deno task test`;
  - `deno task agents:brief --check`;
  - `deno task deps:analyze` (no new edge);
  - `deno task mutate realtime`: the live-broker batteries may report `PARTIAL` only if each is named, as
    `live_conformance_285`, `self_skip_310` and `sweep_parse_316`.

  Confirm that `git diff --stat origin/main -- deno.lock` is empty, and that `git worktree list` shows no leftover
  worktree of this branch. When you tick this task, record the pass and fail counts, the battery totals, and the T041
  live-run line.

  **Recorded:** fmt, lint and `deno check` each exited 0. `deno task test` exited 0: 3030 passed, 0 failed, 42
  ignored. `agents:brief --check` exited 0. `deps:analyze` exited 0, with no new edge and `docs/dependencies.md`
  unchanged. `mutate realtime` exited 0: 38 batteries, 35 clean, 3 partial (`live_conformance_285`,
  `self_skip_310`, `sweep_parse_316`). `deno.lock` has no diff. `publish:check` exited 1 on `core` and `session`
  (undeclared `@lockness/hono` and `@std/fs`); neither package is touched by this branch, and `realtime` and
  `telemetry` resolve. T041: no broker was available.

## Dependencies

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 →
T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026 → T027–T031 → T032 → T033 → T034 → T035 / T036 / T037 →
T038 → T039 → T040 → T041 → T042–T048 → T049 → T050 → T051.

- **Rebase first.** T001 comes before everything; the §4 anchors were counted on `f697c100`.
- **Red before green.** T005's compile red and T006's behavioural red come before any behaviour in `redis.ts`. Each
  story phase ends with the task that turns its witnesses green.
- **`redis.ts` goes in order.** T006–T022 all edit `redis.ts`, and run in sequence:
  - T007's alias precedes T008, T009, T011 and T012, which use it;
  - T008's emit precedes both end sites;
  - T012 builds the sweep chain, and T021 ends it.
  - There is never a second start site or end site for either pass.
- **Story order.**
  - US1 carries the seam and both passes.
  - US2 needs US1's closure end site, and adds only a check.
  - US3 needs US1's `#reconcile` outcome.
  - US4 needs US1's chain and emit.
  - US5 is a check after US1–US4.
- **Commits under the hook.**
  - T004–T006 are committed together: the witness file imports the skeleton.
  - T015 goes with `meter.test.ts`.
  - The re-anchors (T034–T037) are committed with, or after, the code that made each row DEAD. `deno task mutate` is
    not part of the hook, but T040 must pass before the branch is reviewed.
  - Every commit is made with no worktree open.
- **Batteries.** T026–T033 depend on every code task. T034–T037 depend on T007, T011, T012, T013 and T021. T038–T040
  come after them.
- **Docs.** T046's number feeds T048's pitfall. T045 follows T044, because they edit the same file. T043 comes before
  T044 and T046, which link it.

## Parallel examples

- **Phase 8:** T027–T031 prove disjoint row groups of one battery. T036 (`revocation_pass_bound_362.ts`) and T037
  (`sweep_paging_358.ts`) touch different battery files, and can run beside T035. T034 and T035 share
  `reconcile_single_pass_355.ts`, so they run in sequence.
- **Phase 10:** T042 (JSDoc), T043 (the observability doc), T044 (`docs/realtime.md`), T046 (the ADR), T047 (ADR
  update lines) and T048 (briefs and READMEs) touch different files. T045 follows T044.
- **Phases 3–7** are serial: one source file, `redis.ts`, and one witness file. The exception is T015
  (`packages/telemetry`), which can run beside T007–T014.

## Implementation strategy

This is one branch, `269-pass-duration-metric`. Incremental commits during implementation are fine, for example one per
story phase once its witnesses are green, each with a conventional prefix and `(360)`. At merge, the history is
**squashed by scope, one category per commit**:

1. `feat(360)`: the seam and its tests. This covers T004–T017, T022 and T024–T040, minus the rows item 2 takes:
   - `PassSample` and `onPassComplete`;
   - `#emitPassSample`, `PassOutcome` and both records;
   - both end sites and both page increments;
   - `getMeter`, and the middleware calling it;
   - the witness files, the #360 battery, and the four re-anchors;
   - JSDoc lands with its code (hard rule #7).
2. `fix(360)`: the sweep's hardening from the audits (T018–T021). This covers:
   - `decodeMembersReply` and `decodeExistsReply`, wired into `#reconcile`;
   - the sweep chain's final `.catch`;
   - their witnesses P4 (iv) and P12 (ii);
   - rows M19–M21.
3. `docs(360)`: T043–T048. This covers:
   - the instrument table and the recipe;
   - the `docs/realtime.md` paragraph, lifecycle line, refusal recipe and item 19;
   - ADR 012, and the ADR 008, 009 and 011 update lines;
   - both `AGENTS.md` files and both READMEs;
   - the regenerated briefs.

**MVP = US1 green (T001–T016).** Every completed pass reports its duration and pages, and the recipe can be wired.
Everything after it is approved scope, not an option:
- the trigger check;
- the failure visibility and S2's decoders;
- the containment and A1's `.catch`;
- the batteries;
- the docs.
