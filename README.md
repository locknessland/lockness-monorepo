# Lockness JS

**Lockness JS** is a high-performance, fullstack MVC web framework built
natively for **Deno**. Heavily inspired by the elegance of Laravel and AdonisJS,
it leverages the speed of **HonoJS** while providing a structured and ergonomic
development experience.

### Development

Start the development server with hot-reload and environment variables:

```bash
deno task dev
```

### Production Build

Bundle your application into an optimized SSR bundle in the `dist` directory
using Vite:

```bash
deno task build
```

### Running in Production

Run the optimized production server (on port 8888):

```bash
deno task start
```

_Note: Use `deno task start -- --force` to automatically kill any process
already using the port._

### Compile to Binary

Create a standalone executable for your target platform:

```bash
deno task compile
```

### Database Management (Drizzle ORM)

Lockness uses **Drizzle ORM** for type-safe database operations.

#### Generate Migrations

Generate migration files from your schema definitions:

```bash
deno task ace db:generate
```

#### Run Migrations

Apply pending migrations to your database:

```bash
deno task ace db:migrate
```

#### Push Schema

Push your schema directly to the database (useful for development):

```bash
deno task ace db:push
```

#### Drizzle Studio

Launch Drizzle Studio to visualize and manage your database:

```bash
deno task ace db:studio
```

_Note: Make sure to set your `DATABASE_URL` environment variable in `.env` or
`.env.local`._

#### Database Seeding

Create a new seeder:

```bash
deno task ace make:seeder User
```

Create the main database seeder (orchestrator):

```bash
deno task ace make:seeder Database
```

Run all seeders:

```bash
deno task ace db:seed
```

Run a specific seeder:

```bash
deno task ace db:seed User
```

### Request Validation

Lockness provides automatic request validation using Zod schemas:

```typescript
import { Context, Controller, Post, Validate, z } from 'lockness'

const CreateUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
})

@Controller('/api/users')
export class UserController {
    @Post('/')
    @Validate('json', CreateUserSchema)
    create(c: Context) {
        const data = c.req.valid('json') // Typed & validated!
        return c.json({ success: true, data })
    }
}
```

Supported validation targets: `json`, `query`, `param`, `header`, `cookie`,
`form`.
