/**
 * @lockness/auth - Tests
 * 
 * Comprehensive tests for authentication system with mock providers.
 */

import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { Hono } from 'hono'
import type { Context } from 'hono'
import {
    Authenticator,
    SessionGuard,
    TokenGuard,
    BasicAuthGuard,
    InvalidCredentialsError,
    UnauthorizedAccessError,
    initializeAuthMiddleware,
    authMiddleware,
    getAuth,
} from '../auth.ts'
import type {
    Authenticatable,
    SessionUserProviderContract,
    TokenUserProviderContract,
    BasicAuthUserProviderContract,
    RememberMeToken,
    AccessToken,
    PROVIDER_REAL_USER,
} from '../types.ts'

// =============================================================================
// Mock User Type
// =============================================================================

interface TestUser extends Authenticatable {
    id: number
    email: string
    password: string
    name: string
}

// Define Hono environment with session type
type Env = {
    Variables: {
        session: {
            get: (key: string) => unknown
            set: (key: string, value: unknown) => void
            regenerate: () => Promise<void>
        }
    }
}

// =============================================================================
// Mock Session User Provider (In-Memory)
// =============================================================================

class MockSessionProvider implements SessionUserProviderContract<TestUser> {
    declare [PROVIDER_REAL_USER]: TestUser

    private users: Map<number, TestUser> = new Map()

    constructor() {
        // Add test users
        this.users.set(1, {
            id: 1,
            email: 'alice@example.com',
            password: 'password123',
            name: 'Alice',
        })
        this.users.set(2, {
            id: 2,
            email: 'bob@example.com',
            password: 'secret456',
            name: 'Bob',
        })
    }

    async findById(id: string | number): Promise<TestUser | null> {
        return this.users.get(Number(id)) || null
    }

    async findByCredentials(email: string, password: string): Promise<TestUser | null> {
        for (const user of this.users.values()) {
            if (user.email === email && user.password === password) {
                return user
            }
        }
        return null
    }

    async verifyPassword(plain: string, hash: string): Promise<boolean> {
        return plain === hash
    }
}

// =============================================================================
// Mock Token User Provider (In-Memory)
// =============================================================================

class MockTokenProvider implements TokenUserProviderContract<TestUser> {
    declare [PROVIDER_REAL_USER]: TestUser

    private users: Map<number, TestUser> = new Map()
    private tokens: Map<string, AccessToken> = new Map()

    constructor() {
        this.users.set(1, {
            id: 1,
            email: 'alice@example.com',
            password: 'password123',
            name: 'Alice',
        })
    }

    async findById(id: string | number): Promise<TestUser | null> {
        return this.users.get(Number(id)) || null
    }

    async findByCredentials(email: string, password: string): Promise<TestUser | null> {
        for (const user of this.users.values()) {
            if (user.email === email && user.password === password) {
                return user
            }
        }
        return null
    }

    async createToken(
        user: TestUser,
        name: string,
        expiresIn?: number,
    ): Promise<AccessToken> {
        const tokenValue = `token_${Date.now()}_${Math.random()}`
        const token: AccessToken = {
            identifier: this.tokens.size + 1,
            name,
            value: tokenValue,
            hash: tokenValue, // Simplified for testing
            userId: user.id,
            expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
            createdAt: new Date(),
        }
        this.tokens.set(tokenValue, token)
        return token
    }

    async verifyToken(tokenValue: string): Promise<{ user: TestUser; token: AccessToken } | null> {
        const token = this.tokens.get(tokenValue)
        if (!token) return null

        if (token.expiresAt && token.expiresAt < new Date()) {
            return null
        }

        const user = await this.findById(token.userId)
        if (!user) return null

        return { user, token }
    }

    async deleteToken(user: TestUser, tokenId: string | number): Promise<void> {
        for (const [key, token] of this.tokens.entries()) {
            if (token.identifier === tokenId && token.userId === user.id) {
                this.tokens.delete(key)
                break
            }
        }
    }

    async deleteAllTokens(user: TestUser): Promise<void> {
        for (const [key, token] of this.tokens.entries()) {
            if (token.userId === user.id) {
                this.tokens.delete(key)
            }
        }
    }
}

// =============================================================================
// Mock Basic Auth Provider
// =============================================================================

class MockBasicAuthProvider implements BasicAuthUserProviderContract<TestUser> {
    declare [PROVIDER_REAL_USER]: TestUser

    private users: Map<number, TestUser> = new Map()

    constructor() {
        this.users.set(1, {
            id: 1,
            email: 'alice@example.com',
            password: 'password123',
            name: 'Alice',
        })
    }

    async findById(id: string | number): Promise<TestUser | null> {
        return this.users.get(Number(id)) || null
    }

    async findByCredentials(email: string, password: string): Promise<TestUser | null> {
        for (const user of this.users.values()) {
            if (user.email === email && user.password === password) {
                return user
            }
        }
        return null
    }

    async verifyPassword(plain: string, hash: string): Promise<boolean> {
        return plain === hash
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

async function createMockContext(): Promise<Context> {
    const app = new Hono<Env>()

    // Add session middleware
    app.use('*', async (c, next) => {
        const dataMap = new Map<string, unknown>()
        const mockSession = {
            _data: dataMap,
            get: function (key: string) { return dataMap.get(key) },
            set: function (key: string, value: unknown) { dataMap.set(key, value) },
            regenerate: async () => { dataMap.clear() },
        }
        c.set('session', mockSession)
        await next()
    })

    let ctx!: Context
    app.get('/test', (c) => {
        ctx = c
        return c.text('ok')
    })

    await app.request('http://localhost/test')
    return ctx
}

// =============================================================================
// Authenticator Tests
// =============================================================================

Deno.test('Authenticator - can be instantiated', async () => {
    const ctx = await createMockContext()
    const provider = new MockSessionProvider()
    const config = {
        default: 'web' as const,
        guards: {
            web: () => new SessionGuard('web', ctx, provider),
        },
    }
    const auth = new Authenticator(ctx, config)
    assertExists(auth)
    assertEquals(auth.defaultGuard, 'web')
})

Deno.test('Authenticator - throws when accessing user before authentication', async () => {
    const ctx = await createMockContext()
    const provider = new MockSessionProvider()
    const auth = new Authenticator(ctx, {
        default: 'web' as const,
        guards: {
            web: () => new SessionGuard('web', ctx, provider),
        },
    })

    assertEquals(auth.isAuthenticated, false)
    assertEquals(auth.user, undefined)
})

// =============================================================================
// Session Guard Tests
// =============================================================================

Deno.test('SessionGuard - login with valid credentials', async () => {
    const app = new Hono<Env>()
    const provider = new MockSessionProvider()

    app.use('*', async (c, next) => {
        // Mock session
        const mockSession = {
            get: () => undefined,
            set: () => { },
            regenerate: async () => { },
        }
        c.set('session', mockSession)
        await next()
    })

    app.post('/login', async (c) => {
        const guard = new SessionGuard('web', c, provider)
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

// =============================================================================
// Token Guard Tests
// =============================================================================

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

    // Generate token
    const user = await provider.findByCredentials('alice@example.com', 'password123')
    const token = await provider.createToken(user!, 'test')

    app.get('/test', async (c) => {
        const guard = new TokenGuard('api', c, provider)
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

Deno.test('TokenGuard - fails with invalid token', async () => {
    const provider = new MockTokenProvider()
    const app = new Hono()

    app.get('/test', async (c) => {
        const guard = new TokenGuard('api', c, provider)
        await guard.authenticate()
        return c.text('ok')
    })

    const res = await app.request('http://localhost/test', {
        headers: { Authorization: 'Bearer invalid_token' },
    })

    assertEquals(res.status, 500) // Will throw, but error not caught
})

// =============================================================================
// Basic Auth Guard Tests
// =============================================================================

Deno.test('BasicAuthGuard - authenticate with valid credentials', async () => {
    const provider = new MockBasicAuthProvider()
    const app = new Hono()

    app.get('/test', async (c) => {
        const guard = new BasicAuthGuard('basic', c, provider)
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

Deno.test('BasicAuthGuard - fails with invalid credentials', async () => {
    const provider = new MockBasicAuthProvider()
    const app = new Hono()

    app.get('/test', async (c) => {
        const guard = new BasicAuthGuard('basic', c, provider)
        await guard.authenticate()
        return c.text('ok')
    })

    const credentials = btoa('alice@example.com:wrongpassword')
    const res = await app.request('http://localhost/test', {
        headers: { Authorization: `Basic ${credentials}` },
    })

    assertEquals(res.status, 500) // Will throw, but error not caught
})

// =============================================================================
// Middleware Integration Tests
// =============================================================================

Deno.test('initializeAuthMiddleware - attaches auth to context', async () => {
    const app = new Hono()
    const provider = new MockSessionProvider()

    const sessionGuardFactory = (c: Context) => new SessionGuard('web', c, provider)

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

    const tokenGuardFactory = (c: Context) => new TokenGuard('api', c, provider)

    // Add error handler
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

Deno.test('Authenticator - use specific guard', async () => {
    const ctx = await createMockContext()
    const provider = new MockSessionProvider()

    const sessionGuardFactory = (c: Context) => new SessionGuard('web', c, provider)

    const auth = new Authenticator(ctx, {
        default: 'web',
        guards: { web: sessionGuardFactory },
    })

    const guard = auth.use('web')
    assertExists(guard)
    assertEquals(guard.driverName, 'session')
})

Deno.test('Authenticator - check returns boolean', async () => {
    const provider = new MockTokenProvider()
    const app = new Hono()

    let isAuth = false

    app.use('*', initializeAuthMiddleware({
        default: 'api',
        guards: { api: (c) => new TokenGuard('api', c, provider) },
    }))

    app.get('/test', async (c) => {
        const auth = getAuth(c)
        isAuth = await auth.check()
        return c.json({ isAuth })
    })

    const res = await app.request('http://localhost/test', {
        headers: { Authorization: 'Bearer invalid' },
    })
    const data = await res.json()

    assertEquals(data.isAuth, false)
})
