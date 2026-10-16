/**
 * @fileoverview The shutdown-signal primitive (plan 274 §5, audit A12): how
 * a Lockness process subscribes to `SIGINT`, `SIGTERM` or `SIGHUP` on any
 * runtime.
 *
 * Mechanism only. Which signals mean shutdown, what a second signal does and
 * when the process exits stay with the caller — `core/kernel/signals.ts` for
 * the HTTP server, queue's worker command for a worker. A
 * `process.on('SIGINT', …)` anywhere else is a second subscription home, and
 * the `lockness-exit/signal-subscription` lint reports it.
 *
 * All three runtimes route `process.on(signal)` from `node:process` to their
 * own signal handling (Deno to `Deno.addSignalListener`), so one spelling
 * serves them all and this module names no runtime. As with Deno's own API,
 * **a listener replaces the default exit**: once one is installed the process
 * no longer ends on that signal, so the caller must end it.
 *
 * @module @lockness/runtime/signals
 */

import process from 'node:process'

/** A signal a Lockness process may treat as "stop". */
export type ShutdownSignal = 'SIGINT' | 'SIGTERM' | 'SIGHUP'

/**
 * Where signals are subscribed: `node:process` by default. Tests pass a
 * recording one.
 */
export interface SignalTarget {
    /**
     * Subscribe `listener` to `signal`.
     *
     * @param signal - The signal.
     * @param listener - Called when it arrives.
     * @throws Whatever the platform raises for a signal it will not bind.
     */
    on(signal: ShutdownSignal, listener: () => void): unknown
    /**
     * Remove a listener `on` added.
     *
     * @param signal - The signal.
     * @param listener - The listener given to `on`.
     */
    off(signal: ShutdownSignal, listener: () => void): unknown
}

/**
 * Subscribe to a signal, and get back the way to unsubscribe.
 *
 * A platform that refuses the signal (Windows binds `SIGINT` but not
 * `SIGTERM` on Deno) throws here, and the error propagates: whether that is a
 * warning or a failure is the caller's policy, not this primitive's.
 *
 * @param signal - `SIGINT`, `SIGTERM` or `SIGHUP`.
 * @param listener - Called with the signal's name each time it arrives.
 * @param target - Where to subscribe; `node:process` by default.
 * @returns A function that removes the subscription; calling it again does
 *   nothing.
 * @throws Whatever the platform raises for a signal it will not bind.
 *
 * @example
 * ```ts
 * import { onSignal } from '@lockness/runtime/signals'
 *
 * const off = onSignal('SIGINT', () => worker.stop())
 * await worker.start()
 * off()
 * ```
 */
export function onSignal(
    signal: ShutdownSignal,
    listener: (signal: ShutdownSignal) => void,
    target: SignalTarget = process,
): () => void {
    const handler = (): void => listener(signal)
    target.on(signal, handler)
    let subscribed = true
    return () => {
        if (!subscribed) return
        subscribed = false
        target.off(signal, handler)
    }
}
