# Tasks: the Redis revocation pass is bounded — a configuration the driver cannot enforce refuses to boot, and a broken enforcement guarantee is never silent

**Plan**: `.specnaut/specs/268-revocation-pass-bound/plan.md` (approved 2026-09-24, `fa947b32`) | **Backlog item**:
[#362 — Realtime: bound the Redis revocation pass — a pass that never settles stalls every later one, and the lost-frame bound is never checked against revocationTtlSeconds](https://github.com/locknessland/lockness-monorepo/issues/362)

**TDD is mandatory** (constitution). Every witness is written and run red on the current tree before the code that
turns it green. The red output is saved to the scratchpad.

**Decision homes.** Every task that touches a rule in the plan's 🔒 decision table (§5) names that rule's home as
**row N**. The decision may not land anywhere else. Unless stated otherwise, homes are in
`packages/realtime/drivers/redis.ts` ("`redis.ts`") or `packages/realtime/drivers/enforcement_deadline.ts` ("the
module").

**Ids.**
- Witnesses are B1–B6 and D1–D8, plus D4b and the sub-cases D4 (a, b), D5 (i–iv), D7 (i–iii) and D8 (i, ii), all from
  the plan's §4.
- Mutants are N1–N29.
- Test names start `#362 B<n> ` or `#362 D<n> ` with a **trailing space**, so `D4 ` is not a prefix of `D4b`.

**Expected red on `main`.** The witness file does not compile on `main`, because it imports the three constants from
the new module. That is its first red. Once T006 adds the module skeleton, the behavioural state is:
- **Red:**
  - B1, B4, B5 and B6's three refusals;
  - D1, D2, D4 (a, b), D4b, D5 (iv), D6, D7 (i), and D8 (i, ii).
  - D8 (ii) is red because the pass chain's rejection is **unhandled** today.
- **Pins, green before and after:** B2, B3, B6's `2 147 483` pin, and D3.
- **Vacuously green on `main`, meaningful only once the deadline exists:** D5 (i, ii, iii), D7 (ii) and D7 (iii).
  Each asserts that **no** line appears, and there is no deadline on `main`. They are not counted as reds. Their
  power is proven by their mutants:
  - D5 (i) by N15;
  - D5 (ii) by N16;
  - D7 (iii) by N27.
  - D5 (iii) (registration after `close()`) and D7 (ii) (a 9 s jump) have no named mutant in the plan. Each is
    checked by hand once in T046: drop the gate it guards, run it, see it red, and restore the gate.

**Numbers assigned at landing.**
- **Item 18 and ADR 011 are provisional.** Before T047 and T049, run `ls docs/adr` and count the
  `### <n>.` headings under *Upgrading to v0.4.0*, then take the next free numbers. Today these give 001–010 and
  items 1–17.

**Anchor hygiene** (FR-011). No new line, comment or docstring may duplicate a line that a battery row in §4 anchors on.
The lines are:
- `const rerun = this.#revocationRerun` and `this.#revocationRerun = undefined` (`RERUN_TAKE`). They stay contiguous,
  at their **16-space** indent.
- `#revocationRerun?: 'reconnect' | 'reconnect-retry'` (`:1501`). It is never edited.
- `RERUN_RECORD` (`:2812-2815`), `}, this.reconcileIntervalMs)`, and `#armRevocationReconcile`'s
  `if (this.#closing) return`.
- `LOOP_END` (`:2661-2662`). The `#lastReadAt` write goes **below** it.
- The retry-clear block in `close()` (`:3652-3655`), `const stopped = this.#lapse.close()` and
  `await this.#reconcilePass`.
- The `revocation reconcile failed (${trigger})` WARN.

The first-registration gate is written as a **compound condition** in `onRevocationReconcile`. It is never a new bare
`        if (this.#closing) return` line, which would duplicate an anchored line. T052 greps for all of these.

**Worktree and the pre-commit hook.** The pre-commit hook type-checks **every** git worktree. So:
- the witness file imports the new module, and is committed **with** T006, never alone;
- before any commit on `268-revocation-pass-bound`, move a developer worktree's diff onto the branch and remove the
  worktree;
- never commit with a worktree open, and never use `--no-verify`.

`deno.lock` is never touched.

## Phase 1: Setup — rebase and baseline

- [x] T001 Rebase `268-revocation-pass-bound` onto `origin/main` (`git fetch origin && git rebase origin/main`).
  - Confirm that the plan's anchors still hold: `git diff 4c65f603 -- packages/realtime/drivers packages/redis/resp.ts
    packages/realtime/tests/mutations` is empty.
  - If it is not empty, re-locate every §4 anchor before the first edit.
  - Done: rebased onto `origin/main` (`b8ae9036`); the diff against `4c65f603` over the anchored paths was empty.
- [x] T002 **Baseline before the first edit.** Run the whole realtime suite, `deno test -A packages/realtime/`, and save
  the output to the scratchpad. It must be green. T020, T026, T043 and T054 compare against it.
  - Done: 935 passed, 0 failed, 37 ignored (exit 0).
- [x] T003 **Battery baseline.** Run `deno task mutate realtime` and save the output to the scratchpad.
  - The live-broker batteries (`live_conformance_285`, `self_skip_310`, `sweep_parse_316`) may report `PARTIAL`
    without a broker. That is acceptable only if each is named in the saved output.
  - Every other battery must be clean. T041 compares against this run.
  - Done: 36 batteries, 33 clean, 0 failed, 3 PARTIAL without a broker (`live_conformance_285`, `self_skip_310`, `sweep_parse_316`).

## Phase 2: Foundational — the harness, every red witness, then the module skeleton

- [x] T004 New file `packages/realtime/tests/revocation_pass_bound_362.test.ts`, with its harnesses (FR-013):
  - **`serialPort`**, re-created locally from `revocation_paging_359.test.ts:157` (D10). It records each command **at
    issue**, before its serial queue. It can hold one command until released, and can make a command reject from a
    given point on. The #359 file is not edited;
  - an `instance()` builder that takes `interval` and `ttl`, and exposes the driver and the port;
  - `stubPerformanceNow(time)`, which points `performance.now` at FakeTime's `time.now` and is restored in `finally`.
    FakeTime does not fake `performance.now`;
  - FakeRedis `setTime` **pins the broker clock** in every D witness (D6, D7);
  - spies on `console.warn` and `console.error` that count lines starting with each FR-007 constant or with the marked
    fallback prefix, and that can be made to throw on command;
  - waits use the gates' promises. There are no fixed microtask counts.
- [x] T005 Write B1–B6 and D1–D8 (with D4b, and every sub-case) in
  `packages/realtime/tests/revocation_pass_bound_362.test.ts`, exactly as in the plan's §4 table:
  - every B witness asserts **which** refusal fired: `out of range` or `at most HALF` (D5, FR-005). B6 runs at
    interval 1 000;
  - D1 registers `driver.onRevocationReconcile(() => driver.listRevocations())` directly, over `serialPort`, and
    asserts that exactly one `EVAL` and one `ZSCAN` are **issued**;
  - D2 runs at interval **3 000**;
  - D4 (b) asserts `STALLED` at **s_prev + TTL**, with an age of 9 000 ms (A6);
  - D4b records a reconnect mid-pass;
  - D5 (iv) re-registers at TTL − 1 s during a failure run;
  - D8 (ii) asserts that no uncaught rejection escapes.

  Run the file on the current tree. It fails to compile, because the module does not exist, and that is the first red.
  Save the output to the scratchpad.
  - Done: the file failed to compile without the module (the first red).
- [x] T006 Create the skeleton of `packages/realtime/drivers/enforcement_deadline.ts`. **Row 14's home**: concrete,
  internal, revocation-specific, not exported from `mod.ts`.
  - Add `@fileoverview`, `@module`, and the three exported constants: `REVOCATION_DEADLINE_STALLED`,
    `REVOCATION_DEADLINE_MISSED` and `REVOCATION_DEADLINE_SKEWED` (**row 7's home**, FR-007).
  - Add `class EnforcementDeadline` with its constructor options `{ ttlMs, now, inFlight }` and the methods `arm`,
    `passSucceeded` and `close`, **with empty bodies**. Nothing constructs it yet.
  - Run `deno check` on the module and the witness file.
  - Re-run the witness file and save the behavioural state. It must match "Expected red" above exactly.
  - If a pin is red, or a red passes, stop and find out why before writing any code.
  - Commit T004–T006 together.
  - Done: red on the skeleton exactly as expected, plus the added D7 (iv); pins green; D5 (i-iii) and D7 (ii) vacuously green.

## Phase 3: US1 — a configuration the driver cannot enforce refuses to boot (P1)

**Goal:** `2 × presence.reconcileIntervalMs > revocationTtlSeconds × 1000` throws at construction.
**Independent test:** B1, B2 and B3 pass, and the three repaired suites stay green.

- [x] T007 [US1] Add the **relation check** to the constructor in `redis.ts`, directly after
  `this.revocationTtlSeconds = …` (`:1654-1655`) (FR-004). **Row 4's home** (the only copy of the factor in code) and
  **row 5** (a plain `Error`).
  - `this.reconcileIntervalMs * 2 > this.revocationTtlSeconds * 1000` throws.
  - The message names `presence.reconcileIntervalMs=…ms` and `revocationTtlSeconds=…s (…ms)`, contains
    `at most HALF`, gives the fix, and links #362 and the bound's one home.
  - A two-sentence comment explains the factor and links the one home. It does not restate the formula (row 1).
- [x] T008 [US1] Repair the three constructions the relation now refuses (FR-016, D3). This is configuration, not
  timing, and no assertion changes:
  - `packages/realtime/tests/revocation_atomicity.test.ts:119` (TTL 10 s) gets
    `presence: { reconcileIntervalMs: 5_000 }`;
  - `packages/realtime/tests/revocation_atomicity.test.ts:185` (TTL 5 s) gets
    `presence: { reconcileIntervalMs: 2_500 }`;
  - `packages/realtime/tests/redis_broker_integration.test.ts:387` (TTL 30 s, through `withInstances`) gets
    `reconcileIntervalMs: 15_000` in its options.

  This lands in the **same commit** as T007, because those suites fail without it.
- [x] T009 [US1] Run the witness file: **B1, B2 and B3 must be green.** Then run `revocation_atomicity.test.ts` green.
  - `redis_broker_integration.test.ts` is `ignore: !LIVE_BROKER`. Its live run is recorded in T044.

## Phase 4: US2 — an unset or broken timing refuses instead of hot-looping (P1)

**Goal:** a timing outside the ranges never reaches `setTimeout`.
**Independent test:** B4, B5 and B6 (including its pin) pass.

- [x] T010 [US2] Add `MAX_TIMER_MS = 2 ** 31 - 1` as a module constant in `redis.ts` (S2). **Row 19's home.**
  - Its JSDoc records the measured Deno 2.9.6 behaviour: a delay of 2^31 ms or more fires after 1 ms.
  - No literal `2147483647` or `2147483` appears anywhere else.
- [x] T011 [US2] Add the **range guard** to the constructor in `redis.ts`, **above** T007's relation (FR-003). **Row
  3's home** and **row 5.** It refuses when:
  - `!Number.isFinite(interval) || interval < 1`;
  - `!Number.isSafeInteger(ttl) || ttl < 1 || ttl > Math.floor(MAX_TIMER_MS / 1000)`.

  A fractional interval stays legal. The message names both option paths and values, states both ranges, says why an
  out-of-range interval re-arms both passes back to back, and contains `out of range` and `(#362)`. There is no clamp,
  no default substituted for `NaN`, and no timer chunking.
- [x] T012 [US2] Run the witness file: **B4, B5 and B6 must be green**, and B1–B3 stay green. Then run the whole
  realtime suite green.

## Phase 5: US3 — a stalled command port is reported once, and never runs a second pass (P1) 🎯 MVP

**Goal:** a pass that never settles produces exactly one `STALLED` line, and the slot is never freed.
**Independent test:** D1 passes.

- [x] T013 [US3] Add `#passClock(): number { return performance.now() }` to `redis.ts`, directly below the epoch
  `now()` (`:1704-1711`) (FR-010). **Row 13's home**: the only `performance.now()` read in the driver.
  - Its JSDoc says why it is not `now()`: that is the control-frame stamp clock.
- [x] T014 [US3] Declare `type RevocationPassOutcome = 'ok' | 'failed' | 'closed'` in `redis.ts`, and make
  `#runRevocationReconcile` return `Promise<RevocationPassOutcome>` (FR-009). **Row 11's home.**
  - It returns `'closed'` on the no-handler guard (A5), `'ok'` after the handler resolves, and `'failed'` on every
    path out of the `catch`.
  - The two `return`s at `:2864` and `:2867` become `return 'failed'`. This makes #308 "TIMER retries too" and #355
    M25 DEAD. T048 re-anchors them.
- [x] T015 [US3] The one start site in `#startRevocationPass`, in `redis.ts` (FR-008.2, FR-009). **Rows 10, 11a, 12
  and 20.**
  - `#revocationPass`'s type becomes `{ readonly trigger; readonly startedAt: number }`. The promise is no longer
    stored. Update its JSDoc (`:1490-1493`). Line `:1501` is not touched.
  - `this.#revocationPass = { trigger, startedAt: this.#passClock() }`.
  - `let outcome: RevocationPassOutcome = 'failed'` is **row 11a's home**. A `.then` placed **before** the `.finally`
    records the outcome.
  - **The chain ends in a final rejection handler** (row 20, the pass-chain asker). It writes one marked `console.error`
    line: the marker in a fixed prefix, then the rejection through `renderError`.
  - The `finally` is unchanged for now, apart from reading its fields from the record. T021 adds the deadline call.
- [x] T016 [US3] Implement `EnforcementDeadline` in the module (FR-006, FR-007). **Rows 6, 7, 14 and 20** (the deadline
  asker).
  - **One** `setTimeout`, passed to `Deno.unrefTimer`. Never a `setInterval`.
  - `arm(delayMs)` clears any pending timer.
    - When `delayMs > 0`, it sets a timer that consults `inFlight()` **at fire**: `STALLED` with the trigger and age
      (`now() − startedAt`) if a pass is in flight, `MISSED` otherwise.
    - When `delayMs ≤ 0`, it **decides `MISSED` at arm time** and sets a 0 ms timer that writes that line (A2).
  - The fire clears its own handle, writes once, and **never re-arms itself or touches the slot**.
  - The write is the #369 shape. `console.warn` runs inside a `try`. If it throws, one `console.error` line is written
    instead: the marker in the fixed prefix, then both halves through `renderError` from `@lockness/contract`.
  - `close()` clears the pending timer and is **not** terminal (row 9).
  - `passSucceeded` stays empty until T022.
- [x] T017 [US3] Construct the deadline in the `redis.ts` constructor, after T011 and T007:
  `new EnforcementDeadline({ ttlMs: revocationTtlSeconds * 1000, now: () => this.#passClock(), inFlight: () =>
  this.#revocationPass })`. The deadline never imports `redis.ts`, so there is no cycle.
- [x] T018 [US3] In `onRevocationReconcile` in `redis.ts`, **only the first registration arms** the deadline at the TTL
  (A1, FR-008.1). **Row 8** and **row 9.**
  - "First" means `this.revocationHandler === undefined` before the assignment.
  - Write the gate as one compound condition, for example `if (first && !this.#closing) deadline.arm(ttlMs)`, never as
    a bare `if (this.#closing) return` line (anchor hygiene).
  - A later registration leaves a pending or fired deadline alone. The pass timer's re-arm is unchanged.
- [x] T019 [US3] In `close()` in `redis.ts`, call `deadline.close()` after the retry-clear block (`:3652-3655`) and
  before `const stopped = this.#lapse.close()` (FR-008). Both anchored blocks stay byte-identical.
- [x] T020 [US3] Run `deno check` on `redis.ts`, the module and the witness file. Run the witness file: **D1 must be
  green.** Then run the whole realtime suite and compare it with T002.

## Phase 6: US4 — a broken guarantee is reported once per episode, and recovery re-arms (P2)

**Goal:** failure runs, slow passes and broker-clock jumps each produce one line per episode, and no sink failure
escapes.
**Independent test:** D2, D4 (a, b), D4b, D5 (i–iv), D6, D7 (i–iii) and D8 (i, ii) pass.

- [x] T021 [US4] Rewrite the one end site, the pass's `finally` in `#startRevocationPass` in `redis.ts` (FR-008.3).
  **Row 8's home** is the method's JSDoc, which now names the three sites and `close()` (A4). **Row 10** and **row
  20.** It **stays a `.finally`** and **never logs**. In order:
  1. capture `startedAt` from the record, and `endedAt = this.#passClock()`;
  2. free the slot;
  3. take the rerun, and start it or arm the timer. `RERUN_TAKE` stays contiguous at its 16-space indent;
  4. **last**, if `outcome === 'ok'` and `!this.#closing`, call
     `deadline.passSucceeded(startedAt, endedAt, this.#lastReadAt)`.
- [x] T022 [US4] Implement `passSucceeded(startedAt, endedAt, readAt)` in the module (FR-006). **Row 6's home** and
  **row 17's home.**
  - The **broker-clock check** runs first. When a previous `readAt` is known,
    `readAt − prevReadAt ≥ ttlMs / 1000`, **and the timer is still pending**, it decides `SKEWED` at arm time, naming
    both reap times, and sets a 0 ms timer.
  - Otherwise it calls `arm(ttlMs − (endedAt − startedAt))`.
  - In both cases it keeps `readAt` as the new previous value. An `undefined` `readAt` skips the check.
- [x] T023 [US4] Add `#lastReadAt` to `redis.ts` (FR-009a, S1). **Row 18's home**: its only writer is
  `listRevocations`.
  - It stores the reap `t`, in broker seconds, after a **completed** enumeration: directly below `LOOP_END`
    (`:2661-2662`) and above `return`.
  - A pass that throws mid-enumeration does not write it. `t` goes into neither the slot record nor the outcome.
- [x] T024 [US4] Run the witness file: **D2, D4 (a, b), D4b, D5 (i–iv), D6, D7 (i–iii) and D8 (i, ii) must be green**,
  and D1 stays green. Then run the whole realtime suite green.
  - Done: all 23 witnesses green.

## Phase 7: US5 — a healthy deployment sees nothing new (P2)

**Goal:** every configuration that honours the ranges and the relation behaves exactly as before.
**Independent test:** D3 passes, and the whole suite matches the T002 baseline.

- [x] T025 [US5] Run D3 (healthy passes for 30 s → zero lines of any constant).
- [x] T026 [US5] Compare the whole realtime suite with T002. Any suite that newly logs a deadline line (`STALLED`,
  `MISSED` or `SKEWED`) is **examined, never silenced** (plan §9). Record each one, and the reason, in this task when
  you tick it.
  - Done: 958 passed, 0 failed. An instrumented run of the 935 pre-existing tests recorded zero deadline fires: no suite newly logs a line.
- [x] T027 [US5] Confirm that B3 constructs the defaults through both `new RedisBroadcastDriver` and `fromConfig`, and
  that `docs/realtime.md:1579`'s example configuration satisfies both checks.
  - Done: B3 builds both; the `docs/realtime.md` example (10 000 ms against the 300 s default) passes both checks.

## Phase 8: US6 — a port author knows the duty (P3)

**Goal:** the command port's contract says every command settles, and the bound's one home links to it.
**Independent test:** reading the two JSDoc blocks answers US6.

- [x] T028 [P] [US6] Add the second contract clause to the `RedisCommandClient` JSDoc (`:421-436`) in `redis.ts`, beside
  the #348 one and in the same bold form (FR-001). **Row 2's home.**
  - ***Every command settles***, within a bound the port owns. `RedisClient` meets it through `READ_TIMEOUT_MS`.
  - It names what stalls: the revocation re-check, the ghost sweep, the heartbeat and `close()`.
  - The driver does not cancel a command. The deadline reports it.
- [x] T029 [US6] Edit the bound's one home, `onRevocationReconcile`'s JSDoc (`:2715-2731`) in `redis.ts` (FR-002).
  **Row 1's home.**
  - Link to the T028 clause for the "read timeout" term.
  - Correct the count to `1 + max(1, ⌈N/COUNT⌉)`.
  - Add one sentence: since #362 the bound is checked at boot and watched at runtime.
  - Nothing else restates the formula.

## Phase 9: Batteries — the new battery, the re-anchors and the blast radius

- [x] T030 New battery `packages/realtime/tests/mutations/revocation_pass_bound_362.ts` (FR-014). SUITES is
  `revocation_pass_bound_362.test.ts`. There are **29 rows, N1–N29**, as in the plan's §4, and each names its
  `killedBy` witness with a trailing space.
  - Every anchor is unique in today's source. Where a line repeats, it carries a neighbouring line.
  - The coordinator named N17–N29; N1–N16 are written and proven the same way.
  - Done: 30 rows. N1-N29 as planned, plus N30 (the SKEWED timer arms the ordinary deadline, killed by the added D7 (iv)): the plan's SKEWED branch set only a 0 ms line timer, so a failure run right after a skewed success left no deadline pending and was silent.
- [x] T031 [P] **Boot rows N1–N8 and N21–N24**: run each alone. Each must be `KILLED` by its named B witness, and by
  the message fragment where the plan says so (N5, N8).
- [x] T032 [P] **Deadline rows N9–N16**: prove each live. N9 must be killed by D1's **issued** second `EVAL`.
- [x] T033 [P] **N17** (registration does not arm) → D1. **N18** (`#passClock` returns `Date.now()`) → D6. **N19** (an
  overdue arm consults `inFlight()`) → D4b. **N20** (every registration re-arms) → D5 (iv). Prove each live.
  - Done: N18 first SURVIVED. D6 drained with FakeTime's runMicrotasks, whose restoreFor resets globalThis.Date and dropped the wall-clock step before the pass ended. D6 now drains on the real setTimeout and asserts the step is in place; N18 then KILLED by D6, by hand and in the battery.
- [x] T034 [P] **N25–N27** (the broker-clock check removed, `≥` → `>`, the pending condition dropped) → D7 (i),
  D7 (i) and D7 (iii). Prove each live.
- [x] T035 [P] **N28** (the fire's fallback removed) → D8 (i). **N29** (the chain's final handler removed) → D8 (ii).
  Prove each live: the mutant must turn the witness red through an uncaught error, not merely a missing line.
- [x] T036 Run the whole new battery with `deno task mutate revocation_pass_bound_362`. Every row must be `KILLED`
  and attributed. Save the output.
  - Done: 30/30 KILLED and attributed (`deno task mutate`, 204.6 s).
- [x] T037 [P] **Re-anchor** `revocation_retry_308` "the TIMER retries too" in
  `packages/realtime/tests/mutations/revocation_retry_308.ts`. **Never delete it.**
  - The old anchor `"            if (trigger !== 'reconnect') return\n"` becomes
    `"            if (trigger !== 'reconnect') return 'failed'\n"`, still deleted by the mutant.
  - Re-prove it live.
- [x] T038 [P] **Re-anchor** `reconcile_single_pass_355` M25 in
  `packages/realtime/tests/mutations/reconcile_single_pass_355.ts`. **Never delete it.**
  - Both `return\n`s in the anchor (`:2864-2867`) and in the replacement gain `'failed'`.
  - Re-prove it live.
- [x] T039 [P] **Re-verify** `revocation_retry_308` "the retry removed" and "the retry RETRIES ITSELF". Their anchor
  `"            if (trigger !== 'reconnect') return"` has no newline, so it still matches once as a substring, and
  each mutant keeps the ` 'failed'` suffix. Confirm each is `KILLED`. If not, repair it to the full line and re-prove.
  - Done: "the retry removed" and "the retry RETRIES ITSELF" KILLED unchanged.
- [x] T040 Re-run every battery holding an **adjacent row** (plan §4: **14 rows in 4 batteries**) and confirm each row:
  - **Re-anchored (2):** #308 "the TIMER retries too" (T037) and #355 M25 (T038). Both `KILLED`.
  - **Re-verified (2):** #308 "the retry removed" and "the retry RETRIES ITSELF" (T039). Both `KILLED`.
  - **Unchanged (10):**
    - `revocation_retry_308` "the trigger is no longer named in the WARN" (`:2860`), `KILLED`;
    - `revocation_retry_308` "close() stops clearing the pending retry" (`:3652-3655`), still at its `expectSurvival`.
      Its reason holds, because the guard now returns `'closed'`;
    - `revocation_paging_359`:
      - M3 and M10 (`LOOP_END`, `:2661-2662`, directly above the T023 write);
      - M15 (the arm);
      - M16 and M22 (`RERUN_RECORD`);
      - M17 (`:1501`, `RERUN_RECORD`, `RERUN_TAKE`);
      - M18 (`#armRevocationReconcile`'s closing check);

      all `KILLED`;
    - `lapse_rehold_349` M25 (`:3659`, `:3670`), `KILLED`.

  A `DEAD MUTANT` is **repaired, never deleted**, and only after checking that T014, T015, T019, T021 and T023 kept the
  anchor-hygiene lines byte-identical.
  - Done: all 14 adjacent rows as expected: 4 batteries clean, #308 "close() stops clearing the pending retry" still at its expectSurvival.
- [x] T041 Run `deno task mutate realtime` and compare it with T003. There must be one more battery than in T003
  (`revocation_pass_bound_362`). Every battery is clean, except the named live-broker batteries
  (`live_conformance_285`, `self_skip_310`, `sweep_parse_316`), which may report `PARTIAL` when no broker is
  available. Name them in the result.
  - Done: 37 batteries, 34 clean, 0 failed, 3 PARTIAL without a broker (`live_conformance_285`, `self_skip_310`, `sweep_parse_316`).

## Phase 10: Live-broker check

- [x] T042 Where a broker is available, run `LOCKNESS_REDIS_INTEGRATION=1 LOCKNESS_REDIS_PORT=<port> deno test -A
  packages/realtime/tests/redis_broker_integration.test.ts`, the three live-broker batteries, and
  `live_fake_conformance.test.ts`.
  - Not run: no broker was available to this run.
- [x] T043 Compare the default-gate suite with T002 once more, after the batteries.
  - Done: `deno task test` 2999 passed, 0 failed, 42 ignored.
- [x] T044 **Record whether the live run happened** (the D3 ruling). Write one line in this task when you tick it:
  - *"Live run: yes — `redis_broker_integration` <n> passed, 0 failed (including the `:387` repair)"*; or
  - *"Live run: no broker available — the `:387` repair is unverified live; the default gate ignores that suite."*

  Never leave it blank, and never claim a live pass from a run that ignored the suite.
  - Live run: no broker available — the `:387` repair is unverified live; the default gate ignores that suite.

## Phase 11: Polish — JSDoc, ADR, docs, the brief, and the gate

- [x] T045 [P] JSDoc audit (FR-017, hard rule #7). Confirm each of these carries what FR-017 lists:
  - `MAX_TIMER_MS`, `#passClock`, `#lastReadAt` and `#revocationPass`;
  - `#startRevocationPass` (the three deadline sites and `close()`, row 8), and `#runRevocationReconcile`
    (`@returns`);
  - `listRevocations` (it writes `#lastReadAt`), and the constructor's `@throws` (both refusals);
  - every member of `EnforcementDeadline`.

  Nothing quotes an anchor line.
- [x] T046 **Hand-check the witnesses that have no named mutant**:
  - D5 (iii): drop the `!this.#closing` half of T018's condition, run D5 (iii), see it red, and restore the condition;
  - D7 (ii): change the check to `≥ ttlS − 1`, run D7 (ii), see it red, and restore the check.

  Record both in this task. Neither becomes a battery row, because the plan does not name one.
  - Done: dropping `!this.#closing` from the first-registration gate turned D5 (iii) red; `>= ttl - 1` turned D7 (ii) red; both restored.
- [x] T047 [P] **ADR.** Run `ls docs/adr` and take the next free number: 011 today. Write
  `docs/adr/<NNN>-realtime-revocation-bound-is-checked.md`. It records:
  - the question (L3, L4);
  - the port contract (it links row 2's home);
  - the ranges, the relation and its factor (it links the configuration paragraph, row 16);
  - the success-anchored deadline, its exactness and the broker-clock check;
  - the rejected options with their costs;
  - **§5, the fleet** (S4): the silent expiry from a shorter-TTL peer, and the rejected remedies — fleet keys (a boot
    round trip, a mixed-fleet decode hazard, a min-key's lifetime) and a per-record TTL (it fails open mid-deploy,
    `redis.ts:2651-2652`);
  - the residue (plan §9);
  - that #360 consumes the pass clock and the outcome.

  It **links ADR 009 §2 and ADR 006**, and leaves ADR 009 untouched. It links the bound's one home rather than
  restating it. Then put the number into T051's pitfall.
  - Done: `docs/adr/011-realtime-revocation-bound-is-checked.md` (001-010 existed).
- [x] T048 [P] `docs/realtime.md`: **the #293 configuration paragraph (`:1584-1600`) becomes the one operator
  statement of both relations** (A3). **Row 16's home.**
  - It states heartbeat against liveness TTL, and interval against revocation TTL, plus the FR-003 ranges and the fix
    (lower the interval or raise the TTL).
  - In the same file, the enforcement-bound paragraph (`:1930-1940`) gains three sentences:
    - the bound is checked at boot (a link to the configuration paragraph) and watched at runtime;
    - `revocationTtlSeconds` is assumed **uniform across the fleet**. This is **row 15's home**;
    - an injected port must settle every command (a link to row 2's home).
- [x] T049 `docs/realtime.md` § *Upgrading to v0.4.0*: add the new item. This runs after T048, because it edits the
  same file.
  - First, count the `### <n>.` headings in the section: 17 today, so the new item is **18**, unless another item has
    landed.
  - **Before:** any timing constructed, and a non-finite or ≤ 0 interval ran both passes back to back.
  - **After:** the driver refuses a timing outside the ranges, or one that breaks the relation. **It links to the
    configuration paragraph** and restates neither the relation nor the ranges (row 16).
  - **Also:**
    - an injected command port must settle every command;
    - a new WARN, in three forms, appears when the guarantee is broken;
    - there is no wire change and no migration step.
  - **The intro.** "Seventeen items. Twelve are breaking…" becomes "Eighteen items. Thirteen are breaking…", adding
    the boot refusal to the list. The "read items …" list gains the new number.
  - Done: 17 items existed, so the new one is item 18.
- [x] T050 [P] Add one bullet to *What ships* in `packages/realtime/README.md`, linking to the configuration paragraph.
  Nothing else is restated (row 16).
- [x] T051 [P] Update `packages/realtime/AGENTS.md`:
  - add `enforcement_deadline.ts` to the file map;
  - add the pitfall, pointing at the T047 ADR: *never free the revocation pass slot on a timer, never add a second
    deadline clock, never read the epoch `now()` for an interval, and never log from the pass's end site*;
  - then run `deno task agents:brief` to regenerate the *Tests* list, which now includes `revocation_pass_bound_362`.
- [x] T052 Hygiene greps, each checked by its count:
  - `grep -c 'performance.now()' packages/realtime/drivers/redis.ts` prints `1`, and the module has none (row 13);
  - `grep -n '#lastReadAt =' packages/realtime/drivers/redis.ts` finds one line, inside `listRevocations` (row 18);
  - `grep -rn '2147483' packages/realtime --include=*.ts` finds only `MAX_TIMER_MS`'s JSDoc, and nothing else in
    code (row 19);
  - `grep -n 'reconcileIntervalMs \* 2\|\* 2 >' packages/realtime/drivers/redis.ts` finds the relation and the #293
    heartbeat check only (row 4);
  - `grep -n 'console\.' packages/realtime/drivers/redis.ts`: none of the lines is inside `#startRevocationPass`'s
    `finally` (S3);
  - `grep -n 'enforcement_deadline' packages/realtime/mod.ts` prints nothing (row 14);
  - each anchor-hygiene line in the header still matches the count its battery expects.
  - Done: one performance.now() in redis.ts, none in the module; one `#lastReadAt =` (listRevocations); no 2147483 literal; the relation and the #293 check only; nothing in mod.ts; RERUN_TAKE once at its 16-space indent; no console call in the end site.
- [x] T053 `deno task deps:analyze` shows no new edge. The module imports only `renderError` from
  `@lockness/contract`, which is already declared.
  - Done: exit 0, no new edge.
- [x] T054 **The full gate, judged by exit status only**, never by a pipe's:
  - `deno fmt && deno lint && deno check && deno task test`;
  - `deno task agents:brief --check`;
  - `deno task mutate realtime`: the live-broker batteries may report `PARTIAL` only if each is named, as
    `live_conformance_285`, `self_skip_310` and `sweep_parse_316`.
  - Confirm that `git diff --stat origin/main -- deno.lock` is empty, and that `git worktree list` shows no leftover
    worktree.
  - Record the pass and fail counts, the battery totals, and the T044 live-run line in this task when you tick it.
  - Done: fmt 0, lint 0, check 0, test 0 (2999 passed, 0 failed), agents:brief --check 0, mutate realtime 0 (37 batteries: 34 clean, 3 PARTIAL named above); deno.lock untouched; no leftover worktree of this branch. Live run: no.

## Dependencies

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 →
T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026 → T027 → T028 → T029 → T030 → T031–T035 → T036 →
T037 / T038 / T039 → T040 → T041 → T042 → T043 → T044 → T045–T051 → T052 → T053 → T054.

- **Rebase first.** T001 comes before everything; the §4 anchors were counted on `4c65f603`.
- **Red before green.** T005's compile red and T006's behavioural red come before any change to `redis.ts`. Each
  story phase ends with the task that turns its witnesses green.
- **The constructor goes in order.** T007 (the relation) lands first with its repairs (T008). T011 inserts the range
  guard above it. T017 constructs the deadline after both, so a refused configuration never builds a timer.
- **`redis.ts` goes in order.** T007–T023 all edit `redis.ts` or the module, and run in sequence. T015 builds the start
  site, and T021 finishes the end site. There is never a second start or end site.
- **Story order.**
  - US1 and US2 are independent of the deadline.
  - US3 needs US1 and US2, because the deadline's `ttlMs` must fit one timer.
  - US4 needs US3.
  - US5 is a check after US1–US4.
  - US6 is documentation only, and can run any time after T001. It is placed here to keep `redis.ts` edits serial.
- **Commits under the hook.**
  - T004–T006 are committed together: the witness file imports the module.
  - T008 goes with T007.
  - T014 and T037–T038 may be committed separately. `deno task mutate` is not part of the hook, but T040 must pass
    before the branch is reviewed.
  - Every commit is made with no worktree open.
- **Batteries.** T030–T036 depend on every code task. T037–T039 depend on T014. T040 and T041 come after them.
- **Docs.** T047's number feeds T051's pitfall. T049 follows T048, because they edit the same file.

## Parallel examples

- **Phase 9:** T031–T035 prove disjoint row groups of one battery. T037 (`revocation_retry_308.ts`), T038
  (`reconcile_single_pass_355.ts`) and T039 (`revocation_retry_308.ts`, re-verify only) touch battery files. T037 and
  T039 share a file, so run them in sequence.
- **Phase 11:** T045 (JSDoc), T047 (ADR), T048 (`docs/realtime.md`), T050 (README) and T051 (`AGENTS.md`) touch
  different files. T049 follows T048.
- **Phases 3–8** are serial: one source file, `redis.ts`, plus the module, and one witness file.

## Implementation strategy

This is one branch, `268-revocation-pass-bound`. Incremental commits during implementation are fine, for example one
per story phase once its witnesses are green, each with a conventional prefix and `(362)`. At merge, the history is
**squashed by scope** into two commits:

1. `fix(362)`: the code and the tests (T004–T046).
   - The range guard, the relation, `MAX_TIMER_MS` and the three repaired constructions.
   - The module, `#passClock`, the outcome, the slot record, the start and end sites and `#lastReadAt`.
   - The first-registration arm and the `close()` clear.
   - The port contract and the bound's one home.
   - The witness file, the #362 battery, the two re-anchors and the two re-verifications.
   - JSDoc lands with its code (hard rule #7).
2. `docs(362)`: the ADR, `docs/realtime.md` (the configuration paragraph, the bound paragraph and the new item), the
   README bullet, `AGENTS.md` and the regenerated briefs (T047–T051).

**MVP = US1–US3 green (T001–T020).** The boot refusal closes L4's static half, and D1 closes L3's silence. Everything
after it is approved scope, not an option:
- the episode rules;
- the broker-clock check;
- the #369 fallback;
- the batteries;
- the docs.
