# Technical Task: @OnBoot Decorator

## Overview

Implement an `@OnBoot` decorator to mark methods that should be executed during
the kernel bootstrap phase. This enables clean separation of initialization
logic with optional priority ordering.

## Current State (Mixed Concerns)

```typescript
// app/kernel.tsx
export const bootstrap = async (): Promise<App> => {
    // Database connection mixed with app setup
    const db = container.get<Database>(Database)
    await db.connect(Deno.env.get('DATABASE_URL') || '...')

    // Session config mixed with app setup
    configureSession({
        driver: 'cookie',
        secret: Deno.env.get('APP_KEY') || '...',
        lifetime: 7200,
    })

    const app = new App()

    // Custom initialization mixed with framework config
    await seedDatabase()
    await warmCache()
    await registerScheduledTasks()

    // ... more setup
    return app
}
```

## Target State (Organized)

```typescript
// app/kernel.tsx
import { Kernel, OnBoot } from '@lockness/core'

@Kernel({ database: true, session: true })
export class AppKernel {
    /**
     * Connect to database (runs first - priority 100)
     */
    @OnBoot({ priority: 100 })
    async connectDatabase(app: App) {
        const db = container.get<Database>(Database)
        await db.connect(Deno.env.get('DATABASE_URL'))
    }

    /**
     * Seed database with initial data (priority 50)
     */
    @OnBoot({ priority: 50 })
    async seedDatabase(app: App) {
        if (app.isDevelopment) {
            await runSeeders()
        }
    }

    /**
     * Warm caches (priority 30)
     */
    @OnBoot({ priority: 30 })
    async warmCache(app: App) {
        await cache.warm(['config', 'routes', 'views'])
    }

    /**
     * Register scheduled tasks (priority 10)
     */
    @OnBoot({ priority: 10 })
    async registerScheduledTasks(app: App) {
        scheduler.register('cleanup', '0 0 * * *', cleanupJob)
    }

    /**
     * Log startup complete (lowest priority - default 0)
     */
    @OnBoot()
    async logStartup(app: App) {
        console.log('🚀 Application started')
    }
}
```

## Implementation Details

### 1. Decorator Definition

**File**: `packages/core/kernel/decorators.ts`

````typescript
/**
 * Boot hook metadata
 */
export interface BootHookMeta {
    /** Method name */
    method: string
    /** Execution priority (higher = earlier) */
    priority: number
}

/**
 * Symbol to store boot hooks on kernel class
 */
export const KERNEL_BOOT_HOOKS = Symbol('kernel:bootHooks')

/**
 * OnBoot options
 */
export interface OnBootOptions {
    /**
     * Execution priority. Higher values execute first.
     * @default 0
     *
     * Recommended priority ranges:
     * - 100+: Critical infrastructure (database, cache connections)
     * - 50-99: Data initialization (seeders, migrations)
     * - 20-49: Service registration (scheduled tasks, event listeners)
     * - 0-19: Final setup (logging, metrics)
     */
    priority?: number
}

/**
 * Mark a method to be executed during kernel bootstrap.
 * Methods are called in priority order (highest first).
 *
 * @param options - Configuration options
 *
 * @example
 * ```typescript
 * @Kernel()
 * export class AppKernel {
 *     @OnBoot({ priority: 100 })
 *     async connectDatabase(app: App) {
 *         await db.connect()
 *     }
 *
 *     @OnBoot({ priority: 50 })
 *     async seedData(app: App) {
 *         await runSeeders()
 *     }
 *
 *     @OnBoot() // priority: 0
 *     async logStartup(app: App) {
 *         console.log('Started!')
 *     }
 * }
 * ```
 */
export function OnBoot(options: OnBootOptions = {}) {
    return function <T extends (...args: any[]) => any>(
        originalMethod: T,
        context: ClassMethodDecoratorContext,
    ) {
        if (context.kind !== 'method') {
            throw new Error('@OnBoot can only decorate methods')
        }

        const methodName = String(context.name)
        const priority = options.priority ?? 0

        // Register hook when class is instantiated
        context.addInitializer(function () {
            const constructor = this.constructor as any

            // Initialize hooks array if needed
            if (!constructor[KERNEL_BOOT_HOOKS]) {
                constructor[KERNEL_BOOT_HOOKS] = []
            }

            // Add this method to boot hooks
            constructor[KERNEL_BOOT_HOOKS].push({
                method: methodName,
                priority,
            })
        })

        return originalMethod
    }
}
````

### 2. Standalone Usage (Without @Kernel)

The `@OnBoot` decorator can also work with the traditional `bootstrap()`
function:

**File**: `packages/core/kernel/boot_runner.ts`

````typescript
import { type BootHookMeta, KERNEL_BOOT_HOOKS } from './decorators.ts'
import type { App } from '../app.ts'

/**
 * Run all @OnBoot hooks from a kernel instance
 *
 * @param kernel - Kernel instance with @OnBoot decorated methods
 * @param app - App instance to pass to hooks
 *
 * @example
 * ```typescript
 * const kernel = new AppKernel()
 * const app = new App()
 * await runBootHooks(kernel, app)
 * ```
 */
export async function runBootHooks<T extends object>(
    kernel: T,
    app: App,
): Promise<void> {
    const constructor = kernel.constructor as any
    const hooks: BootHookMeta[] = constructor[KERNEL_BOOT_HOOKS] ?? []

    // Sort by priority (highest first)
    const sortedHooks = [...hooks].sort((a, b) => b.priority - a.priority)

    for (const hook of sortedHooks) {
        const method = (kernel as any)[hook.method]
        if (typeof method === 'function') {
            await method.call(kernel, app)
        }
    }
}

/**
 * Get all registered boot hooks from a kernel class or instance
 */
export function getBootHooks<T extends object>(
    kernelOrClass: T | (new () => T),
): BootHookMeta[] {
    const constructor = typeof kernelOrClass === 'function'
        ? kernelOrClass
        : kernelOrClass.constructor

    return (constructor as any)[KERNEL_BOOT_HOOKS] ?? []
}
````

### 3. Integration with Traditional Bootstrap

```typescript
// app/kernel.tsx - Works WITHOUT @Kernel decorator
import { OnBoot, runBootHooks } from '@lockness/core'

class BootTasks {
    @OnBoot({ priority: 100 })
    async connectDatabase(app: App) {
        const db = container.get<Database>(Database)
        await db.connect(Deno.env.get('DATABASE_URL'))
    }

    @OnBoot({ priority: 50 })
    async seedData(app: App) {
        if (app.isDevelopment) {
            await runSeeders()
        }
    }
}

export const bootstrap = async (): Promise<App> => {
    const app = new App()

    // Run boot hooks
    await runBootHooks(new BootTasks(), app)

    // Continue with normal setup...
    app.useMiddleware() /* ... */

    await app.init({/* ... */})

    return app
}
```

### 4. Exports

**File**: `packages/core/mod.ts`

```typescript
// Boot decorators
export {
    type BootHookMeta,
    OnBoot,
    type OnBootOptions,
} from './kernel/decorators.ts'

export { getBootHooks, runBootHooks } from './kernel/boot_runner.ts'
```

## Files to Create/Modify

| File                                  | Action | Description               |
| ------------------------------------- | ------ | ------------------------- |
| `packages/core/kernel/decorators.ts`  | Modify | Add `@OnBoot` decorator   |
| `packages/core/kernel/boot_runner.ts` | Create | Boot hook execution logic |
| `packages/core/mod.ts`                | Modify | Export boot features      |
| `packages/core/tests/on_boot.test.ts` | Create | Unit tests                |
| `packages/core/docs/kernel.md`        | Modify | Add @OnBoot documentation |

## Usage Patterns

### Pattern 1: With @Kernel (Full Declarative)

```typescript
@Kernel({ database: true })
export class AppKernel {
    @OnBoot({ priority: 100 })
    async init(app: App) {/* ... */}
}

// main.ts
const app = await createApp(AppKernel)
```

### Pattern 2: Standalone (Traditional Bootstrap)

```typescript
class BootTasks {
    @OnBoot({ priority: 100 })
    async connectDb(app: App) {/* ... */}
}

export const bootstrap = async () => {
    const app = new App()
    await runBootHooks(new BootTasks(), app)
    return app
}
```

### Pattern 3: Mixed (Gradual Migration)

```typescript
// Existing bootstrap with added @OnBoot hooks
export const bootstrap = async () => {
    const app = new App()

    // New: organized boot tasks
    await runBootHooks(new DatabaseBootTasks(), app)
    await runBootHooks(new CacheBootTasks(), app)

    // Existing: unchanged code
    app.useMiddleware() /* ... */
    await app.init({/* ... */})

    return app
}
```

## Acceptance Criteria

- [ ] `@OnBoot()` decorator marks methods for boot execution
- [ ] `priority` option controls execution order (higher = first)
- [ ] Default priority is 0
- [ ] `runBootHooks(kernel, app)` executes all hooks
- [ ] Works standalone (without `@Kernel`)
- [ ] Works with `@Kernel` decorator
- [ ] Boot hooks receive `App` instance as parameter
- [ ] Async hooks are properly awaited
- [ ] Unit tests pass
- [ ] Documentation updated

## Priority

Medium - Can be implemented independently of `@Kernel`

## Estimated Effort

3-4 hours

## Dependencies

- None (can be implemented first)
- Will be used by `@Kernel` decorator

## Implementation Order

Recommended implementation order:

1. **@OnBoot** (this task) - No dependencies
2. **@NamedMiddleware** - No dependencies
3. **@Kernel** - Depends on both above
