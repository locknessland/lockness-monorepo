# Multi-DB drivers & model factories

`@lockness/drizzle` connects to PostgreSQL (default), MySQL, or SQLite behind
one `Database` service, and ships a faker-backed factory layer for realistic
test and seed data.

- [Choosing a database](#choosing-a-database)
- [How the dialect is resolved](#how-the-dialect-is-resolved)
- [`deno compile` and SQLite](#deno-compile-and-sqlite)
- [Model factories](#model-factories)
- [`make:factory`](#makefactory)
- [Factory-aware seeders](#factory-aware-seeders)

---

## Choosing a database

Set `driver` on the database config (default `postgres` — existing apps need no
change):

```ts
// config/database.ts
import type { DatabaseConfig } from '@lockness/core'

export const databaseConfig: DatabaseConfig = {
    url: Deno.env.get('DATABASE_URL') || 'postgres://localhost:5432/lockness',
    driver: 'postgres', // 'postgres' | 'mysql' | 'sqlite'
}
```

The driver + its client are loaded **on demand** — a Postgres app never loads
the MySQL or SQLite client at runtime. Client packages per dialect:

| Dialect              | Drizzle adapter           | Client package   |
| -------------------- | ------------------------- | ---------------- |
| `postgres` (default) | `drizzle-orm/postgres-js` | `postgres`       |
| `mysql`              | `drizzle-orm/mysql2`      | `mysql2`         |
| `sqlite`             | `drizzle-orm/libsql`      | `@libsql/client` |

Add the client you need to your app's `deno.json` (e.g. `deno add npm:mysql2`).
If a selected driver's client is not installed, `connect()` fails with a message
naming the package.

**Typed handle.** `Database` is generic — `db` is typed for the dialect. The
default is Postgres, so `container.get(Database).db` is a `PostgresJsDatabase`
unchanged. On MySQL/SQLite, annotate the injection for a typed handle:

```ts
const db = container.get(Database) as Database<'mysql'>
```

## How the dialect is resolved

One resolver, fixed precedence: **explicit `driver`** > **URL scheme** >
`postgres`. So the CLI (`db:seed`, `db:check`) — which sees only the URL — still
picks the right dialect: `mysql://…` → mysql, `file:…` / `libsql://…` → sqlite,
`postgres://…` → postgres.

## `deno compile` and SQLite

`@libsql/client` local-file mode uses a native binding — fine for a normal
`deno run`/deploy, but a portability caveat for `deno compile`. For a compiled
binary talking to SQLite/Turso, use the remote path (`@libsql/client/web` with a
`libsql://` URL), which is pure JS.

## Model factories

A factory generates realistic rows. The base is **faker-agnostic** — your
factory supplies the values (using whatever faker you import); the framework
depends on no faker.

```ts
import { Factory } from '@lockness/drizzle'
import { faker } from '@faker-js/faker'
import { type NewUser, users } from '@model/user.ts'

class UserFactory extends Factory<NewUser> {
    protected readonly table = users
    protected definition(): NewUser {
        return { email: faker.internet.email(), name: faker.person.fullName() }
    }
}

new UserFactory().make() // one attribute object (no DB)
new UserFactory().makeMany(5) // five attribute objects (no DB)
await new UserFactory().create({ name: 'Ada' }) // insert one
await new UserFactory().createMany(50) // insert fifty
```

`make`/`makeMany` are pure (no connection needed). `create`/`createMany` insert
through the `Database` service and return the inserted attributes.

## `make:factory`

```bash
deno task cli make:factory User
# ✅ Factory created at ./database/factories/user_factory.ts
```

The generated factory imports `@faker-js/faker` (npm — no maintained JSR faker
exists; the exception is documented in the stub) and names fields explicitly.
Add faker to your app: `deno add npm:@faker-js/faker`.

## Factory-aware seeders

A seeder can bulk-seed from a factory:

```ts
export class UserSeeder {
    async run(): Promise<void> {
        await new UserFactory().createMany(10)
    }
}
```

**Factories and seeding are dev/test tooling.** Running `db:seed` against a
production `DATABASE_URL` inserts generated rows into production — point them at
a development database.

### Production write-guard

To make an accidental production run fail loudly instead of silently mutating
data, both write paths are guarded when `DENO_ENV`/`APP_ENV` is `production`:

- **`db:seed`** refuses to run and exits with an error. Override it explicitly
  with the `--allow-production` flag:
  `deno task cli db:seed --allow-production`.
- **Factory `create()` / `createMany()`** throw. Override programmatically with
  the `{ allowProduction: true }` option:
  `await new UserFactory().createMany(50, {}, { allowProduction: true })`.

Read-only `make()` / `makeMany()` build in-memory objects and are never gated.
The guard is centralised in `assertNotProduction()` (exported from
`@lockness/drizzle`), so future write-oriented dev tooling can reuse it.
