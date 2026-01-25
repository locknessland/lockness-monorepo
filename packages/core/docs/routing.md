# Routing & Controllers

## Controllers with Decorators

Lockness uses class-based controllers with decorators for clean, expressive
routing:

```typescript
import { Context, Controller, Delete, Get, Post, Put } from '@lockness/core'

@Controller('/api/users')
export class UserController {
    @Get('/')
    async index(c: Context) {
        return c.json({ users: [] })
    }

    @Get('/:id')
    async show(c: Context) {
        const id = c.req.param('id')
        return c.json({ id })
    }

    @Post('/')
    async store(c: Context) {
        const body = await c.req.json()
        return c.json(body, 201)
    }

    @Put('/:id')
    async update(c: Context) {
        return c.json({ updated: true })
    }

    @Delete('/:id')
    async destroy(c: Context) {
        return c.json({ deleted: true })
    }
}
```

## Available HTTP Methods

- `@Get`
- `@Post`
- `@Put`
- `@Delete`
- `@Patch`
- `@Options`
- `@Head`

## Middleware Composition

The `@ComposeMiddleware` decorator allows you to apply multiple middlewares to a
route method in a single, clean declaration. It supports Hono functions,
Lockness classes, and named middlewares.

```typescript
import { ComposeMiddleware, cors, logger } from '@lockness/core'

@Controller('/api')
export class ApiController {
    @Get('/users')
    @ComposeMiddleware(logger(), AuthMiddleware, 'admin')
    users(c: Context) {
        return c.json({ users: [] })
    }
}
```

This is the recommended way to apply multiple middlewares to a single route, as
it's more concise than using multiple `@UseMiddleware` decorators.

## Dependency Injection

Controllers support automatic dependency injection:

```typescript
@Controller('/api/posts')
export class PostController {
    constructor(
        private postService: PostService,
        private postRepository: PostRepository,
    ) {}

    @Get('/')
    async index(c: Context) {
        const posts = await this.postRepository.findAll()
        return c.json({ posts })
    }
}
```

## Quick Scaffolding

Generate controllers quickly with the CLI:

```bash
# API controller (JSON responses)
deno task cli make:controller User

# Web controller (renders JSX views)
deno task cli make:controller User --view
```

## Adding Actions to Controllers

Add new actions (methods) to existing controllers:

```bash
# Basic action
deno task cli make:action User show

# With specific HTTP method
deno task cli make:action User store --method=post
deno task cli make:action User update --method=put
deno task cli make:action User destroy --method=delete

# With view rendering
deno task cli make:action User create --view
```

The command automatically:

- Adds the method to your controller class
- Follows RESTful conventions for common action names
- Imports required decorators (@Post, @Put, etc.)
- Generates appropriate route paths and names
- Creates views when using `--view` flag

**RESTful Conventions:**

| Action  | Method | Path      | Route Name       |
| ------- | ------ | --------- | ---------------- |
| index   | GET    | /         | resource.index   |
| show    | GET    | /:id      | resource.show    |
| create  | GET    | /create   | resource.create  |
| store   | POST   | /         | resource.store   |
| edit    | GET    | /:id/edit | resource.edit    |
| update  | PUT    | /:id      | resource.update  |
| destroy | DELETE | /:id      | resource.destroy |

## Named Routes

Named routes allow you to generate URLs for specific routes using a unique name.
This prevents hardcoding paths throughout your application and makes it easier
to change URLs later.

### Assigning Names

You can assign a name to a route using the options object in the route
decorator:

```typescript
@Controller('/users')
export class UserController {
    @Get('/:id', { name: 'users.show' })
    async show(c: Context) { ... }
}
```

### File Extension Routes

The `extension` option allows you to create routes that match file extensions
while automatically stripping the extension from parameters. This is perfect for
serving static-like content (RSS feeds, sitemaps, documentation files, etc.).

```typescript
@Controller('/llms')
export class LlmController {
    @Get('/:name', { extension: '.txt' })
    async serve(c: Context) {
        // URL: /llms/installation.txt
        const name = c.req.param('name') // 'installation' (not 'installation.txt')
        return c.text(await loadDoc(name))
    }
}
```

**How it works:**

1. The decorator transforms `/:name` to a Hono regex pattern `/:name{.+\.txt}`
2. The framework automatically strips the extension from all route parameters
3. Your handler receives clean parameter values

**Supported extensions (with autocompletion):**

- **Text**: `.txt`, `.md`, `.html`, `.xml`, `.csv`
- **Data**: `.json`, `.yaml`, `.yml`, `.toml`
- **Code**: `.js`, `.ts`, `.jsx`, `.tsx`, `.css`
- **Images**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`
- **Feeds**: `.rss`, `.atom`
- **Custom**: Any `.{extension}` format

```typescript
// RSS feed
@Get('/:category', { extension: '.rss' })
async feed(c: Context) {
    const category = c.req.param('category')
    return c.body(generateRSS(category), { headers: { 'Content-Type': 'application/rss+xml' }})
}

// JSON API with explicit extension
@Get('/:resource', { extension: '.json' })
async api(c: Context) {
    const resource = c.req.param('resource')
    return c.json(await loadResource(resource))
}
```

### Generating URLs

Use the `route()` helper to generate a URL from a route name:

```typescript
import { route } from '@lockness/core'

// Simple route
const url = route('users.index') // "/users"

// With parameters
const url = route('users.show', { id: 123 }) // "/users/123"
```

In a controller redirect:

```typescript
return c.redirect(route('auth.login'))
```

## Display All Routes

Use the `router:list` command to see all registered routes in your application:

```bash
deno task cli router:list
```

This displays a formatted table with:

- **METHOD**: HTTP method (color-coded by type)
- **PATH**: Route path with parameters
- **CONTROLLER**: Controller class name
- **ACTION**: Method name
- **MIDDLEWARES**: Applied middlewares (decorators and named)

Example output:

```bash
📋 Registered Routes (11 total)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ METHOD ┃ PATH           ┃ NAME        ┃ CONTROLLER      ┃ ACTION  ┃ MIDDLEWARES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ GET    ┃ /              ┃ home        ┃ AppController   ┃ index   ┃ -
┃ POST   ┃ /api/users     ┃ users.store ┃ UserController  ┃ create  ┃ @Auth, @Validate
┃ GET    ┃ /api/users/:id ┃ users.show  ┃ UserController  ┃ show    ┃ auth
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

> **💡 Tip:** HTTP methods are color-coded in the terminal (GET=green,
> POST=yellow, PUT=blue, DELETE=red) for easy visual scanning.
