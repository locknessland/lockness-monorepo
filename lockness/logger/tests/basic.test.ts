/**
 * Tests for @lockness/logger - Basic Logging & Levels
 */

import { assertEquals, assertExists } from '@std/assert'
import {
    Logger,
    LogLevel,
    MemoryTransport,
    TextFormatter,
} from '../mod.ts'

Deno.test('Logger - Basic logging', async (t) => {
    await t.step('creates logger with default config', () => {
        const log = new Logger()
        assertExists(log)
        assertEquals(log.getLevel(), LogLevel.INFO)
    })

    await t.step('creates logger with custom level', () => {
        const log = new Logger({ level: LogLevel.DEBUG })
        assertEquals(log.getLevel(), LogLevel.DEBUG)
    })

    await t.step('setLevel changes log level', () => {
        const log = new Logger()
        log.setLevel(LogLevel.ERROR)
        assertEquals(log.getLevel(), LogLevel.ERROR)
    })

    await t.step('logs to memory transport', async () => {
        const memory = new MemoryTransport()
        const log = new Logger({
            transports: [memory],
            formatter: new TextFormatter(),
        })

        await log.info('Test message')

        const logs = memory.getLogs()
        assertEquals(logs.length, 1)
        assertEquals(logs[0].level, LogLevel.INFO)
    })

    await t.step('respects log level threshold', async () => {
        const memory = new MemoryTransport()
        const log = new Logger({
            level: LogLevel.WARN,
            transports: [memory],
            formatter: new TextFormatter(),
        })

        await log.debug('Debug message')
        await log.info('Info message')
        await log.warn('Warn message')
        await log.error('Error message')

        const logs = memory.getLogs()
        assertEquals(logs.length, 2) // Only WARN and ERROR
        assertEquals(logs[0].level, LogLevel.WARN)
        assertEquals(logs[1].level, LogLevel.ERROR)
    })
})

Deno.test('Logger - All log levels', async (t) => {
    const memory = new MemoryTransport()
    const log = new Logger({
        level: LogLevel.DEBUG,
        transports: [memory],
        formatter: new TextFormatter(),
    })

    await t.step('debug level', async () => {
        await log.debug('Debug message')
        const logs = memory.getLogs()
        assertEquals(logs[logs.length - 1].level, LogLevel.DEBUG)
    })

    await t.step('info level', async () => {
        await log.info('Info message')
        const logs = memory.getLogs()
        assertEquals(logs[logs.length - 1].level, LogLevel.INFO)
    })

    await t.step('warn level', async () => {
        await log.warn('Warn message')
        const logs = memory.getLogs()
        assertEquals(logs[logs.length - 1].level, LogLevel.WARN)
    })

    await t.step('error level', async () => {
        await log.error('Error message')
        const logs = memory.getLogs()
        assertEquals(logs[logs.length - 1].level, LogLevel.ERROR)
    })

    await t.step('fatal level', async () => {
        await log.fatal('Fatal message')
        const logs = memory.getLogs()
        assertEquals(logs[logs.length - 1].level, LogLevel.FATAL)
    })
})
