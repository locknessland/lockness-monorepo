import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { Hono } from 'hono'
import {
    SessionGuard,
    TokenGuard,
    BasicAuthGuard,
    InvalidCredentialsError,
} from '../mod.ts'
import {
    createMockContext,
    MockSessionProvider,
    MockTokenProvider,
    MockBasicAuthProvider,
    Env,
} from './mocks.ts'

Deno.test('SessionGuard - login with valid credentials', async () => {
    const app = new Hono<Env>()
    const provider = new MockSessionProvider()

    app.use('*', async (c, next) => {
        const mockSession = {
            get: () => undefined,
            set: () => { },
            regenerate: async () => { },
        }
        c.set('session', mockSession as any)
        await next()
    })

    app.post('/login', async (c) => {
        const guard = new SessionGuard('web', c as any, provider)
        const user = await guard.login('alice@example.com', 'password123')
        return c.json({ user: user.name })
    })

    const res = await app.request('/login', { method: 'POST' })
    const data = await res.json()

    assertEquals(data.user, 'Alice')
})

Deno.test('SessionGuard - login with invalid credentials', async () => {
    const provider = new MockSessionProvider()
    const ctx = await createMockContext()

    const guard = new SessionGuard('web', ctx, provider)

    await assertRejects(
        async () => await guard.login('alice@example.com', 'wrong'),
        InvalidCredentialsError,
    )
})

Deno.test('TokenGuard - generate token for user', async () => {
    const ctx = await createMockContext()
    const provider = new MockTokenProvider()
    const guard = new TokenGuard('api', ctx, provider)

    const token = await guard.generate('alice@example.com', 'password123', 'test-app')

    assertExists(token)
    assertExists(token.value)
    assertEquals(token.name, 'test-app')
})

Deno.test('TokenGuard - authenticate with valid token', async () => {
    const provider = new MockTokenProvider()
    const app = new Hono()

    const user = await provider.findByCredentials('alice@example.com', 'password123')
    const token = await provider.createToken(user!, 'test')

    app.get('/test', async (c) => {
        const guard = new TokenGuard('api', c as any, provider)
        const authenticatedUser = await guard.authenticate()
        return c.json({ email: authenticatedUser.email, isAuthenticated: guard.isAuthenticated })
    })

    const res = await app.request('http://localhost/test', {
        headers: { Authorization: `Bearer ${token.value}` },
    })
    const data = await res.json()

    assertEquals(data.email, 'alice@example.com')
    assertEquals(data.isAuthenticated, true)
})

Deno.test('BasicAuthGuard - authenticate with valid credentials', async () => {
    const provider = new MockBasicAuthProvider()
    const app = new Hono()

    app.get('/test', async (c) => {
        const guard = new BasicAuthGuard('basic', c as any, provider)
        const user = await guard.authenticate()
        return c.json({ email: user.email, isAuthenticated: guard.isAuthenticated })
    })

    const credentials = btoa('alice@example.com:password123')
    const res = await app.request('http://localhost/test', {
        headers: { Authorization: `Basic ${credentials}` },
    })
    const data = await res.json()

    assertEquals(data.email, 'alice@example.com')
    assertEquals(data.isAuthenticated, true)
})
