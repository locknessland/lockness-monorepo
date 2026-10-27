// deno-lint-ignore-file no-explicit-any
import { Hono } from 'hono'
import type { Context } from 'hono'
import type {
    AccessToken,
    Authenticatable,
    BasicAuthUserProviderContract,
    SessionUserProviderContract,
    TokenUserProviderContract,
} from '../types.ts'
import { PROVIDER_REAL_USER } from '../types.ts'

// =============================================================================
// Mock User Type
// =============================================================================

export interface TestUser extends Authenticatable {
    id: number
    email: string
    password: string
    name: string
}

// Define Hono environment with session type
export type Env = {
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

export class MockSessionProvider
    implements SessionUserProviderContract<TestUser> {
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

    findById(id: string | number): Promise<TestUser | null> {
        return Promise.resolve(this.users.get(Number(id)) || null)
    }

    findByCredentials(
        email: string,
        password: string,
    ): Promise<TestUser | null> {
        for (const user of this.users.values()) {
            if (user.email === email && user.password === password) {
                return Promise.resolve(user)
            }
        }
        return Promise.resolve(null)
    }

    verifyPassword(plain: string, hash: string): Promise<boolean> {
        return Promise.resolve(plain === hash)
    }
}

// =============================================================================
// Mock Token User Provider (In-Memory)
// =============================================================================

export class MockTokenProvider implements TokenUserProviderContract<TestUser> {
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

    findById(id: string | number): Promise<TestUser | null> {
        return Promise.resolve(this.users.get(Number(id)) || null)
    }

    findByCredentials(
        email: string,
        password: string,
    ): Promise<TestUser | null> {
        for (const user of this.users.values()) {
            if (user.email === email && user.password === password) {
                return Promise.resolve(user)
            }
        }
        return Promise.resolve(null)
    }

    createToken(
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
            expiresAt: expiresIn
                ? new Date(Date.now() + expiresIn * 1000)
                : undefined,
            createdAt: new Date(),
        }
        this.tokens.set(tokenValue, token)
        return Promise.resolve(token)
    }

    async verifyToken(
        tokenValue: string,
    ): Promise<{ user: TestUser; token: AccessToken } | null> {
        const token = this.tokens.get(tokenValue)
        if (!token) return null

        if (token.expiresAt && token.expiresAt < new Date()) {
            return null
        }

        const user = await this.findById(token.userId)
        if (!user) return null

        return { user, token }
    }

    deleteToken(user: TestUser, tokenId: string | number): Promise<void> {
        for (const [key, token] of this.tokens.entries()) {
            if (token.identifier === tokenId && token.userId === user.id) {
                this.tokens.delete(key)
                break
            }
        }
        return Promise.resolve()
    }

    deleteAllTokens(user: TestUser): Promise<void> {
        for (const [tokenId, token] of this.tokens.entries()) {
            if (token.userId === user.id) {
                this.tokens.delete(tokenId)
            }
        }
        return Promise.resolve()
    }
}

// =============================================================================
// Mock Basic Auth Provider
// =============================================================================

export class MockBasicAuthProvider
    implements BasicAuthUserProviderContract<TestUser> {
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

    findById(id: string | number): Promise<TestUser | null> {
        return Promise.resolve(this.users.get(Number(id)) || null)
    }

    findByCredentials(
        email: string,
        password: string,
    ): Promise<TestUser | null> {
        for (const user of this.users.values()) {
            if (user.email === email && user.password === password) {
                return Promise.resolve(user)
            }
        }
        return Promise.resolve(null)
    }

    verifyPassword(plain: string, hash: string): Promise<boolean> {
        return Promise.resolve(plain === hash)
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

export async function createMockContext(): Promise<Context> {
    const app = new Hono<Env>()

    // Add session middleware
    app.use('*', async (c, next) => {
        const dataMap = new Map<string, unknown>()
        const mockSession = {
            _data: dataMap,
            get: function (key: string) {
                return dataMap.get(key)
            },
            set: function (key: string, value: unknown) {
                dataMap.set(key, value)
            },
            regenerate: () => {
                dataMap.clear()
                return Promise.resolve()
            },
        }
        c.set('session', mockSession as any)
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
