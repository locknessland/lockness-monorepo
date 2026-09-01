# Getting Started

This guide will walk you through creating your first Lockness application, from
setup to deployment.

## 📁 Project Structure

Your project will have the following structure, after the initialization:

```
my-app/
├── app/
│   ├── kernel.tsx              # Application bootstrap
│   ├── routes.ts               # Auto-generated routes registry
│   ├── controller/             # HTTP controllers
│   │   └── app_controller.tsx
│   ├── middleware/             # Custom middleware
│   ├── model/                  # Drizzle database schemas
│   ├── repository/             # Data access layer
│   ├── service/                # Business logic services
│   └── view/
│       ├── assets/             # CSS and client-side assets
│       │   └── app.css
│       ├── components/         # Reusable JSX components
│       ├── layouts/            # Page layouts
│       └── pages/              # Page components
├── database/
│   ├── migrations/             # SQL migration files
│   └── seeders/                # Database seeders
├── public/                     # Static files (served directly)
│   ├── css/                    # Compiled CSS output
│   ├── img/                    # Images
│   └── js/                     # Client-side JavaScript
├── tests/                      # Test files
├── deno.json                   # Deno configuration & tasks
├── drizzle.config.ts           # Drizzle ORM configuration
└── main.ts                     # Application entry point
```

### Key Directories

| Directory         | Purpose                                     |
| ----------------- | ------------------------------------------- |
| `app/controller/` | HTTP request handlers with route decorators |
| `app/model/`      | Database table schemas (Drizzle ORM)        |
| `app/repository/` | Data access layer for database operations   |
| `app/service/`    | Business logic, injectable via `@Service()` |
| `app/view/`       | JSX templates, components, and layouts      |
| `database/`       | Migrations and seeders                      |
| `public/`         | Static assets served at root URL            |

## 🎯 Your First Controller

Let's create a simple API endpoint. Use the CLI to scaffold a controller:

```bash
# API endpoint (returns JSON)
deno task cli make:controller Hello

# Web page (renders JSX view)
deno task cli make:controller Hello --view
```

The `--view` flag automatically creates a view in `app/view/pages/hello.tsx` and
generates a controller that renders it.

This creates `app/controller/hello_controller.ts`. Edit it:

```typescript
import { Context, Controller, Get } from '@lockness/core'

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

- `app/model/post.ts` - Drizzle schema + Zod validation
- `app/repository/post_repository.ts` - Data access layer
- `app/controller/post_controller.ts` - REST API with validation
- `app/seeder/post_seeder.ts` - Database seeder

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

This creates `app/view/pages/posts/index.tsx`. Use it in your controller:

```typescript
import { IndexPage } from '@view/pages/posts/index.tsx'
import { Context, Controller, Get } from '@lockness/core'

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

Configure in `app/kernel.tsx`:

```typescript
import { DeclareGlobalMiddleware, Kernel } from '@lockness/core'
import { sessionMiddleware } from '@lockness/session'
import { initializeAuthMiddleware, SessionGuard } from '@lockness/auth'
import { UserProvider } from '@auth/user_provider.ts'

@Kernel({
    session: { driver: 'cookie', secret: Deno.env.get('APP_KEY') },
    controllersDir: './app/controller',
})
export class AppKernel {
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        sessionMiddleware(),
        initializeAuthMiddleware({
            default: 'web',
            guards: {
                web: (ctx) => new SessionGuard('web', ctx, new UserProvider()),
            },
        }),
    ]
}
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
