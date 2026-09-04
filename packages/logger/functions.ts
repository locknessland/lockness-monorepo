/**
 * @fileoverview Process-global logger and the convenience free functions.
 *
 * Holds the single `globalLogger` instance and its shutdown registration
 * handle (kept here and nowhere else so there is exactly one global logger),
 * plus `configureLogger` / `logger` and the quick `debug` / `info` / `warn` /
 * `error` / `fatal` / `createLogger` wrappers.
 *
 * @module @lockness/logger/functions
 */

import {
    deregisterDisposable,
    type DisposableHandle,
    registerDisposable,
} from '@lockness/contract/lifecycle/internal'
import type { LoggerConfig } from './types.ts'
import { Logger } from './logger.ts'

/** Withdrawn when the logger is replaced, so the registry does not grow. */
let loggerHandle: DisposableHandle | undefined

let globalLogger: Logger | null = null

/**
 * Configure global logger
 */
export function configureLogger(config: LoggerConfig = {}): Logger {
    globalLogger = new Logger(config)
    registerGlobalLogger(globalLogger)
    return globalLogger
}

/**
 * Announce the global logger so its transports are closed at shutdown.
 *
 * A file transport holds a `Deno.FsFile`, and `close()` has always existed —
 * the package's own docs told the application to call it by hand
 * (`await log.close() // Close file handles`). Now the framework does.
 *
 * **STORES priority**: logs are written *by* the things torn down before this,
 * so the logger closes after them and their teardown lines are not lost.
 *
 * @param instance - The logger that just became global.
 * @internal
 */
function registerGlobalLogger(instance: Logger): void {
    // Withdraw the previous one first: replacing the global logger twice in a
    // long-lived process would otherwise leave a stale entry per replacement.
    if (loggerHandle) deregisterDisposable(loggerHandle)
    loggerHandle = registerDisposable({
        name: 'logger',
        dispose: async () => {
            if (loggerHandle) {
                deregisterDisposable(loggerHandle)
                loggerHandle = undefined
            }
            // Only transports the logger built itself. A transport the
            // application constructed and passed in — `configureLogger({
            // transports: [auditFile] })` — is still held and used by that
            // application, and `child()` shares the same array, so closing it
            // here throws BadResource on their next write. Same rule as the
            // cache's injected Redis client.
            await instance.closeOwnedTransports()
            // A logger whose file handle is closed must not be handed out
            // again — the same rule the cache store follows. `logger()` builds
            // a fresh one, so a programmatic shutdown leaves the process able
            // to log rather than writing into a closed descriptor.
            if (globalLogger === instance) globalLogger = null
        },
        priority: 60,
    })
}

/**
 * Get global logger instance
 */
export function logger(): Logger {
    if (!globalLogger) {
        globalLogger = new Logger()
        registerGlobalLogger(globalLogger)
    }
    return globalLogger
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Quick debug logging
 */
export function debug(
    message: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    return logger().debug(message, metadata)
}

/**
 * Quick info logging
 */
export function info(
    message: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    return logger().info(message, metadata)
}

/**
 * Quick warning logging
 */
export function warn(
    message: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    return logger().warn(message, metadata)
}

/**
 * Quick error logging
 */
export function error(
    message: string,
    error?: Error | Record<string, unknown>,
): Promise<void> {
    return logger().error(message, error)
}

/**
 * Quick fatal logging
 */
export function fatal(
    message: string,
    error?: Error | Record<string, unknown>,
): Promise<void> {
    return logger().fatal(message, error)
}

/**
 * Create a logger with specific context
 */
export function createLogger(config: LoggerConfig = {}): Logger {
    return new Logger(config)
}
