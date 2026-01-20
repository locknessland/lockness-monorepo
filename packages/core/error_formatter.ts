/**
 * @fileoverview Error Formatter Module
 *
 * Provides formatted console output for errors during development.
 * Displays clean, colorized error messages with relevant context.
 *
 * @module @lockness/core/error_formatter
 */

/**
 * Options for formatting error output.
 */
export interface FormatErrorOptions {
    /** Whether to show stack trace (default: true) */
    readonly showStackTrace?: boolean
    /** Whether running in development mode (default: based on APP_ENV) */
    readonly isDevelopment?: boolean
}

/**
 * Formats and logs an error to the console with colors and context.
 *
 * Provides better developer experience by showing clean, readable error messages.
 * Behavior varies based on error type:
 * - **404**: Simple warning with path
 * - **401/403**: Minimal info with appropriate emoji
 * - **500+**: Full error with condensed stack trace
 *
 * @param error - The error object to format
 * @param status - HTTP status code
 * @param path - Request path that caused the error
 * @param options - Formatting options
 *
 * @example
 * ```typescript
 * formatErrorForConsole(
 *     new Error('User not found'),
 *     404,
 *     '/users/999',
 *     { isDevelopment: true }
 * )
 * // Output: ⚠️  404 Not Found: /users/999
 * ```
 *
 * @example Server error with stack trace
 * ```typescript
 * formatErrorForConsole(
 *     new Error('Database connection failed'),
 *     500,
 *     '/api/users'
 * )
 * // Output:
 * // ❌ 500 Error: Database connection failed
 * // Path: /api/users
 * // Stack:
 * //   at DatabaseService.connect (...)
 * ```
 */
export function formatErrorForConsole(
    error: Error,
    status: number,
    path: string,
    options: FormatErrorOptions = {},
): void {
    const isDev = options.isDevelopment ??
        Deno.env.get('APP_ENV') === 'development'
    const showStack = options.showStackTrace ?? true

    // For 404s in development, just show a simple colored message
    if (status === 404 && isDev) {
        console.log(`  \x1b[33m⚠️  404 Not Found:\x1b[0m ${path}`)
        return
    }

    // For 401/403, show minimal info
    if ((status === 401 || status === 403) && isDev) {
        const emoji = status === 401 ? '🔒' : '⛔'
        const label = status === 401 ? 'Unauthorized' : 'Forbidden'
        console.log(`  \x1b[33m${emoji} ${status} ${label}:\x1b[0m ${path}`)
        return
    }

    // For 500s and other errors, show formatted error
    if (isDev) {
        console.log(`\n  \x1b[31m❌ ${status} Error:\x1b[0m ${error.message}`)
        console.log(`  \x1b[90mPath:\x1b[0m ${path}`)

        // Show a condensed stack trace (first 3 relevant lines)
        if (showStack && error.stack) {
            const stackLines = error.stack
                .split('\n')
                .slice(1, 4) // Skip first line (error message) and limit to 3 lines
                .filter((line) => !line.includes('node_modules')) // Skip node_modules
                .map((line) => `  \x1b[90m${line.trim()}\x1b[0m`)
            if (stackLines.length > 0) {
                console.log(`  \x1b[90mStack:\x1b[0m`)
                stackLines.forEach((line) => console.log(line))
            }
        }
        console.log('') // Empty line for spacing
    } else {
        // In production, just log the error normally
        console.error('Error:', error)
    }
}
