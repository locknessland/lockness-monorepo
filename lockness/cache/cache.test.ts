/**
 * Tests for Cache System
 */

import { assertEquals, type assertExists } from '@std/assert'
import {
    add,
    cache,
    configureCache,
    decrement,
    flush,
    flushByTag,
    forever,
    forget,
    forgetByTag,
    get,
    has,
    increment,
    many,
    MemoryCacheDriver,
    pull,
    put,
    putMany,
    remember,
    rememberForever,
    set,
} from './cache.ts'

// Reset before each test
function resetCache() {
    MemoryCacheDriver.clear()
    configureCache({
        driver: 'memory',
        ttl: 3600,
        prefix: 'test',
    })
}

Deno.test('cache system', async (t) => {
    await t.step('configureCache sets up cache config', () => {
        configureCache({
            driver: 'memory',
            ttl: 7200,
            prefix: 'myapp',
        })
    })

    await t.step('set and get work correctly', async () => {
        resetCache()
        await set('key1', 'value1')
        const value = await get('key1')
        assertEquals(value, 'value1')
    })

    await t.step('get returns null for non-existent key', async () => {
        resetCache()
        const value = await get('nonexistent')
        assertEquals(value, null)
    })

    await t.step('has checks key existence', async () => {
        resetCache()
        await set('key1', 'value1')
        assertEquals(await has('key1'), true)
        assertEquals(await has('key2'), false)
    })

    await t.step('forget deletes a key', async () => {
        resetCache()
        await set('key1', 'value1')
        await forget('key1')
        assertEquals(await has('key1'), false)
    })

    await t.step('flush clears all cache', async () => {
        resetCache()
        await set('key1', 'value1')
        await set('key2', 'value2')
        await flush()
        assertEquals(await has('key1'), false)
        assertEquals(await has('key2'), false)
    })

    await t.step('remember caches callback result', async () => {
        resetCache()
        let callCount = 0

        const result1 = await remember('expensive', () => {
            callCount++
            return 'computed value'
        })

        const result2 = await remember('expensive', () => {
            callCount++
            return 'computed value'
        })

        assertEquals(result1, 'computed value')
        assertEquals(result2, 'computed value')
        assertEquals(callCount, 1) // Callback called only once
    })

    await t.step('remember supports async callbacks', async () => {
        resetCache()

        const result = await remember('async', async () => {
            await new Promise((resolve) => setTimeout(resolve, 10))
            return 'async value'
        })

        assertEquals(result, 'async value')
    })

    await t.step('rememberForever caches without expiration', async () => {
        resetCache()

        const result = await rememberForever('forever', () => 'permanent')

        assertEquals(result, 'permanent')
        assertEquals(await get('forever'), 'permanent')
    })

    await t.step('TTL causes expiration', async () => {
        resetCache()
        await set('expiring', 'value', 0.1) // 0.1 second
        assertEquals(await get('expiring'), 'value')

        // Wait for expiration
        await new Promise((resolve) => setTimeout(resolve, 150))

        assertEquals(await get('expiring'), null)
    })

    await t.step('put is an alias for set', async () => {
        resetCache()
        await put('key', 'value')
        assertEquals(await get('key'), 'value')
    })

    await t.step('forever stores without expiration', async () => {
        resetCache()
        await forever('permanent', 'forever')
        assertEquals(await get('permanent'), 'forever')
    })

    await t.step('pull gets and deletes', async () => {
        resetCache()
        await set('key', 'value')
        const value = await pull('key')
        assertEquals(value, 'value')
        assertEquals(await has('key'), false)
    })

    await t.step('pull returns null for non-existent key', async () => {
        resetCache()
        const value = await pull('nonexistent')
        assertEquals(value, null)
    })

    await t.step('add only sets if key does not exist', async () => {
        resetCache()
        const added1 = await add('key', 'value1')
        const added2 = await add('key', 'value2')

        assertEquals(added1, true)
        assertEquals(added2, false)
        assertEquals(await get('key'), 'value1')
    })

    await t.step('many gets multiple keys', async () => {
        resetCache()
        await set('key1', 'value1')
        await set('key2', 'value2')
        await set('key3', 'value3')

        const values = await many(['key1', 'key2', 'key4'])

        assertEquals(values, {
            key1: 'value1',
            key2: 'value2',
            key4: null,
        })
    })

    await t.step('putMany sets multiple keys', async () => {
        resetCache()
        await putMany({
            key1: 'value1',
            key2: 'value2',
            key3: 'value3',
        })

        assertEquals(await get('key1'), 'value1')
        assertEquals(await get('key2'), 'value2')
        assertEquals(await get('key3'), 'value3')
    })

    await t.step('increment increases numeric value', async () => {
        resetCache()
        await set('counter', 5)

        const val1 = await increment('counter')
        const val2 = await increment('counter', 3)

        assertEquals(val1, 6)
        assertEquals(val2, 9)
    })

    await t.step('increment works on non-existent key', async () => {
        resetCache()
        const val = await increment('newcounter', 10)
        assertEquals(val, 10)
    })

    await t.step('decrement decreases numeric value', async () => {
        resetCache()
        await set('counter', 10)

        const val1 = await decrement('counter')
        const val2 = await decrement('counter', 3)

        assertEquals(val1, 9)
        assertEquals(val2, 6)
    })

    await t.step('tags allow grouping cache entries', async () => {
        resetCache()
        await set('post:1', { title: 'Post 1' }, undefined, ['posts'])
        await set('post:2', { title: 'Post 2' }, undefined, ['posts'])
        await set('user:1', { name: 'User 1' }, undefined, ['users'])

        await forgetByTag('posts')

        assertEquals(await has('post:1'), false)
        assertEquals(await has('post:2'), false)
        assertEquals(await has('user:1'), true)
    })

    await t.step('flushByTag is alias for forgetByTag', async () => {
        resetCache()
        await set('item:1', 'value', undefined, ['items'])

        await flushByTag('items')

        assertEquals(await has('item:1'), false)
    })

    await t.step('CacheStore tag() creates tagged instance', async () => {
        resetCache()

        const postsCache = cache('posts')
        await postsCache.set('post:1', { title: 'Post 1' })
        await postsCache.set('post:2', { title: 'Post 2' })

        const usersCache = cache('users')
        await usersCache.set('user:1', { name: 'User 1' })

        await postsCache.flush()

        assertEquals(await get('post:1'), null)
        assertEquals(await get('post:2'), null)
        assertEquals(await get('user:1'), { name: 'User 1' })
    })

    await t.step('CacheStore remember works with tags', async () => {
        resetCache()
        let callCount = 0

        const store = cache('expensive')

        const result1 = await store.remember('calc', () => {
            callCount++
            return 'result'
        })

        const result2 = await store.remember('calc', () => {
            callCount++
            return 'result'
        })

        assertEquals(result1, 'result')
        assertEquals(result2, 'result')
        assertEquals(callCount, 1)

        await store.flush()
        assertEquals(await get('calc'), null)
    })

    await t.step('cache handles complex objects', async () => {
        resetCache()

        const obj = {
            id: 1,
            name: 'Test',
            nested: {
                array: [1, 2, 3],
                date: new Date().toISOString(),
            },
        }

        await set('complex', obj)
        const retrieved = await get('complex')

        assertEquals(retrieved, obj)
    })

    await t.step('cache prefix is applied to keys', async () => {
        resetCache()
        configureCache({ prefix: 'myapp' })

        await set('key', 'value')
        const keys = MemoryCacheDriver.getKeys()

        assertEquals(keys.length, 1)
        assertEquals(keys[0], 'myapp:key')
    })
})
