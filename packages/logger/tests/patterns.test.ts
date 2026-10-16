/**
 * Tests for @lockness/logger - Real-world patterns
 */

import { test } from 'node:test'
import { assertEquals, assertExists } from '@std/assert'
import {
    JsonFormatter,
    Logger,
    MemoryTransport,
    TextFormatter,
} from '../mod.ts'

test('Logger - Real-world patterns', async (t) => {
    await t.test('HTTP request logging', async () => {
        const memory = new MemoryTransport()
        const log = new Logger({
            context: 'HTTP',
            transports: [memory],
            formatter: new JsonFormatter(),
        })

        await log.info('Request received', {
            method: 'GET',
            path: '/api/users',
            ip: '127.0.0.1',
        })

        await log.info('Response sent', {
            status: 200,
            duration: 45,
        })

        const logs = memory.getLogs()
        assertEquals(logs.length, 2)
        assertEquals(logs[0].metadata?.method, 'GET')
        assertEquals(logs[1].metadata?.status, 200)
    })

    await t.test('Error tracking with stack traces', async () => {
        const memory = new MemoryTransport()
        const log = new Logger({
            transports: [memory],
            formatter: new TextFormatter(),
        })

        try {
            throw new Error('Database connection failed')
        } catch (err) {
            await log.error('Failed to connect to database', err as Error)
        }

        const logs = memory.getLogs()
        assertEquals(logs[0].metadata?.error, 'Database connection failed')
        assertExists(logs[0].metadata?.stack)
    })

    await t.test('Service-specific loggers', async () => {
        const memory = new MemoryTransport()
        const appLog = new Logger({
            context: 'App',
            transports: [memory],
            formatter: new TextFormatter(),
        })

        const dbLog = appLog.child('Database')
        const cacheLog = appLog.child('Cache')

        await dbLog.info('Query executed')
        await cacheLog.info('Cache hit')

        const logs = memory.getLogs()
        assertEquals(logs[0].context, 'App:Database')
        assertEquals(logs[1].context, 'App:Cache')
    })
})
