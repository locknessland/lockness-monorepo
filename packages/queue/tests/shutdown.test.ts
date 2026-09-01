/**
 * Queue resources are released at shutdown — **both** of them.
 *
 * #136 named only `QueueWorker.stop()`. The driver also opens a Deno KV handle
 * (`mod.ts` `getKv`) and `kv.close` appeared nowhere in the package, so a
 * stopped worker had not released the store it was reading from. SC-002 would
 * have gone green over that.
 */

import { assertEquals } from '@std/assert'
import {
    disposableCount,
    drainDisposables,
} from '@lockness/contract/lifecycle/internal'
import { DenoKvQueueDriver, QueueWorker } from '../mod.ts'

Deno.test('queue - a RUNNING worker loop is stopped by the drain', async () => {
    // SC-002 is about a live loop terminating. The first version of this test
    // never called start(), so `running` was already false and stop() set
    // false -> false: a stop() that did nothing at all would have passed.
    drainDisposables()
    const worker = new QueueWorker({ sleep: 5, stopWhenEmpty: false })

    const loop = worker.start()
    // Let the loop actually enter its while(this.running) body.
    await new Promise((r) => setTimeout(r, 30))

    const drained = drainDisposables()
    assertEquals(drained.length, 1)
    assertEquals(drained[0].name, 'queue:worker')
    for (const d of drained) await d.dispose()

    // The real assertion: start()'s promise resolves, which it can only do once
    // `running` went false. Without a working stop() this hangs and the test
    // times out rather than passing.
    await loop
})

Deno.test('queue - the drain deregisters, asserted BEFORE the drain clears', async () => {
    // drainDisposables() TAKES AND CLEARS, so asserting count === 0 after it is
    // tautological — it holds whether dispose ran, threw, or did nothing. The
    // count must be read before.
    drainDisposables()
    const worker = new QueueWorker()
    assertEquals(disposableCount(), 1, 'registered')

    for (const d of drainDisposables()) await d.dispose()

    assertEquals(disposableCount(), 0)
    void worker
})

Deno.test('queue - stopping a worker withdraws its registration', () => {
    drainDisposables()
    const worker = new QueueWorker()
    assertEquals(disposableCount(), 1)

    worker.stop()

    assertEquals(disposableCount(), 0, 'no stale entry in a long-lived process')
})

Deno.test('queue - the KV driver announces itself only once it has a handle', async () => {
    drainDisposables()
    await Deno.mkdir(`${Deno.cwd()}/tmp`, { recursive: true })
    const path = `${Deno.cwd()}/tmp/queue-${crypto.randomUUID().slice(0, 8)}.db`

    try {
        const driver = new DenoKvQueueDriver(path)
        assertEquals(
            disposableCount(),
            0,
            'constructed but never used owns nothing',
        )

        await driver.push({
            id: '1',
            name: 'x',
            queue: 'default',
            payload: {},
            attempts: 0,
            availableAt: Date.now(),
        } as never)

        assertEquals(disposableCount(), 1, 'announced once the handle exists')
        for (const d of drainDisposables()) await d.dispose()
        await driver.close()
    } finally {
        for (const suffix of ['', '-shm', '-wal']) {
            await Deno.remove(path + suffix).catch(() => {})
        }
    }
})

Deno.test('queue - the worker sorts before the store it reads from', () => {
    drainDisposables()
    new QueueWorker()
    const [first] = drainDisposables()

    // SERVICES(30) before STORES(60): draining work into a store already closed
    // loses it.
    assertEquals(first.priority, 30)
})
