# Lockness Drizzle

Drizzle ORM integration for Lockness with PostgreSQL support, migration
management, and CLI scaffolding.

## Overview

@lockness/drizzle provides:

- **PostgreSQL Integration** - Full Drizzle ORM support
- **Migration Management** - Generate and apply migrations
- **Database Seeding** - Populate development/test data
- **Drizzle Studio** - Visual database browser
- **CLI Scaffolding** - Generate models, repositories, controllers
- **Dependency Injection** - Auto-injectable Database service
- **Type Safety** - Full TypeScript support with inference

## Installation

### Quick Install (Recommended)

```bash
deno task cli package:install drizzle
```

This automatically:

- Creates `drizzle.config.ts`
- Sets up directory structure (`migrations/`, `app/model/`, etc.)
- Creates `database_seeder.ts`
- Adds `DATABASE_URL` to `.env` files
- Tests database connection

### Manual Installation

```bash
deno add @lockness/drizzle
```

Then configure manually (see Configuration).

## Configuration

### Environment Variables

Add to `.env`:

```env
DATABASE_URL=postgres://user:password@localhost:5432/mydb
```

### DSN format

`Database.connect()` checks every DSN that starts with a scheme before any
driver sees it. A driver that cannot tell where a password ends does not fail.
It rewrites the DSN: postgres.js reads a comma as a host separator and ends the
host part at the first `/` or `?`, and mysql2 and libsql end it at the first
`/`, `?` or `#`. So `postgres://app:2024/Spring@db/prod` is read as host `app`,
port `2024`, database `Spring@db/prod`. Pieces of the password then become host
names, which are looked up in DNS and echoed in errors. `connect()` refuses such
a DSN instead.

First, the DSN as a whole:

- **No control character** (a tab, a newline, any other character below U+0020,
  or DEL) and **no leading space.** WHATWG drops or strips them before it
  parses, so the DSN a driver reads would not be the one checked.
- **A scheme is followed by `//`.** `postgres:app:pw@db/prod` is refused: a
  driver would read everything after `postgres:` as the database name. Only
  `file:` and `sqlite:` paths may omit the `//`.

Then, in the grammar below, the **authority** is the text after `scheme://` up
to the first `/`, `?` or `#`, and the **tail** is everything after it. A DSN is
accepted when:

1. **The tail holds no raw `@`.** Write `%40` in a path or query string.
2. **The authority holds at most one `@`, and the user and password use only the
   allowed characters:** `A-Za-z0-9-._~!$&'()*+,;=:` and percent-encoded bytes
   (`%XX`). Each percent sequence must decode as UTF-8. Every other character
   must be percent-encoded.
3. **The host part is empty, or a comma-separated list of hosts.** Each host is
   an `[IPv6]` literal or a name made of the same characters (without `,` or
   `:`), optionally followed by `:port`.
4. **The DSN is a valid WHATWG URL** once the host list is cut to its first
   host.
5. **A host list with a comma does not also appear before the host part.**
   postgres.js cuts the list by replacing its first match anywhere in the DSN.
   With `postgres://app:xdb1,db2x@db1,db2/prod`, that match is inside the
   password, so the password would be rewritten.

| Accepted                                 | Why                                   |
| :--------------------------------------- | :------------------------------------ |
| `postgres://app:s3cret@db:5432/prod`     | the common form                       |
| `postgres://app:p%40ss%2Fword@db/prod`   | reserved characters percent-encoded   |
| `postgres://app:pw@h1:5432,h2:5433/prod` | multi-host, with or without ports     |
| `postgres://app:pw@[::1]:5432/prod`      | IPv6                                  |
| `postgres:///prod`, `file:local.db`      | empty host; SQLite paths are not URLs |

| Refused                                   | Write instead                               |
| :---------------------------------------- | :------------------------------------------ |
| `postgres://app:p@ss@db/prod`             | `postgres://app:p%40ss@db/prod`             |
| `postgres://app:2024/Spring@db/prod`      | `postgres://app:2024%2FSpring@db/prod`      |
| `postgres://app:my pass@db/prod`          | `postgres://app:my%20pass@db/prod`          |
| `postgres://app:pässword@db/prod`         | `postgres://app:p%C3%A4ssword@db/prod`      |
| `postgres://app:p^w{1}@db/prod`           | `postgres://app:p%5Ew%7B1%7D@db/prod`       |
| `postgres://app:100%@db/prod`             | `postgres://app:100%25@db/prod`             |
| `postgres://db/prod?application_name=a@b` | `postgres://db/prod?application_name=a%40b` |
| `postgres:app:pw@db/prod`                 | `postgres://app:pw@db/prod`                 |

A refused DSN makes `connect()` return `success: false` with one fixed message,
`DSN is not a valid URL; percent-encode reserved characters in the password`. It
quotes no part of the DSN, because any part of an ambiguous DSN may be a piece
of the password. To percent-encode a password, pass it through
`encodeURIComponent()`.

A `file:` or `sqlite:` path, and a value with no scheme (`:memory:`), are not
checked further: there is no password in them to misparse.

A percent-encoded host such as `%2Fvar%2Frun%2Fpostgresql` is accepted, but
postgres.js 3.4.8 does not treat it as a unix socket. It keeps the host encoded
and connects to it as a TCP host name.

When the client still cannot be built from an accepted DSN, `connect()` shows
only the error's name, not its message, since the message may quote the DSN. A
missing client package is reported with the package name and the import error.

### Drizzle Config

`drizzle.config.ts` (auto-generated by installer):

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    schema: './app/model/*.ts',
    out: './database/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: Deno.env.get('DATABASE_URL')!,
    },
})
```

## Boot Behaviour and Readiness

### Boot makes zero round trips

When a database URL is configured, the kernel's database step calls
`Database.connect()`. That call loads the driver and **constructs** a lazy
client. It sends nothing to the database: no connection is opened and no
`SELECT 1` is issued. The first round trip happens on the first real query, or
when something calls `Database.probe()`.

This matters on serverless and edge hosts (Deno Deploy, Cloud Run, Lambda, Fly
auto-stop), where isolates start often. Against a scale-to-zero database (Neon,
for example), any query wakes the compute and bills its minimum active window. A
probe at boot would wake the database on every cold start, even with no traffic
and no route that queries it. Lockness therefore never probes at boot, and there
is no option to make it.

The first query after the database has suspended still pays its resume latency.
A host that does not answer makes that first query wait for the driver's connect
timeout.

### What `connect()`, `probe()` and `isConnected()` mean

| Method          | Round trips | Meaning                                                                                                                                                                                                                                                |
| :-------------- | :---------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect()`     | 0           | Checks the DSN, loads the driver and builds the client. `success: false` means the DSN was refused, the client package is missing, or the client rejected the URL.                                                                                     |
| `probe()`       | 1           | Runs `SELECT 1`. Throws `Database is not connected` before `connect()` or after `close()`. Otherwise it re-throws a driver failure: the exact DSN is replaced with `<dsn redacted>`, and a message holding the password is withheld whole (see below). |
| `isConnected()` | 0           | `true` once a client is configured and until `close()`. It does **not** mean that the database is reachable. Call `probe()` to find out.                                                                                                               |

A custom driver registered with `Database.setDriverFactory()` must follow the
same contract: the factory constructs its client and makes no round trip.

### Where each failure surfaces

| Failure                                           | At boot                                                                                                                                                                                          | After boot                                                                                                                            |
| :------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| DSN refused (see [DSN format](#dsn-format))       | `connect()` returns `success: false` with a fixed message that quotes no part of the DSN. Boot continues.                                                                                        | `/ready` returns `503` with `database: down`. `db:seed` and `db:check` print the error and exit 1.                                    |
| Client package missing, or URL the client rejects | `connect()` returns `success: false` and logs a `❌` line: the package and import error (withheld if it holds the password), or the client's message withheld (error name only). Boot continues. | `/ready` returns `503` with `database: down`. `db:seed` and `db:check` print the error and exit 1.                                    |
| Host unreachable, bad credentials, database down  | Nothing is sent, so nothing is reported.                                                                                                                                                         | `/ready` returns `503` within 3 s. The first query gets the driver's error. `db:check` reports it, withheld if it holds the password. |

### Monitoring: `/health` for liveness, `/ready` for readiness

The framework serves two endpoints:

- `GET /health` is **liveness**. It touches no dependency and always returns
  `200` while the process is up.
- `GET /ready` is **readiness**. It runs every registered check, including the
  `database` check, which calls `probe()`. It returns `503` if any check fails.

Point uptime and liveness monitors at **`/health`**. `/ready` caches its result
for 1 s per process (per isolate on a serverless host), so a monitor polling it
sends a `SELECT 1` on every poll spaced more than 1 s apart. That keeps a
scale-to-zero database awake and billed around the clock. Use `/ready` only
where a readiness signal is the point, such as a load balancer deciding whether
to route traffic to an instance.

### Failing boot when the database is down

Some long-running servers have no orchestrator watching `/ready` and would
rather crash at boot than serve errors. For those, probe from an `@OnBoot` hook.
Boot hooks run after the database step, and an error thrown by a hook stops the
boot:

```typescript
import { type App, container, Kernel, OnBoot } from '@lockness/core'
import { Database } from '@lockness/drizzle'

@Kernel({ database: true })
export class AppKernel {
    @OnBoot()
    async verifyDatabase(_app: App) {
        // One round trip, only in apps that opt in.
        await container.get(Database).probe()
    }
}
```

Do not use this recipe on a scale-to-zero database: it brings back the wake-up
on every cold start.

## Basic Usage

### Database Service

```typescript
import { Inject, Service } from '@lockness/core'
import { Database } from '@lockness/drizzle'

@Service()
export class UserService {
    @Inject(Database)
    accessor db!: Database

    async getAllUsers() {
        return await this.db.instance.select().from(users)
    }
}
```

### In Controllers

```typescript
import { Context, Controller, Get, Inject } from '@lockness/core'
import { Database } from '@lockness/drizzle'
import { users } from '../model/user.ts'

@Controller('/users')
export class UserController {
    @Inject(Database)
    accessor db!: Database

    @Get('/')
    async index(c: Context) {
        const allUsers = await this.db.instance.select().from(users)
        return c.json({ users: allUsers })
    }
}
```

## Model Definition

Define database schema with Drizzle:

```typescript
// app/model/user.ts
import { boolean, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    password: text('password').notNull(),
    emailVerified: boolean('email_verified').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
})

// Auto-generated Zod schemas from Drizzle
export const selectUserSchema = createSelectSchema(users)
export const insertUserSchema = createInsertSchema(users, {
    email: z.string().email(),
    name: z.string().min(2).max(100),
    password: z.string().min(8),
})

// TypeScript types
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
```

## Relationships

Define relations between tables:

```typescript
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
})

export const posts = pgTable('posts', {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    content: text('content'),
    authorId: integer('author_id').references(() => users.id),
})

// Define relationships
export const usersRelations = relations(users, ({ many }) => ({
    posts: many(posts),
}))

export const postsRelations = relations(posts, ({ one }) => ({
    author: one(users, {
        fields: [posts.authorId],
        references: [users.id],
    }),
}))
```

Query with relations:

```typescript
// Get users with their posts
const usersWithPosts = await db.instance.query.users.findMany({
    with: {
        posts: true,
    },
})

// Get post with author
const postWithAuthor = await db.instance.query.posts.findFirst({
    where: eq(posts.id, 1),
    with: {
        author: true,
    },
})
```

## Repository Pattern

Create repositories for clean data access:

```typescript
// app/repository/user_repository.ts
import { Inject, Service } from '@lockness/core'
import { Database } from '@lockness/drizzle'
import { eq } from 'drizzle-orm'
import { type NewUser, type User, users } from '../model/user.ts'

@Service()
export class UserRepository {
    @Inject(Database)
    accessor db!: Database

    async findAll(): Promise<User[]> {
        return await this.db.instance.select().from(users)
    }

    async findById(id: number): Promise<User | undefined> {
        const result = await this.db.instance
            .select()
            .from(users)
            .where(eq(users.id, id))
        return result[0]
    }

    async findByEmail(email: string): Promise<User | undefined> {
        const result = await this.db.instance
            .select()
            .from(users)
            .where(eq(users.email, email))
        return result[0]
    }

    async create(data: NewUser): Promise<User> {
        const result = await this.db.instance
            .insert(users)
            .values(data)
            .returning()
        return result[0]
    }

    async update(id: number, data: Partial<NewUser>): Promise<User> {
        const result = await this.db.instance
            .update(users)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(users.id, id))
            .returning()
        return result[0]
    }

    async delete(id: number): Promise<void> {
        await this.db.instance.delete(users).where(eq(users.id, id))
    }
}
```

## CLI Commands

### Model Scaffolding

Generate complete model with all files:

```bash
deno task cli make:model Post -a
```

Generates:

- `app/model/post.ts` - Schema and types
- `app/repository/post_repository.ts` - Repository
- `app/controller/post_controller.ts` - Controller
- `database/seeders/post_seeder.ts` - Seeder

Flags:

- `-r, --repository` - Generate repository only
- `-s, --seeder` - Generate seeder only
- `-c, --controller` - Generate controller only
- `-a, --all` - Generate everything
- `--dialect <d>` - Schema dialect: `postgres` | `mysql` | `sqlite`

The generated schema is **dialect-aware**: `--dialect` selects the table and
column helpers (`pgTable` + `serial` for postgres, `mysqlTable` + `int`
autoincrement for mysql, `sqliteTable` + `integer` primary key for sqlite). When
`--dialect` is omitted, the dialect is inferred from the `DATABASE_URL` scheme,
falling back to `postgres`. `drizzle.config.ts` is written with the matching
`drizzle-kit` dialect at install time, so `db:generate` / `db:migrate` target
the active database.

### Migration Commands

```bash
# Generate migration from schema changes
deno task cli db:generate

# Apply pending migrations
deno task cli db:migrate

# Check the migrations folder for consistency (not schema drift)
deno task cli db:status

# Empty the managed scope and apply every migration (see below)
deno task cli db:fresh

# Push schema without migrations (dev only)
deno task cli db:push
```

### `db:fresh`

`db:fresh` resets and migrates in one process, over one connection. It reads
`drizzle.config.ts` — `dialect`, `out`, `dbCredentials.url`, `migrations.table`,
`migrations.schema` and `schemaFilter` — empties a managed scope, then runs
drizzle-orm's own migrator on the same connection. It spawns no process and
calls no prompt API, so it behaves the same with or without a TTY. The
migrations folder is only read. There is no countdown.

"Fresh" empties a **managed scope**, not "what the migrations created":

| Dialect         | Scope                                                                                     | How                                                                                                                                                                                                                                        |
| :-------------- | :---------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sqlite / libsql | every table and view of `main`, except `sqlite_%` and `libsql_%`                          | one write batch: `PRAGMA defer_foreign_keys = ON`, the views, then the tables. Atomic                                                                                                                                                      |
| mysql           | every table and view of `DATABASE()`, the bookkeeping table included                      | one read for the database and its tables; a dedicated connection, destroyed afterwards: `FOREIGN_KEY_CHECKS` off, the bookkeeping table, then each view and table as `` `db`.`name` ``, checks back on. Not atomic: MySQL DDL auto-commits |
| postgres        | the tables, views, sequences, types and routines in `schemaFilter` (default `['public']`) | one transaction: the bookkeeping table, then each object `CASCADE`, keeping its schema; a closing set check rolls back an escaped `CASCADE` and names what it reached                                                                      |

On postgres, extension members (postgis, pgcrypto, vector…) and sequences owned
by a column are not dropped directly. A schema is dropped only when a migration
creates it with a plain `CREATE SCHEMA`. The bookkeeping table is
`"<migrations.schema>"."<migrations.table>"`, `"drizzle"."__drizzle_migrations"`
by default. Roles, extensions, collations, text-search configs and publications
survive, and so do MySQL procedures, functions and events.

**The closing check (R7) is a set check.** After the bookkeeping table is
dropped and before the first `CASCADE`, the transaction records every object
`pg_depend` knows outside the scope — `(classid, objid, objsubid)` with its
`pg_identify_object` type and identity. `pg_catalog`, `information_schema`,
`pg_toast*` and `pg_temp*` are not outside. An object without a schema of its
own (a trigger, a policy, a rule, a column default) is outside unless the object
owning it — through an auto, internal or partition dependency — is in scope. A
`CASCADE` walks only `pg_depend`, so every outside object it can reach is in
that set. The last statement looks for set members with no `pg_depend` row left,
and if any is gone it raises with their count and up to ten of them by type and
identity, and the whole reset is rolled back:

```text
db:fresh: a CASCADE reached outside the managed scope and dropped 1 object(s)
outside it (view audit.recent_users); the reset was rolled back
```

So an outside view, rule, column of an in-scope type, foreign key to an in-scope
table, operator over an in-scope function, or event trigger on one fails the
reset rather than vanishing with it. It is strict on purpose: a global object
that exists only through in-scope ones (a custom cast, a transform, a language,
an access method or a foreign-data wrapper with an in-scope handler), and an
outside object owned by an in-scope one, also roll back. Objects another session
creates during the reset are never compared; one it **drops** meanwhile causes a
rollback, the safe direction. The check is proven against a real postgres 16 in
the `live-postgres` CI job; the catalogue read that lists what to drop still
runs before the transaction opens.

**MySQL reads once.** `DATABASE()` and the database's tables and views come back
from one statement — two reads from the pool could come from two connections —
and every `DROP` is qualified as `` `db`.`name` ``, so the reset empties the
database it read even if the dedicated connection selects another. The
bookkeeping table is always dropped first, listed or not. The migrator still
runs unqualified on the pool.

**Guard.** Like `db:seed`, `db:fresh` refuses a production environment
(`DENO_ENV`/`APP_ENV` is `production`) unless `--allow-production` is passed,
before it reads the config or connects.

**Refusals.** Each one happens before anything is dropped, and each ends with
"Nothing was dropped.":

- `drizzle.config.ts` cannot be imported; `out` is not set; `dbCredentials`
  holds anything besides `url`; a `driver` is set; or the dialect is not
  `postgresql`, `mysql`, `sqlite` or `turso`. An import error is withheld, since
  the file builds the DSN and its error may quote it: only the error's name is
  shown, and only when it is a plain identifier. Import the file directly to see
  the error.
- The migrations journal (`meta/_journal.json`), or a file it lists, is missing:
  a database is never wiped that could not then be migrated.
- The driver offers no schema maintenance (a custom `DriverFactory` need not).
- MySQL: the connection has no database selected (`DATABASE()` is `NULL`), the
  catalogue read names more than one database, or it selects a system database —
  `mysql`, `sys`, `performance_schema` or `information_schema`, in any letter
  case.
- postgres: `schemaFilter` or `migrations.schema` names a system schema —
  `information_schema` or any `pg_*` schema (`pg_catalog`, `pg_toast`…), in any
  letter case. This is checked before the catalogue is even read.
- postgres: a migration creates a schema outside `schemaFilter`, or a schema to
  drop holds extension members.

`db:fresh` prints one line naming the dialect and the scope — never the DSN.
`db:migrate` still runs `drizzle-kit migrate`, which accepts credential forms
that `db:fresh` refuses.

### Database Commands

```bash
# Test database connection (one SELECT 1 round trip)
deno task cli db:check

# Run seeders
deno task cli db:seed

# Launch Drizzle Studio
dx drizzle-kit studio
```

### Exit Codes

Every `db:*` command exits `0` when it did its job and `1` when it did not, so a
deploy script can stop on a failed migration:

```bash
deno task cli db:migrate && deno task start
```

A failure is printed once on stderr as `❌ <message>`; for the commands that run
`drizzle-kit`, its own output comes first and the message ends with
`(drizzle-kit <subcommand> exited <n>)`.

| Command       | Exits `1` when                                                                                                                                                                                                                   |
| :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db:generate` | `drizzle-kit generate` exits non-zero                                                                                                                                                                                            |
| `db:migrate`  | `drizzle-kit migrate` exits non-zero                                                                                                                                                                                             |
| `db:push`     | `drizzle-kit push` exits non-zero                                                                                                                                                                                                |
| `db:studio`   | `drizzle-kit studio` exits non-zero                                                                                                                                                                                              |
| `db:status`   | `drizzle-kit check` exits non-zero. It validates the migrations folder only (snapshot versions, malformed snapshots, collisions); it reads neither the schema nor the database, so it reports no drift and no pending migrations |
| `db:check`    | the client cannot be configured, or the `SELECT 1` probe fails. The message ends with a hint to check `DATABASE_URL`                                                                                                             |
| `db:fresh`    | it is refused (see [`db:fresh`](#dbfresh)), the reset fails — migrations are then **not** run — or the migrate step fails                                                                                                        |
| `db:seed`     | the environment is production without `--allow-production`, the client cannot be configured, the seeder file is missing or exports no seeder, or the seeder's own `run()` throws (printed with its stack)                        |

## Advanced Queries

### Filtering

```typescript
import { and, eq, gt, gte, ilike, like, lt, lte, ne, or } from 'drizzle-orm'

// Single condition
const activeUsers = await db.instance
    .select()
    .from(users)
    .where(eq(users.emailVerified, true))

// Multiple conditions (AND)
const recentActiveUsers = await db.instance
    .select()
    .from(users)
    .where(and(
        eq(users.emailVerified, true),
        gt(users.createdAt, new Date('2024-01-01')),
    ))

// OR conditions
const specialUsers = await db.instance
    .select()
    .from(users)
    .where(or(
        eq(users.email, 'admin@example.com'),
        eq(users.role, 'admin'),
    ))

// Pattern matching
const searchResults = await db.instance
    .select()
    .from(users)
    .where(ilike(users.name, `%${query}%`))
```

### Sorting and Pagination

```typescript
import { asc, desc } from 'drizzle-orm'

// Sort by creation date (newest first)
const users = await db.instance
    .select()
    .from(users)
    .orderBy(desc(users.createdAt))

// Pagination
const page = 2
const perPage = 20
const paginatedUsers = await db.instance
    .select()
    .from(users)
    .limit(perPage)
    .offset((page - 1) * perPage)
```

### Joins

```typescript
// Left join
const postsWithAuthors = await db.instance
    .select({
        postId: posts.id,
        postTitle: posts.title,
        authorName: users.name,
        authorEmail: users.email,
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))

// Inner join
const publishedPostsWithAuthors = await db.instance
    .select()
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.published, true))
```

### Aggregations

```typescript
import { avg, count, max, min, sum } from 'drizzle-orm'

// Count users
const [{ value: userCount }] = await db.instance
    .select({ value: count() })
    .from(users)

// Group by and count
const postsByAuthor = await db.instance
    .select({
        authorId: posts.authorId,
        postCount: count(),
    })
    .from(posts)
    .groupBy(posts.authorId)
```

## Transactions

Execute multiple operations atomically:

```typescript
await db.instance.transaction(async (tx) => {
    // Create user
    const [user] = await tx.insert(users).values({
        email: 'new@example.com',
        name: 'New User',
        password: hashedPassword,
    }).returning()

    // Create first post
    await tx.insert(posts).values({
        title: 'Hello World',
        authorId: user.id,
    })

    // If any operation fails, all are rolled back
})
```

## Database Seeding

Create seed data for development:

```typescript
// database/seeders/user_seeder.ts
import { Database } from '@lockness/drizzle'
import { users } from '../../app/model/user.ts'
import * as bcrypt from 'bcrypt'

export class UserSeeder {
    async run(db: Database) {
        const hashedPassword = await bcrypt.hash('password123', 10)

        await db.instance.insert(users).values([
            {
                email: 'alice@example.com',
                name: 'Alice Smith',
                password: hashedPassword,
                emailVerified: true,
            },
            {
                email: 'bob@example.com',
                name: 'Bob Johnson',
                password: hashedPassword,
                emailVerified: true,
            },
        ])
    }
}
```

Register in `database/seeders/database_seeder.ts`:

```typescript
import { UserSeeder } from './user_seeder.ts'
import { PostSeeder } from './post_seeder.ts'

export const seeders = [
    UserSeeder,
    PostSeeder,
]
```

Run seeders:

```bash
deno task cli db:seed
```

## Drizzle Studio

Visual database browser:

```bash
dx drizzle-kit studio
```

Features:

- Browse and edit tables
- Run SQL queries
- View relationships
- Manage data visually
- Real-time updates

## Migration Workflow

1. **Modify schema** in `app/model/*.ts`

2. **Generate migration:**
   ```bash
   deno task cli db:generate
   ```

3. **Review migration** in `database/migrations/`

4. **Apply migration:**
   ```bash
   deno task cli db:migrate
   ```

5. **Commit migration** to version control

## Best Practices

- **Use repositories** for data access (don't query directly in controllers)
- **Define Zod schemas** with drizzle-zod for validation
- **Use transactions** for related operations
- **Create migrations** for all schema changes (never use db:push in production)
- **Use seeders** for test/development data
- **Leverage TypeScript inference** from Drizzle schemas
- **Add indexes** for frequently queried columns
- **Use relations** for cleaner queries with joins
- **Validate input** with Zod before inserting/updating
- **Handle unique constraint violations** gracefully

## Common Patterns

### Soft Deletes

```typescript
export const posts = pgTable('posts', {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    deletedAt: timestamp('deleted_at'),
})

// Soft delete
await db.instance
    .update(posts)
    .set({ deletedAt: new Date() })
    .where(eq(posts.id, id))

// Query non-deleted
const activePosts = await db.instance
    .select()
    .from(posts)
    .where(isNull(posts.deletedAt))
```

### Timestamps

```typescript
export const posts = pgTable('posts', {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Update with timestamp
await db.instance
    .update(posts)
    .set({
        title: 'New Title',
        updatedAt: new Date(),
    })
    .where(eq(posts.id, id))
```

### UUID Primary Keys

```typescript
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
})
```

## Complete Example

```typescript
// app/model/post.ts
import {
    boolean,
    integer,
    pgTable,
    serial,
    text,
    timestamp,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './user.ts'

export const posts = pgTable('posts', {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    content: text('content'),
    published: boolean('published').default(false),
    authorId: integer('author_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
})

export const postsRelations = relations(posts, ({ one }) => ({
    author: one(users, {
        fields: [posts.authorId],
        references: [users.id],
    }),
}))

export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert

// app/repository/post_repository.ts
import { Inject, Service } from '@lockness/core'
import { Database } from '@lockness/drizzle'
import { eq } from 'drizzle-orm'
import { type NewPost, type Post, posts } from '../model/post.ts'

@Service()
export class PostRepository {
    @Inject(Database)
    accessor db!: Database

    async findPublished(): Promise<Post[]> {
        return await this.db.instance
            .select()
            .from(posts)
            .where(eq(posts.published, true))
    }

    async findByIdWithAuthor(id: number) {
        return await this.db.instance.query.posts.findFirst({
            where: eq(posts.id, id),
            with: { author: true },
        })
    }

    async create(data: NewPost): Promise<Post> {
        const [post] = await this.db.instance
            .insert(posts)
            .values(data)
            .returning()
        return post
    }
}

// app/controller/post_controller.ts
import { Context, Controller, Get, Inject } from '@lockness/core'
import { PostRepository } from '../repository/post_repository.ts'

@Controller('/posts')
export class PostController {
    @Inject(PostRepository)
    accessor postRepo!: PostRepository

    @Get('/')
    async index(c: Context) {
        const posts = await this.postRepo.findPublished()
        return c.json({ posts })
    }

    @Get('/:id')
    async show(c: Context) {
        const id = Number(c.req.param('id'))
        const post = await this.postRepo.findByIdWithAuthor(id)

        if (!post) {
            return c.json({ error: 'Not found' }, 404)
        }

        return c.json({ post })
    }
}
```

## Upgrading to v0.5.0

One item. **Migration step:** percent-encode the password in your `DATABASE_URL`
if `connect()` now refuses it.

### 1. `connect()` refuses a DSN a driver could misparse

A DSN whose password holds a comma and a `/`, `?` or `#` was rewritten by
postgres.js before it failed, and pieces of the password reached the returned
error and the boot log (#425). Worse, some DSNs never failed: their password
fragments became host names, looked up in DNS. `connect()` now checks the DSN
before any driver sees it; see [DSN format](#dsn-format). What that changes:

- **Newly refused:** a DSN whose user or password holds any character outside
  `A-Za-z0-9-._~!$&'()*+,;=:` and `%XX`. That includes `^ | { } [ ] < > " \`, a
  backtick, a space, a non-ASCII character, a raw `@`, and a `%` not followed by
  two hex digits. Also refused: a raw `@` in the path or query string, a control
  character or leading space anywhere, a scheme with no `//` (other than `file:`
  and `sqlite:`), and a comma host list that also appears in the password. These
  DSNs may have worked before. `connect()` now returns `success: false` with the
  fixed message
  `DSN is not a valid URL; percent-encode reserved characters in the password`,
  and no driver is loaded.
- **The fix:** percent-encode the password, for example with
  `encodeURIComponent(password)` (`p@ss` becomes `p%40ss`, a space becomes
  `%20`, `%` becomes `%25`). Write a raw `@` in a query string as `%40`.
- **A client that cannot be built no longer shows its message.** The message may
  quote the DSN, so `connect()` shows only the error's name. A missing client
  package is still reported with its name and the import error.
- **A `probe()` failure that holds the password is withheld, not masked.** The
  exact DSN is still replaced with `<dsn redacted>`. But the password is never
  replaced inside driver text: replacing `postgres` would also mask
  `user "postgres"`, and replacing `5432` would mask a port, which tells a
  reader where the password is. So when any form of the password appears in the
  message (as written, decoded, or as `new URL()` encodes it), `probe()` throws
  `The database probe failed (<Name>); its message is withheld because it
  contains the database password`
  instead. A dev setup such as `postgres:postgres` therefore loses its probe
  diagnostics. Use a password that does not also appear as a user, database or
  host name.
- **Still accepted unchanged:** multi-host DSNs with or without ports
  (`h1:5432,h2:5433`), IPv6 hosts, percent-encoded host names, and SQLite
  `file:` paths.

## Upgrading to v0.4.0

One item, breaking in meaning rather than in signature. **No migration step.**
Read it if your code reads `connect()`'s result or `isConnected()`, wrote a
custom `DriverFactory`, or relied on the boot log to report an unreachable
database.

### 1. `connect()` no longer reaches the database

Before, `connect()` ran a `SELECT 1` before it reported success, and boot called
it whenever a URL was configured. On a host that starts processes or isolates
often, every start woke the database — a scale-to-zero Postgres stayed awake
with no traffic at all (#420). Now `connect()` only builds the client, which is
lazy, and makes **zero** round trips. What that changes:

- **`success: true` means configured, not reachable.** It is `false` only when
  the client package is missing or its parser rejects the URL. An unreachable
  database, wrong credentials or a stopped server surface at the first query, at
  `/ready` (503), or from `db:check`.
- **`isConnected()` means "configured and not closed".** It no longer says the
  database answered.
- **A custom `DriverFactory` must not make a round trip.** A factory that
  connects eagerly brings the per-start wake back for every app that uses it.
- **Boot no longer logs an unreachable database.** It never failed on one — the
  result was discarded — but the `❌` line is gone. To make boot fail, add the
  probe yourself; see
  [Boot Behaviour and Readiness](#boot-behaviour-and-readiness).
- **`db:seed` now stops** when `connect()` fails, instead of handing its seeders
  an unconfigured handle.

Point liveness monitors at `/health`, which touches no database. `/ready` probes
it, and polling it keeps a scale-to-zero database awake.

## Dependencies

- `drizzle-orm` - ORM library
- `drizzle-kit` - CLI tools, pinned to exactly `0.31.10`
- `drizzle-zod` - Zod schema generation
- `postgres` - PostgreSQL client
