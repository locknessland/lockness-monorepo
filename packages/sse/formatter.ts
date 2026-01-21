/**
 * @fileoverview SSE event formatter utility.
 *
 * Handles formatting of SSE events to the proper text format.
 * Follows the SSE specification for event stream format.
 *
 * @module @lockness/sse/formatter
 */

import type { SSEEvent } from './types.ts'

/**
 * SSE Event Formatter
 *
 * Converts SSE events to the proper text/event-stream format.
 * Handles multiline data correctly by prefixing each line with 'data:'.
 *
 * @example
 * ```typescript
 * const formatter = new SSEFormatter()
 * const text = formatter.format({ event: 'message', data: { hello: 'world' } })
 * // Output: "event: message\ndata: {"hello":"world"}\n\n"
 * ```
 */
export class SSEFormatter {
    /**
     * Format an SSE event to string
     *
     * @param event - The event to format
     * @returns Formatted SSE event string
     *
     * @example
     * ```typescript
     * formatter.format({ event: 'ping', data: 'pong' })
     * // "event: ping\ndata: pong\n\n"
     *
     * formatter.format({ id: '123', event: 'update', data: { count: 1 }, retry: 5000 })
     * // "id: 123\nevent: update\nretry: 5000\ndata: {"count":1}\n\n"
     * ```
     */
    format(event: SSEEvent): string {
        const lines: string[] = []

        // ID field (must come first for reconnection)
        if (event.id !== undefined) {
            lines.push(`id: ${event.id}`)
        }

        // Event type
        if (event.event !== undefined) {
            lines.push(`event: ${event.event}`)
        }

        // Retry interval
        if (event.retry !== undefined) {
            lines.push(`retry: ${event.retry}`)
        }

        // Data field - handle objects and multiline strings
        const dataStr = this.serializeData(event.data)

        // Split by newlines (SSE requires each line to have 'data:' prefix)
        for (const line of dataStr.split('\n')) {
            lines.push(`data: ${line}`)
        }

        // SSE events are terminated by double newline
        return lines.join('\n') + '\n\n'
    }

    /**
     * Format a heartbeat comment
     *
     * @returns Heartbeat comment string
     */
    formatHeartbeat(): string {
        return ': heartbeat\n\n'
    }

    /**
     * Serialize data to string
     *
     * @param data - Data to serialize
     * @returns Serialized string
     */
    private serializeData(data: unknown): string {
        if (typeof data === 'string') {
            return data
        }
        return JSON.stringify(data)
    }
}

/**
 * Default formatter instance
 */
export const defaultFormatter: SSEFormatter = new SSEFormatter()
