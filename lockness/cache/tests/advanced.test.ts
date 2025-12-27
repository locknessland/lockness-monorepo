import { assertEquals } from '@std/assert'
import {
    add,
    configureCache,
    decrement,
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
} from '../mod.ts'

function resetCache() {
    MemoryCacheDriver.clear()
    configureCache({
        driver: 'memory',
        ttl: 3600,
        prefix: 'test',
    })
}

Deno.test('cache advanced operations', async (t) => {
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
        assertEquals(callCount, 1)
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

    await t.step('put is an alias for set', async () => {
        resetCache()
        await put('key', 'value')
        assertEquals(await get('key'), 'value')
    })

    await t.step('pull gets and deletes', async () => {
        resetCache()
        await set('key', 'value')
        const value = await pull('key')
        assertEquals(value, 'value')
        assertEquals(await has('key'), false)
    })

    await t.step('add only sets if key does not exist', async () => {
        resetCache()
        const added1 = await add('key', 'value1')
        const added2 = await add('key', 'value2')
        assertEquals(added1, true)
        assertEquals(added2, false)
    })

    await t.step('many gets multiple keys', async () => {
        resetCache()
        await set('key1', 'value1')
        await set('key2', 'value2')
        const values = await many(['key1', 'key2', 'key4'])
        assertEquals(values, {
            key1: 'value1',
            key2: 'value2',
            key4: null,
        })
    })

    await t.step('putMany sets multiple keys', async () => {
        resetCache()
        await putMany({ key1: 'value1', key2: 'value2' })
        assertEquals(await get('key1'), 'value1')
        assertEquals(await get('key2'), 'value2')
    })

    await t.step('increment and decrement', async () => {
        resetCache()
        await set('counter', 5)
        assertEquals(await increment('counter'), 6)
        assertEquals(await decrement('counter', 2), 4)
    })
})
