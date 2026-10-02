# Lockness Init

Project scaffolding and initialization for new Lockness applications.

## Overview

@lockness/init provides:

- **Starter kits** - `web`, `api` and `slim`, chosen with `--kit`
- **Quick Start** - Scaffold complete Lockness project in seconds
- **Full Structure** - Pre-configured directory layout (MVC architecture)
- **Environment Setup** - Automatic .env file creation
- **Version Control** - Pin or use flexible version ranges
- **Ready to Run** - Generated projects work out of the box

## Starter kits

| Kit    | What you get                                                              | Packages beyond `core` + `cli`                             |
| :----- | :------------------------------------------------------------------------ | :--------------------------------------------------------- |
| `web`  | JSX views, Tailwind v4, cookie session, session auth, Drizzle, login flow | `auth`, `auth-provider`, `container`, `drizzle`, `session` |
| `api`  | JSON only: bearer tokens, CORS, throttling, OpenAPI annotations, Drizzle  | `auth`, `auth-provider`, `container`, `drizzle`, `openapi` |
| `slim` | One controller, one named middleware, nothing else                        | none                                                       |

`web` is the default, so `init` with no `--kit` behaves exactly as it always
has.

Every kit ships a `README.md` explaining its layout, a `tests/smoke.test.ts`
that passes without a database, and a project that boots on `deno task dev` with
nothing provisioned.

### Create New Project

```bash
# Latest version, web kit (both default)
deno run -A jsr:@lockness/init my-app

# A JSON API
deno run -A jsr:@lockness/init my-api --kit api

# The smallest possible starting point
deno run -A jsr:@lockness/init my-app --kit slim

# Or using Nessy CLI
./nessy init my-app --kit slim
```

An unrecognised `--kit` is refused rather than falling back to the default:
someone who typed `--kit=slm` and silently received a full Tailwind scaffold has
no way to tell why.

## How a kit is defined

A kit is not a separate template tree. It is a **selection** from the shared
base in `stubs/init/`, plus an **overlay** in `stubs/kits/<name>/` that adds
what is specific to it and replaces what differs. The overlay is applied second,
so a same-named file wins — that is how `api` gets its own `deno.json` and
`app/kernel.ts` without the base knowing that kits exist.

`kits.ts` is the single home of what each one contains, and
`packages/init/tests/kits.test.ts` asserts the manifest and the tree agree in
both directions: no listed file missing, no stub file unlisted.

The web and api kits' `database/migrations/` is generated, not written: it is
drizzle-kit's output from the kit's schema stub (SQL, `meta/_journal.json`,
`meta/0000_snapshot.json`), regenerated with `deno task kits:migrations` and
guarded by `scripts/kit_migrations_test.ts`. Both kits also ship
`drizzle.config.ts` and name `drizzle` in `lockness.packages`, so `db:migrate`,
`db:generate` and `db:fresh` work in a fresh app; `kits:smoke` requires the
app's first `db:generate` to report no schema changes.

## Smoke testing

```bash
deno task kits:smoke              # all three
deno task kits:smoke --kit slim   # one
deno task kits:smoke --keep       # leave the scaffolds on disk
```

Each kit is scaffolded, **repointed at the local workspace**, then type-checked,
tested and booted over real HTTP. The repointing matters: left alone a scaffold
resolves the last published release, which is precisely the version that cannot
contain the change you are about to push. CI runs this as its own job.

### Version Control

Pin specific versions or use flexible ranges:

```bash
# Use specific version
deno run -A jsr:@lockness/init my-app --use 0.1.15
deno run -A jsr:@lockness/init my-app -u 0.1.15

# Use caret range (allows patch + minor updates)
deno run -A jsr:@lockness/init my-app --use "^0.1.0"

# Use tilde range (allows patch updates only)
deno run -A jsr:@lockness/init my-app --use "~0.1.20"

# Use latest version explicitly
deno run -A jsr:@lockness/init my-app --use latest
```

### Pin Init Package Version

```bash
# Use specific init package version
deno run -A jsr:@lockness/init@0.1.10 my-app

# Combine: specific init + specific framework
deno run -A jsr:@lockness/init@0.1.10 my-app --use 0.1.8
```

## Version Format Reference

| Format   | Description   | Example   | Result in deno.json |
| -------- | ------------- | --------- | ------------------- |
| `X.Y.Z`  | Exact version | `0.1.15`  | `^0.1.15`           |
| `^X.Y.Z` | Caret range   | `^0.1.0`  | `^0.1.0`            |
| `~X.Y.Z` | Tilde range   | `~0.1.20` | `~0.1.20`           |
| `latest` | Latest stable | `latest`  | `^0.1.22`           |

### Caret (^)

Allows patch and minor updates (recommended):

- `^0.1.15` matches `0.1.15`, `0.1.16`, `0.1.999`
- Won't match `0.2.0` or `1.0.0`

### Tilde (~)

Allows patch updates only:

- `~0.1.15` matches `0.1.15`, `0.1.16`
- Won't match `0.2.0`

## Why Version Control?

**Use Cases:**

- **Stability** - Pin to tested versions for production
- **Compatibility** - Match existing codebases
- **Testing** - Verify compatibility with specific versions
- **Migration** - Gradually upgrade across projects

## Help

```bash
# Display help
deno run -A jsr:@lockness/init --help

# Show init package version
deno run -A jsr:@lockness/init --version
```

## Generated Structure

```
my-app/
├── deno.json                 # Deno configuration with workspace
├── .env                      # Environment variables
├── .env.example              # Environment template
├── main.ts                   # Application entry point
├── cli.ts                    # CLI entry point
├── public/                   # Static files
│   └── css/
├── app/
│   ├── kernel.ts             # Application kernel
│   ├── controller/           # HTTP controllers
│   ├── middleware/           # Custom middleware
│   ├── model/                # Data models
│   ├── repository/           # Data repositories
│   ├── service/              # Business logic
│   ├── view/                 # JSX view components
│   └── routes.ts             # Route definitions
├── database/
│   ├── migrations/           # Database migrations
│   └── seeders/              # Database seeders
└── lockness/                 # Framework packages (workspace)
```

## Quick Start After Init

```bash
cd my-app
deno task dev
```

Your application runs at `http://localhost:8888`

## Configuration Files

### deno.json

Workspace configuration with:

- Lockness package imports
- Task definitions (dev, build, test)
- TypeScript compiler options
- Import map for dependencies

```json
{
    "tasks": {
        "dev": "deno run --allow-all --watch main.ts",
        "build": "deno compile --allow-all --output=./bin/app main.ts",
        "test": "deno test --allow-all"
    },
    "imports": {
        "@lockness/core": "jsr:@lockness/core@^0.1.0",
        "@lockness/drizzle": "jsr:@lockness/drizzle@^0.1.0"
    }
}
```

### .env

Environment configuration:

```env
APP_ENV=development
APP_PORT=8888
APP_KEY=base64:...   # generated for you by `lockness init`
DATABASE_URL=postgres://user:password@localhost:5432/mydb
```

### kernel.ts

Application bootstrap:

```typescript
import { createApp } from '@lockness/core'
import { cors, logger } from '@lockness/core'

const app = createApp()

// Global middleware
app.use('*', logger())
app.use('*', cors())

// Error handling
app.onError((err, c) => {
    return c.json({ error: err.message }, 500)
})

export default app
```

### main.ts

HTTP server entry point:

```typescript
import { serve } from 'jsr:@std/http'
import app from './kernel.ts'

const port = Number(Deno.env.get('APP_PORT')) || 8888

serve(app.fetch, { port })
console.log(`Server running on http://localhost:${port}`)
```

## What's Included

The scaffolded project includes:

### MVC Architecture

- **Controllers** - HTTP request handlers with decorators
- **Models** - Database schemas with Drizzle ORM
- **Views** - JSX components for server-side rendering
- **Routes** - Automatic route discovery

### Pre-configured Features

- **Routing** - Controller-based with decorators
- **Middleware** - Logger, CORS, error handling
- **Database** - Drizzle ORM integration ready
- **Authentication** - @lockness/auth ready to configure
- **CLI** - Nessy wrapper and custom commands
- **Development Tools** - Hot reload, route generation

### Sample Files

- Example controller (`app/controller/home_controller.ts`)
- Example view (`app/view/home.tsx`)
- Example routes (`app/routes.ts`)
- Database configuration (`drizzle.config.ts`)

## Example Files

### Home Controller

```typescript
import { Context, Controller, Get } from '@lockness/core'

@Controller('/')
export class HomeController {
    @Get('/')
    index(c: Context) {
        return c.html(<h1>Welcome to Lockness!</h1>)
    }

    @Get('/about')
    about(c: Context) {
        return c.json({
            framework: 'Lockness',
            version: '1.0.0',
        })
    }
}
```

### Home View

```typescript
export function HomePage() {
    return (
        <html>
            <head>
                <title>Lockness App</title>
                <link rel='stylesheet' href='/css/app.css' />
            </head>
            <body>
                <header>
                    <h1>Welcome to Lockness</h1>
                </header>
                <main>
                    <p>Your Lockness application is ready!</p>
                </main>
            </body>
        </html>
    )
}
```

## Next Steps After Init

### 1. Configure Database

Update `DATABASE_URL` in `.env`:

```env
DATABASE_URL=postgres://user:password@localhost:5432/mydb
```

### 2. Install Packages

```bash
# Install Drizzle ORM
./nessy package:install drizzle

# Install authentication
./nessy package:install auth

# Install caching
./nessy package:install cache
```

### 3. Generate Code

```bash
# Create controller
./nessy make:controller User

# Create model
./nessy make:model Post -a

# Create middleware
./nessy make:middleware Auth
```

### 4. Start Development

```bash
# Development server with hot reload
deno task dev

# Run tests
deno task test

# Build for production
deno task build
```

## Development Workflow

### Adding a Controller

```bash
./nessy make:controller Blog
```

Generates `app/controller/blog_controller.ts`:

```typescript
import { Context, Controller, Get, Post } from '@lockness/core'

@Controller('/blog')
export class BlogController {
    @Get('/')
    index(c: Context) {
        return c.json({ posts: [] })
    }

    @Post('/')
    store(c: Context) {
        return c.json({ message: 'Post created' })
    }
}
```

### Adding a Model

```bash
./nessy make:model Post -a
```

Generates:

- `app/model/post.ts` - Schema
- `app/repository/post_repository.ts` - Data access
- `app/controller/post_controller.ts` - HTTP handlers
- `database/seeders/post_seeder.ts` - Test data

### Running Migrations

```bash
# Generate migration
./nessy db:generate

# Run migrations
./nessy db:migrate

# Seed database
./nessy db:seed
```

## Customization

### Custom Project Structure

The init command uses stubs from `stubs/init/`. To customize:

```typescript
import { Stub } from '@lockness/cli'

await Stub.scaffoldFrom(
    './custom-stubs',
    './my-project',
    {
        projectName: 'my-project',
        version: '^0.1.0',
    },
)
```

### Custom Environment Variables

Add custom variables to `.env`:

```env
# Default variables
APP_ENV=development
APP_PORT=8888
APP_KEY=base64:...   # generated for you by `lockness init`
DATABASE_URL=postgres://user:password@localhost:5432/mydb

# Custom variables
SMTP_HOST=smtp.example.com
SMTP_PORT=587
API_KEY=your-api-key
```

Access in code:

```typescript
const smtpHost = Deno.env.get('SMTP_HOST')
```

## Project Tasks

Available tasks in `deno.json`:

```json
{
    "tasks": {
        "dev": "deno run --allow-all --watch main.ts",
        "build": "deno compile --allow-all --output=./bin/app main.ts",
        "test": "deno test --allow-all",
        "lint": "deno lint",
        "fmt": "deno fmt",
        "check": "deno check main.ts"
    }
}
```

Run with:

```bash
deno task dev
deno task test
deno task lint
```

## Deployment

### Build Executable

```bash
deno task build
```

Generates standalone binary in `./bin/app`

### Environment Variables

Production `.env`:

```env
APP_ENV=production
APP_PORT=8000
APP_KEY=base64:...   # generated for you by `lockness init`
DATABASE_URL=postgres://user:pass@db.example.com:5432/prod
```

### Docker Deployment

Example `Dockerfile`:

```dockerfile
FROM denoland/deno:alpine

WORKDIR /app

COPY . .

RUN deno cache main.ts

EXPOSE 8000

CMD ["deno", "run", "--allow-all", "main.ts"]
```

### Deno Deploy

```bash
# Install deployctl
deno install -Arf jsr:@deno/deployctl

# Deploy
deployctl deploy --project=my-app main.ts
```

## Troubleshooting

### Import Errors

If you see import errors:

```bash
# Clear Deno cache
deno cache --reload main.ts

# Check deno.json imports
cat deno.json
```

### Port Already in Use

Change port in `.env`:

```env
APP_PORT=3000
```

### Database Connection Errors

Verify `DATABASE_URL` in `.env` and ensure PostgreSQL is running:

```bash
# Test connection
./nessy db:check
```

## Best Practices

- **Use version ranges** (caret ^) for flexibility
- **Pin versions** for production stability
- **Follow MVC structure** - keep code organized
- **Use environment variables** - never commit secrets
- **Run migrations** - keep database in sync
- **Write tests** - ensure code quality
- **Use CLI generators** - maintain consistency

## Upgrading to v0.5.0

Three items. The first and third are for `web` and `api` apps scaffolded from
v0.4.x; `slim` has no database and is not affected by them. The second is for
every app, of any kit, scaffolded before v0.5.0.

For item 1, **migration step:** add the drizzle wiring to `deno.json` and
`drizzle.config.ts`, then regenerate the migrations (database never migrated) or
baseline them (database already populated). An `api` app first replaces its
`access_tokens` schema.

### 1. web and api apps from v0.4.0: wire up the `db:*` commands and adopt generated migrations

In an app scaffolded from v0.4.0, `deno task db:migrate` prints the command list
and exits 1: `db:migrate` is an unknown command there (#444). The v0.4.0 kits
did not name `drizzle` in `lockness.packages`, shipped no `drizzle.config.ts`,
and wrote `database/migrations/` by hand, with no `meta/` journal. The v0.5.0
kits fix all three. An existing app needs the steps below, in this order:

- **Step 1** (`deno.json`) and **step 2** (`drizzle.config.ts`): web and api.
- **Step 3** (schema and user provider): api only, and before step 4.
- **Step 4**: path A or path B, depending on your database.

These steps assume your `@lockness/*` imports already point at v0.5.0;
[`@lockness/upgrade`](../../upgrade/README.md) rewrites them. They were verified
on apps whose `app/model/` is still the kit's. If you have added tables since,
the regenerated migration covers them too; that case was not part of the
verified run.

#### Step 1: `deno.json`

Add both entries. Both are required:

```jsonc
{
    "imports": {
        // ...existing entries...
        "drizzle-kit": "npm:drizzle-kit@0.31.10"
    },
    "lockness": {
        "packages": ["drizzle"]
    }
}
```

`lockness.packages` is what makes the `db:*` commands exist. The `drizzle-kit`
import is what `drizzle.config.ts` loads: without it, `db:generate` fails with
`Import "drizzle-kit" not a dependency and not in import map` and exits 1.

#### Step 2: `drizzle.config.ts`

Create it at the project root. It is identical to the v0.5.0 kits' file:

```ts
/**
 * Drizzle Kit configuration — read by `db:generate`, `db:migrate` and
 * `db:fresh`.
 *
 * @module drizzle.config
 */

import { defineConfig } from 'drizzle-kit'

// No fallback, like config/database.ts: unset means `db:migrate` says so and
// `db:fresh` refuses. A default URL would point a destructive command at a
// database nobody chose.
const url = Deno.env.get('DATABASE_URL')

export default defineConfig({
    schema: './app/model/*.ts',
    out: './database/migrations',
    dialect: 'postgresql',
    ...(url ? { dbCredentials: { url } } : {}),
})
```

`dbCredentials` is set only when `DATABASE_URL` is set. Do not add a `?? ''`
fallback or a default URL.

#### Step 3 (api only): the `access_tokens` schema and the user provider

`DrizzleTokenProvider` now takes the tokens table as a Drizzle table object; see
[`@lockness/auth-provider`'s v0.5.0 item](../../auth-provider/docs/DOCS.md#upgrading-to-v050).
Both changes below are required, and both must land **before** step 4:
migrations regenerated from the old schema keep the old `token` column. Until
both are made, `deno check main.ts` fails with TS2322.

In `app/model/user.ts`, change the import:

```ts
import {
    index,
    integer,
    pgTable,
    serial,
    text,
    timestamp,
} from 'drizzle-orm/pg-core'
```

Then replace the `accessTokens` table:

```ts
export const accessTokens = pgTable('access_tokens', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, {
        onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    hash: text('hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [index('access_tokens_user_id_idx').on(table.userId)])
```

In `app/auth/user_provider.ts`, pass the table instead of its name:

```diff
-import { users } from '@model/user.ts'
+import { accessTokens, users } from '@model/user.ts'
 ...
-        tokensTable: 'access_tokens',
+        tokensTable: accessTokens,
```

**The foreign key.** A database built from v0.4.0's SQL already has a foreign
key from `access_tokens.user_id` to `users.id` with `ON DELETE CASCADE`, named
`access_tokens_user_id_fkey`. What v0.4.0 lacked was the key in the Drizzle
schema, where `userId` was declared as `serial`. The `.references(...)` above
adds it to the schema. On a populated database, path B re-creates the constraint
under the name drizzle-kit gives it; that changes no row.

#### Step 4, path A: a database that was never migrated

For an empty database, or none yet. Move aside any SQL file of your own in
`database/migrations/` first, then regenerate the folder from the app's schema:

```bash
rm -rf database/migrations
deno task cli db:generate     # writes 0000_<random_name>.sql and meta/
deno task db:migrate
deno task cli db:generate     # prints "No schema changes, nothing to migrate"
```

- The generated SQL is byte-identical to the v0.5.0 kit's
  `0000_create_users.sql`, for web and for api.
- The file name is random (for example `0000_next_skaar.sql`), because the
  `db:generate` wrapper does not forward `--name`. This is harmless.
- Copying the v0.5.0 kit's folder instead gives the same result:
  `0000_create_users.sql`, `meta/_journal.json` and `meta/0000_snapshot.json`
  from `packages/init/stubs/kits/<kit>/database/migrations/`, with the `.stub`
  suffix removed. For api, the schema must still match step 3.

#### Step 4, path B: a database that already holds v0.4.0's tables

v0.4.0's `db:migrate` never ran, so such a database was built by applying
v0.4.0's `0000_create_users.sql` by hand, and drizzle has no record of it. Run
`db:migrate` now and it fails on `CREATE TABLE` and exits 1. Record the new
migration as applied instead, without running it. This is a baseline.

Drizzle's migrator runs only the journal entries whose `when` is newer than the
latest `created_at` in `drizzle.__drizzle_migrations`. A row whose `hash` is the
SHA-256 of the `.sql` file and whose `created_at` is the journal's `when`
therefore marks the migration as applied.

1. Regenerate the folder exactly as in path A, after step 3 for api. **Do not
   run `db:migrate`.**
2. Read the two values from that folder:

   ```bash
   # <hash>: SHA-256 of the migration file
   shasum -a 256 database/migrations/0000_*.sql | cut -d' ' -f1
   # <when>: the journal entry's timestamp
   deno eval "console.log(JSON.parse(Deno.readTextFileSync('database/migrations/meta/_journal.json')).entries[0].when)"
   ```

   They are not constants, so compute them from your own folder and never copy
   them from another app: each regeneration writes a new `when`, and the hash
   changes whenever the file does.
3. Substitute `<hash>` and `<when>` into the script for your kit, below, and run
   it once with `psql "<database-url>"`.
4. Check: `deno task db:migrate` exits 0 and runs nothing, and
   `deno task cli db:generate` prints `No schema changes, nothing to migrate`.

**web.** Rename the unique constraint on `users.email` to the name drizzle-kit
gives it, so that a later generated migration that drops it finds it, then
record the baseline:

```sql
BEGIN;
ALTER TABLE "users" RENAME CONSTRAINT "users_email_key" TO "users_email_unique";

CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);
INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ('<hash>', <when>);
COMMIT;
```

Existing rows are untouched.

**api.** Run it after steps 1 to 3, with the regenerated folder in place:

```sql
BEGIN;

-- 1. Rows the new shape cannot hold. Tokens issued before the upgrade never
--    authenticated, so nothing usable is lost.
DELETE FROM "access_tokens" WHERE "expires_at" IS NULL;
DELETE FROM "access_tokens" WHERE "user_id" NOT IN (SELECT "id" FROM "users");
UPDATE "access_tokens" SET "created_at" = now() WHERE "created_at" IS NULL;

-- 2. users: the unique constraint under the name drizzle-kit gives it.
ALTER TABLE "users" RENAME CONSTRAINT "users_email_key" TO "users_email_unique";

-- 3. access_tokens: token -> hash (unique), NOT NULLs, last_used_at.
ALTER TABLE "access_tokens" RENAME COLUMN "token" TO "hash";
ALTER TABLE "access_tokens" RENAME CONSTRAINT "access_tokens_token_key" TO "access_tokens_hash_unique";
DROP INDEX IF EXISTS "access_tokens_token_idx";
ALTER TABLE "access_tokens" ALTER COLUMN "expires_at" SET NOT NULL;
ALTER TABLE "access_tokens" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "access_tokens" ADD COLUMN "last_used_at" timestamp;

-- 4. Foreign key with cascade, under drizzle-kit's name. v0.4.0's SQL already
--    created one as "access_tokens_user_id_fkey"; drop-and-add also covers a
--    database where it is missing.
ALTER TABLE "access_tokens" DROP CONSTRAINT IF EXISTS "access_tokens_user_id_fkey";
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "access_tokens_user_id_idx" ON "access_tokens" USING btree ("user_id");

-- 5. Baseline: record the migration as applied, without running it.
CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);
INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ('<hash>', <when>);

COMMIT;
```

- Section 1 deletes the token rows with no expiry, and the rows whose user no
  longer exists (the existing foreign key already forbids those, so this only
  matters where it is missing). It backfills a missing `created_at`. Every other
  row is kept.
- `CREATE INDEX IF NOT EXISTS` prints
  `NOTICE: relation "access_tokens_user_id_idx" already exists, skipping`. This
  is harmless.
- The resulting schema matches a database built fresh by v0.5.0's migration,
  except that `last_used_at` comes after `created_at`. Column order is cosmetic.
- Deleting a user still cascades to their tokens.

### 2. Every app scaffolded before v0.5.0: point the `Dockerfile` `HEALTHCHECK` at `/health`

The generated `Dockerfile` polled `/`, an application route, so a home page that
redirects, needs a session or is slow made the container report unhealthy
(#424). New apps poll `/health`, the liveness route the framework registers on
every boot. It touches no dependency and always answers `200`. In your
`Dockerfile`, change the `HEALTHCHECK` URL from `http://localhost:8888/` to
`http://localhost:8888/health`. Do not point it at `/ready`: that probes the
database, so a database outage would mark a healthy process unhealthy.

### 3. web and api apps from v0.4.x: hand `createUserProvider` the `Database` service

Every `@lockness/auth-provider` provider now takes `db` as a function it calls
on each lookup; see
[`@lockness/auth-provider`'s v0.5.0 item 2](../../auth-provider/docs/DOCS.md#2-every-provider-takes-db-as-a-function-called-per-lookup).
The guard builds its provider on every request, and since v0.5.0 `Database.db`
throws while no database is connected, so a provider that reads it at
construction fails every page, `/auth/login` included. Until the changes below
are made, `deno check main.ts` fails with TS2322.

In `app/auth/user_provider.ts`, take the service and read its handle per lookup:

```diff
 import { verifyPassword } from '@lockness/auth'
+import type { Database } from '@lockness/drizzle'
 ...
-export function createUserProvider(db: Db): DrizzleSessionProvider<WebUser> {
+export function createUserProvider(
+    database: Database,
+): DrizzleSessionProvider<WebUser> {
     return new DrizzleSessionProvider<WebUser>({
-        db,
+        db: (): Db => database.db,
```

An `api` app makes the same change with `DrizzleTokenProvider<ApiUser>`. The two
lookup callbacks are unchanged: they still receive the Drizzle instance.

Then pass the service, not its handle, at each call site: `createWebGuard` in
`app/auth/guards.ts` (web), `createApiGuard` in the same file and the `token`
handler in `app/controller/token_controller.ts` (api):

```diff
-    const db = container.get<Database>(Database)
-    return new SessionGuard('web', ctx, createUserProvider(db.db))
+    return new SessionGuard(
+        'web',
+        ctx,
+        createUserProvider(container.get<Database>(Database)),
+    )
```

## See Also

- [@lockness/cli](../cli/README.md) - CLI system
- [@lockness/core](../core/README.md) - Core framework
- [@lockness/drizzle](../drizzle/README.md) - Database ORM
