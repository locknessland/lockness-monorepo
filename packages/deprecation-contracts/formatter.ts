/**
 * @fileoverview Message formatting utilities for deprecation notices.
 *
 * @module @lockness/deprecation-contracts/formatter
 */

// =============================================================================
// Message Formatting
// =============================================================================

/**
 * Format a deprecation message with placeholder substitution.
 *
 * Replaces `%s` placeholders with provided arguments.
 * Extra arguments are appended to the message.
 *
 * @param message - The message template with optional `%s` placeholders
 * @param args - Values to substitute for placeholders
 * @returns The formatted message
 *
 * @example With placeholders
 * ```typescript
 * formatMessage('Use %s instead of %s', 'newMethod', 'oldMethod')
 * // Returns: 'Use newMethod instead of oldMethod'
 * ```
 *
 * @example Without placeholders
 * ```typescript
 * formatMessage('Method deprecated', 'extra', 'args')
 * // Returns: 'Method deprecated extra args'
 * ```
 */
export function formatMessage(
    message: string,
    ...args: readonly unknown[]
): string {
    if (args.length === 0) {
        return message
    }

    let result = message
    for (const arg of args) {
        if (result.includes('%s')) {
            result = result.replace('%s', String(arg))
        } else {
            result += ` ${arg}`
        }
    }
    return result
}

/**
 * Build the full deprecation message with package/version prefix.
 *
 * @param pkg - The package name
 * @param version - The version that introduced the deprecation
 * @param message - The formatted deprecation message
 * @returns The full message with prefix
 *
 * @example
 * ```typescript
 * buildFullMessage('my-pkg', '1.0.0', 'Use newMethod()')
 * // Returns: 'Since my-pkg 1.0.0: Use newMethod()'
 * ```
 */
export function buildFullMessage(
    pkg: string,
    version: string,
    message: string,
): string {
    const prefix = pkg || version ? `Since ${pkg} ${version}: ` : ''
    return `${prefix}${message}`
}

/**
 * Create a deprecation entry object.
 *
 * @param pkg - The package name
 * @param version - The version
 * @param message - The original message
 * @param fullMessage - The formatted full message
 * @returns A complete deprecation entry
 */
export function createEntry(
    pkg: string,
    version: string,
    message: string,
    fullMessage: string,
): {
    readonly pkg: string
    readonly version: string
    readonly message: string
    readonly fullMessage: string
    readonly timestamp: number
    readonly stack: string | undefined
} {
    return {
        pkg,
        version,
        message,
        fullMessage,
        timestamp: Date.now(),
        stack: new Error().stack,
    }
}
