/**
 * SSE heartbeats are cleared at shutdown — and **before** the server drain.
 *
 * That placement is the point. `server.shutdown()` does not resolve while a
 * streaming response is open, and an armed heartbeat is what keeps it open. A
 * teardown behind the drain would sit behind the very thing it exists to
 * release: the deadline expires and no hook runs at all.
 *
 * Note every channel here is built with a REAL heartbeatInterval. Seven of the
 * ten construction sites in `sse.test.ts` pass `heartbeatInterval: 0`, which
 * takes the early return in `startHeartbeat` — extending that file naively
 * would exercise the no-interval path and prove nothing.
 */

import { assertEquals } from '@std/assert'
import {
    disposableCount,
    drainDisposables,
} from '@lockness/contract/lifecycle/internal'
import { SSEChannel } from '../channel.ts'

/** A client the channel can enqueue into. */
function connect(channel: SSEChannel, id: string): void {
    channel.addClient(id, {
        enqueue: () => {},
        close: () => {},
    } as never)
}

Deno.test('sse - a channel with an armed heartbeat announces itself', () => {
    drainDisposables()
    const channel = new SSEChannel('room-1', { heartbeatInterval: 10_000 })
    connect(channel, 'a')

    assertEquals(disposableCount(), 1)

    channel.close()
})

Deno.test('sse - it registers at PREDRAIN, before the server stops accepting', () => {
    drainDisposables()
    const channel = new SSEChannel('room-2', { heartbeatInterval: 10_000 })
    connect(channel, 'a')

    const [entry] = drainDisposables()
    assertEquals(entry.priority, -100)
    assertEquals(entry.name, 'sse:room-2')

    channel.close()
})

Deno.test('sse - heartbeatInterval 0 arms nothing, so it announces nothing', () => {
    // The early return in startHeartbeat. A channel holding no timer has
    // nothing to release, and enrolling it would be noise in the drain.
    drainDisposables()
    const channel = new SSEChannel('quiet', { heartbeatInterval: 0 })
    connect(channel, 'a')

    assertEquals(disposableCount(), 0)

    channel.close()
})

Deno.test('sse - closing a channel withdraws its registration', () => {
    drainDisposables()
    const channel = new SSEChannel('room-3', { heartbeatInterval: 10_000 })
    connect(channel, 'a')
    assertEquals(disposableCount(), 1)

    channel.close()

    assertEquals(disposableCount(), 0)
})

Deno.test('sse - N channels opened and closed leave the registry at zero', () => {
    // R2, asserted rather than hoped. The registry holds a strong reference and
    // this package's docs teach a channel per room, so a long-lived app would
    // grow without bound if a closed channel left its entry behind.
    drainDisposables()

    for (let i = 0; i < 200; i++) {
        const channel = new SSEChannel(`room-${i}`, {
            heartbeatInterval: 10_000,
        })
        connect(channel, 'a')
        channel.close()
    }

    assertEquals(disposableCount(), 0)
})

Deno.test('sse - channels sharing a name are not collapsed into one', () => {
    // Names come from request path segments in this package's documented usage,
    // so they collide. Dedup on the name would tear down one and leave the rest
    // armed.
    drainDisposables()
    const a = new SSEChannel('same', { heartbeatInterval: 10_000 })
    const b = new SSEChannel('same', { heartbeatInterval: 10_000 })
    connect(a, 'x')
    connect(b, 'y')

    assertEquals(disposableCount(), 2)

    a.close()
    b.close()
})

Deno.test('sse - disposing clears the interval, so nothing is left armed', async () => {
    drainDisposables()
    const channel = new SSEChannel('room-4', { heartbeatInterval: 10 })
    connect(channel, 'a')

    for (const d of drainDisposables()) await d.dispose()

    // If an interval survived, the test sanitiser would report a leaked timer
    // when this test ends — which is the real assertion here.
    assertEquals(disposableCount(), 0)
})
