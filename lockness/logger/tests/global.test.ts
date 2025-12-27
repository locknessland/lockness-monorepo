/**
 * Tests for @lockness/logger - Global instance & Isolated instances
 */

import { assertEquals, assertExists } from '@std/assert'
import {
    configureLogger,
    createLogger,
    debug,
    error,
    fatal,
    info,
    logger,
    LogLevel,
    MemoryTransport,
    TextFormatter,
    warn,
} from '../mod.ts'

Deno.test('Logger - Global instance', async (t) => {
    await t.step('configureLogger sets global logger', () => {
        const log = configureLogger({ level: LogLevel.DEBUG })
        assertExists(log)
        assertEquals(logger(), log)
    })

    await t.step('logger() returns global instance', () => {
        const log1 = logger()
        const log2 = logger()
        assertEquals(log1, log2)
    })

    await t.step('global helper functions work', async () => {
        const memory = new MemoryTransport()
        configureLogger({
            level: LogLevel.DEBUG,
            transports: [memory],
            formatter: new TextFormatter(),
        })

        await debug('Debug message')
        await info('Info message')
        await warn('Warn message')
        await error('Error message')
        await fatal('Fatal message')

        const logs = memory.getLogs()
        assertEquals(logs.length >= 5, true)
    })
})

Deno.test('Logger - createLogger creates isolated instances', async (t) => {
    await t.step('creates independent logger', async () => {
        const memory1 = new MemoryTransport()
        const memory2 = new MemoryTransport()

        const log1 = createLogger({
            transports: [memory1],
            formatter: new TextFormatter(),
        })

        const log2 = createLogger({
            transports: [memory2],
            formatter: new TextFormatter(),
        })

        await log1.info('Message 1')
        await log2.info('Message 2')

        assertEquals(memory1.getLogs().length, 1)
        assertEquals(memory2.getLogs().length, 1)
        assertEquals(memory1.getLogs()[0].message.includes('Message 1'), true)
        assertEquals(memory2.getLogs()[0].message.includes('Message 2'), true)
    })
})
