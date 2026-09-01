# Scheduler

`@lockness/scheduler` runs a method on a cron schedule. Put `@Schedule` above it
and nothing else needs editing — no crontab, no `--unstable-cron` flag, no
hand-rolled `setInterval`.

```ts
import { daily, Schedule } from '@lockness/core'

export class ReportService {
    @Schedule('0 3 * * *')
    async nightlyDigest() {
        await sendDigest()
    }
}
```

Times are **UTC**. State is **in-process**. The package registers no route.

## Contents

- [Declaring a task](#declaring-a-task)
- [Expressions and presets](#expressions-and-presets)
- [Options](#options)
- [Overlap: what happens when a run is slow](#overlap-what-happens-when-a-run-is-slow)
- [Failure, timeout and retries](#failure-timeout-and-retries)
- [Discovery and the kernel](#discovery-and-the-kernel)
- [Operating a task: pause, resume, runNow](#operating-a-task-pause-resume-runnow)
- [Stopping](#stopping)
- [Running more than one instance](#running-more-than-one-instance)
- [Testing](#testing)

## Declaring a task

Any class under `app/schedule/` is discovered at boot.

```ts
// app/schedule/report_service.ts
import { hourly, Schedule } from '@lockness/core'

export class ReportService {
    @Schedule('0 3 * * *', { name: 'nightly-digest' })
    async digest() { … }

    @Schedule(hourly)
    async refresh() { … }
}
```

Without a `name`, a task is called `ClassName.methodName` — here,
`ReportService.refresh`. That name is how you address it later, and it must
match `[A-Za-z0-9._:-]{1,64}`.

**The method is returned unchanged.** A synchronous method is perfectly legal:

```ts
@Schedule(hourly)
tick(): number {
    return this.counter++ // still callable, still returns a number
}
```

That is a deliberate difference from `@Cached`, which must decorate an `async`
method. A TC39 method decorator may not return a replacement with a different
type, so `@Schedule` returns the original and lets the runner own the timeout.

## Expressions and presets

Standard 5-field cron: minute, hour, day-of-month, month, day-of-week. Each
field takes `*`, a value, a range `1-5`, a list `1,3,5`, or a step `*/15`,
`10-20/5` or `5/15`.

**A step on a bare single value runs to the top of the field.** `5/15` in the
minute field is `5-59/15` — minutes 5, 20, 35 and 50 — which is what Vixie cron
means by it, so a crontab pasted in from a Linux box keeps its meaning here.

| Preset                | Expression     | Fires                             |
| :-------------------- | :------------- | :-------------------------------- |
| `everyMinute`         | `* * * * *`    | every minute                      |
| `everyFiveMinutes`    | `*/5 * * * *`  | :00, :05, :10 …                   |
| `everyTenMinutes`     | `*/10 * * * *` | :00, :10, :20 …                   |
| `everyFifteenMinutes` | `*/15 * * * *` | :00, :15, :30, :45                |
| `everyThirtyMinutes`  | `*/30 * * * *` | :00, :30                          |
| `hourly`              | `0 * * * *`    | top of the hour                   |
| `daily`               | `0 0 * * *`    | midnight UTC                      |
| `weekly`              | `0 0 * * 0`    | Sunday midnight UTC               |
| `monthly`             | `0 0 1 * *`    | the 1st, midnight UTC             |
| `yearly`              | `0 0 1 1 *`    | 1 January, midnight UTC           |
| `weekdays`            | `0 0 * * 1-5`  | Monday–Friday, midnight UTC       |
| `weekends`            | `0 0 * * 6,0`  | Saturday and Sunday, midnight UTC |

**Not supported, and rejected rather than mis-parsed**: 6-field syntax with
seconds, and name aliases (`JAN`, `MON`). A malformed expression throws **when
the class is defined**, not at first fire.

When both the day-of-month and day-of-week fields are restricted, they are a
**union** — standard cron semantics. `0 0 15 * 1` means "the 15th, or any
Monday", not "a Monday that is also the 15th".

### Everything is UTC

`daily` fires at 00:00 UTC wherever the process runs. This is not a default that
can be changed: local time means DST handling, and "daily at 03:00" shifting
twice a year is a worse surprise than one stated timezone.

## Options

```ts
@Schedule('0 3 * * *', {
    name: 'nightly-digest',
    timeout: 30_000,
    retries: 2,
    retryDelay: 5_000,
    overlap: 'skip',
    runOnStart: false,
    enabled: true,
    onError: (f) => metrics.increment('task.failed', { task: f.task }),
    onSuccess: (name) => metrics.increment('task.ok', { task: name }),
})
async digest(signal: AbortSignal) { … }
```

| Option       | Default            | Meaning                                                      |
| :----------- | :----------------- | :----------------------------------------------------------- |
| `name`       | `ClassName.method` | Identity. Must match `[A-Za-z0-9._:-]{1,64}`                 |
| `timeout`    | none               | Milliseconds before the run is aborted                       |
| `retries`    | `0`                | **Additional** attempts — `2` means three executions at most |
| `retryDelay` | `1000`             | Milliseconds between attempts. Must be > 0                   |
| `overlap`    | `'skip'`           | What an occurrence does while a run is in flight             |
| `runOnStart` | `false`            | Run once at boot, then follow the calendar                   |
| `enabled`    | `true`             | `false` registers without scheduling. Terminal               |
| `onError`    | none               | Called after each failed attempt                             |
| `onSuccess`  | none               | Called after a successful run                                |

Every numeric bound is checked **at decoration time**, so a mistake fails where
it was written. `retryDelay: 0` with a large `retries` is a hot loop, not a
retry policy, and is refused.

### `runOnStart` fires on every boot, and never catches up

`runOnStart: true` runs the task immediately at startup. It does **not** replay
occurrences missed while the process was down — there is no persisted state that
could say what was missed, which is what keeps this package free of a database.

Two consequences worth stating plainly:

- A daily task whose 03:00 occurrence fell during a deploy is simply skipped.
- **A crash-looping deploy replays a `runOnStart` task once per restart.** Its
  body must be idempotent.

### `enabled: false` is terminal

A task declared `enabled: false` is registered and visible in `getStats()`, and
never scheduled. `resume()` on it **throws**: `enabled` and `pause()` are not
two spellings of one state, and quietly switching a disabled task on would be
worse than refusing.

## Overlap: what happens when a run is slow

A JavaScript promise cannot be cancelled. `timeout` therefore aborts a signal
and stops awaiting — it cannot kill a body that ignores the signal. That is why
`overlap` exists and why it defaults to `'skip'`:

```ts
@Schedule(everyMinute) // overlap: 'skip'
async sync(signal: AbortSignal) {
    await fetch(url, { signal })
}
```

```text
t=0    run A starts
t=60   A still running -> occurrence SKIPPED, skippedCount++
t=90   A finishes
t=120  run B starts
```

At most one run is in flight. Under `overlap: 'allow'` every occurrence starts
regardless, and a task slower than its period accumulates live runs — each
holding whatever connection it opened — without bound. Choose it deliberately.

The next occurrence is armed **when the timer fires, before the run**, so a slow
run never shifts its own schedule.

## Failure, timeout and retries

A task that throws is isolated: `onError` fires, the failure is reported, and
every other task keeps its schedule.

```ts
@Schedule(hourly, { timeout: 30_000, retries: 2, retryDelay: 5_000 })
async fragile(signal: AbortSignal) { … }
```

- `retries: 2` means **three** executions at most.
- **Retries are abandoned when the next occurrence arrives**, and the
  abandonment is reported at warn level. A chain whose backoffs outlast the
  schedule's own period would otherwise overlap the run it was meant to precede
  — `retryDelay: 90_000` on an every-minute task is the shape. The arriving
  occurrence runs normally; it is not skipped against the chain it just cut
  short.
- Size the backoff against the period, not against the sink you are retrying:
  `retries × retryDelay` longer than one period means the last attempts never
  happen.
- An `onError` that itself throws is contained and logged. It cannot stop the
  retry chain and it cannot prevent re-arming — a task must not be able to die
  silently because its logging sink was down.

### What gets logged

The default failure line carries the task name, the attempt number, a run id,
and the error's **name and message** — never the raw error object, and never the
task's arguments. A `drizzle`/`postgres` error's stack carries the failing
statement and its bound parameters, and stdout is collected somewhere with
broader access than the database.

**With `@lockness/logger` installed you need do nothing**: the boot step wires
it into the reporter port, so failures reach the application's logging rather
than raw `console.error`.

To route them somewhere else instead, install your own reporter before boot:

```ts
import { Scheduler, setScheduler } from '@lockness/core'

setScheduler(
    new Scheduler({
        error: (msg, fields) => mySink.error(msg, fields),
        warn: (msg, fields) => mySink.warn(msg, fields),
    }),
)
```

Yours wins — the boot step asks `scheduler().hasReporter` first and installs the
logger-backed one only when nothing is there. It installs it **in place**
(`setReporter`) rather than replacing the instance, so any task registered
before boot survives.

## Discovery and the kernel

```ts
@Kernel({
    schedulesDir: './app/schedule', // default
    schedules: [PackageProvidedTasks], // explicit, for compiled builds
})
class AppKernel {}
```

A missing directory is a no-op. Everything else fails the boot: a malformed
expression, an expression with no possible occurrence (`0 0 30 2 *`), or two
tasks resolving to the same name. A schedule that cannot be armed is a
configuration error, not an optional feature.

The boot line reports the **armed** count unconditionally, including zero:

```text
✓ Scheduler started: 3 task(s) armed of 3 registered
```

> **`schedulesDir` must be a constant in application source.** Its contents are
> imported and executed at boot under the process's permissions. Never derive it
> from the environment, and never point it at a directory the application can
> write to.
>
> It must name a **subdirectory**: the path is resolved with `realPath`, so a
> symlink pointing out of the project is refused rather than followed, and the
> working directory itself (`'.'`) is refused too — it would import every `.ts`
> in the project. Only `class` exports are constructed; a plain exported
> function is ignored rather than called.

Set `SCHEDULER_ENABLED` to `0` / `false` / `off` / `no` to skip the whole step —
useful when several replicas run the same image and only one should schedule.
`1` / `true` / `on` / `yes` enable it explicitly; unset also means enabled.

**Anything else fails the boot with a `TypeError`**, deliberately. A denylist
would have treated `"false "` with a trailing space, a CRLF line ending from a
`.env` file, or `"disabled"` as _enabled_ — silently arming every replica. A
kill switch that ignores what you typed is worse than none, because you believe
it worked.

## Operating a task: pause, resume, runNow

```ts
import { scheduler } from '@lockness/core'

scheduler().pause('nightly-digest')
await scheduler().runNow('nightly-digest') // does not resume it
scheduler().resume('nightly-digest') // original cadence, unshifted
scheduler().getStats()
```

An unknown name throws — a swallowed typo would leave a task paused forever. The
error does **not** list the registered tasks: one typo'd request would otherwise
hand the caller a map of the application's internal class and method names.
`getStats()` is the disclosure you opt into.

> ### These are operator capabilities. The framework does not expose them, and does not authorize them.
>
> There is no route for `pause`, `resume`, `runNow` or `getStats`. If you mount
> one, **authorization is yours to decide** — the scheduler has no idea who is
> calling. An unauthenticated endpoint here lets anyone switch off a recurring
> control, replay a side-effecting task against every account it touches, and
> read your class and method names out of `getStats()`.
>
> ```ts
> @Controller('/admin/schedule')
> @AuthRequired()
> class ScheduleController {
>     @Post('/:name/run')
>     async run(c: Context) {
>         if (!c.get('auth').user.isAdmin) return c.text('Forbidden', 403)
>
>         // Validate before it reaches the scheduler. The scheduler rejects a
>         // malformed name too, but a route should not hand user input to a
>         // library and let the error message be the contract.
>         const name = c.req.param('name')
>         if (!/^[A-Za-z0-9._:-]{1,64}$/.test(name)) {
>             return c.text('Bad request', 400)
>         }
>
>         await scheduler().runNow(name)
>         return c.json({ ok: true })
>     }
> }
> ```
>
> **Never mount these unauthenticated**, and log who triggered what.

`getStats()` returns a deliberately closed shape — task name, flags, counters,
and `lastError` flattened to `{ name, message }`. It never returns an `Error`
instance, so no stack and no `cause` chain can reach a browser through it.

## Stopping

```ts
app.listen(8888)
// Nothing else. SIGINT and SIGTERM stop the scheduler already.
```

`@lockness/core` owns the shutdown lifecycle, and its scheduler bootstrap step
registers `scheduler().stop()` as a teardown — so the timers are released on
Ctrl-C and on the `SIGTERM` an orchestrator sends, with no wiring in your
application. See [lifecycle-events.md](../../../docs/lifecycle-events.md).

`stop()` is terminal: it clears every timer, and nothing arms again — a run that
was about to schedule itself cannot race the shutdown.

> **If you already wrote the manual block**, delete it. Both handlers would run
> **concurrently** and whichever reaches `Deno.exit` first ends the process, so
> a hand-written drain can be cut short mid-way. To keep yours instead, opt out
> with `@Kernel({ shutdown: { signals: false } })` — then the framework installs
> nothing and the behaviour is exactly what it was.

You do not have to call it to let the process exit. Every schedule timer is
`unref`'d, so a pending schedule never keeps a process alive on its own. The
flip side: **an application that is only a scheduler needs its own reason to
stay up** — an HTTP server, or an explicit wait.

> **A run may be terminated at any instant.** A rolling deploy sends `SIGTERM`
> mid-run, and there is no coordination that finishes it first. Task bodies must
> be idempotent or transactional: do not leave "the charge without the order".

## Running more than one instance

**Two replicas each run every task.** Deploy the same image twice and every
customer is invoiced twice, every digest is sent twice, every webhook fires
twice. This is not a degraded limit — it is wrong data in other people's
accounts, and it is the ordinary outcome of horizontal scaling, of a rolling
deploy's overlap window, and of region fan-out on Deno Deploy.

There is no distributed lock in this version. Until there is, pick one:

- Run the scheduler on exactly one replica, with `SCHEDULER_ENABLED=0` on the
  rest.
- Make every scheduled body idempotent on its own — an advisory lock, a unique
  constraint, an "already done today" check.

The `lock?: SchedulerLock` port on the `Scheduler` constructor is declared and
unimplemented, reserved so that a distributed lock arrives later as an adapter
rather than as a change to every `@Schedule` call site.

## Testing

Use `FakeTime`; nothing needs to wait on real elapsed time.

```ts
import { FakeTime } from '@std/testing/time'
import { Scheduler } from '@lockness/core'

Deno.test('the digest runs hourly', async () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler()
        let ran = 0
        s.register({
            expression: '0 * * * *',
            body: () => ran++,
            options: { name: 'd' },
        })
        s.start()

        await time.tickAsync(60 * 60_000)
        assertEquals(ran, 1)
        assertEquals(s.getStats().pendingTimers, 1)

        s.stop()
        assertEquals(s.getStats().pendingTimers, 0)
    } finally {
        time.restore()
    }
})
```

> Assert on `getStats().pendingTimers`, not on `Deno.test`'s sanitizers.
> Measured on deno 2.9.6: a test that calls `setTimeout(fn, 60_000)` and never
> clears it **passes**, in sync and async form, with and without
> `--trace-leaks`. The runtime will not catch a leaked timer for you.

`nextRun(expression, from)` is pure and takes its reference instant as a
parameter, so schedule arithmetic can be tested without any clock at all.
