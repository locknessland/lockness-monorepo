# @lockness/scheduler — agent brief

Declarative cron scheduling. A `@Schedule` decorator records intent; a
`Scheduler` service arms one timer per task and runs it. Times are **UTC only**,
state is **in-process only**, and the package holds no HTTP surface.

## Public surface

| Export                                          | What it is                                                                                         |
| :---------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| `Schedule(expression, options?)`                | Method decorator. Validates at decoration time, records metadata, returns the method **unchanged** |
| `everyMinute` … `weekends`                      | Preset expression strings                                                                          |
| `Scheduler`, `scheduler()`                      | The service: `register`, `start`, `stop`, `pause`, `resume`, `runNow`, `getStats`                  |
| `parse`, `nextRun`                              | The pure 5-field cron parser                                                                       |
| `ScheduleOptions`, `TaskStats`, `SchedulerLock` | Types                                                                                              |

## Dependencies

Imports `@lockness/contract` and `@lockness/container`. **Nothing else** — no
`hono`, and never `@lockness/core`. The reverse edge exists: `@lockness/core`
depends on this package to wire discovery and the boot step.

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
