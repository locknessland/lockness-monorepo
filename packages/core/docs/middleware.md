# Middleware

Middleware allows you to filter and modify HTTP requests before they reach your
controllers.

## Quick Start

Lockness provides a powerful decorator-based middleware system:

```typescript
// 1. Declare a middleware with a name
@DeclareMiddleware('auth')
export class AuthMiddleware implements MiddlewareContract {
    async handle(c: Context, next: Next) {
        // Your middleware logic
        await next()
    }
}

// 2. Use it in controllers
@Controller('/dashboard')
export class DashboardController {
    @Get('/')
    @UseMiddleware('auth')
    index(c: Context) {
        return c.json({ dashboard: true })
    }
}
```

## Built-in Middleware

Lockness provides access to all Hono middleware directly from `@lockness/core`.
No need to install or import from separate packages!

### Common Middleware Examples

**Security & CORS:**

```typescript
import { cors, csrf, secureHeaders } from '@lockness/core'

app.useMiddleware(
    cors({ origin: 'https://example.com' }),
    csrf(),
    secureHeaders(),
)
```

**Request Handling:**

```typescript
import { bodyLimit, logger, requestId } from '@lockness/core'

app.useMiddleware(
    logger(),
    requestId(),
    bodyLimit({ maxSize: 50 * 1024 }), // 50KB limit
)
```

**Performance:**

```typescript
import { cache, compress, etag } from '@lockness/core'

app.useMiddleware(
    compress(),
    etag(),
    cache({ cacheName: 'my-app', cacheControl: 'max-age=3600' }),
)
```

**Authentication:**

```typescript
import { basicAuth, bearerAuth, jwt } from '@lockness/core'

// HTTP Basic Auth
app.useMiddleware(basicAuth({ username: 'admin', password: 'secret' }))

// Bearer Token
app.useMiddleware(bearerAuth({ token: 'secret-token' }))

// JWT
app.useMiddleware(jwt({ secret: 'jwt-secret' }))
```

**Complete Example:**

```typescript
import {
    App,
    compress,
    cors,
    csrf,
    logger,
    requestId,
    secureHeaders,
} from '@lockness/core'

const app = new App()

app.useMiddleware(
    logger(),
    requestId(),
    cors(),
    csrf(),
    secureHeaders(),
    compress(),
)

await app.init({ controllersDir: './app/controller' })
```

For a complete list of available middleware, see:

- [Hono Middleware Documentation](https://hono.dev/docs/guides/middleware)
- All middleware listed there are available from `@lockness/core`

## Creating Middleware

Generate a new middleware class:

```bash
deno task cli make:middleware Auth
```

This creates `app/middleware/auth_middleware.ts`:

```typescript
import {
    type Context,
    DeclareMiddleware,
    type MiddlewareContract,
    type Next,
} from '@lockness/core'

/**
 * Auth middleware - checks if user is authenticated
 *
 * This middleware is automatically registered as 'auth' via @DeclareMiddleware.
 * Use it in controllers with @UseMiddleware('auth')
 */
@DeclareMiddleware('auth')
export class AuthMiddleware implements MiddlewareContract {
    async handle(c: Context, next: Next) {
        const authHeader = c.req.header('Authorization')

        if (!authHeader) {
            return c.json({ error: 'Unauthorized' }, 401)
        }

        // Verify token, get user, attach to context
        // c.set('user', user)

        await next()
    }
}
```

### The @DeclareMiddleware Decorator

The `@DeclareMiddleware(name)` decorator automatically registers your middleware
in a global registry. When you call `app.init()` with `middlewaresDir`, all
middlewares in that directory are auto-discovered and registered.

```typescript
// Middleware is registered as 'admin' - no manual registration needed!
@DeclareMiddleware('admin')
export class AdminMiddleware implements MiddlewareContract {
    async handle(c: Context, next: Next) {
        const user = c.get('user')
        if (!user?.isAdmin) {
            return c.json({ error: 'Admin access required' }, 403)
        }
        await next()
    }
}
```

## Auto-Discovery

Configure middleware auto-discovery in your kernel:

```typescript
// app/kernel.tsx
await app.init({
    // Auto-discover middlewares decorated with @DeclareMiddleware
    middlewaresDir: './app/middleware',

    // Controllers
    controllersDir: './app/controller',
})
```

All files in `middlewaresDir` are imported, and classes decorated with
`@DeclareMiddleware` are automatically registered. No need to manually import or
configure each middleware!

## Global Middleware

Apply middleware to all routes in `app/kernel.ts`:

```typescript
import { LoggerMiddleware } from '@middleware/logger_middleware.ts'

// Configure global middlewares using fluent API
app.useMiddleware(
    sessionMiddleware(),
    LoggerMiddleware,
)

await app.init({
    middlewaresDir: './app/middleware',
    controllersDir: './app/controller',
})
```

## Named Middleware (Legacy)

You can still manually register middlewares for backward compatibility:

```typescript
import { AuthMiddleware } from '@middleware/auth_middleware.ts'
import { AdminMiddleware } from '@middleware/admin_middleware.ts'

await app.init({
    controllers,
    middlewares: {
        auth: AuthMiddleware,
        admin: AdminMiddleware,
    },
})
```

> **Note:** Middlewares decorated with `@DeclareMiddleware` take precedence over
> manually registered ones with the same name.

## Using Middleware in Controllers

### With @UseMiddleware (Recommended)

Use the `@UseMiddleware` decorator to apply middleware to route methods:

```typescript
import { Controller, Get, UseMiddleware } from '@lockness/core'

@Controller('/dashboard')
export class DashboardController {
    @Get('/')
    @UseMiddleware('auth')
    index(c: Context) {
        return c.json({ dashboard: true })
    }
}
```

### Stacking Multiple Middlewares

Apply multiple middlewares - they execute top-to-bottom:

```typescript
@Controller('/admin')
export class AdminController {
    @Get('/users')
    @UseMiddleware('auth') // Runs first
    @UseMiddleware('admin') // Runs second
    users(c: Context) {
        return c.json({ users: [] })
    }
}
```

### With Class Reference

You can also use middleware classes directly:

```typescript
import { AuthMiddleware } from '@middleware/auth_middleware.ts'

@Controller('/api')
export class ApiController {
    @Get('/data')
    @UseMiddleware(AuthMiddleware)
    getData(c: Context) {
        return c.json({ data: [] })
    }
}
```

## Middleware Examples

**Logger Middleware:**

```typescript
@DeclareMiddleware('logger')
export class LoggerMiddleware implements MiddlewareContract {
    async handle(c: Context, next: Next) {
        const start = Date.now()
        await next()
        const ms = Date.now() - start
        console.log(`${c.req.method} ${c.req.url} - ${ms}ms`)
    }
}
```

**CORS Middleware:**

```typescript
@DeclareMiddleware('cors')
export class CorsMiddleware implements MiddlewareContract {
    async handle(c: Context, next: Next) {
        c.header('Access-Control-Allow-Origin', '*')
        c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
        await next()
    }
}
```

**Rate Limiting:**

```typescript
const requests = new Map<string, number>()

@DeclareMiddleware('rate-limit')
export class RateLimitMiddleware implements MiddlewareContract {
    async handle(c: Context, next: Next) {
        const ip = c.req.header('x-forwarded-for') || 'unknown'
        const count = requests.get(ip) || 0

        if (count > 100) {
            return c.json({ error: 'Rate limit exceeded' }, 429)
        }

        requests.set(ip, count + 1)
        await next()
    }
}
```

## Middleware Order

Middleware execution order:

1. **Global middlewares** - Applied to all routes (via `app.useMiddleware()`)
2. **Route-level middlewares** - Applied via `@UseMiddleware` (top-to-bottom)

Example execution order:

```typescript
// Global middlewares via fluent API
app.useMiddleware(LoggerMiddleware)

@Controller('/api')
export class ApiController {
    @Get('/users')
    @UseMiddleware('auth')   // Runs after global middlewares
    @UseMiddleware('cache')  // Runs after auth
    users(c: Context) { ... }
}

// Execution order: Logger → Auth → Cache → users()
```

## Migration from @Use to @UseMiddleware

The `@Use` decorator is deprecated in favor of `@UseMiddleware` for clearer
intent.

**Before (deprecated):**

```typescript
import { Use } from '@lockness/core'

@Get('/protected')
@Use('auth')
@Use(AuthMiddleware)
protected(c: Context) { ... }
```

**After (recommended):**

```typescript
import { UseMiddleware } from '@lockness/core'

@Get('/protected')
@UseMiddleware('auth')
@UseMiddleware(AuthMiddleware)
protected(c: Context) { ... }
```

Both decorators work identically, but `@UseMiddleware` is preferred for new
code.

## Composing Middlewares

Lockness provides a `compose()` helper to combine multiple middlewares into a
single reusable unit. This is useful for creating middleware stacks that you can
apply in multiple places.

### Basic Usage

```typescript
import { compose, cors, logger } from '@lockness/core'

// Combine multiple middlewares into one
const apiStack = compose([
    logger(), // Hono function middleware
    AuthMiddleware, // Lockness class middleware
    'admin', // Named middleware (resolved from registry)
])

@Controller('/api')
export class ApiController {
    @Get('/users')
    @UseMiddleware(apiStack)
    users(c: Context) {
        return c.json({ users: [] })
    }
}
```

### Alternative Syntax

Use `composeMiddleware()` with rest parameters instead of an array:

```typescript
import { composeMiddleware, cors, logger } from '@lockness/core'

const stack = composeMiddleware(
    logger(),
    AuthMiddleware,
    'admin',
)
```

### Nested Composition

You can compose composed middlewares for complex stacks:

```typescript
// Base auth stack
const authStack = compose([
    sessionMiddleware(),
    'auth',
])

// Admin stack builds on auth
const adminStack = compose([
    authStack,          // Reuse the auth stack
    'admin',
    AuditMiddleware,
])

// Use the complete stack
@Controller('/admin')
@UseMiddleware(adminStack)
export class AdminController { ... }
```

### Supported Middleware Types

The `compose()` function accepts:

- **Hono middleware functions**: `cors()`, `logger()`, `sessionMiddleware()`
- **Lockness class middlewares**: Classes implementing `MiddlewareContract`
- **Named middlewares**: String names registered via `@DeclareMiddleware`
- **Composed middlewares**: Output of another `compose()` call

### Short-Circuiting

If any middleware in the composed stack returns a `Response`, the chain stops
and that response is returned immediately:

```typescript
const protectedStack = compose([
    async (c, next) => {
        if (!c.get('user')) {
            return c.json({ error: 'Unauthorized' }, 401)
        }
        await next()
    },
    AdminMiddleware,
])
```
