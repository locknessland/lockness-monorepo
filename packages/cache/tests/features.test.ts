import { assertEquals } from '@std/assert'
import { FakeTime } from '@std/testing/time'
import {
    cache,
    configureCache,
    forgetByTag,
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

Deno.test('cache special features', async (t) => {
    await t.step('TTL causes expiration', async () => {
        using time = new FakeTime()
        resetCache()
        await set('expiring', 'value', 0.1)
        assertEquals(await get('expiring'), 'value')
        time.tick(150) // Advance 150ms
        assertEquals(await get('expiring'), null)
    })

    await t.step('tags allow grouping cache entries', async () => {
        resetCache()
        await set('post:1', 'p1', undefined, ['posts'])
        await set('post:2', 'p2', undefined, ['posts'])
        await set('user:1', 'u1', undefined, ['users'])

        await forgetByTag('posts')
        assertEquals(await has('post:1'), false)
        assertEquals(await has('post:2'), false)
        assertEquals(await has('user:1'), true)
    })

    await t.step('CacheStore tag() creates tagged instance', async () => {
        resetCache()
        const postsCache = cache('posts')
        await postsCache.set('p1', 'v1')
        await postsCache.flush()
        assertEquals(await get('p1'), null)
    })

    await t.step('cache handles complex objects', async () => {
        resetCache()
        const obj = { id: 1, nested: { a: [1] } }
        await set('complex', obj)
        const retrieved = await get('complex')
        assertEquals(retrieved, obj)
    })

    await t.step('cache prefix is applied', async () => {
        resetCache()
        configureCache({ prefix: 'myapp' })
        await set('key', 'value')
        const keys = MemoryCacheDriver.getKeys()
        assertEquals(keys.includes('myapp:key'), true)
    })
})
