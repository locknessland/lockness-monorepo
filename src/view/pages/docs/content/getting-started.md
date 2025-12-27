# Getting Started

This guide will walk you through creating your first Lockness application, from
setup to deployment.

## 🎯 Your First Controller

Let's create a simple API endpoint. Use the CLI to scaffold a controller:

```bash
# API endpoint (returns JSON)
deno task cli make:controller Hello

# Web page (renders JSX view)
deno task cli make:controller Hello --view
```

The `--view` flag automatically creates a view in `src/view/pages/hello.tsx` and
generates a controller that renders it.

This creates `src/controller/hello_controller.ts`. Edit it:

```typescript
import { Context, Controller, Get } from 'lockness/core'

@Controller('/api/hello')
export class HelloController {
    @Get('/')
    index(c: Context) {
        return c.json({
            message: 'Hello from Lockness!',
            timestamp: new Date().toISOString(),
        })
    }

    @Get('/:name')
    greet(c: Context) {
        const name = c.req.param('name')
        return c.json({ message: `Hello, ${name}!` })
    }
}
```

Test it: `http://localhost:5173/api/hello`

## 🗄️ Adding a Database Model

Create a model with repository, controller, and seeder in one command:

```bash
deno task cli make:model Post -a
```

The `-a` flag generates:

- `src/model/post.ts` - Drizzle schema + Zod validation
- `src/repository/post_repository.ts` - Data access layer
- `src/controller/post_controller.ts` - REST API with validation
- `src/seeder/post_seeder.ts` - Database seeder

## 📊 Run Migrations

Generate and apply database migrations:

```bash
deno task cli db:generate
deno task cli db:migrate
```

## 🌱 Seed the Database

Populate your database with test data:

```bash
deno task cli db:seed
```

## 🎨 Create a View

Generate a JSX page component:

```bash
deno task cli make:view posts/index
```

This creates `src/view/pages/posts/index.tsx`. Use it in your controller:

```typescript
import { IndexPage } from '@view/pages/posts/index.tsx'

@Controller('/posts')
export class PostController {
    @Get('/')
    index(c: Context) {
        return c.html(<IndexPage />)
    }
}
```

## 🔒 Add Authentication

Scaffold a complete auth system:

```bash
deno task cli make:auth
```

Configure in `src/kernel.ts`:

```typescript
import { configureAuth, container } from 'lockness/core'
import { UserProvider } from '@provider/user_provider.ts'

configureAuth({
    userProvider: container.get(UserProvider),
    redirectTo: '/auth/login',
})
```

Protect routes with `@Auth()` decorator:

```typescript
@Auth()
@Controller('/dashboard')
export class DashboardController {
    @Get('/')
    async index(c: Context) {
        const user = await auth(c).user()
        return c.json({ user })
    }
}
```

## What's Next?

- [Learn more about Routing & Controllers](/docs/routing)
- [Deep dive into Models & Database](/docs/models)
- [Add Request Validation](/docs/validation)
