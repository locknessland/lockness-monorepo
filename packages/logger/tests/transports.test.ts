/**
 * Tests for @lockness/logger - Transports
 */

import { assertEquals } from '@std/assert'
import {
    ConsoleTransport,
    FileTransport,
    Logger,
    LogLevel,
    MemoryTransport,
    TextFormatter,
} from '../mod.ts'

Deno.test('Logger - Transports', async (t) => {
    await t.step('MemoryTransport stores logs', async () => {
        const transport = new MemoryTransport()

        await transport.log({
            level: LogLevel.INFO,
            message: 'Test 1',
            timestamp: new Date(),
        })

        await transport.log({
            level: LogLevel.ERROR,
            message: 'Test 2',
            timestamp: new Date(),
        })

        const logs = transport.getLogs()
        assertEquals(logs.length, 2)
        assertEquals(logs[0].message, 'Test 1')
        assertEquals(logs[1].message, 'Test 2')
    })

    await t.step('MemoryTransport can be cleared', async () => {
        const transport = new MemoryTransport()

        await transport.log({
            level: LogLevel.INFO,
            message: 'Test',
            timestamp: new Date(),
        })

        transport.clear()
        assertEquals(transport.getLogs().length, 0)
    })

    await t.step('ConsoleTransport logs to console', async () => {
        const transport = new ConsoleTransport()

        // Should not throw
        await transport.log({
            level: LogLevel.INFO,
            message: 'Console test',
            timestamp: new Date(),
        })
    })

    await t.step('FileTransport writes to file', async () => {
        const tempFile = await Deno.makeTempFile()
        const transport = new FileTransport(tempFile, new TextFormatter())

        await transport.log({
            level: LogLevel.INFO,
            message: 'File test',
            timestamp: new Date(),
        })

        await transport.close()

        const content = await Deno.readTextFile(tempFile)
        assertEquals(content.includes('File test'), true)

        await Deno.remove(tempFile)
    })

    await t.step('Multiple transports work together', async () => {
        const memory1 = new MemoryTransport()
        const memory2 = new MemoryTransport()

        const log = new Logger({
            transports: [memory1, memory2],
            formatter: new TextFormatter(),
        })

        await log.info('Broadcast message')

        assertEquals(memory1.getLogs().length, 1)
        assertEquals(memory2.getLogs().length, 1)
    })
})
