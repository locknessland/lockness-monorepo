# Plan: Close four registration-lifecycle gaps in the disposables registry

**Issue:** #140 · **Branch:** `019-disposables-registry-gaps` · **Type:** tech-debt
**Bounded context:** `core` (framework lifecycle), touching `cache` and `queue` as registrants.

## 1. Why this exists

#136 introduced the process-wide **disposables registry**
(`@lockness/contract/lifecycle/disposables.ts`) — the mechanism the framework
relies on to release OS resources (Deno KV handles, Redis connections, worker
loops) at shutdown. Its value rests on one property: **the drain sees everything
that owns a live resource, and nothing that owns none.**

Four registration-lifecycle edge cases break that property. Two are resource
leaks — the exact class of bug #136 existed to close — and two grow the registry
without bound in a long-lived process. None is on the common path, so none blocks
a release; together they are one coherent pass over registration correctness in a
single new mechanism, which is why #140 tracks them as one item rather than four.

Measured facts from the current tree:

- `QueueWorker` registers at field-initialiser time (`packages/queue/mod.ts:411`)
  and `stop()` clears the handle (`:485-489`); a stopped-then-restarted worker is
  invisible to the drain and its loop is never stopped at shutdown.
- `RedisCacheDriver` registers unconditionally in its constructor
  (`packages/cache/drivers/redis_driver.ts:268`); a driver created and dropped
  without `close()` stays registered for the process lifetime.
- `DenoKvCacheDriver.getKv()` opens between the `if (!this.kv)` guard and the
  assignment (`packages/cache/drivers/deno_kv_driver.ts:76-88`); two callers
  racing the cold path both open a handle and the first leaks unreferenced.

## 2. User scenarios

The "user" here is a framework operator running a long-lived Lockness process and
relying on clean shutdown. Each journey is independently testable.

### US1 — a restarted worker is stopped at shutdown (P1)

- **Given** a `QueueWorker` that was started, stopped, and started again,
- **When** the process drains disposables at shutdown,
- **Then** the worker's loop is stopped (its registration is present again).

### US2 — a discarded driver does not accumulate in the registry (P1)

- **Given** a `RedisCacheDriver` created for a short-lived scope and dropped
  without owning its client,
- **When** it goes out of scope,
- **Then** it holds no registry entry (it announced no closable resource).

### US3 — a concurrent cold start opens exactly one KV handle (P1)

- **Given** a fresh `DenoKvCacheDriver`,
- **When** two callers invoke a cache operation concurrently before the handle
  exists,
- **Then** exactly one `Deno.Kv` handle is opened and exactly one registration is
  made; no handle leaks.

### Edge cases

- `close()` on a KV driver whose open is still in flight must await that open and
  close the single handle — never double-close (`Deno.Kv.close()` throws on the
  second call).
- A `QueueWorker` constructed and never started owns nothing and must hold no
  registration.
- `start()` called twice without an intervening `stop()` must keep exactly one
  registration.
- A non-owning Redis driver's `close()` must remain a safe no-op for the
  connection (it withdraws its registration, if any, and closes nothing).

## 3. Requirements

- **FR-001** `QueueWorker.start()` registers the worker's disposable if it is not
  already registered; construction alone registers nothing.
- **FR-002** `QueueWorker.stop()` deregisters and clears the handle (unchanged),
  so a subsequent `start()` re-registers.
- **FR-003** `RedisCacheDriver` registers a disposable **iff** it owns its client
  (`ownsClient === true`); a non-owning driver registers nothing. The stale
  constructor comment (`redis_driver.ts:263-266`), which documents the opposite
  intent, is rewritten to match. *(A3)* An **owning** driver additionally
  self-deregisters on GC via a `FinalizationRegistry` — which requires the
  registered disposable to hold the driver by `WeakRef` (see §12 OQ-1 for the
  pinning constraint). *(OQ-1)*
- **FR-004** The Deno-KV cold path acquires the underlying handle at most once
  under concurrency (single-flight), registering exactly one disposable —
  applied to **both** `DenoKvCacheDriver.getKv()` and `DenoKvQueueDriver.getKv()`
  (`queue/mod.ts:192-204`), pending OQ-2. *(A2)*
- **FR-005** The KV driver's `close()` releases the single handle whether the
  open has resolved or is still in flight, and is safe to call twice — both
  drivers, pending OQ-2.
- **FR-006** Each of SC-004, SC-005, SC-006 has a unit test that **fails against
  the unfixed behaviour** and passes against the fix (negative-tested). Includes
  the twice-called-`close()` and single-handle-under-race assertions (security
  §11 INFO carry).
- **FR-007** The three existing `queue/tests/shutdown.test.ts` cases that assert
  construction-time worker registration (`:43-45`, `:53-59`, `:95-98`) and the
  vacuous injected-redis case (`cache/tests/shutdown.test.ts:72-90`) are
  rewritten to the new invariants (SC-002 / SC-005). *(A1, A5)*

## 4. Success criteria

- **SC-001** After a start→stop→start cycle, `disposableCount()` reflects the
  worker as registered; after the final stop it returns to its prior value.
- **SC-002** Constructing a `QueueWorker` does not change `disposableCount()`.
- **SC-003** Constructing a non-owning `RedisCacheDriver` does not change
  `disposableCount()`; constructing an owning one increments it by one and
  `close()` returns it.
- **SC-004** *(worker restart)* — negative-tested per FR-006.
- **SC-005** *(redis non-owning does not register)* — negative-tested per FR-006.
- **SC-006** *(kv single-flight opens one handle)* — two concurrent cold-path
  calls open exactly one `Deno.Kv`; negative-tested per FR-006.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| A `QueueWorker` is registered **iff its loop is running** — registered on `start()`, withdrawn on `stop()` | `packages/queue/mod.ts` (`QueueWorker.start` / `.stop`) | a `registerDisposable` call in the field initialiser *and* in `start()`; a `stop()` that leaves the handle set; any second place that decides "is this worker live?" |
| A `RedisCacheDriver` is registered **iff it owns its client** (`ownsClient === true`) | `packages/cache/drivers/redis_driver.ts` (constructor) | an unconditional `registerDisposable` in the constructor; a `registerDisposable` moved into `close()`; a second read of `ownsClient` to gate registration elsewhere |
| The KV handle is acquired **at most once** (single-flight promise) and registered **exactly once** | `packages/cache/drivers/deno_kv_driver.ts` (`getKv`/opener) **and** `packages/queue/mod.ts` `DenoKvQueueDriver` (`getKv`, `:192-204`) — pending OQ-2 | the `check → await → assign` shape (present in **both** drivers today); keying registration off the resolved `kv` field rather than the in-flight promise; a second cold-path guard in `get`/`set`; **the `close()`-side shape** — a re-introduced `if (this.kv) { this.kv.close() }` that skips the in-flight promise and re-opens the double-close/leak |

Each rule's third column is what a reviewer greps for. Note that `close()` in
each driver already *asks* "do I hold a handle?" and withdraws it — that is a
second **asker**, which is fine; the **decider** ("should this thing be
registered at all?") stays in the one home named above. **A2/A4:** row 3 names
**two** KV-driver homes (the queue driver carries the identical race) and the
`close()`-side duplication shape, per the architecture audit.

## 6. Technical context

- **Language / runtime:** Deno, native TypeScript, TC39 Stage 3 decorators.
- **Packages touched:** `@lockness/queue` (`mod.ts`), `@lockness/cache`
  (`drivers/redis_driver.ts`, `drivers/deno_kv_driver.ts`). No change to
  `@lockness/contract`'s registry API — the four fixes are all on the registrant
  side.
- **Testing:** `Deno.test` unit tests under `packages/queue/tests/` and
  `packages/cache/tests/`. Resource/op sanitizers are on by default; the KV
  single-flight test stubs `Deno.openKv` with a controllable deferred and
  restores it, and asserts call-count — no real handle opened. `disposableCount()`
  is the read-only probe every assertion uses.
- **Constraints:** additive, non-breaking; no public API surface changes; the
  `SHUTDOWN_PRIORITY` bands and PREDRAIN ordering from #136 are untouched.
- **Scale:** the leak class matters only in long-lived processes that create and
  drop many registrants (per-tenant drivers, workers cycled on redeploy).

### Domain model

- **Bounded context:** `core` (framework lifecycle), with `cache` and `queue` as
  registrants.
- **Vocabulary:** *Disposable* — a resource a package must release before exit;
  *Registration* — announcing a disposable, yielding a handle; *Drain* — the
  shutdown pass; *Cold path* — the first call that lazily acquires a handle.
- **Entities:** `DisposableRegistry` [aggregate root, a `Set` keyed by identity];
  `QueueWorker`; `DenoKvCacheDriver` / `RedisCacheDriver`.
- **Value objects:** `DisposableHandle` — opaque, valid for one registration,
  not reusable after withdrawal; `ShutdownPriority(band)`.
- **Invariants:**
  1. A registrant that owns a live resource **is** registered (else it is invisible
     to the drain — the failure mode all four criteria describe).
  2. A registrant that owns nothing **is not** registered (else the drain's work
     is unbounded and its output misleading).
  3. Registration count matches acquired-handle count (the mismatch in US3 is
     exactly how a handle leaks unreferenced).
- **Out of scope of the model:** `session` context — it does not touch the
  registry today and cannot until #138 changes how its drivers are constructed.

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| No direct `hono` import | ✅ N/A — no HTTP code touched |
| JSR-only specifiers | ✅ bare `@lockness/contract/lifecycle/internal` imports unchanged |
| No `any` in exported APIs | ✅ no exported signatures change; internal types stay typed |
| Tailwind v4 syntax | ✅ N/A — no UI |
| Pre-completion gate | ✅ `deno fmt && deno lint && deno check <files> && deno task test` before done |
| Never edit `deno.lock` | ✅ no dependency change |
| JSDoc on public APIs | ✅ touched methods keep/extend their JSDoc; no new public API |
| MVC layering | ✅ N/A — infrastructure/driver code |
| Commit discipline | ✅ split by category: `fix(queue)`, `fix(cache)`, `test`, `docs` if any |
| TDD | ✅ failing test first for each of SC-004/005/006 |
| No silent catches | ✅ no new `catch` introduced |

### Complexity tracking

No principle is violated; no entry.

## 8. Surface impact

- **Client surfaces touched:** none. All three fixes are internal to registrant
  classes; no route, CLI command, decorator, or exported signature changes.
- **Interface contracts exposed:** none new. `QueueWorker`, `RedisCacheDriver`,
  `DenoKvCacheDriver` keep their public shapes; only *when* they register changes.
- **Observable behaviour change:** a `QueueWorker` constructed and never started
  is no longer registered (previously it was). This is a correctness fix aligned
  with invariant 2, not a breaking API change — but it is a behaviour delta worth
  naming, and it is the subject of the one open question below.

### Documentation (this feature)

- The disposables-registry behaviour is documented at the contract level; the
  registrant-side timing is an implementation detail. A short note may be added
  to each driver/worker's JSDoc (already partially present). No user-facing doc
  page requires an update; `docs/lifecycle-events.md` is reviewed for staleness
  and updated only if it asserts the old timing.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| The KV single-flight refactor changes `close()`'s race handling and could double-close | `close()` takes-and-clears the promise, awaits it, closes once; a dedicated test calls `close()` twice and asserts no throw |
| The `ownsClient` gate changes when Redis drivers appear in the drain | Non-owning drivers dispose nothing today (`close()` closes only when owned), so removing their registration is behaviour-preserving at drain; a test asserts an owning driver still registers and drains |
| Moving worker registration into `start()` breaks **three in-repo test callers** — `queue/tests/shutdown.test.ts:43-45`, `:53-59`, `:95-98` all assert construction-time registration (`disposableCount()===1` after `new QueueWorker()`) | **A1 correction:** FR-007 rewrites all three to the new invariant (SC-002: construction registers nothing); the start-then-drain shape already at `shutdown.test.ts:17-37` is the pattern. No production caller depends on it (`cli/commands/queue_commands.ts` calls `start()` immediately) |
| The `ownsClient` gate changes when a non-owning Redis driver is marked closed — `close()` runs `markDriverClosed(this)` and the store recycle-guard reads `isDriverClosed` (`store.ts:37`); an un-registered driver's `close()` never fires at drain | **A3 correction — benign:** a non-owning driver's client is left open by design, so it is never a closed handle the store must avoid recycling; there is nothing for the recycle-guard to catch. The delta is real but has no failing behaviour. Stated here rather than asserted as neutral |
| A test asserts against `disposableCount()` and bleeds across cases | Each test drains/clears in setup or asserts deltas, not absolutes, per the registry's take-and-clear contract |

## 10. Architecture audit

**Verdict: FAIL on first pass → corrected in this document** (`architect-expert`,
plan-time). 1 HIGH, 2 MEDIUM, 2 LOW, all verified against the tree and folded in.
None is a design flaw; all are plan-completeness gaps (an undercounted blast
radius and an incomplete decision table) — the exact class this audit exists to
catch before code.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| A1 | HIGH | §9 claimed "no in-repo caller depends on construction-time `QueueWorker` registration (grep `new QueueWorker`)" — the grep counted **production only**. Three tests in `queue/tests/shutdown.test.ts` (`:43-45`, `:53-59`, `:95-98`) assert construction-time registration and go red under FR-001. | **Accepted & corrected.** §9 rewritten to name three test callers, not zero. FR-007 added: those three tests are rewritten so SC-002 (construction registers nothing) replaces the old `count===1` assertions. Budgeted in tasks. |
| A2 | MED | `queue/mod.ts:192-204` (`DenoKvQueueDriver.getKv`) carries the **identical** `check→await→assign` race the plan targets in the cache driver. Fixing only the cache driver leaves an identical leak and falsifies §5 row 3's "single home". | **Surfaced as OQ-2** (fix both vs scope-out). Recommendation: fix both in this pass — same fix, same defect. FR-004/FR-005 and §5 row 3 updated to cover **both** KV drivers pending the answer. |
| A3 | MED | §9's "behaviour-preserving at drain" for FR-003 ignored `markDriverClosed(this)` (`redis_driver.ts:531`) and the store recycle-guard `isDriverClosed` (`store.ts:37`): an un-registered non-owning driver's `close()` never fires at drain, so it is never marked closed there. Also the constructor comment `:263-266` documents the **opposite** intent. | **Accepted & corrected.** §9 states the `markDriverClosed` delta and why it is benign (a non-owning driver's client stays open, so post-shutdown recycling is not needed). FR-003 amended to require rewriting the stale `:263-266` comment. |
| A4 | LOW | FR-005 (in-flight close / double-close safety) has no §5 row; row 3's third column names only the `getKv` acquisition shape, not the `close()` shape where a future editor re-opens the leak. | **Accepted & corrected.** §5 row 3's third column now names the `close()`-side shape (`if (this.kv) { this.kv.close() }` re-introduction). |
| A5 | LOW | `cache/tests/shutdown.test.ts:72-90` (injected non-owning redis) becomes **vacuous** under FR-003 — it drains an empty registry and passes for the wrong reason. | **Accepted & corrected.** FR-007 scope extended: that test is rewritten to assert non-registration (`disposableCount` unchanged) — this is SC-005's negative test. |

## 11. Security audit

**Verdict: PASS** (`security-expert`, plan-time, before any code). Coverage: the
*design* judged against `disposables.ts`, `queue/mod.ts:395-540`,
`redis_driver.ts:230-345,515-540`, `deno_kv_driver.ts:40-168`. Reachability gate
applied: **no HTTP surface, no new input parameter, no new authorization
decision, no attacker-controlled data** reaches any of the three registrants
(all use constant dispose names — `'queue:worker'`, `'cache:redis'`,
`'cache:deno-kv'`). Findings reported as new (nothing to confirm against — board
clean). CRITICAL/HIGH/MEDIUM/LOW: 0.

The four questions, answered:

1. **New input surface?** None. `start()` takes no args; the Redis gate reads
   `options.ownsClient` (config, not request); KV uses `this.kvPath` (config).
2. **Authorization / token exposure?** No new decision. Deregistration stays
   by opaque handle, never by name (the control that stops a colliding-name
   attacker cancelling another module's teardown). No fix logs a name, path, or
   credential.
3. **Reachable bytes / DoS?** The KV handle is per-instance; single-flight makes
   the two racing callers of one instance share one handle — no trust boundary
   crossed. The current race leaks **at most one** fd per instance and only on a
   first-op race; there is no request path that constructs a driver per request,
   so an attacker cannot multiply it. **SC-006 is a P1 correctness leak, not a
   security severity.** `close()`'s take-and-clear-await-close-once removes the
   double-close throw, and core's per-`dispose` try/catch contains it regardless.
4. **Stranger → another account?** Nothing — no account/tenant datum is touched.

**Disposition — FINDING 1 (INFO, defence-in-depth, no action):** double-close of
`Deno.Kv` under single-flight is soundly mitigated by the plan's design and
doubly contained by core's per-`dispose` try/catch. No plan change. **Carried
into FR-005/FR-006:** the twice-called-`close()` test *and* an assertion that the
in-flight-open branch closes exactly one handle are required.

**Advisory (out of scope for #140):** if a future change ever derives a
disposable name from tenant/request data, the encode-at-log-site rule in
`disposables.ts:52-56` must be honoured.

## 12. Open questions

- **OQ-1 — Redis leak scope.** The `ownsClient` gate (FR-003) stops *non-owning*
  drivers from accumulating, which is the default and the common per-tenant shape
  (a shared client handed in). It does **not** cover an *owning* per-tenant driver
  dropped without `close()` — that would need a `FinalizationRegistry` to
  deregister on GC. The GC path is non-deterministic and cannot be negative-tested
  reliably (FinalizationRegistry callbacks are not guaranteed to run), so it would
  ship an AC without the test AC-4 demands. **Recommendation:** ship the
  `ownsClient` gate only; treat "owned resource dropped without `close()`" as an
  application bug (you dropped something you own without releasing it), not a
  registry defect. *To be confirmed at the stop.*

- **OQ-2 — the second KV driver (architecture A2).** `DenoKvQueueDriver.getKv()`
  (`queue/mod.ts:192-204`) carries the **identical** `check→await→assign` race
  the plan fixes in the cache driver. **Recommendation:** fix both in this pass —
  it is the same fix on the same defect, keeps §5 row 3's "single home" honest,
  and closes an identical leak now rather than filing a follow-up that reads as a
  copy of #140. Alternative: scope the queue driver out, record two homes in §5,
  and file a follow-up ticket. *To be confirmed at the stop.*

### Settled at the stop (2026-09-02)

- **OQ-1 → also add GC deregistration.** FR-003 keeps the `ownsClient` gate
  (deterministic, negative-tested by SC-005: a non-owning driver registers
  nothing) **and** adds a `FinalizationRegistry` so an *owning* driver dropped
  without `close()` self-deregisters on GC.
  **⚠ Implementation constraint the choice forces — the developer must honour it,
  or the finalizer never fires:** the registry holds a **strong** reference to
  each `Disposable`, and today `dispose: () => this.close()` closes over the
  driver — so a registered driver is *pinned* and can never be GC'd. For GC
  deregistration to work at all, the registered disposable must reference the
  driver **weakly** (`const ref = new WeakRef(this); dispose: () =>
  ref.deref()?.close()`), with a module-level `FinalizationRegistry` (target =
  driver, held value = the `DisposableHandle`, unregister token = the driver)
  whose cleanup calls `deregisterDisposable(handle)`. `close()` also unregisters
  the token to avoid a late no-op. At drain the app still holds the active
  driver, so `deref()` resolves and `close()` runs normally.
  **Testability limit (stated, not hidden):** the GC path cannot be
  deterministically negative-tested — `FinalizationRegistry` callbacks are not
  guaranteed to run. SC-005's deterministic test covers the `ownsClient` gate;
  the GC deregistration is covered by a best-effort test gated on
  `globalThis.gc` (run under `--v8-flags=--expose-gc`) that is skipped when the
  hook is absent, plus a JSDoc note. This is the AC-4 tension flagged at the
  stop, accepted by the user.
- **OQ-2 → fix both KV drivers now.** The single-flight fix (FR-004/FR-005)
  applies to `DenoKvCacheDriver` **and** `DenoKvQueueDriver` (`queue/mod.ts`) in
  this pass. §5 row 3 names both homes; no follow-up ticket is filed because the
  identical defect is closed here.

### Decided without asking

- **QueueWorker registration moves out of the field initialiser into `start()`.**
  Settled by the issue's own invariant 2 ("a registrant that owns nothing is not
  registered") — a constructed-but-never-started worker owns no running loop. A
  never-started worker will no longer be drained, which is correct.
- **Single-flight via a memoised promise** (`this.kvPromise ??= …`), not a lock
  flag — the idiomatic Deno pattern, and it makes `close()`'s in-flight handling
  a straight `await`.
- **Test doubles over real resources** for the KV race — stub `Deno.openKv`,
  count calls, restore it; keeps the resource sanitizer green.
