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
} from '../events.ts'

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
        await new Promise(resolve => setTimeout(resolve, 10))
        results.push(`async1: ${data}`)
    })

    emitter.on('test', async (data) => {
        await new Promise(resolve => setTimeout(resolve, 5))
        results.push(`async2: ${data}`)
    })

    await emitter.emit('test', 'hello')

    assertEquals(results.length, 2)
})

Deno.test('EventEmitter - listener priorities', async () => {
    const emitter = new EventEmitter()
    const results: string[] = []

    emitter.on('test', () => { results.push('low') }, { priority: 0 })
    emitter.on('test', () => { results.push('high') }, { priority: 10 })
    emitter.on('test', () => { results.push('medium') }, { priority: 5 })

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

    emitter.on('test1', () => { count++ })
    emitter.on('test1', () => { count++ })
    emitter.on('test2', () => { count++ })

    emitter.removeAllListeners('test1')
    await emitter.emit('test1', null)
    await emitter.emit('test2', null)

    assertEquals(count, 1) // Only test2 fired
})

Deno.test('EventEmitter - removeAllListeners without event', async () => {
    const emitter = new EventEmitter()
    let count = 0

    emitter.on('test1', () => { count++ })
    emitter.on('test2', () => { count++ })

    emitter.removeAllListeners()
    await emitter.emit('test1', null)
    await emitter.emit('test2', null)

    assertEquals(count, 0)
})

Deno.test('EventEmitter - listenerCount', () => {
    const emitter = new EventEmitter()

    emitter.on('test', () => { })
    emitter.on('test', () => { })
    emitter.on('other', () => { })

    assertEquals(emitter.listenerCount('test'), 2)
    assertEquals(emitter.listenerCount('other'), 1)
    assertEquals(emitter.listenerCount('nonexistent'), 0)
})

Deno.test('EventEmitter - eventNames', () => {
    const emitter = new EventEmitter()

    emitter.on('test1', () => { })
    emitter.on('test2', () => { })
    emitter.on('test3', () => { })

    const names = emitter.eventNames()
    assertEquals(names.length, 3)
    assertEquals(names.includes('test1'), true)
    assertEquals(names.includes('test2'), true)
    assertEquals(names.includes('test3'), true)
})

Deno.test('EventEmitter - listeners', () => {
    const emitter = new EventEmitter()

    const listener1 = () => { }
    const listener2 = () => { }

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

    // Wait for async to complete
    await new Promise(resolve => setTimeout(resolve, 20))
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

    // Wait for async to complete
    await new Promise(resolve => setTimeout(resolve, 20))
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

    bus1.on('test', () => { count1++ })
    bus2.on('test', () => { count2++ })

    await bus1.emit('test', null)

    assertEquals(count1, 1)
    assertEquals(count2, 0) // Not affected
})

Deno.test('waitForEvent - waits for event', async () => {
    const emitter = new EventEmitter()

    const promise = waitForEvent<string>(emitter, 'delayed')

    // Emit after starting wait
    await new Promise(resolve => setTimeout(resolve, 10))
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

    // Emit events after a delay
    setTimeout(() => {
        emitter.emit('stream-test', 1)
        emitter.emit('stream-test', 2)
        emitter.emit('stream-test', 3)
    }, 10)

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
    await emitter.emit('order:shipped', { orderId: 'ORD-123', trackingNumber: 'TRACK-456' })
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
