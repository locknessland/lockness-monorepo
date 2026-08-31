# @lockness/events

Type-safe event emitter for Deno with TypeScript generics, async support,
priorities, and wildcards.

## Features

- 🎯 **Type-safe**: Generic event types with full TypeScript inference
- ⚡ **Async Support**: Handle both sync and async event listeners
- 🏆 **Priorities**: Execute listeners in priority order
- 🔄 **Once Listeners**: Auto-remove after first execution
- 🌐 **Wildcard**: Listen to all events with `onAny()`, or iterate them with
  `anyEvent()`
- 📊 **Event Stream**: Convert events to async iterables, with a **bounded**
  buffer
- 🛑 **Cancellable**: Pass an `AbortSignal` to any registration
- 🔎 **Debuggable**: `LOCKNESS_EVENTS_DEBUG=1` explains why a listener did not
  fire
- 🎪 **Isolated Buses**: Create independent event emitters
- 🧪 **Well-tested**: 91 tests covering all operations

## Installation

```typescript
import { EventEmitter, events } from '@lockness/events'
// or from main package
import { EventEmitter, events } from 'lockness/core'
```

## Quick Start

### Basic Usage

```typescript
import { EventEmitter } from '@lockness/events'

const emitter = new EventEmitter()

// Register listener
emitter.on('user:login', (username) => {
    console.log(`${username} logged in`)
})

// Emit event
await emitter.emit('user:login', 'alice')
```

### Type-safe Events

```typescript
interface AppEvents {
    'user:created': { id: number; name: string }
    'user:deleted': { id: number }
    'order:placed': { orderId: string; total: number }
}

const emitter = new EventEmitter<AppEvents>()

// Fully typed!
emitter.on('user:created', (data) => {
    console.log(data.name) // TypeScript knows data has name and id
})

await emitter.emit('user:created', { id: 1, name: 'Alice' })
```

### Global Event Emitter

```typescript
import { configureEvents, events } from '@lockness/events'

// Configure once (optional)
configureEvents()

// Use globally
events().on('app:ready', () => {
    console.log('App is ready!')
})

await events().emit('app:ready', null)
```

## API Reference

### EventEmitter

#### on(event, listener, config?)

Register an event listener.

```typescript
emitter.on('event', (data) => {
    console.log(data)
})

// With priority
emitter.on('event', handler, { priority: 10 })

// As once
emitter.on('event', handler, { once: true })
```

#### once(event, listener, config?)

Register a one-time listener (auto-removed after first execution).

```typescript
emitter.once('connect', () => {
    console.log('Connected!')
})

await emitter.emit('connect', null) // Fires
await emitter.emit('connect', null) // Doesn't fire
```

#### emit(event, data)

Emit an event to all registered listeners (async).

```typescript
await emitter.emit('user:created', { id: 1, name: 'Alice' })
```

#### emitSync(event, data)

Emit an event without waiting for async listeners.

```typescript
emitter.emitSync('log', 'message')
// Returns immediately, listeners run in background
```

#### off(event, listener)

Remove a specific listener.

```typescript
const handler = (data) => console.log(data)

emitter.on('event', handler)
emitter.off('event', handler) // Removed
```

#### removeAllListeners(event?)

Remove all listeners for an event, or all events if no event specified.

```typescript
emitter.removeAllListeners('event') // Remove all for 'event'
emitter.removeAllListeners() // Remove all listeners
```

#### onAny(listener, config?)

Register a wildcard listener that receives all events.

```typescript
emitter.onAny((payload) => {
    console.log(`Event: ${payload.event}`)
    console.log(`Data:`, payload.data)
})

await emitter.emit('anything', 'data')
// Logs: Event: anything, Data: data
```

#### offAny(listener)

Remove a wildcard listener.

```typescript
const handler = (payload) => console.log(payload)

emitter.onAny(handler)
emitter.offAny(handler) // Removed
```

#### listenerCount(event)

Get number of listeners for an event.

```typescript
console.log(emitter.listenerCount('user:created')) // 5
```

#### eventNames()

Get array of all registered event names.

```typescript
console.log(emitter.eventNames()) // ['user:created', 'user:deleted']
```

#### listeners(event)

Get array of all listeners for an event.

```typescript
const listeners = emitter.listeners('user:created')
console.log(listeners.length) // 3
```

#### setMaxListeners(n) / getMaxListeners()

Set/get maximum listeners warning threshold.

```typescript
emitter.setMaxListeners(20)
console.log(emitter.getMaxListeners()) // 20
```

### Listener Priorities

Higher priority listeners execute first (default: 0).

```typescript
emitter.on('load', () => console.log('3rd'), { priority: 0 })
emitter.on('load', () => console.log('1st'), { priority: 10 })
emitter.on('load', () => console.log('2nd'), { priority: 5 })

await emitter.emit('load', null)
// Output: 1st, 2nd, 3rd
```

### Helper Functions

```typescript
import { emit, emitSync, off, on, once } from '@lockness/events'

// Quick operations on global emitter
on('event', handler)
await emit('event', data)
off('event', handler)
```

### Utility: Event Bus

Create isolated event emitters.

```typescript
import { createEventBus } from '@lockness/events'

const bus1 = createEventBus()
const bus2 = createEventBus()

bus1.on('event', () => console.log('Bus 1'))
bus2.on('event', () => console.log('Bus 2'))

await bus1.emit('event', null) // Only bus1 listeners fire
```

### Utility: Wait for Event

Wait for an event to be emitted and return its data.

```typescript
import { waitForEvent } from '@lockness/events'

const promise = waitForEvent<string>(emitter, 'result')

// Somewhere else...
emitter.emit('result', 'success')

const data = await promise // 'success'
```

With timeout:

```typescript
try {
    const data = await waitForEvent(emitter, 'result', 5000) // 5 seconds
} catch (error) {
    console.log('Timeout!')
}
```

### Utility: Event Stream

Convert events to an async iterable stream. The buffer is **bounded** — a
consumer that stops pulling drops frames rather than growing without limit, and
the episode is reported.

```typescript
import { eventStream } from '@lockness/events'

for await (const value of eventStream<number>(emitter, 'tick')) {
    console.log(value)
    if (value >= 10) break // detaches the listener
}

// Every event, same shape as onAny() delivers
for await (const { event, data } of emitter.anyEvent({ bufferSize: 256 })) {
    console.log(event)
}
```

`bufferSize` defaults to 1024 and `onOverflow` to `'drop-oldest'`. A buffered
frame retains everything its event carries, so size it against
`streams × bufferSize`. **Never derive `bufferSize` from request input.**

### Utility: Cancelling with a signal

```typescript
emitter.on('tick', handle, { signal: c.req.raw.signal })
```

Aborting removes the listener; an already-aborted signal never registers it.
Signalled listeners are exempt from the `maxListeners` warning, because one
registration per request would otherwise warn on every request past the tenth.

### Debugging

```bash
LOCKNESS_EVENTS_DEBUG=1 deno task dev
```

Registration, emit and dispatch, with the event name and listener count — and
never a payload: `debugLog` takes a closed record with no free-text field.

See [docs/DOCS.md](docs/DOCS.md) for the full detail.

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
})

// Module 2
app.on('app:init', async () => {
    await loadConfig()
})

// Module 3
app.on('app:ready', () => {
    console.log('Application started successfully')
})

// Startup sequence
await app.emit('app:init', null)
await app.emit('app:ready', null)
```

### Real-time Updates

```typescript
interface UpdateEvents {
    'data:update': { collection: string; id: number }
}

const updates = new EventEmitter<UpdateEvents>()

// WebSocket handler
updates.on('data:update', (data) => {
    ws.send(JSON.stringify(data))
})

// Database trigger
async function onDatabaseChange(collection: string, id: number) {
    await updates.emit('data:update', { collection, id })
}
```

### Event Aggregation

```typescript
const emitter = new EventEmitter()
const events: string[] = []

// Collect all events
emitter.onAny((payload) => {
    events.push(`${payload.event}: ${JSON.stringify(payload.data)}`)
})

await emitter.emit('event1', 'data1')
await emitter.emit('event2', 'data2')

console.log(events)
// ['event1: "data1"', 'event2: "data2"']
```

### Plugin System

```typescript
interface PluginEvents {
    'plugin:load': { name: string }
    'plugin:unload': { name: string }
}

const plugins = new EventEmitter<PluginEvents>()

// Register plugin hooks
plugins.on('plugin:load', (plugin) => {
    console.log(`Loading plugin: ${plugin.name}`)
})

// Load plugins with priority
plugins.on('plugin:load', initCorePlugins, { priority: 100 })
plugins.on('plugin:load', initUserPlugins, { priority: 50 })

await plugins.emit('plugin:load', { name: 'my-plugin' })
```

## Best Practices

### 1. Use Type-safe Events

Define your event types for better DX:

```typescript
interface AppEvents {
    'user:created': { id: number; email: string }
    'user:deleted': { id: number }
}

const emitter = new EventEmitter<AppEvents>()
```

### 2. Handle Errors in Listeners

Listeners should catch and handle their own errors:

```typescript
emitter.on('risky-operation', async (data) => {
    try {
        await dangerousOperation(data)
    } catch (error) {
        console.error('Operation failed:', error)
    }
})
```

### 3. Clean Up Listeners

Remove listeners when they're no longer needed:

```typescript
const handler = (data) => console.log(data)

emitter.on('event', handler)

// Later...
emitter.off('event', handler)
```

### 4. Use Priorities Wisely

Set priorities for execution order:

```typescript
emitter.on('startup', loadConfig, { priority: 100 })
emitter.on('startup', connectDB, { priority: 90 })
emitter.on('startup', startServer, { priority: 80 })
```

### 5. Avoid Memory Leaks

Use `once()` for one-time listeners:

```typescript
emitter.once('connect', () => {
    console.log('Connected!')
})
```

### 6. Namespace Events

Use colon-separated namespaces:

```typescript
emitter.on('user:created', handler)
emitter.on('user:updated', handler)
emitter.on('user:deleted', handler)

emitter.on('order:placed', handler)
emitter.on('order:shipped', handler)
```

## Error Handling

Event emitter catches listener errors automatically:

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

## Testing

Run the test suite:

```bash
cd lockness/events
deno task test
```

## Performance

- Listeners sorted by priority once at registration
- O(1) event name lookup with Map
- Minimal overhead for type casting
- Async listeners don't block each other

## Comparison to Node.js EventEmitter

| Feature            | @lockness/events | Node EventEmitter |
| ------------------ | ---------------- | ----------------- |
| **TypeScript**     | ✅ Full generics | ❌ Basic types    |
| **Async/await**    | ✅ Native        | ⚠️ Via wrapper    |
| **Priorities**     | ✅ Yes           | ❌ No             |
| **Wildcards**      | ✅ `onAny()`     | ❌ No             |
| **Event Streams**  | ✅ Yes           | ❌ No             |
| **Wait for Event** | ✅ Built-in      | ⚠️ Manual promise |
| **Memory Leaks**   | ✅ Warnings      | ✅ Warnings       |

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

## Advanced Patterns

### Event Sourcing

```typescript
interface Events {
    'account:deposited': { amount: number }
    'account:withdrawn': { amount: number }
}

const events = new EventEmitter<Events>()
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

## License

MIT
