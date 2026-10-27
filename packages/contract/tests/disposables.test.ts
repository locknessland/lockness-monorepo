/**
 * The disposables registry — how a package announces a resource that must be
 * released, without importing `@lockness/core`.
 *
 * Two rules this file exists to pin, both of which a reasonable implementation
 * gets wrong:
 *
 * 1. **Identity is the object, never the name.** Names collide by design — one
 *    `SSEChannel` per room, one `QueueWorker` per queue set — so deduplicating
 *    on the name would collapse N channels into one, and deregistering by name
 *    would let any module cancel another module's teardown.
 * 2. **Draining clears; it never freezes.** `@lockness/core`'s own
 *    `ShutdownRegistry` refuses registration permanently once it has run, which
 *    is right for a per-App registry and catastrophic for a process-wide one:
 *    the test suite boots many apps per process, so a freeze would make every
 *    registration after the first shutdown a silent no-op — disabling exactly
 *    the tests that would notice.
 */

import { assertEquals, assertNotStrictEquals } from '@std/assert'
import {
    deregisterDisposable,
    drainDisposables,
    registerDisposable,
} from '../lifecycle/disposables.ts'

/** Every test starts from empty; the registry is process-wide by design. */
function reset(): void {
    drainDisposables()
}

Deno.test('disposables - a registered disposable is drained', async () => {
    reset()
    let disposed = false
    registerDisposable({ name: 'a', dispose: () => void (disposed = true) })

    for (const d of drainDisposables()) await d.dispose()

    assertEquals(disposed, true)
})

Deno.test('disposables - two disposables sharing a NAME both survive', async () => {
    // The SSE case. `manager.getOrCreate('room-123')` names a channel from a
    // request path segment, and a per-room pattern means many channels. Dedup
    // on the name would tear down one and leave the rest armed.
    reset()
    const disposed: string[] = []
    registerDisposable({
        name: 'sse',
        dispose: () => void disposed.push('one'),
    })
    registerDisposable({
        name: 'sse',
        dispose: () => void disposed.push('two'),
    })

    for (const d of drainDisposables()) await d.dispose()

    assertEquals(disposed.sort(), ['one', 'two'])
})

Deno.test('disposables - registering the SAME object twice disposes it once', async () => {
    reset()
    let count = 0
    const entry = { name: 'once', dispose: () => void count++ }
    registerDisposable(entry)
    registerDisposable(entry)

    for (const d of drainDisposables()) await d.dispose()

    assertEquals(count, 1)
})

Deno.test('disposables - deregistration takes the HANDLE, not the name', async () => {
    // If deregistering keyed on the name, any module could cancel any other
    // module's teardown by registering and deregistering a colliding name.
    // That is a cross-package integrity hole with no attacker required.
    reset()
    const disposed: string[] = []
    const mine = registerDisposable({
        name: 'shared-name',
        dispose: () => void disposed.push('mine'),
    })
    registerDisposable({
        name: 'shared-name',
        dispose: () => void disposed.push('theirs'),
    })

    deregisterDisposable(mine)
    for (const d of drainDisposables()) await d.dispose()

    assertEquals(disposed, ['theirs'], 'only the handle I hold was cancelled')
})

Deno.test('disposables - deregistering twice is harmless', () => {
    reset()
    const handle = registerDisposable({ name: 'x', dispose: () => {} })

    deregisterDisposable(handle)
    deregisterDisposable(handle)

    assertEquals(drainDisposables().length, 0)
})

Deno.test('disposables - draining CLEARS, so a later registration still works', async () => {
    // The invariant that separates this registry from core's. A freeze here
    // would make every registration after the first drain a silent no-op.
    reset()
    let second = false

    registerDisposable({ name: 'first', dispose: () => {} })
    for (const d of drainDisposables()) await d.dispose()

    registerDisposable({ name: 'second', dispose: () => void (second = true) })
    const remaining = drainDisposables()

    assertEquals(
        remaining.length,
        1,
        'the registry accepted work after a drain',
    )
    for (const d of remaining) await d.dispose()
    assertEquals(second, true)
})

Deno.test('disposables - a drained disposable is not drained again', async () => {
    reset()
    let count = 0
    registerDisposable({ name: 'a', dispose: () => void count++ })

    for (const d of drainDisposables()) await d.dispose()
    for (const d of drainDisposables()) await d.dispose()

    assertEquals(count, 1)
})

Deno.test('disposables - the drain carries priority through WITHOUT sorting', async () => {
    // Ordering has one home — @lockness/core's ShutdownRegistry comparator —
    // and core re-sorts after adopting these. A comparator here would be a
    // second spelling of that rule, and two comparators agree only until one of
    // them changes. So the drain preserves registration order and carries the
    // priority for the caller to use.
    drainDisposables()
    const seen: Array<number | undefined> = []

    registerDisposable({ name: 'store', dispose: () => {}, priority: 60 })
    registerDisposable({ name: 'predrain', dispose: () => {}, priority: -100 })
    registerDisposable({ name: 'defaulted', dispose: () => {} })

    for (const d of drainDisposables()) seen.push(d.priority)

    assertEquals(seen, [60, -100, undefined], 'registration order, untouched')
    await Promise.resolve()
})

Deno.test('disposables - an omitted priority stays undefined, it is not defaulted here', async () => {
    // Deliberately NOT filled in. The default belongs to whoever orders — core
    // adopts an absent priority as STORES. Substituting a number here would put
    // the default in two places, and they diverged once already: this module
    // documented 60 while core's register() defaulted to 0, so a third-party
    // store closed FIRST, ahead of the producers writing into it.
    drainDisposables()
    registerDisposable({ name: 'defaulted', dispose: () => {} })

    const [entry] = drainDisposables()

    assertEquals(entry.priority, undefined)
    await Promise.resolve()
})

Deno.test('disposables - registering never touches Deno, so a standalone library stays silent', () => {
    // FR-003. A package used outside a Lockness application must not throw, and
    // must not warn about a framework that is not there. Asserted by capturing
    // both console channels rather than by reading the source.
    reset()
    const noise: string[] = []
    const warn = console.warn
    const error = console.error
    console.warn = (...a: unknown[]) => void noise.push(a.join(' '))
    console.error = (...a: unknown[]) => void noise.push(a.join(' '))

    try {
        const handle = registerDisposable({
            name: 'standalone',
            dispose: () => {},
        })
        deregisterDisposable(handle)
    } finally {
        console.warn = warn
        console.error = error
    }

    assertEquals(noise, [])
})

Deno.test('disposables - each drain returns a fresh array', () => {
    reset()
    registerDisposable({ name: 'a', dispose: () => {} })
    const first = drainDisposables()
    registerDisposable({ name: 'b', dispose: () => {} })
    const second = drainDisposables()

    assertNotStrictEquals(first, second)
})
