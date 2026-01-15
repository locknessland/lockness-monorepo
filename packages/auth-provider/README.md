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

const sessionProvider = new DrizzleSessionProvider({
    db,
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
    enableRememberTokens: true,
})

const sessionGuard = new SessionGuard(sessionProvider, sessionManager)
```

### Drizzle (Token Auth)

```typescript
import { DrizzleTokenProvider } from '@lockness/auth-provider/drizzle'
import { TokenGuard } from '@lockness/auth'

const tokenProvider = new DrizzleTokenProvider({
    db,
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

### Kysely (Session Auth)

```typescript
import { KyselySessionProvider } from '@lockness/auth-provider/kysely'
import { SessionGuard } from '@lockness/auth'

const sessionProvider = new KyselySessionProvider({
    db,
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
    enableRememberTokens: true,
})

const sessionGuard = new SessionGuard(sessionProvider, sessionManager)
```

## Base Provider Classes

### SessionProviderBase

Abstract base for session-based authentication.

**Provides:**

- Token generation (cryptographically secure)
- Token hashing (SHA-256)
- Password verification (customizable)

**Must implement:**

- `findById(id)` - Find user by ID
- `findByCredentials(email, password)` - Find user and verify password
- `verifyPassword(plain, hash)` - Password verification
- `createRememberToken(user, expiresIn)` - Create remember tokens
- `verifyRememberToken(token)` - Verify remember tokens
- `deleteRememberToken(user, tokenId)` - Delete tokens
- `recycleRememberToken(user, tokenId, expiresIn)` - Rotate tokens

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
        super()
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

    async createRememberToken(user: User, expiresIn: number) {
        // Implement using TypeORM
    }

    async verifyRememberToken(token: string) {
        // Implement using TypeORM
    }

    async deleteRememberToken(user: User, tokenId: string | number) {
        // Implement using TypeORM
    }

    async recycleRememberToken(
        user: User,
        tokenId: string | number,
        expiresIn: number,
    ) {
        // Implement using TypeORM
    }
}
```

## Password Hashing

By default, providers use a simple direct comparison for password verification.
**This is NOT secure for production**.

Override password verification with your hashing library:

```typescript
import bcrypt from 'bcrypt'

const provider = new DrizzleSessionProvider({
  db,
  findUserById: ...,
  findUserByCredentials: ...,
  verifyPassword: async (plain, hash) => {
    return await bcrypt.compare(plain, hash)
  }
})
```

## Database Schema

### Remember Tokens Table

```sql
CREATE TABLE remember_me_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_remember_tokens_user_id ON remember_me_tokens(user_id);
CREATE INDEX idx_remember_tokens_expires_at ON remember_me_tokens(expires_at);
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
