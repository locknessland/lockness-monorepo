# Technical Task: Refactor Core App Component for Simplicity and Maintainability

## 📋 Task Overview

The `packages/core/app.ts` file has grown to over 520 lines and handles multiple
responsibilities including middleware resolution, controller discovery, route
registration, error handling, static file serving, and server initialization.
This monolithic structure makes the code difficult to read, understand, test,
and maintain.

This refactoring will split the App class into smaller, focused components
following SOLID principles, making the codebase more maintainable, testable, and
easier to understand for contributors.

## 🎯 Objectives

1. **Improve Readability**: Break down the 520-line App class into smaller,
   focused modules (target: < 150 lines per file)
2. **Enhance Testability**: Create isolated components that can be unit tested
   independently without complex mocking
3. **Follow SOLID Principles**: Apply Single Responsibility, Open/Closed, and
   Dependency Inversion principles
4. **Maintain Backward Compatibility**: Keep the public API unchanged to avoid
   breaking existing code
5. **Improve Documentation**: Add comprehensive JSDoc comments and update all
   related documentation

## 📁 Affected File Paths

### Core Files to Modify

- `/packages/core/app.ts` - Main App class (refactor into smaller orchestrator)
- `/packages/core/mod.ts` - Export new classes and utilities
- `/packages/core/types.ts` - Add new type definitions for refactored components

### New Files to Create

- `/packages/core/middleware_resolver.ts` - Middleware resolution logic
- `/packages/core/controller_discovery.ts` - Controller discovery and scanning
- `/packages/core/route_registry.ts` - Route registration and management
- `/packages/core/error_handler_registry.ts` - Error handler auto-discovery and
  registration
- `/packages/core/static_file_server.ts` - Static file serving configuration
- `/packages/core/server_listener.ts` - Server startup and port management
- `/packages/core/app_config_builder.ts` - Configuration building utilities

### Test Files

- `/packages/core/tests/middleware_resolver.test.ts` - Unit tests for middleware
  resolution
- `/packages/core/tests/controller_discovery.test.ts` - Unit tests for
  controller discovery
- `/packages/core/tests/route_registry.test.ts` - Unit tests for route
  registration
- `/packages/core/tests/error_handler_registry.test.ts` - Unit tests for error
  handler discovery
- `/packages/core/tests/static_file_server.test.ts` - Unit tests for static file
  serving
- `/packages/core/tests/server_listener.test.ts` - Unit tests for server startup
- `/packages/core/tests/app_integration.test.ts` - Integration tests for full
  App workflow

### Documentation Files to Update

> ⚠️ **Important**: Follow the architecture and conventions documented in
> [GEMINI.md](../GEMINI.md)

#### Core Documentation

- `/README.md` - Update if public API examples change
- `/GEMINI.md` - Update architecture section with new component structure
- `/packages/core/README.md` - Document internal architecture changes

#### User Documentation (Web)

- `/app/view/pages/docs/content/getting-started.md` - Verify examples still work
- No new user-facing pages needed (internal refactoring only)

#### LLM Documentation

- `/public/llms/full.txt` - Update if architecture significantly changes
- No new LLM docs needed (internal refactoring only)

#### Stub Templates

> 📝 **Reminder**: Check [STUBS.md](../docs/STUBS.md) for stub mapping

- No stub changes required (public API remains unchanged)

## 🏗️ Architecture Principles

### Current Problems Analysis

**1. Single Responsibility Principle (SRP) Violations**

- **Problem**: The App class handles:
  - Middleware resolution (class, function, string)
  - Controller discovery (filesystem scanning)
  - Route registration and sorting
  - Error handler auto-discovery
  - Static file serving configuration
  - Server initialization and port management
  - Global state management (routes, middleware registry)

- **Impact**:
  - Difficult to test individual features
  - Hard to understand the full flow
  - Changes in one area risk breaking others
  - 520 lines in a single file

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Solution**: Split into focused components
  ```typescript
  // Each class has ONE responsibility

  class MiddlewareResolver {
      resolve(middleware: MiddlewareInput): MiddlewareHandler
  }

  class ControllerDiscovery {
      async discover(dirPath: string): Promise<ControllerClass[]>
  }

  class RouteRegistry {
      register(controller: ControllerClass): void
      getRoutes(): RouteInfo[]
  }

  class ErrorHandlerRegistry {
      async autoDiscover(): Promise<ErrorHandler>
  }

  class StaticFileServer {
      configure(hono: Hono, config: StaticConfig): void
  }

  class ServerListener {
      listen(hono: Hono, port: number): Deno.HttpServer
  }
  ```

**2. Open/Closed Principle (OCP)**

- **Current Problem**: Adding new middleware resolution strategies requires
  modifying App class
- **Solution**: Strategy pattern for middleware resolution
  ```typescript
  interface IMiddlewareStrategy {
      canResolve(input: MiddlewareInput): boolean
      resolve(input: MiddlewareInput): MiddlewareHandler
  }

  class MiddlewareResolver {
      private strategies: IMiddlewareStrategy[] = []

      addStrategy(strategy: IMiddlewareStrategy): void {
          this.strategies.push(strategy)
      }
  }
  ```

**3. Liskov Substitution Principle (LSP)**

- **Current Problem**: Mixed initialization paths (dev vs prod)
- **Solution**: Unified interfaces with consistent behavior
  ```typescript
  interface IControllerProvider {
      getControllers(): Promise<ControllerClass[]>
  }

  class DirectControllerProvider implements IControllerProvider {
      constructor(private controllers: ControllerClass[]) {}
      async getControllers() {
          return this.controllers
      }
  }

  class FileSystemControllerProvider implements IControllerProvider {
      constructor(private dirPath: string) {}
      async getControllers() {/* scan filesystem */}
  }
  ```

**4. Interface Segregation Principle (ISP)**

- **Current Problem**: Large AppConfig interface with all options mixed
- **Solution**: Segregated configuration interfaces
  ```typescript
  interface MiddlewareConfig {
      middlewares?: MiddlewareRegistry
      globalMiddlewares?: MiddlewareInput[]
  }

  interface ControllerConfig {
      controllers?: ControllerClass[]
      controllersDir?: string
  }

  interface StaticConfig {
      staticDir?: string
  }

  interface ErrorConfig {
      errorHandler?: ErrorHandler
  }

  // Compose as needed
  type AppConfig =
      & MiddlewareConfig
      & ControllerConfig
      & StaticConfig
      & ErrorConfig
  ```

**5. Dependency Inversion Principle (DIP)**

- **Current Problem**: App directly depends on concrete implementations
- **Solution**: Depend on abstractions
  ```typescript
  class App {
      constructor(
          private middlewareResolver: IMiddlewareResolver,
          private controllerProvider: IControllerProvider,
          private routeRegistry: IRouteRegistry,
          private errorRegistry: IErrorHandlerRegistry,
      ) {}
  }
  ```

### DRY Principle (Don't Repeat Yourself)

**Current Duplication:**

- Middleware resolution logic repeated for global and route-level middlewares
- Path normalization logic (`fullPath` calculation) not extracted
- Error handling patterns duplicated (try-catch blocks)
- File existence checks duplicated

**Solution:**

- Extract `MiddlewareResolver` with unified resolution logic
- Create `PathNormalizer` utility
- Create `ErrorWrapper` for consistent error handling
- Create `FileSystemHelper` for filesystem operations

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  App (Orchestrator)                      │  ← Thin coordinator (< 150 lines)
├─────────────────────────────────────────┤
│  Feature Components                      │  ← Focused modules
│  • MiddlewareResolver                    │     (100-150 lines each)
│  • ControllerDiscovery                   │
│  • RouteRegistry                         │
│  • ErrorHandlerRegistry                  │
│  • StaticFileServer                      │
│  • ServerListener                        │
├─────────────────────────────────────────┤
│  Shared Utilities                        │  ← Reusable helpers
│  • PathNormalizer                        │     (< 50 lines each)
│  • FileSystemHelper                      │
│  • ErrorWrapper                          │
└─────────────────────────────────────────┘
```

**Key Constraints:**

- Each module should be < 150 lines
- App class should be < 150 lines (orchestration only)
- No direct filesystem access in App class
- All components must be independently testable
- Public API must remain unchanged
- No breaking changes to existing user code

## 🎨 Proposed API Design

### Target App Class (After Refactoring)

The App class becomes a thin orchestrator that delegates to specialized
components:

```typescript
// packages/core/app.ts - AFTER REFACTORING (~120 lines)
import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'
import { MiddlewareResolver } from './middleware_resolver.ts'
import { ControllerDiscovery } from './controller_discovery.ts'
import { RouteRegistry } from './route_registry.ts'
import { ErrorHandlerRegistry } from './error_handler_registry.ts'
import { StaticFileServer } from './static_file_server.ts'
import { ServerListener } from './server_listener.ts'
import type { AppConfig, ErrorHandler, MiddlewareInput } from './types.ts'

export class App {
    private hono = new Hono({ strict: false })
    private middlewareResolver = new MiddlewareResolver()
    private routeRegistry = new RouteRegistry()
    private errorRegistry = new ErrorHandlerRegistry()
    private staticServer = new StaticFileServer()
    private serverListener = new ServerListener()

    private pendingGlobalMiddlewares: MiddlewareInput[] = []
    private pendingErrorHandler?: ErrorHandler

    constructor() {
        this.hono.use('*', jsxRenderer(({ children }) => children as any))
    }

    // Fluent API
    useMiddleware(...middlewares: MiddlewareInput[]): this {
        this.pendingGlobalMiddlewares.push(...middlewares)
        return this
    }

    useErrorHandler(handler: ErrorHandler): this {
        this.pendingErrorHandler = handler
        return this
    }

    // Initialization (orchestrates all components)
    async init(config: AppConfig): Promise<void> {
        // 1. Register named middlewares
        if (config.middlewares) {
            this.middlewareResolver.registerNamed(config.middlewares)
        }

        // 2. Setup error handling
        const errorHandler = await this.errorRegistry.resolve(
            this.pendingErrorHandler || config.errorHandler,
        )
        this.errorRegistry.register(this.hono, errorHandler)

        // 3. Apply global middlewares
        const globalMiddlewares = [
            ...this.pendingGlobalMiddlewares,
            ...(config.globalMiddlewares || []),
        ]
        this.middlewareResolver.applyGlobal(this.hono, globalMiddlewares)

        // 4. Discover and register controllers
        const controllers = await ControllerDiscovery.getControllers(config)
        await this.routeRegistry.registerControllers(
            this.hono,
            controllers,
            this.middlewareResolver,
        )

        // 5. Setup static file serving
        if (config.staticDir) {
            this.staticServer.configure(this.hono, config.staticDir)
        }

        // 6. Register 404 handler
        this.errorRegistry.registerNotFound(this.hono, errorHandler)
    }

    // Getters (unchanged)
    get isDevelopment(): boolean {
        return Deno.env.get('APP_ENV') === 'development'
    }

    get isProduction(): boolean {
        return Deno.env.get('APP_ENV') === 'production'
    }

    getRoutes() {
        return this.routeRegistry.getAll()
    }

    getHono() {
        return this.hono
    }

    get fetch() {
        return this.hono.fetch.bind(this.hono)
    }

    // Server startup
    listen(port: number): Deno.HttpServer {
        return this.serverListener.start(this.hono, port)
    }
}
```

### Component APIs

#### MiddlewareResolver

```typescript
// packages/core/middleware_resolver.ts (~120 lines)
import type {
    MiddlewareHandler,
    MiddlewareInput,
    MiddlewareRegistry,
} from './types.ts'

export class MiddlewareResolver {
    private registry: MiddlewareRegistry = {}

    registerNamed(middlewares: MiddlewareRegistry): void {
        this.registry = { ...this.registry, ...middlewares }
    }

    resolve(middleware: MiddlewareInput): MiddlewareHandler | null {
        if (typeof middleware === 'string') {
            return this.resolveNamed(middleware)
        }
        if (typeof middleware === 'function') {
            return this.resolveFunction(middleware)
        }
        return null
    }

    applyGlobal(hono: Hono, middlewares: MiddlewareInput[]): void {
        const handlers = middlewares
            .map((m) => this.resolve(m))
            .filter((h) => h !== null)

        if (handlers.length > 0) {
            hono.use('*', ...handlers)
        }
    }

    private resolveNamed(name: string): MiddlewareHandler | null {
        const MiddlewareClass = this.registry[name]
        if (!MiddlewareClass) {
            console.warn(`⚠️ Named middleware '${name}' not found`)
            return null
        }
        const instance = new MiddlewareClass()
        return instance.handle.bind(instance)
    }

    private resolveFunction(fn: Function): MiddlewareHandler | null {
        if (fn.prototype && fn.prototype.handle) {
            // Class middleware
            const instance = new (fn as any)()
            return instance.handle.bind(instance)
        }
        // Plain function middleware
        return fn as MiddlewareHandler
    }
}
```

#### ControllerDiscovery

```typescript
// packages/core/controller_discovery.ts (~100 lines)
import { join } from 'node:path'
import type { AppConfig, ControllerClass } from './types.ts'

export class ControllerDiscovery {
    static async getControllers(config: AppConfig): Promise<ControllerClass[]> {
        if ('controllers' in config && config.controllers) {
            return config.controllers
        }

        if ('controllersDir' in config && config.controllersDir) {
            return await this.discoverFromDirectory(config.controllersDir)
        }

        return []
    }

    static async discoverFromDirectory(
        dirPath: string,
    ): Promise<ControllerClass[]> {
        const absolutePath = this.resolveAbsolutePath(dirPath)
        if (!absolutePath) {
            console.warn(`⚠️ Controllers directory not found: ${dirPath}`)
            return []
        }

        const controllers: ControllerClass[] = []

        try {
            for await (const entry of Deno.readDir(absolutePath)) {
                if (this.isControllerFile(entry)) {
                    const fileControllers = await this.loadControllersFromFile(
                        join(absolutePath, entry.name),
                    )
                    controllers.push(...fileControllers)
                }
            }
        } catch (error) {
            console.error(
                `❌ Error during controller discovery: ${error.message}`,
            )
        }

        return controllers
    }

    private static resolveAbsolutePath(dirPath: string): string | null {
        try {
            return Deno.realPathSync(dirPath)
        } catch {
            try {
                const path = join(Deno.cwd(), dirPath)
                const info = Deno.statSync(path)
                return info.isDirectory ? path : null
            } catch {
                return null
            }
        }
    }

    private static isControllerFile(entry: Deno.DirEntry): boolean {
        return entry.isFile &&
            (entry.name.endsWith('.ts') ||
                entry.name.endsWith('.js') ||
                entry.name.endsWith('.tsx'))
    }

    private static async loadControllersFromFile(
        filePath: string,
    ): Promise<ControllerClass[]> {
        const controllers: ControllerClass[] = []
        const fileUrl = `file://${filePath}`
        const module = await import(/* @vite-ignore */ fileUrl)

        for (const exportKey in module) {
            const Exported = module[exportKey]
            if (this.isController(Exported)) {
                // Trigger TC39 decorator initialization
                this.initializeController(Exported)
                controllers.push(Exported)
            }
        }

        return controllers
    }

    private static isController(Exported: any): boolean {
        return typeof Exported === 'function' &&
            Exported._basePath !== undefined
    }

    private static initializeController(Controller: ControllerClass): void {
        // TC39 decorators: addInitializer only runs on instance creation
        if (!Controller._routes || Controller._routes.length === 0) {
            try {
                new Controller()
            } catch {
                // Ignore errors during temporary instantiation
            }
        }
    }
}
```

#### RouteRegistry

```typescript
// packages/core/route_registry.ts (~150 lines)
import { createAuthMiddleware, createGuestMiddleware } from './auth.ts'
import { namedRoutes } from './router.ts'
import type { Context, ControllerClass, RouteInfo } from './types.ts'
import type { MiddlewareResolver } from './middleware_resolver.ts'

export class RouteRegistry {
    private routes: RouteInfo[] = []

    async registerControllers(
        hono: Hono,
        controllers: ControllerClass[],
        middlewareResolver: MiddlewareResolver,
    ): Promise<void> {
        const allRoutes = this.buildRoutes(controllers, middlewareResolver)
        this.sortRoutes(allRoutes)
        this.registerRoutes(hono, allRoutes)
    }

    getAll(): RouteInfo[] {
        return this.routes
    }

    private buildRoutes(
        controllers: ControllerClass[],
        middlewareResolver: MiddlewareResolver,
    ): any[] {
        const allRoutes: any[] = []

        for (const Controller of controllers) {
            const instance = new Controller()
            const basePath = Controller._basePath || ''
            const routes = Controller._routes || []

            for (const route of routes) {
                const routeData = this.buildRouteData(
                    Controller,
                    instance,
                    basePath,
                    route,
                    middlewareResolver,
                )
                allRoutes.push(routeData.honoRoute)
                this.routes.push(routeData.info)

                if (route.name) {
                    namedRoutes.set(route.name, routeData.info.path)
                }
            }
        }

        return allRoutes
    }

    private buildRouteData(
        Controller: ControllerClass,
        instance: any,
        basePath: string,
        route: any,
        middlewareResolver: MiddlewareResolver,
    ) {
        const fullPath = this.normalizePath(basePath, route.path)
        const middlewares = this.collectMiddlewares(
            Controller,
            route,
            middlewareResolver,
        )

        return {
            honoRoute: {
                fullPath,
                method: route.method.toLowerCase(),
                handler: (c: Context) => instance[route.methodName](c),
                middlewares: middlewares.handlers,
            },
            info: {
                method: route.method.toUpperCase(),
                path: fullPath,
                controller: Controller.name,
                action: route.methodName,
                middlewares: middlewares.names,
                name: route.name,
            },
        }
    }

    private normalizePath(basePath: string, routePath: string): string {
        let fullPath = `/${basePath}/${routePath}`.replace(/\/+/g, '/')
        if (fullPath.length > 1 && fullPath.endsWith('/')) {
            fullPath = fullPath.slice(0, -1)
        }
        return fullPath
    }

    private collectMiddlewares(
        Controller: ControllerClass,
        route: any,
        middlewareResolver: MiddlewareResolver,
    ): { handlers: any[]; names: string[] } {
        // Complex middleware collection logic extracted from App
        // Includes auth, guest, validators, and route middlewares
        // ... (implementation details)
    }

    private sortRoutes(routes: any[]): void {
        routes.sort((a, b) => {
            const aHasParam = a.fullPath.includes(':')
            const bHasParam = b.fullPath.includes(':')
            if (aHasParam && !bHasParam) return 1
            if (!aHasParam && bHasParam) return -1
            return b.fullPath.length - a.fullPath.length
        })
    }

    private registerRoutes(hono: Hono, routes: any[]): void {
        for (const route of routes) {
            ;(hono as any)[route.method](
                route.fullPath,
                ...route.middlewares,
                route.handler,
            )
        }
    }
}
```

#### ErrorHandlerRegistry

```typescript
// packages/core/error_handler_registry.ts (~80 lines)
import type { ErrorHandler } from './types.ts'
import { defaultErrorHandler } from './default_error_handler.tsx'

export class ErrorHandlerRegistry {
    async resolve(handler?: ErrorHandler): Promise<ErrorHandler> {
        if (handler) {
            return handler
        }

        // Auto-discover custom error handler
        try {
            const customHandler = await this.discoverCustomHandler()
            if (customHandler) {
                console.log('  ✨ Using custom error handler')
                return customHandler
            }
        } catch {
            // Fall through to default
        }

        return defaultErrorHandler
    }

    register(hono: Hono, handler: ErrorHandler): void {
        hono.onError((error, c) => handler(error, c as any))
    }

    registerNotFound(hono: Hono, handler: ErrorHandler): void {
        hono.notFound((c) => {
            const error = new Error('Not Found') as any
            error.status = 404
            return handler(error, c as any)
        })
    }

    private async discoverCustomHandler(): Promise<ErrorHandler | null> {
        const cwd = Deno.cwd()
        const customPath = `${cwd}/app/view/pages/errors/error_handler.tsx`

        try {
            await Deno.stat(customPath)
            const module = await import(customPath)
            return module.errorHandler || null
        } catch {
            return null
        }
    }
}
```

#### StaticFileServer

```typescript
// packages/core/static_file_server.ts (~30 lines)
import { serveStatic } from 'hono/deno'
import type { Hono } from 'hono'

export class StaticFileServer {
    configure(hono: Hono, rootDir: string): void {
        hono.use('/*', serveStatic({ root: rootDir }))
    }
}
```

#### ServerListener

```typescript
// packages/core/server_listener.ts (~120 lines)
import pkg from './deno.json' with { type: 'json' }

export class ServerListener {
    start(hono: Hono, port: number): Deno.HttpServer {
        this.printBanner()
        return this.tryServe(hono, port)
    }

    private printBanner(): void {
        const env = this.getEnvironment()
        const envLabel = this.getEnvironmentLabel(env)

        console.log(`
  ▜     ▌         
  ▐ ▛▌▛▘▙▘▛▌█▌▛▘▛▘
  ▐▖▙▌▙▖▛▖▌▌▙▖▄▌▄▌ v${pkg.version}
        `)
        console.log(`  Environment: ${envLabel}\n`)
    }

    private async tryServe(hono: Hono, port: number): Promise<Deno.HttpServer> {
        try {
            return Deno.serve({
                port,
                onListen: this.createOnListenHandler(port),
            }, hono.fetch.bind(hono))
        } catch (error) {
            if (error instanceof Deno.errors.AddrInUse) {
                return await this.handlePortInUse(hono, port)
            }
            throw error
        }
    }

    private async handlePortInUse(
        hono: Hono,
        port: number,
    ): Promise<Deno.HttpServer> {
        if (Deno.args.includes('--force')) {
            await this.forceReleasePort(port)
            await new Promise((r) => setTimeout(r, 800))
            return this.tryServe(hono, port)
        }

        this.printPortInUseError(port)
        Deno.exit(1)
    }

    // ... (helper methods for environment, port management, etc.)
}
```

## 📝 Detailed Implementation Steps

### Phase 1: Extract Middleware Resolution

**Step 1.1: Create MiddlewareResolver**

File: `/packages/core/middleware_resolver.ts`

````typescript
import type {
    IMiddleware,
    MiddlewareClass,
    MiddlewareHandler,
    MiddlewareInput,
    MiddlewareRegistry,
} from './types.ts'
import type { Hono } from 'hono'

/**
 * Resolves and manages middleware handlers.
 * Supports class-based, function-based, and named middlewares.
 *
 * @example
 * ```typescript
 * const resolver = new MiddlewareResolver()
 * resolver.registerNamed({ auth: AuthMiddleware })
 * const handler = resolver.resolve('auth')
 * ```
 */
export class MiddlewareResolver {
    private registry: MiddlewareRegistry = {}

    /**
     * Register named middlewares for later resolution
     */
    registerNamed(middlewares: MiddlewareRegistry): void {
        this.registry = { ...this.registry, ...middlewares }
    }

    /**
     * Resolve a middleware input to a handler function
     * @returns MiddlewareHandler or null if resolution fails
     */
    resolve(middleware: MiddlewareInput): MiddlewareHandler | null {
        if (typeof middleware === 'string') {
            return this.resolveNamed(middleware)
        }

        if (typeof middleware === 'function') {
            return this.resolveFunction(middleware)
        }

        return null
    }

    /**
     * Apply global middlewares to Hono instance
     */
    applyGlobal(hono: Hono, middlewares: MiddlewareInput[]): void {
        const handlers = middlewares
            .map((m) => this.resolve(m))
            .filter((h): h is MiddlewareHandler => h !== null)

        if (handlers.length > 0) {
            hono.use('*', ...handlers as any)
        }
    }

    private resolveNamed(name: string): MiddlewareHandler | null {
        const MiddlewareClass = this.registry[name]

        if (!MiddlewareClass) {
            console.warn(`⚠️ Named middleware '${name}' not found in registry`)
            return null
        }

        const instance = new MiddlewareClass() as IMiddleware
        return instance.handle.bind(instance)
    }

    private resolveFunction(fn: Function): MiddlewareHandler | null {
        // Check if it's a class (has prototype with handle) or a plain function
        if (fn.prototype && fn.prototype.handle) {
            // Class middleware
            const instance = new (fn as MiddlewareClass)() as IMiddleware
            return instance.handle.bind(instance)
        }

        // Plain function middleware (like sessionMiddleware())
        return fn as MiddlewareHandler
    }
}
````

**Step 1.2: Unit Tests for MiddlewareResolver**

File: `/packages/core/tests/middleware_resolver.test.ts`

```typescript
import { assertEquals, assertExists } from '@std/assert'
import { MiddlewareResolver } from '../middleware_resolver.ts'
import type { Context, IMiddleware } from '../types.ts'

// Mock middleware class
class MockMiddleware implements IMiddleware {
    handle(c: Context, next: () => Promise<Response>): Promise<Response> {
        return next()
    }
}

// Mock plain function middleware
const mockFunctionMiddleware = async (
    c: Context,
    next: () => Promise<Response>,
) => {
    return next()
}

Deno.test('MiddlewareResolver - resolves class middleware', () => {
    const resolver = new MiddlewareResolver()
    const handler = resolver.resolve(MockMiddleware)

    assertExists(handler)
})

Deno.test('MiddlewareResolver - resolves function middleware', () => {
    const resolver = new MiddlewareResolver()
    const handler = resolver.resolve(mockFunctionMiddleware)

    assertExists(handler)
    assertEquals(handler, mockFunctionMiddleware)
})

Deno.test('MiddlewareResolver - resolves named middleware', () => {
    const resolver = new MiddlewareResolver()
    resolver.registerNamed({ test: MockMiddleware })

    const handler = resolver.resolve('test')
    assertExists(handler)
})

Deno.test('MiddlewareResolver - returns null for unknown named middleware', () => {
    const resolver = new MiddlewareResolver()
    const handler = resolver.resolve('unknown')

    assertEquals(handler, null)
})

Deno.test('MiddlewareResolver - applies global middlewares', () => {
    const resolver = new MiddlewareResolver()
    const mockHono = {
        use: (path: string, ...handlers: any[]) => {
            assertEquals(path, '*')
            assertEquals(handlers.length, 2)
        },
    }

    resolver.applyGlobal(
        mockHono as any,
        [MockMiddleware, mockFunctionMiddleware],
    )
})
```

**Testing Principles:**

- ✅ All tests use mocks, no database/network dependencies
- ✅ Tests are fast (< 10ms each)
- ✅ Tests are isolated and deterministic
- ✅ Focus on behavior, not implementation details

### Phase 2: Extract Controller Discovery

**Step 2.1: Create ControllerDiscovery**

File: `/packages/core/controller_discovery.ts`

[See API Design section above for full implementation]

**Step 2.2: Unit Tests**

File: `/packages/core/tests/controller_discovery.test.ts`

```typescript
import { assertEquals, assertExists } from '@std/assert'
import { ControllerDiscovery } from '../controller_discovery.ts'

Deno.test('ControllerDiscovery - returns direct controllers from config', async () => {
    class TestController {
        static _basePath = '/test'
    }

    const config = { controllers: [TestController as any] }
    const result = await ControllerDiscovery.getControllers(config)

    assertEquals(result.length, 1)
    assertEquals(result[0], TestController)
})

Deno.test('ControllerDiscovery - returns empty array for invalid directory', async () => {
    const config = { controllersDir: '/nonexistent/path' }
    const result = await ControllerDiscovery.getControllers(config)

    assertEquals(result.length, 0)
})

// More tests for filesystem scanning, error handling, etc.
```

### Phase 3: Extract Route Registry

**Step 3.1: Create RouteRegistry**

File: `/packages/core/route_registry.ts`

[See API Design section above for full implementation]

**Step 3.2: Unit Tests**

File: `/packages/core/tests/route_registry.test.ts`

### Phase 4: Extract Error Handler Registry

**Step 4.1: Create ErrorHandlerRegistry**

File: `/packages/core/error_handler_registry.ts`

[See API Design section above for full implementation]

**Step 4.2: Unit Tests**

File: `/packages/core/tests/error_handler_registry.test.ts`

### Phase 5: Extract Static File Server

**Step 5.1: Create StaticFileServer**

File: `/packages/core/static_file_server.ts`

[See API Design section above for full implementation]

**Step 5.2: Unit Tests**

File: `/packages/core/tests/static_file_server.test.ts`

### Phase 6: Extract Server Listener

**Step 6.1: Create ServerListener**

File: `/packages/core/server_listener.ts`

[See API Design section above for full implementation]

**Step 6.2: Unit Tests**

File: `/packages/core/tests/server_listener.test.ts`

### Phase 7: Refactor Main App Class

**Step 7.1: Update App to use new components**

File: `/packages/core/app.ts`

[See API Design section above for refactored App class]

**Step 7.2: Integration Tests**

File: `/packages/core/tests/app_integration.test.ts`

```typescript
import { assertEquals, assertExists } from '@std/assert'
import { App } from '../app.ts'
import type { ControllerClass } from '../types.ts'

Deno.test('App - initialization with direct controllers', async () => {
    class TestController {
        static _basePath = '/test'
        static _routes = [{
            method: 'GET',
            path: '/',
            methodName: 'index',
        }]
        index(c: any) {
            return c.text('Hello')
        }
    }

    const app = new App()
    await app.init({ controllers: [TestController as any] })

    const routes = app.getRoutes()
    assertEquals(routes.length, 1)
    assertEquals(routes[0].path, '/test')
})

Deno.test('App - fluent API for middleware', async () => {
    const app = new App()
    const middleware = async (c: any, next: any) => next()

    const result = app.useMiddleware(middleware)
    assertEquals(result, app) // Returns self for chaining

    await app.init({ controllers: [] })
})

// More integration tests...
```

### Phase 8: Update Exports

**Step 8.1: Update mod.ts**

File: `/packages/core/mod.ts`

```typescript
// Add new exports
export { MiddlewareResolver } from './middleware_resolver.ts'
export { ControllerDiscovery } from './controller_discovery.ts'
export { RouteRegistry } from './route_registry.ts'
export { ErrorHandlerRegistry } from './error_handler_registry.ts'
export { StaticFileServer } from './static_file_server.ts'
export { ServerListener } from './server_listener.ts'

// Existing exports remain unchanged
export { App } from './app.ts'
// ... (all other existing exports)
```

## 🔄 Migration Guide

### For Framework Users

**No migration needed!** The public API remains unchanged. Users will continue
to use the App class exactly as before:

```typescript
// This code still works exactly the same
import { App } from '@lockness/core'

const app = new App()
app.useMiddleware(LoggerMiddleware)
    .useErrorHandler(errorHandler)

await app.init({
    controllersDir: './app/controller',
    staticDir: 'public',
})

app.listen(8888)
```

### For Framework Contributors

**Internal API Changes:**

The internal structure has been refactored, but the App class facade remains
unchanged. Contributors working on the framework core should:

1. Use the new component classes for specific features
2. Write tests for individual components rather than the full App
3. Follow the new architecture for any new features

### Breaking Changes

- ⚠️ **None**: This is an internal refactoring with no breaking changes to the
  public API

### Deprecation Strategy

No deprecations needed as this is purely internal refactoring.

## 📚 Documentation Updates Checklist

### Core Documentation

- [ ] Update `/GEMINI.md` with new internal architecture diagram
- [ ] Update `/packages/core/README.md` with component architecture
- [ ] Add JSDoc comments to all new classes and methods
- [ ] Add inline code comments explaining complex logic

### User Documentation (Web Docs)

- [ ] Verify examples in `/app/view/pages/docs/content/getting-started.md` still
      work
- [ ] No user-facing documentation changes needed (internal refactoring)

### LLM Documentation

- [ ] Update `/public/llms/full.txt` if architecture description changes
      significantly
- [ ] No new LLM docs needed (public API unchanged)

### Stub Templates

- [ ] No stub changes required (verified against STUBS.md)
- [ ] Public API remains unchanged

### README Files

- [ ] Update `/packages/core/README.md` with architecture section
- [ ] No changes to root `/README.md` (user API unchanged)

## 🧪 Testing Strategy

### Unit Tests

- [ ] Test MiddlewareResolver with all middleware types
- [ ] Test ControllerDiscovery with various directory structures
- [ ] Test RouteRegistry with complex routing scenarios
- [ ] Test ErrorHandlerRegistry auto-discovery
- [ ] Test StaticFileServer configuration
- [ ] Test ServerListener port management
- [ ] Target 90%+ code coverage for each component

### Integration Tests

- [ ] Test full App initialization flow
- [ ] Test middleware application order
- [ ] Test controller discovery and route registration
- [ ] Test error handler registration
- [ ] Test static file serving
- [ ] Test server startup and shutdown

### Manual Testing

- [ ] Test in development mode (`deno task dev`)
- [ ] Test in production mode (`deno task start`)
- [ ] Test compiled binary (`deno task compile`)
- [ ] Test with new project (`deno task init`)
- [ ] Test all CLI commands still work
- [ ] Test with complex controller setup
- [ ] Test with custom error handlers
- [ ] Test with named middlewares

### Performance Testing

- [ ] Benchmark initialization time (should not increase)
- [ ] Benchmark request handling (should not decrease)
- [ ] Memory usage should not significantly increase
- [ ] Compare against current implementation

## ✅ Definition of Done

- [ ] All implementation steps completed
- [ ] All unit tests passing (90%+ coverage per component)
- [ ] All integration tests passing
- [ ] Code reviewed and approved
- [ ] GEMINI.md updated with architecture diagrams
- [ ] Core README updated with component documentation
- [ ] JSDoc comments added to all public methods
- [ ] No breaking changes to public API verified
- [ ] Manual testing completed (dev, prod, binary, init)
- [ ] Performance benchmarks show no regression
- [ ] All existing tests still pass
- [ ] Code formatted and linted
- [ ] Commit messages follow convention
- [ ] PR description includes:
  - Architecture diagram
  - Before/after line count comparison
  - Performance benchmark results
  - Migration guide (none needed)

## 🔗 Related Tasks

- [refactor-kernel-for-simplicity.md](.tasks/refactor-kernel-for-simplicity.md) -
  Related kernel refactoring task
- [framework-core.md](.tasks/framework-core.md) - General framework improvements

## 📅 Timeline

- **Start Date**: 2026-01-13
- **Estimated Completion**: 2026-01-20 (1 week)
- **Actual Completion**: TBD

## 📝 Notes

### Key Design Decisions

1. **Keep Public API Unchanged**: Critical for backward compatibility
2. **Composition Over Inheritance**: Use aggregation in App class rather than
   complex inheritance
3. **Dependency Injection**: Components receive their dependencies, making
   testing easier
4. **Single File Per Component**: Each component in its own file for clarity
5. **No External Dependencies**: Keep relying only on Deno standard library and
   Hono

### Performance Considerations

- Initialization may create more objects, but impact should be negligible
- Route registration algorithm remains the same
- Middleware resolution logic is identical, just extracted
- No additional filesystem operations

### Security Considerations

- File discovery logic remains unchanged (no new security risks)
- Error handling maintains same security posture
- No new external inputs or attack vectors

### Future Improvements

After this refactoring, future enhancements become easier:

1. **Plugin System**: Components can be replaced or extended
2. **Custom Middleware Strategies**: Easy to add new resolution strategies
3. **Alternative Controller Discovery**: Can add decorators, annotations, etc.
4. **Advanced Route Management**: Easier to add route groups, prefixes, etc.
5. **Better Testing**: Each component can be tested in isolation

### Metrics

**Before Refactoring:**

- app.ts: 520 lines
- Responsibilities: 7 major concerns in one class
- Testability: Complex mocking required
- Maintainability: Difficult to understand flow

**After Refactoring (Target):**

- app.ts: ~120 lines (orchestrator only)
- Components: 7 focused classes (~100 lines each)
- Total lines: ~850 (includes tests and documentation)
- Testability: Each component independently testable
- Maintainability: Clear separation of concerns

---

## 🎓 Guidelines Applied from Template

This task follows the template structure:

✅ Clear problem statement (520-line monolithic class) ✅ SOLID principles
analysis with concrete examples ✅ Detailed component architecture with code
examples ✅ Comprehensive testing strategy (unit + integration) ✅ Documentation
checklist (GEMINI.md, READMEs, LLMs, stubs) ✅ Migration guide (none needed -
backward compatible) ✅ Definition of done with measurable criteria ✅ Timeline
and metrics for success measurement

---

_Task created: 2026-01-13_ _Last updated: 2026-01-13_
