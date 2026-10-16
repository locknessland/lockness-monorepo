/**
 * Tests for @lockness/session - SessionStore
 */

import { test } from 'node:test'
import { assertEquals, assertNotEquals } from '@std/assert'
import { MemorySessionDriver, SessionStore } from '../mod.ts'

test('SessionStore - get and set values', () => {
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

test('SessionStore - has and forget', () => {
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

    const store = new SessionStore(
        'test-session-2',
        driver,
        { foo: 'bar' },
        config,
    )

    assertEquals(store.has('foo'), true)
    store.forget('foo')
    assertEquals(store.has('foo'), false)
})

test('SessionStore - flush all data', () => {
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

    const store = new SessionStore(
        'test-session-3',
        driver,
        { a: 1, b: 2 },
        config,
    )

    store.flush()
    assertEquals(store.all(), {})
})

test('SessionStore - regenerate session ID', async () => {
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

test('SessionStore - flash data', () => {
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

test('SessionStore - isDirty flag', () => {
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
