/**
 * @fileoverview Core deprecation trigger functionality.
 *
 * Contains the main `triggerDeprecation` function with all its logic
 * factored into composable, testable pieces.
 *
 * @module @lockness/deprecation-contracts/trigger
 */

import { notifyCollector } from './collector.ts'
import { isStrictMode, shouldIgnore } from './config.ts'
import { buildFullMessage, createEntry, formatMessage } from './formatter.ts'
import { defaultHandler } from './handler.ts'
import type { DeprecationHandler } from './types.ts'

// =============================================================================
// Public API
// =============================================================================

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
    triggerWithHandler(pkg, version, message, defaultHandler, ...args)
}

/**
 * Triggers a deprecation with a custom handler.
 *
 * This is the internal implementation that allows handler injection
 * for testing purposes.
 *
 * @param pkg - The package name
 * @param version - The version
 * @param message - The message template
 * @param handler - The handler to use for output
 * @param args - Placeholder arguments
 * @returns void
 *
 * @internal
 */
export function triggerWithHandler(
    pkg: string,
    version: string,
    message: string,
    handler: DeprecationHandler,
    ...args: readonly unknown[]
): void {
    // Check if we should ignore deprecations
    if (shouldIgnore()) {
        return
    }

    // Format the message
    const formattedMessage = formatMessage(message, ...args)
    const fullMessage = buildFullMessage(pkg, version, formattedMessage)
    const prefixedMessage = `[DEPRECATION] ${fullMessage}`

    // In strict mode, throw an error
    if (isStrictMode()) {
        handler.throw(prefixedMessage)
    }

    // Notify any registered collector
    const entry = createEntry(pkg, version, message, fullMessage)
    notifyCollector(entry)

    // Output the warning
    handler.warn(prefixedMessage)
}
