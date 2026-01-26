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

## Decorators (Recommended Approach)

Use dedicated decorators for clean, type-safe route protection:

```typescript
import { Context, Controller, Get, Post } from '@lockness/contract'
import { AuthGuard, AuthOptional, AuthRequired } from '@lockness/auth'

@Controller('/auth')
export class AuthController {
    @Get('/login')
    @AuthOptional()
    showLogin(c: Context) {
        const user = c.get('auth')?.user
        return c.html(<LoginPage user={user} />)
    }

    @Post('/login')
    @AuthOptional()
    async login(c: Context) {
        const { email, password, remember } = await c.req.json()
        const auth = c.get('auth')

        try {
            await auth.login(email, password, remember)
            return c.json({ message: 'Logged in successfully' })
        } catch (error) {
            return c.json({ error: 'Invalid credentials' }, 401)
        }
    }

    @Get('/profile')
    @AuthRequired({ redirectTo: '/auth/login' })
    profile(c: Context) {
        const user = c.get('auth').user // Guaranteed to exist
        return c.json({ user })
    }

    @Post('/logout')
    @AuthRequired()
    async logout(c: Context) {
        await c.get('auth').logout()
        return c.json({ message: 'Logged out' })
    }

    @Post('/api/data')
    @AuthGuard('api')
    apiData(c: Context) {
        const user = c.get('auth').user
        return c.json({ data: [] })
    }
}
```

**Decorator Summary:**

- `@AuthOptional()` - Makes auth available but not required
- `@AuthRequired()` - Requires authentication (redirects to login on failure if
  `redirectTo` specified)
- `@AuthRequired({ redirectTo: '/path' })` - Requires auth and redirects to
  specified path on failure
- `@AuthGuard(guardName)` - Requires specific guard
- `@AuthGuard('api')` - Use API token authentication instead of session

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

## Password Hashing Utilities

The package provides built-in password hashing utilities using PBKDF2 via Web
Crypto API:

```typescript
import {
    hashPassword,
    type PasswordHashConfig,
    verifyPassword,
} from '@lockness/auth'

// Hash a password (uses secure defaults)
const hash = await hashPassword('user-password')
// => "base64-encoded-salt+hash"

// Verify a password
const isValid = await verifyPassword('user-password', hash)
// => true

// Custom configuration for specific security requirements
const config: PasswordHashConfig = {
    saltLength: 16, // Salt length in bytes (default: 16)
    keyLength: 32, // Derived key length in bytes (default: 32)
    iterations: 100000, // PBKDF2 iterations (default: 100000)
    hashAlgorithm: 'SHA-256', // Hash algorithm (default: 'SHA-256')
}

// Use custom config
const customHash = await hashPassword('password', config)
const isValidCustom = await verifyPassword('password', customHash, config)
```

### Configuration Options

- **`saltLength`** (default: `16`): Random salt length in bytes. Larger values
  provide more uniqueness but increase storage size.
- **`keyLength`** (default: `32`): Length of the derived key in bytes. Standard
  is 32 bytes (256 bits).
- **`iterations`** (default: `100000`): Number of PBKDF2 iterations. This is the
  **computational cost** that defends against brute force attacks:
  - More iterations = slower hashing = harder to crack
  - OWASP 2023 recommends 100,000+ iterations for PBKDF2-SHA256
  - For testing, you can use fewer iterations (e.g., 10,000) for faster tests
  - For high-security applications, use more iterations (e.g., 250,000+)
- **`hashAlgorithm`** (default: `'SHA-256'`): Hash algorithm to use. Options:
  `'SHA-1'`, `'SHA-256'`, `'SHA-384'`, `'SHA-512'`

### Usage Examples

```typescript
// Testing (faster hashing)
const testConfig = { iterations: 10000 }
const testHash = await hashPassword('test-password', testConfig)

// High security (slower, more resistant to brute force)
const secureConfig = {
    iterations: 250000,
    saltLength: 32,
    keyLength: 64,
    hashAlgorithm: 'SHA-512',
}
const secureHash = await hashPassword('sensitive-data', secureConfig)

// Compliance (specific algorithm requirement)
const complianceConfig = { hashAlgorithm: 'SHA-384' }
const complianceHash = await hashPassword('password', complianceConfig)
```

**Important**: If you hash a password with a custom configuration, you must use
the **same configuration** when verifying it.

## Security Best Practices

1. **Always use HTTPS in production** - Session/token theft via MitM
2. **Rotate secrets regularly** - APP_KEY, token secrets
3. **Hash passwords** - Built-in utilities use PBKDF2 with 100k iterations
   (OWASP 2023)
4. **Set secure cookies** - `secure: true`, `httpOnly: true`,
   `sameSite: 'Strict'`
5. **Implement rate limiting** - Prevent brute force attacks
6. **Regenerate session ID after login** - Prevent session fixation
7. **Enable remember token recycling** - Detect stolen tokens
8. **Set token expiration** - Limit damage from leaked tokens
9. **Log authentication events** - Monitor suspicious activity
10. **Validate user input** - Prevent injection attacks

## Migration from `@lockness/contract`

Old auth system was monolithic. New system is modular:

```typescript
// Old
import { Auth } from '@lockness/contract'
const auth = new Auth(ctx)

// New
import { getAuth } from '@lockness/auth'
const auth = getAuth(ctx)
const guard = auth.use('web')
```

## Enhanced Auth Guard API

Lockness provides **three approaches** for accessing guards. Choose based on
your use case.

### Approach 1: Context API (Recommended)

The cleanest approach with `c.auth.*` fluent API - **use this for 95% of
cases**.

```typescript
import { Context, Controller, Post, Use } from '@lockness/contract'
import { withAuth } from '@lockness/auth'

@Controller('/auth')
export class AuthController {
    @Post('/login')
    @Use(withAuth()) // Enriches context, doesn't require auth
    async login(c: Context) {
        await c.auth.login(email, password, remember) // ✨ One line!
        return c.redirect('/dashboard')
    }

    @Post('/logout')
    @Use('auth') // Requires authentication
    async logout(c: Context) {
        await c.auth.logout() // ✨ Clean!
        return c.redirect('/login')
    }

    @Get('/profile')
    @Use('auth')
    profile(c: Context) {
        const user = c.auth.user // ✨ Direct typed access
        return c.html(<ProfilePage user={user} />)
    }
}
```

**Available Methods:**

| Method                                 | Description                           |
| -------------------------------------- | ------------------------------------- |
| `c.auth.user`                          | Get authenticated user (or undefined) |
| `c.auth.check()`                       | Check if authenticated                |
| `c.auth.login(email, pass, remember?)` | Login with credentials                |
| `c.auth.loginById(id, remember?)`      | Login by user ID                      |
| `c.auth.logout()`                      | Logout current user                   |
| `c.auth.guard()`                       | Get underlying guard instance         |

**Middlewares:**

- `@Use('auth')` - Requires authentication (throws if not authenticated)
- `@Use(withAuth())` - Enriches context without requiring authentication

### Approach 2: Decorator Injection (Advanced)

Use `@InjectGuard()` when you need direct guard access for advanced operations.

```typescript
import { InjectGuard } from '@lockness/auth'
import type { SessionGuard } from '@lockness/auth'
import type { UserProvider } from '../auth/user_provider.ts'

type WebGuard = SessionGuard<true, UserProvider>

@Controller('/auth')
export class AuthController {
    @Post('/logout')
    @InjectGuard('web')
    async logout(c: Context, guard: WebGuard) {
        // guard is injected as 2nd parameter, fully typed
        await guard.logout()
        return c.redirect('/login')
    }
}
```

**When to use:**

- Need direct guard instance for testing
- Complex guard operations not in Context API
- Want explicit dependency injection pattern

### Approach 3: Manual Access (Multiple Guards)

Use `getAuth(c).use()` when working with multiple guards.

```typescript
import { getAuth } from '@lockness/auth'

@Post('/multi-auth')
@Use(withAuth())
async multiAuth(c: Context) {
    const auth = getAuth(c)

    if (c.req.header('Authorization')) {
        const apiGuard = auth.use('api')
        return await apiGuard.check()
    } else {
        const webGuard = auth.use('web')
        return await webGuard.check()
    }
}
```

**When to use:**

- Multiple guards in single method
- Dynamic guard selection at runtime

### Why No reflect-metadata?

Lockness uses **TC39 Stage 3 decorators** (standard JavaScript decorators):

- ✅ No `reflect-metadata` dependency
- ✅ Works natively in Deno 2+, Node 22+
- ✅ Future-proof and standards-compliant
- ❌ Parameter decorators don't exist (use method decorators)

The `@InjectGuard()` decorator uses a method decorator pattern to inject guards
as parameters.

## API Reference

See [types.ts](types.ts) for complete TypeScript definitions.

## License

MIT
