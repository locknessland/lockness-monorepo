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

### Docker

Build and run the production image:

```bash
# Build the image
docker build -t my-lockness-app .

# Run the container
docker run -p 8888:8888 --env-file .env.production my-lockness-app

# Override Deno version at build time
docker build --build-arg DENO_VERSION=2.7.0 -t my-app .
```

### Testing

Run the test suite:

```bash
deno task test
```

Run tests with coverage report:

```bash
deno task test:coverage
```

Run tests in watch mode (re-run on file changes):

```bash
deno task test:watch
```

Test files are located in the `tests/` directory. Coverage reports are generated
in `coverage/html/`.

### Nessy CLI Wrapper

**Nessy** is a convenient CLI wrapper that simplifies common commands. Install
it once:

```bash
deno task ace nessy:install
```

Then use `./nessy` instead of `deno task ace`:

```bash
# Scaffolding
./nessy make:controller User
./nessy make:model Post -a

# Database
./nessy db:migrate
./nessy db:studio

# Development
./nessy dev          # Start dev server
./nessy test User    # Run tests
./nessy check        # Type-check files
./nessy router:list  # Show routes

# Maintenance
./nessy clean        # Remove build artifacts
./nessy fresh        # Clean all + reinstall
./nessy status       # Project health check
```

**Built-in DX commands:**

- `dev` - Start development server (with CSS and routes watchers)
- `start` - Start production server
- `test [pattern]` - Run tests (optionally filtered)
- `check` - Type-check all files
- `fresh` - Clean everything and reinstall
- `clean` - Remove build artifacts only
- `status` - Show project health info
- `install <pkg>` - Add a dependency
- `--version` - Show version
- `--help` - Display help

Nessy works on all platforms (Unix/Linux/macOS/Windows) and is project-specific.

### Modern Decorators

Lockness uses **TC39 Stage 3 standard decorators** natively supported by Deno
2+. No `experimentalDecorators` flag is required in your `deno.json`.

**Important:** When using `@Inject` for dependency injection, use the `accessor`
keyword:

```typescript
@Service()
export class UserRepository {
    @Inject(Database)
    accessor database!: Database // Use 'accessor', not 'private'

    async findAll() {
        return await this.database.db.select().from(users)
    }
}
```

### Automatic Routes System

Lockness automatically discovers and registers controllers in development mode,
and generates a static routes registry for production compilation.

**Development Mode** (auto-discovery):

- Controllers in `src/controller/` are automatically discovered at runtime
- Changes are detected by a file watcher and reflected immediately
- No manual route registration needed

**Production Mode** (compilation):

- Routes are generated in `src/routes.ts` before compilation
- Use `deno task compile` to create a standalone binary
- The binary uses static imports for optimal performance

**Manual Route Generation:**

```bash
# Regenerate routes.ts manually
deno task routes:generate

# Watch for controller changes (auto-regenerate)
deno task routes:watch
```

When you create a controller with `deno task ace make:controller`, the routes
are automatically updated. The development server (`deno task dev`) runs with
watchers for both CSS and routes, providing a zero-configuration experience.

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

### Scaffolding Components

Generate JSX components with the `make:component` command:

```bash
# Create a new component
deno task ace make:component Button

# Create a nested component
deno task ace make:component ui/Card
```

This creates `src/view/components/button.tsx` with:

```tsx
export const Button = (props: ButtonProps) => {
    return (
        <div>
            {/* Button component */}
            {props.children}
        </div>
    )
}
```

**Naming conventions:**

- Component class name: PascalCase (e.g., `Button`, `UserCard`)
- File name: snake_case (e.g., `button.tsx`, `user_card.tsx`)
- Props interface: `<ComponentName>Props`

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

### Middleware System

Create a new middleware:

```bash
deno task ace make:middleware Auth
```

This creates `src/middleware/auth_middleware.ts`.

#### Global Middlewares

Apply middlewares to all routes in `src/kernel.ts`:

```typescript
await app.init({
    controllers,
    globalMiddlewares: [LoggerMiddleware, CorsMiddleware],
})
```

#### Named Middlewares

Register middlewares by name for use with `@Use('name')`:

```typescript
await app.init({
    controllers,
    middlewares: {
        auth: AuthMiddleware,
        admin: AdminMiddleware,
    },
})
```

#### Using Middlewares in Controllers

```typescript
import { Controller, Get, Use } from 'lockness'
import { AuthMiddleware } from '@middleware/auth_middleware.ts'

@Controller('/dashboard')
export class DashboardController {
    @Get('/')
    @Use(AuthMiddleware) // Class reference
    index(c: Context) {
        return c.json({ dashboard: true })
    }

    @Get('/admin')
    @Use('auth') // Named middleware
    @Use('admin')
    admin(c: Context) {
        return c.json({ admin: true })
    }
}
```

### Custom CLI Commands

Create your own CLI commands that integrate with ACE:

```bash
deno task ace make:command Greet
```

This creates `src/command/greet_command.ts`:

```typescript
import { Command, type CommandContext, type ICommand } from '@lockness/ace'

@Command('greet', 'Say hello to someone')
export class GreetCommand implements ICommand {
    async handle(ctx: CommandContext) {
        const name = ctx.arg(0) || 'World'
        console.log(`Hello, ${name}!`)
    }
}
```

Run it:

```bash
deno task ace greet John
# Hello, John!
```

Commands are auto-discovered from `src/command/`. Use `ctx.args` for arguments,
`ctx.hasFlag('verbose')` for flags, and `ctx.getFlag('name')` for flag values.

### Display All Routes

List all registered routes with their details:

```bash
deno task ace router:list
```

This displays a formatted table showing:

- **METHOD**: HTTP method (color-coded: GET=green, POST=yellow, PUT=blue,
  DELETE=red)
- **PATH**: Route path with parameters
- **CONTROLLER**: Controller class name
- **ACTION**: Method name
- **MIDDLEWARES**: Applied middlewares (@Auth, @Guest, @Validate, or named
  middlewares)

Example output:

```
📋 Registered Routes (11 total)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ METHOD ┃ PATH           ┃ CONTROLLER     ┃ ACTION ┃ MIDDLEWARES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ GET    ┃ /              ┃ AppController  ┃ index  ┃ -
┃ POST   ┃ /api/users     ┃ UserController ┃ create ┃ @Auth, @Validate
┃ GET    ┃ /api/users/:id ┃ UserController ┃ show   ┃ auth
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Interactive REPL (Tinker)

Explore your application interactively with `ace tinker`:

```bash
deno task ace tinker
```

```
🔮 Lockness Tinker - Interactive REPL
📦 Loaded: users, UserService, UserRepository

>>> 2 + 2
4
>>> await UserRepository.findAll()
[{ id: 1, email: "..." }]
>>> .exit
👋 Bye!
```

Commands: `.help`, `.context`, `.clear`, `.exit`. Supports async/await and
multiline input.

### Session Management

Lockness provides session management with multiple drivers.

Configure sessions in `src/kernel.ts`:

```typescript
import { configureSession, createSessionMiddleware } from 'lockness'

configureSession({
    driver: 'cookie', // 'cookie' | 'deno-kv' | 'memory'
    secret: Deno.env.get('APP_KEY') || 'change-me',
    lifetime: 7200, // 2 hours
})

await app.init({
    globalMiddlewares: [createSessionMiddleware()],
})
```

Use sessions in controllers:

```typescript
import { session } from 'lockness'

@Get('/dashboard')
index(c: Context) {
    const visits = session(c).get('visits', 0) as number
    session(c).set('visits', visits + 1)

    // Flash messages (available only for next request)
    session(c).flash('success', 'Welcome!')
    const msg = session(c).getFlash('success')

    return c.json({ visits })
}
```

Available methods: `get()`, `set()`, `has()`, `forget()`, `all()`, `flush()`,
`regenerate()`, `destroy()`, `flash()`, `getFlash()`.

### Authentication

Scaffold a complete authentication system:

```bash
deno task ace make:auth
```

This creates an `AuthController` and `UserProvider`.

Configure auth in `src/kernel.ts`:

```typescript
import { configureAuth, container } from 'lockness'
import { UserProvider } from '@provider/user_provider.ts'

configureAuth({
    userProvider: container.get(UserProvider),
    redirectTo: '/auth/login',
})
```

Use auth in controllers:

```typescript
import { Auth, Guest, auth } from 'lockness'

// Protect entire controller
@Auth()
@Controller('/dashboard')
export class DashboardController {
    @Get('/')
    async index(c: Context) {
        const user = await auth(c).user()
        return c.json({ user })
    }
}

// Guest-only routes (redirect if logged in)
@Controller('/auth')
export class AuthController {
    @Guest('/dashboard')
    @Get('/login')
    showLogin(c: Context) { ... }

    @Post('/login')
    async login(c: Context) {
        const { email, password } = await c.req.parseBody()
        const success = await auth(c).attempt(email, password)
        if (!success) {
            session(c).flash('error', 'Invalid credentials')
            return c.redirect('/auth/login')
        }
        return c.redirect('/dashboard')
    }

    @Post('/logout')
    async logout(c: Context) {
        await auth(c).logout()
        return c.redirect('/auth/login')
    }
}
```

Password hashing:

```typescript
import { hashPassword, verifyPassword } from 'lockness'

const hash = await hashPassword('secret123')
const valid = await verifyPassword('secret123', hash)
```

### Social Authentication (OAuth2)

Add social login with Google, GitHub, Discord, and more:

```bash
# Scaffold auth with social providers
deno task ace make:auth --social
```

Configure providers in `src/kernel.ts`:

```typescript
import { configureSocialite } from 'lockness'

configureSocialite({
    google: {
        clientId: Deno.env.get('GOOGLE_CLIENT_ID')!,
        clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
        redirectUri: Deno.env.get('APP_URL') + '/auth/google/callback',
    },
    github: {
        clientId: Deno.env.get('GITHUB_CLIENT_ID')!,
        clientSecret: Deno.env.get('GITHUB_CLIENT_SECRET')!,
        redirectUri: Deno.env.get('APP_URL') + '/auth/github/callback',
    },
    discord: {
        clientId: Deno.env.get('DISCORD_CLIENT_ID')!,
        clientSecret: Deno.env.get('DISCORD_CLIENT_SECRET')!,
        redirectUri: Deno.env.get('APP_URL') + '/auth/discord/callback',
    },
})
```

Use in controllers:

```typescript
import { socialite, generateState, session } from 'lockness'

@Get('/auth/google')
google(c: Context) {
    const state = generateState()
    session(c).set('oauth_state', state)
    return socialite('google').redirect(state)
}

@Get('/auth/google/callback')
async googleCallback(c: Context) {
    const user = await socialite('google').user(c)
    // user: { id, email, name, avatar, accessToken, ... }
    
    // Find or create user, then log them in
    session(c).set('user_id', user.id)
    return c.redirect('/dashboard')
}
```

Available providers: `google`, `github`, `discord`. Add custom providers with
`registerSocialiteDriver()`.

### Mail System

Send emails with an expressive fluent API:

```typescript
import { mail } from 'lockness'

await mail()
    .to('user@example.com')
    .subject('Welcome!')
    .html('<h1>Hello!</h1>')
    .send()
```

Configure mail in `src/kernel.ts`:

```typescript
import { configureMail } from 'lockness'

configureMail({
    driver: 'console', // 'console' | 'memory' | 'smtp' | 'resend'
    from: { email: 'noreply@example.com', name: 'My App' },
})
```

Available drivers: `console` (dev), `memory` (testing), `smtp`, `resend`.

### Background Jobs

Process long-running tasks in the background:

```bash
# Create a job
deno task ace make:job SendWelcomeEmail

# Process jobs
deno task ace queue:work

# Clear a queue
deno task ace queue:clear
```

Dispatch jobs from your application:

```typescript
import { dispatch } from 'lockness'
import { SendWelcomeEmailJob } from '@job/sendwelcomeemail_job.ts'

// Immediate dispatch
await dispatch(SendWelcomeEmailJob, { userId: 1, email: 'user@example.com' })

// Delayed dispatch (5 seconds)
await dispatch(SendWelcomeEmailJob, { userId: 1 }, { delay: 5000 })
```

Drivers: `memory` (dev) or `deno-kv` (production with persistence).
