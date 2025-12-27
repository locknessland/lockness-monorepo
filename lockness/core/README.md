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

### The App Class

The `App` class is the main entry point for your application. It manages the
Hono instance and initializes all your modules.

```typescript
import { App } from 'lockness'

const app = new App()

await app.init({
    controllersDir: './src/controller',
    globalMiddlewares: [LoggerMiddleware],
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
import { route } from 'lockness'

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

The `app.init()` method accepts a configuration object to customize your
application:

- `controllers`: Array of controller classes (for production/compilation).
- `controllersDir`: Directory for auto-discovery (for development).
- `globalMiddlewares`: Middlewares applied to every route.
- `middlewares`: Named middlewares for use with `@Use('name')`.
- `modules`: Additional Lockness modules to load.
- `errorHandler`: Custom function for handling application errors.
- `notFoundHandler`: Custom function for handling 404s.

## 📚 Technical Reference

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
