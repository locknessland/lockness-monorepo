# Lockness JS

**Lockness JS** is a high-performance, fullstack MVC web framework built
natively for **Deno**. Heavily inspired by the elegance of Laravel and AdonisJS,
it leverages the speed of **HonoJS** fully encapsulated within `@lockness/core`,
providing a structured and ergonomic development experience.

### Development

Lockness uses a multi-process development workflow. For optimal performance, run
each watcher in a separate terminal:

```bash
# Terminal 1: CSS Watcher
deno task css:watch

# Terminal 2: Development Server
deno task dev
```

The `dev` task runs the main server with hot-reload. The CSS watcher rebuilds
styles automatically when files change.

**Routes are automatically updated** when you create or modify controllers - no
separate watcher needed. The `deno task routes:watch` command exists but is
optional.

**Why separate terminals?** Each watcher needs its own process to function
properly. Running them concurrently in a single script can cause conflicts in
terminal I/O handling.

### Build for Production

Build production assets (CSS):

```bash
deno task build
```

### Running in Production

Run the production server directly from source:

```bash
deno task start
```

This runs `main.ts` directly with production environment variables. For Deno
Deploy, simply point to `main.ts` as the entry point.

### Compile to Binary

Create a standalone executable for VPS or self-hosted environments:

```bash
deno task compile
```

This generates `_dist/lockness` (~92MB) - a fully self-contained binary that
includes the Deno runtime, all dependencies, and copies the `public/` folder for
static assets. Not needed for Deno Deploy.

### Deno Deploy

Deploy to Deno Deploy cloud platform:

1. Connect your GitHub repository
2. Set entry point to `main.ts`
3. Add build command: `deno task routes:generate && deno task css:build`
4. Configure environment variables (`APP_ENV=production`, `DATABASE_URL`, etc.)

Deno Deploy runs TypeScript directly with native TC39 decorators support - no
compilation or bundling needed.

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

### Upgrading Your Project

Lockness provides a dedicated upgrade tool to update all `@lockness/*`
dependencies in your project:

```bash
# Upgrade to latest version
deno run -Ar jsr:@lockness/upgrade

# Upgrade to specific version
deno run -Ar jsr:@lockness/upgrade 0.2.0

# Preview changes without applying (dry run)
deno run -Ar jsr:@lockness/upgrade --dry-run
```

The upgrade tool automatically:

- Detects all `@lockness/*` packages in your `deno.json`
- Fetches the latest version from JSR (or uses specified version)
- Updates versions while preserving other dependencies
- Shows a clear summary of changes

**Example output:**

```
🔍 Detecting Lockness packages in deno.json...

📦 Found 5 package(s):

  @lockness/core              0.1.19 → 0.2.0
  @lockness/cli               0.1.19 → 0.2.0
  @lockness/auth              0.1.19 → 0.2.0

✅ deno.json updated successfully!

⚠️  Don't forget to:
  - Review the changes with git diff
  - Check the changelog
  - Test your application
```

**Best Practices:**

1. Always use `--dry-run` first to preview changes
2. Review the changelog before upgrading
3. Test your application after upgrading
4. Commit your changes before upgrading so you can revert if needed

See the [upgrade package documentation](./packages/upgrade/README.md) for more
details.

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

**Testing Best Practices:**

For fast, reliable tests, follow these guidelines:

- **Use FakeTime for time-based tests**: Replace `setTimeout` delays with
  `FakeTime` from `@std/testing/time` for instant time manipulation
- **Use in-memory mocks**: Avoid filesystem I/O by using memory-based storage
  drivers in tests
- **Keep tests hermetic**: Tests should not create files, directories, or
  external side effects
- **Target speed**: The full test suite should complete in < 30 seconds

See [GEMINI.md](./GEMINI.md#-testing-best-practices) for detailed examples and
patterns.

### Nessy CLI Wrapper

**Nessy** is a convenient CLI wrapper that simplifies common commands. Install
it once:

```bash
deno task cli nessy:install
```

Then use `./nessy` instead of `deno task cli`:

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
./nessy router:list  # Show all routes with names

# Maintenance
./nessy clean        # Remove build artifacts
./nessy fresh        # Clean all + reinstall
./nessy status       # Project health check
```

**Built-in DX commands:**

- `dev` - Start development server (with CSS and routes watchers)
- `build` - Build production assets (CSS)
- `start` - Start production server from source
- `compile` - Create standalone binary
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

#### Named Routes

Lockness allows you to assign unique names to your routes for dynamic URL
generation:

```typescript
@Controller('/auth')
export class AuthController {
    @Get('/login', { name: 'auth.login' })
    show(c: Context) { ... }
}

// Generate URL anywhere
import { route } from '@lockness/core'
const url = route('auth.login') // "/auth/login"
```

#### Reusable Layouts and Components

Lockness provides a component-based architecture for building consistent UI
across your application:

**Layouts** - Wrap pages with common structure (navigation, headers, sidebars):

```typescript
// app/view/layouts/auth_layout.tsx
export const AuthLayout = (
    { title, children }: { title: string; children: JSX.Element },
) => {
    return (
        <>
            <head>
                <title>{title} - Lockness</title>
                {/* Meta tags and styles */}
            </head>
            <body>
                <Navbar />
                <main>{children}</main>
            </body>
        </>
    )
}

// Usage in pages
import { AuthLayout } from '@view/layouts/auth_layout.tsx'

export const LoginPage = () => (
    <AuthLayout title='Login'>
        <div class='login-form'>
            {/* Login form */}
        </div>
    </AuthLayout>
)
```

**Reusable Components** - Use the UI component library from `@lockness/ui`:

```typescript
import {
    Navbar,
    NavbarBrand,
    NavbarContent,
    NavbarMenuItem,
} from '@lockness/ui/components'

// Usage in layouts
export const DocsLayout = ({ children }: { children: JSX.Element }) => (
    <div>
        <Navbar>
            <NavbarBrand href='/'>Lockness</NavbarBrand>
            <NavbarContent position='right'>
                <NavbarMenuItem href='/docs'>Docs</NavbarMenuItem>
                <NavbarMenuItem href='/auth/profile'>Profile</NavbarMenuItem>
            </NavbarContent>
        </Navbar>
        <aside>{/* Sidebar */}</aside>
        <main>{children}</main>
    </div>
)
```

### Application Kernel

The application kernel (`app/kernel.tsx`) is the central configuration file
where you bootstrap your Lockness application. It provides a clean, fluent API
for configuring middleware, error handling, and other core features.

**Basic Configuration:**

```typescript
import { App, configureSession, sessionMiddleware } from '@lockness/core'
import { controllers } from './routes.ts'

export const bootstrap = async () => {
    // Configure session
    configureSession({
        driver: 'cookie',
        secret: Deno.env.get('APP_KEY') || 'change-me',
        lifetime: 7200,
    })

    // Create app
    const app = new App()

    // Configure using fluent API
    app.useMiddleware(sessionMiddleware())

    // Initialize with controllers
    await app.init({
        controllersDir: app.isDevelopment ? './app/controller' : undefined,
        controllers: app.isDevelopment ? undefined : controllers,
        staticDir: 'public',
    })

    return app
}
```

**Advanced Configuration:**

```typescript
import { errorHandler } from '@view/pages/errors/error_handler.tsx'
import { LoggerMiddleware } from '@middleware/logger_middleware.ts'

const app = new App()

// Fluent API for middlewares
app
    .useMiddleware(
        sessionMiddleware(),
        LoggerMiddleware,
    )
    .useErrorHandler(errorHandler)

// Enable devtools in development
if (app.isDevelopment) {
    enableDevtools(app.getHono())
}
```

**Available Helper Properties:**

- `app.isDevelopment` - Check if running in development mode
- `app.isProduction` - Check if running in production mode

**Fluent API Methods:**

- `app.useMiddleware(...middlewares)` - Add global middlewares
- `app.useErrorHandler(handler)` - Set custom error handler

### Automatic Routes System

Lockness automatically discovers and registers controllers in development mode,
and generates a static routes registry for production compilation.

**Development Mode** (auto-discovery):

- Controllers in `app/controller/` are automatically discovered at runtime
- Changes are detected by a file watcher and reflected immediately
- No manual route registration needed

**Production Mode** (compilation):

- Routes are generated in `app/routes.ts` before compilation
- Use `deno task compile` to create a standalone binary
- The binary uses static imports for optimal performance

**Manual Route Generation:**

```bash
# Regenerate routes.ts manually
deno task routes:generate

# Watch for controller changes (auto-regenerate)
deno task routes:watch
```

When you create a controller with `deno task cli make:controller`, the routes
are automatically updated. The development server (`deno task dev`) runs with
watchers for both CSS and routes, providing a zero-configuration experience.

### Database Management (Drizzle ORM)

Lockness uses **Drizzle ORM** for type-safe database operations.

#### Generate Migrations

Generate migration files from your schema definitions:

```bash
deno task cli db:generate
```

#### Run Migrations

Apply pending migrations to your database:

```bash
deno task cli db:migrate
```

#### Push Schema

Push your schema directly to the database (useful for development):

```bash
deno task cli db:push
```

#### Drizzle Studio

Launch Drizzle Studio to visualize and manage your database:

```bash
deno task cli db:studio
```

_Note: Make sure to set your `DATABASE_URL` environment variable in `.env` or
`.env.local`._

#### Database Seeding

Create a new seeder:

```bash
deno task cli make:seeder User
```

Create the main database seeder (orchestrator):

```bash
deno task cli make:seeder Database
```

Run all seeders:

```bash
deno task cli db:seed
```

Run a specific seeder:

```bash
deno task cli db:seed User
```

### Scaffolding with make:model

Quickly scaffold a complete entity with model, repository, seeder, and CRUD
controller:

```bash
# Create just the model
deno task cli make:model Post

# Create model + repository
deno task cli make:model Post -r

# Create model + seeder
deno task cli make:model Post -s

# Create model + CRUD controller (with validation)
deno task cli make:model Post -c

# Create everything at once
deno task cli make:model Post -a
```

The `-a` flag generates:

- `app/model/post.ts` - Drizzle table + drizzle-zod schemas
- `app/repository/post_repository.ts` - Full CRUD with DI
- `app/seeder/post_seeder.ts` - Seeder template
- `app/controller/post_controller.ts` - REST API with validation

### Complete CRUD Scaffolding

For a full-stack CRUD with views:

```bash
deno task cli make:crud Post
```

Generates:

- `app/model/post.ts` - Drizzle schema
- `app/repository/post_repository.ts` - Data access layer
- `app/service/post_service.ts` - Business logic
- `app/controller/post_controller.tsx` - HTTP handler
- `app/view/pages/post/index.tsx` - List view
- `app/view/pages/post/show.tsx` - Detail view

### Development Debugging Tools

Lockness includes **@lockness/devtools** - a Symfony-style debug toolbar and
dashboard:

```typescript
// In app/kernel.tsx
if (app.isDevelopment) {
    enableDevtools(app.getHono())
}
```

**Features:**

- 🔧 **Debug Toolbar**: Fixed bottom bar on every page with real-time stats
- 📊 **Dashboard**: Full web interface at `/_devtools` with 8 panels
- 🔍 **Request Inspector**: Track all HTTP requests with timing
- 📝 **Logs**: Centralized log viewer
- 🗄️ **SQL Queries**: Monitor database queries and performance
- 📬 **Mail**: Track sent emails
- ⚙️ **Queue**: Monitor background jobs

Disable toolbar: `DEBUG_BAR=false`

See [packages/devtools/README.md](packages/devtools/README.md) for full
documentation.

### Scaffolding Components

Generate JSX components with the `make:component` command:

```bash
# Create a new component
deno task cli make:component Button

# Create a nested component
deno task cli make:component ui/Card
```

This creates `app/view/components/button.tsx` with:

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
// app/model/user.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from '@lockness/validator'

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
// app/controller/user_api_controller.ts
import { Context, Controller, Post } from '@lockness/core'
import { Validate } from '@lockness/validator'
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
deno task cli make:middleware Auth
```

This creates `app/middleware/auth_middleware.ts`.

#### Global Middlewares

Apply middlewares to all routes using the fluent API or config:

```typescript
// Option 1: Fluent API (recommended)
app.useMiddleware(LoggerMiddleware, CorsMiddleware)

// Option 2: Via config
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
import { Controller, Get, Use } from '@lockness/core'
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

Create your own CLI commands that integrate with CLI:

```bash
deno task cli make:command Greet
```

This creates `app/command/greet_command.ts`:

```typescript
import { Command, type CommandContext, type ICommand } from '@lockness/cli'

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
deno task cli greet John
# Hello, John!
```

Commands are auto-discovered from `app/command/`. Use `ctx.args` for arguments,
`ctx.hasFlag('verbose')` for flags, and `ctx.getFlag('name')` for flag values.

### Display All Routes

List all registered routes with their details:

```bash
deno task cli router:list
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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ METHOD ┃ PATH           ┃ NAME       ┃ CONTROLLER     ┃ ACTION ┃ MIDDLEWARES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ GET    ┃ /              ┃ home       ┃ AppController  ┃ index  ┃ -
┃ POST   ┃ /api/users     ┃ users.store ┃ UserController ┃ create ┃ @Auth, @Validate
┃ GET    ┃ /api/users/:id ┃ users.show  ┃ UserController ┃ show   ┃ auth
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Interactive REPL (Tinker)

Explore your application interactively with `cli tinker`:

```bash
deno task cli tinker
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

### Package Management

Lockness provides a powerful package management system that automatically
configures and integrates additional features into your application. Packages
are registered in `deno.json` and loaded dynamically at runtime.

#### Installing Packages

Use the `package:install` command for fully automated setup:

```bash
deno task cli package:install openapi
```

This command will:

- Add the package to `deno.json`
- Run the package's install script (if available)
- Create necessary files and configurations
- Display next steps and documentation links

#### Configuration

Packages are declared in the `lockness` section of your `deno.json`:

```json
{
    "lockness": {
        "packages": [
            "drizzle",
            "openapi",
            "cache",
            "socialite"
        ]
    }
}
```

When your application starts, Lockness automatically loads each package and
registers their CLI commands.

#### Available Commands

- `package:install <name>` - Install and configure a package with automated
  setup
- `package:add <name>` - Add package to configuration only (no setup)
- `package:remove <name>` - Remove package from configuration

#### Official Packages

- **@lockness/drizzle**: Drizzle ORM integration with migrations and seeders
- **@lockness/openapi**: OpenAPI/Swagger documentation with automatic spec
  generation
- **@lockness/cache**: Multi-driver caching system (Memory, Deno KV, Redis)
- **@lockness/socialite**: OAuth2 authentication (Google, GitHub, Discord)

#### How It Works

In your `cli.ts` file:

```typescript
import { Cli, loadPackageCommands, registerCoreCommands } from '@lockness/cli'

const cli = new Cli()
registerCoreCommands(cli)
await loadPackageCommands(cli) // Loads from deno.json
await cli.discoverCommands('./app/command')
```

The `loadPackageCommands()` function reads the `lockness.packages` array,
dynamically imports each package, and registers their commands.

### Session Management

Lockness provides session management with multiple drivers.

Configure sessions in `app/kernel.ts`:

```typescript
import { configureSession, createSessionMiddleware } from '@lockness/core'

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
import { session } from '@lockness/core'

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

Lockness provides a powerful authentication system with multiple approaches for
accessing guards.

**Quick Start:**

```bash
deno task cli make:auth
```

This creates an `AuthController` and `UserProvider`.

Configure auth in `app/kernel.ts`:

```typescript
import { initializeAuthMiddleware } from '@lockness/auth'
import { UserProvider } from '@provider/user_provider.ts'

// Initialize auth middleware
app.use(
    '*',
    initializeAuthMiddleware({
        default: 'web',
        guards: {
            web: (ctx) => new SessionGuard('web', ctx, userProvider),
        },
    }),
)
```

**Three Ways to Access Guards:**

**1. Context API (Recommended for 95% of cases)**

The cleanest approach using `c.auth.*` fluent API:

```typescript
import { Context, Controller, Get, Post, Use } from '@lockness/core'
import { withAuth } from '@lockness/auth'

@Controller('/auth')
export class AuthController {
    // Simple login
    @Post('/login')
    @Use(withAuth())
    async login(c: Context) {
        await c.auth.login(email, password, remember)
        return c.redirect('/dashboard')
    }

    // Auto-login after registration
    @Post('/register')
    @Use(withAuth())
    async register(c: Context) {
        const user = await createUser(...)
        await c.auth.loginById(user.id)
        return c.redirect('/dashboard')
    }

    // Logout
    @Post('/logout')
    @Use('auth')
    async logout(c: Context) {
        await c.auth.logout()
        return c.redirect('/auth/login')
    }

    // Protected route
    @Get('/profile')
    @Use('auth')
    profile(c: Context) {
        const user = c.auth.user // Typed user access
        return c.html(<ProfilePage user={user} />)
    }
}
```

**2. Decorator Injection (For advanced scenarios)**

Use `@InjectGuard()` when you need direct guard instance access:

```typescript
import { InjectGuard } from '@lockness/auth'
import type { SessionGuard, UserProvider } from '@lockness/auth'

type WebGuard = SessionGuard<true, UserProvider>

@Controller('/auth')
export class AuthController {
    @Post('/logout')
    @InjectGuard('web')
    async logout(c: Context, guard: WebGuard) {
        // guard is automatically injected and fully typed
        await guard.logout()
        return c.redirect('/auth/login')
    }
}
```

**3. Manual Access (For multiple guards)**

Use `getAuth(c).use()` when you need multiple guards:

```typescript
import { getAuth } from '@lockness/auth'

@Controller('/auth')
export class AuthController {
    @Post('/multi-auth')
    @Use(withAuth())
    async multiAuth(c: Context) {
        const auth = getAuth(c)

        // Use different guards based on request
        if (c.req.header('Authorization')) {
            const apiGuard = auth.use('api')
            return await apiGuard.check()
        } else {
            const webGuard = auth.use('web')
            return await webGuard.check()
        }
    }
}
```

**Available Methods on `c.auth`:**

| Method                                 | Description                           |
| -------------------------------------- | ------------------------------------- |
| `c.auth.user`                          | Get authenticated user (or undefined) |
| `c.auth.check()`                       | Check if authenticated                |
| `c.auth.login(email, pass, remember?)` | Login with credentials                |
| `c.auth.loginById(id, remember?)`      | Login by user ID                      |
| `c.auth.logout()`                      | Logout current user                   |
| `c.auth.guard()`                       | Get underlying guard instance         |

Password hashing:

```typescript
import { hashPassword, verifyPassword } from '@lockness/core'

const hash = await hashPassword('secret123')
const valid = await verifyPassword('secret123', hash)
```

### Social Authentication (OAuth2)

Add social login with Google, GitHub, Discord, and more:

```bash
# Scaffold auth with social providers
deno task cli make:auth --social
```

Configure providers in `app/kernel.ts`:

```typescript
import { configureSocialite } from '@lockness/core'

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
import { socialite, generateState, session } from '@lockness/core'

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
import { mail } from '@lockness/core'

await mail()
    .to('user@example.com')
    .subject('Welcome!')
    .html('<h1>Hello!</h1>')
    .send()
```

Configure mail in `app/kernel.ts`:

```typescript
import { configureMail } from '@lockness/core'

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
deno task cli make:job SendWelcomeEmail

# Process jobs
deno task cli queue:work

# Clear a queue
deno task cli queue:clear
```

Dispatch jobs from your application:

```typescript
import { dispatch } from '@lockness/core'
import { SendWelcomeEmailJob } from '@job/sendwelcomeemail_job.ts'

// Immediate dispatch
await dispatch(SendWelcomeEmailJob, { userId: 1, email: 'user@example.com' })

// Delayed dispatch (5 seconds)
await dispatch(SendWelcomeEmailJob, { userId: 1 }, { delay: 5000 })
```

Drivers: `memory` (dev) or `deno-kv` (production with persistence).

### Error Pages

Generate custom error pages with one command:

```bash
deno task cli make:error-pages
```

This creates 4 error page templates in `app/view/pages/errors/`:

- `not_found.tsx` (404)
- `unauthorized.tsx` (401)
- `forbidden.tsx` (403)
- `server_error.tsx` (500)

The command also generates `app/view/pages/errors/error_handler.tsx` with a
centralized error handler. Configure it in `app/kernel.tsx`:

```typescript
import { errorHandler } from '@view/pages/errors/error_handler.tsx'

// Option 1: Fluent API (recommended)
app.useErrorHandler(errorHandler)

// Option 2: Via config
await app.init({
    errorHandler,
    // ... other config
})
```

The generated `mod.tsx` file contains:

```typescript
export const errorHandler = (error: Error, c: Context) => {
    const status = (error as unknown as { status?: number }).status || 500
    switch (status) {
        case 404:
            return c.html(<NotFoundPage />, 404)
        case 401:
            return c.html(<UnauthorizedPage />, 401)
        case 403:
            return c.html(<ForbiddenPage />, 403)
        default:
            return c.html(<ServerErrorPage error={error} />, 500)
    }
}
```

Pages are generated with minimal HTML (no styling) so you can customize them
with your own CSS.

### Contributing to the Monorepo

Lockness is developed as a monorepo using Deno Workspaces. If you wish to
contribute to the framework itself, please follow these guidelines:

1. **Workspaces**: All core libraries are located in the `packages/` directory.
2. **Naming Convention**: Every library must use `mod.ts` as its main entry
   point and be registered in the root `deno.json` workspace array.
3. **Testing**: Run the global test suite with `deno task test` before
   submitting any changes.
4. **GitHub**: Submit your pull requests to the
   [locknessjs/lockness](https://github.com/locknessjs/lockness) repository.

For more detailed information, see the
[Contribution Guide](https://lockness.land/docs/contribution).
