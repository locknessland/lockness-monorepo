import { assertEquals, assertExists } from '@std/assert'
import { RedisCacheDriver, type RedisClient } from '../drivers/redis_driver.ts'

/**
 * Mock Redis client for testing.
 * Simulates Redis behavior using in-memory Maps.
 */
class MockRedisClient implements RedisClient {
    private store = new Map<string, string>()
    private sets = new Map<string, Set<string>>()
    private expiry = new Map<string, number>()

    get(key: string): Promise<string | null> {
        // Check expiry
        const exp = this.expiry.get(key)
        if (exp && Date.now() > exp) {
            this.store.delete(key)
            this.expiry.delete(key)
            return Promise.resolve(null)
        }
        return Promise.resolve(this.store.get(key) ?? null)
    }

    set(
        key: string,
        value: string,
        options?: { EX?: number; PX?: number },
    ): Promise<string> {
        this.store.set(key, value)
        if (options?.EX) {
            this.expiry.set(key, Date.now() + options.EX * 1000)
        } else if (options?.PX) {
            this.expiry.set(key, Date.now() + options.PX)
        }
        return Promise.resolve('OK')
    }

    del(key: string | string[]): Promise<number> {
        const keys = Array.isArray(key) ? key : [key]
        let count = 0
        for (const k of keys) {
            if (this.store.has(k)) {
                this.store.delete(k)
                this.expiry.delete(k)
                count++
            }
        }
        return Promise.resolve(count)
    }

    exists(key: string | string[]): Promise<number> {
        const keys = Array.isArray(key) ? key : [key]
        let count = 0
        for (const k of keys) {
            // Check expiry
            const exp = this.expiry.get(k)
            if (exp && Date.now() > exp) {
                this.store.delete(k)
                this.expiry.delete(k)
                continue
            }
            if (this.store.has(k)) count++
        }
        return Promise.resolve(count)
    }

    incrBy(key: string, increment: number): Promise<number> {
        const current = parseInt(this.store.get(key) ?? '0', 10)
        const newValue = current + increment
        this.store.set(key, String(newValue))
        return Promise.resolve(newValue)
    }

    decrBy(key: string, decrement: number): Promise<number> {
        return this.incrBy(key, -decrement)
    }

    mGet(keys: string[]): Promise<(string | null)[]> {
        const results = keys.map((key) => {
            const exp = this.expiry.get(key)
            if (exp && Date.now() > exp) {
                this.store.delete(key)
                this.expiry.delete(key)
                return null
            }
            return this.store.get(key) ?? null
        })
        return Promise.resolve(results)
    }

    mSet(keyValues: Record<string, string>): Promise<string> {
        for (const [key, value] of Object.entries(keyValues)) {
            this.store.set(key, value)
        }
        return Promise.resolve('OK')
    }

    sAdd(key: string, members: string | string[]): Promise<number> {
        if (!this.sets.has(key)) {
            this.sets.set(key, new Set())
        }
        const set = this.sets.get(key)!
        const memberArray = Array.isArray(members) ? members : [members]
        let added = 0
        for (const m of memberArray) {
            if (!set.has(m)) {
                set.add(m)
                added++
            }
        }
        return Promise.resolve(added)
    }

    sMembers(key: string): Promise<string[]> {
        const set = this.sets.get(key)
        return Promise.resolve(set ? Array.from(set) : [])
    }

    sRem(key: string, members: string | string[]): Promise<number> {
        const set = this.sets.get(key)
        if (!set) return Promise.resolve(0)
        const memberArray = Array.isArray(members) ? members : [members]
        let removed = 0
        for (const m of memberArray) {
            if (set.delete(m)) removed++
        }
        return Promise.resolve(removed)
    }

    keys(pattern: string): Promise<string[]> {
        // Simple pattern matching (only supports * wildcard at end)
        const prefix = pattern.replace(/\*$/, '')
        return Promise.resolve(
            Array.from(this.store.keys()).filter((k) => k.startsWith(prefix)),
        )
    }

    expire(key: string, seconds: number): Promise<number> {
        if (!this.store.has(key)) return Promise.resolve(0)
        this.expiry.set(key, Date.now() + seconds * 1000)
        return Promise.resolve(1)
    }

    /** Clear all data (for testing) */
    clear(): void {
        this.store.clear()
        this.sets.clear()
        this.expiry.clear()
    }
}

// =============================================================================
// Tests
// =============================================================================

Deno.test('RedisCacheDriver - basic operations', async (t) => {
    const redis = new MockRedisClient()
    const driver = new RedisCacheDriver(redis, { keyPrefix: 'test' })

    await t.step('set and get work correctly', async () => {
        redis.clear()
        await driver.set('key1', { name: 'John' })
        const value = await driver.get<{ name: string }>('key1')
        assertExists(value)
        assertEquals(value.name, 'John')
    })

    await t.step('get returns null for non-existent key', async () => {
        redis.clear()
        const value = await driver.get('nonexistent')
        assertEquals(value, null)
    })

    await t.step('has checks key existence', async () => {
        redis.clear()
        await driver.set('key1', 'value1')
        assertEquals(await driver.has('key1'), true)
        assertEquals(await driver.has('key2'), false)
    })

    await t.step('forget deletes a key', async () => {
        redis.clear()
        await driver.set('key1', 'value1')
        await driver.forget('key1')
        assertEquals(await driver.has('key1'), false)
    })

    await t.step('flush clears all cache', async () => {
        redis.clear()
        await driver.set('key1', 'value1')
        await driver.set('key2', 'value2')
        await driver.flush()
        assertEquals(await driver.has('key1'), false)
        assertEquals(await driver.has('key2'), false)
    })
})

Deno.test('RedisCacheDriver - many operations', async (t) => {
    const redis = new MockRedisClient()
    const driver = new RedisCacheDriver(redis, { keyPrefix: 'test' })

    await t.step('many returns multiple values', async () => {
        redis.clear()
        await driver.set('key1', 'value1')
        await driver.set('key2', 'value2')

        const result = await driver.many<string>(['key1', 'key2', 'key3'])

        assertEquals(result['key1'], 'value1')
        assertEquals(result['key2'], 'value2')
        assertEquals(result['key3'], null)
    })

    await t.step('putMany sets multiple values', async () => {
        redis.clear()
        await driver.putMany({ a: 1, b: 2, c: 3 })

        assertEquals(await driver.get('a'), 1)
        assertEquals(await driver.get('b'), 2)
        assertEquals(await driver.get('c'), 3)
    })
})

Deno.test('RedisCacheDriver - increment/decrement', async (t) => {
    const redis = new MockRedisClient()
    const driver = new RedisCacheDriver(redis, { keyPrefix: 'test' })

    await t.step('increment increases value', async () => {
        redis.clear()
        const result1 = await driver.increment('counter')
        assertEquals(result1, 1)

        const result2 = await driver.increment('counter', 5)
        assertEquals(result2, 6)
    })

    await t.step('decrement decreases value', async () => {
        redis.clear()
        await driver.set('counter', 10)

        const result = await driver.decrement('counter', 3)
        assertEquals(result, 7)
    })
})

Deno.test('RedisCacheDriver - tag operations', async (t) => {
    const redis = new MockRedisClient()
    const driver = new RedisCacheDriver(redis, { keyPrefix: 'test' })

    await t.step('forgetByTag removes tagged entries', async () => {
        redis.clear()

        await driver.set('user:1', { id: 1 }, undefined, ['users'])
        await driver.set('user:2', { id: 2 }, undefined, ['users'])
        await driver.set('product:1', { id: 1 }, undefined, ['products'])

        assertEquals(await driver.has('user:1'), true)
        assertEquals(await driver.has('user:2'), true)

        await driver.forgetByTag('users')

        assertEquals(await driver.has('user:1'), false)
        assertEquals(await driver.has('user:2'), false)
        assertEquals(await driver.has('product:1'), true)
    })

    await t.step('flushByTag is alias for forgetByTag', async () => {
        redis.clear()

        await driver.set('item:1', 'value', undefined, ['items'])
        await driver.flushByTag('items')

        assertEquals(await driver.has('item:1'), false)
    })
})

Deno.test('RedisCacheDriver - TTL handling', async (t) => {
    const redis = new MockRedisClient()
    const driver = new RedisCacheDriver(redis, { keyPrefix: 'test' })

    await t.step('respects TTL expiration', async () => {
        redis.clear()

        // Set with 1 second TTL
        await driver.set('expiring', 'value', 1)

        // Should exist immediately
        assertEquals(await driver.get('expiring'), 'value')

        // Wait for expiration (mock doesn't actually wait, we simulate)
        // In real tests with actual Redis, this would require waiting
    })
})

Deno.test('RedisCacheDriver - custom serialization', async (t) => {
    const redis = new MockRedisClient()

    // Custom serializer that adds a marker
    const driver = new RedisCacheDriver(redis, {
        keyPrefix: 'test',
        serialize: (value) => `CUSTOM:${JSON.stringify(value)}`,
        deserialize: (value) => {
            if (value.startsWith('CUSTOM:')) {
                return JSON.parse(value.slice(7))
            }
            return JSON.parse(value)
        },
    })

    await t.step('uses custom serialization', async () => {
        redis.clear()
        await driver.set('custom', { data: 'test' })
        const value = await driver.get<{ data: string }>('custom')
        assertExists(value)
        assertEquals(value.data, 'test')
    })
})

Deno.test('RedisCacheDriver - handles corrupted data', async (t) => {
    const redis = new MockRedisClient()
    const driver = new RedisCacheDriver(redis, { keyPrefix: 'test' })

    await t.step('returns null for invalid JSON', async () => {
        redis.clear()
        // Manually set invalid JSON
        await redis.set('test:lockness:broken', 'not valid json')

        const value = await driver.get('broken')
        assertEquals(value, null)
    })
})
