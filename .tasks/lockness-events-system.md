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

### 1. Core Components

- **EventDispatcher**: Central engine managing listener registration and event
  dispatching. Built on `@lockness/events` existing `EventEmitter`.
- **BaseEvent**: Abstract class for type-safe event data containers.
- **@Listener(EventClass, options)**: Decorator to subscribe a service method to
  an event.
- **Container Integration**: Listeners are DI-managed services
  (`@lockness/container`), enabling dependency injection.

### 2. Lifecycle Events (Framework)

Events emitted by the framework at critical execution points:

| Event                     | Trigger Point                    | Typical Use Case                        |
| :------------------------ | :------------------------------- | :-------------------------------------- |
| `KernelEvents.REQUEST`    | Beginning of each HTTP request   | Analytics, custom auth, request logging |
| `KernelEvents.CONTROLLER` | Just before controller action    | Argument modification, specific guards  |
| `KernelEvents.RESPONSE`   | After controller, before sending | Header injection, post-processing       |
| `KernelEvents.EXCEPTION`  | On unhandled error               | Error formatting, alerts, Sentry        |
| `KernelEvents.TERMINATE`  | After response sent to client    | Heavy background tasks (stats, emails)  |
| `KernelEvents.BOOT`       | Once application is initialized  | Plugin init, cache warming              |

### 3. Package Events (Cross-Package Communication)

Events emitted by optional packages for cross-cutting concerns:

| Package             | Event                            | Use Case                              |
| ------------------- | -------------------------------- | ------------------------------------- |
| `@lockness/mail`    | `MailSentEvent`                  | Devtools collection, audit log        |
| `@lockness/auth`    | `UserAuthenticatedEvent`         | Session tracking, security alerts     |
| `@lockness/drizzle` | `QueryExecutedEvent`             | Devtools SQL panel, slow query alerts |
| `@lockness/queue`   | `JobProcessedEvent`              | Metrics, failure notifications        |
| `@lockness/cache`   | `CacheHitEvent`/`CacheMissEvent` | Performance monitoring                |

### 4. Business Events (User-Defined)

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

### Phase 1: Core Infrastructure

- [ ] Extend `@lockness/events` with `BaseEvent` class
- [ ] Add class-based event dispatching to `EventEmitter`
- [ ] Create `@Listener` decorator with priority support
- [ ] Add listener metadata storage (Symbol-based)

### Phase 2: Framework Integration

- [ ] Add lifecycle middleware in `@lockness/core` that emits `KernelEvents`
- [ ] Update `createApp()` to auto-discover listeners in `app/listener/`
- [ ] Wire listener instances to DI container

### Phase 3: Package Integration

- [ ] Add `QueryExecutedEvent` to `@lockness/drizzle`
- [ ] Add `MailSentEvent` to `@lockness/mail`
- [ ] Add `JobProcessedEvent` to `@lockness/queue`
- [ ] Update `@lockness/devtools` to use events instead of direct collection

### Phase 4: Testing & DX

- [ ] Implement `events().fake()` for testing
- [ ] Add assertion methods (`assertEmitted`, `assertNotEmitted`, etc.)
- [ ] Create `deno task cli make:event` command
- [ ] Create `deno task cli make:listener` command

### Phase 5: Documentation

- [ ] Write `packages/events/docs/DOCS.md`
- [ ] Add events guide to main documentation
- [ ] Document all framework events
- [ ] Add migration guide for existing users

---

## 📚 References

- [AdonisJS Emitter](https://docs.adonisjs.com/guides/digging-deeper/emitter) -
  Class-based events, DI integration, testing utilities
- [Symfony EventDispatcher](https://symfony.com/doc/current/event_dispatcher.html) -
  Lifecycle events, subscriber pattern
- [emittery](https://github.com/sindresorhus/emittery) - Async-first event
  emitter (used by AdonisJS)
