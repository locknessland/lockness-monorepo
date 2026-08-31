/**
 * @fileoverview Type surface for `@lockness/scheduler`.
 *
 * Everything here is a shape, not a behaviour. The module has no imports and no
 * runtime logic beyond two constants, so every other module in the package can
 * depend on it without creating a cycle.
 *
 * @module @lockness/scheduler/types
 */

/**
 * The default directory scanned for `@Schedule`-decorated classes.
 *
 * **This constant is the single home of that path.** `KernelConfig`'s JSDoc
 * links to it rather than restating it — restating is the duplication that
 * already exists for listeners, where `steps/listeners.ts` hardcodes
 * `'./app/listener'` and `kernel_decorators.ts` repeats it as an `@default` tag.
 *
 * @example
 * ```ts
 * import { DEFAULT_SCHEDULES_DIR } from '@lockness/scheduler'
 * console.log(DEFAULT_SCHEDULES_DIR) // './app/schedule'
 * ```
 */
export const DEFAULT_SCHEDULES_DIR = './app/schedule'

/**
 * What happens when an occurrence arrives while the previous run is still going.
 *
 * `'skip'` is the default. A JavaScript promise cannot be cancelled, so under
 * `'allow'` a task slower than its period accumulates live runs without bound,
 * each holding whatever resource it opened.
 */
export type OverlapPolicy = 'skip' | 'allow'

/**
 * Configuration for {@link ScheduleOptions.onError} and friends — the shape a
 * failure is reported in.
 */
export interface TaskFailure {
    /** The task's resolved name. */
    readonly task: string
    /** 1 for the first attempt, 2 for the first retry, and so on. */
    readonly attempt: number
    /** Correlates every log line belonging to one run. */
    readonly runId: string
    /** The error the task threw, or a `TimeoutError`. */
    readonly error: Error
}

/**
 * Where the scheduler reports to.
 *
 * `@lockness/scheduler` may not import `@lockness/logger` (it would breach the
 * package's dependency ceiling), so the application's logger is injected
 * through this port by `@lockness/core` at boot instead.
 */
export interface SchedulerReporter {
    /** Report a failed attempt. */
    error(message: string, fields: Record<string, unknown>): void
    /** Report something noteworthy but survivable — a clamped delay, a skip. */
    warn(message: string, fields: Record<string, unknown>): void
}

/**
 * A cross-instance lock, so that only one replica runs a given occurrence.
 *
 * **Declared and unimplemented in v1.** The port exists now so that distributed
 * locking arrives later as an added adapter rather than as a breaking change to
 * every `@Schedule` call site.
 */
export interface SchedulerLock {
    /**
     * Try to claim one occurrence.
     *
     * @param task - The task's resolved name.
     * @param occurrence - The instant being claimed.
     * @returns `true` when this instance may run it.
     */
    acquire(task: string, occurrence: Date): Promise<boolean>
    /** Release a claim. */
    release(task: string, occurrence: Date): Promise<void>
}

/**
 * Options for {@link Schedule}.
 *
 * Every field is optional, and every numeric field is range-checked at
 * decoration time rather than at first fire — `retryDelay: 0` with a large
 * `retries` is a hot loop by configuration, and it should fail where it was
 * written.
 *
 * @example
 * ```ts
 * @Schedule('0 3 * * *', {
 *     name: 'nightly-digest',
 *     timeout: 30_000,
 *     retries: 2,
 *     retryDelay: 5_000,
 *     overlap: 'skip',
 *     onError: (f) => console.error(f.task, f.error.message),
 * })
 * async digest(signal: AbortSignal) { … }
 * ```
 */
export interface ScheduleOptions {
    /**
     * The task's identity. Defaults to `` `${ClassName}.${methodName}` ``.
     * Must match `[A-Za-z0-9._:-]{1,64}` — it is a map key, a stats label and a
     * log field all at once.
     */
    name?: string
    /**
     * Run once immediately at start, then follow the calendar.
     *
     * There is **no catch-up**: an occurrence that fell while the process was
     * down is lost. A crash-looping deploy therefore replays a `runOnStart`
     * task once per boot, so its body must be idempotent.
     */
    runOnStart?: boolean
    /** Milliseconds after which the run is aborted. Must be > 0. */
    timeout?: number
    /** Additional attempts after the first failure. At most 10. */
    retries?: number
    /** Milliseconds between attempts. Must be > 0. */
    retryDelay?: number
    /**
     * `false` registers the task without scheduling it. Terminal for the
     * process lifetime — `resume()` on a disabled task throws.
     */
    enabled?: boolean
    /** What an occurrence does while a run is in flight. Defaults to `'skip'`. */
    overlap?: OverlapPolicy
    /** Called after every failed attempt. A throw here cannot stop re-arming. */
    onError?: (failure: TaskFailure) => void | Promise<void>
    /** Called after a successful run. A throw here cannot stop re-arming. */
    onSuccess?: (task: string) => void | Promise<void>
}

/**
 * What a caller may observe about one task.
 *
 * Deliberately closed and non-sensitive: **never an `Error` instance**, no
 * stack, no `cause` chain. A stack from a database driver carries the failing
 * statement and its bound parameters, and this shape is what an application's
 * admin view — or a future devtools panel — will render.
 */
export interface TaskStats {
    /** The resolved name. */
    readonly name: string
    /** Whether the task was declared enabled. */
    readonly enabled: boolean
    /** Whether it is currently paused. */
    readonly paused: boolean
    /** When it last started, or `null`. */
    readonly lastRunAt: Date | null
    /** The next armed occurrence, or `null` when nothing is armed. */
    readonly nextRunAt: Date | null
    /** Completed runs, successful or not. */
    readonly runCount: number
    /** Runs that exhausted their attempts. */
    readonly failureCount: number
    /** Occurrences skipped because a run was still in flight. */
    readonly skippedCount: number
    /** The last failure, flattened to two safe strings. */
    readonly lastError:
        | { readonly name: string; readonly message: string }
        | null
}

/**
 * The whole scheduler's statistics, including the invariant FR-009 asserts on.
 */
export interface SchedulerStats {
    /** One entry per registered task. */
    readonly tasks: readonly TaskStats[]
    /**
     * How many timers the registry currently holds.
     *
     * **This is the assertion FR-009 makes**, because `Deno.test`'s sanitizers
     * do not fail on a leaked `setTimeout` — measured on deno 2.9.6, in both
     * sync and async form, with and without `--trace-leaks`.
     */
    readonly pendingTimers: number
    /** Whether `stop()` has been called. Terminal. */
    readonly stopped: boolean
}

/** The five fields of a parsed cron expression, each an ascending value list. */
export interface CronExpression {
    /** 0–59 */
    readonly minute: readonly number[]
    /** 0–23 */
    readonly hour: readonly number[]
    /** 1–31 */
    readonly dayOfMonth: readonly number[]
    /** 1–12 */
    readonly month: readonly number[]
    /** 0–6, Sunday is 0 */
    readonly dayOfWeek: readonly number[]
    /** True when the day-of-month field was `*`, which changes how DOW combines. */
    readonly dayOfMonthWildcard: boolean
    /** True when the day-of-week field was `*`. */
    readonly dayOfWeekWildcard: boolean
}
