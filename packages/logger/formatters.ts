/**
 * @fileoverview Built-in log formatters.
 *
 * Text, JSON and pretty (coloured) renderings of a {@link LogEntry}.
 *
 * @module @lockness/logger/formatters
 */

import { LogLevel } from './types.ts'
import type { LogEntry, LogFormatter } from './types.ts'

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
