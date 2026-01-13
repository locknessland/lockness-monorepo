/**
 * Format error for console output with colors and context
 * Provides better DX by showing clean, readable error messages
 */
export function formatErrorForConsole(
    error: Error,
    status: number,
    path: string,
    options: {
        showStackTrace?: boolean
        isDevelopment?: boolean
    } = {},
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
