/**
 * @fileoverview Configuration utilities for deprecation behavior.
 *
 * Provides functions to read deprecation configuration from environment.
 *
 * @module @lockness/deprecation-contracts/config
 */

import type { DeprecationConfig } from './types.ts'

// =============================================================================
// Environment Configuration
// =============================================================================

/**
 * Read deprecation configuration from environment variables.
 *
 * Reads:
 * - `IGNORE_DEPRECATIONS` - Set to 'true' to ignore all deprecations
 * - `STRICT_DEPRECATIONS` - Set to 'true' to throw errors
 *
 * @returns The current deprecation configuration
 *
 * @example
 * ```typescript
 * const config = getConfig()
 * if (config.ignore) {
 *     return // Skip deprecation
 * }
 * ```
 */
export function getConfig(): DeprecationConfig {
    try {
        return {
            ignore: Deno.env.get('IGNORE_DEPRECATIONS') === 'true',
            strict: Deno.env.get('STRICT_DEPRECATIONS') === 'true',
        }
    } catch {
        // Permission denied or env not accessible - return safe defaults
        return {
            ignore: false,
            strict: false,
        }
    }
}

/**
 * Check if deprecations should be ignored.
 *
 * @returns `true` if `IGNORE_DEPRECATIONS=true`, `false` otherwise or if env access is denied
 */
export function shouldIgnore(): boolean {
    try {
        return Deno.env.get('IGNORE_DEPRECATIONS') === 'true'
    } catch {
        // Permission denied or env not accessible - don't ignore deprecations
        return false
    }
}

/**
 * Check if deprecations should throw errors.
 *
 * @returns `true` if `STRICT_DEPRECATIONS=true`, `false` otherwise or if env access is denied
 */
export function isStrictMode(): boolean {
    try {
        return Deno.env.get('STRICT_DEPRECATIONS') === 'true'
    } catch {
        // Permission denied or env not accessible - don't use strict mode
        return false
    }
}
