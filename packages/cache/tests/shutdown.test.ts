/**
 * Cache resources are released at shutdown.
 *
 * The package had **no `close()` at all** before this — `grep -rn "\.close()"
 * packages/cache/` returned nothing, tests included — so the KV handle it opens
 * lazily could never be released. #136 described this as wiring; it was new API
 * first.
 */

import { assertEquals, assertNotStrictEquals, assertRejects } from '@std/assert'
import {
    deregisterDisposable,
    disposableCount,
    drainDisposables,
    registerDisposable,
} from '@lockness/contract/lifecycle/internal'
import { DenoKvCacheDriver } from '../drivers/deno_kv_driver.ts'
import { MemoryCacheDriver } from '../drivers/memory_driver.ts'
import { RedisCacheDriver } from '../drivers/redis_driver.ts'

Deno.test('cache - the KV driver closes its handle on drain', async () => {
    drainDisposables()
    const path = `${Deno.cwd()}/tmp/cache-shutdown-${
        crypto.randomUUID().slice(0, 8)
    }.db`
    await Deno.mkdir(`${Deno.cwd()}/tmp`, { recursive: true })

    try {
        const driver = new DenoKvCacheDriver(path)
        await driver.set('k', 'v')

        const drained = drainDisposables()
        assertEquals(drained.length, 1, 'the driver announced itself')
        for (const d of drained) await d.dispose()

        // Proof the handle is really gone: a second close must not throw, and
        // Deno would raise BadResource on a use-after-close.
        await driver.close()
    } finally {
        await Deno.remove(path).catch(() => {})
        await Deno.remove(`${path}-shm`).catch(() => {})
        await Deno.remove(`${path}-wal`).catch(() => {})
    }
})

Deno.test('cache - close() on a driver that never opened is a no-op, not a throw', async () => {
    // Every KV driver in this repo opens LAZILY. A driver constructed and never
    // used holds nothing, and an unguarded close() would throw inside the drain
    // — which core catches and logs, turning every clean shutdown into a red
    // line rather than a failure.
    drainDisposables()
    const driver = new DenoKvCacheDriver(`${Deno.cwd()}/tmp/never-opened.db`)

    await driver.close()
    await driver.close()

    // Says what is meant: it did not throw AND it did not disturb the registry.
    // `assertEquals(true, true)` asserted neither.
    assertEquals(disposableCount(), 0)
})

Deno.test('cache - the memory driver announces nothing', () => {
    // Its Maps are module-level and shared across every instance, so a close()
    // clearing them would corrupt other instances. Owning no OS resource, it has
    // nothing to release.
    drainDisposables()
    new MemoryCacheDriver()

    assertEquals(disposableCount(), 0)
})

Deno.test('cache - a borrowed (non-owning) redis client registers nothing (SC-005)', async () => {
    // A non-owning driver's close() closes nothing (the app still owns the
    // client), so enrolling it in the registry only grows it for the process
    // lifetime — a per-tenant driver created and dropped is exactly the leak.
    // #140: register IFF we own the client. The old test drained an empty
    // registry and asserted `closed === false`, passing for the wrong reason.
    drainDisposables()
    let closed = false
    const client = {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        del: () => Promise.resolve(),
        keys: () => Promise.resolve([]),
        close: () => void (closed = true),
    } as never

    const driver = new RedisCacheDriver(client)
    assertEquals(
        disposableCount(),
        0,
        'a borrowed-client driver announces nothing',
    )
    // And an explicit close() must leave the borrowed connection open.
    await driver.close()
    assertEquals(closed, false, 'close() spares a client we do not own')
})

Deno.test('cache - ownsClient:true registers and closes on drain', async () => {
    drainDisposables()
    let closed = false
    const client = {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        del: () => Promise.resolve(),
        keys: () => Promise.resolve([]),
        close: () => void (closed = true),
    } as never

    // Hold a strong reference through the drain: the registry now references the
    // driver only WEAKLY (so a dropped owned driver can be GC-collected), so a
    // test that relied on the registry to keep it alive would be flaky.
    const driver = new RedisCacheDriver(client, { ownsClient: true })
    assertEquals(disposableCount(), 1, 'an owned driver announces itself')
    for (const d of drainDisposables()) await d.dispose()

    assertEquals(closed, true)
    void driver
})

Deno.test('cache - a closed driver is never handed out again', async () => {
    // Without this, a programmatic `await app.shutdown()` leaves getDriver()
    // returning a closed handle and every later request fails BadResource —
    // converting a shutdown leak into a post-shutdown outage.
    drainDisposables()
    const { getDriver, setCacheDriver } = await import('../store.ts')

    // Explicitly a driver that OWNS something. The default is memory, which
    // correctly registers nothing and closes nothing — so using the default
    // here would assert against a driver that was never torn down, and pass for
    // the wrong reason.
    const path = `${Deno.cwd()}/tmp/reuse-${crypto.randomUUID().slice(0, 8)}.db`
    await Deno.mkdir(`${Deno.cwd()}/tmp`, { recursive: true })
    setCacheDriver(new DenoKvCacheDriver(path))

    const first = getDriver()
    await first.close?.()
    const second = getDriver()

    assertNotStrictEquals(first, second, 'a fresh driver after teardown')

    setCacheDriver(new MemoryCacheDriver())
    await Deno.remove(path).catch(() => {})
})

Deno.test('cache - a driver deregisters when closed directly', async () => {
    // The driver must actually REGISTER first, which happens on first use, not
    // in the constructor. The first version closed a never-used driver whose
    // count was already 0 — unfalsifiable by any change to close().
    drainDisposables()
    await Deno.mkdir(`${Deno.cwd()}/tmp`, { recursive: true })
    const path = `${Deno.cwd()}/tmp/dereg-${crypto.randomUUID().slice(0, 8)}.db`

    try {
        const driver = new DenoKvCacheDriver(path)
        await driver.set('k', 'v')
        assertEquals(disposableCount(), 1, 'registered on first use')

        await driver.close()

        assertEquals(disposableCount(), 0, 'no stale entry left behind')
    } finally {
        for (const suffix of ['', '-shm', '-wal']) {
            await Deno.remove(path + suffix).catch(() => {})
        }
    }
})

Deno.test('cache - registering does not require the framework', () => {
    // Used standalone, outside a Lockness app: no throw, no warning.
    drainDisposables()
    const noise: string[] = []
    const warn = console.warn
    console.warn = (...a: unknown[]) => void noise.push(a.join(' '))
    try {
        const d = new MemoryCacheDriver()
        const h = registerDisposable({ name: 't', dispose: () => {} })
        deregisterDisposable(h)
        void d
    } finally {
        console.warn = warn
    }
    assertEquals(noise, [])
})

Deno.test('cache - a concurrent cold start opens exactly one KV handle (SC-006)', async () => {
    // Two callers racing the first operation must share one open. The unfixed
    // `if (!this.kv) { this.kv = await Deno.openKv() }` awaits between the guard
    // and the assignment, so both open and the first handle leaks unreferenced.
    drainDisposables()
    let opens = 0
    let closes = 0
    const fakeKv = {
        get: () => Promise.resolve({ value: null }),
        set: () => Promise.resolve({ ok: true }),
        close: () => {
            closes++
        },
    }
    const original = Deno.openKv
    Object.defineProperty(Deno, 'openKv', {
        value: () => {
            opens++
            return Promise.resolve(fakeKv)
        },
        configurable: true,
        writable: true,
    })

    try {
        const driver = new DenoKvCacheDriver()
        await Promise.all([driver.set('a', 1), driver.set('b', 2)])
        assertEquals(opens, 1, 'both racers share one Deno.openKv')
        assertEquals(disposableCount(), 1, 'registered exactly once')

        await driver.close()
        await driver.close() // idempotent: no throw on a second close
        assertEquals(closes, 1, 'the single handle is closed exactly once')
    } finally {
        Object.defineProperty(Deno, 'openKv', {
            value: original,
            configurable: true,
            writable: true,
        })
    }
})

Deno.test({
    name:
        'cache - an owned redis driver dropped without close() deregisters on GC',
    // Best-effort: FinalizationRegistry callbacks are not guaranteed to run, so
    // this is only meaningful under `--v8-flags=--expose-gc`. Skipped otherwise.
    // deno-lint-ignore no-explicit-any -- optional V8 GC hook, not in lib.dom
    ignore: typeof (globalThis as any).gc !== 'function',
    fn: async () => {
        drainDisposables()
        // deno-lint-ignore no-explicit-any -- optional V8 GC hook
        const gc = (globalThis as any).gc as () => void
        const client = {
            get: () => Promise.resolve(null),
            set: () => Promise.resolve(),
            del: () => Promise.resolve(),
            keys: () => Promise.resolve([]),
            close: () => {},
        } as never // Register an owned driver, then drop every strong reference WITHOUT
         // calling close(). The FinalizationRegistry must withdraw its entry.
        ;(() => {
            const driver = new RedisCacheDriver(client, { ownsClient: true })
            void driver
        })()
        assertEquals(disposableCount(), 1, 'owned driver registered')

        for (let i = 0; i < 10 && disposableCount() > 0; i++) {
            gc()
            await new Promise((r) => setTimeout(r, 0))
        }
        assertEquals(disposableCount(), 0, 'GC withdrew the dropped driver')
    },
})

Deno.test('cache - a failed cold open is not memoised; a later call retries', async () => {
    // #openKv clears the memo on failure, so a transient open error does not
    // poison the driver forever. Without that clear, the rejected promise would
    // be handed to every later caller.
    drainDisposables()
    let opens = 0
    const original = Deno.openKv
    Object.defineProperty(Deno, 'openKv', {
        value: () => {
            opens++
            if (opens === 1) {
                return Promise.reject(new Error('cold open failed'))
            }
            return Promise.resolve({
                get: () => Promise.resolve({ value: null }),
                set: () => Promise.resolve({ ok: true }),
                close: () => {},
            })
        },
        configurable: true,
        writable: true,
    })

    try {
        const driver = new DenoKvCacheDriver()
        await assertRejects(() => driver.set('a', 1))
        assertEquals(disposableCount(), 0, 'a failed open registers nothing')

        await driver.set('a', 1) // must retry, not replay the rejection
        assertEquals(opens, 2, 'the failure was not memoised')
        assertEquals(disposableCount(), 1, 'the retry registered exactly once')
        await driver.close()
    } finally {
        Object.defineProperty(Deno, 'openKv', {
            value: original,
            configurable: true,
            writable: true,
        })
    }
})

Deno.test('cache - close() during a cold open orphans no KV handle (SC-006 raced)', async () => {
    // The interleaving that leaked a handle before the isCurrent() guard:
    // open #1 is in flight, close() clears the memo, a fresh op starts open #2,
    // and the two opens resolve OUT OF ORDER. The stale open #1 must release its
    // handle instead of clobbering the driver's current one.
    drainDisposables()
    let opens = 0
    const opened: Array<{ closed: boolean }> = []
    const resolvers: Array<() => void> = []
    const original = Deno.openKv
    Object.defineProperty(Deno, 'openKv', {
        value: () =>
            new Promise((resolve) => {
                opens++
                resolvers.push(() => {
                    const kv = {
                        closed: false,
                        get: () => Promise.resolve({ value: null }),
                        set: () => Promise.resolve({ ok: true }),
                        close() {
                            this.closed = true
                        },
                    }
                    opened.push(kv)
                    resolve(kv)
                })
            }),
        configurable: true,
        writable: true,
    })

    try {
        const driver = new DenoKvCacheDriver()
        const op1 = driver.set('a', 1) // open #1
        const closing = driver.close() // clears memo, awaits open #1
        const op2 = driver.get('b') // open #2 on a fresh memo

        resolvers[1]() // open #2 resolves first…
        resolvers[0]() // …then the stale open #1
        await Promise.allSettled([op1, op2, closing])
        assertEquals(opens, 2)

        // A final close() must leave NOTHING open — the pre-guard code orphaned
        // the second handle here (this.kv was clobbered by the stale open).
        await driver.close()
        assertEquals(
            opened.every((k) => k.closed),
            true,
            'every opened handle was closed — no orphan',
        )
    } finally {
        Object.defineProperty(Deno, 'openKv', {
            value: original,
            configurable: true,
            writable: true,
        })
    }
})
