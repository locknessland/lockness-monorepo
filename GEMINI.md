Fullstack MVC framework for Deno. Lockness JS is a fullstack Web framework with
a focus on ergonomics and speed. It takes care of much of the Web development
hassles, offering you a clean and stable API to build Web apps and
microservices.

## 🎯 Project Objective

The main objective of Lockness is to provide a robust and structured development
experience, similar to what is found in established ecosystems like **Laravel**,
**AdonisJS**, or **Symfony**, while leveraging the modernity and speed of Deno.

Lockness abstracts this layer to offer a complete and familiar MVC
(Model-View-Controller) architecture. Users interact exclusively with the
`@lockness/core` package, which re-exports all necessary Hono functionalities.

## 🚀 Philosophy

- **Solid Foundation**: Uses HonoJS under the hood for maximum performance, but
  fully encapsulated within `@lockness/core`.
- **Zero-Dependency Setup**: You only need `@lockness/core` in your imports;
  Hono and its utilities are automatically provided.
- **MVC Architecture**: A clear structure separating business logic, data, and
  display.
- **Inspiration**: Heavily inspired by the elegance of Laravel and AdonisJS.
- **Deno First**: Built natively for Deno, taking advantage of its security and
  modern tooling (native TypeScript, no `node_modules`, etc.).

## 🛠 Target Features

- **Expressive Routing**: (based on Hono but adapted for MVC)
- **Controllers**: Class-based controllers with decorators (`@Controller`,
  `@Get`, `@Post`, etc.) and automatic route generation
- **Robust Middleware Support**: Class-based middlewares with the `@Middleware`
  decorator, supporting global middlewares and named middleware registration
- **Dependency Injection**: A built-in IoC container managing services with
  `@Service` and `@Inject` decorators (TC39 Stage 3 decorators)
- **View Engine (JSX)**: Native JSX support powered by Hono's JSX runtime, fully
  integrated into `@lockness/core`. No extra `hono` imports required.
- **Modern CSS**: For the main monorepo, Tailwind CSS v4.1 for utility-first
  styling. Generated projects use PostCSS as a neutral CSS processor, allowing
  you to add any framework you prefer.
- **ORM / Query Builder**: Official integration with **Drizzle ORM** for
  type-safe database queries with PostgreSQL support.
- **Deprecation Contracts**: Elegant system to manage code evolution with
  logging and Devtools integration.
- **Production Ready**: Compile to standalone binaries with `deno compile`

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
    accessor userService!: UserService
}
```

The framework uses Hono's JSX runtime, but it is proxied through
`@lockness/core`. To ensure correct resolution, the root `deno.json` must be
configured with:

```json
"compilerOptions": {
    "jsx": "precompile",
    "jsxImportSource": "@lockness/core"
}
```

**Note:** You don't need to add `hono` to your `imports`. Everything is handled
by the framework.

**Note:** Lockness uses TC39 Stage 3 standard decorators natively supported by
Deno 2+. No `experimentalDecorators` flag is needed.

**Important:** Do NOT add Hono to your imports manually. Lockness manages its
own Hono version to ensure compatibility.

**For the monorepo:**

```json
"imports": {
    "@lockness/core": "jsr:@lockness/core@^0.1.0",
    "@tailwindcss/cli": "npm:@tailwindcss/cli@4.1"
}
```

**For generated projects (minimal setup):**

```json
"imports": {
    "@lockness/core": "jsr:@lockness/core@^0.1.0",
    "postcss": "npm:postcss@^8.4",
    "postcss-cli": "npm:postcss-cli@^11.0"
}
```

### Modern Development Workflow

Lockness uses a pure Deno workflow with automatic route generation for
controllers.

**CSS Configuration:**

- **Monorepo (this project)**: Uses Tailwind CSS v4.1 with standalone CLI
- **Generated projects (`deno task init`)**: Uses PostCSS as a neutral
  processor, no CSS framework by default

#### Development Mode

In development (`deno task dev`), the framework launches three parallel
processes:

1. **CSS Watcher**: Compiles CSS on file changes (Tailwind v4.1 for monorepo,
   PostCSS for generated projects)
2. **Routes Watcher**: Auto-detects new controllers and updates routes registry
3. **Deno Server**: Hot-reload enabled with native Deno watch mode

All processes run concurrently via `scripts/dev.sh`:

```bash
#!/bin/bash
trap 'kill $(jobs -p) 2>/dev/null' EXIT

# CSS watcher
deno task css:watch &

# Routes watcher
deno task routes:watch &

# Deno server (foreground)
deno run -A --watch --env main.ts
```

#### Automatic Route Generation

The routes system provides zero-configuration controller discovery:

**Development (auto-discovery):**

- Controllers in `app/controller/` are discovered at runtime
- File watcher detects changes and regenerates `app/routes.ts`
- No manual imports needed

**Production (compilation):**

- Routes are explicitly imported from `app/routes.ts`
- Enables `deno compile` to create standalone binaries
- Conditional logic based on `APP_ENV` variable

```typescript
// app/kernel.ts
const isDevelopment = Deno.env.get('APP_ENV') === 'development'

if (isDevelopment) {
    await app.init({
        controllersDir: './app/controller', // Auto-discovery
        // ...
    })
} else {
    await app.init({
        controllers, // Explicit imports from routes.ts
        // ...
    })
}
```

**Generated Routes File** (`app/routes.ts`):

```typescript
/**
 * ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * Generated by: scripts/generate_routes.ts
 */
import { AppController } from '@controller/app_controller.tsx'
import { AuthController } from '@controller/auth_controller.tsx'

export const controllers = [
    AppController,
    AuthController,
]
```

#### CSS Workflow

**For the Monorepo (Development):**

The main monorepo uses Tailwind CSS v4.1 compiled via standalone CLI:

```bash
# Manual CSS build
deno task css:build

# Watch mode (auto-compile on changes)
deno task css:watch
```

Configuration in `deno.json`:

```json
{
    "tasks": {
        "css:build": "deno run -A npm:@tailwindcss/cli@4.1 -i app/view/assets/app.css -o public/css/app.css",
        "css:watch": "deno run -A npm:@tailwindcss/cli@4.1 -i app/view/assets/app.css -o public/css/app.css --watch"
    },
    "imports": {
        "@tailwindcss/cli": "npm:@tailwindcss/cli@4.1"
    }
}
```

**For Generated Projects (`deno task init`):**

New projects are intentionally **framework-agnostic** and use PostCSS as a
neutral CSS processor:

```bash
# CSS tasks use postcss-cli
deno task css:build  # Compiles with PostCSS
deno task css:watch  # Watches with PostCSS
```

Generated `deno.json`:

```json
{
    "tasks": {
        "css:build": "deno run -A npm:postcss-cli@11 app/view/assets/app.css -o public/css/app.css",
        "css:watch": "deno run -A npm:postcss-cli@11 app/view/assets/app.css -o public/css/app.css --watch"
    },
    "imports": {
        "postcss": "npm:postcss@^8.4",
        "postcss-cli": "npm:postcss-cli@^11.0"
    }
}
```

The generated `postcss.config.js` is empty by default:

```javascript
export default {
    plugins: {},
}
```

This allows users to add **any CSS framework** they prefer:

- Plain CSS (default)
- Tailwind CSS (add `tailwindcss` plugin)
- Any PostCSS plugin ecosystem

See the generated project's README for instructions on adding Tailwind or other
frameworks.

#### Production Deployment

**Option 1: Deno Deploy (Recommended)**

Deploy directly to Deno Deploy cloud platform:

- **Entry point**: `main.ts`
- **Build command**: `deno task routes:generate && deno task css:build`
- **Environment**: Native TypeScript execution with TC39 decorators
- **Zero compilation**: Deno Deploy runs TypeScript directly

Configuration example:

```bash
# In Deno Deploy dashboard:
Entry Point: main.ts
Build Command: deno task routes:generate && deno task css:build
Environment Variables:
  APP_ENV=production
  DATABASE_URL=postgresql://...
```

**Option 2: Standalone Binary (VPS/Self-hosted)**

Create a self-contained executable for traditional hosting:

```bash
deno task compile
```

The compilation process:

1. Generates `app/routes.ts` with explicit controller imports
2. Compiles to binary (includes all controllers, services, views)
3. Binary uses static imports (no runtime discovery)

Output: `_dist/lockness` (~83MB) - fully self-contained executable including the
Deno runtime and all dependencies.

**Option 3: Direct Execution**

Run `main.ts` directly in production:

```bash
deno task start
# Or: deno run -A --env-file=.env.production.local main.ts
```

#### Static Assets

Static files in `public/` are served directly:

```typescript
// In your layout
<link rel="stylesheet" href="/css/app.css" />
<img src="/images/logo.png" alt="Logo" />
```

During development and production, Hono's `serveStatic()` middleware serves
these files from the `public/` directory.

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

### Request Validation with drizzle-zod

Lockness uses **drizzle-zod** to generate Zod validation schemas directly from
your Drizzle models. This eliminates duplication between your database schema
and validation logic:

```typescript
// app/model/user.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
})

// Generated schemas with optional refinements
export const insertUserSchema = createInsertSchema(users, {
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
})
export const selectUserSchema = createSelectSchema(users)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
```

Then use the `@Validate` decorator in your controllers:

```typescript
// app/controller/user_api_controller.ts
import { Context, Controller, Post, Validate } from '@lockness/core'
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

Validation targets: `json`, `query`, `param`, `header`, `cookie`, `form`.

On validation failure, returns:

```json
{
    "success": false,
    "message": "Validation failed",
    "errors": { "email": ["Invalid email format"] }
}
```

**Why drizzle-zod?** It generates Zod schemas from your Drizzle table
definitions, so you define your data structure once in the model. You can add
custom refinements (like email format, min length) while the base schema stays
in sync with your database.

Example repository:

```typescript
@Service()
export class UserRepository {
    @Inject(Database)
    accessor database!: Database

    async findAll(): Promise<User[]> {
        return await this.database.db.select().from(users)
    }
}
```

### Nessy CLI Wrapper

**Nessy** is a convenient CLI wrapper that simplifies your development workflow
by providing shortcuts for common commands. Instead of typing `deno task cli`
every time, just use `./nessy`.

#### Installation

Generate the Nessy wrapper in your project:

```bash
deno task cli nessy:install
```

This creates a `nessy` script (or `nessy.cmd` on Windows) in your project root.
The script is automatically added to `.gitignore`.

#### Basic Usage

```bash
# Instead of: deno task cli make:controller User
./nessy make:controller User

# All CLI commands work the same way
./nessy db:migrate
./nessy router:list
./nessy tinker
```

#### Developer Experience Commands

Nessy includes several built-in commands to improve your workflow:

| Command                  | Description                                 |
| ------------------------ | ------------------------------------------- |
| `./nessy dev`            | Start development server                    |
| `./nessy build`          | Build production bundle                     |
| `./nessy start`          | Start production server                     |
| `./nessy test [pattern]` | Run tests (optionally filtered)             |
| `./nessy check`          | Type-check all TypeScript files             |
| `./nessy fresh`          | Clean everything and reinstall dependencies |
| `./nessy clean`          | Remove build artifacts only                 |
| `./nessy watch`          | Dev server in watch mode                    |
| `./nessy status`         | Show project health information             |
| `./nessy install <pkg>`  | Add a dependency                            |
| `./nessy bump <version>` | Update all package versions                 |
| `./nessy --version`      | Show version information                    |
| `./nessy --help`         | Display comprehensive help                  |

#### Examples

```bash
# Scaffolding
./nessy make:controller Post
./nessy make:controller Post --view  # With automatic view generation
./nessy make:action Post show        # Add action to existing controller
./nessy make:action Post create --view --method=get
./nessy make:model Comment -a
./nessy make:auth --social

# Database operations
./nessy db:generate
./nessy db:migrate
./nessy db:studio

# Development workflow
./nessy dev           # Start server
./nessy test User     # Run user tests
./nessy check         # Verify types
./nessy router:list   # Show all routes with names

# Version management (for contributors)
./nessy bump 0.2.0    # Update all package versions

# Maintenance
./nessy clean         # Clean build
./nessy fresh         # Full reset
./nessy status        # Check health
```

#### Why Nessy?

1. **Faster to type**: `./nessy` vs `deno task cli`
2. **Consistent interface**: One command for all operations
3. **Enhanced DX**: Built-in shortcuts for common tasks
4. **Project-specific**: Generated per-project, not global
5. **Always up-to-date**: Calls `cli.ts` directly, no compilation needed
6. **Platform support**: Works on Unix/Linux/macOS/Windows

### Deprecation Contracts

Lockness provides a powerful deprecation system through the
`@lockness/deprecation-contracts` package. It helps you evolve your codebase
without breaking changes by providing clear warnings about deprecated features.

#### Installation

The deprecation system is optional and installed separately:

```bash
deno task cli package:install deprecation-contracts
```

This will:

- Add `@lockness/deprecation-contracts` to your `deno.json` imports
- Create environment variables in your `.env` file for configuration
- Enable deprecation tracking throughout your application

#### Using the Decorator

```typescript
import { Deprecated } from '@lockness/deprecation-contracts'

@Deprecated('1.2.0', 'Use NewService instead')
export class OldService {
    @Deprecated('1.1.0', 'This property will be removed')
    accessor oldConfig = {}

    @Deprecated('1.0.0', 'Use executeAsync() instead')
    execute() { ... }
}
```

#### Using the Function

For runtime deprecation notices:

```typescript
import { triggerDeprecation } from '@lockness/deprecation-contracts'

triggerDeprecation('my-pkg', '1.0.0', 'Use newFunction() instead')

// With dynamic values
triggerDeprecation('my-pkg', '1.0.0', 'Method %s is deprecated', 'oldMethod')
```

#### Configuration

Control deprecation behavior via environment variables:

```bash
# .env
STRICT_DEPRECATIONS=false  # Set to 'true' to throw errors instead of warnings
IGNORE_DEPRECATIONS=false  # Set to 'true' to completely disable deprecations
```

#### Devtools Integration

When both `@lockness/devtools` and `@lockness/deprecation-contracts` are
installed, deprecations are automatically captured and displayed in the Devtools
toolbar with:

- Full stack trace for each deprecation
- Package name and version information
- Timestamp and occurrence count
- Quick navigation to source code

The integration is **automatic** - no configuration needed. If you only install
devtools, deprecations will still be logged to the console, and you'll see a
suggestion to install the deprecation-contracts package for full tracking.

### Named Routes

Lockness allows you to assign names to your routes, making it easier to generate
URLs without hardcoding paths. This is especially useful for navigation links
and redirects.

**Assigning Names:**

Use the optional options object in route decorators:

```typescript
@Controller('/auth')
export class AuthController {
    @Get('/login', { name: 'auth.login' })
    showLogin(c: Context) { ... }

    @Post('/login', { name: 'auth.login.submit' })
    async login(c: Context) { ... }
}
```

**Generating URLs:**

Use the `route(name, params?)` helper function:

```typescript
import { route } from '@lockness/core'

// Simple URL
const loginUrl = route('auth.login') // "/auth/login"

// With parameters
// Route: @Get('/users/:id', { name: 'users.show' })
const userUrl = route('users.show', { id: 123 }) // "/users/123"

// In a redirect
return c.redirect(route('auth.login'))
```

**Listing Named Routes:**

The `./nessy router:list` command displays all route names in a dedicated
column.

### Session Management

Lockness provides a flexible session management system with multiple driver
support. Sessions are stored server-side (or in encrypted cookies) and accessed
via a simple API.

**Configuration in kernel.ts:**

```typescript
import { configureSession, createSessionMiddleware } from '@lockness/core'

// Configure session
configureSession({
    driver: 'cookie', // 'cookie' | 'deno-kv' | 'memory'
    secret: Deno.env.get('APP_KEY') || 'change-me',
    lifetime: 7200, // 2 hours in seconds
    secure: Deno.env.get('APP_ENV') === 'production',
})

// Add to global middlewares
await app.init({
    globalMiddlewares: [createSessionMiddleware()],
})
```

**Using sessions in controllers:**

```typescript
import { Context, Controller, Get, Post, session } from '@lockness/core'

@Controller('/dashboard')
export class DashboardController {
    @Get('/')
    index(c: Context) {
        const sess = session(c)

        // Get values
        const userId = sess.get<number>('user_id')
        const visits = sess.get('visits', 0) as number

        // Set values
        sess.set('visits', visits + 1)

        // Flash messages (available only for next request)
        sess.flash('success', 'Welcome back!')

        return c.json({ userId, visits })
    }

    @Post('/logout')
    async logout(c: Context) {
        const sess = session(c)

        // Destroy session
        await sess.destroy()

        return c.redirect('/login')
    }

    @Post('/login')
    async login(c: Context) {
        const sess = session(c)

        // Regenerate session ID (security best practice after login)
        await sess.regenerate()

        sess.set('user_id', 123)
        return c.redirect('/dashboard')
    }
}
```

**Session API:**

| Method               | Description                         |
| -------------------- | ----------------------------------- |
| `get(key, default?)` | Get a value from session            |
| `set(key, value)`    | Set a value in session              |
| `has(key)`           | Check if key exists                 |
| `forget(key)`        | Remove a key                        |
| `all()`              | Get all session data                |
| `flush()`            | Clear all data                      |
| `regenerate()`       | Regenerate session ID (after login) |
| `destroy()`          | Destroy the session                 |
| `flash(key, value)`  | Flash data for next request         |
| `getFlash(key)`      | Get flash data                      |

**Available Drivers:**

- **cookie**: Stores encrypted session data in cookies (default, no server
  storage needed)
- **deno-kv**: Uses Deno KV for distributed session storage (with TTL support)
- **memory**: In-memory storage (for development only)

### Package Management

Lockness provides a powerful package management system that automatically
configures and integrates additional features into your application.

#### Configuration-Based Loading

Packages are declared in the `lockness` section of your `deno.json`:

```json
{
    "lockness": {
        "packages": [
            "drizzle",
            "openapi",
            "cache"
        ]
    }
}
```

When your application starts, Lockness automatically:

1. Loads each package from the list
2. Registers their CLI commands
3. Makes their services available via dependency injection

#### Installing Packages

Lockness provides three ways to install packages:

**Option 1: Automated Installation (Recommended)**

```bash
deno task cli package:install openapi
```

This command:

- Adds the package to `deno.json`
- Runs the package's install script
- Creates necessary files and configurations
- Displays next steps

**Option 2: Manual Configuration**

```bash
deno task cli package:add openapi
```

This only adds the package to your configuration. You'll need to follow the
package's documentation for manual setup.

**Option 3: Direct Script Execution**

```bash
deno run -A jsr:@lockness/openapi/install
```

#### Removing Packages

```bash
deno task cli package:remove openapi
```

This removes the package from `deno.json`. You'll need to manually delete any
generated files if desired.

#### How It Works (Zero-Config Extension)

The `loadPackageCommands()` function enables zero-configuration command
discovery. When you add a package to your `deno.json`, its commands are
automatically made available to the CLI without changing a single line of code
in your project.

```typescript
// cli.ts (Your project's entry point)
import { Cli, loadPackageCommands, registerCoreCommands } from '@lockness/cli'

const cli = new Cli()
registerCoreCommands(cli)

// Dynamically loads commands from packages listed in deno.json "lockness.packages"
await loadPackageCommands(cli)

await cli.discoverCommands('./app/command')
```

#### Official Packages

- **@lockness/drizzle**: Drizzle ORM integration with migrations, seeders, and
  CLI commands
- **@lockness/openapi**: OpenAPI/Swagger documentation with automatic spec
  generation
- **@lockness/cache**: Multi-driver caching system (Memory, Deno KV, Redis)
- **@lockness/socialite**: OAuth2 authentication (Google, GitHub, Discord)

#### Creating Custom Packages

Packages export a register function from their main entry point:

```typescript
// my-package/mod.ts
import type { Cli } from '@lockness/cli'

export function registerMyPackageCommands(cli: Cli) {
    cli.register('my:command', async () => {
        console.log('Hello from my package!')
    }, 'My custom command')
}
```

Optionally, create an install script:

```typescript
// my-package/install.ts
import { addPackage } from '@lockness/cli'

async function main() {
    console.log('🌊 Installing my-package...\n')
    await addPackage('my-package')
    // Create config files, controllers, etc.
    console.log('✅ Installation complete!')
}

if (import.meta.main) {
    await main()
}
```

#### Package Development Standards

To maintain consistency and ensure compatibility with the Lockness ecosystem
(and JSR), all libraries must follow these standards:

1. **Entry Point**: Use `mod.ts` as the main entry point.
2. **Exports**: Explicitly define exports in `deno.json`.
3. **Tests**:
   - Place all tests in a dedicated `tests/` directory.
   - Use the `*.test.ts` naming convention (e.g., `validator.test.ts`).
   - Standardize the `test` task in `deno.json` to `deno test -A tests/`.
4. **Publication**:
   - Use the `publish` field in `deno.json` to `include` only necessary source
     files and `exclude` the `tests/` directory.
5. **Imports**:
   - Use named workspace imports (e.g., `@lockness/cli`, `@lockness/core`) for
     cross-package dependencies instead of relative paths.
   - Reference these in the `imports` section of the package's `deno.json`.

Example `deno.json` for a package:

```json
{
    "name": "@lockness/my-package",
    "version": "0.1.0",
    "exports": "./mod.ts",
    "tasks": {
        "test": "deno test -A tests/",
        "test:watch": "deno test -A --watch tests/"
    },
    "publish": {
        "include": ["mod.ts", "app/**/*.ts", "deno.json", "README.md"],
        "exclude": ["tests/"]
    },
    "imports": {
        "@lockness/core": "../core/mod.ts"
    }
}
```

### Authentication System

Lockness provides a complete authentication system with session-based auth,
password hashing, and guards.

**Quick Setup:**

```bash
# Scaffold auth controller and user provider
deno task cli make:auth
```

**Configure in kernel.ts:**

```typescript
import { configureAuth, container } from '@lockness/core'
import { UserProvider } from '@provider/user_provider.ts'

// Configure authentication
configureAuth({
    userProvider: container.get(UserProvider),
    redirectTo: '/auth/login',
})
```

**Using auth in controllers:**

```typescript
import { Controller, Get, Post, Auth, Guest, Context, auth, session } from '@lockness/core'

@Controller('/dashboard')
@Auth() // Protect entire controller
export class DashboardController {
    @Get('/')
    async index(c: Context) {
        const user = await auth(c).user()
        return c.json({ user })
    }
}

@Controller('/auth')
export class AuthController {
    @Guest('/dashboard') // Redirect if already logged in
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

**Auth Guard API:**

| Method                         | Description                        |
| ------------------------------ | ---------------------------------- |
| `auth(c).check()`              | Check if user is authenticated     |
| `auth(c).guest()`              | Check if user is NOT authenticated |
| `auth(c).user()`               | Get authenticated user             |
| `auth(c).id()`                 | Get user ID from session           |
| `auth(c).attempt(email, pass)` | Attempt login with credentials     |
| `auth(c).login(user)`          | Log in a user directly             |
| `auth(c).loginById(id)`        | Log in user by ID                  |
| `auth(c).logout()`             | Log out current user               |

**Password Hashing:**

```typescript
import { hashPassword, verifyPassword } from '@lockness/core'

// Hash a password (for registration)
const hash = await hashPassword('secret123')

// Verify password (for login)
const valid = await verifyPassword('secret123', hash)
```

**Decorators:**

- `@Auth()` - Require authentication (redirects to login or returns 401)
- `@Guest(redirectTo?)` - Require NOT authenticated (for login/register pages)

Both decorators can be used at class or method level.

### Social Authentication (Socialite)

Lockness provides OAuth2 social login with built-in support for Google, GitHub,
and Discord.

**Scaffold with social auth:**

```bash
deno task cli make:auth --social
```

**Configuration in kernel.ts:**

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

**Using socialite in controllers:**

```typescript
import { generateState, session, socialite } from '@lockness/core'

@Controller('/auth')
export class SocialAuthController {
    @Get('/google')
    google(c: Context) {
        const state = generateState()
        session(c).set('oauth_state', state)
        return socialite('google').redirect(state)
    }

    @Get('/google/callback')
    async googleCallback(c: Context) {
        // Verify CSRF state
        const storedState = session(c).get('oauth_state')
        const returnedState = c.req.query('state')
        if (storedState !== returnedState) {
            return c.redirect('/auth/login')
        }

        const user = await socialite('google').user(c)
        // user: { id, email, name, avatar, accessToken, refreshToken, raw }

        // Find or create user in your database, then log them in
        session(c).set('user_id', user.id)
        return c.redirect('/dashboard')
    }
}
```

**SocialUser object:**

| Property       | Type             | Description                  |
| -------------- | ---------------- | ---------------------------- |
| `id`           | `string`         | Provider-specific user ID    |
| `email`        | `string`         | User's email                 |
| `name`         | `string`         | User's display name          |
| `avatar`       | `string \| null` | Avatar URL                   |
| `accessToken`  | `string`         | OAuth access token           |
| `refreshToken` | `string \| null` | Refresh token (if available) |
| `expiresIn`    | `number \| null` | Token expiration (seconds)   |
| `raw`          | `object`         | Raw provider response        |

**Custom providers:**

```typescript
import { BaseOAuth2Driver, registerSocialiteDriver } from '@lockness/core'

class CustomDriver extends BaseOAuth2Driver {
    protected authUrl = 'https://custom.com/oauth/authorize'
    protected tokenUrl = 'https://custom.com/oauth/token'
    protected userInfoUrl = 'https://custom.com/api/user'
    protected defaultScopes = ['profile', 'email']

    async getUserFromTokens(tokens) {
        // Fetch and normalize user data
    }
}

registerSocialiteDriver('custom', CustomDriver)
```

### Mail System

Lockness provides an expressive API for sending emails with multiple driver
support (Console, Memory, SMTP, Resend).

**Configuration in kernel.ts:**

```typescript
import { configureMail } from '@lockness/core'

configureMail({
    driver: (Deno.env.get('MAIL_DRIVER') as 'console' | 'smtp' | 'resend') ||
        'console',
    from: {
        email: Deno.env.get('MAIL_FROM_ADDRESS') || 'noreply@example.com',
        name: Deno.env.get('MAIL_FROM_NAME') || 'Lockness App',
    },
    // SMTP configuration
    smtp: {
        host: Deno.env.get('SMTP_HOST') || 'localhost',
        port: Number(Deno.env.get('SMTP_PORT')) || 587,
        auth: {
            user: Deno.env.get('SMTP_USER') || '',
            pass: Deno.env.get('SMTP_PASS') || '',
        },
    },
    // Resend configuration
    resend: {
        apiKey: Deno.env.get('RESEND_API_KEY') || '',
    },
})
```

**Sending emails with fluent API:**

```typescript
import { mail } from '@lockness/core'

// Simple email
await mail()
    .to('user@example.com')
    .subject('Welcome!')
    .html('<h1>Hello!</h1>')
    .send()

// Full featured email
await mail()
    .from('support@myapp.com', 'Support Team')
    .to('user@example.com', 'John Doe')
    .cc('manager@myapp.com')
    .replyTo('noreply@myapp.com')
    .subject('Your order has shipped')
    .text('Plain text version')
    .html('<h1>Your order has shipped!</h1>')
    .attach('invoice.pdf', pdfContent, 'application/pdf')
    .send()

// Using JSX templates
await mail()
    .to(user.email)
    .subject('Welcome!')
    .view(<WelcomeEmail user={user} />)
    .send()
```

**Available Drivers:**

| Driver    | Description             | Use Case          |
| --------- | ----------------------- | ----------------- |
| `console` | Logs email to console   | Development       |
| `memory`  | Stores emails in memory | Testing           |
| `smtp`    | Sends via SMTP server   | Self-hosted       |
| `resend`  | Sends via Resend API    | Production (SaaS) |

**Testing emails:**

```typescript
import { MemoryMailDriver } from '@lockness/core'

// After sending emails in tests
const sent = MemoryMailDriver.getSentEmails()
const lastEmail = MemoryMailDriver.getLastEmail()
MemoryMailDriver.clear()
```

### Background Jobs & Queues

Lockness provides a queue system for processing jobs in the background. Perfect
for sending emails, processing uploads, or any long-running task.

**Create a job:**

```bash
deno task cli make:job SendWelcomeEmail
```

This creates `app/job/sendwelcomeemail_job.ts`:

```typescript
import { type Job, type JobPayload } from '@lockness/core'

interface SendWelcomeEmailPayload extends JobPayload {
    userId: number
    email: string
}

export class SendWelcomeEmailJob implements Job<SendWelcomeEmailPayload> {
    name = 'send-welcome-email'
    maxAttempts = 3

    async handle(payload: SendWelcomeEmailPayload): Promise<void> {
        // Send the email
        await mail()
            .to(payload.email)
            .subject('Welcome!')
            .html('<h1>Welcome to our app!</h1>')
            .send()
    }

    async failed(
        payload: SendWelcomeEmailPayload,
        error: Error,
    ): Promise<void> {
        console.error('Failed to send welcome email:', error)
        // Log to error tracking service
    }
}
```

**Dispatch a job:**

```typescript
import { dispatch } from '@lockness/core'
import { SendWelcomeEmailJob } from '@job/sendwelcomeemail_job.ts'

// Dispatch immediately
await dispatch(SendWelcomeEmailJob, { userId: 1, email: 'user@example.com' })

// Dispatch with delay (5 seconds)
await dispatch(SendWelcomeEmailJob, { userId: 1, email: 'user@example.com' }, {
    delay: 5000,
})

// Dispatch to specific queue
await dispatch(SendWelcomeEmailJob, { userId: 1, email: 'user@example.com' }, {
    queue: 'emails',
})
```

**Process jobs:**

```bash
# Process jobs from default queue
deno task cli queue:work

# Process specific queue
deno task cli queue:work --queue=emails

# Process multiple queues
deno task cli queue:work --queue=high,default,low

# Process once and stop when empty
deno task cli queue:work --once

# Clear a queue
deno task cli queue:clear emails
```

**Configure queue driver:**

```typescript
import { configureQueue } from '@lockness/core'

configureQueue({
    driver: 'deno-kv', // 'memory' | 'deno-kv'
    defaultQueue: 'default',
    retryDelay: 3000, // ms before retry
})
```

**Available Drivers:**

| Driver    | Description                   | Use Case                |
| --------- | ----------------------------- | ----------------------- |
| `memory`  | In-memory queue               | Development, testing    |
| `deno-kv` | Persistent queue with Deno KV | Production, distributed |

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
│   ├── cli/               # CLI Command Engine (Cli)
│   ├── drizzle/           # Drizzle ORM Extension
│   └── init/              # Scaffolding & Project Init
├── app/                   # 🚀 Framework Template (Boilerplate)
│   ├── controller/        # HTTP Controllers
│   ├── model/             # Database Models
│   ├── service/           # Business Logic
│   └── kernel.ts          # App Initialization
├── data/                  # Static Data & Assets
├── docs/                  # Documentation & AI Rules
├── scripts/               # Build & Internal Scripts
├── _output/               # Build Artifacts & Binaries
├── main.ts                # Entry point
├── cli.ts                 # CLI Entry point
└── deno.json              # Config & Aliases
```

- **`lockness/`**: Contains the decoupled libraries. This modularity allows for
  an ORM-agnostic core while providing official extensions like
  `lockness-drizzle`.
- **Root Files & `app/`**: Boilerplate structure generated for users.
- **`docs/`**: Contains reference documentation and rules, including HonoJS
  docs, for AI assistance.
- **`dist/`**: Output directory for production SSR builds (`server.js`).

## ⚙️ Development Workflow

- **Quality Assurance**: Every code modification must be validated by running
  `deno fmt` and `deno lint`. This ensures that the codebase remains clean,
  consistent, and free of linting errors.
- **Stub Synchronization**: When modifying source files that have corresponding
  stubs (see `STUBS.md`), always update the stub templates as well. This ensures
  that newly scaffolded projects stay in sync with the framework's latest
  features. Key mappings:
  - `app/kernel.ts` → `lockness/init/stubs/init/app/kernel.ts.stub`
  - `deno.json` → `lockness/init/stubs/init/deno.json.stub`
  - `README.md` → `lockness/init/stubs/init/README.md.stub`
  - `make:*` command outputs → corresponding stubs in `lockness/cli/stubs/` and
    `lockness/drizzle/stubs/`

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
  - `deno task cli init`: Scaffolds a new project.
  - `deno task cli make:model <Name> [-r] [-s] [-c] [-a]`: Scaffolds a model
    with optional repository (-r), seeder (-s), controller (-c), or all (-a).
  - `deno task cli make:middleware <Name>`: Creates a new middleware class.
  - `deno task cli make:component <Name>`: Creates a new JSX component.
  - `deno task cli make:command <Name>`: Creates a new CLI command.
  - `deno task cli db:generate`: Generates database migrations.
  - `deno task cli db:migrate`: Applies pending migrations.
  - `deno task cli db:push`: Pushes schema directly to database.
  - `deno task cli db:studio`: Launches Drizzle Studio.
  - `deno task cli make:seeder`: Creates a new seeder class.
  - `deno task cli db:seed`: Runs database seeders.
  - `deno task cli router:list`: Displays all registered routes.
  - `deno task cli tinker`: Starts an interactive REPL session.
  - `deno task test`: Runs the test suite.
  - `deno task test:coverage`: Runs tests with coverage report.
  - `deno task test:watch`: Runs tests in watch mode.

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ METHOD ┃ PATH           ┃ CONTROLLER     ┃ ACTION ┃ MIDDLEWARES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ GET    ┃ /              ┃ AppController  ┃ index  ┃ -
┃ POST   ┃ /api/users     ┃ UserController ┃ create ┃ @Auth, @Validate
┃ GET    ┃ /api/users/:id ┃ UserController ┃ show   ┃ auth
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### CLI Tinker (REPL)

The `cli tinker` command starts an interactive REPL (Read-Eval-Print Loop) for
exploring your application. It automatically loads:

- **Models**: All exports from `app/model/`
- **Services**: All classes from `app/service/`
- **Repositories**: All classes from `app/repository/`
- **Database**: The `db` instance from your kernel (if available)

```bash
$ deno task cli tinker

🔮 Lockness Tinker - Interactive REPL
Type ".help" for commands, ".exit" to quit

📦 Loaded: users, insertUserSchema, UserService, UserRepository

>>> 2 + 2
4
>>> users
{ ... } # Your users table schema
>>> await UserRepository.findAll()
[{ id: 1, email: "..." }, ...]
>>> .exit
👋 Bye!
```

**REPL Commands:**

- `.help` - Show available commands
- `.context` - List loaded variables and their types
- `.clear` - Clear the screen
- `.exit` - Exit the REPL

The REPL supports:

- **Async/await**: Top-level await is supported
- **Multiline input**: Open braces `{` start multiline mode
- **Colored output**: Results are syntax-highlighted

## 🐳 Docker Deployment

Lockness includes a production-ready Dockerfile with multi-stage build for
optimized images.

### Dockerfile Structure

```dockerfile
ARG DENO_VERSION=2.6.3

# Stage 1: Build
FROM denoland/deno:${DENO_VERSION} AS builder
# ... builds the SSR bundle

# Stage 2: Production
FROM denoland/deno:${DENO_VERSION} AS production
# ... runs the optimized server
```

**Features:**

- Multi-stage build (smaller final image)
- Non-root user for security
- Health check endpoint
- Configurable Deno version via `ARG`

### Build & Run

```bash
# Build the image
docker build -t my-lockness-app .

# Run the container
docker run -p 8888:8888 --env-file .env.production my-lockness-app

# Override Deno version at build time
docker build --build-arg DENO_VERSION=2.7.0 -t my-app .
```

### .dockerignore

The `.dockerignore` file excludes unnecessary files from the build context:

- `node_modules/`, `.git/`, `coverage/`
- Environment files (`.env`, `.env.local`)
- Test files (`*.test.ts`)
- IDE files (`.vscode/`, `.idea/`)

## 🌊 Contributing to the Monorepo

Lockness is a monorepo that uses **Deno Workspaces** to manage its internal
libraries. This allows for a clean separation of concerns while maintaining a
single source of truth for development.

### Workspace Structure

- `lockness/`: Each subdirectory is an independent Deno package.
- `lockness/*/mod.ts`: Every library MUST use `mod.ts` as its main entry point
  (standardized convention).
- `lockness/*/deno.json`: Package configuration including name (e.g.,
  `@lockness/core`), version, and exports.

### Unified Development

- **Imports**: Use public package names (e.g., `@lockness/auth`) for internal
  cross-package dependencies. Deno resolves these to local paths automatically.
- **Testing**: Run `deno task test` from the root to execute all workspace
  tests.
- **Publication**: Publication to JSR is handled atomicaly from the root.

### Contribution Rules

1. **Exports**: Always expose public APIs through `mod.ts`.
2. **Workspaces**: Do not manually add `@lockness/*` mappings to the root
   `deno.json`'s `imports` section.
3. **Registry**: Register any new library in the `workspace` array of the root
   `deno.json`.
4. **Version Management**: When releasing new versions, use
   `deno task bump <version>` to update all packages and their
   inter-dependencies atomically. This ensures version consistency across the
   entire monorepo.
5. **GitHub**: The official monorepo is located at
   [locknessjs/lockness](https://github.com/locknessjs/lockness).
