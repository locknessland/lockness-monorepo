# @lockness/core

The heart of the Lockness framework. This package provides the essential
framework components: MVC architecture, dependency injection, and complete Hono
integration.

> **✨ Minimal Core**: `@lockness/core` includes only essentials. Optional
> features like sessions, queues, and cache systems are separate packages
> imported explicitly when needed.

## 📦 What's Included

### Framework Core

- **MVC Engine**: Class-based architecture for clean separation of concerns
- **Modern Decorators**: Native TC39 Stage 3 decorator support (`@Controller`,
  `@Get`, `@Service`, etc.)
- **Powerful Routing**: Zero-configuration controller discovery
- **Dependency Injection**: Built-in IoC container (`@Inject`, `@Service`)
- **JSX Support**: Native JSX runtime for views and components
- **Named Routes**: Dynamic URL generation

### Complete Hono Integration

All Hono middleware and utilities (61+ exports) included:

- **HTTP Middleware**: `logger`, `cors`, `compress`, `etag`, `csrf`,
  `secureHeaders`
- **Authentication**: `basicAuth`, `bearerAuth`, `jwt`, `jwk`
- **Caching & Timing**: `cache` (HTTP caching), `timeout`, `timing`
- **Client & Testing**: `hc`, `testClient`
- **Utilities**: `getCookie`, `setCookie`, `html`, `css`, `streamSSE`
- And many more...

### What's NOT Included (Optional Packages)

- `@lockness/validator` - Request validation with `@Validate` decorator (Zod
  integration)
- `@lockness/session` - Session management (for web apps)
- `@lockness/queue` - Background job processing
- `@lockness/cache` - Application-level caching system (Note: Hono's HTTP
  `cache` middleware is included in core)
- `@lockness/logger` - Structured logging (Note: Hono's request `logger`
  middleware is included in core)
- `@lockness/mail` - Email sending
- `@lockness/storage` - File storage
- `@lockness/auth` - Authentication system

Import these packages explicitly when needed.

## 🚀 Getting Started

### Create a New Project

```bash
deno run -A jsr:@lockness/cli init project-name
```

This scaffolds a minimal Lockness application with only `@lockness/core`
dependency.

### Manual Setup

#### 1. Install Core Package

```bash
# In deno.json
{
  "imports": {
    "@lockness/core": "jsr:@lockness/core@^0.1.0"
  }
}
```

#### 2. Create Application Kernel (Declarative)

```typescript
// app/kernel.ts
import { createApp, DeclareGlobalMiddleware, Kernel } from '@lockness/core'
import { controllers } from './routes.ts'

@Kernel({
    staticDir: 'public',
    controllersDir: './app/controller',
    controllers: controllers,
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares: unknown[] = []
}
```

#### 3. Start Your App

```typescript
// main.ts
import { createApp } from '@lockness/core'
import { AppKernel } from './app/kernel.ts'

const app = await createApp(AppKernel)

Deno.serve({ port: 8888 }, app.fetch)
```

### Add Optional Features

#### Sessions (for web apps)

```typescript
// In your kernel
import { sessionMiddleware } from '@lockness/session'

@Kernel({
    session: {
        driver: 'cookie',
        secret: Deno.env.get('APP_KEY'),
        lifetime: 7200,
    },
    // ... other options
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        sessionMiddleware(),
    ]
}
```

#### Background Jobs

```typescript
import { configureQueue, registerJob } from '@lockness/queue'

configureQueue({ driver: 'deno-kv' })
registerJob('send-email', SendEmailJob)
```

## 📚 Core Concepts

### The App Class

The `App` class is the main orchestrator of your application:

```typescript
import { App } from '@lockness/core'

const app = new App()

await app.init({
    controllersDir: './app/controller',
})

Deno.serve({ port: 8888 }, app.fetch)
```

````
### Routing with Decorators

Routes are defined using decorators on class methods.

```typescript
@Controller('/users')
export class UserController {
    @Get('/', { name: 'users.index' })
    index(c: Context) {
        return c.json({ users: [] })
    }

    @Get('/:id', { name: 'users.show' })
    show(c: Context) {
        const id = c.req.param('id')
        return c.json({ id })
    }
}
````

### Using Named Routes

You can generate URLs for any named route using the `route()` helper.

```typescript
import { route } from '@lockness/core'

const url = route('users.show', { id: 123 }) // "/users/123"
```

### Dependency Injection

Register services with `@Service()` and inject them into controllers or other
services using `@Inject()`.

```typescript
@Service()
export class UserService {
    async find(id: number) { ... }
}

@Controller('/users')
export class UserController {
    @Inject(UserService)
    accessor userService!: UserService

    @Get('/:id')
    async show(c: Context) {
        const user = await this.userService.find(Number(c.req.param('id')))
        return c.json(user)
    }
}
```

### Error Handling

Lockness automatically discovers custom error handlers without requiring manual
registration.

**Auto-Discovery:**

The framework checks for a custom error handler at
`app/view/pages/errors/error_handler.tsx`. If found, it's used automatically. If
the file exists but fails to load, or exports no `errorHandler` function, the
default pages are used and the failure is logged (an error on a failed import, a
warning on a missing export); an absent file stays silent.

**Creating Custom Error Pages:**

```bash
deno task cli make:error-pages
```

**Using Built-in Error Formatting:**

```typescript
import { Context, formatErrorForConsole, HTTPException } from '@lockness/core'

export function errorHandler(error: Error, c: Context) {
    const status = error instanceof HTTPException ? error.status : 500

    // Clean console output with appropriate detail level
    formatErrorForConsole(error, status, c.req.path, {
        showStackTrace: status >= 500,
    })

    // Return appropriate error page
    return c.html(<ErrorPage />, status)
}
```

**Default Error Handler:**

If no custom handler exists, the framework provides elegant default error pages
with inline CSS (no framework dependencies).

### Middleware & Utilities

`@lockness/core` provides access to all Hono middleware and utilities through a
unified import. No need to import from separate packages!

#### Authentication

```typescript
import { basicAuth, bearerAuth, jwt } from '@lockness/core'

// HTTP Basic Authentication
app.use('/admin/*', basicAuth({ username: 'admin', password: 'secret' }))

// Bearer Token Authentication
app.use('/api/*', bearerAuth({ token: 'secret-token' }))

// JWT Authentication
app.use('/api/*', jwt({ secret: Deno.env.get('APP_KEY')! }))
```

#### Security

```typescript
import { cors, csrf, secureHeaders } from '@lockness/core'

// CORS configuration
app.use('*', cors({ origin: 'https://example.com' }))

// CSRF protection
app.use('*', csrf())

// Security headers
app.use('*', secureHeaders())
```

#### Content Processing

```typescript
import { compress, etag, prettyJSON } from '@lockness/core'

// Response compression
app.use('*', compress())

// ETag generation
app.use('*', etag())

// Pretty JSON formatting
app.use('*', prettyJSON())
```

#### Request Handling

```typescript
import { bodyLimit, logger, requestId } from '@lockness/core'

// Request logging
app.use('*', logger())

// Body size limits
app.use('*', bodyLimit({ maxSize: 50 * 1024 }))

// Request ID generation
app.use('*', requestId())
```

#### Complete Example

```typescript
import {
    App,
    basicAuth,
    compress,
    cors,
    csrf,
    logger,
    secureHeaders,
} from '@lockness/core'

const app = new App()

app
    .useMiddleware(
        logger(),
        cors(),
        csrf(),
        secureHeaders(),
        compress(),
    )
    .useMiddleware(basicAuth({ username: 'admin', password: 'secret' }))

await app.init({ controllersDir: './app/controller' })

Deno.serve({ port: 8888 }, app.fetch)
```

For a complete list of available middleware and utilities, see the
[Middleware Documentation](https://lockness.land/docs/middleware).

## 🛠 Advanced Configuration

### Fluent API

The `App` class provides a fluent API for configuration:

```typescript
const app = new App()

app
    .useMiddleware(sessionMiddleware(), LoggerMiddleware)
    .useErrorHandler(errorHandler)

await app.init({ controllersDir: './app/controller' })
```

### Available Methods

- `app.useMiddleware(...middlewares)`: Add global middlewares (applied to all
  routes)
- `app.useErrorHandler(handler)`: Set custom error handler (optional -
  auto-discovers `app/view/pages/errors/error_handler.tsx` if present)
- `app.isDevelopment`: Check if running in development mode
- `app.isProduction`: Check if running in production mode

### Init Configuration

The `app.init()` method accepts a configuration object:

- `controllers`: Array of controller classes (for production/compilation).
- `controllersDir`: Directory for auto-discovery (for development).
- `middlewaresDir`: Directory for auto-discovering `@DeclareMiddleware`
  decorated classes.
- `staticDir`: Directory for serving static files.
- `mountPoint`: A single mount point — one pattern the app is additionally
  mounted under (i18n, API versioning, multi-tenancy). Singular: one only.
- `middlewares`: Named middlewares (legacy, prefer `@DeclareMiddleware`).
- Note: `globalMiddlewares` and `errorHandler` are now configured via fluent API

### Mount Point Routing

A mount point serves the same controllers under an additional URL prefix,
enabling internationalization, API versioning, or multi-tenancy.

**Constrain your params.** An open `/:langId/:countryId` matches _any_ two
leading segments, so `/.well-known/appspecific/com.chrome.devtools.json` is
handed to your locale middleware as `langId=".well-known"`. Build the pattern
with `constrainedParam` instead of writing it as a literal — Lockness warns at
boot if a mount gates traffic through an unconstrained param.

#### Basic Usage

```typescript
import { App, type Context, type Next } from '@lockness/core'

const app = new App()

import { constrainedParam } from '@lockness/core'

const validLanguages = ['en', 'fr'] as const
const validCountries = ['us', 'ca'] as const

await app.init({
    controllersDir: './app/controller',
    staticDir: 'public',
    mountPoint: {
        pattern: `/${constrainedParam('langId', validLanguages)}/${
            constrainedParam('countryId', validCountries)
        }`,
    },
})

// Controllers now accessible at:
// - /users        (root, no locale context)
// - /fr/ca/users  (under the mount)
// - /zz/zz/users  404 — the constraint rejects it at the router
```

#### Mount Point Interface

```typescript
interface MountPoint {
    /** URL pattern with Hono path parameters */
    readonly pattern: string
    /** Optional middleware for context extraction/validation */
    readonly middleware?: (c: Context, next: Next) => Promise<void | Response>
}
```

#### With Middleware (i18n Example)

```typescript
const i18nMiddleware = async (c: Context, next: Next) => {
    const langId = c.req.param('langId')
    const countryId = c.req.param('countryId')

    // Validate locale
    const locale = await LocaleService.resolve(langId, countryId)
    if (!locale) {
        return c.notFound()
    }

    // Set context for controllers
    c.set('locale', locale)
    c.set('langId', langId)
    c.set('countryId', countryId)

    return next()
}

await app.init({
    controllersDir: './app/controller',
    mountPoint: {
        pattern: `/${constrainedParam('langId', validLanguages)}/${
            constrainedParam('countryId', validCountries)
        }`,
        middleware: i18nMiddleware,
    },
})
```

#### API Versioning Example

```typescript
const apiVersionMiddleware = async (c: Context, next: Next) => {
    const version = c.req.param('version')

    // Validate version
    if (!['v1', 'v2', 'v3'].includes(version)) {
        return c.json({ error: 'Unsupported API version' }, 400)
    }

    c.set('apiVersion', version)
    return next()
}

await app.init({
    controllersDir: './app/controller',
    mountPoint: {
        pattern: `/api/${constrainedParam('version', ['v1', 'v2', 'v3'])}`,
        middleware: apiVersionMiddleware,
    },
})
```

#### Accessing Mount Context in Controllers

```typescript
@Controller('/users')
export class UserController {
    @Get('/')
    async list(c: Context) {
        // Access values set by mount middleware
        const locale = c.get('locale') // From i18n middleware
        const version = c.get('apiVersion') // From API version middleware

        return c.json({ users: [], locale, version })
    }
}
```

#### Key Features

- **Zero Controller Changes**: Controllers work under all mount points
  automatically
- **Context Extraction**: Mount middleware can extract/validate path parameters
- **One Mount Point**: `mountPoint` is singular — the app is mounted at root and
  under **one** additional pattern
- **Static Files**: Served globally, not under mount points
- **Default Behavior**: Omitting `mountPoint` mounts at root `/` (backward
  compatible)

#### Common Use Cases

1. **Internationalization**: `/en/us/products`, `/fr/ca/products`
2. **API Versioning**: `/api/v1/users`, `/api/v2/users`
3. **Multi-Tenancy**: `/tenant/:tenantId/dashboard`
4. **Hybrid Apps**: Web UI at `/:lang/:region/*` and API at `/api/:version/*`

## Upgrading to v0.5.0

Seven items. **Migration step:** for every optional feature your `@Kernel()`
configures, make sure the package is in your `deno.json`; add `telemetry: true`
and `logger: true` if you relied on those packages switching on by presence;
give a `schedulerLock` with `driver: 'redis'` its `redis` connection; and fix or
delete any listener or schedule file that fails to load.

### 1. A configured optional package that does not resolve refuses the boot

Until v0.5.0, a kernel key whose package the app did not declare printed
`⚠️  @lockness/cache not found - skipping cache setup` and the app ran without
the feature — no cache, no session, or, behind
`schedulerLock: { driver: 'redis' }`, no lock at all, so every replica ran each
`onOneServer` task (#505). `createApp()` now refuses instead, with a
`MissingOptionalPackageError` (exported from `@lockness/core`):

```text
@lockness/cache is configured but not installed: the kernel sets `cache`, and "@lockness/cache" does not resolve from this application.
Fix: deno add jsr:@lockness/cache (same version as @lockness/core), or remove `cache` from @Kernel().
```

- **The keys and their packages:** `database` → `@lockness/drizzle`, `session` →
  `@lockness/session`, `cache` → `@lockness/cache`, `i18n` → `@lockness/i18n`,
  `devtools` → `@lockness/devtools` (development only), `telemetry` →
  `@lockness/telemetry`, `logger` → `@lockness/logger`, and
  `schedulerLock.driver 'redis'` → `@lockness/redis`.
- **Unchanged:** a key you do not set imports nothing and prints nothing — the
  "not found - skipping" line is gone in both directions. A package that
  resolves but throws while loading is rethrown as itself, not renamed.
- **The fix:** `deno add jsr:<package>` at your `@lockness/core` version, or
  remove the key from `@Kernel()` (and from `config/mod.ts` if it comes from
  there).

### 2. `@lockness/telemetry` and `@lockness/logger` need a kernel key

Both used to switch on because the package resolved from the app's import map:
adding `@lockness/telemetry` for any reason installed the tracing middleware,
and adding `@lockness/logger` rewired scheduled-task failures to it. Since
v0.5.0 core imports an optional package only when the kernel names it.

```diff
 @Kernel({
     // …
+    telemetry: true, // request spans; still a no-op unless OTEL_DENO is set
+    logger: true,    // scheduler failures go to logger(), not console.error
 })
```

An application that installs its own scheduler reporter keeps it either way;
`logger: true` without `@lockness/logger` declared refuses the boot (item 1).

### 3. `KernelBooted` now fires in a JSR-installed app

Core loaded `@lockness/events` through a variable specifier that resolved
against the _application's_ import map. An app installed from JSR does not map
`@lockness/events`, so `KernelBooted` never fired there — while every workspace
test saw it fire. It is now imported statically. **No step is required**, but a
`KernelBooted` listener you wrote and never saw run will start running at boot.

### 4. A `schedulerLock` that cannot install a lock refuses the boot

`schedulerLock: { driver: 'redis' }` with no `redis` connection matched no
branch at boot: no lock was installed, nothing was logged, and every replica ran
each `onOneServer` task (#517). An unrecognised `driver` did the same.

- **Compile time:** `schedulerLock` is now a union on `driver`. The `'redis'`
  member requires `redis`, and the `'deno-kv'` member no longer accepts it, so a
  kernel that sets either wrongly stops compiling.
- **Boot:** a config the type cannot see — plain JS, or one built from `any` —
  throws a `TypeError` from `createApp()` naming `schedulerLock.redis`, or the
  unrecognised `schedulerLock.driver`.
- **The fix:** add the connection (`redis: { hostname: '127.0.0.1' }`), switch
  to `driver: 'deno-kv'`, or remove `schedulerLock`. Drop a stray `redis` block
  from a `'deno-kv'` config.

### 5. A listener file that fails to load refuses the boot

Discovery imports every file under `listenersDir` before it registers any. So
one listener that imported an unresolvable specifier, failed to compile or threw
while loading dropped **every** directory listener, and the explicit `listeners`
too. The boot logged it, or printed nothing at all, and carried on (#518).
`createApp()` now rejects with a `ListenerLoadError` naming the file:

```text
ListenerLoadError: Listener file "app/listener/audit_listener.ts" could not be loaded, so no listener was registered: …
```

- **Unchanged:** a missing `listenersDir` boots silently, and the explicit
  `listeners` still register.
- **The fix:** repair the file named in the error. If your app booted with
  `⚠️  Error discovering listeners:` in its log, a listener file was already
  broken, and no directory or explicit listener ran.

### 6. A schedule file that fails to load always refuses the boot

A schedule file that did not resolve, compile or evaluate already failed the
boot, with whatever the import threw. One case did not: a module that threw
`Deno.errors.NotFound` while it loaded, such as a top-level read of a missing
config file, passed for a missing `schedulesDir`. The boot carried on without a
log line, minus that file's tasks and those of every file scanned after it
(#521). `createApp()` now rejects with a `ScheduleLoadError` naming the file in
every case:

```text
ScheduleLoadError: Schedule file "app/schedule/purge_tokens.ts" could not be loaded, so no scheduled task was started: NotFound [ENOENT]: …
```

- **Unchanged:** a missing `schedulesDir` boots silently, and the explicit
  `schedules` still register. A duplicate task name keeps its own error.
- **Changed for every load failure:** the error is a `ScheduleLoadError`, not
  whatever the import threw (a `TypeError`, an `AppFileCompileError`, or the
  module's own error). The original is rendered on one line with credentials
  redacted, and there is no `cause`.
- **The fix:** repair the file named in the error. If your `✓ Scheduler started`
  line counted fewer tasks than you declared, a schedule file was already being
  dropped.

### 7. `declaredMiddlewares` is filled at order 550 instead of 400

`middlewaresDir` was discovered twice per boot: by a bootstrap step at order
400, and again by `App.init` at order 550, so a broken middleware file was
imported and logged twice (#479). The order-400 step is gone; `App.init` is the
one owner, as it already was for an app booted without a kernel. **No step is
required** unless your code reads `declaredMiddlewares` during the boot:
listener registration (410) or a `KernelBooted` listener (500) now finds it
empty. Read it after `createApp()` returns.

## 📚 Technical Reference

### Internal Architecture

The `@lockness/core` package is built with maintainability and SOLID principles
in mind. The framework is composed of focused, single-responsibility components:

#### Dual-Layer Routing Architecture

The framework uses a dual-layer routing architecture to enable mount points:

```
┌─────────────────────────────────────────────────────────────────┐
│  rootHono (Public Layer)                                         │
│  ├── Mount Point: /:langId{(?:en|fr)}/:countryId{(?:us|ca)}/*   │
│  ├── Mount-specific middleware (i18n, versioning, etc.)         │
│  ├── Static Files (/css, /js, /img) - served globally           │
│  └── 404 Not Found Handler                                      │
├─────────────────────────────────────────────────────────────────┤
│  hono (Internal Layer)                                           │
│  ├── Controllers registered here                                │
│  ├── Business logic and route handlers                          │
│  └── Available under ALL mount points                           │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**

- **Separation of Concerns**: URL pattern matching (public) vs business logic
  (internal)
- **DRY Principle**: Controllers defined once, work under all mount points
- **Flexibility**: Easy to add/remove mount points without touching controllers

#### Core Components

- **App**: Main orchestrator that coordinates all framework components
- **MiddlewareResolver**: Resolves middleware from classes, functions, and named
  strings
- **ControllerDiscovery**: Scans directories and discovers controller classes
- **RouteRegistry**: Manages route registration, sorting, and Hono integration
- **ErrorHandlerRegistry**: Auto-discovers and manages error handlers
- **StaticFileServer**: Handles static file serving configuration
- **ServerListener**: Manages server startup, port conflicts, and console output

#### Design Principles

- **Single Responsibility**: Each component has one clear purpose
- **Dependency Injection**: Components are injected where needed
- **Backward Compatibility**: Public API remains stable across refactoring
- **Testability**: Focused components enable isolated unit testing

### Decorators

**Kernel Configuration:**

- `@Kernel(config)`: Declares a class as the application kernel with
  configuration (database, session, devtools, controllers, middlewares).
- `@DeclareGlobalMiddleware()`: Marks a property as the global middleware stack.
- `@OnBoot(options)`: Marks a method to run during application bootstrap
  (supports priority ordering).

**Routing:**

- `@Controller(path)`: Declares a class as a controller.
- `@Get(path, options)`: Registers a GET route.
- `@Post(path, options)`: Registers a POST route.
- `@Put(path, options)`: Registers a PUT route.
- `@Patch(path, options)`: Registers a PATCH route.
- `@Delete(path, options)`: Registers a DELETE route.

**Middleware:**

- `@DeclareMiddleware(name)`: Registers a middleware class with a name for
  auto-discovery.
- `@UseMiddleware(middleware)`: Applies middleware to a route method (accepts
  name or class).
- `@Use(middleware)`: _(Deprecated)_ Use `@UseMiddleware` instead.

**Rate limiting:**

- `@Throttle(limit, window, options?)`: Limits how often a route may be called.
  Applies to a controller class or a single method; a method-level rule
  **replaces** the controller-level one rather than stacking with it.
- `@ThrottleLogin()`: Preset — 5 requests per minute, for credential checks.
- `@ThrottleSensitive()`: Preset — 3 per hour, for destructive operations.
- `@ThrottleApi()`: Preset — 100 per minute, for general API traffic.
- `@ThrottleHeavy()`: Preset — 10 per minute, for expensive handlers.

See [docs/throttling.md](docs/throttling.md) for windows, client identification
and the 429 response.

**Dependency Injection:**

- `@Service()`: Declares a class as a service.
- `@Inject(class)`: Injects a service into a property.

> **Note**: For request validation with the `@Validate` decorator, use
> `@lockness/validator` package. This keeps the core package minimal and makes
> validation opt-in.

### Context

The `Context` object (from Hono) is passed to every route handler and provides
access to request data, response helpers, and validation results.

---

Built with ❤️ for the Deno ecosystem.
