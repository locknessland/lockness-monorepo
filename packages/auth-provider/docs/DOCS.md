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

Abstract base for session-based authentication with remember tokens.

**Provides:**

- Token generation (cryptographically secure random tokens)
- Token hashing (SHA-256)
- Password verification (customizable)

**Must implement:**

- `findById(id)` - Find user by ID
- `findByCredentials(email, password)` - Find and verify user
- `verifyPassword(plain, hash)` - Password comparison
- `createRememberToken(user, expiresIn)` - Create remember-me tokens
- `verifyRememberToken(token)` - Verify remember tokens
- `deleteRememberToken(user, tokenId)` - Delete specific token
- `recycleRememberToken(user, tokenId, expiresIn)` - Rotate token on use

### TokenProviderBase

Abstract base for token-based (API) authentication.

**Provides:**

- Token generation (cryptographically secure)
- Token hashing (SHA-256)

**Must implement:**

- `findById(id)` - Find user by ID
- `findByCredentials(email, password)` - Find and verify user
- `createToken(user, name, expiresIn)` - Create API tokens
- `verifyToken(token)` - Verify API tokens
- `deleteToken(user, tokenId)` - Delete specific token
- `deleteAllTokens(user)` - Delete all user tokens

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
    verifyPassword: async (plain, hash) => {
        return await bcrypt.compare(plain, hash)
    },
    enableRememberTokens: true,
})

const sessionGuard = new SessionGuard(sessionProvider, sessionManager)
```

### Token Auth (API Authentication)

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

### Basic Auth

```typescript
import { DrizzleBasicAuthProvider } from '@lockness/auth-provider/drizzle'
import { BasicAuthGuard } from '@lockness/auth'

const basicAuthProvider = new DrizzleBasicAuthProvider({
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

const basicAuthGuard = new BasicAuthGuard(basicAuthProvider)
```

## Kysely Provider

### Session Auth

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

## Database Schema

### Remember Tokens Table

Required for session auth with remember-me functionality:

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

Required for token-based API authentication:

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
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const accessTokens = pgTable('access_tokens', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, {
        onDelete: 'cascade',
    }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
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
    db,
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

    async createRememberToken(user: User, expiresIn: number) {
        const token = this.generateToken()
        const tokenHash = this.hashToken(token)
        const expiresAt = new Date(Date.now() + expiresIn * 1000)

        const tokenRecord = await this.db.getRepository(RememberToken).save({
            userId: user.id,
            tokenHash,
            expiresAt,
        })

        return { id: tokenRecord.id, token }
    }

    async verifyRememberToken(token: string) {
        const tokenHash = this.hashToken(token)
        const tokenRecord = await this.db.getRepository(RememberToken)
            .findOne({ where: { tokenHash } })

        if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
            return null
        }

        return { userId: tokenRecord.userId, tokenId: tokenRecord.id }
    }

    async deleteRememberToken(user: User, tokenId: string | number) {
        await this.db.getRepository(RememberToken).delete({
            id: tokenId,
            userId: user.id,
        })
    }

    async recycleRememberToken(
        user: User,
        tokenId: string | number,
        expiresIn: number,
    ) {
        const newToken = this.generateToken()
        const tokenHash = this.hashToken(newToken)
        const expiresAt = new Date(Date.now() + expiresIn * 1000)

        await this.db.getRepository(RememberToken).update(
            { id: tokenId, userId: user.id },
            { tokenHash, expiresAt },
        )

        return newToken
    }
}
```

## Token Security

### Token Generation

Providers use `crypto.getRandomValues()` for cryptographically secure tokens:

```typescript
protected generateToken(): string {
    const buffer = new Uint8Array(32)
    crypto.getRandomValues(buffer)
    return Array.from(buffer, b => b.toString(16).padStart(2, '0')).join('')
}
```

### Token Hashing

Tokens are hashed before storage using SHA-256:

```typescript
protected hashToken(token: string): string {
    const encoder = new TextEncoder()
    const data = encoder.encode(token)
    const hashBuffer = crypto.subtle.digestSync('SHA-256', data)
    return Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, '0')).join('')
}
```

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
import { db } from './database.ts'
import * as bcrypt from 'bcrypt'

const app = createApp()

// Session provider for web routes
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
    verifyPassword: async (plain, hash) => await bcrypt.compare(plain, hash),
    enableRememberTokens: true,
})

// Token provider for API routes
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

## Contributing

To add support for a new ORM:

1. Create directory: `packages/auth-provider/{orm_name}`
2. Extend appropriate base class (SessionProviderBase, TokenProviderBase, etc.)
3. Implement ORM-specific database queries
4. Add `mod.ts` with exports
5. Update `deno.json` with new entry point
6. Add tests and documentation
