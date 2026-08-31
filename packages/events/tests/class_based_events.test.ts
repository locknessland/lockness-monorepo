/**
 * Tests for class-based events, EventDispatcher, and @Listener decorator
 */

import { assertEquals, assertExists } from '@std/assert'
import {
    BaseEvent,
    configureEventDispatcher,
    dispatcher,
    EventDispatcher,
    fake,
    getListenerMetadata,
    KernelBooted,
    Listener,
    RequestStarted,
    restore,
} from '../mod.ts'

// =============================================================================
// Test Events
// =============================================================================

class UserCreated extends BaseEvent {
    constructor(
        public readonly userId: string,
        public readonly email: string,
    ) {
        super()
    }
}

class OrderPlaced extends BaseEvent {
    constructor(
        public readonly orderId: string,
        public readonly total: number,
    ) {
        super()
    }
}

class PaymentProcessed extends BaseEvent {
    constructor(
        public readonly paymentId: string,
        public readonly amount: number,
    ) {
        super()
    }
}

// =============================================================================
// BaseEvent Tests
// =============================================================================

Deno.test('BaseEvent - has createdAt timestamp', () => {
    const event = new UserCreated('123', 'test@example.com')

    assertExists(event.createdAt)
    assertEquals(event.createdAt instanceof Date, true)
})

Deno.test('BaseEvent - has eventName property', () => {
    const event = new UserCreated('123', 'test@example.com')

    assertEquals(event.eventName, 'UserCreated')
})

Deno.test('BaseEvent - carries data correctly', () => {
    const event = new OrderPlaced('ORD-123', 99.99)

    assertEquals(event.orderId, 'ORD-123')
    assertEquals(event.total, 99.99)
})

// =============================================================================
// EventDispatcher Tests
// =============================================================================

Deno.test('EventDispatcher - emit and listen to class-based events', async () => {
    const dispatcher = new EventDispatcher()
    let received: UserCreated | null = null

    dispatcher.on(UserCreated, (event) => {
        received = event
    })

    await dispatcher.emit(new UserCreated('123', 'test@example.com'))

    assertExists(received)
    assertEquals((received as UserCreated).userId, '123')
    assertEquals((received as UserCreated).email, 'test@example.com')
})

Deno.test('EventDispatcher - multiple listeners receive same event', async () => {
    const dispatcher = new EventDispatcher()
    const results: string[] = []

    dispatcher.on(UserCreated, (event) => {
        results.push(`listener1: ${event.userId}`)
    })

    dispatcher.on(UserCreated, (event) => {
        results.push(`listener2: ${event.userId}`)
    })

    await dispatcher.emit(new UserCreated('123', 'test@example.com'))

    assertEquals(results.length, 2)
    assertEquals(results[0], 'listener1: 123')
    assertEquals(results[1], 'listener2: 123')
})

Deno.test('EventDispatcher - listeners execute in priority order', async () => {
    const dispatcher = new EventDispatcher()
    const results: string[] = []

    dispatcher.on(UserCreated, () => {
        results.push('low')
    }, { priority: 0 })

    dispatcher.on(UserCreated, () => {
        results.push('high')
    }, { priority: 10 })

    dispatcher.on(UserCreated, () => {
        results.push('medium')
    }, { priority: 5 })

    await dispatcher.emit(new UserCreated('123', 'test@example.com'))

    assertEquals(results, ['high', 'medium', 'low'])
})

Deno.test('EventDispatcher - once listener executes only once', async () => {
    const dispatcher = new EventDispatcher()
    let count = 0

    dispatcher.once(UserCreated, () => {
        count++
    })

    await dispatcher.emit(new UserCreated('123', 'test@example.com'))
    await dispatcher.emit(new UserCreated('456', 'test2@example.com'))

    assertEquals(count, 1)
})

Deno.test('EventDispatcher - off removes listener', async () => {
    const dispatcher = new EventDispatcher()
    let count = 0

    const listener = () => {
        count++
    }

    dispatcher.on(UserCreated, listener)
    await dispatcher.emit(new UserCreated('123', 'test@example.com'))

    dispatcher.off(UserCreated, listener)
    await dispatcher.emit(new UserCreated('456', 'test2@example.com'))

    assertEquals(count, 1)
})

Deno.test('EventDispatcher - onAny receives all events', async () => {
    const dispatcher = new EventDispatcher()
    const events: string[] = []

    dispatcher.onAny(({ event }) => {
        events.push(event)
    })

    await dispatcher.emit(new UserCreated('123', 'test@example.com'))
    await dispatcher.emit(new OrderPlaced('ORD-123', 99.99))

    assertEquals(events.length, 2)
    assertEquals(events[0], 'UserCreated')
    assertEquals(events[1], 'OrderPlaced')
})

Deno.test('EventDispatcher - listenerCount returns correct count', () => {
    const dispatcher = new EventDispatcher()

    dispatcher.on(UserCreated, () => {})
    dispatcher.on(UserCreated, () => {})
    dispatcher.on(OrderPlaced, () => {})

    assertEquals(dispatcher.listenerCount(UserCreated), 2)
    assertEquals(dispatcher.listenerCount(OrderPlaced), 1)
})

Deno.test('EventDispatcher - removeAllListeners works', async () => {
    const dispatcher = new EventDispatcher()
    let count = 0

    dispatcher.on(UserCreated, () => {
        count++
    })
    dispatcher.on(UserCreated, () => {
        count++
    })

    dispatcher.removeAllListeners(UserCreated)
    await dispatcher.emit(new UserCreated('123', 'test@example.com'))

    assertEquals(count, 0)
})

Deno.test('EventDispatcher - emitString for backward compatibility', async () => {
    const dispatcher = new EventDispatcher()
    let received: any = null

    dispatcher.getEmitter().on('custom:event', (data: any) => {
        received = data
    })

    await dispatcher.emitString('custom:event', { foo: 'bar' })

    assertExists(received)
    assertEquals(received.foo, 'bar')
})

// =============================================================================
// Global Dispatcher Tests
// =============================================================================

Deno.test('dispatcher - returns global dispatcher', () => {
    const d1 = dispatcher()
    const d2 = dispatcher()

    assertEquals(d1, d2)
})

Deno.test('configureEventDispatcher - creates new global dispatcher', () => {
    const d1 = configureEventDispatcher()
    const d2 = dispatcher()

    assertEquals(d1, d2)
})

// =============================================================================
// @Listener Decorator Tests
// =============================================================================

Deno.test('@Listener - stores metadata on class', () => {
    class TestListener {
        @Listener(UserCreated)
        handleUserCreated(_event: UserCreated) {
            // Test handler
        }

        @Listener(OrderPlaced, { priority: 10 })
        handleOrderPlaced(_event: OrderPlaced) {
            // Test handler
        }
    }

    // Need to instantiate to trigger addInitializer
    const _instance = new TestListener()
    const metadata = getListenerMetadata(TestListener)

    assertEquals(metadata.length, 2)
    assertEquals(metadata[0].eventClass.name, 'UserCreated')
    assertEquals(metadata[0].methodName, 'handleUserCreated')
    assertEquals(metadata[1].eventClass.name, 'OrderPlaced')
    assertEquals(metadata[1].methodName, 'handleOrderPlaced')
    assertEquals(metadata[1].options.priority, 10)
})

// =============================================================================
// Framework Events Tests
// =============================================================================

Deno.test('KernelBooted - creates event with properties', () => {
    const event = new KernelBooted('MyApp', 'development')

    assertEquals(event.appName, 'MyApp')
    assertEquals(event.environment, 'development')
    assertEquals(event.eventName, 'KernelBooted')
    assertExists(event.createdAt)
})

Deno.test('RequestStarted - creates event with context', () => {
    const mockContext = {} as any
    const event = new RequestStarted(
        mockContext,
        'GET',
        '/api/users',
        'req-123',
    )

    assertEquals(event.method, 'GET')
    assertEquals(event.path, '/api/users')
    assertEquals(event.requestId, 'req-123')
    assertEquals(event.eventName, 'RequestStarted')
})

// =============================================================================
// Testing Utilities Tests
// =============================================================================

Deno.test('fake - captures emitted events', async () => {
    const fakeBuffer = fake()

    await dispatcher().emit(new UserCreated('123', 'test@example.com'))
    await dispatcher().emit(new OrderPlaced('ORD-123', 99.99))

    assertEquals(fakeBuffer.count(), 2)

    restore()
})

Deno.test('fake - assertEmitted works', async () => {
    const fakeBuffer = fake()

    await dispatcher().emit(new UserCreated('123', 'test@example.com'))

    fakeBuffer.assertEmitted(UserCreated)

    restore()
})

Deno.test('fake - assertEmitted with predicate works', async () => {
    const fakeBuffer = fake()

    await dispatcher().emit(new UserCreated('123', 'test@example.com'))
    await dispatcher().emit(new UserCreated('456', 'other@example.com'))

    fakeBuffer.assertEmitted(UserCreated, (event) => event.userId === '123')

    restore()
})

Deno.test('fake - assertNotEmitted works', async () => {
    const fakeBuffer = fake()

    await dispatcher().emit(new UserCreated('123', 'test@example.com'))

    fakeBuffer.assertNotEmitted(OrderPlaced)

    restore()
})

Deno.test('fake - assertEmittedCount works', async () => {
    const fakeBuffer = fake()

    await dispatcher().emit(new UserCreated('123', 'test@example.com'))
    await dispatcher().emit(new UserCreated('456', 'other@example.com'))

    fakeBuffer.assertEmittedCount(UserCreated, 2)

    restore()
})

Deno.test('fake - allOfType returns events of specific type', async () => {
    const fakeBuffer = fake()

    await dispatcher().emit(new UserCreated('123', 'test@example.com'))
    await dispatcher().emit(new OrderPlaced('ORD-123', 99.99))
    await dispatcher().emit(new UserCreated('456', 'other@example.com'))

    const userEvents = fakeBuffer.allOfType(UserCreated)

    assertEquals(userEvents.length, 2)
    assertEquals(userEvents[0].event.userId, '123')
    assertEquals(userEvents[1].event.userId, '456')

    restore()
})

Deno.test('fake - clear removes recorded events', async () => {
    const fakeBuffer = fake()

    await dispatcher().emit(new UserCreated('123', 'test@example.com'))
    assertEquals(fakeBuffer.count(), 1)

    fakeBuffer.clear()
    assertEquals(fakeBuffer.count(), 0)

    restore()
})

Deno.test('fake - countOfType returns correct count', async () => {
    const fakeBuffer = fake()

    await dispatcher().emit(new UserCreated('123', 'test@example.com'))
    await dispatcher().emit(new OrderPlaced('ORD-123', 99.99))
    await dispatcher().emit(new UserCreated('456', 'other@example.com'))

    assertEquals(fakeBuffer.countOfType(UserCreated), 2)
    assertEquals(fakeBuffer.countOfType(OrderPlaced), 1)
    assertEquals(fakeBuffer.countOfType(PaymentProcessed), 0)

    restore()
})

// =============================================================================
// Integration Tests
// =============================================================================

Deno.test('Integration - listener class with DI pattern', async () => {
    class EmailService {
        async sendEmail(_to: string, _subject: string): Promise<void> {
            // Mock email sending
        }
    }

    class UserListener {
        constructor(private emailService: EmailService) {}

        @Listener(UserCreated)
        async sendWelcomeEmail(event: UserCreated) {
            await this.emailService.sendEmail(
                event.email,
                'Welcome!',
            )
        }

        @Listener(UserCreated, { priority: 10 })
        logUserCreation(event: UserCreated) {
            console.log(`User created: ${event.userId}`)
        }
    }

    const emailService = new EmailService()
    const listener = new UserListener(emailService)

    // Verify metadata is stored
    const metadata = getListenerMetadata(UserListener)
    assertEquals(metadata.length, 2)

    // Manually wire up listeners (in real app, this would be done by kernel)
    const disp = new EventDispatcher()
    metadata.forEach((meta) => {
        const method = (listener as any)[meta.methodName].bind(listener)
        disp.on(meta.eventClass, method, meta.options)
    })

    // Emit event
    let logCalled = false
    const originalLog = console.log

    try {
        console.log = () => {
            logCalled = true
        }

        await disp.emit(new UserCreated('123', 'test@example.com'))

        assertEquals(logCalled, true)
    } finally {
        console.log = originalLog
    }
})

Deno.test('EventDispatcher - forwards a signal and wires nothing itself', async () => {
    // FR-005: the dispatcher is a pass-through. If it grew its own abort
    // handling there would be two decisions about when a listener dies, and the
    // wildcard path would have a third.
    class Ping extends BaseEvent {}

    const dispatcher = new EventDispatcher()
    const controller = new AbortController()
    let specific = 0
    let wildcard = 0

    dispatcher.on(Ping, () => void specific++, { signal: controller.signal })
    dispatcher.onAny(() => void wildcard++, { signal: controller.signal })

    await dispatcher.emit(new Ping())
    assertEquals(specific, 1)
    assertEquals(wildcard, 1)

    controller.abort()
    await dispatcher.emit(new Ping())
    assertEquals(specific, 1, 'the specific listener was removed')
    assertEquals(wildcard, 1, 'and so was the wildcard one')
})

Deno.test('EventDispatcher - an already-aborted signal registers nothing', async () => {
    class Pong extends BaseEvent {}

    const dispatcher = new EventDispatcher()
    const controller = new AbortController()
    controller.abort()

    let ran = 0
    dispatcher.on(Pong, () => void ran++, { signal: controller.signal })

    await dispatcher.emit(new Pong())
    assertEquals(ran, 0)
})

Deno.test('removeAllListeners detaches EventBuffer’s recorder', async () => {
    // Not a defect being fixed — a trap being pinned. EventBuffer records by
    // registering an ordinary wildcard listener, and removeAllListeners()
    // clears wildcards. Any test that calls it kills the recorder, and every
    // later assertEmitted then fails while pointing the developer at production
    // code that emitted perfectly well.
    class Ping extends BaseEvent {}

    const buffer = fake()
    try {
        await buffer.getDispatcher().emit(new Ping())
        assertEquals(buffer.count(), 1)

        buffer.getDispatcher().getEmitter().removeAllListeners()

        await buffer.getDispatcher().emit(new Ping())
        assertEquals(
            buffer.count(),
            1,
            'the recorder is gone — this is the trap, documented rather than fixed',
        )
    } finally {
        restore()
    }
})
