/**
 * @fileoverview Collector registry for deprecation notices.
 *
 * Manages external collectors that receive deprecation events.
 *
 * @module @lockness/deprecation-contracts/collector
 */

import type { DeprecationCollector, DeprecationEntry } from './types.ts'

// =============================================================================
// State
// =============================================================================

/**
 * Currently registered external collector.
 * @internal
 */
let registeredCollector: DeprecationCollector | null = null

// =============================================================================
// Public API
// =============================================================================

/**
 * Register an external collector for deprecation notices.
 *
 * This allows packages like `@lockness/devtools` to receive deprecation events
 * and display them in a dashboard or collect them for analysis.
 *
 * Only one collector can be registered at a time. Registering a new collector
 * replaces the previous one.
 *
 * @param collector - The collector to register
 * @returns void
 *
 * @example
 * ```typescript
 * import { registerCollector } from './collector.ts'
 *
 * registerCollector({
 *     addDeprecation(entry) {
 *         analytics.track('deprecation', entry)
 *     }
 * })
 * ```
 */
export function registerCollector(collector: DeprecationCollector): void {
    registeredCollector = collector
}

/**
 * Unregister the current collector.
 *
 * @returns void
 *
 * @example
 * ```typescript
 * unregisterCollector()
 * ```
 */
export function unregisterCollector(): void {
    registeredCollector = null
}

/**
 * Get the currently registered collector.
 *
 * @returns The collector or null if none registered
 */
export function getCollector(): DeprecationCollector | null {
    return registeredCollector
}

/**
 * Check if a collector is registered.
 *
 * @returns `true` if a collector is registered
 */
export function hasCollector(): boolean {
    return registeredCollector !== null
}

/**
 * Notify the registered collector of a deprecation.
 *
 * Does nothing if no collector is registered.
 *
 * @param entry - The deprecation entry to send
 * @returns void
 */
export function notifyCollector(entry: DeprecationEntry): void {
    if (registeredCollector) {
        registeredCollector.addDeprecation(entry)
    }
}
