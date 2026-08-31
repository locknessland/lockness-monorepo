/**
 * @fileoverview The Scheduler — task identity, uniqueness, lifecycle and stats.
 *
 * **This module is the single home of a task's identity.** The decorator
 * derives no name: `register()` is public, so an imperative caller would bypass
 * a decorator-side derivation entirely, and identity has to be decided at the
 * one gate both entry points cross.
 *
 * @module @lockness/scheduler/scheduler
 */

import { nextRun } from './cron_parser.ts'
import { runTask, type TaskBody } from './task_runner.ts'
import { TimerRegistry } from './timer_registry.ts'
import type {
    ScheduleOptions,
    SchedulerLock,
    SchedulerReporter,
    SchedulerStats,
    TaskStats,
} from './types.ts'

/**
 * What a task name may contain.
 *
 * A name is a map key, a `getStats()` label and a log field all at once.
 * Unbounded strings in a log field are how log injection gets in, so the set is
 * closed rather than merely conventional.
 */
export const NAME_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/

/** The most retries a schedule may declare. */
export const MAX_RETRIES = 10

/** One registered task, as the scheduler holds it. */
interface Task {
    readonly name: string
    readonly expression: string
    readonly options: ScheduleOptions
    readonly body: TaskBody
    paused: boolean
    running: boolean
    lastRunAt: Date | null
    nextRunAt: Date | null
    runCount: number
    failureCount: number
    skippedCount: number
    lastError: { name: string; message: string } | null
}

/** What {@link Scheduler.register} accepts. */
export interface TaskRegistration {
    /** The cron expression, already validated by the decorator when there was one. */
    expression: string
    /** The bound method to run. */
    body: TaskBody
    /** The schedule's options. */
    options?: ScheduleOptions
    /** The declaring class's name, used for the default task name. */
    className?: string
    /** The method's name, used for the default task name. */
    methodName?: string
}

/**
 * Validate a schedule's options.
 *
 * **One decider, two askers.** `@Schedule` calls this at decoration time so a
 * malformed option fails where it was written; `register()` calls it too,
 * because it is public and reachable without a decorator. Both *ask*; only this
 * function *decides*.
 *
 * @param options - The options to check.
 * @throws {TypeError} Naming the offending option and its bound.
 *
 * @example
 * ```ts
 * validateScheduleOptions({ retries: 2, retryDelay: 5_000 }) // ok
 * validateScheduleOptions({ retryDelay: 0 }) // throws
 * ```
 */
export function validateScheduleOptions(options: ScheduleOptions = {}): void {
    const { name, retries, retryDelay, timeout } = options

    if (name !== undefined && !NAME_PATTERN.test(name)) {
        throw new TypeError(
            `@Schedule option \`name\` must match ${NAME_PATTERN.source}, received "${name}". ` +
                `A task name is a map key, a stats label and a log field.`,
        )
    }
    if (retries !== undefined) {
        if (
            !Number.isInteger(retries) || retries < 0 || retries > MAX_RETRIES
        ) {
            throw new TypeError(
                `@Schedule option \`retries\` must be an integer between 0 and ${MAX_RETRIES}, received ${retries}.`,
            )
        }
    }
    if (retryDelay !== undefined) {
        if (!Number.isFinite(retryDelay) || retryDelay <= 0) {
            throw new TypeError(
                `@Schedule option \`retryDelay\` must be a positive number of milliseconds, received ${retryDelay}. ` +
                    `A zero delay with retries is a hot loop, not a retry policy.`,
            )
        }
    }
    if (timeout !== undefined) {
        if (!Number.isFinite(timeout) || timeout <= 0) {
            throw new TypeError(
                `@Schedule option \`timeout\` must be a positive number of milliseconds, received ${timeout}.`,
            )
        }
    }
}

/**
 * Runs registered tasks on their schedules.
 *
 * State is in-process and lost on restart. Two instances of the same
 * application each run every task — see `docs/DOCS.md`, and {@link SchedulerLock}
 * for the extension point reserved against it.
 *
 * @example
 * ```ts
 * const scheduler = new Scheduler()
 * scheduler.register({
 *     expression: '0 3 * * *',
 *     body: () => sendDigest(),
 *     options: { name: 'digest' },
 * })
 * scheduler.start()
 * // …later
 * await scheduler.stop()
 * ```
 */
export class Scheduler {
    readonly #tasks = new Map<string, Task>()
    readonly #timers: TimerRegistry
    readonly #reporter: SchedulerReporter | undefined
    #started = false
    #stopped = false

    /**
     * @param reporter - Where failures and clamps are reported.
     * @param _lock - Reserved for distributed locking. **Unimplemented in v1**;
     * the parameter exists so a lock arrives later as an adapter rather than as
     * a breaking change to every `@Schedule` call site.
     */
    constructor(reporter?: SchedulerReporter, _lock?: SchedulerLock) {
        this.#reporter = reporter
        this.#timers = new TimerRegistry(reporter)
    }

    /**
     * Register a task, resolving and claiming its name.
     *
     * @param registration - The task to register.
     * @returns The task's resolved name.
     * @throws {TypeError} If the name or any option is malformed.
     * @throws {Error} If the name is already registered, or the scheduler is stopped.
     */
    register(registration: TaskRegistration): string {
        if (this.#stopped) {
            throw new Error('Cannot register a task on a stopped scheduler.')
        }
        const { expression, body, options = {}, className, methodName } =
            registration

        validateScheduleOptions(options)

        const name = options.name ??
            `${className ?? 'Anonymous'}.${methodName ?? 'anonymous'}`
        if (!NAME_PATTERN.test(name)) {
            throw new TypeError(
                `Derived task name "${name}" does not match ${NAME_PATTERN.source}. ` +
                    `Pass an explicit \`name\` option.`,
            )
        }
        if (this.#tasks.has(name)) {
            throw new Error(
                `A task named "${name}" is already registered. ` +
                    `Two tasks under one name means the second silently replaces the first.`,
            )
        }

        this.#tasks.set(name, {
            name,
            expression,
            options,
            body,
            paused: false,
            running: false,
            lastRunAt: null,
            nextRunAt: null,
            runCount: 0,
            failureCount: 0,
            skippedCount: 0,
            lastError: null,
        })

        // Registering after start() is legal — arm it immediately.
        if (this.#started && options.enabled !== false) this.#arm(name)
        return name
    }

    /**
     * Arm every enabled task, and fire the `runOnStart` ones.
     *
     * @returns How many tasks were armed. The bootstrap step logs this
     * unconditionally, including zero — a zero-count boot on an application
     * that has tasks is the signal that discovery found nothing.
     */
    start(): number {
        if (this.#stopped) {
            throw new Error('Cannot start a stopped scheduler.')
        }
        this.#started = true

        let armed = 0
        for (const task of this.#tasks.values()) {
            if (task.options.enabled === false) continue
            this.#arm(task.name)
            armed++
            // runOnStart fires now and never catches up on what was missed
            // while the process was down — there is no persisted state that
            // could tell us what was missed.
            if (task.options.runOnStart) void this.#run(task.name)
        }
        return armed
    }

    /**
     * Stop the scheduler. Terminal.
     *
     * After this resolves, `getStats().pendingTimers` is `0` and nothing will
     * arm again — the flag is checked before every re-arm, so a run that was
     * about to schedule itself cannot race the shutdown.
     */
    stop(): void {
        this.#stopped = true
        this.#started = false
        this.#timers.clear()
        for (const task of this.#tasks.values()) task.nextRunAt = null
    }

    /** Suspend a task's schedule without unregistering it. */
    pause(name: string): void {
        const task = this.#require(name)
        task.paused = true
        task.nextRunAt = null
        this.#timers.cancel(`schedule:${name}`)
    }

    /**
     * Resume a paused task on its original cadence.
     *
     * @throws {Error} If the task was declared `enabled: false` — that is
     * terminal for the process lifetime, and the two are not two spellings of
     * one state.
     */
    resume(name: string): void {
        const task = this.#require(name)
        if (task.options.enabled === false) {
            throw new Error(
                `Task "${name}" was declared enabled: false, which is terminal for this process. ` +
                    `resume() cannot switch it on.`,
            )
        }
        task.paused = false
        if (this.#started) this.#arm(name)
    }

    /**
     * Run a task now, out of band.
     *
     * Does not resume a paused task, and does not shift its next occurrence.
     */
    async runNow(name: string): Promise<void> {
        this.#require(name)
        await this.#run(name)
    }

    /** Everything a caller may observe. Never carries an `Error` instance. */
    getStats(): SchedulerStats {
        const tasks: TaskStats[] = [...this.#tasks.values()].map((t) => ({
            name: t.name,
            enabled: t.options.enabled !== false,
            paused: t.paused,
            lastRunAt: t.lastRunAt,
            nextRunAt: t.nextRunAt,
            runCount: t.runCount,
            failureCount: t.failureCount,
            skippedCount: t.skippedCount,
            lastError: t.lastError,
        }))
        return {
            tasks,
            pendingTimers: this.#timers.size,
            stopped: this.#stopped,
        }
    }

    /** Look a task up, or say which name was not found. */
    #require(name: string): Task {
        // Validate on the LOOKUP path too, not only on registration. `runNow`
        // and friends are documented as operator capabilities an application
        // mounts on a route, so this argument is request-derived in practice —
        // and an un-patterned string reaching an error message is how log
        // injection gets in. The name is not echoed back for the same reason.
        if (!NAME_PATTERN.test(name)) {
            throw new TypeError(
                `A task name must match ${NAME_PATTERN.source}.`,
            )
        }
        const task = this.#tasks.get(name)
        if (task === undefined) {
            // Deliberately does NOT list the registered tasks. That turned one
            // typo'd request into a map of the application's internal class and
            // method names; `getStats()` is the disclosure a caller opts into.
            throw new Error(`No task named "${name}" is registered.`)
        }
        return task
    }

    /** Compute the next occurrence and arm a timer for it. */
    #arm(name: string): void {
        if (this.#stopped) return
        const task = this.#tasks.get(name)
        if (
            task === undefined || task.paused || task.options.enabled === false
        ) return

        const at = nextRun(task.expression, new Date())
        task.nextRunAt = at
        // Namespaced: NAME_PATTERN permits ':', so an un-namespaced schedule key
        // would collide with the retry key of a differently-named task.
        this.#timers.arm(`schedule:${name}`, at.getTime() - Date.now(), () => {
            // Re-arm FIRST, then run. Arming after the run would compute the
            // next occurrence from when the run finished rather than from the
            // occurrence itself, so a slow task would drift its own schedule —
            // and invariant 5 ("a running, enabled task has exactly one pending
            // timer") would be false for the whole duration of every run.
            // Arming first is also what makes overlap:'skip' meaningful: the
            // next occurrence still arrives on time, and is skipped.
            this.#arm(name)
            void this.#run(name)
        })
    }

    /** Run one task, honouring the overlap policy. */
    async #run(name: string): Promise<void> {
        const task = this.#tasks.get(name)
        if (task === undefined) return

        // A promise cannot be cancelled, so 'skip' is what actually bounds
        // concurrency: without it a task slower than its period accumulates
        // live runs, each holding whatever resource it opened.
        if (task.running && (task.options.overlap ?? 'skip') === 'skip') {
            task.skippedCount++
            this.#reporter?.warn(
                'Scheduled task skipped: the previous run is still in flight.',
                {
                    task: name,
                    skippedCount: task.skippedCount,
                },
            )
            return
        }

        task.running = true
        task.lastRunAt = new Date()
        try {
            const outcome = await runTask(
                name,
                task.body,
                task.options,
                this.#reporter,
                // Registry-owned, so a retry backoff is cancelled by stop() and
                // counted by pendingTimers — invariant 3. A bare setTimeout here
                // belongs to nobody: it survives stop() and runs another attempt
                // after shutdown, while pendingTimers reports zero.
                (ms) => this.#timers.sleep(`retry:${name}`, ms),
                () => !this.#stopped,
            )
            task.runCount++
            if (!outcome.ok) {
                task.failureCount++
                task.lastError = outcome.error
            }
        } finally {
            task.running = false
        }
    }
}

/** The process-wide scheduler, created on first use. */
let instance: Scheduler | undefined

/**
 * The shared scheduler instance.
 *
 * @returns The process-wide {@link Scheduler}.
 *
 * @example
 * ```ts
 * import { scheduler } from '@lockness/core'
 * await scheduler().runNow('digest')
 * ```
 */
export function scheduler(): Scheduler {
    instance ??= new Scheduler()
    return instance
}

/**
 * Replace the shared instance. Intended for tests and for the bootstrap step,
 * which wires the application's reporter in.
 *
 * @param next - The scheduler to install, or `undefined` to reset.
 */
export function setScheduler(next: Scheduler | undefined): void {
    instance = next
}
