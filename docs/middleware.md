# Middleware System

Lockness provides a powerful middleware system with decorator-based registration
for clean, maintainable code.

## Overview

Middlewares in Lockness are classes that implement the `IMiddleware` interface.
They can be:

1. **Declared** with `@DeclareMiddleware` for automatic registration
2. **Used** with `@UseMiddleware` or `@Use` on controllers and routes
3. **Auto-discovered** from a directory at application startup

## Quick Start

### 1. Create a Middleware

```typescript
// app/middleware/auth_middleware.ts
import {
    type Context,
    DeclareMiddleware,
    type IMiddleware,
    type Next,
} from '@lockness/core'

@DeclareMiddleware('auth')
export class AuthMiddleware implements IMiddleware {
    async handle(c: Context, next: Next) {
        const token = c.req.header('Authorization')

        if (!token) {
            return c.json({ error: 'Unauthorized' }, 401)
        }

        // Verify token and attach user to context
        const user = await verifyToken(token)
        c.set('user', user)

        return next()
    }
}
```

### 2. Enable Auto-Discovery

```typescript
// app/kernel.tsx
import { DeclareGlobalMiddleware, Kernel } from '@lockness/core'

@Kernel({
    middlewaresDir: './app/middleware', // Auto-discover @DeclareMiddleware
    controllersDir: './app/controller',
    staticDir: 'public',
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares: unknown[] = []
}
```

### 3. Use in Controllers

```typescript
// app/controller/dashboard_controller.ts
import { Controller, Get, UseMiddleware } from '@lockness/core'

@Controller('/dashboard')
@UseMiddleware('auth') // Apply to all routes
export class DashboardController {
    @Get('/')
    index(c: Context) {
        const user = c.get('user')
        return c.json({ user, message: 'Welcome to dashboard' })
    }

    @Get('/admin')
    @UseMiddleware('admin') // Stack additional middleware
    admin(c: Context) {
        return c.json({ message: 'Admin panel' })
    }
}
```

## Decorator Reference

### `@DeclareMiddleware(name: string)`

Declares a middleware class with a unique name, automatically registering it in
the global middleware registry.

**Parameters:**

- `name` - Unique middleware identifier (e.g., 'auth', 'admin', 'rate-limit')

**Example:**

```typescript
@DeclareMiddleware('rate-limit')
export class RateLimitMiddleware implements IMiddleware {
    async handle(c: Context, next: Next) {
        const ip = c.req.header('x-forwarded-for') || 'unknown'

        if (await isRateLimited(ip)) {
            return c.json({ error: 'Too many requests' }, 429)
        }

        return next()
    }
}
```

### `@UseMiddleware(name: string)`

Applies a named middleware to a controller or route method. Middlewares are
executed in the order they're declared (top to bottom).

**Parameters:**

- `name` - Name of the middleware declared with `@DeclareMiddleware`

**Example:**

```typescript
@Controller('/api')
@UseMiddleware('auth') // Controller-level
export class ApiController {
    @Get('/public')
    public(c: Context) {
        // 'auth' middleware NOT applied (route-level takes precedence)
        return c.json({ public: true })
    }

    @Get('/admin')
    @UseMiddleware('admin') // Method-level (stacks with controller-level)
    admin(c: Context) {
        // Both 'auth' and 'admin' middlewares applied
        return c.json({ admin: true })
    }
}
```

### `@Use(middleware: MiddlewareInput | string)`

Legacy decorator (maintained for backward compatibility). Accepts either a
middleware class or a named string.

**Parameters:**

- `middleware` - Middleware class or name

**Example:**

```typescript
// With class
@Use(LoggerMiddleware)
async index(c: Context) { ... }

// With name (same as @UseMiddleware)
@Use('auth')
async profile(c: Context) { ... }
```

## Middleware Execution Order

Middlewares execute in this order:

1. **Global middlewares** (registered via `app.useMiddleware()`)
2. **Controller-level middlewares** (applied with `@UseMiddleware` on the
   controller class)
3. **Method-level middlewares** (applied with `@UseMiddleware` on the route
   method)
4. **Route handler** (the controller method itself)

```typescript
// Example execution flow
@Controller('/users')
@UseMiddleware('auth') // 2. Controller middleware
export class UserController {
    @Get('/:id')
    @UseMiddleware('owner') // 3. Method middleware
    show(c: Context) { // 4. Handler
        return c.json({ user: c.get('user') })
    }
}

// In kernel.tsx
@Kernel({ controllersDir: './app/controller' })
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [LoggerMiddleware] // 1. Global middleware
}
```

**Execution order for `/users/123`:**

1. `LoggerMiddleware` (global)
2. `AuthMiddleware` (controller-level)
3. `OwnerMiddleware` (method-level)
4. `UserController.show()` (handler)

## Advanced Patterns

### Conditional Middleware

```typescript
@DeclareMiddleware('admin')
export class AdminMiddleware implements IMiddleware {
    async handle(c: Context, next: Next) {
        const user = c.get('user')

        if (!user || user.role !== 'admin') {
            return c.json({ error: 'Forbidden' }, 403)
        }

        return next()
    }
}
```

### Middleware with Context Enrichment

```typescript
@DeclareMiddleware('tenant')
export class TenantMiddleware implements IMiddleware {
    async handle(c: Context, next: Next) {
        const tenantId = c.req.param('tenantId')
        const tenant = await db.query.tenants.findFirst({
            where: eq(tenants.id, tenantId),
        })

        if (!tenant) {
            return c.json({ error: 'Tenant not found' }, 404)
        }

        c.set('tenant', tenant)
        return next()
    }
}
```

### Early Response Middleware

```typescript
@DeclareMiddleware('maintenance')
export class MaintenanceMiddleware implements IMiddleware {
    async handle(c: Context, _next: Next) {
        const isMaintenanceMode = Deno.env.get('MAINTENANCE') === 'true'

        if (isMaintenanceMode) {
            return c.json({
                error: 'Service temporarily unavailable',
                message: 'We are performing scheduled maintenance',
            }, 503)
        }

        // Don't call next() - return directly
        return _next()
    }
}
```

## Manual Registration (Legacy)

For backward compatibility, you can still register middlewares manually in
`app.init()`:

```typescript
await app.init({
    middlewares: {
        'custom': class CustomMiddleware {
            async handle(c: Context, next: Next) {
                // Custom logic
                return next()
            }
        },
    },
})
```

**Note:** Middlewares declared with `@DeclareMiddleware` take precedence over
manually registered ones with the same name.

## Auto-Discovery

When `middlewaresDir` is configured, Lockness automatically imports all `.ts`
and `.tsx` files in that directory, triggering `@DeclareMiddleware` decorators:

```typescript
await app.init({
    middlewaresDir: './app/middleware', // Auto-discover
    // Manual registry (optional, merged with discovered)
    middlewares: {
        'custom': CustomMiddleware,
    },
})
```

## Testing Middlewares

### Unit Testing

```typescript
import { assertEquals } from '@std/assert'
import { AuthMiddleware } from './auth_middleware.ts'

Deno.test('AuthMiddleware - blocks unauthenticated requests', async () => {
    const middleware = new AuthMiddleware()

    const mockContext = {
        req: { header: () => null },
        json: (body: any, status: number) =>
            new Response(JSON.stringify(body), { status }),
    } as any

    const mockNext = async () => new Response('next')

    const response = await middleware.handle(mockContext, mockNext)
    const json = await response.json()

    assertEquals(response.status, 401)
    assertEquals(json.error, 'Unauthorized')
})
```

### Integration Testing

```typescript
import { App } from '@lockness/core'

Deno.test('Middleware integration', async () => {
    const app = new App()

    await app.init({
        controllers: [TestController],
        middlewares: {
            'auth': AuthMiddleware,
        },
    })

    const req = new Request('http://localhost/protected', {
        headers: { 'Authorization': 'Bearer token' },
    })

    const res = await app.fetch(req)
    assertEquals(res.status, 200)
})
```

## Best Practices

1. **Use Descriptive Names**: Choose clear, semantic names like 'auth', 'admin',
   'rate-limit'
2. **Keep Middlewares Focused**: Each middleware should have a single
   responsibility
3. **Auto-Discovery in Dev**: Use `middlewaresDir` for auto-discovery during
   development
4. **Fail Fast**: Return early for invalid requests to avoid unnecessary
   processing
5. **Enrich Context**: Use `c.set()` to attach data for downstream handlers
6. **Error Handling**: Return appropriate HTTP status codes (401, 403, 429,
   etc.)
7. **Document Behavior**: Add JSDoc comments explaining what the middleware does

## Common Patterns

### Authentication Chain

```typescript
@Controller('/api')
@UseMiddleware('auth')           // Verify token
@UseMiddleware('refresh-token')  // Refresh if needed
export class ApiController { ... }
```

### Role-Based Access

```typescript
@Get('/admin/users')
@UseMiddleware('auth')   // Must be authenticated
@UseMiddleware('admin')  // Must have admin role
listUsers(c: Context) { ... }
```

### Rate Limiting

```typescript
@Post('/api/send-email')
@UseMiddleware('auth')
@UseMiddleware('rate-limit')  // Prevent spam
sendEmail(c: Context) { ... }
```

## Migration Guide

### From Manual Registration

**Before:**

```typescript
// kernel.tsx
await app.init({
    middlewares: {
        auth: class AuthMiddleware {
            async handle(c: Context, next: Next) {
                return await authMiddleware()(c, next)
            }
        },
    },
})
```

**After:**

```typescript
// app/middleware/auth_middleware.ts
@DeclareMiddleware('auth')
export class AuthMiddleware implements IMiddleware {
    async handle(c: Context, next: Next) {
        return await authMiddleware()(c, next)
    }
}

// kernel.tsx
await app.init({
    middlewaresDir: './app/middleware', // Auto-discover
})
```

### From `@Use` to `@UseMiddleware`

Both decorators work identically with named middlewares. Use `@UseMiddleware`
for clarity:

**Before:**

```typescript
@Use('auth')
@Use('admin')
admin(c: Context) { ... }
```

**After:**

```typescript
@UseMiddleware('auth')
@UseMiddleware('admin')
admin(c: Context) { ... }
```

## See Also

- [Controllers Documentation](./controllers.md)
- [Authentication Guide](./authentication.md)
- [Testing Best Practices](./testing.md)
