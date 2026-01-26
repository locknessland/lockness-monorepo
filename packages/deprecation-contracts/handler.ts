/**
 * @fileoverview Default handler for outputting deprecation notices.
 *
 * Provides the default implementation that uses console.warn.
 * For custom logging integration (e.g., with @lockness/logger),
 * use setHandler() to provide your own implementation.
 *
 * @module @lockness/deprecation-contracts/handler
 */

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
 * Uses styled console.warn for output. For custom logging
 * (e.g., integration with @lockness/logger), use setHandler()
 * to provide your own implementation.
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
        // Styled console.warn
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
