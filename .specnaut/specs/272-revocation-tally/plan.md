# Plan: the revocation re-check and the ghost sweep report how many records each pass tried and how many failed, and the enforcement deadline stops counting a pass with failures as a success

**Branch**: `272-revocation-tally` | **Date**: 2026-09-25 | **Backlog item**:
[#384 — Realtime: report per-record failures of the revocation re-check and ghost sweep on the pass metric](https://github.com/locknessland/lockness-monorepo/issues/384)

**This is the feature's one planning document.** The design was settled by the `architect-expert`
disposition on #384 (2026-09-25, hard rule #11), posted on the item. This plan records it as
binding. It adds what the disposition left to the plan: the decision table, the requirements, the
witnesses and mutants in testable form, and the blast radius, **counted on `main` at `32baca7b`**.

**Implementation waits for #370 / #363** (branch `370-impl`, unmerged). `revokeLocal` calls
`disconnect(id)`, and #363 changes what that call acts on and what it returns. This plan is written
against today's `main`; D11 lists the `manager.ts` anchors that must be re-counted once #370 lands.

**Where the tree, or the plan, adds to the disposition:**

- **D1 (today's anchors).** The disposition names symbols, not lines. On `main` at `32baca7b`:

  | Symbol | Where | What changes |
  | :--- | :--- | :--- |
  | `onRevocationReconcile` (interface) | `driver.ts:612-627` | handler type widens |
  | constructor registration | `manager.ts:1212` | none (the arrow now returns the tally) |
  | `#reassertRoster`'s re-check | `manager.ts:2430-2441` | none (the tally is discarded, §9) |
  | `revokeLocal` | `manager.ts:2929-2940` | reports whether its teardown completed (D3) |
  | `#applyRevocation` | `manager.ts:3229-3248` | reports whether it completed |
  | `#dispatchRevocation` | `manager.ts:3268-3274` | none (the result is dropped) |
  | `reconcileRevocations` | `manager.ts:3294-3300` | resolves to `RevocationTally` |
  | `#recheckRevocations` | `manager.ts:3331-3376` | counts; its `apply` wrapper reports |
  | `PassSample` | `drivers/redis.ts:1436-1497` | gains `records`, `failures`; `outcome` JSDoc amended |
  | `#revocationPass`, `#sweepPass` field types | `drivers/redis.ts:1731-1735`, `:1790` | gain the counts |
  | `onPassComplete` / `#emitPassSample` | `drivers/redis.ts:2422-2515` | the sample carries the counts |
  | `onRevocationReconcile` (driver) | `drivers/redis.ts:3165-3246` | handler type; the bound's JSDoc |
  | `#startRevocationPass` end site | `drivers/redis.ts:3317-3363` | the clean-pass condition (`:3340`) |
  | `#runRevocationReconcile` | `drivers/redis.ts:3392-3420` | decodes the tally (`:3397`) |
  | `#armReconcile` | `drivers/redis.ts:3662-3689` | the sweep record (`:3664`) and its sample |
  | `#sweepInstance` | `drivers/redis.ts:3913-3945` | counts one unit, and a failure |
  | `REVOCATION_DEADLINE_STALLED` / `_MISSED`, `#missed()` | `drivers/enforcement_deadline.ts:42-57`, `:226-232` | wording (D7) |

- **D2 (the counting unit is one apply).** The item says "per record". The disposition says
  `#applyRevocation` reports whether it completed, and the manager calls it once per
  connection revocation and **once per channel pair** (#337: a pair's N records are one leave). So
  `attempted` counts **applies**, and a pair with three stored ids is one unit. Counting stored ids
  would multiply one leave's failure by N, which no operator can act on. A record the ownership
  filter drops (`manager.ts:3355`) is not attempted: it names no socket here.
- **D3 (`revokeLocal`'s contained failure is a failure).** `revokeLocal` catches a `disconnect`
  failure itself and WARNs (`manager.ts:2931-2939`), so today a connection-scope apply never throws.
  Left as it is, a connection revocation could never count as failed. `revokeLocal` therefore
  reports whether its teardown completed: `true` after `disconnect` settles, `false` from its
  catch. `#applyRevocation` returns that. `revokeLocal`'s other callers (`evict`, the control-frame
  `evict` arm) drop the result. The disposition's "a failure is the apply threw" reads through
  this: the teardown threw, and only `revokeLocal`'s own WARN hid it.
- **D4 (the counts travel on the in-flight record, as `pages` does).** #360 counts pages by
  incrementing the in-flight record (`redis.ts:3105`, `:4028`) and reads them from the start
  site's closure at the end. The counts use the same idiom:
  - **revocation**: `#runRevocationReconcile` decodes what the handler resolved to and writes it
    onto `#revocationPass`, which is this pass's record while it runs (the slot is freed only by
    its `finally`). The end site reads `pass.records` / `pass.failures` from its closure. The
    failure returns of `#runRevocationReconcile` are untouched, so the #308 rows keep their anchors;
  - **sweep**: `#sweepInstance` increments `#sweepPass.records` once at its top and
    `#sweepPass.failures` in its failed branch. `#reconcile`'s loop and `#sweepInstance`'s signature
    are untouched, so #355 M2 and #360 M4 keep their anchors.
- **D5 (`records` and `failures` are optional on `PassSample`).** "Values", in the disposition, means
  numbers carried by the sample, not a third outcome. They are **present on every sweep sample**
  (a failed sweep reports what it reached) and **on a revocation sample whose handler resolved to a
  tally**. They are **absent** when the handler resolved to nothing, and on a revocation pass whose
  handler threw (no tally exists). The frozen sample then has no such keys, rather than `undefined`
  values. That is the disposition's "a handler returning `void` gets no counts and today's
  behaviour".
- **D6 (the tally is decoded, not trusted).** A third-party handler is untyped at runtime. A resolved
  value counts only if `attempted` and `failed` are both non-negative safe integers and
  `failed ≤ attempted`. Anything else, `undefined` included, is read as "no tally": no counts, and
  today's deadline behaviour. One decoder, beside the other reply decoders in `redis.ts`. *Taken by
  the plan; put to the security audit (§11), which may ask for a WARN.*
- **D7 (both deadline lines change their premise).** The disposition rewords `MISSED` to "no pass
  completed without failures". `STALLED` opens with the same clause (`enforcement_deadline.ts:42-45`)
  and would otherwise state the old rule. Both become "no revocation pass completed without
  failures within `revocationTtlSeconds` of the last clean pass's start". `#missed()`'s tail adds
  "or are completing with failures". `SKEWED` is unchanged: it compares two clean passes.
- **D8 (two counters in the recipe).** The instrument table gains
  `lockness.realtime.pass.records` and `lockness.realtime.pass.failures`: counters, unit
  `{record}`, the same three attributes, recorded only when the sample carries counts. Counters,
  not histograms: an alert asks "did any record fail in the last window", which is a rate. The
  attribute budget stays at 12 combinations. *Put to the architecture audit (§10).*
- **D9 (the deadline module gains no API).** The driver decides "clean" at its one end site and
  calls `passSucceeded` only then. `EnforcementDeadline` keeps its signature; only its constants,
  `#missed()` and its module JSDoc ("re-armed only by a successful pass" → "a clean pass") change.
- **D10 (`RevocationTally`'s home is `driver.ts`).** It is the return type of a `BroadcastDriver`
  hook's handler, so it sits beside that hook, like `ControlRefusal` and `RosterDeparture`. The
  manager imports it from there; `mod.ts` re-exports it. Its JSDoc is the one home of what
  `attempted` and `failed` mean.
- **D11 (re-count after #370).** On `370-impl` today the manager anchors this plan touches have
  moved by about +150 to +195 lines. The branch is unmerged and may move them further, so every
  anchor below is **re-counted when #370 lands**, before `tasks`:
  - the constructor registration (`:1212` → `:1259` on `370-impl`);
  - `#reassertRoster`'s re-check (`:2432` → `:2577`);
  - `revokeLocal` (`:2929` → `:3123`) and its WARN (`:2937` → `:3131`);
  - `#applyRevocation` (`:3229` → `:3423`) and its `revokeLocal` call (`:3237` → `:3431`);
  - `#dispatchRevocation` (`:3268` → `:3462`);
  - `reconcileRevocations` (`:3294` → `:3488`);
  - `#recheckRevocations` (`:3331` → `:3523`) and its wrapper's WARN (`:3338` → `:3532`).

  `370-impl` leaves `revokeLocal`'s text as it is, but `disconnect(id)` resolves
  `'disconnected' | 'not-owned'` there. **`'not-owned'` counts as completed**: the socket is no
  longer this instance's, so nothing is left to apply here, and a failure means the apply threw
  (disposition). This is re-read at landing; if #363 made `'not-owned'` mean something else, the
  question goes back to the `architect-expert`.
- **D12 (upgrade item 23).** Item 23 unless another lands first (1–19 are on `main`; 20–22 are
  reserved by in-flight branches). An additive public type is not observable on its own; the
  stricter deadline is: a deployment whose passes complete with a failure on every pass now sees
  `MISSED` one TTL after its last clean pass.

## 1. Why this exists

#360 gave operators a sample per background pass, and #362 a deadline that says when the
revocation guarantee is broken. Both judge a pass by one word, `outcome`, and `ok` means **the
enumeration completed, not that every record was applied** (`PassSample.outcome`,
`redis.ts:1466-1478`). Both ADRs name the gap: ADR 011 §4, first bullet ("a record whose apply
always throws expires with only its #349 WARN"), and ADR 012 §5 item 8 ("no sample counts
per-record failures").

What that costs today:

- **One revocation that keeps failing expires unapplied, silently.** Its apply throws on every pass.
  Each pass is `ok`, so the deadline re-arms every pass, and after `revocationTtlSeconds` the record
  is reaped. The revoked socket keeps its access, and the only trace is one WARN per pass among
  many.
- **The metric cannot see it either.** A dashboard of `outcome` shows a healthy line while one
  record in a hundred never lands.
- **The ghost sweep has the same shape.** One dead instance whose release keeps failing leaves its
  members in every roster (#355 A3 contains the failure). The pass is `ok`, and nothing counts it.

**Who is affected:** every Redis deployment that relies on revocations applying after a lost
control frame, and every operator who alerts on the #360 metric.

## 2. User scenarios

### US1 — an operator sees partial failures on the metric (P1)

**Given** a Redis deployment with `onPassComplete` wired to the #360 recipe
**When** a revocation pass applies 40 revocations and one of them throws
**Then** that pass's sample carries `records: 40` and `failures: 1`, with `outcome: 'ok'`, and the
recipe records both on the two new counters.

### US2 — one revocation that keeps failing is reported before it expires (P1)

**Given** interval 1 s, TTL 10 s, and one channel revocation whose apply throws on every pass
**When** 10 s pass with no pass free of failures
**Then** one `MISSED` line says no revocation pass completed without failures within
`revocationTtlSeconds` of the last clean pass's start. However long it lasts, the episode writes one
line.

### US3 — a one-off failure costs margin, not a WARN (P2)

**Given** the same timing, with passes clean except one
**When** one pass has a failure and the next is clean
**Then** no deadline line is written. The deadline stays anchored at the last clean pass's start,
so the one failure consumed one pass of margin.

### US4 — the ghost sweep counts dead instances (P2)

**Given** two dead instances, one of whose release throws
**When** the sweep runs
**Then** its sample carries `records: 2`, `failures: 1`, `outcome: 'ok'`. With no dead instance it
carries `records: 0`, `failures: 0`.

### US5 — a third-party manager is unaffected (P2)

**Given** an application that registers its own `onRevocationReconcile` handler returning nothing
**When** passes run
**Then** its samples carry no counts, and the deadline behaves exactly as today.

### Edge cases

- **Foreign records** the ownership filter drops are not attempted (D2).
- **A channel pair with several stored ids** is one unit (D2).
- **A clear failure** after a successful leave is not a failure: the revocation was applied, and
  only the record outlives it (§9 residue). Pinned by T6.
- **The apply's own WARN throws** (a log sink refusing the line): the `apply` wrapper's catch
  counts it as failed, and the loop goes on (#349). T4.
- **The re-check handler throws** (a page read failed): no tally exists, the pass is `failed` as
  today, and the #308 retry runs as today. The sample has no counts (D5).
- **A handler resolving to a malformed tally** is read as none (D6). R3.
- **A sweep that fails mid-pass** (a liveness probe throws after one instance was swept) reports
  `outcome: 'failed'` with the counts it reached. S4.
- **A sweep of an instance that renews itself, or is cut short by `close()`**, is attempted and not
  failed: only `#sweepInstance`'s catch is a failure (disposition). S3.
- **The lapse run's re-check** (#349) resolves to a tally too; `#reassertRoster` discards it. Its
  failures are not on any sample (§9 residue).
- **`close()` mid-pass**: the end site's `#closing` gate and `#emitPassSample`'s are unchanged, so
  nothing new is reported after close.

## 3. Requirements

**The tally (manager)**

- **FR-001** `RevocationTally` is an exported interface, `{ readonly attempted: number; readonly
  failed: number }`, declared in `packages/realtime/driver.ts` and re-exported from `mod.ts`. Its
  JSDoc is the one home of what each count means (D2, D10). No `any`.
- **FR-002** `BroadcastDriver.onRevocationReconcile`'s handler type becomes
  `() => RevocationTally | void | Promise<RevocationTally | void>`. The JSDoc says a handler may
  resolve to a tally, that a driver may report it, and that resolving to nothing is conforming.
  Drivers still call the handler with no argument.
- **FR-003** `revokeLocal` resolves `true` once `disconnect` settled and `false` from its catch, after
  its WARN (D3). Its other callers drop the value.
- **FR-004** `#applyRevocation` resolves `true` when the apply completed and `false` from its catch,
  after its WARN. The connection branch returns `revokeLocal`'s result; the channel branch returns
  `true` once `#revokeChannelLocal` resolved, **whatever its `clearFailed`**.
- **FR-005** `#recheckRevocations` counts: `attempted` once per call of its `apply` wrapper, `failed`
  once per wrapper call that got `false` or reached its catch. It resolves `{ attempted, failed }`
  after the last group. Nothing is counted before the ownership filter (`manager.ts:3355`).
- **FR-006** `reconcileRevocations` resolves to that tally. Its tail
  (`run.then(() => {}, () => {})`) is unchanged, and it still rejects when the run rejects.

**The sample (driver)**

- **FR-007** `PassSample` gains `readonly records?: number` and `readonly failures?: number`, with
  JSDoc stating, per pass, what one unit is (revocation: one apply, as `RevocationTally` defines it;
  sweep: one dead instance `#sweepInstance` was called for), what a failure is (revocation: the
  tally's `failed`; sweep: one run of `#sweepInstance`'s catch), and when they are absent (D5).
  `outcome`'s JSDoc drops "no sample counts such failures" and links the two fields.
- **FR-008** `#runRevocationReconcile`, on its `ok` path only, decodes the handler's resolved value
  (FR-009) and, when it is a tally, writes `records` and `failures` onto `#revocationPass`. Its
  failure paths and their returns are unchanged.
- **FR-009** One decoder, `decodeRevocationTally(value: unknown): RevocationTally | undefined`, in
  `redis.ts` beside the other decoders (D6). A tally only when both counts are non-negative safe
  integers and `failed ≤ attempted`.
- **FR-010** The sweep's record, built once in `#armReconcile`'s callback, is
  `{ startedAt, pages: 0, records: 0, failures: 0 }`. `#sweepInstance` increments `records` as its
  first statement and `failures` as the first statement of its failed branch, **before** the WARN,
  so a throwing sink cannot skip the count. Both through `if (this.#sweepPass)`, the `pages` idiom.
- **FR-011** `#emitPassSample` takes the counts from the start site's closure (the record), never
  from the fields, and adds `records` and `failures` to the frozen sample **only when both are
  defined**. Both end sites pass them.

**The deadline**

- **FR-012** The revocation end site calls `passSucceeded` only for a **clean pass**:
  `outcome === 'ok'`, and `(pass.failures ?? 0) === 0`, while `close()` has not begun. A pass with any
  failure leaves the deadline alone, like a failed pass. `?? 0` is today's behaviour for a pass with
  no tally (US5).
- **FR-013** `REVOCATION_DEADLINE_MISSED` and `REVOCATION_DEADLINE_STALLED` state the premise as "no
  revocation pass completed without failures within `revocationTtlSeconds` of the last clean pass's
  start" (D7). `#missed()`'s tail names passes completing with failures. `SKEWED` is unchanged.
- **FR-014** `enforcement_deadline.ts` gains no member, and its module JSDoc says "clean pass" where
  it says "successful pass" (D9). The `#startRevocationPass` JSDoc (#362 row 8's home) says the end
  site re-arms on a clean pass.

**Tests, battery, docs**

- **FR-015** Witnesses T1–T7, R1–R8, S1–S4 and E1 (§4), red first where marked.
- **FR-016** Mutants K1–K17 (§4), battery `packages/realtime/tests/mutations/revocation_tally_384.ts`,
  each proven live under its killing witness.
- **FR-017** The 8 re-anchored and 1 re-verified battery rows (§4 blast radius); no row deleted.
- **FR-018** Docs:
  - ADR 011 §2 "One deadline": "a failed pass leaves it alone" → "a failed pass, or one with any
    failure"; §4's first bullet is replaced by what now holds and what does not (§9 residue);
  - ADR 012 §5 item 8 is replaced: the sample counts per-record failures; what "failure" does not
    mean is linked to `PassSample`;
  - `docs/observability-and-crypto.md` § Framework instruments: the table's two rows, the
    attribute note, and the recipe records both counters when `sample.failures !== undefined` (D8);
  - `docs/realtime.md`: the "Measuring the passes" paragraph (`:1989-1998`) names the counts; the
    deadline paragraph names a clean pass; upgrade item 23 (D12);
  - `packages/realtime/README.md` (`:247-250`), `packages/realtime/AGENTS.md` (the exports table,
    `:58`, and the pass-sample row, `:81-89`);
  - JSDoc: `RevocationTally`, the interface hook, the driver hook, `PassSample`, `onPassComplete`'s
    example, `#emitPassSample`, `#startRevocationPass`, `#runRevocationReconcile`, `#sweepInstance`,
    `revokeLocal`, `#applyRevocation`, `#recheckRevocations`, `reconcileRevocations`, the deadline
    module and both constants.
  - No `CHANGELOG` file: #364 tracks the missing root changelog.

## 4. Success criteria

- **SC-001**: Every revocation pass and every ghost sweep that completes reports how many units it
  tried and how many failed, whenever the counts are known.
- **SC-002**: A revocation that fails on every pass is reported **before** its record's TTL runs out,
  once per episode.
- **SC-003**: A single failed apply among clean passes produces no deadline warning.
- **SC-004**: An application whose re-check reports no counts sees no change at all, on samples or on
  the deadline.
- **SC-005**: No new broker round trip, and no new log line outside the two reworded deadline lines.

**Witnesses**, in `packages/realtime/tests/revocation_tally_384.test.ts`. "Red" means failing on
`main` at `32baca7b`. Test names start `#384 T<n> `, `#384 R<n> `, `#384 S<n> ` or `#384 E<n> `
with a trailing space.

| # | Setup → assertion |
| :--- | :--- |
| T1 (red) | manager over an in-memory revocation store listing, for local sockets, 2 connection revocations and 1 channel pair with 2 ids → `reconcileRevocations()` resolves `{ attempted: 3, failed: 0 }`. Today it resolves `undefined` |
| T2 (red) | as T1, the pair's `unsubscribe` throws → `{ attempted: 3, failed: 1 }`; both connection revocations were applied |
| T3 (red) | one connection revocation whose `disconnect` throws → `{ attempted: 1, failed: 1 }`; the socket was closed 4403 anyway |
| T4 (red) | `console.warn` throws inside `#applyRevocation`'s catch → the wrapper counts it: `failed: 1`, and the next revocation is still applied |
| T5 (pin) | 2 foreign records and 1 local → `attempted: 1` |
| T6 (pin) | a channel revocation whose leave succeeds and whose `clearRevocation` rejects → `failed: 0` |
| T7 (pin) | `listRevocations` rejects → `reconcileRevocations()` rejects with it; no tally |
| R1 (red) | Redis driver, handler resolves `{ attempted: 4, failed: 1 }` → the revocation sample has `records: 4`, `failures: 1`, `outcome: 'ok'` |
| R2 (pin) | handler resolves `undefined` → the sample has neither key (`'records' in sample` is false) |
| R3 (red) | handler resolves, in turn, `{ attempted: -1, failed: 0 }`, `{ attempted: 1.5, failed: 0 }`, `{ attempted: 1, failed: 2 }`, `{ attempted: '4', failed: 0 }` and `'x'` → no counts on any sample, and no deadline line in 30 s at interval 1 000, TTL 10 |
| R4 (red) | interval 1 000, TTL 10; `performance.now` on `time.now`; handler resolves `{ 1, 1 }` every pass → exactly one `REVOCATION_DEADLINE_MISSED` line at 10 s. Today there is none |
| R5 (red) | as R4, handler resolves `{ 5, 1 }` every pass → the same one line (a partial failure blocks the re-arm) |
| R6 (pin) | as R4, every pass clean except the one starting at 3 s → no line in 30 s |
| R7 (pin) | as R4, handler resolves `undefined` → no line in 30 s (today's behaviour) |
| R8 (red) | the R4 line contains `without failures` and `last clean pass's start`; a `STALLED` line (a page held past TTL) contains the same premise |
| S1 (red) | two dead instances, the first's `#sweepOwned` throws → the sweep sample has `records: 2`, `failures: 1`, `outcome: 'ok'` |
| S2 (red) | no dead instance → `records: 0`, `failures: 0` |
| S3 (red) | a dead instance that renews itself mid-sweep → `records: 1`, `failures: 0` |
| S4 (red) | one dead instance swept, then the next `EXISTS` throws → `outcome: 'failed'`, `records: 1`, `failures: 0` |
| E1 (red) | a `ChannelManager` over the Redis driver, one local channel revocation whose `unsubscribe` throws every pass → the revocation samples carry `failures: 1`, and one `MISSED` line lands at TTL |
| — | every existing realtime test stays green with no edit |

**Mutants**, battery `packages/realtime/tests/mutations/revocation_tally_384.ts`:

| # | Mutant | Killed by |
| :--- | :--- | :--- |
| K1 | `#applyRevocation`'s catch returns `true` | T2 |
| K2 | `revokeLocal`'s catch returns `true` | T3 |
| K3 | the `apply` wrapper's catch does not count | T4 |
| K4 | `attempted` counted before the ownership filter | T5 |
| K5 | the channel branch returns `!clearFailed` | T6 |
| K6 | `#runRevocationReconcile` discards the resolved value | R1 |
| K7 | the decoder accepts `failed > attempted` | R3 |
| K8 | the decoder's safe-integer check weakened to `typeof === 'number'` | R3 |
| K9 | `#emitPassSample` adds the keys when the counts are `undefined` | R2 |
| K10 | the clean clause dropped from the end site | R4 |
| K11 | the all-failed rule: `(pass.failures ?? 0) < (pass.records ?? 1)` | R5 |
| K12 | `?? 0` → `?? 1` (a pass with no tally never re-arms) | R7 |
| K13 | `#sweepInstance`'s failure not counted | S1 |
| K14 | the sweep failure counted after the WARN instead of before | S1 with a throwing sink (S1b) |
| K15 | the sweep's `records` counted in `#reconcile` for every live instance | S1 |
| K16 | `renewed` counted as a failure | S3 |
| K17 | the `MISSED` premise reverted | R8 |

**Blast radius: existing battery rows.** Counted on `main` at `32baca7b`. A stub harness dumped
every row of 37 of the 41 batteries under `packages/realtime/tests/mutations/`: **480 anchors, each
matching exactly once today.** `live_conformance_285`, `self_skip_310` and `sweep_parse_316` import
the live-broker helper and `presence_member_frozen_354` imports `MutantGuard`, so those four were
grepped by hand: none anchors in an edit zone. **72 rows in 11 batteries** (79 anchors) sit in or
beside the zones of D1.

- **Re-anchored (8), DEAD otherwise; never deleted:**
  - `pass_sample_360` M5, M7, M8, through `REVOCATION_EMIT` (`redis.ts:3347-3354`) and its
    `revocationEmit` helper: the call gains the counts argument (FR-011);
  - `pass_sample_360` M18, through `SWEEP_FINALLY` (`:3669-3681`): same;
  - `pass_sample_360` M14 (`:3664`, the sweep record literal): it gains `records: 0, failures: 0`
    (FR-010);
  - `revocation_pass_bound_362` N11, N13, N15 (`:3340`, `if (outcome === 'ok' && !this.#closing) {`):
    the clean clause joins it (FR-012). Each mutant keeps its meaning over the new condition.
- **Re-verified (1):** `lapse_rehold_349` M27 anchors the wrapper's WARN tail
  (`manager.ts:3338-3340`), which FR-005 follows with a `return false`. The anchor still matches
  once, and its `throw error` lands before that return; re-proven live.
- **Unchanged (63)**, provided FR-003, FR-005, FR-008, FR-010 and FR-011 insert where they say:
  - `pass_sample_360` (14): M4 (`:3913`), M6 and M21 (`#reconcile`), M9, M10, M11, M13 (four
    edits: the `): void {` + gate, the adoption, and both calls' first two lines), M15, M16, M17
    (`:3917-3920`), M19, M20, M22, M23 — the counts parameter goes into `#emitPassSample`'s list,
    and the freeze adds keys after `pages`;
  - `revocation_pass_bound_362` (16): N10, N12, N14, N17, N19, N20, N25–N34 — the deadline module's
    logic and the registration are untouched;
  - `reconcile_single_pass_355` (8): M1, M2, M12a, M13, M17, M18, M22, M25 — `#reconcile`'s loop
    and `#sweepInstance`'s signature are untouched;
  - `revocation_paging_359` (7): M13, M14, M16, M17 (two anchors), M19, M20, M22;
  - `marked_fallback_391` (4): S3, S4, S6 (two anchors), S7;
  - `revocation_retry_308` (4): all four — `#runRevocationReconcile`'s failure paths are untouched
    (FR-008);
  - `lapse_rehold_349` (4): M19, M20, M21, M33 — `#reassertRoster` is untouched;
  - `channel_revoke_332` (2), `log_encoding_291` (2: `revokeLocal`'s WARN, above FR-003's return),
    `apply_revocation_376` (1: M1, the `.catch` on a `Promise<boolean>`), `sweep_paging_358` (1: M9).
- **Re-count after #370** (D11): every `manager.ts` row above moves with it.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| 1. What `attempted` and `failed` mean (one apply; a pair is one; foreign records are not attempted) | the `RevocationTally` JSDoc, `packages/realtime/driver.ts` | the meaning restated on `PassSample`, in ADR 011/012, `realtime.md` or the recipe instead of linked; a count of stored ids |
| 2. An apply completed, or failed | `#applyRevocation`'s resolved boolean, `packages/realtime/manager.ts` (`revokeLocal` answers it for the connection scope) | a failure inferred from a WARN; a second verdict in `#recheckRevocations`; `clearFailed` counted as a failure |
| 3. The tally is counted | `#recheckRevocations`'s `apply` wrapper, `packages/realtime/manager.ts` | a count in `#applyRevocation` or in the driver; a count before the ownership filter; a counter argument passed to the handler |
| 4. A handler may resolve to a tally, or to nothing | the `onRevocationReconcile` handler type, `packages/realtime/driver.ts` (the Redis driver's signature repeats the type, not the rule) | a new hook; a manager-side metric seam; a second handler registration |
| 5. What a resolved value must be to count | `decodeRevocationTally`, `packages/realtime/drivers/redis.ts` | a cast; a check at the end site; a second decoder in the manager |
| 6. The counts travel on the in-flight record, and the end site reads them from its closure | `#startRevocationPass` / `#armReconcile` start sites, `packages/realtime/drivers/redis.ts` (the #360 row for `pages`, widened) | a field read at the end site; a counts field on the driver; a return value threaded through `#reconcile` |
| 7. A sweep unit is one dead instance; a sweep failure is one run of `#sweepInstance`'s catch | `#sweepInstance`, `packages/realtime/drivers/redis.ts` | a count in `#reconcile`'s loop; a failure inferred from `SweepEnd` outside the catch; `renewed` or `closed` as failures |
| 8. What each sample field means, and when the counts are absent | the `PassSample` JSDoc, `packages/realtime/drivers/redis.ts` | the rule restated in `#emitPassSample`, ADR 012, the recipe or `realtime.md` |
| 9. The deadline re-arms only on a clean pass (`ok`, and no failure; no tally counts as none) | the end site's condition in `#startRevocationPass`, `packages/realtime/drivers/redis.ts` (its JSDoc is #362 row 8's home) | a check in `EnforcementDeadline`; a `passFailed` method; an all-failed rule; a clean flag on `PassOutcome`; `outcome` rewritten to `'failed'` on a failure |
| 10. What the deadline lines say | `REVOCATION_DEADLINE_MISSED` / `_STALLED`, `packages/realtime/drivers/enforcement_deadline.ts` | the text inlined in `redis.ts` or a test; the old premise left in one of the two |
| 11. The two counters' names, kind, unit and attributes | the instrument table, `docs/observability-and-crypto.md` | a name in code; a second list in `realtime.md` or README |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2 · **Primary dependencies**: `@lockness/realtime` only; no
new edge · **Storage**: none; two numbers on each in-flight pass record · **Testing**: `deno test`;
FakeTime plus a stubbed `performance.now`; FakeRedis; the shared mutation harness ·
**Target**: server library · **Project type**: framework package · **Performance**: two increments
per unit, one decode per revocation pass; zero broker round trips · **Constraints**: no wire,
control-frame or options change; the handler is still called with no argument · **Scale**: counts
are per pass; the attribute set is unchanged.

### Domain model

- **Bounded context**: realtime (the manager's revocation re-check and the Redis driver's passes).
- **Vocabulary**:
  - *apply*: one call of `#applyRevocation`, for a connection revocation or a channel pair;
  - **tally**: `{ attempted, failed }` for one re-check run;
  - *unit*: what `records` counts (an apply; a dead instance);
  - *failure*: an apply that threw, `revokeLocal`'s teardown included; one run of `#sweepInstance`'s
    catch;
  - **clean pass**: a completed pass with no failure. Only a clean pass re-arms the deadline.
- **Entities**: `ChannelManager` (owns the re-check and its tally); `RedisBroadcastDriver` (owns the
  pass records, the sample and the deadline call).
- **Value objects**: `RevocationTally`; `PassSample` (widened); the pass records (widened).
- **Invariants**:
  - `0 ≤ failed ≤ attempted`, integers, for every tally that reaches a sample;
  - `outcome` keeps its #360 meaning: whether the pass itself stopped;
  - a pass with any failure never re-arms the deadline;
  - a handler that resolves to nothing changes nothing.
- **Out of scope**: the lapse run's re-check counts (residue); clear failures; whether the socket
  stayed subscribed; #370/#363's `disconnect` change, which this waits for.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | not touched |
| JSR-only deps, declared per package | pass | no new dependency |
| No `any` in exported APIs | pass | `RevocationTally` is two `number`s; the decoder takes `unknown` |
| Tailwind v4 syntax | pass | no UI |
| Pre-completion gate | pass | per task, plus `deno task mutate realtime` |
| `deno.lock` untouched | pass | no dependency change |
| JSDoc on public APIs | pass | FR-018 lists every block |
| MVC layering | pass | not applicable (driver and manager) |
| Commit discipline | pass | test (red witnesses) / feat (the tally, the sample, the deadline) / test (battery, re-anchors) / docs (ADRs, recipe, `realtime.md`, README, `AGENTS.md`) |
| No environment detail in versioned files | pass | none |
| Design decisions go to architect-expert | pass | the disposition is binding; D2–D11 go to the audit (§10) |
| Product decisions go to the user | pass | none raised (§12) |
| Act, don't recommend | pass | the audits are dispatched at stop 1 |
| TDD, red first | pass | 15 red witnesses; T5–T7, R2, R6, R7 are pins |
| No silent catches | pass | every new `false` follows the existing WARN |
| Domain Model gate | pass | §6 |
| #360: the library never judges a performance value | pass | a failure is a fact, not a threshold |

### Complexity tracking

No violation. Added: one exported interface, one private decoder, two optional sample fields, two
record fields, one widened hook type, two boolean returns, one condition, two reworded constants,
two documented instruments.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` public API | yes, additive | `RevocationTally` exported; `PassSample.records` / `.failures`; the hook's handler type widens (a void handler still conforms) |
| `BroadcastDriver` implementers | no | they still call `handler()`; they may ignore the result |
| `onRevocationReconcile` handlers (third party) | optional | may resolve to a tally |
| Logs | yes | `MISSED` and `STALLED` reworded; `MISSED` now fires for a failure run of any size (upgrade item 23) |
| Metrics recipe | yes | two counters |
| Wire, control plane, options, broker | no | — |
| Tests | yes | one witness file, one battery, 8 re-anchors, 1 re-verification |
| Docs | yes | ADR 011, ADR 012, the instrument table and recipe, `realtime.md` (paragraph, deadline, item 23), README, `AGENTS.md`, JSDoc |

### Documentation (this feature)

```text
.specnaut/specs/272-revocation-tally/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A deployment with one permanently failing revocation now sees `MISSED` every TTL window | Intended: that record was expiring unapplied. Upgrade item 23 says so and how to find the record (the per-apply WARN precedes it) |
| #370 changes `revokeLocal`'s callee and moves every manager anchor | Implementation waits; D11 lists the re-count; `'not-owned'` is re-read at landing |
| An existing suite whose re-check fails one apply per pass now sees a deadline line | The full realtime suite runs before the first edit and after it; a new line is examined, never silenced |
| A battery row goes DEAD | §4 lists all 72 zone rows; FR-017 re-anchors 8 |
| **Residue: the lapse run's re-check** counts are discarded by `#reassertRoster` | Accepted (disposition). That run's failures stay their WARNs |
| **Residue: a failure means the apply threw**, not that the socket stayed subscribed. An apply that resolves without effect counts as done | Accepted (disposition) |
| **Residue: clear failures** are not counted; the record is re-applied until its TTL | Accepted (disposition); T6 pins it |
| **Residue: a handler resolving to nothing** gets no counts and today's deadline | Accepted (disposition); R2 and R7 pin it |
| **Residue: a failed pass has no counts.** A handler that threw produced no tally | Accepted; `outcome: 'failed'` already reports it |
| **Rejected: `failed` outcome when all records fail.** Conflates an unreadable store with a refused apply, triggers the #308 retry for a pass that read fine, and hides every partial failure | Recorded in ADR 011 §3 |
| **Rejected: a manager-side seam or a new hook.** Two samples an operator must join, and the deadline cannot see either | Recorded in ADR 012 §3 |
| **Rejected: a counter argument to the handler.** Third-party drivers call `handler()` with no argument, so the counts would silently never arrive | Recorded in ADR 012 §3 |
| **Rejected: inferring failures from `clearRevocation`.** Incomplete: a connection revocation is never cleared, and a clear failure is not an apply failure | Recorded in ADR 011 §3 |

## 10. Architecture audit

_Placeholder — filled in by the `architect-expert` plan audit at stop 1 (`phases/plan-audits.md`).
To be ruled on: D2–D11, the decision table, and the blast radius._

## 11. Security audit

_Placeholder — filled in by the `security-expert` plan audit at stop 1, in parallel and kept
separate. To be ruled on in particular: D6 (the decoder, and whether a malformed tally deserves a
WARN) and D3 (`revokeLocal`'s contained failure counted)._

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Approve the architecture as audited (tasks → implement → review, after #370 lands)? | _Asked at stop 1._ | — |

No product question is open: the stricter deadline is the disposition's acceptance rule ("any
failure" replaces "all failed").

### Decided without asking

- The design is the #384 `architect-expert` disposition (2026-09-25), binding under hard rule #11.
- D2: one unit is one apply; a pair is one unit.
- D3: `revokeLocal`'s contained teardown failure counts as a failure.
- D4: the counts travel on the in-flight record, as `pages` does.
- D5: the counts are optional on `PassSample`, absent with no tally.
- D6: a malformed tally is read as none.
- D7: `STALLED` changes its premise with `MISSED`.
- D8: two counters in the recipe.
- D9: `EnforcementDeadline` gains no member.
- D10: `RevocationTally` lives in `driver.ts`.
- D11: `'not-owned'` from #370's `disconnect` counts as completed, re-read at landing.
- D12: upgrade item 23.
