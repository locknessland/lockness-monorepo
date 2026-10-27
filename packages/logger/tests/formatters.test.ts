/**
 * Tests for @lockness/logger - Formatters
 */

import { assertEquals } from '@std/assert'
import {
    JsonFormatter,
    LogLevel,
    PrettyFormatter,
    TextFormatter,
} from '../mod.ts'

Deno.test('Logger - Formatters', async (t) => {
    await t.step('TextFormatter formats correctly', () => {
        const formatter = new TextFormatter()
        const entry = {
            level: LogLevel.INFO,
            message: 'Test message',
            timestamp: new Date('2024-01-01T12:00:00Z'),
            context: 'Test',
            metadata: { key: 'value' },
        }

        const formatted = formatter.format(entry)
        assertEquals(formatted.includes('INFO'), true)
        assertEquals(formatted.includes('Test message'), true)
        assertEquals(formatted.includes('[Test]'), true)
        assertEquals(formatted.includes('"key":"value"'), true)
    })

    await t.step('JsonFormatter outputs valid JSON', () => {
        const formatter = new JsonFormatter()
        const entry = {
            level: LogLevel.ERROR,
            message: 'Error occurred',
            timestamp: new Date('2024-01-01T12:00:00Z'),
            metadata: { error: 'details' },
        }

        const formatted = formatter.format(entry)
        const parsed = JSON.parse(formatted)

        assertEquals(parsed.level, 'ERROR')
        assertEquals(parsed.message, 'Error occurred')
        assertEquals(parsed.error, 'details')
    })

    await t.step('PrettyFormatter includes icons and colors', () => {
        const formatter = new PrettyFormatter()
        const entry = {
            level: LogLevel.WARN,
            message: 'Warning message',
            timestamp: new Date(),
        }

        const formatted = formatter.format(entry)
        assertEquals(formatted.includes('⚠️'), true)
        assertEquals(formatted.includes('WARN'), true)
        assertEquals(formatted.includes('Warning message'), true)
    })
})
