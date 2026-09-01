/**
 * @fileoverview The shutdown registry — the one list of teardowns.
 *
 * Everything that wants to run at shutdown registers here: the kernel's
 * `@OnShutdown` methods (moved in by `bootstrap/steps/shutdown_hooks.ts`), the
 * framework's own steps, and anything an application adds through
 * `App.onShutdown()`. **Nothing else is traversed at shutdown**, which is what
 * keeps "what runs at teardown" answerable by reading one file.
 *
 * This module owns exactly two rules and no others:
 *
 * 1. **The order** — ascending priority, stable within a priority.
 * 2. **The failure policy** — a hook that throws is caught, reported and does
 *    not stop the ones after it.
 *
 * The **deadline** is deliberately not here. It bounds the HTTP server drain as
 * well as the hooks, and the server is not a hook, so a timer inside this class
 * could not cover it. It lives in `shutdown_sequence.ts` with the thing it
 * actually bounds.
 *
 * @module @lockness/core/kernel/shutdown_registry
 * @since 0.2.1
 */

import { renderError, safeForLog } from '../logging/sanitize.ts'

// Re-exported so no caller changes when it moved to the foundation: the
// disposables drain needs it, and @lockness/contract cannot import core.
export { renderError }
import type { ShutdownHookMethod } from './shutdown_decorators.ts'

/**
 * Priorities for teardowns the **framework itself** registers.
 *
 * Named constants rather than literals at the call site, because the numbers
 * are written in files that already contain a *different* number meaning
 * something else.
 *
 * ⚠️ **A `BootstrapStep.order` is never reused as a shutdown priority.** The two
 * axes look alike and are unrelated: bootstrap `order` runs ascending from 10 to
 * 600, and `steps/database.ts` is order **100**. Reused as a priority, 100 would
 * close the database *first* — before the schedulers and handlers that are still
 * using it — which is the precise inversion the ordering rule exists to prevent.
 * Register with one of these instead.
 */
export const SHUTDOWN_PRIORITY = {
    /**
     * Runs **before the HTTP server stops accepting**, unlike every band below
     * it.
     *
     * For resources that would otherwise prevent the server drain from
     * resolving at all. `@lockness/sse` is the case: `server.shutdown()` does
     * not resolve while a streaming response is open, and an armed heartbeat
     * keeps it open — so an SSE teardown placed after the drain sits behind the
     * very thing it exists to release, the deadline expires, and *no* hook runs.
     */
    /**
     * **Negative on purpose.** `register()` defaults an unspecified priority to
     * `0`, and `@OnShutdown()` with no argument means `0` too — so any positive
     * pre-drain threshold sweeps every ordinary hook in with it and tears the
     * whole application down before the server stops accepting. That is exactly
     * what a value of `5` did, and seven tests said so.
     */
    PREDRAIN: -100,
    /** Final notifications and metrics flushes. Runs first, after the drain. */
    NOTIFY: 10,
    /** Timers, workers and background loops — anything that could start new work. */
    SERVICES: 30,
    /** Caches and queues. */
    STORES: 60,
    /** Connection pools and databases. Runs last, so nothing needs them after. */
    CONNECTIONS: 100,
} as const

/** One registered teardown. */
interface ShutdownEntry {
    readonly name: string
    readonly fn: ShutdownHookMethod
    readonly priority: number
}

/** A hook that threw, and what it threw. */
export interface ShutdownFailure {
    /** The hook's registered name. */
    readonly hook: string
    /** Whatever the hook threw, untouched — the caller decides how to render it. */
    readonly error: unknown
}

/** What running the registry produced. */
export interface ShutdownRunResult {
    /** How many hooks were attempted. */
    readonly ran: number
    /** Those that threw, in execution order. */
    readonly failed: readonly ShutdownFailure[]
}

/**
 * The ordered list of teardowns for one application.
 *
 * @since 0.2.1
 *
 * @example
 * ```typescript
 * const registry = new ShutdownRegistry()
 * registry.register('cache', () => cache.close(), SHUTDOWN_PRIORITY.STORES)
 * registry.register('db', () => db.close(), SHUTDOWN_PRIORITY.CONNECTIONS)
 *
 * const { ran, failed } = await registry.run()
 * ```
 */
export class ShutdownRegistry {
    readonly #entries: ShutdownEntry[] = []
    #started = false

    /**
     * Register a teardown.
     *
     * @param name - Label for logs and for the failure report. Encoded before
     * it is ever written, so an arbitrary caller-supplied string is safe here.
     * @param fn - The teardown. May be sync or async; it is awaited.
     * @param priority - **Lower runs first.** Framework callers pass a
     * {@link SHUTDOWN_PRIORITY} constant, never a `BootstrapStep.order`.
     *
     * @remarks
     * Refused with a warning once {@link run} has begun — the sequence already
     * took its snapshot, so a late hook would be accepted and then silently
     * never run, which is worse than being told.
     *
     * @example
     * ```typescript
     * registry.register('scheduler', () => scheduler().stop(), SHUTDOWN_PRIORITY.SERVICES)
     * ```
     */
    register(
        name: string,
        fn: ShutdownHookMethod,
        priority = 0,
    ): void {
        if (this.#started) {
            console.warn(
                `⚠️  Shutdown hook "${
                    safeForLog(name)
                }" was registered after shutdown began; it will not run.`,
            )
            return
        }
        this.#entries.push({ name, fn, priority })
    }

    /** How many teardowns are registered. */
    get size(): number {
        return this.#entries.length
    }

    /**
     * Run every registered teardown, lowest priority first.
     *
     * Sequential, never concurrent: a hook at a higher priority may depend on a
     * lower one having finished, which is the whole reason they are ordered.
     *
     * @param onProgress - Called before each hook and once at the end, so a
     * caller racing a deadline can report the partial result rather than a
     * zeroed one.
     * @returns How many ran, and which threw.
     *
     * @example
     * ```typescript
     * const { ran, failed } = await registry.run()
     * if (failed.length > 0) console.error(`${failed.length} teardown(s) failed`)
     * ```
     */
    /**
     * Run only the entries whose priority matches, and remove them.
     *
     * The pre-drain phase needs a subset to run **before** the HTTP server stops
     * accepting, with the rest left for {@link run}. Splitting by predicate
     * keeps one comparator and one failure policy here; a second sorted list
     * elsewhere would be two spellings of the ordering rule.
     *
     * Unlike {@link run} this does **not** freeze the registry — more work is
     * still to come after the server drain.
     *
     * @param matches - Called with each entry's priority.
     * @returns How many ran, and which threw.
     *
     * @example
     * ```typescript
     * await registry.runBand((p) => p < SHUTDOWN_PRIORITY.NOTIFY)
     * ```
     */
    async runBand(
        matches: (priority: number) => boolean,
    ): Promise<ShutdownRunResult> {
        const selected = this.#entries.filter((e) => matches(e.priority))
        if (selected.length === 0) return { ran: 0, failed: [] }

        for (const entry of selected) {
            const index = this.#entries.indexOf(entry)
            if (index !== -1) this.#entries.splice(index, 1)
        }

        // Sorted with the SAME comparator `run()` uses. Filtering preserves
        // registration order, and #execute's contract is "an already-ordered
        // list" — handing it an unsorted band would invert "lower runs first"
        // inside the band while claiming to keep one comparator.
        return await this.#execute(this.#ordered(selected))
    }

    /**
     * Run every registered teardown, lowest priority first.
     *
     * Sequential, never concurrent: a hook at a higher priority may depend on a
     * lower one having finished, which is the whole reason they are ordered.
     *
     * @param onProgress - Called before each hook and once at the end, so a
     * caller racing a deadline can report the partial result rather than a
     * zeroed one.
     * @returns How many ran, and which threw.
     *
     * @example
     * ```typescript
     * const { ran, failed } = await registry.run()
     * if (failed.length > 0) console.error(`${failed.length} teardown(s) failed`)
     * ```
     */
    async run(
        onProgress?: (progress: ShutdownRunResult) => void,
    ): Promise<ShutdownRunResult> {
        this.#started = true

        // Sorted on a copy. `Array.prototype.sort` mutates, and reordering the
        // registration list in place would make `size` and any future read
        // report a history that never happened.
        //
        // The sort is stable (ES2019+), which is what keeps equal priorities in
        // registration order — asserted in the tests rather than assumed.
        const ordered = this.#ordered(this.#entries)

        return await this.#execute(ordered, onProgress)
    }

    /**
     * Sort a selection ascending by priority.
     *
     * **The one comparator.** `run()` and `runBand()` both come through here,
     * so "lower runs first" has a single spelling; the sort is stable, which is
     * what keeps equal priorities in registration order.
     *
     * @internal
     */
    #ordered(entries: readonly ShutdownEntry[]): readonly ShutdownEntry[] {
        return [...entries].sort((a, b) => a.priority - b.priority)
    }

    /**
     * Run an already-ordered list, isolating each failure.
     *
     * The single home of the failure policy — {@link run} and {@link runBand}
     * both come through here, so there is one `try/catch` and one renderer
     * rather than one per caller.
     *
     * @internal
     */
    async #execute(
        ordered: readonly ShutdownEntry[],
        onProgress?: (progress: ShutdownRunResult) => void,
    ): Promise<ShutdownRunResult> {
        const failed: ShutdownFailure[] = []
        let ran = 0

        for (const entry of ordered) {
            ran++
            // Published per hook, so a caller that is racing a deadline can
            // still report what happened before it expired.
            onProgress?.({ ran, failed: [...failed] })
            try {
                await entry.fn()
            } catch (error) {
                // Caught, reported, and the ones after it still run — a single
                // broken teardown must not strand every resource behind it.
                //
                // Not a silent catch: it is rendered here AND carried in the
                // report, so the caller can set an exit code from it.
                failed.push({ hook: entry.name, error })
                console.error(
                    `❌ Shutdown hook "${safeForLog(entry.name)}" failed: ${
                        renderError(error)
                    }`,
                )
            }
        }

        onProgress?.({ ran, failed: [...failed] })
        return { ran: ordered.length, failed }
    }
}
