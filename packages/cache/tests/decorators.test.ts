/**
 * Tests for the `@Cached` and `@CacheInvalidate` decorators.
 *
 * Every test counts how many times the underlying method actually ran. That
 * number is the only honest evidence of a hit: an assertion on the returned
 * value alone passes just as happily when the cache is doing nothing.
 */

// The decorators require an async method by design, so the fixtures below are
// async without awaiting anything. Same convention as compose.test.ts.
// deno-lint-ignore-file require-await

import { assertEquals, assertRejects, assertThrows } from '@std/assert'
import {
    Cached,
    CacheInvalidate,
    configureCache,
    get,
    MemoryCacheDriver,
} from '../mod.ts'

function resetCache() {
    MemoryCacheDriver.clear()
    configureCache({ driver: 'memory', ttl: 3600, prefix: 'test' })
}

// ============================================================================
// Hit / miss
// ============================================================================

Deno.test('Cached - second call with the same arguments does not run the method', async () => {
    resetCache()
    let calls = 0

    class Service {
        @Cached('5m')
        async compute(n: number) {
            calls++
            return n * 2
        }
    }
    const s = new Service()

    assertEquals(await s.compute(21), 42)
    assertEquals(await s.compute(21), 42)
    assertEquals(calls, 1, 'the method ran once; the second call was a hit')
})

Deno.test('Cached - different arguments are cached separately', async () => {
    resetCache()
    let calls = 0

    class Service {
        @Cached('5m')
        async compute(n: number) {
            calls++
            return n * 2
        }
    }
    const s = new Service()

    assertEquals(await s.compute(1), 2)
    assertEquals(await s.compute(2), 4)
    assertEquals(await s.compute(1), 2)
    assertEquals(calls, 2, 'one run per distinct argument, then a hit')
})

Deno.test('Cached - argument objects key by structure, not by key order', async () => {
    resetCache()
    let calls = 0

    class Service {
        @Cached('5m')
        async find(filter: Record<string, unknown>) {
            calls++
            return Object.keys(filter).length
        }
    }
    const s = new Service()

    await s.find({ a: 1, b: 2 })
    await s.find({ b: 2, a: 1 })
    assertEquals(calls, 1, 'the same call written two ways is one cache entry')
})

Deno.test('Cached - two classes with the same method name do not collide', async () => {
    resetCache()
    const calls: string[] = []

    class Alpha {
        @Cached('5m')
        async run(n: number) {
            calls.push('alpha')
            return `alpha-${n}`
        }
    }
    class Beta {
        @Cached('5m')
        async run(n: number) {
            calls.push('beta')
            return `beta-${n}`
        }
    }

    assertEquals(await new Alpha().run(1), 'alpha-1')
    assertEquals(await new Beta().run(1), 'beta-1')
    assertEquals(calls, ['alpha', 'beta'])
})

Deno.test('Cached - works on async methods', async () => {
    resetCache()
    let calls = 0

    class Service {
        @Cached('5m')
        async fetchIt(id: string) {
            calls++
            await new Promise((r) => setTimeout(r, 1))
            return { id, loaded: true }
        }
    }
    const s = new Service()

    assertEquals(await s.fetchIt('a'), { id: 'a', loaded: true })
    assertEquals(await s.fetchIt('a'), { id: 'a', loaded: true })
    assertEquals(calls, 1)
})

Deno.test('Cached - a null result is not cached', async () => {
    resetCache()
    let calls = 0

    class Service {
        @Cached('5m')
        async maybe(_id: string) {
            calls++
            return null
        }
    }
    const s = new Service()

    await s.maybe('x')
    await s.maybe('x')
    assertEquals(
        calls,
        2,
        'the store cannot tell a stored null from a miss, so null is never stored',
    )
})

// ============================================================================
// Keys
// ============================================================================

Deno.test('Cached - a fixed string key is used verbatim', async () => {
    resetCache()

    class Service {
        @Cached({ ttl: '5m', key: 'the-answer' })
        async compute() {
            return 42
        }
    }

    assertEquals(await new Service().compute(), 42)
    assertEquals(await get('the-answer'), 42)
})

Deno.test('Cached - a key generator receives the call arguments', async () => {
    resetCache()
    let calls = 0

    class Service {
        @Cached({
            ttl: '5m',
            key: (tenant: string, id: number) => `${tenant}:${id}`,
        })
        async load(tenant: string, id: number) {
            calls++
            return `${tenant}/${id}`
        }
    }
    const s = new Service()

    assertEquals(await s.load('acme', 1), 'acme/1')
    assertEquals(await get('acme:1'), 'acme/1')
    await s.load('acme', 1)
    assertEquals(calls, 1)
})

Deno.test('Cached - the derived key names the class and method', async () => {
    resetCache()

    class ReportService {
        @Cached('5m')
        async monthly(year: number) {
            return year
        }
    }

    await new ReportService().monthly(2026)
    assertEquals(await get('ReportService.monthly(2026)'), 2026)
})

// ============================================================================
// condition
// ============================================================================

Deno.test('Cached - condition false bypasses the cache entirely', async () => {
    resetCache()
    let calls = 0

    class Service {
        @Cached({ ttl: '5m', condition: (n: number) => n > 0 })
        async compute(n: number) {
            calls++
            return n
        }
    }
    const s = new Service()

    await s.compute(-1)
    await s.compute(-1)
    assertEquals(calls, 2, 'a bypassed call is neither read nor written')

    await s.compute(5)
    await s.compute(5)
    assertEquals(calls, 3, 'a permitted call is cached as usual')
})

// ============================================================================
// Tags and invalidation
// ============================================================================

Deno.test('CacheInvalidate - flushing a tag drops the entries under it', async () => {
    resetCache()
    let calls = 0

    class Service {
        @Cached({ ttl: '5m', tags: ['reports'] })
        async report(id: number) {
            calls++
            return `report-${id}`
        }

        @CacheInvalidate({ tags: ['reports'] })
        async publish(_id: number) {
            return 'published'
        }
    }
    const s = new Service()

    await s.report(1)
    await s.report(1)
    assertEquals(calls, 1)

    await s.publish(1)

    await s.report(1)
    assertEquals(calls, 2, 'the entry was dropped, so the method ran again')
})

Deno.test('CacheInvalidate - a fixed key is dropped', async () => {
    resetCache()
    let calls = 0

    class Service {
        @Cached({ ttl: '5m', key: 'fixed' })
        async read() {
            calls++
            return 'value'
        }

        @CacheInvalidate({ key: 'fixed' })
        async write() {
            return 'written'
        }
    }
    const s = new Service()

    await s.read()
    await s.read()
    assertEquals(calls, 1)

    await s.write()
    await s.read()
    assertEquals(calls, 2)
})

Deno.test('CacheInvalidate - after is the default and does not run when the method throws', async () => {
    resetCache()
    let calls = 0

    class Service {
        @Cached({ ttl: '5m', key: 'k' })
        async read() {
            calls++
            return 'value'
        }

        @CacheInvalidate({ key: 'k' })
        async failingWrite(): Promise<string> {
            throw new Error('write failed')
        }
    }
    const s = new Service()

    await s.read()
    assertEquals(calls, 1)

    await assertRejects(() => s.failingWrite(), Error, 'write failed')

    await s.read()
    assertEquals(
        calls,
        1,
        'the write failed, so nothing changed and the cache is still correct',
    )
})

Deno.test('CacheInvalidate - before clears even when the method then throws', async () => {
    resetCache()
    let calls = 0

    class Service {
        @Cached({ ttl: '5m', key: 'k' })
        async read() {
            calls++
            return 'value'
        }

        @CacheInvalidate({ key: 'k', timing: 'before' })
        async failingWrite(): Promise<string> {
            throw new Error('write failed')
        }
    }
    const s = new Service()

    await s.read()
    assertEquals(calls, 1)

    await assertRejects(() => s.failingWrite(), Error, 'write failed')

    await s.read()
    assertEquals(calls, 2, 'before-timing cleared the entry regardless')
})

// ============================================================================
// TTL parsing
// ============================================================================

Deno.test('Cached - accepts every TTL form', async () => {
    resetCache()

    class Service {
        @Cached(300)
        async seconds() {
            return 'a'
        }
        @Cached('30s')
        async short() {
            return 'b'
        }
        @Cached('5m')
        async minutes() {
            return 'c'
        }
        @Cached('2h')
        async hours() {
            return 'd'
        }
        @Cached('1d')
        async days() {
            return 'e'
        }
        @Cached()
        async noTtl() {
            return 'f'
        }
    }
    const s = new Service()

    assertEquals(
        [
            await s.seconds(),
            await s.short(),
            await s.minutes(),
            await s.hours(),
            await s.days(),
            await s.noTtl(),
        ],
        ['a', 'b', 'c', 'd', 'e', 'f'],
    )
})

Deno.test('Cached - rejects a malformed TTL when the class is defined', () => {
    for (const bad of [0, -1, '1w', 'abc', '']) {
        assertThrows(
            () => {
                class _Service {
                    @Cached(bad as never)
                    async method() {
                        return 1
                    }
                }
            },
            TypeError,
            undefined,
            `expected TTL ${JSON.stringify(bad)} to be rejected`,
        )
    }
})
