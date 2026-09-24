# Plan: the Redis driver reports how long each ghost sweep and revocation re-check took, and how many pages it read, to a handler the application wires to its metrics

**Branch**: `269-pass-duration-metric` | **Date**: 2026-09-24 | **Backlog item**:
[#360 — Realtime: expose a pass-duration metric (duration, pages) for the Redis driver's ghost sweep and revocation re-check](https://github.com/locknessland/lockness-monorepo/issues/360)

**This is the feature's one planning document.** The design was settled by the `architect-expert`
disposition on #360 (2026-09-23, hard rule #11): an `onPassComplete` seam on the Redis driver, a
frozen `PassSample` per completed pass, and a `getMeter` export in `@lockness/telemetry` for a
documented OpenTelemetry recipe. This plan records it as binding. It adds what the disposition left
to the plan: the decision table, the requirements, the witnesses and mutants in testable form, and
the blast radius, **counted on `main` at `f697c100`**. That tree includes #362, which the
disposition was written before.

Both plan audits are folded in (§10, §11). The `architect-expert` ruled on every finding on
2026-09-24, and its rulings are binding (hard rule #11). They add:

- a final `.catch` on the sweep chain (A1);
- one home per row (A2);
- the definition of `ok` (S1);
- reply decoders for the instance-set read and `EXISTS`, with upgrade item 19 (S2);
- the promise containment's exact shape (S3).

**Where the tree, and #362, change the disposition** (it was anchored at `c00bfcde`):

- **D1 (anchors moved).** #361, #362 and #369 moved every `redis.ts` anchor the disposition gives.
  Today's anchors:

  | Disposition | Today | What |
  | :--- | :--- | :--- |
  | `:2042` | `:2163` | `onControlRefused` |
  | `:2603-2664` | `:2729-2791` | `listRevocations` (page loop `:2745-2787`) |
  | `:2807` | `:2961-2972` | `#startRevocationPass`, its one start site |
  | `:2817-2825` | `:2976-2990` | the pass's `.finally` end site (`.catch` `:2991-2996`) |
  | `:3109-3114` | `:3283-3292` | `#armReconcile` |
  | `:3214` | `:3390-3394` | `#reconcile`'s catch |
  | `:3670` | `:3850` | `close()`'s `await this.#reconcilePass` |
  | `:1706-1711` | `:1820-1822` | the epoch `now()` |

  **Unchanged:**
  - the manager's serial tail, `manager.ts:3247-3253`;
  - `middleware.ts:33`;
  - ADR 008 `:160-162`;
  - ADR 009 `:177` and `:217-220`.

  **Moved in the docs:**
  - `docs/realtime.md:595-623` → **`:658-690`** (the refusal recipe);
  - `:605` → **`:671`** (`metrics.increment`);
  - `deps.policy.jsonc:104-116` → **`:104-117`**.

  `ARM_TIMER` is `mutations/reconcile_single_pass_355.ts:69-75` (§4).
- **D2 (one clock, already landed).** The disposition asks for "the monotonic `{startedAt,
  endedAt}` reads #362 introduces, extended to the sweep". #362 landed them as **`#passClock()`**
  (`redis.ts:1830-1832`), the only `performance.now()` read in the driver, and ADR 011 §6 says
  #360 consumes it. The sweep's two reads go through `#passClock()`. **No second
  `performance.now()`, and no second clock method.** The revocation pass adds **no** clock read:
  the sample reuses the `startedAt` and `endedAt` the end site already holds (`:2971`, `:2977`).
  The sweep's two reads are **new**. The disposition's "the only per-pass cost is the two reads
  #362 already makes" is true for the revocation pass only; the sweep gains two reads per pass.
- **D3 (`'idle'` is `'closed'`, and the vocabulary is shared).** The disposition names the
  revocation outcome `'ok' | 'failed' | 'idle'`. #362 landed it as **`'ok' | 'failed' | 'closed'`**
  (A5 renamed it): `type RevocationPassOutcome`, `redis.ts:1323`, module-private.
  - `'closed'` happens only once `close()` has dropped the handler, so the `#closing` gate already
    suppresses its sample.
  - The sweep's `#reconcile` needs an outcome of its own. #362's row 11 names "a second outcome type"
    as a duplicate, so the alias is **generalised, not copied**: `type PassOutcome =
    PassSample['outcome'] | 'closed'`. The public `'ok' | 'failed'` has its home in the exported
    `PassSample`, and the private alias derives from it.
  - The rename touches every use of `RevocationPassOutcome` (§4 lists them).
- **D4 (the pass record is the closure's object).** The disposition says "the in-flight pass
  record gets one increment per page". #362 landed the record as `#revocationPass?: { readonly
  trigger; readonly startedAt }` (`:1527-1530`). Its end site takes `startedAt` **from the start
  site's closure**, not the field (#362 FR-008.3.1, amended by architect ruling 2026-09-24).
  - This plan keeps that discipline. The start site builds one object, `const pass = { trigger,
    startedAt, pages: 0 }`, stores it in `#revocationPass`, and the end site reads `pass`.
  - This is load-bearing. The end site starts a trailing pass **before** it samples (`:2981`).
    Read from the field at that point, the sample would carry the **trailing** pass's trigger and
    its zero pages. Witness P6, mutant M8.
  - #362's row 12 (the record `{ trigger, startedAt }`) is **amended** to `{ trigger, startedAt,
    pages }`, with `pages` its one mutable member. `EnforcementDeadline`'s `inFlight` type
    (`enforcement_deadline.ts`) accepts the wider record structurally, so that module is not
    edited.
- **D5 (the sweep gets the same record, not a threaded counter; ruled A3).** The sweep has no record
  today: `#reconcilePass` (`:1508`) holds the promise `close()` awaits.
  - A new `#sweepPass?: { readonly startedAt: number; pages: number }` is created at the sweep's one
    start site, the timer callback in `#armReconcile`. `#sweepOwned`'s page loop increments it, as
    `listRevocations` increments `#revocationPass`.
  - It is a **Temporary Field**: set only while a sweep is in flight. It is accepted **for parity with
    `#revocationPass`**, one counting idiom for both passes, and for no other reason.
  - Rejected: threading a counter through `#reconcile` → `#sweepInstance` → `#sweepOwned`, which
    would give the two passes two counting idioms.
  - As #362 does, the sweep's `.finally` reads `endedAt` **first** (FR-009).
- **D6 (the deadline call stays before the sample).** #362's end site ends with
  `deadline.passSucceeded(…)`, "**last**" (`:2983-2989`). The disposition puts the sample after
  the slot clear and the re-arm. The sample goes **after the deadline call**, so:
  - a failure of the sample's own log sink can never skip enforcement;
  - #362's "last" is read as "last of the enforcement steps".
- **D7 (the containment is wider than `onControlRefused`'s, and it is #369-shaped).**
  `#refuseControl` (`:2178-2188`) contains only a **synchronous** throw. The disposition also
  requires a **rejected returned promise** to become one WARN. The two differences:
  - `#emitPassSample` attaches a rejection handler when the handler returns a thenable. That is a
    real difference from the precedent, not a copy.
  - **The sweep chain has no final rejection handler.** `#armReconcile`'s
    `this.#reconcile().finally(…)` is not followed by a `.catch`, unlike #362's revocation chain
    (`:2991-2996`). A containment WARN whose `console.warn` throws would reject `#reconcilePass`:
    an unhandled rejection with no `close()`, or a rejecting `close()`. So the containment's own
    WARN is written in the **#369 shape**: `console.warn` in a `try`, and on a throw, one marked
    `console.error` line.
  - #362's marker, `REVOCATION_LOG_FAILED` ("a revocation log line…", `enforcement_deadline.ts:74`),
    is wrong for a sweep line. The sample gets its own marker, `PASS_SAMPLE_LOG_FAILED`, in
    `redis.ts`.
  - `#emitPassSample` is therefore total, apart from a throwing `console.error`, which is fatal as in
    #369.
  - **The sweep chain also gains a final `.catch` in this change (A1).** A `console.warn` that
    throws during any ghost release rejects `#reconcilePass`, which is the #369 class and fatal. The
    `.catch` writes one marked `console.error` line starting `SWEEP_LOG_FAILED` (FR-009a). **Both
    stay**: the emit's containment guards the handler, and the `.catch` guards the pass.
- **D8 (`onControlRefused` is on the interface; this seam is not).** `ControlRefusal` lives in
  `driver.ts:113`, and `onControlRefused` is an **optional `BroadcastDriver` member**
  (`driver.ts:612`), not a Redis-only method. The disposition keeps `onPassComplete` off the
  interface (the memory driver has no passes). So:
  - `PassSample` lives in **`drivers/redis.ts`**, exported from the `mod.ts` block that already
    re-exports `RedisCommandClient`;
  - the "every optional hook shares one lifecycle" paragraph (`docs/realtime.md:1738`) names it as
    the one **Redis-only** hook with that same lifecycle.
- **D9 (there is no instrument list to add to).** The disposition says "the metric, as
  `docs/observability-and-crypto.md` lists it". That section (`:85-100`) lists no instrument. The
  one framework metric, `lockness.http.server.requests` (`middleware.ts:34`), appears in its prose
  only as "a request counter". This plan **creates the list** (FR-012), and it becomes the one home
  of every instrument name, unit and attribute.
- **D10 (the #362 end-site JSDoc names three deadline sites).** `#startRevocationPass`'s JSDoc
  (`:2945-2960`) is the one home of *where the deadline moves* (#362 row 8). It gains **one
  clause**, naming the sample as the end site's final step. The three deadline sites are not
  edited.
- **D11 (the attribute names break an OTel naming rule).** The disposition's recipe uses
  `lockness.realtime.pass` as an attribute **and** as the namespace of
  `lockness.realtime.pass.trigger` and `.outcome`. OpenTelemetry's attribute-naming rules say a
  name should not also be a namespace. It also records a duration in `ms`, where OTel's
  semantic conventions use `s`. The names live only in a documented recipe (disposition residue 1),
  so this does not change the code. §12 put it to the maintainer as the one product question.
  **Decided 2026-09-24: option B, the OTel-conformant names** (§12).
- **D12 (the disposition's page counts are wrong on the test double).** Its S2 and S3 witnesses
  expect "250 records at COUNT 100 → `pages: 3`". FakeRedis honours `COUNT` on both `SSCAN` and
  `ZSCAN` (`tests/fake_redis.ts:976`, `:1040`), but it counts **slots in a fixed 1 024-slot table**
  (`SCAN_TABLE_SLOTS`, `:177`; scan core `:305-340`), not members.
  - A set of at most `COUNT` members comes back whole in one page (`:327-328`).
  - Anything larger is walked in `COUNT`-slot windows, **11 pages at COUNT 100**, and some pages are
    empty.
  - So P2 and P3 assert `pages` **equal to the number of `ZSCAN` or `SSCAN` commands the fake served
    during that pass**, read from its command log, never a hard-coded 3.
  - P1 (one record) and P3 (ii) (no dead instance) keep their literal 1 and 0.
  - **Precondition (A6):** P2 and P3 (i) and (iii) first assert that the fake served **more than
    one** page in the pass (`served > 1`). A fake that returned the set whole would otherwise pass
    them vacuously.

---

## 1. Why this exists

Two background passes keep a Redis-backed realtime fleet correct:

- **the ghost sweep** releases the presence holds of instances that died;
- **the revocation re-check** applies revocations whose one-shot control frame was lost.

Both are bounded by how long **one pass** takes, and **nothing measures that**:

- **ADR 008 §5 (`:160-162`)**: head-of-line delay across dead instances. "Revisit when a pass
  takes longer than the liveness TTL — but **no instrument measures pass duration today**, so
  nothing would report that trigger firing; adding the measurement is the first step of any
  revisit."
- **ADR 009 (`:217-220`)**: fleet-wide amplification. Its revisit trigger, a pass above 10% of
  `reconcileIntervalMs`, "**cannot be observed** until the pass-duration metric exists" (#360).
- **The revocation bound** `reconcileIntervalMs + 2P` (the `onRevocationReconcile` JSDoc) is stated
  in P, one pass. #362 checks the bound **against the TTL** and says when it is broken. It does not
  tell an operator how close a healthy fleet runs to it.
- A slow-pass WARN was rejected twice (ADR 009 `:177`, the S2 ruling): **the library records the
  value and never judges it**. What remains is a number the operator's metrics backend can alert
  on.

**Who is affected:** every operator of a Redis-backed realtime fleet with a large presence roster,
a large revocation index, or crash-prone instances. Today they cannot see either revisit trigger
approach until it has already fired, as lost revocations or ghost members.

## 2. User scenarios

### US1 — an operator graphs how long each pass takes (P1)

**Given** an application that registers `driver.onPassComplete(handler)` and forwards each sample
to two OpenTelemetry histograms through `getMeter` from `@lockness/telemetry`
**When** the fleet runs with `OTEL_DENO=1`
**Then** every completed sweep and revocation pass records one duration and one page count. Each is
tagged with which pass it was, what triggered it, and whether it succeeded. The operator can alert
on the ADR 008 and ADR 009 revisit triggers.

### US2 — a reconnect's catch-up time is visible on its own (P1)

**Given** the same wiring
**When** the subscribe socket reconnects after an outage and the revocation fast path runs
**Then** that pass's sample carries trigger `reconnect` (or `reconnect-retry` for its one retry),
so the real lost-frame catch-up latency is a separate series from the timer passes.

### US3 — a run of failing passes is visible (P2)

**Given** a broker that refuses the reap, or the instance-set read
**When** passes fail
**Then** each failed pass records a sample with outcome `failed`. A run of failures is visible as a
series, which #362's deadline reports only once per episode.

### US4 — observability never breaks the passes (P2)

**Given** a handler that throws, returns a rejecting promise, or never settles
**When** passes complete
**Then** each failure is one WARN. The next pass still runs, no rejection escapes to the runtime,
and `close()` still resolves.

### US5 — an application that wires nothing sees nothing new (P2)

**Given** no `onPassComplete` registration
**When** the application runs
**Then** no sample is built, nothing is called, no log line is added, and no broker round trip is
added.

### Edge cases

- **`close()` while a pass is in flight**: that pass records nothing, and nothing afterwards
  (the `#closing` gate).
- **A handler registered mid-pass** receives that pass's sample: the handler is read at the end
  site.
- **Re-registration** replaces the handler. Only the latest one is called.
- **A reconnect during a revocation pass** starts a trailing pass from the end site before the
  sample is taken. The sample carries the **ended** pass's trigger and pages (D4).
- **Three reconnects during one pass** coalesce into one trailing pass: **two** samples, not four.
- **A sweep with no dead instance**: one sample, `pages: 0`.
- **One dead instance whose sweep fails** (a release `EVAL` rejects) is contained in
  `#sweepInstance`. The pass is still `ok`.
- **A `listRevocations` call while no pass is in flight** (the manager's lapse re-check, an
  application call) counts nowhere. **One that runs on the manager's tail ahead of the pass's
  handler** counts into that pass, and so does its time (disposition residue 4).
- **A stalled pass** records nothing, because the sample is taken at its end. #362's deadline is the
  library's signal for a stall. For the backend, the signal is an absence of samples.
- **The pass promise rejects** (a log sink threw inside the pass, #349): `outcome` stays `'failed'`
  and the `finally` still samples. The revocation chain's final handler writes the #369 line.

## 3. Requirements

**The value object and the seam (`packages/realtime/drivers/redis.ts`)**

- **FR-001**: An exported `interface PassSample` with JSDoc on it and on every member:
  - `pass: 'sweep' | 'revocation'`;
  - `trigger: 'timer' | 'reconnect' | 'reconnect-retry'` (always `'timer'` for the sweep);
  - `outcome: 'ok' | 'failed'`;
  - `durationMs: number`, monotonic and ≥ 0;
  - `pages: number`, ≥ 0.

  Every member is `readonly`, and the object handed over is `Object.freeze`d. The JSDoc is **the one
  home of what each field means**:
  - `durationMs` is the **whole pass**, including the apply and any wait on the manager's serial
    tail. It is therefore ≥ the round-trip-only P of the bound's formula, and is not comparable to
    it (disposition residue 3). The JSDoc links the bound's one home rather than restating it.
  - `pages`, for the sweep, is the `SSCAN` pages read across every dead instance swept in the pass.
    The unpaged `SMEMBERS` and the per-instance `EXISTS` are not counted (residue 5).
  - `pages`, for the revocation pass, is the `ZSCAN` pages `listRevocations` read while this pass
    was in flight (residue 4).
  - **`outcome: 'ok'`** (S1) means *the enumeration completed, not that every record was applied*.
    Per-record failures are reported only as their named WARNs. There is **no `failures` field**:
    the driver cannot count revocation applies, which happen in the manager behind
    `onRevocationReconcile`. A per-record failure count for both passes, reported through the
    interface, is §9 residue, filed by the coordinator.

  It is exported from `packages/realtime/mod.ts` in the existing `./drivers/redis.ts` block, as
  `type PassSample`. **It is not on `BroadcastDriver`** (D8).
- **FR-002**: `type PassOutcome = PassSample['outcome'] | 'closed'` replaces
  `RevocationPassOutcome` (`:1317-1323`). It stays module-private, and its JSDoc keeps #362's text and
  adds the sweep. Every use is renamed (D3). **No second outcome alias.** Its JSDoc is also the one
  home of **"unrecorded means `'failed'`"** (row 3a). The two start sites' `let outcome: PassOutcome
  = 'failed'` lines are askers of it.
- **FR-003**: `onPassComplete(handler: (sample: PassSample) => void): void` goes on
  `RedisBroadcastDriver`, directly after `#refuseControl`. It has JSDoc with `@param` and an
  **`@example` that names no instrument** (row 12). **One handler**: registering again replaces it.
  Its field, `#passCompleteHandler`, is **read at the end site**, not captured at the start.
  `close()` drops it beside `controlRefusedHandler` (`:3857`). The drop is hygiene; the `#closing`
  gate (FR-006) is the decider.
- **FR-004**: **`#emitPassSample(pass, trigger, outcome, startedAt, endedAt, pages)`** is the one
  place a sample is built and delivered. **Its JSDoc is the home of row 4** (A2):
  - it names its two callers, the revocation `.finally` and the sweep `.finally`;
  - it says each is the pass's one end site;
  - it says **every argument comes from the start site's closure**, never from `#revocationPass` or
    `#sweepPass`.

  The D10 clause in `#startRevocationPass` and the `#armReconcile` JSDoc link to it. In order:
  1. return if `#closing` is set: the one asker of the "nothing after `close()`" rule for samples;
  2. return if the outcome is `'closed'`, or no handler is registered, before building anything
     (US5);
  3. build the frozen sample, with `durationMs = Math.max(0, endedAt − startedAt)`;
  4. call the handler **without awaiting it**.
  - The handler is called, and its result `r` is adopted, **inside one `try`** (S3):

    ```ts
    const r = handler(sample)
    Promise.resolve(r).then(undefined, warn)
    ```

  - A **synchronous throw**, including one from `Promise.resolve` reading a hostile native promise's
    `constructor` getter, becomes one WARN starting `PASS_SAMPLE_FAILED`.
  - A **rejection** becomes one WARN with the same prefix. `Promise.resolve` adopts a thenable
    once, so a thenable that calls `reject` three times still gives **one** WARN. Never a duck-typed
    `typeof r.then` call.
  - A thenable that never settles holds nothing.
  - Every WARN is written in the **#369 shape** (D7): `console.warn` in a `try`, and on a throw, one
    `console.error` line starting `PASS_SAMPLE_LOG_FAILED`. It carries both halves, each through
    `renderError`.
  - `PASS_SAMPLE_FAILED` and `PASS_SAMPLE_LOG_FAILED` are `export const`s in `redis.ts`, the
    `REVOCATION_PAIRS_SKIPPED` precedent (`:1172`). They are **not** re-exported from `mod.ts`, and
    both carry `(#360)`.
- **FR-005**: **The pass clock is `#passClock()`** (`:1830-1832`), and only it (D2). No new
  `performance.now()`, and the epoch `now()` is never used for a duration.

**The revocation pass**

- **FR-006**: The start site (`:2971-2972`) builds `const pass = { trigger, startedAt, pages: 0 }`
  and stores it in `#revocationPass`. The field's type gains `pages: number`, its one mutable
  member. The local `startedAt` stays (`:2971`), so #362's deadline call keeps its bytes (N14 anchors
  `startedAt,` / `endedAt,` / `this.#lastReadAt,` at 24 spaces). The end site (`.finally`,
  `:2976-2990`) keeps #362's order byte for byte, and adds one **final** statement **after** the
  deadline call's closing `}` (D6):

  ```ts
  this.#emitPassSample('revocation', trigger, outcome, startedAt, endedAt, pass.pages)
  ```

  - All of it comes from the closure: `trigger`, `startedAt` and `pass`. It never reads
    `this.#revocationPass` (D4).
  - The call must not reproduce N14's three-line layout, and it must not reuse the
    `if (outcome === 'ok' && !this.#closing) {` line (N11, N13, N15).
  - The `.catch` (#369) is unchanged.
  - The D10 clause in `#startRevocationPass`'s JSDoc **links** row 4's home (`#emitPassSample`)
    rather than restating the end-site rule.
- **FR-007**: `listRevocations` increments `this.#revocationPass.pages` once per `ZSCAN` page it
  decodes, when a pass is in flight. That is **one line**, directly after the `decodeRevocationPage`
  statement and above `skipped += page.skipped`, never inside `LOOP_END` (#359 M3, M10). It is the
  **only** addition to the page loop. A page that fails to decode is not counted, because its read
  threw. The increment **asks** row 1: `PassSample.pages`'s JSDoc decides what a page is (A2).

**The ghost sweep**

- **FR-008**: `#reconcile` declares **`Promise<PassOutcome>`** (the #355 declared-return rule). It
  returns:
  - `'failed'` from its catch (`:3390-3394`), meaning the `SMEMBERS` or an `EXISTS` threw, **or its
    reply did not decode** (S2);
  - `'closed'` from the in-loop `#closing` check (`:3382`);
  - `'ok'` after the loop.

  A failure contained to one instance, in `#sweepInstance`, is still `'ok'`.
- **FR-008a** (S2): two decoders go beside `decodeScanReply` (`:984-1040`), each an `export`ed
  function with JSDoc, in the shape of its neighbours:
  - **`decodeMembersReply(reply): readonly unknown[]`** returns the array, or throws;
  - **`decodeExistsReply(reply): 0 | 1`** returns the integer 0 or 1, or throws.

  Both are called **inside `#reconcile`'s `try`**, replacing `asArray(reply) ?? []` (`:3380`) and the
  `asInteger(...)` around `EXISTS` (`:3385-3387`). A reply that does not decode is a throw, so the
  pass is `failed`, with one "roster reconcile failed" WARN.
  - **Before**, a non-array `SMEMBERS` reply was silently read as an empty instance set, so the
    sweep swept nothing.
  - **Before**, a non-integer `EXISTS` reply was silently read as alive.
  - **After**, each gives one WARN per pass. This is observable, so it gets **upgrade item 19**
    (FR-013).
- **FR-009**: `#armReconcile`'s timer callback (`:3284-3291`) is the sweep's one start site. It
  builds `const pass = { startedAt: this.#passClock(), pages: 0 }` and stores it in `#sweepPass`,
  then runs `#reconcile()`, recording its outcome through a `.then` placed before the `.finally`.
  `let outcome: PassOutcome = 'failed'` asks row 3a. The `.finally` then runs, in order:
  1. `const endedAt = this.#passClock()` — read **first**, as #362 does (A3);
  2. clear `#reconcilePass`;
  3. `this.#armReconcile()`;
  4. clear `#sweepPass`;
  5. **last**: `this.#emitPassSample('sweep', 'timer', outcome, pass.startedAt, endedAt,
     pass.pages)`.

  The chain then ends in the FR-009a `.catch`. `close()` still awaits the stored promise, which is
  the `.catch`'s. It settles once the sample has been handed over (the handler is never awaited),
  and it never rejects.
- **FR-009a** (A1): **the sweep chain's final `.catch`** writes one `console.error` line starting
  `SWEEP_LOG_FAILED`, a new `export const` in `redis.ts` tagged `(#360)`. The line carries the
  rejection through `renderError`.
  - It is the **third asker of #362 row 20** ("a log-sink failure never escapes"). The first two are
    the deadline's fire callback and the revocation chain's final handler.
  - The ARM_TIMER re-anchor (§4) already covers this edit, so no further re-anchor is needed.
  - **Rejected** (A1):
    - leaving it as residue: it would re-anchor the same rows twice, and ship the sweep's `'failed'`
      default with no witness;
    - a shared `#runPass` for both chains: two instances do not meet the Rule of Three.
- **FR-010**: `#sweepOwned`'s page loop (`:3596-3610`) increments `this.#sweepPass.pages` once per
  decoded `SSCAN` page, when a sweep is in flight. That is one line, directly after the
  `decodeScanReply` statement. `#sweepInstance`, `#sweepPage` and `SweepCount` are not edited.
- **FR-011**: **Anchor hygiene.** Every existing line that a §4 battery row anchors on keeps its
  bytes, except the rows §4 lists as re-anchored. The new lines go where FR-006 to FR-010 place
  them. In particular:
  - `#362`'s `RERUN_TAKE` stays contiguous at its 16-space indent;
  - `#revocationRerun`'s line (`:1537`) is not edited;
  - `await this.#reconcilePass` stays its own line.

**Telemetry (`packages/telemetry`)**

- **FR-012**: A new module, `packages/telemetry/meter.ts`, with `@fileoverview` and `@module`.
  - It exports `getMeter(name: string): Meter`, a one-liner over `metrics.getMeter` from
    `@opentelemetry/api`. Its JSDoc has `@param`, `@returns` and an `@example`, and says it returns
    the no-op meter when `OTEL_DENO` is unset.
  - It is re-exported from `mod.ts`.
  - **`middleware.ts:33` calls it** instead of `metrics.getMeter`. `@opentelemetry/api`'s `metrics`
    then has **one** caller in the package, and `middleware.ts` keeps its `trace` and
    `SpanStatusCode` import.
  - No new dependency: `@opentelemetry/api` is already declared (`deno.json`), and
    `deps.policy.jsonc` needs no edit. `deno task deps:analyze` shows no new edge. **No `npm:`
    specifier is added anywhere**, and `@lockness/realtime` gains no import.

**Docs**

- **FR-013**:
  - **`docs/observability-and-crypto.md` § OpenTelemetry** gains a `### Framework instruments`
    table, the **one home of every instrument's name, kind, unit and attributes** (D9). It lists the
    existing `lockness.http.server.requests` counter and the two pass histograms, with the names
    decided on 2026-09-24 (§12, option B).

    | Instrument | Kind | Unit | Recorded value |
    | :--- | :--- | :--- | :--- |
    | `lockness.realtime.pass.duration` | histogram | `s` | `durationMs / 1000` |
    | `lockness.realtime.pass.pages` | histogram | `{page}` | `pages` |

    - **Attributes, on both instruments**: `lockness.realtime.pass.kind` (`sweep` \| `revocation`,
      from `PassSample.pass`), `lockness.realtime.pass.trigger` and `lockness.realtime.pass.outcome`.
      No attribute name is also a namespace.
    - **Explicit bucket boundaries**, passed as `advice.explicitBucketBoundaries` to
      `createHistogram`, and stated only in this table:
      - duration, in seconds: `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60`;
      - pages: `1, 2, 5, 10, 20, 50, 100, 200, 500, 1000`.

      The duration range covers the ADR 009 trigger (10% of a 10 s interval, so 1 s) and the ADR 008
      trigger (the liveness TTL).
    - The `outcome` attribute's entry **links** the `PassSample` JSDoc for what `ok` means (S1); it
      does not restate it.
    - The section also gains **the recipe**: `getMeter` plus `onPassComplete`, wiring both
      histograms with these names, units and buckets. The recipe converts `durationMs` to seconds;
      `PassSample` itself keeps milliseconds.
  - **`docs/realtime.md`** gains a paragraph with anchor `<a id="measuring-passes">`, after the
    enforcement-bound paragraph (`:1945-1969`). It covers:
    - `onPassComplete` and `PassSample`, linking the JSDoc for field semantics and the
      observability recipe for names;
    - **one sentence** saying `durationMs` is the whole pass and is not comparable to the
      round-trip formula;
    - that a stall records nothing, and that #362's deadline is the signal for it;
    - that samples are not buffered.

    The "one lifecycle" paragraph (`:1738-1743`) names `onPassComplete` as Redis-only with the same
    lifecycle (D8). The `onControlRefused` recipe (`:667-676`) switches its hypothetical
    `metrics.increment` to `getMeter` (disposition follow-up 8).
  - **ADR 008** (`:160-162`) and **ADR 009** (`:177`, `:217-220`): each gains one dated `Update
    (#360, 2026-09-24)` line under the passage, pointing at the instrument table. The recorded text
    is not edited. **ADR 011** gains the same kind of dated `Update (#360, 2026-09-24)` line under §6
    (A5): the pass record gains `pages`, and the outcome alias becomes `PassOutcome`.
  - **ADR 012** (FR-014).
  - **`packages/realtime/AGENTS.md`**: a pitfall to *never await a pass handler, never sample from
    anywhere but a pass's end site, never read `#revocationPass` or `#sweepPass` at the end site
    (use the closure), and never add a second `performance.now()`*. The `onPassComplete` seam goes in
    the surface notes, naming both end sites. The generated blocks are regenerated by
    `deno task agents:brief`.
  - **`packages/telemetry/AGENTS.md`**: `meter.ts` goes in *Where to work*, and the public surface
    is regenerated.
  - **README**s: one bullet each, in realtime's *What ships* and in telemetry's, linking the
    observability recipe.
  - **`docs/realtime.md` § Upgrading to v0.4.0, item 19** ("19 unless another item lands first"):
    - the heading says that a malformed `SMEMBERS` or `EXISTS` reply now fails the ghost sweep with a
      WARN;
    - **Before** and **After** as in FR-008a;
    - no wire change, and no migration step.

    The section intro becomes "Nineteen items", with the breaking count unchanged (the item is
    observable, not breaking), and its "read items …" list gains 19.
  - **JSDoc**: `PassSample` and its members (the `ok` definition, S1); `onPassComplete`;
    `#emitPassSample` (row 4's home, A2); `#passClock` (**its reader list gains the sweep**, A4);
    `decodeMembersReply`; `decodeExistsReply`; `SWEEP_LOG_FAILED`;
    `#passCompleteHandler`; `#sweepPass`; the two constants; `PassOutcome`; `#reconcile`
    (`@returns`); `#armReconcile` (the start and end reads and the sample); `#startRevocationPass`
    (one clause, D10); `listRevocations` and `#sweepOwned` (the page increment); `getMeter`.
- **FR-014**: **ADR 012**, `docs/adr/012-measurements-reach-the-app-through-a-seam.md` (the number
  is assigned at landing). Scoped **as the rule for any package's measurements**, with the realtime
  passes as its first instance (A5). It records:
  - the rule:
    - a package hands the application a value through a seam;
    - the application wires it to its backend, through `getMeter`;
    - instrument names live in the observability doc;
    - the library records and never judges;
  - why the app is the composition root (realtime is a pure sink, `deps.policy.jsonc:104-117`);
  - the rejected options with their costs: **a hard dependency, a contract-level recorder, a
    soft-load, and a meter port**;
  - the first instance: the question (ADR 008 and 009 triggers that cannot be observed), the seam,
    the sample, and the seam kept off `BroadcastDriver`;
  - the eight items of *What this does not solve*.

  It links ADR 006, 008, 009 and 011.

**Upgrade item 19** ("19 unless another item lands first"). The seam and `getMeter` are additive and
need no item. **S2 is observable**: a deployment whose broker returns a malformed `SMEMBERS` or
`EXISTS` reply now logs one WARN per sweep pass where it logged nothing. The item is **not
breaking**: no configuration or code change is needed.

**Tests**

- **FR-015**: Witnesses P1–P13 go in a new `packages/realtime/tests/pass_sample_360.test.ts`, and T1
  in `packages/telemetry/tests/meter.test.ts` (§4). All are committed **red on `main` first**,
  except the pins P11 and P13 (P1–P10, P12 and T1 do not compile against `main`, because the seam
  and `getMeter` do not exist).
  - They stub `performance.now` as #362's suite does (`revocation_pass_bound_362.test.ts:292-299`).
  - The revocation witnesses register the handler **directly on the driver**, as #362 D1 does.
- **FR-016**: The battery `packages/realtime/tests/mutations/pass_sample_360.ts` holds rows M1–M23
  (§4), with SUITES set to that test file. Each row is **proven live**: it ran, and it turned its
  named witness red.
- **FR-017**: **Battery repair** (§4): every row listed as broken is **re-anchored, never deleted**,
  and re-proven live. Then `deno task mutate realtime` runs. Any other `DEAD MUTANT` is repaired
  under "the source moved, the guard remains" (`docs/testing.md`), never deleted.

## 4. Success criteria

- **SC-001**: An operator who wires the documented recipe sees, for **every** completed sweep and
  revocation pass, one duration and one page count. Each is tagged with the pass, the trigger and
  the outcome.
- **SC-002**: The ADR 008 trigger (a sweep longer than the liveness TTL) and the ADR 009 trigger (a
  revocation pass above 10% of the interval) can each be written as an alert on those series.
- **SC-003**: An application that registers no handler sees **no** change: no new log line, no
  new broker round trip, and no measurable work beyond two clock reads per sweep pass.
- **SC-004**: No handler behaviour can stop a pass loop, reject `close()`, or terminate the process.
  That covers a throw, a rejection, a never-settling promise, and a throw from the log sink during
  its WARN. **No log-sink failure anywhere in a ghost sweep** can do so either (A1).
- **SC-004a**: A broker reply the sweep cannot read is reported, never read as "no instances" or as
  "alive" (S2).
- **SC-005**: A closed driver reports nothing.
- **SC-006**: The metric series stay bounded: at most **12** combinations of pass × trigger ×
  outcome, whatever the fleet size.

**Witnesses** (FR-015), in `tests/pass_sample_360.test.ts`. "Red" means the witness fails on
`main` at `f697c100`, where it does not compile. Test names start `#360 P<n> ` with a trailing
space. `REVOCATION_SCAN_COUNT` and `OWNED_SCAN_COUNT` are both 100 (`:201`, `:1411`).

| # | Setup → assertion |
| :--- | :--- |
| P1 (red) | one revocation record, handler on the driver `() => driver.listRevocations()`, one timer pass → **exactly one** sample, `{ pass: 'revocation', trigger: 'timer', outcome: 'ok', pages: 1 }`, and `Object.isFrozen(sample)` |
| P2 (red) | 250 live records; **precondition `served > 1`** (A6) → the pass's sample has `pages` equal to the `ZSCAN`s the fake served in that pass (11, D12); the **next** pass's sample has its own count again, not the sum |
| P3 (red) | **Precondition in (i) and (iii): `served > 1`** (A6). (i) A dead instance owning 250 holds → one sweep sample `{ pass: 'sweep', trigger: 'timer', outcome: 'ok' }` whose `pages` equals the `SSCAN`s served in that pass. (ii) No dead instance → one sample, `pages: 0`. (iii) **Two** dead instances owning 150 each → `pages` equals the `SSCAN`s across **both** (22 on the fake), not one instance's |
| P4 (red) | (i) the reap `EVAL` rejects → revocation `outcome: 'failed'`. (ii) `SMEMBERS` rejects → sweep `failed`. (iii) one dead instance's release `EVAL` rejects (contained in `#sweepInstance`) → sweep `ok`. (iv) (S2) (a) `SMEMBERS` answers a `type: 'set'` reply → sweep `failed` and exactly one "roster reconcile failed" WARN; (b) `EXISTS` answers a non-integer → sweep `failed` |
| P5 (red) | a reconnect pass → `trigger: 'reconnect'`; that pass failing, its retry → `trigger: 'reconnect-retry'` |
| P6 (red) | a pass held on its last page; three reconnects during it; release → **exactly 2** samples. The first is `{ trigger: 'timer', pages: 1 }` (the ended pass, not the trailing one); the second is `{ trigger: 'reconnect' }` |
| P7 (red) | (i) `close()` while a revocation pass's last page is held; release → no sample, and none after 2 × interval. (ii) The same for a sweep pass held on its `SSCAN` |
| P8 (red) | (i) a handler that throws → exactly one `PASS_SAMPLE_FAILED` WARN per pass, and the next pass of each kind still runs and samples. (ii) A handler returning a rejecting promise → one WARN each, and no unhandled rejection (the test sanitizer fails otherwise). (iii) A throwing handler **while `console.warn` throws** → exactly one `PASS_SAMPLE_LOG_FAILED` `console.error` line per pass, carrying both halves; no uncaught error; the sweep loop still re-arms. (iv) A handler returning a promise that never settles → `close()` resolves. (v) (S3): (i) the handler returns a native promise whose `constructor` getter throws → one `PASS_SAMPLE_FAILED` WARN, no uncaught error; (ii) the handler returns a thenable that calls `reject` three times → **exactly one** WARN |
| P9 (red) | `performance.now` steps 40 ms across a pass, and `Date.now` jumps +10 s during it → `durationMs === 40`, for both passes |
| P10 (red) | (i) a handler registered **mid-pass** receives that pass's sample. (ii) Registering a second handler → only the second receives later samples |
| P11 (pin) | no handler registered → both loops run for 5 passes; zero `PASS_SAMPLE_*` lines, no throw. Green before and after, once it compiles |
| P12 (red) | (i) the revocation pass promise rejects (the handler rejects while `console.warn` throws, the #349 case) → one sample with `outcome: 'failed'`, and #362's `REVOCATION_LOG_FAILED` line. (ii) (A1) a ghost is released while `console.warn` throws → one sweep sample with `outcome: 'failed'`, exactly one `SWEEP_LOG_FAILED` line, and no uncaught error; the loop re-arms and `close()` resolves |
| P13 (pin) | #362's suite `revocation_pass_bound_362.test.ts` runs unchanged, and green |
| T1 (red) | `getMeter('x')` with `OTEL_DENO` unset returns a meter whose `createHistogram(...).record(1, {...})` does not throw; `telemetryMiddleware` still counts (the existing `middleware.test.ts` stays green) |
| — | Every existing realtime and telemetry test stays green, and none is edited |

**Mutants** (FR-016), battery `tests/mutations/pass_sample_360.ts`, each proven live:

| # | Mutant | Killed by |
| :--- | :--- | :--- |
| M1 | the `listRevocations` page increment removed | P1 |
| M2 | the revocation page count kept in a driver field never reset per pass | P2 |
| M3 | the `#sweepOwned` page increment removed | P3 (i) |
| M4 | the sweep page count reset per instance (kept in `SweepCount`) | P3 (iii) |
| M5 | the revocation end site passes `'ok'` instead of `outcome` | P4 (i) |
| M6 | `#reconcile`'s catch returns `'ok'` | P4 (ii) |
| M7 | the revocation sample's trigger hard-coded `'timer'` | P5 |
| M8 | the revocation end site reads `this.#revocationPass` instead of `pass` (D4) | P6 |
| M9 | `#emitPassSample`'s `#closing` gate removed | P7 |
| M10 | the handler call's `try`/`catch` removed | P8 (i) |
| M11 | no rejection handler on a returned thenable | P8 (ii) |
| M12 | the #369 fallback removed: a bare `console.warn` | P8 (iii) |
| M13 | the handler awaited: `#emitPassSample` returns the handler's promise and the `.finally` returns it | P8 (iv) |
| M14 | `#passClock` replaced by the epoch `now()` at the sweep's start site | P9 |
| M15 | the handler captured at the start site instead of read at the end site | P10 (i) |
| M16 | the sample not frozen | P1 |
| M17 | `#sweepInstance`'s contained failure made to fail the pass (its catch rethrows) | P4 (iii) |
| M18 | the sweep sample emitted **before** `this.#armReconcile()`, with M12 applied | P8 (iii) (the loop stops re-arming) |
| M19 | the sweep chain's final `.catch` removed (A1) | P12 (ii) (an uncaught rejection) |
| M20 | the sweep's `let outcome` default set to `'ok'` (A1) | P12 (ii) |
| M21 | `decodeMembersReply` bypassed: `asArray(reply) ?? []` restored (S2) | P4 (iv) (a) |
| M22 | the `Promise.resolve(r).then(…)` attachment moved out of the `try` (S3) | P8 (v) (i) |
| M23 | a duck-typed attachment: `if (typeof r?.then === 'function') r.then(undefined, warn)` (S3) | P8 (v) (ii) (three WARNs) |

**Equivalent by design, not in the battery** (reviewed instead):

- `close()` not dropping the handler: the `#closing` gate decides.
- A sample built with no handler registered: this cannot be observed.
- `getMeter` ignoring its `name`: the no-op provider cannot see it.

**Blast radius: existing battery rows.** Counted on `main` at `f697c100`.

**The count:**

- **Coverage**: all 20 batteries under `packages/realtime/tests/mutations/` that target
  `drivers/redis.ts`, which is **158 rows and 175 edits**. No battery covers `packages/telemetry/`.
- **Method**: a stub harness dumped every row's anchors (354's type rows skipped, 310 and 316 with
  their integration flag set). Each anchor was located in today's `redis.ts`, alone and with each
  row's edits applied in order. **Every anchor matches exactly once today.**
- **Edit zones**: the outcome alias (`:1317-1323`), the field block, `#refuseControl`'s neighbour,
  the `listRevocations` page loop, the revocation start and end sites, `#armReconcile`,
  `#reconcile`, the `#sweepOwned` page loop and `close()`.

*Adjacent rows: **5 re-anchored, 6 re-verified**, and every other row within three lines of an edit
zone unchanged, provided FR-006 to FR-011 hold.*

- **Re-anchored (5), DEAD once the plan lands; never deleted:**
  - `reconcile_single_pass_355` **M1** (the sweep back on `setInterval`) and **M2**, first edit
    (the re-arm moved into `#reconcile`), anchor the whole of `ARM_TIMER` (`:3285-3291`; battery
    `:69-75`), which FR-009 rewrites.
    - `ARM_TIMER` is redefined to the new body.
    - M2 deletes only the `this.#armReconcile()` line and keeps the sample.
    - M1's replacement must still type-check against `#reconcilePass: Promise<void>` now that
      `#reconcile` returns `Promise<PassOutcome>`.
  - `reconcile_single_pass_355` **M12a** anchors `if (this.#closing) return\n` in `#reconcile`'s loop
    (`:3381-3382`). It becomes `return 'closed'` (FR-008).
  - `revocation_pass_bound_362` **N33** anchors `let outcome: RevocationPassOutcome = 'failed'`
    (`:2973`). Both its anchor and its replacement take `PassOutcome` (FR-002). That is the only
    use of the old name outside `redis.ts` (`:1323`, `:2973`, `:3028`). The historical 268 plan and
    tasks are not rewritten.
  - `sweep_paging_358` **M1** (the owned set read whole with `SMEMBERS`) anchors the whole `SSCAN`
    loop (`:3595-3610`), which FR-010's increment lands inside. The anchor gains the line. The
    replacement leaves the count at 0, so P3 (i) also kills it.
- **Re-verified (6), still matching:**
  - `revocation_paging_359` **M1**: the page decode swapped for a fake one-page object; the
    increment still counts it.
  - `revocation_paging_359` **M4** and `sweep_paging_358` **M4**: an empty-page `break` now lands
    after the increment. An empty page is still counted, which is correct, because it was read.
  - `revocation_pass_bound_362` **N14** (`:2985-2987`): FR-006 keeps the deadline call's bytes, and
    the emit call must not reproduce its layout.
  - `revocation_pass_bound_362` **N29** (`:2990-2996`): the emit ends directly above its `})`.
  - `reconcile_single_pass_355` **M2**, second edit (`:3388-3389`): it still matches, and its
    inserted re-arm lands before the new `return 'ok'`. The row is re-anchored anyway (above).

  Each is re-proven live.
- **Unchanged, adjacent:**
  - `revocation_paging_359`:
    - M2a, M2b and M5 (the `ZSCAN` arguments);
    - M3 and M10 (`LOOP_END`);
    - M6 and M8 (`:2757`);
    - M7;
    - M9;
    - M12 and M23 (`:2783`);
    - M16, M17 and M22 (the rerun block, `:2966-2969`, `:2979-2980`, `:1537`).
  - `revocation_pass_bound_362`: N11, N13 and N15 (`:2983`), and N16 (`:3835`).
  - `reconcile_single_pass_355`:
    - M11 (`:3850`);
    - M12c;
    - M13 (`:3283-3284`);
    - M15;
    - M24 (`:1575`; the new fields must not edit that line).
  - `sweep_paging_358`: M2a, M2b, M3, M5, M6 and M7.
  - `self_skip_310` (`:3384`), and the `presence_member_holds_345` row (`:3612`).
  - `lapse_rehold_349` M17 (`:3857`; the handler drop goes on its **own** line), M25 and M26.
  - `presence_sweep_departure_348` M12 (`:3853-3854`).
  - `revocation_retry_308` "close() stops clearing the pending retry" (`:3828-3831`).
- **After the audit fold:**
  - A1's `.catch` sits inside the ARM_TIMER block already being re-anchored, so no new re-anchor.
  - S2 edits `:3380` and `:3385-3387`. No row anchors those lines. The rows beside them (355 M12a,
    `self_skip_310` at `:3384`, and 355 M2's second edit at `:3388-3389`) are already counted
    above, and 310 is re-verified.
- **Nothing anchors** in `:2150-2195` (`onControlRefused`, `#refuseControl`), in `#reconcile`'s
  signature or catch, or in `#reconcilePass`'s, `#closing`'s or `#revocationPass`'s declarations.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| 1. What a pass sample is, and what each field means (`durationMs` = the whole pass, ≥ the round-trip P; what `pages` counts, per pass) | the `PassSample` interface and its JSDoc, `packages/realtime/drivers/redis.ts` | a second sample type in `driver.ts` or `mod.ts`; the field meanings restated in `docs/realtime.md`, ADR 012, the observability doc or `AGENTS.md` instead of linked; a `PassSample` on `BroadcastDriver` |
| 2. The public outcome vocabulary `'ok' \| 'failed'`, and the private `'closed'` | `PassSample['outcome']`, with `type PassOutcome = PassSample['outcome'] \| 'closed'`, `packages/realtime/drivers/redis.ts` | `RevocationPassOutcome` kept beside it; a `SweepOutcome`; a boolean `ok`; an outcome inferred from a logged WARN |
| 3. How a pass ended: the sweep fails only when the instance-set read or an `EXISTS` throws, **and a reply that does not decode is a throw** (S2); a failure contained to one instance is `ok` | `#reconcile`'s declared return type and its three `return`s, `packages/realtime/drivers/redis.ts` | an outcome decided in `#sweepInstance`; a failure flag set in `#sweepOwned`; `#armReconcile` inferring failure from a rejection; a `?? []` or `asInteger` fallback that reads a bad reply as empty or alive |
| 3a. Unrecorded means `'failed'`, for both passes | **`PassOutcome`'s JSDoc**, `packages/realtime/drivers/redis.ts` (A2); the two start sites' `let outcome: PassOutcome = 'failed'` are its askers | a default of `'ok'`; a second default inside `#emitPassSample` |
| 4. One sample per completed pass, taken at the pass's one end site and nowhere else (the revocation `.finally` after the deadline call; the sweep `.finally` after the re-arm), **every argument from the start site's closure** | **`#emitPassSample`'s JSDoc**, naming its two callers, `packages/realtime/drivers/redis.ts` (A2); the D10 clause and the `#armReconcile` JSDoc link to it | a sample from `#runRevocationReconcile`, `#reconcile`, `listRevocations` or a page loop; one sample per trigger; a sample before the re-arm or the deadline call; an end site reading `#revocationPass` or `#sweepPass`; the rule restated in either caller's JSDoc |
| 5. How a sample is built and delivered: gated, frozen, never awaited, contained (sync throw and rejection) in the #369 shape | `#emitPassSample`, `packages/realtime/drivers/redis.ts` | a `try` at each end site; a second containment beside `#refuseControl`'s; an `await` on the handler; a duck-typed `typeof r.then` attachment; an attachment outside the `try` |
| 6. No sample once `close()` has begun | `#closing`, asked in `#emitPassSample`, `packages/realtime/drivers/redis.ts` | a check at each end site; a `closed` flag on the handler; the handler drop in `close()` treated as the decider |
| 7. One handler, replaced on re-registration, read at the end site, dropped by `close()` | `onPassComplete` and `#passCompleteHandler`, `packages/realtime/drivers/redis.ts` | a handler list; a handler captured at a pass's start; a buffer of samples for a later handler |
| 8. Durations are read on the monotonic pass clock | `#passClock()`, `packages/realtime/drivers/redis.ts` (#362 row 13; its only `performance.now()` read) | a `performance.now()` in `#armReconcile` or `#emitPassSample`; `now()` or `Date.now()` for a duration; a clock argument on `onPassComplete` |
| 9. The revocation pass's record `{ trigger, startedAt, pages }`, built once at the start site (amends #362 row 12) | `#revocationPass`, `packages/realtime/drivers/redis.ts` | a sibling `#revocationPages` counter; a record kept in the deadline; a second record built at the end site |
| 9a. The sweep pass's record `{ startedAt, pages }`, a Temporary Field set only while a sweep is in flight (A3) | `#sweepPass`, `packages/realtime/drivers/redis.ts` | a counter threaded through `#sweepInstance`; `pages` added to `SweepCount`; a sibling `#sweepPages`; a record stored in `#reconcilePass` |
| 10. A page is counted where it is decoded, into the pass in flight, and only there | **asker of row 1** (`PassSample.pages`'s JSDoc decides what a page is) (A2); the two askers are the increments in `listRevocations` and `#sweepOwned`, `packages/realtime/drivers/redis.ts` | a count derived afterwards from `cursor` hops; a count in the manager; a page counted before its decode succeeded; a second definition of a page in a comment |
| 11. The seam is Redis-only | `RedisBroadcastDriver.onPassComplete`, `packages/realtime/drivers/redis.ts` | an optional `onPassComplete?` on `BroadcastDriver` (`driver.ts`); a no-op on the memory driver |
| 12. Instrument names, kinds, units, attributes and bucket boundaries (option B, decided 2026-09-24) | the `### Framework instruments` table, `docs/observability-and-crypto.md` | names in code (`@lockness/realtime` or `@lockness/telemetry`); names in `onPassComplete`'s `@example`, the realtime docs paragraph, README, `AGENTS.md` or ADR 012 instead of a link |
| 13. How an application reaches the OTel meter | `getMeter`, `packages/telemetry/meter.ts` | a second `metrics.getMeter` call in `middleware.ts`; `@opentelemetry/api` imported by realtime or by the recipe; a meter port in `@lockness/contract` |
| 14. What the pass-handler and sweep-chain failure lines say | `PASS_SAMPLE_FAILED`, `PASS_SAMPLE_LOG_FAILED` and `SWEEP_LOG_FAILED`, `packages/realtime/drivers/redis.ts` | inlined text in `#emitPassSample`; reuse of `REVOCATION_LOG_FAILED` for a sweep line; the text copied into a test instead of the constant imported |
| 15. A package's measurement reaches the app through a seam; the library records and never judges | ADR 012, `docs/adr/012-measurements-reach-the-app-through-a-seam.md` (A5; the S2 ruling, ADR 009 `:177`) | a threshold, a slow-pass WARN or a default alert in the driver; a duration compared against `reconcileIntervalMs` in code |
| 16. A log-sink failure on the sweep chain never escapes: one marked `console.error` line | #362 row 20 (the #369 rule); the sweep chain's final `.catch` in `#armReconcile` is its **third asker** (A1) | a silent `.catch`; a `try` around each `console.warn` in the sweep; a marker reused from `REVOCATION_LOG_FAILED` |
| 17. What `outcome: 'ok'` means: the enumeration completed, not that every record was applied | row 1's home, the `PassSample` JSDoc (S1) | a `failures` field; the meaning restated in the observability table instead of linked |

## 6. Technical context

- **Language/Version**: TypeScript on Deno 2.
- **Primary dependencies**: `@lockness/realtime` gains **nothing**. `@lockness/telemetry` keeps its
  one declared `npm:@opentelemetry/api`.
- **Storage**: none. Per driver: one handler, and at most two small pass records.
- **Testing**:
  - `deno test`;
  - FakeTime, plus a stubbed `performance.now` (#362's pattern);
  - FakeRedis, which honours `COUNT` on `SSCAN` and `ZSCAN` (§4);
  - the shared mutation harness.
- **Target**: server library. **Project type**: framework packages.
- **Performance**:
  - zero broker round trips;
  - with no handler: no allocation, no call, and two extra clock reads per sweep pass;
  - with a handler: one frozen object and one call per pass.
- **Constraints**:
  - no wire, control-plane, manager, option-shape or `BroadcastDriver` change;
  - no new dependency edge;
  - no npm specifier outside telemetry.
- **Scale**: at most one sample per pass. Cardinality is at most 12 series per instrument (SC-006).

### Domain model

- **Bounded context**: realtime (the Redis driver's two ADR 006 background passes). Telemetry is a
  separate context, reached only by the application.
- **Vocabulary**:
  - *pass*: one ghost sweep or one revocation re-check;
  - *pass sample*: what one completed pass reports;
  - *trigger*: timer, reconnect or reconnect-retry;
  - *outcome*: ok or failed (closed is private);
  - *page*: one decoded `SSCAN` or `ZSCAN` reply;
  - *pass clock*: #362's monotonic clock;
  - *end site*: a pass's one `finally`.
- **Entities**: `RedisBroadcastDriver`, the aggregate root. It owns both pass records, the handler,
  and the timers.
- **Value objects**:
  - `PassSample`, frozen;
  - the pass records;
  - `PassOutcome`.
- **Invariants**:
  - at most one sample per completed pass, and none after `close()` begins;
  - an observer never stretches a pass (never awaited), and never breaks a loop, `close()` or the
    process;
  - durations are read on the pass clock only;
  - the library never judges a sample.
- **Out of scope**:
  - acting on either revisit trigger (ADR 008, ADR 009);
  - buffering samples for a late handler;
  - paging `SMEMBERS`;
  - a per-record failure count (S1 residue);
  - a sample for a stalled pass (#362's deadline covers the revocation pass; the sweep's stall is
    #368's `close()` hang).

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | not touched |
| JSR-only deps, declared per package | pass | no new dependency. The OTel npm exception stays in telemetry (`deno.json`, already declared); realtime and the recipe stay JSR-only |
| No `any` in exported APIs | pass | `PassSample` is fully typed; `getMeter` returns OTel's `Meter` |
| Tailwind v4 syntax | pass | no UI |
| Pre-completion gate | pass | per task, plus `deno task mutate realtime`, `deno task deps:analyze` and `deno task agents:brief --check` |
| `deno.lock` untouched | pass | no dependency change |
| JSDoc on public APIs | pass | FR-013 lists every block; `meter.ts` carries `@fileoverview` and `@module` |
| MVC layering | pass | not applicable (driver) |
| Commit discipline | pass | test (red witnesses) / feat (realtime seam, telemetry `getMeter`) / test (battery, re-anchors) / docs (ADR 012, observability, realtime, ADR 008 and 009 update lines, AGENTS, READMEs) |
| No environment detail in versioned files | pass | none |
| Design decisions go to architect-expert | pass | the disposition and the audit rulings (§10, §11, 2026-09-24) are binding |
| Product decisions go to the user | pass | one question (§12, the instrument names) |
| Act, don't recommend | pass | no follow-up is deferred as advice. The sweep-chain final handler is in scope (A1). `SMEMBERS` paging and the per-record failure count (S1) are §9 residue, filed by the coordinator |
| TDD, red first | pass | P1–P10, P12 and T1 are red (including P4 (iv), P8 (v) and P12 (ii)); P11 and P13 are pins |
| No silent catches | pass | every containment writes a WARN, and its failure writes a marked ERROR (#369) |
| Domain Model gate | pass | §6 |
| #355 declared return type; the one timer gate | pass | FR-008; row 6 |
| #360 S2 ruling: record, never judge | pass | row 15 |

### Complexity tracking

No violation. What is added:

- one exported interface, one method, one private emit method, one private field, one private
  record field, and two exported constants;
- one widened record type and one renamed alias;
- two page increments;
- one start record and one end sample on the sweep, plus a final `.catch` (A1);
- two reply decoders (S2) and one more exported constant (`SWEEP_LOG_FAILED`);
- one end sample on the revocation pass;
- one telemetry module and one ADR.

`#emitPassSample` stays in `redis.ts`. It is one responsibility of the driver, the observer's call
site, not a module-sized one. That is the `#refuseControl` precedent.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` public API | yes, **additive** | `RedisBroadcastDriver.onPassComplete`; `type PassSample` exported from `mod.ts` |
| `BroadcastDriver` interface, memory driver | no | the seam is Redis-only (row 11) |
| `@lockness/telemetry` public API | yes, **additive** | `getMeter` |
| Logs | on handler failure, a sweep log-sink failure, or a malformed sweep reply | `PASS_SAMPLE_FAILED` WARN; `PASS_SAMPLE_LOG_FAILED` and `SWEEP_LOG_FAILED` ERROR lines; the existing "roster reconcile failed" WARN on a malformed `SMEMBERS` or `EXISTS` reply (S2, item 19) |
| Metrics | only when the app wires the recipe | two histograms, named in the observability doc |
| Driver internals | yes | the record's `pages`, `#sweepPass`, `PassOutcome`, `#reconcile`'s return type, both end sites |
| Wire, control plane, manager, options, dependency graph | no | — |
| Tests | yes | two new witness files, a new battery, and the §4 re-anchors |
| Docs | yes | observability instrument table and recipe; realtime paragraph, lifecycle line, refusal recipe and upgrade item 19; ADR 012; ADR 008, 009 and 011 update lines; both AGENTS.md; both READMEs; JSDoc |

### Documentation (this feature)

```text
.specnaut/specs/269-pass-duration-metric/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A battery row anchored in `#armReconcile`, `#reconcile`, the `SSCAN` loop or the outcome alias goes DEAD | §4 lists all 5 re-anchors and 6 re-verifications; FR-011 fixes the insertion points; `deno task mutate realtime` is in the gate. Rows are re-anchored, never deleted |
| A page-count witness hard-codes the disposition's `3` and fails on the fake (D12) | P2 and P3 assert against the fake's served-command count |
| An existing sweep test counts WARN lines, and now sees a new one | A new line appears only when a registered handler fails, and no existing test registers one |
| The sweep's `.then`/`.finally` restructure changes when `close()`'s awaited promise settles | It settles after the sample is handed over, which is never awaited. P7 (ii) and P8 (iv) pin `close()` resolving; the full realtime suite runs before and after the first edit |
| The `pages` field makes #362's `inFlight` record mutable | Only `pages` is mutable; `trigger` and `startedAt` stay `readonly`; `EnforcementDeadline` reads neither `pages` nor writes anything |
| **Residue (disposition 1)**: two apps can name the metric differently | Accepted; one home in the observability doc (row 12) |
| **Residue (2)**: a stalled pass produces no sample | #362's deadline for the revocation pass; for the sweep, an absence of samples, and #368 |
| **Residue (3)**: `durationMs` includes the apply and the tail wait | Stated in the `PassSample` JSDoc (row 1) |
| **Residue (4)**: revocation `pages` can include a lapse re-check's pages run ahead on the tail | Stated in the `PassSample` JSDoc |
| **Residue (5)**: `SMEMBERS` and `EXISTS` are timed but not paged | Stated; a backlog item for paging the instance set, filed by the coordinator |
| **Residue (6)**: samples are not buffered | Stated in the realtime paragraph |
| **Residue (7)**: revisit triggers become observable, not acted upon | Out of scope, as the issue states |
| A deployment with a broker answering malformed `SMEMBERS`/`EXISTS` replies starts seeing one WARN per sweep pass (S2) | Intended, and announced in upgrade item 19 |
| **Residue (S1)**: `ok` does not mean every record was applied, and no sample counts per-record failures | Defined in the `PassSample` JSDoc (row 17). A per-record failure count for both passes, through the interface, is a backlog item filed by the coordinator |
| **Residue (D2)**: the sweep pays two clock reads per pass with no handler | Accepted: sub-microsecond, once per `reconcileIntervalMs` |
| **Residue**: the trigger enum `'timer' \| 'reconnect' \| 'reconnect-retry'` is spelled in four pre-existing places, and `PassSample` adds a fifth, the public one | Unifying them edits `#revocationRerun`'s line, which #359 M17 anchors. Left as is; noted for the audit |
| A `throw` from `console.error` in any fallback (`PASS_SAMPLE_LOG_FAILED`, `SWEEP_LOG_FAILED`) is fatal | Accepted, as in #369 and #362 (S3 residue) |
| The ADR number collides with another landing | Assigned at landing |

## 10. Architecture audit

*`architect-expert`, against this document before any code. Its rulings are **binding** (hard rule
#11), folded 2026-09-24.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 (HIGH) | The sweep chain has no final `.catch`. A `console.warn` that throws during any ghost release is fatal, which is the #369 class | Plan changed. A final `.catch` writes one marked `console.error` line with the new constant `SWEEP_LOG_FAILED` (#360): FR-009a, D7, row 16 (the third asker of #362 row 20). Row 5 no longer lists the `.catch` as a duplicate; both the `.catch` and the emit's containment stay. Witness P12 (ii); mutants M19 and M20. No new re-anchor. **Rejected**: leaving it as residue (the same rows re-anchored twice, and the sweep default shipped with no witness), and a shared `#runPass` (Rule of Three) |
| A2 (MED) | Four rows had no single home | Plan changed. 3a → `PassOutcome`'s JSDoc, with the `let` lines as askers. 4 → `#emitPassSample`'s JSDoc (naming both callers, with every argument from the closure), which the D10 clause and `#armReconcile` link. 9 split into 9 (`#revocationPass`, amends #362 row 12) and 9a (`#sweepPass`); the closure rule moves to row 4. 10 → an asker of row 1 |
| A3 (LOW) | D5's reasoning | Plan changed. `#sweepPass` is named a Temporary Field, accepted for parity with `#revocationPass`; the anchor-cost reason is dropped. The sweep's `.finally` reads `endedAt` first (FR-009) |
| A4 (LOW) | D2 and row 8: `#passClock`'s JSDoc lists its readers | Plan changed. The sweep joins the reader list (FR-013) |
| A5 (LOW) | ADR 012 is warranted, and wider | Plan changed. ADR 012 is scoped as the rule for any package's measurements, with realtime passes as the first instance, recording the four rejected options (FR-014, row 15). ADR 011 gets a dated update line (FR-013) |
| A6 (LOW) | D12's witnesses could pass vacuously | Plan changed. P2 and P3 (i) and (iii) assert `served > 1` first |
| — | D3, D4 (with the row-12 amendment), D6, D8, and row 13 (`telemetry/meter.ts`, no new edge) | **Accepted as written.** Rejected for row 13: re-exporting OTel's `metrics`, or putting `getMeter` in `middleware.ts` |

**Verdict** (as relayed): the design stands with A1–A6 folded. **Coverage** (as relayed): this plan
in full, D1–D12, the decision table, the witnesses and mutants, and the blast radius. The per-file
list was not itemised in the relay.

## 11. Security audit

*`security-expert`, in parallel with the architecture audit. Each finding was ruled on by the
`architect-expert`; the rulings are binding.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 (MED) | `outcome: 'ok'` could be read as "every record applied" | Plan changed. The `PassSample` JSDoc (row 1's home) defines it as "the enumeration completed, not that every record was applied; per-record failures only as named WARNs" (FR-001, row 17). The FR-013 table links it. **No `failures` field**: the driver cannot count the revocation applies, which happen in the manager. Residue, filed by the coordinator: a per-record failure count for both passes, through the interface |
| S2 (LOW) | `SMEMBERS` and `EXISTS` replies are read through lenient fallbacks, so a malformed reply silently sweeps nothing or counts as alive | Folded in this change. `decodeMembersReply` and `decodeExistsReply` go beside `decodeScanReply`, called inside `#reconcile`'s `try` (FR-008a). Row 3 gains "a reply that does not decode is a throw". Witness P4 (iv); mutant M21. It is observable, so it gets **upgrade item 19** |
| S3 (LOW) | The promise containment's shape | Confirmed, corrected. The attachment is `Promise.resolve(r).then(undefined, warn)` inside the same `try` (FR-004). Witnesses P8 (v) (i) (a `constructor` getter that throws, the one synchronous throw left) and (ii) (a thenable that rejects three times gives one WARN); mutants M22 and M23. Residue: a `console.error` that throws is fatal, as in #369 |
| S4 | The sweep chain's final rejection path | Covered by A1 |

**Clean**:
- handler isolation (Q1);
- no identifiers in a sample, and bounded cardinality (Q2);
- ordering against #362 (Q3);
- `close()` (Q4).

**Verdict** (as relayed): all findings ruled on and folded above. **Coverage** (as relayed): handler
isolation, cardinality and identifiers, ordering with #362's deadline, `close()`, the sweep's reply
decoding, and log-sink failure. The per-file list was not itemised in the relay.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Product (D11)**: the recipe's instrument names are what every operator's dashboards will carry. **Option A**, the disposition's: attribute `lockness.realtime.pass`, which is also the namespace of `.trigger` and `.outcome` (OTel's naming rules advise against that), with the duration in `ms`. **Option B**, the OTel-conformant form: `lockness.realtime.pass.kind` / `.trigger` / `.outcome`, the duration in `s` (the recipe divides `durationMs` by 1 000), pages in `{page}`, and **explicit histogram buckets**. The drafter recommended B. The architect's engineering view was also B. | **Option B** (maintainer). Attributes `lockness.realtime.pass.kind` (`sweep` \| `revocation`), `.trigger` and `.outcome`; `lockness.realtime.pass.duration` in `s`; `lockness.realtime.pass.pages` in `{page}`; explicit bucket boundaries in the recipe (FR-013) | 2026-09-24 |
| D3, D4, D5, D6 and D7, put to the architecture audit | **Ruled** (§10): D3, D4, D6 accepted as written; D5 accepted as a Temporary Field (A3); D7 extended with a final `.catch` on the sweep chain (A1) | 2026-09-24 |
| Approve the architecture as audited (tasks → implement → review)? | **Approved** (maintainer) | 2026-09-24 |

### Decided without asking

- The design is the #360 `architect-expert` disposition (2026-09-23), binding under hard rule #11.
- `PassSample` stays one flat interface, as ruled, not a union discriminated on `pass`. The sweep's
  trigger is always `'timer'`.
- **Upgrade item 19** covers only S2's observable change. The seam itself is additive, and the
  Release's commit log carries it.
- ADR 008, 009 and 011 each get a dated update line; their recorded text is not edited.
- `getMeter` goes in its own `meter.ts`, so `mod.ts` stays a barrel, and `middleware.ts` calls it,
  so `metrics.getMeter` has one caller.
- The `@example` on `onPassComplete` names no instrument, so the names keep one home (row 12).
- `#emitPassSample` stays in `redis.ts`, following the `#refuseControl` precedent.
