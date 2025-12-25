import { container } from '@lockness/container'
import { Logger } from '@lockness/logger'

export * from './decorators.ts'

// Minimal interface for devtools collector to avoid 'any'
interface Collector {
    addDeprecation(entry: {
        pkg: string
        version: string
        message: string
        fullMessage: string
        timestamp: number
        stack?: string
    }): void
}

// Optional import for devtools integration
let devtoolsCollector: Collector | null = null
try {
    const module = await import('@lockness/devtools')
    devtoolsCollector = module.collector as Collector
} catch {
    // Devtools not available
}

/**
 * Triggers a deprecation notice.
 * 
 * @param pkg The name of the package that is triggering the deprecation
 * @param version The version of the package that introduced the deprecation
 * @param message The message of the deprecation
 * @param args Values to insert in the message (replaces %s, %d, etc. or just appends)
 */
export function triggerDeprecation(
    pkg: string,
    version: string,
    message: string,
    ...args: unknown[]
): void {
    // Check if we should ignore deprecations
    if (Deno.env.get('IGNORE_DEPRECATIONS') === 'true') {
        return
    }

    let formattedMessage = message
    if (args.length > 0) {
        // Simple string replacement if %s is found, otherwise append
        args.forEach(arg => {
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

    // Attempt to collect in devtools
    if (devtoolsCollector) {
        devtoolsCollector.addDeprecation({
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
        'color: inherit; font-weight: normal;'
    )
}
