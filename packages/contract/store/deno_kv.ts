/**
 * @fileoverview The one "`deno-kv` needs Deno, use `sqlite`" refusal (plan
 * 274 §5, Storage).
 *
 * Deno KV is a Deno API. The cache, session, queue and scheduler-lock
 * factories each ask {@link assertDenoKvRuntime} before they build a
 * `deno-kv` driver, so the refusal and its message exist once rather than
 * four times. On Deno it returns and the factory carries on exactly as
 * before; on any other runtime it throws {@link DenoKvUnavailableError}.
 *
 * For Lockness packages only — on `@lockness/contract/store/internal`, never
 * the package root, which `@lockness/core` re-exports to every app.
 *
 * @module @lockness/contract/store/internal
 */

import { currentRuntime } from '@lockness/runtime/runtime'
import type { DenoKvDriverName } from './drivers.ts'

/** The driver this module guards. */
const DENO_KV: DenoKvDriverName = 'deno-kv'

/**
 * Raised when a subsystem is configured with the `deno-kv` driver on a
 * runtime that has no Deno KV.
 *
 * @example
 * ```ts
 * try {
 *     assertDenoKvRuntime('cache')
 * } catch (error) {
 *     if (error instanceof DenoKvUnavailableError) console.error(error.message)
 * }
 * ```
 */
export class DenoKvUnavailableError extends Error {
    /** The subsystem whose configuration named `deno-kv`, e.g. `cache`. */
    readonly subsystem: string

    /**
     * Build the refusal for one subsystem.
     *
     * @param subsystem - The subsystem whose configuration named `deno-kv`.
     */
    constructor(subsystem: string) {
        super(
            `The ${subsystem} driver '${DENO_KV}' needs Deno: Deno KV is a ` +
                `Deno API. On this runtime, configure the 'sqlite' driver.`,
        )
        this.name = 'DenoKvUnavailableError'
        this.subsystem = subsystem
    }
}

/**
 * Whether this process runs on Deno — asked of the one runtime detector
 * (plan 274 §5, FR-002), never tested here.
 *
 * @returns `true` on Deno.
 * @throws {UnsupportedRuntimeError} From the detector, on a runtime Lockness
 *   does not support at all.
 */
function runsOnDeno(): boolean {
    return currentRuntime() === 'deno'
}

/**
 * Refuse a `deno-kv` driver on a runtime that has no Deno KV.
 *
 * Called by a driver factory in its `deno-kv` branch, before it builds the
 * driver. On Deno it returns and changes nothing — not even a missing
 * `--unstable-kv`, which the driver itself reports as before.
 *
 * @param subsystem - Who asks, named in the message: `cache`, `session`,
 *   `queue` or `scheduler lock`.
 * @param isDeno - The runtime probe; injectable for tests.
 * @throws {DenoKvUnavailableError} When the process does not run on Deno.
 * @throws {UnsupportedRuntimeError} From the default probe, when the runtime
 *   is not one Lockness supports (e.g. Bun below 1.4.0).
 *
 * @example
 * ```ts
 * case 'deno-kv':
 *     assertDenoKvRuntime('cache')
 *     return new DenoKvCacheDriver(config.kvPath)
 * ```
 */
export function assertDenoKvRuntime(
    subsystem: string,
    isDeno: () => boolean = runsOnDeno,
): void {
    if (!isDeno()) throw new DenoKvUnavailableError(subsystem)
}
