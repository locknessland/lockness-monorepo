/**
 * @fileoverview Public type vocabulary for the Lockness logger.
 *
 * The log-level enum plus the entry, transport, formatter and configuration
 * contracts shared by the formatters, transports, the {@link Logger} class and
 * the convenience functions. Dependency-free to avoid cycles.
 *
 * @module @lockness/logger/types
 */

/**
 * Log levels in order of severity
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    FATAL = 4,
}

/**
 * Log entry structure
 */
export interface LogEntry {
    level: LogLevel
    message: string
    timestamp: Date
    metadata?: Record<string, unknown>
    context?: string
}

/**
 * Transport interface - handles log output
 */
export interface LogTransport {
    log(entry: LogEntry): Promise<void>
    close?(): Promise<void>
}

/**
 * Formatter interface - formats log entries
 */
export interface LogFormatter {
    format(entry: LogEntry): string
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
    level?: LogLevel
    transports?: LogTransport[]

    /**
     * Whether the shutdown lifecycle may close these transports.
     *
     * **Defaults to `true`.** A transport passed here is normally constructed
     * inline and handed over for good, and it is the only way to give this
     * package a file to write to — so treating them as borrowed would leave the
     * file handle unreleasable.
     *
     * Set it to `false` when the application keeps its own reference and uses
     * the transport elsewhere; then closing it is the application's job.
     *
     * @default true
     */
    ownsTransports?: boolean
    formatter?: LogFormatter
    context?: string
}
