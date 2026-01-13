# Technical Task: Refactor Kernel for Professional Simplicity

## 📋 Task Overview

Refactor the `app/kernel.tsx` file to provide a clean, minimal, and professional
interface for framework users, similar to modern frameworks like AdonisJS. The
current kernel exposes too much internal logic and configuration details to end
users, making it verbose and difficult to understand.

## 🎯 Objectives

1. **Simplify user-facing API**: Reduce the kernel to a clean, declarative
   configuration
2. **Hide framework internals**: Move complex logic into the framework's core
   packages
3. **Improve developer experience**: Make the kernel more intuitive and
   self-documenting
4. **Maintain flexibility**: Keep advanced customization possible through clean
   extension points
5. **Update stub template**: Ensure generated projects also use the simplified
   kernel

## 📁 Affected File Paths

### Core Files to Modify

- `/app/kernel.tsx` - Main application kernel (monorepo)
- `/packages/init/stubs/init/app/kernel.tsx.stub` - Generated project kernel
  template

### Framework Files to Extend

- `/packages/core/app.ts` - Core App class (add helper methods)
- `/packages/core/mod.ts` - Core exports (expose new APIs)
- `/packages/core/types.ts` - Type definitions for kernel config
- `/packages/auth/mod.ts` - Auth module exports (simplify initialization)

### New Files to Create

- `/packages/core/kernel_builder.ts` - Builder pattern for kernel configuration
- `/packages/core/config_loader.ts` - Configuration loading utilities
- `/packages/core/middleware_registry.ts` - Centralized middleware management

### Test Files

- `/packages/core/tests/kernel_builder.test.ts` - Unit tests for kernel builder
- `/packages/core/tests/config_loader.test.ts` - Unit tests for config loader
- `/packages/core/tests/middleware_registry.test.ts` - Unit tests for middleware
  registry

### Documentation Files

- `/README.md` - Update kernel examples
- `/GEMINI.md` - Update architecture documentation
- `/packages/core/README.md` - Document new kernel API

## 🏗️ Architecture Principles

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Current Problem**: Kernel handles configuration, middleware setup, database
  initialization, error handling, and devtools setup
- **Solution**: Split into specialized components:
  - `KernelBuilder`: Fluent API for kernel configuration
  - `ConfigLoader`: Load and validate configuration
  - `MiddlewareRegistry`: Manage middleware registration
  - `ErrorHandlerFactory`: Create error handlers from configuration

**2. Open/Closed Principle (OCP)**

- **Current Problem**: Adding new features requires modifying kernel structure
- **Solution**: Use builder pattern with extension points:
  ```typescript
  app.configure((config) => {
      config.session({ driver: 'cookie' })
      config.auth({ guard: 'web' })
      config.errorPages({ 404: NotFoundPage })
  })
  ```

**3. Liskov Substitution Principle (LSP)**

- **Current Problem**: Different initialization paths for dev/prod mode
- **Solution**: Unified initialization with environment-aware builders

**4. Interface Segregation Principle (ISP)**

- **Current Problem**: Large configuration object with all options mixed
- **Solution**: Segregated configuration interfaces:
  - `SessionConfig`
  - `AuthConfig`
  - `MiddlewareConfig`
  - `ErrorHandlerConfig`

**5. Dependency Inversion Principle (DIP)**

- **Current Problem**: Kernel depends on concrete implementations (SessionGuard,
  UserProvider)
- **Solution**: Kernel depends on abstractions, concrete implementations
  injected

### DRY Principle (Don't Repeat Yourself)

**Current Duplication:**

- Development and production blocks repeat identical middleware configuration
- Error handler logic duplicated between kernel and individual error pages
- Session and auth configuration repeated in multiple places

**Solution:**

- Single source of truth for configuration
- Shared middleware definitions used in both modes
- Centralized error handling strategy

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  User Application (app/kernel.tsx)      │  ← Thin declarative config
├─────────────────────────────────────────┤
│  Kernel Builder (@lockness/core)        │  ← Fluent configuration API
├─────────────────────────────────────────┤
│  Framework Core (@lockness/core)        │  ← Initialization logic
├─────────────────────────────────────────┤
│  Feature Packages (@lockness/auth, etc) │  ← Feature implementations
└─────────────────────────────────────────┘
```

**Key Constraints:**

- User kernel file should be < 30 lines for simple apps
- No direct database connections in kernel
- No inline class definitions in configuration
- All complex logic hidden behind clean APIs

## 🎨 Proposed Simplified Kernel API

### Target User-Facing Kernel (Simple Version)

```typescript
// app/kernel.tsx - AFTER REFACTORING
import { App } from '@lockness/core'
import { controllers } from './routes.ts'

export const bootstrap = async () => {
    const app = new App()

    await app
        .useSession({ driver: 'cookie' })
        .useAuth({ provider: 'UserProvider' })
        .useErrorPages('./view/pages/errors')
        .useMiddleware('logger', 'auth')
        .init({ controllers })

    return app
}
```

### Target User-Facing Kernel (Advanced Version with Customization)

```typescript
// app/kernel.tsx - AFTER REFACTORING (with customization)
import { App } from '@lockness/core'
import { controllers } from './routes.ts'
import { UserProvider } from './auth/user_provider.ts'
import { LoggerMiddleware } from '@middleware/logger_middleware.ts'

export const bootstrap = async () => {
    const app = new App()

    // Configure features
    app.configure((config) => {
        config.session({
            driver: 'cookie',
            lifetime: 7200,
            secure: app.isProduction,
        })

        config.auth({
            default: 'web',
            guards: {
                web: UserProvider,
            },
        })

        config.errorPages({
            handler: (error, c) => app.handleError(error, c),
            pages: './view/pages/errors',
        })

        config.middleware({
            global: [LoggerMiddleware],
            named: { auth: 'AuthMiddleware' },
        })
    })

    // Initialize with controllers
    await app.init({ controllers, staticDir: 'public' })

    // Enable devtools in development
    if (app.isDevelopment) {
        app.useDevtools()
    }

    return app
}
```

## 📝 Detailed Implementation Steps

### Phase 1: Create KernelBuilder Pattern

**Step 1.1: Create KernelBuilder Class**

File: `/packages/core/kernel_builder.ts`

```typescript
/**
 * Fluent API for configuring Lockness application kernel
 * Implements Builder pattern to simplify application bootstrap
 */
export class KernelBuilder {
    private app: App
    private sessionConfig?: SessionConfig
    private authConfig?: AuthConfig
    private errorConfig?: ErrorHandlerConfig
    private middlewareConfig: MiddlewareConfig = { global: [], named: {} }

    constructor(app: App) {
        this.app = app
    }

    /**
     * Configure session management
     * @example
     * app.useSession({ driver: 'cookie', lifetime: 7200 })
     */
    useSession(config: SessionConfig): this {
        this.sessionConfig = config
        return this
    }

    /**
     * Configure authentication
     * @example
     * app.useAuth({ provider: 'UserProvider' })
     */
    useAuth(config: AuthConfig): this {
        this.authConfig = config
        return this
    }

    /**
     * Configure error handling with custom pages
     * @example
     * app.useErrorPages('./view/pages/errors')
     */
    useErrorPages(config: ErrorHandlerConfig | string): this {
        this.errorConfig = typeof config === 'string'
            ? { directory: config }
            : config
        return this
    }

    /**
     * Register global or named middleware
     * @example
     * app.useMiddleware('logger', 'auth')
     */
    useMiddleware(...middleware: string[]): this {
        // Implementation
        return this
    }

    /**
     * Advanced configuration callback
     * @example
     * app.configure((config) => {
     *   config.session({ driver: 'cookie' })
     *   config.auth({ provider: 'UserProvider' })
     * })
     */
    configure(callback: (config: ConfigBuilder) => void): this {
        const builder = new ConfigBuilder()
        callback(builder)
        Object.assign(this, builder.build())
        return this
    }

    /**
     * Initialize the application with controllers
     */
    async init(options: InitOptions): Promise<App> {
        // Apply configurations in correct order
        this.applySessionConfig()
        this.applyAuthConfig()
        this.applyMiddlewareConfig()
        this.applyErrorConfig()

        // Initialize App
        await this.app.init({
            ...options,
            globalMiddlewares: this.buildGlobalMiddlewares(),
            middlewares: this.buildNamedMiddlewares(),
            errorHandler: this.buildErrorHandler(),
        })

        return this.app
    }

    // Private helper methods
    private applySessionConfig(): void {/* ... */}
    private applyAuthConfig(): void {/* ... */}
    private applyMiddlewareConfig(): void {/* ... */}
    private applyErrorConfig(): void {/* ... */}
    private buildGlobalMiddlewares(): Middleware[] {/* ... */}
    private buildNamedMiddlewares(): Record<string, Middleware> {/* ... */}
    private buildErrorHandler(): ErrorHandler {/* ... */}
}
```

**Step 1.2: Unit Tests for KernelBuilder**

File: `/packages/core/tests/kernel_builder.test.ts`

```typescript
import { assertEquals, assertExists } from '@std/assert'
import { KernelBuilder } from '../kernel_builder.ts'
import { App } from '../app.ts'

Deno.test('KernelBuilder - fluent API returns self', () => {
    const app = new App()
    const builder = new KernelBuilder(app)

    const result = builder
        .useSession({ driver: 'cookie' })
        .useAuth({ provider: 'TestProvider' })

    assertEquals(
        result,
        builder,
        'Fluent methods should return builder instance',
    )
})

Deno.test('KernelBuilder - session configuration is stored', () => {
    const app = new App()
    const builder = new KernelBuilder(app)

    builder.useSession({ driver: 'cookie', lifetime: 3600 })

    // Access private property for testing
    const config = (builder as any).sessionConfig

    assertEquals(config.driver, 'cookie')
    assertEquals(config.lifetime, 3600)
})

Deno.test('KernelBuilder - auth configuration is stored', () => {
    const app = new App()
    const builder = new KernelBuilder(app)

    builder.useAuth({ provider: 'UserProvider', default: 'web' })

    const config = (builder as any).authConfig

    assertEquals(config.provider, 'UserProvider')
    assertEquals(config.default, 'web')
})

Deno.test('KernelBuilder - error pages from string path', () => {
    const app = new App()
    const builder = new KernelBuilder(app)

    builder.useErrorPages('./view/pages/errors')

    const config = (builder as any).errorConfig

    assertEquals(config.directory, './view/pages/errors')
})

Deno.test('KernelBuilder - middleware registration', () => {
    const app = new App()
    const builder = new KernelBuilder(app)

    builder.useMiddleware('logger', 'auth')

    const config = (builder as any).middlewareConfig

    assertExists(config)
})

Deno.test('KernelBuilder - configure callback', () => {
    const app = new App()
    const builder = new KernelBuilder(app)

    builder.configure((config) => {
        config.session({ driver: 'deno-kv' })
        config.auth({ provider: 'CustomProvider' })
    })

    const sessionConfig = (builder as any).sessionConfig
    const authConfig = (builder as any).authConfig

    assertEquals(sessionConfig.driver, 'deno-kv')
    assertEquals(authConfig.provider, 'CustomProvider')
})

// Mock-based tests (no database)
Deno.test('KernelBuilder - init calls app.init with merged config', async () => {
    const app = new App()
    const builder = new KernelBuilder(app)

    // Mock app.init
    let initCalled = false
    let initConfig: any = null

    app.init = async (config: any) => {
        initCalled = true
        initConfig = config
        return Promise.resolve()
    }

    builder
        .useSession({ driver: 'cookie' })
        .useAuth({ provider: 'TestProvider' })

    await builder.init({ controllers: [] })

    assertEquals(initCalled, true, 'app.init should be called')
    assertExists(
        initConfig.globalMiddlewares,
        'Global middlewares should be set',
    )
})
```

**Testing Principles:**

- ✅ All tests use mocks, no database
- ✅ Tests are fast (< 10ms each)
- ✅ Tests are isolated and deterministic
- ✅ Focus on builder pattern behavior, not framework internals

### Phase 2: Create Config Loader Utility

**Step 2.1: Create ConfigLoader Class**

File: `/packages/core/config_loader.ts`

```typescript
/**
 * Loads and validates application configuration
 * Supports environment-based config loading
 */
export class ConfigLoader {
    private env: Record<string, string>

    constructor(env: Record<string, string> = Deno.env.toObject()) {
        this.env = env
    }

    /**
     * Load session configuration with defaults
     */
    loadSessionConfig(overrides?: Partial<SessionConfig>): SessionConfig {
        return {
            driver: (this.env.SESSION_DRIVER as SessionDriver) || 'cookie',
            secret: this.env.APP_KEY || 'change-me-in-production',
            lifetime: parseInt(this.env.SESSION_LIFETIME || '7200'),
            secure: this.env.APP_ENV === 'production',
            ...overrides,
        }
    }

    /**
     * Load auth configuration
     */
    loadAuthConfig(overrides?: Partial<AuthConfig>): AuthConfig {
        return {
            default: this.env.AUTH_DEFAULT_GUARD || 'web',
            ...overrides,
        }
    }

    /**
     * Check if application is in development mode
     */
    isDevelopment(): boolean {
        return this.env.APP_ENV === 'development'
    }

    /**
     * Check if application is in production mode
     */
    isProduction(): boolean {
        return this.env.APP_ENV === 'production'
    }

    /**
     * Validate required environment variables
     */
    validate(required: string[]): void {
        const missing = required.filter((key) => !this.env[key])

        if (missing.length > 0) {
            throw new Error(
                `Missing required environment variables: ${missing.join(', ')}`,
            )
        }
    }
}
```

**Step 2.2: Unit Tests for ConfigLoader**

File: `/packages/core/tests/config_loader.test.ts`

```typescript
import { assertEquals, assertThrows } from '@std/assert'
import { ConfigLoader } from '../config_loader.ts'

Deno.test('ConfigLoader - load session config with defaults', () => {
    const loader = new ConfigLoader({
        APP_KEY: 'test-key',
        SESSION_LIFETIME: '3600',
    })

    const config = loader.loadSessionConfig()

    assertEquals(config.driver, 'cookie')
    assertEquals(config.secret, 'test-key')
    assertEquals(config.lifetime, 3600)
    assertEquals(config.secure, false)
})

Deno.test('ConfigLoader - override session config', () => {
    const loader = new ConfigLoader({})

    const config = loader.loadSessionConfig({
        driver: 'deno-kv',
        lifetime: 1800,
    })

    assertEquals(config.driver, 'deno-kv')
    assertEquals(config.lifetime, 1800)
})

Deno.test('ConfigLoader - detect production environment', () => {
    const loader = new ConfigLoader({ APP_ENV: 'production' })

    assertEquals(loader.isProduction(), true)
    assertEquals(loader.isDevelopment(), false)
})

Deno.test('ConfigLoader - detect development environment', () => {
    const loader = new ConfigLoader({ APP_ENV: 'development' })

    assertEquals(loader.isDevelopment(), true)
    assertEquals(loader.isProduction(), false)
})

Deno.test('ConfigLoader - validate required variables', () => {
    const loader = new ConfigLoader({ APP_KEY: 'test' })

    // Should not throw
    loader.validate(['APP_KEY'])

    // Should throw
    assertThrows(
        () => loader.validate(['DATABASE_URL']),
        Error,
        'Missing required environment variables: DATABASE_URL',
    )
})

Deno.test('ConfigLoader - load auth config', () => {
    const loader = new ConfigLoader({ AUTH_DEFAULT_GUARD: 'api' })

    const config = loader.loadAuthConfig()

    assertEquals(config.default, 'api')
})
```

### Phase 3: Create Middleware Registry

**Step 3.1: Create MiddlewareRegistry Class**

File: `/packages/core/middleware_registry.ts`

```typescript
/**
 * Centralized middleware management
 * Handles registration and resolution of global and named middlewares
 */
export class MiddlewareRegistry {
    private globalMiddlewares: Middleware[] = []
    private namedMiddlewares: Record<string, Middleware> = {}
    private builtInMiddlewares: Record<string, () => Middleware> = {}

    constructor() {
        this.registerBuiltIns()
    }

    /**
     * Register built-in framework middlewares
     */
    private registerBuiltIns(): void {
        this.builtInMiddlewares = {
            session: () => sessionMiddleware(),
            auth: () => authMiddleware(),
            cors: () => corsMiddleware(),
            logger: () => LoggerMiddleware,
        }
    }

    /**
     * Add a global middleware
     */
    addGlobal(middleware: Middleware | string): this {
        if (typeof middleware === 'string') {
            const resolved = this.resolve(middleware)
            if (resolved) this.globalMiddlewares.push(resolved)
        } else {
            this.globalMiddlewares.push(middleware)
        }
        return this
    }

    /**
     * Register a named middleware
     */
    addNamed(name: string, middleware: Middleware | string): this {
        if (typeof middleware === 'string') {
            const resolved = this.resolve(middleware)
            if (resolved) this.namedMiddlewares[name] = resolved
        } else {
            this.namedMiddlewares[name] = middleware
        }
        return this
    }

    /**
     * Resolve middleware by name (built-in or custom)
     */
    resolve(name: string): Middleware | undefined {
        const factory = this.builtInMiddlewares[name]
        return factory ? factory() : undefined
    }

    /**
     * Get all global middlewares
     */
    getGlobal(): Middleware[] {
        return this.globalMiddlewares
    }

    /**
     * Get all named middlewares
     */
    getNamed(): Record<string, Middleware> {
        return this.namedMiddlewares
    }
}
```

**Step 3.2: Unit Tests for MiddlewareRegistry**

File: `/packages/core/tests/middleware_registry.test.ts`

```typescript
import { assertEquals, assertExists } from '@std/assert'
import { MiddlewareRegistry } from '../middleware_registry.ts'

// Mock middleware for testing
const mockMiddleware = {
    async handle(c: any, next: any) {
        await next()
    },
}

Deno.test('MiddlewareRegistry - add global middleware', () => {
    const registry = new MiddlewareRegistry()

    registry.addGlobal(mockMiddleware)

    const global = registry.getGlobal()

    assertEquals(global.length, 1)
    assertEquals(global[0], mockMiddleware)
})

Deno.test('MiddlewareRegistry - add named middleware', () => {
    const registry = new MiddlewareRegistry()

    registry.addNamed('test', mockMiddleware)

    const named = registry.getNamed()

    assertExists(named.test)
    assertEquals(named.test, mockMiddleware)
})

Deno.test('MiddlewareRegistry - resolve built-in middleware by name', () => {
    const registry = new MiddlewareRegistry()

    const resolved = registry.resolve('session')

    assertExists(resolved, 'Should resolve built-in session middleware')
})

Deno.test('MiddlewareRegistry - chain global registrations', () => {
    const registry = new MiddlewareRegistry()

    const result = registry
        .addGlobal(mockMiddleware)
        .addGlobal(mockMiddleware)

    assertEquals(result, registry, 'Should return registry for chaining')
    assertEquals(registry.getGlobal().length, 2)
})

Deno.test('MiddlewareRegistry - register named by string reference', () => {
    const registry = new MiddlewareRegistry()

    registry.addNamed('session', 'session') // Built-in by name

    const named = registry.getNamed()

    assertExists(named.session)
})
```

### Phase 4: Integrate into App Class

**Step 4.1: Extend App Class**

File: `/packages/core/app.ts`

Add these methods to the existing `App` class:

```typescript
export class App {
    // ... existing code ...

    private kernelBuilder?: KernelBuilder
    private configLoader: ConfigLoader

    constructor() {
        // ... existing constructor code ...
        this.configLoader = new ConfigLoader()
        this.kernelBuilder = new KernelBuilder(this)
    }

    /**
     * Fluent session configuration
     */
    useSession(config?: Partial<SessionConfig>): this {
        const fullConfig = this.configLoader.loadSessionConfig(config)
        configureSession(fullConfig)
        return this
    }

    /**
     * Fluent auth configuration
     */
    useAuth(config: AuthConfig): this {
        this.kernelBuilder?.useAuth(config)
        return this
    }

    /**
     * Configure error pages from directory
     */
    useErrorPages(directory: string): this {
        this.kernelBuilder?.useErrorPages({ directory })
        return this
    }

    /**
     * Register middleware by name
     */
    useMiddleware(...names: string[]): this {
        names.forEach((name) => {
            this.kernelBuilder?.useMiddleware(name)
        })
        return this
    }

    /**
     * Advanced configuration callback
     */
    configure(callback: (config: ConfigBuilder) => void): this {
        this.kernelBuilder?.configure(callback)
        return this
    }

    /**
     * Enable devtools (development only)
     */
    useDevtools(): this {
        if (this.isDevelopment) {
            enableDevtools(this.hono)
        }
        return this
    }

    /**
     * Check if in development mode
     */
    get isDevelopment(): boolean {
        return this.configLoader.isDevelopment()
    }

    /**
     * Check if in production mode
     */
    get isProduction(): boolean {
        return this.configLoader.isProduction()
    }
}
```

**Step 4.2: Unit Tests for App Extensions**

File: `/packages/core/tests/app_extensions.test.ts`

```typescript
import { assertEquals } from '@std/assert'
import { App } from '../app.ts'

Deno.test('App - useSession returns app for chaining', () => {
    const app = new App()

    const result = app.useSession({ driver: 'cookie' })

    assertEquals(result, app, 'Should return app instance for chaining')
})

Deno.test('App - useAuth returns app for chaining', () => {
    const app = new App()

    const result = app.useAuth({ provider: 'TestProvider' })

    assertEquals(result, app)
})

Deno.test('App - useMiddleware accepts multiple names', () => {
    const app = new App()

    const result = app.useMiddleware('logger', 'auth', 'cors')

    assertEquals(result, app)
})

Deno.test('App - isDevelopment checks environment', () => {
    // Mock environment
    const originalEnv = Deno.env.get('APP_ENV')
    Deno.env.set('APP_ENV', 'development')

    const app = new App()

    assertEquals(app.isDevelopment, true)
    assertEquals(app.isProduction, false)

    // Restore
    if (originalEnv) Deno.env.set('APP_ENV', originalEnv)
})

Deno.test('App - configure callback integration', () => {
    const app = new App()

    let callbackExecuted = false

    app.configure((config) => {
        callbackExecuted = true
        config.session({ driver: 'cookie' })
    })

    assertEquals(
        callbackExecuted,
        true,
        'Configuration callback should execute',
    )
})
```

### Phase 5: Update User-Facing Kernel

**Step 5.1: Refactor Main Kernel**

File: `/app/kernel.tsx`

Replace the entire file with:

```typescript
import { App } from '@lockness/core'
import { controllers } from './routes.ts'
import { UserProvider } from './auth/user_provider.ts'
import { LoggerMiddleware } from '@middleware/logger_middleware.ts'
import * as ErrorPages from '@view/pages/errors/mod.ts'

/**
 * Bootstrap the Lockness application
 * Clean, declarative configuration inspired by modern frameworks
 */
export const bootstrap = async () => {
    const app = new App()

    // Configure application features
    app.configure((config) => {
        // Session management
        config.session({
            driver: 'cookie',
            lifetime: 7200, // 2 hours
        })

        // Authentication
        config.auth({
            default: 'web',
            guards: {
                web: UserProvider,
            },
        })

        // Error handling
        config.errorPages({
            handler: ErrorPages.errorHandler,
        })

        // Middleware
        config.middleware({
            global: [LoggerMiddleware],
            named: { auth: 'auth' }, // Built-in auth middleware
        })
    })

    // Initialize with controllers
    await app.init({
        controllers,
        staticDir: 'public',
    })

    // Enable devtools in development
    if (app.isDevelopment) {
        app.useDevtools()
    }

    return app
}
```

**Alternative minimal version (for simple apps):**

```typescript
import { App } from '@lockness/core'
import { controllers } from './routes.ts'

export const bootstrap = async () => {
    const app = new App()

    await app
        .useSession({ driver: 'cookie' })
        .useAuth({ provider: 'UserProvider' })
        .useErrorPages('./view/pages/errors')
        .useMiddleware('logger', 'auth')
        .init({ controllers })

    return app
}
```

**Step 5.2: Create Error Pages Module**

File: `/app/view/pages/errors/mod.ts`

```typescript
import { type Context } from '@lockness/core'
import { NotFoundPage } from './not_found.tsx'
import { UnauthorizedPage } from './unauthorized.tsx'
import { ForbiddenPage } from './forbidden.tsx'
import { ServerErrorPage } from './server_error.tsx'

/**
 * Centralized error handler
 * Maps error status codes to custom pages
 */
export const errorHandler = (error: Error, c: Context) => {
    console.error('Error:', error)

    const status = (error as any).status || 500

    switch (status) {
        case 404:
            return c.html(<NotFoundPage />, 404)
        case 401:
            return c.html(<UnauthorizedPage />, 401)
        case 403:
            return c.html(<ForbiddenPage />, 403)
        default: {
            const showDetails = Deno.env.get('APP_ENV') === 'development'
            return c.html(
                <ServerErrorPage error={error} showDetails={showDetails} />,
                500,
            )
        }
    }
}
```

### Phase 6: Update Stub Template

**Step 6.1: Update Init Stub Kernel**

File: `/packages/init/stubs/init/app/kernel.tsx.stub`

Replace with simplified version:

```typescript
import { App } from '@lockness/core'
import { controllers } from './routes.ts'

/**
 * Bootstrap the {{ projectName }} application
 *
 * This is your application's kernel - the central configuration file
 * that sets up middleware, authentication, sessions, and other core features.
 *
 * Start simple and add features as you need them!
 */
export const bootstrap = async () => {
    const app = new App()

    // Basic configuration
    await app
        .useSession({ driver: 'cookie' })
        .init({ controllers, staticDir: 'public' })

    return app
}

/**
 * Advanced Configuration Example:
 *
 * Uncomment and customize as needed:
 *
 * app.configure((config) => {
 *   // Session management
 *   config.session({
 *     driver: 'cookie',
 *     lifetime: 7200,
 *   })
 *
 *   // Authentication (requires UserProvider)
 *   config.auth({
 *     default: 'web',
 *     guards: {
 *       web: UserProvider,
 *     },
 *   })
 *
 *   // Error pages (requires error page components)
 *   config.errorPages({
 *     handler: errorHandler,
 *   })
 *
 *   // Middleware
 *   config.middleware({
 *     global: [LoggerMiddleware],
 *     named: { auth: 'auth' },
 *   })
 * })
 *
 * // Enable devtools in development
 * if (app.isDevelopment) {
 *   app.useDevtools()
 * }
 */
```

### Phase 7: Update Core Package Exports

**Step 7.1: Update Core Module Exports**

File: `/packages/core/mod.ts`

Add new exports:

```typescript
// ... existing exports ...

// Kernel configuration
export { KernelBuilder } from './kernel_builder.ts'
export { ConfigLoader } from './config_loader.ts'
export { MiddlewareRegistry } from './middleware_registry.ts'

// Type exports
export type {
    AuthConfig,
    ConfigBuilder,
    ErrorHandlerConfig,
    MiddlewareConfig,
    SessionConfig,
} from './types.ts'
```

**Step 7.2: Update Type Definitions**

File: `/packages/core/types.ts`

Add new type definitions:

```typescript
// ... existing types ...

/**
 * Session configuration options
 */
export interface SessionConfig {
    driver: 'cookie' | 'deno-kv' | 'memory'
    secret?: string
    lifetime?: number
    secure?: boolean
}

/**
 * Authentication configuration options
 */
export interface AuthConfig {
    default?: string
    guards?: Record<string, any>
    provider?: string
}

/**
 * Error handler configuration options
 */
export interface ErrorHandlerConfig {
    handler?: ErrorHandler
    directory?: string
    pages?: Record<number, Component>
}

/**
 * Middleware configuration options
 */
export interface MiddlewareConfig {
    global?: (Middleware | string)[]
    named?: Record<string, Middleware | string>
}

/**
 * Configuration builder interface
 */
export interface ConfigBuilder {
    session(config: Partial<SessionConfig>): void
    auth(config: AuthConfig): void
    errorPages(config: ErrorHandlerConfig): void
    middleware(config: MiddlewareConfig): void
}
```

### Phase 8: Documentation Updates

**Step 8.1: Update Main README**

File: `/README.md`

Update the kernel section:

````markdown
### Application Kernel

The kernel is your application's central configuration file. Lockness provides a
clean, declarative API inspired by modern frameworks:

**Simple Configuration:**

```typescript
import { App } from '@lockness/core'
import { controllers } from './routes.ts'

export const bootstrap = async () => {
    const app = new App()

    await app
        .useSession({ driver: 'cookie' })
        .useAuth({ provider: 'UserProvider' })
        .init({ controllers })

    return app
}
```
````

**Advanced Configuration:**

```typescript
app.configure((config) => {
    config.session({ driver: 'cookie', lifetime: 7200 })
    config.auth({ default: 'web', guards: { web: UserProvider } })
    config.errorPages({ handler: errorHandler })
    config.middleware({ global: [LoggerMiddleware], named: { auth: 'auth' } })
})
```

The kernel automatically handles:

- Environment-based configuration
- Development vs production mode detection
- Middleware registration and ordering
- Error handling setup
- Session and authentication initialization

````
**Step 8.2: Update GEMINI.md**

File: `/GEMINI.md`

Add section about kernel architecture:

```markdown
### Kernel Architecture

Lockness uses a clean kernel architecture that hides framework complexity from users.

**Design Principles:**
1. **Declarative Configuration**: Users declare what they want, not how to achieve it
2. **Sensible Defaults**: Common configurations work out of the box
3. **Progressive Enhancement**: Start simple, add complexity as needed
4. **Builder Pattern**: Fluent API for readable configuration

**User-Facing API:**
- `app.useSession()` - Configure session management
- `app.useAuth()` - Configure authentication
- `app.useErrorPages()` - Configure error handling
- `app.useMiddleware()` - Register middleware
- `app.configure()` - Advanced configuration callback

**Internal Components:**
- `KernelBuilder`: Orchestrates application initialization
- `ConfigLoader`: Loads and validates configuration from environment
- `MiddlewareRegistry`: Manages global and named middleware
- `ErrorHandlerFactory`: Creates error handlers from configuration

**Benefits:**
- User kernels are < 30 lines for simple apps
- No repetition between dev/prod configurations
- Framework internals hidden behind clean APIs
- Easy to test and mock
````

## ✅ Success Criteria

### Must Have

- [ ] `KernelBuilder` class created with fluent API
- [ ] `ConfigLoader` utility for environment-based config
- [ ] `MiddlewareRegistry` for centralized middleware management
- [ ] `App` class extended with helper methods (`useSession`, `useAuth`, etc.)
- [ ] Main kernel (`/app/kernel.tsx`) refactored to < 40 lines
- [ ] Stub kernel (`/packages/init/stubs/init/app/kernel.tsx.stub`) simplified
- [ ] All unit tests pass (mocked, no database)
- [ ] Zero regression in existing functionality
- [ ] Documentation updated (README, GEMINI.md)
- [ ] Type definitions added for all new APIs

### Should Have

- [ ] Error pages extracted to separate module (`/app/view/pages/errors/mod.ts`)
- [ ] Database initialization moved to separate bootstrap step
- [ ] Devtools initialization simplified with `app.useDevtools()`
- [ ] Configuration validation with helpful error messages
- [ ] Examples in documentation for common use cases

### Nice to Have

- [ ] Migration guide from old kernel to new kernel
- [ ] Automated migration script
- [ ] CLI command to generate kernel templates
- [ ] Visual diagram of kernel architecture

## 🧪 Testing Strategy

### Unit Tests (Primary Focus)

**Critical Requirements:**

1. **No Database Access**: All tests must use mocks
2. **Fast Execution**: Each test < 10ms
3. **Isolated**: No shared state between tests
4. **Deterministic**: Same input = same output always

**Test Coverage Targets:**

- `KernelBuilder`: 90% coverage
- `ConfigLoader`: 90% coverage
- `MiddlewareRegistry`: 90% coverage
- `App` extensions: 85% coverage

**Mock Strategy:**

```typescript
// Mock middleware for testing
const mockMiddleware = {
    async handle(c: any, next: any) {
        await next()
    },
}

// Mock App.init() to avoid real initialization
app.init = async (config: any) => {
    // Capture config for assertions
    return Promise.resolve()
}

// Mock environment variables
const mockEnv = {
    APP_ENV: 'development',
    APP_KEY: 'test-key',
    SESSION_DRIVER: 'cookie',
}
```

### Integration Tests (Minimal)

Only run **after** all unit tests pass:

```typescript
Deno.test('Kernel - full bootstrap integration', async () => {
    // This tests real bootstrap but with minimal dependencies
    const app = await bootstrap()

    assertExists(app)
    assertExists(app.getHono())
})
```

### Test Execution Order

1. ✅ Unit tests (fast, mocked)
2. ✅ Type checks
3. ✅ Integration tests (minimal)
4. ✅ Manual smoke test (`deno task dev`)

## 🔄 Migration Strategy

### For Existing Applications

**Step 1: Backward Compatibility**

Old kernel format continues to work (no breaking changes):

```typescript
// Old format (still works)
await app.init({
  controllers,
  globalMiddlewares: [...],
  middlewares: {...},
})
```

**Step 2: Gradual Migration**

Users can adopt new API incrementally:

```typescript
// Mix old and new APIs
const app = new App()
app.useSession({ driver: 'cookie' })

await app.init({
  controllers,
  globalMiddlewares: [...], // Old way
})
```

**Step 3: Full Migration**

Eventually move to full new API:

```typescript
// New format
app.configure((config) => {
  config.session({ driver: 'cookie' })
  config.middleware({ global: [...] })
})
```

### Migration Checklist

For developers migrating existing projects:

- [ ] Extract error handler to separate module
- [ ] Move database connection out of kernel
- [ ] Replace direct middleware registration with `.useMiddleware()`
- [ ] Replace session config with `.useSession()`
- [ ] Replace auth config with `.useAuth()`
- [ ] Remove dev/prod duplication using `app.isDevelopment`
- [ ] Test all routes still work
- [ ] Update tests to use new kernel API

## 🚫 Anti-Patterns to Avoid

### DON'T: Put Business Logic in Kernel

```typescript
// ❌ BAD
export const bootstrap = async () => {
    const app = new App()

    // Don't do data processing or business logic here
    const users = await db.query('SELECT * FROM users')
    app.locals.userCount = users.length

    return app
}
```

```typescript
// ✅ GOOD
export const bootstrap = async () => {
    const app = new App()

    // Kernel only configures, doesn't process
    await app
        .useSession({ driver: 'cookie' })
        .init({ controllers })

    return app
}
```

### DON'T: Inline Class Definitions

```typescript
// ❌ BAD
middlewares: {
  auth: class AuthMiddleware {
    async handle(c: Context, next: Next) { ... }
  }
}
```

```typescript
// ✅ GOOD
import { AuthMiddleware } from '@middleware/auth_middleware.ts'

config.middleware({
    named: { auth: AuthMiddleware },
})
```

### DON'T: Repeat Configuration

```typescript
// ❌ BAD
if (isDevelopment) {
    await app.init({
        globalMiddlewares: [sessionMiddleware(), LoggerMiddleware],
    })
} else {
    await app.init({
        globalMiddlewares: [sessionMiddleware(), LoggerMiddleware], // Duplicate!
    })
}
```

```typescript
// ✅ GOOD
app.configure((config) => {
    config.middleware({ global: ['session', 'logger'] })
})

await app.init({ controllers })
```

### DON'T: Connect to Database in Kernel

```typescript
// ❌ BAD - Database connection in kernel
export const bootstrap = async () => {
    const db = container.get(Database)
    await db.connect(Deno.env.get('DATABASE_URL'))

    const app = new App()
    return app
}
```

```typescript
// ✅ GOOD - Database handled by DI container
export const bootstrap = async () => {
    const app = new App()

    // Database connection happens automatically via DI
    await app.init({ controllers })

    return app
}
```

## 📦 Deliverables

### Framework Files

1. `/packages/core/kernel_builder.ts` - New KernelBuilder class
2. `/packages/core/config_loader.ts` - New ConfigLoader utility
3. `/packages/core/middleware_registry.ts` - New MiddlewareRegistry
4. `/packages/core/app.ts` - Extended with fluent methods
5. `/packages/core/mod.ts` - Updated exports
6. `/packages/core/types.ts` - New type definitions

### Test Files

1. `/packages/core/tests/kernel_builder.test.ts` - Unit tests (mocked)
2. `/packages/core/tests/config_loader.test.ts` - Unit tests (mocked)
3. `/packages/core/tests/middleware_registry.test.ts` - Unit tests (mocked)
4. `/packages/core/tests/app_extensions.test.ts` - Unit tests (mocked)

### Application Files

1. `/app/kernel.tsx` - Refactored kernel (< 40 lines)
2. `/app/view/pages/errors/mod.ts` - Error handler module
3. `/packages/init/stubs/init/app/kernel.tsx.stub` - Simplified stub

### Documentation

1. `/README.md` - Updated kernel examples
2. `/GEMINI.md` - Architecture documentation
3. `/packages/core/README.md` - API documentation

## ⏱️ Estimated Time

- **Phase 1**: 2 hours (KernelBuilder + tests)
- **Phase 2**: 1.5 hours (ConfigLoader + tests)
- **Phase 3**: 1.5 hours (MiddlewareRegistry + tests)
- **Phase 4**: 2 hours (App integration + tests)
- **Phase 5**: 1 hour (Refactor main kernel)
- **Phase 6**: 0.5 hours (Update stub)
- **Phase 7**: 0.5 hours (Update exports)
- **Phase 8**: 1 hour (Documentation)

**Total**: ~10 hours

## 🎯 Comparison: Before vs After

### Before (Current)

```typescript
// 159 lines, lots of duplication, internal details exposed

import {
    App,
    configureSession,
    container,
    sessionMiddleware,
} from '@lockness/core'
import { Database } from '@lockness/drizzle'
import {
    authMiddleware,
    initializeAuthMiddleware,
    SessionGuard,
} from '@lockness/auth'
import { collectAppRoutes, enableDevtools } from '@lockness/devtools'
import { LoggerMiddleware } from '@middleware/logger_middleware.ts'
import { UserProvider } from '../app/auth/user_provider.ts'
import { controllers } from './routes.ts'

const errorHandler = (error: Error, c: Context) => {
    // 50 lines of error handling...
}

export const bootstrap = async () => {
    const db = container.get<Database>(Database)
    await db.connect(Deno.env.get('DATABASE_URL') || '...')

    configureSession({
        driver: 'cookie',
        secret: Deno.env.get('APP_KEY') || 'change-me-in-production',
        lifetime: 7200,
        secure: Deno.env.get('APP_ENV') === 'production',
    })

    const app = new App()
    const isDevelopment = Deno.env.get('APP_ENV') === 'development'

    if (isDevelopment) {
        enableDevtools(app.getHono())
    }

    if (isDevelopment) {
        await app.init({
            controllersDir: './app/controller',
            staticDir: 'public',
            errorHandler,
            globalMiddlewares: [
                sessionMiddleware(),
                initializeAuthMiddleware({
                    default: 'web',
                    guards: {
                        web: (ctx) =>
                            new SessionGuard('web', ctx, new UserProvider(db)),
                    },
                }),
                LoggerMiddleware,
            ],
            middlewares: {
                auth: class AuthMiddleware {/* ... */},
            },
        })
        collectAppRoutes(app)
    } else {
        // Same 50 lines repeated for production...
    }

    app.getHono().notFound((c) => {
        return c.html(<NotFoundPage />, 404)
    })

    return app
}
```

### After (Target)

```typescript
// ~30 lines, clean, declarative, no duplication

import { App } from '@lockness/core'
import { controllers } from './routes.ts'
import { UserProvider } from './auth/user_provider.ts'
import { LoggerMiddleware } from '@middleware/logger_middleware.ts'
import * as ErrorPages from '@view/pages/errors/mod.ts'

export const bootstrap = async () => {
    const app = new App()

    app.configure((config) => {
        config.session({ driver: 'cookie', lifetime: 7200 })
        config.auth({ default: 'web', guards: { web: UserProvider } })
        config.errorPages({ handler: ErrorPages.errorHandler })
        config.middleware({
            global: [LoggerMiddleware],
            named: { auth: 'auth' },
        })
    })

    await app.init({ controllers, staticDir: 'public' })

    if (app.isDevelopment) {
        app.useDevtools()
    }

    return app
}
```

**Improvements:**

- ✅ 80% less code
- ✅ No dev/prod duplication
- ✅ Framework internals hidden
- ✅ Self-documenting configuration
- ✅ Professional, modern appearance
- ✅ Easy to understand and maintain

---

**Note**: This refactoring maintains 100% backward compatibility while providing
a modern, clean API for new projects. All existing applications continue to work
without modification.
