/**
 * @fileoverview Default handler for outputting deprecation notices.
 *
 * Provides the default implementation that uses console.warn and
 * optionally the Lockness Logger if available.
 *
 * @module @lockness/deprecation-contracts/handler
 */

import { container } from '@lockness/container'
import { Logger } from '@lockness/logger'
import type { DeprecationHandler } from './types.ts'

// =============================================================================
// Console Styles
// =============================================================================

/**
 * CSS style for the deprecation prefix.
 * @internal
 */
const DEPRECATION_PREFIX_STYLE = 'color: #eab308; font-weight: bold;'

/**
 * CSS style for the deprecation message.
 * @internal
 */
const DEPRECATION_MESSAGE_STYLE = 'color: inherit; font-weight: normal;'

// =============================================================================
// Default Handler
// =============================================================================

/**
 * Default deprecation handler implementation.
 *
 * Uses the Lockness Logger if available in the container,
 * otherwise falls back to styled console.warn.
 *
 * @example
 * ```typescript
 * import { defaultHandler } from './handler.ts'
 *
 * defaultHandler.warn('[DEPRECATION] Old method is deprecated')
 * defaultHandler.throw('[DEPRECATION] Critical deprecation') // throws
 * ```
 */
export const defaultHandler: DeprecationHandler = {
    warn(message: string): void {
        // Try Lockness Logger first
        try {
            if (container.has(Logger)) {
                const loggerInstance = container.get(Logger) as Logger
                loggerInstance.warn(message)
                return
            }
        } catch {
            // Fallback if container or logger fails
        }

        // Default: styled console.warn
        console.warn(
            `%c[DEPRECATION] %c${message.replace('[DEPRECATION] ', '')}`,
            DEPRECATION_PREFIX_STYLE,
            DEPRECATION_MESSAGE_STYLE,
        )
    },

    throw(message: string): never {
        throw new Error(message)
    },
}

/**
 * Create a custom deprecation handler.
 *
 * Useful for testing or custom output mechanisms.
 *
 * @param warn - Custom warn function
 * @param throwFn - Custom throw function
 * @returns A new DeprecationHandler
 *
 * @example Testing handler
 * ```typescript
 * const logs: string[] = []
 * const testHandler = createHandler(
 *     (msg) => logs.push(msg),
 *     (msg) => { throw new Error(msg) }
 * )
 * ```
 */
export function createHandler(
    warn: (message: string) => void,
    throwFn: (message: string) => never,
): DeprecationHandler {
    return { warn, throw: throwFn }
}
