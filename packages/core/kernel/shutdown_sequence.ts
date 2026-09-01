/**
 * @fileoverview The shutdown sequence — server drain, then ordered teardown,
 * all of it bounded.
 *
 * Extracted from `App` rather than added to it. `App` is already 540 lines with
 * nine collaborators, and the four fields this owns — the server handle, the
 * deadline, the memoised promise and the registry — are touched by nothing else
 * in that class. Leaving them there would give `App` a fifth responsibility and
 * make the extraction a breaking refactor once "wait for in-flight requests" and
 * "readiness probe" arrive.
 *
 * **This module never exits the process.** `Deno.exit` belongs to
 * `kernel/signals.ts`, so that a programmatic `await app.shutdown()` can tear
 * down and carry on running.
 *
 * @module @lockness/core/kernel/shutdown_sequence
 * @since 0.2.1
 */

import {
    renderError,
    SHUTDOWN_PRIORITY,
    ShutdownRegistry,
} from './shutdown_registry.ts'
import { drainDisposables } from '@lockness/contract/lifecycle/internal'
import type { ShutdownFailure } from './shutdown_registry.ts'

/**
 * How long the whole sequence may take when nothing says otherwise.
 *
 * **10 seconds**, chosen against Kubernetes' 30-second default grace period:
 * it leaves room for the container to finish and exit on its own terms rather
 * than being `SIGKILL`ed part-way through a teardown, which is the failure this
 * bound exists to avoid in the first place.
 */
export const DEFAULT_SHUTDOWN_DEADLINE_MS = 10_000

/**
 * The share of the deadline the `KernelTerminating` notification may consume.
 *
 * A notification is a courtesy; releasing the resources is the point. Without a
 * sub-bound one hanging listener spends the entire budget inside the announce
 * and `registry.run()` is never reached — measured: a listener returning a
 * never-resolving promise produced `ran: 0` with every teardown skipped, on an
 * event this feature is the first thing in the repo to emit.
 */
const ANNOUNCE_SHARE = 0.25

/** The largest delay `setTimeout` honours; above this it silently means 1 ms. */
export const MAX_SHUTDOWN_DEADLINE_MS = 2 ** 31 - 1

/** The outcome of one shutdown sequence. */
export interface ShutdownReport {
    /** How many hooks were attempted. */
    readonly ran: number
    /** Those that threw, in execution order. */
    readonly failed: readonly ShutdownFailure[]
    /** Whether the deadline expired with work still outstanding. */
    readonly timedOut: boolean
}

/** The part of `Deno.HttpServer` a shutdown needs. Anything else is noise. */
interface ShutdownableServer {
    shutdown(): Promise<void>
}

/**
 * Validate a configured deadline, or supply the default.
 *
 * **Rejects loudly rather than clamping.** `setTimeout` accepts `NaN`,
 * `Infinity`, `0`, a negative and anything at or above `2**31`, then quietly
 * rewrites the delay to **1 ms** — measured on Deno 2.9.6, which prints a
 * `TimeoutOverflowWarning` and carries on. An author writing
 * `deadlineMs: Infinity` to mean "never time out" would get the shortest
 * possible deadline: every shutdown abandoned before the server drains, no hook
 * run, and an exit code of 1 each time, which an orchestrator reads as a crash
 * loop.
 *
 * The shape follows `steps/events_debug.ts` and `steps/scheduler.ts`, which
 * refuse an unrecognised environment value for the same reason: a setting that
 * ignores what you typed is worse than none, because you believe it worked.
 *
 * @param value - The configured value, or `undefined`.
 * @returns A delay `setTimeout` will honour exactly.
 * @throws {TypeError} If the value is not a finite integer in
 * `[1, 2**31 - 1]`.
 *
 * @example
 * ```typescript
 * resolveDeadlineMs(undefined)  // 10000
 * resolveDeadlineMs(20_000)     // 20000
 * resolveDeadlineMs(Infinity)   // throws — it would have meant 1ms
 * ```
 */
export function resolveDeadlineMs(value: number | undefined): number {
    if (value === undefined) return DEFAULT_SHUTDOWN_DEADLINE_MS

    if (
        !Number.isInteger(value) ||
        value < 1 ||
        value > MAX_SHUTDOWN_DEADLINE_MS
    ) {
        throw new TypeError(
            `shutdown.deadlineMs must be an integer between 1 and ${MAX_SHUTDOWN_DEADLINE_MS}, ` +
                `received: ${
                    String(value)
                }. Values outside that range are silently ` +
                `clamped to 1ms by setTimeout, which would abandon every shutdown.`,
        )
    }

    return value
}

/**
 * One application's shutdown: stop accepting, then tear down in order, bounded.
 *
 * @since 0.2.1
 *
 * @example
 * ```typescript
 * const sequence = new ShutdownSequence(10_000)
 * sequence.registry.register('cache', () => cache.close())
 * const report = await sequence.run()
 * ```
 */
export class ShutdownSequence {
    readonly #registry = new ShutdownRegistry()
    #deadlineMs: number
    /** Filled as the sequence progresses, so a timeout can still report it. */
    #progress: { ran: number; failed: readonly ShutdownFailure[] } = {
        ran: 0,
        failed: [],
    }
    #server?: ShutdownableServer | Promise<ShutdownableServer>
    #running?: Promise<ShutdownReport>

    /**
     * @param deadlineMs - Bound for the whole sequence. Validated, so an invalid
     * value fails here rather than becoming a 1 ms deadline at `setTimeout`.
     */
    constructor(deadlineMs?: number) {
        this.#deadlineMs = resolveDeadlineMs(deadlineMs)
    }

    /** The one list of teardowns. */
    get registry(): ShutdownRegistry {
        return this.#registry
    }

    /** The bound currently in force, in milliseconds. */
    get deadlineMs(): number {
        return this.#deadlineMs
    }

    /**
     * Apply a configured deadline.
     *
     * Called from the bootstrap step, so an invalid value **fails the boot**
     * rather than surfacing as a mysteriously instant shutdown hours later.
     * That is where a configuration error belongs, and it is the shape
     * `steps/events_debug.ts` and `steps/scheduler.ts` already use for a bad
     * environment value.
     *
     * @param value - The configured value, or `undefined` to keep the default.
     * @throws {TypeError} If the value is not a finite integer in
     * `[1, 2**31 - 1]`.
     *
     * @example
     * ```typescript
     * sequence.setDeadlineMs(config.shutdown?.deadlineMs)
     * ```
     */
    setDeadlineMs(value: number | undefined): void {
        this.#deadlineMs = resolveDeadlineMs(value)
    }

    /**
     * Whether a sequence has begun.
     *
     * The single home for that question. `kernel/signals.ts` **asks** it to
     * decide whether an arriving signal is the second one; it does not keep a
     * flag of its own, and neither does either signal handler. Two askers is
     * fine; two deciders is the defect.
     */
    get isShuttingDown(): boolean {
        return this.#running !== undefined
    }

    /**
     * Hand over the HTTP server so the sequence can stop it first.
     *
     * Accepts a promise as well as a server, because `ServerListener.listen()`
     * returns `this.tryServe(...) as unknown as Deno.HttpServer` over a
     * `private async tryServe` — what the caller holds is a promise wearing a
     * server's type.
     *
     * @param server - The server, or the promise of one.
     */
    setServer(
        server: ShutdownableServer | Promise<ShutdownableServer> | undefined,
    ): void {
        this.#server = server
    }

    /**
     * Run the sequence: stop the server, then every hook in ascending priority.
     *
     * **Idempotent.** Concurrent and later callers receive the *same* report,
     * not an equal one — the promise is memoised, so ten signals produce one
     * teardown.
     *
     * **Bounded.** The deadline covers the server drain *and* the hooks, because
     * `server.shutdown()` does not resolve while a streaming response is open
     * and `@lockness/sse` holds responses open by design.
     *
     * **Abandoned is not cancelled.** On expiry this resolves and stops waiting;
     * a hung hook keeps running. On the signal path the process then exits, so
     * it makes no difference. A programmatic caller should know it does.
     *
     * @returns What ran, what failed, and whether the deadline expired.
     *
     * @example
     * ```typescript
     * const { failed, timedOut } = await sequence.run()
     * ```
     */
    run(): Promise<ShutdownReport> {
        this.#running ??= this.#execute()
        return this.#running
    }

    /** @internal */
    async #execute(): Promise<ShutdownReport> {
        let timer: ReturnType<typeof setTimeout> | undefined
        const deadline = new Promise<'timeout'>((resolve) => {
            timer = setTimeout(() => resolve('timeout'), this.#deadlineMs)
        })

        try {
            const outcome = await Promise.race([this.#sequence(), deadline])

            if (outcome === 'timeout') {
                console.error(
                    `⚠️  Shutdown exceeded its ${this.#deadlineMs}ms deadline; ` +
                        `abandoning what was still running.`,
                )
                // The PARTIAL result, not a zeroed one. Returning
                // `{ ran: 0, failed: [] }` told a caller that nothing was
                // attempted and nothing failed, when three hooks may have run
                // and one thrown — and invariant 3 calls silence about a hook a
                // defect. The exit code was already right via `timedOut`; it
                // was the programmatic caller who was misled.
                return { ...this.#progress, timedOut: true }
            }

            return outcome
        } finally {
            // Always cleared. A live timer keeps the process alive for up to the
            // full deadline after a clean shutdown, and trips the test
            // sanitizer — which is how this would have been found late.
            clearTimeout(timer)
        }
    }

    /** @internal */
    async #sequence(): Promise<ShutdownReport> {
        // Anything registered by a package, adopted into this sequence's own
        // registry — ONE entry each, never one entry that loops over them.
        // Collapsing N into 1 would put them all behind a single try/catch and
        // silently repeal the policy stated below at `run()`: a single broken
        // teardown must not strand every resource behind it.
        for (const disposable of drainDisposables()) {
            this.#registry.register(
                disposable.name,
                () => disposable.dispose(),
                // `?? STORES`, not a bare pass-through. `register()` defaults an
                // absent priority to 0 — first, ahead of NOTIFY and SERVICES —
                // while `Disposable.priority`'s own JSDoc promises an omitted
                // one "sorts with the stores". A third-party package following
                // that doc would have had its store closed BEFORE the producers
                // still writing into it.
                disposable.priority ?? SHUTDOWN_PRIORITY.STORES,
            )
        }

        // PREDRAIN runs BEFORE the server stops accepting; everything else runs
        // after. The distinction exists because @lockness/sse's own streams are
        // what prevent `server.shutdown()` from resolving, so its teardown
        // cannot sit behind that drain — it would be behind the thing it exists
        // to release.
        //
        // The predicate is `<= PREDRAIN`, not `< 0`. `register()` defaults to 0
        // and `@OnShutdown()` means 0, so a positive threshold sweeps every
        // ordinary hook into the pre-drain — which it did on the first attempt.
        // But `< 0` was wrong in the other direction: an author writing
        // `@OnShutdown({ priority: -1 })` to mean "very early" would silently
        // have their hook run BEFORE the server stopped accepting. Only
        // something that asked for this band by name gets it.
        await this.#registry.runBand((p) => p <= SHUTDOWN_PRIORITY.PREDRAIN)

        // Stop accepting. A hook that ran before this could tear down a
        // resource that an arriving request is about to use.
        const server = await this.#server
        if (server) {
            await server.shutdown()
        }

        await this.#announce()

        // Ordering and the failure policy both belong to the registry — the
        // plan's decision table names it as their single home. This method must
        // not sort, and must not wrap a hook in a try/catch of its own.
        const { ran, failed } = await this.#registry.run((p) => {
            this.#progress = p
        })
        this.#progress = { ran, failed }

        return { ran, failed, timedOut: false }
    }

    /**
     * Emit `KernelTerminating`, so a listener learns the process is going away.
     *
     * The event is not new: it has shipped in `@lockness/events` since it was
     * written, is re-exported from `@lockness/core`, and is documented with a
     * `closeConnections` listener example — and **nothing has ever emitted it**.
     * A documented event that never fires is worse than an absent one, because
     * someone writes the listener and it silently never runs.
     *
     * Between the drain and the hooks: a listener sees the server already
     * stopped, and everything a hook might close still open.
     *
     * @internal
     */
    async #announce(): Promise<void> {
        // Bounded independently of the hooks. `emit` awaits its listeners
        // sequentially with no per-listener limit, so one that never resolves
        // would otherwise consume the whole deadline and leave every resource
        // this feature exists to release still open.
        let timer: ReturnType<typeof setTimeout> | undefined
        const budget = Math.max(
            1,
            Math.floor(this.#deadlineMs * ANNOUNCE_SHARE),
        )

        try {
            const emitted = (async () => {
                const { dispatcher, KernelTerminating } = await import(
                    '@lockness/events'
                )
                await dispatcher().emit(new KernelTerminating('shutdown'))
                return 'done' as const
            })()

            const bounded = new Promise<'expired'>((resolve) => {
                timer = setTimeout(() => resolve('expired'), budget)
            })

            if (await Promise.race([emitted, bounded]) === 'expired') {
                console.warn(
                    `⚠️  A KernelTerminating listener exceeded its ${budget}ms ` +
                        `share of the shutdown deadline; continuing to the teardown hooks.`,
                )
            }
        } catch (error) {
            // Reported, never fatal. A listener that throws must not strand the
            // teardown that follows it — the same rule the hooks get.
            console.error(
                `⚠️  Error emitting KernelTerminating: ${renderError(error)}`,
            )
        } finally {
            clearTimeout(timer)
        }
    }
}
