# @lockness/auth-provider

ORM-agnostic user providers for `@lockness/auth`. Includes implementations for
popular ORMs like Drizzle and Kysely.

## Overview

`@lockness/auth-provider` decouples authentication logic from specific ORMs by
providing:

1. **Base Provider Classes** - Abstract base classes with shared logic for token
   generation, password verification, etc.
2. **ORM Implementations** - Concrete implementations for specific ORMs
   (Drizzle, Kysely, etc.)
3. **Zero Duplication** - All ORM-specific implementations inherit common logic
   from base classes

## Architecture

```
@lockness/auth
    └── Core guards, types, decorators (ORM-agnostic)

@lockness/auth-provider
    ├── /base - Abstract base provider classes (SessionProviderBase, TokenProviderBase, BasicAuthProviderBase)
    ├── /drizzle - Drizzle ORM implementations
    ├── /kysely - Kysely ORM implementations
    └── /prisma - Prisma implementations (future)
```

## Installation

```bash
deno add @lockness/auth @lockness/auth-provider
```

## Usage

### Drizzle (Session Auth with Remember Tokens)

```typescript
import { DrizzleSessionProvider } from '@lockness/auth-provider/drizzle'
import { SessionGuard } from '@lockness/auth'
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
})

const sessionGuard = new SessionGuard(sessionProvider, sessionManager)
```

Only the SHA-256 hash of a remember-me token is stored. A token expires
`expiresIn` **seconds** after it is issued (the guard passes its
`rememberMeTokensAge`), its `firstIssuedAt` survives every recycle, and
`deleteRememberToken` only deletes a token that belongs to the user it is given.

### Drizzle (Token Auth)

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

The provider stores and verifies tokens in `accessTokens`, which must carry the
properties `id`, `userId`, `name`, `hash`, `expiresAt`, `lastUsedAt` and
`createdAt` — a table missing one, or a table name string, is refused at
construction. Only the SHA-256 hash of a token is stored; the plaintext is in
the `value` that `createToken` returns, once. Every token expires (`expiresIn`
is in **milliseconds**, one year by default), and `deleteToken` only deletes a
token that belongs to the user it is given.

### Kysely (Session Auth)

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
    // Columns are fixed: id, user_id, token_hash, expires_at,
    // first_issued_at, created_at. Omit to leave remember-me off.
    rememberTokensTable: 'remember_me_tokens',
})

const sessionGuard = new SessionGuard(sessionProvider, sessionManager)
```

## Base Provider Classes

### SessionProviderBase

Abstract base for session-based authentication. It owns the remember-me
lifecycle (create, verify, delete, delete all, recycle) over a
`RememberTokenStore` you pass as `super({ rememberTokens: store })`.

**Must implement:**

- `findById(id)` - Find user by ID
- `findByCredentials(email, password)` - Find user and verify password
- `verifyPassword(plain, hash)` - Password verification

**For remember-me, a store implements:** `insert(record)`, `findByHash(hash)`,
`delete(userId, tokenId)` (scoped by owner) and `deleteAllForUser(userId)`. Do
not override the remember-me methods themselves: they hold the expiry, ownership
and origin checks.

### TokenProviderBase

Abstract base for token-based (API) authentication.

**Provides:**

- Token generation (cryptographically secure)
- Token hashing (SHA-256)

**Must implement:**

- `findById(id)` - Find user by ID
- `findByCredentials(email, password)` - Find user and verify password
- `createToken(user, name, expiresIn)` - Create API tokens
- `verifyToken(token)` - Verify API tokens
- `deleteToken(user, tokenId)` - Delete tokens
- `deleteAllTokens(user)` - Delete all user tokens

### BasicAuthProviderBase

Abstract base for HTTP Basic Authentication.

**Provides:**

- Password verification (customizable)

**Must implement:**

- `findById(id)` - Find user by ID
- `findByCredentials(email, password)` - Find user and verify password
- `verifyPassword(plain, hash)` - Password verification

## Creating a Custom Provider

### For a Different ORM (e.g., TypeORM)

```typescript
import { SessionProviderBase } from '@lockness/auth-provider/base'
import { DataSource } from 'typeorm'

export class TypeORMSessionProvider<User> extends SessionProviderBase<User> {
    constructor(private db: DataSource) {
        super() // no store: remember-me off
    }

    async findById(id: string | number): Promise<User | null> {
        return await this.db.getRepository(User)
            .findOneBy({ id: id as any })
    }

    async findByCredentials(
        email: string,
        password: string,
    ): Promise<User | null> {
        const user = await this.db.getRepository(User)
            .findOneBy({ email })
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

With remember-me, pass a `RememberTokenStore` to `super()` instead of
implementing the remember-me methods — see
[docs/DOCS.md](docs/DOCS.md#creating-a-custom-provider).

## Password Hashing

By default, providers use a simple direct comparison for password verification.
**This is NOT secure for production**.

Override password verification with your hashing library:

```typescript
import bcrypt from 'bcrypt'

const provider = new DrizzleSessionProvider({
  db: () => database.db,
  findUserById: ...,
  findUserByCredentials: ...,
  verifyPassword: async (plain, hash) => {
    return await bcrypt.compare(plain, hash)
  }
})
```

## Database Schema

### Remember Tokens Table

`DrizzleSessionProvider` reads it through the property names `id`, `userId`,
`hash`, `expiresAt`, `firstIssuedAt` and `createdAt` of the table object passed
as `rememberTokensTable`; `KyselySessionProvider` uses the column names below.

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

## Supported ORMs

| ORM       | Status         | Package                           |
| --------- | -------------- | --------------------------------- |
| Drizzle   | ✅ Ready       | `@lockness/auth-provider/drizzle` |
| Kysely    | ✅ Ready       | `@lockness/auth-provider/kysely`  |
| TypeORM   | 🔄 Coming Soon |                                   |
| Prisma    | 🔄 Coming Soon |                                   |
| Sequelize | 🔄 Coming Soon |                                   |

## Contributing

Want to add support for another ORM? Create a new provider:

1. Create a new directory: `packages/auth-provider/{orm_name}`
2. Extend the appropriate base class (SessionProviderBase, TokenProviderBase,
   etc.)
3. Implement ORM-specific database queries
4. Add `mod.ts` with exports
5. Update `deno.json` with new entry point

## License

MIT
