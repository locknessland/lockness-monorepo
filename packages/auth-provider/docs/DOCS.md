# Lockness Auth Provider

ORM-agnostic user providers for @lockness/auth with implementations for Drizzle,
Kysely, and other ORMs.

## Overview

@lockness/auth-provider decouples authentication logic from specific ORMs using:

- **Base Provider Classes** - Abstract classes with shared logic (token
  generation, password hashing, etc.)
- **ORM Implementations** - Concrete implementations for Drizzle, Kysely, and
  others
- **Zero Duplication** - All ORM implementations inherit common logic from base
  classes
- **Pluggable Architecture** - Easily add support for new ORMs

## Architecture

```
@lockness/auth
    └── Core guards, types, decorators (ORM-agnostic)

@lockness/auth-provider
    ├── /base - Abstract base classes (SessionProviderBase, TokenProviderBase, BasicAuthProviderBase)
    ├── /drizzle - Drizzle ORM implementations
    ├── /kysely - Kysely ORM implementations
    └── /prisma - Prisma implementations (future)
```

## Installation

```bash
deno add @lockness/auth @lockness/auth-provider
```

## Base Provider Classes

### SessionProviderBase

Abstract base for session-based authentication with remember tokens. It owns the
whole remember-me lifecycle, over a storage port it is given, so every binding
gets the same security decisions (#457).

**Provides (do not override):**

- `createRememberToken(user, expiresIn)` — 40 random bytes, stored as their
  SHA-256 hash; the plaintext is returned once. `expiresIn` is in **seconds**
  (the guard passes `rememberMeTokensAge`, the cookie's `maxAge`).
  `firstIssuedAt` is set to the creation instant and stored.
- `verifyRememberToken(token)` — allows only a token whose hash matches, that is
  unexpired, that has a valid `firstIssuedAt`, and whose user still exists. A
  `null` or invalid expiry or origin denies. A storage error **rejects** rather
  than resolving to `null`. The returned token's `value` is `''`.
- `deleteRememberToken(user, tokenId)` — scoped by owner: another user's id is a
  no-op.
- `deleteAllRememberTokens(user)` — revokes every token of that user.
- `recycleRememberToken(user, token, expiresIn)` — validates its input before
  any write, deletes the old token, then inserts a new one carrying the old
  `firstIssuedAt`. If the insert fails, the user is logged out.

Without a store, remember-me is off: create and recycle throw, verify returns
`null`, and both deletes do nothing.

**Must implement:**

- `findById(id)` - Find user by ID
- `findByCredentials(email, password)` - Find and verify user
- `verifyPassword(plain, hash)` - Password comparison

**For remember-me, pass a `RememberTokenStore`** as
`super({ rememberTokens: store })`:

- `insert(record)` - Store a row, return it with its (non-null) id
- `findByHash(hash)` - The row with exactly that hash, or `null`; no expiry
  filter, the base decides expiry
- `delete(userId, tokenId)` - Delete one row, only if `userId` owns it
- `deleteAllForUser(userId)` - Delete every row of one user

Store steps must let errors propagate.

### TokenProviderBase

Abstract base for token-based (API) authentication. It owns the whole token
lifecycle — a Template Method over five storage steps — so every binding gets
the same security decisions.

**Provides (do not override):**

- `createToken(user, name, expiresIn)` — 40 random bytes (`tokenLength`, minimum
  16), stored as their SHA-256 hash; the plaintext is returned once. `expiresIn`
  is in **milliseconds** (default one year); an expiry is always written.
- `verifyToken(token)` — allows only a token whose hash matches, that is
  unexpired (`null` or invalid expiry denies), and whose user still exists. A
  storage error **rejects** rather than resolving to `null`, so the guard
  denies. The returned token's `value` is `''`.
- `deleteToken(user, tokenId)` — scoped by owner: another user's id is a no-op.
- `deleteAllTokens(user)` — revokes every token of that user.
- `lastUsedAt` is written at most once a minute; a failed write is logged and
  does not deny.

**Must implement:**

- `findById(id)` - Find user by ID
- `findByCredentials(email, password)` - Find and verify user
- `insertTokenRecord(record)` - Store a row, return it with its id
- `findTokenRecordByHash(hash)` - The row with exactly that hash, or `null`
- `deleteTokenRecord(userId, tokenId)` - Delete one row, only if `userId` owns
  it
- `deleteTokenRecordsForUser(userId)` - Delete every row of one user
- `touchTokenRecord(tokenId, at)` - Set `lastUsedAt`

Storage steps must let errors propagate: swallowing one into `null` turns an
outage into a storm of 401s.

### BasicAuthProviderBase

Abstract base for HTTP Basic Authentication.

**Provides:**

- Password verification (customizable)

**Must implement:**

- `findById(id)` - Find user by ID
- `findByCredentials(email, password)` - Find and verify user
- `verifyPassword(plain, hash)` - Password comparison

## Drizzle Provider

### Session Auth with Remember Tokens

```typescript
import { DrizzleSessionProvider } from '@lockness/auth-provider/drizzle'
import { SessionGuard } from '@lockness/auth'
import * as bcrypt from 'bcrypt'
import { rememberMeTokens } from './schema.ts'

const sessionProvider = new DrizzleSessionProvider({
    db: () => database.db,
    // The Drizzle table OBJECT (see "Remember Tokens Table"), not its name.
    // Passing it turns remember-me on; omit it to leave remember-me off.
    rememberTokensTable: rememberMeTokens,
    findUserById: async (db, id) => {
        return await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.id, id),
        })
    },
    findUserByCredentials: async (db, email, password) => {
        const user = await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.email, email),
        })
        if (user && await bcrypt.compare(password, user.password)) {
            return user
        }
        return null
    },
    verifyPassword: async (plain, hash) => {
        return await bcrypt.compare(plain, hash)
    },
})

const sessionGuard = new SessionGuard(sessionProvider, sessionManager)
```

### Token Auth (API Authentication)

```typescript
import { DrizzleTokenProvider } from '@lockness/auth-provider/drizzle'
import { TokenGuard } from '@lockness/auth'
import { accessTokens } from './schema.ts'

const tokenProvider = new DrizzleTokenProvider({
    db: () => database.db,
    // The Drizzle table OBJECT (see "Access Tokens Table"), not its name.
    tokensTable: accessTokens,
    findUserById: async (db, id) => {
        return await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.id, id),
        })
    },
    findUserByCredentials: async (db, email, password) => {
        const user = await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.email, email),
        })
        if (user && await bcrypt.compare(password, user.password)) {
            return user
        }
        return null
    },
})

const tokenGuard = new TokenGuard(tokenProvider)
```

### Basic Auth

```typescript
import { DrizzleBasicAuthProvider } from '@lockness/auth-provider/drizzle'
import { BasicAuthGuard } from '@lockness/auth'

const basicAuthProvider = new DrizzleBasicAuthProvider({
    db: () => database.db,
    findUserById: async (db, id) => {
        return await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.id, id),
        })
    },
    findUserByCredentials: async (db, email, password) => {
        const user = await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.email, email),
        })
        if (user && await bcrypt.compare(password, user.password)) {
            return user
        }
        return null
    },
})

const basicAuthGuard = new BasicAuthGuard(basicAuthProvider)
```

## Kysely Provider

### Session Auth

```typescript
import { KyselySessionProvider } from '@lockness/auth-provider/kysely'
import { SessionGuard } from '@lockness/auth'

const sessionProvider = new KyselySessionProvider({
    db: () => db,
    findUserById: async (db, id) => {
        return await db.selectFrom('users')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst()
    },
    findUserByCredentials: async (db, email, password) => {
        const user = await db.selectFrom('users')
            .selectAll()
            .where('email', '=', email)
            .executeTakeFirst()
        if (user && await bcrypt.compare(password, user.password)) {
            return user
        }
        return null
    },
    // The table's columns are fixed (see "Remember Tokens Table").
    // Omit the option to leave remember-me off.
    rememberTokensTable: 'remember_me_tokens',
})

const sessionGuard = new SessionGuard(sessionProvider, sessionManager)
```

## Database Schema

### Remember Tokens Table

Required for session auth with remember-me functionality.
`DrizzleSessionProvider` reads and writes it through the Drizzle table object
passed as `rememberTokensTable`; the contract is on that object's **property
names** (`id`, `userId`, `hash`, `expiresAt`, `firstIssuedAt`, `createdAt`), all
NOT NULL, so the SQL column names are yours. `KyselySessionProvider` has no
table object, so it uses exactly the column names below:

```sql
CREATE TABLE remember_me_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  first_issued_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL
);

-- The UNIQUE constraint already indexes token_hash.
CREATE INDEX idx_remember_tokens_user_id ON remember_me_tokens(user_id);
```

### Access Tokens Table

Required for token-based API authentication. `DrizzleTokenProvider` reads and
writes it through the Drizzle table object passed as `tokensTable`; the contract
is on that object's **property names** (`id`, `userId`, `name`, `hash`,
`expiresAt`, `lastUsedAt`, `createdAt`), so the SQL column names are yours:

```sql
CREATE TABLE access_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_access_tokens_user_id ON access_tokens(user_id);
CREATE INDEX idx_access_tokens_expires_at ON access_tokens(expires_at);
```

### Drizzle Schema Example

```typescript
import {
    integer,
    pgTable,
    serial,
    timestamp,
    varchar,
} from 'drizzle-orm/pg-core'

export const rememberMeTokens = pgTable('remember_me_tokens', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, {
        onDelete: 'cascade',
    }),
    // The provider needs the property `hash`; the column may be named freely.
    hash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    firstIssuedAt: timestamp('first_issued_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
})

export const accessTokens = pgTable('access_tokens', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, {
        onDelete: 'cascade',
    }),
    // The provider needs the property `hash`; the column may be named freely.
    hash: varchar('token_hash', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

## Password Hashing

**IMPORTANT:** Default password verification uses simple comparison which is NOT
secure.

Always override with a proper hashing library:

```typescript
import * as bcrypt from 'bcrypt'

const provider = new DrizzleSessionProvider({
    db: () => database.db,
    findUserById: /* ... */,
    findUserByCredentials: /* ... */,
    verifyPassword: async (plain, hash) => {
        return await bcrypt.compare(plain, hash)
    }
})
```

## Creating a Custom Provider

### For a Different ORM (e.g., TypeORM)

```typescript
import { SessionProviderBase } from '@lockness/auth-provider/base'
import { DataSource } from 'typeorm'
import * as bcrypt from 'bcrypt'

export class TypeORMSessionProvider<User> extends SessionProviderBase<User> {
    constructor(private db: DataSource) {
        super()
    }

    async findById(id: string | number): Promise<User | null> {
        return await this.db.getRepository(User).findOneBy({ id: id as any })
    }

    async findByCredentials(
        email: string,
        password: string,
    ): Promise<User | null> {
        const user = await this.db.getRepository(User).findOneBy({ email })
        if (user && await this.verifyPassword(password, user.password)) {
            return user
        }
        return null
    }

    async verifyPassword(plain: string, hash: string): Promise<boolean> {
        return await bcrypt.compare(plain, hash)
    }
}
```

For remember-me, implement the four-step `RememberTokenStore` port and pass it
to `super()`. The base does the rest — minting, hashing, expiry, ownership and
the origin — so the store only moves rows:

```typescript
import type { RememberTokenStore } from '@lockness/auth-provider/base'

function typeormRememberStore(db: DataSource): RememberTokenStore {
    const repo = () => db.getRepository(RememberToken)
    return {
        insert: async (record) => await repo().save(record),
        findByHash: async (hash) => await repo().findOneBy({ hash }) ?? null,
        delete: async (userId, id) => {
            await repo().delete({ id, userId })
        },
        deleteAllForUser: async (userId) => {
            await repo().delete({ userId })
        },
    }
}

export class TypeORMSessionProvider<User> extends SessionProviderBase<User> {
    constructor(private db: DataSource) {
        super({ rememberTokens: typeormRememberStore(db) })
    }
    // findById, findByCredentials and verifyPassword as above
}
```

`delete` must be scoped by owner, and no step may swallow an error. The
remember-me methods (`createRememberToken`, `verifyRememberToken`,
`deleteRememberToken`, `deleteAllRememberTokens`, `recycleRememberToken`) are
not overridden: overriding them still compiles, but bypasses the policy.

## Token Security

Tokens come from `crypto.getRandomValues()` (40 bytes, 80 hex characters) and
only their SHA-256 hash is stored. Generation and hashing are internal to the
base classes: no subclass can reach them, so no binding can store a weaker
credential.

## Complete Usage Example

```typescript
import { createApp } from '@lockness/core'
import {
    initializeAuthMiddleware,
    SessionGuard,
    TokenGuard,
} from '@lockness/auth'
import {
    DrizzleSessionProvider,
    DrizzleTokenProvider,
} from '@lockness/auth-provider/drizzle'
import { sessionMiddleware } from '@lockness/session'
import { database } from './database.ts'
import { accessTokens, rememberMeTokens } from './schema.ts'
import * as bcrypt from 'bcrypt'

const app = createApp()

// Session provider for web routes
const sessionProvider = new DrizzleSessionProvider({
    db: () => database.db,
    findUserById: async (db, id) => {
        return await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.id, id),
        })
    },
    findUserByCredentials: async (db, email, password) => {
        const user = await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.email, email),
        })
        if (user && await bcrypt.compare(password, user.password)) {
            return user
        }
        return null
    },
    verifyPassword: async (plain, hash) => await bcrypt.compare(plain, hash),
    rememberTokensTable: rememberMeTokens,
})

// Token provider for API routes
const tokenProvider = new DrizzleTokenProvider({
    db: () => database.db,
    // The Drizzle table OBJECT (see "Access Tokens Table"), not its name.
    tokensTable: accessTokens,
    findUserById: async (db, id) => {
        return await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.id, id),
        })
    },
    findUserByCredentials: async (db, email, password) => {
        const user = await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.email, email),
        })
        if (user && await bcrypt.compare(password, user.password)) {
            return user
        }
        return null
    },
})

// Initialize session middleware
app.use(
    '*',
    sessionMiddleware({
        driver: 'cookie',
        cookieName: 'session_id',
        lifetime: 7200,
    }),
)

// Initialize auth with multiple guards
app.use(
    '*',
    initializeAuthMiddleware({
        default: 'web',
        guards: {
            web: (ctx) => new SessionGuard('web', ctx, sessionProvider),
            api: (ctx) => new TokenGuard('api', ctx, tokenProvider),
        },
    }),
)
```

## Best Practices

- **Use bcrypt or argon2** for password hashing, never plain text comparison
- **Enable remember tokens** for better UX on session auth
- **Set appropriate token expiration** based on your security requirements
- **Use different guards** for web (session) and API (token) routes
- **Implement token rotation** by recycling remember tokens on use
- **Add database indexes** on token hashes and expiration dates for performance
- **Clean up expired tokens** periodically with a cron job
- **Use CASCADE deletion** to remove tokens when users are deleted

## Supported ORMs

| ORM     | Status         | Package                           |
| ------- | -------------- | --------------------------------- |
| Drizzle | ✅ Ready       | `@lockness/auth-provider/drizzle` |
| Kysely  | ✅ Ready       | `@lockness/auth-provider/kysely`  |
| TypeORM | 🔄 Coming Soon |                                   |
| Prisma  | 🔄 Coming Soon |                                   |

## Upgrading to v0.5.0

Three items, all breaking. **Migration steps:** pass your Drizzle
`access_tokens` table object as `tokensTable`, and reshape the table to the
seven-property contract before you regenerate migrations; then wrap every
provider's `db` option in a function; then replace `enableRememberTokens` with
`rememberTokensTable`, adding the `first_issued_at` column.

### 1. `DrizzleTokenProvider` takes `tokensTable` as a Drizzle table, and `access_tokens` is reshaped

Before, `tokensTable` was a table name, which the provider accepted and never
read (#452). Now the provider builds every token query from the table object you
pass, and [`TokenProviderBase`](#tokenproviderbase) owns the token lifecycle.
What that changes:

- **A table name is a compile error.** `tokensTable: 'access_tokens'` fails with
  TS2322: `Type 'string' is not assignable to type 'DrizzleAccessTokensTable'`.
  From JavaScript, construction throws a `TypeError`. Import the table from your
  schema instead:

  ```diff
  -import { users } from '@model/user.ts'
  +import { accessTokens, users } from '@model/user.ts'
   ...
  -        tokensTable: 'access_tokens',
  +        tokensTable: accessTokens,
  ```

- **The table needs seven properties:** `id`, `userId`, `name`, `hash`,
  `expiresAt`, `lastUsedAt` and `createdAt` (see
  [Access Tokens Table](#access-tokens-table)). A table without one is also
  TS2322, naming the missing properties, and a `TypeError` at construction.
- **`access_tokens` is reshaped**, in this order:
  1. `token` becomes `hash`, still unique;
  2. `expires_at` and `created_at` become NOT NULL;
  3. `last_used_at`, a nullable timestamp, is added.
- **Replace the schema definition before regenerating migrations.** drizzle-kit
  generates from your schema: regenerate first and the migration keeps the old
  `token` column.
- **No stored token is lost.** Tokens issued before the upgrade never
  authenticated, so deleting the rows the new shape cannot hold (no expiry)
  removes nothing usable.

For an app scaffolded from the v0.4.0 `api` kit, the whole procedure (the exact
schema, the provider change, regenerated migrations, and the SQL for a database
that already holds data) is step 3 onwards of
[`@lockness/init`'s v0.5.0 item](../../init/docs/DOCS.md#upgrading-to-v050).

### 2. Every provider takes `db` as a function, called per lookup

Before, `db` was the database instance itself, read once when the provider was
built. Since `@lockness/drizzle` v0.5.0, reading `Database.db` throws while no
database is connected, and a guard builds its provider on every request, so a
page that needs no user failed before any lookup ran (#427). Now
`DrizzleSessionProvider`, `DrizzleTokenProvider`, `DrizzleBasicAuthProvider` and
`KyselySessionProvider` take a function returning the instance, and call it on
every lookup, never at construction. A provider built without a connection
touches nothing until a lookup runs, and follows a reconnect instead of holding
a closed client.

```diff
 new DrizzleSessionProvider({
-    db: database.db,
+    db: () => database.db,
     findUserById: async (db, id) => { /* unchanged */ },
```

- **The instance form is a compile error:** TS2322,
  `Type 'PostgresJsDatabase<...>' is not assignable to type '() => ...'`. From
  JavaScript, construction throws a `TypeError`:
  `` `db` must be a function returning the database instance, e.g. db: () => database.db ``.
- **The callbacks are unchanged.** `findUserById` and `findUserByCredentials`
  still receive the resolved instance as their first argument.
- **A lookup without a connection rejects** with the error `Database.db` throws;
  it never resolves `null`, so an outage is not mistaken for a wrong password.

For an app scaffolded from a v0.4.x `web` or `api` kit, the exact changes to
`createUserProvider` and its call sites are item 3 of
[`@lockness/init`'s v0.5.0 notes](../../init/docs/DOCS.md#upgrading-to-v050).

### 3. Remember-me tokens now work, and their configuration changed

Before, `DrizzleSessionProvider` never stored a remember-me token, and
`KyselySessionProvider` stored one with a thousandth of its lifetime and no
origin (#457). Now [`SessionProviderBase`](#sessionproviderbase) owns the
remember-me lifecycle, and both providers store tokens through it.

- **`enableRememberTokens` is removed.** Passing it throws a `TypeError`.
  Remember-me is on when you pass `rememberTokensTable`, and off when you omit
  it.
- **`DrizzleSessionProvider`: `rememberTokensTable` is now your Drizzle table
  object, not a table name.** It needs the column properties `id`, `userId`,
  `hash` (unique), `expiresAt`, `firstIssuedAt` and `createdAt`, all NOT NULL.
  The SQL column names are yours to choose (see
  [Remember Tokens Table](#remember-tokens-table)). Before this release the
  Drizzle provider never stored a remember-me token, so there is no data to
  migrate.
- **`KyselySessionProvider`:** pass `rememberTokensTable: 'remember_me_tokens'`
  (or your table name) explicitly, and add a column. On PostgreSQL:

  ```sql
  -- PostgreSQL
  ALTER TABLE remember_me_tokens ADD COLUMN first_issued_at TIMESTAMP;
  UPDATE remember_me_tokens SET first_issued_at = created_at;
  ALTER TABLE remember_me_tokens ALTER COLUMN first_issued_at SET NOT NULL;
  ```

  MySQL sets the constraint with
  `ALTER TABLE remember_me_tokens MODIFY first_issued_at TIMESTAMP NOT NULL`
  instead of the last statement. SQLite cannot add NOT NULL to an existing
  column: rebuild the table (create the new shape, copy the rows with
  `first_issued_at = created_at`, drop the old one, rename).

  Rows written by v0.4.x expired after one thousandth of the configured
  remember-me age (about 43 minutes at the 30-day default). Deleting them all
  instead is equally safe.
- **`SessionProviderBase`: the remember-me lifecycle is now built in.** A custom
  ORM binding implements `RememberTokenStore` (`insert`, `findByHash`,
  `delete(userId, tokenId)`, `deleteAllForUser(userId)`) and passes it as
  `super({ rememberTokens: store })`. It no longer implements the five
  remember-me methods. Overriding them still compiles, but it bypasses the
  expiry, ownership and origin checks, and it is unsupported. The protected
  helpers `generateTokenValue()` and `hashTokenValue()` are removed.
- **`assertAccessTokensTable` and `AccessTokenColumn` are no longer exported.**
  The provider runs the check itself at construction. `DrizzleAccessTokensTable`
  and the new `DrizzleRememberTokensTable` stay public.
- **Remember-me rows now expire after the configured `rememberMeTokensAge`, in
  seconds,** as documented, instead of a thousandth of it.

## Contributing

To add support for a new ORM:

1. Create directory: `packages/auth-provider/{orm_name}`
2. Extend appropriate base class (SessionProviderBase, TokenProviderBase, etc.)
3. Implement ORM-specific database queries
4. Add `mod.ts` with exports
5. Update `deno.json` with new entry point
6. Add tests and documentation
