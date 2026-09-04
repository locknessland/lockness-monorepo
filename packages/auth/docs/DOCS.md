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

> **Logout destroys the session and always invalidates the remember-me token.**
> `logout()` calls `session.destroy()` (not just `forget`), so when the session
> driver supports revocation (the cookie driver with `revocation: true`) a copy
> of the pre-logout cookie captured by an attacker can no longer authenticate.
> The remember-me token is deleted whenever one is present — even when the
> request did not authenticate via remember — so a session-based logout cannot
> leave a live remember-me credential behind.

## Guards

### Session Guard

Cookie/session-based authentication for web applications.

```typescript
import { SessionGuard } from '@lockness/auth'

const guard = new SessionGuard('web', c, userProvider, {
    useRememberMeTokens: true,
    rememberMeTokensAge: 30 * 24 * 60 * 60, // rolling window, in seconds
    rememberMeAbsoluteLifetime: 90 * 24 * 60 * 60, // hard ceiling (#146), in seconds
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

// Log out EVERY device of the authenticated user (this one included) —
// a password change or account recovery should call this.
await guard.logoutEverywhere()

// Log out the user's OTHER devices, keeping this session alive.
await guard.logoutOthers()
```

> **Per-user eviction — "log out everywhere" (#147, ASVS 7.4.2).** Per-session
> `logout()` revokes one session. `logoutEverywhere()` and `logoutOthers()`
> evict **all** of the authenticated user's sessions in one operation, by
> setting a per-user eviction epoch in the session store (see the session docs):
> every session whose first-issuance instant predates the epoch is refused,
> fail-closed. Both require the cookie driver with `revocation: true` (and thus
> `absoluteLifetime`).
>
> - **`logoutEverywhere()`** also kills the acting session deterministically (it
>   revokes the acting session's nonce too, so a same-second session dies) and
>   **invalidates the user's remember-me tokens**, so a captured remember-me
>   cookie cannot re-mint a post-eviction session.
> - **`logoutOthers()`** rotates the acting session to a fresh identity so it
>   survives, invalidates other devices' remember-me tokens, and re-issues the
>   acting device's when one was present.
> - **Both throw `AuthenticationRequiredError` when unauthenticated** — an
>   eviction is always scoped to `this.user.id`, never an arbitrary subject.
> - **Credential-change / recovery flows must call one of these** — the
>   framework exposes the capability; firing it on a password change or account
>   recovery is the application's responsibility (ASVS 7.4.2). A custom
>   remember-me provider must implement `deleteAllRememberTokens(user)`; the
>   bundled Drizzle/Kysely providers and the app scaffold already do.

> **Remember-me absolute lifetime (#146).** `rememberMeTokensAge` is a _rolling_
> window — every use renews it, so without a ceiling a stolen remember-me cookie
> refreshes forever. `rememberMeAbsoluteLifetime` (seconds) caps the credential
> from its **first issuance**, preserved across every renewal, and refuses it
> once that age is exceeded — deleting the token server-side and clearing the
> cookie.
>
> - **Off by default.** Omit it and behaviour is unchanged. It is
>   **fail-closed**: a value `≤ 0` throws at construction — `0` never silently
>   disables the cap.
> - **Provider contract.** A custom user provider's
>   `recycleRememberToken(user,
>   token, expiresIn)` MUST bare-copy the origin
>   forward — `new.firstIssuedAt = token.firstIssuedAt` — or the cap degrades to
>   a rolling window. The bundled Drizzle/Kysely providers already do.
> - **Legacy tokens** issued before this feature (no `firstIssuedAt`) are frozen
>   at their `createdAt` on the first renewal, so they acquire a finite ceiling
>   — though anchored to that renewal, not true first issuance.
> - **Composition, not nesting.** This cap bounds the remember-me credential's
>   re-mint window; a session it already established carries its **own**
>   absolute lifetime (the `@lockness/session` cookie cap, #143). The two
>   ceilings compose.

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

## Authorization: roles & permissions (RBAC)

The optional RBAC layer sits on top of the authorization gate (gates, policies
and the `@Authorize`/`@Can` decorators are documented separately). A **role**
groups **permissions**; a permission is an ability pattern. RBAC is wired as a
gate **fallback** — it is consulted only when no explicit ability or policy has
decided a check, so an ownership or tenancy policy is never bypassed, and RBAC
can only ever grant, never deny.

```typescript
import { gate, StaticRoleRepository, useRbac } from '@lockness/auth'

// Map user id → roles (any RoleRepository works; this one is in-memory).
const roles = new StaticRoleRepository(
    new Map([
        [1, [{ name: 'editor', permissions: ['post.*', 'comment.create'] }]],
        [2, [{ name: 'admin', permissions: ['*'] }]],
    ]),
)

// Opt in — nothing is active until this call.
useRbac(gate, roles)

await gate.can(user, 'post.update') // true for the editor (post.*)
await gate.can(user, 'billing.void') // false — no matching permission
```

**Permission patterns** (plain strings, no regex):

| Pattern       | Grants                                                         |
| ------------- | -------------------------------------------------------------- |
| `post.update` | exactly `post.update`                                          |
| `post.*`      | one further segment (`post.update`, not `post.comment.delete`) |
| `*`           | every ability (superadmin)                                     |

**Notes**

- **Opt-in**: an app that never calls `useRbac` behaves exactly as before — RBAC
  registers nothing by default.
- **Precedence**: an explicit ability or policy (including a subject-aware
  ownership check) always wins; RBAC only fills abilities with no rule.
- **Custom storage**: implement `RoleRepository.rolesFor({ id })` over your
  database. The port receives the user's id only, never the full user record.
- **`gate.reset()` clears fallbacks** — re-apply `useRbac` afterwards (e.g. in
  test isolation).

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
