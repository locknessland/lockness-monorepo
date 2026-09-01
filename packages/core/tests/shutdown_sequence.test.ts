/**
 * The shutdown sequence — what actually runs at teardown, and the two rules the
 * registry deliberately does not own: the deadline, and "are we already
 * shutting down?".
 *
 * The deadline is the reason this feature is safe to ship. Measured on Deno
 * 2.9.6: `server.shutdown()` does not resolve while a streaming response is
 * open, and `@lockness/sse` holds responses open by design. Without a bound,
 * installing signal handlers would turn a working Ctrl-C into a permanent hang.
 */

import { assertEquals, assertStrictEquals, assertThrows } from '@std/assert'
import {
    DEFAULT_SHUTDOWN_DEADLINE_MS,
    resolveDeadlineMs,
    ShutdownSequence,
} from '../kernel/shutdown_sequence.ts'
import { SHUTDOWN_PRIORITY } from '../kernel/shutdown_registry.ts'

Deno.test('resolveDeadlineMs - defaults to 10 seconds when unset', () => {
    assertEquals(resolveDeadlineMs(undefined), 10_000)
    assertEquals(DEFAULT_SHUTDOWN_DEADLINE_MS, 10_000)
})

Deno.test('resolveDeadlineMs - rejects every value setTimeout would silently clamp', () => {
    // Each of these is clamped to 1ms by setTimeout, with a warning nobody
    // reads. `Infinity` is the one that matters most: an author writes it to
    // mean "never time out" and gets the SHORTEST possible deadline — the exact
    // inverse of the request. Measured:
    //     0 -> 3ms   -1 -> 1ms (warned)   NaN -> 1ms (warned)
    //     Infinity -> 1ms (warned)        2**31 -> 1ms (warned)
    // `undefined` is deliberately NOT in the loop below: it is the one value
    // that is valid, and it yields the default — asserted separately above.
    for (const bad of [0, -1, NaN, Infinity, -Infinity, 2 ** 31, 1.5]) {
        assertThrows(
            () => resolveDeadlineMs(bad),
            TypeError,
            'deadlineMs',
            `${bad} must be refused, not clamped`,
        )
    }
})

Deno.test('resolveDeadlineMs - accepts the boundaries', () => {
    assertEquals(resolveDeadlineMs(1), 1)
    assertEquals(resolveDeadlineMs(2 ** 31 - 1), 2 ** 31 - 1)
    assertEquals(resolveDeadlineMs(20_000), 20_000)
})

Deno.test('ShutdownSequence - is idempotent, and every caller gets the SAME report', async () => {
    let ran = 0
    const sequence = new ShutdownSequence()
    sequence.registry.register('once', () => void ran++)

    const reports = await Promise.all(
        Array.from({ length: 10 }, () => sequence.run()),
    )

    assertEquals(ran, 1, 'ten calls, one teardown')
    // assertStrictEquals, not assertEquals: a structural compare would pass for
    // an implementation that builds a fresh, equal report per caller — which is
    // precisely the non-memoised behaviour this test exists to forbid.
    for (const report of reports) {
        assertStrictEquals(report, reports[0])
    }
})

Deno.test('ShutdownSequence - isShuttingDown flips before the hooks run', async () => {
    // FR-012's second signal reads this. It must be true from the moment the
    // sequence starts, not once it finishes, or the second signal would wait.
    const sequence = new ShutdownSequence()
    let seenInsideHook = false

    assertEquals(sequence.isShuttingDown, false)
    sequence.registry.register('observe', () => {
        seenInsideHook = sequence.isShuttingDown
    })

    await sequence.run()

    assertEquals(seenInsideHook, true)
    assertEquals(sequence.isShuttingDown, true)
})

Deno.test('ShutdownSequence - stops the server BEFORE any hook runs', async () => {
    const order: string[] = []
    const sequence = new ShutdownSequence()

    sequence.setServer({
        shutdown: () => {
            order.push('server')
            return Promise.resolve()
        },
    })
    sequence.registry.register('hook', () => void order.push('hook'))

    await sequence.run()

    // Not merely "both happened" — a hook that ran first could observe a
    // request arriving against a resource it had already torn down.
    assertEquals(order, ['server', 'hook'])
})

Deno.test('ShutdownSequence - awaits a server handed over as a promise', async () => {
    // ServerListener.listen() returns `this.tryServe(...) as unknown as
    // Deno.HttpServer` over a `private async tryServe` — so what App holds is a
    // PROMISE wearing a server's type. Calling .shutdown() on it directly is
    // "undefined is not a function". main.ts:7 already writes
    // `await app.listen(...)`, which only type-checks because of that cast.
    let stopped = false
    const sequence = new ShutdownSequence()

    sequence.setServer(
        Promise.resolve({
            shutdown: () => {
                stopped = true
                return Promise.resolve()
            },
        }),
    )

    await sequence.run()

    assertEquals(stopped, true)
})

Deno.test('ShutdownSequence - runs with no server at all', async () => {
    // shutdown() before listen(), or an app used only through app.fetch.
    const sequence = new ShutdownSequence()
    let ran = false
    sequence.registry.register('hook', () => void (ran = true))

    const report = await sequence.run()

    assertEquals(ran, true)
    assertEquals(report.timedOut, false)
})

Deno.test('ShutdownSequence - a failing hook does not stop the ones after it', async () => {
    const order: string[] = []
    const sequence = new ShutdownSequence()

    sequence.registry.register('first', () => void order.push('first'), 1)
    sequence.registry.register('second', () => {
        order.push('second')
        throw new Error('teardown exploded')
    }, 2)
    sequence.registry.register('third', () => void order.push('third'), 3)
    sequence.registry.register('fourth', () => void order.push('fourth'), 4)

    const report = await sequence.run()

    assertEquals(order, ['first', 'second', 'third', 'fourth'])
    assertEquals(report.ran, 4)
    assertEquals(report.failed.length, 1)
    assertEquals(report.failed[0].hook, 'second')
})

Deno.test('ShutdownSequence - a rejected async hook is caught too', async () => {
    const sequence = new ShutdownSequence()
    sequence.registry.register(
        'rejects',
        () => Promise.reject(new Error('nope')),
    )
    sequence.registry.register('after', () => {})

    const report = await sequence.run()

    assertEquals(report.ran, 2)
    assertEquals(report.failed.length, 1)
})

Deno.test('ShutdownSequence - the deadline bounds a hook that never resolves', async () => {
    const sequence = new ShutdownSequence(60)
    sequence.registry.register('hangs', () => new Promise<void>(() => {}))

    const started = performance.now()
    const report = await sequence.run()
    const elapsed = performance.now() - started

    assertEquals(report.timedOut, true)
    assertEquals(
        elapsed < 2000,
        true,
        `the sequence must not wait on a hook that never resolves (took ${elapsed}ms)`,
    )
})

Deno.test('ShutdownSequence - the deadline bounds a server drain that never resolves', async () => {
    // The measured case: server.shutdown() does not resolve against an open
    // text/event-stream response. The deadline must cover the DRAIN, not only
    // the hooks — a bound that starts after the server would never fire here.
    let hookRan = false
    const sequence = new ShutdownSequence(60)
    sequence.setServer({ shutdown: () => new Promise<void>(() => {}) })
    sequence.registry.register('never-reached', () => void (hookRan = true))

    const report = await sequence.run()

    assertEquals(report.timedOut, true)
    assertEquals(hookRan, false, 'the drain never finished, so no hook ran')
})

Deno.test('ShutdownSequence - a clean run does not report a timeout', async () => {
    const sequence = new ShutdownSequence(5_000)
    sequence.registry.register('quick', () => {})

    const report = await sequence.run()

    assertEquals(report.timedOut, false)
    assertEquals(report.failed, [])
})

Deno.test('ShutdownSequence - framework priorities order the way the band promises', async () => {
    const order: string[] = []
    const sequence = new ShutdownSequence()

    sequence.registry.register(
        'db',
        () => void order.push('db'),
        SHUTDOWN_PRIORITY.CONNECTIONS,
    )
    sequence.registry.register(
        'scheduler',
        () => void order.push('scheduler'),
        SHUTDOWN_PRIORITY.SERVICES,
    )
    sequence.registry.register(
        'notify',
        () => void order.push('notify'),
        SHUTDOWN_PRIORITY.NOTIFY,
    )

    await sequence.run()

    // The database closes LAST. Reusing steps/database.ts's bootstrap order of
    // 100 as a priority would produce this same number by coincidence and the
    // opposite meaning if the comparator were ever flipped — which is why the
    // band is named and the order asserted rather than assumed.
    assertEquals(order, ['notify', 'scheduler', 'db'])
})

Deno.test('ShutdownSequence - emits KernelTerminating, which nothing emitted before', async () => {
    // The event has shipped in @lockness/events since it was written, is
    // re-exported from @lockness/core, and is documented with a
    // `closeConnections` listener example — with zero emitters repo-wide. A
    // documented event that never fires is worse than an absent one: someone
    // writes the listener and it silently never runs.
    const { dispatcher, KernelTerminating } = await import('@lockness/events')

    let seen: unknown
    const off = dispatcher().on(KernelTerminating, (event: unknown) => {
        seen = event
    })

    try {
        const sequence = new ShutdownSequence()
        await sequence.run()
    } finally {
        off?.()
    }

    assertEquals(seen instanceof KernelTerminating, true)
})

Deno.test('ShutdownSequence - a throwing KernelTerminating listener does not strand the teardown', async () => {
    const { dispatcher, KernelTerminating } = await import('@lockness/events')

    const off = dispatcher().on(KernelTerminating, () => {
        throw new Error('listener exploded')
    })

    try {
        let ran = false
        const sequence = new ShutdownSequence()
        sequence.registry.register('after-event', () => void (ran = true))

        const report = await sequence.run()

        assertEquals(ran, true, 'the hooks still run')
        assertEquals(report.timedOut, false)
    } finally {
        off?.()
    }
})

Deno.test('ShutdownSequence - a timed-out report still names what ran and what failed', async () => {
    // It used to return `{ ran: 0, failed: [] }` on expiry — telling a caller
    // that nothing was attempted and nothing failed when three hooks had run
    // and one had thrown. The exit code was right via `timedOut`; the
    // programmatic caller was misled, and invariant 3 calls silence about a
    // hook a defect.
    const sequence = new ShutdownSequence(120)

    sequence.registry.register('ok-1', () => {}, 1)
    sequence.registry.register('boom', () => {
        throw new Error('teardown exploded')
    }, 2)
    sequence.registry.register('hangs', () => new Promise<void>(() => {}), 3)

    const report = await sequence.run()

    assertEquals(report.timedOut, true)
    assertEquals(
        report.ran > 0,
        true,
        'it must not claim nothing was attempted',
    )
    assertEquals(
        report.failed.map((f) => f.hook),
        ['boom'],
        'the failure before the timeout must survive into the report',
    )
})

Deno.test('ShutdownSequence - a HANGING KernelTerminating listener does not starve the hooks', async () => {
    // The throwing case was covered; the hanging one was not, and it is worse.
    // `emit` awaits its listeners sequentially with no per-listener bound, so
    // one that never resolves consumed the ENTIRE deadline inside the announce
    // and registry.run() was never reached. Measured before the fix:
    // `hookRan = false`, report `{ ran: 0, failed: [], timedOut: true }` —
    // every resource the feature exists to release, still open.
    const { dispatcher, KernelTerminating } = await import('@lockness/events')

    const off = dispatcher().on(
        KernelTerminating,
        () => new Promise<void>(() => {}),
    )

    try {
        let hookRan = false
        const sequence = new ShutdownSequence(400)
        sequence.registry.register('critical', () => void (hookRan = true))

        const report = await sequence.run()

        assertEquals(
            hookRan,
            true,
            'the notification is a courtesy; the teardown is the point',
        )
        assertEquals(report.ran, 1)
    } finally {
        off?.()
    }
})
