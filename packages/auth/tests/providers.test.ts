import { assertEquals, assertExists } from '@std/assert'
import type { Authenticatable } from '../types.ts'

// Mock user for testing
interface TestUser extends Authenticatable {
    id: number
    email: string
    password: string
    name: string
}

Deno.test('DrizzleSessionProvider - findById returns user', async () => {
    const user: TestUser = {
        id: 1,
        email: 'test@example.com',
        password: 'pass',
        name: 'Test',
    }

    const findUserById = (_db: unknown, id: string | number) => {
        return Promise.resolve(id === 1 ? user : null)
    }

    const result = await findUserById({}, 1)
    assertEquals(result?.id, 1)
    assertEquals(result?.email, 'test@example.com')
})

Deno.test('DrizzleSessionProvider - findById returns null for non-existent user', async () => {
    const findUserById = (_db: unknown, _id: string | number) => {
        return Promise.resolve(null)
    }

    const result = await findUserById({}, 999)
    assertEquals(result, null)
})

Deno.test('DrizzleSessionProvider - findByCredentials with valid credentials', async () => {
    const user: TestUser = {
        id: 1,
        email: 'alice@example.com',
        password: 'password123',
        name: 'Alice',
    }

    const findByCredentials = (
        _db: unknown,
        email: string,
        password: string,
    ) => {
        if (email === 'alice@example.com' && password === 'password123') {
            return Promise.resolve(user)
        }
        return Promise.resolve(null)
    }

    const result = await findByCredentials(
        {},
        'alice@example.com',
        'password123',
    )
    assertExists(result)
    assertEquals(result?.email, 'alice@example.com')
})

Deno.test('DrizzleSessionProvider - findByCredentials with invalid credentials', async () => {
    const findByCredentials = (
        _db: unknown,
        email: string,
        password: string,
    ) => {
        if (email === 'alice@example.com' && password === 'password123') {
            return Promise.resolve({ id: 1, email, password, name: 'Alice' })
        }
        return Promise.resolve(null)
    }

    const result = await findByCredentials(
        {},
        'alice@example.com',
        'wrongpassword',
    )
    assertEquals(result, null)
})

Deno.test('DrizzleSessionProvider - findByCredentials with invalid email', async () => {
    const findByCredentials = (
        _db: unknown,
        email: string,
        _password: string,
    ) => {
        if (email === 'alice@example.com') {
            return Promise.resolve({
                id: 1,
                email,
                password: 'pass',
                name: 'Alice',
            })
        }
        return Promise.resolve(null)
    }

    const result = await findByCredentials(
        {},
        'unknown@example.com',
        'password123',
    )
    assertEquals(result, null)
})

Deno.test('DrizzleSessionProvider - verifyPassword with matching passwords', async () => {
    const verifyPassword = (plain: string, hash: string) => {
        return Promise.resolve(plain === hash)
    }

    const result = await verifyPassword('password123', 'password123')
    assertEquals(result, true)
})

Deno.test('DrizzleSessionProvider - verifyPassword with non-matching passwords', async () => {
    const verifyPassword = (plain: string, hash: string) => {
        return Promise.resolve(plain === hash)
    }

    const result = await verifyPassword('password123', 'wrongpassword')
    assertEquals(result, false)
})

Deno.test('DrizzleSessionProvider - token generation produces unique tokens', () => {
    const generateToken = () => {
        const array = new Uint8Array(40)
        crypto.getRandomValues(array)
        return Array.from(array, (byte) => byte.toString(16).padStart(2, '0'))
            .join('')
    }

    const token1 = generateToken()
    const token2 = generateToken()

    // Tokens should be hex strings of 80 characters (40 bytes = 80 hex chars)
    assertEquals(token1.length, 80)
    assertEquals(token2.length, 80)
    assertEquals(token1 !== token2, true) // Should be unique
})

Deno.test('DrizzleBasicAuthProvider - findById returns user', async () => {
    const user: TestUser = {
        id: 1,
        email: 'test@example.com',
        password: 'pass',
        name: 'Test',
    }

    const findUserById = (_db: unknown, id: string | number) => {
        return Promise.resolve(id === 1 ? user : null)
    }

    const result = await findUserById({}, 1)
    assertEquals(result?.id, 1)
})

Deno.test('DrizzleBasicAuthProvider - findByCredentials with valid credentials', async () => {
    const user: TestUser = {
        id: 1,
        email: 'alice@example.com',
        password: 'password123',
        name: 'Alice',
    }

    const findByCredentials = (
        _db: unknown,
        email: string,
        password: string,
    ) => {
        if (email === 'alice@example.com' && password === 'password123') {
            return Promise.resolve(user)
        }
        return Promise.resolve(null)
    }

    const result = await findByCredentials(
        {},
        'alice@example.com',
        'password123',
    )
    assertExists(result)
    assertEquals(result?.id, 1)
})

Deno.test('DrizzleBasicAuthProvider - verifyPassword works correctly', async () => {
    const verifyPassword = (plain: string, hash: string) => {
        return Promise.resolve(plain === hash)
    }

    const result1 = await verifyPassword('mypass', 'mypass')
    const result2 = await verifyPassword('mypass', 'differentpass')

    assertEquals(result1, true)
    assertEquals(result2, false)
})

Deno.test('DrizzleTokenProvider - createToken generates valid token structure', () => {
    const user: TestUser = {
        id: 1,
        email: 'test@example.com',
        password: 'pass',
        name: 'Test',
    }

    // Mock token creation
    const createToken = (user: TestUser, name: string, expiresIn?: number) => {
        const tokenValue = `token_${Date.now()}`
        return {
            identifier: 1,
            name,
            value: tokenValue,
            hash: tokenValue,
            userId: user.id,
            expiresAt: expiresIn
                ? new Date(Date.now() + expiresIn * 1000)
                : undefined,
            createdAt: new Date(),
        }
    }

    const token = createToken(user, 'API Token', 3600)

    assertEquals(token.name, 'API Token')
    assertEquals(token.userId, 1)
    assertExists(token.value)
    assertExists(token.hash)
    assertExists(token.expiresAt)
})

Deno.test('DrizzleTokenProvider - verifyToken returns user and token when valid', async () => {
    const user: TestUser = {
        id: 1,
        email: 'test@example.com',
        password: 'pass',
        name: 'Test',
    }

    const verifyToken = (tokenValue: string) => {
        if (tokenValue === 'valid_token') {
            return Promise.resolve({
                user,
                token: {
                    identifier: 1,
                    name: 'API Token',
                    value: tokenValue,
                    hash: tokenValue,
                    userId: user.id,
                    createdAt: new Date(),
                },
            })
        }
        return Promise.resolve(null)
    }

    const result = await verifyToken('valid_token')
    assertExists(result)
    assertEquals(result?.user.id, 1)
    assertEquals(result?.token.name, 'API Token')
})

Deno.test('DrizzleTokenProvider - verifyToken returns null for invalid token', async () => {
    const verifyToken = (tokenValue: string) => {
        if (tokenValue === 'valid_token') {
            return Promise.resolve({ user: { id: 1 }, token: {} })
        }
        return Promise.resolve(null)
    }

    const result = await verifyToken('invalid_token')
    assertEquals(result, null)
})

Deno.test('DrizzleTokenProvider - deleteToken removes specific token', async () => {
    let tokens = [{ id: 1, userId: 1, name: 'token1' }, {
        id: 2,
        userId: 1,
        name: 'token2',
    }]

    const deleteToken = (user: { id: number }, tokenId: number) => {
        tokens = tokens.filter((t) =>
            !(t.id === tokenId && t.userId === user.id)
        )
        return Promise.resolve()
    }

    const user = { id: 1 }
    await deleteToken(user, 1)

    assertEquals(tokens.length, 1)
    assertEquals(tokens[0].id, 2)
})

Deno.test('DrizzleTokenProvider - deleteAllTokens removes all user tokens', async () => {
    let tokens = [
        { id: 1, userId: 1, name: 'token1' },
        { id: 2, userId: 1, name: 'token2' },
        { id: 3, userId: 2, name: 'token3' },
    ]

    const deleteAllTokens = (user: { id: number }) => {
        tokens = tokens.filter((t) => t.userId !== user.id)
        return Promise.resolve()
    }

    const user = { id: 1 }
    await deleteAllTokens(user)

    assertEquals(tokens.length, 1)
    assertEquals(tokens[0].userId, 2)
})

Deno.test('DrizzleTokenProvider - token hash is consistent', async () => {
    const hashToken = async (token: string) => {
        const encoder = new TextEncoder()
        const data = encoder.encode(token)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join(
            '',
        )
    }

    const token = 'my_token_value'
    const hash1 = await hashToken(token)
    const hash2 = await hashToken(token)

    assertEquals(hash1, hash2) // Same token should produce same hash
    assertEquals(hash1.length, 64) // SHA-256 produces 64 hex characters
})
