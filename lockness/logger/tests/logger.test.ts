/**
 * Tests for @lockness/logger
 */

import { assertEquals, assertExists } from '@std/assert'
import {
    configureLogger,
    ConsoleTransport,
    createLogger,
    debug,
    error,
    fatal,
    FileTransport,
    info,
    JsonFormatter,
    Logger,
    logger,
    LogLevel,
    MemoryTransport,
    PrettyFormatter,
    TextFormatter,
    warn,
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

Deno.test('Logger - Real-world patterns', async (t) => {
    await t.step('HTTP request logging', async () => {
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

    await t.step('Error tracking with stack traces', async () => {
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

    await t.step('Service-specific loggers', async () => {
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
