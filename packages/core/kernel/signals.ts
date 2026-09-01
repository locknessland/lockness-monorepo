/**
 * @fileoverview Signal wiring — the only module that ends the process.
 *
 * Two rules live here and nowhere else: **which signals mean shutdown**, and
 * **that the process exits afterwards**. `ShutdownSequence` deliberately does
 * neither, so that a programmatic `await app.shutdown()` can tear down and keep
 * running.
 *
 * It is a separate module from `app.ts` for a reason that is not stylistic:
 * `packages/core/app.ts:23-27` declares a local `Deno` global exposing only
 * `env.get`, so `Deno.addSignalListener` and `Deno.exit` written there would
 * either fail `deno check` or force that shim wider.
 *
 * **Installing a handler removes Deno's default exit.** Measured on 2.9.6: with
 * a `SIGINT` listener registered, Ctrl-C runs the handler and the process stays
 * alive. So every path through here must reach `Deno.exit`, or this feature
 * turns a working Ctrl-C into a hang.
 *
 * @module @lockness/core/kernel/signals
 * @since 0.2.1
 */

import type { ShutdownSequence } from './shutdown_sequence.ts'
import { renderError } from './shutdown_registry.ts'

/**
 * The signals that mean "shut down".
 *
 * `SIGINT` is Ctrl-C; `SIGTERM` is what an orchestrator sends before it resorts
 * to `SIGKILL`. `SIGKILL` itself is absent because it cannot be handled — Deno
 * refuses to bind it with `TypeError: Binding to signal 'SIGKILL' is not
 * allowed`, which is the shape {@link installShutdownSignals} catches.
 */
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const

/** What a shutdown produced, reduced to what the exit code depends on. */
interface ExitRelevantReport {
    readonly failed: readonly unknown[]
    readonly timedOut: boolean
}

/**
 * Map a shutdown report onto a process exit code.
 *
 * The single home for that mapping. `0` when every teardown ran clean, `1` when
 * one threw or the deadline expired — so a supervisor can tell an orderly stop
 * from a degraded one.
 *
 * @param report - The completed shutdown report.
 * @returns `0` or `1`.
 *
 * @example
 * ```typescript
 * Deno.exit(exitCodeFor(report))
 * ```
 */
export function exitCodeFor(report: ExitRelevantReport): number {
    return report.failed.length > 0 || report.timedOut ? 1 : 0
}

/**
 * Install `SIGINT` and `SIGTERM` handlers that run the shutdown sequence.
 *
 * Called by `App.listen()` unless the kernel opted out with
 * `@Kernel({ shutdown: { signals: false } })`.
 *
 * **A second signal exits immediately.** Whether one is already in flight is
 * asked of `sequence.isShuttingDown` — the handlers keep no flag of their own,
 * because two flags for one question is two deciders.
 *
 * **A signal the platform refuses is a warning, not a failed boot.** Each
 * registration sits in its own `try/catch`, so `SIGTERM` being unavailable
 * (Windows supports `SIGINT` and `SIGBREAK`) still leaves `SIGINT` installed.
 * A `try/catch` rather than a `Deno.build.os` test on purpose: the catch is
 * right whether or not a belief about which OS supports which signal is, and it
 * stays right when Deno's list changes.
 *
 * @param sequence - The application's shutdown sequence.
 * @returns The signals actually installed.
 *
 * @example
 * ```typescript
 * installShutdownSignals(sequence)   // ['SIGINT', 'SIGTERM']
 * ```
 */
export function installShutdownSignals(
    sequence: ShutdownSequence,
): readonly string[] {
    const installed: string[] = []

    for (const signal of SHUTDOWN_SIGNALS) {
        try {
            Deno.addSignalListener(signal, () => {
                // Asked, not remembered. `isShuttingDown` is the single home.
                if (sequence.isShuttingDown) {
                    console.log(
                        `\n⏹  Second ${signal} — exiting without waiting.`,
                    )
                    Deno.exit(1)
                }

                console.log(`\n⏻  ${signal} received, shutting down…`)

                // Fire-and-exit. `run()` never rejects — it reports failures in
                // its result — but a `.catch` is kept so that a defect in the
                // sequence itself still exits rather than leaving a process
                // that no longer responds to Ctrl-C.
                sequence.run()
                    .then((report) => Deno.exit(exitCodeFor(report)))
                    .catch((error) => {
                        // Rendered, not passed whole: `console.error(msg,
                        // error)` prints the stack, and teardown is where
                        // credential-bearing driver errors are produced.
                        console.error(
                            `❌ Shutdown failed: ${renderError(error)}`,
                        )
                        Deno.exit(1)
                    })
            })
            installed.push(signal)
        } catch (error) {
            // Not silent, and not fatal. A platform that will not bind this
            // signal is a fact about the platform, not a configuration error.
            console.warn(
                `⚠️  Could not install a ${signal} handler: ${
                    renderError(error)
                }`,
            )
        }
    }

    return installed
}
