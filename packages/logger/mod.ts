/**
 * Lockness Logger - Structured Logging System
 *
 * Provides flexible logging with multiple levels, transports, and formatters.
 * Supports console, file, and custom transports with metadata.
 *
 * @module @lockness/logger
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

export { LogLevel } from './types.ts'
export type {
    LogEntry,
    LogFormatter,
    LoggerConfig,
    LogTransport,
} from './types.ts'

// =============================================================================
// Built-in Formatters
// =============================================================================

export { JsonFormatter, PrettyFormatter, TextFormatter } from './formatters.ts'

// =============================================================================
// Built-in Transports
// =============================================================================

export {
    ConsoleTransport,
    FileTransport,
    MemoryTransport,
} from './transports.ts'

// =============================================================================
// Logger Class
// =============================================================================

export { Logger } from './logger.ts'

// =============================================================================
// Global Logger & Convenience Functions
// =============================================================================

export {
    configureLogger,
    createLogger,
    debug,
    error,
    fatal,
    info,
    logger,
    warn,
} from './functions.ts'
