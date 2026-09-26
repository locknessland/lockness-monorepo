# `@lockness/scheduler` — agent brief

Declarative cron scheduling. A `@Schedule` decorator records intent; a
`Scheduler` service arms one timer per task and runs it. Times are **UTC only**,
state is **in-process only**, and the package holds no HTTP surface.

## Invariants

- **Times are UTC only.** A local-time expression silently fires at the wrong
  hour; there is no timezone handling and adding one is a design change, not a
  patch.
- **State is in-process only.** Two replicas each fire every task, unless the
  task is `onOneServer` AND a `SchedulerLock` is installed (#219). This package
  ships only `MemorySchedulerLock`; the Redis and Deno KV adapters live in
  `packages/core/scheduler/locks.ts`, so this package stays dependency-free.
- **Every timer goes through `timer_registry.ts`.** It is the only place allowed
  to call `setTimeout` / `clearTimeout` / `Deno.unrefTimer`, because it is where
  the 24-day cap and the 1 000 ms floor live.

## Dependency contract

<!-- generated:deps -->

| Direction                                      | Packages                                                                    |
| :--------------------------------------------- | :-------------------------------------------------------------------------- |
| Imports (static)                               | —                                                                           |
| Imports (soft, via `tryImportOptionalPackage`) | —                                                                           |
| Imported by                                    | `core`                                                                      |
| **Must never import**                          | `core` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                                             |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `MemorySchedulerLock`, `Scheduler`, `TaskTimeoutError`, `TimerRegistry`                                                                                                                                                                                                                             |
| function  | `Schedule`, `addScheduleMetadata`, `getScheduleMetadata`, `nextRun`, `parse`, `resolveTaskName`, `runTask`, `scheduler`, `setScheduler`, `validateScheduleOptions`                                                                                                                                  |
| interface | `CronExpression`, `MemorySchedulerLockOptions`, `RunOutcome`, `ScheduleMetadata`, `ScheduleOptions`, `SchedulerLock`, `SchedulerReporter`, `SchedulerStats`, `TaskFailure`, `TaskRegistration`, `TaskStats`                                                                                         |
| typeAlias | `OverlapPolicy`, `TaskBody`                                                                                                                                                                                                                                                                         |
| variable  | `DEFAULT_SCHEDULES_DIR`, `MAX_DELAY_MS`, `MAX_RETRIES`, `MIN_DELAY_MS`, `NAME_PATTERN`, `PRESETS`, `SCHEDULE_METADATA`, `daily`, `everyFifteenMinutes`, `everyFiveMinutes`, `everyMinute`, `everyTenMinutes`, `everyThirtyMinutes`, `hourly`, `monthly`, `weekdays`, `weekends`, `weekly`, `yearly` |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Change                                      | File                                                                            |
| :------------------------------------------ | :------------------------------------------------------------------------------ |
| Cron grammar, next-run, UTC                 | `cron_parser.ts`                                                                |
| A preset's expression                       | `presets.ts`                                                                    |
| Timers, the delay cap and floor, `unref`    | `timer_registry.ts`                                                             |
| Timeout, retries, `onError` / `onSuccess`   | `task_runner.ts`                                                                |
| Task identity, uniqueness, lifecycle, stats | `scheduler.ts`                                                                  |
| Hostile-input error normalisation           | `errors.ts`                                                                     |
| Decoration-time validation, metadata        | `decorators.ts`                                                                 |
| Option and stat shapes                      | `types.ts`                                                                      |
| Discovery and the boot step                 | `packages/core/scheduler/`, `packages/core/kernel/bootstrap/steps/scheduler.ts` |

## Pitfalls

- **`setTimeout` overflows above `2^31 - 1` ms.** Deno sets the duration to 1 ms
  and warns; a `yearly` task would fire in a tight loop. `timer_registry.ts`
  caps at 24 days and floors at 1 000 ms. Never call `setTimeout` elsewhere.
- **A leaked timer does not fail `Deno.test`** — measured on 2.9.6, in sync and
  async form, with and without `--trace-leaks`. Assert on
  `getStats().pendingTimers` instead.
- **The decorator must return the original method.** Returning a replacement
  with a different type is TS1270 and would force every scheduled method to be
  `async`, which is the constraint `@Cached` had to accept.
- **`addInitializer` fires at instantiation, not decoration.** Metadata does not
  exist until the DI container constructs the class.
- **A promise cannot be cancelled.** `timeout` passes an `AbortSignal`; a task
  that ignores it keeps running. `overlap: 'skip'` is what bounds concurrency.
- **A lock release runs after the outcome is recorded.** It is in the run's
  `finally`, so a release that rejects is warned about and never touches
  `failureCount` or `lastError` — the claim is left to its TTL.

## Tests

<!-- generated:tests -->

10 test files for 11 source files:

- `packages/scheduler/tests/cron_parser.test.ts`
- `packages/scheduler/tests/cron_parser_errors.test.ts`
- `packages/scheduler/tests/decorators.test.ts`
- `packages/scheduler/tests/distributed_lock.test.ts`
- `packages/scheduler/tests/errors.test.ts`
- `packages/scheduler/tests/presets.test.ts`
- `packages/scheduler/tests/reporting.test.ts`
- `packages/scheduler/tests/scheduler.test.ts`
- `packages/scheduler/tests/task_runner.test.ts`
- `packages/scheduler/tests/timer_registry.test.ts`

3 mutation batteries — **`deno test` does not run these.** Each is an executable
that mutates a source file and re-runs the suites that should notice. Run them
with `deno task mutate` (all of them, one at a time) or
`deno task mutate <name>` (one); nightly CI runs the full sweep. See
[testing.md](../../docs/testing.md#mutation-batteries).

- `packages/scheduler/tests/mutations/lock_release_warn_389.ts`
- `packages/scheduler/tests/mutations/report_encoding_410.ts`
- `packages/scheduler/tests/mutations/report_guard_394.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno task gate             # the full gate, as the pre-push hook runs it
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 10 test files directly —

```bash
deno test -A packages/scheduler/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
