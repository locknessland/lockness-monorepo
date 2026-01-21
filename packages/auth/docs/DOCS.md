# Authentication

Complete authentication system with multiple guards (Session, Token, Basic
Auth), pluggable providers, and security-first design inspired by AdonisJS.

**Note:** Lockness uses TC39 standard decorators natively supported by Deno 2+.
When using `@Inject` for dependency injection, always use the `accessor`
keyword.

## Quick Setup

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

export class UserProvider implements SessionUserProviderContract<User> {
    declare [PROVIDER_REAL_USER]: User

    async findById(id: string | number): Promise<User | null> {
        // Query your database
        const user = await db.query.users.findFirst({
            where: eq(users.id, id),
        })
        return user || null
    }

    async findByCredentials(
        email: string,
        password: string,
    ): Promise<User | null> {
        const user = await db.query.users.findFirst({
            where: eq(users.email, email),
        })
        if (!user) return null

        const valid = await verifyPassword(password, user.password)
        return valid ? user : null
    }

    async verifyPassword(plain: string, hash: string): Promise<boolean> {
        return await bcrypt.compare(plain, hash)
    }
}
```

### 2. Configure Authentication

In `app/kernel.ts`:

```typescript
import { initializeAuthMiddleware, SessionGuard } from '@lockness/auth'
import { sessionMiddleware } from '@lockness/session'
import { UserProvider } from '@provider/user_provider.ts'

const app = new App()
const userProvider = new UserProvider()

// 1. Initialize session (required for SessionGuard)
app.use(
    '*',
    sessionMiddleware({
        driver: 'cookie',
        cookieName: 'session_id',
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
```

### 3. Protect Routes with Decorators

Use dedicated decorators for clear, type-safe route protection:

```typescript
import { Context, Controller, Get, Post } from '@lockness/core'
import { AuthGuard, AuthOptional, AuthRequired } from '@lockness/auth'

@Controller('/auth')
export class AuthController {
    @Get('/login')
    @AuthOptional()
    showLogin(c: Context) {
        // auth is available but not required
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
    async profile(c: Context) {
        // User is guaranteed to be authenticated
        // If not authenticated, automatically redirects to /auth/login
        const user = c.get('auth').user
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
    async apiData(c: Context) {
        // Requires API token authentication
        const user = c.get('auth').user
        return c.json({ data: [] })
    }
}
```

## Decorators

### `@AuthOptional()`

Makes authentication available without requiring it. Use for routes accessible
to both authenticated and unauthenticated users.

```typescript
@Get('/home')
@AuthOptional()
home(c: Context) {
    const user = c.get('auth')?.user  // May be undefined
    return c.json({ user })
}
```

### `@AuthRequired()`

Requires authentication. Throws `AuthenticationRequiredError` if user is not
authenticated. Can optionally redirect to a login page on authentication
failure.

```typescript
// Throw error on failure (default)
@Get('/profile')
@AuthRequired()
profile(c: Context) {
    const user = c.get('auth').user  // Guaranteed to exist
    return c.json({ user })
}

// Redirect to login page on failure (recommended for web apps)
@Get('/profile')
@AuthRequired({ redirectTo: '/auth/login' })
profile(c: Context) {
    const user = c.get('auth').user
    return c.html(<ProfilePage user={user} />)
}
```

**Options:**

- `redirectTo?: string` - Optional path to redirect to on authentication failure

### `@AuthGuard(guardName)`

Requires a specific guard. Useful for APIs requiring token authentication or
other guard types.

```typescript
@Post('/api/users')
@AuthGuard('api')
createUser(c: Context) {
    const user = c.get('auth').user
    return c.json({ user })
}

// Multiple guards
@Get('/data')
@AuthGuard(['web', 'api'])
getData(c: Context) {
    const user = c.get('auth').user
    return c.json({ data: [] })
}
```

## Context API

Access authentication through `c.get('auth')`:

```typescript
const auth = c.get('auth')

// Check authentication
const isAuthenticated = await auth.check()
const user = auth.user // undefined if not authenticated

// Login
await auth.login(email, password, remember)

// Login by ID
await auth.loginById(userId, remember)

// Logout
await auth.logout()

// Access guard
const guard = auth.guard()
```

## Guards

### Session Guard

Cookie/session-based authentication for web applications.

```typescript
import { SessionGuard } from '@lockness/auth'

const guard = new SessionGuard('web', c, userProvider, {
    useRememberMeTokens: true,
    rememberMeTokenLifetime: 365 * 24 * 60 * 60, // 1 year
    sessionKeyName: 'auth_user_id',
})

// Login with credentials
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

### Token Guard

Bearer token authentication for APIs and mobile apps.

```typescript
import { TokenGuard } from '@lockness/auth'

const guard = new TokenGuard('api', c, tokenProvider, {
    prefix: 'Bearer',
    tokenType: 'Bearer',
})

// Generate token (after login)
const token = await guard.generate('user@example.com', 'password', 'mobile-app')
console.log('Token:', token.value)

// Authenticate API request
const user = await guard.authenticate()

// Revoke current token
await guard.revoke()

// Revoke all tokens (logout all devices)
await guard.revokeAll()
```

### Basic Auth Guard

HTTP Basic Authentication for development or internal APIs.

```typescript
import { BasicAuthGuard } from '@lockness/auth'

const guard = new BasicAuthGuard('basic', c, basicAuthProvider, {
    realm: 'Protected Area',
})

const user = await guard.authenticate()
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

// Pass emitter to guard
const guard = new SessionGuard('web', c, provider, options, emitter)
```

## Security Best Practices

1. **Always use HTTPS in production** - Prevents session/token theft
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

## Password Hashing

```typescript
import { hashPassword, verifyPassword } from '@lockness/core'

// Hash a password
const hash = await hashPassword('secret123')

// Verify a password
const valid = await verifyPassword('secret123', hash)
```

## Social Authentication (OAuth2)

Add social login with Google, GitHub, Discord:

```bash
deno task cli make:auth --social
```

Configure providers in `app/kernel.ts`:

```typescript
import { configureSocialite } from '@lockness/core'

configureSocialite({
    google: {
        clientId: Deno.env.get('GOOGLE_CLIENT_ID')!,
        clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
        redirectUri: Deno.env.get('APP_URL') + '/auth/google/callback',
    },
    github: {
        clientId: Deno.env.get('GITHUB_CLIENT_ID')!,
        clientSecret: Deno.env.get('GITHUB_CLIENT_SECRET')!,
        redirectUri: Deno.env.get('APP_URL') + '/auth/github/callback',
    },
})
```

Use in controllers:

```typescript
import { socialite, generateState, session } from '@lockness/core'

@Get('/auth/google')
google(c: Context) {
    const state = generateState()
    session(c).set('oauth_state', state)
    return socialite('google').redirect(state)
}

@Get('/auth/google/callback')
async googleCallback(c: Context) {
    const user = await socialite('google').user(c)
    // user: { id, email, name, avatar, accessToken, ... }
    
    // Find or create user in your database
    return c.redirect('/dashboard')
}
```

Available providers: `google`, `github`, `discord`
