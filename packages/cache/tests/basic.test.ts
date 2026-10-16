import { test } from 'node:test'
import { assertEquals } from '@std/assert'
import {
    configureCache,
    flush,
    forget,
    get,
    has,
    MemoryCacheDriver,
    set,
} from '../mod.ts'

function resetCache() {
    MemoryCacheDriver.clear()
    configureCache({
        driver: 'memory',
        ttl: 3600,
        prefix: 'test',
    })
}

test('cache basic operations', async (t) => {
    await t.test('set and get work correctly', async () => {
        resetCache()
        await set('key1', 'value1')
        const value = await get('key1')
        assertEquals(value, 'value1')
    })

    await t.test('get returns null for non-existent key', async () => {
        resetCache()
        const value = await get('nonexistent')
        assertEquals(value, null)
    })

    await t.test('has checks key existence', async () => {
        resetCache()
        await set('key1', 'value1')
        assertEquals(await has('key1'), true)
        assertEquals(await has('key2'), false)
    })

    await t.test('forget deletes a key', async () => {
        resetCache()
        await set('key1', 'value1')
        await forget('key1')
        assertEquals(await has('key1'), false)
    })

    await t.test('flush clears all cache', async () => {
        resetCache()
        await set('key1', 'value1')
        await set('key2', 'value2')
        await flush()
        assertEquals(await has('key1'), false)
        assertEquals(await has('key2'), false)
    })
})
