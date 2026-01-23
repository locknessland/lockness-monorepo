# Lockness Events

Type-safe event emitter for Deno with async support, priorities, wildcards, and
event streams.

## Overview

@lockness/events provides a modern event system with:

- **Type Safety** - Generic event types with full TypeScript inference
- **Async Support** - Native async/await for event listeners
- **Priorities** - Execute listeners in priority order
- **Once Listeners** - Auto-remove after first execution
- **Wildcards** - Listen to all events with `onAny()`
- **Event Streams** - Convert events to async iterables
- **Isolated Buses** - Create independent event emitters

## Installation

```typescript
import { EventEmitter, events } from '@lockness/events'
// or
import { EventEmitter, events } from '@lockness/core'
```

## Basic Usage

### Simple Events

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

### Type-Safe Events

Define event types for full type safety:

```typescript
interface AppEvents {
    'user:created': { id: number; name: string; email: string }
    'user:deleted': { id: number }
    'order:placed': { orderId: string; total: number; items: number }
}

const emitter = new EventEmitter<AppEvents>()

// Fully typed - TypeScript knows the data structure
emitter.on('user:created', (data) => {
    console.log(data.name) // ✅ TypeScript knows data.name exists
    console.log(data.foo) // ❌ TypeScript error: foo doesn't exist
})

// Emit with type checking
await emitter.emit('user:created', {
    id: 1,
    name: 'Alice',
    email: 'alice@example.com',
})
```

## Global Event Emitter

Use a shared global emitter across your application:

```typescript
import { configureEvents, events } from '@lockness/events'

// Optional: configure global emitter
configureEvents()

// Use anywhere in your app
events().on('app:ready', () => {
    console.log('App is ready!')
})

await events().emit('app:ready', null)
```

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

Convert events to async iterables:

```typescript
import { eventStream } from '@lockness/events'

const stream = eventStream<number>(emitter, 'tick')

for await (const value of stream) {
    console.log(value)
    if (value >= 10) break
}
```

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
