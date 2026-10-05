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
  parses, so the DSN a driver reads would not be the one checked. That includes
  a trailing newline, which a DSN read from a file often ends with: trim it.
- **A scheme is followed by `//`.** `postgres:app:pw@db/prod` is refused: a
  driver would read everything after `postgres:` as the database name. Only
  `file:` and `sqlite:` paths may omit the `//`.

Then, in the grammar below, the **authority** is the text after `scheme://` up
to the first `/`, `?` or `#`, and the **tail** is everything after it. A DSN is
accepted when:

1. **The tail holds no raw `@`.** Write `%40` in a path, query string or
   fragment.
2. **The authority holds at most one `@`, and the user and password use only the
   allowed characters:** `A-Za-z0-9-._~!$&'()*+,;=:` and percent-encoded bytes
   (`%XX`). Each percent sequence must decode as UTF-8. Every other character
   must be percent-encoded.
3. **The host part is empty, or a comma-separated list of hosts.** Each host is
   an `[IPv6]` literal or a name made of the same characters (without `,` or
   `:`), optionally followed by `:port`.
4. **The DSN is a valid WHATWG URL** once the host list is cut to its first
   host.
5. **A host list with a comma does not also appear before the host part, and
   holds no `$`.** postgres.js cuts the list by replacing its first match
   anywhere in the DSN. With `postgres://app:xdb1,db2x@db1,db2/prod`, that match
   is inside the password, so the password would be rewritten; the user is
   checked the same way. The replacement also reads `$` as a pattern, which can
   splice the password into the database name.

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

`drizzle.config.ts` (auto-generated by installer, with the dialect inferred from
the `DATABASE_URL` scheme):

```typescript
import { defineConfig } from 'drizzle-kit'

// No fallback: a default URL would point a destructive command at a database
// nobody chose.
const url = Deno.env.get('DATABASE_URL')

export default defineConfig({
    schema: './app/model/*.ts',
    out: './database/migrations',
    dialect: 'postgresql',
    ...(url ? { dbCredentials: { url } } : {}),
})
```

The installer never overwrites an existing `drizzle.config.ts`. See
[When `DATABASE_URL` is unset](#when-database_url-is-unset).

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

### What `connect()`, `probe()`, `close()`, `db` and `isConnected()` mean

| Member          | Round trips | Meaning                                                                                                                                                                                                                                                                                                                                                                                         |
| :-------------- | :---------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect()`     | 0           | Checks the DSN, loads the driver and builds the client. `success: false` means the DSN was refused, the client package is missing, or the client rejected the URL; no client is kept, so a retry is legal. Prints one line unless `silent: true`. **Throws** `Database is already configured; call close() before connect() again` when the instance already holds a client or is building one. |
| `probe()`       | 1           | Runs `SELECT 1`. Throws `Database is not connected` before `connect()` or after `close()`. Otherwise it re-throws a driver failure: the exact DSN is replaced with `<dsn redacted>`, and a message holding a credential (the password, or a credential query value such as `authToken`) is withheld whole (see [When a probe failure is withheld](#when-a-probe-failure-is-withheld)).          |
| `close()`       | 0           | Closes the client. Waits for a `connect()` still in flight, then closes what it built: once `close()` resolves, no client exists. Safe to call twice, or before `connect()`. After it, `connect()` is legal again.                                                                                                                                                                              |
| `db`            | 0           | The Drizzle instance of the configured client. Throws `Database is not connected` before `connect()` and after `close()`. Read-only: stub it in tests with `setDriverFactory()`, not by assignment.                                                                                                                                                                                             |
| `isConnected()` | 0           | `true` once a client is configured and until `close()`. It does **not** mean that the database is reachable. Call `probe()` to find out.                                                                                                                                                                                                                                                        |

A custom driver registered with `Database.setDriverFactory()` must follow the
same contract: the factory constructs its client and makes no round trip.

**One client per `Database`.** The container holds one `Database`, and it holds
one client at a time. When `@Kernel({ database })` is set, the boot step
configures it, so an `@OnBoot` hook must not call `connect()` again: that
throws, and the boot fails. To point the instance at another database, call
`close()` first.

### Where each failure surfaces

| Failure                                           | At boot                                                                                                                                                                                                                  | After boot                                                                                                                            |
| :------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| DSN refused (see [DSN format](#dsn-format))       | `connect()` returns `success: false` with a fixed message that quotes no part of the DSN. Boot continues.                                                                                                                | `/ready` returns `503` with `database: down`. `db:seed` and `db:check` print the error once and exit 1.                               |
| Client package missing, or URL the client rejects | `connect()` returns `success: false` and, unless `silent: true`, logs a `❌` line: the package and import error (withheld if it holds a credential), or the client's message withheld (error name only). Boot continues. | `/ready` returns `503` with `database: down`. `db:seed` and `db:check` print the error once and exit 1.                               |
| Host unreachable, bad credentials, database down  | Nothing is sent, so nothing is reported.                                                                                                                                                                                 | `/ready` returns `503` within 3 s. The first query gets the driver's error. `db:check` reports it, withheld if it holds a credential. |

### When a probe failure is withheld

`probe()` (and so `/ready` and `db:check`) re-throws a driver failure with the
exact DSN replaced by `<dsn redacted>`. When the message or the error name still
holds a form of a credential, the message is withheld whole:

```text
The database probe failed (<Name>); its message is withheld because it contains a database credential
```

The `(<Name>)` part is left out when the error has no name, or when the name
itself holds the credential.

The forms checked are the password as written, percent-decoded, and as
`new URL()` encodes it, and each credential query value such as `authToken`. The
password is never replaced inside the driver's text: replacing `postgres` would
also mask `user "postgres"`, and the masked spot would show where the password
is.

**Development setups hit this often.** When the password also appears as a user,
database or host name, as in the Docker default `postgres:postgres`, most probe
failures quote it and are withheld. To see the driver's message, use a password
that no user, database or host name contains.

**Known limit.** A withheld message still tells the reader that a form of the
password occurs in the driver's text, though never where. A short password (`e`,
`5432`) occurs in most texts, so it withholds most messages. This residue is
accepted by design, rather than refusing short passwords or withholding every
message: it is a documented limit, not a defect.

### Server notices

PostgreSQL sends _notices_ alongside query results: a `WARNING` such as
`there is no transaction in progress`, or a `NOTICE` such as
`schema "drizzle" already exists, skipping` on every idempotent
`CREATE … IF NOT EXISTS`. Left to itself, postgres.js prints each one as a raw
object on stdout. Every client this package opens (the `Database` service,
`db:migrate`, `db:fresh`, `db:seed`, `db:check` and the installer's connection
probe) routes them by severity instead:

| Severity                         | Goes to          | Without a logger (the default)                                              | With `logger: true` on the kernel |
| :------------------------------- | :--------------- | :-------------------------------------------------------------------------- | :-------------------------------- |
| `WARNING`                        | `reporter.warn`  | one stderr line: `⚠️  PostgreSQL warning: <message>`, plus `— hint: <hint>` | `logger().warn(message, fields)`  |
| `NOTICE`, `INFO`, `LOG`, `DEBUG` | `reporter.debug` | **discarded**, the same outcome as a logger at its default level            | `logger().debug(message, fields)` |
| unrecognised or missing          | `reporter.warn`  | as `WARNING`: it errs toward being visible                                  | as `WARNING`                      |

- **Fields.** `fields` holds whichever of `severity`, `code`, `detail`, `hint`
  and `where` the notice carries. The message and every field are encoded with
  `safeForLog`, because a notice can carry user data (a `RAISE NOTICE` in a SQL
  function, for example).
- **`silent: true` does not hide warnings.** It governs only `connect()`'s own
  status line. The `db:*` commands connect silently, and a real warning still
  reaches you.
- **The CLI never has a logger.** The `db:*` commands do not boot the kernel, so
  they always use the console fallback: warnings are printed, the rest are
  discarded.
- **Your own reporter.** Outside the kernel, pass one to `connect()`:

  ```typescript
  import { Database, type NoticeReporter } from '@lockness/drizzle'

  const notices: NoticeReporter = {
      warn: (message, fields) => console.warn(message, fields),
      debug: (message, fields) => console.debug(message, fields),
  }
  await new Database().connect(Deno.env.get('DATABASE_URL')!, { notices })
  ```

  The reporter is synchronous and must not throw: it runs inside postgres.js's
  socket handler.
- **A custom driver factory** receives the routed callback as
  `options.onNotice`, its optional second parameter. A factory that takes only
  the url keeps working, and its notices are its own business.
- **Not covered.** `db:generate`, `db:push` and `db:validate` run `drizzle-kit`
  in a subprocess, which opens its own client with no notice handler. MySQL and
  SQLite warnings are not routed.

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
    accessor database!: Database

    async getAllUsers() {
        return await this.database.db.select().from(users)
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
    accessor database!: Database

    @Get('/')
    async index(c: Context) {
        const allUsers = await this.database.db.select().from(users)
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
const usersWithPosts = await database.db.query.users.findMany({
    with: {
        posts: true,
    },
})

// Get post with author
const postWithAuthor = await database.db.query.posts.findFirst({
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
    accessor database!: Database

    async findAll(): Promise<User[]> {
        return await this.database.db.select().from(users)
    }

    async findById(id: number): Promise<User | undefined> {
        const result = await this.database.db
            .select()
            .from(users)
            .where(eq(users.id, id))
        return result[0]
    }

    async findByEmail(email: string): Promise<User | undefined> {
        const result = await this.database.db
            .select()
            .from(users)
            .where(eq(users.email, email))
        return result[0]
    }

    async create(data: NewUser): Promise<User> {
        const result = await this.database.db
            .insert(users)
            .values(data)
            .returning()
        return result[0]
    }

    async update(id: number, data: Partial<NewUser>): Promise<User> {
        const result = await this.database.db
            .update(users)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(users.id, id))
            .returning()
        return result[0]
    }

    async delete(id: number): Promise<void> {
        await this.database.db.delete(users).where(eq(users.id, id))
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

# List which migrations the database has applied; exits 1 while any is pending
deno task cli db:status

# Validate the migrations folder (drizzle-kit check; reads no database)
deno task cli db:validate

# Empty the managed scope and apply every migration (see below)
deno task cli db:fresh

# Push schema without migrations (dev only)
deno task cli db:push
```

### `db:migrate`

`db:migrate` runs in-process: it reads `drizzle.config.ts` (`dialect`, `out`,
`dbCredentials.url`, `migrations.table`, `migrations.schema`) and applies the
pending migrations with drizzle-orm's own migrator, through the same client the
app uses. It spawns no `drizzle-kit` process and has no production guard — it is
the deploy step. It accepts one credential form, the one the runtime connects
with:

```typescript
dbCredentials: {
    url: Deno.env.get('DATABASE_URL')!
}
```

Host fields (`host`, `port`, `user`, `password`, `database`), `ssl`, a Turso
`authToken` and any other key are refused in one message that names each form
and its url alternative: `?sslmode=require` / `?sslmode=verify-full` (postgres),
`?ssl=<percent-encoded JSON>` (mysql), `?authToken=<token>` (Turso). An `ssl`
certificate object, a `driver` (`aws-data-api`, `pglite`, `d1-http`, `expo`,
`durable-sqlite`) and the `singlestore` and `gel` dialects have no in-process
path: the refusal names `deno run -A npm:drizzle-kit@0.31.10 migrate` instead.
`out` must be set, and only `drizzle.config.ts` is read. A url that names no
database is refused, as for [`db:fresh`](#dbfresh).

Each refusal is printed as
`db:migrate refused: drizzle.config.ts: <reason>. No
migration was applied.` and
nothing is connected. `db:migrate` and `db:fresh` share one settings loader, so
they cannot disagree about which database a config names; `db:migrate` skips
only `db:fresh`'s production guard and its `schemaFilter` checks. A missing
journal is refused before connecting. The command prints
`🚀 Running migrations...` and `✅ Migrations applied
successfully`, and a
failure as `Could not open the database: …` or `Failed to
apply migrations: …`.

### `db:status`: pending migrations

`db:status` answers "which migrations has this database not applied?" (#439). It
loads the same `drizzle.config.ts` settings as `db:migrate`, with the same
refusals (url-only `dbCredentials`, no default database, a readable journal),
and opens the same connection, so it reports on exactly the database and the
migrations `db:migrate` would act on. It reads and never writes: it does not
create the bookkeeping table, spawns nothing, and has no production guard, since
it is the deploy gate.

```
📊 Migration status (bookkeeping table "drizzle"."__drizzle_migrations")
  applied        0000_init
  applied        0001_users     ⚠️ edited after it was applied; db:migrate will not re-run it
  pending        0002_posts
  out of order   0003_tags      ⚠️ older than the latest applied migration; db:migrate will not apply it
  ⚠️ 1 applied migration is not in the journal (recorded at 2026-09-30T10:00:00.000Z)
❌ 2 of 4 migrations are not applied: 1 pending, 1 out of order
```

With nothing left to apply it ends on `✅ All 4 migrations are applied`; an
empty journal prints `✅ The journal lists no migrations`. The last line is
always the count. The url is never printed.

**How it decides.** drizzle-orm's migrator records each applied migration as a
row holding the journal entry's `when` as `created_at` and the file's SHA-256 as
`hash`. On the next run it applies every entry whose `when` is greater than the
**latest** `created_at`, and never compares hashes. `db:status` uses the same
rule, and a libsql test running the real migrator pins that the two agree:

| State           | Rule                                                                                 | Exit       |
| :-------------- | :----------------------------------------------------------------------------------- | :--------- |
| applied         | a row has `created_at` equal to the entry's `when`                                   | 0          |
| applied, edited | applied, but the file's hash changed since: it is not re-run                         | 0, warning |
| pending         | newer than every row (or no row at all): `db:migrate` applies it                     | **1**      |
| out of order    | no row, but older than the latest row: `db:migrate` never applies it                 | **1**      |
| unknown row     | a row no journal entry matches: applied from another branch, or its file was deleted | 0, warning |

A database never migrated has no bookkeeping table: every migration is pending,
and that is not an error. Whether the table exists is asked of the catalogue
(`pg_catalog.pg_tables`, `information_schema.tables` under `DATABASE()`,
`sqlite_master`) with fixed SQL; the names from `migrations.table` and
`migrations.schema` are compared in code, never written into SQL as literals.

**An out-of-order migration** usually comes from a branch merge: another branch
applied a newer migration first. `db:migrate` will skip it for good. Regenerate
it so it gets a later timestamp (delete the file and its journal entry, then
`db:generate`), or apply its SQL by hand. `db:validate` catches the collision at
merge time, before any database sees it.

It exits `1` when a migration is pending or out of order, or when the status
could not be read: a refusal
(`db:status refused: …. No migration status was
read.`), a client that cannot be
configured, a failed query, or a bookkeeping row whose `created_at` is not an
integer. A configuration only drizzle-kit can run (an `ssl` certificate, a
drizzle-kit-only driver) is refused with no fallback: drizzle-kit has no status
command.

**`db:validate`** is the folder-only check `db:status` used to be:
`drizzle-kit check` validates snapshot versions, malformed snapshots and
collisions, reads no database, and needs no `DATABASE_URL`, so a pre-merge CI
job can run it.

### `db:fresh`

`db:fresh` resets and migrates in one process, from one configuration. It reads
`drizzle.config.ts` — `dialect`, `out`, `dbCredentials.url`, `migrations.table`,
`migrations.schema` and `schemaFilter` — empties a managed scope, then runs
drizzle-orm's own migrator against the same database. The steps do not yet share
one connection: on postgres the catalogue is read before the reset transaction
opens, and on MySQL the reads and the migrate use the pool while the reset runs
on its own connection, so a pooled connection switched to another database would
migrate there (tracked in #447). It spawns no process and calls no prompt API,
so it behaves the same with or without a TTY. The migrations folder is only
read. There is no countdown.

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
survive, and so do MySQL procedures, functions and events. Operators and event
triggers survive only while their function lies outside the scope: when it is in
scope, the `CASCADE` would take them along, so they count as escapes and the
closing check below rolls the reset back.

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
runs unqualified on the pool. The reset, its destroyed connection and the
system-database refusal are proven against a real MySQL 8.4 in the `live-mysql`
CI job.

**Guard.** Like `db:seed`, `db:fresh` refuses a production environment
(`APP_ENV` is `production`) unless `--allow-production` is passed, and a
`DENO_ENV` that disagrees with `APP_ENV` is refused even with the flag, before
it reads the config or connects.

**Refusals.** Each one happens before anything is dropped, and each ends with
"Nothing was dropped.":

- `drizzle.config.ts` cannot be imported; `out` is not set; a `driver` is set;
  or the dialect is not `postgresql`, `mysql`, `sqlite` or `turso`. An import
  error is withheld, since the file builds the DSN and its error may quote it:
  only the error's name is shown, and only when it is a plain identifier. Import
  the file directly to see the error.
- `dbCredentials` does not name one database. Each fault has its own message,
  and none quotes the URL: `dbCredentials` is not set or is not an object;
  `dbCredentials.url` is not set or is not a string; `dbCredentials` holds any
  form besides `url`, refused as for [`db:migrate`](#dbmigrate); or
  `dbCredentials.url` is **empty or only whitespace**. A driver given no URL
  falls back to its own default target, so an empty URL would reset a database
  the config never named. It is what `url: Deno.env.get('DATABASE_URL') ?? ''`
  yields with the variable unset, which is why its message points at the
  variable.
- `dbCredentials.url` is not empty but **names no database**. A driver falls
  back to a default target here too: postgres.js connects to `PGDATABASE`, or to
  a database named after the connecting user (the URL's username, or the OS
  user), and libsql opens a throwaway temporary database. It is what
  `` url: `postgres://localhost:5432/${Deno.env.get('DB_NAME') ?? ''}` `` yields
  with the variable unset, so the message points at the variable the name is
  built from, and quotes nothing from the URL.
  - postgresql and mysql: the path after the host must name the database —
    `postgres://`, `postgres:///`, `postgres://localhost:5432/`,
    `postgres://localhost/` and `postgres://host?sslmode=require` are refused,
    in either scheme spelling, as is a path that is only a dot segment (`/.`,
    `/%2e`). The path is read the way the drivers read it, with the URL API, and
    a URL with no `scheme://` part names nothing: name the database in the path.
    For postgresql a `database` query key is refused outright, because
    postgres.js lets it override the path (an empty one sends no database at
    all), and so is a host holding an encoded comma, which postgres.js decodes
    into a host list and rewrites the URL around. mysql2 ignores a query
    `database` when the path names one.
  - MySQL is checked here as well, not left to the `DATABASE()` check below, so
    it is refused before a connection is opened. The `DATABASE()` check stays,
    for a driver that selects no database by other means.
  - sqlite and turso: a `file:` URL with no path (`file:`, `file://`) is
    refused. A remote URL (`libsql://`, `https://`) names its database by host,
    and `:memory:` is accepted.
- The migrations journal (`meta/_journal.json`), or a file it lists, is missing,
  or a journal entry's `when` is not an integer: a database is never wiped that
  could not then be migrated.
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

`db:fresh` prints one line naming the dialect and the scope — never the DSN. It
never names drizzle-kit as a fallback: drizzle-kit has no equivalent, and
`drizzle-kit drop` deletes migration files.

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
`(drizzle-kit <subcommand> exited <n>)`. `db:generate` and `db:push` also fail
when drizzle-kit exits 0 after writing to stderr; see
[`db:generate` and `db:push` without a terminal](#dbgenerate-and-dbpush-without-a-terminal).

| Command       | Exits `1` when                                                                                                                                                                                                                              |
| :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `db:generate` | `drizzle-kit generate` exits non-zero, or exits 0 after writing to stderr (#445)                                                                                                                                                            |
| `db:migrate`  | it is refused (see [`db:migrate`](#dbmigrate)), the client cannot be configured, or the migrator fails                                                                                                                                      |
| `db:push`     | `drizzle-kit push` exits non-zero, or exits 0 after writing to stderr (#445)                                                                                                                                                                |
| `db:studio`   | `drizzle-kit studio` exits non-zero                                                                                                                                                                                                         |
| `db:status`   | a migration is pending or out of order, or the status could not be read: it is refused (see [`db:status`](#dbstatus-pending-migrations)), the client cannot be configured, a query fails, or a bookkeeping row is malformed                 |
| `db:validate` | `drizzle-kit check` exits non-zero. It validates the migrations folder only (snapshot versions, malformed snapshots, collisions); it reads neither the schema nor the database, so it reports no drift and no pending migrations            |
| `db:check`    | `DATABASE_URL` is unset or blank, the client cannot be configured, or the `SELECT 1` probe fails. The message ends with a hint to check `DATABASE_URL`                                                                                      |
| `db:fresh`    | it is refused (see [`db:fresh`](#dbfresh)), the reset fails — migrations are then **not** run — or the migrate step fails                                                                                                                   |
| `db:seed`     | the environment is production without `--allow-production`, `DATABASE_URL` is unset or blank, the client cannot be configured, the seeder file is missing or exports no seeder, or the seeder's own `run()` throws (printed with its stack) |

### `db:generate` and `db:push` without a terminal

drizzle-kit 0.31.10's exit code does not report what `generate` and `push` did.
On postgres and sqlite, their catch-alls print the error to **stderr** and exit
**0**. The same happens when a prompt finds no TTY: a column rename ("rename or
create?") or a data-loss confirmation. So Lockness judges these two commands on
two signals. **A run passes only if drizzle-kit exits 0 and writes nothing but
whitespace to stderr.** Measured with no TTY:

| Run                                   | drizzle-kit exit | drizzle-kit stderr                             | Lockness                                     |
| :------------------------------------ | :--------------- | :--------------------------------------------- | :------------------------------------------- |
| `generate`, no schema change          | 0                | empty                                          | exit 0                                       |
| `generate`, a column renamed          | 0                | `Interactive prompts require a TTY terminal …` | exit 1, says a terminal is needed; no file   |
| `push`, clean (postgres)              | 0                | empty                                          | exit 0                                       |
| `push`, a column renamed (postgres)   | 0                | `Interactive prompts require a TTY terminal …` | exit 1, says a terminal is needed; no change |
| `push`, an `ALTER` the server rejects | 0                | `PostgresError: …`                             | exit 1, says the schema may be partly pushed |
| `push`, `DATABASE_URL` unset          | 1                | empty (the message is on stdout)               | exit 1                                       |

**Neither command hangs without a TTY.** drizzle-kit refuses a prompt whenever
stdin or stdout is not a terminal. Lockness keeps both inherited, so on a
terminal the prompt appears and can be answered as before. Only stderr is piped:
Lockness forwards it live and keeps a copy to judge.

**What a refusal tells you.** The refusal sentence picks only the wording of the
failure, never whether the run failed:

- `db:generate`: run it in a terminal and commit the migration. generate has no
  non-interactive option for renames.
- `db:push`: run it in a terminal. For CI, run `db:generate` locally and
  `db:migrate` in CI.

Any other stderr after an exit 0 fails with
`(drizzle-kit <sub> exited 0 after reporting an error; see above)`. For
`db:push` the message adds that **the schema may be partly pushed**: drizzle-kit
runs its statements one at a time, outside a transaction, and Lockness cannot
roll them back.

**Why drizzle-kit is spawned with `deno run -q`.** Without `-q`, Deno writes to
stderr itself on a project's first run: the npm `Initialize …` lines, the
deprecated-package warning and "Ignored build scripts". The stderr rule would
then fail a run that worked. The command a `db:migrate` refusal suggests you
type omits `-q`; nothing judges that run.

**There is no closing ✅ line any more.** Lockness cannot observe the outcome.
drizzle-kit's own last line reports it: `No schema changes, nothing to migrate`,
`[✓] Changes applied`, or `[x] All changes were aborted`.

**Not covered:**

- **`db:push` on mysql.** drizzle-kit's `mysqlPush` catch-all prints to
  **stdout**, so its swallowed errors (a TTY refusal included) still exit 0 and
  the stderr rule cannot see them. Tracked in #561.
- **"No, abort" on a terminal still exits 0.** Only a person at a terminal can
  choose it, and drizzle-kit's `[x] All changes were aborted` is the last line.
- **`db:validate` and `db:studio`** keep the exit-code rule: their stderr is
  shown, not judged.
- **A drizzle-kit pin that prints harmless text to stderr on success** makes
  these commands fail, showing the text. That is deliberate: a loud false
  failure beats a silent false success. `deno task kits:smoke` and
  `deno task test:postgres` are the early warning on a pin bump.

### When `DATABASE_URL` is unset

No `db:*` command falls back to a default database (#443). `DATABASE_URL` is the
only source of a target, so unset or blank it names none:

- `db:seed` and `db:check` refuse before connecting:
  `Database not configured: DATABASE_URL is not set, so no database is named; the db:* commands never fall back to a default database`
  (`is empty` for a blank value).
- `db:migrate`, `db:fresh` and `db:status` refuse: `drizzle.config.ts` carries
  no `dbCredentials` (see [`db:fresh`](#dbfresh)).
- `db:push` and `db:studio` fail with drizzle-kit's own message.
- `db:generate` and `db:validate` need no database and run as usual.
- The app boots without connecting.

A `drizzle.config.ts` you edit to read another variable, or to hard-code a URL,
is yours: nothing detects that it names a different database from the one
`db:seed` and `db:check` use.

## Advanced Queries

### Filtering

```typescript
import { and, eq, gt, gte, ilike, like, lt, lte, ne, or } from 'drizzle-orm'

// Single condition
const activeUsers = await database.db
    .select()
    .from(users)
    .where(eq(users.emailVerified, true))

// Multiple conditions (AND)
const recentActiveUsers = await database.db
    .select()
    .from(users)
    .where(and(
        eq(users.emailVerified, true),
        gt(users.createdAt, new Date('2024-01-01')),
    ))

// OR conditions
const specialUsers = await database.db
    .select()
    .from(users)
    .where(or(
        eq(users.email, 'admin@example.com'),
        eq(users.role, 'admin'),
    ))

// Pattern matching
const searchResults = await database.db
    .select()
    .from(users)
    .where(ilike(users.name, `%${query}%`))
```

### Sorting and Pagination

```typescript
import { asc, desc } from 'drizzle-orm'

// Sort by creation date (newest first)
const users = await database.db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt))

// Pagination
const page = 2
const perPage = 20
const paginatedUsers = await database.db
    .select()
    .from(users)
    .limit(perPage)
    .offset((page - 1) * perPage)
```

### Joins

```typescript
// Left join
const postsWithAuthors = await database.db
    .select({
        postId: posts.id,
        postTitle: posts.title,
        authorName: users.name,
        authorEmail: users.email,
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))

// Inner join
const publishedPostsWithAuthors = await database.db
    .select()
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.published, true))
```

### Aggregations

```typescript
import { avg, count, max, min, sum } from 'drizzle-orm'

// Count users
const [{ value: userCount }] = await database.db
    .select({ value: count() })
    .from(users)

// Group by and count
const postsByAuthor = await database.db
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
await database.db.transaction(async (tx) => {
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
import { container } from '@lockness/core'
import { Database } from '@lockness/drizzle'
import { users } from '../../app/model/user.ts'
import * as bcrypt from 'bcrypt'

export class UserSeeder {
    private database: Database

    constructor() {
        this.database = container.get<Database>(Database)
    }

    async run(): Promise<void> {
        const hashedPassword = await bcrypt.hash('password123', 10)

        await this.database.db.insert(users).values([
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

`db:seed` instantiates the seeder with `new` and calls `run()` with no argument,
so a seeder takes `Database` from the container itself, as the `make:seeder`
stub does.

Register it in `database/seeders/database_seeder.ts`. With no argument,
`db:seed` runs the `DatabaseSeeder` class exported there:

```typescript
import { UserSeeder } from './user_seeder.ts'
import { PostSeeder } from './post_seeder.ts'

export class DatabaseSeeder {
    async run(): Promise<void> {
        const seeders: { new (): { run(): Promise<void> } }[] = [
            UserSeeder,
            PostSeeder,
        ]

        for (const Seeder of seeders) {
            await new Seeder().run()
        }
    }
}
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
await database.db
    .update(posts)
    .set({ deletedAt: new Date() })
    .where(eq(posts.id, id))

// Query non-deleted
const activePosts = await database.db
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
await database.db
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
    accessor database!: Database

    async findPublished(): Promise<Post[]> {
        return await this.database.db
            .select()
            .from(posts)
            .where(eq(posts.published, true))
    }

    async findByIdWithAuthor(id: number) {
        return await this.database.db.query.posts.findFirst({
            where: eq(posts.id, id),
            with: { author: true },
        })
    }

    async create(data: NewPost): Promise<Post> {
        const [post] = await this.database.db
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

Three items. **Migration steps:** percent-encode the password in your
`DATABASE_URL` if `connect()` now refuses it; remove a second `connect()` on the
same `Database`; and stub `db` in tests through `setDriverFactory()` rather than
by assignment.

### 1. `connect()` refuses a DSN a driver could misparse

A DSN whose password holds a comma and a `/`, `?` or `#` was rewritten by
postgres.js before it failed, and pieces of the password reached the returned
error and the boot log (#425). Worse, some DSNs never failed: their password
fragments became host names, looked up in DNS. `connect()` now checks the DSN
before any driver sees it; see [DSN format](#dsn-format). What that changes:

- **Newly refused:** a DSN whose user or password holds any character outside
  `A-Za-z0-9-._~!$&'()*+,;=:` and `%XX`. That includes `^ | { } [ ] < > " \`, a
  backtick, a space, a non-ASCII character, a raw `@`, and a `%` not followed by
  two hex digits. Also refused: a raw `@` in the path, query string or fragment;
  a control character anywhere, including the trailing newline a DSN read from a
  file often ends with; a leading space; a scheme with no `//` (other than
  `file:` and `sqlite:`); a comma host list that also appears in the user or
  password; and a `$` in a comma host list. [DSN format](#dsn-format) is the
  complete list. These DSNs may have worked before. `connect()` now returns
  `success: false` with the fixed message
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
  contains a database credential`
  instead. A dev setup such as `postgres:postgres` therefore loses its probe
  diagnostics. Use a password that does not also appear as a user, database or
  host name; see
  [When a probe failure is withheld](#when-a-probe-failure-is-withheld).
- **Still accepted unchanged:** multi-host DSNs with or without ports
  (`h1:5432,h2:5433`), IPv6 hosts, percent-encoded host names, and SQLite
  `file:` paths.

### 2. A credential in the DSN's query string is withheld too

A libsql `authToken`, a `?password=` or an `sslpassword` in the query string was
hidden only when a driver echoed the exact DSN. Echoed on its own, or inside a
URL the driver rebuilt, it reached the thrown error, `/ready` and `db:check`
(#438). `probe()` now holds the value of every query parameter whose name marks
a credential, in each form a driver may echo (as written, percent-decoded,
decoded and re-encoded, with `+` read as a space, and as `new URL()` serialises
it; `%2b` and `%2B` count as the same), and withholds a message holding one,
exactly as it does for the password.

- **Not detected: a partial echo.** A driver that prints only a prefix or a
  suffix of a token (`token abc…` truncated, or `…xyz` as a hint) matches no
  held form, so its message is shown. Catching it would mean editing driver text
  around the value, which #425 forbids: replacing by value turns the replacement
  into a detector of where the secret is. Only whole forms are matched.

- **Which names:** a name that, lowercased and with `.`, `_`, `~` and `-`
  removed, and trailing digits and a trailing `confirmation` dropped, ends in
  `token`, `key`, `secret`, `password`, `passwd`, `pwd`, `pass`, `sig`,
  `signature`, `credential`, `auth`, `jwt`, `phrase`, `assertion` or `verifier`
  (or one of those plus `s`), or is exactly `code`. `key_id` and `token_type`
  are not credentials; `sslkey` is (its value is a path, which then withholds a
  message quoting it).
- **The sentence changed:** every withheld message now ends in
  `contains a database credential` rather than
  `contains the database
  password`. Match on the start of the sentence if you
  match it at all.
- **An empty value holds nothing:** `?authToken=` cannot withhold every message.

### 3. A `Database` holds one client at a time

A second `connect()` on a configured `Database` built a second client and
dropped the first without closing it; two concurrent calls did the same; and a
`close()` during a `connect()` returned before the client existed, which then
outlived it (#427). Each orphaned client kept its sockets open. What changes:

- **A second `connect()` throws**
  `Database is already configured; call close()
  before connect() again` —
  whatever its URL, whether the first call has finished or is still building,
  and before it checks the DSN or prints anything. The first client stays in
  use. To switch databases, `close()` first. The most likely way to hit it:
  setting `@Kernel({ database })` **and** calling `connect()` from an `@OnBoot`
  hook. Keep one of the two. The boot step does not catch this error: two
  configures in one process are a wiring error, so the boot fails.
- **`close()` waits for a `connect()` in flight** and closes what it builds.
  Once it resolves, no client exists and `connect()` is legal again.
- **`db` throws `Database is not connected`** before `connect()` and after
  `close()`, where it used to be `undefined` and then the closed client. It is
  now a getter with no setter: a test that assigned `database.db = fake` must
  register a fake driver with `setDriverFactory()` and call `connect()` instead.
  Code that kept a reference to `database.db` across a `close()` still gets the
  driver's own error, not this one.
- **`silent: true` silences the failure line too.** `connect()` used to print
  `❌ Database connection failed` whatever `silent` said. The failure is still
  returned as `success: false`, so a caller that passes `silent` must report it.
  `db:check` and `db:seed` now pass it, as `db:fresh` already did, and print a
  failure once instead of twice, with no `✅ Database configured` line before a
  failing probe.

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
