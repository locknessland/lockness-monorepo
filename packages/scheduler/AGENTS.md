# `@lockness/scheduler` — agent brief

Declarative cron scheduling. A `@Schedule` decorator records intent; a
`Scheduler` service arms one timer per task and runs it. Times are **UTC only**,
state is **in-process only**, and the package holds no HTTP surface.

## Invariants

- **Times are UTC only.** A local-time expression silently fires at the wrong
  hour; there is no timezone handling and adding one is a design change, not a
  patch.
- **State is in-process only.** Two replicas each fire every task. The `lock`
  port is declared and unimplemented — do not assume it does anything.
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
| class     | `Scheduler`, `TaskTimeoutError`, `TimerRegistry`                                                                                                                                                                                                                                                    |
| function  | `Schedule`, `addScheduleMetadata`, `getScheduleMetadata`, `nextRun`, `parse`, `resolveTaskName`, `runTask`, `scheduler`, `setScheduler`, `validateScheduleOptions`                                                                                                                                  |
| interface | `CronExpression`, `RunOutcome`, `ScheduleMetadata`, `ScheduleOptions`, `SchedulerLock`, `SchedulerReporter`, `SchedulerStats`, `TaskFailure`, `TaskRegistration`, `TaskStats`                                                                                                                       |
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
- **Single node.** Two replicas each fire every task. Reserve the `lock` port.

## Tests

<!-- generated:tests -->

7 test files for 8 source files:

- `packages/scheduler/tests/cron_parser.test.ts`
- `packages/scheduler/tests/cron_parser_errors.test.ts`
- `packages/scheduler/tests/decorators.test.ts`
- `packages/scheduler/tests/presets.test.ts`
- `packages/scheduler/tests/scheduler.test.ts`
- `packages/scheduler/tests/task_runner.test.ts`
- `packages/scheduler/tests/timer_registry.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze     # cycles, declaration drift, tier policy
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 7 test files directly —

```bash
deno test -A packages/scheduler/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
