# Technical Task: @Kernel Decorator

## Overview

Implement a `@Kernel` class decorator to enable declarative application
configuration, replacing the imperative `bootstrap()` function with a more
structured, readable approach.

## Current State (Imperative)

```typescript
// app/kernel.tsx
export const bootstrap = async (): Promise<App> => {
    const db = container.get<Database>(Database)
    await db.connect(Deno.env.get('DATABASE_URL') || '...')

    configureSession({
        driver: 'cookie',
        secret: Deno.env.get('APP_KEY') || '...',
        lifetime: 7200,
        secure: Deno.env.get('APP_ENV') === 'production',
    })

    const app = new App()

    if (app.isDevelopment) {
        enableDevtools(app.getHono())
    }

    app.useMiddleware(
        sessionMiddleware(),
        initializeAuthMiddleware({ ... }),
        LoggerMiddleware,
    )

    await app.init({
        controllersDir: app.isDevelopment ? './app/controller' : undefined,
        controllers: app.isDevelopment ? undefined : controllers,
        staticDir: 'public',
        middlewares: { auth: AuthMiddleware },
    })

    if (app.isDevelopment) {
        collectAppRoutes(app)
    }

    return app
}
```

## Target State (Declarative)

```typescript
// app/kernel.tsx
import { GlobalMiddleware, Kernel, NamedMiddlewares } from '@lockness/core'

@Kernel({
    database: { url: Deno.env.get('DATABASE_URL') },
    session: { driver: 'cookie', lifetime: 7200 },
    devtools: true,
    staticDir: 'public',
    controllersDir: './app/controller',
})
export class AppKernel {
    @GlobalMiddleware()
    globalMiddlewares = [
        sessionMiddleware(),
        initializeAuthMiddleware({
            default: 'web',
            guards: {
                web: (ctx) => new SessionGuard('web', ctx, new UserProvider()),
            },
        }),
        LoggerMiddleware,
    ]

    @NamedMiddlewares()
    namedMiddlewares = {
        auth: AuthMiddleware,
        admin: AdminMiddleware,
    }
}

// main.ts
import { AppKernel } from './app/kernel.tsx'
import { createApp } from '@lockness/core'

const app = await createApp(AppKernel)
app.listen(8888)
```

## Implementation Details

### 1. Kernel Decorator

**File**: `packages/core/kernel/decorators.ts`

````typescript
/**
 * Kernel configuration options
 */
export interface KernelConfig {
    /**
     * Database configuration
     */
    database?: {
        url?: string
        autoConnect?: boolean
    } | boolean

    /**
     * Session configuration
     */
    session?: {
        driver?: 'cookie' | 'deno-kv' | 'memory'
        secret?: string
        lifetime?: number
        secure?: boolean
    } | boolean

    /**
     * Enable devtools in development
     */
    devtools?: boolean

    /**
     * Static files directory
     */
    staticDir?: string

    /**
     * Controllers directory (dev) or explicit imports (prod)
     */
    controllersDir?: string
    controllers?: unknown[]

    /**
     * Middlewares directory for auto-discovery
     */
    middlewaresDir?: string
}

/**
 * Symbol keys for kernel metadata
 */
export const KERNEL_CONFIG = Symbol('kernel:config')
export const KERNEL_GLOBAL_MIDDLEWARE = Symbol('kernel:globalMiddleware')
export const KERNEL_NAMED_MIDDLEWARES = Symbol('kernel:namedMiddlewares')
export const KERNEL_BOOT_HOOKS = Symbol('kernel:bootHooks')

/**
 * Decorator to configure the application kernel.
 *
 * @param config - Kernel configuration options
 *
 * @example
 * ```typescript
 * @Kernel({
 *     database: { url: Deno.env.get('DATABASE_URL') },
 *     session: { driver: 'cookie', lifetime: 7200 },
 *     devtools: true,
 * })
 * export class AppKernel {
 *     // ...
 * }
 * ```
 */
export function Kernel(config: KernelConfig = {}) {
    return function <T extends new (...args: any[]) => any>(
        target: T,
        context: ClassDecoratorContext,
    ) {
        if (context.kind !== 'class') {
            throw new Error('@Kernel can only decorate classes')
        } // Store configuration on class

        ;(target as any)[KERNEL_CONFIG] = config // Initialize metadata arrays
        ;(target as any)[KERNEL_BOOT_HOOKS] = []

        return target
    }
}
````

### 2. Property Decorators

**File**: `packages/core/kernel/decorators.ts` (continued)

```typescript
/**
 * Mark a property as the global middleware list
 */
export function GlobalMiddleware() {
    return function (
        _target: undefined,
        context: ClassFieldDecoratorContext,
    ) {
        const fieldName = context.name

        context.addInitializer(function () {
            const constructor = this.constructor as any
            constructor[KERNEL_GLOBAL_MIDDLEWARE] = fieldName
        })
    }
}

/**
 * Mark a property as the named middlewares map
 */
export function NamedMiddlewares() {
    return function (
        _target: undefined,
        context: ClassFieldDecoratorContext,
    ) {
        const fieldName = context.name

        context.addInitializer(function () {
            const constructor = this.constructor as any
            constructor[KERNEL_NAMED_MIDDLEWARES] = fieldName
        })
    }
}
```

### 3. Kernel Loader

**File**: `packages/core/kernel/loader.ts`

```typescript
import { App } from '../app.ts'
import { container } from '@lockness/container'
import {
    KERNEL_BOOT_HOOKS,
    KERNEL_CONFIG,
    KERNEL_GLOBAL_MIDDLEWARE,
    KERNEL_NAMED_MIDDLEWARES,
    type KernelConfig,
} from './decorators.ts'

/**
 * Create and bootstrap an App from a decorated Kernel class
 */
export async function createApp<T>(KernelClass: new () => T): Promise<App> {
    const config: KernelConfig = (KernelClass as any)[KERNEL_CONFIG] ?? {}
    const globalMiddlewareProp = (KernelClass as any)[KERNEL_GLOBAL_MIDDLEWARE]
    const namedMiddlewaresProp = (KernelClass as any)[KERNEL_NAMED_MIDDLEWARES]
    const bootHooks: Array<{ method: string; priority: number }> =
        (KernelClass as any)[KERNEL_BOOT_HOOKS] ?? []

    // Instantiate kernel to access properties
    const kernel = new KernelClass()

    // 1. Database connection
    if (config.database) {
        const Database = (await import('@lockness/drizzle')).Database
        const db = container.get<typeof Database>(Database)
        const url = typeof config.database === 'object'
            ? config.database.url
            : Deno.env.get('DATABASE_URL')
        if (url) {
            await db.connect(url)
        }
    }

    // 2. Session configuration
    if (config.session) {
        const { configureSession } = await import('@lockness/session')
        const sessionConfig = typeof config.session === 'object'
            ? config.session
            : {}
        configureSession({
            driver: sessionConfig.driver ?? 'cookie',
            secret: sessionConfig.secret ?? Deno.env.get('APP_KEY'),
            lifetime: sessionConfig.lifetime ?? 7200,
            secure: sessionConfig.secure ??
                Deno.env.get('APP_ENV') === 'production',
        })
    }

    // 3. Create App
    const app = new App()

    // 4. Devtools
    if (config.devtools && app.isDevelopment) {
        const { enableDevtools } = await import('@lockness/devtools')
        enableDevtools(app.getHono())
    }

    // 5. Global middlewares
    if (globalMiddlewareProp && (kernel as any)[globalMiddlewareProp]) {
        const middlewares = (kernel as any)[globalMiddlewareProp]
        app.useMiddleware(...middlewares)
    }

    // 6. Run boot hooks (sorted by priority)
    bootHooks.sort((a, b) => b.priority - a.priority)
    for (const hook of bootHooks) {
        await (kernel as any)[hook.method](app)
    }

    // 7. Initialize app
    const namedMiddlewares = namedMiddlewaresProp
        ? (kernel as any)[namedMiddlewaresProp]
        : undefined

    await app.init({
        controllersDir: app.isDevelopment ? config.controllersDir : undefined,
        controllers: app.isDevelopment ? undefined : config.controllers,
        staticDir: config.staticDir,
        middlewaresDir: config.middlewaresDir,
        middlewares: namedMiddlewares,
    })

    // 8. Collect routes for devtools
    if (config.devtools && app.isDevelopment) {
        const { collectAppRoutes } = await import('@lockness/devtools')
        collectAppRoutes(app)
    }

    return app
}
```

### 4. Exports

**File**: `packages/core/mod.ts`

```typescript
// Kernel decorators
export {
    GlobalMiddleware,
    Kernel,
    type KernelConfig,
    NamedMiddlewares,
} from './kernel/decorators.ts'

export { createApp } from './kernel/loader.ts'
```

## Files to Create/Modify

| File                                 | Action | Description            |
| ------------------------------------ | ------ | ---------------------- |
| `packages/core/kernel/decorators.ts` | Create | Kernel decorators      |
| `packages/core/kernel/loader.ts`     | Create | Kernel bootstrap logic |
| `packages/core/kernel/mod.ts`        | Create | Barrel export          |
| `packages/core/mod.ts`               | Modify | Export kernel features |
| `packages/core/tests/kernel.test.ts` | Create | Unit tests             |
| `packages/core/docs/kernel.md`       | Create | Documentation          |

## Backward Compatibility

The imperative `bootstrap()` function pattern must continue to work. The
`@Kernel` decorator is an **optional alternative**, not a replacement.

## Migration Path

1. Keep existing `bootstrap()` function working
2. Introduce `@Kernel` as opt-in
3. Document migration guide
4. Eventually recommend `@Kernel` for new projects

## Acceptance Criteria

- [ ] `@Kernel(config)` decorator stores configuration metadata
- [ ] `@GlobalMiddleware()` marks middleware list property
- [ ] `@NamedMiddlewares()` marks named middlewares property
- [ ] `createApp(KernelClass)` bootstraps from decorated class
- [ ] Database, session, devtools configured from decorator options
- [ ] Imperative bootstrap continues to work
- [ ] Unit tests pass
- [ ] Documentation created

## Priority

Low - Major DX improvement but requires careful design

## Estimated Effort

8-12 hours

## Dependencies

- Depends on `@NamedMiddleware` decorator (for middleware discovery)
- Depends on `@OnBoot` decorator (for boot hooks)
