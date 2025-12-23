/**
 * Lockness Logger - Structured Logging System
 *
 * Provides flexible logging with multiple levels, transports, and formatters.
 * Supports console, file, and custom transports with metadata.
 *
 * Note: Some methods are async for transport consistency
 */

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

    async log(entry: LogEntry): Promise<void> {
        const output = entry.level >= LogLevel.ERROR && this.useStderr
            ? console.error
            : console.log

        output(entry)
    }
}

/**
 * Memory transport - stores logs in memory (for testing)
 */
export class MemoryTransport implements LogTransport {
    private logs: LogEntry[] = []

    async log(entry: LogEntry): Promise<void> {
        this.logs.push(entry)
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

    async close(): Promise<void> {
        if (this.file) {
            this.file.close()
            this.file = undefined
        }
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
    private formatter: LogFormatter
    private context?: string

    constructor(config: LoggerConfig = {}) {
        this.level = config.level ?? LogLevel.INFO
        this.transports = config.transports ?? [new ConsoleTransport()]
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
    async debug(
        message: string,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        return this.log(LogLevel.DEBUG, message, metadata)
    }

    /**
     * Info level logging
     */
    async info(
        message: string,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        return this.log(LogLevel.INFO, message, metadata)
    }

    /**
     * Warning level logging
     */
    async warn(
        message: string,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        return this.log(LogLevel.WARN, message, metadata)
    }

    /**
     * Error level logging
     */
    async error(
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
    async fatal(
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
}

// =============================================================================
// Global Logger Instance
// =============================================================================

let globalLogger: Logger | null = null

/**
 * Configure global logger
 */
export function configureLogger(config: LoggerConfig = {}): Logger {
    globalLogger = new Logger(config)
    return globalLogger
}

/**
 * Get global logger instance
 */
export function logger(): Logger {
    if (!globalLogger) {
        globalLogger = new Logger()
    }
    return globalLogger
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Quick debug logging
 */
export async function debug(
    message: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    return logger().debug(message, metadata)
}

/**
 * Quick info logging
 */
export async function info(
    message: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    return logger().info(message, metadata)
}

/**
 * Quick warning logging
 */
export async function warn(
    message: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    return logger().warn(message, metadata)
}

/**
 * Quick error logging
 */
export async function error(
    message: string,
    error?: Error | Record<string, unknown>,
): Promise<void> {
    return logger().error(message, error)
}

/**
 * Quick fatal logging
 */
export async function fatal(
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
