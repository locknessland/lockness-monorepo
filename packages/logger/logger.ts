/**
 * @fileoverview The main {@link Logger} class.
 *
 * Filters by level, formats once and fans out to every transport. Tracks which
 * transports it constructed itself so shutdown closes only those.
 *
 * @module @lockness/logger/logger
 */

import { LogLevel } from './types.ts'
import type {
    LogEntry,
    LogFormatter,
    LoggerConfig,
    LogTransport,
} from './types.ts'
import { ConsoleTransport } from './transports.ts'
import { PrettyFormatter } from './formatters.ts'

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
