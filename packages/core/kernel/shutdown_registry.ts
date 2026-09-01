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

import { safeForLog } from '../logging/sanitize.ts'
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
    /** Final notifications and metrics flushes. Runs first. */
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
        const ordered = [...this.#entries].sort((a, b) =>
            a.priority - b.priority
        )

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

/**
 * Render a caught error for a log line.
 *
 * `name` plus a **truncated, encoded** message — never the object, never the
 * stack. `console.error('...', error)` prints both, and teardown is exactly
 * where credential-bearing errors are produced: a Postgres driver failure
 * carries `postgres://user:password@host/db`, a `fetch` rejection carries a URL
 * with its token in the query string. Log stores routinely have broader access
 * than the database those credentials open.
 *
 * The encoding half is not theoretical either:
 * `packages/session/drivers/redis.ts:104` throws a Redis server's error reply
 * verbatim, on the path `close()` takes.
 *
 * Exported because it is the ONE renderer: the signal handler, the per-signal
 * install warning and the `KernelTerminating` emit all reached a log line with
 * a raw `error.message` — or worse, the whole error object, which prints the
 * stack. FR-022 says every rendered error, not every rendered error in this
 * file.
 *
 * @param error - Whatever was thrown.
 * @returns One safe, bounded line.
 *
 * @example
 * ```typescript
 * renderError(new Error('boom'))  // 'Error: boom'
 * ```
 */
export function renderError(error: unknown): string {
    const MAX = 200

    if (error instanceof Error) {
        const message = error.message.length > MAX
            ? `${error.message.slice(0, MAX)}…`
            : error.message
        return `${safeForLog(error.name)}: ${safeForLog(message)}`
    }

    const text = String(error)
    return safeForLog(text.length > MAX ? `${text.slice(0, MAX)}…` : text)
}
