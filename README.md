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

### Scaffolding with make:model

Quickly scaffold a complete entity with model, repository, seeder, and CRUD
controller:

```bash
# Create just the model
deno task ace make:model Post

# Create model + repository
deno task ace make:model Post -r

# Create model + seeder
deno task ace make:model Post -s

# Create model + CRUD controller (with validation)
deno task ace make:model Post -c

# Create everything at once
deno task ace make:model Post -a
```

The `-a` flag generates:

- `src/model/post.ts` - Drizzle table + drizzle-zod schemas
- `src/repository/post_repository.ts` - Full CRUD with DI
- `src/seeder/post_seeder.ts` - Seeder template
- `src/controller/post_controller.ts` - REST API with validation

### Request Validation with drizzle-zod

Lockness uses **drizzle-zod** to generate Zod validation schemas directly from
your Drizzle models:

```typescript
// src/model/user.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
})

// Generated schemas with optional refinements
export const insertUserSchema = createInsertSchema(users, {
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
```

Then use the `@Validate` decorator in your controllers:

```typescript
// src/controller/user_api_controller.ts
import { Context, Controller, Post, Validate } from 'lockness'
import { insertUserSchema } from '../model/user.ts'

@Controller('/api/users')
export class UserApiController {
    @Post('/')
    @Validate('json', insertUserSchema)
    create(c: Context) {
        const data = c.req.valid('json') // Typed & validated!
        return c.json({ success: true, data })
    }
}
```

Supported validation targets: `json`, `query`, `param`, `header`, `cookie`,
`form`.
