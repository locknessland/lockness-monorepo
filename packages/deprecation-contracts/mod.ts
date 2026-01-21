/**
 * @fileoverview Deprecation contracts for managing deprecation notices.
 *
 * Provides utilities for triggering deprecation warnings in a consistent way,
 * with support for strict mode (throws errors) and silent mode (ignores).
 *
 * @module @lockness/deprecation-contracts
 *
 * @example
 * ```ts
 * import { triggerDeprecation, Deprecated } from '@lockness/deprecation-contracts'
 *
 * // Trigger a deprecation notice
 * triggerDeprecation('my-pkg', '1.0.0', 'Use newMethod() instead')
 *
 * // Or use the decorator
 * @Deprecated('1.0.0', 'Use NewService instead')
 * class OldService {}
 * ```
 */

import { container } from '@lockness/container'
import { Logger } from '@lockness/logger'

export * from './decorators.ts'

// =============================================================================
// Types
// =============================================================================

/**
 * Deprecation entry for external collectors.
 *
 * Contains all information about a triggered deprecation notice.
 */
export interface DeprecationEntry {
    /** The package that triggered the deprecation */
    readonly pkg: string
    /** The version that introduced the deprecation */
    readonly version: string
    /** The original deprecation message */
    readonly message: string
    /** The formatted message with prefix */
    readonly fullMessage: string
    /** Unix timestamp when the deprecation was triggered */
    readonly timestamp: number
    /** Optional stack trace for debugging */
    readonly stack?: string
}

/**
 * Interface for external deprecation collectors.
 *
 * Allows packages like `@lockness/devtools` to receive deprecation events.
 *
 * @example
 * ```typescript
 * const collector: DeprecationCollector = {
 *     addDeprecation(entry) {
 *         console.log('Deprecation:', entry.fullMessage)
 *     }
 * }
 * registerDeprecationCollector(collector)
 * ```
 */
export interface DeprecationCollector {
    /**
     * Called when a deprecation notice is triggered.
     *
     * @param entry - The deprecation entry with all details
     * @returns void
     */
    addDeprecation(entry: DeprecationEntry): void
}

// =============================================================================
// State
// =============================================================================

/**
 * External collector registered by devtools or other packages.
 * @internal
 */
let externalCollector: DeprecationCollector | null = null

// =============================================================================
// Public API
// =============================================================================

/**
 * Register an external collector for deprecation notices.
 *
 * This allows packages like `@lockness/devtools` to receive deprecation events
 * and display them in a dashboard or collect them for analysis.
 *
 * @param collector - The collector to register
 * @returns void
 *
 * @example
 * ```typescript
 * import { registerDeprecationCollector } from '@lockness/deprecation-contracts'
 *
 * registerDeprecationCollector({
 *     addDeprecation(entry) {
 *         // Send to monitoring service
 *         analytics.track('deprecation', entry)
 *     }
 * })
 * ```
 */
export function registerDeprecationCollector(
    collector: DeprecationCollector,
): void {
    externalCollector = collector
}

/**
 * Triggers a deprecation notice.
 *
 * The behavior is controlled by environment variables:
 * - `IGNORE_DEPRECATIONS=true` - Silently ignores all deprecations
 * - `STRICT_DEPRECATIONS=true` - Throws an error instead of logging
 *
 * @param pkg - The name of the package that is triggering the deprecation
 * @param version - The version of the package that introduced the deprecation
 * @param message - The deprecation message (supports `%s` placeholders)
 * @param args - Values to insert in the message (replaces `%s` or appends)
 * @returns void
 * @throws {Error} When `STRICT_DEPRECATIONS=true` is set
 *
 * @example Basic usage
 * ```typescript
 * triggerDeprecation('my-pkg', '1.2.0', 'Use newMethod() instead')
 * // Logs: [DEPRECATION] Since my-pkg 1.2.0: Use newMethod() instead
 * ```
 *
 * @example With placeholders
 * ```typescript
 * triggerDeprecation('my-pkg', '1.2.0', 'Use %s instead of %s', 'newMethod', 'oldMethod')
 * // Logs: [DEPRECATION] Since my-pkg 1.2.0: Use newMethod instead of oldMethod
 * ```
 */
export function triggerDeprecation(
    pkg: string,
    version: string,
    message: string,
    ...args: readonly unknown[]
): void {
    // Check if we should ignore deprecations
    if (Deno.env.get('IGNORE_DEPRECATIONS') === 'true') {
        return
    }

    let formattedMessage = message
    if (args.length > 0) {
        // Simple string replacement if %s is found, otherwise append
        args.forEach((arg) => {
            if (formattedMessage.includes('%s')) {
                formattedMessage = formattedMessage.replace('%s', String(arg))
            } else {
                formattedMessage += ` ${arg}`
            }
        })
    }

    const prefix = pkg || version ? `Since ${pkg} ${version}: ` : ''
    const fullMessage = `${prefix}${formattedMessage}`

    // In CI or strictly configured environments, we might want to throw
    if (Deno.env.get('STRICT_DEPRECATIONS') === 'true') {
        throw new Error(`[DEPRECATION] ${fullMessage}`)
    }

    // Send to external collector if registered
    if (externalCollector) {
        externalCollector.addDeprecation({
            pkg,
            version,
            message,
            fullMessage,
            timestamp: Date.now(),
            stack: new Error().stack,
        })
    }

    // Attempt to use Lockness Logger if available in container
    try {
        if (container.has(Logger)) {
            const loggerInstance = container.get(Logger) as Logger
            loggerInstance.warn(`[DEPRECATION] ${fullMessage}`)
            return
        }
    } catch {
        // Fallback if container or logger fails
    }

    // Default behavior is styled console.warn
    console.warn(
        `%c[DEPRECATION] %c${fullMessage}`,
        'color: #eab308; font-weight: bold;',
        'color: inherit; font-weight: normal;',
    )
}
