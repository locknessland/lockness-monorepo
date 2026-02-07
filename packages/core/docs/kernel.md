# Kernel Boot Lifecycle

The Lockness kernel provides a clean, declarative way to organize application
initialization logic using the `@OnBoot` decorator. This enables separation of
concerns and priority-based execution order for boot tasks.

## Overview

The `@OnBoot` decorator marks methods that should be executed during the kernel
bootstrap phase. Methods are executed in priority order (highest first),
allowing you to control the initialization sequence.

## Basic Usage

### Simple Boot Hook

```typescript
import { createApp, Kernel, OnBoot } from '@lockness/core'

@Kernel({
    controllersDir: './app/controller',
})
class AppKernel {
    @OnBoot()
    async logStartup(app: App) {
        console.log('🚀 Application started')
    }
}

// Bootstrap the application
const app = await createApp(AppKernel)
app.listen(8888)
```

### Boot Hook with Priority

```typescript
@Kernel({
    database: { url: Deno.env.get('DATABASE_URL') },
    controllersDir: './app/controller',
})
class AppKernel {
    @OnBoot({ priority: 100 })
    async connectDatabase(app: App) {
        // Database connection is handled by @Kernel,
        // but you can add custom logic here
        console.log('✅ Database ready')
    }

    @OnBoot({ priority: 50 })
    async seedDatabase(app: App) {
        if (app.isDevelopment) {
            await runSeeders()
        }
    }

    @OnBoot({ priority: 10 })
    async logStartup(app: App) {
        console.log('✅ All systems ready')
    }
}
```

## Priority System

Boot hooks are executed in **priority order** (highest first). The default
priority is `0`.

### Recommended Priority Ranges

| Priority Range | Use Case                | Examples                         |
| -------------- | ----------------------- | -------------------------------- |
| **100+**       | Critical infrastructure | Database, cache connections      |
| **50-99**      | Data initialization     | Seeders, migrations, schema sync |
| **20-49**      | Service registration    | Scheduled tasks, event listeners |
| **0-19**       | Final setup             | Logging, metrics, health checks  |

### Example with Multiple Priorities

```typescript
class AppKernel {
    @OnBoot({ priority: 100 })
    async connectDatabase(app: App) {
        await db.connect()
    }

    @OnBoot({ priority: 90 })
    async connectCache(app: App) {
        await cache.connect()
    }

    @OnBoot({ priority: 50 })
    async runMigrations(app: App) {
        await db.migrate.latest()
    }

    @OnBoot({ priority: 40 })
    async seedData(app: App) {
        if (app.isDevelopment) {
            await db.seed.run()
        }
    }

    @OnBoot({ priority: 20 })
    async registerScheduledTasks(app: App) {
        scheduler.register('cleanup', '0 0 * * *', cleanupJob)
    }

    @OnBoot({ priority: 10 })
    async warmCaches(app: App) {
        await cache.warm(['config', 'routes'])
    }

    @OnBoot()
    async logStartup(app: App) {
        console.log('🚀 Application ready')
    }
}
```

## Integration Patterns

### Pattern 1: Declarative Kernel (Recommended)

Use `@OnBoot` with the declarative `@Kernel` decorator:

```typescript
// app/kernel.tsx
import {
    createApp,
    DeclareGlobalMiddleware,
    Kernel,
    OnBoot,
} from '@lockness/core'
import { sessionMiddleware } from '@lockness/session'

@Kernel({
    database: { url: Deno.env.get('DATABASE_URL') },
    session: { driver: 'cookie', secret: Deno.env.get('APP_KEY')! },
    controllersDir: './app/controller',
    middlewaresDir: './app/middleware',
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        sessionMiddleware(),
    ]

    @OnBoot({ priority: 100 })
    async onDatabaseReady(app: App) {
        console.log('✅ Database connected')
    }

    @OnBoot({ priority: 50 })
    async seedData(app: App) {
        if (app.isDevelopment) {
            await runSeeders()
        }
    }
}

// main.ts
const app = await createApp(AppKernel)
app.listen(8888)
```

### Pattern 2: Kernel Inheritance

Extend a base kernel with boot tasks:

```typescript
// app/kernel/base_kernel.ts
import { Kernel, OnBoot } from '@lockness/core'

@Kernel({
    database: { url: Deno.env.get('DATABASE_URL') },
})
export class BaseKernel {
    @OnBoot({ priority: 100 })
    async logDatabaseReady(app: App) {
        console.log('✅ Database connected')
    }
}

// app/kernel.tsx
import { DeclareGlobalMiddleware, Kernel, OnBoot } from '@lockness/core'
import { BaseKernel } from './kernel/base_kernel.ts'

@Kernel({
    controllersDir: './app/controller',
    middlewaresDir: './app/middleware',
})
export class AppKernel extends BaseKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = []

    @OnBoot({ priority: 30 })
    async warmCaches(app: App) {
        await cache.warm(['config'])
    }
}
```

### Pattern 3: Conditional Boot Tasks

Execute tasks based on environment or app state:

```typescript
@Kernel({
    database: { url: Deno.env.get('DATABASE_URL') },
    devtools: true,
    controllersDir: './app/controller',
})
class AppKernel {
    @OnBoot({ priority: 100 })
    async onDatabaseReady(app: App) {
        console.log('✅ Database connected')
    }

    @OnBoot({ priority: 50 })
    async conditionalSetup(app: App) {
        if (app.isDevelopment) {
            await this.devSetup(app)
        } else {
            await this.prodSetup(app)
        }
    }

    private async devSetup(app: App) {
        console.log('🔧 Development mode setup')
        await runSeeders()
    }

    private async prodSetup(app: App) {
        console.log('🚀 Production mode setup')
        await warmCaches()
        await initMonitoring()
    }
}
```

### Pattern 4: Event Listeners

Register event listeners from packages via `config/listeners.ts`:

```typescript
// config/listeners.ts
import type { ListenerClass } from '@lockness/core'
import { DevtoolsListener } from '@lockness/devtools'

export const listeners: ListenerClass[] = [
    DevtoolsListener,
]
```

Reference in your kernel:

```typescript
// app/kernel.ts
import { config } from '../config/mod.ts'

@Kernel({
    controllersDir: './app/controller',

    // Auto-discover listeners from directory (default: ./app/listener)
    listenersDir: './app/listener',

    // Register explicit listener classes from config
    listeners: config.listeners,
})
class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = []
}
```

Listener classes are auto-discovered from `listenersDir` and can also be
explicitly registered via `config.listeners`. This allows packages to export
listeners that users can opt-in to use.

See [Lifecycle Events Guide](/docs/lifecycle-events) for more details on
creating events and listeners.

## API Reference

### `@OnBoot(options?)`

Decorator that marks a method for execution during kernel bootstrap.

**Options:**

- `priority?: number` - Execution priority (higher = earlier). Default: `0`

**Example:**

```typescript
@OnBoot({ priority: 100 })
async connectDatabase(app: App) {
    // Runs first
}

@OnBoot()
async logStartup(app: App) {
    // Runs last (priority: 0)
}
```

### `runBootHooks(kernel, app)`

Execute all `@OnBoot` decorated methods from a kernel instance.

> **Note:** When using `createApp()`, boot hooks are executed automatically.
> This function is only needed for manual/advanced usage.

**Parameters:**

- `kernel` - Kernel instance with `@OnBoot` decorated methods
- `app` - App instance to pass to boot hooks

**Returns:** `Promise<void>`

**Example:**

```typescript
// Manual usage (advanced)
const kernel = new AppKernel()
const app = new App()
await runBootHooks(kernel, app)

// Recommended: use createApp() which runs hooks automatically
const app = await createApp(AppKernel)
```

### `getBootHooks(kernelOrClass)`

Get all registered boot hooks from a kernel class or instance.

**Parameters:**

- `kernelOrClass` - Kernel class constructor or instance

**Returns:** `BootHookMeta[]`

**Example:**

```typescript
const hooks = getBootHooks(AppKernel)
console.log(`Found ${hooks.length} boot hooks`)

hooks.forEach((hook) => {
    console.log(`  ${hook.method} (priority: ${hook.priority})`)
})
```

## Type Definitions

### `BootHookMeta`

Metadata about a registered boot hook.

```typescript
interface BootHookMeta {
    /** Method name */
    readonly method: string
    /** Execution priority (higher = earlier) */
    readonly priority: number
}
```

### `OnBootOptions`

Configuration options for the `@OnBoot` decorator.

```typescript
interface OnBootOptions {
    /**
     * Execution priority. Higher values execute first.
     * @default 0
     */
    priority?: number
}
```

## Best Practices

### 1. Use Clear Method Names

```typescript
class AppKernel {
    @OnBoot({ priority: 100 })
    async connectDatabase(app: App) {/* ... */}

    @OnBoot({ priority: 50 })
    async seedInitialData(app: App) {/* ... */}

    @OnBoot({ priority: 10 })
    async logApplicationReady(app: App) {/* ... */}
}
```

### 2. Group Related Tasks by Priority

```typescript
// High priority: Infrastructure
@OnBoot({ priority: 100 })
async connectDatabase(app: App) { /* ... */ }

@OnBoot({ priority: 90 })
async connectCache(app: App) { /* ... */ }

// Medium priority: Data initialization
@OnBoot({ priority: 50 })
async runMigrations(app: App) { /* ... */ }

@OnBoot({ priority: 40 })
async seedData(app: App) { /* ... */ }
```

### 3. Handle Errors Gracefully

```typescript
@OnBoot({ priority: 100 })
async connectDatabase(app: App) {
    try {
        await db.connect()
    } catch (error) {
        console.error('Failed to connect to database:', error)
        throw error // Re-throw to stop boot process
    }
}
```

### 4. Use Environment Variables

```typescript
@OnBoot({ priority: 50 })
async conditionalSetup(app: App) {
    const env = Deno.env.get('APP_ENV')

    if (env === 'development') {
        await this.devSetup(app)
    }
}
```

### 5. Document Hook Purpose with JSDoc

```typescript
/**
 * Connect to the PostgreSQL database.
 * Priority: 100 (runs first)
 */
@OnBoot({ priority: 100 })
async connectDatabase(app: App) {
    await db.connect()
}

/**
 * Seed database with initial data.
 * Priority: 50 (runs after database connection)
 * Only runs in development mode.
 */
@OnBoot({ priority: 50 })
async seedDatabase(app: App) {
    if (app.isDevelopment) {
        await runSeeders()
    }
}
```

## Debugging

### List All Boot Hooks

```typescript
import { getBootHooks } from '@lockness/core'

const hooks = getBootHooks(AppKernel)
console.log('Registered boot hooks:')
hooks.forEach((hook) => {
    console.log(`  - ${hook.method} (priority: ${hook.priority})`)
})
```

### Execution Order Visualization

```typescript
class AppKernel {
    @OnBoot({ priority: 100 })
    async first(app: App) {
        console.log('[1/3] First task')
    }

    @OnBoot({ priority: 50 })
    async second(app: App) {
        console.log('[2/3] Second task')
    }

    @OnBoot()
    async third(app: App) {
        console.log('[3/3] Third task')
    }
}

await runBootHooks(new AppKernel(), app)
// Output:
// [1/3] First task
// [2/3] Second task
// [3/3] Third task
```

## Future Enhancements

The `@OnBoot` decorator is designed to work with the future `@Kernel` decorator,
which will provide a fully declarative kernel configuration system. This will
enable patterns like:

```typescript
@Kernel({ database: true, session: true })
export class AppKernel {
    @OnBoot({ priority: 100 })
    async initialize(app: App) {/* ... */}
}
```

See the roadmap for more details on the `@Kernel` decorator implementation.
