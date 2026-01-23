# Lockness Architecture

Understanding Lockness modular architecture and package system.

## Core Philosophy

Lockness follows a **minimal core, optional features** approach:

- **@lockness/core** - Essential framework only (App, DI, Hono)
- **Optional packages** - Import explicitly when needed

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
import { configureSession, sessionMiddleware } from '@lockness/session'

configureSession({
    driver: 'cookie',
    secret: Deno.env.get('SESSION_SECRET')!,
})

app.useMiddleware(sessionMiddleware())
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
import { UserProvider } from './auth/user_provider.ts'

app.useMiddleware(
    initializeAuthMiddleware({
        default: 'web',
        guards: {
            web: (ctx) => new SessionGuard('web', ctx, new UserProvider()),
        },
    }),
)
```

## Architecture Benefits

### 1. Lightweight APIs

```typescript
// Minimal JWT API (no sessions, no queue)
import { App, Controller, Get, jwt } from '@lockness/core'

const app = new App()
app.useMiddleware(jwt({ secret: 'your-secret' }))
```

**Bundle includes:** Only core + Hono (~2MB)\
**Excludes:** Session, queue, cache systems (unused code)

### 2. Full Web App

```typescript
// Traditional web app with all features
import { App, Controller, Get } from '@lockness/core'
import { configureSession, sessionMiddleware } from '@lockness/session'
import { configureQueue } from '@lockness/queue'
import { cache } from '@lockness/cache'

const app = new App()
configureSession({ driver: 'cookie', secret: 'secret' })
configureQueue({ driver: 'deno-kv' })

app.useMiddleware(sessionMiddleware())
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
import { App, jwt } from '@lockness/core'

const app = new App()
app.useMiddleware(jwt({ secret: 'secret' }))
```

### Traditional Web App

**Dependencies:**

- @lockness/core
- @lockness/session
- @lockness/auth

**Setup:**

```typescript
import { App } from '@lockness/core'
import { configureSession, sessionMiddleware } from '@lockness/session'
import { initializeAuthMiddleware } from '@lockness/auth'

const app = new App()
configureSession({ driver: 'cookie', secret: 'secret' })
app.useMiddleware(sessionMiddleware(), initializeAuthMiddleware({/* ... */}))
```

### Full-Featured SaaS

**Dependencies:**

- @lockness/core
- @lockness/session
- @lockness/auth
- @lockness/queue
- @lockness/cache
- @lockness/mail
- @lockness/storage

**Setup:**

```typescript
import { App } from '@lockness/core'
import { configureSession, sessionMiddleware } from '@lockness/session'
import { configureQueue } from '@lockness/queue'
import { configureCache } from '@lockness/cache'
import { configureMail } from '@lockness/mail'
import { configureStorage } from '@lockness/storage'

// Configure all features
configureSession({/* ... */})
configureQueue({/* ... */})
configureCache({/* ... */})
configureMail({/* ... */})
configureStorage({/* ... */})
```

## Migration Guide

If you have existing code importing from `@lockness/core`:

### Sessions

```typescript
// ❌ Old (no longer works)
import { configureSession, sessionMiddleware } from '@lockness/core'

// ✅ New (explicit import)
import { configureSession, sessionMiddleware } from '@lockness/session'
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
