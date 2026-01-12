# @lockness/auth

Robust authentication system with multiple guards and user providers. Inspired
by AdonisJS authentication architecture.

## Features

- 🛡️ **Multiple Guards** - Session, Token (API), and Basic Auth support
- 👤 **Pluggable Providers** - Bring your own database/ORM
- 🔐 **Remember Me** - Secure persistent authentication with token recycling
- 🎫 **API Tokens** - Bearer token authentication for APIs and mobile apps
- 🔒 **Security First** - Protection against timing attacks, session fixation,
  and token theft
- 📡 **Events** - Emit events for login, logout, authentication failures
- 🧪 **Testing Utilities** - `authenticateAsClient()` for easy testing

## Architecture

### Guards

A **guard** is an authentication method:

- **SessionGuard** - Cookie/session-based auth (web apps)
- **TokenGuard** - Bearer token auth (APIs, mobile apps)
- **BasicAuthGuard** - HTTP Basic Auth (development/temporary)

### Providers

A **provider** retrieves users from your data source. Create custom providers
for any database/ORM:

```typescript
interface SessionUserProviderContract<User> {
    findById(id: string | number): Promise<User | null>
    findByCredentials(email: string, password: string): Promise<User | null>
    verifyPassword(plain: string, hash: string): Promise<boolean>
}
```

## Quick Start

### 1. Create a User Provider

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

class MyUserProvider implements SessionUserProviderContract<User> {
    declare [PROVIDER_REAL_USER]: User

    async findById(id: string | number): Promise<User | null> {
        // Query your database
        return await db.query.users.findFirst({
            where: eq(users.id, id),
        })
    }

    async findByCredentials(
        email: string,
        password: string,
    ): Promise<User | null> {
        const user = await db.query.users.findFirst({
            where: eq(users.email, email),
        })

        if (user && await bcrypt.compare(password, user.password)) {
            return user
        }
        return null
    }

    async verifyPassword(plain: string, hash: string): Promise<boolean> {
        return await bcrypt.compare(plain, hash)
    }
}
```

### 2. Configure Authentication

```typescript
import { Hono } from 'hono'
import {
    authMiddleware,
    getAuth,
    initializeAuthMiddleware,
    SessionGuard,
} from '@lockness/auth'
import { sessionMiddleware } from '@lockness/session'

const app = new Hono()
const userProvider = new MyUserProvider()

// 1. Initialize session (required for SessionGuard)
app.use(
    '*',
    sessionMiddleware({
        driver: 'cookie',
        secret: Deno.env.get('APP_KEY')!,
        lifetime: 7200,
    }),
)

// 2. Initialize auth
app.use(
    '*',
    initializeAuthMiddleware({
        default: 'web',
        guards: {
            web: (ctx) => new SessionGuard('web', ctx, userProvider),
        },
    }),
)

// 3. Protect routes
app.get('/profile', authMiddleware(), (c) => {
    const auth = getAuth(c)
    return c.json({ user: auth.user })
})
```

### 3. Login/Logout

```typescript
app.post('/login', async (c) => {
    const { email, password, remember } = await c.req.json()

    const auth = getAuth(c)
    const guard = auth.use('web')

    try {
        await guard.login(email, password, remember)
        return c.json({ message: 'Logged in successfully' })
    } catch (error) {
        return c.json({ error: 'Invalid credentials' }, 401)
    }
})

app.post('/logout', authMiddleware(), async (c) => {
    const auth = getAuth(c)
    const guard = auth.use('web')

    await guard.logout()
    return c.json({ message: 'Logged out' })
})
```

## Guards

### Session Guard

Cookie/session-based authentication for web applications.

```typescript
const guard = new SessionGuard(
    'web',
    ctx,
    userProvider,
    {
        useRememberMeTokens: true,
        rememberMeTokensAge: 2592000, // 30 days
        sessionKeyName: 'auth_user_id',
    },
)

// Login
await guard.login('user@example.com', 'password', true) // remember = true

// Login by ID (after registration)
await guard.loginById(userId, false)

// Authenticate request
const user = await guard.authenticate()

// Check without throwing
if (await guard.check()) {
    console.log('User is authenticated')
}

// Logout
await guard.logout()
```

**Remember Me Security:**

- Tokens are hashed in database (SHA-256)
- Tokens are recycled on each use (protection against theft)
- Expired tokens are automatically rejected

### Token Guard

Bearer token authentication for APIs and mobile apps.

```typescript
const guard = new TokenGuard(
    'api',
    ctx,
    tokenUserProvider,
    {
        prefix: 'Bearer',
        tokenType: 'Bearer',
    },
)

// Generate token (after login)
const token = await guard.generate(
    'user@example.com',
    'password',
    'mobile-app',
)
console.log('Token:', token.value) // Send to client

// Authenticate API request
const user = await guard.authenticate() // Reads Authorization: Bearer <token>

// Revoke current token
await guard.revoke()

// Revoke all tokens (logout all devices)
await guard.revokeAll()
```

### Basic Auth Guard

HTTP Basic Authentication (development/temporary use).

```typescript
const guard = new BasicAuthGuard(
    'basic',
    ctx,
    basicAuthProvider,
    { realm: 'Protected Area' },
)

const user = await guard.authenticate()
// Sends WWW-Authenticate challenge if credentials missing/invalid
```

## User Providers

### In-Memory Provider (Testing/Development)

```typescript
class InMemoryProvider implements SessionUserProviderContract<User> {
    declare [PROVIDER_REAL_USER]: User

    private users = new Map<number, User>()

    async findById(id: number): Promise<User | null> {
        return this.users.get(id) || null
    }

    async findByCredentials(
        email: string,
        password: string,
    ): Promise<User | null> {
        for (const user of this.users.values()) {
            if (user.email === email && user.password === password) {
                return user
            }
        }
        return null
    }

    async verifyPassword(plain: string, hash: string): Promise<boolean> {
        return plain === hash // Use bcrypt in production!
    }
}
```

### Drizzle Provider (Production)

We provide optional Drizzle helpers:

```typescript
import { DrizzleSessionProvider } from '@lockness/auth'

const provider = new DrizzleSessionProvider({
    db,
    findUserById: async (db, id) => {
        return await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.id, id),
        })
    },
    findUserByCredentials: async (db, email, password) => {
        const user = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.email, email),
        })
        if (user && await bcrypt.compare(password, user.password)) {
            return user
        }
        return null
    },
    enableRememberTokens: true,
    rememberTokensTable: 'remember_me_tokens',
})
```

**Database Schema for Remember Me:**

```sql
CREATE TABLE remember_me_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_remember_tokens_hash ON remember_me_tokens(token_hash);
CREATE INDEX idx_remember_tokens_user ON remember_me_tokens(user_id);
```

**Database Schema for Access Tokens:**

```sql
CREATE TABLE access_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP
);

CREATE INDEX idx_access_tokens_hash ON access_tokens(token_hash);
CREATE INDEX idx_access_tokens_user ON access_tokens(user_id);
```

## Multi-Guard Authentication

Authenticate using multiple methods:

```typescript
// Initialize with multiple guards
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

// Try web OR api authentication
app.get('/data', authMiddleware({ guards: ['web', 'api'] }), (c) => {
    const auth = getAuth(c)
    console.log('Authenticated via:', auth.authenticatedViaGuard) // 'web' or 'api'
    return c.json({ data: [] })
})

// Manual multi-guard authentication
const auth = getAuth(c)
try {
    await auth.authenticateUsingAny(['web', 'api'])
} catch {
    return c.json({ error: 'Not authenticated' }, 401)
}
```

## Middleware

### `initializeAuthMiddleware(config)`

Initialize authenticator (required globally):

```typescript
app.use(
    '*',
    initializeAuthMiddleware({
        default: 'web',
        guards: { web: sessionGuardFactory },
    }),
)
```

### `authMiddleware(options?)`

Protect routes (throws on failure):

```typescript
// Use default guard
app.get('/profile', authMiddleware(), handler)

// Use specific guard
app.get('/api/users', authMiddleware({ guards: 'api' }), handler)

// Try multiple guards
app.get('/data', authMiddleware({ guards: ['web', 'api'] }), handler)
```

### `guestMiddleware(options?)`

Only allow unauthenticated (redirects if authenticated):

```typescript
app.get('/login', guestMiddleware({ redirectTo: '/dashboard' }), handler)
```

## Events

Listen to authentication events:

```typescript
import { EventEmitter } from '@lockness/events'

const emitter = new EventEmitter()

emitter.on('session:login', ({ user }) => {
    console.log('User logged in:', user.email)
})

emitter.on('session:logout', ({ user }) => {
    console.log('User logged out:', user.email)
})

emitter.on('session:authentication_failed', ({ error }) => {
    console.log('Auth failed:', error.message)
})

emitter.on('token:created', ({ user, token }) => {
    console.log('Token created for:', user.email)
})

// Pass emitter to guard
const guard = new SessionGuard('web', ctx, provider, options, emitter)
```

## Testing

Use `authenticateAsClient()` for testing:

```typescript
Deno.test('protected route requires authentication', async () => {
    const app = setupApp()

    const user = { id: 1, email: 'test@example.com' }
    const guard = auth.use('web')

    // Get client authentication data
    const { session, cookies } = await guard.authenticateAsClient(user)

    // Make authenticated request
    const res = await app.request('/profile', {
        headers: {
            Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join(
                '; ',
            ),
        },
    })

    assertEquals(res.status, 200)
})
```

## Security Best Practices

1. **Always use HTTPS in production** - Session/token theft via MitM
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

## Migration from `@lockness/core`

Old auth system was monolithic. New system is modular:

```typescript
// Old
import { Auth } from '@lockness/core'
const auth = new Auth(ctx)

// New
import { getAuth } from '@lockness/auth'
const auth = getAuth(ctx)
const guard = auth.use('web')
```

## API Reference

See [types.ts](types.ts) for complete TypeScript definitions.

## License

MIT
