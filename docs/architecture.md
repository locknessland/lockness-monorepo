# Lockness Architecture

Understanding Lockness modular architecture and package system.

## Core Philosophy

Lockness follows a **minimal core, optional features** approach:

- **@lockness/core** - Essential framework only (App, DI, Hono)
- **Optional packages** - Import explicitly when needed

## Bootstrap Pipeline

The kernel loader uses a modular **bootstrap step architecture** to initialize
your application. When you call `createApp(KernelClass)`, the following steps
execute in sequence:

1. **Database** (100) - Database connection
2. **Session** (110) - Session configuration
3. **Cache** (120) - Cache system setup
4. **App Creation** (200) - Create App instance
5. **Devtools** (210) - Enable devtools (development only)
6. **Middleware** (300) - Register global middlewares
7. **Boot Hooks** (310) - Execute `@OnBoot` methods
8. **Middleware Discovery** (400) - Auto-discover named middlewares
9. **Listener Registration** (410) - Register event listeners
10. **Events** (500) - Emit KernelBooted event
11. **App Initialization** (550) - Initialize controllers and static files
12. **Devtools Routes** (600) - Collect routes for devtools

**Benefits:**

- ✅ Predictable initialization order
- ✅ Each step isolated and testable
- ✅ Optional packages loaded gracefully
- ✅ Extensible without modifying core

See [Kernel Lifecycle](/docs/kernel) for details.

## Package System

### Core Package (@lockness/core)

**Always required.** Includes:

- Framework fundamentals (App, routing, decorators)
- Dependency Injection system
- Complete Hono integration (all middleware & utilities)
- JSX runtime and components

```typescript
import {
    App, // Framework core
    basicAuth,
    cache,
    Controller, // Decorators
    cors,
    Get,
    Inject,
    jwt,
    logger, // Hono middleware
    Post,
    Service, // DI system
    validator,
    // ... all Hono exports
} from '@lockness/core'
```

**What's NOT in core:**

- Sessions (optional for APIs)
- Queue system (optional feature)
- Cache system (separate from Hono cache middleware)
- Logger system (separate from Hono logger middleware)
- Mail, Storage, Socialite, etc.

### Optional Packages

Import explicitly when needed:

#### @lockness/session

**For:** Traditional web apps with session-based auth\
**Skip if:** Building stateless JWT APIs

```typescript
// In your kernel
import { sessionMiddleware } from '@lockness/session'

@Kernel({
    session: {
        driver: 'cookie',
        secret: Deno.env.get('SESSION_SECRET')!,
        lifetime: 7200,
    },
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        sessionMiddleware(),
    ]
}
```

#### @lockness/queue

**For:** Background job processing (emails, exports, etc.)\
**Skip if:** No background tasks needed

```typescript
import { configureQueue, Job, registerJob } from '@lockness/queue'

class SendEmailJob extends Job {
    async handle() {
        // Send email
    }
}

registerJob('send-email', SendEmailJob)
```

#### @lockness/scheduler

**For:** Recurring work on a clock — digests, purges, syncs\
**Skip if:** Nothing runs on a schedule

```typescript
import { daily, Schedule } from '@lockness/core'

export class ReportService {
    @Schedule('0 3 * * *', { name: 'nightly-digest' })
    async digest() {
        // runs daily at 03:00 UTC
    }
}
```

Times are UTC and state is in-process. Two replicas each run every task, so
either run the scheduler on one replica (`SCHEDULER_ENABLED=0` on the others) or
make each body idempotent. See
[scheduler/docs/DOCS.md](../packages/scheduler/docs/DOCS.md).

#### @lockness/cache

**For:** Application-level caching system\
**Different from:** Hono's HTTP cache middleware (in core)

```typescript
import { cache, configureCache } from '@lockness/cache'

configureCache({ driver: 'deno-kv' })

// Cache data
await cache.remember('user:1', () => fetchUser(1), 3600)
```

#### @lockness/logger

**For:** Structured logging system with transports\
**Different from:** Hono's HTTP logger middleware (in core)

```typescript
import { ConsoleTransport, Logger } from '@lockness/logger'

const logger = new Logger()
logger.addTransport(new ConsoleTransport())
logger.info('User logged in', { userId: 123 })
```

#### @lockness/auth

**For:** Authentication with guards and providers\
**Requires:** Usually needs @lockness/session for web apps

```typescript
import { initializeAuthMiddleware, SessionGuard } from '@lockness/auth'
import { sessionMiddleware } from '@lockness/session'
import { UserProvider } from './auth/user_provider.ts'

@Kernel({
    session: { driver: 'cookie', secret: 'your-secret' },
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        sessionMiddleware(),
        initializeAuthMiddleware({
            default: 'web',
            guards: {
                web: (ctx) => new SessionGuard('web', ctx, new UserProvider()),
            },
        }),
    ]
}
```

## Architecture Benefits

### 1. Lightweight APIs

```typescript
// Minimal JWT API (no sessions, no queue)
import { createApp, jwt, Kernel } from '@lockness/core'

@Kernel({
    staticDir: 'public',
    controllersDir: './app/controller',
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        jwt({ secret: 'your-secret' }),
    ]
}

const app = await createApp(AppKernel)
```

**Bundle includes:** Only core + Hono (~2MB)\
**Excludes:** Session, queue, cache systems (unused code)

### 2. Full Web App

```typescript
// Traditional web app with all features
import { createApp, DeclareGlobalMiddleware, Kernel } from '@lockness/core'
import { sessionMiddleware } from '@lockness/session'
import { configureQueue } from '@lockness/queue'
import { configureCache } from '@lockness/cache'

@Kernel({
    database: { url: Deno.env.get('DATABASE_URL') },
    session: { driver: 'cookie', secret: 'secret' },
    devtools: true,
    controllersDir: './app/controller',
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        sessionMiddleware(),
    ]
}

// Configure optional features
configureQueue({ driver: 'deno-kv' })
configureCache({ driver: 'memory' })

const app = await createApp(AppKernel)
```

**Bundle includes:** Core + selected features\
**Explicit:** Clear what dependencies are used

### 3. Zero Naming Conflicts

Hono middleware keeps original names:

```typescript
import {
    cache, // Hono HTTP cache middleware
    logger, // Hono HTTP logger middleware
    validator, // Hono request validator
} from '@lockness/core'

// Separate packages if needed:
import { cache as cacheSystem } from '@lockness/cache'
import { Logger } from '@lockness/logger'
import { Validator } from '@lockness/validator'
```

## Project Examples

### Minimal API (JWT only)

**Dependencies:**

- @lockness/core

**Setup:**

```typescript
import { createApp, DeclareGlobalMiddleware, jwt, Kernel } from '@lockness/core'

@Kernel({ controllersDir: './app/controller' })
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [jwt({ secret: 'secret' })]
}

const app = await createApp(AppKernel)
```

### Traditional Web App

**Dependencies:**

- @lockness/core
- @lockness/session
- @lockness/auth

**Setup:**

```typescript
import { createApp, DeclareGlobalMiddleware, Kernel } from '@lockness/core'
import { sessionMiddleware } from '@lockness/session'
import { initializeAuthMiddleware } from '@lockness/auth'

@Kernel({
    session: { driver: 'cookie', secret: 'secret' },
    controllersDir: './app/controller',
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        sessionMiddleware(),
        initializeAuthMiddleware({/* ... */}),
    ]
}

const app = await createApp(AppKernel)
```

### Full-Featured SaaS

**Dependencies:**

- @lockness/core
- @lockness/session
- @lockness/auth
- @lockness/queue
- @lockness/scheduler
- @lockness/cache
- @lockness/mail
- @lockness/storage

**Setup:**

```typescript
import {
    createApp,
    DeclareGlobalMiddleware,
    Kernel,
    OnBoot,
} from '@lockness/core'
import { sessionMiddleware } from '@lockness/session'
import { configureQueue } from '@lockness/queue'
import { configureCache } from '@lockness/cache'
import { configureMail } from '@lockness/mail'
import { configureStorage } from '@lockness/storage'

@Kernel({
    database: { url: Deno.env.get('DATABASE_URL') },
    session: { driver: 'cookie', secret: 'secret', lifetime: 7200 },
    devtools: true,
    controllersDir: './app/controller',
    middlewaresDir: './app/middleware',
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        sessionMiddleware(),
        // ... other middlewares
    ]

    @OnBoot({ priority: 100 })
    async configureServices() {
        configureQueue({/* ... */})
        configureCache({/* ... */})
        configureMail({/* ... */})
        configureStorage({/* ... */})
    }
}

const app = await createApp(AppKernel)
```

## Migration Guide

If you have existing code importing from `@lockness/core`:

### Sessions

```typescript
// ❌ Old (imperative style)
import { configureSession, sessionMiddleware } from '@lockness/session'
configureSession({ driver: 'cookie', secret: 'secret' })
app.useMiddleware(sessionMiddleware())

// ✅ New (declarative with @Kernel)
import { sessionMiddleware } from '@lockness/session'

@Kernel({
    session: { driver: 'cookie', secret: 'secret' },
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [sessionMiddleware()]
}
```

### Queue

```typescript
// ❌ Old (no longer works)
import { configureQueue, registerJob } from '@lockness/core'

// ✅ New (explicit import)
import { configureQueue, registerJob } from '@lockness/queue'
```

### Cache System

```typescript
// ❌ Old (no longer works)
import { cache, configureCache } from '@lockness/core'

// ✅ New (explicit import)
import { cache, configureCache } from '@lockness/cache'

// Note: Hono's cache middleware is still in core:
import { cache as honoCache } from '@lockness/core'
app.useMiddleware(honoCache())
```

## FAQ

**Q: Why split packages?**\
A: Lightweight apps don't need sessions/queues. Explicit imports show exactly
what features are used.

**Q: Is @lockness/core enough for an API?**\
A: Yes! It includes Hono with jwt, cors, logger, and all middleware you need.

**Q: What about Hono's cache/logger/validator?**\
A: They're HTTP middleware (still in core). Separate packages are
application-level systems.

**Q: Do I need to install Hono separately?**\
A: No. @lockness/core re-exports everything from Hono. Never install Hono
directly.

**Q: Can I use Hono middleware with Lockness?**\
A: Yes! All Hono middleware is available through @lockness/core.
