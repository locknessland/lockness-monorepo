# Plan: the revocation re-check and the ghost sweep report how many units each pass attempted and how many failed, and the enforcement deadline stops counting a pass with failures as a success

**Branch**: `272-revocation-tally` | **Date**: 2026-09-25 | **Backlog item**:
[#384 — Realtime: report per-record failures of the revocation re-check and ghost sweep on the pass metric](https://github.com/locknessland/lockness-monorepo/issues/384)

**This is the feature's one planning document.** The design was settled by the `architect-expert`
disposition on #384 (2026-09-25, hard rule #11), posted on the item. This plan records it as
binding. It adds what the disposition left to the plan: the decision table, the requirements, the
witnesses and mutants in testable form, and the blast radius, **counted on `main` at `32baca7b`**.

Both plan audits are folded in (§10, §11). The `architect-expert` ruled on every finding on
2026-09-25, and its rulings are binding (hard rule #11). They add:

- a repeating failure the real manager can produce, `Connection.close` throwing, for E1 and US2 (A1);
- `EnforcementDeadline.passEnded()`, so an expiry after a pass with failures is `MISSED`, never a
  `STALLED` that blames the port (A2);
- a three-way tally decoder that fails closed on a tally-shaped value with bad counts (A3, S-F1);
- a corrected #370 premise (A4) and a full anchor re-dump after #370 instead of a hand list (A5);
- single homes for rows 2, 6 and 7 (A6);
- `records` renamed `attempts` (A7);
- a cross-instance residue and a rate alert in the recipe (S-F2).

**Implementation waits for #370 / #363** (branch `370-impl`, unmerged), **because both branches edit
the same text** in `manager.ts` (A4). This plan is written against today's `main`; D11 says how the
anchors are re-counted once #370 lands.

**Where the tree, or the plan, adds to the disposition:**

- **D1 (today's anchors).** The disposition names symbols, not lines. On `main` at `32baca7b`:

  | Symbol | Where | What changes |
  | :--- | :--- | :--- |
  | `onRevocationReconcile` (interface) | `driver.ts:612-627` | handler type widens |
  | constructor registration | `manager.ts:1212` | none (the arrow now returns the tally) |
  | `#reassertRoster`'s re-check | `manager.ts:2430-2441` | none (the tally is discarded, §9) |
  | `revokeLocal` | `manager.ts:2929-2940` | reports whether its teardown was fulfilled (D3) |
  | `#applyRevocation` | `manager.ts:3229-3248` | reports whether it completed |
  | `#dispatchRevocation` | `manager.ts:3268-3274` | none (the result is dropped) |
  | `reconcileRevocations` | `manager.ts:3294-3300` | resolves to `RevocationTally` |
  | `#recheckRevocations` | `manager.ts:3331-3376` | counts; its `apply` wrapper reports |
  | `PassSample` | `drivers/redis.ts:1436-1497` | gains `attempts`, `failures`; `outcome` JSDoc amended |
  | `#revocationPass`, `#sweepPass` field types | `drivers/redis.ts:1731-1735`, `:1790` | gain the counts (and, for revocation, the malformed flag) |
  | `onPassComplete` / `#emitPassSample` | `drivers/redis.ts:2422-2515` | the sample carries the counts |
  | `onRevocationReconcile` (driver) | `drivers/redis.ts:3165-3246` | handler type; the bound's JSDoc |
  | `#startRevocationPass` end site | `drivers/redis.ts:3317-3363` | the clean-pass condition (`:3340`), `passEnded()` otherwise |
  | `#runRevocationReconcile` | `drivers/redis.ts:3392-3420` | decodes the tally inside its `try` (`:3397`); the malformed WARN |
  | `#armReconcile` | `drivers/redis.ts:3662-3689` | the sweep record (`:3664`) and its sample |
  | `#sweepInstance` | `drivers/redis.ts:3913-3945` | counts one attempt, and a failure |
  | `REVOCATION_DEADLINE_STALLED` / `_MISSED`, `#missed()` | `drivers/enforcement_deadline.ts:42-57`, `:226-232` | wording (D7) |
  | `EnforcementDeadline` | `drivers/enforcement_deadline.ts:121-285` | one member, `passEnded()`; `#expired()` reads it (D9) |

- **D2 (the counting unit is one apply).** The item says "per record". The disposition says
  `#applyRevocation` reports whether it completed, and the manager calls it once per
  connection revocation and **once per channel pair** (#337: a pair's N records are one leave). So
  `attempted` counts **applies**, and a pair with three stored ids is one unit. Counting stored ids
  would multiply one leave's failure by N, which no operator can act on. A record the ownership
  filter drops (`manager.ts:3355`) is not attempted: it names no socket here.
- **D3 (`revokeLocal`'s contained failure is a failure).** Upheld (A7). `revokeLocal` catches a
  `disconnect` failure itself and WARNs (`manager.ts:2933-2939`), so today that failure never
  reaches `#applyRevocation`. `revokeLocal` therefore reports whether its teardown was
  **fulfilled**: `true` once `disconnect` fulfilled, `false` from its catch. `#applyRevocation`
  returns that. Its other callers (`evict` at `:2910`, and the control-frame `evict` arm, which
  reaches it through `#dispatchRevocation`) drop the result. The hard-close at `:2932` sits
  **outside** that `try`: a `Connection.close` that throws rejects `revokeLocal`, and
  `#applyRevocation`'s own catch reports it (A1).
- **D4 (the counts travel on the in-flight record, as `pages` does).** Upheld. #360 counts pages by
  incrementing the in-flight record (`redis.ts:3105`, `:4028`) and reads them from the start site's
  closure at the end. The counts use the same idiom:
  - **revocation**: `#runRevocationReconcile` decodes what the handler resolved to and writes the
    result onto `#revocationPass`, which is this pass's record while it runs (the slot is freed only
    by its `finally`). The end site reads it from its closure. The failure returns of
    `#runRevocationReconcile` are untouched, so the #308 rows keep their anchors;
  - **sweep**: `#sweepInstance` increments `#sweepPass.attempts` once at its top and
    `#sweepPass.failures` in its failed branch. `#reconcile`'s loop and `#sweepInstance`'s signature
    are untouched, so #355 M2 and #360 M4 keep their anchors.
- **D5 (`attempts` and `failures` are optional on `PassSample`).** Upheld. "Values", in the
  disposition, means numbers carried by the sample, not a third outcome. They are **present on
  every sweep sample** (a failed sweep reports what it reached) and **on a revocation sample whose
  handler resolved to a valid tally**. They are **absent** otherwise: no tally, a malformed tally
  (D6), or a handler that threw. The frozen sample then has no such keys, rather than `undefined`
  values.
- **D6 (the tally is decoded in three ways, and fails closed on bad counts)** (A3, S-F1). One
  decoder, `decodeRevocationTally`, beside the other decoders in `redis.ts`. It **never throws**,
  and resolves the handler's value to exactly one of:
  - **(a) no tally**: `undefined`, or any value that is not tally-shaped (not a non-null object
    carrying an `attempted` or a `failed` property). Silent, and today's behaviour. A `() => void`
    handler can compile and still resolve a stray value, so a stray value is not a breach;
  - **(b) malformed**: a tally-shaped object whose counts are bad: either count missing, not a safe
    integer, negative, or `failed > attempted`. A getter that throws while being read is (b) too.
    **One WARN per pass** (`REVOCATION_TALLY_MALFORMED`), written in `#runRevocationReconcile` —
    never at the end site — in the #391 shape (a `console.warn` that throws becomes one
    `writeMarkedFallback` line). The pass is **not clean**: it does not re-arm the deadline. It
    carries no counts;
  - **(c) a valid tally**.

  The decode runs **inside the existing `try` at `redis.ts:3397`**. The WARN names the pass trigger
  and the contract, never the value.
- **D7 (both deadline lines change their premise).** The disposition rewords `MISSED` to "no pass
  completed without failures". `STALLED` opens with the same clause (`enforcement_deadline.ts:42-45`)
  and would otherwise state the old rule. Both become "no revocation pass completed without
  failures within `revocationTtlSeconds` of the last clean pass's start". `#missed()`'s tail adds
  "or are completing with failures". `SKEWED` is unchanged: it compares two clean passes.
- **D8 (two counters in the recipe).** Upheld. The instrument table gains
  `lockness.realtime.pass.attempts` (unit `{attempt}`) and `lockness.realtime.pass.failures`
  (unit `{failure}`): counters, the same three attributes, recorded only when the sample carries
  counts. The recipe tells operators to **alert on the rate of `failures`**, the only signal
  that sees a failure moving between instances (S-F2). The attribute budget stays at 12
  combinations.
- **D9 (the deadline module gains one member; the clean decision stays at the end site)** (A2). The
  driver decides "clean" at its one end site. A clean pass calls `passSucceeded` as today. **Every
  other settled pass** (`failed`, `ok` with a failure, or `ok` with a malformed tally), while
  `close()` has not begun, calls **`passEnded()`**, which is verdict-free: it records that a pass
  settled since the last clean one. A timer that expires after that writes `MISSED` even when a pass
  is in flight, because the window was broken by passes that ended, not by the one still running.
  `passSucceeded` and `close()` clear it. Without it, a failure run no longer re-arms, so an expiry
  that lands during a healthy pass would write `STALLED` and blame the command port.
- **D10 (`RevocationTally`'s home is `driver.ts`).** Upheld. It is the return type of a
  `BroadcastDriver` hook's handler, so it sits beside that hook, like `ControlRefusal` and
  `RosterDeparture`. The manager imports it from there; `mod.ts` re-exports it. Its JSDoc is the one
  home of what `attempted` and `failed` mean.
- **D11 (#370, corrected)** (A4, A5). `disconnect(id)` already resolves `'not-owned'` on `main`
  (since #332). #363's new `'not-owned'` arises only on the object form, and `revokeLocal` passes the
  id. **`'not-owned'` counts as completed**: nothing is left to apply here. The real #370
  interaction: its teardown loop can stop early on a re-register and still resolve
  `'disconnected'`. That also counts as completed, because a connection record is never cleared
  and reaches the new socket on the next pass. **The wait on #370 stands only because both branches
  edit the same text.** Sequencing: once #370 lands, **re-run the full battery anchor dump** (every
  battery, 42 by then) and re-count §4 from it, before `tasks`. The sites a hand list would miss:
  - `evict` → `revokeLocal` (`manager.ts:2910`);
  - the ownership filter (`:3355`), where K4 anchors;
  - `#applyRevocation`'s catch;
  - `mod.ts`, for the new export;
  - #370's edits to the #359 and #337 test files.
- **D12 (upgrade item 23).** Upheld. Item 23 unless another lands first (1–19 are on `main`; 20–22
  are reserved by in-flight branches). The additive public type is not observable on its own. Two
  things are:
  - the stricter deadline: a deployment whose passes complete with a failure on every pass now sees
    `MISSED` one TTL after its last clean pass;
  - the new `REVOCATION_TALLY_MALFORMED` WARN, once per pass, for a handler resolving a tally-shaped
    value with bad counts.

## 1. Why this exists

#360 gave operators a sample per background pass, and #362 a deadline that says when the
revocation guarantee is broken. Both judge a pass by one word, `outcome`, and `ok` means **the
enumeration completed, not that every record was applied** (`PassSample.outcome`,
`redis.ts:1466-1478`). Both ADRs name the gap: ADR 011 §4, first bullet ("a record whose apply
always throws expires with only its #349 WARN"), and ADR 012 §5 item 8 ("no sample counts
per-record failures").

**Which failures repeat** (A1). The built-in apply paths fail **once by design**:

- `unsubscribe` forgets the member, and `#leaveLocal` drops the membership, **before** the only
  awaits that can throw (`manager.ts:2678`, `:2102`). The next pass finds `'not-subscribed'` and is
  clean;
- `disconnect` forgets the connection even when it throws, so the next pass drops the record as
  foreign.

Such a failure costs one pass of margin (US3), and nothing more. **The failure that repeats is the
hard-close.** `Connection.close` runs outside `revokeLocal`'s `try` (`:2932`). When it throws, the
socket stays open and still owned, the record stays live, and every pass fails on it again. That
is a real access leak:

- each pass is `ok`, so the deadline re-arms every pass, and after `revocationTtlSeconds` the record
  is reaped. The revoked socket keeps its access, and the only trace is one WARN per pass;
- a dashboard of `outcome` shows a healthy line;
- a third-party revocation handler has no such design guarantee at all.

**The ghost sweep has the same shape.** One dead instance whose release keeps failing leaves its
members in every roster (#355 A3 contains the failure). The pass is `ok`, and nothing counts it.

**Who is affected:** every Redis deployment that relies on revocations applying after a lost
control frame, and every operator who alerts on the #360 metric.

## 2. User scenarios

### US1 — an operator sees partial failures on the metric (P1)

**Given** a Redis deployment with `onPassComplete` wired to the #360 recipe
**When** a revocation pass applies 40 revocations and one of them throws
**Then** that pass's sample carries `attempts: 40` and `failures: 1`, with `outcome: 'ok'`, and the
recipe records both on the two new counters.

### US2 — a revoked socket that cannot be closed is reported before its record expires (P1)

**Given** interval 1 s, TTL 10 s, and one local connection revocation whose `Connection.close`
throws on every call
**When** 10 s pass with no pass free of failures
**Then** one `MISSED` line says no revocation pass completed without failures within
`revocationTtlSeconds` of the last clean pass's start. However long it lasts, the episode writes one
line, and it is never `STALLED`.

### US3 — a one-off failure costs margin, not a WARN (P2)

**Given** the same timing, and a channel revocation whose leave rejects once (the roster release
fails)
**When** that pass has a failure and the next is clean (the pair is now `'not-subscribed'`)
**Then** no deadline line is written. The deadline stays anchored at the last clean pass's start,
so the one failure consumed one pass of margin.

### US4 — the ghost sweep counts dead instances (P2)

**Given** two dead instances, one of whose release throws
**When** the sweep runs
**Then** its sample carries `attempts: 2`, `failures: 1`, `outcome: 'ok'`. With no dead instance it
carries `attempts: 0`, `failures: 0`.

### US5 — a third-party manager is unaffected, unless its counts are wrong (P2)

**Given** an application that registers its own `onRevocationReconcile` handler
**When** it resolves nothing, or a stray value that is not tally-shaped
**Then** its samples carry no counts, no line is written, and the deadline behaves as today.
**When** it resolves a tally-shaped value with bad counts
**Then** one WARN per pass names the contract, the sample carries no counts, and the pass does not
re-arm the deadline.

### Edge cases

- **Foreign records** the ownership filter drops are not attempted (D2).
- **A channel pair with several stored ids** is one unit (D2).
- **A clear failure** after a successful leave is not a failure: the revocation was applied, and
  only the record outlives it (§9 residue). Pinned by T6.
- **The apply's own WARN throws** (a log sink refusing the line): the `apply` wrapper's catch
  counts it as failed, and the loop goes on (#349). T4.
- **The re-check handler throws** (a page read failed): no tally exists, the pass is `failed` as
  today, and the #308 retry runs as today. The sample has no counts (D5).
- **A getter on the resolved value throws**: malformed (D6 b), never a failed pass, and never a
  #308 retry. R3b.
- **A deadline that expires during a healthy pass after passes with failures** writes `MISSED`, not
  `STALLED` (D9). R9.
- **`disconnect(id)` resolves `'not-owned'`**, or #370's loop stops early and resolves
  `'disconnected'`: completed (D11).
- **A sweep that fails mid-pass** (a liveness probe throws after one instance was swept) reports
  `outcome: 'failed'` with the counts it reached. S4.
- **A sweep of an instance that renews itself, or is cut short by `close()`**, is attempted and not
  failed: only `#sweepInstance`'s catch is a failure (disposition). S3.
- **The lapse run's re-check** (#349) resolves to a tally too; `#reassertRoster` discards it. Its
  failures are not on any sample (§9 residue).
- **A client whose failing record follows it between instances** never breaks one instance's
  window (§9 residue, S-F2).
- **`close()` mid-pass**: the end site's `#closing` gate and `#emitPassSample`'s are unchanged, so
  nothing new is reported after close, and `passEnded()` is not called.

## 3. Requirements

**The tally (manager)**

- **FR-001** `RevocationTally` is an exported interface, `{ readonly attempted: number; readonly
  failed: number }`, declared in `packages/realtime/driver.ts` and re-exported from `mod.ts`. Its
  JSDoc is the one home of what each count means (D2, D10). No `any`.
- **FR-002** `BroadcastDriver.onRevocationReconcile`'s handler type becomes
  `() => RevocationTally | void | Promise<RevocationTally | void>`. The JSDoc says a handler may
  resolve to a tally, that a driver may report it, and that resolving to nothing is conforming.
  Drivers still call the handler with no argument.
- **FR-003** `revokeLocal` resolves `true` once `disconnect` **fulfilled** (`'disconnected'` or
  `'not-owned'`, D11) and `false` from its catch, after its WARN (D3). The hard-close stays outside
  the `try`. Its other callers drop the value.
- **FR-004** `#applyRevocation` resolves `true` when the apply completed and `false` from its catch,
  after its WARN. The connection branch returns `revokeLocal`'s result, and a `revokeLocal`
  rejection (the hard-close threw) reaches the catch; the channel branch returns `true` once
  `#revokeChannelLocal` resolved, **whatever its `clearFailed`**.
- **FR-005** `#recheckRevocations` counts: `attempted` once per call of its `apply` wrapper, `failed`
  once per wrapper call that got `false` or reached its catch. It resolves `{ attempted, failed }`
  after the last group. Nothing is counted before the ownership filter (`manager.ts:3355`).
- **FR-006** `reconcileRevocations` resolves to that tally. Its tail
  (`run.then(() => {}, () => {})`) is unchanged, and it still rejects when the run rejects.

**The sample (driver)**

- **FR-007** `PassSample` gains `readonly attempts?: number` and `readonly failures?: number`. Its
  JSDoc is the one home of what they mean, per pass: the unit (revocation: one apply, as
  `RevocationTally` defines it; sweep: one dead instance `#sweepInstance` was called for), the
  failure (revocation: the tally's `failed`; sweep: one run of `#sweepInstance`'s catch), and when
  they are absent (D5). `outcome`'s JSDoc drops "no sample counts such failures" and links them.
- **FR-008** `#runRevocationReconcile`, inside its existing `try`, passes the handler's resolved
  value to the decoder (FR-009) and writes the result onto `#revocationPass`: the counts for (c),
  the malformed flag for (b), nothing for (a). For (b) it writes one `REVOCATION_TALLY_MALFORMED`
  WARN in the #391 shape. Its failure paths and their returns are unchanged, and it still returns
  `'ok'` for (a), (b) and (c).
- **FR-009** One decoder, `decodeRevocationTally(value: unknown): RevocationTally | 'malformed' |
  undefined`, in `redis.ts` beside the other decoders (D6). It never throws: its reads sit in its own
  `try`, and a throw is `'malformed'`.
- **FR-010** The sweep's record, built once in `#armReconcile`'s callback, is
  `{ startedAt, pages: 0, attempts: 0, failures: 0 }`. `#sweepInstance` increments `attempts` as its
  first statement and `failures` as the first statement of its failed branch, **before** the WARN,
  so a throwing sink cannot skip the count. Both through `if (this.#sweepPass)`, the `pages` idiom.
- **FR-011** `#emitPassSample` takes the counts from the start site's closure (the record), never
  from the fields, and adds `attempts` and `failures` to the frozen sample **only when both are
  defined**. Both end sites pass them.

**The deadline**

- **FR-012** The revocation end site decides **clean**: `outcome === 'ok'`, no malformed flag, and
  `(pass.failures ?? 0) === 0`. While `close()` has not begun, a clean pass calls `passSucceeded` and
  every other settled pass calls `passEnded()` (D9). `?? 0` is today's behaviour for a pass with no
  tally (US5).
- **FR-013** `REVOCATION_DEADLINE_MISSED` and `REVOCATION_DEADLINE_STALLED` state the premise as "no
  revocation pass completed without failures within `revocationTtlSeconds` of the last clean pass's
  start" (D7). `#missed()`'s tail names passes completing with failures. `SKEWED` is unchanged.
- **FR-014** `EnforcementDeadline` gains exactly one member, `passEnded(): void`, and one private
  flag. `passEnded()` sets the flag; `passSucceeded` (as its first statement, above
  `const previous`) and `close()` clear it; `#expired()` returns `MISSED` when no pass is in flight
  **or** the flag is set. `arm()` is untouched. The module JSDoc says "clean pass" where it says
  "successful pass". The `#startRevocationPass` JSDoc (#362 row 8's home) names both calls.

**Tests, battery, docs**

- **FR-015** Witnesses T1–T8, R1–R9, S1–S4 and E1 (§4), red first where marked.
- **FR-016** Mutants K1–K22 (§4), battery `packages/realtime/tests/mutations/revocation_tally_384.ts`,
  each proven live under its killing witness.
- **FR-017** The 8 re-anchored and 1 re-verified battery rows (§4 blast radius); no row deleted.
- **FR-018** Docs:
  - ADR 011 §2 "One deadline": "a failed pass leaves it alone" → "a pass that is not clean leaves
    it alone, and tells it so (`passEnded`)"; §3 gains the rejected options of the disposition and
    of A2/A3; §4's first bullet is replaced by what now holds: the built-in apply failures happen
    once and cost one pass of margin, the hard-close failure repeats and is now reported, and the
    §9 residue;
  - ADR 012 §5 item 8 is replaced: the sample counts per-unit failures; what "failure" does not
    mean is linked to `PassSample`; S-F2's residue is added;
  - `docs/observability-and-crypto.md` § Framework instruments: the table's two rows, the
    attribute note, and the recipe records both counters when `sample.failures !== undefined`, and
    says to alert on the rate of `failures` (D8);
  - `docs/realtime.md`: the "Measuring the passes" paragraph (`:1989-1998`) names the counts; the
    deadline paragraph names a clean pass; upgrade item 23 names the stricter deadline and the
    `REVOCATION_TALLY_MALFORMED` line (D12);
  - `packages/realtime/README.md` (`:247-250`), `packages/realtime/AGENTS.md` (the exports table,
    `:58`, and the pass-sample row, `:81-89`);
  - JSDoc: `RevocationTally`, the interface hook, the driver hook, `PassSample`, `onPassComplete`'s
    example, `#emitPassSample`, `#startRevocationPass`, `#runRevocationReconcile`, the decoder,
    `REVOCATION_TALLY_MALFORMED`, `#sweepInstance`, `revokeLocal`, `#applyRevocation`,
    `#recheckRevocations`, `reconcileRevocations`, the deadline module, `passEnded` and both
    constants.
  - No `CHANGELOG` file: #364 tracks the missing root changelog.

## 4. Success criteria

- **SC-001**: Every revocation pass and every ghost sweep that completes reports how many units it
  attempted and how many failed, whenever the counts are known.
- **SC-002**: A revoked socket that cannot be closed is reported **before** its record's TTL runs
  out, once per episode, without blaming the command port.
- **SC-003**: A single failed apply among clean passes produces no deadline warning.
- **SC-004**: An application whose re-check reports no counts sees no change at all, on samples or on
  the deadline.
- **SC-005**: No new broker round trip. The only new log line is `REVOCATION_TALLY_MALFORMED`, at
  most once per pass and only for a handler resolving a tally-shaped value with bad counts; the two
  deadline lines are reworded.

**Witnesses**, in `packages/realtime/tests/revocation_tally_384.test.ts`. "Red" means failing on
`main` at `32baca7b`. Test names start `#384 T<n> `, `#384 R<n> `, `#384 S<n> ` or `#384 E<n> `
with a trailing space. **Every manager witness fails through a real path** (A1): a driver whose
roster release rejects, or a `Connection.close` that throws; never a stubbed `unsubscribe`.

| # | Setup → assertion |
| :--- | :--- |
| T1 (red) | manager over an in-memory revocation store listing, for local sockets, 2 connection revocations and 1 channel pair with 2 ids → `reconcileRevocations()` resolves `{ attempted: 3, failed: 0 }`. Today it resolves `undefined` |
| T2 (red) | as T1, the pair's roster release rejects once → `{ attempted: 3, failed: 1 }`, both connection revocations applied; **the next call** resolves `{ attempted: 3, failed: 0 }` (the pair is `'not-subscribed'`) |
| T3 (red) | one connection revocation whose `disconnect` rejects (its release rejects) → `{ attempted: 1, failed: 1 }`, the socket closed 4403 anyway; the next call resolves `{ attempted: 0, failed: 0 }` (the record is now foreign) |
| T4 (red) | `console.warn` throws inside `#applyRevocation`'s catch → the wrapper counts it: `failed: 1`, and the next revocation is still applied |
| T5 (pin) | 2 foreign records and 1 local → `attempted: 1` |
| T6 (pin) | a channel revocation whose leave succeeds and whose `clearRevocation` rejects → `failed: 0` |
| T7 (pin) | `listRevocations` rejects → `reconcileRevocations()` rejects with it; no tally |
| T8 (red) | one connection revocation whose `Connection.close` throws → `{ attempted: 1, failed: 1 }` on **three consecutive calls**; the connection stays registered |
| R1 (red) | Redis driver, handler resolves `{ attempted: 4, failed: 1 }` → the revocation sample has `attempts: 4`, `failures: 1`, `outcome: 'ok'` |
| R2 (pin) | handler resolves `undefined` → the sample has neither key (`'attempts' in sample` is false) |
| R3a (pin) | not tally-shaped: the handler resolves, in turn, `'x'`, `42`, `null`, `[]` and `{}` → no counts, **no** WARN, and no deadline line in 30 s at interval 1 000, TTL 10 |
| R3b (red) | tally-shaped, bad counts: `{ attempted: 1, failed: 2 }`, `{ attempted: -1, failed: 0 }`, `{ attempted: 1.5, failed: 0 }`, `{ attempted: '4', failed: 0 }`, `{ attempted: 1 }`, and an object whose `attempted` getter throws, each resolved on every pass in its own run → **one** `REVOCATION_TALLY_MALFORMED` line per pass, no counts, `outcome: 'ok'`, no #308 retry, and one `MISSED` line at 10 s |
| R4 (red) | interval 1 000, TTL 10; `performance.now` on `time.now`; handler resolves `{ 1, 1 }` every pass → exactly one `REVOCATION_DEADLINE_MISSED` line at 10 s. Today there is none |
| R5 (red) | as R4, handler resolves `{ 5, 1 }` every pass → the same one line (a partial failure blocks the re-arm) |
| R6 (pin) | as R4, every pass clean except the one starting at 3 s → no line in 30 s |
| R7 (pin) | as R4, handler resolves `undefined` → no line in 30 s (today's behaviour) |
| R8 (red) | the R4 line contains `without failures` and `last clean pass's start`; a `STALLED` line (a page held past TTL, no pass ended since the last clean one) contains the same premise |
| R9 (red) | as R4, but each pass's handler is held 600 ms, so a pass is in flight at 10 s → the line is **`MISSED`**, never `STALLED` |
| S1 (red) | two dead instances, the first's `#sweepOwned` throws → the sweep sample has `attempts: 2`, `failures: 1`, `outcome: 'ok'`. S1b: the same with `console.warn` throwing → still `failures: 1` |
| S2 (red) | no dead instance → `attempts: 0`, `failures: 0` |
| S3 (red) | a dead instance that renews itself mid-sweep → `attempts: 1`, `failures: 0` |
| S4 (red) | one dead instance swept, then the next `EXISTS` throws → `outcome: 'failed'`, `attempts: 1`, `failures: 0` |
| E1 (red) | a `ChannelManager` over the Redis driver, one local connection revocation whose `Connection.close` throws on every call → every revocation sample carries `failures: 1`, the connection stays registered, and exactly one `MISSED` line lands at TTL |
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
| K7 | the decoder accepts `failed > attempted` | R3b |
| K8 | the decoder's safe-integer check weakened to `typeof === 'number'` | R3b |
| K9 | `#emitPassSample` adds the keys when the counts are `undefined` | R2 |
| K10 | the clean clause dropped from the end site | R4 |
| K11 | the all-failed rule: `(pass.failures ?? 0) < (pass.attempts ?? 1)` | R5 |
| K12 | `?? 0` → `?? 1` (a pass with no tally never re-arms) | R7 |
| K13 | `#sweepInstance`'s failure not counted | S1 |
| K14 | the sweep failure counted after the WARN instead of before | S1b |
| K15 | the sweep's `attempts` counted in `#reconcile` for every live instance | S1 |
| K16 | `renewed` counted as a failure | S3 |
| K17 | the `MISSED` premise reverted | R8 |
| K18 | `passEnded()` a no-op (A2) | R9 |
| K19 | a malformed tally treated as clean: the malformed flag dropped from the end site | R3b (the `MISSED` line) |
| K20 | a WARN for every value that is not `undefined` (the rejected S-F1 shape) | R3a |
| K21 | the decoder's own `try` removed: a throwing getter fails the pass | R3b (the getter case) |
| K22 | the malformed WARN written at the end site, after the trailing pass starts | R3b (one line per pass, in order) |

**Blast radius: existing battery rows.** Counted on `main` at `32baca7b`. A stub harness dumped
every row of 37 of the 41 batteries under `packages/realtime/tests/mutations/`: **480 anchors, each
matching exactly once today.** `live_conformance_285`, `self_skip_310` and `sweep_parse_316` import
the live-broker helper and `presence_member_frozen_354` imports `MutantGuard`, so those four were
grepped by hand: none anchors in an edit zone. **72 rows in 11 batteries** (79 anchors) sit in or
beside the zones of D1. **The whole dump is re-run once #370 lands** (D11); these counts are
provisional until then.

- **Re-anchored (8), DEAD otherwise; never deleted:**
  - `pass_sample_360` M5, M7, M8, through `REVOCATION_EMIT` (`redis.ts:3347-3354`) and its
    `revocationEmit` helper: the call gains the counts argument (FR-011);
  - `pass_sample_360` M18, through `SWEEP_FINALLY` (`:3669-3681`): same;
  - `pass_sample_360` M14 (`:3664`, the sweep record literal): it gains `attempts: 0, failures: 0`
    (FR-010);
  - `revocation_pass_bound_362` N11, N13, N15 (`:3340`, `if (outcome === 'ok' && !this.#closing) {`):
    the clean clause joins it, and an `else` calls `passEnded()` (FR-012). Each mutant keeps its
    meaning over the new condition.
- **Re-verified (1):** `lapse_rehold_349` M27 anchors the wrapper's WARN tail
  (`manager.ts:3338-3340`), which FR-005 follows with a `return false`. The anchor still matches
  once, and its `throw error` lands before that return; re-proven live.
- **Unchanged (63)**, provided FR-003, FR-005, FR-008, FR-010, FR-011 and FR-014 insert where they
  say:
  - `pass_sample_360` (14): M4 (`:3913`), M6 and M21 (`#reconcile`), M9, M10, M11, M13 (four
    edits: the `): void {` + gate, the adoption, and both calls' first two lines), M15, M16, M17
    (`:3917-3920`), M19, M20, M22, M23 — the counts parameter goes into `#emitPassSample`'s list,
    and the freeze adds keys after `pages`;
  - `revocation_pass_bound_362` (16): N10, N12, N14, N17, N19, N20, N25–N34 — `arm()` is untouched,
    and `passSucceeded`'s new first statement sits above N12's `const previous` anchor;
  - `reconcile_single_pass_355` (8): M1, M2, M12a, M13, M17, M18, M22, M25 — `#reconcile`'s loop
    and `#sweepInstance`'s signature are untouched;
  - `revocation_paging_359` (7): M13, M14, M16, M17 (two anchors), M19, M20, M22;
  - `marked_fallback_391` (4): S3, S4, S6 (two anchors), S7;
  - `revocation_retry_308` (4): all four — `#runRevocationReconcile`'s failure paths are untouched
    (FR-008);
  - `lapse_rehold_349` (4): M19, M20, M21, M33 — `#reassertRoster` is untouched;
  - `channel_revoke_332` (2), `log_encoding_291` (2: `revokeLocal`'s WARN, above FR-003's return),
    `apply_revocation_376` (1: M1, the `.catch` on a `Promise<boolean>`), `sweep_paging_358` (1: M9).
- **Nothing anchors** in `#expired()` (`enforcement_deadline.ts:224-226`) or `close()`, the two
  other sites FR-014 edits.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| 1. What `attempted` and `failed` mean (one apply; a pair is one; foreign records are not attempted) | the `RevocationTally` JSDoc, `packages/realtime/driver.ts` | the meaning restated on `PassSample`, in ADR 011/012, `realtime.md` or the recipe instead of linked; a count of stored ids |
| 2. An apply completed, or failed | `#applyRevocation`'s resolved boolean, `packages/realtime/manager.ts` | a failure inferred from a WARN; a second verdict in `#recheckRevocations`; `clearFailed` counted as a failure |
| 3. The tally is counted | `#recheckRevocations`'s `apply` wrapper, `packages/realtime/manager.ts` | a count in `#applyRevocation` or in the driver; a count before the ownership filter; a counter argument passed to the handler |
| 4. A handler may resolve to a tally, or to nothing | the `onRevocationReconcile` handler type, `packages/realtime/driver.ts` (the Redis driver's signature repeats the type, not the rule) | a new hook; a manager-side metric seam; a second handler registration |
| 5. What a resolved value is: no tally, malformed, or a tally; and that the decode never throws | `decodeRevocationTally`, `packages/realtime/drivers/redis.ts` | a cast; a check at the end site; a second decoder in the manager; a WARN for every non-`undefined` value; a malformed tally that re-arms |
| 5a. The malformed WARN: once per pass, #391 shape, naming no value | `REVOCATION_TALLY_MALFORMED` and its one write in `#runRevocationReconcile`, `packages/realtime/drivers/redis.ts` | a write at the end site; a bare `console.warn`; the value rendered into the line |
| 6. The counts reach the sample from the start site's closure, never from a field | the `#emitPassSample` JSDoc, `packages/realtime/drivers/redis.ts` (the #360 rule for `pages`, widened) | a field read at the end site; a counts field on the driver; a return value threaded through `#reconcile` |
| 7. A sweep attempt and a sweep failure are counted | `#sweepInstance`, `packages/realtime/drivers/redis.ts` (counting only; the meaning is row 8's) | a count in `#reconcile`'s loop; a failure inferred from `SweepEnd` outside the catch |
| 8. What each sample field means, per pass (the units, the failures), and when the counts are absent | the `PassSample` JSDoc, `packages/realtime/drivers/redis.ts` | the rule restated in `#emitPassSample`, `#sweepInstance`, ADR 012, the recipe or `realtime.md`; `renewed` or `closed` as failures |
| 9. The deadline re-arms only on a clean pass (`ok`, no malformed tally, no failure; no tally counts as none), and every other settled pass calls `passEnded()` | the end site's condition in `#startRevocationPass`, `packages/realtime/drivers/redis.ts` (its JSDoc is #362 row 8's home) | a check in `EnforcementDeadline`; a `passFailed(verdict)` method; an all-failed rule; a clean flag on `PassOutcome`; `outcome` rewritten to `'failed'` on a failure |
| 10. What the deadline lines say, and that an expiry after a settled non-clean pass is `MISSED` | `REVOCATION_DEADLINE_MISSED` / `_STALLED` and `#expired()` reading the `passEnded` flag, `packages/realtime/drivers/enforcement_deadline.ts` | the text inlined in `redis.ts` or a test; the old premise left in one of the two; a hedged `STALLED` text; a filter in the driver's `inFlight` closure |
| 11. The two counters' names, kind, unit and attributes, and the rate alert | the instrument table and recipe, `docs/observability-and-crypto.md` | a name in code; a second list in `realtime.md` or README |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2 · **Primary dependencies**: `@lockness/realtime` only; no
new edge · **Storage**: none; two numbers and a flag on each in-flight pass record, one flag in the
deadline · **Testing**: `deno test`; FakeTime plus a stubbed `performance.now`; FakeRedis; the shared
mutation harness · **Target**: server library · **Project type**: framework package ·
**Performance**: two increments per unit, one decode per revocation pass; zero broker round trips ·
**Constraints**: no wire, control-frame or options change; the handler is still called with no
argument · **Scale**: counts are per pass; the attribute set is unchanged.

### Domain model

- **Bounded context**: realtime (the manager's revocation re-check and the Redis driver's passes).
- **Vocabulary**:
  - *apply*: one call of `#applyRevocation`, for a connection revocation or a channel pair;
  - **tally**: `{ attempted, failed }` for one re-check run;
  - **malformed tally**: a tally-shaped value with bad counts;
  - *attempt*: what `attempts` counts (an apply; a dead instance);
  - *failure*: an apply that threw, `revokeLocal`'s teardown and hard-close included; one run of
    `#sweepInstance`'s catch;
  - **clean pass**: a completed pass with no failure and no malformed tally. Only a clean pass
    re-arms the deadline;
  - **ended pass**: any other settled pass; it tells the deadline so, without a verdict.
- **Entities**: `ChannelManager` (owns the re-check and its tally); `RedisBroadcastDriver` (owns the
  pass records, the decode, the sample and the deadline calls); `EnforcementDeadline` (owns the
  timer and which line an expiry writes).
- **Value objects**: `RevocationTally`; `PassSample` (widened); the pass records (widened).
- **Invariants**:
  - `0 ≤ failed ≤ attempted`, integers, for every tally that reaches a sample;
  - `outcome` keeps its #360 meaning: whether the pass itself stopped;
  - a pass that is not clean never re-arms the deadline;
  - an expiry never names a pass as stalled when a pass ended since the last clean one;
  - a handler that resolves nothing, or a stray value, changes nothing.
- **Out of scope**: the lapse run's re-check counts, clear failures, whether the socket stayed
  subscribed, a durable per-record failure streak (all §9); #370/#363's `disconnect` change, which
  this waits for.

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
| Design decisions go to architect-expert | pass | the disposition and the audit rulings are binding (§10, §11) |
| Product decisions go to the user | pass | none raised (§12) |
| Act, don't recommend | pass | both audits folded; S-F2's full fix is named as residue |
| TDD, red first | pass | 16 red witnesses; T5–T7, R2, R3a, R6, R7 are pins |
| No silent catches | pass | every new `false` follows the existing WARN; the decoder's catch yields `'malformed'`, which WARNs |
| Domain Model gate | pass | §6 |
| #360: the library never judges a performance value | pass | a failure is a fact, not a threshold |
| #369/#391: no log-sink failure escapes | pass | the malformed WARN uses the #391 shape |

### Complexity tracking

No violation. Added: one exported interface, one private decoder and its WARN constant, two
optional sample fields, record fields, one deadline member and flag, one widened hook type, two
boolean returns, one condition with an `else`, two reworded constants, two documented instruments.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` public API | yes, additive | `RevocationTally` exported; `PassSample.attempts` / `.failures`; the hook's handler type widens (a void handler still conforms) |
| `BroadcastDriver` implementers | no | they still call `handler()`; they may ignore the result |
| `onRevocationReconcile` handlers (third party) | optional | may resolve to a tally; a tally-shaped value with bad counts now WARNs and blocks the re-arm |
| Logs | yes | `MISSED` and `STALLED` reworded; `MISSED` fires for a failure run of any size, and after a non-clean pass instead of `STALLED`; `REVOCATION_TALLY_MALFORMED` is new (upgrade item 23) |
| Metrics recipe | yes | two counters and a rate alert |
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
| A deployment with a revoked socket that cannot be closed now sees `MISSED` every TTL window | Intended: that socket kept its access silently. Upgrade item 23 says so; the per-apply WARN precedes it |
| A third-party handler resolving a tally-shaped value with bad counts now WARNs every pass and never re-arms | Intended (A3): it fails closed on a value that claims to be a tally. A stray non-tally value stays silent. Upgrade item 23 names the line |
| #370 edits the same text and moves every manager anchor | Implementation waits; the full anchor dump is re-run after it lands (D11) |
| An existing suite whose re-check fails one apply per pass now sees a deadline line | The full realtime suite runs before the first edit and after it; a new line is examined, never silenced |
| A battery row goes DEAD | §4 lists all 72 zone rows; FR-017 re-anchors 8; the dump is re-run after #370 |
| **Residue: the lapse run's re-check** counts are discarded by `#reassertRoster` | Accepted (disposition). That run's failures stay their WARNs |
| **Residue: a failure means the apply threw**, not that the socket stayed subscribed. An apply that resolves without effect counts as done | Accepted (disposition) |
| **Residue: clear failures** are not counted; the record is re-applied until its TTL | Accepted (disposition); T6 pins it |
| **Residue: a handler resolving nothing, or a stray value,** gets no counts and today's deadline | Accepted (disposition, A3 case a); R2, R3a and R7 pin it |
| **Residue: a failed pass has no counts.** A handler that threw produced no tally | Accepted; `outcome: 'failed'` already reports it |
| **Residue: a pass that stalls after a non-clean pass is reported `MISSED`, not `STALLED`** | Accepted (A2): the window was already broken by passes that ended, and one episode is one line |
| **Residue (S-F2): a failing record whose client moves between instances on every interval** never breaks one instance's window, so no deadline fires anywhere | Accepted. The recipe tells operators to alert on the rate of `failures`, which sees it. The only full fix is a durable per-record failure streak, which is a record-format change and out of scope |
| **Rejected: `failed` outcome when all records fail.** Conflates an unreadable store with a refused apply, triggers the #308 retry for a pass that read fine, and hides every partial failure | Recorded in ADR 011 §3 |
| **Rejected: a manager-side seam or a new hook.** Two samples an operator must join, and the deadline cannot see either | Recorded in ADR 012 §3 |
| **Rejected: a counter argument to the handler.** Third-party drivers call `handler()` with no argument, so the counts would silently never arrive | Recorded in ADR 012 §3 |
| **Rejected: inferring failures from `clearRevocation`.** Incomplete: a connection revocation is never cleared, and a clear failure is not an apply failure | Recorded in ADR 011 §3 |

## 10. Architecture audit

*`architect-expert`, against this document before any code (verdict as relayed: **fail, 1 HIGH**).
Its rulings are **binding** (hard rule #11), folded 2026-09-25.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 (HIGH) | E1 and US2 could not happen with the real manager: `unsubscribe` forgets the member and `#leaveLocal` drops the membership before the only awaits that can throw (`manager.ts:2678`, `:2102`), and `disconnect` forgets the connection even when it throws. The next pass is `'not-subscribed'` (clean) or the record is dropped as foreign | Plan changed. E1 and US2 are rebuilt on `Connection.close` throwing on every pass: it sits outside `revokeLocal`'s `try` (`:2932`), so the socket stays open and owned, a real access leak. §1 and FR-018's ADR 011 §4 text state that the built-in apply failures happen once by design and cost one pass of margin (US3). T2 and T3 now fail through a real path and pin the clean next pass; T8 pins the repeat. **Rejected:** stubbing `unsubscribe`, which tests an unreachable path |
| A2 (MEDIUM) | D7/D9: `#expired()` writes `STALLED` whenever a pass is in flight. Now that a pass with failures does not re-arm, an expiry during a healthy pass would blame the port | Plan changed. One verdict-free member, `passEnded()`, called by the end site for every settled pass that is not clean; afterwards `#expired()` writes `MISSED` (FR-012, FR-014, row 10). D9 becomes "one member; the clean decision stays at the end site". Witness R9; mutant K18. **Rejected:** hedging the `STALLED` text; a filter in the `inFlight` closure |
| A3 (MEDIUM) | D6: a malformed tally read as "no tally" is clean, so bad counts re-arm the deadline | Plan changed. The three-way decoder (D6, FR-008, FR-009, rows 5 and 5a): (a) not tally-shaped → silent, today's behaviour, since a `() => void` handler can resolve a stray value; (b) tally-shaped with bad counts, or a throwing getter → one WARN per pass in the #391 shape, written in `#runRevocationReconcile`, not clean, no counts; (c) valid. The decoder never throws and runs inside the `try` at `:3397`. R3 split into R3a and R3b; SC-005 and upgrade item 23 name the line. Mutants K19–K22. **Rejected:** silent no-tally for every bad value; a WARN for every non-`undefined` value; a WARN that still re-arms |
| A4 (MEDIUM) | D11's premise was wrong: `disconnect(id)` already returns `'not-owned'` on `main` (since #332); #363's `'not-owned'` arises only on the object form, which `revokeLocal` does not use | Plan changed. D11 rewritten; the "back to the architect" contingency deleted. `'not-owned'` counts as completed. The real #370 interaction, a teardown loop stopping early on a re-register and resolving `'disconnected'`, also counts as completed: the record is never cleared and reaches the new socket next pass. The wait on #370 stands only because both branches edit the same text |
| A5 (LOW) | The hand-made re-count list misses sites | Plan changed. After #370 lands, the full battery anchor dump (42 batteries) is re-run. D11 names the sites the list missed: `evict` → `revokeLocal` (`:2910`), the ownership filter (`:3355`, K4), `#applyRevocation`'s catch, `mod.ts`, and #370's edits to the #359/#337 test files |
| A6 (LOW) | Rows 2, 6 and 7 had two homes or a misplaced meaning | Plan changed. Row 6's one home is the `#emitPassSample` JSDoc. Row 7's meaning moves to row 8 (`PassSample`); `#sweepInstance` homes only the counting. Row 2's second home is dropped |
| A7 (LOW) | `records` misnames what is counted (applies and dead instances) | Plan changed. `attempts`; the counter is `lockness.realtime.pass.attempts`, unit `{attempt}`. **Rejected:** keeping the name with a caveat |
| — | D3, D4, D5, D8, D10, D12 | **Upheld.** D3's FR-003 says "fulfilled", not "settled", and the control-frame path reaches `revokeLocal` through `#dispatchRevocation` |

## 11. Security audit

*`security-expert`, in parallel with the architecture audit (verdict as relayed: **needs_followup,
0 CRITICAL, 0 HIGH**). Its findings were ruled on by the `architect-expert`; the rulings are
binding.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S-F1 (MEDIUM) | A malformed tally reads as clean, so a handler reporting bad counts re-arms the deadline | Covered by A3: the decoder fails closed for a tally-shaped value with bad counts. The security seat proposed failing closed on **any** value that is not `undefined`; the architect narrowed it to tally-shaped values, because a `() => void` handler can resolve a stray value. Witnesses R3a (the narrowing) and R3b; mutants K19 and K20 |
| S-F2 (LOW) | A failing record whose client moves between instances on every interval never breaks one instance's window, so no per-instance deadline fires | Residue (§9). The D8 recipe tells operators to alert on the rate of `failures`. The only full fix is a durable per-record failure streak, which is a record-format change |
| — | Checked clean | D3 and D11 hold; the counts cannot be influenced by an attacker; no identifier or cardinality is exposed (the WARN names no value, the counters add no attribute); no new escape path (the #391 shape); DoS is bounded to one line per episode, and the malformed WARN to one per pass |

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Approve the architecture as audited (tasks → implement → review, after #370 lands)? | _Asked at stop 1._ | — |

No product question is open: the stricter deadline is the disposition's acceptance rule ("any
failure" replaces "all failed"), and every audit finding was an engineering call the
`architect-expert` ruled on.

### Decided without asking

- The design is the #384 `architect-expert` disposition (2026-09-25), binding under hard rule #11,
  as amended by the audit rulings A1–A7 and S-F1/S-F2 (2026-09-25).
- D2: one unit is one apply; a pair is one unit.
- D3: `revokeLocal`'s contained teardown failure counts as a failure; the hard-close failure reaches
  `#applyRevocation`'s catch.
- D4: the counts travel on the in-flight record, as `pages` does.
- D5: the counts are optional on `PassSample`, absent without a valid tally.
- D6: the three-way decoder (A3).
- D7: `STALLED` changes its premise with `MISSED`.
- D8: two counters and a rate alert in the recipe.
- D9: `EnforcementDeadline` gains `passEnded()` only (A2).
- D10: `RevocationTally` lives in `driver.ts`.
- D11: `'not-owned'` and #370's early-stopping `'disconnected'` count as completed; the anchor dump is
  re-run after #370.
- D12: upgrade item 23.
