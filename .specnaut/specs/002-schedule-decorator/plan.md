# Plan: `@Schedule` decorator and the `@lockness/scheduler` package

**Branch**: `002-schedule-decorator` | **Date**: 2026-08-31 | **Backlog item**:
[#96 — Add @Schedule decorator for cron-based tasks](https://github.com/locknessland/lockness-monorepo/issues/96)
(epic; children [#123](https://github.com/locknessland/lockness-monorepo/issues/123),
[#124](https://github.com/locknessland/lockness-monorepo/issues/124),
[#125](https://github.com/locknessland/lockness-monorepo/issues/125),
[#126](https://github.com/locknessland/lockness-monorepo/issues/126))

---

## 1. Why this exists

A Lockness application that needs "send the digest every morning" or "purge expired sessions hourly"
has nowhere in the framework to say so. Today the author has three bad options:

| Option | What it costs |
| :--- | :--- |
| System `cron` calling a CLI command | The schedule lives outside the repository. It is not versioned, not reviewable, and not present in a `deno compile` binary or a container image. |
| `Deno.cron` | Available, but behind `--unstable-cron` — **verified on deno 2.9.6**: `typeof Deno.cron` is `undefined` without the flag and `function` with it. So every consuming application must add an unstable flag to `deno run`, `deno test` and `deno compile`. It also offers no `pause`, no `resume`, no on-demand run and no statistics, and Deploy backs it with durable scheduling while the CLI does not — the same declaration behaves differently per target. |
| A hand-rolled `setInterval` in the kernel | Works, and every application spells it differently. No timeout, no retry, no way to pause or trigger a run, and it leaks a timer on shutdown. |

Every other cross-cutting concern in this framework is declared next to the code it affects —
`@Cached` on the method whose result is cached, `@Listener` on the method that handles the event,
`@Throttle` on the route it protects. Scheduling is the one that is still exiled to a crontab.

**Measured**: `@lockness/queue` ships `QueueWorker` for background *jobs*, but a job must be
dispatched by something. Nothing in the workspace dispatches on a clock —
`grep -rn "setInterval(" packages --include="*.ts"` returns two hits, both inside
`@lockness/sse` heartbeats, neither reusable. There is no scheduling primitive at any layer.

## 2. User scenarios

### US1 — Declare a recurring task next to its code (P1)

**Given** a service class in `app/schedule/`
**When** its author writes `@Schedule('0 3 * * *')` above a method and boots the app
**Then** that method runs every day at 03:00 UTC, and nothing else had to be edited

### US2 — Use a preset instead of remembering cron syntax (P1)

**Given** an author who wants a task to run hourly
**When** they write `@Schedule(hourly)`
**Then** the task runs at the top of every hour, and `hourly` resolves to the same expression a
reviewer would have written by hand

### US3 — A failing task does not take the others down (P1)

**Given** three scheduled tasks, one of which throws
**When** the failing task's turn comes
**Then** its `onError` callback fires, the failure is reported once, the other two keep their
schedules, and the process stays up

### US4 — Stop cleanly (P1)

**Given** a running application with scheduled tasks
**When** the application calls `scheduler().stop()`
**Then** no timer survives the call, and the process is free to exit

### US5 — Operate a task without redeploying (P2)

**Given** a scheduled report that is misbehaving
**When** the operator calls `pause('daily-report')`, then later `runNow('daily-report')` and
`resume('daily-report')`
**Then** the schedule stops firing, one run happens on demand, and the schedule resumes on its
original cadence — not shifted by the manual run

### US6 — Ship a task switched off (P2)

**Given** a task declared with `enabled: false`
**When** the application boots
**Then** the task appears in `getStats()` as registered and not scheduled, and never fires

### US7 — Bound a task that hangs (P2)

**Given** a task declared with `timeout: 30_000` whose body never resolves
**When** it is invoked
**Then** it is abandoned after 30 seconds, `onError` receives a timeout error, and the next
occurrence is still scheduled

### Edge cases

- **A `setTimeout` delay longer than `2^31 - 1` ms (~24.8 days).** `@Schedule(yearly)` computes a
  delay of roughly 365 days. Passing that to `setTimeout` overflows to a 1 ms delay and the job
  fires immediately, every tick. The delay must be capped and re-armed.
- **An expression that matches nothing**, e.g. `0 0 30 2 *` (30 February). `nextRun` must terminate
  rather than search forever.
- **The previous run is still going when the next is due.** Section 12, Q2.
- **The process was down across a scheduled time.** Section 12, Q3.
- **Two jobs resolve to the same name.** Registration must reject the second rather than silently
  replace the first — a silently replaced job never runs and nothing says so.
- **`runNow` on a paused job.** Runs, and does not resume the schedule.
- **A job whose method was decorated but whose class is never discovered.** It is silently absent
  today for listeners; the same silence here means a task that a reader believes is scheduled is not.

## 3. Requirements

- **FR-001**: A new workspace package `@lockness/scheduler` exists at `packages/scheduler/`,
  published at the workspace version, exporting through `mod.ts`.
- **FR-002**: `@Schedule(expression, options?)` decorates a method and records the schedule. It
  throws at decoration time — not at first fire — when the expression is invalid: the parse happens
  in the decorator *factory body*, before the decorator function is returned.
- **FR-002b**: The decorator **returns the original method unchanged**. It records metadata through
  `context.addInitializer` — the `@Listener` shape — and never returns a replacement. This is what
  keeps a synchronous scheduled method legal: a TC39 method decorator whose replacement has a
  different type is TS1270, which is precisely the constraint that forced `@Cached` to require
  `async`. Wrapping the method to add the timeout would reintroduce it; the timeout belongs to the
  runner, not the decorator.
- **FR-003**: The parser accepts standard 5-field cron: minute, hour, day-of-month, month,
  day-of-week; each field accepting `*`, a value, a range `a-b`, a list `a,b,c`, and a step `*/n`
  or `a-b/n`.
- **FR-004**: The parser computes the next matching instant **from a caller-supplied reference
  time**. It never reads the clock itself.
- **FR-005**: An invalid expression throws naming the offending field and the offending token.
- **FR-006**: The presets `everyMinute`, `everyFiveMinutes`, `everyTenMinutes`, `everyFifteenMinutes`,
  `everyThirtyMinutes`, `hourly`, `daily`, `weekly`, `monthly`, `yearly`, `weekdays`, `weekends`
  each resolve to a 5-field expression string and to nothing else.
- **FR-007**: `ScheduleOptions` declares `name`, `runOnStart`, `timeout`, `retries`, `retryDelay`,
  `enabled`, `onError`, `onSuccess` — all optional, none typed `any`.
- **FR-008**: `Scheduler` supports `register`, `start`, `stop`, `pause`, `resume`, `runNow`,
  `getStats`.
- **FR-009**: After `stop()` resolves, **no timer created by the scheduler remains pending** — the
  set quantified over is every handle the scheduler ever created, enumerable because they are all
  held in one registry (section 5, row 7). `getStats()` reports that registry's size, and the test
  asserts it is `0` after `stop()`.
  **Not** via `Deno.test`'s sanitizers: measured on deno 2.9.6, a test that calls
  `setTimeout(fn, 60_000)` and never clears it **passes**, in sync and async form, with and without
  `--trace-leaks`. The runtime will not catch this leak for us, so the assertion has to be ours.
- **FR-009b**: Every timer the scheduler arms is passed to `Deno.unrefTimer`, so a pending schedule
  never by itself keeps the process alive (measured: a process holding an unref'd 60 s timer exits
  in ~50 ms). See Q1 — this is what makes the missing shutdown hook survivable rather than fatal.
- **FR-010**: A task that throws is isolated: `onError` is invoked, the failure is reported once,
  and every other task keeps its schedule.
- **FR-011**: `timeout` abandons a run; `retries` re-attempts it after `retryDelay`; a run that
  exhausts its retries reports through `onError` once, with the last error.
- **FR-012**: `enabled: false` registers the task and does not schedule it.
- **FR-013**: Registering a second task under a name already registered throws.
- **FR-014**: The kernel discovers `@Schedule`-decorated classes from `schedulesDir`
  (default `./app/schedule`) and from an explicit `schedules` list on `@Kernel`, and starts the
  scheduler during bootstrap — by the same two-path mechanism `listenersDir` / `listeners` already
  use, and no other. The listener mirror is really **three**-part (it also has `config/listeners.ts`,
  stub #22 of 33 in `INIT_STUB_FILES`); this feature mirrors **two** parts deliberately, and
  `config/schedules.ts` is out of scope. **Carve-out (S3)**: `listener_discovery.ts:153` is a bare
  `catch { continue }` that would swallow FR-013's duplicate-name throw and any constructor failure.
  Schedule discovery instead logs each per-export failure at ERROR with file and export name, and a
  duplicate-name error **fails the boot**.
- **FR-014b**: The bootstrap step runs at `order: 560` — after `app_initialization` (550), so a
  `runOnStart` task never fires against an app with no controllers. It **re-throws** parse and
  registration failures rather than logging and continuing, and logs the count of tasks **armed**,
  not registered — **unconditionally, including zero**. The mirrored code logs only when the count
  is `> 0` (`listener_discovery.ts:161`, `steps/listeners.ts:46`), which makes a zero-count warning
  inert in precisely the case it exists for.
- **FR-015**: Every exported symbol in the package carries JSDoc with `@param`, `@returns`,
  `@throws` and `@example`; `packages/scheduler/README.md` and `packages/scheduler/docs/DOCS.md`
  exist; `packages/scheduler/AGENTS.md` exists, matching the shape the other 26 packages carry
  (enforced by `tests/package_structure.test.ts`, which quantifies over every workspace member).
- **FR-016**: The package depends on `@lockness/contract` and `@lockness/container` only. It does
  not import `hono`, and it does not import `@lockness/core`. The reverse edge — `core` →
  `scheduler` — is accepted and hard, mirroring `core` → `events` (A2).
- **FR-017** *(S2)*: `ScheduleOptions.overlap` is `'skip' | 'allow'`, defaulting to **`'skip'`**.
  A task has at most one in-flight run unless `'allow'` is chosen. `timeout` passes an
  `AbortSignal` into the task, so "abandoned" means *cancelled* rather than merely un-awaited — a
  JavaScript promise cannot be cancelled, so without the signal a timed-out run keeps its database
  connection while the next one starts, and live runs accumulate without bound.
- **FR-018** *(S2, S4)*: `retries` (≤ 10), `retryDelay` (> 0), `timeout` (> 0) and `name`
  (`[A-Za-z0-9._:-]{1,64}`) are range-validated **at decoration time**, under FR-002's throw-early
  rule. `retryDelay: 0` with a large `retries` is otherwise a hot loop by configuration.
- **FR-019** *(S4)*: `TaskStats` is a closed, non-sensitive shape —
  `{ name, enabled, paused, lastRunAt, nextRunAt, runCount, failureCount, pendingTimers,
  skippedCount, lastError?: { name: string; message: string } }` — `skippedCount` is where Q2's
  skipped occurrences are observable. `getStats()` **never** returns an `Error`
  instance: no stack, no `cause` chain. The devtools panel is out of scope now and is the obvious
  next consumer, and `@lockness/devtools` mounts at `/_devtools` gated only by a JSDoc *example*.
- **FR-020** *(S5)*: The default failure log line is `{ task, attempt, runId, error.name,
  error.message }` — never the raw error object, never the task's arguments; the stack only under a
  debug flag. FR-016 rules out `@lockness/logger`, so the Scheduler takes an **optional reporter
  port** typed in `@lockness/contract`, which the bootstrap step wires to the application's logger.
- **FR-021** *(S6)*: `onError` and `onSuccess` run inside their own guard. A callback that throws
  is logged and **cannot** prevent re-arming — re-arming happens in a `finally` over the whole run.
- **FR-022** *(S7)*: Discovery resolves `schedulesDir`, asserts the resolved path is inside
  `Deno.cwd()` and throws naming the path otherwise; does not follow symlinks; and builds the module
  URL with `toFileUrl()` from `@std/path` rather than string interpolation — `new URL(`file://${p}`)`
  mis-parses a path containing `#` or `?`, silently skipping a file its author believes is scheduled.
- **FR-023** *(S8)*: The bootstrap step honours a `SCHEDULER_ENABLED` environment variable
  (default on), and the `Scheduler` constructor accepts an optional `lock?: SchedulerLock` port,
  **declared and unimplemented in v1**. Reserving the port now is what keeps distributed locking an
  added adapter later instead of a break in every `@Schedule` call site.
- **FR-024** *(S9)*: After `stop()`, the scheduler is terminal — a `stopping` flag is checked before
  every re-arm, so shutdown cannot race a run that was about to schedule itself.
- **FR-025** *(S10)*: Every armed delay is clamped to a **minimum** of 1 000 ms as well as the
  24-day maximum, logging at WARN when it clamps. The cap defends the one overflow path the plan
  found; the floor defends every other route to a near-zero delay. A clamp that fires is a bug.

## 4. Success criteria

- **SC-001**: An author can turn an existing method into a daily task by adding one line above it,
  with no edit to the kernel, the config directory, or any deployment file.
- **SC-002**: The same declaration runs unchanged under `deno task dev`, inside a `deno compile`
  binary, in Docker, and on Deno Deploy.
- **SC-003**: A reader of a scheduled method can tell when it runs without leaving the file.
- **SC-004**: A task that fails never prevents another task from running.
- **SC-005**: An application that shuts down leaves nothing running behind it.
- **SC-006**: The full test suite completes in the time it takes today — a scheduler test never
  waits on real elapsed time.
- **SC-007**: An operator can suspend and hand-trigger a task on a running instance without a
  deploy.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **When a task runs next**, given an expression and a reference instant | `packages/scheduler/cron_parser.ts` — `nextRun(expression, from)` | The Scheduler deriving a period from an expression; a preset carrying a millisecond interval. Grep: `* 60 * 1000` in `scheduler.ts` → 0 hits. |
| **The cron grammar, and what an invalid expression says** | `packages/scheduler/cron_parser.ts` — one `parse()`; the throw names the field and the offending token | A second validation in `Scheduler.register`; the decorator pre-checking the string. Grep: `parse(` outside `cron_parser.ts` and its tests → 0 hits. |
| **When validation happens — at decoration, not at first fire** | `packages/scheduler/decorators.ts` — `parse()` is called in the *factory body*, before the decorator function is returned, exactly as `resolveTtl` is in `packages/cache/decorators.ts:192` | Validation moved into `register` because it was inconvenient in a test. Grep: `parse(` inside the returned decorator function → 0 hits. |
| **What a preset name means** | `packages/scheduler/presets.ts` — one `name → expression` map | The decorator special-casing a preset before parsing; docs stating an expression rather than quoting the map. Grep: any 5-field cron literal outside `presets.ts` and its tests → 0 hits. |
| **Time is interpreted as UTC** | `packages/scheduler/cron_parser.ts` — every field read is a `getUTC*` call | The Scheduler comparing local `getHours()`/`getDay()`. Grep: `getHours(\|getDate(\|getDay(\|getMonth(` in `packages/scheduler/` → 0 hits. |
| **The `ScheduleOptions` shape** | `packages/scheduler/types.ts` | A second options interface in `decorators.ts`; the Scheduler widening it at registration. Grep: `interface ScheduleOptions` → exactly 1 hit. |
| **A task's identity, and that it is unique** | `packages/scheduler/scheduler.ts` — `Scheduler.register` resolves `options.name ?? ` `${className}.${methodName}` **and** enforces uniqueness | The decorator deriving the name (which the public `register()` would then bypass — see A4); `getStats()` labelling a task by a different string than `pause()` accepts. Grep: a template literal in `decorators.ts` → 0 hits. |
| **Whether a task is scheduled at all** (`enabled`) | `packages/scheduler/scheduler.ts` — `Scheduler.register` | The decorator skipping registration when `enabled: false` (which would also hide it from `getStats`); discovery filtering on `enabled`. Grep: `enabled` in `decorators.ts` and in `packages/core/scheduler/` → 0 hits outside type re-exports. |
| **What a caller may observe about a task** | `packages/scheduler/scheduler.ts` — `getStats()`, the sole reporter, including `pendingTimers` which FR-009 asserts on | A test reaching into private state; a second status shape on the discovery side. |
| **What happens when a run throws or overruns** — retry, timeout, `onError` | `packages/scheduler/task_runner.ts` — one `run()` (see A13: extracted from the Scheduler up front, not in cycle three) | The decorator wrapping the method body in `try`/`catch`; discovery catching per task. Grep: `catch` in `decorators.ts` → 0 hits. |
| **Which timers exist, and that none survives `stop()`** | `packages/scheduler/timer_registry.ts` — the only place `setTimeout`/`clearTimeout`/`Deno.unrefTimer` appear in the package | A task holding its own timer id; `runNow` arming one outside the registry. Grep: `setTimeout(` in `packages/scheduler/` → exactly 1 arming call site, in `timer_registry.ts`. **Amended 2026-08-31**: the plan originally placed the timeout guard here too. It belongs to `task_runner.ts` instead — a timeout is alive only while a run is in flight, and it must **not** be `unref`'d, which is the opposite of every schedule timer. Two other `setTimeout` calls therefore live in `task_runner.ts`: the timeout guard and the default retry sleep. |
| **A schedule never keeps the process alive on its own** | `packages/scheduler/timer_registry.ts` — the single `arm()` calls `setTimeout` then `Deno.unrefTimer` on the same handle | An arming path that forgets the `unrefTimer` call. Grep: every `setTimeout(` in the package is followed by `Deno.unrefTimer` within the same function. |
| **The maximum delay that may be armed** | `packages/scheduler/timer_registry.ts` — one `MAX_DELAY_MS` constant | A cap re-derived in the parser; `yearly` special-cased. Grep: `2 ** 31` or any other millisecond ceiling outside that constant → 0 hits. |
| **The default schedules directory** | `packages/scheduler/types.ts` — one exported `DEFAULT_SCHEDULES_DIR` constant, `{@link}`-ed from `KernelConfig`'s JSDoc rather than restated | The listeners defect this plan would otherwise reproduce: `steps/listeners.ts:33` hardcodes `'./app/listener'` while `kernel_decorators.ts:211` restates it as `@default`. Grep: `'./app/schedule'` → exactly 1 hit. |
| **Which classes get scheduled** | `packages/core/scheduler/schedule_discovery.ts` | The scheduler package reading the filesystem; the bootstrap step re-filtering what discovery returned. Grep: `Deno.readDir` in `packages/scheduler/` → 0 hits. |
| **When the scheduler starts, relative to app readiness** | `packages/core/kernel/bootstrap/steps/scheduler.ts` — `order: 560`, after `app_initialization` (550), before `devtools_routes` (600) | `App.listen()` starting it; the decorator starting it on first registration. A `runOnStart` task fires only once controllers, static files and the mount point exist. |
| **That a schedule which cannot be armed fails the boot** | `packages/core/kernel/bootstrap/steps/scheduler.ts` — the step re-throws parse and registration failures; only `Deno.errors.NotFound` on the directory is skipped | The listeners step's catch-all (`steps/listeners.ts:52-63`), which `console.error`s everything else and continues — under which a `0 0 30 2 *` task boots clean and silently never fires. The step logs the **armed** count, not the registered count. |
| **The dependency ceiling** | `packages/scheduler/deno.json` — `@lockness/contract` and `@lockness/container`, nothing else | Grep both ways: `@lockness/core` in `packages/scheduler/` → 0 hits; `@lockness/scheduler` in `packages/core/deno.json` → exactly 1 hit (the accepted hard edge, see A2). |
| **The import path a user writes for `@Schedule`** | `packages/core/mod.ts` — re-exported from core, because the project philosophy is that applications import `@lockness/core` only | `README.md` or `docs/DOCS.md` showing `from '@lockness/scheduler'` in a user-facing example. Grep: `from '@lockness/scheduler'` in any `.md` → 0 hits. |

**Binding.** A decision may not move out of its home without this table being amended first. A
review finding a decision with two homes is a plan violation, not a style opinion.

## 6. Technical context

**Language/Version**: TypeScript on Deno 2.x, TC39 Stage 3 decorators (`experimentalDecorators` off).
**Primary Dependencies**: `@lockness/contract`, `@lockness/container`. No third-party cron library —
see Risks.
**Storage**: none. All state is in-process and lost on restart, by design.
**Testing**: `Deno.test` in `packages/scheduler/tests/`; `FakeTime` from `@std/testing/time` for
anything involving elapsed time — the precedent set by `packages/cache/tests/features.test.ts` and
`packages/session/tests/drivers.test.ts`. Verified: `FakeTime` fakes both `Date` and `setTimeout`,
so `time.tick(3_600_000)` fires an hourly schedule with zero real elapsed time (SC-006).
**Publishing**: the package is published to JSR, so it must pass `deno publish`'s
**no-slow-types** check — every exported symbol needs an explicit type annotation, and an inferred
return type on a decorator factory is the classic way to fail it. This is why
`packages/cache/decorators.ts` spells out `Cached`'s full return type rather than letting it infer;
`@Schedule` must do the same. `deno publish --dry-run` in the package directory is the check, and it
passes today for `@lockness/cache`.
**Target Platform**: anywhere Deno runs — local, Docker, `deno compile` binary, Deno Deploy.
**Project Type**: framework library inside a Deno workspace monorepo.
**Performance Goals**: arming a schedule is O(1) per task; `nextRun` terminates in bounded time for
every expression, including ones that match nothing.
**Constraints**: single node. Two instances of the same application each run every task — stated in
the docs, not solved here.
**Scale/Scope**: tens of tasks per application, not thousands.

### Domain model

- **Bounded context**: in-process time-based task execution. It knows nothing about HTTP, and
  nothing about queues.
- **Vocabulary**: **task** (the callable unit — never "job", which `@lockness/queue` already owns
  for a different thing), **schedule** (the expression governing a task), **run** (one execution),
  **occurrence** (an instant a schedule matches).
- **Entities** (have identity): `ScheduledTask` — identified by its unique `name`; owns its
  expression, its options, its bound method, its run statistics, and its pending timer handle.
- **Value objects** (no identity): `CronExpression` (the five parsed fields), `ScheduleOptions`,
  `TaskStats`.
- **Invariants**:
  1. A task's `name` is unique within a `Scheduler`.
  2. A task has at most one pending timer at any instant.
  3. Every pending timer is in the scheduler's registry — there is no timer it cannot cancel.
  4. `nextRun(expression, t)` is strictly greater than `t`, always. A schedule can never re-select
     the instant it just fired, which is what makes a run loop impossible.
  5. A paused task has no pending timer; a running-and-enabled task has exactly one.
  6. *(A10)* `enabled: false` is terminal for the process lifetime — `resume()` on such a task
     throws. `enabled` and `pause()` are not two spellings of one state.
  7. *(S6)* An enabled, unpaused task has a pending timer after **every** run completes, whatever
     the run's outcome — including a run whose `onError` callback itself threw.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1 — No direct `hono` import | pass | The package never touches HTTP. |
| 2 — JSR-only specifiers | pass | Two `jsr:@lockness/*` deps, `jsr:@std/*` in tests. No `npm:` — no cron library is pulled in. |
| 3 — No `any` in exported APIs | pass | `ScheduleOptions` callbacks are typed; the class-constructor type uses `unknown[]`. Note: `@lockness/events`' `ListenerMetadata` uses `any` in exactly this position — this plan does **not** copy that. |
| 4 — Tailwind v4 syntax | n/a | No UI. |
| 5 — Pre-completion gate | pass | `deno fmt && deno lint && deno check && deno task test`, full output read — not `tail -1`. |
| 6 — Never edit `deno.lock` | pass | Adding a workspace member regenerates it via `deno cache`. |
| 7 — JSDoc on public APIs | pass | FR-015. |
| 8 — MVC layering | n/a | No controller, no persistence. |
| 9 — One category per commit | pass | `feat(scheduler)` / `test(scheduler)` / `docs(scheduler)` / `feat(core)` split per sub-issue. |
| TDD | pass | The parser is a pure function with a table of (expression, reference) → expected; written test-first. |
| DDD layering | pass | `cron_parser.ts` and `presets.ts` are pure domain — no I/O, no clock. `scheduler.ts` is the application layer. Discovery in core is the infrastructure adapter. |
| Domain Model gate | pass | Section 6. |
| No silent catches | pass | FR-010; the one `catch` in the package reports through `onError` and, absent one, `console.error`. |
| SOLID / YAGNI | pass | No clock abstraction is introduced — `FakeTime` already fakes `Date` and `setTimeout`, and a bespoke clock port would be a second spelling of it. |

### Complexity tracking

No violations. One judgment recorded instead: the discovery code lives in `@lockness/core`, not in
`@lockness/scheduler`, which splits the feature across two packages. That split is not new — it is
exactly how `@lockness/events` (metadata) and `packages/core/events/listener_discovery.ts`
(discovery) already divide. Putting discovery in the scheduler would invert the dependency graph:
the scheduler would need `@lockness/container` *and* the kernel's config, and `core` already
depends on scheduler-shaped things optionally rather than the reverse.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| New package `@lockness/scheduler` | yes | `mod.ts`, `types.ts`, `cron_parser.ts`, `presets.ts`, `scheduler.ts`, `task_runner.ts`, `timer_registry.ts`, `decorators.ts`, `deno.json`, `README.md`, `docs/DOCS.md`, `AGENTS.md`, `tests/` |
| Root `deno.jsonc` | yes | One entry appended to `workspace` — 26 members become **27** |
| `tests/package_structure.test.ts` | yes | **A3.** `PACKAGES` is a hardcoded 26-entry list; a guard test scans `packages/` and asserts `unconfigured.length === 0`, so it fails the instant `packages/scheduler/deno.json` exists. Six blocks quantify over the list, requiring `README.md` ≥50 chars, a `mod.ts` containing `export`, and an `AGENTS.md` ≥400 chars carrying the four literal headings `## Public surface` / `## Dependencies` / `## Where to work` / `## Pitfalls`. **This edit is the first task of the first sub-issue**, not a docs afterthought — otherwise `deno task test` is red for the whole implementation and hard rule #5 cannot be met incrementally. |
| `packages/core/deno.json` | yes | **A2.** 9 import entries become **10**. This is a *hard* edge: `packages/core/events/listener_discovery.ts` statically imports `@lockness/events`, so mirroring the pattern makes `@lockness/scheduler` a hard dependency of core. Accepted deliberately — the alternative (`tryImportOptionalPackage`, as `steps/events.ts` uses) buys optionality the framework does not want for a declared schedule that must either run or fail loudly. |
| `@lockness/core` — `KernelConfig` | yes | Two optional fields: `schedulesDir?: string`, `schedules?: unknown[]`. `KernelConfig` has **15 references across 9 files** |
| `@lockness/core` — bootstrap | yes | `packages/core/scheduler/schedule_discovery.ts` and `kernel/bootstrap/steps/scheduler.ts` at **order 560** — after `app_initialization` (550), before `devtools_routes` (600). 13 steps become 14; no order collision |
| `@lockness/core` — shutdown lifecycle | **no** | **Q1, settled 2026-08-31.** Not touched. `stop()` plus documented `SIGINT`/`SIGTERM` wiring; the framework-wide lifecycle is a separate backlog item, and #126's "kernel stops it on shutdown" criterion is re-scoped onto it |
| `@lockness/core` — `mod.ts` | yes | Re-exports `Schedule`, the presets, and `registerSchedules` — the path a user writes (see the last decision row) |
| `app/service/docs_loader.ts` | yes | **A7.** 64 package-path lines across the `slugToPath`, `llmsSlugToSource` and `llmsStaticFiles` maps, all hand-maintained. Without entries the new `docs/DOCS.md` is never served, and `tests/docs_structure.test.ts` covers only 12 curated entries so it will not catch the omission |
| `AGENTS.md` (and `.claude/CLAUDE.md`, its symlink) | yes | One row in the per-package brief index, one in the package-docs table |
| `docs/architecture.md`, `docs/packages.md` | yes | **A7.** Both enumerate packages by name (56 and 11 mentions) |
| `docs/dependencies.md` | yes | Regenerated by `deno task deps:analyze` |
| `@lockness/cli` — `make:*` stubs | yes | `make:schedule` and a `schedule.stub`, plus its row in `docs/STUBS.md`. Blast radius **not counted** — the architecture audit did not open `packages/cli/stubs.ts` |
| `config/schedules.ts` + `config/mod.ts` + `INIT_STUB_FILES` | **no** | **A8.** The listener mirror is really three-part (`listenersDir` + `listeners` + `config/listeners.ts`, stub #22 of 33). This feature deliberately mirrors **two** parts; `config/` is out of scope, and FR-014 says so |
| `app/schedule/` scaffold | **no** | **A8.** `INIT_STUB_FILES` ships 33 *file* paths and no directories — `app/listener/` is not scaffolded either. A missing directory is a no-op: discovery swallows `Deno.errors.NotFound` |
| `scripts/` | no | **Counted: 0 go stale.** `bump.ts` reads the workspace array; `deps_analyzer.ts` and `prepare_docs.ts` use `Deno.readDir` |
| HTTP surface | no | The scheduler never registers a route |
| Devtools panel | no | Explicitly out of scope on #96 |
| `@lockness/queue` | no | Untouched. A scheduled task may *dispatch* a queue job; the scheduler does not know that |
| Public API of any existing package | no | Additive only — no signature changes |

### Documentation (this feature)

```text
.specnaut/specs/002-schedule-decorator/
├── plan.md    # This file — the whole plan
└── tasks.md   # tasks output, derived from THIS file once approved
```

### Visual Prototyping with Claude Artifacts

The project has a front-end surface (`packages/ui`, `app/view/`, `public/`), so this section is
kept rather than removed — but **this feature adds no screen and no state a user sees**. A devtools
panel for scheduled tasks is explicitly out of scope on #96. Nothing to prototype.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| **`setTimeout` overflow — measured, not theorised.** Running `setTimeout(fn, 2**31)` on deno 2.9.6 prints `TimeoutOverflowWarning: 2147484647 does not fit into a 32-bit signed integer. Timeout duration was set to 1.` and the callback fires **33 ms later**. `@Schedule(yearly)` would therefore fire immediately, re-arm, and fire again — an unbroken loop, the worst possible failure for a scheduler. | Cap every armed delay at 24 days (`2_073_600_000` ms, comfortably under the limit) and re-arm without running when the cap is hit. One test drives a `yearly` task under `FakeTime` and asserts it arms a capped timer and does not fire. |
| **Pending timers keep the process alive**, so a CLI command or a test that boots the kernel never exits. | `Deno.unrefTimer` on every armed handle (FR-009b) — verified to let a process exit with a 60 s timer outstanding. `stop()` still clears the registry, and `getStats().pendingTimers` is what the test asserts on, because the runtime's sanitizer does **not** catch a leaked timer (FR-009). |
| **Writing a cron parser is a solved problem** and hand-rolling one invites off-by-one bugs at field boundaries. | The scope is deliberately the 5-field subset with no aliases, no seconds, no timezones — a few hundred lines, exhaustively table-testable. The alternative (`npm:cron-parser`) would breach hard rule #2 for a dependency we can fully specify. Revisit only if the table finds the hand-rolled version wanting. |
| **A schedule that matches nothing** (`0 0 30 2 *`) sends a naive next-run search into an unbounded loop at boot. | `nextRun` searches a bounded horizon (4 years — long enough to cross a leap cycle) and throws naming the expression when it finds no match. Tested. |
| **Multi-instance duplicate execution.** Two replicas each fire every task; a "send invoices" task sends twice. | Not solved — single-node is the declared v1 scope. It is stated in `README.md` and `DOCS.md` in the same words as the equivalent warning already in `packages/core/docs/throttling.md`, so the gap is documented where an operator will meet it, not only in a closed issue. |
| **Silent non-discovery.** A class in the wrong directory is simply never scheduled, and nothing says so — the failure mode `discoverListeners` already has. | ~~The bootstrap step logs the count, as the listeners step does.~~ **Corrected (S3): that mitigation was inert.** `listener_discovery.ts:161` and `steps/listeners.ts:46` both log *only when the count is `> 0`*, so a zero-count boot says nothing at all — the one case the mitigation was written for. FR-014b now requires the **armed** count logged unconditionally, and FR-014's carve-out replaces the bare `catch { continue }` with a per-export ERROR log. |
| **A timed-out run is not a cancelled run** (S2). A JS promise cannot be cancelled, so "abandon after 30 s" means the scheduler stops waiting while the task keeps its connection. At `everyMinute` with a 90 s task, live runs accumulate without bound. | FR-017: `overlap: 'skip'` by default, plus a real `AbortSignal`. `QueueWorker` (`packages/queue/mod.ts:391`) is serial by construction — concurrency 1 — and is the precedent to follow, not merely to cite. |
| **Two replicas invoice every customer twice** (S8). Horizontal scale-out, a rolling-deploy overlap window, or Deploy region fan-out all produce it. | The plan originally proposed copying the wording from `packages/core/docs/throttling.md`. **That analogy is wrong**: an under-enforced rate limit *degrades* a control predictably; duplicate execution *corrupts other people's state*. FR-023 reserves the lock port and adds the `SCHEDULER_ENABLED` gate; `DOCS.md` names the concrete consequence in its own words. |
| **Shutdown has no framework hook to hang off** — see Q1. | Whatever Q1 settles is written into `DOCS.md` as the supported wiring, so the answer is discoverable rather than folklore. |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| **A1** CRITICAL | The step was slotted at ~420, but `app_init.ts` registers **two** steps — 200 and **550** — and 550 is where controllers, static files and the mount point are built. A `runOnStart` task would fire against a half-built app, before `KernelBooted` (500) and before `main.ts:4` calls `app.listen()`. | **Plan changed.** Order is now **560** (after 550, before `devtools_routes` 600), with its own decision-table row. *Verified independently*: `grep "order: " steps/*.ts` returns 13 steps and confirms 550. |
| **A2** HIGH | §7 justified the two-package split with "core already depends on scheduler-shaped things optionally". False: `packages/core/deno.json` lists `@lockness/events` as one of 9 **hard** imports, and `listener_discovery.ts:12` imports it statically. Mirroring makes `@lockness/scheduler` a hard dependency of core, and §8 did not list `packages/core/deno.json`. | **Plan changed.** §8 lists the file (9 → 10 entries); the hard edge is accepted deliberately and stated, with FR-016 given a decision row carrying a grep in both directions. *Verified independently.* |
| **A3** HIGH | `tests/package_structure.test.ts` hard-fails the moment `packages/scheduler/deno.json` exists — a 26-entry `PACKAGES` list plus a guard test asserting `unconfigured.length === 0`. Unlisted in §8. | **Plan changed.** Listed in §8 with its four required artefacts and four literal headings, and made the **first task of the first sub-issue** — otherwise the suite is red for the whole implementation and hard rule #5 cannot be met incrementally. *Verified independently.* |
| **A4** HIGH | Name derivation was homed in `decorators.ts` while uniqueness lived in `scheduler.ts` — but `register()` is public, so an imperative caller bypasses the derivation home entirely, and `addInitializer` fires at *instantiation*, not decoration. | **Plan changed.** Name resolution moved to `Scheduler.register`, the one gate both entry points cross and the owner of the uniqueness invariant. The decorator now derives nothing. |
| **A5** HIGH | FR-014 said to mirror the listeners mechanism "and no other", whose catch-all `console.error`s and continues — so FR-005's throw and the bounded-horizon throw get eaten, and a `0 0 30 2 *` task boots clean and never fires. | **Plan changed.** The step re-throws parse and registration failures; only `Deno.errors.NotFound` on the directory is skipped; the **armed** count is logged, not the registered count. Converged with S3. |
| **A6** MEDIUM | Five requirements had no row: FR-002, FR-005, FR-007, FR-016, and the `pause`/`resume`/`runNow`/`getStats` half of FR-008 — with `getStats()` now load-bearing for FR-009's rewritten assertion. | **Plan changed.** Section 5 went from 9 rows to 19, each with a literal grep and an expected hit count. |
| **A7** MEDIUM | §8 understated the documentation blast radius: `app/service/docs_loader.ts` (64 package-path lines, 3 hand-maintained maps — and `tests/docs_structure.test.ts` covers only 12 curated entries, so it will *not* catch the omission), `.claude/CLAUDE.md`, `docs/architecture.md`, `docs/packages.md`. Counter-evidence in the plan's favour: **0 scripts go stale** — all use `Deno.readDir` or the workspace array. | **Plan changed.** All four added to §8. |
| **A8** MEDIUM | "Mirrors listeners exactly" is false — the real mirror is three-part, including `config/listeners.ts` (stub #22 of 33). And §8's "empty `app/schedule/` in the new-project tree" is **not expressible**: `INIT_STUB_FILES` ships 33 *files* and no directories; `app/listener/` is not scaffolded either. | **Plan changed.** FR-014 now says the two-part mirror is deliberate and `config/` is out of scope; the scaffold line is deleted and replaced with "a missing directory is a no-op". |
| **A9** MEDIUM | Four rows had ungreppable duplication columns. Sharpest case: row 8 forbade "two default directory paths, one in the step and one in JSDoc" — the exact duplication that **already ships** for listeners (`steps/listeners.ts:33` vs `kernel_decorators.ts:211`). Mirroring the pattern reproduces the defect the row forbids. | **Plan changed.** `DEFAULT_SCHEDULES_DIR` is one exported constant, `{@link}`-ed from the JSDoc rather than restated; grep `'./app/schedule'` → exactly 1 hit. Every row now carries a grep. |
| **A10** MEDIUM | `enabled: false` and `pause()` are two representations of "not firing" with no stated interaction — `resume()` on a disabled task is undefined. | **Plan changed.** Invariant 6 added (§6). |
| **A11** LOW | The import path for `@Schedule` was undecided, and §8's "re-exports the discovery helpers, as it does for listeners" is imprecise — core re-exports `registerListeners` but **not** `discoverListeners`. | **Plan changed.** One row: users import from `@lockness/core`, per the project philosophy; grep for the losing spelling in the docs. |
| **A12** LOW | A third spelling of "derive a name from class + method" enters the repo (`@Cached` at call time, `@Listener` not at all). | **Objection accepted, noted.** With A4 applied the derivation shape matches `@Cached`'s and is not a new convention. A shared helper would have to live in `@lockness/contract`; not worth it for one call site. |
| **A13** LOW | Predicted three cycles out: `scheduler.ts` accumulates five responsibilities, and Q2's overlap policy lands in the same file. | **Plan changed** — the split is pre-committed rather than predicted: `timer_registry.ts` (arm, cap, floor, cancel, unref), `task_runner.ts` (timeout, retry, callbacks), `scheduler.ts` (identity, lifecycle, stats). |

**Verdict**: **fail** — 1 CRITICAL, 4 HIGH, 5 MEDIUM, 3 LOW, all now folded in. **Coverage**: the
FR→row mapping for all 16 original requirements; the greppability of all 9 original rows; three
named homes; bootstrap ordering against all 13 registered steps read from `registry.ts`; TC39
feasibility of FR-002 and the TS1270 constraint checked against `packages/cache/decorators.ts`,
`packages/events/decorators.ts` and `packages/contract/routing/decorators.ts`; and counted blast
radius for the workspace (26→27), `package_structure.test.ts`, `KernelConfig` (15 refs / 9 files),
bootstrap steps, `createApp` call sites (18 test + 1 app), `scripts/` (0 stale), `docs_loader.ts`
(64 lines), `config/` (9 files) and `INIT_STUB_FILES` (33 paths). **Not covered**, and stated as
such by the auditor rather than estimated: the `@lockness/cli` stub registry and `make:schedule`
blast radius, `docs/STUBS.md` row count, `kernel/loader.ts`'s config→context path, and
`@lockness/container` lifetime semantics — which bear on whether one task instance exists or many.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel with the architecture
audit. Kept separate on purpose — the architect asks whether a rule has one home, this seat asks
whether that home is reachable by someone who should not reach it.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| **S1** HIGH | `pause`/`resume`/`runNow`/`getStats` have **no authorization home** — the word "auth" does not appear in the plan. §8 says "HTTP surface: no", which reads as "nothing to authorize"; SC-007 requires operating a task on a live instance. Both true, jointly misleading: the framework never decides, so the gate lands wherever the app author puts it. Precedent for that going wrong: `@lockness/devtools` mounts `/_devtools` gated only by a JSDoc *example*. | **Plan changed.** A decision row records that the authorization home is **the application's own layer, not the scheduler** — an explicit recorded decision rather than an omission. `DOCS.md` carries a worked example behind `@AuthRequired()` plus a role check, and a "never mount these unauthenticated" warning. `pause`/`resume`/`runNow` on an unknown name throw rather than silently no-op. |
| **S2** HIGH | FR-011's `timeout` cannot cancel a JS promise, and Q2 (overlap) was left open — so at `everyMinute` with a 90 s task, live runs accumulate without bound, each holding its connection. Retries with no idempotency key re-execute partially-succeeded side effects. | **Plan changed.** FR-017 (`overlap: 'skip'` default + real `AbortSignal`) and FR-018 (range validation; `retryDelay: 0` was a hot loop by configuration). Q2 now carries this as its recommended answer rather than shipping open. |
| **S3** HIGH | FR-014 bound discovery to a mechanism whose `catch { continue }` swallows FR-013's duplicate-name throw — delivering exactly the silent replacement FR-013 forbids. And §9's stated mitigation was **inert**: the mirrored code logs only when the count is `> 0`. | **Plan changed**, and the risk row is struck through and corrected in place. *Verified independently*: `listener_discovery.ts:153` is a bare `catch { continue }`; line 161 and `steps/listeners.ts:46` both guard on `> 0`. This one corrected my own text, not the auditor's. |
| **S4** MEDIUM | `TaskStats` had no shape, and is the natural carrier for stack traces and `Class.method` internals — with the devtools panel its obvious next consumer. | **Plan changed.** FR-019 pins a closed shape; `getStats()` never returns an `Error`. FR-018 bounds `name` to `[A-Za-z0-9._:-]{1,64}` — it is a map key, a stats label *and* a log field. |
| **S5** MEDIUM | The only error channel was raw `console.error(error)`, which in Deno prints the stack; a `drizzle`/`postgres` error carries the statement and bound parameters, a `fetch` failure carries a URL with its token. FR-016 forbids `@lockness/logger`, so there is no redaction layer by construction. | **Plan changed.** FR-020 pins the log line's shape and adds an optional reporter port typed in `@lockness/contract` — which FR-016 already permits — wired by the bootstrap step. |
| **S6** MEDIUM | A throwing `onError` escapes the one permitted catch, so the next occurrence is never armed and the task is silently dead — invariant 5 violated at runtime. | **Plan changed.** FR-021: callbacks run inside their own guard; re-arming is in a `finally`. |
| **S7** MEDIUM | `schedulesDir` → `join(Deno.cwd(), dir)` with **no containment check**, recursive symlink-following, `new URL(\`file://${p}\`)` string-built, every export instantiated, under `-A`. Not exploitable today — the value is a source constant — but the discovery module is being written once, now. | **Plan changed.** FR-022: resolve-then-assert containment, no symlink following, `toFileUrl()`. The string form also mis-parses `#`/`?` and silently skips a file. |
| **S8** MEDIUM | Multi-instance duplicate execution answered by documentation copied from `throttling.md` — **a non-analogous precedent**. An under-enforced rate limit degrades a control predictably; duplicate execution corrupts other people's state. A reader who internalised the throttling caveat will under-weight this one *because the words are the same*. | **Plan changed.** FR-023 reserves the `lock?: SchedulerLock` port and adds `SCHEDULER_ENABLED`; the docs warning is written in its own words. **This is the one finding a later fix cannot reach cheaply** — retrofitting the port changes every `@Schedule` call site. |
| **S9** MEDIUM | Q1 read as an ergonomics problem; its consequence is correctness, recurring on every rolling deploy — a run torn down mid-flight leaves the charge without the order. `stop()` could also race a fresh arm. | **Plan changed.** FR-024 adds the terminal `stopping` flag; Q1's answer must additionally state in `DOCS.md` that task bodies are idempotent or transactional. |
| **S10** LOW | The 24-day cap defends the overflow path found; **any other** arithmetic bug yielding a near-zero delay still fires a metered task in a tight loop — denial-of-wallet, silent until the bill. | **Plan changed.** FR-025 adds a 1 000 ms floor logged at WARN, and the test becomes an invariant across the full preset table rather than `yearly` alone. |

**Verdict**: **fail** — 0 CRITICAL, 3 HIGH, 6 MEDIUM, 1 LOW, all folded in. **Coverage**: all 12
sections, FR-001–FR-016, SC-001–SC-007, US1–US7, the edge cases, the original 9 decision rows, the
constitution check, the risk table and the three open questions — read against the mechanism the
plan commits to inherit (`listener_discovery.ts` and `steps/listeners.ts`, line by line), the config
surface it extends, and `QueueWorker` as the nearest precedent. Four load-bearing facts were checked
rather than assumed, and three of them **cleared** the design: the container has no request scope,
`@lockness/auth` keeps no ambient current-user state, and all four session drivers expire lazily on
read — so pausing the plan's own motivating example ("purge expired sessions hourly") grants nobody
access, and a scheduled task runs with *no* principal rather than somebody else's. **Not covered**:
no code exists, so nothing here is an implementation verdict; the devtools panel and any
application-side mounting of US5 were assessed only as the surfaces this design will land on.

## 12. Open questions

*Asked at the stop that ended the plan phase, one at a time. All three are settled; each is binding
on the implementer exactly as a decision-table row is.*

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1 — How does the scheduler stop?** Lockness has no shutdown lifecycle: `App.listen()` returns Deno's server and the JSDoc tells the author to wire `Deno.addSignalListener('SIGINT', …)` themselves. #96 asks for "graceful shutdown" and #126 for "the kernel stops it on shutdown" — nothing exists to hang either on. `Deno.unrefTimer` (FR-009b) defuses the worst of it, so the real question was whether an in-flight run gets to finish. | **`stop()` plus documented wiring; `@lockness/core` is not touched.** The scheduler exposes `stop()`; `DOCS.md` shows the `SIGINT`/`SIGTERM` wiring and states that a run may be terminated at any instant, so task bodies must be idempotent or transactional (S9). A **separate backlog item** is filed for the framework-wide shutdown lifecycle, and **#126's acceptance criterion "the kernel stops it on shutdown" is re-scoped onto it** — this feature does not silently drop it, it moves it somewhere it can be done properly. | 2026-08-31 |
| **Q2 — What happens when a run is still executing at the next occurrence?** A JS promise cannot be cancelled, so `timeout` can only ever mean "stop waiting", not "killed" — while the run keeps its database connection. | **`overlap: 'skip'` is the default, and `timeout` passes a real `AbortSignal`.** A task has at most one run in flight; an occurrence arriving during a run is skipped and counted in `getStats().skippedCount`. `overlap: 'allow'` remains available as an explicit opt-in. This is `QueueWorker`'s semantics (`packages/queue/mod.ts:391` — serial by construction), and it closes the security audit's S2. FR-017 and FR-018 carry it. | 2026-08-31 |
| **Q3 — What does `runOnStart` mean, and is there catch-up?** | **Fires once at boot; there is never any catch-up.** `runOnStart: true` runs the task immediately at startup, then the normal calendar. The scheduler knows only `nextRun(now)` — an occurrence that fell while the process was down is lost, permanently and by design, which is what keeps "no persistent state" (#96's own out-of-scope line) true. Consequence to be written in `DOCS.md`, not discovered: **a crash-looping deploy replays the task once per boot, so a `runOnStart` body must be idempotent.** | 2026-08-31 |

### Decided without asking

- **UTC, not host-local time.** #96 puts "DST-aware timezone handling beyond UTC" out of scope, and
  host-local *is* DST handling — "daily at 03:00" would shift twice a year. Scope forces UTC;
  recorded here so it is a visible decision rather than an implementation accident.
- **`retries: 3` means three *additional* attempts**, four executions at most. It matches
  `maxAttempts` semantics nowhere else in the workspace, so the JSDoc says it in words.
- **Retries are abandoned when the next occurrence arrives.** A retry chain that outlives its own
  schedule would overlap with the next run and make Q2's answer meaningless.
- **Every armed timer is `unref`'d.** Verified on deno 2.9.6: a process holding an unref'd 60 s
  timer exits in ~50 ms. Without this, a `nessy` CLI command that boots the kernel would hang until
  the next occurrence of the longest schedule. It also means the scheduler alone will not hold a
  process open — an application that is *only* a scheduler needs its own reason to stay alive, which
  the docs must say.
- **`@std/testing/time`'s `FakeTime`, not a bespoke injected clock.** #124/#125 ask for "an
  injected clock"; the parser already takes its reference instant as a parameter (FR-004), and for
  the Scheduler `FakeTime` fakes both `Date` and `setTimeout`. It is the precedent in
  `packages/cache` and `packages/session`. A hand-written clock port would be a second spelling.
- **The word is "task", never "job".** `@lockness/queue` owns "job" for a different concept, and one
  word meaning two things across sibling packages is how docs start lying.
- **No third-party cron dependency.** Hard rule #2 permits `npm:` only when JSR-unavailable *and*
  justified; a 5-field parser we fully specify does not clear that bar.
- **Discovery mirrors listeners exactly** — `schedulesDir` + `schedules` on `@Kernel`, a bootstrap
  step, a discovery module under `packages/core/`. The pattern is already decided in this
  repository; re-deciding it would produce a second spelling of application-class discovery.
