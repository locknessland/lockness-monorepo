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

- **Solid Foundation**: Uses HonoJS under the hood for maximum performance,
  fully integrated within `@lockness/core`.
- **Minimal Core**: `@lockness/core` includes only essentials (DI + Hono).
  Optional features (sessions, queues, cache) are imported explicitly when
  needed.
- **Modular Architecture**: Choose what you need - build lightweight APIs or
  full-featured web apps by adding packages as required.
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
- **Reusable Components & Layouts**: Build consistent UIs with composable JSX
  components and page layouts (navigation, page structure, etc.)
- **Authentication Decorators**: `@AuthRequired()`, `@AuthOptional()`,
  `@AuthGuard()` decorators with optional redirect support
- **Modern CSS**: For the main monorepo, Tailwind CSS v4.1 for utility-first
  styling. Generated projects use PostCSS as a neutral CSS processor, allowing
  you to add any framework you prefer.
- **ORM / Query Builder**: Official integration with **Drizzle ORM** for
  type-safe database queries with PostgreSQL support.
- **Multi-ORM Support**: ORM-agnostic authentication providers via
  `@lockness/auth-provider` (Drizzle, Kysely, Prisma, TypeORM ready)
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

### Core Architecture (SOLID Principles)

The `@lockness/core` package follows SOLID design principles with a modular,
maintainable architecture:

#### Component Structure

The framework is composed of focused, single-responsibility components:

- **App**: Main orchestrator that coordinates all framework components
- **MiddlewareResolver**: Resolves middleware from classes, functions, and named
  strings
- **ControllerDiscovery**: Scans directories and discovers controller classes
- **RouteRegistry**: Manages route registration, sorting, and Hono integration
- **ErrorHandlerRegistry**: Auto-discovers and manages error handlers
- **StaticFileServer**: Handles static file serving configuration
- **ServerListener**: Manages server startup, port conflicts, and console output

#### Design Benefits

- **Maintainability**: Each component is < 200 lines with a single, clear
  purpose
- **Testability**: Components can be unit tested in isolation
- **Extensibility**: New features can be added without modifying existing
  components
- **Backward Compatibility**: Public API remains stable across internal
  refactoring

#### Architecture Philosophy

The App class acts as a lightweight orchestrator, delegating responsibilities to
specialized components. This approach:

- Reduces complexity in the main App class (from 520 to 269 lines)
- Enables parallel development of features
- Makes the codebase easier to understand for contributors
- Follows the Open/Closed Principle (open for extension, closed for
  modification)

#### Modular Package System

Lockness follows a **modular architecture** where `@lockness/core` provides the
essential framework features, and optional packages are imported explicitly:

**Core Package (`@lockness/core`):**

- Framework fundamentals (App, decorators, routing)
- Dependency Injection system (`@lockness/container`)
- Complete Hono re-export (middleware, utilities, client)
- JSX runtime and components

**Optional Packages (import as needed):**

- `@lockness/session` - Session management (cookie, Deno KV, memory)
- `@lockness/queue` - Background job processing
- `@lockness/cache` - Caching system (memory, Redis, Deno KV)
- `@lockness/logger` - Structured logging
- `@lockness/validator` - Request validation
- `@lockness/mail` - Email sending
- `@lockness/storage` - File storage (local, S3, R2)
- `@lockness/auth` - Authentication system
- `@lockness/socialite` - OAuth providers
- `@lockness/ui` - UI components library with CLI tooling (see UI Components
  section)

**Benefits:**

- **Lightweight**: APIs don't bundle unused session/queue code
- **Explicit**: Clear dependencies in each project
- **Flexible**: Mix and match packages for your use case
- **Zero Conflicts**: Hono middleware keeps original names (cache, logger,
  validator)

#### Layered Architecture

Lockness follows a clear layered architecture where `@lockness/core` serves as
the unified public API, abstracting away the underlying Hono implementation:

```
┌─────────────────────────────────────────┐
│  User Application Layer                 │  ← Imports only from @lockness/core
├─────────────────────────────────────────┤
│  Framework API (@lockness/core)         │  ← Single public API, re-exports Hono
├─────────────────────────────────────────┤
│  Internal Bridge (@lockness/hono)       │  ← Manages Hono versions, JSR-npm bridge
├─────────────────────────────────────────┤
│  External Dependency (npm:hono)         │  ← Underlying web framework
└─────────────────────────────────────────┘
```

**Key Principles:**

- **Single Entry Point**: Developers import everything from `@lockness/core`
- **Internal Abstraction**: `@lockness/hono` is an internal package managing npm
  dependencies
- **Version Management**: Centralized Hono version control across the ecosystem
- **Framework Agnostic**: Users don't need to know Hono is used under the hood

**Example Usage:**

```typescript
// ✅ Unified import from @lockness/core
import {
    App,
    basicAuth,
    Context,
    Controller,
    cors,
    Get,
    logger,
} from '@lockness/core'

// Everything you need in one import!
const app = new App()
app.useMiddleware(
    logger(),
    cors(),
    basicAuth({ username: 'admin', password: 'secret' }),
)
```

**For the monorepo:**

```json
"imports": {
    "@lockness/core": "jsr:@lockness/core@^0.1.0",
    "tailwindcss": "npm:tailwindcss@^4.1",
    "@tailwindcss/cli": "npm:@tailwindcss/cli@^4.1"
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

Lockness uses a **multi-terminal development workflow** for optimal stability.
Each process runs in its own terminal:

**Terminal 1 - CSS Watcher:**

```bash
deno task css:watch
```

Compiles CSS on file changes (Tailwind v4.1 for monorepo, PostCSS for generated
projects)

**Terminal 2 - Development Server:**

```bash
deno task dev
```

Runs the Deno server with hot-reload enabled

**Routes are automatically updated** when you create or modify controllers. The
routes registry (`app/routes.ts`) is regenerated on-the-fly without a separate
watcher. The `deno task routes:watch` command exists but is typically not needed
during development.

**Why separate terminals?** Running multiple file watchers concurrently in a
single shell script can cause I/O conflicts and prevent proper file detection.
Separate terminals ensure each watcher has dedicated process isolation and
reliable file system monitoring.

#### Automatic Route Generation

The routes system provides **zero-configuration controller discovery** through
the `@lockness/core` App class:

**How Auto-Discovery Works:**

The `App.discoverControllers()` method in `@lockness/core` automatically:

1. **Scans** the `app/controller/` directory for `.ts`, `.tsx`, and `.js` files
2. **Imports** each file dynamically at runtime
3. **Detects** classes decorated with `@Controller()` by checking for the
   `_basePath` metadata
4. **Instantiates** controllers temporarily to trigger TC39 decorator metadata
   initialization
5. **Registers** routes defined with `@Get()`, `@Post()`, etc. decorators
6. **Maps** named routes (e.g., `{ name: 'users.show' }`) for URL generation

This happens automatically when you call `app.init()` with `controllersDir`:

```typescript
// Development: auto-discovery from directory
const app = new App()
app.useMiddleware(sessionMiddleware() /* ... */)

await app.init({
    controllersDir: './app/controller',
})

// Production: explicit imports for compilation
import { controllers } from './app/routes.ts'

const app = new App()
app.useMiddleware(sessionMiddleware() /* ... */)

await app.init({
    controllers,
})
```

**Development (auto-discovery):**

- Controllers in `app/controller/` are discovered at runtime
- File watcher detects changes and regenerates `app/routes.ts`
- No manual imports needed

**Development (auto-discovery):**

- Controllers in `app/controller/` are discovered at runtime by scanning the
  directory
- The `App.discoverControllers()` method dynamically imports each file
- Classes with `@Controller()` decorator are automatically detected via
  `_basePath` metadata
- Routes are registered on-the-fly without manual configuration
- Hot-reload with `--watch` flag automatically picks up changes

**Production (compilation):**

- Routes are explicitly imported from `app/routes.ts` (pre-generated)
- Enables `deno compile` to create standalone binaries with all controllers
  bundled
- No runtime discovery needed - all imports are static
- Conditional logic based on `APP_ENV` variable

**The `app/routes.ts` file** is auto-generated by the CLI when you:

- Create a controller with `deno task cli make:controller`
- Run `deno task routes:generate` manually
- Use the optional `deno task routes:watch` for continuous updates

```typescript
// app/kernel.tsx - Simplified conditional routing strategy
await app.init({
    controllersDir: app.isDevelopment ? './app/controller' : undefined,
    controllers: app.isDevelopment ? undefined : controllers,
    staticDir: 'public',
})
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
        "tailwindcss": "npm:tailwindcss@^4.1",
        "@tailwindcss/cli": "npm:@tailwindcss/cli@^4.1"
    }
}
```

**Important:** Both packages are required:

- `tailwindcss` - The core Tailwind CSS engine (needed for
  `@import "tailwindcss"`)
- `@tailwindcss/cli` - The standalone CLI tool for compilation

Your CSS file (`app/view/assets/app.css`) should start with:

```css
@import 'tailwindcss';

@custom-variant dark (&:is(.dark *));

/* Your custom CSS variables and styles */
:root {
    --background: oklch(0.9821 0 0);
    /* ... */
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
2. Builds production CSS assets
3. Copies `public/` folder to `_dist/` for static file serving
4. Compiles to binary (includes all controllers, services, views)
5. Binary uses static imports (no runtime discovery)

Output: `_dist/lockness` (~92MB) - fully self-contained executable including the
Deno runtime, all dependencies, and static assets.

**Important:** The compiled binary looks for static files in the `public/`
directory relative to its location. The compile task automatically copies the
public folder to `_dist/public/` to ensure CSS, images, and other assets are
available.

**Deploying the Binary:**

```bash
# Copy the entire _dist folder to your server
scp -r _dist/ user@server:/opt/myapp/

# On the server, run the binary
cd /opt/myapp/_dist
./lockness
```

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
import { z } from '@lockness/validator'

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

### Error Handling

Lockness provides a comprehensive error handling system with automatic
discovery, elegant error pages, and clean console output.

#### Auto-Discovery of Custom Error Handlers

The framework automatically detects custom error handlers without requiring
manual registration in your kernel. This follows the same zero-configuration
philosophy as frameworks like AdonisJS and Symfony.

**How it works:**

When your application starts, `@lockness/core` automatically checks for a custom
error handler at:

```
app/view/pages/errors/error_handler.tsx
```

If found, it's used automatically. If not, the framework uses its built-in
default error handler.

**Creating Custom Error Pages:**

```bash
# Generate error pages with inline CSS (framework-agnostic)
deno task cli make:error-pages
```

This creates:

- `app/view/pages/errors/error_handler.tsx` - Main error handler
- `app/view/pages/errors/not_found.tsx` - 404 page
- `app/view/pages/errors/unauthorized.tsx` - 401 page
- `app/view/pages/errors/forbidden.tsx` - 403 page
- `app/view/pages/errors/server_error.tsx` - 500 page

**Example Custom Error Handler:**

```typescript
// app/view/pages/errors/error_handler.tsx
import { Context, formatErrorForConsole, HTTPException } from '@lockness/core'
import { NotFoundPage } from './not_found.tsx'
import { ServerErrorPage } from './server_error.tsx'

export function errorHandler(error: Error, c: Context) {
    // Use the centralized error formatter
    formatErrorForConsole(error, 500, c.req.path)

    if (error instanceof HTTPException) {
        const status = error.status

        if (status === 404) {
            return c.html(<NotFoundPage />, 404)
        }
        // Handle other status codes...
    }

    return c.html(<ServerErrorPage />, 500)
}
```

**Built-in Error Formatting:**

The `formatErrorForConsole()` utility provides clean, color-coded console
output:

```typescript
import { formatErrorForConsole } from '@lockness/core'

// In your error handler
formatErrorForConsole(error, status, path, {
    showStackTrace: status >= 500, // Show trace for 5xx errors
})
```

Output examples:

- **404 errors**: Minimal logging `⚠️ 404 Not Found: /api/users/999`
- **401/403 errors**: Simple message with path
- **500 errors**: Full error details with condensed stack trace

**Default Error Pages:**

If you don't create custom error pages, the framework provides elegant default
pages with:

- Clean, responsive design using inline CSS (no framework dependencies)
- Appropriate HTTP status codes
- User-friendly error messages
- System fonts for zero external dependencies

**Key Benefits:**

1. **Zero Configuration**: No need to import or register error handlers in your
   kernel
2. **Framework Agnostic**: Generated error page templates use inline CSS, no
   Tailwind/framework dependencies
3. **Clean Console Output**: Elegant, color-coded error logging that respects
   error severity
4. **Automatic Fallback**: Built-in default error handler if no custom handler
   exists

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
- **@lockness/ui**: UI components with Hono JSX, Tailwind CSS, and Unpoly

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

Lockness provides a complete, multi-guard authentication system inspired by
AdonisJS with support for Session, Token (API), and Basic Auth.

**Quick Setup:**

```bash
# Create user provider
touch app/provider/user_provider.ts
```

**Configure in kernel.ts:**

```typescript
import { initializeAuthMiddleware, SessionGuard } from '@lockness/auth'
import { sessionMiddleware } from '@lockness/session'
import { UserProvider } from '@provider/user_provider.ts'

const app = new App()
const userProvider = new UserProvider()

// Initialize session
app.use(
    '*',
    sessionMiddleware({
        driver: 'cookie',
        cookieName: 'session_id',
        lifetime: 7200,
    }),
)

// Initialize auth
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

**Using auth in controllers with decorators:**

```typescript
import { Context, Controller, Get, Post } from '@lockness/core'
import { AuthGuard, AuthOptional, AuthRequired } from '@lockness/auth'

@Controller('/auth')
export class AuthController {
    @Get('/login')
    @AuthOptional() // auth available but not required
    showLogin(c: Context) {
        const user = c.get('auth')?.user
        return c.html(<LoginPage />)
    }

    @Post('/login')
    @AuthOptional()
    async login(c: Context) {
        const { email, password, remember } = await c.req.json()
        const auth = c.get('auth')

        try {
            await auth.login(email, password, remember)
            return c.json({ message: 'Logged in' })
        } catch (error) {
            return c.json({ error: 'Invalid credentials' }, 401)
        }
    }

    @Get('/profile')
    @AuthRequired() // user required
    profile(c: Context) {
        const user = c.get('auth').user
        return c.json({ user })
    }

    @Post('/logout')
    @AuthRequired()
    async logout(c: Context) {
        await c.get('auth').logout()
        return c.redirect('/auth/login')
    }

    @Post('/api/data')
    @AuthGuard('api') // specific guard
    apiData(c: Context) {
        const user = c.get('auth').user
        return c.json({ data: [] })
    }
}
```

**Auth Context API:**

Available through `c.get('auth')`:

| Method                                              | Description                           |
| --------------------------------------------------- | ------------------------------------- |
| `c.get('auth').user`                                | Get authenticated user (or undefined) |
| `await c.get('auth').check()`                       | Check if authenticated                |
| `await c.get('auth').login(email, pass, remember?)` | Login with credentials                |
| `await c.get('auth').loginById(id, remember?)`      | Login by user ID                      |
| `await c.get('auth').logout()`                      | Logout current user                   |
| `c.get('auth').guard()`                             | Get underlying guard instance         |

### Authentication Decorators

Three decorators provide clear, type-safe route protection:

#### `@AuthOptional()`

Makes authentication available without requiring it. Perfect for routes that
serve both authenticated and unauthenticated users.

```typescript
@Get('/home')
@AuthOptional()
home(c: Context) {
    const user = c.get('auth')?.user  // May be undefined
    return c.json({ user })
}
```

#### `@AuthRequired()`

Requires authentication. Automatically rejects unauthenticated requests
with 401.

```typescript
@Get('/profile')
@AuthRequired()
profile(c: Context) {
    const user = c.get('auth').user  // Guaranteed to exist
    return c.json({ user })
}
```

#### `@AuthGuard(guardName)`

Requires a specific guard. Useful for APIs requiring token authentication or
other guard types.

```typescript
@Post('/api/users')
@AuthGuard('api')
createUser(c: Context) {
    const user = c.get('auth').user
    return c.json({ user })
}

// Multiple guards (try web OR api)
@Get('/data')
@AuthGuard(['web', 'api'])
getData(c: Context) {
    const user = c.get('auth').user
    return c.json({ data: [] })
}
```

**Benefits of decorators:**

- ✅ Clear intent - no string magic values
- ✅ Type-safe - compiler validates guard names
- ✅ Composable - stack with other decorators
- ✅ DRY - no repeated middleware wrapping

### Guards

Multiple authentication strategies for different use cases:

#### Session Guard (Web Apps)

Cookie/session-based authentication:

```typescript
import { SessionGuard } from '@lockness/auth'

const guard = new SessionGuard('web', c, userProvider, {
    useRememberMeTokens: true,
    rememberMeTokenLifetime: 365 * 24 * 60 * 60,
    sessionKeyName: 'auth_user_id',
})

await guard.login('user@example.com', 'password', true) // remember
await guard.loginById(userId, false)
const user = await guard.authenticate()
await guard.logout()
```

#### Token Guard (APIs)

Bearer token authentication for APIs and mobile apps:

```typescript
import { TokenGuard } from '@lockness/auth'

const guard = new TokenGuard('api', c, tokenProvider, {
    prefix: 'Bearer',
    tokenType: 'Bearer',
})

const token = await guard.generate('user@example.com', 'password', 'mobile')
const user = await guard.authenticate() // reads Authorization header
await guard.revoke() // revoke current token
await guard.revokeAll() // logout all devices
```

#### Basic Auth Guard (Development)

HTTP Basic Authentication for internal APIs:

```typescript
import { BasicAuthGuard } from '@lockness/auth'

const guard = new BasicAuthGuard('basic', c, basicAuthProvider, {
    realm: 'Protected Area',
})

const user = await guard.authenticate()
```

### User Providers

Implement `SessionUserProviderContract` to bring your own database:

```typescript
import type {
    PROVIDER_REAL_USER,
    SessionUserProviderContract,
} from '@lockness/auth'

interface User {
    id: number
    email: string
    password: string
}

export class UserProvider implements SessionUserProviderContract<User> {
    declare [PROVIDER_REAL_USER]: User

    async findById(id: string | number): Promise<User | null> {
        return db.query.users.findFirst({ where: eq(users.id, id) })
    }

    async findByCredentials(
        email: string,
        password: string,
    ): Promise<User | null> {
        const user = await db.query.users.findFirst({
            where: eq(users.email, email),
        })
        if (!user) return null
        const valid = await verifyPassword(password, user.password)
        return valid ? user : null
    }

    async verifyPassword(plain: string, hash: string): Promise<boolean> {
        return await bcrypt.compare(plain, hash)
    }
}
```

### Password Hashing

Secure password hashing and verification:

```typescript
import { hashPassword, verifyPassword } from '@lockness/core'

// Hash a password (for registration)
const hash = await hashPassword('secret123')

// Verify password (for login)
const valid = await verifyPassword('secret123', hash)
```

### Security Best Practices

1. **Always use HTTPS in production** - Prevents session/token theft
2. **Rotate secrets regularly** - APP_KEY, token secrets
3. **Hash passwords** - Use bcrypt, argon2, or scrypt
4. **Set secure cookies** - `secure: true`, `httpOnly: true`,
   `sameSite: 'Strict'`
5. **Implement rate limiting** - Prevent brute force attacks
6. **Regenerate session ID after login** - Prevent session fixation
7. **Enable remember token recycling** - Detect stolen tokens
8. **Set token expiration** - Limit damage from leaked tokens
9. **Log authentication events** - Monitor suspicious activity
10. **Validate user input** - Prevent injection attacks

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

### UI Components (`@lockness/ui`)

Lockness provides a UI component library with CLI tooling, inspired by
shadcn/ui. Components are **copied to your project** rather than imported from a
package, giving you full ownership and customization.

#### Philosophy

Instead of importing components from a package, `@lockness/ui` copies component
source code directly into your project. This approach:

- **Full Ownership**: Modify components without worrying about package updates
- **No Black Boxes**: See exactly what code you're using
- **Tree Shaking**: Only include components you actually use
- **Zero Lock-in**: Components work independently of package versions
- **Learning**: Study component source code in your project

#### Adding Components via CLI

```bash
# List available components
deno run -A jsr:@lockness/ui list

# Add single component
deno run -A jsr:@lockness/ui add button

# Add multiple components
deno run -A jsr:@lockness/ui add button card root-layout

# Force overwrite existing files
deno run -A jsr:@lockness/ui add button --force

# Custom target directory (default: app/view)
deno run -A jsr:@lockness/ui add button --dir src/components
```

Components are copied to `app/view/components/ui/` by default. Internal
dependencies (like the `cn()` utility) are automatically installed.

#### Available Components

**Button** - Flexible button with variants and sizes:

```tsx
import { Button } from '@view/components/ui/Button.tsx'

<Button variant="primary" size="md">Submit</Button>
<Button variant="outline">Cancel</Button>
<Button variant="danger">Delete</Button>

// With Unpoly navigation
<Button up-target=".main" up-href="/users">Load Users</Button>
```

**Card Components** - Compound components for content containers:

```tsx
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
} from '@view/components/ui/Card.tsx'

<Card>
    <CardHeader>
        <CardTitle>User Profile</CardTitle>
        <CardDescription>Manage your account</CardDescription>
    </CardHeader>
    <CardContent>
        <form>...</form>
    </CardContent>
    <CardFooter>
        <Button type="submit">Save</Button>
    </CardFooter>
</Card>
```

**RootLayout** - Base HTML layout with Unpoly integration:

```tsx
import { RootLayout } from '@view/components/ui/RootLayout.tsx'

<RootLayout
    title="My App"
    meta={[<meta name="description" content="My app" />]}
    styles={[<link rel="stylesheet" href="/css/app.css" />]}
>
    {children}
</RootLayout>
```

**cn() Utility** - Class name merging with Tailwind conflict resolution:

```tsx
import { cn } from '@view/lib/utils.ts'

// Merge classes with conflict resolution
cn('px-2', 'px-4') // => 'px-4'
cn('text-base', isLarge && 'text-lg')

// In components
<Button class={cn('w-full', props.class)}>Submit</Button>
```

#### Unpoly Integration

All components support Unpoly directives for SPA-like navigation without heavy
client-side hydration:

```tsx
// Partial page updates
<a up-target=".main" up-href="/users">Load Users</a>

// Open in modal layer
<a up-layer="new modal" up-href="/user/new">New User</a>

// AJAX form submission
<form up-submit up-target=".result">
    <input type="text" name="query" />
    <Button type="submit">Search</Button>
</form>

// Preload on hover
<a up-preload up-href="/dashboard">Dashboard</a>
```

#### Library Mode (Alternative)

For quick prototyping, you can also import components directly:

```typescript
import { Button, Card, RootLayout, cn } from '@lockness/ui/components'

// Add to deno.json
{
    "imports": {
        "@lockness/ui": "jsr:@lockness/ui@^0.1.22"
    }
}
```

**Note**: CLI mode is recommended for production as it gives you full control
over the component code.

## 📂 Repository Structure

```text
.
├── packages/              # 📦 Modular Framework Libraries
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

- **`packages/`**: Contains the decoupled libraries. This modularity allows for
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
  - `app/kernel.tsx` → `packages/init/stubs/init/app/kernel.tsx.stub`
  - `deno.json` → `packages/init/stubs/init/deno.json.stub`
  - `README.md` → `packages/init/stubs/init/README.md.stub`
  - `make:*` command outputs → corresponding stubs in `packages/cli/stubs/` and
    `packages/drizzle/stubs/`
- **Version Management**: When releasing new versions, use
  `deno task bump <version>` to update all packages and their inter-dependencies
  atomically. This ensures version consistency across the entire monorepo.

## 🔄 Upgrading Lockness Projects

The `@lockness/upgrade` package provides an automated tool for upgrading
Lockness projects. Users can run it directly from JSR without installation:

```bash
# Upgrade to latest version
deno run -Ar jsr:@lockness/upgrade

# Upgrade to specific version
deno run -Ar jsr:@lockness/upgrade 0.2.0

# Preview changes (dry run)
deno run -Ar jsr:@lockness/upgrade --dry-run
```

**How it works:**

1. Scans `deno.json` for all `@lockness/*` packages
2. Fetches latest versions from JSR API (or uses specified version)
3. Updates package versions while preserving other dependencies
4. Writes changes back to `deno.json` (unless dry-run)
5. Displays clear upgrade summary

**Architecture:**

- `mod.ts` - CLI entry point with argument parsing
- `upgrader.ts` - Core upgrade logic (read, parse, update, write)
- `version_fetcher.ts` - JSR API client with timeout handling
- `types.ts` - TypeScript interfaces

See `packages/upgrade/README.md` for complete documentation.

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

## 🧪 Testing Best Practices

Lockness uses deterministic time control and in-memory mocks to keep tests fast
and hermetic. Follow these guidelines when writing tests:

### Time Control with FakeTime

Use `@std/testing/time` to replace real time delays with instant time
manipulation:

```typescript
import { FakeTime } from '@std/testing/time'

Deno.test('session expiration', async () => {
    using time = new FakeTime()

    await driver.write('session', { id: 1 }, 1) // 1 second TTL
    time.tick(1100) // Advance 1.1 seconds instantly

    assertEquals(await driver.read('session'), null)
})
```

**Benefits:**

- Tests run in milliseconds instead of seconds
- No race conditions from real timers
- Deterministic test execution

**When to use:**

- Testing TTL/expiration logic (sessions, cache)
- Testing time-based delays or intervals
- Any test with `setTimeout` or `Date.now()`

### In-Memory Storage Mocks

Use memory-based drivers instead of filesystem I/O for storage tests:

```typescript
import { createMockStorage } from './tests/support/mock_driver.ts'

Deno.test('storage operations', async () => {
    const driver = createMockStorage()

    await driver.put('file.txt', 'content')
    assertEquals(await driver.get('file.txt'), 'content')
    // No cleanup needed - all in memory
})
```

**Benefits:**

- No filesystem pollution (`tmp/` directories)
- Tests run 10-100x faster
- Parallel-safe (no file conflicts)

**When to use:**

- Testing storage drivers (local, S3, R2)
- Testing file operations (put, get, delete, copy, move)
- Any test that writes to disk

### Performance Guidelines

1. **Avoid Real Delays**: Never use `setTimeout` with actual time in tests
2. **Use Memory Drivers**: Prefer in-memory mocks over filesystem/network
3. **Minimize Micro-delays**: Reduce small delays (10ms → 1ms) where needed
4. **Hermetic Tests**: Tests should not create side effects (files, network
   calls)

### Test Suite Performance

Target metrics for the full test suite:

- **Session tests**: < 1 second (down from 3+ seconds)
- **Cache tests**: < 1 second (down from 2+ seconds)
- **Storage tests**: < 2 seconds (down from 5+ seconds)
- **Total suite**: < 30 seconds (down from 87+ seconds)

## 🌊 Contributing to the Monorepo

Lockness is a monorepo that uses **Deno Workspaces** to manage its internal
libraries. This allows for a clean separation of concerns while maintaining a
single source of truth for development.

### Workspace Structure

- `packages/`: Each subdirectory is an independent Deno package.
- `packages/*/mod.ts`: Every library MUST use `mod.ts` as its main entry point
  (standardized convention).
- `packages/*/deno.json`: Package configuration including name (e.g.,
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
