import { assertEquals, assertExists } from '@std/assert'
import {
    configureEvents,
    createEventBus,
    emit,
    emitSync,
    EventEmitter,
    events,
    eventStream,
    off,
    on,
    once,
    waitForEvent,
} from '../mod.ts'

// =============================================================================
// EventEmitter Basic Tests
// =============================================================================

Deno.test('EventEmitter - basic on and emit', async () => {
    const emitter = new EventEmitter<{ test: string }>()
    let received: string | undefined

    emitter.on('test', (data) => {
        received = data
    })

    await emitter.emit('test', 'hello')

    assertEquals(received, 'hello')
})

Deno.test('EventEmitter - multiple listeners', async () => {
    const emitter = new EventEmitter<{ test: string }>()
    const results: string[] = []

    emitter.on('test', (data) => {
        results.push(`listener1: ${data}`)
    })

    emitter.on('test', (data) => {
        results.push(`listener2: ${data}`)
    })

    await emitter.emit('test', 'hello')

    assertEquals(results.length, 2)
    assertEquals(results[0], 'listener1: hello')
    assertEquals(results[1], 'listener2: hello')
})

Deno.test('EventEmitter - async listeners', async () => {
    const emitter = new EventEmitter<{ test: string }>()
    const results: string[] = []

    emitter.on('test', async (data) => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        results.push(`async1: ${data}`)
    })

    emitter.on('test', async (data) => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        results.push(`async2: ${data}`)
    })

    await emitter.emit('test', 'hello')

    assertEquals(results.length, 2)
})

Deno.test('EventEmitter - listener priorities', async () => {
    const emitter = new EventEmitter()
    const results: string[] = []

    emitter.on('test', () => {
        results.push('low')
    }, { priority: 0 })
    emitter.on('test', () => {
        results.push('high')
    }, { priority: 10 })
    emitter.on('test', () => {
        results.push('medium')
    }, { priority: 5 })

    await emitter.emit('test', null)

    assertEquals(results, ['high', 'medium', 'low'])
})

Deno.test('EventEmitter - once listener', async () => {
    const emitter = new EventEmitter()
    let count = 0

    emitter.once('test', () => {
        count++
    })

    await emitter.emit('test', null)
    await emitter.emit('test', null)
    await emitter.emit('test', null)

    assertEquals(count, 1)
})

Deno.test('EventEmitter - off removes listener', async () => {
    const emitter = new EventEmitter()
    let count = 0

    const listener = () => {
        count++
    }

    emitter.on('test', listener)
    await emitter.emit('test', null)

    emitter.off('test', listener)
    await emitter.emit('test', null)

    assertEquals(count, 1)
})

Deno.test('EventEmitter - removeAllListeners', async () => {
    const emitter = new EventEmitter()
    let count = 0

    emitter.on('test1', () => {
        count++
    })
    emitter.on('test1', () => {
        count++
    })
    emitter.on('test2', () => {
        count++
    })

    emitter.removeAllListeners('test1')
    await emitter.emit('test1', null)
    await emitter.emit('test2', null)

    assertEquals(count, 1) // Only test2 fired
})

Deno.test('EventEmitter - removeAllListeners without event', async () => {
    const emitter = new EventEmitter()
    let count = 0

    emitter.on('test1', () => {
        count++
    })
    emitter.on('test2', () => {
        count++
    })

    emitter.removeAllListeners()
    await emitter.emit('test1', null)
    await emitter.emit('test2', null)

    assertEquals(count, 0)
})

Deno.test('EventEmitter - listenerCount', () => {
    const emitter = new EventEmitter()

    emitter.on('test', () => {})
    emitter.on('test', () => {})
    emitter.on('other', () => {})

    assertEquals(emitter.listenerCount('test'), 2)
    assertEquals(emitter.listenerCount('other'), 1)
    assertEquals(emitter.listenerCount('nonexistent'), 0)
})

Deno.test('EventEmitter - eventNames', () => {
    const emitter = new EventEmitter()

    emitter.on('test1', () => {})
    emitter.on('test2', () => {})
    emitter.on('test3', () => {})

    const names = emitter.eventNames()
    assertEquals(names.length, 3)
    assertEquals(names.includes('test1'), true)
    assertEquals(names.includes('test2'), true)
    assertEquals(names.includes('test3'), true)
})

Deno.test('EventEmitter - listeners', () => {
    const emitter = new EventEmitter()

    const listener1 = () => {}
    const listener2 = () => {}

    emitter.on('test', listener1)
    emitter.on('test', listener2)

    const listeners = emitter.listeners('test')
    assertEquals(listeners.length, 2)
    assertEquals(listeners[0], listener1)
    assertEquals(listeners[1], listener2)
})

Deno.test('EventEmitter - emitSync', async () => {
    const emitter = new EventEmitter()
    let received: string | undefined

    emitter.on('test', (data: string) => {
        received = data
    })

    emitter.emitSync('test', 'hello')

    // Wait for async to complete (reduced delay)
    await new Promise((resolve) => setTimeout(resolve, 1))
    assertEquals(received, 'hello')
})

Deno.test('EventEmitter - onAny wildcard listener', async () => {
    const emitter = new EventEmitter()
    const results: Array<{ event: string; data: unknown }> = []

    emitter.onAny((payload) => {
        results.push(payload)
    })

    await emitter.emit('event1', 'data1')
    await emitter.emit('event2', 'data2')

    assertEquals(results.length, 2)
})

Deno.test('EventEmitter - offAny removes wildcard listener', async () => {
    const emitter = new EventEmitter()
    let count = 0

    const listener = () => {
        count++
    }

    emitter.onAny(listener)
    await emitter.emit('test', null)

    emitter.offAny(listener)
    await emitter.emit('test', null)

    assertEquals(count, 1)
})

Deno.test('EventEmitter - setMaxListeners', () => {
    const emitter = new EventEmitter()

    emitter.setMaxListeners(20)
    assertEquals(emitter.getMaxListeners(), 20)
})

// =============================================================================
// Type-safe Events Tests
// =============================================================================

Deno.test('EventEmitter - type-safe events', async () => {
    interface AppEvents {
        'user:created': { id: number; name: string }
        'user:deleted': { id: number }
        'error': Error
    }

    const emitter = new EventEmitter<AppEvents>()
    let userData: { id: number; name: string } | undefined

    emitter.on('user:created', (data) => {
        userData = data
    })

    await emitter.emit('user:created', { id: 1, name: 'Alice' })

    assertEquals(userData?.id, 1)
    assertEquals(userData?.name, 'Alice')
})

// =============================================================================
// Global Events Tests
// =============================================================================

Deno.test('configureEvents - sets up global emitter', async () => {
    const emitter = configureEvents()
    let received: string | undefined

    emitter.on('global-test', (data: string) => {
        received = data
    })

    await emitter.emit('global-test', 'hello')

    assertEquals(received, 'hello')
})

Deno.test('events - returns global emitter', async () => {
    const emitter = events()
    let received: string | undefined

    emitter.on('test', (data: string) => {
        received = data
    })

    await emitter.emit('test', 'world')

    assertEquals(received, 'world')
})

Deno.test('on - global helper', async () => {
    let received: string | undefined

    on('helper-test', (data: string) => {
        received = data
    })

    await emit('helper-test', 'hello')

    assertEquals(received, 'hello')
})

Deno.test('once - global helper', async () => {
    let count = 0

    once('once-test', () => {
        count++
    })

    await emit('once-test', null)
    await emit('once-test', null)

    assertEquals(count, 1)
})

Deno.test('off - global helper', async () => {
    let count = 0

    const listener = () => {
        count++
    }

    on('off-test', listener)
    await emit('off-test', null)

    off('off-test', listener)
    await emit('off-test', null)

    assertEquals(count, 1)
})

Deno.test('emitSync - global helper', async () => {
    let received: string | undefined

    on('sync-test', (data: string) => {
        received = data
    })

    emitSync('sync-test', 'hello')

    // Wait for async to complete (reduced delay)
    await new Promise((resolve) => setTimeout(resolve, 1))
    assertEquals(received, 'hello')
})

// =============================================================================
// Utility Tests
// =============================================================================

Deno.test('createEventBus - isolated bus', async () => {
    const bus1 = createEventBus()
    const bus2 = createEventBus()

    let count1 = 0
    let count2 = 0

    bus1.on('test', () => {
        count1++
    })
    bus2.on('test', () => {
        count2++
    })

    await bus1.emit('test', null)

    assertEquals(count1, 1)
    assertEquals(count2, 0) // Not affected
})

Deno.test('waitForEvent - waits for event', async () => {
    const emitter = new EventEmitter()

    const promise = waitForEvent<string>(emitter, 'delayed')

    // Emit after starting wait (reduced delay)
    await new Promise((resolve) => setTimeout(resolve, 1))
    emitter.emit('delayed', 'result')

    const result = await promise
    assertEquals(result, 'result')
})

Deno.test('waitForEvent - timeout', async () => {
    const emitter = new EventEmitter()
    let error: Error | undefined

    try {
        await waitForEvent(emitter, 'never-fired', 50)
    } catch (e) {
        error = e as Error
    }

    assertExists(error)
    assertEquals(error!.message.includes('Timeout'), true)
})

Deno.test('eventStream - async iteration', async () => {
    const emitter = new EventEmitter()
    const results: number[] = []

    // Emit events after a small delay
    setTimeout(() => {
        emitter.emit('stream-test', 1)
        emitter.emit('stream-test', 2)
        emitter.emit('stream-test', 3)
    }, 1)

    const stream = eventStream<number>(emitter, 'stream-test')
    let count = 0

    for await (const value of stream) {
        results.push(value)
        count++
        if (count >= 3) {
            break
        }
    }

    assertEquals(results, [1, 2, 3])
})

// =============================================================================
// Real-world Patterns Tests
// =============================================================================

Deno.test('EventEmitter - domain events pattern', async () => {
    interface DomainEvents {
        'order:placed': { orderId: string; total: number }
        'order:shipped': { orderId: string; trackingNumber: string }
        'order:delivered': { orderId: string }
    }

    const emitter = new EventEmitter<DomainEvents>()
    const orderLog: string[] = []

    emitter.on('order:placed', (data) => {
        orderLog.push(`Order ${data.orderId} placed: $${data.total}`)
    })

    emitter.on('order:shipped', (data) => {
        orderLog.push(`Order ${data.orderId} shipped: ${data.trackingNumber}`)
    })

    emitter.on('order:delivered', (data) => {
        orderLog.push(`Order ${data.orderId} delivered`)
    })

    await emitter.emit('order:placed', { orderId: 'ORD-123', total: 99.99 })
    await emitter.emit('order:shipped', {
        orderId: 'ORD-123',
        trackingNumber: 'TRACK-456',
    })
    await emitter.emit('order:delivered', { orderId: 'ORD-123' })

    assertEquals(orderLog.length, 3)
    assertEquals(orderLog[0].includes('placed'), true)
    assertEquals(orderLog[1].includes('shipped'), true)
    assertEquals(orderLog[2].includes('delivered'), true)
})

Deno.test('EventEmitter - pub/sub pattern', async () => {
    const bus = createEventBus()
    const messages: string[] = []

    // Subscriber 1
    bus.on('message', (data: string) => {
        messages.push(`Sub1: ${data}`)
    })

    // Subscriber 2
    bus.on('message', (data: string) => {
        messages.push(`Sub2: ${data}`)
    })

    // Publisher
    await bus.emit('message', 'Hello, World!')

    assertEquals(messages.length, 2)
    assertEquals(messages[0], 'Sub1: Hello, World!')
    assertEquals(messages[1], 'Sub2: Hello, World!')
})

Deno.test('EventEmitter - error handling', async () => {
    const emitter = new EventEmitter()
    let errorCaught = false

    // Listener that throws
    emitter.on('test', () => {
        throw new Error('Oops!')
    })

    // This listener should still execute
    emitter.on('test', () => {
        errorCaught = true
    })

    await emitter.emit('test', null)

    // Despite first listener throwing, second should execute
    assertEquals(errorCaught, true)
})

// =============================================================================
// Dispatch immunity to concurrent modification — FR-000 / US0
// =============================================================================

Deno.test('emit - a listener that removes itself does not skip the next one', async () => {
    // `emit()` used to iterate the LIVE array held in listenerMap while `off()`
    // spliced that same array, so removing index 0 mid-dispatch shifted index 1
    // out from under the cursor. An abort handler is exactly this shape, which
    // is why this had to be fixed before AbortSignal support could land.
    const emitter = new EventEmitter()
    const ran: string[] = []

    const a = () => {
        ran.push('A')
        emitter.off('x', a)
    }
    const b = () => void ran.push('B')
    const c = () => void ran.push('C')

    emitter.on('x', a)
    emitter.on('x', b)
    emitter.on('x', c)

    await emitter.emit('x', null)

    assertEquals(ran, ['A', 'B', 'C'], 'B was in the dispatch and must run')
})

Deno.test('emit - the wildcard path has the same immunity', async () => {
    // It always did: `emit()` spread wildcardListeners into a copy. This pins
    // the behaviour the specific-event path was brought up to match, so the two
    // cannot drift apart again.
    const emitter = new EventEmitter()
    const ran: string[] = []

    const a = (payload: unknown) => {
        ran.push('A')
        emitter.offAny(a as never)
        void payload
    }
    const b = () => void ran.push('B')

    emitter.onAny(a as never)
    emitter.onAny(b as never)

    await emitter.emit('x', null)

    assertEquals(ran, ['A', 'B'])
})

Deno.test('emit - a listener added during a dispatch runs in the NEXT one, not this one', async () => {
    // The other half of "the dispatch runs the listeners that existed when it
    // started" — invariant 3. Without the snapshot this depends on where the
    // priority sort happened to place the new entry.
    const emitter = new EventEmitter()
    const ran: string[] = []

    // The late listener carries a HIGHER priority. With equal priorities the
    // expected order is satisfied by insertion alone, and the assertion would
    // hold with the registration-time sort deleted — which is what FR-013
    // ("ordering unchanged, including for a listener registered after the first
    // emit") exists to prevent.
    const late = () => void ran.push('late')
    const first = () => {
        ran.push('first')
        emitter.on('x', late, { priority: 100 })
    }

    emitter.on('x', first)

    await emitter.emit('x', null)
    assertEquals(
        ran,
        ['first'],
        'the late listener was not part of this dispatch',
    )

    await emitter.emit('x', null)
    assertEquals(
        ran,
        ['first', 'late', 'first'],
        'and in the next it runs FIRST — priority survives late registration',
    )
})

Deno.test('a signal aborting DURING a dispatch takes effect from the next one', async () => {
    // The edge case FR-000's sequencing argument rests on, and the shape the
    // snapshot tests missed: they all used off()/offAny(), never an abort fired
    // from inside a listener while the dispatch was in flight.
    const emitter = new EventEmitter()
    const controller = new AbortController()
    const ran: string[] = []

    emitter.on('x', () => {
        ran.push('a')
        controller.abort() // removes BOTH, mid-dispatch
    }, { signal: controller.signal })
    emitter.on('x', () => void ran.push('b'), { signal: controller.signal })

    await emitter.emit('x', null)
    assertEquals(ran, ['a', 'b'], 'both were in the snapshot, so both ran')

    await emitter.emit('x', null)
    assertEquals(ran, ['a', 'b'], 'and neither survives into the next dispatch')
    assertEquals(emitter.listenerCount('x'), 0)
})

// =============================================================================
// AbortSignal — FR-001..FR-005, FR-015 / US2
// =============================================================================

Deno.test('on - aborting the signal removes the listener', async () => {
    const emitter = new EventEmitter()
    const controller = new AbortController()
    let ran = 0

    emitter.on('x', () => void ran++, { signal: controller.signal })
    await emitter.emit('x', null)
    assertEquals(ran, 1)

    controller.abort()
    await emitter.emit('x', null)
    assertEquals(ran, 1, 'the listener is gone')
    assertEquals(emitter.listenerCount('x'), 0)
})

Deno.test('on - an ALREADY-aborted signal never registers the listener', async () => {
    // Not "registered then immediately removed": never registered. The
    // difference is observable through listenerCount between the two calls.
    const emitter = new EventEmitter()
    const controller = new AbortController()
    controller.abort()

    let ran = 0
    emitter.on('x', () => void ran++, { signal: controller.signal })

    assertEquals(emitter.listenerCount('x'), 0)
    await emitter.emit('x', null)
    assertEquals(ran, 0)
})

Deno.test('on - aborting after off() is a no-op and does not throw', async () => {
    // This was FR-003's only test and it asserted NOTHING — not one assert call
    // in the body. "Does not throw" was not covered either: emit() swallows a
    // listener's throw into console.error by design, so a broken path produced
    // a green test.
    const emitter = new EventEmitter()
    const controller = new AbortController()
    let ran = 0
    const fn = () => void ran++

    emitter.on('x', fn, { signal: controller.signal })
    emitter.off('x', fn)
    assertEquals(emitter.listenerCount('x'), 0, 'off() removed it')

    controller.abort() // the no-op: nothing to remove, and nothing may throw

    assertEquals(emitter.listenerCount('x'), 0, 'and abort changed nothing')
    await emitter.emit('x', null)
    assertEquals(ran, 0, 'the listener is gone and did not run')
})

Deno.test('off - detaches the abort handler, not just the listener', async () => {
    // The assertion lands on the SIGNAL's behaviour, not on listenerCount():
    // an orphaned handler lives on the AbortSignal, not in listenerMap, so
    // listenerCount() returns to its prior value whether or not it leaked.
    //
    // Observable consequence: if the stale handler is still attached, aborting
    // removes the RE-registered listener that has nothing to do with it.
    const emitter = new EventEmitter()
    const controller = new AbortController()
    let ran = 0
    const fn = () => void ran++

    emitter.on('x', fn, { signal: controller.signal })
    emitter.off('x', fn)

    emitter.on('x', fn) // re-registered, deliberately WITHOUT a signal
    controller.abort() // the stale handler, if any, fires here

    await emitter.emit('x', null)
    assertEquals(ran, 1, 'the second registration must survive the abort')
})

Deno.test('removeAllListeners - detaches abort handlers too', async () => {
    // removeAllListeners() is the one removal path that never calls off(), so
    // anything wired into off() alone leaks here.
    const emitter = new EventEmitter()
    const controller = new AbortController()
    let ran = 0
    const fn = () => void ran++

    emitter.on('x', fn, { signal: controller.signal })
    emitter.removeAllListeners()

    emitter.on('x', fn)
    controller.abort()

    await emitter.emit('x', null)
    assertEquals(ran, 1, 'the second registration must survive the abort')
})

Deno.test('onAny - a signalled wildcard listener is removed on abort', async () => {
    const emitter = new EventEmitter()
    const controller = new AbortController()
    let ran = 0

    emitter.onAny(() => void ran++, { signal: controller.signal })
    await emitter.emit('x', null)
    assertEquals(ran, 1)

    controller.abort()
    await emitter.emit('x', null)
    assertEquals(
        ran,
        1,
        'the wildcard path has its own array and its own removal',
    )
})

Deno.test('once + signal - whichever fires first wins, and the other is a no-op', async () => {
    const emitter = new EventEmitter()

    // once fires first
    const a = new AbortController()
    let ranA = 0
    emitter.once('x', () => void ranA++, { signal: a.signal })
    await emitter.emit('x', null)
    a.abort()
    await emitter.emit('x', null)
    assertEquals(ranA, 1)

    // abort fires first
    const b = new AbortController()
    let ranB = 0
    emitter.once('y', () => void ranB++, { signal: b.signal })
    b.abort()
    await emitter.emit('y', null)
    assertEquals(ranB, 0)
})

Deno.test('on - a signalled listener is exempt from the maxListeners warning', () => {
    // US2's own pattern is one registration per request. Without this exemption
    // the framework emits a "possible memory leak" line per request past the
    // tenth concurrent one — a client-controlled log flood, warning about
    // something that is not happening.
    const emitter = new EventEmitter()
    const controller = new AbortController()
    const lines: unknown[][] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => void lines.push(args)

    try {
        for (let i = 0; i < 15; i++) {
            emitter.on('x', () => {}, { signal: controller.signal })
        }
        assertEquals(lines.length, 0, 'no warning for signalled listeners')

        // The warning still works for listeners that have no signal.
        for (let i = 0; i < 15; i++) emitter.on('y', () => {})
        assertEquals(lines.length > 0, true, 'unsignalled listeners still warn')
    } finally {
        console.warn = original
        controller.abort()
    }
})

Deno.test('once + signal - the auto-removal detaches the abort handler too', async () => {
    // The review found this: emit()'s `once` cleanup spliced the array directly
    // instead of going through the removal gate, so `dispose` never ran and the
    // abort handler outlived the listener it belonged to. N once-listeners with
    // one long-lived signal left N dead handlers on it, each retaining the entry
    // and the emitter.
    //
    // The harm is retention, not misbehaviour: #unregister keys on the ENTRY
    // object, so a stale handler firing later finds nothing and does nothing.
    // Re-registering and aborting therefore proves nothing. The assertion has
    // to land on the signal, by counting the detach the removal owes it.
    const emitter = new EventEmitter()
    const controller = new AbortController()
    const signal = controller.signal

    let attached = 0
    let detached = 0
    const addListener = signal.addEventListener.bind(signal)
    const removeListener = signal.removeEventListener.bind(signal)
    signal.addEventListener = ((...args: Parameters<typeof addListener>) => {
        attached++
        return addListener(...args)
    }) as typeof signal.addEventListener
    signal.removeEventListener = ((
        ...args: Parameters<typeof removeListener>
    ) => {
        detached++
        return removeListener(...args)
    }) as typeof signal.removeEventListener

    let ran = 0
    emitter.once('x', () => void ran++, { signal })
    assertEquals(attached, 1, 'registration attached one abort handler')

    await emitter.emit('x', null)

    assertEquals(ran, 1, 'the once listener fired')
    assertEquals(emitter.listenerCount('x'), 0, 'and was removed')
    assertEquals(
        detached,
        1,
        'the removal owes the signal a detach — one attached, one detached',
    )

    controller.abort()
})

Deno.test('once - a consumed listener leaves no empty bucket behind', async () => {
    // off() deletes the map key when the bucket empties; the once path did not,
    // so eventNames() reported an event with no listeners depending on how the
    // last one was removed. One removal gate, one behaviour.
    const emitter = new EventEmitter()
    emitter.once('gone', () => {})
    await emitter.emit('gone', null)

    assertEquals(emitter.listenerCount('gone'), 0)
    assertEquals(
        emitter.eventNames().includes('gone'),
        false,
        'an event nobody listens to is not an event name',
    )
})

Deno.test('on - a REFUSED registration leaves no empty bucket behind', () => {
    // `on()` created the map entry before `#register()` had a chance to refuse,
    // so a listener rejected for an already-aborted signal still left an empty
    // array under its name. `eventNames()` then reported an event nobody
    // listens to — the same inconsistency the once path had, from the other
    // direction.
    const emitter = new EventEmitter()
    const controller = new AbortController()
    controller.abort()

    emitter.on('never-registered', () => {}, { signal: controller.signal })

    assertEquals(emitter.listenerCount('never-registered'), 0)
    assertEquals(
        emitter.eventNames().includes('never-registered'),
        false,
        'a refused registration is not an event name',
    )
})

Deno.test('on - a refused registration does not disturb an existing bucket', async () => {
    // The other half: refusing must not delete listeners that were already
    // there under the same name.
    const emitter = new EventEmitter()
    const controller = new AbortController()
    controller.abort()

    let ran = 0
    emitter.on('shared', () => void ran++)
    emitter.on('shared', () => {}, { signal: controller.signal })

    assertEquals(emitter.listenerCount('shared'), 1)
    await emitter.emit('shared', null)
    assertEquals(ran, 1, 'the pre-existing listener survived')
})
