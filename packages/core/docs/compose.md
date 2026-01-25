# Middleware Composition

The `compose()` helper allows you to combine multiple middlewares into a single
reusable middleware handler. This is useful for creating middleware stacks that
can be applied consistently across multiple routes or controllers.

## Why Use Compose?

- **Reusability**: Define a middleware stack once, use it everywhere
- **Cleaner Code**: Avoid repeating multiple `@UseMiddleware` decorators
- **Flexibility**: Mix Hono functions, Lockness classes, and named middlewares
- **Nesting**: Build complex stacks from simpler ones

## Import

```typescript
import { compose, ComposeMiddleware, composeMiddleware } from '@lockness/core'
```

## `@ComposeMiddleware` Decorator (Recommended)

The `@ComposeMiddleware` decorator provides the cleanest syntax for inline
middleware composition. It combines `compose()` and `@UseMiddleware()` in a
single decorator:

```typescript
import { ComposeMiddleware, cors, logger } from '@lockness/core'

@Controller('/api')
export class ApiController {
    @Get('/users')
    @ComposeMiddleware(logger(), AuthMiddleware, 'admin')
    users(c: Context) {
        return c.json({ users: [] })
    }
}
```

**Benefits:**

- ✅ No intermediate variable needed
- ✅ Single import (`ComposeMiddleware`)
- ✅ Inline declaration at the route level
- ✅ Supports all middleware types (functions, classes, named)

### Comparison

| Approach                         | Lines | Imports Required           |
| -------------------------------- | ----- | -------------------------- |
| `@ComposeMiddleware(...)`        | 1     | `ComposeMiddleware`        |
| `compose()` + `@UseMiddleware()` | 2-4   | `compose`, `UseMiddleware` |

## Basic Usage (Alternative)

If you prefer to define reusable stacks or need more control, use `compose()`
with `@UseMiddleware()`:

### Array Syntax

```typescript
import { compose, cors, logger } from '@lockness/core'

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

### Rest Parameters Syntax

```typescript
import { composeMiddleware, cors, logger } from '@lockness/core'

const stack = composeMiddleware(
    logger(),
    AuthMiddleware,
    'admin',
)
```

## Supported Middleware Types

The `compose()` function accepts any combination of:

| Type                     | Example              | Description                         |
| ------------------------ | -------------------- | ----------------------------------- |
| **Hono functions**       | `cors()`, `logger()` | Built-in Hono middleware            |
| **Class middlewares**    | `AuthMiddleware`     | Classes implementing `IMiddleware`  |
| **Named middlewares**    | `'auth'`, `'admin'`  | Registered via `@DeclareMiddleware` |
| **Composed middlewares** | `authStack`          | Output of another `compose()` call  |

## Nested Composition

You can compose composed middlewares for complex stacks:

```typescript
// Layer 1: Base authentication
const authStack = compose([
    sessionMiddleware(),
    'auth',
])

// Layer 2: Admin-specific (includes auth)
const adminStack = compose([
    authStack,          // Reuse the auth stack
    'admin',
    AuditMiddleware,
])

// Layer 3: Super admin (includes admin)
const superAdminStack = compose([
    adminStack,
    SuperAdminMiddleware,
    'rate-limit',
])

// Use the complete stack
@Controller('/super-admin')
@UseMiddleware(superAdminStack)
export class SuperAdminController { ... }
```

## Execution Order

Middlewares execute in the order they appear in the array, following Hono's
"onion" model:

```typescript
const stack = compose([m1, m2, m3])

// Execution order:
// m1 → m2 → m3 → handler → m3 → m2 → m1
```

Example with logging:

```typescript
const loggingStack = compose([
    async (c, next) => {
        console.log('1. First middleware START')
        await next()
        console.log('6. First middleware END')
    },
    async (c, next) => {
        console.log('2. Second middleware START')
        await next()
        console.log('5. Second middleware END')
    },
    async (c, next) => {
        console.log('3. Third middleware START')
        await next()
        console.log('4. Third middleware END')
    },
])

// Output:
// 1. First middleware START
// 2. Second middleware START
// 3. Third middleware START
// 4. Third middleware END
// 5. Second middleware END
// 6. First middleware END
```

## Short-Circuiting

If any middleware returns a `Response` without calling `next()`, the chain stops
immediately:

```typescript
const protectedStack = compose([
    async (c, next) => {
        const user = c.get('user')
        if (!user) {
            // Short-circuit: return early, don't call next()
            return c.json({ error: 'Unauthorized' }, 401)
        }
        await next()
    },
    AdminMiddleware, // Only runs if user exists
    AuditMiddleware, // Only runs if user exists
])
```

## Common Patterns

### API Authentication Stack

```typescript
const apiAuthStack = compose([
    cors({ origin: ['https://app.example.com'] }),
    bearerAuth({ token: Deno.env.get('API_TOKEN')! }),
    requestId(),
    logger(),
])

@Controller('/api/v1')
@UseMiddleware(apiAuthStack)
export class ApiV1Controller { ... }
```

### Rate-Limited Public Endpoints

```typescript
const publicStack = compose([
    cors(),
    compress(),
    RateLimitMiddleware,
])

@Controller('/public')
@UseMiddleware(publicStack)
export class PublicController { ... }
```

### Development vs Production

```typescript
const baseStack = compose([
    sessionMiddleware(),
    'auth',
])

const devStack = compose([
    baseStack,
    logger(), // Extra logging in dev
])

const prodStack = compose([
    baseStack,
    compress(),
    secureHeaders(),
])

const appStack = Deno.env.get('APP_ENV') === 'production' ? prodStack : devStack
```

## API Reference

### `compose(middlewares)`

Composes an array of middlewares into a single middleware handler.

**Parameters:**

- `middlewares` - Array of `ComposableMiddleware` (functions, classes, or
  strings)

**Returns:** `MiddlewareHandler`

```typescript
const stack = compose([
    cors(),
    AuthMiddleware,
    'admin',
])
```

### `composeMiddleware(...middlewares)`

Alternative syntax using rest parameters instead of an array.

**Parameters:**

- `...middlewares` - Rest parameters of `ComposableMiddleware`

**Returns:** `MiddlewareHandler`

```typescript
const stack = composeMiddleware(
    cors(),
    AuthMiddleware,
    'admin',
)
```

### `ComposableMiddleware` Type

```typescript
type ComposableMiddleware =
    | MiddlewareHandler                              // Hono function
    | { new(): { handle: (c, next) => ... } }        // Lockness class
    | string                                          // Named middleware
```

## Error Handling

If a named middleware is not found in the registry, it is skipped with a
warning:

```typescript
const stack = compose([
    'auth',
    'non-existent-middleware', // ⚠️ Warning logged, skipped
    'admin',
])
```

To avoid this, ensure all named middlewares are registered via
`@DeclareMiddleware` before the composed stack is used.

## Best Practices

1. **Name your stacks descriptively**: `authStack`, `apiStack`, `adminStack`
2. **Keep stacks focused**: One stack for auth, another for API config
3. **Document complex stacks**: Add comments explaining the middleware order
4. **Test composed stacks**: Write integration tests for critical stacks
5. **Consider environment**: Create separate stacks for dev/prod if needed
