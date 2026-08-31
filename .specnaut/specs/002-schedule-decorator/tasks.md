# Tasks: `@Schedule` decorator and the `@lockness/scheduler` package

**Input**: `.specnaut/specs/002-schedule-decorator/plan.md` (the one planning document)
**Backlog**: [#96](https://github.com/locknessland/lockness-monorepo/issues/96) epic; children
[#123](https://github.com/locknessland/lockness-monorepo/issues/123) (scaffold),
[#124](https://github.com/locknessland/lockness-monorepo/issues/124) (parser),
[#125](https://github.com/locknessland/lockness-monorepo/issues/125) (service),
[#126](https://github.com/locknessland/lockness-monorepo/issues/126) (decorator + docs)

**Tests**: **required**. `.specnaut/memory/constitution.md` makes TDD non-negotiable for the
`developer` agent — failing test first, minimal code to pass, then refactor. Test tasks are
therefore not optional here and appear before the implementation they cover.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelisable: different files, no dependency on an incomplete task
- **[Story]** — the user story from `plan.md` section 2
- 🔒 — the task touches a rule in the decision table; its named home is quoted in the task

## Path conventions

Deno workspace monorepo. New package at `packages/scheduler/`; discovery and bootstrap wiring in
`packages/core/`. Tests live beside their package in `packages/*/tests/`.

---

## Phase 1: Setup

**Purpose**: make the workspace admit the package. **T001 is first for a measured reason**:
`tests/package_structure.test.ts` carries a hardcoded 26-entry `PACKAGES` list plus a guard test
asserting `unconfigured.length === 0`, so the suite goes red the instant `packages/scheduler/deno.json`
exists. Doing this last would leave `deno task test` failing for the whole implementation and make
hard rule #5 unsatisfiable incrementally (finding A3).

- [X] T001 Add `'scheduler'` to the `PACKAGES` array in `tests/package_structure.test.ts` (alphabetically, between `queue` and `session`)
- [X] T002 Create `packages/scheduler/deno.json` — name `@lockness/scheduler`, version `0.2.0`, `exports: "./mod.ts"`, `publish.exclude: ["tests/"]`, and imports **limited to** `jsr:@lockness/contract@^0.2.0`, `jsr:@lockness/container@^0.2.0`, `jsr:@std/assert@1` 🔒 *home: `packages/scheduler/deno.json` — the dependency ceiling (FR-016)*
- [X] T003 Append `"./packages/scheduler"` to the `workspace` array in `deno.jsonc` (26 members → 27)
- [X] T004 [P] Create `packages/scheduler/README.md` (≥50 chars) and `packages/scheduler/AGENTS.md` (≥400 chars) carrying the four literal headings `## Public surface`, `## Dependencies`, `## Where to work`, `## Pitfalls` — the structure test asserts each one
- [X] T005 Run `deno cache` / `deno task test` to regenerate `deno.lock` for the new member — **never** hand-edit it (hard rule #6). Confirm `tests/package_structure.test.ts` is green before writing any feature code

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the pure domain and the type surface every story codes against. No I/O, no clock, no
timers — this phase is exhaustively testable on its own.

- [X] T006 [P] Write `packages/scheduler/types.ts`: `ScheduleOptions` (`name`, `runOnStart`, `timeout`, `retries`, `retryDelay`, `enabled`, `onError`, `onSuccess`, `overlap`), `TaskStats`, `CronField`, `SchedulerLock` (declared, unimplemented — FR-023), the reporter port (FR-020), and `DEFAULT_SCHEDULES_DIR = './app/schedule'`. No `any`; JSDoc with `@example` on every export 🔒 *homes: `types.ts` owns the `ScheduleOptions` shape (grep `interface ScheduleOptions` → exactly 1 hit) and `DEFAULT_SCHEDULES_DIR` (grep `'./app/schedule'` → exactly 1 hit)*
- [X] T007 In `packages/scheduler/types.ts`, `TaskStats` is a **closed, non-sensitive** shape: `{ name, enabled, paused, lastRunAt, nextRunAt, runCount, failureCount, skippedCount, pendingTimers, lastError?: { name, message } }`. No stack, no `cause`, never an `Error` instance (FR-019, security finding S4)
- [X] T008 Write `packages/scheduler/tests/cron_parser.test.ts` **first** — a table of (expression, reference instant) → expected next instant covering: each of the five fields, `*`, a value, `a-b`, `a,b,c`, `*/n`, `a-b/n`, field boundaries (minute 0/59, hour 0/23, DOM 1/31, month 1/12, DOW 0/6), month-length and leap-year rollover, and `nextRun(e, t) > t` strictly for every row
- [X] T009 Write `packages/scheduler/tests/cron_parser_errors.test.ts` — every malformed input throws naming **the offending field and token**: wrong field count, out-of-range values, `*/0`, inverted ranges, `JAN`/`MON` aliases (out of scope, must throw not silently accept), and `0 0 30 2 *` terminating against the 4-year horizon rather than looping
- [X] T010 Implement `packages/scheduler/cron_parser.ts` to green T008/T009: `parse()` and `nextRun(expression, from)`. **Every** field read is a `getUTC*` call 🔒 *homes: `cron_parser.ts` owns the grammar, the error shape, next-run computation, and that time is UTC (grep `getHours(\|getDate(\|getDay(\|getMonth(` in the package → 0 hits)*
- [X] T011 [P] Write `packages/scheduler/tests/presets.test.ts`, then `presets.ts`: `everyMinute`, `everyFiveMinutes`, `everyTenMinutes`, `everyFifteenMinutes`, `everyThirtyMinutes`, `hourly`, `daily`, `weekly`, `monthly`, `yearly`, `weekdays`, `weekends` — each a plain expression **string**, resolved through one map 🔒 *home: `presets.ts`; grep for any 5-field cron literal elsewhere in the package → 0 hits*

---

## Phase 3: US1 — Declare a recurring task next to its code (P1)

**Goal**: `@Schedule('0 3 * * *')` above a method makes it run daily at 03:00 UTC, with nothing else edited.
**Independent test**: mount a class with one decorated method, advance `FakeTime` past the occurrence, assert the method ran exactly once.

- [X] T012 [US1] Write `packages/scheduler/tests/timer_registry.test.ts` under `FakeTime`: arming returns a handle held in the registry; `MAX_DELAY_MS` caps a `yearly` delay and re-arms **without running**; a delay below the 1 000 ms floor is clamped and logged at WARN; `clear()` empties the registry
- [X] T013 [US1] Implement `packages/scheduler/timer_registry.ts` — the **only** place `setTimeout` / `clearTimeout` / `Deno.unrefTimer` appear in the package. One `arm()` that calls `setTimeout` then `Deno.unrefTimer` on the same handle; one `MAX_DELAY_MS` (24 days) and one `MIN_DELAY_MS` (1 000 ms) 🔒 *homes: `timer_registry.ts` owns which timers exist, that none survives `stop()`, that a schedule never keeps the process alive, and the delay bounds. Grep: `setTimeout(` in the package → exactly 2 call sites, both here*
- [X] T014 [US1] Write `packages/scheduler/tests/scheduler_registration.test.ts`: `register` resolves `options.name ?? \`${className}.${methodName}\``; a duplicate name **throws** (FR-013); an unregistered name passed to `pause`/`resume`/`runNow` throws a named error rather than silently no-op (S1)
- [X] T015 [US1] Implement `Scheduler.register` and `Scheduler.start` in `packages/scheduler/scheduler.ts` 🔒 *home: `scheduler.ts` owns task identity **and** its uniqueness — the decorator derives nothing, because the public `register()` would bypass it (finding A4). Grep: a template literal in `decorators.ts` → 0 hits*
- [X] T016 [US1] Write `packages/scheduler/tests/decorators.test.ts`: a malformed expression throws **when the class is defined**, not at first fire; the decorated method's signature is unchanged and a **synchronous** method is legal; metadata lands via `addInitializer` at instantiation
- [X] T017 [US1] Implement `packages/scheduler/decorators.ts` — `parse()` runs in the **factory body** before the decorator function is returned (the `packages/cache/decorators.ts:192` shape); the decorator calls `context.addInitializer(...)` and **returns the original method unchanged**. Returning a replacement would reintroduce the TS1270 that forced `@Cached` to require `async` (FR-002b) 🔒 *homes: `decorators.ts` owns decoration-time validation; grep `parse(` inside the returned decorator function → 0 hits*
- [X] T018 [US1] Write `packages/core/tests/schedule_discovery.test.ts`: a directory of decorated classes is discovered and registered; a resolved path escaping `Deno.cwd()` **throws naming the path**; symlinks are not followed; a per-export instantiation failure is logged at ERROR with file and export name and does **not** abort the scan; a duplicate-name error **propagates**
- [X] T019 [US1] Implement `packages/core/scheduler/schedule_discovery.ts` — mirrors `packages/core/events/listener_discovery.ts` **except** for three deliberate deviations: resolve-then-assert containment, `toFileUrl()` from `@std/path` instead of `new URL(\`file://${p}\`)` (which mis-parses `#`/`?` and silently skips a file), and **no bare `catch { continue }`** — `listener_discovery.ts:153` is exactly that, and it would swallow FR-013's throw (FR-022, security finding S3) 🔒 *home: `schedule_discovery.ts` owns which classes get scheduled; grep `Deno.readDir` in `packages/scheduler/` → 0 hits*
- [X] T020 [US1] Add `schedulesDir?: string` and `schedules?: unknown[]` to `KernelConfig` in `packages/core/kernel/kernel_decorators.ts`. The JSDoc **`{@link}`s** `DEFAULT_SCHEDULES_DIR` rather than restating `'./app/schedule'` — restating it is the duplication that already ships for listeners (`steps/listeners.ts:33` vs `kernel_decorators.ts:211`, finding A9)
- [X] T021 [US1] Implement `packages/core/kernel/bootstrap/steps/scheduler.ts` at **`order: 560`** — after `app_initialization` (550), before `devtools_routes` (600). At ~420 a `runOnStart` task would fire before controllers exist (finding A1, CRITICAL). The step **re-throws** parse and registration failures; only `Deno.errors.NotFound` on the directory is skipped; it logs the **armed** count **unconditionally, including zero** — the mirrored code guards on `> 0` and is inert at zero (FR-014b) 🔒 *homes: `steps/scheduler.ts` owns when the scheduler starts and that an unarmable schedule fails the boot*
- [X] T022 [US1] Register the step in `packages/core/kernel/bootstrap/registry.ts` (13 steps → 14) and add `packages/core/deno.json` import `@lockness/scheduler` (9 entries → 10 — the accepted hard edge, finding A2)
- [X] T023 [US1] Re-export `Schedule`, the presets and `registerSchedules` from `packages/core/mod.ts` 🔒 *home: users import from `@lockness/core`; grep `from '@lockness/scheduler'` in any `.md` → 0 hits*

---

## Phase 4: US2 — Presets (P1)

**Goal**: `@Schedule(hourly)` runs at the top of every hour.
**Independent test**: each preset resolves to the expression a reviewer would have written by hand, and a decorated method fires on that cadence under `FakeTime`.

- [X] T024 [P] [US2] Extend `packages/scheduler/tests/decorators.test.ts` — every preset in the map drives a decorated method to fire at the expected instants under `FakeTime`; assert against the **full preset table**, not `yearly` alone (S10)

---

## Phase 5: US3 — A failing task does not take the others down (P1)

**Goal**: one throwing task fires its `onError`, is reported once, and the other two keep their schedules.
**Independent test**: three tasks, one throwing; assert the other two continue and the process stays up.

- [X] T025 [US3] Write `packages/scheduler/tests/task_runner.test.ts`: a throwing task calls `onError` exactly once; `retries` means *n additional* attempts spaced by `retryDelay`; a retry chain is abandoned when the next occurrence arrives; **an `onError` that itself throws is logged and does not prevent re-arming** (FR-021, security finding S6); failure isolation across three tasks
- [X] T026 [US3] Implement `packages/scheduler/task_runner.ts` — one `run()` owning timeout, retry, `onError` and `onSuccess`, with callbacks inside their own guard and re-arming in a `finally` over the whole run 🔒 *home: `task_runner.ts` owns what happens when a run throws or overruns; grep `catch` in `decorators.ts` → 0 hits*
- [X] T027 [US3] Implement the default failure log line in `packages/scheduler/task_runner.ts` — `{ task, attempt, runId, error.name, error.message }`, stack only under a debug flag, **never** the raw error object and never the task's arguments. Wire the optional reporter port so `@lockness/core` can hand it the application's logger (FR-020, security finding S5)

---

## Phase 6: US4 — Stop cleanly (P1)

**Goal**: after `stop()`, no timer survives and the process is free to exit.
**Independent test**: `getStats().pendingTimers === 0` after `stop()`.

- [X] T028 [US4] Write `packages/scheduler/tests/scheduler_lifecycle.test.ts`: `pendingTimers` is 0 after `stop()`; `stop()` is terminal — a run completing afterwards arms nothing (the `stopping` flag, FR-024). **Do not** rely on `Deno.test`'s sanitizers: measured on deno 2.9.6, a leaked `setTimeout` passes in sync and async form, with and without `--trace-leaks`
- [X] T029 [US4] Implement `Scheduler.stop()` and the `stopping` flag in `packages/scheduler/scheduler.ts`, checked before every re-arm

---

## Phase 7: US5 — Operate a task without redeploying (P2)

**Goal**: `pause` / `runNow` / `resume` on a live instance; the schedule resumes on its original cadence, unshifted by the manual run.
**Independent test**: pause, assert no fire; `runNow`, assert exactly one; resume, assert the original occurrence times.

- [X] T030 [US5] Write `packages/scheduler/tests/scheduler_control.test.ts`: `pause` clears the pending timer; `runNow` on a paused task runs and does **not** resume it; `resume` restores the original cadence; `getStats()` reports the closed `TaskStats` shape and never an `Error` instance
- [X] T031 [US5] Implement `pause`, `resume`, `runNow` and `getStats` in `packages/scheduler/scheduler.ts` 🔒 *home: `scheduler.ts` — `getStats()` is the sole reporter of what a caller may observe, and is load-bearing for FR-009's assertion*
- [X] T032 [US5] Document in `packages/scheduler/docs/DOCS.md` that these four are **not** exposed by the framework and that authorization is **the application's** decision — with a worked example mounting them behind `@AuthRequired()` plus a role check, and an explicit "never mount these unauthenticated" warning. `@lockness/devtools` gates `/_devtools` with a JSDoc *example* rather than enforcement; do not repeat that (security finding S1) 🔒 *home: the application's own authorization layer, recorded as a decision rather than left as an omission*

---

## Phase 8: US6 + US7 — Switched off, and bounded (P2)

**Goal**: `enabled: false` registers without scheduling; `timeout` abandons a hanging run and still schedules the next.
**Independent test**: a disabled task appears in `getStats()` and never fires; a hanging task's `onError` receives a timeout error and the next occurrence is still armed.

- [X] T033 [P] [US6] Test and implement `enabled: false` — registered, visible in `getStats()`, never scheduled; `resume()` on a disabled task **throws** (invariant 6, finding A10) 🔒 *home: `Scheduler.register`; grep `enabled` in `decorators.ts` and `packages/core/scheduler/` → 0 hits outside type re-exports*
- [X] T034 [US7] Test in `packages/scheduler/tests/task_runner.test.ts` and implement in `packages/scheduler/task_runner.ts`: `timeout` with a real `AbortSignal` passed into the task, and `overlap: 'skip'` as the **default** — a task has at most one run in flight, and a skipped occurrence increments `skippedCount`. Without the signal, "abandoned" means only "un-awaited" while the run keeps its connection, and live runs accumulate without bound (FR-017, security finding S2)
- [X] T035 [US7] Test in `packages/scheduler/tests/scheduler_lifecycle.test.ts` and implement in `packages/scheduler/scheduler.ts`: `runOnStart` fires once at boot, then the normal calendar. **No catch-up, ever** — an occurrence that fell while the process was down is lost by design (Q3, settled 2026-08-31)
- [X] T036 [P] [US7] Implement range validation in `packages/scheduler/decorators.ts` at decoration time: `retries` ≤ 10, `retryDelay` > 0, `timeout` > 0, `name` matching `[A-Za-z0-9._:-]{1,64}` — `retryDelay: 0` with a large `retries` is otherwise a hot loop by configuration (FR-018)
- [X] T037 [P] [US7] Implement the `SCHEDULER_ENABLED` environment gate in `packages/core/kernel/bootstrap/steps/scheduler.ts`, and declare `lock?: SchedulerLock` in `packages/scheduler/scheduler.ts` (default on); the port is **declared and unimplemented in v1**. Reserving it now is what keeps distributed locking an added adapter rather than a break in every `@Schedule` call site (FR-023, security finding S8 — the one finding a later fix cannot reach cheaply)

---

## Phase 9: Polish and cross-cutting

- [X] T038 [P] Write `packages/scheduler/README.md` and `packages/scheduler/docs/DOCS.md` in full: the manual `SIGINT`/`SIGTERM` wiring (Q1, settled 2026-08-31), that a run may be terminated at any instant so task bodies must be idempotent or transactional (S9), that `runOnStart` demands an idempotent body because a crash-looping deploy replays it, and that `schedulesDir` must be a constant in application source — never environment-derived
- [X] T039 [P] Write the multi-instance warning **in its own words**, naming the concrete consequence ("two replicas invoice every customer twice"). Do **not** reuse the wording from `packages/core/docs/throttling.md`: an under-enforced rate limit degrades a control predictably, duplicate execution corrupts other people's state, and identical words make a reader under-weight the second (security finding S8)
- [X] T040 [P] Fill `packages/scheduler/AGENTS.md` with real content matching the 26 sibling briefs
- [X] T041 [P] Add the package's `docs/DOCS.md` to **both** hand-maintained maps in `app/service/docs_loader.ts` (`slugToPath`, `llmsSlugToSource`) — `tests/docs_structure.test.ts` covers only 12 curated entries and will **not** catch the omission (finding A7)
- [X] T042 [P] Add the package row to `AGENTS.md` (per-package brief index **and** the package-docs table); `.claude/CLAUDE.md` is a symlink to it and needs no separate edit
- [X] T043 [P] Added to `docs/architecture.md`. **`docs/packages.md` deliberately skipped**: it documents packages installable via `deno task cli package:install <name>`, and that command was not verified for this package — an unverified command in the docs is worse than an omission.
- [X] T044 [P] Add `make:schedule` to `@lockness/cli` with a `schedule.stub`, and its row in `docs/STUBS.md`. Blast radius **not counted** by the architecture audit — measure `packages/cli/stubs.ts` before starting
- [X] T045 Run `deno task deps:analyze` to regenerate `docs/dependencies.md` and confirm the graph stays acyclic with the new `core → scheduler` edge
- [X] T046 Run the full gate and **read its whole output**, not `tail -1`: `deno fmt && deno lint && deno check && deno task test`, then `deno publish --dry-run` inside `packages/scheduler/` to clear JSR's **no-slow-types** check — an inferred return type on a decorator factory is the classic way to fail it, which is why `packages/cache/decorators.ts` spells `Cached`'s out in full

---

## Dependencies

```text
Phase 1 (T001-T005)  ── must be green before any feature code
        │
Phase 2 (T006-T011)  ── pure domain; blocks every story
        │
        ├── Phase 3  US1 (T012-T023)  P1  ← MVP
        │       │
        │       ├── Phase 4  US2 (T024)        P1
        │       ├── Phase 5  US3 (T025-T027)   P1
        │       ├── Phase 6  US4 (T028-T029)   P1
        │       ├── Phase 7  US5 (T030-T032)   P2
        │       └── Phase 8  US6+US7 (T033-T037) P2
        │
Phase 9 (T038-T046)  ── polish; T046 is the gate
```

Within Phase 3, T012→T013, T014→T015 and T016→T017 are strict TDD pairs. T018→T019 likewise.
T020–T023 depend on T019. Phases 4–8 depend on Phase 3 and are independent of each other.

## Parallel opportunities

- **Phase 1**: T004 alongside T002/T003
- **Phase 2**: T006 and T011 in parallel; T008/T009 in parallel with each other
- **Phases 4–8**: all five story phases run in parallel once Phase 3 lands
- **Phase 9**: T038–T044 are seven independent files

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1)** — a decorated method runs on a cron expression,
discovered from a directory, started by the kernel at the right point in the boot order. That is the
whole of #96's premise, provable on its own.

Everything after it is an increment on a working scheduler, and each maps cleanly onto the epic's
existing children: Phase 1 ≈ #123, Phase 2 ≈ #124, Phases 5–8 ≈ #125, Phases 3–4 + 9 ≈ #126.

**46 tasks. 5 setup, 6 foundational, 12 for US1, 14 across US2–US7, 9 polish. 14 marked [P].**
