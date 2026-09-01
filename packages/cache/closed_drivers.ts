/**
 * @fileoverview Which drivers have been torn down.
 *
 * **Its own module to keep the dependency one-way.** `store.ts` imports the
 * drivers; if a driver imported `markDriverClosed` back from `store.ts` that
 * would be a module cycle, surviving only because the export happens to be a
 * hoisted function declaration. Anyone later converting it to a `const` arrow,
 * or adding a module-level driver instance to `store.ts`, turns it into a TDZ
 * `ReferenceError` at import time — on whichever module the consumer imported
 * first, which differs between `mod.ts` and a direct driver import.
 *
 * @module @lockness/cache/closed_drivers
 * @since 0.2.1
 */

import type { CacheDriver } from './types.ts'

/** A `WeakSet`, so remembering a driver does not keep it alive. */
const closedDrivers = new WeakSet<CacheDriver>()

/**
 * Record that a driver's resource has been released.
 *
 * @param driver - The driver that was closed.
 *
 * @example
 * ```typescript
 * async close(): Promise<void> {
 *     markDriverClosed(this)
 *     // …release the handle
 * }
 * ```
 */
export function markDriverClosed(driver: CacheDriver): void {
    closedDrivers.add(driver)
}

/**
 * Whether this driver has already been torn down.
 *
 * @param driver - The driver to check.
 * @returns `true` when its resource was released.
 *
 * @example
 * ```typescript
 * if (isDriverClosed(current)) current = null
 * ```
 */
export function isDriverClosed(driver: CacheDriver): boolean {
    return closedDrivers.has(driver)
}

/**
 * Forget a driver, so a reused instance is not treated as closed.
 *
 * @param driver - The driver to forget.
 *
 * @example
 * ```typescript
 * forgetClosedDriver(driver)
 * ```
 */
export function forgetClosedDriver(driver: CacheDriver): void {
    closedDrivers.delete(driver)
}
