# @Kernel Decorator - Declarative Application Configuration

The `@Kernel` decorator provides a declarative approach to application
configuration, offering an alternative to the traditional imperative
`bootstrap()` function pattern.

## Overview

Instead of manually configuring your application in a `bootstrap()` function,
you can use decorators to declare your application's configuration in a
structured, readable way.

## Basic Usage

```typescript
import { createApp, DeclareGlobalMiddleware, Kernel } from '@lockness/core'

@Kernel({
    database: { url: Deno.env.get('DATABASE_URL') },
    session: { driver: 'cookie', lifetime: 7200 },
    devtools: true,
    staticDir: 'public',
    controllersDir: './app/controller',
    middlewaresDir: './app/middleware',
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        sessionMiddleware(),
        LoggerMiddleware,
    ]
}

// main.ts
const app = await createApp(AppKernel)
app.listen(8888)
```

## Configuration Options

### Database Configuration

Configure database connection with automatic setup:

```typescript
@Kernel({
    // Enable with custom URL
    database: { url: Deno.env.get('DATABASE_URL') },
    
    // Or enable with defaults (reads from DATABASE_URL env var)
    database: true,
    
    // Or disable database
    database: undefined,
})
```

### Session Configuration

Configure session management:

```typescript
@Kernel({
    session: {
        driver: 'cookie',  // 'cookie' | 'deno-kv' | 'memory'
        secret: Deno.env.get('APP_KEY'),
        lifetime: 7200,    // 2 hours
        secure: true,      // HTTPS only
    },
})
```

### Cache Configuration

Configure cache management (optional package):

```typescript
@Kernel({
    cache: {
        driver: 'memory',  // 'memory' | 'deno-kv' | 'redis'
        ttl: 3600,         // 1 hour
        prefix: 'lockness',
        kvPath: './data/kv', // Only for deno-kv driver
    },
})
```

### DevTools

Enable development tools in development mode:

```typescript
@Kernel({
    devtools: true,  // Automatically enabled only in APP_ENV=development
})
```

Outside development the key is ignored and `@lockness/devtools` is never
imported.

### Telemetry and logger

Both are opt-in keys, like `devtools`. Core no longer switches either on because
the package happens to be in your import map:

```typescript
@Kernel({
    telemetry: true, // @lockness/telemetry's request spans (no-op unless OTEL_DENO is set)
    logger: true,    // scheduled-task failures go to @lockness/logger's logger()
})
```

An application that installs its own scheduler reporter keeps it; `logger:
true`
only replaces the scheduler's `console.error` fallback.

### Controllers

Specify controllers directory or explicit list:

```typescript
@Kernel({
    // Auto-discovery (development)
    controllersDir: './app/controller',
    
    // Or explicit list (production)
    controllers: [UserController, PostController],
})
```

### Middleware Discovery

Auto-discover middlewares decorated with `@DeclareMiddleware`:

```typescript
@Kernel({
    middlewaresDir: './app/middleware',
})
```

## Global Middlewares

Use `@DeclareGlobalMiddleware()` to declare the global middleware stack:

```typescript
@Kernel({
    session: { driver: 'cookie' },
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        sessionMiddleware(),
        initializeAuthMiddleware({
            default: 'web',
            guards: {
                web: (ctx) => new SessionGuard('web', ctx, userProvider),
            },
        }),
        LoggerMiddleware,
    ]
}
```

## Boot Hooks

Combine `@Kernel` with `@OnBoot` decorators for lifecycle hooks:

```typescript
@Kernel({
    database: { url: Deno.env.get('DATABASE_URL') },
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [LoggerMiddleware]

    @OnBoot({ priority: 100 })
    async connectDatabase(app: App) {
        console.log('✅ Database connected')
    }

    @OnBoot({ priority: 50 })
    async seedData(app: App) {
        if (app.isDevelopment) {
            await runSeeders()
            console.log('🌱 Database seeded')
        }
    }
}
```

Boot hooks execute in priority order (highest first) before the application
starts. See [Kernel Boot Lifecycle](./kernel.md) for details.

## Named Middleware Auto-Discovery

When you specify `middlewaresDir`, the framework automatically discovers
middleware classes decorated with `@DeclareMiddleware`:

```typescript
// app/middleware/auth_middleware.ts
import { DeclareMiddleware } from '@lockness/core'

@DeclareMiddleware('auth')
export class AuthMiddleware {
    async handle(c: Context, next: Next) {
        // Auth logic...
    }
}

// app/kernel.ts
@Kernel({
    middlewaresDir: './app/middleware', // Auto-discovers @DeclareMiddleware
})
export class AppKernel {
    // No need to manually register 'auth' middleware!
}

// app/controller/user_controller.ts
@Controller('/users')
export class UserController {
    @Get('/')
    @UseMiddleware('auth') // Uses auto-discovered middleware
    list(c: Context) {
        return c.json({ users: [] })
    }
}
```

## Event Listeners

Enable listener discovery and explicit listener registration:

```typescript
import { listeners } from '@/config/listeners.ts'

@Kernel({
    listenersDir: './app/listener', // Defaults to ./app/listener
    listeners, // Explicit listener classes (optional)
})
export class AppKernel {}
```

Listeners are auto-discovered from `listenersDir` and can also be explicitly
registered via `config.listeners`.

## Complete Example

```typescript
// app/kernel.ts
import { DeclareGlobalMiddleware, Kernel, OnBoot } from '@lockness/core'
import { sessionMiddleware } from '@lockness/session'
import { initializeAuthMiddleware, SessionGuard } from '@lockness/auth'
import { LoggerMiddleware } from '@middleware/logger_middleware.ts'
import { UserProvider } from '@auth/user_provider.ts'

@Kernel({
    database: { url: Deno.env.get('DATABASE_URL') },
    session: { driver: 'cookie', lifetime: 7200 },
    devtools: true,
    staticDir: 'public',
    controllersDir: './app/controller',
    middlewaresDir: './app/middleware',
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
        LoggerMiddleware,
    ]

    @OnBoot({ priority: 100 })
    async setupDatabase(app: App) {
        console.log('📊 Database ready')
    }
}

// main.ts
import { createApp } from '@lockness/core'
import { AppKernel } from './app/kernel.ts'

const app = await createApp(AppKernel)
app.listen(8888)
```

## Migration from Imperative Style

### Before (Imperative)

```typescript
// app/kernel.ts
export const bootstrap = async (): Promise<App> => {
    const db = container.get<Database>(Database)
    await db.connect(Deno.env.get('DATABASE_URL') || '...')
    
    configureSession({
        driver: 'cookie',
        secret: Deno.env.get('APP_KEY'),
        lifetime: 7200,
        // `secure` omitted: Secure unless APP_ENV=development.
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

// main.ts
const app = await bootstrap()
app.listen(8888)
```

### After (Declarative)

```typescript
// app/kernel.ts
@Kernel({
    database: { url: Deno.env.get('DATABASE_URL') },
    session: { driver: 'cookie', lifetime: 7200 },
    devtools: true,
    staticDir: 'public',
    controllersDir: './app/controller',
    middlewaresDir: './app/middleware',
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        sessionMiddleware(),
        initializeAuthMiddleware({ ... }),
        LoggerMiddleware,
    ]
}

// main.ts
const app = await createApp(AppKernel)
app.listen(8888)
```

## Backward Compatibility

The imperative `bootstrap()` function pattern continues to work. The `@Kernel`
decorator is an **optional alternative**, not a replacement. You can use either
approach based on your preference.

## Benefits

1. **Clearer Structure**: Configuration is declared at the class level
2. **Type Safety**: Configuration options are fully typed
3. **Less Boilerplate**: Automatic setup of database, sessions, devtools
4. **Composability**: Easily combine with `@OnBoot` hooks
5. **Auto-Discovery**: Named middlewares discovered automatically
6. **Readable**: Configuration intent is immediately clear

## Error Handling

**A key you set must name a package your app declares.** Each optional feature
is a kernel key backed by one package:

| Key                            | Package               |
| :----------------------------- | :-------------------- |
| `database`                     | `@lockness/drizzle`   |
| `session`                      | `@lockness/session`   |
| `cache`                        | `@lockness/cache`     |
| `i18n`                         | `@lockness/i18n`      |
| `devtools` (development only)  | `@lockness/devtools`  |
| `telemetry`                    | `@lockness/telemetry` |
| `logger`                       | `@lockness/logger`    |
| `schedulerLock.driver 'redis'` | `@lockness/redis`     |

A key you leave unset imports nothing and prints nothing, so you use only the
features you need. A key you set whose package does not resolve **refuses the
boot** with `MissingOptionalPackageError` (exported from `@lockness/core`, with
`packageName` and `feature` fields) rather than running without the feature:

```text
@lockness/cache is configured but not installed: the kernel sets `cache`, and "@lockness/cache" does not resolve from this application.
Fix: deno add jsr:@lockness/cache (same version as @lockness/core), or remove `cache` from @Kernel().
```

Until v0.5.0 this printed `⚠️ @lockness/cache not found - skipping cache setup`
and the app ran without a cache — or, for the redis scheduler lock, without a
lock, so every replica ran each `onOneServer` task.

## API Reference

### `@Kernel(config: KernelConfig)`

Class decorator to configure the application kernel.

**Parameters:**

- `config.database`: Database configuration (boolean or `DatabaseConfig`)
- `config.session`: Session configuration (boolean or `SessionConfig`)
- `config.cache`: Cache configuration (boolean or `CacheConfig`)
- `config.devtools`: Enable devtools (boolean)
- `config.telemetry`: Install `@lockness/telemetry`'s middleware (boolean)
- `config.logger`: Route scheduler failures to `@lockness/logger` (boolean)
- `config.staticDir`: Static files directory (string)
- `config.controllersDir`: Controllers directory for auto-discovery (string)
- `config.controllers`: Explicit controllers list (array)
- `config.middlewaresDir`: Middlewares directory for auto-discovery (string)
- `config.listenersDir`: Listener discovery directory (string)
- `config.listeners`: Explicit listener classes (array)
- `config.mountPoint`: A single mount point for i18n, API versioning, or
  multi-tenancy (one `MountPoint`, not an array)

**Example:**

```typescript
@Kernel({
    database: { url: Deno.env.get('DATABASE_URL') },
    session: { driver: 'cookie', lifetime: 7200 },
    devtools: true,
    mountPoint: {
        // Constrain the params. An open `/:langId/:countryId` matches any two
        // leading segments, so unrelated paths reach i18nMiddleware.
        pattern: `/${constrainedParam('langId', validLanguages)}/${
            constrainedParam('countryId', validCountries)
        }`,
        middleware: i18nMiddleware,
    },
})
export class AppKernel {}
```

### `DatabaseConfig`

Database configuration options.

```typescript
interface DatabaseConfig {
    /** Database connection URL */
    url?: string
    /** Whether to automatically connect on startup (default: true) */
    autoConnect?: boolean
}
```

### `SessionConfig`

Session configuration options.

```typescript
interface SessionConfig {
    /** Session storage driver (default: 'cookie') */
    driver?: 'cookie' | 'deno-kv' | 'memory'
    /** Secret key for session encryption/signing */
    secret?: string
    /** Session lifetime in seconds (default: 7200) */
    lifetime?: number
    /** Whether to use secure cookies (default: true in production) */
    secure?: boolean
}
```

### `CacheConfig`

Cache configuration options.

```typescript
interface CacheConfig {
    /** Cache storage driver (default: 'memory') */
    driver?: 'memory' | 'deno-kv' | 'redis'
    /** Default time-to-live in seconds (default: 3600) */
    ttl?: number
    /** Path to Deno KV database file (for 'deno-kv' driver) */
    kvPath?: string
    /** Prefix for all cache keys (default: 'lockness') */
    prefix?: string
}
```

### `MountPoint`

Mount point configuration for URL pattern-based routing extensions.

```typescript
interface MountPoint {
    /**
     * URL pattern with Hono path parameters. Constrain them — build it with
     * `constrainedParam()` rather than writing a literal, e.g.
     * `/:langId{(?:en|fr)}/:countryId{(?:us|ca)}`. An unconstrained
     * `/:langId/:countryId` matches any two leading segments.
     */
    pattern: string
    /** Optional middleware executed for requests matching this pattern */
    middleware?: (c: Context, next: Next) => Promise<void | Response>
}
```

See [Mount Points](./mount-points.md) for detailed documentation.

### `@DeclareGlobalMiddleware()`

Property decorator to declare global middlewares.

**Example:**

```typescript
@Kernel()
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        sessionMiddleware(),
        LoggerMiddleware,
    ]
}
```

### `createApp(KernelClass)`

Bootstrap function that creates an App from a decorated kernel class.

**Parameters:**

- `KernelClass`: Kernel class decorated with `@Kernel`

**Returns:** `Promise<App>`

**Example:**

```typescript
const app = await createApp(AppKernel)
app.listen(8888)
```

## Best Practices

### 1. Organize Configuration Logically

Group related configuration together:

```typescript
@Kernel({
    // Infrastructure
    database: { url: Deno.env.get('DATABASE_URL') },
    session: { driver: 'cookie' },

    // Development
    devtools: true,

    // Routing
    controllersDir: './app/controller',
    middlewaresDir: './app/middleware',
    staticDir: 'public',
})
export class AppKernel {}
```

### 2. Use Environment Variables

```typescript
@Kernel({
    database: { url: Deno.env.get('DATABASE_URL') },
    session: {
        secret: Deno.env.get('APP_KEY'),
        // `secure` omitted: Secure unless APP_ENV=development.
    },
})
export class AppKernel {}
```

### 3. Combine with Boot Hooks for Complex Setup

```typescript
@Kernel({ database: true })
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [LoggerMiddleware]

    @OnBoot({ priority: 100 })
    async customDatabaseSetup(app: App) {
        // Custom initialization logic
    }
}
```

### 4. Keep Middleware List Simple

```typescript
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        // Essential middlewares only
        sessionMiddleware(),
        authMiddleware(),
        LoggerMiddleware,
    ]

    // Use @UseMiddleware for route-specific middleware
}
```

## See Also

- [Kernel Boot Lifecycle](./kernel.md) - `@OnBoot` decorator documentation
- [Middleware](./middleware.md) - Middleware system documentation
- [Mount Points](./mount-points.md) - Multi-mount routing for i18n/versioning
- [Controllers](./controllers.md) - Controller system documentation
