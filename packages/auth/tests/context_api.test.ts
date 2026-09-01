// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert'
import { Hono } from 'hono'
import { withAuth } from '../middleware/auth_middleware.ts'
import { initializeAuthMiddleware } from '../middleware/initialize_auth_middleware.ts'
import { createMockContext, type Env, MockSessionProvider } from './mocks.ts'
import type { Context } from 'hono'
import { SessionGuard } from '../guards/session_guard.ts'

Deno.test('AuthContext - c.auth.user is available', async () => {
    const app = new Hono<Env>()
    const provider = new MockSessionProvider()

    // Mock session first
    app.use('*', async (c, next) => {
        const dataMap = new Map<string, unknown>()
        const mockSession = {
            get: (key: string) => dataMap.get(key),
            set: (key: string, value: unknown) => dataMap.set(key, value),
            regenerate: () => Promise.resolve(),
        }
        ;(c as any).set('session', mockSession as any)
        await next()
    })

    // Initialize auth
    app.use(
        '*',
        initializeAuthMiddleware({
            default: 'web',
            guards: {
                web: (ctx) => new SessionGuard('web', ctx as any, provider),
            },
        }),
    )

    // Add withAuth middleware
    app.use('*', withAuth('web'))

    app.get('/test', (c: Context) => {
        try {
            const auth = (c as any).get('auth')
            return c.json({
                user: auth?.user !== undefined,
                check: typeof auth?.check === 'function',
                login: typeof auth?.login === 'function',
                loginById: typeof auth?.loginById === 'function',
                logout: typeof auth?.logout === 'function',
                guard: typeof auth?.guard === 'function',
            })
        } catch (e) {
            return c.json({ error: String(e) }, 500)
        }
    })

    const res = await app.request('/test')
    const data = await res.json()

    assertEquals(data.user, false) // No user logged in yet
    assertEquals(data.check, true)
    assertEquals(data.login, true)
    assertEquals(data.loginById, true)
    assertEquals(data.logout, true)
    assertEquals(data.guard, true)
})

Deno.test('AuthContext - c.auth.login() works', async () => {
    const app = new Hono<Env>()
    const provider = new MockSessionProvider()

    // Mock session
    app.use('*', async (c, next) => {
        const dataMap = new Map<string, unknown>()
        const mockSession = {
            get: (key: string) => dataMap.get(key),
            set: (key: string, value: unknown) => dataMap.set(key, value),
            regenerate: () => Promise.resolve(),
        }
        c.set('session', mockSession as any)
        await next()
    })

    // Initialize auth
    app.use(
        '*',
        initializeAuthMiddleware({
            default: 'web',
            guards: {
                web: (ctx) => new SessionGuard('web', ctx as any, provider),
            },
        }),
    )

    // Add withAuth middleware
    app.use('*', withAuth('web'))

    app.post('/login', async (c: Context) => {
        const auth = c.get('auth')
        const user = await auth.login('alice@example.com', 'password123')
        return c.json({ name: user.name })
    })

    const res = await app.request('/login', { method: 'POST' })
    const data = await res.json()

    assertEquals(data.name, 'Alice')
})

Deno.test('AuthContext - c.auth.logout() works', async () => {
    const app = new Hono<Env>()
    const provider = new MockSessionProvider()

    const dataMap = new Map<string, unknown>()

    // Mock session
    app.use('*', async (c, next) => {
        const mockSession = {
            get: (key: string) => dataMap.get(key),
            set: (key: string, value: unknown) => dataMap.set(key, value),
            forget: (key: string) => dataMap.delete(key),
            regenerate: () => Promise.resolve(),
            // logout() now destroys the whole session (reaching driver.destroy()
            // → revoke) rather than only forgetting the auth key.
            destroy: () => {
                dataMap.clear()
                return Promise.resolve()
            },
        }
        c.set('session', mockSession as any)
        await next()
    })

    // Initialize auth
    app.use(
        '*',
        initializeAuthMiddleware({
            default: 'web',
            guards: {
                web: (ctx) => new SessionGuard('web', ctx as any, provider),
            },
        }),
    )

    // Add withAuth middleware
    app.use('*', withAuth('web'))

    // Login
    app.post('/login', async (c: Context) => {
        const auth = c.get('auth')
        await auth.login('alice@example.com', 'password123')
        return c.json({ success: true })
    })

    // Logout
    app.post('/logout', async (c: Context) => {
        const auth = c.get('auth')
        await auth.logout()
        return c.json({ success: true })
    })

    // Login first
    await app.request('/login', { method: 'POST' })

    // Verify session has user ID
    assertEquals(dataMap.has('auth_web'), true)

    // Logout
    await app.request('/logout', { method: 'POST' })

    // Verify session is cleared
    assertEquals(dataMap.has('auth_web'), false)
})

Deno.test('AuthContext - c.auth.check() returns false when not authenticated', async () => {
    const ctx = await createMockContext()
    const provider = new MockSessionProvider()

    const authMiddleware = initializeAuthMiddleware({
        default: 'web',
        guards: {
            web: (ctx) => new SessionGuard('web', ctx as any, provider),
        },
    })

    await authMiddleware(ctx, async () => {})

    const enrichMiddleware = withAuth('web')
    await enrichMiddleware(ctx, async () => {})

    const auth = ctx.get('auth')
    const isAuthenticated = await auth.check()

    assertEquals(isAuthenticated, false)
})

Deno.test('AuthContext - c.auth.check() returns true when authenticated', async () => {
    const app = new Hono<Env>()
    const provider = new MockSessionProvider()

    // Mock session with user ID
    app.use('*', async (c, next) => {
        const dataMap = new Map<string, unknown>()
        dataMap.set('auth_web', 1) // Pre-authenticated

        const mockSession = {
            get: (key: string) => dataMap.get(key),
            set: (key: string, value: unknown) => dataMap.set(key, value),
            regenerate: () => Promise.resolve(),
        }
        c.set('session', mockSession as any)
        await next()
    })

    // Initialize auth
    app.use(
        '*',
        initializeAuthMiddleware({
            default: 'web',
            guards: {
                web: (ctx) => new SessionGuard('web', ctx as any, provider),
            },
        }),
    )

    // Add withAuth middleware
    app.use('*', withAuth('web'))

    app.get('/check', async (c: Context) => {
        const auth = c.get('auth')
        const isAuthenticated = await auth.check()
        return c.json({ authenticated: isAuthenticated })
    })

    const res = await app.request('/check')
    const data = await res.json()

    assertEquals(data.authenticated, true)
})
