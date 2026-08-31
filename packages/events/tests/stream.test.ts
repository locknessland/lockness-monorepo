/**
 * The bounded queue, and the two public streams built on it.
 *
 * The assertions that matter here are the negative ones: that an unconsumed
 * stream stops growing, and that the report about it never carries the frame it
 * dropped. That second one is the only log line in this package that ships
 * enabled, so it is the only one no flag protects.
 */

import {
    assertEquals,
    assertRejects,
    assertStringIncludes,
    assertThrows,
} from '@std/assert'
import { EventEmitter, eventStream } from '../mod.ts'
import {
    createEventQueue,
    DEFAULT_BUFFER_SIZE,
    MAX_BUFFER_SIZE,
    type OverflowReport,
} from '../stream.ts'

/** Collects reports instead of writing them, so a test can read them. */
function recorder() {
    const reports: OverflowReport[] = []
    return { reports, report: (r: OverflowReport) => void reports.push(r) }
}

Deno.test('createEventQueue - an unconsumed buffer never exceeds its bound', async () => {
    // SC-001. The first version of this test could not fail: it called
    // `next()` without awaiting, checked a flag a microtask had not yet set,
    // and broke on the first iteration — so it compared 0 <= 10 and stayed
    // green with the overflow branch deleted. Await, and assert an exact count.
    const { report } = recorder()
    const queue = createEventQueue<number>('x', () => {}, {
        bufferSize: 10,
    }, report)

    for (let i = 0; i < 10_000; i++) queue.push(i)

    queue.close() // so the drain terminates instead of parking on an empty buffer

    const collected: number[] = []
    for await (const value of queue.stream) collected.push(value)

    assertEquals(
        collected.length,
        10,
        'exactly the bound, not fewer and not more',
    )
    // drop-oldest, so what survived is the tail.
    assertEquals(collected, [
        9990,
        9991,
        9992,
        9993,
        9994,
        9995,
        9996,
        9997,
        9998,
        9999,
    ])
})

Deno.test('createEventQueue - close() releases a consumer parked in next()', async () => {
    // Without the waiter drain in close(), a `for await` on a stream that ends
    // hangs forever — and nothing would be red, because a hung promise fails no
    // assertion. The test has to be able to time out rather than to assert.
    const queue = createEventQueue<number>('x', () => {})

    const pending = queue.stream.next()
    queue.close()

    const result = await pending
    assertEquals(result.done, true, 'the parked consumer was released')
})

Deno.test('createEventQueue - a SECOND overflow episode reports its own start', async () => {
    // Episode recovery: `dropped` has to reset when the buffer drains, or the
    // `dropped === 1` guard silences every episode after the first.
    const { reports, report } = recorder()
    const queue = createEventQueue<number>('x', () => {}, {
        bufferSize: 1,
    }, report)

    queue.push(1)
    queue.push(2) // episode 1 starts
    assertEquals(reports.length, 1)
    assertEquals(reports[0].ended, false)

    // Drain, which ends episode 1.
    await queue.stream.next()
    assertEquals(reports.length, 2)
    assertEquals(reports[1].ended, true)

    // And again.
    queue.push(3)
    queue.push(4) // episode 2 starts
    assertEquals(reports.length, 3, 'the second episode reports too')
    assertEquals(reports[2].ended, false)
    assertEquals(reports[2].dropped, 1, 'and its count restarted')

    queue.close()
})

Deno.test('the default overflow report encodes the event name', () => {
    // The report ships ENABLED while the debug path is off by default, so this
    // was the one line in the package writing an unencoded name — using the
    // encoder this branch deliberately moved into @lockness/contract, one
    // import away, for the off-by-default path only.
    const lines: string[] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => void lines.push(args.join(' '))

    try {
        const queue = createEventQueue<number>(
            'evil\nFAKE LOG LINE',
            () => {},
            { bufferSize: 1 },
        )
        queue.push(1)
        queue.push(2)
        queue.close()
    } finally {
        console.warn = original
    }

    assertEquals(lines.length > 0, true)
    for (const line of lines) {
        assertEquals(
            line.includes('\n'),
            false,
            'a real newline reached the log',
        )
        assertStringIncludes(line, '\\x0a')
    }
})

Deno.test('createEventQueue - drop-oldest keeps the NEWEST frames', async () => {
    const { report } = recorder()
    const queue = createEventQueue<number>('x', () => {}, {
        bufferSize: 3,
        onOverflow: 'drop-oldest',
    }, report)

    for (const n of [1, 2, 3, 4, 5]) queue.push(n)
    queue.close()

    const seen: number[] = []
    for await (const value of queue.stream) seen.push(value)
    assertEquals(seen, [3, 4, 5])
})

Deno.test('createEventQueue - drop-newest keeps the OLDEST frames', async () => {
    const { report } = recorder()
    const queue = createEventQueue<number>('x', () => {}, {
        bufferSize: 3,
        onOverflow: 'drop-newest',
    }, report)

    for (const n of [1, 2, 3, 4, 5]) queue.push(n)
    queue.close()

    const seen: number[] = []
    for await (const value of queue.stream) seen.push(value)
    assertEquals(seen, [1, 2, 3])
})

Deno.test('createEventQueue - an unrecognised policy is refused, not defaulted', () => {
    assertThrows(
        () =>
            createEventQueue<number>('x', () => {}, {
                onOverflow: 'drop-middle' as never,
            }),
        TypeError,
        'onOverflow must be one of',
    )
})

Deno.test('createEventQueue - the overflow report never carries the dropped frame', () => {
    // The finding that made this test exist: FR-009's report ships ENABLED,
    // while FR-012's payload rule guards only the debug path, which is off by
    // default. A dropped frame is a lifecycle event holding the request
    // Context — headers, cookies, session.
    const { reports, report } = recorder()
    const queue = createEventQueue<{ secret: string }>('x', () => {}, {
        bufferSize: 1,
    }, report)

    queue.push({ secret: 'SHOULD-NEVER-BE-LOGGED' })
    queue.push({ secret: 'SHOULD-NEVER-BE-LOGGED' })
    queue.close()

    assertEquals(reports.length > 0, true, 'the drop was reported at all')
    for (const r of reports) {
        assertEquals(
            JSON.stringify(r).includes('SHOULD-NEVER-BE-LOGGED'),
            false,
            'the report reached the frame',
        )
        assertEquals(Object.keys(r).sort(), [
            'bufferSize',
            'dropped',
            'ended',
            'event',
        ])
    }
})

Deno.test('createEventQueue - an episode is reported once at its start, once at its end', () => {
    // NOT once per dropped frame: under a stalled consumer that is one line per
    // event, which is the flood the report exists to replace.
    const { reports, report } = recorder()
    const queue = createEventQueue<number>('x', () => {}, {
        bufferSize: 1,
    }, report)

    queue.push(1)
    for (let i = 0; i < 50; i++) queue.push(i) // 50 drops, one episode
    assertEquals(
        reports.length,
        1,
        'the start of the episode, and nothing more',
    )
    assertEquals(reports[0].ended, false)
    assertEquals(reports[0].dropped, 1)

    queue.close()
    assertEquals(reports.length, 2, 'and the total when it ends')
    assertEquals(reports[1].ended, true)
    assertEquals(reports[1].dropped, 50)
})

Deno.test('createEventQueue - bufferSize bounds are enforced at both edges', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, 1e21, MAX_BUFFER_SIZE + 1]) {
        assertThrows(
            () => createEventQueue<number>('x', () => {}, { bufferSize: bad }),
            RangeError,
            'bufferSize must be an integer',
            `expected ${bad} refused`,
        )
    }
    // 1e21 deserves its own note: Number.isInteger(1e21) is true, so a
    // lower-edge check alone lets it through and the queue is unbounded again
    // behind an API that documents itself as bounded.
    assertEquals(Number.isInteger(1e21), true)

    // The edges that must be accepted.
    createEventQueue<number>('x', () => {}, { bufferSize: 1 }).close()
    createEventQueue<number>('x', () => {}, { bufferSize: MAX_BUFFER_SIZE })
        .close()
})

Deno.test('createEventQueue - ending the iterator detaches, by every route', async () => {
    // return()
    let detached = 0
    const byReturn = createEventQueue<number>('x', () => void detached++)
    byReturn.push(1)
    for await (const _ of byReturn.stream) break
    assertEquals(detached, 1, 'break detaches')

    // throw()
    const byThrow = createEventQueue<number>('x', () => void detached++)
    await assertRejects(() => byThrow.stream.throw!(new Error('boom')))
    assertEquals(detached, 2, 'an exception in the loop body detaches')

    // close() twice is idempotent
    const byClose = createEventQueue<number>('x', () => void detached++)
    byClose.close()
    byClose.close()
    assertEquals(detached, 3, 'closed once, detached once')
})

Deno.test('eventStream - is bounded by default and detaches on break', async () => {
    const emitter = new EventEmitter()
    const stream = eventStream<number>(emitter, 'tick')

    emitter.on('tick', () => {})
    const before = emitter.listenerCount('tick')

    await emitter.emit('tick', 1)
    for await (const _ of stream) break

    assertEquals(before, 2, 'the stream listener plus the unrelated one')
    assertEquals(
        emitter.listenerCount('tick'),
        1,
        'the stream listener came off; the unrelated one stayed',
    )
})

Deno.test('eventStream - two streams on one event have independent buffers', async () => {
    const a = recorder()
    const b = recorder()
    const qa = createEventQueue<number>(
        'x',
        () => {},
        { bufferSize: 1 },
        a.report,
    )
    const qb = createEventQueue<number>(
        'x',
        () => {},
        { bufferSize: 5 },
        b.report,
    )

    for (let i = 0; i < 3; i++) {
        qa.push(i)
        qb.push(i)
    }

    assertEquals(a.reports.length > 0, true, 'the small buffer overflowed')
    assertEquals(b.reports.length, 0, 'the large one did not')

    qa.close()
    qb.close()

    const seen: number[] = []
    for await (const value of qb.stream) seen.push(value)
    assertEquals(seen, [0, 1, 2])
})

Deno.test('the default bound is documented and stable', () => {
    // A caller sizing `streams × bufferSize × sizeof(Context)` depends on this
    // number; changing it is a behaviour change for every consumer.
    assertEquals(DEFAULT_BUFFER_SIZE, 1024)
    assertEquals(MAX_BUFFER_SIZE, 1_000_000)
})

// =============================================================================
// anyEvent() — FR-006, FR-007 / US3
// =============================================================================

Deno.test('anyEvent - yields { event, data }, the same shape onAny delivers', async () => {
    // #135 suggested `[name, data]`, which came from Emittery's API — and
    // Emittery is what #91 proposed and we did not adopt. A tuple beside
    // onAny()'s object would be two shapes for one concept.
    const emitter = new EventEmitter()
    const stream = emitter.anyEvent()

    await emitter.emit('alpha', 1)
    const first = await stream.next()

    assertEquals(first.done, false)
    assertEquals(first.value, { event: 'alpha', data: 1 })
    await stream.return!()
})

Deno.test('anyEvent - delivers different events in dispatch order', async () => {
    const emitter = new EventEmitter()
    const stream = emitter.anyEvent()

    await emitter.emit('a', 1)
    await emitter.emit('b', 2)
    await emitter.emit('c', 3)

    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
        const next = await stream.next()
        if (!next.done) seen.push(next.value.event)
    }
    assertEquals(seen, ['a', 'b', 'c'])
    await stream.return!()
})

Deno.test('anyEvent - break detaches the wildcard listener', async () => {
    const emitter = new EventEmitter()
    // listenerCount() reads listenerMap and cannot see a wildcard, so it is the
    // wrong instrument here. A second wildcard that keeps counting is the right
    // one: if the stream's listener stayed attached it would keep buffering.
    let others = 0
    emitter.onAny(() => void others++)

    const stream = emitter.anyEvent()
    await emitter.emit('a', 1)
    for await (const _ of stream) break

    await emitter.emit('b', 2)
    assertEquals(others, 2, 'the unrelated wildcard still runs')

    // The stream is closed; asking again yields done rather than a new frame.
    assertEquals((await stream.next()).done, true)
})

Deno.test('anyEvent - and eventStream open at once both receive the event', async () => {
    const emitter = new EventEmitter()
    const all = emitter.anyEvent()
    const one = eventStream<number>(emitter, 'tick')

    await emitter.emit('tick', 7)

    assertEquals((await all.next()).value, { event: 'tick', data: 7 })
    assertEquals((await one.next()).value, 7)

    await all.return!()
    await one.return!()
})

Deno.test('anyEvent - honours bufferSize and onOverflow identically', async () => {
    const emitter = new EventEmitter()
    const stream = emitter.anyEvent({
        bufferSize: 2,
        onOverflow: 'drop-oldest',
    })

    for (const n of [1, 2, 3, 4]) await emitter.emit('n', n)

    const seen: number[] = []
    for (let i = 0; i < 2; i++) {
        const next = await stream.next()
        if (!next.done) seen.push(next.value.data as number)
    }
    assertEquals(seen, [3, 4], 'one queue, one behaviour')
    await stream.return!()
})

Deno.test('anyEvent - rejects a bad bufferSize the same way eventStream does', () => {
    const emitter = new EventEmitter()
    assertThrows(
        () => emitter.anyEvent({ bufferSize: 1e21 }),
        RangeError,
        'bufferSize must be an integer',
    )
})
