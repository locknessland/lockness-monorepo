# Lockness Events

Modern, type-safe event system for Deno with async support, class-based events,
decorator-driven listeners, and full DI integration.

> **New to Lockness Events?** Start with the
> [Lifecycle Events Guide](/docs/lifecycle-events) for a tutorial-style
> introduction, best practices, and advanced patterns like Saga and Event
> Sourcing.

## Overview

@lockness/events provides a comprehensive event system with:

- **Type Safety** - Generic event types with full TypeScript inference
- **Class-based Events** - Extend `BaseEvent` for structured event data
- **Decorator Listeners** - `@Listener` decorator for auto-discovered event
  handlers
- **DI Integration** - Listeners are managed by the container with full
  dependency injection
- **Async Support** - Native async/await for event listeners
- **Priorities** - Execute listeners in priority order
- **Framework Events** - Built-in lifecycle events (KernelBooted,
  RequestStarted, etc.)
- **Testing Utilities** - `fake()` and assertions for testing event-driven code
- **Backward Compatible** - String-based events still work via EventEmitter

## Installation

```typescript
import { BaseEvent, dispatcher, KernelBooted, Listener } from '@lockness/core'

// Or directly from events package
import { BaseEvent, dispatcher, Listener } from '@lockness/events'
```

## Quick Start

### 1. Define an Event

```typescript
// app/events/user_registered.ts
import { BaseEvent } from '@lockness/core'
import type { User } from '#models/user'

export class UserRegistered extends BaseEvent {
    constructor(
        public readonly user: User,
        public readonly ipAddress: string,
    ) {
        super()
    }
}
```

### 2. Create a Listener

```typescript
// app/listener/user_listener.ts
import { Service } from '@lockness/container'
import { Listener } from '@lockness/core'
import { UserRegistered } from '#events/user_registered'

@Service()
export class UserListener {
    constructor(
        private mail: MailService,
        private analytics: AnalyticsService,
    ) {}

    @Listener(UserRegistered)
    async sendWelcomeEmail(event: UserRegistered) {
        await this.mail.send(event.user.email, 'Welcome!', {
            name: event.user.name,
        })
    }

    @Listener(UserRegistered, { priority: 10 })
    async trackRegistration(event: UserRegistered) {
        await this.analytics.track('user:registered', {
            userId: event.user.id,
            ipAddress: event.ipAddress,
        })
    }
}
```

### 3. Emit the Event

```typescript
// In a controller or service
import { dispatcher } from '@lockness/core'
import { UserRegistered } from '#events/user_registered'

export class UserController {
    @Post('/register')
    async register(c: Context) {
        const user = await this.userService.create(data)

        // Emit event - all listeners are invoked automatically
        await dispatcher().emit(
            new UserRegistered(user, c.req.header('x-real-ip')),
        )

        return c.json({ user })
    }
}
```

### 4. Listeners Are Auto-Discovered

Listeners in `app/listener/` are automatically discovered and registered during
app bootstrap. No manual registration needed!

## API Reference

### on(event, listener, config?)

Register an event listener:

```typescript
emitter.on('event', (data) => {
    console.log(data)
})

// With priority (higher = executes first)
emitter.on('event', handler, { priority: 10 })

// As one-time listener
emitter.on('event', handler, { once: true })
```

### once(event, listener, config?)

Register a one-time listener (auto-removed after first execution):

```typescript
emitter.once('connect', () => {
    console.log('Connected!')
})

await emitter.emit('connect', null) // Fires
await emitter.emit('connect', null) // Doesn't fire (removed)
```

### emit(event, data)

Emit an event to all listeners (async):

```typescript
await emitter.emit('user:created', { id: 1, name: 'Alice' })
```

### emitSync(event, data)

Emit without waiting for async listeners:

```typescript
emitter.emitSync('log', 'message')
// Returns immediately, listeners run in background
```

### off(event, listener)

Remove a specific listener:

```typescript
const handler = (data) => console.log(data)

emitter.on('event', handler)
emitter.off('event', handler) // Removed
```

### removeAllListeners(event?)

Remove all listeners for an event, or all events:

```typescript
emitter.removeAllListeners('event') // Remove all for 'event'
emitter.removeAllListeners() // Remove all listeners
```

### onAny(listener, config?)

Listen to all events with wildcard:

```typescript
emitter.onAny((payload) => {
    console.log(`Event: ${payload.event}`)
    console.log(`Data:`, payload.data)
})

await emitter.emit('anything', 'data')
// Logs: Event: anything, Data: data
```

### offAny(listener)

Remove a wildcard listener:

```typescript
const handler = (payload) => console.log(payload)

emitter.onAny(handler)
emitter.offAny(handler) // Removed
```

### Inspection Methods

```typescript
// Get listener count for event
emitter.listenerCount('user:created') // 5

// Get all registered event names
emitter.eventNames() // ['user:created', 'user:deleted']

// Get all listeners for event
emitter.listeners('user:created') // [fn1, fn2, fn3]

// Set/get max listeners warning threshold
emitter.setMaxListeners(20)
emitter.getMaxListeners() // 20
```

## Listener Priorities

Execute listeners in priority order (higher = first):

```typescript
emitter.on('load', () => console.log('3rd'), { priority: 0 })
emitter.on('load', () => console.log('1st'), { priority: 10 })
emitter.on('load', () => console.log('2nd'), { priority: 5 })

await emitter.emit('load', null)
// Output: 1st, 2nd, 3rd
```

## Helper Functions

Quick operations on global emitter:

```typescript
import { emit, emitSync, off, on, once } from '@lockness/events'

on('event', handler)
await emit('event', data)
off('event', handler)
```

## Utilities

### Event Bus

Create isolated event emitters:

```typescript
import { createEventBus } from '@lockness/events'

const bus1 = createEventBus()
const bus2 = createEventBus()

bus1.on('event', () => console.log('Bus 1'))
bus2.on('event', () => console.log('Bus 2'))

await bus1.emit('event', null) // Only bus1 listeners fire
```

### Wait for Event

Wait for an event and return its data:

```typescript
import { waitForEvent } from '@lockness/events'

// Wait for event
const promise = waitForEvent<string>(emitter, 'result')

// Somewhere else...
emitter.emit('result', 'success')

const data = await promise // 'success'

// With timeout (5 seconds)
try {
    const data = await waitForEvent(emitter, 'result', 5000)
} catch (error) {
    console.log('Timeout!')
}
```

### Event Stream

Convert one event to an async iterable:

```typescript
import { eventStream } from '@lockness/events'

for await (const value of eventStream<number>(emitter, 'tick')) {
    console.log(value)
    if (value >= 10) break // detaches the listener
}
```

The listener comes off when the iteration ends — by `break`, by an exception in
the loop body, or by calling `return()`.

### Every event, as an iterable

`onAny()` is a callback; `anyEvent()` is the same thing you can `for await`
over. It yields the **same shape** — `{ event, data }` — because two shapes for
one concept is one too many.

```typescript
for await (const { event, data } of emitter.anyEvent()) {
    console.log(event)
    if (enough) break
}
```

It grants no access `onAny()` did not already grant. What it adds is
**retention**: see the buffer section below.

### Buffers are bounded

Both streams buffer, and the buffer has a ceiling. A consumer that stops pulling
does not grow it without limit — it drops, and says so.

```typescript
emitter.anyEvent({ bufferSize: 256, onOverflow: 'drop-oldest' })
```

| Option       | Default         | Meaning                                                             |
| :----------- | :-------------- | :------------------------------------------------------------------ |
| `bufferSize` | `1024`          | Frames held before dropping starts. `1..1_000_000`.                 |
| `onOverflow` | `'drop-oldest'` | `'drop-oldest'` keeps the newest, `'drop-newest'` keeps the oldest. |

An unrecognised policy is **refused**, not quietly defaulted, and a `bufferSize`
outside its bounds throws. `Number.isInteger(1e21)` is `true`, which is why the
upper bound exists at all: without it that value passes a "positive integer"
check and the buffer is unbounded again behind an API that says it is not.

**`bufferSize` is a developer-supplied constant. Never derive it from request
input** — a bound a client chooses is not a bound.

An overflow is reported twice per episode and no more: once when dropping
starts, once when it stops, with the running total. The report carries the event
name, the count and the bound — **never the dropped frame**, because a frame
here is a lifecycle event holding the request `Context` with its headers and
session cookie.

> **Sizing.** A buffered frame is a _reference_ to everything its event carries,
> not a copy of a value. The arithmetic you own is
> `streams × bufferSize × sizeof(Context)`, and the number of concurrent streams
> is yours to bound — this package bounds the depth of one, not how many exist.
> If a controller opens a stream per request, that count is client-controlled.

### Cancelling with a signal

Every registration takes an `AbortSignal`. Aborting removes the listener; an
already-aborted signal never registers it.

```typescript
emitter.on('tick', handle, { signal: c.req.raw.signal })
```

This is the request-scoped pattern, and it is why a signalled listener is exempt
from the `maxListeners` warning — one registration per request would otherwise
emit one warning line per request past the tenth concurrent one.

Removing a listener detaches its abort handler too, by **every** removal path:
`off()`, `offAny()` and `removeAllListeners()`.

### Debugging a listener that does not fire

```bash
LOCKNESS_EVENTS_DEBUG=1 deno task dev
```

Logs registration, emit and per-listener dispatch, naming the event and the
listener count. Accepted values are `1` / `true` / `on` / `yes` and `0` /
`false` / `off` / `no`; anything else fails the boot rather than being guessed
at.

**A debug line never contains a payload.** Not by convention — `debugLog` takes
a closed record with no free-text field, so there is nowhere to put one.

`@lockness/core` reads the variable during bootstrap and calls
`setEventsDebug()`. `@lockness/events` itself makes no `Deno` call, so it adds
no permission requirement to your application; call `setEventsDebug(true)`
directly if you want it on without the variable.

## Use Cases

### Domain Events

```typescript
interface DomainEvents {
    'order:placed': { orderId: string; total: number }
    'order:shipped': { orderId: string; trackingNumber: string }
    'order:delivered': { orderId: string }
}

const emitter = new EventEmitter<DomainEvents>()

// Order service
emitter.on('order:placed', async (order) => {
    await sendConfirmationEmail(order)
})

// Inventory service
emitter.on('order:placed', async (order) => {
    await updateInventory(order)
})

// Notifications service
emitter.on('order:shipped', async (order) => {
    await sendShippingNotification(order)
})

// Place an order
await emitter.emit('order:placed', {
    orderId: 'ORD-123',
    total: 99.99,
})
```

### Pub/Sub Pattern

```typescript
import { createEventBus } from '@lockness/events'

const messageBus = createEventBus()

// Subscriber 1
messageBus.on('message', (msg) => {
    console.log('Sub1:', msg)
})

// Subscriber 2
messageBus.on('message', (msg) => {
    console.log('Sub2:', msg)
})

// Publisher
await messageBus.emit('message', 'Hello, World!')
// Both subscribers receive the message
```

### Application Lifecycle

```typescript
interface AppEvents {
    'app:init': null
    'app:ready': null
    'app:shutdown': null
}

const app = new EventEmitter<AppEvents>()

// Module 1
app.on('app:init', async () => {
    await connectDatabase()
}, { priority: 100 })

// Module 2
app.on('app:init', async () => {
    await loadConfig()
}, { priority: 90 })

// Module 3
app.on('app:ready', () => {
    console.log('Application started successfully')
})

// Startup sequence
await app.emit('app:init', null)
await app.emit('app:ready', null)
```

### Event Sourcing

```typescript
interface AccountEvents {
    'account:deposited': { amount: number }
    'account:withdrawn': { amount: number }
}

const events = new EventEmitter<AccountEvents>()
let balance = 0

events.on('account:deposited', (data) => {
    balance += data.amount
})

events.on('account:withdrawn', (data) => {
    balance -= data.amount
})

await events.emit('account:deposited', { amount: 100 })
await events.emit('account:withdrawn', { amount: 30 })

console.log(balance) // 70
```

### Plugin System

```typescript
interface PluginEvents {
    'plugin:load': { name: string }
    'plugin:unload': { name: string }
}

const plugins = new EventEmitter<PluginEvents>()

// Core plugins load first
plugins.on('plugin:load', initCorePlugins, { priority: 100 })

// User plugins load after
plugins.on('plugin:load', initUserPlugins, { priority: 50 })

await plugins.emit('plugin:load', { name: 'my-plugin' })
```

### Request/Response Pattern

```typescript
const bus = createEventBus()

// Responder
bus.on('request:data', (requestId) => {
    bus.emit(`response:${requestId}`, { data: 'result' })
})

// Requester
const requestId = crypto.randomUUID()
const promise = waitForEvent(bus, `response:${requestId}`, 5000)

await bus.emit('request:data', requestId)
const response = await promise
```

## Best Practices

### Use Type-Safe Events

Always define event types for better DX:

```typescript
interface AppEvents {
    'user:created': { id: number; email: string }
    'user:deleted': { id: number }
}

const emitter = new EventEmitter<AppEvents>()
```

### Handle Errors in Listeners

Listeners should catch their own errors:

```typescript
emitter.on('risky-operation', async (data) => {
    try {
        await dangerousOperation(data)
    } catch (error) {
        console.error('Operation failed:', error)
    }
})
```

### Clean Up Listeners

Remove listeners when no longer needed:

```typescript
const handler = (data) => console.log(data)

emitter.on('event', handler)

// Later...
emitter.off('event', handler)
```

### Use Priorities Wisely

Order operations with priorities:

```typescript
emitter.on('startup', loadConfig, { priority: 100 })
emitter.on('startup', connectDB, { priority: 90 })
emitter.on('startup', startServer, { priority: 80 })
```

### Avoid Memory Leaks

Use `once()` for one-time listeners:

```typescript
emitter.once('connect', () => {
    console.log('Connected!')
})
```

### Namespace Events

Use colon-separated namespaces:

```typescript
// User events
emitter.on('user:created', handler)
emitter.on('user:updated', handler)
emitter.on('user:deleted', handler)

// Order events
emitter.on('order:placed', handler)
emitter.on('order:shipped', handler)
```

## Error Handling

Errors in listeners are caught automatically:

```typescript
emitter.on('event', () => {
    throw new Error('Oops!')
})

emitter.on('event', () => {
    console.log('This still runs!')
})

await emitter.emit('event', null)
// Error is logged, but second listener still executes
```

## Performance

- Listeners sorted by priority once at registration
- O(1) event lookup with Map
- Minimal overhead for type casting
- Async listeners execute in parallel

## Comparison to Node.js EventEmitter

| Feature        | @lockness/events | Node EventEmitter |
| -------------- | ---------------- | ----------------- |
| TypeScript     | ✅ Full generics | ❌ Basic types    |
| Async/await    | ✅ Native        | ⚠️ Via wrapper    |
| Priorities     | ✅ Yes           | ❌ No             |
| Wildcards      | ✅ onAny()       | ❌ No             |
| Event Streams  | ✅ Yes           | ❌ No             |
| Wait for Event | ✅ Built-in      | ⚠️ Manual promise |

## Migration from Node.js

```typescript
// Node.js EventEmitter
const EventEmitter = require('events')
const emitter = new EventEmitter()

emitter.on('event', (data) => {
    console.log(data)
})

emitter.emit('event', 'data')

// @lockness/events
import { EventEmitter } from '@lockness/events'
const emitter = new EventEmitter()

emitter.on('event', (data) => {
    console.log(data)
})

await emitter.emit('event', 'data') // Now async!
```

## Class-Based Events

### BaseEvent Class

All events should extend `BaseEvent` for proper integration with the framework:

```typescript
import { BaseEvent } from '@lockness/core'

export class OrderPlaced extends BaseEvent {
    constructor(
        public readonly orderId: string,
        public readonly userId: string,
        public readonly total: number,
        public readonly items: number,
    ) {
        super()
    }
}
```

**BaseEvent Properties:**

- `createdAt: Date` - Timestamp when event was created (set automatically)
- `eventName: string` - The event class name (e.g., "OrderPlaced")

### EventDispatcher

The `EventDispatcher` wraps the EventEmitter to provide class-based event
support:

```typescript
import { dispatcher, EventDispatcher } from '@lockness/core'

// Use global dispatcher
const d = dispatcher()

// Or create isolated dispatcher
const myDispatcher = new EventDispatcher()

// Emit class-based events
await d.emit(new OrderPlaced('ORD-123', 'user-1', 99.99, 3))

// Listen to class-based events
d.on(OrderPlaced, (event) => {
    console.log(`Order ${event.orderId} placed`)
})
```

**EventDispatcher Methods:**

- `emit(event: BaseEvent)` - Emit a class-based event
- `on(EventClass, listener, options?)` - Register listener
- `once(EventClass, listener, options?)` - Register one-time listener
- `off(EventClass, listener)` - Remove listener
- `onAny(listener, options?)` - Listen to all events
- `listenerCount(EventClass)` - Get listener count
- `removeAllListeners(EventClass?)` - Remove all listeners

## Decorator-Based Listeners

### @Listener Decorator

Mark service methods as event handlers with the `@Listener` decorator:

```typescript
import { Service } from '@lockness/container'
import { Listener } from '@lockness/core'
import { OrderPlaced } from '#events/order_placed'

@Service()
export class OrderListener {
    constructor(
        private mail: MailService,
        private inventory: InventoryService,
    ) {}

    @Listener(OrderPlaced)
    async sendConfirmation(event: OrderPlaced) {
        await this.mail.send(event.userId, 'Order Confirmation', {
            orderId: event.orderId,
            total: event.total,
        })
    }

    @Listener(OrderPlaced, { priority: 100 })
    async updateInventory(event: OrderPlaced) {
        await this.inventory.decrement(event.items)
    }
}
```

**Listener Options:**

- `priority?: number` - Higher priority executes first (default: 0)

### Auto-Discovery

Listeners in `app/listener/` are automatically discovered during app bootstrap:

```
app/
├── listener/
│   ├── order_listener.ts      # Auto-discovered
│   ├── user_listener.ts       # Auto-discovered
│   └── payment_listener.ts    # Auto-discovered
```

Configure the directory in your kernel (defaults to `./app/listener`):

```typescript
@Kernel({
    listenersDir: './app/listener', // Optional, this is the default
})
export class AppKernel {
    // ...
}
```

### Registering Package Event Listeners

Packages can export event listener classes. Register them in
`config/listeners.ts`:

```typescript
// config/listeners.ts
import type { ListenerClass } from '@lockness/core'
import { DevtoolsListener } from '@lockness/devtools'
import { CacheInvalidationListener } from '@lockness/cache'

export const listeners: ListenerClass[] = [
    DevtoolsListener,
    CacheInvalidationListener,
]
```

The kernel references this config:

```typescript
// app/kernel.ts
import { config } from '../config/mod.ts'

@Kernel({
    listenersDir: './app/listener',
    listeners: config.listeners,
})
export class AppKernel {}
```

Both `listenersDir` and `listeners` work together - auto-discovered listeners
from the directory are registered alongside explicit listener classes.

### Multiple Listeners per Event

You can have multiple methods listening to the same event:

```typescript
@Service()
export class NotificationListener {
    constructor(
        private mail: MailService,
        private sms: SMSService,
        private push: PushService,
    ) {}

    @Listener(PaymentReceived, { priority: 100 })
    async sendEmail(event: PaymentReceived) {
        await this.mail.send(event.userId, 'Payment Received')
    }

    @Listener(PaymentReceived, { priority: 90 })
    async sendSMS(event: PaymentReceived) {
        await this.sms.send(event.phone, 'Payment confirmed')
    }

    @Listener(PaymentReceived, { priority: 80 })
    async sendPush(event: PaymentReceived) {
        await this.push.send(event.userId, 'Payment successful')
    }
}
```

## Framework Lifecycle Events

The framework emits lifecycle events at critical execution points:

### KernelBooted

Emitted when the application kernel has finished bootstrapping:

```typescript
import { Service } from '@lockness/container'
import { KernelBooted, Listener } from '@lockness/core'

@Service()
export class CacheWarmer {
    constructor(private cache: CacheService) {}

    @Listener(KernelBooted)
    async warmCache(event: KernelBooted) {
        console.log(`App "${event.appName}" booted in ${event.environment}`)
        await this.cache.warmup()
    }
}
```

### RequestStarted

Emitted at the start of each HTTP request:

```typescript
@Service()
export class RequestLogger {
    @Listener(RequestStarted)
    logRequest(event: RequestStarted) {
        console.log(`[${event.method}] ${event.path} - ID: ${event.requestId}`)
    }
}
```

### ControllerExecuting

Emitted before controller action execution:

```typescript
@Service()
export class ControllerLogger {
    @Listener(ControllerExecuting)
    logController(event: ControllerExecuting) {
        console.log(`→ ${event.controller}.${event.action}()`)
    }
}
```

### ResponsePrepared

Emitted after controller returns response:

```typescript
@Service()
export class ResponseLogger {
    @Listener(ResponsePrepared)
    logResponse(event: ResponsePrepared) {
        console.log(`← Status: ${event.statusCode}`)
    }
}
```

### RequestCompleted

Emitted after response sent to client:

```typescript
@Service()
export class MetricsCollector {
    constructor(private metrics: MetricsService) {}

    @Listener(RequestCompleted)
    async collectMetrics(event: RequestCompleted) {
        await this.metrics.record({
            path: event.path,
            method: event.method,
            statusCode: event.statusCode,
            duration: event.duration,
        })
    }
}
```

### ExceptionOccurred

Emitted when unhandled exception occurs:

```typescript
@Service()
export class ErrorReporter {
    constructor(private sentry: SentryService) {}

    @Listener(ExceptionOccurred)
    async reportError(event: ExceptionOccurred) {
        if (event.error.name !== 'HttpException') {
            await this.sentry.captureException(event.error, {
                path: event.path,
                method: event.method,
            })
        }
    }
}
```

### KernelTerminating

Emitted when application is shutting down:

```typescript
@Service()
export class DatabaseService {
    constructor(private db: Database) {}

    @Listener(KernelTerminating)
    async closeConnections(event: KernelTerminating) {
        console.log(`Shutting down: ${event.reason}`)
        await this.db.close()
    }
}
```

## Testing Events

### Faking Events

Use `fake()` to capture events during tests:

```typescript
import { dispatcher, fake, restore } from '@lockness/core'
import { UserRegistered } from '#events/user_registered'

Deno.test('user registration emits event', async () => {
    const fakeBuffer = fake()

    await userService.register({ email: 'test@example.com' })

    fakeBuffer.assertEmitted(UserRegistered)
    fakeBuffer.assertEmittedCount(UserRegistered, 1)

    restore()
})
```

### Event Assertions

**assertEmitted(EventClass, predicate?)**

Assert an event was emitted:

```typescript
fakeBuffer.assertEmitted(UserRegistered)

// With predicate
fakeBuffer.assertEmitted(UserRegistered, (event) => {
    return event.user.email === 'test@example.com'
})
```

**assertNotEmitted(EventClass)**

Assert an event was NOT emitted:

```typescript
fakeBuffer.assertNotEmitted(OrderPlaced)
```

**assertEmittedCount(EventClass, count)**

Assert exact emission count:

```typescript
fakeBuffer.assertEmittedCount(UserRegistered, 2)
```

### Inspecting Recorded Events

```typescript
const fakeBuffer = fake()

// ... emit events ...

// Get all recorded events
const all = fakeBuffer.all()

// Get events of specific type
const userEvents = fakeBuffer.allOfType(UserRegistered)

// Get counts
console.log(fakeBuffer.count()) // Total events
console.log(fakeBuffer.countOfType(UserRegistered)) // Type count

// Clear recorded events
fakeBuffer.clear()

restore()
```

## CLI Commands

### Generate Event

```bash
deno task cli make:event UserRegistered
```

Creates: `app/events/user_registered.ts`

### Generate Listener

```bash
deno task cli make:listener UserListener
```

Creates: `app/listener/user_listener.ts`

## See Also

- [Lifecycle Events Guide](/docs/lifecycle-events) - Tutorial, best practices,
  Events vs Middlewares comparison, and advanced patterns
- [Dependency Injection](/docs/dependency-injection) - Container and `@Service`
  decorator
- [Testing Guide](/docs/testing) - General testing documentation
