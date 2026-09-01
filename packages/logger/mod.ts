/**
 * Lockness Logger - Structured Logging System
 *
 * Provides flexible logging with multiple levels, transports, and formatters.
 * Supports console, file, and custom transports with metadata.
 *
 * Note: Some methods are async for transport consistency
 */

import {
    deregisterDisposable,
    type DisposableHandle,
    registerDisposable,
} from '@lockness/contract/lifecycle/internal'

// deno-lint-ignore-file require-await

// =============================================================================
// Types & Interfaces
// =============================================================================

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

// =============================================================================
// Built-in Formatters
// =============================================================================

/**
 * Simple text formatter
 */
export class TextFormatter implements LogFormatter {
    format(entry: LogEntry): string {
        const time = entry.timestamp.toISOString()
        const level = LogLevel[entry.level].padEnd(5)
        const context = entry.context ? `[${entry.context}] ` : ''
        const meta = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : ''
        return `${time} ${level} ${context}${entry.message}${meta}`
    }
}

/**
 * JSON formatter for structured logging
 */
export class JsonFormatter implements LogFormatter {
    format(entry: LogEntry): string {
        return JSON.stringify({
            timestamp: entry.timestamp.toISOString(),
            level: LogLevel[entry.level],
            message: entry.message,
            context: entry.context,
            ...entry.metadata,
        })
    }
}

/**
 * Pretty formatter with colors (for development)
 */
export class PrettyFormatter implements LogFormatter {
    private colors = {
        [LogLevel.DEBUG]: '\x1b[36m', // Cyan
        [LogLevel.INFO]: '\x1b[32m', // Green
        [LogLevel.WARN]: '\x1b[33m', // Yellow
        [LogLevel.ERROR]: '\x1b[31m', // Red
        [LogLevel.FATAL]: '\x1b[35m', // Magenta
        reset: '\x1b[0m',
    }

    private icons = {
        [LogLevel.DEBUG]: '🔍',
        [LogLevel.INFO]: 'ℹ️ ',
        [LogLevel.WARN]: '⚠️ ',
        [LogLevel.ERROR]: '❌',
        [LogLevel.FATAL]: '💀',
    }

    format(entry: LogEntry): string {
        const color = this.colors[entry.level]
        const icon = this.icons[entry.level]
        const level = LogLevel[entry.level].padEnd(5)
        const time = entry.timestamp.toLocaleTimeString()
        const context = entry.context ? `[${entry.context}] ` : ''
        const meta = entry.metadata
            ? `\n  ${JSON.stringify(entry.metadata, null, 2)}`
            : ''

        return `${color}${icon} ${time} ${level}${this.colors.reset} ${context}${entry.message}${meta}`
    }
}

// =============================================================================
// Built-in Transports
// =============================================================================

/**
 * Console transport - writes to stdout/stderr
 */
export class ConsoleTransport implements LogTransport {
    constructor(private useStderr = true) {}

    log(entry: LogEntry): Promise<void> {
        const output = entry.level >= LogLevel.ERROR && this.useStderr
            ? console.error
            : console.log

        output(entry)
        return Promise.resolve()
    }
}

/**
 * Memory transport - stores logs in memory (for testing)
 */
export class MemoryTransport implements LogTransport {
    private logs: LogEntry[] = []

    log(entry: LogEntry): Promise<void> {
        this.logs.push(entry)
        return Promise.resolve()
    }

    getLogs(): LogEntry[] {
        return [...this.logs]
    }

    clear(): void {
        this.logs = []
    }
}

/**
 * File transport - writes logs to a file
 */
export class FileTransport implements LogTransport {
    private encoder = new TextEncoder()
    private file?: Deno.FsFile

    constructor(
        private filepath: string,
        private formatter: LogFormatter = new TextFormatter(),
    ) {}

    async log(entry: LogEntry): Promise<void> {
        if (!this.file) {
            this.file = await Deno.open(this.filepath, {
                create: true,
                append: true,
                write: true,
            })
        }

        const formatted = this.formatter.format(entry) + '\n'
        await this.file.write(this.encoder.encode(formatted))
    }

    close(): Promise<void> {
        if (this.file) {
            this.file.close()
            this.file = undefined
        }
        return Promise.resolve()
    }
}

// =============================================================================
// Logger Class
// =============================================================================

/**
 * Main Logger class
 */
export class Logger {
    private level: LogLevel
    private transports: LogTransport[]
    /** Transports this logger built itself, and may therefore close. */
    private readonly ownedTransports: WeakSet<LogTransport>
    private formatter: LogFormatter
    private context?: string

    constructor(config: LoggerConfig = {}) {
        this.level = config.level ?? LogLevel.INFO
        // Ownership defaults to OWNED, and the reason is worth stating because
        // the safer-sounding default is the wrong one here.
        //
        // `LoggerConfig` offers no way to ask the logger to build a file
        // transport — the only route is `transports: [new FileTransport(...)]`,
        // which is the shape the package's own docs teach. Treating supplied
        // transports as borrowed would therefore mean the `Deno.FsFile` this
        // package was brought into #136 for could NEVER be released, which
        // defeats the requirement rather than protecting it. It also matches
        // the behaviour `close()` has always had.
        //
        // An application that keeps its own reference — sharing one transport
        // between the global logger and an audit logger — passes
        // `ownsTransports: false` and closes it itself.
        this.transports = config.transports ?? [new ConsoleTransport()]
        this.ownedTransports = config.ownsTransports === false
            ? new WeakSet()
            : new WeakSet(this.transports)
        this.formatter = config.formatter ?? new PrettyFormatter()
        this.context = config.context
    }

    /**
     * Set log level threshold
     */
    setLevel(level: LogLevel): void {
        this.level = level
    }

    /**
     * Get current log level
     */
    getLevel(): LogLevel {
        return this.level
    }

    /**
     * Add a transport
     */
    addTransport(transport: LogTransport): void {
        this.transports.push(transport)
    }

    /**
     * Create child logger with additional context
     */
    child(context: string): Logger {
        const childContext = this.context
            ? `${this.context}:${context}`
            : context
        return new Logger({
            level: this.level,
            transports: this.transports,
            formatter: this.formatter,
            context: childContext,
        })
    }

    /**
     * Log at a specific level
     */
    private async log(
        level: LogLevel,
        message: string,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        // Skip if below threshold
        if (level < this.level) return

        const entry: LogEntry = {
            level,
            message,
            timestamp: new Date(),
            metadata,
            context: this.context,
        }

        // Format once
        const formatted = this.formatter.format(entry)

        // Send to all transports
        await Promise.all(
            this.transports.map((transport) =>
                transport.log({ ...entry, message: formatted })
            ),
        )
    }

    /**
     * Debug level logging
     */
    debug(
        message: string,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        return this.log(LogLevel.DEBUG, message, metadata)
    }

    /**
     * Info level logging
     */
    info(
        message: string,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        return this.log(LogLevel.INFO, message, metadata)
    }

    /**
     * Warning level logging
     */
    warn(
        message: string,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        return this.log(LogLevel.WARN, message, metadata)
    }

    /**
     * Error level logging
     */
    error(
        message: string,
        error?: Error | Record<string, unknown>,
    ): Promise<void> {
        const metadata = error instanceof Error
            ? {
                error: error.message,
                stack: error.stack,
                name: error.name,
            }
            : error

        return this.log(LogLevel.ERROR, message, metadata)
    }

    /**
     * Fatal level logging
     */
    fatal(
        message: string,
        error?: Error | Record<string, unknown>,
    ): Promise<void> {
        const metadata = error instanceof Error
            ? {
                error: error.message,
                stack: error.stack,
                name: error.name,
            }
            : error

        return this.log(LogLevel.FATAL, message, metadata)
    }

    /**
     * Close all transports
     */
    async close(): Promise<void> {
        await Promise.all(
            this.transports.map((transport) => transport.close?.()),
        )
    }

    /**
     * Close only the transports this logger constructed itself.
     *
     * What the shutdown lifecycle calls. {@link close} closes **everything**,
     * including transports the application built and passed in — which it is
     * still holding, and which `child()` shares. Closing those from a framework
     * teardown is the same mistake as closing an injected Redis client.
     *
     * @example
     * ```typescript
     * await log.closeOwnedTransports()
     * ```
     */
    async closeOwnedTransports(): Promise<void> {
        await Promise.all(
            this.transports
                .filter((transport) => this.ownedTransports.has(transport))
                .map((transport) => transport.close?.()),
        )
    }
}

// =============================================================================
// Global Logger Instance
// =============================================================================

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
