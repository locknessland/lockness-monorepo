# Routing & Controllers

## Controllers with Decorators

Lockness uses class-based controllers with decorators for clean, expressive
routing:

```typescript
import { Context, Controller, Delete, Get, Post, Put } from 'lockness'

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

> **Pro Tip:** Use `deno task ace make:controller Name` to generate boilerplate

## Display All Routes

Use the `router:list` command to see all registered routes in your application:

```bash
deno task ace router:list
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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ METHOD ┃ PATH           ┃ CONTROLLER     ┃ ACTION ┃ MIDDLEWARES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ GET    ┃ /              ┃ AppController  ┃ index  ┃ -
┃ POST   ┃ /api/users     ┃ UserController ┃ create ┃ @Auth, @Validate
┃ GET    ┃ /api/users/:id ┃ UserController ┃ show   ┃ auth
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

> **💡 Tip:** HTTP methods are color-coded in the terminal (GET=green,
> POST=yellow, PUT=blue, DELETE=red) for easy visual scanning.
