# Lockness Events System

## 🎯 Objective

Implement a centralized and extensible event system for the Lockness framework,
enabling developers and third-party packages to hook into the application
lifecycle (Lifecycle Events) and define custom business events.

**Inspiration**: Symfony EventDispatcher + AdonisJS Emitter, adapted for Deno's
async-first architecture.

---

## 🤔 Why Events in an Async Framework?

### Events vs Middlewares: Complementary, Not Redundant

| Aspect             | Middleware                | Events                            |
| ------------------ | ------------------------- | --------------------------------- |
| **Purpose**        | Intercept & modify        | Observe & react                   |
| **Can block?**     | ✅ Yes                    | ❌ No (fire & forget)             |
| **Modify req/res** | ✅ Yes                    | ❌ No (read-only)                 |
| **Configuration**  | Manual in kernel          | Auto-discovered                   |
| **Use case**       | Auth, CORS, compression   | Analytics, logging, notifications |
| **Third-party**    | Must document integration | Plug & play                       |

### DX Comparison

**Without events** (current approach):

```typescript
// 1. Create app/middleware/analytics_middleware.ts
@DeclareMiddleware('analytics')
export class AnalyticsMiddleware implements Middleware {
    async handle(c: Context, next: Next) {
        const start = performance.now()
        await next()
        await this.analytics.track(c.req.path, performance.now() - start)
    }
}

// 2. Modify kernel to add it
globalMiddlewares = [
    sessionMiddleware(),
    AnalyticsMiddleware, // ← Manual addition
    LoggerMiddleware,
]
```

**With events** (proposed):

```typescript
// 1. Create app/listener/analytics_listener.ts - That's it!
@Service()
export class AnalyticsListener {
    constructor(private analytics: AnalyticsService) {}

    @Listener(RequestCompletedEvent)
    async onRequest(event: RequestCompletedEvent) {
        await this.analytics.track(event.path, event.duration)
    }
}
```

**Friction**: 1 file vs 2 files + kernel modification

---

## 🏗 Architecture

### 1. Core Engine: Emittery Wrapper

The event system is built on
[emittery](https://github.com/sindresorhus/emittery), a battle-tested async
event emitter used by AdonisJS (12M+ weekly downloads).

**Why emittery?**

| Feature              | Node.js EventEmitter | Lockness current | Emittery |
| -------------------- | -------------------- | ---------------- | -------- |
| Async-first          | ❌ Sync              | ✅ Async         | ✅ Async |
| Async iterators      | ❌                   | ❌               | ✅       |
| AbortSignal support  | ❌                   | ❌               | ✅       |
| Debug mode           | ❌                   | ❌               | ✅       |
| `emitSerial()`       | ❌                   | ❌               | ✅       |
| Listener meta events | ❌                   | ❌               | ✅       |
| Deno compatible      | N/A                  | ✅               | ✅ (ESM) |

**Wrapper approach**: Lockness wraps emittery to add class-based events and
decorator support while leveraging emittery's robust async handling.

```typescript
// packages/events/dispatcher.ts
import Emittery from 'npm:emittery'

export class EventDispatcher {
    private emitter = new Emittery()

    async emit<T extends BaseEvent>(event: T): Promise<void> {
        await this.emitter.emit(event.constructor.name, event)
    }

    on<T extends BaseEvent>(
        eventClass: new (...args: any[]) => T,
        listener: (event: T) => void | Promise<void>,
        options?: { priority?: number },
    ): () => void {
        return this.emitter.on(eventClass.name, listener)
    }

    // Expose emittery features
    onAny(listener: (eventName: string, data: unknown) => void): () => void {
        return this.emitter.onAny(listener)
    }

    events<T extends BaseEvent>(eventClass: new (...args: any[]) => T) {
        return this.emitter.events(eventClass.name)
    }
}
```

### 2. Package Structure (`@lockness/events`)

All event-related code lives in `@lockness/events`:

```
packages/events/
├── mod.ts                 # Public API exports
├── dispatcher.ts          # EventDispatcher (emittery wrapper)
├── base_event.ts          # BaseEvent abstract class
├── decorators.ts          # @Listener decorator
├── listener_registry.ts   # Metadata storage for decorated listeners
├── testing.ts             # events().fake() and assertions
├── kernel_events.ts       # Framework lifecycle events
└── types.ts               # TypeScript interfaces
```

**Dependency Impact:**

After implementation, `@lockness/events` will have:

```
@lockness/events (v0.1.x)
└── npm:emittery (external)
```

This keeps the package lightweight with only one external dependency. No
internal `@lockness/*` dependencies are required, maintaining the current
position in the dependency tree (Foundation Layer).

**Dependency Tree After Implementation:**

```
Foundation Layer (no internal deps):
├── @lockness/contract
├── @lockness/hono
└── @lockness/events ←── NEW: npm:emittery (external only)

Implementation Layer (imports events):
├── @lockness/core ←── NEW import: @lockness/events
│   └── Emits: KernelEvents.REQUEST, RESPONSE, EXCEPTION, BOOT, TERMINATE
├── @lockness/drizzle ←── NEW import: @lockness/events
│   └── Emits: DrizzleEvents.QUERY, MIGRATION
├── @lockness/mail ←── NEW import: @lockness/events
│   └── Emits: MailSentEvent
├── @lockness/auth ←── NEW import: @lockness/events
│   └── Emits: UserAuthenticatedEvent, UserLogoutEvent
├── @lockness/session ←── NEW import: @lockness/events
│   └── Emits: SessionCreatedEvent, SessionDestroyedEvent
└── @lockness/devtools ←── NEW import: @lockness/events
    └── Listens: all events for toolbar display

Orchestration Layer:
└── @lockness/core (re-exports events from @lockness/events)
```

**No Cycles**: Events sits at the Foundation Layer with zero internal
dependencies. All other packages import events "downward", maintaining the
strict acyclic dependency graph (DAG).

**Integration Pattern**: Each package that emits or listens to events adds
`@lockness/events` to its `deno.json` imports:

```jsonc
// packages/drizzle/deno.json
{
    "imports": {
        "@lockness/events": "jsr:@lockness/events@^0.1.0" // ← NEW
    }
}
```

**Exports from `mod.ts`:**

```typescript
// Classes
export { EventDispatcher } from './dispatcher.ts'
export { BaseEvent } from './base_event.ts'

// Decorators
export { Listener } from './decorators.ts'

// Global accessor
export { configureEvents, events } from './dispatcher.ts'

// Framework events
export * from './kernel_events.ts'

// Testing utilities
export { EventBuffer } from './testing.ts'
```

### 3. Core Components

- **EventDispatcher**: Emittery wrapper with class-based event support
- **BaseEvent**: Abstract class for type-safe event data containers
- **@Listener(EventClass, options)**: Decorator to subscribe a service method to
  an event (defined in `@lockness/events/decorators.ts`)
- **Container Integration**: Listeners are DI-managed services
  (`@lockness/container`), enabling dependency injection

### 4. Lifecycle Events (Framework)

Events emitted by the framework at critical execution points:

| Event                     | Trigger Point                    | Typical Use Case                        |
| :------------------------ | :------------------------------- | :-------------------------------------- |
| `KernelEvents.REQUEST`    | Beginning of each HTTP request   | Analytics, custom auth, request logging |
| `KernelEvents.CONTROLLER` | Just before controller action    | Argument modification, specific guards  |
| `KernelEvents.RESPONSE`   | After controller, before sending | Header injection, post-processing       |
| `KernelEvents.EXCEPTION`  | On unhandled error               | Error formatting, alerts, Sentry        |
| `KernelEvents.TERMINATE`  | After response sent to client    | Heavy background tasks (stats, emails)  |
| `KernelEvents.BOOT`       | Once application is initialized  | Plugin init, cache warming              |

### 5. Package Events (Cross-Package Communication)

Events emitted by optional packages for cross-cutting concerns:

| Package             | Event                            | Use Case                              |
| ------------------- | -------------------------------- | ------------------------------------- |
| `@lockness/mail`    | `MailSentEvent`                  | Devtools collection, audit log        |
| `@lockness/auth`    | `UserAuthenticatedEvent`         | Session tracking, security alerts     |
| `@lockness/drizzle` | `QueryExecutedEvent`             | Devtools SQL panel, slow query alerts |
| `@lockness/queue`   | `JobProcessedEvent`              | Metrics, failure notifications        |
| `@lockness/cache`   | `CacheHitEvent`/`CacheMissEvent` | Performance monitoring                |

### 6. Business Events (User-Defined)

Custom events for application-specific logic:

```typescript
// app/events/user_registered.ts
import { BaseEvent } from '@lockness/events'
import type { User } from '#models/user'

export class UserRegistered extends BaseEvent {
    constructor(public user: User) {
        super()
    }
}
```

---

## 💻 Developer Experience (DX)

### Class-Based Events

```typescript
// app/events/order_placed.ts
import { BaseEvent } from '@lockness/events'

export class OrderPlaced extends BaseEvent {
    constructor(
        public orderId: string,
        public userId: string,
        public total: number,
    ) {
        super()
    }
}
```

### Class-Based Listeners with DI

```typescript
// app/listener/order_listener.ts
import { Service } from '@lockness/container'
import { Listener } from '@lockness/events'
import { OrderPlaced } from '#events/order_placed'

@Service()
export class OrderListener {
    constructor(
        private mail: MailService,
        private analytics: AnalyticsService,
    ) {}

    @Listener(OrderPlaced)
    async sendConfirmationEmail(event: OrderPlaced) {
        await this.mail.send(event.userId, 'Order Confirmation', {
            orderId: event.orderId,
        })
    }

    @Listener(OrderPlaced, { priority: 100 })
    async trackOrder(event: OrderPlaced) {
        await this.analytics.track('order:placed', { total: event.total })
    }
}
```

### Emitting Events

```typescript
// In a controller or service
import { events } from '@lockness/events'
import { OrderPlaced } from '#events/order_placed'

export class OrderController {
    @Post('/orders')
    async create(c: Context) {
        const order = await this.orderService.create(data)

        // Emit event - listeners are invoked asynchronously
        await events().emit(
            new OrderPlaced(order.id, order.userId, order.total),
        )

        return c.json(order)
    }
}
```

### Listening to Framework Events

```typescript
// app/listener/devtools_listener.ts
@Service()
export class DevtoolsListener {
    @Listener(RequestCompletedEvent)
    collectRequest(event: RequestCompletedEvent) {
        collector.addRequest({
            path: event.path,
            controller: event.controller,
            action: event.action,
            duration: event.duration,
            statusCode: event.statusCode,
        })
    }

    @Listener(QueryExecutedEvent)
    collectQuery(event: QueryExecutedEvent) {
        collector.addQuery({
            sql: event.sql,
            duration: event.duration,
            bindings: event.bindings,
        })
    }
}
```

---

## 🧪 Testing Support

Following AdonisJS patterns, provide testing utilities:

```typescript
import { events } from '@lockness/events'
import { UserRegistered } from '#events/user_registered'

Deno.test('user registration emits event', async () => {
    const fakeEmitter = events().fake()

    await userService.register({ email: 'test@example.com' })

    fakeEmitter.assertEmitted(UserRegistered)
    fakeEmitter.assertEmittedCount(UserRegistered, 1)

    // Cleanup
    events().restore()
})

Deno.test('can assert event data', async () => {
    const fakeEmitter = events().fake()

    await userService.register({ email: 'test@example.com' })

    fakeEmitter.assertEmitted(UserRegistered, (event) => {
        return event.user.email === 'test@example.com'
    })
})
```

---

## 🔧 Lazy Loading (Performance)

For production performance, support lazy-loading listeners:

```typescript
// start/events.ts
import { events } from '@lockness/events'
import { UserRegistered } from '#events/user_registered'

// Lazy load listener - only imported when event is emitted
events().listen(UserRegistered, [
    () => import('#listeners/send_welcome_email'),
    () => import('#listeners/create_stripe_customer'),
    () => import('#listeners/notify_admin'),
])
```

---

## 📂 Directory Structure

```
app/
├── events/                    # Event class definitions
│   ├── user_registered.ts
│   ├── order_placed.ts
│   └── payment_received.ts
├── listener/                  # Auto-discovered listeners
│   ├── analytics_listener.ts
│   ├── notification_listener.ts
│   └── audit_listener.ts
└── ...
```

---

## ✅ Expected Benefits

1. **Total Decoupling**: Packages (Auth, Mail, Queue, Devtools) can react to
   framework events without the framework knowing about them.

2. **Plugin Ecosystem**: Third-party plugins are plug & play - just install and
   listeners auto-register.

3. **Zero-Config for Users**: Create a listener file, add `@Listener` decorator,
   done. No kernel modification needed.

4. **Type Safety**: Full TypeScript inference on event data via generics.

5. **Testability**: Mock events instead of entire services.

6. **Separation of Concerns**: Business logic moves from controllers to
   dedicated listeners.

7. **Devtools Integration**: Devtools can observe all framework events without
   special middleware integration.

---

## 🛠 Implementation Plan

### Phase 1: Core Infrastructure (`@lockness/events`)

All core event infrastructure lives in `@lockness/events`:

- [ ] Add `npm:emittery` as dependency in `packages/events/deno.json`
- [x] Create `base_event.ts` with `BaseEvent` abstract class
- [x] Create `dispatcher.ts` with `EventDispatcher` (emittery wrapper)
- [x] Create `decorators.ts` with `@Listener` decorator
- [x] Create `listener_registry.ts` for metadata storage (Symbol-based)
- [x] Create `kernel_events.ts` with framework lifecycle event classes
- [x] Create `testing.ts` with `EventBuffer` for `events().fake()`
- [x] Update `mod.ts` to export all public APIs

**File: `packages/events/decorators.ts`**

```typescript
import { LISTENER_METADATA } from './listener_registry.ts'
import type { BaseEvent } from './base_event.ts'

export interface ListenerOptions {
    priority?: number // Higher = executes first (default: 0)
}

export function Listener<T extends BaseEvent>(
    eventClass: new (...args: any[]) => T,
    options: ListenerOptions = {},
): MethodDecorator {
    return function (
        _target: unknown,
        _context: ClassMethodDecoratorContext,
    ) {
        // Store metadata for discovery at boot time
        // Implementation uses Symbol storage on constructor
    }
}
```

### Phase 2: Framework Integration (`@lockness/core`)

- [ ] Create lifecycle middleware in `@lockness/core` that emits `KernelEvents`
- [x] Update `createApp()` to auto-discover listeners in `app/listener/`
- [x] Wire listener instances through DI container
- [x] Add `listenersDir` option to `@Kernel` decorator config

### Phase 3: Package Integration

Each package emits its own events:

- [ ] `@lockness/drizzle`: Add `QueryExecutedEvent`
- [ ] `@lockness/mail`: Add `MailSentEvent`
- [ ] `@lockness/queue`: Add `JobProcessedEvent`, `JobFailedEvent`
- [ ] `@lockness/auth`: Add `UserAuthenticatedEvent`, `UserLoggedOutEvent`
- [ ] `@lockness/cache`: Add `CacheHitEvent`, `CacheMissEvent`
- [ ] `@lockness/devtools`: Migrate to event-based collection

### Phase 4: Testing & DX

- [x] Implement `events().fake()` returning `EventBuffer`
- [x] Add assertion methods (`assertEmitted`, `assertNotEmitted`,
      `assertEmittedCount`)
- [x] Create `deno task cli make:event <Name>` command
- [x] Create `deno task cli make:listener <Name>` command
- [x] Add stubs in `packages/cli/stubs/`

### Phase 5: Documentation

- [x] Write `packages/events/docs/DOCS.md`
- [ ] Add events guide to `docs/events.md`
- [ ] Document all framework events with examples
- [ ] Add migration guide for existing users
- [ ] Update `AGENTS.md` with events documentation links
- [ ] Update `docs/dependencies.md` - Run `deno task deps:analyze` to regenerate
      dependency tree (now includes `npm:emittery`)

---

## 📚 References

- [AdonisJS Emitter](https://docs.adonisjs.com/guides/digging-deeper/emitter) -
  Class-based events, DI integration, testing utilities
- [Symfony EventDispatcher](https://symfony.com/doc/current/event_dispatcher.html) -
  Lifecycle events, subscriber pattern
- [emittery](https://github.com/sindresorhus/emittery) - Async-first event
  emitter (used by AdonisJS)
