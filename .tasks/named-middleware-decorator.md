# Technical Task: @NamedMiddleware Decorator

## Overview

Implement a `@NamedMiddleware` decorator to register class-based middlewares
with a name for use with the `@Use('name')` decorator on controller methods.

## Current State (Verbose)

```typescript
// app/kernel.tsx
await app.init({
    middlewares: {
        auth: class AuthMiddleware {
            async handle(c: Context, next: Next): Promise<Response | void> {
                return await authMiddleware()(c, next)
            }
        },
        admin: class AdminMiddleware {
            async handle(c: Context, next: Next): Promise<Response | void> {
                // check admin role...
            }
        },
    },
})
```

## Target State (Clean)

```typescript
// app/middleware/auth_middleware.ts
import { NamedMiddleware } from '@lockness/core'

@NamedMiddleware('auth')
export class AuthMiddleware {
    async handle(c: Context, next: Next) {
        return await authMiddleware()(c, next)
    }
}

// app/middleware/admin_middleware.ts
@NamedMiddleware('admin')
export class AdminMiddleware {
    async handle(c: Context, next: Next) {
        // check admin role...
    }
}

// app/kernel.tsx - Auto-discovered or explicit import
await app.init({
    middlewaresDir: './app/middleware', // Auto-discovery
    // OR
    middlewares: [AuthMiddleware, AdminMiddleware], // Explicit (production)
})
```

## Implementation Details

### 1. Decorator Definition

**File**: `packages/core/decorators.ts`

````typescript
/**
 * Symbol to store middleware name metadata
 */
export const MIDDLEWARE_NAME_KEY = Symbol('middleware:name')

/**
 * Register a class-based middleware with a name.
 * The middleware can then be used with @Use('name') on controller methods.
 *
 * @param name - Unique middleware name (e.g., 'auth', 'admin', 'throttle')
 *
 * @example
 * ```typescript
 * @NamedMiddleware('auth')
 * export class AuthMiddleware {
 *     async handle(c: Context, next: Next) {
 *         const user = await getUser(c)
 *         if (!user) return c.redirect('/login')
 *         return next()
 *     }
 * }
 * ```
 */
export function NamedMiddleware(name: string) {
    return function <T extends new (...args: any[]) => any>(
        target: T,
        context: ClassDecoratorContext,
    ) {
        if (context.kind !== 'class') {
            throw new Error('@NamedMiddleware can only decorate classes')
        } // Store metadata on the class

        ;(target as any)[MIDDLEWARE_NAME_KEY] = name

        return target
    }
}
````

### 2. Middleware Discovery

**File**: `packages/core/middleware_discovery.ts` (new file)

```typescript
import { MIDDLEWARE_NAME_KEY } from './decorators.ts'

export interface MiddlewareClass {
    new (): { handle: MiddlewareHandler }
    [MIDDLEWARE_NAME_KEY]?: string
}

/**
 * Extract middleware name from decorated class
 */
export function getMiddlewareName(cls: MiddlewareClass): string | undefined {
    return (cls as any)[MIDDLEWARE_NAME_KEY]
}

/**
 * Discover named middlewares from directory
 */
export async function discoverMiddlewares(
    dir: string,
): Promise<Map<string, MiddlewareClass>> {
    const middlewares = new Map<string, MiddlewareClass>()

    for await (const entry of Deno.readDir(dir)) {
        if (!entry.isFile || !entry.name.endsWith('.ts')) continue

        const module = await import(`${dir}/${entry.name}`)

        for (const exported of Object.values(module)) {
            if (typeof exported === 'function') {
                const name = getMiddlewareName(exported as MiddlewareClass)
                if (name) {
                    middlewares.set(name, exported as MiddlewareClass)
                }
            }
        }
    }

    return middlewares
}
```

### 3. App Integration

**File**: `packages/core/app.ts`

Update `AppConfig` interface:

```typescript
interface AppConfig {
    // ... existing options

    /**
     * Directory to auto-discover named middlewares (development)
     */
    middlewaresDir?: string

    /**
     * Explicit middleware classes (production)
     * Can be array of decorated classes OR object mapping
     */
    middlewares?: MiddlewareClass[] | Record<string, MiddlewareClass>
}
```

Update `init()` method to handle both formats:

```typescript
async init(config: AppConfig) {
    // ... existing logic

    // Handle middlewares
    if (config.middlewaresDir) {
        const discovered = await discoverMiddlewares(config.middlewaresDir)
        this.namedMiddlewares = discovered
    } else if (Array.isArray(config.middlewares)) {
        // Extract names from decorated classes
        for (const cls of config.middlewares) {
            const name = getMiddlewareName(cls)
            if (name) {
                this.namedMiddlewares.set(name, cls)
            }
        }
    } else if (config.middlewares) {
        // Legacy object format
        for (const [name, cls] of Object.entries(config.middlewares)) {
            this.namedMiddlewares.set(name, cls)
        }
    }
}
```

## Files to Create/Modify

| File                                           | Action | Description                              |
| ---------------------------------------------- | ------ | ---------------------------------------- |
| `packages/core/decorators.ts`                  | Modify | Add `@NamedMiddleware` decorator         |
| `packages/core/middleware_discovery.ts`        | Create | Middleware discovery logic               |
| `packages/core/app.ts`                         | Modify | Update `init()` for middleware discovery |
| `packages/core/mod.ts`                         | Modify | Export `NamedMiddleware`                 |
| `packages/core/types.ts`                       | Modify | Add `MiddlewareClass` type               |
| `packages/core/tests/named_middleware.test.ts` | Create | Unit tests                               |
| `packages/core/docs/middleware.md`             | Modify | Update documentation                     |

## Backward Compatibility

The existing object format in `middlewares` config must continue to work:

```typescript
// Old format - MUST still work
middlewares: {
    auth: class { async handle() {} }
}

// New format - decorated classes
middlewares: [AuthMiddleware, AdminMiddleware]
```

## Acceptance Criteria

- [ ] `@NamedMiddleware('name')` decorator stores metadata on class
- [ ] `middlewaresDir` option auto-discovers decorated middlewares
- [ ] `middlewares` accepts both array and object formats
- [ ] Existing kernel configurations continue to work
- [ ] `@Use('name')` resolves decorated middlewares
- [ ] Unit tests pass
- [ ] Documentation updated

## Priority

Medium - Improves DX but not blocking

## Estimated Effort

4-6 hours
