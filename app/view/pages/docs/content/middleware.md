# Middleware

Middleware allows you to filter and modify HTTP requests before they reach your
controllers.

## Creating Middleware

Generate a new middleware class:

```bash
deno task cli make:middleware Auth
```

This creates `app/middleware/auth_middleware.ts`:

```typescript
import { Context, IMiddleware, MiddlewareHandler } from '@lockness/core'

export class AuthMiddleware implements IMiddleware {
    handle: MiddlewareHandler = async (c: Context, next) => {
        // Your middleware logic here
        console.log('Request URL:', c.req.url)

        await next()

        // After response
        console.log('Response status:', c.res.status)
    }
}
```

## Global Middleware

Apply middleware to all routes in `app/kernel.ts`:

```typescript
import { LoggerMiddleware } from '@middleware/logger_middleware.ts'
import { CorsMiddleware } from '@middleware/cors_middleware.ts'

// Configure global middlewares using fluent API
app.useMiddleware(
    LoggerMiddleware,
    CorsMiddleware,
)

await app.init({
    controllers,
})
```

## Named Middleware

Register middleware by name for use with `@Use()` decorator:

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

## Using Middleware in Controllers

**With class reference:**

```typescript
import { Controller, Get, Use } from '@lockness/core'
import { AuthMiddleware } from '@middleware/auth_middleware.ts'

@Controller('/dashboard')
export class DashboardController {
    @Get('/')
    @Use(AuthMiddleware)
    index(c: Context) {
        return c.json({ dashboard: true })
    }
}
```

**With named middleware:**

```typescript
@Controller('/admin')
export class AdminController {
    @Get('/users')
    @Use('auth')
    @Use('admin')
    users(c: Context) {
        return c.json({ users: [] })
    }
}
```

**Controller-level middleware:**

```typescript
@Controller('/api')
@Use(AuthMiddleware)
export class ApiController {
    // All routes in this controller use AuthMiddleware
    
    @Get('/users')
    users(c: Context) { ... }
    
    @Get('/posts')
    posts(c: Context) { ... }
}
```

## Middleware Examples

**Logger Middleware:**

```typescript
export class LoggerMiddleware implements IMiddleware {
    handle: MiddlewareHandler = async (c, next) => {
        const start = Date.now()
        await next()
        const ms = Date.now() - start
        console.log(`${c.req.method} ${c.req.url} - ${ms}ms`)
    }
}
```

**CORS Middleware:**

```typescript
export class CorsMiddleware implements IMiddleware {
    handle: MiddlewareHandler = async (c, next) => {
        c.header('Access-Control-Allow-Origin', '*')
        c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
        await next()
    }
}
```

**Rate Limiting:**

```typescript
const requests = new Map<string, number>()

export class RateLimitMiddleware implements IMiddleware {
    handle: MiddlewareHandler = async (c, next) => {
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

1. **Global middlewares** - Applied to all routes
2. **Controller-level middlewares** - Applied to all routes in controller
3. **Route-level middlewares** - Applied to specific route method

Example execution order:

```typescript
// Global middlewares via fluent API
app.useMiddleware(LoggerMiddleware)

@Controller('/api')
@Use(AuthMiddleware)
export class ApiController {
    @Get('/users')
    @Use(CacheMiddleware)
    users(c: Context) { ... }
}

// Execution order: Logger → Auth → Cache → users()
```
