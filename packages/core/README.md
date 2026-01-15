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

#### 2. Create Application Kernel

```typescript
// app/kernel.tsx
import { App } from '@lockness/core'

export const bootstrap = async () => {
    const app = new App()

    await app.init({
        controllersDir: './app/controller',
        staticDir: 'public',
    })

    return app
}
```

#### 3. Start Your App

```typescript
// main.ts
import { bootstrap } from './app/kernel.tsx'

const app = await bootstrap()

Deno.serve({ port: 8888 }, app.fetch)
```

### Add Optional Features

#### Sessions (for web apps)

```typescript
import { App } from '@lockness/core'
import { configureSession, sessionMiddleware } from '@lockness/session'

const app = new App()
configureSession({ driver: 'cookie', secret: 'your-secret' })
app.useMiddleware(sessionMiddleware())
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
`app/view/pages/errors/error_handler.tsx`. If found, it's used automatically.

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
app.use('/api/*', jwt({ secret: 'jwt-secret' }))
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
[Middleware Documentation](https://lockness.dev/docs/middleware).

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
- `staticDir`: Directory for serving static files.
- `middlewares`: Named middlewares for use with `@Use('name')`.
- Note: `globalMiddlewares` and `errorHandler` are now configured via fluent API

## 📚 Technical Reference

### Internal Architecture

The `@lockness/core` package is built with maintainability and SOLID principles
in mind. The framework is composed of focused, single-responsibility components:

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

- `@Controller(path)`: Declares a class as a controller.
- `@Get(path, options)`: Registers a GET route.
- `@Post(path, options)`: Registers a POST route.
- `@Put(path, options)`: Registers a PUT route.
- `@Patch(path, options)`: Registers a PATCH route.
- `@Delete(path, options)`: Registers a DELETE route.
- `@Use(middleware)`: Applies middleware to a class or method.
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
