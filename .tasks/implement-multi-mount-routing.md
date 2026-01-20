# Technical Task: Implement Multi-Mount Routing Strategy in Core Package

## 📋 Task Overview

Implement a "Dual Layer" routing architecture in the `@lockness/core` package to
support **Multiple Mount Points**. Currently, the `App` class directly exposes a
single Hono instance (`this.hono`) where controllers are registered. This
refactoring enables mounting the same application on multiple URL patterns
(e.g., `/:languageId/:countryId` AND `/api/:apiVersionId`) with specific context
extraction logic for each mount point.

**Framework Philosophy:**

This feature embodies Lockness's core principle: **provide powerful, flexible
primitives that empower developers to build their own patterns**. Rather than
imposing a specific i18n library or API versioning strategy, we're providing the
foundational routing infrastructure that allows framework users to implement any
URL-based context extraction pattern they need.

**What We're Building:**

- A **framework-level capability** that exposes mount points as a first-class
  configuration option
- **Middleware hooks** at the mount-point level for users to inject their own
  context extraction logic
- **Zero-opinion architecture**: the framework doesn't dictate how users
  validate locales, versions, or tenants—it simply provides the routing layer

**Use Cases Framework Users Can Implement:**

- Internationalized applications with language/country-specific URLs (e.g.,
  `/fr/ca/products`)
- API versioning with shared controller logic (e.g., `/v1/users`, `/v2/users`)
- Multi-tenant SaaS applications with tenant-specific URLs
- E-commerce platforms with localized routing
- Any custom URL prefix pattern requiring context extraction

## 🎯 Objectives

1. **Primary Objective**: Implement dual-layer routing with `rootHono` (public)
   and `hono` (internal) layers
2. **Framework Extensibility**: Provide a flexible `MountPoint` interface that
   empowers users to define their own routing patterns
3. **Type Safety**: Create `MountPoint` interface and update `AppConfig` type
4. **Middleware Support**: Allow mount-point-specific middleware for
   user-defined context extraction
5. **Documentation Objective**: Update GEMINI.md, README, and create LLM
   documentation

> 💡 **Development Phase**: This framework is not yet published. Breaking
> changes are acceptable—we prioritize clean architecture over backward
> compatibility.

## 📁 Affected File Paths

### Core Files to Modify

- `/packages/core/types.ts` - Add `MountPoint` interface and update `AppConfig`
- `/packages/core/app.ts` - Implement dual-layer routing architecture

### Framework Files to Extend

- `/packages/core/mod.ts` - Export new types (`MountPoint`)

### Test Files

- `/packages/core/tests/app.test.ts` - Unit tests for multi-mount routing
- `/packages/core/tests/mount_points.test.ts` - Integration tests for mount
  points

### Documentation Files to Update

> ⚠️ **Important**: Follow the architecture and conventions documented in
> [GEMINI.md](../GEMINI.md)

#### Core Documentation

- `/GEMINI.md` - Document multi-mount architecture
- `/packages/core/README.md` - Document MountPoint API

#### User Documentation (Web)

- `/app/view/pages/docs/content/routing.md` - Add multi-mount routing section

#### LLM Documentation

- `/public/llms/core-routing.txt` - Create/update routing documentation
- `/public/llms/full.txt` - Update comprehensive reference

## 🏗️ Architecture Principles

### Dual Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  rootHono (Public Layer)                                         │
│  ├── GET /:langId/:countryId/* → i18nMiddleware → internal hono │
│  ├── GET /api/:version/* → apiVersionMiddleware → internal hono │
│  ├── Static Files (/css, /js, /img)                             │
│  └── 404 Not Found Handler                                       │
├─────────────────────────────────────────────────────────────────┤
│  hono (Internal Layer)                                           │
│  ├── Controllers registered here                                 │
│  ├── @Get('/users') → works under ALL mount points              │
│  └── Business logic unchanged                                    │
└─────────────────────────────────────────────────────────────────┘
```

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Current Problem**: `App.hono` handles both URL pattern matching and
  controller routing
- **Solution**: Separate concerns into two layers
  - `rootHono`: URL pattern matching, mount-specific middleware, static files
  - `hono`: Controller registration, business logic routing

```typescript
class App {
    // Public layer - handles mount points and static files
    private rootHono = new Hono({ strict: false })

    // Internal layer - handles controller logic (unchanged)
    private hono = new Hono({ strict: false })
}
```

**2. Open/Closed Principle (OCP)**

- **Current Problem**: Adding new mount points requires modifying App class
- **Solution**: Configuration-driven mount points via `AppConfig.mountPoints`

```typescript
// Users extend behavior via configuration, not code changes
await app.init({
    controllersDir: './app/controller',
    mountPoints: [
        { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
        { pattern: '/api/:version', middleware: apiVersionMiddleware },
    ],
})
```

**3. Liskov Substitution Principle (LSP)**

- **Solution**: Mount points are interchangeable - any MountPoint with valid
  pattern works
- All mount points share the same internal controller layer

**4. Interface Segregation Principle (ISP)**

- **Solution**: `MountPoint` interface is minimal and focused

```typescript
interface MountPoint {
    pattern: string
    middleware?: (c: Context, next: Next) => Promise<void | Response>
}
```

**5. Dependency Inversion Principle (DIP)**

- **Solution**: App depends on `MountPoint` abstraction, not concrete
  implementations
- Middleware is injected via configuration

### DRY Principle (Don't Repeat Yourself)

**Current Duplication Risk:**

- Without this pattern, users would duplicate controllers for each mount point
- Route definitions would be repeated per language/country combination or API
  version

**Solution:**

- Controllers defined once, automatically available under all mount points
- Mount-specific logic isolated to middleware (i18n context, API versioning)

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  User Application Layer                  │  ← AppConfig with mountPoints
├─────────────────────────────────────────┤
│  Framework API Layer                     │  ← App.init(), MountPoint interface
├─────────────────────────────────────────┤
│  Core Implementation Layer               │  ← rootHono + hono dual layer
├─────────────────────────────────────────┤
│  HonoJS Foundation                       │  ← Hono routing primitives
└─────────────────────────────────────────┘
```

**Key Constraints:**

- Static files and 404 handler on public layer (global)
- Controllers on internal layer (shared across mount points)
- Clean, intuitive API takes priority over preserving legacy patterns

> ⚠️ **Breaking changes are acceptable** — framework is in active development,
> not yet published.

## 🎨 Proposed API Design

### Target User-Facing API (Simple Version - No Mount Points)

```typescript
// Existing apps continue to work unchanged (from kernel.tsx)
import { App } from '@lockness/core'

const app = new App()

await app.init({
    controllersDir: app.isDevelopment ? './app/controller' : undefined,
    controllers: app.isDevelopment ? undefined : controllers,
    staticDir: 'public',
})

// Controllers available at root: /users, /products
app.listen(8888)
```

### Target User-Facing API (Multi-Mount Version)

```typescript
import { App, type Context, type Next } from '@lockness/core'

// Mount-specific middleware to extract i18n context
const i18nMiddleware = async (c: Context, next: Next) => {
    const langId = c.req.param('langId')
    const countryId = c.req.param('countryId')

    // Validate language/country combination
    const locale = await LocaleService.resolve(langId, countryId)
    if (!locale) {
        return c.notFound()
    }

    c.set('locale', locale)
    c.set('langId', langId)
    c.set('countryId', countryId)
    return next()
}

// Mount-specific middleware for API versioning
const apiVersionMiddleware = async (c: Context, next: Next) => {
    const version = c.req.param('version')

    // Validate API version
    if (!['v1', 'v2'].includes(version)) {
        return c.json({ error: 'Unsupported API version' }, 400)
    }

    c.set('apiVersion', version)
    return next()
}

const app = new App()

app.useMiddleware(
    sessionMiddleware(),
    initializeAuthMiddleware({/* ... */}),
)

await app.init({
    controllersDir: app.isDevelopment ? './app/controller' : undefined,
    controllers: app.isDevelopment ? undefined : controllers,
    staticDir: 'public',

    // NEW: Mount points configuration
    mountPoints: [
        { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
        { pattern: '/api/:version', middleware: apiVersionMiddleware },
    ],
})

// Controllers now available at:
// - /fr/ca/users, /en/us/products (i18n routes)
// - /api/v1/users, /api/v2/products (versioned API)
app.listen(3000)
```

### Controller Example (Unchanged)

```typescript
@Controller('/users')
class UserController {
    @Inject(UserService)
    accessor userService!: UserService

    @Get('/')
    async list(c: Context) {
        // Context values from mount middleware are available
        const locale = c.get('locale') // From i18n middleware
        const apiVersion = c.get('apiVersion') // From API version middleware

        return c.json(await this.userService.findAll())
    }

    @Get('/:id')
    async show(c: Context) {
        const id = c.req.param('id')
        return c.json(await this.userService.findById(id))
    }
}
```

## 📝 Detailed Implementation Steps

### Phase 1: Type Definitions

**Step 1.1: Add MountPoint Interface**

File: `/packages/core/types.ts`

````typescript
import type { Context, Next } from 'hono'

/**
 * Configuration for a single mount point.
 *
 * A mount point defines a URL pattern where the application will be mounted,
 * along with optional middleware for context extraction.
 *
 * @example
 * ```typescript
 * // Internationalization mount point
 * const i18nMount: MountPoint = {
 *     pattern: '/:langId/:countryId',
 *     middleware: async (c, next) => {
 *         const langId = c.req.param('langId')
 *         const countryId = c.req.param('countryId')
 *         c.set('locale', await LocaleService.resolve(langId, countryId))
 *         return next()
 *     }
 * }
 *
 * // API versioning mount point
 * const apiMount: MountPoint = {
 *     pattern: '/api/:version',
 *     middleware: async (c, next) => {
 *         c.set('apiVersion', c.req.param('version'))
 *         return next()
 *     }
 * }
 * ```
 */
export interface MountPoint {
    /**
     * The URL pattern to mount the application on.
     * Supports Hono path parameters (e.g., `:langId`, `:countryId`, `:version`).
     *
     * @example '/:langId/:countryId'
     * @example '/api/:version'
     * @example '/tenant/:tenantId'
     */
    readonly pattern: string

    /**
     * Optional middleware specific to this mount point.
     * Executed before any controller logic for requests matching this pattern.
     *
     * Common use cases:
     * - Extract path parameters and hydrate context (locale, version)
     * - Validate path parameters (language codes, API versions)
     * - Load localized resources or tenant data
     * - Set up request-scoped dependencies
     *
     * @param c - Hono Context object
     * @param next - Next middleware function
     * @returns Promise resolving to void or a Response
     */
    readonly middleware?: (c: Context, next: Next) => Promise<void | Response>
}
````

**Step 1.2: Update AppConfig Interface**

File: `/packages/core/types.ts`

````typescript
export interface AppConfig {
    controllersDir?: string
    staticDir?: string

    /**
     * Configuration for mounting the app on multiple URL patterns.
     *
     * When defined, the application will be accessible under each mount point's pattern.
     * Controllers registered with decorators like `@Get('/users')` will be available
     * under all mount points (e.g., `/:langId/:countryId/users`, `/api/:version/users`).
     *
     * If not defined, the application mounts at root `/` (default behavior).
     *
     * @example
     * ```typescript
     * await app.init({
     *     controllersDir: './app/controller',
     *     staticDir: 'public',
     *     mountPoints: [
     *         { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
     *         { pattern: '/api/:version', middleware: apiVersionMiddleware },
     *     ],
     * })
     * ```
     */
    readonly mountPoints?: readonly MountPoint[]
}
````

**Step 1.3: Export Types**

File: `/packages/core/mod.ts`

```typescript
// Add to existing exports
export type { MountPoint } from './types.ts'
```

### Phase 2: App Class Refactoring

**Step 2.1: Add rootHono Property**

File: `/packages/core/app.ts`

```typescript
import { type Context, Hono, type Next } from 'hono'

export class App {
    /**
     * Public layer Hono instance.
     * Handles mount points, static files, and 404 responses.
     * @internal
     */
    private rootHono = new Hono({ strict: false })

    /**
     * Internal layer Hono instance.
     * Where controllers and business logic are registered.
     * @internal
     */
    private hono = new Hono({ strict: false })

    // ... rest of existing properties
}
```

**Step 2.2: Refactor init() Method**

File: `/packages/core/app.ts`

```typescript
async init(
    config: Module | ModuleWithMiddleware | AppConfig,
): Promise<void> {
    // Step 1: Register named middlewares
    this.registerNamedMiddlewares(config)

    // Step 2: Discover and register error handler
    const errorHandler = await this.discoverErrorHandler(config)
    this.registerErrorHandler(errorHandler)

    // Step 3: Resolve global middlewares
    const globalMiddlewares = this.resolveGlobalMiddlewares(config)
    this.applyGlobalMiddlewares(globalMiddlewares)

    // Step 4: Discover or load controllers
    const controllers = await this.loadControllers(config)

    // Step 5: Register controllers and routes (on internal hono)
    this.routeRegistry.registerControllers(this.hono, controllers)

    // Step 6: Set up mount points (connects rootHono → hono)
    this.setupMountPoints(config)

    // Step 7: Register static file serving (on rootHono, global)
    this.registerStaticFiles(config)

    // Step 8: Register 404 handler (on rootHono, must be last)
    this.registerNotFoundHandler(errorHandler)
}

/**
 * Sets up mount points by connecting rootHono to hono.
 * If no mount points are defined, mounts at root `/`.
 * @internal
 */
private setupMountPoints(
    config: Module | ModuleWithMiddleware | AppConfig,
): void {
    const mountPoints = 'mountPoints' in config ? config.mountPoints : undefined

    if (mountPoints && mountPoints.length > 0) {
        // Mount the internal app under each mount point
        for (const mount of mountPoints) {
            // Apply mount-specific middleware if provided
            if (mount.middleware) {
                this.rootHono.use(`${mount.pattern}/*`, mount.middleware)
            }
            
            // Route all requests under this pattern to internal hono
            this.rootHono.route(mount.pattern, this.hono)
        }
    } else {
        // Default: mount at root when no mount points configured
        this.rootHono.route('/', this.hono)
    }
}
```

**Step 2.3: Update Static Files Registration**

File: `/packages/core/app.ts`

```typescript
/**
 * Register static file serving on the public layer.
 * Static files are global and not affected by mount points.
 * @internal
 */
private registerStaticFiles(
    config: Module | ModuleWithMiddleware | AppConfig,
): void {
    if ('staticDir' in config && config.staticDir) {
        // Register on rootHono so /css, /js, /img work globally
        this.staticFileServer.registerIfConfigured(
            this.rootHono,
            config.staticDir,
        )
    }
}
```

**Step 2.4: Update 404 Handler Registration**

File: `/packages/core/app.ts`

```typescript
/**
 * Register the 404 Not Found handler on the public layer.
 * @internal
 */
private registerNotFoundHandler(): void {
    // Register on rootHono to catch all unmatched routes
    this.rootHono.notFound((c) => {
        return this.errorHandler.handleNotFound(c)
    })
}
```

**Step 2.5: Update listen() Method**

File: `/packages/core/app.ts`

```typescript
/**
 * Start the server and listen on the specified port
 */
listen(port: number): Deno.HttpServer<Deno.NetAddr> {
    // Use rootHono instead of hono for the server
    return this.serverListener.listen(this.rootHono, {
        port,
        version: pkg.version,
    })
}

/**
 * Get the fetch handler for the application
 * Updated to use rootHono for mount point support
 */
public get fetch(): (
    request: Request,
    Env?: any,
    executionContext?: any,
) => Response | Promise<Response> {
    return this.rootHono.fetch.bind(this.rootHono)
}
```

### Phase 3: Testing

**Step 3.1: Unit Tests**

File: `/packages/core/tests/mount_points.test.ts`

```typescript
import { assertEquals, assertExists } from '@std/assert'
import { App } from '../app.ts'
import type { Context, MountPoint, Next } from '../types.ts'
import { Controller, Get } from '../decorators.ts'

// Test controller
@Controller('/users')
class TestController {
    @Get('/')
    list(c: Context) {
        return c.json({ users: [] })
    }
}

Deno.test('App - mounts at root when no mountPoints defined', async () => {
    const app = new App()

    await app.init({
        controllers: [TestController],
    })

    const res = await app.fetch(new Request('http://localhost/users'))
    assertEquals(res.status, 200)
})

Deno.test('App - mounts controllers under each mount point pattern', async () => {
    const app = new App()

    await app.init({
        controllers: [TestController],
        mountPoints: [
            { pattern: '/:langId/:countryId' },
            { pattern: '/api/:version' },
        ],
    })

    // Both mount points should work
    const i18nRes = await app.fetch(new Request('http://localhost/fr/ca/users'))
    assertEquals(i18nRes.status, 200)

    const apiRes = await app.fetch(new Request('http://localhost/api/v1/users'))
    assertEquals(apiRes.status, 200)
})

Deno.test('App - executes mount-specific middleware', async () => {
    let middlewareCalled = false
    let extractedLang: string | undefined
    let extractedCountry: string | undefined

    const i18nMiddleware = async (c: Context, next: Next) => {
        middlewareCalled = true
        extractedLang = c.req.param('langId')
        extractedCountry = c.req.param('countryId')
        c.set('langId', extractedLang)
        c.set('countryId', extractedCountry)
        return next()
    }

    const app = new App()

    await app.init({
        controllers: [TestController],
        mountPoints: [
            { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
        ],
    })

    await app.fetch(new Request('http://localhost/fr/ca/users'))

    assertEquals(middlewareCalled, true)
    assertEquals(extractedLang, 'fr')
    assertEquals(extractedCountry, 'ca')
})

Deno.test('App - static files work globally with mount points', async () => {
    const app = new App()

    await app.init({
        controllers: [TestController],
        staticDir: './public',
        mountPoints: [
            { pattern: '/:langId/:countryId' },
        ],
    })

    // Static files should work at root, not under mount points
    const res = await app.fetch(new Request('http://localhost/css/app.css'))
    // Note: Returns 404 if file doesn't exist, but route should be registered
    assertExists(res)
})

Deno.test('App - 404 handler works with mount points', async () => {
    const app = new App()

    await app.init({
        controllers: [TestController],
        mountPoints: [
            { pattern: '/:langId/:countryId' },
        ],
    })

    // Route outside mount points should return 404
    const res = await app.fetch(
        new Request('http://localhost/nonexistent/route/here'),
    )
    assertEquals(res.status, 404)
})

Deno.test('App - middleware can reject invalid parameters', async () => {
    const i18nMiddleware = async (c: Context, next: Next) => {
        const langId = c.req.param('langId')
        if (!['fr', 'en'].includes(langId)) {
            return c.notFound()
        }
        return next()
    }

    const app = new App()

    await app.init({
        controllers: [TestController],
        mountPoints: [
            { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
        ],
    })

    // Valid language
    const validRes = await app.fetch(
        new Request('http://localhost/fr/ca/users'),
    )
    assertEquals(validRes.status, 200)

    // Invalid language
    const invalidRes = await app.fetch(
        new Request('http://localhost/de/de/users'),
    )
    assertEquals(invalidRes.status, 404)
})
```

## 🔄 API Examples

### Simple Setup (No Mount Points)

```typescript
const app = new App()

await app.init({
    controllers: [UserController],
})

// Controllers available at root: /users, /products
app.listen(3000)
```

### With i18n Mount Points

```typescript
const app = new App()

await app.init({
    controllers: [UserController],
    mountPoints: [
        { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
    ],
})

// Controllers available at: /fr/ca/users, /en/us/products
app.listen(3000)
```

### With API Versioning

```typescript
const app = new App()

await app.init({
    controllers: [UserController],
    mountPoints: [
        { pattern: '/api/:version', middleware: apiVersionMiddleware },
    ],
})

// Controllers available at: /api/v1/users, /api/v2/products
app.listen(3000)
```

### Combined Mount Points

```typescript
const app = new App()

await app.init({
    controllers: [UserController],
    mountPoints: [
        { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
        { pattern: '/api/:version', middleware: apiVersionMiddleware },
    ],
})

// Controllers available at both:
// - /fr/ca/users (i18n)
// - /api/v1/users (versioned API)
app.listen(3000)
```

## 📚 Documentation Updates Checklist

### Core Documentation

- [ ] Update `/GEMINI.md` with dual-layer architecture
- [ ] Update `/packages/core/README.md` with MountPoint API
- [ ] Add JSDoc comments to all public APIs

### User Documentation (Web Docs)

- [ ] Update `/app/view/pages/docs/content/routing.md` with multi-mount section
- [ ] Add code examples for i18n and API versioning use cases
- [ ] Add troubleshooting section for common issues

### LLM Documentation

- [ ] Create `/public/llms/core-routing.txt`
- [ ] Update `/public/llms/full.txt` with routing section
- [ ] Include concise examples and patterns

## 🧪 Testing Strategy

### Unit Tests

- [ ] Test mount at root when no `mountPoints` defined
- [ ] Test controllers available under each mount point
- [ ] Test mount-specific middleware execution
- [ ] Test path parameter extraction in middleware
- [ ] Test static files work globally
- [ ] Test 404 handler works with mount points

### Integration Tests

- [ ] Test full request lifecycle through mount points
- [ ] Test context values set by middleware accessible in controllers
- [ ] Test multiple mount points with different middleware (i18n + API
      versioning)

### Manual Testing

- [ ] Test in development mode (`deno task dev`)
- [ ] Test with existing apps (no `mountPoints`)
- [ ] Test with i18n configuration (`/:langId/:countryId`)
- [ ] Test with API versioning configuration (`/api/:version`)
- [ ] Test static assets and 404 pages

## 🔍 Quality Checks

```bash
# Type check modified files
deno check packages/core/types.ts packages/core/app.ts

# Lint modified files
deno lint packages/core/

# Run tests
deno test packages/core/tests/
```

**Before marking task complete:**

- ✅ `deno check` passes on modified files
- ✅ `deno lint` passes on modified files
- ✅ `deno test` passes with 100% success rate

## ✅ Definition of Done

- [ ] `MountPoint` interface created in types.ts
- [ ] `AppConfig.mountPoints` property added
- [ ] `App.rootHono` private property added
- [ ] `setupMountPoints()` method implemented
- [ ] `registerStaticFiles()` uses rootHono
- [ ] `registerNotFoundHandler()` uses rootHono
- [ ] `listen()` uses rootHono.fetch
- [ ] Types exported from mod.ts
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] Default behavior (no mountPoints) verified
- [ ] Documentation updated
- [ ] JSDoc comments complete
- [ ] `deno check` passes
- [ ] `deno lint` passes
- [ ] Manual testing completed

## 🔗 Related Tasks

- Controller discovery system (`/packages/core/controller_discovery.ts`)
- Router implementation (`/packages/core/router.ts`)
- Middleware resolver (`/packages/core/middleware_resolver.ts`)

## 📅 Timeline

- **Estimated Effort**: 6-8 hours
- **Complexity**: Medium-High

## 📝 Notes

### Design Decisions

1. **Dual Layer vs Single Layer**: Chosen to maintain separation between URL
   pattern matching and business logic routing
2. **Mount-specific middleware**: Allows flexible context extraction (i18n
   params, API version) without modifying controllers
3. **Static files on rootHono**: Assets should be global, not duplicated under
   each mount point
4. **Default behavior**: Empty/undefined `mountPoints` mounts at root `/` for
   simplicity

### Performance Considerations

- Each mount point adds a route to rootHono (minimal overhead)
- Middleware executes once per request per mount point
- No additional memory per mount point beyond route registration

### Security Considerations

- Mount-specific middleware should validate path parameters (e.g., valid
  language codes, API versions)
- Consider rate limiting per mount point for different API versions
- Ensure proper locale validation to prevent injection attacks

### Future Enhancements

- Hot-reload mount points without restart
- Mount point health checks
- Per-mount-point rate limiting configuration
- Nested mount points (mount point within mount point)
- Automatic locale detection and redirect middleware

---

_Task created: 2025-01-20_
