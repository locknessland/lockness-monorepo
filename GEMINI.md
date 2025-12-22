Fullstack MVC framework for Deno. Lockness JS is a fullstack Web framework with
a focus on ergonomics and speed. It takes care of much of the Web development
hassles, offering you a clean and stable API to build Web apps and
microservices.

## 🎯 Project Objective

The main objective of Lockness is to provide a robust and structured development
experience, similar to what is found in established ecosystems like **Laravel**,
**AdonisJS**, or **Symfony**, while leveraging the modernity and speed of Deno.

Although powered by the high-performance engine of **HonoJS** (for routing,
middleware, etc.), Lockness abstracts this layer to offer a complete and
familiar MVC (Model-View-Controller) architecture.

## 🚀 Philosophy

- **Solid Foundation**: Uses HonoJS under the hood for maximum performance and
  efficient HTTP request management.
- **MVC Architecture**: A clear structure separating business logic, data, and
  display.
- **Inspiration**: Heavily inspired by the elegance of Laravel and AdonisJS.
- **Deno First**: Built natively for Deno, taking advantage of its security and
  modern tooling (native TypeScript, no `node_modules`, etc.).

## 🛠 Target Features

- **Expressive Routing**: (based on Hono but adapted for MVC)
- **Controllers**: Class-based controllers with decorators (`@Controller`,
  `@Get`, `@Post`, etc.)
- **Robust Middleware Support**: Class-based middlewares with the `@Middleware`
  decorator
- **Dependency Injection**: A built-in IoC container managing services with
  `@Service` and `@Inject` decorators
- **View Engine (JSX)**: Native JSX support powered by Hono's JSX runtime,
  facilitating component-based UI development.
- **Vite Integration**: High-performance development server with Hot Module
  Replacement (HMR) and optimized SSR production builds.
- **ORM / Query Builder**: Official integration with **Drizzle ORM** for
  type-safe database queries with PostgreSQL support.

## 🛠 Architectural Highlights

### Dependency Injection (DI)

Lockness features a built-in Service Container for managing dependencies.
Services should be decorated with `@Service()` and can be injected into
controllers or other services using `@Inject(ServiceClass)`.

```typescript
@Service()
export class UserService {
    execute() { ... }
}

@Controller('/users')
export class UserController {
    @Inject(UserService)
    private userService!: UserService
}
```

### View Engine (JSX)

The framework uses Hono's JSX runtime. To ensure correct resolution, the root
`deno.json` must be configured with:

```json
"compilerOptions": {
    "jsx": "precompile",
    "jsxImportSource": "hono/jsx"
}
```

And Hono must be mapped in the imports:

```json
"imports": {
    "hono": "npm:hono@^4.11.1",
    "hono/": "npm:hono@^4.11.1/"
}
```

### Drizzle ORM Integration

Lockness uses **Drizzle ORM** for database operations, providing excellent
TypeScript support and type safety. The framework includes:

- **Database Service**: Injectable `Database` service with connection management
- **Type-Safe Models**: Uses Drizzle's schema definition with automatic type
  inference
- **Repository Pattern**: Structured data access layer for clean separation of
  concerns
- **Migration System**: Built-in support for database migrations via
  `drizzle-kit`

### Request Validation

Lockness provides a `@Validate` decorator for automatic request validation using
**Zod** schemas:

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

Validation targets: `json`, `query`, `param`, `header`, `cookie`, `form`.

On validation failure, returns:

```json
{
    "success": false,
    "message": "Validation failed",
    "errors": { "email": ["Invalid email format"] }
}
```

Example model definition:

```typescript
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
```

Example repository:

```typescript
@Service()
export class UserRepository {
    @Inject(Database)
    private database!: Database

    async findAll(): Promise<User[]> {
        return await this.database.db.select().from(users)
    }
}
```

**Why Drizzle?** With recent improvements in Deno's NPM compatibility
(`nodeModulesDir: auto`) and Vite's external configuration, Drizzle now works
seamlessly in our stack. It offers a better developer experience than query
builders, with powerful type inference and an intuitive API similar to Laravel's
Eloquent.

## 📂 Repository Structure

```text
.
├── lockness/              # 📦 Modular Framework Libraries
│   ├── core/              # Core Web & DI logic
│   ├── ace/               # CLI Command Engine (Ace)
│   ├── drizzle/           # Drizzle ORM Extension
│   └── init/              # Scaffolding & Project Init
├── src/                   # 🚀 Framework Template (Boilerplate)
│   ├── controller/        # HTTP Controllers
│   ├── model/             # Database Models
│   ├── service/           # Business Logic
│   └── kernel.ts          # App Initialization
├── data/                  # Static Data & Assets
├── docs/                  # Documentation & AI Rules
├── scripts/               # Build & Internal Scripts
├── _output/               # Build Artifacts & Binaries
├── main.ts                # Entry point
├── ace.ts                 # CLI Entry point
└── deno.json              # Config & Aliases
```

- **`lockness/`**: Contains the decoupled libraries. This modularity allows for
  an ORM-agnostic core while providing official extensions like
  `lockness-drizzle`.
- **Root Files & `src/`**: Boilerplate structure generated for users.
- **`docs/`**: Contains reference documentation and rules, including HonoJS
  docs, for AI assistance.
- **`dist/`**: Output directory for production SSR builds (`server.js`).

## ⚙️ Development Workflow

- **Quality Assurance**: Every code modification must be validated by running
  `deno fmt` and `deno lint`. This ensures that the codebase remains clean,
  consistent, and free of linting errors.

## 🛠 Development Stack

Lockness uses a modern development stack to ensure the best developer
experience:

- **Vite**: Used for Hot Module Replacement (HMR) during development.
- **SSR (Server-Side Rendering)**: Compiles the entire application into a single
  `dist/server.js` file for production.
- **Deno Tasks**:
  - `deno task dev`: Starts the Vite dev server (on port 5173).
  - `deno task build`: Generates the production SSR bundle.
  - `deno task start`: Runs the production server (on port 8888). Use
    `-- --force` to automatically kill any process already using the port.
  - `deno task ace init`: Scaffolds a new project.
  - `deno task ace db:generate`: Generates database migrations.
  - `deno task ace db:migrate`: Applies pending migrations.
  - `deno task ace db:push`: Pushes schema directly to database.
  - `deno task ace db:studio`: Launches Drizzle Studio.
  - `deno task ace make:seeder`: Creates a new seeder class.
  - `deno task ace db:seed`: Runs database seeders.
