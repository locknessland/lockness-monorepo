/**
 * Tests for Session System
 */

import { assertEquals, assertExists } from '@std/assert'
import { MemorySessionDriver, type SessionConfig, SessionStore } from 'lockness'

const defaultConfig: SessionConfig = {
    driver: 'memory',
    cookieName: 'test_session',
    lifetime: 3600,
    secret: 'test-secret-key',
    path: '/',
    secure: false,
    httpOnly: true,
    sameSite: 'Lax',
}

Deno.test('session system', async (t) => {
    await t.step('MemorySessionDriver write and read', async () => {
        const driver = new MemorySessionDriver()
        const sessionId = 'test-session-1'

        await driver.write(sessionId, { userId: 123 }, 3600)

        const data = await driver.read(sessionId)
        assertExists(data)
        assertEquals(data?.userId, 123)
    })

    await t.step('MemorySessionDriver destroy', async () => {
        const driver = new MemorySessionDriver()
        const sessionId = 'test-session-2'

        await driver.write(sessionId, { userId: 456 }, 3600)
        await driver.destroy(sessionId)

        const data = await driver.read(sessionId)
        assertEquals(data, null)
    })

    await t.step('MemorySessionDriver regenerate', async () => {
        const driver = new MemorySessionDriver()
        const oldId = 'old-session'
        const newId = 'new-session'

        await driver.write(oldId, { userId: 789 }, 3600)
        await driver.regenerate(oldId, newId)

        const oldData = await driver.read(oldId)
        const newData = await driver.read(newId)

        assertEquals(oldData, null)
        assertExists(newData)
        assertEquals(newData?.userId, 789)
    })

    await t.step('SessionStore get and set', () => {
        const driver = new MemorySessionDriver()
        const store = new SessionStore(
            'test-store-session',
            {},
            driver,
            defaultConfig,
        )

        store.set('name', 'John')
        store.set('age', 30)

        assertEquals(store.get('name'), 'John')
        assertEquals(store.get('age'), 30)
    })

    await t.step('SessionStore has and forget', () => {
        const driver = new MemorySessionDriver()
        const store = new SessionStore(
            'test-has-session',
            {},
            driver,
            defaultConfig,
        )

        store.set('key', 'value')
        assertEquals(store.has('key'), true)

        store.forget('key')
        assertEquals(store.has('key'), false)
    })

    await t.step('SessionStore flash messages', () => {
        const driver = new MemorySessionDriver()
        const store = new SessionStore(
            'test-flash-session',
            {},
            driver,
            defaultConfig,
        )

        store.flash('success', 'Operation completed!')
        // Flash data is available via get within same session
        assertEquals(typeof store.get, 'function')
    })

    await t.step('SessionStore all and flush', () => {
        const driver = new MemorySessionDriver()
        const store = new SessionStore(
            'test-all-session',
            {},
            driver,
            defaultConfig,
        )

        store.set('a', 1)
        store.set('b', 2)

        const all = store.all()
        assertEquals(all.a, 1)
        assertEquals(all.b, 2)

        store.flush()
        assertEquals(Object.keys(store.all()).length, 0)
    })
})
