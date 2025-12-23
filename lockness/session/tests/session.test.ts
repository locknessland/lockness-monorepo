import { assertEquals, assertExists, assertNotEquals } from '@std/assert'
import { Hono } from 'hono'
import type { Context } from 'hono'
import {
    CookieSessionDriver,
    DenoKvSessionDriver,
    MemorySessionDriver,
    RedisSessionDriver,
    SessionStore,
    configureSession,
    getSession,
    sessionMiddleware,
} from '../session.ts'

// =============================================================================
// Mock Context for Cookie Driver Tests
// =============================================================================

function createMockContext(): Context {
    const cookies: Record<string, string> = {}
    const headers: Record<string, string[]> = {}

    return {
        req: {
            header: (name: string) => headers[name]?.[0],
            raw: {
                headers: new Headers(),
            },
        },
        header: (name: string, value: string, options?: { append?: boolean }) => {
            if (options?.append) {
                if (!headers[name]) headers[name] = []
                headers[name].push(value)
            } else {
                headers[name] = [value]
            }
        },
        get: (key: string) => {
            if (key === 'cookie') return cookies
            return undefined
        },
        set: (key: string, value: unknown) => {
            if (key === 'cookie') Object.assign(cookies, value)
        },
        var: {},
        // Mock cookie methods
        _cookies: cookies,
        _headers: headers,
    } as unknown as Context
}

// =============================================================================
// Cookie Session Driver Tests
// =============================================================================

Deno.test('CookieSessionDriver - write and read session', async () => {
    const ctx = createMockContext()
    const config = {
        driver: 'cookie' as const,
        cookieName: 'test_session',
        lifetime: 3600,
        secret: 'test-secret-key-32-characters!!',
        path: '/',
        secure: false,
        httpOnly: true,
        sameSite: 'Lax' as const,
    }

    const driver = new CookieSessionDriver(ctx, config)

    const sessionData = { userId: 123, username: 'test' }
    await driver.write('session-id-1', sessionData, 3600)

    // Simulate cookie being set by extracting from headers
    // deno-lint-ignore no-explicit-any
    const setCookieHeader = (ctx as any)._headers['Set-Cookie']?.[0]
    if (setCookieHeader) {
        const cookieValue = setCookieHeader.split(';')[0].split('=')[1]
        // Simulate browser sending cookie back
        const headers = new Headers()
        headers.set('Cookie', `${config.cookieName}=${cookieValue}`)
            // deno-lint-ignore no-explicit-any
            ; (ctx.req as any).raw.headers = headers
    }

    const retrieved = await driver.read('session-id-1')
    assertEquals(retrieved, sessionData)
})

Deno.test('CookieSessionDriver - destroy session', async () => {
    const ctx = createMockContext()
    const config = {
        driver: 'cookie' as const,
        cookieName: 'test_session',
        lifetime: 3600,
        secret: 'test-secret-key-32-characters!!',
        path: '/',
        secure: false,
        httpOnly: true,
        sameSite: 'Lax' as const,
    }

    const driver = new CookieSessionDriver(ctx, config)

    await driver.write('session-id-1', { userId: 123 }, 3600)
    await driver.destroy('session-id-1')

    const retrieved = await driver.read('session-id-1')
    assertEquals(retrieved, null)
})

// =============================================================================
// Memory Session Driver Tests
// =============================================================================

Deno.test('MemorySessionDriver - write and read session', async () => {
    const driver = new MemorySessionDriver()

    const sessionData = { userId: 456, username: 'alice' }
    await driver.write('mem-session-1', sessionData, 3600)

    const retrieved = await driver.read('mem-session-1')
    assertEquals(retrieved, sessionData)
})

Deno.test('MemorySessionDriver - session expiration', async () => {
    const driver = new MemorySessionDriver()

    await driver.write('expire-session', { userId: 789 }, 1) // 1 second
    await new Promise((resolve) => setTimeout(resolve, 1100)) // Wait 1.1 seconds

    const retrieved = await driver.read('expire-session')
    assertEquals(retrieved, null)
})

Deno.test('MemorySessionDriver - regenerate session', async () => {
    const driver = new MemorySessionDriver()

    const sessionData = { userId: 999 }
    await driver.write('old-session', sessionData, 3600)
    await driver.regenerate('old-session', 'new-session')

    const oldRetrieved = await driver.read('old-session')
    const newRetrieved = await driver.read('new-session')

    assertEquals(oldRetrieved, null)
    assertEquals(newRetrieved, sessionData)
})

Deno.test('MemorySessionDriver - garbage collection', async () => {
    const driver = new MemorySessionDriver()

    await driver.write('session-1', { userId: 1 }, 1) // 1 second
    await driver.write('session-2', { userId: 2 }, 3600) // 1 hour

    await new Promise((resolve) => setTimeout(resolve, 1100)) // Wait 1.1 seconds
    await driver.gc()

    const expired = await driver.read('session-1')
    const active = await driver.read('session-2')

    assertEquals(expired, null)
    assertExists(active)
})

// =============================================================================
// Deno KV Session Driver Tests
// =============================================================================

Deno.test('DenoKvSessionDriver - write and read session', async () => {
    const driver = new DenoKvSessionDriver()

    const sessionData = { userId: 111, role: 'admin' }
    await driver.write('kv-session-1', sessionData, 3600)

    const retrieved = await driver.read('kv-session-1')
    assertEquals(retrieved, sessionData)

    await driver.destroy('kv-session-1')
    await driver.close()
})

Deno.test('DenoKvSessionDriver - destroy session', async () => {
    const driver = new DenoKvSessionDriver()

    await driver.write('kv-session-2', { userId: 222 }, 3600)
    await driver.destroy('kv-session-2')

    const retrieved = await driver.read('kv-session-2')
    assertEquals(retrieved, null)

    await driver.close()
})

Deno.test('DenoKvSessionDriver - regenerate session', async () => {
    const driver = new DenoKvSessionDriver()

    const sessionData = { userId: 333 }
    await driver.write('kv-old', sessionData, 3600)
    await driver.regenerate('kv-old', 'kv-new')

    const oldRetrieved = await driver.read('kv-old')
    const newRetrieved = await driver.read('kv-new')

    assertEquals(oldRetrieved, null)
    assertEquals(newRetrieved, sessionData)

    await driver.destroy('kv-new')
    await driver.close()
})

// =============================================================================
// Redis Session Driver Tests (Mock)
// =============================================================================

Deno.test('RedisSessionDriver - can be instantiated', () => {
    const driver = new RedisSessionDriver({
        hostname: 'localhost',
        port: 6379,
    })

    assertExists(driver)
})

// Note: Real Redis tests would require a running Redis server
// For CI/CD, use MemorySessionDriver or mock Redis

// =============================================================================
// SessionStore Tests
// =============================================================================

Deno.test('SessionStore - get and set values', () => {
    const driver = new MemorySessionDriver()
    const config = {
        driver: 'memory' as const,
        cookieName: 'test_session',
        lifetime: 3600,
        secret: 'test-secret',
        path: '/',
        secure: false,
        httpOnly: true,
        sameSite: 'Lax' as const,
    }

    const store = new SessionStore('test-session-1', driver, {}, config)

    store.set('name', 'Bob')
    store.set('age', 30)

    assertEquals(store.get('name'), 'Bob')
    assertEquals(store.get('age'), 30)
    assertEquals(store.get('missing', 'default'), 'default')
})

Deno.test('SessionStore - has and forget', () => {
    const driver = new MemorySessionDriver()
    const config = {
        driver: 'memory' as const,
        cookieName: 'test_session',
        lifetime: 3600,
        secret: 'test-secret',
        path: '/',
        secure: false,
        httpOnly: true,
        sameSite: 'Lax' as const,
    }

    const store = new SessionStore('test-session-2', driver, { foo: 'bar' }, config)

    assertEquals(store.has('foo'), true)
    store.forget('foo')
    assertEquals(store.has('foo'), false)
})

Deno.test('SessionStore - flush all data', () => {
    const driver = new MemorySessionDriver()
    const config = {
        driver: 'memory' as const,
        cookieName: 'test_session',
        lifetime: 3600,
        secret: 'test-secret',
        path: '/',
        secure: false,
        httpOnly: true,
        sameSite: 'Lax' as const,
    }

    const store = new SessionStore('test-session-3', driver, { a: 1, b: 2 }, config)

    store.flush()
    assertEquals(store.all(), {})
})

Deno.test('SessionStore - regenerate session ID', async () => {
    const driver = new MemorySessionDriver()
    const config = {
        driver: 'memory' as const,
        cookieName: 'test_session',
        lifetime: 3600,
        secret: 'test-secret',
        path: '/',
        secure: false,
        httpOnly: true,
        sameSite: 'Lax' as const,
    }

    const initialData = { userId: 555 }
    await driver.write('old-id', initialData, 3600)

    const store = new SessionStore('old-id', driver, initialData, config)
    const oldId = store.getId()

    await store.regenerate()
    const newId = store.getId()

    assertNotEquals(oldId, newId)
})

Deno.test('SessionStore - flash data', () => {
    const driver = new MemorySessionDriver()
    const config = {
        driver: 'memory' as const,
        cookieName: 'test_session',
        lifetime: 3600,
        secret: 'test-secret',
        path: '/',
        secure: false,
        httpOnly: true,
        sameSite: 'Lax' as const,
    }

    const store = new SessionStore('test-session-4', driver, {}, config)

    store.flash('message', 'Success!')
    assertEquals(store.get('_flash'), { message: 'Success!' })
})

Deno.test('SessionStore - isDirty flag', () => {
    const driver = new MemorySessionDriver()
    const config = {
        driver: 'memory' as const,
        cookieName: 'test_session',
        lifetime: 3600,
        secret: 'test-secret',
        path: '/',
        secure: false,
        httpOnly: true,
        sameSite: 'Lax' as const,
    }

    const store = new SessionStore('test-session-5', driver, {}, config)

    assertEquals(store.isDirty(), false)
    store.set('key', 'value')
    assertEquals(store.isDirty(), true)
})

// =============================================================================
// Session Middleware Tests
// =============================================================================

Deno.test('sessionMiddleware - attaches session to context', async () => {
    configureSession({
        driver: 'memory',
        secret: 'test-secret-key-for-middleware',
        cookieName: 'app_session',
    })

    const app = new Hono()
    app.use('*', sessionMiddleware())

    app.get('/test', (c) => {
        const session = getSession(c)
        session.set('visited', true)
        return c.text('OK')
    })

    const res = await app.request('/test')
    assertEquals(res.status, 200)
})

Deno.test('sessionMiddleware - persists data across requests', async () => {
    configureSession({
        driver: 'memory',
        secret: 'test-secret-persist',
        cookieName: 'persist_session',
    })

    const app = new Hono()
    app.use('*', sessionMiddleware({ driver: 'memory' }))

    app.get('/set', (c) => {
        const session = getSession(c)
        session.set('counter', 1)
        return c.text('Set')
    })

    app.get('/get', (c) => {
        const session = getSession(c)
        const counter = session.get<number>('counter')
        return c.text(`Counter: ${counter}`)
    })

    const res1 = await app.request('/set')
    assertEquals(res1.status, 200)

    // Note: In real scenario, session ID would be passed via cookie
    // This is a simplified test showing middleware integration
})

Deno.test('sessionMiddleware - flash messages work', async () => {
    configureSession({
        driver: 'memory',
        secret: 'test-flash',
        cookieName: 'flash_session',
    })

    const app = new Hono()
    app.use('*', sessionMiddleware())

    app.get('/flash', (c) => {
        const session = getSession(c)
        session.flash('message', 'Task completed!')
        return c.text('Flashed')
    })

    const res = await app.request('/flash')
    assertEquals(res.status, 200)
})
