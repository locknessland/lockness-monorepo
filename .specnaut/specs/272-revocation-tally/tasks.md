# Tasks: the revocation re-check and the ghost sweep report how many units each pass attempted and how many failed, and the enforcement deadline stops counting a pass with failures as a success

**Plan**: `.specnaut/specs/272-revocation-tally/plan.md` (approved 2026-09-25, `f61cf98e`) | **Backlog item**:
[#384 — Realtime: report per-record failures of the revocation re-check and ghost sweep on the pass metric](https://github.com/locknessland/lockness-monorepo/issues/384)

**⛔ Blocked until #370 / #363 lands on `main`** (plan D11). Both branches edit the same text in `manager.ts`.
Nothing below starts before T001, and T001 starts only once `370-impl` is merged.

**TDD is mandatory** (constitution). Every witness is written and run red on the current tree before the code that
turns it green. The red output is saved to the scratchpad.

**Decision homes.** Every task that touches a rule in the plan's 🔒 decision table (§5) names that rule's home as
**row N**. The decision may not land anywhere else. Unless stated otherwise, homes are in
`packages/realtime/drivers/redis.ts` ("`redis.ts`"), `packages/realtime/manager.ts` ("`manager.ts`"),
`packages/realtime/driver.ts` ("`driver.ts`") or `packages/realtime/drivers/enforcement_deadline.ts` ("the module").

**Ids.**
- Witnesses are T1–T8, R1, R2, R3a, R3b, R4–R9, S1 (with S1b), S2–S4 and E1, from the plan's §4.
- Mutants are K1–K22.
- Test names start `#384 T<n> `, `#384 R<n> `, `#384 S<n> ` or `#384 E<n> ` with a **trailing space**, so `R3 ` is
  never a prefix of `R3a`, and `S1 ` never of `S1b`.
- To keep the two apart, this file's tasks are **T001–T052** (three digits); witness ids never have a leading zero.

**Expected red on `main`** (after #370 lands). The witness file does not compile on `main`: it imports
`RevocationTally` and `REVOCATION_TALLY_MALFORMED`, and reads `sample.attempts`. That is its first red. Once T006 adds
the type skeleton, the behavioural state is:
- **Red:** T1, T2, T3, T4, T8; R1, R3b, R4, R5, R8, R9; S1, S1b, S2, S3, S4; E1.
- **Red on `main` only because no tally exists yet, pins once it does:** T5 and T6. They assert a tally value, and
  `reconcileRevocations` resolves `undefined` on `main`. Their power is proven by K4 and K5, not by their red.
- **Pins, green before and after:** T7, R2, R7.
- **Vacuously green on `main`, meaningful only once the rule exists:** R3a (no WARN, no line: nothing WARNs on
  `main`) and R6 (no line: every `ok` pass re-arms on `main`). Neither counts as a red. Their power is proven by K20
  (R3a) and by K10/K11 together with R6 staying green (R6).

**Numbers assigned at landing.** Upgrade item **23** is provisional. Before T045, count the `### <n>.` headings under
*Upgrading to v0.4.0* in `docs/realtime.md` and take the next free number. Items 1–19 exist at `32baca7b`; 20–22 are
reserved by in-flight branches.

**Anchor hygiene** (plan §4). No new line may duplicate or split a line a battery row anchors on. In particular:
- `REVOCATION_EMIT` and `SWEEP_FINALLY` change only through T039 (the re-anchor);
- the sweep record literal (`:3664`) changes only with T039;
- `if (outcome === 'ok' && !this.#closing) {` (`:3340`) changes only with T040;
- `passSucceeded`'s new first statement sits **above** `const previous = this.#previousReadAt` (N12's anchor);
- `arm()` in the module is not edited (N10, N19, N30, N31);
- `#sweepInstance`'s signature line (M4), its catch (`:3917-3920`, #360 M17 and #355 M17) and its log lines (#355
  M18, M22, #358 M9) stay byte-identical: the two increments are **new lines** between them;
- `#runRevocationReconcile`'s failure returns (`:3401-3408`, the four #308 rows and #355 M25) are not edited;
- `revokeLocal`'s WARN lines (#291's two rows) stay byte-identical: the `return false` goes after the `)`;
- `#recheckRevocations`' ownership filter (`:3355`, #332, #359 M14) and its loop are not edited.

T048 greps for these.

**Worktree and the pre-commit hook.** The pre-commit hook type-checks **every** git worktree. So:
- the witness file imports the new type and constant, and is committed **with** T006, never alone;
- before any commit on `272-revocation-tally`, move a developer worktree's diff onto the branch and remove the
  worktree;
- never commit with a worktree open, and never use `--no-verify`.

`deno.lock` is never touched.

## Phase 1: Setup — after #370 lands: rebase, re-dump the anchors, baseline

- [ ] T001 **The first task after #370 lands** (plan D11, A5). Rebase and re-count before anything else:
  - `git fetch origin && git rebase origin/main` on `272-revocation-tally`. Confirm #370's commits are in
    `git log origin/main`.
  - **Re-run the full battery anchor dump** over every battery under `packages/realtime/tests/mutations/` (42 once
    #370 lands). Use a stub harness that imports each battery, records each row's `find` strings, and locates them
    in today's files. Read the batteries that import the live-broker helper or `MutantGuard` by hand.
  - Every anchor must match exactly once. Record the total and any that do not.
  - **Re-count the plan's `manager.ts` anchors** from the dump and from `grep -n`, and write the new line numbers into
    this task:
    - the constructor registration (`onRevocationReconcile?.(`);
    - `#reassertRoster`'s `await this.reconcileRevocations()`;
    - `evict` → `revokeLocal` (was `:2910`);
    - `revokeLocal`, its hard-close and its WARN;
    - `#applyRevocation`, its `revokeLocal` call and **its catch**;
    - `#dispatchRevocation`;
    - `reconcileRevocations` and its tail;
    - `#recheckRevocations`, its wrapper's WARN, and **the ownership filter** (was `:3355`, where K4 anchors).
  - Also check `mod.ts` (the new export's neighbours) and #370's edits to the #359 and #337 test files
    (`revocation_paging_359.test.ts`, `channel_revoke_332.test.ts`): the witness harness must not copy a helper #370
    changed.
  - Re-classify plan §4's 72 zone rows (8 re-anchor, 1 re-verify, 63 unchanged) against the new tree. **If a row moves
    between classes, amend plan §4 before T002**, with the date.
  - Re-confirm D11's reading on the landed code: `disconnect(id)` resolves `'disconnected' | 'not-owned'`, and the
    early-stopping teardown loop still resolves `'disconnected'`. If either is false, the `architect-expert` rules
    before T002.
- [ ] T002 **Baseline before the first edit.** Run `deno test -A packages/realtime/` and save the output to the
  scratchpad. It must be green. T031, T036 and T052 compare against it.
- [ ] T003 **Battery baseline.** Run `deno task mutate realtime` and save the output.
  - The live-broker batteries (`live_conformance_285`, `self_skip_310`, `sweep_parse_316`) may report `PARTIAL`
    without a broker, only if each is named in the saved output.
  - Every other battery must be clean. T043 compares against this run.

## Phase 2: Foundational — the harness, every red witness, then the type skeleton

- [ ] T004 New file `packages/realtime/tests/revocation_tally_384.test.ts`, with its harnesses (FR-015):
  - a **manager harness**: a `ChannelManager` over a local driver double that implements the revocation trio
    (`markRevocation`, `listRevocations`, `clearRevocation`), modelled on `channel_revoke_332.test.ts`'s, re-created
    locally (that file is not edited). It can:
    - make the roster **release** reject once, which is the real path to a rejecting `unsubscribe` and `disconnect`
      (A1). **Never stub `unsubscribe` or `disconnect` themselves**;
    - register connections whose `close` throws on every call;
    - make `clearRevocation` reject;
    - list foreign records beside local ones;
  - a **Redis harness**: `RedisBroadcastDriver` over `tests/fake_redis.ts`, with the handler registered directly
    (`driver.onRevocationReconcile(() => value)`) and a sample collector on `onPassComplete`;
  - `stubPerformanceNow(time)`, which points `performance.now` at FakeTime's `time.now` and is restored in `finally`;
  - spies on `console.warn` and `console.error` that count lines by prefix: `REVOCATION_TALLY_MALFORMED`, the two
    deadline constants, the marked fallback. They can be made to throw on command (T4, S1b);
  - waits use the gates' promises, never fixed microtask counts.
- [ ] T005 Write every witness in `packages/realtime/tests/revocation_tally_384.test.ts`, exactly as in the plan's §4
  table:
  - T2 and T3 each assert **two** consecutive calls: the failure, then the clean (or empty) next pass;
  - T8 asserts three consecutive calls and that the connection is still registered;
  - R3a's five values and R3b's six values each run as their own sub-case;
  - R3b asserts, per value: one `REVOCATION_TALLY_MALFORMED` line per pass, no `attempts` key, `outcome: 'ok'`, no
    `reconnect-retry` pass, and one `MISSED` at 10 s;
  - R8 asserts the premise text in both `MISSED` and `STALLED` (a page held past TTL with no pass ended since the
    last clean one);
  - R9 holds each handler 600 ms, so a pass is in flight at 10 s, and asserts `MISSED`, never `STALLED`;
  - S1b is S1 with `console.warn` throwing;
  - E1 wires a `ChannelManager` over the Redis driver.

  Run the file on the current tree. It fails to compile, and that is the first red. Save the output.
- [ ] T006 The **type skeleton**, with no behaviour:
  - `driver.ts`: `export interface RevocationTally { readonly attempted: number; readonly failed: number }`, with
    `@example`. **Row 1's home**: its JSDoc states what each count means (D2). Re-export it from
    `packages/realtime/mod.ts`;
  - `redis.ts`: `PassSample` gains `readonly attempts?: number` and `readonly failures?: number` (JSDoc in T019);
  - `redis.ts`: `export const REVOCATION_TALLY_MALFORMED` (row 5a), not re-exported from `mod.ts`;
  - the module: `passEnded(): void {}`, an empty body.

  Run `deno check` on these files and the witness file. Re-run the witness file and save the behavioural state. It
  must match "Expected red" above exactly. If a pin is red, or a red passes, stop and find out why before writing any
  code. Commit T004–T006 together.

## Phase 3: US1 — an operator sees partial failures on the metric (P1)

**Goal:** the re-check resolves a tally, and each sample carries it.
**Independent test:** T1–T8, R1, R2 and R3a pass, and R3b's count and WARN assertions pass.

- [ ] T007 [US1] `revokeLocal` in `manager.ts` resolves `Promise<boolean>` (FR-003, D3): `return true` after
  `await this.disconnect(clientId)` fulfils (`'disconnected'` or `'not-owned'`), `return false` after its catch's
  WARN. The hard-close stays **above** the `try`. `evict` and the control-frame `evict` arm drop the value. JSDoc:
  `@returns`, and why the hard-close throw is not caught here.
- [ ] T008 [US1] `#applyRevocation` in `manager.ts` resolves `Promise<boolean>` (FR-004). **Row 2's home.** The
  connection branch `return await this.revokeLocal(...)`; the channel branch returns `true` once `#revokeChannelLocal`
  resolved, **whatever `clearFailed`**; the catch returns `false` after its WARN. `#dispatchRevocation` is unchanged.
  JSDoc `@returns`.
- [ ] T009 [US1] `#recheckRevocations` in `manager.ts` counts (FR-005). **Row 3's home.** `let attempted = 0` and
  `let failed = 0` above the `apply` wrapper; the wrapper increments `attempted`, and `failed` when
  `#applyRevocation` resolves `false` **or** its catch runs (after the WARN, then `return`). It resolves
  `{ attempted, failed }` after the last group. The ownership filter and the loop are not edited.
- [ ] T010 [US1] `reconcileRevocations` in `manager.ts` returns `Promise<RevocationTally>` (FR-006). The tail line is
  unchanged. JSDoc `@returns`.
- [ ] T011 [US1] `BroadcastDriver.onRevocationReconcile` in `driver.ts`: the handler type becomes
  `() => RevocationTally | void | Promise<RevocationTally | void>` (FR-002). **Row 4's home.** The JSDoc says a
  handler may resolve a tally, a driver may report it, and resolving nothing conforms. Drivers still call
  `handler()` with no argument.
- [ ] T012 [US1] Run T1–T8 and save the output. T1–T4 and T8 turn green; T5, T6 and T7 are green.
- [ ] T013 [US1] `redis.ts`: the Redis driver's `onRevocationReconcile` and `revocationHandler` field take the
  interface's handler type (the type, not the rule: row 4). The bound's JSDoc gains one sentence linking row 9's home.
- [ ] T014 [US1] `decodeRevocationTally(value: unknown): RevocationTally | 'malformed' | undefined` in `redis.ts`,
  beside the other decoders (FR-009, D6). **Row 5's home.**
  - (a) `undefined`, or not a non-null object carrying `attempted` or `failed` → `undefined`;
  - (b) tally-shaped with either count missing, not a safe integer, negative, or `failed > attempted` →
    `'malformed'`;
  - (c) otherwise the tally, copied into a fresh frozen object.
  - Every read sits in the decoder's own `try`; a throw is `'malformed'`. It never throws. JSDoc with `@example`.
- [ ] T015 [US1] Widen `#revocationPass`'s type to add `attempts?: number`, `failures?: number` and
  `malformed?: true`, and `#sweepPass`'s to add `attempts: number` and `failures: number` (JSDoc for each; the sweep
  literal changes in T039).
- [ ] T016 [US1] `#runRevocationReconcile` in `redis.ts` (FR-008). Inside the existing `try`, at `:3397`:
  `const value = await this.revocationHandler()`, then decode and write onto `this.#revocationPass`: the counts for
  (c), `malformed: true` for (b), nothing for (a). For (b), write **one** `REVOCATION_TALLY_MALFORMED` WARN naming the
  trigger and the contract, never the value, in the #391 shape (`try { console.warn } catch (sink) {
  writeMarkedFallback(REVOCATION_LOG_FAILED, …) }`). **Row 5a's home.** Every path still returns what it returns
  today; the failure paths are not edited.
- [ ] T017 [US1] `#emitPassSample` in `redis.ts` gains a counts parameter after `pages`, and adds `attempts` and
  `failures` to the frozen literal, after `pages`, **only when both are defined** (FR-011). **Row 6's home**: its
  JSDoc says the counts come from the start site's closure, never from a field. The gate, the call and the adoption
  are not edited.
- [ ] T018 [US1] The revocation end site passes `pass.attempts` / `pass.failures` (the closure's record) to
  `#emitPassSample`. This is the `REVOCATION_EMIT` edit; its battery re-anchor is T039.
- [ ] T019 [US1] `PassSample` JSDoc (FR-007). **Row 8's home**: per pass, the unit (revocation: one apply, linking
  `RevocationTally`; sweep: one dead instance `#sweepInstance` was called for), the failure (the tally's `failed`;
  one run of `#sweepInstance`'s catch; `renewed` and `closed` are not failures), and when the counts are absent (no
  tally, a malformed tally, a thrown handler). `outcome`'s JSDoc drops "no sample counts such failures" and links
  them. `onPassComplete`'s `@example` counts `failures`.
- [ ] T020 [US1] Run R1, R2, R3a and R3b's WARN, count and retry assertions; save the output. All green. R3b's
  `MISSED` assertion stays red until T026.

## Phase 4: US2 — a revoked socket that cannot be closed is reported before its record expires (P1)

**Goal:** only a clean pass re-arms the deadline, and an expiry after a non-clean pass is `MISSED`.
**Independent test:** R3b, R4, R5, R8, R9 and E1 pass; R6 and R7 stay green.

- [ ] T021 [US2] The module (FR-014). **Row 10's home.** `passEnded()` sets a private `#ended` flag;
  `passSucceeded` clears it **as its first statement, above `const previous`**; `close()` clears it; `#expired()`
  returns `this.#missed()` when no pass is in flight **or** `#ended` is set. `arm()` is not edited. JSDoc for
  `passEnded` (verdict-free: a pass settled since the last clean one) and the flag.
- [ ] T022 [US2] The module's constants (FR-013). **Row 10's home.** `REVOCATION_DEADLINE_MISSED` and
  `REVOCATION_DEADLINE_STALLED` state "no revocation pass completed without failures within revocationTtlSeconds of
  the last clean pass's start". `#missed()`'s tail adds "or are completing with failures". `SKEWED` is unchanged. The
  module JSDoc says "clean pass" where it says "successful pass".
- [ ] T023 [US2] The revocation end site in `#startRevocationPass` (FR-012). **Row 9's home.** Clean is
  `outcome === 'ok' && pass.malformed !== true && (pass.failures ?? 0) === 0`. While `!this.#closing`, a clean pass
  calls `passSucceeded(...)` exactly as today, and **every other settled pass** calls `this.#deadline.passEnded()`.
  The `passSucceeded` arguments (N14) are unchanged. This is the `:3340` edit; its battery re-anchor is T040.
- [ ] T024 [US2] The `#startRevocationPass` JSDoc (#362 row 8's home, now row 9) names both calls: the end site
  re-arms on a clean pass, and tells the deadline `passEnded()` otherwise.
- [ ] T025 [US2] Run R3b, R4, R5, R8 and R9; all green. Save the output.
- [ ] T026 [US2] Run E1: every sample carries `failures: 1`, the connection stays registered, and one `MISSED` lands at
  TTL. Run R6 and R7: still green.

## Phase 5: US3 — a one-off failure costs margin, not a WARN (P2)

**Goal:** the built-in once-only failures (plan §1) never write a deadline line.
**Independent test:** T2's and T3's second calls, and R6, pass.

- [ ] T027 [US3] Run T2, T3 and R6 together; save the output. T2's second call is `{ 3, 0 }`, T3's is `{ 0, 0 }`, and R6
  writes no line in 30 s. No code change: this phase proves the plan's §1 claim on the landed tree.

## Phase 6: US4 — the ghost sweep counts dead instances (P2)

**Goal:** every sweep sample carries `attempts` and `failures`.
**Independent test:** S1, S1b, S2, S3 and S4 pass.

- [ ] T028 [US4] `#sweepInstance` in `redis.ts` (FR-010). **Row 7's home** (counting only; the meaning is row 8's).
  A new first statement `if (this.#sweepPass) this.#sweepPass.attempts++`; a new first statement of the failed branch
  (`if (typeof end === 'object') {`), **before** the WARN, `if (this.#sweepPass) this.#sweepPass.failures++`. The
  signature, the catch and every log line stay byte-identical.
- [ ] T029 [US4] The sweep start site in `#armReconcile` builds `{ startedAt: this.#passClock(), pages: 0, attempts: 0,
  failures: 0 }` (the `:3664` literal; battery re-anchor T039), and the sweep end site passes `pass.attempts` /
  `pass.failures` to `#emitPassSample` (`SWEEP_FINALLY`; re-anchor T039).
- [ ] T030 [US4] Run S1, S1b, S2, S3 and S4; all green. Save the output.

## Phase 7: US5 — a third-party manager is unaffected, unless its counts are wrong (P2)

- [ ] T031 [US5] Run the whole witness file, then the whole realtime suite, and compare with T002. Every pre-existing
  test is green with **no edit** (plan §4). A suite that newly sees a deadline line or a malformed WARN is examined,
  never silenced; record any in this task.

## Phase 8: The battery — K1–K22, each proven live

- [ ] T032 New battery `packages/realtime/tests/mutations/revocation_tally_384.ts` on the shared harness, with
  `@fileoverview` naming each row's witness, and each row's `killedBy` set to the witness's name prefix.
- [ ] T033 [P] Manager rows **K1–K5** (`manager.ts`): K1 `#applyRevocation`'s catch `return true` (T2); K2
  `revokeLocal`'s catch `return true` (T3); K3 the wrapper's catch not counting (T4); K4 `attempted` counted before
  the ownership filter (T5); K5 the channel branch `return !clearFailed` (T6).
- [ ] T034 [P] Decoder and sample rows **K6–K9, K19–K22** (`redis.ts`): K6 the resolved value discarded (R1); K7
  `failed > attempted` accepted (R3b); K8 the safe-integer check as `typeof === 'number'` (R3b); K9 the keys added
  when the counts are `undefined` (R2); K19 the malformed flag dropped from the end site (R3b's `MISSED`); K20 a WARN
  for every non-`undefined` value (R3a); K21 the decoder's own `try` removed (R3b's getter case); K22 the malformed WARN
  moved to the end site after the trailing pass starts (R3b).
- [ ] T035 [P] Deadline rows **K10–K12, K17, K18** (`redis.ts` and the module): K10 the clean clause dropped (R4); K11
  the all-failed rule `(pass.failures ?? 0) < (pass.attempts ?? 1)` (R5); K12 `?? 0` → `?? 1` (R7); K17 the `MISSED`
  premise reverted (R8); K18 `passEnded()` a no-op (R9).
- [ ] T036 [P] Sweep rows **K13–K16** (`redis.ts`): K13 the failure not counted (S1); K14 counted after the WARN (S1b);
  K15 `attempts` counted in `#reconcile` for every live instance (S1); K16 `renewed` counted as a failure (S3).
- [ ] T037 **Prove every row live** (K1–K22): place a marker on each row's mutated line, run the killing witness, and
  see the marker execute. A row whose line never runs is rewritten, never trusted. Record the 22 results in this task.
- [ ] T038 Run the battery: `deno run -A packages/realtime/tests/mutations/revocation_tally_384.ts`. Every row
  `KILLED` by its named witness; no `SURVIVED`, no `DEAD MUTANT`.

## Phase 9: Blast radius — the 8 re-anchored rows, the 1 re-verified, the 63 unchanged

- [ ] T039 [P] **Re-anchor** `pass_sample_360` M5, M7, M8 (`REVOCATION_EMIT` and `revocationEmit`), M18
  (`SWEEP_FINALLY`) and M14 (the sweep record literal) in `packages/realtime/tests/mutations/pass_sample_360.ts`, to
  the T017/T018/T029 text. **Never delete a row.** Each mutant keeps its meaning (M5 still reports `'ok'`, M7 still
  hard-codes `'timer'`, M8 still reads the field, M18 still samples before the re-arm, M14 still reads the epoch
  clock). Re-prove each live.
- [ ] T040 [P] **Re-anchor** `revocation_pass_bound_362` N11, N13 and N15 in
  `packages/realtime/tests/mutations/revocation_pass_bound_362.ts`, to the T023 condition. N11 still re-arms a pass
  that is not clean, N13 still never calls `passSucceeded`, N15 still drops the `#closing` gate. Re-prove each live.
- [ ] T041 **Re-verify** `lapse_rehold_349` M27: its anchor (the wrapper's WARN tail) still matches once, and its
  `throw error` lands before T009's `return`. Confirm `KILLED` and re-prove live. If it no longer matches, repair the
  anchor, never delete the row.
- [ ] T042 Re-run every battery holding a **zone row** (plan §4, as re-classified in T001: 72 rows in 11 batteries)
  and confirm each: the 8 re-anchored and the 1 re-verified `KILLED`; the 63 unchanged at their previous result
  (`KILLED`, or their recorded `expectSurvival`). A `DEAD MUTANT` is **repaired, never deleted**, after checking the
  anchor-hygiene lines above.
- [ ] T043 Run `deno task mutate realtime` and compare with T003: one more battery (`revocation_tally_384`); every
  battery clean except the named live-broker batteries, which may report `PARTIAL`. Name them in the result.
- [ ] T044 Where a broker is available, run `LOCKNESS_REDIS_INTEGRATION=1 LOCKNESS_REDIS_PORT=<port> deno test -A
  packages/realtime/tests/redis_broker_integration.test.ts` and the three live-broker batteries. Record one line:
  *"Live run: yes — <n> passed, 0 failed"* or *"Live run: no broker available"*. Never leave it blank.

## Phase 10: Polish — docs, briefs, hygiene, and the gate

- [ ] T045 [P] `docs/realtime.md` (FR-018, D12):
  - the "Measuring the passes" paragraph (`:1989-1998` at `32baca7b`) names `attempts` and `failures`, linking row
    8's home rather than restating it;
  - the enforcement-deadline paragraph names a **clean pass** and `passEnded`;
  - **upgrade item 23, numbered at landing**: count the `### <n>.` headings under *Upgrading to v0.4.0* first. The
    item says: **before**, a pass with failed applies re-armed the deadline; **after**, only a clean pass does, so a
    failure on every pass writes `MISSED` one TTL after the last clean pass, and an expiry after a non-clean pass is
    `MISSED`, never `STALLED`; **also**, a handler resolving a tally-shaped value with bad counts writes
    `REVOCATION_TALLY_MALFORMED` once per pass and does not re-arm; `RevocationTally` and the two sample fields are
    additive; no wire change and no migration step. Update the section intro's count and the "read items …" list.
- [ ] T046 [P] ADRs (FR-018):
  - `docs/adr/011-realtime-revocation-bound-is-checked.md`: §2 "One deadline": "a failed pass leaves it alone" → "a
    pass that is not clean leaves it alone, and tells it so (`passEnded`)"; §3 gains the disposition's rejected options
    (the all-failed `failed` outcome, the counter argument, `clearRevocation` inference) and A2/A3's (a hedged
    `STALLED`, an `inFlight` filter, a silent no-tally for every bad value, a WARN for every non-`undefined` value, a
    WARN that still re-arms); **§4's first bullet is replaced**: the built-in apply failures happen once by design and
    cost one pass of margin, the hard-close failure repeats and is now reported, plus the plan's §9 residue (the lapse
    re-check, "failure" means the apply threw, clear failures, a void handler, a stall after a non-clean pass reads
    `MISSED`);
  - `docs/adr/012-measurements-reach-the-app-through-a-seam.md`: §3 gains the manager-side seam or new hook and the
    counter argument as rejected; **§5 item 8 is replaced**: the sample counts per-unit failures, and what a failure
    does not mean is linked to `PassSample`; a new item records **S-F2**: a failing record whose client moves between
    instances never breaks one instance's window, the rate of `failures` is the signal, and the only full fix is a
    durable per-record failure streak, a record-format change.
- [ ] T047 [P] `docs/observability-and-crypto.md` § Framework instruments (FR-018, D8). **Row 11's home.**
  - two table rows: `lockness.realtime.pass.attempts` (counter, `{attempt}`, `PassSample.attempts`) and
    `lockness.realtime.pass.failures` (counter, `{failure}`, `PassSample.failures`), both "the application (recipe
    below)";
  - the attribute note covers all four `lockness.realtime.pass.*` instruments; still at most 12 combinations;
  - the recipe creates both counters and adds them only when `sample.failures !== undefined`;
  - **one paragraph after the recipe: alert on the rate of `failures`**, because a failing record whose client moves
    between instances never trips one instance's deadline (S-F2 residue); link ADR 012.
- [ ] T048 [P] `packages/realtime/README.md` (`:247-250` at `32baca7b`): the pass-measurements bullet names the counts,
  linking the recipe. `packages/realtime/AGENTS.md`: `RevocationTally` in the exports table (`:58`); the pass-sample
  row (`:81-89`) names the counts and row 6's home; a pitfall: *never decide "clean" outside the end site, never WARN on
  a non-tally-shaped value, and never let a malformed tally re-arm the deadline*. Then run `deno task agents:brief` to
  regenerate the *Tests* list, which now includes `revocation_tally_384`.
- [ ] T049 JSDoc audit (FR-018, hard rule #7): every block FR-018 lists carries a description, `@param`, `@returns`
  and, for the public ones (`RevocationTally`, `PassSample`, the hook), an `@example`. Nothing quotes an anchor line.
- [ ] T050 Hygiene greps, each checked by its count, and each result recorded here:
  - `grep -n 'passEnded\|passSucceeded' packages/realtime/drivers/redis.ts`: one call of each, both in
    `#startRevocationPass`'s end site (row 9);
  - `grep -n 'REVOCATION_TALLY_MALFORMED' packages/realtime/drivers/redis.ts`: the constant and one write, inside
    `#runRevocationReconcile` (row 5a);
  - `grep -n 'decodeRevocationTally' packages/realtime`: the definition and one call (row 5);
  - `grep -n 'attempted++\|failed++' packages/realtime/manager.ts`: inside `#recheckRevocations`' wrapper only (row
    3);
  - `grep -n 'attempts++\|failures++' packages/realtime/drivers/redis.ts`: inside `#sweepInstance` only (row 7);
  - `grep -n 'RevocationTally' packages/realtime/mod.ts`: one re-export; `grep -n 'REVOCATION_TALLY_MALFORMED'
    packages/realtime/mod.ts`: nothing;
  - `grep -rn 'lockness.realtime.pass.attempts' packages docs`: the instrument table and the recipe only (row 11);
  - `grep -rn ': any\|as any' packages/realtime/driver.ts packages/realtime/drivers/redis.ts` finds nothing new;
  - each anchor-hygiene line in the header still matches the count its battery expects.
- [ ] T051 `deno task deps:analyze`: no new edge (no new import beyond `writeMarkedFallback`, already imported by
  `redis.ts`).
- [ ] T052 **The full gate, judged by exit status only**, never by a pipe's:
  - `deno fmt`, then `deno task gate` (hard rule #5);
  - `deno task agents:brief --check`;
  - `deno task mutate realtime`: the live-broker batteries may report `PARTIAL` only if each is named;
  - `git diff --stat origin/main -- deno.lock` is empty, and `git worktree list` shows no leftover worktree of this
    branch.
  - Record the pass and fail counts, the battery totals, and the T044 live-run line in this task when you tick it.

## Dependencies

**#370 lands** → T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 →
T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026 → T027 → T028 → T029 → T030 →
T031 → T032 → T033–T036 → T037 → T038 → T039 / T040 → T041 → T042 → T043 → T044 → T045–T048 → T049 → T050 → T051 →
T052.

- **#370 first, then T001.** T001 is the first task after #370 lands: the rebase, the full anchor dump and the
  manager re-count. No edit happens before it. If T001 re-classifies a §4 row, plan §4 is amended before T002.
- **Red before green.** T005's compile red and T006's behavioural red come before any change to `manager.ts`,
  `redis.ts` or the module.
- **The manager before the driver.** T007–T012 change the manager and the interface; T013–T020 consume the tally in
  the driver. The driver never needs the manager to compile.
- **`redis.ts` goes in order.** T013–T018, T023–T024 and T028–T029 all edit `redis.ts` and run in sequence.
- **Story order.** US1 is the base. US2 needs US1's pass record fields and decoder. US3 is a check on US1 and US2. US4
  needs only T015 and T017, and could run after T017, but is kept after US2 so `redis.ts` edits stay serial. US5 is a
  check after US1–US4.
- **Commits under the hook.** T004–T006 are committed together. Every commit is made with no worktree open.
- **Batteries.** T032–T038 depend on every code task. T039–T041 depend on T018, T023 and T029. T042 and T043 come
  after them.
- **Docs.** T045 needs the landed item count; T046–T048 are independent of each other.

## Parallel examples

- **Phase 8:** T033–T036 write disjoint row groups of one new battery file; draft them in parallel, merge in sequence.
- **Phase 9:** T039 (`pass_sample_360.ts`) and T040 (`revocation_pass_bound_362.ts`) touch different battery files.
- **Phase 10:** T045 (`docs/realtime.md`), T046 (the two ADRs), T047 (`docs/observability-and-crypto.md`) and T048
  (README and `AGENTS.md`) touch different files.
- **Phases 3–7** are serial: three source files and one witness file, edited in order.

## Implementation strategy

One branch, `272-revocation-tally`, started only after #370 lands. Incremental commits during implementation are
fine, one per story phase once its witnesses are green, each with a conventional prefix and `(384)`. At merge, the
history is **squashed by scope**:

1. `feat(384)`: the code and the tests (T004–T044): the tally, `revokeLocal`'s and `#applyRevocation`'s reports, the
   hook type, the decoder and its WARN, the sample fields, the clean-pass condition, `passEnded`, the reworded
   constants, the sweep counts, the witness file, the #384 battery, the 8 re-anchors and the re-verification. JSDoc
   lands with its code (hard rule #7).
2. `docs(384)`: `docs/realtime.md` (the paragraph, the deadline, item 23), ADR 011, ADR 012, the instrument table and
   recipe with the rate alert, README, `AGENTS.md` and the regenerated briefs (T045–T048).

**MVP = US1 and US2 green (T001–T026).** The sample counts failures, and a revoked socket that cannot be closed is
reported before its record expires. Everything after it is approved scope, not an option: the sweep counts, the
battery, the re-anchors and the docs.
