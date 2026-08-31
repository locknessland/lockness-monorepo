/**
 * @fileoverview Running one task: timeout, retries, and the two callbacks.
 *
 * **This module is the single home of what happens when a run throws or
 * overruns.** The decorator contains no `try`/`catch` and discovery contains no
 * per-task catch — if either grew one, a failure would have two handlers and
 * only one of them would be tested.
 *
 * @module @lockness/scheduler/task_runner
 */

import type {
    ScheduleOptions,
    SchedulerReporter,
    TaskFailure,
} from './types.ts'

/** Raised when a run exceeds its `timeout`. */
export class TaskTimeoutError extends Error {
    /** @param task - The task's resolved name. @param ms - The timeout that elapsed. */
    constructor(task: string, ms: number) {
        super(`Task "${task}" exceeded its timeout of ${ms}ms and was aborted.`)
        this.name = 'TaskTimeoutError'
    }
}

/** The outcome of one complete run, retries included. */
export interface RunOutcome {
    /** Whether the task eventually succeeded. */
    readonly ok: boolean
    /** How many attempts were made, including the first. */
    readonly attempts: number
    /** The final error, flattened. `null` on success. */
    readonly error: { readonly name: string; readonly message: string } | null
}

/** A task body. It receives the abort signal that `timeout` drives. */
export type TaskBody = (signal: AbortSignal) => unknown | Promise<unknown>

/** Monotonic-ish run identifier, enough to correlate one run's log lines. */
function makeRunId(): string {
    return crypto.randomUUID().slice(0, 8)
}

/**
 * Run one task, honouring `timeout`, `retries` and `retryDelay`.
 *
 * A JavaScript promise cannot be cancelled, so `timeout` aborts the signal and
 * stops awaiting; a body that ignores its signal keeps running. That is the
 * author's responsibility, and it is why `overlap: 'skip'` — enforced by the
 * caller — is what actually bounds concurrency.
 *
 * @param name - The task's resolved name.
 * @param body - The bound method to run.
 * @param options - The schedule's options.
 * @param reporter - Where failures are reported. Falls back to `console.error`.
 * @param sleep - Injected wait. The Scheduler passes a registry-owned one so a
 * backoff timer is cancellable; the default is only for direct callers.
 * @param mayRetry - Asked before each retry. The Scheduler answers `false` once
 * stopped, so a backoff released by `stop()` does not run another attempt.
 * @returns The outcome. **Never throws** — a task's failure is data, not an exception.
 *
 * @example
 * ```ts
 * const outcome = await runTask('digest', (signal) => send(signal), { retries: 2 })
 * outcome.ok // false after three failed attempts
 * ```
 */
export async function runTask(
    name: string,
    body: TaskBody,
    options: ScheduleOptions = {},
    reporter?: SchedulerReporter,
    sleep: (ms: number) => Promise<void> = (ms) =>
        new Promise((r) => setTimeout(r, ms)),
    mayRetry: () => boolean = () => true,
): Promise<RunOutcome> {
    const maxAttempts = (options.retries ?? 0) + 1
    const retryDelay = options.retryDelay ?? 1_000
    const runId = makeRunId()

    let lastError: Error = new Error('never ran')

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | undefined

        try {
            if (options.timeout !== undefined) {
                const ms = options.timeout
                // Deliberately NOT unref'd. Schedule timers are unref'd so a
                // pending schedule never holds the process open; a timeout
                // guard is the opposite case — it is only alive while a run is
                // in flight, and unref'ing it lets the loop resolve before the
                // abort ever fires. It is cleared on both the success and the
                // failure path below, so it cannot outlive the attempt.
                timer = setTimeout(() => {
                    controller.abort(new TaskTimeoutError(name, ms))
                }, ms)
            }

            await raceAbort(
                body(controller.signal),
                controller.signal,
                name,
                options.timeout,
            )

            if (timer !== undefined) clearTimeout(timer)
            await guard(
                () => options.onSuccess?.(name),
                'onSuccess',
                name,
                reporter,
            )
            return { ok: true, attempts: attempt, error: null }
        } catch (caught) {
            if (timer !== undefined) clearTimeout(timer)
            lastError = caught instanceof Error
                ? caught
                : new Error(String(caught))

            const failure: TaskFailure = {
                task: name,
                attempt,
                runId,
                error: lastError,
            }
            report(reporter, failure, maxAttempts)
            // A callback that throws must not be able to stop the next attempt,
            // and must not be able to stop re-arming. Guarded here, once.
            await guard(
                () => options.onError?.(failure),
                'onError',
                name,
                reporter,
            )

            if (attempt < maxAttempts) {
                await sleep(retryDelay)
                // The wait may have been released by stop() rather than by
                // elapsing. Ask before spending another attempt.
                if (!mayRetry()) break
            }
        }
    }

    return {
        ok: false,
        attempts: maxAttempts,
        error: { name: lastError.name, message: lastError.message },
    }
}

/**
 * Await the body, but stop awaiting the moment the signal aborts.
 *
 * @param work - The body's return value.
 * @param signal - The abort signal driven by `timeout`.
 * @param name - The task name, for the error message.
 * @param timeout - The configured timeout, for the error message.
 * @returns Whatever the body resolved to.
 * @throws {TaskTimeoutError} When the signal aborts first.
 */
function raceAbort(
    work: unknown | Promise<unknown>,
    signal: AbortSignal,
    name: string,
    timeout: number | undefined,
): Promise<unknown> {
    if (timeout === undefined) return Promise.resolve(work)
    return Promise.race([
        Promise.resolve(work),
        new Promise<never>((_, reject) => {
            signal.addEventListener(
                'abort',
                () => reject(new TaskTimeoutError(name, timeout)),
                { once: true },
            )
        }),
    ])
}

/**
 * Run a user callback so that its failure cannot escape.
 *
 * An `onError` that throws — a logging call to an unreachable sink is the usual
 * case — would otherwise escape the one catch this package permits and leave
 * the task un-rearmed and silently dead.
 */
async function guard(
    fn: () => void | Promise<void> | undefined,
    which: string,
    task: string,
    reporter?: SchedulerReporter,
): Promise<void> {
    try {
        await fn()
    } catch (caught) {
        const error = caught instanceof Error
            ? caught
            : new Error(String(caught))
        const message = `Scheduler callback ${which} threw and was contained.`
        const fields = {
            task,
            callback: which,
            error: error.name,
            message: error.message,
        }
        if (reporter) reporter.error(message, fields)
        else console.error(`⚠️  ${message}`, fields)
    }
}

/**
 * Report one failed attempt.
 *
 * The line carries the task, the attempt, a run id and the error's **name and
 * message only** — never the raw error object. A driver error's stack carries
 * the failing statement and its bound parameters, and stdout is collected
 * somewhere with broader access than the database.
 */
function report(
    reporter: SchedulerReporter | undefined,
    failure: TaskFailure,
    maxAttempts: number,
): void {
    const message =
        `Scheduled task failed (attempt ${failure.attempt}/${maxAttempts}).`
    const fields = {
        task: failure.task,
        attempt: failure.attempt,
        runId: failure.runId,
        error: failure.error.name,
        message: failure.error.message,
    }
    if (reporter) reporter.error(message, fields)
    else console.error(`⚠️  ${message}`, fields)
}
