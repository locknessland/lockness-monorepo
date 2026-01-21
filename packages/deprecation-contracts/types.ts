/**
 * @fileoverview Type definitions for the deprecation-contracts package.
 *
 * @module @lockness/deprecation-contracts/types
 */

// =============================================================================
// Deprecation Entry
// =============================================================================

/**
 * Deprecation entry containing all information about a triggered notice.
 *
 * @example
 * ```typescript
 * const entry: DeprecationEntry = {
 *     pkg: 'my-package',
 *     version: '1.0.0',
 *     message: 'Use newMethod() instead',
 *     fullMessage: 'Since my-package 1.0.0: Use newMethod() instead',
 *     timestamp: Date.now(),
 *     stack: new Error().stack
 * }
 * ```
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

// =============================================================================
// Collector Interface
// =============================================================================

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
// Handler Interface (for testability)
// =============================================================================

/**
 * Handler for deprecation output.
 *
 * Abstraction over the output mechanism to enable testing.
 *
 * @example
 * ```typescript
 * const handler: DeprecationHandler = {
 *     warn: (message) => console.warn(message),
 *     throw: (message) => { throw new Error(message) }
 * }
 * ```
 */
export interface DeprecationHandler {
    /**
     * Log a deprecation warning.
     *
     * @param message - The formatted deprecation message
     * @returns void
     */
    warn(message: string): void

    /**
     * Throw a deprecation error (strict mode).
     *
     * @param message - The formatted deprecation message
     * @throws {Error} Always throws with the message
     */
    throw(message: string): never
}

// =============================================================================
// Configuration Interface
// =============================================================================

/**
 * Configuration for deprecation behavior.
 *
 * @example
 * ```typescript
 * const config: DeprecationConfig = {
 *     strict: false,
 *     ignore: false
 * }
 * ```
 */
export interface DeprecationConfig {
    /** If true, throw errors instead of logging warnings */
    readonly strict: boolean
    /** If true, silently ignore all deprecations */
    readonly ignore: boolean
}

// =============================================================================
// Decorator Options
// =============================================================================

/**
 * Options for the `@Deprecated` decorator.
 *
 * @example
 * ```typescript
 * const options: DeprecationOptions = {
 *     version: '1.2.0',
 *     message: 'Use NewService instead',
 *     package: 'my-package'
 * }
 *
 * @Deprecated(options)
 * class OldService {}
 * ```
 */
export interface DeprecationOptions {
    /**
     * The version when the deprecation was introduced.
     *
     * @example '1.2.0'
     */
    readonly version: string

    /**
     * The deprecation message explaining what to use instead.
     *
     * @example 'Use NewService instead'
     */
    readonly message: string

    /**
     * The package name. Defaults to 'app' if not provided.
     *
     * @example 'my-package'
     */
    readonly package?: string
}
