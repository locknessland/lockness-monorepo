# @lockness/core

The heart of the Lockness framework. This package provides the core
architectural components, decorators, and routing engine that power your MVC
application.

## 📦 Features

- **MVC Engine**: Class-based architecture for clean separation of concerns.
- **Modern Decorators**: Native support for TC39 Stage 3 decorators.
- **Powerful Routing**: Built on top of Hono, providing zero-configuration
  controller discovery.
- **Dependency Injection**: A built-in IoC container for service management.
- **Zod Validation**: Seamless integration with Zod for type-safe request
  validation.
- **Named Routes**: Generate URLs dynamically without hardcoding paths.
- **JSX Everywhere**: Native support for JSX components in views.

## 🚀 Getting Started

### Create a New Project

```bash
deno run -A jsr:@lockness/init project-name
```

This scaffolds a complete Lockness application with MVC structure, ready to run.

### Manual Setup

### The App Class

The `App` class is the main entry point for your application. It manages the
Hono instance and initializes all your modules.

```typescript
import { App } from 'lockness/core'

const app = new App()

// Configure middlewares using fluent API
app.useMiddleware(LoggerMiddleware)

await app.init({
    controllersDir: './app/controller',
})

app.listen(8888)
```

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
```

### Using Named Routes

You can generate URLs for any named route using the `route()` helper.

```typescript
import { route } from 'lockness/core'

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

### Request Validation

Use the `@Validate` decorator to ensure incoming data matches your Zod schemas.

```typescript
const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
})

@Controller('/users')
export class UserController {
    @Post('/')
    @Validate('json', createUserSchema)
    async store(c: Context) {
        const data = c.req.valid('json')
        // data is typed and validated!
    }
}
```

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
- `@Validate(target, schema)`: Validates request data (json, form, query, param,
  header, cookie).
- `@Service()`: Declares a class as a service.
- `@Inject(class)`: Injects a service into a property.

### Context

The `Context` object (from Hono) is passed to every route handler and provides
access to request data, response helpers, and validation results.

---

Built with ❤️ for the Deno ecosystem.
