# Getting Started

This guide will walk you through creating your first Lockness application, from
setup to deployment.

## 🎯 Your First Controller

Let's create a simple API endpoint. Use the ACE CLI to scaffold a controller:

```bash
deno task ace make:controller Hello
```

This creates `src/controller/hello_controller.ts`. Edit it:

```typescript
import { Context, Controller, Get } from 'lockness'

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
deno task ace make:model Post -a
```

The `-a` flag generates:

- `src/model/post.ts` - Drizzle schema + Zod validation
- `src/repository/post_repository.ts` - Data access layer
- `src/controller/post_controller.ts` - REST API with validation
- `src/seeder/post_seeder.ts` - Database seeder

## 📊 Run Migrations

Generate and apply database migrations:

```bash
deno task ace db:generate
deno task ace db:migrate
```

## 🌱 Seed the Database

Populate your database with test data:

```bash
deno task ace db:seed
```

## 🎨 Create a View

Generate a JSX page component:

```bash
deno task ace make:view posts/index
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
deno task ace make:auth
```

Configure in `src/kernel.ts`:

```typescript
import { configureAuth, container } from 'lockness'
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
