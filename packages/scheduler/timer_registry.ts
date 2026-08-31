/**
 * @fileoverview The scheduler's timers — every one of them.
 *
 * **This module is the single home of the fact that a timer exists.** It is the
 * only place in the package where `setTimeout`, `clearTimeout` and
 * `Deno.unrefTimer` appear, which is what makes "no timer outlives `stop()`" a
 * property you can check by reading one file.
 *
 * @module @lockness/scheduler/timer_registry
 */

import type { SchedulerReporter } from './types.ts'

/**
 * The longest delay that may be handed to `setTimeout`.
 *
 * Measured on deno 2.9.6: `setTimeout(fn, 2 ** 31)` prints
 * `TimeoutOverflowWarning: … Timeout duration was set to 1.` and fires ~33 ms
 * later. An un-capped `@Schedule(yearly)` would therefore fire, re-arm and fire
 * again without pause. 24 days sits comfortably below the 32-bit signed limit.
 */
export const MAX_DELAY_MS = 24 * 24 * 60 * 60 * 1000

/**
 * The shortest delay that may be armed.
 *
 * The cap above defends the one overflow path we found. This floor defends
 * every other route to a near-zero delay — a metered task firing in a tight
 * loop is silent until the bill arrives. A clamp that fires is a bug, so it is
 * reported.
 */
export const MIN_DELAY_MS = 1_000

/**
 * The handle type `setTimeout` returns here.
 *
 * Deno's own `setTimeout` returns a `number`, but this workspace has
 * `@types/node` present under `node_modules/@types`, which widens the return to
 * `Timeout`. `packages/sse/channel.ts:53` handles the same problem the same
 * way, so this follows the house convention rather than inventing a second one.
 */
type TimerHandle = ReturnType<typeof setTimeout>

/** One pending timer. */
interface Entry {
    /** The live `setTimeout` handle. */
    handle: TimerHandle
    /** Milliseconds still to wait once the current capped leg elapses. */
    remaining: number
    /** What to run when the whole delay has elapsed. */
    fire: () => void
}

/**
 * Holds every timer the scheduler has armed, keyed by task name.
 *
 * @example
 * ```ts
 * const timers = new TimerRegistry()
 * timers.arm('digest', 3_600_000, () => run())
 * timers.size // 1
 * timers.clear()
 * timers.size // 0
 * ```
 */
export class TimerRegistry {
    readonly #entries = new Map<string, Entry>()
    /** Pending {@link sleep} resolvers, so cancelling never strands a caller. */
    readonly #resolvers = new Map<string, () => void>()
    readonly #reporter: SchedulerReporter | undefined

    /**
     * @param reporter - Where a clamped delay is reported. Falls back to
     * `console.warn` when absent.
     */
    constructor(reporter?: SchedulerReporter) {
        this.#reporter = reporter
    }

    /** How many timers are currently pending. The assertion FR-009 makes. */
    get size(): number {
        return this.#entries.size
    }

    /** Every key currently armed. */
    keys(): string[] {
        return [...this.#entries.keys()]
    }

    /**
     * Arm a timer under `key`, replacing any timer already armed under it.
     *
     * A delay longer than {@link MAX_DELAY_MS} is armed in capped legs and
     * re-armed without running until the remainder fits. A delay shorter than
     * {@link MIN_DELAY_MS} is clamped up and reported.
     *
     * The handle is passed to `Deno.unrefTimer`, so a pending schedule never by
     * itself keeps the process alive.
     *
     * @param key - The task name this timer belongs to.
     * @param delayMs - How long to wait, in milliseconds.
     * @param fire - What to run when the delay has fully elapsed.
     */
    arm(key: string, delayMs: number, fire: () => void): void {
        this.cancel(key)

        let wait = delayMs
        if (wait < MIN_DELAY_MS) {
            this.#warn(
                'Scheduler clamped a delay up to the minimum; this is a bug, not a schedule.',
                { task: key, requestedMs: delayMs, clampedToMs: MIN_DELAY_MS },
            )
            wait = MIN_DELAY_MS
        }

        this.#armLeg(key, wait, fire)
    }

    /**
     * Wait, using a timer this registry owns.
     *
     * Every wait in the package must go through here. A bare
     * `setTimeout(resolve, ms)` — a retry backoff, say — belongs to nobody: it
     * survives {@link clear}, it is invisible to {@link size}, and so the
     * pending-timer count that FR-009 asserts on would report zero while a live
     * handle still existed. That is invariant 3.
     *
     * Cancelling **resolves** the promise rather than rejecting it, so a caller
     * is never left awaiting forever; callers decide whether to carry on by
     * asking their own stopped-state, not by catching.
     *
     * @param key - The registry key to arm under. Callers namespace their keys
     * (`schedule:` / `retry:`) so two kinds of timer for related tasks cannot
     * collide — `NAME_PATTERN` permits `:`, so a task literally named
     * `retry:foo` would otherwise share a key with task `foo`'s backoff.
     * @param ms - How long to wait.
     * @returns A promise resolving when the wait elapses or is cancelled.
     */
    sleep(key: string, ms: number): Promise<void> {
        return new Promise<void>((resolve) => {
            // Register the resolver AFTER arming. `arm()` opens with
            // `cancel(key)`, and `cancel()` resolves any pending resolver under
            // that key — so registering first makes the wait cancel itself and
            // return immediately, turning retryDelay into a no-op.
            this.arm(key, ms, () => {
                this.#resolvers.delete(key)
                resolve()
            })
            this.#resolvers.set(key, resolve)
        })
    }

    /** Cancel the timer armed under `key`, if any. */
    cancel(key: string): void {
        const entry = this.#entries.get(key)
        const resolver = this.#resolvers.get(key)
        if (resolver !== undefined) {
            this.#resolvers.delete(key)
            resolver()
        }
        if (entry === undefined) return
        clearTimeout(entry.handle)
        this.#entries.delete(key)
    }

    /**
     * Cancel every timer.
     *
     * After this returns, {@link size} is `0` — which is what FR-009 asserts,
     * because `Deno.test`'s sanitizers do **not** fail on a leaked timer.
     */
    clear(): void {
        for (const entry of this.#entries.values()) clearTimeout(entry.handle)
        this.#entries.clear()
        // Resolve rather than strand: a retry awaiting its backoff when stop()
        // is called must be released, and then decline to retry.
        for (const resolve of this.#resolvers.values()) resolve()
        this.#resolvers.clear()
    }

    /** Arm one leg, capped, re-arming itself until the remainder is exhausted. */
    #armLeg(key: string, remaining: number, fire: () => void): void {
        const leg = Math.min(remaining, MAX_DELAY_MS)
        const rest = remaining - leg

        const handle = setTimeout(() => {
            this.#entries.delete(key)
            if (rest > 0) {
                this.#armLeg(key, rest, fire)
                return
            }
            fire()
        }, leg)

        // A pending schedule must never be the reason a process stays up.
        // `unrefTimer` takes the numeric id the Deno runtime actually returns;
        // the cast only undoes the `@types/node` widening described above.
        Deno.unrefTimer(handle as unknown as number)
        this.#entries.set(key, { handle, remaining: rest, fire })
    }

    /** Report through the injected reporter, or `console.warn`. */
    #warn(message: string, fields: Record<string, unknown>): void {
        if (this.#reporter) {
            this.#reporter.warn(message, fields)
            return
        }
        console.warn(`⚠️  ${message}`, fields)
    }
}
