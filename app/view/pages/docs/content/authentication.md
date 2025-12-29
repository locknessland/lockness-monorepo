# Authentication

Complete authentication system with session-based auth, password hashing, and
OAuth2 social login.

**Note:** Lockness uses TC39 standard decorators natively supported by Deno 2+.
When using `@Inject` for dependency injection, always use the `accessor`
keyword.

## Quick Setup

Scaffold a complete authentication system with one command:

```bash
deno task cli make:auth
```

This creates:

- `app/controller/auth_controller.ts` - Login, logout, register routes
- `app/provider/user_provider.ts` - User authentication provider

## Configuration

Configure authentication in `app/kernel.ts`:

```typescript
import { configureAuth, container } from '@lockness/core'
import { UserProvider } from '@provider/user_provider.ts'

configureAuth({
    userProvider: container.get(UserProvider),
    redirectTo: '/auth/login',
})
```

## Guards & Decorators

Protect routes with authentication guards:

```typescript
import { Auth, auth, Controller, Get, Guest } from '@lockness/core'

@Controller('/dashboard')
@Auth() // Require authentication for entire controller
export class DashboardController {
    @Get('/')
    async index(c: Context) {
        const user = await auth(c).user()
        return c.json({ user })
    }
}

@Controller('/auth')
export class AuthController {
    @Guest('/dashboard') // Redirect if already logged in
    @Get('/login')
    showLogin(c: Context) {
        return c.html(<LoginPage />)
    }
}
```

## Auth API

**Login with credentials:**

```typescript
const success = await auth(c).attempt(email, password)
if (success) {
    return c.redirect('/dashboard')
}
```

**Get authenticated user:**

```typescript
const user = await auth(c).user()
const userId = auth(c).id()
```

**Check authentication:**

```typescript
if (await auth(c).check()) {
    // User is authenticated
}

if (await auth(c).guest()) {
    // User is NOT authenticated
}
```

**Logout:**

```typescript
await auth(c).logout()
return c.redirect('/auth/login')
```

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
