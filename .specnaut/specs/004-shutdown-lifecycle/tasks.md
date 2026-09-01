---

description: "Dependency-ordered breakdown for the shutdown lifecycle"
---

# Tasks: Framework-wide shutdown lifecycle for `@lockness/core`

**Input**: `/.specnaut/specs/004-shutdown-lifecycle/plan.md`
**Backlog item**: [#129](https://github.com/locknessland/lockness-monorepo/issues/129)

**Tests**: **required, and first.** The constitution makes TDD non-negotiable for the `developer`
agent — failing test, then minimal code, then refactor. Every FR below gets a test task before its
implementation task.

**Organization**: grouped by the user stories in `plan.md` § 2, in priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelisable: different file, no dependency on an incomplete task.
- **[Story]** — US1…US4 from `plan.md` § 2. Setup, Foundational and Polish carry no story label.

## 🔒 Carried forward from the decision table

`plan.md` § 5 is **binding on every task below**. A decision may not be spelled anywhere but its
named home. The five that get violated by accident, and the task that would do it:

| The rule | Its only home | The task most likely to duplicate it |
| :--- | :--- | :--- |
| Teardown order | `shutdown_registry.ts` comparator | T023 — `steps/boot_hooks.ts:34-37`, the file it mirrors, **contains the forbidden re-sort** (A9) |
| "Is a sequence in flight?" | `shutdown_sequence.ts` `isShuttingDown` | T031 — a `#stopping` flag in each signal handler |
| Framework teardown priority | `SHUTDOWN_PRIORITY` in `shutdown_registry.ts` | T040/T041 — reusing `BootstrapStep.order` because it is the number already in that file |
| Log encoding | `safeForLog` in `@lockness/contract` | T026 — a local escape helper, or `console.error('...', error)` |
| Process exit | `signals.ts` | T030 — a `Deno.exit` inside the sequence |

**`packages/core/app.ts:23-27` declares a `Deno` shim exposing only `env.get`.** Any `Deno.*` call
written in `app.ts` either fails `deno check` or tempts a widening of that shim. Do neither: signal
and exit code lives in `kernel/signals.ts` (A10, S4).

---

## Phase 1 — Setup

- [X] T001 Confirm the branch and the linked issue: `git branch --show-current` is `004-shutdown-lifecycle`, and `.specnaut/feature.json` names this feature directory with `linked_issue: 129`
- [X] T002 Record the three baseline probes as an executable test in `packages/core/tests/shutdown_deno_behaviour.test.ts` — `addSignalListener` needs no permission; a registered SIGINT handler suppresses the default exit; `setTimeout` clamps `Infinity`/`NaN`/`-1`/`2**31` to 1 ms. These three facts are why the design has a deadline at all; pinning them means a future Deno release that changes one fails a test rather than a production shutdown

## Phase 2 — Foundational (blocks every user story)

### Types and configuration

- [X] T003 [P] Add `ShutdownConfig { signals?: boolean; deadlineMs?: number }` as a **named exported interface** in `packages/core/kernel/kernel_decorators.ts`, beside `DatabaseConfig`/`SessionConfig`/`CacheConfig`, and add the optional `shutdown?: ShutdownConfig` key to `KernelConfig` at `:115` (A12, FR-009)
- [X] T004 [P] Add `shutdownHooks: readonly ShutdownHookMeta[]` to `BootstrapContext` in `packages/core/kernel/bootstrap/types.ts:77`, beside `bootHooks` (FR-013)

### The decorator

- [X] T005 [P] Write the failing tests for `@OnShutdown` in `packages/core/tests/shutdown_decorators.test.ts`: it records `{ method, priority }`; `priority` defaults to `0`; applied to a non-method it throws with the same message shape as `@OnBoot` (FR-001)
- [X] T006 Write the failing subclass-isolation test in the same file: with `class Child extends Base`, `new Base()` then `new Child()` must leave `getShutdownHooks(Base)` holding **only** `Base`'s hook. This is the measured `@OnBoot` defect (R7) and the reason the own-property test exists — the test must fail against a truthiness implementation
- [X] T007 Create `packages/core/kernel/shutdown_decorators.ts` — its own file, **not** appended to `decorators.ts` (A7). Export `OnShutdown`, `OnShutdownOptions`, `ShutdownHookMeta`, `ShutdownHooksContainer`, `KERNEL_SHUTDOWN_HOOKS`. The initialiser uses `Object.hasOwn(constructor, KERNEL_SHUTDOWN_HOOKS)`, never a truthiness test
- [X] T008 Add `getShutdownHooks(kernelOrClass)` to `packages/core/kernel/shutdown_decorators.ts`, mirroring `getBootHooks` (FR-002). **No `runShutdownHooks`** — `plan.md` § 5 records why a second runner is the two-deciders defect
- [X] T009 Write the JSDoc-with-`@example` on every symbol T007–T008 exports, including the priority band read as the mirror of `@OnBoot`'s (FR-015)

### The registry

- [X] T010 [P] Write the failing ordering tests in `packages/core/tests/shutdown_registry.test.ts`: hooks run **ascending** by priority; equal priorities keep registration order; the list is a copy, so mutating what a caller passed changes nothing (FR-004)
- [X] T011 Create `packages/core/kernel/shutdown_registry.ts` with `register(name, fn, priority)` and `run(): Promise<ShutdownReport>`. The comparator lives here and **nowhere else**
- [X] T012 Declare the `SHUTDOWN_PRIORITY` band in `packages/core/kernel/shutdown_registry.ts` — named constants for the framework's own teardowns, with the rule stated in the JSDoc: **a `BootstrapStep.order` value is never reused as a shutdown priority** (FR-020, A2). The two axes are numerically similar and semantically unrelated; `steps/database.ts` is order 100, and 100 under ascending priority closes the database *first*
- [X] T013 [P] Write the failing freeze test: a hook registered after `run()` has started is refused with a warning and never executed (invariant 2, R6)

## Phase 3 — US1 (P1): an author gets a clean exit without writing signal code

**Independent test**: boot an app, send it a real `SIGTERM`, assert the process exits 0 and every
registered hook ran — with no `Deno.addSignalListener` in the app's own source.

- [X] T014 [P] [US1] Write the failing test for `App.onShutdown(name, fn, priority?)` in `packages/core/tests/shutdown_app.test.ts` — registration returns nothing, and the hook is visible to the sequence (FR-003)
- [X] T015 [P] [US1] Write the failing idempotence test: ten `shutdown()` calls produce exactly one teardown, and all ten callers resolve with the **same** report object (FR-005, SC-004). Assert identity with `assertStrictEquals`, not `assertEquals` — a structural compare passes for an implementation that builds a fresh report per caller
- [X] T016 [P] [US1] Write the failing ordering test: the HTTP server stops **before** any hook runs (FR-006)
- [X] T017 [US1] Create `packages/core/kernel/shutdown_sequence.ts` — owns the server handle, the deadline, the memoised promise and the registry (A8). `App` delegates rather than absorbing a fifth responsibility
- [X] T018 [US1] Store the server in the sequence as `Promise<Deno.HttpServer> | undefined` and `await` it before calling `.shutdown()`. **`ServerListener.listen()` returns a Promise cast to a server** — `http/server.ts:63` is `return this.tryServe(...) as unknown as Deno.HttpServer<Deno.NetAddr>` over a `private async tryServe`, which is why `main.ts:7` writes `await app.listen(...)`. Calling `.shutdown()` on the un-awaited value is `undefined is not a function` (R5)
- [X] T019 [US1] Expose `isShuttingDown` (read-only) on the sequence, backed by the same memoised promise — the single home for "is a sequence in flight?" that FR-012 needs and that `plan.md` § 5 row 3 forbids duplicating into the handlers (A4)
- [X] T020 [US1] Wire `App.onShutdown` and `App.shutdown` in `packages/core/app.ts` as one-line delegations to the sequence. No `Deno.*` call in this file (A10)
- [X] T021 [P] [US1] Write the failing signal tests in `packages/core/tests/shutdown_signals.test.ts` as **subprocess** tests — spawn a `Deno.Command`, send a real `SIGINT`/`SIGTERM`, assert the process exited. A real signal cannot be observed in-process without hijacking the test runner's own handler; `packages/core/tests/events_debug_step.test.ts:53` is the in-repo precedent for this technique
- [X] T022 [US1] Create `packages/core/kernel/signals.ts` — installs `SIGINT`/`SIGTERM`, each inside its **own** `try/catch` so a platform that refuses one still installs the other and boot is not failed (FR-010). A `try/catch`, **not** a `Deno.build.os` check: the catch is correct whether or not a belief about which OS supports which signal is right, and `SIGKILL` proves the throw shape is reachable (`TypeError: Binding to signal 'SIGKILL' is not allowed`)
- [X] T023 [US1] Create `packages/core/kernel/bootstrap/steps/shutdown_hooks.ts` at order **320**, mirroring `steps/boot_hooks.ts` (310). ⚠️ **Do not copy its sort.** `steps/boot_hooks.ts:34-37` re-sorts what `boot_runner.ts:131` already sorted — a duplication `plan.md` § 5 row 2 forbids (A9). This step only moves metadata into the registry; the registry orders it
- [X] T024 [US1] Register the step in `packages/core/kernel/bootstrap/registry.ts` — the array at `:68-87` **and** the order-list JSDoc at `:47-64`, which is the second place the order is written
- [X] T025 [US1] Read `KERNEL_SHUTDOWN_HOOKS` in `packages/core/kernel/loader.ts:138-149`, mirroring how `bootHooks` is read, and put it on the context (FR-013)
- [X] T026 [US1] Install the handlers from `App.listen()` when `config.shutdown?.signals !== false` (FR-009), and map the report to an exit code in `signals.ts`: `0` clean, `1` when a hook failed or the deadline expired (FR-011). The exit lives here, never in the sequence
- [X] T027 [P] [US1] Write the failing second-signal test: a second `SIGINT` during an in-flight shutdown exits immediately without waiting, driven through `isShuttingDown` (FR-012)
- [X] T028 [P] [US1] Write the failing opt-out test: with `shutdown: { signals: false }`, no handler is installed and an application with its own pre-existing handler behaves exactly as it does today (SC-009, R3)
- [X] T029 [P] [US1] Write the failing no-`listen()` test: an app that never calls `listen()` installs nothing and is unchanged (SC-006). Holds by measurement today — no test in the repo calls `listen()`, so all 40 `new App()` test sites are covered by this one assertion

## Phase 4 — US2 (P1): a package hands the framework its teardown

**Independent test**: with a scheduled task armed and a database connected, shutdown releases both —
and the test sanitizer reports no leaked timer.

- [X] T030 [P] [US2] Write the failing test that `steps/scheduler.ts` registers a teardown that calls `scheduler().stop()` — today `stop()` has exactly one caller repo-wide and it is a test (FR-019, SC-005)
- [X] T031 [US2] Register the scheduler teardown from `packages/core/kernel/bootstrap/steps/scheduler.ts`, at a named `SHUTDOWN_PRIORITY` constant — **not** at the step's `order` of 560 (FR-020)
- [X] T032 [P] [US2] Write the failing test that `steps/database.ts` registers a teardown for the connection it opens at `:52`. Core opens this itself and closes it nowhere: `grep -rn "\.close()\|disconnect" packages/core --include='*.ts'` outside tests returns **0** (A11, FR-019)
- [X] T033 [US2] Register the database teardown from `packages/core/kernel/bootstrap/steps/database.ts`, at its own named priority — the **last** to run, so nothing that depends on the connection is torn down after it
- [X] T034 [P] [US2] Write the failing test that `KernelTerminating` fires — the event has shipped at `packages/events/kernel_events.ts:218`, is re-exported at `packages/core/mod.ts:72`, is documented with a `closeConnections` listener example, and has **zero emitters** (SC-010, A3)
- [X] T035 [US2] Emit `KernelTerminating` from the sequence, after the server stops and before the hooks run (FR-018). `@lockness/events` is a hard dependency of core — `packages/core/deno.json:29`, ~39 symbols statically re-exported at `mod.ts:84` — so this needs no optional-import dance

## Phase 5 — US3 (P2): a failing teardown does not strand the rest

**Independent test**: with the second of four hooks throwing, all four are attempted and the report
names the failure.

- [X] T036 [P] [US3] Write the failing test for FR-007: four hooks, the second throws, all four run, and `report.failed` names the second by its hook name (SC-003)
- [X] T037 [US3] Implement the per-hook `try/catch` in `shutdown_registry.ts` `run()` — the single home. The catch **logs**; it never swallows (constitution: no silent catches)
- [X] T038 [P] [US3] Write the failing log-encoding test mirroring `packages/contract/tests/log_sanitize.test.ts`: a hook named `"a\nFAKE LOG LINE"` produces **one** log line, not two (FR-022, SC-008)
- [X] T039 [US3] Route every hook name and every rendered error through `safeForLog` from `@lockness/contract` (re-exported by core, so no new workspace edge). Render an error as `error.name` + **truncated** `safeForLog(error.message)` — never the whole object, never the stack, because `console.error('...', error)` prints both (FR-022, S2/S3). The motivating case is real: `packages/session/drivers/redis.ts:104` throws a Redis server's reply verbatim on the path `close()` takes

## Phase 6 — US4 (P2): shutdown is bounded

**Independent test**: an app holding an open SSE response exits within the deadline instead of
hanging.

- [X] T040 [P] [US4] Write the failing deadline test: with a hook that never resolves, the sequence completes within the deadline and reports `timedOut: true` (FR-008)
- [X] T041 [P] [US4] Write the failing drain test: with a streaming response open, `server.shutdown()` does not resolve — measured, it hung past a 2 s probe — and the deadline must bound the **whole** sequence, not only the hooks (R2). `@lockness/sse` holds responses open by design, so this is the shape the deadline exists for
- [X] T042 [US4] Implement the deadline in `shutdown_sequence.ts` as one race over server-drain **and** hooks, using `DEFAULT_SHUTDOWN_DEADLINE_MS = 10_000` — a named literal, never an env read (Q1, FR-016)
- [X] T043 [P] [US4] Write the failing validator tests: `deadlineMs: Infinity` **fails boot**; so do `NaN`, `0`, `-1`, `2**31` and any non-integer (SC-007, FR-021). Without this they silently become 1 ms — Deno prints `TimeoutOverflowWarning: Timeout duration was set to 1` and carries on, so the whole sequence is abandoned before the server drains and FR-011 exits `1` on **every** shutdown, which an orchestrator reads as a crash loop
- [X] T044 [US4] Implement the validator in `shutdown_sequence.ts`, rejecting loudly at boot in the shape `steps/events_debug.ts:74` and `steps/scheduler.ts:92` already use. A switch that ignores what you typed is worse than none, because you believe it worked

## Phase 7 — Polish and cross-cutting

- [X] T045 [P] Fix `@OnBoot`'s subclass leak: replace the truthiness test at `packages/core/kernel/decorators.ts:196` with `Object.hasOwn` (FR-023, Q2). **Its own `fix:` commit**, separate from the feature's `feat:`, per hard rule #9
- [X] T046 [P] Write the `@OnBoot` regression test pinning the measured case: `new Base()` then `new Child()` leaves `getBootHooks(Base)` as `['common']`, not `['common','extra']`. Negative-test it — revert T045 and this must go red
- [X] T047 [P] Export every new symbol through `packages/core/kernel/mod.ts:15-39` **and** `packages/core/mod.ts:96-119`. Enumerate by search over the new files' `export` statements, not by example (FR-015)
- [X] T048 [P] Write the reachability test asserting each new symbol is importable from `@lockness/core`, mirroring `packages/core/tests/events_reachability.test.ts`. Deleting one export line otherwise leaves the feature unreachable with the suite fully green
- [X] T049 Write the shutdown section of `docs/lifecycle-events.md`: the decorator, the signal wiring, the ordering rule, the guarantees — and the five **non-guarantees** FR-014 names, each as its own sentence: (a) an existing hand-written handler now runs concurrently and may be cut short by the framework's exit — the **upgrade note**, since it is the only way this can harm an existing app; (b) never expose `App.shutdown()` from a route, middleware or devtools panel; (c) a programmatic `await app.shutdown()` **abandons** a hung hook, it does not cancel it; (d) a hook's error message is logged, so do not put a credential in one; (e) a failure inside `listen()` itself exits before hooks are reachable
- [X] T050 Replace the manual wiring block at `packages/scheduler/docs/DOCS.md:336-348`. It teaches the exact handler the framework's exit now truncates, **and** states "Lockness has no framework-wide shutdown lifecycle yet" — both false on landing (FR-017)
- [X] T051 [P] Correct the two `@example Graceful shutdown` JSDoc blocks at `packages/core/app.ts:491-499` and `packages/core/http/server.ts:53-54` — the ones `plan.md` § 1 cites as evidence the feature was missing (FR-017, A13)
- [X] T052 Re-run the FR-017 search and confirm it returns nothing stale: `grep -rn "addSignalListener" docs/ packages/*/docs/ packages/*/README.md packages/init/stubs/` and `grep -rni "shutdown lifecycle" --include='*.md'`. Enumerated by search, not by the three examples above
- [X] T053 Run the full gate: `deno fmt && deno lint && deno check && deno task test`, plus `deno task deps:analyze` — no new cycle, no undeclared specifier
- [X] T054 Negative-test the suite: for each new assertion, break the thing it claims and confirm it goes red. A test that cannot fail is not evidence. Chase any "still passes" to its cause — a mis-targeted mutation and a weak assertion look identical from the outside, and in the last feature all three "still passes" results were mis-targeted mutations, not weak tests

---

## Dependencies

```
Phase 1 ─▶ Phase 2 ─┬─▶ Phase 3 (US1) ─┬─▶ Phase 4 (US2)
                    │                   ├─▶ Phase 5 (US3)
                    │                   └─▶ Phase 6 (US4)
                    └────────────────────────────▶ Phase 7
```

- **Phase 2 blocks everything.** The registry and the decorator are what every story registers into.
- **US1 blocks US2, US3 and US4** — each needs a running sequence to observe.
- **US2, US3 and US4 are independent of each other** and can run in parallel once US1 lands.
- **T045/T046 (`@OnBoot`) depend on nothing** and may land first, as their own commit.

## Parallel opportunities

| Phase | Runnable together |
| :--- | :--- |
| 2 | T003, T004, T005, T010, T013 — five different files |
| 3 | T014, T015, T016 (tests); then T021, T027, T028, T029 |
| 4 | T030, T032, T034 — three independent teardown tests |
| 5 | T036, T038 |
| 6 | T040, T041, T043 |
| 7 | T045, T047, T048, T051 |

## Implementation strategy

**MVP is Phase 1 → 3.** At the end of US1 the framework installs its own signal handlers, runs an
ordered teardown and exits — which is #129's headline acceptance criterion, shippable on its own with
zero registered teardowns.

**Phase 4 is what makes it demonstrable.** A lifecycle with no registered teardown cannot be shown
to work; US2 gives it two, both core-owned.

**Phases 5 and 6 are the safety half**, and Phase 6 is not optional polish: without the deadline this
feature turns a working Ctrl-C into a hang in any streaming application, which is a regression, not
a missing nicety.

## Commit plan

One category per commit (hard rule #9):

| Commit | Covers |
| :--- | :--- |
| `fix(core): stop @OnBoot writing a subclass's hooks into its parent` | T045, T046 |
| `feat(129): the shutdown lifecycle — @OnShutdown, signals and ordered teardown` | T003–T035, T037, T039, T042, T044 |
| `test(129): …` | the test tasks, where they do not ship inside the TDD commit above |
| `docs(129): …` | T049, T050, T051, T052 |
