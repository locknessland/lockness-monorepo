/**
 * Tests for @lockness/logger - Metadata & Context
 */

import { assertEquals, assertExists } from '@std/assert'
import { Logger, MemoryTransport, TextFormatter } from '../mod.ts'

Deno.test('Logger - Metadata support', async (t) => {
    await t.step('logs with metadata', async () => {
        const memory = new MemoryTransport()
        const log = new Logger({
            transports: [memory],
            formatter: new TextFormatter(),
        })

        await log.info('User action', { userId: 123, action: 'login' })

        const logs = memory.getLogs()
        assertEquals(logs[0].metadata?.userId, 123)
        assertEquals(logs[0].metadata?.action, 'login')
    })

    await t.step('error with Error object', async () => {
        const memory = new MemoryTransport()
        const log = new Logger({
            transports: [memory],
            formatter: new TextFormatter(),
        })

        const testError = new Error('Test error')
        await log.error('Something failed', testError)

        const logs = memory.getLogs()
        assertEquals(logs[0].metadata?.error, 'Test error')
        assertExists(logs[0].metadata?.stack)
    })

    await t.step('error with metadata object', async () => {
        const memory = new MemoryTransport()
        const log = new Logger({
            transports: [memory],
            formatter: new TextFormatter(),
        })

        await log.error('Custom error', { code: 500, details: 'Server error' })

        const logs = memory.getLogs()
        assertEquals(logs[0].metadata?.code, 500)
        assertEquals(logs[0].metadata?.details, 'Server error')
    })
})

Deno.test('Logger - Context support', async (t) => {
    await t.step('creates logger with context', async () => {
        const memory = new MemoryTransport()
        const log = new Logger({
            context: 'API',
            transports: [memory],
            formatter: new TextFormatter(),
        })

        await log.info('Request received')

        const logs = memory.getLogs()
        assertEquals(logs[0].context, 'API')
    })

    await t.step('child logger inherits context', async () => {
        const memory = new MemoryTransport()
        const parentLog = new Logger({
            context: 'App',
            transports: [memory],
            formatter: new TextFormatter(),
        })

        const childLog = parentLog.child('Database')
        await childLog.info('Query executed')

        const logs = memory.getLogs()
        assertEquals(logs[0].context, 'App:Database')
    })

    await t.step('nested child contexts', async () => {
        const memory = new MemoryTransport()
        const log = new Logger({
            context: 'Server',
            transports: [memory],
            formatter: new TextFormatter(),
        })

        const apiLog = log.child('API')
        const userLog = apiLog.child('Users')

        await userLog.info('User created')

        const logs = memory.getLogs()
        assertEquals(logs[0].context, 'Server:API:Users')
    })
})
