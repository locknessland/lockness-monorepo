// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists } from '@std/assert'
import { Hono } from 'hono'
import type { Context } from 'hono'
import {
    initializeAuthMiddleware,
    authMiddleware,
    getAuth,
    SessionGuard,
    TokenGuard,
} from '../mod.ts'
import {
    MockSessionProvider,
    MockTokenProvider,
} from './mocks.ts'

Deno.test('initializeAuthMiddleware - attaches auth to context', async () => {
    const app = new Hono()
    const provider = new MockSessionProvider()

    const sessionGuardFactory = (c: Context) => new SessionGuard('web', c as any, provider)

    app.use(
        '*',
        initializeAuthMiddleware({
            default: 'web',
            guards: { web: sessionGuardFactory },
        }),
    )

    app.get('/test', (c) => {
        const auth = getAuth(c)
        assertExists(auth)
        return c.text('OK')
    })

    const res = await app.request('/test')
    assertEquals(res.status, 200)
})

Deno.test('authMiddleware - protects routes', async () => {
    const app = new Hono()
    const provider = new MockTokenProvider()

    const tokenGuardFactory = (c: Context) => new TokenGuard('api', c as any, provider)

    app.onError((err, c) => {
        if ('status' in err && typeof err.status === 'number') {
            return c.json({ error: err.message }, err.status as 401 | 500)
        }
        return c.json({ error: 'Internal server error' }, 500)
    })

    app.use(
        '*',
        initializeAuthMiddleware({
            default: 'api',
            guards: { api: tokenGuardFactory },
        }),
    )

    app.get('/protected', authMiddleware(), (c) => {
        return c.json({ message: 'Protected data' })
    })

    // Without token
    const res1 = await app.request('/protected')
    assertEquals(res1.status, 401)

    // With valid token
    const user = await provider.findByCredentials('alice@example.com', 'password123')
    const token = await provider.createToken(user!, 'test')

    const res2 = await app.request('/protected', {
        headers: { Authorization: `Bearer ${token.value}` },
    })
    assertEquals(res2.status, 200)
})

Deno.test('Authenticator - check returns boolean', async () => {
    const provider = new MockTokenProvider()
    const app = new Hono()

    app.use('*', initializeAuthMiddleware({
        default: 'api',
        guards: { api: (c) => new TokenGuard('api', c as any, provider) },
    }))

    app.get('/test', async (c) => {
        const auth = getAuth(c)
        const isAuth = await auth.check()
        return c.json({ isAuth })
    })

    const res = await app.request('http://localhost/test', {
        headers: { Authorization: 'Bearer invalid' },
    })
    const data = await res.json()

    assertEquals(data.isAuth, false)
})
