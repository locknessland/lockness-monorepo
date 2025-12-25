/**
 * @lockness/deprecation-contracts
 * 
 * A generic function and convention to trigger deprecation notices.
 * Inspired by symfony/deprecation-contracts.
 */

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
    const fullMessage = `[DEPRECATION] ${prefix}${formattedMessage}`

    // In CI or strictly configured environments, we might want to throw
    if (Deno.env.get('STRICT_DEPRECATIONS') === 'true') {
        throw new Error(fullMessage)
    }

    // Default behavior is console.warn (equivalent to PHP's USER_DEPRECATED when not silenced)
    console.warn(`%c${fullMessage}`, 'color: #eab308; font-weight: bold;')
}
