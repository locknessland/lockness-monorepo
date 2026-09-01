/**
 * Cache resources are released at shutdown.
 *
 * The package had **no `close()` at all** before this — `grep -rn "\.close()"
 * packages/cache/` returned nothing, tests included — so the KV handle it opens
 * lazily could never be released. #136 described this as wiring; it was new API
 * first.
 */

import { assertEquals, assertNotStrictEquals } from '@std/assert'
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

Deno.test('cache - an INJECTED redis client is not closed unless we own it', async () => {
    // The client arrives already connected from the application
    // (`RedisCacheDriver(client)`, "must be connected"). Closing something you
    // were handed breaks a connection the app may still be using elsewhere.
    drainDisposables()
    let closed = false
    const client = {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        del: () => Promise.resolve(),
        keys: () => Promise.resolve([]),
        close: () => void (closed = true),
    } as never

    new RedisCacheDriver(client)
    for (const d of drainDisposables()) await d.dispose()

    assertEquals(closed, false, 'a borrowed client is left alone')
})

Deno.test('cache - ownsClient:true opts in to closing it', async () => {
    drainDisposables()
    let closed = false
    const client = {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        del: () => Promise.resolve(),
        keys: () => Promise.resolve([]),
        close: () => void (closed = true),
    } as never

    new RedisCacheDriver(client, { ownsClient: true })
    for (const d of drainDisposables()) await d.dispose()

    assertEquals(closed, true)
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
